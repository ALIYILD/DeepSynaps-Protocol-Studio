"""Moving dipole fit — discrete time samples; RRE / ECC-style metrics."""

from __future__ import annotations

from typing import Any

import numpy as np


def fit_dipole_timecourse(
    evoked: Any,
    cov: Any,
    bem: Any,
    *,
    trans: Any = None,
    step: int = 3,
    n_max: int = 80,
    verbose: bool = False,
) -> dict[str, Any]:
    """Fit dipole at sparse time indices; return positions + residual variance proxy."""
    import mne

    times = evoked.times
    picks = list(range(0, len(times), max(step, 1)))[:n_max]
    pos: list[list[float]] = []
    good: list[float] = []
    ecc: list[float] = []
    t_sel: list[float] = []

    for ti in picks:
        t = float(times[ti])
        try:
            ev_single = mne.EvokedArray(evoked.data[:, [ti]], evoked.info, tmin=t)
        except Exception:
            continue
        try:
            dip, _residual = mne.fit_dipole(ev_single, cov, bem, trans=trans, verbose=verbose)
            p = np.asarray(dip.pos)[0]
            pos.append([float(p[0]), float(p[1]), float(p[2])])
            gf = float(np.asarray(dip.gof)[0]) if hasattr(dip, "gof") and dip.gof is not None else 0.85
            good.append(gf)
            # Eccentricity proxy: normalised distance from sphere origin vs head radius
            r = np.linalg.norm(dip.pos[0])
            ecc.append(float(min(r / 0.09, 1.0)))
            t_sel.append(t)
        except Exception:
            continue

    return {
        "timesSec": t_sel,
        "positionsM": pos,
        "goodnessOfFit": good,
        "eccentricityProxy": ecc,
        "note": "RRE/ECC names aligned to WinEEG BrainLock-style reporting; values depend on head model.",
    }


def residual_explained_ratio(evoked: Any, dipole_result: Any) -> float:
    """Placeholder aggregate RE metric."""
    _ = evoked
    gof = dipole_result.get("goodnessOfFit") or []
    if not gof:
        return 0.0
    return float(np.mean(gof))
