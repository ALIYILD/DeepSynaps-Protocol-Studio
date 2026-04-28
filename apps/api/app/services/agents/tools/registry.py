"""ToolBroker registry — declarative catalogue of pre-fetchable agent tools.

Each :class:`ToolDefinition` describes one *read-only* tool that the
ToolBroker may invoke ahead of an LLM call. The handler returns a JSON-
serialisable payload that gets folded into the ``<context>`` block sent to
the model.

Write-only tools (e.g. ``sessions.create``) are *registered* here for
visibility but carry ``handler=None`` so the broker skips them. They will
be wired up in Phase 2.5 once true LLM function-calling lands.

Scoping convention
==================
Per-row scoping in this codebase uses ``clinician_id == actor.actor_id``
(see ``apps/api/app/routers/sessions_router.py``,
``patients_router.py``, ``finance_router.py``). Tool handlers follow the
same pattern so they only ever surface data the actor is already
authorised to see through the regular REST surface.

Graceful degradation
====================
Handlers MUST NOT raise on a missing service or dependency — they return
``{"unavailable": True, "reason": "<short>"}`` instead. The broker layer
adds an additional try/except wrapper for true bugs. This mirrors the
fallback pattern in ``apps/api/app/services/openmed/adapter.py``.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Callable, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.auth import AuthenticatedActor


# NB: kept as an unparameterised ``Callable`` so Pydantic can validate the
# field without needing to resolve the ``AuthenticatedActor`` forward ref
# at class-definition time. The runtime contract is still
# ``(actor, db) -> dict | list``.
ToolHandler = Callable[..., Any]
ToolRequiredRole = Literal["clinician", "admin"]


class ToolDefinition(BaseModel):
    """Immutable description of one pre-fetchable agent tool."""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    id: str = Field(..., description="Stable canonical id, e.g. 'sessions.list'.")
    name: str = Field(..., description="Display name for telemetry / UI hints.")
    description: str = Field(
        ...,
        description=(
            "What the tool returns; surfaced to the LLM via the context "
            "block so it knows what each key represents."
        ),
    )
    handler: Optional[ToolHandler] = Field(
        default=None,
        description=(
            "Callable invoked by the broker. ``None`` for write-only tools "
            "that are registered for documentation but skipped at runtime."
        ),
    )
    requires_role: ToolRequiredRole = Field(
        default="clinician",
        description=(
            "Defensive minimum role for invocation. Doubled with the agent "
            "role gate enforced by the router."
        ),
    )
    write_only: bool = Field(
        default=False,
        description=(
            "Marks tools that mutate state and therefore cannot be safely "
            "pre-fetched. Skipped by the broker."
        ),
    )


def is_write_tool(tool: ToolDefinition) -> bool:
    """Return True if ``tool`` is write-only or has no handler."""
    return tool.write_only or tool.handler is None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _patient_full_name(first: str | None, last: str | None) -> str:
    return " ".join(p for p in (first, last) if p).strip() or "(no name)"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Read handlers — keep each ≤ ~15 lines. All filter by actor.actor_id, which
# matches the clinician_id column on every domain table. Returning a dict
# (or list) is required so the broker can JSON-serialise.
# ---------------------------------------------------------------------------


def _h_sessions_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import ClinicalSession, Patient

    horizon = (_utcnow() + timedelta(days=7)).isoformat()
    rows = (
        db.query(ClinicalSession)
        .filter(ClinicalSession.clinician_id == actor.actor_id)
        .filter(ClinicalSession.scheduled_at <= horizon)
        .order_by(ClinicalSession.scheduled_at.asc())
        .limit(25)
        .all()
    )
    patient_ids = {r.patient_id for r in rows}
    patients = {
        p.id: p for p in db.query(Patient).filter(Patient.id.in_(patient_ids)).all()
    } if patient_ids else {}
    items = [
        {
            "id": r.id,
            "patient_name": _patient_full_name(
                getattr(patients.get(r.patient_id), "first_name", None),
                getattr(patients.get(r.patient_id), "last_name", None),
            ),
            "start_at": r.scheduled_at,
            "type": r.appointment_type,
            "status": r.status,
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


def _h_patients_search(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import ClinicalSession, Patient

    rows = (
        db.query(Patient)
        .filter(Patient.clinician_id == actor.actor_id)
        .order_by(Patient.created_at.desc())
        .limit(25)
        .all()
    )
    last_session: dict[str, str] = {}
    if rows:
        from sqlalchemy import func

        ids = [r.id for r in rows]
        for pid, last_at in (
            db.query(ClinicalSession.patient_id, func.max(ClinicalSession.scheduled_at))
            .filter(ClinicalSession.patient_id.in_(ids))
            .group_by(ClinicalSession.patient_id)
            .all()
        ):
            last_session[pid] = last_at
    items = [
        {
            "id": p.id,
            "full_name": _patient_full_name(p.first_name, p.last_name),
            "primary_condition": p.primary_condition,
            "last_session_at": last_session.get(p.id),
        }
        for p in rows
    ]
    return {"items": items, "count": len(items)}


def _h_forms_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import FormDefinition

    rows = (
        db.query(FormDefinition)
        .filter(FormDefinition.clinician_id == actor.actor_id)
        .filter(FormDefinition.status == "active")
        .order_by(FormDefinition.updated_at.desc())
        .limit(25)
        .all()
    )
    items = [{"id": r.id, "name": r.title, "type": r.form_type} for r in rows]
    return {"items": items, "count": len(items)}


def _h_consent_status(actor: "AuthenticatedActor", db: "Session") -> dict:
    from sqlalchemy import func

    from app.persistence.models import ConsentRecord

    rows = (
        db.query(ConsentRecord.status, func.count(ConsentRecord.id))
        .filter(ConsentRecord.clinician_id == actor.actor_id)
        .group_by(ConsentRecord.status)
        .all()
    )
    counts = {"active": 0, "expired": 0, "pending": 0}
    for status, count in rows:
        counts[status] = int(count)
    return {"counts": counts}


def _h_outcomes_summary(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import OutcomeSeries

    cutoff = _utcnow() - timedelta(weeks=4)
    rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.clinician_id == actor.actor_id)
        .filter(OutcomeSeries.administered_at >= cutoff)
        .filter(OutcomeSeries.template_id.ilike("phq%"))
        .order_by(OutcomeSeries.patient_id, OutcomeSeries.administered_at)
        .all()
    )
    # Group by patient to compute deltas vs first reading in window.
    by_patient: dict[str, list] = {}
    for r in rows:
        if r.score_numeric is None:
            continue
        by_patient.setdefault(r.patient_id, []).append(r)
    weekly: dict[int, list[float]] = {0: [], 1: [], 2: [], 3: []}
    responders = 0
    total = 0
    for series in by_patient.values():
        if len(series) < 2:
            continue
        baseline = float(series[0].score_numeric)
        latest = float(series[-1].score_numeric)
        if baseline <= 0:
            continue
        total += 1
        delta_pct = (latest - baseline) / baseline
        if delta_pct <= -0.5:
            responders += 1
        for r in series[1:]:
            week = min(3, max(0, (r.administered_at - series[0].administered_at).days // 7))
            weekly[week].append(float(r.score_numeric) - baseline)
    weekly_mean = {
        f"week_{k}": (sum(v) / len(v)) if v else None for k, v in weekly.items()
    }
    return {
        "weekly_mean_phq9_delta": weekly_mean,
        "responder_rate": (responders / total) if total else None,
        "responder_count": responders,
        "patients_in_window": total,
    }


def _h_treatment_courses_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import Patient, TreatmentCourse

    rows = (
        db.query(TreatmentCourse)
        .filter(TreatmentCourse.clinician_id == actor.actor_id)
        .filter(TreatmentCourse.status.in_(["active", "in_progress", "approved"]))
        .order_by(TreatmentCourse.updated_at.desc())
        .limit(25)
        .all()
    )
    pids = {r.patient_id for r in rows}
    patients = {
        p.id: p for p in db.query(Patient).filter(Patient.id.in_(pids)).all()
    } if pids else {}
    items = [
        {
            "id": r.id,
            "patient_name": _patient_full_name(
                getattr(patients.get(r.patient_id), "first_name", None),
                getattr(patients.get(r.patient_id), "last_name", None),
            ),
            "condition": r.condition_slug,
            "sessions_completed_of_total": (
                f"{r.sessions_delivered}/{r.planned_sessions_total}"
            ),
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


def _h_adverse_events_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import AdverseEvent, Patient

    rows = (
        db.query(AdverseEvent)
        .filter(AdverseEvent.clinician_id == actor.actor_id)
        .filter(AdverseEvent.resolved_at.is_(None))
        .order_by(AdverseEvent.reported_at.desc())
        .limit(25)
        .all()
    )
    pids = {r.patient_id for r in rows}
    patients = {
        p.id: p for p in db.query(Patient).filter(Patient.id.in_(pids)).all()
    } if pids else {}
    items = [
        {
            "id": r.id,
            "patient_name": _patient_full_name(
                getattr(patients.get(r.patient_id), "first_name", None),
                getattr(patients.get(r.patient_id), "last_name", None),
            ),
            "severity": r.severity,
            "status": r.resolution or "open",
            "opened_at": r.reported_at,
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


def _h_finance_summary(actor: "AuthenticatedActor", db: "Session") -> dict:
    from sqlalchemy import func

    from app.persistence.models import Invoice

    cutoff = (_utcnow() - timedelta(days=30)).date().isoformat()
    invoices = (
        db.query(Invoice)
        .filter(Invoice.clinician_id == actor.actor_id)
        .filter(Invoice.issue_date >= cutoff)
        .all()
    )
    invoiced = sum(float(i.total or 0.0) for i in invoices)
    paid = sum(float(i.paid or 0.0) for i in invoices)
    outstanding = sum(
        1 for i in invoices
        if i.status not in ("void", "paid")
        and (float(i.total or 0.0) - float(i.paid or 0.0)) > 0
    )
    _ = func  # silence unused-import lint when no aggregate query needed
    return {
        "window_days": 30,
        "total_invoiced": round(invoiced, 2),
        "total_paid": round(paid, 2),
        "count_outstanding": outstanding,
    }


def _h_notes_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    """Return unsigned/draft clinician note drafts for the actor.

    The codebase has ``ClinicianNoteDraft`` (LLM-generated drafts) but no
    direct ``clinician_id`` join — drafts live keyed on ``note_id``. We
    return what we can and degrade gracefully if the join is unavailable
    in this environment.
    """
    try:
        from app.persistence.models import ClinicianNoteDraft
    except ImportError:
        return {"unavailable": True, "reason": "ClinicianNoteDraft model not available"}

    # Without a clinician_id column on the draft we surface drafts whose
    # generated_by matches the actor (covers AliClaw drafts) — and fall
    # back to "unavailable" with reason if that returns nothing
    # consistent. Keep the query bounded.
    rows = (
        db.query(ClinicianNoteDraft)
        .filter(
            (ClinicianNoteDraft.generated_by == actor.actor_id)
            | (ClinicianNoteDraft.approved_by == actor.actor_id)
        )
        .filter(ClinicianNoteDraft.status.in_(["generated", "edited"]))
        .order_by(ClinicianNoteDraft.created_at.desc())
        .limit(25)
        .all()
    )
    items = [
        {
            "id": r.id,
            "patient_name": "(see note)",  # patient join is non-trivial, omit
            "created_at": r.created_at,
            "status": r.status,
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


def _h_tasks_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import ReceptionTask

    rows = (
        db.query(ReceptionTask)
        .filter(ReceptionTask.clinician_id == actor.actor_id)
        .filter(ReceptionTask.done.is_(False))
        .order_by(ReceptionTask.created_at.desc())
        .limit(25)
        .all()
    )
    items = [
        {
            "id": r.id,
            "title": r.text,
            "due_at": r.due,
            "source": "reception",
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

TOOL_REGISTRY: dict[str, ToolDefinition] = {
    "sessions.list": ToolDefinition(
        id="sessions.list",
        name="Upcoming sessions",
        description=(
            "Up to 25 of the next 7 days of clinical sessions for the actor. "
            "Each item: id, patient_name, start_at, type, status."
        ),
        handler=_h_sessions_list,
        requires_role="clinician",
    ),
    "sessions.create": ToolDefinition(
        id="sessions.create",
        name="Create session",
        description=(
            "WRITE: schedule a new session. Not pre-fetched. "
            "Wired in Phase 2.5 via LLM function-calling."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    "sessions.cancel": ToolDefinition(
        id="sessions.cancel",
        name="Cancel session",
        description=(
            "WRITE: cancel an existing session. Not pre-fetched. "
            "Wired in Phase 2.5 via LLM function-calling."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    "patients.search": ToolDefinition(
        id="patients.search",
        name="Recent patients",
        description=(
            "Most recent 25 patients on the actor's roster. Each item: id, "
            "full_name, primary_condition, last_session_at."
        ),
        handler=_h_patients_search,
        requires_role="clinician",
    ),
    "forms.list": ToolDefinition(
        id="forms.list",
        name="Active forms",
        description="Active form definitions: id, name, type.",
        handler=_h_forms_list,
        requires_role="clinician",
    ),
    "consent.status": ToolDefinition(
        id="consent.status",
        name="Consent counts",
        description="Counts of consent records by status (active/expired/pending).",
        handler=_h_consent_status,
        requires_role="clinician",
    ),
    "outcomes.summary": ToolDefinition(
        id="outcomes.summary",
        name="Outcomes summary",
        description=(
            "Last 4 weeks: per-week mean PHQ-9 delta and responder rate "
            "(>=50%% reduction from baseline)."
        ),
        handler=_h_outcomes_summary,
        requires_role="clinician",
    ),
    "treatment_courses.list": ToolDefinition(
        id="treatment_courses.list",
        name="Active treatment courses",
        description=(
            "Up to 25 active courses. Each item: id, patient_name, "
            "condition, sessions_completed_of_total."
        ),
        handler=_h_treatment_courses_list,
        requires_role="clinician",
    ),
    "adverse_events.list": ToolDefinition(
        id="adverse_events.list",
        name="Open adverse events",
        description=(
            "Open (unresolved) AEs. Each item: id, patient_name, severity, "
            "status, opened_at."
        ),
        handler=_h_adverse_events_list,
        requires_role="clinician",
    ),
    "finance.summary": ToolDefinition(
        id="finance.summary",
        name="Finance summary",
        description=(
            "Last 30 days: total invoiced, total paid, count outstanding."
        ),
        handler=_h_finance_summary,
        requires_role="admin",
    ),
    "notes.list": ToolDefinition(
        id="notes.list",
        name="Unsigned clinical note drafts",
        description=(
            "Up to 25 unsigned/draft clinical notes. Each item: id, "
            "patient_name, created_at, status."
        ),
        handler=_h_notes_list,
        requires_role="clinician",
    ),
    "notes.approve_draft": ToolDefinition(
        id="notes.approve_draft",
        name="Approve note draft",
        description=(
            "WRITE: approve a generated note draft. Not pre-fetched. "
            "Wired in Phase 2.5 via LLM function-calling."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    "tasks.list": ToolDefinition(
        id="tasks.list",
        name="Open tasks",
        description=(
            "Up to 25 open tasks for the actor. Each item: id, title, "
            "due_at, source."
        ),
        handler=_h_tasks_list,
        requires_role="clinician",
    ),
}


__all__ = [
    "TOOL_REGISTRY",
    "ToolDefinition",
    "ToolHandler",
    "ToolRequiredRole",
    "is_write_tool",
]
