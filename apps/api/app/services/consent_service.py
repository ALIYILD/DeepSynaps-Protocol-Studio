"""Consent enforcement and management service.

Handles:
- Consent status checks (active, withdrawn, expired)
- Consent requirement enforcement for AI/device/document use
- Consent withdrawal and revocation
- Audit logging of consent-gated actions
"""
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.persistence.models import Patient, ConsentRecord, User
from app.services.access_control_service import require_patient_access, log_phi_access
import logging

logger = logging.getLogger(__name__)


class ConsentRequiredError(Exception):
    """Raised when consent is required but missing."""
    pass


def get_patient_consent(
    session: Session, patient_id: str, consent_type: str = "general"
) -> Optional[ConsentRecord]:
    """Get active consent record for patient.
    
    Args:
        session: Database session
        patient_id: Patient ID
        consent_type: Type of consent (general, ai_analysis, device_sync, research)
        
    Returns:
        Active ConsentRecord if exists, None otherwise
    """
    record = session.query(ConsentRecord).filter(
        ConsentRecord.patient_id == patient_id,
        ConsentRecord.consent_type == consent_type,
        ConsentRecord.status == "active",
    ).first()
    
    return record


def has_consent(
    session: Session, patient_id: str, consent_type: str = "general"
) -> bool:
    """Check if patient has active consent for action type.
    
    Args:
        session: Database session
        patient_id: Patient ID
        consent_type: Type of consent needed
        
    Returns:
        True if active consent exists, False otherwise
    """
    return get_patient_consent(session, patient_id, consent_type) is not None


def require_consent(
    session: Session,
    actor_user_id: str,
    patient_id: str,
    consent_type: str = "general",
    action_description: str = "data access",
) -> None:
    """Enforce consent requirement (raise exception if missing).
    
    Args:
        session: Database session
        actor_user_id: User performing action
        patient_id: Patient whose data is being accessed
        consent_type: Type of consent required
        action_description: What action requires consent
        
    Raises:
        ConsentRequiredError: If patient lacks required consent
    """
    # Verify user can access patient (access control check)
    require_patient_access(session, actor_user_id, patient_id)
    
    if not has_consent(session, patient_id, consent_type):
        from app.repositories.audit import create_audit_event
        
        create_audit_event(
            session=session,
            actor_user_id=actor_user_id,
            patient_id=patient_id,
            action="action_blocked",
            resource_type="consent",
            resource_id=patient_id,
            result="denied",
            reason=f"missing consent: {consent_type} required for {action_description}",
            sensitivity="admin"
        )
        raise ConsentRequiredError(
            f"Patient {patient_id} lacks required consent ({consent_type}) for {action_description}"
        )


def create_consent_record(
    session: Session,
    patient_id: str,
    consent_type: str = "general",
    document_url: Optional[str] = None,
    notes: Optional[str] = None,
) -> ConsentRecord:
    """Create a new consent record.
    
    Args:
        session: Database session
        patient_id: Patient consenting
        consent_type: Type of consent
        document_url: Link to consent document (S3, etc.)
        notes: Additional consent details
        
    Returns:
        Created ConsentRecord
    """
    record = ConsentRecord(
        patient_id=patient_id,
        consent_type=consent_type,
        status="active",
        document_url=document_url,
        notes=notes,
        created_at=datetime.now(timezone.utc),
    )
    session.add(record)
    session.flush()
    
    from app.repositories.audit import create_audit_event
    create_audit_event(
        session=session,
        actor_user_id=None,
        patient_id=patient_id,
        action="consent_created",
        resource_type="consent",
        resource_id=record.id,
        result="allowed",
        reason=f"{consent_type} consent activated",
        sensitivity="phi"
    )
    
    return record


def withdraw_consent(
    session: Session,
    actor_user_id: str,
    patient_id: str,
    consent_type: str = "general",
    reason: Optional[str] = None,
) -> ConsentRecord:
    """Withdraw patient's consent.
    
    Args:
        session: Database session
        actor_user_id: User withdrawing consent (patient or clinician)
        patient_id: Patient withdrawing
        consent_type: Type of consent to withdraw
        reason: Reason for withdrawal
        
    Returns:
        Updated ConsentRecord with status='withdrawn'
    """
    # Verify actor can access patient
    require_patient_access(session, actor_user_id, patient_id)
    
    record = session.query(ConsentRecord).filter(
        ConsentRecord.patient_id == patient_id,
        ConsentRecord.consent_type == consent_type,
        ConsentRecord.status.in_(["active", "pending"])
    ).first()
    
    if not record:
        raise ValueError(f"No active consent record found for {consent_type}")
    
    record.status = "withdrawn"
    record.withdrawn_at = datetime.now(timezone.utc)
    record.withdrawn_by_user_id = actor_user_id
    record.withdrawal_reason = reason
    session.flush()
    
    from app.repositories.audit import create_audit_event
    create_audit_event(
        session=session,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action="consent_withdrawn",
        resource_type="consent",
        resource_id=record.id,
        result="allowed",
        reason=f"{consent_type} consent withdrawn: {reason or '(no reason provided)'}",
        sensitivity="phi"
    )
    
    logger.info(f"Consent withdrawn: patient={patient_id}, type={consent_type}, reason={reason}")
    
    return record


def log_consent_gated_action(
    session: Session,
    actor_user_id: str,
    patient_id: str,
    action: str,
    consent_type: str = "general",
) -> None:
    """Log an action that was gated by consent check.
    
    Args:
        session: Database session
        actor_user_id: User performing action
        patient_id: Patient data being accessed
        action: Action performed (ai_analysis, device_sync, etc.)
        consent_type: Type of consent that gated this action
    """
    log_phi_access(
        session=session,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action=f"{action} (consent_gated)",
        resource_type="patient_data",
    )
