from django.conf import settings
from django.db import models


class AIInsight(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_insights")
    insight_type = models.CharField(max_length=80)
    date = models.DateField()
    input_summary = models.JSONField(default=dict)
    output_text = models.TextField()
    model_name = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.insight_type} - {self.date}"