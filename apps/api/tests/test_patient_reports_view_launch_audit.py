"""Tests for the Patient Reports view-side launch-audit (PR 2026-05-01).

Third patient-facing surface to receive the launch-audit treatment after
Symptom Journal (#344) and Wellness Hub (#345). Cements the patient-side
audit pattern across three surfaces.

Covers the patient-scope endpoints added to ``apps/api/app/routers/reports_router.py``:

* GET    /api/v1/reports/patient/me                  (list)
* GET    /api/v1/reports/patient/me/summary          (counts)
* GET    /api/v1/reports/{id}/patient-view           (detail + view audit)
* POST   /api/v1/reports/{id}/acknowledge            (patient ack)
* POST   /api/v1/reports/{id}/request-share-back     (note required)
* POST   /api/v1/reports/{id}/start-question         (creates Message thread)
* POST   /api/v1/reports/patient/audit-events        (page audit ingestion)

Plus the cross-router contracts:
* ``patient_reports`` is whitelisted by ``audit_trail_router.KNOWN_SURFACES``.
* ``patient_reports`` is accepted by ``/api/v1/qeeg-analysis/audit-events``.
* Patient-side audit rows surface at ``/api/v1/audit-trail?surface=patient_reports``.
* Existing clinician-side ``reports`` endpoints (PR #310 + Reports Hub launch
  audit) are not regressed.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    ConsentRecord,
    Message,
    Patient,
    PatientMediaUpload,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient_with_consent() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to via email."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-reports-demo",
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
    """Patient who signed and later withdrew consent."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-reports-withdrawn",
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
    """A different patient — used as the cross-patient IDOR target."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-reports-other",
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            email="other-reports@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_report(
    *,
    patient_id: str,
    title: str = "Progress note",
    report_type: str = "clinician",
    uploaded_by: str = "actor-clinician-demo",
    status: str = "generated",
    is_demo: bool = False,
    text_content: str | None = "Body text",
    file_ref: str | None = None,
    deleted: bool = False,
) -> str:
    """Insert a PatientMediaUpload row representing a report. Returns the id."""
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz

    db = SessionLocal()
    try:
        rid = str(_uuid.uuid4())
        meta = {
            "report_type": report_type,
            "title": title,
            "source": "test",
            "report_date": _dt.now(_tz.utc).date().isoformat(),
            "is_demo": is_demo,
            "revision": 1,
        }
        rec = PatientMediaUpload(
            id=rid,
            patient_id=patient_id,
            uploaded_by=uploaded_by,
            media_type="text",
            file_ref=file_ref,
            file_size_bytes=None,
            text_content=text_content,
            patient_note=json.dumps(meta)[:512],
            status=status,
            deleted_at=(_dt.now(_tz.utc) if deleted else None),
        )
        db.add(rec)
        db.commit()
        return rid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_patient_reports_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "patient_reports" in KNOWN_SURFACES


def test_patient_reports_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "patient_reports surface whitelist sanity",
        "surface": "patient_reports",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("patient_reports-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_can_list_own_reports(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        _seed_report(patient_id=demo_patient_with_consent.id, title="A")
        r = client.get(
            "/api/v1/reports/patient/me", headers=auth_headers["patient"]
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 1
        assert data["consent_active"] is True
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]

    def test_clinician_calling_patient_scope_endpoint_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        _seed_report(patient_id=demo_patient_with_consent.id)
        # Clinician must use /api/v1/reports (the existing list endpoint),
        # not the patient-scope one. Patient-scope returns 404 cross-role to
        # avoid even hinting that the URL exists outside patient scope.
        r = client.get(
            "/api/v1/reports/patient/me", headers=auth_headers["clinician"]
        )
        assert r.status_code == 404, r.text

    def test_admin_calling_patient_scope_endpoint_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Admins also use the clinician-side list with patient_id filter, not
        # the patient-scope endpoint.
        r = client.get(
            "/api/v1/reports/patient/me", headers=auth_headers["admin"]
        )
        assert r.status_code == 404, r.text

    def test_guest_cannot_list_patient_reports(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/reports/patient/me", headers=auth_headers["guest"]
        )
        # Guest is rejected by FastAPI auth gate before reaching the
        # patient role check; either 401 or 403 is acceptable. 404 is also
        # accepted as long as it is NOT 200.
        assert r.status_code in (401, 403, 404), r.text


# ── Cross-patient isolation (IDOR) ──────────────────────────────────────────


class TestCrossPatientIsolation:
    def test_patient_cannot_view_another_patients_report(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        rid_other = _seed_report(
            patient_id=other_patient.id, title="Not yours"
        )
        r = client.get(
            f"/api/v1/reports/{rid_other}/patient-view",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404
        # Acknowledge / share-back / question all 404 for cross-patient too.
        r = client.post(
            f"/api/v1/reports/{rid_other}/acknowledge",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404
        r = client.post(
            f"/api/v1/reports/{rid_other}/request-share-back",
            json={"audience": "GP", "note": "please send"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404
        r = client.post(
            f"/api/v1/reports/{rid_other}/start-question",
            json={"question": "what is this?"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404

    def test_soft_deleted_report_404s_for_patient(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_report(
            patient_id=demo_patient_with_consent.id, deleted=True
        )
        r = client.get(
            f"/api/v1/reports/{rid}/patient-view",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404


# ── Patient-view auto-emits audit ───────────────────────────────────────────


class TestPatientViewAudit:
    def test_view_emits_audit_row(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_report(patient_id=demo_patient_with_consent.id)
        r = client.get(
            f"/api/v1/reports/{rid}/patient-view",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == rid

        listing = client.get(
            "/api/v1/audit-trail?surface=patient_reports",
            headers=auth_headers["admin"],
        )
        assert listing.status_code == 200
        items = listing.json()["items"]
        actions = {it.get("action") for it in items}
        assert "patient_reports.report_viewed" in actions

    def test_consecutive_views_each_emit_audit_row_dedup_view_stamp(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Choice (documented): consecutive views in the dedup window each
        # emit a fresh audit row (regulator-friendly — they can see every
        # open). The per-record patient_views stamp list is deduped to keep
        # the JSON blob compact, but the umbrella audit_events table is
        # the canonical history.
        rid = _seed_report(patient_id=demo_patient_with_consent.id)
        for _ in range(3):
            r = client.get(
                f"/api/v1/reports/{rid}/patient-view",
                headers=auth_headers["patient"],
            )
            assert r.status_code == 200
        listing = client.get(
            "/api/v1/audit-trail?surface=patient_reports",
            headers=auth_headers["admin"],
        ).json()["items"]
        view_rows = [
            it
            for it in listing
            if it.get("action") == "patient_reports.report_viewed"
        ]
        assert len(view_rows) >= 3, (
            "consecutive views should each emit a fresh audit row even when "
            "the per-record view stamp is deduped"
        )


# ── Acknowledge ─────────────────────────────────────────────────────────────


class TestAcknowledge:
    def test_acknowledge_creates_clinician_visible_audit_row(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_report(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/reports/{rid}/acknowledge",
            json={"note": "got it, thanks"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["report_id"] == rid
        assert body["acknowledged_at"]

        listing = client.get(
            "/api/v1/audit-trail?surface=patient_reports",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in listing}
        assert "patient_reports.report_acknowledged" in actions
        assert "patient_reports.report_acknowledged_to_clinician" in actions
        assert any(
            (
                it.get("action")
                == "patient_reports.report_acknowledged_to_clinician"
                and it.get("target_id") == "actor-clinician-demo"
            )
            for it in listing
        )

    def test_acknowledge_is_idempotent(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_report(patient_id=demo_patient_with_consent.id)
        r1 = client.post(
            f"/api/v1/reports/{rid}/acknowledge",
            json={},
            headers=auth_headers["patient"],
        ).json()
        r2 = client.post(
            f"/api/v1/reports/{rid}/acknowledge",
            json={},
            headers=auth_headers["patient"],
        ).json()
        assert r1["acknowledged_at"] == r2["acknowledged_at"]


# ── Share-back ──────────────────────────────────────────────────────────────


class TestShareBack:
    def test_share_back_requires_note(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_report(patient_id=demo_patient_with_consent.id)
        # Missing note → 422 (Pydantic validation).
        r = client.post(
            f"/api/v1/reports/{rid}/request-share-back",
            json={"audience": "GP"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422

    def test_share_back_with_audience_and_note_emits_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_report(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/reports/{rid}/request-share-back",
            json={
                "audience": "GP",
                "note": "Please send a copy to my GP",
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["audience"] == "GP"

        listing = client.get(
            "/api/v1/audit-trail?surface=patient_reports",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in listing}
        assert "patient_reports.report_share_back_requested" in actions

        # Subsequent list shows share_back_pending=True
        r = client.get(
            "/api/v1/reports/patient/me",
            headers=auth_headers["patient"],
        )
        items = r.json()["items"]
        match = next((it for it in items if it["id"] == rid), None)
        assert match is not None
        assert match["share_back_pending"] is True


# ── Start question (creates Message thread) ─────────────────────────────────


class TestStartQuestion:
    def test_start_question_creates_message_thread(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_report(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/reports/{rid}/start-question",
            json={"question": "What does the PHQ-9 trend mean for me?"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["report_id"] == rid
        assert body["thread_id"] == f"report-{rid}"
        assert body["message_id"]

        # The Message row was actually persisted.
        db = SessionLocal()
        try:
            msg = db.query(Message).filter_by(id=body["message_id"]).first()
            assert msg is not None
            assert msg.thread_id == f"report-{rid}"
            assert msg.patient_id == demo_patient_with_consent.id
            assert msg.recipient_id == "actor-clinician-demo"
            assert msg.category == "report-question"
        finally:
            db.close()

        # Audit row is emitted on the patient_reports surface.
        listing = client.get(
            "/api/v1/audit-trail?surface=patient_reports",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in listing}
        assert "patient_reports.report_question_started" in actions


# ── Consent-revoked ─────────────────────────────────────────────────────────


class TestConsentRevoked:
    def test_consent_revoked_blocks_acknowledge(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        rid = _seed_report(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/reports/{rid}/acknowledge",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403
        assert r.json().get("code") == "consent_inactive"

    def test_consent_revoked_blocks_share_back(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        rid = _seed_report(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/reports/{rid}/request-share-back",
            json={"audience": "GP", "note": "send copy"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403
        assert r.json().get("code") == "consent_inactive"

    def test_consent_revoked_blocks_start_question(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        rid = _seed_report(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/reports/{rid}/start-question",
            json={"question": "huh?"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403
        assert r.json().get("code") == "consent_inactive"

    def test_consent_revoked_still_allows_read(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        _seed_report(patient_id=demo_patient_consent_withdrawn.id)
        r = client.get(
            "/api/v1/reports/patient/me",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["consent_active"] is False
        assert body["total"] == 1


# ── Summary ─────────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_unread_acknowledged_signed(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid_a = _seed_report(
            patient_id=demo_patient_with_consent.id,
            title="A",
            status="signed",
        )
        rid_b = _seed_report(
            patient_id=demo_patient_with_consent.id, title="B"
        )
        rid_c = _seed_report(
            patient_id=demo_patient_with_consent.id, title="C"
        )
        # Acknowledge B
        client.post(
            f"/api/v1/reports/{rid_b}/acknowledge",
            json={},
            headers=auth_headers["patient"],
        )

        r = client.get(
            "/api/v1/reports/patient/me/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["total"] == 3
        assert s["acknowledged"] == 1
        # signed_by_clinician counts rid_a (status=signed)
        assert s["signed_by_clinician"] >= 1
        # Unread counts reports the actor hasn't acknowledged or viewed:
        # rid_a (no view, no ack), rid_c (no view, no ack). rid_b is
        # acknowledged so it's read.
        assert s["unread"] == 2
        assert s["consent_active"] is True
        assert "clinician" in s["by_type"]


# ── Audit-event ingestion ───────────────────────────────────────────────────


class TestAuditIngestion:
    def test_post_audit_event_visible_at_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/reports/patient/audit-events",
            json={"event": "view", "note": "page mount"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("patient_reports-")

        listing = client.get(
            "/api/v1/audit-trail?surface=patient_reports",
            headers=auth_headers["admin"],
        ).json()
        assert any(
            (
                it.get("target_type") == "patient_reports"
                or it.get("surface") == "patient_reports"
            )
            for it in listing.get("items", [])
        )

    def test_clinician_cannot_post_patient_reports_audit_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/reports/patient/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_audit_event_with_cross_patient_report_id_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        rid_other = _seed_report(patient_id=other_patient.id)
        r = client.post(
            "/api/v1/reports/patient/audit-events",
            json={"event": "report_opened", "report_id": rid_other},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404


# ── Existing clinician-side endpoints not regressed ────────────────────────


class TestClinicianRegression:
    def test_clinician_list_endpoint_still_works(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Seed via the clinician-side create endpoint.
        r = client.post(
            "/api/v1/reports",
            json={
                "patient_id": demo_patient_with_consent.id,
                "type": "clinician",
                "title": "Clinician-side check",
                "content": "hello",
                "status": "generated",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201, r.text
        rid = r.json()["id"]

        # Clinician list still works.
        r = client.get(
            "/api/v1/reports", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200
        ids = [it["id"] for it in r.json()["items"]]
        assert rid in ids

        # Clinician summary still works.
        r = client.get(
            "/api/v1/reports/summary", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200
        assert r.json()["total"] >= 1


# ── Cleanup ─────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _cleanup_reports_tables() -> None:
    yield
    db = SessionLocal()
    try:
        db.query(Message).delete()
        db.query(PatientMediaUpload).delete()
        db.query(ConsentRecord).delete()
        db.query(Patient).delete()
        db.commit()
    finally:
        db.close()
