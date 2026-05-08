"""Regression tests for the global ``security_headers_middleware``.

The SSE endpoint ``/api/v1/notifications/stream`` accepts the access
token via a ``?token=…`` query parameter (EventSource cannot send an
Authorization header) and explicitly sets ``Referrer-Policy: no-referrer``
so the full URL — token included — is not leaked via the ``Referer``
header on any same-origin navigation.

Pre-fix the middleware unconditionally overwrote that header with the
project default (``strict-origin-when-cross-origin``), which still emits
the FULL URL on same-origin requests. The fix makes the middleware
``setdefault`` the policy: a stricter route-set value is honoured.

Notes:
- We can't directly hit ``/api/v1/notifications/stream`` here — its
  StreamingResponse runs an infinite generator and TestClient blocks
  reading it (see ``test_notifications_stream_authz.py`` skips). The
  middleware behavior is independent of the route body, so we mount a
  test-only route that returns a Response with a pre-set Referrer-Policy.
"""
from __future__ import annotations

from fastapi import Response
from fastapi.testclient import TestClient

from app.main import app


# ── Mount test-only routes once at import time ──────────────────────────────
#
# These exist solely to exercise the middleware. They live under a
# distinctive prefix so they cannot collide with real routes.

_TEST_PREFIX = "/__test__/security-headers"


@app.get(f"{_TEST_PREFIX}/default")
def _route_default() -> dict[str, bool]:
    return {"ok": True}


@app.get(f"{_TEST_PREFIX}/no-referrer")
def _route_no_referrer() -> Response:
    resp = Response(content="ok", media_type="text/plain")
    # Mirror what the SSE stream route does — set the header BEFORE the
    # response leaves the handler so the middleware sees it on the way
    # back through.
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp


# ── Tests ───────────────────────────────────────────────────────────────────


def test_default_referrer_policy_applied_when_route_does_not_set_one(
    client: TestClient,
) -> None:
    """Plain routes get the project default."""
    resp = client.get(f"{_TEST_PREFIX}/default")
    assert resp.status_code == 200, resp.text
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_route_set_referrer_policy_is_honoured_by_middleware(
    client: TestClient,
) -> None:
    """A route that sets a stricter ``Referrer-Policy`` (e.g. the SSE
    stream's ``no-referrer``) must NOT be overwritten by the global
    security-headers middleware.

    Regression: the middleware previously overwrote ``no-referrer`` with
    ``strict-origin-when-cross-origin``, which still sends the FULL URL
    on same-origin requests — leaking the ``?token=…`` access token via
    the ``Referer`` header.
    """
    resp = client.get(f"{_TEST_PREFIX}/no-referrer")
    assert resp.status_code == 200, resp.text
    assert resp.headers.get("Referrer-Policy") == "no-referrer", (
        "Middleware must honour a route-set Referrer-Policy. The SSE "
        "stream relies on this to prevent ?token=… leak via Referer."
    )


def test_other_security_headers_still_applied_on_no_referrer_route(
    client: TestClient,
) -> None:
    """The setdefault on Referrer-Policy must not skip the other headers."""
    resp = client.get(f"{_TEST_PREFIX}/no-referrer")
    assert resp.status_code == 200, resp.text
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert "Content-Security-Policy" in resp.headers
