#!/usr/bin/env python3
"""Focused tests for private administrator input and safe failure behavior."""
from pathlib import Path
import contextlib
import importlib.util
import io
import subprocess
import sys
import unittest

MODULE_PATH = Path(__file__).with_name('ers-two-human-admin-input.py')
spec = importlib.util.spec_from_file_location('two_human_input', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InputTests(unittest.TestCase):
    def build(self, fields, passwords):
        values = iter(fields)
        secrets = iter(passwords)
        with contextlib.redirect_stderr(io.StringIO()):
            return module.prepare(lambda _label: next(values), lambda _label: next(secrets))

    def test_two_distinct_secret_credentials(self):
        result = self.build(['human-a', 'Human A', 'A@Example.com', 'human-b', 'Human B', 'b@example.com'],
                            ['A-Initial-Password-1', 'A-Initial-Password-1', 'B-Initial-Password-2', 'B-Initial-Password-2'])
        self.assertEqual([row['login'] for row in result['administrators']], ['a@example.com', 'b@example.com'])

    def test_refuse_password_reuse(self):
        with self.assertRaises(ValueError):
            self.build(['human-a', 'Human A', 'a@example.com', 'human-b', 'Human B', 'b@example.com'],
                       ['Same-Password-For-Both', 'Same-Password-For-Both'] * 2)

    def test_refuse_weak_password(self):
        with self.assertRaises(ValueError):
            self.build(['human-a', 'Human A', 'a@example.com', 'human-b', 'Human B', 'b@example.com'],
                       ['too-short', 'too-short', 'B-Initial-Password-2', 'B-Initial-Password-2'])

    def test_credentialless_failure_output(self):
        # EOF on prompt must not emit a partial enrollment JSON document.
        result = subprocess.run([sys.executable, str(MODULE_PATH)], input='', text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
