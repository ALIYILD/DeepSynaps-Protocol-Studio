"""Movement Analyzer API — multimodal movement workspace (decision-support).

GET    /api/v1/movement/analyzer/patient/{patient_id}
POST   /api/v1/movement/analyzer/patient/{patient_id}/recompute
POST   /api/v1/movement/analyzer/patient/{patient_id}/annotation
GET    /api/v1/movement/analyzer/patient/{patient_id}/audit
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.repositories.patients import resolve_patient_clinic_id
from app.services.movement_analyzer import (
    append_audit,
    build_movement_workspace_payload,
    list_audit_events,
    load_snapshot,
    persist_snapshot,
)

router = APIRouter(prefix="/api/v1/movement/analyzer", tags=["Movement Analyzer"])


class RecomputeRequest(BaseModel):
    reason: Optional[str] = None


class AnnotationRequest(BaseModel):
    note: str = Field(..., min_length=1, max_length=8000)


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


@router.get("/patient/{patient_id}")
def get_movement_analyzer(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return Movement Analyzer workspace for the patient.

    Uses cached snapshot when fresh (same day UTC); otherwise recomputes.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from datetime import datetime, timezone

    snap = load_snapshot(patient_id, db)
    needs_fresh = True
    if snap and snap.get("generated_at"):
        try:
            gen = datetime.fromisoformat(snap["generated_at"].replace("Z", "+00:00"))
            if gen.tzinfo is None:
                gen = gen.replace(tzinfo=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - gen).total_seconds() / 3600
            if age_hours < 24:
                needs_fresh = False
        except (TypeError, ValueError):
            needs_fresh = True

    if needs_fresh or snap is None:
        payload = build_movement_workspace_payload(patient_id, db)
        persist_snapshot(patient_id, payload, db)
    else:
        payload = dict(snap)

    audit = list_audit_events(patient_id, db, limit=12)
    payload = dict(payload)
    payload["audit_tail"] = audit
    return payload


@router.post("/patient/{patient_id}/recompute")
def recompute_movement_analyzer(
    patient_id: str,
    body: RecomputeRequest | None = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Force rebuild of movement workspace and persist cache."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    payload = build_movement_workspace_payload(patient_id, db)
    persist_snapshot(patient_id, payload, db)
    append_audit(
        patient_id,
        "recompute",
        actor.actor_id,
        {"reason": (body.reason if body else None) or "manual"},
        db,
    )
    out = dict(payload)
    out["audit_tail"] = list_audit_events(patient_id, db, limit=12)
    return out


@router.post("/patient/{patient_id}/annotation")
def annotate_movement_analyzer(
    patient_id: str,
    body: AnnotationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Append clinician note to Movement Analyzer audit trail."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    append_audit(patient_id, "annotate", actor.actor_id, {"note": body.note}, db)
    return {"ok": True, "patient_id": patient_id}


@router.get("/patient/{patient_id}/audit")
def movement_analyzer_audit(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Paginated audit trail for Movement Analyzer."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    items = list_audit_events(patient_id, db, limit=100)
    return {"patient_id": patient_id, "items": items}
