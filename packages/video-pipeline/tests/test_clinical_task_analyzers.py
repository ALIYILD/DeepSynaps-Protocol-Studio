from __future__ import annotations

import math

import pytest

from deepsynaps_video.analyzers.bradykinesia import (
    BradykinesiaMetrics,
    compute_bradykinesia_metrics,
    map_bradykinesia_severity,
)
from deepsynaps_video.analyzers.posture import (
    PosturalStabilityMetrics,
    compute_postural_stability_metrics,
    map_postural_stability_severity,
)
from deepsynaps_video.analyzers.tremor import (
    TremorMetrics,
    compute_tremor_metrics,
    map_tremor_severity,
)
from deepsynaps_video.pose_engine.schemas import JointTrajectory


def _point(x: float, y: float, z: float | None = None) -> tuple[float, float, float | None]:
    return (x, y, z)


def test_bradykinesia_metrics_capture_amplitude_rhythm_decrement_and_speed() -> None:
    timestamps = tuple(index * 0.5 for index in range(10))
    amplitudes = (0.0, 10.0, 0.0, 8.0, 0.0, 6.0, 0.0, 4.0, 0.0, 3.0)
    trajectory = JointTrajectory(
        joint_name="finger_thumb_distance",
        timestamps_seconds=timestamps,
        coordinates=tuple(_point(value, 0.0) for value in amplitudes),
    )

    metrics = compute_bradykinesia_metrics((trajectory,), task_type="finger_tapping")

    assert isinstance(metrics, BradykinesiaMetrics)
    assert metrics.repetition_count == 4
    assert metrics.mean_amplitude_px == pytest.approx(7.0)
    assert metrics.amplitude_decrement_ratio == pytest.approx(0.7)
    assert metrics.mean_speed_px_per_second is not None
    assert metrics.rhythm_cv is not None
    assert metrics.rhythm_cv > 0.0
    assert metrics.severity_grade == map_bradykinesia_severity(metrics).grade
    assert "not an official rating-scale score" in " ".join(metrics.limitations)
    assert metrics.to_json_dict()["task_type"] == "finger_tapping"


def test_bradykinesia_metrics_handles_flat_signal_with_limitations() -> None:
    trajectory = JointTrajectory(
        joint_name="hand_open_close_distance",
        timestamps_seconds=(0.0, 1.0, 2.0, 3.0),
        coordinates=(_point(1.0, 0.0), _point(1.0, 0.0), _point(1.0, 0.0), _point(1.0, 0.0)),
    )

    metrics = compute_bradykinesia_metrics((trajectory,), task_type="hand_open_close")

    assert metrics.repetition_count == 0
    assert metrics.severity_grade >= 2
    assert any("too few movement cycles" in limitation for limitation in metrics.limitations)


def test_tremor_metrics_detect_sinusoidal_frequency_and_amplitude() -> None:
    fps = 30.0
    frequency_hz = 4.0
    timestamps = tuple(index / fps for index in range(90))
    values = tuple(5.0 * math.sin(2.0 * math.pi * frequency_hz * timestamp) for timestamp in timestamps)
    trajectory = JointTrajectory(
        joint_name="right_wrist",
        timestamps_seconds=timestamps,
        coordinates=tuple(_point(value, 0.0) for value in values),
    )

    metrics = compute_tremor_metrics((trajectory,), frequency_band_hz=(3.0, 8.0))

    assert isinstance(metrics, TremorMetrics)
    assert metrics.dominant_frequency_hz == pytest.approx(frequency_hz, abs=0.25)
    assert metrics.peak_to_peak_amplitude_px == pytest.approx(10.0, abs=0.25)
    assert metrics.severity_grade == map_tremor_severity(metrics).grade
    assert metrics.confidence > 0.5


def test_tremor_metrics_flags_low_frame_rate_aliasing_risk() -> None:
    timestamps = tuple(index * 0.2 for index in range(20))
    values = tuple(math.sin(index) for index in range(20))
    trajectory = JointTrajectory(
        joint_name="left_wrist",
        timestamps_seconds=timestamps,
        coordinates=tuple(_point(value, 0.0) for value in values),
    )

    metrics = compute_tremor_metrics((trajectory,), frequency_band_hz=(3.0, 8.0))

    assert metrics.dominant_frequency_hz is None
    assert any("Nyquist" in limitation for limitation in metrics.limitations)


def test_postural_stability_metrics_compute_sway_area_and_path() -> None:
    timestamps = tuple(float(index) for index in range(5))
    center = JointTrajectory(
        joint_name="mid_hip",
        timestamps_seconds=timestamps,
        coordinates=(
            _point(0.0, 0.0),
            _point(1.0, 0.0),
            _point(1.0, 1.0),
            _point(0.0, 1.0),
            _point(0.0, 0.0),
        ),
    )

    metrics = compute_postural_stability_metrics((center,))

    assert isinstance(metrics, PosturalStabilityMetrics)
    assert metrics.sway_path_length_px == pytest.approx(4.0)
    assert metrics.sway_area_px2 == pytest.approx(1.0)
    assert metrics.sway_range_x_px == pytest.approx(1.0)
    assert metrics.sway_range_y_px == pytest.approx(1.0)
    assert metrics.severity_grade == map_postural_stability_severity(metrics).grade


def test_postural_stability_metrics_handles_missing_center_signal() -> None:
    trajectory = JointTrajectory(
        joint_name="left_wrist",
        timestamps_seconds=(0.0, 1.0),
        coordinates=(_point(0.0, 0.0), _point(1.0, 1.0)),
    )

    metrics = compute_postural_stability_metrics((trajectory,))

    assert metrics.sway_path_length_px is None
    assert metrics.severity_grade == 4
    assert any("center-of-body" in limitation for limitation in metrics.limitations)
