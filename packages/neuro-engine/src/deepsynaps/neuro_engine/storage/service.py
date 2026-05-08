"""Storage interfaces and reference implementations for neuro engine artifacts.

This module defines a small storage abstraction for persisted neuro engine
artifacts and provides lightweight in-memory and JSON-file implementations that
can be used in tests, local debugging, or as adapters behind a real database
integration elsewhere in the application. The interface is intentionally
limited to the three primary artifact types to keep persistence concerns small,
predictable, and backend-agnostic.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Protocol

from .models import (
    StoredEscalationEvent,
    StoredDraftReviewState,
    StorageError,
    StoredProtocolEvidenceBundle,
    StoredProtocolFeatureView,
    StoredRecommendationDraft,
    StoredSessionFeatures,
)


class NeuroEngineStorage(Protocol):
    """Protocol for saving and loading core neuro engine artifacts."""

    def save_session_features(self, session: StoredSessionFeatures) -> None: ...
    def get_session_features(self, subject_id: str, session_id: str | None) -> StoredSessionFeatures | None: ...
    def save_protocol_feature_view(self, view: StoredProtocolFeatureView) -> None: ...
    def get_protocol_feature_view(self, subject_id: str, session_id: str | None, condition: str) -> StoredProtocolFeatureView | None: ...
    def save_protocol_evidence(self, evidence: StoredProtocolEvidenceBundle) -> None: ...
    def get_protocol_evidence(self, subject_id: str, session_id: str | None, condition: str) -> StoredProtocolEvidenceBundle | None: ...
    def save_recommendation_draft(self, draft: StoredRecommendationDraft) -> None: ...
    def get_recommendation_draft(self, subject_id: str, session_id: str | None, condition: str) -> StoredRecommendationDraft | None: ...
    def save_review_state(self, state: StoredDraftReviewState) -> None: ...
    def get_review_state(self, draft_id: str) -> StoredDraftReviewState | None: ...
    def list_review_states(self) -> list[StoredDraftReviewState]: ...
    def save_escalation_event(self, event: StoredEscalationEvent) -> None: ...
    def list_escalation_events(self, draft_id: str | None = None) -> list[StoredEscalationEvent]: ...


class InMemoryNeuroEngineStorage:
    """Simple in-memory storage backend with upsert semantics."""

    def __init__(self) -> None:
        self._session_features: dict[tuple[str, str | None], StoredSessionFeatures] = {}
        self._protocol_feature_views: dict[tuple[str, str | None, str], StoredProtocolFeatureView] = {}
        self._protocol_evidence: dict[tuple[str, str | None, str], StoredProtocolEvidenceBundle] = {}
        self._recommendation_drafts: dict[tuple[str, str | None, str], StoredRecommendationDraft] = {}
        self._review_states: dict[str, StoredDraftReviewState] = {}
        self._escalation_events: list[StoredEscalationEvent] = []

    def save_session_features(self, session: StoredSessionFeatures) -> None:
        """Save or update one stored session feature artifact."""

        key = (session.subject_id, session.session_id)
        self._session_features[key] = _with_upsert_timestamp(self._session_features.get(key), session)

    def get_session_features(self, subject_id: str, session_id: str | None) -> StoredSessionFeatures | None:
        """Load one stored session feature artifact by subject/session."""

        return self._session_features.get((subject_id, session_id))

    def save_protocol_feature_view(self, view: StoredProtocolFeatureView) -> None:
        """Save or update one stored protocol feature view."""

        key = (view.subject_id, view.session_id, view.condition)
        self._protocol_feature_views[key] = _with_upsert_timestamp(self._protocol_feature_views.get(key), view)

    def get_protocol_feature_view(self, subject_id: str, session_id: str | None, condition: str) -> StoredProtocolFeatureView | None:
        """Load one stored protocol feature view."""

        return self._protocol_feature_views.get((subject_id, session_id, condition))

    def save_protocol_evidence(self, evidence: StoredProtocolEvidenceBundle) -> None:
        """Save or update one stored protocol evidence bundle."""

        key = (evidence.subject_id, evidence.session_id, evidence.condition)
        self._protocol_evidence[key] = _with_upsert_timestamp(self._protocol_evidence.get(key), evidence)

    def get_protocol_evidence(self, subject_id: str, session_id: str | None, condition: str) -> StoredProtocolEvidenceBundle | None:
        """Load one stored protocol evidence bundle."""

        return self._protocol_evidence.get((subject_id, session_id, condition))

    def save_recommendation_draft(self, draft: StoredRecommendationDraft) -> None:
        """Save or update one stored recommendation draft."""

        key = (draft.subject_id, draft.session_id, draft.condition)
        self._recommendation_drafts[key] = _with_upsert_timestamp(self._recommendation_drafts.get(key), draft)

    def get_recommendation_draft(self, subject_id: str, session_id: str | None, condition: str) -> StoredRecommendationDraft | None:
        """Load one stored recommendation draft."""

        return self._recommendation_drafts.get((subject_id, session_id, condition))

    def save_review_state(self, state: StoredDraftReviewState) -> None:
        """Save or update one stored review state."""

        self._review_states[state.draft_id] = _with_upsert_timestamp(self._review_states.get(state.draft_id), state)

    def get_review_state(self, draft_id: str) -> StoredDraftReviewState | None:
        """Load one stored review state by draft id."""

        return self._review_states.get(draft_id)

    def list_review_states(self) -> list[StoredDraftReviewState]:
        """List all stored review states."""

        return list(self._review_states.values())

    def save_escalation_event(self, event: StoredEscalationEvent) -> None:
        """Persist one escalation event."""

        self._escalation_events.append(event)

    def list_escalation_events(self, draft_id: str | None = None) -> list[StoredEscalationEvent]:
        """List persisted escalation events, optionally filtered by draft id."""

        if draft_id is None:
            return list(self._escalation_events)
        return [event for event in self._escalation_events if event.draft_id == draft_id]


class JsonFileNeuroEngineStorage:
    """File-backed JSON storage for local debugging and lightweight persistence."""

    def __init__(self, root_dir: Path) -> None:
        self.root_dir = Path(root_dir)
        self.root_dir.mkdir(parents=True, exist_ok=True)
        for subdir in ("session_features", "protocol_features", "protocol_evidence", "recommendation_drafts", "review_states", "escalation_events"):
            (self.root_dir / subdir).mkdir(parents=True, exist_ok=True)

    def save_session_features(self, session: StoredSessionFeatures) -> None:
        """Save one session feature artifact to a deterministic JSON file."""

        path = self.root_dir / "session_features" / _session_filename(session.subject_id, session.session_id, session.session_features_version)
        _write_json(path, session.to_dict())

    def get_session_features(self, subject_id: str, session_id: str | None) -> StoredSessionFeatures | None:
        """Load a stored session feature artifact if present."""

        matches = sorted((self.root_dir / "session_features").glob(_session_glob(subject_id, session_id)))
        if not matches:
            return None
        return StoredSessionFeatures.from_dict(_read_json(matches[-1]))

    def save_protocol_feature_view(self, view: StoredProtocolFeatureView) -> None:
        """Save one protocol feature view artifact to a deterministic JSON file."""

        path = self.root_dir / "protocol_features" / _protocol_filename(
            subject_id=view.subject_id,
            session_id=view.session_id,
            condition=view.condition,
            version=view.protocol_feature_view_version,
        )
        _write_json(path, view.to_dict())

    def get_protocol_feature_view(self, subject_id: str, session_id: str | None, condition: str) -> StoredProtocolFeatureView | None:
        """Load a stored protocol feature view if present."""

        matches = sorted((self.root_dir / "protocol_features").glob(_protocol_glob(subject_id, session_id, condition)))
        if not matches:
            return None
        return StoredProtocolFeatureView.from_dict(_read_json(matches[-1]))

    def save_protocol_evidence(self, evidence: StoredProtocolEvidenceBundle) -> None:
        """Save one protocol evidence artifact to a deterministic JSON file."""

        path = self.root_dir / "protocol_evidence" / _protocol_filename(
            subject_id=evidence.subject_id,
            session_id=evidence.session_id,
            condition=evidence.condition,
            version=evidence.protocol_evidence_version,
        )
        _write_json(path, evidence.to_dict())

    def get_protocol_evidence(self, subject_id: str, session_id: str | None, condition: str) -> StoredProtocolEvidenceBundle | None:
        """Load a stored protocol evidence artifact if present."""

        matches = sorted((self.root_dir / "protocol_evidence").glob(_protocol_glob(subject_id, session_id, condition)))
        if not matches:
            return None
        return StoredProtocolEvidenceBundle.from_dict(_read_json(matches[-1]))

    def save_recommendation_draft(self, draft: StoredRecommendationDraft) -> None:
        """Save one recommendation draft artifact to a deterministic JSON file."""

        path = self.root_dir / "recommendation_drafts" / _protocol_filename(
            subject_id=draft.subject_id,
            session_id=draft.session_id,
            condition=draft.condition,
            version=draft.recommendation_draft_version,
        )
        _write_json(path, draft.to_dict())

    def get_recommendation_draft(self, subject_id: str, session_id: str | None, condition: str) -> StoredRecommendationDraft | None:
        """Load a stored recommendation draft artifact if present."""

        matches = sorted((self.root_dir / "recommendation_drafts").glob(_protocol_glob(subject_id, session_id, condition)))
        if not matches:
            return None
        return StoredRecommendationDraft.from_dict(_read_json(matches[-1]))

    def save_review_state(self, state: StoredDraftReviewState) -> None:
        """Save one review workflow state artifact to a deterministic JSON file."""

        path = self.root_dir / "review_states" / f"draft-{state.draft_id}.json"
        _write_json(path, state.to_dict())

    def get_review_state(self, draft_id: str) -> StoredDraftReviewState | None:
        """Load a stored review workflow state artifact if present."""

        path = self.root_dir / "review_states" / f"draft-{draft_id}.json"
        if not path.exists():
            return None
        return StoredDraftReviewState.from_dict(_read_json(path))

    def list_review_states(self) -> list[StoredDraftReviewState]:
        """List all stored review workflow state artifacts."""

        return [
            StoredDraftReviewState.from_dict(_read_json(path))
            for path in sorted((self.root_dir / "review_states").glob("draft-*.json"))
        ]

    def save_escalation_event(self, event: StoredEscalationEvent) -> None:
        """Persist one escalation event artifact to a deterministic JSON file."""

        path = self.root_dir / "escalation_events" / f"escalation-{event.id}.json"
        _write_json(path, event.to_dict())

    def list_escalation_events(self, draft_id: str | None = None) -> list[StoredEscalationEvent]:
        """List escalation events, optionally filtered by draft id."""

        events = [
            StoredEscalationEvent.from_dict(_read_json(path))
            for path in sorted((self.root_dir / "escalation_events").glob("escalation-*.json"))
        ]
        if draft_id is None:
            return events
        return [event for event in events if event.draft_id == draft_id]


def _with_upsert_timestamp(existing: object | None, new_value: object) -> object:
    """Apply simple updated-at semantics for in-memory upserts."""

    if existing is None:
        return new_value
    current_time = datetime.now(timezone.utc)
    if isinstance(new_value, StoredSessionFeatures):
        return StoredSessionFeatures(
            id=new_value.id,
            subject_id=new_value.subject_id,
            session_id=new_value.session_id,
            session_features_version=new_value.session_features_version,
            payload=new_value.payload,
            created_at=new_value.created_at,
            updated_at=current_time,
        )
    if isinstance(new_value, StoredProtocolFeatureView):
        return StoredProtocolFeatureView(
            id=new_value.id,
            subject_id=new_value.subject_id,
            session_id=new_value.session_id,
            condition=new_value.condition,
            protocol_feature_view_version=new_value.protocol_feature_view_version,
            payload=new_value.payload,
            created_at=new_value.created_at,
            updated_at=current_time,
        )
    if isinstance(new_value, StoredProtocolEvidenceBundle):
        return StoredProtocolEvidenceBundle(
            id=new_value.id,
            subject_id=new_value.subject_id,
            session_id=new_value.session_id,
            condition=new_value.condition,
            protocol_evidence_version=new_value.protocol_evidence_version,
            payload=new_value.payload,
            created_at=new_value.created_at,
            updated_at=current_time,
        )
    if isinstance(new_value, StoredRecommendationDraft):
        return StoredRecommendationDraft(
            id=new_value.id,
            subject_id=new_value.subject_id,
            session_id=new_value.session_id,
            condition=new_value.condition,
            recommendation_draft_version=new_value.recommendation_draft_version,
            payload=new_value.payload,
            created_at=new_value.created_at,
            updated_at=current_time,
        )
    if isinstance(new_value, StoredDraftReviewState):
        return StoredDraftReviewState(
            id=new_value.id,
            draft_id=new_value.draft_id,
            subject_id=new_value.subject_id,
            session_id=new_value.session_id,
            condition=new_value.condition,
            review_workflow_version=new_value.review_workflow_version,
            payload=new_value.payload,
            created_at=new_value.created_at,
            updated_at=current_time,
        )
    raise StorageError(f"Unsupported stored artifact type: {type(new_value)!r}")


def _session_filename(subject_id: str, session_id: str | None, version: str) -> str:
    session_part = "nosession" if session_id is None else f"ses-{session_id}"
    return f"sub-{subject_id}_{session_part}_v{version}.json"


def _protocol_filename(subject_id: str, session_id: str | None, condition: str, version: str) -> str:
    session_part = "nosession" if session_id is None else f"ses-{session_id}"
    safe_condition = condition.replace(" ", "_").replace("/", "_")
    return f"sub-{subject_id}_{session_part}_cond-{safe_condition}_v{version}.json"


def _session_glob(subject_id: str, session_id: str | None) -> str:
    session_part = "nosession" if session_id is None else f"ses-{session_id}"
    return f"sub-{subject_id}_{session_part}_v*.json"


def _protocol_glob(subject_id: str, session_id: str | None, condition: str) -> str:
    session_part = "nosession" if session_id is None else f"ses-{session_id}"
    safe_condition = condition.replace(" ", "_").replace("/", "_")
    return f"sub-{subject_id}_{session_part}_cond-{safe_condition}_v*.json"


def _write_json(path: Path, payload: dict) -> None:
    """Persist a JSON payload to disk."""

    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def _read_json(path: Path) -> dict:
    """Load a JSON payload from disk."""

    return json.loads(path.read_text(encoding="utf-8"))


__all__ = [
    "InMemoryNeuroEngineStorage",
    "JsonFileNeuroEngineStorage",
    "NeuroEngineStorage",
]
