#!/usr/bin/env python3
"""Verify the immutable post-Bite-30 backlog-reconciliation snapshot.

The reconciliation is intentionally offline: local/CI verification must not depend on
GitHub availability. The manifest captures the GitHub-open issue set observed for
issue #853 and ties every classification to evidence in the Bite 30 Production tree.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs" / "post-bite-30-backlog-reconciliation.json"
README = ROOT / "docs" / "post-bite-30-backlog-reconciliation.md"

EXPECTED_RECONCILIATION_ISSUE = 853
EXPECTED_PRODUCTION_COMMIT = "e994c976d116cdd27cac0d9b2de95ef913d10983"
EXPECTED_PRODUCTION_TREE = "7e5c70f986960e719174ce05aede8570a555ef65"
EXPECTED_SOURCE_COMMIT = "f53c5fbcb73501db837d031d03c0648ac7a97b25"
EXPECTED_FINAL_MIGRATION = "000070_revoke_noncanonical_application_admin_grants.up.sql"
EXPECTED_ISSUES = [
    5,
    9,
    11,
    15,
    16,
    17,
    19,
    20,
    22,
    26,
    28,
    59,
    60,
    63,
    69,
    128,
    130,
    151,
    181,
    291,
    304,
    409,
    621,
    622,
    623,
    624,
    625,
    838,
    840,
    841,
    842,
    843,
    844,
]
EXPECTED_STATUSES = [
    "DONE",
    "PARTIALLY DONE",
    "OPEN",
    "OBSOLETE",
    "SUPERSEDED BY BITE 30",
]
ALLOWED_DISPOSITIONS = {"close-completed", "close-not-planned", "keep-open"}


def fail(message: str) -> None:
    print(f"Post-Bite-30 backlog reconciliation check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_equal(actual: object, expected: object, label: str) -> None:
    if actual != expected:
        fail(f"{label} must be {expected!r}, got {actual!r}")


def main() -> int:
    if not MANIFEST.is_file():
        fail(f"missing {MANIFEST.relative_to(ROOT)}")
    if not README.is_file():
        fail(f"missing {README.relative_to(ROOT)}")

    try:
        document = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read manifest: {exc}")

    require_equal(
        document.get("reconciliationIssue"),
        EXPECTED_RECONCILIATION_ISSUE,
        "reconciliationIssue",
    )
    require_equal(
        document.get("classificationVocabulary"),
        EXPECTED_STATUSES,
        "classificationVocabulary",
    )

    production = document.get("productionBaseline")
    if not isinstance(production, dict):
        fail("productionBaseline must be an object")
    require_equal(production.get("commitSha"), EXPECTED_PRODUCTION_COMMIT, "Production commit")
    require_equal(production.get("treeSha"), EXPECTED_PRODUCTION_TREE, "Production tree")
    require_equal(
        production.get("finalMigration"), EXPECTED_FINAL_MIGRATION, "final migration"
    )

    source = document.get("sourceBranch")
    if not isinstance(source, dict):
        fail("sourceBranch must be an object")
    require_equal(source.get("commitSha"), EXPECTED_SOURCE_COMMIT, "source commit")
    require_equal(source.get("treeSha"), EXPECTED_PRODUCTION_TREE, "source tree")
    require_equal(source.get("treeMatchesProduction"), True, "treeMatchesProduction")

    refresh = document.get("decisionRefresh")
    if not isinstance(refresh, dict):
        fail("decisionRefresh must be an object")
    require_equal(
        refresh.get("patchBaseCommit"),
        "3c6a5d0b5b69c97b1b0b7322a2d1427a795b1746",
        "decision-refresh patch base",
    )

    scope = document.get("scope")
    if not isinstance(scope, dict):
        fail("scope must be an object")
    require_equal(scope.get("issueNumbers"), EXPECTED_ISSUES, "captured open issue set")

    items = document.get("items")
    if not isinstance(items, list):
        fail("items must be an array")
    issue_numbers = [item.get("issueNumber") for item in items if isinstance(item, dict)]
    require_equal(issue_numbers, EXPECTED_ISSUES, "item issue ordering")

    by_issue = {item["issueNumber"]: item for item in items}
    require_equal(by_issue[63].get("status"), "OBSOLETE", "issue #63 status")
    require_equal(by_issue[130].get("status"), "OBSOLETE", "issue #130 status")
    require_equal(
        by_issue[20].get("status"), "SUPERSEDED BY BITE 30", "issue #20 status"
    )

    for item in items:
        issue_number = item["issueNumber"]
        title = item.get("title")
        status = item.get("status")
        rationale = item.get("rationale")
        disposition = item.get("recommendedDisposition")
        evidence = item.get("evidence")

        if not isinstance(title, str) or not title.strip():
            fail(f"issue #{issue_number} has no title")
        if status not in EXPECTED_STATUSES:
            fail(f"issue #{issue_number} has unsupported status {status!r}")
        if not isinstance(rationale, str) or not rationale.strip():
            fail(f"issue #{issue_number} has no rationale")
        if disposition not in ALLOWED_DISPOSITIONS:
            fail(f"issue #{issue_number} has unsupported disposition {disposition!r}")
        if status in {"OPEN", "PARTIALLY DONE"} and disposition != "keep-open":
            fail(f"issue #{issue_number} is {status} but is not marked keep-open")
        if status == "DONE" and disposition != "close-completed":
            fail(f"issue #{issue_number} is DONE but is not marked close-completed")
        if not isinstance(evidence, list) or not evidence:
            fail(f"issue #{issue_number} has no source evidence")

        for proof in evidence:
            if not isinstance(proof, dict):
                fail(f"issue #{issue_number} has invalid evidence {proof!r}")
            relative = proof.get("file")
            if not isinstance(relative, str) or not relative.strip():
                fail(f"issue #{issue_number} evidence has no file")
            path = ROOT / relative
            if not path.is_file():
                fail(f"issue #{issue_number} references missing file {relative}")
            text = path.read_text(encoding="utf-8", errors="replace")

            marker = proof.get("contains")
            if marker is not None:
                if not isinstance(marker, str) or not marker:
                    fail(f"issue #{issue_number} has invalid contains marker in {relative}")
                if marker not in text:
                    fail(
                        f"issue #{issue_number} expected marker {marker!r} in {relative}"
                    )

            forbidden = proof.get("notContains")
            if forbidden is not None:
                if not isinstance(forbidden, str) or not forbidden:
                    fail(f"issue #{issue_number} has invalid notContains marker in {relative}")
                if forbidden in text:
                    fail(
                        f"issue #{issue_number} expected marker {forbidden!r} to be absent from {relative}"
                    )

            if marker is None and forbidden is None:
                fail(
                    f"issue #{issue_number} evidence for {relative} must define contains or notContains"
                )

    summary = README.read_text(encoding="utf-8", errors="replace")
    for marker in (
        EXPECTED_PRODUCTION_COMMIT,
        EXPECTED_PRODUCTION_TREE,
        "#63",
        "#130",
        "Bite 30D",
        "#838",
        "#840",
        "#841",
        "#844",
        "does **not** select or name Bite 31",
    ):
        if marker not in summary:
            fail(f"human-readable reconciliation is missing {marker!r}")

    print(
        "Post-Bite-30 backlog reconciliation verified: "
        f"{len(items)} backlog issues classified against Production tree {EXPECTED_PRODUCTION_TREE}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
