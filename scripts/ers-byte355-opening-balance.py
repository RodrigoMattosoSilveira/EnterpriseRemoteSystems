#!/usr/bin/env python3
"""Byte 35.5: signed, one-time historical opening balances, offline only.

The command never creates/migrates/resets a database, provisions accounts, or
starts a server. Test/Production execution requires stopped database writers,
verified backup evidence, and a signed human approval bound to the exact CSV.
"""
from __future__ import annotations

import argparse
import csv
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys

MIGRATION = '000080_production_opening_balance.up.sql'
HEADERS = ['tenant_id', 'journey_id', 'person_id', 'value_unit_code', 'signed_amount', 'effective_date', 'reference']
REQUIRED_APPROVAL = {'schema_version', 'environment', 'tenant_id', 'csv_sha256',
                     'backup_manifest_sha256', 'offhost_receipt_sha256',
                     'approval_reference', 'approved_by', 'executed_by', 'approval_key_sha256', 'row_count',
                     'net_brl', 'net_gold_gram'}
SHA256 = re.compile(r'^[0-9a-f]{64}$')
IDENTIFIER = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:@/-]{2,127}$')
AMOUNT = re.compile(r'^-?(?:0|[1-9]\d*)(?:\.\d+)?$')


def stop(reason: str):
    raise ValueError('STOP: ' + reason)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def checked_path(path: Path, label: str) -> Path:
    p = path.expanduser().absolute()
    if not p.is_file() or p.is_symlink() or p != p.resolve(strict=True):
        stop(f'{label} must be an existing regular file without symbolic-link components')
    return p


def checked_file(path: Path, label: str) -> bytes:
    p = checked_path(path, label)
    if p.stat().st_size > 4_000_000:
        stop(f'{label} exceeds the 4 MB approval/input size limit')
    return p.read_bytes()


def file_digest(path: Path) -> str:
    # hashlib.file_digest was introduced in Python 3.11; macOS may ship older Python.
    sha256 = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def money(value: object, unit: str) -> Decimal:
    s = str(value)
    if not AMOUNT.fullmatch(s):
        stop(f'invalid {unit} amount format')
    try:
        v = Decimal(s)
    except InvalidOperation:
        stop(f'invalid {unit} amount')
    precision = Decimal('0.01' if unit == 'BRL' else '0.00000001')
    if not v.is_finite() or v != v.quantize(precision) or abs(v) > Decimal('999999999'):
        stop(f'{unit} amount violates range or precision')
    return v


def load_rows(blob: bytes, tenant: str):
    try:
        raw = blob.decode('utf-8-sig')
    except UnicodeDecodeError:
        stop('CSV is not UTF-8')
    from io import StringIO
    reader = csv.DictReader(StringIO(raw, newline=''), strict=True)
    if reader.fieldnames != HEADERS:
        stop('CSV header differs from the documented seven-column contract')
    rows = []
    totals = {'BRL': Decimal('0'), 'GOLD_GRAM': Decimal('0')}
    seen = set()
    for number, row in enumerate(reader, start=2):
        if number > 50001:
            stop('CSV row limit exceeded (maximum 50,000 positions)')
        if None in row or any(value is None for value in row.values()):
            stop(f'CSV row {number} has extra or missing fields')
        if row['tenant_id'] != tenant:
            stop(f'CSV row {number} crosses the approved Entidade')
        if row['value_unit_code'] not in totals:
            stop(f'CSV row {number} has an unsupported unit')
        if not all(IDENTIFIER.fullmatch(row[k]) for k in ('tenant_id', 'journey_id', 'person_id', 'reference')):
            stop(f'CSV row {number} has an invalid identifier/reference')
        key = (row['journey_id'], row['value_unit_code'])
        if key in seen:
            stop(f'CSV row {number} duplicates an opening position')
        seen.add(key)
        v = money(row['signed_amount'], row['value_unit_code'])
        if not v:
            stop(f'CSV row {number} has zero opening balance; omit that row')
        try:
            d = date.fromisoformat(row['effective_date'])
            if d.isoformat() != row['effective_date']:
                raise ValueError()
        except ValueError:
            stop(f'CSV row {number} has an invalid ISO effective_date')
        if d > datetime.now(timezone.utc).date():
            stop(f'CSV row {number} has a future effective_date')
        totals[row['value_unit_code']] += v
        rows.append((row, v))
    if not rows:
        stop('CSV must contain at least one non-zero position')
    return rows, totals


def approval_check(approval_blob: bytes, signature: bytes, key_path: Path,
                   csv_hash: str, backup_hash: str, offhost_hash: str,
                   args: argparse.Namespace, rows, totals):
    try:
        approval = json.loads(approval_blob)
    except (UnicodeDecodeError, json.JSONDecodeError):
        stop('approval is not valid UTF-8 JSON')
    if not isinstance(approval, dict) or set(approval) != REQUIRED_APPROVAL:
        stop('approval JSON keys do not match the signed contract')
    if approval['schema_version'] != 1 or approval['environment'] != args.environment or approval['tenant_id'] != args.tenant_id:
        stop('approval environment/tenant/schema mismatch')
    for field, required in [('csv_sha256', csv_hash),
                            ('backup_manifest_sha256', backup_hash),
                            ('offhost_receipt_sha256', offhost_hash)]:
        if approval[field] != required:
            stop(f'approval {field} mismatch')
    if (approval['executed_by'] != args.operator or
        approval['approved_by'] == args.operator or
        not all(IDENTIFIER.fullmatch(str(approval[k])) for k in ('approved_by', 'executed_by', 'approval_reference'))):
        stop('named independent approver and operator are required')
    if approval['row_count'] != len(rows):
        stop('approval row count mismatch')
    for code, field in [('BRL', 'net_brl'), ('GOLD_GRAM', 'net_gold_gram')]:
        if not isinstance(approval[field], str) or money(approval[field], code) != totals[code]:
            stop(f'approval {field} mismatch')
    # OpenSSL RSA/ECDSA PEM signature verification: never request the private key.
    import tempfile
    key = checked_file(key_path, 'approval public key')
    if digest(key) != args.approved_public_key_sha256 or approval['approval_key_sha256'] != digest(key):
        stop('signing public-key fingerprint differs from approved 1Password key fingerprint')
    with tempfile.TemporaryDirectory(prefix='ers-355-verify-') as td:
        sig = Path(td)/'signature.bin'; msg = Path(td)/'approval.json'; pub=Path(td)/'public.pem'
        sig.write_bytes(signature); msg.write_bytes(approval_blob); pub.write_bytes(key)
        command = ['openssl', 'dgst', '-sha256', '-verify', str(pub), '-signature', str(sig), str(msg)]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired):
            stop('OpenSSL signature verification unavailable')
        if result.returncode != 0 or 'Verified OK' not in result.stdout:
            stop('cryptographic approval signature verification failed')
    return approval


def verify_backup(args):
    blob = checked_file(args.backup_manifest, 'backup manifest')
    try:
        manifest = json.loads(blob)
    except (UnicodeDecodeError, json.JSONDecodeError):
        stop('backup manifest is not JSON')
    b = manifest.get('backup', {})
    v = manifest.get('verification', {})
    backup_path = checked_path(args.backup, 'verified backup')
    actual_size = backup_path.stat().st_size
    actual_sha = file_digest(backup_path)
    if (manifest.get('format_version') != 1 or manifest.get('status') != 'verified'
        or manifest.get('environment') != args.environment
        or b.get('file') != backup_path.name
        or b.get('sha256') != actual_sha or b.get('size_bytes') != actual_size
        or v.get('integrity_check') != 'ok'
        or v.get('foreign_key_check') not in ('clean', 'ok')
        or not manifest.get('repository', {}).get('revision')
        or not manifest.get('repository', {}).get('tree_sha')
        or manifest.get('source', {}).get('database_path') != str(args.db.expanduser().absolute())):
        stop('verified backup manifest metadata/checksum/environment mismatch')
    # Verify the actual backup rather than trusting text in a manifest alone.
    with sqlite3.connect(f'file:{backup_path}?mode=ro', uri=True) as con:
        if con.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or con.execute('PRAGMA foreign_key_check').fetchone():
            stop('backup SQLite integrity or foreign-key check failed')
    offhost_hash = ''
    if args.offhost_receipt is not None:
        offhost_hash = digest(checked_file(args.offhost_receipt, 'off-host receipt'))
    if args.environment == 'production' and not offhost_hash:
        stop('Production requires verified off-host receipt evidence')
    return digest(blob), offhost_hash


def inspect_database(conn, rows, tenant, csv_hash):
    if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or conn.execute('PRAGMA foreign_key_check').fetchone():
        stop('database integrity or foreign keys not clean')
    if conn.execute('SELECT COUNT(*) FROM schema_migrations WHERE filename=?', (MIGRATION,)).fetchone()[0] != 1:
        stop('Byte 35.5 migration not installed via the guarded migration gate')
    if conn.execute('SELECT COUNT(*) FROM production_opening_balance_imports WHERE csv_sha256=?', (csv_hash,)).fetchone()[0]:
        stop('CSV checksum already imported; no duplicate or silent overwrite')
    if conn.execute('SELECT COUNT(*) FROM tenants WHERE id=? AND active=1', (tenant,)).fetchone()[0] != 1:
        stop('approved Entidade is not active or unique')
    prepared = []
    for row, v in rows:
        lookup = conn.execute('''SELECT j.id, m.person_id, j.closed_at
          FROM collaborator_journeys j
          JOIN person_tenant_memberships m ON m.id=j.membership_id AND m.tenant_id=j.tenant_id
          WHERE j.tenant_id=? AND j.id=?''', (tenant, row['journey_id'])).fetchone()
        if not lookup or lookup[1] != row['person_id'] or lookup[2] is not None:
            stop('Journey/membership/Person does not match the approved row or Journey is closed')
        if conn.execute('SELECT COUNT(*) FROM ledger_entries WHERE tenant_id=? AND collaborator_id=?',
                        (tenant, row['journey_id'])).fetchone()[0]:
            stop('Journey already has ledger history; opening must precede ordinary activity')
        unit = conn.execute('SELECT id FROM reference_data WHERE tenant_id=? AND type=? AND code=? AND active=1',
                            (tenant,'value_unit',row['value_unit_code'])).fetchall()
        if len(unit) != 1:
            stop('approved BRL/GOLD_GRAM value unit missing or ambiguous')
        prepared.append((row, v, unit[0][0]))
    return prepared


def run(args):
    for field in ('APP_ENV','ENV','DEPLOY_ENV','ERS_ENV','ENVIRONMENT'):
        val = os.environ.get(field, '').strip().lower()
        if field == 'APP_ENV' and val != args.environment:
            stop('APP_ENV must explicitly match the requested Test/Production environment')
        if val and val in ('production', 'prod', 'prd', 'test', 'tst') and (('production' if val in ('production','prod','prd') else 'test') != args.environment):
            stop(f'{field} conflicts with requested environment')
    db = args.db.expanduser().absolute()
    if db.name != 'app.db':
        stop('target must be the existing app.db, never a backup or new database')
    if any(k in str(db).lower().split('/') for k in ('backup','backups','recovery')):
        stop('backup/recovery target is prohibited')
    if not db.is_file() or db.is_symlink() or db != db.resolve(strict=True):
        stop('database path must be an existing non-symlink regular file')
    if not IDENTIFIER.fullmatch(args.tenant_id) or not IDENTIFIER.fullmatch(args.operator):
        stop('invalid tenant/operator identifier')
    csv_blob = checked_file(args.csv, 'input CSV')
    csv_hash = digest(csv_blob)
    rows, totals = load_rows(csv_blob, args.tenant_id)
    backup_hash, offhost_hash = verify_backup(args)
    approval_blob = checked_file(args.approval, 'approval JSON')
    sig_blob = checked_file(args.signature, 'approval signature')
    approval = approval_check(approval_blob, sig_blob, args.public_key, csv_hash,
                              backup_hash, offhost_hash, args, rows, totals)
    mode = 'rw' if args.action == 'apply' else 'ro'
    connection = sqlite3.connect(f'file:{db}?mode={mode}', uri=True, timeout=5, isolation_level=None)
    try:
        connection.execute('PRAGMA foreign_keys=ON')
        if args.action == 'apply':
            if args.confirm != f'APPLY-OPENING-BALANCES-{args.environment.upper()}':
                stop('exact apply confirmation required')
            if args.writers_stopped != 'ALL_DATABASE_WRITERS_STOPPED':
                stop('database writer-isolation confirmation required')
            connection.execute('BEGIN IMMEDIATE')
        if args.action == 'verify':
            if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or connection.execute('PRAGMA foreign_key_check').fetchone():
                stop('database integrity or foreign keys not clean')
            record = connection.execute('''SELECT environment, tenant_id, approval_sha256, signature_sha256, approval_key_sha256,
                approved_by, executed_by, expected_rows, expected_brl, expected_gold_gram
                FROM production_opening_balance_imports WHERE csv_sha256=?''', (csv_hash,)).fetchone()
            if record != (args.environment, args.tenant_id, digest(approval_blob), digest(sig_blob), approval['approval_key_sha256'],
                          approval['approved_by'], approval['executed_by'], len(rows),
                          str(totals['BRL']), str(totals['GOLD_GRAM'])):
                stop('persisted signed import audit evidence does not match the approval')
            for number, (row, v) in enumerate(rows, 1):
                entry_id = f'opening-355-{csv_hash[:24]}-{number:05d}'
                actual = connection.execute('''SELECT l.tenant_id, l.collaborator_id, l.person_id, u.code,
                    l.entry_type, l.direction, l.amount, l.effective_date, l.source_type, l.source_id
                    FROM ledger_entries l JOIN reference_data u ON u.id=l.value_unit_id
                    WHERE l.id=?''', (entry_id,)).fetchone()
                if not actual or tuple(actual[:6]) != (args.tenant_id,row['journey_id'],row['person_id'],
                        row['value_unit_code'],'OPENING_BALANCE','CREDIT' if v>0 else 'DEBIT'):
                    stop('ledger identity/direction does not match signed row')
                if (Decimal(str(actual[6])).quantize(Decimal('0.01' if row['value_unit_code']=='BRL' else '0.00000001')) != abs(v)
                    or actual[7] != row['effective_date'] or actual[8] != 'OPENING_BALANCE'
                    or actual[9] != f'opening-355-{csv_hash[:32]}:{number}'):
                    stop('ledger amount/date/source does not reconcile to signed row')
            count = connection.execute('''SELECT COUNT(*) FROM ledger_entries
                WHERE entry_type='OPENING_BALANCE' AND source_id LIKE ?''',
                ('opening-355-'+csv_hash[:32]+':%',)).fetchone()[0]
            if count != len(rows):
                stop('opening batch ledger row count mismatch')
        else:
            prepared = inspect_database(connection, rows, args.tenant_id, csv_hash)
        if args.action == 'apply':
            now = datetime.now(timezone.utc).isoformat(timespec='seconds')
            import_id = 'opening-355-' + csv_hash[:32]
            connection.execute('''INSERT INTO production_opening_balance_imports
            (import_id, environment, tenant_id, csv_sha256, approval_sha256, signature_sha256, approval_key_sha256,
            approval_reference, approved_by, executed_by, expected_rows, expected_brl,
            expected_gold_gram, imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (import_id, args.environment, args.tenant_id, csv_hash, digest(approval_blob), digest(sig_blob),
             approval['approval_key_sha256'], approval['approval_reference'], approval['approved_by'], approval['executed_by'], len(rows),
             str(totals['BRL']), str(totals['GOLD_GRAM']), now))
            for index, (row, v, unit_id) in enumerate(prepared, 1):
                entry_id = f'opening-355-{csv_hash[:24]}-{index:05d}'
                direction = 'CREDIT' if v > 0 else 'DEBIT'
                connection.execute('''INSERT INTO ledger_entries
                (id,created_at,updated_at,tenant_id,collaborator_id,value_unit_id,
                 entry_type,direction,amount,effective_date,source_type,source_id,
                 description,active,correction_type,person_id,authorized_by,authorized_at,
                 second_approved_by,second_approved_at)
                VALUES (?,?,?,?,?,?,'OPENING_BALANCE',?,?,?,?,?,?,1,'ORIGINAL',?,?,?,?,?)''',
                (entry_id,now,now,args.tenant_id,row['journey_id'],unit_id,direction,float(abs(v)),
                 row['effective_date'],'OPENING_BALANCE',f'{import_id}:{index}',
                 'Historical opening balance; source reference: '+row['reference'],row['person_id'],
                 approval['executed_by'], now, approval['approved_by'],now))
            # Reconcile exact signed logical positions against posted ledger rows.
            for row, v, unit_id in prepared:
                posted = connection.execute('''SELECT direction,amount FROM ledger_entries
                  WHERE entry_type='OPENING_BALANCE' AND tenant_id=? AND collaborator_id=? AND value_unit_id=?''',
                  (args.tenant_id,row['journey_id'],unit_id)).fetchall()
                actual = sum((Decimal(str(amount)) * (1 if direction=='CREDIT' else -1)
                              for direction, amount in posted), Decimal('0'))
                if actual.quantize(Decimal('0.01' if row['value_unit_code']=='BRL' else '0.00000001')) != v:
                    stop('posted ledger reconciliation does not match approved signed positions')
            if connection.execute('PRAGMA foreign_key_check').fetchone():
                stop('foreign-key check failed during import')
            connection.execute('COMMIT')
        print(f'PASS: Byte 35.5 {args.action}; rows={len(rows)}; '
              f'net_BRL={totals["BRL"]}; net_GOLD_GRAM={totals["GOLD_GRAM"]}; '
              f'csv_sha256={csv_hash}; no database reset')
    except Exception:
        if connection.in_transaction:
            connection.execute('ROLLBACK')
        raise
    finally:
        connection.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('action', choices=('plan','apply','verify'))
    for flag in ('db','csv','approval','signature','public-key','backup','backup-manifest'):
        ap.add_argument('--'+flag, type=Path, required=True)
    ap.add_argument('--offhost-receipt', type=Path)
    ap.add_argument('--environment', choices=('test','production'), required=True)
    ap.add_argument('--tenant-id', required=True)
    ap.add_argument('--operator', required=True)
    ap.add_argument('--approved-public-key-sha256', required=True)
    ap.add_argument('--confirm', default='')
    ap.add_argument('--writers-stopped', default='')
    args = ap.parse_args()
    if not SHA256.fullmatch(args.approved_public_key_sha256):
        ap.error('--approved-public-key-sha256 must be a lowercase 64-digit digest')
    try:
        run(args)
    except (ValueError, sqlite3.Error, OSError) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
