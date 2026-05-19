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
    status: str = Field(..., description="ok | skipped | error")
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


def _build_query_for_adapter(req: NeuroimagingSearchRequest) -> dict[str, Any]:
    """Map the public request body to a generic upstream-adapter query dict.

    Adapters vary in their argument shapes; the helper they expose may
    accept ``(query: str, filters: dict)`` (legacy ``BaseAdapter``) or
    ``(query: dict)`` (canonical ``DatabaseAdapter.fetch``). This helper
    builds a single dict the caller can adapt per-adapter.
    """
    query: dict[str, Any] = {}
    if req.condition:
        query["term"] = req.condition
    if req.region:
        query["region"] = req.region
    if req.coordinate is not None:
        query["coordinate"] = list(req.coordinate)
    if req.modality:
        query["modality"] = req.modality
    if req.atlas:
        query["atlas"] = req.atlas
    if req.population:
        query["population"] = req.population
    query["limit"] = req.limit
    return query


def _resolve_adapter(import_path: str) -> Optional[type]:
    """Import a module and return its first ``Adapter`` class.

    Returns ``None`` and logs on any failure. Never raises.
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


def _safe_invoke_search(
    adapter_cls: type, query: dict[str, Any]
) -> tuple[list[dict[str, Any]], Optional[str]]:
    """Try to call a search-shaped method on an adapter; return ``(results, error)``.

    This helper is intentionally defensive: adapter classes have varied
    constructor + method signatures across the legacy and canonical
    trees. We never instantiate side-effectful resources here (no
    ``connect()``); any failure becomes a warning, not an exception.
    """
    # PR-1 scope: catalog + dry federation. We surface "no_runtime" so
    # the contract is exercised end-to-end without performing live HTTP
    # I/O in this PR (which would require per-adapter async-loop +
    # credential plumbing).
    return [], "no_runtime_in_pr1"


@router.post("/search", response_model=NeuroimagingSearchResponse)
def search_neuroimaging(
    payload: NeuroimagingSearchRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NeuroimagingSearchResponse:
    """Federated read-only search across enabled neuroimaging adapters.

    Failure semantics: partial-failure tolerant. Adapters that error or
    are unavailable produce ``source_status`` entries with
    ``status='error'`` and a corresponding ``warnings`` entry; the
    response remains HTTP 200.
    """
    enabled = list_enabled_sources()
    requested_ids = set(payload.sources or [])
    if requested_ids:
        # Validate the caller's filter against the catalog; warn on unknown.
        all_ids = {src["id"] for src in NEUROIMAGING_SOURCES}
        unknown = requested_ids - all_ids
        enabled = [src for src in enabled if src["id"] in requested_ids]
    else:
        unknown = set()

    query = _build_query_for_adapter(payload)
    source_status: list[NeuroimagingSourceStatus] = []
    results: list[NeuroimagingSearchResult] = []
    warnings: list[str] = []

    for src in enabled:
        adapter_cls = _resolve_adapter(src["import_path"])
        if adapter_cls is None:
            source_status.append(
                NeuroimagingSourceStatus(
                    id=src["id"],
                    name=src["name"],
                    status="error",
                    result_count=0,
                    error="adapter_import_failed",
                )
            )
            warnings.append(
                f"{src['id']}: adapter import failed ({src['import_path']})"
            )
            continue

        rows, err = _safe_invoke_search(adapter_cls, query)
        if err is not None:
            source_status.append(
                NeuroimagingSourceStatus(
                    id=src["id"],
                    name=src["name"],
                    status="skipped" if err == "no_runtime_in_pr1" else "error",
                    result_count=0,
                    error=err,
                )
            )
            if err == "no_runtime_in_pr1":
                warnings.append(
                    f"{src['id']}: live federation deferred to PR-2 (catalog wiring only)"
                )
            else:
                warnings.append(f"{src['id']}: {err}")
            continue

        for row in rows:
            results.append(
                NeuroimagingSearchResult(
                    source_id=src["id"],
                    source_name=src["name"],
                    record=row,
                    provenance={
                        "source_id": src["id"],
                        "source_url": src["source_url"],
                        "lifecycle_state": src["lifecycle_state"],
                    },
                )
            )
        source_status.append(
            NeuroimagingSourceStatus(
                id=src["id"],
                name=src["name"],
                status="ok",
                result_count=len(rows),
                error=None,
            )
        )

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
