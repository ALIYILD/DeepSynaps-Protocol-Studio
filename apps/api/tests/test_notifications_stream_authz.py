"""Regression tests for the SSE ``/api/v1/notifications/stream`` auth.

Pre-fix the route accepted the access token via the ``?token=`` query
parameter without applying any role check after decoding — any role
(including ``guest``) holding a valid access token opened a stream
keyed by its ``sub``. Post-fix:

* Authorization header is preferred over the query param so the token
  does not land in access logs / browser history.
* ``role`` must be in ``_STREAM_ALLOWED_ROLES`` (guest is not).
* Missing / invalid token => 401 ``auth_required``.
* The connected event no longer echoes ``user_id`` (the client already
  knows who it is — this just amplified token leak amplified via logs).

The ``page_id`` size cap on the presence model is also pinned here.
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.auth_service import create_access_token


# Referrer-Policy values that prevent token leakage via Referer header.
# The route sets "no-referrer", but global security middleware overrides
# with "strict-origin-when-cross-origin" — both are non-leaky for the
# token-in-URL scenario this header guards against. (Middleware override
# is being addressed in a separate PR; keep this set in sync.)
_NON_LEAKY_REFERRER_POLICIES = {"no-referrer", "strict-origin-when-cross-origin"}


class _ASGISentinel(Exception):
    """Raised by the manual ASGI driver to break out of the infinite
    SSE response after the first body chunk is captured."""


async def _drive_sse_first_chunk(
    *, path: str, headers: list[tuple[bytes, bytes]]
) -> tuple[int, dict[bytes, bytes], bytes]:
    """Drive the FastAPI ASGI app directly to capture the first SSE
    body chunk, then disconnect.

    TestClient and httpx.ASGITransport both block on infinite
    StreamingResponse bodies (TestClient on the worker thread,
    ASGITransport in handle_async_request which awaits the entire
    app() call). The smallest in-process workaround is to call the
    ASGI app ourselves: capture http.response.start + the first
    http.response.body event, then send http.disconnect on the
    receive channel so the route's ``request.is_disconnected()``
    loop terminates. We raise a sentinel from ``send`` to short-circuit
    the body-write loop.
    """
    # Parse path and query to satisfy ASGI scope requirements.
    if "?" in path:
        raw_path, raw_query = path.split("?", 1)
    else:
        raw_path, raw_query = path, ""

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": raw_path,
        "raw_path": raw_path.encode("ascii"),
        "query_string": raw_query.encode("ascii"),
        "headers": headers,
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
        "root_path": "",
    }

    receive_calls = {"n": 0}

    async def receive():
        receive_calls["n"] += 1
        if receive_calls["n"] == 1:
            return {"type": "http.request", "body": b"", "more_body": False}
        # Subsequent calls (the route polls is_disconnected) get a
        # disconnect so the event_generator loop exits cleanly.
        return {"type": "http.disconnect"}

    captured: dict[str, object] = {}

    async def send(message):
        mtype = message.get("type")
        if mtype == "http.response.start":
            captured["status"] = message["status"]
            captured["headers"] = {k: v for k, v in message.get("headers", [])}
        elif mtype == "http.response.body":
            # Capture the FIRST body chunk and break out — we don't want
            # to wait for the (infinite) generator to keep yielding
            # heartbeats.
            if "body" not in captured:
                captured["body"] = message.get("body", b"")
                raise _ASGISentinel
            # If we somehow get here, ignore subsequent chunks.

    try:
        await app(scope, receive, send)
    except _ASGISentinel:
        pass

    return (
        captured.get("status"),  # type: ignore[return-value]
        captured.get("headers", {}),  # type: ignore[arg-type]
        captured.get("body", b""),  # type: ignore[arg-type]
    )


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_stream_rejects_missing_token(client: TestClient) -> None:
    resp = client.get("/api/v1/notifications/stream")
    assert resp.status_code == 401, resp.text
    assert resp.json().get("code") == "auth_required"


def test_stream_rejects_guest_role(client: TestClient) -> None:
    """Guest tokens decode fine but must NOT open a stream."""
    token = create_access_token(
        user_id="guest-1",
        email="g@example.com",
        role="guest",
        package_id="explorer",
        clinic_id=None,
    )
    resp = client.get("/api/v1/notifications/stream", headers=_bearer(token))
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") == "forbidden"


def test_stream_accepts_authorization_header() -> None:
    """The header-based auth path must be the preferred route, with the
    token NEVER appearing in the request URL.

    Driven via the ASGI app directly because TestClient hangs on
    infinite StreamingResponse — see ``_drive_sse_first_chunk`` for the
    rationale.
    """
    token = create_access_token(
        user_id="clin-stream-1",
        email="c@example.com",
        role="clinician",
        package_id="clinician_pro",
        clinic_id="clinic-stream-test",
    )
    headers = [
        (b"host", b"testserver"),
        (b"authorization", f"Bearer {token}".encode("ascii")),
        (b"accept", b"text/event-stream"),
    ]

    status, resp_headers, body = asyncio.run(
        _drive_sse_first_chunk(
            path="/api/v1/notifications/stream", headers=headers
        )
    )

    assert status == 200, (status, body)
    content_type = resp_headers.get(b"content-type", b"").decode("latin-1")
    assert content_type.startswith("text/event-stream"), content_type
    # Referrer-Policy: route sets "no-referrer", but global security
    # middleware may override with "strict-origin-when-cross-origin".
    # Both are non-leaky for the token-in-URL scenario; assert the
    # value lands in the safe set rather than pinning the exact string.
    referrer_policy = resp_headers.get(b"referrer-policy", b"").decode("latin-1")
    assert referrer_policy in _NON_LEAKY_REFERRER_POLICIES, referrer_policy
    # First chunk should be the connected event (no user_id echo).
    body_text = body.decode("utf-8")
    assert '"type": "connected"' in body_text or '"type":"connected"' in body_text
    assert "user_id" not in body_text


def test_stream_query_param_token_still_works() -> None:
    """Legacy ``new EventSource('?token=...')`` clients must still
    authenticate — the query path is deprecated but kept until the
    frontend migrates.

    Driven via the ASGI app directly; see
    ``test_stream_accepts_authorization_header`` for rationale.
    """
    token = create_access_token(
        user_id="clin-stream-2",
        email="c2@example.com",
        role="clinician",
        package_id="clinician_pro",
        clinic_id="clinic-stream-test",
    )
    headers = [
        (b"host", b"testserver"),
        (b"accept", b"text/event-stream"),
    ]

    status, resp_headers, body = asyncio.run(
        _drive_sse_first_chunk(
            path=f"/api/v1/notifications/stream?token={token}",
            headers=headers,
        )
    )

    assert status == 200, (status, body)
    content_type = resp_headers.get(b"content-type", b"").decode("latin-1")
    assert content_type.startswith("text/event-stream"), content_type


def test_presence_page_id_cap_enforced(client: TestClient) -> None:
    """The ``page_id`` is used as a key in an in-process dict; an
    uncapped value would let an authenticated clinician exhaust server
    memory."""
    token = create_access_token(
        user_id="clin-pres-1",
        email="cp@example.com",
        role="clinician",
        package_id="clinician_pro",
        clinic_id="clinic-pres-test",
    )
    huge_page_id = "x" * 500  # cap is 200
    resp = client.post(
        "/api/v1/notifications/presence",
        headers=_bearer(token),
        json={"page_id": huge_page_id},
    )
    assert resp.status_code == 422, resp.text
    assert "200 characters" in resp.text
