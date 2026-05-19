"""Category 8 — Diagnosis Coding HTTP router.

Routes:
- GET  /api/v1/diagnosis/sources           — source/lifecycle status table
- POST /api/v1/diagnosis/normalize         — free-text/code → coding matches
- POST /api/v1/diagnosis/query-expansion   — condition → safe search terms
- POST /api/v1/diagnosis/eligibility-context — coded dx + modality → context only

The router is decision-support only. Responses always carry a disclaimer; the
service layer enforces "no diagnosis assertion / no coverage guarantee"
semantics.
"""
from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.services.diagnosis_coding import (
    diagnosis_source_status,
    eligibility_context,
    normalize_diagnosis,
    query_expansion,
)

try:
    from app.auth import AuthenticatedActor, get_authenticated_actor
except ImportError:  # pragma: no cover — fallback for envs that stub auth
    class AuthenticatedActor(BaseModel):
        user_id: str = "anonymous"
        role: str = "viewer"

    def get_authenticated_actor() -> "AuthenticatedActor":
        return AuthenticatedActor()


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/diagnosis", tags=["diagnosis-coding"])


# ── Dependency: registry getter ──────────────────────────────────────────────
# Routes use a callable (not an instance) so the service layer can be unit-
# tested with an in-memory registry without monkey-patching imports.

async def _default_registry_getter() -> Any:
    from app.services.knowledge.adapter_bootstrap import get_production_registry

    return await get_production_registry()


def get_registry_getter() -> Callable[[], Awaitable[Any]]:
    return _default_registry_getter


# ── Request / Response schemas ───────────────────────────────────────────────


class NormalizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    term: str = Field(..., description="Free-text condition or diagnosis code.")
    coding_system: Optional[str] = Field(
        default=None,
        description="Optional coding-system hint: icd10, snomedct, mesh, umls, or ols.",
    )
    patient_id: Optional[str] = Field(
        default=None,
        description=(
            "Optional patient identifier for audit correlation. The endpoint "
            "never reads or modifies the patient record."
        ),
    )
    limit: int = Field(default=10, ge=1, le=50)


class QueryExpansionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    condition: str = Field(..., description="Condition name or coded term.")
    target_workflow: Optional[str] = Field(
        default=None,
        description="Hint: evidence | protocol | brainmap | biomarkers.",
    )
    coding_context: Optional[Dict[str, Any]] = Field(default=None)
    limit: int = Field(default=10, ge=1, le=50)


class EligibilityContextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    diagnosis_code: str = Field(..., description="Coded diagnosis (e.g., 'F33.2').")
    modality: Optional[str] = Field(
        default=None, description="e.g., rTMS, tDCS, neurofeedback."
    )
    jurisdiction: Optional[str] = Field(
        default=None, description="ISO-3166 country/region (e.g., 'UK', 'US')."
    )
    payer: Optional[str] = Field(
        default=None, description="Optional payer hint; coverage is not determined here."
    )
    limit: int = Field(default=5, ge=1, le=20)


class CodingMatchModel(BaseModel):
    model_config = ConfigDict(extra="allow")
    source: str
    code: str
    display: str
    coding_system: str
    version: str
    synonyms: List[str] = Field(default_factory=list)
    uri: str = ""
    ontology: str = ""
    confidence: str = "unknown"
    provenance: Dict[str, Any] = Field(default_factory=dict)


class NormalizeResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    input_term: str
    input_coding_system: Optional[str] = None
    patient_id: Optional[str] = None
    detected_coding_system: Optional[str] = None
    matches_by_source: Dict[str, List[CodingMatchModel]] = Field(default_factory=dict)
    matches: List[CodingMatchModel] = Field(default_factory=list)
    source_status: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    decision_support_disclaimer: str
    generated_at: str


class QueryExpansionResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    condition: str
    target_workflow: Optional[str] = None
    coding_context: Dict[str, Any] = Field(default_factory=dict)
    normalized_terms: List[str] = Field(default_factory=list)
    synonyms: List[str] = Field(default_factory=list)
    mappings: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)
    evidence_search_terms: List[str] = Field(default_factory=list)
    source_status: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    decision_support_disclaimer: str
    generated_at: str


class EligibilityContextResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    diagnosis_code: str
    modality: Optional[str] = None
    jurisdiction: Optional[str] = None
    payer: Optional[str] = None
    coding_match: Optional[Dict[str, Any]] = None
    possible_indication_context: List[Dict[str, Any]] = Field(default_factory=list)
    required_evidence_references: List[Dict[str, Any]] = Field(default_factory=list)
    missing_sources: List[str] = Field(default_factory=list)
    status: str
    coverage_determined: bool = False
    warnings: List[str] = Field(default_factory=list)
    decision_support_disclaimer: str
    generated_at: str


class SourceStatusEntry(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str
    registered: bool
    status: str
    available: bool
    license_required: bool
    reason: Optional[str] = None
    source_name: Optional[str] = None
    version: Optional[str] = None


class SourcesResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    category: str
    expected_total: int
    sources: List[SourceStatusEntry]
    decision_support_disclaimer: str
    generated_at: str


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/sources", response_model=SourcesResponse)
async def list_sources(
    registry_getter: Callable[[], Awaitable[Any]] = Depends(get_registry_getter),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SourcesResponse:
    """List Category 8 sources with lifecycle status."""
    data = await diagnosis_source_status(registry_getter)
    return SourcesResponse(**data)


@router.post("/normalize", response_model=NormalizeResponse)
async def normalize(
    payload: NormalizeRequest,
    registry_getter: Callable[[], Awaitable[Any]] = Depends(get_registry_getter),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NormalizeResponse:
    """Return possible coding matches for a free-text or coded term.

    Decision support only — the response never asserts that the matched code
    is the patient's actual diagnosis.
    """
    data = await normalize_diagnosis(
        registry_getter=registry_getter,
        term=payload.term,
        coding_system=payload.coding_system,
        patient_id=payload.patient_id,
        limit=payload.limit,
    )
    return NormalizeResponse(**data)


@router.post("/query-expansion", response_model=QueryExpansionResponse)
async def expand_query(
    payload: QueryExpansionRequest,
    registry_getter: Callable[[], Awaitable[Any]] = Depends(get_registry_getter),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> QueryExpansionResponse:
    """Expand a condition into terminology-backed search terms and synonyms."""
    data = await query_expansion(
        registry_getter=registry_getter,
        condition=payload.condition,
        target_workflow=payload.target_workflow,
        coding_context=payload.coding_context,
        limit=payload.limit,
    )
    return QueryExpansionResponse(**data)


@router.post("/eligibility-context", response_model=EligibilityContextResponse)
async def eligibility_ctx(
    payload: EligibilityContextRequest,
    registry_getter: Callable[[], Awaitable[Any]] = Depends(get_registry_getter),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EligibilityContextResponse:
    """Return cautious eligibility *context* — never a coverage decision."""
    data = await eligibility_context(
        registry_getter=registry_getter,
        diagnosis_code=payload.diagnosis_code,
        modality=payload.modality,
        jurisdiction=payload.jurisdiction,
        payer=payload.payer,
        limit=payload.limit,
    )
    return EligibilityContextResponse(**data)
