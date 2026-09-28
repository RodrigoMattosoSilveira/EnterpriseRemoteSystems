#!/usr/bin/env python3
"""Verify Bite 32.5 release coverage points at real repository contracts."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs" / "bite-32-5-release-coverage-manifest.json"
EXPECTED_IDS = list(range(1, 9))
FINAL_MIGRATION = "000071_cross_tenant_delegated_role_isolation.up.sql"


def fail(message: str) -> None:
    print(f"Bite 32.5 release coverage check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def make_target_exists(text: str, target: str) -> bool:
    return re.search(rf"(?m)^\.PHONY:\s+[^\n]*\b{re.escape(target)}\b", text) is not None and re.search(
        rf"(?m)^{re.escape(target)}\s*:", text
    ) is not None


def main() -> int:
    if not MANIFEST.is_file():
        fail(f"missing {MANIFEST.relative_to(ROOT)}")
    try:
        document = json.loads(MANIFEST.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read manifest: {exc}")

    requirements = document.get("requirements")
    if not isinstance(requirements, list):
        fail("requirements must be an array")
    ids = [item.get("id") for item in requirements if isinstance(item, dict)]
    if ids != EXPECTED_IDS:
        fail(f"requirement IDs must be exactly {EXPECTED_IDS}, got {ids}")

    for item in requirements:
        requirement_id = item["id"]
        if item.get("status") != "covered":
            fail(f"requirement {requirement_id} must be covered")
        evidence = item.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            fail(f"requirement {requirement_id} has no evidence")
        for proof in evidence:
            if not isinstance(proof, dict) or not proof.get("file"):
                fail(f"requirement {requirement_id} has invalid evidence {proof!r}")
            path = ROOT / proof["file"]
            if not path.is_file():
                fail(f"requirement {requirement_id} references missing file {proof['file']}")
            text = path.read_text(errors="replace")
            marker = proof.get("testTitle") or proof.get("contains")
            if marker and marker not in text:
                fail(f"requirement {requirement_id} marker {marker!r} is not present in {proof['file']}")
            make_target = proof.get("makeTarget")
            if make_target and not make_target_exists(text, make_target):
                fail(f"requirement {requirement_id} Make target {make_target!r} is not defined in {proof['file']}")

    verifier = (ROOT / "backend" / "verify-migrated-db.sh").read_text(errors="replace")
    if FINAL_MIGRATION not in verifier:
        fail(f"migrated-database verifier does not require {FINAL_MIGRATION}")

    print(
        f"Bite 32.5 release coverage verified: {len(requirements)}/{len(requirements)} requirements covered; final migration {FINAL_MIGRATION}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
