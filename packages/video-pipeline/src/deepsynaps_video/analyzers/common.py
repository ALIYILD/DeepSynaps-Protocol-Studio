"""Shared helpers for clinical video task analyzers."""
from __future__ import annotations

from dataclasses import dataclass
from math import hypot
from statistics import mean, pstdev
from typing import Any, Literal

from deepsynaps_video.pose_engine.schemas import JointTrajectory
from deepsynaps_video.schemas import json_ready

SeverityGrade = Literal["none", "mild", "moderate", "severe", "unscored"]
NumericSeverityGrade = Literal[0, 1, 2, 3, 4]


@dataclass(frozen=True)
class SeverityEstimate:
    """Configurable severity estimate derived from descriptive metrics.

    This is intentionally separate from the metric extraction algorithms. It is
    not an official rating-scale score and should be tuned/validated per task,
    camera protocol, and population before clinical use.
    """

    grade: SeverityGrade
    score: float | None
    rationale: tuple[str, ...]
    scale_name: str = "deepsynaps_adjustable_proxy_v1"

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class NumericSeverityEstimate:
    """Adjustable 0-4 severity estimate kept separate from raw metrics."""

    grade: NumericSeverityGrade
    label: str
    rationale: tuple[str, ...]
    scale_name: str = "deepsynaps_adjustable_proxy_v1"

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class SignalPoint:
    """A single timestamped point extracted from a joint trajectory."""

    timestamp_seconds: float
    x: float
    y: float
    z: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class MotionCycle:
    """One detected movement repetition from trough-to-peak-to-trough."""

    start_seconds: float
    peak_seconds: float
    end_seconds: float
    amplitude_units: float

    @property
    def duration_seconds(self) -> float:
        return self.end_seconds - self.start_seconds

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class MotionSignal:
    """One-dimensional motion signal derived from trajectories."""

    name: str
    timestamps: tuple[float, ...]
    values: tuple[float, ...]

    @property
    def duration_seconds(self) -> float | None:
        return signal_duration(self.timestamps)

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


def select_trajectory(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    names: tuple[str, ...],
) -> JointTrajectory | None:
    """Return the first trajectory matching one of ``names``."""

    by_name = {trajectory.joint_name: trajectory for trajectory in trajectories}
    for name in names:
        if name in by_name:
            return by_name[name]
    return None


def valid_points(trajectory: JointTrajectory) -> list[SignalPoint]:
    """Return valid timestamped points from a trajectory."""

    points: list[SignalPoint] = []
    for index, coordinate in enumerate(trajectory.coordinates):
        if coordinate is None or index >= len(trajectory.timestamps_seconds):
            continue
        x, y, z = coordinate
        points.append(SignalPoint(trajectory.timestamps_seconds[index], x, y, z))
    return points


def distance_signal(
    a: JointTrajectory,
    b: JointTrajectory,
) -> tuple[tuple[float, ...], tuple[float, ...]]:
    """Compute Euclidean distance between two trajectories at shared indices."""

    timestamps: list[float] = []
    values: list[float] = []
    frame_count = min(len(a.coordinates), len(b.coordinates), len(a.timestamps_seconds), len(b.timestamps_seconds))
    for index in range(frame_count):
        point_a = a.coordinates[index]
        point_b = b.coordinates[index]
        if point_a is None or point_b is None:
            continue
        ax, ay, az = point_a
        bx, by, bz = point_b
        dz = (az or 0.0) - (bz or 0.0)
        values.append((hypot(ax - bx, ay - by) ** 2 + dz**2) ** 0.5)
        timestamps.append(a.timestamps_seconds[index])
    return tuple(timestamps), tuple(values)


def euclidean_distance_signal(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    joint_a: str,
    joint_b: str,
) -> tuple[tuple[float, ...], tuple[float, ...]] | None:
    """Return distance signal for two named joints, if both are present."""

    first = select_trajectory(trajectories, (joint_a,))
    second = select_trajectory(trajectories, (joint_b,))
    if first is None or second is None:
        return None
    return distance_signal(first, second)


def displacement_signal(
    trajectory: JointTrajectory,
) -> tuple[tuple[float, ...], tuple[float, ...]]:
    """Compute displacement magnitude from the first valid point."""

    points = valid_points(trajectory)
    if not points:
        return (), ()
    origin = points[0]
    timestamps: list[float] = []
    values: list[float] = []
    for point in points:
        values.append(
            (
                hypot(point.x - origin.x, point.y - origin.y) ** 2
                + ((point.z or 0.0) - (origin.z or 0.0)) ** 2
            )
            ** 0.5
        )
        timestamps.append(point.timestamp_seconds)
    return tuple(timestamps), tuple(values)


def axis_signal(
    trajectory: JointTrajectory,
    axis: Literal["x", "y", "z"] = "y",
) -> tuple[tuple[float, ...], tuple[float, ...]]:
    """Extract one coordinate axis as a motion signal."""

    axis_index = {"x": 0, "y": 1, "z": 2}[axis]
    timestamps: list[float] = []
    values: list[float] = []
    for point in valid_points(trajectory):
        coordinate = (point.x, point.y, point.z)[axis_index]
        if coordinate is None:
            continue
        timestamps.append(point.timestamp_seconds)
        values.append(coordinate)
    return tuple(timestamps), tuple(values)


def signal_from_trajectory(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    joint_name: str,
    *,
    axis: Literal["x", "y", "z", "magnitude"] = "y",
) -> tuple[tuple[float, ...], tuple[float, ...]] | None:
    """Return an axis or displacement-magnitude signal for a named joint."""

    trajectory = select_trajectory(trajectories, (joint_name,))
    if trajectory is None:
        return None
    if axis == "magnitude":
        return displacement_signal(trajectory)
    return axis_signal(trajectory, axis=axis)


def extract_motion_signal(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    joint_name: str,
    *,
    axis: Literal["x", "y", "z", "magnitude"] = "y",
) -> MotionSignal | None:
    """Return a named scalar motion signal for tremor/posture analyzers."""

    signal = signal_from_trajectory(trajectories, joint_name, axis=axis)
    if signal is None:
        return None
    timestamps, values = signal
    return MotionSignal(name=f"{joint_name}:{axis}", timestamps=timestamps, values=values)


def local_maxima(values: tuple[float, ...], *, min_prominence: float = 0.0) -> tuple[int, ...]:
    """Return indices of local maxima above a simple prominence threshold."""

    peaks: list[int] = []
    for index in range(1, len(values) - 1):
        value = values[index]
        left = values[index - 1]
        right = values[index + 1]
        if value >= left and value >= right and (value > left or value > right):
            if min(value - left, value - right) >= min_prominence:
                peaks.append(index)
    return tuple(peaks)


def intervals(timestamps: tuple[float, ...], indices: tuple[int, ...]) -> list[float]:
    """Return time intervals between selected sample indices."""

    return [
        timestamps[next_index] - timestamps[prev_index]
        for prev_index, next_index in zip(indices, indices[1:])
        if timestamps[next_index] > timestamps[prev_index]
    ]


def amplitudes_from_peaks(values: tuple[float, ...], peaks: tuple[int, ...]) -> list[float]:
    """Estimate movement amplitudes as peak value minus adjacent trough floor."""

    amplitudes: list[float] = []
    for peak in peaks:
        left = values[peak - 1] if peak > 0 else values[peak]
        right = values[peak + 1] if peak + 1 < len(values) else values[peak]
        amplitudes.append(max(0.0, values[peak] - min(left, right)))
    return amplitudes


def detect_cycles(
    timestamps: tuple[float, ...],
    values: tuple[float, ...],
    *,
    min_prominence: float = 0.0,
) -> tuple[MotionCycle, ...]:
    """Detect simple movement cycles around local maxima.

    This intentionally lightweight detector mirrors VisionMD-style
    start/peak/end extraction, but uses only local extrema and a configurable
    prominence threshold.
    """

    peaks = local_maxima(values, min_prominence=min_prominence)
    cycles: list[MotionCycle] = []
    for peak in peaks:
        if peak <= 0 or peak + 1 >= len(values):
            continue
        start = peak - 1
        end = peak + 1
        amplitude = max(0.0, values[peak] - min(values[start], values[end]))
        cycles.append(
            MotionCycle(
                start_seconds=timestamps[start],
                peak_seconds=timestamps[peak],
                end_seconds=timestamps[end],
                amplitude_units=amplitude,
            )
        )
    return tuple(cycles)


def amplitude_decrement(amplitudes: list[float] | tuple[float, ...]) -> float | None:
    """Return relative drop from early-cycle to late-cycle amplitude."""

    if len(amplitudes) < 2:
        return None
    first = amplitudes[0]
    last = amplitudes[-1]
    if first <= 0:
        return None
    return max(0.0, (first - last) / first)


def speeds_from_signal(
    timestamps: tuple[float, ...],
    values: tuple[float, ...],
) -> list[float]:
    """Return absolute signal speed between consecutive samples."""

    speeds: list[float] = []
    for prev_t, next_t, prev_value, next_value in zip(
        timestamps,
        timestamps[1:],
        values,
        values[1:],
    ):
        dt = next_t - prev_t
        if dt <= 0:
            continue
        speeds.append(abs(next_value - prev_value) / dt)
    return speeds


def mean_or_none(values: list[float] | tuple[float, ...]) -> float | None:
    return mean(values) if values else None


def std_or_none(values: list[float] | tuple[float, ...]) -> float | None:
    return pstdev(values) if len(values) >= 2 else None


def coefficient_of_variation(values: list[float] | tuple[float, ...]) -> float | None:
    avg = mean_or_none(values)
    if avg is None or avg == 0:
        return None
    std = std_or_none(values)
    return None if std is None else abs(std / avg)


def peak_to_peak(values: tuple[float, ...]) -> float | None:
    if not values:
        return None
    return max(values) - min(values)


def sample_rate_hz(timestamps: tuple[float, ...]) -> float | None:
    """Estimate sample rate from timestamp spacing."""

    duration = signal_duration(timestamps)
    if duration is None:
        return None
    return (len(timestamps) - 1) / duration


def dominant_frequency(
    timestamps: tuple[float, ...],
    values: tuple[float, ...],
    *,
    min_frequency_hz: float,
    max_frequency_hz: float,
) -> float | None:
    """Estimate dominant frequency with a small dependency-free DFT scan."""

    rate = sample_rate_hz(timestamps)
    if rate is None or len(values) < 3 or rate < 2.0 * max_frequency_hz:
        return None
    center = mean_or_none(values) or 0.0
    duration = signal_duration(timestamps)
    if duration is None:
        return None
    bin_hz = 1.0 / duration
    best_frequency: float | None = None
    best_power = 0.0
    frequency = max(min_frequency_hz, bin_hz)
    while frequency <= max_frequency_hz + 1e-9:
        cos_sum = 0.0
        sin_sum = 0.0
        for timestamp, value in zip(timestamps, values):
            centered = value - center
            angle = 2.0 * 3.141592653589793 * frequency * timestamp
            cos_sum += centered * __import__("math").cos(angle)
            sin_sum += centered * __import__("math").sin(angle)
        power = cos_sum * cos_sum + sin_sum * sin_sum
        if power > best_power:
            best_power = power
            best_frequency = frequency
        frequency += bin_hz
    return best_frequency


def euclidean_distance(
    a: tuple[float, float],
    b: tuple[float, float],
) -> float:
    """Return 2D Euclidean distance between two points."""

    return hypot(a[0] - b[0], a[1] - b[1])


def path_length(points: list[tuple[float, float]]) -> float | None:
    """Return total 2D path length through ordered points."""

    if len(points) < 2:
        return None
    return sum(euclidean_distance(a, b) for a, b in zip(points, points[1:]))


def signal_amplitude(values: list[float] | tuple[float, ...]) -> float | None:
    """Return peak-to-peak amplitude for a scalar signal."""

    return peak_to_peak(tuple(values))


def amplitude(values: list[float] | tuple[float, ...]) -> float | None:
    """Compatibility alias for scalar peak-to-peak amplitude."""

    return signal_amplitude(values)


def point_at_time(trajectory: JointTrajectory, timestamp_seconds: float) -> SignalPoint | None:
    """Return the trajectory point at an exact timestamp, if present."""

    for point in valid_points(trajectory):
        if point.timestamp_seconds == timestamp_seconds:
            return point
    return None


def signal_duration(timestamps: tuple[float, ...]) -> float | None:
    if len(timestamps) < 2:
        return None
    duration = timestamps[-1] - timestamps[0]
    return duration if duration > 0 else None


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def numeric_grade_from_label(label: str) -> NumericSeverityGrade:
    """Map descriptive labels to a 0-4 proxy grade."""

    mapping: dict[str, NumericSeverityGrade] = {
        "none": 0,
        "none/minimal": 0,
        "mild": 1,
        "moderate": 2,
        "marked": 3,
        "severe": 4,
        "insufficient_data": 4,
        "unrated": 4,
        "unscored": 4,
    }
    return mapping.get(label, 4)


def numeric_grade_label(grade: NumericSeverityGrade) -> str:
    """Return a stable label for a 0-4 proxy severity grade."""

    labels = {0: "none", 1: "mild", 2: "moderate", 3: "marked", 4: "severe"}
    return labels.get(grade, "unscored")
