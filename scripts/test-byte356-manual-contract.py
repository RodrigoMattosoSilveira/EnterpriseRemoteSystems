#!/usr/bin/env python3
"""Negative regression tests for Bite 35.6's T01–T10 manual contract.

Offline and read-only: no real DB, 1Password, Docker, or network access.
"""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "bite356_checker", ROOT / "scripts/test-byte356-operations.py"
)
assert SPEC and SPEC.loader
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)
MANUAL = (ROOT / "docs/bite-35/byte-35-6-manual-acceptance.md").read_text(encoding="utf-8")


class ManualContractTests(unittest.TestCase):
    def assert_rejected(self, original: str, tampered: str, expected: str):
        self.assertNotEqual(original, tampered, "test mutation did not change the manual")
        self.assertTrue(
            any(expected in issue for issue in checker.manual_contract_issues(tampered)),
            f"Expected violation {expected!r}; got {checker.manual_contract_issues(tampered)}",
        )

    def test_01_complete_manual_is_accepted(self):
        self.assertEqual(checker.manual_contract_issues(MANUAL), [])

    def test_02_missing_local_fixture_case_is_rejected(self):
        self.assert_rejected(MANUAL, MANUAL.replace("## T10 —", "## X10 —", 1), "T01–T10")

    def test_03_missing_two_human_case_is_rejected(self):
        self.assert_rejected(MANUAL, MANUAL.replace("## T06 —", "## X06 —", 1), "T01–T10")

    def test_04_duplicate_case_is_rejected(self):
        self.assert_rejected(MANUAL, MANUAL + "\n## T10 — Duplicate\n", "T01–T10")

    def test_05_out_of_order_cases_are_rejected(self):
        self.assert_rejected(MANUAL, MANUAL.replace("## T08 —", "## T11 —", 1), "T01–T10")

    def test_06_missing_identity_is_rejected(self):
        self.assert_rejected(MANUAL, MANUAL.replace("**Identity/context:** Developer/tester", "**Context:** Developer/tester", 1), "T10 missing identity/context")

    def test_07_missing_blocked_criteria_is_rejected(self):
        self.assert_rejected(MANUAL, MANUAL.replace("**BLOCKED:** missing exact 1Password fixture credentials", "**PENDING:** missing exact 1Password fixture credentials", 1), "T10 missing BLOCKED")

    def test_08_fixture_installer_command_is_required(self):
        self.assert_rejected(MANUAL, MANUAL.replace("make local-fixtures-ensure", "make legacy-fixtures", 1), "make local-fixtures-ensure")

    def test_09_fixture_credential_custody_is_required(self):
        t = MANUAL.replace("eleven LOCAL passwords", "LOCAL passwords", 1)
        self.assert_rejected(MANUAL, t, "eleven LOCAL passwords")

    def test_10_independent_humans_are_required(self):
        self.assert_rejected(MANUAL, MANUAL.replace("two different natural persons", "two test accounts", 1), "T06 missing operational safeguard")

    def test_11_independent_custody_is_required(self):
        self.assert_rejected(MANUAL, MANUAL.replace("two approved real recovery technicians", "two automated accounts", 1), "T07 missing operational safeguard")

    def test_12_restore_evidence_is_required(self):
        self.assert_rejected(MANUAL, MANUAL.replace("isolated restore", "restore"), "T08 missing operational safeguard")


if __name__ == "__main__":
    unittest.main(verbosity=2)
