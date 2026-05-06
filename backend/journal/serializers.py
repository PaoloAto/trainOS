from django.utils import timezone
from rest_framework import serializers

from .models import DailyCheckIn


class DailyCheckInSerializer(serializers.ModelSerializer):
    date = serializers.DateField(required=False)

    class Meta:
        model = DailyCheckIn
        fields = [
            "id",
            "date",
            "sleep_hours",
            "sleep_quality",
            "mood",
            "energy",
            "soreness",
            "stress",
            "body_weight",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs.setdefault("date", timezone.localdate())
        return attrs