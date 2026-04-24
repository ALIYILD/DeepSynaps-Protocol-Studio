"""Connectivity features — wPLI + coherence per band via mne-connectivity.

Output matches ``CONTRACT.md §1.1.connectivity``::

    {
      "wpli":      {"<band>": [[float, ...], ...]},  # N_ch × N_ch symmetric, 0 diag
      "coherence": {"<band>": [[float, ...], ...]},
      "channels":  ["<ch>", ...],
    }
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import numpy as np

from .. import FREQ_BANDS

if TYPE_CHECKING:  # pragma: no cover
    import mne

log = logging.getLogger(__name__)


def compute(
    epochs: "mne.Epochs",
    bands: dict[str, tuple[float, float]] = FREQ_BANDS,
) -> dict[str, Any]:
    """Compute wPLI and coherence connectivity matrices per band.

    Parameters
    ----------
    epochs : mne.Epochs
        Cleaned EEG epochs.
    bands : dict
        Band name → (lo, hi) Hz map.

    Returns
    -------
    dict
        Keys: ``wpli`` (band → NxN list-of-lists), ``coherence`` (same),
        ``channels`` (ordered channel names).
    """
    ch_names = list(epochs.ch_names)
    n_ch = len(ch_names)

    wpli_out: dict[str, list[list[float]]] = {}
    coh_out: dict[str, list[list[float]]] = {}

    try:
        from mne_connectivity import spectral_connectivity_epochs
    except Exception as exc:
        log.warning("mne-connectivity unavailable (%s). Returning zero matrices.", exc)
        zeros = np.zeros((n_ch, n_ch)).tolist()
        for band in bands:
            wpli_out[band] = [row[:] for row in zeros]
            coh_out[band] = [row[:] for row in zeros]
        return {"wpli": wpli_out, "coherence": coh_out, "channels": ch_names}

    sfreq = float(epochs.info["sfreq"])
    for band, (lo, hi) in bands.items():
        try:
            con = spectral_connectivity_epochs(
                epochs,
                method=["wpli", "coh"],
                mode="multitaper",
                sfreq=sfreq,
                fmin=lo,
                fmax=hi,
                faverage=True,
                mt_adaptive=False,
                verbose="WARNING",
            )
            wpli_raw, coh_raw = con[0], con[1]
            wpli_mat = _to_symmetric(wpli_raw.get_data(output="dense"), n_ch)
            coh_mat = _to_symmetric(coh_raw.get_data(output="dense"), n_ch)
        except Exception as exc:
            log.warning("Connectivity failed for band %s (%s); zero-filling.", band, exc)
            wpli_mat = np.zeros((n_ch, n_ch))
            coh_mat = np.zeros((n_ch, n_ch))

        wpli_out[band] = wpli_mat.tolist()
        coh_out[band] = coh_mat.tolist()

    return {"wpli": wpli_out, "coherence": coh_out, "channels": ch_names}


def _to_symmetric(raw: np.ndarray, n_ch: int) -> np.ndarray:
    """Squeeze a (n_ch, n_ch, n_freqs) connectivity array to a symmetric 2-D matrix.

    mne-connectivity returns the lower triangle with zeros on the upper
    triangle and zero diagonal when ``output='dense'``. We symmetrise explicitly
    and zero the diagonal for safety.
    """
    arr = np.asarray(raw)
    # squeeze any singleton freq dim
    while arr.ndim > 2 and arr.shape[-1] == 1:
        arr = arr[..., 0]
    if arr.ndim > 2:
        arr = arr.mean(axis=-1)

    if arr.shape != (n_ch, n_ch):
        log.warning("Unexpected connectivity shape %s; resizing.", arr.shape)
        pad = np.zeros((n_ch, n_ch))
        m = min(arr.shape[0], n_ch), min(arr.shape[1], n_ch)
        pad[: m[0], : m[1]] = arr[: m[0], : m[1]]
        arr = pad

    arr = np.abs(arr.astype(float))
    sym = np.maximum(arr, arr.T)
    np.fill_diagonal(sym, 0.0)
    return sym
