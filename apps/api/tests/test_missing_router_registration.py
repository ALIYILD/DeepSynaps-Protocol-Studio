"""Regression: critical routers must be registered in main.py."""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_digital_phenotyping_route_is_registered(client: TestClient) -> None:
    resp = client.get(
        "/api/v1/digital-phenotyping/analyzer/patient/00000000-0000-0000-0000-000000000001"
    )
    assert resp.status_code != 404, (
        "digital_phenotyping_router is not registered — include it in main.py"
    )


def test_labs_analyzer_route_is_registered(client: TestClient) -> None:
    resp = client.get(
        "/api/v1/labs/analyzer/patient/00000000-0000-0000-0000-000000000001"
    )
    assert resp.status_code != 404, (
        "labs_analyzer_router is not registered — include it in main.py"
    )


def test_medication_analyzer_route_is_registered(client: TestClient) -> None:
    resp = client.get(
        "/api/v1/medications/analyzer/patient/00000000-0000-0000-0000-000000000001"
    )
    assert resp.status_code != 404, (
        "medication_analyzer_router is not registered — include it in main.py"
    )


def test_movement_analyzer_route_is_registered(client: TestClient) -> None:
    resp = client.get(
        "/api/v1/movement/analyzer/patient/00000000-0000-0000-0000-000000000001"
    )
    assert resp.status_code != 404, (
        "movement_analyzer_router is not registered — include it in main.py"
    )


def test_nutrition_analyzer_route_is_registered(client: TestClient) -> None:
    resp = client.get(
        "/api/v1/nutrition/analyzer/patient/00000000-0000-0000-0000-000000000001"
    )
    assert resp.status_code != 404, (
        "nutrition_analyzer_router is not registered — include it in main.py"
    )


def test_qeeg_annotation_outcome_tracker_route_is_registered(
    client: TestClient,
) -> None:
    resp = client.get("/api/v1/qeeg-annotation-outcome-tracker/summary")
    assert resp.status_code != 404, (
        "qeeg_annotation_outcome_tracker_router is not registered — include it in main.py"
    )


def test_resolver_coaching_digest_audit_hub_route_is_registered(
    client: TestClient,
) -> None:
    resp = client.get("/api/v1/resolver-coaching-digest-audit-hub/summary")
    assert resp.status_code != 404, (
        "resolver_coaching_digest_audit_hub_router is not registered — include it in main.py"
    )


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
