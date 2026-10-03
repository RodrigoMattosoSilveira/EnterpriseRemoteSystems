#!/usr/bin/env python3
"""Regression coverage for Bite 33.2 backup creation, retention, and verification."""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "scripts" / "ers-backup.py"
SERVER_BACKUP = ROOT / "scripts" / "server-sqlite-backup.sh"

_BACKUP_SPEC = importlib.util.spec_from_file_location("ers_backup", TOOL)
if _BACKUP_SPEC is None or _BACKUP_SPEC.loader is None:
    raise RuntimeError(f"cannot load {TOOL}")
BACKUP = importlib.util.module_from_spec(_BACKUP_SPEC)
sys.modules["ers_backup"] = BACKUP
_BACKUP_SPEC.loader.exec_module(BACKUP)


def run(cmd: list[str], *, env: dict[str, str] | None = None, cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
        timeout=20,
    )


def require_success(proc: subprocess.CompletedProcess[str], context: str) -> None:
    if proc.returncode != 0:
        raise AssertionError(f"{context} failed ({proc.returncode}):\n{proc.stdout}")


def require_failure(proc: subprocess.CompletedProcess[str], context: str, needle: str) -> None:
    if proc.returncode == 0:
        raise AssertionError(f"{context} unexpectedly succeeded:\n{proc.stdout}")
    if needle not in proc.stdout:
        raise AssertionError(f"{context} did not contain {needle!r}:\n{proc.stdout}")


def create_representative_db(path: Path) -> None:
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
        connection.commit()
    finally:
        connection.close()


def create_manifest(backup: Path, *, created_at: str, environment: str = "production") -> Path:
    manifest = Path(str(backup) + ".manifest.json")
    payload = BACKUP.build_manifest(
        backup=backup.resolve(),
        environment=environment,
        source_container="ers-prd-backend",
        source_database_path="/app/data/custom.db",
        created_at=BACKUP.parse_utc(created_at),
    )
    BACKUP.write_json_atomic(manifest.resolve(), payload)
    BACKUP.verify_pair(
        backup.resolve(),
        manifest.resolve(),
        expected_environment=environment,
        expected_source_database_path="/app/data/custom.db",
    )
    return manifest


def test_manifest_and_independent_verification() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-2-manifest-") as tmp:
        root = Path(tmp)
        backup = root / "app-20261003T120000Z.db"
        create_representative_db(backup)
        manifest = create_manifest(backup, created_at="2026-10-03T12:00:00Z")

        payload = json.loads(manifest.read_text(encoding="utf-8"))
        if payload["environment"] != "production":
            raise AssertionError("manifest did not preserve environment identity")
        if payload["source"]["database_path"] != "/app/data/custom.db":
            raise AssertionError("manifest did not preserve the configured source database path")
        if payload["verification"]["integrity_check"] != "ok":
            raise AssertionError("manifest lacks successful integrity evidence")
        if payload["verification"]["foreign_key_check"] != "ok":
            raise AssertionError("manifest lacks successful foreign-key evidence")
        if payload["verification"]["latest_schema_migration"] != "000077_journey_bonus_award_approval.up.sql":
            raise AssertionError("manifest did not record the latest migration")
        if payload["verification"]["record_counts"]["tenants"] != 1:
            raise AssertionError("manifest did not record core ERS row counts")

        BACKUP.verify_pair(
            backup.resolve(),
            manifest.resolve(),
            expected_environment="production",
            expected_source_database_path="/app/data/custom.db",
        )

        try:
            BACKUP.verify_pair(backup.resolve(), manifest.resolve(), expected_environment="test")
        except BACKUP.BackupError as exc:
            if "backup environment mismatch" not in str(exc):
                raise
        else:
            raise AssertionError("wrong expected environment unexpectedly verified")

        with backup.open("ab") as handle:
            handle.write(b"tamper")
        try:
            BACKUP.verify_pair(backup.resolve(), manifest.resolve())
        except BACKUP.BackupError as exc:
            if "backup size mismatch" not in str(exc):
                raise
        else:
            raise AssertionError("tampered backup unexpectedly verified")


def test_retention_policy_keeps_minimum_and_recent_backups() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-2-retention-") as tmp:
        root = Path(tmp)
        seed = root / "seed.db"
        create_representative_db(seed)
        now = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)
        ages = (60, 50, 20, 5, 1)
        backups: list[Path] = []
        for age in ages:
            backup = root / f"app-age-{age:02d}.db"
            shutil.copy2(seed, backup)
            created = (now - timedelta(days=age)).isoformat().replace("+00:00", "Z")
            create_manifest(backup, created_at=created)
            backups.append(backup)
        seed.unlink()

        BACKUP.prune(root.resolve(), 2, 30, now=BACKUP.parse_utc("2026-10-03T12:00:00Z"))

        existing = {path.name for path in root.glob("app-*.db")}
        expected = {"app-age-20.db", "app-age-05.db", "app-age-01.db"}
        if existing != expected:
            raise AssertionError(f"retention kept {sorted(existing)}, expected {sorted(expected)}")
        for name in expected:
            if not (root / f"{name}.manifest.json").is_file():
                raise AssertionError(f"retention separated backup from manifest: {name}")


def test_retention_fails_closed_before_deletion_on_corruption() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-2-retention-corrupt-") as tmp:
        root = Path(tmp)
        seed = root / "seed.db"
        create_representative_db(seed)
        for idx, age in enumerate((60, 50, 1), start=1):
            backup = root / f"app-{idx}.db"
            shutil.copy2(seed, backup)
            created = (datetime(2026, 10, 3, tzinfo=timezone.utc) - timedelta(days=age)).isoformat().replace("+00:00", "Z")
            create_manifest(backup, created_at=created)
        seed.unlink()
        corrupt = root / "app-1.db"
        with corrupt.open("ab") as handle:
            handle.write(b"corrupt")

        before = sorted(path.name for path in root.iterdir())
        try:
            BACKUP.prune(root.resolve(), 1, 30, now=BACKUP.parse_utc("2026-10-03T12:00:00Z"))
        except BACKUP.BackupError as exc:
            if "backup size mismatch" not in str(exc):
                raise
        else:
            raise AssertionError("retention unexpectedly accepted a corrupted managed backup")
        after = sorted(path.name for path in root.iterdir())
        if before != after:
            raise AssertionError("retention deleted files before detecting a corrupted managed backup")


def write_fake_docker(path: Path) -> None:
    path.write_text(
        r'''#!/usr/bin/env python3
import os, shutil, sqlite3, sys
from pathlib import Path

args=sys.argv[1:]
log=Path(os.environ["FAKE_DOCKER_LOG"])
with log.open("a", encoding="utf-8") as h:
    h.write(" ".join(args)+"\n")
source=Path(os.environ["FAKE_DOCKER_SOURCE_DB"])
tmp_root=Path(os.environ["FAKE_DOCKER_TMP"])
tmp_root.mkdir(parents=True, exist_ok=True)

def mapped(p):
    if p == "/app/data/custom.db":
        return source
    if p.startswith("/tmp/"):
        return tmp_root / Path(p).name
    return Path(p)

if not args:
    sys.exit(2)
if args[0] == "exec":
    container=args[1]
    cmd=args[2:]
    if cmd[:2] == ["sh", "-c"]:
        print("/app/data/custom.db", end="")
        sys.exit(0)
    if cmd and cmd[0] == "rm":
        for item in cmd[2:]:
            try: mapped(item).unlink()
            except FileNotFoundError: pass
        sys.exit(0)
    if cmd and cmd[0] == "sqlite3":
        db=mapped(cmd[1]); sql=cmd[2]
        if sql.startswith(".backup '"):
            dest=sql[len(".backup '"):-1]
            src=sqlite3.connect(str(db)); out=sqlite3.connect(str(mapped(dest)))
            with out: src.backup(out)
            src.close(); out.close(); sys.exit(0)
        if sql == "PRAGMA integrity_check;":
            if os.environ.get("FAKE_DOCKER_INTEGRITY"):
                print(os.environ["FAKE_DOCKER_INTEGRITY"]); sys.exit(0)
            con=sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            print(con.execute("PRAGMA integrity_check").fetchone()[0]); con.close(); sys.exit(0)
        if sql == "PRAGMA foreign_key_check;":
            con=sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            rows=list(con.execute("PRAGMA foreign_key_check")); con.close()
            for row in rows: print("|".join(str(v) for v in row))
            sys.exit(0)
if args[0] == "cp":
    src=args[1].split(":",1)[1]; dest=Path(args[2])
    shutil.copy2(mapped(src), dest); sys.exit(0)
print("unsupported fake docker command", args, file=sys.stderr)
sys.exit(2)
''',
        encoding="utf-8",
    )
    path.chmod(0o755)


def test_server_backup_uses_sqlite_online_backup_and_configured_db_path() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-2-server-") as tmp:
        root = Path(tmp)
        source = root / "source.db"
        create_representative_db(source)
        fakebin = root / "bin"
        fakebin.mkdir()
        fake_docker = fakebin / "docker"
        write_fake_docker(fake_docker)
        backup_dir = root / "backups"
        log = root / "docker.log"
        env = {
            **os.environ,
            "PATH": f"{fakebin}:{os.environ.get('PATH','')}",
            "FAKE_DOCKER_LOG": str(log),
            "FAKE_DOCKER_SOURCE_DB": str(source),
            "FAKE_DOCKER_TMP": str(root / "container-tmp"),
            "BACKUP_ENVIRONMENT": "production",
            "BACKUP_CONTAINER": "ers-prd-backend",
            "BACKUP_DIRECTORY": str(backup_dir),
            "BACKUP_RETENTION_COUNT": "14",
            "BACKUP_RETENTION_DAYS": "30",
        }
        proc = run([str(SERVER_BACKUP)], env=env)
        require_success(proc, "server SQLite backup")

        backups = list(backup_dir.glob("app-*.db"))
        if len(backups) != 1:
            raise AssertionError(f"server backup created {len(backups)} database files, expected 1")
        backup = backups[0]
        manifest = Path(str(backup) + ".manifest.json")
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        if payload["source"]["database_path"] != "/app/data/custom.db":
            raise AssertionError("server backup assumed /app/data/app.db instead of reading DATABASE_PATH")
        docker_log = log.read_text(encoding="utf-8")
        if ".backup '/tmp/ers-backup-" not in docker_log:
            raise AssertionError("server backup did not use SQLite .backup for a consistent live snapshot")

        BACKUP.verify_pair(
            backup.resolve(),
            manifest.resolve(),
            expected_environment="production",
            expected_source_database_path="/app/data/custom.db",
        )

        failed_dir = root / "failed-backups"
        bad_env = {**env, "BACKUP_DIRECTORY": str(failed_dir), "FAKE_DOCKER_INTEGRITY": "database disk image is malformed"}
        failed = run([str(SERVER_BACKUP)], env=bad_env)
        require_failure(failed, "failed in-container backup verification", "integrity_check failed")
        if list(failed_dir.glob("app-*.db")) or list(failed_dir.glob("*.manifest.json")):
            raise AssertionError("failed backup verification left an accepted backup artifact behind")


def test_repository_integration_contract() -> None:
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
    deploy = (ROOT / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
    legacy = (ROOT / "scripts" / "prod-backup-sqlite.sh").read_text(encoding="utf-8")
    server = SERVER_BACKUP.read_text(encoding="utf-8")

    required = (
        "SERVER_BACKUP_RETENTION_COUNT ?= 14",
        "SERVER_BACKUP_RETENTION_DAYS ?= 30",
        'BACKUP_ENVIRONMENT="$(ENV)"',
        'BACKUP_CONTAINER="$$container"',
        './scripts/server-sqlite-backup.sh',
        ".PHONY: server-backup-verify",
        ".PHONY: server-backup-retention",
        "python3 scripts/test-backup-creation-retention-verification.py",
    )
    for fragment in required:
        if fragment not in makefile:
            raise AssertionError(f"Makefile is missing Bite 33.2 contract fragment {fragment!r}")
    if "make server-backup ENV='${{ steps.target.outputs.env_name }}'" not in deploy:
        raise AssertionError("preserved-database deployment no longer requires a pre-migration backup")
    if ".backup '$container_tmp'" not in server:
        raise AssertionError("server backup must use SQLite online .backup")
    if "DATABASE_PATH" not in server or "/app/data/app.db" in server:
        raise AssertionError("server backup must discover the running container's configured DATABASE_PATH")
    if "exec \"$ROOT_DIR/scripts/server-sqlite-backup.sh\"" not in legacy:
        raise AssertionError("legacy Production backup entry point bypasses the Bite 33.2 implementation")


def main() -> int:
    test_manifest_and_independent_verification()
    test_retention_policy_keeps_minimum_and_recent_backups()
    test_retention_fails_closed_before_deletion_on_corruption()
    test_server_backup_uses_sqlite_online_backup_and_configured_db_path()
    test_repository_integration_contract()
    print("Bite 33.2 backup creation, retention, and verification verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
