from rest_framework import serializers

from .models import ImportBatch, RunActivity


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
            "import_batch",
            "source_activity_id",
            "raw_metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "avg_pace_seconds_per_km",
            "source",
            "import_batch",
            "source_activity_id",
            "raw_metadata",
            "created_at",
            "updated_at",
        ]


class RunImportSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = RunActivity
        fields = [
            "id",
            "title",
            "started_at",
            "distance_km",
            "duration_seconds",
            "avg_pace_seconds_per_km",
            "source",
        ]


class ImportBatchSerializer(serializers.ModelSerializer):
    runs = RunImportSummarySerializer(many=True, read_only=True)

    class Meta:
        model = ImportBatch
        fields = [
            "id",
            "source",
            "file_type",
            "original_filename",
            "status",
            "imported_count",
            "skipped_count",
            "error_count",
            "errors",
            "created_at",
            "updated_at",
            "runs",
        ]
        read_only_fields = fields


class ImportResultSerializer(serializers.Serializer):
    message = serializers.CharField()
    batch = ImportBatchSerializer()
    created_run = RunImportSummarySerializer(allow_null=True)
