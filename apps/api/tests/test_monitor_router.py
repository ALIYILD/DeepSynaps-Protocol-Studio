"""Smoke tests for clinician-scoped monitor router endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_monitor_live_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/monitor/live", headers=auth_headers["guest"])
    assert r.status_code == 403


def test_monitor_live_ok_for_clinician(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/monitor/live", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "kpis" in body and "caseload" in body and "generated_at" in body


def test_monitor_fleet_ok_for_clinician(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/monitor/fleet", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "devices" in body


def test_monitor_integrations_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/monitor/integrations", headers=auth_headers["guest"])
    assert r.status_code == 403
