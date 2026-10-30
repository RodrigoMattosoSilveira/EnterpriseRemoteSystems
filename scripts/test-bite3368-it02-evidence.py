#!/usr/bin/env python3
"""Offline, cross-platform regressions for the IT-02 evidence runner."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().with_name('ers-bite3368-it02-evidence.py')
spec = importlib.util.spec_from_file_location('ers_bite3368_it02_evidence', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class IT02EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ers-it02-evidence-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'repo'
        self.root.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True, capture_output=True)
        (self.root / 'README.md').write_text('Safe regression test repository\n')
        subprocess.run(['git', 'add', 'README.md'], cwd=self.root, check=True, capture_output=True)
        subprocess.run(['git', '-c', 'user.name=ERS Test', '-c', 'user.email=ers@test.invalid',
                        'commit', '-qm', 'Test fixture'], cwd=self.root, check=True, capture_output=True)
        self.root_revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=self.root, text=True).strip()
        self.output_root = Path(self.temp.name) / 'evidence'
        self.go = Path(self.temp.name) / 'go'
        self.make = Path(self.temp.name) / 'make'
        self.go.write_text('#!/usr/bin/env python3\nimport os\nprint(os.environ.get("ERS_IT02_FAKE_GO", "go version go1.26.2 darwin/arm64"))\n')
        self.make.write_text('''#!/usr/bin/env python3
import os, sys
print('FAKE make target:', sys.argv[1])
sys.exit(19 if sys.argv[1] == os.environ.get('ERS_IT02_FAKE_FAIL') else 0)
''')
        self.go.chmod(0o700)
        self.make.chmod(0o700)

    def execute(self, *, fail='', go_version='go version go1.26.2 darwin/arm64', go=None, make=None):
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {'ERS_IT02_FAKE_FAIL': fail, 'ERS_IT02_FAKE_GO': go_version}):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                status = module.run(self.root, self.output_root, go_command=str(go or self.go), make_command=str(make or self.make))
        return status, stdout.getvalue(), stderr.getvalue()

    def load_report(self):
        reports = list(self.output_root.glob('*/IT-02-*/it02-evidence.json'))
        self.assertEqual(len(reports), 1)
        return json.loads(reports[0].read_text()), reports[0]

    def test_four_named_results_go_version_and_real_evidence(self):
        status, output, errors = self.execute()
        self.assertEqual(status, 0, errors)
        self.assertIn('IT-02 GO VERSION: go version go1.26.2 darwin/arm64', output)
        self.assertIn('IT-02 SUMMARY: PASS (4/4 passed)', output)
        report, report_path = self.load_report()
        self.assertEqual(report['revision'], self.root_revision)
        self.assertTrue(report['working_tree_clean'])
        self.assertEqual(report['overall_status'], 'PASS')
        self.assertEqual(len(report['checks']), 4)
        self.assertNotIn(str(self.root) + '/it02-evidence.json', str(report_path))
        self.assertEqual(report_path.parent.stat().st_mode & 0o777, 0o700)
        for i, row in enumerate(report['checks'], start=1):
            self.assertEqual((row['result'], row['exit_code']), ('PASS', 0))
            self.assertIn(f'IT-02 RESULT {i}/4: {row["target"]} PASS exit=0', output)
            self.assertIn(f'IT-02 EVIDENCE REF {i}/4:', output)
            data = Path(row['evidence_ref']).read_bytes()
            import hashlib
            self.assertEqual(hashlib.sha256(data).hexdigest(), row['sha256'])
            self.assertEqual(Path(row['evidence_ref']).stat().st_mode & 0o777, 0o600)

    def test_failed_second_target_and_remaining_explicitly_skipped(self):
        status, output, errors = self.execute(fail='production-bootstrap-reconciliation-check')
        self.assertEqual(status, 1)
        self.assertIn('STOP: IT-02 failed', errors)
        report, _ = self.load_report()
        self.assertEqual([r['result'] for r in report['checks']], ['PASS','FAIL','SKIPPED','SKIPPED'])
        self.assertEqual(report['checks'][1]['exit_code'], 19)
        self.assertIn('IT-02 RESULT 3/4: onepassword-deployment-preflight-check SKIPPED', output)
        self.assertIn('IT-02 SUMMARY: FAIL (1/4 passed)', output)
        self.assertIsNone(report['checks'][2]['evidence_ref'])

    def test_wrong_go_version_blocks_before_make_and_creates_no_evidence(self):
        status, out, err = self.execute(go_version='go version go1.23.2 linux/amd64')
        self.assertEqual(status, 2)
        self.assertIn('requires Go 1.26.2', err)
        self.assertFalse(self.output_root.exists())

    def test_missing_go_blocks(self):
        status, out, err = self.execute(go=Path(self.temp.name)/'nonexistent-go')
        self.assertEqual(status, 2)
        self.assertIn('cannot execute Go', err)
        self.assertFalse(self.output_root.exists())

    def test_missing_make_is_logged_and_later_checks_skipped(self):
        status, out, err = self.execute(make=Path(self.temp.name)/'nonexistent-make')
        self.assertEqual(status, 1)
        report, _ = self.load_report()
        self.assertEqual([r['result'] for r in report['checks']], ['FAIL','SKIPPED','SKIPPED','SKIPPED'])
        self.assertEqual(report['checks'][0]['exit_code'], 127)

    def test_modified_worktree_is_reported_as_precommit_evidence(self):
        (self.root / 'README.md').write_text('Uncommitted work\n')
        status, out, err = self.execute()
        self.assertEqual(status, 0, err)
        self.assertIn('IT-02 WORKTREE: MODIFIED', out)
        self.assertIn('rerun after committing', out)
        report, _ = self.load_report()
        self.assertFalse(report['working_tree_clean'])

    def test_unknown_repository_is_blocked(self):
        # Explicitly test the validation branch without the fixture's .git.
        wrong = Path(self.temp.name)/'not-a-git-repo'
        wrong.mkdir()
        with contextlib.redirect_stderr(io.StringIO()) as log:
            status = module.run(wrong, self.output_root, go_command=str(self.go), make_command=str(self.make))
        self.assertEqual(status, 2)
        self.assertIn('cannot identify the repository', log.getvalue())


if __name__ == '__main__':
    unittest.main(verbosity=2)
