"""Category 12 specialized genomics router."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import Patient
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id
from app.services.consent_enforcement import ConsentMissingError, require_ai_analysis_consent
from app.services.knowledge.genetics_inventory import GeneticRegistry, get_genetic_registry
from app.services.knowledge.specialized_genomics_inventory import (
    SPECIALIZED_GENOMICS_DISCLAIMER,
    SpecializedGenomicsRegistry,
    get_specialized_genomics_registry,
    query_specialized_genomics,
    summarize_specialized_genomics_lifecycle,
)


router = APIRouter(prefix="/api/v1/specialized-genomics", tags=["Specialized Genomics"])


class SpecializedGenomicsQueryRequest(BaseModel):
    disease_focus: str = Field(..., min_length=1)
    gene_symbol: Optional[str] = None
    variant_id: Optional[str] = None
    modality: Optional[str] = None
    condition: Optional[str] = None
    patient_id: Optional[str] = None


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _require_specialized_genomics_consent(
    *,
    db: Session,
    actor: AuthenticatedActor,
    patient_id: str,
) -> None:
    try:
        require_ai_analysis_consent(db, patient_id, actor, ai_modality="genetics")
        return
    except ConsentMissingError:
        pass

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient and bool(getattr(patient, "consent_signed", False)):
        return

    raise ApiServiceError(
        code="consent_missing",
        message="ai_analysis consent required for patient-linked specialized genomics review.",
        status_code=403,
    )


def _audit(
    db: Session,
    *,
    actor: AuthenticatedActor,
    action: str,
    patient_id: str | None,
    note: str,
) -> None:
    now = datetime.now(timezone.utc)
    create_audit_event(
        db,
        event_id=f"specialized-genomics-{uuid.uuid4().hex[:16]}",
        target_id=patient_id or "specialized-genomics",
        target_type="specialized_genomics",
        action=action,
        role=actor.role,
        actor_id=actor.actor_id,
        note=note[:240],
        created_at=now.isoformat(),
    )


@router.get("/sources")
async def list_specialized_genomics_sources(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    registry: SpecializedGenomicsRegistry = Depends(get_specialized_genomics_registry),
    category2_registry: GeneticRegistry = Depends(get_genetic_registry),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    rows = registry.get_all_info(category2_registry=category2_registry)
    return {
        "total": len(rows),
        "sources": list(rows.values()),
        "decision_support_disclaimer": SPECIALIZED_GENOMICS_DISCLAIMER,
    }


@router.get("/sources/_lifecycle")
async def specialized_genomics_lifecycle(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    registry: SpecializedGenomicsRegistry = Depends(get_specialized_genomics_registry),
    category2_registry: GeneticRegistry = Depends(get_genetic_registry),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    summary = summarize_specialized_genomics_lifecycle(
        registry,
        category2_registry=category2_registry,
    )
    summary["decision_support_disclaimer"] = SPECIALIZED_GENOMICS_DISCLAIMER
    return summary


@router.post("/query")
async def specialized_genomics_query(
    body: SpecializedGenomicsQueryRequest = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
    registry: SpecializedGenomicsRegistry = Depends(get_specialized_genomics_registry),
    category2_registry: GeneticRegistry = Depends(get_genetic_registry),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    if body.patient_id:
        _gate_patient_access(actor, body.patient_id, db)
        _require_specialized_genomics_consent(
            db=db,
            actor=actor,
            patient_id=body.patient_id,
        )

    result = await query_specialized_genomics(
        specialized_registry=registry,
        category2_registry=category2_registry,
        disease_focus=body.disease_focus,
        gene_symbol=body.gene_symbol,
        variant_id=body.variant_id,
        modality=body.modality,
        condition=body.condition,
    )
    _audit(
        db,
        actor=actor,
        action="specialized_genomics.query",
        patient_id=body.patient_id,
        note=(
            f"focus={body.disease_focus}; gene={bool(body.gene_symbol)}; variant={bool(body.variant_id)}; "
            f"modality={body.modality or 'none'}"
        ),
    )
    return result
