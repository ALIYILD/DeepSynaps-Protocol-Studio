"""ASR adapter — faster-whisper preferred, vosk fallback.

This adapter is the *only* place ASR libraries are imported. Every
other linguistic / cognitive feature path receives a fully-formed
:class:`Transcript`.
"""

from __future__ import annotations

from ..schemas import Recording, Transcript


def transcribe(recording: Recording, *, language: str = "en") -> Transcript:
    """Transcribe a recording for downstream feature extraction only.

    TODO: implement in v2 (see ``AUDIO_ANALYZER_STACK.md §7``). Try
    ``faster-whisper`` first, fall back to ``vosk`` when the GPU /
    Whisper model is unavailable. Always populate
    ``asr_engine`` / ``asr_model_version`` on the returned
    :class:`Transcript` so reports can disclose the ASR used.

    Transcripts are an *intermediate* artefact — never ship them to
    the EHR.
    """

    raise NotImplementedError(
        "linguistic.transcription.transcribe: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )
