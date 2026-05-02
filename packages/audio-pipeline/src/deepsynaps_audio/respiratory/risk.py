"""Composite respiratory acoustic risk score."""

from __future__ import annotations

from typing import Mapping

from ..analyzers.respiratory_voice import score_respiratory_risk
from ..schemas import RespRisk, RespiratoryFeatures


def respiratory_risk(features: Mapping[str, float]) -> RespRisk:
    """Map scalar respiratory-style features to a 0–1 score via the analyzer bundle."""

    rf = RespiratoryFeatures.model_validate(dict(features))
    scored = score_respiratory_risk(rf)
    return RespRisk(
        score=scored.score,
        drivers=list(scored.drivers),
        confidence=scored.confidence,
        model_version=f"{scored.model_name}/{scored.model_version}",
    )
