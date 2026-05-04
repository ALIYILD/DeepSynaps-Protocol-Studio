"""Single-spike dipole fit at peak — feeds M10-style RRE/ECC arrays."""

from __future__ import annotations

from typing import Any

import numpy as np


def dipole_at_spike_peak(
    raw: Any,
    peak_sec: float,
    *,
    pre_ms: float = 50.0,
    post_ms: float = 50.0,
) -> dict[str, Any]:
    import mne

    from app.source.dipole_fit import fit_dipole_timecourse
    from app.source.forward import make_sphere_forward

    raw = raw.copy().pick_types(eeg=True, meg=False, stim=False)
    raw.load_data()
    sfreq = float(raw.info["sfreq"])
    samp = int(peak_sec * sfreq)
    events = np.array([[samp, 0, 1]])
    epochs = mne.Epochs(
        raw,
        events,
        event_id=1,
        tmin=-pre_ms / 1000.0,
        tmax=post_ms / 1000.0,
        baseline=None,
        preload=True,
        verbose=False,
    )
    if len(epochs) < 1:
        return {"ok": False, "error": "empty_epochs"}
    evoked = epochs.average()
    scale = float(np.mean(np.std(epochs.get_data(), axis=2))) + 1e-15
    noise_std_v = max(scale, 5e-6)
    cov = mne.make_ad_hoc_cov(evoked.info, std=dict(eeg=noise_std_v))
    sphere, _src, _fwd = make_sphere_forward(evoked.info, pos_mm=18.0, verbose=False)
    out = fit_dipole_timecourse(evoked, cov, sphere, step=1, n_max=min(64, len(evoked.times)), verbose=False)
    out["ok"] = True
    out["peakSec"] = peak_sec
    out["windowMs"] = [pre_ms, post_ms]
    return out
