#!/usr/bin/env python3
"""Byte 35.4C: add deterministic synthetic data to an EXISTING non-Production DB.

No migrations, database recreation, reset, backup, or replacement. Transactional,
non-overwriting, repeatable seeding using the Bite 31.4 synthetic constructors.
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from ers_environment import require_non_production_data_mutation  # noqa: E402

AS_OF = date(2026, 11, 7)
A = 'training-354c-entidade-a'
B = 'training-354c-entidade-b'
PERSONS = {
    'admin': ('Helena', 'Costa', 'Helena'),
    'joao': ('Bruno', 'Almeida', 'Bruno'),
    'camila': ('Ana', 'Pereira', 'Ana'),
    'rafael': ('Carla', 'Lima', 'Carla'),
    'beatriz': ('Davi', 'Souza', 'Davi'),
    'elisa': ('Elisa', 'Rocha', 'Elisa'),
    'fabio': ('Fábio', 'Santos', 'Fábio'),
}
EXPECTED_DIGEST = 'd938cec4c32f1f381327a9b7d07e1e8229e41fda3ba3cb37f1931c18b653407f'  # Excludes credential state.
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
    parser.add_argument('--database', required=True, type=Path,
                        help='explicit path to an existing, fully migrated SQLite database')
    parser.add_argument('--target', required=True, choices=('local', 'development', 'test'))
    parser.add_argument('--confirm-target', required=True, choices=('local', 'development', 'test'),
                        help='must match --target; never production')
    parser.add_argument('--verify-only', action='store_true',
                        help='read-only verification of initial synthetic records')
    return parser.parse_args()


def validate_target(options: argparse.Namespace) -> None:
    raw = os.environ.get('APP_ENV', '').strip().lower()
    normalized = require_non_production_data_mutation('to provision Byte 35.4C training records')
    # A local development backend and the deployed DEV backend both use
    # APP_ENV=development; --target + a second explicit confirmation distinguish
    # the user's intent. TST must be APP_ENV=test.
    if options.target != options.confirm_target:
        raise SystemExit('STOP: target confirmation mismatch')
    if options.target == 'test' and normalized != 'test':
        raise SystemExit('STOP: test target requires APP_ENV=test')
    if options.target in ('local', 'development') and normalized != 'development':
        raise SystemExit('STOP: local/development target requires APP_ENV=local/development')
    for name in ('ENV', 'DEPLOY_ENV', 'ERS_ENV', 'ENVIRONMENT', 'NODE_ENV'):
        if os.environ.get(name, '').strip().lower() in ('production', 'prod', 'prd'):
            raise SystemExit(f'STOP: {name} declares Production; training is prohibited')
    if raw in ('production', 'prod', 'prd'):
        raise SystemExit('STOP: APP_ENV declares Production')


def safe_path(path: Path, target: str) -> Path:
    requested = path.expanduser().absolute()
    if requested.is_symlink() or not requested.is_file():
        raise SystemExit('STOP: target must be an existing regular non-symlink SQLite file')
    resolved = requested.resolve(strict=True)
    if any(part.lower() in ('production', 'prod', 'prd', 'backup', 'backups')
           for part in resolved.parts):
        raise SystemExit('STOP: Production or backup path is prohibited')
    if requested != resolved:
        raise SystemExit('STOP: symbolic-link path components are not permitted')
    if target == 'local' and resolved != (ROOT/'backend/data/app.db').resolve():
        raise SystemExit("STOP: LOCAL target must use this worktree\'s backend/data/app.db")
    if resolved.name != 'app.db':
        raise SystemExit('STOP: target must be an existing app.db, never a scratch or backup database')
    return resolved


def require_current_migrations(conn: sqlite3.Connection) -> None:
    # This tool does not apply migrations. A mismatched schema is a hard stop.
    files = sorted(p.name for p in (ROOT/'backend/migrations').glob('*.up.sql'))
    if len(files) < 70:
        raise RuntimeError('STOP: canonical migration files are unavailable')
    present = {r[0] for r in conn.execute('SELECT filename FROM schema_migrations')}
    missing = set(files) - present
    if missing:
        raise RuntimeError(f'STOP: database migrations are incomplete ({len(missing)} missing)')


def credential_hashes(target: str) -> tuple[str, str]:
    admin = os.getenv('BYTE354C_ADMIN_BCRYPT_HASH', '').strip()
    person = os.getenv('BYTE354C_PERSON_BCRYPT_HASH', '').strip()
    if target == 'local' and not admin and not person:
        # Existing test-only passwords, allowed ONLY for localhost development.
        m = load_demo_helpers()
        return m.TENANT_ADMIN_PASSWORD_HASH, m.SELF_SERVICE_PASSWORD_HASH
    valid = re.compile(r'^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$')
    if not (valid.fullmatch(admin) and valid.fullmatch(person)):
        raise SystemExit('STOP: supply both valid bcrypt hashes via 1Password for non-LOCAL targets')
    if min(int(valid.fullmatch(admin).group(1)), int(valid.fullmatch(person).group(1))) < 10:
        raise SystemExit('STOP: bcrypt cost must be at least 10')
    if admin == person:
        raise SystemExit('STOP: admin and collaborator password hashes must differ')
    if target != 'local':
        m = load_demo_helpers()
        if admin in (m.TENANT_ADMIN_PASSWORD_HASH, m.SELF_SERVICE_PASSWORD_HASH) or person in (
                m.TENANT_ADMIN_PASSWORD_HASH, m.SELF_SERVICE_PASSWORD_HASH):
            raise SystemExit('STOP: public LOCAL demo hashes are prohibited in DEV/TST')
    return admin, person


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

    # No cross-Entidade copy: use a fixed synthetic price item. The canonical
    # helper itself inserts the required reference codes when absent.
    def training_baseline(conn: sqlite3.Connection, now: str) -> None:
        module.insert(conn, 'expense_price_list_items', {
            'id': module.demo_id('price', 'CANTEEN_MEAL'),
            'tenant_id': module.TENANT_ID, 'item_type': 'CANTEEN',
            'code': 'CANTEEN_MEAL', 'description': 'Refeição fictícia',
            'unit_price_brl': 35.0, 'active': 1, 'sort_order': 10,
            'superseded_price_list_item_id': None,
            'created_at': now, 'updated_at': now,
        })
    module.clone_tenant_baseline = training_baseline

    def training_id(*parts: str) -> str:
        prefix = 'train354c-a' if module.TENANT_ID == A else 'train354c-b'
        return prefix + '-' + '-'.join(module.slug(x) for x in parts)
    module.demo_id = training_id
    return module


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


def seed_training(conn: sqlite3.Connection, admin_hash: str, person_hash: str) -> None:
    m = load_demo_helpers()
    m.TENANT_ADMIN_PASSWORD_HASH = admin_hash
    m.SELF_SERVICE_PASSWORD_HASH = person_hash
    m.require_schema(conn)
    now = m.ts(AS_OF, 12)
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
    # Existing Application Administrator accounts remain authoritative.
    # Do not create a second application-global administrator for training.


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
        normalized = []
        for row in rows:
            fields = list(row)
            if table == 'auth_user_accounts':
                for name in ('password_hash', 'last_login_at', 'password_changed_at'):
                    if name in columns:
                        fields[columns.index(name)] = '<credential state>'
            normalized.append(tuple(fields))
        payload.append((table, sorted(normalized, key=repr)))
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                                      separators=(',',':'), default=str).encode()).hexdigest()


def verify(conn: sqlite3.Connection) -> str:
    if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('FAIL: integrity_check')
    if conn.execute('PRAGMA foreign_key_check').fetchall():
        raise RuntimeError('FAIL: foreign_key_check')
    digest = fixture_digest(conn)
    if digest != EXPECTED_DIGEST:
        raise RuntimeError('FAIL: training records differ from the original fixture; never overwrite them')
    def count(sql: str, params: tuple = ()) -> int:
        return int(conn.execute(sql, params).fetchone()[0])
    requirements = {
        'two training Entidades': ("SELECT COUNT(*) FROM tenants WHERE id IN (?,?)", (A,B),2),
        'nine training Persons': ("SELECT COUNT(*) FROM global_people WHERE id LIKE 'train354c-%'", (),9),
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
    if count("SELECT COUNT(*) FROM auth_user_accounts WHERE id LIKE 'train354c-%'") != 8:
        raise RuntimeError('FAIL: expected eight tenant-scoped training accounts')
    if count('SELECT COUNT(*) FROM ledger_entries WHERE tenant_id=?', (B,)):
        raise RuntimeError('FAIL: unexpected Entidade B financial history')
    if count("SELECT COUNT(*) FROM authz_actor_role_grants WHERE actor_id IN ('train354c-a-actor-camila','train354c-b-actor-shared-ana')"):
        raise RuntimeError('FAIL: shared Ana has improper delegated privileges')
    return digest


def main() -> int:
    options = args_parser()
    validate_target(options)
    dest = safe_path(options.database, options.target)
    # mode=rw prevents SQLite from creating a new file if a path is wrong.
    with sqlite3.connect(dest.as_uri() + ('?mode=ro' if options.verify_only else '?mode=rw'),
                         uri=True, timeout=15) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('PRAGMA busy_timeout=15000')
        if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('STOP: existing database failed integrity_check')
        if conn.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('STOP: existing database has foreign-key errors')
        require_current_migrations(conn)
        m = load_demo_helpers()
        m.require_schema(conn)
        present = [conn.execute('SELECT 1 FROM tenants WHERE id=?', (tid,)).fetchone() is not None
                   for tid in (A, B)]
        if any(present):
            if not all(present):
                raise RuntimeError('STOP: partial training-Entidade ownership; do not repair automatically')
            digest = verify(conn)
            print(f'PASS: original Byte 35.4C data already present; no writes; logical SHA-256: {digest}')
            return 0
        if options.verify_only:
            raise RuntimeError('STOP: no Byte 35.4C training data found')
        admin_hash, person_hash = credential_hashes(options.target)
        # These two hashes are consumed by the existing synthetic constructors.
        # Never print them or write them to a file.
        with conn:
            conn.execute('BEGIN IMMEDIATE')
            # Check again after obtaining the SQLite writer lock.
            if conn.execute('SELECT 1 FROM tenants WHERE id IN (?,?) LIMIT 1', (A, B)).fetchone():
                raise RuntimeError('STOP: training tenant appeared concurrently')
            seed_training(conn, admin_hash, person_hash)
            digest = verify(conn)
        print(f'PASS: added Byte 35.4C fictitious records to existing {options.target.upper()} database')
        print(f'PASS: logical fixture SHA-256: {digest}')
        print('Existing non-training records unchanged; no migrations, reset or replacement.')
        if options.target == 'local':
            print('LOCAL test-only passwords: admin = Demo-31.4-Brasil!; persons = Demo-31.4-Person!')
        else:
            print('DEV/TST training credentials must remain in 1Password; no passwords printed.')
        return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (sqlite3.Error, RuntimeError, OSError) as exc:
        raise SystemExit(f'STOP: {exc}') from exc
