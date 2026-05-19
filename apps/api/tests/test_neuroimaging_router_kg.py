"""Phase 5 — KG router endpoint tests.

Covers auth gating, the Neo4j health probe, and the BioCypher schema endpoint
with allow-list traversal protection.
"""
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


def test_neo4j_health_requires_clinician(monkeypatch):
    """GET /kg/neo4j/health without auth → 403 from require_minimum_role."""
    client = _get_client(monkeypatch)
    resp = client.get("/api/v1/neuroimaging/kg/neo4j/health")
    assert resp.status_code == 403


def test_neo4j_health_happy_shape_with_clinician(monkeypatch):
    """GET /kg/neo4j/health with clinician → 200 + Neo4jHealth shape."""
    # No NEO4J_* env vars → reachable=None, configured=False, no error string.
    for var in ("NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD"):
        monkeypatch.delenv(var, raising=False)
    client = _get_client(monkeypatch)
    resp = client.get("/api/v1/neuroimaging/kg/neo4j/health", headers=CLINICIAN_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) >= {"driver_installed", "configured", "reachable", "error"}
    assert body["configured"] is False
    assert body["reachable"] is None
    assert isinstance(body["driver_installed"], bool)


def test_neo4j_health_503_when_driver_missing(monkeypatch):
    """HAS_NEO4J_DRIVER=False → /kg/neo4j/health returns 503 neuroimaging_library_unavailable."""
    for var in ("NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD"):
        monkeypatch.delenv(var, raising=False)
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_NEO4J_DRIVER", False)
    resp = client.get("/api/v1/neuroimaging/kg/neo4j/health", headers=CLINICIAN_HEADERS)
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


_TINY_BIOCYPHER_YAML = """\
protein:
  represented_as: node
  preferred_id: uniprot
  input_label: protein
disease:
  represented_as: node
  preferred_id: doid
  input_label: disease
protein_to_disease_association:
  represented_as: edge
  source: protein
  target: disease
  input_label: associated_with
"""


def test_biocypher_schema_happy_path(monkeypatch, tmp_path):
    """POST /kg/biocypher/schema with allowed yaml_path returns counts."""
    yaml_path = tmp_path / "schema.yaml"
    yaml_path.write_text(_TINY_BIOCYPHER_YAML)
    monkeypatch.setenv("DEEPSYNAPS_BIDS_ROOTS", str(tmp_path))
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/kg/biocypher/schema",
        json={"yaml_path": str(yaml_path)},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_entity_types"] == 2
    assert body["n_edge_types"] == 1
    assert body["source"] == str(yaml_path)
