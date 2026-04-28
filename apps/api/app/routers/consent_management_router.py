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
from app.persistence.models import ConsentRecord, Patient, User
from app.repositories.patients import resolve_patient_clinic_id


def _gate_patient_access(
    actor: AuthenticatedActor, patient_id: str | None, db: Session
) -> None:
    """Cross-clinic ownership gate — same shape as assessments_router."""
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _scope_consent_query_to_clinic(q, actor: AuthenticatedActor):
    """Restrict a ConsentRecord query to records the actor is allowed to see.

    Pre-fix this router used ``ConsentRecord.clinician_id == actor.actor_id``
    which over-restricts colleagues in the same clinic AND under-restricts
    admins (who skipped the filter and saw every clinic's consents). The
    canonical fix is to scope by the patient's owning clinic via a join
    on ``Patient`` -> ``User``. Admins are also scoped to their own
    ``actor.clinic_id`` so a clinic-A admin cannot read clinic-B consents.
    """
    if not getattr(actor, "clinic_id", None):
        # Actor without a clinic_id (e.g. solo demo) sees only their own
        # records — closest backward-compatible behaviour.
        return q.filter(ConsentRecord.clinician_id == actor.actor_id)
    return (
        q.join(Patient, Patient.id == ConsentRecord.patient_id)
        .join(User, User.id == Patient.clinician_id)
        .filter(User.clinic_id == actor.clinic_id)
    )

router = APIRouter(prefix="/api/v1/consent", tags=["Consent Management"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class ConsentCreate(BaseModel):
    patient_id: str = Field(..., max_length=64)
    # `consent_type` is matched against fixed strings on the clinician
    # side (general / off_label / research / data_sharing). 80 chars is
    # generous for any future variant.
    consent_type: str = Field(..., max_length=80)
    modality_slug: Optional[str] = Field(default=None, max_length=64)
    status: str = Field(default="active", max_length=32)
    signed: bool = False
    signed_at: Optional[str] = Field(default=None, max_length=64)
    expires_at: Optional[str] = Field(default=None, max_length=64)
    # `document_ref` may carry an S3 key or a URL; cap at 512 to match
    # other ref-style fields elsewhere in the codebase.
    document_ref: Optional[str] = Field(default=None, max_length=512)
    notes: Optional[str] = Field(default=None, max_length=4_000)


class ConsentUpdateRequest(BaseModel):
    signed: Optional[bool] = None
    signed_at: Optional[str] = Field(default=None, max_length=64)
    status: Optional[str] = Field(default=None, max_length=32)
    expires_at: Optional[str] = Field(default=None, max_length=64)
    document_ref: Optional[str] = Field(default=None, max_length=512)
    notes: Optional[str] = Field(default=None, max_length=4_000)


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
    name: str = Field(..., max_length=200)
    trigger: str = Field(..., max_length=80)
    action: str = Field(..., max_length=80)
    # Cap on the list and on each entry — uncapped would let an
    # authenticated clinician push megabyte-scale free-text into the
    # in-memory store via repeated calls.
    consent_types: list[str] = Field(default_factory=list, max_length=20)
    conditions_json: Optional[dict] = None
    active: bool = True
    notes: Optional[str] = Field(default=None, max_length=2_000)


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
    """Load a consent record, gated by the canonical cross-clinic check.

    Pre-fix this used ``record.clinician_id != actor.actor_id`` and
    ``actor.role != "admin"`` as the only gate, which under-restricted
    admins (clinic-A admin saw clinic-B records) and over-restricted
    clinic colleagues. Post-fix the patient's owning clinic must
    match the actor's via ``_gate_patient_access``.
    """
    record = db.query(ConsentRecord).filter_by(id=consent_id).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Consent record not found.", status_code=404)
    # ``_gate_patient_access`` raises ``cross_clinic_access_denied``
    # which would leak the existence of the row. Convert to the
    # generic 404 to match the pre-fix UX.
    try:
        _gate_patient_access(actor, record.patient_id, db)
    except ApiServiceError as exc:
        if exc.code in {"cross_clinic_access_denied", "forbidden"}:
            raise ApiServiceError(
                code="not_found",
                message="Consent record not found.",
                status_code=404,
            ) from exc
        raise
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
    # Clinic-scoped tenant isolation. Pre-fix admins skipped the
    # filter entirely and saw every clinic's consents.
    q = _scope_consent_query_to_clinic(db.query(ConsentRecord), actor)
    if patient_id:
        # When the caller asks for a specific patient, also enforce the
        # cross-clinic gate explicitly so the response is empty rather
        # than 403 — keeps UX consistent with other list endpoints.
        _gate_patient_access(actor, patient_id, db)
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
    # Cross-clinic gate — without this any clinician could create a
    # consent record for any patient_id (including patients in other
    # clinics), bypassing the consent's binding to the patient's
    # owning clinician. The handler still records ``clinician_id =
    # actor.actor_id`` so the consent is tied to the actor in audit
    # trails, but only after the actor's clinic_id is verified to
    # own the target patient.
    _gate_patient_access(actor, body.patient_id, db)

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
    q = _scope_consent_query_to_clinic(db.query(ConsentRecord), actor)
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
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
    q = _scope_consent_query_to_clinic(db.query(ConsentRecord), actor)
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
