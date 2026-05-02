"""MCI / AD-spectrum risk score from prosodic + lexical + syntactic features."""

from __future__ import annotations

from typing import Mapping

from ..schemas import MCIRisk


def mci_risk_score(features: Mapping[str, float]) -> MCIRisk:
    """Continuous MCI / AD-spectrum risk score.

    TODO: v2 module. Calibrated GBM over the prosody + lexical +
    syntactic feature stack, trained on DementiaBank /
    Pitt-corpus-derived features. Always emit a percentile against
    age-matched norms — never a hard class label.
    """

    raise NotImplementedError(
        "cognitive.mci_risk.mci_risk_score: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )
