#!/usr/bin/env python3
"""Regression coverage for Bite 33.5 migration/deployment recovery gating."""
from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def run(cmd: list[str], *, cwd: Path = ROOT, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )


def ok(proc: subprocess.CompletedProcess[str], context: str) -> None:
    if proc.returncode != 0:
        raise AssertionError(f"{context} failed ({proc.returncode}):\n{proc.stdout}")


def test_explicit_migration_runner() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-335-migrate-") as td:
        root = Path(td)
        migrations = root / "migrations"
        migrations.mkdir()
        (migrations / "000001_base.up.sql").write_text(
            """
            CREATE TABLE collaborator_journeys(id TEXT PRIMARY KEY);
            CREATE TABLE example_records(id TEXT PRIMARY KEY, value TEXT NOT NULL);
            INSERT INTO example_records(id, value) VALUES ('one', 'before');
            """
        )
        (migrations / "000002_final.up.sql").write_text(
            "UPDATE example_records SET value='after' WHERE id='one';\n"
        )
        db = root / "app.db"
        env = {
            **os.environ,
            "DATABASE_PATH": str(db),
            "MIGRATIONS_DIR": str(migrations),
            "EXPECTED_FINAL_MIGRATION": "000002_final.up.sql",
        }
        proc = run(["sh", str(BACKEND / "apply-sql-migrations.sh")], env=env)
        ok(proc, "explicit migration runner")
        if "SQL migrations applied and verified." not in proc.stdout:
            raise AssertionError(f"migration success evidence missing:\n{proc.stdout}")
        connection = sqlite3.connect(db)
        try:
            migrations_applied = connection.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
            value = connection.execute("SELECT value FROM example_records WHERE id='one'").fetchone()[0]
            planning = connection.execute(
                "SELECT COUNT(*) FROM pragma_table_info('collaborator_journeys') WHERE name='planning_availability'"
            ).fetchone()[0]
        finally:
            connection.close()
        if migrations_applied != 2 or value != "after" or planning != 1:
            raise AssertionError("explicit migration runner did not apply/repair the expected schema")

        # Idempotence is required because deployment verification can re-run the
        # migration command against an already-current database.
        proc = run(["sh", str(BACKEND / "apply-sql-migrations.sh")], env=env)
        ok(proc, "idempotent explicit migration runner")
        if "Skipping already applied migration: 000002_final.up.sql" not in proc.stdout:
            raise AssertionError("migration runner did not recognize already-applied final migration")


def test_failed_migration_is_not_recorded() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-335-fail-") as td:
        root = Path(td)
        migrations = root / "migrations"
        migrations.mkdir()
        (migrations / "000001_base.up.sql").write_text(
            "CREATE TABLE collaborator_journeys(id TEXT PRIMARY KEY, planning_availability TEXT);\n"
        )
        (migrations / "000002_broken.up.sql").write_text("THIS IS NOT VALID SQLITE;\n")
        db = root / "app.db"
        env = {
            **os.environ,
            "DATABASE_PATH": str(db),
            "MIGRATIONS_DIR": str(migrations),
            "EXPECTED_FINAL_MIGRATION": "000002_broken.up.sql",
        }
        proc = run(["sh", str(BACKEND / "apply-sql-migrations.sh")], env=env)
        if proc.returncode == 0:
            raise AssertionError(f"broken migration unexpectedly succeeded:\n{proc.stdout}")
        connection = sqlite3.connect(db)
        try:
            count = connection.execute(
                "SELECT COUNT(*) FROM schema_migrations WHERE filename='000002_broken.up.sql'"
            ).fetchone()[0]
        finally:
            connection.close()
        if count != 0:
            raise AssertionError("failed migration was incorrectly recorded as applied")


def test_repository_contract() -> None:
    make = (ROOT / "Makefile").read_text()
    entrypoint = (BACKEND / "docker-entrypoint.sh").read_text()
    dockerfile = (BACKEND / "Dockerfile").read_text()
    gate = (ROOT / "scripts" / "server-migration-recovery-gate.sh").read_text()
    rollback = (ROOT / "scripts" / "server-migration-recovery-rollback.sh").read_text()
    commit = (ROOT / "scripts" / "server-migration-recovery-commit.sh").read_text()
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
    deploy = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()

    for fragment in (
        'APP_AUTO_MIGRATE=false: refusing implicit schema mutation',
        '/app/verify-migrated-db.sh',
        '/app/apply-sql-migrations.sh',
    ):
        if fragment not in entrypoint:
            raise AssertionError(f"backend entrypoint missing 33.5 contract fragment {fragment!r}")
    for fragment in (
        'COPY apply-sql-migrations.sh /app/apply-sql-migrations.sh',
        '/app/apply-sql-migrations.sh',
    ):
        if fragment not in dockerfile:
            raise AssertionError(f"backend image missing migration-gate fragment {fragment!r}")
    for fragment in (
        "server-migration-recovery-gate:",
        "server-migration-recovery-rollback:",
        "server-migration-recovery-commit:",
        "migration-deployment-recovery-gate-check",
    ):
        if fragment not in make:
            raise AssertionError(f"Makefile missing 33.5 contract fragment {fragment!r}")
    for fragment in (
        "Rehearsing repository migrations against an isolated copy",
        "server-sqlite-backup.sh",
        "ers-offhost-backup replicate",
        "ers-restore stage",
        "compose stop",
        "ers-restore apply",
        "status=armed",
        "previous_revision=",
        "previous_tree_sha=",
        "target_revision=",
        "target_tree_sha=",
    ):
        if fragment not in gate:
            raise AssertionError(f"migration gate missing safety fragment {fragment!r}")
    for fragment in ("compose stop", "ers-restore apply", "application stack remains stopped"):
        if fragment not in rollback:
            raise AssertionError(f"migration rollback missing safety fragment {fragment!r}")
    for fragment in ("healthz", "PRAGMA integrity_check", "PRAGMA foreign_key_check", "verify-migrated-db.sh", "status=committed"):
        if fragment not in commit:
            raise AssertionError(f"migration commit missing verification fragment {fragment!r}")
    if "make migration-deployment-recovery-gate-check" not in ci:
        raise AssertionError("CI missing Bite 33.5 regression")
    if "make migration-deployment-recovery-gate-check" not in deploy:
        raise AssertionError("deployment quality gate missing Bite 33.5 regression")
    for fragment in (
        "make server-migration-recovery-gate ENV=test",
        "make server-migration-recovery-gate ENV='${{ steps.target.outputs.env_name }}'",
        'PREVIOUS_REVISION=\\"\\$(git rev-parse HEAD)\\"',
        'MIGRATION_PREVIOUS_REVISION=\\"\\$PREVIOUS_REVISION\\"',
        "MIGRATION_TARGET_REVISION='${{ steps.revision.outputs.sha }}'",
        "make server-migration-recovery-rollback",
        "make server-migration-recovery-commit",
    ):
        if fragment not in deploy:
            raise AssertionError(f"deployment workflow missing recovery-gate fragment {fragment!r}")

    for script in (
        BACKEND / "apply-sql-migrations.sh",
        ROOT / "scripts" / "server-migration-recovery-gate.sh",
        ROOT / "scripts" / "server-migration-recovery-rollback.sh",
        ROOT / "scripts" / "server-migration-recovery-commit.sh",
    ):
        proc = run(["bash", "-n", str(script)]) if script.suffix == ".sh" else None
        if proc is not None:
            ok(proc, f"shell syntax {script.name}")


def main() -> int:
    if shutil.which("sqlite3") is not None:
        test_explicit_migration_runner()
        test_failed_migration_is_not_recorded()
    else:
        print("sqlite3 CLI unavailable; skipping runtime migration-runner checks (repository contract checks still run).")
    test_repository_contract()
    print("Bite 33.5 migration/deployment recovery gate verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
