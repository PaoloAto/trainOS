"""Create an integrity-checked local SQLite TrainOS backup."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone


BACKUP_FORMAT = "trainos-sqlite-backup"
BACKUP_SCHEMA_VERSION = 1
BACKUP_COMMAND_VERSION = 1
SQLITE_ENGINE = "django.db.backends.sqlite3"


@dataclass(frozen=True)
class BackupResult:
    directory: Path
    database_path: Path
    metadata_path: Path
    metadata: dict


def sqlite_integrity_check(database_path: Path) -> str:
    """Return SQLite's single integrity-check result for a database file."""
    try:
        with closing(sqlite3.connect(database_path.as_uri() + "?mode=ro", uri=True)) as connection:
            rows = connection.execute("PRAGMA integrity_check;").fetchall()
    except (OSError, sqlite3.Error) as exc:
        raise CommandError(f"Could not run SQLite integrity check: {exc}") from exc
    if len(rows) != 1 or len(rows[0]) != 1:
        return "invalid result"
    return str(rows[0][0]).lower()


def resolve_sqlite_database_path(database_config: dict) -> Path:
    """Validate Django's configured database and return its filesystem path."""
    if database_config.get("ENGINE") != SQLITE_ENGINE:
        raise CommandError("backup_trainos currently supports SQLite only.")
    name = database_config.get("NAME")
    if name is None or not str(name).strip() or str(name) == ":memory:" or str(name).lower().startswith("file:"):
        raise CommandError("Configured SQLite database NAME must resolve to a filesystem path.")
    try:
        source_path = Path(name).expanduser().resolve()
    except (OSError, TypeError, ValueError) as exc:
        raise CommandError("Configured SQLite database NAME must resolve to a filesystem path.") from exc
    if not source_path.exists():
        raise CommandError(f"Configured SQLite database does not exist: {source_path}")
    if not source_path.is_file():
        raise CommandError(f"Configured SQLite database is not a regular file: {source_path}")
    return source_path


def _backup_target(backup_root: Path, timestamp: str) -> Path:
    base = f"trainos-backup-{timestamp}"
    target, suffix = backup_root / base, 2
    while target.exists():
        target, suffix = backup_root / f"{base}_{suffix}", suffix + 1
    return target


def _ensure_ok(result: str, location: str) -> None:
    if result.lower() != "ok":
        raise CommandError(f"SQLite {location} integrity check failed: expected ok, got {result!r}.")


def create_sqlite_backup(source_db_path, backup_root, *, timestamp: str, created_at=None) -> BackupResult:
    """Back up an explicit SQLite file into an invocation-owned temporary directory."""
    source_path = Path(source_db_path).expanduser().resolve()
    if not source_path.exists():
        raise CommandError(f"Configured SQLite database does not exist: {source_path}")
    if not source_path.is_file():
        raise CommandError(f"Configured SQLite database is not a regular file: {source_path}")
    root = Path(backup_root).expanduser().resolve()
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise CommandError(f"Could not create backup directory {root}: {exc}") from exc
    if not root.is_dir():
        raise CommandError(f"Backup output path is not a directory: {root}")

    final_directory = _backup_target(root, timestamp)
    temp_directory = Path(tempfile.mkdtemp(prefix=".trainos-backup-", dir=root))
    destination_path = temp_directory / "db.sqlite3"
    created_at = created_at or timezone.localtime(timezone.now())
    if timezone.is_naive(created_at):
        created_at = timezone.make_aware(created_at, timezone.get_current_timezone())

    try:
        source_integrity = sqlite_integrity_check(source_path)
        _ensure_ok(source_integrity, "source")
        try:
            with closing(sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True)) as source_connection:
                with closing(sqlite3.connect(destination_path)) as destination_connection:
                    source_connection.backup(destination_connection)
                    destination_connection.commit()
        except (OSError, sqlite3.Error) as exc:
            raise CommandError(f"SQLite backup generation failed: {exc}") from exc

        backup_integrity = sqlite_integrity_check(destination_path)
        _ensure_ok(backup_integrity, "backup")
        metadata = {
            "format": BACKUP_FORMAT,
            "schema_version": BACKUP_SCHEMA_VERSION,
            "backup_command_version": BACKUP_COMMAND_VERSION,
            "created_at": timezone.localtime(created_at).isoformat(),
            "django_timezone": settings.TIME_ZONE,
            "database_engine": "sqlite",
            "source_database_name": source_path.name,
            "backup_database_name": destination_path.name,
            "source_size_bytes": source_path.stat().st_size,
            "backup_size_bytes": destination_path.stat().st_size,
            "source_integrity_check": "ok",
            "backup_integrity_check": "ok",
        }
        metadata_path = temp_directory / "backup_metadata.json"
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(temp_directory, final_directory)
    except CommandError:
        raise
    except OSError as exc:
        raise CommandError(f"Backup generation failed: {exc}") from exc
    finally:
        if temp_directory.exists():
            shutil.rmtree(temp_directory, ignore_errors=True)

    return BackupResult(
        directory=final_directory,
        database_path=final_directory / destination_path.name,
        metadata_path=final_directory / "backup_metadata.json",
        metadata=metadata,
    )


class Command(BaseCommand):
    help = "Create an integrity-checked local SQLite TrainOS backup."

    def add_arguments(self, parser):
        parser.add_argument("--output-dir", help="Directory for backup folders (default: <project root>/backups).")

    def handle(self, *args, **options):
        source_path = resolve_sqlite_database_path(settings.DATABASES["default"])
        backup_root = Path(options["output_dir"]).expanduser() if options.get("output_dir") else Path(settings.PROJECT_ROOT) / "backups"
        now = timezone.localtime(timezone.now())
        result = create_sqlite_backup(
            source_path,
            backup_root,
            timestamp=now.strftime("%Y%m%d-%H%M%S"),
            created_at=now,
        )
        self.stdout.write(self.style.SUCCESS("TrainOS backup created successfully."))
        self.stdout.write(self.style.SUCCESS(f"Backup directory: {result.directory}"))
        self.stdout.write(self.style.SUCCESS(f"Database: {result.database_path.name}"))
        self.stdout.write(self.style.SUCCESS("Integrity: ok"))
        self.stdout.write(self.style.SUCCESS(f"Size: {result.metadata['backup_size_bytes']} bytes"))
        return str(result.directory)
