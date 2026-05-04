"""Event-related coherence — sliding coherence around stimulus."""

from __future__ import annotations

from typing import Any

import numpy as np


def ercoh_pair_timecourse(
    epochs: Any,
    *,
    ch_a: int,
    ch_b: int,
    band_hz: tuple[float, float],
    win_ms: float,
) -> dict[str, Any]:
    """Per-epoch averaged magnitude-squared coherence vs time (sliding window)."""
    from scipy import signal as scipy_signal

    sfreq = float(epochs.info["sfreq"])
    lo, hi = band_hz
    win_samp = max(8, int(win_ms / 1000.0 * sfreq))
    hop = max(1, win_samp // 4)

    data = epochs.get_data(copy=False) * 1e6
    n_ep, _, n_t = data.shape
    times = epochs.times

    centers: list[float] = []
    coh_vals: list[float] = []

    for start in range(0, n_t - win_samp, hop):
        seg_a = data[:, ch_a, start : start + win_samp].reshape(-1)
        seg_b = data[:, ch_b, start : start + win_samp].reshape(-1)
        if seg_a.size < 8:
            continue
        f, coh = scipy_signal.coherence(seg_a, seg_b, fs=sfreq, nperseg=min(win_samp, len(seg_a)))
        m = (f >= lo) & (f <= hi)
        if not np.any(m):
            continue
        centers.append(float(times[start + win_samp // 2]))
        coh_vals.append(float(np.nanmean(coh[m] ** 2)))

    return {
        "timeCentersSec": centers,
        "cohMagSqMeanBand": coh_vals,
        "channels": [ch_a, ch_b],
        "bandHz": list(band_hz),
    }
