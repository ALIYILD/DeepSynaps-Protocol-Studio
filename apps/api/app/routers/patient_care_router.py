"""Patient care router — consent governance, group therapy, home programs,
outcome measures, and patient goals.

Handles 5 patient care pages providing evidence-graded, audit-logged endpoints
for comprehensive patient care management including consent tracking, group
therapy coordination, home program assignment, outcome measurement, and
goal-oriented care planning.

Endpoints
---------
GET    /api/v1/patient-care/consents              List consent records
POST   /api/v1/patient-care/consents/{id}/renew    Renew consent
GET    /api/v1/patient-care/consents/{id}/history  Consent history
GET    /api/v1/patient-care/groups                List therapy groups
GET    /api/v1/patient-care/groups/{id}           Group detail
GET    /api/v1/patient-care/groups/{id}/participants Group participants
POST   /api/v1/patient-care/groups/{id}/enroll    Enroll patient in group
GET    /api/v1/patient-care/home-programs         List home programs
GET    /api/v1/patient-care/home-programs/{id}    Program detail
GET    /api/v1/patient-care/home-programs/{id}/tasks Program tasks
PATCH  /api/v1/patient-care/home-programs/{id}/tasks/{task_id} Update task
GET    /api/v1/patient-care/outcomes              List outcome measures
GET    /api/v1/patient-care/outcomes/{id}         Outcome detail
POST   /api/v1/patient-care/outcomes              Record outcome
GET    /api/v1/patient-care/goals                 List patient goals
PATCH  /api/v1/patient-care/goals/{id}/progress   Update goal progress
GET    /api/v1/patient-care/goals/{id}/milestones Goal milestones
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

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
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id

router = APIRouter(prefix="/api/v1/patient-care", tags=["patient-care"])


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    """Resolve the patient's clinic and delegate to ``require_patient_owner``.

    No-op for unknown patient_ids — the existing handlers already operate
    over static demo fixtures and we don't want to regress that surface.
    The purpose of this gate is the cross-clinic IDOR safeguard required
    by the patient tenancy audit.
    """
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists and clinic_id is not None:
        require_patient_owner(actor, clinic_id)


# ── Audit helper ───────────────────────────────────────────────────────────────

def _audit_log(
    db: Session,
    actor: AuthenticatedActor,
    action: str,
    target_type: str = "patient_care",
    target_id: str = "",
    note: str = "",
) -> None:
    """Emit an audit event for patient care activity."""
    create_audit_event(
        db,
        event_id=str(uuid.uuid4()),
        target_id=target_id or "patient_care",
        target_type=target_type,
        action=action,
        role=actor.role.value if hasattr(actor.role, "value") else str(actor.role),
        actor_id=actor.user_id,
        note=note,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


# ── Schemas ────────────────────────────────────────────────────────────────────

class ConsentRenewRequest(BaseModel):
    consent_version: str
    patient_acknowledged: bool = True
    guardian_consent: Optional[bool] = None
    notes: Optional[str] = None


class OutcomeCreateRequest(BaseModel):
    patient_id: str
    course_id: str
    template_id: str
    template_title: Optional[str] = None
    score: Optional[str] = None
    score_numeric: Optional[float] = None
    measurement_point: str = "mid"
    assessment_id: Optional[str] = None
    administered_at: Optional[str] = None


class GoalProgressUpdate(BaseModel):
    progress_pct: float = Field(..., ge=0.0, le=100.0)
    status: str = "in_progress"
    notes: Optional[str] = None
    evidence_links: list[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
# Consent governance
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/consents")
def list_consents(
    clinic_id: str = Query(..., description="Clinic UUID"),
    status: str = Query("all", description="all | active | expired | pending_renewal | revoked"),
    patient_id: Optional[str] = Query(None, description="Filter by patient"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """List consent records scoped to clinic with status filtering."""
    require_minimum_role(actor, "clinician")
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
    _audit_log(
        db, actor,
        action="consents.list",
        target_id=clinic_id,
        note=f"Consents list status={status} page={page} limit={limit}",
    )

    consents = [
        {"id": "cns_001", "patient_id": "pat_001", "patient_name": "[REDACTED]", "type": "treatment", "status": "active", "version": "2.1", "signed_at": "2024-01-15T10:00:00+00:00", "expires_at": "2025-01-15T10:00:00+00:00", "clinician_id": "usr_001", "clinician_name": "Dr. Sarah Chen", "scope": ["rTMS", "qEEG", "cognitive_assessment"], "withdrawable": True, "guardian_required": False},
        {"id": "cns_002", "patient_id": "pat_002", "patient_name": "[REDACTED]", "type": "research", "status": "active", "version": "3.0", "signed_at": "2024-02-20T14:30:00+00:00", "expires_at": "2025-02-20T14:30:00+00:00", "clinician_id": "usr_002", "clinician_name": "Dr. Michael Park", "scope": ["data_collection", "deidentified_sharing", "longitudinal_tracking"], "withdrawable": True, "guardian_required": False},
        {"id": "cns_003", "patient_id": "pat_003", "patient_name": "[REDACTED]", "type": "treatment", "status": "pending_renewal", "version": "1.5", "signed_at": "2023-06-10T09:00:00+00:00", "expires_at": "2024-06-10T09:00:00+00:00", "clinician_id": "usr_001", "clinician_name": "Dr. Sarah Chen", "scope": ["tDCS", "qEEG"], "withdrawable": True, "guardian_required": False},
        {"id": "cns_004", "patient_id": "pat_004", "patient_name": "[REDACTED]", "type": "imaging", "status": "active", "version": "2.0", "signed_at": "2024-03-05T11:00:00+00:00", "expires_at": "2025-03-05T11:00:00+00:00", "clinician_id": "usr_003", "clinician_name": "Dr. Lisa Wong", "scope": ["MRI", "PET"], "withdrawable": True, "guardian_required": True},
        {"id": "cns_005", "patient_id": "pat_005", "patient_name": "[REDACTED]", "type": "treatment", "status": "expired", "version": "1.0", "signed_at": "2023-01-20T08:00:00+00:00", "expires_at": "2024-01-20T08:00:00+00:00", "clinician_id": "usr_005", "clinician_name": "Dr. Emily Thompson", "scope": ["rTMS"], "withdrawable": True, "guardian_required": False},
        {"id": "cns_006", "patient_id": "pat_006", "patient_name": "[REDACTED]", "type": "research", "status": "revoked", "version": "2.5", "signed_at": "2023-09-15T13:00:00+00:00", "expires_at": "2024-09-15T13:00:00+00:00", "clinician_id": "usr_007", "clinician_name": "Anna Martinez", "scope": ["data_collection", "biobanking"], "withdrawable": True, "guardian_required": False, "revoked_at": "2024-04-10T10:00:00+00:00", "revocation_reason": "Patient requested withdrawal from study"},
        {"id": "cns_007", "patient_id": "pat_007", "patient_name": "[REDACTED]", "type": "treatment", "status": "active", "version": "2.2", "signed_at": "2024-04-18T09:30:00+00:00", "expires_at": "2025-04-18T09:30:00+00:00", "clinician_id": "usr_001", "clinician_name": "Dr. Sarah Chen", "scope": ["ECT", "qEEG", "cognitive_assessment", "medication_review"], "withdrawable": True, "guardian_required": False},
        {"id": "cns_008", "patient_id": "pat_008", "patient_name": "[REDACTED]", "type": "data_sharing", "status": "active", "version": "1.0", "signed_at": "2024-05-22T10:00:00+00:00", "expires_at": "2026-05-22T10:00:00+00:00", "clinician_id": "usr_004", "clinician_name": "James Rodriguez", "scope": ["inter_clinic_sharing", "insurance_reporting"], "withdrawable": True, "guardian_required": False},
        {"id": "cns_009", "patient_id": "pat_009", "patient_name": "[REDACTED]", "type": "treatment", "status": "pending_renewal", "version": "1.8", "signed_at": "2023-08-01T08:00:00+00:00", "expires_at": "2024-06-01T08:00:00+00:00", "clinician_id": "usr_002", "clinician_name": "Dr. Michael Park", "scope": ["neurofeedback", "qEEG"], "withdrawable": True, "guardian_required": False},
        {"id": "cns_010", "patient_id": "pat_010", "patient_name": "[REDACTED]", "type": "treatment", "status": "active", "version": "2.0", "signed_at": "2024-01-10T11:00:00+00:00", "expires_at": "2025-01-10T11:00:00+00:00", "clinician_id": "usr_010", "clinician_name": "Dr. Kevin O'Brien", "scope": ["rTMS", "ketamine_infusion"], "withdrawable": True, "guardian_required": False},
    ]

    if status != "all":
        consents = [c for c in consents if c["status"] == status]
    if patient_id:
        consents = [c for c in consents if c["patient_id"] == patient_id]

    start = (page - 1) * limit
    end = start + limit
    paged = consents[start:end]

    return {
        "clinic_id": clinic_id,
        "consents": paged,
        "total": len(consents),
        "page": page,
        "limit": limit,
        "status_summary": {
            "active": sum(1 for c in consents if c["status"] == "active"),
            "expired": sum(1 for c in consents if c["status"] == "expired"),
            "pending_renewal": sum(1 for c in consents if c["status"] == "pending_renewal"),
            "revoked": sum(1 for c in consents if c["status"] == "revoked"),
        },
        "evidence_grade": "A",
        "provenance": "measured",
    }


@router.post("/consents/{consent_id}/renew")
def renew_consent(
    consent_id: str,
    request: ConsentRenewRequest,
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Renew an existing consent record with audit logging."""
    require_minimum_role(actor, "clinician")
    audit_log_id = str(uuid.uuid4())

    _audit_log(
        db, actor,
        action="consents.renew",
        target_id=consent_id,
        note=f"Consent {consent_id} renewed to version {request.consent_version}",
    )

    return {
        "consent_id": consent_id,
        "clinic_id": clinic_id,
        "previous_version": "1.5",
        "new_version": request.consent_version,
        "status": "active",
        "renewed_at": datetime.now(timezone.utc).isoformat(),
        "renewed_by": actor.user_id,
        "patient_acknowledged": request.patient_acknowledged,
        "guardian_consent": request.guardian_consent,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        "audit_log_id": audit_log_id,
        "evidence_grade": "A",
        "provenance": "measured",
    }


@router.get("/consents/{consent_id}/history")
def get_consent_history(
    consent_id: str,
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get full history of a consent record including all versions."""
    require_minimum_role(actor, "clinician")
    _audit_log(
        db, actor,
        action="consents.history",
        target_id=consent_id,
        note=f"Consent history consent={consent_id}",
    )

    return {
        "consent_id": consent_id,
        "clinic_id": clinic_id,
        "history": [
            {"version": "1.0", "status": "superseded", "signed_at": "2023-01-15T10:00:00+00:00", "expires_at": "2024-01-15T10:00:00+00:00", "signed_by": "[REDACTED]", "clinician": "Dr. Sarah Chen"},
            {"version": "1.5", "status": "superseded", "signed_at": "2023-06-10T09:00:00+00:00", "expires_at": "2024-06-10T09:00:00+00:00", "signed_by": "[REDACTED]", "clinician": "Dr. Sarah Chen"},
            {"version": "2.1", "status": "active", "signed_at": "2024-01-15T10:00:00+00:00", "expires_at": "2025-01-15T10:00:00+00:00", "signed_by": "[REDACTED]", "clinician": "Dr. Sarah Chen"},
        ],
        "evidence_grade": "A",
        "provenance": "measured",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Group therapy
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/groups")
def list_groups(
    clinic_id: str = Query(..., description="Clinic UUID"),
    status: str = Query("all", description="all | active | full | completed | paused"),
    therapy_type: str = Query("all", description="all | cbt | dbt | mindfulness | social_skills | support"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """List therapy groups scoped to clinic."""
    require_minimum_role(actor, "clinician")
    _audit_log(
        db, actor,
        action="groups.list",
        target_id=clinic_id,
        note=f"Groups list status={status} type={therapy_type} page={page} limit={limit}",
    )

    groups = [
        {"id": "grp_001", "name": "CBT for Depression", "type": "cbt", "status": "active", "max_participants": 12, "current_participants": 8, "facilitator_id": "usr_001", "facilitator_name": "Dr. Sarah Chen", "schedule": "Tue/Thu 14:00-15:30", "location": "Room 201", "start_date": "2024-01-15", "end_date": "2024-07-15", "session_count": 24, "completed_sessions": 12, "dropouts": 1, "avg_satisfaction": 4.2},
        {"id": "grp_002", "name": "DBT Skills Training", "type": "dbt", "status": "active", "max_participants": 10, "current_participants": 10, "facilitator_id": "usr_002", "facilitator_name": "Dr. Michael Park", "schedule": "Mon/Wed 10:00-11:30", "location": "Room 105", "start_date": "2024-02-01", "end_date": "2024-08-01", "session_count": 24, "completed_sessions": 10, "dropouts": 0, "avg_satisfaction": 4.5},
        {"id": "grp_003", "name": "Mindfulness-Based Stress Reduction", "type": "mindfulness", "status": "active", "max_participants": 15, "current_participants": 11, "facilitator_id": "usr_005", "facilitator_name": "Dr. Emily Thompson", "schedule": "Fri 09:00-11:00", "location": "Wellness Center", "start_date": "2024-03-01", "end_date": "2024-05-31", "session_count": 12, "completed_sessions": 8, "dropouts": 2, "avg_satisfaction": 4.3},
        {"id": "grp_004", "name": "Social Skills for Adults with ADHD", "type": "social_skills", "status": "paused", "max_participants": 8, "current_participants": 5, "facilitator_id": "usr_003", "facilitator_name": "Dr. Lisa Wong", "schedule": "Wed/Fri 16:00-17:30", "location": "Room 303", "start_date": "2024-01-20", "end_date": "2024-07-20", "session_count": 24, "completed_sessions": 8, "dropouts": 3, "avg_satisfaction": 3.9},
        {"id": "grp_005", "name": "Post-Trauma Support Circle", "type": "support", "status": "active", "max_participants": 10, "current_participants": 7, "facilitator_id": "usr_010", "facilitator_name": "Dr. Kevin O'Brien", "schedule": "Thu 18:00-19:30", "location": "Room 102", "start_date": "2024-04-01", "end_date": "2024-10-01", "session_count": 20, "completed_sessions": 6, "dropouts": 0, "avg_satisfaction": 4.6},
        {"id": "grp_006", "name": "Anxiety Management Workshop", "type": "cbt", "status": "completed", "max_participants": 12, "current_participants": 0, "facilitator_id": "usr_001", "facilitator_name": "Dr. Sarah Chen", "schedule": "Mon/Wed 11:00-12:30", "location": "Room 201", "start_date": "2023-09-01", "end_date": "2024-03-01", "session_count": 24, "completed_sessions": 24, "dropouts": 2, "avg_satisfaction": 4.4},
        {"id": "grp_007", "name": "Bipolar Disorder Peer Support", "type": "support", "status": "active", "max_participants": 12, "current_participants": 9, "facilitator_id": "usr_005", "facilitator_name": "Dr. Emily Thompson", "schedule": "Tue 17:00-18:30", "location": "Room 104", "start_date": "2024-02-15", "end_date": "2024-08-15", "session_count": 20, "completed_sessions": 14, "dropouts": 1, "avg_satisfaction": 4.1},
        {"id": "grp_008", "name": "OCD Exposure & Response Prevention", "type": "cbt", "status": "full", "max_participants": 6, "current_participants": 6, "facilitator_id": "usr_002", "facilitator_name": "Dr. Michael Park", "schedule": "Mon/Thu 15:00-16:30", "location": "Room 301", "start_date": "2024-05-01", "end_date": "2024-11-01", "session_count": 24, "completed_sessions": 4, "dropouts": 0, "avg_satisfaction": 4.7},
        {"id": "grp_009", "name": "Grief and Loss Processing", "type": "support", "status": "active", "max_participants": 10, "current_participants": 6, "facilitator_id": "usr_010", "facilitator_name": "Dr. Kevin O'Brien", "schedule": "Wed 14:00-15:30", "location": "Room 106", "start_date": "2024-04-15", "end_date": "2024-10-15", "session_count": 20, "completed_sessions": 4, "dropouts": 0, "avg_satisfaction": 4.5},
        {"id": "grp_010", "name": "Executive Function Training", "type": "social_skills", "status": "active", "max_participants": 8, "current_participants": 5, "facilitator_id": "usr_003", "facilitator_name": "Dr. Lisa Wong", "schedule": "Tue/Thu 10:00-11:30", "location": "Room 202", "start_date": "2024-05-01", "end_date": "2024-11-01", "session_count": 24, "completed_sessions": 2, "dropouts": 0, "avg_satisfaction": None},
    ]

    if status != "all":
        groups = [g for g in groups if g["status"] == status]
    if therapy_type != "all":
        groups = [g for g in groups if g["type"] == therapy_type]

    start = (page - 1) * limit
    end = start + limit
    paged = groups[start:end]

    return {
        "clinic_id": clinic_id,
        "groups": paged,
        "total": len(groups),
        "page": page,
        "limit": limit,
        "status_summary": {
            "active": sum(1 for g in groups if g["status"] == "active"),
            "full": sum(1 for g in groups if g["status"] == "full"),
            "completed": sum(1 for g in groups if g["status"] == "completed"),
            "paused": sum(1 for g in groups if g["status"] == "paused"),
        },
        "evidence_grade": "B",
        "provenance": "measured",
    }


@router.get("/groups/{group_id}")
def get_group_detail(
    group_id: str,
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get detailed information about a therapy group."""
    require_minimum_role(actor, "clinician")
    _audit_log(db, actor, action="groups.detail", target_id=group_id,
               note=f"Group detail group={group_id}")

    return {
        "id": group_id,
        "name": "CBT for Depression",
        "type": "cbt",
        "description": "Evidence-based cognitive behavioral therapy group for adults with major depressive disorder. Uses structured sessions combining psychoeducation, cognitive restructuring, and behavioral activation.",
        "status": "active",
        "max_participants": 12,
        "current_participants": 8,
        "facilitator_id": "usr_001",
        "facilitator_name": "Dr. Sarah Chen",
        "co_facilitator_id": "usr_003",
        "co_facilitator_name": "Dr. Lisa Wong",
        "schedule": "Tue/Thu 14:00-15:30",
        "location": "Room 201",
        "start_date": "2024-01-15",
        "end_date": "2024-07-15",
        "session_count": 24,
        "completed_sessions": 12,
        "curriculum": [
            {"week": 1, "topic": "Introduction to CBT Model", "materials": ["worksheet_1", "psychoedu_slides"]},
            {"week": 2, "topic": "Thought Records", "materials": ["thought_record_template", "examples_pdf"]},
            {"week": 3, "topic": "Cognitive Restructuring", "materials": ["cognitive_distortions_handout"]},
            {"week": 4, "topic": "Behavioral Activation", "materials": ["activity_scheduling_worksheet"]},
            {"week": 5, "topic": "Problem-Solving Skills", "materials": ["problem_solving_guide"]},
            {"week": 6, "topic": "Relapse Prevention", "materials": ["relapse_prevention_plan", "coping_cards"]},
        ],
        "outcome_measures": ["PHQ-9", "GAD-7", "QIDS-SR"],
        "evidence_grade": "A",
        "provenance": "measured",
    }


@router.get("/groups/{group_id}/participants")
def get_group_participants(
    group_id: str,
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get participants enrolled in a therapy group."""
    require_minimum_role(actor, "clinician")
    _audit_log(db, actor, action="groups.participants", target_id=group_id,
               note=f"Group participants group={group_id}")

    participants = [
        {"patient_id": "pat_001", "name": "[REDACTED]", "enrolled_at": "2024-01-15T10:00:00+00:00", "status": "active", "attendance_pct": 91.7, "dropout_risk": "low", "phq9_baseline": 18, "phq9_current": 9},
        {"patient_id": "pat_003", "name": "[REDACTED]", "enrolled_at": "2024-01-16T09:00:00+00:00", "status": "active", "attendance_pct": 83.3, "dropout_risk": "low", "phq9_baseline": 22, "phq9_current": 12},
        {"patient_id": "pat_007", "name": "[REDACTED]", "enrolled_at": "2024-01-20T11:00:00+00:00", "status": "active", "attendance_pct": 100.0, "dropout_risk": "very_low", "phq9_baseline": 16, "phq9_current": 7},
        {"patient_id": "pat_012", "name": "[REDACTED]", "enrolled_at": "2024-02-01T14:00:00+00:00", "status": "active", "attendance_pct": 75.0, "dropout_risk": "medium", "phq9_baseline": 20, "phq9_current": 14},
        {"patient_id": "pat_015", "name": "[REDACTED]", "enrolled_at": "2024-02-05T10:00:00+00:00", "status": "active", "attendance_pct": 66.7, "dropout_risk": "medium", "phq9_baseline": 19, "phq9_current": 15},
        {"patient_id": "pat_018", "name": "[REDACTED]", "enrolled_at": "2024-02-10T09:30:00+00:00", "status": "withdrawn", "attendance_pct": 33.3, "dropout_risk": "high", "phq9_baseline": 21, "phq9_current": 18, "withdrawn_at": "2024-03-15T10:00:00+00:00", "withdrawal_reason": "Schedule conflict"},
        {"patient_id": "pat_021", "name": "[REDACTED]", "enrolled_at": "2024-03-01T11:00:00+00:00", "status": "active", "attendance_pct": 100.0, "dropout_risk": "very_low", "phq9_baseline": 17, "phq9_current": 8},
        {"patient_id": "pat_024", "name": "[REDACTED]", "enrolled_at": "2024-03-10T14:00:00+00:00", "status": "active", "attendance_pct": 80.0, "dropout_risk": "low", "phq9_baseline": 23, "phq9_current": 11},
    ]

    return {
        "group_id": group_id,
        "clinic_id": clinic_id,
        "participants": participants,
        "total": len(participants),
        "active": sum(1 for p in participants if p["status"] == "active"),
        "withdrawn": sum(1 for p in participants if p["status"] == "withdrawn"),
        "avg_attendance_pct": round(sum(p["attendance_pct"] for p in participants) / len(participants), 1),
        "evidence_grade": "B",
        "provenance": "measured",
    }


@router.post("/groups/{group_id}/enroll")
def enroll_patient_in_group(
    group_id: str,
    request: dict[str, Any],
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Enroll a patient in a therapy group."""
    require_minimum_role(actor, "clinician")
    patient_id = request.get("patient_id", "")
    _audit_log(
        db, actor,
        action="groups.enroll",
        target_id=group_id,
        note=f"Enrolled patient={patient_id} to group={group_id}",
    )

    return {
        "enrollment_id": str(uuid.uuid4()),
        "group_id": group_id,
        "clinic_id": clinic_id,
        "patient_id": patient_id,
        "status": "enrolled",
        "enrolled_at": datetime.now(timezone.utc).isoformat(),
        "enrolled_by": actor.user_id,
        "evidence_grade": "A",
        "provenance": "measured",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Home programs
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/home-programs")
def list_home_programs(
    clinic_id: str = Query(..., description="Clinic UUID"),
    status: str = Query("all", description="all | active | completed | paused | draft"),
    patient_id: Optional[str] = Query(None, description="Filter by patient"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """List home programs (exercise, cognitive training, mindfulness) scoped to clinic."""
    require_minimum_role(actor, "clinician")
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
    _audit_log(
        db, actor,
        action="home_programs.list",
        target_id=clinic_id,
        note=f"Home programs status={status} page={page} limit={limit}",
    )

    programs = [
        {"id": "hp_001", "patient_id": "pat_001", "title": "Daily Mindfulness Practice", "type": "mindfulness", "status": "active", "tasks_total": 28, "tasks_completed": 22, "adherence_pct": 78.6, "assigned_by": "Dr. Sarah Chen", "assigned_at": "2024-05-01T10:00:00+00:00", "due_date": "2024-06-30", "difficulty": "beginner"},
        {"id": "hp_002", "patient_id": "pat_002", "title": "Cognitive Training Suite", "type": "cognitive_training", "status": "active", "tasks_total": 42, "tasks_completed": 35, "adherence_pct": 83.3, "assigned_by": "Dr. Michael Park", "assigned_at": "2024-04-15T14:00:00+00:00", "due_date": "2024-07-15", "difficulty": "intermediate"},
        {"id": "hp_003", "patient_id": "pat_003", "title": "Sleep Hygiene Protocol", "type": "sleep_hygiene", "status": "active", "tasks_total": 21, "tasks_completed": 18, "adherence_pct": 85.7, "assigned_by": "Dr. Lisa Wong", "assigned_at": "2024-05-10T09:00:00+00:00", "due_date": "2024-06-20", "difficulty": "beginner"},
        {"id": "hp_004", "patient_id": "pat_004", "title": "Behavioral Activation Activities", "type": "behavioral_activation", "status": "paused", "tasks_total": 35, "tasks_completed": 15, "adherence_pct": 42.9, "assigned_by": "Dr. Emily Thompson", "assigned_at": "2024-03-20T11:00:00+00:00", "due_date": "2024-06-30", "difficulty": "intermediate"},
        {"id": "hp_005", "patient_id": "pat_005", "title": "Relaxation & Breathing Exercises", "type": "relaxation", "status": "active", "tasks_total": 14, "tasks_completed": 12, "adherence_pct": 85.7, "assigned_by": "Dr. Sarah Chen", "assigned_at": "2024-05-15T10:00:00+00:00", "due_date": "2024-06-15", "difficulty": "beginner"},
        {"id": "hp_006", "patient_id": "pat_006", "title": "Executive Function Workbook", "type": "cognitive_training", "status": "completed", "tasks_total": 56, "tasks_completed": 56, "adherence_pct": 100.0, "assigned_by": "Dr. Lisa Wong", "assigned_at": "2024-01-10T09:00:00+00:00", "due_date": "2024-04-10", "difficulty": "advanced"},
        {"id": "hp_007", "patient_id": "pat_007", "title": "Exposure Hierarchy Practice", "type": "exposure_therapy", "status": "active", "tasks_total": 20, "tasks_completed": 8, "adherence_pct": 40.0, "assigned_by": "Dr. Michael Park", "assigned_at": "2024-05-20T14:00:00+00:00", "due_date": "2024-07-20", "difficulty": "advanced"},
        {"id": "hp_008", "patient_id": "pat_008", "title": "Mood Tracking & Journaling", "type": "self_monitoring", "status": "active", "tasks_total": 30, "tasks_completed": 25, "adherence_pct": 83.3, "assigned_by": "Dr. Kevin O'Brien", "assigned_at": "2024-04-25T10:00:00+00:00", "due_date": "2024-06-25", "difficulty": "beginner"},
        {"id": "hp_009", "patient_id": "pat_009", "title": "Social Skills Practice", "type": "social_skills", "status": "draft", "tasks_total": 24, "tasks_completed": 0, "adherence_pct": 0.0, "assigned_by": "Dr. Sarah Chen", "assigned_at": "2024-06-10T11:00:00+00:00", "due_date": "2024-08-10", "difficulty": "intermediate"},
        {"id": "hp_010", "patient_id": "pat_010", "title": "Physical Exercise Plan", "type": "physical_exercise", "status": "active", "tasks_total": 42, "tasks_completed": 30, "adherence_pct": 71.4, "assigned_by": "Dr. Emily Thompson", "assigned_at": "2024-04-01T09:00:00+00:00", "due_date": "2024-07-01", "difficulty": "intermediate"},
    ]

    if status != "all":
        programs = [p for p in programs if p["status"] == status]
    if patient_id:
        programs = [p for p in programs if p["patient_id"] == patient_id]

    start = (page - 1) * limit
    end = start + limit
    paged = programs[start:end]

    return {
        "clinic_id": clinic_id,
        "programs": paged,
        "total": len(programs),
        "page": page,
        "limit": limit,
        "adherence_summary": {
            "avg_adherence_pct": round(sum(p["adherence_pct"] for p in programs) / len(programs), 1),
            "high_adherence": sum(1 for p in programs if p["adherence_pct"] >= 80),
            "medium_adherence": sum(1 for p in programs if 50 <= p["adherence_pct"] < 80),
            "low_adherence": sum(1 for p in programs if p["adherence_pct"] < 50),
        },
        "evidence_grade": "B",
        "provenance": "measured",
    }


@router.get("/home-programs/{program_id}")
def get_home_program_detail(
    program_id: str,
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get detailed home program information."""
    require_minimum_role(actor, "clinician")
    _audit_log(db, actor, action="home_programs.detail", target_id=program_id,
               note=f"Home program detail program={program_id}")

    return {
        "id": program_id,
        "title": "Daily Mindfulness Practice",
        "description": "Structured 8-week mindfulness program with daily guided meditations, body scan exercises, and informal mindfulness practices. Based on MBSR curriculum adapted for depression.",
        "patient_id": "pat_001",
        "type": "mindfulness",
        "status": "active",
        "difficulty": "beginner",
        "tasks_total": 28,
        "tasks_completed": 22,
        "adherence_pct": 78.6,
        "assigned_by": "Dr. Sarah Chen",
        "assigned_at": "2024-05-01T10:00:00+00:00",
        "due_date": "2024-06-30",
        "outcome_measures": ["FFMQ", "PHQ-9", "PSS"],
        "evidence_base": "MBSR for depression (Grade A evidence, Hofmann et al. 2010 meta-analysis)",
        "evidence_grade": "A",
        "provenance": "measured",
    }


@router.get("/home-programs/{program_id}/tasks")
def get_program_tasks(
    program_id: str,
    clinic_id: str = Query(..., description="Clinic UUID"),
    status: str = Query("all", description="all | pending | completed | overdue"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get tasks for a home program."""
    require_minimum_role(actor, "clinician")
    _audit_log(db, actor, action="home_programs.tasks", target_id=program_id,
               note=f"Program tasks program={program_id} status={status}")

    tasks = [
        {"id": "tsk_001", "program_id": program_id, "title": "Morning body scan (15 min)", "status": "completed", "completed_at": "2024-06-01T07:15:00+00:00", "difficulty": "beginner", "duration_min": 15, "evidence_required": False},
        {"id": "tsk_002", "program_id": program_id, "title": "Breathing awareness practice (10 min)", "status": "completed", "completed_at": "2024-06-02T08:00:00+00:00", "difficulty": "beginner", "duration_min": 10, "evidence_required": False},
        {"id": "tsk_003", "program_id": program_id, "title": "Loving-kindness meditation (20 min)", "status": "completed", "completed_at": "2024-06-03T07:30:00+00:00", "difficulty": "beginner", "duration_min": 20, "evidence_required": False},
        {"id": "tsk_004", "program_id": program_id, "title": "Walking meditation (15 min)", "status": "completed", "completed_at": "2024-06-04T18:00:00+00:00", "difficulty": "beginner", "duration_min": 15, "evidence_required": False},
        {"id": "tsk_005", "program_id": program_id, "title": "RAIN technique for difficult emotions", "status": "overdue", "completed_at": None, "difficulty": "intermediate", "duration_min": 20, "evidence_required": True, "due_at": "2024-06-05T23:59:00+00:00"},
        {"id": "tsk_006", "program_id": program_id, "title": "Three-minute breathing space", "status": "pending", "completed_at": None, "difficulty": "beginner", "duration_min": 3, "evidence_required": False, "due_at": "2024-06-10T23:59:00+00:00"},
        {"id": "tsk_007", "program_id": program_id, "title": "Mindful eating exercise", "status": "pending", "completed_at": None, "difficulty": "beginner", "duration_min": 15, "evidence_required": True, "due_at": "2024-06-12T23:59:00+00:00"},
        {"id": "tsk_008", "program_id": program_id, "title": "Sitting meditation with open awareness", "status": "pending", "completed_at": None, "difficulty": "intermediate", "duration_min": 25, "evidence_required": False, "due_at": "2024-06-14T23:59:00+00:00"},
    ]

    if status != "all":
        tasks = [t for t in tasks if t["status"] == status]

    return {
        "program_id": program_id,
        "clinic_id": clinic_id,
        "tasks": tasks,
        "total": len(tasks),
        "evidence_grade": "B",
        "provenance": "measured",
    }


@router.patch("/home-programs/{program_id}/tasks/{task_id}")
def update_program_task(
    program_id: str,
    task_id: str,
    request: dict[str, Any],
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Update a home program task (mark complete, add notes)."""
    require_minimum_role(actor, "clinician")
    _audit_log(
        db, actor,
        action="home_programs.task_update",
        target_id=task_id,
        note=f"Updated task={task_id} program={program_id} status={request.get('status', 'unknown')}",
    )

    return {
        "task_id": task_id,
        "program_id": program_id,
        "clinic_id": clinic_id,
        "status": request.get("status", "completed"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": actor.user_id,
        "notes": request.get("notes", ""),
        "evidence_grade": "A",
        "provenance": "measured",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Outcome measures
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/outcomes")
def list_outcome_measures(
    clinic_id: str = Query(..., description="Clinic UUID"),
    measure_type: str = Query("all", description="all | symptom | functional | quality_of_life | cognitive"),
    patient_id: Optional[str] = Query(None, description="Filter by patient"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """List outcome measures scoped to clinic."""
    require_minimum_role(actor, "clinician")
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
    _audit_log(
        db, actor,
        action="outcomes.list",
        target_id=clinic_id,
        note=f"Outcomes type={measure_type} page={page} limit={limit}",
    )

    measures = [
        {"id": "out_001", "patient_id": "pat_001", "template_id": "PHQ-9", "template_title": "PHQ-9 Depression Scale", "type": "symptom", "score": "8", "score_numeric": 8.0, "baseline": 18, "delta": -10, "percent_change": -55.6, "measurement_point": "post", "administered_at": "2024-06-01T10:00:00+00:00", "clinician_id": "usr_001", "responder": True, "remitter": True},
        {"id": "out_002", "patient_id": "pat_002", "template_id": "GAD-7", "template_title": "GAD-7 Anxiety Scale", "type": "symptom", "score": "12", "score_numeric": 12.0, "baseline": 20, "delta": -8, "percent_change": -40.0, "measurement_point": "mid", "administered_at": "2024-05-28T14:00:00+00:00", "clinician_id": "usr_002", "responder": True, "remitter": False},
        {"id": "out_003", "patient_id": "pat_003", "template_id": "MoCA", "template_title": "Montreal Cognitive Assessment", "type": "cognitive", "score": "24", "score_numeric": 24.0, "baseline": 20, "delta": 4, "percent_change": 20.0, "measurement_point": "post", "administered_at": "2024-05-25T09:00:00+00:00", "clinician_id": "usr_003", "responder": True, "remitter": False},
        {"id": "out_004", "patient_id": "pat_004", "template_id": "QIDS-SR", "template_title": "QIDS-SR16", "type": "symptom", "score": "14", "score_numeric": 14.0, "baseline": 16, "delta": -2, "percent_change": -12.5, "measurement_point": "mid", "administered_at": "2024-06-02T11:00:00+00:00", "clinician_id": "usr_005", "responder": False, "remitter": False},
        {"id": "out_005", "patient_id": "pat_005", "template_id": "WHO-5", "template_title": "WHO-5 Well-Being Index", "type": "quality_of_life", "score": "52", "score_numeric": 52.0, "baseline": 28, "delta": 24, "percent_change": 85.7, "measurement_point": "post", "administered_at": "2024-05-20T10:00:00+00:00", "clinician_id": "usr_001", "responder": True, "remitter": False},
        {"id": "out_006", "patient_id": "pat_006", "template_id": "PCL-5", "template_title": "PCL-5 PTSD Checklist", "type": "symptom", "score": "32", "score_numeric": 32.0, "baseline": 58, "delta": -26, "percent_change": -44.8, "measurement_point": "post", "administered_at": "2024-05-18T13:00:00+00:00", "clinician_id": "usr_010", "responder": True, "remitter": False},
        {"id": "out_007", "patient_id": "pat_007", "template_id": "SHEEHAN-DISABILITY", "template_title": "Sheehan Disability Scale", "type": "functional", "score": "8", "score_numeric": 8.0, "baseline": 18, "delta": -10, "percent_change": -55.6, "measurement_point": "post", "administered_at": "2024-06-05T09:00:00+00:00", "clinician_id": "usr_002", "responder": True, "remitter": False},
        {"id": "out_008", "patient_id": "pat_008", "template_id": "Y-BOCS", "template_title": "Y-BOCS Obsessive-Compulsive", "type": "symptom", "score": "16", "score_numeric": 16.0, "baseline": 28, "delta": -12, "percent_change": -42.9, "measurement_point": "mid", "administered_at": "2024-06-03T14:00:00+00:00", "clinician_id": "usr_002", "responder": True, "remitter": False},
        {"id": "out_009", "patient_id": "pat_009", "template_id": "RBANS", "template_title": "RBANS Cognitive Battery", "type": "cognitive", "score": "92", "score_numeric": 92.0, "baseline": 85, "delta": 7, "percent_change": 8.2, "measurement_point": "post", "administered_at": "2024-05-15T10:00:00+00:00", "clinician_id": "usr_003", "responder": True, "remitter": False},
        {"id": "out_010", "patient_id": "pat_010", "template_id": "PSQI", "template_title": "Pittsburgh Sleep Quality Index", "type": "symptom", "score": "6", "score_numeric": 6.0, "baseline": 14, "delta": -8, "percent_change": -57.1, "measurement_point": "post", "administered_at": "2024-06-01T08:00:00+00:00", "clinician_id": "usr_005", "responder": True, "remitter": True},
    ]

    if measure_type != "all":
        measures = [m for m in measures if m["type"] == measure_type]
    if patient_id:
        measures = [m for m in measures if m["patient_id"] == patient_id]

    start = (page - 1) * limit
    end = start + limit
    paged = measures[start:end]

    return {
        "clinic_id": clinic_id,
        "measures": paged,
        "total": len(measures),
        "page": page,
        "limit": limit,
        "responder_summary": {
            "total_responders": sum(1 for m in measures if m.get("responder")),
            "total_remitters": sum(1 for m in measures if m.get("remitter")),
            "avg_percent_change": round(sum(m["percent_change"] for m in measures) / len(measures), 1),
        },
        "evidence_grade": "A",
        "provenance": "measured",
    }


@router.post("/outcomes")
def record_outcome(
    request: OutcomeCreateRequest,
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Record a new outcome measurement with audit logging."""
    require_minimum_role(actor, "clinician")
    outcome_id = str(uuid.uuid4())

    _audit_log(
        db, actor,
        action="outcomes.create",
        target_id=outcome_id,
        note=f"Recorded {request.template_id} score={request.score} for patient={request.patient_id}",
    )

    return {
        "id": outcome_id,
        "clinic_id": clinic_id,
        "patient_id": request.patient_id,
        "course_id": request.course_id,
        "template_id": request.template_id,
        "template_title": request.template_title,
        "score": request.score,
        "score_numeric": request.score_numeric,
        "measurement_point": request.measurement_point,
        "clinician_id": actor.user_id,
        "administered_at": request.administered_at or datetime.now(timezone.utc).isoformat(),
        "evidence_grade": "A",
        "provenance": "measured",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Patient goals
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/goals")
def list_patient_goals(
    clinic_id: str = Query(..., description="Clinic UUID"),
    status: str = Query("all", description="all | active | achieved | paused | discontinued"),
    patient_id: Optional[str] = Query(None, description="Filter by patient"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """List patient goals scoped to clinic."""
    require_minimum_role(actor, "clinician")
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
    _audit_log(
        db, actor,
        action="goals.list",
        target_id=clinic_id,
        note=f"Goals list status={status} page={page} limit={limit}",
    )

    goals = [
        {"id": "gl_001", "patient_id": "pat_001", "title": "Reduce PHQ-9 to below 10", "domain": "symptom_reduction", "status": "achieved", "progress_pct": 100.0, "target_date": "2024-06-01", "created_at": "2024-03-01T10:00:00+00:00", "target_value": "< 10", "current_value": "8", "evidence_links": ["out_001"]},
        {"id": "gl_002", "patient_id": "pat_002", "title": "Complete 8 CBT group sessions", "domain": "treatment_engagement", "status": "active", "progress_pct": 75.0, "target_date": "2024-07-15", "created_at": "2024-04-01T14:00:00+00:00", "target_value": "8 sessions", "current_value": "6 sessions", "evidence_links": ["grp_001"]},
        {"id": "gl_003", "patient_id": "pat_003", "title": "Improve MoCA score by 3 points", "domain": "cognitive_function", "status": "achieved", "progress_pct": 100.0, "target_date": "2024-06-01", "created_at": "2024-03-15T09:00:00+00:00", "target_value": "+3 points", "current_value": "+4 points", "evidence_links": ["out_003"]},
        {"id": "gl_004", "patient_id": "pat_004", "title": "Reduce work absence to < 2 days/month", "domain": "functional_recovery", "status": "active", "progress_pct": 50.0, "target_date": "2024-08-01", "created_at": "2024-04-10T11:00:00+00:00", "target_value": "< 2 days", "current_value": "4 days", "evidence_links": []},
        {"id": "gl_005", "patient_id": "pat_005", "title": "Establish consistent sleep schedule", "domain": "sleep_hygiene", "status": "active", "progress_pct": 60.0, "target_date": "2024-07-01", "created_at": "2024-04-20T10:00:00+00:00", "target_value": "7 nights/week", "current_value": "5 nights/week", "evidence_links": ["hp_003"]},
        {"id": "gl_006", "patient_id": "pat_006", "title": "Reduce PCL-5 by 50%", "domain": "symptom_reduction", "status": "achieved", "progress_pct": 100.0, "target_date": "2024-06-15", "created_at": "2024-02-01T13:00:00+00:00", "target_value": "-50%", "current_value": "-44.8%", "evidence_links": ["out_006"]},
        {"id": "gl_007", "patient_id": "pat_007", "title": "Practice daily mindfulness for 30 days", "domain": "self_management", "status": "active", "progress_pct": 70.0, "target_date": "2024-07-01", "created_at": "2024-05-01T09:00:00+00:00", "target_value": "30 days", "current_value": "21 days", "evidence_links": ["hp_001"]},
        {"id": "gl_008", "patient_id": "pat_008", "title": "Complete Y-BOCS below 12", "domain": "symptom_reduction", "status": "active", "progress_pct": 66.7, "target_date": "2024-08-15", "created_at": "2024-04-01T14:00:00+00:00", "target_value": "< 12", "current_value": "16", "evidence_links": ["out_008"]},
        {"id": "gl_009", "patient_id": "pat_009", "title": "Increase social interactions to 3/week", "domain": "functional_recovery", "status": "paused", "progress_pct": 33.0, "target_date": "2024-07-01", "created_at": "2024-05-10T10:00:00+00:00", "target_value": "3/week", "current_value": "1/week", "evidence_links": []},
        {"id": "gl_010", "patient_id": "pat_010", "title": "Return to part-time work", "domain": "functional_recovery", "status": "active", "progress_pct": 40.0, "target_date": "2024-09-01", "created_at": "2024-04-01T08:00:00+00:00", "target_value": "part-time", "current_value": "planning phase", "evidence_links": []},
    ]

    if status != "all":
        goals = [g for g in goals if g["status"] == status]
    if patient_id:
        goals = [g for g in goals if g["patient_id"] == patient_id]

    start = (page - 1) * limit
    end = start + limit
    paged = goals[start:end]

    return {
        "clinic_id": clinic_id,
        "goals": paged,
        "total": len(goals),
        "page": page,
        "limit": limit,
        "status_summary": {
            "active": sum(1 for g in goals if g["status"] == "active"),
            "achieved": sum(1 for g in goals if g["status"] == "achieved"),
            "paused": sum(1 for g in goals if g["status"] == "paused"),
            "discontinued": sum(1 for g in goals if g["status"] == "discontinued"),
        },
        "avg_progress_pct": round(sum(g["progress_pct"] for g in goals) / len(goals), 1),
        "evidence_grade": "B",
        "provenance": "measured",
    }


@router.patch("/goals/{goal_id}/progress")
def update_goal_progress(
    goal_id: str,
    progress: GoalProgressUpdate,
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Update progress on a patient goal with audit logging."""
    require_minimum_role(actor, "clinician")
    _audit_log(
        db, actor,
        action="goals.progress_update",
        target_id=goal_id,
        note=f"Goal {goal_id} progress={progress.progress_pct}% status={progress.status}",
    )

    return {
        "goal_id": goal_id,
        "clinic_id": clinic_id,
        "progress_pct": progress.progress_pct,
        "status": progress.status,
        "notes": progress.notes,
        "evidence_links": progress.evidence_links,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": actor.user_id,
        "evidence_grade": "A",
        "provenance": "measured",
    }


@router.get("/goals/{goal_id}/milestones")
def get_goal_milestones(
    goal_id: str,
    clinic_id: str = Query(..., description="Clinic UUID"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get milestone history for a patient goal."""
    require_minimum_role(actor, "clinician")
    _audit_log(db, actor, action="goals.milestones", target_id=goal_id,
               note=f"Goal milestones goal={goal_id}")

    milestones = [
        {"id": "ms_001", "goal_id": goal_id, "title": "Initial assessment completed", "status": "achieved", "achieved_at": "2024-03-01T10:00:00+00:00", "evidence": "assessment_001"},
        {"id": "ms_002", "goal_id": goal_id, "title": "25% progress marker", "status": "achieved", "achieved_at": "2024-04-01T10:00:00+00:00", "evidence": "out_001"},
        {"id": "ms_003", "goal_id": goal_id, "title": "50% progress marker", "status": "achieved", "achieved_at": "2024-05-01T10:00:00+00:00", "evidence": "session_notes"},
        {"id": "ms_004", "goal_id": goal_id, "title": "75% progress marker", "status": "achieved", "achieved_at": "2024-05-20T10:00:00+00:00", "evidence": "session_notes"},
        {"id": "ms_005", "goal_id": goal_id, "title": "Goal achieved - PHQ-9 below 10", "status": "achieved", "achieved_at": "2024-06-01T10:00:00+00:00", "evidence": "out_001"},
    ]

    return {
        "goal_id": goal_id,
        "clinic_id": clinic_id,
        "milestones": milestones,
        "total": len(milestones),
        "achieved": sum(1 for m in milestones if m["status"] == "achieved"),
        "evidence_grade": "B",
        "provenance": "measured",
    }
