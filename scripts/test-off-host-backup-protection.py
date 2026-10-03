#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, json, os, shutil, sqlite3, subprocess, sys, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'scripts'/'ers-offhost-backup.py'
BACKUP_PATH=ROOT/'scripts'/'ers-backup.py'

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path); mod=importlib.util.module_from_spec(spec); sys.modules[name]=mod; spec.loader.exec_module(mod); return mod
BACKUP=load(BACKUP_PATH,'ers_backup_test333')

def run(cmd,env=None):
    return subprocess.run(cmd,cwd=ROOT,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,check=False)
def ok(p,c):
    if p.returncode!=0: raise AssertionError(f'{c} failed ({p.returncode}):\n{p.stdout}')
def bad(p,c,needle):
    if p.returncode==0 or needle not in p.stdout: raise AssertionError(f'{c} did not fail with {needle!r}:\n{p.stdout}')

def make_db(path):
    con=sqlite3.connect(path)
    con.executescript('''
    CREATE TABLE schema_migrations(filename TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT); CREATE TABLE global_people(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE person_tenant_memberships(id TEXT PRIMARY KEY,person_id TEXT,tenant_id TEXT);
    CREATE TABLE auth_user_accounts(id TEXT PRIMARY KEY,login TEXT); CREATE TABLE authz_actors(id TEXT PRIMARY KEY,actor_key TEXT);
    CREATE TABLE authz_actor_role_grants(id TEXT PRIMARY KEY,actor_id TEXT); CREATE TABLE collaborator_journeys(id TEXT PRIMARY KEY,membership_id TEXT);
    CREATE TABLE ledger_entries(id TEXT PRIMARY KEY,tenant_id TEXT); CREATE TABLE work_periods(id TEXT PRIMARY KEY,tenant_id TEXT);
    INSERT INTO schema_migrations(filename) VALUES('000077_journey_bonus_award_approval.up.sql');
    INSERT INTO tenants VALUES('t','T'); INSERT INTO global_people VALUES('p','P'); INSERT INTO person_tenant_memberships VALUES('m','p','t');
    INSERT INTO auth_user_accounts VALUES('a','x@example.test'); INSERT INTO authz_actors VALUES('z','z'); INSERT INTO authz_actor_role_grants VALUES('g','z');
    INSERT INTO collaborator_journeys VALUES('j','m'); INSERT INTO ledger_entries VALUES('l','t'); INSERT INTO work_periods VALUES('w','t');
    '''); con.commit(); con.close()

def fake_ssh(path):
    path.write_text(r'''#!/usr/bin/env python3
import os, subprocess, sys
args=sys.argv[1:]; i=0
while i < len(args):
    if args[i] in ('-i','-p','-o'): i+=2
    else: break
if i>=len(args): sys.exit(2)
target=args[i]; cmd=' '.join(args[i+1:])
root=os.environ['FAKE_SSH_ROOT']; prefix=os.environ.get('FAKE_SSH_PREFIX','/srv/ers-backups')
cmd=cmd.replace(prefix,root)
p=subprocess.run(['bash','-c',cmd],stdin=sys.stdin.buffer,stdout=sys.stdout.buffer,stderr=sys.stderr.buffer)
sys.exit(p.returncode)
'''); path.chmod(0o755)

def env_file(path,identity,known,enabled='true',app_env='production'):
    path.write_text(f'''APP_ENV={app_env}\nSERVER_OFFHOST_BACKUP_ENABLED={enabled}\nSERVER_OFFHOST_BACKUP_HOST=backup.example.test\nSERVER_OFFHOST_BACKUP_USER=ers-backup\nSERVER_OFFHOST_BACKUP_DIRECTORY=/srv/ers-backups\nSERVER_OFFHOST_BACKUP_PORT=22\nSERVER_OFFHOST_BACKUP_IDENTITY_FILE={identity}\nSERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE={known}\n''')

def test_round_trip():
    with tempfile.TemporaryDirectory(prefix='ers-333-') as td:
        r=Path(td); b=r/'app-20261003T120000Z.db'; make_db(b)
        m=Path(str(b)+'.manifest.json'); payload=BACKUP.build_manifest(backup=b,environment='production',source_container='ers-prd-backend',source_database_path='/app/data/app.db',created_at=BACKUP.parse_utc('2026-10-03T12:00:00Z')); BACKUP.write_json_atomic(m,payload)
        identity=r/'id'; known=r/'known'; identity.write_text('key'); known.write_text('host')
        cfg=r/'.env.production'; env_file(cfg,identity,known)
        binp=r/'bin'; binp.mkdir(); fake_ssh(binp/'ssh'); remote=r/'remote'; remote.mkdir()
        env={**os.environ,'PATH':f'{binp}:{os.environ.get("PATH","")}','FAKE_SSH_ROOT':str(remote),'FAKE_SSH_PREFIX':'/srv/ers-backups'}
        p=run([str(SCRIPT),'replicate','--environment','production','--env-file',str(cfg),'--backup',str(b)],env); ok(p,'replicate')
        receipt=Path(str(b)+'.offhost.json')
        if not receipt.is_file(): raise AssertionError('local off-host receipt missing')
        final=remote/'production'/b.name
        for f in (final/b.name, final/m.name, final/(b.name+'.offhost.json')):
            if not f.is_file(): raise AssertionError(f'missing remote artifact {f}')
        if BACKUP.sha256_file(final/b.name)!=payload['backup']['sha256']: raise AssertionError('remote checksum mismatch')
        p=run([str(SCRIPT),'verify-replica','--environment','production','--env-file',str(cfg),'--receipt',str(receipt)],env); ok(p,'verify replica')
        with (final/b.name).open('ab') as h: h.write(b'tamper')
        p=run([str(SCRIPT),'verify-replica','--environment','production','--env-file',str(cfg),'--receipt',str(receipt)],env); bad(p,'tampered remote','mismatch')

def test_config_and_contract():
    with tempfile.TemporaryDirectory(prefix='ers-333-config-') as td:
        r=Path(td); identity=r/'id'; known=r/'known'; identity.write_text('x'); known.write_text('x')
        prod=r/'prod.env'; env_file(prod,identity,known,enabled='false')
        p=run([str(SCRIPT),'status','--environment','production','--env-file',str(prod)]); bad(p,'production disabled','requires SERVER_OFFHOST_BACKUP_ENABLED=true')
        dev=r/'dev.env'; env_file(dev,identity,known,enabled='false',app_env='development')
        p=run([str(SCRIPT),'status','--environment','development','--env-file',str(dev)]); ok(p,'development disabled status')
        if p.stdout.strip()!='disabled': raise AssertionError(p.stdout)
        loopback=r/'loopback.env'; env_file(loopback,identity,known,enabled='true')
        text=loopback.read_text().replace('SERVER_OFFHOST_BACKUP_HOST=backup.example.test','SERVER_OFFHOST_BACKUP_HOST=127.0.0.1')
        loopback.write_text(text)
        p=run([str(SCRIPT),'check-config','--environment','production','--env-file',str(loopback)])
        bad(p,'loopback off-host destination','distinct non-loopback host')

def test_repository_contract():
    make=(ROOT/'Makefile').read_text(); guard=(ROOT/'scripts'/'ers-environment-guard.sh').read_text(); ci=(ROOT/'.github/workflows/ci.yml').read_text(); deploy=(ROOT/'.github/workflows/deploy.yml').read_text(); init=(ROOT/'scripts/init-server-env.sh').read_text(); prod=(ROOT/'backend/.env.production.example').read_text()
    for frag in ('server-offhost-backup:','server-offhost-backup-verify:','BACKUP_RESULT_FILE="$$result_file"','scripts/ers-offhost-backup.py status','off-host-backup-protection-check'):
        if frag not in make: raise AssertionError(f'Makefile missing {frag}')
    for frag in ('SERVER_OFFHOST_BACKUP_ENABLED must be true','SERVER_OFFHOST_BACKUP_HOST','SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE'):
        if frag not in guard: raise AssertionError(f'guard missing {frag}')
    if 'make off-host-backup-protection-check' not in ci or 'make off-host-backup-protection-check' not in deploy: raise AssertionError('CI/deploy missing 33.3 regression')
    if 'SERVER_OFFHOST_BACKUP_ENABLED" "true"' not in init: raise AssertionError('production initializer missing off-host requirement')
    if 'SERVER_OFFHOST_BACKUP_ENABLED=true' not in prod: raise AssertionError('production example missing off-host requirement')

def main():
    test_round_trip(); test_config_and_contract(); test_repository_contract(); print('Bite 33.3 off-host backup protection verified.'); return 0
if __name__=='__main__': raise SystemExit(main())
