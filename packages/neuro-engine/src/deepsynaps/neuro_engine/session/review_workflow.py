"""Human-in-the-loop workflow state for recommendation draft review.

This module manages operational review state around recommendation drafts. It
is not part of the clinical inference logic itself; instead, it exists to
support auditability, reviewer accountability, and safe operational deployment
by enforcing explicit workflow transitions, preserving every review action, and
keeping human approval or override mandatory for high-impact outputs.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

from .recommendation_drafts import RecommendationDraft


class ReviewWorkflowError(RuntimeError):
    """Raised when a recommendation draft review transition is invalid."""


@dataclass(slots=True)
class ReviewAction:
    """One immutable audit action within a draft review workflow."""

    action_id: str
    actor_id: str
    actor_role: str | None
    action_type: str
    rationale: str | None
    created_at: datetime
    metadata: dict[str, str | int | float | bool | None]

    def to_dict(self) -> dict[str, Any]:
        """Serialize the action into JSON-friendly primitives."""

        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ReviewAction":
        """Reconstruct a review action from serialized primitives."""

        return cls(
            action_id=data["action_id"],
            actor_id=data["actor_id"],
            actor_role=data.get("actor_role"),
            action_type=data["action_type"],
            rationale=data.get("rationale"),
            created_at=datetime.fromisoformat(data["created_at"]),
            metadata=dict(data.get("metadata", {})),
        )


@dataclass(slots=True)
class DraftReviewState:
    """Current workflow state and immutable history for one recommendation draft."""

    draft_id: str
    subject_id: str
    session_id: str | None
    condition: str
    current_status: str
    reviewer_id: str | None
    reviewer_role: str | None
    last_updated_at: datetime
    actions: list[ReviewAction]
    final_recommendation_snapshot: dict[str, Any] | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the review state into JSON-friendly primitives."""

        return {
            "draft_id": self.draft_id,
            "subject_id": self.subject_id,
            "session_id": self.session_id,
            "condition": self.condition,
            "current_status": self.current_status,
            "reviewer_id": self.reviewer_id,
            "reviewer_role": self.reviewer_role,
            "last_updated_at": self.last_updated_at.isoformat(),
            "actions": [action.to_dict() for action in self.actions],
            "final_recommendation_snapshot": self.final_recommendation_snapshot,
        }

    def to_json(self, **json_kwargs: Any) -> str:
        """Serialize the review state into a JSON string."""

        return json.dumps(self.to_dict(), **json_kwargs)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DraftReviewState":
        """Reconstruct a review state from serialized primitives."""

        return cls(
            draft_id=data["draft_id"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            condition=data["condition"],
            current_status=data["current_status"],
            reviewer_id=data.get("reviewer_id"),
            reviewer_role=data.get("reviewer_role"),
            last_updated_at=datetime.fromisoformat(data["last_updated_at"]),
            actions=[ReviewAction.from_dict(action) for action in data.get("actions", [])],
            final_recommendation_snapshot=data.get("final_recommendation_snapshot"),
        )


class ReviewWorkflowManager:
    """Deterministic state machine for recommendation draft review workflows."""

    _TRANSITIONS = {
        "submit_for_review": {"draft", "changes_requested"},
        "approve": {"in_review"},
        "reject": {"in_review"},
        "request_changes": {"in_review"},
        "override": {"in_review", "approved"},
    }

    def initialize(
        self,
        draft: RecommendationDraft,
        actor_id: str,
        actor_role: str | None = None,
    ) -> DraftReviewState:
        """Create the initial workflow state for a persisted recommendation draft."""

        now = datetime.now(timezone.utc)
        action = ReviewAction(
            action_id=str(uuid4()),
            actor_id=actor_id,
            actor_role=actor_role,
            action_type="initialize",
            rationale="Review workflow initialized.",
            created_at=now,
            metadata={"review_status": draft.review_status, "required_human_review": draft.required_human_review},
        )
        return DraftReviewState(
            draft_id="",
            subject_id=draft.subject_id,
            session_id=draft.session_id,
            condition=draft.condition,
            current_status="draft",
            reviewer_id=actor_id,
            reviewer_role=actor_role,
            last_updated_at=now,
            actions=[action],
            final_recommendation_snapshot=None,
        )

    def submit_for_review(
        self,
        state: DraftReviewState,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
    ) -> DraftReviewState:
        """Move a draft into active review."""

        return self._transition(
            state=state,
            actor_id=actor_id,
            actor_role=actor_role,
            action_type="submit",
            target_status="in_review",
            rationale=rationale,
            allowed_from=self._TRANSITIONS["submit_for_review"],
        )

    def approve(
        self,
        state: DraftReviewState,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
        final_snapshot: dict[str, Any] | None = None,
    ) -> DraftReviewState:
        """Approve a reviewed recommendation draft."""

        return self._transition(
            state=state,
            actor_id=actor_id,
            actor_role=actor_role,
            action_type="approve",
            target_status="approved",
            rationale=rationale,
            allowed_from=self._TRANSITIONS["approve"],
            final_snapshot=final_snapshot,
        )

    def reject(
        self,
        state: DraftReviewState,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
    ) -> DraftReviewState:
        """Reject a reviewed recommendation draft."""

        if not rationale:
            raise ReviewWorkflowError("Rejecting a draft requires a rationale.")
        return self._transition(
            state=state,
            actor_id=actor_id,
            actor_role=actor_role,
            action_type="reject",
            target_status="rejected",
            rationale=rationale,
            allowed_from=self._TRANSITIONS["reject"],
        )

    def request_changes(
        self,
        state: DraftReviewState,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
    ) -> DraftReviewState:
        """Request changes to a reviewed recommendation draft."""

        if not rationale:
            raise ReviewWorkflowError("Requesting changes requires a rationale.")
        return self._transition(
            state=state,
            actor_id=actor_id,
            actor_role=actor_role,
            action_type="request_changes",
            target_status="changes_requested",
            rationale=rationale,
            allowed_from=self._TRANSITIONS["request_changes"],
        )

    def override(
        self,
        state: DraftReviewState,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
        final_snapshot: dict[str, Any] | None = None,
    ) -> DraftReviewState:
        """Override an in-review or approved recommendation draft."""

        if not rationale:
            raise ReviewWorkflowError("Overriding a draft requires a rationale.")
        return self._transition(
            state=state,
            actor_id=actor_id,
            actor_role=actor_role,
            action_type="override",
            target_status="overridden",
            rationale=rationale,
            allowed_from=self._TRANSITIONS["override"],
            final_snapshot=final_snapshot,
        )

    def _transition(
        self,
        *,
        state: DraftReviewState,
        actor_id: str,
        actor_role: str | None,
        action_type: str,
        target_status: str,
        rationale: str | None,
        allowed_from: set[str],
        final_snapshot: dict[str, Any] | None = None,
    ) -> DraftReviewState:
        """Apply one audited workflow transition and return a new state."""

        if state.current_status not in allowed_from:
            raise ReviewWorkflowError(
                f"Cannot {action_type} draft {state.draft_id} from status {state.current_status}."
            )
        now = datetime.now(timezone.utc)
        action = ReviewAction(
            action_id=str(uuid4()),
            actor_id=actor_id,
            actor_role=actor_role,
            action_type=action_type,
            rationale=rationale,
            created_at=now,
            metadata={"from_status": state.current_status, "to_status": target_status},
        )
        return DraftReviewState(
            draft_id=state.draft_id,
            subject_id=state.subject_id,
            session_id=state.session_id,
            condition=state.condition,
            current_status=target_status,
            reviewer_id=actor_id,
            reviewer_role=actor_role,
            last_updated_at=now,
            actions=[*state.actions, action],
            final_recommendation_snapshot=final_snapshot if final_snapshot is not None else state.final_recommendation_snapshot,
        )


__all__ = [
    "DraftReviewState",
    "ReviewAction",
    "ReviewWorkflowError",
    "ReviewWorkflowManager",
]
