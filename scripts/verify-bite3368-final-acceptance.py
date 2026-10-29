#!/usr/bin/env python3
"""Fail-closed Bite 33.6.8 FINAL EVIDENCE consistency check (non-secret only).

This checks supplied attestations and a hashed server rehearsal report. It does
not independently confirm approval, human identity, vault permissions, CI,
or off-host object existence. Those require authorized human review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

HEX40 = re.compile(r'^[0-9a-f]{40}$')
HEX64 = re.compile(r'^[0-9a-f]{64}$')


class EvidenceError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise EvidenceError(message)


def reference(value: object, field: str) -> str:
    require(isinstance(value, str) and 3 <= len(value.strip()) <= 400
            and value.strip() == value and '\n' not in value and '\r' not in value
            and value.lower() not in ('n/a', 'none', 'todo', 'tbd', 'pending', 'pass', 'passed')
            and 'REPLACE_' not in value.upper() and '<' not in value and '>' not in value,
            f'{field} needs a specific non-secret evidence reference')
    return value


def object_at(item: object, name: str) -> dict:
    require(isinstance(item, dict), f'{name} must be an object')
    return item


def load(path: Path) -> dict:
    require(path.is_file(), 'evidence file is missing')
    require(path.stat().st_size <= 1_000_000, 'evidence file is too large')
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise EvidenceError('evidence is not valid JSON') from exc
    return object_at(data, 'evidence')


def verify(path: Path, expected_revision: str, environment: str) -> None:
    require(bool(HEX40.fullmatch(expected_revision)), 'expected revision must be a full 40-digit Git SHA')
    root = load(path)
    require(root.get('format_version') == 1, 'unsupported evidence format')
    require(root.get('environment') == environment, 'environment mismatch')
    release = object_at(root.get('release'), 'release')
    require(release.get('revision') == expected_revision, 'release revision mismatch')
    require(isinstance(release.get('tree_sha'), str) and HEX40.fullmatch(release['tree_sha']) is not None,
            'release tree SHA missing')
    require(release.get('ci_status') == 'passed', 'CI has not been accepted')
    require(release.get('integrated_regression') == 'passed', 'integrated regression has not passed')
    reference(release.get('ci_url'), 'release.ci_url')
    require(release['ci_url'].startswith('https://'), 'CI URL must be HTTPS')
    reference(release.get('integrated_regression_ref'), 'release.integrated_regression_ref')

    people = root.get('human_administrators')
    require(isinstance(people, list) and len(people) == 2, 'exactly two human administrators required')
    require([row.get('label') if isinstance(row, dict) else None for row in people] == ['A', 'B'],
            'two administrator records must be labeled A and B')
    for row in people:
        for field in ('actor_key', 'account_id', 'login', 'first_login_ref', 'mutual_recovery_ref', 'audit_ref'):
            reference(row.get(field), f'administrator {row["label"]}.{field}')
    for field in ('actor_key', 'account_id', 'login'):
        require(people[0][field].lower() != people[1][field].lower(), f'human A and B share {field}')

    custody = object_at(root.get('onepassword'), 'onepassword')
    for field in ('human_a_review_ref', 'human_b_review_ref', 'service_account_isolation_ref',
                  'legacy_custody_resolution_ref'):
        reference(custody.get(field), f'onepassword.{field}')

    operations = object_at(root.get('operations'), 'operations')
    for field in ('change_approval_ref', 'approver_id', 'backup_verification_ref',
                  'off_host_receipt_ref', 'migration_gate_ref', 'deployed_smoke_ref', 'risk_acceptance_ref'):
        reference(operations.get(field), f'operations.{field}')
    require(operations.get('simultaneous_unavailability_risk_accepted') is True,
            'explicit simultaneous-administrator-unavailability risk acceptance required')

    evidence = object_at(root.get('recovery'), 'recovery')
    report_name = reference(evidence.get('report_file'), 'recovery.report_file')
    digest = evidence.get('sha256')
    require(isinstance(digest, str) and HEX64.fullmatch(digest) is not None,
            'recovery report SHA-256 must be 64 hex characters')
    report_path = Path(report_name)
    if not report_path.is_absolute():
        report_path = path.parent / report_path
    require(report_path.resolve() != path.resolve(), 'recovery report must be a separate file')
    require(report_path.is_file() and report_path.stat().st_size <= 1_000_000,
            'referenced recovery report missing or too large')
    require(hashlib.sha256(report_path.read_bytes()).hexdigest() == digest,
            'recovery report SHA-256 mismatch')
    report = load(report_path)
    require(report.get('status') == 'passed', 'server recovery rehearsal not passed')
    require(report.get('environment') == environment, 'rehearsal environment mismatch')
    repo = object_at(report.get('repository'), 'rehearsal.repository')
    require(repo.get('revision') == expected_revision, 'rehearsal revision mismatch')
    require(repo.get('tree_sha') == release.get('tree_sha'), 'rehearsal source tree mismatch')
    source = object_at(report.get('source'), 'rehearsal.source')
    require(source.get('kind') in ('offhost-receipt', 'offhost-backup-name'),
            'release rehearsal must use an off-host source, not a local backup')
    reference(source.get('backup_sha256'), 'rehearsal backup SHA-256')
    require(bool(HEX64.fullmatch(source['backup_sha256'])), 'source SHA-256 invalid')
    remote = object_at(source.get('remote'), 'rehearsal.source.remote')
    reference(remote.get('backup_key'), 'off-host backup object key')
    reference(remote.get('manifest_key'), 'off-host manifest object key')
    recovery = object_at(report.get('recovery'), 'rehearsal.recovery')
    require(recovery.get('isolated_backend_health') == 'passed', 'isolated backend boot not verified')
    require(recovery.get('post_boot_integrity_check') == 'ok', 'restored database integrity not verified')
    require(recovery.get('post_boot_foreign_key_check') == 'clean', 'restored foreign key integrity not verified')
    obj = object_at(report.get('objectives'), 'rehearsal.objectives')
    for kind, cap in (('rpo', 86400), ('rto', 14400)):
        value = obj.get(f'{kind}_seconds')
        limit = obj.get(f'max_{kind}_seconds')
        require(type(value) is int and 0 <= value <= cap, f'{kind.upper()} exceeds accepted objective')
        require(type(limit) is int and 0 < limit <= cap, f'{kind.upper()} limit has been weakened')
        require(value <= limit and obj.get(f'{kind}_met') is True, f'{kind.upper()} not met')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', required=True, type=Path)
    parser.add_argument('--expected-revision', required=True)
    parser.add_argument('--environment', required=True, choices=('test', 'production'))
    args = parser.parse_args()
    try:
        verify(args.file, args.expected_revision, args.environment)
    except (EvidenceError, OSError) as exc:
        print(f'BLOCKED: Bite 33.6.8 evidence acceptance: {exc}', file=sys.stderr)
        return 1
    print(f'PASS: Bite 33.6.8 evidence consistency ({args.environment}, {args.expected_revision})')
    print('REVIEW REQUIRED: supplied approvals, human/1Password testimony, CI and off-host objects are not independently authenticated by this verifier')
    return 0


if __name__ == '__main__':
    sys.exit(main())
