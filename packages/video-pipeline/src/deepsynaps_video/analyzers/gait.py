"""Clinical gait analyzer for DeepSynaps patient video.

The functions in this module consume normalized joint trajectories from the
pose engine and compute transparent gait *proxy* metrics for neurology and
rehabilitation review. They are inspired by visual gait/motion analytics tools
such as VIGMA and gaitXplorer: keep the outputs structured, time-linked, and
easy to plot/review.

This module does not claim instrumented gait-lab equivalence. Without camera
calibration, distances are reported in pixels and speed is a video-plane proxy.
If callers provide a pixel-to-meter calibration, calibrated stride/speed values
are emitted alongside the same quality/limitation fields.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean, pstdev
from typing import Any, Literal, cast

from deepsynaps_video.pose_engine.schemas import JointTrajectory
from deepsynaps_video.schemas import VideoMetadata, json_ready

GaitEventType = Literal["heel_strike", "toe_off", "gait_cycle"]
GaitSide = Literal["left", "right", "unknown"]

LEFT_ANKLE_NAMES = ("left_ankle", "left_heel", "left_foot", "left_toe")
RIGHT_ANKLE_NAMES = ("right_ankle", "right_heel", "right_foot", "right_toe")
LEFT_HIP_NAMES = ("left_hip",)
RIGHT_HIP_NAMES = ("right_hip",)
MIN_EVENT_SEPARATION_SECONDS = 0.25


@dataclass(frozen=True)
class GaitEvent:
    """Detected gait event or cycle interval."""

    event_type: GaitEventType
    side: GaitSide
    timestamp_seconds: float
    frame_number: int | None = None
    confidence: float = 1.0
    start_seconds: float | None = None
    end_seconds: float | None = None
    label: str | None = None

    @property
    def duration_seconds(self) -> float | None:
        """Return interval duration for gait-cycle events."""

        if self.start_seconds is None or self.end_seconds is None:
            return None
        return self.end_seconds - self.start_seconds

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class GaitAnnotation:
    """Time-linked label suitable for overlays or reviewer timelines."""

    start_seconds: float
    end_seconds: float
    label: str
    severity: Literal["info", "warning", "critical"] = "info"
    side: GaitSide = "unknown"
    confidence: float = 1.0
    details: dict[str, Any] = field(default_factory=dict)

    @property
    def start_time_seconds(self) -> float:
        """Compatibility alias for issue-tracker wording."""

        return self.start_seconds

    @property
    def end_time_seconds(self) -> float:
        """Compatibility alias for issue-tracker wording."""

        return self.end_seconds

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class GaitMetrics:
    """Structured gait metrics with units and limitations.

    Pixel-based metrics are valid for within-video/repeat-protocol comparisons.
    Calibrated meters/second values require ``pixel_to_meter_scale``.
    """

    duration_seconds: float | None
    cadence_steps_per_minute: float | None
    step_count: int
    event_count: int
    gait_cycle_count: int
    mean_step_time_seconds: float | None
    step_time_variability_seconds: float | None
    step_time_asymmetry_ratio: float | None
    mean_stride_length_pixels: float | None
    mean_stride_length_meters: float | None
    walking_speed_pixels_per_second: float | None
    walking_speed_meters_per_second: float | None
    left_step_count: int
    right_step_count: int
    left_mean_step_time_seconds: float | None
    right_mean_step_time_seconds: float | None
    confidence: float
    units: dict[str, str]
    limitations: tuple[str, ...]

    @property
    def cadence_steps_per_min(self) -> float | None:
        return self.cadence_steps_per_minute

    @property
    def walking_speed_px_per_sec(self) -> float | None:
        return self.walking_speed_pixels_per_second

    @property
    def walking_speed_m_per_sec(self) -> float | None:
        return self.walking_speed_meters_per_second

    @property
    def walking_speed_units(self) -> str:
        return "m/s" if self.walking_speed_meters_per_second is not None else "px/s"

    @property
    def stride_length_px(self) -> float | None:
        return self.mean_stride_length_pixels

    @property
    def stride_length_m(self) -> float | None:
        return self.mean_stride_length_meters

    @property
    def step_time_variability_sec(self) -> float | None:
        return self.step_time_variability_seconds

    @property
    def asymmetry_index(self) -> float | None:
        return self.step_time_asymmetry_ratio

    @property
    def cycle_count(self) -> int:
        return self.gait_cycle_count

    def to_dict(self) -> dict[str, Any]:
        payload = json_ready(self)
        payload.update(
            {
                "cadence_steps_per_min": self.cadence_steps_per_min,
                "walking_speed_px_per_sec": self.walking_speed_px_per_sec,
                "walking_speed_m_per_sec": self.walking_speed_m_per_sec,
                "walking_speed_units": self.walking_speed_units,
                "stride_length_px": self.stride_length_px,
                "stride_length_m": self.stride_length_m,
                "step_time_variability_sec": self.step_time_variability_sec,
                "asymmetry_index": self.asymmetry_index,
                "cycle_count": self.cycle_count,
            }
        )
        return payload

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


def compute_gait_events(
    pose_trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    *,
    min_event_separation_seconds: float = MIN_EVENT_SEPARATION_SECONDS,
    min_peak_prominence_px: float = 0.0,
) -> tuple[GaitEvent, ...]:
    """Detect heel-strike, toe-off, and gait-cycle proxy events.

    Heel-strike candidates are local maxima in ankle/foot vertical position for
    image coordinates where larger ``y`` is lower in the frame. Toe-off
    candidates are local minima between strikes. This is a pragmatic
    monocular-video proxy, not a force-plate event detector.
    """

    if min_event_separation_seconds <= 0:
        raise ValueError("min_event_separation_seconds must be positive")
    if min_peak_prominence_px < 0:
        raise ValueError("min_peak_prominence_px must be non-negative")

    left = _select_trajectory(pose_trajectories, LEFT_ANKLE_NAMES)
    right = _select_trajectory(pose_trajectories, RIGHT_ANKLE_NAMES)
    events: list[GaitEvent] = []
    for side, trajectory in ((cast(GaitSide, "left"), left), (cast(GaitSide, "right"), right)):
        if trajectory is None:
            continue
        heel_strikes = _local_extrema_events(
            trajectory,
            side=side,
            event_type="heel_strike",
            extrema="max",
            min_separation_seconds=min_event_separation_seconds,
            min_peak_prominence_px=min_peak_prominence_px,
        )
        toe_offs = _local_extrema_events(
            trajectory,
            side=side,
            event_type="toe_off",
            extrema="min",
            min_separation_seconds=min_event_separation_seconds,
            min_peak_prominence_px=min_peak_prominence_px,
        )
        events.extend(heel_strikes)
        events.extend(toe_offs)
        events.extend(_cycle_events(heel_strikes, side=side))

    return tuple(sorted(events, key=lambda event: (event.timestamp_seconds, event.event_type, event.side)))


def compute_gait_metrics(
    pose_trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    video_metadata: VideoMetadata,
    *,
    pixel_to_meter_scale: float | None = None,
    pixel_to_meter: float | None = None,
    min_peak_prominence_px: float = 0.0,
) -> GaitMetrics:
    """Compute gait metrics from pose trajectories and video metadata.

    Metrics include cadence, step timing variability, side asymmetry, stride
    length proxy, and walking speed proxy. ``pixel_to_meter_scale`` converts
    pixel distances to approximate meters when a calibrated scene is available.
    """

    if pixel_to_meter is not None:
        pixel_to_meter_scale = pixel_to_meter
    if pixel_to_meter_scale is not None and pixel_to_meter_scale <= 0:
        raise ValueError("pixel_to_meter_scale must be positive when provided")

    events = compute_gait_events(pose_trajectories, min_peak_prominence_px=min_peak_prominence_px)
    heel_strikes = [event for event in events if event.event_type == "heel_strike"]
    left_strikes = [event for event in heel_strikes if event.side == "left"]
    right_strikes = [event for event in heel_strikes if event.side == "right"]
    cycles = [event for event in events if event.event_type == "gait_cycle"]

    duration = _analysis_duration(pose_trajectories, video_metadata)
    step_intervals = _intervals([event.timestamp_seconds for event in heel_strikes])
    left_intervals = _intervals([event.timestamp_seconds for event in left_strikes])
    right_intervals = _intervals([event.timestamp_seconds for event in right_strikes])
    stride_lengths_px = _stride_lengths_pixels(pose_trajectories, cycles)
    path_length_px = _pelvis_path_length_pixels(pose_trajectories)

    mean_stride_px = _mean_or_none(stride_lengths_px)
    speed_px = path_length_px / duration if path_length_px is not None and duration and duration > 0 else None
    limitations = list(_metric_limitations(pose_trajectories, video_metadata, pixel_to_meter_scale))
    confidence = _metric_confidence(heel_strikes, pose_trajectories, limitations)

    cadence = (len(heel_strikes) / duration * 60.0) if heel_strikes and duration and duration > 0 else None

    same_side_asymmetry = _asymmetry_ratio(_mean_or_none(left_intervals), _mean_or_none(right_intervals))
    alternating_asymmetry = _alternating_step_asymmetry(heel_strikes)

    return GaitMetrics(
        duration_seconds=duration,
        cadence_steps_per_minute=cadence,
        step_count=len(heel_strikes),
        event_count=len(heel_strikes),
        gait_cycle_count=len(cycles),
        mean_step_time_seconds=_mean_or_none(step_intervals),
        step_time_variability_seconds=_std_or_none(step_intervals),
        step_time_asymmetry_ratio=same_side_asymmetry
        if same_side_asymmetry is not None
        else alternating_asymmetry,
        mean_stride_length_pixels=mean_stride_px,
        mean_stride_length_meters=mean_stride_px * pixel_to_meter_scale
        if mean_stride_px is not None and pixel_to_meter_scale is not None
        else None,
        walking_speed_pixels_per_second=speed_px,
        walking_speed_meters_per_second=speed_px * pixel_to_meter_scale
        if speed_px is not None and pixel_to_meter_scale is not None
        else None,
        left_step_count=len(left_strikes),
        right_step_count=len(right_strikes),
        left_mean_step_time_seconds=_mean_or_none(left_intervals),
        right_mean_step_time_seconds=_mean_or_none(right_intervals),
        confidence=confidence,
        units={
            "cadence": "steps/min",
            "time": "seconds",
            "stride_length_pixels": "pixels",
            "stride_length_meters": "meters",
            "speed_pixels": "pixels/second",
            "speed_meters": "meters/second",
        },
        limitations=tuple(limitations),
    )


def generate_gait_annotations_for_video(
    pose_trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    video_metadata: VideoMetadata,
    *,
    min_peak_prominence_px: float = 0.0,
) -> tuple[GaitAnnotation, ...]:
    """Generate event and limitation annotations for video overlays/timelines."""

    events = compute_gait_events(pose_trajectories, min_peak_prominence_px=min_peak_prominence_px)
    metrics = compute_gait_metrics(
        pose_trajectories,
        video_metadata,
        min_peak_prominence_px=min_peak_prominence_px,
    )
    annotations: list[GaitAnnotation] = []
    for event in events:
        if event.event_type == "gait_cycle":
            annotations.append(
                GaitAnnotation(
                    start_seconds=event.start_seconds or event.timestamp_seconds,
                    end_seconds=event.end_seconds or event.timestamp_seconds,
                    label=f"{_side_label(event.side)} gait cycle",
                    severity="info",
                    side=event.side,
                    confidence=event.confidence,
                )
            )
        else:
            annotations.append(
                GaitAnnotation(
                    start_seconds=max(0.0, event.timestamp_seconds - 0.05),
                    end_seconds=event.timestamp_seconds + 0.05,
                    label=f"{_side_label(event.side)} {event.event_type.replace('_', ' ')}",
                    severity="info",
                    side=event.side,
                    confidence=event.confidence,
                )
            )

    if metrics.step_time_asymmetry_ratio is not None and metrics.step_time_asymmetry_ratio > 0.2:
        annotations.append(
            GaitAnnotation(
                start_seconds=0.0,
                end_seconds=metrics.duration_seconds or 0.0,
                label="step timing asymmetry candidate",
                severity="warning",
                confidence=metrics.confidence,
                details={"step_time_asymmetry_ratio": metrics.step_time_asymmetry_ratio},
            )
        )

    for limitation in metrics.limitations:
        annotations.append(
            GaitAnnotation(
                start_seconds=0.0,
                end_seconds=metrics.duration_seconds or 0.0,
                label=limitation,
                severity="warning",
                confidence=1.0,
            )
        )
    return tuple(annotations)


def _select_trajectory(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    names: tuple[str, ...],
) -> JointTrajectory | None:
    by_name = {trajectory.joint_name: trajectory for trajectory in trajectories}
    for name in names:
        if name in by_name:
            return by_name[name]
    return None


def _local_extrema_events(
    trajectory: JointTrajectory,
    *,
    side: GaitSide,
    event_type: Literal["heel_strike", "toe_off"],
    extrema: Literal["min", "max"],
    min_separation_seconds: float,
    min_peak_prominence_px: float,
) -> list[GaitEvent]:
    points = _valid_xy_points(trajectory)
    candidates: list[tuple[int, float, float, float]] = []
    for index in range(1, len(points) - 1):
        prev_y = points[index - 1][2]
        y = points[index][2]
        next_y = points[index + 1][2]
        if extrema == "min" and y <= prev_y and y <= next_y and (y < prev_y or y < next_y):
            prominence = min(prev_y - y, next_y - y)
            if prominence < min_peak_prominence_px:
                continue
            candidates.append((*points[index][:3], _event_confidence(prominence)))
        if extrema == "max" and y >= prev_y and y >= next_y and (y > prev_y or y > next_y):
            prominence = min(y - prev_y, y - next_y)
            if prominence < min_peak_prominence_px:
                continue
            candidates.append((*points[index][:3], _event_confidence(prominence)))

    selected = _enforce_min_separation(candidates, min_separation_seconds)
    return [
        GaitEvent(
            event_type=event_type,
            side=side,
            timestamp_seconds=timestamp,
            frame_number=frame_number,
            confidence=confidence,
            label=f"{side} {event_type.replace('_', ' ')} proxy",
        )
        for frame_number, timestamp, _y, confidence in selected
    ]


def _cycle_events(heel_strikes: list[GaitEvent], *, side: GaitSide) -> list[GaitEvent]:
    cycles: list[GaitEvent] = []
    for first, second in zip(heel_strikes, heel_strikes[1:]):
        cycles.append(
            GaitEvent(
                event_type="gait_cycle",
                side=side,
                timestamp_seconds=first.timestamp_seconds,
                frame_number=first.frame_number,
                confidence=min(first.confidence, second.confidence),
                start_seconds=first.timestamp_seconds,
                end_seconds=second.timestamp_seconds,
                label=f"{side} gait cycle proxy",
            )
        )
    return cycles


def _valid_xy_points(trajectory: JointTrajectory) -> list[tuple[int, float, float, float]]:
    points: list[tuple[int, float, float, float]] = []
    for index, coordinate in enumerate(trajectory.coordinates):
        if coordinate is None:
            continue
        x, y, _z = coordinate
        timestamp = trajectory.timestamps_seconds[index]
        points.append((index, timestamp, y, _confidence_from_coordinate(coordinate)))
    return points


def _confidence_from_coordinate(coordinate: tuple[float, float, float | None]) -> float:
    _ = coordinate
    return 1.0


def _event_confidence(prominence_px: float) -> float:
    return max(0.1, min(1.0, round(prominence_px / 5.0, 3)))


def _side_label(side: GaitSide) -> str:
    if side == "left":
        return "L"
    if side == "right":
        return "R"
    return "Unknown"


def _enforce_min_separation(
    candidates: list[tuple[int, float, float, float]],
    min_separation_seconds: float,
) -> list[tuple[int, float, float, float]]:
    selected: list[tuple[int, float, float, float]] = []
    for candidate in candidates:
        if not selected or candidate[1] - selected[-1][1] >= min_separation_seconds:
            selected.append(candidate)
    return selected


def _intervals(timestamps: list[float]) -> list[float]:
    return [b - a for a, b in zip(timestamps, timestamps[1:]) if b > a]


def _stride_lengths_pixels(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    cycles: list[GaitEvent],
) -> list[float]:
    lengths: list[float] = []
    ankle_by_side = {
        "left": _select_trajectory(trajectories, LEFT_ANKLE_NAMES),
        "right": _select_trajectory(trajectories, RIGHT_ANKLE_NAMES),
    }
    for cycle in cycles:
        trajectory = ankle_by_side.get(cycle.side)
        if trajectory is None or cycle.start_seconds is None or cycle.end_seconds is None:
            continue
        start = _coordinate_at_or_after(trajectory, cycle.start_seconds)
        end = _coordinate_at_or_after(trajectory, cycle.end_seconds)
        if start is None or end is None:
            continue
        lengths.append(abs(end[0] - start[0]))
    return lengths


def _pelvis_path_length_pixels(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
) -> float | None:
    left_hip = _select_trajectory(trajectories, LEFT_HIP_NAMES)
    right_hip = _select_trajectory(trajectories, RIGHT_HIP_NAMES)
    mid_hip = _select_trajectory(trajectories, ("mid_hip", "pelvis", "hip_center"))
    if left_hip is None and right_hip is None:
        if mid_hip is None:
            return None
        centers = [(coordinate[0], coordinate[1]) for coordinate in mid_hip.coordinates if coordinate is not None]
        if len(centers) < 2:
            return None
        return sum(
            abs(next_x - prev_x)
            for (prev_x, _prev_y), (next_x, _next_y) in zip(centers, centers[1:])
        )
    hip_centers: list[tuple[float, float]] = []
    source = left_hip or right_hip
    if source is None:
        return None
    for index, _timestamp in enumerate(source.timestamps_seconds):
        left = _coordinate_at_index(left_hip, index)
        right = _coordinate_at_index(right_hip, index)
        if left is not None and right is not None:
            hip_centers.append(((left[0] + right[0]) / 2.0, (left[1] + right[1]) / 2.0))
        elif left is not None:
            hip_centers.append((left[0], left[1]))
        elif right is not None:
            hip_centers.append((right[0], right[1]))
    if len(hip_centers) < 2:
        return None
    return sum(
        abs(next_x - prev_x)
        for (prev_x, _prev_y), (next_x, _next_y) in zip(hip_centers, hip_centers[1:])
    )


def _coordinate_at_or_after(
    trajectory: JointTrajectory,
    timestamp_seconds: float,
) -> tuple[float, float, float | None] | None:
    for index, timestamp in enumerate(trajectory.timestamps_seconds):
        if timestamp >= timestamp_seconds:
            return trajectory.coordinates[index]
    return None


def _coordinate_at_index(
    trajectory: JointTrajectory | None,
    index: int,
) -> tuple[float, float, float | None] | None:
    if trajectory is None or index >= len(trajectory.coordinates):
        return None
    return trajectory.coordinates[index]


def _analysis_duration(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    video_metadata: VideoMetadata,
) -> float | None:
    if video_metadata.duration_seconds is not None and video_metadata.duration_seconds > 0:
        return video_metadata.duration_seconds
    timestamps = [timestamp for trajectory in trajectories for timestamp in trajectory.timestamps_seconds]
    if not timestamps:
        return None
    return max(timestamps) - min(timestamps)


def _metric_limitations(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    video_metadata: VideoMetadata,
    pixel_to_meter_scale: float | None,
) -> tuple[str, ...]:
    limitations: list[str] = []
    if pixel_to_meter_scale is None:
        limitations.append(
            "2D video proxy metrics: distance and speed are image-plane pixel proxies; "
            "no camera calibration provided"
        )
    else:
        limitations.append(
            "calibration provided; metrics remain monocular video estimates and should be reviewed"
        )
    if video_metadata.fps is not None and video_metadata.fps < 20:
        limitations.append("low frame rate may reduce event timing accuracy")
    if _select_trajectory(trajectories, LEFT_ANKLE_NAMES) is None:
        limitations.append("left ankle/foot trajectory unavailable")
    if _select_trajectory(trajectories, RIGHT_ANKLE_NAMES) is None:
        limitations.append("right ankle/foot trajectory unavailable")
    if _pelvis_path_length_pixels(trajectories) is None:
        limitations.append("pelvis/hip trajectory unavailable; walking speed proxy omitted")
    return tuple(limitations)


def _metric_confidence(
    heel_strikes: list[GaitEvent],
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    limitations: list[str],
) -> float:
    if not heel_strikes:
        return 0.0
    ankle_count = sum(
        1
        for names in (LEFT_ANKLE_NAMES, RIGHT_ANKLE_NAMES)
        if _select_trajectory(trajectories, names) is not None
    )
    base = 0.4 + (0.2 * min(len(heel_strikes), 4)) + (0.1 * ankle_count)
    penalty = 0.1 * len(limitations)
    return max(0.0, min(1.0, round(base - penalty, 3)))


def _mean_or_none(values: list[float]) -> float | None:
    return mean(values) if values else None


def _std_or_none(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    return pstdev(values)


def _asymmetry_ratio(left: float | None, right: float | None) -> float | None:
    if left is None or right is None:
        return None
    denominator = max(abs(left), abs(right))
    if denominator == 0:
        return None
    return abs(left - right) / denominator


def _alternating_step_asymmetry(heel_strikes: list[GaitEvent]) -> float | None:
    intervals = _intervals([event.timestamp_seconds for event in heel_strikes])
    if len(intervals) < 2:
        return None
    odd = intervals[0::2]
    even = intervals[1::2]
    return _asymmetry_ratio(_mean_or_none(odd), _mean_or_none(even))


__all__ = [
    "GaitAnnotation",
    "GaitEvent",
    "GaitMetrics",
    "compute_gait_events",
    "compute_gait_metrics",
    "generate_gait_annotations_for_video",
]
