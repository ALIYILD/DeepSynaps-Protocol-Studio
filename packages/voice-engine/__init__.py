"""Voice Engine: clinical voice analysis pipeline.

Stages: audio_io -> transcription -> emotion -> biomarkers -> scoring -> report.
Orchestrated end-to-end by `pipeline.run_voice_analysis_for_session`.
"""

__version__ = "0.1.0"

CLINICAL_DISCLAIMER = (
    "Voice-derived decision support; not a diagnostic device. "
    "Patterns are statistical, not validated against clinical outcomes. "
    "All findings require clinician interpretation."
)

try:
    from .transcription import (
        TranscriptResult,
        TranscriptSegment,
        transcribe_audio,
        get_whisper_model,
    )

    try:
        from .pipeline import VoiceAnalysisResult, PipelineStatus, run_voice_analysis_for_session
    except ImportError:
        # Heavy deps (librosa, parselmouth, etc.) not installed — skip pipeline exports.
        pass

except ImportError:
    # Imported standalone (e.g. pytest collecting the dir as a package root)
    # without a parent package context — skip all relative imports.
    pass

__all__ = [
    "__version__",
    "CLINICAL_DISCLAIMER",
    "TranscriptResult",
    "TranscriptSegment",
    "transcribe_audio",
    "get_whisper_model",
    "VoiceAnalysisResult",
    "PipelineStatus",
    "run_voice_analysis_for_session",
]
