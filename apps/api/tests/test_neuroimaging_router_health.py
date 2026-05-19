"""Router health endpoint: dark-launch flag gates mounting; health returns 200."""
from __future__ import annotations

import importlib
import os

import pytest
from fastapi.testclient import TestClient


def test_flag_off_hides_routes():
    """With flag off (default), no neuroimaging routes in app."""
    os.environ.pop("DEEPSYNAPS_ENABLE_NEUROIMAGING", None)
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


def test_health_returns_200(monkeypatch):
    """Health endpoint returns 200 and correct shape."""
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    client = TestClient(mod.app)
    response = client.get("/api/v1/neuroimaging/health")
    assert response.status_code == 200
    body = response.json()
    assert "nibabel" in body
    assert "pybids" in body
    assert "pynwb" in body
    assert "versions" in body
