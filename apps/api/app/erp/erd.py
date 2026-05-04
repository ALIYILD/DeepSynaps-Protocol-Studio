"""Event-related desynchronization — Pfurtscheller-style % change vs baseline."""

from __future__ import annotations

from typing import Any

import numpy as np


def erd_percent_timecourse(
    epochs: Any,
    *,
    band_hz: tuple[float, float],
    baseline_tmin: float,
    baseline_tmax: float,
) -> dict[str, Any]:
    """Band-power time course per channel, baseline-normalized (A−R)/R × 100."""
    import mne
    from scipy import signal as scipy_signal

    sfreq = float(epochs.info["sfreq"])
    lo, hi = band_hz
    nyq = sfreq / 2.0
    hi = min(hi, nyq - 0.5)
    lo = max(lo, 0.5)
    sos = scipy_signal.butter(4, [lo, hi], btype="bandpass", fs=sfreq, output="sos")

    times = epochs.times
    bmask = (times >= baseline_tmin) & (times <= baseline_tmax)

    out_cond: dict[str, Any] = {}
    for name in epochs.event_id:
        eps = epochs[name].get_data(copy=False) * 1e6  # V → µV
        n_ep, n_ch, _ = eps.shape
        pow_tc = np.zeros((n_ch, len(times)), dtype=np.float64)
        for ei in range(n_ep):
            for ci in range(n_ch):
                xf = scipy_signal.sosfiltfilt(sos, eps[ei, ci].astype(np.float64))
                pow_tc[ci] += xf**2
        pow_tc /= max(n_ep, 1)
        R = np.maximum(np.mean(pow_tc[:, bmask], axis=1, keepdims=True), 1e-12)
        pct = (pow_tc - R) / R * 100.0
        out_cond[name] = {
            "percentPower": pct.astype(np.float32).tolist(),
            "timesSec": times.tolist(),
            "bandHz": list(band_hz),
        }
    return {"byClass": out_cond}
