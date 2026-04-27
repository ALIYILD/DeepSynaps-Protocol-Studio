"""Regression tests pinning the privilege-escalation fix on POST /clinic.

Pre-fix any authenticated user (including ``patient`` and ``guest``)
could call ``POST /api/v1/clinic`` with a fresh clinic name, and the
handler would unconditionally rebind them to ``role="admin"`` of the
new clinic. That granted admin-tier access to every admin-gated route
in the API — a textbook authentication-bypass-class privilege
escalation.

Post-fix:
* Roles in ``_CLINIC_CREATOR_ALLOWED_ROLES`` (``clinician``, ``admin``,
  ``supervisor``) may create a clinic.
* Any other role => 403 ``forbidden``.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def _register(
    client: TestClient,
    email: str,
    *,
    role: str = "clinician",
    password: str = "testpass1234",
) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Test", "password": password, "role": role},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def _post_clinic(client: TestClient, token: str, name: str) -> tuple[int, dict]:
    resp = client.post(
        "/api/v1/clinic",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "timezone": "UTC"},
    )
    return resp.status_code, (resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {})


def test_guest_role_cannot_create_clinic(client: TestClient) -> None:
    """A ``guest`` token must NOT be able to self-promote to admin by
    creating a clinic. ``guest`` is the only non-clinical role that
    the registration endpoint will currently mint (patient is provisioned
    by the clinician-invite flow), so it's the realistic attacker token
    for this privesc path."""
    token = _register(client, "guest-privesc@example.com", role="guest")
    status, body = _post_clinic(client, token, "Privesc Clinic")
    assert status == 403, body
    assert body.get("code") == "forbidden", body


def test_technician_role_cannot_create_clinic(client: TestClient) -> None:
    """``technician`` and ``reviewer`` self-register but must NOT be
    able to spin up a fresh clinic and own it as admin."""
    token = _register(client, "tech-privesc@example.com", role="technician")
    status, body = _post_clinic(client, token, "Privesc Clinic Tech")
    assert status == 403, body
    assert body.get("code") == "forbidden", body


def test_clinician_role_can_create_clinic(client: TestClient) -> None:
    """The legitimate onboarding path — a fresh clinician account
    creates their clinic. This must continue to work."""
    token = _register(client, "clin-onboard@example.com", role="clinician")
    status, body = _post_clinic(client, token, "Onboard Clinic")
    assert status == 201, body
    assert body.get("name") == "Onboard Clinic"
