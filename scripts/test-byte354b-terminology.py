#!/usr/bin/env python3
"""Byte 35.4B: fourteen negative cases proving terminology checker fails closed."""
from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from shutil import copy2

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
spec = importlib.util.spec_from_file_location("byte354b_checker", HERE / "ers-byte354b-terminology-check.py")
assert spec and spec.loader
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
SOURCES = [
    "frontend/src/i18n/resources/en-US.ts", "frontend/src/i18n/resources/pt-BR.ts",
    *checker.UI, *checker.REFERENCES,
    "docs/bite-35/byte-35-4-manual-da-entidade-pt-br.md",
    "docs/bite-35/byte-35-4b-terminologia-entidade.md",
    "docs/bite-35/byte-35-4b-manual-acceptance.md",
    "docs/bite-31-3-core-business-demo-journey-pt-br.md",
    "Makefile", ".github/workflows/ci.yml",
]


class NegativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory(prefix="ers-354b-")
        cls.root = Path(cls.tmp.name)
        for rel in SOURCES:
            dst = cls.root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            copy2(ROOT / rel, dst)
        problems = checker.validate(cls.root)
        assert not problems, f"reference fixture must PASS: {problems}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def fail_if_reverted(self, rel: str, old: str, new: str, expected: str) -> None:
        path = self.root / rel
        source = path.read_text(encoding="utf-8")
        self.assertIn(old, source)
        try:
            path.write_text(source.replace(old, new, 1), encoding="utf-8")
            issues = checker.validate(self.root)
            self.assertTrue(any(expected in issue for issue in issues), f"Mutation undetected: {expected}; issues={issues}")
        finally:
            path.write_text(source, encoding="utf-8")

    def test_01_missing_translation_key(self):
        self.fail_if_reverted("frontend/src/i18n/resources/pt-BR.ts", '"byte354b.roles.tenantMember":', '"byte354b.roles.tenantMember_missing":', "key parity")

    def test_02_bad_placeholder(self):
        self.fail_if_reverted("frontend/src/i18n/resources/pt-BR.ts", '"byte354b.roles.roleGranted": "{role}', '"byte354b.roles.roleGranted": "{other}', "placeholder mismatch")

    def test_03_english_tenant_display(self):
        self.fail_if_reverted("frontend/src/i18n/resources/pt-BR.ts", '"byte354b.roles.tenantMember": "Membro da Entidade"', '"byte354b.roles.tenantMember": "Tenant member"', "English Tenant term")

    def test_04_missing_audit_operation(self):
        self.fail_if_reverted(checker.UI[0], 'value: "authz.tenant_actors.activate"', 'value: "different.operation"', "audit display/code")

    def test_05_hidden_operation_code(self):
        self.fail_if_reverted(checker.UI[0], '{log.operation}', '{t("byte354b.audit.unknown")}', "audit display/code")

    def test_06_hardcoded_audit_label(self):
        self.fail_if_reverted(checker.UI[0], 'key: "byte354b.audit.operation.17"', 'label: "Tenant Actor activated"', "audit operation still")

    def test_07_eligibility_not_localized(self):
        self.fail_if_reverted(checker.UI[1], 'localizeAuthzReason(eligibility.reason, t)', 'eligibility.reason', "eligibility/authorization")

    def test_08_blocker_not_localized(self):
        self.fail_if_reverted(checker.UI[1], 'localizeAuthzReason(tenantAdminCardinalityBlocker, t)', 'tenantAdminCardinalityBlocker', "eligibility/authorization")

    def test_09_tenant_member_hardcoded(self):
        self.fail_if_reverted(checker.UI[3], 't("byte354b.roles.tenantMember")', '"Tenant member"', "delegated Role")

    def test_10_support_count_hardcoded(self):
        self.fail_if_reverted(checker.UI[2], '"byte354b.support.activeTenantsPlural"', '"active Tenants"', "support history")

    def test_11_manual_changed(self):
        self.fail_if_reverted(str(checker.MANUAL), "Administrador da Entidade", "Administrador do Tenant", "customer manual content")

    def test_12_broken_manual_reference(self):
        self.fail_if_reverted(checker.REFERENCES[0], 'byte-35-4-manual-da-entidade-pt-br.md', 'byte-35-4-manual-do-tenant-pt-br.md', "obsolete customer manual reference")

    def test_13_missing_acceptance_case(self):
        self.fail_if_reverted("docs/bite-35/byte-35-4b-manual-acceptance.md", "### T08", "### Z08", "T01–T08")

    def test_14_missing_ci(self):
        self.fail_if_reverted(".github/workflows/ci.yml", "make byte354b-terminology-check", "make byte354a-training-check", "GitHub CI missing")


if __name__ == "__main__":
    unittest.main(verbosity=2)
