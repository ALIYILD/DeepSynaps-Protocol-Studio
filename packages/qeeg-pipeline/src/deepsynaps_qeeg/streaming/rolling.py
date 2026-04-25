"""Rolling (low-latency) feature extraction for live qEEG.

Designed for sub-500 ms p95 latency in typical 19-channel 250 Hz streams:
- updates every hop (default 250 ms) using cached filter state (SOS IIR)
- computes per-channel band power for configured bands
- derives summary biomarkers: TBR, IAPF, FAA
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .. import FREQ_BANDS

log = logging.getLogger(__name__)

_UV2_SCALE = 1e12  # V² → µV² (power)


def _design_sos_bandpass(sfreq: float, lo: float, hi: float):
    from scipy.signal import butter  # local import: optional dependency in some envs

    nyq = sfreq / 2.0
    lo_n = max(1e-6, lo / nyq)
    hi_n = min(0.999999, hi / nyq)
    if lo_n >= hi_n:
        raise ValueError(f"Invalid band [{lo}, {hi}] for sfreq={sfreq}")
    return butter(N=4, Wn=[lo_n, hi_n], btype="bandpass", output="sos")


def _sosfilt_chunk(sos, x: np.ndarray, zi: np.ndarray):
    from scipy.signal import sosfilt

    y, zf = sosfilt(sos, x, zi=zi, axis=-1)
    return y, zf


def _bandpower_uv2(filtered: np.ndarray) -> np.ndarray:
    """Mean-square of bandpassed signal → µV²."""
    # filtered is volts. Mean-square yields V²; scale to µV².
    return np.mean(filtered * filtered, axis=-1) * _UV2_SCALE


def _iaph_from_fft(x: np.ndarray, sfreq: float, lo: float = 7.0, hi: float = 13.0) -> float | None:
    """Individual alpha peak frequency (IAPF) from a simple periodogram."""
    n = x.shape[-1]
    if n < 8:
        return None
    # Hann window reduces leakage for 1-second windows.
    w = np.hanning(n)
    xf = np.fft.rfft(x * w)
    psd = (np.abs(xf) ** 2) / (np.sum(w**2) + 1e-12)
    freqs = np.fft.rfftfreq(n, d=1.0 / sfreq)
    mask = (freqs >= lo) & (freqs <= hi)
    if not np.any(mask):
        return None
    idx = int(np.argmax(psd[mask]))
    return float(freqs[mask][idx])


@dataclass
class RollingFeatures:
    """Ring-buffered rolling features updated at a fixed hop."""

    sfreq: float
    ch_names: list[str]
    bands: dict[str, tuple[float, float]] = field(default_factory=lambda: dict(FREQ_BANDS))

    # Derived config
    window_sec: float = 1.0
    hop_sec: float = 0.25

    # Internal filter cache: band_name -> (sos, zi[n_ch, n_sections, 2])
    _sos: dict[str, Any] = field(default_factory=dict, init=False, repr=False)
    _zi: dict[str, np.ndarray] = field(default_factory=dict, init=False, repr=False)

    # Ring buffer of recent outputs (optional; useful for UI smoothing)
    max_frames: int = 240  # ~1 minute at 4 Hz
    _frames: list[dict[str, Any]] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self) -> None:
        self.sfreq = float(self.sfreq)
        if self.sfreq <= 0:
            raise ValueError("sfreq must be positive.")
        if not self.ch_names:
            raise ValueError("ch_names required.")

        for band, (lo, hi) in self.bands.items():
            sos = _design_sos_bandpass(self.sfreq, lo, hi)
            n_sections = sos.shape[0]
            # scipy sosfilt expects zi shape (n_sections, n_signals, 2) when
            # filtering an array with shape (n_signals, n_samples) along axis=-1.
            self._sos[band] = sos
            self._zi[band] = np.zeros((n_sections, len(self.ch_names), 2), dtype=float)

    def update(self, window: np.ndarray, *, t0_unix: float | None = None) -> dict[str, Any]:
        """Update rolling features for a new 1-second window."""
        x = np.asarray(window, dtype=float)
        if x.ndim != 2 or x.shape[0] != len(self.ch_names):
            raise ValueError("window must be shape (n_ch, n_samp) matching ch_names.")

        bands_abs: dict[str, dict[str, float]] = {}
        total_power = np.zeros((len(self.ch_names),), dtype=float)

        # Filter + bandpower per band with cached SOS state.
        for band, (lo, hi) in self.bands.items():
            sos = self._sos[band]
            zi = self._zi[band]
            y, zf = _sosfilt_chunk(sos, x, zi)
            self._zi[band] = zf
            p = _bandpower_uv2(y)  # (n_ch,)
            total_power += p
            bands_abs[band] = {ch: float(p[i]) for i, ch in enumerate(self.ch_names)}

        bands_rel: dict[str, dict[str, float]] = {}
        denom = np.where(total_power > 0, total_power, 1.0)
        for band in self.bands:
            rel = np.array([bands_abs[band][ch] for ch in self.ch_names], dtype=float) / denom
            bands_rel[band] = {ch: float(rel[i]) for i, ch in enumerate(self.ch_names)}

        # Biomarkers
        tbr = self._compute_tbr(bands_abs)
        faa = self._compute_faa(bands_abs)
        iapf = self._compute_iapf(x)

        frame = {
            "t0_unix": t0_unix,
            "sfreq": self.sfreq,
            "ch_names": list(self.ch_names),
            "spectral": {
                "bands": {
                    band: {"absolute_uv2": bands_abs[band], "relative": bands_rel[band]}
                    for band in self.bands
                },
                "peak_alpha_freq": iapf.get("per_channel", {}),
            },
            "biomarkers": {
                "tbr": tbr,
                "faa": faa,
                "iapf_hz": iapf.get("median_hz"),
            },
            "disclaimer": "Monitoring only — not diagnostic.",
        }

        self._frames.append(frame)
        if len(self._frames) > self.max_frames:
            self._frames = self._frames[-self.max_frames :]
        return frame

    def recent(self) -> list[dict[str, Any]]:
        return list(self._frames)

    def _compute_tbr(self, bands_abs: dict[str, dict[str, float]]) -> float | None:
        # Theta/Beta ratio at Cz (if present).
        if "Cz" not in self.ch_names:
            return None
        theta = float(bands_abs.get("theta", {}).get("Cz", 0.0))
        beta = float(bands_abs.get("beta", {}).get("Cz", 0.0))
        if beta <= 0:
            return None
        return float(theta / beta)

    def _compute_faa(self, bands_abs: dict[str, dict[str, float]]) -> float | None:
        # Frontal alpha asymmetry: ln(alpha_F4) - ln(alpha_F3).
        if "F3" not in self.ch_names or "F4" not in self.ch_names:
            return None
        a = bands_abs.get("alpha", {})
        p_f3 = float(a.get("F3", 0.0))
        p_f4 = float(a.get("F4", 0.0))
        if p_f3 <= 0 or p_f4 <= 0:
            return None
        return float(math.log(p_f4) - math.log(p_f3))

    def _compute_iapf(self, x: np.ndarray) -> dict[str, Any]:
        # Fast per-channel IAPF from window FFT; return per-channel + median.
        per_ch: dict[str, float] = {}
        vals: list[float] = []
        for i, ch in enumerate(self.ch_names):
            v = _iaph_from_fft(x[i], self.sfreq)
            if v is None:
                continue
            per_ch[ch] = float(v)
            vals.append(float(v))
        med = float(np.median(vals)) if vals else None
        return {"per_channel": per_ch, "median_hz": med}

