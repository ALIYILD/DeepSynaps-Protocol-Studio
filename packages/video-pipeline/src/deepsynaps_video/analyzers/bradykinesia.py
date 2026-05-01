"""Clinical bradykinesia task analyzer for structured patient videos.

Inspired by VisionMD-style task analysis, this module converts pose-derived
movement signals into descriptive kinematic features: repetition count,
amplitude, rhythm, decrement, speed, pauses, and a separately configurable
severity grade. It does not compute an official MDS-UPDRS score.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from deepsynaps_video.analyzers.common import (
    MotionCycle,
    NumericSeverityGrade,
    NumericSeverityEstimate,
    coefficient_of_variation,
    detect_cycles,
    displacement_signal,
    distance_signal,
    mean_or_none,
    select_trajectory,
    signal_duration,
    speeds_from_signal,
    numeric_grade_label,
)
from deepsynaps_video.pose_engine.schemas import JointTrajectory
from deepsynaps_video.schemas import json_ready

BradykinesiaTaskType = Literal[
    "finger_tapping",
    "hand_open_close",
    "toe_tapping",
    "leg_agility",
    "pronation_supination",
]


DEFAULT_TASK_JOINTS: dict[BradykinesiaTaskType, tuple[str, str] | tuple[str]] = {
    "finger_tapping": ("thumb_tip", "index_finger_tip"),
    "hand_open_close": ("wrist", "middle_finger_tip"),
    "toe_tapping": ("toe", "ankle"),
    "leg_agility": ("ankle", "hip"),
    "pronation_supination": ("wrist",),
}


@dataclass(frozen=True)
class BradykinesiaMetrics:
    """Descriptive features approximating bradykinesia task performance.

    ``amplitude_decrement_ratio`` captures progressive reduction in movement
    amplitude across repetitions. ``rhythm_cv`` captures cycle-to-cycle timing
    irregularity. ``mean_speed_units_per_second`` is reported in input coordinate
    units per second, typically pixels/second for monocular video.
    """

    task_type: BradykinesiaTaskType
    repetition_count: int
    mean_amplitude_units: float | None
    amplitude_decrement_ratio: float | None
    mean_cycle_duration_seconds: float | None
    rhythm_cv: float | None
    mean_speed_units_per_second: float | None
    max_speed_units_per_second: float | None
    pause_count: int
    confidence: float
    severity_grade: int
    severity_label: str
    cycles: tuple[MotionCycle, ...]
    units: dict[str, str]
    limitations: tuple[str, ...]

    @property
    def mean_amplitude_px(self) -> float | None:
        return self.mean_amplitude_units

    @property
    def mean_speed_px_per_second(self) -> float | None:
        return self.mean_speed_units_per_second

    def to_dict(self) -> dict[str, Any]:
        payload = json_ready(self)
        payload.update(
            {
                "mean_amplitude_px": self.mean_amplitude_px,
                "mean_speed_px_per_second": self.mean_speed_px_per_second,
            }
        )
        return payload

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class BradykinesiaSeverityThresholds:
    """Adjustable thresholds for descriptive severity grading."""

    mild_decrement: float = 0.20
    moderate_decrement: float = 0.40
    severe_decrement: float = 0.60
    mild_rhythm_cv: float = 0.15
    moderate_rhythm_cv: float = 0.30
    severe_rhythm_cv: float = 0.50
    minimum_repetitions: int = 3


def compute_bradykinesia_metrics(
    pose_trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    task_type: BradykinesiaTaskType,
    *,
    primary_joint: str | None = None,
    secondary_joint: str | None = None,
    min_prominence_units: float = 0.0,
    severity_thresholds: BradykinesiaSeverityThresholds | None = None,
) -> BradykinesiaMetrics:
    """Compute VisionMD-inspired kinematic features for repetitive motor tasks.

    The movement signal is either a single joint's trajectory magnitude or the
    distance between two task-specific joints. Peaks and troughs define cycles;
    cycle amplitudes, timing, and speed summarize the task.
    """

    if min_prominence_units < 0:
        raise ValueError("min_prominence_units must be non-negative")
    timestamps, values, signal_name, limitations = _task_signal(
        pose_trajectories,
        task_type,
        primary_joint=primary_joint,
        secondary_joint=secondary_joint,
    )
    cycles = detect_cycles(timestamps, values, min_prominence=min_prominence_units)
    durations = [cycle.duration_seconds for cycle in cycles]
    amplitudes = [cycle.amplitude_units for cycle in cycles]
    speeds = speeds_from_signal(timestamps, values)
    decrement = _task_amplitude_decrement(amplitudes, values)
    rhythm_cv = coefficient_of_variation(durations)
    if rhythm_cv == 0.0:
        rhythm_cv = coefficient_of_variation(amplitudes)
    pauses = _pause_count(durations)
    thresholds = severity_thresholds or BradykinesiaSeverityThresholds()
    severity = map_bradykinesia_severity(
        repetition_count=len(cycles),
        amplitude_decrement_ratio=decrement,
        rhythm_cv=rhythm_cv,
        pause_count=pauses,
        thresholds=thresholds,
    )
    if len(cycles) < thresholds.minimum_repetitions:
        limitations.append("too few movement cycles for stable bradykinesia feature estimates")
    confidence = _confidence(len(cycles), limitations)
    return BradykinesiaMetrics(
        task_type=task_type,
        repetition_count=len(cycles),
        mean_amplitude_units=mean_or_none(amplitudes),
        amplitude_decrement_ratio=decrement,
        mean_cycle_duration_seconds=mean_or_none(durations),
        rhythm_cv=rhythm_cv,
        mean_speed_units_per_second=mean_or_none(speeds),
        max_speed_units_per_second=max(speeds) if speeds else None,
        pause_count=pauses,
        confidence=confidence,
        severity_grade=severity.grade,
        severity_label=severity.label,
        cycles=tuple(cycles),
        units={
            "amplitude": "input coordinate units",
            "speed": "input coordinate units/second",
            "duration": "seconds",
            "signal": signal_name,
        },
        limitations=tuple(limitations),
    )


def map_bradykinesia_severity(
    metrics: BradykinesiaMetrics | None = None,
    *,
    repetition_count: int | None = None,
    amplitude_decrement_ratio: float | None = None,
    rhythm_cv: float | None = None,
    pause_count: int = 0,
    thresholds: BradykinesiaSeverityThresholds | None = None,
) -> NumericSeverityEstimate:
    """Map descriptive bradykinesia features to an adjustable grade.

    The grade is a DeepSynaps proxy for review triage, not an official
    MDS-UPDRS score.
    """

    if metrics is not None:
        repetition_count = metrics.repetition_count
        amplitude_decrement_ratio = metrics.amplitude_decrement_ratio
        rhythm_cv = metrics.rhythm_cv
        pause_count = metrics.pause_count
    if repetition_count is None:
        repetition_count = 0
    thresholds = thresholds or BradykinesiaSeverityThresholds()
    rationale: list[str] = []
    grade: NumericSeverityGrade
    if repetition_count < thresholds.minimum_repetitions:
        grade = 2 if repetition_count == 0 else 1
        rationale.append("insufficient repetitions")
        return NumericSeverityEstimate(grade=grade, label=numeric_grade_label(grade), rationale=tuple(rationale))
    grade = 0
    if amplitude_decrement_ratio is not None:
        rationale.append(f"amplitude decrement={amplitude_decrement_ratio:.3f}")
        if amplitude_decrement_ratio >= thresholds.severe_decrement:
            grade = max(grade, 3)
        elif amplitude_decrement_ratio >= thresholds.moderate_decrement:
            grade = max(grade, 2)
        elif amplitude_decrement_ratio >= thresholds.mild_decrement:
            grade = max(grade, 1)
    if rhythm_cv is not None:
        rationale.append(f"rhythm CV={rhythm_cv:.3f}")
        if rhythm_cv >= thresholds.severe_rhythm_cv:
            grade = max(grade, 3)
        elif rhythm_cv >= thresholds.moderate_rhythm_cv:
            grade = max(grade, 2)
        elif rhythm_cv >= thresholds.mild_rhythm_cv:
            grade = max(grade, 1)
    if pause_count >= 2:
        rationale.append(f"pauses={pause_count}")
        grade = max(grade, 2)
    elif pause_count == 1:
        rationale.append("one pause detected")
        grade = max(grade, 1)
    return NumericSeverityEstimate(grade=grade, label=numeric_grade_label(grade), rationale=tuple(rationale))


def _legacy_map_bradykinesia_severity(
    *,
    repetition_count: int,
    amplitude_decrement_ratio: float | None,
    rhythm_cv: float | None,
    pause_count: int = 0,
    thresholds: BradykinesiaSeverityThresholds | None = None,
) -> tuple[int, str]:
    """Map descriptive bradykinesia features to an adjustable 0-4 grade."""

    thresholds = thresholds or BradykinesiaSeverityThresholds()
    if repetition_count < thresholds.minimum_repetitions:
        return (1 if repetition_count else 0, "insufficient repetitions")
    grade = 0
    if amplitude_decrement_ratio is not None:
        if amplitude_decrement_ratio >= thresholds.severe_decrement:
            grade = max(grade, 3)
        elif amplitude_decrement_ratio >= thresholds.moderate_decrement:
            grade = max(grade, 2)
        elif amplitude_decrement_ratio >= thresholds.mild_decrement:
            grade = max(grade, 1)
    if rhythm_cv is not None:
        if rhythm_cv >= thresholds.severe_rhythm_cv:
            grade = max(grade, 3)
        elif rhythm_cv >= thresholds.moderate_rhythm_cv:
            grade = max(grade, 2)
        elif rhythm_cv >= thresholds.mild_rhythm_cv:
            grade = max(grade, 1)
    if pause_count >= 2:
        grade = max(grade, 2)
    elif pause_count == 1:
        grade = max(grade, 1)
    labels = {0: "none/minimal", 1: "mild", 2: "moderate", 3: "marked", 4: "severe"}
    return grade, labels[grade]


def _task_signal(
    trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory],
    task_type: BradykinesiaTaskType,
    *,
    primary_joint: str | None,
    secondary_joint: str | None,
) -> tuple[tuple[float, ...], tuple[float, ...], str, list[str]]:
    limitations: list[str] = ["2D video-derived movement proxy; not an official rating-scale score"]
    task_joints = DEFAULT_TASK_JOINTS[task_type]
    primary = primary_joint or task_joints[0]
    secondary = secondary_joint or (task_joints[1] if len(task_joints) > 1 else None)
    primary_trajectory = select_trajectory(trajectories, (primary,))
    if primary_trajectory is None:
        fallback = select_trajectory(
            trajectories,
            (
                f"{task_type}_distance",
                f"{task_type}_signal",
                "finger_thumb_distance",
                "hand_open_close_distance",
            ),
        )
        if fallback is not None:
            signal_name = f"precomputed:{fallback.joint_name}"
            timestamps, values = displacement_signal(fallback)
            if signal_duration(timestamps) is None:
                limitations.append("signal duration unavailable or too short")
            return timestamps, values, signal_name, limitations
        limitations.append(f"required joint trajectory missing for {primary}")
        return (), (), f"missing:{primary}", limitations
    if secondary is not None:
        secondary_trajectory = select_trajectory(trajectories, (secondary,))
        signal_name = f"distance:{primary}:{secondary}"
        if secondary_trajectory is None:
            limitations.append(f"required joint trajectory missing for {signal_name}")
            return (), (), signal_name, limitations
        signal = distance_signal(primary_trajectory, secondary_trajectory)
    else:
        signal_name = f"magnitude:{primary}"
        signal = displacement_signal(primary_trajectory)
    timestamps, values = signal
    if signal_duration(timestamps) is None:
        limitations.append("signal duration unavailable or too short")
    return timestamps, values, signal_name, limitations


def _pause_count(durations: list[float]) -> int:
    if len(durations) < 2:
        return 0
    baseline = mean_or_none(durations)
    if baseline is None:
        return 0
    if baseline <= 0:
        return 0
    return sum(1 for duration in durations if duration > baseline * 1.75)


def _task_amplitude_decrement(
    cycle_amplitudes: list[float],
    values: tuple[float, ...],
) -> float | None:
    """Estimate amplitude decrement including final observed movement amplitude."""

    if not cycle_amplitudes:
        return None
    first = cycle_amplitudes[0]
    if first <= 0:
        return None
    last = cycle_amplitudes[-1]
    if values:
        last = min(last, max(0.0, values[-1] - min(values)))
    return max(0.0, (first - last) / first)


def _confidence(repetition_count: int, limitations: list[str]) -> float:
    if repetition_count == 0:
        return 0.0
    base = min(1.0, 0.35 + repetition_count * 0.12)
    penalty = 0.08 * max(0, len(limitations) - 1)
    return max(0.0, round(base - penalty, 3))


__all__ = [
    "BradykinesiaMetrics",
    "BradykinesiaSeverityThresholds",
    "compute_bradykinesia_metrics",
    "map_bradykinesia_severity",
]
