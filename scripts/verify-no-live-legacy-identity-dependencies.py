#!/usr/bin/env python3
"""Fail when current ERS runtime/tooling depends on retired identity storage.

30K.3A deliberately leaves the physical compatibility schema in place for one
release. Historical migrations/backfill/rehearsal code may still understand it;
current production code and generic operational test-data tooling may not.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIVE_FILES = [
    *ROOT.glob("backend/internal/**/*.go"),
    *ROOT.glob("backend/cmd/provision-e2e-admin/*.go"),
    ROOT / "scripts/seed-manual-testdata.py",
    ROOT / "scripts/verify-manual-testdata.py",
    ROOT / "scripts/testdata-reset.sh",
    ROOT / "scripts/tenant-people-report.sh",
    ROOT / "backend/testdata/datasets/settlement_actions.sql",
]

# Explicitly historical/backfill-only sources. Their purpose is to read the
# pre-30K.3A schema so old databases can be rehearsed/upgraded deterministically.
EXCLUDED = {
    ROOT / "backend/internal/db/global_person_foundation.go",
}

PATTERNS = [
    ("legacy Membership Person projection", re.compile(r"\blegacy_person_id\b", re.I)),
    ("legacy primary/default AccountActor", re.compile(r"\bis_primary\b", re.I)),
    ("legacy Account Actor pointer", re.compile(r"\bauth_user_accounts\.actor_id\b", re.I)),
    ("legacy Actor Person pointer", re.compile(r"\bauthz_actors\.person_id\b", re.I)),
    ("legacy Actor Collaborator pointer", re.compile(r"\bauthz_actors\.collaborator_id\b", re.I)),
    ("legacy Collaborator Person pointer", re.compile(r"\bcollaborator_journeys\.person_id\b", re.I)),
    ("legacy Person model persistence", re.compile(r"(?:Model|Create|Save)\s*\(\s*&?db\.Person\s*\{")),
    ("legacy foundation runtime repair", re.compile(r"EnsureGlobalPersonMembershipFoundation\s*\(")),
]

# These files intentionally define read-only compatibility fields or describe
# them in comments; neither constitutes a runtime dependency.
MODEL_OR_CONTRACT_FILES = {
    ROOT / "backend/internal/authentication/models.go",
    ROOT / "backend/internal/authentication/repository.go",
    ROOT / "backend/internal/db/models.go",
    ROOT / "backend/internal/authz/models.go",
}

# Tests may assert that historical compatibility data remains readable during
# 30K.3A; 30K.3B removes the physical fields and will retire those assertions.
def is_test_file(path: Path) -> bool:
    return path.name.endswith("_test.go")


def strip_go_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//.*", "", text)
    return text


def main() -> int:
    violations: list[str] = []
    for path in sorted(set(LIVE_FILES)):
        if not path.exists() or path in EXCLUDED or path in MODEL_OR_CONTRACT_FILES or is_test_file(path):
            continue
        text = path.read_text(encoding="utf-8")
        searchable = strip_go_comments(text) if path.suffix == ".go" else text
        if path.suffix != ".go":
            legacy_people = re.search(r"\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+people\b", searchable, re.I)
            if legacy_people:
                line = searchable.count("\n", 0, legacy_people.start()) + 1
                violations.append(f"{path.relative_to(ROOT)}:{line}: legacy people table SQL")
        for label, pattern in PATTERNS:
            match = pattern.search(searchable)
            if not match:
                continue
            line = searchable.count("\n", 0, match.start()) + 1
            violations.append(f"{path.relative_to(ROOT)}:{line}: {label}")
    if violations:
        print("Live legacy identity dependencies remain:", file=sys.stderr)
        for violation in violations:
            print(f"  {violation}", file=sys.stderr)
        return 1
    print("30K.3A live legacy identity dependency check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
