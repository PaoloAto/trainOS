"""Safely validate and restore a TrainOS portable export into an empty profile."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import zipfile
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path, PurePosixPath

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from climbing.models import ClimbAttempt, ClimbingProject, ClimbingSession
from gym.models import ActiveWorkout, Exercise, ExerciseReference, GymSession, GymSet, MuscleGroup, WorkoutTemplate, WorkoutTemplateExercise
from journal.models import DailyCheckIn
from running.models import ImportBatch, RunActivity
from users.management.commands.backup_trainos import create_sqlite_backup, resolve_sqlite_database_path
from users.models import TrainingPreferences


SCHEMA_VERSION = 1
DATASETS = (
    ("preferences", None), ("checkins", "checkins"),
    ("running.import_batches", "batches"), ("running.runs", "runs"),
    ("gym.exercises", "exercises"), ("gym.exercise_references", "references"),
    ("gym.sessions", "gym_sessions"), ("gym.sets", "gym_sets"),
    ("gym.workout_templates", "templates"), ("gym.workout_template_items", "template_items"),
    ("gym.active_workout", None), ("climbing.sessions", "climbing_sessions"),
    ("climbing.attempts", "attempts"), ("climbing.projects", "projects"),
)


def _error(message, exc=None):
    if exc is None:
        raise CommandError(message)
    raise CommandError(message) from exc


def _positive_integer(value, label):
    if isinstance(value, bool):
        _error(f"Invalid {label}: expected a positive integer.")
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError) as exc:
        _error(f"Invalid {label}: expected a positive integer.", exc)
    if parsed <= 0 or (isinstance(value, float) and not value.is_integer()):
        _error(f"Invalid {label}: expected a positive integer.")
    return parsed


def _positive_id(value, label):
    return _positive_integer(value, f"{label} source ID")


def _date(value, label):
    if not isinstance(value, str):
        _error(f"Invalid {label}: expected an ISO date.")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        _error(f"Invalid {label}: expected an ISO date.", exc)


def _datetime(value, label):
    if not isinstance(value, str):
        _error(f"Invalid {label}: expected an ISO datetime.")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        _error(f"Invalid {label}: expected an ISO datetime.", exc)
    if timezone.is_naive(parsed):
        _error(f"Invalid {label}: datetime must include a timezone offset.")
    return parsed


def _json(value, label):
    try:
        json.dumps(value)
    except (TypeError, ValueError) as exc:
        _error(f"Invalid {label}: expected JSON-compatible data.", exc)
    return value


def _known_dict(value, label, required):
    if not isinstance(value, dict):
        _error(f"Invalid {label}: expected an object.")
    missing = [key for key in required if key not in value]
    if missing:
        _error(f"Invalid {label}: missing required field(s) {', '.join(missing)}.")
    return {key: value[key] for key in required}


def _load_package(package_path):
    path = Path(package_path).expanduser()
    if not path.exists() or not path.is_file():
        _error(f"Portable import file does not exist or is not a regular file: {path}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            names = [member.filename for member in members]
            if len(names) != len(set(names)):
                _error("Invalid portable export ZIP: duplicate member names are not allowed.")
            roots = set()
            for name in names:
                member_path = PurePosixPath(name)
                if not name or "\\" in name or member_path.is_absolute() or ".." in member_path.parts:
                    _error("Invalid portable export ZIP: unsafe member path.")
                if len(member_path.parts) < 2:
                    _error("Invalid portable export ZIP: every member must be inside one package root.")
                roots.add(member_path.parts[0])
            if len(roots) != 1:
                _error("Invalid portable export ZIP: exactly one package root is required.")
            root = roots.pop()
            manifest_name, data_name = f"{root}/manifest.json", f"{root}/data.json"
            if manifest_name not in names or data_name not in names:
                _error("Invalid portable export ZIP: manifest.json and data.json are required.")
            if archive.testzip() is not None:
                _error("Invalid portable export ZIP: archive data is corrupt.")
            try:
                manifest = json.loads(archive.read(manifest_name).decode("utf-8"))
                data = json.loads(archive.read(data_name).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                _error("Invalid portable export ZIP: manifest.json or data.json is not valid UTF-8 JSON.", exc)
    except zipfile.BadZipFile as exc:
        _error("Invalid portable export ZIP.", exc)
    return path, digest, manifest, data


def _validate_manifest(manifest, data):
    if not isinstance(manifest, dict) or not isinstance(data, dict):
        _error("Invalid portable export: manifest and data must be objects.")
    if manifest.get("format") != "trainos-portable-export":
        _error("Invalid portable export manifest format.")
    if manifest.get("schema_version") != SCHEMA_VERSION or data.get("schema_version") != SCHEMA_VERSION:
        _error("Unsupported portable export schema version; only schema version 1 is supported.")
    if manifest.get("validation") != "ok":
        _error("Portable export manifest validation must be ok.")
    expected = {"preferences", "checkins", "running", "gym", "climbing"}
    if not expected.issubset(data):
        _error("Invalid portable export data: required top-level structures are missing.")
    if not isinstance(data["running"], dict) or not isinstance(data["gym"], dict) or not isinstance(data["climbing"], dict):
        _error("Invalid portable export data: running, gym, and climbing must be objects.")
    for section, keys in (("running", ("import_batches", "runs")), ("gym", ("exercises", "exercise_references", "sessions", "sets", "workout_templates", "workout_template_items", "active_workout")), ("climbing", ("sessions", "attempts", "projects"))):
        if not set(keys).issubset(data[section]):
            _error(f"Invalid portable export data: {section} structures are incomplete.")
    for dotted, attribute in DATASETS:
        current = data
        for part in dotted.split("."):
            current = current[part]
        expected_count = int(current is not None) if attribute is None else len(current) if isinstance(current, list) else -1
        if attribute is not None and not isinstance(current, list):
            _error(f"Invalid portable export data: {dotted} must be a list.")
        if not isinstance(manifest.get("datasets"), dict) or manifest["datasets"].get(dotted) != expected_count:
            _error(f"Portable export manifest count mismatch for {dotted}.")


def _index(rows, label):
    result = {}
    for position, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            _error(f"Invalid {label} record {position}: expected an object.")
        source_id = _positive_id(row.get("source_id"), f"{label} source_id")
        if source_id in result:
            _error(f"Invalid {label}: duplicate source_id {source_id}.")
        result[source_id] = row
    return result


def _require_reference(value, index, label, nullable=False):
    if value is None and nullable:
        return None
    source_id = _positive_id(value, label)
    if source_id not in index:
        _error(f"Broken relationship: {label} {source_id} does not resolve in the portable export.")
    return source_id


def _validate_model(instance, label, exclude=()):
    try:
        instance.full_clean(exclude=list(exclude))
    except ValidationError as exc:
        _error(f"Invalid {label}: {exc.messages[0]}", exc)


def _restore_timestamps(model, pk, values):
    fields = {key: value for key, value in values.items() if value is not None}
    if fields:
        model.objects.filter(pk=pk).update(**fields)


@dataclass
class ImportPlan:
    manifest: dict
    data: dict
    digest: str
    source_user: str
    indexes: dict
    shared_reused: int
    shared_copied: int

    def count(self, name):
        return len(getattr(self, "rows")[name])


class ImportPlanner:
    """Validate schema-v1 JSON and retain only explicit, known model fields."""

    def __init__(self, manifest, data, digest, user):
        self.manifest, self.data, self.digest, self.user = manifest, data, digest, user

    def build(self):
        _validate_manifest(self.manifest, self.data)
        rows = {
            "checkins": self.data["checkins"], "batches": self.data["running"]["import_batches"], "runs": self.data["running"]["runs"],
            "exercises": self.data["gym"]["exercises"], "references": self.data["gym"]["exercise_references"], "gym_sessions": self.data["gym"]["sessions"], "gym_sets": self.data["gym"]["sets"],
            "templates": self.data["gym"]["workout_templates"], "template_items": self.data["gym"]["workout_template_items"],
            "climbing_sessions": self.data["climbing"]["sessions"], "attempts": self.data["climbing"]["attempts"], "projects": self.data["climbing"]["projects"],
        }
        indexes = {key: _index(value, key.replace("_", " ")) for key, value in rows.items()}
        self._relationships(indexes)
        self._fields(rows)
        reused, copied = self._shared_exercise_plan(rows["exercises"])
        plan = ImportPlan(self.manifest, self.data, self.digest, str(self.manifest.get("user_identifier", "unknown")), indexes, reused, copied)
        plan.rows = rows
        return plan

    def _relationships(self, indexes):
        for row in indexes["runs"].values(): _require_reference(row.get("import_batch_source_id"), indexes["batches"], "run import_batch_source_id", True)
        for row in indexes["references"].values(): _require_reference(row.get("exercise_source_id"), indexes["exercises"], "exercise reference exercise_source_id")
        for row in indexes["gym_sets"].values():
            _require_reference(row.get("session_source_id"), indexes["gym_sessions"], "gym set session_source_id")
            _require_reference(row.get("exercise_source_id"), indexes["exercises"], "gym set exercise_source_id")
        for row in indexes["template_items"].values():
            _require_reference(row.get("template_source_id"), indexes["templates"], "template item template_source_id")
            _require_reference(row.get("exercise_source_id"), indexes["exercises"], "template item exercise_source_id")
        for row in indexes["attempts"].values():
            _require_reference(row.get("session_source_id"), indexes["climbing_sessions"], "attempt session_source_id")
            _require_reference(row.get("project_source_id"), indexes["projects"], "attempt project_source_id", True)
        active = self.data["gym"]["active_workout"]
        if active is not None:
            _known_dict(active, "active workout", ("source_id", "template_source_id", "started_at", "current_exercise_index", "current_set_index", "logged_sets", "notes", "updated_at"))
            _positive_id(active["source_id"], "active workout source_id")
            _require_reference(active["template_source_id"], indexes["templates"], "active workout template_source_id", True)
            if not isinstance(active["logged_sets"], list): _error("Invalid active workout logged_sets: expected a list.")
            for position, item in enumerate(active["logged_sets"], 1):
                if not isinstance(item, dict): _error(f"Invalid active workout logged set {position}: expected an object.")
                _require_reference(item.get("exercise"), indexes["exercises"], "active workout logged-set exercise")
                _positive_integer(item.get("reps"), f"active workout logged set {position} reps")

    def _fields(self, rows):
        p = self.data["preferences"]
        preference_fields = ("primary_focus", "running_goal", "running_sessions_per_week", "running_weekly_distance_target_km", "gym_goal", "gym_sessions_per_week", "climbing_goal", "climbing_sessions_per_week", "climbing_target_bouldering_grade", "climbing_target_route_grade", "created_at", "updated_at")
        if p is not None:
            p = _known_dict(p, "preferences", preference_fields); self.data["preferences"] = p
            _datetime(p["created_at"], "preferences created_at"); _datetime(p["updated_at"], "preferences updated_at")
            _validate_model(TrainingPreferences(user=self.user, **{key: p[key] for key in preference_fields[:-2]}), "preferences", ("user",))
        specs = {
            "checkins": (DailyCheckIn, ("date", "sleep_hours", "sleep_quality", "mood", "energy", "soreness", "stress", "body_weight", "notes", "created_at", "updated_at"), {"date"}, {"created_at", "updated_at"}),
            "batches": (ImportBatch, ("source", "file_type", "original_filename", "status", "imported_count", "skipped_count", "error_count", "errors", "created_at", "updated_at"), set(), {"created_at", "updated_at"}),
            "runs": (RunActivity, ("import_batch_source_id", "title", "started_at", "distance_km", "duration_seconds", "avg_pace_seconds_per_km", "avg_hr", "max_hr", "elevation_gain_m", "run_type", "perceived_effort", "notes", "source", "source_activity_id", "raw_metadata", "created_at", "updated_at"), set(), {"started_at", "created_at", "updated_at"}),
            "exercises": (Exercise, ("is_shared", "primary_muscle_group", "secondary_muscle_groups", "name", "movement_pattern", "equipment", "form_notes", "is_custom", "is_archived", "archived_at", "created_at", "updated_at"), set(), {"archived_at", "created_at", "updated_at"}),
            "references": (ExerciseReference, ("exercise_source_id", "exercise_name", "url", "source", "title", "notes", "created_at"), set(), {"created_at"}),
            "gym_sessions": (GymSession, ("date", "split_type", "duration_minutes", "notes", "created_at", "updated_at"), {"date"}, {"created_at", "updated_at"}),
            "gym_sets": (GymSet, ("session_source_id", "exercise_source_id", "exercise_name", "set_number", "weight", "reps", "rpe", "notes", "created_at"), set(), {"created_at"}),
            "templates": (WorkoutTemplate, ("name", "split_type", "notes", "is_archived", "archived_at", "created_at", "updated_at"), set(), {"archived_at", "created_at", "updated_at"}),
            "template_items": (WorkoutTemplateExercise, ("template_source_id", "exercise_source_id", "exercise_name", "order", "target_sets", "target_reps_low", "target_reps_high", "suggested_weight", "rest_seconds", "notes", "created_at", "updated_at"), set(), {"created_at", "updated_at"}),
            "climbing_sessions": (ClimbingSession, ("date", "location", "session_type", "duration_minutes", "notes", "created_at", "updated_at"), {"date"}, {"created_at", "updated_at"}),
            "attempts": (ClimbAttempt, ("session_source_id", "project_source_id", "project_name", "climb_name", "grade_system", "grade", "style", "result", "attempts", "notes", "created_at"), set(), {"created_at"}),
            "projects": (ClimbingProject, ("name", "grade", "grade_system", "location", "status", "session_type", "started_at", "sent_at", "notes", "created_at", "updated_at"), {"started_at", "sent_at"}, {"created_at", "updated_at"}),
        }
        for key, (model, fields, date_fields, datetime_fields) in specs.items():
            normalized = []
            for source_id, row in self._index_rows(rows[key], key).items():
                clean = _known_dict(row, key, ("source_id",) + fields)
                for field in date_fields:
                    if clean[field] is not None: clean[field] = _date(clean[field], f"{key} {field}")
                for field in datetime_fields:
                    if clean[field] is not None: clean[field] = _datetime(clean[field], f"{key} {field}")
                for field in ("errors", "raw_metadata"):
                    if field in clean: _json(clean[field], f"{key} {field}")
                normalized.append(clean)
            rows[key] = normalized
        for row in rows["exercises"]:
            if not isinstance(row["is_shared"], bool) or not isinstance(row["is_custom"], bool) or not isinstance(row["is_archived"], bool) or not isinstance(row["secondary_muscle_groups"], list):
                _error("Invalid exercise: boolean and secondary muscle group fields are malformed.")
            self._muscles(row)
            _validate_model(Exercise(user=self.user, name=row["name"], primary_muscle_group=self._muscle(row["primary_muscle_group"]), movement_pattern=row["movement_pattern"], equipment=row["equipment"], form_notes=row["form_notes"], is_custom=row["is_custom"], is_archived=row["is_archived"], archived_at=row["archived_at"]), "exercise", ("user", "primary_muscle_group"))
        # Validate model-owned scalar fields without treating portable relationship labels as model attributes.
        for row in rows["checkins"]: _validate_model(DailyCheckIn(user=self.user, **{key: row[key] for key in ("date", "sleep_hours", "sleep_quality", "mood", "energy", "soreness", "stress", "body_weight", "notes")}), "check-in", ("user",))
        for row in rows["batches"]: _validate_model(ImportBatch(user=self.user, **{key: row[key] for key in ("source", "file_type", "original_filename", "status", "imported_count", "skipped_count", "error_count", "errors")}), "import batch", ("user", "uploaded_file"))
        for row in rows["runs"]: _validate_model(RunActivity(user=self.user, **{key: row[key] for key in ("title", "started_at", "distance_km", "duration_seconds", "avg_hr", "max_hr", "elevation_gain_m", "run_type", "perceived_effort", "notes", "source", "source_activity_id", "raw_metadata")}), "run", ("user", "import_batch"))
        for row in rows["gym_sessions"]: _validate_model(GymSession(user=self.user, **{key: row[key] for key in ("date", "split_type", "duration_minutes", "notes")}), "gym session", ("user",))
        for row in rows["references"]: _validate_model(ExerciseReference(user=self.user, url=row["url"], source=row["source"], title=row["title"], notes=row["notes"]), "exercise reference", ("user", "exercise"))
        for row in rows["gym_sets"]: _validate_model(GymSet(set_number=row["set_number"], weight=row["weight"], reps=row["reps"], rpe=row["rpe"], notes=row["notes"]), "gym set", ("session", "exercise"))
        for row in rows["templates"]: _validate_model(WorkoutTemplate(user=self.user, **{key: row[key] for key in ("name", "split_type", "notes", "is_archived", "archived_at")}), "workout template", ("user",))
        for row in rows["template_items"]: _validate_model(WorkoutTemplateExercise(order=row["order"], target_sets=row["target_sets"], target_reps_low=row["target_reps_low"], target_reps_high=row["target_reps_high"], suggested_weight=row["suggested_weight"], rest_seconds=row["rest_seconds"], notes=row["notes"]), "workout template item", ("template", "exercise"))
        for row in rows["climbing_sessions"]: _validate_model(ClimbingSession(user=self.user, **{key: row[key] for key in ("date", "location", "session_type", "duration_minutes", "notes")}), "climbing session", ("user",))
        for row in rows["attempts"]: _validate_model(ClimbAttempt(climb_name=row["climb_name"], grade_system=row["grade_system"], grade=row["grade"], style=row["style"], result=row["result"], attempts=row["attempts"], notes=row["notes"]), "climbing attempt", ("session", "project"))
        for row in rows["projects"]: _validate_model(ClimbingProject(user=self.user, **{key: row[key] for key in ("name", "grade", "grade_system", "location", "status", "session_type", "started_at", "sent_at", "notes")}), "climbing project", ("user",))
        active = self.data["gym"]["active_workout"]
        if active:
            active["started_at"] = _datetime(active["started_at"], "active workout started_at"); active["updated_at"] = _datetime(active["updated_at"], "active workout updated_at")
            _validate_model(ActiveWorkout(user=self.user, started_at=active["started_at"], current_exercise_index=active["current_exercise_index"], current_set_index=active["current_set_index"], logged_sets=active["logged_sets"], notes=active["notes"]), "active workout", ("user", "template"))

    @staticmethod
    def _index_rows(rows, label):
        return _index(rows, label)

    @staticmethod
    def _muscle(name):
        matches = MuscleGroup.objects.filter(name=name)
        if matches.count() != 1: _error(f"Missing or ambiguous muscle group: {name!r}.")
        return matches.get()

    def _muscles(self, row):
        self._muscle(row["primary_muscle_group"])
        for name in row["secondary_muscle_groups"]:
            if not isinstance(name, str): _error("Invalid exercise secondary muscle group.")
            self._muscle(name)

    def _shared_exercise_plan(self, exercises):
        reused = copied = 0
        for row in exercises:
            if not row["is_shared"]: continue
            matches = self._shared_matches(row)
            if len(matches) > 1: _error(f"Ambiguous shared exercise match for {row['name']!r}.")
            reused += bool(matches); copied += not bool(matches)
        return reused, copied

    def _shared_matches(self, row):
        wanted_secondary = sorted(row["secondary_muscle_groups"])
        candidates = Exercise.objects.filter(user__isnull=True, name=row["name"], primary_muscle_group__name=row["primary_muscle_group"], movement_pattern=row["movement_pattern"], equipment=row["equipment"]).prefetch_related("secondary_muscle_groups")
        return [candidate for candidate in candidates if sorted(candidate.secondary_muscle_groups.values_list("name", flat=True)) == wanted_secondary]


def target_state(user):
    checks = {
        "checkins": DailyCheckIn.objects.filter(user=user).count(), "import batches": ImportBatch.objects.filter(user=user).count(), "runs": RunActivity.objects.filter(user=user).count(),
        "user exercises": Exercise.objects.filter(user=user).count(), "exercise references": ExerciseReference.objects.filter(user=user).count(), "gym sessions": GymSession.objects.filter(user=user).count(),
        "gym sets": GymSet.objects.filter(session__user=user).count(), "templates": WorkoutTemplate.objects.filter(user=user).count(), "template items": WorkoutTemplateExercise.objects.filter(template__user=user).count(), "active workout": ActiveWorkout.objects.filter(user=user).count(),
        "climbing sessions": ClimbingSession.objects.filter(user=user).count(), "attempts": ClimbAttempt.objects.filter(session__user=user).count(), "projects": ClimbingProject.objects.filter(user=user).count(),
    }
    return {key: value for key, value in checks.items() if value}


class Restorer:
    def __init__(self, plan, user): self.plan, self.user = plan, user

    def apply(self):
        if target_state(self.user): _error("Target training profile is no longer empty.")
        self.maps = {"batches": {}, "exercises": {}, "gym_sessions": {}, "templates": {}, "climbing_sessions": {}, "projects": {}}
        self.created = {key: 0 for _, key in DATASETS if key}
        self.shared_reused = self.shared_copied = 0
        self._preferences(); self._checkins(); self._exercises(); self._references(); self._batches(); self._runs(); self._gym(); self._templates(); self._climbing(); self._active(); self.validate()

    def _preferences(self):
        data = self.plan.data["preferences"]
        if data is None:
            TrainingPreferences.objects.filter(user=self.user).delete(); return
        fields = ("primary_focus", "running_goal", "running_sessions_per_week", "running_weekly_distance_target_km", "gym_goal", "gym_sessions_per_week", "climbing_goal", "climbing_sessions_per_week", "climbing_target_bouldering_grade", "climbing_target_route_grade")
        obj, _ = TrainingPreferences.objects.update_or_create(user=self.user, defaults={key: data[key] for key in fields})
        _restore_timestamps(TrainingPreferences, obj.pk, {"created_at": data["created_at"], "updated_at": data["updated_at"]})

    def _checkins(self):
        fields = ("date", "sleep_hours", "sleep_quality", "mood", "energy", "soreness", "stress", "body_weight", "notes")
        for row in self.plan.rows["checkins"]:
            obj = DailyCheckIn.objects.create(user=self.user, **{key: row[key] for key in fields})
            _restore_timestamps(DailyCheckIn, obj.pk, {"created_at": row["created_at"], "updated_at": row["updated_at"]})
            self.created["checkins"] += 1

    def _exercises(self):
        planner = ImportPlanner(self.plan.manifest, self.plan.data, self.plan.digest, self.user)
        for row in self.plan.rows["exercises"]:
            muscles = [planner._muscle(name) for name in row["secondary_muscle_groups"]]
            if row["is_shared"]:
                matches = planner._shared_matches(row)
                if len(matches) > 1: _error(f"Ambiguous shared exercise match for {row['name']!r}.")
                if matches:
                    obj = matches[0]; self.shared_reused += 1
                else:
                    obj = self._new_exercise(row, muscles, force_custom=True); self.shared_copied += 1; self.created["exercises"] += 1
            else:
                obj = self._new_exercise(row, muscles); self.created["exercises"] += 1
            self.maps["exercises"][_positive_id(row["source_id"], "exercise source_id")] = obj

    def _new_exercise(self, row, muscles, force_custom=False):
        primary = MuscleGroup.objects.get(name=row["primary_muscle_group"])
        obj = Exercise.objects.create(user=self.user, name=row["name"], primary_muscle_group=primary, movement_pattern=row["movement_pattern"], equipment=row["equipment"], form_notes=row["form_notes"], is_custom=True if force_custom else row["is_custom"], is_archived=row["is_archived"], archived_at=row["archived_at"])
        obj.secondary_muscle_groups.set(muscles)
        _restore_timestamps(Exercise, obj.pk, {"created_at": row["created_at"], "updated_at": row["updated_at"]})
        return obj

    def _references(self):
        for row in self.plan.rows["references"]:
            obj = ExerciseReference.objects.create(user=self.user, exercise=self.maps["exercises"][_positive_id(row["exercise_source_id"], "reference exercise")], url=row["url"], source=row["source"], title=row["title"], notes=row["notes"])
            _restore_timestamps(ExerciseReference, obj.pk, {"created_at": row["created_at"]}); self.created["references"] += 1

    def _batches(self):
        for row in self.plan.rows["batches"]:
            obj = ImportBatch.objects.create(user=self.user, uploaded_file="", **{key: row[key] for key in ("source", "file_type", "original_filename", "status", "imported_count", "skipped_count", "error_count", "errors")})
            _restore_timestamps(ImportBatch, obj.pk, {"created_at": row["created_at"], "updated_at": row["updated_at"]}); self.maps["batches"][_positive_id(row["source_id"], "batch source_id")] = obj; self.created["batches"] += 1

    def _runs(self):
        fields = ("title", "started_at", "distance_km", "duration_seconds", "avg_hr", "max_hr", "elevation_gain_m", "run_type", "perceived_effort", "notes", "source", "source_activity_id", "raw_metadata")
        for row in self.plan.rows["runs"]:
            batch_id = _require_reference(row["import_batch_source_id"], self.plan.indexes["batches"], "run batch", True)
            obj = RunActivity.objects.create(user=self.user, import_batch=self.maps["batches"].get(batch_id), **{key: row[key] for key in fields})
            _restore_timestamps(RunActivity, obj.pk, {"created_at": row["created_at"], "updated_at": row["updated_at"]}); self.created["runs"] += 1

    def _gym(self):
        for row in self.plan.rows["gym_sessions"]:
            obj = GymSession.objects.create(user=self.user, **{key: row[key] for key in ("date", "split_type", "duration_minutes", "notes")}); _restore_timestamps(GymSession, obj.pk, {"created_at": row["created_at"], "updated_at": row["updated_at"]}); self.maps["gym_sessions"][_positive_id(row["source_id"], "session source_id")] = obj; self.created["gym_sessions"] += 1
        for row in self.plan.rows["gym_sets"]:
            obj = GymSet.objects.create(session=self.maps["gym_sessions"][_positive_id(row["session_source_id"], "set session")], exercise=self.maps["exercises"][_positive_id(row["exercise_source_id"], "set exercise")], **{key: row[key] for key in ("set_number", "weight", "reps", "rpe", "notes")}); _restore_timestamps(GymSet, obj.pk, {"created_at": row["created_at"]}); self.created["gym_sets"] += 1

    def _templates(self):
        for row in self.plan.rows["templates"]:
            obj = WorkoutTemplate.objects.create(user=self.user, **{key: row[key] for key in ("name", "split_type", "notes", "is_archived", "archived_at")}); _restore_timestamps(WorkoutTemplate, obj.pk, {"created_at": row["created_at"], "updated_at": row["updated_at"]}); self.maps["templates"][_positive_id(row["source_id"], "template source_id")] = obj; self.created["templates"] += 1
        for row in self.plan.rows["template_items"]:
            obj = WorkoutTemplateExercise.objects.create(template=self.maps["templates"][_positive_id(row["template_source_id"], "template item template")], exercise=self.maps["exercises"][_positive_id(row["exercise_source_id"], "template item exercise")], **{key: row[key] for key in ("order", "target_sets", "target_reps_low", "target_reps_high", "suggested_weight", "rest_seconds", "notes")}); _restore_timestamps(WorkoutTemplateExercise, obj.pk, {"created_at": row["created_at"], "updated_at": row["updated_at"]}); self.created["template_items"] += 1

    def _climbing(self):
        for row in self.plan.rows["projects"]:
            obj = ClimbingProject.objects.create(user=self.user, **{key: row[key] for key in ("name", "grade", "grade_system", "location", "status", "session_type", "started_at", "sent_at", "notes")}); _restore_timestamps(ClimbingProject, obj.pk, {"created_at": row["created_at"], "updated_at": row["updated_at"]}); self.maps["projects"][_positive_id(row["source_id"], "project source_id")] = obj; self.created["projects"] += 1
        for row in self.plan.rows["climbing_sessions"]:
            obj = ClimbingSession.objects.create(user=self.user, **{key: row[key] for key in ("date", "location", "session_type", "duration_minutes", "notes")}); _restore_timestamps(ClimbingSession, obj.pk, {"created_at": row["created_at"], "updated_at": row["updated_at"]}); self.maps["climbing_sessions"][_positive_id(row["source_id"], "climbing session source_id")] = obj; self.created["climbing_sessions"] += 1
        for row in self.plan.rows["attempts"]:
            project_id = _require_reference(row["project_source_id"], self.plan.indexes["projects"], "attempt project", True)
            obj = ClimbAttempt.objects.create(session=self.maps["climbing_sessions"][_positive_id(row["session_source_id"], "attempt session")], project=self.maps["projects"].get(project_id), **{key: row[key] for key in ("climb_name", "grade_system", "grade", "style", "result", "attempts", "notes")}); _restore_timestamps(ClimbAttempt, obj.pk, {"created_at": row["created_at"]}); self.created["attempts"] += 1

    def _active(self):
        row = self.plan.data["gym"]["active_workout"]
        if row is None: return
        logged_sets = copy.deepcopy(row["logged_sets"])
        for item in logged_sets: item["exercise"] = self.maps["exercises"][_positive_id(item["exercise"], "active workout exercise")].pk
        template_id = _require_reference(row["template_source_id"], self.plan.indexes["templates"], "active workout template", True)
        obj = ActiveWorkout.objects.create(user=self.user, template=self.maps["templates"].get(template_id), started_at=row["started_at"], current_exercise_index=row["current_exercise_index"], current_set_index=row["current_set_index"], logged_sets=logged_sets, notes=row["notes"])
        _restore_timestamps(ActiveWorkout, obj.pk, {"updated_at": row["updated_at"]})

    def validate(self):
        expected = {"checkins": self.created["checkins"], "import batches": self.created["batches"], "runs": self.created["runs"], "user exercises": self.created["exercises"], "exercise references": self.created["references"], "gym sessions": self.created["gym_sessions"], "gym sets": self.created["gym_sets"], "templates": self.created["templates"], "template items": self.created["template_items"], "active workout": int(self.plan.data["gym"]["active_workout"] is not None), "climbing sessions": self.created["climbing_sessions"], "attempts": self.created["attempts"], "projects": self.created["projects"]}
        actual = target_state(self.user)
        for key, value in expected.items():
            if actual.get(key, 0) != value: _error(f"Post-import validation failed: {key} count mismatch.")
        active = ActiveWorkout.objects.filter(user=self.user).select_related("template").first()
        if active:
            if active.template_id and active.template.user_id != self.user.pk: _error("Post-import validation failed: active workout template ownership.")
            accessible = set(Exercise.objects.filter(user__isnull=True).values_list("pk", flat=True)) | set(Exercise.objects.filter(user=self.user).values_list("pk", flat=True))
            if any(item.get("exercise") not in accessible for item in active.logged_sets): _error("Post-import validation failed: active workout exercise relationship.")


class Command(BaseCommand):
    help = "Safely dry-run or restore a TrainOS portable export into an empty training profile."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Portable TrainOS export ZIP.")
        parser.add_argument("--user", required=True, help="Target user's USERNAME_FIELD value.")
        parser.add_argument("--apply", action="store_true", help="Apply the validated import (dry run is the default).")
        parser.add_argument("--backup-output-dir", help="Directory for required pre-import SQLite backup.")

    def _user(self, identifier):
        model = get_user_model()
        try: matches = model._default_manager.filter(**{model.USERNAME_FIELD: identifier})
        except (TypeError, ValueError) as exc: _error(f"Invalid target user identifier: {identifier!r}", exc)
        if matches.count() != 1: _error(f"Target user not found or ambiguous for {model.USERNAME_FIELD}={identifier!r}.")
        return matches.get()

    def _summary(self, plan, user, state, *, dry):
        rows = plan.rows
        self.stdout.write("TrainOS portable import dry run" if dry else "TrainOS portable import plan")
        self.stdout.write(f"Package SHA-256: {plan.digest}\nSource user: {plan.source_user}\nTarget user: {getattr(user, user.USERNAME_FIELD)}\nSchema: 1\n")
        for label, key in (("Preferences", None), ("Check-ins", "checkins"), ("Runs", "runs"), ("Import batches", "batches"), ("Exercises", "exercises"), ("Gym sessions", "gym_sessions"), ("Gym sets", "gym_sets"), ("Templates", "templates"), ("Climbing sessions", "climbing_sessions"), ("Climbing attempts", "attempts"), ("Projects", "projects")):
            self.stdout.write(f"{label}: {int(plan.data['preferences'] is not None) if key is None else len(rows[key])}")
        self.stdout.write(f"Active workout: {int(plan.data['gym']['active_workout'] is not None)}\nManifest counts: OK\nRelationships: OK")
        self.stdout.write("Target state: EMPTY" if not state else "Target state: NON-EMPTY (apply blocked: " + ", ".join(f"{key}={value}" for key, value in state.items()) + ")")
        self.stdout.write("Automatic backup on apply: REQUIRED")

    def handle(self, *args, **options):
        path, digest, manifest, data = _load_package(options["file"])
        user = self._user(options["user"])
        plan = ImportPlanner(manifest, data, digest, user).build()
        state = target_state(user)
        self._summary(plan, user, state, dry=not options["apply"])
        if not options["apply"]:
            if state: self.stdout.write("DRY RUN PASSED: apply is blocked until the target training profile is empty.")
            else: self.stdout.write(self.style.SUCCESS("DRY RUN PASSED\nNo database changes were made.\nRun again with --apply to import."))
            return None
        if state: _error("Target training profile is not empty: " + ", ".join(f"{key}={value}" for key, value in state.items()))
        source_path = resolve_sqlite_database_path(settings.DATABASES["default"])
        backup_root = Path(options["backup_output_dir"]).expanduser() if options.get("backup_output_dir") else Path(settings.PROJECT_ROOT) / "backups"
        now = timezone.localtime(timezone.now())
        backup = create_sqlite_backup(source_path, backup_root, timestamp=now.strftime("%Y%m%d-%H%M%S"), created_at=now)
        with transaction.atomic():
            restorer = Restorer(plan, user); restorer.apply()
        self.stdout.write(self.style.SUCCESS("TrainOS portable import completed.\n"))
        self.stdout.write(f"Package SHA-256: {plan.digest}\nSource user: {plan.source_user}\nTarget user: {getattr(user, user.USERNAME_FIELD)}\nPre-import backup: {backup.directory}\n")
        self.stdout.write("Imported:")
        for label, key in (("Check-ins", "checkins"), ("Runs", "runs"), ("Import batches", "batches"), ("User exercises", "exercises"), ("Gym sessions", "gym_sessions"), ("Gym sets", "gym_sets"), ("Templates", "templates"), ("Climbing sessions", "climbing_sessions"), ("Attempts", "attempts"), ("Projects", "projects")):
            self.stdout.write(f"  {label}: {restorer.created[key]}")
        self.stdout.write(f"  Shared exercises reused: {restorer.shared_reused}\n  Shared exercises copied privately: {restorer.shared_copied}\n  Active workout: {int(plan.data['gym']['active_workout'] is not None)}\n\nPost-import validation: OK")
        return str(backup.directory)
