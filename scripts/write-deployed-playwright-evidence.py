#!/usr/bin/env python3
"""Write immutable, machine-readable evidence for a successful deployed Playwright run."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse

HEX40 = re.compile(r"^[0-9a-f]{40}$")
EXPECTED_HOSTS = {
    "development": "dev.enterpriseremotesystems.com",
    "test": "tst.enterpriseremotesystems.com",
}


def fail(message: str) -> None:
    print(f"deployed Playwright evidence error: {message}", file=sys.stderr)
    raise SystemExit(2)


def require_sha(name: str, value: str) -> str:
    value = value.strip().lower()
    if not HEX40.fullmatch(value):
        fail(f"{name} must be a 40-character lowercase Git SHA, got {value!r}")
    return value


def parse_bool(name: str, value: str) -> bool:
    if value == "true":
        return True
    if value == "false":
        return False
    fail(f"{name} must be 'true' or 'false', got {value!r}")


def validate_base_url(environment: str, base_url: str) -> str:
    parsed = urlparse(base_url)
    expected_host = EXPECTED_HOSTS[environment]
    if parsed.scheme != "https" or parsed.hostname != expected_host:
        fail(
            f"{environment} deployed Playwright must target https://{expected_host}, got {base_url!r}"
        )
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        fail(f"base URL must not contain credentials, query, or fragment: {base_url!r}")
    return f"https://{expected_host}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--environment", choices=sorted(EXPECTED_HOSTS), required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--tree-sha", required=True)
    parser.add_argument("--checked-out-revision", required=True)
    parser.add_argument("--checked-out-tree-sha", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--git-ref", required=True)
    parser.add_argument("--workflow", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-attempt", required=True)
    parser.add_argument("--test-release-rehearsal", required=True)
    parser.add_argument("--artifact-name", required=True)
    parser.add_argument("--report-artifact-name", required=True)
    parser.add_argument("--test-results-artifact-name", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    revision = require_sha("revision", args.revision)
    tree_sha = require_sha("tree SHA", args.tree_sha)
    checked_out_revision = require_sha("checked-out revision", args.checked_out_revision)
    checked_out_tree_sha = require_sha("checked-out tree SHA", args.checked_out_tree_sha)

    if checked_out_revision != revision:
        fail(
            f"checked-out revision {checked_out_revision} does not match deployed revision {revision}"
        )
    if checked_out_tree_sha != tree_sha:
        fail(
            f"checked-out tree {checked_out_tree_sha} does not match deployed tree {tree_sha}"
        )

    base_url = validate_base_url(args.environment, args.base_url)
    test_release_rehearsal = parse_bool(
        "test-release-rehearsal", args.test_release_rehearsal
    )
    if args.environment == "development" and test_release_rehearsal:
        fail("Development evidence cannot be marked as a Test release rehearsal")

    for name, value in (
        ("repository", args.repository),
        ("git-ref", args.git_ref),
        ("workflow", args.workflow),
        ("run-id", args.run_id),
        ("run-attempt", args.run_attempt),
        ("artifact-name", args.artifact_name),
        ("report-artifact-name", args.report_artifact_name),
        ("test-results-artifact-name", args.test_results_artifact_name),
    ):
        if not value.strip() or "\n" in value or "\r" in value:
            fail(f"{name} must be a non-empty single-line value")

    record = {
        "schemaVersion": 1,
        "bite": "30L.4B",
        "verificationKind": "deployed-playwright",
        "status": "passed",
        "environment": args.environment,
        "baseUrl": base_url,
        "source": {
            "revision": revision,
            "treeSha": tree_sha,
            "checkedOutRevision": checked_out_revision,
            "checkedOutTreeSha": checked_out_tree_sha,
        },
        "playwright": {
            "command": "npx playwright test",
            "testDirectory": "frontend/tests/e2e",
            "authMode": "session",
            "webServerSkipped": True,
        },
        "testReleaseRehearsal": test_release_rehearsal,
        "workflow": {
            "repository": args.repository,
            "gitRef": args.git_ref,
            "name": args.workflow,
            "runId": args.run_id,
            "runAttempt": args.run_attempt,
            "runUrl": f"https://github.com/{args.repository}/actions/runs/{args.run_id}",
        },
        "artifacts": {
            "evidence": args.artifact_name,
            "playwrightReport": args.report_artifact_name,
            "testResults": args.test_results_artifact_name,
        },
        "verifiedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    temporary.replace(args.output)
    print(f"Wrote deployed Playwright evidence: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
