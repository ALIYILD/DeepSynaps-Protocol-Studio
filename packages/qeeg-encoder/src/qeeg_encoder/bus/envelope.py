"""Universal event envelope mirroring docs/EVENT_BUS_SCHEMAS.md.

Every produced or consumed event carries this envelope. Payload-specific
fields live alongside (Avro records flatten envelope + payload per the
Schema Registry single-subject convention).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class EventEnvelope(BaseModel):
    """Studio universal event envelope v1."""

    event_id: str
    event_type: str
    schema_version: str = "v1"
    tenant_id: str
    patient_pseudonym_id: str
    occurred_at: datetime
    ingested_at: datetime
    consent_version: str
    trace_id: str
    source_module: str
    payload_uri: str | None = None
    payload_inline: dict[str, Any] | None = None
    signature: str | None = None
    hash_prev: str | None = None

    @field_validator("occurred_at", "ingested_at", mode="before")
    @classmethod
    def parse_ts(cls, v: Any) -> datetime:
        if isinstance(v, datetime):
            return v
        if isinstance(v, int):
            # epoch millis
            return datetime.fromtimestamp(v / 1000.0, tz=UTC)
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


class QEEGRecordingPayload(BaseModel):
    """Subset of the qeeg-recording payload this service needs to encode."""

    recording_id: str
    sfreq: float = Field(..., gt=0)
    channel_names: list[str]
    n_samples: int = Field(..., gt=0)
    eeg_uri: str | None = None  # S3 path to .fif/.edf
    eeg_inline_b64: str | None = None  # tiny test fixtures only

    @field_validator("channel_names")
    @classmethod
    def non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("channel_names cannot be empty")
        return v


class AIInferencePayload(BaseModel):
    """Payload for studio.ai-inference.v1 emitted by this encoder."""

    inference_id: str
    model_id: str
    model_version: str
    head: str
    input_event_ids: list[str]
    embedding_dims: dict[str, int]
    embedding_uri: str | None = None  # offline payload (S3 / blob)
    confidence: float | None = None
    conformal_lower: float | None = None
    conformal_upper: float | None = None
    conformal_alpha: float | None = None
    rag_citations: list[str] = Field(default_factory=list)
    advisory_only: bool = True
    provenance: dict[str, Any] = Field(default_factory=dict)

