"""Happy-path + auth + edge-case tests for preferences_router.

Pins the following routes:
  GET   /api/v1/preferences
  PATCH /api/v1/preferences
  GET   /api/v1/preferences/clinical-defaults
  PATCH /api/v1/preferences/clinical-defaults  (admin only)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ── helpers ───────────────────────────────────────────────────────────────────

def _register(client: TestClient, email: str, role: str = "clinician") -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Prefs Router Test", "password": "testpass1234", "role": role},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


# ── GET /api/v1/preferences ───────────────────────────────────────────────────

def test_get_preferences_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/preferences")
    assert resp.status_code in (401, 403)


def test_get_preferences_creates_defaults_on_first_call(client: TestClient) -> None:
    # Must use a real JWT token (not demo token) — preferences router uses current_user dep
    token = _register(client, "prefs-rt-first-call@example.com")
    resp = client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["language"] == "en"
    assert data["date_format"] in ("ISO", "US", "EU")
    assert data["units"] in ("metric", "imperial")
    assert "notification_prefs" in data
    assert "aeAlerts" in data["notification_prefs"]


def test_get_preferences_idempotent(client: TestClient) -> None:
    """Second GET must return the same defaults without creating duplicates."""
    token = _register(client, "prefs-rt-idem-call@example.com")
    r1 = client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})
    r2 = client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["user_id"] == r2.json()["user_id"]


# ── PATCH /api/v1/preferences ────────────────────────────────────────────────

def test_patch_preferences_language(client: TestClient) -> None:
    token = _register(client, "prefs-rt-lang@example.com")
    # Seed default row
    client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})
    resp = client.patch(
        "/api/v1/preferences",
        json={"language": "tr"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["language"] == "tr"


def test_patch_preferences_invalid_language_400(client: TestClient) -> None:
    token = _register(client, "prefs-rt-badlang@example.com")
    client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})
    resp = client.patch(
        "/api/v1/preferences",
        json={"language": "klingon"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_patch_preferences_invalid_units_400(client: TestClient) -> None:
    token = _register(client, "prefs-rt-badunits@example.com")
    client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})
    resp = client.patch(
        "/api/v1/preferences",
        json={"units": "galactic"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_patch_preferences_date_format(client: TestClient) -> None:
    token = _register(client, "prefs-rt-dateformat@example.com")
    client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})
    resp = client.patch(
        "/api/v1/preferences",
        json={"date_format": "US"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["date_format"] == "US"


def test_patch_preferences_invalid_auto_logout_400(client: TestClient) -> None:
    token = _register(client, "prefs-rt-badlogout@example.com")
    client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})
    resp = client.patch(
        "/api/v1/preferences",
        json={"auto_logout_min": 999},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_patch_preferences_requires_auth(client: TestClient) -> None:
    resp = client.patch("/api/v1/preferences", json={"language": "en"})
    assert resp.status_code in (401, 403)


# ── GET /api/v1/preferences/clinical-defaults ────────────────────────────────

def test_get_clinical_defaults_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/preferences/clinical-defaults")
    assert resp.status_code in (401, 403)


def test_get_clinical_defaults_returns_shape(client: TestClient) -> None:
    # Must use a real JWT (not a demo token) because the dep is `current_user`
    token = _register(client, "prefs-rt-clin-shape@example.com")
    resp = client.get("/api/v1/preferences/clinical-defaults", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "default_session_duration_min" in data
    assert "default_followup_weeks" in data
    assert "ae_protocol" in data
    assert isinstance(data["default_assessments"], list)


def test_get_clinical_defaults_no_clinic_returns_synthetic(client: TestClient) -> None:
    """Users without a clinic get a synthetic default payload (not 404)."""
    token = _register(client, "prefs-rt-noclinic@example.com")
    resp = client.get("/api/v1/preferences/clinical-defaults", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    # clinic_id is None for users without a clinic
    assert data["clinic_id"] is None


# ── PATCH /api/v1/preferences/clinical-defaults ──────────────────────────────

def _make_clinic_admin_token(email: str) -> str:
    """Create an admin user with a clinic_id directly in the DB and return a JWT."""
    from app.database import SessionLocal
    from app.persistence.models import Clinic, User
    from app.services import auth_service as _auth

    db = SessionLocal()
    try:
        slug = email.split("@")[0].replace(".", "-")
        clinic_id = f"clinic-test-{slug}"
        user_id = f"user-admin-{slug}"
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="Test Clinic"))
            db.flush()
        if db.query(User).filter_by(id=user_id).first() is None:
            db.add(User(
                id=user_id,
                email=email,
                display_name="Clinic Admin Test",
                hashed_password="x",
                role="admin",
                package_id="enterprise",
                clinic_id=clinic_id,
            ))
        db.commit()
    finally:
        db.close()

    return _auth.create_access_token(
        user_id=user_id,
        email=email,
        role="admin",
        package_id="enterprise",
        clinic_id=clinic_id,
    )


def test_patch_clinical_defaults_requires_admin(client: TestClient) -> None:
    """Non-admin roles must not be able to PATCH clinical defaults.

    Users registered via the API have no clinic_id → 404 ("no clinic").
    Admin users from another clinic get 403 ("not admin"). Both are acceptable
    non-200 responses that confirm the endpoint is protected.
    """
    token = _register(client, "prefs-rt-clin-patch@example.com")
    resp = client.patch(
        "/api/v1/preferences/clinical-defaults",
        json={"ae_protocol": "log-only"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code in (401, 403, 404)


def test_patch_clinical_defaults_admin_happy_path(client: TestClient) -> None:
    """Admin in a clinic can PATCH clinical defaults."""
    token = _make_clinic_admin_token("prefs-rt-admin-patch@example.com")
    resp = client.patch(
        "/api/v1/preferences/clinical-defaults",
        json={"ae_protocol": "log-only", "default_followup_weeks": 6},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ae_protocol"] == "log-only"
    assert data["default_followup_weeks"] == 6


def test_patch_clinical_defaults_invalid_ae_protocol_400(client: TestClient) -> None:
    token = _make_clinic_admin_token("prefs-rt-admin-bad-ae@example.com")
    resp = client.patch(
        "/api/v1/preferences/clinical-defaults",
        json={"ae_protocol": "do-nothing"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_patch_clinical_defaults_duration_out_of_range_400(client: TestClient) -> None:
    token = _make_clinic_admin_token("prefs-rt-admin-bad-dur@example.com")
    resp = client.patch(
        "/api/v1/preferences/clinical-defaults",
        json={"default_session_duration_min": 9999},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
