from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from gym.models import ActiveWorkout, Exercise, ExerciseReference, GymSession, GymSet, MuscleGroup, WorkoutTemplate, WorkoutTemplateExercise


class GymAnalyticsAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="lifter", password="password")
        self.other_user = get_user_model().objects.create_user(username="other-lifter", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.back = MuscleGroup.objects.get(name="Back")
        self.biceps = MuscleGroup.objects.get(name="Biceps")
        self.chest = MuscleGroup.objects.get(name="Chest")
        self.quads = MuscleGroup.objects.get(name="Quads")

    def test_no_data_response(self):
        response = self.client.get("/api/gym/analytics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["total_sessions"], 0)
        self.assertEqual(response.data["summary"]["total_sets"], 0)
        self.assertEqual(response.data["summary"]["total_exercises_used"], 0)
        self.assertEqual(len(response.data["weekly_session_trend"]), 8)
        self.assertEqual(response.data["muscle_coverage_this_week"][0]["total_set_count"], 0)
        self.assertIn("No muscle groups", " ".join(response.data["deterministic_insights"]))

    def test_analytics_with_sessions_sets_coverage_and_split_distribution(self):
        pull_up = Exercise.objects.create(
            user=self.user,
            name="Pull-up",
            primary_muscle_group=self.back,
            movement_pattern=Exercise.MovementPattern.PULL,
            equipment=Exercise.Equipment.BODYWEIGHT,
        )
        pull_up.secondary_muscle_groups.add(self.biceps)
        bench = Exercise.objects.create(
            user=self.user,
            name="Bench Press",
            primary_muscle_group=self.chest,
            movement_pattern=Exercise.MovementPattern.PUSH,
            equipment=Exercise.Equipment.BARBELL,
        )
        squat = Exercise.objects.create(
            user=self.other_user,
            name="Other Squat",
            primary_muscle_group=self.quads,
            movement_pattern=Exercise.MovementPattern.SQUAT,
            equipment=Exercise.Equipment.BARBELL,
        )

        today = timezone.localdate()
        pull_session = GymSession.objects.create(user=self.user, date=today, split_type=GymSession.SplitType.PULL, duration_minutes=60)
        push_session = GymSession.objects.create(user=self.user, date=today - timedelta(days=14), split_type=GymSession.SplitType.PUSH, duration_minutes=50)
        other_session = GymSession.objects.create(user=self.other_user, date=today, split_type=GymSession.SplitType.LEGS)
        for index in range(1, 4):
            GymSet.objects.create(session=pull_session, exercise=pull_up, set_number=index, weight=0, reps=8)
        GymSet.objects.create(session=push_session, exercise=bench, set_number=1, weight=100, reps=5)
        GymSet.objects.create(session=push_session, exercise=bench, set_number=2, weight=90, reps=8)
        GymSet.objects.create(session=other_session, exercise=squat, set_number=1, weight=120, reps=5)

        response = self.client.get("/api/gym/analytics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["total_sessions"], 2)
        self.assertEqual(response.data["summary"]["total_sets"], 5)
        self.assertEqual(response.data["summary"]["total_exercises_used"], 2)
        self.assertEqual(response.data["summary"]["sessions_this_week"], 1)
        self.assertEqual(response.data["summary"]["sets_this_week"], 3)

        coverage = {item["muscle_group_name"]: item for item in response.data["muscle_coverage_this_week"]}
        self.assertEqual(coverage["Back"]["primary_set_count"], 3)
        self.assertEqual(coverage["Biceps"]["secondary_set_count"], 3)
        self.assertEqual(coverage["Quads"]["total_set_count"], 0)

        splits = {item["split_type"]: item["session_count"] for item in response.data["split_distribution_this_month"]}
        self.assertEqual(splits["pull"], 1)
        self.assertGreaterEqual(len(response.data["weekly_session_trend"]), 8)
        self.assertEqual(response.data["top_exercises_by_sets"][0]["exercise_name"], "Pull-up")
        self.assertEqual(response.data["top_exercises_by_volume"][0]["exercise_name"], "Bench Press")
        self.assertEqual(response.data["top_exercises_by_volume"][0]["volume"], 1220)
        self.assertIn("Back is your most trained muscle group this week.", response.data["deterministic_insights"])


class ExerciseReferenceAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="reference-owner", password="password")
        self.other_user = get_user_model().objects.create_user(username="reference-other", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.back = MuscleGroup.objects.get(name="Back")
        self.exercise = Exercise.objects.create(
            user=self.user,
            name="Pull-up",
            primary_muscle_group=self.back,
            movement_pattern=Exercise.MovementPattern.PULL,
            equipment=Exercise.Equipment.BODYWEIGHT,
        )

    def test_create_update_and_delete_reference(self):
        create_response = self.client.post(
            f"/api/gym/exercises/{self.exercise.id}/references/",
            {
                "url": "https://www.youtube.com/watch?v=form",
                "source": ExerciseReference.Source.YOUTUBE,
                "title": "Pull-up form",
                "notes": "Keep ribs down.",
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, 201)
        reference_id = create_response.data["id"]
        reference = ExerciseReference.objects.get(id=reference_id)
        self.assertEqual(reference.user, self.user)

        patch_response = self.client.patch(
            f"/api/gym/references/{reference_id}/",
            {"title": "Strict pull-up form", "notes": "Start from a dead hang."},
            format="json",
        )

        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data["title"], "Strict pull-up form")

        delete_response = self.client.delete(f"/api/gym/references/{reference_id}/")

        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(ExerciseReference.objects.filter(id=reference_id).exists())

    def test_reference_visibility_is_scoped_for_global_exercises(self):
        global_exercise = Exercise.objects.create(
            user=None,
            name="Global Row",
            primary_muscle_group=self.back,
            movement_pattern=Exercise.MovementPattern.PULL,
            equipment=Exercise.Equipment.CABLE,
        )
        response = self.client.post(
            f"/api/gym/exercises/{global_exercise.id}/references/",
            {
                "url": "https://www.instagram.com/reel/example/",
                "source": ExerciseReference.Source.INSTAGRAM,
                "title": "Row cue",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        reference_id = response.data["id"]

        owner_list = self.client.get("/api/gym/exercises/")
        owner_item = next(item for item in owner_list.data if item["id"] == global_exercise.id)
        self.assertEqual(owner_item["reference_count"], 1)

        other_client = APIClient()
        other_client.force_authenticate(self.other_user)
        other_list = other_client.get("/api/gym/exercises/")
        other_item = next(item for item in other_list.data if item["id"] == global_exercise.id)
        self.assertEqual(other_item["reference_count"], 0)

        other_patch = other_client.patch(
            f"/api/gym/references/{reference_id}/",
            {"title": "Should not update"},
            format="json",
        )
        self.assertEqual(other_patch.status_code, 404)


class ExerciseArchiveAndEditingAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="archive-owner", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.back = MuscleGroup.objects.get(name="Back")
        self.chest = MuscleGroup.objects.get(name="Chest")
        self.biceps = MuscleGroup.objects.get(name="Biceps")
        self.exercise = Exercise.objects.create(
            user=self.user,
            name="Pull-up",
            primary_muscle_group=self.back,
            movement_pattern=Exercise.MovementPattern.PULL,
            equipment=Exercise.Equipment.BODYWEIGHT,
        )

    def test_exercise_edit_updates_metadata(self):
        response = self.client.patch(
            f"/api/gym/exercises/{self.exercise.id}/",
            {
                "name": "Strict Pull-up",
                "primary_muscle_group": self.back.id,
                "secondary_muscle_groups": [self.biceps.id],
                "movement_pattern": Exercise.MovementPattern.PULL,
                "equipment": Exercise.Equipment.BODYWEIGHT,
                "form_notes": "Start from a dead hang.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.exercise.refresh_from_db()
        self.assertEqual(self.exercise.name, "Strict Pull-up")
        self.assertEqual(response.data["secondary_muscle_group_names"], ["Biceps"])
        self.assertEqual(response.data["form_notes"], "Start from a dead hang.")

    def test_delete_archives_exercise_hides_from_active_list_and_restore_works(self):
        session = GymSession.objects.create(user=self.user, date=timezone.localdate(), split_type=GymSession.SplitType.PULL)
        GymSet.objects.create(session=session, exercise=self.exercise, set_number=1, weight=0, reps=8)
        ExerciseReference.objects.create(user=self.user, exercise=self.exercise, url="https://youtu.be/example", source=ExerciseReference.Source.YOUTUBE)

        delete_response = self.client.delete(f"/api/gym/exercises/{self.exercise.id}/")

        self.assertEqual(delete_response.status_code, 200)
        self.exercise.refresh_from_db()
        self.assertTrue(self.exercise.is_archived)
        self.assertIsNotNone(self.exercise.archived_at)

        active_list = self.client.get("/api/gym/exercises/")
        self.assertFalse(any(item["id"] == self.exercise.id for item in active_list.data))

        archived_list = self.client.get("/api/gym/exercises/?include_archived=true")
        self.assertTrue(any(item["id"] == self.exercise.id for item in archived_list.data))

        session_response = self.client.get(f"/api/gym/sessions/{session.id}/")
        self.assertEqual(session_response.status_code, 200)
        self.assertEqual(session_response.data["exercise_names"], ["Pull-up"])

        restore_response = self.client.post(f"/api/gym/exercises/{self.exercise.id}/restore/")
        self.assertEqual(restore_response.status_code, 200)
        self.exercise.refresh_from_db()
        self.assertFalse(self.exercise.is_archived)
        self.assertIsNone(self.exercise.archived_at)

    def test_last_performed_summary_fields(self):
        session = GymSession.objects.create(user=self.user, date=timezone.localdate(), split_type=GymSession.SplitType.PULL)
        GymSet.objects.create(session=session, exercise=self.exercise, set_number=1, weight=0, reps=6)
        GymSet.objects.create(session=session, exercise=self.exercise, set_number=2, weight=0, reps=9)

        response = self.client.get(f"/api/gym/exercises/{self.exercise.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["last_session_id"], session.id)
        self.assertEqual(response.data["last_session_set_count"], 2)
        self.assertEqual(response.data["last_session_best_reps"], 9)
        self.assertIsNone(response.data["last_session_best_weight"])
        self.assertIn("best 9 reps", response.data["last_session_summary_label"])


class GymSessionEditingAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="session-editor", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.back = MuscleGroup.objects.get(name="Back")
        self.chest = MuscleGroup.objects.get(name="Chest")
        self.pull_up = Exercise.objects.create(user=self.user, name="Pull-up", primary_muscle_group=self.back)
        self.bench = Exercise.objects.create(user=self.user, name="Bench Press", primary_muscle_group=self.chest)
        self.session = GymSession.objects.create(user=self.user, date=timezone.localdate(), split_type=GymSession.SplitType.PULL)
        GymSet.objects.create(session=self.session, exercise=self.pull_up, set_number=1, weight=0, reps=8)
        GymSet.objects.create(session=self.session, exercise=self.pull_up, set_number=2, weight=0, reps=7)
        GymSet.objects.create(session=self.session, exercise=self.bench, set_number=3, weight=60, reps=8)

    def test_session_update_removes_set_and_renumbers_sequentially(self):
        response = self.client.patch(
            f"/api/gym/sessions/{self.session.id}/",
            {
                "date": self.session.date.isoformat(),
                "split_type": GymSession.SplitType.UPPER,
                "duration_minutes": 55,
                "notes": "Edited session",
                "sets": [
                    {
                        "exercise": self.pull_up.id,
                        "set_number": 99,
                        "weight": 0,
                        "reps": 8,
                        "rpe": 8,
                        "notes": "Kept first set",
                    },
                    {
                        "exercise": self.bench.id,
                        "set_number": 42,
                        "weight": 62.5,
                        "reps": 6,
                        "rpe": 8,
                        "notes": "Added weight",
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.split_type, GymSession.SplitType.UPPER)
        sets = list(self.session.sets.order_by("set_number"))
        self.assertEqual(len(sets), 2)
        self.assertEqual([gym_set.set_number for gym_set in sets], [1, 2])
        self.assertEqual(sets[1].weight, 62.5)

    def test_archived_exercise_is_not_valid_for_new_session_selection(self):
        self.pull_up.archive()

        response = self.client.post(
            "/api/gym/sessions/",
            {
                "date": timezone.localdate().isoformat(),
                "split_type": GymSession.SplitType.PULL,
                "sets": [{"exercise": self.pull_up.id, "set_number": 1, "weight": 0, "reps": 8}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)


class WorkoutTemplateAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="template-owner", password="password")
        self.other_user = get_user_model().objects.create_user(username="template-other", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.back = MuscleGroup.objects.get(name="Back")
        self.chest = MuscleGroup.objects.get(name="Chest")
        self.pull_up = Exercise.objects.create(
            user=self.user,
            name="Pull-up",
            primary_muscle_group=self.back,
            movement_pattern=Exercise.MovementPattern.PULL,
            equipment=Exercise.Equipment.BODYWEIGHT,
        )
        self.row = Exercise.objects.create(
            user=self.user,
            name="Barbell Row",
            primary_muscle_group=self.back,
            movement_pattern=Exercise.MovementPattern.PULL,
            equipment=Exercise.Equipment.BARBELL,
        )
        self.other_exercise = Exercise.objects.create(user=self.other_user, name="Other Bench", primary_muscle_group=self.chest)

    def test_create_edit_archive_and_order_renumbering(self):
        response = self.client.post(
            "/api/gym/templates/",
            {
                "name": "Pull Day",
                "split_type": GymSession.SplitType.PULL,
                "notes": "Back and biceps.",
                "items": [
                    {"exercise": self.pull_up.id, "order": 9, "target_sets": 3, "target_reps_low": 6, "target_reps_high": 8},
                    {"exercise": self.row.id, "order": 2, "target_sets": 4, "target_reps_low": 8, "target_reps_high": 10},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        template_id = response.data["id"]
        self.assertEqual([item["order"] for item in response.data["items"]], [1, 2])
        self.assertEqual(response.data["exercise_count"], 2)
        self.assertEqual(response.data["target_set_count"], 7)

        patch_response = self.client.patch(
            f"/api/gym/templates/{template_id}/",
            {
                "name": "Pull Day Edited",
                "items": [
                    {"exercise": self.row.id, "order": 5, "target_sets": 2, "target_reps_low": 8, "target_reps_high": 12},
                ],
            },
            format="json",
        )

        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(len(patch_response.data["items"]), 1)
        self.assertEqual(patch_response.data["items"][0]["order"], 1)
        self.assertEqual(patch_response.data["items"][0]["exercise"], self.row.id)

        delete_response = self.client.delete(f"/api/gym/templates/{template_id}/")
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(WorkoutTemplate.objects.get(id=template_id).is_archived)

        active_list = self.client.get("/api/gym/templates/")
        self.assertFalse(any(item["id"] == template_id for item in active_list.data))

        restore_response = self.client.post(f"/api/gym/templates/{template_id}/restore/")
        self.assertEqual(restore_response.status_code, 200)
        self.assertFalse(WorkoutTemplate.objects.get(id=template_id).is_archived)

    def test_archived_and_inaccessible_exercises_are_rejected(self):
        self.pull_up.archive()
        archived_response = self.client.post(
            "/api/gym/templates/",
            {
                "name": "Invalid Pull Day",
                "split_type": GymSession.SplitType.PULL,
                "items": [{"exercise": self.pull_up.id, "order": 1, "target_sets": 3}],
            },
            format="json",
        )
        self.assertEqual(archived_response.status_code, 400)

        inaccessible_response = self.client.post(
            "/api/gym/templates/",
            {
                "name": "Invalid Other Day",
                "split_type": GymSession.SplitType.CUSTOM,
                "items": [{"exercise": self.other_exercise.id, "order": 1, "target_sets": 3}],
            },
            format="json",
        )
        self.assertEqual(inaccessible_response.status_code, 400)

    def test_template_user_scoping(self):
        template = WorkoutTemplate.objects.create(user=self.other_user, name="Other Template", split_type=GymSession.SplitType.PUSH)
        response = self.client.get(f"/api/gym/templates/{template.id}/")
        self.assertEqual(response.status_code, 404)


class ActiveWorkoutAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="active-owner", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.back = MuscleGroup.objects.get(name="Back")
        self.pull_up = Exercise.objects.create(user=self.user, name="Pull-up", primary_muscle_group=self.back, equipment=Exercise.Equipment.BODYWEIGHT)
        self.row = Exercise.objects.create(user=self.user, name="Barbell Row", primary_muscle_group=self.back, equipment=Exercise.Equipment.BARBELL)
        self.template = WorkoutTemplate.objects.create(user=self.user, name="Pull Day", split_type=GymSession.SplitType.PULL)
        WorkoutTemplateExercise.objects.create(template=self.template, exercise=self.pull_up, order=1, target_sets=2, target_reps_low=6, target_reps_high=8)
        WorkoutTemplateExercise.objects.create(template=self.template, exercise=self.row, order=2, target_sets=3, target_reps_low=8, target_reps_high=10)

    def test_get_active_workout_without_active_returns_json_null(self):
        response = self.client.get("/api/gym/active-workout/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.content, b"null")
        self.assertIsNone(response.json())

    def test_start_resume_update_and_block_second_active_workout(self):
        start_response = self.client.post(f"/api/gym/templates/{self.template.id}/start/")
        self.assertEqual(start_response.status_code, 201)
        self.assertEqual(start_response.data["template_summary"]["name"], "Pull Day")
        self.assertEqual(len(start_response.data["template_items"]), 2)

        second_start = self.client.post(f"/api/gym/templates/{self.template.id}/start/")
        self.assertEqual(second_start.status_code, 400)
        self.assertIn("already have an active workout", second_start.data["detail"])

        patch_response = self.client.patch(
            "/api/gym/active-workout/",
            {
                "current_exercise_index": 1,
                "current_set_index": 0,
                "logged_sets": [
                    {
                        "exercise": self.pull_up.id,
                        "template_item": self.template.items.first().id,
                        "set_number": 1,
                        "weight": 0,
                        "reps": 8,
                        "rpe": 8,
                        "notes": "Clean.",
                    }
                ],
                "notes": "In progress.",
            },
            format="json",
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(len(patch_response.data["logged_sets"]), 1)

        resume_response = self.client.get("/api/gym/active-workout/")
        self.assertEqual(resume_response.status_code, 200)
        self.assertEqual(resume_response.data["current_exercise_index"], 1)

    def test_complete_creates_session_sets_and_clears_active_workout(self):
        active = ActiveWorkout.objects.create(
            user=self.user,
            template=self.template,
            current_exercise_index=1,
            current_set_index=1,
            logged_sets=[
                {"exercise": self.pull_up.id, "template_item": self.template.items.first().id, "set_number": 1, "weight": 0, "reps": 8, "rpe": 8, "notes": ""},
                {"exercise": self.row.id, "template_item": self.template.items.last().id, "set_number": 1, "weight": 60, "reps": 8, "rpe": 8, "notes": ""},
            ],
            notes="Finished strong.",
        )

        response = self.client.post("/api/gym/active-workout/complete/")

        self.assertEqual(response.status_code, 201)
        self.assertFalse(ActiveWorkout.objects.filter(id=active.id).exists())
        session = GymSession.objects.get(id=response.data["id"])
        self.assertEqual(session.split_type, GymSession.SplitType.PULL)
        self.assertEqual(session.notes, "Finished strong.")
        self.assertEqual([gym_set.set_number for gym_set in session.sets.order_by("set_number")], [1, 2])
        self.assertEqual(session.sets.count(), 2)

    def test_cancel_clears_without_creating_session(self):
        ActiveWorkout.objects.create(user=self.user, template=self.template)

        response = self.client.delete("/api/gym/active-workout/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(ActiveWorkout.objects.filter(user=self.user).exists())
        self.assertEqual(GymSession.objects.filter(user=self.user).count(), 0)
