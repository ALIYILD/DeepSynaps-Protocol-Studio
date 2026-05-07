"""End-to-end orchestrator: file -> VoiceAnalysisResult."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .biomarkers import Biomarkers
from .emotion import EmotionTimeline
from .report import ClinicalReport
from .scoring import RiskScores
from .transcription import Transcript


@dataclass(frozen=True)
class VoiceAnalysisResult:
    audio_path: Path
    transcript: Transcript
    emotions: EmotionTimeline
    biomarkers: Biomarkers
    risk: RiskScores
    report: ClinicalReport


def run(audio_path: Path) -> VoiceAnalysisResult:
    """Run audio_io -> transcription -> emotion -> biomarkers -> scoring -> report."""
    # TODO: validate, normalise, then call each stage; surface stage-level errors.
    raise NotImplementedError
