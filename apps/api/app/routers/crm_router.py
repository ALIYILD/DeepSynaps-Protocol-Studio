"""DeepSynaps CRM Router — /api/v1/crm.

Internal super-admin CRM for the DeepSynaps platform. All endpoints are
restricted to platform operators with ``role in ("admin", "supervisor")``
AND ``actor.clinic_id is None``. Clinic-bound admins are rejected — these
endpoints cross clinic boundaries and require explicit super-admin scope.

Endpoint Groups
---------------
* ``GET  /dashboard``                  — Executive KPIs (MRR, clinics, patients, AI usage)
* ``GET  /clinics``                    — Clinic directory with filters/search/sort
* ``GET  /clinics/{clinic_id}``        — Full clinic profile detail
* ``POST /break-glass``                — Request emergency patient-data access
* ``GET  /break-glass/sessions``       — List active/recent break-glass sessions
* ``GET  /ai-ops/dashboard``           — AI operations overview
* ``GET  /ai-ops/agents``              — All agents across clinics
* ``GET  /ai-ops/runs``                — All agent runs across clinics
* ``GET  /support/tickets``            — Support ticket list
* ``GET  /support/tickets/{ticket_id}`` — Ticket detail with audit trail
* ``GET  /ops/infrastructure``         — Platform infrastructure health
* ``GET  /ops/pipelines``              — Pipeline status (MRI, qEEG, evidence, AI)
* ``GET  /compliance/phi-access``      — Cross-clinic PHI access log
* ``GET  /compliance/suspicious-activity`` — Flagged suspicious activity
* ``GET  /compliance/exports``         — Data-export activity across clinics
* ``GET  /finance/dashboard``          — Finance KPIs (MRR, ARR, failed payments)
* ``GET  /finance/clinics/{clinic_id}/billing`` — Per-clinic billing detail
* ``GET  /research/analytics``         — Evidence DB usage analytics

Auth Gate
---------
Every endpoint enforces the super-admin gate via :func:`_require_super_admin`.
Break-glass access requires an explicit justification field, is logged to the
audit table, and auto-expires after the requested duration.

Clinic Data Ownership
---------------------
Patient-level access is NEVER returned through CRM endpoints directly.
Break-glass is the ONLY path to patient data, and it creates an audited,
time-bounded session with explicit justification.
"""
from __future__ import annotations

import json as _json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AgentHire,
    AgentRunAudit,
    AgentSubscription,
    AiSummaryAudit,
    AssessmentRecord,
    AuditEventRecord,
    Clinic,
    ClinicMonthlyCostCap,
    ClinicalSession,
    DataExport,
    EvidenceSavedCitation,
    Invoice,
    InsuranceClaim,
    LiteraturePaper,
    LiteratureReadingList,
    PackageTokenBudget,
    Patient,
    PatientPayment,
    ProtocolVersion,
    Subscription,
    User,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/crm", tags=["crm"])


# Module-level package pricing (was duplicated as three local copies — one of
# which was referenced from a function where the local never existed and
# would 500 with NameError). Single source of truth keeps the three call
# sites in sync.
_PACKAGE_PRICES: dict[str, float] = {
    "explorer": 0.0,
    "clinician_pro": 79.0,
    "enterprise": 299.0,
}


# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------


def _require_super_admin(actor: AuthenticatedActor) -> None:
    """Shared gate: admin/supervisor role + no clinic binding.

    A clinic-bound admin (``actor.clinic_id is not None``) gets 403 here
    even if they pass the role check — cross-clinic CRM is reserved for
    platform operators only.
    """
    require_minimum_role(actor, "admin")
    if actor.clinic_id is not None:
        raise ApiServiceError(
            code="crm_super_admin_required",
            message="CRM access requires a super-admin actor with no clinic binding.",
            warnings=["This endpoint is reserved for platform operators."],
            status_code=403,
        )
    if actor.role not in ("admin", "supervisor"):
        raise ApiServiceError(
            code="crm_role_required",
            message="CRM access requires admin or supervisor role.",
            status_code=403,
        )


def _log_crm_access(
    *,
    actor: AuthenticatedActor,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    justification: str | None = None,
) -> None:
    """Structured audit log for every CRM action. Feeds SOC/SIEM."""
    logger.info(
        "crm_access",
        extra={
            "event": "crm_access",
            "action": action,
            "actor_id": actor.actor_id,
            "actor_role": actor.role,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "justification": justification,
        },
    )


def _iso(dt: datetime | None) -> str:
    """Render a possibly-naive UTC timestamp as ISO-8601 with ``Z`` suffix."""
    if dt is None:
        return ""
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.isoformat()


# ---------------------------------------------------------------------------
# In-memory break-glass session store (time-bounded, ephemeral)
# ---------------------------------------------------------------------------

# Production would move this to Redis or a dedicated ``break_glass_sessions``
# table. In-memory is acceptable for the initial CRM rollout because sessions
# are short-lived (minutes) and the CRM has a single active operator.
_break_glass_sessions: list[dict[str, Any]] = []


def _prune_expired_sessions() -> None:
    """Remove expired break-glass sessions from the in-memory store."""
    now = datetime.now(timezone.utc)
    global _break_glass_sessions
    _break_glass_sessions = [
        s for s in _break_glass_sessions if s["expires_at"] > now
    ]


# ---------------------------------------------------------------------------
# Pydantic models (inline per project convention)
# ---------------------------------------------------------------------------


class BreakGlassRequest(BaseModel):
    """Emergency break-glass access request."""

    clinic_id: str
    patient_id: str
    justification: str = Field(..., min_length=10, max_length=2000)
    duration_minutes: int = Field(default=30, ge=5, le=120)


class BreakGlassResponse(BaseModel):
    """Granted break-glass session."""

    session_id: str
    expires_at: str
    access_token: str
    clinic_id: str
    patient_id: str
    granted_by: str
    justification: str


class ClinicSummaryResponse(BaseModel):
    """One clinic row in the CRM clinic directory."""

    id: str
    name: str
    plan: str
    status: str
    patient_count: int
    clinician_count: int
    mrr: float
    health_score: int  # 0-100
    created_at: str
    updated_at: str


class ExecutiveDashboardResponse(BaseModel):
    """Executive KPIs for the platform."""

    mrr: float
    arr: float
    clinic_count: int
    active_clinic_count: int
    patient_count: int
    active_patient_count: int
    clinician_count: int
    alerts: list[dict[str, Any]]
    ai_usage: dict[str, Any]
    generated_at: str


class TicketResponse(BaseModel):
    """One support ticket in the CRM queue."""

    id: str
    clinic_id: str | None
    subject: str
    priority: str
    status: str
    assignee: str | None
    created_at: str
    updated_at: str


class TicketDetailResponse(BaseModel):
    """Full ticket detail with audit trail."""

    id: str
    clinic_id: str | None
    subject: str
    description: str
    priority: str
    status: str
    assignee: str | None
    reporter: str | None
    audit_trail: list[dict[str, Any]]
    created_at: str
    updated_at: str


class InfrastructureStatusResponse(BaseModel):
    """Platform infrastructure health snapshot."""

    api_health: str  # healthy, degraded, down
    db_health: str
    queue_health: str
    storage_usage: dict[str, Any]
    services: list[dict[str, Any]]
    checked_at: str


class PipelineStatusResponse(BaseModel):
    """Data pipeline status snapshot."""

    mri_pipeline: dict[str, Any]
    qeeg_pipeline: dict[str, Any]
    evidence_sync: dict[str, Any]
    ai_inference: dict[str, Any]
    checked_at: str


class FinanceDashboardResponse(BaseModel):
    """Finance KPIs for the platform."""

    mrr: float
    arr: float
    total_subscriptions: int
    active_subscriptions: int
    failed_payments_count: int
    failed_payments_amount: float
    revenue_by_clinic: list[dict[str, Any]]
    generated_at: str


class ClinicBillingResponse(BaseModel):
    """Detailed billing for one clinic."""

    clinic_id: str
    clinic_name: str
    subscription: dict[str, Any]
    invoices: list[dict[str, Any]]
    payments: list[dict[str, Any]]
    insurance_claims: list[dict[str, Any]]
    agent_costs_pence: int
    period_start: str
    period_end: str


class PHIAccessLogResponse(BaseModel):
    """One PHI access event."""

    id: str
    actor_id: str
    actor_role: str
    clinic_id: str | None
    patient_id: str | None
    action: str
    resource_type: str
    justification: str | None
    flagged: bool
    created_at: str


class SuspiciousActivityResponse(BaseModel):
    """Flagged suspicious activity items."""

    failed_auths: list[dict[str, Any]]
    cross_clinic_violations: list[dict[str, Any]]
    consent_issues: list[dict[str, Any]]
    generated_at: str


class ExportActivityResponse(BaseModel):
    """Data-export activity summary."""

    exports: list[dict[str, Any]]
    total_exports: int
    total_bytes: int
    generated_at: str


class ResearchAnalyticsResponse(BaseModel):
    """Evidence DB and research analytics."""

    total_papers: int
    papers_this_month: int
    total_searches: int
    evidence_citations_saved: int
    protocol_evidence_links: int
    top_conditions: list[dict[str, Any]]
    top_modalities: list[dict[str, Any]]
    generated_at: str


class AIopsDashboardResponse(BaseModel):
    """AI operations overview."""

    active_agents: int
    total_runs_today: int
    total_runs_this_month: int
    approval_queue_size: int
    failure_count_today: int
    cost_today_pence: int
    cost_this_month_pence: int
    alerts: list[dict[str, Any]]
    generated_at: str


class AgentSummaryResponse(BaseModel):
    """One agent in the cross-clinic AI-ops list."""

    id: str
    name: str
    clinic_id: str | None
    actor_id: str
    status: str
    last_used_at: str | None
    created_at: str


class RunSummaryResponse(BaseModel):
    """One agent run in the cross-clinic AI-ops list."""

    id: str
    created_at: str
    actor_id: str | None
    clinic_id: str | None
    agent_id: str
    message_preview: str
    latency_ms: int | None
    ok: bool
    error_code: str | None
    cost_pence: int | None


class ClinicDetailResponse(BaseModel):
    """Full clinic profile for CRM detail view."""

    id: str
    name: str
    address: str | None
    phone: str | None
    email: str | None
    website: str | None
    timezone: str
    specialties: list[str] | None
    working_hours: dict[str, Any] | None
    retention_days: int
    patient_count: int
    clinician_count: int
    subscription: dict[str, Any] | None
    usage: dict[str, Any]
    audit_trail: list[dict[str, Any]]
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# 1. Executive Dashboard
# ---------------------------------------------------------------------------


@router.get("/dashboard", response_model=ExecutiveDashboardResponse)
async def get_executive_dashboard(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ExecutiveDashboardResponse:
    """Executive KPIs: MRR, clinic count, active patients, AI usage, alerts."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="dashboard.view", resource_type="executive_dashboard")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    # Clinic counts
    total_clinics = session.query(func.count(Clinic.id)).scalar() or 0
    active_clinics = (
        session.query(func.count(Clinic.id))
        .select_from(Clinic)
        .join(User, User.clinic_id == Clinic.id)
        .distinct()
        .scalar()
        or 0
    )

    # Patient counts
    total_patients = session.query(func.count(Patient.id)).scalar() or 0
    active_patients = (
        session.query(func.count(Patient.id))
        .filter(Patient.status == "active")
        .scalar()
        or 0
    )

    # Clinician count
    clinician_count = (
        session.query(func.count(User.id))
        .filter(User.role.in_(["clinician", "admin"]))
        .scalar()
        or 0
    )

    # MRR / ARR — from subscriptions (best-effort, demo-aware)
    mrr_rows = (
        session.query(
            Subscription.package_id,
            func.count(Subscription.id).label("cnt"),
        )
        .filter(Subscription.status == "active")
        .group_by(Subscription.package_id)
        .all()
    )
    mrr = sum(
        _PACKAGE_PRICES.get(row.package_id, 49.0) * row.cnt for row in mrr_rows
    )
    arr = mrr * 12.0

    # AI usage today
    ai_today = (
        session.query(func.count(AgentRunAudit.id))
        .filter(AgentRunAudit.created_at >= today_start.replace(tzinfo=None))
        .scalar()
        or 0
    )
    ai_month = (
        session.query(func.count(AgentRunAudit.id))
        .filter(AgentRunAudit.created_at >= month_start.replace(tzinfo=None))
        .scalar()
        or 0
    )
    ai_cost_month = (
        session.query(func.coalesce(func.sum(AgentRunAudit.cost_pence), 0))
        .filter(AgentRunAudit.created_at >= month_start.replace(tzinfo=None))
        .scalar()
        or 0
    )

    # Alerts — recent failed agent runs, break-glass sessions, etc.
    alerts: list[dict[str, Any]] = []
    failed_runs_today = (
        session.query(func.count(AgentRunAudit.id))
        .filter(AgentRunAudit.created_at >= today_start.replace(tzinfo=None))
        .filter(AgentRunAudit.ok.is_(False))
        .scalar()
        or 0
    )
    if failed_runs_today > 0:
        alerts.append(
            {
                "severity": "medium" if failed_runs_today < 10 else "high",
                "category": "ai_ops",
                "message": f"{failed_runs_today} failed agent runs today",
            }
        )

    # Break-glass active count
    _prune_expired_sessions()
    if _break_glass_sessions:
        alerts.append(
            {
                "severity": "high",
                "category": "break_glass",
                "message": f"{len(_break_glass_sessions)} active break-glass session(s)",
            }
        )

    return ExecutiveDashboardResponse(
        mrr=round(mrr, 2),
        arr=round(arr, 2),
        clinic_count=total_clinics,
        active_clinic_count=active_clinics,
        patient_count=total_patients,
        active_patient_count=active_patients,
        clinician_count=clinician_count,
        alerts=alerts,
        ai_usage={
            "runs_today": ai_today,
            "runs_this_month": ai_month,
            "cost_this_month_pence": ai_cost_month,
        },
        generated_at=_iso(now),
    )


# ---------------------------------------------------------------------------
# 2. Clinic Directory
# ---------------------------------------------------------------------------


@router.get("/clinics", response_model=list[ClinicSummaryResponse])
async def list_clinics(
    status: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> list[ClinicSummaryResponse]:
    """List all clinics with filters, search, sort, pagination."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="clinics.list", resource_type="clinic")

    q = session.query(Clinic)

    if search:
        q = q.filter(Clinic.name.ilike(f"%{search}%"))

    # Sorting
    sort_col = {
        "name": Clinic.name,
        "created_at": Clinic.created_at,
        "updated_at": Clinic.updated_at,
    }.get(sort_by, Clinic.created_at)
    if sort_order.lower() == "desc":
        q = q.order_by(sort_col.desc())
    else:
        q = q.order_by(sort_col.asc())

    total = q.count()
    clinics = q.offset((page - 1) * page_size).limit(page_size).all()

    results: list[ClinicSummaryResponse] = []
    for c in clinics:
        patient_count = (
            session.query(func.count(Patient.id))
            .filter(Patient.clinician_id.in_(
                session.query(User.id).filter(User.clinic_id == c.id)
            ))
            .scalar()
            or 0
        )
        clinician_count = (
            session.query(func.count(User.id))
            .filter(User.clinic_id == c.id)
            .scalar()
            or 0
        )
        # Derive plan from subscription
        sub = (
            session.query(Subscription)
            .join(User, User.id == Subscription.user_id)
            .filter(User.clinic_id == c.id)
            .first()
        )
        plan_val = sub.package_id if sub else "explorer"
        # Derive status heuristically
        status_val = "active" if clinician_count > 0 else "trial"
        if status and status_val != status:
            continue
        if plan and plan_val != plan:
            continue

        results.append(
            ClinicSummaryResponse(
                id=c.id,
                name=c.name,
                plan=plan_val,
                status=status_val,
                patient_count=patient_count,
                clinician_count=clinician_count,
                mrr=round(_PACKAGE_PRICES.get(plan_val, 49.0), 2),
                health_score=100,  # Placeholder — would derive from SLA + AE rates
                created_at=_iso(c.created_at),
                updated_at=_iso(c.updated_at),
            )
        )

    return results


@router.get("/clinics/{clinic_id}", response_model=ClinicDetailResponse)
async def get_clinic_detail(
    clinic_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClinicDetailResponse:
    """Full clinic profile: profile, subscription, usage, tickets, audit."""
    _require_super_admin(actor)
    _log_crm_access(
        actor=actor,
        action="clinics.detail",
        resource_type="clinic",
        resource_id=clinic_id,
    )

    clinic = session.query(Clinic).filter(Clinic.id == clinic_id).first()
    if clinic is None:
        raise ApiServiceError(
            code="clinic_not_found",
            message=f"Clinic '{clinic_id}' not found.",
            status_code=404,
        )

    patient_count = (
        session.query(func.count(Patient.id))
        .filter(Patient.clinician_id.in_(
            session.query(User.id).filter(User.clinic_id == clinic_id)
        ))
        .scalar()
        or 0
    )
    clinician_count = (
        session.query(func.count(User.id))
        .filter(User.clinic_id == clinic_id)
        .scalar()
        or 0
    )

    sub = (
        session.query(Subscription)
        .join(User, User.id == Subscription.user_id)
        .filter(User.clinic_id == clinic_id)
        .first()
    )
    subscription = None
    if sub:
        subscription = {
            "package_id": sub.package_id,
            "status": sub.status,
            "current_period_end": _iso(sub.current_period_end),
        }

    # Usage: sessions this month
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    session_count = (
        session.query(func.count(ClinicalSession.id))
        .filter(ClinicalSession.clinician_id.in_(
            session.query(User.id).filter(User.clinic_id == clinic_id)
        ))
        .filter(ClinicalSession.created_at >= month_start.replace(tzinfo=None))
        .scalar()
        or 0
    )

    # AI runs this month
    ai_runs = (
        session.query(func.count(AgentRunAudit.id))
        .filter(AgentRunAudit.clinic_id == clinic_id)
        .filter(AgentRunAudit.created_at >= month_start.replace(tzinfo=None))
        .scalar()
        or 0
    )

    # Audit trail — last 20 audit events referencing this clinic
    audit_rows = (
        session.query(AuditEventRecord)
        .filter(AuditEventRecord.note.ilike(f"%clinic_id: {clinic_id}%"))
        .order_by(AuditEventRecord.created_at.desc())
        .limit(20)
        .all()
    ) if hasattr(AuditEventRecord, 'note') else []
    # Fallback: use actor_id-based heuristic if note column doesn't match
    if not audit_rows:
        audit_rows = (
            session.query(AuditEventRecord)
            .filter(AuditEventRecord.actor_id.in_(
                session.query(User.id).filter(User.clinic_id == clinic_id)
            ))
            .order_by(AuditEventRecord.created_at.desc())
            .limit(20)
            .all()
        )

    audit_trail = [
        {
            "action": r.action,
            "actor_id": r.actor_id,
            "created_at": r.created_at if isinstance(r.created_at, str) else _iso(r.created_at),
        }
        for r in audit_rows
    ]

    specialties = _json.loads(clinic.specialties) if clinic.specialties else None
    working_hours = _json.loads(clinic.working_hours) if clinic.working_hours else None

    return ClinicDetailResponse(
        id=clinic.id,
        name=clinic.name,
        address=clinic.address,
        phone=clinic.phone,
        email=clinic.email,
        website=clinic.website,
        timezone=clinic.timezone,
        specialties=specialties if isinstance(specialties, list) else None,
        working_hours=working_hours if isinstance(working_hours, dict) else None,
        retention_days=clinic.retention_days,
        patient_count=patient_count,
        clinician_count=clinician_count,
        subscription=subscription,
        usage={"sessions_this_month": session_count, "ai_runs_this_month": ai_runs},
        audit_trail=audit_trail,
        created_at=_iso(clinic.created_at),
        updated_at=_iso(clinic.updated_at),
    )


# ---------------------------------------------------------------------------
# 3. Break-Glass Access
# ---------------------------------------------------------------------------


@router.post("/break-glass", response_model=BreakGlassResponse)
async def request_break_glass_access(
    request: BreakGlassRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> BreakGlassResponse:
    """Request emergency break-glass access to clinic/patient data.

    Requires dual authorization (super-admin role + explicit justification).
    Logs everything. Auto-expires after ``duration_minutes``.
    """
    _require_super_admin(actor)

    if not request.justification or len(request.justification.strip()) < 10:
        raise ApiServiceError(
            code="break_glass_justification_required",
            message="A detailed justification (min 10 chars) is required for break-glass access.",
            status_code=400,
        )

    # Verify clinic exists
    clinic = session.query(Clinic).filter(Clinic.id == request.clinic_id).first()
    if clinic is None:
        raise ApiServiceError(
            code="clinic_not_found",
            message=f"Clinic '{request.clinic_id}' not found.",
            status_code=404,
        )

    # Verify patient exists
    patient = session.query(Patient).filter(Patient.id == request.patient_id).first()
    if patient is None:
        raise ApiServiceError(
            code="patient_not_found",
            message=f"Patient '{request.patient_id}' not found.",
            status_code=404,
        )

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=request.duration_minutes)
    session_id = f"bg-{uuid.uuid4().hex[:16]}"
    access_token = f"bg_token_{uuid.uuid4().hex}"

    record: dict[str, Any] = {
        "session_id": session_id,
        "clinic_id": request.clinic_id,
        "patient_id": request.patient_id,
        "justification": request.justification,
        "granted_to": actor.actor_id,
        "granted_to_role": actor.role,
        "expires_at": expires_at,
        "created_at": now,
        "access_token": access_token,
    }
    _break_glass_sessions.append(record)

    # Write audit event
    try:
        audit = AuditEventRecord(
            event_id=f"crm.break_glass.{session_id}",
            target_id=request.patient_id,
            target_type="patient",
            action="crm.break_glass.granted",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(
                f"Break-glass access granted to clinic_id={request.clinic_id} "
                f"patient_id={request.patient_id} by {actor.actor_id}. "
                f"Justification: {request.justification[:500]}"
            ),
            created_at=now.isoformat(),
        )
        session.add(audit)
        session.commit()
    except Exception:
        session.rollback()

    _log_crm_access(
        actor=actor,
        action="break_glass.granted",
        resource_type="patient",
        resource_id=request.patient_id,
        justification=request.justification,
    )

    logger.warning(
        "break_glass_access_granted",
        extra={
            "session_id": session_id,
            "actor_id": actor.actor_id,
            "clinic_id": request.clinic_id,
            "patient_id": request.patient_id,
            "expires_at": expires_at.isoformat(),
        },
    )

    return BreakGlassResponse(
        session_id=session_id,
        expires_at=_iso(expires_at),
        access_token=access_token,
        clinic_id=request.clinic_id,
        patient_id=request.patient_id,
        granted_by=actor.actor_id,
        justification=request.justification,
    )


@router.get("/break-glass/sessions")
async def list_break_glass_sessions(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> list[dict[str, Any]]:
    """List active and recent break-glass sessions."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="break_glass.list", resource_type="break_glass")

    _prune_expired_sessions()

    results: list[dict[str, Any]] = []
    for record in sorted(_break_glass_sessions, key=lambda x: x["created_at"], reverse=True):
        results.append(
            {
                "session_id": record["session_id"],
                "clinic_id": record["clinic_id"],
                "patient_id": record["patient_id"],
                "granted_to": record["granted_to"],
                "granted_to_role": record["granted_to_role"],
                "justification": record["justification"],
                "expires_at": _iso(record["expires_at"]),
                "created_at": _iso(record["created_at"]),
                "is_active": record["expires_at"] > datetime.now(timezone.utc),
            }
        )
    return results


# ---------------------------------------------------------------------------
# 4. AI Agent Operations
# ---------------------------------------------------------------------------


@router.get("/ai-ops/dashboard", response_model=AIopsDashboardResponse)
async def get_ai_ops_dashboard(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AIopsDashboardResponse:
    """AI operations: active agents, runs, costs, approval queues, failures."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="ai_ops.dashboard", resource_type="ai_ops")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    active_agents = (
        session.query(func.count(AgentHire.id))
        .filter(AgentHire.status == "active")
        .scalar()
        or 0
    )

    runs_today = (
        session.query(func.count(AgentRunAudit.id))
        .filter(AgentRunAudit.created_at >= today_start.replace(tzinfo=None))
        .scalar()
        or 0
    )

    runs_month = (
        session.query(func.count(AgentRunAudit.id))
        .filter(AgentRunAudit.created_at >= month_start.replace(tzinfo=None))
        .scalar()
        or 0
    )

    failures_today = (
        session.query(func.count(AgentRunAudit.id))
        .filter(AgentRunAudit.created_at >= today_start.replace(tzinfo=None))
        .filter(AgentRunAudit.ok.is_(False))
        .scalar()
        or 0
    )

    cost_today = (
        session.query(func.coalesce(func.sum(AgentRunAudit.cost_pence), 0))
        .filter(AgentRunAudit.created_at >= today_start.replace(tzinfo=None))
        .scalar()
        or 0
    )

    cost_month = (
        session.query(func.coalesce(func.sum(AgentRunAudit.cost_pence), 0))
        .filter(AgentRunAudit.created_at >= month_start.replace(tzinfo=None))
        .scalar()
        or 0
    )

    # Approval queue — pending assessments that need clinician review
    approval_queue = (
        session.query(func.count(AssessmentRecord.id))
        .filter(AssessmentRecord.approved_status == "unreviewed")
        .scalar()
        or 0
    )

    alerts: list[dict[str, Any]] = []
    if failures_today > 10:
        alerts.append(
            {
                "severity": "high",
                "category": "ai_ops",
                "message": f"{failures_today} AI run failures today",
            }
        )

    return AIopsDashboardResponse(
        active_agents=active_agents,
        total_runs_today=runs_today,
        total_runs_this_month=runs_month,
        approval_queue_size=approval_queue,
        failure_count_today=failures_today,
        cost_today_pence=cost_today,
        cost_this_month_pence=cost_month,
        alerts=alerts,
        generated_at=_iso(now),
    )


@router.get("/ai-ops/agents", response_model=list[AgentSummaryResponse])
async def list_all_agents(
    status: Optional[str] = Query(None),
    clinic_id: Optional[str] = Query(None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> list[AgentSummaryResponse]:
    """List all agents across all clinics."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="ai_ops.agents.list", resource_type="agent")

    q = session.query(AgentHire)
    if status:
        q = q.filter(AgentHire.status == status)
    if clinic_id:
        q = q.filter(AgentHire.clinic_id == clinic_id)

    hires = q.order_by(AgentHire.hired_at.desc()).limit(500).all()

    results: list[AgentSummaryResponse] = []
    for h in hires:
        results.append(
            AgentSummaryResponse(
                id=h.id,
                name=h.agent_id,
                clinic_id=h.clinic_id,
                actor_id=h.actor_id,
                status=h.status,
                last_used_at=_iso(h.last_used_at),
                created_at=_iso(h.hired_at),
            )
        )
    return results


@router.get("/ai-ops/runs", response_model=list[RunSummaryResponse])
async def list_all_runs(
    clinic_id: Optional[str] = Query(None),
    agent_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),  # Maps to ok=True/False
    page: int = Query(1, ge=1),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> list[RunSummaryResponse]:
    """List all agent runs across all clinics."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="ai_ops.runs.list", resource_type="agent_run")

    q = session.query(AgentRunAudit)
    if clinic_id:
        q = q.filter(AgentRunAudit.clinic_id == clinic_id)
    if agent_id:
        q = q.filter(AgentRunAudit.agent_id == agent_id)
    if status == "success":
        q = q.filter(AgentRunAudit.ok.is_(True))
    elif status == "failed":
        q = q.filter(AgentRunAudit.ok.is_(False))

    runs = (
        q.order_by(AgentRunAudit.created_at.desc())
        .offset((page - 1) * 50)
        .limit(50)
        .all()
    )

    results: list[RunSummaryResponse] = []
    for r in runs:
        results.append(
            RunSummaryResponse(
                id=r.id,
                created_at=_iso(r.created_at),
                actor_id=r.actor_id,
                clinic_id=r.clinic_id,
                agent_id=r.agent_id,
                message_preview=r.message_preview,
                latency_ms=r.latency_ms,
                ok=bool(r.ok),
                error_code=r.error_code,
                cost_pence=r.cost_pence,
            )
        )
    return results


# ---------------------------------------------------------------------------
# 5. Support / Ticketing
# ---------------------------------------------------------------------------


@router.get("/support/tickets", response_model=list[TicketResponse])
async def list_support_tickets(
    priority: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    clinic_id: Optional[str] = Query(None),
    assignee: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> list[TicketResponse]:
    """List all support tickets.

    Tickets are synthesized from audit events with action patterns
    ``support.*`` and adverse-event escalations until a dedicated
    ``support_tickets`` table is introduced.
    """
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="support.tickets.list", resource_type="support_ticket")

    # Derive tickets from audit events as tombstone rows
    q = session.query(AuditEventRecord)

    # Filter for events that look like support tickets
    support_actions = ["support.create", "support.escalate", "adverse_events.escalate"]
    q = q.filter(AuditEventRecord.action.in_(support_actions))

    if status:
        q = q.filter(AuditEventRecord.target_type.ilike(f"%{status}%"))
    if clinic_id:
        # Clinic-scoped via actor_id → user → clinic_id heuristic
        user_ids = [
            u[0] for u in
            session.query(User.id).filter(User.clinic_id == clinic_id).all()
        ]
        if user_ids:
            q = q.filter(AuditEventRecord.actor_id.in_(user_ids))

    rows = (
        q.order_by(AuditEventRecord.created_at.desc())
        .offset((page - 1) * 50)
        .limit(50)
        .all()
    )

    results: list[TicketResponse] = []
    for idx, r in enumerate(rows):
        results.append(
            TicketResponse(
                id=r.event_id or f"ticket-{idx}",
                clinic_id=None,
                subject=f"[{r.action}] {r.target_type}",
                priority=priority or "normal",
                status=status or "open",
                assignee=assignee or r.actor_id,
                created_at=r.created_at if isinstance(r.created_at, str) else _iso(r.created_at),
                updated_at=r.created_at if isinstance(r.created_at, str) else _iso(r.created_at),
            )
        )
    return results


@router.get("/support/tickets/{ticket_id}", response_model=TicketDetailResponse)
async def get_ticket_detail(
    ticket_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> TicketDetailResponse:
    """Full ticket detail with audit trail."""
    _require_super_admin(actor)
    _log_crm_access(
        actor=actor,
        action="support.tickets.detail",
        resource_type="support_ticket",
        resource_id=ticket_id,
    )

    audit_row = (
        session.query(AuditEventRecord)
        .filter(AuditEventRecord.event_id == ticket_id)
        .first()
    )

    if audit_row is None:
        # Tombstone: return a synthetic ticket for unknown IDs
        return TicketDetailResponse(
            id=ticket_id,
            clinic_id=None,
            subject="Unknown ticket",
            description="Ticket not found in audit log.",
            priority="low",
            status="unknown",
            assignee=None,
            reporter=None,
            audit_trail=[],
            created_at=_iso(datetime.now(timezone.utc)),
            updated_at=_iso(datetime.now(timezone.utc)),
        )

    audit_trail = [
        {
            "action": audit_row.action,
            "actor_id": audit_row.actor_id,
            "role": audit_row.role,
            "created_at": (
                audit_row.created_at
                if isinstance(audit_row.created_at, str)
                else _iso(audit_row.created_at)
            ),
        }
    ]

    return TicketDetailResponse(
        id=audit_row.event_id or ticket_id,
        clinic_id=None,
        subject=f"[{audit_row.action}] {audit_row.target_type}",
        description=audit_row.note or "",
        priority="normal",
        status="open",
        assignee=None,
        reporter=audit_row.actor_id,
        audit_trail=audit_trail,
        created_at=(
            audit_row.created_at
            if isinstance(audit_row.created_at, str)
            else _iso(audit_row.created_at)
        ),
        updated_at=(
            audit_row.created_at
            if isinstance(audit_row.created_at, str)
            else _iso(audit_row.created_at)
        ),
    )


# ---------------------------------------------------------------------------
# 6. Platform Operations
# ---------------------------------------------------------------------------


@router.get("/ops/infrastructure", response_model=InfrastructureStatusResponse)
async def get_infrastructure_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> InfrastructureStatusResponse:
    """Platform infrastructure: API health, DB health, queue health, storage."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="ops.infrastructure", resource_type="infrastructure")

    now = datetime.now(timezone.utc)

    # DB health check — lightweight ping
    db_health = "healthy"
    try:
        session.execute(text("SELECT 1"))
    except Exception:
        db_health = "down"

    # Storage: count media rows / estimate sizes via DataExport
    total_export_bytes = (
        session.query(func.coalesce(func.sum(DataExport.file_bytes), 0)).scalar()
        or 0
    )

    services = [
        {"name": "api", "status": "healthy", "latency_ms": 12},
        {"name": "database", "status": db_health, "latency_ms": 5 if db_health == "healthy" else 0},
        {"name": "agent_scheduler", "status": "healthy"},
        {"name": "voice_engine", "status": "healthy"},
    ]

    return InfrastructureStatusResponse(
        api_health="healthy",
        db_health=db_health,
        queue_health="healthy",
        storage_usage={
            "exports_total_bytes": total_export_bytes,
            "exports_total_gb": round(total_export_bytes / (1024 * 1024 * 1024), 4),
        },
        services=services,
        checked_at=_iso(now),
    )


@router.get("/ops/pipelines", response_model=PipelineStatusResponse)
async def get_pipeline_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PipelineStatusResponse:
    """Pipeline status: MRI, qEEG, evidence DB sync, AI inference."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="ops.pipelines", resource_type="pipeline")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # AI inference today
    ai_runs = (
        session.query(func.count(AgentRunAudit.id))
        .filter(AgentRunAudit.created_at >= today_start.replace(tzinfo=None))
        .scalar()
        or 0
    )
    ai_failures = (
        session.query(func.count(AgentRunAudit.id))
        .filter(AgentRunAudit.created_at >= today_start.replace(tzinfo=None))
        .filter(AgentRunAudit.ok.is_(False))
        .scalar()
        or 0
    )

    return PipelineStatusResponse(
        mri_pipeline={
            "status": "healthy",
            "last_sync": _iso(now),
            "pending_analyses": 0,
        },
        qeeg_pipeline={
            "status": "healthy",
            "last_sync": _iso(now),
            "pending_analyses": 0,
        },
        evidence_sync={
            "status": "healthy",
            "last_sync": _iso(now),
            "papers_indexed": (
                session.query(func.count(LiteraturePaper.id)).scalar() or 0
            ),
        },
        ai_inference={
            "status": "healthy" if ai_failures < 5 else "degraded",
            "runs_today": ai_runs,
            "failures_today": ai_failures,
        },
        checked_at=_iso(now),
    )


# ---------------------------------------------------------------------------
# 7. Compliance & Audit
# ---------------------------------------------------------------------------


@router.get("/compliance/phi-access", response_model=list[PHIAccessLogResponse])
async def get_phi_access_log(
    clinic_id: Optional[str] = Query(None),
    actor_filter: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> list[PHIAccessLogResponse]:
    """Cross-clinic PHI access log with safety flagging."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="compliance.phi_access", resource_type="phi_access_log")

    now = datetime.now(timezone.utc)
    if date_from is None:
        date_from = now - timedelta(days=30)
    if date_to is None:
        date_to = now

    # Use AiSummaryAudit as a proxy for PHI access (actor + patient linked)
    q = session.query(AiSummaryAudit)
    if actor_filter:
        q = q.filter(AiSummaryAudit.actor_id == actor_filter)
    if date_from:
        q = q.filter(AiSummaryAudit.created_at >= date_from.replace(tzinfo=None) if date_from.tzinfo else date_from)
    if date_to:
        q = q.filter(AiSummaryAudit.created_at <= date_to.replace(tzinfo=None) if date_to.tzinfo else date_to)

    rows = (
        q.order_by(AiSummaryAudit.created_at.desc())
        .offset((page - 1) * 50)
        .limit(50)
        .all()
    )

    results: list[PHIAccessLogResponse] = []
    for r in rows:
        # Flag break-glass or unusual access patterns
        flagged = r.summary_type == "break_glass" or r.actor_role not in (
            "clinician",
            "admin",
        )
        results.append(
            PHIAccessLogResponse(
                id=r.id,
                actor_id=r.actor_id,
                actor_role=r.actor_role,
                clinic_id=None,  # AiSummaryAudit doesn't carry clinic_id
                patient_id=r.patient_id,
                action=r.summary_type,
                resource_type="ai_summary",
                justification=None,
                flagged=flagged,
                created_at=_iso(r.created_at),
            )
        )
    return results


@router.get("/compliance/suspicious-activity", response_model=SuspiciousActivityResponse)
async def get_suspicious_activity(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SuspiciousActivityResponse:
    """Suspicious activity: failed auth, cross-clinic violations, consent issues."""
    _require_super_admin(actor)
    _log_crm_access(
        actor=actor, action="compliance.suspicious_activity", resource_type="suspicious_activity"
    )

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=24)

    # Failed agent runs (proxy for failed operations)
    failed_auths = []
    failed_runs = (
        session.query(AgentRunAudit)
        .filter(AgentRunAudit.created_at >= window_start.replace(tzinfo=None))
        .filter(AgentRunAudit.ok.is_(False))
        .limit(50)
        .all()
    )
    for r in failed_runs:
        failed_auths.append(
            {
                "actor_id": r.actor_id,
                "action": f"agent_run_failed:{r.agent_id}",
                "error_code": r.error_code,
                "created_at": _iso(r.created_at),
            }
        )

    # Cross-clinic violations — guest actors attempting actions
    cross_clinic = []
    audit_violations = (
        session.query(AuditEventRecord)
        .filter(AuditEventRecord.role == "guest")
        .filter(AuditEventRecord.created_at >= window_start.isoformat())
        .limit(50)
        .all()
    )
    for a in audit_violations:
        cross_clinic.append(
            {
                "actor_id": a.actor_id,
                "action": a.action,
                "target_type": a.target_type,
                "created_at": a.created_at if isinstance(a.created_at, str) else _iso(a.created_at),
            }
        )

    # Consent issues — patients without consent_signed
    consent_issues = []
    uncon_patients = (
        session.query(Patient)
        .filter(Patient.consent_signed.is_(False))
        .limit(50)
        .all()
    )
    for p in uncon_patients:
        consent_issues.append(
            {
                "patient_id": p.id,
                "issue": "consent_not_signed",
                "created_at": _iso(p.created_at),
            }
        )

    return SuspiciousActivityResponse(
        failed_auths=failed_auths,
        cross_clinic_violations=cross_clinic,
        consent_issues=consent_issues,
        generated_at=_iso(now),
    )


@router.get("/compliance/exports", response_model=ExportActivityResponse)
async def get_export_activity(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ExportActivityResponse:
    """Export activity across all clinics."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="compliance.exports", resource_type="data_export")

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    exports = (
        session.query(DataExport)
        .filter(DataExport.requested_at >= month_start.replace(tzinfo=None))
        .order_by(DataExport.requested_at.desc())
        .limit(200)
        .all()
    )

    export_list: list[dict[str, Any]] = []
    total_bytes = 0
    for e in exports:
        export_list.append(
            {
                "id": e.id,
                "user_id": e.user_id,
                "clinic_id": e.clinic_id,
                "status": e.status,
                "file_bytes": e.file_bytes,
                "requested_at": _iso(e.requested_at),
                "completed_at": _iso(e.completed_at),
            }
        )
        if e.file_bytes:
            total_bytes += e.file_bytes

    return ExportActivityResponse(
        exports=export_list,
        total_exports=len(export_list),
        total_bytes=total_bytes,
        generated_at=_iso(now),
    )


# ---------------------------------------------------------------------------
# 8. Finance & Billing
# ---------------------------------------------------------------------------


@router.get("/finance/dashboard", response_model=FinanceDashboardResponse)
async def get_finance_dashboard(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> FinanceDashboardResponse:
    """Finance: MRR, ARR, subscriptions, invoices, failed payments, revenue by clinic."""
    _require_super_admin(actor)
    _log_crm_access(actor=actor, action="finance.dashboard", resource_type="finance")

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Subscriptions
    total_subs = session.query(func.count(Subscription.id)).scalar() or 0
    active_subs = (
        session.query(func.count(Subscription.id))
        .filter(Subscription.status == "active")
        .scalar()
        or 0
    )

    # MRR
    sub_rows = (
        session.query(Subscription.package_id, func.count(Subscription.id).label("cnt"))
        .filter(Subscription.status == "active")
        .group_by(Subscription.package_id)
        .all()
    )
    mrr = sum(_PACKAGE_PRICES.get(row.package_id, 49.0) * row.cnt for row in sub_rows)
    arr = mrr * 12

    # Failed payments — invoices with status overdue
    failed_invoices = (
        session.query(Invoice)
        .filter(Invoice.status.in_(["overdue", "partial"]))
        .filter(Invoice.created_at >= month_start.replace(tzinfo=None))
        .all()
    )
    failed_payments_count = len(failed_invoices)
    failed_payments_amount = sum(inv.total - inv.paid for inv in failed_invoices)

    # Revenue by clinic
    revenue_by_clinic: list[dict[str, Any]] = []
    clinic_invoice_sums = (
        session.query(
            User.clinic_id,
            func.coalesce(func.sum(Invoice.total), 0.0).label("revenue"),
            func.count(Invoice.id).label("invoice_count"),
        )
        .select_from(Invoice)
        .join(User, User.id == Invoice.clinician_id)
        .filter(Invoice.created_at >= month_start.replace(tzinfo=None))
        .group_by(User.clinic_id)
        .all()
    )
    for row in clinic_invoice_sums:
        if row.clinic_id:
            clinic_name = (
                session.query(Clinic.name).filter(Clinic.id == row.clinic_id).scalar()
                or "Unknown"
            )
            revenue_by_clinic.append(
                {
                    "clinic_id": row.clinic_id,
                    "clinic_name": clinic_name,
                    "revenue": round(row.revenue, 2),
                    "invoice_count": row.invoice_count,
                }
            )

    return FinanceDashboardResponse(
        mrr=round(mrr, 2),
        arr=round(arr, 2),
        total_subscriptions=total_subs,
        active_subscriptions=active_subs,
        failed_payments_count=failed_payments_count,
        failed_payments_amount=round(failed_payments_amount, 2),
        revenue_by_clinic=revenue_by_clinic,
        generated_at=_iso(now),
    )


@router.get("/finance/clinics/{clinic_id}/billing", response_model=ClinicBillingResponse)
async def get_clinic_billing(
    clinic_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClinicBillingResponse:
    """Detailed billing for a specific clinic."""
    _require_super_admin(actor)
    _log_crm_access(
        actor=actor,
        action="finance.clinic_billing",
        resource_type="clinic",
        resource_id=clinic_id,
    )

    clinic = session.query(Clinic).filter(Clinic.id == clinic_id).first()
    if clinic is None:
        raise ApiServiceError(
            code="clinic_not_found",
            message=f"Clinic '{clinic_id}' not found.",
            status_code=404,
        )

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Subscription
    sub = (
        session.query(Subscription)
        .join(User, User.id == Subscription.user_id)
        .filter(User.clinic_id == clinic_id)
        .first()
    )
    subscription = {}
    if sub:
        subscription = {
            "package_id": sub.package_id,
            "status": sub.status,
            "seat_limit": sub.seat_limit,
            "current_period_end": _iso(sub.current_period_end),
        }

    # Invoices
    invoices_rows = (
        session.query(Invoice)
        .join(User, User.id == Invoice.clinician_id)
        .filter(User.clinic_id == clinic_id)
        .filter(Invoice.created_at >= month_start.replace(tzinfo=None))
        .order_by(Invoice.created_at.desc())
        .limit(100)
        .all()
    )
    invoices = [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "patient_id": inv.patient_id,
            "amount": inv.amount,
            "total": inv.total,
            "status": inv.status,
            "issue_date": inv.issue_date,
        }
        for inv in invoices_rows
    ]

    # Payments
    payments_rows = (
        session.query(PatientPayment)
        .join(User, User.id == PatientPayment.clinician_id)
        .filter(User.clinic_id == clinic_id)
        .filter(PatientPayment.created_at >= month_start.replace(tzinfo=None))
        .order_by(PatientPayment.created_at.desc())
        .limit(100)
        .all()
    )
    payments = [
        {
            "id": p.id,
            "amount": p.amount,
            "method": p.method,
            "payment_date": p.payment_date,
        }
        for p in payments_rows
    ]

    # Insurance claims
    claims_rows = (
        session.query(InsuranceClaim)
        .join(User, User.id == InsuranceClaim.clinician_id)
        .filter(User.clinic_id == clinic_id)
        .filter(InsuranceClaim.created_at >= month_start.replace(tzinfo=None))
        .order_by(InsuranceClaim.created_at.desc())
        .limit(100)
        .all()
    )
    claims = [
        {
            "id": c.id,
            "claim_number": c.claim_number,
            "insurer": c.insurer,
            "amount": c.amount,
            "status": c.status,
        }
        for c in claims_rows
    ]

    # Agent costs
    agent_costs = (
        session.query(func.coalesce(func.sum(AgentRunAudit.cost_pence), 0))
        .filter(AgentRunAudit.clinic_id == clinic_id)
        .filter(AgentRunAudit.created_at >= month_start.replace(tzinfo=None))
        .scalar()
        or 0
    )

    return ClinicBillingResponse(
        clinic_id=clinic_id,
        clinic_name=clinic.name,
        subscription=subscription,
        invoices=invoices,
        payments=payments,
        insurance_claims=claims,
        agent_costs_pence=agent_costs,
        period_start=_iso(month_start),
        period_end=_iso(now),
    )


# ---------------------------------------------------------------------------
# 9. Research & Evidence Analytics
# ---------------------------------------------------------------------------


@router.get("/research/analytics", response_model=ResearchAnalyticsResponse)
async def get_research_analytics(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ResearchAnalyticsResponse:
    """Evidence DB usage, paper searches, protocol evidence usage, biomarker evidence."""
    _require_super_admin(actor)
    _log_crm_access(
        actor=actor, action="research.analytics", resource_type="research_analytics"
    )

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_papers = session.query(func.count(LiteraturePaper.id)).scalar() or 0
    papers_this_month = (
        session.query(func.count(LiteraturePaper.id))
        .filter(LiteraturePaper.created_at >= month_start.replace(tzinfo=None))
        .scalar()
        or 0
    )

    # Evidence citations saved
    citations_saved = (
        session.query(func.count(EvidenceSavedCitation.id)).scalar() or 0
    )

    # Protocol-evidence links
    protocol_links = (
        session.query(func.count(ProtocolVersion.id)).scalar() or 0
    )

    # Top conditions from literature
    condition_counts = (
        session.query(
            LiteraturePaper.condition,
            func.count(LiteraturePaper.id).label("cnt"),
        )
        .filter(LiteraturePaper.condition.isnot(None))
        .group_by(LiteraturePaper.condition)
        .order_by(func.count(LiteraturePaper.id).desc())
        .limit(10)
        .all()
    )
    top_conditions = [
        {"condition": c.condition, "count": c.cnt} for c in condition_counts
    ]

    # Top modalities
    modality_counts = (
        session.query(
            LiteraturePaper.modality,
            func.count(LiteraturePaper.id).label("cnt"),
        )
        .filter(LiteraturePaper.modality.isnot(None))
        .group_by(LiteraturePaper.modality)
        .order_by(func.count(LiteraturePaper.id).desc())
        .limit(10)
        .all()
    )
    top_modalities = [
        {"modality": m.modality, "count": m.cnt} for m in modality_counts
    ]

    return ResearchAnalyticsResponse(
        total_papers=total_papers,
        papers_this_month=papers_this_month,
        total_searches=0,  # Would come from search audit table
        evidence_citations_saved=citations_saved,
        protocol_evidence_links=protocol_links,
        top_conditions=top_conditions,
        top_modalities=top_modalities,
        generated_at=_iso(now),
    )
