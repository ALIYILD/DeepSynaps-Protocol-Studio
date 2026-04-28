"""Regression tests for sessions_router clinic-scope rewrite.

Pre-fix every read / write filtered ``ClinicalSession.clinician_id ==
actor.actor_id``:

* GET / PATCH / DELETE ``/sessions/{id}`` — a covering clinician at
  the same clinic could not read or edit a colleague's booking.
* GET ``/sessions`` (no patient filter) — covering clinicians saw an
  empty list of sessions for their teammates' patients.
* GET ``/sessions/current`` — same problem; the empty rowset 404'd.
* POST ``/sessions`` — booking on behalf of a patient owned by a
  same-clinic colleague was rejected as "Patient not found".
* Admin / supervisor — locked out of cross-clinician sessions even
  though they're cross-clinic operators by design.

Post-fix the gate routes through the canonical
``resolve_patient_clinic_id`` + ``require_patient_owner(allow_admin=True)``
helpers and the list endpoint scopes via a clinic-mate user-id IN clause.
The cross-clinic 403 is converted to a 404 on single-row reads to avoid
leaking row existence to a probing client.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, ClinicalSession, Patient, User
from app.services.auth_service import create_access_token


@pytest.fixture
def two_clinics_with_session() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Sessions Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Sessions Clinic B")
        clin_a1 = User(  # owning clinician at clinic A
            id=str(uuid.uuid4()),
            email=f"s_a1_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A1",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_a2 = User(  # covering clinician — same clinic, different user
            id=str(uuid.uuid4()),
            email=f"s_a2_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A2",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(  # clinician at clinic B
            id=str(uuid.uuid4()),
            email=f"s_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        admin = User(
            id=str(uuid.uuid4()),
            email=f"s_admin_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Admin",
            hashed_password="x",
            role="admin",
            package_id="explorer",
            clinic_id=None,
        )
        db.add_all([clinic_a, clinic_b, clin_a1, clin_a2, clin_b, admin])
        db.flush()

        patient_a = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a1.id,
            first_name="A",
            last_name="Patient",
        )
        db.add(patient_a)
        db.flush()

        sess = ClinicalSession(
            id=str(uuid.uuid4()),
            patient_id=patient_a.id,
            clinician_id=clin_a1.id,
            scheduled_at="2030-06-01T10:00:00",
            duration_minutes=60,
            status="scheduled",
            appointment_type="session",
        )
        db.add(sess)
        db.commit()

        def _tok(user: User) -> str:
            return create_access_token(
                user_id=user.id, email=user.email, role=user.role,
                package_id="explorer", clinic_id=user.clinic_id,
            )
        return {
            "patient_id": patient_a.id,
            "session_id": sess.id,
            "clin_a1_id": clin_a1.id,
            "token_a1": _tok(clin_a1),
            "token_a2": _tok(clin_a2),
            "token_b": _tok(clin_b),
            "token_admin": _tok(admin),
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# GET /sessions/{id}
# ---------------------------------------------------------------------------
def test_same_clinic_colleague_can_read_session(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    """Pre-fix the owner-only filter 404'd a covering clinician's read.
    Post-fix the clinic-scope gate admits them."""
    resp = client.get(
        f"/api/v1/sessions/{two_clinics_with_session['session_id']}",
        headers=_auth(two_clinics_with_session["token_a2"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == two_clinics_with_session["session_id"]


def test_cross_clinic_clinician_gets_404_on_session_read(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    """A clinic-B clinician must not see a clinic-A session — and the
    response must be 404, not 403, so the row id never confirms
    existence to a probing client."""
    resp = client.get(
        f"/api/v1/sessions/{two_clinics_with_session['session_id']}",
        headers=_auth(two_clinics_with_session["token_b"]),
    )
    assert resp.status_code == 404, resp.text


def test_admin_can_read_any_clinic_session(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    """Admin / platform operators are cross-clinic by design."""
    resp = client.get(
        f"/api/v1/sessions/{two_clinics_with_session['session_id']}",
        headers=_auth(two_clinics_with_session["token_admin"]),
    )
    assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# GET /sessions (list)
# ---------------------------------------------------------------------------
def test_list_visible_to_same_clinic_colleague(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/sessions",
        headers=_auth(two_clinics_with_session["token_a2"]),
    )
    assert resp.status_code == 200, resp.text
    ids = [s["id"] for s in resp.json()["items"]]
    assert two_clinics_with_session["session_id"] in ids


def test_list_hides_other_clinics_sessions(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/sessions",
        headers=_auth(two_clinics_with_session["token_b"]),
    )
    assert resp.status_code == 200, resp.text
    ids = [s["id"] for s in resp.json()["items"]]
    assert two_clinics_with_session["session_id"] not in ids


def test_list_filtered_by_other_clinics_patient_returns_empty(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    """A clinic-B clinician asking for clinic-A's patient gets [], not
    a leak of the patient's session list."""
    resp = client.get(
        f"/api/v1/sessions?patient_id={two_clinics_with_session['patient_id']}",
        headers=_auth(two_clinics_with_session["token_b"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"items": [], "total": 0}


def test_admin_list_sees_all_clinics(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/sessions",
        headers=_auth(two_clinics_with_session["token_admin"]),
    )
    assert resp.status_code == 200, resp.text
    ids = [s["id"] for s in resp.json()["items"]]
    assert two_clinics_with_session["session_id"] in ids


# ---------------------------------------------------------------------------
# DELETE /sessions/{id}
# ---------------------------------------------------------------------------
def test_same_clinic_colleague_can_delete_session(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    resp = client.delete(
        f"/api/v1/sessions/{two_clinics_with_session['session_id']}",
        headers=_auth(two_clinics_with_session["token_a2"]),
    )
    assert resp.status_code == 204, resp.text


def test_cross_clinic_clinician_cannot_delete_session(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    resp = client.delete(
        f"/api/v1/sessions/{two_clinics_with_session['session_id']}",
        headers=_auth(two_clinics_with_session["token_b"]),
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# PATCH /sessions/{id}
# ---------------------------------------------------------------------------
def test_same_clinic_colleague_can_patch_session(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    resp = client.patch(
        f"/api/v1/sessions/{two_clinics_with_session['session_id']}",
        json={"session_notes": "covered for A1 today"},
        headers=_auth(two_clinics_with_session["token_a2"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["session_notes"] == "covered for A1 today"


def test_cross_clinic_clinician_cannot_patch_session(
    client: TestClient, two_clinics_with_session: dict[str, Any]
) -> None:
    resp = client.patch(
        f"/api/v1/sessions/{two_clinics_with_session['session_id']}",
        json={"session_notes": "tampering attempt"},
        headers=_auth(two_clinics_with_session["token_b"]),
    )
    assert resp.status_code == 404, resp.text
