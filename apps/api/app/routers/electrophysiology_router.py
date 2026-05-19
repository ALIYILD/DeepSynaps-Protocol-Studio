"""Category 7 electrophysiology reference surface.

This router exposes the four electrophysiology sources from the inventory as
catalogued reference datasets. It does not claim validated normative
comparisons or live upstream access.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Path, status
from pydantic import BaseModel, Field

from app.services.knowledge.electrophysiology_registry import (
    DECISION_SUPPORT_DISCLAIMER,
    build_electrophysiology_inventory,
    get_electrophysiology_spec,
    list_electrophysiology_keys,
    search_electrophysiology_reference_datasets,
    summarize_electrophysiology_lifecycle,
)

router = APIRouter(prefix="/api/v1/electrophysiology", tags=["Electrophysiology"])


class ElectrophysiologyAdapterRow(BaseModel):
    source: str
    source_id: str
    dataset_name: str
    modality: str
    recording_condition: str
    population_context: str
    frequency_band: str
    biomarker_tags: List[str]
    artifact_tags: List[str]
    access_license_notes: str
    provenance: Dict[str, Any]
    limitations: List[str]
    warnings: List[str]
    decision_support_disclaimer: str
    lifecycle_state: str
    status: str
    source_url: str
    match_score: Optional[int] = None
    match_reason: Optional[str] = None


class ElectrophysiologyAdaptersList(BaseModel):
    total: int
    adapters: List[ElectrophysiologyAdapterRow]


class ElectrophysiologyLifecycleSummary(BaseModel):
    total: int
    by_state: Dict[str, int]
    adapters: Dict[str, str]


class ElectrophysiologySearchRequest(BaseModel):
    modality: Optional[str] = Field(default=None, description="EEG, qEEG, sleep EEG, iEEG, EMG")
    condition: Optional[str] = Field(default=None, description="Clinical or research context, e.g. ADHD, sleep, epilepsy")
    recording_condition: Optional[str] = Field(default=None, description="eyes_closed, eyes_open, task, sleep, unknown")
    frequency_band: Optional[str] = Field(default=None, description="theta, beta, alpha, delta, spindle, etc.")
    biomarker: Optional[str] = Field(default=None, description="theta/beta, slow-wave activity, etc.")
    age_group: Optional[str] = Field(default=None, description="Optional age bucket")
    patient_id: Optional[str] = Field(default=None, description="Optional patient reference for audit context only")


class ElectrophysiologySearchResponse(BaseModel):
    decision_support_only: bool
    decision_support_disclaimer: str
    partial: bool
    query: Dict[str, Any]
    source_statuses: List[ElectrophysiologyAdapterRow]
    matching_reference_datasets: List[ElectrophysiologyAdapterRow]
    source_count: int


@router.get("/adapters", response_model=ElectrophysiologyAdaptersList)
async def list_electrophysiology_adapters() -> ElectrophysiologyAdaptersList:
    rows = build_electrophysiology_inventory()
    return ElectrophysiologyAdaptersList(total=len(rows), adapters=[ElectrophysiologyAdapterRow(**row) for row in rows])


@router.get("/adapters/_lifecycle", response_model=ElectrophysiologyLifecycleSummary)
async def get_electrophysiology_lifecycle() -> ElectrophysiologyLifecycleSummary:
    return ElectrophysiologyLifecycleSummary(**summarize_electrophysiology_lifecycle())


@router.get("/adapters/{key}", response_model=ElectrophysiologyAdapterRow)
async def get_electrophysiology_adapter(key: str = Path(..., min_length=1, max_length=64)) -> ElectrophysiologyAdapterRow:
    rows = build_electrophysiology_inventory()
    for row in rows:
        if row["source_id"] == key:
            return ElectrophysiologyAdapterRow(**row)
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Unknown electrophysiology source: {key!r}",
    )


@router.post("/search", response_model=ElectrophysiologySearchResponse)
async def search_electrophysiology(
    body: ElectrophysiologySearchRequest = Body(...),
) -> ElectrophysiologySearchResponse:
    payload = search_electrophysiology_reference_datasets(body.model_dump())
    return ElectrophysiologySearchResponse(
        decision_support_only=payload["decision_support_only"],
        decision_support_disclaimer=payload["decision_support_disclaimer"],
        partial=payload["partial"],
        query=payload["query"],
        source_statuses=[ElectrophysiologyAdapterRow(**row) for row in payload["source_statuses"]],
        matching_reference_datasets=[ElectrophysiologyAdapterRow(**row) for row in payload["matching_reference_datasets"]],
        source_count=payload["source_count"],
    )


__all__ = [
    "router",
    "ElectrophysiologyAdapterRow",
    "ElectrophysiologyAdaptersList",
    "ElectrophysiologyLifecycleSummary",
    "ElectrophysiologySearchRequest",
    "ElectrophysiologySearchResponse",
    "get_electrophysiology_adapter",
    "get_electrophysiology_lifecycle",
    "list_electrophysiology_adapters",
    "search_electrophysiology",
]
