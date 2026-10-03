#!/usr/bin/env python3
"""Bite 33.3 off-host protection for verified ERS SQLite backups."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import ipaddress
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BACKUP_MODULE_PATH = ROOT / "scripts" / "ers-backup.py"
OFFHOST_RECEIPT_SUFFIX = ".offhost.json"
RECEIPT_FORMAT_VERSION = 1

spec = importlib.util.spec_from_file_location("ers_backup", BACKUP_MODULE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"cannot load backup helper: {BACKUP_MODULE_PATH}")
BACKUP = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = BACKUP
spec.loader.exec_module(BACKUP)


class OffHostError(RuntimeError):
    pass


def utc_now_text() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_bool(raw: str | None, *, label: str) -> bool:
    value = (raw or "").strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off", ""}:
        return False
    raise OffHostError(f"{label} must be true or false; got {raw!r}")


def normalize_environment(raw: str) -> str:
    value = raw.strip().lower()
    aliases = {
        "local": "development",
        "dev": "development",
        "development": "development",
        "test": "test",
        "testing": "test",
        "ci": "test",
        "production": "production",
        "prod": "production",
    }
    normalized = aliases.get(value)
    if normalized is None:
        raise OffHostError(
            f"environment must explicitly identify development, test, or production; got {raw!r}"
        )
    return normalized


def read_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise OffHostError(f"off-host environment file does not exist: {path}")
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise OffHostError(f"cannot read off-host environment file {path}: {exc}") from exc
    for line_number, raw in enumerate(lines, start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        if key in values:
            raise OffHostError(f"{path} defines {key} more than once (line {line_number})")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


@dataclass(frozen=True)
class OffHostConfig:
    environment: str
    enabled: bool
    host: str
    user: str
    directory: str
    port: int
    identity_file: Path
    known_hosts_file: Path

    @property
    def ssh_target(self) -> str:
        return f"{self.user}@{self.host}"

    @property
    def environment_directory(self) -> str:
        return self.directory.rstrip("/") + "/" + self.environment


def load_config(environment: str, env_file: Path, *, require_runtime_files: bool) -> OffHostConfig:
    normalized = normalize_environment(environment)
    values = read_env_file(env_file)
    file_environment = normalize_environment(values.get("APP_ENV", ""))
    if file_environment != normalized:
        raise OffHostError(
            f"selected environment {normalized} does not match {env_file} APP_ENV={file_environment}"
        )

    enabled = parse_bool(values.get("SERVER_OFFHOST_BACKUP_ENABLED"), label="SERVER_OFFHOST_BACKUP_ENABLED")
    if normalized == "production" and not enabled:
        raise OffHostError(
            "Production requires SERVER_OFFHOST_BACKUP_ENABLED=true so verified backups leave the application host."
        )

    host = values.get("SERVER_OFFHOST_BACKUP_HOST", "").strip()
    user = values.get("SERVER_OFFHOST_BACKUP_USER", "").strip()
    directory = values.get("SERVER_OFFHOST_BACKUP_DIRECTORY", "").strip()
    port_raw = values.get("SERVER_OFFHOST_BACKUP_PORT", "22").strip() or "22"
    identity_raw = values.get("SERVER_OFFHOST_BACKUP_IDENTITY_FILE", "").strip()
    known_hosts_raw = values.get("SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE", "").strip()

    if not enabled:
        return OffHostConfig(
            environment=normalized,
            enabled=False,
            host=host,
            user=user,
            directory=directory,
            port=22,
            identity_file=Path(identity_raw or "/nonexistent"),
            known_hosts_file=Path(known_hosts_raw or "/nonexistent"),
        )

    if not host or any(char.isspace() for char in host):
        raise OffHostError("SERVER_OFFHOST_BACKUP_HOST must be a non-empty host name/address without whitespace")
    if host.lower().rstrip(".") in {"localhost", "localhost.localdomain"}:
        raise OffHostError("SERVER_OFFHOST_BACKUP_HOST must identify a distinct non-loopback host")
    try:
        parsed_host = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        parsed_host = None
    if parsed_host is not None and parsed_host.is_loopback:
        raise OffHostError("SERVER_OFFHOST_BACKUP_HOST must identify a distinct non-loopback host")
    if not user or any(char.isspace() for char in user):
        raise OffHostError("SERVER_OFFHOST_BACKUP_USER must be a non-empty SSH user without whitespace")
    if not directory.startswith("/") or directory == "/":
        raise OffHostError("SERVER_OFFHOST_BACKUP_DIRECTORY must be an absolute remote directory other than /")
    if "\n" in directory or "\r" in directory:
        raise OffHostError("SERVER_OFFHOST_BACKUP_DIRECTORY must not contain newlines")
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise OffHostError("SERVER_OFFHOST_BACKUP_PORT must be an integer from 1 through 65535") from exc
    if port < 1 or port > 65535:
        raise OffHostError("SERVER_OFFHOST_BACKUP_PORT must be an integer from 1 through 65535")
    if not identity_raw:
        raise OffHostError("SERVER_OFFHOST_BACKUP_IDENTITY_FILE is required when off-host backup is enabled")
    if not known_hosts_raw:
        raise OffHostError("SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE is required when off-host backup is enabled")
    identity_file = Path(identity_raw)
    known_hosts_file = Path(known_hosts_raw)
    if not identity_file.is_absolute():
        raise OffHostError("SERVER_OFFHOST_BACKUP_IDENTITY_FILE must be an absolute path")
    if not known_hosts_file.is_absolute():
        raise OffHostError("SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE must be an absolute path")
    if require_runtime_files:
        if not identity_file.is_file():
            raise OffHostError(f"off-host SSH identity file does not exist: {identity_file}")
        if not known_hosts_file.is_file():
            raise OffHostError(f"off-host SSH known-hosts file does not exist: {known_hosts_file}")

    return OffHostConfig(
        environment=normalized,
        enabled=True,
        host=host,
        user=user,
        directory=directory.rstrip("/"),
        port=port,
        identity_file=identity_file,
        known_hosts_file=known_hosts_file,
    )


def ssh_base(config: OffHostConfig) -> list[str]:
    return [
        "ssh",
        "-i",
        str(config.identity_file),
        "-p",
        str(config.port),
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        f"UserKnownHostsFile={config.known_hosts_file}",
        config.ssh_target,
    ]


def run_ssh(
    config: OffHostConfig,
    command: str,
    *,
    stdin_path: Path | None = None,
    stdout_path: Path | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[bytes]:
    cmd = [*ssh_base(config), command]
    stdin_handle = stdin_path.open("rb") if stdin_path is not None else subprocess.DEVNULL
    stdout_handle = stdout_path.open("wb") if stdout_path is not None else subprocess.PIPE
    try:
        proc = subprocess.run(
            cmd,
            stdin=stdin_handle,
            stdout=stdout_handle,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError as exc:
        raise OffHostError(f"cannot execute SSH transport: {exc}") from exc
    finally:
        if stdin_path is not None and hasattr(stdin_handle, "close"):
            stdin_handle.close()
        if stdout_path is not None and hasattr(stdout_handle, "close"):
            stdout_handle.close()
    if check and proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        raise OffHostError(
            f"SSH transport failed with exit {proc.returncode} while running {command!r}: {stderr or 'no stderr'}"
        )
    return proc


def quote(path: str) -> str:
    return shlex.quote(path)


def remote_paths(config: OffHostConfig, backup_name: str) -> tuple[str, str, str, str]:
    if Path(backup_name).name != backup_name or not backup_name.startswith("app-") or not backup_name.endswith(".db"):
        raise OffHostError(f"invalid managed backup filename for off-host storage: {backup_name!r}")
    remote_dir = config.environment_directory + "/" + backup_name
    remote_backup = remote_dir + "/" + backup_name
    remote_manifest = remote_dir + "/" + backup_name + BACKUP.MANIFEST_SUFFIX
    remote_receipt = remote_dir + "/" + backup_name + OFFHOST_RECEIPT_SUFFIX
    return remote_dir, remote_backup, remote_manifest, remote_receipt


def remote_directory_state(config: OffHostConfig, remote_dir: str) -> str:
    command = (
        f"if [ -d {quote(remote_dir)} ]; then printf directory; "
        f"elif [ -e {quote(remote_dir)} ]; then printf collision; else printf missing; fi"
    )
    proc = run_ssh(config, command)
    return (proc.stdout or b"").decode("utf-8").strip()


def upload_file(config: OffHostConfig, local: Path, remote: str) -> None:
    command = f"umask 077; cat > {quote(remote)}"
    run_ssh(config, command, stdin_path=local)


def download_file(config: OffHostConfig, remote: str, local: Path) -> None:
    command = f"cat -- {quote(remote)}"
    run_ssh(config, command, stdout_path=local)


def verify_downloaded_pair(
    *,
    backup: Path,
    manifest: Path,
    environment: str,
    expected_backup_sha256: str | None = None,
    expected_manifest_sha256: str | None = None,
) -> dict[str, Any]:
    if expected_manifest_sha256 is not None:
        actual_manifest_sha = sha256_file(manifest)
        if actual_manifest_sha != expected_manifest_sha256:
            raise OffHostError(
                "off-host manifest SHA-256 mismatch: "
                f"expected {expected_manifest_sha256}, received {actual_manifest_sha}"
            )
    payload = BACKUP.verify_pair(backup, manifest, expected_environment=environment)
    actual_backup_sha = sha256_file(backup)
    if expected_backup_sha256 is not None and actual_backup_sha != expected_backup_sha256:
        raise OffHostError(
            "off-host backup SHA-256 mismatch: "
            f"expected {expected_backup_sha256}, received {actual_backup_sha}"
        )
    return payload


def fetch_and_verify_remote(
    config: OffHostConfig,
    backup_name: str,
    *,
    expected_backup_sha256: str | None = None,
    expected_manifest_sha256: str | None = None,
) -> dict[str, Any]:
    remote_dir, remote_backup, remote_manifest, _remote_receipt = remote_paths(config, backup_name)
    with tempfile.TemporaryDirectory(prefix="ers-offhost-verify-") as tmp:
        root = Path(tmp)
        local_backup = root / backup_name
        local_manifest = root / f"{backup_name}{BACKUP.MANIFEST_SUFFIX}"
        try:
            download_file(config, remote_backup, local_backup)
            download_file(config, remote_manifest, local_manifest)
        except OffHostError as exc:
            raise OffHostError(f"cannot retrieve off-host backup pair from {remote_dir}: {exc}") from exc
        return verify_downloaded_pair(
            backup=local_backup,
            manifest=local_manifest,
            environment=config.environment,
            expected_backup_sha256=expected_backup_sha256,
            expected_manifest_sha256=expected_manifest_sha256,
        )


def receipt_path_for(backup: Path) -> Path:
    return Path(str(backup) + OFFHOST_RECEIPT_SUFFIX)


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


def build_receipt(
    *,
    config: OffHostConfig,
    local_backup: Path,
    local_manifest: Path,
    payload: dict[str, Any],
    remote_dir: str,
) -> dict[str, Any]:
    return {
        "format_version": RECEIPT_FORMAT_VERSION,
        "status": "verified",
        "replicated_at": utc_now_text(),
        "environment": config.environment,
        "transport": "ssh",
        "source": {
            "backup_file": local_backup.name,
            "backup_sha256": payload["backup"]["sha256"],
            "backup_size_bytes": payload["backup"]["size_bytes"],
            "manifest_file": local_manifest.name,
            "manifest_sha256": sha256_file(local_manifest),
        },
        "remote": {
            "host": config.host,
            "user": config.user,
            "port": config.port,
            "directory": remote_dir,
        },
        "verification": {
            "method": "round-trip-download-plus-bite-33.2-full-verification",
            "integrity_check": "ok",
            "foreign_key_check": [],
        },
    }


def replicate(args: argparse.Namespace) -> int:
    env_file = Path(args.env_file).resolve()
    config = load_config(args.environment, env_file, require_runtime_files=True)
    if not config.enabled:
        raise OffHostError(
            f"off-host backup is disabled for {config.environment}; set SERVER_OFFHOST_BACKUP_ENABLED=true to replicate explicitly"
        )

    backup = Path(args.backup).resolve()
    manifest = Path(args.manifest).resolve() if args.manifest else BACKUP.manifest_path_for(backup)
    payload = BACKUP.verify_pair(backup, manifest, expected_environment=config.environment)
    local_backup_sha = str(payload["backup"]["sha256"])
    local_manifest_sha = sha256_file(manifest)
    remote_dir, remote_backup, remote_manifest, remote_receipt = remote_paths(config, backup.name)

    state = remote_directory_state(config, remote_dir)
    created = False
    if state == "collision":
        raise OffHostError(f"off-host destination collides with a non-directory path: {remote_dir}")
    if state == "missing":
        stage = config.environment_directory + f"/.stage-{backup.name}-{uuid.uuid4().hex}"
        run_ssh(
            config,
            f"umask 077; mkdir -p -- {quote(config.environment_directory)} && mkdir -- {quote(stage)}",
        )
        try:
            upload_file(config, backup, stage + "/" + backup.name)
            upload_file(config, manifest, stage + "/" + manifest.name)
            publish = (
                f"if [ -e {quote(remote_dir)} ]; then exit 73; fi; "
                f"mv -- {quote(stage)} {quote(remote_dir)}"
            )
            run_ssh(config, publish)
            created = True
        except Exception:
            run_ssh(config, f"rm -rf -- {quote(stage)}", check=False)
            raise

    try:
        remote_payload = fetch_and_verify_remote(
            config,
            backup.name,
            expected_backup_sha256=local_backup_sha,
            expected_manifest_sha256=local_manifest_sha,
        )
    except Exception:
        if created:
            run_ssh(config, f"rm -rf -- {quote(remote_dir)}", check=False)
        raise

    receipt = build_receipt(
        config=config,
        local_backup=backup,
        local_manifest=manifest,
        payload=remote_payload,
        remote_dir=remote_dir,
    )
    with tempfile.TemporaryDirectory(prefix="ers-offhost-receipt-") as tmp:
        temporary_receipt = Path(tmp) / Path(remote_receipt).name
        write_json_atomic(temporary_receipt, receipt)
        upload_file(config, temporary_receipt, remote_receipt)
    local_receipt = receipt_path_for(backup)
    write_json_atomic(local_receipt, receipt)

    print(f"Off-host backup verification passed: {backup.name}")
    print(f"Remote: ssh://{config.user}@{config.host}:{config.port}{remote_dir}")
    print(f"Backup SHA-256: {local_backup_sha}")
    print(f"Manifest SHA-256: {local_manifest_sha}")
    print(f"Receipt: {local_receipt}")
    return 0


def verify_replica(args: argparse.Namespace) -> int:
    env_file = Path(args.env_file).resolve()
    config = load_config(args.environment, env_file, require_runtime_files=True)
    if not config.enabled:
        raise OffHostError(f"off-host backup is disabled for {config.environment}")

    receipt_path = Path(args.receipt).resolve()
    if not receipt_path.is_file():
        raise OffHostError(f"off-host receipt does not exist: {receipt_path}")
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise OffHostError(f"cannot read off-host receipt {receipt_path}: {exc}") from exc
    if receipt.get("format_version") != RECEIPT_FORMAT_VERSION or receipt.get("status") != "verified":
        raise OffHostError("off-host receipt format/status is invalid")
    if normalize_environment(str(receipt.get("environment", ""))) != config.environment:
        raise OffHostError("off-host receipt environment does not match the selected environment")
    source = receipt.get("source")
    remote = receipt.get("remote")
    if not isinstance(source, dict) or not isinstance(remote, dict):
        raise OffHostError("off-host receipt is missing source/remote metadata")
    backup_name = str(source.get("backup_file", ""))
    remote_dir, _remote_backup, _remote_manifest, _remote_receipt = remote_paths(config, backup_name)
    if remote.get("host") != config.host or remote.get("user") != config.user or remote.get("port") != config.port:
        raise OffHostError("off-host receipt remote SSH endpoint does not match current configuration")
    if remote.get("directory") != remote_dir:
        raise OffHostError("off-host receipt remote directory does not match current configuration")

    payload = fetch_and_verify_remote(
        config,
        backup_name,
        expected_backup_sha256=str(source.get("backup_sha256", "")),
        expected_manifest_sha256=str(source.get("manifest_sha256", "")),
    )
    print(f"Off-host replica verification passed: {backup_name}")
    print(f"Remote: ssh://{config.user}@{config.host}:{config.port}{remote_dir}")
    print(f"SHA-256: {payload['backup']['sha256']}")
    return 0


def status(args: argparse.Namespace) -> int:
    config = load_config(args.environment, Path(args.env_file).resolve(), require_runtime_files=False)
    print("enabled" if config.enabled else "disabled")
    return 0


def check_config(args: argparse.Namespace) -> int:
    config = load_config(args.environment, Path(args.env_file).resolve(), require_runtime_files=args.runtime_files)
    state = "enabled" if config.enabled else "disabled"
    print(f"Off-host backup configuration valid for {config.environment}: {state}")
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="ERS Bite 33.3 off-host backup protection")
    sub = root.add_subparsers(dest="command", required=True)

    status_cmd = sub.add_parser("status", help="print enabled/disabled for the selected environment")
    status_cmd.add_argument("--environment", required=True)
    status_cmd.add_argument("--env-file", required=True)
    status_cmd.set_defaults(func=status)

    check = sub.add_parser("check-config", help="validate off-host backup configuration")
    check.add_argument("--environment", required=True)
    check.add_argument("--env-file", required=True)
    check.add_argument("--runtime-files", action="store_true", help="also require identity/known-hosts files to exist")
    check.set_defaults(func=check_config)

    repl = sub.add_parser("replicate", help="replicate and round-trip verify a 33.2 managed backup")
    repl.add_argument("--environment", required=True)
    repl.add_argument("--env-file", required=True)
    repl.add_argument("--backup", required=True)
    repl.add_argument("--manifest")
    repl.set_defaults(func=replicate)

    verify = sub.add_parser("verify-replica", help="independently re-download and verify an off-host replica")
    verify.add_argument("--environment", required=True)
    verify.add_argument("--env-file", required=True)
    verify.add_argument("--receipt", required=True)
    verify.set_defaults(func=verify_replica)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        return int(args.func(args))
    except (OffHostError, BACKUP.BackupError) as exc:
        print(f"Off-host backup error: {exc}", file=sys.stderr)
        return 2
    except OSError as exc:
        print(f"Off-host backup filesystem error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
