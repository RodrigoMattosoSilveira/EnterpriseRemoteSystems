#!/usr/bin/env python3
"""Write immutable Bite 30L.4C Production release-gate evidence."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def fail(message: str) -> None:
    print(f"Production release evidence generation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_sha(name: str, value: str) -> str:
    if not SHA_RE.fullmatch(value):
        fail(f"{name} must be a lowercase 40-character Git SHA, got {value!r}")
    return value


def require_single_line(name: str, value: str) -> str:
    if not value.strip() or "\n" in value or "\r" in value:
        fail(f"{name} must be a non-empty single-line value")
    return value


def validate_base_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.netloc != "app.enterpriseremotesystems.com" or parsed.path not in ("", "/"):
        fail(f"Production base URL must be https://app.enterpriseremotesystems.com, got {value!r}")
    return "https://app.enterpriseremotesystems.com"


def load_test_evidence(path: Path, expected_tree: str) -> dict:
    try:
        record = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read normalized Test release evidence {path}: {exc}")
    if record.get("verificationKind") != "test-release-rehearsal" or record.get("status") != "passed":
        fail("normalized Test release evidence must be a passed test-release-rehearsal record")
    if record.get("treeSha") != expected_tree:
        fail(
            f"Test evidence tree {record.get('treeSha')!r} does not match Production tree {expected_tree}"
        )
    deployed = record.get("deployedPlaywrightEvidence") or {}
    if not SHA256_RE.fullmatch(str(deployed.get("sha256", ""))):
        fail("normalized Test evidence has an invalid deployed Playwright SHA-256")
    if not deployed.get("artifact"):
        fail("normalized Test evidence has no deployed Playwright artifact")
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--tree-sha", required=True)
    parser.add_argument("--server-revision", required=True)
    parser.add_argument("--server-tree-sha", required=True)
    parser.add_argument("--test-release-evidence", type=Path, required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--git-ref", required=True)
    parser.add_argument("--workflow", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-attempt", required=True)
    parser.add_argument("--artifact-name", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    revision = require_sha("Production revision", args.revision)
    tree_sha = require_sha("Production tree SHA", args.tree_sha)
    server_revision = require_sha("Production server revision", args.server_revision)
    server_tree = require_sha("Production server tree SHA", args.server_tree_sha)
    if server_revision != revision:
        fail(f"Production server revision {server_revision} does not match deployed revision {revision}")
    if server_tree != tree_sha:
        fail(f"Production server tree {server_tree} does not match deployed tree {tree_sha}")

    base_url = validate_base_url(args.base_url)
    test_evidence = load_test_evidence(args.test_release_evidence, tree_sha)

    for name, value in (
        ("repository", args.repository),
        ("git-ref", args.git_ref),
        ("workflow", args.workflow),
        ("run-id", args.run_id),
        ("run-attempt", args.run_attempt),
        ("artifact-name", args.artifact_name),
    ):
        require_single_line(name, value)

    expected_artifact_prefix = f"production-release-gate-evidence-{revision}-{tree_sha}-"
    if not args.artifact_name.startswith(expected_artifact_prefix):
        fail(
            "Production evidence artifact name must be bound to the exact Production revision/tree; "
            f"got {args.artifact_name!r}"
        )

    record = {
        "schemaVersion": 1,
        "bite": "30L.4C",
        "verificationKind": "production-release-gate",
        "status": "passed",
        "environment": "production",
        "baseUrl": base_url,
        "source": {
            "revision": revision,
            "treeSha": tree_sha,
            "serverRevision": server_revision,
            "serverTreeSha": server_tree,
        },
        "requiredTestEvidence": test_evidence,
        "deploymentVerification": {
            "databaseStrategy": "migrate-in-place",
            "backendHealth": "passed",
            "migratedDatabaseVerification": "passed",
            "internalCaddyHealth": "passed",
            "edgeDeployment": "passed",
            "publicSmoke": {
                "command": "make server-prod-smoke",
                "status": "passed",
            },
        },
        "workflow": {
            "repository": args.repository,
            "gitRef": args.git_ref,
            "name": args.workflow,
            "runId": args.run_id,
            "runAttempt": args.run_attempt,
            "runUrl": f"https://github.com/{args.repository}/actions/runs/{args.run_id}",
        },
        "artifacts": {
            "productionReleaseEvidence": args.artifact_name,
            "requiredTestPlaywrightEvidence": test_evidence["deployedPlaywrightEvidence"]["artifact"],
        },
        "verifiedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    temporary.replace(args.output)
    print(f"Wrote Production release-gate evidence: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
