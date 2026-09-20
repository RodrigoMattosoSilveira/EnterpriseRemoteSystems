#!/usr/bin/env python3
"""Seed the deterministic Bite 31.4 Brazilian demo scenario.

The scenario is deliberately isolated in its own Tenant and is intended only for
non-Production demonstration databases. It uses stable IDs and synthetic data;
no Production/customer data is read or copied.
"""
from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "backend" / "data" / "brazilian-demo.db"
DEFAULT_AS_OF = date(2026, 9, 18)
TENANT_ID = "demo-br-serra-dourada"
TENANT_CODE = "DEMO_BR_SERRA_DOURADA"
TENANT_NAME = "Mineração Serra Dourada — DEMO"
TENANT_ADMIN_LOGIN = "demo.tenant-admin@example.test"
TENANT_ADMIN_PASSWORD = "Demo-31.4-Brasil!"
TENANT_ADMIN_PASSWORD_HASH = "$2a$10$k8rzfs2R2.9Mr3WYNJGVn.ww0hwJMi0ZT4JmNPwpC9LVSLZVMSAdy"
SELF_SERVICE_PASSWORD = "Demo-31.4-Person!"
SELF_SERVICE_PASSWORD_HASH = "$2a$10$wAen/MHbc9shK9ao7/yWee3YX7FHcKVa2T2xyuoObrfY4eJUD3P3i"
SELF_SERVICE_KEYS = ("joao", "camila", "rafael")

PERSONS = {
    "admin": ("Mariana", "Alves", "Mari Admin"),
    "joao": ("João", "Ferreira", "João"),
    "camila": ("Camila", "Souza", "Cami"),
    "rafael": ("Rafael", "Lima", "Rafa"),
    "beatriz": ("Beatriz", "Nascimento", "Bia"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed the Bite 31.4 Brazilian demo scenario.")
    parser.add_argument(
        "--db-path",
        default=os.environ.get("DB_PATH") or os.environ.get("DATABASE_PATH") or str(DEFAULT_DB),
        help="SQLite database path. Defaults to backend/data/brazilian-demo.db.",
    )
    parser.add_argument(
        "--as-of",
        default=os.environ.get("BRAZILIAN_DEMO_AS_OF", DEFAULT_AS_OF.isoformat()),
        help="Scenario anchor date (YYYY-MM-DD). Same date => same business scenario.",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Verify an already-seeded scenario without changing the database.",
    )
    return parser.parse_args()


def parse_as_of(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise SystemExit("--as-of must be YYYY-MM-DD") from exc


def guard_environment() -> None:
    app_env = os.environ.get("APP_ENV", "development").strip().lower()
    if app_env in {"production", "prod"}:
        raise SystemExit("Refusing to seed the Brazilian demo dataset in Production.")


def connect(path: Path) -> sqlite3.Connection:
    if not path.exists():
        raise SystemExit(f"Database does not exist: {path}. Run migrations/reset target first.")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def require_schema(conn: sqlite3.Connection) -> None:
    required = {
        "tenants", "reference_data", "global_people", "person_tenant_memberships",
        "collaborator_journeys", "work_periods", "work_period_assignments",
        "gold_production_entries", "accrual_runs", "accrual_items", "expenses",
        "ledger_entries", "ledger_receipts", "gold_prices", "expense_price_list_items",
        "authz_actors", "authz_roles", "authz_actor_role_grants", "auth_user_accounts",
        "auth_account_people", "auth_account_actors",
    }
    existing = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    missing = sorted(required - existing)
    if missing:
        raise SystemExit("Missing required migrated table(s): " + ", ".join(missing))


def ts(day: date, hour: int = 12, minute: int = 0) -> str:
    return datetime.combine(day, time(hour, minute), tzinfo=timezone.utc).isoformat()


def local_ts(day: date, hour: int, minute: int = 0) -> str:
    # Pará/Brasília business-time offset used only for deterministic fixture instants.
    return f"{day.isoformat()}T{hour:02d}:{minute:02d}:00-03:00"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def demo_id(*parts: str) -> str:
    return "demo-br-" + "-".join(slug(p) for p in parts)


def cpf_from_seed(seed: int) -> str:
    digits = [int(x) for x in f"{seed:09d}"[-9:]]
    s1 = sum(d * w for d, w in zip(digits, range(10, 1, -1)))
    r1 = (s1 * 10) % 11
    d1 = 0 if r1 == 10 else r1
    digits10 = digits + [d1]
    s2 = sum(d * w for d, w in zip(digits10, range(11, 1, -1)))
    r2 = (s2 * 10) % 11
    d2 = 0 if r2 == 10 else r2
    # Deliberately invalidate the last check digit. The value keeps a realistic
    # CPF presentation while being unsuitable for real identity verification.
    d2 = (d2 + 1) % 10
    raw = "".join(map(str, digits + [d1, d2]))
    return f"{raw[:3]}.{raw[3:6]}.{raw[6:9]}-{raw[9:]}"


def insert(conn: sqlite3.Connection, table: str, values: dict[str, object]) -> None:
    cols = list(values)
    marks = ",".join("?" for _ in cols)
    conn.execute(
        f"INSERT INTO {table} ({','.join(cols)}) VALUES ({marks})",
        [values[c] for c in cols],
    )


def one(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> sqlite3.Row:
    row = conn.execute(sql, params).fetchone()
    if row is None:
        raise RuntimeError(f"Expected row was not found: {sql} {params}")
    return row


def clone_tenant_baseline(conn: sqlite3.Connection, now: str) -> None:
    for row in conn.execute(
        """SELECT type,code,label,description,active,sort_order,metadata_json
           FROM reference_data WHERE tenant_id='default' ORDER BY type,sort_order,code"""
    ):
        insert(conn, "reference_data", {
            "id": demo_id("ref", row["type"], row["code"]), "tenant_id": TENANT_ID,
            "type": row["type"], "code": row["code"], "label": row["label"],
            "description": row["description"], "active": row["active"],
            "sort_order": row["sort_order"], "metadata_json": row["metadata_json"],
            "created_at": now, "updated_at": now,
        })
    for row in conn.execute(
        """SELECT item_type,code,description,unit_price_brl,active,sort_order
           FROM expense_price_list_items WHERE tenant_id='default' AND active=1
           ORDER BY item_type,sort_order,code"""
    ):
        insert(conn, "expense_price_list_items", {
            "id": demo_id("price", row["code"]), "created_at": now, "updated_at": now,
            "tenant_id": TENANT_ID, "item_type": row["item_type"], "code": row["code"],
            "description": row["description"], "unit_price_brl": row["unit_price_brl"],
            "active": 1, "sort_order": row["sort_order"], "superseded_price_list_item_id": None,
        })


def ensure_reference(conn: sqlite3.Connection, typ: str, code: str, label: str, description: str, sort_order: int, now: str) -> None:
    if conn.execute("SELECT 1 FROM reference_data WHERE tenant_id=? AND type=? AND code=?", (TENANT_ID, typ, code)).fetchone():
        return
    insert(conn, "reference_data", {
        "id": demo_id("ref", typ, code), "tenant_id": TENANT_ID, "type": typ, "code": code,
        "label": label, "description": description, "active": 1, "sort_order": sort_order,
        "metadata_json": None, "created_at": now, "updated_at": now,
    })


def ensure_required_references(conn: sqlite3.Connection, now: str) -> None:
    required = [
        ("person_status", "ACTIVE", "Active", "Currently under contract", 10),
        ("collaborator_status", "ACTIVE", "Active", "Active collaborator journey", 10),
        ("collaborator_status", "FINISHED", "Finished", "Finished collaborator journey", 20),
        ("method", "DAILY", "Daily wage", "Paid by daily wage", 10),
        ("method", "SALARY", "Salary", "Paid by salary", 20),
        ("method", "COMMISSION", "Commission", "Paid by production commission", 30),
        ("sector", "UNDERGROUND_MINING", "Underground Mining", "Mine extraction and underground production work", 20),
        ("sector", "PROCESSING", "Processing", "Ore handling, processing, and production support", 30),
        ("sector", "SITE_SUPPORT", "Site Support", "Logistics, supplies, and camp/site support work", 40),
        ("sector", "MAINTENANCE", "Maintenance", "Equipment, infrastructure, and site maintenance work", 50),
        ("location", "MAIN_MINE", "Main Mine", "Default mine location", 10),
        ("location", "NORTH_PIT", "North Pit", "North production area", 20),
        ("location", "PROCESSING_PLANT", "Processing Plant", "Ore and gold processing area", 40),
        ("location", "CAMP", "Camp", "Camp and lodging area", 50),
        ("task", "DRILLING", "Drilling", "Drilling and preparation work", 20),
        ("task", "GOLD_PROCESSING", "Gold Processing", "Gold processing and production support", 40),
        ("task", "EQUIPMENT_MAINTENANCE", "Equipment Maintenance", "Equipment inspection, repair, and maintenance", 50),
        ("task", "CAMP_SUPPORT", "Camp Support", "Camp support, meals, cleaning, and logistics", 60),
        ("expense_category", "CANTEEN", "Canteen", "Canteen expense", 10),
        ("expense_category", "FLIGHT", "Flight", "Flight expense", 20),
        ("value_unit", "BRL", "Brazilian Real", "Brazilian Real monetary value", 10),
        ("value_unit", "GOLD_GRAM", "Gold Gram", "Grams of gold", 20),
    ]
    for row in required:
        ensure_reference(conn, *row, now)


def ref(conn: sqlite3.Connection, typ: str, code: str) -> str:
    return one(conn, "SELECT id FROM reference_data WHERE tenant_id=? AND type=? AND code=?", (TENANT_ID, typ, code))["id"]


def price_item(conn: sqlite3.Connection, code: str) -> sqlite3.Row:
    return one(conn, "SELECT * FROM expense_price_list_items WHERE tenant_id=? AND code=? AND active=1", (TENANT_ID, code))


def seed_person(conn: sqlite3.Connection, key: str, status_id: str, now: str, *, eligible: bool = True) -> tuple[str, str]:
    first, last, nickname = PERSONS[key]
    person_id = demo_id("person", key)
    membership_id = demo_id("membership", key)
    idx = list(PERSONS).index(key) + 1
    pix = f"demo31.4.{key}@pix.example.test"
    insert(conn, "global_people", {
        "id": person_id, "first_name": first, "last_name": last, "nickname": nickname,
        "cpf": cpf_from_seed(314000000 + idx), "rg": f"DEMO-31.4-{idx:02d}",
        "cellular": f"11900003{idx:03d}", "email": f"demo31.4.{key}@example.test",
        "street1": f"Rua Fictícia ERS, {310 + idx}", "street2": "Dados sintéticos de demonstração",
        "state": "PA", "cep": f"68180-{310 + idx:03d}", "city": "Itaituba", "country": "Brasil",
        "bank_name": "Banco Demonstração", "bank_number": "314", "checking_account": f"0314-{idx}",
        "pix_key": pix, "emergency_name": f"Contato Demo {idx}", "emergency_cellular": f"11910003{idx:03d}",
        "emergency_email": f"demo31.4.emergency{idx}@example.test",
        "profile_completion_status": "COMPLETE", "can_create_collaborator": 1 if eligible else 0,
        "created_at": now, "updated_at": now, "operational_active": 1,
    })
    insert(conn, "person_tenant_memberships", {
        "id": membership_id, "created_at": now, "updated_at": now, "tenant_id": TENANT_ID,
        "person_id": person_id, "status_id": status_id,
        "notes": "Bite 31.4 synthetic Brazilian demo Membership — not real customer/person data.",
    })
    return person_id, membership_id


def seed_tenant_admin_auth(conn: sqlite3.Connection, person_id: str, membership_id: str, now: str) -> None:
    actor_id = demo_id("actor", "tenant-admin")
    account_id = demo_id("account", "tenant-admin")
    insert(conn, "authz_actors", {
        "id": actor_id, "actor_key": "demo-br-tenant-admin", "display_name": "Mariana Alves — Administradora Demo",
        "active": 1, "created_at": now, "updated_at": now,
    })
    insert(conn, "auth_user_accounts", {
        "id": account_id, "login": TENANT_ADMIN_LOGIN, "password_hash": TENANT_ADMIN_PASSWORD_HASH,
        "active": 1, "must_change_password": 0, "last_login_at": None, "password_changed_at": now,
        "created_at": now, "updated_at": now, "security_suspended": 0,
    })
    insert(conn, "auth_account_people", {
        "account_id": account_id, "person_id": person_id, "created_at": now, "updated_at": now,
    })
    insert(conn, "auth_account_actors", {
        "account_id": account_id, "actor_id": actor_id, "scope_type": "TENANT",
        "tenant_id": TENANT_ID, "membership_id": membership_id, "created_at": now, "updated_at": now,
    })
    role_id = one(conn, "SELECT id FROM authz_roles WHERE code='TENANT_ADMIN' AND active=1")["id"]
    insert(conn, "authz_actor_role_grants", {
        "id": demo_id("grant", "tenant-admin"), "actor_id": actor_id, "role_id": role_id,
        "tenant_id": TENANT_ID, "active": 1, "created_at": now, "updated_at": now,
        "lifecycle_suspended": 0,
    })


def seed_self_service_auth(conn: sqlite3.Connection, key: str, person_id: str, membership_id: str, now: str) -> None:
    first, last, nickname = PERSONS[key]
    actor_id = demo_id("actor", key)
    account_id = demo_id("account", key)
    login = f"demo31.4.{key}@example.test"
    display_name = f"{first} {last} ({nickname})"
    insert(conn, "authz_actors", {
        "id": actor_id,
        "actor_key": f"person:{person_id}::tenant::{TENANT_ID}",
        "display_name": display_name,
        "active": 1, "created_at": now, "updated_at": now,
    })
    insert(conn, "auth_user_accounts", {
        "id": account_id, "login": login, "password_hash": SELF_SERVICE_PASSWORD_HASH,
        "active": 1, "must_change_password": 0, "last_login_at": None, "password_changed_at": now,
        "created_at": now, "updated_at": now, "security_suspended": 0,
    })
    insert(conn, "auth_account_people", {
        "account_id": account_id, "person_id": person_id, "created_at": now, "updated_at": now,
    })
    insert(conn, "auth_account_actors", {
        "account_id": account_id, "actor_id": actor_id, "scope_type": "TENANT",
        "tenant_id": TENANT_ID, "membership_id": membership_id, "created_at": now, "updated_at": now,
    })


def seed_journey(conn: sqlite3.Connection, key: str, membership_id: str, method: str, sector: str,
                 location: str, task: str, start: date, end: date, now: str, *, finished: bool = False,
                 payment: float = 0, commission: float | None = None) -> str:
    jid = demo_id("journey", key)
    fixed = payment if method == "SALARY" else None
    daily = payment if method in {"DAILY", "DAILY_WAGES"} else None
    closed_at = ts(end, 20) if finished else None
    insert(conn, "collaborator_journeys", {
        "id": jid, "created_at": now, "updated_at": now, "tenant_id": TENANT_ID,
        "journey_start_date": start.isoformat(), "default_end_date": end.isoformat(), "extension_days": 0,
        "projected_end_date": end.isoformat(), "payment_method_id": ref(conn, "method", method),
        "payment_value": commission if commission is not None else payment,
        "sector_id": ref(conn, "sector", sector), "location_id": ref(conn, "location", location),
        "task_id": ref(conn, "task", task), "status_id": ref(conn, "collaborator_status", "FINISHED" if finished else "ACTIVE"),
        "notes": "Bite 31.4 synthetic demo Journey.", "closed_at": closed_at,
        "fixed_monthly_brl_amount": fixed, "daily_brl_amount": daily,
        "gold_commission_percent": commission, "time_off_gold_split_percent": None,
        "sick_day_off_replacement_gold_grams": None, "planning_availability": "ACTIVE",
        "membership_id": membership_id,
    })
    return jid


def seed_work_period(conn: sqlite3.Connection, key: str, work_date: date, status: str, now: str) -> str:
    wid = demo_id("work-period", key)
    insert(conn, "work_periods", {
        "id": wid, "tenant_id": TENANT_ID, "work_date": work_date.isoformat(), "period_code": "DAY",
        "name": "06:00-18:00", "starts_at": local_ts(work_date, 6), "ends_at": local_ts(work_date, 18),
        "status": status, "informed_at": ts(work_date, 19) if status != "PLANNING" else None,
        "accrual_opened_at": ts(work_date, 19, 15) if status in {"FULLY_POSTED", "PARTIALLY_POSTED", "CLOSED"} else None,
        "closed_at": ts(work_date, 20) if status == "CLOSED" else None,
        "created_at": now, "updated_at": now,
    })
    return wid


def seed_assignment(conn: sqlite3.Connection, period_id: str, journey_id: str, key: str, sector: str,
                    location: str, task: str, now: str, actual: str | None) -> str:
    aid = demo_id("assignment", key)
    insert(conn, "work_period_assignments", {
        "id": aid, "tenant_id": TENANT_ID, "work_period_id": period_id, "collaborator_id": journey_id,
        "planned_status": "INCLUDED", "actual_status": actual, "replacement_for_assignment_id": None,
        "sector_id": ref(conn, "sector", sector), "location_id": ref(conn, "location", location),
        "task_id": ref(conn, "task", task), "active": 1, "created_at": now, "updated_at": now,
        "planning_availability": "ACTIVE",
    })
    return aid


def ledger(conn: sqlite3.Connection, key: str, person_id: str, journey_id: str, unit: str,
           entry_type: str, direction: str, amount: float, effective: date, source_type: str,
           source_id: str, now: str, description: str) -> str:
    lid = demo_id("ledger", key)
    insert(conn, "ledger_entries", {
        "id": lid, "created_at": now, "updated_at": now, "tenant_id": TENANT_ID,
        "collaborator_id": journey_id, "value_unit_id": ref(conn, "value_unit", unit),
        "entry_type": entry_type, "direction": direction, "amount": amount,
        "effective_date": effective.isoformat(), "source_type": source_type, "source_id": source_id,
        "description": description, "active": 1, "correction_type": "ORIGINAL",
        "related_entry_id": None, "correction_reason": None, "authorized_by": "demo-br-tenant-admin",
        "authorized_at": now, "correction_reason_code": None, "correction_reason_text": None,
        "second_approved_by": None, "second_approved_at": None, "second_approval_notes": None,
        "person_id": person_id,
    })
    return lid


def seed_receipt(conn: sqlite3.Connection, key: str, person_id: str, journey_id: str, ledger_id: str,
                 status: str, now: str, completed_at: str | None = None) -> None:
    receipt_no = f"RCP-DEMO-BR-{1 if key == 'pending' else 2:04d}"
    returned = status == "RETURNED"
    insert(conn, "ledger_receipts", {
        "id": demo_id("receipt", key), "created_at": now, "updated_at": now, "tenant_id": TENANT_ID,
        "collaborator_id": journey_id, "ledger_entry_id": ledger_id, "receipt_number": receipt_no,
        "receipt_type": "LEDGER_DEBIT", "status": status,
        "issued_at": completed_at if returned else None, "issued_by": "demo-br-tenant-admin" if returned else None,
        "printed_at": completed_at if returned else None, "signed_at": completed_at if returned else None,
        "returned_at": completed_at if returned else None, "received_by": "demo-br-tenant-admin" if returned else None,
        "signed_document_ref": "demo/RCP-DEMO-BR-0002-signed.pdf" if returned else None,
        "cancelled_at": None, "cancelled_by": None, "cancellation_reason": None,
        "notes": "Bite 31.4 synthetic receipt state.", "person_id": person_id,
        "receipt_purpose": "LEDGER_DEBIT", "payment_direction": "ACCOUNT_DEBIT", "accepting_party": "COLLABORATOR",
        "accepted_at": None, "accepted_by": None, "acceptance_method": None,
    })


def seed_scenario(conn: sqlite3.Connection, as_of: date) -> None:
    if conn.execute("SELECT 1 FROM tenants WHERE id=?", (TENANT_ID,)).fetchone():
        raise SystemExit(
            f"Demo Tenant {TENANT_ID} already exists. Use `make brazilian-demo-local-reset` for a clean repeatable scenario."
        )
    now = ts(as_of, 12)
    insert(conn, "tenants", {
        "id": TENANT_ID, "code": TENANT_CODE, "name": TENANT_NAME,
        "description": "Dados totalmente sintéticos para demonstrações brasileiras do ERS. Não usar como dados reais.",
        "active": 1, "created_at": now, "updated_at": now,
    })
    clone_tenant_baseline(conn, now)
    ensure_required_references(conn, now)

    active_status = ref(conn, "person_status", "ACTIVE")
    identities: dict[str, tuple[str, str]] = {}
    for key in PERSONS:
        identities[key] = seed_person(conn, key, active_status, now, eligible=(key != "admin"))
    seed_tenant_admin_auth(conn, identities["admin"][0], identities["admin"][1], now)
    for key in SELF_SERVICE_KEYS:
        seed_self_service_auth(conn, key, identities[key][0], identities[key][1], now)

    joao_j = seed_journey(conn, "joao-current", identities["joao"][1], "DAILY", "UNDERGROUND_MINING", "NORTH_PIT", "DRILLING", as_of - timedelta(days=45), as_of + timedelta(days=45), now, payment=300)
    camila_j = seed_journey(conn, "camila-current", identities["camila"][1], "COMMISSION", "PROCESSING", "PROCESSING_PLANT", "GOLD_PROCESSING", as_of - timedelta(days=60), as_of + timedelta(days=30), now, commission=5)
    rafael_old = seed_journey(conn, "rafael-history", identities["rafael"][1], "DAILY", "SITE_SUPPORT", "CAMP", "CAMP_SUPPORT", as_of - timedelta(days=220), as_of - timedelta(days=100), now, finished=True, payment=280)
    rafael_j = seed_journey(conn, "rafael-current", identities["rafael"][1], "DAILY", "MAINTENANCE", "MAIN_MINE", "EQUIPMENT_MAINTENANCE", as_of - timedelta(days=50), as_of + timedelta(days=40), now, payment=350)

    completed_date = as_of - timedelta(days=2)
    planning_date = as_of + timedelta(days=1)
    completed = seed_work_period(conn, "completed", completed_date, "FULLY_POSTED", now)
    planning = seed_work_period(conn, "planning", planning_date, "PLANNING", now)

    a_joao = seed_assignment(conn, completed, joao_j, "completed-joao", "UNDERGROUND_MINING", "NORTH_PIT", "DRILLING", now, "WORKED")
    a_camila = seed_assignment(conn, completed, camila_j, "completed-camila", "PROCESSING", "PROCESSING_PLANT", "GOLD_PROCESSING", now, "WORKED")
    a_rafael = seed_assignment(conn, completed, rafael_j, "completed-rafael", "MAINTENANCE", "MAIN_MINE", "EQUIPMENT_MAINTENANCE", now, "WORKED")
    seed_assignment(conn, planning, joao_j, "planning-joao", "UNDERGROUND_MINING", "NORTH_PIT", "DRILLING", now, None)
    seed_assignment(conn, planning, camila_j, "planning-camila", "PROCESSING", "PROCESSING_PLANT", "GOLD_PROCESSING", now, None)
    seed_assignment(conn, planning, rafael_j, "planning-rafael", "MAINTENANCE", "MAIN_MINE", "EQUIPMENT_MAINTENANCE", now, None)

    insert(conn, "gold_prices", {
        "id": demo_id("gold-price"), "created_at": now, "updated_at": now, "tenant_id": TENANT_ID,
        "price_date": (as_of - timedelta(days=3)).isoformat(), "brl_per_gram": 742.35,
        "recorded_by": "demo-br-tenant-admin", "notes": "Bite 31.4 synthetic gold price.", "active": 1,
    })
    insert(conn, "gold_production_entries", {
        "id": demo_id("gold-production"), "tenant_id": TENANT_ID, "work_period_id": completed,
        "location_id": ref(conn, "location", "PROCESSING_PLANT"), "production_date": completed_date.isoformat(),
        "gold_grams_produced": 80.0, "active": 1, "notes": "Bite 31.4 synthetic production.",
        "created_at": now, "updated_at": now,
    })

    run_id = demo_id("accrual-run")
    insert(conn, "accrual_runs", {
        "id": run_id, "tenant_id": TENANT_ID, "work_period_id": completed, "status": "POSTED",
        "accrual_date": completed_date.isoformat(), "notes": "Bite 31.4 posted demo accrual.",
        "created_at": now, "updated_at": now,
    })
    accruals = [
        ("joao", identities["joao"][0], joao_j, a_joao, "DAILY_BRL", 300.0, None),
        ("camila", identities["camila"][0], camila_j, a_camila, "GOLD_COMMISSION", None, 4.0),
        ("rafael", identities["rafael"][0], rafael_j, a_rafael, "DAILY_BRL", 350.0, None),
    ]
    for key, person_id, journey_id, assignment_id, calc, brl, gold in accruals:
        item_id = demo_id("accrual-item", key)
        insert(conn, "accrual_items", {
            "id": item_id, "tenant_id": TENANT_ID, "accrual_run_id": run_id, "work_period_id": completed,
            "work_period_assignment_id": assignment_id, "collaborator_id": journey_id,
            "calculation_type": calc, "direction": "CREDIT", "brl_amount": brl, "gold_gram_amount": gold,
            "status": "POSTED", "pending_reason": None, "description": f"Bite 31.4 {key} posted earning.",
            "created_at": now, "updated_at": now, "person_id": person_id,
        })
        ledger(conn, f"earning-{key}", person_id, journey_id, "GOLD_GRAM" if gold is not None else "BRL",
               "EARNING_CREDIT", "CREDIT", gold if gold is not None else brl, completed_date,
               "WORK_PERIOD_ASSIGNMENT", assignment_id, now, f"Bite 31.4 posted earning for {key}.")

    meal = price_item(conn, "CANTEEN_MEAL")
    joao_expense_id = demo_id("expense", "joao-meals")
    insert(conn, "expenses", {
        "id": joao_expense_id, "created_at": now, "updated_at": now, "tenant_id": TENANT_ID,
        "person_id": identities["joao"][0], "collaborator_id": joao_j,
        "expense_category_id": ref(conn, "expense_category", "CANTEEN"), "value_unit_id": ref(conn, "value_unit", "BRL"),
        "amount": 70.0, "expense_date": (as_of - timedelta(days=1)).isoformat(),
        "description": "2 refeições — exemplo de despesa pendente.", "active": 1,
        "cancelled_at": None, "cancelled_by": None, "cancellation_reason": None, "recreated_from_expense_id": None,
        "price_list_item_id": meal["id"], "price_list_item_code": meal["code"], "item_type": meal["item_type"],
        "item_description": meal["description"], "quantity": 2.0, "unit_price_brl": meal["unit_price_brl"],
        "currency_code": "BRL", "gold_price_id": None, "gold_brl_per_gram": None, "gold_price_date": None,
        "unit_price_amount": meal["unit_price_brl"], "total_amount": 70.0, "calculation_method": "BRL_PRICE_LIST",
        "calculation_details_json": '{"fixture":"bite-31.4","quantity":2,"unitPriceBrl":35}',
    })
    joao_ledger = ledger(conn, "expense-joao-meals", identities["joao"][0], joao_j, "BRL", "EXPENSE_DEDUCTION", "DEBIT", 70.0,
                         as_of - timedelta(days=1), "EXPENSE", joao_expense_id, now, "Duas refeições de demonstração.")
    seed_receipt(conn, "pending", identities["joao"][0], joao_j, joao_ledger, "PENDING_ISSUE", now)

    rafael_expense_id = demo_id("expense", "rafael-flight")
    insert(conn, "expenses", {
        "id": rafael_expense_id, "created_at": now, "updated_at": now, "tenant_id": TENANT_ID,
        "person_id": identities["rafael"][0], "collaborator_id": rafael_j,
        "expense_category_id": ref(conn, "expense_category", "FLIGHT"), "value_unit_id": ref(conn, "value_unit", "BRL"),
        "amount": 350.0, "expense_date": (as_of - timedelta(days=1)).isoformat(),
        "description": "Trecho aéreo sintético já controlado por recibo devolvido.", "active": 1,
        "cancelled_at": None, "cancelled_by": None, "cancellation_reason": None, "recreated_from_expense_id": None,
        "price_list_item_id": None, "price_list_item_code": "", "item_type": "", "item_description": "Passagem aérea demo",
        "quantity": None, "unit_price_brl": None, "currency_code": "BRL", "gold_price_id": None,
        "gold_brl_per_gram": None, "gold_price_date": None, "unit_price_amount": None, "total_amount": 350.0,
        "calculation_method": "DIRECT_AMOUNT", "calculation_details_json": '{"fixture":"bite-31.4"}',
    })
    rafael_ledger = ledger(conn, "expense-rafael-flight", identities["rafael"][0], rafael_j, "BRL", "EXPENSE_DEDUCTION", "DEBIT", 350.0,
                           as_of - timedelta(days=1), "EXPENSE", rafael_expense_id, now, "Passagem aérea demo já controlada.")
    seed_receipt(conn, "returned", identities["rafael"][0], rafael_j, rafael_ledger, "RETURNED", now, ts(as_of - timedelta(days=1), 18))

    # Ensure the historic Journey is present and zero-balance by design.
    assert rafael_old


def balance(conn: sqlite3.Connection, person_id: str, unit_code: str) -> float:
    row = conn.execute(
        """SELECT COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN le.amount ELSE -le.amount END),0)
           FROM ledger_entries le JOIN reference_data r ON r.id=le.value_unit_id
           WHERE le.tenant_id=? AND le.person_id=? AND le.active=1 AND r.code=?""",
        (TENANT_ID, person_id, unit_code),
    ).fetchone()
    return float(row[0])


def verify_scenario(conn: sqlite3.Connection, as_of: date) -> None:
    violations = conn.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise SystemExit(f"Foreign-key violations found in demo database: {violations[:5]}")

    tenant = one(conn, "SELECT * FROM tenants WHERE id=?", (TENANT_ID,))
    if tenant["name"] != TENANT_NAME or not tenant["active"]:
        raise SystemExit("Brazilian demo Tenant is missing or inconsistent.")

    expected_people = set(PERSONS)
    for key in expected_people:
        one(conn, "SELECT id FROM global_people WHERE id=?", (demo_id("person", key),))
        one(conn, "SELECT id FROM person_tenant_memberships WHERE id=? AND tenant_id=?", (demo_id("membership", key), TENANT_ID))

    one(conn, "SELECT id FROM auth_user_accounts WHERE login=? AND active=1", (TENANT_ADMIN_LOGIN,))
    one(conn, "SELECT actor_id FROM auth_account_actors WHERE account_id=? AND tenant_id=?", (demo_id("account", "tenant-admin"), TENANT_ID))
    for key in SELF_SERVICE_KEYS:
        person_id = demo_id("person", key)
        membership_id = demo_id("membership", key)
        account_id = demo_id("account", key)
        actor_id = demo_id("actor", key)
        login = f"demo31.4.{key}@example.test"
        one(conn, "SELECT id FROM auth_user_accounts WHERE id=? AND login=? AND active=1 AND must_change_password=0 AND security_suspended=0", (account_id, login))
        one(conn, "SELECT account_id FROM auth_account_people WHERE account_id=? AND person_id=?", (account_id, person_id))
        one(conn, "SELECT account_id FROM auth_account_actors WHERE account_id=? AND actor_id=? AND scope_type='TENANT' AND tenant_id=? AND membership_id=?", (account_id, actor_id, TENANT_ID, membership_id))
        one(conn, "SELECT id FROM authz_actors WHERE id=? AND actor_key=? AND active=1", (actor_id, f"person:{person_id}::tenant::{TENANT_ID}"))
        delegated = conn.execute("SELECT COUNT(*) FROM authz_actor_role_grants WHERE actor_id=? AND active=1", (actor_id,)).fetchone()[0]
        if delegated:
            raise SystemExit(f"Self-service demo Actor {actor_id} unexpectedly has {delegated} delegated Role Grant(s).")

    if conn.execute("SELECT COUNT(*) FROM collaborator_journeys WHERE tenant_id=?", (TENANT_ID,)).fetchone()[0] != 4:
        raise SystemExit("Expected four demo Journeys (including one historical Journey).")
    if conn.execute("SELECT COUNT(*) FROM work_periods WHERE tenant_id=?", (TENANT_ID,)).fetchone()[0] != 2:
        raise SystemExit("Expected two demo Work Periods.")
    if conn.execute("SELECT COUNT(*) FROM expenses WHERE tenant_id=?", (TENANT_ID,)).fetchone()[0] != 2:
        raise SystemExit("Expected two demo Expenses.")

    for table in ("person_tenant_memberships", "collaborator_journeys", "work_periods", "expenses", "ledger_entries", "ledger_receipts"):
        leaked = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE tenant_id='default' AND id LIKE 'demo-br-%'"
        ).fetchone()[0]
        if leaked:
            raise SystemExit(f"Tenant-isolation violation: {leaked} demo row(s) found in default/{table}.")

    statuses = {r[0] for r in conn.execute("SELECT status FROM ledger_receipts WHERE tenant_id=?", (TENANT_ID,))}
    if statuses != {"PENDING_ISSUE", "RETURNED"}:
        raise SystemExit(f"Expected pending and returned receipt states, got {sorted(statuses)}")

    joao = demo_id("person", "joao")
    camila = demo_id("person", "camila")
    rafael = demo_id("person", "rafael")
    checks = {
        "João BRL": (balance(conn, joao, "BRL"), 230.0),
        "Camila GOLD_GRAM": (balance(conn, camila, "GOLD_GRAM"), 4.0),
        "Rafael BRL": (balance(conn, rafael, "BRL"), 0.0),
    }
    for label, (actual, expected) in checks.items():
        if abs(actual - expected) > 1e-9:
            raise SystemExit(f"Unexpected {label} balance: {actual}; expected {expected}")

    planning_date = (as_of + timedelta(days=1)).isoformat()
    one(conn, "SELECT id FROM work_periods WHERE tenant_id=? AND work_date=? AND status='PLANNING'", (TENANT_ID, planning_date))
    one(conn, "SELECT id FROM accrual_runs WHERE tenant_id=? AND status='POSTED'", (TENANT_ID,))


def print_summary(as_of: date, db_path: Path) -> None:
    print("Bite 31.4 Brazilian demo scenario ready")
    print(f"Database: {db_path}")
    print(f"Scenario date: {as_of.isoformat()}")
    print(f"Tenant: {TENANT_NAME} ({TENANT_CODE})")
    print(f"Tenant Administrator login: {TENANT_ADMIN_LOGIN}")
    print(f"Tenant Administrator password: {TENANT_ADMIN_PASSWORD}")
    print(f"Self-service password (João/Camila/Rafael): {SELF_SERVICE_PASSWORD}")
    for key in SELF_SERVICE_KEYS:
        first, last, _ = PERSONS[key]
        print(f"{first} {last} login: demo31.4.{key}@example.test")
    print("Story: People → Journeys → Planning → Gold Production/Accrual → Expenses → Balances/Ledger → Receipts")
    print("Synthetic data only; never sourced from Production or a real customer/person dataset.")


def main() -> int:
    args = parse_args()
    guard_environment()
    as_of = parse_as_of(args.as_of)
    db_path = Path(args.db_path).expanduser().resolve()
    conn = connect(db_path)
    try:
        require_schema(conn)
        if args.verify_only:
            verify_scenario(conn, as_of)
        else:
            with conn:
                seed_scenario(conn, as_of)
                verify_scenario(conn, as_of)
        print_summary(as_of, db_path)
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
