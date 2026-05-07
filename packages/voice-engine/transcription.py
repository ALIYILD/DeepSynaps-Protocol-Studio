"""ASR: Whisper-based transcription with optional pyannote diarization.

All heavy imports (whisper, torch, pyannote) are lazy — inside functions —
so this module can be imported in CPU-only test environments without those
packages installed.
"""

from __future__ import annotations

import logging
import math
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public dataclasses (stdlib only — safe at module top)
# ---------------------------------------------------------------------------


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str
    confidence: Optional[float]
    speaker: Optional[str] = None


@dataclass
class TranscriptResult:
    text: str
    language: Optional[str]
    duration_sec: Optional[float]
    segments: List[TranscriptSegment]
    model_name: str
    diarization_used: bool


# ---------------------------------------------------------------------------
# Model cache — module-level singleton, keyed by model name
# ---------------------------------------------------------------------------

_MODEL_CACHE: dict[str, Any] = {}


def _load_whisper_model_impl(name: str, device: str) -> Any:
    """Load a Whisper model onto *device*. Seam for monkeypatching in tests."""
    import whisper  # lazy import

    logger.info("Loading Whisper model '%s' onto device '%s'", name, device)
    model = whisper.load_model(name)
    model = model.to(device)
    return model


def _detect_device() -> str:
    """Return 'cuda' if available, else 'cpu'. Lazy-imports torch."""
    try:
        import torch  # lazy import

        cuda = torch.cuda.is_available()
    except ImportError:
        cuda = False
    return "cuda" if cuda else "cpu"


def get_whisper_model() -> Any:
    """Return a cached Whisper model (loads on first call).

    Model name comes from env ``WHISPER_MODEL``, default ``"medium"``.
    Device is CUDA when available, otherwise CPU.
    """
    model_name = os.environ.get("WHISPER_MODEL", "medium")

    if model_name not in _MODEL_CACHE:
        device = _detect_device()
        logger.info("get_whisper_model: name=%s  device=%s", model_name, device)
        try:
            _MODEL_CACHE[model_name] = _load_whisper_model_impl(model_name, device)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to load Whisper model '{model_name}': {exc}"
            ) from exc

    return _MODEL_CACHE[model_name]


# ---------------------------------------------------------------------------
# Diarization (optional, fail-graceful)
# ---------------------------------------------------------------------------


def maybe_get_diarization_pipeline() -> Any | None:
    """Return a pyannote diarization pipeline, or None on any failure."""
    token = (
        os.environ.get("HUGGINGFACE_TOKEN")
        or os.environ.get("HF_TOKEN")
        or os.environ.get("PYANNOTE_TOKEN")
    )
    if not token:
        return None

    try:
        from pyannote.audio import Pipeline  # lazy import

        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization", use_auth_token=token
        )
        return pipeline
    except Exception:  # ImportError, auth error, load error — all silenced
        return None


# ---------------------------------------------------------------------------
# Speaker alignment
# ---------------------------------------------------------------------------


def assign_speakers_to_segments(
    segments: List[TranscriptSegment],
    diarization_result: Any,
) -> List[TranscriptSegment]:
    """Align pyannote diarization turns to transcript segments by max overlap."""
    if diarization_result is None:
        return segments

    turns = list(diarization_result.itertracks(yield_label=True))
    updated: List[TranscriptSegment] = []
    for seg in segments:
        best_label: Optional[str] = None
        best_overlap = 0.0
        for turn, _, label in turns:
            overlap = min(seg.end, turn.end) - max(seg.start, turn.start)
            if overlap > best_overlap:
                best_overlap = overlap
                best_label = label
        updated.append(
            TranscriptSegment(
                start=seg.start,
                end=seg.end,
                text=seg.text,
                confidence=seg.confidence,
                speaker=best_label,
            )
        )
    return updated


# ---------------------------------------------------------------------------
# Internal normalisation
# ---------------------------------------------------------------------------


def _get_audio_duration(audio_path: str) -> Optional[float]:
    """Return WAV duration in seconds, or None if the header can't be read.

    Uses stdlib ``wave`` so silent / segment-less audio still exposes a duration.
    Returns None for non-WAV containers; callers may then derive duration from
    segment timestamps as a fallback.
    """
    import wave  # stdlib

    try:
        with wave.open(audio_path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if rate <= 0:
                return None
            return frames / float(rate)
    except (wave.Error, OSError):
        return None


def _normalize_whisper_result(
    raw: dict,
    model_name: str,
    diarization_used: bool,
    audio_path: Optional[str] = None,
) -> TranscriptResult:
    """Convert a raw Whisper result dict into a TranscriptResult."""
    raw_segments = raw.get("segments") or []
    segments: List[TranscriptSegment] = []
    for s in raw_segments:
        avg_logprob = s.get("avg_logprob")
        confidence = math.exp(avg_logprob) if avg_logprob is not None else None
        segments.append(
            TranscriptSegment(
                start=float(s.get("start", 0.0)),
                end=float(s.get("end", 0.0)),
                text=s.get("text", ""),
                confidence=confidence,
            )
        )

    duration_sec: Optional[float] = None
    if audio_path is not None:
        duration_sec = _get_audio_duration(audio_path)
    if duration_sec is None and segments:
        duration_sec = segments[-1].end

    return TranscriptResult(
        text=raw.get("text", ""),
        language=raw.get("language"),
        duration_sec=duration_sec,
        segments=segments,
        model_name=model_name,
        diarization_used=diarization_used,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def transcribe_audio(audio_path: str) -> TranscriptResult:
    """Transcribe a local WAV file and return a structured TranscriptResult.

    Raises
    ------
    FileNotFoundError
        If *audio_path* does not exist on disk.
    RuntimeError
        If the Whisper model cannot be loaded or inference fails.
    """
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Audio file not found: {audio_path!r}. "
            "Ensure the file has been written by the audio_io stage before transcription."
        )

    model_name = os.environ.get("WHISPER_MODEL", "medium")
    logger.info("transcribe_audio: start  path=%s  model=%s", audio_path, model_name)
    t0 = time.monotonic()

    model = get_whisper_model()

    diarization = maybe_get_diarization_pipeline()
    diarization_used = diarization is not None

    try:
        raw = model.transcribe(str(path))
    except Exception as exc:
        raise RuntimeError(
            f"Whisper inference failed for '{audio_path}': {exc}"
        ) from exc

    result = _normalize_whisper_result(raw, model_name, diarization_used, audio_path=str(path))

    if diarization_used:
        result.segments[:] = assign_speakers_to_segments(result.segments, diarization)

    elapsed = time.monotonic() - t0
    logger.info(
        "transcribe_audio: done  elapsed=%.2fs  segments=%d  diarization=%s",
        elapsed,
        len(result.segments),
        diarization_used,
    )

    return result


