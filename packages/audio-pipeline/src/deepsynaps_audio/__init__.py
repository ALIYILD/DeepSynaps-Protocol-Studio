"""DeepSynaps Audio / Voice Analyzer package.

The package exposes typed ingestion and quality-control primitives for clinical
voice/speech recordings. Higher-level acoustic features, neurological voice
scorecards, cognitive speech markers, and longitudinal reporting build on these
contracts.
"""

from deepsynaps_audio.ingestion import (
    check_audio_quality,
    extract_audio_metadata,
    import_voice_sample,
    segment_voice_tasks,
)
from deepsynaps_audio.schemas import (
    AudioMetadata,
    AudioQualityResult,
    QualityConfig,
    QualityWarning,
    UseCase,
    VoiceAsset,
    VoiceSegment,
)

__all__ = [
    "AudioMetadata",
    "AudioQualityResult",
    "QualityConfig",
    "QualityWarning",
    "UseCase",
    "VoiceAsset",
    "VoiceSegment",
    "check_audio_quality",
    "extract_audio_metadata",
    "import_voice_sample",
    "segment_voice_tasks",
]
