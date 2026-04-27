from fastapi.testclient import TestClient
from app.settings import get_settings

from app.settings import get_settings


def test_case_summary_requires_clinician_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/uploads/case-summary",
        headers=auth_headers["guest"],
        json={
            "uploads": [
                {
                    "type": "Intake Form",
                    "file_name": "structured-intake.pdf",
                    "summary": "Motor symptom intake summary.",
                }
            ]
        },
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "insufficient_role"


def test_demo_login_is_disabled_in_production(
    client: TestClient,
    monkeypatch,
) -> None:
    settings = get_settings().model_copy(update={"app_env": "production"})
    monkeypatch.setattr("app.routers.auth_router.get_settings", lambda: settings)

    response = client.post(
        "/api/v1/auth/demo-login",
        json={"token": "clinician-demo-token"},
    )

    # In production/staging the endpoint must not reveal it exists.
    assert response.status_code == 404
    payload = response.json()
    assert payload.get("detail") == "Not Found"


def test_review_actions_are_persisted_to_audit_trail(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    create_response = client.post(
        "/api/v1/review-actions",
        headers=auth_headers["clinician"],
        json={
            "target_id": "proto-parkinsons-tps",
            "target_type": "protocol",
            "action": "reviewed",
            "note": "Clinician review completed for deterministic draft.",
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()["event"]
    assert created["role"] == "clinician"

    audit_response = client.get(
        "/api/v1/audit-trail",
        headers=auth_headers["admin"],
    )

    assert audit_response.status_code == 200
    payload = audit_response.json()
    assert payload["total"] >= 3
    assert payload["items"][0]["target_id"] == "proto-parkinsons-tps"
    assert payload["items"][0]["note"] == "Clinician review completed for deterministic draft."


def test_audit_trail_requires_admin_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.get("/api/v1/audit-trail", headers=auth_headers["clinician"])

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "insufficient_role"


# ── Refresh-token rotation regression ─────────────────────────────────────────
# Pre-fix, refresh tokens were stateless JWTs with no server-side blacklist.
# logout / password-reset stamped revoked_at on UserSession but the /refresh
# endpoint never consulted it, and _touch_user_session silently created a new
# row when the presented hash had no match — effectively reviving any
# harvested refresh token. These tests pin the rotation gate.


def _register_test_user(client: TestClient, email: str = "rotation@example.com") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Strong-Password-123!",
            "display_name": "Rotation Test",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_refresh_after_logout_returns_401(client: TestClient) -> None:
    body = _register_test_user(client, email="rot_logout@example.com")
    refresh = body["refresh_token"]

    # Log out — should stamp revoked_at on the matching UserSession row.
    out_resp = client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
    assert out_resp.status_code == 200, out_resp.text

    # The same refresh token must now 401 — pre-fix this returned a fresh
    # access/refresh pair via the silent-create fallback.
    refresh_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert refresh_resp.status_code == 401, refresh_resp.text
    assert refresh_resp.json()["code"] == "invalid_refresh_token"


def test_refresh_with_unknown_session_returns_401(client: TestClient) -> None:
    """A JWT minted via auth_service but never persisted as a UserSession row
    must NOT be accepted — pre-fix, _touch_user_session would create a
    session row on the fly, accepting any well-formed refresh JWT."""
    from app.services import auth_service
    from app.database import SessionLocal
    from app.persistence.models import User
    import uuid

    user_id = str(uuid.uuid4())
    db = SessionLocal()
    try:
        db.add(User(
            id=user_id,
            email=f"orphan_{uuid.uuid4().hex[:6]}@example.com",
            display_name="Orphan",
            hashed_password=auth_service.hash_password("Strong-Password-123!"),
            role="clinician",
            package_id="explorer",
        ))
        db.commit()
    finally:
        db.close()

    # Mint a refresh JWT directly — no UserSession row is ever created.
    orphan_refresh = auth_service.create_refresh_token(user_id=user_id)

    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": orphan_refresh})
    assert resp.status_code == 401, resp.text
    assert resp.json()["code"] == "invalid_refresh_token"


def test_password_reset_revokes_all_refresh_tokens(client: TestClient) -> None:
    """After /reset-password, every outstanding refresh token for the user
    must 401 — pre-fix the password changed but old tokens remained
    valid for their full TTL."""
    from app.database import SessionLocal
    from app.persistence.models import PasswordResetToken
    from app.services import auth_service

    body = _register_test_user(client, email="rot_reset@example.com")
    refresh = body["refresh_token"]
    user_id = body["user"]["id"]

    # Issue a password reset token — bypass /forgot-password to get the raw
    # value (route only logs it). Use the same hash function the route uses.
    raw_token, token_hash = auth_service.generate_password_reset_token()
    from datetime import datetime, timezone, timedelta
    db = SessionLocal()
    try:
        db.add(PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        db.commit()
    finally:
        db.close()

    reset_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "Brand-New-Password-456!"},
    )
    assert reset_resp.status_code == 200, reset_resp.text

    # Old refresh token must now be rejected.
    refresh_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert refresh_resp.status_code == 401, refresh_resp.text
