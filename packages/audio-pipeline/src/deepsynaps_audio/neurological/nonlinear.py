"""Nonlinear voice features: RPDE, DFA, PPE — numpy implementations (Tsanas-inspired)."""

from __future__ import annotations

import math

import numpy as np

from ..schemas import NonlinearFeatures, Recording


def nonlinear_features(recording: Recording) -> NonlinearFeatures:
    """Compute RPDE / DFA / PPE from fundamental period sequence derived via pyin."""

    try:
        import librosa
    except ImportError as exc:
        raise ImportError(
            "nonlinear_features requires librosa — pip install 'packages/audio-pipeline[acoustic]'."
        ) from exc

    if recording.waveform is None:
        raise ValueError("recording.waveform required")

    y = np.asarray(recording.waveform, dtype=np.float64).ravel()
    sr = recording.sample_rate
    f0_hz, _, _ = librosa.pyin(y, fmin=75.0, fmax=500.0, sr=sr, frame_length=2048, hop_length=128)
    periods = 1.0 / np.asarray(f0_hz[np.isfinite(f0_hz)])
    if periods.size < 64:
        periods = np.pad(periods, (0, 64 - periods.size), mode="edge")

    rpde = _rpde(periods)
    dfa = _dfa_alpha(periods)
    ppe = _ppe(periods)

    return NonlinearFeatures(rpde=float(rpde), dfa=float(dfa), ppe=float(ppe))


def _rpde(periods: np.ndarray) -> float:
    """Histogram entropy of successive period ratios (RPDE-like diagnostic scalar)."""

    p = np.asarray(periods, dtype=np.float64).ravel()
    if p.size < 8:
        return 0.0
    r = p[1:] / np.maximum(p[:-1], 1e-12)
    r = r[np.isfinite(r)]
    if r.size < 4:
        return 0.0
    hist, _ = np.histogram(r, bins=20, range=(0.5, 2.0), density=True)
    hist = hist + 1e-12
    hist = hist / np.sum(hist)
    h = float(-np.sum(hist * np.log(hist)))
    return float(h / math.log(len(hist)))


def _dfa_alpha(x: np.ndarray) -> float:
    """DFA scaling exponent (short-range)."""

    x = np.asarray(x, dtype=np.float64).ravel()
    x = x - np.mean(x)
    y = np.cumsum(x)
    n = len(y)
    if n < 64:
        return 0.5
    scales = np.unique(
        np.clip(np.logspace(1.3, math.log10(n // 4), num=8).astype(int), 8, n // 4)
    )
    fluctuations = []
    for scale in scales:
        n_seg = n // scale
        if n_seg < 2:
            continue
        f_sum = 0.0
        for v in range(n_seg):
            seg = y[v * scale : (v + 1) * scale]
            t = np.arange(len(seg), dtype=np.float64)
            coef = np.polyfit(t, seg, 1)
            trend = coef[0] * t + coef[1]
            f_sum += float(np.mean((seg - trend) ** 2))
        fluctuations.append(math.sqrt(f_sum / n_seg))
    if len(fluctuations) < 2:
        return 0.5
    lx = np.log(scales[: len(fluctuations)].astype(float))
    lf = np.log(np.asarray(fluctuations, dtype=np.float64))
    slope, _ = np.polyfit(lx, lf, 1)
    return float(slope)


def _ppe(periods: np.ndarray, bins: int = 15) -> float:
    """Pitch period entropy on histogram of normalized periods."""

    p = np.asarray(periods, dtype=np.float64)
    p = p[np.isfinite(p) & (p > 0)]
    if p.size < 8:
        return 0.0
    p = p / np.mean(p)
    hist, _ = np.histogram(p, bins=bins, range=(0.5, 1.5), density=True)
    hist = hist + 1e-12
    hist = hist / np.sum(hist)
    return float(-np.sum(hist * np.log(hist)))
