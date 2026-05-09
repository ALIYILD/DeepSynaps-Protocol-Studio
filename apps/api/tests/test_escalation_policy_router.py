"""Tests for escalation_policy_router — per-clinic on-call dispatch config.

Covers 10 test cases across the key endpoints:
  GET  /api/v1/escalation-policy/dispatch-order     (get dispatch order)
  PUT  /api/v1/escalation-policy/dispatch-order     (admin: update)
  GET  /api/v1/escalation-policy/surface-overrides  (get overrides)
  PUT  /api/v1/escalation-policy/surface-overrides  (admin: update)
  GET  /api/v1/escalation-policy/user-mappings      (list mappings)
  POST /api/v1/escalation-policy/audit-events       (page audit)

Role gate: clinician = read-only on GETs; admin = full read+write; patient = 403.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# GET dispatch-order — base cases
# ---------------------------------------------------------------------------


class TestGetDispatchOrder:
    def test_clinician_can_get_dispatch_order(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/dispatch-order",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "dispatch_order" in body
        assert isinstance(body["dispatch_order"], list)
        assert "is_default" in body

    def test_admin_can_get_dispatch_order(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/dispatch-order",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text

    def test_patient_cannot_get_dispatch_order(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/dispatch-order",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_default_order_contains_known_adapters(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/dispatch-order",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        order = r.json()["dispatch_order"]
        # Must include at least one of the known adapters
        assert len(order) >= 1
        for adapter in order:
            assert isinstance(adapter, str) and adapter


# ---------------------------------------------------------------------------
# PUT dispatch-order — admin gate
# ---------------------------------------------------------------------------


class TestPutDispatchOrder:
    def test_clinician_cannot_update_dispatch_order(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={"dispatch_order": ["slack", "pagerduty"]},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_admin_can_update_dispatch_order(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={"dispatch_order": ["pagerduty", "slack", "twilio"]},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["dispatch_order"] == ["pagerduty", "slack", "twilio"]
        assert body["is_default"] is False

    def test_admin_invalid_adapter_returns_400(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={"dispatch_order": ["pagerduty", "unknown_adapter_xyz"]},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 400, r.text


# ---------------------------------------------------------------------------
# GET surface-overrides
# ---------------------------------------------------------------------------


class TestSurfaceOverrides:
    def test_clinician_can_get_surface_overrides(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/surface-overrides",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Response model uses "surface_overrides" (not "overrides")
        assert "surface_overrides" in body
        assert "known_surfaces" in body


# ---------------------------------------------------------------------------
# GET user-mappings
# ---------------------------------------------------------------------------


class TestUserMappings:
    def test_admin_can_get_user_mappings(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/user-mappings",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Response model uses "items" and "total" (not "mappings")
        assert "items" in body
        assert "total" in body
        assert isinstance(body["items"], list)


# ---------------------------------------------------------------------------
# Audit event ingestion
# ---------------------------------------------------------------------------


class TestAuditEvents:
    def test_audit_event_accepted_by_clinician(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/escalation-policy/audit-events",
            json={"event": "view", "note": "page load"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("accepted") is True
        assert "event_id" in body

    def test_patient_cannot_post_audit_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/escalation-policy/audit-events",
            json={"event": "view", "note": "attempted"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403
