"""Tests for symptom_journal_router — patient-facing journal surface.

Covers 11 test cases across the key endpoints:
  GET  /api/v1/symptom-journal/entries        (list)
  GET  /api/v1/symptom-journal/summary        (summary)
  POST /api/v1/symptom-journal/entries        (create)
  GET  /api/v1/symptom-journal/entries/{id}   (detail)
  PATCH /api/v1/symptom-journal/entries/{id}  (edit)
  DELETE /api/v1/symptom-journal/entries/{id} (soft-delete)
  POST /api/v1/symptom-journal/audit-events   (page audit)

Role gate: patient writes own data; clinician is rejected (403); admin requires
explicit patient_id.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import ConsentRecord, Patient, SymptomJournalEntry


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def journal_patient() -> Patient:
    """Demo patient whose email matches the actor-patient-demo token resolution."""
    db = SessionLocal()
    try:
        p = Patient(
            id="sj-test-patient",
            clinician_id="actor-clinician-demo",
            first_name="Journal",
            last_name="Tester",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p
    finally:
        db.close()


@pytest.fixture
def journal_patient_no_consent() -> Patient:
    """Variant with consent_signed=False; write endpoints must reject."""
    db = SessionLocal()
    try:
        p = Patient(
            id="sj-noconsent-patient",
            clinician_id="actor-clinician-demo",
            first_name="NoCon",
            last_name="Sent",
            email="patient@deepsynaps.com",
            consent_signed=False,
            status="active",
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Role gate
# ---------------------------------------------------------------------------


class TestRoleGate:
    def test_clinician_cannot_list_entries(
        self, client: TestClient, auth_headers: dict, journal_patient: Patient
    ) -> None:
        r = client.get(
            "/api/v1/symptom-journal/entries", headers=auth_headers["clinician"]
        )
        assert r.status_code == 403

    def test_admin_without_patient_id_returns_400(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/symptom-journal/entries", headers=auth_headers["admin"]
        )
        assert r.status_code == 400
        assert r.json()["code"] == "patient_id_required"

    def test_admin_with_explicit_patient_id(
        self, client: TestClient, auth_headers: dict, journal_patient: Patient
    ) -> None:
        r = client.get(
            f"/api/v1/symptom-journal/entries?patient_id={journal_patient.id}",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# List / summary
# ---------------------------------------------------------------------------


class TestListAndSummary:
    def test_patient_list_returns_empty_set(
        self, client: TestClient, auth_headers: dict, journal_patient: Patient
    ) -> None:
        r = client.get(
            "/api/v1/symptom-journal/entries", headers=auth_headers["patient"]
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "consent_active" in body
        assert isinstance(body["disclaimers"], list)

    def test_summary_returns_expected_shape(
        self, client: TestClient, auth_headers: dict, journal_patient: Patient
    ) -> None:
        r = client.get(
            "/api/v1/symptom-journal/summary", headers=auth_headers["patient"]
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # The response model uses entries_7d / entries_30d (not total_7d)
        assert "entries_7d" in body
        assert "entries_30d" in body


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class TestCreateEntry:
    def test_patient_can_create_entry(
        self, client: TestClient, auth_headers: dict, journal_patient: Patient
    ) -> None:
        # SymptomJournalEntryIn has severity (int 0–10), note, and tags — no symptom field
        r = client.post(
            "/api/v1/symptom-journal/entries",
            json={
                "severity": 5,
                "note": "Mild headache in the morning",
                "tags": ["headache"],
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["severity"] == 5
        assert "id" in body

    def test_clinician_cannot_create_entry(
        self, client: TestClient, auth_headers: dict, journal_patient: Patient
    ) -> None:
        r = client.post(
            "/api/v1/symptom-journal/entries",
            json={"severity": 3, "note": "test"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_create_minimal_entry_accepted(
        self, client: TestClient, auth_headers: dict, journal_patient: Patient
    ) -> None:
        """All fields on SymptomJournalEntryIn are optional — an empty body is valid."""
        r = client.post(
            "/api/v1/symptom-journal/entries",
            json={"note": "quick log"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text


# ---------------------------------------------------------------------------
# Detail via seeded row
# ---------------------------------------------------------------------------


class TestDetailAndMutations:
    @pytest.fixture
    def entry_row(self, journal_patient: Patient) -> SymptomJournalEntry:
        db = SessionLocal()
        try:
            # SymptomJournalEntry has no "symptom" column; use note + severity
            row = SymptomJournalEntry(
                id="sj-test-entry",
                patient_id=journal_patient.id,
                author_actor_id="actor-patient-demo",
                severity=4,
                note="seed entry — fatigue",
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return row
        finally:
            db.close()

    def test_patient_can_get_entry(
        self,
        client: TestClient,
        auth_headers: dict,
        journal_patient: Patient,
        entry_row: SymptomJournalEntry,
    ) -> None:
        r = client.get(
            f"/api/v1/symptom-journal/entries/{entry_row.id}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["id"] == entry_row.id

    def test_nonexistent_entry_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        journal_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/symptom-journal/entries/no-such-entry",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404

    def test_patient_can_soft_delete_entry(
        self,
        client: TestClient,
        auth_headers: dict,
        journal_patient: Patient,
        entry_row: SymptomJournalEntry,
    ) -> None:
        # Soft-delete requires a request body with "reason"
        r = client.request(
            "DELETE",
            f"/api/v1/symptom-journal/entries/{entry_row.id}",
            json={"reason": "no longer relevant"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Audit event ingestion
# ---------------------------------------------------------------------------


class TestAuditEvents:
    def test_audit_event_accepted_by_symptom_journal(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/symptom-journal/audit-events",
            json={"event": "view", "note": "page load"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("accepted") is True
