#!/usr/bin/env python3
"""Regression coverage for Bite 33.6 recovery rehearsal and operational runbook."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )


def ok(proc: subprocess.CompletedProcess[str], context: str) -> None:
    if proc.returncode != 0:
        raise AssertionError(f"{context} failed ({proc.returncode}):\n{proc.stdout}")


def require(text: str, fragments: tuple[str, ...], context: str) -> None:
    for fragment in fragments:
        if fragment not in text:
            raise AssertionError(f"{context} missing 33.6 contract fragment {fragment!r}")


def test_rehearsal_script_contract() -> None:
    script_path = ROOT / "scripts" / "server-recovery-rehearsal.sh"
    script = script_path.read_text()
    require(
        script,
        (
            "Exactly one recovery rehearsal source is required",
            "REHEARSAL_OFFHOST_BACKUP_NAME",
            "ers-offhost-backup materialize",
            "ers-restore stage",
            "ers-restore verify",
            "ers-restore apply",
            "Refusing recovery rehearsal while a migration/deployment recovery gate remains armed",
            "Rehearsing migrations in a volume-free, network-isolated container.",
            '"$isolated" migrate',
            '"$isolated" verify',
            '"$isolated" start',
            '"$isolated" inspect',
            '"$isolated" check-db',
            '"$isolated" stop',
            'scripts/ers-recovery-isolated-container.sh',
            'private_database_copies_disposed: true',
            'docker_effective_mounts_verified: true',
            "curl -fsS http://localhost:8080/healthz",
            "rpo_seconds",
            "rto_seconds",
            "objective_failed",
            "selected_backup_age_at_rehearsal_start",
            "rehearsal_start_to_isolated_backend_health_and_database_verification",
        ),
        "recovery rehearsal script",
    )
    helper = (ROOT / "scripts" / "ers-recovery-isolated-container.sh").read_text()
    require(helper, (
        'docker run --rm "${common[@]}"',
        '--network none --read-only',
        '--mount "type=bind,src=$workdir,dst=/rehearsal"',
        '--mount "type=bind,src=$bootdir,dst=/rehearsal-data"',
        'sqlite3 -bail /rehearsal-data/app.db',
        '.HostConfig.ReadonlyRootfs == true',
        '(.[0].Mounts | length) == 1',
    ), "isolated recovery container helper")
    ok(run(["bash", "-n", str(script_path)]), "recovery rehearsal shell syntax")
    ok(run(["bash", "-n", str(ROOT / "scripts" / "ers-recovery-isolated-container.sh")]), "isolated recovery helper syntax")


def test_make_and_workflow_contract() -> None:
    make = (ROOT / "Makefile").read_text()
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
    deploy = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
    require(
        make,
        (
            "server-recovery-rehearsal:",
            "RECOVERY_REHEARSAL_MAX_RPO_SECONDS ?= 86400",
            "RECOVERY_REHEARSAL_MAX_RTO_SECONDS ?= 14400",
            "RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME",
            "recovery-rehearsal-operational-runbook-check",
        ),
        "Makefile",
    )
    if "make recovery-rehearsal-operational-runbook-check" not in ci:
        raise AssertionError("CI missing Bite 33.6 regression")
    if "make recovery-rehearsal-operational-runbook-check" not in deploy:
        raise AssertionError("deployment quality gate missing Bite 33.6 regression")


def test_revision_recovery_evidence() -> None:
    gate = (ROOT / "scripts" / "server-migration-recovery-gate.sh").read_text()
    deploy = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
    make = (ROOT / "Makefile").read_text()
    require(
        gate,
        (
            "MIGRATION_PREVIOUS_REVISION",
            "MIGRATION_PREVIOUS_TREE_SHA",
            "MIGRATION_TARGET_REVISION",
            "MIGRATION_TARGET_TREE_SHA",
            'echo "previous_revision=$MIGRATION_PREVIOUS_REVISION"',
            'echo "target_revision=$MIGRATION_TARGET_REVISION"',
        ),
        "migration gate revision evidence",
    )
    require(
        make,
        (
            'MIGRATION_PREVIOUS_REVISION="$(MIGRATION_PREVIOUS_REVISION)"',
            'MIGRATION_TARGET_REVISION="$(MIGRATION_TARGET_REVISION)"',
        ),
        "Make migration revision passthrough",
    )
    require(
        deploy,
        (
            'PREVIOUS_REVISION=\\"\\$(git rev-parse HEAD)\\"',
            'PREVIOUS_TREE_SHA=\\"\\$(git rev-parse HEAD^{tree})\\"',
            'MIGRATION_PREVIOUS_REVISION=\\"\\$PREVIOUS_REVISION\\"',
            "MIGRATION_TARGET_REVISION='${{ steps.revision.outputs.sha }}'",
        ),
        "deployment revision recovery evidence",
    )


def test_runbook_contract() -> None:
    overview = (ROOT / "docs" / "bite-33-6-recovery-rehearsal-and-operational-runbook.md").read_text()
    runbook = (ROOT / "docs" / "database-recovery-runbook.md").read_text()
    require(
        overview,
        (
            "RPO <= 24 hours",
            "RTO <= 4 hours",
            "RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME",
            "offhost-backup-name",
            "isolated backend",
            "previous_revision=",
            "docs/database-recovery-runbook.md",
        ),
        "Bite 33.6 overview",
    )
    require(
        runbook,
        (
            "make server-recovery-rehearsal",
            "RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME",
            "make server-restore-materialize-offhost",
            "OFFHOST_BACKUP_NAME=app-<timestamp>.db",
            "RESTORE_CONFIRM=RESTORE-PRODUCTION",
            "make server-migration-recovery-rollback ENV=production",
            "previous_revision=",
            'git checkout --detach "$PREVIOUS_REVISION"',
            "make server-prod-build",
            "make server-prod-backend-health",
            "make server-prod-smoke",
            "rollback_failed",
            "RPO <= 24 hours",
            "RTO <= 4 hours",
            "Do not use an S3 `ETag` as a SHA-256 checksum.",
        ),
        "database recovery runbook",
    )
    if re.search(r"AWS Secret Access Key\s*[:=]\s*\S+", runbook, re.IGNORECASE):
        raise AssertionError("runbook appears to embed an AWS secret")


def test_existing_recovery_regressions_remain_wired() -> None:
    make = (ROOT / "Makefile").read_text()
    for fragment in (
        "production-environment-guardrails-check",
        "backup-creation-retention-verification-check",
        "off-host-backup-protection-check",
        "restore-tooling-recovery-verification-check",
        "migration-deployment-recovery-gate-check",
        "recovery-rehearsal-operational-runbook-check",
    ):
        if fragment not in make:
            raise AssertionError(f"local recovery quality chain missing {fragment!r}")


def main() -> int:
    test_rehearsal_script_contract()
    test_make_and_workflow_contract()
    test_revision_recovery_evidence()
    test_runbook_contract()
    test_existing_recovery_regressions_remain_wired()
    print("Bite 33.6 recovery rehearsal and operational runbook verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
