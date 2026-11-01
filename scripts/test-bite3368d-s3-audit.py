#!/usr/bin/env python3
"""Offline, credential-free fail-closed audit contract regression."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
script = ROOT / 'scripts/ers-bite3368d-s3-audit.py'
spec = importlib.util.spec_from_file_location('audit3368d', script)
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)

def fixture():
    return {
        'project': 'ERS Backups', 'bucket': 'ers', 'region': 'hel1',
        **{k: {'status': 'verified', 'evidence_ref': 'change-123'} for k in ('versioning', 'object_lock', 'default_retention', 'bucket_policy')},
        'environments': {env: {'prefix': 'ers-backups/' + env, 'backup_config': 'verified', 'credential_custody': 'verified', 'same_env_access': 'verified', 'cross_env_denied': 'verified', 'evidence_ref': 'review-123'} for env in a.ENVIRONMENTS},
        'review': {'operator_ref': 'operator-1', 'reviewer_ref': 'reviewer-2', 'approval_ref': 'approval-3'}
    }

class AuditTests(unittest.TestCase):
    def test_complete_still_requires_review(self):
        self.assertEqual(a.audit(fixture())['audit_status'], 'EVIDENCE_COMPLETE_REVIEW_REQUIRED')
    def test_missing_evidence_blocks(self):
        x = fixture(); x['bucket_policy']['status'] = 'absent'; self.assertEqual(a.audit(x)['audit_status'], 'BLOCKED')
    def test_missing_cross_env_deny_blocks(self):
        x = fixture(); x['environments']['test']['cross_env_denied'] = 'unknown'; self.assertEqual(a.audit(x)['audit_status'], 'BLOCKED')
    def test_missing_credential_custody_blocks(self):
        x = fixture(); x['environments']['development']['credential_custody'] = 'not_configured'; self.assertEqual(a.audit(x)['audit_status'], 'BLOCKED')
    def test_overlapping_prefixes_block(self):
        x = fixture(); x['environments']['test']['prefix'] = 'ers-backups/production/sub'; self.assertEqual(a.audit(x)['audit_status'], 'BLOCKED')
    def test_missing_approval_blocks(self):
        x = fixture(); x['review']['approval_ref'] = None; self.assertEqual(a.audit(x)['audit_status'], 'BLOCKED')
    def test_unjustified_verified_ref_rejected(self):
        x = fixture(); x['versioning']['evidence_ref'] = None; self.assertRaises(ValueError, a.audit, x)
    def test_unknown_environment_rejected(self):
        x = fixture(); x['environments']['staging'] = {}; self.assertRaises(ValueError, a.audit, x)
    def test_secret_ref_rejected(self):
        x = fixture(); x['review']['operator_ref'] = 'password=unsafe'; self.assertRaises(ValueError, a.audit, x)
    def test_nested_prefix_rejected(self):
        x = fixture(); x['environments']['test']['prefix'] = '../production'; self.assertRaises(ValueError, a.audit, x)
    def test_missing_file_cli_blocks(self):
        r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)
        self.assertIn('BLOCKED', r.stdout)
    def test_complete_file_cli(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'audit.json'; path.write_text(json.dumps(fixture()))
            r = subprocess.run([sys.executable, str(script), '--evidence', str(path)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('REVIEW_REQUIRED', r.stdout)
    def test_secret_payload_not_echoed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'audit.json'; path.write_text('NOT_A_VALID_JSON_SECRET')
            r = subprocess.run([sys.executable, str(script), '--evidence', str(path)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 2)
            self.assertNotIn('NOT_A_VALID_JSON_SECRET', r.stderr + r.stdout)

if __name__ == '__main__':
    unittest.main(verbosity=2)
