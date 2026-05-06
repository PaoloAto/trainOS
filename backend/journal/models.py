from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

TEN_POINT_VALIDATORS = [MinValueValidator(1), MaxValueValidator(10)]


class DailyCheckIn(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="daily_check_ins")
    date = models.DateField()
    sleep_hours = models.FloatField(null=True, blank=True)
    sleep_quality = models.PositiveSmallIntegerField(null=True, blank=True, validators=TEN_POINT_VALIDATORS)
    mood = models.PositiveSmallIntegerField(null=True, blank=True, validators=TEN_POINT_VALIDATORS)
    energy = models.PositiveSmallIntegerField(null=True, blank=True, validators=TEN_POINT_VALIDATORS)
    soreness = models.PositiveSmallIntegerField(null=True, blank=True, validators=TEN_POINT_VALIDATORS)
    stress = models.PositiveSmallIntegerField(null=True, blank=True, validators=TEN_POINT_VALIDATORS)
    body_weight = models.FloatField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "date"], name="unique_daily_check_in_per_user_date"),
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.user} check-in {self.date}"