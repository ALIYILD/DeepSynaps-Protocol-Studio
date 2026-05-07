"""Review workflow tests for recommendation draft oversight."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from deepsynaps.neuro_engine import NeuroEngine
from deepsynaps.neuro_engine.session.recommendation_drafts import RecommendationDraft, RecommendationOption
from deepsynaps.neuro_engine.session.review_workflow import (
    DraftReviewState,
    ReviewWorkflowError,
    ReviewWorkflowManager,
)
from deepsynaps.neuro_engine.storage.service import InMemoryNeuroEngineStorage


def _draft() -> RecommendationDraft:
    """Create a synthetic recommendation draft for workflow tests."""

    return RecommendationDraft(
        version="1.0.0",
        condition="depression",
        subject_id="DS123",
        session_id="V1",
        options=[
            RecommendationOption(
                option_id="dep-01",
                modality="rTMS",
                target_region="left DLPFC",
                laterality="left",
                protocol_family="connectivity_informed_left_dlpfc",
                evidence_keys=["functional_dmn_connectivity_abnormality_proxy"],
                rationale="Synthetic rationale",
                confidence_level="moderate",
                safety_flags=["requires clinician confirmation"],
                missing_information=["symptom severity scale"],
                notes=None,
            )
        ],
        global_rationale="Synthetic global rationale",
        required_human_review=True,
        review_status="draft",
        audit_tags=["evidence_linked", "non_prescriptive", "human_review_required"],
        created_at=datetime(2026, 5, 7, 14, 0, tzinfo=timezone.utc),
    )


def test_initialize_creates_draft_status_with_one_action() -> None:
    """Workflow initialization should create draft status and one audit action."""

    state = ReviewWorkflowManager().initialize(_draft(), actor_id="clinician-1", actor_role="psychiatrist")

    assert state.current_status == "draft"
    assert len(state.actions) == 1
    assert state.actions[0].action_type == "initialize"


def test_submit_for_review_transitions_correctly() -> None:
    """Drafts should move from draft to in_review through explicit submission."""

    manager = ReviewWorkflowManager()
    state = manager.initialize(_draft(), actor_id="clinician-1")
    state = DraftReviewState(
        draft_id="draft-1",
        subject_id=state.subject_id,
        session_id=state.session_id,
        condition=state.condition,
        current_status=state.current_status,
        reviewer_id=state.reviewer_id,
        reviewer_role=state.reviewer_role,
        last_updated_at=state.last_updated_at,
        actions=state.actions,
        final_recommendation_snapshot=state.final_recommendation_snapshot,
    )

    submitted = manager.submit_for_review(state, actor_id="clinician-1", rationale="Ready for review")

    assert submitted.current_status == "in_review"
    assert submitted.actions[-1].action_type == "submit"
    assert len(submitted.actions) == 2


def test_valid_terminal_transitions_work() -> None:
    """Approve, reject, request_changes, and override should work from valid states."""

    manager = ReviewWorkflowManager()
    base = manager.initialize(_draft(), actor_id="clinician-1")
    base = DraftReviewState(
        draft_id="draft-1",
        subject_id=base.subject_id,
        session_id=base.session_id,
        condition=base.condition,
        current_status=base.current_status,
        reviewer_id=base.reviewer_id,
        reviewer_role=base.reviewer_role,
        last_updated_at=base.last_updated_at,
        actions=base.actions,
        final_recommendation_snapshot=base.final_recommendation_snapshot,
    )
    in_review = manager.submit_for_review(base, actor_id="clinician-1")

    approved = manager.approve(in_review, actor_id="clinician-2", final_snapshot={"approved": True})
    rejected = manager.reject(in_review, actor_id="clinician-2", rationale="Not appropriate")
    changed = manager.request_changes(in_review, actor_id="clinician-2", rationale="Need more data")
    overridden = manager.override(approved, actor_id="medical-director", rationale="Override", final_snapshot={"override": True})

    assert approved.current_status == "approved"
    assert rejected.current_status == "rejected"
    assert changed.current_status == "changes_requested"
    assert overridden.current_status == "overridden"
    assert overridden.final_recommendation_snapshot == {"override": True}


def test_invalid_transitions_raise_review_workflow_error() -> None:
    """Invalid state changes should fail with clear workflow errors."""

    manager = ReviewWorkflowManager()
    state = manager.initialize(_draft(), actor_id="clinician-1")

    with pytest.raises(ReviewWorkflowError):
        manager.approve(state, actor_id="clinician-2")


def test_actions_append_in_order_without_mutating_history() -> None:
    """Transitioning should preserve existing actions and append new ones only."""

    manager = ReviewWorkflowManager()
    state = manager.initialize(_draft(), actor_id="clinician-1")
    initial_actions = list(state.actions)
    state = DraftReviewState(
        draft_id="draft-1",
        subject_id=state.subject_id,
        session_id=state.session_id,
        condition=state.condition,
        current_status=state.current_status,
        reviewer_id=state.reviewer_id,
        reviewer_role=state.reviewer_role,
        last_updated_at=state.last_updated_at,
        actions=state.actions,
        final_recommendation_snapshot=state.final_recommendation_snapshot,
    )

    submitted = manager.submit_for_review(state, actor_id="clinician-1")

    assert len(state.actions) == len(initial_actions)
    assert len(submitted.actions) == len(initial_actions) + 1
    assert submitted.actions[0].action_id == initial_actions[0].action_id


def test_storage_round_trip_for_review_state() -> None:
    """In-memory storage should save and reload review state payloads."""

    storage = InMemoryNeuroEngineStorage()
    engine = NeuroEngine(storage=storage)
    draft = _draft()
    engine._persist_recommendation_draft(draft)  # type: ignore[attr-defined]

    state = engine.initialize_draft_review(draft, actor_id="clinician-1")
    loaded = engine.load_review_state(state.draft_id)

    assert loaded is not None
    assert loaded.to_dict() == state.to_dict()


def test_neuroengine_helpers_persist_and_reload_state() -> None:
    """NeuroEngine review helpers should load, transition, and persist review state."""

    storage = InMemoryNeuroEngineStorage()
    engine = NeuroEngine(storage=storage)
    draft = _draft()
    engine._persist_recommendation_draft(draft)  # type: ignore[attr-defined]

    state = engine.initialize_draft_review(draft, actor_id="clinician-1")
    submitted = engine.submit_recommendation_draft_for_review(state.draft_id, actor_id="clinician-1")
    approved = engine.approve_recommendation_draft(
        state.draft_id,
        actor_id="clinician-2",
        rationale="Approved",
        final_snapshot={"approved": True},
    )
    loaded = engine.load_review_state(state.draft_id)

    assert submitted.current_status == "in_review"
    assert approved.current_status == "approved"
    assert loaded is not None
    assert loaded.current_status == "approved"


def test_review_workflow_api_endpoints_return_expected_shapes() -> None:
    """Review workflow API endpoints should return serialized review-state payloads."""

    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from deepsynaps.neuro_engine.api.routes import create_app

    draft = _draft()
    manager = ReviewWorkflowManager()
    state = manager.initialize(draft, actor_id="clinician-1")
    state = DraftReviewState(
        draft_id="draft-1",
        subject_id=state.subject_id,
        session_id=state.session_id,
        condition=state.condition,
        current_status=state.current_status,
        reviewer_id=state.reviewer_id,
        reviewer_role=state.reviewer_role,
        last_updated_at=state.last_updated_at,
        actions=state.actions,
        final_recommendation_snapshot=state.final_recommendation_snapshot,
    )

    class _Engine:
        def load_recommendation_draft(self, subject_id, session_id, condition):
            return draft

        def initialize_draft_review(self, draft_obj, actor_id, actor_role=None):
            return state

        def submit_recommendation_draft_for_review(self, draft_id, actor_id, actor_role=None, rationale=None):
            return ReviewWorkflowManager().submit_for_review(state, actor_id=actor_id, actor_role=actor_role, rationale=rationale)

        def load_review_state(self, draft_id):
            return state if draft_id == "draft-1" else None

    client = TestClient(create_app(_Engine()))

    init_response = client.post(
        "/neuro-engine/recommendation-draft/review/init",
        json={
            "subject_id": "DS123",
            "session_id": "V1",
            "condition": "depression",
            "actor_id": "clinician-1",
        },
    )
    submit_response = client.post(
        "/neuro-engine/recommendation-draft/review/submit",
        json={"draft_id": "draft-1", "actor_id": "clinician-1", "rationale": "Ready"},
    )
    get_response = client.get("/neuro-engine/recommendation-draft/review/draft-1")

    assert init_response.status_code == 200
    assert submit_response.status_code == 200
    assert get_response.status_code == 200
    assert init_response.json()["current_status"] == "draft"
    assert submit_response.json()["current_status"] == "in_review"
    assert get_response.json()["draft_id"] == "draft-1"
