"""Single source of truth for "is this a demo session/actor/clinic?".

Today the same notion is re-derived in at least 8 places:

* ``MRI_DEMO_MODE`` env probe in ``mri_analysis_router._demo_mode_enabled``
* ``_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}`` literal
  copy-pasted into ``clinician_inbox_router``, ``clinician_wellness_router``,
  ``care_team_coverage_router``, ``auto_page_worker_router``,
  ``treatment_courses_router``, ``population_analytics_router``,
  ``escalation_policy_router``, ``channel_misconfiguration_detector_router``,
  ``caregiver_consent_router``, ``clinician_digest_router``,
  ``caregiver_delivery_concern_aggregator_router``,
  ``wearables_workbench_router``, ``patient_digest_router``,
  ``clinician_adherence_router`` (and inline literal variants in
  ``reports_router``, ``patient_home_program_tasks_router``,
  ``symptom_journal_router``, ``patient_messages_router``).
* The auth layer's "demo token" branch in :mod:`app.auth`.

This module is *additive*: it introduces the canonical predicate without
touching any of the existing call sites. PR-B will migrate them in a
follow-up so the diffs stay reviewable. Until then, treat the
``DEMO_CLINIC_IDS`` constant exported here as authoritative — every new
gate should import it instead of re-typing the literal pair.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any, FrozenSet, Optional

if TYPE_CHECKING:  # pragma: no cover - import only for type checkers
    from sqlalchemy.orm import Session

    from app.auth import AuthenticatedActor


# Demo clinic ids must match the literal set duplicated across the routers
# listed in the module docstring. Update both in lock-step until PR-B
# completes the migration.
DEMO_CLINIC_IDS: FrozenSet[str] = frozenset({"clinic-demo-default", "clinic-cd-demo"})

# Env var honoured by the qEEG/MRI dashboards to force the demo payload
# even when the heavy neuro stack is installed. Mirrors
# ``mri_analysis_router._demo_mode_enabled``.
_DEMO_ENV_VAR = "MRI_DEMO_MODE"
_DEMO_ENV_TRUTHY = "1"

# Demo actor ids and token suffix — kept here so the predicate has a
# single place to grow when more demo personas are added. The actor ids
# are the canonical ``DemoActor.actor_id`` values from
# :mod:`app.registries.auth`. The suffix mirrors the frontend convention
# (every synthetic offline token ends with ``"-demo-token"``).
_DEMO_ACTOR_ID_PREFIX = "actor-"
_DEMO_ACTOR_ID_SUFFIX = "-demo"
_DEMO_TOKEN_SUFFIX = "-demo-token"


def is_demo_clinic_id(clinic_id: Optional[str]) -> bool:
    """Return ``True`` iff *clinic_id* is one of the canonical demo clinics.

    Accepts ``None`` so callers can pass ``actor.clinic_id`` directly
    without a defensive truthiness check.
    """
    if not clinic_id:
        return False
    return clinic_id in DEMO_CLINIC_IDS


def is_demo_env() -> bool:
    """Return ``True`` iff the ``MRI_DEMO_MODE`` env flag is set to ``"1"``.

    Mirrors :func:`app.routers.mri_analysis_router._demo_mode_enabled` but
    without the ``HAS_MRI_PIPELINE`` fallback — that fallback is an
    MRI-specific concern (render the dashboard even if neuro deps are
    missing) and is intentionally NOT pulled into the generic predicate.
    PR-B will refactor the MRI router to compose the two checks.
    """
    return os.environ.get(_DEMO_ENV_VAR) == _DEMO_ENV_TRUTHY


def _is_demo_actor_id(actor_id: Optional[str]) -> bool:
    """Heuristic: every seeded demo persona's actor id matches
    ``actor-<persona>-demo`` (see :mod:`app.registries.auth`)."""
    if not actor_id:
        return False
    return (
        actor_id.startswith(_DEMO_ACTOR_ID_PREFIX)
        and actor_id.endswith(_DEMO_ACTOR_ID_SUFFIX)
    )


def _is_demo_token(token_id: Optional[str]) -> bool:
    """Frontend convention: synthetic tokens end with ``-demo-token``."""
    if not token_id:
        return False
    return token_id.endswith(_DEMO_TOKEN_SUFFIX)


def is_demo_actor(
    actor: Optional["AuthenticatedActor"],
    db: Optional["Session"] = None,  # reserved for PR-B (DB-backed lookups)
) -> bool:
    """Return ``True`` iff *actor* should be treated as a demo session.

    The check is a logical OR over four signals:

    1. ``MRI_DEMO_MODE=1`` is set in the environment (global override).
    2. The actor's clinic is one of :data:`DEMO_CLINIC_IDS`.
    3. The actor's ``actor_id`` matches the seeded demo persona pattern
       ``actor-<persona>-demo``.
    4. The actor's ``token_id`` ends with the conventional
       ``-demo-token`` suffix.

    The *db* argument is accepted (and currently unused) so PR-B can add
    DB-backed checks (e.g. clinic feature flag, "demo" tag on a User row)
    without changing the call signature again.
    """
    if is_demo_env():
        return True
    if actor is None:
        return False
    if is_demo_clinic_id(getattr(actor, "clinic_id", None)):
        return True
    if _is_demo_actor_id(getattr(actor, "actor_id", None)):
        return True
    if _is_demo_token(getattr(actor, "token_id", None)):
        return True
    return False


__all__ = [
    "DEMO_CLINIC_IDS",
    "is_demo_actor",
    "is_demo_clinic_id",
    "is_demo_env",
]


# ``db: Any`` re-export to keep the public type hint friendly when callers
# don't have SQLAlchemy imported at the call site (e.g. unit tests).
def _typing_smoke(_: Any = None) -> None:  # pragma: no cover
    return None
