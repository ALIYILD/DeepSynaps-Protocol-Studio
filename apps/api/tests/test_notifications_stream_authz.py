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

import pytest
from fastapi.testclient import TestClient

from app.services.auth_service import create_access_token


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


def test_stream_accepts_authorization_header(client: TestClient) -> None:
    """The header-based auth path must be the preferred route, with the
    token NEVER appearing in the request URL."""
    token = create_access_token(
        user_id="clin-stream-1",
        email="c@example.com",
        role="clinician",
        package_id="clinician_pro",
        clinic_id="clinic-stream-test",
    )
    # We can't fully consume the SSE stream in a unit test (it's
    # infinite), but we can stream the first byte to confirm the
    # endpoint accepts the auth and starts emitting.
    with client.stream(
        "GET", "/api/v1/notifications/stream", headers=_bearer(token)
    ) as resp:
        assert resp.status_code == 200, resp.text
        assert resp.headers.get("Content-Type", "").startswith("text/event-stream")
        # Referrer-Policy is part of the cookie/token-leak mitigation —
        # pin it so a future header refactor cannot silently regress.
        assert resp.headers.get("Referrer-Policy") == "no-referrer"
        # Read the connected event and confirm user_id is NOT echoed.
        first = next(resp.iter_lines())
        assert "connected" in first
        assert "user_id" not in first, first


def test_stream_query_param_token_still_works(client: TestClient) -> None:
    """Legacy ``new EventSource('?token=...')`` clients must still
    authenticate — the query path is deprecated but kept until the
    frontend migrates."""
    token = create_access_token(
        user_id="clin-stream-2",
        email="c2@example.com",
        role="clinician",
        package_id="clinician_pro",
        clinic_id="clinic-stream-test",
    )
    with client.stream(
        "GET", f"/api/v1/notifications/stream?token={token}"
    ) as resp:
        assert resp.status_code == 200, resp.text


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
    assert "page_id" in resp.text
