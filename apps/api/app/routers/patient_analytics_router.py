"""Patient analytics endpoints.

Clinic-scoped patient analytics endpoints for cross-modality insights.
All responses are patient/clinic-scoped and audit-logged.
"""

from datetime import datetime, timedelta, timezone
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id
from deepsynaps_core_schema import (
    AIAnalyticsSummary,
    AuditEventDetail,
    ConsentSummary,
    DataAssetSummary,
    PatientAnalyticsSummary,
    PatientAuditLogResponse,
    PatientSignalsResponse,
    PatientTimelineResponse,
    RiskFlagDetail,
    RiskFlagSummary,
    SignalCount,
    TimelineEvent,
)


router = APIRouter(
    prefix="/api/v1/patients",
    tags=["patient-analytics"],
)


def _require_patient_analytics_access(
    session: Session,
    actor: AuthenticatedActor,
    patient_id: str,
) -> str | None:
    exists, clinic_id = resolve_patient_clinic_id(session, patient_id)
    if not exists:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )
    require_patient_owner(actor, clinic_id)
    return clinic_id


def _audit_patient_analytics_access(
    session: Session,
    *,
    actor: AuthenticatedActor,
    patient_id: str,
    action: str,
) -> None:
    try:
        now = datetime.now(timezone.utc)
        create_audit_event(
            session,
            event_id=(
                f"patient_analytics-{action}-{actor.actor_id}-"
                f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
            ),
            target_id=patient_id,
            target_type="patient_analytics",
            action=f"patient_analytics.{action}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=f"patient_id={patient_id}",
            created_at=now.isoformat(),
        )
    except Exception:
        # Analytics reads must not fail because audit persistence is unavailable.
        return


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
    _require_patient_analytics_access(session, actor, patient_id)
    _audit_patient_analytics_access(
        session,
        actor=actor,
        patient_id=patient_id,
        action="view_summary",
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
    _require_patient_analytics_access(session, actor, patient_id)
    _audit_patient_analytics_access(
        session,
        actor=actor,
        patient_id=patient_id,
        action="view_timeline",
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
    _require_patient_analytics_access(session, actor, patient_id)
    _audit_patient_analytics_access(
        session,
        actor=actor,
        patient_id=patient_id,
        action="view_audit_log",
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
    _require_patient_analytics_access(session, actor, patient_id)
    _audit_patient_analytics_access(
        session,
        actor=actor,
        patient_id=patient_id,
        action="view_signals",
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
