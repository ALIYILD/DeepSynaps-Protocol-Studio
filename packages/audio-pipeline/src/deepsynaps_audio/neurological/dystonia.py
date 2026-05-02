"""Laryngeal-dystonia composite (voice break + strain + breathiness)."""

from __future__ import annotations

from typing import Mapping

from ..schemas import DystoniaIndex


def dystonia_voice_index(features: Mapping[str, float]) -> DystoniaIndex:
    """Composite index sensitive to laryngeal dystonia — v2 module.

    TODO: implement in v2. Combines voice-break stats, jitter,
    shimmer, HNR, and CPPS via a weighted sum calibrated on a
    laryngeal-dystonia cohort.
    """

    raise NotImplementedError(
        "neurological.dystonia.dystonia_voice_index: v2 module — see "
        "AUDIO_ANALYZER_STACK.md §7."
    )
