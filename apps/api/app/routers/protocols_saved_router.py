from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import PrescribedProtocol

router = APIRouter(prefix="/api/v1/protocols/saved", tags=["protocols"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _decode_protocol_json(record: PrescribedProtocol) -> dict:
    try:
        return json.loads(record.protocol_json or "{}")
    except Exception:
        return {}


def _record_to_out(r: PrescribedProtocol) -> "SavedProtocolOut":
    proto = _decode_protocol_json(r)
    return SavedProtocolOut(
        id=r.id,
        patient_id=r.patient_id,
        clinician_id=r.clinician_id,
        protocol_id=proto.get("protocol_id"),
        name=proto.get("name", r.condition),
        condition=r.condition,
        device_slug=r.device,
        parameters_json=proto.get("parameters_json"),
        evidence_refs=proto.get("evidence_refs", []),
        governance_state=proto.get("governance_state", "draft"),
        clinician_notes=proto.get("clinician_notes"),
        modality=r.modality,
        status=r.status,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


# ── Schemas ────────────────────────────────────────────────────────────────────

class SavedProtocolCreate(BaseModel):
    patient_id: str
    protocol_id: Optional[str] = None
    name: Optional[str] = None
    condition: str
    modality: str = "tms"
    device_slug: Optional[str] = None
    parameters_json: Optional[dict] = None
    evidence_refs: list[str] = []
    governance_state: str = "draft"     # draft|submitted|approved|rejected
    clinician_notes: Optional[str] = None


class SavedProtocolUpdate(BaseModel):
    governance_state: Optional[str] = None   # draft|submitted|approved|rejected
    clinician_notes: Optional[str] = None
    name: Optional[str] = None
    parameters_json: Optional[dict] = None
    evidence_refs: Optional[list[str]] = None


class SavedProtocolOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    protocol_id: Optional[str]
    name: Optional[str]
    condition: str
    device_slug: Optional[str]
    modality: str
    parameters_json: Optional[dict]
    evidence_refs: list[str]
    governance_state: str
    clinician_notes: Optional[str]
    status: str
    created_at: str
    updated_at: str


class SavedProtocolListResponse(BaseModel):
    items: list[SavedProtocolOut]
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=SavedProtocolOut, status_code=201)
def create_saved_protocol(
    body: SavedProtocolCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SavedProtocolOut:
    """Save a protocol draft for a patient. Requires clinician role."""
    require_minimum_role(actor, "clinician")

    proto_meta = {
        "protocol_id": body.protocol_id,
        "name": body.name or body.condition,
        "parameters_json": body.parameters_json,
        "evidence_refs": body.evidence_refs,
        "governance_state": body.governance_state,
        "clinician_notes": body.clinician_notes,
    }

    record = PrescribedProtocol(
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        condition=body.condition,
        modality=body.modality,
        device=body.device_slug,
        protocol_json=json.dumps(proto_meta),
        status="active",
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _record_to_out(record)


@router.get("", response_model=SavedProtocolListResponse)
def list_saved_protocols(
    patient_id: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SavedProtocolListResponse:
    """List saved (prescribed) protocols for the authenticated clinician."""
    require_minimum_role(actor, "clinician")
    stmt = select(PrescribedProtocol).where(
        PrescribedProtocol.clinician_id == actor.actor_id
    )
    if patient_id:
        stmt = stmt.where(PrescribedProtocol.patient_id == patient_id)
    rows = session.scalars(stmt).all()
    items = [_record_to_out(r) for r in rows]
    return SavedProtocolListResponse(items=items, total=len(items))


@router.patch("/{protocol_id}", response_model=SavedProtocolOut)
def update_saved_protocol(
    protocol_id: str,
    body: SavedProtocolUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SavedProtocolOut:
    """Update governance_state, notes, or parameters for a saved protocol."""
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(PrescribedProtocol).where(
            PrescribedProtocol.id == protocol_id,
            PrescribedProtocol.clinician_id == actor.actor_id,
        )
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Saved protocol not found.", status_code=404)

    proto = _decode_protocol_json(record)

    if body.governance_state is not None:
        proto["governance_state"] = body.governance_state
    if body.clinician_notes is not None:
        proto["clinician_notes"] = body.clinician_notes
    if body.name is not None:
        proto["name"] = body.name
    if body.parameters_json is not None:
        proto["parameters_json"] = body.parameters_json
    if body.evidence_refs is not None:
        proto["evidence_refs"] = body.evidence_refs

    record.protocol_json = json.dumps(proto)
    record.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(record)
    return _record_to_out(record)
