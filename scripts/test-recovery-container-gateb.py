#!/usr/bin/env python3
"""Offline Gate B contract and Docker cleanup test; no daemon or network required."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'scripts/ers-recovery-container-smoke.sh'
PIN = 'python:3.12-slim-bookworm@sha256:' + 'a'*64


def run(env):
    return subprocess.run(['bash', str(SCRIPT)], cwd=ROOT, env=env,
                          text=True, capture_output=True, timeout=30)


def require(ok, why):
    if not ok:
        raise AssertionError(why)


def main():
    base = os.environ.copy()
    for value in ('', 'python:3.12-slim-bookworm@sha256:REPLACE_WITH_64_LOWERCASE_HEX_DIGEST',
                  'python:3.12-slim-bookworm@sha256:'+'f'*63, 'ubuntu@sha256:'+'a'*64):
        env = dict(base, ERS_RECOVERY_BASE_IMAGE=value)
        result = run(env)
        require(result.returncode != 0 and 'BASE_IMAGE_PIN_INVALID FAIL' in result.stderr,
                'invalid image pin was accepted')
    with tempfile.TemporaryDirectory() as temp:
        shim = Path(temp)/'docker'
        log = Path(temp)/'docker.log'
        shim.write_text('''#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case "${1:-}" in
 info) exit 0;;
 buildx) exit 0;;
 build) [[ "${MOCK_BUILD_FAIL:-0}" != 1 ]] || exit 17;;
 run) [[ "${MOCK_RUN_FAIL:-0}" != 1 ]] || exit 19;;
 container) exit 1;;
 rm|image) exit 0;;
 *) exit 3;;
esac
''')
        shim.chmod(0o755)
        env = dict(base, PATH=temp+os.pathsep+base['PATH'], DOCKER_LOG=str(log),
                   ERS_RECOVERY_BASE_IMAGE=PIN, ERS_RECOVERY_PLATFORM='linux/amd64')
        r = run(env)
        require(r.returncode == 0 and 'CONTAINER_SMOKE PASS' in r.stdout and
                'CONTAINER_CLEANUP PASS' in r.stdout, f'positive smoke test: {r.stdout} {r.stderr}')
        for flag in ('MOCK_BUILD_FAIL', 'MOCK_RUN_FAIL'):
            r = run(dict(env, **{flag:'1'}))
            require(r.returncode != 0 and 'CONTAINER_SMOKE PASS' not in r.stdout,
                    f'{flag} did not fail closed')
        r = run(dict(env, ERS_RECOVERY_PLATFORM='linux/ppc64le'))
        require(r.returncode != 0 and 'PLATFORM_INVALID FAIL' in r.stderr,
                'unsupported architecture allowed')
        lines = log.read_text().splitlines()
        require(any(x.startswith('rm -f ers-gateb-smoke-') for x in lines),
                'test-created container was not cleaned up')
        require(any(x.startswith('image rm -f ers-gateb-smoke:') for x in lines),
                'test image was not cleaned up')
        require(not any('--privileged' in x or '/var/run/docker.sock' in x for x in lines),
                'container gained privileged access or Docker socket')
    dockerfile = (ROOT/'ops/recovery/Dockerfile').read_text()
    require('FROM ${ERS_RECOVERY_BASE_IMAGE}' in dockerfile and
            'ers-emergency-admin-recovery.py' in dockerfile,
            'container image does not pin input or package recovery tool')
    print('ERS_GATEB CONTRACT_REGRESSION PASS')


if __name__ == '__main__':
    main()
