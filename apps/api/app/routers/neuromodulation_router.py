"""Category 5 neuromodulation router.

This router is inventory-first and safety-first:
- it surfaces source availability honestly,
- it never fabricates field strength or stimulation parameters,
- and it only returns planning context / metadata for clinician review.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.knowledge.neuromodulation_inventory import (
    build_neuromodulation_inventory,
    build_planning_context,
    build_simnibs_status,
    DECISION_SUPPORT_DISCLAIMER,
    get_neuromodulation_source,
)


router = APIRouter(prefix="/api/v1/neuromodulation", tags=["neuromodulation"])


class NeuromodulationQueryRequest(BaseModel):
    source_key: str
    modality: str | None = None
    condition: str | None = None
    target_region: str | None = None
    montage: str | None = None
    device: str | None = None
    patient_id: str | None = None
    coordinate_space: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class NeuromodulationPlanningContextRequest(BaseModel):
    modality: str
    condition: str | None = None
    target_region: str | None = None
    montage: str | None = None
    device: str | None = None
    patient_id: str | None = None
    coordinate_space: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class SimNIBSPlanRequest(BaseModel):
    modality: str = "tDCS"
    target_region: str | None = None
    montage: str | None = None
    device: str | None = None
    coordinate_space: str | None = None
    patient_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


@router.get("/sources")
def list_neuromodulation_sources(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    return build_neuromodulation_inventory()


@router.get("/sources/_lifecycle")
def list_neuromodulation_lifecycle(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    inventory = build_neuromodulation_inventory()
    return inventory["summary"] | {"disclaimer": DECISION_SUPPORT_DISCLAIMER}


@router.post("/query")
def query_neuromodulation_source(
    payload: NeuromodulationQueryRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    source = get_neuromodulation_source(payload.source_key)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown neuromodulation source")

    response: dict[str, Any] = {
        "source": source,
        "requested": payload.model_dump(),
        "records": [],
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }
    if payload.source_key == "simnibs":
        response.update(build_simnibs_status(payload.model_dump()))
        return response

    response["status"] = source.get("lifecycle_state", "unknown")
    response["source_status"] = source.get("lifecycle_state", "unknown")
    response["warnings"] = list(source.get("warnings") or []) + [
        "This endpoint returns inventory metadata only; no live source query is executed here."
    ]
    return response


@router.post("/planning-context")
def neuromodulation_planning_context(
    payload: NeuromodulationPlanningContextRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    return build_planning_context(payload.model_dump())


@router.post("/simnibs/status")
def simnibs_status(
    payload: SimNIBSPlanRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    return build_simnibs_status(payload.model_dump())


@router.post("/simnibs/plan")
def simnibs_plan(
    payload: SimNIBSPlanRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    status_payload = build_simnibs_status(payload.model_dump())
    status_payload["plan"] = {
        "requested_montage": payload.montage,
        "requested_target_region": payload.target_region,
        "requested_modality": payload.modality,
        "requested_device": payload.device,
        "field_strength_v_m": None,
        "field_estimate_computed": False,
        "note": (
            "Simulation scaffold only. No FEM output is computed here; "
            "use a verified local SimNIBS runtime for real field modelling."
        ),
    }
    return status_payload

