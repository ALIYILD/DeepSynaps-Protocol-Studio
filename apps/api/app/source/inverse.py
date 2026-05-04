"""Minimum-norm inverse (sLORETA / MNE / dSPM)."""

from __future__ import annotations

from typing import Any

import numpy as np


def make_inverse_and_apply(
    evoked: Any,
    fwd: Any,
    noise_cov: Any,
    *,
    method: str = "sLORETA",
    lambda2: float = 1.0 / 9.0,
    loose: float = 0.2,
    depth: float = 0.8,
    verbose: bool = False,
) -> tuple[Any, Any]:
    """Return (inverse_operator, stc_full_timeseries)."""
    import mne

    inv = mne.minimum_norm.make_inverse_operator(
        evoked.info,
        fwd,
        noise_cov,
        loose=loose,
        depth=depth,
        verbose=verbose,
    )
    stc = mne.minimum_norm.apply_inverse(evoked, inv, lambda2=lambda2, method=method, verbose=verbose)
    return inv, stc


def stc_peak_snapshot(stc: Any, *, pick_time_index: int | None = None) -> dict[str, Any]:
    """Peak in vertex × time grid; row index matches concatenated source space order."""
    data = np.asarray(stc.data)
    n_vert, n_times = data.shape
    if pick_time_index is None:
        flat = np.argmax(np.abs(data))
        tidx = flat // n_vert
        vidx = int(flat % n_vert)
    else:
        tidx = int(np.clip(pick_time_index, 0, n_times - 1))
        vidx = int(np.argmax(np.abs(data[:, tidx])))
    peak_val = float(data[vidx, tidx])
    return {
        "peakVertex": vidx,
        "peakValue": peak_val,
        "timeIndex": tidx,
        "timeSec": float(stc.times[tidx]) if hasattr(stc, "times") else None,
        "nVertices": n_vert,
        "nTimes": n_times,
    }
