#!/usr/bin/env python3
"""Static authoring regressions for Bite 33.6.8 executable test instructions."""
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/bite-3368/manual-acceptance-tests.md'
text = DOC.read_text(encoding='utf-8')
for n in range(9):
    assert len(re.findall(rf'^## IT-{n:02d} — ', text, re.M)) == 1, f'IT-{n:02d} heading missing/duplicate'
    start = text.index(f'## IT-{n:02d} — ')
    end = text.find('\n## IT-', start + 6)
    segment = text[start:end if end >= 0 else len(text)]
    for term in ('**Entry:', '**Expected:', '**Execution record — IT-'):
        assert term in segment or (term == '**Expected:' and '**Expected stdout:' in segment), (n, term)

# IT-03 must provide the whole lifecycle: no receipt -> gated Test-only creation -> independent verification.
it03_start = text.index('## IT-03 — ')
it03_end = text.index('## IT-04 — ', it03_start)
it03 = text[it03_start:it03_end]
for required in (
    'for TEST_CANDIDATE in "$TEST_BACKUP_DIR"/app-*.db.offhost.json;',
    'TEST_RECEIPT_CANDIDATES=("$TEST_CANDIDATE" "${TEST_RECEIPT_CANDIDATES[@]}")',
    'BLOCKED: Test off-host status probe failed;',
    'Available Test receipt candidates',
    'Type the receipt number corresponding to the approved Test recovery point',
    'Managed Test off-host receipts found:',
    'BLOCKED: no Test .offhost.json receipts found',
    'unset TEST_RECEIPT TEST_RECEIPT_VERIFIED',
    'server-offhost-backup-verify ENV=test',
    'export TEST_RECEIPT TEST_RECEIPT_VERIFIED=1',
    'Step 1B — Establish approved Test-only off-host configuration',
    'server-offhost-backup',
    'ers-offhost-backup status',
    'ers-offhost-backup check-config',
    '--runtime-files',
    'Off-host backup configuration valid for test: enabled',
    'Step 1C — Create a verified on-host Test backup and its off-host replica',
    'make server-backup ENV=test',
    'Enter the authorized Test backup change/approval reference',
    'Test off-host backup status is not enabled',
    'Step 1D — Select and independently verify',
    'no Test .offhost.json receipts found',
    'do not run Step 1C yet',
    'does **not** replace the deployed database',
):
    assert required in it03, f'IT-03 receipt discovery/verification instruction missing: {required}'
assert 'Enter the absolute path to the existing, verified TEST' not in it03, 'IT-03 restored opaque receipt prompt'
assert not re.search(r'^\s*(?:mapfile|readarray)\b|\| sort -z', it03, re.M), 'IT-03 executable commands must not require macOS-unavailable Bash/GNU utilities'
# This should fail if a future rewrite once again assumes a receipt exists without an authorized
# creation path or accidentally tries to restore a local-only backup as remote evidence.
for forbidden in ('make server-test-rehearsal-restore ENV=test', 'make server-restore-apply ENV=test', 'make server-down-volumes ENV=test'):
    assert forbidden not in it03, f'unsafe/destructive target introduced into IT-03: {forbidden}'

blocks = re.findall(r'^```(bash|zsh)\n(.*?)^```', text, re.M | re.S)
assert len(blocks) >= 8, 'expected executable fenced shell blocks'
for i, (language, block) in enumerate(blocks):
    lines = [ln for ln in block.splitlines() if ln.strip()]
    assert lines and lines[0].startswith(": 'Terminal ") and lines[0].endswith("'"), (i, lines[:1])
    assert not any(ln.startswith('# Terminal') for ln in lines), f'unsafe interactive zsh comment in block {i}'
    proc = subprocess.run(['bash', '-n'], input=block, text=True, capture_output=True)
    assert proc.returncode == 0, f'bash syntax block {i}: {proc.stderr}'
    if shutil.which('zsh'):
        proc = subprocess.run(['zsh', '-n'], input=block, text=True, capture_output=True)
        assert proc.returncode == 0, f'zsh syntax block {i}: {proc.stderr}'

for target in ('implementation-and-architecture.md', 'final-acceptance-template.json'):
    assert (DOC.parent / target).is_file(), f'missing {target}'
make = (ROOT / 'Makefile').read_text()
ci = (ROOT / '.github/workflows/ci.yml').read_text()
for target in ('bite3368-core-check', 'bite3368-integrated-check'):
    assert f'{target}:' in make
assert 'make bite3368-core-check' in ci
print(f'PASS: Bite 33.6.8 manual contract, {len(blocks)} safe terminal-labeled command blocks; zsh available={bool(shutil.which("zsh"))}')
