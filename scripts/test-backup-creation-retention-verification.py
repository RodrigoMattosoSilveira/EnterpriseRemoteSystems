#!/usr/bin/env python3
"""Regression coverage for Bite 33.2 after the Production backup Go cutover."""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
SERVER_BACKUP = ROOT / "scripts" / "server-sqlite-backup.sh"


def run(cmd: list[str], *, env: dict[str, str] | None = None, cwd: Path = ROOT, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False, timeout=timeout)


def require_success(proc: subprocess.CompletedProcess[str], context: str) -> None:
    if proc.returncode != 0:
        raise AssertionError(f"{context} failed ({proc.returncode}):\n{proc.stdout}")


def require_failure(proc: subprocess.CompletedProcess[str], context: str, needle: str) -> None:
    if proc.returncode == 0:
        raise AssertionError(f"{context} unexpectedly succeeded:\n{proc.stdout}")
    if needle not in proc.stdout:
        raise AssertionError(f"{context} did not contain {needle!r}:\n{proc.stdout}")


def build_tools(directory: Path) -> Path:
    bindir = directory / "bin"
    bindir.mkdir()
    for tool in ("ers-backup", "ers-offhost-backup"):
        proc = run(["go", "build", "-o", str(bindir / tool), f"./cmd/{tool}"], cwd=BACKEND, timeout=180)
        require_success(proc, f"build {tool}")
    return bindir


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


def create_manifest(tool: Path, backup: Path, *, created_at: str, environment: str = "production") -> Path:
    manifest = Path(str(backup) + ".manifest.json")
    proc = run([
        str(tool), "create-manifest",
        "--backup", str(backup),
        "--manifest", str(manifest),
        "--environment", environment,
        "--source-container", "ers-prd-backend",
        "--source-database-path", "/app/data/custom.db",
        "--created-at", created_at,
    ])
    require_success(proc, "create manifest")
    return manifest


def test_manifest_and_independent_verification(tool: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-2-manifest-") as tmp:
        root = Path(tmp)
        backup = root / "app-20261003T120000Z.db"
        create_representative_db(backup)
        manifest = create_manifest(tool, backup, created_at="2026-10-03T12:00:00Z")
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        if payload["environment"] != "production":
            raise AssertionError("manifest did not preserve environment identity")
        if payload["source"]["database_path"] != "/app/data/custom.db":
            raise AssertionError("manifest did not preserve configured source database path")
        if payload["verification"]["integrity_check"] != "ok" or payload["verification"]["foreign_key_check"] != "ok":
            raise AssertionError("manifest lacks SQLite verification evidence")
        if payload["verification"]["latest_schema_migration"] != "000077_journey_bonus_award_approval.up.sql":
            raise AssertionError("manifest did not record latest migration")
        if payload["verification"]["record_counts"]["tenants"] != 1:
            raise AssertionError("manifest did not record core ERS row counts")

        good = run([str(tool), "verify", "--backup", str(backup), "--manifest", str(manifest), "--expected-environment", "production", "--expected-source-database-path", "/app/data/custom.db"])
        require_success(good, "independent Go verification")
        wrong = run([str(tool), "verify", "--backup", str(backup), "--manifest", str(manifest), "--expected-environment", "test"])
        require_failure(wrong, "wrong expected environment", "backup environment mismatch")
        with backup.open("ab") as handle:
            handle.write(b"tamper")
        tampered = run([str(tool), "verify", "--backup", str(backup), "--manifest", str(manifest)])
        require_failure(tampered, "tampered backup", "backup size mismatch")


def test_retention(tool: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-2-retention-") as tmp:
        root = Path(tmp)
        seed = root / "seed.db"
        create_representative_db(seed)
        now = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)
        for age in (60, 50, 20, 5, 1):
            backup = root / f"app-age-{age:02d}.db"
            shutil.copy2(seed, backup)
            created = (now - timedelta(days=age)).isoformat().replace("+00:00", "Z")
            create_manifest(tool, backup, created_at=created)
        seed.unlink()
        proc = run([str(tool), "prune", "--directory", str(root), "--retention-count", "2", "--retention-days", "30", "--now", "2026-10-03T12:00:00Z"])
        require_success(proc, "Go retention")
        existing = {p.name for p in root.glob("app-*.db")}
        expected = {"app-age-20.db", "app-age-05.db", "app-age-01.db"}
        if existing != expected:
            raise AssertionError(f"retention kept {sorted(existing)}, expected {sorted(expected)}")

    with tempfile.TemporaryDirectory(prefix="ers-33-2-retention-corrupt-") as tmp:
        root = Path(tmp)
        seed = root / "seed.db"
        create_representative_db(seed)
        for idx, age in enumerate((60, 50, 1), start=1):
            backup = root / f"app-{idx}.db"
            shutil.copy2(seed, backup)
            created = (datetime(2026, 10, 3, tzinfo=timezone.utc) - timedelta(days=age)).isoformat().replace("+00:00", "Z")
            create_manifest(tool, backup, created_at=created)
        seed.unlink()
        with (root / "app-1.db").open("ab") as handle:
            handle.write(b"corrupt")
        before = sorted(p.name for p in root.iterdir())
        proc = run([str(tool), "prune", "--directory", str(root), "--retention-count", "1", "--retention-days", "30", "--now", "2026-10-03T12:00:00Z"])
        require_failure(proc, "corrupt retention", "backup size mismatch")
        after = sorted(p.name for p in root.iterdir())
        if before != after:
            raise AssertionError("retention deleted files before detecting corruption")


def write_fake_docker(path: Path) -> None:
    path.write_text(r'''#!/usr/bin/env python3
import os, shutil, sqlite3, sys
from pathlib import Path
args=sys.argv[1:]
log=Path(os.environ["FAKE_DOCKER_LOG"])
with log.open("a", encoding="utf-8") as h: h.write(" ".join(args)+"\n")
source=Path(os.environ["FAKE_DOCKER_SOURCE_DB"]); tmp_root=Path(os.environ["FAKE_DOCKER_TMP"]); tmp_root.mkdir(parents=True, exist_ok=True)
def mapped(p):
    if p == "/app/data/custom.db": return source
    if p.startswith("/tmp/"): return tmp_root / Path(p).name
    return Path(p)
if args[0] == "exec":
    cmd=args[2:]
    if cmd[:2] == ["sh", "-c"]: print("/app/data/custom.db", end=""); sys.exit(0)
    if cmd and cmd[0] == "rm":
        for item in cmd[2:]:
            try: mapped(item).unlink()
            except FileNotFoundError: pass
        sys.exit(0)
    if cmd and cmd[0] == "sqlite3":
        db=mapped(cmd[1]); sql=cmd[2]
        if sql.startswith(".backup '"):
            dest=sql[len(".backup '"):-1]; src=sqlite3.connect(str(db)); out=sqlite3.connect(str(mapped(dest)))
            with out: src.backup(out)
            src.close(); out.close(); sys.exit(0)
        if sql == "PRAGMA integrity_check;":
            if os.environ.get("FAKE_DOCKER_INTEGRITY"): print(os.environ["FAKE_DOCKER_INTEGRITY"]); sys.exit(0)
            con=sqlite3.connect(f"file:{db}?mode=ro", uri=True); print(con.execute("PRAGMA integrity_check").fetchone()[0]); con.close(); sys.exit(0)
        if sql == "PRAGMA foreign_key_check;":
            con=sqlite3.connect(f"file:{db}?mode=ro", uri=True); rows=list(con.execute("PRAGMA foreign_key_check")); con.close()
            for row in rows: print("|".join(str(v) for v in row))
            sys.exit(0)
if args[0] == "cp":
    src=args[1].split(":",1)[1]; shutil.copy2(mapped(src), Path(args[2])); sys.exit(0)
print("unsupported fake docker command", args, file=sys.stderr); sys.exit(2)
''', encoding="utf-8")
    path.chmod(0o755)


def test_server_backup(tool_dir: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-2-server-") as tmp:
        root = Path(tmp); source = root / "source.db"; create_representative_db(source)
        fakebin = root / "fakebin"; fakebin.mkdir(); write_fake_docker(fakebin / "docker")
        backup_dir = root / "backups"; log = root / "docker.log"
        env = {**os.environ,
               "PATH": f"{fakebin}:{os.environ.get('PATH','')}",
               "FAKE_DOCKER_LOG": str(log), "FAKE_DOCKER_SOURCE_DB": str(source), "FAKE_DOCKER_TMP": str(root / "container-tmp"),
               "BACKUP_ENVIRONMENT": "production", "BACKUP_CONTAINER": "ers-prd-backend", "BACKUP_DIRECTORY": str(backup_dir),
               "BACKUP_RETENTION_COUNT": "14", "BACKUP_RETENTION_DAYS": "30", "ERS_BACKUP_TOOL_BINARY_DIR": str(tool_dir)}
        proc = run([str(SERVER_BACKUP)], env=env)
        require_success(proc, "server SQLite backup")
        backups = list(backup_dir.glob("app-*.db"))
        if len(backups) != 1 or not Path(str(backups[0]) + ".manifest.json").is_file():
            raise AssertionError("server backup did not retain exactly one managed pair")
        payload = json.loads(Path(str(backups[0]) + ".manifest.json").read_text())
        if payload["source"]["database_path"] != "/app/data/custom.db":
            raise AssertionError("server backup assumed a fixed DATABASE_PATH")
        if ".backup '/tmp/ers-backup-" not in log.read_text():
            raise AssertionError("server backup did not use SQLite online .backup")

        failed_dir = root / "failed"
        failed = run([str(SERVER_BACKUP)], env={**env, "BACKUP_DIRECTORY": str(failed_dir), "FAKE_DOCKER_INTEGRITY": "database disk image is malformed"})
        require_failure(failed, "failed in-container verification", "integrity_check failed")
        if list(failed_dir.glob("app-*.db")) or list(failed_dir.glob("*.manifest.json")):
            raise AssertionError("failed backup left accepted artifacts behind")


def test_repository_contract() -> None:
    makefile = (ROOT / "Makefile").read_text(); dockerfile = (BACKEND / "Dockerfile").read_text(); server = SERVER_BACKUP.read_text(); deploy = (ROOT / ".github/workflows/deploy.yml").read_text()
    for fragment in ("backend/cmd/ers-backup/main.go", "backend/cmd/ers-offhost-backup/main.go", "run-backup-go-tool.sh", "server-backup-verify:", "server-backup-retention:"):
        if fragment not in makefile:
            raise AssertionError(f"Makefile missing Go backup contract fragment {fragment!r}")
    for fragment in ("go build -o /out/ers-backup ./cmd/ers-backup", "go build -o /out/ers-offhost-backup ./cmd/ers-offhost-backup", "COPY --from=builder /out/ers-backup /app/ers-backup"):
        if fragment not in dockerfile:
            raise AssertionError(f"backend image missing {fragment!r}")
    if "python3 scripts/ers-backup.py" in makefile or "python3 scripts/ers-offhost-backup.py" in makefile or "scripts/ers-backup.py create-manifest" in server:
        raise AssertionError("Production backup path still invokes Python implementation")
    if (ROOT / "scripts" / "ers-backup.py").exists() or (ROOT / "scripts" / "ers-offhost-backup.py").exists():
        raise AssertionError("obsolete Production Python backup implementation still exists")
    if "make server-backup ENV='${{ steps.target.outputs.env_name }}'" not in deploy:
        raise AssertionError("deployment no longer takes pre-migration backup")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="ers-33-2-go-tools-") as tmp:
        bindir = build_tools(Path(tmp))
        tool = bindir / "ers-backup"
        test_manifest_and_independent_verification(tool)
        test_retention(tool)
        test_server_backup(bindir)
    test_repository_contract()
    print("Bite 33.2 backup creation, retention, and verification verified with Go Production tooling.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
