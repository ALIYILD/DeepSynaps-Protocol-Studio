"""Operational review queue and escalation utilities for recommendation drafts.

This module provides queue-building, prioritization, and escalation helpers for
recommendation draft review workflows. It is separate from clinical inference
and separate from the review state transition engine itself. Its purpose is to
support timely review, accountability, and safe workflow orchestration by
turning persisted review states into actionable worklists and explicit
escalation records.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .recommendation_drafts import RecommendationDraft
from .review_workflow import DraftReviewState


class ReviewQueueError(RuntimeError):
    """Raised when a review queue or escalation action cannot be produced safely."""


@dataclass(slots=True)
class ReviewQueueItem:
    """One actionable queue item derived from a review workflow state."""

    draft_id: str
    subject_id: str
    session_id: str | None
    condition: str
    current_status: str
    reviewer_id: str | None
    reviewer_role: str | None
    created_at: datetime
    last_updated_at: datetime
    age_hours: float
    hours_since_last_action: float
    priority_score: float
    priority_bucket: str
    escalation_flags: list[str]
    summary: str | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the queue item into JSON-friendly primitives."""

        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        payload["last_updated_at"] = self.last_updated_at.isoformat()
        return payload


@dataclass(slots=True)
class ReviewQueueSnapshot:
    """One generated review worklist snapshot."""

    generated_at: datetime
    total_items: int
    items: list[ReviewQueueItem]
    counts_by_status: dict[str, int]
    counts_by_priority: dict[str, int]

    def to_dict(self) -> dict[str, Any]:
        """Serialize the queue snapshot into JSON-friendly primitives."""

        return {
            "generated_at": self.generated_at.isoformat(),
            "total_items": self.total_items,
            "items": [item.to_dict() for item in self.items],
            "counts_by_status": dict(self.counts_by_status),
            "counts_by_priority": dict(self.counts_by_priority),
        }


@dataclass(slots=True)
class EscalationEvent:
    """One operational escalation event for a review workflow item."""

    escalation_id: str
    draft_id: str
    reason: str
    from_reviewer_id: str | None
    to_reviewer_id: str | None
    to_queue: str | None
    created_at: datetime
    metadata: dict[str, str | int | float | bool | None]

    def to_dict(self) -> dict[str, Any]:
        """Serialize the escalation event into JSON-friendly primitives."""

        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EscalationEvent":
        """Reconstruct an escalation event from serialized primitives."""

        return cls(
            escalation_id=data["escalation_id"],
            draft_id=data["draft_id"],
            reason=data["reason"],
            from_reviewer_id=data.get("from_reviewer_id"),
            to_reviewer_id=data.get("to_reviewer_id"),
            to_queue=data.get("to_queue"),
            created_at=datetime.fromisoformat(data["created_at"]),
            metadata=dict(data.get("metadata", {})),
        )


class ReviewQueueManager:
    """Build review queues and escalation records from persisted workflow state."""

    _ACTIONABLE_STATUSES = {"draft", "in_review", "changes_requested"}
    _TERMINAL_STATUSES = {"approved", "rejected", "overridden"}
    _BASE_STATUS_SCORES = {
        "draft": 10.0,
        "changes_requested": 20.0,
        "in_review": 30.0,
    }

    def build_queue(
        self,
        review_states: list[DraftReviewState],
        recommendation_drafts: dict[str, RecommendationDraft] | None = None,
        now: datetime | None = None,
    ) -> ReviewQueueSnapshot:
        """Build a sorted actionable review queue from persisted workflow states."""

        reference_time = now or datetime.now(timezone.utc)
        items: list[ReviewQueueItem] = []
        counts_by_status: dict[str, int] = {}
        counts_by_priority: dict[str, int] = {}
        drafts = recommendation_drafts or {}

        for state in review_states:
            if state.current_status not in self._ACTIONABLE_STATUSES:
                continue
            created_at = state.actions[0].created_at if state.actions else state.last_updated_at
            age_hours = max(0.0, (reference_time - created_at).total_seconds() / 3600.0)
            hours_since_last_action = max(0.0, (reference_time - state.last_updated_at).total_seconds() / 3600.0)
            priority_score, priority_bucket, escalation_flags = self.compute_priority(
                state,
                draft=drafts.get(state.draft_id),
                now=reference_time,
            )
            summary = _build_summary(state, drafts.get(state.draft_id))
            item = ReviewQueueItem(
                draft_id=state.draft_id,
                subject_id=state.subject_id,
                session_id=state.session_id,
                condition=state.condition,
                current_status=state.current_status,
                reviewer_id=state.reviewer_id,
                reviewer_role=state.reviewer_role,
                created_at=created_at,
                last_updated_at=state.last_updated_at,
                age_hours=age_hours,
                hours_since_last_action=hours_since_last_action,
                priority_score=priority_score,
                priority_bucket=priority_bucket,
                escalation_flags=escalation_flags,
                summary=summary,
            )
            items.append(item)
            counts_by_status[state.current_status] = counts_by_status.get(state.current_status, 0) + 1
            counts_by_priority[priority_bucket] = counts_by_priority.get(priority_bucket, 0) + 1

        items.sort(key=lambda item: (-item.priority_score, item.last_updated_at))

        return ReviewQueueSnapshot(
            generated_at=reference_time,
            total_items=len(items),
            items=items,
            counts_by_status=counts_by_status,
            counts_by_priority=counts_by_priority,
        )

    def compute_priority(
        self,
        state: DraftReviewState,
        draft: RecommendationDraft | None = None,
        now: datetime | None = None,
    ) -> tuple[float, str, list[str]]:
        """Compute deterministic priority score, bucket, and escalation flags."""

        reference_time = now or datetime.now(timezone.utc)
        score = self._BASE_STATUS_SCORES.get(state.current_status, 0.0)
        flags: list[str] = []

        hours_since_last_action = max(0.0, (reference_time - state.last_updated_at).total_seconds() / 3600.0)
        score += min(hours_since_last_action * 0.5, 30.0)
        if hours_since_last_action >= 72:
            score += 20.0
            flags.append("stale_review")
        elif hours_since_last_action >= 24:
            score += 10.0
            flags.append("stale_review")

        if state.current_status == "changes_requested":
            score += 5.0
            flags.append("changes_requested_pending")

        if state.reviewer_id is None:
            score += 10.0
            flags.append("awaiting_reviewer_assignment")

        if draft is not None:
            safety_signals = 0
            missing_information_count = 0
            for option in draft.options:
                missing_information_count += len(option.missing_information)
                safety_signals += sum(
                    1
                    for flag in option.safety_flags
                    if any(
                        marker in flag.lower()
                        for marker in ("contraindication", "seizure", "capacity", "suicid", "medical")
                    )
                )
            if safety_signals > 0:
                score += min(5.0 + safety_signals * 2.0, 15.0)
                flags.append("safety_flag_present")
            if missing_information_count >= 6:
                score += 5.0
            elif missing_information_count >= 3:
                score += 2.0

        if score >= 60:
            bucket = "critical"
        elif score >= 40:
            bucket = "high"
        elif score >= 20:
            bucket = "medium"
        else:
            bucket = "low"

        return score, bucket, sorted(set(flags))

    def escalate(
        self,
        state: DraftReviewState,
        reason: str,
        *,
        to_reviewer_id: str | None = None,
        to_queue: str | None = None,
        metadata: dict[str, str | int | float | bool | None] | None = None,
    ) -> EscalationEvent:
        """Create a persisted escalation event without mutating review state."""

        if to_reviewer_id is None and to_queue is None:
            raise ReviewQueueError("Escalation requires at least one destination reviewer or queue.")
        return EscalationEvent(
            escalation_id=str(uuid4()),
            draft_id=state.draft_id,
            reason=reason,
            from_reviewer_id=state.reviewer_id,
            to_reviewer_id=to_reviewer_id,
            to_queue=to_queue,
            created_at=datetime.now(timezone.utc),
            metadata={} if metadata is None else dict(metadata),
        )


def _build_summary(state: DraftReviewState, draft: RecommendationDraft | None) -> str | None:
    """Build a concise operational summary for one queue item."""

    if draft is None:
        return f"{state.condition} review pending in status {state.current_status}."
    option_count = len(draft.options)
    top_family = None if not draft.options else draft.options[0].protocol_family
    if top_family:
        return f"{state.condition} draft with {option_count} option(s); top family: {top_family}."
    return f"{state.condition} draft with {option_count} option(s) awaiting review."


__all__ = [
    "EscalationEvent",
    "ReviewQueueError",
    "ReviewQueueItem",
    "ReviewQueueManager",
    "ReviewQueueSnapshot",
]
