#!/usr/bin/env python3
"""Offline, non-network regression tests for the GitHub Training SSH diagnostic."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/ers-trn-ssh-diagnostic.sh'
FLOW = ROOT / '.github/workflows/diagnose-training-ssh.yml'
VALID = ('-----BEGIN OPENSSH PRIVATE KEY-----\n'
         'MOCK_VALID_PRIVATE_KEY\n'
         '-----END OPENSSH PRIVATE KEY-----')

KEYGEN = r"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == '-y' ]]; then
  [[ "$2" == '-P' && "$3" == '' && "$4" == '-f' ]] || exit 9
  grep -q 'MOCK_VALID_PRIVATE_KEY' "$5" || exit 1
elif [[ "$1" == '-F' ]]; then
  [[ "$2" == 'example.test' && "$3" == '-f' ]] || exit 9
  grep -q '^example.test ' "$4" || exit 1
else
  exit 9
fi
"""
SSH = r"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$MOCK_SSH_ARGS"
exit "${MOCK_SSH_STATUS:-0}"
"""

class TrainingSshDiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ers-trn-diagnostic-test-')
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        bin_dir = self.dir / 'bin'
        bin_dir.mkdir()
        for name, body in (('ssh-keygen', KEYGEN), ('ssh', SSH)):
            p = bin_dir / name
            p.write_text(body)
            p.chmod(0o755)
        self.ssh_args = self.dir / 'ssh-args'
        self.env = {
            **os.environ,
            'PATH': str(bin_dir) + os.pathsep + os.environ['PATH'],
            'RUNNER_TEMP': self.temp.name,
            'MOCK_SSH_ARGS': str(self.ssh_args),
            'TRN_DIAGNOSTIC_CONFIRMATION': 'DIAGNOSE-TRAINING-SSH-ONLY',
            'TRN_SSH_PRIVATE_KEY': VALID,
            'TRN_SSH_KNOWN_HOSTS': 'example.test ssh-ed25519 AAAATEST',
            'TRN_DEPLOY_HOST': 'example.test',
            'TRN_DEPLOY_USER': 'deploy',
        }

    def run_diagnostic(self, **changes):
        env = {**self.env, **changes}
        return subprocess.run(['bash', str(SCRIPT)], env=env, text=True,
                              capture_output=True, timeout=8)

    def test_read_only_success_and_clean_secret_handling(self):
        run = self.run_diagnostic()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn('PASS: Noninteractive, pinned, read-only SSH', run.stdout)
        self.assertNotIn('MOCK_VALID_PRIVATE_KEY', run.stdout + run.stderr)
        self.assertTrue(self.ssh_args.exists())
        args = self.ssh_args.read_text().splitlines()
        self.assertEqual(args[-2:], ['deploy@example.test', 'true'])
        for required in ('BatchMode=yes', 'IdentitiesOnly=yes', 'IdentityAgent=none',
                         'StrictHostKeyChecking=yes', 'PasswordAuthentication=no'):
            self.assertIn(required, args)
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), ['bin', 'ssh-args'])

    def test_empty_secret_fails_before_network(self):
        run = self.run_diagnostic(TRN_SSH_PRIVATE_KEY='')
        self.assertEqual(run.returncode, 2)
        self.assertIn('BLOCKED:', run.stderr)
        self.assertFalse(self.ssh_args.exists())

    def test_1password_service_token_rejected_without_leak(self):
        run = self.run_diagnostic(TRN_SSH_PRIVATE_KEY='ops_SUPER_SECRET_FIXTURE')
        self.assertEqual(run.returncode, 2)
        self.assertIn('service-account token', run.stderr)
        self.assertNotIn('ops_SUPER_SECRET_FIXTURE', run.stderr)
        self.assertFalse(self.ssh_args.exists())

    def test_public_key_rejected(self):
        run = self.run_diagnostic(TRN_SSH_PRIVATE_KEY='ssh-ed25519 AAAAFIXTURE')
        self.assertEqual(run.returncode, 2)
        self.assertFalse(self.ssh_args.exists())

    def test_malformed_key_rejected_before_network(self):
        run = self.run_diagnostic(TRN_SSH_PRIVATE_KEY='NOT A PRIVATE KEY')
        self.assertEqual(run.returncode, 2)
        self.assertIn('cannot be parsed', run.stderr)
        self.assertFalse(self.ssh_args.exists())

    def test_host_pin_missing_rejected_before_network(self):
        run = self.run_diagnostic(TRN_SSH_KNOWN_HOSTS='other.test ssh-ed25519 AAAATEST')
        self.assertEqual(run.returncode, 2)
        self.assertIn('no pinned entry', run.stderr)
        self.assertFalse(self.ssh_args.exists())

    def test_ssh_auth_failure_is_blocked(self):
        run = self.run_diagnostic(MOCK_SSH_STATUS='255')
        self.assertEqual(run.returncode, 2)
        self.assertIn('Read-only SSH login failed', run.stderr)
        self.assertTrue(self.ssh_args.exists())

    def test_unconfirmed_diagnostic_rejected(self):
        run = self.run_diagnostic(TRN_DIAGNOSTIC_CONFIRMATION='')
        self.assertEqual(run.returncode, 2)
        self.assertFalse(self.ssh_args.exists())

    def test_bad_host_placeholder_rejected(self):
        run = self.run_diagnostic(TRN_DEPLOY_HOST='deploy_host')
        self.assertEqual(run.returncode, 2)
        self.assertFalse(self.ssh_args.exists())

    def test_bad_user_rejected(self):
        run = self.run_diagnostic(TRN_DEPLOY_USER='deploy; echo unsafe')
        self.assertEqual(run.returncode, 2)
        self.assertFalse(self.ssh_args.exists())

    def test_workflow_is_dispatch_only_and_non_deploying(self):
        s = FLOW.read_text()
        self.assertIn('workflow_dispatch:', s)
        self.assertIn("if: github.ref_name == 'test'", s)
        self.assertIn('environment: training', s)
        self.assertIn('permissions:\n  contents: read', s)
        self.assertIn('secrets.DEPLOY_SSH_PRIVATE_KEY', s)
        self.assertIn('scripts/ers-trn-ssh-diagnostic.sh', s)
        self.assertNotIn('OP_SERVICE_ACCOUNT_TOKEN', s)
        for forbidden in ('deploy-training.yml', 'server-up', 'server-build',
                          'migration-recovery-gate', 'docker compose', 'ssh-keyscan'):
            self.assertNotIn(forbidden, s)
        try:
            import yaml
        except ImportError:
            pass
        else:
            document = yaml.load(s, Loader=yaml.BaseLoader)
            self.assertEqual(list(document['jobs']), ['training-ssh-diagnostic'])

    def test_shell_syntax(self):
        run = subprocess.run(['bash', '-n', str(SCRIPT)], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)

if __name__ == '__main__':
    unittest.main(verbosity=2)
