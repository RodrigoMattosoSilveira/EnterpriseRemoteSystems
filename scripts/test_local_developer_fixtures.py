"""Offline entrypoint/backup contract checks; no production or LOCAL DB touch."""
import importlib.util
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
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

    def test_offline_wal_database_integrity_reopens_rw_without_creating_new_file(self):
        # Verify the post-Go validation path, not only the already-closed backup.
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder) / "app.db"
            with closing(sqlite3.connect(db)) as writer:
                self.assertEqual(writer.execute("PRAGMA journal_mode=WAL").fetchone()[0], "wal")
                writer.execute("CREATE TABLE fixture_marker (value TEXT NOT NULL)")
                writer.execute("INSERT INTO fixture_marker VALUES ('committed fixture data')")
                writer.commit()
            real_connect = sqlite3.connect
            calls = []

            def connect_existing(database, *args, **kwargs):
                calls.append(database)
                # Simulate the macOS SQLite condition: the Go writer exited,
                # WAL sidecars are absent, and read-only mode cannot reopen.
                if isinstance(database, str) and "?mode=ro" in database:
                    raise sqlite3.OperationalError("unable to open database file")
                return real_connect(database, *args, **kwargs)

            with mock.patch.object(installer.sqlite3, "connect", side_effect=connect_existing):
                installer.integrity(db, writable_existing=True)
            self.assertEqual(calls, [db.resolve().as_uri() + "?mode=rw"])
            with closing(sqlite3.connect(db)) as verified:
                self.assertEqual(verified.execute("SELECT value FROM fixture_marker").fetchone()[0],
                                 "committed fixture data")

            absent = Path(folder) / "absent.db"
            with self.assertRaises(sqlite3.OperationalError):
                installer.integrity(absent, writable_existing=True)
            self.assertFalse(absent.exists(), "integrity validation must never create a missing database")
            with self.assertRaisesRegex(SystemExit, "cannot use writable mode"):
                installer.integrity(db, immutable_snapshot=True, writable_existing=True)

    def test_full_installer_checks_db_after_migrations_and_after_go_in_rw_mode(self):
        # Regression for: Go prints 11 PASS, then the old Python post-check
        # fails because macOS cannot reopen a sidecar-less WAL DB in mode=ro.
        with tempfile.TemporaryDirectory() as folder:
            # Exercise a symlinked parent directory on every host. On macOS,
            # TemporaryDirectory commonly starts under /var, which resolves
            # to /private/var; the installer always compares canonical paths.
            real_dir = Path(folder) / "real"
            real_dir.mkdir()
            alias_dir = Path(folder) / "alias"
            alias_dir.symlink_to(real_dir, target_is_directory=True)
            db = alias_dir / "app.db"
            self.assertNotEqual(db, db.resolve())
            with closing(sqlite3.connect(db)) as writer:
                writer.execute("PRAGMA journal_mode=WAL")
                writer.execute("CREATE TABLE fixture_marker (value TEXT NOT NULL)")
                writer.execute("INSERT INTO fixture_marker VALUES ('prior local data')")
                writer.commit()
            real_connect = sqlite3.connect
            sqlite_uris = []

            def fail_readonly_wal_open(database, *args, **kwargs):
                sqlite_uris.append(database)
                if isinstance(database, str) and "?mode=ro" in database:
                    raise sqlite3.OperationalError("unable to open database file")
                return real_connect(database, *args, **kwargs)

            root = Path.cwd().resolve()
            with mock.patch.dict(os.environ, {"APP_ENV": "local"}, clear=True), \
                 mock.patch.object(installer, "ROOT", root), \
                 mock.patch.object(installer, "DB", db), \
                 mock.patch.object(installer, "dotenv_paths", return_value={}), \
                 mock.patch.object(installer, "effective_path", return_value=db.resolve()), \
                 mock.patch.object(installer, "require_offline"), \
                 mock.patch.object(installer, "backup_existing"), \
                 mock.patch.object(installer, "prompt_credentials", return_value={"fixture": "from 1Password"}), \
                 mock.patch("builtins.input", return_value="INSTALL-LOCAL-FIXTURES"), \
                 mock.patch.object(installer.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run, \
                 mock.patch.object(installer.sqlite3, "connect", side_effect=fail_readonly_wal_open), \
                 mock.patch("builtins.print") as printed:
                installer.main()

            self.assertEqual(run.call_count, 2, "migrations and Go fixture transaction both ran")
            self.assertEqual(sqlite_uris, [db.resolve().as_uri() + "?mode=rw"] * 2,
                             "both post-migration and post-Go checks must allow SQLite WAL sidecars")
            printed.assert_any_call("PASS: LOCAL fixture installation and database integrity")
            with closing(sqlite3.connect(db)) as checked:
                self.assertEqual(checked.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                self.assertEqual(checked.execute("SELECT value FROM fixture_marker").fetchone()[0],
                                 "prior local data")

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
