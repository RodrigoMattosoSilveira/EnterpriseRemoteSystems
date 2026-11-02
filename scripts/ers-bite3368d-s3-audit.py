#!/usr/bin/env python3
"""Bite 33.6.8D: offline, non-secret, read-only S3 architecture audit.

Does not invoke AWS CLI, Hetzner, 1Password or inspect secret credential files.
Evidence must be independently collected and approved, never inferred from names.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENVIRONMENTS = ('development', 'test', 'production')


def safe_ref(value):
    return isinstance(value, str) and bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/ -]{0,159}', value)) and not re.search(r'(?i)(secret|access.key|password|token|AKIA[0-9A-Z]{12,})', value)


def audit(evidence):
    if not isinstance(evidence, dict) or set(evidence) != {'project', 'bucket', 'region', 'versioning', 'object_lock', 'default_retention', 'bucket_policy', 'environments', 'review'}:
        raise ValueError('evidence must contain only the documented non-secret audit fields')
    for field in ('project', 'bucket', 'region'):
        if not safe_ref(evidence[field]):
            raise ValueError(f'invalid non-secret {field}')
    if set(evidence['environments']) != set(ENVIRONMENTS):
        raise ValueError('exactly development, test and production required')
    findings = []
    for label in ('versioning', 'object_lock', 'default_retention', 'bucket_policy'):
        entry = evidence[label]
        if not isinstance(entry, dict) or set(entry) != {'status', 'evidence_ref'} or entry['status'] not in ('verified', 'absent', 'unknown') or (entry['evidence_ref'] is not None and not safe_ref(entry['evidence_ref'])):
            raise ValueError(f'invalid {label} evidence')
        if entry['status'] == 'verified' and not entry['evidence_ref']:
            raise ValueError(f'{label} verified requires independent reference')
        if entry['status'] != 'verified':
            findings.append(f'{label}: {entry["status"]}')
    for env in ENVIRONMENTS:
        item = evidence['environments'][env]
        expected = {'prefix', 'backup_config', 'credential_custody', 'same_env_access', 'cross_env_denied', 'evidence_ref'}
        if not isinstance(item, dict) or set(item) != expected:
            raise ValueError(f'invalid {env} record')
        if not isinstance(item['prefix'], str) or not re.fullmatch(r'[a-z0-9][a-z0-9_/-]*', item['prefix']) or '..' in item['prefix'] or '//' in item['prefix']:
            raise ValueError(f'invalid {env} prefix')
        for flag in ('backup_config', 'credential_custody', 'same_env_access', 'cross_env_denied'):
            if item[flag] not in ('verified', 'unknown', 'not_configured', 'failed'):
                raise ValueError(f'invalid {env} {flag}')
            if item[flag] != 'verified':
                findings.append(f'{env}.{flag}: {item[flag]}')
        if item['evidence_ref'] is not None and not safe_ref(item['evidence_ref']):
            raise ValueError(f'invalid {env} reference')
        if all(item[k] == 'verified' for k in ('backup_config', 'credential_custody', 'same_env_access', 'cross_env_denied')) and not item['evidence_ref']:
            raise ValueError(f'{env} verified controls require independent reference')
    prefixes = [evidence['environments'][e]['prefix'].rstrip('/') + '/' for e in ENVIRONMENTS]
    if any(a.startswith(b) for i,a in enumerate(prefixes) for j,b in enumerate(prefixes) if i != j):
        findings.append('environment prefixes overlap')
    review = evidence['review']
    if not isinstance(review, dict) or set(review) != {'operator_ref', 'reviewer_ref', 'approval_ref'}:
        raise ValueError('review record missing')
    if any(v is not None and not safe_ref(v) for v in review.values()):
        raise ValueError('invalid review reference')
    if not all(review.values()):
        findings.append('independent review/approval incomplete')
    return {'audit_status': 'EVIDENCE_COMPLETE_REVIEW_REQUIRED' if not findings else 'BLOCKED', 'findings': findings, 'note': 'Offline evidence consistency only; never proof of remote permissions or authorization.'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--evidence', type=Path, help='non-secret inventory JSON, collected separately')
    args = p.parse_args()
    if args.evidence:
        try:
            # Reject symlinks and unexpected large input; avoid printing raw payloads.
            if args.evidence.is_symlink() or args.evidence.stat().st_size > 32768:
                raise ValueError('unsafe evidence input')
            result = audit(json.loads(args.evidence.read_text()))
        except (ValueError, OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
            p.exit(2, f'BLOCKED: invalid audit evidence ({type(exc).__name__})\n')
    else:
        result = {'audit_status': 'BLOCKED', 'findings': ['No independently collected evidence supplied'], 'note': 'No remote or credential access performed.'}
    print(json.dumps(result, indent=2))
    if result['audit_status'] == 'BLOCKED':
        raise SystemExit(2)


if __name__ == '__main__':
    main()
