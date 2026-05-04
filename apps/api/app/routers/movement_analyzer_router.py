"""Movement Analyzer API — multimodal movement workspace (decision-support).

GET    /api/v1/movement/analyzer/patient/{patient_id}
POST   /api/v1/movement/analyzer/patient/{patient_id}/recompute
POST   /api/v1/movement/analyzer/patient/{patient_id}/annotation
POST   /api/v1/movement/analyzer/patient/{patient_id}/review
GET    /api/v1/movement/analyzer/patient/{patient_id}/export.json
GET    /api/v1/movement/analyzer/patient/{patient_id}/audit
"""
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import Response
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


# core-schema-exempt: minimal router-local request body; not reused outside this router
class RecomputeRequest(BaseModel):
    reason: Optional[str] = None


# core-schema-exempt: minimal router-local request body; accepts {message} (frontend) or {note} (legacy); not reused outside this router
class AnnotationRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=8000)
    message: Optional[str] = Field(default=None, max_length=8000)

    def text(self) -> str:
        return (self.message or self.note or "").strip()


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class ReviewAckRequest(BaseModel):
    """Clinician attestation that the movement workspace was reviewed (audit only)."""

    note: str = Field(..., min_length=1, max_length=4000, description="Required review note / attestation.")


def _require_authenticated_clinician(actor: AuthenticatedActor) -> None:
    if actor.role == "guest" and actor.token_id is None:
        from app.errors import ApiServiceError

        raise ApiServiceError(
            code="auth_required",
            message="Authentication is required for this action.",
            status_code=401,
        )
    require_minimum_role(actor, "clinician")


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
    _require_authenticated_clinician(actor)
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
    _require_authenticated_clinician(actor)
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
    """Append clinician note to Movement Analyzer audit trail.

    Accepts either ``{message: str}`` (frontend contract from PR #452) or the
    legacy ``{note: str}`` field. At least one must be non-empty.
    """
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)

    text = body.text()
    if not text:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="annotation message required")

    append_audit(patient_id, "annotate", actor.actor_id, {"note": text, "message": text}, db)
    return {"ok": True, "patient_id": patient_id}


@router.post("/patient/{patient_id}/review")
def review_ack_movement_analyzer(
    patient_id: str,
    body: ReviewAckRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Record clinician review acknowledgment (audit trail only — not a clinical sign-off)."""
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)

    note = body.note.strip()
    append_audit(
        patient_id,
        "review_ack",
        actor.actor_id,
        {"note": note, "message": note, "kind": "movement_workspace_review"},
        db,
    )
    return {"ok": True, "patient_id": patient_id}


@router.get("/patient/{patient_id}/export.json")
def export_movement_analyzer_json(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """Download serialised workspace JSON for documentation (clinician scope only)."""
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)

    snap = load_snapshot(patient_id, db)
    if snap is None:
        payload = build_movement_workspace_payload(patient_id, db)
    else:
        payload = dict(snap)

    append_audit(
        patient_id,
        "export_download",
        actor.actor_id,
        {"message": "Movement workspace JSON export", "format": "json"},
        db,
    )

    from datetime import datetime, timezone

    bundle = {
        "export_meta": {
            "format": "movement_analyzer_workspace_v1",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "patient_id": patient_id,
            "disclaimer": (
                "Decision-support export for clinician review. Not a diagnosis, "
                "fall-risk determination, or treatment authorization."
            ),
        },
        "workspace": payload,
    }
    body = json.dumps(bundle, indent=2, default=str)
    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="movement-workspace-{patient_id[:8]}.json"',
        },
    )


@router.get("/patient/{patient_id}/audit")
def movement_analyzer_audit(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Paginated audit trail for Movement Analyzer."""
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)

    items = list_audit_events(patient_id, db, limit=100)
    return {"patient_id": patient_id, "items": items}
