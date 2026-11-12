"""Offline entrypoint/backup contract checks; no production or LOCAL DB touch."""
import importlib.util
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

MODULE = Path(__file__).with_name("local-developer-fixtures.py")
spec = importlib.util.spec_from_file_location("local_developer_fixtures", MODULE)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class LocalDeveloperFixtureTests(unittest.TestCase):
    def test_identity_contract(self):
        self.assertEqual(len(installer.LOGIN_ROWS), 11)
        self.assertEqual(len({login for _, login in installer.LOGIN_ROWS}), 11)
        self.assertEqual(installer.LOGIN_ROWS[0][1], "e2e-admin-local@enterpriseremotesystems.com")
        self.assertEqual(installer.LOGIN_ROWS[-1][1], "e2e-multi-tenant-person@example.com")

    def test_non_local_environment_fails_closed(self):
        for env in ("production", "test", "development", ""):
            with self.subTest(env=env), mock.patch.dict(os.environ, {"APP_ENV": env}):
                with self.assertRaisesRegex(SystemExit, "APP_ENV=local"):
                    installer.main()

    def test_wrong_database_path_fails_before_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            with mock.patch.dict(os.environ, {"APP_ENV": "local", "ERS_DATABASE_PATH": folder + "/other.db"}), \
                 mock.patch.object(installer, "ROOT", Path.cwd()):
                if installer.ROOT != Path.cwd().resolve():
                    self.skipTest("working directory differs")
                with self.assertRaisesRegex(SystemExit, "configured backend database differs"):
                    installer.main()

    def test_wal_mode_database_is_backed_up_as_readable_standalone_snapshot(self):
        # Reproduce the LOCAL state on macOS: an existing database has WAL
        # enabled and its last committed transaction may still live in the WAL.
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            db = root / "backend" / "data" / "app.db"
            db.parent.mkdir(parents=True)
            writer = sqlite3.connect(db)
            try:
                self.assertEqual(writer.execute("PRAGMA journal_mode=WAL").fetchone()[0], "wal")
                writer.execute("CREATE TABLE preserve_me (name TEXT NOT NULL)")
                writer.execute("INSERT INTO preserve_me VALUES ('committed WAL row')")
                writer.commit()
                with mock.patch.object(installer, "DB", db), \
                     mock.patch.object(installer, "BACKEND", root / "backend"), \
                     mock.patch.object(installer.sqlite3, "connect", wraps=sqlite3.connect) as connect:
                    installer.backup_existing()

                backup_dir = db.parent / "local-fixture-backups"
                copies = list(backup_dir.glob("*.db"))
                self.assertEqual(len(copies), 1)
                source_read = db.resolve().as_uri() + "?mode=ro"
                immutable_read = copies[0].resolve().as_uri() + "?mode=ro&immutable=1"
                self.assertTrue(any(
                    call.args and call.args[0] == source_read and call.kwargs.get("uri") is True
                    for call in connect.call_args_list
                ), "original database must be read in ordinary (non-immutable) mode")
                self.assertTrue(any(
                    call.args and call.args[0] == immutable_read and call.kwargs.get("uri") is True
                    for call in connect.call_args_list
                ), "backup must be verified in read-only immutable snapshot mode")
                with sqlite3.connect(immutable_read, uri=True) as verified:
                    self.assertEqual(verified.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
                    self.assertEqual(verified.execute("SELECT name FROM preserve_me").fetchone()[0],
                                     "committed WAL row")
                self.assertEqual(writer.execute("SELECT name FROM preserve_me").fetchone()[0],
                                 "committed WAL row")
            finally:
                writer.close()

    def test_backup_integrity_uses_encoded_file_uri_for_local_paths(self):
        # SQLite URI queries must not interpret '#' or '?' in a path as a
        # fragment or query. Python's Path.as_uri() encodes them correctly.
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "project #1?"
            db = root / "backend" / "data" / "app.db"
            db.parent.mkdir(parents=True)
            with sqlite3.connect(db) as conn:
                conn.execute("CREATE TABLE keep (value TEXT)")
                conn.execute("INSERT INTO keep VALUES ('preserved')")
            with mock.patch.object(installer, "DB", db), \
                 mock.patch.object(installer, "BACKEND", root / "backend"):
                installer.backup_existing()
            copies = list((db.parent / "local-fixture-backups").glob("*.db"))
            self.assertEqual(len(copies), 1)
            with sqlite3.connect(copies[0]) as conn:
                self.assertEqual(conn.execute("SELECT value FROM keep").fetchone()[0], "preserved")

    def test_existing_database_is_backed_up_and_integrity_checked(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            db = root / "backend" / "data" / "app.db"
            db.parent.mkdir(parents=True)
            conn = sqlite3.connect(db)
            try:
                conn.execute("CREATE TABLE preserve_me (name TEXT NOT NULL)")
                conn.execute("INSERT INTO preserve_me VALUES ('customer row')")
                conn.commit()
            finally:
                conn.close()
            with mock.patch.object(installer, "DB", db), mock.patch.object(installer, "BACKEND", root / "backend"):
                installer.backup_existing()
            copies = list((root / "backend" / "data" / "local-fixture-backups").glob("*.db"))
            self.assertEqual(len(copies), 1)
            conn = sqlite3.connect(copies[0])
            try:
                self.assertEqual(conn.execute("SELECT name FROM preserve_me").fetchone()[0], "customer row")
                self.assertEqual(conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            finally:
                conn.close()
            conn = sqlite3.connect(db)
            try:
                self.assertEqual(conn.execute("SELECT count(*) FROM preserve_me").fetchone()[0], 1)
            finally:
                conn.close()


if __name__ == "__main__":
    unittest.main()
