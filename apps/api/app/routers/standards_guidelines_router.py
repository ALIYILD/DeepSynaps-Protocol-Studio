"""Category 10 standards/guidelines reference surface.

This router exposes curated compliance-awareness references only.
It does not perform live standards scraping or claim legal/regulatory
compliance.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Path, status
from pydantic import BaseModel, Field

from app.services.knowledge.standards_guidelines_registry import (
    DECISION_SUPPORT_DISCLAIMER,
    build_standards_guidelines_inventory,
    get_standards_guideline_spec,
    list_standards_guideline_keys,
    search_standards_guidelines_reference_resources,
    summarize_standards_guideline_lifecycle,
)

router = APIRouter(prefix="/api/v1/standards-guidelines", tags=["Standards & Guidelines"])


class StandardsGuidelinesRow(BaseModel):
    id: str
    source_id: str
    source: str
    title: str
    category: str
    source_kind: str
    jurisdiction: str
    access_type: str
    source_url: str
    url: str
    clinical_utility_summary: str
    compliance_relevance: str
    device_or_modality_tags: List[str]
    publication_update_date: Optional[str] = None
    summary: Optional[str] = None
    access_license_notes: str
    enabled: bool
    registered: bool
    structured_search_available: bool
    lifecycle_state: str
    status: str
    limitations: List[str]
    warnings: List[str]
    decision_support_disclaimer: str
    provenance: Dict[str, Any]
    match_score: Optional[int] = None
    match_reason: Optional[str] = None


class StandardsGuidelinesInventoryResponse(BaseModel):
    total: int
    sources: List[StandardsGuidelinesRow]
    summary: Dict[str, Any]
    decision_support_disclaimer: str
    structured_search_available: bool
    search_status: str


class StandardsGuidelinesLifecycleResponse(BaseModel):
    total: int
    by_state: Dict[str, int]
    adapters: Dict[str, str]


class StandardsGuidelinesSearchRequest(BaseModel):
    query: str = Field(default="", description="Free-text query for governance-awareness lookup")
    modality: Optional[str] = Field(default=None, description="TMS, tDCS, DBS, neurofeedback, etc.")
    device_type: Optional[str] = Field(default=None, description="Optional device class")
    jurisdiction: Optional[str] = Field(default=None, description="US, EU, international, etc.")
    source: Optional[str] = Field(default=None, description="Optional source key or display name")


class StandardsGuidelinesSearchResponse(BaseModel):
    search_status: str
    structured_search_available: bool
    partial: bool
    decision_support_only: bool
    decision_support_disclaimer: str
    query: Dict[str, Any]
    source_statuses: List[StandardsGuidelinesRow]
    matched_resources: List[StandardsGuidelinesRow]
    source_count: int
    jurisdiction_notes: Dict[str, str]
    warnings: List[str]
    limitations: List[str]
    provenance: Dict[str, Any]


@router.get("/sources", response_model=StandardsGuidelinesInventoryResponse)
async def list_standards_guidelines_sources() -> StandardsGuidelinesInventoryResponse:
    inventory = build_standards_guidelines_inventory()
    return StandardsGuidelinesInventoryResponse(
        total=inventory["total"],
        sources=[StandardsGuidelinesRow(**row) for row in inventory["sources"]],
        summary=inventory["summary"],
        decision_support_disclaimer=inventory["decision_support_disclaimer"],
        structured_search_available=inventory["structured_search_available"],
        search_status=inventory["search_status"],
    )


@router.get("/sources/_lifecycle", response_model=StandardsGuidelinesLifecycleResponse)
async def get_standards_guidelines_lifecycle() -> StandardsGuidelinesLifecycleResponse:
    return StandardsGuidelinesLifecycleResponse(**summarize_standards_guideline_lifecycle())


@router.get("/sources/{key}", response_model=StandardsGuidelinesRow)
async def get_standards_guidelines_source(key: str = Path(..., min_length=1, max_length=64)) -> StandardsGuidelinesRow:
    spec = get_standards_guideline_spec(key)
    if spec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown standards/guidelines source: {key!r}",
        )
    inventory = build_standards_guidelines_inventory()
    for row in inventory["sources"]:
        if row["source_id"] == key:
            return StandardsGuidelinesRow(**row)
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Unknown standards/guidelines source: {key!r}",
    )


@router.post("/search", response_model=StandardsGuidelinesSearchResponse)
async def search_standards_guidelines(
    body: StandardsGuidelinesSearchRequest = Body(...),
) -> StandardsGuidelinesSearchResponse:
    payload = search_standards_guidelines_reference_resources(body.model_dump())
    return StandardsGuidelinesSearchResponse(
        search_status=payload["search_status"],
        structured_search_available=payload["structured_search_available"],
        partial=payload["partial"],
        decision_support_only=payload["decision_support_only"],
        decision_support_disclaimer=payload["decision_support_disclaimer"],
        query=payload["query"],
        source_statuses=[StandardsGuidelinesRow(**row) for row in payload["source_statuses"]],
        matched_resources=[StandardsGuidelinesRow(**row) for row in payload["matched_resources"]],
        source_count=payload["source_count"],
        jurisdiction_notes=payload["jurisdiction_notes"],
        warnings=payload["warnings"],
        limitations=payload["limitations"],
        provenance=payload["provenance"],
    )


__all__ = [
    "router",
    "StandardsGuidelinesRow",
    "StandardsGuidelinesInventoryResponse",
    "StandardsGuidelinesLifecycleResponse",
    "StandardsGuidelinesSearchRequest",
    "StandardsGuidelinesSearchResponse",
    "list_standards_guidelines_sources",
    "get_standards_guidelines_lifecycle",
    "get_standards_guidelines_source",
    "search_standards_guidelines",
]
