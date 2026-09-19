#!/usr/bin/env python3
"""Regression test for the Bite 31.4 Brazilian demo fixture."""
from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "backend" / "migrations"
SEEDER = ROOT / "scripts" / "seed-brazilian-demo.py"
TENANT_ID = "demo-br-serra-dourada"


def apply_migrations(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    try:
        for migration in sorted(MIGRATIONS.glob("*.up.sql")):
            conn.executescript(migration.read_text())
        conn.commit()
    finally:
        conn.close()


def run(*args: str, expect_success: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        [sys.executable, str(SEEDER), *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
        env={**os.environ, "APP_ENV": "development"},
    )
    if expect_success and proc.returncode != 0:
        raise AssertionError(proc.stdout)
    if not expect_success and proc.returncode == 0:
        raise AssertionError("Seeder unexpectedly succeeded:\n" + proc.stdout)
    return proc


def scalar(conn: sqlite3.Connection, sql: str, params: tuple = ()):
    row = conn.execute(sql, params).fetchone()
    if row is None:
        raise AssertionError(f"No row for {sql} {params}")
    return row[0]


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="ers-bite31-4-") as tmp:
        db_path = Path(tmp) / "demo.db"
        apply_migrations(db_path)
        output = run("--db-path", str(db_path), "--as-of", "2026-09-18").stdout
        assert "Synthetic data only" in output
        run("--db-path", str(db_path), "--as-of", "2026-09-18", "--verify-only")

        conn = sqlite3.connect(db_path)
        try:
            assert scalar(conn, "SELECT COUNT(*) FROM tenants WHERE id=?", (TENANT_ID,)) == 1
            assert scalar(conn, "SELECT COUNT(*) FROM global_people WHERE id LIKE 'demo-br-person-%'") == 5
            assert scalar(conn, "SELECT COUNT(*) FROM person_tenant_memberships WHERE tenant_id=?", (TENANT_ID,)) == 5
            assert scalar(conn, "SELECT COUNT(*) FROM collaborator_journeys WHERE tenant_id=?", (TENANT_ID,)) == 4
            assert scalar(conn, "SELECT COUNT(*) FROM collaborator_journeys WHERE tenant_id=? AND closed_at IS NOT NULL", (TENANT_ID,)) == 1
            assert scalar(conn, "SELECT COUNT(*) FROM work_periods WHERE tenant_id=?", (TENANT_ID,)) == 2
            assert scalar(conn, "SELECT COUNT(*) FROM work_period_assignments WHERE tenant_id=?", (TENANT_ID,)) == 6
            assert scalar(conn, "SELECT COUNT(*) FROM gold_production_entries WHERE tenant_id=? AND gold_grams_produced=80", (TENANT_ID,)) == 1
            assert scalar(conn, "SELECT COUNT(*) FROM accrual_runs WHERE tenant_id=? AND status='POSTED'", (TENANT_ID,)) == 1
            assert scalar(conn, "SELECT COUNT(*) FROM accrual_items WHERE tenant_id=? AND status='POSTED'", (TENANT_ID,)) == 3
            assert scalar(conn, "SELECT COUNT(*) FROM expenses WHERE tenant_id=?", (TENANT_ID,)) == 2
            assert scalar(conn, "SELECT COUNT(*) FROM ledger_receipts WHERE tenant_id=? AND status='PENDING_ISSUE'", (TENANT_ID,)) == 1
            assert scalar(conn, "SELECT COUNT(*) FROM ledger_receipts WHERE tenant_id=? AND status='RETURNED'", (TENANT_ID,)) == 1
            assert scalar(conn, "SELECT COUNT(*) FROM auth_user_accounts WHERE login='demo.tenant-admin@example.test' AND active=1") == 1
            assert scalar(conn, "SELECT COUNT(*) FROM authz_actor_role_grants g JOIN authz_roles r ON r.id=g.role_id WHERE g.tenant_id=? AND g.active=1 AND r.code='TENANT_ADMIN'", (TENANT_ID,)) == 1

            # The fixture is isolated: no demo business row may be attached to default Tenant.
            for table in ("person_tenant_memberships", "collaborator_journeys", "work_periods", "expenses", "ledger_entries", "ledger_receipts"):
                assert scalar(conn, f"SELECT COUNT(*) FROM {table} WHERE tenant_id='default' AND id LIKE 'demo-br-%'") == 0

            # Story balances: pending debit, gold commission, and a returned-receipt zero balance.
            def balance(person_key: str, unit: str) -> float:
                return float(scalar(conn, """
                    SELECT COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN le.amount ELSE -le.amount END),0)
                    FROM ledger_entries le JOIN reference_data r ON r.id=le.value_unit_id
                    WHERE le.tenant_id=? AND le.person_id=? AND le.active=1 AND r.code=?
                """, (TENANT_ID, f"demo-br-person-{person_key}", unit)))

            assert balance("joao", "BRL") == 230.0
            assert balance("camila", "GOLD_GRAM") == 4.0
            assert balance("rafael", "BRL") == 0.0
        finally:
            conn.close()

        rerun = run("--db-path", str(db_path), "--as-of", "2026-09-18", expect_success=False)
        assert "brazilian-demo-local-reset" in rerun.stdout

        prod = subprocess.run(
            [sys.executable, str(SEEDER), "--db-path", str(db_path), "--verify-only"],
            cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False,
            env={**os.environ, "APP_ENV": "production"},
        )
        assert prod.returncode != 0
        assert "Refusing to seed" in prod.stdout

    print("Bite 31.4 Brazilian demo fixture verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
