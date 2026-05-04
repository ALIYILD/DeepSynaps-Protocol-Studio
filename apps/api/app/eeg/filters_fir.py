"""Offline FIR bandrange (zero-phase) for derivative recordings."""

from __future__ import annotations

import math
from typing import Any, Literal

import numpy as np

try:
    from scipy import signal  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover
    signal = None  # type: ignore[assignment]

WindowType = Literal["hamming", "blackman", "kaiser"]


def _require_scipy() -> None:
    if signal is None:
        raise RuntimeError("scipy is required for FIR bandrange filters")


def estimate_numtaps(sfreq: float, low_hz: float, *, min_taps: int = 101, factor: float = 4.0) -> int:
    """At least ``factor * sfreq / low_hz`` (rule from spec), rounded to odd length."""
    if low_hz <= 0:
        return min_taps | 1
    n = int(math.ceil(factor * sfreq / low_hz))
    n = max(min_taps, n)
    if n % 2 == 0:
        n += 1
    return n


def fir_bandpass_zero_phase(
    data: np.ndarray,
    sfreq: float,
    low_hz: float,
    high_hz: float,
    *,
    transition_hz: float = 0.5,
    window: WindowType = "hamming",
    numtaps: int | None = None,
) -> np.ndarray:
    """Band-pass ``data`` with linear-phase FIR then ``filtfilt`` for zero phase.

    Parameters
    ----------
    data
        Shape (n_channels, n_samples) or (n_samples,).
    """
    _require_scipy()
    nyq = 0.5 * sfreq
    lo = max(1e-6, min(low_hz, nyq * 0.99))
    hi = max(lo + 1e-3, min(high_hz, nyq * 0.99))
    width = min(transition_hz, (hi - lo) * 0.25, nyq * 0.1)
    nt = numtaps or estimate_numtaps(sfreq, lo)

    win = window
    if win == "kaiser":
        taps = signal.firwin(  # type: ignore[union-attr]
            nt,
            [lo, hi],
            pass_zero=False,
            fs=sfreq,
            width=width,
            window=("kaiser", 5.0),
        )
    else:
        taps = signal.firwin(  # type: ignore[union-attr]
            nt,
            [lo, hi],
            pass_zero=False,
            fs=sfreq,
            width=width,
            window=win,
        )

    if data.ndim == 1:
        return signal.filtfilt(taps, [1.0], data, axis=-1)  # type: ignore[union-attr]
    out = np.empty_like(data)
    for i in range(data.shape[0]):
        out[i] = signal.filtfilt(taps, [1.0], data[i], axis=-1)  # type: ignore[union-attr]
    return out


def qa_sine_att_db(
    sfreq: float,
    low_hz: float,
    high_hz: float,
    *,
    transition_hz: float = 0.5,
    window: WindowType = "hamming",
) -> dict[str, Any]:
    """Regression helper: 10 Hz sine through Alpha band (8–13), measure leakage at 4 / 20 Hz."""
    dur = 30.0
    t = np.arange(0.0, dur, 1.0 / sfreq)
    x = np.sin(2.0 * np.pi * 10.0 * t).astype(np.float64)
    y = fir_bandpass_zero_phase(
        x,
        sfreq,
        low_hz,
        high_hz,
        transition_hz=transition_hz,
        window=window,
    )
    # Compare RMS of output to input near passband — use amplitude at 10 Hz via DFT bin
    def power_at(freq: float, sig: np.ndarray) -> float:
        # single-bin energy approximate
        k = int(round(freq * len(sig) / sfreq))
        fft = np.fft.rfft(sig)
        return float(np.abs(fft[k]) ** 2)

    p10_in = power_at(10.0, x)
    p10_out = power_at(10.0, y)
    p4_out = power_at(4.0, y)
    p20_out = power_at(20.0, y)
    ratio_pass = (np.sqrt(p10_out / max(p10_in, 1e-18)) - 1.0) * 100.0
    db4 = 10.0 * np.log10(max(p4_out, 1e-18) / max(p10_out, 1e-18))
    db20 = 10.0 * np.log10(max(p20_out, 1e-18) / max(p10_out, 1e-18))
    return {
        "passband_gain_pct_err": float(ratio_pass),
        "leak_4hz_db": float(db4),
        "leak_20hz_db": float(db20),
    }
