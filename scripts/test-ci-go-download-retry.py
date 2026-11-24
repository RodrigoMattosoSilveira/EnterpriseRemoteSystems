#!/usr/bin/env python3
"""Offline regression checks for migration CI Go setup and fail-closed download retry."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/ci-go-download-with-retry.sh'
WORKFLOW = ROOT / '.github/workflows/ci.yml'


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def check_workflow() -> None:
    workflow = WORKFLOW.read_text(encoding='utf-8')
    segment = workflow.split('  migration-rehearsal:\n', 1)[1].split('  recovery-isolation:\n', 1)[0]
    expected = (
        'uses: actions/setup-go@v6',
        'go-version: "1.26.2"',
        'cache-dependency-path: backend/go.sum',
        'python3 scripts/test-ci-go-download-retry.py',
        'working-directory: backend\n        run: bash ../scripts/ci-go-download-with-retry.sh',
    )
    for item in expected:
        require(item in segment, f'migration job missing {item!r}')
    require(segment.index('uses: actions/setup-go@v6') < segment.index('bash ../scripts/ci-go-download-with-retry.sh'),
            'Go setup must run before downloading dependencies')
    require(segment.index('bash ../scripts/ci-go-download-with-retry.sh') < segment.index('make backup-creation-retention-verification-check'),
            'Go dependency prefetch must complete before backup regression checks')


def check_retry(failures: int, expected_exit: int, expected_attempts: int) -> None:
    with tempfile.TemporaryDirectory(prefix='ers-ci-go-prefetch-') as tmp:
        root = Path(tmp)
        bin_dir = root / 'bin'
        bin_dir.mkdir()
        (root / 'go.mod').write_text('module example.test\n', encoding='utf-8')
        (root / 'go.sum').write_text('example.test/tool v0.0.1 h1:placeholder\n', encoding='utf-8')
        attempts_file = root / 'attempts'
        go = bin_dir / 'go'
        go.write_text('''#!/usr/bin/env bash
set -euo pipefail
[[ "$#" -eq 2 && "$1" == mod && "$2" == download ]] || exit 7
count=0
if [[ -f "$ERS_TEST_ATTEMPTS_FILE" ]]; then read -r count < "$ERS_TEST_ATTEMPTS_FILE"; fi
count=$((count + 1))
printf '%s\\n' "$count" > "$ERS_TEST_ATTEMPTS_FILE"
if (( count <= ERS_TEST_FAILURES )); then
  echo 'simulated stream ID 5 INTERNAL_ERROR' >&2
  exit 1
fi
''', encoding='utf-8')
        go.chmod(0o755)
        sleep = bin_dir / 'sleep'
        sleep.write_text('#!/usr/bin/env bash\nexit 0\n', encoding='utf-8')
        sleep.chmod(0o755)
        env = dict(os.environ, PATH=f'{bin_dir}:{os.environ.get("PATH", "")}',
                   ERS_TEST_FAILURES=str(failures), ERS_TEST_ATTEMPTS_FILE=str(attempts_file))
        result = subprocess.run(['bash', str(SCRIPT)], cwd=root, env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, timeout=10, check=False)
        actual_attempts = int(attempts_file.read_text(encoding='utf-8').strip())
        require(result.returncode == expected_exit,
                f'exit {result.returncode}, expected {expected_exit}:\n{result.stdout}')
        require(actual_attempts == expected_attempts,
                f'{actual_attempts} attempts, expected {expected_attempts}:\n{result.stdout}')
        if expected_exit == 0:
            require('PASS: Go module download completed' in result.stdout,
                    'successful download must produce PASS evidence')
        else:
            require('FAIL: Go module download failed on all 3 attempts' in result.stdout,
                    'exhausted download must fail closed')


def main() -> None:
    check_workflow()
    check_retry(failures=0, expected_exit=0, expected_attempts=1)
    check_retry(failures=2, expected_exit=0, expected_attempts=3)
    check_retry(failures=9, expected_exit=1, expected_attempts=3)
    print('PASS: migration Go setup, download retry, and fail-closed behavior verified offline.')


if __name__ == '__main__':
    main()
