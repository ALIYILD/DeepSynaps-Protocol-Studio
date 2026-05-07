"""Voice Engine: clinical voice analysis pipeline.

Stages: audio_io -> transcription -> emotion -> biomarkers -> scoring -> report.
Orchestrated end-to-end by `pipeline.run_voice_analysis_for_session`.
"""

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
    "TranscriptResult",
    "TranscriptSegment",
    "transcribe_audio",
    "get_whisper_model",
    "VoiceAnalysisResult",
    "PipelineStatus",
    "run_voice_analysis_for_session",
]
