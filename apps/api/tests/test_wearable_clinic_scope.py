"""Regression tests for wearable_router clinic-scope rewrite.

Pre-fix two routes used the legacy owner-only model
``Patient.clinician_id == actor.actor_id``:

* ``POST /alerts/{flag_id}/dismiss`` — same-clinic colleagues
  could not dismiss each other's patient alerts; admin branch
  was unscoped (cross-clinic suppression of safety signals).
* ``GET /clinic/alerts/summary`` — covering clinicians at the
  same clinic saw zero alerts for their colleagues' patients.

Post-fix both routes route through the canonical clinic-scope
helpers:

* ``dismiss_alert`` calls ``_require_patient_access`` →
  ``resolve_patient_clinic_id`` + ``require_patient_owner``.
* ``get_clinic_alert_summary`` joins
  ``WearableAlertFlag -> Patient -> User`` and filters on
  ``actor.clinic_id`` for non-admins.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User, WearableAlertFlag
from app.services.auth_service import create_access_token


@pytest.fixture
def two_clinics_with_alert() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Wearable Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Wearable Clinic B")
        clin_a1 = User(  # owning clinician at clinic A
            id=str(uuid.uuid4()),
            email=f"w_a1_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A1",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_a2 = User(  # covering clinician — same clinic, different user
            id=str(uuid.uuid4()),
            email=f"w_a2_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A2",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(  # clinician at clinic B
            id=str(uuid.uuid4()),
            email=f"w_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        db.add_all([clinic_a, clinic_b, clin_a1, clin_a2, clin_b])
        db.flush()

        patient_a = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a1.id,  # owned by A1
            first_name="A",
            last_name="Patient",
        )
        db.add(patient_a)
        db.flush()

        flag = WearableAlertFlag(
            id=str(uuid.uuid4()),
            patient_id=patient_a.id,
            severity="urgent",
            flag_type="hrv_drop",
            detail="Sustained HRV drop > 50%",
            triggered_at=datetime.now(timezone.utc),
            dismissed=False,
        )
        db.add(flag)
        db.commit()

        token_a1 = create_access_token(
            user_id=clin_a1.id, email=clin_a1.email, role="clinician",
            package_id="explorer", clinic_id=clinic_a.id,
        )
        token_a2 = create_access_token(
            user_id=clin_a2.id, email=clin_a2.email, role="clinician",
            package_id="explorer", clinic_id=clinic_a.id,
        )
        token_b = create_access_token(
            user_id=clin_b.id, email=clin_b.email, role="clinician",
            package_id="explorer", clinic_id=clinic_b.id,
        )
        return {
            "patient_id": patient_a.id,
            "flag_id": flag.id,
            "token_a1": token_a1,
            "token_a2": token_a2,
            "token_b": token_b,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# dismiss_alert
# ---------------------------------------------------------------------------
def test_same_clinic_colleague_can_dismiss_alert(
    client: TestClient, two_clinics_with_alert: dict[str, Any]
) -> None:
    """Pre-fix the owner-only check refused covering clinicians;
    post-fix the clinic-scope gate admits them."""
    resp = client.post(
        f"/api/v1/wearables/alerts/{two_clinics_with_alert['flag_id']}/dismiss",
        headers=_auth(two_clinics_with_alert["token_a2"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json().get("ok") is True


def test_cross_clinic_clinician_cannot_dismiss_alert(
    client: TestClient, two_clinics_with_alert: dict[str, Any]
) -> None:
    """A clinic-B clinician cannot dismiss a clinic-A flag."""
    resp = client.post(
        f"/api/v1/wearables/alerts/{two_clinics_with_alert['flag_id']}/dismiss",
        headers=_auth(two_clinics_with_alert["token_b"]),
    )
    assert resp.status_code in (403, 404), resp.text


# ---------------------------------------------------------------------------
# get_clinic_alert_summary
# ---------------------------------------------------------------------------
def test_clinic_summary_visible_to_same_clinic_colleague(
    client: TestClient, two_clinics_with_alert: dict[str, Any]
) -> None:
    """Pre-fix a covering clinician saw zero alerts for their
    teammate's patients. Post-fix the clinic-scoped join surfaces
    them."""
    resp = client.get(
        "/api/v1/wearables/clinic/alerts/summary",
        headers=_auth(two_clinics_with_alert["token_a2"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_active"] >= 1
    assert two_clinics_with_alert["patient_id"] in body["patient_ids_with_alerts"]


def test_clinic_summary_hides_other_clinics_alerts(
    client: TestClient, two_clinics_with_alert: dict[str, Any]
) -> None:
    """Clinic-B clinician must NOT see clinic-A's flags."""
    resp = client.get(
        "/api/v1/wearables/clinic/alerts/summary",
        headers=_auth(two_clinics_with_alert["token_b"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert two_clinics_with_alert["patient_id"] not in body["patient_ids_with_alerts"]
