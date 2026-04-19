"""Patients router — list enrichment + demo_seed detection."""
from __future__ import annotations

from fastapi.testclient import TestClient


def _create_patient(client: TestClient, auth_headers: dict, **overrides) -> str:
    body = {
        "first_name": "Test",
        "last_name": "Patient",
        "dob": "1990-01-01",
        "gender": "F",
        "primary_condition": "Major Depressive Disorder",
        "primary_modality": "tDCS",
        "status": "active",
        "notes": "Baseline",
    }
    body.update(overrides)
    resp = client.post("/api/v1/patients", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


class TestPatientListEnrichment:
    def test_list_empty(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_enrichment_defaults_zero(self, client: TestClient, auth_headers: dict) -> None:
        _create_patient(client, auth_headers)
        resp = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        p = items[0]
        # Enrichment fields always present
        for key in (
            "active_courses_count", "needs_review", "has_adverse_event",
            "adverse_event_flag", "off_label_flag", "pending_assessments",
            "assessment_overdue", "last_session_date", "home_adherence",
            "outcome_trend", "sessions_today", "next_session_date", "demo_seed",
        ):
            assert key in p, f"missing enrichment field: {key}"
        # Defaults for a bare patient with no related rows
        assert p["active_courses_count"] == 0
        assert p["needs_review"] is False
        assert p["has_adverse_event"] is False
        assert p["off_label_flag"] is False
        assert p["pending_assessments"] == 0
        assert p["assessment_overdue"] is False
        assert p["home_adherence"] is None
        assert p["outcome_trend"] is None
        assert p["demo_seed"] is False

    def test_demo_seed_flag_detected_from_notes_prefix(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient(client, auth_headers, notes="[DEMO] Sample patient for demo.")
        resp = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["demo_seed"] is True

    def test_adverse_event_sets_has_adverse_event(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient(client, auth_headers)
        resp = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": pid, "event_type": "headache", "severity": "mild"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        resp = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        items = resp.json()["items"]
        assert len(items) == 1
        p = items[0]
        assert p["has_adverse_event"] is True
        assert p["adverse_event_flag"] is True

    def test_clinician_scope_isolation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient(client, auth_headers, first_name="Mine", last_name="Clinic")
        # Admin token is a different actor; patient should not appear for them.
        resp = client.get("/api/v1/patients", headers=auth_headers["admin"])
        assert resp.status_code == 200
        assert all(p["first_name"] != "Mine" for p in resp.json()["items"])


class TestPatientDetailEnrichment:
    def test_detail_get_includes_enrichment_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient(client, auth_headers)
        resp = client.get(f"/api/v1/patients/{pid}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        p = resp.json()
        # Detail endpoint must surface the same enrichment keys as list.
        for key in (
            "active_courses_count", "needs_review", "has_adverse_event",
            "pending_assessments", "home_adherence", "outcome_trend",
            "sessions_today", "next_session_date", "demo_seed",
        ):
            assert key in p, f"detail missing enrichment field: {key}"
        assert p["active_courses_count"] == 0
        assert p["needs_review"] is False

    def test_detail_reflects_adverse_event_after_report(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient(client, auth_headers)
        resp = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": pid, "event_type": "headache", "severity": "mild"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        resp = client.get(f"/api/v1/patients/{pid}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["has_adverse_event"] is True
