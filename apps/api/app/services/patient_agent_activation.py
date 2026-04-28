"""Patient-side agent activation flow (Phase 7).

Patient-facing agents (``patient.care_companion``, ``patient.adherence``,
``patient.education``, ``patient.crisis``) are gated behind the
``pending_clinical_signoff`` sentinel package on the marketplace registry
side. This module records the *clinic-level activation* that a super-admin
performs after the clinical Product Manager attests in writing that the
agent's safety prompt is fit for the named clinic's workflow.

Storage model
=============

In-memory ``set[(clinic_id, agent_id)]`` scoped to a single Fly machine.
Phase 8 promotes this to a DB-backed table owned by the parallel
infrastructure subagent (the migration is in their scope). Until then
the activations do *not* survive a process restart — operators have to
re-attest after each deploy. That is acceptable because the activation
itself remains gated behind ``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED=1``
(see below) which is itself an env-var-only feature flag.

Production safety
=================

Even after this module flags a (clinic, agent) pair as activated,
:func:`is_activated` returns ``False`` unless the env var
``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED`` is set to ``"1"``. This is the
final guardrail before patient-facing agents go live in production —
the activation flow can be exercised end-to-end (e.g. on staging) without
any risk of an attestation slipping into a production rollout. Ops must
flip the env var deliberately as part of the launch checklist.
"""
from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from typing import Any

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
# Module-level activation store (threadsafe).
# ---------------------------------------------------------------------------

_ACTIVATIONS: dict[tuple[str, str], dict[str, Any]] = {}
_ACTIVATIONS_LOCK = threading.Lock()


def _reset_for_tests() -> None:
    """Test helper — clears the in-memory activation store."""
    with _ACTIVATIONS_LOCK:
        _ACTIVATIONS.clear()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def env_flag_enabled() -> bool:
    """Return True iff the ``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED`` flag is set.

    The flag is the production-side guardrail. Without it,
    :func:`is_activated` always returns False even for activated pairs.
    """
    return os.environ.get("DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED") == "1"


def is_activated(clinic_id: str, agent_id: str) -> bool:
    """Return True iff *clinic* has an active attestation for *agent*.

    Two conditions must both be met:

    1. ``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED == "1"`` in the environment.
    2. The ``(clinic_id, agent_id)`` pair is present in the activation
       store (i.e. a super-admin has called :func:`activate`).

    Either condition failing returns False — the env var is the
    production guardrail that ops flips at launch time.
    """
    if not env_flag_enabled():
        return False
    with _ACTIVATIONS_LOCK:
        return (clinic_id, agent_id) in _ACTIVATIONS


def activate(
    *,
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

    Idempotent: re-activating an already-active pair updates the
    ``attested_at`` and ``attestation`` text without raising.

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

    record = {
        "clinic_id": clinic_id,
        "agent_id": agent_id,
        "attestation": attestation,
        "attested_by": attested_by,
        "attested_at": datetime.now(timezone.utc).isoformat(),
    }
    with _ACTIVATIONS_LOCK:
        _ACTIVATIONS[(clinic_id, agent_id)] = record

    return {"ok": True, "error": None, "activation": dict(record)}


def deactivate(*, clinic_id: str, agent_id: str) -> dict[str, Any]:
    """Remove a (clinic, agent) activation.

    Idempotent — deactivating a pair that was never activated returns
    ``{ok: True, removed: False}`` rather than raising. Useful when ops
    needs to drain a clinic's access without first checking state.
    """
    with _ACTIVATIONS_LOCK:
        existed = (clinic_id, agent_id) in _ACTIVATIONS
        _ACTIVATIONS.pop((clinic_id, agent_id), None)
    return {"ok": True, "removed": existed}


def list_activations() -> list[dict[str, Any]]:
    """Return all currently-active (clinic, agent) records.

    The list is unsorted by design — small enough to render in the ops
    UI without a server-side ordering decision. UI sorts by clinic_id.
    """
    with _ACTIVATIONS_LOCK:
        return [dict(v) for v in _ACTIVATIONS.values()]


__all__ = [
    "activate",
    "deactivate",
    "env_flag_enabled",
    "is_activated",
    "list_activations",
    "_reset_for_tests",
]
