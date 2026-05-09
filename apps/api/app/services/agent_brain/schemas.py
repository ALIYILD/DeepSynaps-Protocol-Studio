"""Schemas for the Clinical Agent Brain.

Local Pydantic models — kept inside the agent_brain module so this PR does not
have to touch `deepsynaps_core_schema`. If the contract stabilises, types can
later be promoted to the shared schema package.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ProviderStatus = Literal[
    "ok",
    "unavailable",
    "not_configured",
    "denied",
    "error",
]

ProviderConfidence = Literal["low", "medium", "high", "unknown"]

# Roles that a provider can declare in its manifest. Mirrors UserRole in
# deepsynaps_core_schema but kept as a literal here so the agent_brain module
# stays decoupled. The router resolves the actor's real UserRole and asserts
# inclusion before dispatch.
ProviderRole = Literal[
    "guest",
    "patient",
    "technician",
    "reviewer",
    "clinician",
    "admin",
    "supervisor",
]


class ProviderManifest(BaseModel):
    """Public, introspectable description of a provider.

    Surfaced via `GET /api/v1/agent-brain/providers` so frontend pages and other
    agents can decide whether to call a provider, and what safety expectations
    the response will carry.
    """

    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    allowed_roles: list[ProviderRole]
    contains_phi: bool
    can_read: bool
    can_write: bool
    requires_audit: bool
    requires_citations: bool
    patient_facing_allowed_default: bool
    configured: bool = True
    safety_policy: str = ""
    citation_policy: str = ""


class ProviderQuery(BaseModel):
    """Input to a provider call.

    `provider` is matched against `ProviderManifest.name` by the registry.
    """

    model_config = ConfigDict(extra="forbid")

    provider: str
    query: str = ""
    condition: str | None = None
    patient_id: str | None = None
    role: str | None = None  # informational; router ALSO enforces real role from JWT
    include_citations: bool = True
    context: dict[str, Any] = Field(default_factory=dict)


class Citation(BaseModel):
    """A single citation. Every field is optional except `source` so providers
    can attach whatever provenance they have without inventing missing IDs."""

    model_config = ConfigDict(extra="forbid")

    source: str  # e.g. "evidence_db", "clinical_data_csv", "qeeg_report_template"
    title: str | None = None
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    pmid: str | None = None
    doi: str | None = None
    openalex_id: str | None = None
    url: str | None = None
    evidence_grade: str | None = None
    journal: str | None = None
    notes: str | None = None


class ProviderResponse(BaseModel):
    """Uniform response envelope returned by every provider.

    The envelope intentionally embeds safety posture (`safety_flags`,
    `requires_clinician_review`, `patient_facing_allowed`, `confidence`,
    `missing_requirements`) so consumers cannot accidentally drop it.
    """

    model_config = ConfigDict(extra="forbid")

    provider: str
    status: ProviderStatus
    query: str = ""
    answer: str = ""
    items: list[dict[str, Any]] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    safety_flags: list[str] = Field(default_factory=list)
    requires_clinician_review: bool = True
    patient_facing_allowed: bool = False
    confidence: ProviderConfidence = "unknown"
    missing_requirements: list[str] = Field(default_factory=list)
    audit_event_id: str | None = None
