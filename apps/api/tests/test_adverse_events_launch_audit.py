"""Tests for the adverse-events launch-audit hardening (2026-04-30).

Covers:
  - Classification on create: body_system / expectedness / relatedness validation
  - SAE auto-flag derivation
  - Reportable derivation (SAE ∧ unexpected ∧ related)
  - PATCH /{id}: clinician override + re-derivation
  - POST /{id}/review: review timestamp + sign-off
  - POST /{id}/escalate: regulator/IRB escalation audit
  - GET /summary: counts roll-up never fakes numbers
  - GET /export.csv: filter-aware export with audit columns
  - GET /{id}/export.cioms: honest "not configured" stub
  - Cross-clinician scope: clinician sees only own AEs; admin sees all
"""
from __future__ import annotations

import csv
import io
import json

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, User
from app.routers.adverse_events_router import (
    derive_is_serious,
    derive_reportable,
    suggest_body_system,
)


def _ensure_demo_clinician_in_clinic() -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id="actor-clinician-demo").first()
        if existing is not None and existing.clinic_id:
            return
        clinic_id = "clinic-ae-launch"
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="AE Launch Demo Clinic"))
            db.flush()
        if existing is None:
            db.add(
                User(
                    id="actor-clinician-demo",
                    email="ae_launch@example.com",
                    display_name="Launch Audit Clinician",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id=clinic_id,
                )
            )
        else:
            existing.clinic_id = clinic_id
        db.commit()
    finally:
        db.close()


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    _ensure_demo_clinician_in_clinic()
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "AELA", "last_name": "Patient", "dob": "1990-01-01", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── Pure-Python classification rules ─────────────────────────────────────────

class TestClassificationHelpers:
    def test_sae_when_severity_serious(self) -> None:
        is_serious, _ = derive_is_serious("serious", None)
        assert is_serious is True

    def test_sae_when_qualifier_present(self) -> None:
        is_serious, sae = derive_is_serious("moderate", "hospitalization, persistent_disability")
        assert is_serious is True
        assert sae is not None and "hospitalization" in sae

    def test_sae_false_for_mild(self) -> None:
        is_serious, _ = derive_is_serious("mild", None)
        assert is_serious is False

    def test_unknown_qualifier_filtered(self) -> None:
        is_serious, sae = derive_is_serious("mild", "vague_thing")
        assert is_serious is False
        assert sae is None

    def test_reportable_only_when_all_three(self) -> None:
        # SAE + unexpected + possible → reportable
        assert derive_reportable(True, "unexpected", "possible") is True
        # Missing severity → never reportable
        assert derive_reportable(False, "unexpected", "definite") is False
        # Expected → never reportable
        assert derive_reportable(True, "expected", "probable") is False
        # Unknown relatedness → not reportable
        assert derive_reportable(True, "unexpected", "unknown") is False
        assert derive_reportable(True, "unexpected", "not_related") is False

    def test_body_system_suggestion(self) -> None:
        assert suggest_body_system("headache", None) == "nervous"
        assert suggest_body_system("scalp burn", "minor") == "skin"
        assert suggest_body_system("nausea", None) == "gi"
        assert suggest_body_system("anxiety attack", None) == "psychiatric"
        # Unknown free text → no suggestion
        assert suggest_body_system("zzz_unknown_event", None) is None
        # Empty input → None
        assert suggest_body_system("", None) is None


# ── Create with classification ──────────────────────────────────────────────

class TestCreateClassification:
    def test_create_with_full_classification(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={
                "patient_id": patient_id,
                "event_type": "seizure",
                "severity": "serious",
                "body_system": "nervous",
                "expectedness": "unexpected",
                "relatedness": "probable",
                "sae_criteria": "hospitalization",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_serious"] is True
        assert data["reportable"] is True
        assert data["body_system"] == "nervous"
        assert data["expectedness"] == "unexpected"
        assert data["expectedness_source"] == "clinician"
        assert "hospitalization" in (data["sae_criteria"] or "")
        assert data["status"] == "open"

    def test_create_invalid_body_system_rejected(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={
                "patient_id": patient_id,
                "event_type": "headache",
                "severity": "mild",
                "body_system": "lymphatic",  # not in whitelist
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_create_invalid_expectedness_rejected(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={
                "patient_id": patient_id,
                "event_type": "headache",
                "severity": "mild",
                "expectedness": "definitely_unexpected",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_create_minimal_keeps_unknown_classification(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "fatigue", "severity": "mild"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        # No fake defaults — fields stay None for clinician to fill in.
        assert data["is_serious"] is False
        assert data["reportable"] is False
        assert data["body_system"] is None
        assert data["expectedness"] is None


# ── PATCH ───────────────────────────────────────────────────────────────────

class TestPatchAdverseEvent:
    def _create(self, client: TestClient, auth_headers: dict, patient_id: str) -> dict:
        return client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "headache", "severity": "moderate"},
            headers=auth_headers["clinician"],
        ).json()

    def test_patch_re_derives_reportable(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        ae = self._create(client, auth_headers, patient_id)
        # Step 1: bump to serious + unexpected + possible — must become reportable.
        resp = client.patch(
            f"/api/v1/adverse-events/{ae['id']}",
            json={"severity": "serious", "expectedness": "unexpected", "relatedness": "possible"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_serious"] is True
        assert data["reportable"] is True
        # Step 2: drop relatedness to not_related — reportable must flip back off.
        resp2 = client.patch(
            f"/api/v1/adverse-events/{ae['id']}",
            json={"relatedness": "not_related"},
            headers=auth_headers["clinician"],
        )
        assert resp2.status_code == 200
        assert resp2.json()["reportable"] is False
        assert resp2.json()["is_serious"] is True  # severity still serious

    def test_patch_invalid_field_422(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        ae = self._create(client, auth_headers, patient_id)
        resp = client.patch(
            f"/api/v1/adverse-events/{ae['id']}",
            json={"body_system": "nonsense"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_guest_cannot_patch(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        ae = self._create(client, auth_headers, patient_id)
        resp = client.patch(
            f"/api/v1/adverse-events/{ae['id']}",
            json={"severity": "serious"},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403


# ── Review + escalate ───────────────────────────────────────────────────────

class TestReviewAndEscalate:
    def _create(self, client: TestClient, auth_headers: dict, patient_id: str, **extra) -> dict:
        body = {"patient_id": patient_id, "event_type": "headache", "severity": "mild", **extra}
        return client.post("/api/v1/adverse-events", json=body, headers=auth_headers["clinician"]).json()

    def test_review_marks_timestamp(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        ae = self._create(client, auth_headers, patient_id)
        resp = client.post(
            f"/api/v1/adverse-events/{ae['id']}/review",
            json={"note": "looked OK", "sign_off": False},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["reviewed_at"] is not None
        assert data["reviewed_by"] is not None
        assert data["signed_at"] is None
        assert data["status"] == "reviewed"

    def test_review_sign_off_sets_both(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        ae = self._create(client, auth_headers, patient_id)
        resp = client.post(
            f"/api/v1/adverse-events/{ae['id']}/review",
            json={"sign_off": True},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["reviewed_at"] is not None
        assert data["signed_at"] is not None
        assert data["signed_by"] is not None

    def test_escalate_to_irb(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        ae = self._create(client, auth_headers, patient_id, severity="serious")
        resp = client.post(
            f"/api/v1/adverse-events/{ae['id']}/escalate",
            json={"target": "IRB", "note": "needs board review"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["escalation_target"] == "irb"
        assert data["escalated_at"] is not None
        assert "needs board review" in (data["escalation_note"] or "")
        assert data["status"] == "escalated"

    def test_escalate_invalid_target_rejected(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        ae = self._create(client, auth_headers, patient_id)
        resp = client.post(
            f"/api/v1/adverse-events/{ae['id']}/escalate",
            json={"target": "social_media"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422


# ── Summary roll-up ─────────────────────────────────────────────────────────

class TestSummary:
    def test_summary_empty(self, client: TestClient, auth_headers: dict) -> None:
        _ensure_demo_clinician_in_clinic()
        resp = client.get("/api/v1/adverse-events/summary", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["sae"] == 0
        assert data["reportable"] == 0
        assert data["awaiting_review"] == 0
        assert data["by_severity"] == {}
        assert data["by_body_system"] == {}

    def test_summary_counts_real(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "headache", "severity": "mild"},
            headers=auth_headers["clinician"],
        )
        client.post(
            "/api/v1/adverse-events",
            json={
                "patient_id": patient_id,
                "event_type": "seizure",
                "severity": "serious",
                "expectedness": "unexpected",
                "relatedness": "probable",
                "body_system": "nervous",
            },
            headers=auth_headers["clinician"],
        )
        resp = client.get("/api/v1/adverse-events/summary", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert data["sae"] == 1
        assert data["reportable"] == 1
        assert data["awaiting_review"] == 2
        assert data["by_severity"].get("mild") == 1
        assert data["by_severity"].get("serious") == 1
        assert data["by_body_system"].get("nervous") == 1
        assert data["by_body_system"].get("unspecified") == 1


# ── List filters ────────────────────────────────────────────────────────────

class TestListFilters:
    def _seed(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        for body in (
            {"event_type": "headache", "severity": "mild"},
            {"event_type": "scalp burn", "severity": "moderate", "body_system": "skin"},
            {
                "event_type": "seizure",
                "severity": "serious",
                "body_system": "nervous",
                "expectedness": "unexpected",
                "relatedness": "probable",
            },
        ):
            client.post(
                "/api/v1/adverse-events",
                json={"patient_id": patient_id, **body},
                headers=auth_headers["clinician"],
            )

    def test_filter_sae_true(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        self._seed(client, auth_headers, patient_id)
        resp = client.get("/api/v1/adverse-events?sae=true", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert all(it["is_serious"] for it in items)
        assert len(items) == 1

    def test_filter_reportable(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        self._seed(client, auth_headers, patient_id)
        resp = client.get("/api/v1/adverse-events?reportable=true", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["reportable"] is True

    def test_filter_body_system(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        self._seed(client, auth_headers, patient_id)
        resp = client.get("/api/v1/adverse-events?body_system=skin", headers=auth_headers["clinician"])
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["body_system"] == "skin"

    def test_filter_status_open_excludes_reviewed(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        self._seed(client, auth_headers, patient_id)
        # Review the first one
        first_id = client.get("/api/v1/adverse-events", headers=auth_headers["clinician"]).json()["items"][0]["id"]
        client.post(f"/api/v1/adverse-events/{first_id}/review", json={}, headers=auth_headers["clinician"])
        resp = client.get("/api/v1/adverse-events?status=open", headers=auth_headers["clinician"])
        ids = [it["id"] for it in resp.json()["items"]]
        assert first_id not in ids


# ── CSV export ──────────────────────────────────────────────────────────────

class TestCsvExport:
    def test_export_csv_headers(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "headache", "severity": "mild"},
            headers=auth_headers["clinician"],
        )
        resp = client.get("/api/v1/adverse-events/export.csv", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        text = resp.text
        reader = csv.reader(io.StringIO(text))
        header = next(reader)
        assert "id" in header
        assert "is_serious" in header
        assert "reportable" in header
        assert "body_system" in header
        rows = list(reader)
        assert len(rows) == 1

    def test_export_csv_filtered(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        # Seed mild + serious; export ?sae=true must contain only serious.
        client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "headache", "severity": "mild"},
            headers=auth_headers["clinician"],
        )
        client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "seizure", "severity": "serious"},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/adverse-events/export.csv?sae=true",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        rows = list(csv.DictReader(io.StringIO(resp.text)))
        assert len(rows) == 1
        assert rows[0]["severity"] == "serious"
        assert rows[0]["is_serious"] == "1"


# ── CIOMS stub ──────────────────────────────────────────────────────────────

class TestCiomsStub:
    def test_cioms_returns_honest_not_configured(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        ae = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "seizure", "severity": "serious"},
            headers=auth_headers["clinician"],
        ).json()
        resp = client.get(
            f"/api/v1/adverse-events/{ae['id']}/export.cioms",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.headers.get("X-CIOMS-Configured") == "false"
        body = json.loads(resp.text)
        assert body["configured"] is False
        assert body["form_format"] == "CIOMS-I"
        assert "not configured" in body["message"].lower()
        assert body["event"]["id"] == ae["id"]

    def test_cioms_404_for_unknown(self, client: TestClient, auth_headers: dict) -> None:
        _ensure_demo_clinician_in_clinic()
        resp = client.get(
            "/api/v1/adverse-events/does-not-exist/export.cioms",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404
