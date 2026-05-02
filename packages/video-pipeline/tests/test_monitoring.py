from __future__ import annotations

import pytest

from deepsynaps_video.analyzers.monitoring import (
    ActorTrack,
    PostureState,
    RoomLayout,
    RoomZone,
    TrackPoint,
    detect_bed_exit_events,
    detect_fall_like_events,
    detect_interaction_events,
    detect_prolonged_inactivity,
    detect_room_zone_events,
)


def _point(t: float, x: float, y: float, *, posture: PostureState = "standing") -> TrackPoint:
    return TrackPoint(timestamp_seconds=t, x=x, y=y, posture=posture, confidence=0.95)


def _patient_track(points: tuple[TrackPoint, ...], actor_id: str = "patient-1") -> ActorTrack:
    return ActorTrack(actor_id=actor_id, role="patient", points=points)


def _layout() -> RoomLayout:
    return RoomLayout(
        zones=(
            RoomZone("bed", "bed", ((0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0))),
            RoomZone("floor", "floor", ((0.0, 4.0), (8.0, 4.0), (8.0, 8.0), (0.0, 8.0))),
            RoomZone("door", "door", ((7.0, 0.0), (9.0, 0.0), (9.0, 3.0), (7.0, 3.0))),
        )
    )


def test_detect_bed_exit_events_emits_edge_stand_and_left_bed() -> None:
    track = _patient_track(
        (
            _point(0.0, 2.0, 2.0, posture="lying"),
            _point(5.0, 3.8, 2.0, posture="sitting"),
            _point(8.0, 4.5, 4.5, posture="standing"),
        )
    )

    events = detect_bed_exit_events((track,), _layout(), edge_margin=0.35)

    assert [event.event_type for event in events] == [
        "bed_edge",
        "standing_from_bed",
        "left_bed_zone",
    ]
    assert events[-1].severity == "warning"
    assert events[-1].context["from_zone"] == "bed"


def test_detect_fall_like_events_uses_drop_and_floor_state() -> None:
    track = _patient_track(
        (
            _point(0.0, 2.0, 1.0, posture="standing"),
            _point(1.0, 2.0, 5.8, posture="falling"),
            _point(3.0, 2.2, 6.0, posture="on_floor"),
        )
    )

    events = detect_fall_like_events((track,), min_vertical_drop=3.0, post_fall_window_seconds=3.0)

    assert len(events) == 1
    assert events[0].event_type == "fall_candidate"
    assert events[0].severity == "critical"
    assert events[0].context["posture"] == "falling"


def test_detect_prolonged_inactivity_detects_stationary_window() -> None:
    track = _patient_track(
        (
            _point(0.0, 1.0, 1.0),
            _point(5.0, 1.1, 1.0),
            _point(10.0, 1.0, 1.05),
            _point(12.0, 3.0, 3.0),
        )
    )

    events = detect_prolonged_inactivity(
        (track,),
        min_duration_seconds=8.0,
        max_motion_distance=0.25,
    )

    assert len(events) == 1
    assert events[0].event_type == "prolonged_inactivity"
    assert events[0].duration_seconds == pytest.approx(10.0)


def test_detect_room_zone_events_detects_crossing_and_restricted_zone() -> None:
    track = _patient_track(
        (
            _point(0.0, 2.0, 2.0),
            _point(4.0, 5.0, 5.0),
            _point(8.0, 8.0, 1.0),
        )
    )

    events = detect_room_zone_events((track,), _layout(), restricted_zone_ids=("door",))

    assert [event.event_type for event in events] == ["room_zone_transition", "room_zone_transition"]
    assert events[-1].severity == "warning"
    assert events[-1].context["to_zone"] == "door"


def test_detect_interaction_events_summarizes_staff_presence() -> None:
    patient = _patient_track(
        (
            _point(0.0, 2.0, 2.0),
            _point(5.0, 2.0, 2.0),
            _point(10.0, 2.0, 2.0),
        )
    )
    staff = ActorTrack(
        actor_id="nurse-1",
        role="staff",
        points=(
            _point(3.0, 2.5, 2.0),
            _point(8.0, 2.8, 2.0),
        ),
    )

    events = detect_interaction_events((patient, staff), proximity_distance=1.0)

    assert len(events) == 1
    assert events[0].event_type == "staff_patient_interaction"
    assert events[0].actor_id == "patient-1"
    assert events[0].context["staff_id"] == "nurse-1"
