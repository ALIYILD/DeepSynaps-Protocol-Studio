"""Clinician Review Workflow for qEEG AI Reports.

Manages report state transitions, finding-level review, sign-off, and audit.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.errors import ApiServiceError
from app.persistence.models import QEEGAIReport, QEEGReportAudit, QEEGReportFinding

_log = logging.getLogger(__name__)


# ── Valid state machine ──────────────────────────────────────────────────────
VALID_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "DRAFT_AI": ("NEEDS_REVIEW",),
    "NEEDS_REVIEW": ("APPROVED", "REJECTED", "REVIEWED_WITH_AMENDMENTS"),
    "REVIEWED_WITH_AMENDMENTS": ("APPROVED", "NEEDS_REVIEW"),
    "APPROVED": ("REJECTED",),  # admin override only
    "REJECTED": ("NEEDS_REVIEW",),
}

_REPORT_VERSION_INCREMENT_ACTIONS = ("APPROVED", "REVIEWED_WITH_AMENDMENTS")


def transition_report_state(
    report: QEEGAIReport,
    action: str,
    actor: AuthenticatedActor,
    db: Session,
    note: Optional[str] = None,
) -> QEEGAIReport:
    """Transition a report through its state machine.

    Parameters
    ----------
    report: QEEGAIReport
    action: str
        Target state name (e.g. "APPROVED", "REJECTED").
    actor: AuthenticatedActor
    db: Session
    note: Optional[str]
        Clinician note for the audit trail.

    Returns
    -------
    QEEGAIReport
        The mutated report row (caller must commit).
    """
    current = report.report_state or "DRAFT_AI"
    allowed = VALID_TRANSITIONS.get(current, ())
    if action not in allowed:
        raise ApiServiceError(
            code="invalid_transition",
            message=f"Cannot transition from {current} to {action}. Allowed: {allowed}",
            status_code=409,
        )

    # Admin-only override from APPROVED → REJECTED
    if current == "APPROVED" and action == "REJECTED" and actor.role != "admin":
        raise ApiServiceError(
            code="admin_only",
            message="Only administrators can reverse an approved report.",
            status_code=403,
        )

    previous = current
    report.report_state = action

    if action in ("APPROVED", "REVIEWED_WITH_AMENDMENTS"):
        report.reviewer_id = actor.actor_id
        report.reviewed_at = datetime.now(timezone.utc)
        if action == "APPROVED":
            report.clinician_reviewed = True

    if action in _REPORT_VERSION_INCREMENT_ACTIONS:
        try:
            current_ver = int(report.report_version or 1)
        except (TypeError, ValueError):
            current_ver = 1
        report.report_version = str(current_ver + 1)

    # Audit trail
    audit = QEEGReportAudit(
        report_id=report.id,
        action="transition",
        actor_id=actor.actor_id,
        actor_role=actor.role,
        previous_state=previous,
        new_state=action,
        note=note,
    )
    db.add(audit)

    _log.info(
        "qeeg_report_state_transition",
        extra={
            "event": "qeeg_report_state_transition",
            "report_id": report.id,
            "actor_id": actor.actor_id,
            "actor_role": actor.role,
            "previous_state": previous,
            "new_state": action,
        },
    )
    return report


def update_finding_status(
    finding_id: str,
    status: str,
    clinician_note: Optional[str],
    amended_text: Optional[str],
    actor: AuthenticatedActor,
    db: Session,
) -> QEEGReportFinding:
    """Update a single finding's review status."""
    finding = db.query(QEEGReportFinding).filter_by(id=finding_id).first()
    if not finding:
        raise ApiServiceError(code="not_found", message="Finding not found", status_code=404)

    finding.status = status
    if clinician_note is not None:
        finding.clinician_note = clinician_note
    if amended_text is not None:
        finding.amended_text = amended_text

    # Audit the finding-level change
    audit = QEEGReportAudit(
        report_id=finding.report_id,
        action="update_finding",
        actor_id=actor.actor_id,
        actor_role=actor.role,
        previous_state=finding.status,
        new_state=status,
        note=clinician_note,
    )
    db.add(audit)
    return finding


def sign_report(
    report_id: str,
    actor: AuthenticatedActor,
    db: Session,
) -> QEEGAIReport:
    """Digitally sign-off on a report. Requires APPROVED state.

    Once signed, the report is immutable (no further edits).
    """
    report = db.query(QEEGAIReport).filter_by(id=report_id).first()
    if not report:
        raise ApiServiceError(code="not_found", message="Report not found", status_code=404)

    if report.report_state != "APPROVED":
        raise ApiServiceError(
            code="not_approved",
            message="Report must be in APPROVED state before sign-off.",
            status_code=409,
        )

    if report.signed_by:
        raise ApiServiceError(
            code="already_signed",
            message="Report has already been signed.",
            status_code=409,
        )

    report.signed_by = actor.actor_id
    report.signed_at = datetime.now(timezone.utc)

    audit = QEEGReportAudit(
        report_id=report.id,
        action="sign",
        actor_id=actor.actor_id,
        actor_role=actor.role,
        previous_state=report.report_state,
        new_state="APPROVED_SIGNED",
        note="Clinician digital sign-off",
    )
    db.add(audit)

    _log.info(
        "qeeg_report_signed",
        extra={
            "event": "qeeg_report_signed",
            "report_id": report.id,
            "actor_id": actor.actor_id,
            "actor_role": actor.role,
        },
    )
    return report


def can_export(report: QEEGAIReport) -> bool:
    """Return True if the report is cleared for clinical export.

    Requires:
    - State is APPROVED or REVIEWED_WITH_AMENDMENTS
    - Signed by a clinician
    """
    return (
        report.report_state in ("APPROVED", "REVIEWED_WITH_AMENDMENTS")
        and report.signed_by is not None
        and report.signed_at is not None
    )


def get_audit_trail(report_id: str, db: Session) -> list[QEEGReportAudit]:
    """Return ordered audit entries for a report."""
    return (
        db.query(QEEGReportAudit)
        .filter_by(report_id=report_id)
        .order_by(QEEGReportAudit.created_at.asc())
        .all()
    )
