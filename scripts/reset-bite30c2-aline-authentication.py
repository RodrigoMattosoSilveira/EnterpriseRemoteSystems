#!/usr/bin/env python3
"""Reset the Bite 30C.2 Aline Provisioning Authentication Account for local testing.

Target Person:
    Aline Provisioning
    manual30c2.person1@example.test

This utility DOES NOT delete the Authentication Account, Actor, Person, or
Person-Tenant Membership. ERS intentionally prohibits Authentication Account
deletion.

Instead it restores the existing Account to a known first-login state:

    login                = manual30c2.person1@example.test
    password             = Manual-30C-Password!
    active               = true
    must_change_password = true
    last_login_at        = NULL

It also revokes existing sessions and invalidates unused password-reset tokens.

LOCAL DEVELOPMENT ONLY.
Stop the backend before running this script because it writes directly to
backend/data/app.db.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
DEFAULT_DB = ROOT / "backend" / "data" / "app.db"

TARGET_LOGIN = "manual30c2.person1@example.test"
TARGET_FIRST_NAME = "Aline"
TARGET_LAST_NAME = "Provisioning"
TENANT_A_NAMES = ("Byte 28A Manual Test", "Bite 28A Manual Test")

DEFAULT_PASSWORD = "Manual-30C-Password!"
# bcrypt cost-10 hash for DEFAULT_PASSWORD, shared with the Bite 30C/30C.2
# local manual-test seeders.
DEFAULT_PASSWORD_HASH = (
    "$2a$10$2aGDP1WNWYv3Q2aC4URnv.t40kw1HHjYOHUfvmctSf8Pb7D6Vo0t2"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reset Aline Provisioning's Bite 30C.2 Authentication Account."
    )
    parser.add_argument(
        "--db-path",
        default=os.getenv("DATABASE_PATH") or str(DEFAULT_DB),
        help=f"SQLite database path (default: {DEFAULT_DB})",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not create a timestamped backup before changing the database.",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def require_tables(conn: sqlite3.Connection, names: list[str]) -> None:
    existing = {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    missing = [name for name in names if name not in existing]
    if missing:
        raise SystemExit(
            "Required authentication schema is missing: " + ", ".join(missing)
        )


def one(rows: list[sqlite3.Row], description: str) -> sqlite3.Row:
    if len(rows) == 0:
        raise SystemExit(f"{description} was not found.")
    if len(rows) > 1:
        raise SystemExit(
            f"{description} is ambiguous: expected exactly one row, found {len(rows)}."
        )
    return rows[0]


def main() -> int:
    args = parse_args()

    db_path = Path(args.db_path).expanduser().resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    lowered_path = str(db_path).lower()
    if "prod" in lowered_path or "production" in lowered_path:
        raise SystemExit("Refusing to modify a database path that looks like production.")

    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = db_path.with_name(
            db_path.name + f".before-reset-aline-30c2-{stamp}.bak"
        )
        shutil.copy2(db_path, backup)
        print(f"Backup: {backup}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    require_tables(
        conn,
        [
            "tenants",
            "global_people",
            "people",
            "person_tenant_memberships",
            "auth_user_accounts",
            "auth_account_people",
            "auth_account_actors",
            "authz_actors",
            "auth_sessions",
            "auth_password_reset_tokens",
            "auth_account_reactivation_requests",
        ],
    )

    # Find the exact global Person by the deterministic fixture email and also
    # verify that the fixture still represents Aline Provisioning.
    person = one(
        conn.execute(
            """
            SELECT id, first_name, last_name, email
            FROM global_people
            WHERE LOWER(email) = LOWER(?)
            """,
            (TARGET_LOGIN,),
        ).fetchall(),
        f"Global Person {TARGET_LOGIN!r}",
    )

    if (
        person["first_name"].strip().lower() != TARGET_FIRST_NAME.lower()
        or person["last_name"].strip().lower() != TARGET_LAST_NAME.lower()
    ):
        raise SystemExit(
            "Refusing to continue: the target email exists, but it is not "
            f"{TARGET_FIRST_NAME} {TARGET_LAST_NAME}."
        )

    # Verify Aline still has the intended active Tenant-A membership.
    tenant_placeholders = ",".join("?" for _ in TENANT_A_NAMES)
    memberships = conn.execute(
        f"""
        SELECT
            m.id AS membership_id,
            m.tenant_id,
            m.legacy_person_id,
            t.name AS tenant_name,
            r.code AS status_code
        FROM person_tenant_memberships m
        JOIN tenants t
          ON t.id = m.tenant_id
        JOIN reference_data r
          ON r.id = m.status_id
         AND r.tenant_id = m.tenant_id
         AND r.type = 'person_status'
        WHERE m.person_id = ?
          AND LOWER(t.name) IN ({tenant_placeholders})
        """,
        (person["id"], *(name.lower() for name in TENANT_A_NAMES)),
    ).fetchall()
    membership = one(
        memberships,
        "Aline's Byte/Bite 28A Manual Test membership",
    )

    if membership["status_code"].strip().upper() != "ACTIVE":
        raise SystemExit(
            "Refusing to reset credentials because Aline's Tenant-A membership "
            f"is not ACTIVE (status={membership['status_code']!r})."
        )

    # Resolve the one global Account bound to Aline.
    accounts = conn.execute(
        """
        SELECT
            a.id,
            a.actor_id,
            a.login,
            a.active,
            a.must_change_password,
            a.last_login_at
        FROM auth_account_people ap
        JOIN auth_user_accounts a
          ON a.id = ap.account_id
        WHERE ap.person_id = ?
        """,
        (person["id"],),
    ).fetchall()
    account = one(
        accounts,
        "Aline's Authentication Account",
    )

    # Verify the Account really owns a tenant Actor for this membership. This
    # prevents accidentally resetting an unrelated/corrupt Account.
    bindings = conn.execute(
        """
        SELECT
            aa.account_id,
            aa.actor_id,
            aa.scope_type,
            aa.tenant_id,
            aa.membership_id,
            aa.is_primary,
            az.actor_key,
            az.display_name,
            az.active AS actor_active
        FROM auth_account_actors aa
        JOIN authz_actors az
          ON az.id = aa.actor_id
        WHERE aa.account_id = ?
          AND aa.scope_type = 'TENANT'
          AND aa.tenant_id = ?
          AND aa.membership_id = ?
        """,
        (
            account["id"],
            membership["tenant_id"],
            membership["membership_id"],
        ),
    ).fetchall()
    binding = one(
        bindings,
        "Aline's Tenant-A Authentication Actor binding",
    )

    if not binding["actor_active"]:
        raise SystemExit(
            "Refusing to reset credentials because Aline's Tenant-A Actor is inactive."
        )

    pending_count = conn.execute(
        """
        SELECT COUNT(*)
        FROM auth_account_reactivation_requests
        WHERE account_id = ?
          AND status = 'PENDING'
        """,
        (account["id"],),
    ).fetchone()[0]
    if pending_count:
        raise SystemExit(
            "Aline has a pending Account Reactivation Request. "
            "Refusing to alter that recovery test state. Resolve/reject the request "
            "first, then rerun this reset."
        )

    now = utc_now()

    try:
        conn.execute("BEGIN IMMEDIATE")

        # Ensure the canonical test login is available before changing it.
        conflict = conn.execute(
            """
            SELECT id
            FROM auth_user_accounts
            WHERE login = ? COLLATE NOCASE
              AND id <> ?
            LIMIT 1
            """,
            (TARGET_LOGIN, account["id"]),
        ).fetchone()
        if conflict is not None:
            raise RuntimeError(
                f"Cannot restore login {TARGET_LOGIN!r}; another Account already owns it."
            )

        conn.execute(
            """
            UPDATE auth_user_accounts
            SET login = ?,
                password_hash = ?,
                active = 1,
                must_change_password = 1,
                last_login_at = NULL,
                password_changed_at = NULL,
                updated_at = ?
            WHERE id = ?
            """,
            (
                TARGET_LOGIN,
                DEFAULT_PASSWORD_HASH,
                now,
                account["id"],
            ),
        )

        # Existing sessions must not survive a local credential reset.
        conn.execute(
            """
            UPDATE auth_sessions
            SET revoked_at = COALESCE(revoked_at, ?),
                updated_at = ?
            WHERE account_id = ?
              AND revoked_at IS NULL
            """,
            (now, now, account["id"]),
        )

        # Prevent previously issued reset links from being usable afterward.
        conn.execute(
            """
            UPDATE auth_password_reset_tokens
            SET used_at = COALESCE(used_at, ?)
            WHERE account_id = ?
              AND used_at IS NULL
            """,
            (now, account["id"]),
        )

        fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if fk_errors:
            raise RuntimeError(
                "Foreign-key check failed after reset: "
                + "; ".join(str(tuple(row)) for row in fk_errors[:10])
            )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print()
    print("Aline Provisioning Authentication Account reset successfully.")
    print()
    print(f"Person:   {TARGET_FIRST_NAME} {TARGET_LAST_NAME}")
    print(f"Login:    {TARGET_LOGIN}")
    print(f"Password: {DEFAULT_PASSWORD}")
    print()
    print("Account state:")
    print("  active               = true")
    print("  must_change_password = true")
    print("  existing sessions    = revoked")
    print("  unused reset tokens  = invalidated")
    print()
    print("Expected next login flow:")
    print("  temporary password accepted")
    print("      -> password-change page")
    print("      -> choose permanent password")
    print("      -> continue with the Tenant-A Person Actor")
    print()
    print("Important:")
    print("  This resets credentials only.")
    print("  It does NOT return Aline to 'Authentication: Not enabled'.")
    print("  To rerun the Enable Authentication step itself, create a fresh fixture")
    print("  batch with:")
    print("    python3 scripts/seed-bite30c2-manual-test-people.py --batch retry1")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sqlite3.Error as exc:
        print(f"SQLite error: {exc}", file=sys.stderr)
        raise SystemExit(1)
