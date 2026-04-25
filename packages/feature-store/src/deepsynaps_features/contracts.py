from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Mapping, MutableMapping, Optional

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FeatureEvent(BaseModel):
    """
    Minimal canonical event contract flowing through Layer 2.

    This is intentionally permissive so upstream producers (Kafka bus) can
    evolve while Layer 2 stays stable.
    """

    tenant_id: str
    patient_id: str
    occurred_at: datetime
    modality: str = Field(description="Event group/modality, e.g. qeeg, wearable.")
    payload: MutableMapping[str, Any] = Field(default_factory=dict)


FeatureSetName = Literal["full", "qeeg", "wearable", "assessment", "therapy", "mri", "video", "audio", "ehr", "outcome"]


class FeatureEnvelope(BaseModel):
    """
    Response envelope returned by `fetch_patient_features(...)`.
    """

    tenant_id: str
    patient_id: str
    feature_set: FeatureSetName = "full"
    generated_at: datetime = Field(default_factory=utc_now)
    occurred_at: Optional[datetime] = None
    source: Literal["redis"] = "redis"
    features: Mapping[str, Any] = Field(default_factory=dict)
    metadata: Mapping[str, Any] = Field(default_factory=dict)

