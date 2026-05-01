"""Tests for the Patient Wellness Hub launch-audit (PR 2026-05-01).

Second patient-facing surface to receive the launch-audit treatment.
Mirrors :mod:`tests.test_symptom_journal_launch_audit` so the two
patient-side surfaces present a consistent audit shape.

Covers the full router contract:

* GET    /api/v1/wellness/checkins
* GET    /api/v1/wellness/summary
* GET    /api/v1/wellness/checkins/{id}
* POST   /api/v1/wellness/checkins
* PATCH  /api/v1/wellness/checkins/{id}
* DELETE /api/v1/wellness/checkins/{id}
* POST   /api/v1/wellness/checkins/{id}/share
* GET    /api/v1/wellness/export.csv
* GET    /api/v1/wellness/export.ndjson
* POST   /api/v1/wellness/audit-events

Plus the cross-router contracts:
* `wellness_hub` is whitelisted by ``audit_trail_router.KNOWN_SURFACES``.
* `wellness_hub` is accepted by ``/api/v1/qeeg-analysis/audit-events``.
* Patient-facing audit rows surface at ``/api/v1/audit-trail?surface=wellness_hub``.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import ConsentRecord, Patient, WellnessCheckin


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient_with_consent() -> Patient:
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-wellness-demo",
            clinician_id="actor-clinician-demo",
            first_name="Jane",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
            notes=None,
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


@pytest.fixture
def demo_patient_consent_withdrawn() -> Patient:
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-wellness-withdrawn",
            clinician_id="actor-clinician-demo",
            first_name="Withdrawn",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
            notes=None,
        )
        db.add(patient)
        db.add(
            ConsentRecord(
                patient_id=patient.id,
                clinician_id="actor-clinician-demo",
                consent_type="participation",
                status="withdrawn",
            )
        )
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


@pytest.fixture
def other_patient() -> Patient:
    """A Patient row used as the cross-patient IDOR target."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-other-clinic-w",
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            email="other-wellness@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


# ── Surface whitelist sanity ──────────────────────────────────────────────


def test_wellness_hub_surface_in_audit_trail_known_surfaces():
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "wellness_hub" in KNOWN_SURFACES


def test_wellness_hub_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "wellness_hub surface whitelist sanity",
        "surface": "wellness_hub",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("wellness_hub-")


# ── Role gate ─────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_role_can_list_checkins(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/wellness/checkins",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert body["consent_active"] is True
        assert isinstance(body["disclaimers"], list) and body["disclaimers"]

    def test_clinician_without_share_cannot_list(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/wellness/checkins",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403, r.text
        body = r.json()
        assert body.get("code") == "patient_role_required"

    def test_guest_cannot_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/wellness/checkins",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_admin_requires_explicit_patient_id(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r0 = client.get(
            "/api/v1/wellness/checkins",
            headers=auth_headers["admin"],
        )
        assert r0.status_code == 400
        r1 = client.get(
            f"/api/v1/wellness/checkins?patient_id={demo_patient_with_consent.id}",
            headers=auth_headers["admin"],
        )
        assert r1.status_code == 200


# ── Cross-patient isolation (IDOR) ────────────────────────────────────────


class TestCrossPatientIsolation:
    def test_patient_cannot_view_another_patients_checkins_via_path(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        db = SessionLocal()
        try:
            db.add(
                WellnessCheckin(
                    id="checkin-other",
                    patient_id=other_patient.id,
                    author_actor_id="actor-other",
                    mood=4,
                    note="not for the demo patient",
                    tags=None,
                )
            )
            db.commit()
        finally:
            db.close()

        r = client.get(
            "/api/v1/wellness/checkins/checkin-other",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404

        r2 = client.get(
            f"/api/v1/wellness/checkins?patient_id={other_patient.id}",
            headers=auth_headers["patient"],
        )
        assert r2.status_code == 404


# ── Create / list / detail ────────────────────────────────────────────────


class TestCheckinCreate:
    def test_create_checkin_stamps_demo_and_emits_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=demo_patient_with_consent.id).first()
            p.notes = "[DEMO] seeded sample"
            db.commit()
        finally:
            db.close()

        body = {
            "mood": 6, "energy": 5, "sleep": 7, "anxiety": 3, "focus": 6, "pain": 2,
            "note": "Decent day — slept ok",
            "tags": ["work_stress", "exercise"],
        }
        r = client.post(
            "/api/v1/wellness/checkins",
            json=body,
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        e = r.json()
        assert e["mood"] == 6
        assert e["energy"] == 5
        assert e["sleep"] == 7
        assert e["anxiety"] == 3
        assert e["focus"] == 6
        assert e["pain"] == 2
        assert sorted(e["tags"]) == ["exercise", "work_stress"]
        assert e["is_demo"] is True
        assert e["author_actor_id"] == "actor-patient-demo"

        listing = client.get(
            "/api/v1/audit-trail?surface=wellness_hub",
            headers=auth_headers["admin"],
        )
        assert listing.status_code == 200
        items = listing.json()["items"]
        actions = {it.get("action") for it in items}
        assert "wellness_hub.checkin_logged" in actions
        assert any("DEMO" in (it.get("note") or "") for it in items)

    def test_create_checkin_requires_meaningful_payload(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/wellness/checkins",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422
        body = r.json()
        assert body.get("code") == "empty_wellness_checkin"

    def test_create_checkin_axis_only_payload_succeeds(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Single-axis check-in (just pain) must be accepted — partial
        # check-ins are explicitly supported.
        r = client.post(
            "/api/v1/wellness/checkins",
            json={"pain": 8},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text


# ── Consent-revoked ───────────────────────────────────────────────────────


class TestConsentRevoked:
    def test_consent_withdrawn_blocks_create(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/wellness/checkins",
            json={"mood": 5, "note": "after withdrawal"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403
        body = r.json()
        assert body.get("code") == "consent_inactive"

    def test_consent_withdrawn_still_allows_read(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        db = SessionLocal()
        try:
            db.add(
                WellnessCheckin(
                    id="checkin-pre-withdrawal",
                    patient_id=demo_patient_consent_withdrawn.id,
                    author_actor_id="actor-patient-demo",
                    mood=5,
                    note="pre",
                    tags=None,
                )
            )
            db.commit()
        finally:
            db.close()

        r = client.get(
            "/api/v1/wellness/checkins",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["consent_active"] is False
        assert body["total"] == 1


# ── Edit / soft-delete ────────────────────────────────────────────────────


class TestEditAndSoftDelete:
    def test_edit_increments_revision_and_emits_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        created = client.post(
            "/api/v1/wellness/checkins",
            json={"mood": 5, "note": "first"},
            headers=auth_headers["patient"],
        ).json()
        checkin_id = created["id"]
        r = client.patch(
            f"/api/v1/wellness/checkins/{checkin_id}",
            json={"mood": 7, "note": "first (revised)"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["mood"] == 7
        assert body["note"] == "first (revised)"
        assert body["revision_count"] == 1
        listing = client.get(
            "/api/v1/audit-trail?surface=wellness_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in listing}
        assert "wellness_hub.checkin_edited" in actions

    def test_edit_other_authors_checkin_returns_403(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        db = SessionLocal()
        try:
            db.add(
                WellnessCheckin(
                    id="checkin-other-author",
                    patient_id=demo_patient_with_consent.id,
                    author_actor_id="some-other-actor",
                    mood=4,
                    note="not yours",
                )
            )
            db.commit()
        finally:
            db.close()

        r = client.patch(
            "/api/v1/wellness/checkins/checkin-other-author",
            json={"mood": 5},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_soft_delete_preserves_row_and_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        created = client.post(
            "/api/v1/wellness/checkins",
            json={"mood": 5, "note": "to delete"},
            headers=auth_headers["patient"],
        ).json()
        checkin_id = created["id"]

        r = client.request(
            "DELETE",
            f"/api/v1/wellness/checkins/{checkin_id}",
            json={"reason": "logged by mistake"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["deleted_at"] is not None
        assert body["delete_reason"] == "logged by mistake"

        listing = client.get(
            "/api/v1/wellness/checkins",
            headers=auth_headers["patient"],
        ).json()
        assert all(it["id"] != checkin_id for it in listing["items"])

        listing_full = client.get(
            "/api/v1/wellness/checkins?include_deleted=true",
            headers=auth_headers["patient"],
        ).json()
        assert any(it["id"] == checkin_id for it in listing_full["items"])

        detail = client.get(
            f"/api/v1/wellness/checkins/{checkin_id}",
            headers=auth_headers["patient"],
        )
        assert detail.status_code == 200
        assert detail.json()["deleted_at"] is not None

        audit_rows = client.get(
            "/api/v1/audit-trail?surface=wellness_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit_rows}
        assert "wellness_hub.checkin_deleted" in actions

    def test_soft_delete_requires_reason(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        created = client.post(
            "/api/v1/wellness/checkins",
            json={"mood": 5, "note": "to delete"},
            headers=auth_headers["patient"],
        ).json()
        r = client.request(
            "DELETE",
            f"/api/v1/wellness/checkins/{created['id']}",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422


# ── Share ─────────────────────────────────────────────────────────────────


class TestShare:
    def test_share_emits_clinician_visible_audit_row(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        created = client.post(
            "/api/v1/wellness/checkins",
            json={"mood": 2, "anxiety": 9, "note": "really rough day"},
            headers=auth_headers["patient"],
        ).json()
        checkin_id = created["id"]
        r = client.post(
            f"/api/v1/wellness/checkins/{checkin_id}/share",
            json={"note": "want care team to see this"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["checkin_id"] == checkin_id
        assert body["shared_with"] == "actor-clinician-demo"

        admin_rows = client.get(
            "/api/v1/audit-trail?surface=wellness_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in admin_rows}
        assert "wellness_hub.checkin_shared" in actions
        assert "wellness_hub.checkin_shared_to_clinician" in actions
        assert any(
            (it.get("action") == "wellness_hub.checkin_shared_to_clinician"
             and it.get("target_id") == "actor-clinician-demo")
            for it in admin_rows
        )


# ── Exports ──────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_demo_filename(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=demo_patient_with_consent.id).first()
            p.notes = "[DEMO]"
            db.commit()
        finally:
            db.close()

        client.post(
            "/api/v1/wellness/checkins",
            json={"mood": 5, "note": "hi"},
            headers=auth_headers["patient"],
        )
        r = client.get(
            "/api/v1/wellness/export.csv",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-wellness_checkins.csv" in cd
        assert r.headers.get("X-Wellness-Demo") == "1"

    def test_ndjson_export_demo_filename_via_demo_clinic(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Demo clinic flags is_demo=True via _patient_is_demo (clinic-demo-default).
        client.post(
            "/api/v1/wellness/checkins",
            json={"mood": 4, "note": "hi"},
            headers=auth_headers["patient"],
        )
        r = client.get(
            "/api/v1/wellness/export.ndjson",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "wellness_checkins.ndjson" in cd
        assert r.headers.get("X-Wellness-Demo") == "1"


# ── Audit ingestion ──────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_audit_event_post_visible_at_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/wellness/audit-events",
            json={"event": "view", "note": "page mount"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("wellness_hub-")
        listing = client.get(
            "/api/v1/audit-trail?surface=wellness_hub",
            headers=auth_headers["admin"],
        ).json()
        assert any(
            (it.get("target_type") == "wellness_hub"
             or it.get("surface") == "wellness_hub")
            for it in listing.get("items", [])
        )

    def test_clinician_cannot_post_wellness_audit_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/wellness/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403


# ── Summary ──────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_returns_counts_axes_and_demo_flag(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        for mood, anxiety in ((2, 8), (5, 5), (8, 2)):
            client.post(
                "/api/v1/wellness/checkins",
                json={
                    "mood": mood, "anxiety": anxiety,
                    "note": f"m{mood}a{anxiety}", "tags": ["sleep"],
                },
                headers=auth_headers["patient"],
            )
        r = client.get(
            "/api/v1/wellness/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["checkins_7d"] == 3
        assert body["axes_avg_7d"]["mood"] == 5.0
        assert body["axes_avg_7d"]["anxiety"] == 5.0
        # axes for which no values were submitted return None
        assert body["axes_avg_7d"]["pain"] is None
        assert any(t["tag"] == "sleep" for t in body["top_tags_30d"])
        assert body["consent_active"] is True
        # missed-days bounded — with a check-in today we miss <= 6 of last 7.
        assert body["missed_days_7d"] <= 6


# ── Free-form Patient cleanup hook ────────────────────────────────────────


@pytest.fixture(autouse=True)
def _cleanup_wellness_table() -> None:
    yield
    db = SessionLocal()
    try:
        db.query(WellnessCheckin).delete()
        db.query(ConsentRecord).delete()
        db.query(Patient).delete()
        db.commit()
    finally:
        db.close()
