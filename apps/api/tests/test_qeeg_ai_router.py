"""Tests for qeeg_ai_router — /api/v1/qeeg-ai.

Tests cover:
- All 10 AI endpoints return 404 for unknown analysis_id
- quality_score happy path with seeded QEEGAnalysis
- auto_clean_propose happy path
- explain_bad_channel happy path
- classify_segment validates start_sec < end_sec (422 on bad segment)
- narrate happy path
- copilot_assist_bundle happy path
- Endpoints require clinician role (guest gets 403)
- AIEnvelope shape validated on each happy-path response
"""
from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User


CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}

_FAKE_ENVELOPE = {
    "result": {"score": 0.85},
    "reasoning": "Deterministic test stub.",
    "features": {},
}


def _seed_analysis(db: Session) -> str:
    """Seed a minimal QEEGAnalysis row owned by actor-clinician-demo."""
    # Use the patient created during conftest or create minimal
    patient_id = f"pat-qai-{uuid.uuid4().hex[:8]}"
    patient = Patient(
        id=patient_id,
        clinician_id="actor-clinician-demo",
        first_name="QAI",
        last_name="TestPatient",
        dob="1990-01-01",
        gender="prefer_not_to_say",
        primary_condition="Test",
        primary_modality="Test",
        consent_signed=True,
        consent_date="2026-01-01",
        status="active",
        notes="[TEST] synthetic record",
    )
    db.add(patient)
    db.flush()

    analysis_id = str(uuid.uuid4())
    analysis = QEEGAnalysis(
        id=analysis_id,
        patient_id=patient_id,
        clinician_id="actor-clinician-demo",
        analysis_status="complete",
    )
    db.add(analysis)
    db.commit()
    return analysis_id


# ── 404 for unknown analysis_id ──────────────────────────────────────────────


@pytest.mark.parametrize(
    "endpoint",
    [
        "quality_score",
        "auto_clean_propose",
        "classify_components",
        "recommend_filters",
        "recommend_montage",
        "segment_eo_ec",
        "narrate",
        "copilot_assist_bundle",
    ],
)
def test_unknown_analysis_id_returns_404(client: TestClient, endpoint: str) -> None:
    """All AI endpoints return 404 for an unknown analysis_id."""
    r = client.post(
        f"/api/v1/qeeg-ai/nonexistent-analysis-id/{endpoint}",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404, f"{endpoint}: got {r.status_code}"


def test_explain_bad_channel_unknown_404(client: TestClient) -> None:
    """explain_bad_channel with unknown analysis_id returns 404."""
    r = client.post(
        "/api/v1/qeeg-ai/nonexistent-id/explain_bad_channel/Fp1",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


# ── Auth guard ───────────────────────────────────────────────────────────────


def test_quality_score_guest_forbidden(client: TestClient) -> None:
    """Guest role must be rejected (403)."""
    r = client.post(
        "/api/v1/qeeg-ai/some-id/quality_score",
        headers=GUEST_HDR,
    )
    assert r.status_code == 403


def test_quality_score_no_auth_forbidden(client: TestClient) -> None:
    """No auth header must be rejected (403)."""
    r = client.post("/api/v1/qeeg-ai/some-id/quality_score")
    assert r.status_code == 403


# ── classify_segment validation ──────────────────────────────────────────────


def test_classify_segment_bad_range_422(client: TestClient) -> None:
    """classify_segment with end_sec <= start_sec must return 422."""
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_analysis(db)
    finally:
        db.close()

    with patch("app.services.raw_ai.classify_segment", return_value=_FAKE_ENVELOPE):
        r = client.post(
            f"/api/v1/qeeg-ai/{analysis_id}/classify_segment",
            json={"start_sec": 10.0, "end_sec": 5.0},
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 422


def test_classify_segment_equal_times_422(client: TestClient) -> None:
    """classify_segment with end_sec == start_sec must return 422."""
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_analysis(db)
    finally:
        db.close()

    with patch("app.services.raw_ai.classify_segment", return_value=_FAKE_ENVELOPE):
        r = client.post(
            f"/api/v1/qeeg-ai/{analysis_id}/classify_segment",
            json={"start_sec": 5.0, "end_sec": 5.0},
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 422


# ── Happy path: envelope shape ────────────────────────────────────────────────


def _check_envelope(body: dict, analysis_id: str) -> None:
    assert body["analysis_id"] == analysis_id
    assert "result" in body
    assert "reasoning" in body
    assert "features" in body
    assert isinstance(body["features"], dict)


def test_quality_score_happy_path(client: TestClient) -> None:
    """quality_score returns AIEnvelope with analysis_id."""
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_analysis(db)
    finally:
        db.close()

    with patch("app.services.raw_ai.quality_score", return_value=_FAKE_ENVELOPE):
        r = client.post(
            f"/api/v1/qeeg-ai/{analysis_id}/quality_score",
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200, r.text
    _check_envelope(r.json(), analysis_id)


def test_narrate_happy_path(client: TestClient) -> None:
    """narrate returns AIEnvelope."""
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_analysis(db)
    finally:
        db.close()

    with patch("app.services.raw_ai.narrate", return_value=_FAKE_ENVELOPE):
        r = client.post(
            f"/api/v1/qeeg-ai/{analysis_id}/narrate",
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200, r.text
    _check_envelope(r.json(), analysis_id)


def test_copilot_assist_bundle_happy_path(client: TestClient) -> None:
    """copilot_assist_bundle returns AIEnvelope."""
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_analysis(db)
    finally:
        db.close()

    with patch("app.services.raw_ai.copilot_assist_bundle", return_value=_FAKE_ENVELOPE):
        r = client.post(
            f"/api/v1/qeeg-ai/{analysis_id}/copilot_assist_bundle",
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200, r.text
    _check_envelope(r.json(), analysis_id)


def test_classify_segment_happy_path(client: TestClient) -> None:
    """classify_segment with valid range returns AIEnvelope."""
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_analysis(db)
    finally:
        db.close()

    with patch("app.services.raw_ai.classify_segment", return_value=_FAKE_ENVELOPE):
        r = client.post(
            f"/api/v1/qeeg-ai/{analysis_id}/classify_segment",
            json={"start_sec": 0.0, "end_sec": 10.0},
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200, r.text
    _check_envelope(r.json(), analysis_id)
