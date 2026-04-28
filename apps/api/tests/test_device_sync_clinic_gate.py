"""Regression tests for the device_sync_router cross-clinic gates.

Pre-fix:

* ``POST /api/v1/device-sync/{connection_id}/trigger`` had NO
  ownership check. Any authenticated clinician/technician could
  force a sync (token refresh + WearableObservation insert)
  against any clinic's connection_id — a covert write into another
  clinic's PHI.
* ``GET /{connection_id}/dashboard``, ``/history``,
  ``/timeseries`` used a permissive ``if _clinic_id:
  require_patient_owner(...)`` pattern that silently passed when
  the patient row was orphaned (clinic_id=None) — a clinician
  with no clinic_id on their User row could read any connection.

Post-fix every per-connection route routes through
``_gate_connection_access`` which:

* Returns 404 if the connection doesn't exist.
* Returns 404 if the patient row is missing or orphaned (and the
  actor is not admin) — no implicit-everyone access.
* Calls ``require_patient_owner`` which raises 403
  ``cross_clinic_access_denied`` on clinic mismatch.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, DeviceConnection, Patient, User
from app.services.auth_service import create_access_token


@pytest.fixture
def two_clinics_with_connection() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="DS Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="DS Clinic B")
        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"ds_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"ds_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        db.add_all([clinic_a, clinic_b, clin_a, clin_b])
        db.flush()

        patient_a = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a.id,
            first_name="A",
            last_name="Patient",
        )
        db.add(patient_a)
        db.flush()

        conn = DeviceConnection(
            id=str(uuid.uuid4()),
            patient_id=patient_a.id,
            source="oura",
            source_type="oauth",
            display_name="Oura Ring",
            status="connected",
            consent_given=True,
        )
        db.add(conn)
        db.commit()

        token_a = create_access_token(
            user_id=clin_a.id, email=clin_a.email, role="clinician",
            package_id="explorer", clinic_id=clinic_a.id,
        )
        token_b = create_access_token(
            user_id=clin_b.id, email=clin_b.email, role="clinician",
            package_id="explorer", clinic_id=clinic_b.id,
        )
        return {
            "connection_id": conn.id,
            "patient_a_id": patient_a.id,
            "token_a": token_a,
            "token_b": token_b,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# trigger_sync — was completely ungated
# ---------------------------------------------------------------------------
def test_trigger_sync_cross_clinic_blocked(
    client: TestClient, two_clinics_with_connection: dict[str, Any]
) -> None:
    """Pre-fix any clinician could POST /trigger against any
    connection_id and force a token refresh + observation
    insert."""
    resp = client.post(
        f"/api/v1/device-sync/{two_clinics_with_connection['connection_id']}/trigger",
        headers=_auth(two_clinics_with_connection["token_b"]),
    )
    assert resp.status_code in (403, 404), resp.text


# ---------------------------------------------------------------------------
# Per-connection reads — were skip-on-orphan
# ---------------------------------------------------------------------------
def test_dashboard_cross_clinic_blocked(
    client: TestClient, two_clinics_with_connection: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/device-sync/{two_clinics_with_connection['connection_id']}/dashboard",
        headers=_auth(two_clinics_with_connection["token_b"]),
    )
    assert resp.status_code in (403, 404), resp.text


def test_history_cross_clinic_blocked(
    client: TestClient, two_clinics_with_connection: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/device-sync/{two_clinics_with_connection['connection_id']}/history",
        headers=_auth(two_clinics_with_connection["token_b"]),
    )
    assert resp.status_code in (403, 404), resp.text


def test_timeseries_cross_clinic_blocked(
    client: TestClient, two_clinics_with_connection: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/device-sync/{two_clinics_with_connection['connection_id']}/timeseries"
        "?metric=heart_rate",
        headers=_auth(two_clinics_with_connection["token_b"]),
    )
    assert resp.status_code in (403, 404), resp.text


# ---------------------------------------------------------------------------
# Sanity: own clinic still passes the gate. /history has a simple
# non-demo code path that doesn't trip pre-existing demo-data-generator
# bugs unrelated to the cross-clinic fix.
# ---------------------------------------------------------------------------
def test_history_own_clinic_passes_gate(
    client: TestClient, two_clinics_with_connection: dict[str, Any]
) -> None:
    """The legitimate clinic-owner clinician must not be blocked by
    the new gate."""
    resp = client.get(
        f"/api/v1/device-sync/{two_clinics_with_connection['connection_id']}/history",
        headers=_auth(two_clinics_with_connection["token_a"]),
    )
    assert resp.status_code == 200, resp.text
