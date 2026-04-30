"""Regression tests for the recordings_router clinic-scope rewrite.

Pre-fix every per-id load and the list endpoint used the legacy
owner-only filter ``SessionRecording.owner_clinician_id ==
actor.actor_id``. That refused legitimate same-clinic colleagues
and never consulted ``User.clinic_id`` (so admin / supervisor had
no separate branch — they were treated identically to a random
clinician of another clinic).

Post-fix every load goes through
``_scope_recordings_query_to_clinic`` (joins
``SessionRecording -> User`` on ``owner_clinician_id`` and filters
on ``actor.clinic_id`` for non-admins) and create-time
``patient_id`` is gated by ``_assert_recording_patient_access``
(canonical ``resolve_patient_clinic_id`` + ``require_patient_owner``).
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, SessionRecording, User
from app.services.auth_service import create_access_token


@pytest.fixture
def two_clinics_with_recording() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Rec Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Rec Clinic B")
        clin_a1 = User(  # owner clinician at clinic A
            id=str(uuid.uuid4()),
            email=f"rec_a1_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A1",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_a2 = User(  # covering colleague at clinic A
            id=str(uuid.uuid4()),
            email=f"rec_a2_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A2",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(  # clinician at clinic B
            id=str(uuid.uuid4()),
            email=f"rec_b_{uuid.uuid4().hex[:8]}@example.com",
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
            clinician_id=clin_a1.id,
            first_name="A",
            last_name="Patient",
        )
        db.add(patient_a)
        db.flush()

        rec = SessionRecording(
            id=str(uuid.uuid4()),
            owner_clinician_id=clin_a1.id,
            patient_id=patient_a.id,
            title="Telehealth visit",
            file_path=f"recordings/{clin_a1.id}/{uuid.uuid4()}",
            mime_type="audio/webm",
            byte_size=1024,
            duration_seconds=60,
            uploaded_at=datetime.now(timezone.utc),
        )
        db.add(rec)
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
            "rec_id": rec.id,
            "token_a1": token_a1,
            "token_a2": token_a2,
            "token_b": token_b,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Same-clinic visibility — was refused pre-fix
# ---------------------------------------------------------------------------
def test_same_clinic_colleague_sees_recording_in_list(
    client: TestClient, two_clinics_with_recording: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/recordings",
        headers=_auth(two_clinics_with_recording["token_a2"]),
    )
    assert resp.status_code == 200, resp.text
    ids = [r["id"] for r in resp.json()["items"]]
    assert two_clinics_with_recording["rec_id"] in ids


# ---------------------------------------------------------------------------
# Cross-clinic refusal
# ---------------------------------------------------------------------------
def test_cross_clinic_clinician_does_not_see_recording_in_list(
    client: TestClient, two_clinics_with_recording: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/recordings",
        headers=_auth(two_clinics_with_recording["token_b"]),
    )
    assert resp.status_code == 200, resp.text
    ids = [r["id"] for r in resp.json()["items"]]
    assert two_clinics_with_recording["rec_id"] not in ids


def test_cross_clinic_clinician_cannot_stream_recording(
    client: TestClient, two_clinics_with_recording: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/recordings/{two_clinics_with_recording['rec_id']}/file",
        headers=_auth(two_clinics_with_recording["token_b"]),
    )
    assert resp.status_code == 404, resp.text


def test_cross_clinic_clinician_cannot_delete_recording(
    client: TestClient, two_clinics_with_recording: dict[str, Any]
) -> None:
    resp = client.delete(
        f"/api/v1/recordings/{two_clinics_with_recording['rec_id']}",
        headers=_auth(two_clinics_with_recording["token_b"]),
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Cross-clinic create — patient_id refused
# ---------------------------------------------------------------------------
def test_create_recording_for_other_clinic_patient_blocked(
    client: TestClient, two_clinics_with_recording: dict[str, Any]
) -> None:
    """A clinic-B clinician must not be able to upload a recording
    tagged with a clinic-A patient_id (covert write into the other
    clinic's PHI)."""
    payload = b"\x1a\x45\xdf\xa3" + b"\x00" * 64  # real WebM EBML
    resp = client.post(
        "/api/v1/recordings",
        headers=_auth(two_clinics_with_recording["token_b"]),
        files={"file": ("evil.webm", io.BytesIO(payload), "audio/webm")},
        data={
            "title": "evil",
            "patient_id": two_clinics_with_recording["patient_id"],
        },
    )
    assert resp.status_code == 404, resp.text
