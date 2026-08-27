#!/usr/bin/env python3
"""Seed deterministic Bite 30G manual-promotion fixtures into local ERS SQLite.

LOCAL DEVELOPMENT ONLY. Stop the backend before running this script.

Default database:
    backend/data/app.db

Default credentials:
    Operator D: manual30g.operator@example.test
    Identity A: manual30g.identity-a@example.test
    Identity B: manual30g.identity-b@example.test
    Identity C: manual30g.identity-c@example.test
    Password for all accounts: Manual-30C-Password!

Default tenant mapping:
    Tenant A: Byte 28A Manual Test (created if missing)
    Tenant B: default

The default batch produces deterministic IDs used verbatim by the accompanying
Markdown, DevTools helper, and SQL verification script.

For a clean restart of the same deterministic batch, pass
--reset-existing-batch. The script restores the clean pre-seed database backup
recorded for the batch (or discovers the newest compatible clean pre-seed
backup). If no compatible clean backup survives, it builds a fresh temporary
database from the repository migrations, validates it, safely replaces the
local database, and then recreates the fixture. This avoids trying to delete
immutable Authentication Accounts or historical identity rows in place.

To keep an existing fixture and create a second independent data set instead,
pass --batch retry1.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import socket
import sqlite3
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
# When copied into <repo>/scripts, this resolves to the ERS root. When executed
# from the downloaded promotion kit, --db-path should be supplied explicitly.
ROOT = SCRIPT_DIR.parent
DEFAULT_DB = ROOT / "backend" / "data" / "app.db"
DEFAULT_TENANT_A = "Byte 28A Manual Test"
DEFAULT_TENANT_B = "default"
DEFAULT_BATCH = "manual30g"
DEFAULT_PASSWORD = "Manual-30C-Password!"
DEFAULT_PASSWORD_HASH = "$2a$10$2aGDP1WNWYv3Q2aC4URnv.t40kw1HHjYOHUfvmctSf8Pb7D6Vo0t2"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed Bite 30G manual promotion data.")
    p.add_argument("--db-path", default=os.getenv("DATABASE_PATH") or str(DEFAULT_DB))
    p.add_argument("--tenant-a", default=DEFAULT_TENANT_A)
    p.add_argument("--tenant-b", default=DEFAULT_TENANT_B)
    p.add_argument("--batch", default=DEFAULT_BATCH)
    p.add_argument("--no-backup", action="store_true")
    p.add_argument(
        "--reset-existing-batch",
        action="store_true",
        help=(
            "If the selected batch already exists, restore a compatible clean "
            "pre-seed database backup and reseed the same deterministic IDs. If "
            "no clean backup survives, rebuild a fresh local database from the "
            "repository migrations first. The backend must be stopped."
        ),
    )
    return p.parse_args()


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso_dt(value: datetime) -> str:
    return value.isoformat()


def normalize_batch(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-").lower()
    if not value:
        raise SystemExit("--batch must contain a letter or number")
    if len(value) > 30:
        raise SystemExit("--batch must be 30 characters or fewer")
    return value


def prefix(batch: str) -> str:
    return "manual30g" if batch == DEFAULT_BATCH else f"manual30g-{batch}"


def ident(batch: str, suffix: str) -> str:
    return f"{prefix(batch)}-{suffix}"


def deterministic_int(key: str, digits: int = 8) -> int:
    return int(hashlib.sha1(key.encode()).hexdigest()[:15], 16) % (10**digits)


def valid_cpf(key: str) -> str:
    base = f"{100_000_000 + deterministic_int(key):09d}"[-9:]
    if len(set(base)) == 1:
        base = "390533447"

    def digit(s: str, weight: int) -> str:
        total = sum(int(v) * (weight - i) for i, v in enumerate(s))
        result = 11 - (total % 11)
        return "0" if result >= 10 else str(result)

    d1 = digit(base, 10)
    return base + d1 + digit(base + d1, 11)


def row_or_none(conn: sqlite3.Connection, sql: str, params=()):
    return conn.execute(sql, params).fetchone()


def require_schema(conn: sqlite3.Connection) -> None:
    required = {
        "tenants", "reference_data", "global_people", "people",
        "person_tenant_memberships", "authz_actors", "authz_roles",
        "authz_actor_role_grants", "auth_user_accounts", "auth_account_people",
        "auth_account_actors", "collaborator_journeys", "work_periods",
        "work_period_assignments", "accrual_runs", "accrual_items", "expenses",
        "ledger_entries", "ledger_receipts", "journey_settlements", "tenant_settings",
    }
    present = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    missing = sorted(required - present)
    if missing:
        raise SystemExit("Missing required Bite 30 tables: " + ", ".join(missing))
    for table in ("expenses", "accrual_items", "ledger_entries", "ledger_receipts"):
        cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        if "person_id" not in cols:
            raise SystemExit(f"{table}.person_id is missing; apply migration 000057 first")
    expense_cols = {r[1] for r in conn.execute("PRAGMA table_info(expenses)")}
    for col in ("cancelled_at", "cancelled_by", "cancellation_reason", "recreated_from_expense_id"):
        if col not in expense_cols:
            raise SystemExit(f"expenses.{col} is missing; apply migration 000060 first")
    receipt_cols = {r[1] for r in conn.execute("PRAGMA table_info(ledger_receipts)")}
    for col in ("receipt_purpose", "payment_direction", "accepting_party", "accepted_at", "accepted_by", "acceptance_method"):
        if col not in receipt_cols:
            raise SystemExit(f"ledger_receipts.{col} is missing; apply migration 000059 first")
    triggers = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
    for trg in (
        "trg_collaborator_journey_zero_balance_close",
        "trg_ledger_receipts_acceptance_insert_guard",
        "trg_ledger_receipts_acceptance_update_guard",
        "trg_expenses_cancellation_insert_guard",
        "trg_expenses_cancellation_update_guard",
    ):
        if trg not in triggers:
            raise SystemExit(f"Required Bite 30G trigger {trg} is missing")

def resolve_tenant(conn: sqlite3.Connection, selector: str):
    candidates = [selector.strip()]
    lower = selector.strip().lower()
    if lower.startswith("byte "):
        candidates.append("Bite " + selector.strip()[5:])
    elif lower.startswith("bite "):
        candidates.append("Byte " + selector.strip()[5:])
    for candidate in candidates:
        row = row_or_none(
            conn,
            """SELECT id, code, name, active FROM tenants
               WHERE LOWER(id)=LOWER(?) OR LOWER(code)=LOWER(?) OR LOWER(name)=LOWER(?)
               ORDER BY CASE WHEN LOWER(id)=LOWER(?) THEN 0 WHEN LOWER(code)=LOWER(?) THEN 1 ELSE 2 END
               LIMIT 1""",
            (candidate, candidate, candidate, candidate, candidate),
        )
        if row:
            if not row["active"]:
                raise SystemExit(f"Tenant {row['name']} ({row['id']}) is inactive")
            return row
    return None


def ensure_tenant_a(conn: sqlite3.Connection, selector: str, batch: str):
    row = resolve_tenant(conn, selector)
    if row:
        return row, False
    if selector.strip().lower() not in {"byte 28a manual test", "bite 28a manual test"}:
        raise SystemExit(f"Tenant A {selector!r} was not found")
    ts = iso_dt(utc_now())
    tenant_id = ident(batch, "tenant-a")
    conn.execute(
        """INSERT INTO tenants(id,code,name,description,active,created_at,updated_at)
           VALUES(?,?,?,?,1,?,?)""",
        (tenant_id, f"MANUAL30G_{batch.upper()}", DEFAULT_TENANT_A,
         "Bite 30G local manual-promotion tenant", ts, ts),
    )
    return resolve_tenant(conn, tenant_id), True


def ensure_reference(conn, tenant_id: str, typ: str, code: str, label: str, batch: str, sort_order=10):
    row = row_or_none(
        conn,
        "SELECT id,type,code,label,active FROM reference_data WHERE tenant_id=? AND type=? AND code=? LIMIT 1",
        (tenant_id, typ, code),
    )
    if row:
        if not row["active"]:
            raise SystemExit(f"Required reference {tenant_id}/{typ}/{code} exists but is inactive")
        return row["id"]
    short = hashlib.sha1(f"{tenant_id}:{typ}:{code}".encode()).hexdigest()[:10]
    rid = ident(batch, f"ref-{short}")
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO reference_data(id,type,code,label,description,active,sort_order,metadata_json,created_at,updated_at,tenant_id)
           VALUES(?,?,?,?,?,1,?,NULL,?,?,?)""",
        (rid, typ, code, label, f"Bite 30G manual fixture {label}", sort_order, ts, ts, tenant_id),
    )
    return rid


def ensure_refs(conn, tenant_id: str, batch: str) -> dict[str, str]:
    return {
        "person_active": ensure_reference(conn, tenant_id, "person_status", "ACTIVE", "Active", batch, 10),
        "person_inactive": ensure_reference(conn, tenant_id, "person_status", "INACTIVE", "Inactive", batch, 20),
        "collab_active": ensure_reference(conn, tenant_id, "collaborator_status", "ACTIVE", "Active", batch, 10),
        "collab_finished": ensure_reference(conn, tenant_id, "collaborator_status", "FINISHED", "Finished", batch, 20),
        "method_daily": ensure_reference(conn, tenant_id, "method", "DAILY_WAGES", "Daily Wages", batch, 10),
        "sector": ensure_reference(conn, tenant_id, "sector", "MANUAL30G", "30G Manual Sector", batch, 900),
        "sector_alt": ensure_reference(conn, tenant_id, "sector", "MANUAL30G_ALT", "30G Manual Sector Alt", batch, 901),
        "location": ensure_reference(conn, tenant_id, "location", "MANUAL30G", "30G Manual Location", batch, 900),
        "location_alt": ensure_reference(conn, tenant_id, "location", "MANUAL30G_ALT", "30G Manual Location Alt", batch, 901),
        "task": ensure_reference(conn, tenant_id, "task", "MANUAL30G", "30G Manual Task", batch, 900),
        "task_alt": ensure_reference(conn, tenant_id, "task", "MANUAL30G_ALT", "30G Manual Task Alt", batch, 901),
        "brl": ensure_reference(conn, tenant_id, "value_unit", "BRL", "Brazilian Real", batch, 10),
        "gold": ensure_reference(conn, tenant_id, "value_unit", "GOLD_GRAM", "Gold Gram", batch, 20),
        "expense_other": ensure_reference(conn, tenant_id, "expense_category", "OTHER", "Other", batch, 40),
    }


def identity(batch: str, code: str, first: str, last: str) -> dict[str, str]:
    pfx = prefix(batch)
    key = f"bite30g:{batch}:{code}"
    login_name = "operator" if code == "operator" else f"identity-{code}"
    login = f"{pfx}.{login_name}@example.test".lower()
    return {
        "person_id": ident(batch, f"global-person-{code}"),
        "account_id": ident(batch, f"account-{code}"),
        "first": first,
        "last": last,
        "nickname": f"30G {login_name.replace('-', ' ').title()}",
        "cpf": valid_cpf(key),
        "rg": f"30G-{code.upper()}-{hashlib.sha1(key.encode()).hexdigest()[:7].upper()}",
        "cell": f"119{deterministic_int(key):08d}",
        "email": login,
        "login": login,
        "pix": f"{pfx}.{login_name}@pix.example.test".lower(),
    }


def insert_global_person(conn, data: dict[str, str]) -> None:
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO global_people(
             id,first_name,last_name,nickname,cpf,rg,cellular,email,
             street1,street2,state,cep,city,country,bank_name,bank_number,checking_account,pix_key,
             emergency_name,emergency_cellular,emergency_email,profile_completion_status,can_create_collaborator,
             created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?, 'Rua Manual 30G',NULL,'PA','66000-000','Manual City','Brasil',
                  'Manual Bank','001','000123-4',?, 'Manual Emergency','11999990000','manual30g.emergency@example.test',
                  'COMPLETE',1,?,?)""",
        (data["person_id"], data["first"], data["last"], data["nickname"], data["cpf"], data["rg"],
         data["cell"], data["email"], data["pix"], ts, ts),
    )


def insert_membership(conn, data, tenant_id: str, status_id: str, batch: str, key: str):
    ts = iso_dt(utc_now())
    legacy_id = ident(batch, f"legacy-person-{key}")
    membership_id = ident(batch, f"membership-{key}")
    conn.execute(
        """INSERT INTO people(
             id,first_name,last_name,nickname,cpf,rg,cellular,email,street1,street2,state,cep,city,country,
             bank_name,bank_number,checking_account,pix_key,emergency_name,emergency_cellular,emergency_email,
             profile_completion_status,can_create_collaborator,status_id,notes,created_at,updated_at,tenant_id)
           VALUES(?,?,?,?,?,?,?,?, 'Rua Manual 30G',NULL,'PA','66000-000','Manual City','Brasil',
                  'Manual Bank','001','000123-4',?, 'Manual Emergency','11999990000','manual30g.emergency@example.test',
                  'COMPLETE',1,?,?, ?,?,?)""",
        (legacy_id, data["first"], data["last"], data["nickname"], data["cpf"], data["rg"], data["cell"],
         data["email"], data["pix"], status_id, f"Bite 30G manual fixture {key}", ts, ts, tenant_id),
    )
    conn.execute(
        """INSERT INTO person_tenant_memberships(id,created_at,updated_at,tenant_id,person_id,status_id,notes,legacy_person_id)
           VALUES(?,?,?,?,?,?,?,?)""",
        (membership_id, ts, ts, tenant_id, data["person_id"], status_id, f"Bite 30G membership {key}", legacy_id),
    )
    return legacy_id, membership_id


def insert_actor(conn, legacy_person_id: str, tenant_id: str, batch: str, key: str, display: str):
    ts = iso_dt(utc_now())
    actor_id = ident(batch, f"actor-{key}")
    actor_key = ident(batch, f"actor-key-{key}")
    conn.execute(
        """INSERT INTO authz_actors(id,actor_key,display_name,person_id,collaborator_id,active,created_at,updated_at)
           VALUES(?,?,?,?,NULL,1,?,?)""",
        (actor_id, actor_key, display, legacy_person_id, ts, ts),
    )
    return actor_id, actor_key


def insert_account(conn, data, primary_actor: str, tenant_id: str, membership_id: str):
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO auth_user_accounts(id,actor_id,login,password_hash,active,must_change_password,last_login_at,password_changed_at,created_at,updated_at)
           VALUES(?,?,?,?,1,0,NULL,?,?,?)""",
        (data["account_id"], primary_actor, data["login"], DEFAULT_PASSWORD_HASH, ts, ts, ts),
    )
    conn.execute(
        "INSERT INTO auth_account_people(account_id,person_id,created_at,updated_at) VALUES(?,?,?,?)",
        (data["account_id"], data["person_id"], ts, ts),
    )
    conn.execute(
        """INSERT INTO auth_account_actors(account_id,actor_id,scope_type,tenant_id,membership_id,is_primary,created_at,updated_at)
           VALUES(?,?,'TENANT',?,?,1,?,?)""",
        (data["account_id"], primary_actor, tenant_id, membership_id, ts, ts),
    )


def bind_actor(conn, account_id: str, actor_id: str, tenant_id: str, membership_id: str):
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO auth_account_actors(account_id,actor_id,scope_type,tenant_id,membership_id,is_primary,created_at,updated_at)
           VALUES(?,?,'TENANT',?,?,0,?,?)""",
        (account_id, actor_id, tenant_id, membership_id, ts, ts),
    )


def grant_tenant_admin(conn, actor_id: str, tenant_id: str, batch: str, key: str):
    role = row_or_none(conn, "SELECT id FROM authz_roles WHERE code='TENANT_ADMIN' AND active=1 LIMIT 1")
    if not role:
        raise SystemExit("TENANT_ADMIN role was not found")
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO authz_actor_role_grants(id,actor_id,role_id,tenant_id,active,created_at,updated_at)
           VALUES(?,?,?,?,1,?,?)""",
        (ident(batch, f"grant-{key}"), actor_id, role["id"], tenant_id, ts, ts),
    )


def insert_journey(conn, *, jid, tenant_id, legacy_person_id, membership_id, refs, status, start, end,
                   closed_at=None, daily=50.0, note=""):
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO collaborator_journeys(
             id,created_at,updated_at,tenant_id,person_id,journey_start_date,default_end_date,extension_days,
             projected_end_date,payment_method_id,payment_value,sector_id,location_id,task_id,status_id,notes,
             closed_at,fixed_monthly_brl_amount,daily_brl_amount,gold_commission_percent,time_off_gold_split_percent,
             sick_day_off_replacement_gold_grams,planning_availability,membership_id)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,NULL,NULL,NULL,'ACTIVE',?)""",
        (jid, ts, ts, tenant_id, legacy_person_id, start.isoformat(), end.isoformat(), 0, end.isoformat(),
         refs["method_daily"], daily, refs["sector"], refs["location"], refs["task"], refs[status], note,
         iso_dt(closed_at) if closed_at else None, daily, membership_id),
    )


def insert_ledger_credit(conn, *, lid, tenant_id, person_id, collaborator_id, value_unit_id, amount, effective_date, source_id, description):
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO ledger_entries(
             id,created_at,updated_at,tenant_id,collaborator_id,value_unit_id,entry_type,direction,amount,effective_date,
             source_type,source_id,description,active,correction_type,related_entry_id,correction_reason,authorized_by,
             authorized_at,correction_reason_code,correction_reason_text,second_approved_by,second_approved_at,
             second_approval_notes,person_id)
           VALUES(?,?,?,?,?,?,'EARNING_CREDIT','CREDIT',?,?,'TEST_DATA',?,?,1,'ORIGINAL',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?)""",
        (lid, ts, ts, tenant_id, collaborator_id, value_unit_id, amount, effective_date.isoformat(), source_id, description, person_id),
    )


def insert_ledger_debit(conn, *, lid, tenant_id, person_id, collaborator_id, value_unit_id, amount, effective_date, source_id, description):
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO ledger_entries(
             id,created_at,updated_at,tenant_id,collaborator_id,value_unit_id,entry_type,direction,amount,effective_date,
             source_type,source_id,description,active,correction_type,related_entry_id,correction_reason,authorized_by,
             authorized_at,correction_reason_code,correction_reason_text,second_approved_by,second_approved_at,
             second_approval_notes,person_id)
           VALUES(?,?,?,?,?,?,'PAYOUT','DEBIT',?,?,'TEST_DATA',?,?,1,'ORIGINAL',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?)""",
        (lid, ts, ts, tenant_id, collaborator_id, value_unit_id, amount, effective_date.isoformat(), source_id, description, person_id),
    )


def grant_role(conn, actor_id: str, tenant_id: str, role_code: str, batch: str, key: str):
    role = row_or_none(conn, "SELECT id FROM authz_roles WHERE code=? AND active=1 LIMIT 1", (role_code,))
    if not role:
        raise SystemExit(f"{role_code} role was not found")
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO authz_actor_role_grants(id,actor_id,role_id,tenant_id,active,created_at,updated_at)
           VALUES(?,?,?,?,1,?,?)""",
        (ident(batch, f"grant-{key}"), actor_id, role["id"], tenant_id, ts, ts),
    )


def set_second_approval_policy(conn, tenant_id: str, required: bool, batch: str):
    key = "current_accounts.require_second_person_approval_for_sensitive_operations"
    ts = iso_dt(utc_now())
    existing = row_or_none(conn, "SELECT id FROM tenant_settings WHERE tenant_id=? AND key=?", (tenant_id, key))
    value = "true" if required else "false"
    if existing:
        conn.execute(
            "UPDATE tenant_settings SET value=?,description=?,updated_by=?,updated_at=? WHERE id=?",
            (value, "Require second-person approval for sensitive current-account operations", f"fixture:{batch}", ts, existing["id"]),
        )
    else:
        conn.execute(
            """INSERT INTO tenant_settings(id,tenant_id,key,value,description,updated_by,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (ident(batch, f"setting-second-approval-{hashlib.sha1(tenant_id.encode()).hexdigest()[:8]}"), tenant_id, key, value,
             "Require second-person approval for sensitive current-account operations", f"fixture:{batch}", ts, ts),
        )


def insert_work_period(conn, *, wid, aid, tenant_id, collaborator_id, refs, work_date: date, name: str, period_code: str):
    start = datetime.combine(work_date, time(8, 0), tzinfo=timezone.utc)
    end = datetime.combine(work_date, time(16, 0), tzinfo=timezone.utc)
    ts = iso_dt(utc_now())
    conn.execute(
        """INSERT INTO work_periods(id,tenant_id,work_date,period_code,name,starts_at,ends_at,status,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,'PLANNING',?,?)""",
        (wid, tenant_id, work_date.isoformat(), period_code, name, iso_dt(start), iso_dt(end), ts, ts),
    )
    conn.execute(
        """INSERT INTO work_period_assignments(
             id,tenant_id,work_period_id,collaborator_id,planned_status,actual_status,replacement_for_assignment_id,
             sector_id,location_id,task_id,active,created_at,updated_at,planning_availability)
           VALUES(?,?,?,?,'INCLUDED','WORKED',NULL,?,?,?,1,?,?,'ACTIVE')""",
        (aid, tenant_id, wid, collaborator_id, refs["sector"], refs["location"], refs["task"], ts, ts),
    )



def batch_sentinel_ids(batch: str) -> list[str]:
    identity_codes = ("a", "b", "c", "m", "h", "r", "earnings", "operator")
    return [ident(batch, f"global-person-{code}") for code in identity_codes]


def existing_batch_people(conn: sqlite3.Connection, batch: str):
    sentinel_ids = batch_sentinel_ids(batch)
    placeholders = ",".join("?" for _ in sentinel_ids)
    return conn.execute(
        f"SELECT id,email FROM global_people WHERE id IN ({placeholders}) ORDER BY id",
        sentinel_ids,
    ).fetchall()


def database_has_batch(db_path: Path, batch: str) -> bool:
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        present = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        if "global_people" not in present:
            return False
        return bool(existing_batch_people(conn, batch))
    except sqlite3.DatabaseError:
        return True
    finally:
        try:
            conn.close()
        except Exception:
            pass


def database_is_compatible_clean_backup(db_path: Path, batch: str) -> bool:
    if not db_path.exists() or database_has_batch(db_path, batch):
        return False
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        require_schema(conn)
        return True
    except (sqlite3.DatabaseError, SystemExit):
        return False
    finally:
        try:
            conn.close()
        except Exception:
            pass


def clean_backup_path(db_path: Path, batch: str) -> Path:
    return db_path.with_name(
        db_path.name + f".pre-bite30g-final-{prefix(batch)}-clean.bak"
    )


def sqlite_sidecar_paths(db_path: Path) -> tuple[Path, ...]:
    return tuple(
        Path(str(db_path) + suffix)
        for suffix in ("-wal", "-shm", "-journal")
    )


def remove_sqlite_sidecars(db_path: Path) -> None:
    for sidecar in sqlite_sidecar_paths(db_path):
        sidecar.unlink(missing_ok=True)


def sqlite_snapshot(source: Path, destination: Path) -> None:
    """Create a consistent SQLite backup, including committed WAL contents."""
    destination.unlink(missing_ok=True)
    source_conn = sqlite3.connect(f"file:{source}?mode=ro", uri=True, timeout=5.0)
    destination_conn = sqlite3.connect(destination)
    try:
        source_conn.execute("PRAGMA busy_timeout=5000")
        source_conn.backup(destination_conn)
        destination_conn.commit()
    finally:
        destination_conn.close()
        source_conn.close()


def local_backend_is_reachable(host: str = "127.0.0.1", port: int = 8080) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.25):
            return True
    except OSError:
        return False


def require_local_backend_stopped_for_reset() -> None:
    if local_backend_is_reachable():
        raise SystemExit(
            "Refusing --reset-existing-batch while the local backend is still "
            "reachable on 127.0.0.1:8080. Stop make local-backend first, then "
            "rerun the fixture. Replacing an SQLite database while the backend "
            "has it open can leave stale WAL/SHM state."
        )


def replace_database_safely(*, current: Path, replacement: Path, safety: Path, batch: str) -> None:
    """Replace current DB only after snapshotting it and clearing SQLite sidecars."""
    sqlite_snapshot(current, safety)
    remove_sqlite_sidecars(current)
    try:
        os.replace(replacement, current)
        validate_rebuilt_database(current, batch)
    except BaseException:
        remove_sqlite_sidecars(current)
        shutil.copy2(safety, current)
        remove_sqlite_sidecars(current)
        raise


def create_clean_backup(db_path: Path, batch: str) -> Path:
    clean = clean_backup_path(db_path, batch)
    if clean.exists():
        if database_is_compatible_clean_backup(clean, batch):
            return clean
        raise SystemExit(
            f"Refusing to overwrite incompatible clean-backup candidate: {clean}"
        )
    sqlite_snapshot(db_path, clean)
    return clean


def manifest_path_for(db_path: Path, batch: str) -> Path:
    return db_path.parent / f"{prefix(batch)}-fixture.json"


def manifest_recorded_backup(db_path: Path, batch: str) -> Path | None:
    manifest_path = manifest_path_for(db_path, batch)
    if not manifest_path.exists():
        return None
    try:
        payload = json.loads(manifest_path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    value = payload.get("preSeedBackup")
    if not value:
        return None
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = (manifest_path.parent / candidate).resolve()
    return candidate


def discover_clean_backup(db_path: Path, batch: str) -> Path | None:
    candidates: list[Path] = []

    recorded = manifest_recorded_backup(db_path, batch)
    if recorded:
        candidates.append(recorded)

    deterministic = clean_backup_path(db_path, batch)
    if deterministic not in candidates:
        candidates.append(deterministic)

    timestamped = sorted(
        db_path.parent.glob(db_path.name + ".pre-bite30g-final-*.bak"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for candidate in timestamped:
        if candidate not in candidates:
            candidates.append(candidate)

    for candidate in candidates:
        if database_is_compatible_clean_backup(candidate, batch):
            return candidate
    return None


def validate_rebuilt_database(db_path: Path, batch: str) -> None:
    if database_has_batch(db_path, batch):
        raise SystemExit(
            f"Freshly rebuilt database unexpectedly contains fixture batch {batch!r}"
        )

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        require_schema(conn)
        foreign_key_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            raise SystemExit(
                "Freshly rebuilt database failed PRAGMA foreign_key_check: "
                + "; ".join(str(tuple(row)) for row in foreign_key_errors[:10])
            )

        migrations = {
            row[0]
            for row in conn.execute(
                "SELECT filename FROM schema_migrations"
            ).fetchall()
        }
        if "000060_expense_cancellation_recreation.up.sql" not in migrations:
            raise SystemExit(
                "Freshly rebuilt database did not apply migration 000060"
            )
    finally:
        conn.close()


def rebuild_clean_database_from_migrations(db_path: Path, batch: str) -> Path:
    migrations_dir = ROOT / "backend" / "migrations"
    migration_paths = sorted(migrations_dir.glob("*.up.sql"))
    if not migrations_dir.is_dir() or not migration_paths:
        raise SystemExit(
            "No compatible clean pre-seed backup was found, and the repository "
            "migrations needed for an automatic clean rebuild are unavailable. "
            f"Expected .up.sql files under {migrations_dir}."
        )

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    temporary = db_path.with_name(
        db_path.name + f".bite30g-clean-rebuild-{prefix(batch)}-{stamp}.tmp"
    )
    safety = db_path.with_name(
        db_path.name + f".before-bite30g-reset-{prefix(batch)}-{stamp}.bak"
    )

    temporary.unlink(missing_ok=True)

    print(
        "No compatible clean pre-seed backup survived; "
        "building a fresh temporary database from repository migrations."
    )
    try:
        conn = sqlite3.connect(temporary)
        conn.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations (
                 filename TEXT PRIMARY KEY,
                 applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
               )"""
        )
        conn.commit()
        conn.close()

        # Mirror scripts/db-migrate.sh closely: each migration is applied using
        # a fresh SQLite connection, then recorded only after the SQL succeeds.
        # This avoids carrying connection-scoped PRAGMA state from one migration
        # into the next.
        for migration_path in migration_paths:
            migration_sql = migration_path.read_text()
            conn = sqlite3.connect(temporary)
            try:
                conn.executescript(migration_sql)
            finally:
                conn.close()

            conn = sqlite3.connect(temporary)
            try:
                conn.execute(
                    "INSERT INTO schema_migrations(filename) VALUES(?)",
                    (migration_path.name,),
                )
                conn.commit()
            finally:
                conn.close()

        # Keep parity with the local migration runner's compatibility repair.
        conn = sqlite3.connect(temporary)
        try:
            has_availability = conn.execute(
                """SELECT COUNT(*)
                     FROM pragma_table_info('collaborator_journeys')
                    WHERE name = 'planning_availability'"""
            ).fetchone()[0]
            if has_availability == 0:
                conn.execute(
                    """ALTER TABLE collaborator_journeys
                         ADD COLUMN planning_availability TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (planning_availability IN (
                           'ACTIVE', 'DAY_OFF', 'LEAVE_OF_ABSENCE'
                         ))"""
                )
            conn.execute(
                """UPDATE collaborator_journeys
                      SET planning_availability = 'ACTIVE'
                    WHERE planning_availability IS NULL
                       OR planning_availability = ''"""
            )
            conn.commit()
        finally:
            conn.close()

        validate_rebuilt_database(temporary, batch)
    except (sqlite3.DatabaseError, OSError, SystemExit) as exc:
        temporary.unlink(missing_ok=True)
        if isinstance(exc, SystemExit):
            raise
        raise SystemExit(
            "Unable to rebuild a clean Bite 30G database from repository "
            f"migrations: {exc}. The current database was not modified."
        ) from exc

    # Only after the fresh database is fully migrated and validated do we
    # preserve and replace the current local database. The SQLite backup API
    # captures committed WAL contents from the old database, and stale
    # sidecars are removed before the new main database is installed.
    replace_database_safely(
        current=db_path,
        replacement=temporary,
        safety=safety,
        batch=batch,
    )

    print(f"Reset safety backup: {safety}")
    print(
        f"Rebuilt clean database from {len(migration_paths)} repository migrations."
    )
    print(f"Replaced local database only after validation: {db_path}")
    return db_path

def restore_clean_backup(db_path: Path, batch: str) -> Path:
    source = discover_clean_backup(db_path, batch)
    if not source:
        return rebuild_clean_database_from_migrations(db_path, batch)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safety = db_path.with_name(
        db_path.name + f".before-bite30g-reset-{prefix(batch)}-{stamp}.bak"
    )
    temporary = db_path.with_name(
        db_path.name + f".bite30g-clean-restore-{prefix(batch)}-{stamp}.tmp"
    )
    temporary.unlink(missing_ok=True)
    shutil.copy2(source, temporary)
    replace_database_safely(
        current=db_path,
        replacement=temporary,
        safety=safety,
        batch=batch,
    )
    print(f"Reset safety backup: {safety}")
    print(f"Restored clean pre-seed backup: {source}")
    return source


def main() -> int:
    args = parse_args()
    batch = normalize_batch(args.batch)
    db_path = Path(args.db_path).expanduser().resolve()
    lowered = str(db_path).lower()
    if any(word in lowered for word in ("production", "prod.db", "/prod/")):
        raise SystemExit(f"Refusing suspicious production-looking path: {db_path}")
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    require_schema(conn)

    existing = existing_batch_people(conn, batch)
    if existing:
        if not args.reset_existing_batch:
            print(f"Fixture batch {batch!r} has already been used:", file=sys.stderr)
            for row in existing:
                print(f"  {row['id']}  {row['email']}", file=sys.stderr)
            print(
                "\nTo restart the deterministic promotion fixture from its clean "
                "pre-seed database, rerun with --reset-existing-batch.",
                file=sys.stderr,
            )
            print(
                "To preserve this fixture and create another independent set, "
                "pass a new --batch value.",
                file=sys.stderr,
            )
            conn.close()
            raise SystemExit(2)

        conn.close()
        require_local_backend_stopped_for_reset()
        restore_clean_backup(db_path, batch)
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        require_schema(conn)
        existing = existing_batch_people(conn, batch)
        if existing:
            conn.close()
            raise SystemExit(
                "Reset backup unexpectedly contains the selected fixture batch; "
                "no changes were made after restore."
            )

    pre_seed_backup: Path | None = None
    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = db_path.with_name(db_path.name + f".pre-bite30g-final-{stamp}.bak")
        sqlite_snapshot(db_path, backup)
        print(f"Backup: {backup}")
        pre_seed_backup = create_clean_backup(db_path, batch)
        print(f"Reusable clean pre-seed backup: {pre_seed_backup}")
    else:
        existing_clean = discover_clean_backup(db_path, batch)
        pre_seed_backup = existing_clean

    tenant_a, created_a = ensure_tenant_a(conn, args.tenant_a, batch)
    tenant_b = resolve_tenant(conn, args.tenant_b)
    if not tenant_b:
        raise SystemExit(f"Tenant B {args.tenant_b!r} was not found")
    if tenant_a["id"] == tenant_b["id"]:
        raise SystemExit("Tenant A and Tenant B must be different")

    refs_a = ensure_refs(conn, tenant_a["id"], batch)
    refs_b = ensure_refs(conn, tenant_b["id"], batch)
    set_second_approval_policy(conn, tenant_a["id"], False, batch)
    set_second_approval_policy(conn, tenant_b["id"], False, batch)


    today = date.today()
    historical_end = today - timedelta(days=45)
    historical_start = historical_end - timedelta(days=35)
    open_start = today - timedelta(days=30)
    open_end = today + timedelta(days=90)

    # Identity A: historical A1 is closed at exactly zero; A2 opens at zero.
    # Tenant B is independent and starts +300 BRL.
    a = identity(batch, "a", "Ana", "FinancialContinuity")
    insert_global_person(conn, a)
    a_legacy_a, a_mem_a = insert_membership(conn, a, tenant_a["id"], refs_a["person_active"], batch, "a-tenant-a")
    a_legacy_b, a_mem_b = insert_membership(conn, a, tenant_b["id"], refs_b["person_active"], batch, "a-tenant-b")
    a_actor_a, a_key_a = insert_actor(conn, a_legacy_a, tenant_a["id"], batch, "a-tenant-a", "30G Identity A · Tenant A")
    a_actor_b, a_key_b = insert_actor(conn, a_legacy_b, tenant_b["id"], batch, "a-tenant-b", "30G Identity A · Tenant B")
    insert_account(conn, a, a_actor_a, tenant_a["id"], a_mem_a)
    bind_actor(conn, a["account_id"], a_actor_b, tenant_b["id"], a_mem_b)

    a1 = ident(batch, "journey-a1-closed")
    a2 = ident(batch, "journey-a2-open")
    ab1 = ident(batch, "journey-a-tenant-b-open")
    insert_journey(conn, jid=a1, tenant_id=tenant_a["id"], legacy_person_id=a_legacy_a, membership_id=a_mem_a,
                   refs=refs_a, status="collab_finished", start=historical_start, end=historical_end,
                   closed_at=datetime.combine(historical_end, time(18), tzinfo=timezone.utc), daily=50.0,
                   note="30G balanced historical Journey A1")
    insert_journey(conn, jid=a2, tenant_id=tenant_a["id"], legacy_person_id=a_legacy_a, membership_id=a_mem_a,
                   refs=refs_a, status="collab_active", start=open_start, end=open_end, daily=50.0,
                   note="30G current Journey A2 starts at zero")
    insert_journey(conn, jid=ab1, tenant_id=tenant_b["id"], legacy_person_id=a_legacy_b, membership_id=a_mem_b,
                   refs=refs_b, status="collab_active", start=open_start, end=open_end, daily=70.0,
                   note="30G Identity A Tenant B independent Journey")

    insert_ledger_credit(conn, lid=ident(batch,"ledger-a1-credit"), tenant_id=tenant_a["id"], person_id=a["person_id"], collaborator_id=a1,
                         value_unit_id=refs_a["brl"], amount=125.0, effective_date=historical_end,
                         source_id=ident(batch,"source-a1-credit"), description="30G A1 historical earning +125 BRL")
    insert_ledger_debit(conn, lid=ident(batch,"ledger-a1-settle"), tenant_id=tenant_a["id"], person_id=a["person_id"], collaborator_id=a1,
                        value_unit_id=refs_a["brl"], amount=125.0, effective_date=historical_end,
                        source_id=ident(batch,"source-a1-settle"), description="30G A1 historical settlement -125 BRL")
    insert_ledger_credit(conn, lid=ident(batch,"ledger-a-tenant-b-credit"), tenant_id=tenant_b["id"], person_id=a["person_id"], collaborator_id=ab1,
                         value_unit_id=refs_b["brl"], amount=300.0, effective_date=today - timedelta(days=20),
                         source_id=ident(batch,"source-a-tenant-b-credit"), description="30G Tenant B independent +300 BRL")

    wp_a = ident(batch, "work-period-tenant-a")
    wpa_a = ident(batch, "assignment-tenant-a")
    wp_b = ident(batch, "work-period-tenant-b")
    wpa_b = ident(batch, "assignment-tenant-b")
    insert_work_period(conn, wid=wp_a, aid=wpa_a, tenant_id=tenant_a["id"], collaborator_id=a2, refs=refs_a,
                       work_date=today - timedelta(days=2), name="30G Tenant A accrual ownership", period_code="MANUAL30G_A")
    insert_work_period(conn, wid=wp_b, aid=wpa_b, tenant_id=tenant_b["id"], collaborator_id=ab1, refs=refs_b,
                       work_date=today - timedelta(days=1), name="30G Tenant B accrual regression", period_code="MANUAL30G_B")

    # Identity B: Tenant owes Collaborator in both BRL and Gold.
    b = identity(batch, "b", "Bruno", "TenantOwes")
    insert_global_person(conn, b)
    b_legacy, b_mem = insert_membership(conn, b, tenant_a["id"], refs_a["person_active"], batch, "b-tenant-a")
    b_actor, b_key = insert_actor(conn, b_legacy, tenant_a["id"], batch, "b-tenant-a", "30G Identity B · Tenant owes")
    insert_account(conn, b, b_actor, tenant_a["id"], b_mem)
    b1 = ident(batch, "journey-b1-positive")
    insert_journey(conn, jid=b1, tenant_id=tenant_a["id"], legacy_person_id=b_legacy, membership_id=b_mem,
                   refs=refs_a, status="collab_active", start=open_start, end=open_end, daily=45.0,
                   note="30G positive final-settlement Journey")
    insert_ledger_credit(conn, lid=ident(batch,"ledger-b-brl-positive"), tenant_id=tenant_a["id"], person_id=b["person_id"], collaborator_id=b1,
                         value_unit_id=refs_a["brl"], amount=200.0, effective_date=today - timedelta(days=3),
                         source_id=ident(batch,"source-b-brl-positive"), description="30G B Tenant owes 200 BRL")
    insert_ledger_credit(conn, lid=ident(batch,"ledger-b-gold-positive"), tenant_id=tenant_a["id"], person_id=b["person_id"], collaborator_id=b1,
                         value_unit_id=refs_a["gold"], amount=2.5, effective_date=today - timedelta(days=3),
                         source_id=ident(batch,"source-b-gold-positive"), description="30G B Tenant owes 2.5 g")

    # Identity C: Collaborator owes Tenant; extension must not alter this debt.
    c = identity(batch, "c", "Carla", "CollaboratorOwes")
    insert_global_person(conn, c)
    c_legacy, c_mem = insert_membership(conn, c, tenant_a["id"], refs_a["person_active"], batch, "c-tenant-a")
    c_actor, c_key = insert_actor(conn, c_legacy, tenant_a["id"], batch, "c-tenant-a", "30G Identity C · Collaborator owes")
    insert_account(conn, c, c_actor, tenant_a["id"], c_mem)
    c1 = ident(batch, "journey-c1-negative")
    insert_journey(conn, jid=c1, tenant_id=tenant_a["id"], legacy_person_id=c_legacy, membership_id=c_mem,
                   refs=refs_a, status="collab_active", start=open_start, end=open_end, daily=35.0,
                   note="30G negative final-settlement/extension Journey")
    insert_ledger_debit(conn, lid=ident(batch,"ledger-c-brl-negative"), tenant_id=tenant_a["id"], person_id=c["person_id"], collaborator_id=c1,
                        value_unit_id=refs_a["brl"], amount=150.0, effective_date=today - timedelta(days=4),
                        source_id=ident(batch,"source-c-brl-negative"), description="30G C owes Tenant 150 BRL")
    insert_ledger_debit(conn, lid=ident(batch,"ledger-c-gold-negative"), tenant_id=tenant_a["id"], person_id=c["person_id"], collaborator_id=c1,
                        value_unit_id=refs_a["gold"], amount=1.25, effective_date=today - timedelta(days=4),
                        source_id=ident(batch,"source-c-gold-negative"), description="30G C owes Tenant 1.25 g")

    # Identity M: mixed signs prove BRL and Gold are independent.
    m = identity(batch, "m", "Marina", "MixedSettlement")
    insert_global_person(conn, m)
    m_legacy, m_mem = insert_membership(conn, m, tenant_a["id"], refs_a["person_active"], batch, "m-tenant-a")
    m_actor, m_key = insert_actor(conn, m_legacy, tenant_a["id"], batch, "m-tenant-a", "30G Identity M · mixed settlement")
    insert_account(conn, m, m_actor, tenant_a["id"], m_mem)
    m1 = ident(batch, "journey-m1-mixed")
    insert_journey(conn, jid=m1, tenant_id=tenant_a["id"], legacy_person_id=m_legacy, membership_id=m_mem,
                   refs=refs_a, status="collab_active", start=open_start, end=open_end, daily=38.0,
                   note="30G mixed BRL/gold settlement Journey")
    insert_ledger_credit(conn, lid=ident(batch,"ledger-m-brl-positive"), tenant_id=tenant_a["id"], person_id=m["person_id"], collaborator_id=m1,
                         value_unit_id=refs_a["brl"], amount=80.0, effective_date=today - timedelta(days=5),
                         source_id=ident(batch,"source-m-brl-positive"), description="30G M Tenant owes 80 BRL")
    insert_ledger_debit(conn, lid=ident(batch,"ledger-m-gold-negative"), tenant_id=tenant_a["id"], person_id=m["person_id"], collaborator_id=m1,
                        value_unit_id=refs_a["gold"], amount=0.5, effective_date=today - timedelta(days=5),
                        source_id=ident(batch,"source-m-gold-negative"), description="30G M owes Tenant 0.5 g")

    # Identity H: Account-level historical self-service survives inactive Membership/Actor.
    h = identity(batch, "h", "Helena", "HistoricalSelfService")
    insert_global_person(conn, h)
    h_legacy, h_mem = insert_membership(conn, h, tenant_a["id"], refs_a["person_active"], batch, "h-tenant-a")
    h_actor, h_key = insert_actor(conn, h_legacy, tenant_a["id"], batch, "h-tenant-a", "30G Identity H · historical self-service")
    insert_account(conn, h, h_actor, tenant_a["id"], h_mem)
    h1 = ident(batch, "journey-h1-closed")
    insert_journey(conn, jid=h1, tenant_id=tenant_a["id"], legacy_person_id=h_legacy, membership_id=h_mem,
                   refs=refs_a, status="collab_finished", start=historical_start, end=historical_end,
                   closed_at=datetime.combine(historical_end, time(17), tzinfo=timezone.utc), daily=32.0,
                   note="30G balanced historical self-service Journey")
    insert_ledger_credit(conn, lid=ident(batch,"ledger-h-credit"), tenant_id=tenant_a["id"], person_id=h["person_id"], collaborator_id=h1,
                         value_unit_id=refs_a["brl"], amount=75.0, effective_date=historical_end,
                         source_id=ident(batch,"source-h-credit"), description="30G H historical +75 BRL")
    insert_ledger_debit(conn, lid=ident(batch,"ledger-h-settle"), tenant_id=tenant_a["id"], person_id=h["person_id"], collaborator_id=h1,
                        value_unit_id=refs_a["brl"], amount=75.0, effective_date=historical_end,
                        source_id=ident(batch,"source-h-settle"), description="30G H historical settlement -75 BRL")
    conn.execute("UPDATE person_tenant_memberships SET status_id=?, updated_at=? WHERE id=?", (refs_a["person_inactive"], iso_dt(utc_now()), h_mem))
    conn.execute("UPDATE people SET status_id=?, updated_at=? WHERE id=?", (refs_a["person_inactive"], iso_dt(utc_now()), h_legacy))
    conn.execute("UPDATE authz_actors SET active=0, updated_at=? WHERE id=?", (iso_dt(utc_now()), h_actor))

    # Identity R: neutral active Journey for expense cancellation/recreation correction tests.
    r = identity(batch, "r", "Rafael", "ExpenseTarget")
    insert_global_person(conn, r)
    r_legacy, r_mem = insert_membership(conn, r, tenant_a["id"], refs_a["person_active"], batch, "r-tenant-a")
    r_actor, r_key = insert_actor(conn, r_legacy, tenant_a["id"], batch, "r-tenant-a", "30G Identity R · expense target")
    insert_account(conn, r, r_actor, tenant_a["id"], r_mem)
    r1 = ident(batch, "journey-r1-open")
    insert_journey(conn, jid=r1, tenant_id=tenant_a["id"], legacy_person_id=r_legacy, membership_id=r_mem,
                   refs=refs_a, status="collab_active", start=open_start, end=open_end, daily=42.0,
                   note="30G Expense ownership target Journey")

    # Earnings Operator: delegated operator, not a Collaborator.
    e = identity(batch, "earnings", "Eva", "EarningsOperator")
    insert_global_person(conn, e)
    e_legacy, e_mem = insert_membership(conn, e, tenant_a["id"], refs_a["person_active"], batch, "earnings-tenant-a")
    e_actor, e_key = insert_actor(conn, e_legacy, tenant_a["id"], batch, "earnings-tenant-a", "30G Earnings Operator")
    insert_account(conn, e, e_actor, tenant_a["id"], e_mem)
    grant_role(conn, e_actor, tenant_a["id"], "EARNINGS_OPERATOR", batch, "earnings-tenant-a")

    # Operator D: TENANT_ADMIN in both tenants.
    d = identity(batch, "operator", "Daniela", "TenantOperator")
    insert_global_person(conn, d)
    d_legacy_a, d_mem_a = insert_membership(conn, d, tenant_a["id"], refs_a["person_active"], batch, "operator-tenant-a")
    d_legacy_b, d_mem_b = insert_membership(conn, d, tenant_b["id"], refs_b["person_active"], batch, "operator-tenant-b")
    d_actor_a, d_key_a = insert_actor(conn, d_legacy_a, tenant_a["id"], batch, "operator-tenant-a", "30G Operator · Tenant A")
    d_actor_b, d_key_b = insert_actor(conn, d_legacy_b, tenant_b["id"], batch, "operator-tenant-b", "30G Operator · Tenant B")
    insert_account(conn, d, d_actor_a, tenant_a["id"], d_mem_a)
    bind_actor(conn, d["account_id"], d_actor_b, tenant_b["id"], d_mem_b)
    grant_tenant_admin(conn, d_actor_a, tenant_a["id"], batch, "operator-tenant-a")
    grant_tenant_admin(conn, d_actor_b, tenant_b["id"], batch, "operator-tenant-b")

    fk = conn.execute("PRAGMA foreign_key_check").fetchall()
    if fk:
        raise RuntimeError(f"Foreign-key check failed before commit: {fk[:10]}")

    # Verify every pre-closed fixture Journey is zero in every value unit.
    bad_closed = conn.execute("""
        SELECT cj.id, le.value_unit_id,
               SUM(CASE le.direction WHEN 'CREDIT' THEN le.amount ELSE -le.amount END) AS balance
        FROM collaborator_journeys cj
        JOIN ledger_entries le ON le.tenant_id=cj.tenant_id AND le.collaborator_id=cj.id AND le.active=1
        WHERE cj.closed_at IS NOT NULL
        GROUP BY cj.id, le.value_unit_id
        HAVING ABS(balance) > 0.000000001
    """).fetchall()
    if bad_closed:
        raise RuntimeError(f"Closed fixture Journey has non-zero balance: {bad_closed}")
    conn.commit()

    manifest = {
        "batch": batch,
        "prefix": prefix(batch),
        "preSeedBackup": str(pre_seed_backup) if pre_seed_backup else None,
        "password": DEFAULT_PASSWORD,
        "tenantA": {"id": tenant_a["id"], "name": tenant_a["name"], "createdByFixture": created_a, "refs": refs_a},
        "tenantB": {"id": tenant_b["id"], "name": tenant_b["name"], "refs": refs_b},
        "identityA": {"login": a["login"], "personId": a["person_id"],
            "tenantA": {"membershipId": a_mem_a, "actorId": a_actor_a, "actorKey": a_key_a, "journeyA1Closed": a1, "journeyA2Open": a2, "workPeriodId": wp_a, "assignmentId": wpa_a},
            "tenantB": {"membershipId": a_mem_b, "actorId": a_actor_b, "actorKey": a_key_b, "journeyB1Open": ab1, "workPeriodId": wp_b, "assignmentId": wpa_b}},
        "identityB": {"login": b["login"], "personId": b["person_id"], "membershipId": b_mem, "actorId": b_actor, "actorKey": b_key, "journeyB1Positive": b1},
        "identityC": {"login": c["login"], "personId": c["person_id"], "membershipId": c_mem, "actorId": c_actor, "actorKey": c_key, "journeyC1Negative": c1},
        "identityM": {"login": m["login"], "personId": m["person_id"], "membershipId": m_mem, "actorId": m_actor, "actorKey": m_key, "journeyM1Mixed": m1},
        "identityH": {"login": h["login"], "personId": h["person_id"], "membershipId": h_mem, "actorId": h_actor, "actorKey": h_key, "journeyH1Closed": h1},
        "identityR": {"login": r["login"], "personId": r["person_id"], "membershipId": r_mem, "actorId": r_actor, "actorKey": r_key, "journeyR1Open": r1},
        "earningsOperator": {"login": e["login"], "personId": e["person_id"], "membershipId": e_mem, "actorId": e_actor, "actorKey": e_key},
        "operator": {"login": d["login"], "personId": d["person_id"],
            "tenantA": {"membershipId": d_mem_a, "actorId": d_actor_a, "actorKey": d_key_a},
            "tenantB": {"membershipId": d_mem_b, "actorId": d_actor_b, "actorKey": d_key_b}},
        "expectedInitialJourneyBalances": {
            "A1_TenantA_BRL": 0.0, "A2_TenantA_BRL": 0.0, "A_TenantB_BRL": 300.0,
            "B1_BRL": 200.0, "B1_GOLD_GRAM": 2.5,
            "C1_BRL": -150.0, "C1_GOLD_GRAM": -1.25,
            "M1_BRL": 80.0, "M1_GOLD_GRAM": -0.5,
            "H1_BRL": 0.0, "R1_BRL": 0.0,
        },
        "accrualAmountsBRL": {"tenantA": 50.0, "tenantB": 70.0},
        "secondPersonApprovalPolicy": False,
    }
    manifest_path = db_path.parent / f"{prefix(batch)}-fixture.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print("\nBite 30G final manual fixtures created successfully")
    print("=" * 76)
    print(f"Database:  {db_path}")
    print(f"Batch:     {batch}")
    print(f"Manifest:  {manifest_path}")
    print(f"Password:  {DEFAULT_PASSWORD}")
    print(f"Tenant A:  {tenant_a['name']}  [{tenant_a['id']}]")
    print(f"Tenant B:  {tenant_b['name']}  [{tenant_b['id']}]")
    print("Second-person approval policy forced to FALSE in both fixture Tenants.")
    print("\nOperator D — Tenant Administrator in both Tenants")
    print(f"  Login: {d['login']}")
    print("\nIdentity A — cross-Journey / cross-Tenant")
    print(f"  Login: {a['login']}")
    print(f"  Tenant A: A1 CLOSED/ZERO={a1}; A2 OPEN/ZERO={a2}; Work Period={wp_a}")
    print(f"  Tenant B: B1 OPEN/+300 BRL={ab1}; Work Period={wp_b}")
    print("\nIdentity B — Tenant owes Collaborator")
    print(f"  Login: {b['login']}  Journey: {b1}  +200 BRL / +2.5 g")
    print("\nIdentity C — Collaborator owes Tenant")
    print(f"  Login: {c['login']}  Journey: {c1}  -150 BRL / -1.25 g")
    print("\nIdentity M — mixed directions")
    print(f"  Login: {m['login']}  Journey: {m1}  +80 BRL / -0.5 g")
    print("\nIdentity H — historical self-service, inactive Membership/Actor")
    print(f"  Login: {h['login']}  Journey: {h1} CLOSED/ZERO")
    print("\nIdentity R — expense target")
    print(f"  Login: {r['login']}  Journey: {r1} OPEN/ZERO")
    print("\nEarnings Operator")
    print(f"  Login: {e['login']}")
    print("\nMANDATORY before beginning the manual checklist:")
    print("  1. Stop any stale backend process if it is still running.")
    print("  2. From the project root run: make local-backend")
    print("  3. Confirm the backend stays running on 127.0.0.1:8080 before using the DevTools helper.")
    print("     A 502 from localhost:5173/api/... means the Vite proxy cannot reach the backend;")
    print("     it does not mean the selected Account lacks Tenant A.")
    print("  4. Sign in again after every fixture reset/rebuild. The reset replaces auth_sessions, so")
    print("     browser sessions created before the reset are intentionally invalid and return HTTP 401.")
    print('     For DevTools-only API verification you may run: await ERS30G.signIn("A")')
    print("     Then run: await ERS30G.tenants()")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sqlite3.IntegrityError as exc:
        print(f"SQLite integrity error: {exc}", file=sys.stderr)
        raise
