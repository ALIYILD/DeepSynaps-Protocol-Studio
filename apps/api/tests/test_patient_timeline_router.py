"""Tests for /api/v1/patient-timeline (CONTRACT_V3 §6).

Covers:
- Auth gate (403)
- Empty DB → demo synthesis (6 events, all required fields)
- Event shape (type, at, summary, ref_id, lane, connects_to)
- Banned-word sanitisation in summaries
- Events sorted newest-first
- Cross-clinic IDOR: clinician from Clinic A is blocked (403) from Clinic B patient
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_BASE = "/api/v1/patient-timeline"

# ── Cross-clinic IDOR test helpers ──────────────────────────────────────────

_CLINIC_A = "clinic-timeline-test-a"
_CLINIC_B = "clinic-timeline-test-b"
_PATIENT_IN_CLINIC_B = "pt-timeline-cross-clinic-test-b"


def _seed_cross_clinic_fixture() -> None:
    """Seed Clinic A + actor-clinician-demo in A, Clinic B + a patient owned by B."""
    from app.database import SessionLocal
    from app.persistence.models import Clinic, Patient, User

    db = SessionLocal()
    try:
        for cid, name in [(_CLINIC_A, "Timeline Test Clinic A"), (_CLINIC_B, "Timeline Test Clinic B")]:
            if db.query(Clinic).filter_by(id=cid).first() is None:
                db.add(Clinic(id=cid, name=name))
        db.flush()

        # Ensure actor-clinician-demo is bound to Clinic A so that the demo
        # token resolves to Clinic A at auth time.
        user_a = db.query(User).filter_by(id="actor-clinician-demo").first()
        if user_a is None:
            db.add(User(
                id="actor-clinician-demo",
                email="demo_clinician@example.com",
                display_name="Verified Clinician Demo",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=_CLINIC_A,
            ))
        else:
            user_a.clinic_id = _CLINIC_A
        db.flush()

        # Seed a clinician in Clinic B who owns the test patient.
        if db.query(User).filter_by(id="actor-clinician-b-timeline").first() is None:
            db.add(User(
                id="actor-clinician-b-timeline",
                email="clinician_b_timeline@example.com",
                display_name="Clinician B Timeline",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=_CLINIC_B,
            ))
        db.flush()

        if db.query(Patient).filter_by(id=_PATIENT_IN_CLINIC_B).first() is None:
            db.add(Patient(
                id=_PATIENT_IN_CLINIC_B,
                clinician_id="actor-clinician-b-timeline",
                first_name="Cross",
                last_name="Clinic",
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def test_timeline_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-999")
    assert r.status_code == 403


def test_timeline_empty_db_returns_demo_events(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-empty", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "events" in body
    events = body["events"]
    # Demo synthesis must produce exactly 6 events
    assert len(events) == 6


def test_timeline_event_shape(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-shape", headers=_CLINICIAN)
    assert r.status_code == 200
    events = r.json()["events"]
    required_fields = {"type", "at", "summary", "ref_id", "lane", "connects_to"}
    for ev in events:
        assert required_fields.issubset(ev.keys()), f"Event missing fields: {ev}"
        assert isinstance(ev["connects_to"], list)


def test_timeline_valid_lanes(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-lanes", headers=_CLINICIAN)
    assert r.status_code == 200
    events = r.json()["events"]
    valid_lanes = {"qeeg", "mri", "assessment", "session", "outcome"}
    for ev in events:
        assert ev["lane"] in valid_lanes, f"Unexpected lane: {ev['lane']}"


def test_timeline_sorted_newest_first(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-sort", headers=_CLINICIAN)
    assert r.status_code == 200
    events = r.json()["events"]
    timestamps = [ev["at"] for ev in events if ev["at"]]
    assert timestamps == sorted(timestamps, reverse=True)


def test_timeline_no_banned_words_in_summary(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-banned", headers=_CLINICIAN)
    assert r.status_code == 200
    events = r.json()["events"]
    banned = ["treatment recommendation", "diagnosis", "diagnostic", "diagnoses"]
    for ev in events:
        summary_lower = (ev.get("summary") or "").lower()
        for word in banned:
            assert word not in summary_lower, (
                f"Banned word '{word}' found in summary: {ev['summary']}"
            )


def test_timeline_different_patient_ids_independent(client: TestClient) -> None:
    r1 = client.get(f"{_BASE}/pt-aaa", headers=_CLINICIAN)
    r2 = client.get(f"{_BASE}/pt-bbb", headers=_CLINICIAN)
    assert r1.status_code == 200
    assert r2.status_code == 200
    # Each patient gets their own independent demo events
    ids1 = {ev["ref_id"] for ev in r1.json()["events"]}
    ids2 = {ev["ref_id"] for ev in r2.json()["events"]}
    assert ids1.isdisjoint(ids2), "Demo events from different patients must have distinct ref_ids"


# ── Cross-clinic IDOR gate ───────────────────────────────────────────────────


def test_cross_clinic_timeline_blocked(client: TestClient) -> None:
    """Clinician from Clinic A must receive 403 for a patient owned by Clinic B.

    Verifies P0 finding #1 from auth-cross-clinic-2026-05-11.md:
    _gate_patient_access must fire before any _load_* call and before
    demo-data synthesis, so a cross-clinic probe cannot exfiltrate even
    synthesised events.
    """
    _seed_cross_clinic_fixture()
    r = client.get(f"{_BASE}/{_PATIENT_IN_CLINIC_B}", headers=_CLINICIAN)
    assert r.status_code == 403, (
        f"Expected 403 for cross-clinic patient access, got {r.status_code}: {r.text}"
    )


def test_same_clinic_timeline_allowed(client: TestClient) -> None:
    """Clinician from Clinic A receives 200 for a patient also in Clinic A."""
    from app.database import SessionLocal
    from app.persistence.models import Clinic, Patient, User

    patient_id = "pt-timeline-same-clinic-test-a"
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id=_CLINIC_A).first() is None:
            db.add(Clinic(id=_CLINIC_A, name="Timeline Test Clinic A"))
            db.flush()
        user_a = db.query(User).filter_by(id="actor-clinician-demo").first()
        if user_a is None:
            db.add(User(
                id="actor-clinician-demo",
                email="demo_clinician@example.com",
                display_name="Verified Clinician Demo",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=_CLINIC_A,
            ))
        else:
            user_a.clinic_id = _CLINIC_A
        db.flush()
        if db.query(Patient).filter_by(id=patient_id).first() is None:
            db.add(Patient(
                id=patient_id,
                clinician_id="actor-clinician-demo",
                first_name="Same",
                last_name="Clinic",
            ))
        db.commit()
    finally:
        db.close()

    r = client.get(f"{_BASE}/{patient_id}", headers=_CLINICIAN)
    assert r.status_code == 200, (
        f"Expected 200 for same-clinic patient access, got {r.status_code}: {r.text}"
    )
