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


class TestPatientListFilters:
    """Server-side filters powering the Patients list design tabs / search / facets."""

    def test_status_tab_filter(self, client: TestClient, auth_headers: dict) -> None:
        _create_patient(client, auth_headers, first_name="Active", last_name="One", status="active")
        _create_patient(client, auth_headers, first_name="Intake", last_name="Two", status="intake")
        _create_patient(client, auth_headers, first_name="Paused", last_name="Three", status="paused")

        all_resp = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert all_resp.status_code == 200
        assert all_resp.json()["total"] == 3

        intake_resp = client.get("/api/v1/patients?status=intake", headers=auth_headers["clinician"])
        assert intake_resp.status_code == 200
        assert intake_resp.json()["total"] == 1
        assert intake_resp.json()["items"][0]["first_name"] == "Intake"

        # `paused` rolls up under the `on_hold` tab — canonicalised server-side.
        hold_resp = client.get("/api/v1/patients?status=on_hold", headers=auth_headers["clinician"])
        assert hold_resp.status_code == 200
        assert hold_resp.json()["total"] == 1

    def test_search_q_matches_name_condition_mrn(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid1 = _create_patient(
            client, auth_headers, first_name="Samantha", last_name="Li",
            primary_condition="Major Depressive Disorder",
        )
        _create_patient(
            client, auth_headers, first_name="Other", last_name="Person",
            primary_condition="Anxiety",
        )
        # Name hit
        r = client.get("/api/v1/patients?q=samantha", headers=auth_headers["clinician"])
        assert r.json()["total"] == 1
        # Condition hit via slug
        r = client.get("/api/v1/patients?q=depressive", headers=auth_headers["clinician"])
        assert r.json()["total"] == 1
        # MRN fallback uses the patient-id tail; strip UUID hyphens to match.
        tail = pid1.replace("-", "")[-8:].upper()
        r = client.get(f"/api/v1/patients?q={tail}", headers=auth_headers["clinician"])
        assert r.json()["total"] == 1

    def test_pagination_limit_offset(self, client: TestClient, auth_headers: dict) -> None:
        for i in range(5):
            _create_patient(client, auth_headers, first_name=f"Patient{i}", last_name=f"{i:03d}")
        page_a = client.get("/api/v1/patients?limit=2&offset=0", headers=auth_headers["clinician"])
        page_b = client.get("/api/v1/patients?limit=2&offset=2", headers=auth_headers["clinician"])
        assert page_a.status_code == 200 and page_b.status_code == 200
        assert page_a.json()["total"] == 5
        assert len(page_a.json()["items"]) == 2
        assert len(page_b.json()["items"]) == 2
        assert page_a.json()["items"][0]["id"] != page_b.json()["items"][0]["id"]


class TestCohortSummary:
    def test_empty_cohort(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/patients/cohort-summary", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 0
        # All status tabs present even when empty.
        for tab in ("all", "active", "intake", "discharging", "on_hold", "archived"):
            assert tab in body["status_counts"]
        assert body["kpis"]["active_courses"] == 0
        assert body["kpis"]["follow_up_count"] == 0

    def test_summary_reflects_status_counts_and_adverse_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient(client, auth_headers, first_name="A", last_name="Active1", status="active")
        _create_patient(client, auth_headers, first_name="B", last_name="Active2", status="active")
        pid_intake = _create_patient(client, auth_headers, first_name="C", last_name="In", status="intake")
        # Open AE on an active patient flags follow-up.
        client.post(
            "/api/v1/adverse-events",
            json={"patient_id": pid_intake, "event_type": "headache", "severity": "mild"},
            headers=auth_headers["clinician"],
        )
        r = client.get("/api/v1/patients/cohort-summary", headers=auth_headers["clinician"])
        body = r.json()
        assert body["total"] == 3
        assert body["status_counts"]["active"] == 2
        assert body["status_counts"]["intake"] == 1
        assert body["kpis"]["follow_up_count"] >= 1

    def test_summary_exposes_distinct_facet_values(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient(
            client, auth_headers, first_name="A", last_name="A",
            primary_modality="tDCS", primary_condition="MDD",
        )
        _create_patient(
            client, auth_headers, first_name="B", last_name="B",
            primary_modality="rTMS", primary_condition="MDD",
        )
        r = client.get("/api/v1/patients/cohort-summary", headers=auth_headers["clinician"])
        body = r.json()
        mods = {m["value"] for m in body["distinct"]["modalities"]}
        conds = {c["value"] for c in body["distinct"]["conditions"]}
        assert mods == {"tDCS", "rTMS"}
        assert "mdd" in conds


class TestNotificationsUnreadCount:
    def test_unread_count_zero_for_fresh_actor(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get("/api/v1/notifications/unread-count", headers=auth_headers["clinician"])
        assert r.status_code == 200
        body = r.json()
        assert body == {"count": 0, "unread_messages": 0, "open_adverse_events": 0}

    def test_open_adverse_event_increments_count(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient(client, auth_headers)
        client.post(
            "/api/v1/adverse-events",
            json={"patient_id": pid, "event_type": "headache", "severity": "mild"},
            headers=auth_headers["clinician"],
        )
        r = client.get("/api/v1/notifications/unread-count", headers=auth_headers["clinician"])
        body = r.json()
        assert body["open_adverse_events"] >= 1
        assert body["count"] >= 1
