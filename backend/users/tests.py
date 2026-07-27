from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class TrainingPreferencesAPITests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="paolo", password="test-pass")
        self.other_user = user_model.objects.create_user(username="other", password="test-pass")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = "/api/preferences/training/"

    def test_get_creates_default_preferences(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["primary_focus"], "balanced")
        self.assertEqual(response.data["running_sessions_per_week"], 2)
        self.assertEqual(response.data["gym_sessions_per_week"], 2)
        self.assertEqual(response.data["climbing_sessions_per_week"], 1)
        self.assertEqual(response.data["climbing_target_bouldering_grade"], "V4")

    def test_patch_updates_weekly_targets(self):
        response = self.client.patch(
            self.url,
            {
                "primary_focus": "running",
                "running_sessions_per_week": 4,
                "running_weekly_distance_target_km": 32.5,
                "gym_sessions_per_week": 1,
                "climbing_sessions_per_week": 2,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["primary_focus"], "running")
        self.assertEqual(response.data["running_sessions_per_week"], 4)
        self.assertEqual(response.data["running_weekly_distance_target_km"], 32.5)
        self.assertEqual(response.data["gym_sessions_per_week"], 1)
        self.assertEqual(response.data["climbing_sessions_per_week"], 2)

    def test_endpoint_is_scoped_to_authenticated_user(self):
        self.client.get(self.url)

        other_client = APIClient()
        other_client.force_authenticate(self.other_user)
        other_response = other_client.patch(
            self.url,
            {"primary_focus": "climbing", "climbing_sessions_per_week": 3},
            format="json",
        )

        self.assertEqual(other_response.status_code, 200)
        self.assertEqual(other_response.data["primary_focus"], "climbing")

        response = self.client.get(self.url)
        self.assertEqual(response.data["primary_focus"], "balanced")
        self.assertEqual(response.data["climbing_sessions_per_week"], 1)

    def test_validation_rejects_unrealistic_targets(self):
        high_response = self.client.patch(self.url, {"running_sessions_per_week": 15}, format="json")
        negative_distance_response = self.client.patch(
            self.url,
            {"running_weekly_distance_target_km": -1},
            format="json",
        )

        self.assertEqual(high_response.status_code, 400)
        self.assertEqual(negative_distance_response.status_code, 400)
