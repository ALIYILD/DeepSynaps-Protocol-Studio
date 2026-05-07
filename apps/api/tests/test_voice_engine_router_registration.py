"""Smoke test that the voice-engine router is mounted on the FastAPI app.

Asserts only that the three documented endpoints exist on ``app.routes``
under their final ``/api/v1/voice/...`` paths. Endpoint behavior is covered
by ``packages/voice-engine/tests/test_pipeline.py``.
"""

from __future__ import annotations

from app.main import app


def _has_route(path: str, method: str) -> bool:
    method = method.upper()
    for route in app.routes:
        if getattr(route, "path", None) == path and method in (
            getattr(route, "methods", None) or set()
        ):
            return True
    return False


def test_voice_upload_route_is_registered() -> None:
    assert _has_route("/api/v1/voice/upload", "POST")


def test_voice_analyze_route_is_registered() -> None:
    assert _has_route("/api/v1/voice/analyze/{session_id}", "POST")


def test_voice_result_route_is_registered() -> None:
    assert _has_route("/api/v1/voice/result/{session_id}", "GET")
