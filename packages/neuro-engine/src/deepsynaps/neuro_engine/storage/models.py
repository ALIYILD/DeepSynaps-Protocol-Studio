"""Storage models for persisted DeepSynaps neuro engine artifacts.

These dataclasses define storage-backend-agnostic representations for the core
neuro engine artifacts that may be persisted for auditability, reuse, and
faster retrieval. They intentionally store JSON-friendly payloads and metadata
only; a real database layer can map these models into Postgres, a document
store, or another persistence backend elsewhere in the application.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any


class StorageError(RuntimeError):
    """Raised when a neuro engine storage operation cannot complete safely."""


@dataclass(slots=True)
class StoredSessionFeatures:
    """Persisted session feature artifact with versioned JSON payload."""

    id: str
    subject_id: str
    session_id: str | None
    session_features_version: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the stored artifact into JSON-friendly primitives."""

        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        payload["updated_at"] = None if self.updated_at is None else self.updated_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StoredSessionFeatures":
        """Reconstruct the stored artifact from serialized primitives."""

        return cls(
            id=data["id"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            session_features_version=data["session_features_version"],
            payload=dict(data.get("payload", {})),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=None if data.get("updated_at") is None else datetime.fromisoformat(data["updated_at"]),
        )


@dataclass(slots=True)
class StoredProtocolFeatureView:
    """Persisted protocol feature view with versioned JSON payload."""

    id: str
    subject_id: str
    session_id: str | None
    condition: str
    protocol_feature_view_version: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the stored artifact into JSON-friendly primitives."""

        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        payload["updated_at"] = None if self.updated_at is None else self.updated_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StoredProtocolFeatureView":
        """Reconstruct the stored artifact from serialized primitives."""

        return cls(
            id=data["id"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            condition=data["condition"],
            protocol_feature_view_version=data["protocol_feature_view_version"],
            payload=dict(data.get("payload", {})),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=None if data.get("updated_at") is None else datetime.fromisoformat(data["updated_at"]),
        )


@dataclass(slots=True)
class StoredProtocolEvidenceBundle:
    """Persisted protocol evidence bundle with versioned JSON payload."""

    id: str
    subject_id: str
    session_id: str | None
    condition: str
    protocol_evidence_version: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the stored artifact into JSON-friendly primitives."""

        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        payload["updated_at"] = None if self.updated_at is None else self.updated_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StoredProtocolEvidenceBundle":
        """Reconstruct the stored artifact from serialized primitives."""

        return cls(
            id=data["id"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            condition=data["condition"],
            protocol_evidence_version=data["protocol_evidence_version"],
            payload=dict(data.get("payload", {})),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=None if data.get("updated_at") is None else datetime.fromisoformat(data["updated_at"]),
        )


@dataclass(slots=True)
class StoredRecommendationDraft:
    """Persisted recommendation draft with versioned JSON payload."""

    id: str
    subject_id: str
    session_id: str | None
    condition: str
    recommendation_draft_version: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the stored artifact into JSON-friendly primitives."""

        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        payload["updated_at"] = None if self.updated_at is None else self.updated_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StoredRecommendationDraft":
        """Reconstruct the stored artifact from serialized primitives."""

        return cls(
            id=data["id"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            condition=data["condition"],
            recommendation_draft_version=data["recommendation_draft_version"],
            payload=dict(data.get("payload", {})),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=None if data.get("updated_at") is None else datetime.fromisoformat(data["updated_at"]),
        )


@dataclass(slots=True)
class StoredDraftReviewState:
    """Persisted draft review workflow state with versioned JSON payload."""

    id: str
    draft_id: str
    subject_id: str
    session_id: str | None
    condition: str
    review_workflow_version: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the stored artifact into JSON-friendly primitives."""

        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        payload["updated_at"] = None if self.updated_at is None else self.updated_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StoredDraftReviewState":
        """Reconstruct the stored artifact from serialized primitives."""

        return cls(
            id=data["id"],
            draft_id=data["draft_id"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            condition=data["condition"],
            review_workflow_version=data["review_workflow_version"],
            payload=dict(data.get("payload", {})),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=None if data.get("updated_at") is None else datetime.fromisoformat(data["updated_at"]),
        )


@dataclass(slots=True)
class StoredEscalationEvent:
    """Persisted escalation event with versioned JSON payload."""

    id: str
    draft_id: str
    subject_id: str
    session_id: str | None
    condition: str
    escalation_version: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the stored artifact into JSON-friendly primitives."""

        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        payload["updated_at"] = None if self.updated_at is None else self.updated_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StoredEscalationEvent":
        """Reconstruct the stored artifact from serialized primitives."""

        return cls(
            id=data["id"],
            draft_id=data["draft_id"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            condition=data["condition"],
            escalation_version=data["escalation_version"],
            payload=dict(data.get("payload", {})),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=None if data.get("updated_at") is None else datetime.fromisoformat(data["updated_at"]),
        )


__all__ = [
    "StoredEscalationEvent",
    "StoredDraftReviewState",
    "StoredRecommendationDraft",
    "StorageError",
    "StoredProtocolEvidenceBundle",
    "StoredProtocolFeatureView",
    "StoredSessionFeatures",
]
