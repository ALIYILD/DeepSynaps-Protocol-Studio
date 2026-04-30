"""Phase 12 — onboarding wizard funnel telemetry endpoints.

Two endpoints power the funnel dashboard:

* ``POST /api/v1/onboarding/events`` — write a single step transition.
  Auth is *optional*: pre-login visitors emit ``started`` /
  ``package_selected`` events with ``actor_id = NULL`` and
  ``clinic_id = NULL``. Post-login transitions inherit both from the
  authenticated actor. Rate-limited per IP at ``20/minute`` to match
  the comparable settings-write endpoints (see
  ``profile_router.py:312``).
* ``GET /api/v1/onboarding/funnel?days=N`` — admin-only aggregate.
  Returns per-step counts plus the started→completed and
  started→skipped conversion ratios for the last *N* days.

The ``step`` value is validated against a small allowlist
(:data:`_VALID_STEPS`); unknown step names return 400 so a typo in
the wizard does not pollute the funnel with garbage rows.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import OnboardingEvent

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])


# ── Step enum ────────────────────────────────────────────────────────────────
# Shared by the wizard JS and the funnel aggregator. Adding a step here is
# a one-line change; the wizard is expected to mirror the new value but the
# DB layer is permissive so it can land first.
_VALID_STEPS: tuple[str, ...] = (
    "started",
    "package_selected",
    "stripe_initiated",
    "stripe_skipped",
    "agents_enabled",
    "team_invited",
    "completed",
    "skipped",
)


# ── Schemas ──────────────────────────────────────────────────────────────────


class OnboardingEventIn(BaseModel):
    step: str = Field(..., min_length=1, max_length=64)
    payload: dict[str, Any] | None = None


class OnboardingEventOut(BaseModel):
    id: int
    recorded_at: str


class FunnelTotals(BaseModel):
    started: int = 0
    package_selected: int = 0
    stripe_initiated: int = 0
    stripe_skipped: int = 0
    agents_enabled: int = 0
    team_invited: int = 0
    completed: int = 0
    skipped: int = 0


class FunnelConversion(BaseModel):
    started_to_completed: float = 0.0
    started_to_skipped: float = 0.0


class FunnelSummary(BaseModel):
    since_days: int
    totals: FunnelTotals
    conversion: FunnelConversion


# ── Helpers ──────────────────────────────────────────────────────────────────


def _validate_step(step: str) -> str:
    """Reject unknown step names with a 400 error.

    Pydantic only enforces the length bounds; the enum guard lives here so
    we can return a structured ApiServiceError that surfaces the allowed
    values to the caller (useful when adding a new step on the wizard side
    without redeploying the API first — the 400 message tells you exactly
    what is wrong).
    """
    if step not in _VALID_STEPS:
        raise ApiServiceError(
            code="invalid_onboarding_step",
            message=f"Unknown onboarding step '{step}'.",
            warnings=[f"Allowed steps: {', '.join(_VALID_STEPS)}"],
            status_code=400,
        )
    return step


def _serialize_payload(payload: dict[str, Any] | None) -> str | None:
    if payload is None:
        return None
    try:
        # Cap the payload size — telemetry rows are tiny by design and a
        # large dict here usually signals accidental dumping of a full
        # agent record. 4 KB is comfortable headroom for the legitimate
        # contents (package id, agent id, invite count).
        encoded = json.dumps(payload, default=str)
    except (TypeError, ValueError):
        return None
    if len(encoded) > 4096:
        return encoded[:4096]
    return encoded


def _require_admin(actor: AuthenticatedActor) -> None:
    """Funnel summary visibility gate.

    Per the Phase 12 brief: super-admin OR org admin (i.e. role=admin
    regardless of clinic_id). This is intentionally looser than the
    cross-clinic ops gate — clinic admins need to see the funnel for
    their own onboarding decisions, and the funnel doesn't expose any
    PHI or per-clinic detail.
    """
    require_minimum_role(actor, "admin")


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/events", response_model=OnboardingEventOut, status_code=201)
@limiter.limit("20/minute")
def post_onboarding_event(
    request: Request,
    body: OnboardingEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OnboardingEventOut:
    """Record a single wizard step transition.

    Auth is optional — anonymous visitors are allowed so the funnel
    captures pre-signup browsers. When authenticated, the actor's
    ``actor_id`` and ``clinic_id`` are joined onto the row so admins
    can later slice the funnel by clinic.
    """
    step = _validate_step(body.step)

    # Treat the anonymous demo actor as truly anonymous — they share an
    # ``actor_id`` (``actor-anonymous``) that doesn't exist in the
    # ``users`` table, so persisting it would violate the FK.
    actor_id: str | None = None
    clinic_id: str | None = None
    if actor.role != "guest":
        actor_id = actor.actor_id
        clinic_id = actor.clinic_id

    row = OnboardingEvent(
        clinic_id=clinic_id,
        actor_id=actor_id,
        step=step,
        payload_json=_serialize_payload(body.payload),
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return OnboardingEventOut(
        id=row.id,
        recorded_at=row.created_at.isoformat(),
    )


@router.get("/funnel", response_model=FunnelSummary)
def get_onboarding_funnel(
    days: int = Query(7, ge=1, le=90),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FunnelSummary:
    """Aggregate funnel counts + conversion ratios for the last *days* days.

    Returns a fixed-shape ``totals`` dict (every step name appears, even
    when zero) and two derived ratios. The window is closed on
    ``created_at`` only — this is funnel telemetry, not a status board,
    so we do not also bound the upper edge.
    """
    _require_admin(actor)

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(OnboardingEvent.step, OnboardingEvent.id)
        .filter(OnboardingEvent.created_at >= cutoff)
        .all()
    )

    counts: dict[str, int] = {step: 0 for step in _VALID_STEPS}
    for step_value, _ in rows:
        if step_value in counts:
            counts[step_value] += 1
        # Unknown step values are dropped silently — they cannot reach
        # the table via our POST endpoint, so any present here are from
        # an out-of-band insert and we deliberately ignore them.

    started = counts["started"]
    completed = counts["completed"]
    skipped = counts["skipped"]
    started_to_completed = (completed / started) if started else 0.0
    started_to_skipped = (skipped / started) if started else 0.0

    return FunnelSummary(
        since_days=days,
        totals=FunnelTotals(**counts),
        conversion=FunnelConversion(
            started_to_completed=round(started_to_completed, 4),
            started_to_skipped=round(started_to_skipped, 4),
        ),
    )
