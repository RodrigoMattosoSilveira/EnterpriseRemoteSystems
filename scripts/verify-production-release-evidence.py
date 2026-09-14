#!/usr/bin/env python3
"""Verify immutable Bite 30L.4C Production release-gate evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def fail(message: str) -> None:
    print(f"Production release evidence check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--expected-revision", required=True)
    parser.add_argument("--expected-tree-sha", required=True)
    parser.add_argument("--expected-artifact-name", required=True)
    args = parser.parse_args()

    if not SHA_RE.fullmatch(args.expected_revision):
        fail("expected revision must be a lowercase 40-character Git SHA")
    if not SHA_RE.fullmatch(args.expected_tree_sha):
        fail("expected tree SHA must be a lowercase 40-character Git SHA")

    try:
        record = json.loads(args.file.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read evidence JSON: {exc}")

    if record.get("schemaVersion") != 1:
        fail("schemaVersion must be 1")
    if record.get("bite") != "30L.4C":
        fail("bite must be 30L.4C")
    if record.get("verificationKind") != "production-release-gate":
        fail("verificationKind must be production-release-gate")
    if record.get("status") != "passed":
        fail("status must be passed")
    if record.get("environment") != "production":
        fail("environment must be production")
    if record.get("baseUrl") != "https://app.enterpriseremotesystems.com":
        fail("baseUrl must be the canonical Production HTTPS URL")

    source = record.get("source") or {}
    for key in ("revision", "serverRevision"):
        if source.get(key) != args.expected_revision:
            fail(f"source.{key} does not match expected Production revision")
    for key in ("treeSha", "serverTreeSha"):
        if source.get(key) != args.expected_tree_sha:
            fail(f"source.{key} does not match expected Production tree SHA")

    test_evidence = record.get("requiredTestEvidence") or {}
    if test_evidence.get("verificationKind") != "test-release-rehearsal" or test_evidence.get("status") != "passed":
        fail("requiredTestEvidence must be a passed Test release rehearsal")
    if test_evidence.get("treeSha") != args.expected_tree_sha:
        fail("required Test release evidence does not match the Production source tree")
    test_revision = str(test_evidence.get("testRevision", ""))
    if not SHA_RE.fullmatch(test_revision):
        fail("required Test revision is invalid")
    deployed = test_evidence.get("deployedPlaywrightEvidence") or {}
    if not SHA256_RE.fullmatch(str(deployed.get("sha256", ""))):
        fail("required Test deployed Playwright evidence SHA-256 is invalid")
    expected_test_prefix = f"deployed-playwright-evidence-test-{test_revision}-{args.expected_tree_sha}-"
    if not str(deployed.get("artifact", "")).startswith(expected_test_prefix):
        fail("required Test deployed Playwright artifact is not bound to the Test revision/Production tree")

    deployment = record.get("deploymentVerification") or {}
    expected_passes = {
        "databaseStrategy": "migrate-in-place",
        "backendHealth": "passed",
        "migratedDatabaseVerification": "passed",
        "internalCaddyHealth": "passed",
        "edgeDeployment": "passed",
    }
    for key, expected in expected_passes.items():
        if deployment.get(key) != expected:
            fail(f"deploymentVerification.{key} must be {expected!r}")
    smoke = deployment.get("publicSmoke") or {}
    if smoke.get("command") != "make server-prod-smoke" or smoke.get("status") != "passed":
        fail("Production public smoke evidence is incomplete")

    artifacts = record.get("artifacts") or {}
    if artifacts.get("productionReleaseEvidence") != args.expected_artifact_name:
        fail("Production evidence artifact name does not match the expected immutable artifact")
    if artifacts.get("requiredTestPlaywrightEvidence") != deployed.get("artifact"):
        fail("Production record does not preserve the exact required Test evidence artifact")

    workflow = record.get("workflow") or {}
    for key in ("repository", "gitRef", "name", "runId", "runAttempt", "runUrl"):
        if not str(workflow.get(key, "")).strip():
            fail(f"workflow.{key} must be populated")

    if not str(record.get("verifiedAt", "")).endswith("Z"):
        fail("verifiedAt must be a UTC timestamp ending in Z")

    print(
        "Production release-gate evidence verified: "
        f"revision={args.expected_revision} tree={args.expected_tree_sha} "
        f"test_artifact={deployed.get('artifact')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
