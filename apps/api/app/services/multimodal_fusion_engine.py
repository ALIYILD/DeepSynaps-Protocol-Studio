"""Multimodal Fusion Engine — fuses scores from clinical data modalities.

Collects modality scores from video/movement, voice, text, wearable,
biomarker, assessment, and digital phenotyping sources.  Computes a
weighted fusion score with confidence and evidence-grade tracking.

Decision-support only — requires clinician review.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

_log = logging.getLogger(__name__)


@dataclass
class ModalityScore:
    """Single-modality score container.

    Attributes
    ----------
    name: modality identifier (video, voice, text, wearable, biomarker, assessment, digital_phenotyping)
    score: 0-1 normalized score for this modality
    confidence: 0-1 confidence in the score
    evidence_grade: A/B/C grade for the evidence quality
    features: modality-specific feature dict
    safe_summary: human-readable summary (safe, non-diagnostic wording)
    """

    name: str
    score: float = 0.0
    confidence: float = 0.0
    evidence_grade: str = "C"
    features: dict[str, Any] = field(default_factory=dict)
    safe_summary: str = ""


class MultimodalFusionEngine:
    """Fusion engine that aggregates ModalityScore objects.

    Usage
    -----
    engine = MultimodalFusionEngine()
    engine.add_modality(ModalityScore(name="video", score=0.72, ...))
    result = engine.fuse()
    """

    # Evidence-grade weights for fusion scoring
    _GRADE_WEIGHTS: dict[str, float] = {
        "A": 1.0,
        "B": 0.75,
        "C": 0.5,
    }

    def __init__(self) -> None:
        self.modality_scores: list[ModalityScore] = []

    def add_modality(self, score: ModalityScore) -> None:
        """Add a modality score to the fusion set."""
        self.modality_scores.append(score)

    def fuse(self) -> dict[str, Any]:
        """Run fusion across all collected modalities.

        Returns a dict with per-modality results, fusion summary,
        and decision-support disclaimer.
        """
        if not self.modality_scores:
            return {
                "fusion": {
                    "fusion_score": 0.0,
                    "confidence": 0.0,
                    "evidence_grade": "C",
                    "modalities_count": 0,
                    "safe_summary": "No modality data available for fusion.",
                },
                "modalities": {},
                "disclaimer": (
                    "Decision-support only — no modality data available. "
                    "Clinician review required."
                ),
            }

        modalities: dict[str, dict[str, Any]] = {}
        weighted_sum = 0.0
        weight_total = 0.0
        confidence_sum = 0.0
        grade_counts: dict[str, int] = {"A": 0, "B": 0, "C": 0}

        for ms in self.modality_scores:
            modalities[ms.name] = {
                "score": round(ms.score, 3),
                "confidence": round(ms.confidence, 3),
                "evidence_grade": ms.evidence_grade,
                "features": ms.features,
                "safe_summary": ms.safe_summary,
            }
            grade_weight = self._GRADE_WEIGHTS.get(ms.evidence_grade, 0.5)
            modality_weight = ms.confidence * grade_weight
            weighted_sum += ms.score * modality_weight
            weight_total += modality_weight
            confidence_sum += ms.confidence
            grade_counts[ms.evidence_grade] = grade_counts.get(ms.evidence_grade, 0) + 1

        fusion_score = weighted_sum / weight_total if weight_total > 0 else 0.0
        avg_confidence = confidence_sum / len(self.modality_scores)

        # Overall evidence grade: best grade present, weighted by count
        overall_grade = "C"
        for g in ("A", "B"):
            if grade_counts.get(g, 0) > len(self.modality_scores) // 2:
                overall_grade = g
                break

        # Build a safe composite summary
        summaries: list[str] = []
        for ms in self.modality_scores:
            summaries.append(f"{ms.name}: {ms.safe_summary}")

        safe_summary = (
            f"Fusion across {len(self.modality_scores)} modalities. "
            f"Score {fusion_score:.2f} (confidence {avg_confidence:.2f}, grade {overall_grade}). "
            + " | ".join(summaries)
        )

        return {
            "fusion": {
                "fusion_score": round(fusion_score, 3),
                "confidence": round(avg_confidence, 3),
                "evidence_grade": overall_grade,
                "modalities_count": len(self.modality_scores),
                "safe_summary": safe_summary,
            },
            "modalities": modalities,
            "disclaimer": (
                "Decision-support only — fusion scores require clinician review "
                "and correlation with in-person examination before clinical interpretation."
            ),
        }
