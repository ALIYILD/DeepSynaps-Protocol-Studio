"""Wellness & Lifestyle Platform router.

Provides endpoints for sleep optimization, stress/resilience management,
exercise prescription, lifestyle assessments (WHO-5, SF-12, MEQ, MDS, UCLA),
protocol builder, wearable data integration, and wellness wheel visualization.

All endpoints are clinic-scoped and require appropriate authentication.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
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
from app.repositories.patients import resolve_patient_clinic_id

# Import wellness service functions
from app.services.wellness_service import (
    get_wellness_patients,
    get_wellness_profile,
    submit_sleep_diary,
    get_sleep_history,
    calculate_sleep_efficiency,
    submit_stress_assessment,
    get_stress_history,
    log_exercise,
    get_exercise_history,
    submit_wellness_assessment,
    get_assessment_history,
    create_wellness_protocol,
    get_patient_protocols,
    log_wellness_session,
    get_progress_summary,
    get_wellness_wheel_data,
)

router = APIRouter(prefix="/api/v1/wellness", tags=["Wellness & Lifestyle"])


# ─── Helper: gate patient access ─────────────────────────────────────────────


def _gate_patient_access(
    actor: AuthenticatedActor, patient_id: str, db: Session
) -> None:
    """Verify the actor has access to the specified patient."""
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


# ═══════════════════════════════════════════════════════════════════════════════
# Request / Response Schemas
# ═══════════════════════════════════════════════════════════════════════════════


class SleepDiaryEntry(BaseModel):
    patient_id: str
    date: str
    bedtime: str
    wake_time: str
    awakenings: int = Field(0, ge=0, le=20)
    quality: int = Field(5, ge=1, le=10)
    sleep_latency: int = Field(15, ge=0, le=120)
    notes: str | None = None


class StressAssessmentSubmission(BaseModel):
    patient_id: str
    pss_scores: list[int] = Field(..., min_length=10, max_length=10, description="10 PSS-10 item scores (0-4 each)")
    dass_stress_items: list[int] | None = Field(None, min_length=7, max_length=7)
    dass_anxiety_items: list[int] | None = Field(None, min_length=7, max_length=7)
    dass_depression_items: list[int] | None = Field(None, min_length=7, max_length=7)
    hrv_rmssd: float | None = None
    coherence: float | None = None
    assessment_date: str | None = None


class ExerciseLogEntry(BaseModel):
    patient_id: str
    date: str
    type: str
    duration: int = Field(..., ge=1, le=300)
    intensity: str = "moderate"  # light, moderate, vigorous
    mood_before: int | None = Field(None, ge=1, le=10)
    mood_after: int | None = Field(None, ge=1, le=10)
    enjoyment: int | None = Field(None, ge=1, le=10)
    notes: str | None = None


class WellnessAssessmentSubmission(BaseModel):
    patient_id: str
    assessment_type: str  # WHO-5, SF-12, PSS-10, MEQ, MDS, UCLA, PROMIS, CUSTOM
    scores: dict[str, Any]
    assessment_date: str | None = None
    notes: str | None = None


class ProtocolCreate(BaseModel):
    patient_id: str
    name: str
    template: str
    duration_weeks: int = Field(..., ge=1, le=52)
    category: str
    evidence_grade: str | None = None
    start_date: str | None = None
    clinician_notes: str | None = None


class SessionLogEntry(BaseModel):
    patient_id: str
    protocol_id: str | None = None
    session_date: str
    duration_minutes: int = Field(..., ge=1, le=480)
    session_type: str | None = None
    notes: str | None = None
    adherence_rating: int | None = Field(None, ge=1, le=10)


class WellnessPatientListResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int


class SleepHistoryResponse(BaseModel):
    patient_id: str
    items: list[dict[str, Any]]
    total: int
    avg_efficiency: float | None = None
    avg_quality: float | None = None


class StressHistoryResponse(BaseModel):
    patient_id: str
    items: list[dict[str, Any]]
    total: int
    latest_pss: int | None = None
    latest_hrv: float | None = None


class ExerciseHistoryResponse(BaseModel):
    patient_id: str
    items: list[dict[str, Any]]
    total: int
    weekly_minutes: int | None = None


class AssessmentHistoryResponse(BaseModel):
    patient_id: str
    items: list[dict[str, Any]]
    total: int


class ProtocolListResponse(BaseModel):
    patient_id: str
    items: list[dict[str, Any]]
    total: int


class WellnessWheelResponse(BaseModel):
    patient_id: str
    domains: list[dict[str, Any]]
    overall_score: float | None = None


class ProgressSummaryResponse(BaseModel):
    patient_id: str
    overall_wellness_score: float | None = None
    sleep_summary: dict[str, Any] | None = None
    stress_summary: dict[str, Any] | None = None
    exercise_summary: dict[str, Any] | None = None
    assessment_summary: dict[str, Any] | None = None
    protocol_summary: dict[str, Any] | None = None
    alerts: list[str] = Field(default_factory=list)
    generated_at: str = ""


class SleepEfficiencyRequest(BaseModel):
    time_in_bed_hours: float = Field(..., gt=0, le=24)
    total_sleep_hours: float = Field(..., gt=0, le=24)


class SleepEfficiencyResponse(BaseModel):
    efficiency_pct: float
    time_in_bed_hours: float
    total_sleep_hours: float
    interpretation: str


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════


# ─── Patient Management ───────────────────────────────────────────────────────


@router.get("/patients", response_model=WellnessPatientListResponse)
async def list_wellness_patients(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
    q: str | None = Query(None, description="Search by patient name or ID"),
    status: str | None = Query(None, description="Filter by enrollment status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> WellnessPatientListResponse:
    """List patients enrolled in wellness programs, scoped to the actor's clinic."""
    require_minimum_role(actor, "clinician")
    clinic_id = getattr(actor, "clinic_id", None) or getattr(actor, "owned_clinic_ids", [None])[0]
    if not clinic_id:
        raise HTTPException(status_code=403, detail="No clinic associated with actor")

    items = get_wellness_patients(
        db, clinic_id, query=q, status=status, limit=limit, offset=offset
    )
    return WellnessPatientListResponse(items=items, total=len(items))


@router.get("/patients/{patient_id}", response_model=dict[str, Any])
async def get_patient_wellness_profile(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Get comprehensive wellness profile for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    profile = get_wellness_profile(db, patient_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Wellness profile not found for {patient_id}")
    return profile


# ─── Sleep Optimization ───────────────────────────────────────────────────────


@router.post("/sleep-diary", response_model=dict[str, Any])
async def create_sleep_diary_entry(
    entry: SleepDiaryEntry,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Submit a new sleep diary entry for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, entry.patient_id, db)

    result = submit_sleep_diary(db, entry.patient_id, entry.model_dump())
    return {
        "ok": True,
        "entry_id": result.get("id"),
        "sleep_efficiency": result.get("sleep_efficiency"),
        "efficiency_interpretation": result.get("efficiency_interpretation"),
        "patient_id": entry.patient_id,
    }


@router.get("/sleep/{patient_id}", response_model=SleepHistoryResponse)
async def get_patient_sleep_history(
    patient_id: str,
    days: int = Query(30, ge=1, le=365),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SleepHistoryResponse:
    """Get sleep diary history for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    items = get_sleep_history(db, patient_id, days=days)
    avg_eff = None
    avg_qual = None
    if items:
        avg_eff = round(sum(i.get("efficiency", 0) for i in items) / len(items), 1) if any(i.get("efficiency") for i in items) else None
        avg_qual = round(sum(i.get("quality", 0) for i in items) / len(items), 1) if any(i.get("quality") for i in items) else None

    return SleepHistoryResponse(
        patient_id=patient_id,
        items=items,
        total=len(items),
        avg_efficiency=avg_eff,
        avg_quality=avg_qual,
    )


@router.post("/sleep/calculate-efficiency", response_model=SleepEfficiencyResponse)
async def calculate_sleep_efficiency_endpoint(
    req: SleepEfficiencyRequest,
) -> SleepEfficiencyResponse:
    """Calculate sleep efficiency from time-in-bed and total-sleep-time."""
    eff = calculate_sleep_efficiency(req.time_in_bed_hours, req.total_sleep_hours)
    interp = ""
    if eff >= 85:
        interp = "Good sleep efficiency."
    elif eff >= 70:
        interp = "Moderate sleep efficiency. Consider sleep hygiene improvements."
    else:
        interp = "Poor sleep efficiency. CBT-I intervention recommended."

    return SleepEfficiencyResponse(
        efficiency_pct=eff,
        time_in_bed_hours=req.time_in_bed_hours,
        total_sleep_hours=req.total_sleep_hours,
        interpretation=interp,
    )


# ─── Stress & Resilience ──────────────────────────────────────────────────────


@router.post("/stress-assessment", response_model=dict[str, Any])
async def create_stress_assessment(
    submission: StressAssessmentSubmission,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Submit a stress assessment (PSS-10 + optional DASS-21) for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, submission.patient_id, db)

    result = submit_stress_assessment(
        db,
        submission.patient_id,
        pss_scores=submission.pss_scores,
        dass_stress_items=submission.dass_stress_items,
        dass_anxiety_items=submission.dass_anxiety_items,
        dass_depression_items=submission.dass_depression_items,
        hrv_rmssd=submission.hrv_rmssd,
        coherence=submission.coherence,
        assessment_date=submission.assessment_date,
    )
    return {
        "ok": True,
        "assessment_id": result.get("id"),
        "pss_score": result.get("pss_score"),
        "pss_interpretation": result.get("pss_interpretation"),
        "dass_scores": result.get("dass_scores"),
        "dass_interpretation": result.get("dass_interpretation"),
        "patient_id": submission.patient_id,
    }


@router.get("/stress/{patient_id}", response_model=StressHistoryResponse)
async def get_patient_stress_history(
    patient_id: str,
    limit: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StressHistoryResponse:
    """Get stress assessment history for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    items = get_stress_history(db, patient_id, limit=limit)
    latest_pss = items[0].get("pss_score") if items else None
    latest_hrv = items[0].get("hrv_rmssd") if items else None

    return StressHistoryResponse(
        patient_id=patient_id,
        items=items,
        total=len(items),
        latest_pss=latest_pss,
        latest_hrv=latest_hrv,
    )


# ─── Exercise ─────────────────────────────────────────────────────────────────


@router.post("/exercise", response_model=dict[str, Any])
async def create_exercise_entry(
    entry: ExerciseLogEntry,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Log an exercise session for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, entry.patient_id, db)

    result = log_exercise(db, entry.patient_id, entry.model_dump())
    return {
        "ok": True,
        "entry_id": result.get("id"),
        "mood_delta": result.get("mood_delta"),
        "patient_id": entry.patient_id,
    }


@router.get("/exercise/{patient_id}", response_model=ExerciseHistoryResponse)
async def get_patient_exercise_history(
    patient_id: str,
    days: int = Query(30, ge=1, le=365),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ExerciseHistoryResponse:
    """Get exercise history for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    items = get_exercise_history(db, patient_id, days=days)
    weekly = sum(i.get("duration", 0) for i in items) if items else 0

    return ExerciseHistoryResponse(
        patient_id=patient_id,
        items=items,
        total=len(items),
        weekly_minutes=weekly,
    )


# ─── Wellness Assessments ─────────────────────────────────────────────────────


@router.post("/assessments", response_model=dict[str, Any])
async def create_wellness_assessment(
    submission: WellnessAssessmentSubmission,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Submit a wellness assessment (WHO-5, SF-12, MEQ, MDS, UCLA, PROMIS)."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, submission.patient_id, db)

    result = submit_wellness_assessment(
        db,
        submission.patient_id,
        submission.assessment_type,
        submission.scores,
        assessment_date=submission.assessment_date,
    )
    return {
        "ok": True,
        "assessment_id": result.get("id"),
        "computed_scores": result.get("computed_scores"),
        "interpretation": result.get("interpretation"),
        "patient_id": submission.patient_id,
    }


@router.get("/assessments/{patient_id}", response_model=AssessmentHistoryResponse)
async def get_patient_assessment_history(
    patient_id: str,
    assessment_type: str | None = Query(None, description="Filter by assessment type"),
    limit: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AssessmentHistoryResponse:
    """Get wellness assessment history for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    items = get_assessment_history(db, patient_id, assessment_type=assessment_type, limit=limit)
    return AssessmentHistoryResponse(patient_id=patient_id, items=items, total=len(items))


# ─── Protocol Builder ─────────────────────────────────────────────────────────


@router.post("/protocols", response_model=dict[str, Any])
async def create_protocol(
    protocol: ProtocolCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Create and assign a wellness protocol to a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, protocol.patient_id, db)

    result = create_wellness_protocol(db, protocol.patient_id, protocol.model_dump())
    return {
        "ok": True,
        "protocol_id": result.get("id"),
        "name": result.get("name"),
        "status": result.get("status"),
        "patient_id": protocol.patient_id,
    }


@router.get("/protocols/{patient_id}", response_model=ProtocolListResponse)
async def get_patient_protocols(
    patient_id: str,
    status: str | None = Query(None, description="Filter by status: active, completed, paused"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolListResponse:
    """Get wellness protocols assigned to a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    items = get_patient_protocols(db, patient_id, status=status)
    return ProtocolListResponse(patient_id=patient_id, items=items, total=len(items))


# ─── Session Logging ──────────────────────────────────────────────────────────


@router.post("/sessions", response_model=dict[str, Any])
async def log_session(
    entry: SessionLogEntry,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Log a wellness session (protocol delivery note)."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, entry.patient_id, db)

    result = log_wellness_session(db, entry.patient_id, entry.model_dump())
    return {
        "ok": True,
        "session_id": result.get("id"),
        "patient_id": entry.patient_id,
    }


# ─── Progress Summary ─────────────────────────────────────────────────────────


@router.get("/progress/{patient_id}", response_model=ProgressSummaryResponse)
async def get_patient_progress(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProgressSummaryResponse:
    """Get comprehensive wellness progress summary for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    summary = get_progress_summary(db, patient_id)
    summary["generated_at"] = datetime.now(timezone.utc).isoformat()
    return ProgressSummaryResponse(**summary)


# ─── Wellness Wheel ───────────────────────────────────────────────────────────


@router.get("/wheel/{patient_id}", response_model=WellnessWheelResponse)
async def get_patient_wheel(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessWheelResponse:
    """Get wellness wheel data (6-domain holistic assessment)."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    domains = get_wellness_wheel_data(db, patient_id)
    overall = None
    if domains:
        scores = [d.get("score", 0) for d in domains]
        overall = round(sum(scores) / len(scores), 1) if scores else None

    return WellnessWheelResponse(
        patient_id=patient_id,
        domains=domains,
        overall_score=overall,
    )


# ─── CBT-I Protocol Template ──────────────────────────────────────────────────


@router.get("/protocols/templates/cbti", response_model=dict[str, Any])
async def get_cbti_template(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get the CBT-I (Cognitive Behavioral Therapy for Insomnia) protocol template."""
    require_minimum_role(actor, "clinician")
    return {
        "name": "CBT-I Protocol",
        "description": "4-week structured CBT-I for chronic insomnia",
        "duration_weeks": 4,
        "evidence_grade": "A",
        "evidence_source": "AASM Clinical Practice Guideline, 2021",
        "components": [
            {
                "name": "Stimulus Control",
                "description": "Reassociate bed with sleep; eliminate sleep-incompatible activities",
                "instructions": [
                    "Go to bed only when sleepy",
                    "Use bed only for sleep and intimacy",
                    "If awake >20 min, leave bed and do quiet activity",
                    "Return only when sleepy",
                    "Fixed wake time daily regardless of sleep",
                ],
            },
            {
                "name": "Sleep Restriction",
                "description": "Limit time in bed to actual sleep time to increase sleep drive",
                "instructions": [
                    "Calculate average total sleep time from 1-week diary",
                    "Set time-in-bed (TIB) = average TST (minimum 5 hours)",
                    "Fixed wake time; bedtime = wake time - TIB",
                    "When sleep efficiency >85% for 1 week, increase TIB by 15 min",
                    "If SE <80%, decrease TIB by 15 min",
                ],
                "cautions": ["Daytime sleepiness initially", "Avoid driving when drowsy", "Minimum TIB = 5 hours"],
            },
            {
                "name": "Cognitive Restructuring",
                "description": "Address dysfunctional beliefs and attitudes about sleep",
                "instructions": [
                    "Identify catastrophic sleep thoughts",
                    "Challenge beliefs using evidence and alternative perspectives",
                    "Thought records for nighttime rumination",
                    "Normalize occasional poor sleep",
                    "Reduce sleep effort and performance anxiety",
                ],
            },
            {
                "name": "Sleep Hygiene Education",
                "description": "Optimize environmental and behavioral factors for sleep",
                "instructions": [
                    "Consistent sleep/wake schedule ±30 min",
                    "Dark, cool (60-67F), quiet bedroom",
                    "No screens 1 hour before bed",
                    "No caffeine after 2 PM",
                    "No alcohol within 3 hours of bedtime",
                    "Regular exercise (not within 3h of bed)",
                    "Morning light exposure 15-30 min",
                ],
            },
        ],
        "outcome_measures": [
            {"name": "Sleep Efficiency", "target": ">85%", "timeframe": "Week 4"},
            {"name": "Insomnia Severity Index", "target": "<8", "timeframe": "Week 4"},
            {"name": "Pittsburgh Sleep Quality Index", "target": "<5", "timeframe": "Week 4"},
        ],
        "disclaimer": "CBT-I is a structured psychotherapy intervention. This template is for clinician-guided use. Not for autonomous patient self-treatment without clinical oversight.",
    }


# ─── Breathing Exercise Guide ─────────────────────────────────────────────────


@router.get("/breathing-exercises", response_model=list[dict[str, Any]])
async def list_breathing_exercises(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, Any]]:
    """Get evidence-based breathing exercise specifications."""
    require_minimum_role(actor, "clinician")
    return [
        {
            "id": "box",
            "name": "Box Breathing",
            "pattern": {"inhale": 4, "hold1": 4, "exhale": 4, "hold2": 4},
            "description": "Equal-duration phases used by Navy SEALs for stress control.",
            "evidence": "Reduces cortisol and improves HRV coherence (Ma et al., 2017)",
            "indications": ["Acute stress", "Pre-sleep wind-down", "Performance anxiety"],
        },
        {
            "id": "4-7-8",
            "name": "4-7-8 Breathing",
            "pattern": {"inhale": 4, "hold1": 7, "exhale": 8, "hold2": 0},
            "description": "Extended exhalation activates parasympathetic nervous system.",
            "evidence": "Promotes sleep onset via vagal tone enhancement (Weil, 2015)",
            "indications": ["Insomnia", "Anxiety", "Panic symptoms"],
        },
        {
            "id": "resonant",
            "name": "Resonant Breathing",
            "pattern": {"inhale": 5.5, "hold1": 0, "exhale": 5.5, "hold2": 0},
            "description": "Breathing at resonant frequency (~5.5 breaths/min) maximizes HRV amplitude.",
            "evidence": "Lehrer et al. (2003) — HRV biofeedback at resonant frequency improves autonomic regulation",
            "indications": ["HRV training", "Autonomic dysregulation", "Chronic stress"],
        },
        {
            "id": "coherent",
            "name": "Coherent Breathing",
            "pattern": {"inhale": 5, "hold1": 0, "exhale": 5, "hold2": 0},
            "description": "6 breaths per minute to synchronize heart rate oscillations.",
            "evidence": "McCraty et al. (2014) — HeartMath coherence training improves emotional regulation",
            "indications": ["Emotional regulation", "Performance optimization", "PTSD"],
        },
    ]


# ─── Wellness Protocol Templates List ─────────────────────────────────────────


@router.get("/protocols/templates/all", response_model=list[dict[str, Any]])
async def list_protocol_templates(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, Any]]:
    """List all 10 evidence-based wellness protocol templates."""
    require_minimum_role(actor, "clinician")
    return [
        {
            "id": "sleep-restoration",
            "name": "Sleep Restoration Program",
            "template": "Sleep restoration (4-week CBT-I based)",
            "duration_weeks": 4,
            "category": "sleep",
            "evidence_grade": "A",
            "description": "Structured CBT-I protocol combining stimulus control, sleep restriction, cognitive restructuring, and sleep hygiene education.",
        },
        {
            "id": "stress-resilience",
            "name": "Stress Resilience Training",
            "template": "Stress resilience (6-week HRV + mindfulness)",
            "duration_weeks": 6,
            "category": "stress",
            "evidence_grade": "B",
            "description": "HRV biofeedback training combined with mindfulness-based stress reduction techniques.",
        },
        {
            "id": "mood-movement",
            "name": "Mood Boost Through Movement",
            "template": "Mood boost through movement (8-week exercise)",
            "duration_weeks": 8,
            "category": "exercise",
            "evidence_grade": "A",
            "description": "Structured exercise program leveraging exercise-induced mood enhancement and neuroplasticity.",
        },
        {
            "id": "nutrition-reset",
            "name": "Nutrition Reset Program",
            "template": "Nutrition reset (6-week Mediterranean)",
            "duration_weeks": 6,
            "category": "nutrition",
            "evidence_grade": "A",
            "description": "Mediterranean diet adoption with structured meal planning and behavioral nutrition strategies.",
        },
        {
            "id": "circadian-reset",
            "name": "Circadian Reset Protocol",
            "template": "Circadian reset (3-week chronotherapy)",
            "duration_weeks": 3,
            "category": "sleep",
            "evidence_grade": "B",
            "description": "Chronotype-optimized light therapy and behavioral scheduling to reset circadian phase.",
        },
        {
            "id": "social-connection",
            "name": "Social Connection Program",
            "template": "Social connection (8-week social prescribing)",
            "duration_weeks": 8,
            "category": "social",
            "evidence_grade": "B",
            "description": "Social prescribing model linking patients to community resources and structured engagement.",
        },
        {
            "id": "mind-body",
            "name": "Mind-Body Integration Program",
            "template": "Mind-body integration (6-week yoga + meditation)",
            "duration_weeks": 6,
            "category": "stress",
            "evidence_grade": "B",
            "description": "Yoga-based movement combined with seated meditation for autonomic regulation.",
        },
        {
            "id": "nature-immersion",
            "name": "Nature Immersion Program",
            "template": "Nature immersion (4-week green exercise)",
            "duration_weeks": 4,
            "category": "exercise",
            "evidence_grade": "B",
            "description": "Structured outdoor nature exposure combining walking, mindfulness, and ecological engagement.",
        },
        {
            "id": "digital-wellness",
            "name": "Digital Wellness Program",
            "template": "Digital wellness (4-week screen-time + mindfulness)",
            "duration_weeks": 4,
            "category": "stress",
            "evidence_grade": "C",
            "description": "Screen-time reduction paired with mindfulness training for digital wellbeing.",
        },
        {
            "id": "comprehensive-wellness",
            "name": "Comprehensive Wellness Program",
            "template": "Comprehensive wellness (12-week multi-domain)",
            "duration_weeks": 12,
            "category": "multi",
            "evidence_grade": "B",
            "description": "Integrated multi-domain wellness addressing sleep, stress, exercise, nutrition, social, and purpose.",
        },
    ]
