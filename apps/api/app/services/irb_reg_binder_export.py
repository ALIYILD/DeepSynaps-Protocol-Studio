"""IRB-AMD1: regulator-binder ZIP export.

Bundle the full audit-trailed history of an IRB protocol — current
effective state, every amendment row with its diff + reviewer signoff
+ decision note + audit timestamps, and a chronological audit-event
trail — into a single portable ``.zip``. JSON / text only; no
WeasyPrint or external PDF deps.

Layout
------

::

    cover_page.txt
    protocol_v{version}.json
    amendments/
        amendment_{id}_v{n}.json
    audit_trail.json
"""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.errors import ApiServiceError
from app.persistence.models import (
    AuditEventRecord,
    IRBProtocol,
    IRBProtocolAmendment,
)


def _isofmt(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        # SQLite roundtrip strips tzinfo; coerce honestly.
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _protocol_dict(proto: IRBProtocol) -> dict[str, Any]:
    return {
        "id": proto.id,
        "clinic_id": proto.clinic_id,
        "protocol_code": proto.protocol_code,
        "title": proto.title,
        "description": proto.description or "",
        "irb_board": proto.irb_board,
        "irb_number": proto.irb_number,
        "sponsor": proto.sponsor,
        "pi_user_id": proto.pi_user_id,
        "phase": proto.phase,
        "status": proto.status,
        "risk_level": proto.risk_level,
        "approval_date": proto.approval_date,
        "expiry_date": proto.expiry_date,
        "enrollment_target": proto.enrollment_target,
        "enrolled_count": proto.enrolled_count,
        "consent_version": proto.consent_version,
        "version": proto.version or 1,
        "is_demo": bool(proto.is_demo),
        "created_at": _isofmt(proto.created_at),
        "updated_at": _isofmt(proto.updated_at),
        "closed_at": _isofmt(proto.closed_at),
        "closed_by": proto.closed_by,
        "closure_note": proto.closure_note,
        "created_by": proto.created_by,
    }


def _amendment_dict(amd: IRBProtocolAmendment) -> dict[str, Any]:
    try:
        diff = json.loads(amd.amendment_diff_json) if amd.amendment_diff_json else []
    except Exception:
        diff = []
    try:
        payload = json.loads(amd.payload_json) if amd.payload_json else {}
    except Exception:
        payload = {}
    return {
        "id": amd.id,
        "protocol_id": amd.protocol_id,
        "version": amd.version or 1,
        "amendment_type": amd.amendment_type,
        "description": amd.description,
        "reason": amd.reason,
        "status": amd.status,
        "submitted_by": amd.submitted_by,
        "created_by_user_id": amd.created_by_user_id,
        "assigned_reviewer_user_id": amd.assigned_reviewer_user_id,
        "submitted_at": _isofmt(amd.submitted_at),
        "reviewed_at": _isofmt(amd.reviewed_at),
        "effective_at": _isofmt(amd.effective_at),
        "review_decision_note": amd.review_decision_note,
        "consent_version_after": amd.consent_version_after,
        "diff": diff,
        "payload": payload,
    }


def _audit_dict(row: AuditEventRecord) -> dict[str, Any]:
    return {
        "event_id": row.event_id,
        "target_id": row.target_id,
        "target_type": row.target_type,
        "action": row.action,
        "role": row.role,
        "actor_id": row.actor_id,
        "note": row.note,
        "created_at": row.created_at,
    }


def _cover_text(proto: IRBProtocol) -> str:
    lines = [
        "IRB Regulatory Binder",
        "=====================",
        "",
        f"Protocol ID:       {proto.id}",
        f"Protocol code:     {proto.protocol_code or '-'}",
        f"Title:             {proto.title or '-'}",
        f"IRB Board:         {proto.irb_board or '-'}",
        f"IRB Number:        {proto.irb_number or '-'}",
        f"Sponsor:           {proto.sponsor or '-'}",
        f"PI user_id:        {proto.pi_user_id or '-'}",
        f"Status:            {proto.status or '-'}",
        f"Phase:             {proto.phase or '-'}",
        f"Risk level:        {proto.risk_level or '-'}",
        f"Approval date:     {proto.approval_date or '-'}",
        f"Expiry date:       {proto.expiry_date or '-'}",
        f"Effective version: v{proto.version or 1}",
        f"Clinic:            {proto.clinic_id or '-'}",
        f"Demo row:          {bool(proto.is_demo)}",
        "",
        "This binder bundles the protocol, every amendment with its",
        "computed diff + reviewer signoff + decision note, plus a",
        "chronological audit-event trail. JSON / text format — portable",
        "across regulator review tools.",
        "",
        f"Generated at:      {datetime.now(timezone.utc).isoformat()}",
    ]
    return "\n".join(lines)


def build_reg_binder(db: Session, protocol_id: str, clinic_id: Optional[str]) -> bytes:
    """Build the reg-binder ZIP. Cross-clinic IDOR check.

    Returns the bytes of a ``.zip`` archive containing
    ``cover_page.txt``, ``protocol_v{n}.json``, an ``amendments/``
    subdirectory with one JSON per amendment row, and
    ``audit_trail.json`` listing every ``irb.amendment_*`` event for
    this protocol's amendments.
    """
    proto = (
        db.query(IRBProtocol).filter(IRBProtocol.id == protocol_id).first()
    )
    if proto is None:
        raise ApiServiceError(
            code="protocol_not_found",
            message="Protocol not found.",
            status_code=404,
        )
    # Cross-clinic IDOR — admins (no clinic_id) bypass via clinic_id=None.
    if clinic_id is not None and proto.clinic_id and proto.clinic_id != clinic_id:
        raise ApiServiceError(
            code="protocol_not_found",
            message="Protocol not found.",
            status_code=404,
        )

    amendments = (
        db.query(IRBProtocolAmendment)
        .filter(IRBProtocolAmendment.protocol_id == protocol_id)
        .order_by(IRBProtocolAmendment.submitted_at.asc())
        .all()
    )

    # Audit trail: every ``irb.amendment_*`` row whose target_id is one of
    # this protocol's amendment ids. Ordered by created_at ascending so
    # the regulator reads the lifecycle chronologically.
    amendment_ids = [a.id for a in amendments]
    audit_rows: list[AuditEventRecord] = []
    if amendment_ids:
        audit_rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == "irb_amendment",
                AuditEventRecord.target_id.in_(amendment_ids),
            )
            .order_by(AuditEventRecord.created_at.asc())
            .all()
        )

    proto_version = proto.version or 1

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("cover_page.txt", _cover_text(proto))
        zf.writestr(
            f"protocol_v{proto_version}.json",
            json.dumps(_protocol_dict(proto), indent=2, sort_keys=True),
        )
        for amd in amendments:
            n = amd.version or 1
            zf.writestr(
                f"amendments/amendment_{amd.id}_v{n}.json",
                json.dumps(_amendment_dict(amd), indent=2, sort_keys=True),
            )
        zf.writestr(
            "audit_trail.json",
            json.dumps(
                [_audit_dict(r) for r in audit_rows],
                indent=2,
                sort_keys=True,
            ),
        )

    return buf.getvalue()


def reg_binder_filename(proto: IRBProtocol) -> str:
    """Standard filename for the Content-Disposition header."""
    return f"reg_binder_{proto.id}_v{proto.version or 1}.zip"
