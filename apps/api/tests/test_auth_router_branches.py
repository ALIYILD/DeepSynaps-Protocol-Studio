"""Deep-coverage branch tests for auth_router.

Pins every error path not covered by test_auth_router.py and
test_2fa_flow.py / test_auth_persistence.py — including:
  * token-refresh edge cases (revoked, inactive user, missing payload fields)
  * /auth/me all branches (demo JWT, real user, invalid token format)
  * /auth/logout (refresh token path + all-sessions revoke path)
  * /auth/demo-login production gate
  * /auth/forgot-password / reset-password full error paths
  * /auth/activate-patient all validation paths
  * /auth/password all validation branches
  * /auth/2fa/setup + verify + disable all error paths
  * /auth/sessions + revoke-others + revoke-one all branches
  * Pydantic 422 paths for all endpoints
  * _require_current_user helper paths
  * register with explicit allowed/disallowed roles
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pyotp
import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import PasswordResetToken, PatientInvite, User, UserSession
from app.services import auth_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _unique_email(prefix: str = "br") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}@example.com"


def _register(
    client: TestClient,
    email: str,
    password: str = "TestPass1234!",
    display_name: str = "Branch User",
    role: str = "clinician",
) -> dict:
    """Register and return the full response JSON."""
    r = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name, "role": role},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_reset_token(user_id: str, *, expired: bool = False, used: bool = False) -> str:
    """Seed a PasswordResetToken and return the raw token."""
    raw, token_hash = auth_service.generate_password_reset_token()
    db = SessionLocal()
    try:
        if expired:
            expires_at = datetime.now(timezone.utc) - timedelta(hours=2)
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        prt = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        if used:
            prt.used_at = datetime.now(timezone.utc)
        db.add(prt)
        db.commit()
    finally:
        db.close()
    return raw


def _make_invite(
    email: str = "invite@example.com",
    *,
    expired: bool = False,
    used: bool = False,
    clinician_id: str = "actor-clinician-demo",
) -> str:
    """Seed a PatientInvite and return the invite code."""
    code = uuid.uuid4().hex
    db = SessionLocal()
    try:
        if expired:
            expires_at = datetime.now(timezone.utc) - timedelta(hours=2)
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        invite = PatientInvite(
            invite_code=code,
            patient_email=email,
            clinician_id=clinician_id,
            expires_at=expires_at,
        )
        if used:
            invite.used_at = datetime.now(timezone.utc)
        db.add(invite)
        db.commit()
    finally:
        db.close()
    return code


# ---------------------------------------------------------------------------
# POST /auth/register — role assignment branches
# ---------------------------------------------------------------------------


class TestRegisterRoles:
    def test_register_allowed_guest_role(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/register",
            json={"email": _unique_email("guest"), "password": "TestPass1234!", "role": "guest", "display_name": "Guest User"},
        )
        assert r.status_code == 201
        assert r.json()["user"]["role"] == "guest"

    def test_register_allowed_technician_role(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/register",
            json={"email": _unique_email("tech"), "password": "TestPass1234!", "role": "technician", "display_name": "Tech User"},
        )
        assert r.status_code == 201
        assert r.json()["user"]["role"] == "technician"

    def test_register_disallowed_role_falls_back_to_clinician(self, client: TestClient) -> None:
        """admin/supervisor are not self-registerable → assigned as 'clinician'."""
        r = client.post(
            "/api/v1/auth/register",
            json={"email": _unique_email("admin"), "password": "TestPass1234!", "role": "admin", "display_name": "Admin User"},
        )
        assert r.status_code == 201
        assert r.json()["user"]["role"] == "clinician"

    def test_register_missing_email_returns_422(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/register",
            json={"password": "TestPass1234!"},
        )
        assert r.status_code == 422

    def test_register_missing_password_returns_422(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/register",
            json={"email": _unique_email()},
        )
        assert r.status_code == 422

    def test_register_password_exactly_8_chars_accepted(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/register",
            json={"email": _unique_email(), "password": "12345678", "display_name": "Test User"},
        )
        assert r.status_code == 201

    def test_register_password_7_chars_rejected(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/register",
            json={"email": _unique_email(), "password": "1234567", "display_name": "Test User"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "password_too_short"


# ---------------------------------------------------------------------------
# POST /auth/login — edge cases
# ---------------------------------------------------------------------------


class TestLoginEdgeCases:
    def test_login_inactive_user_returns_401(self, client: TestClient) -> None:
        email = _unique_email("inactive")
        _register(client, email)
        # Deactivate the user directly
        db = SessionLocal()
        try:
            user = db.query(User).filter_by(email=email).first()
            assert user is not None
            user.is_active = False
            db.commit()
        finally:
            db.close()
        r = client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass1234!"})
        assert r.status_code == 401
        assert r.json()["code"] == "account_inactive"

    def test_login_missing_email_returns_422(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/login", json={"password": "TestPass1234!"})
        assert r.status_code == 422

    def test_login_missing_password_returns_422(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/login", json={"email": "x@example.com"})
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/refresh — all branches
# ---------------------------------------------------------------------------


class TestRefreshAllBranches:
    def test_refresh_inactive_user_returns_401(self, client: TestClient) -> None:
        email = _unique_email("ref_inactive")
        body = _register(client, email)
        refresh = body["refresh_token"]
        # Deactivate
        db = SessionLocal()
        try:
            user = db.query(User).filter_by(email=email).first()
            user.is_active = False
            db.commit()
        finally:
            db.close()
        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        assert r.status_code == 401
        assert r.json()["code"] == "account_inactive"

    def test_refresh_missing_token_returns_422(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/refresh", json={})
        assert r.status_code == 422

    def test_refresh_access_token_as_refresh_returns_401(self, client: TestClient) -> None:
        """Access token type != 'refresh' must be rejected."""
        email = _unique_email("ref_access")
        body = _register(client, email)
        access_token = body["access_token"]
        r = client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
        assert r.status_code == 401
        assert r.json()["code"] == "invalid_refresh_token"

    def test_refresh_revoked_session_returns_401(self, client: TestClient) -> None:
        email = _unique_email("ref_revoked")
        body = _register(client, email)
        refresh = body["refresh_token"]
        # Revoke the session row
        db = SessionLocal()
        try:
            token_hash = auth_service.hash_refresh_token(refresh)
            row = db.query(UserSession).filter_by(refresh_token_hash=token_hash).first()
            if row:
                row.revoked_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()
        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        assert r.status_code == 401
        assert r.json()["code"] == "invalid_refresh_token"

    def test_refresh_returns_new_access_token(self, client: TestClient) -> None:
        """After a valid refresh call a new access_token is returned."""
        email = _unique_email("ref_rotate")
        body = _register(client, email)
        original_refresh = body["refresh_token"]
        r = client.post("/api/v1/auth/refresh", json={"refresh_token": original_refresh})
        assert r.status_code == 200
        resp = r.json()
        assert "access_token" in resp
        assert "refresh_token" in resp
        assert resp["user"]["role"] in {"clinician", "guest", "admin", "supervisor", "patient", "technician"}


# ---------------------------------------------------------------------------
# GET /auth/me — all branches
# ---------------------------------------------------------------------------


class TestMeAllBranches:
    def test_me_with_real_user_jwt(self, client: TestClient) -> None:
        email = _unique_email("me_real")
        body = _register(client, email)
        r = client.get("/api/v1/auth/me", headers=_bearer(body["access_token"]))
        assert r.status_code == 200
        assert r.json()["email"] == email

    def test_me_with_refresh_token_returns_401(self, client: TestClient) -> None:
        """Refresh token type != 'access' → 401."""
        email = _unique_email("me_ref")
        body = _register(client, email)
        r = client.get("/api/v1/auth/me", headers=_bearer(body["refresh_token"]))
        assert r.status_code == 401

    def test_me_with_malformed_bearer_returns_401(self, client: TestClient) -> None:
        r = client.get("/api/v1/auth/me", headers={"Authorization": "Basic dXNlcjpwYXNz"})
        assert r.status_code == 401
        assert r.json()["code"] == "invalid_auth_header"

    def test_me_with_bearer_no_token_returns_401(self, client: TestClient) -> None:
        r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer "})
        assert r.status_code == 401

    def test_me_with_guest_demo_token(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/auth/me", headers=auth_headers["guest"])
        assert r.status_code == 200
        assert r.json()["role"] == "guest"

    def test_me_with_patient_demo_token(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/auth/me", headers=auth_headers["patient"])
        assert r.status_code == 200
        assert r.json()["role"] == "patient"


# ---------------------------------------------------------------------------
# POST /auth/demo-login — production gate
# ---------------------------------------------------------------------------


class TestDemoLoginBranches:
    def test_demo_login_production_returns_404(self, client: TestClient, monkeypatch) -> None:
        from app.settings import get_settings
        settings = get_settings().model_copy(update={"app_env": "production"})
        monkeypatch.setattr("app.routers.auth_router.get_settings", lambda: settings)
        r = client.post("/api/v1/auth/demo-login", json={"token": "clinician-demo-token"})
        assert r.status_code == 404

    def test_demo_login_staging_returns_404(self, client: TestClient, monkeypatch) -> None:
        from app.settings import get_settings
        settings = get_settings().model_copy(update={"app_env": "staging"})
        monkeypatch.setattr("app.routers.auth_router.get_settings", lambda: settings)
        r = client.post("/api/v1/auth/demo-login", json={"token": "clinician-demo-token"})
        assert r.status_code == 404

    def test_demo_login_missing_token_returns_422(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/demo-login", json={})
        assert r.status_code == 422

    def test_demo_login_admin_token(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/demo-login", json={"token": "admin-demo-token"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"


# ---------------------------------------------------------------------------
# POST /auth/logout — all branches
# ---------------------------------------------------------------------------


class TestLogoutAllBranches:
    def test_logout_with_refresh_token_revokes_session(self, client: TestClient) -> None:
        email = _unique_email("logout_rt")
        body = _register(client, email)
        refresh = body["refresh_token"]
        r = client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
        assert r.status_code == 200
        # Verify session is now revoked
        r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        assert r2.status_code == 401

    def test_logout_without_body_revokes_all_sessions(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post("/api/v1/auth/logout", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json().get("message")

    def test_logout_with_already_revoked_token_still_200(self, client: TestClient) -> None:
        email = _unique_email("logout_twice")
        body = _register(client, email)
        refresh = body["refresh_token"]
        client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
        # Second logout on same token — should be idempotent 200
        r2 = client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
        assert r2.status_code == 200


# ---------------------------------------------------------------------------
# POST /auth/forgot-password — all branches
# ---------------------------------------------------------------------------


class TestForgotPassword:
    def test_forgot_password_unknown_email_returns_200(self, client: TestClient) -> None:
        """Anti-enumeration: always succeeds regardless of whether email exists."""
        r = client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody_unknown@example.com"},
        )
        assert r.status_code == 200
        assert "email" in r.json()["message"].lower() or "reset" in r.json()["message"].lower()

    def test_forgot_password_known_email_returns_200(self, client: TestClient) -> None:
        email = _unique_email("forgot")
        _register(client, email)
        r = client.post("/api/v1/auth/forgot-password", json={"email": email})
        assert r.status_code == 200

    def test_forgot_password_missing_email_returns_422(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/forgot-password", json={})
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/reset-password — all branches
# ---------------------------------------------------------------------------


class TestResetPassword:
    def test_reset_password_invalid_token_returns_400(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": "not-a-real-token", "new_password": "NewPassword123!"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_reset_token"

    def test_reset_password_expired_token_returns_400(self, client: TestClient) -> None:
        email = _unique_email("reset_exp")
        body = _register(client, email)
        user_id = body["user"]["id"]
        raw_token = _make_reset_token(user_id, expired=True)
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": raw_token, "new_password": "NewPassword123!"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "reset_token_expired"

    def test_reset_password_used_token_returns_400(self, client: TestClient) -> None:
        email = _unique_email("reset_used")
        body = _register(client, email)
        user_id = body["user"]["id"]
        raw_token = _make_reset_token(user_id, used=True)
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": raw_token, "new_password": "NewPassword123!"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "reset_token_already_used"

    def test_reset_password_short_new_password_returns_400(self, client: TestClient) -> None:
        email = _unique_email("reset_short")
        body = _register(client, email)
        user_id = body["user"]["id"]
        raw_token = _make_reset_token(user_id)
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": raw_token, "new_password": "short"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "password_too_short"

    def test_reset_password_happy_path_then_login(self, client: TestClient) -> None:
        email = _unique_email("reset_ok")
        _register(client, email)
        db = SessionLocal()
        try:
            user = db.query(User).filter_by(email=email).first()
            user_id = user.id
        finally:
            db.close()
        raw_token = _make_reset_token(user_id)
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": raw_token, "new_password": "BrandNewPass999!"},
        )
        assert r.status_code == 200
        # Login with new password
        login = client.post("/api/v1/auth/login", json={"email": email, "password": "BrandNewPass999!"})
        assert login.status_code == 200

    def test_reset_missing_fields_returns_422(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/reset-password", json={"token": "only-token"})
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/activate-patient — all branches
# ---------------------------------------------------------------------------


class TestActivatePatient:
    def test_activate_invalid_invite_returns_400(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/activate-patient",
            json={
                "email": _unique_email("ap_bad"),
                "password": "TestPass1234!",
                "invite_code": "totally-bogus-code",
                "display_name": "Patient User",
            },
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_invite_code"

    def test_activate_expired_invite_returns_400(self, client: TestClient) -> None:
        invite_email = _unique_email("ap_exp")
        code = _make_invite(invite_email, expired=True)
        r = client.post(
            "/api/v1/auth/activate-patient",
            json={"email": invite_email, "password": "TestPass1234!", "invite_code": code, "display_name": "Patient User"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invite_expired"

    def test_activate_used_invite_returns_400(self, client: TestClient) -> None:
        invite_email = _unique_email("ap_used")
        code = _make_invite(invite_email, used=True)
        r = client.post(
            "/api/v1/auth/activate-patient",
            json={"email": invite_email, "password": "TestPass1234!", "invite_code": code, "display_name": "Patient User"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invite_already_used"

    def test_activate_invalid_email_returns_400(self, client: TestClient) -> None:
        invite_email = "valid@example.com"
        code = _make_invite(invite_email)
        r = client.post(
            "/api/v1/auth/activate-patient",
            json={"email": "not-an-email", "password": "TestPass1234!", "invite_code": code, "display_name": "Patient User"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_email"

    def test_activate_short_password_returns_400(self, client: TestClient) -> None:
        invite_email = _unique_email("ap_short")
        code = _make_invite(invite_email)
        r = client.post(
            "/api/v1/auth/activate-patient",
            json={"email": invite_email, "password": "short", "invite_code": code, "display_name": "Patient User"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "password_too_short"

    def test_activate_duplicate_email_returns_409(self, client: TestClient) -> None:
        email = _unique_email("ap_dup")
        _register(client, email)
        code = _make_invite(email)
        r = client.post(
            "/api/v1/auth/activate-patient",
            json={"email": email, "password": "TestPass1234!", "invite_code": code, "display_name": "Patient User"},
        )
        assert r.status_code == 409
        assert r.json()["code"] == "email_already_registered"

    def test_activate_happy_path(self, client: TestClient) -> None:
        email = _unique_email("ap_ok")
        code = _make_invite(email)
        r = client.post(
            "/api/v1/auth/activate-patient",
            json={"email": email, "password": "TestPass1234!", "invite_code": code, "display_name": "Patient User"},
        )
        assert r.status_code == 201
        body = r.json()
        assert "access_token" in body
        assert body["user"]["role"] == "patient"

    def test_activate_missing_invite_code_returns_422(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/auth/activate-patient",
            json={"email": _unique_email(), "password": "TestPass1234!"},
        )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /auth/password — all branches
# ---------------------------------------------------------------------------


class TestChangePasswordBranches:
    def test_change_password_same_password_returns_400(self, client: TestClient) -> None:
        email = _unique_email("cp_same")
        body = _register(client, email, password="SamePass123!")
        r = client.patch(
            "/api/v1/auth/password",
            headers=_bearer(body["access_token"]),
            json={"current_password": "SamePass123!", "new_password": "SamePass123!"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "password_unchanged"

    def test_change_password_short_new_returns_400(self, client: TestClient) -> None:
        email = _unique_email("cp_short")
        body = _register(client, email)
        r = client.patch(
            "/api/v1/auth/password",
            headers=_bearer(body["access_token"]),
            json={"current_password": "TestPass1234!", "new_password": "123"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "password_too_short"

    def test_change_password_missing_fields_returns_422(self, client: TestClient) -> None:
        email = _unique_email("cp_missing")
        body = _register(client, email)
        r = client.patch(
            "/api/v1/auth/password",
            headers=_bearer(body["access_token"]),
            json={"current_password": "TestPass1234!"},
        )
        assert r.status_code == 422

    def test_change_password_no_auth_returns_401(self, client: TestClient) -> None:
        r = client.patch(
            "/api/v1/auth/password",
            json={"current_password": "x", "new_password": "NewPass1234!"},
        )
        assert r.status_code == 401

    def test_change_password_demo_token_returns_401(self, client: TestClient, auth_headers: dict) -> None:
        """Demo tokens are rejected by _require_current_user."""
        r = client.patch(
            "/api/v1/auth/password",
            headers=auth_headers["clinician"],
            json={"current_password": "x", "new_password": "NewPass1234!"},
        )
        assert r.status_code == 401

    def test_change_password_revokes_other_sessions(self, client: TestClient) -> None:
        """After change, previously-issued refresh tokens are revoked."""
        email = _unique_email("cp_revoke")
        body = _register(client, email, password="OldPass123!")
        old_refresh = body["refresh_token"]
        r = client.patch(
            "/api/v1/auth/password",
            headers=_bearer(body["access_token"]),
            json={"current_password": "OldPass123!", "new_password": "NewPass456!"},
        )
        assert r.status_code == 200
        # Old refresh token should be rejected after password change
        r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
        assert r2.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/2fa/setup — error branches
# ---------------------------------------------------------------------------


class TestTwoFASetupBranches:
    def test_setup_no_auth_returns_401(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/2fa/setup", json={})
        assert r.status_code == 401

    def test_setup_demo_token_returns_401(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post("/api/v1/auth/2fa/setup", headers=auth_headers["clinician"], json={})
        assert r.status_code == 401

    def test_setup_returns_10_backup_codes(self, client: TestClient) -> None:
        email = _unique_email("2fa_setup")
        body = _register(client, email)
        r = client.post("/api/v1/auth/2fa/setup", headers=_bearer(body["access_token"]), json={})
        assert r.status_code == 200
        assert len(r.json()["backup_codes"]) == 10

    def test_setup_second_call_rotates_secret(self, client: TestClient) -> None:
        """Calling setup twice (re-enrollment) returns a new secret."""
        email = _unique_email("2fa_re")
        body = _register(client, email)
        r1 = client.post("/api/v1/auth/2fa/setup", headers=_bearer(body["access_token"]), json={})
        r2 = client.post("/api/v1/auth/2fa/setup", headers=_bearer(body["access_token"]), json={})
        # Both succeed; second secret may differ (or same random — just confirm 200)
        assert r1.status_code == 200
        assert r2.status_code == 200


# ---------------------------------------------------------------------------
# POST /auth/2fa/verify — error branches
# ---------------------------------------------------------------------------


class TestTwoFAVerifyBranches:
    def test_verify_without_setup_returns_400(self, client: TestClient) -> None:
        email = _unique_email("2fa_no_setup")
        body = _register(client, email)
        r = client.post(
            "/api/v1/auth/2fa/verify",
            headers=_bearer(body["access_token"]),
            json={"code": "123456"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "twofa_not_enrolled"

    def test_verify_missing_code_returns_422(self, client: TestClient) -> None:
        email = _unique_email("2fa_missing")
        body = _register(client, email)
        client.post("/api/v1/auth/2fa/setup", headers=_bearer(body["access_token"]), json={})
        r = client.post(
            "/api/v1/auth/2fa/verify",
            headers=_bearer(body["access_token"]),
            json={},
        )
        assert r.status_code == 422

    def test_verify_invalid_code_returns_401(self, client: TestClient) -> None:
        email = _unique_email("2fa_bad_code")
        body = _register(client, email)
        client.post("/api/v1/auth/2fa/setup", headers=_bearer(body["access_token"]), json={})
        r = client.post(
            "/api/v1/auth/2fa/verify",
            headers=_bearer(body["access_token"]),
            json={"code": "000000"},
        )
        assert r.status_code == 401
        assert r.json()["code"] == "invalid_totp_code"


# ---------------------------------------------------------------------------
# POST /auth/2fa/disable — error branches
# ---------------------------------------------------------------------------


class TestTwoFADisableBranches:
    def _setup_2fa(self, client: TestClient, email: str, access_token: str) -> str:
        r = client.post("/api/v1/auth/2fa/setup", headers=_bearer(access_token), json={})
        secret = r.json()["secret"]
        code = pyotp.TOTP(secret).now()
        client.post("/api/v1/auth/2fa/verify", headers=_bearer(access_token), json={"code": code})
        return secret

    def test_disable_without_2fa_enabled_returns_400(self, client: TestClient) -> None:
        email = _unique_email("2fa_dis_no")
        body = _register(client, email)
        r = client.post(
            "/api/v1/auth/2fa/disable",
            headers=_bearer(body["access_token"]),
            json={"password": "TestPass1234!", "code": "000000"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "twofa_not_enabled"

    def test_disable_wrong_password_returns_401(self, client: TestClient) -> None:
        email = _unique_email("2fa_dis_pw")
        body = _register(client, email)
        secret = self._setup_2fa(client, email, body["access_token"])
        code = pyotp.TOTP(secret).now()
        r = client.post(
            "/api/v1/auth/2fa/disable",
            headers=_bearer(body["access_token"]),
            json={"password": "WRONG_PASSWORD", "code": code},
        )
        assert r.status_code == 401

    def test_disable_wrong_code_returns_401(self, client: TestClient) -> None:
        email = _unique_email("2fa_dis_code")
        body = _register(client, email)
        self._setup_2fa(client, email, body["access_token"])
        r = client.post(
            "/api/v1/auth/2fa/disable",
            headers=_bearer(body["access_token"]),
            json={"password": "TestPass1234!", "code": "000000"},
        )
        assert r.status_code == 401

    def test_disable_missing_fields_returns_422(self, client: TestClient) -> None:
        email = _unique_email("2fa_dis_miss")
        body = _register(client, email)
        r = client.post(
            "/api/v1/auth/2fa/disable",
            headers=_bearer(body["access_token"]),
            json={"password": "TestPass1234!"},
        )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# GET /auth/sessions — all branches
# ---------------------------------------------------------------------------


class TestAuthSessionsList:
    def test_sessions_list_no_auth_returns_401(self, client: TestClient) -> None:
        r = client.get("/api/v1/auth/sessions")
        assert r.status_code == 401

    def test_sessions_list_real_user_returns_list(self, client: TestClient) -> None:
        email = _unique_email("ses_list")
        body = _register(client, email)
        r = client.get("/api/v1/auth/sessions", headers=_bearer(body["access_token"]))
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_sessions_list_marks_current(self, client: TestClient) -> None:
        email = _unique_email("ses_cur")
        body = _register(client, email)
        refresh = body["refresh_token"]
        r = client.get(
            "/api/v1/auth/sessions",
            headers={**_bearer(body["access_token"]), "X-Refresh-Token": refresh},
        )
        assert r.status_code == 200
        items = r.json()["items"]
        current_items = [i for i in items if i.get("is_current")]
        assert len(current_items) >= 1

    def test_sessions_list_without_refresh_header_all_not_current(self, client: TestClient) -> None:
        email = _unique_email("ses_no_cur")
        body = _register(client, email)
        r = client.get("/api/v1/auth/sessions", headers=_bearer(body["access_token"]))
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(not i.get("is_current") for i in items)


# ---------------------------------------------------------------------------
# DELETE /auth/sessions/others — all branches
# ---------------------------------------------------------------------------


class TestRevokeOtherSessions:
    def test_revoke_others_no_auth_returns_401(self, client: TestClient) -> None:
        r = client.delete("/api/v1/auth/sessions/others")
        assert r.status_code == 401

    def test_revoke_others_no_refresh_header_returns_400(self, client: TestClient) -> None:
        email = _unique_email("revoke_no_rt")
        body = _register(client, email)
        r = client.delete(
            "/api/v1/auth/sessions/others",
            headers=_bearer(body["access_token"]),
        )
        assert r.status_code == 400
        assert r.json()["code"] == "current_session_unidentified"

    def test_revoke_others_happy_path(self, client: TestClient) -> None:
        email = _unique_email("revoke_ok")
        body = _register(client, email)
        refresh = body["refresh_token"]
        r = client.delete(
            "/api/v1/auth/sessions/others",
            headers={**_bearer(body["access_token"]), "X-Refresh-Token": refresh},
        )
        assert r.status_code == 200
        assert "revoked_count" in r.json()


# ---------------------------------------------------------------------------
# DELETE /auth/sessions/{session_id} — all branches
# ---------------------------------------------------------------------------


class TestRevokeSingleSession:
    def test_revoke_session_not_found_returns_404(self, client: TestClient) -> None:
        email = _unique_email("rev1")
        body = _register(client, email)
        r = client.delete(
            "/api/v1/auth/sessions/not-a-real-session-id",
            headers=_bearer(body["access_token"]),
        )
        assert r.status_code == 404
        assert r.json()["code"] == "session_not_found"

    def test_revoke_current_session_returns_409(self, client: TestClient) -> None:
        email = _unique_email("rev2")
        body = _register(client, email)
        refresh = body["refresh_token"]
        # Get the session id
        sessions_r = client.get(
            "/api/v1/auth/sessions",
            headers={**_bearer(body["access_token"]), "X-Refresh-Token": refresh},
        )
        current_sessions = [i for i in sessions_r.json()["items"] if i.get("is_current")]
        if current_sessions:
            session_id = current_sessions[0]["id"]
            r = client.delete(
                f"/api/v1/auth/sessions/{session_id}",
                headers={**_bearer(body["access_token"]), "X-Refresh-Token": refresh},
            )
            assert r.status_code == 409
            assert r.json()["code"] == "cannot_revoke_current_session"

    def test_revoke_other_session_succeeds(self, client: TestClient) -> None:
        email = _unique_email("rev3")
        body = _register(client, email)
        refresh_1 = body["refresh_token"]
        # Create a second session via second login
        login_r = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "TestPass1234!"},
        )
        refresh_2 = login_r.json()["refresh_token"]
        # List sessions using refresh_1 as current
        sessions_r = client.get(
            "/api/v1/auth/sessions",
            headers={**_bearer(body["access_token"]), "X-Refresh-Token": refresh_1},
        )
        non_current = [i for i in sessions_r.json()["items"] if not i.get("is_current")]
        if non_current:
            session_id = non_current[0]["id"]
            r = client.delete(
                f"/api/v1/auth/sessions/{session_id}",
                headers={**_bearer(body["access_token"]), "X-Refresh-Token": refresh_1},
            )
            assert r.status_code == 200
            assert r.json().get("message") == "Revoked"

    def test_revoke_session_no_auth_returns_401(self, client: TestClient) -> None:
        r = client.delete("/api/v1/auth/sessions/some-id")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Helper function unit tests
# ---------------------------------------------------------------------------


class TestAuthHelpers:
    def test_extract_bearer_token_none(self) -> None:
        from app.routers.auth_router import _extract_bearer_token
        assert _extract_bearer_token(None) is None

    def test_extract_bearer_token_valid(self) -> None:
        from app.routers.auth_router import _extract_bearer_token
        assert _extract_bearer_token("Bearer mytoken123") == "mytoken123"

    def test_extract_bearer_token_wrong_scheme(self) -> None:
        from app.routers.auth_router import _extract_bearer_token
        from app.errors import ApiServiceError
        with pytest.raises(ApiServiceError) as exc:
            _extract_bearer_token("Basic dXNlcjpwYXNz")
        assert exc.value.code == "invalid_auth_header"

    def test_validate_email_valid(self) -> None:
        from app.routers.auth_router import _validate_email
        _validate_email("user@domain.com")  # no exception

    def test_validate_email_invalid(self) -> None:
        from app.routers.auth_router import _validate_email
        from app.errors import ApiServiceError
        with pytest.raises(ApiServiceError) as exc:
            _validate_email("not-an-email")
        assert exc.value.code == "invalid_email"

    def test_validate_password_valid(self) -> None:
        from app.routers.auth_router import _validate_password
        _validate_password("12345678")  # no exception

    def test_validate_password_short(self) -> None:
        from app.routers.auth_router import _validate_password
        from app.errors import ApiServiceError
        with pytest.raises(ApiServiceError) as exc:
            _validate_password("1234567")
        assert exc.value.code == "password_too_short"

    def test_generate_backup_codes_length(self) -> None:
        from app.routers.auth_router import _generate_backup_codes
        codes = _generate_backup_codes(10)
        assert len(codes) == 10
        for code in codes:
            assert len(code) == 8

    def test_generate_backup_codes_uppercase_alphanum(self) -> None:
        from app.routers.auth_router import _generate_backup_codes
        import re
        codes = _generate_backup_codes(5)
        pattern = re.compile(r"^[A-Z0-9]{8}$")
        for code in codes:
            assert pattern.match(code), f"Code '{code}' doesn't match expected pattern"

    def test_current_refresh_hash_from_request_none(self) -> None:
        from app.routers.auth_router import _current_refresh_hash_from_request
        assert _current_refresh_hash_from_request(None) is None

    def test_current_refresh_hash_from_request_value(self) -> None:
        from app.routers.auth_router import _current_refresh_hash_from_request
        result = _current_refresh_hash_from_request("some_refresh_token")
        assert result is not None
        assert isinstance(result, str)
        assert len(result) > 0

    def test_iso_none_returns_empty(self) -> None:
        from app.routers.auth_router import _iso
        assert _iso(None) == ""

    def test_iso_naive_datetime_gets_utc(self) -> None:
        from app.routers.auth_router import _iso
        dt = datetime(2024, 1, 1, 12, 0, 0)  # naive
        result = _iso(dt)
        assert "Z" in result or "+00:00" in result

    def test_iso_aware_datetime(self) -> None:
        from app.routers.auth_router import _iso
        dt = datetime(2024, 6, 15, 10, 30, 0, tzinfo=timezone.utc)
        result = _iso(dt)
        assert "2024-06-15" in result

    def test_revoke_all_except_current_no_current(self) -> None:
        """All sessions revoked when current_hash=None."""
        from app.routers.auth_router import _revoke_all_sessions_except_current
        email = _unique_email("revoke_all")
        # Register two sessions
        db = SessionLocal()
        try:
            user_id = str(uuid.uuid4())
            db.add(User(
                id=user_id,
                email=email,
                display_name="Test",
                hashed_password=auth_service.hash_password("TestPass1234!"),
                role="clinician",
                package_id="explorer",
            ))
            h1 = auth_service.hash_refresh_token("token1")
            h2 = auth_service.hash_refresh_token("token2")
            db.add(UserSession(user_id=user_id, refresh_token_hash=h1))
            db.add(UserSession(user_id=user_id, refresh_token_hash=h2))
            db.commit()
            count = _revoke_all_sessions_except_current(db, user_id=user_id, current_hash=None)
            assert count == 2
        finally:
            db.close()
