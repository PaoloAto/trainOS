from django.contrib import admin

from .models import ImportBatch, RunActivity


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "source",
        "file_type",
        "original_filename",
        "status",
        "imported_count",
        "skipped_count",
        "error_count",
        "created_at",
    )
    list_filter = ("source", "file_type", "status", "created_at")
    search_fields = ("original_filename", "user__username")
    date_hierarchy = "created_at"


@admin.register(RunActivity)
class RunActivityAdmin(admin.ModelAdmin):
    list_display = ("user", "started_at", "run_type", "distance_km", "duration_seconds", "avg_pace_seconds_per_km", "source")
    list_filter = ("run_type", "source", "started_at")
    search_fields = ("user__username", "title", "notes", "source_activity_id")
    date_hierarchy = "started_at"
