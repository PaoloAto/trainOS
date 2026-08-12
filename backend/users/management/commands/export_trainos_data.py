"""Create a portable, user-scoped TrainOS training-data export."""

from __future__ import annotations

import csv
import json
import os
import re
import shutil
import tempfile
import zipfile
from datetime import date, datetime
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from climbing.models import ClimbAttempt, ClimbingProject, ClimbingSession
from gym.models import ActiveWorkout, Exercise, ExerciseReference, GymSession, GymSet, WorkoutTemplate, WorkoutTemplateExercise
from journal.models import DailyCheckIn
from running.models import ImportBatch, RunActivity
from users.models import TrainingPreferences


SCHEMA_VERSION = 1
CSV_DATASETS = {
    "checkins": ("checkins.csv", "checkins"), "runs": ("runs.csv", "running.runs"),
    "running_import_batches": ("running_import_batches.csv", "running.import_batches"),
    "exercises": ("exercises.csv", "gym.exercises"), "exercise_references": ("exercise_references.csv", "gym.exercise_references"),
    "gym_sessions": ("gym_sessions.csv", "gym.sessions"), "gym_sets": ("gym_sets.csv", "gym.sets"),
    "workout_templates": ("workout_templates.csv", "gym.workout_templates"), "workout_template_items": ("workout_template_items.csv", "gym.workout_template_items"),
    "climbing_sessions": ("climbing_sessions.csv", "climbing.sessions"), "climbing_attempts": ("climbing_attempts.csv", "climbing.attempts"),
    "climbing_projects": ("climbing_projects.csv", "climbing.projects"),
}


def _iso(value):
    if isinstance(value, datetime):
        return timezone.localtime(value).isoformat() if timezone.is_aware(value) else value.isoformat()
    return value.isoformat() if isinstance(value, date) else value


def _value(value):
    return _iso(value) if isinstance(value, (datetime, date)) else value


def _safe_upload_name(value):
    return Path(str(value or "").replace("\\", "/")).name


def _safe_user_name(value):
    return re.sub(r"[^A-Za-z0-9._-]+", "-", str(value)).strip(".-_") or "user"


def _csv_value(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(_value(value))


class ExportBuilder:
    """Query, validate, and serialize one user's portable source records."""

    def __init__(self, user):
        self.user, self.user_id = user, user.pk

    def _private_error(self, kind, source_id, owner_id):
        raise CommandError(f"Integrity error: {kind} {source_id} references private data owned by user {owner_id}, not selected user {self.user_id}.")

    @staticmethod
    def _record(row, fields):
        return {key: _value(getattr(row, key)) for key in fields}

    def build(self):
        preferences = TrainingPreferences.objects.filter(user=self.user).first()
        checkins = list(DailyCheckIn.objects.filter(user=self.user).order_by("date", "id"))
        batches = list(ImportBatch.objects.filter(user=self.user).order_by("created_at", "id"))
        runs = list(RunActivity.objects.filter(user=self.user).select_related("import_batch").order_by("started_at", "id"))
        batch_ids = {row.pk for row in batches}
        for row in runs:
            if row.import_batch_id and row.import_batch.user_id != self.user_id:
                self._private_error("run", row.pk, row.import_batch.user_id)
            if row.import_batch_id and row.import_batch_id not in batch_ids:
                raise CommandError(f"Integrity error: run {row.pk} import batch is not exportable.")

        sessions = list(GymSession.objects.filter(user=self.user).order_by("date", "id"))
        session_ids = {row.pk for row in sessions}
        gym_sets = list(GymSet.objects.filter(session_id__in=session_ids).select_related("session", "exercise", "exercise__primary_muscle_group").order_by("session_id", "set_number", "id"))
        templates = list(WorkoutTemplate.objects.filter(user=self.user).order_by("name", "id"))
        template_ids = {row.pk for row in templates}
        template_items = list(WorkoutTemplateExercise.objects.filter(template_id__in=template_ids).select_related("template", "exercise", "exercise__primary_muscle_group").order_by("template_id", "order", "id"))
        references = list(ExerciseReference.objects.filter(user=self.user).select_related("exercise", "exercise__primary_muscle_group").order_by("exercise_id", "created_at", "id"))
        active = ActiveWorkout.objects.filter(user=self.user).select_related("template").first()
        exercise_ids = set(Exercise.objects.filter(user=self.user).values_list("id", flat=True))
        exercise_ids.update(row.exercise_id for row in gym_sets + template_items + references)
        exercises = list(Exercise.objects.filter(id__in=exercise_ids).select_related("primary_muscle_group").prefetch_related("secondary_muscle_groups").order_by("name", "id"))
        selected_exercise_ids = {row.pk for row in exercises}
        for row in exercises:
            if row.user_id not in (None, self.user_id):
                self._private_error("exercise", row.pk, row.user_id)
        for row in gym_sets:
            if row.session.user_id != self.user_id or row.exercise_id not in selected_exercise_ids:
                raise CommandError(f"Integrity error: gym set {row.pk} has an unexportable relationship.")
        for row in template_items:
            if row.template.user_id != self.user_id or row.exercise_id not in selected_exercise_ids:
                raise CommandError(f"Integrity error: workout template item {row.pk} has an unexportable relationship.")
        for row in references:
            if row.exercise_id not in selected_exercise_ids:
                raise CommandError(f"Integrity error: exercise reference {row.pk} has an unexportable exercise.")
        if active and active.template_id and active.template_id not in template_ids:
            self._private_error("active workout", active.pk, active.template.user_id)

        climbing_sessions = list(ClimbingSession.objects.filter(user=self.user).order_by("date", "id"))
        climbing_session_ids = {row.pk for row in climbing_sessions}
        attempts = list(ClimbAttempt.objects.filter(session_id__in=climbing_session_ids).select_related("session", "project").order_by("session_id", "created_at", "id"))
        projects = list(ClimbingProject.objects.filter(user=self.user).order_by("created_at", "id"))
        project_ids = {row.pk for row in projects}
        for row in attempts:
            if row.session.user_id != self.user_id:
                self._private_error("climbing attempt", row.pk, row.session.user_id)
            if row.project_id:
                if row.project.user_id != self.user_id:
                    self._private_error("climbing attempt project", row.pk, row.project.user_id)
                if row.project_id not in project_ids:
                    raise CommandError(f"Integrity error: climbing attempt {row.pk} project is not exportable.")

        data = {
            "schema_version": SCHEMA_VERSION, "exported_at": _iso(timezone.now()), "timezone": settings.TIME_ZONE,
            "preferences": self._preferences(preferences) if preferences else None,
            "checkins": [self._checkin(row) for row in checkins],
            "running": {"import_batches": [self._batch(row) for row in batches], "runs": [self._run(row) for row in runs]},
            "gym": {"exercises": [self._exercise(row) for row in exercises], "exercise_references": [self._reference(row) for row in references], "sessions": [self._gym_session(row) for row in sessions], "sets": [self._gym_set(row) for row in gym_sets], "workout_templates": [self._template(row) for row in templates], "workout_template_items": [self._template_item(row) for row in template_items], "active_workout": self._active(active) if active else None},
            "climbing": {"sessions": [self._climbing_session(row) for row in climbing_sessions], "attempts": [self._attempt(row) for row in attempts], "projects": [self._project(row) for row in projects]},
        }
        self.validate(data)
        return data

    def _preferences(self, row):
        return self._record(row, ("primary_focus", "running_goal", "running_sessions_per_week", "running_weekly_distance_target_km", "gym_goal", "gym_sessions_per_week", "climbing_goal", "climbing_sessions_per_week", "climbing_target_bouldering_grade", "climbing_target_route_grade", "created_at", "updated_at"))
    def _checkin(self, row):
        return {"source_id": row.pk, **self._record(row, ("date", "sleep_hours", "sleep_quality", "mood", "energy", "soreness", "stress", "body_weight", "notes", "created_at", "updated_at"))}
    def _batch(self, row):
        return {"source_id": row.pk, "uploaded_file_name": _safe_upload_name(row.uploaded_file.name), **self._record(row, ("source", "file_type", "original_filename", "status", "imported_count", "skipped_count", "error_count", "errors", "created_at", "updated_at"))}
    def _run(self, row):
        return {"source_id": row.pk, "import_batch_source_id": row.import_batch_id, **self._record(row, ("title", "started_at", "distance_km", "duration_seconds", "avg_pace_seconds_per_km", "avg_hr", "max_hr", "elevation_gain_m", "run_type", "perceived_effort", "notes", "source", "source_activity_id", "raw_metadata", "created_at", "updated_at"))}
    def _exercise(self, row):
        return {"source_id": row.pk, "is_shared": row.user_id is None, "primary_muscle_group": row.primary_muscle_group.name, "secondary_muscle_groups": list(row.secondary_muscle_groups.order_by("name").values_list("name", flat=True)), **self._record(row, ("name", "movement_pattern", "equipment", "form_notes", "is_custom", "is_archived", "archived_at", "created_at", "updated_at"))}
    def _reference(self, row):
        return {"source_id": row.pk, "exercise_source_id": row.exercise_id, "exercise_name": row.exercise.name, **self._record(row, ("url", "source", "title", "notes", "created_at"))}
    def _gym_session(self, row):
        return {"source_id": row.pk, **self._record(row, ("date", "split_type", "duration_minutes", "notes", "created_at", "updated_at"))}
    def _gym_set(self, row):
        return {"source_id": row.pk, "session_source_id": row.session_id, "exercise_source_id": row.exercise_id, "exercise_name": row.exercise.name, **self._record(row, ("set_number", "weight", "reps", "rpe", "notes", "created_at"))}
    def _template(self, row):
        return {"source_id": row.pk, **self._record(row, ("name", "split_type", "notes", "is_archived", "archived_at", "created_at", "updated_at"))}
    def _template_item(self, row):
        return {"source_id": row.pk, "template_source_id": row.template_id, "exercise_source_id": row.exercise_id, "exercise_name": row.exercise.name, **self._record(row, ("order", "target_sets", "target_reps_low", "target_reps_high", "suggested_weight", "rest_seconds", "notes", "created_at", "updated_at"))}
    def _active(self, row):
        return {"source_id": row.pk, "template_source_id": row.template_id, **self._record(row, ("started_at", "current_exercise_index", "current_set_index", "logged_sets", "notes", "updated_at"))}
    def _climbing_session(self, row):
        return {"source_id": row.pk, **self._record(row, ("date", "location", "session_type", "duration_minutes", "notes", "created_at", "updated_at"))}
    def _attempt(self, row):
        return {"source_id": row.pk, "session_source_id": row.session_id, "project_source_id": row.project_id, "project_name": row.project.name if row.project_id else None, **self._record(row, ("climb_name", "grade_system", "grade", "style", "result", "attempts", "notes", "created_at"))}
    def _project(self, row):
        return {"source_id": row.pk, **self._record(row, ("name", "grade", "grade_system", "location", "status", "session_type", "started_at", "sent_at", "notes", "created_at", "updated_at"))}

    @staticmethod
    def validate(data):
        ids = lambda rows: {row["source_id"] for row in rows}
        gym, climbing, running = data["gym"], data["climbing"], data["running"]
        checks = ((gym["sets"], "session_source_id", ids(gym["sessions"]), "gym set session"), (gym["sets"], "exercise_source_id", ids(gym["exercises"]), "gym set exercise"), (gym["workout_template_items"], "template_source_id", ids(gym["workout_templates"]), "template item template"), (gym["workout_template_items"], "exercise_source_id", ids(gym["exercises"]), "template item exercise"), (gym["exercise_references"], "exercise_source_id", ids(gym["exercises"]), "exercise reference exercise"), (climbing["attempts"], "session_source_id", ids(climbing["sessions"]), "climbing attempt session"), (running["runs"], "import_batch_source_id", ids(running["import_batches"]), "run import batch"), (climbing["attempts"], "project_source_id", ids(climbing["projects"]), "climbing attempt project"))
        for rows, field, allowed, label in checks:
            for row in rows:
                if row[field] is not None and row[field] not in allowed:
                    raise CommandError(f"Integrity error: {label} source_id {row['source_id']} does not resolve in export.")
        active = gym["active_workout"]
        if active and active["template_source_id"] is not None and active["template_source_id"] not in ids(gym["workout_templates"]):
            raise CommandError("Integrity error: active workout template does not resolve in export.")


def _dataset(data, path):
    for part in path.split("."):
        data = data[part]
    return data


EMPTY_HEADERS = {
    "checkins.csv": ["source_id", "date", "sleep_hours", "sleep_quality", "mood", "energy", "soreness", "stress", "body_weight", "notes", "created_at", "updated_at"], "runs.csv": ["source_id", "import_batch_source_id", "title", "started_at", "distance_km", "duration_seconds", "avg_pace_seconds_per_km", "avg_hr", "max_hr", "elevation_gain_m", "run_type", "perceived_effort", "notes", "source", "source_activity_id", "raw_metadata", "created_at", "updated_at"], "running_import_batches.csv": ["source_id", "uploaded_file_name", "source", "file_type", "original_filename", "status", "imported_count", "skipped_count", "error_count", "errors", "created_at", "updated_at"], "exercises.csv": ["source_id", "is_shared", "primary_muscle_group", "secondary_muscle_groups", "name", "movement_pattern", "equipment", "form_notes", "is_custom", "is_archived", "archived_at", "created_at", "updated_at"], "exercise_references.csv": ["source_id", "exercise_source_id", "exercise_name", "url", "source", "title", "notes", "created_at"], "gym_sessions.csv": ["source_id", "date", "split_type", "duration_minutes", "notes", "created_at", "updated_at"], "gym_sets.csv": ["source_id", "session_source_id", "exercise_source_id", "exercise_name", "set_number", "weight", "reps", "rpe", "notes", "created_at"], "workout_templates.csv": ["source_id", "name", "split_type", "notes", "is_archived", "archived_at", "created_at", "updated_at"], "workout_template_items.csv": ["source_id", "template_source_id", "exercise_source_id", "exercise_name", "order", "target_sets", "target_reps_low", "target_reps_high", "suggested_weight", "rest_seconds", "notes", "created_at", "updated_at"], "climbing_sessions.csv": ["source_id", "date", "location", "session_type", "duration_minutes", "notes", "created_at", "updated_at"], "climbing_attempts.csv": ["source_id", "session_source_id", "project_source_id", "project_name", "climb_name", "grade_system", "grade", "style", "result", "attempts", "notes", "created_at"], "climbing_projects.csv": ["source_id", "name", "grade", "grade_system", "location", "status", "session_type", "started_at", "sent_at", "notes", "created_at", "updated_at"],
}


def _write_csvs(csv_dir, data):
    for filename, path in CSV_DATASETS.values():
        rows = _dataset(data, path)
        headers = list(rows[0]) if rows else EMPTY_HEADERS[filename]
        with (csv_dir / filename).open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            for row in rows:
                writer.writerow({key: _csv_value(row.get(key)) for key in headers})


def _counts(data):
    return {"preferences": int(data["preferences"] is not None), "checkins": len(data["checkins"]), "running.import_batches": len(data["running"]["import_batches"]), "running.runs": len(data["running"]["runs"]), "gym.exercises": len(data["gym"]["exercises"]), "gym.exercise_references": len(data["gym"]["exercise_references"]), "gym.sessions": len(data["gym"]["sessions"]), "gym.sets": len(data["gym"]["sets"]), "gym.workout_templates": len(data["gym"]["workout_templates"]), "gym.workout_template_items": len(data["gym"]["workout_template_items"]), "gym.active_workout": int(data["gym"]["active_workout"] is not None), "climbing.sessions": len(data["climbing"]["sessions"]), "climbing.attempts": len(data["climbing"]["attempts"]), "climbing.projects": len(data["climbing"]["projects"])}


def _validate_privacy(data, manifest):
    rendered = json.dumps({"data": data, "manifest": manifest}, ensure_ascii=False, sort_keys=True)
    database_name = str(settings.DATABASES["default"].get("NAME", ""))
    if os.path.isabs(database_name) and database_name in rendered:
        raise CommandError("Privacy validation failed: active database path appeared in export.")
    forbidden = {"password", "password_hash", "secret_key", "session", "session_key", "auth_token"}
    def walk(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key.lower() in forbidden:
                    raise CommandError(f"Privacy validation failed: forbidden field {key!r} appeared in export.")
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    walk({"data": data, "manifest": manifest})


class Command(BaseCommand):
    help = "Export one user's TrainOS training data as a portable ZIP."
    def add_arguments(self, parser):
        parser.add_argument("--user", required=True, help="Value for the configured user model's USERNAME_FIELD.")
        parser.add_argument("--output-dir", help="Directory for final ZIP (default: <repository root>/exports).")
    def _resolve_user(self, identifier):
        model = get_user_model()
        try:
            matches = model._default_manager.filter(**{model.USERNAME_FIELD: identifier})
            count = matches.count()
        except (TypeError, ValueError, ValidationError) as exc:
            raise CommandError(f"Invalid user identifier: {identifier!r}") from exc
        if count == 0:
            raise CommandError(f"User not found for {model.USERNAME_FIELD}={identifier!r}.")
        if count != 1:
            raise CommandError(f"Ambiguous user identifier for {model.USERNAME_FIELD}={identifier!r}.")
        return matches.get()
    @staticmethod
    def _target(output_dir, user, stamp):
        base = f"trainos-export-{_safe_user_name(user)}-{stamp}"
        target, suffix = output_dir / f"{base}.zip", 2
        while target.exists():
            target, suffix = output_dir / f"{base}_{suffix}.zip", suffix + 1
        return target
    def handle(self, *args, **options):
        user = self._resolve_user(options["user"])
        output_dir = Path(options["output_dir"]).expanduser() if options.get("output_dir") else Path(settings.PROJECT_ROOT) / "exports"
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise CommandError(f"Could not create export directory {output_dir}: {exc}") from exc
        if not output_dir.is_dir():
            raise CommandError(f"Export output path is not a directory: {output_dir}")
        data = ExportBuilder(user).build()
        manifest = {"format": "trainos-portable-export", "schema_version": SCHEMA_VERSION, "export_command_version": 1, "created_at": _iso(timezone.now()), "django_timezone": settings.TIME_ZONE, "user_identifier": str(getattr(user, user.USERNAME_FIELD)), "validation": "ok", "datasets": _counts(data)}
        _validate_privacy(data, manifest)
        target = self._target(output_dir, getattr(user, user.USERNAME_FIELD), timezone.localtime().strftime("%Y%m%d-%H%M%S"))
        temp_dir = Path(tempfile.mkdtemp(prefix=".trainos-export-", dir=output_dir))
        temp_zip, package_dir = temp_dir / f"{target.stem}.zip", temp_dir / target.stem
        try:
            package_dir.mkdir(); csv_dir = package_dir / "csv"; csv_dir.mkdir()
            (package_dir / "data.json").write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
            (package_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
            _write_csvs(csv_dir, data)
            expected = {f"{target.stem}/manifest.json", f"{target.stem}/data.json"} | {f"{target.stem}/csv/{filename}" for filename, _ in CSV_DATASETS.values()}
            with zipfile.ZipFile(temp_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for path in sorted(package_dir.rglob("*")):
                    if path.is_file(): archive.write(path, path.relative_to(temp_dir).as_posix())
            with zipfile.ZipFile(temp_zip) as archive:
                if set(archive.namelist()) != expected or archive.testzip() is not None:
                    raise CommandError("ZIP validation failed: archive entries are incomplete or corrupt.")
                json.loads(archive.read(f"{target.stem}/manifest.json")); json.loads(archive.read(f"{target.stem}/data.json"))
            os.rename(temp_zip, target)
        except CommandError:
            raise
        except (OSError, ValueError, zipfile.BadZipFile) as exc:
            raise CommandError(f"Export generation failed: {exc}") from exc
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
        self.stdout.write(self.style.SUCCESS(f"TrainOS export created: {target}"))
        return str(target)
