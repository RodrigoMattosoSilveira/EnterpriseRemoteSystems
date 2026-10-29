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
        self.base = Path(self._tmp.name)
        self.host = self.base / 'test'
        self.host.mkdir()
        (self.host / 'scripts').mkdir()
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.log = self.base / 'calls.log'
        self.utility = self.host / 'scripts/run-backup-go-tool.sh'
        self.utility.write_text('#!/bin/bash\nprintf "%s\\n" "${MOCK_STATUS:-disabled}"\n')
        self.utility.chmod(0o755)
        git = self.bin / 'git'
        git.write_text('#!/bin/bash\ncase "$1 $2" in "branch --show-current") echo test;; "rev-parse HEAD") echo 0123456789012345678901234567890123456789;; "rev-parse HEAD^{tree}") echo 9876543210987654321098765432109876543210;; esac\n')
        git.chmod(0o755)
        make = self.bin / 'make'
        make.write_text('''#!/bin/bash
printf '%s\\n' "$*" >> "$MOCK_LOG"
if [[ "$1" == server-backup && "${MOCK_BACKUP_FAIL:-}" == yes ]]; then
  echo 'simulated backup failure' >&2
  exit 7
fi
exit 0
''')
        make.chmod(0o755)

    def call(self, heading, *, status='disabled', answer='', cwd_ok=True, backup_fail=False):
        code = code_after(heading).replace('/opt/EnterpriseRemoteSystems/test', str(self.host))
        env = dict(os.environ, PATH=f'{self.bin}:{os.environ.get("PATH", "")}',
                   MOCK_STATUS=status, MOCK_LOG=str(self.log),
                   MOCK_BACKUP_FAIL='yes' if backup_fail else '')
        cwd = self.host if cwd_ok else self.base
        return subprocess.run(['bash', '-c', code], cwd=cwd, env=env,
                              input=answer, text=True, capture_output=True)

    def called_backup(self):
        return 'server-backup ENV=test' in self.log.read_text() if self.log.exists() else False

    def test_inventory_without_existing_directory(self):
        r = self.call('#### Step 1A — ', status='disabled')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('Managed Test off-host receipts found: 0', r.stdout)
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
