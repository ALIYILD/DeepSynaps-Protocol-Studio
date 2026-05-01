"""Clinician Inbox / Notifications Hub launch-audit (2026-05-01).

Top-of-day workflow surface for clinicians. Aggregates the HIGH-priority
clinician-visible mirror audit rows emitted by every patient-facing
launch audit so they triage in priority order from a single inbox:

* Patient Messages #347 → ``patient_messages.urgent_flag_to_clinician``
* Patient Adherence Events #350 → ``adherence_events.side_effect_to_clinician`` /
  ``adherence_events.escalated_to_clinician_mirror``
* Patient Home Program Tasks #351 → ``home_program_tasks.task_help_urgent_to_clinician``
* Patient Wearables #352 → ``wearables.observation_anomaly_to_clinician``
* Wearables Workbench #353 → ``wearables_workbench.flag_escalated``

The Wearables Workbench launch audit (#353) flagged that these rows land
in the underlying audit table but had no workflow-friendly clinician
inbox surfacing them. Without it, HIGH-priority signals were getting
lost in the regulator-shaped audit trail page.

Endpoints
---------
GET    /api/v1/clinician-inbox/items                List aggregated audit rows scoped to actor.clinic_id (filters)
GET    /api/v1/clinician-inbox/summary              Counts: HIGH-priority unread / 24h / 7d / by surface
GET    /api/v1/clinician-inbox/items/{event_id}     Single audit-row detail; 404 if cross-clinic
POST   /api/v1/clinician-inbox/items/{event_id}/acknowledge   Note required; emits ``clinician_inbox.item_acknowledged`` audit
POST   /api/v1/clinician-inbox/items/bulk-acknowledge          Note required; processes list, partial failures reported
GET    /api/v1/clinician-inbox/export.csv           DEMO-prefixed when any item is demo
POST   /api/v1/clinician-inbox/audit-events         Page-level audit (target_type=clinician_inbox)

Aggregation strategy
--------------------
DOES NOT WRITE NEW DATA TABLES. Reads ``audit_events`` directly. A row
qualifies as HIGH-priority inbox content when ANY of the following is
true (deterministic, no AI fabrication):

* ``note`` contains the substring ``priority=high`` (the canonical
  marker stamped by adherence_events / wearables / home_program_tasks /
  wearables_workbench), OR
* ``action`` ends in ``_to_clinician`` or ``_to_clinician_mirror`` (the
  bidirectional-mirror naming convention used by every patient surface
  that emits a clinician-visible row), OR
* ``action`` is in :data:`ALWAYS_HIGH_ACTIONS` (a small explicit set
  for surfaces that don't follow the naming convention but are still
  clinic-safety critical, e.g. ``wearables_workbench.flag_escalated``).

This is exactly the rule the dashboard widget would use, except the
widget shows a single count and the inbox surfaces the rows.

Acknowledgement persistence
---------------------------
Acknowledgement state is stored as ANOTHER audit row keyed
``target_type='clinician_inbox'``, ``action='clinician_inbox.item_acknowledged'``,
``target_id=audit-{event_id}``. NO new schema (no Alembic migration).
This is the simpler of the two options outlined in the implementation
brief and keeps the regulator audit transcript single-sourced. The
trade-off is documented in PR section F: an acknowledged item stays in
the underlying ``audit_events`` table forever, but the inbox computes
"is_acknowledged" by left-joining the acknowledgement events at read
time. Idempotent: a second acknowledge is allowed (returns 200 + the
existing acknowledgement event_id), so the second clinician's note can
still be regulator-visible if needed.

Cross-clinic
------------
Non-admin clinicians see only audit rows where the ``actor_id`` belongs
to a user in their clinic — i.e. only rows authored by people at their
clinic OR clinician-mirror rows whose ``actor_id`` is themselves. This
mirrors the audit trail's actor-scoped pattern (audit_events has no
clinic_id column today; we never silently rewrite history).

Demo honesty
------------
Demo rows are flagged via ``note.startswith('DEMO')`` or ``'; DEMO'``
substring (mirror of ``audit_trail_router._is_demo_row``). Exports prefix
``DEMO-`` when any included item is demo.
"""
from __future__ import annotations

import csv
import io
import logging
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AuditEventRecord, Patient, User


router = APIRouter(prefix="/api/v1/clinician-inbox", tags=["Clinician Inbox"])
_log = logging.getLogger(__name__)


# Honest disclaimers always rendered on the page so reviewers know what
# the inbox aggregates and what the regulator can replay.
INBOX_DISCLAIMERS = [
    "Clinician Inbox aggregates HIGH-priority clinician-visible mirror rows "
    "emitted by every patient-facing launch audit (Patient Messages, Adherence "
    "Events, Home Program Tasks, Patient Wearables, Wearables Workbench). It "
    "is a workflow surface; it does not write new clinical data.",
    "Acknowledgements are stored as their own audit rows (target_type="
    "clinician_inbox, action=clinician_inbox.item_acknowledged) so the "
    "regulator audit transcript stays single-sourced.",
    "Cross-clinic rows are hidden from non-admin clinicians. Admins see all "
    "clinics so they can supervise multi-clinic deployments.",
    "Demo rows are clearly labelled and exports are DEMO-prefixed. They are "
    "not regulator-submittable.",
]


# Surfaces an inbox row may originate from. Read by the filter contract +
# the surface-chip UI. Order is the canonical priority drill-out order.
INBOX_SURFACE_CATEGORIES = (
    "patient_messages",
    "adherence_events",
    "home_program_tasks",
    "wearables",
    "wearables_workbench",
    "adverse_events_hub",
    "quality_assurance",
    "course_detail",
    "patient_profile",
)


# Actions that are always HIGH-priority even when the note doesn't carry
# the canonical ``priority=high`` marker. Keep this list small: every entry
# is a deliberate clinic-safety signal.
ALWAYS_HIGH_ACTIONS = frozenset({
    "wearables_workbench.flag_escalated",
})


_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


# Drill-out URL routes — kept as a single source of truth so the front-end
# can keep its drill-out wiring honest.
SURFACE_DRILL_OUT_PAGE = {
    "patient_messages": "patient-messages",
    "adherence_events": "adherence-events",
    "home_program_tasks": "home-program-tasks",
    "wearables": "patient-wearables",
    "wearables_workbench": "monitor",  # tab=wearables-workbench
    "adverse_events_hub": "adverse-events-hub",
    "quality_assurance": "quality-assurance",
    "course_detail": "course-detail",
    "patient_profile": "patient-profile",
}


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_role(actor: AuthenticatedActor) -> None:
    """Allow clinician+ (clinician, admin, supervisor, reviewer, regulator)."""
    require_minimum_role(
        actor,
        "clinician",
        warnings=[
            "Clinician Inbox is restricted to clinical staff.",
        ],
    )


def _is_admin_scope(actor: AuthenticatedActor) -> bool:
    return actor.role in ("admin", "supervisor", "regulator")


def _is_demo_row(record: AuditEventRecord) -> bool:
    """Mirror of ``audit_trail_router._is_demo_row``."""
    note = (record.note or "").upper()
    return note.startswith("DEMO") or "; DEMO" in note


def _split_action(action: str) -> tuple[str, str]:
    """Return ``(surface, event_type)`` for an action like ``surface.event``."""
    s = (action or "").strip()
    if "." in s:
        prefix, _, suffix = s.partition(".")
        return prefix or "unknown", suffix or s
    return "unknown", s


def _row_is_high_priority(record: AuditEventRecord) -> bool:
    """Deterministic HIGH-priority predicate.

    A row qualifies when ANY of:
      * note contains ``priority=high`` (canonical marker), or
      * action ends in ``_to_clinician`` / ``_to_clinician_mirror``
        (bidirectional-mirror naming), or
      * action is in :data:`ALWAYS_HIGH_ACTIONS`.

    No AI scoring; if the predicate ever needs to grow, it grows here in
    one place and the test pins it.
    """
    note = (record.note or "").lower()
    action = (record.action or "").strip()
    if "priority=high" in note:
        return True
    if action in ALWAYS_HIGH_ACTIONS:
        return True
    if action.endswith("_to_clinician") or action.endswith("_to_clinician_mirror"):
        return True
    return False


_PATIENT_ID_RE = re.compile(r"patient=([a-zA-Z0-9_\-]+)")
_PATIENT_PREFIXED_TARGET_RE = re.compile(r"^patient[_-]")


def _extract_patient_id(record: AuditEventRecord) -> Optional[str]:
    """Best-effort patient id extraction from the audit row.

    The mirror rows tend to put the patient id one of three ways:
      1. ``target_id`` IS the patient id (most patient surfaces).
      2. ``note`` contains ``patient=<id>`` (mirror rows that target the
         clinician_id but reference the patient in the note).
      3. ``target_id`` is a surface-specific row id (flag id, message id).
         In that case we fall back to the note grep.

    Returns ``None`` when no patient id can be reasonably extracted, in
    which case the inbox groups the row under "unassigned".
    """
    target = (record.target_id or "").strip()
    if target.startswith("patient-") or _PATIENT_PREFIXED_TARGET_RE.match(target):
        return target
    note = record.note or ""
    m = _PATIENT_ID_RE.search(note)
    if m:
        return m.group(1)
    return None


def _scope_actor_ids(db: Session, actor: AuthenticatedActor) -> Optional[set[str]]:
    """Return the set of actor ids visible at the actor's clinic.

    Admins / supervisors / regulators see everything (returns ``None`` to
    signal "no actor restriction"). Clinicians see audit rows authored by
    users in their clinic, plus rows where they are the recipient (their
    own actor id may appear as ``target_id`` for to-clinician mirror rows
    that stamped the recipient).
    """
    if _is_admin_scope(actor):
        return None
    if not actor.clinic_id:
        # Match-nothing fallback — defensive, mirrors the
        # wearables_workbench_router._scope_query pattern.
        return set()
    actor_ids = {
        u.id for u in db.query(User).filter(User.clinic_id == actor.clinic_id).all()
    }
    actor_ids.add(actor.actor_id)
    return actor_ids


def _patient_lookup(db: Session, patient_ids: set[str]) -> dict[str, dict]:
    """Bulk-load patient name + demo flag for the rows we're about to render."""
    if not patient_ids:
        return {}
    patients = db.query(Patient).filter(Patient.id.in_(patient_ids)).all()
    out: dict[str, dict] = {}
    user_clinic_cache: dict[str, str] = {}
    for p in patients:
        notes = p.notes or ""
        is_demo = notes.startswith("[DEMO]")
        if not is_demo and p.clinician_id:
            clinic_id = user_clinic_cache.get(p.clinician_id)
            if clinic_id is None:
                u = db.query(User).filter_by(id=p.clinician_id).first()
                clinic_id = u.clinic_id if u is not None else ""
                user_clinic_cache[p.clinician_id] = clinic_id
            if clinic_id in _DEMO_CLINIC_IDS:
                is_demo = True
        first = (p.first_name or "").strip()
        last = (p.last_name or "").strip()
        label = (f"{first} {last}".strip()) or p.id
        out[p.id] = {"name": label, "is_demo": is_demo}
    return out


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the ``clinician_inbox`` surface.

    Never raises — audit must not block the UI even when the umbrella
    audit table is unreachable.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"clinician_inbox-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
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
            target_id=str(target_id) or actor.actor_id,
            target_type="clinician_inbox",
            action=f"clinician_inbox.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("clinician_inbox self-audit skipped")
    return event_id


def _ack_target_id(event_id: str) -> str:
    """Stable target_id for the acknowledgement audit row.

    Prefixed with ``audit-`` so the inbox can scan for these rows with a
    cheap LIKE query without confusing them with the underlying audit
    rows they reference.
    """
    return f"audit-{event_id}"


def _ack_lookup(db: Session, event_ids: list[str]) -> dict[str, dict]:
    """Return a dict mapping audit event_id → first acknowledgement record.

    First-acknowledgement-wins: subsequent acks emit fresh audit rows but
    the inbox status reads "acknowledged" off the earliest ack so the UI
    is stable.
    """
    if not event_ids:
        return {}
    ack_targets = [_ack_target_id(e) for e in event_ids]
    ack_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == "clinician_inbox",
            AuditEventRecord.action == "clinician_inbox.item_acknowledged",
            AuditEventRecord.target_id.in_(ack_targets),
        )
        .order_by(AuditEventRecord.id.asc())
        .all()
    )
    out: dict[str, dict] = {}
    for r in ack_rows:
        target = r.target_id or ""
        if not target.startswith("audit-"):
            continue
        original = target[len("audit-"):]
        if original in out:
            continue  # first ack wins
        out[original] = {
            "ack_event_id": r.event_id,
            "ack_actor_id": r.actor_id,
            "ack_note": r.note,
            "ack_created_at": r.created_at,
        }
    return out


# ── Schemas ─────────────────────────────────────────────────────────────────


class InboxItemOut(BaseModel):
    event_id: str
    surface: str
    event_type: str
    action: str
    actor_id: str
    role: str
    note: str
    created_at: str
    target_id: str
    target_type: str
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    is_demo: bool = False
    is_acknowledged: bool = False
    acknowledged_at: Optional[str] = None
    acknowledged_by: Optional[str] = None
    acknowledge_note: Optional[str] = None
    drill_out_url: Optional[str] = None


class InboxPatientGroupOut(BaseModel):
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    is_demo: bool = False
    item_count: int = 0
    unread_count: int = 0
    items: list[InboxItemOut] = Field(default_factory=list)


class InboxListResponse(BaseModel):
    items: list[InboxItemOut] = Field(default_factory=list)
    grouped: list[InboxPatientGroupOut] = Field(default_factory=list)
    total: int = 0
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(INBOX_DISCLAIMERS))


class InboxSummaryResponse(BaseModel):
    high_priority_unread: int = 0
    last_24h: int = 0
    last_7d: int = 0
    by_surface: dict[str, int] = Field(default_factory=dict)
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(INBOX_DISCLAIMERS))


class InboxAckIn(BaseModel):
    note: str = Field(..., min_length=1, max_length=1000)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("note cannot be blank")
        return v


class InboxAckOut(BaseModel):
    accepted: bool = True
    event_id: str
    ack_event_id: str
    is_first_ack: bool = True


class InboxBulkAckIn(BaseModel):
    event_ids: list[str] = Field(..., min_length=1, max_length=200)
    note: str = Field(..., min_length=1, max_length=1000)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("note cannot be blank")
        return v


class InboxBulkAckResultRow(BaseModel):
    event_id: str
    ack_event_id: Optional[str] = None
    status: str  # "ok" | "not_found" | "forbidden"


class InboxBulkAckOut(BaseModel):
    accepted: bool = True
    processed: int
    succeeded: int
    failures: list[InboxBulkAckResultRow] = Field(default_factory=list)
    results: list[InboxBulkAckResultRow] = Field(default_factory=list)


class InboxAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    item_event_id: Optional[str] = Field(default=None, max_length=128)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class InboxAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Aggregation core ────────────────────────────────────────────────────────


def _serialize_row(
    record: AuditEventRecord,
    *,
    patient_lookup: dict[str, dict],
    ack_lookup: dict[str, dict],
) -> InboxItemOut:
    surface, event_type = _split_action(record.action or "")
    if not surface or surface == "unknown":
        surface = (record.target_type or "unknown").strip() or "unknown"
    patient_id = _extract_patient_id(record)
    patient_meta = patient_lookup.get(patient_id or "", {})
    is_demo = _is_demo_row(record) or bool(patient_meta.get("is_demo"))
    ack = ack_lookup.get(record.event_id)
    drill_out_page = SURFACE_DRILL_OUT_PAGE.get(surface)
    drill_out_url = None
    if drill_out_page:
        if patient_id:
            drill_out_url = f"?page={drill_out_page}&patient_id={patient_id}"
        else:
            drill_out_url = f"?page={drill_out_page}"
    return InboxItemOut(
        event_id=record.event_id,
        surface=surface,
        event_type=event_type,
        action=record.action or "",
        actor_id=record.actor_id or "",
        role=record.role or "",
        note=record.note or "",
        created_at=record.created_at or "",
        target_id=record.target_id or "",
        target_type=record.target_type or "",
        patient_id=patient_id,
        patient_name=patient_meta.get("name"),
        is_demo=is_demo,
        is_acknowledged=bool(ack),
        acknowledged_at=(ack or {}).get("ack_created_at"),
        acknowledged_by=(ack or {}).get("ack_actor_id"),
        acknowledge_note=(ack or {}).get("ack_note"),
        drill_out_url=drill_out_url,
    )


def _query_high_priority_rows(
    db: Session,
    actor: AuthenticatedActor,
    *,
    surface: Optional[str] = None,
    patient_id: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    limit: int = 500,
) -> list[AuditEventRecord]:
    """SQL-prefilter then refine in Python so the inbox stays cheap.

    The SQL prefilter narrows on:
      * note LIKE '%priority=high%', OR
      * action LIKE '%_to_clinician', OR
      * action LIKE '%_to_clinician_mirror', OR
      * action IN ALWAYS_HIGH_ACTIONS

    The Python refinement then applies actor-scope (clinic) and the
    cheap is-row-high-priority predicate (which the SQL prefilter is
    already a superset of, so the Python check is just a safety net).
    """
    actor_id_set = _scope_actor_ids(db, actor)
    q = db.query(AuditEventRecord)

    high_priority_filter = or_(
        AuditEventRecord.note.like("%priority=high%"),
        AuditEventRecord.action.like("%_to_clinician"),
        AuditEventRecord.action.like("%_to_clinician_mirror"),
        AuditEventRecord.action.in_(list(ALWAYS_HIGH_ACTIONS)),
    )
    q = q.filter(high_priority_filter)

    if actor_id_set is not None:
        if not actor_id_set:
            return []
        q = q.filter(AuditEventRecord.actor_id.in_(list(actor_id_set)))

    if surface:
        s = surface.strip().lower()
        q = q.filter(
            or_(
                AuditEventRecord.target_type == s,
                AuditEventRecord.action.like(f"{s}.%"),
            )
        )

    if since is not None:
        q = q.filter(AuditEventRecord.created_at >= since.isoformat())
    if until is not None:
        q = q.filter(AuditEventRecord.created_at <= until.isoformat())

    rows = (
        q.order_by(AuditEventRecord.id.desc()).limit(limit * 4).all()
    )

    # Python-side refinement: ensure predicate, drop rows authored on the
    # ``clinician_inbox`` surface itself (we don't want a recursive feed),
    # and apply patient_id filter post-extraction.
    out: list[AuditEventRecord] = []
    for r in rows:
        if (r.target_type or "") == "clinician_inbox":
            continue
        if not _row_is_high_priority(r):
            continue
        if patient_id is not None:
            extracted = _extract_patient_id(r)
            if extracted != patient_id:
                continue
        out.append(r)
        if len(out) >= limit:
            break
    return out


# ── GET /items ──────────────────────────────────────────────────────────────


@router.get("/items", response_model=InboxListResponse)
def list_items(
    surface: Optional[str] = Query(default=None, max_length=64),
    patient_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    status: Optional[str] = Query(default=None, max_length=24),
    limit: int = Query(default=200, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InboxListResponse:
    """List the HIGH-priority inbox items grouped by patient."""
    _gate_role(actor)

    since_dt = _parse_iso(since)
    until_dt = _parse_iso(until)

    rows = _query_high_priority_rows(
        db,
        actor,
        surface=surface,
        patient_id=patient_id,
        since=since_dt,
        until=until_dt,
        limit=limit,
    )

    patient_ids = {pid for r in rows if (pid := _extract_patient_id(r))}
    patient_lookup = _patient_lookup(db, patient_ids)
    ack_lookup = _ack_lookup(db, [r.event_id for r in rows])

    items = [_serialize_row(r, patient_lookup=patient_lookup, ack_lookup=ack_lookup)
             for r in rows]

    if status:
        s = status.strip().lower()
        if s == "unread" or s == "unacknowledged":
            items = [it for it in items if not it.is_acknowledged]
        elif s == "acknowledged":
            items = [it for it in items if it.is_acknowledged]

    # Group by patient — ordering: items already sorted by recency desc.
    groups: "defaultdict[str, list[InboxItemOut]]" = defaultdict(list)
    for it in items:
        key = it.patient_id or "_unassigned"
        groups[key].append(it)

    grouped: list[InboxPatientGroupOut] = []
    for key, gitems in groups.items():
        if key == "_unassigned":
            grouped.append(InboxPatientGroupOut(
                patient_id=None,
                patient_name=None,
                is_demo=any(it.is_demo for it in gitems),
                item_count=len(gitems),
                unread_count=sum(1 for it in gitems if not it.is_acknowledged),
                items=gitems,
            ))
        else:
            meta = patient_lookup.get(key, {})
            grouped.append(InboxPatientGroupOut(
                patient_id=key,
                patient_name=meta.get("name") or key,
                is_demo=bool(meta.get("is_demo") or any(it.is_demo for it in gitems)),
                item_count=len(gitems),
                unread_count=sum(1 for it in gitems if not it.is_acknowledged),
                items=gitems,
            ))

    is_demo_view = any(it.is_demo for it in items)

    _audit(
        db,
        actor,
        event="items_listed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"items={len(items)} surface={surface or '-'} "
            f"patient_id={patient_id or '-'} status={status or '-'}"
        ),
        using_demo_data=is_demo_view,
    )

    return InboxListResponse(
        items=items,
        grouped=grouped,
        total=len(items),
        is_demo_view=is_demo_view,
    )


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        if "T" not in s:
            return datetime.fromisoformat(s + "T00:00:00+00:00")
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


# ── GET /summary ────────────────────────────────────────────────────────────


@router.get("/summary", response_model=InboxSummaryResponse)
def get_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InboxSummaryResponse:
    """Top counts: HIGH-priority unread / 24h / 7d / by surface."""
    _gate_role(actor)

    rows = _query_high_priority_rows(db, actor, limit=500)
    ack_lookup = _ack_lookup(db, [r.event_id for r in rows])

    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_7d = now - timedelta(days=7)

    high_priority_unread = 0
    last_24h = 0
    last_7d = 0
    by_surface: Counter[str] = Counter()
    is_demo_view = False

    for r in rows:
        ts = _parse_iso(r.created_at)
        if ts is not None:
            ts_aw = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
            if ts_aw >= cutoff_24h:
                last_24h += 1
            if ts_aw >= cutoff_7d:
                last_7d += 1
        if r.event_id not in ack_lookup:
            high_priority_unread += 1
        surface, _evt = _split_action(r.action or "")
        if surface == "unknown":
            surface = (r.target_type or "unknown")
        by_surface[surface] += 1
        if _is_demo_row(r):
            is_demo_view = True

    _audit(
        db,
        actor,
        event="summary_viewed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"unread={high_priority_unread} 24h={last_24h} 7d={last_7d} "
            f"surfaces={len(by_surface)}"
        ),
        using_demo_data=is_demo_view,
    )

    return InboxSummaryResponse(
        high_priority_unread=high_priority_unread,
        last_24h=last_24h,
        last_7d=last_7d,
        by_surface=dict(by_surface),
        is_demo_view=is_demo_view,
    )


# ── GET /items/{event_id} ───────────────────────────────────────────────────


@router.get("/items/{event_id}", response_model=InboxItemOut)
def get_item(
    event_id: str = Path(..., min_length=1, max_length=128),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InboxItemOut:
    """Single audit-row detail; 404 if not visible at the actor's scope."""
    _gate_role(actor)
    record = (
        db.query(AuditEventRecord)
        .filter(AuditEventRecord.event_id == event_id)
        .one_or_none()
    )
    if record is None or not _row_is_high_priority(record):
        raise ApiServiceError(
            code="not_found",
            message="Inbox item not found.",
            status_code=404,
        )
    actor_id_set = _scope_actor_ids(db, actor)
    if actor_id_set is not None and (record.actor_id or "") not in actor_id_set:
        raise ApiServiceError(
            code="not_found",
            message="Inbox item not found.",
            status_code=404,
        )

    pid = _extract_patient_id(record)
    patient_lookup = _patient_lookup(db, {pid} if pid else set())
    ack_lookup = _ack_lookup(db, [record.event_id])
    item = _serialize_row(record, patient_lookup=patient_lookup, ack_lookup=ack_lookup)

    _audit(
        db,
        actor,
        event="item_opened",
        target_id=record.event_id,
        note=f"surface={item.surface}; action={item.action}",
        using_demo_data=item.is_demo,
    )
    return item


# ── POST /items/{event_id}/acknowledge ──────────────────────────────────────


@router.post("/items/{event_id}/acknowledge", response_model=InboxAckOut)
def acknowledge_item(
    body: InboxAckIn,
    event_id: str = Path(..., min_length=1, max_length=128),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InboxAckOut:
    """Acknowledge an inbox item. Note required.

    Idempotent semantics: if the item is already acknowledged, a fresh
    audit row is still emitted (so the second clinician's note is
    regulator-visible) but ``is_first_ack=False`` is returned. Document
    in PR section F.
    """
    _gate_role(actor)
    record = (
        db.query(AuditEventRecord)
        .filter(AuditEventRecord.event_id == event_id)
        .one_or_none()
    )
    if record is None or not _row_is_high_priority(record):
        raise ApiServiceError(
            code="not_found",
            message="Inbox item not found.",
            status_code=404,
        )
    actor_id_set = _scope_actor_ids(db, actor)
    if actor_id_set is not None and (record.actor_id or "") not in actor_id_set:
        raise ApiServiceError(
            code="not_found",
            message="Inbox item not found.",
            status_code=404,
        )

    existing = _ack_lookup(db, [event_id]).get(event_id)
    is_first_ack = existing is None

    is_demo = _is_demo_row(record)
    pid = _extract_patient_id(record)
    if pid:
        plookup = _patient_lookup(db, {pid})
        if plookup.get(pid, {}).get("is_demo"):
            is_demo = True

    # Acknowledgement audit row is keyed by ``audit-{event_id}`` so it can
    # be retrieved cheaply by ``_ack_lookup``.
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    ack_event_id = (
        f"clinician_inbox-item_acknowledged-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if is_demo:
        note_parts.append("DEMO")
    note_parts.append(f"event={event_id}")
    note_parts.append(body.note[:480])
    final_note = "; ".join(note_parts)
    try:
        create_audit_event(
            db,
            event_id=ack_event_id,
            target_id=_ack_target_id(event_id),
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _log.exception("clinician_inbox acknowledge audit failed")
        raise ApiServiceError(
            code="audit_write_failed",
            message="Could not record acknowledgement.",
            status_code=500,
        )

    return InboxAckOut(
        accepted=True,
        event_id=event_id,
        ack_event_id=ack_event_id,
        is_first_ack=is_first_ack,
    )


# ── POST /items/bulk-acknowledge ────────────────────────────────────────────


@router.post("/items/bulk-acknowledge", response_model=InboxBulkAckOut)
def bulk_acknowledge(
    body: InboxBulkAckIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InboxBulkAckOut:
    """Bulk acknowledge a list of items. Partial failures are reported.

    Each id is processed independently; failures (404 / forbidden / not
    high-priority) are returned in the ``failures`` list with a status
    code so the UI can re-surface the rows that didn't take.
    """
    _gate_role(actor)
    actor_id_set = _scope_actor_ids(db, actor)

    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    results: list[InboxBulkAckResultRow] = []
    failures: list[InboxBulkAckResultRow] = []
    succeeded = 0
    now = datetime.now(timezone.utc)

    # Pre-fetch all referenced rows in one query to keep this O(1).
    rows = {
        r.event_id: r
        for r in db.query(AuditEventRecord).filter(
            AuditEventRecord.event_id.in_(body.event_ids)
        ).all()
    }

    is_demo_any = False
    for eid in body.event_ids:
        record = rows.get(eid)
        if record is None or not _row_is_high_priority(record):
            row = InboxBulkAckResultRow(event_id=eid, status="not_found")
            results.append(row)
            failures.append(row)
            continue
        if actor_id_set is not None and (record.actor_id or "") not in actor_id_set:
            row = InboxBulkAckResultRow(event_id=eid, status="forbidden")
            results.append(row)
            failures.append(row)
            continue

        is_demo = _is_demo_row(record)
        if is_demo:
            is_demo_any = True
        ack_event_id = (
            f"clinician_inbox-item_acknowledged-{actor.actor_id}"
            f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        note_parts: list[str] = []
        if is_demo:
            note_parts.append("DEMO")
        note_parts.append(f"event={eid}; bulk=1")
        note_parts.append(body.note[:480])
        try:
            create_audit_event(
                db,
                event_id=ack_event_id,
                target_id=_ack_target_id(eid),
                target_type="clinician_inbox",
                action="clinician_inbox.item_acknowledged",
                role=actor.role,
                actor_id=actor.actor_id,
                note=("; ".join(note_parts))[:1024],
                created_at=now.isoformat(),
            )
        except Exception:  # pragma: no cover
            _log.exception("clinician_inbox bulk-ack audit failed: %s", eid)
            row = InboxBulkAckResultRow(event_id=eid, status="forbidden")
            results.append(row)
            failures.append(row)
            continue

        results.append(InboxBulkAckResultRow(
            event_id=eid, ack_event_id=ack_event_id, status="ok",
        ))
        succeeded += 1

    _audit(
        db,
        actor,
        event="bulk_acknowledged",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"processed={len(body.event_ids)} succeeded={succeeded} "
            f"failures={len(failures)}"
        ),
        using_demo_data=is_demo_any,
    )

    return InboxBulkAckOut(
        accepted=True,
        processed=len(body.event_ids),
        succeeded=succeeded,
        failures=failures,
        results=results,
    )


# ── GET /export.csv ─────────────────────────────────────────────────────────


_EXPORT_COLUMNS = [
    "event_id",
    "created_at",
    "surface",
    "event_type",
    "action",
    "actor_id",
    "role",
    "target_id",
    "patient_id",
    "patient_name",
    "is_demo",
    "is_acknowledged",
    "acknowledged_at",
    "acknowledged_by",
    "note",
]


@router.get("/export.csv")
def export_csv(
    surface: Optional[str] = Query(default=None, max_length=64),
    patient_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    status: Optional[str] = Query(default=None, max_length=24),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CSV export of the clinic-scoped inbox queue.

    DEMO-prefixed when any included item's patient is demo OR any row's
    note carries the ``DEMO`` marker.
    """
    _gate_role(actor)

    rows = _query_high_priority_rows(
        db,
        actor,
        surface=surface,
        patient_id=patient_id,
        since=_parse_iso(since),
        until=_parse_iso(until),
        limit=5000,
    )
    patient_ids = {pid for r in rows if (pid := _extract_patient_id(r))}
    patient_lookup = _patient_lookup(db, patient_ids)
    ack_lookup = _ack_lookup(db, [r.event_id for r in rows])

    items = [_serialize_row(r, patient_lookup=patient_lookup, ack_lookup=ack_lookup)
             for r in rows]
    if status:
        s = status.strip().lower()
        if s in ("unread", "unacknowledged"):
            items = [it for it in items if not it.is_acknowledged]
        elif s == "acknowledged":
            items = [it for it in items if it.is_acknowledged]

    any_demo = any(it.is_demo for it in items)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_EXPORT_COLUMNS)
    for it in items:
        writer.writerow([
            it.event_id,
            it.created_at,
            it.surface,
            it.event_type,
            it.action,
            it.actor_id,
            it.role,
            it.target_id,
            it.patient_id or "",
            it.patient_name or "",
            "1" if it.is_demo else "0",
            "1" if it.is_acknowledged else "0",
            it.acknowledged_at or "",
            it.acknowledged_by or "",
            (it.note or "").replace("\n", " ").replace("\r", " "),
        ])

    prefix = "DEMO-" if any_demo else ""
    filename = f"{prefix}clinician-inbox.csv"

    _audit(
        db,
        actor,
        event="export",
        target_id=actor.clinic_id or actor.actor_id,
        note=f"format=csv; rows={len(items)}; demo={1 if any_demo else 0}",
        using_demo_data=any_demo,
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-ClinicianInbox-Demo": "1" if any_demo else "0",
            "Cache-Control": "no-store",
        },
    )


# ── POST /audit-events ──────────────────────────────────────────────────────


@router.post("/audit-events", response_model=InboxAuditEventOut)
def post_audit_event(
    body: InboxAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InboxAuditEventOut:
    """Page-level audit ingestion for the Clinician Inbox.

    Common events: ``view`` (mount), ``filter_changed``, ``item_opened``,
    ``item_acknowledged_via_modal``, ``item_drilled_out``, ``bulk_selection_changed``,
    ``polling_tick`` (real-time refresh). Per-item mutation events
    (``item_acknowledged`` / ``bulk_acknowledged``) are emitted by the
    dedicated endpoints — this surface only carries page-level breadcrumbs.
    """
    _gate_role(actor)

    target_id = body.item_event_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if body.item_event_id:
        note_parts.append(f"item={body.item_event_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    event_id = _audit(
        db,
        actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=bool(body.using_demo_data),
    )
    return InboxAuditEventOut(accepted=True, event_id=event_id)
