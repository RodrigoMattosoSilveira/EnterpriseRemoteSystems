#!/usr/bin/env python3
"""Validate scratch-only 1Password materialization without revealing secret values."""
import argparse
import re
from pathlib import Path

EXPECTED = {
    'development': {'JWT_SECRET', 'LEDGER_CORRECTION_KEY', 'LEDGER_SETTLEMENT_KEY'},
    'test': {'JWT_SECRET', 'LEDGER_CORRECTION_KEY', 'LEDGER_SETTLEMENT_KEY'},
    'production': {'JWT_SECRET', 'LEDGER_CORRECTION_KEY', 'LEDGER_SETTLEMENT_KEY'},
}

def validate(text, environment, aws=False):
    if aws:
        lines = text.splitlines()
        if not lines or lines[0] != '[ers-backup]':
            raise ValueError('invalid AWS profile')
        fields = lines[1:]
        expected = {'aws_access_key_id', 'aws_secret_access_key'}
    else:
        fields = [x for x in text.splitlines() if x and not x.lstrip().startswith('#')]
        expected = EXPECTED[environment]
    seen = {}
    for line in fields:
        if '=' not in line:
            raise ValueError('malformed materialized assignment')
        key, value = line.split('=', 1)
        key = key.strip()
        # Do not normalize secret values: whitespace-only or surrounding
        # whitespace in a signing/authorization key is unsafe.
        if not aws and (value != value.strip() or not value.strip()):
            raise ValueError('empty or whitespace-padded materialized value')
        if not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', key) or key in seen or key not in expected:
            raise ValueError('unexpected or repeated materialized key')
        if not value or '{{' in value or '}}' in value or 'op://' in value or '\x00' in value or '\r' in value:
            raise ValueError('empty or unresolved materialized value')
        seen[key] = True
    if set(seen) != expected:
        raise ValueError('missing materialized keys')

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--environment', choices=tuple(EXPECTED), required=True)
    p.add_argument('--fragment', type=Path, required=True)
    p.add_argument('--aws-credentials', type=Path)
    a = p.parse_args()
    try:
        validate(a.fragment.read_text(), a.environment)
        if a.environment == 'production':
            if not a.aws_credentials:
                raise ValueError('Production requires an AWS scratch fragment')
            validate(a.aws_credentials.read_text(), a.environment, aws=True)
        elif a.aws_credentials:
            raise ValueError('AWS credentials are not allowed for non-Production checks')
    except (ValueError, OSError) as exc:
        p.exit(2, f'1Password scratch validation failed: {exc}\n')
    print(f'1Password scratch materialization validated for {a.environment} (values suppressed)')

if __name__ == '__main__':
    main()
