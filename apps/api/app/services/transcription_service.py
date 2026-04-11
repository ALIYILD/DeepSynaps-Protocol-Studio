"""
Audio transcription service — uses OpenAI Whisper API (V1).
Falls back gracefully if no API key is configured.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class TranscriptionResult:
    text: str
    language: str | None
    duration_seconds: float | None
    word_count: int
    provider: str


# ---------------------------------------------------------------------------
# Transcription functions
# ---------------------------------------------------------------------------


async def transcribe_audio(
    file_bytes: bytes,
    filename: str,
    settings,
) -> TranscriptionResult:
    """
    Transcribe *file_bytes* via the OpenAI Whisper API.

    Parameters
    ----------
    file_bytes:
        Raw bytes of the audio file.
    filename:
        Original filename (e.g. ``"recording.webm"``).  Sent as the file tuple
        name so Whisper knows the codec.
    settings:
        App settings object that must expose ``openai_api_key``.

    Returns
    -------
    TranscriptionResult
        Parsed transcription result from Whisper.

    Raises
    ------
    RuntimeError
        If ``OPENAI_API_KEY`` is not configured.
    RuntimeError
        If the Whisper API call fails (wraps the underlying ``OpenAIError``).
    """
    api_key: str = getattr(settings, "openai_api_key", "") or ""
    if not api_key:
        raise RuntimeError(
            "Transcription not available: OPENAI_API_KEY not configured"
        )

    try:
        import openai  # deferred import — not available in all environments
    except ImportError as exc:
        raise RuntimeError(
            "Transcription not available: 'openai' package is not installed"
        ) from exc

    client = openai.AsyncOpenAI(api_key=api_key)

    try:
        logger.info("Sending audio to Whisper: filename=%s bytes=%d", filename, len(file_bytes))
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, file_bytes),
            response_format="verbose_json",
        )
    except openai.OpenAIError as exc:
        raise RuntimeError(f"Transcription failed: {exc}") from exc

    text: str = response.text or ""
    language: str | None = getattr(response, "language", None)
    duration: float | None = getattr(response, "duration", None)
    word_count = len(text.split()) if text else 0

    logger.info(
        "Whisper transcription complete: language=%s duration=%.1fs words=%d",
        language,
        duration or 0.0,
        word_count,
    )

    return TranscriptionResult(
        text=text,
        language=language,
        duration_seconds=duration,
        word_count=word_count,
        provider="openai_whisper",
    )


async def transcribe_text_upload(text: str) -> TranscriptionResult:
    """
    Wrap a plain-text upload as a ``TranscriptionResult`` without any API call.

    Used when the patient submits written text rather than audio/video.
    """
    return TranscriptionResult(
        text=text,
        language=None,
        duration_seconds=None,
        word_count=len(text.split()),
        provider="direct_text",
    )
