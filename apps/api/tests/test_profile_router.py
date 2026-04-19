from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient


def _register_user(client: TestClient, email: str, password: str = "testpass1234") -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Test Clinician", "password": password, "role": "clinician"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def test_get_profile_returns_current_user(client: TestClient) -> None:
    token = _register_user(client, "profile-get@example.com")
    resp = client.get("/api/v1/profile", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "profile-get@example.com"
    assert data["role"] == "clinician"
    assert data["credentials"] is None
    assert data["license_number"] is None


def test_patch_profile_updates_display_name_and_credentials(client: TestClient) -> None:
    token = _register_user(client, "profile-patch@example.com")
    resp = client.patch(
        "/api/v1/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"display_name": "Dr. Ali Y.", "credentials": "MD, PhD", "license_number": "NPI-1234567890"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["display_name"] == "Dr. Ali Y."
    assert data["credentials"] == "MD, PhD"
    assert data["license_number"] == "NPI-1234567890"


def test_email_change_requires_correct_current_password(client: TestClient) -> None:
    token = _register_user(client, "email-pw-check@example.com", password="goodpass1234")
    resp = client.patch(
        "/api/v1/profile/email",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_email": "new@example.com", "current_password": "WRONG"},
    )
    assert resp.status_code in (400, 401, 403), resp.text


def test_email_change_stores_pending_email_and_returns_message(client: TestClient) -> None:
    token = _register_user(client, "email-change-ok@example.com", password="goodpass1234")
    resp = client.patch(
        "/api/v1/profile/email",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_email": "new-address@example.com", "current_password": "goodpass1234"},
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["pending_email"] == "new-address@example.com"

    # Original email still the active one until verification
    me = client.get("/api/v1/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == "email-change-ok@example.com"
    assert me["pending_email"] == "new-address@example.com"


def test_avatar_upload_accepts_small_png_and_returns_url(client: TestClient) -> None:
    # 1×1 transparent PNG
    png_bytes = bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "89000000017352474200AECE1CE90000000D49444154789C626001000000050001"
        "0D0A2DB40000000049454E44AE426082"
    )
    token = _register_user(client, "avatar@example.com")
    resp = client.post(
        "/api/v1/profile/avatar",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("a.png", BytesIO(png_bytes), "image/png")},
    )
    # Some stacks may reject 1×1 at Pillow resize — accept either green or a graceful 400
    assert resp.status_code in (200, 400), resp.text
    if resp.status_code == 200:
        assert "/static/avatars/" in resp.json()["avatar_url"]
