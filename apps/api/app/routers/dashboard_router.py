"""Dashboard router — unified clinic-level overview.

Prefix: /api/v1/dashboard
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.persistence.models import (
    AdverseEvent,
    AssessmentRecord,
    Clinic,
    ClinicalSession,
    ConsentRecord,
    Patient,
    ReviewQueueItem,
    TreatmentCourse,
)
from app.repositories.audit import create_audit_event
from app.repositories.patients import list_patients

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


class DashboardClinicOut(BaseModel):
    id: str
    name: str


class DashboardUserOut(BaseModel):
    id: str
    display_name: str
    role: str


class DashboardMetricOut(BaseModel):
    label: str
    value: Any
    unit: str = ""
    delta: Optional[str] = None
    trend: Optional[str] = None


class DashboardScheduleSlotOut(BaseModel):
    time: str
    patient_id: str
    patient_name: str
    initials: str
    modality: str
    session_number: Optional[int] = None
    total_sessions: Optional[int] = None
    status: str
    course_id: Optional[str] = None


class DashboardSafetyFlagOut(BaseModel):
    patient_id: str
    patient_name: str
    category: str
    level: str
    source: str


class DashboardActivityOut(BaseModel):
    icon: str
    text: str
    time_ago: str
    tier: str


class DashboardOverviewOut(BaseModel):
    clinic: Optional[DashboardClinicOut] = None
    user: DashboardUserOut
    is_demo: bool = False
    metrics: Dict[str, DashboardMetricOut]
    schedule: List[DashboardScheduleSlotOut]
    safety_flags: List[DashboardSafetyFlagOut]
    activity_feed: List[DashboardActivityOut]
    system_health: Dict[str, Any]


class SearchResultOut(BaseModel):
    id: str
    type: str
    title: str
    subtitle: Optional[str] = None
    url_path: Optional[str] = None


class SearchResponseOut(BaseModel):
    query: str
    groups: Dict[str, List[SearchResultOut]]
    total: int


def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _week_ago() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=7)


def _as_aware_utc(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    if v.tzinfo is None:
        return v.replace(tzinfo=timezone.utc)
    return v.astimezone(timezone.utc)


def _patient_name(p: Patient) -> str:
    return f"{p.first_name or ''} {p.last_name or ''}".strip()


def _initials(p: Patient) -> str:
    parts = [p.first_name or '', p.last_name or '']
    return ''.join((x[0] if x else '') for x in parts).upper()[:2]


@router.get("/overview", response_model=DashboardOverviewOut)
def dashboard_overview(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DashboardOverviewOut:
    """Return a unified clinic-level dashboard overview."""
    require_minimum_role(actor, "clinician")

    clinic: Optional[Clinic] = None
    if actor.clinic_id:
        clinic = session.scalar(select(Clinic).where(Clinic.id == actor.clinic_id))

    patients = list_patients(session, actor.actor_id)
    patient_ids = [p.id for p in patients]
    patient_map = {p.id: p for p in patients}

    courses: List[TreatmentCourse] = []
    if patient_ids:
        courses = session.execute(
            select(TreatmentCourse).where(TreatmentCourse.patient_id.in_(patient_ids))
        ).scalars().all()

    active_courses = [c for c in courses if c.status in ("active", "in_progress", "approved")]
    pending_courses = [c for c in courses if c.status == "pending_approval"]
    flagged_courses = [c for c in courses if c.review_required]

    today_str = _today_iso()
    sessions_today: List[ClinicalSession] = []
    sessions_week: List[ClinicalSession] = []
    if patient_ids:
        sessions_today = session.execute(
            select(ClinicalSession)
            .where(
                ClinicalSession.patient_id.in_(patient_ids),
                ClinicalSession.scheduled_at.startswith(today_str),
                ClinicalSession.status.notin_(["cancelled", "no_show"]),
            )
            .order_by(ClinicalSession.scheduled_at)
        ).scalars().all()

        sessions_week = session.execute(
            select(ClinicalSession)
            .where(
                ClinicalSession.patient_id.in_(patient_ids),
                ClinicalSession.status == "completed",
                ClinicalSession.completed_at >= _week_ago().isoformat(),
            )
        ).scalars().all()

    total_delivered_week = len(sessions_week)

    open_aes: List[AdverseEvent] = []
    if patient_ids:
        open_aes = session.execute(
            select(AdverseEvent)
            .where(
                AdverseEvent.patient_id.in_(patient_ids),
                AdverseEvent.resolved_at.is_(None),
            )
        ).scalars().all()

    serious_aes = [a for a in open_aes if a.severity in ("serious", "severe")]

    responder_rate: Optional[float] = None
    phq_delta: Optional[float] = None
    if patient_ids:
        assessments = session.execute(
            select(AssessmentRecord)
            .where(AssessmentRecord.patient_id.in_(patient_ids))
        ).scalars().all()
        pat_assessments: Dict[str, List[AssessmentRecord]] = {}
        for a in assessments:
            pat_assessments.setdefault(a.patient_id, []).append(a)
        responders = 0
        considered = 0
        deltas: List[float] = []
        for pid, ass_list in pat_assessments.items():
            phq_like = [a for a in ass_list if (a.template_title or "").upper().startswith("PHQ")]
            if len(phq_like) >= 2:
                phq_like.sort(key=lambda x: x.created_at or datetime.min.replace(tzinfo=timezone.utc))
                base = phq_like[0].score_numeric
                cur = phq_like[-1].score_numeric
                if base is not None and cur is not None and base > 0:
                    considered += 1
                    if (base - cur) / base >= 0.5:
                        responders += 1
                    deltas.append(float(cur) - float(base))
        if considered:
            responder_rate = round(responders / considered * 100, 1)
        if deltas:
            phq_delta = round(sum(deltas) / len(deltas), 2)

    pending_review_count = 0
    if patient_ids:
        pending_review_count = session.scalar(
            select(func.count(ReviewQueueItem.id)).where(
                ReviewQueueItem.patient_id.in_(patient_ids),
                ReviewQueueItem.status == "pending",
            )
        ) or 0

    consent_alert_count = 0
    if patient_ids:
        consent_alert_count = session.scalar(
            select(func.count(ConsentRecord.id)).where(
                ConsentRecord.patient_id.in_(patient_ids),
                ConsentRecord.status == "active",
                ConsentRecord.expires_at < datetime.now(timezone.utc),
            )
        ) or 0

    schedule_slots: List[DashboardScheduleSlotOut] = []
    for s in sessions_today[:8]:
        pt = patient_map.get(s.patient_id)
        schedule_slots.append(DashboardScheduleSlotOut(
            time=s.scheduled_at[11:16] if len(s.scheduled_at) >= 16 else "--:--",
            patient_id=s.patient_id,
            patient_name=_patient_name(pt) if pt else "Patient",
            initials=_initials(pt) if pt else "PT",
            modality=s.modality or "Session",
            session_number=s.session_number,
            total_sessions=s.total_sessions,
            status=s.status,
            course_id=None,
        ))

    safety_flags: List[DashboardSafetyFlagOut] = []
    for ae in serious_aes[:5]:
        pt = patient_map.get(ae.patient_id)
        safety_flags.append(DashboardSafetyFlagOut(
            patient_id=ae.patient_id,
            patient_name=_patient_name(pt) if pt else "Patient",
            category=ae.event_type or "adverse_event",
            level="red",
            source="adverse_event",
        ))
    for c in flagged_courses[:5]:
        pt = patient_map.get(c.patient_id)
        safety_flags.append(DashboardSafetyFlagOut(
            patient_id=c.patient_id,
            patient_name=_patient_name(pt) if pt else "Patient",
            category="review_required",
            level="amber",
            source="course_flag",
        ))

    activity_feed: List[DashboardActivityOut] = []
    now = datetime.now(timezone.utc)
    for ae in open_aes[:2]:
        pt = patient_map.get(ae.patient_id)
        activity_feed.append(DashboardActivityOut(
            icon="⚠",
            text=f"{_patient_name(pt) if pt else 'Patient'} · Adverse event ({ae.severity})",
            time_ago=_time_ago(ae.reported_at, now),
            tier="critical" if ae.severity in ("serious", "severe") else "warning",
        ))
    for c in pending_courses[:2]:
        pt = patient_map.get(c.patient_id)
        activity_feed.append(DashboardActivityOut(
            icon="◉",
            text=f"Protocol pending review · {_patient_name(pt) if pt else 'Patient'}",
            time_ago=_time_ago(c.updated_at, now),
            tier="warning",
        ))
    for c in active_courses[:2]:
        pt = patient_map.get(c.patient_id)
        if c.sessions_delivered and c.planned_sessions_total and c.sessions_delivered >= c.planned_sessions_total:
            activity_feed.append(DashboardActivityOut(
                icon="✓",
                text=f"{_patient_name(pt) if pt else 'Patient'} completed {c.modality_slug} · {c.sessions_delivered} sessions",
                time_ago=_time_ago(c.updated_at, now),
                tier="success",
            ))

    system_health = {
        "backend": "ok",
        "database": "ok",
        "demo_mode": False,
    }

    demo_count = sum(1 for p in patients if "[DEMO]" in (p.notes or ""))
    is_demo = demo_count > 0 and demo_count == len(patients)
    system_health["demo_mode"] = is_demo

    total_planned = sum(c.planned_sessions_total or 0 for c in active_courses)
    total_delivered_all = sum(c.sessions_delivered or 0 for c in active_courses)
    utilization = round(total_delivered_all / max(1, total_planned) * 100, 1)

    metrics = {
        "active_caseload": DashboardMetricOut(
            label="Active caseload",
            value=len([p for p in patients if p.status == "active"]),
            unit="patients",
            delta=f"{len(active_courses)} active course{'s' if len(active_courses) != 1 else ''}",
            trend="up" if active_courses else "flat",
        ),
        "sessions_delivered": DashboardMetricOut(
            label="Sessions delivered",
            value=total_delivered_week,
            unit="this week",
            delta=f"{utilization}% utilization",
            trend="up" if utilization >= 70 else "flat",
        ),
        "responder_rate": DashboardMetricOut(
            label="Responder rate",
            value=f"{int(responder_rate)}%" if responder_rate is not None else "—",
            unit="",
            delta=f"PHQ-9 Δ {phq_delta:.1f}" if phq_delta is not None else "Not enough data",
            trend="up" if phq_delta is not None and phq_delta < 0 else "flat",
        ),
        "pending_review": DashboardMetricOut(
            label="Pending review",
            value=pending_review_count,
            unit="items",
            delta=f"{len(flagged_courses)} need re-review" if flagged_courses else "all current",
            trend="down" if flagged_courses else "flat",
        ),
        "safety_flags": DashboardMetricOut(
            label="Safety flags",
            value=len(serious_aes),
            unit="serious",
            delta=f"{len(open_aes)} total open",
            trend="down" if serious_aes else "flat",
        ),
        "consent_alerts": DashboardMetricOut(
            label="Consent alerts",
            value=consent_alert_count,
            unit="expiring",
            delta="review needed" if consent_alert_count else "all current",
            trend="down" if consent_alert_count else "flat",
        ),
    }

    try:
        create_audit_event(
            session,
            event_id=f"dash-load-{actor.actor_id}-{int(now.timestamp())}",
            target_id=actor.clinic_id or actor.actor_id,
            target_type="dashboard",
            action="dashboard.loaded",
            role=actor.role,
            actor_id=actor.actor_id,
            note=f"patients={len(patients)}; courses={len(courses)}; aes={len(open_aes)}",
            created_at=now.isoformat(),
        )
    except Exception:
        pass

    return DashboardOverviewOut(
        clinic=DashboardClinicOut(id=clinic.id, name=clinic.name) if clinic else None,
        user=DashboardUserOut(id=actor.actor_id, display_name=actor.display_name or actor.actor_id, role=actor.role),
        is_demo=is_demo,
        metrics=metrics,
        schedule=schedule_slots,
        safety_flags=safety_flags,
        activity_feed=activity_feed,
        system_health=system_health,
    )


def _time_ago(dt: datetime | None, now: datetime) -> str:
    if dt is None:
        return ""
    dt = _as_aware_utc(dt)
    delta = now - dt
    if delta < timedelta(minutes=1):
        return "just now"
    if delta < timedelta(hours=1):
        return f"{int(delta.total_seconds() // 60)}m"
    if delta < timedelta(days=1):
        return f"{int(delta.total_seconds() // 3600)}h"
    return f"{delta.days}d"


@router.get("/search", response_model=SearchResponseOut)
def dashboard_search(
    q: str = "",
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SearchResponseOut:
    """Global search across patients, sessions, courses, and documents."""
    require_minimum_role(actor, "clinician")
    query = (q or "").strip().lower()
    if not query:
        return SearchResponseOut(query="", groups={}, total=0)

    patients = list_patients(session, actor.actor_id)
    patient_ids = [p.id for p in patients]

    groups: Dict[str, List[SearchResultOut]] = {
        "Patients": [],
        "Sessions": [],
        "Courses": [],
        "Documents": [],
    }

    for p in patients:
        name = _patient_name(p).lower()
        cond = (p.primary_condition or "").lower()
        if query in name or query in cond or query in (p.email or "").lower():
            groups["Patients"].append(SearchResultOut(
                id=p.id,
                type="patient",
                title=_patient_name(p),
                subtitle=p.primary_condition,
                url_path=f"patient-profile?patient_id={p.id}",
            ))

    if patient_ids:
        sessions = session.execute(
            select(ClinicalSession)
            .where(ClinicalSession.patient_id.in_(patient_ids))
            .order_by(ClinicalSession.scheduled_at.desc())
            .limit(50)
        ).scalars().all()
        for s in sessions:
            pt = next((p for p in patients if p.id == s.patient_id), None)
            text = f"{pt.first_name if pt else 'Patient'} {s.scheduled_at[:10]} {s.modality or ''}"
            if query in text.lower():
                groups["Sessions"].append(SearchResultOut(
                    id=s.id,
                    type="session",
                    title=f"Session {s.scheduled_at[:10]}",
                    subtitle=f"{s.modality or 'Session'} · {s.status}",
                    url_path=f"session-execution?session_id={s.id}",
                ))

    if patient_ids:
        courses = session.execute(
            select(TreatmentCourse)
            .where(TreatmentCourse.patient_id.in_(patient_ids))
            .limit(50)
        ).scalars().all()
        for c in courses:
            pt = next((p for p in patients if p.id == c.patient_id), None)
            text = f"{c.condition_slug} {c.modality_slug} {pt.first_name if pt else ''}"
            if query in text.lower():
                groups["Courses"].append(SearchResultOut(
                    id=c.id,
                    type="course",
                    title=f"{c.modality_slug} · {c.condition_slug}",
                    subtitle=f"{c.sessions_delivered or 0}/{c.planned_sessions_total or '?'} sessions",
                    url_path=f"protocol-wizard?course_id={c.id}",
                ))

    total = sum(len(v) for v in groups.values())

    try:
        create_audit_event(
            session,
            event_id=f"search-{actor.actor_id}-{int(datetime.now(timezone.utc).timestamp())}",
            target_id=actor.actor_id,
            target_type="search",
            action="search.performed",
            role=actor.role,
            actor_id=actor.actor_id,
            note=f"q={query}; results={total}",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        pass

    return SearchResponseOut(query=q, groups=groups, total=total)
