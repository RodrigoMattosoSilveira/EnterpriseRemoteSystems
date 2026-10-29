#!/usr/bin/env python3
"""Executable shell-flow regressions for IT-03 Test backup preparation.

All commands are run against an isolated temporary directory with stubbed git,
make, and backup utility; no Docker, real database, or network access occurs.
"""
from pathlib import Path
import os
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
DOC = (ROOT / 'docs/bite-3368/manual-acceptance-tests.md').read_text()
IT03 = DOC.split('## IT-03 — ', 1)[1].split('## IT-04 — ', 1)[0]


def code_after(heading: str) -> str:
    section = IT03.split(heading, 1)[1]
    match = re.search(r'```bash\n(.*?)\n```', section, re.S)
    if not match:
        raise AssertionError(f'no bash code block following {heading}')
    return match.group(1)


class TestBackupGate(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix='ers-it03-backup-gate-')
        self.addCleanup(self._tmp.cleanup)
        # macOS TemporaryDirectory may return /var/... while Bash pwd -P prints
        # /private/var/.... Resolve before embedding the expected Test root in
        # the mocked server script. Linux typically has no such alias.
        self.base = Path(self._tmp.name).resolve()
        self.host = self.base / 'test'
        self.host.mkdir()
        self.alias = self.base / 'test-checkout-alias'
        self.alias.symlink_to(self.host, target_is_directory=True)
        (self.host / 'scripts').mkdir()
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.log = self.base / 'calls.log'
        self.utility = self.host / 'scripts/run-backup-go-tool.sh'
        self.utility.write_text('#!/bin/bash\nprintf "%s\\n" "${MOCK_STATUS:-disabled}"\nif [[ "${MOCK_STATUS_FAIL:-}" == yes ]]; then exit 9; fi\n')
        self.utility.chmod(0o755)
        git = self.bin / 'git'
        git.write_text('#!/bin/bash\ncase "$1 $2" in "branch --show-current") echo "${MOCK_BRANCH:-test}";; "rev-parse HEAD") echo 0123456789012345678901234567890123456789;; "rev-parse HEAD^{tree}") echo 9876543210987654321098765432109876543210;; esac\n')
        git.chmod(0o755)
        make = self.bin / 'make'
        make.write_text('''#!/bin/bash
printf '%s\\n' "$*" >> "$MOCK_LOG"
if [[ "$1" == server-backend-health && "${MOCK_HEALTH_FAIL:-}" == yes ]]; then
  echo 'simulated Test backend unhealthy' >&2
  exit 8
fi
if [[ "$1" == server-backup && "${MOCK_BACKUP_FAIL:-}" == yes ]]; then
  echo 'simulated backup failure' >&2
  exit 7
fi
exit 0
''')
        make.chmod(0o755)

    def call(self, heading, *, status='disabled', answer='', cwd_ok=True,
             backup_fail=False, status_fail=False, unhealthy=False,
             branch='test', via_alias=False):
        code = code_after(heading).replace('/opt/EnterpriseRemoteSystems/test', str(self.host))
        env = dict(os.environ, PATH=f'{self.bin}:{os.environ.get("PATH", "")}',
                   MOCK_STATUS=status, MOCK_LOG=str(self.log), MOCK_BRANCH=branch,
                   MOCK_STATUS_FAIL='yes' if status_fail else '',
                   MOCK_HEALTH_FAIL='yes' if unhealthy else '',
                   MOCK_BACKUP_FAIL='yes' if backup_fail else '')
        cwd = (self.alias if via_alias else self.host) if cwd_ok else self.base
        return subprocess.run(['bash', '-c', code], cwd=cwd, env=env,
                              input=answer, text=True, capture_output=True)

    def called_backup(self):
        return 'server-backup ENV=test' in self.log.read_text() if self.log.exists() else False

    def test_inventory_without_existing_directory(self):
        r = self.call('#### Step 1A — ', status='disabled')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('Managed Test off-host receipts found: 0', r.stdout)
        self.assertFalse(self.called_backup())

    def test_inventory_with_real_receipts_newest_first_and_ignores_nonfiles(self):
        backups = self.host / 'backups'
        backups.mkdir()
        old = 'app-20261027T120000Z.db.offhost.json'
        new = 'app-20261029T120000Z.db.offhost.json'
        for name in (new, old):
            (backups / name).write_text('{}')
        (backups / 'app-20261030T120000Z.db.offhost.json').symlink_to(backups / new)
        (backups / 'app-20261031T120000Z.db.offhost.json').mkdir()
        (backups / 'unrelated.offhost.json').write_text('{}')
        r = self.call('#### Step 1A — ')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('Managed Test off-host receipts found: 2', r.stdout)
        self.assertLess(r.stdout.index('  1) ' + str(backups / new)),
                        r.stdout.index('  2) ' + str(backups / old)))
        self.assertFalse(self.called_backup())

    def test_select_existing_receipt_verifies_correct_backup_only(self):
        backups = self.host / 'backups'
        backups.mkdir()
        old = backups / 'app-20261027T120000Z.db.offhost.json'
        new = backups / 'app-20261029T120000Z.db.offhost.json'
        old.write_text('{}')
        new.write_text('{}')
        r = self.call('#### Step 1D — ', answer='1\n')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('PASS: verified Test off-host receipt:', r.stdout)
        self.assertIn(f'server-offhost-backup-verify ENV=test BACKUP_FILE={str(new)[:-len(".offhost.json")]}', self.log.read_text())
        self.assertFalse(self.called_backup())

    def test_select_receipt_without_candidates_stays_blocked(self):
        (self.host / 'backups').mkdir()
        r = self.call('#### Step 1D — ', answer='1\n')
        self.assertIn('BLOCKED: no Test .offhost.json receipts found', r.stderr)
        self.assertFalse(self.called_backup())

    def test_symlinked_checkout_alias_is_accepted_using_physical_path(self):
        # Simulates macOS /var -> /private/var path normalization.
        self.assertEqual(self.host, self.alias.resolve())
        r = self.call('#### Step 1C — ', status='enabled',
                      answer='TEST-APPROVAL-001\n', via_alias=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(self.called_backup())

    def test_unhealthy_test_backend_never_creates_backup(self):
        r = self.call('#### Step 1C — ', status='enabled',
                      answer='TEST-APPROVAL-001\n', unhealthy=True)
        self.assertIn('Test backend not healthy', r.stderr)
        self.assertFalse(self.called_backup())

    def test_wrong_branch_never_creates_backup(self):
        r = self.call('#### Step 1C — ', status='enabled',
                      answer='TEST-APPROVAL-001\n', branch='development')
        self.assertIn('non-Test checkout', r.stderr)
        self.assertFalse(self.called_backup())

    def test_failing_status_probe_never_creates_backup(self):
        r = self.call('#### Step 1C — ', status='enabled',
                      answer='TEST-APPROVAL-001\n', status_fail=True)
        self.assertIn('Test off-host status probe failed', r.stderr)
        self.assertFalse(self.called_backup())

    def test_status_disabled_never_creates_backup(self):
        r = self.call('#### Step 1C — ', status='disabled', answer='CHANGE-APPROVED\n')
        self.assertIn('BLOCKED: Test off-host backup status is not enabled', r.stderr)
        self.assertFalse(self.called_backup())

    def test_no_approval_never_creates_backup(self):
        r = self.call('#### Step 1C — ', status='enabled', answer='\n')
        self.assertIn('no Test backup authorization reference supplied', r.stderr)
        self.assertFalse(self.called_backup())

    def test_wrong_directory_never_creates_backup(self):
        r = self.call('#### Step 1C — ', status='enabled', answer='CHANGE-APPROVED\n', cwd_ok=False)
        self.assertIn('non-Test checkout', r.stderr)
        self.assertFalse(self.called_backup())

    def test_authorized_enabled_backup_calls_existing_target_once(self):
        r = self.call('#### Step 1C — ', status='enabled', answer='TEST-APPROVAL-001\n')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(self.called_backup())
        self.assertEqual(self.log.read_text().count('server-backup ENV=test'), 1)
        self.assertIn('independently verify its off-host receipt', r.stdout)

    def test_backup_failure_reports_blocked(self):
        r = self.call('#### Step 1C — ', status='enabled', answer='TEST-APPROVAL-001\n', backup_fail=True)
        self.assertTrue(self.called_backup())
        self.assertIn('backup/replication failed', r.stderr)
        self.assertNotIn('PASS: Test backup command completed', r.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
