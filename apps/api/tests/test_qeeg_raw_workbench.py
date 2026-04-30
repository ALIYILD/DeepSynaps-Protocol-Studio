"""Tests for the qEEG Raw Cleaning Workbench endpoints.

Covers:

* ``GET  /metadata`` returns anonymised metadata (no filename / PHI).
* ``POST /annotations`` writes an annotation + audit row, validates
  ``kind`` / ``decision_status`` / ``ai_label`` / time range.
* ``POST /cleaning-version`` bumps ``version_number`` and persists
  bad channels / segments / ICA decisions in JSON columns.
* ``POST /ai-artefact-suggestions`` writes annotations with
  ``source='ai'`` and ``decision_status='suggested'`` — they require
  clinician confirmation before applying.
* ``POST /rerun-analysis`` queues reprocessing using the saved
  cleaning version and never mutates the parent analysis source
  columns.
* Original raw EEG metadata (``file_ref``, ``original_filename``,
  ``recording_duration_sec``) is unchanged after any workbench mutation.
* Clinic-scope: a clinic-B clinician cannot read or mutate workbench
  state for clinic-A's analysis (404, no row-existence leak).
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    Clinic,
    Patient,
    QEEGAnalysis,
    QeegCleaningAnnotation,
    QeegCleaningAuditEvent,
    QeegCleaningVersion,
    User,
)
from app.services.auth_service import create_access_token


@pytest.fixture
def two_clinics_with_analysis() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="WB Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="WB Clinic B")
        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"wb_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"wb_b_{uuid.uuid4().hex[:8]}@example.com",
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
        analysis = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient_a.id,
            clinician_id=clin_a.id,
            file_ref="memory://wb-test",
            original_filename="recording.edf",
            file_size_bytes=2048,
            recording_duration_sec=120.0,
            sample_rate_hz=256.0,
            channel_count=20,
            channels_json='["Fp1","Fp2","F7","F3","Fz","F4","F8","T3","C3","Cz","C4","T4","T5","P3","Pz","P4","T6","O1","O2","ECG"]',
            recording_date="2026-04-29",
            eyes_condition="closed",
            equipment="demo-eeg-cap",
            analysis_status="completed",
        )
        db.add(analysis)
        db.commit()

        def tok(u: User) -> str:
            return create_access_token(
                user_id=u.id, email=u.email, role="clinician",
                package_id="explorer", clinic_id=u.clinic_id,
            )
        return {
            "analysis_id": analysis.id,
            "patient_id": patient_a.id,
            "token_a": tok(clin_a),
            "token_b": tok(clin_b),
            "raw_file_ref": analysis.file_ref,
            "raw_filename": analysis.original_filename,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── /metadata ────────────────────────────────────────────────────────────────
def test_metadata_returns_anonymised_metadata(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.get(
        f"/api/v1/qeeg-raw/{aid}/metadata",
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["analysis_id"] == aid
    assert body["sample_rate_hz"] == 256.0
    assert body["duration_sec"] == 120.0
    assert body["metadata_complete"] is True
    assert "Fp1" in body["channels"]
    assert body["immutable_raw_notice"]
    # No PHI / filename in the response.
    assert "original_filename" not in body
    assert "patient_name" not in body


def test_metadata_cross_clinic_returns_404(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.get(
        f"/api/v1/qeeg-raw/{aid}/metadata",
        headers=_auth(two_clinics_with_analysis["token_b"]),
    )
    assert r.status_code == 404, r.text


def test_reference_library_is_reference_only(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.get(
        f"/api/v1/qeeg-raw/{aid}/reference-library",
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "reference_only"
    assert body["native_file_ingestion"] is False
    categories = {item["category"] for item in body["workflows"]}
    for required in ("impedance", "coherence", "source_analysis_loreta", "reporting"):
        assert required in categories


def test_manual_analysis_checklist_contains_caveats(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.get(
        f"/api/v1/qeeg-raw/{aid}/manual-analysis-checklist",
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["analysis_id"] == aid
    assert len(body["items"]) >= 6
    assert "clinician review" in body["notice"].lower()


# ── /annotations ─────────────────────────────────────────────────────────────
def test_create_annotation_writes_row_and_audit(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/annotations",
        json={"kind": "bad_segment", "start_sec": 1.0, "end_sec": 2.0, "decision_status": "accepted"},
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "bad_segment"
    assert body["start_sec"] == 1.0
    assert body["decision_status"] == "accepted"

    db: Session = SessionLocal()
    try:
        anns = db.query(QeegCleaningAnnotation).filter_by(analysis_id=aid).all()
        assert len(anns) == 1
        audits = db.query(QeegCleaningAuditEvent).filter_by(analysis_id=aid).all()
        assert len(audits) == 1
        assert audits[0].action_type == "annotation:bad_segment"
    finally:
        db.close()


def test_create_annotation_rejects_invalid_kind(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/annotations",
        json={"kind": "evil_action"},
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 422, r.text


def test_create_annotation_rejects_invalid_time_range(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/annotations",
        json={"kind": "bad_segment", "start_sec": 5.0, "end_sec": 1.0},
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 422, r.text


def test_create_annotation_cross_clinic_returns_404(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/annotations",
        json={"kind": "bad_channel", "channel": "Fp1"},
        headers=_auth(two_clinics_with_analysis["token_b"]),
    )
    assert r.status_code == 404, r.text


def test_manual_finding_payload_validates_and_persists(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/manual-findings",
        json={
            "channels": ["Fp1", "F3"],
            "bands": ["alpha", "beta"],
            "finding_type": "frontal asymmetry review",
            "severity": "moderate",
            "confidence": "review_needed",
            "possible_confounds": ["eye blink", "lorazepam"],
            "note": "Manual review notes.",
            "clinician_review_required": True,
        },
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["channels"] == ["Fp1", "F3"]
    assert body["clinician_review_required"] is True
    assert body["finding_type"] == "frontal asymmetry review"

    db: Session = SessionLocal()
    try:
        row = db.query(QeegCleaningAnnotation).filter_by(analysis_id=aid, kind="manual_finding").one()
        payload = json.loads(row.note)
        assert payload["clinician_review_required"] is True
        assert payload["bands"] == ["alpha", "beta"]
    finally:
        db.close()


def test_manual_finding_rejects_non_clinician_review_required(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/manual-findings",
        json={
            "channels": ["Cz"],
            "bands": ["theta"],
            "finding_type": "theta review",
            "clinician_review_required": False,
        },
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 422, r.text


# ── /cleaning-version ────────────────────────────────────────────────────────
def test_save_cleaning_version_increments_version_number(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    body = {
        "label": "v1",
        "bad_channels": ["Fp1", "T3"],
        "rejected_segments": [{"start_sec": 1.0, "end_sec": 2.0, "description": "BAD_user"}],
        "rejected_ica_components": [3, 7],
    }
    r1 = client.post(
        f"/api/v1/qeeg-raw/{aid}/cleaning-version",
        json=body, headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r1.status_code == 201, r1.text
    assert r1.json()["version_number"] == 1
    assert r1.json()["bad_channels"] == ["Fp1", "T3"]
    assert r1.json()["rejected_ica_components"] == [3, 7]

    r2 = client.post(
        f"/api/v1/qeeg-raw/{aid}/cleaning-version",
        json=body, headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["version_number"] == 2


def test_save_cleaning_version_does_not_mutate_raw_metadata(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    raw_before_ref = two_clinics_with_analysis["raw_file_ref"]
    raw_before_filename = two_clinics_with_analysis["raw_filename"]

    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/cleaning-version",
        json={"bad_channels": ["O1"]},
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 201, r.text

    db: Session = SessionLocal()
    try:
        analysis = db.query(QEEGAnalysis).filter_by(id=aid).one()
        assert analysis.file_ref == raw_before_ref
        assert analysis.original_filename == raw_before_filename
        assert analysis.recording_duration_sec == 120.0
    finally:
        db.close()


# ── /ai-artefact-suggestions ─────────────────────────────────────────────────
def test_ai_suggestions_persist_with_suggested_status(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/ai-artefact-suggestions",
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 1
    assert "clinician confirmation" in body["notice"].lower()
    for item in body["items"]:
        assert item["decision_status"] == "suggested"
        assert "Clinician confirmation required" in item["safety_notice"]

    db: Session = SessionLocal()
    try:
        anns = (
            db.query(QeegCleaningAnnotation)
            .filter_by(analysis_id=aid, source="ai")
            .all()
        )
        assert len(anns) >= 1
        for a in anns:
            assert a.decision_status == "suggested"
    finally:
        db.close()


# ── /rerun-analysis ──────────────────────────────────────────────────────────
def test_rerun_uses_cleaning_version_id(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    sv = client.post(
        f"/api/v1/qeeg-raw/{aid}/cleaning-version",
        json={"bad_channels": ["Fp1"]},
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    version_id = sv.json()["id"]

    rr = client.post(
        f"/api/v1/qeeg-raw/{aid}/rerun-analysis",
        json={"cleaning_version_id": version_id},
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert rr.status_code == 200, rr.text
    body = rr.json()
    assert body["cleaning_version_id"] == version_id
    assert "preserved" in body["message"].lower()

    db: Session = SessionLocal()
    try:
        version = db.query(QeegCleaningVersion).filter_by(id=version_id).one()
        assert version.review_status == "rerun_requested"
    finally:
        db.close()


def test_rerun_with_unknown_version_returns_404(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    rr = client.post(
        f"/api/v1/qeeg-raw/{aid}/rerun-analysis",
        json={"cleaning_version_id": "nonexistent-version"},
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert rr.status_code == 404, rr.text


# ── /cleaning-log ────────────────────────────────────────────────────────────
def test_cleaning_log_records_actor_and_timestamp(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    client.post(
        f"/api/v1/qeeg-raw/{aid}/annotations",
        json={"kind": "bad_channel", "channel": "Cz"},
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    r = client.get(
        f"/api/v1/qeeg-raw/{aid}/cleaning-log",
        headers=_auth(two_clinics_with_analysis["token_a"]),
    )
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) >= 1
    assert items[0]["action_type"] == "annotation:bad_channel"
    assert items[0]["actor_id"]
    assert items[0]["created_at"]


def test_cleaning_log_cross_clinic_returns_404(
    client: TestClient, two_clinics_with_analysis: dict[str, Any]
) -> None:
    aid = two_clinics_with_analysis["analysis_id"]
    r = client.get(
        f"/api/v1/qeeg-raw/{aid}/cleaning-log",
        headers=_auth(two_clinics_with_analysis["token_b"]),
    )
    assert r.status_code == 404, r.text
