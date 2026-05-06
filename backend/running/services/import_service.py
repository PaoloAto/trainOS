from __future__ import annotations

from pathlib import Path

from django.core.exceptions import ValidationError

from running.models import ImportBatch, RunActivity
from running.services.tcx_parser import TCXParseError, parse_tcx

UNSUPPORTED_PHASE_3A_MESSAGE = "Only TCX imports are supported in Phase 3A. GPX and FIT are coming later."


FILE_TYPE_BY_EXTENSION = {
    ".tcx": ImportBatch.FileType.TCX,
    ".gpx": ImportBatch.FileType.GPX,
    ".fit": ImportBatch.FileType.FIT,
    ".csv": ImportBatch.FileType.CSV,
    ".zip": ImportBatch.FileType.ZIP,
}


def _detect_file_type(filename: str) -> str:
    return FILE_TYPE_BY_EXTENSION.get(Path(filename).suffix.lower(), ImportBatch.FileType.UNKNOWN)


def _batch_error(batch: ImportBatch, message: str) -> None:
    batch.status = ImportBatch.Status.FAILED
    batch.error_count = 1
    batch.errors = [message]
    batch.save(update_fields=["status", "error_count", "errors", "updated_at"])


def _find_duplicate(user, parsed) -> RunActivity | None:
    if parsed.source_activity_id:
        duplicate = RunActivity.objects.filter(
            user=user,
            source_activity_id=parsed.source_activity_id,
        ).first()
        if duplicate:
            return duplicate

    return RunActivity.objects.filter(
        user=user,
        started_at=parsed.started_at,
        distance_km__gte=parsed.distance_km - 0.02,
        distance_km__lte=parsed.distance_km + 0.02,
        duration_seconds__gte=max(0, parsed.duration_seconds - 5),
        duration_seconds__lte=parsed.duration_seconds + 5,
    ).first()


def import_running_file(*, user, uploaded_file, source: str) -> dict:
    if source not in ImportBatch.Source.values:
        raise ValidationError("Unsupported import source.")

    original_filename = Path(uploaded_file.name).name
    file_type = _detect_file_type(original_filename)
    batch = ImportBatch.objects.create(
        user=user,
        source=source,
        file_type=file_type,
        original_filename=original_filename,
        uploaded_file=uploaded_file,
        status=ImportBatch.Status.PENDING,
    )

    if file_type != ImportBatch.FileType.TCX:
        _batch_error(batch, UNSUPPORTED_PHASE_3A_MESSAGE)
        raise ValidationError(UNSUPPORTED_PHASE_3A_MESSAGE)

    batch.status = ImportBatch.Status.PROCESSING
    batch.save(update_fields=["status", "updated_at"])

    try:
        batch.uploaded_file.open("rb")
        parsed = parse_tcx(batch.uploaded_file.file)
    except TCXParseError as exc:
        message = str(exc)
        _batch_error(batch, message)
        raise ValidationError(message) from exc
    finally:
        batch.uploaded_file.close()

    duplicate = _find_duplicate(user, parsed)
    if duplicate:
        batch.status = ImportBatch.Status.COMPLETED
        batch.skipped_count = 1
        batch.save(update_fields=["status", "skipped_count", "updated_at"])
        return {
            "batch": batch,
            "created_run": None,
            "duplicate_run": duplicate,
            "message": "No new runs imported. 1 duplicate skipped.",
        }

    run = RunActivity.objects.create(
        user=user,
        title=parsed.title,
        started_at=parsed.started_at,
        distance_km=parsed.distance_km,
        duration_seconds=parsed.duration_seconds,
        avg_hr=parsed.avg_hr,
        max_hr=parsed.max_hr,
        elevation_gain_m=parsed.elevation_gain_m,
        run_type=RunActivity.RunType.OTHER,
        source=source,
        import_batch=batch,
        source_activity_id=parsed.source_activity_id,
        raw_metadata=parsed.raw_metadata,
    )
    batch.status = ImportBatch.Status.COMPLETED
    batch.imported_count = 1
    batch.save(update_fields=["status", "imported_count", "updated_at"])
    return {
        "batch": batch,
        "created_run": run,
        "duplicate_run": None,
        "message": f"Imported 1 run - {run.distance_km:.2f} km.",
    }
