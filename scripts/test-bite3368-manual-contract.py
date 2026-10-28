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
