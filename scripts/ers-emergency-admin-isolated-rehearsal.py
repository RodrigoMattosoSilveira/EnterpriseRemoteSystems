#!/usr/bin/env python3
"""Isolated admin break-glass rehearsal. NEVER targets a live database or issues a Production token.

Two phases allow actual human owners to sign the same ephemeral request independently.
This runner uses real backup/hash, Ed25519 signature, SQLite issuance and Go authentication
checks. It replaces ONLY the Production-host offline gate on a verified scratch copy.
"""
import argparse
import contextlib
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
from unittest import mock

UTC = dt.timezone.utc
ROOT = Path(__file__).resolve().parents[1]
TOOL = Path(__file__).with_name('ers-emergency-admin-recovery.py')
spec = importlib.util.spec_from_file_location('ers_emergency', TOOL)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def date(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(UTC)


def input_file(value):
    p = Path(value).absolute()
    require(p.is_file() and not p.is_symlink(), 'missing, non-regular or symlinked input')
    return p.resolve(strict=True)


def backup_evidence(backup, manifest, receipt, max_age_hours, offhost_env):
    require(max_age_hours > 0 and max_age_hours <= 24, 'freshness limit must be between 1 and 24 hours')
    b, m, r = (input_file(x) for x in (backup, manifest, receipt))
    doc, off = read(m), read(r)
    mod.check_backup(b, m)  # Same independent digest/manifest validator as real issuance.
    offhost_env_path = input_file(offhost_env)
    # A local receipt alone does not establish that the exact S3 versions still
    # exist. Require a LIVE read-only verification using the existing ERS tool.
    checked = subprocess.run([str(ROOT/'scripts/run-backup-go-tool.sh'),
                              'ers-offhost-backup', 'verify-replica',
                              '--environment', 'production', '--env-file', str(offhost_env_path),
                              '--receipt', str(r)], cwd=ROOT, capture_output=True)
    require(checked.returncode == 0, 'live exact-version S3 verification failed')
    created = date(doc['created_at'])
    age = (dt.datetime.now(UTC) - created).total_seconds()
    require(0 <= age <= max_age_hours*3600, 'backup creation time outside freshness objective')
    require(off.get('status') == 'verified' and off.get('environment') == 'production'
            and off.get('transport') == 's3', 'require verified Production S3 receipt')
    source = off['source']
    require(source['backup_file'] == b.name and source['manifest_file'] == m.name,
            'receipt source filenames differ')
    require(source['backup_sha256'] == sha(b) and source['manifest_sha256'] == sha(m),
            'off-host receipt SHA-256 differs from local evidence')
    for name in ('backup', 'manifest'):
        obj = off['remote'][name]
        require(all(obj.get(k) for k in ('key', 'version_id', 'sha256')),
                'off-host receipt missing immutable S3 version evidence: '+name)
        require(obj['sha256'] == (sha(b) if name == 'backup' else sha(m)),
                'receipt remote checksum disagrees with local artifact: '+name)
    require(off['verification'].get('integrity_check') == 'ok', 'off-host receipt lacks integrity evidence')
    with sqlite3.connect(f'file:{b}?mode=ro', uri=True) as con:
        require(con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'source backup corrupt')
        require(con.execute('PRAGMA foreign_key_check').fetchone() is None, 'foreign key violations')
    return {'backup_sha256':sha(b), 'manifest_sha256':sha(m), 'receipt_sha256':sha(r),
            'created_at':doc['created_at'], 'age_seconds':int(age),
            'remote_version_ids':{k:off['remote'][k]['version_id'] for k in ('backup','manifest')},
            'backup_path':str(b), 'manifest_path':str(m), 'receipt_path':str(r),
            'offhost_environment_file':str(offhost_env_path), 'exact_s3_versions_verified':True}


def read_custody(value):
    record = read(input_file(value))
    slots = record.get('slots', {})
    require(set(slots) == {'owner-a','owner-b'}, 'custody evidence needs exactly two owner slots')
    ids = []
    for key in ('owner-a','owner-b'):
        row = slots[key]
        require(all(isinstance(row.get(f), str) and row[f].strip() for f in
                    ('person_id','witness_id','custody_method','attested_at','public_key_sha256')),
                'owner evidence is incomplete for '+key)
        require(row.get('owner_controls_private_key') is True and
                row.get('private_key_excluded_from_production_host') is True,
                'independent custody attestations incomplete for '+key)
        require(0 <= (dt.datetime.now(UTC)-date(row['attested_at'])).total_seconds() <= 86400,
                'custody attestation is stale')
        fingerprint=row['public_key_sha256']
        require(len(fingerprint)==64 and all(c in '0123456789abcdef' for c in fingerprint),
                'custody public-key fingerprint must be SHA-256 hex')
        ids.append(row['person_id'].strip().casefold())
    require(ids[0] != ids[1], 'same named human for both approval slots')
    require(slots['owner-a']['witness_id'].casefold() not in ids and
            slots['owner-b']['witness_id'].casefold() not in ids,
            'custody witness overlaps other owner')
    return {'attestation_sha256':sha(value), 'distinct_named_people':True,
            'owner_public_key_sha256':{slot:slots[slot]['public_key_sha256'] for slot in slots},
            'NOTE':'Operator attestation, not automated proof of human key custody'}


def verify_openssl_signatures(request, approvals, trust):
    sigs, pubs = Path(approvals), Path(trust)
    require(sigs.is_dir() and pubs.is_dir(), 'approvals/trust directories missing')
    keys=[]
    for slot in ('owner-a','owner-b'):
        key, sig = input_file(pubs/(slot+'.pem')), input_file(sigs/(slot+'.sig'))
        check = subprocess.run(['openssl','pkeyutl','-verify','-pubin','-inkey',str(key),
                                '-rawin','-in',str(request),'-sigfile',str(sig)],capture_output=True)
        require(check.returncode == 0, 'designated OpenSSL rejected signature for '+slot)
        fp = subprocess.run(['openssl','pkey','-pubin','-in',str(key),'-outform','DER'],capture_output=True)
        require(fp.returncode == 0, 'invalid public key for '+slot)
        keys.append(hashlib.sha256(fp.stdout).hexdigest())
    require(keys[0] != keys[1], 'recovery requires distinct owner public keys')
    return {'owner_public_key_sha256':dict(zip(('owner-a','owner-b'),keys))}


def prepare(args):
    require(os.environ.get('APP_ENV') != 'production', 'rehearsal must not run with APP_ENV=production')
    require(args.confirm == 'ISOLATED-COPY-ONLY', 'explicit isolated-only confirmation required')
    backup = backup_evidence(args.backup, args.manifest, args.receipt, args.max_age_hours, args.offhost_env_file)
    custody = read_custody(args.custody)
    require(not Path(args.work_root).is_symlink(), 'work root symlink refused')
    work_root = Path(args.work_root).resolve(strict=True)
    require(work_root.is_dir() and not work_root.is_symlink(), 'work root must be a real directory')
    require(not (work_root == Path(backup['backup_path']).parent or
                 work_root.is_relative_to(Path(backup['backup_path']).parent)),
            'scratch work root must be outside original backup directory')
    os.umask(0o077)
    work = Path(tempfile.mkdtemp(prefix='ers-admin-rehearsal-',dir=work_root))
    try:
        scratch = work/'scratch.db'
        # Use the exact Bite 33.4 verified restore tool, not an ad hoc file copy.
        restore=subprocess.run([str(ROOT/'scripts/run-backup-go-tool.sh'),'ers-restore','apply',
            '--backup',backup['backup_path'],'--manifest',backup['manifest_path'],
            '--target',str(scratch),'--environment','production','--confirm','RESTORE-PRODUCTION',
            '--report',str(work/'restore.json')],cwd=ROOT,capture_output=True)
        require(restore.returncode==0,'Bite 33.4 isolated restore failed')
        os.chmod(scratch,0o600)

        require(sha(scratch) == backup['backup_sha256'], 'scratch restore checksum differs')
        with sqlite3.connect(f'file:{scratch}?mode=ro',uri=True) as db:
            require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','scratch corrupted')
            mod.canonical_account(db,args.login)
        mod.plan(scratch,args.login,work/'request.json')
        state = {'backup':backup, 'custody':custody,'login':args.login,
                 'request_sha256':sha(work/'request.json'), 'phase':'awaiting_owner_approvals'}
        (work/'state.json').write_text(json.dumps(state,indent=2)+'\n')
        os.chmod(work/'state.json',0o600)
        require(sha(backup['backup_path']) == backup['backup_sha256'], 'original backup modified')
        print('ERS_REHEARSAL PREPARE PASS')
        print('ISOLATED_WORKSPACE='+str(work))
        print('SIGN_THIS_REQUEST='+str(work/'request.json'))
        print('NEXT: two independently controlled owners sign the identical request; run finish before 15-minute expiry.')
    except BaseException:
        shutil.rmtree(work)
        raise


def finish(args):
    require(os.environ.get('APP_ENV') != 'production', 'rehearsal must not run with APP_ENV=production')
    work = Path(args.workspace).resolve(strict=True)
    require(work.name.startswith('ers-admin-rehearsal-') and not work.is_symlink(), 'invalid rehearsal workspace')
    require(stat.S_IMODE(work.stat().st_mode)==0o700 and work.stat().st_uid==os.geteuid(),
            'workspace must be owned by invoking user and mode 0700')
    report_file = Path(args.report_output).absolute()
    require(report_file.parent.is_dir() and not report_file.exists() and
            stat.S_IMODE(report_file.parent.stat().st_mode)&0o077==0,
            'report output must be new and parent private (0700)')
    state=read(work/'state.json')
    require(state['phase']=='awaiting_owner_approvals', 'rehearsal already attempted')
    backup=state['backup']
    report={'status':'failed','backup_sha256':backup['backup_sha256'],
            'offhost_version_ids':backup['remote_version_ids'],
            'live_s3_verify_replica':'success at prepare and finish',
            'custody_attestation_sha256':state['custody']['attestation_sha256'],
            'offline_gate':'substituted ONLY for verified isolated scratch file, not live Production',
            'production_host_permission_gate':'NOT TESTED: requires separate authorized host check'}
    try:
        require(sha(work/'request.json')==state['request_sha256'],'recovery request modified')
        fresh=backup_evidence(backup['backup_path'],backup['manifest_path'],backup['receipt_path'],args.max_age_hours,backup['offhost_environment_file'])
        require(fresh['backup_sha256']==backup['backup_sha256'], 'backup source changed')
        require(read_custody(args.custody)['attestation_sha256']==state['custody']['attestation_sha256'],
                'owner custody evidence changed since prepare')
        sigs=verify_openssl_signatures(work/'request.json',args.approvals,args.trust_dir)
        report['signing_public_fingerprints']=sigs['owner_public_key_sha256']
        require(sigs['owner_public_key_sha256'] == state['custody']['owner_public_key_sha256'],
                'signed approval public keys differ from owner custody attestations')
        scratch=work/'scratch.db'
        require(scratch.is_file() and not scratch.is_symlink() and
                scratch.resolve().parent == work and scratch.stat().st_nlink == 1,
                'scratch must be private, unlinked and contained in workspace')
        require(not os.path.samefile(scratch,backup['backup_path']),
                'scratch unexpectedly aliases original backup')
        # A concurrent SQLite writer would make the subsequent offline mutation
        # unsafe. BEGIN EXCLUSIVE must succeed on the isolated scratch file.
        with sqlite3.connect(scratch,timeout=0,isolation_level=None) as lock_check:
            lock_check.execute('BEGIN EXCLUSIVE')
            lock_check.execute('ROLLBACK')
        require(sha(scratch)==backup['backup_sha256'], 'scratch modified before approval')
        private=work/'private';private.mkdir(mode=0o700)
        token=private/'token'
        # Compile before issuance: token validity is only ten minutes.
        binary=private/'rehearsal-authentication.test'
        build=subprocess.run(['go','test','-c','-o',str(binary),'./internal/authentication'],
                             cwd=ROOT/'backend',capture_output=True)
        require(build.returncode==0, 'Go backend integration binary could not be compiled')
        request_doc=read(work/'request.json')
        require((mod.timestamp(request_doc['expires_at'])-dt.datetime.now(UTC)).total_seconds() >= 120,
                'less than two minutes remain on approval request; start over')

        # This cannot bypass the Production CLI: only this external rehearsal orchestrator
        # temporarily replaces the host/offline and root-metadata preconditions, while
        # retaining real Ed25519 OpenSSL checks, backup checks, identity, SQL, and audit.
        def checked(_request, _approvals, _trust):
            verify_openssl_signatures(work/'request.json',_approvals,_trust)
        with mock.patch.object(mod,'require_offline'), mock.patch.object(mod,'check_approvals',side_effect=checked):
            mod.issue(scratch,work/'request.json',args.approvals,args.trust_dir,
                      token,backup['backup_path'],backup['manifest_path'])
        req=read(work/'request.json')
        with sqlite3.connect(f'file:{scratch}?mode=ro',uri=True) as db:
            audit=db.execute('SELECT COUNT(*) FROM authz_audit_logs WHERE correlation_id=? AND operation=?',
                             (req['request_id'],'production.emergency_admin_recovery.token_issue')).fetchone()[0]
            require(audit==1,'missing correlated issuance audit event')
            require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','post issue SQLite integrity failed')
        env=dict(os.environ,ERS_EMERGENCY_REHEARSAL_DB=str(scratch),
                 ERS_EMERGENCY_REHEARSAL_TOKEN_FILE=str(token),
                 ERS_EMERGENCY_REHEARSAL_LOGIN=state['login'],
                 ERS_EMERGENCY_REHEARSAL_REQUEST_ID=req['request_id'])
        env.pop('APP_ENV',None)
        proc=subprocess.run([str(binary),'-test.run=^TestIsolatedEmergencyAdminRedeemAndLogin$',
                             '-test.v'],cwd=ROOT/'backend',env=env,capture_output=True,text=True)
        require(proc.returncode==0, 'Go backend endpoint integration failed (no secrets logged); '+
                '\n'.join(x for x in proc.stdout.splitlines() if 'PASS' in x or 'FAIL' in x)[-350:])
        with sqlite3.connect(f'file:{scratch}?mode=ro',uri=True) as db:
            require(db.execute('SELECT used_at IS NOT NULL FROM auth_password_reset_tokens WHERE token_hash=?',
                               (mod.base64.urlsafe_b64encode(mod.hashlib.sha256(token.read_text().strip().encode()).digest()).rstrip(b'=').decode(),)).fetchone()==(1,),
                    'reset token was not consumed')
            require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','post redemption integrity failure')
            require(db.execute('SELECT COUNT(*) FROM authz_audit_logs WHERE correlation_id=?',
                               (req['request_id'],)).fetchone()[0]==1,'audit event missing/duplicated')
        # A real immutable audit log must reject both UPDATE and DELETE.
        with sqlite3.connect(scratch,timeout=5) as guard:
            for sql in ('UPDATE authz_audit_logs SET reason=? WHERE correlation_id=?',
                        'DELETE FROM authz_audit_logs WHERE correlation_id=?'):
                arguments=('tamper',req['request_id']) if sql.startswith('UPDATE') else (req['request_id'],)
                try:
                    guard.execute(sql,arguments)
                except sqlite3.DatabaseError:
                    guard.rollback()
                else:
                    guard.rollback()
                    raise ValueError('append-only recovery audit accepted modification')
        require(sha(backup['backup_path'])==backup['backup_sha256'],'original backup changed')
        report['status']='passed_isolated_rehearsal'
        report['checks']=['verified_source_manifest','freshness','receipt_version_metadata',
                          'two_distinct_named_owner_attestations','real_openssl_signatures',
                          'isolated_issued_hashed_token','api_reset_redemption','api_admin_login',
                          'prior_session_revocation','reset_replay_refusal','audit_correlation',
                          'audit_append_only_update_delete_refused','source_unchanged']
    except BaseException as exc:
        report['failure_type']=type(exc).__name__
        report['failure_reason']=str(exc)[:350].replace(state['login'],'<redacted>')
        print('ERS_REHEARSAL ISOLATED_END_TO_END FAIL: '+type(exc).__name__,file=sys.stderr)
        raise
    finally:
        # Contains real restored Production data: never retain the scratch DB or token.
        # Cleanup must happen BEFORE a PASS marker or a successful report is returned.
        try:
            shutil.rmtree(work)
        except OSError:
            report['status']='failed_cleanup'
            raise
        finally:
            report_file.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
            os.chmod(report_file,0o600)
    print('ERS_REHEARSAL ISOLATED_END_TO_END PASS')


def host_check(_args):
    # The Production recovery host NEVER signs or generates private keys.
    # Probe the SAME `openssl` executable resolved by PATH that the actual
    # Production check_approvals() invokes. Do not substitute Go or skip the
    # Ed25519 verification merely to make a platform compatibility test pass.
    binary = shutil.which('openssl')
    require(binary is not None, 'HOST_OPENSSL_NOT_FOUND')
    version = subprocess.run(['openssl', 'version'], capture_output=True, text=True)
    require(version.returncode == 0, 'HOST_OPENSSL_VERSION_FAILED')
    print('ERS_REHEARSAL HOST_OPENSSL_PATH=' + binary)
    print('ERS_REHEARSAL HOST_OPENSSL_VERSION=' + version.stdout.strip()[:160])

    fixture=ROOT/'scripts/testdata/emergency-recovery-host-probe'
    original=fixture/'message.txt';key=fixture/'owner-public.txt';sig=fixture/'owner-signature.bin'
    with tempfile.TemporaryDirectory(prefix='ers-admin-host-crypto-') as t:
        altered=Path(t)/'altered-message'
        altered.write_bytes(original.read_bytes()+b'X')
        verified=subprocess.run(['openssl','pkeyutl','-verify','-pubin','-inkey',str(key),
                                '-rawin','-in',str(original),'-sigfile',str(sig)],
                               capture_output=True)
        require(verified.returncode == 0, 'HOST_ED25519_VALID_SIGNATURE_REJECTED')
        public=subprocess.run(['openssl','pkey','-pubin','-in',str(key),'-outform','DER'],
                              capture_output=True)
        require(public.returncode == 0 and len(public.stdout) > 0,
                'HOST_ED25519_PUBLIC_KEY_DER_FAILED')
        invalid=subprocess.run(['openssl','pkeyutl','-verify','-pubin','-inkey',str(key),
                                '-rawin','-in',str(altered),'-sigfile',str(sig)],
                               capture_output=True)
        require(invalid.returncode != 0, 'HOST_ED25519_TAMPERED_SIGNATURE_ACCEPTED')
    print('ERS_REHEARSAL RECOVERY_HOST_OPENSSL PASS')


def offline_writer_check(args):
    # Read-only operator aid: this is NOT called by isolated rehearsal and NEVER
    # stops a Production container. Docker bind mounts and named volumes are checked.
    require(os.geteuid()==0 and os.environ.get('APP_ENV')=='production',
            'host writer gate requires authorized root and APP_ENV=production')
    require(args.confirm=='READ-ONLY-PRODUCTION-WRITER-CHECK',
            'explicit read-only host inspection confirmation required')
    db=input_file(args.db)
    result=subprocess.run(['docker','inspect','-f','{{.State.Running}}','ers-prd-backend'],
                          capture_output=True,text=True)
    require(result.returncode==0 and result.stdout.strip()=='false',
            'Production backend missing or running')
    running=subprocess.run(['docker','ps','-q'],capture_output=True,text=True)
    require(running.returncode==0,'cannot enumerate Docker writers')
    ids=running.stdout.split()
    if ids:
        inspected=subprocess.run(['docker','inspect',*ids],capture_output=True,text=True)
        require(inspected.returncode==0,'cannot inspect running container mounts')
        for container in json.loads(inspected.stdout):
            for mount in container.get('Mounts',[]):
                source=mount.get('Source','')
                if source and Path(source).is_absolute():
                    directory=Path(source).resolve()
                    if db==directory or db.is_relative_to(directory):
                        raise ValueError('a running container can access the Production DB mount')
    # lsof is a conservative host-level warning: a read-only opener also blocks.
    if shutil.which('lsof'):
        result=subprocess.run(['lsof','-t','--',str(db),str(db)+'-wal',str(db)+'-shm'],
                              capture_output=True,text=True)
        require(result.returncode in (0,1),'cannot inspect open SQLite file descriptors')
        require(not result.stdout.strip(),'SQLite database or sidecar is open by a host process')
    print('ERS_REHEARSAL PRODUCTION_WRITERS_STOPPED PASS (read-only check)')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    subs=parser.add_subparsers(dest='command',required=True)
    p=subs.add_parser('host-check',help='Run on designated recovery host (no Production credentials)')
    p=subs.add_parser('host-writers',help='READ-ONLY Production host writer inspection; never runs for rehearsal')
    p.add_argument('--db',required=True);p.add_argument('--confirm',required=True)
    p=subs.add_parser('prepare')
    p.add_argument('--backup',required=True);p.add_argument('--manifest',required=True)
    p.add_argument('--receipt',required=True);p.add_argument('--custody',required=True)
    p.add_argument('--offhost-env-file',required=True)
    p.add_argument('--login',required=True);p.add_argument('--work-root',required=True)
    p.add_argument('--max-age-hours',type=int,default=24)
    p.add_argument('--confirm',required=True)
    p=subs.add_parser('finish')
    p.add_argument('--workspace',required=True);p.add_argument('--approvals',required=True)
    p.add_argument('--trust-dir',required=True);p.add_argument('--custody',required=True)
    p.add_argument('--report-output',required=True);p.add_argument('--max-age-hours',type=int,default=24)
    args=parser.parse_args()
    try:
        if args.command=='host-writers':offline_writer_check(args)
        elif args.command=='prepare':prepare(args)
        elif args.command=='finish':finish(args)
        else:host_check(args)
    except (OSError,ValueError,KeyError,sqlite3.Error,subprocess.SubprocessError,AssertionError) as exc:
        if args.command == 'host-check':
            # Host-check only processes committed, public, synthetic fixtures.
            # Report a stable failure code without exposing subprocess stderr.
            code = str(exc) if isinstance(exc, ValueError) and str(exc).startswith('HOST_') else 'HOST_CHECK_EXCEPTION'
            print('ERS_REHEARSAL RECOVERY_HOST_OPENSSL FAIL: '+code,file=sys.stderr)
            print('ERS_REHEARSAL HOST_CHECK_ACTION: select an approved OpenSSL build that supports Ed25519 pkeyutl verify -rawin and public-key DER export; run this gate again with that same openssl on PATH on the designated recovery host.',file=sys.stderr)
        else:
            print('ERS_REHEARSAL FAIL: '+type(exc).__name__+' (no secret values printed)',file=sys.stderr)
        return 2
    return 0

if __name__=='__main__':sys.exit(main())
