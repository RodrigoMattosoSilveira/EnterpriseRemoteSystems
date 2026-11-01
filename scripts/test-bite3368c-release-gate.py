#!/usr/bin/env python3
"""Offline fail-closed regression for Bite 33.6.8C release gate."""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ers3368c_gate', ROOT / 'scripts/ers-bite3368c-release-gate.py')
gate = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(gate)
from importlib.machinery import SourceFileLoader
base_spec = importlib.util.spec_from_loader('ers3368c_fixtures', SourceFileLoader('ers3368c_fixtures', str(ROOT / 'scripts/test-bite3368-integrated-acceptance.py')))
fixtures = importlib.util.module_from_spec(base_spec)
assert base_spec.loader
base_spec.loader.exec_module(fixtures)

REV = fixtures.REV
TREE = fixtures.TREE


class GateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory(prefix='ers3368c-gate-')
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'acceptance.json'
        self.report_path = Path(self.tmp.name) / 'rehearsal.json'
        self.record, self.report = fixtures.baseline()
        self.git_state = {'HEAD': REV, 'HEAD^{tree}': TREE, 'status': ''}
        def fake_git(*args):
            return self.git_state['status'] if args[0] == 'status' else self.git_state[args[-1]]
        patcher = patch.object(gate, 'git', side_effect=fake_git)
        patcher.start()
        self.addCleanup(patcher.stop)

    def save(self):
        self.report_path.write_text(json.dumps(self.report))
        self.record['recovery']['sha256'] = hashlib.sha256(self.report_path.read_bytes()).hexdigest()
        self.path.write_text(json.dumps(self.record))

    def test_preflight_pass(self):
        gate.gate('test', REV, TREE, None)

    def test_evidence_pass(self):
        self.save()
        gate.gate('test', REV, TREE, self.path)

    def test_wrong_commit_blocked(self):
        self.git_state['HEAD'] = 'f' * 40
        with self.assertRaisesRegex(gate.GateBlocked, 'exact expected'):
            gate.gate('test', REV, TREE, None)

    def test_wrong_tree_blocked(self):
        self.git_state['HEAD^{tree}'] = 'f' * 40
        with self.assertRaisesRegex(gate.GateBlocked, 'exact expected'):
            gate.gate('test', REV, TREE, None)

    def test_dirty_checkout_blocked(self):
        self.git_state['status'] = '?? unexpected-file'
        with self.assertRaisesRegex(gate.GateBlocked, 'not clean'):
            gate.gate('test', REV, TREE, None)

    def test_bad_sha_blocked(self):
        with self.assertRaises(gate.GateBlocked):
            gate.gate('test', REV[:8], TREE, None)

    def test_local_not_accepted(self):
        with self.assertRaises(gate.GateBlocked):
            gate.gate('local', REV, TREE, None)

    def test_missing_evidence_blocked(self):
        with self.assertRaises(gate.GateBlocked):
            gate.gate('test', REV, TREE, self.path)

    def test_evidence_tree_mismatch_blocked(self):
        self.record['release']['tree_sha'] = 'f' * 40
        self.save()
        with self.assertRaisesRegex(gate.GateBlocked, 'tree SHA'):
            gate.gate('test', REV, TREE, self.path)

    def test_environment_mismatch_blocked(self):
        self.save()
        with self.assertRaises(gate.GateBlocked):
            gate.gate('production', REV, TREE, self.path)

    def test_tampered_rehearsal_blocked(self):
        self.save()
        self.report_path.write_text('{}')
        with self.assertRaises(gate.GateBlocked):
            gate.gate('test', REV, TREE, self.path)

    def test_incomplete_cleanup_blocked(self):
        self.report['recovery']['isolation']['rehearsal_container_removed'] = False
        self.save()
        with self.assertRaises(gate.GateBlocked):
            gate.gate('test', REV, TREE, self.path)

    def test_continuity_not_accepted_blocked(self):
        self.record['backup_continuity']['verified'] = False
        self.save()
        with self.assertRaises(gate.GateBlocked):
            gate.gate('test', REV, TREE, self.path)

    def test_no_automatic_approval(self):
        self.record['operations']['simultaneous_unavailability_risk_accepted'] = False
        self.save()
        with self.assertRaises(gate.GateBlocked):
            gate.gate('test', REV, TREE, self.path)


if __name__ == '__main__':
    unittest.main(verbosity=2)
