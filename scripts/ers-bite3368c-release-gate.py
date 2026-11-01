#!/usr/bin/env python3
"""Read-only Bite 33.6.8C release identity and acceptance consistency gate.

No deployments, backups, Docker operations, account changes or remote calls.
A successful gate is NOT human approval or independently verified off-host evidence.
"""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
HEX40 = re.compile(r'^[0-9a-f]{40}$')


class GateBlocked(ValueError):
    pass


def git(*args: str) -> str:
    try:
        return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True,
                                       stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, OSError) as exc:
        raise GateBlocked('cannot read actual committed Git identity') from exc


def gate(environment: str, revision: str, tree: str, evidence_file: Path | None) -> None:
    if environment not in ('test', 'production'):
        raise GateBlocked('environment must be test or production (LOCAL is not deployed acceptance)')
    if not HEX40.fullmatch(revision) or not HEX40.fullmatch(tree):
        raise GateBlocked('expected revision and tree must each be full 40-character lowercase Git SHAs')
    if git('rev-parse', 'HEAD') != revision or git('rev-parse', 'HEAD^{tree}') != tree:
        raise GateBlocked('checkout does not match the exact expected revision AND tree')
    if git('status', '--porcelain', '--untracked-files=normal'):
        raise GateBlocked('working tree is not clean; commit and reverify before collecting release evidence')
    if evidence_file is None:
        print(f'PASS: 33.6.8C exact {environment} Git identity and clean worktree ({revision})')
        print('NOT ACCEPTED: preflight only; deployed evidence and independent approval still required')
        return
    if not evidence_file.is_file():
        raise GateBlocked('specified acceptance evidence file does not exist')
    source = ROOT / 'scripts' / 'verify-bite3368-final-acceptance.py'
    spec = importlib.util.spec_from_file_location('ers3368_final_gate', source)
    if spec is None or spec.loader is None:
        raise GateBlocked('canonical final evidence verifier is unavailable')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        record = module.load(evidence_file)
        if record.get('release', {}).get('tree_sha') != tree:
            raise GateBlocked('acceptance evidence tree SHA differs from actual checkout')
        module.verify(evidence_file, revision, environment)
    except (module.EvidenceError, OSError, AttributeError, TypeError) as exc:
        raise GateBlocked(f'canonical final evidence consistency failed: {exc}') from exc
    print(f'PASS: 33.6.8C {environment} release identity AND evidence consistency ({revision}, {tree})')
    print('REVIEW REQUIRED: originals, off-host S3 versions, 1Password, approvals and GO/NO-GO must be independently authenticated')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--environment', required=True, choices=('test', 'production'))
    parser.add_argument('--expected-revision', required=True)
    parser.add_argument('--expected-tree', required=True)
    parser.add_argument('--evidence-file', type=Path,
                        help='omit for identity-only preflight; supply actual evidence for consistency check')
    args = parser.parse_args()
    try:
        gate(args.environment, args.expected_revision, args.expected_tree, args.evidence_file)
    except GateBlocked as exc:
        print(f'BLOCKED: Bite 33.6.8C release gate: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
