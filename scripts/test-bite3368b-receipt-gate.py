#!/usr/bin/env python3
"""Dedicated immutable off-host receipt and acceptance negative regressions."""
import unittest
from pathlib import Path
import importlib.util
spec = importlib.util.spec_from_file_location('integrated', Path(__file__).with_name('test-bite3368-integrated-acceptance.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
class ReceiptTests(mod.IntegratedAcceptanceTests):
    def test_version_with_whitespace(self):
        self.report['source']['remote']['backup_version_id'] = 'version 123'
        self.reject()
    def test_version_tag_is_not_evidence(self):
        self.report['source']['remote']['manifest_version_id'] = '<version>'
        self.reject()
    def test_missing_docker_mount_proof(self):
        self.report['recovery']['isolation']['docker_effective_mounts_verified'] = False
        self.reject()
    def test_wrong_database_checked(self):
        self.report['recovery']['isolation']['database_checked_path'] = '/app/data/app.db'
        self.reject()
if __name__ == '__main__':
    unittest.main()
