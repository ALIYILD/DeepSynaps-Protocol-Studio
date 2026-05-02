"""Speech-linguistic engine (transcripts → prosody / lexical / syntactic features)."""

from .transcription import transcribe
from .prosody import prosody_from_transcript
from .lexical import lexical_features
from .syntactic import syntactic_features

__all__ = [
    "transcribe",
    "prosody_from_transcript",
    "lexical_features",
    "syntactic_features",
]
