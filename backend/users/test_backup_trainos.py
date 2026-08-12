import json
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase
from django.utils import timezone

from users.management.commands.backup_trainos import (
    BACKUP_COMMAND_VERSION,
    BACKUP_FORMAT,
    BACKUP_SCHEMA_VERSION,
    create_sqlite_backup,
    resolve_sqlite_database_path,
    sqlite_integrity_check,
)


class SQLiteBackupTests(SimpleTestCase):
    timestamp = "20260812-153000"

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "private-source.sqlite3"
        with closing(sqlite3.connect(self.source)) as connection:
            connection.execute("CREATE TABLE training_log (id INTEGER PRIMARY KEY, note TEXT NOT NULL)")
            connection.executemany("INSERT INTO training_log (note) VALUES (?)", [("easy run",), ("pull day",)])
            connection.commit()

    def tearDown(self):
        self.temp.cleanup()

    def backup(self, *, timestamp=None):
        return create_sqlite_backup(
            self.source,
            self.root / "backups",
            timestamp=timestamp or self.timestamp,
            created_at=timezone.localtime(timezone.now()),
        )

    def test_successful_backup_preserves_data_and_integrity(self):
        result = self.backup()

        self.assertTrue(result.directory.is_dir())
        self.assertTrue(result.database_path.is_file())
        self.assertTrue(result.metadata_path.is_file())
        with closing(sqlite3.connect(result.database_path)) as connection:
            rows = connection.execute("SELECT id, note FROM training_log ORDER BY id").fetchall()
        self.assertEqual(rows, [(1, "easy run"), (2, "pull day")])
        self.assertEqual(sqlite_integrity_check(self.source), "ok")
        self.assertEqual(sqlite_integrity_check(result.database_path), "ok")

    def test_collision_uses_suffix_without_overwriting_existing_backup(self):
        first = self.backup()
        first_metadata = first.metadata_path.read_bytes()
        second = self.backup()

        self.assertTrue(first.directory.exists())
        self.assertTrue(second.directory.name.endswith("_2"))
        self.assertEqual(first.metadata_path.read_bytes(), first_metadata)

    def test_repeated_backups_are_separate_valid_directories(self):
        first = self.backup(timestamp="20260812-153001")
        second = self.backup(timestamp="20260812-153002")

        self.assertNotEqual(first.directory, second.directory)
        self.assertEqual(sqlite_integrity_check(first.database_path), "ok")
        self.assertEqual(sqlite_integrity_check(second.database_path), "ok")

    def test_command_honors_custom_output_directory(self):
        output_dir = self.root / "custom-backups"
        with patch("users.management.commands.backup_trainos.resolve_sqlite_database_path", return_value=self.source):
            result = Path(call_command("backup_trainos", output_dir=str(output_dir)))

        self.assertEqual(result.parent, output_dir)
        self.assertTrue((result / "db.sqlite3").is_file())

    def test_missing_source_fails_without_creating_output(self):
        missing = self.root / "missing.sqlite3"
        output_dir = self.root / "missing-output"
        with self.assertRaisesMessage(CommandError, "does not exist"):
            create_sqlite_backup(missing, output_dir, timestamp=self.timestamp)
        self.assertFalse(output_dir.exists())

    def test_non_sqlite_configuration_fails_clearly(self):
        with self.assertRaisesMessage(CommandError, "currently supports SQLite only"):
            resolve_sqlite_database_path({"ENGINE": "django.db.backends.postgresql", "NAME": "trainos"})

    def test_source_integrity_failure_cleans_only_invocation_temp_files(self):
        backup_root = self.root / "backups"
        with patch("users.management.commands.backup_trainos.sqlite_integrity_check", return_value="corrupt"):
            with self.assertRaisesMessage(CommandError, "source integrity check failed"):
                self.backup()
        self.assertEqual(list(backup_root.glob("trainos-backup-*")), [])
        self.assertEqual(list(backup_root.glob(".trainos-backup-*")), [])

    def test_destination_integrity_failure_cleans_only_invocation_temp_files(self):
        backup_root = self.root / "backups"
        with patch("users.management.commands.backup_trainos.sqlite_integrity_check", side_effect=["ok", "corrupt"]):
            with self.assertRaisesMessage(CommandError, "backup integrity check failed"):
                self.backup()
        self.assertEqual(list(backup_root.glob("trainos-backup-*")), [])
        self.assertEqual(list(backup_root.glob(".trainos-backup-*")), [])

    def test_rename_failure_leaves_no_partial_final_backup(self):
        backup_root = self.root / "backups"
        with patch("users.management.commands.backup_trainos.os.replace", side_effect=OSError("rename failed")):
            with self.assertRaisesMessage(CommandError, "Backup generation failed"):
                self.backup()
        self.assertEqual(list(backup_root.glob("trainos-backup-*")), [])
        self.assertEqual(list(backup_root.glob(".trainos-backup-*")), [])

    def test_metadata_is_complete_and_does_not_disclose_source_path(self):
        result = self.backup()
        metadata = json.loads(result.metadata_path.read_text(encoding="utf-8"))

        self.assertEqual(metadata, {
            "format": BACKUP_FORMAT,
            "schema_version": BACKUP_SCHEMA_VERSION,
            "backup_command_version": BACKUP_COMMAND_VERSION,
            "created_at": metadata["created_at"],
            "django_timezone": metadata["django_timezone"],
            "database_engine": "sqlite",
            "source_database_name": self.source.name,
            "backup_database_name": "db.sqlite3",
            "source_size_bytes": self.source.stat().st_size,
            "backup_size_bytes": result.database_path.stat().st_size,
            "source_integrity_check": "ok",
            "backup_integrity_check": "ok",
        })
        rendered = json.dumps(metadata)
        self.assertNotIn(str(self.source.parent), rendered)
        self.assertNotIn("SECRET_KEY", rendered)

    def test_failed_backup_preserves_preexisting_backup(self):
        valid = self.backup()
        with patch("users.management.commands.backup_trainos.sqlite_integrity_check", return_value="corrupt"):
            with self.assertRaises(CommandError):
                self.backup(timestamp="20260812-153003")

        self.assertTrue(valid.directory.is_dir())
        self.assertTrue(valid.database_path.is_file())
        self.assertEqual(list((self.root / "backups").glob("trainos-backup-*")), [valid.directory])
