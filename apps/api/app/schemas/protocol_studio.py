"""Protocol Studio request/response payloads shared by router and services."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

FallbackMode = Literal["local_only", "keyword_fallback", "unavailable"]
ProtocolStatus = Literal[
    "evidence_based",
    "clinic_review_required",
    "off_label_requires_review",
    "research_only",
    "insufficient_evidence",
]
GenerateMode = Literal[
    "evidence_search",
    "qeeg_guided",
    "mri_guided",
    "deeptwin_personalized",
    "multimodal",
]


class EvidenceHealthResponse(BaseModel):
    local_evidence_available: bool
    local_count: int | None = None
    live_literature_available: bool
    vector_search_available: bool
    fallback_mode: FallbackMode
    last_checked: str
    safe_user_message: str


class EvidenceSearchResult(BaseModel):
    id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    doi: str | None = None
    pmid: str | None = None
    source: str | None = None
    evidence_type: str | None = None
    evidence_grade: str | None = None
    condition: str | None = None
    modality: str | None = None
    target: str | None = None
    summary: str | None = None
    limitations: list[str] = Field(default_factory=list)
    link: str | None = None
    retrieval_source: Literal["local", "live", "cached", "fixture"] = "local"
    retrieved_at: str


class EvidenceSearchResponse(BaseModel):
    results: list[EvidenceSearchResult] = Field(default_factory=list)
    status: Literal["ok", "fallback", "unavailable"]
    message: str


class ProtocolCatalogItem(BaseModel):
    id: str
    title: str
    condition: str | None = None
    modality: str | None = None
    target: str | None = None
    status: ProtocolStatus
    evidence_grade: str | None = None
    regulatory_status: str | None = None
    off_label: bool
    off_label_warning: str | None = None
    fillable_or_generate_mode: str = "registry_only"
    contraindication_summary: str | None = None
    clinician_review_required: bool = True
    not_autonomous_prescription: bool = True
    evidence_refs: list[str] = Field(default_factory=list)


class ProtocolCatalogResponse(BaseModel):
    items: list[ProtocolCatalogItem]
    total: int


class DataSourceAvailability(BaseModel):
    available: bool
    count: int | None = None
    last_updated: str | None = None


class PatientContextResponse(BaseModel):
    patient_id: str
    demographics: dict[str, Any] = Field(default_factory=dict)
    sources: dict[str, DataSourceAvailability] = Field(default_factory=dict)
    missing_data: list[str] = Field(default_factory=list)
    safety_flags: dict[str, bool] = Field(default_factory=dict)
    data_freshness: dict[str, str | None] = Field(default_factory=dict)
    completeness_score: float
    clinician_review_required: bool = True


class ProtocolStudioGenerateRequest(BaseModel):
    patient_id: str | None = None
    mode: GenerateMode
    condition: str
    modality: str
    target: str | None = None
    protocol_id: str | None = None
    include_off_label: bool = False
    constraints: dict[str, Any] = Field(default_factory=dict)


class ProtocolStudioGenerateResponse(BaseModel):
    draft_id: str | None
    status: Literal[
        "draft_requires_review",
        "insufficient_evidence",
        "needs_more_data",
        "blocked_requires_review",
        "research_only_not_prescribable",
    ]
    mode: GenerateMode
    protocol_summary: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    rationale: list[str] = Field(default_factory=list)
    evidence_links: list[dict[str, Any]] = Field(default_factory=list)
    evidence_grade: str | None = None
    regulatory_status: str | None = None
    off_label: bool
    off_label_warning: str | None = None
    contraindications: list[str] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)
    uncertainty: str
    patient_context_used: dict[str, Any] = Field(default_factory=dict)
    safety_status: str
    clinician_review_required: bool = True
    not_autonomous_prescription: bool = True
