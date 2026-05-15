"""Tremor Analysis Pipeline — wrist tremor quantification from pose keypoints.

Extracts dominant frequency, band powers, tremor amplitude, signal-to-noise ratio,
and harmonic ratio from wrist position time series (MediaPipe BlazePose keypoints).
Decision-support only: all outputs are model-assisted observation cues that
require clinician review. Camera artifacts may mimic tremor.

Evidence Grades
---------------
- Grade B (dominant frequency, band power 4-6 Hz, band power 8-12 Hz):
  Contactless measurement ICC 0.82-0.91 vs accelerometry.
- Grade C (tremor amplitude, SNR, harmonic ratio):
  Derived metrics with lower validation evidence.

Tremor Classification
---------------------
- 4-6 Hz  -> parkinsonian-type (rest tremor band)
- 8-12 Hz -> essential/postural-type (action tremor band)
- < 2 Hz  -> no detectable tremor / voluntary movement
- other   -> unclassified / atypical

INPUT
-----
pose_sequence: dict with keys:
    - "frames": list[dict] where each dict has:
        - "keypoints": dict[str, list[float]] mapping keypoint name -> [x, y, confidence]
        - e.g. {"left_wrist": [0.5, 0.6, 0.92], "right_wrist": [0.45, 0.55, 0.88], ...}
    - "fps": float (frames per second)
    - "duration_sec": float (optional, total recording duration)
    - "source": str (optional, e.g. "mediapipe", "movenet")

OUTPUT
------
Dict with tremor_analysis features, classification, confidence, and evidence summary.
All values include evidence grades and safe clinical wording.

Example:
    result = analyze_tremor(pose_sequence, side="right")
    # result["tremor_analysis"]["dominant_frequency"]["value"] -> 5.2  (Hz)
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from scipy.fft import rfft, rfftfreq
from scipy.signal import butter, filtfilt, find_peaks, welch

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Tremor-relevant frequency bands (Hz)
PD_BAND: tuple[float, float] = (4.0, 6.0)          # Parkinsonian rest tremor
ET_BAND: tuple[float, float] = (8.0, 12.0)         # Essential / postural tremor
ANALYSIS_BAND: tuple[float, float] = (2.0, 15.0)    # Bandpass filter range
PEAK_SEARCH_BAND: tuple[float, float] = (2.0, 15.0)  # Range for dominant peak search

# Minimum requirements
MIN_DURATION_SEC: float = 3.0        # Need at least 3 seconds for reliable freq estimate
MIN_FRAMES: int = 30                 # Minimum number of frames
MIN_CONFIDENCE: float = 0.3          # Keypoint confidence threshold

# ICC and confidence metadata (from literature)
ICC_DOMINANT_FREQUENCY: float = 0.87  # ICC range 0.82-0.91, midpoint
ICC_BAND_POWER: float = 0.82          # Conservative ICC for band power

# Safe clinical wording templates
SAFE_WORDING_DOMINANT_FREQ = (
    "Tremor frequency features are model-assisted observation cues. "
    "Camera artifacts may mimic tremor -- requires clinician review."
)
SAFE_WORDING_PD_BAND = (
    "4-6 Hz band power may support review of parkinsonian-type tremor. "
    "Not a standalone diagnosis."
)
SAFE_WORDING_ET_BAND = (
    "8-12 Hz band power may support review of essential/postural tremor. "
    "Clinical correlation required."
)
SAFE_WORDING_AMPLITUDE = (
    "Tremor amplitude is a derived displacement metric in pixel units. "
    "Requires calibration for physical distance. Camera motion may confound."
)
SAFE_WORDING_SNR = (
    "Signal-to-noise ratio estimates tremor prominence relative to background. "
    "Low values suggest weak or absent tremor signal."
)
SAFE_WORDING_HARMONIC = (
    "Harmonic ratio characterizes waveform shape; higher values suggest "
    "non-sinusoidal tremor. Experimental feature -- interpret with caution."
)

# Evidence grade labels
GRADE_B: str = "B"
GRADE_C: str = "C"


# ---------------------------------------------------------------------------
# Signal extraction
# ---------------------------------------------------------------------------


def extract_wrist_trajectory(
    frames: list[dict[str, Any]],
    side: str = "right",
) -> np.ndarray:
    """Extract wrist (x, y, confidence) trajectory from pose frames.

    Args:
        frames: List of frame dicts, each with a "keypoints" dict mapping
                keypoint name -> [x, y, confidence].
        side: "left" or "right" wrist to extract.

    Returns:
        Array of shape (N, 3) with columns [x, y, confidence], or (0, 3) if
        no valid keypoints are found.
    """
    keypoint_name = f"{side}_wrist"
    trajectory: list[list[float]] = []

    for frame in frames:
        keypoints = frame.get("keypoints", {})
        if keypoint_name in keypoints:
            kp = keypoints[keypoint_name]
            if isinstance(kp, (list, tuple, np.ndarray)) and len(kp) >= 3:
                trajectory.append([float(kp[0]), float(kp[1]), float(kp[2])])
            elif isinstance(kp, dict):
                # Alternative format: {"x": 0.5, "y": 0.6, "confidence": 0.9}
                x = float(kp.get("x", kp.get(0, 0.0)))
                y = float(kp.get("y", kp.get(1, 0.0)))
                c = float(kp.get("confidence", kp.get("score", kp.get(2, 0.0))))
                trajectory.append([x, y, c])
        else:
            # Append NaN placeholder for missing keypoint
            trajectory.append([np.nan, np.nan, 0.0])

    if not trajectory:
        return np.empty((0, 3))

    return np.array(trajectory, dtype=np.float64)


def _interpolate_missing(trajectory: np.ndarray) -> np.ndarray:
    """Linearly interpolate missing (NaN) x/y values in trajectory.

    Args:
        trajectory: Array of shape (N, 3) with possible NaN values.

    Returns:
        Interpolated array of same shape.
    """
    result = trajectory.copy()
    n_frames = result.shape[0]

    for col in range(2):  # x and y only
        vals = result[:, col]
        nan_mask = np.isnan(vals)
        if nan_mask.all():
            _log.warning("All values are NaN in trajectory column %d", col)
            continue
        if nan_mask.any():
            valid_idx = np.where(~nan_mask)[0]
            valid_vals = vals[valid_idx]
            # Linear interpolation
            interp_vals = np.interp(
                np.arange(n_frames), valid_idx, valid_vals
            )
            result[:, col] = interp_vals

    return result


def _compute_1d_displacement_signal(trajectory: np.ndarray) -> np.ndarray:
    """Convert 2D wrist trajectory to 1D displacement signal.

    Projects the 2D movement onto its principal component (PCA) to produce
    a signed 1D oscillation signal. This preserves the sinusoidal nature of
    tremor oscillations, unlike Euclidean distance which rectifies the signal
    and doubles the apparent frequency.

    Args:
        trajectory: Array of shape (N, 3) with [x, y, confidence].

    Returns:
        1D array of signed displacement projections, shape (N,).
    """
    xy = trajectory[:, :2]
    mean_pos = np.nanmean(xy, axis=0)
    centered = xy - mean_pos

    # PCA: project onto first principal component to get signed 1D signal
    # This preserves oscillatory sign information (positive/negative swings)
    cov = np.cov(centered.T)
    if cov.ndim < 2 or cov.shape[0] < 2:
        # Fallback: use Euclidean distance if PCA fails
        return np.sqrt(np.nansum(centered ** 2, axis=1))

    eigvals, eigvecs = np.linalg.eigh(cov)
    pc1 = eigvecs[:, np.argmax(eigvals)]  # First principal component
    displacements = centered @ pc1  # Signed projection onto PC1

    return displacements


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------


def _butter_bandpass(
    lowcut: float,
    highcut: float,
    fs: float,
    order: int = 4,
) -> tuple[np.ndarray, np.ndarray]:
    """Design Butterworth bandpass filter.

    Args:
        lowcut: Lower cutoff frequency (Hz).
        highcut: Upper cutoff frequency (Hz).
        fs: Sampling frequency (Hz).
        order: Filter order.

    Returns:
        (b, a) filter coefficients.
    """
    nyquist = 0.5 * fs
    low = max(lowcut, 0.1) / nyquist   # avoid 0
    high = min(highcut, nyquist - 0.1) / nyquist
    b, a = butter(order, [low, high], btype="band")
    return b, a


def _apply_bandpass_filter(
    signal: np.ndarray,
    fs: float,
    band: tuple[float, float] = ANALYSIS_BAND,
) -> np.ndarray:
    """Apply zero-phase bandpass filter to signal.

    Args:
        signal: Input 1D signal.
        fs: Sampling frequency (Hz).
        band: (low, high) cutoff frequencies.

    Returns:
        Filtered signal of same length.
    """
    if len(signal) < 10:
        return signal.copy()

    # Remove DC offset before filtering
    signal_detrended = signal - np.nanmean(signal)

    b, a = _butter_bandpass(band[0], band[1], fs)
    try:
        filtered = filtfilt(b, a, signal_detrended, method="gust")
    except Exception:
        # Fallback if Gustafsson method fails
        try:
            filtered = filtfilt(b, a, signal_detrended)
        except Exception:
            _log.warning("Bandpass filtering failed; returning detrended signal")
            filtered = signal_detrended

    return filtered


# ---------------------------------------------------------------------------
# Spectral analysis
# ---------------------------------------------------------------------------


def compute_tremor_psd(
    signal: np.ndarray,
    fps: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute power spectral density using Welch's method.

    Welch's method divides the signal into overlapping segments, computes a
    modified periodogram for each segment, and averages them. This provides
    more robust PSD estimates than a simple periodogram, especially for noisy
    biological signals.

    Args:
        signal: 1D displacement signal.
        fps: Sampling rate in frames per second.

    Returns:
        (freqs, psd) where freqs is array of frequencies (Hz) and psd is
        power spectral density in units of px^2/Hz.
    """
    n_samples = len(signal)
    if n_samples < 8:
        return np.array([]), np.array([])

    # Welch parameters: balance between frequency resolution and variance
    nperseg = min(256, n_samples // 4)
    nperseg = max(nperseg, 8)  # Ensure minimum segment length
    noverlap = nperseg // 2

    freqs, psd = welch(
        signal,
        fs=fps,
        nperseg=nperseg,
        noverlap=noverlap,
        window="hann",
        detrend="linear",
    )

    return freqs, psd


def detect_dominant_frequency(
    freqs: np.ndarray,
    psd: np.ndarray,
) -> dict[str, Any]:
    """Find dominant frequency peak and classify tremor type.

    Searches for the highest PSD peak within the 2-15 Hz tremor-relevant
    range and classifies based on established clinical bands:
        - 4-6 Hz  : parkinsonian-type
        - 8-12 Hz : essential/postural-type
        - < 2 Hz  : no tremor (voluntary movement)
        - other   : unclassified / atypical

    Args:
        freqs: Frequency bins from PSD computation (Hz).
        psd: Power spectral density values (px^2/Hz).

    Returns:
        Dict with value, unit, confidence, grade, safe_wording, classification,
        and supporting metadata.
    """
    if len(freqs) == 0 or len(psd) == 0:
        return {
            "value": None,
            "unit": "Hz",
            "confidence": 0.0,
            "grade": GRADE_B,
            "safe_wording": SAFE_WORDING_DOMINANT_FREQ,
            "classification": "no_data",
            "peak_search_range": list(PEAK_SEARCH_BAND),
            "secondary_peaks": [],
        }

    # Restrict search to tremor-relevant band (2-15 Hz)
    search_mask = (freqs >= PEAK_SEARCH_BAND[0]) & (freqs <= PEAK_SEARCH_BAND[1])
    search_freqs = freqs[search_mask]
    search_psd = psd[search_mask]

    if len(search_freqs) == 0:
        return {
            "value": None,
            "unit": "Hz",
            "confidence": 0.0,
            "grade": GRADE_B,
            "safe_wording": SAFE_WORDING_DOMINANT_FREQ,
            "classification": "no_data",
            "peak_search_range": list(PEAK_SEARCH_BAND),
            "secondary_peaks": [],
        }

    # Find peaks in the search band
    # Height threshold: at least 20% of max in band (reduces noise peaks)
    height_threshold = 0.2 * np.max(search_psd) if np.max(search_psd) > 0 else 0
    peak_indices, properties = find_peaks(
        search_psd, height=height_threshold, distance=max(1, int(1.0 / (freqs[1] - freqs[0])))
    )

    if len(peak_indices) == 0:
        # No clear peak found; report frequency of maximum PSD
        max_idx = np.argmax(search_psd)
        dom_freq = float(search_freqs[max_idx])
        peak_power = float(search_psd[max_idx])
    else:
        # Sort by power (descending) and pick strongest
        sorted_by_power = sorted(
            zip(peak_indices, search_psd[peak_indices]),
            key=lambda x: x[1],
            reverse=True,
        )
        strongest_idx = sorted_by_power[0][0]
        dom_freq = float(search_freqs[strongest_idx])
        peak_power = float(search_psd[strongest_idx])

    # --- Classification ---
    classification: str
    if dom_freq < 2.0:
        classification = "no_tremor"
    elif PD_BAND[0] <= dom_freq <= PD_BAND[1]:
        classification = "parkinsonian"
    elif ET_BAND[0] <= dom_freq <= ET_BAND[1]:
        classification = "essential_postural"
    else:
        classification = "unclassified"

    # --- Confidence based on peak prominence and ICC ---
    # Prominence: how much the peak stands out above local baseline
    peak_prominence = 0.0
    if len(peak_indices) > 0:
        prominences = properties.get("prominences", [])
        if len(prominences) > 0:
            peak_prominence = float(np.max(prominences))

    # Normalize prominence to [0, 1] range (heuristic: 0.5 px^2/Hz is strong)
    prominence_score = min(peak_prominence / 0.5, 1.0) if peak_prominence > 0 else 0.3
    confidence = round(ICC_DOMINANT_FREQUENCY * (0.5 + 0.5 * prominence_score), 3)
    confidence = max(0.5, min(0.98, confidence))  # Clamp to realistic range

    # --- Secondary peaks (up to 3) ---
    secondary_peaks: list[dict[str, float]] = []
    if len(peak_indices) > 1:
        for idx, power in sorted_by_power[1:4]:
            secondary_peaks.append({
                "frequency_hz": round(float(search_freqs[idx]), 2),
                "power": round(float(power), 6),
            })

    return {
        "value": round(dom_freq, 2),
        "unit": "Hz",
        "confidence": confidence,
        "grade": GRADE_B,
        "safe_wording": SAFE_WORDING_DOMINANT_FREQ,
        "classification": classification,
        "peak_power": round(peak_power, 6),
        "peak_prominence": round(peak_prominence, 6),
        "peak_search_range": list(PEAK_SEARCH_BAND),
        "secondary_peaks": secondary_peaks,
    }


def compute_band_power(
    freqs: np.ndarray,
    psd: np.ndarray,
    band: tuple[float, float],
) -> dict[str, Any]:
    """Integrate PSD within a frequency band using the trapezoid rule.

    Args:
        freqs: Frequency bins (Hz).
        psd: Power spectral density values (px^2/Hz).
        band: (low, high) frequency bounds.

    Returns:
        Dict with value, unit, and metadata.
    """
    if len(freqs) == 0 or len(psd) == 0:
        return {
            "value": None,
            "unit": "px\u00b2/Hz",
            "band": list(band),
            "confidence": 0.0,
        }

    band_mask = (freqs >= band[0]) & (freqs <= band[1])
    band_freqs = freqs[band_mask]
    band_psd = psd[band_mask]

    if len(band_freqs) < 2:
        return {
            "value": 0.0,
            "unit": "px\u00b2/Hz",
            "band": list(band),
            "confidence": 0.0,
        }

    # Trapezoidal integration
    power = float(np.trapezoid(band_psd, band_freqs))
    power = max(0.0, power)

    # Confidence based on ICC and frequency resolution adequacy
    freq_resolution = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0
    resolution_ok = 1.0 if freq_resolution <= 0.5 else 0.7
    confidence = round(ICC_BAND_POWER * resolution_ok, 3)

    return {
        "value": round(power, 6),
        "unit": "px\u00b2/Hz",
        "band": list(band),
        "confidence": confidence,
    }


# ---------------------------------------------------------------------------
# Amplitude and derived metrics
# ---------------------------------------------------------------------------


def compute_tremor_amplitude(signal: np.ndarray) -> dict[str, Any]:
    """Compute peak-to-peak amplitude of wrist oscillation.

    Measures the maximum displacement excursion of the filtered tremor signal.
    Reported in pixel units; requires calibration (e.g., using a reference
    object in frame) for conversion to mm.

    Args:
        signal: 1D filtered displacement signal.

    Returns:
        Dict with value, unit, confidence, grade, and safe wording.
    """
    if len(signal) < 2:
        return {
            "value": None,
            "unit": "px",
            "confidence": 0.0,
            "grade": GRADE_C,
            "safe_wording": SAFE_WORDING_AMPLITUDE,
        }

    # Peak-to-peak: max - min
    p2p = float(np.nanmax(signal) - np.nanmin(signal))
    p2p = max(0.0, p2p)

    # Confidence heuristics: stronger signal = higher confidence
    # Use signal std relative to mean as a quality indicator
    signal_std = float(np.nanstd(signal))
    mean_abs = float(np.nanmean(np.abs(signal)))

    # SNR-like quality metric
    quality = min(signal_std / (mean_abs + 1e-9), 2.0) / 2.0 if mean_abs > 0 else 0.3
    confidence = round(0.60 + 0.25 * quality, 3)
    confidence = max(0.40, min(0.90, confidence))

    return {
        "value": round(p2p, 2),
        "unit": "px",
        "confidence": confidence,
        "grade": GRADE_C,
        "safe_wording": SAFE_WORDING_AMPLITUDE,
    }


def compute_signal_to_noise_ratio(
    psd: np.ndarray,
    tremor_band_indices: np.ndarray | None = None,
    freqs: np.ndarray | None = None,
) -> dict[str, Any]:
    """Compute tremor signal-to-noise ratio in dB.

    Ratio of power within the tremor band (2-15 Hz) to power outside it.
    Higher values indicate a more pronounced tremor signal relative to
    background noise.

    Args:
        psd: Power spectral density values.
        tremor_band_indices: Boolean mask for tremor band frequencies (optional).
        freqs: Frequency array (required if tremor_band_indices not provided).

    Returns:
        Dict with SNR in dB, confidence, grade, and safe wording.
    """
    if len(psd) == 0:
        return {
            "value": None,
            "unit": "dB",
            "confidence": 0.0,
            "grade": GRADE_C,
            "safe_wording": SAFE_WORDING_SNR,
        }

    # Define tremor band mask
    if tremor_band_indices is not None and len(tremor_band_indices) == len(psd):
        tremor_mask = tremor_band_indices
    elif freqs is not None:
        tremor_mask = (freqs >= PEAK_SEARCH_BAND[0]) & (freqs <= PEAK_SEARCH_BAND[1])
    else:
        # Assume all frequencies are tremor-relevant if no freq info
        tremor_mask = np.ones(len(psd), dtype=bool)

    tremor_power = float(np.sum(psd[tremor_mask])) + 1e-12
    total_power = float(np.sum(psd)) + 1e-12
    noise_power = total_power - tremor_power + 1e-12

    # SNR in dB
    snr_db = float(10.0 * np.log10(tremor_power / noise_power)) if noise_power > 1e-12 else 0.0

    # Confidence: higher SNR = more reliable detection
    snr_confidence = min(max(snr_db / 20.0, 0.0), 1.0)  # 20 dB -> full confidence
    confidence = round(0.50 + 0.40 * snr_confidence, 3)
    confidence = max(0.35, min(0.85, confidence))

    return {
        "value": round(snr_db, 2),
        "unit": "dB",
        "confidence": confidence,
        "grade": GRADE_C,
        "safe_wording": SAFE_WORDING_SNR,
    }


def compute_harmonic_ratio(
    freqs: np.ndarray,
    psd: np.ndarray,
    fundamental: float,
) -> dict[str, Any]:
    """Compute ratio of first harmonic to fundamental frequency power.

    Harmonic ratio characterizes the waveform shape of the tremor:
    - Near 0: nearly sinusoidal tremor
    - Higher: non-sinusoidal, more complex waveform

    The first harmonic is searched at approximately 2x the fundamental
    frequency, within a +/- 1 Hz tolerance.

    Args:
        freqs: Frequency bins (Hz).
        psd: Power spectral density values.
        fundamental: Fundamental frequency (Hz) from dominant frequency detection.

    Returns:
        Dict with harmonic ratio, confidence, grade, and safe wording.
    """
    if (
        len(freqs) == 0
        or len(psd) == 0
        or fundamental is None
        or fundamental <= 0
    ):
        return {
            "value": None,
            "unit": "ratio",
            "confidence": 0.0,
            "grade": GRADE_C,
            "safe_wording": SAFE_WORDING_HARMONIC,
        }

    # Search for first harmonic at ~2x fundamental
    harmonic_target = 2.0 * fundamental
    harmonic_tolerance = 1.0  # +/- 1 Hz search window

    harmonic_mask = (
        (freqs >= harmonic_target - harmonic_tolerance)
        & (freqs <= harmonic_target + harmonic_tolerance)
    )
    fundamental_mask = (
        (freqs >= fundamental - 0.5) & (freqs <= fundamental + 0.5)
    )

    harmonic_power = float(np.sum(psd[harmonic_mask])) if np.any(harmonic_mask) else 0.0
    fundamental_power = float(np.sum(psd[fundamental_mask])) if np.any(fundamental_mask) else 1e-12

    if fundamental_power > 1e-12 and harmonic_power >= 0:
        ratio = harmonic_power / fundamental_power
    else:
        ratio = 0.0

    # Confidence: higher when both fundamental and harmonic are well-detected
    fundamental_peak = float(np.max(psd[fundamental_mask])) if np.any(fundamental_mask) else 0.0
    harmonic_peak = float(np.max(psd[harmonic_mask])) if np.any(harmonic_mask) else 0.0

    quality = min(fundamental_peak / (fundamental_peak + harmonic_peak + 1e-9), 1.0)
    confidence = round(0.45 + 0.35 * quality, 3)
    confidence = max(0.30, min(0.80, confidence))

    return {
        "value": round(ratio, 4),
        "unit": "ratio",
        "confidence": confidence,
        "grade": GRADE_C,
        "safe_wording": SAFE_WORDING_HARMONIC,
    }


# ---------------------------------------------------------------------------
# Overall tremor classification
# ---------------------------------------------------------------------------


def _classify_overall_tremor(
    dom_freq_result: dict[str, Any],
    pd_band: dict[str, Any],
    et_band: dict[str, Any],
) -> str:
    """Determine overall tremor classification from feature evidence.

    Uses a weighted voting approach:
    - Dominant frequency classification gets highest weight (0.5)
    - Band power comparison adds supporting evidence (0.5)

    Args:
        dom_freq_result: Result dict from detect_dominant_frequency().
        pd_band: Result dict from compute_band_power(PD_BAND).
        et_band: Result dict from compute_band_power(ET_BAND).

    Returns:
        Classification string: "parkinsonian", "essential_postural",
        "no_tremor", or "unclassified".
    """
    dom_classification = dom_freq_result.get("classification", "unclassified")
    dom_value = dom_freq_result.get("value")

    # If no dominant frequency detected
    if dom_value is None:
        return "insufficient_data"

    # Compare band powers for additional evidence
    pd_power = pd_band.get("value") or 0.0
    et_power = et_band.get("value") or 0.0

    # If PD band power clearly dominates
    if pd_power > 2.0 * et_power and pd_power > 0.001:
        if dom_classification in ("parkinsonian", "unclassified"):
            return "parkinsonian"

    # If ET band power clearly dominates
    if et_power > 2.0 * pd_power and et_power > 0.001:
        if dom_classification in ("essential_postural", "unclassified"):
            return "essential_postural"

    # Default to dominant frequency classification
    if dom_classification == "no_tremor":
        return "no_tremor"

    return dom_classification if dom_classification != "no_data" else "unclassified"


def _compute_overall_confidence(
    dom_freq_result: dict[str, Any],
    pd_band: dict[str, Any],
    et_band: dict[str, Any],
    amplitude_result: dict[str, Any],
    snr_result: dict[str, Any],
) -> float:
    """Compute weighted overall analysis confidence.

    Grade B features (dominant frequency, band powers) weighted more heavily
    than Grade C features (amplitude, SNR, harmonic ratio).

    Args:
        dom_freq_result: Dominant frequency result.
        pd_band: PD band power result.
        et_band: ET band power result.
        amplitude_result: Amplitude result.
        snr_result: SNR result.

    Returns:
        Overall confidence score in [0, 1].
    """
    weights = {
        "dom_freq": 0.35,
        "pd_band": 0.25,
        "et_band": 0.20,
        "amplitude": 0.10,
        "snr": 0.10,
    }

    confidences: dict[str, float] = {
        "dom_freq": dom_freq_result.get("confidence", 0.0),
        "pd_band": pd_band.get("confidence", 0.0),
        "et_band": et_band.get("confidence", 0.0),
        "amplitude": amplitude_result.get("confidence", 0.0),
        "snr": snr_result.get("confidence", 0.0),
    }

    overall = sum(weights[k] * confidences[k] for k in weights)
    return round(max(0.0, min(1.0, overall)), 3)


# ---------------------------------------------------------------------------
# Main analysis entry point
# ---------------------------------------------------------------------------


def analyze_tremor(
    pose_sequence: dict[str, Any],
    side: str = "right",
) -> dict[str, Any]:
    """Run full tremor analysis on wrist trajectory from pose sequence.

    This is the main entry point for the tremor analysis pipeline. It extracts
    wrist keypoints, computes the displacement signal, applies bandpass filtering,
    and derives all tremor features with evidence grades and safe clinical wording.

    Decision-support only: all outputs are observation cues requiring clinician
    review. Camera artifacts may produce false tremor signals.

    Args:
        pose_sequence: Dict with:
            - "frames": list[dict] each with "keypoints" mapping name -> [x, y, c]
            - "fps": float, frames per second
            - "duration_sec": float (optional)
        side: Which wrist to analyze ("left" or "right").

    Returns:
        Complete tremor analysis result dict with all features, classification,
        confidence, and evidence summary.
    """
    # ------------------------------------------------------------------
    # Validate input
    # ------------------------------------------------------------------
    if not isinstance(pose_sequence, dict):
        _log.error("pose_sequence must be a dict, got %s", type(pose_sequence))
        return _empty_result("invalid_input")

    frames = pose_sequence.get("frames", [])
    fps = float(pose_sequence.get("fps", 0.0))
    duration_sec = float(pose_sequence.get("duration_sec", len(frames) / fps if fps > 0 else 0))

    if not frames or fps <= 0:
        _log.warning("Invalid pose_sequence: %d frames, fps=%.1f", len(frames), fps)
        return _empty_result("invalid_input")

    if duration_sec < MIN_DURATION_SEC:
        _log.warning(
            "Recording too short for reliable tremor analysis: %.1f sec < %.1f sec minimum",
            duration_sec, MIN_DURATION_SEC,
        )

    if len(frames) < MIN_FRAMES:
        _log.warning(
            "Too few frames for tremor analysis: %d < %d minimum",
            len(frames), MIN_FRAMES,
        )

    # ------------------------------------------------------------------
    # Extract wrist trajectory
    # ------------------------------------------------------------------
    trajectory = extract_wrist_trajectory(frames, side=side)

    if trajectory.shape[0] < MIN_FRAMES:
        _log.warning(
            "Insufficient wrist keypoints extracted: %d frames",
            trajectory.shape[0],
        )
        return _empty_result("insufficient_data")

    # Check average confidence of extracted keypoints
    avg_confidence = float(np.nanmean(trajectory[:, 2])) if trajectory.shape[0] > 0 else 0.0
    if avg_confidence < MIN_CONFIDENCE:
        _log.warning(
            "Low average keypoint confidence (%.2f); tremor analysis may be unreliable",
            avg_confidence,
        )

    # ------------------------------------------------------------------
    # Preprocess: interpolate missing values
    # ------------------------------------------------------------------
    trajectory_interp = _interpolate_missing(trajectory)

    # Validate that we have usable coordinate data after interpolation
    if np.all(np.isnan(trajectory_interp[:, 0])) or np.all(np.isnan(trajectory_interp[:, 1])):
        _log.warning("No valid x/y coordinates after interpolation")
        return _empty_result("insufficient_data")

    # ------------------------------------------------------------------
    # Compute 1D displacement signal
    # ------------------------------------------------------------------
    displacement_signal = _compute_1d_displacement_signal(trajectory_interp)

    if len(displacement_signal) < MIN_FRAMES:
        return _empty_result("insufficient_data")

    if np.all(displacement_signal == 0) or np.all(np.isnan(displacement_signal)):
        return _empty_result("no_movement_detected")

    # ------------------------------------------------------------------
    # Apply bandpass filter (2-15 Hz)
    # ------------------------------------------------------------------
    filtered_signal = _apply_bandpass_filter(displacement_signal, fps, band=ANALYSIS_BAND)

    # ------------------------------------------------------------------
    # Compute PSD using Welch's method
    # ------------------------------------------------------------------
    freqs, psd = compute_tremor_psd(filtered_signal, fps)

    if len(freqs) == 0 or len(psd) == 0:
        _log.warning("PSD computation failed -- insufficient signal length")
        return _empty_result("psd_computation_failed")

    # ------------------------------------------------------------------
    # Extract tremor features
    # ------------------------------------------------------------------

    # 1. Dominant frequency (Grade B)
    dom_freq_result = detect_dominant_frequency(freqs, psd)

    # 2. Band power 4-6 Hz (Grade B)
    pd_band_result = compute_band_power(freqs, psd, PD_BAND)
    pd_band_result["grade"] = GRADE_B
    pd_band_result["safe_wording"] = SAFE_WORDING_PD_BAND

    # 3. Band power 8-12 Hz (Grade B)
    et_band_result = compute_band_power(freqs, psd, ET_BAND)
    et_band_result["grade"] = GRADE_B
    et_band_result["safe_wording"] = SAFE_WORDING_ET_BAND

    # 4. Tremor amplitude (Grade C)
    amplitude_result = compute_tremor_amplitude(filtered_signal)

    # 5. Signal-to-noise ratio (Grade C)
    tremor_band_mask = (freqs >= PEAK_SEARCH_BAND[0]) & (freqs <= PEAK_SEARCH_BAND[1])
    snr_result = compute_signal_to_noise_ratio(psd, tremor_band_indices=tremor_band_mask)

    # 6. Harmonic ratio (Grade C)
    harmonic_result = compute_harmonic_ratio(
        freqs, psd, dom_freq_result.get("value")
    )

    # ------------------------------------------------------------------
    # Overall classification and confidence
    # ------------------------------------------------------------------
    overall_classification = _classify_overall_tremor(
        dom_freq_result, pd_band_result, et_band_result
    )
    overall_confidence = _compute_overall_confidence(
        dom_freq_result, pd_band_result, et_band_result,
        amplitude_result, snr_result,
    )

    # ------------------------------------------------------------------
    # Build evidence summary
    # ------------------------------------------------------------------
    evidence_summary = (
        "Tremor frequency features (Grade B). "
        f"ICC {ICC_DOMINANT_FREQUENCY:.2f} vs accelerometry. "
        f"{PD_BAND[0]}-{PD_BAND[1]} Hz suggests parkinsonian type; "
        f"{ET_BAND[0]}-{ET_BAND[1]} Hz suggests essential/postural tremor. "
        "Requires clinical confirmation. "
        "Camera artifacts may produce false signals."
    )

    # ------------------------------------------------------------------
    # Assemble result
    # ------------------------------------------------------------------
    result: dict[str, Any] = {
        "tremor_analysis": {
            "dominant_frequency": dom_freq_result,
            "band_power_4_6_hz": pd_band_result,
            "band_power_8_12_hz": et_band_result,
            "tremor_amplitude": amplitude_result,
            "signal_to_noise_ratio": snr_result,
            "harmonic_ratio": harmonic_result,
        },
        "tremor_classification": overall_classification,
        "analysis_confidence": overall_confidence,
        "evidence_summary": evidence_summary,
        "metadata": {
            "pipeline_version": "1.0.0",
            "side_analyzed": side,
            "fps": fps,
            "duration_sec": round(duration_sec, 2),
            "n_frames": len(frames),
            "n_valid_keypoints": int(np.sum(trajectory[:, 2] > 0)),
            "avg_keypoint_confidence": round(avg_confidence, 3),
            "bandpass_filter": list(ANALYSIS_BAND),
            "min_frames_required": MIN_FRAMES,
            "min_duration_required_sec": MIN_DURATION_SEC,
        },
        "disclaimer": (
            "This analysis is decision-support only and not a diagnosis. "
            "All tremor features are model-assisted observation cues that "
            "require review by a qualified clinician. Camera artifacts, "
            "lighting changes, and voluntary movement may confound results."
        ),
    }

    return result


def _empty_result(reason: str) -> dict[str, Any]:
    """Return a minimal result when analysis cannot be performed.

    Args:
        reason: Error/reason code: "invalid_input", "insufficient_data",
                "no_movement_detected", "psd_computation_failed".

    Returns:
        Result dict with None values and appropriate metadata.
    """
    safe_wording_base = (
        "Tremor frequency features are model-assisted observation cues. "
        "Camera artifacts may mimic tremor -- requires clinician review."
    )

    band_safe_wording_pd = (
        "4-6 Hz band power may support review of parkinsonian-type tremor. "
        "Not a standalone diagnosis."
    )
    band_safe_wording_et = (
        "8-12 Hz band power may support review of essential/postural tremor. "
        "Clinical correlation required."
    )

    return {
        "tremor_analysis": {
            "dominant_frequency": {
                "value": None,
                "unit": "Hz",
                "confidence": 0.0,
                "grade": GRADE_B,
                "safe_wording": safe_wording_base,
                "classification": reason,
            },
            "band_power_4_6_hz": {
                "value": None,
                "unit": "px\u00b2/Hz",
                "band": list(PD_BAND),
                "confidence": 0.0,
                "grade": GRADE_B,
                "safe_wording": band_safe_wording_pd,
            },
            "band_power_8_12_hz": {
                "value": None,
                "unit": "px\u00b2/Hz",
                "band": list(ET_BAND),
                "confidence": 0.0,
                "grade": GRADE_B,
                "safe_wording": band_safe_wording_et,
            },
            "tremor_amplitude": {
                "value": None,
                "unit": "px",
                "confidence": 0.0,
                "grade": GRADE_C,
                "safe_wording": SAFE_WORDING_AMPLITUDE,
            },
            "signal_to_noise_ratio": {
                "value": None,
                "unit": "dB",
                "confidence": 0.0,
                "grade": GRADE_C,
                "safe_wording": SAFE_WORDING_SNR,
            },
            "harmonic_ratio": {
                "value": None,
                "unit": "ratio",
                "confidence": 0.0,
                "grade": GRADE_C,
                "safe_wording": SAFE_WORDING_HARMONIC,
            },
        },
        "tremor_classification": reason,
        "analysis_confidence": 0.0,
        "evidence_summary": (
            "Analysis could not be completed. "
            f"Reason: {reason}. "
            "Ensure sufficient recording duration (>=3 seconds), adequate "
            "frame rate (>=10 FPS), and visible wrist keypoints."
        ),
        "metadata": {
            "pipeline_version": "1.0.0",
            "failure_reason": reason,
        },
        "disclaimer": (
            "This analysis is decision-support only and not a diagnosis. "
            "Camera artifacts may confound results."
        ),
    }
