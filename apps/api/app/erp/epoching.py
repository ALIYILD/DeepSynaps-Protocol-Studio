"""MNE epoching from in-memory trial list (M5 / recording_eeg_events)."""

from __future__ import annotations

from typing import Any

import numpy as np

from app.routers.recording_eeg_events_router import _trials_list


def get_trials_for_analysis(analysis_id: str) -> list[dict[str, Any]]:
    return list(_trials_list(analysis_id))


def filter_trials(
    trials: list[dict[str, Any]],
    *,
    stimulus_classes: list[str] | None,
) -> list[dict[str, Any]]:
    if not stimulus_classes:
        return [t for t in trials if t.get("included", True)]
    want = {c.strip() for c in stimulus_classes if c.strip()}
    out: list[dict[str, Any]] = []
    for tr in trials:
        if not tr.get("included", True):
            continue
        cls = str(tr.get("class", "Standard")).strip()
        if cls not in want:
            continue
        out.append(tr)
    return out


def unique_classes_from_trials(trials: list[dict[str, Any]]) -> list[str]:
    return sorted({str(t.get("class", "Standard")).strip() for t in trials if t.get("included", True)})


def trials_to_mne_events(
    trials: list[dict[str, Any]],
    *,
    sfreq: float,
    n_times: int,
    stimulus_classes: list[str],
) -> tuple[np.ndarray, dict[str, int], list[str]]:
    """Build MNE events array (n_events, 3), event_id map, trial ids (aligned rows)."""
    ids = {name: i + 1 for i, name in enumerate(sorted(set(stimulus_classes)))}
    rows: list[list[int]] = []
    tids: list[str] = []
    for tr in trials:
        cls = str(tr.get("class", "Standard")).strip()
        if cls not in ids:
            continue
        s = int(round(float(tr.get("onsetSec", tr.get("onset_sec", 0))) * sfreq))
        if s < 0 or s >= n_times:
            continue
        rows.append([s, 0, ids[cls]])
        tids.append(str(tr.get("id", "")))
    if not rows:
        return np.zeros((0, 3), dtype=np.int64), ids, []
    ev = np.asarray(rows, dtype=np.int64)
    order = np.argsort(ev[:, 0])
    ev = ev[order]
    tids = [tids[i] for i in order]
    return ev, ids, tids


def apply_linear_baseline_to_epochs(epochs: Any, *, tmin_bl: float, tmax_bl: float) -> None:
    """In-place: subtract linear trend fit on [tmin_bl, tmax_bl] per epoch × channel."""
    import mne

    if not isinstance(epochs, mne.Epochs):
        return
    times = epochs.times
    bl_mask = (times >= tmin_bl) & (times <= tmax_bl)
    if not bl_mask.any():
        return
    x_bl = times[bl_mask]
    data = epochs.get_data(copy=False)
    for ei in range(data.shape[0]):
        for ci in range(data.shape[1]):
            y = data[ei, ci].astype("float64", copy=False)
            y_bl = y[bl_mask]
            if y_bl.size < 2:
                continue
            coeffs = np.polyfit(x_bl, y_bl, 1)
            trend = np.polyval(coeffs, times)
            data[ei, ci] = y - trend


def build_epochs(
    raw: Any,
    *,
    trials: list[dict[str, Any]],
    stimulus_classes: list[str],
    tmin_sec: float,
    tmax_sec: float,
    baseline: tuple[float, float] | None,
    reject_uv: dict[str, float] | None,
    flat_uv: dict[str, float] | None,
) -> Any:
    """Return mne.Epochs."""
    import mne

    sfreq = float(raw.info["sfreq"])
    n_times = len(raw.times)
    filt = filter_trials(trials, stimulus_classes=stimulus_classes if stimulus_classes else None)
    filt_sorted = sorted(
        filt,
        key=lambda t: float(t.get("onsetSec", t.get("onset_sec", 0))),
    )
    classes_use = stimulus_classes if stimulus_classes else unique_classes_from_trials(filt)
    if not classes_use:
        raise ValueError("no stimulus classes in trials")
    events, id_map, trial_ids_ordered = trials_to_mne_events(
        filt_sorted,
        sfreq=sfreq,
        n_times=n_times,
        stimulus_classes=classes_use,
    )
    if events.shape[0] == 0:
        raise ValueError("no matching trials for epoching")

    event_id = {k: v for k, v in id_map.items()}
    picks = mne.pick_types(raw.info, meg=False, eeg=True, exclude=[])

    reject = None
    if reject_uv:
        rej = reject_uv.get("eeg")
        if rej is not None:
            reject = {"eeg": float(rej) * 1e-6}
    flat = None
    if flat_uv:
        fu = flat_uv.get("eeg")
        if fu is not None:
            flat = {"eeg": float(fu) * 1e-6}

    epochs = mne.Epochs(
        raw,
        events,
        event_id=event_id,
        tmin=tmin_sec,
        tmax=tmax_sec,
        baseline=baseline,
        picks=picks,
        preload=True,
        reject=reject,
        flat=flat,
        verbose=False,
    )
    return epochs, trial_ids_ordered
