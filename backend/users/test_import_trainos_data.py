import json
import tempfile
import zipfile
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from types import SimpleNamespace
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


class PortableImportTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.source = User.objects.create_user(username="portable-source", password="secret")
        self.target = User.objects.create_user(username="portable-target", password="secret")
        self.temp = tempfile.TemporaryDirectory()
        self.output = Path(self.temp.name)
        self.muscle = MuscleGroup.objects.create(name="Portable chest")
        self._source_data()
        self.archive = Path(call_command("export_trainos_data", user=self.source.username, output_dir=str(self.output)))

    def tearDown(self):
        self.temp.cleanup()

    def _source_data(self):
        TrainingPreferences.objects.create(user=self.source, primary_focus="gym")
        DailyCheckIn.objects.create(user=self.source, date=date(2026, 1, 2), energy=8)
        private = Exercise.objects.create(user=self.source, name="Portable bench", primary_muscle_group=self.muscle, movement_pattern="push", equipment="barbell", is_custom=False)
        self.shared = Exercise.objects.create(user=None, name="Portable pull-up", primary_muscle_group=self.muscle, movement_pattern="pull", equipment="bodyweight", is_custom=False)
        ExerciseReference.objects.create(user=self.source, exercise=private, url="https://example.test/form", source="website")
        batch = ImportBatch.objects.create(user=self.source, original_filename="run.tcx", uploaded_file="imports/running/run.tcx", status="completed")
        RunActivity.objects.create(user=self.source, title="Portable run", started_at=timezone.now(), distance_km=5, duration_seconds=1500, import_batch=batch)
        session = GymSession.objects.create(user=self.source, date=date(2026, 1, 3), split_type="push")
        GymSet.objects.create(session=session, exercise=self.shared, set_number=1, reps=8)
        template = WorkoutTemplate.objects.create(user=self.source, name="Portable template", split_type="push")
        WorkoutTemplateExercise.objects.create(template=template, exercise=private, order=1, target_sets=3)
        ActiveWorkout.objects.create(user=self.source, template=template, logged_sets=[{"exercise": private.pk, "set": 1, "reps": 8}])
        project = ClimbingProject.objects.create(user=self.source, name="Portable project", grade="V3", grade_system="v_scale")
        climb = ClimbingSession.objects.create(user=self.source, date=date(2026, 1, 4), session_type="bouldering")
        ClimbAttempt.objects.create(session=climb, project=project, grade_system="v_scale", grade="V3", result="project")

    def _import(self, *, apply=False, archive=None):
        args = {"file": str(archive or self.archive), "user": self.target.username}
        if apply: args["apply"] = True
        return call_command("import_trainos_data", **args)

    def _backup(self):
        @contextmanager
        def mocked_backup():
            with patch("users.management.commands.import_trainos_data.create_sqlite_backup", return_value=SimpleNamespace(directory=Path("safe-backup"))) as backup, patch("users.management.commands.import_trainos_data.resolve_sqlite_database_path", return_value=Path("test.sqlite3")):
                yield backup
        return mocked_backup()

    def _mutated_archive(self, mutate):
        with zipfile.ZipFile(self.archive) as original:
            contents = {name: original.read(name) for name in original.namelist()}
        root = self.archive.stem
        manifest, data = json.loads(contents[f"{root}/manifest.json"]), json.loads(contents[f"{root}/data.json"])
        mutate(manifest, data)
        contents[f"{root}/manifest.json"] = json.dumps(manifest).encode()
        contents[f"{root}/data.json"] = json.dumps(data).encode()
        path = self.output / f"changed-{len(list(self.output.glob('changed-*.zip')))}.zip"
        with zipfile.ZipFile(path, "w") as archive:
            for name, value in contents.items(): archive.writestr(name, value)
        return path

    def test_dry_run_is_zero_write_and_source_username_need_not_match(self):
        self._import()
        self.assertFalse(DailyCheckIn.objects.filter(user=self.target).exists())
        self.assertFalse(TrainingPreferences.objects.filter(user=self.target).exists())
        self.assertFalse(Exercise.objects.filter(user=self.target).exists())

    def test_apply_round_trip_remaps_relationships_and_preserves_timestamps(self):
        source_run = RunActivity.objects.get(user=self.source)
        with self._backup() as backup:
            self._import(apply=True)
        backup.assert_called_once()
        self.assertEqual(DailyCheckIn.objects.filter(user=self.target).count(), 1)
        self.assertEqual(RunActivity.objects.filter(user=self.target).count(), 1)
        self.assertEqual(ImportBatch.objects.filter(user=self.target, uploaded_file="").count(), 1)
        target_run = RunActivity.objects.get(user=self.target)
        self.assertNotEqual(target_run.pk, source_run.pk)
        self.assertEqual(target_run.import_batch.user_id, self.target.pk)
        self.assertEqual(ExerciseReference.objects.get(user=self.target).exercise.user_id, self.target.pk)
        self.assertEqual(GymSet.objects.get(session__user=self.target).exercise_id, self.shared.pk)
        active = ActiveWorkout.objects.get(user=self.target)
        self.assertEqual(active.template.user_id, self.target.pk)
        self.assertNotEqual(active.logged_sets[0]["exercise"], Exercise.objects.get(user=self.source).pk)
        self.assertTrue(Exercise.objects.filter(pk=active.logged_sets[0]["exercise"], user=self.target).exists())
        self.assertEqual(ClimbAttempt.objects.get(session__user=self.target).project.user_id, self.target.pk)
        self.assertEqual(target_run.created_at, source_run.created_at)

    def test_nonempty_target_blocks_apply_and_second_apply(self):
        DailyCheckIn.objects.create(user=self.target, date=date(2026, 2, 1))
        with self.assertRaisesMessage(CommandError, "not empty"):
            self._import(apply=True)
        DailyCheckIn.objects.filter(user=self.target).delete()
        with self._backup(): self._import(apply=True)
        with self.assertRaisesMessage(CommandError, "not empty"):
            self._import(apply=True)

    def test_package_validation_rejects_schema_counts_ids_relationships_and_dates(self):
        cases = (
            (lambda manifest, data: manifest.update(format="wrong"), "format"),
            (lambda manifest, data: manifest.update(schema_version=99), "Unsupported"),
            (lambda manifest, data: manifest["datasets"].update({"checkins": 99}), "count mismatch"),
            (lambda manifest, data: data["gym"]["sets"][0].update(exercise_source_id=99999), "Broken relationship"),
            (lambda manifest, data: data["checkins"][0].update(date="no-date"), "ISO date"),
        )
        for mutate, message in cases:
            with self.subTest(message=message):
                with self.assertRaisesMessage(CommandError, message): self._import(archive=self._mutated_archive(mutate))
        def duplicate(manifest, data):
            data["checkins"].append(data["checkins"][0].copy())
            manifest["datasets"]["checkins"] = 2
        with self.assertRaisesMessage(CommandError, "duplicate"):
            self._import(archive=self._mutated_archive(duplicate))

    def test_missing_corrupt_and_malformed_active_workout_fail(self):
        with self.assertRaisesMessage(CommandError, "does not exist"):
            self._import(archive=self.output / "missing.zip")
        corrupt = self.output / "broken.zip"; corrupt.write_bytes(b"not a zip")
        with self.assertRaisesMessage(CommandError, "Invalid portable export ZIP"):
            self._import(archive=corrupt)
        archive = self._mutated_archive(lambda manifest, data: data["gym"]["active_workout"].update(logged_sets=[{"exercise": "bad"}]))
        with self.assertRaisesMessage(CommandError, "positive integer"):
            self._import(archive=archive)

    def test_missing_canonical_members_and_preferences_exception(self):
        missing_manifest = self.output / "missing-manifest.zip"
        with zipfile.ZipFile(self.archive) as original, zipfile.ZipFile(missing_manifest, "w") as changed:
            for name in original.namelist():
                if not name.endswith("manifest.json"): changed.writestr(name, original.read(name))
        with self.assertRaisesMessage(CommandError, "manifest.json"):
            self._import(archive=missing_manifest)

        TrainingPreferences.objects.create(user=self.target, primary_focus="running")
        with self._backup(): self._import(apply=True)
        self.assertEqual(TrainingPreferences.objects.get(user=self.target).primary_focus, "gym")

        target = get_user_model().objects.create_user(username="null-preferences-target", password="secret")
        TrainingPreferences.objects.create(user=target)
        def no_preferences(manifest, data):
            data["preferences"] = None; manifest["datasets"]["preferences"] = 0
        with self._backup(): call_command("import_trainos_data", file=str(self._mutated_archive(no_preferences)), user=target.username, apply=True)
        self.assertFalse(TrainingPreferences.objects.filter(user=target).exists())

    def test_shared_exercise_copy_missing_muscle_and_ambiguous_match(self):
        GymSet.objects.filter(exercise=self.shared).delete()
        Exercise.objects.filter(pk=self.shared.pk).delete()
        with self._backup(): self._import(apply=True)
        copied = Exercise.objects.get(user=self.target, name="Portable pull-up")
        self.assertTrue(copied.is_custom)
        self.assertFalse(Exercise.objects.get(user=self.target, name="Portable bench").is_custom)

        target = get_user_model().objects.create_user(username="muscle-target", password="secret")
        archive = self._mutated_archive(lambda manifest, data: data["gym"]["exercises"][0].update(primary_muscle_group="missing"))
        with self.assertRaisesMessage(CommandError, "muscle group"):
            call_command("import_trainos_data", file=str(archive), user=target.username)

    def test_active_workout_reps_must_be_positive_in_preflight(self):
        cases = (None, 0, -1, True, 8.5)
        for reps in cases:
            with self.subTest(reps=reps):
                def invalid_reps(manifest, data):
                    item = {"exercise": data["gym"]["active_workout"]["logged_sets"][0]["exercise"]}
                    if reps is not None: item["reps"] = reps
                    data["gym"]["active_workout"]["logged_sets"] = [item]
                with patch("users.management.commands.import_trainos_data.create_sqlite_backup") as backup:
                    with self.assertRaisesMessage(CommandError, "positive integer"):
                        self._import(archive=self._mutated_archive(invalid_reps))
                backup.assert_not_called()
                self.assertFalse(Exercise.objects.filter(user=self.target).exists())

    def test_backup_failure_and_mid_import_failure_leave_target_empty(self):
        with patch("users.management.commands.import_trainos_data.resolve_sqlite_database_path", return_value=Path("test.sqlite3")), patch("users.management.commands.import_trainos_data.create_sqlite_backup", side_effect=CommandError("backup failed")):
            with self.assertRaisesMessage(CommandError, "backup failed"): self._import(apply=True)
        self.assertFalse(DailyCheckIn.objects.filter(user=self.target).exists())
        with self._backup(), patch.object(__import__("users.management.commands.import_trainos_data", fromlist=["Restorer"]).Restorer, "_runs", side_effect=RuntimeError("injected")):
            with self.assertRaises(RuntimeError): self._import(apply=True)
        self.assertFalse(DailyCheckIn.objects.filter(user=self.target).exists())
        self.assertFalse(Exercise.objects.filter(user=self.target).exists())
