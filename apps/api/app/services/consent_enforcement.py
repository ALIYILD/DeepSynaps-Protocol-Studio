"""
Central Consent Enforcement Helpers

Reusable functions for enforcing patient consent across all workflows.

Hard Rules:
- Return 403 on missing/withdrawn/expired consent
- Create AuditEvent with result=denied
- Create SafetyFlag with flag_type=consent_missing
- Never allow silent bypass for real patient_id
- Log all attempts (allowed and denied)

Consent state mapping
---------------------
The 2026-05-19 Clinician Workflow OS audit (PR #1073, must-have #5)
specifies that PHI display / treatment recommendations require
``consent_state ∈ {CONSENTED, AMENDED}``. The persistent
``ConsentRecord.status`` column uses the lifecycle vocabulary
``active`` / ``withdrawn`` / ``expired``. The mapping is:

* ``status == "active"`` covers both ``CONSENTED`` (initial signature)
  and ``AMENDED`` (re-signed with updated scope) — the model treats
  them identically once a valid signed row exists.
* ``status == "withdrawn"`` → ``REVOKED`` (gate fails).
* ``status == "expired"`` → ``EXPIRED`` (gate fails).

The set ``CONSENT_GRANTED_STATES`` is the authoritative list of
``status`` values that satisfy the gate. Do not bypass it; if a new
status is added to ``ConsentRecord`` it must be deliberately added
here.
"""

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.persistence.models import (
    ConsentRecord,
    AuditEventRecord,
    SafetyFlag,
)
from app.auth import AuthenticatedActor


# Authoritative set of ConsentRecord.status values that satisfy the
# CWOS audit's ``consent_state ∈ {CONSENTED, AMENDED}`` requirement.
# An empty/None status row does NOT count — the gate fails closed.
CONSENT_GRANTED_STATES = frozenset({"active"})

# Consent type used to record clinician acknowledgement of off-label
# protocol use, per safety_evidence_policy.md ("all neuromodulation is
# off-label except TPS-AD and CES-anxiety/depression/insomnia"). One
# row per patient×clinician×modality is sufficient; modality_slug is
# carried for audit context.
OFF_LABEL_CONSENT_TYPE = "off_label_acknowledgement"


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
    
    # Find active ai_analysis consent
    consent = session.query(ConsentRecord).filter(
        ConsentRecord.patient_id == patient_id,
        ConsentRecord.clinician_id == actor.actor_id,
        ConsentRecord.consent_type == "ai_analysis",
        ConsentRecord.status == "active"
    ).first()
    
    # Verify consent exists and is still valid
    if not consent:
        # Log denial
        _log_consent_denial(
            session,
        patient_id=patient_id,
        actor=actor,
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
            patient_id=patient_id,
            actor=actor,
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
            patient_id=patient_id,
            actor=actor,
            action="ai_analysis_attempted",
            resource_type=ai_modality,
            reason="consent_withdrawn"
        )
        raise ConsentMissingError(
            f"ai_analysis consent withdrawn for patient {patient_id}"
        )
    
    # Consent is valid, log allowed access
    audit_event = AuditEventRecord(
        event_id=f"consent-allow-{patient_id}-{ai_modality}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        target_id=patient_id,
        target_type=ai_modality,
        action="ai_analysis_allowed",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"allowed consent for {ai_modality}",
        created_at=datetime.now(timezone.utc).isoformat(),
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
        ConsentRecord.patient_id == patient_id,
        ConsentRecord.clinician_id == actor.actor_id,
        ConsentRecord.consent_type == "device_sync",
        ConsentRecord.status == "active"
    ).first()
    
    if not consent:
        _log_consent_denial(
            session,
            patient_id=patient_id,
            actor=actor,
            action="device_sync_attempted",
            resource_type=device_type
        )
        raise ConsentMissingError(
            f"device_sync consent missing for patient {patient_id}"
        )
    
    if consent.expires_at and consent.expires_at < datetime.now(timezone.utc):
        _log_consent_denial(
            session,
            patient_id=patient_id,
            actor=actor,
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
            patient_id=patient_id,
            actor=actor,
            action="device_sync_attempted",
            resource_type=device_type,
            reason="consent_withdrawn"
        )
        raise ConsentMissingError(
            f"device_sync consent withdrawn for patient {patient_id}"
        )
    
    # Log allowed access
    audit_event = AuditEventRecord(
        event_id=f"consent-allow-{patient_id}-{device_type}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        target_id=patient_id,
        target_type=device_type,
        action="device_sync_allowed",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"allowed consent for {device_type}",
        created_at=datetime.now(timezone.utc).isoformat(),
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
        ConsentRecord.patient_id == patient_id,
        ConsentRecord.clinician_id == actor.actor_id,
        ConsentRecord.consent_type == "document_generation",
        ConsentRecord.status == "active"
    ).first()
    
    if not consent:
        _log_consent_denial(
            session,
            patient_id=patient_id,
            actor=actor,
            action="document_generation_attempted",
            resource_type=document_type
        )
        raise ConsentMissingError(
            f"document_generation consent missing for patient {patient_id}"
        )
    
    if consent.expires_at and consent.expires_at < datetime.now(timezone.utc):
        _log_consent_denial(
            session,
            patient_id=patient_id,
            actor=actor,
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
            patient_id=patient_id,
            actor=actor,
            action="document_generation_attempted",
            resource_type=document_type,
            reason="consent_withdrawn"
        )
        raise ConsentMissingError(
            f"document_generation consent withdrawn for patient {patient_id}"
        )
    
    # Log allowed access
    audit_event = AuditEventRecord(
        event_id=f"consent-allow-{patient_id}-{document_type}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        target_id=patient_id,
        target_type=document_type,
        action="document_generation_allowed",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"allowed consent for {document_type}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    session.add(audit_event)
    session.commit()

    return consent


def require_off_label_acknowledgement(
    session: Session,
    patient_id: str,
    actor: AuthenticatedActor,
    modality_slug: str = "unknown",
) -> ConsentRecord:
    """Enforce off-label-acknowledgement consent before launching an off-label
    protocol or course.

    Per docs/safety_evidence_policy.md, all neuromodulation administered via
    DeepSynaps Studio is off-label except TPS (NEUROLITH®) for Alzheimer's
    and CES (Alpha-Stim®) for anxiety/depression/insomnia. The CWOS audit
    (PR #1073, must-have #5) requires a persisted acknowledgement before any
    off-label protocol can move from draft → launched.

    Args:
        session: Database session
        patient_id: Patient ID
        actor: Authenticated actor (the prescribing clinician)
        modality_slug: Modality the acknowledgement applies to (rtms,
            tdcs, ces, tps, vns, dbs, etc.) — recorded on the audit row

    Returns:
        ConsentRecord if a valid off-label acknowledgement exists

    Raises:
        ConsentMissingError: If the acknowledgement is missing, withdrawn,
            or expired. Caller routers should convert to HTTP 403.
    """
    consent = (
        session.query(ConsentRecord)
        .filter(
            ConsentRecord.patient_id == patient_id,
            ConsentRecord.clinician_id == actor.actor_id,
            ConsentRecord.consent_type == OFF_LABEL_CONSENT_TYPE,
            ConsentRecord.status.in_(CONSENT_GRANTED_STATES),
        )
        .first()
    )

    if not consent:
        _log_consent_denial(
            session,
            patient_id=patient_id,
            actor=actor,
            action="off_label_launch_attempted",
            resource_type=modality_slug,
        )
        raise ConsentMissingError(
            f"off_label_acknowledgement consent missing for patient {patient_id}"
        )

    if consent.expires_at and consent.expires_at < datetime.now(timezone.utc):
        _log_consent_denial(
            session,
            patient_id=patient_id,
            actor=actor,
            action="off_label_launch_attempted",
            resource_type=modality_slug,
            reason="consent_expired",
        )
        raise ConsentMissingError(
            f"off_label_acknowledgement consent expired for patient {patient_id}"
        )

    # ConsentRecord.status filter above already excluded ``withdrawn`` and
    # ``expired`` — we keep the explicit ``signed`` check below because the
    # CWOS audit calls out that the acknowledgement must be a signed record,
    # not just an active row. A row that exists with signed=False is an
    # unfinished workflow and must not gate-open.
    if not consent.signed:
        _log_consent_denial(
            session,
            patient_id=patient_id,
            actor=actor,
            action="off_label_launch_attempted",
            resource_type=modality_slug,
            reason="consent_unsigned",
        )
        raise ConsentMissingError(
            f"off_label_acknowledgement consent unsigned for patient {patient_id}"
        )

    audit_event = AuditEventRecord(
        event_id=(
            f"consent-allow-{patient_id}-{modality_slug}-"
            f"{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        ),
        target_id=patient_id,
        target_type=modality_slug,
        action="off_label_launch_allowed",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"allowed off-label acknowledgement for {modality_slug}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    session.add(audit_event)
    session.commit()

    return consent


def _log_consent_denial(
    session: Session,
    patient_id: str,
    actor: AuthenticatedActor,
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
        event_id=f"consent-deny-{patient_id}-{resource_type}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        target_id=patient_id,
        target_type=resource_type,
        action=action,
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"denied_no_consent:{reason}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    session.add(audit_event)
    session.flush()
    
    # Create SafetyFlag
    safety_flag = SafetyFlag(
        clinic_id=actor.clinic_id or "unknown-clinic",
        patient_id=patient_id,
        flag_type="consent_missing",
        severity="high",
        message=f"Workflow '{action}' ({resource_type}) attempted without consent ({reason})"
    )
    session.add(safety_flag)
    session.commit()
