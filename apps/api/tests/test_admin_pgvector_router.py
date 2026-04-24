"""Tests for ``app.routers.admin_pgvector_router``.

Exercises the admin-only pgvector status endpoint under the SQLite
test harness: confirms role-gating, response shape, and endpoint
registration. Postgres-specific behaviour is covered separately by
out-of-band integration checks.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_pgvector_status_200_and_counts_shape_on_sqlite(
    client: TestClient, auth_headers: dict
) -> None:
    """Admin caller gets a 200 with the full response envelope on SQLite.

    On SQLite the extension is disabled, ``backend`` is ``"sqlite"``,
    and the counts fall back to ``embedding_json IS NOT NULL`` (which
    yields 0 on the empty test DB but the *keys* must be present).
    """
    resp = client.get(
        "/api/v1/admin/pgvector/status", headers=auth_headers["admin"]
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert data["enabled"] is False
    assert data["backend"] == "sqlite"
    assert data["version"] is None

    counts = data["counts"]
    assert set(counts.keys()) == {
        "qeeg_analyses_with_embedding",
        "mri_analyses_with_embedding",
        "papers_with_embedding",
        "kg_entities_with_embedding",
    }
    for value in counts.values():
        assert isinstance(value, int)
        assert value >= 0


def test_pgvector_status_forbidden_for_non_admin(
    client: TestClient, auth_headers: dict
) -> None:
    """Clinician, guest, and patient roles all receive a 403."""
    for role in ("clinician", "guest", "patient"):
        resp = client.get(
            "/api/v1/admin/pgvector/status", headers=auth_headers[role]
        )
        assert resp.status_code == 403, f"role={role} got {resp.status_code}"


def test_pgvector_status_endpoint_registered(client: TestClient) -> None:
    """Endpoint is wired into the FastAPI app under the admin prefix."""
    # OpenAPI schema is the authoritative registration source.
    schema = client.get("/openapi.json").json()
    assert "/api/v1/admin/pgvector/status" in schema["paths"]
    # Must expose a GET method.
    methods = schema["paths"]["/api/v1/admin/pgvector/status"]
    assert "get" in methods
