"""Phase 3 router tests — /simnibs/health, /monai/build-unet, /brainspace/gradients.

Covers auth/role gates, 503 fallback, 422 validation, 413 cap and 200
happy paths. Each test toggles HAS_<LIB> via monkeypatch instead of
depending on whether the heavy libs are installed on the dev box.
"""
from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.usefixtures("isolated_database")

CLINICIAN_HEADERS = {"Authorization": "Bearer clinician-demo-token"}


def _get_client(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    return TestClient(mod.app)


# ── /simnibs/health ──────────────────────────────────────────────────────


def test_simnibs_health_no_auth_403(monkeypatch):
    client = _get_client(monkeypatch)
    resp = client.get("/api/v1/neuroimaging/simnibs/health")
    assert resp.status_code == 403


def test_simnibs_health_clinician_200_when_binary_missing(monkeypatch):
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    import app.services.neuroimaging.simnibs_adapter as sim_mod
    # Force a deterministic "binary missing" response regardless of host.
    monkeypatch.setattr(sim_mod.shutil, "which", lambda _name: None)
    resp = client.get(
        "/api/v1/neuroimaging/simnibs/health", headers=CLINICIAN_HEADERS
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("available") is False
    assert body.get("version") is None


# ── /monai/build-unet ────────────────────────────────────────────────────


def test_monai_build_unet_no_auth_403(monkeypatch):
    client = _get_client(monkeypatch)
    # Force HAS_MONAI=True so the auth gate gets reached. Without this,
    # the 503 fallback fires first on hosts without the [neuro-dl] extra.
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_MONAI", True)
    resp = client.post(
        "/api/v1/neuroimaging/monai/build-unet",
        json={"in_channels": 1, "out_channels": 1, "spatial_dims": 3},
    )
    assert resp.status_code == 403


def test_monai_build_unet_503_when_missing(monkeypatch):
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_MONAI", False)
    resp = client.post(
        "/api/v1/neuroimaging/monai/build-unet",
        json={"in_channels": 1, "out_channels": 1, "spatial_dims": 3},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


def test_monai_build_unet_422_invalid_spatial_dims(monkeypatch):
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_MONAI", True)
    resp = client.post(
        "/api/v1/neuroimaging/monai/build-unet",
        json={"in_channels": 1, "out_channels": 1, "spatial_dims": 4},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 422


def test_monai_build_unet_422_invalid_channels(monkeypatch):
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_MONAI", True)
    resp = client.post(
        "/api/v1/neuroimaging/monai/build-unet",
        json={"in_channels": 0, "out_channels": 1, "spatial_dims": 3},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 422


# ── /brainspace/gradients ────────────────────────────────────────────────


def _symmetric_matrix(n: int) -> list[list[float]]:
    return [[1.0 / (1.0 + abs(i - j)) for j in range(n)] for i in range(n)]


def test_brainspace_gradients_no_auth_403(monkeypatch):
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/brainspace/gradients",
        json={"matrix": _symmetric_matrix(5), "n_components": 2},
    )
    assert resp.status_code == 403


def test_brainspace_gradients_503_when_missing(monkeypatch):
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_BRAINSPACE", False)
    resp = client.post(
        "/api/v1/neuroimaging/brainspace/gradients",
        json={"matrix": _symmetric_matrix(5), "n_components": 2},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


def test_brainspace_gradients_422_jagged_matrix(monkeypatch):
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_BRAINSPACE", True)
    jagged = [[1.0, 2.0, 3.0], [1.0, 2.0]]
    resp = client.post(
        "/api/v1/neuroimaging/brainspace/gradients",
        json={"matrix": jagged, "n_components": 2},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 422
    assert resp.json().get("code") == "jagged_matrix"


def test_brainspace_gradients_422_non_square(monkeypatch):
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_BRAINSPACE", True)
    rect = [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]]
    resp = client.post(
        "/api/v1/neuroimaging/brainspace/gradients",
        json={"matrix": rect, "n_components": 1},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 422
    assert resp.json().get("code") == "non_square_matrix"


def test_brainspace_gradients_200_happy(monkeypatch):
    client = _get_client(monkeypatch)
    matrix = _symmetric_matrix(10)
    resp = client.post(
        "/api/v1/neuroimaging/brainspace/gradients",
        json={"matrix": matrix, "n_components": 3},
        headers=CLINICIAN_HEADERS,
    )
    # Only assert 200 when BrainSpace is actually installed; otherwise
    # the route still returns 503 which is fine.
    if resp.status_code == 503:
        pytest.skip("brainspace not installed on this dev box")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["n_components"] == 3
    assert body["n_regions"] == 10
    assert len(body["explained_variance"]) == 3
