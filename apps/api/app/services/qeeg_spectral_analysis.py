"""Advanced Spectral Analysis Pipeline for qEEG.

Implements Welch's method, band power computation, Individual Alpha Frequency (IAF),
band ratios, and asymmetry analysis.

Decision-support only. Not a diagnosis.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np

_log = logging.getLogger(__name__)

# Standard frequency bands (Hz)
FREQUENCY_BANDS: dict[str, tuple[float, float]] = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "low_beta": (13.0, 20.0),
    "high_beta": (20.0, 30.0),
    "gamma": (30.0, 100.0),
}

# Key electrode positions for asymmetry
ASYMMETRY_PAIRS: dict[str, tuple[str, str]] = {
    "frontal_alpha": ("F3", "F4"),
    "frontal_theta": ("F3", "F4"),
    "temporal_alpha": ("T3", "T4"),
    "temporal_beta": ("T3", "T4"),
    "parietal_alpha": ("P3", "P4"),
    "anterior_posterior": ("Fp1", "O1"),
}


# ────────────────────────────────────────────────────────────────
# Welch PSD
# ────────────────────────────────────────────────────────────────

def welch_power_spectral_density(
    signal: list[float] | np.ndarray,
    sfreq: float,
    window_sec: float = 2.0,
    overlap: float = 0.5,
) -> dict[str, Any]:
    """Compute power spectral density using Welch's method.

    Parameters
    ----------
    signal : list[float] | np.ndarray
        Time-domain signal.
    sfreq : float
        Sampling frequency in Hz.
    window_sec : float
        Window length in seconds (default 2.0).
    overlap : float
        Overlap fraction (default 0.5).

    Returns
    -------
    dict
        frequencies, power_spectral_density, sfreq, window_sec, overlap, n_windows.
        Returns {"error": ...} if signal is too short.
    """
    signal_arr = np.asarray(signal, dtype=float)
    n_samples = signal_arr.size
    window_samples = int(window_sec * sfreq)
    step = int(window_samples * (1 - overlap))

    if n_samples < window_samples:
        return {"error": "Signal too short for Welch's method"}

    n_windows = (n_samples - window_samples) // step + 1
    psds: list[np.ndarray] = []

    for i in range(n_windows):
        start = i * step
        window = signal_arr[start : start + window_samples]
        hamming = np.hamming(window_samples)
        windowed = window * hamming
        fft = np.fft.rfft(windowed)
        denom = sfreq * np.sum(hamming**2)
        psd = np.abs(fft) ** 2 / denom
        psds.append(psd)

    avg_psd = np.mean(psds, axis=0)
    freqs = np.fft.rfftfreq(window_samples, 1.0 / sfreq)

    return {
        "frequencies": freqs.tolist(),
        "power_spectral_density": avg_psd.tolist(),
        "sfreq": sfreq,
        "window_sec": window_sec,
        "overlap": overlap,
        "n_windows": n_windows,
    }


# ────────────────────────────────────────────────────────────────
# Band Powers
# ────────────────────────────────────────────────────────────────

def compute_band_powers(
    psd_result: dict[str, Any],
) -> dict[str, Any]:
    """Compute absolute and relative power for each frequency band.

    Parameters
    ----------
    psd_result : dict
        Output from :func:`welch_power_spectral_density`.

    Returns
    -------
    dict
        bands (absolute + relative per band), total_power, band_definitions.
    """
    freqs = np.array(psd_result["frequencies"])
    psd = np.array(psd_result["power_spectral_density"])

    total_power = float(np.trapezoid(psd, freqs))
    band_powers: dict[str, dict[str, float]] = {}

    for band_name, (low, high) in FREQUENCY_BANDS.items():
        mask = (freqs >= low) & (freqs <= high)
        if mask.any():
            abs_power = float(np.trapezoid(psd[mask], freqs[mask]))
            rel_power = (abs_power / total_power * 100.0) if total_power > 0 else 0.0
            band_powers[band_name] = {
                "absolute": abs_power,
                "relative": rel_power,
            }
        else:
            band_powers[band_name] = {"absolute": 0.0, "relative": 0.0}

    return {
        "bands": band_powers,
        "total_power": total_power,
        "band_definitions": FREQUENCY_BANDS,
    }


# ────────────────────────────────────────────────────────────────
# Individual Alpha Frequency (IAF)
# ────────────────────────────────────────────────────────────────

def compute_individual_alpha_frequency(
    psd_result: dict[str, Any],
) -> dict[str, Any]:
    """Extract Individual Alpha Frequency (IAF) via center of gravity method.

    IAF is the frequency within the alpha band (7-13 Hz) with peak power.

    Parameters
    ----------
    psd_result : dict
        Output from :func:`welch_power_spectral_density`.

    Returns
    -------
    dict
        iaf, peak_alpha_frequency, method, confidence, alpha_band.
    """
    freqs = np.array(psd_result["frequencies"])
    psd = np.array(psd_result["power_spectral_density"])

    alpha_mask = (freqs >= 7.0) & (freqs <= 13.0)
    alpha_freqs = freqs[alpha_mask]
    alpha_psd = psd[alpha_mask]

    if alpha_freqs.size == 0:
        return {
            "iaf": None,
            "method": "center_of_gravity",
            "confidence": "low",
            "alpha_band": (7.0, 13.0),
        }

    # Center of gravity
    iaf = float(np.sum(alpha_freqs * alpha_psd) / np.sum(alpha_psd))
    peak_idx = int(np.argmax(alpha_psd))
    peak_freq = float(alpha_freqs[peak_idx])

    return {
        "iaf": iaf,
        "peak_alpha_frequency": peak_freq,
        "method": "center_of_gravity",
        "confidence": "high" if 8.0 <= iaf <= 12.0 else "moderate",
        "alpha_band": (7.0, 13.0),
    }


# ────────────────────────────────────────────────────────────────
# Band Ratios
# ────────────────────────────────────────────────────────────────

def compute_band_ratios(
    band_powers: dict[str, Any],
) -> dict[str, Any]:
    """Compute clinically relevant band ratios.

    Parameters
    ----------
    band_powers : dict
        Output from :func:`compute_band_powers`.

    Returns
    -------
    dict
        theta_beta_ratio, theta_alpha_ratio, delta_alpha_ratio with clinical notes.
    """
    bands = band_powers.get("bands", {})
    ratios: dict[str, Any] = {}

    # Theta/Beta Ratio (TBR) — ADHD marker
    theta_abs = bands.get("theta", {}).get("absolute", 0.0)
    beta_abs = (
        bands.get("low_beta", {}).get("absolute", 0.0)
        + bands.get("high_beta", {}).get("absolute", 0.0)
    )
    if beta_abs > 0:
        tbr = theta_abs / beta_abs
        ratios["theta_beta_ratio"] = {
            "value": float(tbr),
            "log_value": float(math.log1p(tbr)),
            "clinical_note": (
                "TBR > 1.0 may be associated with ADHD presentations in some studies. "
                "Not diagnostic."
            ),
            "evidence_grade": "B",
        }

    # Theta/Alpha Ratio (TAR) — cognitive decline marker
    alpha_abs = bands.get("alpha", {}).get("absolute", 0.0)
    if alpha_abs > 0:
        tar = theta_abs / alpha_abs
        ratios["theta_alpha_ratio"] = {
            "value": float(tar),
            "clinical_note": (
                "Elevated TAR has been associated with cognitive decline in some studies. "
                "Requires clinical correlation."
            ),
            "evidence_grade": "C",
        }

    # Delta/Alpha Ratio (DAR) — dementia marker
    delta_abs = bands.get("delta", {}).get("absolute", 0.0)
    if alpha_abs > 0:
        dar = delta_abs / alpha_abs
        ratios["delta_alpha_ratio"] = {
            "value": float(dar),
            "clinical_note": (
                "Elevated DAR may be associated with dementia pathology in some studies. "
                "Not diagnostic."
            ),
            "evidence_grade": "C",
        }

    # Alpha3/Alpha2 Ratio — hippocampal atrophy marker (Jelic et al.)
    # Approximate: alpha2 = 8-10 Hz, alpha3 = 10-13 Hz
    # Since our band powers don't have sub-alpha resolution, we flag this as
    # requiring a finer-grained spectral analysis.
    ratios["alpha3_alpha2_ratio_note"] = {
        "value": None,
        "clinical_note": (
            "Alpha3/Alpha2 ratio requires sub-band spectral decomposition (8-10 Hz vs 10-13 Hz). "
            "Ratio > 1.0 has been associated with hippocampal atrophy in MCI (Jelic et al., 2010). "
            "Run high-resolution spectral analysis to compute."
        ),
        "evidence_grade": "B",
    }

    return ratios


# ────────────────────────────────────────────────────────────────
# Asymmetry Analysis
# ────────────────────────────────────────────────────────────────

def compute_asymmetry(
    left_power: float,
    right_power: float,
    pair_name: str,
) -> dict[str, Any]:
    """Compute frontal alpha asymmetry and other asymmetry indices.

    Uses natural log difference: ln(R) - ln(L)
    Positive = right hemisphere more active (left hypoactivation)
    Negative = left hemisphere more active (right hypoactivation)

    Parameters
    ----------
    left_power : float
        Absolute power from left hemisphere electrode.
    right_power : float
        Absolute power from right hemisphere electrode.
    pair_name : str
        Name of the electrode pair (e.g., "frontal_alpha").

    Returns
    -------
    dict
        asymmetry_index, left_power, right_power, pair, interpretation, evidence_grade.
    """
    if left_power <= 0 or right_power <= 0:
        return {"error": "Cannot compute asymmetry with zero/negative power"}

    asymmetry = math.log(right_power) - math.log(left_power)

    interpretation = ""
    if "alpha" in pair_name.lower():
        if asymmetry > 0.1:
            interpretation = (
                "Relative left frontal hypoactivation. Has been associated with "
                "depression/anxiety presentations in some studies. Not diagnostic."
            )
        elif asymmetry < -0.1:
            interpretation = (
                "Relative right frontal hypoactivation. Has been associated with "
                "approach motivation patterns in some studies."
            )
        else:
            interpretation = "Frontal alpha asymmetry within typical range."

    return {
        "asymmetry_index": float(asymmetry),
        "left_power": float(left_power),
        "right_power": float(right_power),
        "pair": pair_name,
        "interpretation": interpretation,
        "evidence_grade": "B" if "alpha" in pair_name.lower() else "C",
    }


# ────────────────────────────────────────────────────────────────
# Full pipeline
# ────────────────────────────────────────────────────────────────

def full_spectral_analysis(
    eeg_data: dict[str, list[float]],
    sfreq: float,
    channel_locations: dict[str, tuple[float, float, float]],
) -> dict[str, Any]:
    """Run complete spectral analysis pipeline.

    Parameters
    ----------
    eeg_data : dict[str, list[float]]
        channel_name -> signal values.
    sfreq : float
        Sampling frequency in Hz.
    channel_locations : dict[str, tuple[float, float, float]]
        channel_name -> (x, y, z) positions.

    Returns
    -------
    dict
        channel_spectral, band_powers, iaf, ratios, asymmetry, safety_note.
    """
    results: dict[str, Any] = {
        "channel_spectral": {},
        "band_powers": {},
        "iaf": {},
        "ratios": {},
        "asymmetry": {},
        "channel_locations": channel_locations,
        "safety_note": (
            "Spectral analysis is decision support only. "
            "Requires clinician review. Not diagnostic."
        ),
    }

    for ch_name, signal in eeg_data.items():
        psd = welch_power_spectral_density(signal, sfreq)
        if "error" in psd:
            _log.warning("Spectral analysis failed for %s: %s", ch_name, psd["error"])
            continue

        bands = compute_band_powers(psd)
        iaf = compute_individual_alpha_frequency(psd)

        results["channel_spectral"][ch_name] = psd
        results["band_powers"][ch_name] = bands
        results["iaf"][ch_name] = iaf

    # Band ratios (using Cz or average of all channels)
    cz_bands = results["band_powers"].get("Cz")
    if cz_bands is None and results["band_powers"]:
        # Average band powers across all channels
        all_bands: dict[str, list[float]] = {}
        for ch_bands in results["band_powers"].values():
            for band_name, vals in ch_bands.get("bands", {}).items():
                if band_name not in all_bands:
                    all_bands[band_name] = []
                all_bands[band_name].append(vals.get("absolute", 0.0))

        avg_bands: dict[str, dict[str, float]] = {}
        for band_name, vals in all_bands.items():
            avg_bands[band_name] = {
                "absolute": float(np.mean(vals)),
                "relative": 0.0,  # relative needs total; skip here
            }
        cz_bands = {"bands": avg_bands}

    if cz_bands:
        results["ratios"] = compute_band_ratios(cz_bands)

    # Asymmetry
    for pair_name, (left_ch, right_ch) in ASYMMETRY_PAIRS.items():
        left_alpha = (
            results["band_powers"]
            .get(left_ch, {})
            .get("bands", {})
            .get("alpha", {})
            .get("absolute", 0.0)
        )
        right_alpha = (
            results["band_powers"]
            .get(right_ch, {})
            .get("bands", {})
            .get("alpha", {})
            .get("absolute", 0.0)
        )
        if left_alpha > 0 and right_alpha > 0:
            results["asymmetry"][pair_name] = compute_asymmetry(
                left_alpha, right_alpha, pair_name
            )

    # Summary statistics
    results["channel_count"] = len(results["channel_spectral"])
    results["n_channels_total"] = len(eeg_data)
    results["sfreq"] = sfreq

    return results
