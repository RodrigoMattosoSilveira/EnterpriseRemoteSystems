#!/usr/bin/env python3
"""Offline regression for the narrowly scoped Production bootstrap grant repair."""
import sqlite3
import tempfile
from pathlib import Path

SQL = (Path(__file__).parent / 'reconcile-production-bootstrap-admin.sql').read_text().replace('.bail on\n', '')

def fixture(*, valid_admin=True, legacy_binding=False):
    db = sqlite3.connect(':memory:')
    db.executescript('''
CREATE TABLE authz_actors(id TEXT PRIMARY KEY,actor_key TEXT,active INTEGER);
CREATE TABLE authz_roles(id TEXT PRIMARY KEY,code TEXT,active INTEGER);
CREATE TABLE auth_user_accounts(id TEXT PRIMARY KEY,active INTEGER,security_suspended INTEGER);
CREATE TABLE auth_account_actors(actor_id TEXT,account_id TEXT,scope_type TEXT,tenant_id TEXT,membership_id TEXT);
CREATE TABLE auth_account_people(account_id TEXT);
CREATE TABLE authz_actor_role_grants(id TEXT PRIMARY KEY,actor_id TEXT,role_id TEXT,tenant_id TEXT,active INTEGER,lifecycle_suspended INTEGER,updated_at TEXT);
CREATE TABLE authz_audit_logs(id TEXT PRIMARY KEY,occurred_at TEXT,actor_id TEXT,actor_record_id TEXT,tenant_id TEXT,permission_code TEXT,operation TEXT,target_type TEXT,target_id TEXT,decision TEXT,reason TEXT,created_at TEXT);
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
    db.commit()
    return db

for valid, bound, success in [(True,False,True),(False,False,False),(True,True,False)]:
    db=fixture(valid_admin=valid, legacy_binding=bound)
    try:
        db.executescript(SQL)
        assert success, 'unsafe repair was allowed'
        assert db.execute("SELECT active FROM authz_actor_role_grants WHERE id='authz-grant-bootstrap-admin-application-admin'").fetchone()[0] == 0
        assert db.execute("SELECT active FROM authz_actor_role_grants WHERE id='real-grant'").fetchone()[0] == 1
        assert db.execute('SELECT count(*) FROM authz_audit_logs').fetchone()[0] == 1
        db.executescript(SQL)
        assert db.execute('SELECT count(*) FROM authz_audit_logs').fetchone()[0] == 1
    except sqlite3.Error:
        assert not success, 'repair unexpectedly failed'
    finally:
        db.close()
print('Production bootstrap reconciliation offline regression PASS')
