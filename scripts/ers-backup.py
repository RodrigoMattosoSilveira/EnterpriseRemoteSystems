#!/usr/bin/env python3
"""ERS SQLite backup manifest, verification, and retention tooling.

Bite 33.2 keeps backup policy outside the application database.  A backup is
considered managed/recoverable only when the SQLite snapshot and its adjacent
manifest both verify successfully.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

FORMAT_VERSION = 1
MANIFEST_SUFFIX = ".manifest.json"
REQUIRED_TABLES = (
    "schema_migrations",
    "tenants",
    "global_people",
    "person_tenant_memberships",
    "auth_user_accounts",
    "authz_actors",
    "authz_actor_role_grants",
    "collaborator_journeys",
    "ledger_entries",
    "work_periods",
)
COUNT_TABLES = (
    "tenants",
    "global_people",
    "person_tenant_memberships",
    "auth_user_accounts",
    "authz_actors",
    "collaborator_journeys",
    "ledger_entries",
    "work_periods",
)
VALID_ENVIRONMENTS = {"development", "test", "production"}


class BackupError(RuntimeError):
    pass


@dataclass(frozen=True)
class Inspection:
    integrity_check: str
    foreign_key_check: str
    schema_migration_count: int
    latest_schema_migration: str
    record_counts: dict[str, int]


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_utc(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise BackupError(f"invalid UTC timestamp {value!r}") from exc
    if parsed.tzinfo is None:
        raise BackupError(f"timestamp must include a timezone: {value!r}")
    return parsed.astimezone(timezone.utc)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def quote_sqlite_uri_path(path: Path) -> str:
    # sqlite URI accepts a percent-encoded path. pathlib.as_posix is sufficient
    # for ERS server/Linux paths and local macOS regression tests.
    from urllib.parse import quote

    return quote(str(path.resolve()), safe="/")


def inspect_backup(path: Path) -> Inspection:
    if not path.is_file():
        raise BackupError(f"backup file does not exist: {path}")
    if path.stat().st_size <= 0:
        raise BackupError(f"backup file is empty: {path}")

    uri = f"file:{quote_sqlite_uri_path(path)}?mode=ro&immutable=1"
    try:
        connection = sqlite3.connect(uri, uri=True)
    except sqlite3.Error as exc:
        raise BackupError(f"cannot open SQLite backup {path}: {exc}") from exc

    try:
        connection.execute("PRAGMA query_only = ON")
        integrity_rows = [str(row[0]) for row in connection.execute("PRAGMA integrity_check")]
        if integrity_rows != ["ok"]:
            detail = "; ".join(integrity_rows[:10]) or "no result"
            raise BackupError(f"PRAGMA integrity_check failed for {path}: {detail}")

        fk_rows = list(connection.execute("PRAGMA foreign_key_check"))
        if fk_rows:
            detail = "; ".join(repr(row) for row in fk_rows[:10])
            raise BackupError(f"PRAGMA foreign_key_check failed for {path}: {detail}")

        tables = {
            str(row[0])
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        missing = [table for table in REQUIRED_TABLES if table not in tables]
        if missing:
            raise BackupError(
                f"backup is missing required ERS table(s): {', '.join(missing)}"
            )

        migration_count = int(connection.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0])
        if migration_count <= 0:
            raise BackupError("backup schema_migrations is empty")
        latest_row = connection.execute(
            "SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1"
        ).fetchone()
        latest = str(latest_row[0]) if latest_row else ""
        if not latest:
            raise BackupError("backup has no latest schema migration marker")

        counts: dict[str, int] = {}
        for table in COUNT_TABLES:
            counts[table] = int(connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
    except sqlite3.Error as exc:
        raise BackupError(f"SQLite verification failed for {path}: {exc}") from exc
    finally:
        connection.close()

    return Inspection(
        integrity_check="ok",
        foreign_key_check="ok",
        schema_migration_count=migration_count,
        latest_schema_migration=latest,
        record_counts=counts,
    )


def manifest_path_for(backup: Path) -> Path:
    return Path(str(backup) + MANIFEST_SUFFIX)


def normalize_environment(value: str) -> str:
    normalized = value.strip().lower()
    aliases = {
        "dev": "development",
        "local": "development",
        "testing": "test",
        "ci": "test",
        "prod": "production",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in VALID_ENVIRONMENTS:
        raise BackupError(
            "backup environment must explicitly identify development, test, or production"
        )
    return normalized


def build_manifest(
    *,
    backup: Path,
    environment: str,
    source_container: str,
    source_database_path: str,
    created_at: datetime,
) -> dict[str, Any]:
    environment = normalize_environment(environment)
    if not source_container.strip():
        raise BackupError("source container is required")
    if not source_database_path.strip():
        raise BackupError("source database path is required")

    inspection = inspect_backup(backup)
    return {
        "format_version": FORMAT_VERSION,
        "status": "verified",
        "created_at": format_utc(created_at),
        "environment": environment,
        "source": {
            "container": source_container,
            "database_path": source_database_path,
        },
        "backup": {
            "file": backup.name,
            "size_bytes": backup.stat().st_size,
            "sha256": sha256_file(backup),
        },
        "verification": {
            "verified_at": format_utc(utc_now()),
            "integrity_check": inspection.integrity_check,
            "foreign_key_check": inspection.foreign_key_check,
            "required_tables": list(REQUIRED_TABLES),
            "schema_migration_count": inspection.schema_migration_count,
            "latest_schema_migration": inspection.latest_schema_migration,
            "record_counts": inspection.record_counts,
        },
    }


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + f".tmp-{os.getpid()}")
    try:
        with temp.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def load_manifest(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise BackupError(f"backup manifest does not exist: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BackupError(f"cannot read backup manifest {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise BackupError(f"backup manifest must be a JSON object: {path}")
    return payload


def verify_pair(
    backup: Path,
    manifest_path: Path,
    *,
    expected_environment: str | None = None,
    expected_source_database_path: str | None = None,
) -> dict[str, Any]:
    manifest = load_manifest(manifest_path)
    if manifest.get("format_version") != FORMAT_VERSION:
        raise BackupError(
            f"unsupported backup manifest format_version: {manifest.get('format_version')!r}"
        )
    if manifest.get("status") != "verified":
        raise BackupError(f"backup manifest status is not verified: {manifest.get('status')!r}")

    environment = normalize_environment(str(manifest.get("environment", "")))
    if expected_environment is not None:
        expected = normalize_environment(expected_environment)
        if environment != expected:
            raise BackupError(
                f"backup environment mismatch: expected {expected}, manifest declares {environment}"
            )

    source = manifest.get("source")
    backup_meta = manifest.get("backup")
    verification = manifest.get("verification")
    if not isinstance(source, dict) or not isinstance(backup_meta, dict) or not isinstance(verification, dict):
        raise BackupError("backup manifest is missing source/backup/verification objects")
    if backup_meta.get("file") != backup.name:
        raise BackupError(
            f"backup filename mismatch: manifest declares {backup_meta.get('file')!r}, actual file is {backup.name!r}"
        )
    if expected_source_database_path is not None and source.get("database_path") != expected_source_database_path:
        raise BackupError(
            "backup source database mismatch: "
            f"expected {expected_source_database_path!r}, manifest declares {source.get('database_path')!r}"
        )

    actual_size = backup.stat().st_size if backup.is_file() else -1
    if backup_meta.get("size_bytes") != actual_size:
        raise BackupError(
            f"backup size mismatch: manifest={backup_meta.get('size_bytes')!r} actual={actual_size}"
        )
    actual_sha = sha256_file(backup)
    if backup_meta.get("sha256") != actual_sha:
        raise BackupError(
            f"backup SHA-256 mismatch: manifest={backup_meta.get('sha256')!r} actual={actual_sha}"
        )

    inspection = inspect_backup(backup)
    expected_tables = verification.get("required_tables")
    if expected_tables != list(REQUIRED_TABLES):
        raise BackupError("backup manifest required_tables does not match the current 33.2 contract")
    if verification.get("integrity_check") != inspection.integrity_check:
        raise BackupError("backup manifest integrity_check evidence does not match re-verification")
    if verification.get("foreign_key_check") != inspection.foreign_key_check:
        raise BackupError("backup manifest foreign_key_check evidence does not match re-verification")
    if verification.get("schema_migration_count") != inspection.schema_migration_count:
        raise BackupError("backup schema migration count changed since manifest creation")
    if verification.get("latest_schema_migration") != inspection.latest_schema_migration:
        raise BackupError("backup latest schema migration changed since manifest creation")
    if verification.get("record_counts") != inspection.record_counts:
        raise BackupError("backup core record counts changed since manifest creation")

    parse_utc(str(manifest.get("created_at", "")))
    parse_utc(str(verification.get("verified_at", "")))
    return manifest


def positive_integer(value: str, label: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise BackupError(f"{label} must be an integer >= 1") from exc
    if parsed < 1:
        raise BackupError(f"{label} must be an integer >= 1")
    return parsed


def prune(directory: Path, retention_count: int, retention_days: int, *, now: datetime) -> list[Path]:
    if not directory.is_dir():
        raise BackupError(f"backup directory does not exist: {directory}")

    pairs: list[tuple[datetime, Path, Path]] = []
    for manifest_path in sorted(directory.glob(f"app-*.db{MANIFEST_SUFFIX}")):
        backup = Path(str(manifest_path)[: -len(MANIFEST_SUFFIX)])
        # Fail closed before deleting anything if any managed pair is not recoverable.
        manifest = verify_pair(backup, manifest_path)
        created_at = parse_utc(str(manifest["created_at"]))
        pairs.append((created_at, backup, manifest_path))

    if not pairs:
        print(f"Retention: no verified managed backups found in {directory}; nothing to prune.")
        return []

    pairs.sort(key=lambda item: item[0], reverse=True)
    cutoff = now.astimezone(timezone.utc) - timedelta(days=retention_days)
    keep: set[Path] = {item[1] for item in pairs[:retention_count]}
    for created_at, backup, _manifest in pairs:
        if created_at >= cutoff:
            keep.add(backup)

    if not keep:
        raise BackupError("retention policy would remove all verified backups; refusing")

    deletions = [item for item in pairs if item[1] not in keep]
    if len(deletions) >= len(pairs):
        raise BackupError("retention policy would remove all verified backups; refusing")

    removed: list[Path] = []
    for _created_at, backup, manifest_path in deletions:
        print(f"Retention: removing verified backup {backup.name}")
        backup.unlink()
        manifest_path.unlink()
        removed.append(backup)

    print(
        f"Retention: kept {len(pairs) - len(deletions)} verified backup(s); "
        f"removed {len(deletions)}; minimum-count={retention_count}; max-age-days={retention_days}."
    )
    return removed


def cmd_create_manifest(args: argparse.Namespace) -> int:
    backup = Path(args.backup).resolve()
    manifest_path = Path(args.manifest).resolve() if args.manifest else manifest_path_for(backup)
    created_at = parse_utc(args.created_at) if args.created_at else utc_now()
    payload = build_manifest(
        backup=backup,
        environment=args.environment,
        source_container=args.source_container,
        source_database_path=args.source_database_path,
        created_at=created_at,
    )
    write_json_atomic(manifest_path, payload)
    # Re-read and re-verify what was written so a successful command means the
    # retained pair is independently usable.
    verify_pair(
        backup,
        manifest_path,
        expected_environment=args.environment,
        expected_source_database_path=args.source_database_path,
    )
    print(f"Verified backup manifest written to {manifest_path}")
    print(f"Backup SHA-256: {payload['backup']['sha256']}")
    print(f"Latest schema migration: {payload['verification']['latest_schema_migration']}")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    backup = Path(args.backup).resolve()
    manifest_path = Path(args.manifest).resolve() if args.manifest else manifest_path_for(backup)
    payload = verify_pair(
        backup,
        manifest_path,
        expected_environment=args.expected_environment,
        expected_source_database_path=args.expected_source_database_path,
    )
    print(f"Backup verification passed: {backup}")
    print(f"Manifest: {manifest_path}")
    print(f"Environment: {payload['environment']}")
    print(f"SHA-256: {payload['backup']['sha256']}")
    print(f"Latest schema migration: {payload['verification']['latest_schema_migration']}")
    return 0


def cmd_prune(args: argparse.Namespace) -> int:
    count = positive_integer(args.retention_count, "retention count")
    days = positive_integer(args.retention_days, "retention days")
    now = parse_utc(args.now) if args.now else utc_now()
    prune(Path(args.directory).resolve(), count, days, now=now)
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="ERS SQLite backup verification and retention")
    sub = root.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create-manifest", help="verify a SQLite backup and create its manifest")
    create.add_argument("--backup", required=True)
    create.add_argument("--manifest")
    create.add_argument("--environment", required=True)
    create.add_argument("--source-container", required=True)
    create.add_argument("--source-database-path", required=True)
    create.add_argument("--created-at")
    create.set_defaults(func=cmd_create_manifest)

    verify = sub.add_parser("verify", help="independently re-verify a backup and its manifest")
    verify.add_argument("--backup", required=True)
    verify.add_argument("--manifest")
    verify.add_argument("--expected-environment")
    verify.add_argument("--expected-source-database-path")
    verify.set_defaults(func=cmd_verify)

    prune_cmd = sub.add_parser("prune", help="apply verified-backup retention policy")
    prune_cmd.add_argument("--directory", required=True)
    prune_cmd.add_argument("--retention-count", required=True)
    prune_cmd.add_argument("--retention-days", required=True)
    prune_cmd.add_argument("--now", help="UTC timestamp override for deterministic tests")
    prune_cmd.set_defaults(func=cmd_prune)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        return int(args.func(args))
    except BackupError as exc:
        print(f"Backup verification error: {exc}", file=sys.stderr)
        return 2
    except OSError as exc:
        print(f"Backup filesystem error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
