from __future__ import annotations

from fastapi.testclient import TestClient


def _register(client: TestClient, email: str, role: str = "clinician", password: str = "testpass1234") -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Team User", "password": password, "role": role},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def _create_clinic_as_admin(client: TestClient, token: str, name: str = "Test Clinic") -> dict:
    resp = client.post(
        "/api/v1/clinic",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "timezone": "UTC"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_invite_by_non_admin_is_forbidden(client: TestClient) -> None:
    token = _register(client, "team-nonadmin@example.com")
    resp = client.post(
        "/api/v1/team/invite",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "invited@example.com", "role": "clinician"},
    )
    assert resp.status_code in (403, 404), resp.text


def test_admin_can_invite_and_list_pending(client: TestClient) -> None:
    admin_token = _register(client, "team-admin@example.com")
    _create_clinic_as_admin(client, admin_token)

    resp = client.post(
        "/api/v1/team/invite",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"email": "pending-invite@example.com", "role": "clinician"},
    )
    assert resp.status_code == 200, resp.text
    invite = resp.json()
    assert invite["email"] == "pending-invite@example.com"
    assert invite["role"] == "clinician"
    assert invite.get("token")

    # Verify it appears in pending list
    team = client.get("/api/v1/team", headers={"Authorization": f"Bearer {admin_token}"}).json()
    pending_emails = [p["email"] for p in team.get("pending", [])]
    assert "pending-invite@example.com" in pending_emails


def test_duplicate_active_invite_rejected(client: TestClient) -> None:
    admin_token = _register(client, "team-dup-admin@example.com")
    _create_clinic_as_admin(client, admin_token)

    first = client.post(
        "/api/v1/team/invite",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"email": "dup@example.com", "role": "clinician"},
    )
    assert first.status_code == 200

    second = client.post(
        "/api/v1/team/invite",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"email": "dup@example.com", "role": "clinician"},
    )
    assert second.status_code == 409, second.text


def test_accept_invite_creates_user_and_returns_token(client: TestClient) -> None:
    admin_token = _register(client, "accept-admin@example.com")
    _create_clinic_as_admin(client, admin_token)

    invite = client.post(
        "/api/v1/team/invite",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"email": "newcolleague@example.com", "role": "clinician"},
    ).json()

    accept = client.post(
        "/api/v1/team/accept-invite",
        json={"token": invite["token"], "password": "newuserpass123", "display_name": "Dr. Colleague"},
    )
    assert accept.status_code == 200, accept.text
    assert "access_token" in accept.json()


def test_cannot_remove_self_from_team(client: TestClient) -> None:
    admin_token = _register(client, "self-remove@example.com")
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {admin_token}"}).json()
    _create_clinic_as_admin(client, admin_token)

    resp = client.delete(
        f"/api/v1/team/{me['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 409, resp.text
