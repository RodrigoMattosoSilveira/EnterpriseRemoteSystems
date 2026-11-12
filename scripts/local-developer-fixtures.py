#!/usr/bin/env python3
"""One supported, LOCAL-only ERS developer fixture installer.

No database reset, temporary database, credential file, automatic password
rotation, or separate E2E seeding procedure. Reuses the canonical Go identity
provisioning routines and the existing SQL migration entry point.
"""
import getpass
import json
import os
from pathlib import Path
import shlex
import socket
import sqlite3
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
DB = BACKEND / "data" / "app.db"
LOGIN_ROWS = (
    ("APP-ADMIN", "e2e-admin-local@enterpriseremotesystems.com"),
    ("TENANT-A", "e2e-authz-admin-tenant-admin@example.com"),
    ("TENANT-B", "e2e-isolation-tenant-admin@example.com"),
    ("EARNINGS-A", "e2e-authz-admin-earnings-operator@example.com"),
    ("EXPENSES-A", "e2e-authz-admin-expenses-operator@example.com"),
    ("EARNINGS-B", "e2e-isolation-earnings-operator@example.com"),
    ("EXPENSES-B", "e2e-isolation-expenses-operator@example.com"),
    ("COLLAB-A", "e2e-byte352-collaborator-a@example.com"),
    ("COLLAB-B", "e2e-byte352-collaborator-b@example.com"),
    ("SHARED", "e2e-byte352-shared@example.com"),
    ("MULTI", "e2e-multi-tenant-person@example.com"),
)


def stop(message):
    raise SystemExit("FAIL: " + message)


def dotenv_paths():
    """Read only path/env selectors; never parse or print credentials."""
    result = {}
    file = BACKEND / ".env"
    if not file.exists():
        return result
    for line in file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key not in ("ERS_DATABASE_PATH", "DB_PATH", "DATABASE_PATH", "APP_ENV", "ERS_RESET_DATABASE"):
            continue
        try:
            tokens = shlex.split(value, comments=True)
        except ValueError:
            stop("cannot parse backend/.env selector " + key)
        result[key] = tokens[0] if len(tokens) == 1 else ""
    return result


def effective_path(settings):
    selectors = {**settings}
    for key in ("ERS_DATABASE_PATH", "DB_PATH", "DATABASE_PATH"):
        if key in os.environ and os.environ[key].strip():
            selectors[key] = os.environ[key].strip()
    name = next((selectors[k] for k in ("ERS_DATABASE_PATH", "DB_PATH", "DATABASE_PATH") if selectors.get(k)), "data/app.db")
    raw = Path(name)
    return (raw if raw.is_absolute() else BACKEND / raw).resolve()


def require_offline():
    # A second safety net against writing a running LOCAL database. If the app
    # listens on a custom port, the operator must also stop that process.
    for family, address in ((socket.AF_INET, ("127.0.0.1", 8080)), (socket.AF_INET6, ("::1", 8080))):
        try:
            with socket.socket(family, socket.SOCK_STREAM) as sock:
                sock.settimeout(0.25)
                if sock.connect_ex(address) == 0:
                    stop("port 8080 is in use; stop the LOCAL backend first")
        except OSError:
            continue


def integrity(path, *, immutable_snapshot=False):
    # A newly completed SQLite backup is a standalone, closed snapshot. On some
    # SQLite/macOS builds, its inherited WAL-mode header cannot be reopened with
    # plain mode=ro unless WAL sidecar files exist. immutable=1 is safe ONLY for
    # this closed backup; the original, potentially WAL-active DB must use mode=ro.
    uri = path.resolve().as_uri() + (
        "?mode=ro&immutable=1" if immutable_snapshot else "?mode=ro"
    )
    connection = sqlite3.connect(uri, uri=True)
    try:
        results = connection.execute("PRAGMA integrity_check").fetchall()
    finally:
        connection.close()
    if results != [("ok",)]:
        stop("SQLite integrity_check failed for " + str(path))


def backup_existing():
    if not DB.exists():
        print("NEW LOCAL database: existing data will not be replaced")
        return
    if not DB.is_file() or DB.is_symlink() or DB.stat().st_size == 0:
        stop("LOCAL database must be a regular nonempty file")
    integrity(DB)
    folder = BACKEND / "data" / "local-fixture-backups"
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    if folder.is_symlink():
        stop("backup directory must not be a symbolic link")
    name = "app-before-developer-fixtures-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".db"
    target = folder / name
    source = sqlite3.connect(DB.resolve().as_uri() + "?mode=ro", uri=True)
    dest = sqlite3.connect(target)
    try:
        source.backup(dest)
    finally:
        dest.close()
        source.close()
    target.chmod(0o600)
    integrity(target, immutable_snapshot=True)
    print("PASS: verified LOCAL backup:", target)


def prompt_credentials():
    print("Enter the 11 established LOCAL test passwords from 1Password (hidden input).")
    credentials = {}
    for label, login in LOGIN_ROWS:
        pwd = getpass.getpass(f"{label} ({login}): ")
        if len(pwd) < 16 or pwd.strip() != pwd or any(x in pwd for x in ("\r", "\n")):
            stop(f"invalid password for {label}: minimum 16 characters, no surrounding whitespace")
        if pwd in credentials.values():
            stop(f"password for {label} duplicates another LOCAL fixture password")
        credentials[login] = pwd
    return credentials


def main():
    if os.environ.get("APP_ENV") != "local":
        stop("APP_ENV=local is mandatory. This command never runs against DEV/TST/PRD")
    if os.environ.get("ERS_RESET_DATABASE") == "true":
        stop("ERS_RESET_DATABASE=true is forbidden")
    if ROOT != Path.cwd().resolve():
        stop("run from the ERS repository root")
    settings = dotenv_paths()
    if settings.get("APP_ENV", "local").lower() in ("production", "prd", "test", "testing"):
        stop("backend/.env describes a deployed environment; use a dedicated LOCAL configuration")
    if settings.get("ERS_RESET_DATABASE") == "true":
        stop("backend/.env enables database reset; disable it before continuing")
    if effective_path(settings) != DB.resolve() or DB.is_symlink():
        stop(f"configured backend database differs from the supported LOCAL {DB}; refusing a different target")
    if not (BACKEND / "migrations").is_dir():
        stop("missing SQL migrations")
    require_offline()
    print("LOCAL developer fixture installer")
    print("Database:", DB)
    print("One Application Administrator; two Tenants; two administrators, four operators,")
    print("two collaborators, SHARED and MULTI (MULTI retains dedicated Tenants).")
    print("This operation explicitly reconciles ONLY the 11 named fixture passwords")
    print("to the supplied 1Password credentials, revoking their old sessions.")
    print("No unrelated account or data will be reset, changed or reactivated.")
    print("Stop LOCAL ERS (including nonstandard ports) before continuing.")
    if input("Type INSTALL-LOCAL-FIXTURES to authorize backup and reconciliation: ").strip() != "INSTALL-LOCAL-FIXTURES":
        stop("operator did not authorize installation")
    backup_existing()
    print("Applying the repository's standard SQL migrations to LOCAL...")
    env = {**os.environ, "APP_ENV": "local", "DB_PATH": str(DB), "DATABASE_PATH": str(DB), "ERS_RESET_DATABASE": "false", "ERS_PROVISION_E2E_ADMIN": "false"}
    subprocess.run(["bash", str(ROOT / "scripts" / "db-migrate.sh")], cwd=ROOT, env=env, check=True)
    integrity(DB)
    credentials = prompt_credentials()
    payload = json.dumps({"databasePath": str(DB), "credentials": credentials, "allowFixtureCredentialReconciliation": True})
    # A pipe, not a CLI argument or a logged environment value. Never echo JSON.
    completed = subprocess.run(["go", "run", "./cmd/provision-e2e-admin", "--local-developer-fixtures"],
                               input=payload, text=True, cwd=BACKEND, env=env, check=False)
    if completed.returncode:
        stop("LOCAL fixture transaction failed; existing database backup is preserved; do not reset the database")
    integrity(DB)
    print("PASS: LOCAL fixture installation and database integrity")
    print("To start: make local-backend (automatic legacy E2E password rotation is blocked)")
    print("Then: make local-frontend; sign in using the LOCAL 1Password credentials")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        stop(f"required command failed (exit {exc.returncode}); database preserved, inspect migration output")
    except sqlite3.Error as exc:
        stop(f"SQLite operation failed: {exc}; do not reset the LOCAL database")
