"""Patient-as-own-baseline deltas + minimum-detectable-change flags + timelines."""

from __future__ import annotations

from typing import Mapping
from uuid import UUID

from .schemas import Delta, Timeline


def delta_vs_baseline(
    feature: str,
    current: float,
    baseline: float,
    *,
    sd_baseline: float | None = None,
) -> Delta:
    """Compute raw / pct delta + Cohen's-d effect size + MDC flag.

    TODO: implement in PR #4 (see ``AUDIO_ANALYZER_STACK.md §9`` task
    4). MDC is computed against the per-feature SD of the patient's
    own baseline window when ``sd_baseline`` is supplied; otherwise
    fall back to the normative-bin SD.
    """

    raise NotImplementedError(
        "longitudinal.delta_vs_baseline: implement in PR #4 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )


def timeline(
    patient_id: UUID,
    sessions: Mapping[UUID, Mapping[str, float]],
) -> Timeline:
    """Aggregate session features into a longitudinal timeline.

    TODO: implement in PR #4. Emits ``{feature -> [value_per_session]}``.
    """

    raise NotImplementedError(
        "longitudinal.timeline: implement in PR #4 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
