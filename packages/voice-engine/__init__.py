"""Voice Engine: clinical voice analysis pipeline.

Stages: audio_io -> transcription -> emotion -> biomarkers -> scoring -> report.
Orchestrated end-to-end by `pipeline.run`.
"""

from .pipeline import VoiceAnalysisResult, run

__all__ = ["VoiceAnalysisResult", "run"]
