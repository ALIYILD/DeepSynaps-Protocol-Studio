"""Centralized access control and clinic isolation enforcement.

All PHI access checks flow through here:
- clinic membership verification
- patient ownership verification
- cross-clinic access prevention
- audit logging on denial
"""
from typing import Optional
from sqlalchemy.orm import Session

from app.persistence.models import User, Patient, Clinic, AuditEventRecord
from app.repositories.audit import create_audit_event
import logging

logger = logging.getLogger(__name__)


class AccessDeniedError(Exception):
    """Raised when an access control check fails."""
    pass


def can_access_clinic(session: Session, user_id: str, clinic_id: str) -> bool:
    """Check if user is a member of the clinic.
    
    Args:
        session: Database session
        user_id: User ID to check
        clinic_id: Clinic ID to verify membership
        
    Returns:
        True if user is clinic member, False otherwise
    """
    user = session.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    
    # platform_admin can access any clinic
    if user.role == "platform_admin":
        return True
    
    # Must have clinic_id matching
    if user.clinic_id != clinic_id:
        return False
    
    return True


def can_access_patient(
    session: Session, user_id: str, patient_id: str, audit_on_denial: bool = True
) -> bool:
    """Check if user can access a patient (clinic-scoped).
    
    Access is allowed if:
    - User is platform_admin, OR
    - User and patient are in the same clinic
    
    Args:
        session: Database session
        user_id: User ID requesting access
        patient_id: Patient ID to access
        audit_on_denial: If True, log audit event on denial
        
    Returns:
        True if access allowed, False otherwise
    """
    user = session.query(User).filter(User.id == user_id).first()
    if not user:
        if audit_on_denial:
            logger.warning(f"Access check failed: user {user_id} not found")
        return False
    
    patient = session.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        if audit_on_denial:
            logger.warning(f"Access check failed: patient {patient_id} not found")
        return False
    
    # platform_admin can access any patient
    if user.role == "platform_admin":
        return True
    
    # Get patient's clinic via clinician
    patient_clinic_id = None
    if patient.clinician_id:
        clinician = session.query(User).filter(User.id == patient.clinician_id).first()
        if clinician:
            patient_clinic_id = clinician.clinic_id
    
    # Check clinic match
    if user.clinic_id != patient_clinic_id:
        if audit_on_denial:
            create_audit_event(
                session=session,
                actor_user_id=user_id,
                patient_id=patient_id,
                action="patient_access",
                resource_type="patient",
                resource_id=patient_id,
                result="denied",
                reason=f"cross-clinic access attempt: user clinic={user.clinic_id}, patient clinic={patient_clinic_id}",
                sensitivity="phi"
            )
        return False
    
    return True


def require_clinic_access(session: Session, user_id: str, clinic_id: str) -> None:
    """Enforce clinic access (raise exception if denied).
    
    Args:
        session: Database session
        user_id: User ID requesting access
        clinic_id: Clinic ID to access
        
    Raises:
        AccessDeniedError: If user cannot access clinic
    """
    if not can_access_clinic(session, user_id, clinic_id):
        create_audit_event(
            session=session,
            actor_user_id=user_id,
            patient_id=None,
            action="clinic_access",
            resource_type="clinic",
            resource_id=clinic_id,
            result="denied",
            reason=f"clinic access denied",
            sensitivity="admin"
        )
        raise AccessDeniedError(f"User {user_id} cannot access clinic {clinic_id}")


def require_patient_access(session: Session, user_id: str, patient_id: str) -> None:
    """Enforce patient access (raise exception if denied).
    
    Args:
        session: Database session
        user_id: User ID requesting access
        patient_id: Patient ID to access
        
    Raises:
        AccessDeniedError: If user cannot access patient
    """
    if not can_access_patient(session, user_id, patient_id, audit_on_denial=True):
        raise AccessDeniedError(f"User {user_id} cannot access patient {patient_id}")


def log_phi_access(
    session: Session,
    actor_user_id: str,
    patient_id: str,
    action: str,
    resource_type: str = "patient_data",
) -> None:
    """Log PHI access for compliance/audit.
    
    Args:
        session: Database session
        actor_user_id: User accessing PHI
        patient_id: Patient whose data was accessed
        action: What action was performed (read, export, etc.)
        resource_type: Type of resource accessed
    """
    create_audit_event(
        session=session,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action=action,
        resource_type=resource_type,
        resource_id=patient_id,
        result="allowed",
        reason=None,
        sensitivity="phi"
    )
