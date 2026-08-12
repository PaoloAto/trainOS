import csv
import io
import json
import tempfile
import zipfile
from datetime import date
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from climbing.models import ClimbAttempt, ClimbingProject, ClimbingSession
from gym.models import ActiveWorkout, Exercise, ExerciseReference, GymSession, GymSet, MuscleGroup, WorkoutTemplate, WorkoutTemplateExercise
from journal.models import DailyCheckIn
from running.models import ImportBatch, RunActivity
from users.models import TrainingPreferences


class PortableExportTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="exporter", password="very-secret-password")
        self.other = User.objects.create_user(username="other", password="other-secret-password")
        self.temp = tempfile.TemporaryDirectory()
        self.output = Path(self.temp.name)
        self.create_full_export_data()

    def tearDown(self):
        self.temp.cleanup()

    def create_full_export_data(self):
        TrainingPreferences.objects.create(user=self.user, primary_focus="running", running_weekly_distance_target_km=25.5)
        DailyCheckIn.objects.create(user=self.user, date=date(2026, 1, 2), sleep_hours=7.5, notes="Good day")
        DailyCheckIn.objects.create(user=self.other, date=date(2026, 1, 2), notes="Other data")
        batch = ImportBatch.objects.create(user=self.user, original_filename=r"C:\Users\private\activities\morning.tcx", uploaded_file=r"C:\Users\private\source.tcx", errors=[{"line": 4, "message": "ignored"}])
        self.run = RunActivity.objects.create(user=self.user, title="Morning run", started_at=timezone.now(), distance_km=5, duration_seconds=1500, import_batch=batch, raw_metadata={"device": "watch", "splits": [300]})
        RunActivity.objects.create(user=self.other, title="Other run", started_at=timezone.now(), distance_km=1, duration_seconds=400)
        muscle, _ = MuscleGroup.objects.get_or_create(name="Chest")
        self.exercise = Exercise.objects.create(user=self.user, name="Bench press", primary_muscle_group=muscle, equipment="barbell")
        self.shared = Exercise.objects.create(user=None, name="Pull-up", primary_muscle_group=muscle, is_custom=False)
        Exercise.objects.create(user=None, name="Unrelated global exercise", primary_muscle_group=muscle, is_custom=False)
        Exercise.objects.create(user=self.other, name="Other exercise", primary_muscle_group=muscle)
        ExerciseReference.objects.create(user=self.user, exercise=self.exercise, url="https://example.test/bench", source="website", title="Bench reference")
        self.gym_session = GymSession.objects.create(user=self.user, date=date(2026, 1, 3), split_type="push", notes="session")
        GymSet.objects.create(session=self.gym_session, exercise=self.shared, set_number=1, weight=None, reps=8, rpe=None, notes="bodyweight")
        template = WorkoutTemplate.objects.create(user=self.user, name="Push day", split_type="push")
        WorkoutTemplateExercise.objects.create(template=template, exercise=self.exercise, order=1, target_sets=3, target_reps_low=None)
        self.active_workout = ActiveWorkout.objects.create(user=self.user, template=template, logged_sets=[{"exercise": self.exercise.pk, "set": 1, "reps": 8, "done": True}])
        self.climbing_session = ClimbingSession.objects.create(user=self.user, date=date(2026, 1, 4), session_type="bouldering", location="Gym")
        self.project = ClimbingProject.objects.create(user=self.user, name="Blue slab", grade="V4", grade_system="v_scale")
        ClimbAttempt.objects.create(session=self.climbing_session, project=self.project, climb_name="Blue slab", grade_system="v_scale", grade="V4", style="slab", result="project", attempts=2)
        ClimbingSession.objects.create(user=self.other, date=date(2026, 1, 4), session_type="bouldering")

    def export(self):
        return Path(call_command("export_trainos_data", user="exporter", output_dir=str(self.output)))

    def read_export(self, path=None):
        path = path or self.export()
        with zipfile.ZipFile(path) as archive:
            root = path.stem
            return json.loads(archive.read(f"{root}/data.json")), json.loads(archive.read(f"{root}/manifest.json")), archive, path

    def test_user_required_and_missing_user_fail(self):
        with self.assertRaises(CommandError):
            call_command("export_trainos_data", output_dir=str(self.output))
        with self.assertRaisesMessage(CommandError, "User not found"):
            call_command("export_trainos_data", user="missing", output_dir=str(self.output))
        self.assertEqual(list(self.output.glob("*.zip")), [])

    def test_complete_export_scope_serialization_and_csvs(self):
        path = self.export()
        self.assertTrue(path.exists())
        with zipfile.ZipFile(path) as archive:
            root = path.stem
            data = json.loads(archive.read(f"{root}/data.json"))
            manifest = json.loads(archive.read(f"{root}/manifest.json"))
            names = set(archive.namelist())
            self.assertEqual(data["schema_version"], 1)
            self.assertEqual(data["preferences"]["primary_focus"], "running")
            self.assertEqual(len(data["checkins"]), 1)
            self.assertEqual(data["running"]["runs"][0]["raw_metadata"], {"device": "watch", "splits": [300]})
            self.assertEqual(data["running"]["import_batches"][0]["errors"], [{"line": 4, "message": "ignored"}])
            self.assertEqual(data["running"]["import_batches"][0]["uploaded_file_name"], "source.tcx")
            self.assertEqual(data["running"]["import_batches"][0]["original_filename"], "morning.tcx")
            self.assertEqual(len(data["gym"]["exercise_references"]), 1)
            self.assertEqual(len(data["gym"]["sessions"]), 1)
            self.assertEqual(len(data["gym"]["sets"]), 1)
            self.assertEqual(len(data["gym"]["workout_templates"]), 1)
            self.assertIsNotNone(data["gym"]["active_workout"])
            self.assertEqual(len(data["climbing"]["sessions"]), 1)
            self.assertEqual(len(data["climbing"]["attempts"]), 1)
            self.assertEqual(len(data["climbing"]["projects"]), 1)
            exercise_names = {row["name"] for row in data["gym"]["exercises"]}
            self.assertIn("Pull-up", exercise_names)
            self.assertNotIn("Unrelated global exercise", exercise_names)
            self.assertNotIn("Other exercise", exercise_names)
            rendered = json.dumps({"data": data, "manifest": manifest})
            self.assertNotIn(self.user.password, rendered)
            self.assertNotIn(r"C:\Users\private", rendered)
            self.assertNotIn("Other data", rendered)
            self.assertEqual(manifest["validation"], "ok")
            self.assertEqual(manifest["datasets"]["gym.sets"], 1)
            self.assertEqual(manifest["datasets"]["climbing.projects"], 1)
            self.assertIn(f"{root}/csv/gym_sets.csv", names)
            self.assertIn(f"{root}/csv/climbing_attempts.csv", names)
            with archive.open(f"{root}/csv/gym_sets.csv") as handle:
                rows = list(csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8")))
            self.assertEqual(rows[0]["exercise_name"], "Pull-up")
            self.assertEqual(rows[0]["weight"], "")
            with archive.open(f"{root}/csv/runs.csv") as handle:
                run_rows = list(csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8")))
            self.assertEqual(json.loads(run_rows[0]["raw_metadata"]), {"device": "watch", "splits": [300]})

    def test_relationship_source_ids_resolve_and_nullable_relations_remain_null(self):
        data, _, _, _ = self.read_export()
        gym = data["gym"]
        exercise_ids = {row["source_id"] for row in gym["exercises"]}
        session_ids = {row["source_id"] for row in gym["sessions"]}
        template_ids = {row["source_id"] for row in gym["workout_templates"]}
        self.assertTrue(all(row["exercise_source_id"] in exercise_ids and row["session_source_id"] in session_ids for row in gym["sets"]))
        self.assertTrue(all(row["exercise_source_id"] in exercise_ids and row["template_source_id"] in template_ids for row in gym["workout_template_items"]))
        no_project = ClimbAttempt.objects.create(session=self.climbing_session, project=None, grade_system="v_scale", grade="V2", result="fail")
        data, _, _, _ = self.read_export()
        exported = next(row for row in data["climbing"]["attempts"] if row["source_id"] == no_project.pk)
        self.assertIsNone(exported["project_source_id"])

    def test_active_workout_shared_exercise_is_exported_and_resolves(self):
        muscle = MuscleGroup.objects.get(name="Chest")
        active_only_shared = Exercise.objects.create(user=None, name="Active-only shared exercise", primary_muscle_group=muscle, is_custom=False)
        self.active_workout.logged_sets = [{"exercise": str(active_only_shared.pk), "set": 1, "reps": 10}]
        self.active_workout.save(update_fields=["logged_sets"])

        data, _, _, _ = self.read_export()
        exercise_ids = {row["source_id"] for row in data["gym"]["exercises"]}
        self.assertIn(active_only_shared.pk, exercise_ids)
        self.assertEqual(data["gym"]["active_workout"]["logged_sets"][0]["exercise"], str(active_only_shared.pk))

    def test_cross_user_active_logged_set_fails_without_export(self):
        other_exercise = Exercise.objects.get(user=self.other)
        self.active_workout.logged_sets = [{"exercise": other_exercise.pk, "set": 1, "reps": 1}]
        self.active_workout.save(update_fields=["logged_sets"])

        with self.assertRaisesMessage(CommandError, "private data"):
            self.export()
        self.assertEqual(list(self.output.glob("*.zip")), [])

    def test_malformed_active_logged_set_fails_without_export(self):
        self.active_workout.logged_sets = ["not an object"]
        self.active_workout.save(update_fields=["logged_sets"])
        with self.assertRaisesMessage(CommandError, "must be an object"):
            self.export()
        self.assertEqual(list(self.output.glob("*.zip")), [])

        self.active_workout.logged_sets = [{"exercise": "not-an-id", "set": 1, "reps": 1}]
        self.active_workout.save(update_fields=["logged_sets"])
        with self.assertRaisesMessage(CommandError, "invalid exercise ID"):
            self.export()
        self.assertEqual(list(self.output.glob("*.zip")), [])

    def test_colliding_export_uses_suffix_without_overwrite(self):
        with patch("users.management.commands.export_trainos_data.timezone.localtime", return_value=timezone.now()):
            first = self.export()
            original = first.read_bytes()
            second = self.export()
        self.assertNotEqual(first, second)
        self.assertTrue(second.stem.endswith("_2"))
        self.assertEqual(first.read_bytes(), original)

    def test_cross_user_private_exercise_reference_fails_and_previous_export_survives(self):
        valid = self.export()
        other_exercise = Exercise.objects.get(user=self.other)
        GymSet.objects.create(session=self.gym_session, exercise=other_exercise, set_number=99, reps=1)
        with self.assertRaisesMessage(CommandError, "private data"):
            self.export()
        self.assertTrue(valid.exists())
        self.assertEqual(len(list(self.output.glob("*.zip"))), 1)

    def test_cross_user_climbing_project_fails(self):
        other_project = ClimbingProject.objects.create(user=self.other, name="Other project", grade="V6", grade_system="v_scale")
        ClimbAttempt.objects.create(session=self.climbing_session, project=other_project, grade_system="v_scale", grade="V6", result="fail")
        with self.assertRaisesMessage(CommandError, "private data"):
            self.export()
        self.assertEqual(list(self.output.glob("*.zip")), [])

    def test_write_failure_leaves_no_final_package(self):
        with patch("users.management.commands.export_trainos_data._write_csvs", side_effect=OSError("test write failure")):
            with self.assertRaisesMessage(CommandError, "Export generation failed"):
                self.export()
        self.assertEqual(list(self.output.glob("*.zip")), [])
        self.assertEqual(list(self.output.glob(".trainos-export-*")), [])
