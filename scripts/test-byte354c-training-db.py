#!/usr/bin/env python3
"""Byte 35.4C: additive fixture checks against migrated, existing temp DBs.

This regression never opens or writes any working LOCAL/DEV/TST database.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/ers-byte354c-training-db.py'
DIGEST = re.compile(r'(?:logical fixture SHA-256|logical SHA-256): ([a-f0-9]{64})')
# Test-only synthetic bcrypt-encoded placeholders. Never used for deployed logins.
ADMIN_HASH = '$2a$12$' + 'A' * 53
PERSON_HASH = '$2b$12$' + 'B' * 53


def migrated(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        files = sorted((ROOT/'backend/migrations').glob('*.up.sql'))
        assert len(files) >= 70
        for migration in files:
            conn.executescript(migration.read_text(encoding='utf-8'))
        conn.execute('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at DATETIME)')
        conn.executemany('INSERT OR IGNORE INTO schema_migrations(filename, applied_at) VALUES (?,?)',
                         [(file.name, '2026-11-07T12:00:00+00:00') for file in files])
        conn.execute('PRAGMA foreign_keys=ON')
        assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not conn.execute('PRAGMA foreign_key_check').fetchall()


def execute(path: Path, *, target='development', app_env='development',
            verify=False, confirm=None, extra_env=None, good=True) -> str:
    env = dict(os.environ)
    for name in ('ENV', 'DEPLOY_ENV', 'ERS_ENV', 'ENVIRONMENT', 'NODE_ENV'):
        env.pop(name, None)
    env.update({'APP_ENV': app_env, 'BYTE354C_ADMIN_BCRYPT_HASH': ADMIN_HASH,
                'BYTE354C_PERSON_BCRYPT_HASH': PERSON_HASH})
    env.update(extra_env or {})
    command = [sys.executable, '-B', str(SCRIPT), '--database', str(path),
               '--target', target, '--confirm-target', confirm or target]
    if verify:
        command.append('--verify-only')
    result = subprocess.run(command, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, check=False)
    if (result.returncode == 0) != good:
        raise AssertionError(f'exit={result.returncode}; output={result.stdout}')
    return result.stdout


def main() -> int:
    with tempfile.TemporaryDirectory(prefix='ers-354c-additive-check-') as directory:
        tmp = Path(directory)
        # Two existing migrated databases, with a foreign existing Tenant and
        # an unrelated record. Their bytes before/after are inspected by SQL.
        dbs = []
        for name in ('alpha', 'beta'):
            parent = tmp/name
            parent.mkdir()
            db = parent/'app.db'
            migrated(db)
            with sqlite3.connect(db) as conn:
                conn.execute("INSERT INTO tenants (id,code,name,active,created_at,updated_at) VALUES ('existing-tenant','EXISTING','Existing business',1,'2026-01-01','2026-01-01')")
            dbs.append(db)
        a, b = dbs
        with sqlite3.connect(a) as conn:
            before = conn.execute("SELECT * FROM tenants WHERE id='existing-tenant'").fetchone()
        # Change unrelated existing default-Entidade data in TST: the fixture
        # must not clone it, and the training checksum must remain identical.
        with sqlite3.connect(b) as conn:
            conn.execute("INSERT INTO reference_data (id,tenant_id,type,code,label,active,sort_order,created_at,updated_at) VALUES ('independent-default-ref','default','task','UNRELATED_TRAINING_CHECK','Unrelated existing task',1,999,'2026-01-01','2026-01-01')")
        first = DIGEST.search(execute(a))
        second = DIGEST.search(execute(b, target='test', app_env='test', extra_env={
            'BYTE354C_ADMIN_BCRYPT_HASH': '$2b$12$' + 'C' * 53,
            'BYTE354C_PERSON_BCRYPT_HASH': '$2b$12$' + 'D' * 53}))
        assert first and second and first.group(1) == second.group(1), 'Fixture differs between DEV and TST'
        assert DIGEST.search(execute(a, verify=True)).group(1) == first.group(1)
        assert 'no writes' in execute(a), 'Idempotent re-run must be no-op'
        with sqlite3.connect(a) as conn:
            assert conn.execute("SELECT * FROM tenants WHERE id='existing-tenant'").fetchone() == before
            assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert not conn.execute('PRAGMA foreign_key_check').fetchall()
            assert conn.execute("SELECT COUNT(*) FROM global_people WHERE id LIKE 'train354c-%'").fetchone()[0] == 9
            assert conn.execute("SELECT COUNT(*) FROM auth_user_accounts WHERE id LIKE 'train354c-%'").fetchone()[0] == 8
            assert conn.execute("SELECT COUNT(*) FROM person_tenant_memberships WHERE person_id='train354c-a-person-camila'").fetchone()[0] == 2
            assert conn.execute("SELECT COUNT(*) FROM ledger_entries WHERE tenant_id='training-354c-entidade-b'").fetchone()[0] == 0
        # No existing database is ever created, reset or overwritten.
        missing = tmp/'missing'/'app.db'
        assert 'existing regular' in execute(missing, good=False)
        assert not missing.exists()
        symlink = tmp/'link-app.db'
        symlink.symlink_to(a)
        assert 'non-symlink' in execute(symlink, good=False)
        assert 'LOCAL target' in execute(a, target='local', good=False)
        assert 'Refusing' in execute(a, app_env='production', good=False)
        assert 'Production' in execute(a, extra_env={'DEPLOY_ENV':'production'}, good=False)
        assert 'target confirmation mismatch' in execute(a, confirm='test', good=False)
        assert 'APP_ENV=test' in execute(a, target='test', good=False)
        assert 'no writes' in execute(b, target='test', app_env='test', extra_env={
            'BYTE354C_ADMIN_BCRYPT_HASH': '', 'BYTE354C_PERSON_BCRYPT_HASH': ''})
        # Verify before any fixture exists, and rollback with deliberate ID collision.
        c = tmp/'collision'/'app.db'
        c.parent.mkdir()
        migrated(c)
        assert 'no Byte 35.4C training data' in execute(c, verify=True, good=False)
        assert 'supply both valid bcrypt hashes' in execute(c, extra_env={
            'BYTE354C_ADMIN_BCRYPT_HASH': ''}, good=False)
        with sqlite3.connect(c) as conn:
            conn.execute("INSERT INTO authz_actors (id,actor_key,display_name,active,created_at,updated_at) VALUES ('train354c-a-actor-camila','collision','reserved',1,'2026-01-01','2026-01-01')")
        assert execute(c, good=False)
        with sqlite3.connect(c) as conn:
            assert conn.execute("SELECT COUNT(*) FROM tenants WHERE id IN ('training-354c-entidade-a','training-354c-entidade-b')").fetchone()[0] == 0, 'Partial transaction persisted'
            assert conn.execute("SELECT actor_key FROM authz_actors WHERE id='train354c-a-actor-camila'").fetchone()[0] == 'collision'
        # Used training data are protected, not overwritten by a second run.
        with sqlite3.connect(a) as conn:
            conn.execute("UPDATE tenants SET description='TRAINING EXERCISE' WHERE id='training-354c-entidade-a'")
        assert 'differ from the original' in execute(a, good=False)
        assert 'differ from the original' in execute(a, verify=True, good=False)
        with sqlite3.connect(a) as conn:
            assert conn.execute("SELECT description FROM tenants WHERE id='training-354c-entidade-a'").fetchone()[0] == 'TRAINING EXERCISE'
        assert not list(tmp.rglob('.byte354c-building-*'))
    print('PASS: Byte 35.4C additive deterministic fixture, idempotency, non-training preservation,')
    print('      preexisting-db requirement, production refusal, drift refusal, and transaction rollback')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
