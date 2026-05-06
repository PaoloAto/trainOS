import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
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
