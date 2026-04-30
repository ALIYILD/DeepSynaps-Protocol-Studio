"""Patient-side agent activation flow (Phase 7 → Phase 8 DB-backed).

Patient-facing agents (``patient.care_companion``, ``patient.adherence``,
``patient.education``, ``patient.crisis``) are gated behind the
``pending_clinical_signoff`` sentinel package on the marketplace registry
side. This module records the *clinic-level activation* that a super-admin
performs after the clinical Product Manager attests in writing that the
agent's safety prompt is fit for the named clinic's workflow.

Storage model
=============

Phase 7 (PR #221) used a module-scoped in-memory ``dict`` that was
threadsafe but lost on every Fly machine restart. Phase 8 promotes the
store to the :class:`PatientAgentActivation` audit table (migration 052)
so attestations survive restarts and can be reasoned about across
machines.

The table is audit-only: rows are *soft-deleted* by setting
``deactivated_at`` / ``deactivated_by``; we never hard-delete an
attestation row. Re-activating a previously-deactivated pair inserts a
new row (the old soft-deleted row stays as evidence). A partial unique
index ``uq_active_pair`` enforces at most one active row per
``(clinic_id, agent_id)``.

Production safety
=================

Even after this module records a (clinic, agent) row, :func:`is_activated`
returns ``False`` unless the env var ``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED``
is set to ``"1"``. This is the final guardrail before patient-facing
agents go live in production — the activation flow can be exercised
end-to-end (e.g. on staging) without any risk of an attestation slipping
into a production rollout. Ops must flip the env var deliberately as
part of the launch checklist.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.persistence.models import PatientAgentActivation

# Patient-facing agent IDs follow the ``patient.<name>`` convention. We
# validate by prefix rather than by membership in a hardcoded list so a
# new patient agent shipped via the registry doesn't require an update
# here. The ``pending_clinical_signoff`` package gate on the registry
# side still scopes which IDs reach this flow.
_PATIENT_AGENT_PREFIX = "patient."

# Free-text attestation must contain at least this many characters. Forces
# the operator to write a meaningful note ("I attest the clinical PM
# signed off …") rather than a one-word "ok".
_MIN_ATTESTATION_CHARS = 32


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_dict(row: PatientAgentActivation) -> dict[str, Any]:
    """Project an ORM row to the public dict shape returned by the API.

    Mirrors the Phase 7 record shape so the FastAPI response_model
    (``PatientActivationOut``) keeps validating without changes.
    """
    return {
        "clinic_id": row.clinic_id,
        "agent_id": row.agent_id,
        "attestation": row.attestation,
        "attested_by": row.attested_by,
        "attested_at": row.attested_at.isoformat() if row.attested_at else None,
    }


def _active_query(db: Session, clinic_id: str, agent_id: str):
    """Return a query for the currently-active row for ``(clinic, agent)``.

    Exactly zero or one row matches at any time thanks to the
    ``uq_active_pair`` partial unique index.
    """
    return (
        db.query(PatientAgentActivation)
        .filter(
            PatientAgentActivation.clinic_id == clinic_id,
            PatientAgentActivation.agent_id == agent_id,
            PatientAgentActivation.deactivated_at.is_(None),
        )
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def env_flag_enabled() -> bool:
    """Return True iff the ``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED`` flag is set.

    The flag is the production-side guardrail. Without it,
    :func:`is_activated` always returns False even for activated pairs.
    """
    return os.environ.get("DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED") == "1"


def is_activated(*, db: Session, clinic_id: str, agent_id: str) -> bool:
    """Return True iff *clinic* has an active attestation for *agent*.

    Two conditions must both be met:

    1. ``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED == "1"`` in the environment.
    2. An active row (``deactivated_at IS NULL``) exists for the pair.

    Either condition failing returns False — the env var is the
    production guardrail that ops flips at launch time.
    """
    if not env_flag_enabled():
        return False
    return _active_query(db, clinic_id, agent_id).count() > 0


def activate(
    *,
    db: Session,
    clinic_id: str,
    agent_id: str,
    attestation: str,
    attested_by: str,
) -> dict[str, Any]:
    """Record a clinic-level activation for a patient-facing agent.

    Validates:

    * ``agent_id`` starts with ``"patient."`` — this flow is *only* for
      patient agents. Clinic-side agents have a different gate.
    * ``attestation`` is at least 32 characters of free text.
    * ``clinic_id`` and ``attested_by`` are non-empty.

    Idempotent: if an active row already exists for the pair, it is
    *updated in-place* (new attestation text, new ``attested_by``,
    refreshed ``attested_at``). The Phase 7 contract preserved a single
    row per active pair and Phase 8 keeps that contract — re-attestation
    is treated as an amendment, not a new audit event.

    Returns
    -------
    dict
        ``{ok: bool, error: str | None, activation: dict | None}``.
        On success ``activation`` mirrors the entry returned by
        :func:`list_activations`.
    """
    if not clinic_id:
        return {"ok": False, "error": "clinic_id_required", "activation": None}
    if not agent_id:
        return {"ok": False, "error": "agent_id_required", "activation": None}
    if not agent_id.startswith(_PATIENT_AGENT_PREFIX):
        return {
            "ok": False,
            "error": "agent_id_not_patient_facing",
            "activation": None,
        }
    attestation = (attestation or "").strip()
    if len(attestation) < _MIN_ATTESTATION_CHARS:
        return {"ok": False, "error": "attestation_too_short", "activation": None}
    if not attested_by:
        return {"ok": False, "error": "attested_by_required", "activation": None}

    existing = _active_query(db, clinic_id, agent_id).one_or_none()
    now = datetime.now(timezone.utc)
    if existing is not None:
        # Idempotent re-attestation: amend the live row in place.
        existing.attestation = attestation
        existing.attested_by = attested_by
        existing.attested_at = now
        db.commit()
        db.refresh(existing)
        return {"ok": True, "error": None, "activation": _row_to_dict(existing)}

    row = PatientAgentActivation(
        id=uuid.uuid4().hex,
        clinic_id=clinic_id,
        agent_id=agent_id,
        attestation=attestation,
        attested_by=attested_by,
        attested_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "error": None, "activation": _row_to_dict(row)}


def deactivate(
    *,
    db: Session,
    clinic_id: str,
    agent_id: str,
    deactivated_by: str | None = None,
) -> dict[str, Any]:
    """Soft-delete the active (clinic, agent) activation, if any.

    Idempotent — deactivating a pair with no active row returns
    ``{ok: True, removed: False}`` rather than raising. Useful when ops
    needs to drain a clinic's access without first checking state.

    The row itself is *never* hard-deleted; ``deactivated_at`` and
    ``deactivated_by`` are set so the row remains in the audit log.
    """
    existing = _active_query(db, clinic_id, agent_id).one_or_none()
    if existing is None:
        return {"ok": True, "removed": False}

    existing.deactivated_at = datetime.now(timezone.utc)
    existing.deactivated_by = deactivated_by
    db.commit()
    return {"ok": True, "removed": True}


def list_activations(*, db: Session) -> list[dict[str, Any]]:
    """Return all currently-active (clinic, agent) records.

    Soft-deleted rows are excluded. The list is unsorted by design —
    small enough to render in the ops UI without a server-side ordering
    decision. UI sorts by clinic_id.
    """
    rows = (
        db.query(PatientAgentActivation)
        .filter(PatientAgentActivation.deactivated_at.is_(None))
        .all()
    )
    return [_row_to_dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Test helper
# ---------------------------------------------------------------------------


def _reset_for_tests(db: Session | None = None) -> None:
    """Test helper — clears all activation rows.

    Phase 8 has nothing module-scoped to clear; the conftest's
    ``isolated_database`` fixture already truncates tables between tests
    via ``reset_database(fast=True)``. This shim is kept so the existing
    Phase 7 test fixture keeps working without changes; it is a no-op
    when called without a session, and a hard delete when called with
    one (useful for hand-rolled test fixtures that want to start clean
    without invoking the broader DB reset).
    """
    if db is None:
        return
    db.query(PatientAgentActivation).delete()
    db.commit()


__all__ = [
    "activate",
    "deactivate",
    "env_flag_enabled",
    "is_activated",
    "list_activations",
    "_reset_for_tests",
]
