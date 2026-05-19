"""Category 1 pharmaceutical database routes.

These endpoints expose the 11-database pharmaceutical inventory and a
decision-support-oriented bundle query surface. The bundle is intentionally
cautious: it returns source data, adapter status, and clinician-review prompts
without making autonomous clinical conclusions.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from app.services.knowledge.pharmaceutical_registry import (
    build_pharmaceutical_inventory,
    get_pharmaceutical_registry,
    get_pharmaceutical_spec,
    list_connected_pharmaceutical_keys,
    list_disabled_pharmaceutical_keys,
    list_pharmaceutical_keys,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/pharmaceutical", tags=["Pharmaceutical Databases"])

_DISCLAMER = (
    "Decision support only. Not a diagnosis. Not a prescription. "
    "Clinician must verify source data before any medication decision. "
    "Possible safety considerations should be reviewed against the original source."
)


class PharmaceuticalAdapterRow(BaseModel):
    key: str
    display_name: str
    category: str
    access_type: str
    source_url: str
    clinical_utility: str
    api_key_required: bool
    enabled: bool
    registered: bool
    live_exposed: bool
    tier: str
    status: str
    lifecycle_state: str
    connected: bool
    api_key_configured: bool
    source_version: str = ""
    license_type: str = ""
    notes: str = ""


class PharmaceuticalAdapterList(BaseModel):
    total: int
    adapters: List[PharmaceuticalAdapterRow]


class PharmaceuticalQueryRequest(BaseModel):
    medication_name: str = Field(..., min_length=1)
    adapters: Optional[List[str]] = Field(
        default=None,
        description="Optional adapter keys to query. Defaults to enabled category adapters.",
    )
    limit: int = Field(default=5, ge=1, le=25)


class PharmaceuticalAdapterResult(BaseModel):
    key: str
    display_name: str
    status: str
    lifecycle_state: str
    access_type: str
    source_url: str
    result_count: int
    results: List[Dict[str, Any]]
    error: Optional[str] = None


class PharmaceuticalQueryResponse(BaseModel):
    medication_name: str
    decision_support_only: bool
    disclaimer: str
    partial: bool
    total_results: int
    adapters: List[PharmaceuticalAdapterResult]


class PharmaceuticalBundleResponse(PharmaceuticalQueryResponse):
    clinician_review_required: bool
    possible_safety_considerations: List[Dict[str, Any]]


def _selected_keys(requested: Optional[List[str]]) -> List[str]:
    if requested:
        return [key for key in requested if get_pharmaceutical_spec(key) is not None]
    return [key for key in list_connected_pharmaceutical_keys() if key not in list_disabled_pharmaceutical_keys()]


def _query_params_for_key(key: str, medication_name: str, limit: int) -> tuple[str, Dict[str, Any]]:
    if key == "drugbank":
        return medication_name, {"search_type": "name", "include_interactions": True, "limit": limit}
    if key == "chembl":
        return medication_name, {"search_type": "molecule", "limit": limit}
    if key == "pubchem":
        return medication_name, {"search_type": "name", "limit": limit}
    if key == "openfda":
        return medication_name, {"search_type": "name", "limit": limit}
    if key == "rxnorm":
        return medication_name, {"search_type": "name", "limit": limit}
    return medication_name, {"limit": limit}


async def _query_single_adapter(
    key: str,
    registry,
    medication_name: str,
    limit: int,
) -> PharmaceuticalAdapterResult:
    spec = get_pharmaceutical_spec(key)
    if spec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown adapter: {key!r}.")
    if not spec.enabled:
        return PharmaceuticalAdapterResult(
            key=key,
            display_name=spec.display_name,
            status="disabled",
            lifecycle_state="disabled",
            access_type=spec.access_type,
            source_url=spec.source_url,
            result_count=0,
            results=[],
            error="Adapter is disabled in the pharmaceutical inventory.",
        )

    adapter = registry.get(key)
    if adapter is None:
        return PharmaceuticalAdapterResult(
            key=key,
            display_name=spec.display_name,
            status="unavailable",
            lifecycle_state="unavailable",
            access_type=spec.access_type,
            source_url=spec.source_url,
            result_count=0,
            results=[],
            error="Adapter is not registered in the runtime registry.",
        )

    status_value = "registered"
    if spec.api_key_required and not bool(getattr(adapter, "api_key", None)):
        status_value = "degraded"
    try:
        query, filters = _query_params_for_key(key, medication_name, limit)
        if hasattr(adapter, "search"):
            results = await adapter.search(query, filters=filters)
        else:
            results = await adapter.fetch({"q": query, **filters})
        results = list(results or [])[:limit]
        if results and status_value == "registered":
            status_value = "healthy"
        return PharmaceuticalAdapterResult(
            key=key,
            display_name=spec.display_name,
            status=status_value,
            lifecycle_state=status_value,
            access_type=spec.access_type,
            source_url=spec.source_url,
            result_count=len(results),
            results=results,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("pharmaceutical adapter %s failed: %s", key, exc)
        return PharmaceuticalAdapterResult(
            key=key,
            display_name=spec.display_name,
            status="degraded",
            lifecycle_state="degraded",
            access_type=spec.access_type,
            source_url=spec.source_url,
            result_count=0,
            results=[],
            error=f"{type(exc).__name__}: {exc}",
        )


def _safety_flags(query_rows: List[PharmaceuticalAdapterResult]) -> List[Dict[str, Any]]:
    flags: List[Dict[str, Any]] = []
    for row in query_rows:
        for record in row.results[:5]:
            if not isinstance(record, dict):
                continue
            for field in ("warnings", "contraindications", "adverse_events", "interactions"):
                value = record.get(field)
                if not value:
                    continue
                flags.append(
                    {
                        "source": row.key,
                        "field": field,
                        "evidence_flag": "possible safety consideration",
                        "details": value,
                    }
                )
    return flags


@router.get("/adapters", response_model=PharmaceuticalAdapterList)
async def list_pharmaceutical_adapters(
    registry=Depends(get_pharmaceutical_registry),
) -> PharmaceuticalAdapterList:
    rows = build_pharmaceutical_inventory(registry=registry)
    return PharmaceuticalAdapterList(total=len(rows), adapters=rows)


@router.get("/adapters/{key}", response_model=PharmaceuticalAdapterRow)
async def get_pharmaceutical_adapter(
    key: str = Path(..., min_length=1, max_length=64),
    registry=Depends(get_pharmaceutical_registry),
) -> PharmaceuticalAdapterRow:
    rows = build_pharmaceutical_inventory(registry=registry)
    for row in rows:
        if row["key"] == key:
            return PharmaceuticalAdapterRow(**row)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown adapter: {key!r}.")


@router.post("/query", response_model=PharmaceuticalQueryResponse)
async def query_pharmaceutical_adapters(
    body: PharmaceuticalQueryRequest = Body(...),
    registry=Depends(get_pharmaceutical_registry),
) -> PharmaceuticalQueryResponse:
    keys = _selected_keys(body.adapters)
    rows = await asyncio.gather(
        *(_query_single_adapter(key, registry, body.medication_name, body.limit) for key in keys)
    )
    partial = any(row.status in {"degraded", "unavailable"} for row in rows)
    total_results = sum(row.result_count for row in rows)
    return PharmaceuticalQueryResponse(
        medication_name=body.medication_name,
        decision_support_only=True,
        disclaimer=_DISCLAMER,
        partial=partial,
        total_results=total_results,
        adapters=list(rows),
    )


@router.post("/medication-safety-check", response_model=PharmaceuticalBundleResponse)
async def medication_safety_check(
    body: PharmaceuticalQueryRequest = Body(...),
    registry=Depends(get_pharmaceutical_registry),
) -> PharmaceuticalBundleResponse:
    base = await query_pharmaceutical_adapters(body, registry)
    return PharmaceuticalBundleResponse(
        **base.model_dump(),
        clinician_review_required=True,
        possible_safety_considerations=_safety_flags(base.adapters),
    )


__all__ = [
    "router",
    "PharmaceuticalAdapterList",
    "PharmaceuticalAdapterResult",
    "PharmaceuticalAdapterRow",
    "PharmaceuticalBundleResponse",
    "PharmaceuticalQueryRequest",
    "PharmaceuticalQueryResponse",
    "get_pharmaceutical_adapter",
    "list_pharmaceutical_adapters",
    "medication_safety_check",
    "query_pharmaceutical_adapters",
]
