#!/usr/bin/env python3
"""Bite 33.6.8: disposable SQLite backup/restore/migration regression.

This is NOT a server, S3, Docker, RPO or RTO rehearsal. Those must be
independently demonstrated with the existing deployed recovery tooling.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / 'backend' / 'migrations'


def logical_fingerprint(db: Path) -> str:
    """Schema/data fingerprint, independent of valid SQLite file page layout."""
    with closing(sqlite3.connect(f'file:{db}?mode=ro', uri=True)) as conn:
        schema = conn.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name,tbl_name").fetchall()
        migrations = conn.execute("SELECT filename FROM schema_migrations ORDER BY filename").fetchall()
        tables = [name for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        counts = [(name, conn.execute('SELECT count(*) FROM "' + name.replace('"','""') + '"').fetchone()[0]) for name in tables]
    payload = json.dumps([schema, migrations, counts], sort_keys=True).encode()
    return hashlib.sha256(payload).hexdigest()


def migrate(db: Path) -> int:
    migrations = sorted(MIGRATIONS.glob('*.up.sql'))
    if not migrations:
        raise RuntimeError('migration files missing')
    with closing(sqlite3.connect(db)) as conn:
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
        for script in migrations:
            if conn.execute('SELECT 1 FROM schema_migrations WHERE filename=?', (script.name,)).fetchone():
                continue
            conn.executescript(script.read_text(encoding='utf-8'))
            # Migration 000069 writes its own marker inside its transaction.
            conn.execute('INSERT OR IGNORE INTO schema_migrations(filename) VALUES (?)', (script.name,))
            conn.commit()
        count = conn.execute('SELECT count(*) FROM schema_migrations').fetchone()[0]
    if count != len(migrations):
        raise RuntimeError('migration count mismatch')
    return count


def assert_database(db: Path, expected: int) -> None:
    # Do not create a missing DB: a missing source is a failure, not a reason
    # to open a new empty database accidentally.
    if not db.is_file():
        raise RuntimeError('missing database')
    with closing(sqlite3.connect(f'file:{db}?mode=ro', uri=True)) as conn:
        if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite integrity failure')
        if conn.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('SQLite foreign-key failure')
        if conn.execute('SELECT count(*) FROM schema_migrations').fetchone()[0] != expected:
            raise RuntimeError('schema migration count changed')
        if conn.execute("SELECT count(*) FROM authz_roles WHERE code='APPLICATION_ADMIN' AND active=1 AND scope_type='APPLICATION'").fetchone()[0] != 1:
            raise RuntimeError('administrator role contract invalid')
        if conn.execute("SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name IN ('trg_authz_audit_logs_no_update','trg_authz_audit_logs_no_delete')").fetchone()[0] != 2:
            raise RuntimeError('immutable audit contract invalid')


def rehearse() -> dict:
    with tempfile.TemporaryDirectory(prefix='ers3368-isolated-') as tmp:
        workspace = Path(tmp)
        os.chmod(workspace, 0o700)
        source = workspace / 'source.db'
        backup = workspace / 'backup.db'
        restored = workspace / 'restored.db'
        count = migrate(source)
        assert_database(source, count)
        # Online SQLite consistent backup; no production data or network.
        with closing(sqlite3.connect(source)) as src, closing(sqlite3.connect(backup)) as dst:
            src.backup(dst)
        if logical_fingerprint(source) != logical_fingerprint(backup):
            raise RuntimeError('backup mismatch')
        assert_database(backup, count)
        # Fail closed on missing backup, without creating an empty restore.
        try:
            assert_database(workspace / 'does-not-exist.db', count)
        except RuntimeError as exc:
            if str(exc) != 'missing database':
                raise
        else:
            raise RuntimeError('missing backup was accepted')
        # Fail closed on corrupt content; only a disposable temporary copy.
        tampered = workspace / 'corrupted.db'
        tampered.write_bytes(b'not a SQLite database')
        try:
            assert_database(tampered, count)
        except (sqlite3.DatabaseError, RuntimeError):
            pass
        else:
            raise RuntimeError('corrupt backup was accepted')
        with closing(sqlite3.connect(backup)) as src, closing(sqlite3.connect(restored)) as dst:
            src.backup(dst)
        assert_database(restored, count)
        if logical_fingerprint(backup) != logical_fingerprint(restored):
            raise RuntimeError('restore mismatch')
        if migrate(restored) != count:
            raise RuntimeError('migration reapplication changed schema history')
        assert_database(restored, count)
        return {'format_version': 1, 'status': 'passed', 'kind': 'sqlite-isolated-regression',
                'migration_count': count, 'sqlite_integrity': 'ok', 'foreign_keys': 'clean',
                'backup_restore_logically_identical': True, 'migration_reapply': 'idempotent',
                'missing_backup_refused': True, 'corrupt_backup_refused': True,
                'database_survived_rehearsal': False,
                'limitations': ['not actual Go enrollment', 'not server restore', 'not off-host S3',
                                'not Docker boot', 'not real RPO/RTO', 'not human or 1Password acceptance']}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, help='optional non-secret JSON report outside test scratch directory')
    args = parser.parse_args()
    try:
        result = rehearse()
        if args.report:
            if args.report.exists():
                parser.error('refusing to overwrite an existing evidence report')
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(result, indent=2) + '\n')
            args.report.chmod(0o600)
        print('PASS: Bite 33.6.8 isolated SQLite backup, restore, migration and negative-case regression')
        print(f'PASS: {result["migration_count"]} migrations, integrity ok, foreign keys clean, test directory removed')
        print('NOT VERIFIED: server/S3/Docker, actual Go enrollment, RPO/RTO, human or 1Password acceptance')
        return 0
    except (OSError, RuntimeError, sqlite3.Error) as exc:
        print(f'FAIL: integrated SQLite rehearsal: {type(exc).__name__}: {exc}', file=__import__('sys').stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
