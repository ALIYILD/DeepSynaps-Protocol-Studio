"""Dysarthria severity (0–4) + subtype hint (spastic / flaccid / ataxic / hyper- / hypokinetic / mixed)."""

from __future__ import annotations

from typing import Mapping

from ..schemas import DysarthriaScore


def dysarthria_severity(features: Mapping[str, float]) -> DysarthriaScore:
    """Score dysarthria severity and emit a subtype hint when supported.

    TODO: implement in PR #3 (see ``AUDIO_ANALYZER_STACK.md §9`` task
    3). v1 uses a calibrated GBM over the same merged feature dict as
    :func:`pd_voice_likelihood`; subtype hint is gated behind a
    confidence threshold and may stay ``None`` in v1.
    """

    raise NotImplementedError(
        "neurological.dysarthria.dysarthria_severity: implement in PR #3 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
