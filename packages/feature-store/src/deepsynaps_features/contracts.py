from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Mapping, MutableMapping, Optional, TypedDict

from pydantic import BaseModel, Field

class FeatureRowEnvelope(TypedDict, total=False):
    """
    Minimal metadata envelope required by FEATURE_STORE.md.

    The online store is allowed to store a compact JSON value that includes:
    - scalar features and small structured fields
    - artifact pointers (URIs), hashes, and provenance
    """

    tenant_id: str
    patient_id: str
    event_id: str
    occurred_at: str  # ISO8601
    recorded_at: str  # ISO8601
    trace_id: str
    consent_version: str
    de_identified: bool
    schema_version: str
    feature_view: str
    feature_key: str
    time_bucket: str
    values: dict[str, Any]

def isoformat(dt: datetime) -> str:
    # Keep this tiny and deterministic; always UTC with "Z" if tz-aware.
    s = dt.isoformat()
    return s.replace("+00:00", "Z")


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


FeatureSetName = Literal[
    "full",
    "core",
    "qeeg",
    "imaging",
    "virtual_care",
    "ehr",
    "outcomes",
    "wearable",
    "assessment",
    "therapy",
    "mri",
    "video",
    "audio",
    "outcome",
    # App-specific named sets used by Layers 3–4. These must resolve to group lists in serve.py.
    "qeeg_recommend_protocol_v1",
]


class FeatureEnvelope(BaseModel):
    """
    Response envelope returned by `fetch_patient_features(...)`.
    """

    tenant_id: str
    patient_id: str
    feature_set: FeatureSetName = "full"
    feature_set_version: str = Field(default="2026-04-25")
    generated_at: datetime = Field(default_factory=utc_now)
    occurred_at: Optional[datetime] = None
    source: Literal["redis"] = "redis"
    features: Mapping[str, Any] = Field(default_factory=dict)
    metadata: Mapping[str, Any] = Field(default_factory=dict)

