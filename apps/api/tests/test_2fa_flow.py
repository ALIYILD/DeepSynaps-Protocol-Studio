from __future__ import annotations

import pyotp
from fastapi.testclient import TestClient


def _register(client: TestClient, email: str, password: str = "testpass1234") -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "TOTP User", "password": password, "role": "clinician"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def test_2fa_setup_returns_secret_qr_and_backup_codes(client: TestClient) -> None:
    token = _register(client, "2fa-setup@example.com")
    resp = client.post("/api/v1/auth/2fa/setup", headers={"Authorization": f"Bearer {token}"}, json={})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "secret" in data and len(data["secret"]) >= 16
    assert data["qr_uri"].startswith("otpauth://totp/")
    assert "DeepSynaps" in data["qr_uri"]
    assert isinstance(data["backup_codes"], list) and len(data["backup_codes"]) == 10


def test_2fa_verify_with_valid_code_enables(client: TestClient) -> None:
    token = _register(client, "2fa-verify-ok@example.com")
    setup = client.post("/api/v1/auth/2fa/setup", headers={"Authorization": f"Bearer {token}"}, json={}).json()
    code = pyotp.TOTP(setup["secret"]).now()

    resp = client.post(
        "/api/v1/auth/2fa/verify",
        headers={"Authorization": f"Bearer {token}"},
        json={"code": code},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json().get("enabled") is True


def test_2fa_verify_with_bad_code_rejects(client: TestClient) -> None:
    token = _register(client, "2fa-verify-bad@example.com")
    client.post("/api/v1/auth/2fa/setup", headers={"Authorization": f"Bearer {token}"}, json={})

    resp = client.post(
        "/api/v1/auth/2fa/verify",
        headers={"Authorization": f"Bearer {token}"},
        json={"code": "000000"},
    )
    assert resp.status_code in (400, 401), resp.text


def test_2fa_disable_requires_password_and_valid_code(client: TestClient) -> None:
    token = _register(client, "2fa-disable@example.com", password="goodpass1234")
    setup = client.post("/api/v1/auth/2fa/setup", headers={"Authorization": f"Bearer {token}"}, json={}).json()
    code = pyotp.TOTP(setup["secret"]).now()
    client.post("/api/v1/auth/2fa/verify", headers={"Authorization": f"Bearer {token}"}, json={"code": code})

    # Wrong password
    bad = client.post(
        "/api/v1/auth/2fa/disable",
        headers={"Authorization": f"Bearer {token}"},
        json={"password": "WRONG", "code": pyotp.TOTP(setup["secret"]).now()},
    )
    assert bad.status_code in (400, 401, 403), bad.text

    # Right password + right code
    ok = client.post(
        "/api/v1/auth/2fa/disable",
        headers={"Authorization": f"Bearer {token}"},
        json={"password": "goodpass1234", "code": pyotp.TOTP(setup["secret"]).now()},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json().get("enabled") is False


def test_password_change_rejects_wrong_current(client: TestClient) -> None:
    token = _register(client, "pwd-change@example.com", password="goodpass1234")
    resp = client.patch(
        "/api/v1/auth/password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "WRONG", "new_password": "newpassword1234"},
    )
    assert resp.status_code in (400, 401, 403), resp.text


def test_password_change_accepts_correct_current(client: TestClient) -> None:
    token = _register(client, "pwd-change-ok@example.com", password="goodpass1234")
    resp = client.patch(
        "/api/v1/auth/password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "goodpass1234", "new_password": "newpassword1234"},
    )
    assert resp.status_code == 200, resp.text

    # New password works on login
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "pwd-change-ok@example.com", "password": "newpassword1234"},
    )
    assert login.status_code == 200, login.text
