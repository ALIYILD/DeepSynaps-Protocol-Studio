"""Patient Command Center router — aggregated cockpit view of all patient data.

Prefix: /api/v1/command-center
"""
from __future__ import annotations

import hashlib
import logging
import random
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.patients import resolve_patient_clinic_id
from app.settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/command-center", tags=["command-center"])


# ── Pydantic response models ────────────────────────────────────────────────

class KpiOut(BaseModel):
    label: str
    value: Any
    unit: str = ""
    trend: Optional[str] = None  # "up" | "down" | "stable"
    color: Optional[str] = None

class TimeseriesPoint(BaseModel):
    date: str
    value: float

class ChartDataOut(BaseModel):
    chart_id: str
    title: str
    chart_type: str  # "line" | "bar" | "sparkline" | "gauge"
    series: List[Dict[str, Any]] = []
    unit: str = ""

class AssessmentSummaryOut(BaseModel):
    name: str
    latest_score: Optional[float] = None
    baseline_score: Optional[float] = None
    delta_pct: Optional[float] = None
    date: Optional[str] = None
    scores: List[float] = []
    dates: List[str] = []

class WearableSummaryOut(BaseModel):
    source: str
    display_name: str
    status: str
    last_sync: Optional[str] = None
    rhr_bpm: Optional[float] = None
    hrv_ms: Optional[float] = None
    sleep_h: Optional[float] = None
    steps: Optional[int] = None
    readiness: Optional[int] = None

class SessionSummaryOut(BaseModel):
    total: int = 0
    completed: int = 0
    scheduled: int = 0
    cancelled: int = 0
    progress_pct: float = 0.0
    recent: List[Dict[str, Any]] = []

class TreatmentSummaryOut(BaseModel):
    active_course: Optional[str] = None
    protocol: Optional[str] = None
    phase: Optional[str] = None
    adherence_pct: float = 0.0
    planned_total: int = 0
    completed: int = 0

class NeuroimagingSummaryOut(BaseModel):
    eeg_count: int = 0
    mri_count: int = 0
    latest_eeg_date: Optional[str] = None
    latest_mri_date: Optional[str] = None
    eeg_findings: List[str] = []
    mri_findings: List[str] = []

class AlertOut(BaseModel):
    id: str
    flag_type: str
    severity: str
    detail: str
    triggered_at: str
    dismissed: bool = False

class CommandCenterOut(BaseModel):
    patient_id: str
    patient_name: str
    kpis: List[KpiOut] = []
    charts: List[ChartDataOut] = []
    assessments: List[AssessmentSummaryOut] = []
    wearables: List[WearableSummaryOut] = []
    sessions: SessionSummaryOut = SessionSummaryOut()
    treatment: TreatmentSummaryOut = TreatmentSummaryOut()
    neuroimaging: NeuroimagingSummaryOut = NeuroimagingSummaryOut()
    alerts: List[AlertOut] = []
    risk_tier: Optional[str] = None
    risk_score: Optional[float] = None


# ── Auth helpers ─────────────────────────────────────────────────────────────

def _require_clinician(actor: AuthenticatedActor) -> None:
    """Use the canonical role-order helper instead of an ad-hoc tuple.

    Pre-fix the tuple included ``superadmin`` and ``owner`` which are
    not in ``ROLE_ORDER``, so any code path that later looked them up
    via ``require_minimum_role`` would KeyError. Worse, an attacker
    could in principle present a token with a fabricated role string
    matching one of the unknown values and pass this check while
    failing every other gate inconsistently. The canonical helper
    closes both issues.
    """
    require_minimum_role(actor, "clinician")


# ── Lazy model imports ───────────────────────────────────────────────────────

def _import_models():
    from app.persistence.models import (
        AssessmentRecord,
        ClinicalSession,
        DeviceConnection,
        OutcomeEvent,
        OutcomeSeries,
        Patient,
        QEEGRecord,
        TreatmentCourse,
        WearableAlertFlag,
        WearableDailySummary,
    )
    return {
        "Patient": Patient,
        "ClinicalSession": ClinicalSession,
        "AssessmentRecord": AssessmentRecord,
        "TreatmentCourse": TreatmentCourse,
        "OutcomeSeries": OutcomeSeries,
        "OutcomeEvent": OutcomeEvent,
        "QEEGRecord": QEEGRecord,
        "DeviceConnection": DeviceConnection,
        "WearableDailySummary": WearableDailySummary,
        "WearableAlertFlag": WearableAlertFlag,
    }


# ── Demo data generator ─────────────────────────────────────────────────────

def _generate_demo_command_center(patient_id: str) -> dict:
    """Deterministic demo data for the command center cockpit."""
    seed = int(hashlib.sha256(patient_id.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    today = date.today()
    days_30 = [(today - timedelta(days=i)).isoformat() for i in range(29, -1, -1)]

    # Biometric trends
    rhr_vals = [round(60 + rng.gauss(0, 4), 1) for _ in range(30)]
    hrv_vals = [round(45 + rng.gauss(0, 6), 1) for _ in range(30)]
    sleep_vals = [round(6.5 + rng.gauss(0, 0.8), 2) for _ in range(30)]
    steps_vals = [max(1000, round(8000 + rng.gauss(0, 2000))) for _ in range(30)]

    # Assessment scores
    phq_scores = [round(max(0, 18 - i * 0.4 + rng.gauss(0, 1.5)), 1) for i in range(8)]
    phq_dates = [(today - timedelta(days=i * 14)).isoformat() for i in range(7, -1, -1)]
    gad_scores = [round(max(0, 14 - i * 0.3 + rng.gauss(0, 1.2)), 1) for i in range(8)]

    completed_sessions = rng.randint(12, 28)
    total_planned = 30
    adherence = round(completed_sessions / total_planned * 100, 1)

    risk_tier = rng.choice(["green", "yellow", "orange", "red"])
    risk_map = {"green": 0.12, "yellow": 0.35, "orange": 0.58, "red": 0.85}

    return CommandCenterOut(
        patient_id=patient_id,
        patient_name="Demo Patient",
        kpis=[
            KpiOut(label="Risk Tier", value=risk_tier.upper(), color=risk_tier, trend="down"),
            KpiOut(label="PHQ-9", value=phq_scores[-1], unit="pts", trend="down", color="#8b5cf6"),
            KpiOut(label="GAD-7", value=gad_scores[-1], unit="pts", trend="down", color="#3b82f6"),
            KpiOut(label="Sessions", value=f"{completed_sessions}/{total_planned}", trend="up", color="#10b981"),
            KpiOut(label="Adherence", value=adherence, unit="%", trend="stable", color="#06b6d4"),
            KpiOut(label="Resting HR", value=rhr_vals[-1], unit="bpm", trend="stable", color="#ef4444"),
            KpiOut(label="HRV", value=hrv_vals[-1], unit="ms", trend="up", color="#a855f7"),
            KpiOut(label="Sleep", value=sleep_vals[-1], unit="hrs", trend="stable", color="#3b82f6"),
        ],
        charts=[
            ChartDataOut(
                chart_id="biometrics",
                title="Biometric Trends (30d)",
                chart_type="line",
                series=[
                    {"label": "Resting HR", "color": "#ef4444", "values": rhr_vals, "dates": days_30},
                    {"label": "HRV", "color": "#a855f7", "values": hrv_vals, "dates": days_30},
                ],
                unit="bpm / ms",
            ),
            ChartDataOut(
                chart_id="sleep",
                title="Sleep Duration (30d)",
                chart_type="bar",
                series=[{"label": "Sleep", "color": "#3b82f6", "values": sleep_vals, "dates": days_30}],
                unit="hours",
            ),
            ChartDataOut(
                chart_id="steps",
                title="Daily Steps (30d)",
                chart_type="bar",
                series=[{"label": "Steps", "color": "#10b981", "values": steps_vals, "dates": days_30}],
                unit="steps",
            ),
            ChartDataOut(
                chart_id="phq9",
                title="PHQ-9 Over Time",
                chart_type="line",
                series=[{"label": "PHQ-9", "color": "#8b5cf6", "values": phq_scores, "dates": phq_dates}],
                unit="score",
            ),
            ChartDataOut(
                chart_id="gad7",
                title="GAD-7 Over Time",
                chart_type="line",
                series=[{"label": "GAD-7", "color": "#3b82f6", "values": gad_scores, "dates": phq_dates}],
                unit="score",
            ),
        ],
        assessments=[
            AssessmentSummaryOut(
                name="PHQ-9",
                latest_score=phq_scores[-1],
                baseline_score=phq_scores[0],
                delta_pct=round((phq_scores[0] - phq_scores[-1]) / max(phq_scores[0], 1) * 100, 1),
                date=phq_dates[-1],
                scores=phq_scores,
                dates=phq_dates,
            ),
            AssessmentSummaryOut(
                name="GAD-7",
                latest_score=gad_scores[-1],
                baseline_score=gad_scores[0],
                delta_pct=round((gad_scores[0] - gad_scores[-1]) / max(gad_scores[0], 1) * 100, 1),
                date=phq_dates[-1],
                scores=gad_scores,
                dates=phq_dates,
            ),
        ],
        wearables=[
            WearableSummaryOut(
                source="apple_healthkit", display_name="Apple Health",
                status="active", last_sync=(today - timedelta(hours=2)).isoformat(),
                rhr_bpm=rhr_vals[-1], hrv_ms=hrv_vals[-1],
                sleep_h=sleep_vals[-1], steps=steps_vals[-1], readiness=rng.randint(65, 90),
            ),
            WearableSummaryOut(
                source="oura_ring", display_name="Oura Ring",
                status="active", last_sync=(today - timedelta(hours=4)).isoformat(),
                rhr_bpm=round(rhr_vals[-1] - 2, 1), hrv_ms=round(hrv_vals[-1] + 5, 1),
                sleep_h=round(sleep_vals[-1] + 0.3, 2), steps=None, readiness=rng.randint(70, 95),
            ),
        ],
        sessions=SessionSummaryOut(
            total=total_planned,
            completed=completed_sessions,
            scheduled=rng.randint(1, 3),
            cancelled=rng.randint(0, 3),
            progress_pct=round(completed_sessions / total_planned * 100, 1),
            recent=[
                {"date": (today - timedelta(days=d)).isoformat(),
                 "status": rng.choice(["completed", "completed", "completed", "cancelled"]),
                 "protocol": "Alpha-Theta Neurofeedback",
                 "duration_min": rng.randint(35, 55)}
                for d in range(5)
            ],
        ),
        treatment=TreatmentSummaryOut(
            active_course="TMS + Neurofeedback Course",
            protocol="Alpha-Theta Neurofeedback",
            phase="Active" if completed_sessions < 20 else "Maintenance",
            adherence_pct=adherence,
            planned_total=total_planned,
            completed=completed_sessions,
        ),
        neuroimaging=NeuroimagingSummaryOut(
            eeg_count=rng.randint(2, 6),
            mri_count=rng.randint(0, 2),
            latest_eeg_date=(today - timedelta(days=rng.randint(7, 30))).isoformat(),
            latest_mri_date=(today - timedelta(days=rng.randint(30, 180))).isoformat() if rng.random() > 0.3 else None,
            eeg_findings=["Elevated theta/beta ratio (frontal)", "Reduced alpha peak frequency"],
            mri_findings=["Within normal limits"] if rng.random() > 0.5 else [],
        ),
        alerts=[
            AlertOut(
                id=f"alert-{i}",
                flag_type=rng.choice(["hrv_low", "sleep_disruption", "missed_session", "prom_decline"]),
                severity=rng.choice(["info", "warning", "critical"]),
                detail=rng.choice([
                    "HRV dropped below 25ms threshold",
                    "Sleep duration < 5h for 3 consecutive nights",
                    "Missed 2 scheduled sessions",
                    "PHQ-9 increased by 4+ points",
                ]),
                triggered_at=(today - timedelta(days=rng.randint(0, 14))).isoformat(),
                dismissed=i > 1,
            )
            for i in range(4)
        ],
        risk_tier=risk_tier,
        risk_score=risk_map.get(risk_tier, 0.3),
    ).model_dump()


# ── Real data aggregator ─────────────────────────────────────────────────────

def _build_command_center(patient_id: str, db: Session) -> dict:
    """Query real data from the database and assemble the command center payload."""
    M = _import_models()

    patient = db.query(M["Patient"]).filter(M["Patient"].id == patient_id).first()
    if not patient:
        raise ApiServiceError("Patient not found", status_code=404)

    patient_name = f"{patient.first_name or ''} {patient.last_name or ''}".strip() or "Unknown"
    today = date.today()

    # Sessions
    sessions = db.query(M["ClinicalSession"]).filter(
        M["ClinicalSession"].patient_id == patient_id
    ).order_by(M["ClinicalSession"].scheduled_date.desc()).all()

    completed = [s for s in sessions if s.status == "completed"]
    scheduled = [s for s in sessions if s.status in ("scheduled", "confirmed")]
    cancelled = [s for s in sessions if s.status in ("cancelled", "no_show")]

    # Course
    courses = db.query(M["TreatmentCourse"]).filter(
        M["TreatmentCourse"].patient_id == patient_id
    ).order_by(M["TreatmentCourse"].created_at.desc()).all()
    active_course = next((c for c in courses if c.status in ("active", "in_progress")), courses[0] if courses else None)

    total_planned = getattr(active_course, "planned_sessions_total", None) or getattr(active_course, "total_sessions", 0) or 20
    progress_pct = round(len(completed) / max(total_planned, 1) * 100, 1)

    # Assessments
    assessments_raw = db.query(M["AssessmentRecord"]).filter(
        M["AssessmentRecord"].patient_id == patient_id
    ).order_by(M["AssessmentRecord"].administered_at.desc()).all()

    assessment_groups: Dict[str, list] = {}
    for a in assessments_raw:
        key = a.template_name or a.assessment_type or "Unknown"
        assessment_groups.setdefault(key, []).append(a)

    assessment_summaries = []
    for name, records in assessment_groups.items():
        records_sorted = sorted(records, key=lambda r: r.administered_at or datetime.min)
        scores = [r.score_numeric for r in records_sorted if r.score_numeric is not None]
        dates = [r.administered_at.isoformat() if r.administered_at else "" for r in records_sorted]
        if scores:
            baseline = scores[0]
            latest = scores[-1]
            delta = round((baseline - latest) / max(abs(baseline), 1) * 100, 1) if baseline else None
            assessment_summaries.append(AssessmentSummaryOut(
                name=name, latest_score=latest, baseline_score=baseline,
                delta_pct=delta, date=dates[-1] if dates else None,
                scores=scores, dates=dates,
            ))

    # Wearable connections + daily summaries
    connections = db.query(M["DeviceConnection"]).filter(
        M["DeviceConnection"].patient_id == patient_id
    ).all()

    wearable_summaries = []
    for conn in connections:
        latest_daily = db.query(M["WearableDailySummary"]).filter(
            M["WearableDailySummary"].patient_id == patient_id,
            M["WearableDailySummary"].source == conn.source,
        ).order_by(M["WearableDailySummary"].date.desc()).first()

        wearable_summaries.append(WearableSummaryOut(
            source=conn.source,
            display_name=conn.display_name or conn.source,
            status=conn.status or "unknown",
            last_sync=conn.last_sync_at.isoformat() if conn.last_sync_at else None,
            rhr_bpm=latest_daily.rhr_bpm if latest_daily else None,
            hrv_ms=latest_daily.hrv_ms if latest_daily else None,
            sleep_h=latest_daily.sleep_duration_h if latest_daily else None,
            steps=latest_daily.steps if latest_daily else None,
            readiness=latest_daily.readiness_score if latest_daily else None,
        ))

    # Biometric trends (last 30 days)
    thirty_days_ago = today - timedelta(days=30)
    daily_summaries = db.query(M["WearableDailySummary"]).filter(
        M["WearableDailySummary"].patient_id == patient_id,
        M["WearableDailySummary"].date >= thirty_days_ago.isoformat(),
    ).order_by(M["WearableDailySummary"].date.asc()).all()

    rhr_series = [{"date": s.date, "value": s.rhr_bpm} for s in daily_summaries if s.rhr_bpm is not None]
    hrv_series = [{"date": s.date, "value": s.hrv_ms} for s in daily_summaries if s.hrv_ms is not None]
    sleep_series = [{"date": s.date, "value": s.sleep_duration_h} for s in daily_summaries if s.sleep_duration_h is not None]
    steps_series = [{"date": s.date, "value": s.steps} for s in daily_summaries if s.steps is not None]

    charts = []
    if rhr_series or hrv_series:
        series_list = []
        if rhr_series:
            series_list.append({"label": "Resting HR", "color": "#ef4444",
                                "values": [p["value"] for p in rhr_series],
                                "dates": [p["date"] for p in rhr_series]})
        if hrv_series:
            series_list.append({"label": "HRV", "color": "#a855f7",
                                "values": [p["value"] for p in hrv_series],
                                "dates": [p["date"] for p in hrv_series]})
        charts.append(ChartDataOut(chart_id="biometrics", title="Biometric Trends (30d)",
                                    chart_type="line", series=series_list, unit="bpm / ms"))
    if sleep_series:
        charts.append(ChartDataOut(chart_id="sleep", title="Sleep Duration (30d)",
                                    chart_type="bar",
                                    series=[{"label": "Sleep", "color": "#3b82f6",
                                             "values": [p["value"] for p in sleep_series],
                                             "dates": [p["date"] for p in sleep_series]}],
                                    unit="hours"))
    if steps_series:
        charts.append(ChartDataOut(chart_id="steps", title="Daily Steps (30d)",
                                    chart_type="bar",
                                    series=[{"label": "Steps", "color": "#10b981",
                                             "values": [p["value"] for p in steps_series],
                                             "dates": [p["date"] for p in steps_series]}],
                                    unit="steps"))

    # Assessment score trend charts
    for asmt in assessment_summaries[:4]:
        if len(asmt.scores) >= 2:
            charts.append(ChartDataOut(
                chart_id=asmt.name.lower().replace(" ", "_").replace("-", ""),
                title=f"{asmt.name} Over Time",
                chart_type="line",
                series=[{"label": asmt.name, "color": "#8b5cf6", "values": asmt.scores, "dates": asmt.dates}],
                unit="score",
            ))

    # EEG / neuroimaging
    eeg_records = db.query(M["QEEGRecord"]).filter(
        M["QEEGRecord"].patient_id == patient_id
    ).order_by(M["QEEGRecord"].recorded_at.desc()).all()

    neuro = NeuroimagingSummaryOut(
        eeg_count=len(eeg_records),
        latest_eeg_date=eeg_records[0].recorded_at.isoformat() if eeg_records else None,
        eeg_findings=[str(e.findings or "") for e in eeg_records[:3] if e.findings],
    )

    # Alerts
    alert_flags = db.query(M["WearableAlertFlag"]).filter(
        M["WearableAlertFlag"].patient_id == patient_id
    ).order_by(M["WearableAlertFlag"].triggered_at.desc()).limit(10).all()

    alerts = [
        AlertOut(
            id=str(a.id),
            flag_type=a.flag_type or "unknown",
            severity=a.severity or "info",
            detail=str(a.detail or ""),
            triggered_at=a.triggered_at.isoformat() if a.triggered_at else "",
            dismissed=bool(a.dismissed),
        )
        for a in alert_flags
    ]

    # Build KPIs
    latest_rhr = rhr_series[-1]["value"] if rhr_series else None
    latest_hrv = hrv_series[-1]["value"] if hrv_series else None
    latest_sleep = sleep_series[-1]["value"] if sleep_series else None

    kpis = [
        KpiOut(label="Sessions", value=f"{len(completed)}/{total_planned}", trend="up", color="#10b981"),
        KpiOut(label="Adherence", value=progress_pct, unit="%", trend="stable", color="#06b6d4"),
    ]
    if assessment_summaries:
        a0 = assessment_summaries[0]
        kpis.insert(0, KpiOut(label=a0.name, value=a0.latest_score, unit="pts", trend="down" if (a0.delta_pct or 0) > 0 else "up", color="#8b5cf6"))
    if latest_rhr is not None:
        kpis.append(KpiOut(label="Resting HR", value=latest_rhr, unit="bpm", color="#ef4444"))
    if latest_hrv is not None:
        kpis.append(KpiOut(label="HRV", value=latest_hrv, unit="ms", color="#a855f7"))
    if latest_sleep is not None:
        kpis.append(KpiOut(label="Sleep", value=latest_sleep, unit="hrs", color="#3b82f6"))

    return CommandCenterOut(
        patient_id=patient_id,
        patient_name=patient_name,
        kpis=kpis,
        charts=charts,
        assessments=assessment_summaries,
        wearables=wearable_summaries,
        sessions=SessionSummaryOut(
            total=total_planned,
            completed=len(completed),
            scheduled=len(scheduled),
            cancelled=len(cancelled),
            progress_pct=progress_pct,
            recent=[
                {"date": s.scheduled_date.isoformat() if s.scheduled_date else "",
                 "status": s.status,
                 "protocol": getattr(s, "protocol_name", None) or "",
                 "duration_min": getattr(s, "duration_min", None) or 0}
                for s in sessions[:5]
            ],
        ),
        treatment=TreatmentSummaryOut(
            active_course=active_course.name if active_course and hasattr(active_course, "name") else None,
            protocol=getattr(active_course, "protocol_name", None),
            phase="Active" if len(completed) < total_planned * 0.7 else "Maintenance",
            adherence_pct=progress_pct,
            planned_total=total_planned,
            completed=len(completed),
        ),
        neuroimaging=neuro,
        alerts=alerts,
    ).model_dump()


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/{patient_id}", response_model=CommandCenterOut)
async def get_command_center(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return the full command-center cockpit data for a patient.

    Pre-fix this endpoint:

    * **Cross-clinic IDOR** — the role gate accepted any clinician+
      role but never compared the patient's ``clinic_id`` to the
      actor's. Clinician in clinic A could enumerate clinic B
      patients (KPIs, alerts, EEG findings, wearables — full PHI
      cockpit).
    * **Demo-fallback PHI fabrication** — a bare ``except Exception``
      fell back to ``_generate_demo_command_center(patient_id)`` for
      any DB error or missing patient. The clinician saw fabricated
      PHQ-9, risk-tier, and KPI values **as if real**, with the
      missing-patient 404 path silently masked.

    Post-fix: the cross-clinic gate runs before any data is
    assembled, and the demo fallback is gated to development mode
    only. Production / staging propagate the failure as a 500 so the
    bug is visible instead of silently fabricating clinical data.
    """
    _require_clinician(actor)

    # Cross-clinic ownership gate. ``resolve_patient_clinic_id``
    # returns ``(exists, clinic_id)``; a missing patient surfaces as
    # 404 below, and a real patient is then permission-checked
    # against the actor's clinic_id.
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )
    require_patient_owner(actor, clinic_id)

    try:
        return _build_command_center(patient_id, db)
    except ApiServiceError:
        raise
    except Exception:
        # Don't echo raw patient_id (PHI). Log a short hash so ops can
        # correlate without writing the identifier to disk.
        pid_hash = hashlib.sha256(patient_id.encode("utf-8")).hexdigest()[:12]
        app_env = (get_settings().app_env or "development").lower()
        if app_env in {"production", "staging"}:
            # Surface the real failure — fabricating PHQ-9 / risk
            # tiers and pretending they're real patient data is a
            # patient-safety bug, not a graceful fallback.
            logger.exception(
                "command_center build failed in app_env=%s patient=%s",
                app_env, pid_hash,
            )
            raise
        logger.info(
            "command_center build failed in app_env=%s patient=%s — "
            "returning demo payload (dev-only fallback)",
            app_env, pid_hash,
        )
        return _generate_demo_command_center(patient_id)
