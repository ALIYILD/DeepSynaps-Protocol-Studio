"""Tool dispatcher — executes confirmed agent write actions.

The dispatcher is intentionally **separate** from
:mod:`app.services.agents.tools.registry` (which catalogues *read* tools
for the broker pre-fetch path). Write handlers are wired up by hand here,
each behind its own Pydantic args schema, so the LLM cannot smuggle
unexpected fields through and so each handler is reviewable in isolation.

Flow
----
1. The runner parses the LLM's JSON request.
2. Returns a "pending tool call" envelope to the clinician.
3. On clinician approval, the agents router calls
   :func:`execute(tool_id, args, actor, db)` here.
4. We validate args via the per-tool Pydantic schema, then invoke the
   registered handler. Handler exceptions are caught and surfaced as
   ``{ok: False, result: "<error>"}`` so the runner's audit row is
   always well-shaped.

Adding a new write tool
-----------------------
1. Define a Pydantic ``Args`` model.
2. Implement a ``handler(actor, db, args) -> dict`` returning
   ``{ok, result, audit_extra?}``.
3. Register the pair in :data:`WRITE_HANDLERS`.

The dispatcher does NOT consult ``TOOL_REGISTRY`` — write tools live
here. The read-side registry's stub entries (``handler=None``,
``write_only=True``) are kept for marketplace documentation and for the
agent's tool-allowlist gate the runner enforces.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Callable, Literal, Protocol

from pydantic import BaseModel, Field, ValidationError, field_validator

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.auth import AuthenticatedActor

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class UnknownTool(Exception):
    """Raised when ``execute`` is called with a tool id we do not handle."""


class InvalidArgs(Exception):
    """Raised when the LLM's args fail Pydantic validation for the tool."""

    def __init__(self, tool_id: str, errors: list[dict[str, Any]]):
        super().__init__(f"Invalid args for tool {tool_id!r}: {errors}")
        self.tool_id = tool_id
        self.errors = errors


# ---------------------------------------------------------------------------
# Handler contract
# ---------------------------------------------------------------------------


class ToolWriteHandler(Protocol):
    """Callable signature every write handler must implement."""

    def __call__(
        self,
        actor: "AuthenticatedActor",
        db: "Session",
        args: BaseModel,
    ) -> dict: ...


# ---------------------------------------------------------------------------
# sessions.create
# ---------------------------------------------------------------------------


class SessionsCreateArgs(BaseModel):
    """Args schema for the ``sessions.create`` write tool.

    Mirrors the constraints the existing ``POST /api/v1/sessions``
    endpoint enforces (15-240 minute slot, type ladder) but uses a
    typed ``datetime`` for ``starts_at`` so the LLM's JSON cannot
    smuggle a free-form string past the dispatcher.
    """

    patient_id: str = Field(..., min_length=1, max_length=64)
    starts_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=240)
    type: Literal["session", "intake", "consult"] = "session"
    notes: str = Field(default="", max_length=500)

    @field_validator("starts_at")
    @classmethod
    def _ensure_utc(cls, v: datetime) -> datetime:
        """Force UTC. Naive datetimes are assumed UTC (LLM ISO often omits TZ)."""
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)


def _appointment_type_for(tool_type: str) -> str:
    """Translate the dispatcher's ``type`` enum to the DB's appointment_type.

    The DB column accepts a wider vocabulary (see VALID_APPOINTMENT_TYPES
    in ``sessions_router.py``); the dispatcher's enum is a deliberately
    narrow LLM-facing surface.
    """
    return {
        "session": "session",
        "intake": "new_patient",
        "consult": "consultation",
    }.get(tool_type, "session")


def _h_sessions_create(
    actor: "AuthenticatedActor", db: "Session", args: BaseModel
) -> dict:
    """Create a new ``ClinicalSession`` row after clinician confirmation.

    Validates that the patient belongs to the actor's clinic and that
    the requested slot does not collide with another session for the
    same patient OR the same clinician.
    """
    assert isinstance(args, SessionsCreateArgs)
    from app.persistence.models import ClinicalSession, Patient

    # ---- Patient ownership ---------------------------------------------
    # Mirror the `sessions_router.create_session_endpoint` check: the
    # patient must be owned by *this* clinician. We don't fall back to
    # an admin bypass — write actions go through the same lane as the
    # REST endpoint.
    patient = (
        db.query(Patient)
        .filter(Patient.id == args.patient_id)
        .filter(Patient.clinician_id == actor.actor_id)
        .first()
    )
    if patient is None:
        return {
            "ok": False,
            "result": (
                "Patient not found in this clinic — refusing to book "
                "across clinics."
            ),
        }

    # ---- Conflict check ------------------------------------------------
    # String-based ISO comparison matches how the sessions repo handles
    # it on SQLite. We compare in UTC.
    new_start = args.starts_at
    new_end = _add_minutes(new_start, args.duration_minutes)

    existing = (
        db.query(ClinicalSession)
        .filter(
            (ClinicalSession.patient_id == args.patient_id)
            | (ClinicalSession.clinician_id == actor.actor_id)
        )
        .filter(ClinicalSession.status.notin_(["cancelled", "no_show"]))
        .all()
    )
    for row in existing:
        try:
            row_start = _parse_iso(row.scheduled_at)
        except ValueError:
            continue
        row_end = _add_minutes(row_start, row.duration_minutes or 60)
        if row_start < new_end and row_end > new_start:
            return {
                "ok": False,
                "result": "Time slot has a conflict — please pick another.",
            }

    # ---- Insert --------------------------------------------------------
    record = ClinicalSession(
        patient_id=args.patient_id,
        clinician_id=actor.actor_id,
        scheduled_at=new_start.isoformat(),
        duration_minutes=args.duration_minutes,
        appointment_type=_appointment_type_for(args.type),
        status="scheduled",
        session_notes=args.notes or None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "ok": True,
        "result": (
            f"Booked: {args.patient_id} on {new_start.isoformat()} "
            f"({args.duration_minutes}m)"
        ),
        "audit_extra": {"session_id": record.id},
    }


# ---------------------------------------------------------------------------
# sessions.cancel + notes.approve_draft — registered stubs
# ---------------------------------------------------------------------------


class SessionsCancelArgs(BaseModel):
    """Args schema for the ``sessions.cancel`` stub.

    Schema is permissive on purpose — the handler returns
    ``not_yet_implemented`` regardless, but keeping a schema present
    means the dispatcher's validation lane never short-circuits and
    every tool follows the same shape.
    """

    session_id: str = Field(..., min_length=1, max_length=64)
    reason: str = Field(default="", max_length=500)


class NotesApproveDraftArgs(BaseModel):
    """Args schema for the ``notes.approve_draft`` stub."""

    draft_id: str = Field(..., min_length=1, max_length=64)


def _h_not_implemented(
    actor: "AuthenticatedActor", db: "Session", args: BaseModel
) -> dict:
    """Stub used by registered-but-not-built write tools."""
    _ = actor, db, args  # quiet linters — these stubs intentionally do nothing
    return {
        "ok": False,
        "result": "Tool not yet implemented in this build.",
    }


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


WRITE_HANDLERS: dict[str, tuple[type[BaseModel], ToolWriteHandler]] = {
    "sessions.create": (SessionsCreateArgs, _h_sessions_create),
    "sessions.cancel": (SessionsCancelArgs, _h_not_implemented),
    "notes.approve_draft": (NotesApproveDraftArgs, _h_not_implemented),
}


def execute(
    tool_id: str,
    args: dict[str, Any],
    actor: "AuthenticatedActor",
    db: "Session",
) -> dict:
    """Validate and execute a confirmed write tool call.

    Returns
    -------
    dict
        ``{ok: bool, result: str | dict, audit_extra?: dict}``.

    Raises
    ------
    UnknownTool
        ``tool_id`` is not registered in :data:`WRITE_HANDLERS`.
    InvalidArgs
        ``args`` failed Pydantic validation for the tool.

    Inner handler exceptions (DB errors, etc.) are caught and folded
    into the return envelope as ``{ok: False, result: "<error>"}`` so
    the audit row is always well-shaped.
    """
    pair = WRITE_HANDLERS.get(tool_id)
    if pair is None:
        raise UnknownTool(tool_id)
    schema_cls, handler = pair
    try:
        validated = schema_cls.model_validate(args)
    except ValidationError as ve:
        # Surface the per-field errors so the caller can render them.
        raise InvalidArgs(tool_id, ve.errors()) from ve

    try:
        result = handler(actor, db, validated)
    except Exception as exc:  # noqa: BLE001 — fail-safe envelope
        logger.warning(
            "agent_tool_handler_failed",
            extra={
                "event": "agent_tool_handler_failed",
                "tool_id": tool_id,
                "error_type": type(exc).__name__,
                "error_message": str(exc)[:200],
            },
        )
        try:
            db.rollback()
        except Exception:  # noqa: BLE001 — best effort
            pass
        return {"ok": False, "result": f"Tool execution failed: {exc!s}"[:300]}

    # Defensive normalisation — every handler MUST return ok+result, but
    # a buggy handler should not crash the audit pipeline.
    if not isinstance(result, dict) or "ok" not in result or "result" not in result:
        return {
            "ok": False,
            "result": "Tool returned an unrecognised payload shape.",
        }
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_iso(value: str) -> datetime:
    """Parse an ISO-8601 string to a tz-aware UTC datetime.

    The DB stores ``scheduled_at`` as a string column for SQLite parity.
    We tolerate both the trailing ``Z`` form and explicit offsets.
    """
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _add_minutes(when: datetime, minutes: int) -> datetime:
    from datetime import timedelta

    return when + timedelta(minutes=int(minutes or 0))


__all__ = [
    "InvalidArgs",
    "NotesApproveDraftArgs",
    "SessionsCancelArgs",
    "SessionsCreateArgs",
    "ToolWriteHandler",
    "UnknownTool",
    "WRITE_HANDLERS",
    "execute",
]
