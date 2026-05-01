"""Tremor metrics for structured movement-disorder video tasks.

The analyzer estimates descriptive motion features from a one-dimensional
landmark signal: peak-to-peak amplitude, dominant frequency, spectral power,
and frequency variability. It is inspired by clinical rest/postural/kinetic
tremor workflows but does not diagnose tremor syndromes or assign official
rating-scale scores.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import cos, pi, sin, sqrt
from typing import Any, Literal

from deepsynaps_video.analyzers.common import (
    MotionSignal,
    NumericSeverityEstimate,
    amplitude,
    coefficient_of_variation,
    dominant_frequency,
    extract_motion_signal,
    mean_or_none,
    sample_rate_hz,
)
from deepsynaps_video.pose_engine.schemas import JointTrajectory
from deepsynaps_video.schemas import json_ready

TremorTaskType = Literal["rest", "postural", "kinetic", "unknown"]
SeverityGrade = Literal["none", "mild", "moderate", "severe", "unrated"]


@dataclass(frozen=True)
class TremorMetrics:
    """Descriptive tremor features from a visible landmark trajectory."""

    task_type: TremorTaskType
    signal_name: str
    duration_seconds: float | None
    sample_rate_hz: float | None
    peak_to_peak_amplitude_px: float | None
    rms_amplitude_px: float | None
    dominant_frequency_hz: float | None
    frequency_power_px2: float | None
    amplitude_variability: float | None
    confidence: float
    limitations: tuple[str, ...]
    severity_grade: int = 4

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


def compute_tremor_metrics(
    pose_trajectories: tuple[JointTrajectory, ...] | list[JointTrajectory] | MotionSignal,
    *,
    task_type: TremorTaskType = "unknown",
    signal_joint: str = "right_wrist",
    axis: Literal["x", "y", "z", "magnitude"] = "x",
    min_frequency_hz: float = 3.0,
    max_frequency_hz: float = 12.0,
    frequency_band_hz: tuple[float, float] | None = None,
    severity_thresholds_px: tuple[float, float, float] | None = None,
) -> TremorMetrics:
    """Compute video-derived tremor metrics.

    ``dominant_frequency_hz`` approximates the strongest oscillatory component
    in the configured tremor band. Low frame-rate clips are reported with
    explicit limitations because aliasing can make tremor frequency unreliable.
    """

    if frequency_band_hz is not None:
        min_frequency_hz, max_frequency_hz = frequency_band_hz
    if min_frequency_hz <= 0 or max_frequency_hz <= min_frequency_hz:
        raise ValueError("frequency band must be positive and increasing")

    signal = _coerce_motion_signal(pose_trajectories, signal_joint=signal_joint, axis=axis)
    duration = signal.duration_seconds
    rate = sample_rate_hz(signal.timestamps)
    amp = amplitude(signal.values)
    rms = _rms_centered(signal.values)
    dominant = dominant_frequency(signal.timestamps, signal.values, min_frequency_hz=min_frequency_hz, max_frequency_hz=max_frequency_hz)
    power = _band_power(signal.timestamps, signal.values, dominant) if dominant is not None else None
    center = mean_or_none(signal.values)
    variability = (
        coefficient_of_variation([abs(value - center) for value in signal.values])
        if signal.values and center is not None
        else None
    )
    limitations = list(_limitations(signal, rate, min_frequency_hz, max_frequency_hz))
    confidence = _confidence(signal, dominant, limitations)
    return TremorMetrics(
        task_type=task_type,
        signal_name=signal.name,
        duration_seconds=duration,
        sample_rate_hz=rate,
        peak_to_peak_amplitude_px=amp,
        rms_amplitude_px=rms,
        dominant_frequency_hz=dominant,
        frequency_power_px2=power,
        amplitude_variability=variability,
        confidence=confidence,
        limitations=tuple(limitations),
        severity_grade=map_tremor_severity(amp, thresholds_px=severity_thresholds_px).grade,
    )


def map_tremor_severity(
    metrics_or_amplitude: TremorMetrics | float | None,
    *,
    thresholds_px: tuple[float, float, float] | None = None,
) -> NumericSeverityEstimate:
    """Map tremor amplitude to an adjustable descriptive grade."""

    peak_to_peak_amplitude_px = (
        metrics_or_amplitude.peak_to_peak_amplitude_px
        if isinstance(metrics_or_amplitude, TremorMetrics)
        else metrics_or_amplitude
    )
    if peak_to_peak_amplitude_px is None:
        return NumericSeverityEstimate(grade=4, label="unrated", rationale=("amplitude unavailable",))
    mild, moderate, severe = thresholds_px or (2.0, 8.0, 16.0)
    if peak_to_peak_amplitude_px < mild:
        return NumericSeverityEstimate(grade=0, label="none", rationale=("amplitude below mild threshold",))
    if peak_to_peak_amplitude_px < moderate:
        return NumericSeverityEstimate(grade=1, label="mild", rationale=("amplitude exceeds mild threshold",))
    if peak_to_peak_amplitude_px < severe:
        return NumericSeverityEstimate(grade=2, label="moderate", rationale=("amplitude exceeds moderate threshold",))
    return NumericSeverityEstimate(grade=3, label="severe", rationale=("amplitude exceeds severe threshold",))


def _coerce_motion_signal(
    source: tuple[JointTrajectory, ...] | list[JointTrajectory] | MotionSignal,
    *,
    signal_joint: str,
    axis: Literal["x", "y", "z", "magnitude"],
) -> MotionSignal:
    if isinstance(source, MotionSignal):
        return source
    signal = extract_motion_signal(source, signal_joint, axis=axis)
    if signal is not None:
        return signal
    fallback = source[0] if source else None
    if fallback is None:
        return MotionSignal(name=f"missing:{signal_joint}", timestamps=(), values=())
    fallback_signal = extract_motion_signal(source, fallback.joint_name, axis=axis)
    if fallback_signal is None:
        return MotionSignal(name=f"missing:{signal_joint}", timestamps=(), values=())
    return MotionSignal(
        name=f"{fallback_signal.name}:fallback_for:{signal_joint}",
        timestamps=fallback_signal.timestamps,
        values=fallback_signal.values,
    )


def _rms_centered(values: tuple[float, ...]) -> float | None:
    center = mean_or_none(values)
    if center is None:
        return None
    return sqrt(sum((value - center) ** 2 for value in values) / len(values))


def _band_power(timestamps: tuple[float, ...], values: tuple[float, ...], frequency_hz: float | None) -> float | None:
    if frequency_hz is None or len(values) < 3:
        return None
    center = mean_or_none(values) or 0.0
    cos_sum = 0.0
    sin_sum = 0.0
    for timestamp, value in zip(timestamps, values):
        centered = value - center
        angle = 2.0 * pi * frequency_hz * timestamp
        cos_sum += centered * cos(angle)
        sin_sum += centered * sin(angle)
    scale = 2.0 / len(values)
    return (scale * cos_sum) ** 2 + (scale * sin_sum) ** 2


def _limitations(
    signal: MotionSignal,
    rate: float | None,
    min_frequency_hz: float,
    max_frequency_hz: float,
) -> tuple[str, ...]:
    limitations: list[str] = []
    if len(signal.values) < 5:
        limitations.append("short signal limits tremor frequency confidence")
    if rate is None:
        limitations.append("sample rate unavailable")
    elif rate < 2.0 * max_frequency_hz:
        limitations.append("frame rate below Nyquist threshold for configured tremor band; aliasing risk")
    if amplitude(signal.values) in (None, 0.0):
        limitations.append("no visible oscillatory motion in selected landmark signal")
    if min_frequency_hz < 3.0 or max_frequency_hz > 12.0:
        limitations.append("frequency band differs from common clinical tremor screening range")
    return tuple(limitations)


def _confidence(signal: MotionSignal, dominant: float | None, limitations: list[str]) -> float:
    if not signal.values:
        return 0.0
    base = 0.4 + min(0.4, len(signal.values) / 50.0)
    if dominant is not None:
        base += 0.2
    return max(0.0, min(1.0, round(base - 0.1 * len(limitations), 3)))


__all__ = [
    "TremorMetrics",
    "compute_tremor_metrics",
    "map_tremor_severity",
]
