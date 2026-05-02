from __future__ import annotations

import pytest

from deepsynaps_video.analyzers.gait import (
    GaitAnnotation,
    compute_gait_events,
    compute_gait_metrics,
    generate_gait_annotations_for_video,
)
from deepsynaps_video.pose_engine.schemas import JointTrajectory
from deepsynaps_video.schemas import VideoMetadata


def _point(x: float, y: float, z: float | None = None) -> tuple[float, float, float | None]:
    return (x, y, z)


def _synthetic_gait_trajectories() -> tuple[JointTrajectory, ...]:
    timestamps = tuple(float(index) for index in range(9))
    left_ankle = JointTrajectory(
        joint_name="left_ankle",
        timestamps_seconds=timestamps,
        coordinates=(
            _point(0.0, 10.0),
            _point(5.0, 6.0),
            _point(10.0, 2.0),
            _point(15.0, 6.0),
            _point(20.0, 10.0),
            _point(25.0, 6.0),
            _point(30.0, 2.0),
            _point(35.0, 6.0),
            _point(40.0, 10.0),
        ),
    )
    right_ankle = JointTrajectory(
        joint_name="right_ankle",
        timestamps_seconds=timestamps,
        coordinates=(
            _point(0.0, 2.0),
            _point(5.0, 6.0),
            _point(10.0, 10.0),
            _point(15.0, 6.0),
            _point(20.0, 2.0),
            _point(25.0, 6.0),
            _point(30.0, 10.0),
            _point(35.0, 6.0),
            _point(40.0, 2.0),
        ),
    )
    mid_hip = JointTrajectory(
        joint_name="mid_hip",
        timestamps_seconds=timestamps,
        coordinates=tuple(_point(index * 5.0, 5.0) for index in range(9)),
    )
    return (left_ankle, right_ankle, mid_hip)


def test_compute_gait_events_detects_alternating_heel_strikes_and_cycles() -> None:
    events = compute_gait_events(_synthetic_gait_trajectories(), min_peak_prominence_px=3.0)

    heel_strikes = [event for event in events if event.event_type == "heel_strike"]
    cycles = [event for event in events if event.event_type == "gait_cycle"]

    assert [(event.side, event.timestamp_seconds) for event in heel_strikes] == [
        ("right", 2.0),
        ("left", 4.0),
        ("right", 6.0),
    ]
    assert len(cycles) == 1
    assert cycles[0].side == "right"
    assert cycles[0].duration_seconds == pytest.approx(4.0)
    assert cycles[0].confidence == pytest.approx(0.8)


def test_compute_gait_metrics_returns_units_and_proxy_limitations() -> None:
    metadata = VideoMetadata(
        duration_seconds=8.0,
        fps=1.0,
        frame_count=9,
        width=640,
        height=480,
    )

    metrics = compute_gait_metrics(
        _synthetic_gait_trajectories(),
        metadata,
        min_peak_prominence_px=3.0,
    )

    assert metrics.cadence_steps_per_min == pytest.approx(22.5)
    assert metrics.walking_speed_px_per_sec == pytest.approx(5.0)
    assert metrics.walking_speed_units == "px/s"
    assert metrics.stride_length_px == pytest.approx(20.0)
    assert metrics.step_time_variability_sec == pytest.approx(0.0)
    assert metrics.asymmetry_index == pytest.approx(0.0)
    assert metrics.event_count == 3
    assert metrics.cycle_count == 1
    assert metrics.limitations
    assert "2D video proxy" in metrics.limitations[0]
    assert metrics.to_json_dict()["cadence_steps_per_min"] == pytest.approx(22.5)


def test_compute_gait_metrics_uses_calibration_when_available() -> None:
    metadata = VideoMetadata(duration_seconds=8.0, fps=1.0, frame_count=9, width=640, height=480)

    metrics = compute_gait_metrics(
        _synthetic_gait_trajectories(),
        metadata,
        pixel_to_meter=0.01,
        min_peak_prominence_px=3.0,
    )

    assert metrics.walking_speed_m_per_sec == pytest.approx(0.05)
    assert metrics.stride_length_m == pytest.approx(0.2)
    assert "calibration" in " ".join(metrics.limitations).lower()


def test_generate_gait_annotations_for_video_labels_segments() -> None:
    annotations = generate_gait_annotations_for_video(
        _synthetic_gait_trajectories(),
        VideoMetadata(duration_seconds=8.0, fps=1.0, frame_count=9, width=640, height=480),
        min_peak_prominence_px=3.0,
    )

    labels = [annotation.label for annotation in annotations]
    assert "R heel strike" in labels
    assert "R gait cycle" in labels
    assert all(isinstance(annotation, GaitAnnotation) for annotation in annotations)
    cycle_annotation = next(annotation for annotation in annotations if annotation.label == "R gait cycle")
    assert cycle_annotation.start_time_seconds == pytest.approx(2.0)
    assert cycle_annotation.end_time_seconds == pytest.approx(6.0)


def test_gait_metrics_handles_missing_foot_trajectories_with_limitations() -> None:
    timestamps = (0.0, 1.0, 2.0)
    trajectories = (
        JointTrajectory(
            joint_name="mid_hip",
            timestamps_seconds=timestamps,
            coordinates=(_point(0.0, 0.0), _point(1.0, 0.0), _point(2.0, 0.0)),
        ),
    )

    metrics = compute_gait_metrics(
        trajectories,
        VideoMetadata(duration_seconds=2.0, fps=1.0, frame_count=3, width=100, height=100),
    )

    assert metrics.event_count == 0
    assert metrics.cadence_steps_per_min is None
    assert any("foot" in limitation.lower() for limitation in metrics.limitations)
