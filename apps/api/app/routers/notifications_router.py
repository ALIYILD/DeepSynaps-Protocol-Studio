from __future__ import annotations
import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, Header, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..auth import get_authenticated_actor, AuthenticatedActor
from ..services.auth_service import decode_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="", tags=["notifications"])

# In-memory event queue per user_id (simple broadcast for single-server dev)
_queues: dict[str, asyncio.Queue] = {}

# ── Presence store ────────────────────────────────────────────────────────────
# { "page_id": { "user_id": { "name": str, "role": str, "last_seen": float } } }
_presence: dict[str, dict[str, dict]] = {}
_PRESENCE_TTL = 30  # seconds


async def update_presence(user_id: str, user_name: str, user_role: str, page_id: str):
    """Called when a user navigates to a page. Broadcasts presence update to all users on that page."""
    now = time.time()
    if page_id not in _presence:
        _presence[page_id] = {}
    _presence[page_id][user_id] = {"name": user_name, "role": user_role, "last_seen": now}
    # Clean stale entries
    _presence[page_id] = {
        uid: info for uid, info in _presence[page_id].items()
        if now - info["last_seen"] < _PRESENCE_TTL
    }
    # Broadcast to all OTHER users currently on this page
    for uid in list(_presence.get(page_id, {}).keys()):
        if uid != user_id:
            await broadcast_to_user(uid, "presence_update", {
                "page_id": page_id,
                "users": [{"id": k, **v} for k, v in _presence[page_id].items()],
            })


def get_presence(page_id: str) -> list:
    now = time.time()
    page_presence = _presence.get(page_id, {})
    return [
        {"id": k, **v}
        for k, v in page_presence.items()
        if now - v["last_seen"] < _PRESENCE_TTL
    ]


def get_user_queue(user_id: str) -> asyncio.Queue:
    if user_id not in _queues:
        _queues[user_id] = asyncio.Queue(maxsize=50)
    return _queues[user_id]


async def broadcast_to_user(user_id: str, event_type: str, data: dict):
    """Call this from other routers to push a notification to a user."""
    q = get_user_queue(user_id)
    try:
        q.put_nowait({"type": event_type, "data": data, "ts": datetime.now(timezone.utc).isoformat()})
    except asyncio.QueueFull:
        pass  # drop if queue full


@router.get("/api/v1/notifications/stream")
async def notification_stream(
    request: Request,
    token: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
):
    """SSE stream for real-time notifications."""
    # Extract token — query param takes priority (EventSource can't send headers)
    raw_token = token
    if not raw_token and authorization and authorization.lower().startswith("bearer "):
        raw_token = authorization[7:].strip()

    user_id = None
    if raw_token:
        payload = decode_token(raw_token)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")

    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Authentication required for notification stream.")

    queue = get_user_queue(user_id)

    async def event_generator():
        # Send a connected event immediately
        yield f"data: {json.dumps({'type': 'connected', 'user_id': user_id})}\n\n"

        # Drain the queue, heartbeat every 25 seconds
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=25.0)
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'heartbeat', 'ts': datetime.now(timezone.utc).isoformat()})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Presence endpoints ────────────────────────────────────────────────────────

class PresenceUpdate(BaseModel):
    page_id: str


@router.post("/api/v1/notifications/presence")
async def post_presence(
    body: PresenceUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Client pings this endpoint when navigating to a page."""
    await update_presence(
        actor.actor_id,
        actor.display_name,
        actor.role,
        body.page_id,
    )
    return {"users": get_presence(body.page_id)}


@router.get("/api/v1/notifications/presence/{page_id}")
async def get_page_presence(
    page_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    return {"users": get_presence(page_id)}


@router.post("/api/v1/notifications/test")
async def send_test_notification(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Push a test notification to the authenticated user. Requires clinician access."""
    from ..auth import require_minimum_role
    require_minimum_role(actor, "clinician")
    await broadcast_to_user(actor.actor_id, "ae_alert", {
        "title": "Adverse Event Reported",
        "body": "A new serious adverse event has been reported and requires immediate review.",
        "severity": "serious",
        "link": "adverse-events",
    })
    return {"ok": True}
