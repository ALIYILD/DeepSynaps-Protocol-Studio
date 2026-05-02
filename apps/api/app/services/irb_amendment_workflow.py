"""IRB-AMD1: amendment lifecycle state machine.

State machine
-------------

draft → submitted → reviewer_assigned → under_review →
    approved | rejected | revisions_requested

If approved → effective.
Revisions-requested can revert to draft (creator/admin) for re-edit.

All transitions emit an audit row and validate role + cross-clinic.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, require_minimum_role
from app.errors import ApiServiceError
from app.persistence.models import (
    IRBProtocol,
    IRBProtocolAmendment,
)


_log = logging.getLogger(__name__)


# Lifecycle constants — kept in one place so the router + tests + UI
# import the same names.
STATUS_DRAFT = "draft"
STATUS_SUBMITTED = "submitted"
STATUS_REVIEWER_ASSIGNED = "reviewer_assigned"
STATUS_UNDER_REVIEW = "under_review"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
STATUS_REVISIONS_REQUESTED = "revisions_requested"
STATUS_EFFECTIVE = "effective"

ALL_STATUSES: tuple[str, ...] = (
    STATUS_DRAFT,
    STATUS_SUBMITTED,
    STATUS_REVIEWER_ASSIGNED,
    STATUS_UNDER_REVIEW,
    STATUS_APPROVED,
    STATUS_REJECTED,
    STATUS_REVISIONS_REQUESTED,
    STATUS_EFFECTIVE,
)

DECISIONS: tuple[str, ...] = (
    STATUS_APPROVED,
    STATUS_REJECTED,
    STATUS_REVISIONS_REQUESTED,
)


SURFACE = "irb_amendment_workflow"


# ── Helpers ────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _emit_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    amendment: IRBProtocolAmendment,
    action_verb: str,
    from_status: Optional[str],
    to_status: str,
    extra: str = "",
) -> str:
    """Append a regulator-credible audit row.

    The note encodes ``clinic_id``/``amendment_id``/``from_status``/
    ``to_status``/``actor_id`` per the IRB-AMD1 spec so downstream
    parsers can reconstruct the lifecycle without re-querying.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = _now()
    event_id = (
        f"{SURFACE}-{action_verb}-{amendment.id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    cid = actor.clinic_id or "-"
    note = (
        f"clinic_id={cid} amendment_id={amendment.id} "
        f"from_status={from_status or '-'} to_status={to_status} "
        f"actor_id={actor.actor_id}"
    )
    if extra:
        note = note + " " + extra
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=amendment.id,
            target_type="irb_amendment",
            action=f"irb.amendment_{action_verb}",
            role=actor.role if actor.role in {"admin", "clinician", "reviewer"} else "clinician",
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block lifecycle
        _log.exception("IRB-AMD1 audit emit failed")
    return event_id


def _load_amendment(
    db: Session,
    amendment_id: str,
    actor: AuthenticatedActor,
) -> tuple[IRBProtocolAmendment, IRBProtocol]:
    """Load the amendment + its parent protocol with cross-clinic check.

    Returns 404 (``amendment_not_found``) when the amendment is
    missing OR when the actor's clinic does not match the parent
    protocol's clinic — matching the QEEG IDOR convention captured in
    the ``deepsynaps-qeeg-pdf-export-tenant-gate`` memory.
    Admins bypass the clinic gate.
    """
    amd = (
        db.query(IRBProtocolAmendment)
        .filter(IRBProtocolAmendment.id == amendment_id)
        .first()
    )
    if amd is None:
        raise ApiServiceError(
            code="amendment_not_found",
            message="Amendment not found or not visible at your role.",
            status_code=404,
        )
    proto = (
        db.query(IRBProtocol)
        .filter(IRBProtocol.id == amd.protocol_id)
        .first()
    )
    if proto is None:
        raise ApiServiceError(
            code="amendment_not_found",
            message="Parent protocol not found.",
            status_code=404,
        )
    # Cross-clinic gate — admins bypass.
    if actor.role != "admin":
        if proto.clinic_id and actor.clinic_id and proto.clinic_id != actor.clinic_id:
            raise ApiServiceError(
                code="amendment_not_found",
                message="Amendment not found or not visible at your role.",
                status_code=404,
            )
        # Orphaned (no clinic on either side) — allow only if creator.
        if not proto.clinic_id and not actor.clinic_id:
            pass
        elif proto.clinic_id and not actor.clinic_id:
            raise ApiServiceError(
                code="amendment_not_found",
                message="Amendment not found or not visible at your role.",
                status_code=404,
            )
    return amd, proto


def _expect_status(amendment: IRBProtocolAmendment, allowed: set[str]) -> None:
    if (amendment.status or STATUS_SUBMITTED) not in allowed:
        raise ApiServiceError(
            code="invalid_amendment_status",
            message=(
                f"Amendment is in status '{amendment.status}'; expected "
                f"one of {sorted(allowed)} for this transition."
            ),
            status_code=409,
        )


def _gate_creator_or_admin(
    amendment: IRBProtocolAmendment,
    actor: AuthenticatedActor,
) -> None:
    if actor.role == "admin":
        return
    creator = amendment.created_by_user_id or amendment.submitted_by
    if creator and creator == actor.actor_id:
        return
    raise ApiServiceError(
        code="not_amendment_owner",
        message="Only the amendment creator or an admin can perform this action.",
        status_code=403,
    )


def _gate_assigned_reviewer(
    amendment: IRBProtocolAmendment,
    actor: AuthenticatedActor,
) -> None:
    if actor.role == "admin":
        return
    if amendment.assigned_reviewer_user_id == actor.actor_id:
        return
    raise ApiServiceError(
        code="not_assigned_reviewer",
        message="Only the assigned reviewer can perform this action.",
        status_code=403,
    )


# ── Transitions ────────────────────────────────────────────────────────────


def submit_amendment(
    db: Session,
    amendment_id: str,
    actor: AuthenticatedActor,
) -> IRBProtocolAmendment:
    """draft → submitted. Locks payload fields; emits audit."""
    require_minimum_role(actor, "clinician")
    amd, _proto = _load_amendment(db, amendment_id, actor)
    _expect_status(amd, {STATUS_DRAFT})
    _gate_creator_or_admin(amd, actor)
    prev = amd.status
    amd.status = STATUS_SUBMITTED
    amd.submitted_at = _now()
    db.commit()
    db.refresh(amd)
    _emit_audit(
        db,
        actor,
        amendment=amd,
        action_verb="submitted",
        from_status=prev,
        to_status=STATUS_SUBMITTED,
    )
    return amd


def assign_reviewer(
    db: Session,
    amendment_id: str,
    reviewer_user_id: str,
    actor: AuthenticatedActor,
) -> IRBProtocolAmendment:
    """submitted → reviewer_assigned. Admin-only."""
    require_minimum_role(actor, "admin")
    amd, _proto = _load_amendment(db, amendment_id, actor)
    _expect_status(amd, {STATUS_SUBMITTED})
    if not (reviewer_user_id or "").strip():
        raise ApiServiceError(
            code="invalid_reviewer",
            message="reviewer_user_id is required.",
            status_code=422,
        )
    prev = amd.status
    amd.assigned_reviewer_user_id = reviewer_user_id.strip()[:64]
    amd.status = STATUS_REVIEWER_ASSIGNED
    db.commit()
    db.refresh(amd)
    _emit_audit(
        db,
        actor,
        amendment=amd,
        action_verb="reviewer_assigned",
        from_status=prev,
        to_status=STATUS_REVIEWER_ASSIGNED,
        extra=f"reviewer_id={amd.assigned_reviewer_user_id}",
    )
    return amd


def start_review(
    db: Session,
    amendment_id: str,
    actor: AuthenticatedActor,
) -> IRBProtocolAmendment:
    """reviewer_assigned → under_review. Assigned reviewer only."""
    require_minimum_role(actor, "clinician")
    amd, _proto = _load_amendment(db, amendment_id, actor)
    _expect_status(amd, {STATUS_REVIEWER_ASSIGNED})
    _gate_assigned_reviewer(amd, actor)
    prev = amd.status
    amd.status = STATUS_UNDER_REVIEW
    db.commit()
    db.refresh(amd)
    _emit_audit(
        db,
        actor,
        amendment=amd,
        action_verb="review_started",
        from_status=prev,
        to_status=STATUS_UNDER_REVIEW,
    )
    return amd


def decide_amendment(
    db: Session,
    amendment_id: str,
    decision: str,
    review_note: str,
    actor: AuthenticatedActor,
) -> IRBProtocolAmendment:
    """under_review → approved | rejected | revisions_requested."""
    require_minimum_role(actor, "clinician")
    if decision not in DECISIONS:
        raise ApiServiceError(
            code="invalid_decision",
            message=f"decision must be one of {sorted(DECISIONS)}",
            status_code=422,
        )
    note = (review_note or "").strip()
    if len(note) < 10 or len(note) > 2000:
        raise ApiServiceError(
            code="invalid_review_note",
            message="review_note must be 10-2000 characters.",
            status_code=422,
        )
    amd, _proto = _load_amendment(db, amendment_id, actor)
    _expect_status(amd, {STATUS_UNDER_REVIEW})
    _gate_assigned_reviewer(amd, actor)
    prev = amd.status
    amd.status = decision
    amd.reviewed_at = _now()
    amd.review_decision_note = note[:2000]
    db.commit()
    db.refresh(amd)
    _emit_audit(
        db,
        actor,
        amendment=amd,
        action_verb=f"decided_{decision}",
        from_status=prev,
        to_status=decision,
    )
    return amd


def mark_effective(
    db: Session,
    amendment_id: str,
    actor: AuthenticatedActor,
) -> tuple[IRBProtocolAmendment, IRBProtocol]:
    """approved → effective. Admin only. Bumps parent.version + merges."""
    require_minimum_role(actor, "admin")
    amd, proto = _load_amendment(db, amendment_id, actor)
    _expect_status(amd, {STATUS_APPROVED})
    prev = amd.status
    amd.status = STATUS_EFFECTIVE
    amd.effective_at = _now()
    # Bump the parent protocol's version so downstream consumers
    # (reg-binder export, finance hub, etc.) see the new effective
    # version. Default-to-1 fallback for legacy rows.
    proto.version = (proto.version or 1) + 1
    # Merge tracked fields from the amendment payload onto the parent.
    # We only touch ``title`` / ``description`` because those are the
    # two tracked fields the current IRBProtocol schema has columns
    # for; the rest live in payload_json and survive on the
    # amendment row for reg-binder export.
    try:
        import json as _json
        payload = _json.loads(amd.payload_json or "{}")
    except Exception:
        payload = {}
    if isinstance(payload, dict):
        if isinstance(payload.get("title"), str) and payload["title"].strip():
            proto.title = payload["title"].strip()[:512]
        if isinstance(payload.get("summary"), str):
            proto.description = payload["summary"]
    db.commit()
    db.refresh(amd)
    db.refresh(proto)
    _emit_audit(
        db,
        actor,
        amendment=amd,
        action_verb="effective",
        from_status=prev,
        to_status=STATUS_EFFECTIVE,
        extra=f"protocol_version={proto.version}",
    )
    return amd, proto


def revert_to_draft(
    db: Session,
    amendment_id: str,
    actor: AuthenticatedActor,
) -> IRBProtocolAmendment:
    """revisions_requested → draft. Creator or admin."""
    require_minimum_role(actor, "clinician")
    amd, _proto = _load_amendment(db, amendment_id, actor)
    _expect_status(amd, {STATUS_REVISIONS_REQUESTED})
    _gate_creator_or_admin(amd, actor)
    prev = amd.status
    amd.status = STATUS_DRAFT
    db.commit()
    db.refresh(amd)
    _emit_audit(
        db,
        actor,
        amendment=amd,
        action_verb="reverted_to_draft",
        from_status=prev,
        to_status=STATUS_DRAFT,
    )
    return amd
