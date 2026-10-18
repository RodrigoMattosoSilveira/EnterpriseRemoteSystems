#!/usr/bin/env python3
"""Fail-closed, offline SQLite CLI rehearsal of Production bootstrap grant repair.

Default CI mode builds the entire migration schema and seeds the observed legacy
condition. Real-backup mode requires an independently verified Production manifest
and NEVER modifies the provided backup. This is not a live Production operation.
"""
import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / 'backend' / 'migrations'
REPAIR = ROOT / 'scripts' / 'reconcile-production-bootstrap-admin.sql'
VERIFY = ROOT / 'backend' / 'verify-migrated-db.sh'
OP = 'production.bootstrap_admin_grant.revoke'
LEGACY = 'authz-grant-bootstrap-admin-application-admin'


def run(args, *, input=None, env=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True, env=env, cwd=ROOT)
    if result.returncode:
        raise AssertionError(f"Command failed ({result.returncode}): {args[0]} {args[1:3]}\n{result.stdout[-3000:]}\n{result.stderr[-3000:]}")
    return result.stdout.strip()


def sql(db, statement):
    return run(['sqlite3', '-bail', str(db), statement])


def invariant(db, *, grant=0, audits=1):
    with sqlite3.connect(f'file:{db}?mode=ro', uri=True) as cx:
        def one(statement):
            return cx.execute(statement).fetchone()[0]
        assert one(f"SELECT active FROM authz_actor_role_grants WHERE id='{LEGACY}'") == grant
        assert one("SELECT COUNT(*) FROM authz_actor_role_grants g JOIN authz_roles r ON r.id=g.role_id JOIN authz_actors a ON a.id=g.actor_id JOIN auth_account_actors aa ON aa.actor_id=a.id JOIN auth_user_accounts u ON u.id=aa.account_id WHERE r.code='APPLICATION_ADMIN' AND g.active=1 AND g.lifecycle_suspended=0 AND g.tenant_id='*' AND a.actor_key != 'bootstrap-admin' AND a.active=1 AND r.active=1 AND u.active=1 AND u.security_suspended=0 AND aa.scope_type='GLOBAL' AND aa.tenant_id IS NULL AND aa.membership_id IS NULL") >= 1
        assert one(f"SELECT COUNT(*) FROM authz_audit_logs WHERE operation='{OP}'") == audits
        assert one(f"SELECT COUNT(*) FROM authz_audit_logs WHERE operation='{OP}' AND (TRIM(correlation_id)='' OR correlation_id IS NULL OR authorization_source != 'NONE' OR target_id != '{LEGACY}')") == 0
        assert one("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='trg_authz_audit_identity_required_insert'") == 1
    assert sql(db, 'PRAGMA integrity_check;') == 'ok'
    assert sql(db, 'PRAGMA foreign_key_check;') == ''


def logical_snapshot(db):
    """Snapshot committed schema and rows, ignoring SQLite file-layout changes.

    SQLite may update header counters, freelist pages, and rollback-journal
    housekeeping even when a failed transaction changes no committed data.
    Byte-for-byte file equality is therefore not a valid atomicity assertion.
    """
    with sqlite3.connect(f'file:{db}?mode=ro', uri=True) as cx:
        return '\n'.join(cx.iterdump())


def prepare_schema(db):
    env = dict(os.environ, DATABASE_PATH=str(db), MIGRATIONS_DIR=str(MIGRATIONS), EXPECTED_FINAL_MIGRATION='000077_journey_bonus_award_approval.up.sql')
    run(['sh', str(ROOT / 'backend' / 'apply-sql-migrations.sh')], env=env)
    # Seed the precise historical Production condition into the *disposable* DB.
    # The canonical administrator is created solely inside this isolated fixture.
    sql(db, """PRAGMA foreign_keys=ON;
INSERT INTO authz_actors(id,actor_key,display_name,active,created_at,updated_at)
 VALUES('authz-actor-bootstrap-admin','bootstrap-admin','Bootstrap Admin',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('rehearsal-canonical-actor','rehearsal-canonical-actor','Offline canonical fixture',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO auth_user_accounts(id,login,password_hash,active,must_change_password,created_at,updated_at,security_suspended)
 VALUES('rehearsal-canonical-account','offline-rehearsal@example.invalid','never-usable-fixture-hash',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0);
INSERT INTO auth_account_actors(account_id,actor_id,scope_type,tenant_id,membership_id,created_at,updated_at)
 VALUES('rehearsal-canonical-account','rehearsal-canonical-actor','GLOBAL',NULL,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO authz_actor_role_grants(id,actor_id,role_id,tenant_id,active,created_at,updated_at,lifecycle_suspended)
 VALUES('authz-grant-bootstrap-admin-application-admin','authz-actor-bootstrap-admin','authz-role-application-admin','*',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0),
 ('rehearsal-canonical-grant','rehearsal-canonical-actor','authz-role-application-admin','*',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0);""")


def verify_manifest(backup, manifest):
    doc = json.loads(manifest.read_text())
    if doc.get('environment') != 'production' or doc.get('status') != 'verified':
        raise AssertionError('Require a verified Production backup manifest')
    if doc.get('backup', {}).get('size_bytes') != backup.stat().st_size:
        raise AssertionError('Production backup size mismatch')
    # Python 3.9 (macOS system Python) has no hashlib.file_digest.
    # Hash in bounded chunks to keep verification portable for large backups.
    hasher = hashlib.sha256()
    with backup.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    if doc.get('backup', {}).get('sha256') != digest:
        raise AssertionError('Production backup SHA256 mismatch')
    if doc.get('verification', {}).get('integrity_check') != 'ok':
        raise AssertionError('Production backup integrity evidence missing')
    if not doc.get('repository', {}).get('revision') or not doc.get('repository', {}).get('tree_sha'):
        raise AssertionError('Production backup repository compatibility metadata missing')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--verified-production-backup', type=Path)
    ap.add_argument('--manifest', type=Path)
    args = ap.parse_args()
    if bool(args.verified_production_backup) != bool(args.manifest):
        ap.error('--verified-production-backup and --manifest must be supplied together')
    if not shutil.which('sqlite3'):
        raise SystemExit('FAIL: sqlite3 CLI required; no skip permitted')
    with tempfile.TemporaryDirectory(prefix='ers-production-bootstrap-full-schema-') as tmp:
        db = Path(tmp) / 'isolated-rehearsal.db'
        if args.verified_production_backup:
            source = args.verified_production_backup.resolve(strict=True)
            manifest = args.manifest.resolve(strict=True)
            verify_manifest(source, manifest)
            shutil.copyfile(source, db)
            # Do not alter/seed a Production-backed fixture; enforce the known
            # historical state and canonical replacement are already present.
            assert sql(db, f"SELECT active FROM authz_actor_role_grants WHERE id='{LEGACY}'") == '1', 'Backup does not contain the expected active legacy grant'
        else:
            prepare_schema(db)
        invariant(db, grant=1, audits=0)
        run(['sqlite3', '-bail', str(db)], input=REPAIR.read_text())
        invariant(db)
        verify_env = dict(os.environ, DATABASE_PATH=str(db), MIGRATIONS_DIR=str(MIGRATIONS), EXPECTED_FINAL_MIGRATION='000077_journey_bonus_award_approval.up.sql')
        run(['sh', str(VERIFY)], env=verify_env)
        run(['sqlite3', '-bail', str(db)], input=REPAIR.read_text())
        invariant(db)
        run(['sh', str(VERIFY)], env=verify_env)
        # Verify negative transaction atomicity against a disposable copy.
        with sqlite3.connect(db) as cx:
            cx.execute("UPDATE authz_actor_role_grants SET active=1 WHERE id=?", (LEGACY,))
            cx.execute("UPDATE authz_actor_role_grants SET active=0 WHERE actor_id != 'authz-actor-bootstrap-admin' AND tenant_id='*' AND role_id IN (SELECT id FROM authz_roles WHERE code='APPLICATION_ADMIN')")
        snap = logical_snapshot(db)
        failure = subprocess.run(['sqlite3','-bail',str(db)], input=REPAIR.read_text(), text=True, capture_output=True)
        assert failure.returncode != 0, 'unsafe reconciliation unexpectedly passed'
        assert logical_snapshot(db) == snap, 'failed transaction changed committed schema or rows'
        assert sql(db,'PRAGMA integrity_check;') == 'ok'
        assert sql(db,'PRAGMA foreign_key_check;') == ''
    print('Production bootstrap full-schema SQLite CLI rehearsal PASS' + (' (verified Production backup copy)' if args.verified_production_backup else ' (complete migration-schema fixture)'))

if __name__ == '__main__':
    main()
