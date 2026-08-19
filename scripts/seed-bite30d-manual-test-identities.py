#!/usr/bin/env python3
"""Seed the two core Bite 30D manual-test identities into local ERS SQLite.

Creates:

Identity A — Person-only Account
    Authentication Account: ACTIVE
    Person–Tenant Membership: ACTIVE
    Collaborator Journey: none
    Delegated Roles: none

Identity B — Collaborator Account
    Authentication Account: ACTIVE
    Person–Tenant Membership: ACTIVE
    Collaborator Journey: ACTIVE/current
    Delegated Roles: none

Default tenant:
    Byte 28A Manual Test
    ("Bite 28A Manual Test" is accepted by the existing helper)

Default credentials:
    Identity A login: manual30d.identity-a@example.test
    Identity B login: manual30d.identity-b@example.test
    Password:         Manual-30C-Password!

LOCAL DEVELOPMENT ONLY.

Stop the backend before running this script because it writes directly to
backend/data/app.db.

The fixture batch is intentionally write-once. To create another disposable
pair after testing, use a new --batch value, for example:

    python3 scripts/seed-bite30d-manual-test-identities.py --batch retry1
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

DEFAULT_TENANT_NAME = "Byte 28A Manual Test"
DEFAULT_TENANT_CODE = "BYTE28A_MANUAL"
DEFAULT_BATCH = "manual30d"
DEFAULT_PASSWORD = "Manual-30C-Password!"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create Bite 30D Person-only and Collaborator manual-test identities."
    )
    parser.add_argument(
        "--db-path",
        default=os.getenv("DATABASE_PATH") or str(DEFAULT_DB),
        help=f"SQLite database path (default: {DEFAULT_DB})",
    )
    parser.add_argument(
        "--tenant-name",
        default=DEFAULT_TENANT_NAME,
        help=f"Tenant used by both identities (default: {DEFAULT_TENANT_NAME!r})",
    )
    parser.add_argument(
        "--batch",
        default=DEFAULT_BATCH,
        help=(
            "Write-once fixture batch name. Use a different value to create a "
            "fresh disposable pair after an earlier manual-test run."
        ),
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not create a timestamped backup before writing the fixtures.",
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


def normalize_batch(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-").lower()
    if not normalized:
        raise SystemExit("--batch must contain at least one letter or number.")
    if len(normalized) > 30:
        raise SystemExit("--batch must be 30 characters or fewer.")
    return normalized


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def deterministic_int(key: str, digits: int) -> int:
    modulus = 10**digits
    return int(hashlib.sha1(key.encode("utf-8")).hexdigest()[:15], 16) % modulus


def valid_cpf(key: str) -> str:
    """Generate a deterministic algorithmically valid CPF for a local fixture."""
    base = f"{100_000_000 + deterministic_int(key, 8):09d}"[-9:]
    if len(set(base)) == 1:
        base = "390533447"

    def digit(prefix: str, weight: int) -> str:
        total = sum(int(value) * (weight - index) for index, value in enumerate(prefix))
        result = 11 - (total % 11)
        return "0" if result >= 10 else str(result)

    first = digit(base, 10)
    second = digit(base + first, 11)
    return base + first + second


def batch_prefix(batch: str) -> str:
    return "manual30d" if batch == DEFAULT_BATCH else f"manual30d.{batch}"


def fixture_identity(batch: str, identity: str) -> dict[str, str]:
    if identity == "a":
        first_name = "Helena"
        last_name = "SelfService"
        nickname = "30D Identity A"
    elif identity == "b":
        first_name = "Mateus"
        last_name = "Collaborator"
        nickname = "30D Identity B"
    else:
        raise ValueError(f"unknown identity {identity!r}")

    key = f"bite30d:{batch}:identity-{identity}"
    prefix = batch_prefix(batch)
    suffix = deterministic_int(key, 8)
    login = f"{prefix}.identity-{identity}@example.test".lower()

    return {
        "first_name": first_name,
        "last_name": last_name,
        "nickname": nickname if batch == DEFAULT_BATCH else f"{nickname} {batch}",
        "cpf": valid_cpf(key),
        "rg": f"30D-{identity.upper()}-{hashlib.sha1(key.encode()).hexdigest()[:8].upper()}",
        "cellular": f"119{suffix:08d}",
        "email": login,
        "pix_key": f"{prefix}.identity-{identity}@pix.example.test".lower(),
        "login": login,
    }




def resolve_or_create_tenant(
    conn: sqlite3.Connection,
    helper: ModuleType,
    requested: str,
) -> tuple[sqlite3.Row, bool]:
    """Resolve the requested tenant; create Byte/Bite 28A Manual Test if absent.

    Only the default tenant is guaranteed by the migration seed. The historical
    Byte/Bite 28A Manual Test tenant is frequently present in ERS manual-test
    databases, but a clean database may not have it yet.
    """
    try:
        return helper.resolve_target_tenant(conn, requested), False
    except SystemExit:
        normalized = requested.strip().lower()
        allowed = {
            "byte 28a manual test",
            "bite 28a manual test",
        }
        if normalized not in allowed:
            raise

    existing_code = conn.execute(
        "SELECT id, code, name, active FROM tenants WHERE UPPER(code) = ? LIMIT 1",
        (DEFAULT_TENANT_CODE,),
    ).fetchone()
    if existing_code is not None:
        if not existing_code["active"]:
            raise SystemExit(
                f"Tenant using code {DEFAULT_TENANT_CODE!r} exists but is inactive."
            )
        return existing_code, False

    tenant_id = helper.fixture_id("tenant", "byte-28a-manual-test")
    existing_id = conn.execute(
        "SELECT id, code, name, active FROM tenants WHERE id = ? LIMIT 1",
        (tenant_id,),
    ).fetchone()
    if existing_id is not None:
        raise SystemExit(
            f"Cannot create {DEFAULT_TENANT_NAME!r}: deterministic tenant ID "
            f"{tenant_id!r} is already used by {existing_id['name']!r}."
        )

    ts = now()
    conn.execute(
        """
        INSERT INTO tenants (
            id, code, name, description, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?)
        """,
        (
            tenant_id,
            DEFAULT_TENANT_CODE,
            DEFAULT_TENANT_NAME,
            "Local manual-test tenant created by the Bite 30D fixture seeder.",
            ts,
            ts,
        ),
    )
    row = conn.execute(
        "SELECT id, code, name, active FROM tenants WHERE id = ? LIMIT 1",
        (tenant_id,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Tenant creation succeeded but the tenant could not be reloaded.")
    return row, True


def require_unused_batch(
    conn: sqlite3.Connection,
    helper: ModuleType,
    batch: str,
    identity_a: dict[str, str],
    identity_b: dict[str, str],
) -> None:
    keys = [f"bite30d:{batch}:identity-a", f"bite30d:{batch}:identity-b"]
    person_ids = [helper.fixture_id("global-person", key) for key in keys]
    placeholders = ",".join("?" for _ in person_ids)

    existing_people = conn.execute(
        f"""
        SELECT id, first_name, last_name, email
        FROM global_people
        WHERE id IN ({placeholders})
        ORDER BY id
        """,
        person_ids,
    ).fetchall()

    logins = [identity_a["login"], identity_b["login"]]
    login_placeholders = ",".join("?" for _ in logins)
    existing_accounts = conn.execute(
        f"""
        SELECT id, login, active
        FROM auth_user_accounts
        WHERE LOWER(login) IN ({login_placeholders})
        ORDER BY login
        """,
        [login.lower() for login in logins],
    ).fetchall()

    if not existing_people and not existing_accounts:
        return

    print(f"Fixture batch {batch!r} has already been used.", file=sys.stderr)
    for row in existing_people:
        print(
            f"  Person: {row['id']}  {row['first_name']} {row['last_name']}  {row['email']}",
            file=sys.stderr,
        )
    for row in existing_accounts:
        print(
            f"  Account: {row['id']}  {row['login']}  active={row['active']}",
            file=sys.stderr,
        )
    raise SystemExit(
        "Refusing to mutate an already-used Bite 30D fixture batch. "
        "Use a new batch, for example: --batch retry1"
    )


def create_person_account(
    conn: sqlite3.Connection,
    helper: ModuleType,
    *,
    batch: str,
    identity_code: str,
    tenant_id: str,
    person_status_id: str,
    identity: dict[str, str],
) -> dict[str, str]:
    key = f"bite30d:{batch}:identity-{identity_code}"
    global_person_id = helper.fixture_id("global-person", key)

    helper.upsert_global_person(conn, global_person_id, identity)
    legacy_person_id, membership_id = helper.upsert_legacy_person(
        conn,
        tenant_id,
        global_person_id,
        key,
        identity,
        person_status_id,
        f"Bite 30D manual Identity {identity_code.upper()}.",
    )

    actor_id = helper.upsert_actor(
        conn,
        f"{key}:{tenant_id}",
        f"{identity['first_name']} {identity['last_name']} (30D Identity {identity_code.upper()})",
        legacy_person_id,
    )
    account_id = helper.upsert_account(
        conn,
        key,
        identity["login"],
        actor_id,
        global_person_id,
        tenant_id,
        membership_id,
    )

    # Be explicit about the credential/state contract rather than relying on a
    # future change to the older helper's defaults.
    conn.execute(
        """
        UPDATE auth_user_accounts
        SET password_hash = ?,
            active = 1,
            must_change_password = 0,
            last_login_at = NULL,
            password_changed_at = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            helper.DEFAULT_PASSWORD_HASH,
            now(),
            now(),
            account_id,
        ),
    )

    return {
        **identity,
        "global_person_id": global_person_id,
        "global_id": global_person_id,
        "legacy_person_id": legacy_person_id,
        "legacy_id": legacy_person_id,
        "membership_id": membership_id,
        "actor_id": actor_id,
        "account_id": account_id,
    }


def assert_no_delegated_roles(
    conn: sqlite3.Connection,
    *,
    actor_id: str,
    label: str,
) -> None:
    rows = conn.execute(
        """
        SELECT r.code, g.tenant_id
        FROM authz_actor_role_grants g
        JOIN authz_roles r
          ON r.id = g.role_id
        WHERE g.actor_id = ?
          AND g.active = 1
        ORDER BY r.code, g.tenant_id
        """,
        (actor_id,),
    ).fetchall()
    if rows:
        details = ", ".join(f"{row['code']}@{row['tenant_id']}" for row in rows)
        raise RuntimeError(
            f"{label} unexpectedly has active delegated Role Grant(s): {details}"
        )


def assert_identity_a_shape(
    conn: sqlite3.Connection,
    *,
    tenant_id: str,
    fixture: dict[str, str],
) -> None:
    count = conn.execute(
        """
        SELECT COUNT(*)
        FROM collaborator_journeys
        WHERE tenant_id = ?
          AND person_id = ?
          AND closed_at IS NULL
        """,
        (tenant_id, fixture["legacy_person_id"]),
    ).fetchone()[0]
    if count != 0:
        raise RuntimeError(
            f"Identity A must have no current Collaborator Journey; found {count}."
        )


def assert_identity_b_shape(
    conn: sqlite3.Connection,
    *,
    tenant_id: str,
    fixture: dict[str, str],
    collaborator_id: str,
) -> None:
    row = conn.execute(
        """
        SELECT id, tenant_id, person_id, closed_at
        FROM collaborator_journeys
        WHERE id = ?
        LIMIT 1
        """,
        (collaborator_id,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Identity B Collaborator Journey was not created.")
    if (
        row["tenant_id"] != tenant_id
        or row["person_id"] != fixture["legacy_person_id"]
        or row["closed_at"] is not None
    ):
        raise RuntimeError(
            "Identity B Collaborator Journey is not current in the expected tenant."
        )


def main() -> int:
    args = parse_args()
    batch = normalize_batch(args.batch)
    helper = load_base_helper()

    db_path = Path(args.db_path).expanduser().resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    lowered = str(db_path).lower()
    if "prod" in lowered or "production" in lowered:
        raise SystemExit("Refusing to modify a database path that looks like production.")

    identity_a = fixture_identity(batch, "a")
    identity_b = fixture_identity(batch, "b")

    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = db_path.with_name(
            db_path.name + f".before-bite30d-manual-identities-{stamp}.bak"
        )
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
            "collaborator_journeys",
            "authz_actors",
            "authz_roles",
            "authz_actor_role_grants",
            "auth_user_accounts",
            "auth_account_people",
            "auth_account_actors",
        ],
    )

    try:
        conn.execute("BEGIN IMMEDIATE")

        tenant, tenant_created = resolve_or_create_tenant(conn, helper, args.tenant_name)
        require_unused_batch(conn, helper, batch, identity_a, identity_b)

        refs = helper.tenant_refs(conn, tenant["id"])

        fixture_a = create_person_account(
            conn,
            helper,
            batch=batch,
            identity_code="a",
            tenant_id=tenant["id"],
            person_status_id=refs["person_active"],
            identity=identity_a,
        )

        fixture_b = create_person_account(
            conn,
            helper,
            batch=batch,
            identity_code="b",
            tenant_id=tenant["id"],
            person_status_id=refs["person_active"],
            identity=identity_b,
        )
        collaborator_id = helper.seed_collaborator(
            conn,
            tenant["id"],
            refs,
            fixture_b,
            f"bite30d:{batch}:identity-b",
            1,
        )
        fixture_b["collaborator_id"] = collaborator_id

        # Bite 30D's central invariant for these fixtures: self-service comes
        # from Account -> tenant Actor -> ACTIVE Membership (plus an active
        # Collaborator Journey for Identity B), not from delegated Role Grants.
        assert_no_delegated_roles(
            conn,
            actor_id=fixture_a["actor_id"],
            label="Identity A",
        )
        assert_no_delegated_roles(
            conn,
            actor_id=fixture_b["actor_id"],
            label="Identity B",
        )

        assert_identity_a_shape(
            conn,
            tenant_id=tenant["id"],
            fixture=fixture_a,
        )
        assert_identity_b_shape(
            conn,
            tenant_id=tenant["id"],
            fixture=fixture_b,
            collaborator_id=collaborator_id,
        )

        # Explicitly verify both Memberships use the domain ACTIVE status code.
        membership_rows = conn.execute(
            """
            SELECT
                m.id,
                status.code AS status_code
            FROM person_tenant_memberships m
            JOIN reference_data status
              ON status.id = m.status_id
             AND status.tenant_id = m.tenant_id
             AND status.type = 'person_status'
            WHERE m.id IN (?, ?)
            """,
            (fixture_a["membership_id"], fixture_b["membership_id"]),
        ).fetchall()
        if len(membership_rows) != 2 or any(
            row["status_code"] != "ACTIVE" for row in membership_rows
        ):
            raise RuntimeError(
                "Both Bite 30D fixture Memberships must have status code ACTIVE."
            )

        # Verify both Accounts are ACTIVE and both tenant Actor bindings are
        # linked to the expected Memberships.
        for label, fixture in (("Identity A", fixture_a), ("Identity B", fixture_b)):
            account = conn.execute(
                """
                SELECT active, must_change_password, login
                FROM auth_user_accounts
                WHERE id = ?
                """,
                (fixture["account_id"],),
            ).fetchone()
            if (
                account is None
                or not account["active"]
                or account["must_change_password"]
                or account["login"].lower() != fixture["login"].lower()
            ):
                raise RuntimeError(f"{label} Authentication Account state is invalid.")

            binding = conn.execute(
                """
                SELECT scope_type, tenant_id, membership_id
                FROM auth_account_actors
                WHERE account_id = ?
                  AND actor_id = ?
                LIMIT 1
                """,
                (fixture["account_id"], fixture["actor_id"]),
            ).fetchone()
            if (
                binding is None
                or binding["scope_type"] != "TENANT"
                or binding["tenant_id"] != tenant["id"]
                or binding["membership_id"] != fixture["membership_id"]
            ):
                raise RuntimeError(f"{label} Account/Actor/Membership binding is invalid.")

        fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if fk_errors:
            raise RuntimeError(
                "Foreign-key check failed: "
                + "; ".join(str(tuple(row)) for row in fk_errors[:10])
            )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print()
    print("Bite 30D manual-test identities created successfully.")
    print()
    print(f"Tenant: {tenant['name']}")
    print(f"Tenant ID: {tenant['id']}")
    if tenant_created:
        print("Tenant note: created by this local fixture run because it was absent.")
    print(f"Password for both Accounts: {DEFAULT_PASSWORD}")
    print()
    print("Identity A — Person-only Account")
    print(f"  Name:       {fixture_a['first_name']} {fixture_a['last_name']}")
    print(f"  Login:      {fixture_a['login']}")
    print(f"  Person ID:  {fixture_a['global_person_id']}")
    print(f"  Actor ID:   {fixture_a['actor_id']}")
    print(f"  Account ID: {fixture_a['account_id']}")
    print(f"  Membership: {fixture_a['membership_id']}")
    print(f"  Tenant:     {tenant['name']} ({tenant['id']})")
    print("  Account:    ACTIVE")
    print("  Membership: ACTIVE")
    print("  Collaborator Journey: none")
    print("  Delegated Roles: none")
    print()
    print("Identity B — Collaborator Account")
    print(f"  Name:            {fixture_b['first_name']} {fixture_b['last_name']}")
    print(f"  Login:           {fixture_b['login']}")
    print(f"  Person ID:       {fixture_b['global_person_id']}")
    print(f"  Collaborator ID: {fixture_b['collaborator_id']}")
    print(f"  Actor ID:        {fixture_b['actor_id']}")
    print(f"  Account ID:      {fixture_b['account_id']}")
    print(f"  Membership:      {fixture_b['membership_id']}")
    print(f"  Tenant:          {tenant['name']} ({tenant['id']})")
    print("  Account:         ACTIVE")
    print("  Membership:      ACTIVE")
    print("  Collaborator Journey: ACTIVE/current")
    print("  Delegated Roles: none")
    print()
    print("Expected Bite 30D authorization shape:")
    print("  Identity A -> intrinsic Person self-service only")
    print("  Identity B -> intrinsic Person + current Collaborator self-service")
    print("  Neither identity has an active delegated Role Grant.")
    print()
    print("To create a fresh pair later:")
    print(
        "  python3 scripts/seed-bite30d-manual-test-identities.py "
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
