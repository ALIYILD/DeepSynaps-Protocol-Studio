"""ERP averaging and per-trial waveforms for live inclusion toggles."""

from __future__ import annotations

from typing import Any

import numpy as np


def evoked_by_condition(epochs: Any) -> dict[str, Any]:
    """Return dict name → evoked mean + trial counts."""
    import mne

    out: dict[str, Any] = {}
    for name in epochs.event_id:
        ev: mne.Evoked = epochs[name].average()
        data_uv = ev.data * 1e6
        out[name] = {
            "meanUv": data_uv.tolist(),
            "nTrials": len(epochs[name]),
            "timesSec": ev.times.tolist(),
        }
    return out


def per_trial_erp_uv(epochs: Any, trial_ids: list[str] | None = None) -> list[dict[str, Any]]:
    """One ERP slice per epoch (µV), shape (n_ch, n_times), with metadata."""
    trials_out: list[dict[str, Any]] = []
    ev_id_inv = {v: k for k, v in epochs.event_id.items()}
    for i in range(len(epochs)):
        ep = epochs[i]
        code = int(ep.events[0, 2])
        cls = ev_id_inv.get(code, str(code))
        data_uv = ep.get_data(copy=False)[0] * 1e6
        tid = ep.events[0, 0]
        trials_out.append(
            {
                "epochIndex": i,
                "trialId": trial_ids[i] if trial_ids and i < len(trial_ids) else "",
                "sample": int(tid),
                "class": cls,
                "erpUv": data_uv.astype(np.float32).tolist(),
                "included": True,
            }
        )
    return trials_out


def reaverage_from_trials(
    trials_payload: list[dict[str, Any]],
    *,
    times_sec: list[float],
    event_id_keys: list[str],
) -> dict[str, Any]:
    """Client sends subset after toggling included flags — recompute group means from cached arrays."""
    sums: dict[str, np.ndarray | None] = {k: None for k in event_id_keys}
    counts: dict[str, int] = {k: 0 for k in event_id_keys}
    n_ch = 0
    n_t = len(times_sec)
    for row in trials_payload:
        if not row.get("included", True):
            continue
        cls = str(row["class"])
        if cls not in sums:
            continue
        arr = np.asarray(row["erpUv"], dtype=np.float64)
        if sums[cls] is None:
            n_ch = arr.shape[0]
            sums[cls] = np.zeros((n_ch, n_t), dtype=np.float64)
        sums[cls] = sums[cls] + arr  # type: ignore[operator]
        counts[cls] += 1
    out: dict[str, Any] = {}
    for k in event_id_keys:
        if counts[k] > 0 and sums[k] is not None:
            out[k] = (sums[k] / counts[k]).tolist()
        else:
            out[k] = []
    return {"meanByClassUv": out, "counts": counts}
