"""Task, subject, and room-zone segmentation primitives for video workflows."""
from __future__ import annotations

from typing import Iterable, cast

from deepsynaps_video.schemas import (
    RoomZoneDefinition,
    RoomZoneMap,
    SubjectSelection,
    TaskSegment,
)


class SegmentationError(ValueError):
    """Raised when segment or zone definitions are invalid."""


def define_task_segments(
    video_id: str,
    segments: Iterable[TaskSegment | dict[str, object]],
    *,
    allow_overlaps: bool = False,
) -> tuple[TaskSegment, ...]:
    """Validate and return structured task segments for a clinical video."""

    parsed = tuple(_coerce_segment(video_id, segment) for segment in segments)
    for segment in parsed:
        if segment.end_seconds <= segment.start_seconds:
            raise SegmentationError(f"Invalid segment time range for {segment.segment_id}")
    ordered = tuple(sorted(parsed, key=lambda item: (item.start_seconds, item.end_seconds)))
    if not allow_overlaps:
        for previous, current in zip(ordered, ordered[1:]):
            if current.start_seconds < previous.end_seconds:
                raise SegmentationError(
                    f"Task segments overlap: {previous.segment_id} and {current.segment_id}"
                )
    return ordered


def select_primary_subject(
    track_ids: Iterable[str],
    *,
    selected_track_id: str | None = None,
    confidence: float = 1.0,
    method: str = "manual",
) -> SubjectSelection:
    """Select the primary patient/subject track for downstream analysis."""

    tracks = tuple(track_ids)
    if not tracks:
        raise SegmentationError("At least one track ID is required")
    chosen = selected_track_id or tracks[0]
    if chosen not in tracks:
        raise SegmentationError(f"Selected track ID is not present: {chosen}")
    if confidence < 0.0 or confidence > 1.0:
        raise SegmentationError("Subject-selection confidence must be between 0 and 1")
    return SubjectSelection(
        subject_id=chosen,
        track_id=chosen,
        confidence=confidence,
        selected_by="user" if method == "manual" else "heuristic",
        reason=method,
    )


def define_room_zones(
    layout_id: str,
    zones: Iterable[RoomZoneDefinition | dict[str, object]],
    *,
    video_id: str = "room-video",
) -> RoomZoneMap:
    """Validate and return camera/room zone polygons."""

    parsed = tuple(_coerce_zone(layout_id, zone) for zone in zones)
    for zone in parsed:
        if len(zone.polygon) < 3:
            raise SegmentationError(f"Room zone requires at least 3 points: {zone.zone_id}")
    return RoomZoneMap(zone_map_id=layout_id, video_id=video_id, zones=parsed)


def auto_detect_task_boundaries(
    video_id: str,
    *,
    protocol_id: str = "unknown_task",
    duration_seconds: float | None = None,
) -> tuple[TaskSegment, ...] | dict[str, object]:
    """Return a low-confidence whole-video task boundary candidate.

    This is intentionally conservative until task-specific boundary heuristics
    are implemented.
    """

    if duration_seconds is None or duration_seconds <= 0:
        return ()
    return (
        TaskSegment(
            segment_id=f"{video_id}:{protocol_id}:auto",
            video_id=video_id,
            task_label=protocol_id,
            start_seconds=0.0,
            end_seconds=duration_seconds,
            protocol_id=protocol_id,
            confidence=0.25,
            metadata={
                "source": "auto",
                "limitations": ("auto-detected boundary candidate requires clinician review",),
            },
        ),
    )


def _coerce_segment(video_id: str, segment: TaskSegment | dict[str, object]) -> TaskSegment:
    if isinstance(segment, TaskSegment):
        return segment
    start = float(cast(float | int | str, segment["start_seconds"]))
    end = float(cast(float | int | str, segment["end_seconds"]))
    task_label = str(segment["task_label"])
    return TaskSegment(
        segment_id=str(segment.get("segment_id") or f"{video_id}:{task_label}:{start:g}-{end:g}"),
        video_id=str(segment.get("video_id") or video_id),
        task_label=task_label,
        start_seconds=start,
        end_seconds=end,
        protocol_id=str(segment["protocol_id"]) if segment.get("protocol_id") is not None else None,
        side=str(segment["side"]) if segment.get("side") is not None else None,
        confidence=float(cast(float | int | str, segment.get("confidence", 1.0))),
        metadata={"source": str(segment.get("source", "manual"))},
    )


def _coerce_zone(layout_id: str, zone: RoomZoneDefinition | dict[str, object]) -> RoomZoneDefinition:
    if isinstance(zone, RoomZoneDefinition):
        return zone
    raw_polygon = cast(Iterable[tuple[float | int | str, float | int | str]], zone["polygon"])
    polygon = tuple((float(x), float(y)) for x, y in raw_polygon)
    return RoomZoneDefinition(
        zone_id=str(zone["zone_id"]),
        zone_type=str(zone.get("zone_type", "other")),
        polygon=polygon,
        label=str(zone["label"]) if zone.get("label") is not None else None,
    )


__all__ = [
    "SegmentationError",
    "auto_detect_task_boundaries",
    "define_room_zones",
    "define_task_segments",
    "select_primary_subject",
]
