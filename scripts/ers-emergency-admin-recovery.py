#!/usr/bin/env python3
"""Offline, dual-approved Production emergency recovery token issuance.

Never sets a password or grants a role. The ordinary /auth/password/reset
endpoint consumes the short-lived, single-use token and invalidates sessions.
"""
import argparse
import base64
import datetime as dt
import hashlib
import json
import importlib.util
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import tempfile
import uuid

UTC = dt.timezone.utc

def fail(message):
    raise ValueError(message)

def json_bytes(obj):
    return (json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=True) + '\n').encode()

def read_json(path):
    return json.loads(Path(path).read_text())

def timestamp(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        fail('timestamp missing timezone')
    return parsed.astimezone(UTC)

def canonical_account(db, login):
    rows = db.execute('''SELECT u.id, u.login, aa.actor_id, a.actor_key
        FROM auth_user_accounts u
        JOIN auth_account_actors aa ON aa.account_id=u.id
        JOIN authz_actors a ON a.id=aa.actor_id
        JOIN authz_actor_role_grants g ON g.actor_id=a.id
        JOIN authz_roles r ON r.id=g.role_id
        WHERE u.login=? COLLATE NOCASE AND u.active=1 AND u.security_suspended=0
          AND u.must_change_password IN (0,1)
          AND aa.scope_type='GLOBAL' AND aa.tenant_id IS NULL AND aa.membership_id IS NULL
          AND a.active=1 AND g.active=1 AND g.lifecycle_suspended=0
          AND g.tenant_id='*' AND r.code='APPLICATION_ADMIN' AND r.active=1
          AND r.scope_type='APPLICATION'
          AND NOT EXISTS (SELECT 1 FROM auth_account_people ap WHERE ap.account_id=u.id)
          AND NOT EXISTS (SELECT 1 FROM auth_account_actors ta WHERE ta.account_id=u.id AND ta.scope_type='TENANT')
          AND NOT EXISTS (SELECT 1 FROM auth_account_actors ta WHERE ta.actor_id=a.id AND ta.scope_type='TENANT')''', (login,)).fetchall()
    if len(rows)!=1:
        fail('expected exactly one active canonical global Application Administrator')
    return rows[0]

def plan(db_path, login, output):
    with sqlite3.connect(f'file:{Path(db_path).resolve()}?mode=ro', uri=True) as db:
        account_id, actual_login, actor_id, actor_key=canonical_account(db,login)
    created=dt.datetime.now(UTC)
    request={'version':1,'purpose':'ERS_PRODUCTION_ADMIN_EMERGENCY_RESET',
             'request_id':str(uuid.uuid4()),'account_id':account_id,
             'login':actual_login,'actor_id':actor_id,'actor_key':actor_key,
             'issued_at':created.isoformat(),
             'expires_at':(created+dt.timedelta(minutes=15)).isoformat()}
    output=Path(output)
    with output.open('xb') as f:
        f.write(json_bytes(request))
    os.chmod(output, 0o600)
    print('Recovery request created; obtain two independent signed approvals. No database changes.')

def configured_openssl(*, require_privileged_safe_path=False):
    """Resolve the single approved verifier; never search PATH or silently fall back.

    Privileged use requires root control of every path component, including
    symlink components and the canonical target. Homebrew's ordinary user-owned
    tree must not become a root-executed program without trusted provisioning.
    """
    value = os.environ.get('ERS_RECOVERY_OPENSSL_BIN', '')
    if not value:
        fail('HOST_OPENSSL_CONFIG_REQUIRED: set ERS_RECOVERY_OPENSSL_BIN')
    configured = Path(value)
    if not configured.is_absolute():
        fail('HOST_OPENSSL_CONFIG_NOT_ABSOLUTE')
    try:
        binary = configured.resolve(strict=True)
    except (OSError, RuntimeError):
        fail('HOST_OPENSSL_PATH_RESOLUTION_FAILED')
    if not binary.is_file() or not os.access(binary, os.X_OK):
        fail('HOST_OPENSSL_NOT_EXECUTABLE')
    if require_privileged_safe_path or os.geteuid() == 0:
        # Check original and resolved paths, not just the binary's final mode:
        # a user-writable parent or replaceable symlink can redirect root.
        for path in (configured, binary):
            components = [path]
            while components[-1] != components[-1].parent:
                components.append(components[-1].parent)
            for item in reversed(components):
                info = item.lstat()
                if info.st_uid != 0 or info.st_mode & 0o022:
                    fail('HOST_OPENSSL_UNTRUSTED_PRIVILEGED_PATH')
    return str(binary)


def check_approvals(request, approval_dir, trust_dir):
    openssl = configured_openssl()
    trust=Path(trust_dir)
    if not trust.is_absolute() or trust.is_symlink() or trust.stat().st_uid != 0 or trust.stat().st_mode & 0o022:
        fail('trusted approval directory must be root-owned and not writable by group/others')
    if not Path(approval_dir).is_dir():
        fail('approval directory missing')
    for name in ('owner-a','owner-b'):
        key=trust/(name+'.pem')
        signature=Path(approval_dir)/(name+'.sig')
        if not key.is_file() or key.is_symlink() or not signature.is_file() or signature.is_symlink():
            fail('both independent owner signatures are required')
        if key.stat().st_uid != 0 or key.stat().st_mode & 0o022:
            fail('trusted approval public key must be root-owned and protected')
        with tempfile.NamedTemporaryFile(mode='wb') as f:
            f.write(json_bytes(request)); f.flush()
            result=subprocess.run([openssl,'pkeyutl','-verify','-pubin','-inkey',str(key),
                '-rawin','-in',f.name,'-sigfile',str(signature)], capture_output=True)
        if result.returncode:
            fail('independent owner signature validation failed')
    fingerprints=[]
    for owner in ('owner-a','owner-b'):
        result=subprocess.run([openssl,'pkey','-pubin','-in',str(trust/(owner+'.pem')),'-outform','DER'],capture_output=True)
        if result.returncode: fail('invalid trusted public key')
        fingerprints.append(hashlib.sha256(result.stdout).digest())
    if fingerprints[0]==fingerprints[1]:
        fail('recovery requires distinct trusted owner keys')

def require_offline():
    if os.geteuid()!=0:
        fail('issuance requires an authorized root operator')
    if os.environ.get('APP_ENV')!='production':
        fail('issuance requires APP_ENV=production')
    result=subprocess.run(['docker','inspect','-f','{{.State.Running}}','ers-prd-backend'],capture_output=True,text=True)
    if result.returncode != 0 or result.stdout.strip()!='false':
        fail('Production backend must exist and be stopped for offline recovery')

def check_backup(backup_path, manifest_path):
    spec=importlib.util.spec_from_file_location('ers_backup_verifier', Path(__file__).with_name('test-production-bootstrap-full-schema.py'))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.verify_manifest(Path(backup_path), Path(manifest_path))

def issue(db_path, request_path, approvals, trust, token_path, backup, manifest):
    require_offline()
    check_backup(backup,manifest)
    request=read_json(request_path)
    if request.get('version')!=1 or request.get('purpose')!='ERS_PRODUCTION_ADMIN_EMERGENCY_RESET':
        fail('invalid emergency recovery request')
    now=dt.datetime.now(UTC)
    if not (timestamp(request['issued_at']) <= now < timestamp(request['expires_at']) <= timestamp(request['issued_at'])+dt.timedelta(minutes=15)):
        fail('recovery request expired or outside allowed window')
    if set(request)!={'version','purpose','request_id','account_id','login','actor_id','actor_key','issued_at','expires_at'}:
        fail('unexpected recovery request fields')
    uuid.UUID(request['request_id'])
    check_approvals(request, approvals, trust)
    target=Path(token_path)
    if not target.is_absolute() or target.exists() or target.is_symlink():
        fail('recovery token output must be a new absolute path')
    if target.parent.stat().st_mode & 0o077 or target.parent.is_symlink():
        fail('recovery token output directory must be private (0700)')
    if target.parent.stat().st_uid != os.geteuid():
        fail('recovery token directory must be owned by the invoking operator')
    token='ers_pr_'+base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode()
    token_hash=base64.urlsafe_b64encode(hashlib.sha256(token.encode()).digest()).rstrip(b'=').decode()
    expiry=(now+dt.timedelta(minutes=10)).isoformat()
    # Reserve output prior to mutating data. Delete on failure.
    fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,'w') as f:
            f.write(token+'\n'); f.flush(); os.fsync(f.fileno())
        conn=sqlite3.connect(str(db_path),timeout=5,isolation_level=None)
        try:
            conn.execute('PRAGMA foreign_keys=ON')
            conn.execute('BEGIN IMMEDIATE')
            row=canonical_account(conn,request['login'])
            if [row[0],row[1],row[2],row[3]] != [request[k] for k in ('account_id','login','actor_id','actor_key')]:
                fail('canonical identity changed since approval')
            # Request-id is a replay guard, persisted in the immutable audit log.
            if conn.execute('SELECT 1 FROM authz_audit_logs WHERE correlation_id=?', (request['request_id'],)).fetchone():
                fail('recovery request already used')
            # Match the normal ERS issue-token service: invalidate any older unused reset tokens.
            conn.execute('UPDATE auth_password_reset_tokens SET used_at=? WHERE account_id=? AND used_at IS NULL', (now.isoformat(), row[0]))
            conn.execute('''INSERT INTO auth_password_reset_tokens(id, account_id, token_hash, expires_at, created_at)
                VALUES(?,?,?,?,?)''',(str(uuid.uuid4()),row[0],token_hash,expiry,now.isoformat()))
            conn.execute('''INSERT INTO authz_audit_logs
                (id,occurred_at,actor_id,actor_record_id,tenant_id,permission_code,operation,target_type,
                 target_id,decision,reason,created_at,account_id,actor_scope,correlation_id,authorization_source)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (str(uuid.uuid4()),now.isoformat(),None,None,'*',None,
                 'production.emergency_admin_recovery.token_issue','auth_user_account',row[0],
                 'allowed','Two independent offline operator approvals verified; token value not retained',
                 now.isoformat(),row[0],'GLOBAL',request['request_id'],'NONE'))
            conn.execute('COMMIT')
        except BaseException:
            if conn.in_transaction: conn.execute('ROLLBACK')
            raise
        finally: conn.close()
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    print('Emergency reset token issued to private file; value suppressed. Restart backend, then redeem via POST /api/v1/auth/password/reset within 10 minutes.')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='action',required=True)
    a=sub.add_parser('prepare'); a.add_argument('--db',required=True);a.add_argument('--login',required=True);a.add_argument('--request-output',required=True)
    a=sub.add_parser('issue');a.add_argument('--db',required=True);a.add_argument('--request',required=True);a.add_argument('--approvals',required=True);a.add_argument('--trust-dir',required=True);a.add_argument('--token-output',required=True);a.add_argument('--verified-backup',required=True);a.add_argument('--manifest',required=True)
    args=p.parse_args()
    try:
        if args.action=='prepare':plan(args.db,args.login,args.request_output)
        else:issue(args.db,args.request,args.approvals,args.trust_dir,args.token_output,args.verified_backup,args.manifest)
    except (ValueError,sqlite3.Error,OSError,KeyError,subprocess.SubprocessError) as e:
        print(f'Emergency recovery refused: {type(e).__name__}; inspect protected operator evidence (no credentials output)',file=sys.stderr)
        return 2
    return 0

if __name__=='__main__':sys.exit(main())
