#!/usr/bin/env python3
"""Fail when current ERS runtime/tooling can recreate or use legacy identity schema.

30K.3B physically removes the legacy identity storage retained as an inert bridge
by 30K.3A. Historical migrations and migration-specific tests may still describe
that schema; current production models, writers, and generic operational tooling
must neither depend on it nor cause GORM to recreate it.
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

PATTERNS = [
    ("legacy Membership Person projection", re.compile(r"\blegacy_person_id\b|\bLegacyPersonID\b", re.I)),
    ("legacy primary/default AccountActor", re.compile(r"\bis_primary\b|\bPrimary\s+bool\b", re.I)),
    ("legacy Account Actor pointer", re.compile(r"\bauth_user_accounts\.actor_id\b|\bActorID\s+string\s+`gorm:\"column:actor_id", re.I)),
    ("legacy Actor Person pointer", re.compile(r"\bauthz_actors\.person_id\b|\bPersonID\s+\*string\s+`gorm:\"column:person_id", re.I)),
    ("legacy Actor Collaborator pointer", re.compile(r"\bauthz_actors\.collaborator_id\b|\bCollaboratorID\s+\*string\s+`gorm:\"column:collaborator_id", re.I)),
    ("legacy Collaborator Person pointer", re.compile(r"\bcollaborator_journeys\.person_id\b|\bPersonID\s+string\s+`gorm:\"column:person_id;type:text;index;->", re.I)),
    ("legacy Person table association", re.compile(r"\bPeople\s+\[\]Person\b")),
    ("legacy Person model persistence", re.compile(r"(?:database|tx|r\.db)\.(?:Model|Create|Save)\s*\(\s*&?db\.Person\b|database\.AutoMigrate\s*\([^\n]*&Person\{\}")),
    ("legacy foundation runtime repair", re.compile(r"EnsureGlobalPersonMembershipFoundation\s*\(")),
]


def is_test_file(path: Path) -> bool:
    return path.name.endswith("_test.go")


def strip_go_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//.*", "", text)
    return text


def main() -> int:
    violations: list[str] = []
    for path in sorted(set(LIVE_FILES)):
        if not path.exists() or is_test_file(path):
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
        print("Physical legacy identity dependencies remain:", file=sys.stderr)
        for violation in violations:
            print(f"  {violation}", file=sys.stderr)
        return 1
    print("30K.3B physical legacy identity removal check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
