#!/usr/bin/env python3
"""Offline safety and documentation contracts for Byte 35.6S.1."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts' / 'ers-byte356s1-onboarding.py'
spec = importlib.util.spec_from_file_location('support_onboarding', SOURCE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
DOCS = ROOT / 'docs' / 'bite-35'


def completed():
    value = mod.template()
    value.update({
        'environment': 'development',
        'deployment_revision': 'b' * 40,
        'training_tenant_code': 'ERS_SUPPORT_TRAINING',
        'training_tenant_confirmed_synthetic': True,
        'trainee_login': 'a.person@example.org',
        'trainee_role': 'TENANT_VIEWER',
        'training_owner': 'Authorized Training Coordinator',
        'technical_escalation_owner': 'ERS Technical Operator',
        'documentation_location': 'approved read-only documentation folder',
        'credential_custody_verified': True,
        'individual_first_login_verified': True,
        'separate_from_immutable_354c_fixtures': True,
        'no_customer_data_verified': True,
        'production_access_not_granted': True,
    })
    for cid, obj in value['cases'].items():
        obj.update(status='PASS', observation=f'Observed {cid} in the test browser using authorized synthetic Tenant', reviewer='Training Coordinator')
    return value


class ValidationTests(unittest.TestCase):
    def assertBlocked(self, mutate, expected):
        data = completed()
        mutate(data)
        self.assertIn(expected, '\n'.join(mod.validate(data)))

    def test_template_is_blocked_by_default(self):
        self.assertTrue(mod.validate(mod.template()))
        self.assertEqual(len(mod.template()['cases']), 12)

    def test_complete_record_is_only_review_ready(self):
        self.assertEqual(mod.validate(completed()), [])

    def test_no_production(self):
        self.assertBlocked(lambda d: d.update(environment='production'), 'Production prohibited')

    def test_no_fixture_tenant(self):
        self.assertBlocked(lambda d: d.update(training_tenant_code='TRAIN354C_A'), 'fixture or Production')

    def test_no_fixture_account(self):
        self.assertBlocked(lambda d: d.update(trainee_login='training354c.joao@example.test'), 'fixture or bootstrap')

    def test_no_global_admin(self):
        self.assertBlocked(lambda d: d.update(trainee_role='APPLICATION_ADMIN'), 'no admin/support role')

    def test_no_tenant_admin(self):
        self.assertBlocked(lambda d: d.update(trainee_role='TENANT_ADMIN'), 'no admin/support role')

    def test_no_fictitious_support_role(self):
        self.assertBlocked(lambda d: d.update(trainee_role='CUSTOMER_SUPPORT'), 'no admin/support role')

    def test_wrong_release(self):
        self.assertBlocked(lambda d: d.update(deployment_revision='latest'), '40-character Git SHA')

    def test_bad_email(self):
        self.assertBlocked(lambda d: d.update(trainee_login='shared'), 'individual verified email')

    def test_first_login_unconfirmed(self):
        self.assertBlocked(lambda d: d.update(individual_first_login_verified=False), 'individual_first_login_verified')

    def test_no_real_customer_data(self):
        self.assertBlocked(lambda d: d.update(no_customer_data_verified=False), 'no_customer_data_verified')

    def test_credentials_unconfirmed(self):
        self.assertBlocked(lambda d: d.update(credential_custody_verified=False), 'credential_custody_verified')

    def test_missing_case(self):
        self.assertBlocked(lambda d: d['cases'].pop('T06'), 'exactly T01–T12')

    def test_bogus_case(self):
        self.assertBlocked(lambda d: d['cases'].update(T13={}), 'exactly T01–T12')

    def test_blocked_case(self):
        self.assertBlocked(lambda d: d['cases']['T09'].update(status='BLOCKED'), 'T09 is BLOCKED')

    def test_failed_case(self):
        self.assertBlocked(lambda d: d['cases']['T10'].update(status='FAIL'), 'T10 is FAIL')

    def test_unsubstantiated_pass(self):
        self.assertBlocked(lambda d: d['cases']['T08'].update(observation='ok'), 'T08 observation')

    def test_secret_exposure_rejected(self):
        self.assertBlocked(lambda d: d['cases']['T01'].update(observation='password=Oops12345 saved here'), 'may not contain credentials')

    def test_bcrypt_exposure_rejected(self):
        self.assertBlocked(lambda d: d['cases']['T12'].update(observation='$2b$12$'+'A'*53), 'may not contain credentials')

    def test_extra_fields_not_accepted(self):
        self.assertBlocked(lambda d: d.update(password='pass'), 'unexpected or missing top-level')

    def test_cli_does_not_overwrite_and_is_private(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'readiness.json'
            self.assertEqual(mod.main(['init', '--output', str(path)]), 0)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(mod.main(['init', '--output', str(path)]), 2)
            self.assertEqual(mod.main(['check', '--record', str(path)]), 1)
            path.write_text(json.dumps(completed()), encoding='utf-8')
            self.assertEqual(mod.main(['check', '--record', str(path)]), 0)

    def test_cli_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            actual = Path(tmp)/'real.json'
            actual.write_text(json.dumps(completed()))
            linked = Path(tmp)/'alias.json'
            linked.symlink_to(actual)
            self.assertEqual(mod.main(['check', '--record', str(linked)]), 2)

    def test_manual_has_all_cases_and_identity_and_observations(self):
        source = (DOCS / 'byte-35-6s1-manual-acceptance.md').read_text()
        import re
        self.assertEqual(re.findall(r'^## (T\d\d) —', source, re.M), list(mod.CASE_IDS))
        for key in ('Identity:', 'Environment:', 'Expected:', 'PASS:', 'FAIL:', 'BLOCKED:', 'Cleanup:'):
            self.assertGreaterEqual(source.count(key), 12, key)

    def test_existing_code_contract_and_fixture_boundary(self):
        auth = (ROOT / 'frontend/src/features/auth/AuthenticationAdminPage.tsx').read_text()
        roles = (ROOT / 'frontend/src/features/authz/TenantRoleDelegationPage.tsx').read_text()
        fixtures = (ROOT / 'scripts/ers-byte354c-training-db.py').read_text()
        self.assertIn('mustChangePassword: true', auth)
        self.assertIn('"TENANT_VIEWER"', roles)
        self.assertIn('EXPECTED_DIGEST', fixtures)
        onboard = (DOCS / 'byte-35-6s1-onboarding-operator-guide.md').read_text()
        for word in ('TENANT_VIEWER', 'TRAIN354C_A', 'TRAIN354C_B', '1Password', 'BLOCKED', 'first-login', 'Person', 'Membership', 'support lease', 'development'):
            self.assertIn(word, onboard)


if __name__ == '__main__':
    unittest.main(verbosity=2)
