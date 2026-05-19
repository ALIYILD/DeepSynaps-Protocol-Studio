"""Neuroscience society resource router.

This surface exposes the Category 9 society inventory as honest contextual
links and an explicitly unavailable structured search endpoint.
"""

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Body, Query
from pydantic import BaseModel, Field

from app.services.knowledge.society_resource_registry import (
    DECISION_SUPPORT_DISCLAIMER,
    build_society_resource_inventory,
    search_society_resources,
    summarize_society_lifecycle,
)


router = APIRouter(prefix="/api/v1/society-resources", tags=["Neuroscience Society"])


class SocietyResourceSearchRequest(BaseModel):
    query: str = Field(default="", description="Free-text query for contextual source links.")
    condition: Optional[str] = None
    modality: Optional[str] = None
    source: Optional[str] = None
    resource_type: Optional[str] = None


class SocietyResourceSearchResponse(BaseModel):
    query: str
    condition: Optional[str] = None
    modality: Optional[str] = None
    source: Optional[str] = None
    resource_type: Optional[str] = None
    structured_search_available: bool = False
    source_statuses: List[dict[str, Any]] = Field(default_factory=list)
    matched_resources: List[dict[str, Any]] = Field(default_factory=list)
    contextual_resources: List[dict[str, Any]] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)
    decision_support_disclaimer: str = DECISION_SUPPORT_DISCLAIMER


@router.get("/sources")
def list_society_sources() -> dict[str, Any]:
    return build_society_resource_inventory()


@router.get("/lifecycle")
def society_lifecycle() -> dict[str, Any]:
    return summarize_society_lifecycle()


@router.post("/search", response_model=SocietyResourceSearchResponse)
def search_society(
    body: SocietyResourceSearchRequest = Body(default_factory=SocietyResourceSearchRequest),
) -> SocietyResourceSearchResponse:
    payload = search_society_resources(
        body.query,
        condition=body.condition,
        modality=body.modality,
        source=body.source,
        resource_type=body.resource_type,
    )
    return SocietyResourceSearchResponse(**payload)


@router.get("/search", response_model=SocietyResourceSearchResponse)
def search_society_get(
    query: str = Query(default=""),
    condition: Optional[str] = Query(default=None),
    modality: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None),
    resource_type: Optional[str] = Query(default=None),
) -> SocietyResourceSearchResponse:
    payload = search_society_resources(
        query,
        condition=condition,
        modality=modality,
        source=source,
        resource_type=resource_type,
    )
    return SocietyResourceSearchResponse(**payload)


__all__ = ["router", "search_society", "list_society_sources", "society_lifecycle"]
