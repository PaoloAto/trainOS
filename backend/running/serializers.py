from rest_framework import serializers

from .models import RunActivity


class RunActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = RunActivity
        fields = [
            "id",
            "title",
            "started_at",
            "distance_km",
            "duration_seconds",
            "avg_pace_seconds_per_km",
            "avg_hr",
            "max_hr",
            "elevation_gain_m",
            "run_type",
            "perceived_effort",
            "notes",
            "source",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "avg_pace_seconds_per_km", "source", "created_at", "updated_at"]