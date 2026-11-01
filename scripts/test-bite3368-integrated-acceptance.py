#!/usr/bin/env python3
"""Portable, executable positive/negative Bite 33.6.8 contract tests."""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts' / 'verify-bite3368-final-acceptance.py'
spec = importlib.util.spec_from_file_location('ers3368_final', SOURCE)
module = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(module)

REV = 'a' * 40
TREE = 'b' * 40
DIGEST = 'c' * 64


def baseline():
    report = {
        'status': 'passed', 'environment': 'test', 'repository': {'revision': REV, 'tree_sha': TREE},
        'started_at': '2026-10-31T12:00:00Z', 'recovered_at': '2026-10-31T12:04:10Z',
        'completed_at': '2026-10-31T12:05:00Z',
        'source': {'kind': 'offhost-receipt', 'backup_sha256': DIGEST,
                   'backup_created_at': '2026-10-31T11:56:40Z',
                   'remote': {'backup_key': 'test/backup.db', 'manifest_key': 'test/backup.manifest.json',
                              'backup_version_id': 'db-version-123', 'manifest_version_id': 'manifest-version-123'}},
        'recovery': {'isolation': {'docker_effective_mounts_verified': True, 'named_volumes_present': False,
                                     'network_disabled': True, 'backend_database_path': '/rehearsal-data/app.db',
                                     'database_checked_path': '/rehearsal-data/app.db',
                                     'private_database_copies_disposed': True, 'rehearsal_container_removed': True},
                     'isolated_backend_health': 'passed', 'post_boot_integrity_check': 'ok',
                     'post_boot_foreign_key_check': 'clean'},
        'objectives': {'rpo_basis': 'selected_backup_age_at_rehearsal_start',
                       'rto_basis': 'rehearsal_start_to_isolated_backend_health_and_database_verification',
                       'rpo_seconds': 200, 'max_rpo_seconds': 86400, 'rpo_met': True,
                       'rto_seconds': 250, 'max_rto_seconds': 14400, 'rto_met': True},
    }
    people = []
    for label in ('A', 'B'):
        people.append({'label': label, 'actor_key': 'actor-'+label, 'account_id': 'acct-'+label,
                       'login': label.lower()+'@example.test', 'first_login_ref': 'MT-03-'+label,
                       'mutual_recovery_ref': 'MT-06-'+label, 'audit_ref': 'AUD-'+label})
    record = {
        'format_version': 1, 'environment': 'test',
        'release': {'revision': REV, 'tree_sha': TREE, 'ci_status': 'passed',
                    'ci_url': 'https://example.invalid/ci/123', 'integrated_regression': 'passed',
                    'integrated_regression_ref': 'ci-artifact-123'},
        'human_administrators': people,
        'onepassword': {'human_a_review_ref': 'REVIEW-A', 'human_b_review_ref': 'REVIEW-B',
                        'service_account_isolation_ref': 'REVIEW-SVC',
                        'legacy_custody_resolution_ref': 'REVIEW-CUSTODY'},
        'backup_continuity': {'verified': True, 'recurring_backup_history_ref': 'HISTORY-123',
                              'retention_verification_ref': 'RETENTION-123',
                              'offhost_replication_history_ref': 'REPLICATION-123',
                              'continuity_review_ref': 'REVIEW-123'},
        'operations': {'change_approval_ref': 'CHG-123', 'approver_id': 'operator-1',
                       'backup_verification_ref': 'BACKUP-123', 'off_host_receipt_ref': 'S3-123',
                       'migration_gate_ref': 'MIGRATE-123', 'deployed_smoke_ref': 'SMOKE-123',
                       'risk_acceptance_ref': 'RISK-123',
                       'simultaneous_unavailability_risk_accepted': True},
        'recovery': {'report_file': 'rehearsal.json', 'sha256': None},
    }
    return record, report


class IntegratedAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ers3368-verify-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.record, self.report = baseline()

    def check(self):
        report_path = self.root / 'rehearsal.json'
        report_path.write_text(json.dumps(self.report))
        self.record['recovery']['sha256'] = hashlib.sha256(report_path.read_bytes()).hexdigest()
        evidence_path = self.root / 'acceptance.json'
        evidence_path.write_text(json.dumps(self.record))
        module.verify(evidence_path, REV, 'test')

    def reject(self):
        with self.assertRaises(module.EvidenceError):
            self.check()

    def test_missing_backup_version(self):
        self.report['source']['remote']['backup_version_id'] = ''
        self.reject()

    def test_null_manifest_version(self):
        self.report['source']['remote']['manifest_version_id'] = 'null'
        self.reject()

    def test_backup_version_placeholder(self):
        self.report['source']['remote']['backup_version_id'] = 'REPLACE_ME'
        self.reject()

    def test_rto_timestamp_mismatch(self):
        self.report['objectives']['rto_seconds'] = 251
        self.reject()

    def test_rpo_timestamp_mismatch(self):
        self.report['objectives']['rpo_seconds'] = 201
        self.reject()

    def test_cleanup_missing(self):
        self.report['recovery']['isolation']['rehearsal_container_removed'] = False
        self.reject()

    def test_live_volume_used(self):
        self.report['recovery']['isolation']['named_volumes_present'] = True
        self.reject()

    def test_missing_continuity(self):
        del self.record['backup_continuity']
        self.reject()

    def test_continuity_review_missing(self):
        self.record['backup_continuity']['continuity_review_ref'] = ''
        self.reject()

    def test_recovery_after_completion(self):
        self.report['recovered_at'] = '2026-10-31T12:06:00Z'
        self.reject()

    def test_positive(self):
        self.check()

    def test_wrong_environment(self):
        self.record['environment'] = 'production'
        self.reject()

    def test_rehearsal_wrong_environment(self):
        self.report['environment'] = 'production'
        self.reject()

    def test_duplicate_actor_keys(self):
        self.record['human_administrators'][1]['actor_key'] = 'actor-A'
        self.reject()

    def test_missing_offhost_object_key(self):
        self.report['source']['remote']['backup_key'] = ''
        self.reject()

    def test_rto_exceeds_objective(self):
        self.report['objectives']['rto_seconds'] = 15000
        self.reject()

    def test_wrong_revision(self):
        self.record['release']['revision'] = 'f'*40
        self.reject()

    def test_missing_independent_human(self):
        self.record['human_administrators'][1]['account_id'] = 'acct-A'
        self.reject()

    def test_placeholder_rejected(self):
        self.record['onepassword']['human_a_review_ref'] = 'REPLACE_WITH_ACTUAL_EVIDENCE'
        self.reject()

    def test_no_risk_acceptance(self):
        self.record['operations']['simultaneous_unavailability_risk_accepted'] = False
        self.reject()

    def test_unresolved_custody(self):
        self.record['onepassword']['legacy_custody_resolution_ref'] = 'pending'
        self.reject()

    def test_local_backup_is_not_offhost_evidence(self):
        self.report['source']['kind'] = 'local-backup'
        self.reject()

    def test_rpo_exceeds_objective(self):
        self.report['objectives']['rpo_seconds'] = 90000
        self.reject()

    def test_rto_limit_cannot_be_relaxed(self):
        self.report['objectives']['max_rto_seconds'] = 28800
        self.reject()

    def test_missing_admin_audit(self):
        self.record['human_administrators'][0]['audit_ref'] = 'N/A'
        self.reject()

    def test_no_healthy_backend(self):
        self.report['recovery']['isolated_backend_health'] = 'failed'
        self.reject()

    def test_no_approval(self):
        self.record['operations']['change_approval_ref'] = 'TODO'
        self.reject()

    def test_mismatched_tree(self):
        self.report['repository']['tree_sha'] = 'e'*40
        self.reject()

    def test_modified_rehearsal_report_hash(self):
        self.report['status'] = 'failed'
        report_path = self.root / 'rehearsal.json'
        report_path.write_text(json.dumps(self.report))
        self.record['recovery']['sha256'] = '1'*64
        evidence_path = self.root / 'acceptance.json'
        evidence_path.write_text(json.dumps(self.record))
        with self.assertRaises(module.EvidenceError):
            module.verify(evidence_path, REV, 'test')

    def test_nonexistent_rehearsal(self):
        self.record['recovery']['report_file'] = 'missing.json'
        self.reject()


if __name__ == '__main__':
    unittest.main(verbosity=2)
