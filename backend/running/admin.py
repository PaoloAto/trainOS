from django.contrib import admin

from .models import RunActivity


@admin.register(RunActivity)
class RunActivityAdmin(admin.ModelAdmin):
    list_display = ("user", "started_at", "run_type", "distance_km", "duration_seconds", "avg_pace_seconds_per_km", "source")
    list_filter = ("run_type", "source", "started_at")
    search_fields = ("user__username", "title", "notes")
    date_hierarchy = "started_at"