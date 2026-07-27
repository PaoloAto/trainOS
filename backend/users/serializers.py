from rest_framework import serializers

from .models import TrainingPreferences


SESSION_TARGET_FIELDS = (
    "running_sessions_per_week",
    "gym_sessions_per_week",
    "climbing_sessions_per_week",
)


class TrainingPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingPreferences
        fields = [
            "id",
            "primary_focus",
            "running_goal",
            "running_sessions_per_week",
            "running_weekly_distance_target_km",
            "gym_goal",
            "gym_sessions_per_week",
            "climbing_goal",
            "climbing_sessions_per_week",
            "climbing_target_bouldering_grade",
            "climbing_target_route_grade",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        for field in SESSION_TARGET_FIELDS:
            value = attrs.get(field, getattr(self.instance, field, None))
            if value is not None and not 0 <= value <= 14:
                raise serializers.ValidationError({field: "Weekly session targets must be between 0 and 14."})

        distance_target = attrs.get(
            "running_weekly_distance_target_km",
            getattr(self.instance, "running_weekly_distance_target_km", None),
        )
        if distance_target is not None and distance_target < 0:
            raise serializers.ValidationError(
                {"running_weekly_distance_target_km": "Weekly distance target must be zero or greater."}
            )

        return attrs
