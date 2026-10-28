#!/usr/bin/env python3
"""Read-only status validation, incorrect scope and unavailable identity regressions."""
import importlib.util
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

MODULE_PATH = Path(__file__).with_name('ers-two-human-admin-status.py')
spec = importlib.util.spec_from_file_location('two_human_status', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StatusTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.database = Path(self.tmp.name) / 'app.db'
        with sqlite3.connect(self.database) as db:
            db.executescript('''
                CREATE TABLE authz_actors (id TEXT, actor_key TEXT, active BOOLEAN);
                CREATE TABLE auth_user_accounts (id TEXT, login TEXT, active BOOLEAN, security_suspended BOOLEAN, must_change_password BOOLEAN);
                CREATE TABLE auth_account_actors (actor_id TEXT, account_id TEXT, scope_type TEXT, tenant_id TEXT, membership_id TEXT);
                CREATE TABLE authz_roles (id TEXT, code TEXT, active BOOLEAN, scope_type TEXT);
                CREATE TABLE authz_actor_role_grants (actor_id TEXT, role_id TEXT, tenant_id TEXT, active BOOLEAN, lifecycle_suspended BOOLEAN);
                INSERT INTO authz_roles VALUES ('r', 'APPLICATION_ADMIN',1,'APPLICATION');
                INSERT INTO authz_actors VALUES ('a','human-a',1), ('b','human-b',1);
                INSERT INTO auth_user_accounts VALUES ('ua','a@example.com',1,0,1), ('ub','b@example.com',1,0,1);
                INSERT INTO auth_account_actors VALUES ('a','ua','GLOBAL',NULL,NULL), ('b','ub','GLOBAL',NULL,NULL);
                INSERT INTO authz_actor_role_grants VALUES ('a','r','*',1,0), ('b','r','*',1,0);
            ''')

    def test_valid_identities_and_readonly(self):
        original = self.database.read_bytes()
        rows = module.status(self.database, ['human-a', 'human-b'])
        self.assertTrue(all(r['usable'] for r in rows))
        self.assertTrue(all(r['mustChangePassword'] for r in rows))
        self.assertEqual(original, self.database.read_bytes())

    def test_refuse_tenant_scope_or_suspended_grant(self):
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE auth_account_actors SET scope_type='TENANT' WHERE actor_id='a'")
            db.execute("UPDATE authz_actor_role_grants SET lifecycle_suspended=1 WHERE actor_id='b'")
        self.assertFalse(any(r['usable'] for r in module.status(self.database, ['human-a', 'human-b'])))

    def test_missing_schema_column_is_reported_without_sensitive_values(self):
        with sqlite3.connect(self.database) as db:
            db.execute('DROP TABLE auth_user_accounts')
            db.execute('CREATE TABLE auth_user_accounts (id TEXT, login TEXT, active BOOLEAN, must_change_password BOOLEAN)')
        result = subprocess.run([
            sys.executable, '-B', str(MODULE_PATH), '--db', str(self.database),
            '--actor-key', 'human-a', '--actor-key', 'human-b',
        ], text=True, capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, '')
        self.assertIn('missing required column: auth_user_accounts.security_suspended', result.stderr)
        self.assertNotIn('a@example.com', result.stderr)

    def test_missing_database_is_reported_and_never_created(self):
        missing = Path(self.tmp.name) / 'missing.db'
        result = subprocess.run([
            sys.executable, '-B', str(MODULE_PATH), '--db', str(missing),
            '--actor-key', 'human-a', '--actor-key', 'human-b',
        ], text=True, capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, '')
        self.assertIn('database file does not exist', result.stderr)
        self.assertFalse(missing.exists())

    def test_missing_required_table_is_reported(self):
        with sqlite3.connect(self.database) as db:
            db.execute('DROP TABLE authz_roles')
        with self.assertRaisesRegex(module.StatusSchemaError, 'missing required table: authz_roles'):
            module.status(self.database, ['human-a', 'human-b'])

    def test_missing_identity(self):
        rows = module.status(self.database, ['human-a', 'absent'])
        self.assertFalse(rows[1]['usable'])


if __name__ == '__main__':
    unittest.main()
