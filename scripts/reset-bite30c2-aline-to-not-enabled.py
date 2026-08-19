#!/usr/bin/env python3
"""Return Bite 30C.2 Person 1 (Aline Provisioning) to Authentication: Not enabled.

Target fixture:
    Person: Aline Provisioning
    Email/Login: manual30c2.person1@example.test
    Tenant A: Byte 28A Manual Test
              (historical spelling "Bite 28A Manual Test" is also accepted)

Purpose:
    Re-run Bite 30C.2 manual Test 3:
        Tenant Administrator
            -> Aline Provisioning
            -> Enable Authentication
            -> new Authentication Account
            -> first login with temporary password

IMPORTANT
---------
This is a LOCAL TEST-DATA RESET UTILITY.

ERS intentionally prohibits Authentication Account deletion in normal
application behavior. To restore this disposable fixture to its original
pre-provisioning state, this script:

  1. verifies that Aline is still the expected one-tenant disposable fixture;
  2. backs up backend/data/app.db;
  3. removes only Aline's Account-level sessions, reset tokens, recovery
     requests, Account->Actor binding, and Account->Person binding;
  4. temporarily drops the SQLite Account-deletion prohibition trigger;
  5. deletes only Aline's Authentication Account;
  6. immediately recreates the prohibition trigger;
  7. preserves Aline's global Person, active Tenant-A Membership, and Tenant-A
     authorization Actor; self-service requires no Role Grant after Bite 30D;
  8. runs PRAGMA foreign_key_check before committing.

The preserved, now-unbound Tenant-A Actor will be reused when Authentication is
enabled again through the application.

Stop the backend before running this script.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
DEFAULT_DB = ROOT / "backend" / "data" / "app.db"

TARGET_EMAIL = "manual30c2.person1@example.test"
TARGET_FIRST_NAME = "Aline"
TARGET_LAST_NAME = "Provisioning"
TENANT_A_NAMES = ("Byte 28A Manual Test", "Bite 28A Manual Test")

DELETE_TRIGGER_NAME = "trg_auth_user_accounts_delete_prohibited"
DELETE_TRIGGER_SQL = """
CREATE TRIGGER IF NOT EXISTS trg_auth_user_accounts_delete_prohibited
BEFORE DELETE ON auth_user_accounts
BEGIN
  SELECT RAISE(ABORT, 'authentication_account_deletion_not_allowed');
END;
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Reset Aline Provisioning to the pre-provisioning "
            "'Authentication: Not enabled' state."
        )
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
            "Required Bite 30C.2 schema is missing: " + ", ".join(missing)
        )


def exactly_one(rows: list[sqlite3.Row], description: str) -> sqlite3.Row:
    if len(rows) == 0:
        raise SystemExit(f"{description} was not found.")
    if len(rows) > 1:
        raise SystemExit(
            f"{description} is ambiguous: expected exactly one row, found {len(rows)}."
        )
    return rows[0]


def trigger_exists(conn: sqlite3.Connection) -> bool:
    return (
        conn.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type = 'trigger' AND name = ?
            """,
            (DELETE_TRIGGER_NAME,),
        ).fetchone()
        is not None
    )


def main() -> int:
    args = parse_args()

    db_path = Path(args.db_path).expanduser().resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    lowered_path = str(db_path).lower()
    if "prod" in lowered_path or "production" in lowered_path:
        raise SystemExit(
            "Refusing to modify a database path that looks like production."
        )

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    require_tables(
        conn,
        [
            "tenants",
            "reference_data",
            "global_people",
            "person_tenant_memberships",
            "authz_actors",
            "authz_actor_role_grants",
            "authz_roles",
            "auth_user_accounts",
            "auth_sessions",
            "auth_password_reset_tokens",
            "auth_account_people",
            "auth_account_actors",
            "auth_account_reactivation_requests",
        ],
    )

    if not trigger_exists(conn):
        conn.close()
        raise SystemExit(
            f"Required safety trigger {DELETE_TRIGGER_NAME!r} is missing. "
            "Refusing to proceed."
        )

    person = exactly_one(
        conn.execute(
            """
            SELECT id, first_name, last_name, email
            FROM global_people
            WHERE LOWER(email) = LOWER(?)
            """,
            (TARGET_EMAIL,),
        ).fetchall(),
        f"Global Person {TARGET_EMAIL!r}",
    )

    if (
        person["first_name"].strip().lower() != TARGET_FIRST_NAME.lower()
        or person["last_name"].strip().lower() != TARGET_LAST_NAME.lower()
    ):
        conn.close()
        raise SystemExit(
            "Refusing to continue: the target email exists, but the Person is not "
            f"{TARGET_FIRST_NAME} {TARGET_LAST_NAME}."
        )

    tenant_name_placeholders = ",".join("?" for _ in TENANT_A_NAMES)
    memberships = conn.execute(
        f"""
        SELECT
            m.id AS membership_id,
            m.person_id AS global_person_id,
            m.legacy_person_id,
            m.tenant_id,
            t.name AS tenant_name,
            rd.code AS status_code
        FROM person_tenant_memberships m
        JOIN tenants t
          ON t.id = m.tenant_id
        JOIN reference_data rd
          ON rd.id = m.status_id
         AND rd.tenant_id = m.tenant_id
         AND rd.type = 'person_status'
        WHERE m.person_id = ?
          AND LOWER(t.name) IN ({tenant_name_placeholders})
        """,
        (person["id"], *(name.lower() for name in TENANT_A_NAMES)),
    ).fetchall()

    membership = exactly_one(
        memberships,
        "Aline's Byte/Bite 28A Manual Test Membership",
    )

    if membership["status_code"].strip().upper() != "ACTIVE":
        conn.close()
        raise SystemExit(
            "Refusing to reset the fixture because Aline's Tenant-A Membership "
            f"is not ACTIVE (status={membership['status_code']!r})."
        )

    # Person 1 is intentionally Tenant-A-only. If the fixture has since acquired
    # another Membership, do not perform destructive test-data cleanup.
    all_memberships = conn.execute(
        """
        SELECT m.id, m.tenant_id, t.name AS tenant_name
        FROM person_tenant_memberships m
        JOIN tenants t ON t.id = m.tenant_id
        WHERE m.person_id = ?
        ORDER BY t.name
        """,
        (person["id"],),
    ).fetchall()
    if len(all_memberships) != 1:
        conn.close()
        detail = ", ".join(
            f"{row['tenant_name']} ({row['tenant_id']})" for row in all_memberships
        )
        raise SystemExit(
            "Refusing to reset Aline because Person 1 is no longer Tenant-A-only. "
            f"Memberships found: {detail}"
        )

    account_rows = conn.execute(
        """
        SELECT
            a.id,
            a.actor_id,
            a.login,
            a.active,
            a.must_change_password
        FROM auth_account_people ap
        JOIN auth_user_accounts a
          ON a.id = ap.account_id
        WHERE ap.person_id = ?
        """,
        (person["id"],),
    ).fetchall()

    if len(account_rows) == 0:
        # Already in the desired state.
        conn.close()
        print("Aline Provisioning is already in the desired state.")
        print()
        print("Authentication status should be: Not enabled")
        print(f"Person: {TARGET_FIRST_NAME} {TARGET_LAST_NAME}")
        print(f"Email:  {TARGET_EMAIL}")
        return 0

    account = exactly_one(
        account_rows,
        "Aline's Authentication Account",
    )

    if account["login"].strip().lower() != TARGET_EMAIL.lower():
        conn.close()
        raise SystemExit(
            "Refusing to reset Aline because the Authentication Account login "
            f"is unexpected: {account['login']!r}."
        )

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
        ORDER BY aa.scope_type, aa.tenant_id, aa.actor_id
        """,
        (account["id"],),
    ).fetchall()

    binding = exactly_one(
        bindings,
        "Aline's Authentication Account Actor binding",
    )

    if (
        binding["scope_type"] != "TENANT"
        or binding["tenant_id"] != membership["tenant_id"]
        or binding["membership_id"] != membership["membership_id"]
    ):
        conn.close()
        raise SystemExit(
            "Refusing to reset Aline because the Account Actor binding no longer "
            "matches the disposable Tenant-A Person-1 fixture."
        )

    if account["actor_id"] != binding["actor_id"]:
        conn.close()
        raise SystemExit(
            "Refusing to reset Aline because the legacy Account actor_id does not "
            "match the sole Account Actor binding."
        )

    if not binding["actor_active"]:
        conn.close()
        raise SystemExit(
            "Refusing to reset Aline because the preserved Tenant-A Actor is inactive."
        )

    # Person 1 is an intrinsic self-service fixture. It must not have active
    # delegated Roles; otherwise deleting the Account could destroy a test state
    # that has evolved beyond the disposable provisioning scenario.
    grants = conn.execute(
        """
        SELECT g.id, g.tenant_id, g.active, r.code AS role_code
        FROM authz_actor_role_grants g
        JOIN authz_roles r ON r.id = g.role_id
        WHERE g.actor_id = ? AND g.active = 1
        ORDER BY r.code, g.tenant_id
        """,
        (binding["actor_id"],),
    ).fetchall()
    if grants:
        conn.close()
        detail = ", ".join(f"{row['role_code']}@{row['tenant_id']}" for row in grants)
        raise SystemExit(
            "Refusing to reset Aline because her intrinsic self-service Actor has "
            "delegated role grants: " + detail
        )

    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = db_path.with_name(
            db_path.name + f".before-reset-aline-to-not-enabled-{stamp}.bak"
        )
        # Use SQLite's backup API so WAL/journal state is captured correctly.
        conn.commit()
        backup_conn = sqlite3.connect(backup)
        try:
            conn.backup(backup_conn)
        finally:
            backup_conn.close()
        print(f"Backup: {backup}")

    try:
        conn.execute("BEGIN IMMEDIATE")

        # Remove Account-owned artifacts first. The Person, Membership, Actor, and
        # Actor delegated grants (normally none for Person 1) are intentionally preserved.
        conn.execute(
            "DELETE FROM auth_sessions WHERE account_id = ?",
            (account["id"],),
        )
        conn.execute(
            "DELETE FROM auth_password_reset_tokens WHERE account_id = ?",
            (account["id"],),
        )
        conn.execute(
            "DELETE FROM auth_account_reactivation_requests WHERE account_id = ?",
            (account["id"],),
        )
        conn.execute(
            "DELETE FROM auth_account_actors WHERE account_id = ?",
            (account["id"],),
        )
        conn.execute(
            "DELETE FROM auth_account_people WHERE account_id = ?",
            (account["id"],),
        )

        # Normal ERS behavior prohibits Account deletion. This local fixture reset
        # temporarily removes that one trigger so the disposable Account can be
        # returned to its pre-provisioning state.
        conn.execute(f"DROP TRIGGER {DELETE_TRIGGER_NAME}")

        deleted = conn.execute(
            "DELETE FROM auth_user_accounts WHERE id = ?",
            (account["id"],),
        )
        if deleted.rowcount != 1:
            raise RuntimeError(
                f"Expected to delete exactly one Authentication Account; "
                f"deleted {deleted.rowcount}."
            )

        # Restore the production invariant immediately, in the same transaction.
        conn.execute(DELETE_TRIGGER_SQL)

        if not trigger_exists(conn):
            raise RuntimeError(
                "Authentication Account deletion-prohibition trigger was not restored."
            )

        # Verify that Aline is now exactly in the status shape expected by
        # GetPersonAuthenticationStatus: Membership exists, but no Account binding.
        remaining_account_person = conn.execute(
            """
            SELECT COUNT(*)
            FROM auth_account_people
            WHERE person_id = ?
            """,
            (person["id"],),
        ).fetchone()[0]
        if remaining_account_person != 0:
            raise RuntimeError(
                "Aline still has an Authentication Account -> Person binding."
            )

        remaining_login = conn.execute(
            """
            SELECT COUNT(*)
            FROM auth_user_accounts
            WHERE login = ? COLLATE NOCASE
            """,
            (TARGET_EMAIL,),
        ).fetchone()[0]
        if remaining_login != 0:
            raise RuntimeError(
                "Aline's Authentication Account login still exists after reset."
            )

        actor = conn.execute(
            """
            SELECT id, active
            FROM authz_actors
            WHERE id = ?
            """,
            (binding["actor_id"],),
        ).fetchone()
        if actor is None or not actor["active"]:
            raise RuntimeError(
                "Aline's Tenant-A Actor was not preserved as an active unbound Actor."
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
        # Explicit transaction rollback should restore the dropped trigger, but
        # verify/recover defensively before reporting the failure.
        if not trigger_exists(conn):
            try:
                conn.execute(DELETE_TRIGGER_SQL)
                conn.commit()
            except sqlite3.Error as restore_exc:
                print(
                    "CRITICAL: failed to restore Authentication Account deletion "
                    f"trigger: {restore_exc}",
                    file=sys.stderr,
                )
        raise
    finally:
        conn.close()

    print()
    print("Aline Provisioning reset to pre-provisioning state successfully.")
    print()
    print(f"Person: {TARGET_FIRST_NAME} {TARGET_LAST_NAME}")
    print(f"Email:  {TARGET_EMAIL}")
    print(f"Tenant: {membership['tenant_name']}")
    print()
    print("Preserved:")
    print("  global Person")
    print("  active Tenant-A Membership")
    print("  active Tenant-A authorization Actor")
    print("  intrinsic self-service identity (no Role Grant required)")
    print()
    print("Removed:")
    print("  Authentication Account")
    print("  Account -> Person binding")
    print("  Account -> Actor binding")
    print("  Account sessions")
    print("  password-reset tokens")
    print("  Account reactivation requests")
    print()
    print("Expected Person-page status now:")
    print("  Authentication: Not enabled")
    print()
    print("You can now rerun Bite 30C.2 Test 3:")
    print("  1. Sign in as Tenant A Administrator.")
    print("  2. Open Aline Provisioning.")
    print("  3. Click Enable Authentication.")
    print("  4. Use the temporary password in both password fields:")
    print("       Manual-30C-Password!")
    print("  5. Sign out.")
    print("  6. Sign in as:")
    print(f"       {TARGET_EMAIL}")
    print("       Manual-30C-Password!")
    print("  7. Expect the required first-login password-change flow.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sqlite3.Error as exc:
        print(f"SQLite error: {exc}", file=sys.stderr)
        raise SystemExit(1)
    except Exception as exc:
        print(f"Reset failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
