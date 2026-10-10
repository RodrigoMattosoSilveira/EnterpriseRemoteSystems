#!/usr/bin/env python3
"""Regression coverage for Bite 33.4 restore tooling and recovery verification."""
from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def run(cmd: list[str], *, cwd: Path = ROOT, timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False, timeout=timeout)


def ok(proc: subprocess.CompletedProcess[str], context: str) -> None:
    if proc.returncode != 0:
        raise AssertionError(f"{context} failed ({proc.returncode}):\n{proc.stdout}")


def bad(proc: subprocess.CompletedProcess[str], context: str, needle: str) -> None:
    if proc.returncode == 0:
        raise AssertionError(f"{context} unexpectedly succeeded:\n{proc.stdout}")
    if needle not in proc.stdout:
        raise AssertionError(f"{context} did not contain {needle!r}:\n{proc.stdout}")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_tools(directory: Path) -> tuple[Path, Path]:
    bindir = directory / "bin"
    bindir.mkdir()
    for tool in ("ers-backup", "ers-restore"):
        proc = run(["go", "build", "-o", str(bindir / tool), f"./cmd/{tool}"], cwd=BACKEND)
        ok(proc, f"build {tool}")
    return bindir / "ers-backup", bindir / "ers-restore"


def make_db(path: Path, *, extra_tenant: bool = False) -> None:
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE schema_migrations(filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE tenants(id TEXT PRIMARY KEY, name TEXT);
            CREATE TABLE global_people(id TEXT PRIMARY KEY, name TEXT);
            CREATE TABLE person_tenant_memberships(id TEXT PRIMARY KEY, person_id TEXT, tenant_id TEXT);
            CREATE TABLE auth_user_accounts(id TEXT PRIMARY KEY, login TEXT);
            CREATE TABLE authz_actors(id TEXT PRIMARY KEY, actor_key TEXT);
            CREATE TABLE authz_actor_role_grants(id TEXT PRIMARY KEY, actor_id TEXT);
            CREATE TABLE collaborator_journeys(id TEXT PRIMARY KEY, membership_id TEXT);
            CREATE TABLE ledger_entries(id TEXT PRIMARY KEY, tenant_id TEXT);
            CREATE TABLE work_periods(id TEXT PRIMARY KEY, tenant_id TEXT);
            INSERT INTO schema_migrations(filename) VALUES
              ('000076_journey_bonus_ledger_unique_index_repair.up.sql'),
              ('000077_journey_bonus_award_approval.up.sql');
            INSERT INTO tenants VALUES ('tenant-a', 'Tenant A');
            INSERT INTO global_people VALUES ('person-a', 'Person A');
            INSERT INTO person_tenant_memberships VALUES ('membership-a', 'person-a', 'tenant-a');
            INSERT INTO auth_user_accounts VALUES ('account-a', 'person@example.test');
            INSERT INTO authz_actors VALUES ('actor-a', 'actor-a');
            INSERT INTO authz_actor_role_grants VALUES ('grant-a', 'actor-a');
            INSERT INTO collaborator_journeys VALUES ('journey-a', 'membership-a');
            INSERT INTO ledger_entries VALUES ('ledger-a', 'tenant-a');
            INSERT INTO work_periods VALUES ('period-a', 'tenant-a');
            """
        )
        if extra_tenant:
            connection.execute("INSERT INTO tenants VALUES ('tenant-old', 'Old Target State')")
        connection.commit()
    finally:
        connection.close()


def create_manifest(backup_tool: Path, database: Path, environment: str = "development") -> Path:
    manifest = Path(str(database) + ".manifest.json")
    proc = run([
        str(backup_tool), "create-manifest",
        "--backup", str(database),
        "--manifest", str(manifest),
        "--environment", environment,
        "--source-container", "restore-regression",
        "--source-database-path", "/app/data/app.db",
        "--created-at", "2026-10-09T20:00:00Z",
    ])
    ok(proc, "create restore-source manifest")
    return manifest


def test_verify_stage_apply(backup_tool: Path, restore_tool: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="ers-334-restore-") as td:
        root = Path(td)
        source = root / "app-20261009T200000Z.db"
        make_db(source)
        manifest = create_manifest(backup_tool, source)
        source_sha = sha(source)

        proc = run([str(restore_tool), "verify", "--backup", str(source), "--manifest", str(manifest), "--expected-environment", "development"])
        ok(proc, "restore candidate verify")
        bad(run([str(restore_tool), "verify", "--backup", str(source), "--manifest", str(manifest), "--expected-environment", "production"]), "environment mismatch", "backup environment mismatch")

        staging = root / "recovery" / "candidate"
        proc = run([str(restore_tool), "stage", "--backup", str(source), "--manifest", str(manifest), "--expected-environment", "development", "--output-dir", str(staging)])
        ok(proc, "stage local candidate")
        staged = staging / source.name
        staged_manifest = staging / manifest.name
        if sha(staged) != source_sha:
            raise AssertionError("staged database bytes changed")
        ok(run([str(backup_tool), "verify", "--backup", str(staged), "--manifest", str(staged_manifest), "--expected-environment", "development"]), "staged pair verify")
        bad(run([str(restore_tool), "stage", "--backup", str(source), "--manifest", str(manifest), "--expected-environment", "development", "--output-dir", str(staging)]), "stage overwrite refusal", "refusing to overwrite existing recovery artifact")

        target = root / "live" / "app.db"
        target.parent.mkdir()
        make_db(target, extra_tenant=True)
        old_target_sha = sha(target)
        for suffix in ("-wal", "-shm", "-journal"):
            Path(str(target) + suffix).write_bytes(b"stale-sidecar")
        pre = root / "evidence" / "pre-restore.db"
        report = root / "evidence" / "restore.json"

        wrong = run([
            str(restore_tool), "apply", "--backup", str(staged), "--manifest", str(staged_manifest),
            "--target", str(target), "--environment", "development", "--confirm", "RESTORE-PRODUCTION",
            "--pre-restore-copy", str(pre), "--report", str(report),
        ])
        bad(wrong, "wrong confirmation", "restore confirmation mismatch")
        if sha(target) != old_target_sha:
            raise AssertionError("wrong-confirmation attempt modified target")

        proc = run([
            str(restore_tool), "apply", "--backup", str(staged), "--manifest", str(staged_manifest),
            "--target", str(target), "--environment", "development", "--confirm", "RESTORE-DEVELOPMENT",
            "--pre-restore-copy", str(pre), "--report", str(report), "--now", "2026-10-09T21:00:00Z",
        ])
        ok(proc, "apply verified recovery candidate")
        if sha(target) != source_sha:
            raise AssertionError("restored target SHA does not match source backup")
        if sha(pre) != old_target_sha:
            raise AssertionError("pre-restore copy does not preserve previous target")
        for suffix in ("-wal", "-shm", "-journal"):
            preserved = Path(str(pre) + suffix)
            if not preserved.is_file() or preserved.read_bytes() != b"stale-sidecar":
                raise AssertionError(f"pre-restore evidence did not preserve SQLite sidecar: {suffix}")
            if Path(str(target) + suffix).exists():
                raise AssertionError(f"stale SQLite sidecar survived restore: {suffix}")
        payload = json.loads(report.read_text())
        if payload["status"] != "verified" or payload["environment"] != "development":
            raise AssertionError("restore report status/environment invalid")
        if payload["source"]["backup_sha256"] != source_sha or payload["restored_target"]["sha256"] != source_sha:
            raise AssertionError("restore report checksum evidence invalid")
        if not payload["previous_target"]["existed"] or payload["previous_target"]["sha256"] != old_target_sha:
            raise AssertionError("restore report did not preserve previous-target evidence")
        if {item["suffix"] for item in payload["previous_target"].get("sidecars", [])} != {"-wal", "-shm", "-journal"}:
            raise AssertionError("restore report did not preserve SQLite sidecar evidence")
        if payload["restored_target"]["integrity_check"] != "ok" or payload["restored_target"]["foreign_key_check"] != "ok":
            raise AssertionError("restore report lacks SQLite verification evidence")

        second_target = root / "second" / "app.db"
        second_target.parent.mkdir()
        make_db(second_target, extra_tenant=True)
        second_before = sha(second_target)
        corrupt_dir = root / "corrupt-candidate"
        corrupt_dir.mkdir()
        corrupt = corrupt_dir / staged.name
        corrupt_manifest = corrupt_dir / staged_manifest.name
        shutil.copy2(staged, corrupt)
        shutil.copy2(staged_manifest, corrupt_manifest)
        with corrupt.open("ab") as handle:
            handle.write(b"tamper")
        bad(run([
            str(restore_tool), "apply", "--backup", str(corrupt), "--manifest", str(corrupt_manifest),
            "--target", str(second_target), "--environment", "development", "--confirm", "RESTORE-DEVELOPMENT",
            "--pre-restore-copy", str(root / "evidence" / "second-pre.db"),
        ]), "corrupt candidate", "backup size mismatch")
        if sha(second_target) != second_before:
            raise AssertionError("corrupt recovery candidate modified target before verification failed")

        bad(run([
            str(restore_tool), "apply", "--backup", str(staged), "--manifest", str(staged_manifest),
            "--target", str(staged), "--environment", "development", "--confirm", "RESTORE-DEVELOPMENT",
        ]), "source equals target", "restore source and target must be different")


def test_repository_contract() -> None:
    make = (ROOT / "Makefile").read_text()
    docker = (BACKEND / "Dockerfile").read_text()
    runner = (ROOT / "scripts" / "run-backup-go-tool.sh").read_text()
    server_restore = (ROOT / "scripts" / "server-sqlite-restore.sh").read_text()
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
    deploy = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()

    for fragment in (
        "server-restore-prepare-local:", "server-restore-materialize-offhost:",
        "server-restore-verify:", "server-restore-apply:",
        "RESTORE_CONFIRM", "SERVER_RECOVERY_DIR", "OFFHOST_BACKUP_NAME",
        "restore-tooling-recovery-verification-check",
    ):
        if fragment not in make:
            raise AssertionError(f"Makefile missing 33.4 contract fragment {fragment!r}")
    for fragment in ("go build -o /out/ers-restore ./cmd/ers-restore", "COPY --from=builder /out/ers-restore /app/ers-restore"):
        if fragment not in docker:
            raise AssertionError(f"backend image missing {fragment!r}")
    if "ers-backup|ers-offhost-backup|ers-restore" not in runner:
        raise AssertionError("Go tool runner does not support ers-restore")
    for fragment in ("RESTORE-PRODUCTION", "/app/data/app.db", "PRAGMA integrity_check", "PRAGMA foreign_key_check", "recovery/pre-restore"):
        if fragment not in server_restore and fragment not in make:
            raise AssertionError(f"server restore safety contract missing {fragment!r}")
    if "make restore-tooling-recovery-verification-check" not in ci:
        raise AssertionError("CI missing Bite 33.4 regression")
    if "make restore-tooling-recovery-verification-check" not in deploy:
        raise AssertionError("deployment quality gate missing Bite 33.4 regression")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="ers-334-go-tools-") as td:
        backup_tool, restore_tool = build_tools(Path(td))
        test_verify_stage_apply(backup_tool, restore_tool)
    test_repository_contract()
    print("Bite 33.4 restore tooling and recovery verification verified with Go Production tooling.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
