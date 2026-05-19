"""
complementary_router.py — Complementary & Integrative Interventions API

Provides REST endpoints for managing complementary therapies across all
modalities: acupuncture, neurofeedback, CES, tPBM, mind-body, massage,
music/art therapy, plus a therapy library, protocol builder, safety
checker, evidence summaries, and patient progress tracking.

DeepSynaps Protocol Studio — clinical intervention platform.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
    UserRole,
)
from app.database import get_db_session
from app.repositories.patients import resolve_patient_clinic_id

from app.services.complementary_service import (
    get_complementary_patients,
    get_patient_profile,
    log_acupuncture,
    log_neurofeedback,
    log_ces,
    log_pbm,
    log_mindbody,
    log_massage,
    log_music_art,
    get_therapy_library,
    create_protocol,
    safety_check,
    get_evidence_summary,
    get_progress_summary,
    get_protocols_for_patient,
    get_acupuncture_history,
    get_neurofeedback_history,
    get_ces_history,
    get_pbm_history,
    get_mindbody_history,
    get_massage_history,
    get_music_art_history,
    get_aggregate_evidence_stats,
    get_herb_drug_interactions,
    get_protocol_template_by_key,
    list_protocol_templates,
    update_protocol_progress,
    deactivate_therapy,
    get_clinic_summary,
    validate_protocol_data,
    PROTOCOL_TEMPLATES,
    THERAPY_LIBRARY_DB,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/complementary", tags=["complementary"])

# ---------------------------------------------------------------------------
# ROLE HELPERS
# ---------------------------------------------------------------------------

async def CLINICIAN_OR_ADMIN(actor: AuthenticatedActor = Depends(get_authenticated_actor)) -> AuthenticatedActor:
    """Require clinician, admin, or supervisor role."""
    allowed = {UserRole.clinician, UserRole.admin, UserRole.clinic_admin, UserRole.supervisor, UserRole.technician}
    if actor.role not in allowed:
        raise HTTPException(status_code=403, detail="Insufficient role for complementary therapy access")
    return actor


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    """Resolve patient's clinic; raise on cross-clinic or role mismatch."""
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class AcupunctureSessionRequest(BaseModel):
    patient_id: str = Field(..., description="Patient UUID")
    session_date: str = Field(..., description="ISO date YYYY-MM-DD")
    session_number: int = Field(default=1, ge=1)
    points: str = Field(..., description="Comma-separated point names (e.g., LI4, LV3, SP6)")
    condition: str = Field(..., description="Condition being treated")
    pain_vas_before: Optional[int] = Field(default=None, ge=0, le=10)
    pain_vas_after: Optional[int] = Field(default=None, ge=0, le=10)
    deqi_achieved: bool = Field(default=False)
    duration_min: int = Field(default=30, ge=5)
    notes: Optional[str] = None


class NeurofeedbackSessionRequest(BaseModel):
    patient_id: str = Field(...)
    session_date: str
    session_number: int = Field(default=1, ge=1)
    protocol: str = Field(..., description="e.g., SMR (12-15 Hz)")
    site: str = Field(..., description="Electrode site, e.g., C4")
    duration_min: int = Field(default=30, ge=5)
    threshold: Optional[float] = Field(default=None)
    reward_ratio: Optional[int] = Field(default=None, ge=0, le=100)
    artifact_pct: Optional[int] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = None


class CESSessionRequest(BaseModel):
    patient_id: str = Field(...)
    session_date: str
    session_time: Optional[str] = Field(default=None, description="HH:MM")
    current_ua: int = Field(default=100, ge=50, le=1000)
    frequency_hz: str = Field(default="0.5")
    duration_min: int = Field(default=20, ge=5)
    earclips: str = Field(default="bilateral")
    response: Optional[str] = None
    side_effects: Optional[str] = None


class PBMSessionRequest(BaseModel):
    patient_id: str = Field(...)
    session_date: str
    wavelength_nm: int = Field(default=810)
    power_density: int = Field(default=250)
    dose: int = Field(default=60)
    site: str = Field(..., description="Treatment site, e.g., Left prefrontal (F3)")
    duration_min: int = Field(default=4)
    before_score: Optional[int] = Field(default=None, ge=0, le=10)
    after_score: Optional[int] = Field(default=None, ge=0, le=10)
    notes: Optional[str] = None


class MindBodySessionRequest(BaseModel):
    patient_id: str = Field(...)
    session_date: str
    type: str = Field(..., description="meditation, yoga, tai_chi, breathing, mindfulness, qigong")
    subtype: Optional[str] = None
    duration_min: int = Field(default=20, ge=1)
    guided: bool = Field(default=False)
    hrv_before: Optional[float] = None
    hrv_after: Optional[float] = None
    notes: Optional[str] = None


class MassageSessionRequest(BaseModel):
    patient_id: str = Field(...)
    session_date: str
    type: str = Field(..., description="swedish, deep_tissue, trigger_point, myofascial, etc.")
    duration_min: int = Field(default=60, ge=5)
    areas: Optional[str] = None
    pressure: Optional[str] = Field(default="moderate")
    pain_before: Optional[int] = Field(default=None, ge=0, le=10)
    pain_after: Optional[int] = Field(default=None, ge=0, le=10)
    relaxation_score: Optional[int] = Field(default=None, ge=1, le=10)
    rom_change: Optional[str] = None
    goals: Optional[str] = None
    notes: Optional[str] = None


class MusicArtSessionRequest(BaseModel):
    patient_id: str = Field(...)
    session_date: str
    modality: str = Field(..., description="music_receptive, music_active, art_drawing, etc.")
    type: str = Field(default="active", description="active or receptive")
    materials: Optional[str] = None
    goals: Optional[str] = None
    mood_before: Optional[int] = Field(default=None, ge=1, le=10)
    mood_after: Optional[int] = Field(default=None, ge=1, le=10)
    engagement_score: Optional[int] = Field(default=None, ge=1, le=10)
    duration_min: int = Field(default=45, ge=5)
    notes: Optional[str] = None


class ProtocolCreateRequest(BaseModel):
    patient_id: str = Field(...)
    name: Optional[str] = None
    template_key: Optional[str] = None
    weeks: int = Field(default=8, ge=1)
    sessions_count: int = Field(default=16, ge=1)
    modalities: Optional[List[str]] = None
    conditions: Optional[str] = None
    description: Optional[str] = None
    schedule_notes: Optional[str] = None
    outcome_measures: Optional[str] = None


class ProtocolProgressUpdateRequest(BaseModel):
    sessions_completed: int = Field(..., ge=0)
    next_session: Optional[int] = None
    status: Optional[str] = None  # active, completed, paused, archived


class SafetyCheckRequest(BaseModel):
    patient_id: str = Field(...)
    therapy_type: str = Field(..., description="Therapy type to check against contraindications")


class HerbDrugInteractionRequest(BaseModel):
    herb_name: str = Field(...)
    medication_name: Optional[str] = None


# ---------------------------------------------------------------------------
# PATIENT ENDPOINTS
# ---------------------------------------------------------------------------

@router.get(
    "/patients",
    response_model=Dict[str, Any],
    summary="List patients with active complementary therapies",
    description="Return patients enrolled in at least one active complementary therapy for the current clinic.",
)
def list_complementary_patients(
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    patients = get_complementary_patients(db, clinic_id)
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "complementary_patients_list", getattr(user, 'id', None), "Listed {len(patients)} patients with active therapies for clinic {clinic_id}")
    return {
        "clinic_id": clinic_id,
        "count": len(patients),
        "patients": patients,
    }


@router.get(
    "/patients/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get patient's complementary therapy profile",
    description="Full profile including active therapies, recent sessions, safety flags, protocols, and outcomes.",
)
def get_complementary_patient_profile(
    patient_id: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    profile = get_patient_profile(db, patient_id)
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "complementary_patient_profile_view", getattr(user, 'id', None), "Viewed complementary profile for patient {patient_id}")
    return profile


# ---------------------------------------------------------------------------
# ACUPUNCTURE ENDPOINTS
# ---------------------------------------------------------------------------

@router.post(
    "/acupuncture",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Log an acupuncture session",
)
def create_acupuncture_session(
    request: AcupunctureSessionRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = log_acupuncture(db, request.patient_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "acupuncture_session_logged", getattr(user, 'id', None), "Logged acupuncture session for patient {request.patient_id}")
    return result


@router.get(
    "/acupuncture/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get acupuncture session history",
)
def get_patient_acupuncture_history(
    patient_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    history = get_acupuncture_history(db, patient_id, limit=limit)
    return {
        "patient_id": patient_id,
        "modality": "acupuncture",
        "count": len(history),
        "sessions": history,
    }


# ---------------------------------------------------------------------------
# NEUROFEEDBACK ENDPOINTS
# ---------------------------------------------------------------------------

@router.post(
    "/neurofeedback",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Log a neurofeedback session",
)
def create_neurofeedback_session(
    request: NeurofeedbackSessionRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = log_neurofeedback(db, request.patient_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "neurofeedback_session_logged", getattr(user, 'id', None), "Logged neurofeedback session for patient {request.patient_id}")
    return result


@router.get(
    "/neurofeedback/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get neurofeedback session history",
)
def get_patient_neurofeedback_history(
    patient_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    history = get_neurofeedback_history(db, patient_id, limit=limit)
    return {
        "patient_id": patient_id,
        "modality": "neurofeedback",
        "count": len(history),
        "sessions": history,
    }


# ---------------------------------------------------------------------------
# CES ENDPOINTS
# ---------------------------------------------------------------------------

@router.post(
    "/ces",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Log a CES session",
)
def create_ces_session(
    request: CESSessionRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = log_ces(db, request.patient_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "ces_session_logged", getattr(user, 'id', None), "Logged CES session for patient {request.patient_id}")
    return result


@router.get(
    "/ces/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get CES session history",
)
def get_patient_ces_history(
    patient_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    history = get_ces_history(db, patient_id, limit=limit)
    return {
        "patient_id": patient_id,
        "modality": "ces",
        "count": len(history),
        "sessions": history,
    }


# ---------------------------------------------------------------------------
# PBM ENDPOINTS
# ---------------------------------------------------------------------------

@router.post(
    "/pbm",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Log a tPBM session",
)
def create_pbm_session(
    request: PBMSessionRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = log_pbm(db, request.patient_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "pbm_session_logged", getattr(user, 'id', None), "Logged tPBM session for patient {request.patient_id}")
    return result


@router.get(
    "/pbm/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get tPBM session history",
)
def get_patient_pbm_history(
    patient_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    history = get_pbm_history(db, patient_id, limit=limit)
    return {
        "patient_id": patient_id,
        "modality": "pbm",
        "count": len(history),
        "sessions": history,
    }


# ---------------------------------------------------------------------------
# MIND-BODY ENDPOINTS
# ---------------------------------------------------------------------------

@router.post(
    "/mindbody",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Log a mind-body session",
)
def create_mindbody_session(
    request: MindBodySessionRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = log_mindbody(db, request.patient_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "mindbody_session_logged", getattr(user, 'id', None), "Logged mind-body session for patient {request.patient_id}")
    return result


@router.get(
    "/mindbody/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get mind-body session history",
)
def get_patient_mindbody_history(
    patient_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    history = get_mindbody_history(db, patient_id, limit=limit)
    return {
        "patient_id": patient_id,
        "modality": "mindbody",
        "count": len(history),
        "sessions": history,
    }


# ---------------------------------------------------------------------------
# MASSAGE ENDPOINTS
# ---------------------------------------------------------------------------

@router.post(
    "/massage",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Log a massage / bodywork session",
)
def create_massage_session(
    request: MassageSessionRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = log_massage(db, request.patient_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "massage_session_logged", getattr(user, 'id', None), "Logged massage session for patient {request.patient_id}")
    return result


@router.get(
    "/massage/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get massage session history",
)
def get_patient_massage_history(
    patient_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    history = get_massage_history(db, patient_id, limit=limit)
    return {
        "patient_id": patient_id,
        "modality": "massage",
        "count": len(history),
        "sessions": history,
    }


# ---------------------------------------------------------------------------
# MUSIC / ART THERAPY ENDPOINTS
# ---------------------------------------------------------------------------

@router.post(
    "/music-art",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Log a music / art therapy session",
)
def create_music_art_session(
    request: MusicArtSessionRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = log_music_art(db, request.patient_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "music_art_session_logged", getattr(user, 'id', None), "Logged music/art therapy session for patient {request.patient_id}")
    return result


@router.get(
    "/music-art/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get music / art therapy session history",
)
def get_patient_music_art_history(
    patient_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    history = get_music_art_history(db, patient_id, limit=limit)
    return {
        "patient_id": patient_id,
        "modality": "music-art",
        "count": len(history),
        "sessions": history,
    }


# ---------------------------------------------------------------------------
# THERAPY LIBRARY ENDPOINTS
# ---------------------------------------------------------------------------

@router.get(
    "/therapy-library",
    response_model=Dict[str, Any],
    summary="Search the therapy database",
    description="Browse 60+ complementary therapies with filtering by category, condition, and evidence grade.",
)
def search_therapy_library(
    category: Optional[str] = Query(default=None, description="Filter by therapy category"),
    condition: Optional[str] = Query(default=None, description="Filter by treated condition"),
    evidence_grade: Optional[str] = Query(default=None, description="Filter by evidence grade (A/B/C/D)"),
    q: Optional[str] = Query(default=None, description="Free-text search across name, description, mechanism"),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    results = get_therapy_library(db, category=category, condition=condition, evidence_grade=evidence_grade)

    if q:
        q_lower = q.lower()
        results = [
            t for t in results
            if q_lower in t["name"].lower()
            or q_lower in t.get("description", "").lower()
            or q_lower in t.get("mechanism", "").lower()
            or any(q_lower in c.lower() for c in t.get("conditions", []))
        ]

    return {
        "count": len(results),
        "filters": {"category": category, "condition": condition, "evidence_grade": evidence_grade, "q": q},
        "therapies": results,
    }


@router.get(
    "/therapy-library/stats",
    response_model=Dict[str, Any],
    summary="Get aggregate evidence statistics for the therapy library",
)
def get_library_stats(
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    return get_aggregate_evidence_stats()


@router.get(
    "/therapy-library/{therapy_id}",
    response_model=Dict[str, Any],
    summary="Get a specific therapy entry by ID",
)
def get_therapy_by_id(
    therapy_id: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    entry = next((t for t in THERAPY_LIBRARY_DB if t["id"] == therapy_id), None)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Therapy {therapy_id} not found")
    return entry


# ---------------------------------------------------------------------------
# PROTOCOL ENDPOINTS
# ---------------------------------------------------------------------------

@router.post(
    "/protocols",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Create a therapy protocol from template or custom specification",
)
def create_therapy_protocol(
    request: ProtocolCreateRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    errors = validate_protocol_data(request.model_dump())
    if errors:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"validation_errors": errors})

    result = create_protocol(db, request.patient_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "protocol_created", getattr(user, 'id', None), "Created protocol '{result.get('name')}' for patient {request.patient_id}")
    return result


@router.get(
    "/protocols/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get all protocols for a patient",
)
def get_patient_protocols(
    patient_id: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    protocols = get_protocols_for_patient(db, patient_id)
    return {
        "patient_id": patient_id,
        "count": len(protocols),
        "protocols": protocols,
    }


@router.get(
    "/protocols/{patient_id}/active",
    response_model=Dict[str, Any],
    summary="Get active protocols for a patient",
)
def get_patient_active_protocols(
    patient_id: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    protocols = get_protocols_for_patient(db, patient_id)
    active = [p for p in protocols if p.get("status") == "active"]
    return {
        "patient_id": patient_id,
        "count": len(active),
        "protocols": active,
    }


@router.get(
    "/protocol-templates",
    response_model=Dict[str, Any],
    summary="List available protocol templates",
)
def list_templates(
    category: Optional[str] = Query(default=None, description="Filter by modality category"),
    evidence_grade: Optional[str] = Query(default=None),
    condition: Optional[str] = Query(default=None),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    templates = list_protocol_templates(category=category, evidence_grade=evidence_grade, condition=condition)
    return {
        "count": len(templates),
        "filters": {"category": category, "evidence_grade": evidence_grade, "condition": condition},
        "templates": templates,
    }


@router.get(
    "/protocol-templates/{template_key}",
    response_model=Dict[str, Any],
    summary="Get a specific protocol template",
)
def get_template_by_key(
    template_key: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    template = get_protocol_template_by_key(template_key)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template {template_key} not found")
    return template


@router.patch(
    "/protocols/{protocol_id}/progress",
    response_model=Dict[str, Any],
    summary="Update protocol progress tracking",
)
def update_protocol_progress_endpoint(
    protocol_id: str,
    request: ProtocolProgressUpdateRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = update_protocol_progress(
        db,
        protocol_id,
        sessions_completed=request.sessions_completed,
        next_session=request.next_session,
        status=request.status,
    )
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND if "not found" in result.get("error", "").lower() else status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    return result


@router.patch(
    "/protocols/{protocol_id}/deactivate",
    response_model=Dict[str, Any],
    summary="Deactivate a protocol",
)
def deactivate_protocol(
    protocol_id: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = update_protocol_progress(db, protocol_id, sessions_completed=0, status="inactive")
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND if "not found" in result.get("error", "").lower() else status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "protocol_deactivated", getattr(user, 'id', None), "Deactivated protocol {protocol_id}")
    return result


# ---------------------------------------------------------------------------
# SAFETY & EVIDENCE ENDPOINTS
# ---------------------------------------------------------------------------

@router.post(
    "/safety-check",
    response_model=Dict[str, Any],
    summary="Run contraindication safety check",
    description="Check a therapy against patient conditions and medications for contraindications.",
)
def run_safety_check(
    request: SafetyCheckRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    result = safety_check(db, request.patient_id, request.therapy_type)
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "safety_check", getattr(user, 'id', None), "Safety check for therapy {request.therapy_type} on patient {request.patient_id}: cleared={result.get('cleared')}, flags={result.get('flag_count')}")
    return result


@router.post(
    "/safety/herb-drug-interactions",
    response_model=Dict[str, Any],
    summary="Check herb-drug interactions",
)
def check_herb_drug_interactions(
    request: HerbDrugInteractionRequest,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    interactions = get_herb_drug_interactions(request.herb_name, request.medication_name)
    return {
        "herb": request.herb_name,
        "medication": request.medication_name,
        "interactions_found": len(interactions),
        "interactions": interactions,
        "assessed_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }


@router.get(
    "/evidence/{therapy_type}",
    response_model=Dict[str, Any],
    summary="Get evidence summary for a therapy type",
)
def get_therapy_evidence(
    therapy_type: str,
    condition: Optional[str] = Query(default=None),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    return get_evidence_summary(therapy_type, condition=condition)


@router.get(
    "/evidence",
    response_model=Dict[str, Any],
    summary="Get all evidence summaries",
)
def get_all_evidence(
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    all_evidence = {}
    for therapy_type in EVIDENCE_SUMMARIES.keys():
        all_evidence[therapy_type] = get_evidence_summary(therapy_type)
    return {
        "therapy_types_covered": list(all_evidence.keys()),
        "evidence_data": all_evidence,
    }


# ---------------------------------------------------------------------------
# PROGRESS ENDPOINTS
# ---------------------------------------------------------------------------

@router.get(
    "/progress/{patient_id}",
    response_model=Dict[str, Any],
    summary="Get patient progress summary across all modalities",
)
def get_patient_progress(
    patient_id: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    summary = get_progress_summary(db, patient_id)
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "progress_summary_view", getattr(user, 'id', None), "Viewed progress summary for patient {patient_id}")
    return summary


# ---------------------------------------------------------------------------
# CLINIC DASHBOARD ENDPOINTS
# ---------------------------------------------------------------------------

@router.get(
    "/clinic-summary/{clinic_id}",
    response_model=Dict[str, Any],
    summary="Get clinic-level complementary therapy summary",
)
def get_clinic_dashboard_summary(
    clinic_id: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    summary = get_clinic_summary(db, clinic_id)
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "clinic_summary_view", getattr(user, 'id', None), "Viewed clinic summary for {clinic_id}")
    return summary


# ---------------------------------------------------------------------------
# THERAPY MANAGEMENT ENDPOINTS
# ---------------------------------------------------------------------------

@router.patch(
    "/patients/{patient_id}/deactivate-therapy",
    response_model=Dict[str, Any],
    summary="Deactivate a complementary therapy for a patient",
)
def deactivate_patient_therapy(
    patient_id: str,
    therapy_type: str = Query(..., description="Therapy type to deactivate"),
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    result = deactivate_therapy(db, patient_id, therapy_type)
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.get("error"))
    logger.info("AUDIT: action=%s user_id=%s detail=%s", "therapy_deactivated", getattr(user, 'id', None), "Deactivated {therapy_type} for patient {patient_id}")
    return result


# ---------------------------------------------------------------------------
# MODULE DATA (for frontend reference data)
# ---------------------------------------------------------------------------

@router.get(
    "/reference/herbs",
    response_model=Dict[str, Any],
    summary="Get list of herbs in the interaction database",
)
def get_herb_reference_list(
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    herbs = [
        "st. john's wort", "ginkgo biloba", "ginseng", "echinacea",
        "kava kava", "valerian root", "turmeric", "ashwagandha",
        "rhodiola rosea", "cbd", "melatonin", "omega-3",
    ]
    return {"herbs": herbs, "count": len(herbs)}


@router.get(
    "/reference/categories",
    response_model=Dict[str, Any],
    summary="Get therapy category list",
)
def get_category_reference(
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    return {
        "categories": [
            {"key": "acupuncture", "label": "Acupuncture & Traditional", "count": len([t for t in THERAPY_LIBRARY_DB if t["category"] == "acupuncture"])},
            {"key": "biofeedback", "label": "Biofeedback & Neurofeedback", "count": len([t for t in THERAPY_LIBRARY_DB if t["category"] == "biofeedback"])},
            {"key": "ces", "label": "Cranial Electrical Stimulation", "count": len([t for t in THERAPY_LIBRARY_DB if t["category"] == "ces"])},
            {"key": "pbm", "label": "Photobiomodulation", "count": len([t for t in THERAPY_LIBRARY_DB if t["category"] == "pbm"])},
            {"key": "massage", "label": "Massage & Bodywork", "count": len([t for t in THERAPY_LIBRARY_DB if t["category"] == "massage"])},
            {"key": "mind-body", "label": "Mind-Body Practices", "count": len([t for t in THERAPY_LIBRARY_DB if t["category"] == "mind-body"])},
            {"key": "music-art", "label": "Music & Art Therapy", "count": len([t for t in THERAPY_LIBRARY_DB if t["category"] == "music-art"])},
            {"key": "naturopathic", "label": "Naturopathic & Herbal", "count": len([t for t in THERAPY_LIBRARY_DB if t["category"] == "naturopathic"])},
            {"key": "other", "label": "Other Modalities", "count": len([t for t in THERAPY_LIBRARY_DB if t["category"] == "other"])},
        ]
    }


@router.get(
    "/reference/evidence-grades",
    response_model=Dict[str, Any],
    summary="Get evidence grade legend",
)
def get_evidence_grade_reference(
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    return {
        "grades": [
            {"grade": "A", "label": "Meta-analysis / Systematic Review", "description": "Strong evidence from multiple high-quality RCTs", "color_code": "#2dd4bf"},
            {"grade": "B", "label": "Randomized Controlled Trial", "description": "Single or few RCTs with adequate methodology", "color_code": "#60a5fa"},
            {"grade": "C", "label": "Cohort / Observational", "description": "Non-randomized studies, case-control, uncontrolled trials", "color_code": "#a78bfa"},
            {"grade": "D", "label": "Expert Opinion / Case Report", "description": "Clinical experience, case reports, historical practice", "color_code": "#94a3b8"},
        ]
    }


# ---------------------------------------------------------------------------
# LEGACY ALIASES (for backward compatibility with frontend naming)
# ---------------------------------------------------------------------------

@router.get("/acupuncture-history/{patient_id}", include_in_schema=False)
def get_acupuncture_history_alias(
    patient_id: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    return get_patient_acupuncture_history(patient_id, db=db, user=user)


@router.get("/neurofeedback-history/{patient_id}", include_in_schema=False)
def get_neurofeedback_history_alias(
    patient_id: str,
    db: Session = Depends(get_db_session),
    user: Any = Depends(CLINICIAN_OR_ADMIN),
):
    _gate_patient_access(user, patient_id, db)
    return get_patient_neurofeedback_history(patient_id, db=db, user=user)
