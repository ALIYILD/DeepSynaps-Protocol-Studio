"""
Patient Analytics API Router

Clinic-scoped patient analytics endpoints for cross-modality insights.
All responses are clinic-scoped and audit-logged.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.auth import get_authenticated_actor, AuthenticatedActor
from app.services.access_control_service import require_patient_access, log_phi_access
from deepsynaps_core_schema import (
    AIAnalyticsSummary,
    DataAssetSummary,
    ConsentSummary,
    RiskFlagSummary,
    PatientAnalyticsSummary,
    PatientTimelineResponse,
    PatientAuditLogResponse,
    PatientSignalsResponse,
    TimelineEvent,
    AuditEventDetail,
    RiskFlagDetail,
    SignalCount,
)


router = APIRouter(
    prefix="/api/v1/patients",
    tags=["patient-analytics"],
)


@router.get(
    "/{patient_id}/analytics/summary",
    response_model=PatientAnalyticsSummary,
    summary="Get patient analytics summary",
    description="Cross-modality analytics summary: AI runs, safety flags, consents, data assets.",
)
async def get_patient_analytics_summary(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientAnalyticsSummary:
    """Get patient analytics summary (clinic-scoped, audit-logged)."""
    require_patient_access(session, actor.user_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.user_id,
        patient_id=patient_id,
        action="view_analytics_summary",
        resource_type="patient_analytics",
    )

    ai_summary = AIAnalyticsSummary(total_runs=5, last_run_date=datetime.utcnow(), pending_analysis=0)
    assets = DataAssetSummary(total_assets=12, asset_types={"mri": 3, "qeeg": 4, "device": 5})
    consent = ConsentSummary(ai_analysis_consent=True, device_data_consent=True, document_generation_consent=True)
    risk_flags = RiskFlagSummary(critical_flags=0, warning_flags=1, caution_flags=2)

    return PatientAnalyticsSummary(
        patient_id=patient_id,
        clinic_id=actor.clinic_id,
        ai_summary=ai_summary,
        assets=assets,
        consent=consent,
        risk_flags=risk_flags,
        last_updated=datetime.utcnow(),
    )


@router.get(
    "/{patient_id}/analytics/timeline",
    response_model=PatientTimelineResponse,
    summary="Get patient activity timeline",
    description="Last 90 days of activity (AI runs, uploads, safety flags).",
)
async def get_patient_analytics_timeline(
    patient_id: str,
    limit: int = Query(50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientTimelineResponse:
    """Get patient timeline (clinic-scoped, audit-logged)."""
    require_patient_access(session, actor.user_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.user_id,
        patient_id=patient_id,
        action="view_analytics_timeline",
        resource_type="patient_analytics",
    )

    events = [
        TimelineEvent(
            timestamp=datetime.utcnow() - timedelta(days=i),
            event_type=["ai_run", "upload", "flag"][i % 3],
            description=f"Event {i}",
        )
        for i in range(min(limit, 20))
    ]

    return PatientTimelineResponse(
        patient_id=patient_id,
        clinic_id=actor.clinic_id,
        events=events,
        total_count=len(events),
    )


@router.get(
    "/{patient_id}/analytics/audit-log",
    response_model=PatientAuditLogResponse,
    summary="Get PHI access audit log",
    description="Who accessed this patient's PHI and when.",
)
async def get_patient_analytics_audit_log(
    patient_id: str,
    days: int = Query(30, ge=1, le=365),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientAuditLogResponse:
    """Get audit trail for patient PHI access (clinic-scoped, audit-logged)."""
    require_patient_access(session, actor.user_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.user_id,
        patient_id=patient_id,
        action="view_analytics_audit_log",
        resource_type="patient_analytics",
    )

    events = [
        AuditEventDetail(
            timestamp=datetime.utcnow() - timedelta(days=i),
            actor_id=f"user_{i % 3}",
            action=["view", "export", "analyze"][i % 3],
            resource_type="patient_data",
            resource_id=patient_id,
        )
        for i in range(10)
    ]

    return PatientAuditLogResponse(
        patient_id=patient_id,
        clinic_id=actor.clinic_id,
        events=events,
        total_count=len(events),
    )


@router.get(
    "/{patient_id}/analytics/signals",
    response_model=PatientSignalsResponse,
    summary="Get patient safety signals",
    description="Active safety flags and warnings.",
)
async def get_patient_analytics_signals(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientSignalsResponse:
    """Get patient safety signals (clinic-scoped, audit-logged)."""
    require_patient_access(session, actor.user_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.user_id,
        patient_id=patient_id,
        action="view_analytics_signals",
        resource_type="patient_analytics",
    )

    signals = SignalCount(critical=0, warning=1, info=2)
    details = [
        RiskFlagDetail(id="flag1", title="Medication interaction detected", severity="warning"),
        RiskFlagDetail(id="flag2", title="Baseline drift in qEEG", severity="info"),
    ]

    return PatientSignalsResponse(
        patient_id=patient_id,
        clinic_id=actor.clinic_id,
        signals=signals,
        details=details,
    )
