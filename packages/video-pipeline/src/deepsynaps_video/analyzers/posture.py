"""Posture and postural-stability analyzer for structured clinical videos.

This module estimates descriptive posture/sway proxies from pose trajectories:
trunk angle, lateral sway amplitude, sway area, path length, and velocity. These
features approximate components clinicians review during standing posture,
Romberg-like, sit/stand balance, and rehab tasks. They are not diagnostic tests
and should be interpreted with camera-angle and pose-quality context.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import atan2, degrees
from typing import Any, Literal

from deepsynaps_video.analyzers.common import (
    NumericSeverityGrade,
    NumericSeverityEstimate,
    SignalPoint,
    coefficient_of_variation,
    euclidean_distance,
    mean_or_none,
    path_length,
    point_at_time,
    select_trajectory,
    signal_amplitude,
    valid_points,
)
from deepsynaps_video.pose_engine.schemas import JointTrajectory
from deepsynaps_video.schemas import json_ready

PostureTaskType = Literal["standing", "romberg", "sit_to_stand", "rehab_balance"]

SHOULDER_CENTER_NAMES = ("shoulder_center", "mid_shoulder", "neck")
HIP_CENTER_NAMES = ("mid_hip", "pelvis", "hip_center")
LEFT_SHOULDER_NAMES = ("left_shoulder",)
RIGHT_SHOULDER_NAMES = ("right_shoulder",)
LEFT_HIP_NAMES = ("left_hip",)
RIGHT_HIP_NAMES = ("right_hip",)
NOSE_NAMES = ("nose", "head", "head_center")


@dataclass(frozen=True)
class PostureMetrics:
    """Structured postural-stability features.

    ``sway_area_px2`` is a bounding-box area proxy over center-of-mass/pelvis
    motion. ``trunk_angle_degrees`` is relative to vertical image direction and
    therefore camera-angle dependent.
    """

    task_type: PostureTaskType
    duration_seconds: float | None
    sway_amplitude_x_px: float | None
    sway_amplitude_y_px: float | None
    sway_area_px2: float | None
    sway_path_length_px: float | None
    mean_sway_velocity_px_per_sec: float | None
    mean_trunk_angle_degrees: float | None
    trunk_angle_variability_degrees: float | None
    head_drift_px: float | None
    confidence: float
    severity_grade: NumericSeverityGrade
    units: dict[str, str]
    limitations: tuple[str, ...]
    details: dict[str, Any] = field(default_factory=dict)

    @property
    def sway_range_x_px(self) -> float | None:
        return self.sway_amplitude_x_px

    @property
    def sway_range_y_px(self) -> float | None:
        return self.sway_amplitude_y_px

    def to_dict(self) -> dict[str, Any]:
        payload = json_ready(self)
        payload.update(
            {
                "sway_range_x_px": self.sway_range_x_px,
                "sway_range_y_px": self.sway_range_y_px,
            }
        )
        return payload

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


PosturalStabilityMetrics = PostureMetrics


def compute_postural_stability_metrics(
    pose_trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    *,
    task_type: PostureTaskType = "standing",
    severity_thresholds: dict[str, float] | None = None,
) -> PostureMetrics:
    """Compute sway and posture proxies from structured posture-task video.

    The primary sway signal is the pelvis/hip center. If only left/right hips are
    present, their midpoint is used. Trunk angle uses shoulder center to hip
    center. Missing landmarks produce explicit limitations rather than hidden
    fallbacks.
    """

    center_points = _center_points(pose_trajectories)
    trunk_angles = _trunk_angles(pose_trajectories)
    head_points = _signal_points(select_trajectory(pose_trajectories, NOSE_NAMES))
    duration = _duration(center_points or head_points)
    sway_x = signal_amplitude([point.x for point in center_points]) if center_points else None
    sway_y = signal_amplitude([point.y for point in center_points]) if center_points else None
    sway_area = (sway_x * sway_y) if sway_x is not None and sway_y is not None else None
    sway_path = path_length([(point.x, point.y) for point in center_points]) if center_points else None
    velocity = sway_path / duration if sway_path is not None and duration and duration > 0 else None
    head_drift = _head_drift(head_points)
    angle_mean = mean_or_none(trunk_angles)
    angle_cv = coefficient_of_variation(trunk_angles)
    angle_variability = abs(angle_cv * angle_mean) if angle_cv is not None and angle_mean is not None else None
    limitations = _limitations(center_points, trunk_angles, head_points)
    confidence = _confidence(center_points, trunk_angles, limitations)
    severity = map_postural_stability_severity(
        sway_area_px2=sway_area,
        trunk_angle_variability_degrees=angle_variability,
        thresholds=severity_thresholds,
        confidence=confidence,
    )

    return PostureMetrics(
        task_type=task_type,
        duration_seconds=duration,
        sway_amplitude_x_px=sway_x,
        sway_amplitude_y_px=sway_y,
        sway_area_px2=sway_area,
        sway_path_length_px=sway_path,
        mean_sway_velocity_px_per_sec=velocity,
        mean_trunk_angle_degrees=angle_mean,
        trunk_angle_variability_degrees=angle_variability,
        head_drift_px=head_drift,
        confidence=confidence,
        severity_grade=severity.grade,
        units={
            "distance": "pixels",
            "area": "pixels^2",
            "angle": "degrees",
            "velocity": "pixels/second",
        },
        limitations=limitations,
        details={
            "center_point_count": len(center_points),
            "trunk_angle_count": len(trunk_angles),
        },
    )


def analyze_posture_task(
    pose_trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    *,
    task_type: PostureTaskType = "standing",
    severity_thresholds: dict[str, float] | None = None,
) -> PostureMetrics:
    """Compatibility wrapper for planned posture-task API."""

    return compute_postural_stability_metrics(
        pose_trajectories,
        task_type=task_type,
        severity_thresholds=severity_thresholds,
    )


def analyze_sit_to_stand(
    pose_trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    *,
    severity_thresholds: dict[str, float] | None = None,
) -> PostureMetrics:
    """Compatibility wrapper for sit-to-stand posture/mobility task."""

    return compute_postural_stability_metrics(
        pose_trajectories,
        task_type="sit_to_stand",
        severity_thresholds=severity_thresholds,
    )


def map_postural_stability_severity(
    metrics: PostureMetrics | None = None,
    *,
    sway_area_px2: float | None = None,
    trunk_angle_variability_degrees: float | None = None,
    thresholds: dict[str, float] | None = None,
    confidence: float = 1.0,
) -> NumericSeverityEstimate:
    """Map descriptive posture features to an adjustable severity grade."""

    if metrics is not None:
        sway_area_px2 = metrics.sway_area_px2
        trunk_angle_variability_degrees = metrics.trunk_angle_variability_degrees
        confidence = metrics.confidence
    rationale: list[str] = []
    if confidence <= 0 or (sway_area_px2 is None and trunk_angle_variability_degrees is None):
        return NumericSeverityEstimate(grade=4, label="insufficient_data", rationale=("insufficient posture landmarks",))
    limits = {
        "mild_sway_area": 250.0,
        "moderate_sway_area": 900.0,
        "severe_sway_area": 1600.0,
        "mild_angle_var": 3.0,
        "moderate_angle_var": 7.0,
        "severe_angle_var": 12.0,
        **(thresholds or {}),
    }
    sway = sway_area_px2 or 0.0
    angle = trunk_angle_variability_degrees or 0.0
    rationale.extend((f"sway_area_px2={sway:.3f}", f"trunk_angle_variability_degrees={angle:.3f}"))
    if sway >= limits["severe_sway_area"] or angle >= limits["severe_angle_var"]:
        return NumericSeverityEstimate(grade=3, label="severe", rationale=tuple(rationale))
    if sway >= limits["moderate_sway_area"] or angle >= limits["moderate_angle_var"]:
        return NumericSeverityEstimate(grade=2, label="moderate", rationale=tuple(rationale))
    if sway >= limits["mild_sway_area"] or angle >= limits["mild_angle_var"]:
        return NumericSeverityEstimate(grade=1, label="mild", rationale=tuple(rationale))
    return NumericSeverityEstimate(grade=0, label="none", rationale=tuple(rationale))


def _center_points(trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory]) -> list[SignalPoint]:
    direct = _signal_points(select_trajectory(trajectories, HIP_CENTER_NAMES))
    if direct:
        return direct
    left = select_trajectory(trajectories, LEFT_HIP_NAMES)
    right = select_trajectory(trajectories, RIGHT_HIP_NAMES)
    if left is None or right is None:
        return []
    points: list[SignalPoint] = []
    for timestamp in left.timestamps_seconds:
        left_point = point_at_time(left, timestamp)
        right_point = point_at_time(right, timestamp)
        if left_point is None or right_point is None:
            continue
        points.append(
            SignalPoint(
                timestamp_seconds=timestamp,
                x=(left_point.x + right_point.x) / 2.0,
                y=(left_point.y + right_point.y) / 2.0,
                z=None,
            )
        )
    return points


def _trunk_angles(trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory]) -> list[float]:
    shoulder = _signal_points(select_trajectory(trajectories, SHOULDER_CENTER_NAMES))
    hip = _center_points(trajectories)
    if not shoulder or not hip:
        left_shoulder = select_trajectory(trajectories, LEFT_SHOULDER_NAMES)
        right_shoulder = select_trajectory(trajectories, RIGHT_SHOULDER_NAMES)
        if left_shoulder is not None and right_shoulder is not None:
            shoulder = []
            for timestamp in left_shoulder.timestamps_seconds:
                left = point_at_time(left_shoulder, timestamp)
                right = point_at_time(right_shoulder, timestamp)
                if left is not None and right is not None:
                    shoulder.append(
                        SignalPoint(timestamp, (left.x + right.x) / 2.0, (left.y + right.y) / 2.0)
                    )
    if not shoulder or not hip:
        return []
    hip_by_time = {point.timestamp_seconds: point for point in hip}
    angles: list[float] = []
    for shoulder_point in shoulder:
        hip_point = hip_by_time.get(shoulder_point.timestamp_seconds)
        if hip_point is None:
            continue
        dx = shoulder_point.x - hip_point.x
        dy = hip_point.y - shoulder_point.y
        angles.append(abs(degrees(atan2(dx, dy))) if dy != 0 else 90.0)
    return angles


def _signal_points(trajectory: JointTrajectory | None) -> list[SignalPoint]:
    return valid_points(trajectory) if trajectory is not None else []


def _head_drift(points: list[SignalPoint]) -> float | None:
    if len(points) < 2:
        return None
    return euclidean_distance((points[0].x, points[0].y), (points[-1].x, points[-1].y))


def _duration(points: list[SignalPoint]) -> float | None:
    if len(points) < 2:
        return None
    return points[-1].timestamp_seconds - points[0].timestamp_seconds


def _limitations(
    center_points: list[SignalPoint],
    trunk_angles: list[float],
    head_points: list[SignalPoint],
) -> tuple[str, ...]:
    limitations: list[str] = ["2D video posture proxy; camera angle and calibration affect interpretation"]
    if not center_points:
        limitations.append("center-of-body pelvis/hip trajectory unavailable; sway metrics omitted")
    if not trunk_angles:
        limitations.append("shoulder/hip landmarks unavailable; trunk angle omitted")
    if not head_points:
        limitations.append("head/nose trajectory unavailable; head drift omitted")
    return tuple(limitations)


def _confidence(
    center_points: list[SignalPoint],
    trunk_angles: list[float],
    limitations: tuple[str, ...],
) -> float:
    evidence = 0.0
    if center_points:
        evidence += 0.45
    if trunk_angles:
        evidence += 0.35
    evidence += min(len(center_points), 20) / 100.0
    penalty = max(0, len(limitations) - 1) * 0.1
    return max(0.0, min(1.0, round(evidence - penalty, 3)))


__all__ = [
    "PostureMetrics",
    "PosturalStabilityMetrics",
    "analyze_posture_task",
    "analyze_sit_to_stand",
    "compute_postural_stability_metrics",
    "map_postural_stability_severity",
]
