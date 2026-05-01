"""Tests for the Population Analytics launch-audit (2026-05-01).

Covers the new endpoints in
``apps/api/app/routers/population_analytics_router.py`` for the
clinician-facing Population Analytics hub:

* GET    /api/v1/population-analytics/cohorts/summary
* GET    /api/v1/population-analytics/cohorts/list
* GET    /api/v1/population-analytics/outcomes/trend
* GET    /api/v1/population-analytics/adverse-events/incidence
* GET    /api/v1/population-analytics/treatment-response
* GET    /api/v1/population-analytics/export.csv
* GET    /api/v1/population-analytics/export.ndjson
* POST   /api/v1/population-analytics/audit-events

Also asserts that the ``population_analytics`` surface is whitelisted by
both ``audit_trail_router.KNOWN_SURFACES`` and the qEEG audit-events
endpoint (per the cross-router audit-hook spec).
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal


# ── Helpers ─────────────────────────────────────────────────────────────────


def _ensure_clinic_and_clinicians() -> tuple[str, str]:
    """Reattribute the demo clinician to a *non-demo* clinic so the canonical
    ``_patient_is_demo`` helper (which marks everyone in ``clinic-demo-default``
    as demo) does not contaminate the cohort honesty tests. Also seeds a
    second clinic + clinician so cross-clinic tests can assert isolation.

    Returns (primary_clinic_id, other_clinic_id).
    """
    from app.persistence.models import Clinic, User

    db = SessionLocal()
    try:
        primary = "clinic-pop-real"
        other = "clinic-pop-other"
        for cid, name in ((primary, "Real Clinic"), (other, "Other Clinic")):
            if db.query(Clinic).filter_by(id=cid).first() is None:
                db.add(Clinic(id=cid, name=name))
        db.flush()
        # Move the conftest demo clinician + admin off ``clinic-demo-default``
        # for this test module so explicit ``[DEMO]`` notes are the *only*
        # source of demo attribution. This mirrors a real deployment where
        # most clinicians sit in real clinics.
        primary_clinician = db.query(User).filter_by(id="actor-clinician-demo").first()
        if primary_clinician is not None:
            primary_clinician.clinic_id = primary
        admin_user = db.query(User).filter_by(id="actor-admin-demo").first()
        if admin_user is not None:
            admin_user.clinic_id = primary
        if db.query(User).filter_by(id="actor-clinician-other").first() is None:
            db.add(
                User(
                    id="actor-clinician-other",
                    email="other_clinician@example.com",
                    display_name="Other Clinic Clinician",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id=other,
                )
            )
        db.commit()
        return primary, other
    finally:
        db.close()


def _make_patient(
    client: TestClient,
    headers: dict,
    *,
    first_name: str,
    primary_condition: str = "MDD",
    primary_modality: str = "TMS",
    gender: str = "F",
    dob: str = "1990-04-01",
    notes: str | None = None,
) -> str:
    body = {
        "first_name": first_name,
        "last_name": "PopLaunch",
        "dob": dob,
        "gender": gender,
        "primary_condition": primary_condition,
        "primary_modality": primary_modality,
    }
    if notes is not None:
        body["notes"] = notes
    r = client.post("/api/v1/patients", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _seed_demo_patient(*, clinician_id: str, clinic_id: str = "clinic-demo-default", primary_condition: str = "MDD", primary_modality: str = "TMS", gender: str = "F", dob: str = "1990-04-01", notes_demo: bool = True) -> str:
    """Seed a demo patient bypass the API so ``[DEMO]`` notes prefix sticks."""
    from app.persistence.models import Patient

    db = SessionLocal()
    try:
        p = Patient(
            clinician_id=clinician_id,
            first_name="Demo",
            last_name="Seed",
            dob=dob,
            gender=gender,
            primary_condition=primary_condition,
            primary_modality=primary_modality,
            notes="[DEMO] seeded" if notes_demo else None,
        )
        db.add(p)
        db.commit()
        return p.id
    finally:
        db.close()


def _seed_course(*, patient_id: str, clinician_id: str, status: str = "active", condition: str = "mdd", modality: str = "tms", protocol_id: str = "tms-mdd-10hz", sessions_delivered: int = 0) -> str:
    from app.persistence.models import TreatmentCourse

    db = SessionLocal()
    try:
        c = TreatmentCourse(
            patient_id=patient_id,
            clinician_id=clinician_id,
            protocol_id=protocol_id,
            condition_slug=condition,
            modality_slug=modality,
            status=status,
            sessions_delivered=sessions_delivered,
        )
        db.add(c)
        db.commit()
        return c.id
    finally:
        db.close()


def _seed_outcome(*, patient_id: str, course_id: str, clinician_id: str, scale: str = "PHQ-9", score: float = 18.0, point: str = "baseline", days_offset: int = 0) -> str:
    from app.persistence.models import OutcomeSeries

    db = SessionLocal()
    try:
        rec = OutcomeSeries(
            patient_id=patient_id,
            course_id=course_id,
            template_id=scale,
            template_title=scale,
            score=str(score),
            score_numeric=float(score),
            measurement_point=point,
            administered_at=datetime.now(timezone.utc) + timedelta(days=days_offset),
            clinician_id=clinician_id,
        )
        db.add(rec)
        db.commit()
        return rec.id
    finally:
        db.close()


def _seed_ae(*, patient_id: str, course_id: str | None, clinician_id: str, severity: str = "mild", event_type: str = "headache", is_demo: bool = False, is_serious: bool = False, reportable: bool = False) -> str:
    from app.persistence.models import AdverseEvent

    db = SessionLocal()
    try:
        ae = AdverseEvent(
            patient_id=patient_id,
            course_id=course_id,
            clinician_id=clinician_id,
            event_type=event_type,
            severity=severity,
            reported_at=datetime.now(timezone.utc),
            is_serious=is_serious,
            reportable=reportable,
            is_demo=is_demo,
        )
        db.add(ae)
        db.commit()
        return ae.id
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_population_analytics_in_audit_trail_known_surfaces():
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "population_analytics" in KNOWN_SURFACES


def test_population_analytics_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "population_analytics surface whitelist sanity",
        "surface": "population_analytics",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("population_analytics-")


# ── Role gate ──────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_forbidden(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get(
            "/api/v1/population-analytics/cohorts/summary",
            headers=auth_headers["guest"],
        )
        assert r.status_code in (401, 403)

    def test_clinician_ok(self, client: TestClient, auth_headers: dict) -> None:
        _ensure_clinic_and_clinicians()
        r = client.get(
            "/api/v1/population-analytics/cohorts/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


# ── Aggregate honesty (5 demo + 5 real → 10 cohort, 5 demo) ────────────────


class TestCohortSummary:
    def test_demo_and_real_split(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        for i in range(5):
            _make_patient(
                client, auth_headers["clinician"], first_name=f"Real{i}"
            )
        for _ in range(5):
            _seed_demo_patient(clinician_id="actor-clinician-demo")

        r = client.get(
            "/api/v1/population-analytics/cohorts/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["cohort_size"] == 10
        assert data["demo_count"] == 5
        assert data["has_demo"] is True
        # SQL aggregate echoes — never fabricated.
        assert "by_condition" in data
        assert "by_modality" in data
        assert "by_age_band" in data
        assert "by_sex" in data

    def test_filters_apply_real_aggregates(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        _make_patient(
            client, auth_headers["clinician"], first_name="A",
            primary_condition="MDD", primary_modality="TMS", gender="F", dob="1990-04-01",
        )
        _make_patient(
            client, auth_headers["clinician"], first_name="B",
            primary_condition="GAD", primary_modality="tDCS", gender="M", dob="2010-04-01",
        )
        # Filter by condition
        r = client.get(
            "/api/v1/population-analytics/cohorts/summary?condition=MDD",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["cohort_size"] == 1
        # Filter by sex
        r = client.get(
            "/api/v1/population-analytics/cohorts/summary?sex=M",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["cohort_size"] == 1
        # Filter by age band — DOB 2010 → u18
        r = client.get(
            "/api/v1/population-analytics/cohorts/summary?age_band=u18",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["cohort_size"] == 1


# ── Cross-clinic isolation ─────────────────────────────────────────────────


class TestCrossClinic:
    def test_clinician_scope_excludes_other_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _, other = _ensure_clinic_and_clinicians()
        # Seed 2 patients in our clinic, 2 in the other.
        _make_patient(client, auth_headers["clinician"], first_name="Mine1")
        _make_patient(client, auth_headers["clinician"], first_name="Mine2")
        _seed_demo_patient(
            clinician_id="actor-clinician-other",
            clinic_id=other,
            notes_demo=False,
        )
        _seed_demo_patient(
            clinician_id="actor-clinician-other",
            clinic_id=other,
            notes_demo=False,
        )
        # Clinician sees only own clinic.
        r = client.get(
            "/api/v1/population-analytics/cohorts/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["cohort_size"] == 2

    def test_admin_sees_all_clinics(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _, other = _ensure_clinic_and_clinicians()
        _make_patient(client, auth_headers["clinician"], first_name="Mine1")
        _seed_demo_patient(
            clinician_id="actor-clinician-other",
            clinic_id=other,
            notes_demo=False,
        )
        r = client.get(
            "/api/v1/population-analytics/cohorts/summary",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200
        assert r.json()["cohort_size"] >= 2


# ── Cohort list — anonymised counts only ───────────────────────────────────


class TestCohortList:
    def test_list_groups_by_demographics(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        _make_patient(
            client, auth_headers["clinician"], first_name="A",
            primary_condition="MDD", primary_modality="TMS", gender="F",
        )
        _make_patient(
            client, auth_headers["clinician"], first_name="B",
            primary_condition="MDD", primary_modality="TMS", gender="F",
        )
        _make_patient(
            client, auth_headers["clinician"], first_name="C",
            primary_condition="GAD", primary_modality="tDCS", gender="M",
        )
        r = client.get(
            "/api/v1/population-analytics/cohorts/list",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        # No PHI fields in cohort row.
        for row in data["items"]:
            assert "first_name" not in row
            assert "last_name" not in row
            assert "email" not in row
            assert "id" not in row or row.get("cohort_key")  # cohort_key only

    def test_demo_flag_on_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        _make_patient(client, auth_headers["clinician"], first_name="Real")
        _seed_demo_patient(clinician_id="actor-clinician-demo")
        r = client.get(
            "/api/v1/population-analytics/cohorts/list",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["has_demo"] is True


# ── Outcomes trend ─────────────────────────────────────────────────────────


class TestOutcomesTrend:
    def test_n_lt_2_buckets_dropped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        # Single patient → no buckets emitted (n < 2 → SE undefined).
        pid = _make_patient(client, auth_headers["clinician"], first_name="Solo")
        cid = _seed_course(patient_id=pid, clinician_id="actor-clinician-demo")
        _seed_outcome(patient_id=pid, course_id=cid, clinician_id="actor-clinician-demo", point="baseline", score=18.0)
        _seed_outcome(patient_id=pid, course_id=cid, clinician_id="actor-clinician-demo", point="post", score=8.0, days_offset=28)
        r = client.get(
            "/api/v1/population-analytics/outcomes/trend",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()
        # Series may exist (with zero buckets) but no fabricated buckets.
        for s in data["series"]:
            for b in s["buckets"]:
                assert b["n_patients"] >= 2

    def test_two_patients_emit_buckets(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        for i in range(2):
            pid = _make_patient(client, auth_headers["clinician"], first_name=f"P{i}")
            cid = _seed_course(patient_id=pid, clinician_id="actor-clinician-demo")
            _seed_outcome(patient_id=pid, course_id=cid, clinician_id="actor-clinician-demo", point="baseline", score=18.0, days_offset=0)
            _seed_outcome(patient_id=pid, course_id=cid, clinician_id="actor-clinician-demo", point="mid", score=12.0, days_offset=7)
        r = client.get(
            "/api/v1/population-analytics/outcomes/trend",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()
        assert any(s["buckets"] for s in data["series"]), "Expected at least one bucket"


# ── Treatment response ─────────────────────────────────────────────────────


class TestTreatmentResponse:
    def test_responder_classification_real_aggregate(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        # Patient improves >= 50% (responder)
        pid_resp = _make_patient(client, auth_headers["clinician"], first_name="Resp")
        cid = _seed_course(patient_id=pid_resp, clinician_id="actor-clinician-demo")
        _seed_outcome(patient_id=pid_resp, course_id=cid, clinician_id="actor-clinician-demo", point="baseline", score=20.0, days_offset=0)
        _seed_outcome(patient_id=pid_resp, course_id=cid, clinician_id="actor-clinician-demo", point="post", score=8.0, days_offset=28)

        # Patient improves < 25% (non-responder)
        pid_nonresp = _make_patient(client, auth_headers["clinician"], first_name="NonResp")
        cid2 = _seed_course(patient_id=pid_nonresp, clinician_id="actor-clinician-demo")
        _seed_outcome(patient_id=pid_nonresp, course_id=cid2, clinician_id="actor-clinician-demo", point="baseline", score=20.0, days_offset=0)
        _seed_outcome(patient_id=pid_nonresp, course_id=cid2, clinician_id="actor-clinician-demo", point="post", score=18.0, days_offset=28)

        r = client.get(
            "/api/v1/population-analytics/treatment-response",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()
        assert data["distributions"], "Expected at least one distribution"
        d0 = data["distributions"][0]
        assert d0["responder_count"] >= 1
        assert d0["non_responder_count"] >= 1
        assert d0["scale"] in ("PHQ-9",)


# ── AE incidence ───────────────────────────────────────────────────────────


class TestAEIncidence:
    def test_per_protocol_real_counts(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        pid = _make_patient(client, auth_headers["clinician"], first_name="AE1")
        cid = _seed_course(patient_id=pid, clinician_id="actor-clinician-demo", protocol_id="tms-mdd-10hz")
        _seed_ae(patient_id=pid, course_id=cid, clinician_id="actor-clinician-demo", severity="mild")
        _seed_ae(patient_id=pid, course_id=cid, clinician_id="actor-clinician-demo", severity="serious", is_serious=True, reportable=True)

        r = client.get(
            "/api/v1/population-analytics/adverse-events/incidence",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()
        proto_rows = data["by_protocol"]
        assert any(row["key"] == "tms-mdd-10hz" and row["ae_count"] == 2 and row["sae_count"] == 1 and row["reportable_count"] == 1 for row in proto_rows)


# ── Exports ────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_demo_prefix_when_any_row_demo(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        _make_patient(client, auth_headers["clinician"], first_name="Real")
        _seed_demo_patient(clinician_id="actor-clinician-demo")
        r = client.get(
            "/api/v1/population-analytics/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.text.startswith("# DEMO"), r.text[:100]
        assert "cohort_key" in r.text
        assert r.headers.get("X-Population-Analytics-Demo-Rows") not in (None, "")

    def test_csv_no_demo_prefix_when_all_real(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        _make_patient(client, auth_headers["clinician"], first_name="Real1")
        _make_patient(client, auth_headers["clinician"], first_name="Real2")
        r = client.get(
            "/api/v1/population-analytics/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert not r.text.startswith("# DEMO"), r.text[:100]

    def test_ndjson_demo_meta_line_when_any_demo(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        _make_patient(client, auth_headers["clinician"], first_name="Real")
        _seed_demo_patient(clinician_id="actor-clinician-demo")
        r = client.get(
            "/api/v1/population-analytics/export.ndjson",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        first_line = r.text.split("\n", 1)[0]
        meta = json.loads(first_line)
        assert meta.get("_meta") == "DEMO"


# ── Audit ingestion ────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_audit_events_persist_with_population_analytics_target(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        body = {
            "event": "view",
            "note": "page mount",
            "filters_json": json.dumps({"condition": "MDD"}),
        }
        r = client.post(
            "/api/v1/population-analytics/audit-events",
            json=body,
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["accepted"] is True

        # Should appear in /api/v1/audit-trail?surface=population_analytics
        r2 = client.get(
            "/api/v1/audit-trail?target_type=population_analytics",
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200, r2.text
        items = r2.json().get("items", [])
        assert any(
            it.get("target_type") == "population_analytics" and it.get("action", "").endswith(".view")
            for it in items
        )

    def test_drill_out_audit_event(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_clinic_and_clinicians()
        body = {
            "event": "chart_drilled_out",
            "cohort_key": "MDD|TMS|26-35|F",
            "drill_out_target_type": "patients_hub",
            "drill_out_target_id": "MDD|TMS|26-35|F",
        }
        r = client.post(
            "/api/v1/population-analytics/audit-events",
            json=body,
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["accepted"] is True
