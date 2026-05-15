"""Gait Analysis Pipeline — stride detection, cadence, variability, arm swing.

Production-grade biomedical signal processing for pose keypoint sequences.
Extracts clinically validated gait features from 33-keypoint MediaPipe BlazePose data.

Decision-support only — all outputs framed with evidence grades and safe wording.

Features (Evidence Grade):
    A — stride_length, cadence, step_time_variability_cv, gait_speed, dual_task_cost
    B — arm_swing_amplitude, asymmetry_index

Meta-analytic validation: gait features AUC 0.91–0.99 for PD diagnosis.
Requires clinical confirmation.

Dependencies: numpy, scipy
"""
from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np
from scipy.signal import butter, filtfilt, find_peaks

_log = logging.getLogger(__name__)

PIPELINE_VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# Calibration / biomechanical defaults
# ---------------------------------------------------------------------------
# Average adult leg length (hip-to-ankle) in metres — used as pixel→m proxy
DEFAULT_LEG_LENGTH_M: float = 0.90

# Minimum confidence threshold for keypoint inclusion
MIN_KP_CONFIDENCE: float = 0.30

# Butterworth 5 Hz low-pass for gait signals (gait band ~0.5–5 Hz)
_GAIT_FILTER_CUTOFF_HZ: float = 5.0
_GAIT_FILTER_ORDER: int = 4

# Minimum number of heel strikes needed for reliable stride metrics
_MIN_HEEL_STRIKES: int = 3

# Minimum frames for analysis
_MIN_FRAMES: int = 30

# Minimum frames for arm swing analysis
_MIN_FRAMES_ARM_SWING: int = 60

# Maximum plausible cadence (steps/min) — flag if exceeded
_MAX_PLAUSIBLE_CADENCE: float = 220.0

# Minimum plausible cadence
_MIN_PLAUSIBLE_CADENCE: float = 20.0

# Typical pixels-per-metre conversion fallback (1080p, ~2m person at mid-frame)
_FALLBACK_PX_PER_M: float = 500.0

# Safe wording templates
_SAFE_WORDING = {
    "stride_length": (
        "Stride length features may support clinician gait assessment. "
        "Not a substitute for instrumented gait analysis."
    ),
    "cadence": (
        "Cadence estimate derived from video pose; may support clinical "
        "observation but requires confirmation with a gait laboratory or wearable."
    ),
    "step_time_variability": (
        "Step time variability (CV) is among the strongest validated gait "
        "predictors for neurodegenerative gait disorders. Decision-support only; "
        "requires clinical correlation."
    ),
    "gait_speed": (
        "Gait speed estimate supports screening-level assessment. "
        "Confirm with clinical gait analysis or timed walking test."
    ),
    "arm_swing": (
        "Arm swing amplitude derived from wrist tracking. Supports observational "
        "assessment; not equivalent to optoelectronic motion capture."
    ),
    "asymmetry": (
        "Asymmetry index compares bilateral gait metrics. May flag unilateral "
        "gait changes; requires clinician interpretation."
    ),
    "dual_task_cost": (
        "Dual-task gait cost reflects cognitive-motor interference. "
        "Strong evidence base (AUC ~0.92); decision-support only."
    ),
}


# ===========================================================================
# Helper utilities
# ===========================================================================


def _butter_lowpass(cutoff: float, fs: float, order: int = 4) -> tuple[np.ndarray, np.ndarray]:
    """Design Butterworth low-pass filter coefficients.

    Args:
        cutoff: Cutoff frequency in Hz.
        fs: Sampling frequency in Hz.
        order: Filter order.

    Returns:
        (b, a) filter coefficients.
    """
    nyquist = 0.5 * fs
    normal_cutoff = cutoff / nyquist
    if normal_cutoff >= 1.0:
        # Cannot filter above Nyquist — return all-pass
        return np.array([1.0]), np.array([1.0])
    if normal_cutoff <= 0.0:
        normal_cutoff = 0.01
    b, a = butter(order, normal_cutoff, btype="low", analog=False)
    return b, a


def _lowpass_filter(signal: np.ndarray, fs: float, cutoff: float = _GAIT_FILTER_CUTOFF_HZ) -> np.ndarray:
    """Apply zero-phase Butterworth low-pass filter to a 1-D signal.

    Args:
        signal: 1-D numpy array.
        fs: Sampling frequency in Hz.
        cutoff: Cutoff frequency in Hz (default 5 Hz for gait band).

    Returns:
        Filtered signal (same length as input).
    """
    if signal.ndim != 1:
        signal = np.ravel(signal)
    if len(signal) < 10:
        return signal.astype(float)
    b, a = _butter_lowpass(cutoff, fs)
    if len(b) == 1 and b[0] == 1.0 and len(a) == 1 and a[0] == 1.0:
        # All-pass fallback
        return signal.astype(float)
    padlen = min(15, len(signal) - 1)
    try:
        filtered = filtfilt(b, a, signal.astype(float), padlen=padlen)
    except Exception:
        _log.warning("filtfilt failed — returning raw signal")
        filtered = signal.astype(float)
    return filtered


def _compute_cv(values: np.ndarray) -> float:
    """Coefficient of variation = std / |mean|.

    Returns 0.0 if mean is zero or array has < 2 elements.
    """
    arr = np.asarray(values, dtype=float)
    arr = arr[np.isfinite(arr)]
    if len(arr) < 2:
        return 0.0
    mean_val = float(np.mean(arr))
    if abs(mean_val) < 1e-12:
        return 0.0
    return float(np.std(arr, ddof=1) / abs(mean_val))


def _interpolate_gaps(traj: np.ndarray, max_gap: int = 5) -> np.ndarray:
    """Linearly interpolate small gaps (NaN runs <= max_gap) in a 1-D trajectory.

    Args:
        traj: 1-D array that may contain NaN.
        max_gap: Maximum gap size to interpolate.

    Returns:
        Interpolated array.
    """
    arr = np.asarray(traj, dtype=float).copy()
    n = len(arr)
    if n == 0:
        return arr

    # Find NaN runs
    nan_mask = np.isnan(arr)
    if not nan_mask.any():
        return arr

    # Simple linear interpolation for all NaN (scipy not needed)
    valid_idx = np.where(~nan_mask)[0]
    if len(valid_idx) == 0:
        return arr  # All NaN — can't interpolate

    # Interpolate interior NaN via linear interpolation
    all_idx = np.arange(n)
    arr[nan_mask] = np.interp(all_idx[nan_mask], valid_idx, arr[valid_idx])
    return arr


# ===========================================================================
# Keypoint extraction
# ===========================================================================


def extract_keypoint_trajectory(
    frames: list[dict],
    keypoint_id: str,
) -> np.ndarray:
    """Extract (N, 3) array of (x, y, confidence) for a keypoint across frames.

    The input *frames* list follows the pose sequence format described in the
    module docstring.  Missing keypoints or low-confidence detections are
    returned as NaN so that downstream functions can interpolate or degrade
    gracefully.

    Args:
        frames: List of frame dicts, each with ``keypoints`` list.
        keypoint_id: Keypoint name (e.g. ``"left_ankle"``).

    Returns:
        (N, 3) float32 array — columns are [x, y, confidence].
        Missing keypoints → NaN in all three columns.
    """
    if not frames:
        return np.empty((0, 3), dtype=np.float32)

    traj = np.full((len(frames), 3), np.nan, dtype=np.float32)
    for i, frame in enumerate(frames):
        kps = frame.get("keypoints", [])
        if not kps:
            continue
        for kp in kps:
            if kp.get("id") == keypoint_id:
                conf = float(kp.get("confidence", 0.0))
                if conf < MIN_KP_CONFIDENCE:
                    break
                traj[i, 0] = float(kp.get("x", np.nan))
                traj[i, 1] = float(kp.get("y", np.nan))
                traj[i, 2] = conf
                break
    return traj


def extract_keypoint_trajectory_by_ids(
    frames: list[dict],
    keypoint_ids: list[str],
) -> dict[str, np.ndarray]:
    """Batch-extract multiple keypoint trajectories.

    Args:
        frames: List of frame dicts.
        keypoint_ids: List of keypoint names to extract.

    Returns:
        Mapping keypoint_id → (N, 3) trajectory array.
    """
    return {kp_id: extract_keypoint_trajectory(frames, kp_id) for kp_id in keypoint_ids}


# ===========================================================================
# Heel-strike detection
# ===========================================================================


def detect_heel_strikes(
    ankle_y: np.ndarray,
    fps: float,
    prominence: float | None = None,
    distance: int | None = None,
) -> np.ndarray:
    """Detect heel-strike indices via local minima in ankle Y trajectory.

    Heel strikes correspond to the lowest vertical position of the foot
    during the gait cycle.  We low-pass filter the Y trajectory at 5 Hz
    (gait band), invert the signal, and use ``scipy.signal.find_peaks``
    to locate the minima.

    Args:
        ankle_y: 1-D array of ankle Y coordinates (normalized 0–1,
                 increasing downward in image coordinates).
        fps: Sampling rate in frames per second.
        prominence: Minimum peak prominence for ``find_peaks``.
                    Auto-estimated from signal std if *None*.
        distance: Minimum sample distance between peaks.
                  Defaults to ~0.3 s at the given *fps*.

    Returns:
        Array of integer indices where heel strikes occur.
    """
    if len(ankle_y) < _MIN_FRAMES:
        return np.array([], dtype=int)

    # Interpolate gaps
    y_clean = _interpolate_gaps(np.asarray(ankle_y, dtype=float))

    # Low-pass filter at 5 Hz
    y_filt = _lowpass_filter(y_clean, fps, cutoff=_GAIT_FILTER_CUTOFF_HZ)

    # Invert to turn minima into peaks
    y_inv = -y_filt

    # Dynamic prominence — at least 20 % of signal std
    if prominence is None:
        sig_std = float(np.std(y_filt))
        prominence = max(sig_std * 0.20, 0.005)

    if distance is None:
        distance = max(int(fps * 0.30), 5)  # min ~300 ms between strikes

    peaks, _ = find_peaks(y_inv, prominence=prominence, distance=distance)
    return peaks.astype(int)


# ===========================================================================
# Stride length
# ===========================================================================


def _estimate_leg_length_px(
    hip_traj: np.ndarray,
    ankle_traj: np.ndarray,
) -> float:
    """Estimate average leg length in pixels (hip → ankle Euclidean distance).

    Args:
        hip_traj: (N, 3) trajectory for hip keypoint.
        ankle_traj: (N, 3) trajectory for ankle keypoint.

    Returns:
        Average leg length in pixels. Falls back to 0.25 (normalised) if
        calculation fails.
    """
    if len(hip_traj) == 0 or len(ankle_traj) == 0:
        return 0.25

    hip_xy = hip_traj[:, :2]
    ankle_xy = ankle_traj[:, :2]

    # Only use frames where both are valid
    valid = np.all(np.isfinite(hip_xy) & np.isfinite(ankle_xy), axis=1)
    if valid.sum() < 5:
        return 0.25

    diffs = hip_xy[valid] - ankle_xy[valid]
    distances = np.sqrt(np.sum(diffs**2, axis=1))
    median_dist = float(np.median(distances))
    if median_dist <= 0 or not np.isfinite(median_dist):
        return 0.25
    return median_dist


def compute_stride_length(
    heel_strike_indices: np.ndarray,
    ankle_positions: np.ndarray,
    leg_length_px: float,
    leg_length_m: float = DEFAULT_LEG_LENGTH_M,
) -> dict[str, Any]:
    """Compute stride length in metres.

    Stride length is the Euclidean distance between consecutive same-side
    heel strikes.  Pixel distances are converted to metres using the
    participant's leg length as a calibration proxy:

        scale_m_per_px = leg_length_m / leg_length_px

    Args:
        heel_strike_indices: Integer indices of detected heel strikes.
        ankle_positions: (N, 2+) array of ankle (x, y) positions.
        leg_length_px: Leg length measured in pixels.
        leg_length_m: Known leg length in metres (default 0.90 m).

    Returns:
        Dict with ``value``, ``unit``, ``confidence``, ``grade``, ``safe_wording``,
        ``n_strides``, ``stride_lengths_px``, ``stride_lengths_m``.
    """
    result: dict[str, Any] = {
        "value": None,
        "unit": "m",
        "confidence": 0.0,
        "grade": "A",
        "safe_wording": _SAFE_WORDING["stride_length"],
        "n_strides": 0,
        "stride_lengths_px": [],
        "stride_lengths_m": [],
    }

    if len(heel_strike_indices) < _MIN_HEEL_STRIKES:
        return result

    positions = ankle_positions[heel_strike_indices, :2]
    if not np.all(np.isfinite(positions)):
        return result

    # Consecutive same-side heel-strike distances
    diffs = np.diff(positions, axis=0)
    stride_lengths_px = np.sqrt(np.sum(diffs**2, axis=1))
    stride_lengths_px = stride_lengths_px[np.isfinite(stride_lengths_px)]

    if len(stride_lengths_px) == 0:
        return result

    # Pixel → metre calibration
    if leg_length_px > 0 and np.isfinite(leg_length_px):
        scale = leg_length_m / leg_length_px
    else:
        scale = 1.0 / _FALLBACK_PX_PER_M

    stride_lengths_m = stride_lengths_px * scale

    result["stride_lengths_px"] = [float(v) for v in stride_lengths_px]
    result["stride_lengths_m"] = [float(v) for v in stride_lengths_m]
    result["n_strides"] = int(len(stride_lengths_m))
    result["value"] = round(float(np.median(stride_lengths_m)), 3)

    # Confidence proportional to number of strides and detection quality
    conf = min(0.95, 0.50 + 0.05 * len(stride_lengths_m))
    result["confidence"] = round(conf, 3)

    return result


# ===========================================================================
# Cadence
# ===========================================================================


def compute_cadence(
    heel_strike_indices: np.ndarray,
    fps: float,
    duration_s: float,
) -> dict[str, Any]:
    """Compute cadence in steps per minute.

    Formula::

        cadence = (num_heel_strikes / 2) / (duration_minutes)

    Each gait cycle contains two heel strikes (one per foot); dividing by 2
    gives the number of steps, then we normalise to one minute.

    Args:
        heel_strike_indices: Indices of detected heel strikes (both limbs
                             may be combined here — the caller should pass
                             total strikes from both feet).
        fps: Sampling rate (frames per second).
        duration_s: Total recording duration in seconds.

    Returns:
        Dict with ``value``, ``unit``, ``confidence``, ``grade``, ``safe_wording``.
    """
    result: dict[str, Any] = {
        "value": None,
        "unit": "steps/min",
        "confidence": 0.0,
        "grade": "A",
        "safe_wording": _SAFE_WORDING["cadence"],
    }

    n_strikes = int(len(heel_strike_indices))
    if n_strikes < 2 or duration_s <= 0:
        return result

    duration_min = duration_s / 60.0
    n_steps = n_strikes / 2.0  # Each gait cycle = 2 heel strikes
    cadence = n_steps / duration_min

    # Plausibility check
    if cadence < _MIN_PLAUSIBLE_CADENCE or cadence > _MAX_PLAUSIBLE_CADENCE:
        _log.warning(
            "Cadence %.1f outside plausible range [%.1f, %.1f] — flagging low confidence",
            cadence,
            _MIN_PLAUSIBLE_CADENCE,
            _MAX_PLAUSIBLE_CADENCE,
        )
        result["confidence"] = 0.30
    else:
        result["confidence"] = round(min(0.95, 0.70 + 0.02 * n_strikes), 3)

    result["value"] = round(float(cadence), 1)
    return result


# ===========================================================================
# Step time variability (CV of inter-stride intervals)
# ===========================================================================


def compute_step_time_variability(
    heel_strike_times_s: np.ndarray,
) -> dict[str, Any]:
    """Compute coefficient of variation (CV) of inter-stride intervals.

    The CV of stride-to-stride timing is the strongest single gait predictor
    for Parkinson's disease diagnosis (meta-analytic AUC 0.91–0.99).

    Args:
        heel_strike_times_s: Monotonically increasing array of heel-strike
                             timestamps in seconds.

    Returns:
        Dict with ``value`` (CV ratio), ``unit``, ``confidence``, ``grade``,
        ``safe_wording``, ``inter_stride_intervals_s``.
    """
    result: dict[str, Any] = {
        "value": None,
        "unit": "ratio",
        "confidence": 0.0,
        "grade": "A",
        "safe_wording": _SAFE_WORDING["step_time_variability"],
        "inter_stride_intervals_s": [],
    }

    times = np.asarray(heel_strike_times_s, dtype=float)
    times = times[np.isfinite(times)]
    if len(times) < _MIN_HEEL_STRIKES:
        return result

    # Inter-stride intervals
    isi = np.diff(times)
    isi = isi[np.isfinite(isi) & (isi > 0)]
    if len(isi) < 2:
        return result

    cv = _compute_cv(isi)

    result["inter_stride_intervals_s"] = [float(v) for v in isi]
    result["value"] = round(float(cv), 4)
    result["confidence"] = round(min(0.95, 0.60 + 0.05 * len(isi)), 3)

    return result


# ===========================================================================
# Gait speed
# ===========================================================================


def compute_gait_speed(
    stride_length_m: float | None,
    cadence_steps_per_min: float | None,
    com_displacement_m: float | None = None,
    duration_s: float | None = None,
) -> dict[str, Any]:
    """Compute gait speed in metres per second.

    Primary method::

        speed = stride_length_m × cadence / 2  [cadence in steps/min → steps/s]

    Fallback method (if stride length unavailable)::

        speed = com_displacement_m / duration_s

    Args:
        stride_length_m: Median stride length in metres.
        cadence_steps_per_min: Cadence in steps per minute.
        com_displacement_m: Centre-of-mass horizontal displacement (optional).
        duration_s: Recording duration in seconds (optional, for fallback).

    Returns:
        Dict with ``value``, ``unit``, ``confidence``, ``grade``, ``safe_wording``,
        ``method``.
    """
    result: dict[str, Any] = {
        "value": None,
        "unit": "m/s",
        "confidence": 0.0,
        "grade": "A",
        "safe_wording": _SAFE_WORDING["gait_speed"],
        "method": None,
    }

    # Primary: stride_length × cadence / 2
    if (
        stride_length_m is not None
        and cadence_steps_per_min is not None
        and stride_length_m > 0
        and cadence_steps_per_min > 0
    ):
        # Convert cadence to steps/s, then speed = stride_len × steps/s / 2
        # Actually: speed (m/s) = stride_length (m) × cadence (steps/min) / 60 / 2
        # Wait — each step covers ~stride_length/2? No.
        # stride_length = distance of one gait cycle (2 steps)
        # speed = stride_length × (cadence/60) / 2  = stride_length × cadence / 120
        speed = stride_length_m * (cadence_steps_per_min / 60.0) / 2.0
        result["value"] = round(float(speed), 3)
        result["confidence"] = round(0.85, 3)
        result["method"] = "stride_length_cadence"
        return result

    # Fallback: COM displacement / time
    if (
        com_displacement_m is not None
        and duration_s is not None
        and duration_s > 0
        and np.isfinite(com_displacement_m)
    ):
        speed = com_displacement_m / duration_s
        result["value"] = round(float(speed), 3)
        result["confidence"] = round(0.60, 3)
        result["method"] = "com_displacement"
        return result

    return result


# ===========================================================================
# Arm swing amplitude
# ===========================================================================


def compute_arm_swing(
    wrist_y: np.ndarray,
    shoulder_y: np.ndarray,
    fps: float,
) -> dict[str, Any]:
    """Compute arm swing amplitude in degrees.

    Tracks wrist Y oscillation relative to the shoulder during gait.
    Peak-to-peak amplitude is converted from normalised coordinates to an
    approximate angular excursion using a simple geometric model:

        angle_pp ≈ arctan(peak_to_peak_dy / typical_arm_length_ratio)

    where *typical_arm_length_ratio* ≈ 0.30 (shoulder-to-wrist ≈ 30 % of
    body height in normalised 0–1 coordinates for a full-frame silhouette).

    Args:
        wrist_y: 1-D array of wrist Y coordinates (normalised 0–1).
        shoulder_y: 1-D array of shoulder Y coordinates (normalised 0–1).
        fps: Sampling rate in Hz.

    Returns:
        Dict with ``value`` (peak-to-peak amplitude in degrees), ``unit``,
        ``confidence``, ``grade``, ``safe_wording``, ``n_cycles``.
    """
    result: dict[str, Any] = {
        "value": None,
        "unit": "degrees",
        "confidence": 0.0,
        "grade": "B",
        "safe_wording": _SAFE_WORDING["arm_swing"],
        "n_cycles": 0,
    }

    if len(wrist_y) < _MIN_FRAMES_ARM_SWING or len(shoulder_y) < _MIN_FRAMES_ARM_SWING:
        return result

    # Relative wrist position w.r.t. shoulder
    rel_y = wrist_y - shoulder_y
    rel_y = _interpolate_gaps(rel_y)
    rel_y = _lowpass_filter(rel_y, fps, cutoff=_GAIT_FILTER_CUTOFF_HZ)

    if not np.all(np.isfinite(rel_y)):
        return result

    # Find peaks and troughs in the oscillation
    # Use prominence based on signal range
    sig_range = float(np.max(rel_y) - np.min(rel_y))
    if sig_range < 1e-6:
        return result

    prominence = sig_range * 0.20
    distance = max(int(fps * 0.25), 5)  # min 250 ms between peaks

    peaks_pos, _ = find_peaks(rel_y, prominence=prominence, distance=distance)
    peaks_neg, _ = find_peaks(-rel_y, prominence=prominence, distance=distance)

    n_cycles = min(len(peaks_pos), len(peaks_neg))
    if n_cycles < 1:
        return result

    # Peak-to-peak amplitude in normalised coordinates
    pos_values = rel_y[peaks_pos]
    neg_values = rel_y[peaks_neg]

    # Match positive and negative peaks pairwise
    amplitudes = []
    for pv in pos_values:
        # Find nearest negative peak
        distances = np.abs(neg_values - pv)
        if len(distances) > 0:
            nv = neg_values[np.argmin(distances)]
            amplitudes.append(abs(pv - nv))

    if not amplitudes:
        return result

    median_amp_norm = float(np.median(amplitudes))

    # Convert normalised amplitude to approximate degrees
    # shoulder-to-wrist ≈ 0.30 in normalised coords (full body)
    # angle ≈ arctan(dy / arm_length) * (180/π)
    arm_length_norm = 0.30
    angle_pp = math.degrees(math.atan(median_amp_norm / arm_length_norm))

    result["value"] = round(angle_pp, 2)
    result["n_cycles"] = int(n_cycles)
    result["confidence"] = round(min(0.90, 0.50 + 0.03 * n_cycles), 3)

    return result


# ===========================================================================
# Asymmetry index
# ===========================================================================


def compute_asymmetry_index(
    left_metric: float | None,
    right_metric: float | None,
) -> dict[str, Any]:
    """Compute asymmetry index between left and right limb metrics.

    Formula::

        AI = |left - right| / ((left + right) / 2) × 100   → returned as ratio

    A value of 0.0 indicates perfect symmetry; higher values indicate
    greater asymmetry.  Typically > 0.10–0.15 is considered clinically
    relevant.

    Args:
        left_metric: Numeric value for the left side (e.g. stride length).
        right_metric: Numeric value for the right side.

    Returns:
        Dict with ``value`` (ratio, 0–1+), ``unit``, ``confidence``, ``grade``,
        ``safe_wording``, ``left``, ``right``.
    """
    result: dict[str, Any] = {
        "value": None,
        "unit": "ratio",
        "confidence": 0.0,
        "grade": "B",
        "safe_wording": _SAFE_WORDING["asymmetry"],
        "left": left_metric,
        "right": right_metric,
    }

    if left_metric is None or right_metric is None:
        return result

    l = float(left_metric)
    r = float(right_metric)

    if l <= 0 or r <= 0:
        return result

    denominator = (l + r) / 2.0
    if denominator <= 0:
        return result

    ai = abs(l - r) / denominator
    # Return as ratio (0–1 scale), not percentage
    result["value"] = round(float(ai), 4)
    result["confidence"] = round(0.75, 3)

    return result


# ===========================================================================
# Dual-task gait cost
# ===========================================================================


def compute_dual_task_cost(
    gait_speed_single_task: float | None,
    gait_speed_dual_task: float | None,
) -> dict[str, Any]:
    """Compute dual-task gait cost (DTC).

    DTC reflects the percentage decrement in gait speed when a concurrent
    cognitive task is performed.  Strongly validated for cognitive-decline
    screening (meta-analytic AUC ~0.923).

    Formula::

        DTC = (single - dual) / single × 100   → returned as ratio

    Args:
        gait_speed_single_task: Gait speed during single-task walking (m/s).
        gait_speed_dual_task: Gait speed during dual-task walking (m/s).

    Returns:
        Dict with ``value`` (ratio), ``unit``, ``confidence``, ``grade``,
        ``safe_wording``.
    """
    result: dict[str, Any] = {
        "value": None,
        "unit": "ratio",
        "confidence": 0.0,
        "grade": "A",
        "safe_wording": _SAFE_WORDING["dual_task_cost"],
    }

    if (
        gait_speed_single_task is None
        or gait_speed_dual_task is None
        or gait_speed_single_task <= 0
    ):
        return result

    st = float(gait_speed_single_task)
    dt = float(gait_speed_dual_task)

    dtc = (st - dt) / st
    result["value"] = round(float(dtc), 4)
    result["confidence"] = round(0.80, 3)

    return result


# ===========================================================================
# Main gait analysis orchestrator
# ===========================================================================


def analyze_gait(
    pose_sequence: dict[str, Any],
    leg_length_m: float = DEFAULT_LEG_LENGTH_M,
    dual_task_speed_m_s: float | None = None,
) -> dict[str, Any]:
    """Run full gait analysis on a pose sequence.

    Extracts all clinically validated gait features from a pose keypoint
    sequence and returns each feature with an evidence grade, confidence
    score, and clinician-safe wording.

    Args:
        pose_sequence: Dict conforming to the pose-sequence schema (see
                       module docstring).  Must contain ``frames`` list and
                       ``summary`` dict with ``fps``.
        leg_length_m: Participant's leg length in metres (default 0.90 m
                      for an average adult).  Used for pixel→metre calibration.
        dual_task_speed_m_s: Optional gait speed during dual-task condition
                             (m/s).  If provided, dual-task cost is computed.

    Returns:
        Nested dict with:

        - ``gait_analysis``: individual feature results
        - ``heel_strike_count``: total detected heel strikes
        - ``analysis_confidence``: overall confidence score
        - ``evidence_summary``: human-readable summary string
        - ``_meta``: pipeline metadata (version, parameters)
    """
    frames: list[dict] = pose_sequence.get("frames", [])
    summary: dict[str, Any] = pose_sequence.get("summary", {})

    fps: float = float(summary.get("fps", 30.0))
    total_frames: int = int(summary.get("total_frames", len(frames)))
    duration_ms: float = float(summary.get("duration_ms", total_frames / fps * 1000))
    duration_s: float = duration_ms / 1000.0

    # ------------------------------------------------------------------
    # Meta
    # ------------------------------------------------------------------
    result: dict[str, Any] = {
        "gait_analysis": {},
        "heel_strike_count": 0,
        "analysis_confidence": 0.0,
        "evidence_summary": (
            "Gait features are the strongest validated video-based movement "
            "biomarkers (Grade A). Meta-analytic AUC 0.91–0.99 for PD diagnosis. "
            "Requires clinical confirmation."
        ),
        "_meta": {
            "pipeline_version": PIPELINE_VERSION,
            "fps": fps,
            "total_frames": total_frames,
            "duration_s": round(duration_s, 3),
            "leg_length_m": leg_length_m,
            "n_frames_analyzed": len(frames),
        },
    }

    # ------------------------------------------------------------------
    # Guard: insufficient frames
    # ------------------------------------------------------------------
    if len(frames) < _MIN_FRAMES:
        _log.warning(
            "Insufficient frames for gait analysis: %d < %d", len(frames), _MIN_FRAMES
        )
        result["gait_analysis"] = _empty_gait_results()
        result["evidence_summary"] += " Insufficient video frames for analysis."
        return result

    # ------------------------------------------------------------------
    # Extract keypoint trajectories
    # ------------------------------------------------------------------
    kp_ids = [
        "left_ankle",
        "right_ankle",
        "left_heel",
        "right_heel",
        "left_hip",
        "right_hip",
        "left_knee",
        "right_knee",
        "left_shoulder",
        "right_shoulder",
        "left_wrist",
        "right_wrist",
        "left_elbow",
        "right_elbow",
    ]
    kps = extract_keypoint_trajectory_by_ids(frames, kp_ids)

    # Convenience aliases
    la = kps["left_ankle"][:, 1]   # Y only
    ra = kps["right_ankle"][:, 1]
    lh = kps["left_hip"][:, :2]
    rh = kps["right_hip"][:, :2]
    lk = kps["left_knee"][:, :2]
    rk = kps["right_knee"][:, :2]
    ls_y = kps["left_shoulder"][:, 1]
    rs_y = kps["right_shoulder"][:, 1]
    lw_y = kps["left_wrist"][:, 1]
    rw_y = kps["right_wrist"][:, 1]
    lh_hip = kps["left_hip"]
    rh_hip = kps["right_hip"]
    la_traj = kps["left_ankle"]
    ra_traj = kps["right_ankle"]

    # ------------------------------------------------------------------
    # Detect heel strikes (both limbs)
    # ------------------------------------------------------------------
    hs_left = detect_heel_strikes(la, fps)
    hs_right = detect_heel_strikes(ra, fps)
    hs_all = np.sort(np.concatenate([hs_left, hs_right])) if (len(hs_left) + len(hs_right)) > 0 else np.array([], dtype=int)

    total_hs = int(len(hs_all))
    result["heel_strike_count"] = total_hs

    # ------------------------------------------------------------------
    # Leg length in pixels (calibration)
    # ------------------------------------------------------------------
    leg_length_px_left = _estimate_leg_length_px(lh_hip, la_traj)
    leg_length_px_right = _estimate_leg_length_px(rh_hip, ra_traj)
    leg_length_px = float(np.mean([leg_length_px_left, leg_length_px_right]))

    # ------------------------------------------------------------------
    # Stride length (per limb)
    # ------------------------------------------------------------------
    stride_left = compute_stride_length(hs_left, la_traj, leg_length_px, leg_length_m)
    stride_right = compute_stride_length(hs_right, ra_traj, leg_length_px, leg_length_m)

    # Combined stride length (median of both sides)
    all_stride_m: list[float] = []
    if stride_left.get("stride_lengths_m"):
        all_stride_m.extend(stride_left["stride_lengths_m"])
    if stride_right.get("stride_lengths_m"):
        all_stride_m.extend(stride_right["stride_lengths_m"])

    stride_combined_val = None
    if all_stride_m:
        stride_combined_val = round(float(np.median(all_stride_m)), 3)

    result["gait_analysis"]["stride_length"] = {
        "value": stride_combined_val,
        "unit": "m",
        "confidence": round(float(np.mean([stride_left.get("confidence", 0.0), stride_right.get("confidence", 0.0)])), 3) if (stride_left.get("confidence") or stride_right.get("confidence")) else 0.0,
        "grade": "A",
        "safe_wording": _SAFE_WORDING["stride_length"],
        "left": {k: v for k, v in stride_left.items() if k not in ("safe_wording", "grade")},
        "right": {k: v for k, v in stride_right.items() if k not in ("safe_wording", "grade")},
    }

    # ------------------------------------------------------------------
    # Cadence
    # ------------------------------------------------------------------
    cadence_result = compute_cadence(hs_all, fps, duration_s)
    result["gait_analysis"]["cadence"] = {
        "value": cadence_result.get("value"),
        "unit": "steps/min",
        "confidence": cadence_result.get("confidence", 0.0),
        "grade": "A",
        "safe_wording": _SAFE_WORDING["cadence"],
    }

    # ------------------------------------------------------------------
    # Step time variability (CV)
    # ------------------------------------------------------------------
    # Compute ISI per limb then average
    isi_left = np.array([], dtype=float)
    isi_right = np.array([], dtype=float)

    if len(hs_left) >= _MIN_HEEL_STRIKES:
        isi_left = np.diff(hs_left) / fps  # convert frames → seconds
    if len(hs_right) >= _MIN_HEEL_STRIKES:
        isi_right = np.diff(hs_right) / fps

    # Combined ISI for overall CV
    all_isi: list[float] = []
    if len(isi_left) >= 2:
        all_isi.extend([float(v) for v in isi_left])
    if len(isi_right) >= 2:
        all_isi.extend([float(v) for v in isi_right])

    stv_result = compute_step_time_variability(np.array(all_isi, dtype=float))
    result["gait_analysis"]["step_time_variability_cv"] = {
        "value": stv_result.get("value"),
        "unit": "ratio",
        "confidence": stv_result.get("confidence", 0.0),
        "grade": "A",
        "safe_wording": _SAFE_WORDING["step_time_variability"],
        "inter_stride_intervals_s": stv_result.get("inter_stride_intervals_s", []),
    }

    # ------------------------------------------------------------------
    # Gait speed
    # ------------------------------------------------------------------
    speed_result = compute_gait_speed(
        stride_length_m=stride_combined_val,
        cadence_steps_per_min=cadence_result.get("value"),
    )
    result["gait_analysis"]["gait_speed"] = {
        "value": speed_result.get("value"),
        "unit": "m/s",
        "confidence": speed_result.get("confidence", 0.0),
        "grade": "A",
        "safe_wording": _SAFE_WORDING["gait_speed"],
        "method": speed_result.get("method"),
    }

    # ------------------------------------------------------------------
    # Arm swing amplitude (both limbs)
    # ------------------------------------------------------------------
    arm_left = compute_arm_swing(lw_y, ls_y, fps)
    arm_right = compute_arm_swing(rw_y, rs_y, fps)

    result["gait_analysis"]["arm_swing_amplitude_left"] = {
        "value": arm_left.get("value"),
        "unit": "degrees",
        "confidence": arm_left.get("confidence", 0.0),
        "grade": "B",
        "safe_wording": _SAFE_WORDING["arm_swing"],
        "n_cycles": arm_left.get("n_cycles", 0),
    }
    result["gait_analysis"]["arm_swing_amplitude_right"] = {
        "value": arm_right.get("value"),
        "unit": "degrees",
        "confidence": arm_right.get("confidence", 0.0),
        "grade": "B",
        "safe_wording": _SAFE_WORDING["arm_swing"],
        "n_cycles": arm_right.get("n_cycles", 0),
    }

    # ------------------------------------------------------------------
    # Asymmetry index
    # ------------------------------------------------------------------
    # Stride length asymmetry
    stride_asym = compute_asymmetry_index(
        stride_left.get("value"), stride_right.get("value")
    )
    # Arm swing asymmetry
    arm_asym = compute_asymmetry_index(
        arm_left.get("value"), arm_right.get("value")
    )

    # Report overall asymmetry (stride length takes priority)
    asym_value = stride_asym.get("value") if stride_asym.get("value") is not None else arm_asym.get("value")
    asym_confidence = max(stride_asym.get("confidence", 0.0), arm_asym.get("confidence", 0.0))

    result["gait_analysis"]["asymmetry_index"] = {
        "value": asym_value,
        "unit": "ratio",
        "confidence": round(asym_confidence, 3),
        "grade": "B",
        "safe_wording": _SAFE_WORDING["asymmetry"],
        "stride_length_asymmetry": {k: v for k, v in stride_asym.items() if k not in ("safe_wording", "grade")},
        "arm_swing_asymmetry": {k: v for k, v in arm_asym.items() if k not in ("safe_wording", "grade")},
    }

    # ------------------------------------------------------------------
    # Dual-task gait cost (optional)
    # ------------------------------------------------------------------
    if dual_task_speed_m_s is not None and speed_result.get("value") is not None:
        dtc_result = compute_dual_task_cost(speed_result["value"], dual_task_speed_m_s)
        result["gait_analysis"]["dual_task_cost"] = {
            "value": dtc_result.get("value"),
            "unit": "ratio",
            "confidence": dtc_result.get("confidence", 0.0),
            "grade": "A",
            "safe_wording": _SAFE_WORDING["dual_task_cost"],
        }

    # ------------------------------------------------------------------
    # Overall analysis confidence
    # ------------------------------------------------------------------
    confidences = []
    for feature in result["gait_analysis"].values():
        if isinstance(feature, dict) and "confidence" in feature:
            confidences.append(feature["confidence"])

    if confidences:
        result["analysis_confidence"] = round(float(np.mean(confidences)), 3)
    else:
        result["analysis_confidence"] = 0.0

    # Flag if too few heel strikes
    if total_hs < 4:
        result["evidence_summary"] += (
            " Low heel-strike count reduces reliability — "
            "consider longer walking recording."
        )

    return result


def _empty_gait_results() -> dict[str, Any]:
    """Return a skeleton gait_analysis dict with all keys set to None."""
    return {
        "stride_length": {
            "value": None,
            "unit": "m",
            "confidence": 0.0,
            "grade": "A",
            "safe_wording": _SAFE_WORDING["stride_length"],
            "left": None,
            "right": None,
        },
        "cadence": {
            "value": None,
            "unit": "steps/min",
            "confidence": 0.0,
            "grade": "A",
            "safe_wording": _SAFE_WORDING["cadence"],
        },
        "step_time_variability_cv": {
            "value": None,
            "unit": "ratio",
            "confidence": 0.0,
            "grade": "A",
            "safe_wording": _SAFE_WORDING["step_time_variability"],
            "inter_stride_intervals_s": [],
        },
        "gait_speed": {
            "value": None,
            "unit": "m/s",
            "confidence": 0.0,
            "grade": "A",
            "safe_wording": _SAFE_WORDING["gait_speed"],
            "method": None,
        },
        "arm_swing_amplitude_left": {
            "value": None,
            "unit": "degrees",
            "confidence": 0.0,
            "grade": "B",
            "safe_wording": _SAFE_WORDING["arm_swing"],
            "n_cycles": 0,
        },
        "arm_swing_amplitude_right": {
            "value": None,
            "unit": "degrees",
            "confidence": 0.0,
            "grade": "B",
            "safe_wording": _SAFE_WORDING["arm_swing"],
            "n_cycles": 0,
        },
        "asymmetry_index": {
            "value": None,
            "unit": "ratio",
            "confidence": 0.0,
            "grade": "B",
            "safe_wording": _SAFE_WORDING["asymmetry"],
            "stride_length_asymmetry": None,
            "arm_swing_asymmetry": None,
        },
    }
