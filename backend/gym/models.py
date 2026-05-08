from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class MuscleGroup(models.Model):
    name = models.CharField(max_length=80, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Exercise(models.Model):
    class MovementPattern(models.TextChoices):
        PUSH = "push", "Push"
        PULL = "pull", "Pull"
        SQUAT = "squat", "Squat"
        HINGE = "hinge", "Hinge"
        LUNGE = "lunge", "Lunge"
        CARRY = "carry", "Carry"
        ROTATION = "rotation", "Rotation"
        ISOLATION = "isolation", "Isolation"
        CORE = "core", "Core"
        OTHER = "other", "Other"

    class Equipment(models.TextChoices):
        BARBELL = "barbell", "Barbell"
        DUMBBELL = "dumbbell", "Dumbbell"
        MACHINE = "machine", "Machine"
        CABLE = "cable", "Cable"
        BODYWEIGHT = "bodyweight", "Bodyweight"
        KETTLEBELL = "kettlebell", "Kettlebell"
        BAND = "band", "Band"
        OTHER = "other", "Other"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="exercises")
    name = models.CharField(max_length=160)
    primary_muscle_group = models.ForeignKey(MuscleGroup, on_delete=models.PROTECT, related_name="primary_exercises")
    secondary_muscle_groups = models.ManyToManyField(MuscleGroup, blank=True, related_name="secondary_exercises")
    movement_pattern = models.CharField(max_length=24, choices=MovementPattern.choices, blank=True)
    equipment = models.CharField(max_length=24, choices=Equipment.choices, blank=True)
    form_notes = models.TextField(blank=True)
    is_custom = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def archive(self):
        if not self.is_archived:
            self.is_archived = True
            self.archived_at = timezone.now()
            self.save(update_fields=["is_archived", "archived_at", "updated_at"])

    def restore(self):
        if self.is_archived:
            self.is_archived = False
            self.archived_at = None
            self.save(update_fields=["is_archived", "archived_at", "updated_at"])


class ExerciseReference(models.Model):
    class Source(models.TextChoices):
        YOUTUBE = "youtube", "YouTube"
        INSTAGRAM = "instagram", "Instagram"
        TIKTOK = "tiktok", "TikTok"
        WEBSITE = "website", "Website"
        OTHER = "other", "Other"

    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="references")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="exercise_references")
    url = models.URLField()
    source = models.CharField(max_length=24, choices=Source.choices, default=Source.OTHER)
    title = models.CharField(max_length=180, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or self.url


class GymSession(models.Model):
    class SplitType(models.TextChoices):
        PUSH = "push", "Push"
        PULL = "pull", "Pull"
        LEGS = "legs", "Legs"
        UPPER = "upper", "Upper"
        LOWER = "lower", "Lower"
        FULL_BODY = "full_body", "Full body"
        CUSTOM = "custom", "Custom"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="gym_sessions")
    date = models.DateField()
    split_type = models.CharField(max_length=24, choices=SplitType.choices)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.get_split_type_display()} - {self.date}"


class GymSet(models.Model):
    session = models.ForeignKey(GymSession, on_delete=models.CASCADE, related_name="sets")
    exercise = models.ForeignKey(Exercise, on_delete=models.PROTECT, related_name="gym_sets")
    set_number = models.PositiveIntegerField()
    weight = models.FloatField(null=True, blank=True)
    reps = models.PositiveIntegerField()
    rpe = models.FloatField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(10)])
    notes = models.CharField(max_length=220, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["set_number", "id"]

    def __str__(self):
        return f"{self.exercise} x {self.reps}"


class WorkoutTemplate(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="workout_templates")
    name = models.CharField(max_length=160)
    split_type = models.CharField(max_length=24, choices=GymSession.SplitType.choices)
    notes = models.TextField(blank=True)
    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["is_archived", "split_type", "name"]

    def __str__(self):
        return self.name

    def archive(self):
        if not self.is_archived:
            self.is_archived = True
            self.archived_at = timezone.now()
            self.save(update_fields=["is_archived", "archived_at", "updated_at"])

    def restore(self):
        if self.is_archived:
            self.is_archived = False
            self.archived_at = None
            self.save(update_fields=["is_archived", "archived_at", "updated_at"])


class WorkoutTemplateExercise(models.Model):
    template = models.ForeignKey(WorkoutTemplate, on_delete=models.CASCADE, related_name="items")
    exercise = models.ForeignKey(Exercise, on_delete=models.PROTECT, related_name="template_items")
    order = models.PositiveIntegerField()
    target_sets = models.PositiveIntegerField(default=3)
    target_reps_low = models.PositiveIntegerField(null=True, blank=True)
    target_reps_high = models.PositiveIntegerField(null=True, blank=True)
    suggested_weight = models.FloatField(null=True, blank=True)
    rest_seconds = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.template} - {self.order}. {self.exercise}"


class ActiveWorkout(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="active_workout")
    template = models.ForeignKey(WorkoutTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name="active_workouts")
    started_at = models.DateTimeField(default=timezone.now)
    current_exercise_index = models.PositiveIntegerField(default=0)
    current_set_index = models.PositiveIntegerField(default=0)
    logged_sets = models.JSONField(default=list)
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        template_name = self.template.name if self.template else "Untitled workout"
        return f"{self.user} - {template_name}"
