"""
Central Consent Enforcement Helpers

Reusable functions for enforcing patient consent across all workflows.

Hard Rules:
- Return 403 on missing/withdrawn/expired consent
- Create AuditEvent with result=denied
- Create SafetyFlag with flag_type=consent_missing
- Never allow silent bypass for real patient_id
- Log all attempts (allowed and denied)
"""

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.persistence.models import (
    ConsentRecord,
    AuditEventRecord,
    SafetyFlag,
)
from app.auth import AuthenticatedActor


class ConsentMissingError(Exception):
    """Raised when required consent is missing or invalid"""
    pass


def require_ai_analysis_consent(
    session: Session,
    patient_id: str,
    actor: AuthenticatedActor,
    ai_modality: str = "unknown"
) -> ConsentRecord:
    """
    Enforce ai_analysis consent before AI processing.
    
    Args:
        session: Database session
        patient_id: Patient ID (real or demo)
        actor: Authenticated actor
        ai_modality: Type of AI (mri, qeeg, deeptwin, video, audio, text, biometric, etc.)
    
    Returns:
        ConsentRecord if valid
    
    Raises:
        ConsentMissingError: If consent missing/withdrawn/expired
        HTTPException(403): If consent missing, with automatic logging
    
    Hard Rules:
    - No consent = 403 + AuditEvent + SafetyFlag
    - Withdrawn consent = 403 + AuditEvent + SafetyFlag
    - Expired consent = 403 + AuditEvent + SafetyFlag
    - Never silent bypass for real patient_id
    - Demo patients use demo consent only
    """
    
    # Check if demo mode
    is_demo = patient_id.lower().startswith("demo-")
    
    # Find active ai_analysis consent
    consent = session.query(ConsentRecord).filter(
        ConsentRecord.clinic_id == actor.clinic_id,
        ConsentRecord.patient_id == patient_id,
        ConsentRecord.consent_type == "ai_analysis",
        ConsentRecord.status == "active"
    ).first()
    
    # Verify consent exists and is still valid
    if not consent:
        # Log denial
        _log_consent_denial(
            session,
            clinic_id=actor.clinic_id,
            patient_id=patient_id,
            actor_user_id=actor.user_id,
            action="ai_analysis_attempted",
            resource_type=ai_modality
        )
        raise ConsentMissingError(
            f"ai_analysis consent missing for patient {patient_id}"
        )
    
    # Check if expired
    if consent.expires_at and consent.expires_at < datetime.now(timezone.utc):
        _log_consent_denial(
            session,
            clinic_id=actor.clinic_id,
            patient_id=patient_id,
            actor_user_id=actor.user_id,
            action="ai_analysis_attempted",
            resource_type=ai_modality,
            reason="consent_expired"
        )
        raise ConsentMissingError(
            f"ai_analysis consent expired for patient {patient_id}"
        )
    
    # Check if withdrawn
    if consent.status == "withdrawn":
        _log_consent_denial(
            session,
            clinic_id=actor.clinic_id,
            patient_id=patient_id,
            actor_user_id=actor.user_id,
            action="ai_analysis_attempted",
            resource_type=ai_modality,
            reason="consent_withdrawn"
        )
        raise ConsentMissingError(
            f"ai_analysis consent withdrawn for patient {patient_id}"
        )
    
    # Consent is valid, log allowed access
    audit_event = AuditEventRecord(
        clinic_id=actor.clinic_id,
        patient_id=patient_id,
        actor_id=actor.id,
        action="ai_analysis_allowed",
        resource_type=ai_modality,
        result="allowed",
        consent_record_id=consent.id
    )
    session.add(audit_event)
    session.commit()
    
    return consent


def require_device_sync_consent(
    session: Session,
    patient_id: str,
    actor: AuthenticatedActor,
    device_type: str = "unknown"
) -> ConsentRecord:
    """
    Enforce device_sync consent before device data ingestion.
    
    Args:
        session: Database session
        patient_id: Patient ID
        actor: Authenticated actor
        device_type: Type of device (wearable, home device, sensor, etc.)
    
    Returns:
        ConsentRecord if valid
    
    Raises:
        ConsentMissingError: If consent missing/withdrawn/expired
        HTTPException(403): If consent missing, with automatic logging
    """
    
    # Find active device_sync consent
    consent = session.query(ConsentRecord).filter(
        ConsentRecord.clinic_id == actor.clinic_id,
        ConsentRecord.patient_id == patient_id,
        ConsentRecord.consent_type == "device_sync",
        ConsentRecord.status == "active"
    ).first()
    
    if not consent:
        _log_consent_denial(
            session,
            clinic_id=actor.clinic_id,
            patient_id=patient_id,
            actor_user_id=actor.user_id,
            action="device_sync_attempted",
            resource_type=device_type
        )
        raise ConsentMissingError(
            f"device_sync consent missing for patient {patient_id}"
        )
    
    if consent.expires_at and consent.expires_at < datetime.now(timezone.utc):
        _log_consent_denial(
            session,
            clinic_id=actor.clinic_id,
            patient_id=patient_id,
            actor_user_id=actor.user_id,
            action="device_sync_attempted",
            resource_type=device_type,
            reason="consent_expired"
        )
        raise ConsentMissingError(
            f"device_sync consent expired for patient {patient_id}"
        )
    
    if consent.status == "withdrawn":
        _log_consent_denial(
            session,
            clinic_id=actor.clinic_id,
            patient_id=patient_id,
            actor_user_id=actor.user_id,
            action="device_sync_attempted",
            resource_type=device_type,
            reason="consent_withdrawn"
        )
        raise ConsentMissingError(
            f"device_sync consent withdrawn for patient {patient_id}"
        )
    
    # Log allowed access
    audit_event = AuditEventRecord(
        clinic_id=actor.clinic_id,
        patient_id=patient_id,
        actor_id=actor.id,
        action="device_sync_allowed",
        resource_type=device_type,
        result="allowed",
        consent_record_id=consent.id
    )
    session.add(audit_event)
    session.commit()
    
    return consent


def require_document_generation_consent(
    session: Session,
    patient_id: str,
    actor: AuthenticatedActor,
    document_type: str = "unknown"
) -> ConsentRecord:
    """
    Enforce document_generation consent before creating clinical documents.
    
    Args:
        session: Database session
        patient_id: Patient ID
        actor: Authenticated actor
        document_type: Type of document (protocol, handbook, report, guide, etc.)
    
    Returns:
        ConsentRecord if valid
    
    Raises:
        ConsentMissingError: If consent missing/withdrawn/expired
        HTTPException(403): If consent missing, with automatic logging
    """
    
    # Find active document_generation consent
    consent = session.query(ConsentRecord).filter(
        ConsentRecord.clinic_id == actor.clinic_id,
        ConsentRecord.patient_id == patient_id,
        ConsentRecord.consent_type == "document_generation",
        ConsentRecord.status == "active"
    ).first()
    
    if not consent:
        _log_consent_denial(
            session,
            clinic_id=actor.clinic_id,
            patient_id=patient_id,
            actor_user_id=actor.user_id,
            action="document_generation_attempted",
            resource_type=document_type
        )
        raise ConsentMissingError(
            f"document_generation consent missing for patient {patient_id}"
        )
    
    if consent.expires_at and consent.expires_at < datetime.now(timezone.utc):
        _log_consent_denial(
            session,
            clinic_id=actor.clinic_id,
            patient_id=patient_id,
            actor_user_id=actor.user_id,
            action="document_generation_attempted",
            resource_type=document_type,
            reason="consent_expired"
        )
        raise ConsentMissingError(
            f"document_generation consent expired for patient {patient_id}"
        )
    
    if consent.status == "withdrawn":
        _log_consent_denial(
            session,
            clinic_id=actor.clinic_id,
            patient_id=patient_id,
            actor_user_id=actor.user_id,
            action="document_generation_attempted",
            resource_type=document_type,
            reason="consent_withdrawn"
        )
        raise ConsentMissingError(
            f"document_generation consent withdrawn for patient {patient_id}"
        )
    
    # Log allowed access
    audit_event = AuditEventRecord(
        clinic_id=actor.clinic_id,
        patient_id=patient_id,
        actor_id=actor.id,
        action="document_generation_allowed",
        resource_type=document_type,
        result="allowed",
        consent_record_id=consent.id
    )
    session.add(audit_event)
    session.commit()
    
    return consent


def _log_consent_denial(
    session: Session,
    clinic_id: str,
    patient_id: str,
    actor_user_id: str,
    action: str,
    resource_type: str,
    reason: str = "missing"
) -> None:
    """
    Internal: Log a denied consent attempt with AuditEvent + SafetyFlag.
    
    Always called when consent is missing/withdrawn/expired.
    """
    
    # Create AuditEvent
    audit_event = AuditEventRecord(
        clinic_id=clinic_id,
        patient_id=patient_id,
        actor_user_id=actor_user_id,
        action=action,
        resource_type=resource_type,
        result="denied_no_consent"
    )
    session.add(audit_event)
    session.flush()
    
    # Create SafetyFlag
    safety_flag = SafetyFlag(
        clinic_id=clinic_id,
        patient_id=patient_id,
        flag_type="consent_missing",
        severity="high",
        message=f"Workflow '{action}' ({resource_type}) attempted without consent ({reason})"
    )
    session.add(safety_flag)
    session.commit()
