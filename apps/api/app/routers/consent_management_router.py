"""Consent Management router (extended consent workflows).

Endpoints
---------
GET  /api/v1/consent/records                  — list all consent records
POST /api/v1/consent/records                  — create consent record
PUT  /api/v1/consent/records/{id}             — update (re-sign, revoke)
GET  /api/v1/consent/audit-log                — consent audit events
POST /api/v1/consent/automation-rules         — create automation rule
GET  /api/v1/consent/automation-rules         — list rules
POST /api/v1/consent/compliance-score         — compute compliance score
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import ConsentRecord

router = APIRouter(prefix="/api/v1/consent", tags=["Consent Management"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class ConsentCreate(BaseModel):
    patient_id: str
    consent_type: str               # general, off_label, research, data_sharing
    modality_slug: Optional[str] = None
    status: str = "active"          # active, withdrawn, expired
    signed: bool = False
    signed_at: Optional[str] = None
    expires_at: Optional[str] = None
    document_ref: Optional[str] = None
    notes: Optional[str] = None


class ConsentUpdateRequest(BaseModel):
    signed: Optional[bool] = None
    signed_at: Optional[str] = None
    status: Optional[str] = None    # active, withdrawn, expired
    expires_at: Optional[str] = None
    document_ref: Optional[str] = None
    notes: Optional[str] = None


class ConsentOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    consent_type: str
    modality_slug: Optional[str]
    status: str
    signed: bool
    signed_at: Optional[str]
    expires_at: Optional[str]
    document_ref: Optional[str]
    notes: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: ConsentRecord) -> "ConsentOut":
        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            consent_type=r.consent_type,
            modality_slug=r.modality_slug,
            status=getattr(r, "status", "active") or "active",
            signed=r.signed,
            signed_at=_dt(r.signed_at),
            expires_at=_dt(getattr(r, "expires_at", None)),
            document_ref=r.document_ref,
            notes=r.notes,
            created_at=_dt(r.created_at),
        )


class ConsentListResponse(BaseModel):
    items: list[ConsentOut]
    total: int


class ConsentAuditEvent(BaseModel):
    event_id: str
    record_id: str
    patient_id: str
    clinician_id: str
    action: str          # created, signed, revoked, expired, updated
    details: Optional[str]
    occurred_at: str


class ConsentAuditLogResponse(BaseModel):
    items: list[ConsentAuditEvent]
    total: int


class AutomationRuleCreate(BaseModel):
    name: str
    trigger: str            # e.g. "off_label_treatment_start", "annual_renewal", "new_modality"
    action: str             # e.g. "send_reminder", "auto_expire", "require_resign"
    consent_types: list[str] = []
    conditions_json: Optional[dict] = None
    active: bool = True
    notes: Optional[str] = None


class AutomationRuleOut(BaseModel):
    id: str
    name: str
    trigger: str
    action: str
    consent_types: list[str]
    conditions: Optional[dict]
    active: bool
    notes: Optional[str]
    created_at: str


class ComplianceScoreRequest(BaseModel):
    consent_types: Optional[list[str]] = None  # filter to specific types; None = all


class ComplianceScoreResponse(BaseModel):
    total_patients_with_consent: int
    total_patients_active_signed: int
    compliance_pct: float
    breakdown: dict[str, int]   # consent_type -> count


# ── In-memory automation rules store (V1 — no DB table needed yet) ─────────────
_automation_rules: list[dict] = []
_automation_rules_counter = 0


def _next_rule_id() -> str:
    import uuid
    return str(uuid.uuid4())


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_iso(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value.rstrip("Z"))
    except ValueError:
        return None


def _get_consent_or_404(db: Session, consent_id: str, actor: AuthenticatedActor) -> ConsentRecord:
    record = db.query(ConsentRecord).filter_by(id=consent_id).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Consent record not found.", status_code=404)
    if actor.role != "admin" and record.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Consent record not found.", status_code=404)
    return record


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/records", response_model=ConsentListResponse, operation_id="consent_list_records")
def list_consent_records(
    patient_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    consent_type: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(ConsentRecord)
    if actor.role != "admin":
        q = q.filter(ConsentRecord.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(ConsentRecord.patient_id == patient_id)
    if status:
        q = q.filter(ConsentRecord.status == status)
    if consent_type:
        q = q.filter(ConsentRecord.consent_type == consent_type)
    records = q.order_by(ConsentRecord.created_at.desc()).all()
    items = [ConsentOut.from_record(r) for r in records]
    return ConsentListResponse(items=items, total=len(items))


@router.post("/records", response_model=ConsentOut, status_code=201, operation_id="consent_create_record")
def create_consent_record(
    body: ConsentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentOut:
    require_minimum_role(actor, "clinician")
    signed_at: Optional[datetime] = None
    if body.signed_at:
        signed_at = _parse_iso(body.signed_at)
    elif body.signed:
        signed_at = datetime.now(timezone.utc)
    expires_at: Optional[datetime] = _parse_iso(body.expires_at) if body.expires_at else None

    record = ConsentRecord(
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        consent_type=body.consent_type.strip(),
        modality_slug=body.modality_slug,
        status=body.status,
        signed=body.signed,
        signed_at=signed_at,
        expires_at=expires_at,
        document_ref=body.document_ref,
        notes=body.notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return ConsentOut.from_record(record)


@router.put("/records/{consent_id}", response_model=ConsentOut)
def update_consent_record(
    consent_id: str,
    body: ConsentUpdateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentOut:
    require_minimum_role(actor, "clinician")
    record = _get_consent_or_404(db, consent_id, actor)

    if body.signed is not None:
        record.signed = body.signed
        if body.signed and record.signed_at is None and body.signed_at is None:
            record.signed_at = datetime.now(timezone.utc)
    if body.signed_at is not None:
        record.signed_at = _parse_iso(body.signed_at)
    if body.status is not None:
        record.status = body.status
    if body.expires_at is not None:
        record.expires_at = _parse_iso(body.expires_at)
    if body.document_ref is not None:
        record.document_ref = body.document_ref
    if body.notes is not None:
        record.notes = body.notes

    db.commit()
    db.refresh(record)
    return ConsentOut.from_record(record)


@router.get("/audit-log", response_model=ConsentAuditLogResponse)
def get_consent_audit_log(
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentAuditLogResponse:
    """Returns a synthesized audit log from consent records (V1: derived from records)."""
    require_minimum_role(actor, "clinician")
    q = db.query(ConsentRecord)
    if actor.role != "admin":
        q = q.filter(ConsentRecord.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(ConsentRecord.patient_id == patient_id)
    records = q.order_by(ConsentRecord.created_at.desc()).all()

    events: list[ConsentAuditEvent] = []
    for r in records:
        def _dt(v) -> str:
            if v is None:
                return r.created_at.isoformat() if isinstance(r.created_at, datetime) else str(r.created_at)
            return v.isoformat() if isinstance(v, datetime) else str(v)
        # creation event
        events.append(ConsentAuditEvent(
            event_id=f"{r.id}:created",
            record_id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            action="created",
            details=f"Consent type: {r.consent_type}",
            occurred_at=_dt(r.created_at),
        ))
        # sign event
        if r.signed and r.signed_at:
            events.append(ConsentAuditEvent(
                event_id=f"{r.id}:signed",
                record_id=r.id,
                patient_id=r.patient_id,
                clinician_id=r.clinician_id,
                action="signed",
                details=None,
                occurred_at=_dt(r.signed_at),
            ))
        # revoked / expired
        if r.status in ("withdrawn", "expired"):
            events.append(ConsentAuditEvent(
                event_id=f"{r.id}:{r.status}",
                record_id=r.id,
                patient_id=r.patient_id,
                clinician_id=r.clinician_id,
                action=r.status,
                details=None,
                occurred_at=_dt(r.expires_at or r.created_at),
            ))

    return ConsentAuditLogResponse(items=events, total=len(events))


@router.post("/automation-rules", response_model=AutomationRuleOut, status_code=201)
def create_automation_rule(
    body: AutomationRuleCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AutomationRuleOut:
    require_minimum_role(actor, "clinician")
    rule = {
        "id": _next_rule_id(),
        "name": body.name.strip(),
        "trigger": body.trigger,
        "action": body.action,
        "consent_types": body.consent_types,
        "conditions": body.conditions_json,
        "active": body.active,
        "notes": body.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": actor.actor_id,
    }
    _automation_rules.append(rule)
    return AutomationRuleOut(
        id=rule["id"],
        name=rule["name"],
        trigger=rule["trigger"],
        action=rule["action"],
        consent_types=rule["consent_types"],
        conditions=rule["conditions"],
        active=rule["active"],
        notes=rule["notes"],
        created_at=rule["created_at"],
    )


@router.get("/automation-rules", response_model=list[AutomationRuleOut])
def list_automation_rules(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[AutomationRuleOut]:
    require_minimum_role(actor, "clinician")
    return [
        AutomationRuleOut(
            id=r["id"],
            name=r["name"],
            trigger=r["trigger"],
            action=r["action"],
            consent_types=r["consent_types"],
            conditions=r["conditions"],
            active=r["active"],
            notes=r["notes"],
            created_at=r["created_at"],
        )
        for r in _automation_rules
    ]


@router.post("/compliance-score", response_model=ComplianceScoreResponse)
def compute_compliance_score(
    body: ComplianceScoreRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ComplianceScoreResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(ConsentRecord)
    if actor.role != "admin":
        q = q.filter(ConsentRecord.clinician_id == actor.actor_id)
    if body.consent_types:
        q = q.filter(ConsentRecord.consent_type.in_(body.consent_types))

    all_records = q.all()
    patient_ids_total = {r.patient_id for r in all_records}
    active_signed = {r.patient_id for r in all_records if r.signed and r.status == "active"}

    breakdown: dict[str, int] = {}
    for r in all_records:
        if r.signed and r.status == "active":
            breakdown[r.consent_type] = breakdown.get(r.consent_type, 0) + 1

    total_total = len(patient_ids_total)
    total_active = len(active_signed)
    pct = round((total_active / total_total * 100) if total_total > 0 else 0.0, 1)

    return ComplianceScoreResponse(
        total_patients_with_consent=total_total,
        total_patients_active_signed=total_active,
        compliance_pct=pct,
        breakdown=breakdown,
    )
