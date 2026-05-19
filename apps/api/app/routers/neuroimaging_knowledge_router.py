"""Neuroimaging Knowledge Router — Category 4 inventory + federated search.

Endpoints
---------

- ``GET  /api/v1/neuroimaging/adapters``           — list the 18-source catalog
- ``GET  /api/v1/neuroimaging/adapters/{key}``     — single source detail
- ``GET  /api/v1/neuroimaging/_lifecycle``         — lifecycle summary
- ``POST /api/v1/neuroimaging/search``             — federated search across
                                                     enabled adapters

Design
------

This router exposes *catalog metadata* and a *defensive federated search*
across the neuroimaging knowledge sources tracked by DeepSynaps. It does
NOT own adapter implementations — those live in
``app/services/knowledge/adapters/`` (canonical) and
``app/knowledge/`` (legacy shims).

Federation behaviour
~~~~~~~~~~~~~~~~~~~~

``POST /search`` walks every source returned by
``list_enabled_sources()`` (i.e. ``enabled=True`` AND non-null
``import_path``), tries to import + invoke each adapter's search method,
and aggregates results. Failures are logged and surfaced as per-source
``warnings`` — the endpoint NEVER raises a 5xx for upstream failures.
Always returns HTTP 200 with a structured response.

Safety
~~~~~~

Every response includes ``decision_support_disclaimer``. Inventory copy
is validated by ``test_neuroimaging_adapters.py`` to avoid prescriptive
language.
"""
from __future__ import annotations

import importlib
import inspect
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.services.knowledge.neuroimaging_federation import (
    NeuroimagingSearchQuery as _FedQuery,
    federate as _federate,
)
from app.services.knowledge.neuroimaging_inventory import (
    DECISION_SUPPORT_DISCLAIMER,
    NEUROIMAGING_SOURCES,
    get_neuroimaging_source,
    list_enabled_sources,
    list_lifecycle_summary,
    list_neuroimaging_sources,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/neuroimaging", tags=["neuroimaging"])


# ─── Pydantic models ──────────────────────────────────────────────────────


# core-schema-exempt: PR-1 router-local catalog DTO; promote to packages/core-schema in PR-2 when frontend wires in.
class NeuroimagingSourceOut(BaseModel):
    """Canonical catalog entry for a neuroimaging source."""

    id: str = Field(..., description="Stable source key")
    name: str = Field(..., description="Human-readable name")
    category: str = Field(..., description="Always 'neuroimaging' for this router")
    access_type: str = Field(..., description="High-level access mechanism")
    source_url: str = Field(..., description="Canonical home page / API endpoint")
    requires_credentials: bool = Field(
        ..., description="Whether end-user credentials / DUA / application are required"
    )
    lifecycle_state: str = Field(
        ..., description="LifecycleState enum value (stable HTTP contract)"
    )
    enabled: bool = Field(
        ..., description="Whether the source is wired into federated search"
    )
    clinical_utility: str = Field(
        ..., description="Approved-phrase clinical utility note (non-prescriptive)"
    )
    provenance: str = Field(..., description="Short provenance / cohort description")
    access_notes: str = Field(..., description="Operator-facing access notes")
    modality_tags: list[str] = Field(default_factory=list)
    population_tags: list[str] = Field(default_factory=list)
    atlas_compatibility: list[str] = Field(default_factory=list)
    import_path: Optional[str] = Field(
        None, description="Python import path to the adapter, if one exists"
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


# core-schema-exempt: PR-1 router-local catalog DTO; promote to packages/core-schema in PR-2.
class NeuroimagingSourceListResponse(BaseModel):
    """Listing response for the catalog endpoint."""

    sources: list[NeuroimagingSourceOut]
    total: int = Field(..., description="Count of sources returned")
    decision_support_disclaimer: str = Field(
        ..., description="Stable safety disclaimer for downstream surfaces"
    )


# core-schema-exempt: PR-1 router-local catalog DTO; promote to packages/core-schema in PR-2.
class NeuroimagingSourceDetailResponse(BaseModel):
    """Detail response for a single source."""

    source: NeuroimagingSourceOut
    decision_support_disclaimer: str


# core-schema-exempt: PR-1 router-local lifecycle DTO; promote to packages/core-schema in PR-2.
class NeuroimagingLifecycleResponse(BaseModel):
    """Lifecycle summary response."""

    total: int
    by_state: dict[str, int]
    sources: dict[str, str]
    decision_support_disclaimer: str


# core-schema-exempt: PR-1 router-local search request; promote to packages/core-schema in PR-2.
class NeuroimagingSearchRequest(BaseModel):
    """Federated-search request body. Every field is optional."""

    condition: Optional[str] = Field(
        None, description="Cognitive paradigm / condition / contrast"
    )
    modality: Optional[str] = Field(
        None, description="Imaging modality filter (e.g. 'fMRI-BOLD')"
    )
    region: Optional[str] = Field(
        None, description="Region name (e.g. 'DLPFC-L', 'amygdala')"
    )
    coordinate: Optional[list[float]] = Field(
        None,
        description="[x, y, z] MNI coordinate for coordinate-based queries",
    )
    atlas: Optional[str] = Field(None, description="Atlas filter (e.g. 'MNI152')")
    population: Optional[str] = Field(
        None, description="Population filter (e.g. 'adult', 'pediatric')"
    )
    sources: Optional[list[str]] = Field(
        None,
        description=(
            "Restrict federation to this subset of source ids. Empty/None "
            "means 'all enabled sources'."
        ),
    )
    limit: int = Field(20, ge=1, le=100)


# core-schema-exempt: PR-1 router-local federation status DTO; promote to packages/core-schema in PR-2.
class NeuroimagingSourceStatus(BaseModel):
    """Per-source federation outcome."""

    id: str
    name: str
    status: str = Field(
        ...,
        description="ok | degraded | timeout | error (PR-3 live runtime)",
    )
    result_count: int = 0
    error: Optional[str] = None


# core-schema-exempt: PR-1 router-local search result DTO; promote to packages/core-schema in PR-2.
class NeuroimagingSearchResult(BaseModel):
    """One federated search result row."""

    source_id: str
    source_name: str
    record: dict[str, Any] = Field(
        ..., description="Raw record as returned by the upstream adapter"
    )
    provenance: dict[str, Any] = Field(
        default_factory=dict,
        description="Per-record provenance pass-through (source id, citation, etc.)",
    )


# core-schema-exempt: PR-1 router-local search response; promote to packages/core-schema in PR-2.
class NeuroimagingSearchResponse(BaseModel):
    """Federated-search response. Always HTTP 200."""

    source_status: list[NeuroimagingSourceStatus]
    results: list[NeuroimagingSearchResult]
    warnings: list[str]
    provenance: dict[str, Any] = Field(
        ...,
        description=(
            "Aggregate provenance: queried sources, returned counts, "
            "decision_support_disclaimer."
        ),
    )
    decision_support_disclaimer: str


# ─── Endpoints ────────────────────────────────────────────────────────────


@router.get("/adapters", response_model=NeuroimagingSourceListResponse)
def list_adapters(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NeuroimagingSourceListResponse:
    """List the full 18-source neuroimaging catalog."""
    sources = list_neuroimaging_sources()
    return NeuroimagingSourceListResponse(
        sources=[NeuroimagingSourceOut(**src) for src in sources],
        total=len(sources),
        decision_support_disclaimer=DECISION_SUPPORT_DISCLAIMER,
    )


@router.get("/adapters/{key}", response_model=NeuroimagingSourceDetailResponse)
def get_adapter_detail(
    key: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NeuroimagingSourceDetailResponse:
    """Return a single neuroimaging source by key."""
    source = get_neuroimaging_source(key)
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown neuroimaging source: {key}",
        )
    return NeuroimagingSourceDetailResponse(
        source=NeuroimagingSourceOut(**source),
        decision_support_disclaimer=DECISION_SUPPORT_DISCLAIMER,
    )


@router.get("/_lifecycle", response_model=NeuroimagingLifecycleResponse)
def get_lifecycle_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NeuroimagingLifecycleResponse:
    """Return lifecycle state breakdown for the neuroimaging inventory."""
    summary = list_lifecycle_summary()
    return NeuroimagingLifecycleResponse(
        total=summary["total"],
        by_state=summary["by_state"],
        sources=summary["sources"],
        decision_support_disclaimer=DECISION_SUPPORT_DISCLAIMER,
    )


# ─── Federated search helpers ────────────────────────────────────────────


def _resolve_adapter(import_path: str) -> Optional[type]:
    """Import a module and return its first ``Adapter`` class.

    Returns ``None`` and logs on any failure. Never raises. Kept at
    module level so PR-1 tests that monkey-patch
    ``neuroimaging_router._resolve_adapter`` continue to work — PR-3
    threads this exact callable into :func:`federate` as the
    ``resolver`` argument.
    """
    try:
        module = importlib.import_module(import_path)
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning("neuroimaging adapter import failed: %s (%s)", import_path, exc)
        return None
    for _name, obj in inspect.getmembers(module, inspect.isclass):
        if obj.__module__ != import_path:
            continue
        if _name.endswith("Adapter"):
            return obj
    return None


@router.post("/search", response_model=NeuroimagingSearchResponse)
async def search_neuroimaging(
    payload: NeuroimagingSearchRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NeuroimagingSearchResponse:
    """Federated read-only search across enabled neuroimaging adapters.

    Anonymous catalog federation only — no ``patient_id``, no PHI, no
    encounter linkage. Patient-linked variants are a separate concern
    and would require ``_gate_patient_access`` + consent enforcement.

    Failure semantics: partial-failure tolerant. Adapters that error,
    time out, or are unavailable produce ``source_status`` entries with
    ``status`` in {``error``, ``timeout``, ``degraded``} and a
    corresponding ``warnings`` entry; the response stays HTTP 200.
    """
    enabled = list_enabled_sources()
    requested_ids = set(payload.sources or [])
    if requested_ids:
        all_ids = {src["id"] for src in NEUROIMAGING_SOURCES}
        unknown = requested_ids - all_ids
        enabled = [src for src in enabled if src["id"] in requested_ids]
    else:
        unknown = set()

    fed_query = _FedQuery(
        condition=payload.condition,
        modality=payload.modality,
        region=payload.region,
        coordinate=payload.coordinate,
        atlas=payload.atlas,
        population=payload.population,
        sources=payload.sources,
        limit=payload.limit,
    )
    outcome = await _federate(fed_query, enabled, resolver=_resolve_adapter)

    source_status = [NeuroimagingSourceStatus(**s) for s in outcome["source_status"]]
    src_lookup = {src["id"]: src for src in enabled}
    results: list[NeuroimagingSearchResult] = []
    for r in outcome["results"]:
        src = src_lookup.get(r.source, {})
        results.append(
            NeuroimagingSearchResult(
                source_id=r.source,
                source_name=src.get("name", r.source),
                record=r.model_dump(),
                provenance={
                    "source_id": r.source,
                    "source_url": src.get("source_url", ""),
                    "lifecycle_state": src.get("lifecycle_state", "healthy"),
                    **(r.provenance or {}),
                },
            )
        )
    warnings = list(outcome["warnings"])
    for unk in sorted(unknown):
        warnings.append(f"unknown source id ignored: {unk}")

    provenance = {
        "queried_sources": [src["id"] for src in enabled],
        "total_results": len(results),
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }
    return NeuroimagingSearchResponse(
        source_status=source_status,
        results=results,
        warnings=warnings,
        provenance=provenance,
        decision_support_disclaimer=DECISION_SUPPORT_DISCLAIMER,
    )


__all__ = ["router"]
