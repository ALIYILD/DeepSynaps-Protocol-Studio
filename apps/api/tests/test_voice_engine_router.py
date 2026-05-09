"""Tests for voice_engine_router — /api/v1/voice/* endpoints.

The voice-engine package may or may not be available. When it IS available the
router exposes real upload/analyze/result endpoints; when it ISN'T, the shim
mounts a catch-all that returns 503.

Both paths are tested. The real-router path mocks audio_io.preprocess_upload
and pipeline.run_voice_analysis_for_session to avoid heavy dependencies.
"""

from __future__ import annotations

import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Detect whether the voice-engine package is wired
# ---------------------------------------------------------------------------

def _voice_engine_available() -> bool:
    try:
        import sys
        from pathlib import Path
        _dir = str(Path(__file__).resolve().parents[4] / "packages" / "voice-engine")
        if _dir not in sys.path:
            sys.path.insert(0, _dir)
        from api.router import router as _r  # noqa: F401
        # Check it has real endpoints (not just the 503 catch-all)
        return any(r.path != "/{path:path}" for r in _r.routes)
    except Exception:
        return False


_VOICE_REAL = _voice_engine_available()


# ---------------------------------------------------------------------------
# Tests: 503 catch-all (package unavailable)
# The shim always handles this path — if real routes exist, the 503 catch-all
# is shadowed, so we only assert 503 when the package is NOT available.
# ---------------------------------------------------------------------------

@pytest.mark.skipif(_VOICE_REAL, reason="voice-engine package is available")
def test_voice_upload_returns_503_when_unavailable(client: TestClient) -> None:
    r = client.post(
        "/api/v1/voice/upload",
        data={"patient_id": "p-123"},
        files={"file": ("test.wav", io.BytesIO(b"RIFF"), "audio/wav")},
    )
    assert r.status_code == 503


@pytest.mark.skipif(_VOICE_REAL, reason="voice-engine package is available")
def test_voice_analyze_returns_503_when_unavailable(client: TestClient) -> None:
    r = client.post("/api/v1/voice/analyze/sess-123")
    assert r.status_code == 503


@pytest.mark.skipif(_VOICE_REAL, reason="voice-engine package is available")
def test_voice_result_returns_503_when_unavailable(client: TestClient) -> None:
    r = client.get("/api/v1/voice/result/sess-123")
    assert r.status_code == 503


# ---------------------------------------------------------------------------
# Tests: real router (package available)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _VOICE_REAL, reason="voice-engine package not available")
def test_voice_upload_happy_path(client: TestClient, auth_headers) -> None:
    """Upload with valid multipart form → 200 + AudioMeta fields."""
    import dataclasses

    @dataclasses.dataclass
    class FakeMeta:
        session_id: str = "sess-fake-001"
        patient_id: str = "p-test"
        processed_s3_key: str = "voice/p-test/sess-fake-001.wav"
        duration_sec: float = 5.0
        sample_rate: int = 16000
        channels: int = 1
        format: str = "wav"

    import audio_io
    with patch.object(audio_io, "preprocess_upload", return_value=FakeMeta()):
        r = client.post(
            "/api/v1/voice/upload",
            headers=auth_headers["clinician"],
            data={"patient_id": "p-test"},
            files={"file": ("test.wav", io.BytesIO(b"RIFF" + b"\x00" * 36), "audio/wav")},
        )
    assert r.status_code == 200
    body = r.json()
    assert "session_id" in body


@pytest.mark.skipif(not _VOICE_REAL, reason="voice-engine package not available")
def test_voice_analyze_not_found_when_no_db_row(client: TestClient, auth_headers) -> None:
    """analyze/{session_id} returns 404 when no AudioAnalysis DB row exists."""
    r = client.post(
        "/api/v1/voice/analyze/nonexistent-session-xyz",
        headers=auth_headers["clinician"],
        json={},
    )
    assert r.status_code == 404


@pytest.mark.skipif(not _VOICE_REAL, reason="voice-engine package not available")
def test_voice_result_not_found_when_no_db_row(client: TestClient, auth_headers) -> None:
    """result/{session_id} returns 404 when session does not exist in DB."""
    r = client.get(
        "/api/v1/voice/result/nonexistent-session-abc",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


@pytest.mark.skipif(not _VOICE_REAL, reason="voice-engine package not available")
def test_voice_upload_missing_patient_id_returns_422(client: TestClient, auth_headers) -> None:
    """patient_id is a required form field."""
    r = client.post(
        "/api/v1/voice/upload",
        headers=auth_headers["clinician"],
        files={"file": ("test.wav", io.BytesIO(b"RIFF"), "audio/wav")},
        # no patient_id form field
    )
    assert r.status_code == 422
