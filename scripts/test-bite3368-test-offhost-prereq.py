#!/usr/bin/env python3
"""Offline Linux/Bash fixture tests for the Test-only IT-03 provisioning helper."""
import os
import pathlib
import pty
import shutil
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'scripts/ers-bite3368-test-offhost-prereq.sh').read_text()


class TestIT03Prerequisite(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ers-it03-preflight-')
        self.addCleanup(self.tmp.cleanup)
        base = pathlib.Path(self.tmp.name).resolve()
        self.root = (base / 'test').resolve()
        self.root.mkdir()
        self.secrets = base / 'secrets'
        self.secrets.mkdir(mode=0o711)
        self.cred = self.secrets / 'aws-credentials-test'
        self.cred.write_text('[ers-test-backup]\naws_access_key_id=TEST_ONLY\naws_secret_access_key=TEST_ONLY_NOT_REAL\n')
        self.cred.chmod(0o600)
        self.envfile = self.root / '.env.test'
        self.fields = {
            'APP_ENV': 'test',
            'SERVER_OFFHOST_BACKUP_ENABLED': 'true',
            'SERVER_OFFHOST_BACKUP_TRANSPORT': 's3',
            'SERVER_OFFHOST_BACKUP_S3_ENDPOINT': 'https://fsn1.your-objectstorage.com',
            'SERVER_OFFHOST_BACKUP_S3_REGION': 'fsn1',
            'SERVER_OFFHOST_BACKUP_S3_BUCKET': 'ers-test-integration',
            'SERVER_OFFHOST_BACKUP_S3_PREFIX': 'ers-backups',
            'AWS_SHARED_CREDENTIALS_FILE': str(self.cred),
            'AWS_PROFILE': 'ers-test-backup',
        }
        self.write_env()
        subprocess.run(['git', 'init', '-q', '-b', 'test'], cwd=self.root, check=True)
        (self.root / 'scripts').mkdir()
        self.fake = self.root / 'scripts/run-backup-go-tool.sh'
        self.fake.write_text('#!/usr/bin/env bash\n[[ "${FAKE_GO_FAIL:-}" != 1 ]] || exit 2\nprintf "Off-host backup configuration valid for test: enabled\\n"\n')
        self.fake.chmod(0o755)
        source = SOURCE.replace('TEST_DIR=/opt/EnterpriseRemoteSystems/test', f'TEST_DIR={self.root}')
        source = source.replace('SECRET_DIR=/opt/EnterpriseRemoteSystems/test-secrets', f'SECRET_DIR={self.secrets}')
        source = source.replace('$(stat -c %U "$CRED_FILE")" == root', '$(stat -c %U "$CRED_FILE")" == ' + os.environ.get('USER', subprocess.check_output(['id', '-un'], text=True).strip()))
        source = source.replace('$(stat -c %U "$SECRET_DIR")" == root', '$(stat -c %U "$SECRET_DIR")" == ' + subprocess.check_output(['id', '-un'], text=True).strip())
        self.mock_bin = base / 'bin'
        self.mock_bin.mkdir()
        # Linux-only host tools are replaced in this LOCAL harness. On a real
        # Test host the deployed helper invokes native Linux stat/install/sudo.
        fake_stat = self.mock_bin / 'stat'
        fake_stat.write_text("""#!/usr/bin/env bash
[[ "${1:-}" == -c ]] || exit 2
if /usr/bin/stat -c "$2" "$3" 2>/dev/null; then exit 0; fi
case "$2" in
  %a) exec /usr/bin/stat -f '%Lp' "$3" ;;
  %U) exec /usr/bin/stat -f '%Su' "$3" ;;
  *) exit 2 ;;
esac
""")
        fake_stat.chmod(0o755)
        fake_sudo = self.mock_bin / 'sudo'
        fake_sudo.write_text('#!/bin/sh\n[ "${1:-}" = -v ] && exit 0\nexec "$@"\n')
        fake_sudo.chmod(0o755)
        fake_install = self.mock_bin / 'install'
        fake_install.write_text("""#!/usr/bin/env python3
import os, pathlib, shutil, sys
args=sys.argv[1:]
mode=0o600
isdir=False
while args and args[0].startswith('-'):
    flag=args.pop(0)
    if flag == '-d': isdir=True
    elif flag == '-m': mode=int(args.pop(0),8)
    elif flag in ('-o','-g'): args.pop(0)
    else: raise SystemExit(2)
if isdir:
    p=pathlib.Path(args[0]); p.mkdir(parents=True, exist_ok=True); p.chmod(mode)
else:
    shutil.copyfile(args[0], args[1]); os.chmod(args[1], mode)
""")
        fake_install.chmod(0o755)
        self.script = base / 'helper.sh'
        self.script.write_text(source)
        self.script.chmod(0o755)

    def write_env(self):
        self.envfile.write_text('\n'.join(f'{key}={v}' for key, v in self.fields.items()) + '\n')

    def call(self, action='preflight', cwd=None, **env):
        # Never inherit the developer's interactive terminal. On macOS the
        # inherited stdin is a TTY even with capture_output=True, which lets
        # the Linux-only helper enter read -p and hang the LOCAL regression.
        return subprocess.run(['bash', str(self.script), action], cwd=cwd or self.root,
                              env={**os.environ, 'PATH': str(self.mock_bin)+os.pathsep+os.environ['PATH'], **env},
                              stdin=subprocess.DEVNULL, text=True, capture_output=True, timeout=15)

    def assert_blocked(self, result, fragment):
        self.assertEqual(result.returncode, 2, (result.stdout, result.stderr))
        self.assertIn('BLOCKED: ' + fragment, result.stderr)
        self.assertNotIn('TEST_ONLY_NOT_REAL', result.stdout + result.stderr)

    def test_preflight_succeeds_with_go_checker(self):
        r = self.call()
        self.assertEqual(r.returncode, 0, (r.stdout, r.stderr))
        self.assertIn('READY FOR AUTHORIZED TEST BACKUP', r.stdout)
        self.assertNotIn('TEST_ONLY', r.stdout)

    def test_missing_env_blocks(self):
        self.envfile.unlink()
        self.assert_blocked(self.call(), 'missing or symlinked .env.test')

    def test_wrong_checkout_blocks(self):
        self.assert_blocked(self.call(cwd=self.secrets), 'run from the deployed Test checkout')

    def test_wrong_branch_blocks(self):
        subprocess.run(['git', 'checkout', '-q', '-b', 'development'], cwd=self.root, check=True)
        self.assert_blocked(self.call(), 'the current branch is not test')

    def test_disabled_backup_blocks(self):
        self.fields['SERVER_OFFHOST_BACKUP_ENABLED'] = 'false'; self.write_env()
        self.assert_blocked(self.call(), 'SERVER_OFFHOST_BACKUP_ENABLED is not the required Test value')

    def test_missing_credential_blocks(self):
        self.cred.unlink()
        self.assert_blocked(self.call(), 'Test S3 credentials file missing')

    def test_symlink_credential_blocks(self):
        self.cred.unlink(); target = self.secrets / 'target'; target.write_text('not real')
        self.cred.symlink_to(target)
        self.assert_blocked(self.call(), 'Test S3 credentials file missing')

    def test_insecure_mode_blocks(self):
        self.cred.chmod(0o644)
        self.assert_blocked(self.call(), 'Test S3 credential file permissions must be 600')

    def test_insecure_directory_blocks(self):
        self.secrets.chmod(0o777)
        self.assert_blocked(self.call(), 'secret directory must be root owned and mode 711')

    def test_endpoint_region_mismatch_blocks(self):
        self.fields['SERVER_OFFHOST_BACKUP_S3_ENDPOINT'] = 'https://hel1.your-objectstorage.com'; self.write_env()
        self.assert_blocked(self.call(), 'Hetzner HTTPS endpoint does not match region')

    def test_wrong_credential_path_blocks(self):
        self.fields['AWS_SHARED_CREDENTIALS_FILE'] = '/opt/EnterpriseRemoteSystems/secrets/aws-credentials'; self.write_env()
        self.assert_blocked(self.call(), 'AWS_SHARED_CREDENTIALS_FILE is not the required Test value')

    def test_duplicate_env_key_blocks(self):
        with self.envfile.open('a') as f: f.write('AWS_PROFILE=another\n')
        self.assert_blocked(self.call(), 'missing or duplicate AWS_PROFILE')

    def test_go_config_failure_blocks(self):
        self.assert_blocked(self.call(FAKE_GO_FAIL='1'), 'deployed Go off-host check-config failed')

    def test_install_requires_interactive_terminal(self):
        self.assert_blocked(self.call('install-credentials'), 'interactive terminal required')

    def scripted_input(self, command, lines):
        """Offline script fixture: bypass the TTY guard ONLY in a private copy.

        Non-interactive refusal is separately tested against the unmodified
        helper. Running Bash with scripted input is deterministic on macOS/CI.
        """
        fixture = self.script.parent / 'tty-branch-test-fixture.sh'
        fixture.write_text(self.script.read_text().replace('[[ -t 0 ]] ||', 'true ||'))
        fixture.chmod(0o755)
        return subprocess.run(['bash', str(fixture), command], cwd=self.root,
                              input='\n'.join(lines) + '\n', text=True, capture_output=True, timeout=15,
                              env={**os.environ, 'PATH': str(self.mock_bin)+os.pathsep+os.environ['PATH']})

    def test_configure_branch_keeps_other_settings_and_private_backup(self):
        with self.envfile.open('a') as f:
            f.write('EXISTING_NONSECRET_TEST_SETTING=preserve\n')
        r = self.scripted_input('configure', (
            'CHG-TEST-123', 'fsn1', 'ers-test-integration', 'ers-backups', 'APPROVED-TEST',
        ))
        self.assertEqual(r.returncode, 0, (r.stdout, r.stderr))
        self.assertIn('PASS: Test off-host configuration updated', r.stdout)
        contents = self.envfile.read_text()
        self.assertIn('EXISTING_NONSECRET_TEST_SETTING=preserve', contents)
        self.assertEqual(contents.count('SERVER_OFFHOST_BACKUP_ENABLED='), 1)
        self.assertEqual(self.call().returncode, 0)
        self.assertEqual(len(list(self.secrets.glob('env-test-pre-it03-*.bak'))), 1)

    def test_install_branch_is_create_only_and_does_not_echo_key(self):
        self.cred.unlink()
        r = self.scripted_input('install-credentials', (
            'CHG-TEST-124', 'TEST_ACCESS_KEY_UNSHARED', 'TEST_SECRET_KEY_UNSHARED',
        ))
        self.assertEqual(r.returncode, 0, (r.stdout, r.stderr))
        self.assertIn('PASS: new Test-only credential file installed', r.stdout)
        self.assertNotIn('TEST_SECRET_KEY_UNSHARED', r.stdout+r.stderr)
        self.assertNotIn('TEST_ACCESS_KEY_UNSHARED', r.stdout+r.stderr)
        self.assertEqual(self.cred.stat().st_mode & 0o777, 0o600)
        self.assertIn('TEST_SECRET_KEY_UNSHARED', self.cred.read_text())
        self.assertEqual(self.call().returncode, 0)
        r = self.scripted_input('install-credentials', ('CHG-TEST-125',))
        self.assert_blocked(r, 'Test credential file already exists')

    def test_configure_requires_interactive_terminal(self):
        self.assert_blocked(self.call('configure'), 'interactive Test operator required')

    def test_offline_call_explicitly_disables_stdin_and_has_timeout(self):
        # A subprocess with captured stdout/stderr can still inherit stdin.
        # Check both protections independently of the shell's current TTY.
        with mock.patch('subprocess.run', wraps=subprocess.run) as runner:
            self.assert_blocked(self.call('configure'), 'interactive Test operator required')
        kwargs = runner.call_args.kwargs
        self.assertEqual(kwargs['stdin'], subprocess.DEVNULL)
        self.assertGreater(kwargs['timeout'], 0)
        self.assertLessEqual(kwargs['timeout'], 20)

    def test_offline_tty_inherited_by_parent_does_not_hang(self):
        # Reproduce macOS 'make' invoked from an interactive terminal: the
        # test process has an actual pseudo-TTY on fd 0. Without explicit
        # stdin=DEVNULL in call(), the helper prompts invisibly and hangs.
        for method in ('test_configure_requires_interactive_terminal',
                       'test_install_requires_interactive_terminal'):
            with self.subTest(method=method):
                master, slave = pty.openpty()
                process = None
                try:
                    process = subprocess.Popen(
                        [sys.executable, '-B', str(pathlib.Path(__file__).resolve()),
                         'TestIT03Prerequisite.' + method],
                        cwd=ROOT, stdin=slave, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, text=True, start_new_session=True)
                    os.close(slave)
                    slave = -1
                    try:
                        out, err = process.communicate(timeout=10)
                    except subprocess.TimeoutExpired:
                        # Kill the entire group so a blocking child Bash is
                        # not left behind holding the pseudo-terminal open.
                        os.killpg(process.pid, signal.SIGKILL)
                        process.communicate(timeout=5)
                        self.fail('LOCAL prerequisite regression inherited a TTY and hung')
                    self.assertEqual(process.returncode, 0, (out, err))
                    self.assertIn('OK', err)
                finally:
                    if slave >= 0:
                        os.close(slave)
                    os.close(master)

    def test_scripted_operator_input_has_timeout(self):
        # Only this explicit fixture may supply operator responses; it also
        # needs a limit so fixture mistakes cannot block the LOCAL suite.
        with mock.patch('subprocess.run', wraps=subprocess.run) as runner:
            result = self.scripted_input('configure',
                ('CHG-TEST-TIMEOUT', 'fsn1', 'ers-test-integration',
                 'ers-backups', 'APPROVED-TEST'))
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        kwargs = runner.call_args.kwargs
        self.assertTrue(kwargs['input'].endswith('\n'))
        self.assertGreater(kwargs['timeout'], 0)
        self.assertLessEqual(kwargs['timeout'], 20)


if __name__ == '__main__':
    unittest.main(verbosity=2)
