"""Parkinson's-voice likelihood — transparent heuristic logit (research/wellness)."""

from __future__ import annotations

import math
from typing import Mapping

from ..schemas import PDLikelihood

MODEL_VERSION = "heuristic_logit/v1"


def pd_voice_likelihood(features: Mapping[str, float]) -> PDLikelihood:
    """Map acoustic/nonlinear features to a continuous 0–1 score — not a diagnostic."""

    jitter = float(features.get("jitter_local", 0.0))
    hnr = float(features.get("hnr_db", 0.0))
    rpde = float(features.get("rpde", 0.0))
    dfa = float(features.get("dfa", 0.5))
    ppe = float(features.get("ppe", 0.0))

    z = (
        1.2 * jitter * 100
        - 0.08 * max(hnr, -20.0)
        + 0.9 * rpde
        + 0.4 * abs(dfa - 0.65)
        + 0.15 * ppe
        - 0.15
    )
    score = float(1.0 / (1.0 + math.exp(-z)))
    score = max(0.0, min(1.0, score))

    drivers: list[str] = []
    if jitter > 0.02:
        drivers.append("elevated_jitter_local")
    if hnr < 15.0:
        drivers.append("reduced_hnr_db")
    if rpde > 0.5:
        drivers.append("elevated_rpde")

    return PDLikelihood(
        score=score,
        percentile=None,
        drivers=drivers[:8],
        confidence=0.55,
        model_version=MODEL_VERSION,
    )
