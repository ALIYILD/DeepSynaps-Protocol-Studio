"""Regression: audit_trail_router and biometrics_router must be registered in main.py."""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_audit_trail_route_is_registered(client: TestClient) -> None:
    """GET /api/v1/audit-trail must exist (not 404) — router was not included in main.py."""
    resp = client.get("/api/v1/audit-trail", headers={"Authorization": "Bearer __skip__"})
    assert resp.status_code != 404, (
        "audit_trail_router is not registered — include it in main.py"
    )


def test_biometrics_route_is_registered(client: TestClient) -> None:
    """GET /api/biometrics/summary must exist (not 404) — router was not included in main.py."""
    resp = client.get("/api/biometrics/summary", params={"patient_id": "00000000-0000-0000-0000-000000000001"})
    assert resp.status_code != 404, (
        "biometrics_router is not registered — include it in main.py"
    )
