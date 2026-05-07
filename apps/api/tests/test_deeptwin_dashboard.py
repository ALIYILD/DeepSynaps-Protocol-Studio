"""Tests for the DeepTwin 360 Dashboard endpoint.

Coverage matrix (per the brief):

1. Valid patient returns dashboard payload
2. Invalid patient returns 404
3. Cross-clinic access blocked
4. Payload includes all 22 domains
5. Missing domains are not faked (status in {missing, unavailable})
6. Safety flags included when present
7. prediction_confidence fails closed until a validated model exists
8. Audit event written (deeptwin.dashboard.opened)
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    AdverseEvent,
    AssessmentRecord,
    AuditEventRecord,
    DeepTwinAnalysisRun,
    DeepTwinClinicianNote,
    DeepTwinSimulationRun,
    OutcomeEvent,
    Patient,
    User,
    WearableAlertFlag,
)
from app.services.auth_service import create_access_token
from app.services.deeptwin_dashboard import (
    DOMAIN_KEYS,
    UNAVAILABLE_DOMAINS,
)


# ---------------------------------------------------------------------------
# Helpers — mint real JWTs so AuthenticatedActor.clinic_id flows through
# the JWT path (demo tokens don't carry clinic_id).
# ---------------------------------------------------------------------------

CLINIC_A = "clinic-a"
CLINIC_B = "clinic-b"


def _seed_clinician(
    session: Session, *, user_id: str, clinic_id: str | None = None,
) -> User:
    user = User(
        id=user_id,
        email=f"{user_id}@example.com",
        display_name="Test Clinician",
        role="clinician",
        clinic_id=clinic_id,
        hashed_password="x",
        package_id="clinician_pro",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.commit()
    return user


def _seed_patient(
    session: Session,
    *,
    patient_id: str,
    clinician_id: str,
) -> Patient:
    p = Patient(
        id=patient_id,
        clinician_id=clinician_id,
        first_name="Alice",
        last_name="Doe",
        dob="1992-04-15",
        email=f"{patient_id}@example.com",
        primary_condition="ADHD",
        secondary_conditions='["anxiety"]',
        notes="Patient reports difficulty with attention.",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(p)
    session.commit()
    return p


def _mint_clinician_token(user_id: str, clinic_id: str | None) -> str:
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clinic_id,
    )


def _hdr(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_clin_and_patient(
    session: Session,
    *,
    user_id: str = "user-clin-a",
    clinic_id: str | None = CLINIC_A,
    patient_id: str = "pat-360-1",
) -> tuple[User, Patient, str]:
    """Convenience: seed clinician + their patient + return a JWT for them."""
    user = _seed_clinician(session, user_id=user_id, clinic_id=clinic_id)
    patient = _seed_patient(session, patient_id=patient_id, clinician_id=user.id)
    token = _mint_clinician_token(user.id, clinic_id)
    return user, patient, token


@pytest.fixture
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_valid_patient_returns_payload(client: TestClient, db: Session):
    """1. Valid patient returns the full dashboard payload."""
    _, _, token = _seed_clin_and_patient(db, patient_id="pat-360-1")
    r = client.get("/api/v1/deeptwin/patients/pat-360-1/dashboard", headers=_hdr(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["patient_id"] == "pat-360-1"
    assert body["patient_summary"]["name"] == "Alice Doe"
    assert "decision-support" in body["disclaimer"].lower()


def test_invalid_patient_returns_404(client: TestClient, db: Session):
    """2. Unknown patient returns 404, not a synthetic payload."""
    _seed_clinician(db, user_id="user-clin-x", clinic_id=CLINIC_A)
    token = _mint_clinician_token("user-clin-x", CLINIC_A)
    r = client.get(
        "/api/v1/deeptwin/patients/pat-does-not-exist/dashboard", headers=_hdr(token),
    )
    assert r.status_code == 404


def test_cross_clinic_access_blocked(client: TestClient, db: Session):
    """3. Patient at clinic B cannot be read by a clinician at clinic A."""
    _seed_clinician(db, user_id="user-clin-a", clinic_id=CLINIC_A)
    other = _seed_clinician(db, user_id="user-clin-b", clinic_id=CLINIC_B)
    _seed_patient(db, patient_id="pat-360-cross", clinician_id=other.id)
    token = _mint_clinician_token("user-clin-a", CLINIC_A)
    r = client.get(
        "/api/v1/deeptwin/patients/pat-360-cross/dashboard", headers=_hdr(token),
    )
    assert r.status_code == 403, r.text
    body = r.json()
    assert (body.get("code") == "cross_clinic_access_denied") or "detail" in body


def test_payload_includes_all_22_domains(client: TestClient, db: Session):
    """4. Dashboard always includes exactly 22 domain entries with the canonical keys."""
    _, _, token = _seed_clin_and_patient(db, user_id="user-clin-22", patient_id="pat-360-2")
    r = client.get("/api/v1/deeptwin/patients/pat-360-2/dashboard", headers=_hdr(token))
    assert r.status_code == 200
    domains = r.json()["domains"]
    assert len(domains) == 22
    keys = [d["key"] for d in domains]
    assert keys == list(DOMAIN_KEYS), f"unexpected keys: {keys}"
    for d in domains:
        assert d["status"] in {"available", "partial", "missing", "unavailable"}
        assert d["label"]


def test_missing_domains_not_faked(client: TestClient, db: Session):
    """5. Structurally-unavailable domains are `unavailable`, not missing.
    Data-missing domains report `missing` with `record_count == 0`.
    """
    _, _, token = _seed_clin_and_patient(db, user_id="user-clin-mm", patient_id="pat-360-3")
    r = client.get("/api/v1/deeptwin/patients/pat-360-3/dashboard", headers=_hdr(token))
    body = r.json()
    by_key = {d["key"]: d for d in body["domains"]}
    for key in UNAVAILABLE_DOMAINS:
        assert by_key[key]["status"] == "unavailable", f"{key} should be unavailable"
        assert by_key[key]["record_count"] == 0
    for key in ("qeeg", "mri", "wearables", "treatment_sessions", "outcomes", "safety_flags"):
        assert by_key[key]["status"] == "missing", f"{key} should be missing"
        assert by_key[key]["record_count"] == 0


def test_safety_flags_included_when_present(client: TestClient, db: Session):
    """6. Adverse events + wearable alert flags surface in the top-level `safety` block."""
    user, _, token = _seed_clin_and_patient(db, user_id="user-clin-sf", patient_id="pat-360-4")
    db.add(AdverseEvent(
        patient_id="pat-360-4", clinician_id=user.id,
        event_type="headache", severity="mild",
        description="mild headache after first session",
        reported_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    ))
    db.add(WearableAlertFlag(
        patient_id="pat-360-4",
        flag_type="hrv_drop", severity="warning",
        detail="HRV down 18% week-over-week",
        triggered_at=datetime.now(timezone.utc),
    ))
    db.commit()
    r = client.get("/api/v1/deeptwin/patients/pat-360-4/dashboard", headers=_hdr(token))
    body = r.json()
    safety = body["safety"]
    assert len(safety["adverse_events"]) == 1
    assert safety["adverse_events"][0]["severity"] == "mild"
    assert len(safety["red_flags"]) == 1
    assert safety["red_flags"][0]["kind"] == "hrv_drop"
    by_key = {d["key"]: d for d in body["domains"]}
    assert by_key["safety_flags"]["status"] == "available"
    assert by_key["safety_flags"]["record_count"] == 2


def test_prediction_confidence_is_fail_closed_without_validated_model(
    client: TestClient, db: Session,
):
    """7. `prediction_confidence` is withheld until a validated model lands."""
    _, _, token = _seed_clin_and_patient(db, user_id="user-clin-pc", patient_id="pat-360-5")
    r = client.get("/api/v1/deeptwin/patients/pat-360-5/dashboard", headers=_hdr(token))
    body = r.json()
    pc = body["prediction_confidence"]
    by_key = {d["key"]: d for d in body["domains"]}
    assert by_key["twin_predictions"]["status"] == "unavailable"
    assert pc["available"] is False
    assert pc["status"] == "not_implemented"
    assert pc["real_ai"] is False
    assert pc["confidence"] is None
    assert pc["confidence_label"].lower().startswith("with")
    assert pc["reason"] == "no_validated_prediction_model"
    assert "withheld" in pc["summary"].lower()
    assert pc["limitations"]


def test_dashboard_uses_persisted_timeline_correlations_notes_and_review(
    client: TestClient, db: Session,
):
    """Dashboard panels should expose persisted DeepTwin state, not placeholders."""
    user, _, token = _seed_clin_and_patient(
        db,
        user_id="user-clin-real",
        patient_id="pat-360-real",
    )
    now = datetime.now(timezone.utc)
    analysis_run = DeepTwinAnalysisRun(
        patient_id="pat-360-real",
        clinician_id=user.id,
        analysis_type="correlation",
        output_summary_json=json.dumps({
            "priority_pairs": [
                {
                    "left": "sleep_total_min",
                    "right": "phq9_total",
                    "score": -0.62,
                    "confidence": "moderate",
                    "clinical_readout": "Sleep loss tracks higher PHQ-9 burden in this patient.",
                },
            ],
        }),
        confidence=0.72,
        model_name="tribe-v1",
        created_at=now - timedelta(hours=3),
        reviewed_at=now - timedelta(hours=2),
        reviewed_by=user.id,
    )
    db.add(analysis_run)
    db.flush()
    db.add(AssessmentRecord(
        patient_id="pat-360-real",
        clinician_id=user.id,
        template_id="phq9",
        template_title="PHQ-9",
        data_json="{}",
        created_at=now - timedelta(days=2),
    ))
    db.add(OutcomeEvent(
        patient_id="pat-360-real",
        clinician_id=user.id,
        event_type="improvement",
        title="PHQ-9 improvement noted",
        summary="Four-point reduction after protocol block one.",
        severity="info",
        payload_json="{}",
        recorded_at=now - timedelta(days=1),
    ))
    db.add(DeepTwinClinicianNote(
        patient_id="pat-360-real",
        clinician_id=user.id,
        note_text="Cross-check sleep before escalating stimulation intensity.",
        related_analysis_id=analysis_run.id,
        created_at=now - timedelta(hours=1),
    ))
    db.commit()

    r = client.get("/api/v1/deeptwin/patients/pat-360-real/dashboard", headers=_hdr(token))
    assert r.status_code == 200, r.text
    body = r.json()

    assert any(
        event["kind"] == "note"
        and event["label"].startswith("Clinician note added:")
        for event in body["timeline"]
    )
    assert any(
        event["kind"] == "review"
        and event["label"] == "DeepTwin analysis reviewed: correlation"
        for event in body["timeline"]
    )
    assert any(
        event["kind"] == "assessment"
        and event["label"] == "Assessment submitted: PHQ-9"
        for event in body["timeline"]
    )
    assert any(
        event["kind"] == "outcome"
        and event["label"] == "Outcome event: PHQ-9 improvement noted"
        for event in body["timeline"]
    )

    assert body["correlations"] == [
        {
            "left": "sleep_total_min",
            "right": "phq9_total",
            "strength": -0.62,
            "confidence": "moderate",
            "n_observations": None,
            "evidence_grade": None,
            "note": "Sleep loss tracks higher PHQ-9 burden in this patient.",
            "source_run_id": analysis_run.id,
            "source_model_name": "tribe-v1",
            "observed_at": analysis_run.created_at.replace(tzinfo=timezone.utc).isoformat(),
        },
    ]
    assert len(body["clinician_notes"]) == 1
    note = body["clinician_notes"][0]
    assert note["author"] == user.id
    assert note["text"] == "Cross-check sleep before escalating stimulation intensity."
    assert note["related_analysis_id"] == analysis_run.id
    assert note["related_simulation_id"] is None
    assert body["review"]["reviewed"] is True
    assert body["review"]["reviewed_by"] == user.id
    assert body["review"]["pending_items"] == 0


def test_dashboard_review_reflects_latest_pending_deeptwin_run(client: TestClient, db: Session):
    """Older reviewed output must not hide a newer unreviewed DeepTwin item."""
    user, _, token = _seed_clin_and_patient(
        db,
        user_id="user-clin-review",
        patient_id="pat-360-review",
    )
    now = datetime.now(timezone.utc)
    db.add(DeepTwinAnalysisRun(
        patient_id="pat-360-review",
        clinician_id=user.id,
        analysis_type="correlation",
        created_at=now - timedelta(days=2),
        reviewed_at=now - timedelta(days=1, hours=20),
        reviewed_by=user.id,
    ))
    db.add(DeepTwinSimulationRun(
        patient_id="pat-360-review",
        clinician_id=user.id,
        limitations="Awaiting clinician sign-off.",
        created_at=now - timedelta(hours=6),
    ))
    db.commit()

    r = client.get("/api/v1/deeptwin/patients/pat-360-review/dashboard", headers=_hdr(token))
    assert r.status_code == 200, r.text
    review = r.json()["review"]
    assert review["reviewed"] is False
    assert review["reviewed_by"] is None
    assert review["reviewed_at"] is None
    assert review["pending_items"] == 1
    assert review["source_kind"] == "simulation"


def test_audit_event_written(client: TestClient, db: Session):
    """8. A `dt360_opened` audit row is written every time the endpoint is hit."""
    _, _, token = _seed_clin_and_patient(db, user_id="user-clin-au", patient_id="pat-360-6")
    r = client.get("/api/v1/deeptwin/patients/pat-360-6/dashboard", headers=_hdr(token))
    assert r.status_code == 200
    fresh = SessionLocal()
    try:
        rows = fresh.query(AuditEventRecord).filter(
            AuditEventRecord.target_type == "deeptwin_dashboard",
            AuditEventRecord.target_id == "pat-360-6",
        ).all()
    finally:
        fresh.close()
    assert len(rows) >= 1
    assert rows[0].action == "dt360_opened"
    assert "deeptwin.dashboard.opened" in (rows[0].note or "")
