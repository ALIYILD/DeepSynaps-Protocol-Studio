"""Phase 4 — Realtime router endpoint tests."""
from __future__ import annotations

import importlib

import pytest

CLINICIAN_HEADERS = {"Authorization": "Bearer clinician-demo-token"}


def _get_client(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    return TestClient(mod.app)


def test_brainflow_boards_requires_clinician(monkeypatch):
    client = _get_client(monkeypatch)
    resp = client.get("/api/v1/neuroimaging/realtime/brainflow/boards")
    assert resp.status_code == 403


def test_brainflow_boards_happy(monkeypatch):
    pytest.importorskip("brainflow")
    client = _get_client(monkeypatch)
    resp = client.get(
        "/api/v1/neuroimaging/realtime/brainflow/boards",
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) > 10
    assert all("name" in b and "board_id" in b for b in body)


def test_brainflow_boards_503_when_missing(monkeypatch):
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr
    monkeypatch.setattr(nr, "HAS_BRAINFLOW", False)
    resp = client.get(
        "/api/v1/neuroimaging/realtime/brainflow/boards",
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


def test_brainflow_session_meta_happy(monkeypatch):
    pytest.importorskip("brainflow")
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/realtime/brainflow/session-meta",
        json={"board_id": -1},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["board_id"] == -1
    assert body["sampling_rate_hz"] > 0


def test_neurosimo_health_always_503(monkeypatch):
    client = _get_client(monkeypatch)
    resp = client.get(
        "/api/v1/neuroimaging/realtime/neurosimo/health",
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neurosimo_service_not_available"
