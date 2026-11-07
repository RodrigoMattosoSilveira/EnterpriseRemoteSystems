#!/usr/bin/env python3
"""Byte 35.4C: real migration/seed regression + fail-closed negative tests."""
from __future__ import annotations
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/ers-byte354c-training-db.py'
SHA = re.compile(r'logical fixture(?: SHA-256)?: ([a-f0-9]{64})')


def execute(path: Path, *extra: str, env: str = 'development',
            expected: int = 0, other_env: str = '') -> str:
    variables = dict(os.environ)
    variables['APP_ENV'] = env
    variables.pop('ENV', None)
    if other_env:
        variables['ENV'] = other_env
    result = subprocess.run([sys.executable, '-B', str(SCRIPT), '--output',
                             str(path), *extra], cwd=ROOT, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            env=variables, check=False)
    if (result.returncode == 0) != (expected == 0):
        raise AssertionError(f'Unexpected exit {result.returncode}: {result.stdout}')
    return result.stdout


def main() -> int:
    with tempfile.TemporaryDirectory(prefix='ers-byte354c-check-') as directory:
        tmp = Path(directory)
        original = tmp/'app.db'
        original.write_bytes(b'UNCHANGED WORKING LOCAL DATABASE SENTINEL')
        one = tmp/'byte354c-training-one.db'
        two = tmp/'byte354c-training-two.db'
        hash_one = SHA.search(execute(one))
        hash_two = SHA.search(execute(two))
        assert hash_one and hash_two and hash_one[1] == hash_two[1], 'Non-deterministic fixture'
        assert hash_one[1] == SHA.search(execute(one, '--verify-only'))[1]
        assert original.read_bytes() == b'UNCHANGED WORKING LOCAL DATABASE SENTINEL'

        # The fixture has explicit test-only segregation and working IDs.
        with sqlite3.connect(one) as conn:
            assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert conn.execute('PRAGMA foreign_key_check').fetchall() == []
            assert conn.execute("SELECT COUNT(*) FROM auth_user_accounts WHERE login LIKE 'training354c.%@example.test'").fetchone()[0] == 9
            assert conn.execute("SELECT COUNT(*) FROM ledger_receipts WHERE tenant_id='training-354c-entidade-a'").fetchone()[0] >= 2
            assert conn.execute("SELECT COUNT(*) FROM ledger_entries WHERE tenant_id='training-354c-entidade-b'").fetchone()[0] == 0
            # One global Person, multiple Memberships and Tenant Actors.
            assert conn.execute("SELECT COUNT(*) FROM person_tenant_memberships WHERE person_id='train354c-a-person-camila'").fetchone()[0] == 2
            assert conn.execute("SELECT COUNT(*) FROM auth_account_people WHERE person_id='train354c-a-person-camila'").fetchone()[0] == 1
            assert conn.execute("SELECT COUNT(*) FROM auth_account_actors WHERE account_id='train354c-a-account-camila'").fetchone()[0] == 2

        # Rebuild, unsafe paths, deployed envs, and symlinks must fail closed.
        assert 'already exists' in execute(one, expected=2)
        assert 'filename must' in execute(original, expected=2)
        assert 'Refusing' in execute(one, '--verify-only', env='production', expected=2)
        assert 'Refusing' in execute(one, '--verify-only', env='', expected=2)
        assert 'ENV=production' in execute(one, '--verify-only', other_env='production', expected=2)
        symlink = tmp/'byte354c-training-symlink.db'
        symlink.symlink_to(original)
        assert 'symlink' in execute(symlink, expected=2)
        assert original.read_bytes() == b'UNCHANGED WORKING LOCAL DATABASE SENTINEL'

        # Read-only verification recognizes a modified/used training fixture.
        with sqlite3.connect(two) as conn:
            conn.execute("UPDATE tenants SET description='modified' WHERE id='training-354c-entidade-a'")
        assert 'fixture modified' in execute(two, '--verify-only', expected=2)
        assert not list(tmp.glob('.byte354c-building-*')), 'temporary build left behind'
    print('PASS: Byte 35.4C two-build determinism, database constraints, cross-tenant identity,')
    print('      safety refusals, tamper detection, no working database changes, and cleanup')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
