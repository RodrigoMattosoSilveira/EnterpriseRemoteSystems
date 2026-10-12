#!/usr/bin/env python3
"""Regression coverage for Bite 33.6 owner-unavailable recovery readiness."""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "ops" / "recovery-access.production.env"


def run(cmd: list[str], *, cwd: Path = ROOT, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged = os.environ.copy()
    if env:
        merged.update(env)
    return subprocess.run(cmd, cwd=cwd, env=merged, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)


def require(text: str, fragments: tuple[str, ...], context: str) -> None:
    for fragment in fragments:
        if fragment not in text:
            raise AssertionError(f"{context} missing owner-unavailable recovery contract fragment {fragment!r}")


def parse_manifest(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise AssertionError(f"invalid recovery access manifest line: {raw!r}")
        key, value = line.split("=", 1)
        if key in values:
            raise AssertionError(f"duplicate recovery access manifest key: {key}")
        values[key] = value.strip().strip('"').strip("'")
    return values


def test_committed_access_manifest() -> None:
    values = parse_manifest(MANIFEST)
    expected = {
        "RECOVERY_ACCESS_FORMAT_VERSION": "1",
        "RECOVERY_OWNER_UNAVAILABLE_REQUIRED": "true",
        "RECOVERY_SHARED_SECRETS_PROVIDER": "LastPass",
        "RECOVERY_SHARED_COLLECTION": "ERS-Recovery",
        "RECOVERY_REPOSITORY_SLUG": "RodrigoMattosoSilveira/EnterpriseRemoteSystems",
        "RECOVERY_REPOSITORY_URL": "git@github.com:RodrigoMattosoSilveira/EnterpriseRemoteSystems.git",
        "RECOVERY_PRODUCTION_ENV_SOURCE": "lastpass-shared://ERS-Recovery/Production/.env.production",
        "RECOVERY_S3_CREDENTIAL_SOURCE": "lastpass-shared://ERS-Recovery/Production/Hetzner-S3-ers-backup",
        "RECOVERY_HOST_ACCESS_SOURCE": "lastpass-shared://ERS-Recovery/Production/Host-SSH",
        "RECOVERY_HETZNER_CONSOLE_SOURCE": "lastpass-shared://ERS-Recovery/Infrastructure/Hetzner-Console",
        "RECOVERY_DNS_SOURCE": "lastpass-shared://ERS-Recovery/Infrastructure/DNS",
        "RECOVERY_MFA_RECOVERY_SOURCE": "technician-controlled://independent-mfa-and-recovery-codes",
        "RECOVERY_PRODUCTION_DOMAIN": "app.enterpriseremotesystems.com",
        "RECOVERY_S3_ENDPOINT": "https://hel1.your-objectstorage.com",
        "RECOVERY_S3_REGION": "hel1",
        "RECOVERY_S3_BUCKET": "ers",
        "RECOVERY_S3_PROFILE": "ers-backup",
        "RECOVERY_SHARED_ACCESS_POLICY": "technician-access-independent-of-owner",
        "RECOVERY_MFA_POLICY": "must-not-depend-on-owner-device-or-approval",
    }
    for key, wanted in expected.items():
        if values.get(key) != wanted:
            raise AssertionError(f"recovery access manifest {key}={values.get(key)!r}, expected {wanted!r}")
    forbidden = ("normal administrative", "normal-administrative", "personal-vault", "tbd", "todo", "<", ">")
    for key, value in values.items():
        if key.endswith("_SOURCE"):
            lower = value.lower()
            for marker in forbidden:
                if marker in lower:
                    raise AssertionError(f"recovery access source {key} remains vague/personal: {value}")


def test_preflight_script_behavior() -> None:
    script = ROOT / "scripts" / "server-owner-unavailable-recovery-preflight.sh"
    syntax = run(["bash", "-n", str(script)])
    if syntax.returncode != 0:
        raise AssertionError(f"preflight shell syntax failed:\n{syntax.stdout}")

    with tempfile.TemporaryDirectory(prefix="ers-owner-unavailable-") as raw:
        temp = Path(raw)
        env_dir = temp / "production"
        env_dir.mkdir()
        shutil.copytree(ROOT / "edge", env_dir / "edge")
        shutil.copytree(ROOT / "deploy", env_dir / "deploy")
        shutil.copy(ROOT / "docker-compose.server.yml", env_dir / "docker-compose.server.yml")
        subprocess.run(["git", "init", "-q"], cwd=env_dir, check=True)
        subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=env_dir, check=True)
        subprocess.run(["git", "config", "user.name", "Recovery Test"], cwd=env_dir, check=True)
        subprocess.run(["git", "add", "."], cwd=env_dir, check=True)
        subprocess.run(["git", "commit", "-q", "-m", "test"], cwd=env_dir, check=True)
        subprocess.run(["git", "remote", "add", "origin", "git@github.com:RodrigoMattosoSilveira/EnterpriseRemoteSystems.git"], cwd=env_dir, check=True)

        credentials = temp / "aws-credentials"
        credentials.write_text("[ers-backup]\naws_access_key_id = test\naws_secret_access_key = test\n")
        credentials.chmod(0o600)
        env_file = env_dir / ".env.production"
        env_file.write_text(
            "APP_ENV=production\n"
            "APP_DOMAIN=app.enterpriseremotesystems.com\n"
            "CONTAINER_PREFIX=ers-prd\n"
            "DATABASE_PATH=/app/data/app.db\n"
            "APP_AUTO_MIGRATE=false\n"
            "JWT_SECRET=test-recovery-secret\n"
            "JWT_ISSUER=enterprise-remote-systems\n"
            "CORS_ALLOW_ORIGINS=https://app.enterpriseremotesystems.com\n"
            "AUTHZ_ACTOR_HEADER_MODE=disabled\n"
            "DEV_SEED_ADMIN=false\n"
            "SERVER_OFFHOST_BACKUP_ENABLED=true\n"
            "SERVER_OFFHOST_BACKUP_TRANSPORT=s3\n"
            "SERVER_OFFHOST_BACKUP_S3_ENDPOINT=https://hel1.your-objectstorage.com\n"
            "SERVER_OFFHOST_BACKUP_S3_REGION=hel1\n"
            "SERVER_OFFHOST_BACKUP_S3_BUCKET=ers\n"
            "SERVER_OFFHOST_BACKUP_S3_PREFIX=ers-backups\n"
            f"AWS_SHARED_CREDENTIALS_FILE={credentials}\n"
            "AWS_PROFILE=ers-backup\n"
        )
        manifest = temp / "recovery-access.env"
        text = MANIFEST.read_text()
        text = text.replace("/opt/EnterpriseRemoteSystems/production/.env.production", str(env_file))
        text = text.replace("/opt/EnterpriseRemoteSystems/production", str(env_dir))
        text = text.replace("/opt/EnterpriseRemoteSystems/secrets/aws-credentials", str(credentials))
        manifest.write_text(text)
        proc = run(
            [str(script)],
            env={
                "RECOVERY_ACCESS_ENVIRONMENT": "production",
                "RECOVERY_ACCESS_ENV_DIR": str(env_dir),
                "RECOVERY_ACCESS_ENV_FILE": ".env.production",
                "RECOVERY_ACCESS_MANIFEST_FILE": str(manifest),
            },
        )
        if proc.returncode != 0:
            raise AssertionError(f"owner-unavailable preflight should pass with explicit shared sources:\n{proc.stdout}")
        require(proc.stdout, ("Owner-unavailable recovery access preflight passed.", "lastpass-shared://ERS-Recovery/Production/.env.production"), "preflight output")

        bad = temp / "bad-recovery-access.env"
        bad.write_text(text.replace("lastpass-shared://ERS-Recovery/Production/.env.production", "personal-vault://owner/.env.production"))
        proc = run(
            [str(script)],
            env={
                "RECOVERY_ACCESS_ENVIRONMENT": "production",
                "RECOVERY_ACCESS_ENV_DIR": str(env_dir),
                "RECOVERY_ACCESS_ENV_FILE": ".env.production",
                "RECOVERY_ACCESS_MANIFEST_FILE": str(bad),
            },
        )
        if proc.returncode == 0 or "lastpass-shared://" not in proc.stdout:
            raise AssertionError(f"preflight must reject personal/vague secret sources:\n{proc.stdout}")


def test_backup_revision_evidence_contract() -> None:
    backup_go = (ROOT / "backend" / "internal" / "backup" / "backup.go").read_text()
    backup_cmd = (ROOT / "backend" / "cmd" / "ers-backup" / "main.go").read_text()
    backup_shell = (ROOT / "scripts" / "server-sqlite-backup.sh").read_text()
    gate = (ROOT / "scripts" / "server-migration-recovery-gate.sh").read_text()
    require(backup_go, ("type RepositoryMetadata struct", 'json:"repository,omitempty"', "repository revision and tree SHA must be supplied together"), "backup manifest")
    require(backup_cmd, ('fs.String("repository-revision"', 'fs.String("repository-tree-sha"'), "backup CLI")
    require(backup_shell, ("BACKUP_REPOSITORY_REVISION", "Compatible repository revision:", "--repository-revision"), "online backup revision evidence")
    require(gate, ("BACKUP_REPOSITORY_REVISION=\"$MIGRATION_PREVIOUS_REVISION\"", "--repository-tree-sha \"$MIGRATION_PREVIOUS_TREE_SHA\""), "migration backup revision evidence")


def test_owner_unavailable_rehearsal_contract() -> None:
    make = (ROOT / "Makefile").read_text()
    rehearsal = (ROOT / "scripts" / "server-recovery-rehearsal.sh").read_text()
    require(make, ("server-owner-unavailable-recovery-preflight:", "server-owner-unavailable-recovery-rehearsal:", "OWNER-UNAVAILABLE-RECOVERY-ACCESS-CONFIRMED", "owner-unavailable-recovery-readiness-check"), "Makefile")
    require(
        rehearsal,
        (
            "Owner-unavailable recovery rehearsal must run against ENV=production.",
            "Owner-unavailable recovery rehearsal must start from RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME only",
            "server-owner-unavailable-recovery-preflight.sh",
            "Compatible backup repository revision is unavailable after GitHub fetch",
            "compatible_revision_available",
            "owner_unavailable:",
            "shared_access_confirmed",
            "technician_id",
        ),
        "recovery rehearsal owner-unavailable mode",
    )


def test_runbook_and_initializer_contract() -> None:
    runbook = (ROOT / "docs" / "database-recovery-runbook.md").read_text()
    access = (ROOT / "docs" / "owner-unavailable-recovery-access.md").read_text()
    init_server = (ROOT / "scripts" / "init-server-env.sh").read_text()
    init_prod = (ROOT / "scripts" / "init-prod-env.sh").read_text()
    require(
        runbook,
        (
            "Owner-unavailable recovery contract",
            "ops/recovery-access.production.env",
            "lastpass-shared://ERS-Recovery/Production/.env.production",
            "lastpass-shared://ERS-Recovery/Production/Hetzner-S3-ers-backup",
            "server-owner-unavailable-recovery-preflight",
            "server-owner-unavailable-recovery-rehearsal",
            "OWNER-UNAVAILABLE-RECOVERY-ACCESS-CONFIRMED",
            ".repository.revision",
            "GitHub Actions secrets are not an authoritative recovery source",
            "If the technician has to contact the system owner, the owner-unavailable rehearsal fails.",
        ),
        "database recovery runbook",
    )
    if "normal administrative sources" in runbook:
        raise AssertionError("runbook still uses vague 'normal administrative sources' wording")
    require(access, ("ERS-Recovery", "Production/.env.production", "independent-mfa-and-recovery-codes", "No personal vault", "quarterly"), "owner-unavailable access guide")
    require(init_server, ("does NOT reconstruct the canonical Production recovery configuration", "ops/recovery-access.production.env"), "server env initializer warning")
    require(init_prod, ("does NOT reconstruct the canonical Production recovery configuration", "ops/recovery-access.production.env"), "legacy production env initializer warning")


def test_quality_gate_wiring() -> None:
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
    deploy = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
    for text, context in ((ci, "CI"), (deploy, "deployment quality gate")):
        if "make owner-unavailable-recovery-readiness-check" not in text:
            raise AssertionError(f"{context} missing owner-unavailable recovery readiness regression")
    require(deploy, ("make server-owner-unavailable-recovery-preflight ENV=production", "Owner-unavailable Production recovery access preflight"), "Production deployment preflight")


def main() -> int:
    test_committed_access_manifest()
    test_preflight_script_behavior()
    test_backup_revision_evidence_contract()
    test_owner_unavailable_rehearsal_contract()
    test_runbook_and_initializer_contract()
    test_quality_gate_wiring()
    print("Bite 33.6 owner-unavailable recovery readiness verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
