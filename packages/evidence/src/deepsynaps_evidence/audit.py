"""Hash-chained audit logger for grounding decisions.

Implements the append-only, SHA-256 hash-chained audit trail described
in ``evidence_citation_validator.md`` section 8. Each event links to
its predecessor via ``prev_hash``, creating a tamper-evident chain.

All functions take a sync SQLAlchemy ``Session`` matching the
``app.database.get_db_session()`` pattern.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session


def _import_models():
    """Lazy import to avoid circular imports at package load time."""
    from app.persistence.models import DsGroundingAudit
    return DsGroundingAudit


def _compute_row_hash(
    event_id: str,
    decision: str,
    claim_hash: str,
    prev_hash: str,
) -> str:
    """SHA-256 of ``event_id|decision|claim_hash|prev_hash``."""
    payload = f"{event_id}|{decision}|{claim_hash}|{prev_hash}"
    return hashlib.sha256(payload.encode()).hexdigest()


def log_grounding_event(
    session: Session,
    *,
    event_type: str,
    study_identifier: str | None = None,
    claim_hash: str | None = None,
    decision: str,
    reason: str | None = None,
    confidence: float | None = None,
    decided_by: str = "system",
) -> str:
    """Append a hash-chained audit record and return its ``event_id``.

    Parameters
    ----------
    session : Session
        Open SQLAlchemy session.
    event_type : str
        One of: pmid_verified, fabrication_blocked, retraction_blocked,
        relevance_accepted, relevance_rejected, confidence_assigned,
        unsupported_claim_blocked, hypergraph_enriched, corpus_miss.
    study_identifier : str, optional
        PMID or DOI if applicable.
    claim_hash : str, optional
        SHA-256 of the de-identified claim text.
    decision : str
        include / exclude / block / warn.
    reason : str, optional
        Human-readable rationale.
    confidence : float, optional
        0.0-1.0 confidence score.
    decided_by : str
        ``"system"`` or ``"llm:<model>"`` or ``"clinician:<id>"``.

    Returns
    -------
    str
        The generated ``event_id`` (UUID).
    """
    DsGroundingAudit = _import_models()

    event_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Get previous row's hash for the chain link
    prev_row_hash = session.scalar(
        select(DsGroundingAudit.row_hash)
        .order_by(DsGroundingAudit.id.desc())
        .limit(1)
    )
    prev_hash = prev_row_hash if prev_row_hash else "GENESIS"

    row_hash = _compute_row_hash(
        event_id=event_id,
        decision=decision,
        claim_hash=claim_hash or "",
        prev_hash=prev_hash,
    )

    record = DsGroundingAudit(
        event_id=event_id,
        event_type=event_type,
        study_identifier=study_identifier,
        claim_hash=claim_hash,
        decision=decision,
        reason=reason,
        confidence=confidence,
        decided_by=decided_by,
        prev_hash=prev_hash,
        row_hash=row_hash,
        created_at=now,
    )
    session.add(record)
    session.commit()

    return event_id


def verify_chain(
    session: Session,
    *,
    limit: int = 1000,
) -> tuple[bool, list[str]]:
    """Verify the hash chain integrity of recent audit records.

    Re-computes each row's ``row_hash`` from its inputs and compares
    to the stored value; also checks that each ``prev_hash`` matches
    the preceding row's ``row_hash``.

    Parameters
    ----------
    session : Session
    limit : int
        Maximum number of rows to verify (oldest-first).

    Returns
    -------
    tuple[bool, list[str]]
        ``(chain_valid, errors)`` — True if all rows verify, with
        an empty error list. False with descriptive error strings
        for each broken link.
    """
    DsGroundingAudit = _import_models()

    rows = list(
        session.scalars(
            select(DsGroundingAudit)
            .order_by(DsGroundingAudit.id.asc())
            .limit(limit)
        ).all()
    )

    if not rows:
        return True, []

    errors: list[str] = []
    expected_prev = "GENESIS"

    for row in rows:
        # Check prev_hash chain link
        if row.prev_hash != expected_prev:
            errors.append(
                f"Row {row.id} (event {row.event_id}): prev_hash mismatch "
                f"(stored={row.prev_hash!r}, expected={expected_prev!r})"
            )

        # Recompute and verify row_hash
        expected_hash = _compute_row_hash(
            event_id=row.event_id,
            decision=row.decision,
            claim_hash=row.claim_hash or "",
            prev_hash=row.prev_hash or "GENESIS",
        )
        if row.row_hash != expected_hash:
            errors.append(
                f"Row {row.id} (event {row.event_id}): row_hash mismatch "
                f"(stored={row.row_hash!r}, computed={expected_hash!r})"
            )

        expected_prev = row.row_hash

    return len(errors) == 0, errors
