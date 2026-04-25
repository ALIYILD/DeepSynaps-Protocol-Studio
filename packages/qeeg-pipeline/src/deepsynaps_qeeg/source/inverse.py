"""Inverse operator construction and application helpers."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Literal, overload

if TYPE_CHECKING:  # pragma: no cover
    import mne

log = logging.getLogger(__name__)

InverseMethod = Literal["eLORETA", "sLORETA", "dSPM", "MNE"]


def compute_inverse_operator(
    raw: "mne.io.BaseRaw",
    forward: "mne.Forward",
    noise_cov: "mne.Covariance",
) -> "mne.minimum_norm.InverseOperator":
    """Compute an inverse operator for EEG.

    Parameters
    ----------
    raw
        Cleaned raw. Only ``raw.info`` is used.
    forward
        Forward solution.
    noise_cov
        Noise covariance.

    Returns
    -------
    inverse_operator
        Inverse operator.
    """
    import mne

    # MNE >=1.12 requires the average reference projector for EEG modeling.
    raw_ref = raw.copy()
    raw_ref.set_eeg_reference("average", projection=True, verbose="WARNING")

    inv = mne.minimum_norm.make_inverse_operator(
        raw_ref.info,
        forward,
        noise_cov,
        loose=0.2,
        depth=0.8,
        verbose="WARNING",
    )
    return inv


@overload
def apply_inverse(
    raw_or_evoked: "mne.Evoked",
    inverse_operator: "mne.minimum_norm.InverseOperator",
    *,
    method: InverseMethod = "eLORETA",
    lambda2: float = 1.0 / 9.0,
) -> "mne.SourceEstimate": ...


@overload
def apply_inverse(
    raw_or_evoked: "mne.Epochs",
    inverse_operator: "mne.minimum_norm.InverseOperator",
    *,
    method: InverseMethod = "eLORETA",
    lambda2: float = 1.0 / 9.0,
) -> list["mne.SourceEstimate"]: ...


@overload
def apply_inverse(
    raw_or_evoked: "mne.io.BaseRaw",
    inverse_operator: "mne.minimum_norm.InverseOperator",
    *,
    method: InverseMethod = "eLORETA",
    lambda2: float = 1.0 / 9.0,
) -> "mne.SourceEstimate": ...


def apply_inverse(
    raw_or_evoked,
    inverse_operator,
    *,
    method: InverseMethod = "eLORETA",
    lambda2: float = 1.0 / 9.0,
):
    """Apply an inverse operator to raw/epochs/evoked.

    Parameters
    ----------
    raw_or_evoked
        One of Raw, Epochs, or Evoked.
    inverse_operator
        Inverse operator from :func:`compute_inverse_operator`.
    method
        One of ``{"eLORETA","sLORETA","dSPM","MNE"}``. Default ``"eLORETA"``.
    lambda2
        Regularization parameter. Default (1/9) (~SNR=3).
    """
    import mne

    if method not in ("eLORETA", "sLORETA", "dSPM", "MNE"):
        raise ValueError(f"Unsupported inverse method: {method!r}")

    if isinstance(raw_or_evoked, mne.Evoked):
        inst = raw_or_evoked.copy()
        inst.set_eeg_reference("average", projection=True, verbose="WARNING")
        return mne.minimum_norm.apply_inverse(
            inst,
            inverse_operator,
            lambda2=lambda2,
            method=method,
            pick_ori=None,
            verbose="WARNING",
        )

    if isinstance(raw_or_evoked, mne.Epochs):
        inst = raw_or_evoked.copy()
        inst.set_eeg_reference("average", projection=True, verbose="WARNING")
        return mne.minimum_norm.apply_inverse_epochs(
            inst,
            inverse_operator,
            lambda2=lambda2,
            method=method,
            pick_ori=None,
            verbose="WARNING",
        )

    if isinstance(raw_or_evoked, mne.io.BaseRaw):
        # Use a single STC over the whole recording (not used by pipeline, but helpful API).
        inst = raw_or_evoked.copy()
        inst.set_eeg_reference("average", projection=True, verbose="WARNING")
        return mne.minimum_norm.apply_inverse_raw(
            inst,
            inverse_operator,
            lambda2=lambda2,
            method=method,
            pick_ori=None,
            verbose="WARNING",
        )

    raise TypeError(f"Unsupported type for apply_inverse: {type(raw_or_evoked)!r}")

