"""Phase 12 — onboarding wizard funnel telemetry endpoints, plus the
2026-05-01 launch-audit additions for the Onboarding Wizard surface.

Funnel telemetry (Phase 12)
---------------------------
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

Launch-audit (2026-05-01)
-------------------------
* ``GET  /api/v1/onboarding/state``           — server-side resume payload.
* ``POST /api/v1/onboarding/state``           — persist current step + demo flag.
* ``POST /api/v1/onboarding/step-complete``   — record step_completed (audit).
* ``POST /api/v1/onboarding/skip``            — abandon wizard with reason.
* ``POST /api/v1/onboarding/audit-events``    — page-level audit ingestion
  (``target_type=onboarding_wizard``).
* ``POST /api/v1/onboarding/seed-demo``       — explicit demo seed; stamps
  every record created during the wizard with ``is_demo=True`` so downstream
  surfaces render DEMO banners honestly.

The ``step`` value used by the funnel POST is validated against a small
allowlist (:data:`_VALID_STEPS`); unknown step names return 400. The
launch-audit endpoints use a separate, looser allowlist (:data:`_WIZARD_STEPS`)
because the wizard UI has its own step naming that is independent of the
funnel taxonomy.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

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
from app.persistence.models import OnboardingEvent, OnboardingState

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])

_log = logging.getLogger(__name__)


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


# ════════════════════════════════════════════════════════════════════════════
# Launch-audit (2026-05-01) — Onboarding Wizard surface
# ════════════════════════════════════════════════════════════════════════════


# ── Wizard step allowlist ───────────────────────────────────────────────────
# Independent of the funnel taxonomy: the wizard UI renders 6 panes and we
# audit page-level transitions among them. Adding a new pane is a one-line
# change here. Unknown steps are rejected so a typo in the JS does not
# silently land bogus audit rows.
_WIZARD_STEPS: tuple[str, ...] = (
    "welcome",
    "clinic_info",
    "role",
    "data_choice",
    "first_patient",
    "feature_tour",
    "completion",
)


# ── Disclaimers surfaced on every state read ────────────────────────────────
ONBOARDING_DISCLAIMERS = [
    "Onboarding wizard records are seeded as DEMO unless you explicitly opt out.",
    "Skipping the wizard does not bypass any clinical-safety gate downstream "
    "(course approval, IRB protocol, consent capture).",
    "Audit events for the wizard are visible at /api/v1/audit-trail?surface=onboarding_wizard.",
]


def _wizard_step_or_400(step: str) -> str:
    if step not in _WIZARD_STEPS:
        raise ApiServiceError(
            code="invalid_wizard_step",
            message=f"Unknown wizard step '{step}'.",
            warnings=[f"Allowed steps: {', '.join(_WIZARD_STEPS)}"],
            status_code=400,
        )
    return step


def _require_authenticated(actor: AuthenticatedActor) -> None:
    """The launch-audit endpoints require a real (non-guest) actor.

    The funnel POST is intentionally anonymous-friendly because it tracks
    pre-signup behaviour. The launch-audit endpoints, by contrast, persist
    server-side state and emit audit rows that must attribute to a real
    actor — guest visitors are not allowed.
    """
    if actor.role == "guest":
        raise ApiServiceError(
            code="insufficient_role",
            message="Onboarding state requires an authenticated user.",
            status_code=403,
        )


def _self_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: Optional[str] = None,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the onboarding_wizard surface; never raises.

    Mirrors the pattern in ``treatment_courses_router._self_audit_course``.
    Audit-trail outages must not block the wizard.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"onboarding_wizard-{event}-{actor.actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if using_demo_data:
        note_parts.append("DEMO")
    if note:
        note_parts.append(note[:500])
    final_note = "; ".join(note_parts) or event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id or actor.actor_id),
            target_type="onboarding_wizard",
            action=f"onboarding_wizard.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("onboarding_wizard self-audit skipped")
    return event_id


def _get_or_create_state(
    db: Session, actor: AuthenticatedActor
) -> OnboardingState:
    """Idempotent get-or-create for the current actor's wizard state."""
    row = db.query(OnboardingState).filter_by(actor_id=actor.actor_id).first()
    if row is None:
        row = OnboardingState(
            actor_id=actor.actor_id,
            clinic_id=actor.clinic_id,
            current_step="welcome",
            is_demo=False,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _state_to_dict(row: OnboardingState) -> dict:
    return {
        "actor_id": row.actor_id,
        "clinic_id": row.clinic_id,
        "current_step": row.current_step,
        "is_demo": bool(row.is_demo),
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        "abandoned_at": row.abandoned_at.isoformat() if row.abandoned_at else None,
        "abandon_reason": row.abandon_reason,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# ── Schemas ─────────────────────────────────────────────────────────────────


class OnboardingStateOut(BaseModel):
    actor_id: str
    clinic_id: Optional[str] = None
    current_step: str
    is_demo: bool = False
    completed_at: Optional[str] = None
    abandoned_at: Optional[str] = None
    abandon_reason: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    disclaimers: list[str] = Field(default_factory=lambda: list(ONBOARDING_DISCLAIMERS))


class OnboardingStateIn(BaseModel):
    current_step: str = Field(..., min_length=1, max_length=64)
    is_demo: Optional[bool] = None  # None = preserve current value


class OnboardingStepCompleteIn(BaseModel):
    step: str = Field(..., min_length=1, max_length=64)
    next_step: Optional[str] = Field(None, max_length=64)
    note: Optional[str] = Field(None, max_length=512)
    is_demo: Optional[bool] = None


class OnboardingSkipIn(BaseModel):
    step: str = Field(..., min_length=1, max_length=64)
    reason: Optional[str] = Field(None, max_length=255)
    seeded_demo: bool = False


class OnboardingAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    step: Optional[str] = Field(None, max_length=64)
    note: Optional[str] = Field(None, max_length=512)
    using_demo_data: bool = False


class OnboardingAuditEventAck(BaseModel):
    accepted: bool
    event_id: str


class OnboardingSeedDemoIn(BaseModel):
    """Body for the explicit demo-seed endpoint.

    The wizard sends this when the user picks "Use sample data". The
    server stamps the actor's onboarding state ``is_demo=True`` and emits
    an audit event tagged with the count of records the wizard intends to
    create downstream. The endpoint does NOT itself create patients,
    courses, or protocols — that remains the responsibility of the
    dedicated routers, which can read ``GET /onboarding/state`` and stamp
    their own rows accordingly.
    """

    requested_kinds: list[str] = Field(default_factory=list)
    note: Optional[str] = Field(None, max_length=255)


class OnboardingSeedDemoOut(BaseModel):
    accepted: bool
    is_demo: bool
    state: OnboardingStateOut


# ── State endpoints ─────────────────────────────────────────────────────────


@router.get("/state", response_model=OnboardingStateOut)
def get_onboarding_state(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OnboardingStateOut:
    """Return the current actor's wizard state.

    Auto-creates the row on first read so the wizard can render even for
    users who have never opened it before. Emits a ``view`` audit event
    so reviewers can see when the page was first visited.
    """
    _require_authenticated(actor)
    row = _get_or_create_state(db, actor)
    _self_audit(
        db,
        actor,
        event="view",
        note=f"step={row.current_step}",
        using_demo_data=bool(row.is_demo),
    )
    return OnboardingStateOut(**_state_to_dict(row))


@router.post("/state", response_model=OnboardingStateOut)
def post_onboarding_state(
    body: OnboardingStateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OnboardingStateOut:
    """Persist the actor's wizard state (current step + optional demo flag).

    ``is_demo`` is sticky: once True it stays True, even if the caller
    sends ``False`` later. This is intentional — once a user has elected
    a demo path, downstream records carry the DEMO banner and we will
    not retroactively unflag them.
    """
    _require_authenticated(actor)
    step = _wizard_step_or_400(body.current_step)
    row = _get_or_create_state(db, actor)
    row.current_step = step
    if body.is_demo is True:
        row.is_demo = True
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)
    _self_audit(
        db,
        actor,
        event="state_updated",
        note=f"step={step}",
        using_demo_data=bool(row.is_demo),
    )
    return OnboardingStateOut(**_state_to_dict(row))


# ── Step lifecycle endpoints ────────────────────────────────────────────────


@router.post("/step-complete", response_model=OnboardingStateOut)
def post_step_complete(
    body: OnboardingStepCompleteIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OnboardingStateOut:
    """Mark a wizard step complete and (optionally) advance to the next step.

    Emits a ``step_completed`` audit row tagged with the step that just
    finished. If ``next_step`` is provided, the actor's state advances to
    that step in the same transaction. If the step is ``completion`` the
    state row's ``completed_at`` is set so resume-from-step short-circuits
    on subsequent visits.
    """
    _require_authenticated(actor)
    step = _wizard_step_or_400(body.step)
    next_step = _wizard_step_or_400(body.next_step) if body.next_step else None
    row = _get_or_create_state(db, actor)
    if body.is_demo is True:
        row.is_demo = True
    if next_step is not None:
        row.current_step = next_step
    elif step != row.current_step:
        # Even without an explicit next_step we reflect that the user is
        # past the named step — the wizard advances on success.
        row.current_step = step
    if step == "completion":
        row.completed_at = datetime.now(timezone.utc)
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)
    _self_audit(
        db,
        actor,
        event="step_completed",
        note=f"step={step}; next={next_step or row.current_step}",
        using_demo_data=bool(row.is_demo),
    )
    if step == "completion":
        _self_audit(
            db,
            actor,
            event="wizard_completed",
            note=f"final_step={step}",
            using_demo_data=bool(row.is_demo),
        )
    return OnboardingStateOut(**_state_to_dict(row))


@router.post("/skip", response_model=OnboardingStateOut)
def post_skip_wizard(
    body: OnboardingSkipIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OnboardingStateOut:
    """Abandon the wizard at the named step.

    If ``seeded_demo`` is true the actor's state ``is_demo`` is forced to
    True so any downstream surface that reads ``GET /onboarding/state``
    sees the demo flag honestly. Emits ``step_skipped`` then
    ``wizard_abandoned`` so the audit trail captures both the per-step
    skip and the wizard-level outcome.
    """
    _require_authenticated(actor)
    step = _wizard_step_or_400(body.step)
    row = _get_or_create_state(db, actor)
    if body.seeded_demo:
        row.is_demo = True
    now = datetime.now(timezone.utc)
    row.abandoned_at = now
    row.abandon_reason = (body.reason or "")[:255] or None
    row.updated_at = now
    db.add(row)
    db.commit()
    db.refresh(row)
    _self_audit(
        db,
        actor,
        event="step_skipped",
        note=f"step={step}; reason={(body.reason or '')[:200]}",
        using_demo_data=bool(row.is_demo),
    )
    _self_audit(
        db,
        actor,
        event="wizard_abandoned",
        note=f"step={step}; reason={(body.reason or '')[:200]}",
        using_demo_data=bool(row.is_demo),
    )
    return OnboardingStateOut(**_state_to_dict(row))


# ── Page-level audit ingestion ──────────────────────────────────────────────


@router.post("/audit-events", response_model=OnboardingAuditEventAck)
def post_audit_event(
    body: OnboardingAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OnboardingAuditEventAck:
    """Record a page-level audit event from the wizard UI.

    Surface: ``onboarding_wizard``. Common events: ``view`` (mount),
    ``step_started``, ``step_completed``, ``step_skipped``,
    ``wizard_completed``, ``wizard_abandoned``, ``demo_seed_requested``,
    ``first_patient_created`` (alongside the patients-router create), and
    ``finish``.
    """
    _require_authenticated(actor)
    if body.step is not None:
        _wizard_step_or_400(body.step)
    note_parts: list[str] = []
    if body.step:
        note_parts.append(f"step={body.step}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event
    event_id = _self_audit(
        db,
        actor,
        event=body.event,
        note=note,
        using_demo_data=bool(body.using_demo_data),
    )
    return OnboardingAuditEventAck(accepted=True, event_id=event_id)


# ── Demo seed (explicit) ────────────────────────────────────────────────────


@router.post("/seed-demo", response_model=OnboardingSeedDemoOut)
def post_seed_demo(
    body: OnboardingSeedDemoIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OnboardingSeedDemoOut:
    """Stamp the actor's wizard state ``is_demo=True`` and emit an audit event.

    Replaces the older silent "seed-on-skip" behaviour where any record
    created during the wizard was implicitly demo without the user being
    told. Now: explicit endpoint, explicit audit row, explicit DEMO
    banner downstream.
    """
    _require_authenticated(actor)
    row = _get_or_create_state(db, actor)
    row.is_demo = True
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)
    kinds = ", ".join(body.requested_kinds[:8]) if body.requested_kinds else "all"
    note = f"seed_demo kinds={kinds}"
    if body.note:
        note += f"; {body.note[:120]}"
    _self_audit(
        db,
        actor,
        event="demo_seeded",
        note=note,
        using_demo_data=True,
    )
    return OnboardingSeedDemoOut(
        accepted=True,
        is_demo=True,
        state=OnboardingStateOut(**_state_to_dict(row)),
    )
