#!/usr/bin/env python3
"""Rehearsal cleanup is scoped, safe on failure and leaves report evidence."""
import os
import pathlib
import subprocess
import tempfile
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'ers-recovery-private-cleanup.sh'

class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ers-cleanup-')
        self.addCleanup(self.tmp.cleanup)
        self.root=pathlib.Path(self.tmp.name) / 'rehearsals'
        self.run=self.root / 'rehearsal-001'
        self.other=self.root / 'rehearsal-002'
        self.run.mkdir(parents=True); self.other.mkdir()
        (self.run/'source').mkdir()
        (self.run/'source'/'app-2026.db').write_bytes(b'sensitive')
        (self.run/'restored.db').write_bytes(b'sensitive')
        (self.run/'boot-data').mkdir()
        (self.run/'boot-data'/'app.db').write_bytes(b'sensitive')
        (self.run/'boot-data'/'app.db-wal').write_bytes(b'sensitive')
        (self.run/'rehearsal.json').write_text('{"status":"passed"}')
        (self.other/'keep.db').write_bytes(b'untouched')

    def call(self, root=None, run=None, owned='false'):
        return subprocess.run(['bash',str(SCRIPT),str(root or self.root),str(run or self.run),'ers-3368a-test',owned],
            capture_output=True,text=True,stdin=subprocess.DEVNULL,timeout=10)

    def test_success_disposes_only_its_own_db_and_keeps_evidence(self):
        r=self.call(); self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(list(self.run.rglob('*.db')),[])
        self.assertEqual(list(self.run.rglob('*.db-wal')),[])
        self.assertTrue((self.run/'rehearsal.json').exists())
        self.assertTrue((self.run/'cleanup.txt').read_text().startswith('PASS:'))
        self.assertTrue((self.other/'keep.db').exists())

    def test_refuses_root_and_sibling_paths(self):
        self.assertNotEqual(self.call(run=self.root).returncode,0)
        self.assertNotEqual(self.call(run=self.other/'../outside').returncode,0)
        self.assertTrue((self.run/'restored.db').exists())

    def test_symlink_rehearsal_refused(self):
        alias=self.root/'rehearsal-link'
        alias.symlink_to(self.run)
        self.assertNotEqual(self.call(run=alias).returncode,0)
        self.assertTrue((self.run/'restored.db').exists())

if __name__=='__main__': unittest.main(verbosity=2)
