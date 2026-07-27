from django.contrib import admin

from .models import TrainingPreferences


@admin.register(TrainingPreferences)
class TrainingPreferencesAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "primary_focus",
        "running_sessions_per_week",
        "gym_sessions_per_week",
        "climbing_sessions_per_week",
        "updated_at",
    ]
    search_fields = ["user__username", "user__email"]
