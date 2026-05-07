"""Audio ingestion: upload, validate, normalise to WAV 16 kHz mono."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
import scipy.io.wavfile as wavfile

SUPPORTED_FORMATS = {".wav", ".mp3", ".m4a"}
TARGET_SAMPLE_RATE = 16_000
TARGET_CHANNELS = 1


@dataclass(frozen=True)
class AudioFile:
    path: Path
    sample_rate: int
    duration_sec: float
    channels: int


def validate_upload(path: Path) -> None:
    """Reject unsupported formats, oversize uploads, or zero-byte files."""
    # TODO: enforce SUPPORTED_FORMATS, max size, non-empty.
    raise NotImplementedError


def load_and_normalise(path: Path) -> tuple[np.ndarray, int]:
    """Load any supported format and return mono 16 kHz float32 PCM."""
    # TODO: librosa.load(path, sr=TARGET_SAMPLE_RATE, mono=True).
    raise NotImplementedError


def to_wav(samples: np.ndarray, sample_rate: int, out_path: Path) -> AudioFile:
    """Persist normalised samples to disk as 16-bit PCM WAV."""
    # TODO: scipy.io.wavfile.write with int16 conversion.
    raise NotImplementedError
