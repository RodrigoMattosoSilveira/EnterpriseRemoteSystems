#!/usr/bin/env python3
"""Offline mocks for the live-readonly nine-probe runner."""
import importlib.util
from pathlib import Path
import unittest
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('ers-bite3368e-live-readonly.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def config():
    return {'endpoint': 'https://hel1.your-objectstorage.com', 'bucket': 'ers', 'profiles': {e: 'profile-'+e for e in module.ENV}, 'known_keys': {e: f'ers-backups/{e}/audit-probe' for e in module.ENV}}


def runner(args, **kwargs):
    actor = args[args.index('--profile')+1].removeprefix('profile-')
    target = args[args.index('--key')+1].split('/')[1]
    return SimpleNamespace(returncode=0 if actor == target else 255, stderr='' if actor == target else 'AccessDenied', stdout='')

class TestLive(unittest.TestCase):
    def test_expected_nine(self):
        result = module.probe(config(), runner)
        self.assertEqual(result['status'], 'PASS_READ_ONLY_PROBES_ONLY')
        self.assertEqual(len(result['checks']), 9)
    def test_404_not_denial(self):
        def f(args, **kwargs):
            r = runner(args, **kwargs)
            return SimpleNamespace(returncode=r.returncode, stderr='NoSuchKey' if r.returncode else '', stdout='')
        self.assertEqual(module.probe(config(), f)['status'], 'BLOCKED')
    def test_unauthorized_cross_read_blocks(self):
        def f(args, **kwargs): return SimpleNamespace(returncode=0, stderr='', stdout='')
        self.assertEqual(module.probe(config(), f)['status'], 'BLOCKED')
    def test_own_read_missing_blocks(self):
        def f(args, **kwargs): return SimpleNamespace(returncode=255, stderr='AccessDenied', stdout='')
        self.assertEqual(module.probe(config(), f)['status'], 'BLOCKED')
    def test_untrusted_key_blocks(self):
        d=config(); d['known_keys']['test']='ers-backups/production/a'
        with self.assertRaises(ValueError): module.probe(d, runner)
    def test_endpoint_blocks(self):
        d=config(); d['endpoint']='http://example.com'
        with self.assertRaises(ValueError): module.probe(d, runner)

if __name__=='__main__': unittest.main()
