#!/usr/bin/env python3
"""
Seed Bite 30E manual-test identities into the local ERS SQLite database.

Creates four identities using Bite 30E terminology consistently:

Identity A — Multi-Tenant Ordinary Account
    Authentication Account: ACTIVE
    Tenant A Membership: ACTIVE
    Tenant A Actor: ACTIVE
    Tenant B Membership: ACTIVE
    Tenant B Actor: ACTIVE
    Delegated Roles: NONE

Identity B — Person-Only Account
    Authentication Account: ACTIVE
    Person–Tenant Membership: ACTIVE
    Tenant Actor: ACTIVE
    Delegated Roles: NONE
    Collaborator Journey: NONE

Identity C — Single-Tenant Account
    Authentication Account: ACTIVE
    Exactly one usable tenant Actor
    Person–Tenant Membership: ACTIVE
    Delegated Roles: NONE

Identity D — Disposable Multi-Tenant Account
    Authentication Account: ACTIVE
    Tenant A Membership: ACTIVE
    Tenant A Actor: ACTIVE
    Tenant B Membership: ACTIVE
    Tenant B Actor: ACTIVE
    Delegated Roles: NONE

Default tenants:
    Tenant A: Byte 28A Manual Test
    Tenant B: default

Default credentials:
    Identity A: manual30e.identity-a@example.test
    Identity B: manual30e.identity-b@example.test
    Identity C: manual30e.identity-c@example.test
    Identity D: manual30e.identity-d@example.test

    Password for all four: Manual-30C-Password!

LOCAL DEVELOPMENT ONLY.

IMPORTANT:
    Stop the backend before running this script because it writes directly to
    backend/data/app.db.

The fixture batch is intentionally write-once. If you need a fresh disposable
set after manual testing, use a new batch:

    python3 scripts/seed-bite30e-manual-test-identities.py --batch retry1

The script prints the exact values needed by the Bite 30E manual checklist:

    Login
    Authentication Account ID
    Person ID
    Tenant ID
    Actor ID
    Actor Key
    Membership ID

Terminology:
    Actor ID  = authz_actors.id
    Actor Key = authz_actors.actor_key
    Membership ID = person_tenant_memberships.id
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
DEFAULT_DB = ROOT / "backend" / "data" / "app.db"

DEFAULT_TENANT_A = "Byte 28A Manual Test"
DEFAULT_TENANT_B = "default"
DEFAULT_BATCH = "manual30e"

DEFAULT_PASSWORD = "Manual-30C-Password!"
# bcrypt cost-10 hash for DEFAULT_PASSWORD; compatible with ERS Go bcrypt.
DEFAULT_PASSWORD_HASH = "$2a$10$2aGDP1WNWYv3Q2aC4URnv.t40kw1HHjYOHUfvmctSf8Pb7D6Vo0t2"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create Bite 30E manual-test identities A, B, C, and D."
    )
    parser.add_argument(
        "--db-path",
        default=os.getenv("DATABASE_PATH") or str(DEFAULT_DB),
        help=f"SQLite database path (default: {DEFAULT_DB})",
    )
    parser.add_argument(
        "--tenant-a",
        default=DEFAULT_TENANT_A,
        help=(
            "Tenant A selector. Matches tenant id, code, or name "
            f"(default: {DEFAULT_TENANT_A!r})."
        ),
    )
    parser.add_argument(
        "--tenant-b",
        default=DEFAULT_TENANT_B,
        help=(
            "Tenant B selector. Matches tenant id, code, or name "
            f"(default: {DEFAULT_TENANT_B!r})."
        ),
    )
    parser.add_argument(
        "--batch",
        default=DEFAULT_BATCH,
        help=(
            "Write-once fixture batch. Use another value to create a fresh set "
            "after a previous manual-test run."
        ),
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not create a timestamped backup before writing fixtures.",
    )
    return parser.parse_args()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_batch(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-").lower()
    if not normalized:
        raise SystemExit("--batch must contain at least one letter or number.")
    if len(normalized) > 30:
        raise SystemExit("--batch must be 30 characters or fewer.")
    return normalized


def fixture_id(kind: str, key: str) -> str:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
    return f"manual30e-{kind}-{digest}"


def fixture_actor_key(key: str) -> str:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"manual30e-{digest}"


def deterministic_int(key: str, digits: int) -> int:
    modulus = 10**digits
    return int(hashlib.sha1(key.encode("utf-8")).hexdigest()[:15], 16) % modulus


def valid_cpf(key: str) -> str:
    """Return a deterministic CPF with valid check digits for local fixtures."""
    base = f"{100_000_000 + deterministic_int(key, 8):09d}"[-9:]
    if len(set(base)) == 1:
        base = "390533447"

    def check_digit(prefix: str, weight: int) -> str:
        total = sum(
            int(value) * (weight - index)
            for index, value in enumerate(prefix)
        )
        result = 11 - (total % 11)
        return "0" if result >= 10 else str(result)

    first = check_digit(base, 10)
    second = check_digit(base + first, 11)
    return base + first + second


def batch_prefix(batch: str) -> str:
    return "manual30e" if batch == DEFAULT_BATCH else f"manual30e.{batch}"


def identity_data(batch: str, code: str) -> dict[str, str]:
    definitions = {
        "a": ("Ana", "MultiTenant", "30E Identity A"),
        "b": ("Beatriz", "PersonOnly", "30E Identity B"),
        "c": ("Carlos", "SingleTenant", "30E Identity C"),
        "d": ("Diana", "Disposable", "30E Identity D"),
    }
    if code not in definitions:
        raise ValueError(f"Unknown identity code: {code!r}")

    first_name, last_name, nickname = definitions[code]
    key = f"bite30e:{batch}:identity-{code}"
    suffix = deterministic_int(key, 8)
    prefix = batch_prefix(batch)
    login = f"{prefix}.identity-{code}@example.test".lower()

    return {
        "first_name": first_name,
        "last_name": last_name,
        "nickname": nickname if batch == DEFAULT_BATCH else f"{nickname} {batch}",
        "cpf": valid_cpf(key),
        "rg": f"30E-{code.upper()}-{hashlib.sha1(key.encode()).hexdigest()[:8].upper()}",
        "cellular": f"119{suffix:08d}",
        "email": login,
        "pix_key": f"{prefix}.identity-{code}@pix.example.test".lower(),
        "login": login,
    }


def require_tables(conn: sqlite3.Connection) -> None:
    required = [
        "tenants",
        "reference_data",
        "people",
        "global_people",
        "person_tenant_memberships",
        "authz_actors",
        "authz_actor_role_grants",
        "authz_roles",
        "auth_user_accounts",
        "auth_account_people",
        "auth_account_actors",
    ]
    existing = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    missing = [table for table in required if table not in existing]
    if missing:
        raise SystemExit(
            "Missing Bite 30 tables: "
            + ", ".join(missing)
            + ". Apply migrations before running this script."
        )


def resolve_tenant(
    conn: sqlite3.Connection,
    selector: str,
    *,
    label: str,
) -> sqlite3.Row:
    value = selector.strip()
    candidates = [value]

    # Keep compatibility with the historical Byte/Bite typo in manual fixtures.
    if value.lower().startswith("byte "):
        candidates.append("Bite " + value[5:])
    elif value.lower().startswith("bite "):
        candidates.append("Byte " + value[5:])

    for candidate in candidates:
        row = conn.execute(
            """
            SELECT id, code, name, active
            FROM tenants
            WHERE LOWER(id) = LOWER(?)
               OR LOWER(code) = LOWER(?)
               OR LOWER(name) = LOWER(?)
            ORDER BY
              CASE
                WHEN LOWER(id) = LOWER(?) THEN 0
                WHEN LOWER(code) = LOWER(?) THEN 1
                ELSE 2
              END
            LIMIT 1
            """,
            (
                candidate,
                candidate,
                candidate,
                candidate,
                candidate,
            ),
        ).fetchone()
        if row is not None:
            if not row["active"]:
                raise SystemExit(
                    f"{label} {row['name']!r} ({row['id']}) exists but is inactive."
                )
            return row

    available = conn.execute(
        "SELECT id, code, name, active FROM tenants ORDER BY name"
    ).fetchall()
    details = "\n".join(
        f"  {row['id']}  {row['code']}  {row['name']}  active={row['active']}"
        for row in available
    )
    raise SystemExit(
        f"Could not resolve {label} from {selector!r}. Available tenants:\n{details}"
    )


def active_person_status_id(
    conn: sqlite3.Connection,
    tenant_id: str,
) -> str:
    row = conn.execute(
        """
        SELECT id
        FROM reference_data
        WHERE tenant_id = ?
          AND type = 'person_status'
          AND code = 'ACTIVE'
          AND active = 1
        ORDER BY created_at, id
        LIMIT 1
        """,
        (tenant_id,),
    ).fetchone()

    if row is not None:
        return row["id"]

    # A manually created tenant may not yet have its own ACTIVE person status.
    # Create only the tenant-scoped status required by these fixtures.
    status_id = fixture_id("ref", f"{tenant_id}:person_status:ACTIVE")
    ts = now()
    conn.execute(
        """
        INSERT INTO reference_data (
            id, type, code, label, description, active, sort_order,
            metadata_json, created_at, updated_at, tenant_id
        ) VALUES (?, 'person_status', 'ACTIVE', 'Active',
                  'Active Person', 1, 10, NULL, ?, ?, ?)
        """,
        (status_id, ts, ts, tenant_id),
    )
    return status_id


def require_unused_batch(
    conn: sqlite3.Connection,
    batch: str,
    identities: dict[str, dict[str, str]],
) -> None:
    keys = [f"bite30e:{batch}:identity-{code}" for code in identities]
    person_ids = [fixture_id("global-person", key) for key in keys]
    account_ids = [fixture_id("account", key) for key in keys]
    logins = [identity["login"] for identity in identities.values()]

    person_placeholders = ",".join("?" for _ in person_ids)
    account_placeholders = ",".join("?" for _ in account_ids)
    login_placeholders = ",".join("?" for _ in logins)

    existing_people = conn.execute(
        f"""
        SELECT id, first_name, last_name, email
        FROM global_people
        WHERE id IN ({person_placeholders})
        ORDER BY id
        """,
        person_ids,
    ).fetchall()

    existing_accounts = conn.execute(
        f"""
        SELECT id, login, active
        FROM auth_user_accounts
        WHERE id IN ({account_placeholders})
           OR LOWER(login) IN ({login_placeholders})
        ORDER BY login
        """,
        [*account_ids, *[login.lower() for login in logins]],
    ).fetchall()

    if not existing_people and not existing_accounts:
        return

    print(f"Fixture batch {batch!r} has already been used.", file=sys.stderr)
    for row in existing_people:
        print(
            f"  Person: {row['id']}  "
            f"{row['first_name']} {row['last_name']}  {row['email']}",
            file=sys.stderr,
        )
    for row in existing_accounts:
        print(
            f"  Account: {row['id']}  {row['login']}  active={row['active']}",
            file=sys.stderr,
        )

    raise SystemExit(
        "Refusing to mutate an already-used Bite 30E fixture batch. "
        "Use a fresh batch, for example: --batch retry1"
    )


def insert_global_person(
    conn: sqlite3.Connection,
    *,
    person_id: str,
    identity: dict[str, str],
) -> None:
    ts = now()
    conn.execute(
        """
        INSERT INTO global_people (
            id, first_name, last_name, nickname, cpf, rg, cellular, email,
            street1, street2, state, cep, city, country,
            bank_name, bank_number, checking_account, pix_key,
            emergency_name, emergency_cellular, emergency_email,
            profile_completion_status, can_create_collaborator,
            created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            'Rua Manual 30E', NULL, 'PA', '66000-000', 'Manual City', 'Brasil',
            'Manual Bank', '001', '000123-4', ?,
            'Manual Emergency', '11999990000', 'manual30e.emergency@example.test',
            'COMPLETE', 1, ?, ?
        )
        """,
        (
            person_id,
            identity["first_name"],
            identity["last_name"],
            identity["nickname"],
            identity["cpf"],
            identity["rg"],
            identity["cellular"],
            identity["email"],
            identity["pix_key"],
            ts,
            ts,
        ),
    )


def insert_membership_and_legacy_person(
    conn: sqlite3.Connection,
    *,
    identity_key: str,
    person_id: str,
    tenant_id: str,
    status_id: str,
    identity: dict[str, str],
    note: str,
) -> tuple[str, str]:
    ts = now()
    legacy_person_id = fixture_id("person", f"{identity_key}:{tenant_id}")
    membership_id = fixture_id("membership", f"{person_id}:{tenant_id}")

    conn.execute(
        """
        INSERT INTO people (
            id, tenant_id, first_name, last_name, nickname, cpf, rg, cellular, email,
            street1, state, cep, city, country,
            bank_name, bank_number, checking_account, pix_key,
            emergency_name, emergency_cellular, emergency_email,
            profile_completion_status, can_create_collaborator,
            status_id, notes, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            'Rua Manual 30E', 'PA', '66000-000', 'Manual City', 'Brasil',
            'Manual Bank', '001', '000123-4', ?,
            'Manual Emergency', '11999990000', 'manual30e.emergency@example.test',
            'COMPLETE', 1, ?, ?, ?, ?
        )
        """,
        (
            legacy_person_id,
            tenant_id,
            identity["first_name"],
            identity["last_name"],
            identity["nickname"],
            identity["cpf"],
            identity["rg"],
            identity["cellular"],
            identity["email"],
            identity["pix_key"],
            status_id,
            note,
            ts,
            ts,
        ),
    )

    conn.execute(
        """
        INSERT INTO person_tenant_memberships (
            id, created_at, updated_at, tenant_id, person_id,
            status_id, notes, legacy_person_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            membership_id,
            ts,
            ts,
            tenant_id,
            person_id,
            status_id,
            note,
            legacy_person_id,
        ),
    )

    return legacy_person_id, membership_id


def insert_actor(
    conn: sqlite3.Connection,
    *,
    identity_key: str,
    tenant_id: str,
    legacy_person_id: str,
    display_name: str,
) -> tuple[str, str]:
    actor_identity_key = f"{identity_key}:{tenant_id}"
    actor_id = fixture_id("actor", actor_identity_key)
    actor_key = fixture_actor_key(actor_identity_key)
    ts = now()

    conn.execute(
        """
        INSERT INTO authz_actors (
            id, actor_key, display_name, person_id, collaborator_id,
            active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 1, ?, ?)
        """,
        (
            actor_id,
            actor_key,
            display_name,
            legacy_person_id,
            ts,
            ts,
        ),
    )
    return actor_id, actor_key


def insert_account(
    conn: sqlite3.Connection,
    *,
    identity_key: str,
    login: str,
    person_id: str,
    primary_actor_id: str,
    primary_tenant_id: str,
    primary_membership_id: str,
) -> str:
    account_id = fixture_id("account", identity_key)
    ts = now()

    conn.execute(
        """
        INSERT INTO auth_user_accounts (
            id, actor_id, login, password_hash, active, must_change_password,
            last_login_at, password_changed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 0, NULL, ?, ?, ?)
        """,
        (
            account_id,
            primary_actor_id,
            login.lower(),
            DEFAULT_PASSWORD_HASH,
            ts,
            ts,
            ts,
        ),
    )

    conn.execute(
        """
        INSERT INTO auth_account_people (
            account_id, person_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?)
        """,
        (account_id, person_id, ts, ts),
    )

    conn.execute(
        """
        INSERT INTO auth_account_actors (
            account_id, actor_id, scope_type, tenant_id, membership_id,
            is_primary, created_at, updated_at
        ) VALUES (?, ?, 'TENANT', ?, ?, 1, ?, ?)
        """,
        (
            account_id,
            primary_actor_id,
            primary_tenant_id,
            primary_membership_id,
            ts,
            ts,
        ),
    )

    return account_id


def bind_secondary_actor(
    conn: sqlite3.Connection,
    *,
    account_id: str,
    actor_id: str,
    tenant_id: str,
    membership_id: str,
) -> None:
    ts = now()
    conn.execute(
        """
        INSERT INTO auth_account_actors (
            account_id, actor_id, scope_type, tenant_id, membership_id,
            is_primary, created_at, updated_at
        ) VALUES (?, ?, 'TENANT', ?, ?, 0, ?, ?)
        """,
        (
            account_id,
            actor_id,
            tenant_id,
            membership_id,
            ts,
            ts,
        ),
    )


def create_single_tenant_identity(
    conn: sqlite3.Connection,
    *,
    batch: str,
    code: str,
    tenant: sqlite3.Row,
    status_id: str,
    identity: dict[str, str],
) -> dict[str, str]:
    identity_key = f"bite30e:{batch}:identity-{code}"
    person_id = fixture_id("global-person", identity_key)

    insert_global_person(
        conn,
        person_id=person_id,
        identity=identity,
    )

    legacy_person_id, membership_id = insert_membership_and_legacy_person(
        conn,
        identity_key=identity_key,
        person_id=person_id,
        tenant_id=tenant["id"],
        status_id=status_id,
        identity=identity,
        note=f"Bite 30E manual Identity {code.upper()}.",
    )

    actor_id, actor_key = insert_actor(
        conn,
        identity_key=identity_key,
        tenant_id=tenant["id"],
        legacy_person_id=legacy_person_id,
        display_name=(
            f"{identity['first_name']} {identity['last_name']} "
            f"(30E Identity {code.upper()})"
        ),
    )

    account_id = insert_account(
        conn,
        identity_key=identity_key,
        login=identity["login"],
        person_id=person_id,
        primary_actor_id=actor_id,
        primary_tenant_id=tenant["id"],
        primary_membership_id=membership_id,
    )

    return {
        **identity,
        "person_id": person_id,
        "account_id": account_id,
        "tenant_id": tenant["id"],
        "tenant_name": tenant["name"],
        "legacy_person_id": legacy_person_id,
        "membership_id": membership_id,
        "actor_id": actor_id,
        "actor_key": actor_key,
    }


def create_multi_tenant_identity(
    conn: sqlite3.Connection,
    *,
    batch: str,
    code: str,
    tenant_a: sqlite3.Row,
    tenant_b: sqlite3.Row,
    status_a_id: str,
    status_b_id: str,
    identity: dict[str, str],
) -> dict[str, str]:
    identity_key = f"bite30e:{batch}:identity-{code}"
    person_id = fixture_id("global-person", identity_key)

    insert_global_person(
        conn,
        person_id=person_id,
        identity=identity,
    )

    legacy_a_id, membership_a_id = insert_membership_and_legacy_person(
        conn,
        identity_key=identity_key,
        person_id=person_id,
        tenant_id=tenant_a["id"],
        status_id=status_a_id,
        identity=identity,
        note=f"Bite 30E manual Identity {code.upper()} — Tenant A.",
    )

    legacy_b_id, membership_b_id = insert_membership_and_legacy_person(
        conn,
        identity_key=identity_key,
        person_id=person_id,
        tenant_id=tenant_b["id"],
        status_id=status_b_id,
        identity=identity,
        note=f"Bite 30E manual Identity {code.upper()} — Tenant B.",
    )

    actor_a_id, actor_a_key = insert_actor(
        conn,
        identity_key=identity_key,
        tenant_id=tenant_a["id"],
        legacy_person_id=legacy_a_id,
        display_name=(
            f"{identity['first_name']} {identity['last_name']} "
            f"(30E Identity {code.upper()} · Tenant A)"
        ),
    )

    actor_b_id, actor_b_key = insert_actor(
        conn,
        identity_key=identity_key,
        tenant_id=tenant_b["id"],
        legacy_person_id=legacy_b_id,
        display_name=(
            f"{identity['first_name']} {identity['last_name']} "
            f"(30E Identity {code.upper()} · Tenant B)"
        ),
    )

    account_id = insert_account(
        conn,
        identity_key=identity_key,
        login=identity["login"],
        person_id=person_id,
        primary_actor_id=actor_a_id,
        primary_tenant_id=tenant_a["id"],
        primary_membership_id=membership_a_id,
    )

    bind_secondary_actor(
        conn,
        account_id=account_id,
        actor_id=actor_b_id,
        tenant_id=tenant_b["id"],
        membership_id=membership_b_id,
    )

    return {
        **identity,
        "person_id": person_id,
        "account_id": account_id,
        "tenant_a_id": tenant_a["id"],
        "tenant_a_name": tenant_a["name"],
        "tenant_a_legacy_person_id": legacy_a_id,
        "tenant_a_membership_id": membership_a_id,
        "tenant_a_actor_id": actor_a_id,
        "tenant_a_actor_key": actor_a_key,
        "tenant_b_id": tenant_b["id"],
        "tenant_b_name": tenant_b["name"],
        "tenant_b_legacy_person_id": legacy_b_id,
        "tenant_b_membership_id": membership_b_id,
        "tenant_b_actor_id": actor_b_id,
        "tenant_b_actor_key": actor_b_key,
    }


def assert_account_active(
    conn: sqlite3.Connection,
    fixture: dict[str, str],
    *,
    label: str,
) -> None:
    row = conn.execute(
        """
        SELECT id, login, active, must_change_password
        FROM auth_user_accounts
        WHERE id = ?
        """,
        (fixture["account_id"],),
    ).fetchone()

    if row is None:
        raise RuntimeError(f"{label}: Authentication Account was not created.")
    if not row["active"]:
        raise RuntimeError(f"{label}: Authentication Account must be ACTIVE.")
    if row["must_change_password"]:
        raise RuntimeError(
            f"{label}: must_change_password must be false for manual testing."
        )
    if row["login"].lower() != fixture["login"].lower():
        raise RuntimeError(f"{label}: Authentication Account login mismatch.")


def assert_no_delegated_roles(
    conn: sqlite3.Connection,
    actor_ids: list[str],
    *,
    label: str,
) -> None:
    placeholders = ",".join("?" for _ in actor_ids)
    rows = conn.execute(
        f"""
        SELECT
            g.actor_id,
            r.code AS role_code,
            g.tenant_id
        FROM authz_actor_role_grants g
        JOIN authz_roles r
          ON r.id = g.role_id
        WHERE g.actor_id IN ({placeholders})
          AND g.active = 1
        ORDER BY g.actor_id, r.code, g.tenant_id
        """,
        actor_ids,
    ).fetchall()

    if rows:
        details = ", ".join(
            f"{row['actor_id']}:{row['role_code']}@{row['tenant_id']}"
            for row in rows
        )
        raise RuntimeError(
            f"{label}: expected no active delegated Role Grants; found {details}"
        )


def assert_tenant_binding(
    conn: sqlite3.Connection,
    *,
    account_id: str,
    actor_id: str,
    tenant_id: str,
    membership_id: str,
    label: str,
) -> None:
    row = conn.execute(
        """
        SELECT
            aa.scope_type,
            aa.tenant_id,
            aa.membership_id,
            a.active AS actor_active,
            m.tenant_id AS membership_tenant_id,
            status.code AS membership_status_code
        FROM auth_account_actors aa
        JOIN authz_actors a
          ON a.id = aa.actor_id
        JOIN person_tenant_memberships m
          ON m.id = aa.membership_id
        JOIN reference_data status
          ON status.id = m.status_id
         AND status.tenant_id = m.tenant_id
         AND status.type = 'person_status'
        WHERE aa.account_id = ?
          AND aa.actor_id = ?
        LIMIT 1
        """,
        (account_id, actor_id),
    ).fetchone()

    if row is None:
        raise RuntimeError(f"{label}: Account → Actor binding is missing.")

    if row["scope_type"] != "TENANT":
        raise RuntimeError(f"{label}: Actor binding must have TENANT scope.")
    if row["tenant_id"] != tenant_id:
        raise RuntimeError(f"{label}: Actor binding tenant mismatch.")
    if row["membership_id"] != membership_id:
        raise RuntimeError(f"{label}: Membership ID mismatch.")
    if not row["actor_active"]:
        raise RuntimeError(f"{label}: Actor must be ACTIVE.")
    if row["membership_tenant_id"] != tenant_id:
        raise RuntimeError(f"{label}: Membership must belong to the same tenant.")
    if row["membership_status_code"] != "ACTIVE":
        raise RuntimeError(f"{label}: Membership status must be ACTIVE.")


def assert_binding_count(
    conn: sqlite3.Connection,
    *,
    account_id: str,
    expected: int,
    label: str,
) -> None:
    count = conn.execute(
        """
        SELECT COUNT(*)
        FROM auth_account_actors
        WHERE account_id = ?
          AND scope_type = 'TENANT'
        """,
        (account_id,),
    ).fetchone()[0]

    if count != expected:
        raise RuntimeError(
            f"{label}: expected exactly {expected} tenant Actor binding(s), found {count}."
        )


def assert_no_collaborator_journey(
    conn: sqlite3.Connection,
    fixture: dict[str, str],
    *,
    label: str,
) -> None:
    # collaborator_journeys may not be needed for Bite 30E identity setup,
    # but Identity B is explicitly intended to be Person-only.
    table = conn.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'collaborator_journeys'
        """
    ).fetchone()

    if table is None:
        return

    legacy_ids = [
        value
        for key, value in fixture.items()
        if key.endswith("legacy_person_id")
    ]
    if "legacy_person_id" in fixture:
        legacy_ids.append(fixture["legacy_person_id"])

    if not legacy_ids:
        return

    placeholders = ",".join("?" for _ in legacy_ids)
    count = conn.execute(
        f"""
        SELECT COUNT(*)
        FROM collaborator_journeys
        WHERE person_id IN ({placeholders})
          AND closed_at IS NULL
        """,
        legacy_ids,
    ).fetchone()[0]

    if count != 0:
        raise RuntimeError(
            f"{label}: expected no current Collaborator Journey; found {count}."
        )


def print_multi_identity(
    title: str,
    fixture: dict[str, str],
) -> None:
    print(title)
    print(f"  Login:                     {fixture['login']}")
    print(f"  Authentication Account ID: {fixture['account_id']}")
    print(f"  Person ID:                 {fixture['person_id']}")
    print()
    print(f"  Tenant A ID:               {fixture['tenant_a_id']}")
    print(f"  Tenant A Actor ID:         {fixture['tenant_a_actor_id']}")
    print(f"  Tenant A Actor Key:        {fixture['tenant_a_actor_key']}")
    print(f"  Tenant A Membership ID:    {fixture['tenant_a_membership_id']}")
    print()
    print(f"  Tenant B ID:               {fixture['tenant_b_id']}")
    print(f"  Tenant B Actor ID:         {fixture['tenant_b_actor_id']}")
    print(f"  Tenant B Actor Key:        {fixture['tenant_b_actor_key']}")
    print(f"  Tenant B Membership ID:    {fixture['tenant_b_membership_id']}")
    print()


def print_single_identity(
    title: str,
    fixture: dict[str, str],
) -> None:
    print(title)
    print(f"  Login:                     {fixture['login']}")
    print(f"  Authentication Account ID: {fixture['account_id']}")
    print(f"  Person ID:                 {fixture['person_id']}")
    print(f"  Tenant ID:                 {fixture['tenant_id']}")
    print(f"  Actor ID:                  {fixture['actor_id']}")
    print(f"  Actor Key:                 {fixture['actor_key']}")
    print(f"  Membership ID:             {fixture['membership_id']}")
    print()


def main() -> int:
    args = parse_args()
    batch = normalize_batch(args.batch)

    db_path = Path(args.db_path).expanduser().resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    lowered_path = str(db_path).lower()
    if "prod" in lowered_path or "production" in lowered_path:
        raise SystemExit(
            "Refusing to modify a database path that looks like production."
        )

    identities = {
        code: identity_data(batch, code)
        for code in ("a", "b", "c", "d")
    }

    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = db_path.with_name(
            db_path.name + f".before-bite30e-manual-identities-{stamp}.bak"
        )
        shutil.copy2(db_path, backup)
        print(f"Backup: {backup}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    try:
        require_tables(conn)

        conn.execute("BEGIN IMMEDIATE")

        tenant_a = resolve_tenant(
            conn,
            args.tenant_a,
            label="Tenant A",
        )
        tenant_b = resolve_tenant(
            conn,
            args.tenant_b,
            label="Tenant B",
        )

        if tenant_a["id"] == tenant_b["id"]:
            raise SystemExit(
                "Tenant A and Tenant B must be different tenants for Bite 30E."
            )

        require_unused_batch(conn, batch, identities)

        status_a_id = active_person_status_id(conn, tenant_a["id"])
        status_b_id = active_person_status_id(conn, tenant_b["id"])

        fixture_a = create_multi_tenant_identity(
            conn,
            batch=batch,
            code="a",
            tenant_a=tenant_a,
            tenant_b=tenant_b,
            status_a_id=status_a_id,
            status_b_id=status_b_id,
            identity=identities["a"],
        )

        fixture_b = create_single_tenant_identity(
            conn,
            batch=batch,
            code="b",
            tenant=tenant_a,
            status_id=status_a_id,
            identity=identities["b"],
        )

        fixture_c = create_single_tenant_identity(
            conn,
            batch=batch,
            code="c",
            tenant=tenant_b,
            status_id=status_b_id,
            identity=identities["c"],
        )

        fixture_d = create_multi_tenant_identity(
            conn,
            batch=batch,
            code="d",
            tenant_a=tenant_a,
            tenant_b=tenant_b,
            status_a_id=status_a_id,
            status_b_id=status_b_id,
            identity=identities["d"],
        )

        for label, fixture in (
            ("Identity A", fixture_a),
            ("Identity B", fixture_b),
            ("Identity C", fixture_c),
            ("Identity D", fixture_d),
        ):
            assert_account_active(conn, fixture, label=label)

        for label, fixture in (
            ("Identity A", fixture_a),
            ("Identity D", fixture_d),
        ):
            assert_binding_count(
                conn,
                account_id=fixture["account_id"],
                expected=2,
                label=label,
            )
            assert_tenant_binding(
                conn,
                account_id=fixture["account_id"],
                actor_id=fixture["tenant_a_actor_id"],
                tenant_id=fixture["tenant_a_id"],
                membership_id=fixture["tenant_a_membership_id"],
                label=f"{label} / Tenant A",
            )
            assert_tenant_binding(
                conn,
                account_id=fixture["account_id"],
                actor_id=fixture["tenant_b_actor_id"],
                tenant_id=fixture["tenant_b_id"],
                membership_id=fixture["tenant_b_membership_id"],
                label=f"{label} / Tenant B",
            )
            assert_no_delegated_roles(
                conn,
                [
                    fixture["tenant_a_actor_id"],
                    fixture["tenant_b_actor_id"],
                ],
                label=label,
            )

        for label, fixture in (
            ("Identity B", fixture_b),
            ("Identity C", fixture_c),
        ):
            assert_binding_count(
                conn,
                account_id=fixture["account_id"],
                expected=1,
                label=label,
            )
            assert_tenant_binding(
                conn,
                account_id=fixture["account_id"],
                actor_id=fixture["actor_id"],
                tenant_id=fixture["tenant_id"],
                membership_id=fixture["membership_id"],
                label=label,
            )
            assert_no_delegated_roles(
                conn,
                [fixture["actor_id"]],
                label=label,
            )

        assert_no_collaborator_journey(
            conn,
            fixture_b,
            label="Identity B",
        )

        fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if fk_errors:
            details = "; ".join(str(tuple(row)) for row in fk_errors[:10])
            raise RuntimeError(f"Foreign-key check failed: {details}")

        conn.commit()

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print()
    print("Bite 30E manual-test identities created successfully.")
    print()
    print(f"Tenant A: {tenant_a['name']} ({tenant_a['id']})")
    print(f"Tenant B: {tenant_b['name']} ({tenant_b['id']})")
    print(f"Password for all four Accounts: {DEFAULT_PASSWORD}")
    print()
    print("Canonical terminology:")
    print("  Person ID     = global_people.id")
    print("  Account ID    = auth_user_accounts.id")
    print("  Actor ID      = authz_actors.id")
    print("  Actor Key     = authz_actors.actor_key")
    print("  Membership ID = person_tenant_memberships.id")
    print()

    print_multi_identity(
        "Identity A — Multi-Tenant Ordinary Account",
        fixture_a,
    )

    print_single_identity(
        "Identity B — Person-Only Account",
        fixture_b,
    )
    print("  Delegated Roles:            NONE")
    print("  Collaborator Journey:       NONE")
    print()

    print_single_identity(
        "Identity C — Single-Tenant Account",
        fixture_c,
    )
    print("  Usable tenant Actor count:  1")
    print()

    print_multi_identity(
        "Identity D — Disposable Multi-Tenant Account",
        fixture_d,
    )

    print("Expected Bite 30E shape:")
    print("  Identity A: one ACTIVE Account -> two ACTIVE tenant Actors -> two ACTIVE Memberships")
    print("  Identity B: one ACTIVE Account -> one ACTIVE tenant Actor -> one ACTIVE Membership; no delegated Roles")
    print("  Identity C: one ACTIVE Account -> exactly one usable tenant Actor")
    print("  Identity D: one ACTIVE Account -> two ACTIVE tenant Actors; safe for Actor deactivate/reactivate tests")
    print()
    print("To create a fresh set later:")
    print(
        "  python3 scripts/seed-bite30e-manual-test-identities.py "
        "--batch retry1"
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sqlite3.Error as exc:
        print(f"SQLite error: {exc}", file=sys.stderr)
        raise SystemExit(1)
    except Exception as exc:
        print(f"Seed failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
