from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.services.registries import (
    get_condition,
    get_condition_package,
    get_protocol,
    get_phenotypes_for_condition,
    list_condition_package_slugs,
    list_conditions,
    list_devices,
    list_governance_rules,
    list_modalities,
    list_phenotypes,
    list_protocols,
)

router = APIRouter(prefix="/api/v1/registry", tags=["Registry"])

_EVIDENCE_GRADE_ORDER: dict[str, int] = {
    "EV-A": 4,
    "EV-B": 3,
    "EV-C": 2,
    "EV-D": 1,
}


# ---------------------------------------------------------------------------
# Conditions
# ---------------------------------------------------------------------------

@router.get("/conditions")
def registry_list_conditions() -> dict:
    items = list_conditions()
    return {"items": items, "total": len(items)}


@router.get("/conditions/packages")
def registry_list_condition_packages() -> dict:
    slugs = list_condition_package_slugs()
    return {"slugs": slugs, "total": len(slugs)}


@router.get("/conditions/{condition_id}/package")
def registry_get_condition_package(condition_id: str) -> dict:
    pkg = get_condition_package(condition_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail=f"Condition package '{condition_id}' not found.")
    return pkg


@router.get("/conditions/{condition_id}")
def registry_get_condition(condition_id: str) -> dict:
    condition = get_condition(condition_id)
    if condition is None:
        raise HTTPException(status_code=404, detail=f"Condition '{condition_id}' not found.")
    return condition


# ---------------------------------------------------------------------------
# Modalities
# ---------------------------------------------------------------------------

@router.get("/modalities")
def registry_list_modalities() -> dict:
    items = list_modalities()
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

@router.get("/devices")
def registry_list_devices() -> dict:
    items = list_devices()
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Protocols
# ---------------------------------------------------------------------------

@router.get("/protocols")
def registry_list_protocols(
    condition_id: Optional[str] = Query(default=None, description="Filter by Condition_ID"),
    modality_id: Optional[str] = Query(default=None, description="Filter by Modality_ID"),
    on_label_only: bool = Query(default=False, description="If true, return only On-Label protocols"),
    evidence_grade: Optional[str] = Query(
        default=None,
        description="Minimum evidence grade to include (EV-A, EV-B, EV-C, EV-D). EV-A is highest.",
    ),
) -> dict:
    items = list_protocols()

    if condition_id:
        items = [p for p in items if p["condition_id"] == condition_id]

    if modality_id:
        items = [p for p in items if p["modality_id"] == modality_id]

    if on_label_only:
        items = [p for p in items if p["on_label_vs_off_label"].lower().startswith("on-label")]

    if evidence_grade:
        min_rank = _EVIDENCE_GRADE_ORDER.get(evidence_grade.upper(), 0)
        items = [
            p for p in items
            if _EVIDENCE_GRADE_ORDER.get(p["evidence_grade"].upper(), 0) >= min_rank
        ]

    return {"items": items, "total": len(items)}


@router.get("/protocols/{protocol_id}")
def registry_get_protocol(protocol_id: str) -> dict:
    protocol = get_protocol(protocol_id)
    if protocol is None:
        raise HTTPException(status_code=404, detail=f"Protocol '{protocol_id}' not found.")
    return protocol


# ---------------------------------------------------------------------------
# Phenotypes
# ---------------------------------------------------------------------------

@router.get("/phenotypes")
def registry_list_phenotypes(
    condition_id: Optional[str] = Query(default=None, description="Filter by associated Condition_ID"),
) -> dict:
    if condition_id:
        items = get_phenotypes_for_condition(condition_id)
    else:
        items = list_phenotypes()
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Governance rules
# ---------------------------------------------------------------------------

@router.get("/governance-rules")
def registry_list_governance_rules() -> dict:
    items = list_governance_rules()
    return {"items": items, "total": len(items)}
