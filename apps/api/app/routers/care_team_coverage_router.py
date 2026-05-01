"""Care Team Coverage / Staff Scheduling launch-audit (2026-05-01).

Closes the after-hours triage loop opened by the Clinician Inbox launch
audit (#354). The Inbox aggregates HIGH-priority clinician-visible mirror
audit rows; this surface owns the **shift roster + per-surface SLA + on-call
escalation chain** and turns "an item has aged past its SLA" into a real
human page.

Sibling chain:

    Wearables Workbench (#353) ─┐
    Adverse Events Hub  (#342) ─┼─► Clinician Inbox (#354) ─► Care Team Coverage (#NEW)
    Patient surfaces #347-#352 ─┘     (HIGH-priority predicate)   (SLA breach → page on-call)

Public surface
--------------
GET    /api/v1/care-team-coverage/roster                List the actor's clinic roster (this week)
GET    /api/v1/care-team-coverage/oncall-now            Who's on call right now per surface
GET    /api/v1/care-team-coverage/sla-config            Clinic + per-surface SLA settings
GET    /api/v1/care-team-coverage/escalation-chain      Clinic + per-surface escalation chain
GET    /api/v1/care-team-coverage/sla-breaches          Live feed of HIGH-priority items past their SLA
GET    /api/v1/care-team-coverage/summary               Counts: active_shifts/oncall_now/sla_breaches_today/paged_today
GET    /api/v1/care-team-coverage/pages                 Recent on-call pages history
POST   /api/v1/care-team-coverage/roster                Admin-only: upsert a shift
POST   /api/v1/care-team-coverage/sla-config            Admin-only: upsert a per-surface SLA
POST   /api/v1/care-team-coverage/escalation-chain      Admin-only: upsert primary/backup/director
POST   /api/v1/care-team-coverage/page-oncall/{audit_event_id}  Manually page on-call (note required)
POST   /api/v1/care-team-coverage/audit-events          Page-level audit ingestion

SLA-breach feed
---------------
The breach feed reuses the Clinician Inbox HIGH-priority predicate
(`clinician_inbox_router._row_is_high_priority`) so the two surfaces stay in
lockstep. A row is "breached" when:

    age = now() - audit_event.created_at  >  sla_minutes_for(surface, 'HIGH')

…and there is no acknowledgement event for it (the same ack-keyed-by-
``audit-{event_id}`` lookup the Inbox uses). No new schema for ack state.

Manual page-on-call
-------------------
Hits ``POST /page-oncall/{audit_event_id}`` with a required note. Emits a
single canonical audit row ``inbox.item_paged_to_oncall`` plus a row in
``oncall_pages`` for indexable history. The Inbox detail view picks the
audit row up automatically because its predicate covers any action ending
in ``_to_oncall``-shaped events too — the action is ``inbox.item_paged_to_oncall``,
which surfaces in the Inbox via the page-level audit trail (admin-visible).

Role gate
---------
* clinician — read-only: ``GET`` endpoints return clinic-scoped data.
* admin / supervisor — full read+write.
* cross-clinic clinician GETs return 404; admins see all clinics.

Slack/pager wiring
------------------
Out-of-scope for this PR: actual delivery to Slack / Twilio / PagerDuty.
The page-on-call endpoint records a regulator-credible audit row and
``oncall_pages`` row with ``delivery_status='logged'``. PR section F
documents the upgrade path: when the Slack webhook URL / PagerDuty token
lands in env vars, a follow-up PR flips ``delivery_status`` to ``sent`` /
``failed`` based on the real delivery result. Today the row is enough to
prove the on-call human was selected and the contact handle was loaded.

Auto-page worker
----------------
Out-of-scope for this PR: a cron-style worker that scans the breach feed
every minute and fires the same page-oncall handler when
``escalation_chains.auto_page_enabled=True``. The infrastructure is here
(``record_oncall_page`` accepts ``trigger='auto'``), but the worker process
is not wired. The Care Team Coverage page surfaces an honest "Auto-page
worker: OFF" badge until the worker is wired.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AuditEventRecord,
    EscalationChain,
    OncallPage,
    Patient,
    SLAConfig,
    ShiftRoster,
    User,
)
from app.routers.clinician_inbox_router import (
    ALWAYS_HIGH_ACTIONS,
    _ack_lookup,
    _extract_patient_id,
    _is_demo_row,
    _row_is_high_priority,
    _split_action,
)


router = APIRouter(prefix="/api/v1/care-team-coverage", tags=["Care Team Coverage"])
_log = logging.getLogger(__name__)


# Default SLA-minute table when no clinic config has been written. These
# numbers are deliberately conservative and documented in PR section F:
# clinics override per surface via POST /sla-config, but the defaults
# guarantee we never silently treat a HIGH-priority signal as "no SLA".
DEFAULT_SLA_MINUTES: dict[str, int] = {
    "*": 60,                        # generic HIGH-priority fallback
    "wearables_workbench": 30,      # device anomaly — clinical safety
    "adverse_events_hub": 5,        # SAE drafts must page within 5 min
    "adverse_events": 5,            # AE record events
    "wearables": 30,                # patient-side anomaly
    "adherence_events": 60,         # severity>=7 side-effect mirror
    "patient_messages": 30,         # urgent patient message
    "home_program_tasks": 60,       # urgent help-request
}


COVERAGE_DISCLAIMERS = [
    "Care Team Coverage owns the on-call schedule and the SLA per surface that "
    "the Clinician Inbox uses to age out HIGH-priority items.",
    "Manual page-on-call records a regulator-credible audit row "
    "(inbox.item_paged_to_oncall). Slack/pager delivery wiring is documented in "
    "PR section F — until it lands, delivery_status='logged' means \"selected, "
    "contact loaded, audit row written\" not \"delivered\".",
    "Auto-page worker is OFF by default. Admin must enable per surface in the "
    "escalation-chain editor.",
    "Cross-clinic data is hidden from clinicians (404). Admins see all clinics.",
]


_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    """Read endpoints — clinician minimum."""
    require_minimum_role(actor, "clinician")


def _gate_write(actor: AuthenticatedActor) -> None:
    """Write endpoints — admin minimum."""
    require_minimum_role(actor, "admin")


def _is_admin_scope(actor: AuthenticatedActor) -> bool:
    return actor.role in ("admin", "supervisor", "regulator")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        if "T" not in s:
            return datetime.fromisoformat(s + "T00:00:00+00:00")
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _monday_of(d: datetime) -> str:
    """Return ISO date of the Monday of ``d``'s week."""
    monday = d - timedelta(days=d.weekday())
    return monday.date().isoformat()


def _week_start_param(week_start: Optional[str]) -> str:
    """Coerce a ``week_start`` query param to a Monday ISO date."""
    parsed = _parse_iso(week_start)
    if parsed is None:
        parsed = datetime.now(timezone.utc)
    return _monday_of(parsed)


def _scope_clinic(actor: AuthenticatedActor, clinic_id: Optional[str]) -> Optional[str]:
    """Resolve the clinic_id to scope a query to.

    * Admins may pass ``clinic_id`` to view another clinic; otherwise
      they default to their own.
    * Clinicians always see their own clinic only — any cross-clinic
      ``clinic_id`` query param is silently ignored (their own clinic is
      used).
    Returns ``None`` when no clinic is resolvable (admin with no clinic
    membership and no ``clinic_id`` param), in which case GET handlers
    return an empty list rather than 500.
    """
    if _is_admin_scope(actor):
        return (clinic_id or actor.clinic_id) or None
    return actor.clinic_id


def _ensure_user_in_clinic(db: Session, user_id: str, clinic_id: str) -> bool:
    if not user_id:
        return False
    u = db.query(User).filter_by(id=user_id).first()
    return bool(u is not None and u.clinic_id == clinic_id)


def _is_demo_actor(db: Session, actor: AuthenticatedActor) -> bool:
    return actor.clinic_id in _DEMO_CLINIC_IDS


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the ``care_team_coverage`` surface."""
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"care_team_coverage-{event}-{actor.actor_id}"
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
            target_type="care_team_coverage",
            action=f"care_team_coverage.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("care_team_coverage self-audit skipped")
    return event_id


def _resolve_oncall_for_surface(
    db: Session, clinic_id: str, surface: Optional[str]
) -> tuple[Optional[ShiftRoster], list[ShiftRoster]]:
    """Return (primary on-call shift, all matching shifts) for *now*.

    "Right now" is interpreted via the current UTC weekday + week_start.
    A roster row matches when ``is_on_call=True`` and ``surface`` is
    NULL (clinic-wide) OR the requested ``surface`` exactly.
    """
    now = datetime.now(timezone.utc)
    week_start = _monday_of(now)
    dow = now.weekday()
    q = (
        db.query(ShiftRoster)
        .filter(
            ShiftRoster.clinic_id == clinic_id,
            ShiftRoster.week_start == week_start,
            ShiftRoster.day_of_week == dow,
            ShiftRoster.is_on_call.is_(True),
        )
    )
    if surface:
        q = q.filter(or_(ShiftRoster.surface == surface, ShiftRoster.surface.is_(None)))
    rows = q.all()
    # Prefer a row whose ``surface`` exactly matches; fall back to the
    # NULL-surface "clinic default".
    if surface:
        exact = [r for r in rows if r.surface == surface]
        if exact:
            return exact[0], exact
    nulls = [r for r in rows if r.surface is None]
    if nulls:
        return nulls[0], nulls
    return (rows[0] if rows else None), rows


def _sla_minutes_for(
    db: Session, clinic_id: str, surface: str, severity: str = "HIGH"
) -> int:
    """Return the configured SLA minutes for ``(clinic, surface, severity)``.

    Resolution order:
      1. Specific surface row,
      2. Clinic-wide ``surface='*'`` row,
      3. ``DEFAULT_SLA_MINUTES[surface]``,
      4. ``DEFAULT_SLA_MINUTES['*']``.
    """
    rows = (
        db.query(SLAConfig)
        .filter(
            SLAConfig.clinic_id == clinic_id,
            SLAConfig.severity == severity,
            SLAConfig.surface.in_([surface, "*"]),
        )
        .all()
    )
    by_surface = {r.surface: r.sla_minutes for r in rows}
    if surface in by_surface:
        return int(by_surface[surface])
    if "*" in by_surface:
        return int(by_surface["*"])
    if surface in DEFAULT_SLA_MINUTES:
        return DEFAULT_SLA_MINUTES[surface]
    return DEFAULT_SLA_MINUTES["*"]


def _list_breaches(
    db: Session, clinic_id: str, *, limit: int = 200
) -> list[dict]:
    """Compute the live SLA-breach feed.

    Returns a list of dicts (audit_event row + breach metadata) for the
    HIGH-priority predicate rows authored by users at ``clinic_id`` whose
    ``age`` exceeds the SLA-minutes configured for their surface, with
    no acknowledgement event yet.
    """
    actor_ids = {
        u.id for u in db.query(User).filter(User.clinic_id == clinic_id).all()
    }
    if not actor_ids:
        return []

    high_priority_filter = or_(
        AuditEventRecord.note.like("%priority=high%"),
        AuditEventRecord.action.like("%_to_clinician"),
        AuditEventRecord.action.like("%_to_clinician_mirror"),
        AuditEventRecord.action.in_(list(ALWAYS_HIGH_ACTIONS)),
    )
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.actor_id.in_(list(actor_ids)),
            high_priority_filter,
        )
        .order_by(AuditEventRecord.id.desc())
        .limit(limit * 3)
        .all()
    )
    if not rows:
        return []

    ack_lookup = _ack_lookup(db, [r.event_id for r in rows])
    now = datetime.now(timezone.utc)
    out: list[dict] = []
    for r in rows:
        if (r.target_type or "") == "care_team_coverage":
            continue
        if (r.target_type or "") == "clinician_inbox":
            continue
        if not _row_is_high_priority(r):
            continue
        if r.event_id in ack_lookup:
            continue
        ts = _parse_iso(r.created_at)
        if ts is None:
            continue
        ts_aw = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        age_minutes = max(0, int((now - ts_aw).total_seconds() // 60))
        surface, _evt = _split_action(r.action or "")
        if surface == "unknown":
            surface = (r.target_type or "unknown")
        sla_minutes = _sla_minutes_for(db, clinic_id, surface, "HIGH")
        if age_minutes <= sla_minutes:
            continue
        patient_id = _extract_patient_id(r)
        out.append({
            "audit_event_id": r.event_id,
            "surface": surface,
            "action": r.action or "",
            "actor_id": r.actor_id or "",
            "patient_id": patient_id,
            "note": r.note or "",
            "created_at": r.created_at or "",
            "age_minutes": age_minutes,
            "sla_minutes": sla_minutes,
            "minutes_over_sla": age_minutes - sla_minutes,
            "is_demo": _is_demo_row(r),
        })
        if len(out) >= limit:
            break
    return out


# ── Schemas ─────────────────────────────────────────────────────────────────


class RosterRowOut(BaseModel):
    id: str
    clinic_id: str
    user_id: str
    user_name: Optional[str] = None
    week_start: str
    day_of_week: int
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    role: Optional[str] = None
    is_on_call: bool = False
    surface: Optional[str] = None
    contact_channel: Optional[str] = None
    contact_handle: Optional[str] = None
    note: Optional[str] = None
    created_at: str
    updated_at: str


class RosterListOut(BaseModel):
    week_start: str
    items: list[RosterRowOut] = Field(default_factory=list)
    total: int = 0
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(COVERAGE_DISCLAIMERS))


class RosterUpsertIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    week_start: str = Field(..., min_length=4, max_length=16)
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: Optional[str] = Field(default=None, max_length=8)
    end_time: Optional[str] = Field(default=None, max_length=8)
    role: Optional[str] = Field(default=None, max_length=32)
    is_on_call: bool = False
    surface: Optional[str] = Field(default=None, max_length=64)
    contact_channel: Optional[str] = Field(default=None, max_length=32)
    contact_handle: Optional[str] = Field(default=None, max_length=255)
    note: Optional[str] = Field(default=None, max_length=512)
    clinic_id: Optional[str] = Field(default=None, max_length=36)

    @field_validator("week_start")
    @classmethod
    def _ws_must_be_iso(cls, v: str) -> str:
        v = (v or "").strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("week_start must be YYYY-MM-DD")
        return v


class SLAConfigOut(BaseModel):
    id: str
    clinic_id: str
    surface: str
    severity: str
    sla_minutes: int
    note: Optional[str] = None
    is_default: bool = False  # synthesised when no row exists
    updated_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SLAConfigListOut(BaseModel):
    clinic_id: Optional[str] = None
    items: list[SLAConfigOut] = Field(default_factory=list)
    defaults: dict[str, int] = Field(default_factory=lambda: dict(DEFAULT_SLA_MINUTES))
    disclaimers: list[str] = Field(default_factory=lambda: list(COVERAGE_DISCLAIMERS))


class SLAConfigUpsertIn(BaseModel):
    surface: str = Field(..., min_length=1, max_length=64)
    severity: str = Field(default="HIGH", max_length=16)
    sla_minutes: int = Field(..., ge=1, le=24 * 60 * 7)
    note: Optional[str] = Field(default=None, max_length=512)
    clinic_id: Optional[str] = Field(default=None, max_length=36)


class EscalationChainOut(BaseModel):
    id: Optional[str] = None
    clinic_id: str
    surface: str
    primary_user_id: Optional[str] = None
    primary_user_name: Optional[str] = None
    backup_user_id: Optional[str] = None
    backup_user_name: Optional[str] = None
    director_user_id: Optional[str] = None
    director_user_name: Optional[str] = None
    auto_page_enabled: bool = False
    note: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    is_default: bool = False


class EscalationChainListOut(BaseModel):
    clinic_id: Optional[str] = None
    items: list[EscalationChainOut] = Field(default_factory=list)
    disclaimers: list[str] = Field(default_factory=lambda: list(COVERAGE_DISCLAIMERS))


class EscalationChainUpsertIn(BaseModel):
    surface: str = Field(..., min_length=1, max_length=64)
    primary_user_id: Optional[str] = Field(default=None, max_length=64)
    backup_user_id: Optional[str] = Field(default=None, max_length=64)
    director_user_id: Optional[str] = Field(default=None, max_length=64)
    auto_page_enabled: bool = False
    note: Optional[str] = Field(default=None, max_length=512)
    clinic_id: Optional[str] = Field(default=None, max_length=36)


class OncallNowRowOut(BaseModel):
    surface: str
    primary_user_id: Optional[str] = None
    primary_user_name: Optional[str] = None
    primary_contact_channel: Optional[str] = None
    primary_contact_handle: Optional[str] = None
    backup_user_id: Optional[str] = None
    backup_user_name: Optional[str] = None
    director_user_id: Optional[str] = None
    director_user_name: Optional[str] = None
    sla_minutes: int = 0
    auto_page_enabled: bool = False


class OncallNowOut(BaseModel):
    clinic_id: Optional[str] = None
    items: list[OncallNowRowOut] = Field(default_factory=list)
    disclaimers: list[str] = Field(default_factory=lambda: list(COVERAGE_DISCLAIMERS))


class SLABreachRowOut(BaseModel):
    audit_event_id: str
    surface: str
    action: str
    actor_id: str
    patient_id: Optional[str] = None
    note: str
    created_at: str
    age_minutes: int
    sla_minutes: int
    minutes_over_sla: int
    is_demo: bool = False


class SLABreachListOut(BaseModel):
    items: list[SLABreachRowOut] = Field(default_factory=list)
    total: int = 0
    disclaimers: list[str] = Field(default_factory=lambda: list(COVERAGE_DISCLAIMERS))


class CoverageSummaryOut(BaseModel):
    clinic_id: Optional[str] = None
    active_shifts: int = 0
    oncall_now: int = 0
    sla_breaches_today: int = 0
    paged_today: int = 0
    auto_page_enabled_surfaces: int = 0
    disclaimers: list[str] = Field(default_factory=lambda: list(COVERAGE_DISCLAIMERS))


class PageOnCallIn(BaseModel):
    note: str = Field(..., min_length=1, max_length=1000)
    surface: Optional[str] = Field(default=None, max_length=64)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("note cannot be blank")
        return v


class PageOnCallOut(BaseModel):
    accepted: bool = True
    audit_event_id: str
    page_id: str
    paged_user_id: Optional[str] = None
    paged_user_name: Optional[str] = None
    paged_role: Optional[str] = None
    surface: Optional[str] = None
    delivery_status: str = "logged"


class OncallPageRowOut(BaseModel):
    id: str
    clinic_id: str
    audit_event_id: str
    surface: Optional[str] = None
    paged_user_id: Optional[str] = None
    paged_role: Optional[str] = None
    paged_by: str
    trigger: str
    note: Optional[str] = None
    delivery_status: Optional[str] = None
    created_at: str


class OncallPagesListOut(BaseModel):
    items: list[OncallPageRowOut] = Field(default_factory=list)
    total: int = 0


class CoverageAuditIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    target_id: Optional[str] = Field(default=None, max_length=128)
    using_demo_data: Optional[bool] = False


class CoverageAuditOut(BaseModel):
    accepted: bool
    event_id: str


# ── Roster ──────────────────────────────────────────────────────────────────


def _roster_to_out(row: ShiftRoster, user_name: Optional[str]) -> RosterRowOut:
    return RosterRowOut(
        id=row.id,
        clinic_id=row.clinic_id,
        user_id=row.user_id,
        user_name=user_name,
        week_start=row.week_start,
        day_of_week=row.day_of_week,
        start_time=row.start_time,
        end_time=row.end_time,
        role=row.role,
        is_on_call=bool(row.is_on_call),
        surface=row.surface,
        contact_channel=row.contact_channel,
        contact_handle=row.contact_handle,
        note=row.note,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _user_name_lookup(db: Session, user_ids: list[str]) -> dict[str, str]:
    if not user_ids:
        return {}
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return {
        u.id: (u.display_name or u.email or u.id)
        for u in users
    }


@router.get("/roster", response_model=RosterListOut)
def get_roster(
    week_start: Optional[str] = Query(default=None, max_length=16),
    clinic_id: Optional[str] = Query(default=None, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> RosterListOut:
    """Return the actor's clinic roster for the given week (Mon-Sun)."""
    _gate_read(actor)
    cid = _scope_clinic(actor, clinic_id)
    ws = _week_start_param(week_start)
    if not cid:
        return RosterListOut(week_start=ws, items=[], total=0, is_demo_view=False)
    rows = (
        db.query(ShiftRoster)
        .filter(ShiftRoster.clinic_id == cid, ShiftRoster.week_start == ws)
        .order_by(ShiftRoster.day_of_week.asc(), ShiftRoster.start_time.asc())
        .all()
    )
    user_ids = list({r.user_id for r in rows})
    names = _user_name_lookup(db, user_ids)
    items = [_roster_to_out(r, names.get(r.user_id)) for r in rows]
    is_demo = _is_demo_actor(db, actor) or cid in _DEMO_CLINIC_IDS
    _audit(
        db, actor,
        event="roster_viewed",
        target_id=cid,
        note=f"week_start={ws}; rows={len(items)}",
        using_demo_data=is_demo,
    )
    return RosterListOut(
        week_start=ws,
        items=items,
        total=len(items),
        is_demo_view=is_demo,
    )


@router.post("/roster", response_model=RosterRowOut, status_code=201)
def upsert_roster(
    body: RosterUpsertIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> RosterRowOut:
    """Admin-only: upsert a single shift on the roster."""
    _gate_write(actor)
    cid = _scope_clinic(actor, body.clinic_id)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to edit the roster.",
            status_code=400,
        )
    if not _is_admin_scope(actor) or actor.clinic_id != cid:
        # Non-supervisor admins can only edit their own clinic.
        if actor.role == "admin" and actor.clinic_id != cid:
            raise ApiServiceError(
                code="cross_clinic_denied",
                message="Cannot edit another clinic's roster.",
                status_code=404,
            )
    if not _ensure_user_in_clinic(db, body.user_id, cid):
        raise ApiServiceError(
            code="user_not_in_clinic",
            message="user_id is not a member of this clinic.",
            status_code=400,
        )
    now_iso = _now_iso()
    # Idempotent on (clinic, user, week_start, dow, surface).
    row = (
        db.query(ShiftRoster)
        .filter(
            ShiftRoster.clinic_id == cid,
            ShiftRoster.user_id == body.user_id,
            ShiftRoster.week_start == body.week_start,
            ShiftRoster.day_of_week == body.day_of_week,
            ShiftRoster.surface == body.surface,
        )
        .first()
    )
    created = False
    if row is None:
        row = ShiftRoster(
            id=f"shift-{uuid.uuid4().hex[:12]}",
            clinic_id=cid,
            user_id=body.user_id,
            week_start=body.week_start,
            day_of_week=body.day_of_week,
            surface=body.surface,
            created_at=now_iso,
            updated_at=now_iso,
        )
        db.add(row)
        created = True
    row.start_time = body.start_time
    row.end_time = body.end_time
    row.role = body.role
    row.is_on_call = bool(body.is_on_call)
    row.contact_channel = body.contact_channel
    row.contact_handle = body.contact_handle
    row.note = body.note
    row.updated_at = now_iso
    db.commit()
    db.refresh(row)

    names = _user_name_lookup(db, [row.user_id])
    is_demo = _is_demo_actor(db, actor) or cid in _DEMO_CLINIC_IDS
    _audit(
        db, actor,
        event="roster_edited",
        target_id=row.id,
        note=(
            f"user={body.user_id}; week={body.week_start}; dow={body.day_of_week}; "
            f"oncall={int(bool(body.is_on_call))}; created={int(created)}"
        ),
        using_demo_data=is_demo,
    )
    return _roster_to_out(row, names.get(row.user_id))


# ── On-call now ─────────────────────────────────────────────────────────────


@router.get("/oncall-now", response_model=OncallNowOut)
def oncall_now(
    clinic_id: Optional[str] = Query(default=None, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OncallNowOut:
    """Who's on call right now, per surface."""
    _gate_read(actor)
    cid = _scope_clinic(actor, clinic_id)
    if not cid:
        return OncallNowOut(clinic_id=None, items=[])

    chains = (
        db.query(EscalationChain)
        .filter(EscalationChain.clinic_id == cid)
        .all()
    )
    surfaces = sorted({c.surface for c in chains})
    if "*" not in surfaces:
        surfaces = ["*"] + surfaces
    user_ids: set[str] = set()
    for c in chains:
        for uid in (c.primary_user_id, c.backup_user_id, c.director_user_id):
            if uid:
                user_ids.add(uid)
    items: list[OncallNowRowOut] = []
    for surface in surfaces:
        chain = next((c for c in chains if c.surface == surface), None)
        primary_shift, _all_shifts = _resolve_oncall_for_surface(
            db, cid, None if surface == "*" else surface,
        )
        primary_uid = (chain.primary_user_id if chain else None) or (
            primary_shift.user_id if primary_shift else None
        )
        if primary_uid:
            user_ids.add(primary_uid)
        names = _user_name_lookup(db, list(user_ids))
        items.append(OncallNowRowOut(
            surface=surface,
            primary_user_id=primary_uid,
            primary_user_name=names.get(primary_uid) if primary_uid else None,
            primary_contact_channel=primary_shift.contact_channel if primary_shift else None,
            primary_contact_handle=primary_shift.contact_handle if primary_shift else None,
            backup_user_id=chain.backup_user_id if chain else None,
            backup_user_name=names.get(chain.backup_user_id) if chain and chain.backup_user_id else None,
            director_user_id=chain.director_user_id if chain else None,
            director_user_name=names.get(chain.director_user_id) if chain and chain.director_user_id else None,
            sla_minutes=_sla_minutes_for(db, cid, surface, "HIGH"),
            auto_page_enabled=bool(chain.auto_page_enabled) if chain else False,
        ))

    _audit(
        db, actor,
        event="oncall_viewed",
        target_id=cid,
        note=f"rows={len(items)}",
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return OncallNowOut(clinic_id=cid, items=items)


# ── SLA config ──────────────────────────────────────────────────────────────


def _sla_to_out(row: SLAConfig) -> SLAConfigOut:
    return SLAConfigOut(
        id=row.id,
        clinic_id=row.clinic_id,
        surface=row.surface,
        severity=row.severity,
        sla_minutes=row.sla_minutes,
        note=row.note,
        updated_by=row.updated_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        is_default=False,
    )


@router.get("/sla-config", response_model=SLAConfigListOut)
def get_sla_config(
    clinic_id: Optional[str] = Query(default=None, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SLAConfigListOut:
    """Per-surface SLA-minute settings for the actor's clinic."""
    _gate_read(actor)
    cid = _scope_clinic(actor, clinic_id)
    if not cid:
        return SLAConfigListOut(clinic_id=None, items=[])

    rows = (
        db.query(SLAConfig)
        .filter(SLAConfig.clinic_id == cid)
        .order_by(SLAConfig.surface.asc(), SLAConfig.severity.asc())
        .all()
    )
    items = [_sla_to_out(r) for r in rows]
    # Synthesise a default row for any surface not configured.
    have = {(r.surface, r.severity) for r in rows}
    for surface, mins in DEFAULT_SLA_MINUTES.items():
        if (surface, "HIGH") in have:
            continue
        items.append(SLAConfigOut(
            id=f"default-{cid}-{surface}",
            clinic_id=cid,
            surface=surface,
            severity="HIGH",
            sla_minutes=mins,
            note=None,
            is_default=True,
        ))
    items.sort(key=lambda it: (it.surface != "*", it.surface, it.severity))
    _audit(
        db, actor,
        event="sla_config_viewed",
        target_id=cid,
        note=f"rows={len(rows)}",
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return SLAConfigListOut(clinic_id=cid, items=items)


@router.post("/sla-config", response_model=SLAConfigOut, status_code=201)
def upsert_sla_config(
    body: SLAConfigUpsertIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SLAConfigOut:
    """Admin-only: upsert per-surface SLA."""
    _gate_write(actor)
    cid = _scope_clinic(actor, body.clinic_id)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to edit SLA.",
            status_code=400,
        )
    if actor.role == "admin" and actor.clinic_id != cid:
        raise ApiServiceError(
            code="cross_clinic_denied",
            message="Cannot edit another clinic's SLA.",
            status_code=404,
        )
    surface = body.surface.strip()
    severity = (body.severity or "HIGH").strip().upper()
    now_iso = _now_iso()
    row = (
        db.query(SLAConfig)
        .filter(
            SLAConfig.clinic_id == cid,
            SLAConfig.surface == surface,
            SLAConfig.severity == severity,
        )
        .first()
    )
    if row is None:
        row = SLAConfig(
            id=f"sla-{uuid.uuid4().hex[:12]}",
            clinic_id=cid,
            surface=surface,
            severity=severity,
            sla_minutes=int(body.sla_minutes),
            note=body.note,
            updated_by=actor.actor_id,
            created_at=now_iso,
            updated_at=now_iso,
        )
        db.add(row)
    else:
        row.sla_minutes = int(body.sla_minutes)
        row.note = body.note
        row.updated_by = actor.actor_id
        row.updated_at = now_iso
    db.commit()
    db.refresh(row)
    _audit(
        db, actor,
        event="sla_edited",
        target_id=row.id,
        note=f"surface={surface}; severity={severity}; minutes={row.sla_minutes}",
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return _sla_to_out(row)


# ── Escalation chain ────────────────────────────────────────────────────────


def _chain_to_out(
    row: EscalationChain, names: dict[str, str]
) -> EscalationChainOut:
    return EscalationChainOut(
        id=row.id,
        clinic_id=row.clinic_id,
        surface=row.surface,
        primary_user_id=row.primary_user_id,
        primary_user_name=names.get(row.primary_user_id) if row.primary_user_id else None,
        backup_user_id=row.backup_user_id,
        backup_user_name=names.get(row.backup_user_id) if row.backup_user_id else None,
        director_user_id=row.director_user_id,
        director_user_name=names.get(row.director_user_id) if row.director_user_id else None,
        auto_page_enabled=bool(row.auto_page_enabled),
        note=row.note,
        updated_by=row.updated_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        is_default=False,
    )


@router.get("/escalation-chain", response_model=EscalationChainListOut)
def get_escalation_chain(
    clinic_id: Optional[str] = Query(default=None, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> EscalationChainListOut:
    """Per-surface escalation chain (primary/backup/director)."""
    _gate_read(actor)
    cid = _scope_clinic(actor, clinic_id)
    if not cid:
        return EscalationChainListOut(clinic_id=None, items=[])

    rows = (
        db.query(EscalationChain)
        .filter(EscalationChain.clinic_id == cid)
        .order_by(EscalationChain.surface.asc())
        .all()
    )
    user_ids: set[str] = set()
    for r in rows:
        for uid in (r.primary_user_id, r.backup_user_id, r.director_user_id):
            if uid:
                user_ids.add(uid)
    names = _user_name_lookup(db, list(user_ids))
    items = [_chain_to_out(r, names) for r in rows]
    _audit(
        db, actor,
        event="chain_viewed",
        target_id=cid,
        note=f"rows={len(items)}",
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return EscalationChainListOut(clinic_id=cid, items=items)


@router.post("/escalation-chain", response_model=EscalationChainOut, status_code=201)
def upsert_escalation_chain(
    body: EscalationChainUpsertIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> EscalationChainOut:
    """Admin-only: upsert primary/backup/director per surface."""
    _gate_write(actor)
    cid = _scope_clinic(actor, body.clinic_id)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to edit escalation chain.",
            status_code=400,
        )
    if actor.role == "admin" and actor.clinic_id != cid:
        raise ApiServiceError(
            code="cross_clinic_denied",
            message="Cannot edit another clinic's escalation chain.",
            status_code=404,
        )
    surface = body.surface.strip()
    for label, uid in (
        ("primary", body.primary_user_id),
        ("backup", body.backup_user_id),
        ("director", body.director_user_id),
    ):
        if uid and not _ensure_user_in_clinic(db, uid, cid):
            raise ApiServiceError(
                code=f"{label}_not_in_clinic",
                message=f"{label}_user_id is not a member of this clinic.",
                status_code=400,
            )
    now_iso = _now_iso()
    row = (
        db.query(EscalationChain)
        .filter(
            EscalationChain.clinic_id == cid,
            EscalationChain.surface == surface,
        )
        .first()
    )
    if row is None:
        row = EscalationChain(
            id=f"chain-{uuid.uuid4().hex[:12]}",
            clinic_id=cid,
            surface=surface,
            primary_user_id=body.primary_user_id,
            backup_user_id=body.backup_user_id,
            director_user_id=body.director_user_id,
            auto_page_enabled=bool(body.auto_page_enabled),
            note=body.note,
            updated_by=actor.actor_id,
            created_at=now_iso,
            updated_at=now_iso,
        )
        db.add(row)
    else:
        row.primary_user_id = body.primary_user_id
        row.backup_user_id = body.backup_user_id
        row.director_user_id = body.director_user_id
        row.auto_page_enabled = bool(body.auto_page_enabled)
        row.note = body.note
        row.updated_by = actor.actor_id
        row.updated_at = now_iso
    db.commit()
    db.refresh(row)

    names = _user_name_lookup(db, [
        u for u in (row.primary_user_id, row.backup_user_id, row.director_user_id) if u
    ])
    _audit(
        db, actor,
        event="chain_edited",
        target_id=row.id,
        note=(
            f"surface={surface}; primary={row.primary_user_id or '-'}; "
            f"backup={row.backup_user_id or '-'}; director={row.director_user_id or '-'}; "
            f"auto_page={int(bool(row.auto_page_enabled))}"
        ),
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return _chain_to_out(row, names)


# ── SLA breaches ────────────────────────────────────────────────────────────


@router.get("/sla-breaches", response_model=SLABreachListOut)
def list_sla_breaches(
    clinic_id: Optional[str] = Query(default=None, max_length=36),
    limit: int = Query(default=200, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SLABreachListOut:
    """Live HIGH-priority items past their SLA, with no acknowledgement."""
    _gate_read(actor)
    cid = _scope_clinic(actor, clinic_id)
    if not cid:
        return SLABreachListOut(items=[], total=0)
    rows = _list_breaches(db, cid, limit=limit)
    items = [SLABreachRowOut(**r) for r in rows]
    _audit(
        db, actor,
        event="sla_breaches_viewed",
        target_id=cid,
        note=f"rows={len(items)}",
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return SLABreachListOut(items=items, total=len(items))


# ── Summary ─────────────────────────────────────────────────────────────────


@router.get("/summary", response_model=CoverageSummaryOut)
def coverage_summary(
    clinic_id: Optional[str] = Query(default=None, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CoverageSummaryOut:
    """Top counts: active_shifts / oncall_now / sla_breaches_today / paged_today."""
    _gate_read(actor)
    cid = _scope_clinic(actor, clinic_id)
    if not cid:
        return CoverageSummaryOut(clinic_id=None)

    now = datetime.now(timezone.utc)
    week_start = _monday_of(now)
    dow = now.weekday()

    active_shifts = (
        db.query(ShiftRoster)
        .filter(
            ShiftRoster.clinic_id == cid,
            ShiftRoster.week_start == week_start,
            ShiftRoster.day_of_week == dow,
        )
        .count()
    )
    oncall_now_count = (
        db.query(ShiftRoster)
        .filter(
            ShiftRoster.clinic_id == cid,
            ShiftRoster.week_start == week_start,
            ShiftRoster.day_of_week == dow,
            ShiftRoster.is_on_call.is_(True),
        )
        .count()
    )
    breaches = _list_breaches(db, cid, limit=500)
    auto_enabled = (
        db.query(EscalationChain)
        .filter(
            EscalationChain.clinic_id == cid,
            EscalationChain.auto_page_enabled.is_(True),
        )
        .count()
    )
    today_iso = now.date().isoformat()
    paged_today = (
        db.query(OncallPage)
        .filter(
            OncallPage.clinic_id == cid,
            OncallPage.created_at.like(f"{today_iso}%"),
        )
        .count()
    )

    return CoverageSummaryOut(
        clinic_id=cid,
        active_shifts=active_shifts,
        oncall_now=oncall_now_count,
        sla_breaches_today=len(breaches),
        paged_today=paged_today,
        auto_page_enabled_surfaces=auto_enabled,
    )


# ── Pages history ───────────────────────────────────────────────────────────


def _page_to_out(row: OncallPage) -> OncallPageRowOut:
    return OncallPageRowOut(
        id=row.id,
        clinic_id=row.clinic_id,
        audit_event_id=row.audit_event_id,
        surface=row.surface,
        paged_user_id=row.paged_user_id,
        paged_role=row.paged_role,
        paged_by=row.paged_by,
        trigger=row.trigger,
        note=row.note,
        delivery_status=row.delivery_status,
        created_at=row.created_at,
    )


@router.get("/pages", response_model=OncallPagesListOut)
def list_pages(
    clinic_id: Optional[str] = Query(default=None, max_length=36),
    limit: int = Query(default=100, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OncallPagesListOut:
    """Recent on-call pages history (manual + auto)."""
    _gate_read(actor)
    cid = _scope_clinic(actor, clinic_id)
    if not cid:
        return OncallPagesListOut(items=[], total=0)
    rows = (
        db.query(OncallPage)
        .filter(OncallPage.clinic_id == cid)
        .order_by(OncallPage.id.desc())
        .limit(limit)
        .all()
    )
    return OncallPagesListOut(
        items=[_page_to_out(r) for r in rows],
        total=len(rows),
    )


# ── Manual page-on-call ─────────────────────────────────────────────────────


def _record_oncall_page(
    db: Session,
    actor: AuthenticatedActor,
    *,
    clinic_id: str,
    audit_event_id: str,
    surface: Optional[str],
    paged_user_id: Optional[str],
    paged_role: Optional[str],
    note: str,
    trigger: str,
    delivery_status: str = "logged",
) -> tuple[OncallPage, str]:
    """Write the canonical audit row + the indexable mirror row.

    The audit action is intentionally ``inbox.item_paged_to_oncall`` so it
    surfaces inside the Clinician Inbox page-level audit and the regulator
    audit trail under the existing ``clinician_inbox`` whitelist entry —
    no new surface plumbing required.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    audit_eid = (
        f"inbox-item_paged_to_oncall-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if clinic_id in _DEMO_CLINIC_IDS:
        note_parts.append("DEMO")
    note_parts.append(f"event={audit_event_id}")
    if surface:
        note_parts.append(f"surface={surface}")
    if paged_user_id:
        note_parts.append(f"paged={paged_user_id}")
    if paged_role:
        note_parts.append(f"role={paged_role}")
    note_parts.append(f"trigger={trigger}")
    note_parts.append(note[:480])
    final_note = "; ".join(note_parts)
    try:
        create_audit_event(
            db,
            event_id=audit_eid,
            target_id=audit_event_id,
            target_type="clinician_inbox",
            action="inbox.item_paged_to_oncall",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _log.exception("page-on-call audit emit failed")
        raise ApiServiceError(
            code="audit_write_failed",
            message="Could not record page-on-call.",
            status_code=500,
        )
    page_row = OncallPage(
        id=f"page-{uuid.uuid4().hex[:12]}",
        clinic_id=clinic_id,
        audit_event_id=audit_event_id,
        surface=surface,
        paged_user_id=paged_user_id,
        paged_role=paged_role,
        paged_by=actor.actor_id,
        trigger=trigger,
        note=note[:480],
        delivery_status=delivery_status,
        created_at=now.isoformat(),
    )
    db.add(page_row)
    db.commit()
    db.refresh(page_row)
    return page_row, audit_eid


def _page_oncall_impl(
    db: Session,
    actor: AuthenticatedActor,
    *,
    audit_event_id: str,
    note: str,
    surface_override: Optional[str] = None,
    trigger: str = "manual",
    delivery_status: str = "logged",
    enforce_clinic_scope: bool = True,
) -> PageOnCallOut:
    """In-process page-on-call worker. Used by both the manual HTTP handler
    and the auto-page background worker.

    Splitting the body out from the FastAPI handler so the auto-page worker
    (``app.workers.auto_page_worker``) can call it without an HTTP roundtrip
    and without paying the request-lifecycle cost (rate-limiter, JSON
    encode/decode). The handler itself is now a thin wrapper that calls
    this function with ``trigger='manual'``.

    Parameters
    ----------
    enforce_clinic_scope
        When ``True`` (default for manual HTTP path), non-admin actors must
        share a clinic with the audit-row author or a 404 is raised. The
        auto-page worker passes ``False`` because it always calls with a
        synthetic admin-scope actor that owns the clinic of the breach.
    trigger
        ``"manual"`` for HTTP click; ``"auto"`` for the background worker.
    delivery_status
        ``"logged"`` until a real Slack/Twilio/PagerDuty adapter is wired
        (PR section F). ``"queued"`` is a synonym used by the worker when
        an external delivery adapter is configured but has not yet
        confirmed delivery.
    """
    record = (
        db.query(AuditEventRecord)
        .filter(AuditEventRecord.event_id == audit_event_id)
        .one_or_none()
    )
    if record is None:
        raise ApiServiceError(
            code="not_found",
            message="Audit event not found.",
            status_code=404,
        )
    # Cross-clinic visibility check: the audit row must be authored by a
    # user in the actor's clinic (admins see all clinics).
    if enforce_clinic_scope and not _is_admin_scope(actor):
        author = db.query(User).filter_by(id=record.actor_id).first()
        if author is None or author.clinic_id != actor.clinic_id:
            raise ApiServiceError(
                code="not_found",
                message="Audit event not found.",
                status_code=404,
            )

    # Resolve the on-call human for the surface.
    author = db.query(User).filter_by(id=record.actor_id).first()
    cid = (author.clinic_id if author and author.clinic_id else actor.clinic_id)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Cannot resolve clinic from audit event author.",
            status_code=400,
        )
    surface = surface_override
    if not surface:
        s, _evt = _split_action(record.action or "")
        surface = s if s and s != "unknown" else (record.target_type or None)

    chain = (
        db.query(EscalationChain)
        .filter(EscalationChain.clinic_id == cid, EscalationChain.surface == surface)
        .first()
        if surface else None
    )
    if chain is None:
        chain = (
            db.query(EscalationChain)
            .filter(EscalationChain.clinic_id == cid, EscalationChain.surface == "*")
            .first()
        )
    primary_uid = chain.primary_user_id if chain else None
    if not primary_uid:
        primary_shift, _all = _resolve_oncall_for_surface(db, cid, surface)
        primary_uid = primary_shift.user_id if primary_shift else None
    paged_role = "primary" if primary_uid else None

    page_row, audit_eid = _record_oncall_page(
        db, actor,
        clinic_id=cid,
        audit_event_id=audit_event_id,
        surface=surface,
        paged_user_id=primary_uid,
        paged_role=paged_role,
        note=note,
        trigger=trigger,
        delivery_status=delivery_status,
    )
    name = None
    if primary_uid:
        u = db.query(User).filter_by(id=primary_uid).first()
        name = (u.display_name or u.email) if u else None

    # Page-level audit so the Care Team Coverage surface tracks the click.
    audit_event = "manual_page_fired" if trigger == "manual" else "auto_page_fired"
    _audit(
        db, actor,
        event=audit_event,
        target_id=audit_event_id,
        note=(
            f"page_id={page_row.id}; surface={surface or '-'}; "
            f"paged={primary_uid or '-'}; trigger={trigger}"
        ),
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return PageOnCallOut(
        accepted=True,
        audit_event_id=audit_eid,
        page_id=page_row.id,
        paged_user_id=primary_uid,
        paged_user_name=name,
        paged_role=paged_role,
        surface=surface,
        delivery_status=delivery_status,
    )


@router.post("/page-oncall/{audit_event_id}", response_model=PageOnCallOut)
def page_oncall(
    body: PageOnCallIn,
    audit_event_id: str = Path(..., min_length=1, max_length=128),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PageOnCallOut:
    """Manually page on-call for a HIGH-priority audit row.

    * Note required.
    * 404 if the audit row is not visible at the actor's clinic scope.
    * Emits ``inbox.item_paged_to_oncall`` audit row + ``oncall_pages`` row.

    Body is delegated to :func:`_page_oncall_impl` so the auto-page
    background worker can reuse the same code path without an HTTP
    roundtrip.
    """
    _gate_read(actor)
    return _page_oncall_impl(
        db, actor,
        audit_event_id=audit_event_id,
        note=body.note,
        surface_override=body.surface,
        trigger="manual",
        delivery_status="logged",
        enforce_clinic_scope=True,
    )


# ── Audit ingestion ─────────────────────────────────────────────────────────


@router.post("/audit-events", response_model=CoverageAuditOut)
def post_audit_event(
    body: CoverageAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CoverageAuditOut:
    """Page-level audit ingestion for the Care Team Coverage surface."""
    _gate_read(actor)
    target = body.target_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event
    eid = _audit(
        db, actor,
        event=body.event,
        target_id=target,
        note=note,
        using_demo_data=bool(body.using_demo_data),
    )
    return CoverageAuditOut(accepted=True, event_id=eid)
