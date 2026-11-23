#!/usr/bin/env python3
"""Offline tests of scope comparisons and private-key classification; never contacts SSH."""
from __future__ import annotations

import base64
import importlib.util
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/ers-ssh-credential-classify.py'
WORKFLOW = ROOT / '.github/workflows/compare-ssh-credential-scopes.yml'
COMPARE = ROOT / 'scripts/ers-ssh-scope-compare.py'
spec = importlib.util.spec_from_file_location('ssh_key_classification', SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
compare_spec = importlib.util.spec_from_file_location('ssh_scope_compare', COMPARE)
assert compare_spec and compare_spec.loader
compare_module = importlib.util.module_from_spec(compare_spec)
compare_spec.loader.exec_module(compare_module)


def string(value: bytes) -> bytes:
    return struct.pack('>I', len(value)) + value


def openssh_key(cipher=b'none', kdf=b'none', public=b'fake-public', private=b'fake-private'):
    body = (b'openssh-key-v1\0' + string(cipher) + string(kdf) + string(b'') +
            struct.pack('>I', 1) + string(public) + string(private))
    encoded = base64.b64encode(body).decode('ascii')
    return '-----BEGIN OPENSSH PRIVATE KEY-----\n' + encoded + '\n-----END OPENSSH PRIVATE KEY-----\n'


class CredentialClassificationTests(unittest.TestCase):
    def test_missing_key(self):
        self.assertEqual(module._container(''), 'MISSING')

    def test_service_account_token(self):
        self.assertEqual(module._container('ops_TEST_ONLY_NEVER_REAL'), 'WRONG_TYPE_SERVICE_ACCOUNT_TOKEN')

    def test_public_key(self):
        self.assertEqual(module._container('ssh-ed25519 AAAAFIXTURE person@example.test'), 'WRONG_TYPE_PUBLIC_KEY')

    def test_literal_backslash_n(self):
        self.assertEqual(module._container(openssh_key().replace('\n', '\\n')), 'ESCAPED_LINE_BREAKS')

    def test_open_ssh_clear_container(self):
        self.assertEqual(module._container(openssh_key()), 'OPENSSH_UNENCRYPTED_DECLARED')

    def test_open_ssh_encrypted_container(self):
        self.assertEqual(module._container(openssh_key(b'aes256-ctr', b'bcrypt')), 'OPENSSH_ENCRYPTED_DECLARED')

    def test_open_ssh_truncated_payload(self):
        raw = openssh_key(private=b'fake-private')
        lines = raw.splitlines()
        data = bytearray(base64.b64decode(lines[1]))
        data.pop()
        lines[1] = base64.b64encode(bytes(data)).decode()
        self.assertEqual(module._container('\n'.join(lines)), 'UNRECOGNIZED_OR_MALFORMED')

    def test_open_ssh_wrong_magic(self):
        self.assertEqual(module._container('-----BEGIN OPENSSH PRIVATE KEY-----\nZm9v\n-----END OPENSSH PRIVATE KEY-----'), 'UNRECOGNIZED_OR_MALFORMED')

    def test_header_without_footer(self):
        self.assertEqual(module._container('-----BEGIN OPENSSH PRIVATE KEY-----\nZm9v'), 'UNRECOGNIZED_OR_MALFORMED')

    def test_bad_cipher_kdf_pair(self):
        self.assertEqual(module._container(openssh_key(b'none', b'bcrypt')), 'UNRECOGNIZED_OR_MALFORMED')

    def test_legacy_pem_encrypted(self):
        legacy = ('-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\n'
                  'DEK-Info: AES-256-CBC,1234567890123456\n\nZmFrZQ==\n'
                  '-----END RSA PRIVATE KEY-----')
        self.assertEqual(module._container(legacy), 'PEM_ENCRYPTED_DECLARED')

    def test_pkcs8_encrypted(self):
        self.assertEqual(module._container('-----BEGIN ENCRYPTED PRIVATE KEY-----\nZmFrZQ==\n-----END ENCRYPTED PRIVATE KEY-----'),
                         'PEM_ENCRYPTED_DECLARED')

    def test_unencrypted_corrupted_keygen_path(self):
        # /bin/false is not portable to macOS. Use a real, deliberately failing
        # executable so the classifier can distinguish rejection from ENOENT.
        with tempfile.TemporaryDirectory() as d:
            failing_keygen = Path(d) / 'rejecting-keygen'
            failing_keygen.write_text('#!/bin/sh\nexit 1\n', encoding='utf-8')
            failing_keygen.chmod(0o700)
            self.assertEqual(
                module.classify(openssh_key(), ssh_keygen=str(failing_keygen)),
                'UNENCRYPTED_UNREADABLE',
            )

    def test_keygen_missing_path_is_explicit(self):
        with tempfile.TemporaryDirectory() as d:
            missing_keygen = Path(d) / 'missing-keygen'
            self.assertEqual(
                module.classify(openssh_key(), ssh_keygen=str(missing_keygen)),
                'KEYGEN_UNAVAILABLE',
            )

    def test_keygen_missing_is_explicit(self):
        self.assertEqual(module.classify(openssh_key(), ssh_keygen=''), 'KEYGEN_UNAVAILABLE')

    def test_classification_with_real_cryptography_keys(self):
        try:
            from cryptography.hazmat.primitives.asymmetric import ed25519
            from cryptography.hazmat.primitives.serialization import (
                BestAvailableEncryption, Encoding, NoEncryption, PrivateFormat,
            )
        except ImportError:
            self.skipTest('cryptography unavailable (real container vectors)')
        key = ed25519.Ed25519PrivateKey.generate()
        clear = key.private_bytes(Encoding.PEM, PrivateFormat.OpenSSH, NoEncryption()).decode('ascii')
        self.assertEqual(module._container(clear), 'OPENSSH_UNENCRYPTED_DECLARED')
        try:
            encrypted = key.private_bytes(Encoding.PEM, PrivateFormat.OpenSSH,
                                          BestAvailableEncryption(b'TEST_PASSPHRASE')).decode('ascii')
        except Exception as exc:
            # Some developer environments have cryptography but lack bcrypt.
            # The synthetic encrypted-container test remains mandatory.
            if exc.__class__.__name__ not in {'UnsupportedAlgorithm', 'ModuleNotFoundError'}:
                raise
        else:
            self.assertEqual(module._container(encrypted), 'OPENSSH_ENCRYPTED_DECLARED')
        if shutil.which('ssh-keygen'):
            self.assertEqual(module.classify(clear), 'OPENSSH_UNENCRYPTED_VALID')
        else:
            self.assertEqual(module.classify(clear), 'KEYGEN_UNAVAILABLE')

    def test_real_openssh_keygen_optional(self):
        if not shutil.which('ssh-keygen'):
            self.skipTest('OpenSSH unavailable on verification host')
        with tempfile.TemporaryDirectory() as d:
            path = str(Path(d) / 'key')
            result = subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', path],
                                    text=True, capture_output=True, timeout=10)
            if result.returncode != 0:
                self.skipTest('OpenSSH Ed25519 generation not supported')
            self.assertEqual(module.classify(Path(path).read_text()), 'OPENSSH_UNENCRYPTED_VALID')

    def test_hmac_comparison_tag_is_run_specific_and_never_logged(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / 'github-output'
            secret = openssh_key()
            env = {**os.environ, 'ERS_SSH_DIAG_ENVIRONMENT': 'test',
                   'ERS_SSH_DIAG_SECRET': secret, 'ERS_SSH_DIAG_NONCE': '01' * 32,
                   'GITHUB_OUTPUT': str(out)}
            first = subprocess.run([sys.executable, str(SCRIPT)], env=env, text=True,
                                   capture_output=True, timeout=10)
            self.assertEqual(first.returncode, 0, first.stderr)
            tag1 = next(x.split('=', 1)[1] for x in out.read_text().splitlines() if x.startswith('comparison_tag='))
            self.assertEqual(len(tag1), 64)
            self.assertNotIn(tag1, first.stdout + first.stderr)
            self.assertNotIn(secret, first.stdout + first.stderr)
            out.write_text('')
            env['ERS_SSH_DIAG_NONCE'] = '02' * 32
            second = subprocess.run([sys.executable, str(SCRIPT)], env=env, text=True,
                                    capture_output=True, timeout=10)
            tag2 = next(x.split('=', 1)[1] for x in out.read_text().splitlines() if x.startswith('comparison_tag='))
            self.assertNotEqual(tag1, tag2)
            env['ERS_SSH_DIAG_ENVIRONMENT'] = 'training'
            out.write_text('')
            third = subprocess.run([sys.executable, str(SCRIPT)], env=env, text=True,
                                   capture_output=True, timeout=10)
            tag3 = next(x.split('=', 1)[1] for x in out.read_text().splitlines() if x.startswith('comparison_tag='))
            self.assertEqual(tag2, tag3)
            self.assertEqual(third.returncode, 0)

    def test_compare_match_valid(self):
        result, lines = compare_module.compare('OPENSSH_UNENCRYPTED_VALID',
                                               'OPENSSH_UNENCRYPTED_VALID', 'a'*64, 'a'*64)
        self.assertEqual(result, 0)
        self.assertIn('MATCH=YES', lines)

    def test_compare_detects_different_secrets(self):
        result, lines = compare_module.compare('OPENSSH_UNENCRYPTED_VALID',
                                               'OPENSSH_UNENCRYPTED_VALID', 'a'*64, 'b'*64)
        self.assertEqual(result, 2)
        self.assertIn('MATCH=NO', lines)
        self.assertFalse(any('a'*64 in line or 'b'*64 in line for line in lines))

    def test_compare_same_encrypted_remains_blocked(self):
        result, lines = compare_module.compare('OPENSSH_ENCRYPTED_DECLARED',
                                               'OPENSSH_ENCRYPTED_DECLARED', 'a'*64, 'a'*64)
        self.assertEqual(result, 2)
        self.assertIn('MATCH=YES', lines)

    def test_compare_requires_outputs_for_both_environments(self):
        result, lines = compare_module.compare('MISSING', '', 'a'*64, '')
        self.assertEqual(result, 2)
        self.assertTrue(lines[0].startswith('BLOCKED:'))

    def test_workflow_is_read_only_two_environment_comparison(self):
        src = WORKFLOW.read_text()
        self.assertIn('workflow_dispatch:', src)
        self.assertIn("if: github.ref_name == 'test'", src)
        self.assertIn('environment: test', src)
        self.assertIn('environment: training', src)
        self.assertIn('needs: [inspect-test, inspect-training]', src)
        self.assertIn('ref: test', src)
        self.assertIn('persist-credentials: false', src)
        self.assertIn('secrets.DEPLOY_SSH_PRIVATE_KEY', src)
        self.assertIn('ERS_SSH_DIAG_NONCE', src)
        self.assertIn('scripts/ers-ssh-scope-compare.py', src)
        self.assertIn('permissions:\n  contents: read', src)
        for forbidden in ('ssh -i', 'server-up', 'server-build', 'migration-recovery-gate',
                          'docker ', 'ssh-keyscan', 'server-backup', 'OP_SERVICE_ACCOUNT_TOKEN',
                          'DEPLOY_SSH_PRIVATE_KEY: '):
            # Avoid forbidding an env name when it appears as a GitHub expression.
            if forbidden == 'DEPLOY_SSH_PRIVATE_KEY: ':
                continue
            self.assertNotIn(forbidden, src)
        try:
            import yaml
        except ImportError:
            pass
        else:
            root = yaml.load(src, Loader=yaml.BaseLoader)
            self.assertEqual(set(root['jobs']), {'prepare', 'inspect-test', 'inspect-training', 'compare'})
            self.assertEqual(root['jobs']['inspect-test']['environment'], 'test')
            self.assertEqual(root['jobs']['inspect-training']['environment'], 'training')


if __name__ == '__main__':
    unittest.main(verbosity=2)
