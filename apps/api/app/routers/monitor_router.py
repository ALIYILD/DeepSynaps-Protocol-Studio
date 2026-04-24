from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import SessionLocal, get_db_session
from app.errors import ApiServiceError
from app.services.monitor_service import (
    LIVE_STREAM_INTERVAL_SECONDS,
    build_live_snapshot,
    connect_integration,
    disconnect_integration,
    list_data_quality_issues,
    list_fleet,
    list_integrations,
    resolve_data_quality_issue,
    sync_integration,
)

router = APIRouter(prefix="/api/v1/monitor", tags=["Monitor"])


class IntegrationConnectIn(BaseModel):
    config: dict | None = None


@router.get("/live")
def get_live_snapshot(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    return build_live_snapshot(actor, db)


@router.websocket("/live/stream")
async def live_stream(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    authorization = f"Bearer {token}" if token else websocket.headers.get("authorization")
    actor = get_authenticated_actor(authorization)
    await websocket.accept()
    db = SessionLocal()
    try:
      while True:
        await websocket.send_text(json.dumps(build_live_snapshot(actor, db)))
        await asyncio.sleep(LIVE_STREAM_INTERVAL_SECONDS)
    except WebSocketDisconnect:
      return
    finally:
      db.close()


@router.get("/integrations")
def get_integrations(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    return list_integrations(actor, db)


@router.post("/integrations/{connector_id}/connect")
def connect_monitor_integration(
    connector_id: str,
    body: IntegrationConnectIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    try:
        return connect_integration(actor, db, connector_id, body.config or {})
    except ValueError as exc:
        raise ApiServiceError(code="unknown_connector", message="Unknown connector.", status_code=404) from exc


@router.post("/integrations/{integration_id}/sync")
def sync_monitor_integration(
    integration_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    return sync_integration(actor, db, integration_id)


@router.post("/integrations/{integration_id}/disconnect")
def disconnect_monitor_integration(
    integration_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    return disconnect_integration(actor, db, integration_id)


@router.get("/fleet")
def get_monitor_fleet(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    return list_fleet(actor, db)


@router.get("/dq")
def get_data_quality(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    return list_data_quality_issues(actor, db)


@router.post("/dq/{issue_id}/resolve")
def resolve_issue(
    issue_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    return resolve_data_quality_issue(actor, db, issue_id)
