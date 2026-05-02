"""Clinician Notifications Pulse / Daily Digest launch-audit (2026-05-01).

Top-of-loop telemetry the Care Team Coverage SLA chain (#357) currently
lacks. Tells the on-call clinician at the end of their shift:

  "Here's what happened, here's what's still open, here's what got
  escalated."

Sibling chain:

    Wearables Workbench (#353) ─┐
    Adverse Events Hub  (#342) ─┼─► Clinician Inbox (#354) ─► Care Team Coverage (#357) ─► **Clinician Digest** (THIS)
    Patient surfaces #347-#352 ─┘     (HIGH-priority predicate)   (SLA breach → page on-call)        (end-of-shift summary)

Endpoints
---------
GET  /api/v1/clinician-digest/summary           Counts: handled / open / escalated / paged / sla_breached, per-surface breakdown
GET  /api/v1/clinician-digest/sections          Per-surface details (Inbox / Wearables Workbench / Adherence / Wellness / AE Hub)
GET  /api/v1/clinician-digest/events            Line-level events with drill-out URLs (filters: surface / severity / patient_id)
POST /api/v1/clinician-digest/send-email        Email actor (or alt recipient); emits clinician_digest.email_sent audit
POST /api/v1/clinician-digest/share-colleague   Send to colleague at same clinic; emits audit
GET  /api/v1/clinician-digest/export.csv        DEMO-prefixed when any included event has a demo patient
GET  /api/v1/clinician-digest/export.ndjson     DEMO-prefixed when any included event has a demo patient
POST /api/v1/clinician-digest/audit-events      Page-level audit ingestion (target_type=clinician_digest)

Aggregation strategy
--------------------
DOES NOT WRITE NEW DATA TABLES. Reads ``audit_events`` + the four
clinician hubs already shipped:

  * Clinician Inbox (#354) — uses :data:`HANDLED_INBOX_ACTIONS` to count
    ``item_acknowledged`` / ``item_paged_to_oncall`` rows authored by
    the actor in the window. ``OPEN`` items use the existing
    ``_query_high_priority_rows`` predicate from clinician_inbox_router
    minus rows that already have an acknowledgement.
  * Wearables Workbench (#353) — counts WearableAlertFlag rows with
    workbench_status transitions in the window (``acknowledged_at`` /
    ``escalated_at``).
  * Clinician Adherence Hub (#361) — counts PatientAdherenceEvent rows
    moved out of ``open`` in the window via ``acknowledged_at``.
  * Clinician Wellness Hub (#365) — counts WellnessCheckin rows where
    ``clinician_acted_at`` falls in the window.
  * Adverse Events Hub (#342) — counts AdverseEvent drafts (``status='reported'``)
    created in the window (these are the escalations).

PAGED counts read audit_events for action ``inbox.item_paged_to_oncall``
(emitted by Care Team Coverage #357 manual-page handler).

SLA-BREACHED counts the same predicate as the Care Team Coverage live
breach feed: HIGH-priority audit rows older than the per-surface SLA
that have NO acknowledgement. Reuses
:func:`clinician_inbox_router._row_is_high_priority`.

Date range scoping
------------------
Default window is "this shift" — last 12h ending at ``now``. The Care
Team Coverage roster is the source of truth for shift boundaries when
``actor.clinic_id`` has an active shift; we fall back to "last 12h"
gracefully when no shift is configured.

The frontend exposes presets (today / yesterday / last 7d / custom) +
date-range picker. All windows pass through ``since`` / ``until`` ISO
strings.

Cross-clinic
------------
Non-admin clinicians are scoped to their own ``actor_id`` and to flag /
event / check-in rows whose owning patient sits at their clinic. Cross-
clinic rows return 404 for clinicians, 200 for admins.

Email / colleague-share delivery
--------------------------------
``send-email`` and ``share-colleague`` write a regulator-credible audit
row keyed ``clinician_digest.email_sent`` / ``clinician_digest.colleague_shared``.
Actual SMTP / Slack / pager delivery is OUT OF SCOPE for this PR — until
the SMTP webhook lands, ``delivery_status`` is ``queued``. Documented in
PR section F. Optionally a ``digest_email_queue`` row is recorded for
future replay; we DO NOT add a dedicated table because the audit row
already carries the full payload (recipient, reason, subject snippet).

Demo honesty
------------
Exports prefix ``DEMO-`` when any included event's patient is demo or
any audit row carries the ``DEMO`` marker.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
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
from app.persistence.models import (
    AdverseEvent,
    AuditEventRecord,
    Patient,
    PatientAdherenceEvent,
    User,
    WearableAlertFlag,
    WellnessCheckin,
)
from app.routers.clinician_inbox_router import (
    _ack_lookup,
    _extract_patient_id,
    _is_demo_row,
    _row_is_high_priority,
    _split_action,
)


router = APIRouter(prefix="/api/v1/clinician-digest", tags=["Clinician Digest"])
_log = logging.getLogger(__name__)


# Surfaces the digest aggregates over. Order is the canonical ordering
# the frontend uses for per-surface section cards. ``adverse_events_hub``
# is folded as the AE escalation source.
DIGEST_SURFACES = (
    "clinician_inbox",
    "wearables_workbench",
    "clinician_adherence_hub",
    "clinician_wellness_hub",
    "adverse_events_hub",
)


# Audit actions that count as "handled" by the on-call clinician —
# i.e. the clinician took the row out of the open queue. Includes
# per-hub acknowledge / resolve transitions and the inbox-aggregated
# acknowledge action.
HANDLED_INBOX_ACTIONS = frozenset({
    "clinician_inbox.item_acknowledged",
    "inbox.item_paged_to_oncall",
    "wearables_workbench.flag_acknowledged",
    "wearables_workbench.flag_resolved",
    "clinician_adherence_hub.event_acknowledged",
    "clinician_adherence_hub.event_resolved",
    "clinician_wellness_hub.checkin_acknowledged",
    "clinician_wellness_hub.checkin_resolved",
    "clinician_adherence_hub.bulk_acknowledged",
    "clinician_wellness_hub.bulk_acknowledged",
})


# Audit actions that count as ESCALATIONS (per surface). These DO NOT
# overlap with HANDLED_INBOX_ACTIONS; an escalation moves the row to a
# new owner (AE Hub), not out of the queue.
ESCALATION_ACTIONS = frozenset({
    "clinician_adherence_hub.event_escalated",
    "clinician_wellness_hub.checkin_escalated",
    "wearables_workbench.flag_escalated",
})


# Default per-surface SLA minutes (mirror of Care Team Coverage default
# table — we re-state defaults here rather than import to keep the module
# safe to import even if SLAConfig hasn't been initialised yet).
DEFAULT_SLA_MINUTES: dict[str, int] = {
    "*": 60,
    "wearables_workbench": 30,
    "adverse_events_hub": 5,
    "adverse_events": 5,
    "wearables": 30,
    "adherence_events": 60,
    "patient_messages": 30,
    "home_program_tasks": 60,
}


DIGEST_DISCLAIMERS = [
    "Daily digest is the on-call clinician's end-of-shift summary across "
    "Inbox, Wearables Workbench, Adherence Hub, Wellness Hub and the AE "
    "Hub. Counts are real audit-table aggregates — not AI fabrication.",
    "Email + colleague-share record a regulator-credible audit row "
    "(clinician_digest.email_sent / clinician_digest.colleague_shared). "
    "Delivery (SMTP / Slack / pager) is documented in PR section F. Until "
    "the SMTP wire-up lands, delivery_status='queued' means \"recipient "
    "selected, audit row written\" not \"delivered\".",
    "Cross-clinic rows are hidden from non-admin clinicians (404). "
    "Colleague-share is restricted to recipients at the actor's clinic.",
    "Demo events are clearly labelled. Exports DEMO-prefix when any "
    "included event's patient is demo. Not regulator-submittable.",
]


_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


# Drill-out URL routes — kept aligned with clinician_inbox_router.SURFACE_DRILL_OUT_PAGE
DIGEST_DRILL_OUT_PAGE = {
    "clinician_inbox": "clinician-inbox",
    "wearables_workbench": "monitor",
    "clinician_adherence_hub": "clinician-adherence",
    "clinician_wellness_hub": "clinician-wellness",
    "adverse_events_hub": "adverse-events-hub",
}


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_role(actor: AuthenticatedActor) -> None:
    """Allow clinician+ (clinician, admin, supervisor, reviewer, regulator)."""
    require_minimum_role(
        actor,
        "clinician",
        warnings=["Clinician Digest is restricted to clinical staff."],
    )


def _is_admin_scope(actor: AuthenticatedActor) -> bool:
    return actor.role in ("admin", "supervisor", "regulator")


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Coerce naive datetimes to tz-aware UTC (SQLite strips tzinfo)."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    aw = _aware(dt)
    return aw.isoformat() if aw is not None else None


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Tolerate URL-decoded ``+`` (becomes space) and trailing Z forms.
        cleaned = s.replace(" ", "+").replace("Z", "+00:00")
        if "T" not in cleaned:
            return datetime.fromisoformat(cleaned + "T00:00:00+00:00")
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


def _resolve_window(
    since: Optional[str],
    until: Optional[str],
) -> tuple[datetime, datetime]:
    """Return (since_dt, until_dt) for the digest window.

    Default: last 12h ending at now. Caller can override via query
    params. The window is half-open [since, until).
    """
    until_dt = _parse_iso(until) or datetime.now(timezone.utc)
    since_dt = _parse_iso(since)
    if since_dt is None:
        since_dt = until_dt - timedelta(hours=12)
    if since_dt > until_dt:
        # Defensive — keep the response useful instead of failing.
        since_dt, until_dt = until_dt, since_dt
    return since_dt, until_dt


def _scope_actor_ids(db: Session, actor: AuthenticatedActor) -> Optional[set[str]]:
    """Return the set of actor ids visible at the actor's clinic.

    Admins / supervisors / regulators see everything (returns None).
    Clinicians see audit rows authored by users in their clinic (plus
    themselves). Mirror of clinician_inbox_router._scope_actor_ids.
    """
    if _is_admin_scope(actor):
        return None
    if not actor.clinic_id:
        return set()
    actor_ids = {
        u.id for u in db.query(User).filter(User.clinic_id == actor.clinic_id).all()
    }
    actor_ids.add(actor.actor_id)
    return actor_ids


def _scope_patient_ids(db: Session, actor: AuthenticatedActor) -> Optional[set[str]]:
    """Return the set of patient ids whose owning clinician is at the actor's clinic.

    Admins see everything (returns None). Used to scope WearableAlertFlag,
    PatientAdherenceEvent, WellnessCheckin and AdverseEvent rows.
    """
    if _is_admin_scope(actor):
        return None
    if not actor.clinic_id:
        return set()
    user_ids = [
        u.id for u in db.query(User).filter(User.clinic_id == actor.clinic_id).all()
    ]
    if not user_ids:
        return set()
    pids = {
        p.id for p in db.query(Patient).filter(Patient.clinician_id.in_(user_ids)).all()
    }
    return pids


def _patient_is_demo(db: Session, patient_id: str) -> bool:
    """Best-effort demo detection (mirror of clinician_wellness_router helper)."""
    try:
        p = db.query(Patient).filter_by(id=patient_id).first()
        if p is None:
            return False
        notes = p.notes or ""
        if notes.startswith("[DEMO]"):
            return True
        if not p.clinician_id:
            return False
        u = db.query(User).filter_by(id=p.clinician_id).first()
        if u is None or not u.clinic_id:
            return False
        return u.clinic_id in _DEMO_CLINIC_IDS
    except Exception:
        return False


def _digest_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the ``clinician_digest`` surface.

    Never raises — audit must not block the UI. Mirrors the clinician
    inbox / wellness / adherence helpers.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"clinician_digest-{event}-{actor.actor_id}"
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
            target_type="clinician_digest",
            action=f"clinician_digest.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("clinician_digest self-audit skipped")
    return event_id


# ── Aggregation core ────────────────────────────────────────────────────────


class _DigestEvent(BaseModel):
    """Internal common shape across surfaces."""

    surface: str
    event_type: str
    action: str
    target_id: str
    actor_id: str
    role: str = ""
    created_at: str
    note: str = ""
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    severity: Optional[str] = None
    is_demo: bool = False
    drill_out_url: Optional[str] = None
    is_paged: bool = False
    is_escalated: bool = False
    is_handled: bool = False


def _audit_window_query(
    db: Session,
    actor: AuthenticatedActor,
    *,
    since_dt: datetime,
    until_dt: datetime,
    actions_in: Optional[set[str]] = None,
):
    """Audit-events query scoped to actor + window."""
    actor_id_set = _scope_actor_ids(db, actor)
    q = db.query(AuditEventRecord).filter(
        AuditEventRecord.created_at >= since_dt.isoformat(),
        AuditEventRecord.created_at < until_dt.isoformat(),
    )
    if actor_id_set is not None:
        if not actor_id_set:
            return None
        q = q.filter(AuditEventRecord.actor_id.in_(list(actor_id_set)))
    if actions_in:
        q = q.filter(AuditEventRecord.action.in_(list(actions_in)))
    return q


def _gather_handled_audits(
    db: Session,
    actor: AuthenticatedActor,
    *,
    since_dt: datetime,
    until_dt: datetime,
) -> list[AuditEventRecord]:
    q = _audit_window_query(
        db, actor, since_dt=since_dt, until_dt=until_dt,
        actions_in=set(HANDLED_INBOX_ACTIONS) | set(ESCALATION_ACTIONS),
    )
    if q is None:
        return []
    return q.all()


def _gather_paged_audits(
    db: Session,
    actor: AuthenticatedActor,
    *,
    since_dt: datetime,
    until_dt: datetime,
) -> list[AuditEventRecord]:
    q = _audit_window_query(
        db, actor, since_dt=since_dt, until_dt=until_dt,
        actions_in={"inbox.item_paged_to_oncall"},
    )
    if q is None:
        return []
    return q.all()


def _gather_open_inbox_count(
    db: Session,
    actor: AuthenticatedActor,
) -> int:
    """Count HIGH-priority inbox items NOT yet acknowledged at this moment.

    Does not filter by window — "still open at end-of-shift" is a
    point-in-time count. Mirror of clinician_inbox_router._query_high_priority_rows
    minus the window filter.
    """
    actor_id_set = _scope_actor_ids(db, actor)
    if actor_id_set is not None and not actor_id_set:
        return 0

    q = db.query(AuditEventRecord).filter(
        or_(
            AuditEventRecord.note.like("%priority=high%"),
            AuditEventRecord.action.like("%_to_clinician"),
            AuditEventRecord.action.like("%_to_clinician_mirror"),
            AuditEventRecord.action == "wearables_workbench.flag_escalated",
        )
    )
    if actor_id_set is not None:
        q = q.filter(AuditEventRecord.actor_id.in_(list(actor_id_set)))
    rows = q.order_by(AuditEventRecord.id.desc()).limit(2000).all()

    open_rows: list[AuditEventRecord] = []
    for r in rows:
        if (r.target_type or "") == "clinician_inbox":
            continue
        if not _row_is_high_priority(r):
            continue
        open_rows.append(r)

    if not open_rows:
        return 0
    ack_lookup = _ack_lookup(db, [r.event_id for r in open_rows])
    return sum(1 for r in open_rows if r.event_id not in ack_lookup)


def _gather_sla_breached(
    db: Session,
    actor: AuthenticatedActor,
) -> int:
    """Count HIGH-priority unacknowledged rows older than their SLA.

    Mirror of Care Team Coverage breach feed (#357). Per-surface SLA via
    DEFAULT_SLA_MINUTES with the ``*`` fallback.
    """
    actor_id_set = _scope_actor_ids(db, actor)
    if actor_id_set is not None and not actor_id_set:
        return 0
    q = db.query(AuditEventRecord).filter(
        or_(
            AuditEventRecord.note.like("%priority=high%"),
            AuditEventRecord.action.like("%_to_clinician"),
            AuditEventRecord.action.like("%_to_clinician_mirror"),
            AuditEventRecord.action == "wearables_workbench.flag_escalated",
        )
    )
    if actor_id_set is not None:
        q = q.filter(AuditEventRecord.actor_id.in_(list(actor_id_set)))
    rows = q.order_by(AuditEventRecord.id.desc()).limit(2000).all()

    candidates: list[AuditEventRecord] = []
    for r in rows:
        if (r.target_type or "") == "clinician_inbox":
            continue
        if not _row_is_high_priority(r):
            continue
        candidates.append(r)
    if not candidates:
        return 0

    ack_lookup = _ack_lookup(db, [r.event_id for r in candidates])
    now = datetime.now(timezone.utc)
    breached = 0
    for r in candidates:
        if r.event_id in ack_lookup:
            continue
        ts = _parse_iso(r.created_at or "")
        if ts is None:
            continue
        ts_aw = _aware(ts) or ts
        surface, _ = _split_action(r.action or "")
        sla_min = DEFAULT_SLA_MINUTES.get(surface) or DEFAULT_SLA_MINUTES.get("*", 60)
        age = now - ts_aw
        if age > timedelta(minutes=sla_min):
            breached += 1
    return breached


def _gather_open_per_surface(
    db: Session,
    actor: AuthenticatedActor,
) -> dict[str, int]:
    """Per-surface counts of OPEN actionable rows at this moment."""
    out: dict[str, int] = {s: 0 for s in DIGEST_SURFACES}

    patient_ids = _scope_patient_ids(db, actor)

    # Wearables Workbench: open or null (legacy) + not dismissed.
    wq = db.query(WearableAlertFlag).filter(
        or_(
            WearableAlertFlag.workbench_status == "open",
            WearableAlertFlag.workbench_status.is_(None),
        ),
        WearableAlertFlag.dismissed.is_(False),
    )
    if patient_ids is not None:
        if not patient_ids:
            wq = wq.filter(WearableAlertFlag.id.is_(None))
        else:
            wq = wq.filter(WearableAlertFlag.patient_id.in_(list(patient_ids)))
    out["wearables_workbench"] = wq.count()

    # Adherence Hub: open events at this clinic.
    aq = db.query(PatientAdherenceEvent).filter(PatientAdherenceEvent.status == "open")
    if patient_ids is not None:
        if not patient_ids:
            aq = aq.filter(PatientAdherenceEvent.id.is_(None))
        else:
            aq = aq.filter(PatientAdherenceEvent.patient_id.in_(list(patient_ids)))
    out["clinician_adherence_hub"] = aq.count()

    # Wellness Hub: open check-ins (not soft-deleted).
    cq = db.query(WellnessCheckin).filter(
        WellnessCheckin.deleted_at.is_(None),
        or_(
            WellnessCheckin.clinician_status == "open",
            WellnessCheckin.clinician_status.is_(None),
        ),
    )
    if patient_ids is not None:
        if not patient_ids:
            cq = cq.filter(WellnessCheckin.id.is_(None))
        else:
            cq = cq.filter(WellnessCheckin.patient_id.in_(list(patient_ids)))
    out["clinician_wellness_hub"] = cq.count()

    # AE Hub: drafts not yet signed and not yet resolved (still on the
    # triage queue). The AE table has no canonical ``status`` column —
    # ``signed_at IS NULL AND resolved_at IS NULL`` is the closest
    # honest proxy for "open in the AE Hub".
    eq = db.query(AdverseEvent).filter(
        AdverseEvent.signed_at.is_(None),
        AdverseEvent.resolved_at.is_(None),
    )
    if patient_ids is not None:
        if not patient_ids:
            eq = eq.filter(AdverseEvent.id.is_(None))
        else:
            eq = eq.filter(AdverseEvent.patient_id.in_(list(patient_ids)))
    out["adverse_events_hub"] = eq.count()

    # Inbox unread = HIGH-priority unacknowledged audit rows visible to actor.
    out["clinician_inbox"] = _gather_open_inbox_count(db, actor)

    return out


def _patient_label(db: Session, pid: Optional[str]) -> Optional[str]:
    if not pid:
        return None
    p = db.query(Patient).filter_by(id=pid).first()
    if p is None:
        return pid
    label = f"{(p.first_name or '').strip()} {(p.last_name or '').strip()}".strip()
    return label or pid


def _drill_out(surface: str, patient_id: Optional[str]) -> Optional[str]:
    page = DIGEST_DRILL_OUT_PAGE.get(surface)
    if not page:
        return None
    if patient_id:
        return f"?page={page}&patient_id={patient_id}"
    return f"?page={page}"


def _audit_to_event(
    db: Session,
    record: AuditEventRecord,
    patient_lookup_cache: dict[str, dict],
) -> _DigestEvent:
    surface, event_type = _split_action(record.action or "")
    if not surface or surface == "unknown":
        surface = (record.target_type or "unknown").strip() or "unknown"
    pid = _extract_patient_id(record)
    if pid is not None and pid not in patient_lookup_cache:
        patient_lookup_cache[pid] = {
            "name": _patient_label(db, pid) or pid,
            "is_demo": _patient_is_demo(db, pid),
        }
    pmeta = patient_lookup_cache.get(pid or "", {})
    is_demo = _is_demo_row(record) or bool(pmeta.get("is_demo"))
    action = (record.action or "")
    is_paged = action == "inbox.item_paged_to_oncall"
    is_escalated = action in ESCALATION_ACTIONS
    is_handled = action in HANDLED_INBOX_ACTIONS or is_escalated
    return _DigestEvent(
        surface=surface,
        event_type=event_type,
        action=action,
        target_id=record.target_id or "",
        actor_id=record.actor_id or "",
        role=record.role or "",
        created_at=record.created_at or "",
        note=record.note or "",
        patient_id=pid,
        patient_name=pmeta.get("name"),
        is_demo=is_demo,
        drill_out_url=_drill_out(surface, pid),
        is_paged=is_paged,
        is_escalated=is_escalated,
        is_handled=is_handled,
    )


def _aggregate_handled(
    db: Session,
    actor: AuthenticatedActor,
    *,
    since_dt: datetime,
    until_dt: datetime,
) -> tuple[list[_DigestEvent], dict[str, dict]]:
    """Return (events, patient_cache).

    Events include both ``handled`` audit rows and ``escalation`` audit
    rows authored in the window. The caller computes summary counts off
    the typed flags.
    """
    rows = _gather_handled_audits(db, actor, since_dt=since_dt, until_dt=until_dt)
    cache: dict[str, dict] = {}
    out = [_audit_to_event(db, r, cache) for r in rows]
    return out, cache


# ── Schemas ─────────────────────────────────────────────────────────────────


class DigestSummary(BaseModel):
    handled: int = 0
    escalated: int = 0
    paged: int = 0
    open: int = 0
    sla_breached: int = 0
    by_surface: dict[str, dict[str, int]] = Field(default_factory=dict)
    since: str = ""
    until: str = ""
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(DIGEST_DISCLAIMERS))


class DigestPatientActivity(BaseModel):
    patient_id: str
    patient_name: str
    event_count: int = 0


class DigestSection(BaseModel):
    surface: str
    handled: int = 0
    escalated: int = 0
    paged: int = 0
    open: int = 0
    top_patients: list[DigestPatientActivity] = Field(default_factory=list)
    drill_out_url: Optional[str] = None


class DigestSectionsResponse(BaseModel):
    sections: list[DigestSection] = Field(default_factory=list)
    since: str = ""
    until: str = ""
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(DIGEST_DISCLAIMERS))


class DigestEventOut(BaseModel):
    surface: str
    event_type: str
    action: str
    target_id: str
    actor_id: str
    role: str = ""
    created_at: str
    note: str = ""
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    is_demo: bool = False
    is_paged: bool = False
    is_escalated: bool = False
    is_handled: bool = False
    drill_out_url: Optional[str] = None


class DigestEventsResponse(BaseModel):
    items: list[DigestEventOut] = Field(default_factory=list)
    total: int = 0
    since: str = ""
    until: str = ""
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(DIGEST_DISCLAIMERS))


class DigestSendEmailIn(BaseModel):
    recipient_email: Optional[str] = Field(default=None, max_length=255)
    reason: Optional[str] = Field(default=None, max_length=480)
    since: Optional[str] = Field(default=None, max_length=32)
    until: Optional[str] = Field(default=None, max_length=32)

    @field_validator("recipient_email")
    @classmethod
    def _validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        # Light validation — defer real validation to the SMTP layer.
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("recipient_email must be a valid email address")
        return v


class DigestSendEmailOut(BaseModel):
    accepted: bool = True
    delivery_status: str  # "queued" | "sent" | "failed"
    recipient_email: str
    audit_event_id: str
    note: str = ""


class DigestShareColleagueIn(BaseModel):
    recipient_user_id: str = Field(..., min_length=1, max_length=64)
    reason: Optional[str] = Field(default=None, max_length=480)
    since: Optional[str] = Field(default=None, max_length=32)
    until: Optional[str] = Field(default=None, max_length=32)


class DigestShareColleagueOut(BaseModel):
    accepted: bool = True
    delivery_status: str
    recipient_user_id: str
    recipient_email: Optional[str] = None
    audit_event_id: str


class DigestAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    target_id: Optional[str] = Field(default=None, max_length=128)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class DigestAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/summary", response_model=DigestSummary)
def get_summary(
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    actor_id: Optional[str] = Query(default=None, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestSummary:
    """End-of-shift summary across the four hubs + AE drafts."""
    _gate_role(actor)
    since_dt, until_dt = _resolve_window(since, until)

    # ``actor_id`` query param is reserved for admin-scoped lookups; if
    # set we constrain the audit-row scoping to that single actor by
    # passing it as a post-filter rather than rebinding ``actor``
    # (AuthenticatedActor is frozen+slots).
    handled_rows, _cache = _aggregate_handled(
        db, actor, since_dt=since_dt, until_dt=until_dt,
    )
    paged_rows = _gather_paged_audits(
        db, actor, since_dt=since_dt, until_dt=until_dt,
    )
    if actor_id and _is_admin_scope(actor):
        handled_rows = [e for e in handled_rows if e.actor_id == actor_id]
        paged_rows = [r for r in paged_rows if (r.actor_id or "") == actor_id]

    handled_count = sum(1 for e in handled_rows if e.is_handled and not e.is_escalated)
    escalated_count = sum(1 for e in handled_rows if e.is_escalated)
    paged_count = len(paged_rows)

    open_per_surface = _gather_open_per_surface(db, actor)
    open_total = sum(open_per_surface.values())
    sla_breached = _gather_sla_breached(db, actor)

    # Per-surface breakdown for the summary.
    by_surface: dict[str, dict[str, int]] = {
        s: {
            "handled": 0,
            "escalated": 0,
            "paged": 0,
            "open": int(open_per_surface.get(s, 0)),
        }
        for s in DIGEST_SURFACES
    }
    for e in handled_rows:
        if e.surface in by_surface:
            if e.is_escalated:
                by_surface[e.surface]["escalated"] += 1
            else:
                by_surface[e.surface]["handled"] += 1
        # Wearables/adherence/wellness escalations sometimes carry the
        # AE Hub draft creation too; we let escalations stay attributed
        # to the originating surface.
    for r in paged_rows:
        # paged action is ``inbox.item_paged_to_oncall`` — bucket under
        # the inbox surface for the breakdown.
        by_surface["clinician_inbox"]["paged"] += 1

    is_demo_view = any(e.is_demo for e in handled_rows)

    _digest_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"handled={handled_count} escalated={escalated_count} "
            f"paged={paged_count} open={open_total} "
            f"sla_breached={sla_breached} since={since_dt.isoformat()} "
            f"until={until_dt.isoformat()}"
        ),
        using_demo_data=is_demo_view,
    )

    return DigestSummary(
        handled=handled_count,
        escalated=escalated_count,
        paged=paged_count,
        open=open_total,
        sla_breached=sla_breached,
        by_surface=by_surface,
        since=since_dt.isoformat(),
        until=until_dt.isoformat(),
        is_demo_view=is_demo_view,
    )


@router.get("/sections", response_model=DigestSectionsResponse)
def get_sections(
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestSectionsResponse:
    """Per-surface section cards with top 3 patients by activity."""
    _gate_role(actor)
    since_dt, until_dt = _resolve_window(since, until)

    handled_rows, _cache = _aggregate_handled(
        db, actor, since_dt=since_dt, until_dt=until_dt,
    )
    paged_rows = _gather_paged_audits(
        db, actor, since_dt=since_dt, until_dt=until_dt,
    )
    open_per_surface = _gather_open_per_surface(db, actor)

    # Bucket events by surface and compute top-3 patients per bucket.
    by_surface: dict[str, list[_DigestEvent]] = defaultdict(list)
    for e in handled_rows:
        by_surface[e.surface].append(e)
    for r in paged_rows:
        # Translate paged audit row to a digest event under inbox surface.
        ev = _audit_to_event(db, r, _cache)
        by_surface["clinician_inbox"].append(ev)

    sections: list[DigestSection] = []
    for s in DIGEST_SURFACES:
        bucket = by_surface.get(s, [])
        handled = sum(1 for e in bucket if e.is_handled and not e.is_escalated)
        escalated = sum(1 for e in bucket if e.is_escalated)
        paged = sum(1 for e in bucket if e.is_paged)
        # Top patients by event_count within the bucket.
        ctr: Counter[str] = Counter()
        labels: dict[str, str] = {}
        for e in bucket:
            if not e.patient_id:
                continue
            ctr[e.patient_id] += 1
            if e.patient_id not in labels:
                labels[e.patient_id] = e.patient_name or e.patient_id
        top = [
            DigestPatientActivity(
                patient_id=pid,
                patient_name=labels.get(pid) or pid,
                event_count=cnt,
            )
            for pid, cnt in ctr.most_common(3)
        ]
        sections.append(
            DigestSection(
                surface=s,
                handled=handled,
                escalated=escalated,
                paged=paged,
                open=int(open_per_surface.get(s, 0)),
                top_patients=top,
                drill_out_url=_drill_out(s, None),
            )
        )

    is_demo_view = any(e.is_demo for e in handled_rows)

    _digest_audit(
        db,
        actor,
        event="sections_viewed",
        target_id=actor.clinic_id or actor.actor_id,
        note=f"surfaces={len(sections)} since={since_dt.isoformat()}",
        using_demo_data=is_demo_view,
    )

    return DigestSectionsResponse(
        sections=sections,
        since=since_dt.isoformat(),
        until=until_dt.isoformat(),
        is_demo_view=is_demo_view,
    )


@router.get("/events", response_model=DigestEventsResponse)
def list_events(
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    surface: Optional[str] = Query(default=None, max_length=64),
    severity: Optional[str] = Query(default=None, max_length=16),
    patient_id: Optional[str] = Query(default=None, max_length=64),
    limit: int = Query(default=200, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestEventsResponse:
    """Line-level events within the window with drill-out URLs."""
    _gate_role(actor)
    since_dt, until_dt = _resolve_window(since, until)

    handled_rows, _cache = _aggregate_handled(
        db, actor, since_dt=since_dt, until_dt=until_dt,
    )
    paged_rows = _gather_paged_audits(
        db, actor, since_dt=since_dt, until_dt=until_dt,
    )
    paged_evs = [_audit_to_event(db, r, _cache) for r in paged_rows]
    items = handled_rows + paged_evs

    # Filter
    if surface:
        s = surface.strip().lower()
        items = [e for e in items if e.surface == s]
    if patient_id:
        items = [e for e in items if e.patient_id == patient_id]
    if severity:
        sev = severity.strip().lower()
        items = [
            e for e in items
            if (e.severity or "").lower() == sev
            or (e.note or "").lower().find(f"severity={sev}") >= 0
            or (e.note or "").lower().find(f"severity_band={sev}") >= 0
        ]

    # Sort by created_at desc (lexicographic ISO sort is correct for
    # tz-aware ISO with the same offset).
    items.sort(key=lambda e: e.created_at, reverse=True)
    items = items[:limit]
    is_demo_view = any(e.is_demo for e in items)

    _digest_audit(
        db,
        actor,
        event="events_listed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"items={len(items)} surface={surface or '-'} "
            f"severity={severity or '-'} patient_id={patient_id or '-'}"
        ),
        using_demo_data=is_demo_view,
    )

    return DigestEventsResponse(
        items=[DigestEventOut(**e.model_dump()) for e in items],
        total=len(items),
        since=since_dt.isoformat(),
        until=until_dt.isoformat(),
        is_demo_view=is_demo_view,
    )


@router.post("/send-email", response_model=DigestSendEmailOut)
def send_digest_email(
    body: DigestSendEmailIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestSendEmailOut:
    """Email the digest to ``recipient_email`` (or actor.email).

    SMTP wire-up is OUT OF SCOPE; this endpoint records a regulator-
    credible audit row + sets ``delivery_status=queued`` until SMTP
    lands. Enforces:

      * recipient_email defaults to actor.email (404 if both blank)
      * actor must have email set when no override is provided
      * cross-clinic email override is allowed (e.g. director address) but the
        audit row records the recipient verbatim so a regulator can audit it
    """
    _gate_role(actor)

    actor_email = (getattr(actor, "email", None) or "").strip()
    # Look the user up — actor.email is not always populated on the ctx.
    if not actor_email:
        u = db.query(User).filter_by(id=actor.actor_id).first()
        if u is not None:
            actor_email = (u.email or "").strip()

    recipient = (body.recipient_email or actor_email).strip()
    if not recipient:
        raise ApiServiceError(
            code="missing_recipient",
            message=(
                "Cannot send digest email: actor has no email on file and "
                "no override recipient was provided."
            ),
            status_code=400,
        )

    since_dt, until_dt = _resolve_window(body.since, body.until)

    # Pull the summary so we can stamp the audit note with the headline counts.
    summary = get_summary(  # type: ignore[call-arg]
        since=body.since, until=body.until, actor_id=None,
        actor=actor, db=db,
    )

    delivery_status = "queued"  # SMTP wire-up tracked in PR section F
    note = (
        f"recipient={recipient}; reason={(body.reason or '')[:120]}; "
        f"handled={summary.handled}; escalated={summary.escalated}; "
        f"paged={summary.paged}; open={summary.open}; "
        f"sla_breached={summary.sla_breached}; "
        f"since={since_dt.isoformat()}; until={until_dt.isoformat()}; "
        f"delivery_status={delivery_status}"
    )
    audit_event_id = _digest_audit(
        db,
        actor,
        event="email_sent",
        target_id=actor.clinic_id or actor.actor_id,
        note=note,
        using_demo_data=summary.is_demo_view,
    )

    return DigestSendEmailOut(
        accepted=True,
        delivery_status=delivery_status,
        recipient_email=recipient,
        audit_event_id=audit_event_id,
        note=(
            "Email queued. Actual delivery requires SMTP wire-up; until then "
            "the audit row records the intent + recipient."
        ),
    )


@router.post("/share-colleague", response_model=DigestShareColleagueOut)
def share_with_colleague(
    body: DigestShareColleagueIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestShareColleagueOut:
    """Share the digest with a colleague in the actor's clinic.

    Cross-clinic recipient → 404 for clinicians, 200 for admins. Records
    a regulator-credible audit row + ``delivery_status=queued`` until
    SMTP / Slack wire-up lands.
    """
    _gate_role(actor)

    recipient = db.query(User).filter_by(id=body.recipient_user_id).first()
    if recipient is None:
        raise ApiServiceError(
            code="not_found",
            message="Recipient user not found.",
            status_code=404,
        )
    if not _is_admin_scope(actor):
        if recipient.clinic_id != actor.clinic_id:
            raise ApiServiceError(
                code="not_found",
                message="Recipient user not found.",
                status_code=404,
            )

    since_dt, until_dt = _resolve_window(body.since, body.until)
    summary = get_summary(  # type: ignore[call-arg]
        since=body.since, until=body.until, actor_id=None,
        actor=actor, db=db,
    )

    delivery_status = "queued"
    note = (
        f"recipient_user={body.recipient_user_id}; "
        f"recipient_email={recipient.email or '-'}; "
        f"reason={(body.reason or '')[:120]}; "
        f"handled={summary.handled}; escalated={summary.escalated}; "
        f"paged={summary.paged}; open={summary.open}; "
        f"sla_breached={summary.sla_breached}; "
        f"delivery_status={delivery_status}"
    )
    audit_event_id = _digest_audit(
        db,
        actor,
        event="colleague_shared",
        target_id=body.recipient_user_id,
        note=note,
        using_demo_data=summary.is_demo_view,
    )

    return DigestShareColleagueOut(
        accepted=True,
        delivery_status=delivery_status,
        recipient_user_id=body.recipient_user_id,
        recipient_email=recipient.email,
        audit_event_id=audit_event_id,
    )


_EXPORT_COLUMNS = [
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
    "is_handled",
    "is_escalated",
    "is_paged",
    "note",
]


@router.get("/export.csv")
def export_csv(
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    surface: Optional[str] = Query(default=None, max_length=64),
    severity: Optional[str] = Query(default=None, max_length=16),
    patient_id: Optional[str] = Query(default=None, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CSV export of the digest events. DEMO-prefixed when any row is demo."""
    _gate_role(actor)

    payload = list_events(  # type: ignore[call-arg]
        since=since, until=until, surface=surface, severity=severity,
        patient_id=patient_id, limit=5000, actor=actor, db=db,
    )

    any_demo = bool(payload.is_demo_view)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_EXPORT_COLUMNS)
    for it in payload.items:
        writer.writerow([
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
            "1" if it.is_handled else "0",
            "1" if it.is_escalated else "0",
            "1" if it.is_paged else "0",
            (it.note or "").replace("\n", " ").replace("\r", " "),
        ])

    prefix = "DEMO-" if any_demo else ""
    filename = f"{prefix}clinician-digest.csv"

    _digest_audit(
        db,
        actor,
        event="export",
        target_id=actor.clinic_id or actor.actor_id,
        note=f"format=csv; rows={len(payload.items)}; demo={1 if any_demo else 0}",
        using_demo_data=any_demo,
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-ClinicianDigest-Demo": "1" if any_demo else "0",
            "Cache-Control": "no-store",
        },
    )


@router.get("/export.ndjson")
def export_ndjson(
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    surface: Optional[str] = Query(default=None, max_length=64),
    severity: Optional[str] = Query(default=None, max_length=16),
    patient_id: Optional[str] = Query(default=None, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON export — one event per line."""
    _gate_role(actor)

    payload = list_events(  # type: ignore[call-arg]
        since=since, until=until, surface=surface, severity=severity,
        patient_id=patient_id, limit=5000, actor=actor, db=db,
    )
    any_demo = bool(payload.is_demo_view)
    lines = [json.dumps(it.model_dump()) for it in payload.items]

    prefix = "DEMO-" if any_demo else ""
    filename = f"{prefix}clinician-digest.ndjson"

    _digest_audit(
        db,
        actor,
        event="export",
        target_id=actor.clinic_id or actor.actor_id,
        note=f"format=ndjson; rows={len(lines)}; demo={1 if any_demo else 0}",
        using_demo_data=any_demo,
    )

    return Response(
        content="\n".join(lines) + ("\n" if lines else ""),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-ClinicianDigest-Demo": "1" if any_demo else "0",
            "Cache-Control": "no-store",
        },
    )


@router.post("/audit-events", response_model=DigestAuditEventOut)
def post_audit_event(
    body: DigestAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestAuditEventOut:
    """Page-level audit ingestion for the Clinician Digest.

    Common events: ``view`` (mount), ``filter_changed``, ``date_range_changed``,
    ``drill_out``, ``email_initiated``, ``colleague_share_initiated``,
    ``demo_banner_shown``. Mutation events (``email_sent`` /
    ``colleague_shared`` / ``export``) are emitted by the dedicated
    endpoints above; this surface only carries page-level breadcrumbs.
    """
    _gate_role(actor)

    target_id = body.target_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    event_id = _digest_audit(
        db,
        actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=bool(body.using_demo_data),
    )
    return DigestAuditEventOut(accepted=True, event_id=event_id)
