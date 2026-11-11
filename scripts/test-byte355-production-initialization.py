#!/usr/bin/env python3
"""Bite 35.5 offline rehearsal. NEVER accesses a configured/operational database."""
from __future__ import annotations
import csv
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT/'backend/migrations'
TOOL = ROOT/'scripts/ers-byte355-opening-balance.py'
HEAD = '000080_production_opening_balance.up.sql'


def run(cmd, **kwargs):
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)


def migrated(db, *, include_opening=True):
    with sqlite3.connect(db) as cx:
        for file in sorted(MIGRATIONS.glob('*.up.sql')):
            if not include_opening and file.name == HEAD:
                continue
            cx.executescript(file.read_text())
            cx.execute('CREATE TABLE IF NOT EXISTS schema_migrations(filename TEXT PRIMARY KEY,applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
            cx.execute('INSERT OR IGNORE INTO schema_migrations(filename) VALUES (?)', (file.name,))
        cx.commit()
        assert cx.execute('PRAGMA foreign_key_check').fetchall() == []
        assert cx.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert cx.execute('SELECT COUNT(*) FROM schema_migrations WHERE filename=?',(HEAD,)).fetchone()[0] == int(include_opening)


def fixture(db):
    with sqlite3.connect(db) as c:
        c.execute("INSERT INTO tenants(id,code,name,active,created_at,updated_at) VALUES ('test-355','TEST355','Fictitious Test 35.5',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
        for ident, code, typ in [('ref355-brl','BRL','value_unit'),('ref355-gold','GOLD_GRAM','value_unit'),('ref355-person','ACTIVE','person_status'),('ref355-collab','ACTIVE','collaborator_status'),('ref355-method','FIXED_BRL','method'),('ref355-sector','WORK','sector'),('ref355-location','SITE','location'),('ref355-task','TASK','task')]:
            c.execute('''INSERT INTO reference_data(id,tenant_id,type,code,label,sort_order,active,created_at,updated_at)
                         VALUES (?,?,?,?,?,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)''', (ident,'test-355',typ,code,code+' 35.5'))
        c.execute('''INSERT INTO global_people
           (id,first_name,last_name,nickname,cpf,rg,cellular,email,country,created_at,updated_at)
           VALUES ('person-355','Person','Test','P35','35500000000','RG355','550000000','355@example.test','Brasil',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)''')
        c.execute('''INSERT INTO person_tenant_memberships(id,created_at,updated_at,tenant_id,person_id,status_id)
           VALUES ('membership-355',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'test-355','person-355','ref355-person')''')
        c.execute('''INSERT INTO collaborator_journeys
          (id,created_at,updated_at,tenant_id,journey_start_date,default_end_date,extension_days,projected_end_date,
           payment_method_id,payment_value,sector_id,location_id,task_id,status_id,membership_id)
          VALUES ('journey-355',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'test-355','2026-01-01','2026-12-31',0,
           '2026-12-31','ref355-method',0,'ref355-sector','ref355-location','ref355-task','ref355-collab','membership-355')''')
        c.commit()


def args(d, db, approval, environment='test', action='plan', **overrides):
    a = ['python3', str(TOOL), action, '--db',str(db),'--csv',str(d/'opening.csv'),
         '--approval',str(approval),'--signature',str(d/'approval.sig'),
         '--public-key',str(d/'approval.pub.pem'),'--backup',str(d/'backup.db'),
         '--backup-manifest',str(d/'backup.db.manifest.json'), '--environment',environment,
         '--tenant-id','test-355','--operator','operator-355',
         '--approved-public-key-sha256',hashlib.sha256((d/'approval.pub.pem').read_bytes()).hexdigest()]
    if action=='apply':
        a += ['--confirm',f'APPLY-OPENING-BALANCES-{environment.upper()}', '--writers-stopped','ALL_DATABASE_WRITERS_STOPPED']
    return a

def t09_independent_negative_cases(directory, pristine_db, signed_approval, signing_key, public_key):
    """Exercise each refusal against a new, independently valid disposable fixture.

    Do not reuse a database with an already-broken backup or approval for a
    different failure assertion: it can mask the very guard being tested.
    """
    cases_dir = directory/'t09-isolated'
    cases_dir.mkdir()
    base_env = dict(os.environ, APP_ENV='test', ENV='test', DEPLOY_ENV='test')
    case_number = 0

    def pass_case(title):
        nonlocal case_number
        case_number += 1
        print(f'PASS T09-{case_number:02d}: {title}', flush=True)

    def new_case(name):
        case = cases_dir/name
        case.mkdir()
        database = case/'app.db'
        shutil.copy2(pristine_db, database)
        with sqlite3.connect(pristine_db) as src, sqlite3.connect(case/'backup.db') as dst:
            src.backup(dst)
        shutil.copy2(directory/'opening.csv', case/'opening.csv')
        shutil.copy2(public_key, case/'approval.pub.pem')
        backup_blob = (case/'backup.db').read_bytes()
        manifest = {
            'format_version': 1, 'status': 'verified', 'environment': 'test',
            'repository': {'revision': 'a'*40, 'tree_sha': 'b'*40},
            'source': {'container': 'disposable-test', 'database_path': str(database)},
            'backup': {'file': 'backup.db', 'size_bytes': len(backup_blob),
                       'sha256': hashlib.sha256(backup_blob).hexdigest()},
            'verification': {'integrity_check': 'ok', 'foreign_key_check': 'ok'},
        }
        (case/'backup.db.manifest.json').write_text(json.dumps(manifest))
        approved = dict(signed_approval)
        approved['backup_manifest_sha256'] = hashlib.sha256(
            (case/'backup.db.manifest.json').read_bytes()).hexdigest()
        approved['csv_sha256'] = hashlib.sha256((case/'opening.csv').read_bytes()).hexdigest()
        (case/'approval.json').write_text(json.dumps(approved, sort_keys=True))
        sign(case)
        return case

    def sign(case):
        result = run(['openssl', 'dgst', '-sha256', '-sign', str(signing_key),
                      '-out', str(case/'approval.sig'), str(case/'approval.json')])
        assert result.returncode == 0, result.stderr

    def command(case, action='plan'):
        return args(case, case/'app.db', case/'approval.json', action=action)

    def change_option(command_args, option, value):
        changed = list(command_args)
        index = changed.index(option)
        changed[index+1] = value
        return changed

    def omit_option(command_args, option):
        changed = list(command_args)
        index = changed.index(option)
        del changed[index:index+2]
        return changed

    def counts(database):
        with sqlite3.connect(database) as connection:
            result = (
                connection.execute("SELECT COUNT(*) FROM ledger_entries WHERE entry_type='OPENING_BALANCE'").fetchone()[0],
                connection.execute('SELECT COUNT(*) FROM production_opening_balance_imports').fetchone()[0],
            )
            assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert connection.execute('PRAGMA foreign_key_check').fetchall() == []
            return result

    def rejected(title, case, invocation, expected, *, environment=base_env, prior=(0, 0)):
        assert counts(case/'app.db') == prior, f'{title}: unexpected initial database state'
        result = run(invocation, env=environment)
        output = result.stderr + result.stdout
        assert result.returncode != 0, f'{title}: accepted unexpectedly: {output}'
        assert expected in output, f'{title}: expected rejection {expected!r}, got: {output}'
        assert counts(case/'app.db') == prior, f'{title}: failed attempt wrote opening data'
        pass_case(title)

    case = new_case('environment')
    rejected('APP_ENV mismatch', case, command(case),
             'APP_ENV must explicitly match', environment=dict(base_env, APP_ENV='production'))

    case = new_case('target')
    rejected('wrong target (backup.db)', case,
             change_option(command(case), '--db', str(case/'backup.db')),
             'target must be the existing app.db')

    case = new_case('backup-source')
    manifest_file = case/'backup.db.manifest.json'
    manifest = json.loads(manifest_file.read_text())
    manifest['source']['database_path'] = str(case/'not-the-database.db')
    manifest_file.write_text(json.dumps(manifest))
    approved = json.loads((case/'approval.json').read_text())
    approved['backup_manifest_sha256'] = hashlib.sha256(manifest_file.read_bytes()).hexdigest()
    (case/'approval.json').write_text(json.dumps(approved, sort_keys=True))
    sign(case)
    rejected('wrong backup source with valid signature', case, command(case),
             'verified backup manifest metadata/checksum/environment mismatch')

    case = new_case('csv-tamper')
    csv_file = case/'opening.csv'
    csv_file.write_bytes(csv_file.read_bytes().replace(b'125.50', b'175.50'))
    rejected('changed CSV rejected', case, command(case), 'approval csv_sha256 mismatch')

    case = new_case('approval-tamper')
    approval_file = case/'approval.json'
    tampered = json.loads(approval_file.read_text())
    tampered['approval_reference'] = 'TAMPERED-APPROVAL'
    approval_file.write_text(json.dumps(tampered, sort_keys=True))
    rejected('changed approval rejected by signature', case, command(case),
             'cryptographic approval signature verification failed')

    case = new_case('signature-tamper')
    signature_file = case/'approval.sig'
    signature = bytearray(signature_file.read_bytes())
    signature[0] ^= 1
    signature_file.write_bytes(signature)
    rejected('corrupted signature rejected', case, command(case),
             'cryptographic approval signature verification failed')

    case = new_case('fingerprint')
    rejected('public-key fingerprint mismatch', case,
             change_option(command(case), '--approved-public-key-sha256', '0'*64),
             'signing public-key fingerprint differs')

    case = new_case('same-human')
    approved = json.loads((case/'approval.json').read_text())
    approved['approved_by'] = approved['executed_by']
    (case/'approval.json').write_text(json.dumps(approved, sort_keys=True))
    sign(case)
    rejected('same approved_by and executed_by (valid signature)', case,
             command(case), 'named independent approver and operator are required')

    case = new_case('no-confirm')
    rejected('missing apply confirmation', case,
             omit_option(command(case, 'apply'), '--confirm'),
             'exact apply confirmation required')

    case = new_case('wrong-confirm')
    rejected('incorrect apply confirmation', case,
             change_option(command(case, 'apply'), '--confirm', 'WRONG'),
             'exact apply confirmation required')

    case = new_case('writers')
    rejected('missing writer-isolation confirmation', case,
             omit_option(command(case, 'apply'), '--writers-stopped'),
             'database writer-isolation confirmation required')

    case = new_case('duplicate')
    first = run(command(case, 'apply'), env=base_env)
    assert first.returncode == 0, first.stdout+first.stderr
    assert counts(case/'app.db') == (2, 1), 'initial signed import did not post exactly two positions'
    rejected('duplicate apply rejected', case, command(case, 'apply'),
             'CSV checksum already imported', prior=(2, 1))
    rejected('duplicate plan rejected', case, command(case, 'plan'),
             'CSV checksum already imported', prior=(2, 1))

    return case_number


def main():
    with tempfile.TemporaryDirectory(prefix='ers-byte355-rehearsal-') as td:
        d = Path(td).resolve(strict=True)
        # Verify that large backup files can be SHA-256 checked without relying
        # on hashlib.file_digest (not present on the macOS Python 3.9 runtime).
        sample = d/'digest-sample.bin'
        payload = b'35.5' * 350_000  # Cross the 1 MiB streaming-read boundary.
        sample.write_bytes(payload)
        spec = importlib.util.spec_from_file_location('byte355_opening', TOOL)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with mock.patch.object(hashlib, 'file_digest', None, create=True):
            assert module.file_digest(sample) == hashlib.sha256(payload).hexdigest()
            empty = d/'empty-backup.bin'
            empty.write_bytes(b'')
            assert module.file_digest(empty) == hashlib.sha256(b'').hexdigest()
        db = d/'app.db'
        migrated(db); fixture(db)
        # Independent SQL migration on an *already populated* pre-35.5 schema.
        migration_db = d/'migration'/'app.db'
        migration_db.parent.mkdir()
        migrated(migration_db, include_opening=False)
        fixture(migration_db)
        with sqlite3.connect(migration_db) as c:
            c.execute('''INSERT INTO ledger_entries
                (id,created_at,updated_at,tenant_id,collaborator_id,value_unit_id,
                 entry_type,direction,amount,effective_date,source_type,source_id,person_id)
                VALUES ('pre-355-ledger',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'test-355','journey-355',
                        'ref355-brl','EARNING_CREDIT','CREDIT',22.50,'2026-01-02','EXISTING','pre-355-source','person-355')''')
            before_tables = c.execute('SELECT COUNT(*) FROM ledger_entries').fetchone()[0]
            before_triggers = set(r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='trigger'"))
            before_indexes = set(r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"))
            c.commit()
            c.executescript((MIGRATIONS/HEAD).read_text())
            assert c.execute('SELECT COUNT(*) FROM ledger_entries').fetchone()[0] == before_tables
            assert c.execute("SELECT amount FROM ledger_entries WHERE id='pre-355-ledger'").fetchone()[0] == 22.5
            assert before_triggers.issubset({r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='trigger'")})
            assert before_indexes.issubset({r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")})
            assert c.execute('PRAGMA foreign_key_check').fetchall() == []
            assert c.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        # SQL boundary must reject out-of-band opening entries lacking an
        # authorized, immutable import batch (without touching a live DB).
        with sqlite3.connect(db) as c:
            try:
                c.execute('''INSERT INTO ledger_entries
                  (id,created_at,updated_at,tenant_id,collaborator_id,value_unit_id,
                   entry_type,direction,amount,effective_date,source_type,source_id,person_id)
                  VALUES ('unapproved-355',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'test-355',
                    'journey-355','ref355-brl','OPENING_BALANCE','CREDIT',1,'2026-01-01',
                    'OPENING_BALANCE','unsigned:1','person-355')''')
                raise AssertionError('unsigned direct opening ledger insert unexpectedly accepted')
            except sqlite3.IntegrityError as exc:
                assert 'opening_balance_import_required' in str(exc), str(exc)
            assert c.execute("SELECT COUNT(*) FROM ledger_entries WHERE entry_type='OPENING_BALANCE'").fetchone()[0] == 0
            assert c.execute('SELECT COUNT(*) FROM production_opening_balance_imports').fetchone()[0] == 0
        seed_snapshot = db.stat().st_size
        rows=[{'tenant_id':'test-355','journey_id':'journey-355','person_id':'person-355','value_unit_code':'BRL',
               'signed_amount':'125.50','effective_date':'2026-01-01','reference':'APPROVED-355-BRL'},
              {'tenant_id':'test-355','journey_id':'journey-355','person_id':'person-355','value_unit_code':'GOLD_GRAM',
               'signed_amount':'-0.75000000','effective_date':'2026-01-01','reference':'APPROVED-355-GOLD'}]
        with (d/'opening.csv').open('w', newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
        with sqlite3.connect(db) as original, sqlite3.connect(d/'backup.db') as backup:
            original.backup(backup)
        blob=(d/'backup.db').read_bytes()
        manifest={'format_version':1,'status':'verified','environment':'test','repository':{'revision':'a'*40,'tree_sha':'b'*40},
                  'source':{'container':'test-container','database_path':str(db)},
                  'backup':{'file':'backup.db','size_bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()},
                  'verification':{'integrity_check':'ok','foreign_key_check':'ok'}}
        (d/'backup.db.manifest.json').write_text(json.dumps(manifest))
        approval = {'schema_version':1,'environment':'test','tenant_id':'test-355',
                    'csv_sha256':hashlib.sha256((d/'opening.csv').read_bytes()).hexdigest(),
                    'backup_manifest_sha256':hashlib.sha256((d/'backup.db.manifest.json').read_bytes()).hexdigest(),
                    'offhost_receipt_sha256':'','approval_reference':'APPROVAL-355-TEST',
                    'approved_by':'approver-355','executed_by':'operator-355', 'row_count':2,
                    'net_brl':'125.50','net_gold_gram':'-0.75000000'}
        approvalfile=d/'approval.json'
        key=d/'approval.key';pub=d/'approval.pub.pem'
        for cmd in (["openssl","genpkey","-algorithm","RSA","-pkeyopt","rsa_keygen_bits:2048","-out",str(key)],
                    ["openssl","pkey","-in",str(key),"-pubout","-out",str(pub)]):
            r=run(cmd); assert r.returncode==0, r.stderr
        approval['approval_key_sha256']=hashlib.sha256(pub.read_bytes()).hexdigest()
        approvalfile.write_text(json.dumps(approval,sort_keys=True))
        r=run(['openssl','dgst','-sha256','-sign',str(key),'-out',str(d/'approval.sig'),str(approvalfile)])
        assert r.returncode==0, r.stderr
        # Each negative case starts with its own valid, signed Test fixture.
        isolated_cases = t09_independent_negative_cases(d, db, approval, key, pub)
        result_count = isolated_cases
        def passed(title):
            nonlocal result_count
            result_count += 1
            print(f'PASS T09-{result_count:02d}: {title}', flush=True)

        # The pre-35.5 migration test above also checked this original ledger
        # entry, existing indexes/triggers, SQLite integrity, and foreign keys.
        passed('preexisting ledger and migration structures preserved')
        env = dict(os.environ, APP_ENV='test', ENV='test', DEPLOY_ENV='test')
        def call(action='plan', approval=approvalfile, env_=env):
            return run(args(d,db,approval,action=action),env=env_)
        r=call();assert r.returncode==0, r.stderr+r.stdout
        with sqlite3.connect(db) as c:
            assert c.execute("SELECT COUNT(*) FROM ledger_entries WHERE entry_type='OPENING_BALANCE'").fetchone()[0]==0
            assert c.execute('SELECT COUNT(*) FROM production_opening_balance_imports').fetchone()[0]==0
        passed('valid signature accepted by read-only plan (zero writes)')
        # Retain the original smoke check; the isolated T09-09 test additionally
        # asserts the exact rejection reason and no database mutation.
        assert run(args(d,db,approvalfile,action='apply')[:-4],env=env).returncode != 0, 'missing confirmation accepted'
        r=call('apply');assert r.returncode==0, r.stderr+r.stdout
        print(r.stdout.strip())
        with sqlite3.connect(db) as c:
            assert c.execute("SELECT COUNT(*) FROM ledger_entries WHERE entry_type='OPENING_BALANCE'").fetchone()[0]==2
            assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert c.execute('PRAGMA foreign_key_check').fetchall()==[]
            assert c.execute("SELECT COUNT(*) FROM production_opening_balance_imports").fetchone()[0]==1
        passed('valid signed apply posts one immutable audit and both signed directions')
        def sql_rejected(title, statement, expected):
            with sqlite3.connect(db) as c:
                before = (c.execute("SELECT COUNT(*) FROM ledger_entries WHERE entry_type='OPENING_BALANCE'").fetchone()[0],
                          c.execute('SELECT COUNT(*) FROM production_opening_balance_imports').fetchone()[0])
                try:
                    c.execute(statement)
                except sqlite3.IntegrityError as exc:
                    assert expected in str(exc), f'{title}: wrong SQL rejection: {exc}'
                else:
                    raise AssertionError(f'{title}: mutation was accepted')
                after = (c.execute("SELECT COUNT(*) FROM ledger_entries WHERE entry_type='OPENING_BALANCE'").fetchone()[0],
                         c.execute('SELECT COUNT(*) FROM production_opening_balance_imports').fetchone()[0])
                assert before == after == (2, 1), f'{title}: opening records changed'
            passed(title)

        sql_rejected('opening ledger UPDATE prohibited',
                     "UPDATE ledger_entries SET amount=10 WHERE entry_type='OPENING_BALANCE'",
                     'opening_balance_immutable')
        sql_rejected('opening ledger DELETE prohibited',
                     "DELETE FROM ledger_entries WHERE entry_type='OPENING_BALANCE'",
                     'opening_balance_immutable')
        sql_rejected('import audit UPDATE prohibited',
                     "UPDATE production_opening_balance_imports SET expected_rows=10",
                     'opening_balance_import_immutable')
        sql_rejected('import audit DELETE prohibited',
                     'DELETE FROM production_opening_balance_imports',
                     'opening_balance_import_immutable')
        verify_result = call('verify')
        assert verify_result.returncode==0, verify_result.stderr+verify_result.stdout
        with sqlite3.connect(db) as c:
            assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert c.execute('PRAGMA foreign_key_check').fetchall()==[]
        passed('read-only verify reconciles both units and SQLite integrity')
        # The earlier SQL test rejected unsigned out-of-band inserts by the
        # exact opening_balance_import_required trigger, before any import.
        passed('unauthorized direct SQL opening entry rejected')
        # Changing the signed approval or CSV requires a new independent signature.
        key_mismatch = run(args(d,db,approvalfile,action='verify')[:-2] +
                           ['--approved-public-key-sha256', '0'*64], env=env)
        assert key_mismatch.returncode != 0, 'unapproved key fingerprint was accepted'
        assert call('apply').returncode!=0, 'duplicate import was accepted'
        assert call('plan').returncode!=0, 'duplicate plan should stop'
        # Test transaction rollback after inserting audit row and first ledger row.
        # This trigger belongs to a disposable test database; never install live.
        rollback_db = d/'rollback'/'app.db';rollback_db.parent.mkdir()
        shutil.copy2(d/'backup.db', rollback_db)
        rollback_manifest = json.loads((d/'backup.db.manifest.json').read_text())
        rollback_manifest['source']['database_path'] = str(rollback_db)
        (d/'backup.db.manifest.json').write_text(json.dumps(rollback_manifest))
        rollback_approval = dict(approval, backup_manifest_sha256=hashlib.sha256((d/'backup.db.manifest.json').read_bytes()).hexdigest())
        rollback_file = d/'rollback-approval.json';rollback_file.write_text(json.dumps(rollback_approval,sort_keys=True))
        r=run(['openssl','dgst','-sha256','-sign',str(key),'-out',str(d/'approval.sig'),str(rollback_file)])
        assert r.returncode==0, r.stderr
        with sqlite3.connect(rollback_db) as c:
            c.executescript('''CREATE TRIGGER byte355_test_forced_failure BEFORE INSERT ON ledger_entries
                WHEN NEW.entry_type='OPENING_BALANCE' AND NEW.source_id LIKE '%:2'
                BEGIN SELECT RAISE(ABORT, 'forced_test_failure'); END;''')
        failed = run(args(d,rollback_db,rollback_file,action='apply'),env=env)
        assert failed.returncode != 0, 'test trigger should reject the second entry'
        assert 'forced_test_failure' in failed.stderr+failed.stdout, 'wrong failure masked rollback test'
        with sqlite3.connect(rollback_db) as c:
            assert c.execute("SELECT COUNT(*) FROM ledger_entries WHERE entry_type='OPENING_BALANCE'").fetchone()[0]==0
            assert c.execute('SELECT COUNT(*) FROM production_opening_balance_imports').fetchone()[0]==0
            assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert c.execute('PRAGMA foreign_key_check').fetchall()==[]
        passed('forced second-row failure rolls back audit and both ledger rows')
        assert db.stat().st_size >= seed_snapshot
    print(f'RESULT: Byte 35.5 T09 {result_count} PASS / 0 FAIL; all fixtures disposable; no deployed database touched.')
    print('PASS: Byte 35.5 offline signed import, two-direction ledger, rollback, duplicate and tamper guards.')

if __name__=='__main__':main()
