#!/usr/bin/env python3
"""Local regression checks for Bite 30L.4C Production release evidence."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MARKER_VERIFIER = ROOT / "scripts" / "verify-test-release-rehearsal-marker.py"
WRITER = ROOT / "scripts" / "write-production-release-evidence.py"
VERIFIER = ROOT / "scripts" / "verify-production-release-evidence.py"
REVISION = "a" * 40
TEST_REVISION = "b" * 40
TREE_SHA = "c" * 40
OTHER_TREE = "d" * 40
EVIDENCE_SHA = "e" * 64
BASELINE_SHA = "f" * 64

BASELINE_LAST = "000062_tenant_administrator_cardinality.up.sql"
FIRST_REHEARSED = "000063_global_administration_control_plane.up.sql"
FINAL_MIGRATION = "000070_revoke_noncanonical_application_admin_grants.up.sql"


def run(*args: str, expect_success: bool = True) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        [sys.executable, *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if expect_success and completed.returncode != 0:
        raise AssertionError(
            f"command failed ({completed.returncode}): {' '.join(args)}\n"
            f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    if not expect_success and completed.returncode == 0:
        raise AssertionError(f"command unexpectedly succeeded: {' '.join(args)}")
    return completed


def write_marker(path: Path, *, tree: str = TREE_SHA, artifact: str | None = None) -> None:
    artifact = artifact or f"deployed-playwright-evidence-test-{TEST_REVISION}-{tree}-12345-2"
    path.write_text(
        "\n".join(
            [
                f"tree_sha={tree}",
                f"revision={TEST_REVISION}",
                f"deployed_playwright_evidence_sha256={EVIDENCE_SHA}",
                f"deployed_playwright_evidence_artifact={artifact}",
                "baseline=/opt/EnterpriseRemoteSystems/test/rehearsal-baselines/pre-bite30i.db",
                f"baseline_sha256={BASELINE_SHA}",
                f"baseline_last_migration={BASELINE_LAST}",
                f"migration_under_rehearsal={FIRST_REHEARSED}",
                f"final_migration={FINAL_MIGRATION}",
                f"deployment_final_migration={FINAL_MIGRATION}",
                "passed_at=2026-09-13T23:59:59Z",
            ]
        )
        + "\n"
    )


def marker_args(marker: Path, normalized: Path, *, tree: str = TREE_SHA) -> list[str]:
    return [
        str(MARKER_VERIFIER),
        "--file", str(marker),
        "--expected-tree-sha", tree,
        "--expected-baseline-last-migration", BASELINE_LAST,
        "--expected-first-rehearsed-migration", FIRST_REHEARSED,
        "--expected-final-migration", FINAL_MIGRATION,
        "--expected-deployment-final-migration", FINAL_MIGRATION,
        "--normalized-output", str(normalized),
    ]


def writer_args(test_json: Path, output: Path, *, server_tree: str = TREE_SHA) -> list[str]:
    artifact = f"production-release-gate-evidence-{REVISION}-{TREE_SHA}-67890-3"
    return [
        str(WRITER),
        "--base-url", "https://app.enterpriseremotesystems.com",
        "--revision", REVISION,
        "--tree-sha", TREE_SHA,
        "--server-revision", REVISION,
        "--server-tree-sha", server_tree,
        "--test-release-evidence", str(test_json),
        "--repository", "example/ers",
        "--git-ref", "refs/heads/production",
        "--workflow", "Deploy Enterprise Remote Systems",
        "--run-id", "67890",
        "--run-attempt", "3",
        "--artifact-name", artifact,
        "--output", str(output),
    ]


def main() -> int:
    workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
    makefile = (ROOT / "Makefile").read_text()
    manifest = json.loads((ROOT / "docs" / "bite-30l4-coverage-manifest.json").read_text())

    for marker in (
        "Capture required Test release evidence for Production",
        "Generate immutable Production release-gate evidence",
        "Upload immutable Production release-gate evidence",
        "scripts/verify-test-release-rehearsal-marker.py",
        "scripts/write-production-release-evidence.py",
        "scripts/verify-production-release-evidence.py",
        "production-release-gate-evidence-",
    ):
        if marker not in workflow:
            raise AssertionError(f"deployment workflow is missing 30L.4C contract marker: {marker}")

    for marker in (
        "verify-test-release-rehearsal-marker.py",
        "production-release-evidence-check",
        "verify-bite30l4-coverage-manifest.py --require-complete",
    ):
        if marker not in makefile:
            raise AssertionError(f"Makefile is missing 30L.4C contract marker: {marker}")

    requirement_13 = next(item for item in manifest["requirements"] if item["id"] == 13)
    if requirement_13["status"] != "covered":
        raise AssertionError("coverage manifest requirement 13 must be covered in 30L.4C")

    with tempfile.TemporaryDirectory() as temporary_directory:
        temp = Path(temporary_directory)
        marker = temp / "test-release.passed"
        normalized = temp / "test-release.json"
        production = temp / "production-release.json"

        write_marker(marker)
        run(*marker_args(marker, normalized))
        normalized_record = json.loads(normalized.read_text())
        assert normalized_record["treeSha"] == TREE_SHA
        assert normalized_record["deployedPlaywrightEvidence"]["sha256"] == EVIDENCE_SHA

        run(*writer_args(normalized, production))
        production_record = json.loads(production.read_text())
        artifact = production_record["artifacts"]["productionReleaseEvidence"]
        assert production_record["requiredTestEvidence"]["treeSha"] == TREE_SHA
        assert production_record["deploymentVerification"]["publicSmoke"]["status"] == "passed"

        run(
            str(VERIFIER),
            "--file", str(production),
            "--expected-revision", REVISION,
            "--expected-tree-sha", TREE_SHA,
            "--expected-artifact-name", artifact,
        )

        # Production must reject Test evidence for any other source tree.
        wrong_marker = temp / "wrong-tree.passed"
        write_marker(wrong_marker, tree=OTHER_TREE)
        run(*marker_args(wrong_marker, temp / "wrong-tree.json"), expect_success=False)

        # Artifact identity must encode the exact Test revision and Production tree.
        bad_artifact_marker = temp / "bad-artifact.passed"
        write_marker(bad_artifact_marker, artifact="deployed-playwright-evidence-test-wrong")
        run(*marker_args(bad_artifact_marker, temp / "bad-artifact.json"), expect_success=False)

        # Production evidence must prove the deployed server is on the same tree.
        run(*writer_args(normalized, temp / "wrong-server.json", server_tree=OTHER_TREE), expect_success=False)

        # Final verifier must reject a wrong expected Production tree.
        run(
            str(VERIFIER),
            "--file", str(production),
            "--expected-revision", REVISION,
            "--expected-tree-sha", OTHER_TREE,
            "--expected-artifact-name", artifact,
            expect_success=False,
        )

    print("Production release-gate evidence checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
