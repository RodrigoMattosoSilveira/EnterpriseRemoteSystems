#!/usr/bin/env python3
"""Regression coverage for Bite 33.3 after the Production off-host Go cutover."""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def run(cmd, env=None, cwd=ROOT, timeout=180):
    return subprocess.run(cmd, cwd=cwd, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False, timeout=timeout)


def ok(proc, context):
    if proc.returncode != 0:
        raise AssertionError(f"{context} failed ({proc.returncode}):\n{proc.stdout}")


def bad(proc, context, needle):
    if proc.returncode == 0 or needle not in proc.stdout:
        raise AssertionError(f"{context} did not fail with {needle!r}:\n{proc.stdout}")


def build_tools(root: Path) -> tuple[Path, Path]:
    bindir = root / "bin"; bindir.mkdir()
    backup = bindir / "ers-backup"; offhost = bindir / "ers-offhost-backup"
    for path, package in ((backup, "./cmd/ers-backup"), (offhost, "./cmd/ers-offhost-backup")):
        proc = run(["go", "build", "-o", str(path), package], cwd=BACKEND)
        ok(proc, f"build {package}")
    return backup, offhost


def make_db(path: Path):
    con = sqlite3.connect(path)
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


def fake_ssh(path: Path):
    path.write_text(r'''#!/usr/bin/env python3
import os, subprocess, sys
args=sys.argv[1:]; i=0
while i < len(args):
    if args[i] in ('-i','-p','-o'): i+=2
    else: break
if i>=len(args): sys.exit(2)
cmd=' '.join(args[i+1:]); root=os.environ['FAKE_SSH_ROOT']; prefix=os.environ.get('FAKE_SSH_PREFIX','/srv/ers-backups')
cmd=cmd.replace(prefix,root)
p=subprocess.run(['bash','-c',cmd],stdin=sys.stdin.buffer,stdout=sys.stdout.buffer,stderr=sys.stderr.buffer)
sys.exit(p.returncode)
'''); path.chmod(0o755)


def env_file(path, identity, known, enabled='true', app_env='production'):
    path.write_text(f'''APP_ENV={app_env}\nSERVER_OFFHOST_BACKUP_ENABLED={enabled}\nSERVER_OFFHOST_BACKUP_HOST=backup.example.test\nSERVER_OFFHOST_BACKUP_USER=ers-backup\nSERVER_OFFHOST_BACKUP_DIRECTORY=/srv/ers-backups\nSERVER_OFFHOST_BACKUP_PORT=22\nSERVER_OFFHOST_BACKUP_IDENTITY_FILE={identity}\nSERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE={known}\n''')


def test_round_trip(backup_tool: Path, offhost_tool: Path):
    with tempfile.TemporaryDirectory(prefix='ers-333-') as td:
        root=Path(td); b=root/'app-20261003T120000Z.db'; make_db(b); m=Path(str(b)+'.manifest.json')
        p=run([str(backup_tool),'create-manifest','--backup',str(b),'--manifest',str(m),'--environment','production','--source-container','ers-prd-backend','--source-database-path','/app/data/app.db','--created-at','2026-10-03T12:00:00Z']); ok(p,'create manifest')
        payload=json.loads(m.read_text())
        identity=root/'id'; known=root/'known'; identity.write_text('key'); known.write_text('host')
        cfg=root/'.env.production'; env_file(cfg,identity,known)
        binp=root/'fakebin'; binp.mkdir(); fake_ssh(binp/'ssh'); remote=root/'remote'; remote.mkdir()
        env={**os.environ,'PATH':f'{binp}:{os.environ.get("PATH","")}','FAKE_SSH_ROOT':str(remote),'FAKE_SSH_PREFIX':'/srv/ers-backups'}
        p=run([str(offhost_tool),'replicate','--environment','production','--env-file',str(cfg),'--backup',str(b)],env); ok(p,'replicate')
        receipt=Path(str(b)+'.offhost.json')
        if not receipt.is_file(): raise AssertionError('local off-host receipt missing')
        final=remote/'production'/b.name
        for f in (final/b.name, final/m.name, final/(b.name+'.offhost.json')):
            if not f.is_file(): raise AssertionError(f'missing remote artifact {f}')
        if json.loads(receipt.read_text())['transport'] != 'ssh': raise AssertionError('receipt transport changed')
        p=run([str(offhost_tool),'verify-replica','--environment','production','--env-file',str(cfg),'--receipt',str(receipt)],env); ok(p,'verify replica')
        with (final/b.name).open('ab') as h: h.write(b'tamper')
        p=run([str(offhost_tool),'verify-replica','--environment','production','--env-file',str(cfg),'--receipt',str(receipt)],env); bad(p,'tampered remote','mismatch')
        if payload['backup']['sha256'] == '': raise AssertionError('manifest SHA evidence missing')


def test_config(offhost_tool: Path):
    with tempfile.TemporaryDirectory(prefix='ers-333-config-') as td:
        root=Path(td); identity=root/'id'; known=root/'known'; identity.write_text('x'); known.write_text('x')
        prod=root/'prod.env'; env_file(prod,identity,known,enabled='false')
        bad(run([str(offhost_tool),'status','--environment','production','--env-file',str(prod)]),'production disabled','requires SERVER_OFFHOST_BACKUP_ENABLED=true')
        dev=root/'dev.env'; env_file(dev,identity,known,enabled='false',app_env='development')
        p=run([str(offhost_tool),'status','--environment','development','--env-file',str(dev)]); ok(p,'development disabled status')
        if p.stdout.strip()!='disabled': raise AssertionError(p.stdout)
        loopback=root/'loopback.env'; env_file(loopback,identity,known); loopback.write_text(loopback.read_text().replace('backup.example.test','127.0.0.1'))
        bad(run([str(offhost_tool),'check-config','--environment','production','--env-file',str(loopback)]),'loopback','distinct non-loopback host')


def test_repository_contract():
    make=(ROOT/'Makefile').read_text(); docker=(BACKEND/'Dockerfile').read_text(); guard=(ROOT/'scripts'/'ers-environment-guard.sh').read_text(); ci=(ROOT/'.github/workflows/ci.yml').read_text(); deploy=(ROOT/'.github/workflows/deploy.yml').read_text()
    for frag in ('server-offhost-backup:','server-offhost-backup-verify:','run-backup-go-tool.sh ers-offhost-backup status','run-backup-go-tool.sh ers-offhost-backup replicate','off-host-backup-protection-check'):
        if frag not in make: raise AssertionError(f'Makefile missing {frag}')
    if 'python3 scripts/ers-offhost-backup.py' in make or (ROOT/'scripts'/'ers-offhost-backup.py').exists(): raise AssertionError('Production off-host Python implementation still exists')
    for frag in ('go build -o /out/ers-offhost-backup ./cmd/ers-offhost-backup','COPY --from=builder /out/ers-offhost-backup /app/ers-offhost-backup','openssh-client'):
        if frag not in docker: raise AssertionError(f'backend image missing {frag}')
    for frag in ('SERVER_OFFHOST_BACKUP_ENABLED must be true','SERVER_OFFHOST_BACKUP_HOST','SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE'):
        if frag not in guard: raise AssertionError(f'guard missing {frag}')
    if 'make off-host-backup-protection-check' not in ci or 'make off-host-backup-protection-check' not in deploy: raise AssertionError('CI/deploy missing 33.3 regression')


def main():
    with tempfile.TemporaryDirectory(prefix='ers-333-go-tools-') as td:
        backup_tool, offhost_tool = build_tools(Path(td))
        test_round_trip(backup_tool, offhost_tool); test_config(offhost_tool)
    test_repository_contract(); print('Bite 33.3 off-host backup protection verified with Go Production tooling.'); return 0

if __name__=='__main__': raise SystemExit(main())
