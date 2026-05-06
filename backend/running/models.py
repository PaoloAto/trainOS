from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


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