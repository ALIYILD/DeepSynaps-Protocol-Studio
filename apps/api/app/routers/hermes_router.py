from __future__ import annotations

from datetime import datetime
import hmac
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, Header, Query
from pydantic import BaseModel, Field

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.errors import ApiServiceError
from app.services.hermes_runtime_service import (
    board_store,
    preview_route,
    process_telegram_update,
    route_intake_task,
)
from app.settings import get_settings


router = APIRouter(prefix="/api/v1/hermes", tags=["hermes"])

BoardId = Literal["global-inbox", "personal", "perfflux", "deepsynaps", "governance"]
TaskStatus = Literal["todo", "needs_triage", "reviewed", "in_progress", "waiting", "done", "closed"]
TaskPriority = Literal["routine", "P2", "P1", "P0"]


def _require_hermes_access(actor: AuthenticatedActor) -> None:
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
        code="hermes_bridge_unauthorized",
        message="Hermes bridge secret missing or invalid.",
        status_code=401,
    )


class HermesAuditEventOut(BaseModel):
    ts: str
    event: str
    actor: str
    detail: str | None = None
    board: str | None = None
    target_agent: str | None = None
    extra: dict[str, Any] | None = None


class HermesTaskOut(BaseModel):
    id: str
    title: str
    source: str
    source_channel: str
    source_agent_or_bot: str
    raw_summary: str
    requested_by: str
    board: BoardId
    target_board: BoardId
    target_agent: str
    priority: TaskPriority
    status: TaskStatus
    created_at: str
    updated_at: str
    routing_reason: str | None = None
    links: list[str] = Field(default_factory=list)
    audit_events: list[HermesAuditEventOut] = Field(default_factory=list)
    approval_required: bool = False
    risk_level: str | None = None
    source_project: str | None = None
    deadline: str | None = None


class HermesBoardMetaOut(BaseModel):
    slug: BoardId
    name: str
    description: str | None = None
    created_at: int | None = None
    archived: bool = False


class HermesBoardSummaryOut(BaseModel):
    board: BoardId
    meta: HermesBoardMetaOut
    counts: dict[str, int]
    total: int
    newest_tasks: list[HermesTaskOut]


class HermesBoardListOut(BaseModel):
    boards: list[HermesBoardSummaryOut]


class HermesIntakeIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    source: str = Field(default="dash", min_length=1, max_length=64)
    source_channel: str | None = Field(default=None, max_length=96)
    source_agent_or_bot: str | None = Field(default=None, max_length=96)
    raw_summary: str | None = Field(default=None, max_length=800)
    requested_by: str | None = Field(default=None, max_length=96)
    priority: TaskPriority = "routine"
    links: list[str] = Field(default_factory=list)
    source_project: str | None = Field(default=None, max_length=96)
    deadline: str | None = Field(default=None, max_length=48)


class HermesBridgeIntakeIn(HermesIntakeIn):
    actor_id: str | None = Field(default=None, max_length=64)
    actor_role: str | None = Field(default=None, max_length=32)


class HermesMoveIn(BaseModel):
    target_board: BoardId
    target_agent: str = Field(..., min_length=1, max_length=96)
    routing_reason: str = Field(..., min_length=1, max_length=400)


class HermesStatusIn(BaseModel):
    status: TaskStatus


class HermesAssignIn(BaseModel):
    target_agent: str = Field(..., min_length=1, max_length=96)


class HermesPriorityIn(BaseModel):
    priority: TaskPriority


class HermesTelegramDryRunIn(BaseModel):
    update: dict[str, Any]
    dry_run: bool = True


def _task_out(task: dict[str, Any]) -> HermesTaskOut:
    return HermesTaskOut.model_validate(task)


def _board_out(snapshot: dict[str, Any]) -> HermesBoardSummaryOut:
    return HermesBoardSummaryOut(
        board=snapshot["board"],
        meta=HermesBoardMetaOut.model_validate(snapshot["meta"]),
        counts=dict(snapshot["counts"]),
        total=int(snapshot["total"]),
        newest_tasks=[_task_out(task) for task in snapshot.get("newest_tasks") or []],
    )


def _bridge_requested_by(body: HermesBridgeIntakeIn) -> str:
    actor_id = (body.actor_id or get_settings().founder_dash_bridge_actor_id or "").strip()
    if actor_id:
        return actor_id
    return body.requested_by or "bridge"


@router.get("/boards", response_model=HermesBoardListOut)
def list_hermes_boards(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HermesBoardListOut:
    _require_hermes_access(actor)
    store = board_store()
    return HermesBoardListOut(boards=[_board_out(snapshot) for snapshot in store.all_board_snapshots()])


@router.get("/boards/{board_id}", response_model=HermesBoardSummaryOut)
def get_hermes_board(
    board_id: BoardId,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HermesBoardSummaryOut:
    _require_hermes_access(actor)
    return _board_out(board_store().board_snapshot(board_id))


@router.post("/intake", response_model=HermesTaskOut)
def intake_hermes_task(
    body: HermesIntakeIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HermesTaskOut:
    _require_hermes_access(actor)
    task = route_intake_task({
        **body.model_dump(),
        "requested_by": body.requested_by or actor.actor_id,
    })
    return _task_out(task)


@router.post("/bridge/intake", response_model=HermesTaskOut)
def bridge_intake_hermes_task(
    body: HermesBridgeIntakeIn = Body(...),
    x_founder_dash_bridge_key: str | None = Header(default=None),
) -> HermesTaskOut:
    _require_bridge_access(x_founder_dash_bridge_key)
    task = route_intake_task({
        **body.model_dump(exclude={"actor_id", "actor_role"}),
        "requested_by": _bridge_requested_by(body),
    })
    return _task_out(task)


@router.post("/bridge/system-events", response_model=HermesTaskOut)
def bridge_append_task_event(
    task_id: str = Query(..., min_length=1),
    event_kind: str = Query(..., min_length=1, max_length=64),
    title: str = Query(..., min_length=1, max_length=255),
    detail: str = Query(default="", max_length=4000),
    x_founder_dash_bridge_key: str | None = Header(default=None),
) -> HermesTaskOut:
    _require_bridge_access(x_founder_dash_bridge_key)
    store = board_store()
    task = store.append_task_audit(
        task_id,
        event_type=event_kind,
        actor="bridge",
        detail=f"{title}: {detail}".strip(": "),
    )
    store.append_system_event({
        "ts": datetime.utcnow().isoformat() + "Z",
        "task_id": task_id,
        "event_kind": event_kind,
        "title": title,
        "detail": detail,
    })
    return _task_out(task)


@router.post("/tasks/{task_id}/move", response_model=HermesTaskOut)
def move_hermes_task(
    task_id: str,
    body: HermesMoveIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HermesTaskOut:
    _require_hermes_access(actor)
    task = board_store().move_task(
        task_id,
        target_board=body.target_board,
        target_agent=body.target_agent,
        routing_reason=body.routing_reason,
        actor=actor.actor_id,
    )
    return _task_out(task)


@router.post("/tasks/{task_id}/status", response_model=HermesTaskOut)
def update_hermes_task_status(
    task_id: str,
    body: HermesStatusIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HermesTaskOut:
    _require_hermes_access(actor)
    task = board_store().update_task(
        task_id,
        {"status": body.status},
        audit_actor=actor.actor_id,
        audit_event="status_changed",
        audit_detail=f"Status set to {body.status}.",
    )
    return _task_out(task)


@router.post("/tasks/{task_id}/assign", response_model=HermesTaskOut)
def assign_hermes_task(
    task_id: str,
    body: HermesAssignIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HermesTaskOut:
    _require_hermes_access(actor)
    task = board_store().update_task(
        task_id,
        {"target_agent": body.target_agent},
        audit_actor=actor.actor_id,
        audit_event="assigned",
        audit_detail=f"Assigned to {body.target_agent}.",
    )
    return _task_out(task)


@router.post("/tasks/{task_id}/priority", response_model=HermesTaskOut)
def update_hermes_task_priority(
    task_id: str,
    body: HermesPriorityIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HermesTaskOut:
    _require_hermes_access(actor)
    task = board_store().update_task(
        task_id,
        {"priority": body.priority},
        audit_actor=actor.actor_id,
        audit_event="priority_changed",
        audit_detail=f"Priority set to {body.priority}.",
    )
    return _task_out(task)


@router.post("/telegram/dry-run")
def hermes_telegram_dry_run(
    body: HermesTelegramDryRunIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    _require_hermes_access(actor)
    return process_telegram_update(body.update, dry_run=body.dry_run)
