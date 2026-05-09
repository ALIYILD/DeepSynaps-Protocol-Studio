"""Tests for auth_router — register / login / me / demo-login / logout / refresh.

Covers the most-exercised auth surface (7 endpoints, 12 test cases):
  * POST /api/v1/auth/register
  * POST /api/v1/auth/login
  * POST /api/v1/auth/refresh
  * GET  /api/v1/auth/me
  * POST /api/v1/auth/logout
  * POST /api/v1/auth/demo-login
  * GET  /api/v1/auth/sessions

All tests use the FastAPI TestClient + the shared conftest client/auth_headers
fixtures. No demo tokens reach the settings-only helpers (/auth/password,
/auth/2fa/*) — those require a real DB-backed JWT and are integration-level.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:12]}@example.com"


def _register(client: TestClient, email: str, password: str = "Passw0rd!") -> dict:
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Test User", "password": password},
    )


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------


class TestRegister:
    def test_register_happy_path(self, client: TestClient) -> None:
        r = _register(client, _unique_email())
        assert r.status_code == 201, r.text
        body = r.json()
        assert "access_token" in body
        assert "refresh_token" in body
        assert "user" in body
        assert body["user"]["role"] == "clinician"

    def test_register_duplicate_email_returns_409(self, client: TestClient) -> None:
        email = _unique_email()
        r1 = _register(client, email)
        assert r1.status_code == 201
        r2 = _register(client, email)
        assert r2.status_code == 409
        assert r2.json()["code"] == "email_already_registered"

    def test_register_invalid_email_returns_400(self, client: TestClient) -> None:
        r = _register(client, "not-an-email")
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_email"

    def test_register_short_password_returns_400(self, client: TestClient) -> None:
        r = _register(client, _unique_email(), password="short")
        assert r.status_code == 400
        assert r.json()["code"] == "password_too_short"

    def test_register_missing_fields_returns_422(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/register", json={})
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------


class TestLogin:
    def test_login_happy_path(self, client: TestClient) -> None:
        email = _unique_email()
        _register(client, email, "Passw0rd!")
        r = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "Passw0rd!"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == email

    def test_login_wrong_password_returns_401(self, client: TestClient) -> None:
        email = _unique_email()
        _register(client, email, "Passw0rd!")
        r = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WrongPassword1"},
        )
        assert r.status_code == 401
        assert r.json()["code"] == "invalid_credentials"

    def test_login_unknown_email_returns_401(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@example.com", "password": "Passw0rd!"},
        )
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


class TestMe:
    def test_me_with_demo_token(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/auth/me", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["role"] == "clinician"

    def test_me_without_token_returns_401(self, client: TestClient) -> None:
        r = client.get("/api/v1/auth/me")
        assert r.status_code == 401

    def test_me_admin_demo_token(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/auth/me", headers=auth_headers["admin"])
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# ---------------------------------------------------------------------------
# POST /auth/demo-login
# ---------------------------------------------------------------------------


class TestDemoLogin:
    def test_demo_login_clinician_token(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/demo-login",
            json={"token": "clinician-demo-token"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert body["user"]["role"] == "clinician"

    def test_demo_login_patient_token(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/demo-login",
            json={"token": "patient-demo-token"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "patient"

    def test_demo_login_invalid_token_returns_400(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/demo-login",
            json={"token": "not-a-real-demo-token"},
        )
        assert r.status_code == 400, r.text
        assert r.json()["code"] == "invalid_demo_token"


# ---------------------------------------------------------------------------
# POST /auth/refresh + server-side session gate
# ---------------------------------------------------------------------------


class TestRefresh:
    def test_refresh_with_invalid_token_returns_401(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "not.a.real.token"},
        )
        assert r.status_code == 401
        assert r.json()["code"] == "invalid_refresh_token"

    def test_refresh_happy_path(self, client: TestClient) -> None:
        """Register → grab refresh token → exchange for new pair."""
        email = _unique_email()
        reg = _register(client, email)
        assert reg.status_code == 201
        refresh_token = reg.json()["refresh_token"]

        r = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert "refresh_token" in body


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


class TestLogout:
    def test_logout_succeeds_for_demo_token(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post("/api/v1/auth/logout", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        assert r.json().get("message")


# ---------------------------------------------------------------------------
# GET /auth/sessions  (settings — requires real JWT, not demo token)
# ---------------------------------------------------------------------------


class TestSessionsGate:
    def test_sessions_list_rejects_demo_token(self, client: TestClient, auth_headers: dict) -> None:
        """Demo tokens are not backed by a DB user; settings endpoints 401."""
        r = client.get("/api/v1/auth/sessions", headers=auth_headers["clinician"])
        # auth/sessions requires _require_current_user which rejects demo actors
        assert r.status_code == 401
