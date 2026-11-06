#!/usr/bin/env python3
"""Fail closed when the deployed full-schema migration pin lags its repository.

The Test release-rehearsal baseline intentionally stops at an older migration;
this check applies ONLY to DEPLOYMENT_FINAL_MIGRATION, not to that historical
Test baseline or legacy restoration fixtures.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAKEFILE = ROOT / "Makefile"
MIGRATIONS_DIR = ROOT / "backend" / "migrations"
PIN = re.compile(r"(?m)^DEPLOYMENT_FINAL_MIGRATION\s*\?=\s*(\S+)\s*$")


def check_head_contract(make_text: str, migrations: list[str]) -> str:
    pins = PIN.findall(make_text)
    if len(pins) != 1:
        raise AssertionError("Makefile must define exactly one DEPLOYMENT_FINAL_MIGRATION pin")
    if not migrations:
        raise AssertionError("No .up.sql migrations in the repository")
    pin = pins[0]
    if pin != migrations[-1]:
        raise AssertionError(
            f"Deployment migration head mismatch: pinned={pin}; "
            f"repository_latest={migrations[-1]}. "
            "Update the release contract before deploying; never trim database history."
        )
    return pin


def test_contract_regression() -> None:
    fixture = "DEPLOYMENT_FINAL_MIGRATION ?= 000079_work_attribution_evidence.up.sql\n"
    assert check_head_contract(fixture, ["000077_old.up.sql", "000079_work_attribution_evidence.up.sql"]) == "000079_work_attribution_evidence.up.sql"
    for invalid_make, migrations in (
        ("DEPLOYMENT_FINAL_MIGRATION ?= 000077_old.up.sql\n", ["000077_old.up.sql", "000079_work_attribution_evidence.up.sql"]),
        (fixture, ["000077_old.up.sql", "000079_work_attribution_evidence.up.sql", "000080_future.up.sql"]),
        ("", ["000079_work_attribution_evidence.up.sql"]),
        (fixture + fixture, ["000079_work_attribution_evidence.up.sql"]),
    ):
        try:
            check_head_contract(invalid_make, migrations)
        except AssertionError:
            pass
        else:
            raise AssertionError("Migration-head regression fixture unexpectedly passed")


def main() -> None:
    test_contract_regression()
    make_text = MAKEFILE.read_text()
    migrations = sorted(path.name for path in MIGRATIONS_DIR.glob("*.up.sql") if path.is_file())
    head = check_head_contract(make_text, migrations)
    for required in (
        '-e EXPECTED_FINAL_MIGRATION="$(DEPLOYMENT_FINAL_MIGRATION)"',
        'MIGRATION_EXPECTED_FINAL_MIGRATION="$(DEPLOYMENT_FINAL_MIGRATION)"',
        'REHEARSAL_EXPECTED_FINAL_MIGRATION="$(DEPLOYMENT_FINAL_MIGRATION)"',
    ):
        if required not in make_text:
            raise AssertionError(f"Deployment migration head is not propagated: {required}")
    for script_name in ("server-migration-recovery-gate.sh", "server-migration-recovery-commit.sh"):
        script = (ROOT / "scripts" / script_name).read_text()
        default = f'MIGRATION_EXPECTED_FINAL_MIGRATION="${{MIGRATION_EXPECTED_FINAL_MIGRATION:-{head}}}"'
        if default not in script:
            raise AssertionError(f"Stale standalone recovery default in {script_name}")
    verifier = (ROOT / "backend" / "verify-migrated-db.sh").read_text()
    if 'if [ "$actual_list" != "$expected_list" ]; then' not in verifier:
        raise AssertionError("Deployment verifier lost its strict exact-history comparison")
    workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
    if "make deployment-migration-head-check" not in workflow:
        raise AssertionError("Deployment quality gate does not run the migration-head check")
    print(f"Deployment migration-head contract PASS: {head}; {len(migrations)} repository migrations.")


if __name__ == "__main__":
    main()
