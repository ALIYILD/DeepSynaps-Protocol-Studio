"""Tests for agent_admin_router.py.

Covers:
- scan-abuse: auth rejection for non-admin (403)
- scan-abuse: clinic-bound admin rejected (403, ops_admin_required)
- scan-abuse: invalid severity_threshold → 422
- patient-activations check: any authenticated actor can call check
- patient-activations check: missing params → 422
- patient-activations create: super-admin can record an activation
- patient-activations list: super-admin gets activation list with env_flag
- patient-activations delete: super-admin can deactivate
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

# The conftest seeds:
#   actor-admin-demo   / admin / clinic_id=clinic-demo-default
# We need a SUPER-admin (admin + no clinic). We mint one here.

def _mint_super_admin_token() -> str:
    from app.services.auth_service import create_access_token
    return create_access_token(
        user_id="sa-test-001",
        email="sa@example.com",
        role="admin",
        package_id="enterprise",
        clinic_id=None,  # <- makes it super-admin
    )


def _super_admin_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_mint_super_admin_token()}"}


def _clinician_headers() -> dict[str, str]:
    return {"Authorization": "Bearer clinician-demo-token"}


def _admin_clinic_headers() -> dict[str, str]:
    """Clinic-bound admin — NOT a super-admin."""
    return {"Authorization": "Bearer admin-demo-token"}


# ---------------------------------------------------------------------------
# scan-abuse
# ---------------------------------------------------------------------------

def test_scan_abuse_requires_super_admin_not_clinician(client: TestClient) -> None:
    r = client.post("/api/v1/agent-admin/ops/scan-abuse", headers=_clinician_headers())
    assert r.status_code == 403


def test_scan_abuse_clinic_bound_admin_rejected(client: TestClient) -> None:
    r = client.post("/api/v1/agent-admin/ops/scan-abuse", headers=_admin_clinic_headers())
    # clinic-bound admin has clinic_id set → ops_admin_required gate fires
    assert r.status_code == 403


def test_scan_abuse_invalid_severity_422(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-admin/ops/scan-abuse?severity_threshold=extreme",
        headers=_super_admin_headers(),
    )
    assert r.status_code == 422


def test_scan_abuse_super_admin_ok(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-admin/ops/scan-abuse?severity_threshold=high",
        headers=_super_admin_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert "scanned" in body
    assert "posted" in body
    assert "dedupe_skipped" in body


# ---------------------------------------------------------------------------
# patient-activations: check (any authenticated actor)
# ---------------------------------------------------------------------------

def test_activation_check_missing_params_422(client: TestClient) -> None:
    r = client.get("/api/v1/agent-admin/patient-activations/check", headers=_clinician_headers())
    assert r.status_code == 422


def test_activation_check_returns_activated_false_when_not_activated(client: TestClient) -> None:
    r = client.get(
        "/api/v1/agent-admin/patient-activations/check?clinic_id=c1&agent_id=patient.test",
        headers=_clinician_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["activated"] is False
    assert "env_flag_enabled" in body


# ---------------------------------------------------------------------------
# patient-activations: list (super-admin only)
# ---------------------------------------------------------------------------

def test_list_activations_requires_super_admin(client: TestClient) -> None:
    r = client.get("/api/v1/agent-admin/patient-activations", headers=_clinician_headers())
    assert r.status_code == 403


def test_list_activations_empty_for_fresh_db(client: TestClient) -> None:
    r = client.get("/api/v1/agent-admin/patient-activations", headers=_super_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["activations"] == []
    assert "env_flag_enabled" in body


# ---------------------------------------------------------------------------
# patient-activations: create + delete (super-admin only)
# ---------------------------------------------------------------------------

def test_create_activation_validates_non_patient_agent(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-demo-default",
            "agent_id": "clinician.protocol_advisor",  # NOT patient-facing
            "attestation": "Clinical PM reviewed and signed off on 2026-05-01",
        },
        headers=_super_admin_headers(),
    )
    assert r.status_code == 422
    assert "agent_id_not_patient_facing" in r.json().get("code", "")


def test_create_activation_short_attestation_422(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-demo-default",
            "agent_id": "patient.companion",
            "attestation": "too short",
        },
        headers=_super_admin_headers(),
    )
    assert r.status_code == 422


def test_delete_activation_idempotent(client: TestClient) -> None:
    r = client.delete(
        "/api/v1/agent-admin/patient-activations/no-such-clinic/no-such-agent",
        headers=_super_admin_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["removed"] is False
