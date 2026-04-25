from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RecommendationFeedback:
    analysis_id: str
    protocol_id: str
    accepted: bool
    notes: str | None = None


def record_feedback(_feedback: RecommendationFeedback) -> None:
    """Feedback hook interface (accept/reject).

    This is intentionally a stub: wiring persistence touches product-specific DB
    schemas and is handled at the API layer when ready.
    """
    raise NotImplementedError(
        "Feedback persistence is not wired yet. "
        "Implement this at the API layer (e.g., write to a qeeg_recommendation_feedback table)."
    )

