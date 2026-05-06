from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class ImportBatch(models.Model):
    class Source(models.TextChoices):
        GARMIN_EXPORT = "garmin_export", "Garmin export"
        STRAVA_EXPORT = "strava_export", "Strava export"
        MANUAL_UPLOAD = "manual_upload", "Manual upload"
        OTHER = "other", "Other"

    class FileType(models.TextChoices):
        TCX = "tcx", "TCX"
        GPX = "gpx", "GPX"
        FIT = "fit", "FIT"
        CSV = "csv", "CSV"
        ZIP = "zip", "ZIP"
        UNKNOWN = "unknown", "Unknown"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        COMPLETED_WITH_ERRORS = "completed_with_errors", "Completed with errors"
        FAILED = "failed", "Failed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="running_import_batches")
    source = models.CharField(max_length=32, choices=Source.choices, default=Source.MANUAL_UPLOAD)
    file_type = models.CharField(max_length=16, choices=FileType.choices, default=FileType.UNKNOWN)
    original_filename = models.CharField(max_length=255)
    uploaded_file = models.FileField(upload_to="imports/running/")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    imported_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    errors = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "import batches"

    def __str__(self):
        return f"{self.original_filename} ({self.get_status_display()})"


class RunActivity(models.Model):
    class RunType(models.TextChoices):
        EASY = "easy", "Easy"
        LONG_RUN = "long_run", "Long run"
        TEMPO = "tempo", "Tempo"
        INTERVAL = "interval", "Interval"
        RECOVERY = "recovery", "Recovery"
        RACE = "race", "Race"
        HILL = "hill", "Hill"
        PROGRESSION = "progression", "Progression"
        OTHER = "other", "Other"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="runs")
    title = models.CharField(max_length=160, blank=True)
    started_at = models.DateTimeField()
    distance_km = models.FloatField()
    duration_seconds = models.PositiveIntegerField()
    avg_pace_seconds_per_km = models.FloatField(null=True, blank=True)
    avg_hr = models.FloatField(null=True, blank=True)
    max_hr = models.FloatField(null=True, blank=True)
    elevation_gain_m = models.FloatField(null=True, blank=True)
    run_type = models.CharField(max_length=24, choices=RunType.choices, default=RunType.EASY)
    perceived_effort = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(10)])
    notes = models.TextField(blank=True)
    source = models.CharField(max_length=40, default="manual")
    import_batch = models.ForeignKey(ImportBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name="runs")
    source_activity_id = models.CharField(max_length=255, blank=True)
    raw_metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at", "-created_at"]

    def save(self, *args, **kwargs):
        if self.distance_km and self.duration_seconds:
            self.avg_pace_seconds_per_km = self.duration_seconds / self.distance_km
        super().save(*args, **kwargs)

    def __str__(self):
        label = self.title or self.get_run_type_display()
        return f"{label} - {self.distance_km:g} km"
