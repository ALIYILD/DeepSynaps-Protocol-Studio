"""Phase 6 — Neuroimaging viz router tests."""
from __future__ import annotations

import importlib


def _get_client(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    return TestClient(mod.app)


CLINICIAN_HEADERS = {"Authorization": "Bearer clinician-demo-token"}


def test_viz_neuroglancer_unauth_rejected(monkeypatch):
    """Guest actor → 403 (clinician role required)."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/viz/neuroglancer",
        json={"source": "precomputed://gs://example/data"},
    )
    assert resp.status_code == 403


def test_viz_neuroglancer_returns_url_with_clinician(monkeypatch):
    """Clinician + precomputed:// source → 200 + viewer_url + `#!` fragment."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/viz/neuroglancer",
        json={"source": "precomputed://gs://example/data"},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "viewer_url" in body
    assert "#!" in body["viewer_url"]
    assert body["source"] == "precomputed://gs://example/data"
    assert body["layer_type"] == "image"


def test_viz_neuroglancer_rejects_bad_source_scheme(monkeypatch):
    """Non-precomputed/n5/zarr scheme (ftp://) must be rejected with 422."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/viz/neuroglancer",
        json={"source": "ftp://example.com/data"},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 422


def test_viz_neuroglancer_503_when_library_missing(monkeypatch):
    """HAS_NEUROGLANCER=False → 503 neuroimaging_library_unavailable."""
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as router_mod
    monkeypatch.setattr(router_mod, "HAS_NEUROGLANCER", False)
    resp = client.post(
        "/api/v1/neuroimaging/viz/neuroglancer",
        json={"source": "precomputed://gs://example/data"},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


def test_viz_freesurfer_health_always_503(monkeypatch):
    """FreeSurfer is documented as a side-car stub — /viz/freesurfer/health
    must always return 503 with code `freesurfer_service_not_available`,
    regardless of auth (the endpoint advertises the side-car absence).
    """
    client = _get_client(monkeypatch)
    resp = client.get(
        "/api/v1/neuroimaging/viz/freesurfer/health",
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "freesurfer_service_not_available"


def test_neuroglancer_viewer_response_schema_exists():
    """NeuroglancerViewerResponse pydantic model carries viewer_url/source/layer_type."""
    from app.services.neuroimaging.schemas import NeuroglancerViewerResponse
    payload = NeuroglancerViewerResponse(
        viewer_url="https://neuroglancer-demo.appspot.com/#!{}",
        source="precomputed://gs://example/data",
        layer_type="image",
    )
    assert payload.viewer_url.endswith("#!{}")
    assert payload.source == "precomputed://gs://example/data"
    assert payload.layer_type == "image"
