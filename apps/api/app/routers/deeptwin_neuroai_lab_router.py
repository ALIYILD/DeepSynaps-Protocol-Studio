"""Research-only DeepTwin NeuroAI Lab preview routes (no PHI persistence)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.errors import ApiServiceError

from deeptwin_neuroai_lab.event_timeline import EventTimeline
from deeptwin_neuroai_lab.feature_extractors import extract_features
from deeptwin_neuroai_lab.risk_flags import scan_for_unsafe_clinical_claims
from deeptwin_neuroai_lab.schemas import (
    DeepTwinSafetyMetadata,
    InterventionPayload,
    PatientDataEvent,
)
from deeptwin_neuroai_lab.simulation_contracts import (
    DeepTwinSimulationRequest,
    preview_simulation,
    serialize_simulation_for_audit,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/deeptwin/neuroai", tags=["deeptwin-neuroai-lab"])


class NeuroAiEnvelope(BaseModel):
    research_only: bool = True
    requires_clinician_review: bool = True
    safety: DeepTwinSafetyMetadata = Field(default_factory=DeepTwinSafetyMetadata)


class NeuroAiStatusResponse(BaseModel):
    module: str = "deeptwin_neuroai_lab"
    research_only: bool = True
    clinical_prediction_enabled: bool = False
    note: str = (
        "NeuroAI Lab previews are research-grade scaffolding; "
        "they do not diagnose or prescribe."
    )


class TimelinePreviewRequest(BaseModel):
    events: list[PatientDataEvent]
    patient_id: str | None = None


class TimelinePreviewResponse(BaseModel):
    summary: dict[str, Any]
    dashboard_series: list[dict[str, Any]]
    envelope: NeuroAiEnvelope = Field(default_factory=NeuroAiEnvelope)


class FeaturesPreviewRequest(BaseModel):
    events: list[PatientDataEvent]


class FeaturesPreviewResponse(BaseModel):
    results: list[dict[str, Any]]
    envelope: NeuroAiEnvelope = Field(default_factory=NeuroAiEnvelope)


class SimulationPreviewRequest(BaseModel):
    patient_id: str | None = None
    baseline_events: list[PatientDataEvent] = Field(default_factory=list)
    proposed_intervention: InterventionPayload | None = None
    outcome_domains: list[str] = Field(default_factory=list)
    time_horizon_days: int = Field(default=90, ge=1, le=3650)
    evidence_context: str = ""


class SimulationPreviewResponse(BaseModel):
    result: dict[str, Any]
    envelope: NeuroAiEnvelope = Field(default_factory=NeuroAiEnvelope)


@router.get("/status", response_model=NeuroAiStatusResponse)
def neuroai_status() -> NeuroAiStatusResponse:
    return NeuroAiStatusResponse()


@router.post("/timeline/preview", response_model=TimelinePreviewResponse)
def neuroai_timeline_preview(
    body: TimelinePreviewRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TimelinePreviewResponse:
    """Return chronological summary — decision-support only."""

    _ = actor  # Reserved for future PHI-aware gates; payload is caller-supplied.
    tl = EventTimeline(body.events)
    summary = tl.create_patient_timeline_summary(body.patient_id)
    series = tl.produce_dashboard_series()
    return TimelinePreviewResponse(summary=summary, dashboard_series=series)


@router.post("/features/preview", response_model=FeaturesPreviewResponse)
def neuroai_features_preview(
    body: FeaturesPreviewRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> FeaturesPreviewResponse:
    _ = actor
    results: list[dict[str, Any]] = []
    for ev in body.events:
        fx = extract_features(ev)
        results.append(
            {
                "event_id": ev.event_id,
                "modality": ev.modality.value,
                "extraction": fx.model_dump(mode="json"),
            }
        )
    return FeaturesPreviewResponse(results=results)


def _simulation_allowed(actor: AuthenticatedActor) -> None:
    if actor.role in ("guest", "patient"):
        raise ApiServiceError(
            code="neuroai_lab_forbidden",
            message="NeuroAI Lab simulation preview requires a clinician or administrator session.",
            status_code=403,
        )
    require_minimum_role(actor, "clinician")


@router.post("/simulation/preview", response_model=SimulationPreviewResponse)
def neuroai_simulation_preview(
    body: SimulationPreviewRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SimulationPreviewResponse:
    _simulation_allowed(actor)
    req = DeepTwinSimulationRequest(
        patient_id=body.patient_id,
        baseline_events=body.baseline_events,
        proposed_intervention=body.proposed_intervention,
        outcome_domains=body.outcome_domains,
        time_horizon_days=body.time_horizon_days,
        evidence_context=body.evidence_context,
        clinician_role_required=True,
    )
    result = preview_simulation(req)
    audit_obj = serialize_simulation_for_audit(result)
    if audit_obj.get("_unsafe_language_scan"):
        _log.warning(
            "neuroai_simulation_unsafe_language_blocked actor=%s hits=%s",
            actor.actor_id,
            audit_obj["_unsafe_language_scan"],
        )
        raise ApiServiceError(
            code="neuroai_lab_validation_failed",
            message="Simulation copy failed safety validation.",
            status_code=500,
        )
    text_scan = scan_for_unsafe_clinical_claims(
        result.scenario_summary + " ".join(result.possible_associations)
    )
    if text_scan:
        raise ApiServiceError(
            code="neuroai_lab_validation_failed",
            message="Simulation output contained blocked phrases.",
            status_code=500,
        )
    return SimulationPreviewResponse(result=result.model_dump(mode="json"))
