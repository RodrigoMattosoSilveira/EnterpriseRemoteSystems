#!/usr/bin/env python3
"""Offline Bite 35.1 launch-scope integrity check. No network or mutations."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'docs/bite-35/launch-baseline.json'
BASELINE = '9ecd5b075d08ec19c1f368690e95bc621b984fb1'
SCOPE = [f'35.{n}' for n in range(1, 8)]
GATES = ['release_integrity', 'security', 'data_preservation', 'backup_restore',
         'operational_continuity', 'administrator_recovery']
DEFERRED = {'34.4', '34.5', '33.6.6+', '33.6.8E/F'}


def validate(document):
    errors = []
    if document.get('schema_version') != 1 or document.get('parent_bite') != '35':
        errors.append('invalid Bite 35 manifest schema')
    baseline = document.get('baseline', {})
    if baseline.get('source_branch') != 'development' or baseline.get('source_sha') != BASELINE:
        errors.append('baseline source/SHA changed')
    if not re.fullmatch(r'[0-9a-f]{40}', str(baseline.get('source_sha', ''))):
        errors.append('baseline SHA must be a full hexadecimal Git revision')
    if not str(baseline.get('working_branch', '')).startswith('1032-byte---351-'):
        errors.append('35.1 implementation branch not recorded')
    comparison = baseline.get('verified_tree_comparison', {})
    if comparison.get('target') != 'test' or comparison.get('observed_exit_code') != 0:
        errors.append('Development/Test baseline observation not recorded faithfully')
    scope = document.get('launch_scope', [])
    if not isinstance(scope, list) or [entry.get('id') for entry in scope if isinstance(entry, dict)] != SCOPE:
        errors.append('launch scope must contain exactly 35.1 through 35.7 in order')
    else:
        if any(entry.get('status') not in {'planned', 'in_progress', 'accepted'} for entry in scope):
            errors.append('invalid scope status')
        for id_, old in [('35.2', '34.1'), ('35.3', '34.3'), ('35.4', '34.2')]:
            if next(entry for entry in scope if entry['id'] == id_).get('absorbs') != old:
                errors.append(f'prior Bite {old} must be retained in {id_}')
    gates = document.get('launch_gates', [])
    if not isinstance(gates, list) or [entry.get('id') for entry in gates if isinstance(entry, dict)] != GATES:
        errors.append('six essential launch gates missing or reordered')
    deferred = document.get('deferred', [])
    if not isinstance(deferred, list) or {entry.get('id') for entry in deferred if isinstance(entry, dict)} != DEFERRED or len(deferred) != 4:
        errors.append('deferred scope must remain explicit and complete')
    contracts = document.get('non_negotiable_contracts', [])
    if not isinstance(contracts, list) or len(contracts) != 8 or any(not isinstance(c, str) or len(c) < 35 for c in contracts):
        errors.append('required agreed contracts missing')
    assertions = document.get('operational_assertions', {})
    if assertions.get('advanced_s3_isolation') != 'not_accepted' or assertions.get('real_production_backup_restore') != 'not_verified_for_launch' or assertions.get('production_launch_authorized') is not False:
        errors.append('unverified operations must never be marked accepted by baseline check')
    for relative in ['docs/bite-35/launch-plan.md', 'docs/bite-35/manual-acceptance-tests.md',
                     'docs/database-recovery-runbook.md', 'scripts/init-server-env.sh']:
        if not (ROOT / relative).is_file():
            errors.append(f'missing required repository reference: {relative}')
    return errors


def git_check(require_clean):
    def git(*args):
        return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True)
    errors = []
    head = git('rev-parse', 'HEAD')
    if head.returncode:
        return ['Git checkout required for --git-check']
    ancestor = git('merge-base', '--is-ancestor', BASELINE, 'HEAD')
    if ancestor.returncode:
        errors.append('baseline SHA is not an ancestor of HEAD (or object unavailable); fetch/verify history')
    if require_clean:
        status = git('status', '--porcelain', '--untracked-files=normal')
        if status.returncode or status.stdout.strip():
            errors.append('working tree must be clean for final baseline evidence')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=MANIFEST)
    parser.add_argument('--git-check', action='store_true')
    parser.add_argument('--require-clean', action='store_true')
    args = parser.parse_args()
    if args.require_clean and not args.git_check:
        parser.error('--require-clean requires --git-check')
    try:
        document = json.loads(args.manifest.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        print(f'FAIL: cannot read launch baseline: {error}', file=sys.stderr)
        return 1
    errors = validate(document)
    if args.git_check:
        errors.extend(git_check(args.require_clean))
    if errors:
        for error in errors:
            print(f'FAIL: {error}', file=sys.stderr)
        return 1
    print(f'PASS: Bite 35.1 scope frozen; source {BASELINE}; 7 sub-bites, 6 gates, 4 deferred items')
    print('NOT VERIFIED: deployed Production, backup restore, emergency recovery, S3 isolation, or launch authorization')
    return 0


if __name__ == '__main__':
    sys.exit(main())
