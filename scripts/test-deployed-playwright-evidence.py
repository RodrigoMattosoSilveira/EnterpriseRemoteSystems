#!/usr/bin/env python3
"""Local regression checks for Bite 30L.4B evidence generation and verification."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
WRITER = ROOT / "scripts" / "write-deployed-playwright-evidence.py"
VERIFIER = ROOT / "scripts" / "verify-deployed-playwright-evidence.py"
REVISION = "1" * 40
TREE_SHA = "2" * 40
OTHER_TREE = "3" * 40


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


def writer_args(output: Path, *, environment: str = "test", checked_tree: str = TREE_SHA) -> list[str]:
    base_url = (
        "https://tst.enterpriseremotesystems.com"
        if environment == "test"
        else "https://dev.enterpriseremotesystems.com"
    )
    artifact = f"deployed-playwright-evidence-{environment}-{REVISION}-{TREE_SHA}-123-1"
    return [
        str(WRITER),
        "--environment", environment,
        "--base-url", base_url,
        "--revision", REVISION,
        "--tree-sha", TREE_SHA,
        "--checked-out-revision", REVISION,
        "--checked-out-tree-sha", checked_tree,
        "--repository", "example/ers",
        "--git-ref", f"refs/heads/{environment}",
        "--workflow", "Deploy Enterprise Remote Systems",
        "--run-id", "123",
        "--run-attempt", "1",
        "--test-release-rehearsal", "true" if environment == "test" else "false",
        "--artifact-name", artifact,
        "--report-artifact-name", f"deployed-playwright-report-{environment}-{REVISION}-123-1",
        "--test-results-artifact-name", f"deployed-playwright-test-results-{environment}-{REVISION}-123-1",
        "--output", str(output),
    ]


def main() -> int:
    workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
    makefile = (ROOT / "Makefile").read_text()
    required_workflow_markers = [
        "30L.4B requires deployed Playwright verification evidence for Development and Test.",
        'test "${CHECKED_OUT_TREE_SHA}" = "${DEPLOYED_TREE_SHA}"',
        "Generate immutable deployed Playwright evidence",
        "scripts/write-deployed-playwright-evidence.py",
        "scripts/verify-deployed-playwright-evidence.py",
        "overwrite: false",
        "PLAYWRIGHT_EVIDENCE_SHA256='${{ needs.deployed-playwright.outputs.evidence_sha256 }}'",
    ]
    for marker in required_workflow_markers:
        if marker not in workflow:
            raise AssertionError(f"deployment workflow is missing 30L.4B contract marker: {marker}")
    for marker in (
        "deployed_playwright_evidence_sha256=$(PLAYWRIGHT_EVIDENCE_SHA256)",
        "deployed_playwright_evidence_artifact=$(PLAYWRIGHT_EVIDENCE_ARTIFACT)",
    ):
        if marker not in makefile:
            raise AssertionError(f"Test release-rehearsal marker is missing deployed evidence field: {marker}")

    with tempfile.TemporaryDirectory() as temporary_directory:
        output = Path(temporary_directory) / "evidence.json"
        run(*writer_args(output))
        record = json.loads(output.read_text())
        assert record["status"] == "passed"
        assert record["source"]["revision"] == REVISION
        assert record["source"]["treeSha"] == TREE_SHA
        artifact = record["artifacts"]["evidence"]

        run(
            str(VERIFIER),
            "--file", str(output),
            "--expected-environment", "test",
            "--expected-revision", REVISION,
            "--expected-tree-sha", TREE_SHA,
            "--expected-artifact-name", artifact,
        )

        run(*writer_args(output, checked_tree=OTHER_TREE), expect_success=False)

        run(
            str(VERIFIER),
            "--file", str(output),
            "--expected-environment", "test",
            "--expected-revision", REVISION,
            "--expected-tree-sha", OTHER_TREE,
            expect_success=False,
        )

        development_output = Path(temporary_directory) / "development.json"
        run(*writer_args(development_output, environment="development"))
        run(
            str(VERIFIER),
            "--file", str(development_output),
            "--expected-environment", "development",
            "--expected-revision", REVISION,
            "--expected-tree-sha", TREE_SHA,
        )

    print("Deployed Playwright evidence checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
