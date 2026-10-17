#!/usr/bin/env python3
"""Offline Bite 33.6.6A emergency recovery security regression, no Production access."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
from unittest import mock

SCRIPT=Path(__file__).with_name('ers-emergency-admin-recovery.py')
spec=importlib.util.spec_from_file_location('ers_admin_emergency',SCRIPT)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def fixture(db):
    with sqlite3.connect(db) as c:
        c.executescript('''
CREATE TABLE auth_user_accounts(id TEXT PRIMARY KEY,login TEXT,active INTEGER,security_suspended INTEGER,must_change_password INTEGER);
CREATE TABLE auth_account_actors(account_id TEXT,actor_id TEXT,scope_type TEXT,tenant_id TEXT,membership_id TEXT);
CREATE TABLE authz_actors(id TEXT,actor_key TEXT,active INTEGER);
CREATE TABLE authz_actor_role_grants(id TEXT,actor_id TEXT,role_id TEXT,tenant_id TEXT,active INTEGER,lifecycle_suspended INTEGER);
CREATE TABLE authz_roles(id TEXT,code TEXT,active INTEGER,scope_type TEXT);
CREATE TABLE auth_account_people(account_id TEXT);
CREATE TABLE auth_password_reset_tokens(id TEXT PRIMARY KEY,account_id TEXT,token_hash TEXT,expires_at TEXT,created_at TEXT,used_at TEXT);
CREATE TABLE authz_audit_logs(id TEXT PRIMARY KEY,occurred_at TEXT,actor_id TEXT,actor_record_id TEXT,tenant_id TEXT,permission_code TEXT,operation TEXT,target_type TEXT,target_id TEXT,decision TEXT,reason TEXT,created_at TEXT,account_id TEXT,actor_scope TEXT,correlation_id TEXT UNIQUE,authorization_source TEXT);
INSERT INTO auth_user_accounts VALUES('a1','administrator@example.invalid',1,0,0);
INSERT INTO auth_account_actors VALUES('a1','act1','GLOBAL',NULL,NULL);
INSERT INTO authz_actors VALUES('act1','canonical-admin',1);
INSERT INTO authz_roles VALUES('r1','APPLICATION_ADMIN',1,'APPLICATION');
INSERT INTO authz_actor_role_grants VALUES('g1','act1','r1','*',1,0);
''')
        migration=(Path(__file__).resolve().parents[1]/'backend/migrations/000067_audit_identity_lifecycle_hardening.up.sql').read_text()
        marker='CREATE TRIGGER IF NOT EXISTS trg_authz_audit_identity_required_insert'
        assert marker in migration
        c.executescript(migration[migration.index(marker):])

def count(db,table):
    with sqlite3.connect(db) as c:
        return c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]

def main():
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp); db=root/'database.db';fixture(db)
        request=root/'request.json'
        mod.plan(db,'administrator@example.invalid',request)
        req=json.loads(request.read_text())
        assert req['purpose']=='ERS_PRODUCTION_ADMIN_EMERGENCY_RESET'
        assert req['account_id']=='a1'
        private=root/'secrets';private.mkdir(mode=0o700)
        token=private/'token'
        # Real two-key Ed25519 signature verification; owner private keys are never
        # part of the Production tool or any repository fixture.
        trust=root/'trust';trust.mkdir()
        sigdir=root/'signatures';sigdir.mkdir()
        for owner in ('owner-a','owner-b'):
            key=root/(owner+'.key')
            pub=trust/(owner+'.pem')
            subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(key)],check=True,capture_output=True)
            subprocess.run(['openssl','pkey','-in',str(key),'-pubout','-out',str(pub)],check=True,capture_output=True)
            subprocess.run(['openssl','pkeyutl','-sign','-rawin','-inkey',str(key),'-in',str(request),'-out',str(sigdir/(owner+'.sig'))],check=True,capture_output=True)
        # Trust ownership is enforced in Production. The synthetic test verifies
        # cryptographic signatures with an independent verifier, even as non-root.
        for owner in ('owner-a','owner-b'):
            assert subprocess.run(['openssl','pkeyutl','-verify','-pubin','-inkey',str(trust/(owner+'.pem')),'-rawin','-in',str(request),'-sigfile',str(sigdir/(owner+'.sig'))],capture_output=True).returncode==0
        if mod.os.geteuid()==0:
            mod.check_approvals(req,sigdir,trust)
            modified=dict(req,login='evil@example.invalid')
            try:mod.check_approvals(modified,sigdir,trust)
            except ValueError:pass
            else:raise AssertionError('altered signed approval accepted')
        # Mock ONLY external offline/server and backup verification gates, never
        # the signed request identity or database/audit/rollback behavior.
        with mock.patch.object(mod,'require_offline'), mock.patch.object(mod,'check_backup'),mock.patch.object(mod,'check_approvals'):
            mod.issue(db,request,sigdir,trust,token,root/'backup',root/'manifest')
            raw=token.read_text().strip()
            assert raw.startswith('ers_pr_') and len(raw)>40
            assert count(db,'auth_password_reset_tokens')==1
            assert count(db,'authz_audit_logs')==1
            with sqlite3.connect(db) as c:
                record=c.execute('SELECT correlation_id,operation,authorization_source FROM authz_audit_logs').fetchone()
                assert record==(req['request_id'],'production.emergency_admin_recovery.token_issue','NONE')
                assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            try:mod.issue(db,request,sigdir,trust,private/'second',root/'backup',root/'manifest')
            except ValueError:pass
            else:raise AssertionError('replay accepted')
            assert count(db,'auth_password_reset_tokens')==1 and count(db,'authz_audit_logs')==1
            assert not (private/'second').exists()
            # Invalid target identity must fail without inserting token/audit rows.
            with sqlite3.connect(db) as c:
                c.execute("UPDATE authz_actor_role_grants SET active=0 WHERE id='g1'")
            request2=root/'next.json'
            req['request_id']='00000000-0000-4000-8000-000000000001'
            request2.write_bytes(mod.json_bytes(req))
            try:mod.issue(db,request2,sigdir,trust,private/'third',root/'backup',root/'manifest')
            except ValueError:pass
            else:raise AssertionError('inactive administrator accepted')
            assert count(db,'auth_password_reset_tokens')==1 and count(db,'authz_audit_logs')==1
            assert not (private/'third').exists()
    print('Bite 33.6.6A offline dual-approval recovery regressions PASS')

if __name__=='__main__': main()
