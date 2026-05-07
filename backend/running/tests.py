import shutil
import tempfile
from datetime import timedelta
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from running.models import ImportBatch, RunActivity
from running.services.import_service import UNSUPPORTED_PHASE_3A_MESSAGE
from running.services.tcx_parser import parse_tcx


TESTDATA_DIR = Path(__file__).resolve().parent / "testdata"


class TCXParserTests(TestCase):
    def test_parser_extracts_namespaced_tcx_summary(self):
        with (TESTDATA_DIR / "sample_run.tcx").open("rb") as file_obj:
            parsed = parse_tcx(file_obj)

        self.assertEqual(parsed.source_activity_id, "2026-05-06T01:00:00Z")
        self.assertEqual(parsed.distance_km, 5.02)
        self.assertEqual(parsed.duration_seconds, 1830)
        self.assertEqual(parsed.avg_hr, 148)
        self.assertEqual(parsed.max_hr, 172)
        self.assertEqual(parsed.elevation_gain_m, 9.7)
        self.assertEqual(parsed.raw_metadata["sport"], "Running")
        self.assertEqual(parsed.raw_metadata["lap_count"], 2)
        self.assertEqual(parsed.raw_metadata["trackpoint_count"], 6)
        self.assertEqual(parsed.raw_metadata["calories"], 320)


class RunningImportAPITests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media_root, ALLOWED_HOSTS=["testserver"])
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.addCleanup(lambda: shutil.rmtree(self.media_root, ignore_errors=True))

        self.user = get_user_model().objects.create_user(
            username="runner",
            email="runner@example.com",
            password="password",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _sample_upload(self, filename="sample_run.tcx", content_type="application/vnd.garmin.tcx+xml"):
        content = (TESTDATA_DIR / "sample_run.tcx").read_bytes()
        return SimpleUploadedFile(filename, content, content_type=content_type)

    def test_import_endpoint_creates_run_activity(self):
        response = self.client.post(
            "/api/running/imports/",
            {"source": "garmin_export", "file": self._sample_upload()},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["batch"]["imported_count"], 1)
        self.assertEqual(response.data["created_run"]["distance_km"], 5.02)
        self.assertEqual(RunActivity.objects.filter(user=self.user).count(), 1)
        run = RunActivity.objects.get(user=self.user)
        self.assertEqual(run.source, "garmin_export")
        self.assertEqual(run.source_activity_id, "2026-05-06T01:00:00Z")
        self.assertEqual(run.import_batch.status, ImportBatch.Status.COMPLETED)

    def test_duplicate_import_skips_second_upload(self):
        for _ in range(2):
            response = self.client.post(
                "/api/running/imports/",
                {"source": "garmin_export", "file": self._sample_upload()},
                format="multipart",
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["batch"]["imported_count"], 0)
        self.assertEqual(response.data["batch"]["skipped_count"], 1)
        self.assertIsNone(response.data["created_run"])
        self.assertEqual(RunActivity.objects.filter(user=self.user).count(), 1)

    def test_unsupported_file_type_returns_clear_error(self):
        response = self.client.post(
            "/api/running/imports/",
            {"source": "garmin_export", "file": self._sample_upload(filename="sample_run.gpx", content_type="application/gpx+xml")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], UNSUPPORTED_PHASE_3A_MESSAGE)
        self.assertEqual(ImportBatch.objects.filter(user=self.user, status=ImportBatch.Status.FAILED).count(), 1)


class RunningAnalyticsAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="analytics-runner",
            email="analytics@example.com",
            password="password",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_no_runs_response(self):
        response = self.client.get("/api/running/analytics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["total_runs"], 0)
        self.assertEqual(response.data["summary"]["total_distance_km"], 0)
        self.assertEqual(response.data["summary"]["avg_pace_seconds_per_km"], None)
        self.assertEqual(response.data["summary"]["average_distance_km"], 0)
        self.assertEqual(response.data["summary"]["longest_run_distance_km"], 0)
        self.assertIsNone(response.data["summary"]["latest_run_date"])
        self.assertEqual(response.data["data_quality"]["confidence"], "low")
        self.assertEqual(len(response.data["weekly_distance_trend"]), 8)
        self.assertEqual(len(response.data["monthly_distance_trend"]), 6)
        self.assertEqual(response.data["consistency"]["consistency_label"], "No data")
        self.assertEqual(response.data["marathon_baseline"]["longest_distance_km"], 0)

    def test_one_imported_half_marathon_baseline(self):
        run = RunActivity.objects.create(
            user=self.user,
            title="Nat Geo Run",
            started_at=timezone.now() - timedelta(days=1),
            distance_km=21.01,
            duration_seconds=8953,
            avg_hr=148,
            max_hr=172,
            elevation_gain_m=42,
            run_type=RunActivity.RunType.OTHER,
            source="strava_export",
            source_activity_id="nat-geo-run",
            raw_metadata={"format": "tcx", "trackpoint_count": 8751},
        )

        response = self.client.get("/api/running/analytics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["total_runs"], 1)
        self.assertEqual(response.data["summary"]["imported_run_count"], 1)
        self.assertEqual(response.data["summary"]["manual_run_count"], 0)
        self.assertEqual(response.data["summary"]["average_distance_km"], 21.01)
        self.assertEqual(response.data["summary"]["longest_run_distance_km"], 21.01)
        self.assertIsNotNone(response.data["summary"]["latest_run_date"])
        self.assertEqual(response.data["longest_run"]["id"], run.id)
        self.assertEqual(response.data["longest_run"]["distance_km"], 21.01)
        self.assertEqual(response.data["longest_run"]["raw_metadata"]["trackpoint_count"], 8751)
        self.assertEqual(len(response.data["weekly_distance_trend"]), 8)
        self.assertEqual(len(response.data["monthly_distance_trend"]), 6)
        self.assertTrue(any(item["distance_km"] == 21.01 for item in response.data["weekly_distance_trend"]))
        self.assertEqual(response.data["marathon_baseline"]["longest_distance_km"], 21.01)
        self.assertEqual(response.data["marathon_baseline"]["distance_gap_to_marathon_km"], 21.19)
        self.assertIsNotNone(response.data["marathon_baseline"]["marathon_time_at_longest_run_pace_seconds"])
        self.assertTrue(response.data["marathon_baseline"]["half_marathon_benchmark"])
        self.assertEqual(response.data["marathon_baseline"]["baseline_label"], "Half-marathon benchmark")
        self.assertIn("half-marathon-distance benchmark", response.data["marathon_baseline"]["baseline_note"])
        self.assertEqual(response.data["consistency"]["consistency_label"], "Starting baseline")
        self.assertEqual(response.data["data_quality"]["confidence"], "low")
        self.assertIn("half-marathon-distance benchmark", " ".join(response.data["insights"]))

    def test_multiple_runs_across_weeks_weighted_trends_and_consistency(self):
        now = timezone.now()
        RunActivity.objects.create(
            user=self.user,
            title="Current week easy",
            started_at=now,
            distance_km=5,
            duration_seconds=1800,
            run_type=RunActivity.RunType.EASY,
            source="manual",
        )
        RunActivity.objects.create(
            user=self.user,
            title="Current week aerobic",
            started_at=now - timedelta(hours=6),
            distance_km=5,
            duration_seconds=2100,
            run_type=RunActivity.RunType.EASY,
            source="manual",
        )
        RunActivity.objects.create(
            user=self.user,
            title="Two weeks ago",
            started_at=now - timedelta(weeks=2),
            distance_km=10,
            duration_seconds=4000,
            run_type=RunActivity.RunType.LONG_RUN,
            source="manual",
        )
        RunActivity.objects.create(
            user=self.user,
            title="Four weeks ago",
            started_at=now - timedelta(weeks=4),
            distance_km=15,
            duration_seconds=6000,
            run_type=RunActivity.RunType.LONG_RUN,
            source="manual",
        )

        response = self.client.get("/api/running/analytics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["total_runs"], 4)
        self.assertEqual(response.data["summary"]["manual_run_count"], 4)
        self.assertEqual(response.data["summary"]["total_distance_km"], 35)
        self.assertEqual(response.data["summary"]["average_distance_km"], 8.75)
        self.assertEqual(response.data["current_week"]["week_distance_km"], 10)
        self.assertEqual(response.data["current_week"]["week_run_count"], 2)
        self.assertEqual(response.data["current_week"]["week_avg_pace_seconds_per_km"], 390)
        self.assertEqual(len(response.data["weekly_distance_trend"]), 8)
        self.assertEqual(len(response.data["monthly_distance_trend"]), 6)
        self.assertEqual(response.data["consistency"]["active_weeks_last_8"], 3)
        self.assertEqual(response.data["consistency"]["consistency_label"], "Building consistency")
        self.assertEqual(response.data["data_quality"]["confidence"], "medium")
        self.assertEqual(len(response.data["long_run_progression"]), 2)
        self.assertTrue(all("source" in item for item in response.data["recent_pace_trend"]))
