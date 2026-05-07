"""Research-only DeepTwin NeuroAI Lab preview routes (no PHI persistence)."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
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


def _audit_neuroai_attempt(
    db: Session | None,
    actor: AuthenticatedActor,
    *,
    action: str,
    patient_id: str | None,
    meta: dict[str, Any],
) -> None:
    """Persist a minimal audit row — must never block the response."""

    if db is None:
        return
    try:
        from app.repositories.audit import create_audit_event  # noqa: PLC0415

        now = datetime.now(timezone.utc)
        # audit_events.event_id and target_id are VARCHAR(64) — keep inserts bounded.
        event_id = f"nlab-{uuid.uuid4().hex}"[:64]
        note = json.dumps(meta, default=str)[:900]
        create_audit_event(
            db,
            event_id=event_id,
            target_id=(patient_id or actor.actor_id)[:64],
            target_type="deeptwin_neuroai_lab",
            action=f"neuroai_lab.{action}",
            role=str(actor.role),
            actor_id=actor.actor_id,
            note=note,
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit failures are non-fatal
        _log.exception("neuroai_lab audit skipped")


# core-schema-exempt: NeuroAI Lab safety envelope; not reused outside this router
class NeuroAiEnvelope(BaseModel):
    research_only: bool = True
    requires_clinician_review: bool = True
    safety: DeepTwinSafetyMetadata = Field(default_factory=DeepTwinSafetyMetadata)


# core-schema-exempt: NeuroAI Lab status response; not reused outside this router
class NeuroAiStatusResponse(BaseModel):
    module: str = "deeptwin_neuroai_lab"
    research_only: bool = True
    clinical_prediction_enabled: bool = False
    note: str = (
        "NeuroAI Lab previews are research-grade scaffolding; "
        "they do not diagnose or prescribe."
    )


# core-schema-exempt: NeuroAI Lab timeline preview request; not reused outside this router
class TimelinePreviewRequest(BaseModel):
    events: list[PatientDataEvent]
    patient_id: str | None = None


# core-schema-exempt: NeuroAI Lab timeline preview response; not reused outside this router
class TimelinePreviewResponse(BaseModel):
    summary: dict[str, Any]
    dashboard_series: list[dict[str, Any]]
    envelope: NeuroAiEnvelope = Field(default_factory=NeuroAiEnvelope)


# core-schema-exempt: NeuroAI Lab features preview request; not reused outside this router
class FeaturesPreviewRequest(BaseModel):
    events: list[PatientDataEvent]


# core-schema-exempt: NeuroAI Lab features preview response; not reused outside this router
class FeaturesPreviewResponse(BaseModel):
    results: list[dict[str, Any]]
    envelope: NeuroAiEnvelope = Field(default_factory=NeuroAiEnvelope)


# core-schema-exempt: NeuroAI Lab simulation preview request; not reused outside this router
class SimulationPreviewRequest(BaseModel):
    patient_id: str | None = None
    baseline_events: list[PatientDataEvent] = Field(default_factory=list)
    proposed_intervention: InterventionPayload | None = None
    outcome_domains: list[str] = Field(default_factory=list)
    time_horizon_days: int = Field(default=90, ge=1, le=3650)
    evidence_context: str = ""


# core-schema-exempt: NeuroAI Lab simulation preview response; not reused outside this router
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
    db: Session = Depends(get_db_session),
) -> TimelinePreviewResponse:
    """Return chronological summary — decision-support only."""

    _audit_neuroai_attempt(
        db,
        actor,
        action="timeline_preview",
        patient_id=body.patient_id,
        meta={"event_count": len(body.events)},
    )
    tl = EventTimeline(body.events)
    summary = tl.create_patient_timeline_summary(body.patient_id)
    series = tl.produce_dashboard_series()
    return TimelinePreviewResponse(summary=summary, dashboard_series=series)


@router.post("/features/preview", response_model=FeaturesPreviewResponse)
def neuroai_features_preview(
    body: FeaturesPreviewRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FeaturesPreviewResponse:
    _audit_neuroai_attempt(
        db,
        actor,
        action="features_preview",
        patient_id=None,
        meta={"event_count": len(body.events)},
    )
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
    db: Session = Depends(get_db_session),
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
    _audit_neuroai_attempt(
        db,
        actor,
        action="simulation_preview",
        patient_id=body.patient_id,
        meta={
            "baseline_event_count": len(body.baseline_events),
            "has_proposed_intervention": body.proposed_intervention is not None,
            "time_horizon_days": body.time_horizon_days,
            "outcome_domain_count": len(body.outcome_domains),
        },
    )
    return SimulationPreviewResponse(result=result.model_dump(mode="json"))
