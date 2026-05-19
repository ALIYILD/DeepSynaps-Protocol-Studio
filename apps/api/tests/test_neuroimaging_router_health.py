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
    # Phase 3 additions: SimNIBS (CLI probe), MONAI ([neuro-dl] extra),
    # BrainSpace (base dep). All three keys should be present even when
    # the libs are absent (in which case the values are False).
    assert "simnibs" in body
    assert "monai" in body
    assert "brainspace" in body
    assert isinstance(body["simnibs"], bool)
    assert isinstance(body["monai"], bool)
    assert isinstance(body["brainspace"], bool)
    assert body.get("versions") == {}


<<<<<<< HEAD
def test_health_includes_neurokit2_true_when_installed(monkeypatch):
    """When neurokit2 is installed, health.neurokit2 == True."""
    pytest.importorskip("neurokit2")
=======
def test_health_includes_phase5_knowledge_graph_keys(monkeypatch):
    """Phase 5 — health response carries neo4j and biocypher flags."""
>>>>>>> feat(api): Phase 5 — Knowledge Graph (Neo4j + BioCypher)
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
<<<<<<< HEAD
    assert body.get("neurokit2") is True
    assert body.get("nilearn") is True
    assert body.get("dipy") is True
    assert "braindecode" in body
    assert "torch" in body
    assert isinstance(body["braindecode"], bool)
    assert isinstance(body["torch"], bool)


def test_flag_on_mounts_phase2b_routes(monkeypatch):
    """Phase 2b routes (nilearn/mask, dipy/dti-scalars) present when flag is on."""
def test_flag_on_mounts_phase3_routes(monkeypatch):
    """With flag on, the three Phase 3 endpoints are mounted."""
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    paths = [r.path for r in mod.app.routes if "neuroimaging" in r.path]
    assert any("nilearn" in p for p in paths), f"nilearn routes missing: {paths}"
    assert any("dipy" in p for p in paths), f"dipy routes missing: {paths}"
    assert "/api/v1/neuroimaging/simnibs/health" in paths
    assert "/api/v1/neuroimaging/monai/build-unet" in paths
    assert "/api/v1/neuroimaging/brainspace/gradients" in paths
=======
    assert "neo4j" in body
    assert "biocypher" in body
    assert isinstance(body["neo4j"], bool)
    assert isinstance(body["biocypher"], bool)
    # Health values must reflect the import-level flags, not always-default-False.
    from app.services.neuroimaging.kg_neo4j import HAS_NEO4J_DRIVER
    from app.services.neuroimaging.kg_biocypher import HAS_BIOCYPHER
    assert body["neo4j"] is HAS_NEO4J_DRIVER
    assert body["biocypher"] is HAS_BIOCYPHER
>>>>>>> feat(api): Phase 5 — Knowledge Graph (Neo4j + BioCypher)
