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
from typing import TYPE_CHECKING, Any, Literal, Protocol

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
# sessions.cancel
# ---------------------------------------------------------------------------


class SessionsCancelArgs(BaseModel):
    """Args schema for the ``sessions.cancel`` write tool.

    Mirrors the cancel-status transition the existing sessions PATCH
    endpoint allows. ``reason`` is optional free text persisted into
    ``cancel_reason`` for the audit trail.
    """

    session_id: str = Field(..., min_length=1, max_length=64)
    reason: str = Field(default="", max_length=500)


# Statuses from which we refuse to cancel (terminal / already gone).
# Mirrors the absence of "cancelled"/"completed"/"no_show" on the LHS
# of VALID_TRANSITIONS in sessions_router.py.
_NON_CANCELLABLE_STATUSES = {"cancelled", "completed", "no_show"}


def _h_sessions_cancel(
    actor: "AuthenticatedActor", db: "Session", args: BaseModel
) -> dict:
    """Cancel a ``ClinicalSession`` after clinician confirmation.

    The session must belong to a patient owned by ``actor`` (per the
    same per-clinician scoping the REST endpoints enforce). Already-
    terminal sessions are refused with a clear message rather than
    silently no-op'd.
    """
    assert isinstance(args, SessionsCancelArgs)
    from app.persistence.models import ClinicalSession, Patient

    record = (
        db.query(ClinicalSession)
        .filter(ClinicalSession.id == args.session_id)
        .first()
    )
    if record is None:
        return {
            "ok": False,
            "result": f"Session {args.session_id} not found.",
        }

    # Cross-clinic patient binding — the patient must be owned by this
    # clinician. We refuse with the same shape as the create handler
    # rather than leaking whether a row exists.
    patient = (
        db.query(Patient)
        .filter(Patient.id == record.patient_id)
        .filter(Patient.clinician_id == actor.actor_id)
        .first()
    )
    if patient is None:
        return {
            "ok": False,
            "result": (
                "Session not found in this clinic — refusing to cancel "
                "across clinics."
            ),
        }

    if record.status in _NON_CANCELLABLE_STATUSES:
        return {
            "ok": False,
            "result": (
                f"Session is not active (status: {record.status})."
            ),
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    record.status = "cancelled"
    record.cancelled_at = now_iso
    if args.reason:
        record.cancel_reason = args.reason
    db.commit()

    return {
        "ok": True,
        "result": f"Cancelled session {args.session_id}.",
        "audit_extra": {
            "session_id": args.session_id,
            "reason": args.reason,
        },
    }


# ---------------------------------------------------------------------------
# notes.approve_draft
# ---------------------------------------------------------------------------


class NotesApproveDraftArgs(BaseModel):
    """Args schema for the ``notes.approve_draft`` write tool.

    ``edits`` is optional free text that, when provided, replaces the
    draft's primary editable surface (``session_note``) before the
    approval flips. Mirrors the ``soap_note`` field on the REST
    endpoint's ``ApproveDraftRequest`` body — kept generic here so the
    LLM doesn't need to learn the SOAP terminology.
    """

    draft_id: str = Field(..., min_length=1, max_length=64)
    edits: str = Field(default="", max_length=10_000)


def _h_notes_approve_draft(
    actor: "AuthenticatedActor", db: "Session", args: BaseModel
) -> dict:
    """Approve a clinician note draft after clinician confirmation.

    Constraints:
    * Parent ``ClinicianMediaNote`` must exist.
    * The note's patient must belong to the actor's clinic (via the
      per-clinician ownership chain ``Patient.clinician_id``).
    * Only the note's original clinician may approve through the
      agent — even other clinicians at the same clinic must use the
      regular review surface so we don't accidentally let the agent
      become a backdoor authorisation for a colleague's draft.
    * Already-approved drafts are refused (idempotency-explicit).
    """
    assert isinstance(args, NotesApproveDraftArgs)
    from app.persistence.models import (
        ClinicianMediaNote,
        ClinicianNoteDraft,
        Patient,
    )

    draft = (
        db.query(ClinicianNoteDraft)
        .filter(ClinicianNoteDraft.id == args.draft_id)
        .first()
    )
    if draft is None:
        return {
            "ok": False,
            "result": f"Draft {args.draft_id} not found.",
        }

    note = (
        db.query(ClinicianMediaNote)
        .filter(ClinicianMediaNote.id == draft.note_id)
        .first()
    )
    if note is None:
        return {
            "ok": False,
            "result": "Parent clinician note not found.",
        }

    # Cross-clinic patient binding.
    patient = (
        db.query(Patient)
        .filter(Patient.id == note.patient_id)
        .filter(Patient.clinician_id == actor.actor_id)
        .first()
    )
    if patient is None:
        return {
            "ok": False,
            "result": (
                "Note not found in this clinic — refusing to approve "
                "across clinics."
            ),
        }

    # Only the note's original clinician may approve via the agent.
    if note.clinician_id != actor.actor_id:
        return {
            "ok": False,
            "result": (
                "Only the original clinician on this note may approve "
                "the draft via the agent."
            ),
        }

    if draft.status == "approved":
        return {
            "ok": False,
            "result": "Draft is already approved.",
        }

    if args.edits:
        draft.session_note = args.edits
    draft.status = "approved"
    draft.approved_by = actor.actor_id
    draft.approved_at = datetime.now(timezone.utc)
    # Mirror the REST flow's terminal status flip on the parent note.
    note.status = "finalized"
    db.commit()

    return {
        "ok": True,
        "result": f"Approved draft {args.draft_id}.",
        "audit_extra": {
            "draft_id": args.draft_id,
            "note_id": draft.note_id,
        },
    }


# ---------------------------------------------------------------------------
# tasks.create
# ---------------------------------------------------------------------------


class TasksCreateArgs(BaseModel):
    """Args schema for the ``tasks.create`` write tool.

    The Reception Agent uses this to enqueue follow-ups in the clinic
    queue ("remind clinician to call patient at 3pm"). Patient binding
    is optional — agents may want to create generic admin reminders
    that aren't tied to a specific patient row.
    """

    title: str = Field(..., min_length=1, max_length=200)
    patient_id: str | None = Field(
        default=None,
        description="Optional. Bind task to a specific patient.",
    )
    due_at: datetime | None = Field(
        default=None,
        description="Optional ISO-8601 UTC.",
    )
    notes: str = Field(default="", max_length=1000)
    category: Literal["follow_up", "outreach", "admin", "review"] = "admin"

    @field_validator("due_at")
    @classmethod
    def _ensure_utc(cls, v: datetime | None) -> datetime | None:
        """Force UTC. Naive datetimes are assumed UTC (LLM ISO often omits TZ)."""
        if v is None:
            return v
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)


def _h_tasks_create(
    actor: "AuthenticatedActor", db: "Session", args: BaseModel
) -> dict:
    """Insert a new ``ReceptionTask`` row after clinician confirmation.

    Constraints:
    * If ``patient_id`` is set, the patient must be in the actor's
      clinic — same per-clinician scoping the rest of the dispatcher
      enforces.
    * If ``due_at`` is set, it must be in the future.

    The persisted ``ReceptionTask`` row is intentionally simple (the
    model only carries ``text`` / ``due`` / ``done`` / ``priority`` —
    no native ``patient_id`` / ``category`` / ``notes`` columns); the
    agent's richer args are folded into the ``text`` body so the same
    row can be surfaced through ``tasks.list`` and the existing
    ``GET /api/v1/reception/tasks`` REST endpoint.
    """
    assert isinstance(args, TasksCreateArgs)
    from app.persistence.models import Patient, ReceptionTask

    # ---- Optional patient binding -------------------------------------
    if args.patient_id is not None:
        patient = (
            db.query(Patient)
            .filter(Patient.id == args.patient_id)
            .filter(Patient.clinician_id == actor.actor_id)
            .first()
        )
        if patient is None:
            return {
                "ok": False,
                "result": "Patient not found or not in your clinic.",
            }

    # ---- Optional due_at must be in the future ------------------------
    if args.due_at is not None:
        if args.due_at < datetime.now(timezone.utc):
            return {
                "ok": False,
                "result": "due_at must be in the future.",
            }

    # ---- Compose the text body ----------------------------------------
    # ReceptionTask only carries `text` / `due` / `priority` — encode the
    # richer agent args into the text so they don't disappear on read.
    parts = [f"[{args.category}]", args.title.strip()]
    if args.patient_id:
        parts.append(f"(patient: {args.patient_id})")
    text_body = " ".join(parts)
    if args.notes:
        text_body = f"{text_body}\n\n{args.notes}"
    text_body = text_body[:500]  # ReceptionTask.text is String(500)

    due_iso = args.due_at.isoformat() if args.due_at is not None else None

    record = ReceptionTask(
        clinician_id=actor.actor_id,
        text=text_body,
        due=due_iso,
        done=False,
        priority="medium",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "ok": True,
        "result": f"Task '{args.title[:60]}' created.",
        "audit_extra": {
            "task_id": record.id,
            "patient_id": args.patient_id,
        },
    }


def _guard_patient_scope(
    actor: "AuthenticatedActor", db: "Session", patient_id: str
) -> dict | None:
    from app.auth import require_patient_owner
    from app.repositories.patients import resolve_patient_clinic_id

    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        return {"ok": False, "result": "Patient not found."}
    try:
        require_patient_owner(actor, clinic_id)
    except Exception:
        return {"ok": False, "result": "Patient not found or not in your clinic."}
    return None


class EvidenceDraftReportCitationsArgs(BaseModel):
    patient_id: str = Field(..., min_length=1, max_length=64)
    finding_ids: list[str] = Field(default_factory=list)
    include_saved: bool = True
    max_results_per_finding: int = Field(default=5, ge=1, le=10)
    context_kind: str | None = Field(default=None, max_length=64)
    analysis_id: str | None = Field(default=None, max_length=64)
    report_id: str | None = Field(default=None, max_length=64)


def _h_evidence_draft_report_citations(
    actor: "AuthenticatedActor", db: "Session", args: BaseModel
) -> dict:
    assert isinstance(args, EvidenceDraftReportCitationsArgs)
    blocked = _guard_patient_scope(actor, db, args.patient_id)
    if blocked is not None:
        return blocked

    from app.services.evidence_intelligence import (
        ReportPayloadRequest,
        build_report_payload,
    )

    payload = build_report_payload(
        ReportPayloadRequest(
            patient_id=args.patient_id,
            finding_ids=list(args.finding_ids),
            include_saved=args.include_saved,
            max_results_per_finding=args.max_results_per_finding,
            context_kind=args.context_kind,
            analysis_id=args.analysis_id,
            report_id=args.report_id,
        ),
        db,
    )
    citation_count = len(payload.get("citations", []))
    return {
        "ok": True,
        "result": {
            "status": "draft_ready_for_clinician_review",
            "patient_id": args.patient_id,
            "citation_count": citation_count,
            "finding_count": len(payload.get("findings", [])),
            "payload": payload,
        },
        "audit_extra": {
            "patient_id": args.patient_id,
            "citation_count": citation_count,
        },
    }


class EvidenceSaveCitationRequestArgs(BaseModel):
    patient_id: str = Field(..., min_length=1, max_length=64)
    finding_id: str = Field(..., min_length=1, max_length=128)
    finding_label: str = Field(..., min_length=1, max_length=255)
    claim: str = Field(..., min_length=1, max_length=4000)
    paper_id: str = Field(..., min_length=1, max_length=64)
    paper_title: str = Field(..., min_length=1, max_length=4000)
    pmid: str | None = Field(default=None, max_length=60)
    doi: str | None = Field(default=None, max_length=255)
    context_kind: str | None = Field(default=None, max_length=32)
    analysis_id: str | None = Field(default=None, max_length=64)
    report_id: str | None = Field(default=None, max_length=64)
    citation_payload: dict[str, Any] = Field(default_factory=dict)


def _h_evidence_save_citation_request(
    actor: "AuthenticatedActor", db: "Session", args: BaseModel
) -> dict:
    assert isinstance(args, EvidenceSaveCitationRequestArgs)
    blocked = _guard_patient_scope(actor, db, args.patient_id)
    if blocked is not None:
        return blocked

    from app.services.evidence_intelligence import SaveCitationRequest, save_citation

    arg_payload = args.model_dump()
    merged_payload = dict(arg_payload.get("citation_payload") or {})
    merged_payload.setdefault("approval_status", "pending_clinician_review")
    merged_payload.setdefault("approval_required", True)
    merged_payload.setdefault("requested_via", "agent_tool")
    arg_payload["citation_payload"] = merged_payload

    record = save_citation(
        SaveCitationRequest(**arg_payload),
        actor.actor_id,
        db,
    )
    return {
        "ok": True,
        "result": {
            "status": "saved_for_clinician_review",
            "record": record,
        },
        "audit_extra": {
            "patient_id": args.patient_id,
            "paper_id": args.paper_id,
            "finding_id": args.finding_id,
        },
    }


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


WRITE_HANDLERS: dict[str, tuple[type[BaseModel], ToolWriteHandler]] = {
    "sessions.create": (SessionsCreateArgs, _h_sessions_create),
    "sessions.cancel": (SessionsCancelArgs, _h_sessions_cancel),
    "notes.approve_draft": (NotesApproveDraftArgs, _h_notes_approve_draft),
    "tasks.create": (TasksCreateArgs, _h_tasks_create),
    "evidence.draft_report_citations": (
        EvidenceDraftReportCitationsArgs,
        _h_evidence_draft_report_citations,
    ),
    "evidence.save_citation_request": (
        EvidenceSaveCitationRequestArgs,
        _h_evidence_save_citation_request,
    ),
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
    "TasksCreateArgs",
    "ToolWriteHandler",
    "UnknownTool",
    "WRITE_HANDLERS",
    "execute",
]
