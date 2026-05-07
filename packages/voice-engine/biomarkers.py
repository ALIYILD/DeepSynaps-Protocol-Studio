"""Acoustic biomarkers via Praat (parselmouth) + librosa: F0, jitter, shimmer, HNR, MFCCs."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
import parselmouth


@dataclass(frozen=True)
class Biomarkers:
    f0_mean_hz: float
    f0_std_hz: float
    jitter_local: float
    shimmer_local: float
    hnr_db: float
    mfcc_means: list[float]


def extract(audio_path: Path) -> Biomarkers:
    """Extract pitch, perturbation, harmonicity, and MFCC summary stats."""
    # TODO: parselmouth.Sound(audio_path) -> .to_pitch(), PointProcess for jitter/shimmer,
    #       .to_harmonicity(); librosa.feature.mfcc for cepstral means.
    raise NotImplementedError
