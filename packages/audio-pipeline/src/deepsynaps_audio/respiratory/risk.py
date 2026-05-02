"""Composite respiratory acoustic risk score."""

from __future__ import annotations

from typing import Mapping

from ..schemas import RespRisk


def respiratory_risk(features: Mapping[str, float]) -> RespRisk:
    """Composite respiratory risk score.

    TODO: v2 module. Combines cough features, breath-cycle stats, and
    sustained-vowel HNR/CPPS. Outputs a continuous 0–1 score plus
    drivers, mirroring the VoiceMed / Sonde-style risk-score envelope.
    """

    raise NotImplementedError(
        "respiratory.risk.respiratory_risk: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )
