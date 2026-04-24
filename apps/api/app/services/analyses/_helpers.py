"""Shared helpers for the advanced analysis engine.

Provides PSD caching, context building, channel mapping constants,
and frequency band definitions shared across all analysis modules.
"""
from __future__ import annotations

import logging
from typing import Any

import numpy as np
from scipy.signal import welch

_log = logging.getLogger(__name__)

# ── Frequency bands (re-exported from spectral_analysis for convenience) ─────

DEFAULT_BANDS: dict[str, tuple[float, float]] = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 12.0),
    "beta": (12.0, 30.0),
    "high_beta": (20.0, 30.0),
    "gamma": (30.0, 45.0),
}

# ── Homologous channel pairs (old 10-20 names as used by backend) ────────────
# Each tuple is (left, right) for asymmetry calculations.

HOMOLOGOUS_PAIRS: list[tuple[str, str]] = [
    ("Fp1", "Fp2"),
    ("F7", "F8"),
    ("F3", "F4"),
    ("T3", "T4"),
    ("C3", "C4"),
    ("T5", "T6"),
    ("P3", "P4"),
    ("O1", "O2"),
]

# ── Channel name mapping: backend (old 10-20) -> frontend SVG (modern) ───────

BACKEND_TO_FRONTEND_CHANNEL: dict[str, str] = {
    "T3": "T7",
    "T4": "T8",
    "T5": "P7",
    "T6": "P8",
}

FRONTEND_TO_BACKEND_CHANNEL: dict[str, str] = {v: k for k, v in BACKEND_TO_FRONTEND_CHANNEL.items()}

# Standard 19-channel 10-20 set (backend naming)
STANDARD_19: list[str] = [
    "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
    "T3", "C3", "Cz", "C4", "T4",
    "T5", "P3", "Pz", "P4", "T6",
    "O1", "O2",
]


# ── PSD cache ─────────────────────────────────────────────────────────────────

def compute_psd_cache(
    raw: Any,
    epoch_sec: float = 2.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute Welch PSD once for reuse across analyses.

    Returns:
        (freqs, psd_uv2) where psd_uv2 is in uV^2/Hz, shape (n_ch, n_freqs)
    """
    data = raw.get_data()  # V
    sfreq = raw.info["sfreq"]

    nperseg = int(epoch_sec * sfreq)
    if nperseg > data.shape[1]:
        nperseg = data.shape[1]

    freqs, psd = welch(data, fs=sfreq, nperseg=nperseg, axis=1)
    # Convert V^2/Hz -> uV^2/Hz
    psd_uv2 = psd * 1e12

    return freqs, psd_uv2


def compute_band_power_from_psd(
    freqs: np.ndarray,
    psd_uv2: np.ndarray,
    fmin: float,
    fmax: float,
) -> np.ndarray:
    """Compute total power in a frequency band for each channel.

    Returns array of shape (n_channels,) with power in uV^2.
    """
    freq_res = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0
    mask = (freqs >= fmin) & (freqs <= fmax)
    return np.sum(psd_uv2[:, mask], axis=1) * freq_res


# ── Context builder ──────────────────────────────────────────────────────────

def build_context(raw: Any, band_powers: dict[str, Any]) -> dict[str, Any]:
    """Build the standardised context dict passed to every analysis function.

    Args:
        raw: MNE Raw object (cleaned, standard 10-20 channels)
        band_powers: existing band_powers result from spectral_analysis

    Returns:
        dict with keys: raw, sfreq, ch_names, data, freqs, psd, band_powers
    """
    data = raw.get_data()  # (n_ch, n_times)
    sfreq = raw.info["sfreq"]
    ch_names = list(raw.ch_names)

    # Compute PSD cache
    freqs, psd_uv2 = compute_psd_cache(raw)

    return {
        "raw": raw,
        "sfreq": sfreq,
        "ch_names": ch_names,
        "data": data,
        "freqs": freqs,
        "psd": psd_uv2,
        "band_powers": band_powers,
    }


def channels_present(ch_names: list[str], required: list[str]) -> list[str]:
    """Return the subset of required channels that are present."""
    s = set(ch_names)
    return [ch for ch in required if ch in s]


def safe_log_ratio(a: float, b: float) -> float:
    """Compute ln(a) - ln(b) safely, returning 0 if either is <= 0."""
    if a <= 0 or b <= 0:
        return 0.0
    return float(np.log(a) - np.log(b))
