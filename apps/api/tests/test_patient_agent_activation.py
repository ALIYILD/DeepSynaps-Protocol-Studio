"""Tests for patient agent activation flow (Phase 7 → Phase 8 DB-backed).

Covers
======

* :mod:`patient_agent_activation` service layer:
  - ``is_activated`` returns False when the env flag is unset.
  - ``is_activated`` returns True only when env flag is set AND the pair
    is activated.
  - ``activate`` rejects non-patient agent IDs.
  - ``activate`` rejects attestations under 32 chars.
  - ``activate`` is idempotent on repeated activations of the same pair.
  - ``deactivate`` flips ``deactivated_at`` (soft-delete) and the partial
    unique index lets a re-activate insert a *new* row.
  - The partial unique index prevents two concurrently-active rows for
    the same (clinic, agent).
  - ``list_activations`` excludes soft-deleted rows.
* HTTP endpoints under ``/api/v1/agent-admin/patient-activations``:
  - super-admin can activate, list, deactivate.
  - clinic-bound admin → 403 on writes.
  - any authenticated actor can hit the ``check`` endpoint.
  - end-to-end: super-admin POST → row exists, DELETE → row gone.
"""
from __future__ import annotations

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import SessionLocal
from app.main import app
from app.persistence.models import PatientAgentActivation
from app.services import patient_agent_activation


_VALID_ATTESTATION = (
    "I attest the clinical PM signed off on the safety prompt for clinic Demo."
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db():
    """Provide a real SQLAlchemy session bound to the per-test SQLite DB.

    The conftest's ``isolated_database`` fixture resets the DB between
    tests, so each call to this fixture starts from a clean activation
    table. We yield-then-close so the session is released cleanly even
    if the test raises.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _scrub_env(monkeypatch):
    monkeypatch.delenv("DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED", raising=False)
    yield


@pytest.fixture
def env_flag_on(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED", "1")
    yield


@pytest.fixture
def super_admin_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-super-admin",
        display_name="Super Admin",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id=None,
    )


@pytest.fixture
def super_admin_client(super_admin_actor: AuthenticatedActor):
    app.dependency_overrides[get_authenticated_actor] = lambda: super_admin_actor
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_authenticated_actor, None)


# ---------------------------------------------------------------------------
# Service-layer tests
# ---------------------------------------------------------------------------


def test_is_activated_false_when_env_unset_even_if_row_present(db):
    """Even with an active row in the table, env-flag-off means False."""
    patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION,
        attested_by="actor-x",
    )
    # Env flag NOT set
    assert patient_agent_activation.is_activated(
        db=db, clinic_id="clinic-a", agent_id="patient.care_companion"
    ) is False


def test_is_activated_true_only_when_env_and_row(db, env_flag_on):
    # Pair not activated yet → False
    assert patient_agent_activation.is_activated(
        db=db, clinic_id="clinic-a", agent_id="patient.care_companion"
    ) is False

    patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION,
        attested_by="actor-x",
    )
    assert patient_agent_activation.is_activated(
        db=db, clinic_id="clinic-a", agent_id="patient.care_companion"
    ) is True

    # Different agent in same clinic → still False
    assert patient_agent_activation.is_activated(
        db=db, clinic_id="clinic-a", agent_id="patient.adherence"
    ) is False


def test_activate_rejects_non_patient_agent_id(db):
    result = patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="clinic.reception",
        attestation=_VALID_ATTESTATION,
        attested_by="actor-x",
    )
    assert result["ok"] is False
    assert result["error"] == "agent_id_not_patient_facing"
    assert result["activation"] is None


def test_activate_rejects_short_attestation(db):
    result = patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation="too short",
        attested_by="actor-x",
    )
    assert result["ok"] is False
    assert result["error"] == "attestation_too_short"


def test_activate_idempotent_on_same_pair(db):
    """Activating the same pair twice updates record without erroring.

    Phase 8 keeps the Phase 7 contract: re-attestation of an active pair
    amends the live row in place. Only one active row should remain.
    """
    r1 = patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION,
        attested_by="actor-x",
    )
    r2 = patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION + " (re-attested)",
        attested_by="actor-y",
    )
    assert r1["ok"] is True
    assert r2["ok"] is True
    rows = patient_agent_activation.list_activations(db=db)
    assert len(rows) == 1
    assert rows[0]["attested_by"] == "actor-y"
    assert "(re-attested)" in rows[0]["attestation"]


def test_deactivate_idempotent_on_unknown_pair(db):
    r = patient_agent_activation.deactivate(
        db=db, clinic_id="clinic-a", agent_id="patient.care_companion"
    )
    assert r == {"ok": True, "removed": False}


def test_deactivate_soft_deletes_existing_pair(db, env_flag_on):
    """``deactivate`` flips ``deactivated_at`` and ``is_activated`` → False."""
    patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION,
        attested_by="actor-x",
    )
    assert patient_agent_activation.is_activated(
        db=db, clinic_id="clinic-a", agent_id="patient.care_companion"
    ) is True
    r = patient_agent_activation.deactivate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        deactivated_by="actor-z",
    )
    assert r == {"ok": True, "removed": True}
    assert patient_agent_activation.is_activated(
        db=db, clinic_id="clinic-a", agent_id="patient.care_companion"
    ) is False

    # The row itself is preserved as audit evidence — we only soft-deleted it.
    all_rows = db.query(PatientAgentActivation).all()
    assert len(all_rows) == 1
    assert all_rows[0].deactivated_at is not None
    assert all_rows[0].deactivated_by == "actor-z"


def test_reactivate_after_deactivate_creates_new_row(db, env_flag_on):
    """Re-activating after a soft-delete creates a fresh row.

    The Phase 8 contract: soft-deleted rows stay in the table forever
    (audit). If ops re-attests the same pair, they get a brand new row;
    the partial unique index does not block this because it scopes
    uniqueness to ``deactivated_at IS NULL``.
    """
    # 1. Activate, then deactivate.
    patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION,
        attested_by="actor-x",
    )
    patient_agent_activation.deactivate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        deactivated_by="actor-z",
    )

    # 2. Reactivate — should create a new row, not amend the old one.
    patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION + " (round 2)",
        attested_by="actor-x2",
    )

    all_rows = (
        db.query(PatientAgentActivation)
        .filter(PatientAgentActivation.clinic_id == "clinic-a")
        .filter(PatientAgentActivation.agent_id == "patient.care_companion")
        .order_by(PatientAgentActivation.attested_at.asc())
        .all()
    )
    # Two physical rows: one soft-deleted, one active.
    assert len(all_rows) == 2
    soft_deleted = [r for r in all_rows if r.deactivated_at is not None]
    active = [r for r in all_rows if r.deactivated_at is None]
    assert len(soft_deleted) == 1
    assert len(active) == 1
    assert "(round 2)" in active[0].attestation
    assert active[0].attested_by == "actor-x2"

    # And the live read sees only the active row.
    assert patient_agent_activation.is_activated(
        db=db, clinic_id="clinic-a", agent_id="patient.care_companion"
    ) is True
    listed = patient_agent_activation.list_activations(db=db)
    assert len(listed) == 1
    assert "(round 2)" in listed[0]["attestation"]


def test_partial_unique_index_blocks_two_active_rows(db):
    """Two simultaneously-active rows for the same pair are rejected.

    We bypass the service layer (which is idempotent on existing active
    rows) and try to insert a duplicate row directly — the partial
    unique index ``uq_active_pair`` should reject it on commit.
    """
    patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION,
        attested_by="actor-x",
    )

    duplicate = PatientAgentActivation(
        id="dup-row-id",
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION + " (dup)",
        attested_by="actor-y",
    )
    db.add(duplicate)
    with pytest.raises(sa.exc.IntegrityError):
        db.commit()
    db.rollback()


def test_list_activations_excludes_deactivated_rows(db):
    """Soft-deleted rows must not appear in :func:`list_activations`."""
    # Two active pairs.
    patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
        attestation=_VALID_ATTESTATION,
        attested_by="actor-x",
    )
    patient_agent_activation.activate(
        db=db,
        clinic_id="clinic-b",
        agent_id="patient.adherence",
        attestation=_VALID_ATTESTATION,
        attested_by="actor-x",
    )

    rows = patient_agent_activation.list_activations(db=db)
    assert len(rows) == 2

    # Soft-delete one — only the other remains in the listing.
    patient_agent_activation.deactivate(
        db=db,
        clinic_id="clinic-a",
        agent_id="patient.care_companion",
    )
    rows_after = patient_agent_activation.list_activations(db=db)
    assert len(rows_after) == 1
    assert rows_after[0]["clinic_id"] == "clinic-b"

    # But the soft-deleted row is still in the underlying table.
    assert db.query(PatientAgentActivation).count() == 2


# ---------------------------------------------------------------------------
# HTTP endpoint tests
# ---------------------------------------------------------------------------


def test_create_activation_super_admin_ok(super_admin_client: TestClient):
    resp = super_admin_client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-a",
            "agent_id": "patient.care_companion",
            "attestation": _VALID_ATTESTATION,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["clinic_id"] == "clinic-a"
    assert body["agent_id"] == "patient.care_companion"
    assert body["attested_by"] == "actor-super-admin"
    assert body["attested_at"]


def test_create_activation_clinic_admin_403(
    client: TestClient, auth_headers: dict
):
    """Demo admin token = clinic-bound admin → 403 ops_admin_required."""
    resp = client.post(
        "/api/v1/agent-admin/patient-activations",
        headers=auth_headers["admin"],
        json={
            "clinic_id": "clinic-a",
            "agent_id": "patient.care_companion",
            "attestation": _VALID_ATTESTATION,
        },
    )
    assert resp.status_code == 403, resp.text
    assert "ops_admin_required" in resp.text


def test_create_activation_clinician_403(
    client: TestClient, auth_headers: dict
):
    resp = client.post(
        "/api/v1/agent-admin/patient-activations",
        headers=auth_headers["clinician"],
        json={
            "clinic_id": "clinic-a",
            "agent_id": "patient.care_companion",
            "attestation": _VALID_ATTESTATION,
        },
    )
    assert resp.status_code == 403


def test_create_activation_rejects_non_patient_agent(
    super_admin_client: TestClient,
):
    resp = super_admin_client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-a",
            "agent_id": "clinic.reception",
            "attestation": _VALID_ATTESTATION,
        },
    )
    assert resp.status_code == 422
    assert "agent_id_not_patient_facing" in resp.text


def test_create_activation_rejects_short_attestation(
    super_admin_client: TestClient,
):
    resp = super_admin_client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-a",
            "agent_id": "patient.care_companion",
            "attestation": "too short",
        },
    )
    assert resp.status_code == 422
    assert "attestation_too_short" in resp.text


def test_list_activations_super_admin(super_admin_client: TestClient):
    super_admin_client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-a",
            "agent_id": "patient.care_companion",
            "attestation": _VALID_ATTESTATION,
        },
    )
    resp = super_admin_client.get("/api/v1/agent-admin/patient-activations")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "activations" in body
    assert "env_flag_enabled" in body
    assert body["env_flag_enabled"] is False  # Env not set in test by default
    assert len(body["activations"]) == 1
    assert body["activations"][0]["clinic_id"] == "clinic-a"
    assert body["activations"][0]["agent_id"] == "patient.care_companion"


def test_list_activations_clinician_403(
    client: TestClient, auth_headers: dict
):
    resp = client.get(
        "/api/v1/agent-admin/patient-activations",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403


def test_delete_activation_super_admin(super_admin_client: TestClient):
    super_admin_client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-a",
            "agent_id": "patient.care_companion",
            "attestation": _VALID_ATTESTATION,
        },
    )
    resp = super_admin_client.delete(
        "/api/v1/agent-admin/patient-activations/clinic-a/patient.care_companion"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"ok": True, "removed": True}

    # Idempotent — second delete is a no-op.
    resp2 = super_admin_client.delete(
        "/api/v1/agent-admin/patient-activations/clinic-a/patient.care_companion"
    )
    assert resp2.status_code == 200
    assert resp2.json() == {"ok": True, "removed": False}


def test_delete_activation_clinician_403(
    client: TestClient, auth_headers: dict
):
    resp = client.delete(
        "/api/v1/agent-admin/patient-activations/clinic-a/patient.care_companion",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403


def test_check_endpoint_any_authenticated_actor(
    client: TestClient, auth_headers: dict
):
    """The check endpoint is open to any authenticated identity (incl. patient)."""
    for role in ("clinician", "admin", "patient"):
        resp = client.get(
            "/api/v1/agent-admin/patient-activations/check"
            "?clinic_id=clinic-a&agent_id=patient.care_companion",
            headers=auth_headers[role],
        )
        assert resp.status_code == 200, (role, resp.text)
        body = resp.json()
        assert body["activated"] is False
        assert body["env_flag_enabled"] is False


def test_check_endpoint_returns_true_only_with_env_and_activation(
    super_admin_client: TestClient,
    monkeypatch,
):
    """End-to-end: super-admin activates, then env flag flips → check is True."""
    # 1. Activate via the super-admin client.
    super_admin_client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-a",
            "agent_id": "patient.care_companion",
            "attestation": _VALID_ATTESTATION,
        },
    )

    # 2. Without env flag, check still returns activated=False.
    resp_off = super_admin_client.get(
        "/api/v1/agent-admin/patient-activations/check"
        "?clinic_id=clinic-a&agent_id=patient.care_companion"
    )
    assert resp_off.status_code == 200
    assert resp_off.json() == {"activated": False, "env_flag_enabled": False}

    # 3. Flip the env flag → activated=True.
    monkeypatch.setenv("DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED", "1")
    resp_on = super_admin_client.get(
        "/api/v1/agent-admin/patient-activations/check"
        "?clinic_id=clinic-a&agent_id=patient.care_companion"
    )
    assert resp_on.status_code == 200
    assert resp_on.json() == {"activated": True, "env_flag_enabled": True}


def test_http_post_then_get_then_delete_then_get(
    super_admin_client: TestClient,
):
    """Full HTTP integration round-trip: activation persists, deletion is visible."""
    # POST creates.
    post_resp = super_admin_client.post(
        "/api/v1/agent-admin/patient-activations",
        json={
            "clinic_id": "clinic-x",
            "agent_id": "patient.adherence",
            "attestation": _VALID_ATTESTATION,
        },
    )
    assert post_resp.status_code == 200, post_resp.text

    # GET shows it.
    get_resp = super_admin_client.get("/api/v1/agent-admin/patient-activations")
    assert get_resp.status_code == 200
    listed = get_resp.json()["activations"]
    assert any(
        a["clinic_id"] == "clinic-x" and a["agent_id"] == "patient.adherence"
        for a in listed
    )

    # DELETE soft-deletes.
    del_resp = super_admin_client.delete(
        "/api/v1/agent-admin/patient-activations/clinic-x/patient.adherence"
    )
    assert del_resp.status_code == 200

    # GET no longer shows it.
    get_resp_after = super_admin_client.get(
        "/api/v1/agent-admin/patient-activations"
    )
    assert get_resp_after.status_code == 200
    listed_after = get_resp_after.json()["activations"]
    assert not any(
        a["clinic_id"] == "clinic-x" and a["agent_id"] == "patient.adherence"
        for a in listed_after
    )
