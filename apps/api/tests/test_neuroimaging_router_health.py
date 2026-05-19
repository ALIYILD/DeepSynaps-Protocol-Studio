"""Router health endpoint: dark-launch flag gates mounting; health returns 200.

B6: /health is now authenticated (clinician required).
"""
from __future__ import annotations

import importlib

import pytest


def test_flag_off_hides_routes(monkeypatch):
    """With flag off (default), no neuroimaging routes in app."""
    monkeypatch.delenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", raising=False)
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    paths = [r.path for r in mod.app.routes if "neuroimaging" in r.path]
    assert paths == [], f"Expected no neuroimaging routes, got {paths}"


def test_flag_on_mounts_routes(monkeypatch):
    """With DEEPSYNAPS_ENABLE_NEUROIMAGING=1, health route is mounted."""
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    paths = [r.path for r in mod.app.routes if "neuroimaging" in r.path]
    assert len(paths) >= 4, f"Expected >=4 neuroimaging routes, got {paths}"


def test_health_requires_auth(monkeypatch):
    """Health endpoint returns 403 without auth (guest actor fails role gate)."""
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    client = TestClient(mod.app)
    response = client.get("/api/v1/neuroimaging/health")
    assert response.status_code == 403


def test_health_returns_200_with_clinician(monkeypatch):
    """Health endpoint returns 200 with clinician auth and correct shape."""
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    client = TestClient(mod.app)
    response = client.get(
        "/api/v1/neuroimaging/health",
        headers={"Authorization": "Bearer clinician-demo-token"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "nibabel" in body
    assert "pybids" in body
    assert "pynwb" in body
    assert body.get("versions") == {}


def test_health_includes_neurokit2_true_when_installed(monkeypatch):
    """When neurokit2 is installed, health.neurokit2 == True."""
    pytest.importorskip("neurokit2")
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    client = TestClient(mod.app)
    response = client.get(
        "/api/v1/neuroimaging/health",
        headers={"Authorization": "Bearer clinician-demo-token"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body.get("neurokit2") is True
    assert body.get("nilearn") is True
    assert body.get("dipy") is True


def test_flag_on_mounts_phase2b_routes(monkeypatch):
    """Phase 2b routes (nilearn/mask, dipy/dti-scalars) present when flag is on."""
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    paths = [r.path for r in mod.app.routes if "neuroimaging" in r.path]
    assert any("nilearn" in p for p in paths), f"nilearn routes missing: {paths}"
    assert any("dipy" in p for p in paths), f"dipy routes missing: {paths}"
