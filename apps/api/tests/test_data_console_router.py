"""Tests for the clinic-wide aggregate + bulk CSV slice of the Data Console
router (PR feat/data-console-clinic-aggregate).

Covers the two new endpoints added in Slice A:

* ``GET  /api/v1/data-console/clinic/summary``           (aggregate counts)
* ``GET  /api/v1/data-console/clinic/{cid}/tables/{t}/export.csv``  (bulk CSV)

The role string ``clinic_admin`` is not part of the existing
``DEMO_ACTOR_TOKENS`` registry, so these tests inject the actor via
``app.dependency_overrides[get_authenticated_actor] = …`` — the same
pattern used by ``test_chat_router_deep.py`` for the technician/reviewer
gate. The User row backing the actor is seeded directly into the test DB
so ``require_clinic_access`` finds a real clinic membership.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import SessionLocal
from app.main import app
from app.persistence.models import Clinic, User


# ── Fixture helpers ──────────────────────────────────────────────────────────


def _seed_user(*, user_id: str, role: str, clinic_id: str | None) -> None:
    """Idempotently seed a User + Clinic into the per-test DB.

    The conftest's ``isolated_database`` fixture truncates between tests,
    so we re-seed here. ``clinic_id`` may be None for cross-clinic admin.
    """
    db = SessionLocal()
    try:
        if clinic_id and db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name=f"Test Clinic {clinic_id[:8]}"))
            db.flush()
        if db.query(User).filter_by(id=user_id).first() is None:
            db.add(
                User(
                    id=user_id,
                    email=f"{user_id}@test.example",
                    display_name=f"Test {role}",
                    hashed_password="x",
                    role=role,
                    package_id="enterprise",
                    clinic_id=clinic_id,
                )
            )
        db.commit()
    finally:
        db.close()


def _override_actor(actor: AuthenticatedActor):
    """Install a dependency override returning ``actor`` for this test."""

    def _dep(authorization=None):
        return actor

    app.dependency_overrides[get_authenticated_actor] = _dep


def _clear_actor_override() -> None:
    app.dependency_overrides.pop(get_authenticated_actor, None)


@pytest.fixture
def clinic_id() -> str:
    return "clinic-test-aggregate"


@pytest.fixture
def other_clinic_id() -> str:
    return "clinic-other-tenant"


@pytest.fixture
def clinician_actor(clinic_id) -> AuthenticatedActor:
    user_id = "u-test-clinician"
    _seed_user(user_id=user_id, role="clinician", clinic_id=clinic_id)
    return AuthenticatedActor(
        actor_id=user_id,
        display_name="Test Clinician",
        role="clinician",
        clinic_id=clinic_id,
    )


@pytest.fixture
def clinic_admin_actor(clinic_id) -> AuthenticatedActor:
    user_id = "u-test-clinic-admin"
    _seed_user(user_id=user_id, role="admin", clinic_id=clinic_id)
    # NB: the actor carries role='clinic_admin' (what the router gate
    # accepts) even though the User row has role='admin' — clinic_admin
    # isn't a registered UserRole literal yet; this matches the App.js
    # forward-compatible role string.
    return AuthenticatedActor(
        actor_id=user_id,
        display_name="Test Clinic Owner",
        role="clinic_admin",
        clinic_id=clinic_id,
    )


@pytest.fixture
def admin_actor() -> AuthenticatedActor:
    user_id = "u-test-superadmin"
    # platform_admin user can access any clinic — see can_access_clinic.
    _seed_user(user_id=user_id, role="platform_admin", clinic_id=None)
    return AuthenticatedActor(
        actor_id=user_id,
        display_name="Test Super Admin",
        role="admin",
        clinic_id=None,
    )


# ── /clinic/summary tests ────────────────────────────────────────────────────


def test_clinician_role_blocked_on_clinic_summary(client: TestClient, clinician_actor, clinic_id):
    """Plain clinician must NOT see clinic-wide aggregates."""
    _override_actor(clinician_actor)
    try:
        r = client.get(f"/api/v1/data-console/clinic/summary?clinic_id={clinic_id}")
    finally:
        _clear_actor_override()
    assert r.status_code == 403, r.text


def test_clinic_admin_default_to_own_clinic(client: TestClient, clinic_admin_actor, clinic_id):
    """clinic_admin with no ?clinic_id should default to their own clinic."""
    _override_actor(clinic_admin_actor)
    try:
        r = client.get("/api/v1/data-console/clinic/summary")
    finally:
        _clear_actor_override()
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["clinic_id"] == clinic_id
    assert "table_summaries" in body
    assert body["read_only"] is True
    # Every SAFE_TABLES key is present with an int count.
    from app.services.data_console_service import SAFE_TABLES
    for tname in SAFE_TABLES.keys():
        assert tname in body["table_summaries"]
        assert isinstance(body["table_summaries"][tname], int)


def test_clinic_admin_cross_clinic_blocked(client: TestClient, clinic_admin_actor, other_clinic_id):
    """clinic_admin must not be able to query another clinic via query param."""
    _override_actor(clinic_admin_actor)
    try:
        r = client.get(
            f"/api/v1/data-console/clinic/summary?clinic_id={other_clinic_id}"
        )
    finally:
        _clear_actor_override()
    assert r.status_code == 403, r.text


def test_admin_with_clinic_id_query_param_succeeds(
    client: TestClient, admin_actor, clinic_id
):
    """DeepSynaps superadmin must pass ?clinic_id and gets 200."""
    # Seed a clinic for the admin to query — admin bypasses ownership but the
    # join still needs a Clinic row to exist.
    _seed_user(user_id="u-tmp-owner", role="admin", clinic_id=clinic_id)
    _override_actor(admin_actor)
    try:
        r = client.get(f"/api/v1/data-console/clinic/summary?clinic_id={clinic_id}")
    finally:
        _clear_actor_override()
    assert r.status_code == 200, r.text
    assert r.json()["clinic_id"] == clinic_id


def test_admin_without_clinic_id_returns_422(client: TestClient, admin_actor):
    """admin must EXPLICITLY supply clinic_id on the summary endpoint."""
    _override_actor(admin_actor)
    try:
        r = client.get("/api/v1/data-console/clinic/summary")
    finally:
        _clear_actor_override()
    assert r.status_code == 422, r.text


# ── /clinic/{cid}/tables/{table}/export.csv tests ────────────────────────────


def test_clinician_role_blocked_on_csv_export(
    client: TestClient, clinician_actor, clinic_id
):
    """Plain clinician must NOT export clinic CSVs."""
    _override_actor(clinician_actor)
    try:
        r = client.get(
            f"/api/v1/data-console/clinic/{clinic_id}/tables/patients/export.csv"
        )
    finally:
        _clear_actor_override()
    assert r.status_code == 403, r.text


def test_csv_export_rejects_non_allowlisted_table(
    client: TestClient, clinic_admin_actor, clinic_id
):
    """A table name not in SAFE_TABLES must 403 even for the clinic owner."""
    _override_actor(clinic_admin_actor)
    try:
        r = client.get(
            f"/api/v1/data-console/clinic/{clinic_id}/tables/users/export.csv"
        )
    finally:
        _clear_actor_override()
    assert r.status_code == 403, r.text


def test_csv_export_returns_text_csv_attachment(
    client: TestClient, clinic_admin_actor, clinic_id
):
    """Successful export must be text/csv with an attachment disposition."""
    _override_actor(clinic_admin_actor)
    try:
        r = client.get(
            f"/api/v1/data-console/clinic/{clinic_id}/tables/patients/export.csv"
        )
    finally:
        _clear_actor_override()
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv"), r.headers
    assert "attachment" in r.headers.get("content-disposition", "")
    assert f"{clinic_id}_patients_" in r.headers["content-disposition"]
    # Header row present even for an empty clinic — no 404 leak.
    body_text = r.text
    assert body_text.splitlines()[0].split(",")[0] in {"id", '"id"'}


def test_csv_export_cross_clinic_blocked_for_clinic_admin(
    client: TestClient, clinic_admin_actor, other_clinic_id
):
    """clinic_admin must not be able to export another clinic's data."""
    _override_actor(clinic_admin_actor)
    try:
        r = client.get(
            f"/api/v1/data-console/clinic/{other_clinic_id}/tables/patients/export.csv"
        )
    finally:
        _clear_actor_override()
    assert r.status_code == 403, r.text


# ── Audit trail verification ─────────────────────────────────────────────────


def _count_audit_events(action: str, target_id: str) -> int:
    """Count rows in audit_events matching (action, target_id)."""
    from app.persistence.models import AuditEventRecord
    db = SessionLocal()
    try:
        return (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.action == action,
                AuditEventRecord.target_id == target_id,
            )
            .count()
        )
    finally:
        db.close()


def test_audit_row_appended_on_clinic_summary(
    client: TestClient, clinic_admin_actor, clinic_id
):
    """A successful /clinic/summary call must leave an audit_events row."""
    before = _count_audit_events("clinic_data_console_summary", clinic_id)
    _override_actor(clinic_admin_actor)
    try:
        r = client.get("/api/v1/data-console/clinic/summary")
    finally:
        _clear_actor_override()
    assert r.status_code == 200
    after = _count_audit_events("clinic_data_console_summary", clinic_id)
    assert after == before + 1, (before, after)


def test_audit_row_appended_on_csv_export(
    client: TestClient, clinic_admin_actor, clinic_id
):
    """A successful CSV export must leave an audit row BEFORE streaming."""
    before = _count_audit_events("clinic_data_console_export", clinic_id)
    _override_actor(clinic_admin_actor)
    try:
        r = client.get(
            f"/api/v1/data-console/clinic/{clinic_id}/tables/patients/export.csv"
        )
    finally:
        _clear_actor_override()
    assert r.status_code == 200
    after = _count_audit_events("clinic_data_console_export", clinic_id)
    assert after == before + 1, (before, after)
