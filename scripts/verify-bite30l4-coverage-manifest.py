#!/usr/bin/env python3
"""Verify that Bite 30L.4 coverage evidence points at real repository contracts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs" / "bite-30l4-coverage-manifest.json"
EXPECTED_IDS = list(range(1, 14))
ALLOWED_STATUSES = {"covered", "pending-30L.4C"}


def fail(message: str) -> None:
    print(f"30L.4 coverage manifest check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def make_target_exists(text: str, target: str) -> bool:
    return re.search(rf"(?m)^\.PHONY:\s+[^\n]*\b{re.escape(target)}\b", text) is not None and re.search(
        rf"(?m)^{re.escape(target)}\s*:", text
    ) is not None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--require-complete",
        action="store_true",
        help="fail if any architecture requirement is still pending",
    )
    args = parser.parse_args()

    if not MANIFEST.is_file():
        fail(f"missing {MANIFEST.relative_to(ROOT)}")

    try:
        document = json.loads(MANIFEST.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read JSON manifest: {exc}")

    requirements = document.get("requirements")
    if not isinstance(requirements, list):
        fail("requirements must be an array")

    ids = [item.get("id") for item in requirements if isinstance(item, dict)]
    if ids != EXPECTED_IDS:
        fail(f"requirement IDs must be exactly {EXPECTED_IDS}, got {ids}")

    pending: list[int] = []
    for item in requirements:
        requirement_id = item["id"]
        status = item.get("status")
        if status not in ALLOWED_STATUSES:
            fail(f"requirement {requirement_id} has unsupported status {status!r}")
        if status != "covered":
            pending.append(requirement_id)

        evidence = item.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            fail(f"requirement {requirement_id} has no evidence")

        for proof in evidence:
            if not isinstance(proof, dict) or not proof.get("file"):
                fail(f"requirement {requirement_id} has invalid evidence {proof!r}")
            path = ROOT / proof["file"]
            if not path.is_file():
                fail(
                    f"requirement {requirement_id} references missing file {proof['file']}"
                )
            text = path.read_text(errors="replace")

            title = proof.get("testTitle")
            if title and title not in text:
                fail(
                    f"requirement {requirement_id} test title {title!r} is not present in {proof['file']}"
                )

            contains = proof.get("contains")
            if contains and contains not in text:
                fail(
                    f"requirement {requirement_id} marker {contains!r} is not present in {proof['file']}"
                )

            make_target = proof.get("makeTarget")
            if make_target and not make_target_exists(text, make_target):
                fail(
                    f"requirement {requirement_id} Make target {make_target!r} is not defined in {proof['file']}"
                )

    if args.require_complete and pending:
        fail(f"requirements still pending final 30L.4 deployment evidence: {pending}")

    covered = len(requirements) - len(pending)
    suffix = (
        f"; pending requirements: {pending}"
        if pending
        else "; all architecture requirements complete"
    )
    print(
        f"Bite 30L.4 coverage manifest verified: {covered}/{len(requirements)} requirements covered{suffix}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
