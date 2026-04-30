from __future__ import annotations
import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, Header, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func, select
from sqlalchemy.orm import Session
from ..auth import get_authenticated_actor, AuthenticatedActor, require_minimum_role
from ..database import get_db_session
from ..errors import ApiServiceError
from ..limiter import limiter
from ..services.auth_service import decode_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="", tags=["notifications"])

# Hard cap on the page_id (used as a key in `_presence`). Pre-fix this was
# uncapped — an authenticated clinician could blow up server memory by
# POSTing /presence with megabyte-scale page_ids.
_MAX_PAGE_ID_LEN = 200

# Roles that are permitted to subscribe to the SSE stream. Pre-fix the
# stream had no role gate after token decode, so a guest token (or any
# valid access token) opened a stream and saw everything broadcast to
# its `sub`. Cross-clinic info still flows through `broadcast_to_user`
# decisions in other routers, so this is the last line of defence.
_STREAM_ALLOWED_ROLES = frozenset({
    "clinician", "admin", "supervisor", "technician", "reviewer", "patient",
})

# In-memory event queue per user_id (simple broadcast for single-server dev)
_queues: dict[str, asyncio.Queue] = {}

# ── Presence store ────────────────────────────────────────────────────────────
# { "<clinic_id>::<page_id>": { "user_id": { "name": str, "role": str, "last_seen": float } } }
# Pre-fix this was keyed by `page_id` alone, leaking presence and
# patient/course UUID confirmations across clinics. See `_scope_key`.
_presence: dict[str, dict[str, dict]] = {}
_PRESENCE_TTL = 30  # seconds
_NO_CLINIC_BUCKET = "__no_clinic__"


def _scope_key(clinic_id: str | None, page_id: str) -> str:
    """Combine clinic_id + page_id into a single in-memory key.

    Pre-fix the presence map was keyed by ``page_id`` alone — a
    clinician at clinic A reading
    ``GET /presence/<patient-uuid-at-clinic-B>`` saw clinic-B
    clinicians' display_name + role + a confirmation that the
    patient/course UUID is real. Cross-clinic presence leak +
    UUID oracle (HIPAA-relevant reconnaissance).

    Post-fix the key is ``"<clinic_id>::<page_id>"`` so different
    clinics see different presence pools even when the underlying
    page_id is identical. Actors with no ``clinic_id`` (e.g. a
    misconfigured token) are bucketed under a sentinel so they
    don't accidentally join any clinic's pool.
    """
    return f"{clinic_id or _NO_CLINIC_BUCKET}::{page_id}"


async def update_presence(
    user_id: str,
    user_name: str,
    user_role: str,
    page_id: str,
    *,
    clinic_id: str | None = None,
):
    """Called when a user navigates to a page. Broadcasts presence
    update to other users on that page within the same clinic."""
    now = time.time()
    key = _scope_key(clinic_id, page_id)
    if key not in _presence:
        _presence[key] = {}
    _presence[key][user_id] = {"name": user_name, "role": user_role, "last_seen": now}
    # Clean stale entries
    _presence[key] = {
        uid: info for uid, info in _presence[key].items()
        if now - info["last_seen"] < _PRESENCE_TTL
    }
    # Broadcast to all OTHER users currently on this page (same clinic only)
    for uid in list(_presence.get(key, {}).keys()):
        if uid != user_id:
            await broadcast_to_user(uid, "presence_update", {
                "page_id": page_id,
                "users": [{"id": k, **v} for k, v in _presence[key].items()],
            })


def get_presence(page_id: str, *, clinic_id: str | None = None) -> list:
    """Return presence list for a page within a single clinic scope.

    Same scoping as ``update_presence`` — cross-clinic reads are
    isolated by ``clinic_id``.
    """
    now = time.time()
    key = _scope_key(clinic_id, page_id)
    page_presence = _presence.get(key, {})
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
    """SSE stream for real-time notifications.

    Auth flow:

    * Prefer the ``Authorization: Bearer …`` header — keeps the token
      out of access logs, browser history, and Referrer headers. Modern
      EventSource shims (and ``fetch``-based readable-stream clients)
      can attach headers; the query-param path is kept as a fallback
      for legacy ``new EventSource(url)`` callers.
    * Decode and validate the access token.
    * Reject any role outside ``_STREAM_ALLOWED_ROLES`` (pre-fix any
      decode-passing token opened a stream — including guest).
    """
    # Extract token — header preferred so the token never lands in
    # ``request.url`` access logs.
    raw_token: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        raw_token = authorization[7:].strip()
    if not raw_token:
        raw_token = token  # legacy EventSource fallback

    user_id: str | None = None
    role: str | None = None
    if raw_token:
        payload = decode_token(raw_token)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")
            role = payload.get("role")

    if not user_id:
        # Use the API service-error envelope so the response goes through
        # the same access-log redaction as the rest of the API.
        raise ApiServiceError(
            code="auth_required",
            message="Authentication required for notification stream.",
            status_code=401,
        )

    if role not in _STREAM_ALLOWED_ROLES:
        # Log without echoing user_id — `auth_required` is the message
        # surfaced to the client; the audit log below is for ops only.
        logger.warning(
            "notification_stream rejected role=%r (sub redacted)", role
        )
        raise ApiServiceError(
            code="forbidden",
            message="This role is not permitted to open a notification stream.",
            status_code=403,
        )

    queue = get_user_queue(user_id)

    async def event_generator():
        # Send a connected event immediately. Pre-fix this echoed the
        # ``user_id`` (subject UUID) into the SSE body — combined with
        # the query-param token leak that amplified log exposure. Drop
        # the user_id from the event payload; the client already knows
        # who it is.
        yield f"data: {json.dumps({'type': 'connected'})}\n\n"

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
            "Cache-Control": "no-cache, no-store",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            # Prevent the SSE URL (with its query-param token, when used)
            # from leaking via Referer when content embedded in the
            # stream links to external hosts.
            "Referrer-Policy": "no-referrer",
        },
    )


# ── Presence endpoints ────────────────────────────────────────────────────────

class PresenceUpdate(BaseModel):
    # Cap matches `_MAX_PAGE_ID_LEN` — the value is later used as a
    # dict key in the in-process `_presence` map. Without this cap
    # an authenticated clinician could exhaust server memory by
    # POSTing a megabyte-scale page_id.
    page_id: str = Field(..., min_length=1, max_length=_MAX_PAGE_ID_LEN)


@router.post("/api/v1/notifications/presence")
@limiter.limit("60/minute")
async def post_presence(
    request: Request,
    body: PresenceUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Client pings this endpoint when navigating to a page.

    Requires clinician role: presence carries display_name + role of every
    actor on the page, so a guest token must not be able to register
    presence (broadcasting their identity to clinicians) or read the list
    (probing patient/course UUIDs for other clinics' staff). Cross-clinic
    presence between clinicians is intentionally still permitted — same
    as before — pending a follow-up that parses page_id and clinic-scopes
    it.
    """
    require_minimum_role(actor, "clinician")
    await update_presence(
        actor.actor_id,
        actor.display_name,
        actor.role,
        body.page_id,
        clinic_id=actor.clinic_id,
    )
    return {"users": get_presence(body.page_id, clinic_id=actor.clinic_id)}


@router.get("/api/v1/notifications/presence/{page_id}")
async def get_page_presence(
    page_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Read who else is on a given page.

    Clinician-gated, and clinic-scoped by ``actor.clinic_id`` so a
    clinician at clinic A cannot probe presence on clinic-B
    patient / course UUIDs (which would leak both staff identities
    and confirm the UUID exists at that clinic).
    """
    require_minimum_role(actor, "clinician")
    return {"users": get_presence(page_id, clinic_id=actor.clinic_id)}


@router.post("/api/v1/notifications/test")
@limiter.limit("5/minute")
async def send_test_notification(
    request: Request,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Push a test notification to the authenticated user.

    Pre-fix this had no rate limit and any clinician could spam an
    ``ae_alert`` to themselves indefinitely. The ``broadcast_to_user``
    fan-out is bounded by the in-memory queue's ``maxsize=50`` cap, but
    the spam still drives test events into ops dashboards and any
    downstream auditing.

    Capped at 5/minute per IP — well above legitimate manual testing.
    """
    require_minimum_role(actor, "clinician")
    await broadcast_to_user(actor.actor_id, "ae_alert", {
        "title": "Adverse Event Reported",
        "body": "A new serious adverse event has been reported and requires immediate review.",
        "severity": "serious",
        "link": "adverse-events",
    })
    return {"ok": True}


# ── Unread count ──────────────────────────────────────────────────────────────
# The Patients list (and every other clinician surface) shows a notifications
# bell with a numeric badge. Compute the count from persistent backend state
# rather than the in-memory SSE queue so the number survives a page reload.
# Components:
#   - unread messages where the clinician is the recipient
#   - open adverse events the clinician owns (AE alerts never auto-dismiss)


class UnreadCountResponse(BaseModel):
    count: int
    unread_messages: int
    open_adverse_events: int


@router.get("/api/v1/notifications/unread-count", response_model=UnreadCountResponse)
def unread_count_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> UnreadCountResponse:
    """Unread items the clinician should see in their bell."""
    require_minimum_role(actor, "clinician")
    from ..persistence.models import AdverseEvent, Message

    unread_msg_count = int(session.scalar(
        select(sa_func.count(Message.id)).where(
            Message.recipient_id == actor.actor_id,
            Message.read_at.is_(None),
        )
    ) or 0)

    open_ae_count = int(session.scalar(
        select(sa_func.count(AdverseEvent.id)).where(
            AdverseEvent.clinician_id == actor.actor_id,
            AdverseEvent.resolved_at.is_(None),
        )
    ) or 0)

    return UnreadCountResponse(
        count=unread_msg_count + open_ae_count,
        unread_messages=unread_msg_count,
        open_adverse_events=open_ae_count,
    )
