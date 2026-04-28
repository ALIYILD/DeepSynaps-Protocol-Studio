"""Regression tests for the qeeg_live SSE/WS token-in-URL hardening.

Pre-fix the live qEEG WebSocket route only read its JWT from the
``?token=`` query string. URL-borne tokens leak into:

* Reverse-proxy access logs (Fly, GunicornAccessLog).
* Browser history and the Referer header.
* HTML source if the URL is ever rendered into a debug banner.

Post-fix:

* SSE: the dependency-injected ``Authorization`` header path runs
  first; ``?token=`` is still allowed for browser EventSource (which
  can't set headers) but emits a WARN-level audit log.
* WS: ``Authorization: Bearer …`` and
  ``Sec-WebSocket-Protocol: bearer.<token>`` are preferred; the
  ``?token=`` query path still works for legacy clients but emits a
  WARN-level audit log.

These tests don't assert the WS handshake itself (TestClient WS auth
plumbing is fragile around our Depends layer); they pin the helper
contract directly so the regression bar is unambiguous.
"""
from __future__ import annotations

import pytest

from app.routers.qeeg_live_router import _resolve_ws_token


class _StubClient:
    host = "127.0.0.1"


class _StubWebSocket:
    def __init__(self, headers: dict[str, str] | None = None) -> None:
        self.headers = headers or {}
        self.client = _StubClient()


def test_resolve_ws_token_prefers_authorization_header() -> None:
    ws = _StubWebSocket(headers={"authorization": "Bearer header-token"})
    assert _resolve_ws_token(ws, query_token="query-token") == "header-token"


def test_resolve_ws_token_prefers_subprotocol_over_query() -> None:
    """``Sec-WebSocket-Protocol: bearer.<token>`` is the modern
    in-band browser auth route."""
    ws = _StubWebSocket(
        headers={"sec-websocket-protocol": "bearer.subproto-token, json"}
    )
    assert _resolve_ws_token(ws, query_token="query-token") == "subproto-token"


def test_resolve_ws_token_falls_back_to_query(caplog: pytest.LogCaptureFixture) -> None:
    """Legacy callers still work — but the fallback is logged so
    security teams can spot tokens leaking through URL logs."""
    ws = _StubWebSocket()
    with caplog.at_level("WARNING", logger="app.routers.qeeg_live_router"):
        token = _resolve_ws_token(ws, query_token="legacy-token")
    assert token == "legacy-token"
    assert any("qeeg_live_ws_token_in_query" in m for m in caplog.messages)


def test_resolve_ws_token_returns_none_when_nothing_supplied() -> None:
    ws = _StubWebSocket()
    assert _resolve_ws_token(ws, query_token=None) is None


def test_resolve_ws_token_ignores_non_bearer_authorization() -> None:
    """A bogus ``Basic`` or ``Digest`` header must not be accepted."""
    ws = _StubWebSocket(headers={"authorization": "Basic Zm9v"})
    assert _resolve_ws_token(ws, query_token="query-token") == "query-token"


def test_resolve_ws_token_ignores_empty_bearer() -> None:
    """``Authorization: Bearer `` (empty token) must NOT short-circuit
    the legitimate ``?token=`` fallback."""
    ws = _StubWebSocket(headers={"authorization": "Bearer "})
    assert _resolve_ws_token(ws, query_token="query-token") == "query-token"
