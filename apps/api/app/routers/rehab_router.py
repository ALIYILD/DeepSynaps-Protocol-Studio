"""
rehab_router.py — Rehab / Physiotherapy intervention router.

Provides REST endpoints for:
- Patient rehab management (list, profile)
- Assessment submission and history (FMA, BBS, TUG, 6MWT, 10MWT, MAS, ROM, MMT)
- Exercise library search/filter
- Protocol creation, retrieval, and update (from 10 templates)
- Session logging and history
- Progress tracking with analytics
- Goal setting and tracking

All endpoints are clinic-scoped and require clinician-level authentication.
Audit logging is performed for all write operations.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id

router = APIRouter(prefix="/api/v1/rehab", tags=["rehab"])


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    """Resolve patient's clinic; raise on cross-clinic or role mismatch."""
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ──────────────────────────────────────────────────────────────────────────────

class AssessmentSubmitRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    assessment_type: str = Field(..., pattern="^(fugl_meyer|berg_balance|timed_up_and_go|six_minute_walk|ten_meter_walk|modified_ashworth|rom_goniometry|manual_muscle_test)$")
    scores: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] | None = None


class AssessmentResponse(BaseModel):
    assessment_id: str
    patient_id: str
    assessment_type: str
    submitted_at: str
    result: dict[str, Any]


class ProtocolCreateRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    name: str | None = None
    template_id: str | None = None
    duration_weeks: int | None = None
    condition: str | None = None
    phases: list[dict[str, Any]] | None = None
    outcome_measures: list[str] | None = None
    contraindications: list[str] | None = None
    therapist_notes: str | None = None


class ProtocolResponse(BaseModel):
    protocol_id: str
    patient_id: str
    name: str
    template_id: str | None = None
    created_at: str
    status: str
    duration_weeks: int
    condition: str
    phases: list[dict[str, Any]]
    outcome_measures: list[str]
    evidence_grade: str
    references: list[str]
    therapist_notes: str | None = None


class ProtocolUpdateRequest(BaseModel):
    name: str | None = None
    status: str | None = None
    phases: list[dict[str, Any]] | None = None
    therapist_notes: str | None = None


class SessionLogRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    session_date: str | None = None
    duration_min: int = Field(default=0, ge=0)
    exercises_completed: list[dict[str, Any]] = Field(default_factory=list)
    total_exercises_prescribed: int = Field(default=0, ge=0)
    pain_score: float | None = Field(default=None, ge=0, le=10)
    fatigue_score: float | None = Field(default=None, ge=0, le=10)
    patient_difficulty_rating: str | None = None
    clinician_notes: str | None = None
    goals_addressed: list[str] = Field(default_factory=list)
    next_session_plan: str | None = None


class SessionLogResponse(BaseModel):
    session_id: str
    patient_id: str
    session_date: str
    duration_min: int
    adherence_pct: float
    exercises_completed: list[dict[str, Any]]
    pain_score: float | None = None
    fatigue_score: float | None = None
    clinician_notes: str | None = None
    logged_at: str


class GoalCreateRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    goals: list[dict[str, Any]] = Field(..., min_length=1)


class GoalItem(BaseModel):
    goal_id: str
    patient_id: str
    description: str
    goal_type: str = "functional"
    target_value: float | None = None
    current_value: float | None = None
    target_date: str | None = None
    status: str = "active"
    outcome_measure: str | None = None
    progress_pct: float | None = None


class ProgressSummaryResponse(BaseModel):
    patient_id: str
    generated_at: str
    assessment_summary: dict[str, Any]
    session_summary: dict[str, Any]
    plateau_alert: dict[str, Any]
    milestone_projections: dict[str, Any]


class ExerciseLibraryResponse(BaseModel):
    exercises: list[dict[str, Any]]
    total: int
    filters_applied: dict[str, Any]


class SafetyAlertResponse(BaseModel):
    patient_id: str
    alerts: list[dict[str, Any]]
    disclaimer: str


class RehabPatientListResponse(BaseModel):
    patients: list[dict[str, Any]]
    total: int
    clinic_id: str | None = None


# ──────────────────────────────────────────────────────────────────────────────
# Audit helpers
# ──────────────────────────────────────────────────────────────────────────────

def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _audit(
    session: Session,
    *,
    actor: AuthenticatedActor,
    action: str,
    target_id: str,
    patient_id: str | None = None,
    note: str = "",
) -> None:
    safe_note = (note or "")[:240]
    create_audit_event(
        session,
        event_id=f"rehab-{uuid.uuid4().hex[:12]}",
        target_id=target_id,
        target_type="rehab",
        action=action,
        role=actor.role,
        actor_id=actor.actor_id,
        note=("patient_id=" + patient_id + "; " if patient_id else "") + safe_note,
        created_at=_iso_now(),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/patients", response_model=RehabPatientListResponse)
def list_rehab_patients(
    clinic_id: str | None = Query(default=None, description="Filter by clinic"),
    phase: str | None = Query(default=None, description="Filter by rehab phase"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> RehabPatientListResponse:
    """List patients with active rehabilitation programs."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import get_rehab_patients

    filters = {}
    if phase:
        filters["phase"] = phase

    patients = get_rehab_patients(db, clinic_id=clinic_id or actor.clinic_id, filters=filters)

    _audit(
        db,
        actor=actor,
        action="rehab.patients_listed",
        target_id="rehab-dashboard",
        note=f"count={len(patients)}; clinic={clinic_id or actor.clinic_id}; phase={phase}",
    )

    return RehabPatientListResponse(
        patients=patients,
        total=len(patients),
        clinic_id=clinic_id or actor.clinic_id,
    )


@router.get("/patients/{patient_id}", response_model=dict[str, Any])
def get_rehab_patient_profile(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get full rehabilitation profile for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.services.rehab_service import get_rehab_profile

    profile = get_rehab_profile(db, patient_id)
    if not profile:
        return {"error": "Patient not found", "patient_id": patient_id}

    _audit(
        db,
        actor=actor,
        action="rehab.profile_viewed",
        target_id=patient_id,
        patient_id=patient_id,
        note=f"phase={profile.get('rehab_phase', 'unknown')}",
    )

    return profile


@router.post("/assessments", response_model=AssessmentResponse)
def submit_assessment(
    request: AssessmentSubmitRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AssessmentResponse:
    """Submit a rehabilitation assessment with automatic scoring."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import submit_assessment as service_submit

    result = service_submit(
        db,
        patient_id=request.patient_id,
        assessment_type=request.assessment_type,
        scores=request.scores,
        metadata=request.metadata,
    )

    if "error" in result:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=result["error"])

    _audit(
        db,
        actor=actor,
        action="rehab.assessment_submitted",
        target_id=result["assessment_id"],
        patient_id=request.patient_id,
        note=f"type={request.assessment_type}; total_score={result.get('total_score', 'N/A')}",
    )

    return AssessmentResponse(
        assessment_id=result["assessment_id"],
        patient_id=request.patient_id,
        assessment_type=request.assessment_type,
        submitted_at=result["submitted_at"],
        result=result,
    )


@router.get("/assessments/{patient_id}", response_model=list[dict[str, Any]])
def get_assessment_history(
    patient_id: str,
    assessment_type: str | None = Query(default=None, description="Filter by type"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, Any]]:
    """Get assessment history for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.services.rehab_service import get_assessment_history as service_history

    history = service_history(db, patient_id, assessment_type=assessment_type)

    _audit(
        db,
        actor=actor,
        action="rehab.assessment_history_viewed",
        target_id=patient_id,
        patient_id=patient_id,
        note=f"type={assessment_type}; count={len(history)}",
    )

    return history


@router.get("/exercises", response_model=ExerciseLibraryResponse)
def get_exercise_library(
    category: str | None = Query(default=None, description="Exercise category"),
    body_part: str | None = Query(default=None, description="Body part"),
    equipment: str | None = Query(default=None, description="Equipment type"),
    difficulty: str | None = Query(default=None, description="Difficulty level"),
    q: str | None = Query(default=None, description="Search query"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ExerciseLibraryResponse:
    """Search and filter the exercise library."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import get_exercise_library

    exercises = get_exercise_library(
        db,
        category=category,
        body_part=body_part,
        equipment=equipment,
        difficulty=difficulty,
        query=q,
    )

    return ExerciseLibraryResponse(
        exercises=exercises,
        total=len(exercises),
        filters_applied={
            "category": category,
            "body_part": body_part,
            "equipment": equipment,
            "difficulty": difficulty,
            "query": q,
        },
    )


@router.post("/protocols", response_model=ProtocolResponse)
def create_protocol(
    request: ProtocolCreateRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProtocolResponse:
    """Create a rehabilitation protocol from template or custom."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import create_protocol as service_create

    protocol = service_create(
        db,
        patient_id=request.patient_id,
        protocol_data={
            "name": request.name,
            "template_id": request.template_id,
            "duration_weeks": request.duration_weeks,
            "condition": request.condition,
            "phases": request.phases or [],
            "outcome_measures": request.outcome_measures or [],
            "contraindications": request.contraindications or [],
            "therapist_notes": request.therapist_notes,
        },
    )

    _audit(
        db,
        actor=actor,
        action="rehab.protocol_created",
        target_id=protocol["protocol_id"],
        patient_id=request.patient_id,
        note=f"template={request.template_id}; name={protocol.get('name', '')}",
    )

    return ProtocolResponse(
        protocol_id=protocol["protocol_id"],
        patient_id=protocol["patient_id"],
        name=protocol["name"],
        template_id=protocol.get("template_id"),
        created_at=protocol["created_at"],
        status=protocol["status"],
        duration_weeks=protocol["duration_weeks"],
        condition=protocol["condition"],
        phases=protocol["phases"],
        outcome_measures=protocol["outcome_measures"],
        evidence_grade=protocol["evidence_grade"],
        references=protocol["references"],
        therapist_notes=protocol.get("therapist_notes"),
    )


@router.get("/protocols/{patient_id}", response_model=list[dict[str, Any]])
def get_patient_protocols(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, Any]]:
    """Get all protocols for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.services.rehab_service import get_patient_protocols as service_protocols

    protocols = service_protocols(db, patient_id)

    _audit(
        db,
        actor=actor,
        action="rehab.protocols_viewed",
        target_id=patient_id,
        patient_id=patient_id,
        note=f"count={len(protocols)}",
    )

    return protocols


@router.put("/protocols/{protocol_id}", response_model=dict[str, Any])
def update_protocol(
    protocol_id: str,
    request: ProtocolUpdateRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Update an existing rehabilitation protocol."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import update_protocol as service_update

    updates = {}
    if request.name is not None:
        updates["name"] = request.name
    if request.status is not None:
        updates["status"] = request.status
    if request.phases is not None:
        updates["phases"] = request.phases
    if request.therapist_notes is not None:
        updates["therapist_notes"] = request.therapist_notes

    result = service_update(db, protocol_id, updates)

    _audit(
        db,
        actor=actor,
        action="rehab.protocol_updated",
        target_id=protocol_id,
        note=f"fields={list(updates.keys())}",
    )

    return result


@router.post("/sessions", response_model=SessionLogResponse)
def log_session(
    request: SessionLogRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SessionLogResponse:
    """Log a rehabilitation session with auto-calculated adherence."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import log_session as service_log

    logged = service_log(
        db,
        patient_id=request.patient_id,
        session_data={
            "session_date": request.session_date,
            "duration_min": request.duration_min,
            "exercises_completed": request.exercises_completed,
            "total_exercises_prescribed": request.total_exercises_prescribed,
            "pain_score": request.pain_score,
            "fatigue_score": request.fatigue_score,
            "patient_difficulty_rating": request.patient_difficulty_rating,
            "clinician_notes": request.clinician_notes,
            "goals_addressed": request.goals_addressed,
            "next_session_plan": request.next_session_plan,
        },
    )

    _audit(
        db,
        actor=actor,
        action="rehab.session_logged",
        target_id=logged["session_id"],
        patient_id=request.patient_id,
        note=f"duration={request.duration_min}min; adherence={logged['adherence_pct']}%; pain={request.pain_score}",
    )

    return SessionLogResponse(
        session_id=logged["session_id"],
        patient_id=logged["patient_id"],
        session_date=logged["session_date"],
        duration_min=logged["duration_min"],
        adherence_pct=logged["adherence_pct"],
        exercises_completed=logged["exercises_completed"],
        pain_score=logged.get("pain_score"),
        fatigue_score=logged.get("fatigue_score"),
        clinician_notes=logged.get("clinician_notes"),
        logged_at=logged["logged_at"],
    )


@router.get("/sessions/{patient_id}", response_model=list[dict[str, Any]])
def get_session_history(
    patient_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, Any]]:
    """Get session history for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.services.rehab_service import get_session_history as service_sessions

    sessions = service_sessions(db, patient_id, limit=limit)

    _audit(
        db,
        actor=actor,
        action="rehab.sessions_viewed",
        target_id=patient_id,
        patient_id=patient_id,
        note=f"limit={limit}; count={len(sessions)}",
    )

    return sessions


@router.get("/progress/{patient_id}", response_model=ProgressSummaryResponse)
def get_progress_summary(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProgressSummaryResponse:
    """Get comprehensive progress summary with trends and plateau detection."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.services.rehab_service import get_progress_summary as service_progress

    summary = service_progress(db, patient_id)

    _audit(
        db,
        actor=actor,
        action="rehab.progress_viewed",
        target_id=patient_id,
        patient_id=patient_id,
        note=f"plateau={summary.get('plateau_alert', {}).get('is_plateau', False)}",
    )

    return ProgressSummaryResponse(
        patient_id=summary["patient_id"],
        generated_at=summary["generated_at"],
        assessment_summary=summary["assessment_summary"],
        session_summary=summary["session_summary"],
        plateau_alert=summary["plateau_alert"],
        milestone_projections=summary["milestone_projections"],
    )


@router.post("/goals", response_model=dict[str, Any])
def set_goals(
    request: GoalCreateRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Set rehabilitation goals for a patient."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import set_goals as service_goals

    result = service_goals(db, patient_id=request.patient_id, goals=request.goals)

    _audit(
        db,
        actor=actor,
        action="rehab.goals_set",
        target_id=request.patient_id,
        patient_id=request.patient_id,
        note=f"count={result.get('goals_created', 0)}",
    )

    return result


@router.get("/goals/{patient_id}", response_model=list[GoalItem])
def get_goals(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[GoalItem]:
    """Get goal tracking for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.services.rehab_service import get_goals as service_goals

    goals = service_goals(db, patient_id)

    _audit(
        db,
        actor=actor,
        action="rehab.goals_viewed",
        target_id=patient_id,
        patient_id=patient_id,
        note=f"count={len(goals)}",
    )

    return [
        GoalItem(
            goal_id=g["goal_id"],
            patient_id=g["patient_id"],
            description=g["description"],
            goal_type=g.get("goal_type", "functional"),
            target_value=g.get("target_value"),
            current_value=g.get("current_value"),
            target_date=g.get("target_date"),
            status=g["status"],
            outcome_measure=g.get("outcome_measure"),
            progress_pct=g.get("progress_pct"),
        )
        for g in goals
    ]


@router.get("/templates", response_model=list[dict[str, Any]])
def list_protocol_templates(
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, Any]]:
    """List all available protocol templates with evidence grades."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import PROTOCOL_TEMPLATES

    _audit(
        db,
        actor=actor,
        action="rehab.templates_viewed",
        target_id="templates",
        note=f"count={len(PROTOCOL_TEMPLATES)}",
    )

    return [
        {
            "id": t["id"],
            "name": t["name"],
            "duration_weeks": t["duration_weeks"],
            "condition": t["condition"],
            "evidence_grade": t["evidence_grade"],
            "phase_count": len(t["phases"]),
            "outcome_measures": t["outcome_measures"],
        }
        for t in PROTOCOL_TEMPLATES
    ]


@router.get("/templates/{template_id}", response_model=dict[str, Any])
def get_protocol_template_detail(
    template_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get full detail of a protocol template."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import PROTOCOL_TEMPLATES, get_protocol_evidence_summary

    template = next((t for t in PROTOCOL_TEMPLATES if t["id"] == template_id), None)
    if not template:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

    evidence = get_protocol_evidence_summary(template_id)

    _audit(
        db,
        actor=actor,
        action="rehab.template_detail_viewed",
        target_id=template_id,
        note=f"condition={template['condition']}",
    )

    return {**template, "evidence_summary": evidence}


@router.get("/safety-alerts/{patient_id}", response_model=SafetyAlertResponse)
def get_safety_alerts(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SafetyAlertResponse:
    """Get safety alerts for a patient based on recent sessions."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.services.rehab_service import (
        REHAB_SAFETY_DISCLAIMER,
        check_safety_alerts,
        get_assessment_history,
        get_session_history,
    )

    sessions = get_session_history(db, patient_id, limit=30)
    assessments = get_assessment_history(db, patient_id)
    alerts = check_safety_alerts(sessions, assessments)

    _audit(
        db,
        actor=actor,
        action="rehab.safety_alerts_viewed",
        target_id=patient_id,
        patient_id=patient_id,
        note=f"alerts={len(alerts)}",
    )

    return SafetyAlertResponse(
        patient_id=patient_id,
        alerts=alerts,
        disclaimer=REHAB_SAFETY_DISCLAIMER,
    )


@router.get("/assessment-form/{assessment_type}", response_model=dict[str, Any])
def get_assessment_form_schema(
    assessment_type: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get the form schema for a specific assessment type (for frontend rendering)."""
    require_minimum_role(actor, "clinician")

    from app.services.rehab_service import (
        BERG_BALANCE_ITEM_DETAILS,
        FUGL_MEYER_ITEM_DETAILS,
        MODIFIED_ASHWORTH_MUSCLES,
        MMT_MUSCLE_GROUPS,
        ROM_JOINTS,
    )

    schemas = {
        "fugl_meyer": {
            "title": "Fugl-Meyer Assessment",
            "description": "Motor function assessment for stroke. Upper: 0-66, Lower: 0-34. Each item scored 0-2.",
            "sections": FUGL_MEYER_ITEM_DETAILS,
            "normative": {"upper_max": 66, "lower_max": 34, "total_max": 100},
        },
        "berg_balance": {
            "title": "Berg Balance Scale",
            "description": "14 items, each scored 0-4. Max 56. Fall risk cutoff < 45.",
            "items": BERG_BALANCE_ITEM_DETAILS,
            "normative": {"max": 56, "fall_risk_cutoff": 45},
        },
        "timed_up_and_go": {
            "title": "Timed Up and Go",
            "description": "Time in seconds to stand, walk 3m, turn, return, sit. < 10s normal, > 12s fall risk.",
            "fields": [{"name": "seconds", "type": "number", "min": 0, "max": 120, "unit": "seconds"}],
            "normative": {"normal": "< 10s", "fall_risk": "> 12s"},
        },
        "six_minute_walk": {
            "title": "6-Minute Walk Test",
            "description": "Total distance walked in 6 minutes.",
            "fields": [{"name": "metres", "type": "number", "min": 0, "max": 1000, "unit": "metres"}],
            "normative": {"mcid_copd": 54, "mcid_heart_failure": 45, "mcid_stroke": 34},
        },
        "ten_meter_walk": {
            "title": "10-Meter Walk Test",
            "description": "Gait speed over 10m. Records time and calculates m/s.",
            "fields": [
                {"name": "seconds", "type": "number", "min": 0, "max": 60, "unit": "seconds"},
                {"name": "distance_m", "type": "number", "min": 0, "max": 20, "unit": "metres", "default": 10},
            ],
            "normative": {
                "household_ambulator": "< 0.4 m/s",
                "limited_community": "0.4-0.8 m/s",
                "full_community": "> 0.8 m/s",
            },
        },
        "modified_ashworth": {
            "title": "Modified Ashworth Scale",
            "description": "Spasticity grading 0-4 per muscle group.",
            "muscles": MODIFIED_ASHWORTH_MUSCLES,
            "scale": {0: "No increase", 1: "Slight increase", "1+": "Slight increase, catch", 2: "More marked", 3: "Considerable", 4: "Rigid"},
        },
        "rom_goniometry": {
            "title": "ROM Goniometry",
            "description": "Joint range of motion in degrees.",
            "joints": ROM_JOINTS,
        },
        "manual_muscle_test": {
            "title": "Manual Muscle Test",
            "description": "Muscle strength grading 0-5.",
            "muscles": MMT_MUSCLE_GROUPS,
            "scale": {
                0: "No contraction", 1: "Flicker/trace", 2: "Gravity eliminated",
                3: "Against gravity", 4: "Some resistance", 5: "Normal",
            },
        },
    }

    schema = schemas.get(assessment_type)
    if not schema:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Assessment type {assessment_type} not found")

    _audit(
        db,
        actor=actor,
        action="rehab.assessment_form_viewed",
        target_id=assessment_type,
        note=f"type={assessment_type}",
    )

    return {"assessment_type": assessment_type, **schema}
