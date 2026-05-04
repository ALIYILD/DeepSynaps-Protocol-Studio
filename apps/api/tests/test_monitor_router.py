"""Smoke tests for monitor router + monitor_service live snapshot semantics."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_monitor_live_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/monitor/live")
    assert resp.status_code in (401, 403)


def test_monitor_live_snapshot_has_expected_keys(client: TestClient, auth_headers: dict) -> None:
    clinician_headers = auth_headers["clinician"]
    resp = client.get("/api/v1/monitor/live", headers=clinician_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "kpis" in body and "caseload" in body and "crises" in body
    kpis = body["kpis"]
    for key in ("red", "orange", "yellow", "green", "open_crises", "wearable_uptime_pct", "prom_compliance_pct"):
        assert key in kpis


def test_monitor_fleet_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/monitor/fleet")
    assert resp.status_code in (401, 403)


def test_monitor_fleet_returns_devices_array(client: TestClient, auth_headers: dict) -> None:
    clinician_headers = auth_headers["clinician"]
    resp = client.get("/api/v1/monitor/fleet", headers=clinician_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "devices" in body and isinstance(body["devices"], list)
