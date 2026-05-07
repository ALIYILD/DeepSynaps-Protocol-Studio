"""Operational review queue and escalation tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from deepsynaps.neuro_engine import NeuroEngine
from deepsynaps.neuro_engine.session.recommendation_drafts import RecommendationDraft, RecommendationOption
from deepsynaps.neuro_engine.session.review_queue import ReviewQueueError, ReviewQueueManager
from deepsynaps.neuro_engine.session.review_workflow import DraftReviewState, ReviewAction
from deepsynaps.neuro_engine.storage.models import StoredDraftReviewState, StoredRecommendationDraft
from deepsynaps.neuro_engine.storage.service import InMemoryNeuroEngineStorage


def _draft(condition: str = "depression", *, missing_count: int = 1, safety_flags: list[str] | None = None) -> RecommendationDraft:
    """Create a synthetic recommendation draft for queue tests."""

    return RecommendationDraft(
        version="1.0.0",
        condition=condition,
        subject_id="DS123",
        session_id="V1",
        options=[
            RecommendationOption(
                option_id="opt-1",
                modality="rTMS",
                target_region="left DLPFC",
                laterality="left",
                protocol_family="connectivity_informed_left_dlpfc",
                evidence_keys=["functional_dmn_connectivity_abnormality_proxy"],
                rationale="Synthetic rationale",
                confidence_level="moderate",
                safety_flags=["requires clinician confirmation"] + ([] if safety_flags is None else safety_flags),
                missing_information=[f"missing-{index}" for index in range(missing_count)],
                notes=None,
            )
        ],
        global_rationale="Synthetic rationale",
        required_human_review=True,
        review_status="draft",
        audit_tags=["evidence_linked", "non_prescriptive", "human_review_required"],
        created_at=datetime(2026, 5, 7, 14, 0, tzinfo=timezone.utc),
    )


def _state(
    draft_id: str,
    *,
    status: str,
    reviewer_id: str | None,
    last_updated_at: datetime,
    created_at: datetime | None = None,
) -> DraftReviewState:
    """Create a synthetic review state."""

    created = created_at or (last_updated_at - timedelta(hours=1))
    return DraftReviewState(
        draft_id=draft_id,
        subject_id="DS123",
        session_id="V1",
        condition="depression",
        current_status=status,
        reviewer_id=reviewer_id,
        reviewer_role="psychiatrist" if reviewer_id else None,
        last_updated_at=last_updated_at,
        actions=[
            ReviewAction(
                action_id=f"action-{draft_id}",
                actor_id="creator",
                actor_role="psychiatrist",
                action_type="initialize",
                rationale="Created",
                created_at=created,
                metadata={},
            )
        ],
        final_recommendation_snapshot=None,
    )


def test_queue_includes_actionable_states_and_excludes_terminal_states() -> None:
    """Queue snapshots should include only actionable workflow items by default."""

    now = datetime(2026, 5, 7, 18, 0, tzinfo=timezone.utc)
    states = [
        _state("d1", status="draft", reviewer_id=None, last_updated_at=now - timedelta(hours=2)),
        _state("d2", status="in_review", reviewer_id="r1", last_updated_at=now - timedelta(hours=1)),
        _state("d3", status="changes_requested", reviewer_id="r2", last_updated_at=now - timedelta(hours=3)),
        _state("d4", status="approved", reviewer_id="r3", last_updated_at=now - timedelta(hours=4)),
    ]

    snapshot = ReviewQueueManager().build_queue(states, now=now)

    assert snapshot.total_items == 3
    assert {item.draft_id for item in snapshot.items} == {"d1", "d2", "d3"}
    assert "approved" not in snapshot.counts_by_status


def test_priority_scoring_is_deterministic_for_stale_vs_fresh_items() -> None:
    """Older in-review items should score above fresher ones."""

    manager = ReviewQueueManager()
    now = datetime(2026, 5, 7, 18, 0, tzinfo=timezone.utc)
    stale = _state("stale", status="in_review", reviewer_id="r1", last_updated_at=now - timedelta(hours=50))
    fresh = _state("fresh", status="in_review", reviewer_id="r1", last_updated_at=now - timedelta(hours=2))

    stale_score, stale_bucket, stale_flags = manager.compute_priority(stale, now=now)
    fresh_score, fresh_bucket, fresh_flags = manager.compute_priority(fresh, now=now)

    assert stale_score > fresh_score
    assert "stale_review" in stale_flags
    assert stale_bucket in {"high", "critical"}
    assert "stale_review" not in fresh_flags


def test_missing_reviewer_adds_escalation_flag() -> None:
    """Queue scoring should flag drafts awaiting reviewer assignment."""

    state = _state(
        "draft-1",
        status="draft",
        reviewer_id=None,
        last_updated_at=datetime(2026, 5, 7, 17, 0, tzinfo=timezone.utc),
    )
    _, _, flags = ReviewQueueManager().compute_priority(state, now=datetime(2026, 5, 7, 18, 0, tzinfo=timezone.utc))

    assert "awaiting_reviewer_assignment" in flags


def test_escalation_requires_destination() -> None:
    """Escalation requests without a reviewer or queue should fail."""

    state = _state(
        "draft-1",
        status="in_review",
        reviewer_id="r1",
        last_updated_at=datetime(2026, 5, 7, 17, 0, tzinfo=timezone.utc),
    )

    with pytest.raises(ReviewQueueError):
        ReviewQueueManager().escalate(state, reason="Need escalation")


def test_escalation_event_persists_in_storage() -> None:
    """Escalation events should be persisted and retrievable through configured storage."""

    storage = InMemoryNeuroEngineStorage()
    engine = NeuroEngine(storage=storage)
    draft = _draft()
    draft_id = "stored-draft"
    state = _state(
        draft_id,
        status="in_review",
        reviewer_id="r1",
        last_updated_at=datetime(2026, 5, 7, 17, 0, tzinfo=timezone.utc),
    )

    storage.save_recommendation_draft(
        StoredRecommendationDraft(
            id=draft_id,
            subject_id=draft.subject_id,
            session_id=draft.session_id,
            condition=draft.condition,
            recommendation_draft_version=draft.version,
            payload=draft.to_dict(),
            created_at=datetime.now(timezone.utc),
            updated_at=None,
        )
    )
    storage.save_review_state(
        StoredDraftReviewState(
            id="review-state-1",
            draft_id=draft_id,
            subject_id=state.subject_id,
            session_id=state.session_id,
            condition=state.condition,
            review_workflow_version="1.0.0",
            payload=state.to_dict(),
            created_at=datetime.now(timezone.utc),
            updated_at=None,
        )
    )

    event = engine.escalate_recommendation_draft(
        draft_id,
        reason="Stale review",
        to_queue="medical_director",
        metadata={"stale_hours": 24},
    )
    events = engine.list_escalation_events(draft_id)

    assert event.to_queue == "medical_director"
    assert len(events) == 1
    assert events[0].draft_id == draft_id


def test_neuroengine_get_review_queue_returns_sorted_snapshot() -> None:
    """NeuroEngine should build a sorted actionable queue from stored review states."""

    storage = InMemoryNeuroEngineStorage()
    engine = NeuroEngine(storage=storage)
    now = datetime.now(timezone.utc)
    older_state = _state("old", status="in_review", reviewer_id="r1", last_updated_at=now - timedelta(hours=48))
    newer_state = _state("new", status="draft", reviewer_id=None, last_updated_at=now - timedelta(hours=2))
    older_draft = _draft(missing_count=5, safety_flags=["screen for contraindications"])
    newer_draft = _draft(missing_count=1)

    for draft_id, state, draft in (
        ("old", older_state, older_draft),
        ("new", newer_state, newer_draft),
    ):
        storage.save_recommendation_draft(
            StoredRecommendationDraft(
                id=draft_id,
                subject_id=draft.subject_id,
                session_id=draft.session_id,
                condition=draft.condition,
                recommendation_draft_version=draft.version,
                payload=draft.to_dict(),
                created_at=datetime.now(timezone.utc),
                updated_at=None,
            )
        )
        storage.save_review_state(
            StoredDraftReviewState(
                id=f"state-{draft_id}",
                draft_id=draft_id,
                subject_id=state.subject_id,
                session_id=state.session_id,
                condition=state.condition,
                review_workflow_version="1.0.0",
                payload=state.to_dict(),
                created_at=datetime.now(timezone.utc),
                updated_at=None,
            )
        )

    snapshot = engine.get_review_queue()

    assert snapshot.total_items == 2
    assert snapshot.items[0].draft_id == "old"
    assert snapshot.items[0].priority_score >= snapshot.items[1].priority_score


def test_review_queue_api_routes_return_expected_structures_and_errors() -> None:
    """Queue and escalation routes should return serialized payloads and clear errors."""

    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from deepsynaps.neuro_engine.api.routes import create_app
    from deepsynaps.neuro_engine.session.review_queue import EscalationEvent, ReviewQueueSnapshot

    now = datetime(2026, 5, 7, 18, 0, tzinfo=timezone.utc)
    snapshot = ReviewQueueManager().build_queue(
        [_state("draft-1", status="in_review", reviewer_id="r1", last_updated_at=now - timedelta(hours=10))],
        recommendation_drafts={"draft-1": _draft()},
        now=now,
    )
    escalation = EscalationEvent(
        escalation_id="esc-1",
        draft_id="draft-1",
        reason="Stale review",
        from_reviewer_id="r1",
        to_reviewer_id=None,
        to_queue="backup",
        created_at=now,
        metadata={"stale_hours": 10},
    )

    class _Engine:
        def get_review_queue(self) -> ReviewQueueSnapshot:
            return snapshot

        def escalate_recommendation_draft(self, draft_id, reason, *, to_reviewer_id=None, to_queue=None, metadata=None):
            if to_reviewer_id is None and to_queue is None:
                raise ReviewQueueError("Escalation requires at least one destination reviewer or queue.")
            return escalation

        def list_escalation_events(self, draft_id=None):
            return [escalation]

    client = TestClient(create_app(_Engine()))

    queue_response = client.get("/neuro-engine/recommendation-draft/review-queue")
    escalate_ok = client.post(
        "/neuro-engine/recommendation-draft/review/escalate",
        json={"draft_id": "draft-1", "reason": "Stale review", "to_queue": "backup"},
    )
    escalate_bad = client.post(
        "/neuro-engine/recommendation-draft/review/escalate",
        json={"draft_id": "draft-1", "reason": "Missing destination"},
    )
    events_response = client.get("/neuro-engine/recommendation-draft/review/escalations")

    assert queue_response.status_code == 200
    assert queue_response.json()["total_items"] == 1
    assert escalate_ok.status_code == 200
    assert escalate_ok.json()["reason"] == "Stale review"
    assert escalate_bad.status_code == 400
    assert events_response.status_code == 200
    assert len(events_response.json()) == 1
