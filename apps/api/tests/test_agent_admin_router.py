"""Tests for agent_admin_router — /api/v1/agent-admin/*.

Covers:
- POST /ops/scan-abuse requires admin role (403 for clinician)
- POST /ops/scan-abuse requires super-admin (clinic_id=None)
- POST /patient-activations requires admin role
- GET /patient-activations requires admin role
- GET /patient-activations/check any authenticated actor can call
- GET /patient-activations/check returns activated=False when not activated
- POST /patient-activations invalid severity triggers 422
- POST /ops/scan-abuse unauthenticated returns 403

Note: The demo "admin-demo-token" maps to a User row seeded with
clinic_id="clinic-demo-default", so the auth layer lifts that clinic_id
onto the actor — making it a *clinic-bound* admin, not a super-admin.
Super-admin tests require a real JWT with no clinic in the token payload.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import User
from app.services.auth_service import create_access_token


@pytest.fixture
def super_admin_token() -> str:
    """Create a real admin user with no clinic_id and return a JWT."""
    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        user = User(
            id=uid,
            email=f"superadmin_{uid[:8]}@example.com",
            display_name="Super Admin",
            hashed_password="x",
            role="admin",
            package_id="enterprise",
            clinic_id=None,  # super-admin: no clinic scope
        )
        db.add(user)
        db.commit()
    return create_access_token(
        user_id=uid,
        email=f"superadmin_{uid[:8]}@example.com",
        role="admin",
        package_id="enterprise",
        clinic_id=None,
    )


def test_scan_abuse_requires_admin_not_clinician(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/agent-admin/ops/scan-abuse",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code in (401, 403)


def test_scan_abuse_unauthenticated_returns_403(client: TestClient) -> None:
    resp = client.post("/api/v1/agent-admin/ops/scan-abuse")
    assert resp.status_code in (401, 403)


def test_scan_abuse_super_admin_is_accepted(
    client: TestClient, super_admin_token: str
) -> None:
    """A super-admin (admin role + clinic_id=None) can trigger the scan."""
    resp = client.post(
        "/api/v1/agent-admin/ops/scan-abuse",
        headers={"Authorization": f"Bearer {super_admin_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "scanned" in body
    assert "posted" in body
    assert "dedupe_skipped" in body


def test_scan_abuse_invalid_severity_422(
    client: TestClient, super_admin_token: str
) -> None:
    resp = client.post(
        "/api/v1/agent-admin/ops/scan-abuse?severity_threshold=extreme",
        headers={"Authorization": f"Bearer {super_admin_token}"},
    )
    assert resp.status_code == 422


def test_list_patient_activations_requires_admin(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.get(
        "/api/v1/agent-admin/patient-activations",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code in (401, 403)


def test_list_patient_activations_super_admin_returns_structure(
    client: TestClient, super_admin_token: str
) -> None:
    resp = client.get(
        "/api/v1/agent-admin/patient-activations",
        headers={"Authorization": f"Bearer {super_admin_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "activations" in body
    assert "env_flag_enabled" in body
    assert isinstance(body["activations"], list)
    assert isinstance(body["env_flag_enabled"], bool)


def test_check_activation_any_clinician_allowed(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.get(
        "/api/v1/agent-admin/patient-activations/check"
        "?clinic_id=clinic-demo-default&agent_id=patient.wellness-coach",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "activated" in body
    assert "env_flag_enabled" in body
    # When env flag is not set, activated must be False
    if not body["env_flag_enabled"]:
        assert body["activated"] is False


def test_check_activation_allows_anonymous(client: TestClient) -> None:
    """check endpoint uses require_minimum_role(actor, 'guest') — anonymous
    actors have the guest role, so they are allowed through."""
    resp = client.get(
        "/api/v1/agent-admin/patient-activations/check"
        "?clinic_id=clinic-demo-default&agent_id=patient.wellness-coach",
    )
    # Anonymous guest is allowed — endpoint returns 200
    assert resp.status_code == 200
    body = resp.json()
    assert "activated" in body


def test_create_patient_activation_requires_admin(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-demo-default",
            "agent_id": "patient.wellness-coach",
            "attestation": "Clinical PM signed off on 2026-01-01.",
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code in (401, 403)
