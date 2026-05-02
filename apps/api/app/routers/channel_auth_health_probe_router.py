"""Channel-Specific Auth Health Probe control plane (CSAHP1, 2026-05-02).

Closes section I rec from the Coaching Digest Delivery Failure
Drilldown launch audit (DCRO5, #406). Companion router to
:mod:`app.workers.channel_auth_health_probe_worker`:

* ``GET  /api/v1/channel-auth-health-probe/status`` — clinic-scoped
  status snapshot. Includes ``enabled`` (whether the env-gated
  background loop is running on this process), ``last_tick_at``,
  ``next_tick_at``, and a per-channel ``{status, last_probed_at,
  error_class}`` grid so the admin frontend can render
  green/red/grey badges with "Last verified at X" timestamps.
* ``POST /api/v1/channel-auth-health-probe/tick`` — admin only debug.
  Runs ONE probe iteration synchronously bounded to the actor's
  clinic. Optional ``{channel: "slack"}`` body bounds further to one
  channel.
* ``GET  /api/v1/channel-auth-health-probe/audit-events`` —
  paginated, scoped audit-event list.

All endpoints clinic-scoped. Cross-clinic 404s come from
``actor.clinic_id`` being None for an unattached admin or a clinician
calling tick (which is admin-gated and 403s before reaching the
clinic check). Tick is admin-only.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AuditEventRecord
from app.workers.channel_auth_health_probe_worker import (
    PROBE_CHANNELS,
    WORKER_SURFACE,
    env_cooldown_hours,
    env_enabled,
    env_interval_hours,
    env_timeout_seconds,
    get_worker,
)


router = APIRouter(
    prefix="/api/v1/channel-auth-health-probe",
    tags=["Channel Auth Health Probe"],
)
_log = logging.getLogger(__name__)


_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


WORKER_DISCLAIMERS = [
    "Channel-Specific Auth Health Probe periodically probes each "
    "configured adapter's credentials (Slack OAuth, SendGrid API key, "
    "Twilio account auth, PagerDuty token) and emits an "
    "auth_drift_detected audit row BEFORE the next digest dispatch "
    "fails so admins can rotate credentials without missing a digest.",
    "Each auth_drift_detected row carries priority=high so the Clinician "
    "Inbox aggregator (#354) picks it up automatically. The matching DCRO5 "
    "drilldown click-through joins back via the (channel, week) key on the "
    "existing has_matching_misconfig_flag check.",
    "Healthy probes emit a low-volume priority=info row so the admin "
    "status grid can render an honest 'Last verified at X' timestamp "
    "without spamming the audit trail.",
    "Cooldown per (clinic, channel) is 24h by default — the worker does "
    "not re-emit either row within the cooldown window so the audit "
    "table stays bounded.",
    "Worker is honestly default-off — set CHANNEL_AUTH_HEALTH_PROBE_ENABLED "
    "to start the auto-loop. Admins can manually invoke /tick at any time "
    "regardless of the env flag.",
]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_write(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


def _scope_clinic(
    actor: AuthenticatedActor, clinic_id: Optional[str] = None
) -> Optional[str]:
    if actor.role in ("admin", "supervisor", "regulator"):
        return (clinic_id or actor.clinic_id) or None
    return actor.clinic_id


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for ``target_type=WORKER_SURFACE``."""
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"{WORKER_SURFACE}-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if using_demo_data:
        note_parts.append("DEMO")
    if actor.clinic_id:
        note_parts.append(f"clinic_id={actor.clinic_id}")
    if note:
        note_parts.append(note[:480])
    final_note = "; ".join(note_parts) or event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception("channel_auth_health_probe self-audit skipped")
    return event_id


# ── Schemas ─────────────────────────────────────────────────────────────────


class PerChannelStatus(BaseModel):
    status: str = "never"  # "healthy" | "unhealthy" | "never"
    last_probed_at: Optional[str] = None
    error_class: Optional[str] = None


class WorkerStatusOut(BaseModel):
    clinic_id: Optional[str] = None
    enabled: bool = False
    running: bool = False
    last_tick_at: Optional[str] = None
    next_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    last_tick_probes_run: int = 0
    last_tick_auth_drift_detected: int = 0
    last_tick_healthy: int = 0
    last_tick_errors: int = 0
    interval_hours: int = 12
    cooldown_hours: int = 24
    timeout_seconds: int = 10
    per_channel: dict[str, PerChannelStatus] = Field(default_factory=dict)
    is_demo_view: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(WORKER_DISCLAIMERS)
    )


class TickIn(BaseModel):
    channel: Optional[str] = Field(default=None, max_length=32)


class TickOut(BaseModel):
    accepted: bool = True
    clinic_id: Optional[str] = None
    channel: Optional[str] = None
    clinics_scanned: int = 0
    probes_run: int = 0
    auth_drift_detected: int = 0
    healthy: int = 0
    skipped_cooldown: int = 0
    skipped_no_creds: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    auth_drift_audit_event_ids: list[str] = Field(default_factory=list)
    healthy_audit_event_ids: list[str] = Field(default_factory=list)
    per_channel_status: dict[str, str] = Field(default_factory=dict)
    audit_event_id: str


class AuditEventOut(BaseModel):
    event_id: str
    target_id: str
    target_type: str
    action: str
    role: str
    actor_id: str
    note: str
    created_at: str


class AuditEventsListOut(BaseModel):
    items: list[AuditEventOut]
    total: int
    limit: int
    offset: int
    surface: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/status", response_model=WorkerStatusOut)
def worker_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkerStatusOut:
    """Clinic-scoped worker status snapshot.

    Returns honest defaults (status=never, enabled=False) when the
    worker has never run. The frontend renders three states:
    green (healthy), red (unhealthy), grey (never).
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    worker = get_worker()
    snap = worker.get_status_for_clinic(db, cid)
    is_demo = (cid or "") in _DEMO_CLINIC_IDS

    # Self-audit page-level read.
    _audit(
        db, actor,
        event="status_viewed",
        target_id=cid or actor.actor_id,
        note=f"enabled={int(snap['enabled'])}",
        using_demo_data=is_demo,
    )

    per_channel = {
        ch: PerChannelStatus(
            status=str(snap["per_channel"][ch]["status"]),
            last_probed_at=snap["per_channel"][ch]["last_probed_at"],
            error_class=snap["per_channel"][ch]["error_class"],
        )
        for ch in PROBE_CHANNELS
    }

    return WorkerStatusOut(
        clinic_id=cid,
        enabled=bool(snap["enabled"]),
        running=bool(snap["running"]),
        last_tick_at=snap["last_tick_at"],
        next_tick_at=snap["next_tick_at"],
        last_error=snap["last_error"],
        last_error_at=snap["last_error_at"],
        last_tick_probes_run=int(snap["last_tick_probes_run"]),
        last_tick_auth_drift_detected=int(snap["last_tick_auth_drift_detected"]),
        last_tick_healthy=int(snap["last_tick_healthy"]),
        last_tick_errors=int(snap["last_tick_errors"]),
        interval_hours=int(snap["interval_hours"]),
        cooldown_hours=int(snap["cooldown_hours"]),
        timeout_seconds=int(snap["timeout_seconds"]),
        per_channel=per_channel,
        is_demo_view=is_demo,
    )


@router.post("/tick", response_model=TickOut)
def worker_tick(
    body: Optional[TickIn] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TickOut:
    """Admin-only: run ONE probe iteration synchronously, bounded to
    the actor's clinic.

    Body is optional; ``{channel: "slack"}`` bounds the probe to one
    channel. Returns the synchronous counts the worker just emitted —
    the audit_event_ids point back at the rows admins should see in the
    DCRO5 drilldown click-through.
    """
    _gate_write(actor)
    cid = _scope_clinic(actor)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to run an auth-health probe.",
            status_code=400,
        )
    only_channel: Optional[str] = None
    if body and body.channel:
        ch = (body.channel or "").strip().lower()
        if ch not in PROBE_CHANNELS:
            raise ApiServiceError(
                code="unknown_channel",
                message=(
                    f"Unknown channel {ch!r}; expected one of "
                    f"{', '.join(PROBE_CHANNELS)}."
                ),
                status_code=400,
            )
        only_channel = ch

    worker = get_worker()
    result = worker.tick(
        db, only_clinic_id=cid, only_channel=only_channel
    )
    is_demo = cid in _DEMO_CLINIC_IDS
    eid = _audit(
        db, actor,
        event="tick_clicked",
        target_id=cid,
        note=(
            f"channel={only_channel or 'all'}; "
            f"probes_run={result.probes_run}; "
            f"auth_drift_detected={result.auth_drift_detected}; "
            f"healthy={result.healthy}; "
            f"errors={result.errors}"
        ),
        using_demo_data=is_demo,
    )
    return TickOut(
        accepted=True,
        clinic_id=cid,
        channel=only_channel,
        clinics_scanned=result.clinics_scanned,
        probes_run=result.probes_run,
        auth_drift_detected=result.auth_drift_detected,
        healthy=result.healthy,
        skipped_cooldown=result.skipped_cooldown,
        skipped_no_creds=result.skipped_no_creds,
        errors=result.errors,
        elapsed_ms=result.elapsed_ms,
        last_error=result.last_error,
        auth_drift_audit_event_ids=list(result.auth_drift_audit_event_ids),
        healthy_audit_event_ids=list(result.healthy_audit_event_ids),
        per_channel_status=dict(result.per_channel_status),
        audit_event_id=eid,
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=WORKER_SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list."""
    _gate_read(actor)
    cid = _scope_clinic(actor)

    s = (surface or WORKER_SURFACE).strip().lower()
    if s != WORKER_SURFACE:
        s = WORKER_SURFACE

    base = db.query(AuditEventRecord).filter(
        AuditEventRecord.target_type == s
    )
    if cid:
        from sqlalchemy import or_  # noqa: PLC0415

        base = base.filter(
            or_(
                AuditEventRecord.note.like(f"%clinic_id={cid}%"),
                AuditEventRecord.actor_id == actor.actor_id,
            )
        )
    else:
        base = base.filter(AuditEventRecord.actor_id == actor.actor_id)

    total = base.count()
    rows = (
        base.order_by(AuditEventRecord.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [
        AuditEventOut(
            event_id=r.event_id,
            target_id=r.target_id or "",
            target_type=r.target_type or "",
            action=r.action or "",
            role=r.role or "",
            actor_id=r.actor_id or "",
            note=r.note or "",
            created_at=r.created_at or "",
        )
        for r in rows
    ]
    return AuditEventsListOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        surface=s,
    )
