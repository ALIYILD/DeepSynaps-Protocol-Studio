"""Diadochokinetic metrics from onset strength peaks."""

from __future__ import annotations

import numpy as np

from ..schemas import DDKMetrics, Recording


def ddk_metrics(recording: Recording) -> DDKMetrics:
    """Estimate syllable rate and regularity from spectral flux peaks."""

    try:
        import librosa
    except ImportError as exc:
        raise ImportError(
            "ddk_metrics requires librosa — pip install 'packages/audio-pipeline[acoustic]'."
        ) from exc

    if recording.waveform is None:
        raise ValueError("recording.waveform required")

    y = np.asarray(recording.waveform, dtype=np.float64).ravel()
    sr = recording.sample_rate
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    frames = np.arange(len(onset_env))
    times = librosa.frames_to_time(frames, sr=sr)
    peaks = librosa.util.peak_pick(onset_env, pre_max=3, post_max=5, pre_avg=3, post_avg=5, delta=0.07, wait=5)
    if peaks.size < 2:
        dur = len(y) / sr
        rate = float(peaks.size / max(dur, 1e-6))
        return DDKMetrics(
            syllable_rate_per_s=rate,
            syllable_rate_sd=0.0,
            voice_onset_time_ms=None,
            regularity_index=0.0,
        )

    peak_times = times[peaks]
    intervals = np.diff(peak_times)
    rate = float(len(peaks) / (len(y) / sr))
    sd = float(np.std(intervals)) if intervals.size else 0.0
    mean_iv = float(np.mean(intervals)) if intervals.size else 1.0
    cv = sd / max(mean_iv, 1e-6)
    regularity = float(max(0.0, min(1.0, 1.0 / (1.0 + cv))))

    vot_ms = float(mean_iv * 500.0) if mean_iv > 0 else None

    return DDKMetrics(
        syllable_rate_per_s=rate,
        syllable_rate_sd=sd,
        voice_onset_time_ms=vot_ms,
        regularity_index=regularity,
    )
