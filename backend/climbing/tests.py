from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import ClimbAttempt, ClimbingChoices, ClimbingProject, ClimbingSession
from .services.analytics_service import parse_v_grade, parse_yds_grade


class ClimbingGradeParserTests(APITestCase):
    def test_v_grade_parser_handles_common_and_unknown_values(self):
        self.assertEqual(parse_v_grade("V0"), 0)
        self.assertEqual(parse_v_grade("v4"), 4)
        self.assertEqual(parse_v_grade("V10"), 10)
        self.assertIsNone(parse_v_grade("5.10a"))

    def test_yds_parser_handles_common_and_unknown_values(self):
        self.assertEqual(parse_yds_grade("5.6"), (5, 6, 0))
        self.assertEqual(parse_yds_grade("5.10a"), (5, 10, 1))
        self.assertEqual(parse_yds_grade("5.11d"), (5, 11, 4))
        self.assertIsNone(parse_yds_grade("V4"))


class ClimbingAnalyticsTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="paolo", password="test-pass")
        self.other_user = user_model.objects.create_user(username="other", password="test-pass")
        self.client.force_authenticate(self.user)
        self.url = reverse("climbing-analytics")
        self.today = timezone.localdate()

    def _session(self, *, user=None, session_type="bouldering", date=None, location="Local gym"):
        return ClimbingSession.objects.create(
            user=user or self.user,
            date=date or self.today,
            location=location,
            session_type=session_type,
            duration_minutes=90,
        )

    def _attempt(self, session, *, grade, result, attempts=1, grade_system="v_scale", style="overhang", project=None):
        return ClimbAttempt.objects.create(
            session=session,
            project=project,
            grade=grade,
            grade_system=grade_system,
            result=result,
            attempts=attempts,
            style=style,
        )

    def _project(self, *, user=None, name="Blue problem", status="active", started_at=None, sent_at=None, session_type="bouldering"):
        return ClimbingProject.objects.create(
            user=user or self.user,
            name=name,
            grade="V4" if session_type == "bouldering" else "5.10c",
            grade_system="v_scale" if session_type == "bouldering" else "yds",
            status=status,
            session_type=session_type,
            started_at=started_at,
            sent_at=sent_at,
        )

    def test_no_climbing_data_response(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["total_sessions"], 0)
        self.assertEqual(payload["summary"]["total_attempts"], 0)
        self.assertEqual(payload["summary"]["active_project_count"], 0)
        self.assertEqual(payload["bouldering"]["attempt_count"], 0)
        self.assertEqual(payload["top_rope"]["attempt_count"], 0)
        self.assertGreaterEqual(len(payload["session_type_distribution"]), 1)
        self.assertIn("No climbing sessions yet.", payload["deterministic_insights"])

    def test_bouldering_analytics_with_results_and_grades(self):
        session = self._session(session_type=ClimbingChoices.SessionType.BOULDERING)
        self._attempt(session, grade="V3", result=ClimbingChoices.Result.FLASH, attempts=1, style="technical")
        self._attempt(session, grade="V4", result=ClimbingChoices.Result.SEND, attempts=2, style="overhang")
        self._attempt(session, grade="V5", result=ClimbingChoices.Result.PROJECT, attempts=5, style="overhang")
        self._attempt(session, grade="V5", result=ClimbingChoices.Result.FAIL, attempts=3, style="powerful")

        payload = self.client.get(self.url).json()
        bouldering = payload["bouldering"]

        self.assertEqual(bouldering["session_count"], 1)
        self.assertEqual(bouldering["attempt_count"], 11)
        self.assertEqual(bouldering["flash_count"], 1)
        self.assertEqual(bouldering["send_count"], 1)
        self.assertEqual(bouldering["project_count"], 1)
        self.assertEqual(bouldering["fail_count"], 1)
        self.assertEqual(bouldering["highest_attempted_grade"], "V5")
        self.assertEqual(bouldering["highest_sent_grade"], "V4")
        self.assertEqual(bouldering["most_common_grade"], "V5")
        progression = payload["bouldering_progression"]
        self.assertEqual(progression["highest_attempted_grade"], "V5")
        self.assertEqual(progression["highest_sent_grade"], "V4")
        self.assertEqual(progression["recent_highest_attempted_grade"], "V5")
        self.assertEqual(progression["recent_highest_sent_grade"], "V4")
        self.assertIn("V4 target reached", progression["v4_gap_label"])
        by_grade = {item["grade"]: item for item in progression["send_rate_by_grade"]}
        self.assertEqual(by_grade["V4"]["success_count"], 1)
        self.assertEqual(by_grade["V4"]["success_rate"], 1.0)
        self.assertEqual(by_grade["V5"]["success_rate"], 0.0)

    def test_top_rope_analytics_with_results_and_grades(self):
        session = self._session(session_type=ClimbingChoices.SessionType.TOP_ROPE)
        self._attempt(session, grade="5.10a", grade_system="yds", result=ClimbingChoices.Result.CLEAN, attempts=1, style="vertical")
        self._attempt(session, grade="5.10c", grade_system="yds", result=ClimbingChoices.Result.TAKE, attempts=2, style="endurance")
        self._attempt(session, grade="5.10b", grade_system="yds", result=ClimbingChoices.Result.FALL, attempts=1, style="vertical")
        self._attempt(session, grade="5.9", grade_system="yds", result=ClimbingChoices.Result.COMPLETE, attempts=1, style="slab")

        payload = self.client.get(self.url).json()
        top_rope = payload["top_rope"]

        self.assertEqual(top_rope["session_count"], 1)
        self.assertEqual(top_rope["attempt_count"], 5)
        self.assertEqual(top_rope["clean_count"], 1)
        self.assertEqual(top_rope["take_count"], 1)
        self.assertEqual(top_rope["fall_count"], 1)
        self.assertEqual(top_rope["complete_count"], 1)
        self.assertEqual(top_rope["highest_attempted_grade"], "5.10c")
        self.assertEqual(top_rope["highest_clean_grade"], "5.10a")
        progression = payload["top_rope_progression"]
        self.assertEqual(progression["highest_attempted_grade"], "5.10c")
        self.assertEqual(progression["highest_clean_grade"], "5.10a")
        self.assertEqual(progression["recent_highest_clean_grade"], "5.10a")
        by_grade = {item["grade"]: item for item in progression["clean_rate_by_grade"]}
        self.assertEqual(by_grade["5.10a"]["success_count"], 1)
        self.assertEqual(by_grade["5.10c"]["success_rate"], 0.0)

    def test_session_type_and_style_distribution(self):
        boulder = self._session(session_type=ClimbingChoices.SessionType.BOULDERING)
        rope = self._session(session_type=ClimbingChoices.SessionType.TOP_ROPE)
        self._attempt(boulder, grade="V3", result=ClimbingChoices.Result.SEND, attempts=2, style="overhang")
        self._attempt(rope, grade="5.10a", grade_system="yds", result=ClimbingChoices.Result.CLEAN, attempts=1, style="vertical")

        payload = self.client.get(self.url).json()
        by_type = {item["session_type"]: item for item in payload["session_type_distribution"]}
        by_style = {item["style"]: item for item in payload["style_distribution"]}

        self.assertEqual(by_type["bouldering"]["session_count"], 1)
        self.assertEqual(by_type["bouldering"]["attempt_count"], 2)
        self.assertEqual(by_type["top_rope"]["session_count"], 1)
        self.assertEqual(by_type["top_rope"]["attempt_count"], 1)
        self.assertEqual(by_style["overhang"]["attempt_count"], 2)
        self.assertEqual(by_style["overhang"]["send_or_clean_count"], 1)
        self.assertEqual(by_style["vertical"]["send_or_clean_count"], 1)
        style_strengths = {item["style"]: item for item in payload["style_strengths"]}
        self.assertEqual(style_strengths["overhang"]["success_count"], 1)
        self.assertEqual(style_strengths["vertical"]["success_count"], 1)
        self.assertIn("insight_label", style_strengths["overhang"])
        self.assertEqual(len(payload["weekly_climbing_trend"]), 8)

    def test_project_status_counts_stale_recent_sent_and_user_scoping(self):
        self._project(name="Active old", status="active", started_at=self.today - timedelta(days=45))
        self._project(name="Paused route", status="paused")
        self._project(name="Abandoned route", status="abandoned")
        self._project(name="Sent route", status="sent", sent_at=self.today - timedelta(days=2), session_type="top_rope")
        self._project(user=self.other_user, name="Other active", status="active", started_at=self.today - timedelta(days=60))
        other_session = self._session(user=self.other_user, session_type="bouldering")
        self._attempt(other_session, grade="V9", result=ClimbingChoices.Result.SEND, attempts=1)

        payload = self.client.get(self.url).json()
        projects = payload["projects"]

        self.assertEqual(projects["active_count"], 1)
        self.assertEqual(projects["sent_count"], 1)
        self.assertEqual(projects["paused_count"], 1)
        self.assertEqual(projects["abandoned_count"], 1)
        self.assertEqual(projects["stale_projects"][0]["name"], "Active old")
        self.assertEqual(projects["recently_sent_projects"][0]["name"], "Sent route")
        self.assertEqual(payload["summary"]["total_sessions"], 0)
        self.assertEqual(len(payload["weekly_climbing_trend"]), 8)


class ClimbingProjectAttemptLinkTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="paolo-link", password="test-pass")
        self.other_user = user_model.objects.create_user(username="other-link", password="test-pass")
        self.client.force_authenticate(self.user)
        self.today = timezone.localdate()
        self.session_url = reverse("climbing-session-list")
        self.project_url = reverse("climbing-project-list")
        self.analytics_url = reverse("climbing-analytics")

    def _project(self, *, user=None, name="Blue overhang", session_type="bouldering", status="active", started_at=None):
        return ClimbingProject.objects.create(
            user=user or self.user,
            name=name,
            grade="V4" if session_type == "bouldering" else "5.10c",
            grade_system="v_scale" if session_type == "bouldering" else "yds",
            session_type=session_type,
            location="Local gym",
            status=status,
            started_at=started_at or self.today - timedelta(days=7),
        )

    def test_create_climbing_session_with_linked_project_attempt(self):
        project = self._project()

        response = self.client.post(
            self.session_url,
            {
                "date": self.today.isoformat(),
                "location": "Local gym",
                "session_type": "bouldering",
                "attempts": [
                    {
                        "project": project.id,
                        "grade": "V4",
                        "grade_system": "v_scale",
                        "result": "project",
                        "attempts": 4,
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        attempt = ClimbAttempt.objects.get()
        self.assertEqual(attempt.project, project)
        self.assertEqual(response.json()["attempts"][0]["project_name"], project.name)
        self.assertEqual(response.json()["attempts"][0]["project_status"], "active")

    def test_inaccessible_project_is_rejected(self):
        project = self._project(user=self.other_user, name="Other problem")

        response = self.client.post(
            self.session_url,
            {
                "date": self.today.isoformat(),
                "session_type": "bouldering",
                "attempts": [{"project": project.id, "result": "project", "attempts": 1}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(ClimbAttempt.objects.count(), 0)

    def test_linked_attempt_autofills_blank_fields_from_project(self):
        project = self._project(name="Red roof")

        response = self.client.post(
            self.session_url,
            {
                "date": self.today.isoformat(),
                "session_type": "bouldering",
                "attempts": [{"project": project.id, "result": "project", "attempts": 2}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        attempt = ClimbAttempt.objects.get()
        self.assertEqual(attempt.climb_name, "Red roof")
        self.assertEqual(attempt.grade, project.grade)
        self.assertEqual(attempt.grade_system, project.grade_system)

    def test_bouldering_send_updates_linked_project_to_sent(self):
        project = self._project()

        response = self.client.post(
            self.session_url,
            {
                "date": self.today.isoformat(),
                "session_type": "bouldering",
                "attempts": [{"project": project.id, "result": "send", "attempts": 1}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        project.refresh_from_db()
        self.assertEqual(project.status, ClimbingProject.Status.SENT)
        self.assertEqual(project.sent_at, self.today)

    def test_top_rope_clean_updates_linked_project_to_sent(self):
        project = self._project(name="Green route", session_type="top_rope")

        response = self.client.post(
            self.session_url,
            {
                "date": self.today.isoformat(),
                "session_type": "top_rope",
                "attempts": [{"project": project.id, "result": "clean", "attempts": 1}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        project.refresh_from_db()
        self.assertEqual(project.status, ClimbingProject.Status.SENT)
        self.assertEqual(project.sent_at, self.today)

    def test_project_serializer_summary_fields(self):
        project = self._project()
        session = ClimbingSession.objects.create(user=self.user, date=self.today, session_type="bouldering")
        ClimbAttempt.objects.create(
            session=session,
            project=project,
            climb_name=project.name,
            grade=project.grade,
            grade_system=project.grade_system,
            result="project",
            attempts=3,
        )

        response = self.client.get(self.project_url)

        self.assertEqual(response.status_code, 200)
        payload = response.json()[0]
        self.assertEqual(payload["linked_attempt_count"], 1)
        self.assertEqual(payload["linked_session_count"], 1)
        self.assertEqual(payload["latest_attempt_date"], self.today.isoformat())
        self.assertEqual(payload["latest_attempt_result"], "project")
        self.assertIn("1 linked attempt", payload["attempt_summary_label"])

    def test_analytics_includes_project_linked_counts_and_user_scoping(self):
        project = self._project()
        other_project = self._project(user=self.other_user, name="Other project")
        session = ClimbingSession.objects.create(user=self.user, date=self.today, session_type="bouldering")
        other_session = ClimbingSession.objects.create(user=self.other_user, date=self.today, session_type="bouldering")
        ClimbAttempt.objects.create(
            session=session,
            project=project,
            climb_name=project.name,
            grade=project.grade,
            grade_system=project.grade_system,
            result="project",
            attempts=3,
        )
        ClimbAttempt.objects.create(
            session=other_session,
            project=other_project,
            climb_name=other_project.name,
            grade=other_project.grade,
            grade_system=other_project.grade_system,
            result="project",
            attempts=9,
        )

        payload = self.client.get(self.analytics_url).json()
        totals = payload["projects"]["project_attempt_totals"]

        self.assertEqual(len(totals), 1)
        self.assertEqual(totals[0]["name"], project.name)
        self.assertEqual(totals[0]["linked_attempt_count"], 1)
        self.assertEqual(totals[0]["linked_session_count"], 1)

    def test_project_progress_and_stale_logic_use_linked_attempts(self):
        stale_project = self._project(name="Blue Overhang", started_at=self.today - timedelta(days=45))
        fresh_project = self._project(name="Fresh slab", started_at=self.today - timedelta(days=10))
        old_session = ClimbingSession.objects.create(
            user=self.user,
            date=self.today - timedelta(days=31),
            session_type="bouldering",
        )
        fresh_session = ClimbingSession.objects.create(
            user=self.user,
            date=self.today - timedelta(days=3),
            session_type="bouldering",
        )
        ClimbAttempt.objects.create(
            session=old_session,
            project=stale_project,
            climb_name=stale_project.name,
            grade=stale_project.grade,
            grade_system=stale_project.grade_system,
            result="project",
            attempts=5,
        )
        ClimbAttempt.objects.create(
            session=fresh_session,
            project=fresh_project,
            climb_name=fresh_project.name,
            grade=fresh_project.grade,
            grade_system=fresh_project.grade_system,
            result="send",
            attempts=1,
        )

        payload = self.client.get(self.analytics_url).json()
        project_progress = {item["name"]: item for item in payload["project_progress"]}
        stale_projects = {item["name"]: item for item in payload["projects"]["stale_projects"]}

        self.assertEqual(project_progress["Blue Overhang"]["total_attempts"], 1)
        self.assertEqual(project_progress["Blue Overhang"]["sessions_worked"], 1)
        self.assertEqual(project_progress["Blue Overhang"]["latest_result"], "project")
        self.assertIn("Untouched", project_progress["Blue Overhang"]["progress_label"])
        self.assertIn("Blue Overhang", stale_projects)
