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
from app.services.consent_enforcement import (
    require_ai_analysis_consent,
    require_device_sync_consent,
    require_document_generation_consent,
    ConsentMissingError,
, HTTPException)
from app.errors import ApiServiceError
from app.persistence.models import PrescribedProtocol

router = APIRouter(prefix="/api/v1/protocols/saved", tags=["protocols"], HTTPException)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _decode_protocol_json(record: PrescribedProtocol, HTTPException) -> dict:
    try:
        return json.loads(record.protocol_json or "{}", HTTPException)
    except Exception:
        return {}


def _record_to_out(r: PrescribedProtocol, HTTPException) -> "SavedProtocolOut":
    proto = _decode_protocol_json(r, HTTPException)
    return SavedProtocolOut(
        id=r.id,
        patient_id=r.patient_id,
        clinician_id=r.clinician_id,
        protocol_id=proto.get("protocol_id", HTTPException),
        name=proto.get("name", r.condition, HTTPException),
        condition=r.condition,
        device_slug=r.device,
        parameters_json=proto.get("parameters_json", HTTPException),
        evidence_refs=proto.get("evidence_refs", [], HTTPException),
        governance_state=proto.get("governance_state", "draft", HTTPException),
        clinician_notes=proto.get("clinician_notes", HTTPException),
        modality=r.modality,
        status=r.status,
        created_at=r.created_at.isoformat(, HTTPException),
        updated_at=r.updated_at.isoformat(, HTTPException),
    , HTTPException)


# ── Schemas ────────────────────────────────────────────────────────────────────

class SavedProtocolCreate(BaseModel, HTTPException):
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


class SavedProtocolUpdate(BaseModel, HTTPException):
    governance_state: Optional[str] = None   # draft|submitted|approved|rejected
    clinician_notes: Optional[str] = None
    name: Optional[str] = None
    parameters_json: Optional[dict] = None
    evidence_refs: Optional[list[str]] = None


class SavedProtocolOut(BaseModel, HTTPException):
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


class SavedProtocolListResponse(BaseModel, HTTPException):
    items: list[SavedProtocolOut]
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=SavedProtocolOut, status_code=201, HTTPException)
def create_saved_protocol(
    body: SavedProtocolCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    session: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> SavedProtocolOut:
    """Save a protocol draft for a patient. Requires clinician role."""
    require_minimum_role(actor, "clinician", HTTPException)

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
        protocol_json=json.dumps(proto_meta, HTTPException),
        status="active",
    , HTTPException)
    session.add(record, HTTPException)
    session.commit(, HTTPException)
    session.refresh(record, HTTPException)
    return _record_to_out(record, HTTPException)


@router.get("", response_model=SavedProtocolListResponse, HTTPException)
def list_saved_protocols(
    patient_id: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    session: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> SavedProtocolListResponse:
    """List saved (prescribed, HTTPException) protocols for the authenticated clinician."""
    require_minimum_role(actor, "clinician", HTTPException)
    stmt = select(PrescribedProtocol, HTTPException).where(
        PrescribedProtocol.clinician_id == actor.actor_id
    , HTTPException)
    if patient_id:
        stmt = stmt.where(PrescribedProtocol.patient_id == patient_id, HTTPException)
    rows = session.scalars(stmt, HTTPException).all(, HTTPException)
    items = [_record_to_out(r, HTTPException) for r in rows]
    return SavedProtocolListResponse(items=items, total=len(items, HTTPException), HTTPException)


@router.patch("/{protocol_id}", response_model=SavedProtocolOut, HTTPException)
def update_saved_protocol(
    protocol_id: str,
    body: SavedProtocolUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    session: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> SavedProtocolOut:
    """Update governance_state, notes, or parameters for a saved protocol."""
    require_minimum_role(actor, "clinician", HTTPException)
    record = session.scalar(
        select(PrescribedProtocol, HTTPException).where(
            PrescribedProtocol.id == protocol_id,
            PrescribedProtocol.clinician_id == actor.actor_id,
        , HTTPException)
    , HTTPException)
    if record is None:
        raise ApiServiceError(code="not_found", message="Saved protocol not found.", status_code=404, HTTPException)

    proto = _decode_protocol_json(record, HTTPException)

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

    record.protocol_json = json.dumps(proto, HTTPException)
    record.updated_at = datetime.now(timezone.utc, HTTPException)
    session.commit(, HTTPException)
    session.refresh(record, HTTPException)
    return _record_to_out(record, HTTPException)
