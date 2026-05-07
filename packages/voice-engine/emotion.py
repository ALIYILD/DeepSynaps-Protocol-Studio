"""Speech emotion recognition: SenseVoice / SpeechBrain SER labels + confidence."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from speechbrain.inference.classifiers import EncoderClassifier


@dataclass(frozen=True)
class EmotionFrame:
    start_sec: float
    end_sec: float
    label: str
    confidence: float


@dataclass(frozen=True)
class EmotionTimeline:
    frames: list[EmotionFrame]
    dominant_label: str
    mean_confidence: float


def load_classifier() -> EncoderClassifier:
    """Load the SER encoder. Production should pin a specific source."""
    # TODO: EncoderClassifier.from_hparams(source=..., savedir=...).
    raise NotImplementedError


def classify(audio_path: Path, frame_sec: float = 1.0) -> EmotionTimeline:
    """Window the clip and emit per-frame emotion labels + dominant summary."""
    # TODO: framewise inference, softmax confidence, dominant label.
    raise NotImplementedError
