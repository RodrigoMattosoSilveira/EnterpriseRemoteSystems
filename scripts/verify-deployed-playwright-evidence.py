#!/usr/bin/env python3
"""Verify Bite 30L.4B deployed Playwright evidence against an exact source identity."""

from __future__ import annotations

import argparse
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
    print(f"deployed Playwright evidence verification failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_sha(name: str, value: object) -> str:
    if not isinstance(value, str) or not HEX40.fullmatch(value):
        fail(f"{name} is not a 40-character lowercase Git SHA: {value!r}")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--expected-environment", choices=sorted(EXPECTED_HOSTS), required=True)
    parser.add_argument("--expected-revision", required=True)
    parser.add_argument("--expected-tree-sha", required=True)
    parser.add_argument("--expected-artifact-name")
    args = parser.parse_args()

    if not args.file.is_file():
        fail(f"missing evidence file {args.file}")
    try:
        record = json.loads(args.file.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read evidence JSON: {exc}")

    if record.get("schemaVersion") != 1:
        fail(f"unsupported schemaVersion {record.get('schemaVersion')!r}")
    if record.get("bite") != "30L.4B":
        fail(f"unexpected bite {record.get('bite')!r}")
    if record.get("verificationKind") != "deployed-playwright":
        fail(f"unexpected verificationKind {record.get('verificationKind')!r}")
    if record.get("status") != "passed":
        fail(f"evidence does not record a passed run: {record.get('status')!r}")
    if record.get("environment") != args.expected_environment:
        fail(
            f"environment {record.get('environment')!r} does not match expected {args.expected_environment!r}"
        )

    source = record.get("source")
    if not isinstance(source, dict):
        fail("source object is missing")
    revision = require_sha("source.revision", source.get("revision"))
    tree_sha = require_sha("source.treeSha", source.get("treeSha"))
    checked_revision = require_sha(
        "source.checkedOutRevision", source.get("checkedOutRevision")
    )
    checked_tree = require_sha(
        "source.checkedOutTreeSha", source.get("checkedOutTreeSha")
    )
    expected_revision = args.expected_revision.lower()
    expected_tree = args.expected_tree_sha.lower()
    if revision != expected_revision or checked_revision != expected_revision:
        fail(
            f"revision evidence {revision}/{checked_revision} does not match expected {expected_revision}"
        )
    if tree_sha != expected_tree or checked_tree != expected_tree:
        fail(
            f"tree evidence {tree_sha}/{checked_tree} does not match expected {expected_tree}"
        )

    expected_host = EXPECTED_HOSTS[args.expected_environment]
    parsed = urlparse(record.get("baseUrl", ""))
    if parsed.scheme != "https" or parsed.hostname != expected_host:
        fail(f"baseUrl does not identify the expected deployed environment: {record.get('baseUrl')!r}")

    playwright = record.get("playwright")
    if not isinstance(playwright, dict) or playwright.get("command") != "npx playwright test":
        fail("Playwright command evidence is missing")
    if playwright.get("authMode") != "session" or playwright.get("webServerSkipped") is not True:
        fail("deployed Playwright runtime evidence is incomplete")

    workflow = record.get("workflow")
    if not isinstance(workflow, dict):
        fail("workflow evidence is missing")
    for key in ("repository", "gitRef", "name", "runId", "runAttempt", "runUrl"):
        if not isinstance(workflow.get(key), str) or not workflow[key].strip():
            fail(f"workflow.{key} is missing")

    artifacts = record.get("artifacts")
    if not isinstance(artifacts, dict):
        fail("artifact evidence is missing")
    for key in ("evidence", "playwrightReport", "testResults"):
        if not isinstance(artifacts.get(key), str) or not artifacts[key].strip():
            fail(f"artifacts.{key} is missing")
    if args.expected_artifact_name and artifacts["evidence"] != args.expected_artifact_name:
        fail(
            f"evidence artifact {artifacts['evidence']!r} does not match expected {args.expected_artifact_name!r}"
        )

    verified_at = record.get("verifiedAt")
    if not isinstance(verified_at, str) or not verified_at.endswith("Z"):
        fail("verifiedAt must be a UTC timestamp")

    print(
        "Deployed Playwright evidence verified: "
        f"environment={args.expected_environment} revision={revision} tree={tree_sha}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
