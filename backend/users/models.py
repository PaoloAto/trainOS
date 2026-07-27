from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


WEEKLY_TARGET_VALIDATORS = [MinValueValidator(0), MaxValueValidator(14)]


class TrainingPreferences(models.Model):
    class PrimaryFocus(models.TextChoices):
        BALANCED = "balanced", "Balanced"
        RUNNING = "running", "Running"
        GYM = "gym", "Gym"
        CLIMBING = "climbing", "Climbing"

    class RunningGoal(models.TextChoices):
        GENERAL_FITNESS = "general_fitness", "General fitness"
        FIVE_K = "5k", "5K"
        TEN_K = "10k", "10K"
        HALF_MARATHON = "half_marathon", "Half marathon"
        MARATHON = "marathon", "Marathon"

    class GymGoal(models.TextChoices):
        STRENGTH = "strength", "Strength"
        HYPERTROPHY = "hypertrophy", "Hypertrophy"
        GENERAL_FITNESS = "general_fitness", "General fitness"
        CLIMBING_SUPPORT = "climbing_support", "Climbing support"

    class ClimbingGoal(models.TextChoices):
        BOULDERING = "bouldering", "Bouldering"
        TOP_ROPE = "top_rope", "Top rope"
        MIXED = "mixed", "Mixed"
        GENERAL_PROGRESSION = "general_progression", "General progression"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="training_preferences",
    )
    primary_focus = models.CharField(
        max_length=16,
        choices=PrimaryFocus.choices,
        default=PrimaryFocus.BALANCED,
    )
    running_goal = models.CharField(
        max_length=32,
        choices=RunningGoal.choices,
        default=RunningGoal.GENERAL_FITNESS,
    )
    running_sessions_per_week = models.PositiveSmallIntegerField(default=2, validators=WEEKLY_TARGET_VALIDATORS)
    running_weekly_distance_target_km = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0)])
    gym_goal = models.CharField(
        max_length=32,
        choices=GymGoal.choices,
        default=GymGoal.GENERAL_FITNESS,
    )
    gym_sessions_per_week = models.PositiveSmallIntegerField(default=2, validators=WEEKLY_TARGET_VALIDATORS)
    climbing_goal = models.CharField(
        max_length=32,
        choices=ClimbingGoal.choices,
        default=ClimbingGoal.GENERAL_PROGRESSION,
    )
    climbing_sessions_per_week = models.PositiveSmallIntegerField(default=1, validators=WEEKLY_TARGET_VALIDATORS)
    climbing_target_bouldering_grade = models.CharField(max_length=16, default="V4")
    climbing_target_route_grade = models.CharField(max_length=16, default="5.10a")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "training preferences"

    def __str__(self):
        return f"{self.user} training preferences"
