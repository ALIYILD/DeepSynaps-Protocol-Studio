"""Map continuous biomarkers → MDS-UPDRS / TUG / Tinetti score suggestions.

Decision-support only — every suggested score ships with an ``uncertainty``
and the spec disclaimer.
"""

from __future__ import annotations

from .schemas import MetricValue, SuggestedScore, TaskId


def suggest_mds_updrs_score(
    task_id: TaskId,
    metrics: dict[str, MetricValue],
) -> SuggestedScore | None:
    """Return a 0–4 MDS-UPDRS-style suggestion for a known task.

    Anchor logic per task is published in MDS-UPDRS Part III and
    re-implemented here against our biomarker keys. TODO(impl): one branch
    per ``task_id``; conservative bias toward lower scores when uncertainty
    is high.
    """

    _ = (task_id, metrics)
    raise NotImplementedError


__all__ = ["suggest_mds_updrs_score"]
