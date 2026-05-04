"""Classical sharp-wave detection — amplitude, duration, second-derivative gate."""

from __future__ import annotations

from typing import Any

import numpy as np


def _merge_spikes(
    items: list[tuple[float, str, float, float, float]],
    min_sep_sec: float,
) -> list[tuple[float, str, float, float, float]]:
    """Keep strongest peak-to-peak within min_sep_sec per channel."""
    items = sorted(items, key=lambda x: (x[1], x[0]))
    out: list[tuple[float, str, float, float, float]] = []
    for t, ch, p2p, dur, dz in items:
        if out and out[-1][1] == ch and abs(t - out[-1][0]) < min_sep_sec:
            if p2p > out[-1][2]:
                out[-1] = (t, ch, p2p, dur, dz)
            continue
        out.append((t, ch, p2p, dur, dz))
    return out


def detect_spikes_classical(
    raw: Any,
    *,
    from_sec: float,
    to_sec: float,
    channel_names: list[str] | None = None,
    amp_uv_min: float = 70.0,
    dur_ms_min: float = 20.0,
    dur_ms_max: float = 70.0,
    deriv_z_min: float = 3.5,
    max_ms: float = 70.0,
    step_ms: float = 2.0,
) -> list[dict[str, Any]]:
    """
    Sliding-window peak-to-peak (µV) + duration check + |s''| z-score gate.

    Mirrors WinEEG-style defaults (≥70 µV, 20–70 ms). Uses the dominant extremum
    in each qualifying window as *peakSec*.
    """
    raw = raw.copy()
    raw.pick_types(eeg=True, meg=False, stim=False)
    if channel_names:
        want = [c for c in channel_names if c in raw.ch_names]
        if want:
            raw.pick(want)
    raw.load_data()
    sfreq = float(raw.info["sfreq"])
    i0 = max(0, int(from_sec * sfreq))
    i1 = min(raw.n_times, int(to_sec * sfreq))
    if i1 <= i0 + 10:
        return []

    raw.filter(l_freq=5.0, h_freq=70.0, picks="eeg", verbose=False)
    data_uv = raw.get_data(start=i0, stop=i1) * 1e6
    ch_names = raw.ch_names
    win = max(3, int(max_ms / 1000.0 * sfreq))
    step = max(1, int(step_ms / 1000.0 * sfreq))

    cand: list[tuple[float, str, float, float, float]] = []

    for ci, ch in enumerate(ch_names):
        x = np.asarray(data_uv[ci], dtype=np.float64)
        if x.size < win + 2:
            continue
        d1 = np.diff(x)
        d2 = np.diff(d1)
        med = float(np.median(d2))
        mad = float(np.median(np.abs(d2 - med))) + 1e-9
        z_d2 = (d2 - med) / (1.4826 * mad)

        for start in range(0, len(x) - win, step):
            seg = x[start : start + win]
            i_max = int(np.argmax(seg))
            i_min = int(np.argmin(seg))
            p2p = float(seg[i_max] - seg[i_min])
            order = sorted([i_max, i_min])
            dur_ms = float((order[1] - order[0]) / sfreq * 1000.0)
            if p2p < amp_uv_min or dur_ms < dur_ms_min or dur_ms > dur_ms_max:
                continue
            peak_off = start + (i_max if abs(seg[i_max]) >= abs(seg[i_min]) else i_min)
            zi = peak_off - 2
            if zi < 0 or zi >= len(z_d2):
                dz = 0.0
            else:
                dz = float(abs(z_d2[zi]))
            if dz < deriv_z_min:
                continue
            peak_sec = float(i0 + peak_off) / sfreq
            cand.append((peak_sec, ch, p2p, dur_ms, dz))

    merged = _merge_spikes(cand, min_sep_sec=0.03)

    out: list[dict[str, Any]] = []
    for peak_sec, ch, p2p, dur_ms, dz in merged:
        out.append(
            {
                "peakSec": peak_sec,
                "channel": ch,
                "peakToPeakUv": round(p2p, 2),
                "durationMs": round(dur_ms, 2),
                "derivZ": round(dz, 2),
                "detector": "classical",
            }
        )
    return sorted(out, key=lambda r: r["peakSec"])
