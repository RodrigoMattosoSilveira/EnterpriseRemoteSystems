#!/usr/bin/env python3
"""Byte 35.4C: create a NEW disposable, deterministic fictitious training DB.

Never accepts a working database as input, never overwrites its output, and
never imports records from another database. All fixture dates and IDs are fixed.
This script reuses Bite 31.4's tested synthetic constructors, not its database.
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from ers_environment import require_non_production_data_mutation  # noqa: E402

DEFAULT_DB = ROOT / 'backend/data/byte354c-training.db'
AS_OF = date(2026, 11, 7)
A = 'training-354c-entidade-a'
B = 'training-354c-entidade-b'
MARKER = 'ERS_BYTE_35_4C_FICTITIOUS_TRAINING_V1'
PERSONS = {
    'admin': ('Helena', 'Costa', 'Helena'),
    'joao': ('Bruno', 'Almeida', 'Bruno'),
    'camila': ('Ana', 'Pereira', 'Ana'),
    'rafael': ('Carla', 'Lima', 'Carla'),
    'beatriz': ('Davi', 'Souza', 'Davi'),
    'elisa': ('Elisa', 'Rocha', 'Elisa'),
    'fabio': ('Fábio', 'Santos', 'Fábio'),
}
BASE_TABLES = (
    'tenants', 'reference_data', 'expense_price_list_items', 'global_people',
    'person_tenant_memberships', 'collaborator_journeys', 'work_periods',
    'work_period_assignments', 'gold_prices', 'gold_production_entries',
    'accrual_runs', 'accrual_items', 'expenses', 'ledger_entries',
    'ledger_receipts', 'journey_settlements', 'authz_actors',
    'auth_user_accounts', 'auth_account_people', 'auth_account_actors',
    'authz_actor_role_grants',
)


def args_parser() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_DB,
                        help='new byte354c-training*.db file; existing files are never replaced')
    parser.add_argument('--verify-only', action='store_true',
                        help='read-only integrity, fixture, and manifest verification')
    return parser.parse_args()


def safe_path(path: Path) -> Path:
    # Deliberate path allowlist, independent of APP_ENV: never accept app.db,
    # brazilian-demo.db, production backups, or an alternate existing symlink.
    if path.name != 'byte354c-training.db' and not (
        path.name.startswith('byte354c-training-') and path.name.endswith('.db')
    ):
        raise SystemExit('STOP: output filename must be byte354c-training*.db (never app.db)')
    if path.is_symlink():
        raise SystemExit('STOP: training output cannot be a symlink')
    resolved = path.expanduser().resolve(strict=False)
    if any(s in ('production', 'prd', 'backups', 'backup') for s in resolved.parts):
        raise SystemExit('STOP: Production/backup directory is not a training target')
    if resolved.parent.is_symlink():
        raise SystemExit('STOP: training output parent cannot be a symlink')
    return resolved


def load_demo_helpers():
    source = SCRIPTS / 'seed-brazilian-demo.py'
    spec = importlib.util.spec_from_file_location('ers_brazilian_demo_fixture', source)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.PERSONS = PERSONS.copy()
    module.SELF_SERVICE_KEYS = ('joao', 'camila', 'rafael')
    module.TENANT_ID = A
    module.TENANT_CODE = 'TRAIN354C_A'
    module.TENANT_NAME = 'Entidade A — Treinamento Fictício 35.4C'
    module.TENANT_ADMIN_LOGIN = 'training354c.admin-a@example.test'

    def training_id(*parts: str) -> str:
        prefix = 'train354c-a' if module.TENANT_ID == A else 'train354c-b'
        return prefix + '-' + '-'.join(module.slug(x) for x in parts)
    module.demo_id = training_id
    return module


def run_migrations(conn: sqlite3.Connection) -> None:
    migrations = sorted((ROOT / 'backend/migrations').glob('*.up.sql'))
    if len(migrations) < 70:
        raise RuntimeError('STOP: canonical migrations incomplete')
    for migration in migrations:
        conn.executescript(migration.read_text(encoding='utf-8'))
    # Match the runtime's ledger of applied migration files without using
    # live data or the destructive LOCAL reset command.
    conn.execute('''CREATE TABLE IF NOT EXISTS schema_migrations
                    (filename TEXT PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
    conn.executemany(
        'INSERT OR IGNORE INTO schema_migrations(filename,applied_at) VALUES (?,?)',
        [(p.name, '2026-11-07T12:00:00+00:00') for p in migrations],
    )
    conn.commit()
    if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('New training DB failed SQLite integrity_check')
    if conn.execute('PRAGMA foreign_key_check').fetchall():
        raise RuntimeError('New training DB failed foreign_key_check after migrations')


def insert(m, conn: sqlite3.Connection, table: str, **values) -> None:
    m.insert(conn, table, values)


def grant(m, conn: sqlite3.Connection, key: str, actor_id: str, role_code: str,
          tenant_id: str, now: str) -> None:
    role = m.one(conn, 'SELECT id FROM authz_roles WHERE code=? AND active=1', (role_code,))['id']
    insert(m, conn, 'authz_actor_role_grants', id=m.demo_id('grant', key),
           actor_id=actor_id, role_id=role, tenant_id=tenant_id, active=1,
           created_at=now, updated_at=now, lifecycle_suspended=0)


def add_person_account(m, conn, key: str, person_id: str, membership_id: str, now: str) -> None:
    m.seed_self_service_auth(conn, key, person_id, membership_id, now)
    conn.execute('UPDATE auth_user_accounts SET login=? WHERE id=?',
                 (f'training354c.{key}@example.test', m.demo_id('account', key)))


def add_global_admin(m, conn, now: str) -> None:
    actor_id = 'train354c-global-app-actor'
    insert(m, conn, 'authz_actors', id=actor_id, actor_key='train354c:app',
           display_name='Administrador da Aplicação — Treinamento', active=1,
           created_at=now, updated_at=now)
    account_id = 'train354c-global-app-account'
    insert(m, conn, 'auth_user_accounts', id=account_id,
           login='training354c.app@example.test', password_hash=m.TENANT_ADMIN_PASSWORD_HASH,
           active=1, must_change_password=0, last_login_at=None,
           password_changed_at=now, created_at=now, updated_at=now,
           security_suspended=0)
    insert(m, conn, 'auth_account_actors', account_id=account_id, actor_id=actor_id,
           scope_type='GLOBAL', tenant_id=None, membership_id=None,
           created_at=now, updated_at=now)
    role = m.one(conn, "SELECT id FROM authz_roles WHERE code='APPLICATION_ADMIN'")['id']
    insert(m, conn, 'authz_actor_role_grants', id='train354c-global-app-grant',
           actor_id=actor_id, role_id=role, tenant_id='*', active=1,
           created_at=now, updated_at=now, lifecycle_suspended=0)



def final_receipt_fixture(m, conn: sqlite3.Connection, key: str, person_key: str,
                          amount: float, tenant_pays: bool, now: str) -> None:
    """Two-sided settlement examples, fully offset: no invented opening balance."""
    person = m.demo_id('person', person_key)
    journey = m.demo_id('journey', person_key)
    initial_direction = 'CREDIT' if tenant_pays else 'DEBIT'
    initial_type = 'EARNING_CREDIT' if tenant_pays else 'EXPENSE_DEDUCTION'
    m.ledger(conn, f'{key}-original', person, journey, 'BRL',
             initial_type, initial_direction, amount, AS_OF-timedelta(days=2),
             'TRAINING_FIXTURE', m.demo_id('exercise', key), now,
             'Evidência sintética de origem de saldo para treinamento; não é lançamento real.')
    settlement_type = 'FINAL_TENANT_PAYMENT' if tenant_pays else 'FINAL_COLLABORATOR_PAYMENT'
    settlement = m.demo_id('settlement', key)
    insert(m, conn, 'journey_settlements', id=settlement, tenant_id=A,
           collaborator_id=journey, settlement_type=settlement_type,
           request_id=m.demo_id('request', key), status='POSTED',
           effective_date=AS_OF.isoformat(), brl_amount=amount, gold_gram_amount=0,
           notes='Liquidação fictícia de treinamento (pendente de aceite).',
           authorized_by='training354c.admin-a@example.test', authorized_at=now,
           reason_code=None, reason_text=None, second_approved_by=None,
           second_approved_at=None, second_approval_notes=None,
           created_at=now, updated_at=now)
    direction = 'DEBIT' if tenant_pays else 'CREDIT'
    ledger_id = m.ledger(conn, f'{key}-final', person, journey, 'BRL',
                         'FINAL_SETTLEMENT', direction, amount, AS_OF,
                         'JOURNEY_SETTLEMENT', settlement, now,
                         'Liquidação final fictícia: somente treino de recibo.')
    purpose = ('FINAL_SETTLEMENT_TENANT_PAYMENT' if tenant_pays
               else 'FINAL_SETTLEMENT_COLLABORATOR_PAYMENT')
    payment_direction = 'TENANT_TO_COLLABORATOR' if tenant_pays else 'COLLABORATOR_TO_TENANT'
    accepting_party = 'COLLABORATOR' if tenant_pays else 'TENANT'
    insert(m, conn, 'ledger_receipts', id=m.demo_id('receipt',key),
           tenant_id=A, person_id=person, collaborator_id=journey,
           ledger_entry_id=ledger_id, receipt_number=f'RCP-TRAIN354C-{key.upper()}',
           receipt_type='LEDGER_DEBIT', receipt_purpose=purpose,
           payment_direction=payment_direction, accepting_party=accepting_party,
           status='PENDING_ISSUE', issued_at=None, issued_by=None,
           printed_at=None, signed_at=None, returned_at=None, received_by=None,
           signed_document_ref=None, cancelled_at=None, cancelled_by=None,
           cancellation_reason=None, notes='Recibo pendente fictício: NÃO ASSINAR em treino básico.',
           accepted_at=None, accepted_by=None, acceptance_method=None,
           created_at=now, updated_at=now)


def seed_training(conn: sqlite3.Connection) -> None:
    m = load_demo_helpers()
    m.require_schema(conn)
    now = m.ts(AS_OF, 12)
    with conn:
        # Existing historical demo scenario is cloned as *synthetic logic*:
        # nothing is copied from any existing on-disk database.
        m.seed_scenario(conn, AS_OF)
        conn.execute("UPDATE authz_actors SET actor_key='train354c:admin-a', display_name='Helena Costa — ADMIN-A' WHERE id=?",
                     (m.demo_id('actor', 'tenant-admin'),))
        for key in ('joao', 'camila', 'rafael'):
            conn.execute('UPDATE auth_user_accounts SET login=? WHERE id=?',
                         (f'training354c.{key}@example.test', m.demo_id('account', key)))
        for key in PERSONS:
            conn.execute('UPDATE global_people SET email=?, pix_key=? WHERE id=?',
                         (f'training354c.{key}@example.test', f'training354c.{key}@pix.example.test',
                          m.demo_id('person', key)))
        conn.execute('UPDATE tenants SET description=? WHERE id=?',
                     ('FICTIONAL TRAINING DATA ONLY — NEVER PRODUCTION', A))

        # Add three training collaborators to the demo-derived five people +
        # administrator. The names correspond to the 35.4A manual exercises.
        for key, method, sector, location, task in (
            ('beatriz', 'DAILY', 'SITE_SUPPORT', 'CAMP', 'CAMP_SUPPORT'),
            ('elisa', 'DAILY', 'MAINTENANCE', 'MAIN_MINE', 'EQUIPMENT_MAINTENANCE'),
            ('fabio', 'SALARY', 'PROCESSING', 'PROCESSING_PLANT', 'GOLD_PROCESSING'),
        ):
            membership = m.demo_id('membership', key)
            journey = m.seed_journey(conn, key, membership, method, sector, location, task,
                                     AS_OF-timedelta(days=45), AS_OF+timedelta(days=45),
                                     now, payment=250)
            m.seed_assignment(conn, m.demo_id('work-period','planning'), journey,
                              f'planning-{key}', sector, location, task, now, None)

        for key in ('beatriz', 'elisa', 'fabio'):
            add_person_account(m, conn, key, m.demo_id('person', key),
                               m.demo_id('membership', key), now)
        grant(m, conn, 'earn-a', m.demo_id('actor', 'rafael'), 'EARNINGS_OPERATOR', A, now)
        grant(m, conn, 'expense-a', m.demo_id('actor', 'beatriz'), 'EXPENSE_OPERATOR', A, now)

        # One editable period with two VALID directional substitution links:
        # Bruno -> Ana (Folga) and Davi -> Carla (Licença).
        plan = m.demo_id('work-period','planning')
        ana = m.demo_id('assignment','planning-camila')
        carla = m.demo_id('assignment','planning-rafael')
        bruno = m.demo_id('assignment','planning-joao')
        davi = m.demo_id('assignment','planning-beatriz')
        conn.execute("UPDATE work_period_assignments SET planned_status='EXCLUDED', planning_availability='DAY_OFF' WHERE id=?", (ana,))
        conn.execute("UPDATE work_period_assignments SET planned_status='EXCLUDED', planning_availability='LEAVE_OF_ABSENCE' WHERE id=?", (carla,))
        conn.execute('UPDATE work_period_assignments SET replacement_for_assignment_id=? WHERE id=?', (ana, bruno))
        conn.execute('UPDATE work_period_assignments SET replacement_for_assignment_id=? WHERE id=?', (carla, davi))

        # Real work different from the informed plan, without changing the
        # posted remuneration record and its historical linkage.
        conn.execute('''UPDATE work_period_assignments
                        SET actual_sector_id=?, actual_location_id=?, actual_task_id=?
                        WHERE id=?''', (
            m.ref(conn, 'sector','SITE_SUPPORT'), m.ref(conn,'location','CAMP'),
            m.ref(conn,'task','CAMP_SUPPORT'), m.demo_id('assignment','completed-joao')))
        # F04-S08: same-code empty successor immediately AFTER the Nov 5
        # fully posted period, so that the proposal can use Bruno's actual
        # Nov 5 work rather than a newer planning-only draft.
        m.seed_work_period(conn, 'next-unplanned', AS_OF-timedelta(days=1), 'PLANNING', now)
        # F04-S01/02/06: independent plan without pre-saved substitutions.
        basic = m.seed_work_period(conn, 'planning-basic', AS_OF+timedelta(days=3), 'PLANNING', now)
        basic_journeys = {
            'joao': ('joao-current', 'UNDERGROUND_MINING','NORTH_PIT','DRILLING'),
            'camila': ('camila-current','PROCESSING','PROCESSING_PLANT','GOLD_PROCESSING'),
            'rafael': ('rafael-current','MAINTENANCE','MAIN_MINE','EQUIPMENT_MAINTENANCE'),
            'beatriz': ('beatriz','SITE_SUPPORT','CAMP','CAMP_SUPPORT'),
            'elisa': ('elisa','MAINTENANCE','MAIN_MINE','EQUIPMENT_MAINTENANCE'),
            'fabio': ('fabio','PROCESSING','PROCESSING_PLANT','GOLD_PROCESSING'),
        }
        for key, (journey_key, sector, location, task) in basic_journeys.items():
            m.seed_assignment(conn, basic, m.demo_id('journey',journey_key),
                              f'basic-{key}', sector, location, task, now, None)
        # F06: an informed period with a result available for approved UI edits.
        informed = m.seed_work_period(conn, 'informed-results', AS_OF-timedelta(days=3), 'INFORMED', now)
        m.seed_assignment(conn, informed, m.demo_id('journey','joao-current'),
                          'informed-bruno', 'UNDERGROUND_MINING','NORTH_PIT','DRILLING',now,None)
        final_receipt_fixture(m, conn, 'elisa', 'elisa', 75.0, True, now)
        final_receipt_fixture(m, conn, 'fabio', 'fabio', 45.0, False, now)

        # Entidade B: independent administrator and collaborator, plus the
        # very SAME global Ana Person and Account with a separate B Actor.
        m.TENANT_ID = B
        insert(m, conn, 'tenants', id=B, code='TRAIN354C_B',
               name='Entidade B — Treinamento Fictício 35.4C',
               description='FICTIONAL TRAINING DATA ONLY — tenant isolation',
               active=1, created_at=now, updated_at=now)
        m.clone_tenant_baseline(conn, now)
        m.ensure_required_references(conn, now)
        original_cpf = m.cpf_from_seed
        m.cpf_from_seed = lambda seed: original_cpf(seed + 100_000)
        m.PERSONS = {'adminb': ('Marina','Torres','Marina'),
                     'gisele': ('Gisele','Nogueira','Gisele')}
        status = m.ref(conn,'person_status','ACTIVE')
        person_b, member_b = m.seed_person(conn, 'adminb', status, now, eligible=False)
        gisele, gisele_membership = m.seed_person(conn, 'gisele', status, now, eligible=True)
        for key in ('adminb','gisele'):
            conn.execute('UPDATE global_people SET email=?, pix_key=? WHERE id=?',
                         (f'training354c.{key}@example.test', f'training354c.{key}@pix.example.test',
                          m.demo_id('person',key)))
        bactor = m.demo_id('actor','adminb')
        baccount = m.demo_id('account','adminb')
        insert(m, conn, 'authz_actors', id=bactor,
               actor_key=f'person:{person_b}::tenant::{B}',
               display_name='Marina Torres — ADMIN-B', active=1,
               created_at=now, updated_at=now)
        insert(m, conn, 'auth_user_accounts', id=baccount,
               login='training354c.admin-b@example.test',
               password_hash=m.TENANT_ADMIN_PASSWORD_HASH,
               active=1, must_change_password=0, last_login_at=None,
               password_changed_at=now, created_at=now, updated_at=now,
               security_suspended=0)
        insert(m, conn, 'auth_account_people', account_id=baccount,
               person_id=person_b, created_at=now, updated_at=now)
        insert(m, conn, 'auth_account_actors', account_id=baccount,
               actor_id=bactor, scope_type='TENANT', tenant_id=B,
               membership_id=member_b, created_at=now, updated_at=now)
        grant(m, conn, 'adminb', bactor, 'TENANT_ADMIN', B, now)
        m.seed_journey(conn, 'gisele', gisele_membership, 'DAILY',
                       'SITE_SUPPORT', 'CAMP','CAMP_SUPPORT',
                       AS_OF-timedelta(days=20), AS_OF+timedelta(days=20), now, payment=275)
        shared_person = 'train354c-a-person-camila'  # Ana is global, not cloned
        shared_account = 'train354c-a-account-camila'
        member_shared = m.demo_id('membership','shared-ana')
        insert(m, conn, 'person_tenant_memberships', id=member_shared,
               tenant_id=B, person_id=shared_person, status_id=status,
               notes='Synthetic shared Person for cross-Entidade isolation.',
               created_at=now, updated_at=now)
        shared_actor = m.demo_id('actor','shared-ana')
        insert(m, conn, 'authz_actors', id=shared_actor,
               actor_key=f'person:{shared_person}::tenant::{B}',
               display_name='Ana Pereira — Entidade B', active=1,
               created_at=now, updated_at=now)
        insert(m, conn, 'auth_account_actors', account_id=shared_account,
               actor_id=shared_actor, scope_type='TENANT', tenant_id=B,
               membership_id=member_shared, created_at=now, updated_at=now)
        m.seed_journey(conn, 'shared-ana-b', member_shared, 'DAILY',
                       'MAINTENANCE','MAIN_MINE','EQUIPMENT_MAINTENANCE',
                       AS_OF-timedelta(days=25), AS_OF+timedelta(days=25), now, payment=275)
        add_global_admin(m, conn, now)
        conn.execute('''CREATE TABLE training_fixture_manifest (
            marker TEXT PRIMARY KEY, version INTEGER NOT NULL, as_of TEXT NOT NULL,
            data_sha256 TEXT NOT NULL)''')
        digest = fixture_digest(conn)
        conn.execute('INSERT INTO training_fixture_manifest VALUES (?,?,?,?)',
                     (MARKER, 1, AS_OF.isoformat(), digest))


def fixture_digest(conn: sqlite3.Connection) -> str:
    # Include all training-owned rows only. Generic migration timestamps and
    # schema metadata are irrelevant to the deterministic business scenario.
    payload: list[object] = []
    for table in BASE_TABLES:
        columns = [r[1] for r in conn.execute(f'PRAGMA table_info({table})')]
        where = ''
        values: tuple = ()
        if table == 'tenants':
            where, values = ' WHERE id IN (?,?)', (A,B)
        elif table == 'global_people':
            where = " WHERE id LIKE 'train354c-%'"
        elif table in ('auth_user_accounts', 'authz_actors', 'authz_actor_role_grants'):
            where = " WHERE id LIKE 'train354c-%'"
        elif table in ('auth_account_people', 'auth_account_actors'):
            where = " WHERE account_id LIKE 'train354c-%'"
        elif 'tenant_id' in columns:
            where, values = ' WHERE tenant_id IN (?,?)', (A,B)
        else:
            raise RuntimeError(f'Cannot scope training digest for {table}')
        # Sort by complete row values (rather than SQLite physical row order).
        rows = conn.execute(f'SELECT * FROM {table}{where}', values).fetchall()
        payload.append((table, sorted([tuple(r) for r in rows], key=lambda row: repr(row))))
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                                      separators=(',',':'), default=str).encode()).hexdigest()


def verify(conn: sqlite3.Connection) -> str:
    if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('FAIL: integrity_check')
    if conn.execute('PRAGMA foreign_key_check').fetchall():
        raise RuntimeError('FAIL: foreign_key_check')
    marker = conn.execute('SELECT marker,version,as_of,data_sha256 FROM training_fixture_manifest').fetchone()
    if not marker or tuple(marker[:3]) != (MARKER, 1, AS_OF.isoformat()):
        raise RuntimeError('FAIL: not a Byte 35.4C training fixture')
    digest = fixture_digest(conn)
    if digest != marker[3]:
        raise RuntimeError('FAIL: training fixture modified; use a NEW disposable database')
    def count(sql: str, params: tuple = ()) -> int:
        return int(conn.execute(sql, params).fetchone()[0])
    requirements = {
        'two training Entidades': ("SELECT COUNT(*) FROM tenants WHERE id IN (?,?)", (A,B),2),
        'eight training Persons': ("SELECT COUNT(*) FROM global_people WHERE id LIKE 'train354c-%'", (),9),
        'six A collaborators': ("SELECT COUNT(*) FROM collaborator_journeys WHERE tenant_id=? AND closed_at IS NULL", (A,),6),
        'one closed Journey': ("SELECT COUNT(*) FROM collaborator_journeys WHERE tenant_id=? AND closed_at IS NOT NULL", (A,),1),
        'six A Work Periods': ("SELECT COUNT(*) FROM work_periods WHERE tenant_id=?", (A,),6),
        'one empty successor period': ("SELECT COUNT(*) FROM work_period_assignments WHERE work_period_id='train354c-a-work-period-next-unplanned'", (),0),
        'two B Journeys': ("SELECT COUNT(*) FROM collaborator_journeys WHERE tenant_id=?", (B,),2),
        'two directional replacements': ("SELECT COUNT(*) FROM work_period_assignments WHERE work_period_id='train354c-a-work-period-planning' AND replacement_for_assignment_id IS NOT NULL", (),2),
        'one actual-work override': ("SELECT COUNT(*) FROM work_period_assignments WHERE id='train354c-a-assignment-completed-joao' AND actual_location_id<>location_id", (),1),
        'Ana shared Account with 2 Actors': ("SELECT COUNT(*) FROM auth_account_actors WHERE account_id='train354c-a-account-camila' AND scope_type='TENANT'", (),2),
        'A and B administrators': ("SELECT COUNT(*) FROM authz_actor_role_grants g JOIN authz_roles r ON r.id=g.role_id WHERE r.code='TENANT_ADMIN' AND g.active=1 AND g.tenant_id IN (?,?)", (A,B),2),
        'earnings operator': ("SELECT COUNT(*) FROM authz_actor_role_grants g JOIN authz_roles r ON r.id=g.role_id WHERE r.code='EARNINGS_OPERATOR' AND g.tenant_id=? AND g.active=1", (A,),1),
        'expenses operator': ("SELECT COUNT(*) FROM authz_actor_role_grants g JOIN authz_roles r ON r.id=g.role_id WHERE r.code='EXPENSE_OPERATOR' AND g.tenant_id=? AND g.active=1", (A,),1),
        'Tenant payment pending collaborator receipt': ("SELECT COUNT(*) FROM ledger_receipts WHERE tenant_id=? AND receipt_purpose='FINAL_SETTLEMENT_TENANT_PAYMENT' AND accepting_party='COLLABORATOR' AND status='PENDING_ISSUE'",(A,),1),
        'Collaborator payment pending Tenant receipt': ("SELECT COUNT(*) FROM ledger_receipts WHERE tenant_id=? AND receipt_purpose='FINAL_SETTLEMENT_COLLABORATOR_PAYMENT' AND accepting_party='TENANT' AND status='PENDING_ISSUE'",(A,),1),
    }
    for label, (sql, params, expected) in requirements.items():
        found = count(sql, params)
        if found != expected:
            raise RuntimeError(f'FAIL: {label}; expected {expected}, got {found}')
    if count('SELECT COUNT(*) FROM ledger_entries WHERE tenant_id=?', (B,)):
        raise RuntimeError('FAIL: unexpected Entidade B financial history')
    if count("SELECT COUNT(*) FROM authz_actor_role_grants WHERE actor_id IN ('train354c-a-actor-camila','train354c-b-actor-shared-ana')"):
        raise RuntimeError('FAIL: shared Ana has improper delegated privileges')
    return digest


def main() -> int:
    options = args_parser()
    require_non_production_data_mutation('to prepare Byte 35.4C training data')
    if os.getenv('ENV', '').lower() in ('production', 'prod'):
        raise SystemExit('STOP: ENV=production is forbidden for training fixtures')
    dest = safe_path(options.output)
    if options.verify_only:
        if not dest.is_file():
            raise SystemExit('STOP: training database does not exist')
        with sqlite3.connect(f'file:{dest}?mode=ro', uri=True) as conn:
            digest = verify(conn)
        print(f'PASS: Byte 35.4C training database verified; SHA-256 logical fixture: {digest}')
        return 0
    if dest.exists():
        raise SystemExit('STOP: output already exists; no replacement or reset is permitted')
    if not dest.parent.is_dir():
        raise SystemExit('STOP: create a dedicated parent directory before building')
    fd, path = tempfile.mkstemp(prefix='.byte354c-building-', suffix='.db', dir=dest.parent)
    os.close(fd)
    staged = Path(path)
    try:
        with sqlite3.connect(staged) as conn:
            conn.row_factory = sqlite3.Row
            run_migrations(conn)
            conn.execute('PRAGMA foreign_keys = ON')
            seed_training(conn)
            digest = verify(conn)
        # link is atomic and fails rather than clobbering a destination that
        # another process created after the initial exists() check.
        os.link(staged, dest)
        print(f'PASS: Byte 35.4C fictitious training database created: {dest}')
        print(f'PASS: logical fixture SHA-256: {digest}')
        print('Only APP_ENV=development; no customer or Production data was read.')
        print('Training passwords: admin = Demo-31.4-Brasil!; persons = Demo-31.4-Person!')
        return 0
    finally:
        staged.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (sqlite3.Error, RuntimeError, OSError) as exc:
        raise SystemExit(f'STOP: {exc}') from exc
