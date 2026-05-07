"""Clinical report generator: structured JSON -> clinician summary text."""

from __future__ import annotations

from dataclasses import dataclass

from .biomarkers import Biomarkers
from .emotion import EmotionTimeline
from .scoring import RiskScores
from .transcription import Transcript


@dataclass(frozen=True)
class ClinicalReport:
    summary_md: str
    structured: dict


def build(
    transcript: Transcript,
    emotions: EmotionTimeline,
    biomarkers: Biomarkers,
    risk: RiskScores,
) -> ClinicalReport:
    """Combine all stages into a clinician-readable Markdown summary + JSON."""
    # TODO: deterministic template; flag low-confidence and decision-support disclaimer.
    raise NotImplementedError
