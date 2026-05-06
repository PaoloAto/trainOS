from django.contrib import admin

from .models import AIInsight


@admin.register(AIInsight)
class AIInsightAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "insight_type", "model_name", "created_at")
    list_filter = ("insight_type", "model_name", "date")
    search_fields = ("user__username", "output_text", "model_name")
    date_hierarchy = "date"