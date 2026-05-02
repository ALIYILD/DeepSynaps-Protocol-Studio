"""MFCC summary via librosa."""

from __future__ import annotations

import numpy as np

from ..schemas import MFCCSummary, Recording


def extract_mfcc(recording: Recording, n: int = 13) -> MFCCSummary:
    """Compute MFCC + Δ + ΔΔ summary stats."""

    try:
        import librosa
    except ImportError as exc:
        raise ImportError(
            "extract_mfcc requires librosa — pip install 'packages/audio-pipeline[acoustic]'."
        ) from exc

    if recording.waveform is None:
        raise ValueError("recording.waveform required")

    y = np.asarray(recording.waveform, dtype=np.float64).ravel()
    sr = recording.sample_rate
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n)
    d = librosa.feature.delta(mfcc)
    dd = librosa.feature.delta(mfcc, order=2)

    def stats_rows(a: np.ndarray) -> tuple[list[float], list[float]]:
        return [float(np.mean(a[i])) for i in range(a.shape[0])], [float(np.std(a[i])) for i in range(a.shape[0])]

    m_mean, m_sd = stats_rows(mfcc)
    d_mean, _ = stats_rows(d)
    dd_mean, _ = stats_rows(dd)

    return MFCCSummary(
        n_coefficients=n,
        mean=m_mean,
        sd=m_sd,
        delta_mean=d_mean,
        delta_delta_mean=dd_mean,
    )
