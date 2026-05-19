"""Phase 1+ neuroimaging /health endpoint coverage."""
from __future__ import annotations

import importlib

import pytest


def test_flag_off_hides_routes(monkeypatch):
    monkeypatch.delenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", raising=False)
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    paths = [r.path for r in mod.app.routes if "neuroimaging" in r.path]
    assert paths == []


def test_flag_on_mounts_routes(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    paths = [r.path for r in mod.app.routes if "neuroimaging" in r.path]
    assert "/api/v1/neuroimaging/health" in paths


def test_health_returns_200_with_clinician(monkeypatch):
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
    # Phase 2+ keys must always be present (default False)
    for key in (
        "neurokit2", "nilearn", "dipy", "braindecode", "torch",
        "simnibs", "monai", "brainspace", "neo4j", "biocypher",
        "neuroglancer", "freesurfer",
    ):
        assert key in body, f"missing health key: {key}"
        assert isinstance(body[key], bool), f"{key} not bool"
    # FreeSurfer is documented as stub side-car — always False
    assert body["freesurfer"] is False
    assert body.get("versions") == {}


def test_flag_on_mounts_all_phase_routes(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    paths = [r.path for r in mod.app.routes if "neuroimaging" in r.path]
    # Spot-check one path per phase
    assert any("nilearn" in p for p in paths)
    assert any("dipy" in p for p in paths)
    assert "/api/v1/neuroimaging/simnibs/health" in paths
    assert "/api/v1/neuroimaging/monai/build-unet" in paths
    assert "/api/v1/neuroimaging/brainspace/gradients" in paths
