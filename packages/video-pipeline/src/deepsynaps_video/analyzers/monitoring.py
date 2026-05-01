"""Continuous patient monitoring analyzers for room and bed video.

These functions operate on already-derived actor tracks rather than raw frames.
That mirrors TeleICU/LookDeep-style deployments: detection/tracking models run
upstream, then a policy layer converts tracks, room zones, and motion into
reviewable patient-safety event candidates.

The module does not page staff, route alarms, or make clinical claims directly.
It emits typed events with confidence, timestamps, and context so downstream
workflow/orchestration code can apply site-specific governance.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot
from typing import Any, Literal

from deepsynaps_video.schemas import json_ready

ActorRole = Literal["patient", "staff", "visitor", "unknown"]
PostureState = Literal["standing", "sitting", "lying", "falling", "on_floor", "unknown"]
MonitoringEventType = Literal[
    "bed_edge",
    "standing_from_bed",
    "left_bed_zone",
    "fall_candidate",
    "prolonged_inactivity",
    "room_zone_transition",
    "staff_patient_interaction",
]
MonitoringSeverity = Literal["info", "warning", "critical"]
ZoneType = Literal["bed", "bed_edge", "chair", "doorway", "bathroom", "floor", "staff_area", "restricted", "other"]


@dataclass(frozen=True)
class TrackPoint:
    """Single actor-track point produced by upstream patient/person tracking.

    Coordinates are image-plane or room-plane units. Optional bounding-box height
    and posture labels help detect fall-like candidates but are not required.
    """

    timestamp_seconds: float
    x: float
    y: float
    confidence: float = 1.0
    bbox_width: float | None = None
    bbox_height: float | None = None
    posture: PostureState = "unknown"

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class ActorTrack:
    """Track for a patient, staff member, visitor, or unknown actor."""

    actor_id: str
    role: ActorRole
    points: tuple[TrackPoint, ...]
    label_confidence: float = 1.0

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True, init=False)
class RoomZone:
    """Polygonal room zone such as bed, doorway, or floor-risk area."""

    zone_id: str
    polygon: tuple[tuple[float, float], ...]
    zone_type: ZoneType = "other"
    label: str | None = None

    def __init__(
        self,
        zone_id: str,
        zone_type: ZoneType | str,
        polygon: tuple[tuple[float, float], ...],
        label: str | None = None,
    ) -> None:
        # Keep construction terse for configs/tests: RoomZone("bed", "bed", polygon).
        normalized_type: ZoneType = "doorway" if zone_type == "door" else zone_type  # type: ignore[assignment]
        if normalized_type not in {
            "bed",
            "bed_edge",
            "chair",
            "doorway",
            "bathroom",
            "floor",
            "staff_area",
            "restricted",
            "other",
        }:
            normalized_type = "other"
        object.__setattr__(self, "zone_id", zone_id)
        object.__setattr__(self, "zone_type", normalized_type)
        object.__setattr__(self, "polygon", polygon)
        object.__setattr__(self, "label", label or zone_id)

    def contains(self, x: float, y: float) -> bool:
        """Return whether a point lies inside the polygon."""

        return _point_in_polygon(x, y, self.polygon)

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class RoomLayout:
    """Camera-specific room layout used to interpret track movement."""

    zones: tuple[RoomZone, ...]
    layout_id: str = "default"
    coordinate_space: str = "image_pixels"

    def zone_at(self, x: float, y: float) -> RoomZone | None:
        """Return the first zone containing a point, preferring specific zones."""

        for zone in self.zones:
            if zone.contains(x, y):
                return zone
        return None

    def zones_by_type(self, zone_type: ZoneType) -> tuple[RoomZone, ...]:
        return tuple(zone for zone in self.zones if zone.zone_type == zone_type)

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class MonitoringThresholds:
    """Configurable thresholds for monitoring event candidates."""

    inactivity_seconds: float = 60.0
    inactivity_movement_px: float = 5.0
    fall_y_velocity_px_per_sec: float = 80.0
    fall_bbox_height_drop_ratio: float = 0.35
    interaction_distance_px: float = 80.0
    min_interaction_seconds: float = 2.0


@dataclass(frozen=True)
class MonitoringEvent:
    """Reviewable patient-safety event emitted by monitoring analyzers."""

    event_type: MonitoringEventType
    actor_id: str
    start_seconds: float
    end_seconds: float
    confidence: float
    severity: MonitoringSeverity
    label: str
    context: dict[str, Any] = field(default_factory=dict)

    @property
    def duration_seconds(self) -> float:
        return max(0.0, self.end_seconds - self.start_seconds)

    def to_dict(self) -> dict[str, Any]:
        payload = json_ready(self)
        payload["duration_seconds"] = self.duration_seconds
        return payload

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


def detect_bed_exit_events(
    tracks: tuple[ActorTrack, ...] | list[ActorTrack],
    room_layout: RoomLayout,
    *,
    patient_role: ActorRole = "patient",
    edge_margin: float = 0.1,
) -> tuple[MonitoringEvent, ...]:
    """Detect candidates where a patient leaves a bed zone or reaches bed edge.

    This models common ward/ICU safety workflows: "patient at edge of bed" and
    "patient left bed zone" are emitted as candidates for human review.
    """

    events: list[MonitoringEvent] = []
    bed_zone_ids = {zone.zone_id for zone in room_layout.zones_by_type("bed")}
    edge_zone_ids = {zone.zone_id for zone in room_layout.zones_by_type("bed_edge")}
    bed_zones = room_layout.zones_by_type("bed")
    if not bed_zone_ids:
        return ()
    for track in _tracks_by_role(tracks, patient_role):
        zone_series = _zone_series(track, room_layout)
        previous_zone_id: str | None = None
        started_in_bed = False
        bed_edge_emitted = False
        standing_emitted = False
        for point, zone in zone_series:
            zone_id = zone.zone_id if zone is not None else None
            if previous_zone_id is None:
                started_in_bed = zone_id in bed_zone_ids
            near_edge = zone_id in bed_zone_ids and any(_near_zone_edge(point, bed_zone, edge_margin) for bed_zone in bed_zones)
            if started_in_bed and not bed_edge_emitted and (
                (zone_id in edge_zone_ids and previous_zone_id in bed_zone_ids) or near_edge
            ):
                events.append(
                    MonitoringEvent(
                        event_type="bed_edge",
                        actor_id=track.actor_id,
                        start_seconds=point.timestamp_seconds,
                        end_seconds=point.timestamp_seconds,
                        confidence=_combined_confidence(track.label_confidence, point.confidence, 0.8),
                        severity="warning",
                        label="patient reached bed edge",
                        context={"from_zone": previous_zone_id, "to_zone": zone_id},
                    )
                )
                bed_edge_emitted = True
            if started_in_bed and not standing_emitted and point.posture == "standing":
                events.append(
                    MonitoringEvent(
                        event_type="standing_from_bed",
                        actor_id=track.actor_id,
                        start_seconds=point.timestamp_seconds,
                        end_seconds=point.timestamp_seconds,
                        confidence=_combined_confidence(track.label_confidence, point.confidence, 0.85),
                        severity="warning",
                        label="patient stood from bed",
                        context={"zone": zone_id or "unmapped"},
                    )
                )
                standing_emitted = True
            if started_in_bed and previous_zone_id in bed_zone_ids | edge_zone_ids and zone_id not in bed_zone_ids | edge_zone_ids:
                events.append(
                    MonitoringEvent(
                        event_type="left_bed_zone",
                        actor_id=track.actor_id,
                        start_seconds=point.timestamp_seconds,
                        end_seconds=point.timestamp_seconds,
                        confidence=_combined_confidence(track.label_confidence, point.confidence, 0.9),
                        severity="warning",
                        label="patient left bed zone",
                        context={"from_zone": previous_zone_id, "to_zone": zone_id or "unmapped"},
                    )
                )
            previous_zone_id = zone_id
    return tuple(events)


def detect_fall_like_events(
    tracks: tuple[ActorTrack, ...] | list[ActorTrack],
    motion_signals: dict[str, tuple[float, ...]] | None = None,
    *,
    thresholds: MonitoringThresholds | None = None,
    patient_role: ActorRole = "patient",
    min_vertical_drop: float | None = None,
    post_fall_window_seconds: float | None = None,
) -> tuple[MonitoringEvent, ...]:
    """Detect fall-like candidates from rapid downward movement/posture changes.

    The detector uses simple cues available from tracked boxes/poses: high
    positive y velocity, bounding-box height collapse, explicit ``on_floor`` or
    ``lying`` posture labels, and optional per-actor motion-energy signals.
    """

    thresholds = thresholds or MonitoringThresholds()
    if min_vertical_drop is not None:
        thresholds = MonitoringThresholds(
            inactivity_seconds=thresholds.inactivity_seconds,
            inactivity_movement_px=thresholds.inactivity_movement_px,
            fall_y_velocity_px_per_sec=min_vertical_drop,
            fall_bbox_height_drop_ratio=thresholds.fall_bbox_height_drop_ratio,
            interaction_distance_px=thresholds.interaction_distance_px,
            min_interaction_seconds=thresholds.min_interaction_seconds,
        )
    _ = post_fall_window_seconds
    events: list[MonitoringEvent] = []
    for track in _tracks_by_role(tracks, patient_role):
        points = sorted(track.points, key=lambda point: point.timestamp_seconds)
        for previous, current in zip(points, points[1:]):
            dt = current.timestamp_seconds - previous.timestamp_seconds
            if dt <= 0:
                continue
            y_velocity = (current.y - previous.y) / dt
            height_drop = _height_drop_ratio(previous, current)
            posture_cue = current.posture in {"lying", "on_floor"}
            motion_energy = _motion_energy_at(motion_signals, track.actor_id, current.timestamp_seconds)
            velocity_cue = y_velocity >= thresholds.fall_y_velocity_px_per_sec
            shape_cue = height_drop is not None and height_drop >= thresholds.fall_bbox_height_drop_ratio
            if velocity_cue and (shape_cue or posture_cue or motion_energy is None or motion_energy > 0):
                confidence = _combined_confidence(
                    track.label_confidence,
                    current.confidence,
                    0.45 + (0.25 if shape_cue else 0.0) + (0.25 if posture_cue else 0.0),
                )
                events.append(
                    MonitoringEvent(
                        event_type="fall_candidate",
                        actor_id=track.actor_id,
                        start_seconds=previous.timestamp_seconds,
                        end_seconds=current.timestamp_seconds,
                        confidence=confidence,
                        severity="critical",
                        label="fall-like movement candidate",
                        context={
                            "y_velocity_px_per_sec": y_velocity,
                            "bbox_height_drop_ratio": height_drop,
                            "posture": current.posture,
                        },
                    )
                )
    return tuple(events)


def detect_prolonged_inactivity(
    tracks: tuple[ActorTrack, ...] | list[ActorTrack],
    thresholds: MonitoringThresholds | None = None,
    *,
    patient_role: ActorRole = "patient",
    min_duration_seconds: float | None = None,
    max_motion_distance: float | None = None,
) -> tuple[MonitoringEvent, ...]:
    """Detect intervals where a patient track moves less than a threshold."""

    thresholds = thresholds or MonitoringThresholds()
    if min_duration_seconds is not None or max_motion_distance is not None:
        thresholds = MonitoringThresholds(
            inactivity_seconds=min_duration_seconds
            if min_duration_seconds is not None
            else thresholds.inactivity_seconds,
            inactivity_movement_px=max_motion_distance
            if max_motion_distance is not None
            else thresholds.inactivity_movement_px,
            fall_y_velocity_px_per_sec=thresholds.fall_y_velocity_px_per_sec,
            fall_bbox_height_drop_ratio=thresholds.fall_bbox_height_drop_ratio,
            interaction_distance_px=thresholds.interaction_distance_px,
            min_interaction_seconds=thresholds.min_interaction_seconds,
        )
    events: list[MonitoringEvent] = []
    for track in _tracks_by_role(tracks, patient_role):
        points = sorted(track.points, key=lambda point: point.timestamp_seconds)
        if len(points) < 2:
            continue
        interval_start = points[0]
        last_point = points[0]
        for point in points[1:]:
            displacement = _distance(last_point, point)
            if displacement > thresholds.inactivity_movement_px:
                _append_inactivity_event(events, track, interval_start, last_point, thresholds)
                interval_start = point
            last_point = point
        _append_inactivity_event(events, track, interval_start, last_point, thresholds)
    return tuple(events)


def detect_room_zone_events(
    tracks: tuple[ActorTrack, ...] | list[ActorTrack],
    zones: RoomLayout | tuple[RoomZone, ...] | list[RoomZone],
    *,
    restricted_zone_ids: tuple[str, ...] = (),
) -> tuple[MonitoringEvent, ...]:
    """Detect transitions between room zones such as bed, doorway, or bathroom."""

    layout = zones if isinstance(zones, RoomLayout) else RoomLayout(layout_id="inline", zones=tuple(zones))
    events: list[MonitoringEvent] = []
    for track in tracks:
        previous_zone: RoomZone | None = None
        for point, zone in _zone_series(track, layout):
            if previous_zone is not None and zone is not None and zone.zone_id != previous_zone.zone_id:
                severity: MonitoringSeverity = (
                    "warning" if zone.zone_type in {"doorway", "restricted"} or zone.zone_id in restricted_zone_ids else "info"
                )
                events.append(
                    MonitoringEvent(
                        event_type="room_zone_transition",
                        actor_id=track.actor_id,
                        start_seconds=point.timestamp_seconds,
                        end_seconds=point.timestamp_seconds,
                        confidence=_combined_confidence(track.label_confidence, point.confidence, 0.85),
                        severity=severity,
                        label=f"{track.role} moved from {previous_zone.label} to {zone.label}",
                        context={
                            "from_zone": previous_zone.zone_id,
                            "from_zone_type": previous_zone.zone_type,
                            "to_zone": zone.zone_id,
                            "to_zone_type": zone.zone_type,
                        },
                    )
                )
            if zone is not None:
                previous_zone = zone
    return tuple(events)


def detect_interaction_events(
    tracks: tuple[ActorTrack, ...] | list[ActorTrack],
    thresholds: MonitoringThresholds | None = None,
    *,
    proximity_distance: float | None = None,
) -> tuple[MonitoringEvent, ...]:
    """Detect patient/staff proximity windows for bedside interaction review."""

    thresholds = thresholds or MonitoringThresholds()
    if proximity_distance is not None:
        thresholds = MonitoringThresholds(
            inactivity_seconds=thresholds.inactivity_seconds,
            inactivity_movement_px=thresholds.inactivity_movement_px,
            fall_y_velocity_px_per_sec=thresholds.fall_y_velocity_px_per_sec,
            fall_bbox_height_drop_ratio=thresholds.fall_bbox_height_drop_ratio,
            interaction_distance_px=proximity_distance,
            min_interaction_seconds=thresholds.min_interaction_seconds,
        )
    patients = _tracks_by_role(tracks, "patient")
    staff = _tracks_by_role(tracks, "staff")
    events: list[MonitoringEvent] = []
    for patient in patients:
        for staff_track in staff:
            windows = _proximity_windows(patient, staff_track, thresholds.interaction_distance_px)
            for start, end, confidence in windows:
                if end - start < thresholds.min_interaction_seconds:
                    continue
                events.append(
                    MonitoringEvent(
                        event_type="staff_patient_interaction",
                        actor_id=patient.actor_id,
                        start_seconds=start,
                        end_seconds=end,
                        confidence=confidence,
                        severity="info",
                        label="patient/staff interaction window",
                        context={"staff_actor_id": staff_track.actor_id, "staff_id": staff_track.actor_id},
                    )
                )
    return tuple(events)


def _tracks_by_role(tracks: tuple[ActorTrack, ...] | list[ActorTrack], role: ActorRole) -> tuple[ActorTrack, ...]:
    return tuple(track for track in tracks if track.role == role)


def _zone_series(track: ActorTrack, layout: RoomLayout) -> list[tuple[TrackPoint, RoomZone | None]]:
    return [(point, layout.zone_at(point.x, point.y)) for point in sorted(track.points, key=lambda item: item.timestamp_seconds)]


def _append_inactivity_event(
    events: list[MonitoringEvent],
    track: ActorTrack,
    start: TrackPoint,
    end: TrackPoint,
    thresholds: MonitoringThresholds,
) -> None:
    duration = end.timestamp_seconds - start.timestamp_seconds
    if duration < thresholds.inactivity_seconds:
        return
    events.append(
        MonitoringEvent(
            event_type="prolonged_inactivity",
            actor_id=track.actor_id,
            start_seconds=start.timestamp_seconds,
            end_seconds=end.timestamp_seconds,
            confidence=_combined_confidence(track.label_confidence, start.confidence, end.confidence, 0.8),
            severity="warning",
            label="prolonged inactivity candidate",
            context={
                "threshold_seconds": thresholds.inactivity_seconds,
                "movement_threshold_px": thresholds.inactivity_movement_px,
            },
        )
    )


def _height_drop_ratio(previous: TrackPoint, current: TrackPoint) -> float | None:
    if previous.bbox_height is None or previous.bbox_height <= 0 or current.bbox_height is None:
        return None
    return max(0.0, (previous.bbox_height - current.bbox_height) / previous.bbox_height)


def _motion_energy_at(
    motion_signals: dict[str, tuple[float, ...]] | None,
    actor_id: str,
    timestamp_seconds: float,
) -> float | None:
    if motion_signals is None or actor_id not in motion_signals:
        return None
    values = motion_signals[actor_id]
    index = int(round(timestamp_seconds))
    if index < 0 or index >= len(values):
        return None
    return values[index]


def _proximity_windows(
    patient: ActorTrack,
    staff: ActorTrack,
    distance_px: float,
) -> list[tuple[float, float, float]]:
    patient_points = tuple(sorted(patient.points, key=lambda item: item.timestamp_seconds))
    staff_points = tuple(sorted(staff.points, key=lambda item: item.timestamp_seconds))
    common_times = sorted({point.timestamp_seconds for point in patient_points} | {point.timestamp_seconds for point in staff_points})
    windows: list[tuple[float, float, float]] = []
    start: float | None = None
    end: float | None = None
    confidences: list[float] = []
    for timestamp in common_times:
        patient_point = _nearest_point(patient_points, timestamp)
        staff_point = _nearest_point(staff_points, timestamp)
        if patient_point is None or staff_point is None:
            continue
        near = _distance(patient_point, staff_point) <= distance_px
        if near and start is None:
            start = timestamp
            end = timestamp
            confidences = [patient_point.confidence, staff_point.confidence]
        elif near:
            end = timestamp
            confidences.extend((patient_point.confidence, staff_point.confidence))
        elif start is not None and end is not None:
            windows.append((start, end, _average(confidences)))
            start = None
            end = None
            confidences = []
    if start is not None and end is not None:
        windows.append((start, end, _average(confidences)))
    return windows


def _point_in_polygon(x: float, y: float, polygon: tuple[tuple[float, float], ...]) -> bool:
    if len(polygon) < 3:
        return False
    inside = False
    j = len(polygon) - 1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        intersects = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def _near_zone_edge(point: TrackPoint, zone: RoomZone, margin_fraction: float) -> bool:
    if not zone.polygon:
        return False
    xs = [vertex[0] for vertex in zone.polygon]
    ys = [vertex[1] for vertex in zone.polygon]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    margin = max(width, height) * max(0.0, margin_fraction)
    return (
        point.x - min(xs) <= margin
        or max(xs) - point.x <= margin
        or point.y - min(ys) <= margin
        or max(ys) - point.y <= margin
    )


def _nearest_point(points: tuple[TrackPoint, ...], timestamp_seconds: float) -> TrackPoint | None:
    if not points:
        return None
    return min(points, key=lambda point: abs(point.timestamp_seconds - timestamp_seconds))


def _distance(a: TrackPoint, b: TrackPoint) -> float:
    return hypot(a.x - b.x, a.y - b.y)


def _combined_confidence(*values: float) -> float:
    bounded = [max(0.0, min(1.0, value)) for value in values]
    return round(sum(bounded) / len(bounded), 3) if bounded else 0.0


def _average(values: list[float]) -> float:
    return round(sum(values) / len(values), 3) if values else 0.0


__all__ = [
    "ActorTrack",
    "MonitoringEvent",
    "MonitoringThresholds",
    "RoomLayout",
    "RoomZone",
    "TrackPoint",
    "detect_bed_exit_events",
    "detect_fall_like_events",
    "detect_interaction_events",
    "detect_prolonged_inactivity",
    "detect_room_zone_events",
]
