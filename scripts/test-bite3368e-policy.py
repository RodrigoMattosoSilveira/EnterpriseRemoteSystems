#!/usr/bin/env python3
"""Bite 33.6.8E deterministic offline policy contract tests."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('policy', Path(__file__).with_name('ers-bite3368e-policy.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def sample():
    return {'bucket': 'ers', 'prefix_root': 'ers-backups', 'environment_principals': {e: f'arn:aws:iam:::user/p123:{key}' for e,key in zip(mod.ENVS, ['DEV', 'TST', 'PRD'])}, 'recovery_principal': 'arn:aws:iam:::user/p123:RECOVERY'}

class PolicyTests(unittest.TestCase):
    def test_candidate(self):
        result = mod.policy_for(sample())
        self.assertEqual(len(result['Statement']), 10)
        self.assertEqual(result['Statement'][0]['Effect'], 'Deny')
        self.assertEqual(len(result['Statement'][0]['NotPrincipal']['AWS']), 4)
    def test_env_boundaries(self):
        result = mod.policy_for(sample())
        for e in mod.ENVS:
            entries = [s for s in result['Statement'] if s['Sid'].startswith('Deny'+e.title())]
            self.assertEqual(len(entries), 3)
            self.assertEqual(entries[0]['NotResource'], f'arn:aws:s3:::ers/ers-backups/{e}/*')
            self.assertIn('s3:GetObjectVersion', entries[0]['Action'])
            self.assertIn('s3:DeleteObjectVersion', entries[0]['Action'])
            self.assertIn('s3:prefix', entries[1]['Condition']['StringNotLike'])
    def test_duplicate_principals_rejected(self):
        data = sample(); data['environment_principals']['test'] = data['environment_principals']['production']
        with self.assertRaises(ValueError): mod.policy_for(data)
    def test_invalid_principal_rejected(self):
        data = sample(); data['recovery_principal'] = 'password=123'
        with self.assertRaises(ValueError): mod.policy_for(data)
    def test_unknown_fields_rejected(self):
        data = sample(); data['secret'] = 'no'
        with self.assertRaises(ValueError): mod.policy_for(data)
    def test_missing_env_rejected(self):
        data = sample(); del data['environment_principals']['test']
        with self.assertRaises(ValueError): mod.policy_for(data)
    def test_prefix_traversal_rejected(self):
        data = sample(); data['prefix_root'] = '../production'
        with self.assertRaises(ValueError): mod.policy_for(data)
    def test_admin_restrictions(self):
        result = mod.policy_for(sample())
        for e in mod.ENVS:
            s = next(s for s in result['Statement'] if s['Sid'] == 'Deny'+e.title()+'BucketAdministration')
            self.assertIn('s3:PutBucketPolicy', s['Action'])

if __name__ == '__main__': unittest.main()
