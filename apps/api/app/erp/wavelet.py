"""Morlet TFR (MNE) — log-spaced frequencies."""

from __future__ import annotations

from typing import Any

import numpy as np


def morlet_tfr_epochs(
    epochs: Any,
    *,
    fmin: float,
    fmax: float,
    n_freqs: int,
    n_cycles: float,
) -> dict[str, Any]:
    import mne

    freqs = np.geomspace(max(fmin, 0.5), min(fmax, float(epochs.info["sfreq"]) / 2.0 - 1), n_freqs)
    power = mne.time_frequency.tfr_morlet(
        epochs,
        freqs=freqs,
        n_cycles=n_cycles,
        average=True,
        return_itc=False,
        verbose=False,
    )
    avg = power.data
    return {
        "freqsHz": freqs.tolist(),
        "timesSec": epochs.times.tolist(),
        "powerMeanUv2": (avg * 1e12).astype(np.float32).tolist(),
        "shape": list(avg.shape),
        "nCycles": n_cycles,
    }


def wavelet_pair_coherence_seed(
    epochs: Any,
    *,
    seed_ch_idx: int,
    fmin: float,
    fmax: float,
    n_freqs: int,
    n_cycles: float,
) -> dict[str, Any]:
    """Simplified coherence-like coupling: correlation of band envelopes seed vs others per freq bin."""
    from scipy import signal as scipy_signal

    _ = n_cycles

    sfreq = float(epochs.info["sfreq"])
    freqs = np.geomspace(max(fmin, 0.5), min(fmax, sfreq / 2.0 - 1), n_freqs)
    data = epochs.get_data(copy=False) * 1e6
    n_ep, n_ch, n_t = data.shape
    times = epochs.times
    coh_mat = np.zeros((n_ch, len(freqs), n_t), dtype=np.float32)
    seed = data[:, seed_ch_idx, :]
    for fi, f0 in enumerate(freqs):
        sigma = n_cycles / (2 * np.pi * f0)
        win = int(max(7, sigma * sfreq * 6))
        for ci in range(n_ch):
            env_s = np.abs(scipy_signal.hilbert(_bandpass(seed, sfreq, f0, win)))
            env_c = np.abs(scipy_signal.hilbert(_bandpass(data[:, ci, :], sfreq, f0, win)))
            for ti in range(n_t):
                v_s = env_s[:, ti]
                v_c = env_c[:, ti]
                if np.std(v_s) < 1e-9 or np.std(v_c) < 1e-9:
                    coh_mat[ci, fi, ti] = 0.0
                else:
                    coh_mat[ci, fi, ti] = float(np.corrcoef(v_s, v_c)[0, 1])
    return {
        "freqsHz": freqs.tolist(),
        "timesSec": times.tolist(),
        "coherenceTensor": coh_mat.tolist(),
        "seedChannelIndex": seed_ch_idx,
    }


def _bandpass(x: np.ndarray, sfreq: float, f0: float, width: int) -> np.ndarray:
    from scipy import signal as scipy_signal

    nyq = sfreq / 2.0
    lo = max(f0 - 2.0, 0.5)
    hi = min(f0 + 2.0, nyq - 0.5)
    sos = scipy_signal.butter(3, [lo, hi], btype="bandpass", fs=sfreq, output="sos")
    out = np.zeros_like(x, dtype=np.float64)
    for i in range(x.shape[0]):
        out[i] = scipy_signal.sosfiltfilt(sos, x[i].astype(np.float64))
    return out
