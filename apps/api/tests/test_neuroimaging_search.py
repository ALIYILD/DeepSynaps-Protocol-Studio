"""Tests for /api/v1/neuroimaging/* endpoints (PR-1 backend).

Validates the federated-search HTTP contract:

- Empty body POST returns the full response shape.
- ``decision_support_disclaimer`` is present and non-empty.
- All-upstreams-down → HTTP 200 with warnings (never 5xx).
- Coordinate queries preserve provenance and never emit fake coordinates.
"""
from __future__ import annotations

import pytest


pytestmark = pytest.mark.usefixtures("client")


def _auth(headers: dict[str, dict[str, str]]) -> dict[str, str]:
    return headers["clinician"]


# ─── Catalog endpoints ──────────────────────────────────────────────────


def test_list_adapters_returns_eighteen(client, auth_headers):
    resp = client.get("/api/v1/neuroimaging/adapters", headers=_auth(auth_headers))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 18
    assert len(body["sources"]) == 18
    assert "decision_support_disclaimer" in body
    assert "decision support only" in body["decision_support_disclaimer"]


def test_adapter_detail_known(client, auth_headers):
    resp = client.get(
        "/api/v1/neuroimaging/adapters/neurosynth", headers=_auth(auth_headers)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"]["id"] == "neurosynth"
    assert body["source"]["lifecycle_state"] == "healthy"
    assert (
        body["source"]["import_path"]
        == "app.services.knowledge.adapters.neurosynth_adapter"
    )
    assert body["decision_support_disclaimer"]


def test_adapter_detail_unknown_404(client, auth_headers):
    resp = client.get(
        "/api/v1/neuroimaging/adapters/does-not-exist",
        headers=_auth(auth_headers),
    )
    assert resp.status_code == 404


def test_lifecycle_summary(client, auth_headers):
    resp = client.get(
        "/api/v1/neuroimaging/_lifecycle", headers=_auth(auth_headers)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 18
    assert "by_state" in body
    assert body["by_state"].get("healthy", 0) >= 5
    assert body["by_state"].get("requires_application", 0) >= 1
    assert body["by_state"].get("deprecated", 0) >= 1
    assert body["by_state"].get("software_resource", 0) >= 1
    assert body["decision_support_disclaimer"]


# ─── Federated search ──────────────────────────────────────────────────


def test_search_empty_body_returns_full_shape(client, auth_headers):
    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Required keys per the public contract.
    for key in (
        "source_status",
        "results",
        "warnings",
        "provenance",
        "decision_support_disclaimer",
    ):
        assert key in body, f"missing key in search response: {key}"
    assert isinstance(body["source_status"], list)
    assert isinstance(body["results"], list)
    assert isinstance(body["warnings"], list)
    assert isinstance(body["provenance"], dict)
    assert body["decision_support_disclaimer"]


def test_search_includes_decision_support_disclaimer(client, auth_headers):
    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"condition": "depression"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "decision support only" in body["decision_support_disclaimer"]
    assert (
        body["provenance"]["decision_support_disclaimer"]
        == body["decision_support_disclaimer"]
    )


def test_search_all_upstreams_down_returns_200_with_warnings(client, auth_headers):
    """Even when every adapter import fails, the endpoint stays HTTP 200."""
    # Monkey-patch the adapter resolver to always fail.
    from app.routers import neuroimaging_router as nr

    original = nr._resolve_adapter
    nr._resolve_adapter = lambda _path: None
    try:
        resp = client.post(
            "/api/v1/neuroimaging/search",
            headers=_auth(auth_headers),
            json={"condition": "anxiety"},
        )
    finally:
        nr._resolve_adapter = original

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["results"] == []
    # 5 enabled sources × adapter_import_failed warning each.
    assert len(body["warnings"]) >= 5
    error_statuses = [s for s in body["source_status"] if s["status"] == "error"]
    assert len(error_statuses) >= 5
    assert all(s["error"] == "adapter_import_failed" for s in error_statuses)


def test_search_partial_failure(client, auth_headers):
    """Some adapters fail, others skip — endpoint stays 200 with mixed statuses."""
    from app.routers import neuroimaging_router as nr

    original = nr._resolve_adapter

    def selective_fail(path: str):
        if "neurosynth" in path:
            return None  # simulate import failure
        return original(path)

    nr._resolve_adapter = selective_fail
    try:
        resp = client.post(
            "/api/v1/neuroimaging/search",
            headers=_auth(auth_headers),
            json={},
        )
    finally:
        nr._resolve_adapter = original

    assert resp.status_code == 200, resp.text
    body = resp.json()
    statuses = {s["id"]: s for s in body["source_status"]}
    assert statuses["neurosynth"]["status"] == "error"
    assert statuses["neurosynth"]["error"] == "adapter_import_failed"


def test_search_coordinate_query_preserves_provenance(client, auth_headers):
    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"coordinate": [-42.0, 16.0, 36.0], "atlas": "MNI152"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # PR-1: federation deferred → no runtime results, no fake coordinates emitted.
    assert body["results"] == []
    # Provenance still records the queried-sources list + disclaimer.
    assert "queried_sources" in body["provenance"]
    assert body["provenance"]["total_results"] == 0
    assert body["provenance"]["decision_support_disclaimer"]


def test_search_unknown_source_id_is_warning_not_500(client, auth_headers):
    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"sources": ["totally-fake-source"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any("totally-fake-source" in w for w in body["warnings"])


def test_search_explicit_sources_filter_subset(client, auth_headers):
    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"sources": ["neurosynth"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    queried = body["provenance"]["queried_sources"]
    assert queried == ["neurosynth"]
