#!/usr/bin/env python3
"""Offline contract: all 35.5/35.6 operator cases have evidence sources and STOP rules.

Never touches databases, network, Docker, GitHub, or 1Password.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "bite-35"


def contents(name):
    return (DOC / name).read_text(encoding="utf-8")


class OperatorInstructionsContract(unittest.TestCase):
    def setUp(self):
        self.guide = contents("byte-35-operator-field-guide.md")
        self.a35 = contents("byte-35-5-manual-acceptance.md")
        self.a36 = contents("byte-35-6-manual-acceptance.md")

    def test_all_30_case_ids_documented_and_separate_branches(self):
        for bite in ("35.5", "35.6", "35.7"):
            for i in range(1, 11):
                self.assertIn(f"**{bite} T{i:02d}", self.guide)
        self.assertIn("1082-production-launch-verification-and-activation", self.guide)
        self.assertIn("do not copy its patch onto 1078", self.guide)

    def test_all_operational_responsibilities_defined(self):
        for role in ("Release Owner", "Database Operator", "Independent Approval Holder", "Application Administrator (GLOBAL)", "Recovery Operator / Technician", "Independent Reviewer / Security Reviewer", "Maintenance Window"):
            self.assertIn(role, self.guide)

    def test_backup_must_precede_writer_stop(self):
        t04 = self.a35.split("## T04 —", 1)[1].split("## T05 —", 1)[0]
        self.assertLess(t04.index("make server-backup ENV=test"), t04.index("make server-test-down"))
        self.assertIn("WHILE Test backend is running", t04)
        self.assertIn("make server-backup-verify ENV=test", t04)
        self.assertIn("source.database_path", t04)
        self.assertIn("no separately approved offline runtime", t04)

    def test_original_feature_branch_not_enforced_on_current(self):
        self.assertIn("actual approved candidate", self.a35)
        self.assertIn("historical 1071", self.a35)
        self.assertIn("1078-bite-356", self.a35)

    def test_source_provenance_for_required_values(self):
        for key in ("Test deployment revision/tree", "Source database identifier", "Test backup file path", "Backup manifest", "Manifest SHA-256", "CSV header / CSV SHA-256", "`tenant_id`, `journey_id`, `person_id`", "Approval JSON + detached signature", "RPO / RTO", "GitHub Production Environment approval rule"):
            self.assertIn(key, self.guide)
        self.assertIn("Deploying immutable revision", self.guide)
        self.assertIn("Verified backup:", self.guide)
        self.assertIn("Backup manifest:", self.guide)
        self.assertIn("Verified OK", self.guide)

    def test_case_count_and_35_6_human_contract_remain(self):
        for doc in (self.a35, self.a36):
            names = re.findall(r"^## (T[0-9]{2}) —", doc, flags=re.M)
            self.assertEqual([f"T{i:02d}" for i in range(1, 11)], names)
        for term in ("two different natural persons", "two approved real recovery technicians", "isolated restore"):
            self.assertIn(term, self.a36)

    def test_stop_guards_and_prohibited_operations(self):
        for term in ("BLOCKED", "NO-GO", "never", "Production", "server-test-down-volumes", "down -v", "1Password", "backend image"):
            self.assertIn(term.lower(), self.guide.lower())
        self.assertIn("Test backend is running", self.guide)
        self.assertIn("then stop Test writers", self.guide)

    def test_reference_targets_exist(self):
        for doc in (self.a35, self.a36, contents("byte-35-5-production-database-initialization.md"), contents("byte-35-6-administrator-and-recovery-runbook.md"), contents("launch-plan.md")):
            self.assertIn("byte-35-operator-field-guide.md", doc)
        for relative in ("docs/bite-33-2-backup-creation-retention-and-verification.md", "docs/bite-3367/production-operational-runbook.md", "docs/database-recovery-runbook.md"):
            self.assertTrue((ROOT/relative).is_file(), relative)


if __name__ == "__main__":
    unittest.main(verbosity=2)
