"""MCI / AD-spectrum risk score from prosodic + lexical + syntactic features."""

from __future__ import annotations

from typing import Mapping

from ..analyzers.cognitive_speech import score_cognitive_speech_risk
from ..schemas import MCIRisk, ParalinguisticCognitiveFeatures


def mci_risk_score(features: Mapping[str, float]) -> MCIRisk:
    """Wrap :func:`analyzers.cognitive_speech.score_cognitive_speech_risk` with scalar inputs."""

    para = ParalinguisticCognitiveFeatures(
        speech_rate_wpm=float(features.get("speech_rate_wpm", 0.0)),
        articulation_rate_syl_per_s=float(features.get("articulation_rate_syl_per_s", 0.0)),
        pause_count=int(features.get("pause_count", 0)),
        pause_mean_s=float(features.get("pause_mean_s", 0.0)),
        pause_sd_s=float(features.get("pause_sd_s", 0.0)),
        pause_time_ratio=float(features.get("pause_time_ratio", 0.0)),
        mean_pause_duration_s=float(features.get("mean_pause_duration_s", 0.0)),
        f0_variability_hz=float(features.get("f0_variability_hz", 0.0)),
        intensity_variability_db=float(features.get("intensity_variability_db", 0.0)),
        syllable_count_est=int(features.get("syllable_count_est", 0)),
        word_count_est=int(features.get("word_count_est", 0)),
    )
    scored = score_cognitive_speech_risk(para, None)
    return MCIRisk(
        score=scored.score,
        percentile=None,
        drivers=list(scored.drivers),
        confidence=scored.confidence,
        model_version=f"{scored.model_name}/{scored.model_version}",
    )
