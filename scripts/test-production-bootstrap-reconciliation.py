#!/usr/bin/env python3
"""Offline regression for the narrowly scoped Production bootstrap grant repair."""
import sqlite3
import tempfile
from pathlib import Path

SQL = (Path(__file__).parent / 'reconcile-production-bootstrap-admin.sql').read_text().replace('.bail on\n', '')
AUDIT_TRIGGER = (Path(__file__).parent.parent / 'backend/migrations/000067_audit_identity_lifecycle_hardening.up.sql').read_text().split('CREATE TRIGGER IF NOT EXISTS trg_authz_audit_identity_required_insert', 1)[1].split('END;', 1)[0]
AUDIT_TRIGGER = 'CREATE TRIGGER IF NOT EXISTS trg_authz_audit_identity_required_insert' + AUDIT_TRIGGER + 'END;'

def fixture(*, valid_admin=True, legacy_binding=False):
    db = sqlite3.connect(':memory:')
    db.executescript('''
CREATE TABLE authz_actors(id TEXT PRIMARY KEY,actor_key TEXT,active INTEGER);
CREATE TABLE authz_roles(id TEXT PRIMARY KEY,code TEXT,active INTEGER);
CREATE TABLE auth_user_accounts(id TEXT PRIMARY KEY,active INTEGER,security_suspended INTEGER);
CREATE TABLE auth_account_actors(actor_id TEXT,account_id TEXT,scope_type TEXT,tenant_id TEXT,membership_id TEXT);
CREATE TABLE auth_account_people(account_id TEXT);
CREATE TABLE authz_actor_role_grants(id TEXT PRIMARY KEY,actor_id TEXT,role_id TEXT,tenant_id TEXT,active INTEGER,lifecycle_suspended INTEGER,updated_at TEXT);
CREATE TABLE authz_audit_logs(id TEXT PRIMARY KEY,occurred_at TEXT,actor_id TEXT,actor_record_id TEXT,tenant_id TEXT,permission_code TEXT,operation TEXT,target_type TEXT,target_id TEXT,decision TEXT,reason TEXT,created_at TEXT,correlation_id TEXT,authorization_source TEXT,actor_scope TEXT);
INSERT INTO authz_actors VALUES('authz-actor-bootstrap-admin','bootstrap-admin',1);
INSERT INTO authz_actors VALUES('real-actor','e2e-application-admin',1);
INSERT INTO authz_roles VALUES('admin-role','APPLICATION_ADMIN',1);
INSERT INTO authz_actor_role_grants VALUES('authz-grant-bootstrap-admin-application-admin','authz-actor-bootstrap-admin','admin-role','*',1,0,'today');
INSERT INTO authz_actor_role_grants VALUES('real-grant','real-actor','admin-role','*',1,0,'today');
INSERT INTO auth_user_accounts VALUES('real-account',1,0);
''')
    if valid_admin:
        db.execute("INSERT INTO auth_account_actors VALUES('real-actor','real-account','GLOBAL',NULL,NULL)")
    if legacy_binding:
        db.execute("INSERT INTO auth_account_actors VALUES('authz-actor-bootstrap-admin','real-account','GLOBAL',NULL,NULL)")
    db.executescript(AUDIT_TRIGGER)
    db.commit()
    return db

# The fixture must enforce the migrated Production audit-identity contract.
# Otherwise an audit insert missing mandatory identity data could pass locally
# and fail only during the Production migration rehearsal.
def test_audit_identity_guard():
    db = fixture()
    try:
        try:
            db.execute("""INSERT INTO authz_audit_logs
                (id, occurred_at, operation, decision, created_at)
                VALUES ('invalid-identity', CURRENT_TIMESTAMP, 'probe', 'allowed', CURRENT_TIMESTAMP)""")
        except sqlite3.IntegrityError as exc:
            assert 'authz_audit_identity_required' in str(exc), str(exc)
        else:
            raise AssertionError('fixture does not enforce the Production audit identity trigger')
    finally:
        db.close()

test_audit_identity_guard()

for valid, bound, success in [(True,False,True),(False,False,False),(True,True,False)]:
    db=fixture(valid_admin=valid, legacy_binding=bound)
    try:
        db.executescript(SQL)
        assert success, 'unsafe repair was allowed'
        assert db.execute("SELECT active FROM authz_actor_role_grants WHERE id='authz-grant-bootstrap-admin-application-admin'").fetchone()[0] == 0
        assert db.execute("SELECT active FROM authz_actor_role_grants WHERE id='real-grant'").fetchone()[0] == 1
        assert db.execute('SELECT count(*) FROM authz_audit_logs').fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM authz_audit_logs WHERE TRIM(correlation_id) <> '' AND authorization_source='NONE'").fetchone()[0] == 1
        db.executescript(SQL)
        assert db.execute('SELECT count(*) FROM authz_audit_logs').fetchone()[0] == 1
    except sqlite3.Error:
        assert not success, 'repair unexpectedly failed'
    finally:
        db.close()
print('Production bootstrap reconciliation offline regression PASS')

# Adversarial fixtures: the repair must be refused without changing the grant
# or appending an audit entry. Keep these database copies disposable.
def assert_rejected(label, setup):
    db = fixture()
    try:
        setup(db)
        db.commit()
        before = db.execute("SELECT active FROM authz_actor_role_grants WHERE id='authz-grant-bootstrap-admin-application-admin'").fetchone()[0]
        try:
            db.executescript(SQL)
        except sqlite3.Error:
            db.rollback()
        else:
            raise AssertionError(f'{label}: unsafe reconciliation accepted')
        assert db.execute("SELECT active FROM authz_actor_role_grants WHERE id='authz-grant-bootstrap-admin-application-admin'").fetchone()[0] == before, label
        assert db.execute('SELECT COUNT(*) FROM authz_audit_logs').fetchone()[0] == 0, label
    finally:
        db.close()

assert_rejected('wrong grant role', lambda db: db.execute("UPDATE authz_roles SET code='TENANT_ADMIN' WHERE id='admin-role'"))
assert_rejected('unexpected grant tenant', lambda db: db.execute("UPDATE authz_actor_role_grants SET tenant_id='tenant-a' WHERE id='authz-grant-bootstrap-admin-application-admin'"))
assert_rejected('suspended legacy grant', lambda db: db.execute("UPDATE authz_actor_role_grants SET lifecycle_suspended=1 WHERE id='authz-grant-bootstrap-admin-application-admin'"))
assert_rejected('canonical administrator inactive', lambda db: db.execute("UPDATE auth_user_accounts SET active=0 WHERE id='real-account'"))
assert_rejected('canonical administrator suspended', lambda db: db.execute("UPDATE auth_user_accounts SET security_suspended=1 WHERE id='real-account'"))
assert_rejected('canonical actor inactive', lambda db: db.execute("UPDATE authz_actors SET active=0 WHERE id='real-actor'"))
assert_rejected('canonical grant inactive', lambda db: db.execute("UPDATE authz_actor_role_grants SET active=0 WHERE id='real-grant'"))
assert_rejected('canonical account person-linked', lambda db: db.execute("INSERT INTO auth_account_people VALUES('real-account')"))
assert_rejected('canonical tenant binding', lambda db: db.execute("INSERT INTO auth_account_actors VALUES('real-actor','real-account','TENANT','tenant-a','member-a')"))
assert_rejected('legacy actor key changed', lambda db: db.execute("UPDATE authz_actors SET actor_key='unexpected' WHERE id='authz-actor-bootstrap-admin'"))
print('Production bootstrap adversarial fixtures PASS')
