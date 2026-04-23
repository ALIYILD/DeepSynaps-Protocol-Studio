"""Spectral analysis engine for qEEG data.

Computes power spectral density (Welch method), band powers, derived ratios,
and basic artifact rejection for EEG recordings.
"""
from __future__ import annotations

import logging
import math
from typing import Any

_log = logging.getLogger(__name__)

# Standard frequency bands aligned with qeeg_biomarkers.csv
DEFAULT_BANDS: dict[str, tuple[float, float]] = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 12.0),
    "beta": (12.0, 30.0),
    "high_beta": (20.0, 30.0),
    "gamma": (30.0, 45.0),
}


def compute_band_powers(
    raw: Any,
    bands: dict[str, tuple[float, float]] | None = None,
    epoch_length_sec: float = 2.0,
) -> dict[str, Any]:
    """Compute per-channel per-band absolute and relative power.

    Uses Welch's method via scipy for PSD estimation.

    Args:
        raw: MNE Raw object (preloaded, filtered to EEG channels)
        bands: frequency band definitions {name: (fmin, fmax)}
        epoch_length_sec: epoch length for Welch segments

    Returns:
        {
            "bands": {band_name: {"hz_range": [fmin, fmax], "channels": {ch: {"absolute_uv2": float, "relative_pct": float}}}},
            "derived_ratios": {...},
            "global_summary": {...}
        }
    """
    import numpy as np
    from scipy.signal import welch

    if bands is None:
        bands = DEFAULT_BANDS

    sfreq = raw.info["sfreq"]
    data = raw.get_data()  # shape: (n_channels, n_times)
    ch_names = raw.ch_names
    nyquist = sfreq / 2.0

    # Welch PSD parameters
    nperseg = int(epoch_length_sec * sfreq)
    if nperseg > data.shape[1]:
        nperseg = data.shape[1]

    result_bands: dict[str, Any] = {}
    # Per-channel total power for relative calculation
    channel_total_power: dict[str, float] = {}

    # Compute PSD for all channels at once
    freqs, psd = welch(data, fs=sfreq, nperseg=nperseg, axis=1)
    # psd shape: (n_channels, n_freqs), units: V^2/Hz
    # Convert to uV^2/Hz (multiply by 1e12)
    psd_uv2 = psd * 1e12

    # Compute total power per channel (0.5 Hz to nyquist)
    freq_mask_total = (freqs >= 0.5) & (freqs <= min(nyquist, 45.0))
    freq_resolution = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0

    for ch_idx, ch_name in enumerate(ch_names):
        channel_total_power[ch_name] = float(
            np.sum(psd_uv2[ch_idx, freq_mask_total]) * freq_resolution
        )

    # Compute band powers
    for band_name, (fmin, fmax) in bands.items():
        effective_fmax = min(fmax, nyquist)
        if fmin >= effective_fmax:
            continue

        freq_mask = (freqs >= fmin) & (freqs <= effective_fmax)
        channels_data: dict[str, dict[str, float]] = {}

        for ch_idx, ch_name in enumerate(ch_names):
            abs_power = float(np.sum(psd_uv2[ch_idx, freq_mask]) * freq_resolution)
            total = channel_total_power.get(ch_name, 1.0)
            rel_pct = (abs_power / total * 100.0) if total > 0 else 0.0

            channels_data[ch_name] = {
                "absolute_uv2": round(abs_power, 4),
                "relative_pct": round(rel_pct, 2),
            }

        result_bands[band_name] = {
            "hz_range": [fmin, effective_fmax],
            "channels": channels_data,
        }

    # Compute derived ratios
    derived = compute_derived_ratios(result_bands, ch_names, freqs, psd_uv2, freq_resolution)

    # Global summary
    dominant_freq = _find_dominant_frequency(freqs, psd_uv2, ch_names)
    total_power = sum(channel_total_power.values()) / max(len(ch_names), 1)

    return {
        "bands": result_bands,
        "derived_ratios": derived,
        "global_summary": {
            "dominant_frequency_hz": round(dominant_freq, 2),
            "mean_total_power_uv2": round(total_power, 4),
            "channel_count": len(ch_names),
            "sample_rate_hz": sfreq,
        },
    }


def compute_derived_ratios(
    band_powers: dict[str, Any],
    ch_names: list[str],
    freqs: Any = None,
    psd_uv2: Any = None,
    freq_resolution: float = 1.0,
) -> dict[str, Any]:
    """Compute clinically relevant derived ratios from band powers.

    Returns:
        {
            "theta_beta_ratio": {"channels": {ch: float}},
            "delta_alpha_ratio": {"channels": {ch: float}},
            "alpha_peak_frequency": {"channels": {ch: float}},
            "frontal_alpha_asymmetry": {"F3_F4": float, "F7_F8": float}
        }
    """
    import numpy as np

    derived: dict[str, Any] = {}

    # Theta/Beta ratio (key ADHD biomarker)
    theta_data = band_powers.get("theta", {}).get("channels", {})
    beta_data = band_powers.get("beta", {}).get("channels", {})
    tbr: dict[str, float] = {}
    for ch in ch_names:
        theta_val = theta_data.get(ch, {}).get("absolute_uv2", 0)
        beta_val = beta_data.get(ch, {}).get("absolute_uv2", 0)
        if beta_val > 0:
            tbr[ch] = round(theta_val / beta_val, 3)
    derived["theta_beta_ratio"] = {"channels": tbr}

    # Delta/Alpha ratio (TBI severity marker)
    delta_data = band_powers.get("delta", {}).get("channels", {})
    alpha_data = band_powers.get("alpha", {}).get("channels", {})
    dar: dict[str, float] = {}
    for ch in ch_names:
        delta_val = delta_data.get(ch, {}).get("absolute_uv2", 0)
        alpha_val = alpha_data.get(ch, {}).get("absolute_uv2", 0)
        if alpha_val > 0:
            dar[ch] = round(delta_val / alpha_val, 3)
    derived["delta_alpha_ratio"] = {"channels": dar}

    # Alpha Peak Frequency (APF) -- sensitive AD/MCI marker
    apf: dict[str, float] = {}
    if freqs is not None and psd_uv2 is not None:
        alpha_mask = (freqs >= 7.0) & (freqs <= 13.0)
        alpha_freqs = freqs[alpha_mask]
        for ch_idx, ch in enumerate(ch_names):
            alpha_psd = psd_uv2[ch_idx, alpha_mask]
            if len(alpha_psd) > 0 and np.max(alpha_psd) > 0:
                peak_idx = int(np.argmax(alpha_psd))
                apf[ch] = round(float(alpha_freqs[peak_idx]), 2)
    derived["alpha_peak_frequency"] = {"channels": apf}

    # Frontal Alpha Asymmetry (FAA) -- depression biomarker
    # FAA = ln(F4_alpha) - ln(F3_alpha)
    # Positive FAA (F4 > F3) = relative left frontal hypoactivation = depression risk
    faa: dict[str, float] = {}
    for left, right, label in [("F3", "F4", "F3_F4"), ("F7", "F8", "F7_F8")]:
        l_alpha = alpha_data.get(left, {}).get("absolute_uv2", 0)
        r_alpha = alpha_data.get(right, {}).get("absolute_uv2", 0)
        if l_alpha > 0 and r_alpha > 0:
            faa[label] = round(math.log(r_alpha) - math.log(l_alpha), 4)
    derived["frontal_alpha_asymmetry"] = faa

    return derived


def apply_artifact_rejection(
    raw: Any,
    threshold_uv: float = 100.0,
    flat_threshold_uv: float = 0.5,
) -> tuple[Any, dict[str, Any]]:
    """Basic artifact rejection via amplitude threshold.

    Args:
        raw: MNE Raw object
        threshold_uv: reject epochs where peak-to-peak > this value (microvolts)
        flat_threshold_uv: reject channels flatter than this (microvolts)

    Returns:
        (cleaned_raw, rejection_stats)
    """
    import numpy as np

    data = raw.get_data() * 1e6  # Convert to microvolts
    ch_names = raw.ch_names
    sfreq = raw.info["sfreq"]

    # 2-second epochs
    epoch_samples = int(2.0 * sfreq)
    n_epochs = data.shape[1] // epoch_samples

    rejected_channels: list[str] = []
    channel_stats: dict[str, dict[str, Any]] = {}

    for ch_idx, ch_name in enumerate(ch_names):
        ch_data = data[ch_idx]
        ptp = float(np.ptp(ch_data))
        std = float(np.std(ch_data))

        # Check for flat channel
        is_flat = std < flat_threshold_uv

        # Count epochs exceeding threshold
        bad_epochs = 0
        for ep in range(n_epochs):
            start = ep * epoch_samples
            end = start + epoch_samples
            ep_ptp = float(np.ptp(ch_data[start:end]))
            if ep_ptp > threshold_uv:
                bad_epochs += 1

        rejection_pct = (bad_epochs / n_epochs * 100) if n_epochs > 0 else 0

        channel_stats[ch_name] = {
            "peak_to_peak_uv": round(ptp, 2),
            "std_uv": round(std, 2),
            "is_flat": is_flat,
            "bad_epochs": bad_epochs,
            "total_epochs": n_epochs,
            "rejection_pct": round(rejection_pct, 1),
        }

        if is_flat or rejection_pct > 50:
            rejected_channels.append(ch_name)

    # Drop bad channels if any (but keep at least 7 channels)
    cleaned_raw = raw.copy()
    if rejected_channels and (len(ch_names) - len(rejected_channels)) >= 7:
        cleaned_raw.drop_channels(rejected_channels)
        _log.info("Dropped %d bad channels: %s", len(rejected_channels), rejected_channels)

    stats = {
        "channels": channel_stats,
        "rejected_channels": rejected_channels,
        "total_channels": len(ch_names),
        "clean_channels": len(ch_names) - len(rejected_channels),
        "threshold_uv": threshold_uv,
    }

    return cleaned_raw, stats


def _find_dominant_frequency(freqs: Any, psd_uv2: Any, ch_names: list[str]) -> float:
    """Find the dominant frequency across all channels (1-45 Hz range)."""
    import numpy as np

    mask = (freqs >= 1.0) & (freqs <= 45.0)
    masked_freqs = freqs[mask]
    if len(masked_freqs) == 0:
        return 0.0

    # Average PSD across channels
    avg_psd = np.mean(psd_uv2[:, mask], axis=0)
    peak_idx = int(np.argmax(avg_psd))
    return float(masked_freqs[peak_idx])
