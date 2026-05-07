from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from gym.models import Exercise, ExerciseReference, GymSession, GymSet, MuscleGroup


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
