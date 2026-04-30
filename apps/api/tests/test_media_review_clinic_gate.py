"""Regression tests for the media review-pipeline cross-clinic gate.

Pre-fix the review pipeline (`/api/v1/media/review-queue`,
`/api/v1/media/review/{upload_id}/action`,
`/api/v1/media/review/{upload_id}/analyze`,
`/api/v1/media/analysis/{upload_id}` GET/POST/PATCH,
`/api/v1/media/red-flags/{flag_id}/dismiss`) was a mass cross-clinic
IDOR cluster:

* The list endpoint returned every upload in
  ``pending_review`` / ``reupload_requested`` across every clinic. A
  clinician at clinic A could see (and via the per-id review-action
  routes, action) uploads from clinic B.
* The per-upload routes loaded ``PatientMediaUpload`` by id alone with
  only an actor-role check — no patient-clinic-ownership gate.
* ``dismiss_red_flag`` loaded ``MediaRedFlag`` by id with no
  patient-clinic check, so a clinic-A clinician could suppress safety
  flags on a clinic-B patient (HIPAA-relevant abuse path).

Post-fix:

* ``_scope_uploads_query_to_clinic`` joins ``Patient`` -> ``User`` and
  filters on ``actor.clinic_id`` (admin / supervisor unscoped).
* ``_check_patient_clinic_access`` runs ``resolve_patient_clinic_id``
  + ``require_patient_owner`` and converts cross-clinic 403 to 404 to
  avoid leaking row existence.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    Clinic,
    MediaRedFlag,
    Patient,
    PatientMediaUpload,
    User,
)
from app.services.auth_service import create_access_token


@pytest.fixture
def two_clinics_with_upload() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Media Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Media Clinic B")
        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"media_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"media_b_{uuid.uuid4().hex[:8]}@example.com",
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

        upload_a = PatientMediaUpload(
            id=str(uuid.uuid4()),
            patient_id=patient_a.id,
            uploaded_by=patient_a.id,
            media_type="voice",
            file_ref=f"{patient_a.id}/test.webm",
            file_size_bytes=1024,
            status="pending_review",
            consent_id=str(uuid.uuid4()),
        )
        db.add(upload_a)

        flag_a = MediaRedFlag(
            id=str(uuid.uuid4()),
            upload_id=upload_a.id,
            patient_id=patient_a.id,
            flag_type="safety_concern",
            extracted_text="urgent",
            severity="high",
            ai_generated=False,
        )
        db.add(flag_a)
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
            "clinic_a_id": clinic_a.id,
            "clinic_b_id": clinic_b.id,
            "patient_a_id": patient_a.id,
            "upload_a_id": upload_a.id,
            "flag_a_id": flag_a.id,
            "token_a": token_a,
            "token_b": token_b,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# review-queue list — clinic scoped
# ---------------------------------------------------------------------------
def test_review_queue_does_not_leak_other_clinics_uploads(
    client: TestClient, two_clinics_with_upload: dict[str, Any]
) -> None:
    """Pre-fix the queue listed every upload in ``pending_review``
    across every clinic. Clinic B's clinician must not see clinic A's
    upload."""
    resp = client.get(
        "/api/v1/media/review-queue",
        headers=_auth(two_clinics_with_upload["token_b"]),
    )
    assert resp.status_code == 200, resp.text
    upload_ids = [u.get("id") for u in resp.json()]
    assert two_clinics_with_upload["upload_a_id"] not in upload_ids


def test_review_queue_lists_own_clinic_uploads(
    client: TestClient, two_clinics_with_upload: dict[str, Any]
) -> None:
    """The clinic owner clinician still sees their own queue."""
    resp = client.get(
        "/api/v1/media/review-queue",
        headers=_auth(two_clinics_with_upload["token_a"]),
    )
    assert resp.status_code == 200, resp.text
    upload_ids = [u.get("id") for u in resp.json()]
    assert two_clinics_with_upload["upload_a_id"] in upload_ids


# ---------------------------------------------------------------------------
# per-upload review-action / analyze gates
# ---------------------------------------------------------------------------
def test_review_action_cross_clinic_blocked(
    client: TestClient, two_clinics_with_upload: dict[str, Any]
) -> None:
    """Pre-fix any clinician/reviewer could action any upload by id.
    Cross-clinic 403 is converted to 404 so existence isn't leaked."""
    resp = client.post(
        f"/api/v1/media/review/{two_clinics_with_upload['upload_a_id']}/action",
        headers=_auth(two_clinics_with_upload["token_b"]),
        json={"action": "approve"},
    )
    assert resp.status_code == 404, resp.text


def test_analyze_upload_cross_clinic_blocked(
    client: TestClient, two_clinics_with_upload: dict[str, Any]
) -> None:
    resp = client.post(
        f"/api/v1/media/review/{two_clinics_with_upload['upload_a_id']}/analyze",
        headers=_auth(two_clinics_with_upload["token_b"]),
    )
    # 404 (clinic gate) trumps 400 (state gate). Critically NOT 200.
    assert resp.status_code in (400, 404), resp.text
    if resp.status_code == 400:
        # The state gate ran first only if the patient clinic resolved
        # to actor.clinic — pin that this never leaks the upload's
        # state to a cross-clinic actor.
        assert False, "Cross-clinic actor must not reach state-gate path"


def test_get_analysis_cross_clinic_blocked(
    client: TestClient, two_clinics_with_upload: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/media/analysis/{two_clinics_with_upload['upload_a_id']}",
        headers=_auth(two_clinics_with_upload["token_b"]),
    )
    assert resp.status_code == 404, resp.text


def test_approve_analysis_cross_clinic_blocked(
    client: TestClient, two_clinics_with_upload: dict[str, Any]
) -> None:
    resp = client.post(
        f"/api/v1/media/analysis/{two_clinics_with_upload['upload_a_id']}/approve",
        headers=_auth(two_clinics_with_upload["token_b"]),
        json={"chart_note_draft": "hostile"},
    )
    assert resp.status_code == 404, resp.text


def test_amend_analysis_cross_clinic_blocked(
    client: TestClient, two_clinics_with_upload: dict[str, Any]
) -> None:
    resp = client.patch(
        f"/api/v1/media/analysis/{two_clinics_with_upload['upload_a_id']}/amend",
        headers=_auth(two_clinics_with_upload["token_b"]),
        json={"clinician_amendments": "hostile"},
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# red-flag dismiss — clinic-scoped
# ---------------------------------------------------------------------------
def test_dismiss_red_flag_cross_clinic_blocked(
    client: TestClient, two_clinics_with_upload: dict[str, Any]
) -> None:
    """A clinic-A red flag cannot be silenced by a clinic-B clinician.
    Pre-fix this was a covert HIPAA-relevant abuse path: hide safety
    signals across clinics."""
    resp = client.post(
        f"/api/v1/media/red-flags/{two_clinics_with_upload['flag_a_id']}/dismiss",
        headers=_auth(two_clinics_with_upload["token_b"]),
    )
    assert resp.status_code == 404, resp.text
