from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import hmac
from typing import Literal

from fastapi import APIRouter, Body, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import FounderDashSystemEvent, FounderDashTask
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/founder-dash", tags=["founder-dash"])

BoardId = Literal["global-inbox", "personal", "perfflux", "deepsynaps", "governance"]
TaskSource = Literal[
    "dash",
    "telegram-personal",
    "telegram-perfflux",
    "telegram-deepsynaps",
    "telegram-governance",
    "openclaw-personal",
    "openclaw-perfflux",
    "hermes",
    "paperclip",
    "bridge",
]
TaskPriority = Literal["routine", "P2", "P1", "P0"]
TaskStatus = Literal["todo", "in_progress", "waiting", "done"]
SourceSystem = Literal["telegram", "openclaw", "paperclip", "hermes", "dash"]

BOARD_META: dict[BoardId, dict[str, str]] = {
    "global-inbox": {"system": "Router", "owner": "global-inbox-router"},
    "personal": {"system": "AliSlave AI", "owner": "alislave-ai"},
    "perfflux": {"system": "Perfflux HQ", "owner": "perfflux-hq"},
    "deepsynaps": {"system": "Hermes", "owner": "coordinator"},
    "governance": {"system": "Paperclip", "owner": "paperclip-governance-bridge"},
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _require_founder_dash_access(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "technician")


_DEV_TEST_ENVS = frozenset({"development", "test"})


def _bridge_secret_ok(presented: str | None) -> bool:
    settings = get_settings()
    expected = (settings.founder_dash_bridge_key or "").strip()
    app_env = (settings.app_env or "development").lower()
    if not expected:
        return app_env in _DEV_TEST_ENVS
    return hmac.compare_digest((presented or "").strip(), expected)


def _require_bridge_access(presented: str | None) -> None:
    if _bridge_secret_ok(presented):
        return
    raise ApiServiceError(
        code="founder_dash_bridge_unauthorized",
        message="Founder dash bridge secret missing or invalid.",
        status_code=401,
    )


def _resolve_bridge_actor(actor_id: str | None, actor_role: str | None) -> tuple[str, str]:
    settings = get_settings()
    resolved_actor_id = (actor_id or settings.founder_dash_bridge_actor_id or "").strip()
    resolved_actor_role = (actor_role or settings.founder_dash_bridge_actor_role or "admin").strip() or "admin"
    if not resolved_actor_id:
        raise ApiServiceError(
            code="founder_dash_bridge_actor_required",
            message="Founder dash bridge actor_id is required.",
            status_code=400,
        )
    return resolved_actor_id, resolved_actor_role


def _route_founder_task(*, title: str, notes: str | None, source: TaskSource) -> tuple[BoardId, str, str, str]:
    text = f"{title} {notes or ''}".lower()
    if source == "telegram-personal":
        return "personal", "AliSlave AI", "alislave-ai", "Personal Telegram routes to your private assistant."
    if source == "telegram-perfflux":
        return "perfflux", "Perfflux HQ", "perfflux-hq", "PerfFlux Telegram routes to company operations."
    if source == "telegram-deepsynaps":
        return "deepsynaps", "Hermes", "coordinator", "DeepSynaps Telegram routes to product execution."
    if source == "telegram-governance":
        return "governance", "Paperclip", "paperclip-governance-bridge", "Governance Telegram routes to approvals and cross-project decisions."
    if source == "openclaw-personal":
        return "personal", "AliSlave AI", "alislave-ai", "AliSlave AI routes to your personal execution board."
    if source == "openclaw-perfflux":
        return "perfflux", "Perfflux HQ", "perfflux-hq", "Perfflux HQ routes to company operations."
    if source == "hermes":
        return "deepsynaps", "Hermes", "coordinator", "Hermes routes to DeepSynaps execution."
    if source == "paperclip":
        return "governance", "Paperclip", "paperclip-governance-bridge", "Paperclip routes to governance and portfolio work."
    if any(token in text for token in ("approve", "approval", "hire", "staff", "governance", "dependency", "dependencies", "portfolio", "cross-project")):
        return "governance", "Paperclip", "paperclip-governance-bridge", "This reads like governance, approvals, or staffing work."
    if any(token in text for token in ("release", "deploy", "qa", "bug", "doctor", "patient", "protocol", "studio", "launch", "smoke", "tls", "backup", "restore", "deepsynaps", "hermes")):
        return "deepsynaps", "Hermes", "coordinator", "This looks like DeepSynaps delivery or release work."
    if any(token in text for token in ("perfflux", "partner", "customer", "sales", "pipeline", "investor", "company", "ops", "market", "pricing")):
        return "perfflux", "Perfflux HQ", "perfflux-hq", "This looks like PerfFlux company work."
    if any(token in text for token in ("personal", "reminder", "travel", "calendar", "private", "note", "family", "today", "buy", "book", "life", "admin")):
        return "personal", "AliSlave AI", "alislave-ai", "This looks like personal or founder admin work."
    return "global-inbox", "Router", "global-inbox-router", "Ambiguous task kept in the global inbox for routing review."


class FounderDashTaskOut(BaseModel):
    id: str
    board: BoardId
    system: str
    owner: str
    title: str
    notes: str | None = None
    source: TaskSource
    priority: TaskPriority
    status: TaskStatus
    route_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class FounderDashTaskListOut(BaseModel):
    items: list[FounderDashTaskOut]


class FounderDashTaskCreateIn(BaseModel):
    board: BoardId
    system: str = Field(..., min_length=1, max_length=64)
    owner: str = Field(..., min_length=1, max_length=128)
    title: str = Field(..., min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    source: TaskSource = "dash"
    priority: TaskPriority = "routine"
    status: TaskStatus = "todo"
    route_reason: str | None = Field(default=None, max_length=4000)


class FounderDashTaskPatchIn(BaseModel):
    board: BoardId | None = None
    system: str | None = Field(default=None, min_length=1, max_length=64)
    owner: str | None = Field(default=None, min_length=1, max_length=128)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    source: TaskSource | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    route_reason: str | None = Field(default=None, max_length=4000)


class FounderDashIntakeIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    source: TaskSource = "dash"
    priority: TaskPriority = "routine"


class FounderDashBridgeIntakeIn(BaseModel):
    actor_id: str | None = Field(default=None, min_length=1, max_length=64)
    actor_role: str | None = Field(default=None, min_length=1, max_length=32)
    title: str = Field(..., min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    source: TaskSource = "bridge"
    priority: TaskPriority = "routine"


class FounderDashSystemEventIn(BaseModel):
    source_system: SourceSystem
    event_kind: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=255)
    detail: str | None = Field(default=None, max_length=4000)
    board: BoardId | None = None
    owner: str | None = Field(default=None, min_length=1, max_length=128)
    related_task_id: str | None = Field(default=None, max_length=36)


class FounderDashBridgeSystemEventIn(BaseModel):
    actor_id: str | None = Field(default=None, min_length=1, max_length=64)
    actor_role: str | None = Field(default=None, min_length=1, max_length=32)
    source_system: SourceSystem
    event_kind: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=255)
    detail: str | None = Field(default=None, max_length=4000)
    board: BoardId | None = None
    owner: str | None = Field(default=None, min_length=1, max_length=128)
    related_task_id: str | None = Field(default=None, max_length=36)


class FounderDashSystemEventOut(BaseModel):
    id: str
    source_system: str
    event_kind: str
    board: str | None = None
    owner: str | None = None
    title: str
    detail: str | None = None
    related_task_id: str | None = None
    created_at: datetime


class FounderDashBoardOverviewOut(BaseModel):
    board: BoardId
    total: int
    open: int
    waiting: int
    in_progress: int


class FounderDashOverviewOut(BaseModel):
    boards: list[FounderDashBoardOverviewOut]
    recent_events: list[FounderDashSystemEventOut]


def _to_out(row: FounderDashTask) -> FounderDashTaskOut:
    return FounderDashTaskOut(
        id=row.id,
        board=row.board,
        system=row.system,
        owner=row.owner,
        title=row.title,
        notes=row.notes,
        source=row.source,
        priority=row.priority,
        status=row.status,
        route_reason=row.route_reason,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_event_out(row: FounderDashSystemEvent) -> FounderDashSystemEventOut:
    return FounderDashSystemEventOut(
        id=row.id,
        source_system=row.source_system,
        event_kind=row.event_kind,
        board=row.board,
        owner=row.owner,
        title=row.title,
        detail=row.detail,
        related_task_id=row.related_task_id,
        created_at=row.created_at,
    )


@router.get("/tasks", response_model=FounderDashTaskListOut)
def list_founder_dash_tasks(
    board: BoardId | None = Query(default=None),
    source: TaskSource | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FounderDashTaskListOut:
    _require_founder_dash_access(actor)
    q = db.query(FounderDashTask).filter(FounderDashTask.actor_id == actor.actor_id)
    if board is not None:
        q = q.filter(FounderDashTask.board == board)
    if source is not None:
        q = q.filter(FounderDashTask.source == source)
    rows = q.order_by(FounderDashTask.updated_at.desc(), FounderDashTask.created_at.desc()).all()
    return FounderDashTaskListOut(items=[_to_out(row) for row in rows])


@router.get("/overview", response_model=FounderDashOverviewOut)
def founder_dash_overview(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FounderDashOverviewOut:
    _require_founder_dash_access(actor)
    rows = (
        db.query(FounderDashTask)
        .filter(FounderDashTask.actor_id == actor.actor_id)
        .order_by(FounderDashTask.updated_at.desc())
        .all()
    )
    events = (
        db.query(FounderDashSystemEvent)
        .filter(FounderDashSystemEvent.actor_id == actor.actor_id)
        .order_by(FounderDashSystemEvent.created_at.desc())
        .limit(12)
        .all()
    )
    grouped: dict[BoardId, list[FounderDashTask]] = {board: [] for board in BOARD_META}
    for row in rows:
        grouped[row.board].append(row)
    boards = []
    for board_id, items in grouped.items():
        counts = Counter(item.status for item in items)
        boards.append(
            FounderDashBoardOverviewOut(
                board=board_id,
                total=len(items),
                open=sum(1 for item in items if item.status != "done"),
                waiting=counts.get("waiting", 0),
                in_progress=counts.get("in_progress", 0),
            )
        )
    return FounderDashOverviewOut(boards=boards, recent_events=[_to_event_out(row) for row in events])


@router.post("/tasks", response_model=FounderDashTaskOut)
def create_founder_dash_task(
    body: FounderDashTaskCreateIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FounderDashTaskOut:
    _require_founder_dash_access(actor)
    now = _utcnow()
    row = FounderDashTask(
        actor_id=actor.actor_id,
        actor_role=actor.role,
        board=body.board,
        system=body.system,
        owner=body.owner,
        title=body.title,
        notes=body.notes,
        source=body.source,
        priority=body.priority,
        status=body.status,
        route_reason=body.route_reason,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/intake", response_model=FounderDashTaskOut)
def founder_dash_intake(
    body: FounderDashIntakeIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FounderDashTaskOut:
    _require_founder_dash_access(actor)
    board, system, owner, reason = _route_founder_task(title=body.title, notes=body.notes, source=body.source)
    create_body = FounderDashTaskCreateIn(
        board=board,
        system=system,
        owner=owner,
        title=body.title,
        notes=body.notes,
        source=body.source,
        priority=body.priority,
        status="todo",
        route_reason=reason,
    )
    return create_founder_dash_task(create_body, actor, db)


@router.post("/bridge/intake", response_model=FounderDashTaskOut)
def founder_dash_bridge_intake(
    body: FounderDashBridgeIntakeIn = Body(...),
    x_founder_dash_bridge_key: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> FounderDashTaskOut:
    _require_bridge_access(x_founder_dash_bridge_key)
    actor_id, actor_role = _resolve_bridge_actor(body.actor_id, body.actor_role)
    board, system, owner, reason = _route_founder_task(title=body.title, notes=body.notes, source=body.source)
    now = _utcnow()
    row = FounderDashTask(
        actor_id=actor_id,
        actor_role=actor_role,
        board=board,
        system=system,
        owner=owner,
        title=body.title,
        notes=body.notes,
        source=body.source,
        priority=body.priority,
        status="todo",
        route_reason=reason,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/system-events", response_model=FounderDashSystemEventOut)
def create_founder_dash_system_event(
    body: FounderDashSystemEventIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FounderDashSystemEventOut:
    _require_founder_dash_access(actor)
    row = FounderDashSystemEvent(
        actor_id=actor.actor_id,
        source_system=body.source_system,
        event_kind=body.event_kind,
        board=body.board,
        owner=body.owner,
        title=body.title,
        detail=body.detail,
        related_task_id=body.related_task_id,
        created_at=_utcnow(),
    )
    db.add(row)
    if body.related_task_id:
        task = (
            db.query(FounderDashTask)
            .filter(FounderDashTask.id == body.related_task_id, FounderDashTask.actor_id == actor.actor_id)
            .first()
        )
        if task is not None and body.detail:
            base = (task.notes or "").strip()
            task.notes = f"{base}\n\n[{body.source_system}:{body.event_kind}] {body.detail}".strip()
            task.updated_at = _utcnow()
            db.add(task)
    db.commit()
    db.refresh(row)
    return _to_event_out(row)


@router.post("/bridge/system-events", response_model=FounderDashSystemEventOut)
def create_founder_dash_bridge_system_event(
    body: FounderDashBridgeSystemEventIn = Body(...),
    x_founder_dash_bridge_key: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> FounderDashSystemEventOut:
    _require_bridge_access(x_founder_dash_bridge_key)
    actor_id, _actor_role = _resolve_bridge_actor(body.actor_id, body.actor_role)
    row = FounderDashSystemEvent(
        actor_id=actor_id,
        source_system=body.source_system,
        event_kind=body.event_kind,
        board=body.board,
        owner=body.owner,
        title=body.title,
        detail=body.detail,
        related_task_id=body.related_task_id,
        created_at=_utcnow(),
    )
    db.add(row)
    if body.related_task_id:
        task = (
            db.query(FounderDashTask)
            .filter(FounderDashTask.id == body.related_task_id, FounderDashTask.actor_id == actor_id)
            .first()
        )
        if task is not None and body.detail:
            base = (task.notes or "").strip()
            task.notes = f"{base}\n\n[{body.source_system}:{body.event_kind}] {body.detail}".strip()
            task.updated_at = _utcnow()
            db.add(task)
    db.commit()
    db.refresh(row)
    return _to_event_out(row)


@router.patch("/tasks/{task_id}", response_model=FounderDashTaskOut)
def patch_founder_dash_task(
    task_id: str,
    body: FounderDashTaskPatchIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FounderDashTaskOut:
    _require_founder_dash_access(actor)
    row = (
        db.query(FounderDashTask)
        .filter(FounderDashTask.id == task_id, FounderDashTask.actor_id == actor.actor_id)
        .first()
    )
    if row is None:
        raise ApiServiceError(
            code="founder_dash_task_not_found",
            message="Founder dash task not found.",
            status_code=404,
        )
    patch = body.model_dump(exclude_unset=True)
    for key, value in patch.items():
        setattr(row, key, value)
    row.updated_at = _utcnow()
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/tasks/{task_id}")
def delete_founder_dash_task(
    task_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, bool]:
    _require_founder_dash_access(actor)
    row = (
        db.query(FounderDashTask)
        .filter(FounderDashTask.id == task_id, FounderDashTask.actor_id == actor.actor_id)
        .first()
    )
    if row is None:
        raise ApiServiceError(
            code="founder_dash_task_not_found",
            message="Founder dash task not found.",
            status_code=404,
        )
    db.delete(row)
    db.commit()
    return {"ok": True}
