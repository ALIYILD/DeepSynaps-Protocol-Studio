"""Clinical Trials register router (launch-audit 2026-04-30).

Endpoints
---------
GET    /api/v1/clinical-trials/trials                           List trials (filters)
GET    /api/v1/clinical-trials/trials/summary                   Top counts
GET    /api/v1/clinical-trials/trials/export.csv                CSV export (DEMO prefix)
GET    /api/v1/clinical-trials/trials/export.ndjson             NDJSON export (DEMO meta)
GET    /api/v1/clinical-trials/trials/{id}                      Detail (with enrolments)
POST   /api/v1/clinical-trials/trials                           Create (must FK valid IRB protocol + real PI)
PATCH  /api/v1/clinical-trials/trials/{id}                      Update mutable fields (closed → 409)
POST   /api/v1/clinical-trials/trials/{id}/pause                Pause (note required)
POST   /api/v1/clinical-trials/trials/{id}/resume               Resume (note required)
POST   /api/v1/clinical-trials/trials/{id}/close                Close (note required, one-way)
POST   /api/v1/clinical-trials/trials/{id}/enrollments          Enrol patient (real Patient + same clinic)
POST   /api/v1/clinical-trials/trials/{id}/enrollments/{eid}/withdraw   Withdraw (reason required)
POST   /api/v1/clinical-trials/trials/audit-events              Page-level audit ingestion

Role gate
---------
``clinician`` minimum. Admins see all clinics; clinicians see only trials
that match their own ``clinic_id`` (or that they created when no clinic is
attached, covering demo / no-clinic flows).

Closure semantics
-----------------
Trials are **closeable but NOT reopenable** (this is the documented choice
distinct from IRB Manager protocols, which can reopen). Reopening a closed
trial would re-introduce statistical-power and data-integrity ambiguity
that regulators do not allow in practice; we surface this as a hard 409
on patch + close-twice attempts. If the underlying study is restarted, the
operator must register a new trial with its own NCT identifier.

Cross-surface drill-out
-----------------------
Trials carry their ``id``, ``irb_protocol_id``, ``pi_user_id``, ``nct_number``
so the frontend can navigate to: IRB Manager protocol detail, patients-hub
filtered by ``trial_id``, documents-hub filtered by ``source_target``,
adverse-events filtered by ``trial_id``, reports-hub filtered by ``trial_id``.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    ClinicalTrial,
    ClinicalTrialEnrollment,
    ClinicalTrialRevision,
    IRBProtocol,
    Patient,
    User,
)


_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/clinical-trials", tags=["Clinical Trials"])


# ── Constants ───────────────────────────────────────────────────────────────


ALLOWED_PHASES = {
    "i",
    "ii",
    "iii",
    "iv",
    "observational",
    "pilot",
    "feasibility",
    "registry",
}

ALLOWED_STATUSES = {
    "planning",
    "recruiting",
    "active",
    "paused",
    "completed",
    "terminated",
    "closed",
}

# Statuses that count as "open" — i.e. trials still mutable and accepting
# enrolments. Closed/completed/terminated are treated as terminal.
TERMINAL_STATUSES = {"closed", "completed", "terminated"}

ALLOWED_ENROLLMENT_STATUSES = {"active", "withdrawn", "completed", "lost_to_followup"}


CLINICAL_TRIALS_DISCLAIMERS = [
    "Clinical trials must reference an IRB-approved protocol and a real Principal Investigator.",
    "Closed trials are immutable and cannot be reopened — register a new trial if the study restarts.",
    "Withdrawn enrolments require a documented reason and are append-only.",
    "Demo rows are clearly marked and are NOT regulator-submittable.",
]


# ── Pydantic schemas ────────────────────────────────────────────────────────


class TrialSiteIn(BaseModel):
    id: Optional[str] = Field(default=None, max_length=64)
    name: str = Field(..., min_length=1, max_length=255)
    address: Optional[str] = Field(default=None, max_length=512)
    pi_user_id: Optional[str] = Field(default=None, max_length=64)


class EnrollmentOut(BaseModel):
    id: str
    trial_id: str
    patient_id: str
    patient_display_name: Optional[str] = None
    arm: Optional[str] = None
    status: str
    enrolled_at: str
    withdrawn_at: Optional[str] = None
    withdrawal_reason: Optional[str] = None
    enrolled_by: str
    consent_doc_id: Optional[str] = None


class TrialOut(BaseModel):
    id: str
    clinic_id: Optional[str] = None
    irb_protocol_id: str
    irb_protocol_title: Optional[str] = None
    irb_protocol_code: Optional[str] = None
    nct_number: Optional[str] = None
    title: str
    description: str = ""
    sponsor: Optional[str] = None
    pi_user_id: str
    pi_display_name: Optional[str] = None
    phase: Optional[str] = None
    status: str
    sites: list[dict] = Field(default_factory=list)
    enrollment_target: Optional[int] = None
    enrollment_actual: int = 0
    enrolled_active: int = 0
    enrolled_withdrawn: int = 0
    started_at: Optional[str] = None
    paused_at: Optional[str] = None
    pause_reason: Optional[str] = None
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    closure_note: Optional[str] = None
    is_demo: bool = False
    revision_count: int = 0
    created_at: str
    updated_at: str
    created_by: str
    payload_hash: Optional[str] = None


class TrialDetailOut(TrialOut):
    enrollments: list[EnrollmentOut] = Field(default_factory=list)


class TrialListResponse(BaseModel):
    items: list[TrialOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    disclaimers: list[str] = Field(
        default_factory=lambda: list(CLINICAL_TRIALS_DISCLAIMERS)
    )


class TrialSummaryResponse(BaseModel):
    total: int
    active: int
    recruiting: int
    paused: int
    closed: int
    completed: int
    terminated: int
    planning: int
    by_phase: dict[str, int] = Field(default_factory=dict)
    enrollment_open: int = 0  # status in {recruiting, active}
    sae_flagged: int = 0  # trials with at least one open adverse_event row
    pending_irb: int = 0  # trials whose linked IRB protocol is not active
    demo_rows: int = 0
    disclaimers: list[str] = Field(
        default_factory=lambda: list(CLINICAL_TRIALS_DISCLAIMERS)
    )


class TrialCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str = Field(default="", max_length=8000)
    irb_protocol_id: str = Field(..., min_length=1, max_length=64)
    nct_number: Optional[str] = Field(default=None, max_length=40)
    sponsor: Optional[str] = Field(default=None, max_length=255)
    pi_user_id: str = Field(..., min_length=1, max_length=64)
    phase: Optional[str] = None
    status: str = Field(default="planning")
    sites: list[TrialSiteIn] = Field(default_factory=list)
    enrollment_target: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    started_at: Optional[str] = Field(default=None, max_length=40)
    is_demo: bool = False


class TrialPatchIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=512)
    description: Optional[str] = Field(default=None, max_length=8000)
    nct_number: Optional[str] = Field(default=None, max_length=40)
    sponsor: Optional[str] = Field(default=None, max_length=255)
    pi_user_id: Optional[str] = Field(default=None, max_length=64)
    phase: Optional[str] = None
    status: Optional[str] = None
    sites: Optional[list[TrialSiteIn]] = None
    enrollment_target: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    note: Optional[str] = Field(default=None, max_length=2000)


class PauseResumeIn(BaseModel):
    note: str = Field(default="", max_length=4000)


class CloseIn(BaseModel):
    note: str = Field(default="", max_length=4000)


class EnrollmentIn(BaseModel):
    patient_id: str = Field(..., min_length=1, max_length=64)
    arm: Optional[str] = Field(default=None, max_length=120)
    consent_doc_id: Optional[str] = Field(default=None, max_length=64)


class WithdrawIn(BaseModel):
    reason: str = Field(default="", max_length=4000)


class TrialAuditEventIn(BaseModel):
    event: str = Field(..., max_length=120)
    trial_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=1024)
    using_demo_data: Optional[bool] = False


class TrialAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_role(actor: AuthenticatedActor) -> None:
    require_minimum_role(
        actor,
        "clinician",
        warnings=[
            "Clinical trial register visibility is restricted to clinical reviewers and admins.",
        ],
    )


def _apply_clinic_scope(q, actor: AuthenticatedActor):
    """Cross-clinic isolation. Admins see all; clinicians see trials whose
    ``clinic_id`` matches their own *or* that they created when no clinic is
    attached (demo / no-clinic case)."""
    if actor.role == "admin":
        return q
    if actor.clinic_id:
        return q.filter(
            or_(
                ClinicalTrial.clinic_id == actor.clinic_id,
                ClinicalTrial.created_by == actor.actor_id,
            )
        )
    return q.filter(ClinicalTrial.created_by == actor.actor_id)


def _isofmt(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        # SQLite roundtrip strips tzinfo; coerce to UTC honestly.
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        if "T" not in s:
            return datetime.fromisoformat(s + "T00:00:00+00:00")
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _payload_hash(record: ClinicalTrial) -> str:
    raw = "|".join(
        [
            record.id or "",
            record.title or "",
            record.irb_protocol_id or "",
            record.nct_number or "",
            record.pi_user_id or "",
            record.phase or "",
            record.status or "",
            record.sponsor or "",
            str(record.enrollment_target if record.enrollment_target is not None else ""),
            str(record.enrollment_actual or 0),
            _isofmt(record.created_at) or "",
            _isofmt(record.updated_at) or "",
            _isofmt(record.closed_at) or "",
            record.created_by or "",
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _resolve_pi_display(db: Session, pi_user_id: Optional[str]) -> Optional[str]:
    if not pi_user_id:
        return None
    user = db.query(User).filter(User.id == pi_user_id).first()
    if user is None:
        return None
    return user.display_name


def _validate_pi(db: Session, pi_user_id: Optional[str]) -> str:
    if not pi_user_id:
        raise ApiServiceError(
            code="invalid_pi",
            message="A Principal Investigator user_id is required.",
            status_code=422,
        )
    user = db.query(User).filter(User.id == pi_user_id).first()
    if user is None:
        raise ApiServiceError(
            code="invalid_pi",
            message=f"Principal Investigator '{pi_user_id}' is not a known user.",
            warnings=[
                "PIs must be real users — the trial register cannot accept "
                "free-form strings as accountable investigators.",
            ],
            status_code=422,
        )
    return pi_user_id


def _validate_irb_protocol(
    db: Session,
    actor: AuthenticatedActor,
    irb_protocol_id: Optional[str],
) -> IRBProtocol:
    if not irb_protocol_id:
        raise ApiServiceError(
            code="invalid_irb_protocol",
            message="An IRB protocol id is required.",
            status_code=422,
        )
    record = db.query(IRBProtocol).filter(IRBProtocol.id == irb_protocol_id).first()
    if record is None:
        raise ApiServiceError(
            code="invalid_irb_protocol",
            message=(
                f"IRB protocol '{irb_protocol_id}' is not registered. "
                "Trials must FK to a real IRB-approved protocol."
            ),
            warnings=[
                "Register the protocol via /api/v1/irb/protocols first.",
            ],
            status_code=422,
        )
    # Cross-clinic safety: a clinician cannot register a trial against an IRB
    # protocol owned by another clinic. Admins are exempt.
    if actor.role != "admin":
        actor_clinic = actor.clinic_id
        proto_clinic = record.clinic_id
        if proto_clinic and actor_clinic and proto_clinic != actor_clinic:
            raise ApiServiceError(
                code="invalid_irb_protocol",
                message=(
                    "IRB protocol belongs to a different clinic; cannot register a "
                    "trial against it."
                ),
                status_code=422,
            )
    return record


def _validate_phase(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    v = value.strip().lower()
    if v not in ALLOWED_PHASES:
        raise ApiServiceError(
            code="invalid_phase",
            message=f"phase must be one of: {sorted(ALLOWED_PHASES)}",
            status_code=422,
        )
    return v


def _validate_status(value: Optional[str]) -> str:
    if value is None or value == "":
        return "planning"
    v = value.strip().lower()
    if v not in ALLOWED_STATUSES:
        raise ApiServiceError(
            code="invalid_status",
            message=f"status must be one of: {sorted(ALLOWED_STATUSES)}",
            status_code=422,
        )
    return v


def _normalise_sites(sites: list[TrialSiteIn]) -> str:
    """JSON-serialise a list of sites, ensuring each has at least an ``id``."""
    out = []
    for s in sites:
        item = {
            "id": s.id or str(uuid.uuid4()),
            "name": s.name.strip()[:255],
        }
        if s.address:
            item["address"] = s.address.strip()[:512]
        if s.pi_user_id:
            item["pi_user_id"] = s.pi_user_id.strip()[:64]
        out.append(item)
    return json.dumps(out, separators=(",", ":"))


def _parse_sites(raw: Optional[str]) -> list[dict]:
    if not raw:
        return []
    try:
        val = json.loads(raw)
        return [s for s in val if isinstance(s, dict)]
    except (ValueError, TypeError):
        return []


def _enrollment_counts(db: Session, trial_id: str) -> tuple[int, int, int]:
    """Return (active, withdrawn, total)."""
    rows = (
        db.query(ClinicalTrialEnrollment)
        .filter(ClinicalTrialEnrollment.trial_id == trial_id)
        .all()
    )
    active = sum(1 for r in rows if r.status == "active")
    withdrawn = sum(1 for r in rows if r.status == "withdrawn")
    return active, withdrawn, len(rows)


def _revision_count(db: Session, trial_id: str) -> int:
    return (
        db.query(ClinicalTrialRevision)
        .filter(ClinicalTrialRevision.trial_id == trial_id)
        .count()
    )


def _resolve_patient_display(db: Session, patient_id: Optional[str]) -> Optional[str]:
    if not patient_id:
        return None
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if p is None:
        return None
    return f"{p.first_name} {p.last_name}".strip()


def _resolve_irb_protocol(
    db: Session, irb_protocol_id: Optional[str]
) -> Optional[IRBProtocol]:
    if not irb_protocol_id:
        return None
    return db.query(IRBProtocol).filter(IRBProtocol.id == irb_protocol_id).first()


def _to_out(
    record: ClinicalTrial,
    *,
    db: Session,
) -> TrialOut:
    proto = _resolve_irb_protocol(db, record.irb_protocol_id)
    active, withdrawn, _total = _enrollment_counts(db, record.id)
    return TrialOut(
        id=record.id,
        clinic_id=record.clinic_id,
        irb_protocol_id=record.irb_protocol_id or "",
        irb_protocol_title=getattr(proto, "title", None) if proto else None,
        irb_protocol_code=getattr(proto, "protocol_code", None) if proto else None,
        nct_number=record.nct_number,
        title=record.title or "",
        description=record.description or "",
        sponsor=record.sponsor,
        pi_user_id=record.pi_user_id or "",
        pi_display_name=_resolve_pi_display(db, record.pi_user_id),
        phase=record.phase,
        status=record.status or "planning",
        sites=_parse_sites(record.sites_json),
        enrollment_target=record.enrollment_target,
        enrollment_actual=record.enrollment_actual or 0,
        enrolled_active=active,
        enrolled_withdrawn=withdrawn,
        started_at=_isofmt(record.started_at),
        paused_at=_isofmt(record.paused_at),
        pause_reason=record.pause_reason,
        closed_at=_isofmt(record.closed_at),
        closed_by=record.closed_by,
        closure_note=record.closure_note,
        is_demo=bool(record.is_demo),
        revision_count=_revision_count(db, record.id),
        created_at=_isofmt(record.created_at) or "",
        updated_at=_isofmt(record.updated_at) or "",
        created_by=record.created_by or "",
        payload_hash=_payload_hash(record),
    )


def _enrollment_out(
    record: ClinicalTrialEnrollment,
    *,
    db: Session,
) -> EnrollmentOut:
    return EnrollmentOut(
        id=record.id,
        trial_id=record.trial_id,
        patient_id=record.patient_id,
        patient_display_name=_resolve_patient_display(db, record.patient_id),
        arm=record.arm,
        status=record.status or "active",
        enrolled_at=_isofmt(record.enrolled_at) or "",
        withdrawn_at=_isofmt(record.withdrawn_at),
        withdrawal_reason=record.withdrawal_reason,
        enrolled_by=record.enrolled_by or "",
        consent_doc_id=record.consent_doc_id,
    )


def _record_revision(
    db: Session,
    *,
    record: ClinicalTrial,
    actor: AuthenticatedActor,
    action: str,
    note: Optional[str] = None,
) -> None:
    snapshot = {
        "id": record.id,
        "title": record.title,
        "irb_protocol_id": record.irb_protocol_id,
        "nct_number": record.nct_number,
        "sponsor": record.sponsor,
        "pi_user_id": record.pi_user_id,
        "phase": record.phase,
        "status": record.status,
        "enrollment_target": record.enrollment_target,
        "enrollment_actual": record.enrollment_actual,
        "sites": _parse_sites(record.sites_json),
        "started_at": _isofmt(record.started_at),
        "paused_at": _isofmt(record.paused_at),
        "pause_reason": record.pause_reason,
        "closed_at": _isofmt(record.closed_at),
        "closed_by": record.closed_by,
        "closure_note": record.closure_note,
        "is_demo": bool(record.is_demo),
    }
    last = (
        db.query(ClinicalTrialRevision)
        .filter(ClinicalTrialRevision.trial_id == record.id)
        .order_by(ClinicalTrialRevision.revision_idx.desc())
        .first()
    )
    next_idx = (last.revision_idx + 1) if last is not None else 0
    db.add(
        ClinicalTrialRevision(
            trial_id=record.id,
            revision_idx=next_idx,
            action=action,
            snapshot_json=json.dumps(snapshot, separators=(",", ":")),
            actor_id=actor.actor_id,
            actor_role=actor.role,
            note=(note or "")[:2000] or None,
        )
    )


def _self_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str,
) -> None:
    """Best-effort audit hook — must never block the UI."""
    try:
        from app.repositories.audit import create_audit_event

        now = datetime.now(timezone.utc)
        event_id = (
            f"clinical_trials-{event}-{actor.actor_id}-{int(now.timestamp())}"
            f"-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type="clinical_trials",
            action=f"clinical_trials.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.debug("clinical_trials self-audit skipped", exc_info=True)


def _apply_filters(
    q,
    *,
    status: Optional[str],
    phase: Optional[str],
    site_id: Optional[str],
    pi_user_id: Optional[str],
    nct_number: Optional[str],
    irb_protocol_id: Optional[str],
    since: Optional[str],
    until: Optional[str],
    q_text: Optional[str],
):
    if status:
        s = status.strip().lower()
        if s in ALLOWED_STATUSES:
            q = q.filter(ClinicalTrial.status == s)
    if phase:
        p = phase.strip().lower()
        if p in ALLOWED_PHASES:
            q = q.filter(ClinicalTrial.phase == p)
    if pi_user_id:
        q = q.filter(ClinicalTrial.pi_user_id == pi_user_id)
    if nct_number:
        q = q.filter(ClinicalTrial.nct_number == nct_number.strip())
    if irb_protocol_id:
        q = q.filter(ClinicalTrial.irb_protocol_id == irb_protocol_id.strip())
    if since:
        dt = _parse_iso(since)
        if dt is not None:
            q = q.filter(ClinicalTrial.created_at >= dt)
    if until:
        upper_text = until + "T23:59:59" if "T" not in until else until
        dt = _parse_iso(upper_text)
        if dt is not None:
            q = q.filter(ClinicalTrial.created_at <= dt)
    if q_text:
        like = f"%{q_text.strip()}%"
        q = q.filter(
            or_(
                ClinicalTrial.title.like(like),
                ClinicalTrial.description.like(like),
                ClinicalTrial.nct_number.like(like),
                ClinicalTrial.sponsor.like(like),
            )
        )
    if site_id:
        # SQLite-portable substring filter on the JSON sites payload. Matches
        # any site whose embedded id equals the search term — good enough for
        # the regulator-credible drill-out without needing JSONB.
        sid = site_id.strip()
        like = f'%"id":"{sid}"%'
        q = q.filter(ClinicalTrial.sites_json.like(like))
    return q


# ── GET / (list) ────────────────────────────────────────────────────────────


@router.get("/trials", response_model=TrialListResponse)
def list_trials(
    status: Optional[str] = Query(default=None),
    phase: Optional[str] = Query(default=None),
    site_id: Optional[str] = Query(default=None),
    pi_user_id: Optional[str] = Query(default=None),
    nct_number: Optional[str] = Query(default=None),
    irb_protocol_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrialListResponse:
    _gate_role(actor)
    base = _apply_clinic_scope(db.query(ClinicalTrial), actor)
    filtered = _apply_filters(
        base,
        status=status,
        phase=phase,
        site_id=site_id,
        pi_user_id=pi_user_id,
        nct_number=nct_number,
        irb_protocol_id=irb_protocol_id,
        since=since,
        until=until,
        q_text=q,
    )
    total = filtered.count()
    rows = (
        filtered.order_by(ClinicalTrial.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [_to_out(r, db=db) for r in rows]

    _self_audit(
        db,
        actor,
        event="list_viewed",
        target_id="list",
        note=(
            f"status={status or '-'} phase={phase or '-'} site={site_id or '-'} "
            f"pi={pi_user_id or '-'} nct={nct_number or '-'} "
            f"q={(q or '-')[:80]} limit={limit} offset={offset} total={total}"
        ),
    )
    return TrialListResponse(items=items, total=total, limit=limit, offset=offset)


# ── GET /summary ────────────────────────────────────────────────────────────


@router.get("/trials/summary", response_model=TrialSummaryResponse)
def trials_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrialSummaryResponse:
    _gate_role(actor)
    rows = _apply_clinic_scope(db.query(ClinicalTrial), actor).all()
    total = len(rows)
    by_phase: Counter[str] = Counter()
    planning = recruiting = active = paused = closed = completed = terminated = 0
    enrollment_open = 0
    pending_irb = 0
    demo_rows = 0
    for r in rows:
        st = r.status or "planning"
        if st == "planning":
            planning += 1
        elif st == "recruiting":
            recruiting += 1
            enrollment_open += 1
        elif st == "active":
            active += 1
            enrollment_open += 1
        elif st == "paused":
            paused += 1
        elif st == "closed":
            closed += 1
        elif st == "completed":
            completed += 1
        elif st == "terminated":
            terminated += 1
        if r.phase:
            by_phase[r.phase] += 1
        if r.is_demo:
            demo_rows += 1
        proto = _resolve_irb_protocol(db, r.irb_protocol_id)
        if proto is None or (proto.status not in {"active", "reopened"}):
            pending_irb += 1

    # SAE-flagged: count trials linked to at least one open severe adverse-event
    # row. We probe the AdverseEvent table optimistically — if the table or
    # column shape doesn't match, we skip the count (regulator-honest empty).
    sae_flagged = 0
    try:
        from app.persistence.models import AdverseEvent

        for r in rows:
            ae_count = (
                db.query(AdverseEvent)
                .filter(getattr(AdverseEvent, "trial_id", None) == r.id)
                .filter(getattr(AdverseEvent, "severity", None).in_(["severe", "unexpected"]))
                .count()
                if hasattr(AdverseEvent, "trial_id")
                else 0
            )
            if ae_count > 0:
                sae_flagged += 1
    except Exception:  # pragma: no cover — keep summary honest
        sae_flagged = 0

    return TrialSummaryResponse(
        total=total,
        active=active,
        recruiting=recruiting,
        paused=paused,
        closed=closed,
        completed=completed,
        terminated=terminated,
        planning=planning,
        by_phase=dict(by_phase),
        enrollment_open=enrollment_open,
        sae_flagged=sae_flagged,
        pending_irb=pending_irb,
        demo_rows=demo_rows,
    )


# ── Exports ─────────────────────────────────────────────────────────────────


CSV_COLUMNS = [
    "id",
    "created_at",
    "updated_at",
    "irb_protocol_id",
    "irb_protocol_code",
    "nct_number",
    "title",
    "sponsor",
    "pi_user_id",
    "pi_display_name",
    "phase",
    "status",
    "enrollment_target",
    "enrollment_actual",
    "enrolled_active",
    "enrolled_withdrawn",
    "site_count",
    "started_at",
    "paused_at",
    "closed_at",
    "closed_by",
    "is_demo",
    "revision_count",
    "payload_hash",
]


def _filtered_rows_for_export(
    db: Session,
    actor: AuthenticatedActor,
    *,
    status: Optional[str],
    phase: Optional[str],
    site_id: Optional[str],
    pi_user_id: Optional[str],
    nct_number: Optional[str],
    irb_protocol_id: Optional[str],
    since: Optional[str],
    until: Optional[str],
    q_text: Optional[str],
) -> list[ClinicalTrial]:
    base = _apply_clinic_scope(db.query(ClinicalTrial), actor)
    filtered = _apply_filters(
        base,
        status=status,
        phase=phase,
        site_id=site_id,
        pi_user_id=pi_user_id,
        nct_number=nct_number,
        irb_protocol_id=irb_protocol_id,
        since=since,
        until=until,
        q_text=q_text,
    )
    return filtered.order_by(ClinicalTrial.created_at.desc()).limit(10_000).all()


@router.get("/trials/export.csv")
def export_trials_csv(
    status: Optional[str] = Query(default=None),
    phase: Optional[str] = Query(default=None),
    site_id: Optional[str] = Query(default=None),
    pi_user_id: Optional[str] = Query(default=None),
    nct_number: Optional[str] = Query(default=None),
    irb_protocol_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_role(actor)
    rows = _filtered_rows_for_export(
        db,
        actor,
        status=status,
        phase=phase,
        site_id=site_id,
        pi_user_id=pi_user_id,
        nct_number=nct_number,
        irb_protocol_id=irb_protocol_id,
        since=since,
        until=until,
        q_text=q,
    )
    has_demo = any(r.is_demo for r in rows)
    buf = io.StringIO()
    if has_demo:
        buf.write(
            "# DEMO — at least one row in this export is demo data and is "
            "NOT regulator-submittable.\n"
        )
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        proto = _resolve_irb_protocol(db, r.irb_protocol_id)
        active, withdrawn, _total = _enrollment_counts(db, r.id)
        sites = _parse_sites(r.sites_json)
        pi_display = _resolve_pi_display(db, r.pi_user_id) or ""
        writer.writerow(
            [
                r.id,
                _isofmt(r.created_at) or "",
                _isofmt(r.updated_at) or "",
                r.irb_protocol_id or "",
                getattr(proto, "protocol_code", None) or "" if proto else "",
                r.nct_number or "",
                (r.title or "").replace("\n", " "),
                (r.sponsor or "").replace("\n", " "),
                r.pi_user_id or "",
                pi_display,
                r.phase or "",
                r.status or "",
                r.enrollment_target if r.enrollment_target is not None else "",
                r.enrollment_actual or 0,
                active,
                withdrawn,
                len(sites),
                _isofmt(r.started_at) or "",
                _isofmt(r.paused_at) or "",
                _isofmt(r.closed_at) or "",
                r.closed_by or "",
                int(bool(r.is_demo)),
                _revision_count(db, r.id),
                _payload_hash(r),
            ]
        )
    _self_audit(
        db,
        actor,
        event="export_csv",
        target_id="list",
        note=f"rows={len(rows)} demo_rows={sum(1 for r in rows if r.is_demo)}",
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=clinical_trials.csv",
            "Cache-Control": "no-store",
            "X-Trial-Demo-Rows": str(sum(1 for r in rows if r.is_demo)),
        },
    )


@router.get("/trials/export.ndjson")
def export_trials_ndjson(
    status: Optional[str] = Query(default=None),
    phase: Optional[str] = Query(default=None),
    site_id: Optional[str] = Query(default=None),
    pi_user_id: Optional[str] = Query(default=None),
    nct_number: Optional[str] = Query(default=None),
    irb_protocol_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_role(actor)
    rows = _filtered_rows_for_export(
        db,
        actor,
        status=status,
        phase=phase,
        site_id=site_id,
        pi_user_id=pi_user_id,
        nct_number=nct_number,
        irb_protocol_id=irb_protocol_id,
        since=since,
        until=until,
        q_text=q,
    )
    has_demo = any(r.is_demo for r in rows)
    lines: list[str] = []
    if has_demo:
        lines.append(
            json.dumps(
                {
                    "_meta": "DEMO",
                    "warning": (
                        "At least one row in this export is demo data and is "
                        "NOT regulator-submittable."
                    ),
                },
                separators=(",", ":"),
            )
        )
    demo_rows = 0
    for r in rows:
        out = _to_out(r, db=db)
        if out.is_demo:
            demo_rows += 1
        lines.append(json.dumps(out.model_dump(), separators=(",", ":")))
    body = "\n".join(lines) + ("\n" if lines else "")
    _self_audit(
        db,
        actor,
        event="export_ndjson",
        target_id="list",
        note=f"rows={len(rows)} demo_rows={demo_rows}",
    )
    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": "attachment; filename=clinical_trials.ndjson",
            "Cache-Control": "no-store",
            "X-Trial-Demo-Rows": str(demo_rows),
        },
    )


# ── POST / (create) ──────────────────────────────────────────────────────────


@router.post("/trials", response_model=TrialOut, status_code=201)
def create_trial(
    payload: TrialCreateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrialOut:
    _gate_role(actor)
    proto = _validate_irb_protocol(db, actor, payload.irb_protocol_id)
    pi_user_id = _validate_pi(db, payload.pi_user_id)
    phase = _validate_phase(payload.phase)
    status = _validate_status(payload.status)
    started_at = _parse_iso(payload.started_at) if payload.started_at else None
    record = ClinicalTrial(
        id=str(uuid.uuid4()),
        clinic_id=actor.clinic_id,
        irb_protocol_id=proto.id,
        nct_number=(payload.nct_number or None),
        title=payload.title.strip()[:512],
        description=(payload.description or "").strip(),
        sponsor=(payload.sponsor or None),
        pi_user_id=pi_user_id,
        phase=phase,
        status=status,
        sites_json=_normalise_sites(payload.sites or []),
        enrollment_target=payload.enrollment_target,
        enrollment_actual=0,
        started_at=started_at,
        is_demo=bool(payload.is_demo),
        created_by=actor.actor_id,
    )
    db.add(record)
    db.flush()
    _record_revision(db, record=record, actor=actor, action="create")
    db.commit()
    db.refresh(record)
    _self_audit(
        db,
        actor,
        event="created",
        target_id=record.id,
        note=(
            f"phase={record.phase or '-'} status={record.status} "
            f"pi={record.pi_user_id} irb={record.irb_protocol_id} "
            + ("DEMO" if record.is_demo else "")
        ).strip(),
    )
    return _to_out(record, db=db)


# ── GET /{id} (detail) ──────────────────────────────────────────────────────


@router.get("/trials/{trial_id}", response_model=TrialDetailOut)
def get_trial(
    trial_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrialDetailOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(ClinicalTrial), actor)
        .filter(ClinicalTrial.id == trial_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="trial_not_found",
            message="Clinical trial not found or not visible at your role.",
            warnings=["Cross-clinic trials are hidden from non-admin roles."],
            status_code=404,
        )
    base = _to_out(record, db=db)
    enrollments = (
        db.query(ClinicalTrialEnrollment)
        .filter(ClinicalTrialEnrollment.trial_id == record.id)
        .order_by(ClinicalTrialEnrollment.enrolled_at.desc())
        .all()
    )
    _self_audit(
        db,
        actor,
        event="trial_viewed",
        target_id=record.id,
        note=f"status={record.status} phase={record.phase or '-'}",
    )
    return TrialDetailOut(
        **base.model_dump(),
        enrollments=[_enrollment_out(e, db=db) for e in enrollments],
    )


# ── PATCH /{id} ─────────────────────────────────────────────────────────────


@router.patch("/trials/{trial_id}", response_model=TrialOut)
def patch_trial(
    trial_id: str,
    payload: TrialPatchIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrialOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(ClinicalTrial), actor)
        .filter(ClinicalTrial.id == trial_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="trial_not_found",
            message="Clinical trial not found or not visible at your role.",
            status_code=404,
        )
    if record.status in TERMINAL_STATUSES:
        raise ApiServiceError(
            code="trial_immutable",
            message=(
                "Closed/completed/terminated trials are immutable. "
                "Register a new trial if the study restarts."
            ),
            status_code=409,
        )
    changed: list[str] = []
    if payload.title is not None:
        record.title = payload.title.strip()[:512]
        changed.append("title")
    if payload.description is not None:
        record.description = payload.description.strip()
        changed.append("description")
    if payload.nct_number is not None:
        record.nct_number = payload.nct_number or None
        changed.append("nct_number")
    if payload.sponsor is not None:
        record.sponsor = payload.sponsor or None
        changed.append("sponsor")
    if payload.pi_user_id is not None:
        record.pi_user_id = _validate_pi(db, payload.pi_user_id)
        changed.append("pi_user_id")
    if payload.phase is not None:
        record.phase = _validate_phase(payload.phase)
        changed.append("phase")
    if payload.status is not None:
        new_status = _validate_status(payload.status)
        if new_status in TERMINAL_STATUSES:
            raise ApiServiceError(
                code="use_terminal_endpoint",
                message=(
                    "Use POST /trials/{id}/close to close a trial (requires "
                    "sign-off note). Direct status='closed/completed/terminated' "
                    "via PATCH is rejected to preserve the audit trail."
                ),
                status_code=422,
            )
        if new_status == "paused" or new_status == "active":
            raise ApiServiceError(
                code="use_pause_resume_endpoint",
                message=(
                    "Use POST /trials/{id}/pause or /resume to change pause "
                    "state (requires note)."
                ),
                status_code=422,
            )
        record.status = new_status
        changed.append("status")
    if payload.sites is not None:
        record.sites_json = _normalise_sites(payload.sites)
        changed.append("sites")
    if payload.enrollment_target is not None:
        record.enrollment_target = payload.enrollment_target
        changed.append("enrollment_target")
    if not changed:
        raise ApiServiceError(
            code="empty_patch",
            message="No fields supplied for update.",
            status_code=422,
        )
    _record_revision(
        db,
        record=record,
        actor=actor,
        action="update",
        note=(payload.note or None) or ",".join(changed),
    )
    db.commit()
    db.refresh(record)
    _self_audit(
        db,
        actor,
        event="updated",
        target_id=record.id,
        note=f"changed={','.join(changed)}",
    )
    return _to_out(record, db=db)


# ── POST /{id}/pause ────────────────────────────────────────────────────────


@router.post("/trials/{trial_id}/pause", response_model=TrialOut)
def pause_trial(
    trial_id: str,
    payload: PauseResumeIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrialOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(ClinicalTrial), actor)
        .filter(ClinicalTrial.id == trial_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="trial_not_found",
            message="Clinical trial not found or not visible at your role.",
            status_code=404,
        )
    if record.status in TERMINAL_STATUSES:
        raise ApiServiceError(
            code="trial_immutable",
            message="Cannot pause a closed/completed/terminated trial.",
            status_code=409,
        )
    if record.status == "paused":
        raise ApiServiceError(
            code="trial_already_paused",
            message="Trial is already paused.",
            status_code=409,
        )
    if not (payload.note or "").strip():
        raise ApiServiceError(
            code="pause_note_required",
            message="A note is required when pausing a clinical trial.",
            warnings=[
                "Pauses without a note cannot be reviewed by a regulator.",
            ],
            status_code=422,
        )
    record.status = "paused"
    record.paused_at = datetime.now(timezone.utc)
    record.pause_reason = (payload.note or "").strip()[:4000]
    _record_revision(
        db, record=record, actor=actor, action="pause", note=record.pause_reason
    )
    db.commit()
    db.refresh(record)
    _self_audit(
        db,
        actor,
        event="paused",
        target_id=record.id,
        note=f"by={actor.actor_id}",
    )
    return _to_out(record, db=db)


# ── POST /{id}/resume ───────────────────────────────────────────────────────


@router.post("/trials/{trial_id}/resume", response_model=TrialOut)
def resume_trial(
    trial_id: str,
    payload: PauseResumeIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrialOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(ClinicalTrial), actor)
        .filter(ClinicalTrial.id == trial_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="trial_not_found",
            message="Clinical trial not found or not visible at your role.",
            status_code=404,
        )
    if record.status != "paused":
        raise ApiServiceError(
            code="trial_not_paused",
            message="Only paused trials can be resumed.",
            status_code=409,
        )
    if not (payload.note or "").strip():
        raise ApiServiceError(
            code="resume_note_required",
            message="A note is required when resuming a paused trial.",
            status_code=422,
        )
    record.status = "active"
    record.paused_at = None
    record.pause_reason = None
    _record_revision(
        db,
        record=record,
        actor=actor,
        action="resume",
        note=(payload.note or "").strip()[:2000],
    )
    db.commit()
    db.refresh(record)
    _self_audit(
        db,
        actor,
        event="resumed",
        target_id=record.id,
        note=(payload.note or "")[:200],
    )
    return _to_out(record, db=db)


# ── POST /{id}/close ────────────────────────────────────────────────────────


@router.post("/trials/{trial_id}/close", response_model=TrialOut)
def close_trial(
    trial_id: str,
    payload: CloseIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrialOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(ClinicalTrial), actor)
        .filter(ClinicalTrial.id == trial_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="trial_not_found",
            message="Clinical trial not found or not visible at your role.",
            status_code=404,
        )
    if record.status in TERMINAL_STATUSES:
        raise ApiServiceError(
            code="trial_already_closed",
            message="Trial is already closed/completed/terminated.",
            status_code=409,
        )
    if not (payload.note or "").strip():
        raise ApiServiceError(
            code="closure_note_required",
            message="A closure note is required when closing a clinical trial.",
            warnings=[
                "Closures without a note cannot be reviewed by a regulator. "
                "Record what closed the trial (study end, suspension, withdrawal).",
            ],
            status_code=422,
        )
    record.status = "closed"
    record.closed_at = datetime.now(timezone.utc)
    record.closed_by = actor.actor_id
    record.closure_note = (payload.note or "").strip()[:4000]
    _record_revision(
        db, record=record, actor=actor, action="close", note=record.closure_note
    )
    db.commit()
    db.refresh(record)
    _self_audit(
        db,
        actor,
        event="closed",
        target_id=record.id,
        note=f"signed_by={actor.actor_id}",
    )
    return _to_out(record, db=db)


# ── POST /{id}/enrollments ──────────────────────────────────────────────────


@router.post(
    "/trials/{trial_id}/enrollments",
    response_model=EnrollmentOut,
    status_code=201,
)
def create_enrollment(
    trial_id: str,
    payload: EnrollmentIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> EnrollmentOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(ClinicalTrial), actor)
        .filter(ClinicalTrial.id == trial_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="trial_not_found",
            message="Clinical trial not found or not visible at your role.",
            status_code=404,
        )
    if record.status in TERMINAL_STATUSES:
        raise ApiServiceError(
            code="trial_immutable",
            message="Cannot enrol patients in a closed/completed/terminated trial.",
            status_code=409,
        )
    if record.status == "paused":
        raise ApiServiceError(
            code="trial_paused",
            message="Cannot enrol patients in a paused trial. Resume first.",
            status_code=409,
        )
    # Validate patient: must be a real Patient row.
    patient = (
        db.query(Patient).filter(Patient.id == payload.patient_id).first()
    )
    if patient is None:
        raise ApiServiceError(
            code="invalid_patient",
            message=f"Patient '{payload.patient_id}' is not a known patient.",
            status_code=422,
        )
    # Same-clinic enforcement: the patient's owning clinician must share
    # the actor's clinic, OR the actor must own the patient. Admins exempt.
    if actor.role != "admin":
        # Patient's owning clinician's clinic_id (resolved via User table).
        owning = (
            db.query(User).filter(User.id == patient.clinician_id).first()
        )
        owning_clinic = getattr(owning, "clinic_id", None)
        if (
            actor.clinic_id
            and owning_clinic
            and owning_clinic != actor.clinic_id
            and patient.clinician_id != actor.actor_id
        ):
            raise ApiServiceError(
                code="patient_cross_clinic",
                message=(
                    "Patient is not in your clinic and was not created by you. "
                    "Cannot enrol cross-clinic patients."
                ),
                status_code=422,
            )
    # Reject duplicate enrolment of the same patient on the same trial.
    existing = (
        db.query(ClinicalTrialEnrollment)
        .filter(ClinicalTrialEnrollment.trial_id == record.id)
        .filter(ClinicalTrialEnrollment.patient_id == patient.id)
        .first()
    )
    if existing is not None:
        raise ApiServiceError(
            code="patient_already_enrolled",
            message=(
                f"Patient '{patient.id}' is already on the enrolment list for "
                f"this trial (enrollment_id={existing.id}, status={existing.status})."
            ),
            status_code=409,
        )
    enrollment = ClinicalTrialEnrollment(
        id=str(uuid.uuid4()),
        trial_id=record.id,
        patient_id=patient.id,
        arm=(payload.arm or None),
        status="active",
        enrolled_by=actor.actor_id,
        consent_doc_id=(payload.consent_doc_id or None),
    )
    db.add(enrollment)
    record.enrollment_actual = (record.enrollment_actual or 0) + 1
    _record_revision(
        db,
        record=record,
        actor=actor,
        action="enroll",
        note=f"patient={patient.id} arm={payload.arm or '-'}",
    )
    db.commit()
    db.refresh(enrollment)
    _self_audit(
        db,
        actor,
        event="enrolled",
        target_id=record.id,
        note=f"patient={patient.id} enrollment_id={enrollment.id}",
    )
    return _enrollment_out(enrollment, db=db)


# ── POST /{id}/enrollments/{eid}/withdraw ───────────────────────────────────


@router.post(
    "/trials/{trial_id}/enrollments/{enrollment_id}/withdraw",
    response_model=EnrollmentOut,
)
def withdraw_enrollment(
    trial_id: str,
    enrollment_id: str,
    payload: WithdrawIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> EnrollmentOut:
    _gate_role(actor)
    trial = (
        _apply_clinic_scope(db.query(ClinicalTrial), actor)
        .filter(ClinicalTrial.id == trial_id)
        .first()
    )
    if trial is None:
        raise ApiServiceError(
            code="trial_not_found",
            message="Clinical trial not found or not visible at your role.",
            status_code=404,
        )
    enrollment = (
        db.query(ClinicalTrialEnrollment)
        .filter(ClinicalTrialEnrollment.id == enrollment_id)
        .filter(ClinicalTrialEnrollment.trial_id == trial.id)
        .first()
    )
    if enrollment is None:
        raise ApiServiceError(
            code="enrollment_not_found",
            message="Enrollment row not found for this trial.",
            status_code=404,
        )
    if enrollment.status != "active":
        raise ApiServiceError(
            code="enrollment_not_active",
            message=(
                f"Cannot withdraw an enrolment whose status is "
                f"'{enrollment.status}'. Withdrawals are only allowed from active."
            ),
            status_code=409,
        )
    reason = (payload.reason or "").strip()
    if not reason:
        raise ApiServiceError(
            code="withdraw_reason_required",
            message="A withdrawal reason is required to maintain regulator audit trail.",
            status_code=422,
        )
    enrollment.status = "withdrawn"
    enrollment.withdrawn_at = datetime.now(timezone.utc)
    enrollment.withdrawal_reason = reason[:4000]
    _record_revision(
        db,
        record=trial,
        actor=actor,
        action="withdraw_enrollment",
        note=f"enrollment={enrollment.id} patient={enrollment.patient_id} reason={reason[:200]}",
    )
    db.commit()
    db.refresh(enrollment)
    _self_audit(
        db,
        actor,
        event="enrollment_withdrawn",
        target_id=trial.id,
        note=f"enrollment_id={enrollment.id} patient={enrollment.patient_id}",
    )
    return _enrollment_out(enrollment, db=db)


# ── POST /audit-events (page-level audit ingestion) ─────────────────────────


@router.post("/trials/audit-events", response_model=TrialAuditEventOut)
def record_clinical_trials_audit_event(
    payload: TrialAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrialAuditEventOut:
    _gate_role(actor)
    from app.repositories.audit import create_audit_event

    now = datetime.now(timezone.utc)
    event_id = (
        f"clinical_trials-{payload.event}-{actor.actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    target_id = payload.trial_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if payload.using_demo_data:
        note_parts.append("DEMO")
    if payload.trial_id:
        note_parts.append(f"trial={payload.trial_id}")
    if payload.note:
        note_parts.append(payload.note[:500])
    note = "; ".join(note_parts) or payload.event

    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type="clinical_trials",
            action=f"clinical_trials.{payload.event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception("clinical_trials audit-event persistence failed")
        return TrialAuditEventOut(accepted=False, event_id=event_id)
    return TrialAuditEventOut(accepted=True, event_id=event_id)
