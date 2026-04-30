"""Regression tests pinning cross-clinic gates on qEEG records / raw / viz.

Round 8 audit found:

* ``qeeg_records_router``: cross-clinic IDOR via clinician_id-only
  filter on read AND covert cross-clinic write on create (no
  patient-clinic check before persisting). The PATCH body also
  exposed ``raw_data_ref`` which combined with ``qeeg_raw_router``
  to form a path-traversal PHI-exfil chain
  (PATCH raw_data_ref="/etc/passwd"; GET /raw-signal => arbitrary
  file read under the API uid).
* ``qeeg_raw_router``: 8 endpoints (channel-info, raw-signal,
  cleaned-signal, ICA components/timecourse, cleaning config
  get/set, reprocess) with NO cross-clinic gate.
* ``qeeg_viz_router``: 8 endpoints (capabilities, topomap, band-grid,
  connectivity, source, animation, PDF) with NO cross-clinic gate.

Post-fix every endpoint routes through ``_load_analysis(..., actor)``
which enforces ``require_patient_owner`` (canonical helper). The
PATCH body no longer accepts ``raw_data_ref``; create-time values
are validated against an allowlist of safe schemes.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, QEEGRecord, User
from app.services.auth_service import create_access_token


@pytest.fixture
def two_clinics() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="qEEG Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="qEEG Clinic B")
        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"qeeg_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"qeeg_b_{uuid.uuid4().hex[:8]}@example.com",
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
        analysis_a = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient_a.id,
            clinician_id=clin_a.id,
            file_ref="memory://test",
            original_filename="test.edf",
            file_size_bytes=1024,
            analysis_status="completed",
        )
        db.add(analysis_a)
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
            "patient_a_id": patient_a.id,
            "analysis_a_id": analysis_a.id,
            "token_a": token_a,
            "token_b": token_b,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# qeeg_records — create gate + raw_data_ref allowlist + PATCH no longer
# accepts raw_data_ref
# ---------------------------------------------------------------------------
def test_create_qeeg_record_for_other_clinic_patient_blocked(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    """Pre-fix any clinician could POST a record against any
    patient_id (covert cross-clinic write)."""
    resp = client.post(
        "/api/v1/qeeg-records",
        headers=_auth(two_clinics["token_b"]),
        json={
            "patient_id": two_clinics["patient_a_id"],
            "recording_type": "resting",
        },
    )
    # 403 (cross_clinic_access_denied) or 404 (gated to look like
    # record-not-found for orphans) — both are acceptable refusals.
    assert resp.status_code in (403, 404), resp.text


def test_create_qeeg_record_rejects_path_traversal_raw_data_ref(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    """Raw-data ref must be validated against the scheme allowlist
    before persistence — no `/etc/passwd`, no `../`, no `file://`."""
    for hostile in ("/etc/passwd", "../../etc/passwd", "file:///etc/passwd"):
        resp = client.post(
            "/api/v1/qeeg-records",
            headers=_auth(two_clinics["token_a"]),
            json={
                "patient_id": two_clinics["patient_a_id"],
                "raw_data_ref": hostile,
            },
        )
        assert resp.status_code == 422, (hostile, resp.text)
        assert "raw_data_ref" in resp.text or resp.json().get("code") == "invalid_raw_data_ref", resp.text


def test_create_qeeg_record_accepts_allowlisted_scheme(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    resp = client.post(
        "/api/v1/qeeg-records",
        headers=_auth(two_clinics["token_a"]),
        json={
            "patient_id": two_clinics["patient_a_id"],
            "raw_data_ref": "s3://bucket/key.edf",
        },
    )
    assert resp.status_code == 201, resp.text


def test_patch_qeeg_record_drops_raw_data_ref_field(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    """PATCH body must not accept raw_data_ref (the write half of the
    path-traversal exfil chain). With Pydantic's default extra=ignore
    the field is silently dropped, leaving the record's original
    raw_data_ref untouched. We verify by trying to PATCH a hostile
    value and confirming it does NOT land on the row."""
    create = client.post(
        "/api/v1/qeeg-records",
        headers=_auth(two_clinics["token_a"]),
        json={
            "patient_id": two_clinics["patient_a_id"],
            "raw_data_ref": "s3://bucket/original.edf",
        },
    )
    assert create.status_code == 201, create.text
    record_id = create.json()["id"]

    # Attempt to PATCH raw_data_ref to a hostile value.
    patched = client.patch(
        f"/api/v1/qeeg-records/{record_id}",
        headers=_auth(two_clinics["token_a"]),
        json={"raw_data_ref": "/etc/passwd"},
    )
    # PATCH itself can succeed (200) — but the value must NOT have
    # been applied to the row.
    if patched.status_code == 200:
        assert patched.json()["raw_data_ref"] == "s3://bucket/original.edf"
    else:
        # Or the schema can refuse it outright as 422 — also fine.
        assert patched.status_code in (200, 422), patched.text


# ---------------------------------------------------------------------------
# qeeg_raw — every endpoint cross-clinic-gated via _load_analysis(actor)
# ---------------------------------------------------------------------------
def test_qeeg_raw_channel_info_cross_clinic_blocked(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/qeeg-raw/{two_clinics['analysis_a_id']}/channel-info",
        headers=_auth(two_clinics["token_b"]),
    )
    assert resp.status_code == 404, resp.text  # gated to 404 not 403


def test_qeeg_raw_signal_cross_clinic_blocked(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/qeeg-raw/{two_clinics['analysis_a_id']}/raw-signal",
        headers=_auth(two_clinics["token_b"]),
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# qeeg_viz — every endpoint cross-clinic-gated via _load_analysis(actor)
# ---------------------------------------------------------------------------
def test_qeeg_viz_capabilities_cross_clinic_blocked(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/qeeg-viz/{two_clinics['analysis_a_id']}/capabilities",
        headers=_auth(two_clinics["token_b"]),
    )
    assert resp.status_code == 404, resp.text


def test_qeeg_viz_topomap_cross_clinic_blocked(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/qeeg-viz/{two_clinics['analysis_a_id']}/topomap/alpha",
        headers=_auth(two_clinics["token_b"]),
    )
    assert resp.status_code == 404, resp.text
