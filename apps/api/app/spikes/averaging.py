"""Spike-triggered averaging — grand mean and per-channel subsets."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import numpy as np


def spike_triggered_average(
    raw: Any,
    peaks: list[dict[str, Any]],
    *,
    pre_ms: float = 300.0,
    post_ms: float = 300.0,
) -> dict[str, Any]:
    """
    Parameters
    ----------
    peaks : rows with ``peakSec`` (required) and optional ``channel`` for grouping.
    """
    import mne

    raw = raw.copy().pick_types(eeg=True, meg=False, stim=False)
    raw.load_data()
    sfreq = float(raw.info["sfreq"])
    if not peaks:
        return {"ok": False, "error": "no peaks"}

    times_sec = [float(p["peakSec"]) for p in peaks if p.get("peakSec") is not None]
    if not times_sec:
        return {"ok": False, "error": "no peakSec"}

    events = np.array([[int(t * sfreq), 0, 1] for t in times_sec])
    epochs = mne.Epochs(
        raw,
        events,
        event_id=1,
        tmin=-pre_ms / 1000.0,
        tmax=post_ms / 1000.0,
        baseline=(None, 0),
        preload=True,
        verbose=False,
    )
    ev_all = epochs.average()
    grand = {
        "timesSec": ev_all.times.tolist(),
        "meanUvPerChannel": (ev_all.data * 1e6).tolist(),
        "channelNames": ev_all.ch_names,
        "nEpochs": len(times_sec),
    }

    by_channel: dict[str, Any] = {}
    grouped: dict[str, list[float]] = defaultdict(list)
    for p in peaks:
        t = float(p["peakSec"])
        ch = str(p.get("channel") or "")
        if ch:
            grouped[ch].append(t)

    for ch, tlist in grouped.items():
        if len(tlist) < 1:
            continue
        ev_ts = np.array([[int(t * sfreq), 0, 1] for t in tlist])
        ep = mne.Epochs(
            raw,
            ev_ts,
            event_id=1,
            tmin=-pre_ms / 1000.0,
            tmax=post_ms / 1000.0,
            baseline=(None, 0),
            preload=True,
            verbose=False,
        )
        evk = ep.average()
        by_channel[ch] = {
            "timesSec": evk.times.tolist(),
            "meanUvPerChannel": (evk.data * 1e6).tolist(),
            "channelNames": evk.ch_names,
            "nEpochs": len(tlist),
        }

    return {"ok": True, "grandAverage": grand, "byChannel": by_channel, "preMs": pre_ms, "postMs": post_ms}
