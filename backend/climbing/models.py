from django.conf import settings
from django.db import models


class ClimbingChoices:
    class SessionType(models.TextChoices):
        BOULDERING = "bouldering", "Bouldering"
        TOP_ROPE = "top_rope", "Top rope"
        SPORT = "sport", "Sport"
        TRAD = "trad", "Trad"
        TRAINING = "training", "Training"
        OTHER = "other", "Other"

    class GradeSystem(models.TextChoices):
        V_SCALE = "v_scale", "V-scale"
        YDS = "yds", "YDS"
        FONT = "font", "Font"
        OTHER = "other", "Other"

    class Result(models.TextChoices):
        FLASH = "flash", "Flash"
        SEND = "send", "Send"
        REPEAT = "repeat", "Repeat"
        PROJECT = "project", "Project"
        FAIL = "fail", "Fail"
        ATTEMPT = "attempt", "Attempt"
        CLEAN = "clean", "Clean"
        TAKE = "take", "Take"
        FALL = "fall", "Fall"
        COMPLETE = "complete", "Complete"

    class Style(models.TextChoices):
        SLAB = "slab", "Slab"
        VERTICAL = "vertical", "Vertical"
        OVERHANG = "overhang", "Overhang"
        ROOF = "roof", "Roof"
        CRIMPY = "crimpy", "Crimpy"
        SLOPER = "sloper", "Sloper"
        PINCH = "pinch", "Pinch"
        DYNO = "dyno", "Dyno"
        TECHNICAL = "technical", "Technical"
        POWERFUL = "powerful", "Powerful"
        ENDURANCE = "endurance", "Endurance"
        OTHER = "other", "Other"


class ClimbingSession(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="climbing_sessions")
    date = models.DateField()
    location = models.CharField(max_length=180, blank=True)
    session_type = models.CharField(max_length=24, choices=ClimbingChoices.SessionType.choices)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.get_session_type_display()} - {self.date}"


class ClimbAttempt(models.Model):
    session = models.ForeignKey(ClimbingSession, on_delete=models.CASCADE, related_name="attempts")
    climb_name = models.CharField(max_length=180, blank=True)
    grade_system = models.CharField(max_length=24, choices=ClimbingChoices.GradeSystem.choices)
    grade = models.CharField(max_length=40)
    style = models.CharField(max_length=24, choices=ClimbingChoices.Style.choices, blank=True)
    result = models.CharField(max_length=24, choices=ClimbingChoices.Result.choices)
    attempts = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.grade} {self.get_result_display()}"


class ClimbingProject(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SENT = "sent", "Sent"
        PAUSED = "paused", "Paused"
        ABANDONED = "abandoned", "Abandoned"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="climbing_projects")
    name = models.CharField(max_length=180)
    grade = models.CharField(max_length=40)
    grade_system = models.CharField(max_length=24, choices=ClimbingChoices.GradeSystem.choices)
    location = models.CharField(max_length=180, blank=True)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.ACTIVE)
    session_type = models.CharField(max_length=24, choices=ClimbingChoices.SessionType.choices, blank=True)
    started_at = models.DateField(null=True, blank=True)
    sent_at = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "name"]

    def __str__(self):
        return f"{self.name} ({self.grade})"