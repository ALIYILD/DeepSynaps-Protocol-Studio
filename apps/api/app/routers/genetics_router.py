"""Category 2 genetics surface.

This router exposes the genetics inventory separately from the main knowledge
adapter registry so we can represent all 14 databases honestly:

- 8 adapters are backed by real code in this repo
- 6 adapters are catalogued but disabled because no canonical adapter exists

All responses are decision-support only. No diagnostic or deterministic
treatment claims are made here.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from app.services.knowledge.genetics_inventory import (
    GENETIC_SOURCES,
    GeneticRegistry,
    build_genetic_registry,
    get_genetic_registry,
    list_genetic_keys,
    summarize_genetic_lifecycle,
)
from app.services.knowledge.lifecycle import LifecycleState

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/genetics", tags=["Genetics"])

CLINICAL_DISCLAIMER = (
    "Decision support only. Not diagnostic, not a treatment recommendation. "
    "Genetic findings require clinician or genetics specialist review, and "
    "evidence may be incomplete or population-specific."
)

_QUERY_KEY_ORDER = (
    "variant",
    "rsid",
    "gene",
    "condition",
    "medication",
)

_QUERY_TARGETS = {
    "clinvar": ("variant", "rsid", "gene"),
    "dbsnp": ("rsid", "variant", "gene"),
    "gwas_catalog": ("gene", "condition", "variant"),
    "ensembl": ("gene", "variant", "rsid"),
    "uniprot": ("gene", "variant", "condition"),
    "string": ("gene", "condition"),
    "gnomad": ("variant", "rsid", "gene"),
    "myvariant": ("variant", "rsid", "gene"),
}


class GeneticAdapterSummary(BaseModel):
    key: str
    display_name: str
    category: str
    access_type: str
    source_url: str
    clinical_utility_summary: str
    api_key_required: bool
    implemented: bool
    registered: bool
    enabled: bool
    connected: bool
    source_version: str
    lifecycle_state: str
    access_note: str = ""


class GeneticAdaptersList(BaseModel):
    total: int
    adapters: List[GeneticAdapterSummary]


class GeneticLifecycleSummary(BaseModel):
    total: int
    by_state: Dict[str, int]
    adapters: Dict[str, str]


class GeneticQueryRequest(BaseModel):
    adapter_key: str = Field(..., description="Genetic adapter key, e.g. clinvar or gnomad")
    query: str = Field(..., description="Search term, rsID, gene symbol, or variant string")
    filters: Dict[str, Any] = Field(default_factory=dict)


class VariantBundleRequest(BaseModel):
    gene: Optional[str] = None
    variant: Optional[str] = None
    rsid: Optional[str] = None
    condition: Optional[str] = None
    medication: Optional[str] = None


class PGXCheckRequest(BaseModel):
    gene: Optional[str] = None
    variant: Optional[str] = None
    rsid: Optional[str] = None
    condition: Optional[str] = None
    medication: Optional[str] = None


def _summary_from_info(info: Dict[str, Any]) -> GeneticAdapterSummary:
    return GeneticAdapterSummary(**info)


def _choose_query(bundle: VariantBundleRequest | PGXCheckRequest, key: str) -> Optional[str]:
    for field_name in _QUERY_TARGETS.get(key, _QUERY_KEY_ORDER):
        value = getattr(bundle, field_name, None)
        if value:
            return str(value).strip()
    return None


async def _ensure_adapter_ready(adapter: Any) -> None:
    if adapter is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Genetic adapter is unavailable.")
    if hasattr(adapter, "connect") and not getattr(adapter, "is_connected", False):
        try:
            await adapter.connect()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Genetic adapter could not connect: {exc}",
            ) from exc


async def _query_adapter(adapter: Any, query: str, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    if adapter is None:
        return []
    if hasattr(adapter, "connect") and not getattr(adapter, "is_connected", False):
        try:
            await adapter.connect()
        except Exception:
            # Query still gets a chance if the adapter can operate offline.
            pass
    try:
        result = await adapter.search(query, filters=filters)
    except TypeError:
        result = await adapter.search(query)
    if result is None:
        return []
    if isinstance(result, dict):
        return [result]
    return list(result)


def _build_bundle_response(
    *,
    bundle: VariantBundleRequest | PGXCheckRequest,
    registry: GeneticRegistry,
    source_hits: Dict[str, List[Dict[str, Any]]],
    source_errors: Dict[str, str],
) -> Dict[str, Any]:
    normalized = {
        "gene": (bundle.gene or "").strip().upper() or None,
        "variant": (bundle.variant or "").strip() or None,
        "rsid": (bundle.rsid or "").strip() or None,
        "condition": (bundle.condition or "").strip() or None,
        "medication": (bundle.medication or "").strip() or None,
    }
    active_sources = [key for key, hits in source_hits.items() if hits]
    missing_sources = [
        key
        for key in list_genetic_keys()
        if key not in active_sources and key not in source_errors
    ]
    caveats = [
        "Decision support only.",
        "Genetic findings require clinician or genetics specialist review.",
        "Evidence may be incomplete or population-specific.",
    ]
    if missing_sources:
        caveats.append(
            f"{len(missing_sources)} catalogued source(s) are disabled or unavailable in this environment."
        )
    if source_errors:
        caveats.append("One or more upstream sources failed; partial results were preserved.")
    uncertainty_flags = []
    if missing_sources:
        uncertainty_flags.append("partial_inventory")
    if source_errors:
        uncertainty_flags.append("partial_upstream_failure")
    status = "ok" if active_sources and not source_errors and not missing_sources else "partial"
    return {
        "status": status,
        "decision_support_only": True,
        "clinical_disclaimer": CLINICAL_DISCLAIMER,
        "normalized_identifiers": normalized,
        "source_hits": source_hits,
        "source_errors": source_errors,
        "clinical_caveats": caveats,
        "uncertainty_flags": uncertainty_flags,
        "registry_summary": summarize_genetic_lifecycle(registry),
    }


@router.get("/adapters", response_model=GeneticAdaptersList)
async def list_genetic_adapters(
    registry: GeneticRegistry = Depends(get_genetic_registry),
) -> GeneticAdaptersList:
    info = registry.get_all_info()
    return GeneticAdaptersList(
        total=len(info),
        adapters=[_summary_from_info(info[key]) for key in list_genetic_keys()],
    )


@router.get("/adapters/_lifecycle", response_model=GeneticLifecycleSummary)
async def get_genetic_lifecycle(
    registry: GeneticRegistry = Depends(get_genetic_registry),
) -> GeneticLifecycleSummary:
    return GeneticLifecycleSummary(**summarize_genetic_lifecycle(registry))


@router.post("/query")
async def query_genetic_adapter(
    payload: GeneticQueryRequest = Body(...),
    registry: GeneticRegistry = Depends(get_genetic_registry),
) -> Dict[str, Any]:
    spec = GENETIC_SOURCES.get(payload.adapter_key)
    if spec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown genetic adapter.")
    adapter = registry.get(payload.adapter_key)
    if adapter is None:
        return {
            "adapter_key": payload.adapter_key,
            "status": "disabled",
            "lifecycle_state": LifecycleState.DISABLED.value,
            "clinical_disclaimer": CLINICAL_DISCLAIMER,
            "results": [],
            "source_url": spec.source_url,
            "clinical_utility_summary": spec.clinical_utility_summary,
        }

    try:
        await _ensure_adapter_ready(adapter)
        results = await _query_adapter(adapter, payload.query, payload.filters)
        lifecycle_state = (
            LifecycleState.HEALTHY.value
            if getattr(adapter, "is_connected", False)
            else LifecycleState.REGISTERED.value
        )
        if not results:
            lifecycle_state = LifecycleState.DEGRADED.value
        return {
            "adapter_key": payload.adapter_key,
            "status": "ok" if results else "degraded",
            "lifecycle_state": lifecycle_state,
            "clinical_disclaimer": CLINICAL_DISCLAIMER,
            "source_url": spec.source_url,
            "clinical_utility_summary": spec.clinical_utility_summary,
            "results": results,
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("Genetic adapter query failed for %s: %s", payload.adapter_key, exc)
        return {
            "adapter_key": payload.adapter_key,
            "status": "degraded",
            "lifecycle_state": LifecycleState.DEGRADED.value,
            "clinical_disclaimer": CLINICAL_DISCLAIMER,
            "source_url": spec.source_url,
            "clinical_utility_summary": spec.clinical_utility_summary,
            "results": [],
            "error": str(exc),
        }


@router.post("/variant-annotation")
async def genetic_variant_annotation(
    payload: VariantBundleRequest = Body(...),
    registry: GeneticRegistry = Depends(get_genetic_registry),
) -> Dict[str, Any]:
    source_hits: Dict[str, List[Dict[str, Any]]] = {}
    source_errors: Dict[str, str] = {}

    for key in (
        "clinvar",
        "dbsnp",
        "gwas_catalog",
        "ensembl",
        "uniprot",
        "string",
        "gnomad",
        "myvariant",
    ):
        adapter = registry.get(key)
        if adapter is None:
            continue
        query = _choose_query(payload, key)
        if query is None:
            continue
        try:
            hits = await _query_adapter(adapter, query, {})
            if hits:
                source_hits[key] = hits
        except Exception as exc:  # noqa: BLE001
            source_errors[key] = str(exc)

    return _build_bundle_response(
        bundle=payload,
        registry=registry,
        source_hits=source_hits,
        source_errors=source_errors,
    )


@router.post("/pgx-neuromodulation-check")
async def pgx_neuromodulation_check(
    payload: PGXCheckRequest = Body(...),
    registry: GeneticRegistry = Depends(get_genetic_registry),
) -> Dict[str, Any]:
    # This is a decision-support bundle, not a protocol recommendation.
    bundle = VariantBundleRequest(
        gene=payload.gene,
        variant=payload.variant,
        rsid=payload.rsid,
        condition=payload.condition,
        medication=payload.medication,
    )
    response = await genetic_variant_annotation(bundle, registry)
    response["focus"] = "neuromodulation"
    response["clinical_caveats"].append(
        "Neuromodulation findings remain population-level evidence flags and require clinician review."
    )
    response["neuromodulation_support"] = {
        "possible_evidence_flag": bool(response["source_hits"]),
        "review_required": True,
    }
    return response

