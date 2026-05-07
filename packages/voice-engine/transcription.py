"""ASR: Whisper-based transcription with word-level timestamps."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import whisper


@dataclass(frozen=True)
class WordTimestamp:
    word: str
    start_sec: float
    end_sec: float
    confidence: float


@dataclass(frozen=True)
class Transcript:
    text: str
    language: str
    words: list[WordTimestamp]


def load_model(name: str = "base") -> whisper.Whisper:
    """Lazy-load a Whisper model. Cache across calls in production."""
    # TODO: cache and pin model name via config.
    raise NotImplementedError


def transcribe(audio_path: Path, model_name: str = "base") -> Transcript:
    """Run Whisper with word_timestamps=True; return structured Transcript."""
    # TODO: model.transcribe(..., word_timestamps=True), map to dataclasses.
    raise NotImplementedError
