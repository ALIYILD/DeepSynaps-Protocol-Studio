"""
Finger Tapping Analysis Pipeline
=================================
Production-grade extraction of finger tapping features from hand keypoint
time series for decision-support assessment of bradykinesia proxies.

Features (Evidence Grades):
- Taps per 10 seconds         : Grade A (AUC 0.85-0.94)
- Amplitude Decay Ratio       : Grade B
- Inter-Tap Interval CV       : Grade B
- Tapping Regularity Score    : Grade C
- Opening/Closing Velocity    : Grade B

Safe clinical wording is applied throughout; outputs are decision-support only.
"""

import numpy as np
from scipy.signal import find_peaks, butter, filtfilt
from typing import Any

# ---------------------------------------------------------------------------
# Safe clinical wording strings
# ---------------------------------------------------------------------------
_SAFE_WORDING_TAPS = (
    "Finger tapping speed features are the strongest validated single predictor "
    "of bradykinesia (Grade A, AUC 0.85-0.94). Requires clinical confirmation."
)

_SAFE_WORDING_DECAY = (
    "Amplitude decay may support review of motor fatiguing. "
    "Not a standalone diagnosis."
)

_SAFE_WORDING_ITI_CV = (
    "Inter-tap interval variability is a model-assisted observation cue."
)

_SAFE_WORDING_REGULARITY = (
    "Tapping regularity score is a model-assisted rhythm cue with limited "
    "evidence base. Interpret with caution."
)

_SAFE_WORDING_VELOCITY = (
    "Opening/closing velocity is a model-assisted movement speed cue. "
    "Not diagnostic in isolation."
)

# ---------------------------------------------------------------------------
# Helper: low-pass filter for noisy keypoint trajectories
# ---------------------------------------------------------------------------

def _butter_lowpass_filter(signal: np.ndarray, cutoff: float = 6.0, fps: float = 30.0, order: int = 2) -> np.ndarray:
    """Apply zero-phase Butterworth low-pass filter to a 1-D signal.

    Parameters
    ----------
    signal : np.ndarray
        1-D input signal.
    cutoff : float
        Cut-off frequency in Hz (default 6 Hz covers rapid finger motion).
    fps : float
        Sampling rate in frames per second.
    order : int
        Filter order.

    Returns
    -------
    np.ndarray
        Filtered signal (same length as input).
    """
    if fps <= 0 or len(signal) < order * 3:
        return signal

    nyquist = 0.5 * fps
    normal_cutoff = cutoff / nyquist

    # Guard against cutoff at or above Nyquist
    if normal_cutoff >= 1.0:
        normal_cutoff = 0.99
    if normal_cutoff <= 0.0:
        return signal

    b, a = butter(order, normal_cutoff, btype="low", analog=False)
    return filtfilt(b, a, signal)


# ---------------------------------------------------------------------------
# 1. Trajectory extraction
# ---------------------------------------------------------------------------

def extract_finger_trajectory(frames: list, side: str = "right") -> dict:
    """Extract index and thumb (x, y, confidence) trajectories.

    Expects each frame to be a dict with keys such as
    ``right_index``, ``right_thumb``, ``right_wrist`` (or ``left_*``).
    Each keypoint is a dict or list-like with at least ``[x, y, confidence]``.

    Parameters
    ----------
    frames : list
        List of frame dicts from a pose estimator.
    side : str
        "right" or "left".

    Returns
    -------
    dict
        {
            "index":  np.ndarray of shape (N, 3) — (x, y, conf),
            "thumb":  np.ndarray of shape (N, 3) — (x, y, conf),
            "wrist":  np.ndarray of shape (N, 3) — (x, y, conf),
        }
    """
    prefix = side.lower()
    idx_key = f"{prefix}_index"
    thb_key = f"{prefix}_thumb"
    wri_key = f"{prefix}_wrist"

    def _to_vec(frame: dict, key: str) -> np.ndarray:
        kp = frame.get(key)
        if kp is None:
            return np.array([np.nan, np.nan, 0.0])
        if isinstance(kp, dict):
            return np.array([
                float(kp.get("x", np.nan)),
                float(kp.get("y", np.nan)),
                float(kp.get("confidence", kp.get("score", 0.0))),
            ])
        # list / tuple / ndarray
        arr = np.asarray(kp, dtype=float)
        if arr.size >= 3:
            return arr[:3]
        # Pad if short
        padded = np.full(3, np.nan)
        padded[: arr.size] = arr
        padded[2] = 0.0 if arr.size < 3 else padded[2]
        return padded

    index_arr = np.stack([_to_vec(f, idx_key) for f in frames])
    thumb_arr = np.stack([_to_vec(f, thb_key) for f in frames])
    wrist_arr = np.stack([_to_vec(f, wri_key) for f in frames])

    return {"index": index_arr, "thumb": thumb_arr, "wrist": wrist_arr}


# ---------------------------------------------------------------------------
# 2. Distance computation
# ---------------------------------------------------------------------------

def compute_index_thumb_distance(index_pos: np.ndarray, thumb_pos: np.ndarray) -> np.ndarray:
    """Euclidean distance between index and thumb across frames.

    Parameters
    ----------
    index_pos : np.ndarray
        Array of shape (N, 2+) with index finger x, y.
    thumb_pos : np.ndarray
        Array of shape (N, 2+) with thumb x, y.

    Returns
    -------
    np.ndarray
        1-D array of distances (N,).
    """
    dx = index_pos[:, 0] - thumb_pos[:, 0]
    dy = index_pos[:, 1] - thumb_pos[:, 1]
    return np.sqrt(dx ** 2 + dy ** 2)


# ---------------------------------------------------------------------------
# 3. Tap detection
# ---------------------------------------------------------------------------

def detect_taps(distance_signal: np.ndarray, fps: float) -> np.ndarray:
    """Detect tap events via local minima in the index-thumb distance signal.

    A "tap" corresponds to index and thumb touching (distance minimum).
    We invert the distance signal and run ``scipy.signal.find_peaks``.

    Parameters
    ----------
    distance_signal : np.ndarray
        1-D distance time series.
    fps : float
        Frames per second of the capture.

    Returns
    -------
    np.ndarray
        Indices of detected tap frames.
    """
    if distance_signal.size < 10 or fps <= 0:
        return np.array([], dtype=int)

    # Low-pass filter to suppress high-frequency noise
    filtered = _butter_lowpass_filter(distance_signal, cutoff=6.0, fps=fps)

    # Invert so that distance minima become peaks
    inverted = -filtered

    # Minimum peak distance: ~5 frames (roughly 150 ms at 30 fps) to separate taps
    min_peak_distance = max(3, int(round(fps * 0.15)))  # ~150 ms

    # Prominence: at least 10% of the signal range, with a floor
    signal_range = float(np.nanmax(filtered) - np.nanmin(filtered))
    prominence = max(signal_range * 0.05, 1.0)

    peaks, properties = find_peaks(
        inverted,
        distance=min_peak_distance,
        prominence=prominence,
    )

    # Reject taps where the *actual* distance is implausibly large
    # (i.e. the "touch" is just a shallow local dip while fingers remain apart)
    median_dist = float(np.nanmedian(filtered))
    min_dist = float(np.nanmin(filtered))
    touch_threshold = median_dist * 0.6 + min_dist * 0.4  # 60-40 blend

    valid = filtered[peaks] <= touch_threshold
    peaks = peaks[valid]

    return peaks


# ---------------------------------------------------------------------------
# 4. Feature: Taps per 10 seconds
# ---------------------------------------------------------------------------

def compute_taps_per_10s(tap_indices: np.ndarray, fps: float, duration_s: float) -> dict:
    """Compute tapping rate normalized to a 10-second window.

    Parameters
    ----------
    tap_indices : np.ndarray
        Frame indices of detected taps.
    fps : float
        Frames per second.
    duration_s : float
        Actual duration of the analysed segment in seconds.

    Returns
    -------
    dict
        Standardised feature dictionary.
    """
    n_taps = int(len(tap_indices))

    if duration_s <= 0 or n_taps == 0:
        return {
            "value": 0.0,
            "unit": "taps",
            "confidence": 0.0,
            "grade": "A",
            "safe_wording": _SAFE_WORDING_TAPS,
            "note": "No taps detected or invalid duration.",
        }

    rate_per_10s = (n_taps / duration_s) * 10.0

    # Confidence heuristic: more taps -> higher confidence, up to a ceiling
    confidence = min(0.95, 0.5 + 0.05 * n_taps)

    return {
        "value": round(float(rate_per_10s), 2),
        "unit": "taps",
        "confidence": round(float(confidence), 3),
        "grade": "A",
        "safe_wording": _SAFE_WORDING_TAPS,
    }


# ---------------------------------------------------------------------------
# 5. Feature: Amplitude Decay Ratio
# ---------------------------------------------------------------------------

def compute_amplitude_decay(distance_signal: np.ndarray, tap_indices: np.ndarray) -> dict:
    """Ratio of first 5 taps amplitude / last 5 taps amplitude.

    Progressive decrement (fatiguing) typical in PD yields a ratio > 1.

    Parameters
    ----------
    distance_signal : np.ndarray
        1-D distance time series.
    tap_indices : np.ndarray
        Indices of detected taps.

    Returns
    -------
    dict
        Standardised feature dictionary.
    """
    n_taps = int(len(tap_indices))

    if n_taps < 10:
        return {
            "value": np.nan,
            "unit": "ratio",
            "confidence": 0.0,
            "grade": "B",
            "safe_wording": _SAFE_WORDING_DECAY,
            "note": f"Insufficient taps for decay analysis ({n_taps}/10 minimum).",
        }

    # Compute per-tap amplitude as the distance travelled from the preceding
    # local maximum (finger spread) down to the tap minimum.
    def _tap_amplitude(tap_idx: int) -> float:
        # Search backward for the peak (max distance) before this tap
        search_start = max(0, tap_idx - int(len(distance_signal) * 0.1))
        segment = distance_signal[search_start:tap_idx]
        if segment.size == 0:
            return 0.0
        peak_val = float(np.nanmax(segment))
        tap_val = float(distance_signal[tap_idx])
        return max(0.0, peak_val - tap_val)

    amplitudes = np.array([_tap_amplitude(ti) for ti in tap_indices], dtype=float)

    first_5 = amplitudes[:5]
    last_5 = amplitudes[-5:]

    early_mean = float(np.nanmean(first_5))
    late_mean = float(np.nanmean(last_5))

    if late_mean <= 0 or early_mean <= 0:
        return {
            "value": np.nan,
            "unit": "ratio",
            "confidence": 0.0,
            "grade": "B",
            "safe_wording": _SAFE_WORDING_DECAY,
            "note": "Zero or invalid amplitude detected.",
        }

    decay_ratio = early_mean / late_mean

    # Confidence: higher with more taps and cleaner signal
    confidence = min(0.85, 0.6 + 0.02 * n_taps)

    return {
        "value": round(float(decay_ratio), 3),
        "unit": "ratio",
        "confidence": round(float(confidence), 3),
        "grade": "B",
        "safe_wording": _SAFE_WORDING_DECAY,
    }


# ---------------------------------------------------------------------------
# 6. Feature: Inter-Tap Interval CV
# ---------------------------------------------------------------------------

def compute_inter_tap_interval_cv(tap_indices: np.ndarray, fps: float) -> dict:
    """Coefficient of variation (CV = std / mean) of inter-tap intervals.

    Higher CV indicates more irregular tapping rhythm.

    Parameters
    ----------
    tap_indices : np.ndarray
        Frame indices of detected taps.
    fps : float
        Frames per second.

    Returns
    -------
    dict
        Standardised feature dictionary.
    """
    n_taps = int(len(tap_indices))

    if n_taps < 3:
        return {
            "value": np.nan,
            "unit": "ratio",
            "confidence": 0.0,
            "grade": "B",
            "safe_wording": _SAFE_WORDING_ITI_CV,
            "note": f"Insufficient taps for interval CV ({n_taps}/3 minimum).",
        }

    # Inter-tap intervals in seconds
    itis = np.diff(tap_indices) / fps

    if len(itis) == 0:
        return {
            "value": np.nan,
            "unit": "ratio",
            "confidence": 0.0,
            "grade": "B",
            "safe_wording": _SAFE_WORDING_ITI_CV,
            "note": "No inter-tap intervals computed.",
        }

    mean_iti = float(np.nanmean(itis))
    std_iti = float(np.nanstd(itis, ddof=1))

    if mean_iti <= 0:
        return {
            "value": np.nan,
            "unit": "ratio",
            "confidence": 0.0,
            "grade": "B",
            "safe_wording": _SAFE_WORDING_ITI_CV,
            "note": "Zero mean inter-tap interval.",
        }

    cv = std_iti / mean_iti
    confidence = min(0.88, 0.55 + 0.03 * n_taps)

    return {
        "value": round(float(cv), 4),
        "unit": "ratio",
        "confidence": round(float(confidence), 3),
        "grade": "B",
        "safe_wording": _SAFE_WORDING_ITI_CV,
    }


# ---------------------------------------------------------------------------
# 7. Feature: Tapping Regularity Score (autocorrelation-based)
# ---------------------------------------------------------------------------

def compute_regularity_score(distance_signal: np.ndarray, tap_indices: np.ndarray, fps: float) -> dict:
    """Autocorrelation-based regularity score in [0, 1].

    Computes the normalised autocorrelation of the distance signal and
    scores how prominent the peak is at the expected tap period.

    Parameters
    ----------
    distance_signal : np.ndarray
        1-D distance time series.
    tap_indices : np.ndarray
        Indices of detected taps.
    fps : float
        Frames per second.

    Returns
    -------
    dict
        Standardised feature dictionary.
    """
    n_taps = int(len(tap_indices))

    if n_taps < 3 or distance_signal.size < 20:
        return {
            "value": np.nan,
            "unit": "0-1",
            "confidence": 0.0,
            "grade": "C",
            "safe_wording": _SAFE_WORDING_REGULARITY,
            "note": f"Insufficient data for regularity analysis ({n_taps} taps, {distance_signal.size} frames).",
        }

    # Estimate expected tap period from detected taps
    median_iti_frames = float(np.median(np.diff(tap_indices)))
    expected_period = max(3, int(round(median_iti_frames)))

    # Detrend and normalise
    sig = distance_signal - np.nanmean(distance_signal)
    sig = sig / (np.nanstd(sig) + 1e-12)
    sig = np.nan_to_num(sig, nan=0.0)

    # Autocorrelation via FFT (fast, handles long signals)
    n = len(sig)
    sig_padded = np.concatenate([sig, np.zeros(n)])
    fft_sig = np.fft.rfft(sig_padded)
    autocorr = np.fft.irfft(fft_sig * np.conj(fft_sig))
    autocorr = autocorr[:n]

    # Normalise by zero-lag
    if autocorr[0] > 0:
        autocorr = autocorr / autocorr[0]

    # Search window around expected period (+/- 25%)
    search_start = max(1, int(round(expected_period * 0.75)))
    search_end = min(n - 1, int(round(expected_period * 1.25)))

    if search_start >= search_end:
        return {
            "value": np.nan,
            "unit": "0-1",
            "confidence": 0.0,
            "grade": "C",
            "safe_wording": _SAFE_WORDING_REGULARITY,
            "note": "Autocorrelation search window invalid.",
        }

    peak_val = float(np.nanmax(autocorr[search_start:search_end]))

    # Regularity score: scale peak to [0, 1]
    regularity = float(np.clip(peak_val, 0.0, 1.0))

    confidence = min(0.80, 0.50 + 0.02 * n_taps)

    return {
        "value": round(regularity, 4),
        "unit": "0-1",
        "confidence": round(float(confidence), 3),
        "grade": "C",
        "safe_wording": _SAFE_WORDING_REGULARITY,
    }


# ---------------------------------------------------------------------------
# 8. Feature: Opening/Closing Velocity
# ---------------------------------------------------------------------------

def compute_opening_closing_velocity(distance_signal: np.ndarray, fps: float) -> dict:
    """Mean velocity of index-thumb approach (closing) and separation (opening).

    Uses the absolute derivative of the distance signal, averaged over the
    full segment.  Reported in pixels per second.

    Parameters
    ----------
    distance_signal : np.ndarray
        1-D distance time series.
    fps : float
        Frames per second.

    Returns
    -------
    dict
        Standardised feature dictionary.
    """
    if distance_signal.size < 5 or fps <= 0:
        return {
            "value": np.nan,
            "unit": "px/s",
            "confidence": 0.0,
            "grade": "B",
            "safe_wording": _SAFE_WORDING_VELOCITY,
            "note": "Insufficient data for velocity computation.",
        }

    # Smooth before differentiation to avoid noise amplification
    filtered = _butter_lowpass_filter(distance_signal, cutoff=6.0, fps=fps)

    # Central difference derivative (distance change per frame)
    velocity_per_frame = np.gradient(filtered)

    # Convert to px/s
    velocity_px_s = velocity_per_frame * fps

    # Mean absolute velocity (combines opening + closing)
    mean_vel = float(np.nanmean(np.abs(velocity_px_s)))

    # Heuristic confidence based on signal length
    confidence = min(0.82, 0.5 + 0.01 * (len(distance_signal) / fps))

    return {
        "value": round(float(mean_vel), 2),
        "unit": "px/s",
        "confidence": round(float(confidence), 3),
        "grade": "B",
        "safe_wording": _SAFE_WORDING_VELOCITY,
    }


# ---------------------------------------------------------------------------
# 9. Main analysis entry-point
# ---------------------------------------------------------------------------

def analyze_finger_tapping(pose_sequence: dict, side: str = "right") -> dict[str, Any]:
    """Main finger tapping analysis pipeline.

    Parameters
    ----------
    pose_sequence : dict
        Expected structure::

            {
                "frames": [
                    {"right_index": [x, y, conf], "right_thumb": [x, y, conf], ...},
                    ...
                ],
                "fps": 30.0,          # optional, defaults to 30.0
                "duration_s": 10.0,   # optional, inferred from frames if absent
            }

    side : str
        "right" or "left" — which hand to analyse.

    Returns
    -------
    dict[str, Any]
        Full analysis result with all features, safe clinical wording, and
        an overall evidence summary.
    """
    frames = pose_sequence.get("frames", [])
    fps = float(pose_sequence.get("fps", 30.0))
    duration_s = float(pose_sequence.get("duration_s", len(frames) / fps if fps > 0 else 0.0))

    # ------------------------------------------------------------------
    # Edge-case: no frames
    # ------------------------------------------------------------------
    if not frames or fps <= 0:
        return {
            "finger_tap_analysis": {
                "taps_per_10s": {
                    "value": 0.0,
                    "unit": "taps",
                    "confidence": 0.0,
                    "grade": "A",
                    "safe_wording": _SAFE_WORDING_TAPS,
                },
                "amplitude_decay_ratio": {
                    "value": np.nan,
                    "unit": "ratio",
                    "confidence": 0.0,
                    "grade": "B",
                    "safe_wording": _SAFE_WORDING_DECAY,
                },
                "inter_tap_interval_cv": {
                    "value": np.nan,
                    "unit": "ratio",
                    "confidence": 0.0,
                    "grade": "B",
                    "safe_wording": _SAFE_WORDING_ITI_CV,
                },
                "regularity_score": {
                    "value": np.nan,
                    "unit": "0-1",
                    "confidence": 0.0,
                    "grade": "C",
                    "safe_wording": _SAFE_WORDING_REGULARITY,
                },
                "opening_closing_velocity": {
                    "value": np.nan,
                    "unit": "px/s",
                    "confidence": 0.0,
                    "grade": "B",
                    "safe_wording": _SAFE_WORDING_VELOCITY,
                },
            },
            "tap_count": 0,
            "analysis_duration_s": round(float(duration_s), 2),
            "analysis_confidence": 0.0,
            "evidence_summary": (
                "No valid pose data available for finger tapping analysis. "
                "Requires clinical confirmation."
            ),
        }

    # ------------------------------------------------------------------
    # Extract trajectories
    # ------------------------------------------------------------------
    traj = extract_finger_trajectory(frames, side=side)
    index_pos = traj["index"]
    thumb_pos = traj["thumb"]

    # ------------------------------------------------------------------
    # Confidence-weighted quality check
    # ------------------------------------------------------------------
    mean_conf = float(np.nanmean(np.minimum(index_pos[:, 2], thumb_pos[:, 2])))

    # ------------------------------------------------------------------
    # Distance signal
    # ------------------------------------------------------------------
    distance_signal = compute_index_thumb_distance(index_pos, thumb_pos)

    # Fill NaNs via linear interpolation so downstream processing is safe
    nan_mask = np.isnan(distance_signal)
    if nan_mask.any():
        valid_idx = np.where(~nan_mask)[0]
        if len(valid_idx) >= 2:
            distance_signal = np.interp(
                np.arange(len(distance_signal)), valid_idx, distance_signal[valid_idx]
            )
        else:
            distance_signal = np.nan_to_num(distance_signal, nan=np.nanmedian(distance_signal))

    # ------------------------------------------------------------------
    # Detect taps
    # ------------------------------------------------------------------
    tap_indices = detect_taps(distance_signal, fps)
    tap_count = int(len(tap_indices))

    # ------------------------------------------------------------------
    # Compute individual features
    # ------------------------------------------------------------------
    taps_per_10s = compute_taps_per_10s(tap_indices, fps, duration_s)
    amplitude_decay = compute_amplitude_decay(distance_signal, tap_indices)
    iti_cv = compute_inter_tap_interval_cv(tap_indices, fps)
    regularity = compute_regularity_score(distance_signal, tap_indices, fps)
    velocity = compute_opening_closing_velocity(distance_signal, fps)

    # ------------------------------------------------------------------
    # Aggregate confidence
    # ------------------------------------------------------------------
    confidences = [
        taps_per_10s["confidence"],
        amplitude_decay["confidence"],
        iti_cv["confidence"],
        regularity["confidence"],
        velocity["confidence"],
    ]
    # Weight Grade A feature 2x
    weights = [2.0, 1.0, 1.0, 0.5, 1.0]
    valid_confs = [c for c in confidences if not np.isnan(c)]
    valid_weights = [w for c, w in zip(confidences, weights) if not np.isnan(c)]

    if valid_confs and sum(valid_weights) > 0:
        overall_confidence = float(np.average(valid_confs, weights=valid_weights))
    else:
        overall_confidence = 0.0

    # Scale by mean keypoint confidence
    overall_confidence = overall_confidence * mean_conf

    # ------------------------------------------------------------------
    # Evidence summary
    # ------------------------------------------------------------------
    evidence_summary = (
        "Finger tapping speed is the strongest validated single bradykinesia predictor "
        "(Grade A, AUC 0.85-0.94). Normative: 50-70 taps/10s. Values <30 may support "
        "clinician review of bradykinesia. Requires clinical confirmation."
    )

    return {
        "finger_tap_analysis": {
            "taps_per_10s": taps_per_10s,
            "amplitude_decay_ratio": amplitude_decay,
            "inter_tap_interval_cv": iti_cv,
            "regularity_score": regularity,
            "opening_closing_velocity": velocity,
        },
        "tap_count": tap_count,
        "analysis_duration_s": round(float(duration_s), 2),
        "analysis_confidence": round(float(overall_confidence), 3),
        "evidence_summary": evidence_summary,
    }
