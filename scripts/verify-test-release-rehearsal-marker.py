#!/usr/bin/env python3
"""Verify the Test release-rehearsal marker consumed by the 30L.4C Production gate."""

from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import sys

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def fail(message: str) -> None:
    print(f"Test release-rehearsal evidence check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_sha(name: str, value: str) -> str:
    if not SHA_RE.fullmatch(value):
        fail(f"{name} must be a lowercase 40-character Git SHA, got {value!r}")
    return value


def parse_marker(path: Path) -> dict[str, str]:
    if not path.is_file():
        fail(f"marker does not exist: {path}")
    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(path.read_text().splitlines(), start=1):
        if not raw_line.strip():
            continue
        if "=" not in raw_line:
            fail(f"marker line {line_number} is not key=value: {raw_line!r}")
        key, value = raw_line.split("=", 1)
        if not key or key in values:
            fail(f"marker contains invalid or duplicate key {key!r}")
        values[key] = value
    return values


def require_value(values: dict[str, str], key: str) -> str:
    value = values.get(key, "")
    if not value:
        fail(f"marker is missing required field {key}")
    return value


def parse_utc(name: str, value: str) -> str:
    if not value.endswith("Z"):
        fail(f"{name} must be a UTC timestamp ending in Z, got {value!r}")
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        fail(f"{name} is not a valid ISO-8601 UTC timestamp: {exc}")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--expected-tree-sha", required=True)
    parser.add_argument("--expected-baseline-last-migration", required=True)
    parser.add_argument("--expected-first-rehearsed-migration", required=True)
    parser.add_argument("--expected-final-migration", required=True)
    parser.add_argument("--expected-deployment-final-migration", required=True)
    parser.add_argument("--normalized-output", type=Path)
    args = parser.parse_args()

    expected_tree = require_sha("expected tree SHA", args.expected_tree_sha)
    values = parse_marker(args.file)

    tree_sha = require_sha("marker tree SHA", require_value(values, "tree_sha"))
    if tree_sha != expected_tree:
        fail(f"marker tree {tree_sha} does not match Production source tree {expected_tree}")

    revision = require_sha("Test revision", require_value(values, "revision"))
    evidence_sha256 = require_value(values, "deployed_playwright_evidence_sha256")
    if not SHA256_RE.fullmatch(evidence_sha256):
        fail("deployed_playwright_evidence_sha256 must be a lowercase SHA-256 digest")

    evidence_artifact = require_value(values, "deployed_playwright_evidence_artifact")
    artifact_match = re.fullmatch(
        rf"deployed-playwright-evidence-test-{revision}-{tree_sha}-([0-9]+)-([0-9]+)",
        evidence_artifact,
    )
    if not artifact_match:
        fail(
            "deployed Playwright evidence artifact is not bound to the marker's exact "
            f"Test revision/tree: {evidence_artifact!r}"
        )

    baseline = require_value(values, "baseline")
    baseline_sha256 = require_value(values, "baseline_sha256")
    if not SHA256_RE.fullmatch(baseline_sha256):
        fail("baseline_sha256 must be a lowercase SHA-256 digest")

    expected_migrations = {
        "baseline_last_migration": args.expected_baseline_last_migration,
        "migration_under_rehearsal": args.expected_first_rehearsed_migration,
        "final_migration": args.expected_final_migration,
        "deployment_final_migration": args.expected_deployment_final_migration,
    }
    for key, expected in expected_migrations.items():
        actual = require_value(values, key)
        if actual != expected:
            fail(f"{key} is {actual!r}; expected {expected!r}")

    passed_at = parse_utc("passed_at", require_value(values, "passed_at"))

    normalized = {
        "schemaVersion": 1,
        "verificationKind": "test-release-rehearsal",
        "status": "passed",
        "treeSha": tree_sha,
        "testRevision": revision,
        "deployedPlaywrightEvidence": {
            "artifact": evidence_artifact,
            "sha256": evidence_sha256,
            "workflowRunId": artifact_match.group(1),
            "workflowRunAttempt": artifact_match.group(2),
        },
        "migrationRehearsal": {
            "baseline": baseline,
            "baselineSha256": baseline_sha256,
            "baselineLastMigration": expected_migrations["baseline_last_migration"],
            "firstRehearsedMigration": expected_migrations["migration_under_rehearsal"],
            "finalMigration": expected_migrations["final_migration"],
            "deploymentFinalMigration": expected_migrations["deployment_final_migration"],
        },
        "passedAt": passed_at,
    }

    if args.normalized_output:
        args.normalized_output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.normalized_output.with_suffix(args.normalized_output.suffix + ".tmp")
        temporary.write_text(json.dumps(normalized, indent=2, sort_keys=True) + "\n")
        temporary.replace(args.normalized_output)

    print(
        "Test release-rehearsal evidence verified: "
        f"tree={tree_sha} test_revision={revision} artifact={evidence_artifact}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
