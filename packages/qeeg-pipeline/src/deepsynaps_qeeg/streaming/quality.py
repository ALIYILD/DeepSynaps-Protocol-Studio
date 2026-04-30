"""Window-level data quality indicators for live qEEG monitoring."""

from __future__ import annotations

from typing import Any

import numpy as np

# numpy 2.0 removes np.trapz; 1.x does not have np.trapezoid.
_trapz = getattr(np, "trapezoid", None) or getattr(np, "trapz")


def compute_quality_indicators(
    window: np.ndarray,
    *,
    sfreq: float,
    line_freq_hz: float = 50.0,
) -> dict[str, Any]:
    """Compute lightweight quality metrics from a single 1-second window.

    The goal is stable monitoring cues, not clinical-grade artifact detection.

    Returns
    -------
    dict
        ``{"impedance_kohm": None, "flatline_frac": float, "clipping_frac": float,
        "line_noise_ratio": float, "rms_uv": {"<ch>": float, ...}}``.
    """
    x = np.asarray(window, dtype=float)
    if x.ndim != 2:
        raise ValueError("window must be 2D (n_ch, n_samp)")
    n_ch, n_samp = x.shape
    if n_samp < 8:
        return {
            "impedance_kohm": None,
            "flatline_frac": 1.0,
            "clipping_frac": 0.0,
            "line_noise_ratio": 0.0,
            "rms_uv": {},
        }

    # RMS per channel (µV)
    rms = np.sqrt(np.mean(x * x, axis=-1)) * 1e6
    rms_uv = {f"ch{i+1}": float(rms[i]) for i in range(n_ch)}

    # Flatline: channels with near-zero variance
    var = np.var(x, axis=-1)
    flat = float(np.mean(var < 1e-14))

    # Clipping: fraction of samples at exact per-channel extrema (flat tops)
    mins = x.min(axis=-1, keepdims=True)
    maxs = x.max(axis=-1, keepdims=True)
    clip = float(np.mean((x == mins) | (x == maxs)))

    # Line noise: ratio of power in a narrow band around 50/60 Hz vs 1–45 Hz.
    line_ratio = float(_line_noise_ratio(x, sfreq=float(sfreq), line_freq_hz=float(line_freq_hz)))

    return {
        "impedance_kohm": None,
        "flatline_frac": flat,
        "clipping_frac": clip,
        "line_noise_ratio": line_ratio,
        "rms_uv": rms_uv,
    }


def _line_noise_ratio(x: np.ndarray, sfreq: float, line_freq_hz: float) -> float:
    n = x.shape[-1]
    w = np.hanning(n)
    xf = np.fft.rfft(x * w, axis=-1)
    psd = (np.abs(xf) ** 2) / (np.sum(w**2) + 1e-12)
    freqs = np.fft.rfftfreq(n, d=1.0 / sfreq)

    def band(lo: float, hi: float) -> float:
        m = (freqs >= lo) & (freqs <= hi)
        if not np.any(m):
            return 0.0
        # average across channels for a single scalar ratio
        return float(np.mean(_trapz(psd[:, m], freqs[m], axis=-1)))

    total = band(1.0, 45.0)
    line = band(line_freq_hz - 1.0, line_freq_hz + 1.0)
    if total <= 0:
        return 0.0
    return float(line / total)

