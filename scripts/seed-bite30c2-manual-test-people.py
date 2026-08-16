#!/usr/bin/env python3
"""Create the five Bite 30C.2 manual-verification People in local SQLite.

Tenant A is exactly "Byte 28A Manual Test".
Tenant B is exactly the tenant whose id is "default".

The script creates the five requested Person fixtures plus dedicated local
Tenant Administrator fixtures for Tenant A and Tenant B. It does not create or
modify the Application Administrator identity.

LOCAL DEVELOPMENT ONLY. Stop the backend before running this script because it
writes directly to backend/data/app.db.

The fixture batch is intentionally write-once. Once a manual test enables
Authentication for Person 1 or Person 2, ERS correctly prohibits deleting the
Authentication Account, so this script cannot safely restore that Person to a
pre-provisioning state. To create a fresh set after testing, rerun with a new
--batch value, for example:

    python3 scripts/seed-bite30c2-manual-test-people.py --batch retry1
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
DEFAULT_DB = ROOT / "backend" / "data" / "app.db"
BASE_HELPER = SCRIPT_DIR / "seed-bite30c-byte28a-manual-testdata.py"
TENANT_A_NAME = "Byte 28A Manual Test"
TENANT_A_ALIASES = (TENANT_A_NAME, "Bite 28A Manual Test")
TENANT_A_CODE = "BYTE28A_MANUAL"
TENANT_B_ID = "default"
TENANT_A_ADMIN_LOGIN = "manual30c2.byte28a-admin@example.test"
TENANT_B_ADMIN_LOGIN = "manual30c2.default-admin@example.test"
DEFAULT_BATCH = "manual30c2"
DEFAULT_PASSWORD = "Manual-30C-Password!"
# bcrypt cost-10 hash for DEFAULT_PASSWORD. This is the same known local-test
# credential used by the existing Bite 30C manual-data seeder.
DEFAULT_PASSWORD_HASH = "$2a$10$2aGDP1WNWYv3Q2aC4URnv.t40kw1HHjYOHUfvmctSf8Pb7D6Vo0t2"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create Bite 30C.2 manual-test People in Byte 28A Manual Test and default."
    )
    parser.add_argument(
        "--db-path",
        default=os.getenv("DATABASE_PATH") or str(DEFAULT_DB),
        help=f"SQLite database path (default: {DEFAULT_DB})",
    )
    parser.add_argument(
        "--batch",
        default=DEFAULT_BATCH,
        help=(
            "Fixture batch suffix. The default is 'manual30c2'. Use a new value "
            "to create a fresh five-Person set after a previous manual test run."
        ),
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not create a timestamped database backup before writing fixtures.",
    )
    return parser.parse_args()


def load_base_helper() -> ModuleType:
    if not BASE_HELPER.exists():
        raise SystemExit(f"Required helper script not found: {BASE_HELPER}")
    spec = importlib.util.spec_from_file_location("ers_bite30c_manual_seed", BASE_HELPER)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Unable to load helper script: {BASE_HELPER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalized_batch(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-").lower()
    if not value:
        raise SystemExit("--batch must contain at least one letter or number.")
    if len(value) > 30:
        raise SystemExit("--batch must be 30 characters or fewer.")
    return value


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def deterministic_int(key: str, digits: int) -> int:
    modulus = 10**digits
    return int(hashlib.sha1(key.encode("utf-8")).hexdigest()[:15], 16) % modulus


def cpf_for(key: str) -> str:
    """Generate a deterministic, algorithmically valid CPF for local fixtures."""
    base = f"{100_000_000 + deterministic_int(key, 8):09d}"[-9:]
    if len(set(base)) == 1:
        base = "390533447"

    def check_digit(prefix: str, start_weight: int) -> str:
        total = sum(int(digit) * (start_weight - index) for index, digit in enumerate(prefix))
        value = 11 - (total % 11)
        return "0" if value >= 10 else str(value)

    first = check_digit(base, 10)
    second = check_digit(base + first, 11)
    return base + first + second


def identity(batch: str, number: int) -> dict[str, str]:
    names = {
        1: ("Aline", "Provisioning"),
        2: ("Bruno", "Multitenant"),
        3: ("Carla", "InactiveMembership"),
        4: ("Diego", "ActiveAccount"),
        5: ("Elisa", "InactiveAccount"),
    }
    first_name, last_name = names[number]
    key = f"{batch}:person:{number}"
    suffix = deterministic_int(key, 8)
    login = f"{batch}.person{number}@example.test".lower()
    return {
        "first_name": first_name,
        "last_name": last_name,
        "nickname": f"30C2 Person {number}",
        "cpf": cpf_for(key),
        "rg": f"30C2-P{number}-{hashlib.sha1(key.encode()).hexdigest()[:6].upper()}",
        "cellular": f"119{suffix:08d}",
        "email": login,
        "pix_key": f"{batch}.person{number}@pix.example.test".lower(),
    }


def fixture_key(batch: str, number: int) -> str:
    return f"30c2-{batch}-person-{number}"


def exact_tenant(conn: sqlite3.Connection, *, tenant_id: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT id, code, name, active FROM tenants WHERE id = ? LIMIT 1",
        (tenant_id,),
    ).fetchone()
    if row is None:
        raise SystemExit(f"Required tenant not found (id={tenant_id!r}).")
    if not row["active"]:
        raise SystemExit(f"Required tenant {row['name']!r} exists but is inactive.")
    return row


def ensure_tenant_a(conn: sqlite3.Connection, helper: ModuleType) -> tuple[sqlite3.Row, bool]:
    """Resolve the historical Byte/Bite 28A tenant or create it for local testing.

    Only the `default` tenant is migration-seeded.  Bite 30C's older manual-data
    helper treated Byte/Bite 28A Manual Test as pre-existing, which makes a clean
    local database unsuitable for the 30C.2 fixture script.
    """
    for candidate in TENANT_A_ALIASES:
        row = conn.execute(
            "SELECT id, code, name, active FROM tenants WHERE LOWER(name) = LOWER(?) LIMIT 1",
            (candidate,),
        ).fetchone()
        if row is not None:
            if not row["active"]:
                raise SystemExit(f"Required Tenant A {row['name']!r} exists but is inactive.")
            return row, False

    code_conflict = conn.execute(
        "SELECT id, code, name, active FROM tenants WHERE UPPER(code) = ? LIMIT 1",
        (TENANT_A_CODE,),
    ).fetchone()
    if code_conflict is not None:
        raise SystemExit(
            f"Cannot create Tenant A {TENANT_A_NAME!r}: tenant code {TENANT_A_CODE!r} "
            f"is already used by {code_conflict['name']!r} ({code_conflict['id']})."
        )

    tenant_id = helper.fixture_id("tenant", "byte-28a-manual-test")
    id_conflict = conn.execute(
        "SELECT id, code, name, active FROM tenants WHERE id = ? LIMIT 1",
        (tenant_id,),
    ).fetchone()
    if id_conflict is not None:
        raise SystemExit(
            f"Cannot create Tenant A {TENANT_A_NAME!r}: deterministic fixture id {tenant_id!r} "
            f"is already used by {id_conflict['name']!r}."
        )

    ts = utc_now()
    conn.execute(
        """
        INSERT INTO tenants (id, code, name, description, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        """,
        (
            tenant_id,
            TENANT_A_CODE,
            TENANT_A_NAME,
            "Local manual-test tenant created by the Bite 30C.2 fixture seeder.",
            ts,
            ts,
        ),
    )
    row = conn.execute(
        "SELECT id, code, name, active FROM tenants WHERE id = ? LIMIT 1",
        (tenant_id,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Tenant A insert succeeded but the tenant could not be reloaded.")
    return row, True


def ensure_unused_batch(conn: sqlite3.Connection, helper: ModuleType, batch: str) -> None:
    ids = [helper.fixture_id("global-person", fixture_key(batch, number)) for number in range(1, 6)]
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT id, first_name, last_name, email FROM global_people WHERE id IN ({placeholders}) ORDER BY id",
        ids,
    ).fetchall()
    if not rows:
        return

    print(f"Fixture batch {batch!r} has already been used:", file=sys.stderr)
    for row in rows:
        print(
            f"  {row['id']}  {row['first_name']} {row['last_name']}  {row['email']}",
            file=sys.stderr,
        )
    raise SystemExit(
        "Refusing to overwrite manual-test identities because Authentication Accounts are intentionally undeletable. "
        "Run again with a new --batch value, for example --batch retry1."
    )


def seed_person_projection(
    conn: sqlite3.Connection,
    helper: ModuleType,
    *,
    batch: str,
    number: int,
    tenant_id: str,
    status_id: str,
    notes: str,
) -> dict[str, str]:
    ident = identity(batch, number)
    key = fixture_key(batch, number)
    global_id = helper.fixture_id("global-person", key)
    helper.upsert_global_person(conn, global_id, ident)
    legacy_id, membership_id = helper.upsert_legacy_person(
        conn,
        tenant_id,
        global_id,
        key,
        ident,
        status_id,
        notes,
    )
    return {
        **ident,
        "global_id": global_id,
        "legacy_id": legacy_id,
        "membership_id": membership_id,
    }


def create_existing_account(
    conn: sqlite3.Connection,
    helper: ModuleType,
    *,
    batch: str,
    number: int,
    person: dict[str, str],
    tenant_id: str,
    active: bool,
) -> dict[str, str]:
    key = fixture_key(batch, number)
    actor_id = helper.upsert_actor(
        conn,
        f"{key}:{tenant_id}",
        f"{person['first_name']} {person['last_name']} (30C.2 Person {number})",
        person["legacy_id"],
    )
    helper.upsert_grant(conn, actor_id, "PERSON", tenant_id)
    account_id = helper.upsert_account(
        conn,
        key,
        person["email"],
        actor_id,
        person["global_id"],
        tenant_id,
        person["membership_id"],
    )

    # upsert_account uses the Bite 30C default test hash; write it explicitly so
    # this script's credential contract remains obvious even if the helper's
    # default fixture password changes later.
    conn.execute(
        """
        UPDATE auth_user_accounts
        SET password_hash = ?, active = ?, must_change_password = 0,
            password_changed_at = ?, updated_at = ?
        WHERE id = ?
        """,
        (DEFAULT_PASSWORD_HASH, 1 if active else 0, utc_now(), utc_now(), account_id),
    )
    return {**person, "actor_id": actor_id, "account_id": account_id}


def main() -> int:
    args = parse_args()
    batch = normalized_batch(args.batch)
    helper = load_base_helper()

    db_path = Path(args.db_path).expanduser().resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")
    lowered_path = str(db_path).lower()
    if "prod" in lowered_path or "production" in lowered_path:
        raise SystemExit("Refusing to seed a database path that looks like production.")

    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = db_path.with_name(db_path.name + f".before-bite30c2-manual-people-{stamp}.bak")
        shutil.copy2(db_path, backup)
        print(f"Backup: {backup}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    helper.require_tables(
        conn,
        [
            "tenants",
            "reference_data",
            "people",
            "global_people",
            "person_tenant_memberships",
            "authz_actors",
            "authz_roles",
            "authz_actor_role_grants",
            "auth_user_accounts",
            "auth_account_people",
            "auth_account_actors",
            "auth_account_reactivation_requests",
        ],
    )

    tenant_b = exact_tenant(conn, tenant_id=TENANT_B_ID)
    ensure_unused_batch(conn, helper, batch)

    try:
        conn.execute("BEGIN IMMEDIATE")
        tenant_a, tenant_a_created = ensure_tenant_a(conn, helper)
        if tenant_a["id"] == tenant_b["id"]:
            raise RuntimeError("Tenant A unexpectedly resolves to the default tenant.")

        refs_a = helper.tenant_refs(conn, tenant_a["id"])
        refs_b = helper.tenant_refs(conn, tenant_b["id"])

        # Guarantee usable tenant-scoped administrators for the manual tests.
        # These are administrative fixtures, not part of Persons 1-5 below.
        tenant_a_admin = helper.seed_auth_identity(
            conn,
            tenant_a["id"],
            refs_a,
            "30c2-tenant-a-admin",
            96,
            "30c2aadmin",
            "TENANT_ADMIN",
            TENANT_A_ADMIN_LOGIN,
        )
        tenant_b_admin = helper.seed_auth_identity(
            conn,
            tenant_b["id"],
            refs_b,
            "30c2-tenant-b-admin",
            97,
            "30c2badmin",
            "TENANT_ADMIN",
            TENANT_B_ADMIN_LOGIN,
        )
        inactive_a = helper.ensure_reference(
            conn,
            tenant_a["id"],
            "person_status",
            "INACTIVE",
            "Inactive",
            "Inactive Person",
            20,
        )

        # Person 1 — active Membership in Tenant A only; no Account yet.
        person1 = seed_person_projection(
            conn,
            helper,
            batch=batch,
            number=1,
            tenant_id=tenant_a["id"],
            status_id=refs_a["person_active"],
            notes="Bite 30C.2 Person 1: active Tenant A Membership only; Authentication intentionally not enabled.",
        )

        # Person 2 — active Memberships in Tenant A and Tenant B; no Account yet.
        person2 = seed_person_projection(
            conn,
            helper,
            batch=batch,
            number=2,
            tenant_id=tenant_a["id"],
            status_id=refs_a["person_active"],
            notes="Bite 30C.2 Person 2: active Tenant A Membership; Authentication intentionally not enabled.",
        )
        person2_b_legacy, person2_b_membership = helper.upsert_legacy_person(
            conn,
            tenant_b["id"],
            person2["global_id"],
            fixture_key(batch, 2),
            identity(batch, 2),
            refs_b["person_active"],
            "Bite 30C.2 Person 2: active Tenant B Membership; used to verify silent global Account reuse.",
        )
        person2["tenant_b_legacy_id"] = person2_b_legacy
        person2["tenant_b_membership_id"] = person2_b_membership

        # Person 3 — Person exists in Tenant A compatibility projection, but the
        # Tenant A Membership is inactive, so ordinary Authentication provisioning
        # must be unavailable/rejected.
        person3 = seed_person_projection(
            conn,
            helper,
            batch=batch,
            number=3,
            tenant_id=tenant_a["id"],
            status_id=inactive_a,
            notes="Bite 30C.2 Person 3: Tenant A Membership intentionally INACTIVE; no Authentication Account.",
        )

        # Person 4 — active Tenant A Membership and existing ACTIVE Account.
        person4_projection = seed_person_projection(
            conn,
            helper,
            batch=batch,
            number=4,
            tenant_id=tenant_a["id"],
            status_id=refs_a["person_active"],
            notes="Bite 30C.2 Person 4: active Tenant A Membership with existing active Authentication Account.",
        )
        person4 = create_existing_account(
            conn,
            helper,
            batch=batch,
            number=4,
            person=person4_projection,
            tenant_id=tenant_a["id"],
            active=True,
        )

        # Person 5 — active Tenant A Membership and existing INACTIVE Account.
        person5_projection = seed_person_projection(
            conn,
            helper,
            batch=batch,
            number=5,
            tenant_id=tenant_a["id"],
            status_id=refs_a["person_active"],
            notes="Bite 30C.2 Person 5: active Tenant A Membership with existing inactive Authentication Account.",
        )
        person5 = create_existing_account(
            conn,
            helper,
            batch=batch,
            number=5,
            person=person5_projection,
            tenant_id=tenant_a["id"],
            active=False,
        )

        fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if fk_errors:
            raise RuntimeError(
                "Foreign-key check failed: " + "; ".join(str(tuple(row)) for row in fk_errors[:10])
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print("\nBite 30C.2 manual test People created successfully.\n")
    print(f"Tenant A: {tenant_a['name']} ({tenant_a['id']})")
    if tenant_a_created:
        print("  Created by this fixture run because the tenant was not already present.")
    elif tenant_a["name"].lower() != TENANT_A_NAME.lower():
        print(f"  Reused historical tenant-name alias; requested name was {TENANT_A_NAME!r}.")
    print(f"Tenant B: {tenant_b['name']} ({tenant_b['id']})")
    print(f"Fixture batch: {batch}\n")

    print("Tenant Administrator credentials:")
    print(f"  Tenant A: {tenant_a_admin['login']}  /  {DEFAULT_PASSWORD}")
    print(f"  Tenant B: {tenant_b_admin['login']}  /  {DEFAULT_PASSWORD}\n")

    print("Common test password / recommended temporary password:")
    print(f"  {DEFAULT_PASSWORD}\n")

    rows = [
        (
            "Person 1",
            f"{person1['first_name']} {person1['last_name']}",
            person1["email"],
            "No Account yet",
            "ACTIVE",
            "none",
            "Use common password as Temporary Password when Tenant A Admin clicks Enable Authentication",
        ),
        (
            "Person 2",
            f"{person2['first_name']} {person2['last_name']}",
            person2["email"],
            "No Account yet",
            "ACTIVE",
            "ACTIVE",
            "Use common password when first enabling in Tenant A; Tenant B must silently reuse that Account",
        ),
        (
            "Person 3",
            f"{person3['first_name']} {person3['last_name']}",
            person3["email"],
            "No Account",
            "INACTIVE",
            "none",
            "No Authentication credentials; provisioning must be unavailable/rejected",
        ),
        (
            "Person 4",
            f"{person4['first_name']} {person4['last_name']}",
            person4["email"],
            "ACTIVE Account",
            "ACTIVE",
            "none",
            f"Login={person4['email']}  Password={DEFAULT_PASSWORD}",
        ),
        (
            "Person 5",
            f"{person5['first_name']} {person5['last_name']}",
            person5["email"],
            "INACTIVE Account",
            "ACTIVE",
            "none",
            f"Login={person5['email']}  Password={DEFAULT_PASSWORD} (valid credentials for Request reactivation)",
        ),
    ]

    print(f"{'Fixture':<10} {'Name':<27} {'Login / Person email':<42} {'Account':<18} {'Tenant A':<10} {'Tenant B':<10}")
    print("-" * 126)
    for fixture, name, login, account, membership_a, membership_b, _ in rows:
        print(f"{fixture:<10} {name:<27} {login:<42} {account:<18} {membership_a:<10} {membership_b:<10}")

    print("\nCredential/use notes:")
    for fixture, _, _, _, _, _, note in rows:
        print(f"  {fixture}: {note}")

    print("\nImportant:")
    print("  - Persons 1 and 2 intentionally have no Authentication Account at seed time.")
    print("  - Person 3 intentionally has an INACTIVE Tenant A Membership.")
    print("  - Person 4 has one active Account and one Tenant A Actor.")
    print("  - Person 5 has the same Account/Actor shape as Person 4, but the Account is inactive.")
    print("  - Dedicated Tenant Administrators are created/reused for Tenant A and Tenant B.")
    print("  - The existing Application Administrator is not changed.")
    print("  - Restart make local-backend after seeding so runtime state is rebuilt from the database.")
    print(f"  - To create a fresh set later, rerun with a new batch, e.g. --batch {batch}-retry1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
