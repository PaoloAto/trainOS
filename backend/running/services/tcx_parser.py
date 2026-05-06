from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone
from typing import BinaryIO

from django.utils import timezone
from django.utils.dateparse import parse_datetime

try:
    from defusedxml import ElementTree
except ImportError:  # pragma: no cover - stdlib fallback for fresh local envs
    from xml.etree import ElementTree


class TCXParseError(ValueError):
    pass


@dataclass(frozen=True)
class ParsedTCXRun:
    source_activity_id: str
    started_at: datetime
    distance_km: float
    duration_seconds: int
    avg_hr: float | None
    max_hr: float | None
    elevation_gain_m: float | None
    title: str
    raw_metadata: dict


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag


def _children(element, name: str):
    return [child for child in list(element) if _local_name(child.tag) == name]


def _first_child(element, name: str):
    for child in list(element):
        if _local_name(child.tag) == name:
            return child
    return None


def _descendants(element, name: str):
    return [node for node in element.iter() if _local_name(node.tag) == name]


def _child_text(element, name: str) -> str | None:
    child = _first_child(element, name)
    if child is None or child.text is None:
        return None
    value = child.text.strip()
    return value or None


def _descendant_text(element, name: str) -> str | None:
    for node in element.iter():
        if _local_name(node.tag) == name and node.text:
            value = node.text.strip()
            if value:
                return value
    return None


def _heart_rate_value(element, container_name: str) -> float | None:
    for node in element.iter():
        if _local_name(node.tag) != container_name:
            continue
        return _float_or_none(_child_text(node, "Value"))
    return None


def _float_or_none(value: str | None) -> float | None:
    if value in {None, ""}:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int_or_none(value: str | None) -> int | None:
    number = _float_or_none(value)
    if number is None:
        return None
    return int(round(number))


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, dt_timezone.utc)
    return parsed


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def _elevation_gain(altitudes: list[float], threshold_m: float = 2.0) -> float | None:
    if len(altitudes) < 2:
        return None

    gain = 0.0
    previous = altitudes[0]
    for altitude in altitudes[1:]:
        delta = altitude - previous
        if delta >= threshold_m:
            gain += delta
        previous = altitude

    return round(gain, 1) if gain > 0 else None


def parse_tcx(file_obj: BinaryIO) -> ParsedTCXRun:
    try:
        tree = ElementTree.parse(file_obj)
    except Exception as exc:  # XML parsers raise different exception classes.
        raise TCXParseError("Unable to parse TCX file. Please upload a valid TCX export.") from exc

    root = tree.getroot()
    activities = _descendants(root, "Activity")
    if not activities:
        raise TCXParseError("TCX file does not contain an activity.")

    activity = activities[0]
    sport = activity.attrib.get("Sport", "")
    source_activity_id = _child_text(activity, "Id") or ""

    laps = _children(activity, "Lap")
    trackpoints = _descendants(activity, "Trackpoint")

    started_at = _parse_datetime(source_activity_id)
    if started_at is None and laps:
        started_at = _parse_datetime(laps[0].attrib.get("StartTime"))
    if started_at is None and trackpoints:
        started_at = _parse_datetime(_child_text(trackpoints[0], "Time"))
    if started_at is None:
        raise TCXParseError("TCX file does not include a valid activity start time.")

    lap_durations = [_float_or_none(_child_text(lap, "TotalTimeSeconds")) for lap in laps]
    duration_seconds = int(round(sum(value for value in lap_durations if value is not None)))
    if duration_seconds <= 0:
        times = [_parse_datetime(_child_text(point, "Time")) for point in trackpoints]
        valid_times = [value for value in times if value is not None]
        if len(valid_times) >= 2:
            duration_seconds = int(round((valid_times[-1] - valid_times[0]).total_seconds()))
    if duration_seconds <= 0:
        raise TCXParseError("TCX file does not include a valid duration.")

    lap_distances = [_float_or_none(_child_text(lap, "DistanceMeters")) for lap in laps]
    distance_m = sum(value for value in lap_distances if value is not None)
    if distance_m <= 0:
        point_distances = [
            _float_or_none(_child_text(point, "DistanceMeters"))
            for point in trackpoints
        ]
        valid_distances = [value for value in point_distances if value is not None]
        distance_m = max(valid_distances) if valid_distances else 0
    if distance_m <= 0:
        raise TCXParseError("TCX file does not include a valid distance.")

    lap_avg_hr = [_heart_rate_value(lap, "AverageHeartRateBpm") for lap in laps]
    trackpoint_hr = [_heart_rate_value(point, "HeartRateBpm") for point in trackpoints]
    avg_hr = _average([value for value in lap_avg_hr if value is not None])
    if avg_hr is None:
        avg_hr = _average([value for value in trackpoint_hr if value is not None])

    lap_max_hr = [_heart_rate_value(lap, "MaximumHeartRateBpm") for lap in laps]
    max_hr_values = [value for value in lap_max_hr + trackpoint_hr if value is not None]
    max_hr = max(max_hr_values) if max_hr_values else None

    calories = sum(
        value for value in (_int_or_none(_child_text(lap, "Calories")) for lap in laps)
        if value is not None
    )
    altitudes = [
        value for value in (_float_or_none(_child_text(point, "AltitudeMeters")) for point in trackpoints)
        if value is not None
    ]

    metadata = {
        "format": "tcx",
        "sport": sport,
        "lap_count": len(laps),
        "trackpoint_count": len(trackpoints),
    }
    if calories > 0:
        metadata["calories"] = calories

    return ParsedTCXRun(
        source_activity_id=source_activity_id,
        started_at=started_at,
        distance_km=round(distance_m / 1000, 3),
        duration_seconds=duration_seconds,
        avg_hr=avg_hr,
        max_hr=max_hr,
        elevation_gain_m=_elevation_gain(altitudes),
        title="Imported Run",
        raw_metadata=metadata,
    )
