"""Patient analytics API router for clinical data platform.

Provides four endpoints for retrieving aggregated patient analytics:
- GET /api/v1/patients/{patient_id}/analytics/summary     — comprehensive analytics summary
- GET /api/v1/patients/{patient_id}/analytics/timeline    — activity timeline (last 90 days)
- GET /api/v1/patients/{patient_id}/analytics/audit-log   — PHI access audit trail
- GET /api/v1/patients/{patient_id}/analytics/signals     — active risk and review signals

All endpoints:
1. Enforce access control via access_control_service.require_patient_access()
2. Log PHI access via access_control_service.log_phi_access()
3. Return proper HTTP codes (403 for access denied, 404 for not found, 500 for errors)
4. Include docstrings and type hints
5. Use Pydantic response models
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.services import patient_analytics_service, access_control_service

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/patients", tags=["patient-analytics"])


# ── Pydantic Response Models ──────────────────────────────────────────────────

class AIAnalyticsSummary(BaseModel):
    """Summary of AI analysis runs."""
    total: int = Field(description="Total AI analysis runs")
    pending: int = Field(description="Pending analysis runs")
    processing: int = Field(description="Currently processing runs")
    completed: int = Field(description="Completed runs")
    failed: int = Field(description="Failed or errored runs")
    pending_review: int = Field(description="Completed but pending clinician review")


class DataAssetSummary(BaseModel):
    """Summary of patient data assets."""
    total: int = Field(description="Total data assets")
    by_type: Dict[str, int] = Field(default_factory=dict, description="Asset count by type")


class ConsentSummary(BaseModel):
    """Summary of patient consent status."""
    total: int = Field(description="Total consent records")
    active: int = Field(description="Active consents")
    withdrawn: int = Field(description="Withdrawn consents")
    expired: int = Field(description="Expired consents")


class RiskFlagDetail(BaseModel):
    """Detail of a single risk flag."""
    id: str = Field(description="Flag ID")
    flag_type: str = Field(description="Type of flag")
    message: str = Field(description="Flag message")
    created_at: str = Field(description="ISO 8601 timestamp")


class RiskFlagSummary(BaseModel):
    """Summary of patient risk flags."""
    active: int = Field(description="Total active risk flags")
    by_severity: Dict[str, List[RiskFlagDetail]] = Field(
        default_factory=lambda: {"critical": [], "high": [], "warning": [], "info": []},
        description="Flags grouped by severity"
    )


class PatientAnalyticsSummary(BaseModel):
    """Comprehensive analytics summary for a patient."""
    patient_id: str = Field(description="Patient ID")
    created_at: str = Field(description="Patient creation timestamp (ISO 8601)")
    ai_analysis: AIAnalyticsSummary = Field(description="AI analysis metrics")
    data_assets: DataAssetSummary = Field(description="Data asset metrics")
    consent: ConsentSummary = Field(description="Consent status metrics")
    risk_flags: RiskFlagSummary = Field(description="Risk flag summary")
    generated_at: str = Field(description="Timestamp when summary was generated (ISO 8601)")


class TimelineEvent(BaseModel):
    """Single timeline event."""
    type: str = Field(description="Event type (ai_analysis, safety_flag, data_upload)")
    id: str = Field(description="Event ID")
    timestamp: str = Field(description="Event timestamp (ISO 8601)")
    status: Optional[str] = Field(default=None, description="Event status")
    # Additional fields vary by event type; using dict for flexibility
    details: Dict[str, Any] = Field(default_factory=dict, description="Event-specific details")


class PatientTimelineResponse(BaseModel):
    """Patient activity timeline response."""
    patient_id: str = Field(description="Patient ID")
    days_back: int = Field(description="Number of days looked back")
    event_count: int = Field(description="Total events returned")
    events: List[TimelineEvent] = Field(description="Timeline events (sorted by date descending)")
    generated_at: str = Field(description="Timestamp when timeline was generated (ISO 8601)")


class AuditEventDetail(BaseModel):
    """Single audit event."""
    id: str = Field(description="Audit event ID")
    actor_id: str = Field(description="User ID who performed action")
    action: str = Field(description="Action performed (read, export, etc.)")
    resource_type: str = Field(description="Type of resource accessed")
    result: str = Field(description="Result (allowed, denied)")
    timestamp: str = Field(description="Timestamp (ISO 8601)")
    reason: Optional[str] = Field(default=None, description="Reason code if denied")


class PatientAuditLogResponse(BaseModel):
    """Patient PHI access audit trail response."""
    patient_id: str = Field(description="Patient ID")
    days_back: int = Field(description="Number of days looked back")
    event_count: int = Field(description="Total events returned")
    events: List[AuditEventDetail] = Field(description="Audit events (sorted by date descending)")
    generated_at: str = Field(description="Timestamp when audit log was generated (ISO 8601)")


class SignalCount(BaseModel):
    """Count for a specific signal type."""
    signal_type: str = Field(description="Signal type identifier")
    count: int = Field(description="Number of active signals of this type")
    description: str = Field(description="Human-readable description")


class PatientSignalsResponse(BaseModel):
    """Patient active signals (alerts) response."""
    patient_id: str = Field(description="Patient ID")
    total_signals: int = Field(description="Total active signals across all types")
    signals: List[SignalCount] = Field(description="Signal counts by type")
    generated_at: str = Field(description="Timestamp when signals were generated (ISO 8601)")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/{patient_id}/analytics/summary",
    response_model=PatientAnalyticsSummary,
    responses={
        403: {"description": "Access denied: user cannot access this patient"},
        404: {"description": "Patient not found"},
        500: {"description": "Internal server error"},
    }
)
def get_patient_analytics_summary(
    patient_id: str = Path(..., description="Patient ID"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientAnalyticsSummary:
    """Get comprehensive analytics summary for a patient.

    Includes AI analysis metrics, data assets, consent status, and risk flags.
    Requires clinic-scoped access to the patient.

    Args:
        patient_id: The patient ID
        actor: Authenticated user (injected via JWT token)
        session: Database session

    Returns:
        PatientAnalyticsSummary with aggregated metrics

    Raises:
        HTTPException: 403 if user cannot access patient, 404 if patient not found,
                      500 on internal error
    """
    try:
        # Check access control
        access_control_service.require_patient_access(session, actor.actor_id, patient_id)
    except access_control_service.AccessDeniedError:
        _log.warning(
            "patient_analytics_access_denied",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "endpoint": "analytics_summary",
            },
        )
        raise HTTPException(status_code=403, detail="Access denied")
    except Exception as exc:
        _log.error(
            "patient_analytics_access_check_error",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail="Internal server error")

    try:
        # Log PHI access
        access_control_service.log_phi_access(
            session,
            actor.actor_id,
            patient_id,
            action="read_analytics_summary",
            resource_type="patient_analytics",
        )

        # Get analytics summary from service
        summary_dict = patient_analytics_service.get_patient_analytics_summary(
            session, patient_id
        )

        if not summary_dict:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Convert risk summary structure to response model
        risk_summary_dict = summary_dict.get("risk_flags", {})
        by_severity = {}
        for severity_key in ["critical", "high", "warning", "info"]:
            flag_list = risk_summary_dict.get("by_severity", {}).get(severity_key, [])
            by_severity[severity_key] = [
                RiskFlagDetail(
                    id=flag["id"],
                    flag_type=flag["flag_type"],
                    message=flag["message"],
                    created_at=flag["created_at"],
                )
                for flag in flag_list
            ]

        return PatientAnalyticsSummary(
            patient_id=summary_dict["patient_id"],
            created_at=summary_dict["created_at"],
            ai_analysis=AIAnalyticsSummary(**summary_dict["ai_analysis"]),
            data_assets=DataAssetSummary(**summary_dict["data_assets"]),
            consent=ConsentSummary(**summary_dict["consent"]),
            risk_flags=RiskFlagSummary(
                active=risk_summary_dict["active"],
                by_severity=by_severity,
            ),
            generated_at=summary_dict["generated_at"],
        )
    except HTTPException:
        raise
    except Exception as exc:
        _log.error(
            "patient_analytics_summary_error",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/{patient_id}/analytics/timeline",
    response_model=PatientTimelineResponse,
    responses={
        403: {"description": "Access denied: user cannot access this patient"},
        404: {"description": "Patient not found"},
        500: {"description": "Internal server error"},
    }
)
def get_patient_timeline(
    patient_id: str = Path(..., description="Patient ID"),
    days: int = 90,
    limit: int = 100,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientTimelineResponse:
    """Get patient activity timeline.

    Returns recent activity events (uploads, analyses, AI runs, flags) from the
    specified number of days back, sorted by date (most recent first).

    Args:
        patient_id: The patient ID
        days: Number of days to look back (default 90)
        limit: Maximum events to return (default 100)
        actor: Authenticated user (injected via JWT token)
        session: Database session

    Returns:
        PatientTimelineResponse with timeline events

    Raises:
        HTTPException: 403 if user cannot access patient, 404 if patient not found,
                      500 on internal error
    """
    try:
        # Check access control
        access_control_service.require_patient_access(session, actor.actor_id, patient_id)
    except access_control_service.AccessDeniedError:
        _log.warning(
            "patient_timeline_access_denied",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "endpoint": "analytics_timeline",
            },
        )
        raise HTTPException(status_code=403, detail="Access denied")
    except Exception as exc:
        _log.error(
            "patient_timeline_access_check_error",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail="Internal server error")

    try:
        # Log PHI access
        access_control_service.log_phi_access(
            session,
            actor.actor_id,
            patient_id,
            action="read_analytics_timeline",
            resource_type="patient_analytics",
        )

        # Get timeline from service
        timeline_events = patient_analytics_service.get_patient_timeline(
            session, patient_id, days=days, limit=limit
        )

        if timeline_events is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Convert to response models
        events = []
        for event in timeline_events:
            event_type = event.get("type", "unknown")
            # Extract type-specific fields into details dict
            details = {k: v for k, v in event.items() if k not in ["type", "id", "timestamp", "status"]}
            
            events.append(
                TimelineEvent(
                    type=event_type,
                    id=event["id"],
                    timestamp=event["timestamp"],
                    status=event.get("status"),
                    details=details,
                )
            )

        return PatientTimelineResponse(
            patient_id=patient_id,
            days_back=days,
            event_count=len(events),
            events=events,
            generated_at=datetime.now(timezone.utc).isoformat(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        _log.error(
            "patient_timeline_error",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/{patient_id}/analytics/audit-log",
    response_model=PatientAuditLogResponse,
    responses={
        403: {"description": "Access denied: user cannot access this patient"},
        404: {"description": "Patient not found"},
        500: {"description": "Internal server error"},
    }
)
def get_patient_audit_log(
    patient_id: str = Path(..., description="Patient ID"),
    days: int = 30,
    limit: int = 50,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientAuditLogResponse:
    """Get patient PHI access audit trail.

    Returns audit events for all PHI access to this patient, including who accessed
    what data, when, and the outcome. This is a compliance/audit log.

    Args:
        patient_id: The patient ID
        days: Number of days to look back (default 30)
        limit: Maximum events to return (default 50)
        actor: Authenticated user (injected via JWT token)
        session: Database session

    Returns:
        PatientAuditLogResponse with audit trail events

    Raises:
        HTTPException: 403 if user cannot access patient, 404 if patient not found,
                      500 on internal error
    """
    try:
        # Check access control
        access_control_service.require_patient_access(session, actor.actor_id, patient_id)
    except access_control_service.AccessDeniedError:
        _log.warning(
            "patient_audit_log_access_denied",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "endpoint": "analytics_audit_log",
            },
        )
        raise HTTPException(status_code=403, detail="Access denied")
    except Exception as exc:
        _log.error(
            "patient_audit_log_access_check_error",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail="Internal server error")

    try:
        # Log PHI access
        access_control_service.log_phi_access(
            session,
            actor.actor_id,
            patient_id,
            action="read_analytics_audit_log",
            resource_type="patient_audit_log",
        )

        # Get audit log from service
        audit_events = patient_analytics_service.get_patient_audit_log(
            session, patient_id, days=days, limit=limit
        )

        if audit_events is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Convert to response models
        events = [
            AuditEventDetail(
                id=event["id"],
                actor_id=event["actor_id"],
                action=event["action"],
                resource_type=event["resource_type"],
                result=event["result"],
                timestamp=event["timestamp"],
                reason=event.get("reason"),
            )
            for event in audit_events
        ]

        return PatientAuditLogResponse(
            patient_id=patient_id,
            days_back=days,
            event_count=len(events),
            events=events,
            generated_at=datetime.now(timezone.utc).isoformat(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        _log.error(
            "patient_audit_log_error",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/{patient_id}/analytics/signals",
    response_model=PatientSignalsResponse,
    responses={
        403: {"description": "Access denied: user cannot access this patient"},
        404: {"description": "Patient not found"},
        500: {"description": "Internal server error"},
    }
)
def get_patient_signals(
    patient_id: str = Path(..., description="Patient ID"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientSignalsResponse:
    """Get active signals (alerts) for a patient.

    Returns counts of active signals such as safety flags, pending AI reviews,
    and missing consents. These indicate items that require attention.

    Args:
        patient_id: The patient ID
        actor: Authenticated user (injected via JWT token)
        session: Database session

    Returns:
        PatientSignalsResponse with signal counts

    Raises:
        HTTPException: 403 if user cannot access patient, 404 if patient not found,
                      500 on internal error
    """
    try:
        # Check access control
        access_control_service.require_patient_access(session, actor.actor_id, patient_id)
    except access_control_service.AccessDeniedError:
        _log.warning(
            "patient_signals_access_denied",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "endpoint": "analytics_signals",
            },
        )
        raise HTTPException(status_code=403, detail="Access denied")
    except Exception as exc:
        _log.error(
            "patient_signals_access_check_error",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail="Internal server error")

    try:
        # Log PHI access
        access_control_service.log_phi_access(
            session,
            actor.actor_id,
            patient_id,
            action="read_analytics_signals",
            resource_type="patient_signals",
        )

        # Signal types to check
        signal_types = [
            ("safety_flag", "Active safety flags"),
            ("ai_pending_review", "AI analyses pending clinician review"),
            ("consent_missing", "Missing required consents"),
        ]

        # Get signal counts
        signal_counts = []
        total = 0
        for signal_type, description in signal_types:
            count = patient_analytics_service.get_patient_signal_count(
                session, patient_id, signal_type
            )
            total += count
            signal_counts.append(
                SignalCount(
                    signal_type=signal_type,
                    count=count,
                    description=description,
                )
            )

        return PatientSignalsResponse(
            patient_id=patient_id,
            total_signals=total,
            signals=signal_counts,
            generated_at=datetime.now(timezone.utc).isoformat(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        _log.error(
            "patient_signals_error",
            extra={
                "actor_id": actor.actor_id,
                "patient_id": patient_id,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail="Internal server error")
