#!/usr/bin/env python3
"""Executable failure-path test of the real server-backup Make shell recipe.

The script runs only in a temporary fake checkout. Docker, backups, and off-host
replication are replaced by explicit stubs; deployed services are never touched.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
MAKEFILE = (ROOT/'Makefile').read_text()
SECTION = MAKEFILE.split('\nserver-backup:\n',1)[1].split('\n.PHONY: server-backup-verify',1)[0]


class BackupFailureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ers3368b-backup-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root/'backups').mkdir()
        (self.root/'scripts').mkdir()
        (self.root/'bin').mkdir()
        self.trace = self.root/'trace'
        self.write('bin/docker', '''#!/bin/bash
if [[ "$1 $2" == 'ps --format' ]]; then echo 'mock-backend'; exit 0; fi
exit 0
''')
        self.write('bin/make', '''#!/bin/bash
printf 'make %s\\n' "$*" >> "$MOCK_TRACE"
exit 0
''')
        self.write('scripts/server-sqlite-backup.sh', '''#!/bin/bash
printf 'backup invoked\\n' >> "$MOCK_TRACE"
if [[ "$MOCK_CASE" == fail ]]; then exit 9; fi
if [[ "$MOCK_CASE" == missing_result ]]; then exit 0; fi
backup="$MOCK_ROOT/backups/candidate.db"
if [[ "$MOCK_CASE" != missing_artifact ]]; then echo 'db' > "$backup"; fi
printf '%s\\n' "$backup" > "$BACKUP_RESULT_FILE"
''')
        self.write('scripts/run-backup-go-tool.sh', '''#!/bin/bash
printf 'offhost status called\\n' >> "$MOCK_TRACE"
echo enabled
''')
        # This is the Make recipe, expanded only for the controlled test values.
        recipe = '\n'.join(line[1:] if line.startswith('\t') else line for line in SECTION.splitlines())
        for value, replacement in (('$(MAKE)', 'make'), ('$(CONTAINER_PREFIX)', 'mock'),
                                   ('$(COMPOSE_PROJECT)', 'mock'), ('$(ENV_DIR)', str(self.root)),
                                   ('$(ENV_FILE)', 'mock.env'), ('$(ENV)', 'test'),
                                   ('$(SERVER_BACKUP_RETENTION_COUNT)', '14'),
                                   ('$(SERVER_BACKUP_RETENTION_DAYS)', '30')):
            recipe = recipe.replace(value, replacement)
        recipe = recipe.replace('$$', '$')
        recipe = '\n'.join(line[1:] if line.startswith('@') else line for line in recipe.splitlines())
        self.recipe = recipe

    def write(self, name, contents):
        p = self.root/name
        p.write_text(contents)
        p.chmod(0o700)

    def run_case(self, case):
        env = dict(os.environ, PATH=f'{self.root}/bin:{os.environ.get("PATH", "")}',
                   MOCK_TRACE=str(self.trace), MOCK_CASE=case, MOCK_ROOT=str(self.root))
        proc = subprocess.run(['bash', '-c', self.recipe], cwd=self.root, env=env,
                              text=True, capture_output=True)
        log = self.trace.read_text() if self.trace.exists() else ''
        return proc, log

    def test_script_failure_blocks_replication(self):
        proc, log = self.run_case('fail')
        self.assertEqual(proc.returncode, 9, proc.stderr)
        self.assertIn('backup invoked', log)
        self.assertNotIn('offhost status called', log)
        self.assertNotIn('server-offhost-backup', log)

    def test_missing_result_blocks_replication(self):
        proc, log = self.run_case('missing_result')
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn('backup result missing', proc.stderr)
        self.assertNotIn('offhost status called', log)

    def test_missing_artifact_blocks_replication(self):
        proc, log = self.run_case('missing_artifact')
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn('backup artifact missing or empty', proc.stderr)
        self.assertNotIn('offhost status called', log)

    def test_success_invokes_replication(self):
        proc, log = self.run_case('success')
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn('offhost status called', log)
        self.assertIn('server-offhost-backup ENV=test', log)


if __name__ == '__main__':
    unittest.main()
