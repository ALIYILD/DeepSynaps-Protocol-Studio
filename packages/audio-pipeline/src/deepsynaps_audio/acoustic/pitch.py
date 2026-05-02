"""F0 / pitch extraction — Praat (Parselmouth) when available, else librosa pyin."""

from __future__ import annotations

import os
from typing import Optional

import numpy as np

from ..constants import F0_RANGE_DEFAULT
from ..schemas import PitchSummary, Recording


def extract_pitch(
    recording: Recording,
    *,
    f0_min_hz: Optional[float] = None,
    f0_max_hz: Optional[float] = None,
) -> PitchSummary:
    """Extract F0 contour summary statistics from the recording."""

    if recording.waveform is None or recording.n_samples < 256:
        raise ValueError("recording must contain waveform with sufficient length")

    fmin = float(f0_min_hz if f0_min_hz is not None else F0_RANGE_DEFAULT[0])
    fmax = float(f0_max_hz if f0_max_hz is not None else F0_RANGE_DEFAULT[1])

    use_praat = os.environ.get("DEEPSYNAPS_VOICE_USE_PRAAT", "1").lower() in ("1", "true", "yes")
    if use_praat:
        from .praat_backend import extract_pitch_praat

        praat_out = extract_pitch_praat(recording, fmin, fmax)
        if praat_out is not None:
            return praat_out

    try:
        import librosa
    except ImportError as exc:
        raise ImportError(
            "extract_pitch requires librosa — pip install 'packages/audio-pipeline[acoustic]'."
        ) from exc

    y = np.asarray(recording.waveform, dtype=np.float64).ravel()
    sr = recording.sample_rate

    f0_hz, voiced_flag, _ = librosa.pyin(
        y,
        fmin=fmin,
        fmax=fmax,
        sr=sr,
        frame_length=2048,
        hop_length=256,
    )
    valid = f0_hz[~np.isnan(f0_hz)]
    if valid.size == 0:
        return PitchSummary(
            f0_mean_hz=0.0,
            f0_sd_hz=0.0,
            f0_min_hz=0.0,
            f0_max_hz=0.0,
            f0_range_hz=0.0,
            voiced_fraction=float(np.mean(voiced_flag)) if voiced_flag is not None else 0.0,
        )

    return PitchSummary(
        f0_mean_hz=float(np.mean(valid)),
        f0_sd_hz=float(np.std(valid)),
        f0_min_hz=float(np.min(valid)),
        f0_max_hz=float(np.max(valid)),
        f0_range_hz=float(np.max(valid) - np.min(valid)),
        voiced_fraction=float(np.mean(voiced_flag)) if voiced_flag is not None else float(len(valid) / max(len(f0_hz), 1)),
    )
