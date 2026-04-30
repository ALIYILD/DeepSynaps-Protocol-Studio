"""MRI Clinician Review Workflow.

Manages report state transitions, finding-level review, sign-off, and audit.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.errors import ApiServiceError
from app.persistence.models import MriAnalysis, MriReportAudit, MriReportFinding

_log = logging.getLogger(__name__)

VALID_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "MRI_DRAFT_AI": ("MRI_NEEDS_CLINICAL_REVIEW", "MRI_NEEDS_RADIOLOGY_REVIEW"),
    "MRI_NEEDS_CLINICAL_REVIEW": ("MRI_APPROVED", "MRI_REJECTED", "MRI_REVIEWED_WITH_AMENDMENTS"),
    "MRI_NEEDS_RADIOLOGY_REVIEW": ("MRI_APPROVED", "MRI_REJECTED", "MRI_REVIEWED_WITH_AMENDMENTS"),
    "MRI_REVIEWED_WITH_AMENDMENTS": ("MRI_APPROVED", "MRI_NEEDS_CLINICAL_REVIEW", "MRI_NEEDS_RADIOLOGY_REVIEW"),
    "MRI_APPROVED": ("MRI_REJECTED",),  # admin override only
    "MRI_REJECTED": ("MRI_NEEDS_CLINICAL_REVIEW", "MRI_NEEDS_RADIOLOGY_REVIEW"),
}

_REPORT_VERSION_INCREMENT_ACTIONS = ("MRI_APPROVED", "MRI_REVIEWED_WITH_AMENDMENTS")


def transition_report_state(
    analysis: MriAnalysis,
    action: str,
    actor: AuthenticatedActor,
    db: Session,
    note: Optional[str] = None,
) -> MriAnalysis:
    """Transition an MRI analysis report through its state machine."""
    current = analysis.report_state or "MRI_DRAFT_AI"
    allowed = VALID_TRANSITIONS.get(current, ())
    if action not in allowed:
        raise ApiServiceError(
            code="invalid_transition",
            message=f"Cannot transition from {current} to {action}. Allowed: {allowed}",
            status_code=409,
        )

    if current == "MRI_APPROVED" and action == "MRI_REJECTED" and actor.role != "admin":
        raise ApiServiceError(
            code="admin_only",
            message="Only administrators can reverse an approved MRI report.",
            status_code=403,
        )

    # Radiology-review-required blocks final approval
    if action == "MRI_APPROVED":
        cockpit = _json_loads(analysis.safety_cockpit_json) or {}
        red_flags = cockpit.get("red_flags") or []
        if any(f.get("code") == "RADIOLOGY_REVIEW_REQUIRED" for f in red_flags):
            raise ApiServiceError(
                code="radiology_review_pending",
                message="Radiology review is required before final approval.",
                status_code=409,
            )

    previous = current
    analysis.report_state = action

    if action in ("MRI_APPROVED", "MRI_REVIEWED_WITH_AMENDMENTS"):
        analysis.reviewer_id = actor.actor_id
        analysis.reviewed_at = datetime.now(timezone.utc)
        if action == "MRI_APPROVED":
            analysis.interpretability_status = "MRI_VALID_FOR_REVIEW"

    if action in _REPORT_VERSION_INCREMENT_ACTIONS:
        current_ver = int(analysis.report_version) if analysis.report_version else 1
        analysis.report_version = str(current_ver + 1)

    audit = MriReportAudit(
        analysis_id=analysis.analysis_id,
        action="transition",
        actor_id=actor.actor_id,
        actor_role=actor.role,
        previous_state=previous,
        new_state=action,
        note=note,
    )
    db.add(audit)

    _log.info(
        "mri_report_state_transition",
        extra={
            "event": "mri_report_state_transition",
            "analysis_id": analysis.analysis_id,
            "actor_id": actor.actor_id,
            "actor_role": actor.role,
            "previous_state": previous,
            "new_state": action,
        },
    )
    return analysis


def update_finding_status(
    finding_id: str,
    status: str,
    clinician_note: Optional[str],
    amended_text: Optional[str],
    actor: AuthenticatedActor,
    db: Session,
) -> MriReportFinding:
    """Update a single finding's review status."""
    finding = db.query(MriReportFinding).filter_by(id=finding_id).first()
    if not finding:
        raise ApiServiceError(code="not_found", message="Finding not found", status_code=404)

    finding.status = status
    if clinician_note is not None:
        finding.clinician_note = clinician_note
    if amended_text is not None:
        finding.amended_text = amended_text

    audit = MriReportAudit(
        analysis_id=finding.analysis_id,
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
    analysis_id: str,
    actor: AuthenticatedActor,
    db: Session,
) -> MriAnalysis:
    """Digitally sign-off on an MRI report. Requires MRI_APPROVED state."""
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    if analysis.report_state != "MRI_APPROVED":
        raise ApiServiceError(
            code="not_approved",
            message="Report must be in MRI_APPROVED state before sign-off.",
            status_code=409,
        )

    if analysis.signed_by:
        raise ApiServiceError(
            code="already_signed",
            message="Report has already been signed.",
            status_code=409,
        )

    analysis.signed_by = actor.actor_id
    analysis.signed_at = datetime.now(timezone.utc)

    audit = MriReportAudit(
        analysis_id=analysis.analysis_id,
        action="sign",
        actor_id=actor.actor_id,
        actor_role=actor.role,
        previous_state=analysis.report_state,
        new_state="MRI_APPROVED_SIGNED",
        note="Clinician digital sign-off",
    )
    db.add(audit)

    _log.info(
        "mri_report_signed",
        extra={
            "event": "mri_report_signed",
            "analysis_id": analysis.analysis_id,
            "actor_id": actor.actor_id,
            "actor_role": actor.role,
        },
    )
    return analysis


def can_export(analysis: MriAnalysis) -> bool:
    """Return True if the MRI analysis is cleared for clinical export."""
    return (
        analysis.report_state in ("MRI_APPROVED", "MRI_REVIEWED_WITH_AMENDMENTS")
        and analysis.signed_by is not None
        and analysis.signed_at is not None
    )


def get_audit_trail(analysis_id: str, db: Session) -> list[MriReportAudit]:
    """Return ordered audit entries for an analysis."""
    return (
        db.query(MriReportAudit)
        .filter_by(analysis_id=analysis_id)
        .order_by(MriReportAudit.created_at.asc())
        .all()
    )


def _json_loads(raw: Optional[str]) -> Optional[Any]:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
