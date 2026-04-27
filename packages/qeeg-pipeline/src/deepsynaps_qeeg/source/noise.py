"""Noise covariance estimation for EEG inverse modeling."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    import mne

log = logging.getLogger(__name__)


def estimate_noise_covariance(
    *,
    raw: "mne.io.BaseRaw | None" = None,
    epochs: "mne.Epochs | None" = None,
    empty_room_raw: "mne.io.BaseRaw | None" = None,
) -> "mne.Covariance":
    """Estimate noise covariance with automatic regularization.

    Priority:
    1) empty-room raw (if provided)
    2) eyes-closed baseline from epochs/raw (if provided)

    Parameters
    ----------
    raw
        Cleaned raw EEG. Used when ``epochs`` is not provided.
    epochs
        Cleaned epochs (preferred when available).
    empty_room_raw
        Optional empty-room recording to estimate environmental noise.

    Returns
    -------
    noise_cov
        Noise covariance suitable for :func:`mne.minimum_norm.make_inverse_operator`.
    """
    import mne

    if empty_room_raw is not None:
        log.info("Estimating noise covariance from empty-room recording.")
        return mne.compute_raw_covariance(empty_room_raw, method="auto", verbose="WARNING")

    if epochs is not None:
        log.info("Estimating noise covariance from epochs (method='auto').")
        return mne.compute_covariance(epochs, method="auto", verbose="WARNING")

    if raw is None:
        raise ValueError("Provide one of empty_room_raw, epochs, or raw.")

    # Baseline window heuristic for resting state: avoid initial/ending edges if possible.
    tmax = float(raw.times[-1])
    tmin = 10.0 if tmax > 20.0 else 0.0
    tstop = min(tmax, tmin + 30.0)
    if (tmax - tstop) < 5.0 and tmax > 5.0:
        tstop = max(tmin, tmax - 5.0)

    log.info("Estimating noise covariance from raw segment %.1f–%.1fs.", tmin, tstop)
    baseline = raw.copy().crop(tmin=tmin, tmax=tstop)
    return mne.compute_raw_covariance(baseline, method="auto", verbose="WARNING")

