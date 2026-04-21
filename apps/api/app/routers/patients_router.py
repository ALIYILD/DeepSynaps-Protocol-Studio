from __future__ import annotations

import json
import random
import re
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AdverseEvent,
    AssessmentRecord,
    ClinicalSession,
    DeviceSessionLog,
    OutcomeSeries,
    PatientInvite,
    TreatmentCourse,
)
from app.repositories.audit import create_audit_event
from app.repositories.patients import (
    create_patient,
    delete_patient,
    get_patient,
    list_patients,
    update_patient,
)

router = APIRouter(prefix="/api/v1/patients", tags=["patients"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    dob: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    primary_condition: Optional[str] = None
    secondary_conditions: list[str] = []
    primary_modality: Optional[str] = None
    referring_clinician: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_number: Optional[str] = None
    consent_signed: bool = False
    consent_date: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    dob: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    primary_condition: Optional[str] = None
    secondary_conditions: Optional[list[str]] = None
    primary_modality: Optional[str] = None
    referring_clinician: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_number: Optional[str] = None
    consent_signed: Optional[bool] = None
    consent_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PatientOut(BaseModel):
    id: str
    clinician_id: str
    first_name: str
    last_name: str
    dob: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    gender: Optional[str]
    primary_condition: Optional[str]
    secondary_conditions: list[str]
    primary_modality: Optional[str]
    referring_clinician: Optional[str]
    insurance_provider: Optional[str]
    insurance_number: Optional[str]
    consent_signed: bool
    consent_date: Optional[str]
    status: str
    notes: Optional[str]
    created_at: str
    updated_at: str
    # Enrichment fields (computed from related tables; optional / default None)
    active_courses_count: int = 0
    needs_review: bool = False
    has_adverse_event: bool = False
    adverse_event_flag: bool = False
    off_label_flag: bool = False
    pending_assessments: int = 0
    assessment_overdue: bool = False
    last_session_date: Optional[str] = None
    home_adherence: Optional[float] = None
    outcome_trend: Optional[str] = None  # improved | stable | worsened
    sessions_today: int = 0
    next_session_date: Optional[str] = None
    next_session_at: Optional[str] = None
    # Cohort-list surface fields (Patients list design spec)
    mrn: Optional[str] = None
    age: Optional[int] = None
    condition_slug: Optional[str] = None
    primary_scale: Optional[str] = None
    baseline_score: Optional[float] = None
    current_score: Optional[float] = None
    is_responder: bool = False
    review_overdue_days: Optional[int] = None
    sessions_delivered: int = 0
    planned_sessions_total: int = 0
    last_activity_at: Optional[str] = None
    demo_seed: bool = False

    @classmethod
    def from_record(cls, r, enrichment: Optional[dict] = None) -> "PatientOut":
        secondary = []
        try:
            secondary = json.loads(r.secondary_conditions or "[]")
        except Exception:
            pass
        enrichment = enrichment or {}
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            first_name=r.first_name,
            last_name=r.last_name,
            dob=r.dob,
            email=r.email,
            phone=r.phone,
            gender=r.gender,
            primary_condition=r.primary_condition,
            secondary_conditions=secondary,
            primary_modality=r.primary_modality,
            referring_clinician=r.referring_clinician,
            insurance_provider=r.insurance_provider,
            insurance_number=r.insurance_number,
            consent_signed=r.consent_signed,
            consent_date=r.consent_date,
            status=r.status,
            notes=r.notes,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
            active_courses_count=enrichment.get("active_courses_count", 0),
            needs_review=enrichment.get("needs_review", False),
            has_adverse_event=enrichment.get("has_adverse_event", False),
            adverse_event_flag=enrichment.get("has_adverse_event", False),
            off_label_flag=enrichment.get("off_label_flag", False),
            pending_assessments=enrichment.get("pending_assessments", 0),
            assessment_overdue=enrichment.get("assessment_overdue", False),
            last_session_date=enrichment.get("last_session_date"),
            home_adherence=enrichment.get("home_adherence"),
            outcome_trend=enrichment.get("outcome_trend"),
            sessions_today=enrichment.get("sessions_today", 0),
            next_session_date=enrichment.get("next_session_date"),
            next_session_at=enrichment.get("next_session_date"),
            mrn=enrichment.get("mrn"),
            age=enrichment.get("age"),
            condition_slug=enrichment.get("condition_slug") or _slugify(r.primary_condition),
            primary_scale=enrichment.get("primary_scale"),
            baseline_score=enrichment.get("baseline_score"),
            current_score=enrichment.get("current_score"),
            is_responder=enrichment.get("is_responder", False),
            review_overdue_days=enrichment.get("review_overdue_days"),
            sessions_delivered=enrichment.get("sessions_delivered", 0),
            planned_sessions_total=enrichment.get("planned_sessions_total", 0),
            last_activity_at=enrichment.get("last_activity_at"),
            demo_seed=bool((r.notes or "").startswith("[DEMO]")),
        )


def _slugify(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or None


def _derive_mrn(patient_id: str) -> str:
    """MRN has no dedicated column; surface a deterministic short ID until one lands."""
    if not patient_id:
        return ""
    tail = re.sub(r"[^a-zA-Z0-9]", "", patient_id)[-8:].upper()
    return tail or patient_id[:8].upper()


def _age_from_dob(dob: Optional[str]) -> Optional[int]:
    if not dob:
        return None
    try:
        year = int(str(dob)[:4])
    except Exception:
        return None
    now_year = datetime.now(timezone.utc).year
    age = now_year - year
    if age < 0 or age > 130:
        return None
    return age


def _as_aware_utc(dt):
    """Coerce a naive datetime (e.g. from SQLite) to a tz-aware UTC datetime.

    FastAPI/SQLAlchemy persist tz-aware values but SQLite strips the tzinfo on
    roundtrip. Any comparison with `datetime.now(timezone.utc)` will TypeError
    unless we coerce. No-op for values that are already aware.
    """
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _build_patient_enrichment(
    session: Session,
    patient_ids: list[str],
    *,
    patients: Optional[list] = None,
) -> dict:
    """Bulk-compute attention/enrichment signals for a batch of patient ids.

    Uses related tables (TreatmentCourse, AssessmentRecord, AdverseEvent,
    DeviceSessionLog, OutcomeSeries). Returns {patient_id: enrichment_dict}.
    """
    if not patient_ids:
        return {}
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    thirty_ago = now - timedelta(days=30)
    out: dict[str, dict] = {pid: {} for pid in patient_ids}

    # Pre-seed MRN / age / condition slug from the patient record so the cohort
    # list renders the subtitle "34F · MDD · MRN 10482" without a second round-trip.
    if patients is None:
        from app.persistence.models import Patient as _Patient
        patients = session.scalars(
            select(_Patient).where(_Patient.id.in_(patient_ids))
        ).all()
    for p in patients:
        e = out.setdefault(p.id, {})
        e["mrn"] = _derive_mrn(p.id)
        e["age"] = _age_from_dob(p.dob)
        e["condition_slug"] = _slugify(p.primary_condition)

    # Treatment courses → active count, off-label, needs_review, progress.
    # Progress picks the most-progressed active course for the patient (what the
    # clinician is most likely to be treating) so the cohort list bar matches the
    # detail page.
    courses = session.execute(
        select(TreatmentCourse).where(TreatmentCourse.patient_id.in_(patient_ids))
    ).scalars().all()
    progress_by_pat: dict[str, tuple[int, int]] = {}
    for c in courses:
        e = out.setdefault(c.patient_id, {})
        if c.status in ("active", "in_progress", "approved"):
            e["active_courses_count"] = e.get("active_courses_count", 0) + 1
            delivered = int(c.sessions_delivered or 0)
            planned = int(c.planned_sessions_total or 0)
            cur = progress_by_pat.get(c.patient_id, (0, 0))
            # prefer the course furthest along (max delivered). Ties go to the
            # one with the larger plan for a more meaningful progress fraction.
            if delivered > cur[0] or (delivered == cur[0] and planned > cur[1]):
                progress_by_pat[c.patient_id] = (delivered, planned)
        if c.on_label is False:
            e["off_label_flag"] = True
        if c.review_required:
            e["needs_review"] = True
    for pid, (delivered, planned) in progress_by_pat.items():
        e = out.setdefault(pid, {})
        e["sessions_delivered"] = delivered
        e["planned_sessions_total"] = planned

    # Adverse events
    aes = session.execute(
        select(AdverseEvent.patient_id, AdverseEvent.resolved_at)
        .where(AdverseEvent.patient_id.in_(patient_ids))
    ).all()
    for pid, resolved in aes:
        e = out.setdefault(pid, {})
        e["has_adverse_event"] = True
        if resolved is None:
            e["needs_review"] = True

    # Assessments: pending count + overdue
    assess_rows = session.execute(
        select(
            AssessmentRecord.patient_id,
            AssessmentRecord.status,
            AssessmentRecord.due_date,
        ).where(AssessmentRecord.patient_id.in_(patient_ids))
    ).all()
    for pid, status, due in assess_rows:
        e = out.setdefault(pid, {})
        if status in ("draft", "pending"):
            e["pending_assessments"] = e.get("pending_assessments", 0) + 1
            due_cmp = _as_aware_utc(due)
            if due_cmp is not None and due_cmp < now:
                e["assessment_overdue"] = True

    # Device session logs: last session + 30d adherence + sessions_today
    log_rows = session.execute(
        select(
            DeviceSessionLog.patient_id,
            DeviceSessionLog.session_date,
            DeviceSessionLog.completed,
            DeviceSessionLog.logged_at,
        ).where(DeviceSessionLog.patient_id.in_(patient_ids))
    ).all()
    last_seen: dict[str, str] = {}
    window: dict[str, list[bool]] = {}
    today_count: dict[str, int] = {}
    for pid, sess_date, completed, logged_at in log_rows:
        if pid not in last_seen or (sess_date or "") > last_seen[pid]:
            last_seen[pid] = sess_date or ""
        logged_cmp = _as_aware_utc(logged_at)
        if logged_cmp is not None and logged_cmp >= thirty_ago:
            window.setdefault(pid, []).append(bool(completed))
        if sess_date == today:
            today_count[pid] = today_count.get(pid, 0) + 1
    for pid, d in last_seen.items():
        if d:
            out.setdefault(pid, {})["last_session_date"] = d
    for pid, bools in window.items():
        if bools:
            out.setdefault(pid, {})["home_adherence"] = round(
                sum(1 for b in bools if b) / len(bools), 2
            )
    for pid, n in today_count.items():
        out.setdefault(pid, {})["sessions_today"] = n

    # ClinicalSession: next scheduled session + count scheduled today.
    sess_rows = session.execute(
        select(
            ClinicalSession.patient_id,
            ClinicalSession.scheduled_at,
            ClinicalSession.status,
        ).where(ClinicalSession.patient_id.in_(patient_ids))
    ).all()
    today_iso = today
    now_iso = now.isoformat()
    for pid, sched_at, status in sess_rows:
        if not sched_at:
            continue
        # sessions_today counts anything scheduled for today that hasn't been cancelled/no-showed.
        if sched_at.startswith(today_iso) and status not in ("cancelled", "no_show"):
            out.setdefault(pid, {})["sessions_today"] = out.setdefault(pid, {}).get("sessions_today", 0) + 1
        # next_session_date = earliest future scheduled/confirmed session.
        if sched_at >= now_iso and status in ("scheduled", "confirmed"):
            e = out.setdefault(pid, {})
            cur = e.get("next_session_date")
            if cur is None or sched_at < cur:
                e["next_session_date"] = sched_at

    # Outcome trend + baseline/current score pair: iterate newest-first so the
    # first row per patient is the current score. We keep a per-(patient,scale)
    # bucket so we can match the primary_scale reported by the clinician.
    outcome_rows = session.execute(
        select(
            OutcomeSeries.patient_id,
            OutcomeSeries.template_id,
            OutcomeSeries.template_title,
            OutcomeSeries.score_numeric,
            OutcomeSeries.administered_at,
            OutcomeSeries.measurement_point,
        )
        .where(OutcomeSeries.patient_id.in_(patient_ids))
        .order_by(OutcomeSeries.administered_at.desc())
    ).all()

    # newest-first list of score_numerics per patient (any scale) for trend
    by_pat_all: dict[str, list[float]] = {}
    # newest-first list of (score, measurement_point) per (patient, scale) for baseline/current
    by_pat_scale: dict[tuple[str, str], list[tuple[float, str]]] = {}
    # last outcome timestamp per patient (string iso) — feeds last_activity_at
    last_outcome_at: dict[str, str] = {}
    for pid, tmpl_id, tmpl_title, score, admin_at, mp in outcome_rows:
        admin_iso = admin_at.isoformat() if isinstance(admin_at, datetime) else str(admin_at or "")
        if admin_iso and pid not in last_outcome_at:
            last_outcome_at[pid] = admin_iso
        if score is None:
            continue
        by_pat_all.setdefault(pid, []).append(float(score))
        # Scale key: prefer the template title (PHQ-9, GAD-7...) falling back to template_id
        scale_key = (tmpl_title or tmpl_id or "").strip() or "unknown"
        by_pat_scale.setdefault((pid, scale_key), []).append((float(score), mp or ""))

    for pid, scores in by_pat_all.items():
        if len(scores) >= 2:
            latest, prior = scores[0], scores[1]
            if latest < prior - 1:
                out.setdefault(pid, {})["outcome_trend"] = "improved"
            elif latest > prior + 1:
                out.setdefault(pid, {})["outcome_trend"] = "worsened"
            else:
                out.setdefault(pid, {})["outcome_trend"] = "stable"

    # Pick the primary scale for each patient: whichever scale has the most rows.
    scale_counts: dict[str, dict[str, int]] = {}
    for (pid, scale), rows in by_pat_scale.items():
        scale_counts.setdefault(pid, {})[scale] = len(rows)
    for pid in patient_ids:
        scales = scale_counts.get(pid) or {}
        if not scales:
            continue
        primary = max(scales.items(), key=lambda kv: kv[1])[0]
        rows = by_pat_scale.get((pid, primary)) or []
        if not rows:
            continue
        current = rows[0][0]  # newest-first
        # Baseline: row explicitly tagged baseline, else the oldest row
        baseline = None
        for score, mp in rows:
            if mp and "baseline" in mp.lower():
                baseline = score
                break
        if baseline is None and len(rows) >= 2:
            baseline = rows[-1][0]
        e = out.setdefault(pid, {})
        e["primary_scale"] = primary
        e["current_score"] = current
        if baseline is not None:
            e["baseline_score"] = baseline
            drop = baseline - current
            scale_up = primary.upper()
            # Scale-specific MCID thresholds mirror the UI's isResponder() heuristic.
            if scale_up.startswith("PHQ"):
                responder = drop >= 5
            elif scale_up.startswith("GAD"):
                responder = drop >= 4
            elif scale_up.startswith("PCL"):
                responder = drop >= 10
            elif scale_up.startswith("Y-BOCS") or scale_up.startswith("YBOCS"):
                responder = drop >= 6
            elif scale_up.startswith("ISI"):
                responder = drop >= 6
            elif "MIDAS" in scale_up:
                responder = baseline > 0 and (drop / baseline) >= 0.5
            else:
                responder = baseline > 0 and (drop / baseline) >= 0.5
            e["is_responder"] = bool(responder)

    # review_overdue_days = days since the earliest pending/draft assessment's due_date.
    # We reuse `assess_rows` computed above to avoid a second scan.
    overdue_by_pat: dict[str, int] = {}
    for pid, status, due in assess_rows:
        if status not in ("draft", "pending"):
            continue
        due_cmp = _as_aware_utc(due)
        if due_cmp is None or due_cmp >= now:
            continue
        days = (now - due_cmp).days
        cur = overdue_by_pat.get(pid, 0)
        if days > cur:
            overdue_by_pat[pid] = days
    for pid, days in overdue_by_pat.items():
        out.setdefault(pid, {})["review_overdue_days"] = days

    # last_activity_at = max(last_session, last_outcome, patient.updated_at).
    # Clinicians sort by this in the "Sort: Last activity" dropdown.
    last_session_by_pat: dict[str, str] = {}
    for pid in patient_ids:
        e = out.get(pid) or {}
        d = e.get("last_session_date")
        if d:
            last_session_by_pat[pid] = d
    for p in patients:
        candidates = []
        ls = last_session_by_pat.get(p.id)
        if ls:
            candidates.append(ls)
        lo = last_outcome_at.get(p.id)
        if lo:
            candidates.append(lo)
        if p.updated_at is not None:
            updated = _as_aware_utc(p.updated_at)
            if updated is not None:
                candidates.append(updated.isoformat())
        if candidates:
            out.setdefault(p.id, {})["last_activity_at"] = max(candidates)

    return out


class PatientListResponse(BaseModel):
    items: list[PatientOut]
    total: int


# ── Status tab canonicalisation ───────────────────────────────────────────────
# UI tab slug → set of Patient.status values that belong to that tab. The FE
# and the backend both canonicalise through this map so "on_hold" / "on-hold"
# / "paused" all resolve the same way regardless of who wrote the row.

_STATUS_TAB_MEMBERS: dict[str, tuple[str, ...]] = {
    "all": (),  # empty tuple means "no filter"
    "active": ("active",),
    "intake": ("intake", "new"),
    "discharging": ("discharging",),
    "on_hold": ("paused", "on-hold", "on_hold"),
    "archived": ("archived", "discharged", "inactive"),
}


def _apply_tab_filter(patients: list, tab: str) -> list:
    members = _STATUS_TAB_MEMBERS.get(tab, ())
    if not members:
        return patients
    return [p for p in patients if (p.status or "") in members]


def _apply_search(patients: list, q: str, enrichment: dict) -> list:
    if not q:
        return patients
    needle = q.strip().lower()
    out = []
    for p in patients:
        name = f"{p.first_name or ''} {p.last_name or ''}".lower()
        cond = (p.primary_condition or "").lower()
        modality = (p.primary_modality or "").lower()
        mrn = (enrichment.get(p.id, {}).get("mrn") or "").lower()
        slug = (enrichment.get(p.id, {}).get("condition_slug") or "").lower()
        hay = " ".join([name, cond, modality, mrn, slug, p.id.lower()])
        if needle in hay:
            out.append(p)
    return out


def _apply_facet_filters(
    patients: list,
    enrichment: dict,
    *,
    condition: Optional[str],
    modality: Optional[str],
    clinician: Optional[str],
) -> list:
    out = patients
    if condition:
        needle = condition.strip().lower()
        out = [
            p for p in out
            if needle in (enrichment.get(p.id, {}).get("condition_slug") or "").lower()
            or needle in (p.primary_condition or "").lower()
        ]
    if modality:
        needle = modality.strip().lower()
        out = [p for p in out if needle in (p.primary_modality or "").lower()]
    if clinician:
        needle = clinician.strip().lower()
        out = [p for p in out if needle in (p.clinician_id or "").lower()]
    return out


def _apply_sort(patients: list, enrichment: dict, sort: str) -> list:
    sort = (sort or "last_activity").lower().replace("-", "_")
    if sort == "name":
        return sorted(
            patients,
            key=lambda p: ((p.last_name or "").lower(), (p.first_name or "").lower()),
        )
    if sort == "progress":
        def progress(p):
            e = enrichment.get(p.id, {})
            planned = int(e.get("planned_sessions_total") or 0)
            delivered = int(e.get("sessions_delivered") or 0)
            return delivered / planned if planned > 0 else -1
        return sorted(patients, key=progress, reverse=True)
    if sort == "outcome" or sort == "outcome_delta":
        def delta(p):
            e = enrichment.get(p.id, {})
            base = e.get("baseline_score")
            cur = e.get("current_score")
            if base is None or cur is None:
                return 9999
            return cur - base  # more negative = bigger improvement first
        return sorted(patients, key=delta)
    if sort == "follow_up" or sort == "needs_follow_up":
        def urgency(p):
            e = enrichment.get(p.id, {})
            return (
                0 if e.get("has_adverse_event") else 1,
                -(e.get("review_overdue_days") or 0),
            )
        return sorted(patients, key=urgency)
    # default: last_activity (newest first)
    def activity(p):
        e = enrichment.get(p.id, {})
        return e.get("last_activity_at") or ""
    return sorted(patients, key=activity, reverse=True)


def _distinct_values(patients: list, enrichment: dict) -> dict:
    conds: dict[str, int] = {}
    modalities: dict[str, int] = {}
    clinicians: dict[str, int] = {}
    for p in patients:
        slug = enrichment.get(p.id, {}).get("condition_slug") or _slugify(p.primary_condition)
        if slug:
            conds[slug] = conds.get(slug, 0) + 1
        if p.primary_modality:
            modalities[p.primary_modality] = modalities.get(p.primary_modality, 0) + 1
        if p.clinician_id:
            clinicians[p.clinician_id] = clinicians.get(p.clinician_id, 0) + 1
    return {
        "conditions": [
            {"value": k, "label": k.replace("-", " ").title(), "count": v}
            for k, v in sorted(conds.items(), key=lambda kv: -kv[1])
        ],
        "modalities": [
            {"value": k, "label": k, "count": v}
            for k, v in sorted(modalities.items(), key=lambda kv: -kv[1])
        ],
        "clinicians": [
            {"value": k, "label": k, "count": v}
            for k, v in sorted(clinicians.items(), key=lambda kv: -kv[1])
        ],
    }


def _status_counts(patients: list) -> dict:
    counts = {tab: 0 for tab in _STATUS_TAB_MEMBERS}
    counts["all"] = len(patients)
    for p in patients:
        st = p.status or ""
        for tab, members in _STATUS_TAB_MEMBERS.items():
            if tab == "all":
                continue
            if st in members:
                counts[tab] += 1
    return counts


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=PatientListResponse)
def list_patients_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
    status: Optional[str] = Query(None, description="Status tab (all|active|intake|discharging|on_hold|archived)"),
    q: Optional[str] = Query(None, description="Search by name, MRN, condition, or modality"),
    condition: Optional[str] = Query(None),
    modality: Optional[str] = Query(None),
    clinician: Optional[str] = Query(None),
    sort: Optional[str] = Query("last_activity"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> PatientListResponse:
    require_minimum_role(actor, "clinician")
    patients = list_patients(session, actor.actor_id)
    enrichment = _build_patient_enrichment(session, [p.id for p in patients], patients=patients)

    # Filter pipeline (server-side): status tab → search → facet filters → sort → paginate.
    filtered = _apply_tab_filter(patients, (status or "all").lower())
    filtered = _apply_search(filtered, q or "", enrichment)
    filtered = _apply_facet_filters(
        filtered, enrichment, condition=condition, modality=modality, clinician=clinician,
    )
    filtered = _apply_sort(filtered, enrichment, sort or "last_activity")

    total = len(filtered)
    page = filtered[offset:offset + limit]
    items = [PatientOut.from_record(p, enrichment.get(p.id)) for p in page]
    return PatientListResponse(items=items, total=total)


class CohortKPIs(BaseModel):
    active_courses: int
    active_courses_delta_7d: int
    phq_delta_avg: Optional[float]
    phq_delta_n: int
    responder_rate_pct: Optional[float]
    responder_n: int
    homework_adherence_pct: Optional[float]
    homework_adherence_n: int
    follow_up_count: int
    follow_up_overdue_7d: int
    discharged_this_quarter: int


class CohortSummary(BaseModel):
    total: int
    status_counts: dict
    distinct: dict
    kpis: CohortKPIs


@router.get("/cohort-summary", response_model=CohortSummary)
def cohort_summary_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> CohortSummary:
    """Aggregate KPIs + facet values across the clinician's full cohort.

    The Patients list page renders KPI cards ("Active course", "Avg PHQ-9 Δ",
    "Homework adherence", "Needs follow-up") that describe the whole cohort, not
    the paginated page. Compute them server-side so the numbers stay honest when
    pagination is enabled.
    """
    require_minimum_role(actor, "clinician")
    patients = list_patients(session, actor.actor_id)
    enrichment = _build_patient_enrichment(session, [p.id for p in patients], patients=patients)

    # Status + facets
    status_counts = _status_counts(patients)
    distinct = _distinct_values(patients, enrichment)

    # Active courses + 7-day delta: new approvals/started in the last 7 days.
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    quarter_start = now - timedelta(days=90)
    patient_ids = [p.id for p in patients]
    courses = session.execute(
        select(TreatmentCourse).where(TreatmentCourse.patient_id.in_(patient_ids))
    ).scalars().all() if patient_ids else []
    active_courses = [c for c in courses if c.status in ("active", "in_progress", "approved")]
    active_courses_count = len(active_courses)

    def _course_start(c):
        for attr in ("started_at", "approved_at", "created_at"):
            v = _as_aware_utc(getattr(c, attr, None))
            if v is not None:
                return v
        return None

    active_courses_delta_7d = sum(
        1 for c in active_courses if (_course_start(c) or now) >= week_ago
    )

    # PHQ-9 Δ and responder rate across the cohort (primary_scale == PHQ-*).
    phq_deltas: list[float] = []
    responders_considered = 0
    responders_count = 0
    for p in patients:
        e = enrichment.get(p.id, {})
        scale = (e.get("primary_scale") or "").upper()
        if not scale.startswith("PHQ"):
            continue
        base = e.get("baseline_score")
        cur = e.get("current_score")
        if base is None or cur is None:
            continue
        phq_deltas.append(float(cur) - float(base))
        responders_considered += 1
        if e.get("is_responder"):
            responders_count += 1
    phq_delta_avg = round(sum(phq_deltas) / len(phq_deltas), 2) if phq_deltas else None
    responder_rate_pct = (
        round(responders_count / responders_considered * 100, 1)
        if responders_considered else None
    )

    # Homework adherence: mean across patients that reported any adherence.
    adherences = [e.get("home_adherence") for e in enrichment.values() if e.get("home_adherence") is not None]
    homework_adherence_pct = round(sum(adherences) / len(adherences) * 100, 1) if adherences else None
    homework_adherence_n = len(adherences)

    # Follow-up counts
    follow_up_count = sum(
        1 for p in patients
        if (
            enrichment.get(p.id, {}).get("needs_review")
            or enrichment.get(p.id, {}).get("assessment_overdue")
            or enrichment.get(p.id, {}).get("has_adverse_event")
        )
    )
    follow_up_overdue_7d = sum(
        1 for p in patients
        if (enrichment.get(p.id, {}).get("review_overdue_days") or 0) > 7
    )

    # Discharges this quarter: AuditEvent would be cleanest, but Patient.status
    # transitions aren't currently audited. Use `updated_at` on archived/
    # discharged rows as a proxy. `status=discharged` is the strongest signal.
    discharged_this_quarter = 0
    for p in patients:
        st = (p.status or "").lower()
        if st not in ("discharged", "archived"):
            continue
        updated = _as_aware_utc(p.updated_at)
        if updated is not None and updated >= quarter_start:
            discharged_this_quarter += 1

    return CohortSummary(
        total=len(patients),
        status_counts=status_counts,
        distinct=distinct,
        kpis=CohortKPIs(
            active_courses=active_courses_count,
            active_courses_delta_7d=active_courses_delta_7d,
            phq_delta_avg=phq_delta_avg,
            phq_delta_n=len(phq_deltas),
            responder_rate_pct=responder_rate_pct,
            responder_n=responders_count,
            homework_adherence_pct=homework_adherence_pct,
            homework_adherence_n=homework_adherence_n,
            follow_up_count=follow_up_count,
            follow_up_overdue_7d=follow_up_overdue_7d,
            discharged_this_quarter=discharged_this_quarter,
        ),
    )


@router.post("", response_model=PatientOut, status_code=201)
def create_patient_endpoint(
    body: PatientCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientOut:
    require_minimum_role(actor, "clinician")
    patient = create_patient(session, clinician_id=actor.actor_id, **body.model_dump())
    return PatientOut.from_record(patient)


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient_endpoint(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientOut:
    require_minimum_role(actor, "clinician")
    patient = get_patient(session, patient_id, actor.actor_id)
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    enrichment = _build_patient_enrichment(session, [patient.id])
    return PatientOut.from_record(patient, enrichment.get(patient.id))


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient_endpoint(
    patient_id: str,
    body: PatientUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientOut:
    require_minimum_role(actor, "clinician")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    patient = update_patient(session, patient_id, actor.actor_id, **updates)
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    enrichment = _build_patient_enrichment(session, [patient.id])
    return PatientOut.from_record(patient, enrichment.get(patient.id))


@router.delete("/{patient_id}", status_code=204)
def delete_patient_endpoint(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    deleted = delete_patient(session, patient_id, actor.actor_id)
    if not deleted:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)


# ── Patient Invite ─────────────────────────────────────────────────────────────


def _generate_invite_code(clinic_prefix: str) -> str:
    """Generate an invite code like NB-2026-A3F7."""
    year = datetime.now(timezone.utc).year
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{clinic_prefix}-{year}-{suffix}"


class InviteCreateRequest(BaseModel):
    patient_name: Optional[str] = None
    patient_email: Optional[str] = None
    clinic_id: Optional[str] = None
    condition: Optional[str] = None
    expires_in_days: int = 7


class InviteCreateResponse(BaseModel):
    invite_code: str
    expires_at: str


@router.post("/invite", response_model=InviteCreateResponse, status_code=201)
def create_patient_invite(
    body: InviteCreateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> InviteCreateResponse:
    """Generate a patient invitation code. Requires clinician role or higher."""
    require_minimum_role(actor, "clinician")

    # Derive a short clinic prefix from clinic_id or actor_id
    raw_prefix = (body.clinic_id or actor.actor_id or "DS")
    prefix = "".join(c for c in raw_prefix.upper() if c.isalpha())[:4] or "DS"

    # Ensure uniqueness
    for _ in range(10):
        code = _generate_invite_code(prefix)
        existing = session.scalar(
            select(PatientInvite).where(PatientInvite.invite_code == code)
        )
        if existing is None:
            break

    expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    invite = PatientInvite(
        invite_code=code,
        patient_name=body.patient_name,
        patient_email=body.patient_email,
        clinic_id=body.clinic_id,
        clinician_id=actor.actor_id,
        condition=body.condition,
        expires_at=expires_at,
    )
    session.add(invite)
    session.commit()

    return InviteCreateResponse(
        invite_code=invite.invite_code,
        expires_at=expires_at.isoformat(),
    )


# ── Patient Sub-Resource Endpoints ────────────────────────────────────────────
# These provide patient-scoped access to sessions, courses, assessments,
# reports, and messages for both patient self-access and clinician views.


class PatientSessionsResponse(BaseModel):
    items: list[dict]
    total: int


class PatientCoursesResponse(BaseModel):
    items: list[dict]
    total: int


class PatientAssessmentsResponse(BaseModel):
    items: list[dict]
    total: int


class PatientReportsResponse(BaseModel):
    items: list[dict]
    total: int


class MessageOut(BaseModel):
    id: str
    sender_id: str
    recipient_id: str
    patient_id: Optional[str]
    body: str
    subject: Optional[str] = None
    category: Optional[str] = None
    thread_id: Optional[str] = None
    priority: Optional[str] = None
    sender_type: Optional[str] = None  # 'patient' | 'clinician'
    created_at: str
    read_at: Optional[str]
    is_read: bool = False


class PatientMessagesResponse(BaseModel):
    items: list[MessageOut]
    total: int


class SendMessageRequest(BaseModel):
    body: str
    subject: Optional[str] = None
    category: Optional[str] = None
    thread_id: Optional[str] = None
    priority: Optional[str] = None


def _session_to_dict(s) -> dict:
    return {
        "id": s.id,
        "patient_id": s.patient_id,
        "clinician_id": s.clinician_id,
        "scheduled_at": s.scheduled_at,
        "duration_minutes": s.duration_minutes,
        "modality": s.modality,
        "status": s.status,
        "outcome": s.outcome,
        "session_notes": s.session_notes,
        "session_number": s.session_number,
        "total_sessions": s.total_sessions,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }


def _course_to_dict(c) -> dict:
    return {
        "id": c.id,
        "patient_id": c.patient_id,
        "clinician_id": c.clinician_id,
        "protocol_id": c.protocol_id,
        "condition_slug": c.condition_slug,
        "modality_slug": c.modality_slug,
        "device_slug": c.device_slug,
        "status": c.status,
        "planned_sessions_total": c.planned_sessions_total,
        "sessions_delivered": c.sessions_delivered,
        "evidence_grade": c.evidence_grade,
        "on_label": c.on_label,
        "started_at": c.started_at.isoformat() if c.started_at else None,
        "completed_at": c.completed_at.isoformat() if c.completed_at else None,
        "created_at": c.created_at.isoformat(),
    }


def _assessment_to_dict(a) -> dict:
    data = {}
    try:
        data = json.loads(a.data_json or "{}")
    except Exception:
        pass
    return {
        "id": a.id,
        "patient_id": a.patient_id,
        "clinician_id": a.clinician_id,
        "template_id": a.template_id,
        "template_title": a.template_title,
        "data": data,
        "status": a.status,
        "score": a.score,
        "clinician_notes": a.clinician_notes,
        "created_at": a.created_at.isoformat(),
        "updated_at": a.updated_at.isoformat(),
    }


@router.get("/{patient_id}/sessions", response_model=PatientSessionsResponse)
def get_patient_sessions(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientSessionsResponse:
    """List sessions for a patient. Clinicians see their own patients; patients see themselves."""
    from app.persistence.models import ClinicalSession

    if actor.role == "patient":
        # Patient can only access their own sessions
        if actor.actor_id != patient_id:
            # Try to match via linked patient record — for now, limit by patient_id field
            raise ApiServiceError(
                code="forbidden",
                message="You may only view your own sessions.",
                status_code=403,
            )
        rows = session.scalars(
            select(ClinicalSession).where(ClinicalSession.patient_id == patient_id)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        rows = session.scalars(
            select(ClinicalSession).where(
                ClinicalSession.patient_id == patient_id,
                ClinicalSession.clinician_id == actor.actor_id,
            )
        ).all()

    items = [_session_to_dict(r) for r in rows]
    return PatientSessionsResponse(items=items, total=len(items))


@router.get("/{patient_id}/courses", response_model=PatientCoursesResponse)
def get_patient_courses(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientCoursesResponse:
    """List treatment courses for a patient."""
    from app.persistence.models import TreatmentCourse

    if actor.role == "patient":
        if actor.actor_id != patient_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only view your own courses.",
                status_code=403,
            )
        rows = session.scalars(
            select(TreatmentCourse).where(TreatmentCourse.patient_id == patient_id)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        rows = session.scalars(
            select(TreatmentCourse).where(
                TreatmentCourse.patient_id == patient_id,
                TreatmentCourse.clinician_id == actor.actor_id,
            )
        ).all()

    items = [_course_to_dict(r) for r in rows]
    return PatientCoursesResponse(items=items, total=len(items))


@router.get("/{patient_id}/assessments", response_model=PatientAssessmentsResponse)
def get_patient_assessments(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientAssessmentsResponse:
    """List assessments for a patient."""
    from app.persistence.models import AssessmentRecord

    if actor.role == "patient":
        if actor.actor_id != patient_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only view your own assessments.",
                status_code=403,
            )
        rows = session.scalars(
            select(AssessmentRecord).where(AssessmentRecord.patient_id == patient_id)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        rows = session.scalars(
            select(AssessmentRecord).where(
                AssessmentRecord.patient_id == patient_id,
                AssessmentRecord.clinician_id == actor.actor_id,
            )
        ).all()

    items = [_assessment_to_dict(r) for r in rows]
    return PatientAssessmentsResponse(items=items, total=len(items))


@router.get("/{patient_id}/reports", response_model=PatientReportsResponse)
def get_patient_reports(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientReportsResponse:
    """List outcome series / reports for a patient (acts as patient-facing report list)."""
    from app.persistence.models import OutcomeSeries

    if actor.role == "patient":
        if actor.actor_id != patient_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only view your own reports.",
                status_code=403,
            )
        rows = session.scalars(
            select(OutcomeSeries).where(OutcomeSeries.patient_id == patient_id)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        rows = session.scalars(
            select(OutcomeSeries).where(
                OutcomeSeries.patient_id == patient_id,
                OutcomeSeries.clinician_id == actor.actor_id,
            )
        ).all()

    items = [
        {
            "id": r.id,
            "patient_id": r.patient_id,
            "course_id": r.course_id,
            "template_id": r.template_id,
            "template_title": r.template_title,
            "score": r.score,
            "score_numeric": r.score_numeric,
            "measurement_point": r.measurement_point,
            "administered_at": r.administered_at.isoformat(),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
    return PatientReportsResponse(items=items, total=len(items))


def _assert_clinician_owns_patient(session: Session, actor: AuthenticatedActor, patient_id: str) -> None:
    """Authorise a non-patient actor for a patient's messaging thread.

    Admins bypass; other roles must be the Patient.clinician_id. Raises 403/404
    otherwise. Prevents cross-clinic message leakage.
    """
    from app.persistence.models import Patient as _Patient

    if actor.role == "admin":
        return
    patient = session.query(_Patient).filter_by(id=patient_id).first()
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    if patient.clinician_id != actor.actor_id:
        raise ApiServiceError(
            code="forbidden",
            message="You are not authorised for this patient's messages.",
            status_code=403,
        )


@router.get("/{patient_id}/messages", response_model=PatientMessagesResponse)
def get_patient_messages(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientMessagesResponse:
    """List messages associated with a patient thread."""
    from app.persistence.models import Message

    # Patients see messages where they are sender or recipient.
    # Clinicians must be the assigned clinician on the Patient record.
    if actor.role == "patient":
        rows = session.scalars(
            select(Message).where(
                (Message.patient_id == patient_id)
                | (Message.sender_id == actor.actor_id)
                | (Message.recipient_id == actor.actor_id)
            ).order_by(Message.created_at)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        _assert_clinician_owns_patient(session, actor, patient_id)
        rows = session.scalars(
            select(Message)
            .where(Message.patient_id == patient_id)
            .order_by(Message.created_at)
        ).all()

    items = [
        MessageOut(
            id=r.id,
            sender_id=r.sender_id,
            recipient_id=r.recipient_id,
            patient_id=r.patient_id,
            body=r.body,
            subject=r.subject,
            category=r.category,
            thread_id=r.thread_id,
            priority=r.priority,
            sender_type=("patient" if r.sender_id == patient_id else "clinician"),
            created_at=r.created_at.isoformat(),
            read_at=r.read_at.isoformat() if r.read_at else None,
            is_read=r.read_at is not None,
        )
        for r in rows
    ]
    return PatientMessagesResponse(items=items, total=len(items))


# ── Medical History ───────────────────────────────────────────────────────────
#
# Storage model: patient.medical_history holds a JSON blob shaped as
#   {
#     "sections": { <section_id>: { "notes": str, ... } },
#     "safety":   { "acknowledged": bool, "acknowledged_by": str,
#                   "acknowledged_at": iso, "flags": { <flag_id>: bool } },
#     "meta":     { "version": int, "updated_at": iso, "updated_by": str,
#                   "reviewed_by": str | null, "reviewed_at": iso | null,
#                   "requires_review": bool }
#   }
#
# PATCH supports partial updates via `mode`:
#   - "replace" (default legacy): replaces entire blob with body.medical_history
#   - "merge_sections": merges body.sections into existing .sections, touching
#     only named sections. Other sections preserved.
# Both modes:
#   - bump meta.version
#   - stamp meta.updated_at / meta.updated_by
#   - optionally stamp safety.acknowledged_{by,at} when body.safety.acknowledged=true
#   - optionally stamp meta.reviewed_{by,at} when body.mark_reviewed=true
#   - create an AuditEventRecord (action="medical_history.update")
#
# All sections remain optional and strings stay free-text; the structured
# shell is additive so legacy blobs continue to load without migration.

_MH_VALID_SECTIONS = {
    "presenting", "diagnoses", "safety", "psychiatric", "neurological",
    "medications", "allergies", "prior_tx", "family", "lifestyle",
    "goals", "summary",
}


class MedicalHistorySafetyBody(BaseModel):
    acknowledged: Optional[bool] = None
    flags: Optional[dict] = None


class MedicalHistoryBody(BaseModel):
    medical_history: Optional[dict] = None
    # Merge-mode inputs (preferred for partial saves):
    sections: Optional[dict] = None
    safety: Optional[MedicalHistorySafetyBody] = None
    mode: Optional[str] = None  # "replace" | "merge_sections"
    mark_reviewed: Optional[bool] = None


class MedicalHistoryResponse(BaseModel):
    patient_id: str
    medical_history: Optional[dict] = None


def _parse_mh(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _normalize_mh(data: dict) -> dict:
    """Ensure shape {sections, safety, meta} exists without destroying legacy keys."""
    out = dict(data) if isinstance(data, dict) else {}
    if "sections" not in out or not isinstance(out.get("sections"), dict):
        # Legacy blobs may store section notes at top level — fold them into sections.
        legacy = {k: v for k, v in out.items()
                  if k in _MH_VALID_SECTIONS and isinstance(v, (dict, str))}
        sections = {}
        for k, v in legacy.items():
            sections[k] = v if isinstance(v, dict) else {"notes": str(v)}
        out["sections"] = sections
    if "safety" not in out or not isinstance(out.get("safety"), dict):
        out["safety"] = {"acknowledged": False, "flags": {}}
    if "meta" not in out or not isinstance(out.get("meta"), dict):
        out["meta"] = {"version": 0, "requires_review": False}
    return out


@router.get("/{patient_id}/medical-history", response_model=MedicalHistoryResponse)
def get_medical_history(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> MedicalHistoryResponse:
    """Return structured medical history for a patient."""
    require_minimum_role(actor, "clinician")
    patient = get_patient(session, patient_id, actor.actor_id)
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    data = _parse_mh(patient.medical_history)
    if not data:
        return MedicalHistoryResponse(patient_id=patient_id, medical_history=None)
    return MedicalHistoryResponse(patient_id=patient_id, medical_history=_normalize_mh(data))


@router.patch("/{patient_id}/medical-history", response_model=MedicalHistoryResponse)
def update_medical_history(
    patient_id: str,
    body: MedicalHistoryBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> MedicalHistoryResponse:
    """Persist structured medical history for a patient.

    Supports two save modes:
      - ``replace`` (default when ``medical_history`` provided): replaces blob.
      - ``merge_sections``: merges body.sections into existing sections.

    Also stamps safety acknowledgement and reviewer metadata, and writes an
    audit event for every update.
    """
    require_minimum_role(actor, "clinician")
    patient = get_patient(session, patient_id, actor.actor_id)
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)

    current = _normalize_mh(_parse_mh(patient.medical_history))
    mode = (body.mode or ("merge_sections" if body.sections is not None else "replace")).lower()
    changed_fields: list[str] = []

    if mode == "replace":
        if body.medical_history is None:
            raise ApiServiceError(
                code="invalid_body",
                message="medical_history is required for replace mode.",
                status_code=400,
            )
        next_data = _normalize_mh(body.medical_history)
        # Preserve version lineage on replace.
        next_data.setdefault("meta", {})
        next_data["meta"]["version"] = int(current.get("meta", {}).get("version", 0)) + 1
        changed_fields.append("replace")
    else:
        # merge_sections path
        next_data = current
        if body.sections and isinstance(body.sections, dict):
            sec = dict(next_data.get("sections") or {})
            for sid, payload in body.sections.items():
                if sid not in _MH_VALID_SECTIONS:
                    continue
                if isinstance(payload, dict):
                    sec[sid] = {**(sec.get(sid) or {}), **payload}
                elif isinstance(payload, str):
                    sec[sid] = {**(sec.get(sid) or {}), "notes": payload}
                changed_fields.append(f"section:{sid}")
            next_data["sections"] = sec

    # Safety stamping (applies in either mode).
    if body.safety is not None:
        safety = dict(next_data.get("safety") or {})
        if body.safety.flags is not None:
            safety["flags"] = {**(safety.get("flags") or {}), **body.safety.flags}
            changed_fields.append("safety:flags")
        if body.safety.acknowledged is True:
            safety["acknowledged"] = True
            safety["acknowledged_by"] = actor.actor_id
            safety["acknowledged_at"] = datetime.now(timezone.utc).isoformat()
            changed_fields.append("safety:acknowledged")
        elif body.safety.acknowledged is False:
            safety["acknowledged"] = False
            safety.pop("acknowledged_by", None)
            safety.pop("acknowledged_at", None)
            changed_fields.append("safety:unacknowledged")
        next_data["safety"] = safety

    meta = dict(next_data.get("meta") or {})
    if mode != "replace":
        meta["version"] = int(meta.get("version", 0)) + 1
    meta["updated_at"] = datetime.now(timezone.utc).isoformat()
    meta["updated_by"] = actor.actor_id
    if body.mark_reviewed:
        meta["reviewed_by"] = actor.actor_id
        meta["reviewed_at"] = datetime.now(timezone.utc).isoformat()
        meta["requires_review"] = False
        changed_fields.append("reviewed")
    next_data["meta"] = meta

    patient.medical_history = json.dumps(next_data)
    session.commit()

    # Audit trail — never block the save on audit failure.
    try:
        create_audit_event(
            session,
            event_id=f"mh-{patient_id}-{meta['version']}-{int(datetime.now(timezone.utc).timestamp())}",
            target_id=patient_id,
            target_type="patient.medical_history",
            action="medical_history.update",
            role=actor.role,
            actor_id=actor.actor_id,
            note=f"mode={mode}; fields={','.join(changed_fields) or 'none'}; version={meta['version']}",
            created_at=meta["updated_at"],
        )
    except Exception:
        pass

    return MedicalHistoryResponse(patient_id=patient_id, medical_history=next_data)


# ── AI-safe medical-history context ──────────────────────────────────────────

class MedicalHistoryAIContextResponse(BaseModel):
    patient_id: str
    summary_md: str
    structured_flags: dict
    requires_review: bool
    used_sections: list[str]
    source_meta: dict
    patient_first_name: str
    patient_condition: str


@router.get(
    "/{patient_id}/medical-history/ai-context",
    response_model=MedicalHistoryAIContextResponse,
)
def get_medical_history_ai_context(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> MedicalHistoryAIContextResponse:
    """Return a prompt-safe, permission-scoped medical-history context.

    Mirrors what ``services.patient_context.build_patient_medical_context``
    would hand to an LLM. Clinicians can preview this before running
    AI summarization or report generation so they know exactly what the
    model sees.
    """
    from app.services.patient_context import build_patient_medical_context
    ctx = build_patient_medical_context(session, actor, patient_id)
    return MedicalHistoryAIContextResponse(patient_id=patient_id, **ctx)


@router.post("/{patient_id}/messages", response_model=MessageOut, status_code=201)
def send_patient_message(
    patient_id: str,
    body: SendMessageRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> MessageOut:
    """Send a message in a patient thread."""
    from app.persistence.models import Message, Patient as _Patient

    if not body.body.strip():
        raise ApiServiceError(
            code="empty_message",
            message="Message body cannot be empty.",
            status_code=400,
        )

    # For patient senders, route to the patient's assigned clinician.
    # For clinician senders, enforce ownership so a clinician cannot post
    # into another clinician's thread.
    if actor.role == "patient":
        sender_id = actor.actor_id
        _patient_rec = session.query(_Patient).filter_by(id=patient_id).first()
        recipient_id = _patient_rec.clinician_id if _patient_rec and _patient_rec.clinician_id else patient_id
    else:
        require_minimum_role(actor, "clinician")
        _assert_clinician_owns_patient(session, actor, patient_id)
        sender_id = actor.actor_id
        recipient_id = patient_id

    msg = Message(
        sender_id=sender_id,
        recipient_id=recipient_id,
        patient_id=patient_id,
        body=body.body.strip(),
        subject=body.subject,
        category=body.category,
        thread_id=body.thread_id,
        priority=body.priority,
    )
    session.add(msg)
    session.flush()  # populate msg.id before we reference it
    # Stamp thread_id on thread-starters so replies can group deterministically.
    if not msg.thread_id:
        msg.thread_id = msg.id
    session.commit()
    session.refresh(msg)

    return MessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        recipient_id=msg.recipient_id,
        patient_id=msg.patient_id,
        body=msg.body,
        subject=msg.subject,
        category=msg.category,
        thread_id=msg.thread_id,
        priority=msg.priority,
        sender_type=("patient" if actor.role == "patient" else "clinician"),
        created_at=msg.created_at.isoformat(),
        read_at=None,
        is_read=False,
    )


@router.patch("/{patient_id}/messages/{message_id}/read", response_model=MessageOut)
def mark_patient_message_read(
    patient_id: str,
    message_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> MessageOut:
    """Mark an incoming message as read for the authenticated recipient.

    Only the recipient may stamp read; honest receipts only.
    """
    from app.persistence.models import Message

    msg = session.query(Message).filter_by(id=message_id, patient_id=patient_id).first()
    if msg is None:
        raise ApiServiceError(code="not_found", message="Message not found.", status_code=404)

    if actor.role == "patient":
        if msg.recipient_id != actor.actor_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only mark messages addressed to you as read.",
                status_code=403,
            )
    else:
        require_minimum_role(actor, "clinician")
        _assert_clinician_owns_patient(session, actor, patient_id)
        if msg.recipient_id != actor.actor_id:
            raise ApiServiceError(
                code="forbidden",
                message="Only the recipient may mark a message as read.",
                status_code=403,
            )

    if msg.read_at is None:
        msg.read_at = datetime.now(timezone.utc)
        session.commit()
        session.refresh(msg)

    return MessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        recipient_id=msg.recipient_id,
        patient_id=msg.patient_id,
        body=msg.body,
        subject=msg.subject,
        category=msg.category,
        thread_id=msg.thread_id,
        priority=msg.priority,
        sender_type=("patient" if msg.sender_id == patient_id else "clinician"),
        created_at=msg.created_at.isoformat(),
        read_at=msg.read_at.isoformat() if msg.read_at else None,
        is_read=msg.read_at is not None,
    )
