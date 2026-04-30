"""Tests for the Patient Profile launch-audit hardening (PR 2026-04-30).

Covers the new endpoints in
``apps/api/app/routers/patients_router.py`` for the clinician-facing
Patient Profile page (NOT the patient-facing portal):

* GET    /api/v1/patients/{patient_id}/detail
* GET    /api/v1/patients/{patient_id}/consent-history
* POST   /api/v1/patients/{patient_id}/audit-events
* GET    /api/v1/patients/{patient_id}/audit-events
* GET    /api/v1/patients/{patient_id}/export.csv
* GET    /api/v1/patients/{patient_id}/export.ndjson

Also asserts that the ``patient_profile`` surface is whitelisted by both
``audit_trail_router.KNOWN_SURFACES`` and the qEEG audit-events endpoint
(per the cross-router audit-hook spec).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal


# ── Helpers ────────────────────────────────────────────────────────────────


def _make_patient(client: TestClient, headers: dict, **overrides) -> str:
    body = {
        "first_name": overrides.get("first_name", "Patient"),
        "last_name":  overrides.get("last_name", "ProfileLaunch"),
        "dob":        overrides.get("dob", "1990-04-01"),
        "gender":     overrides.get("gender", "F"),
        "email":      overrides.get(
            "email", f"pp_launch_{datetime.now(timezone.utc).timestamp()}@example.com"
        ),
        "primary_condition": overrides.get("primary_condition", "MDD"),
    }
    r = client.post("/api/v1/patients", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _seed_consent(patient_id: str, *, clinician_id: str = "actor-clinician-demo") -> str:
    from app.persistence.models import ConsentRecord

    db = SessionLocal()
    try:
        rec = ConsentRecord(
            patient_id=patient_id,
            clinician_id=clinician_id,
            consent_type="treatment",
            modality_slug="tms",
            status="active",
            signed=True,
            signed_at=datetime.now(timezone.utc),
            document_ref="consent-v1.pdf",
            notes="ICF v1 signed",
        )
        db.add(rec)
        db.commit()
        return rec.id
    finally:
        db.close()


# ── Surface whitelist sanity ──────────────────────────────────────────────


def test_patient_profile_surface_in_audit_trail_known_surfaces():
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "patient_profile" in KNOWN_SURFACES


def test_patient_profile_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "patient_profile surface whitelist sanity",
        "surface": "patient_profile",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("patient_profile-")


# ── /detail aggregated payload ────────────────────────────────────────────


class TestDetailEndpoint:
    def test_role_gate_guest_forbidden(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients/bogus-id/detail",
            headers=auth_headers["guest"],
        )
        assert r.status_code in (403, 404)

    def test_unknown_patient_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients/does-not-exist/detail",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_detail_envelope_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        pid = _make_patient(client, h)
        r = client.get(f"/api/v1/patients/{pid}/detail", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        # Header
        assert body["header"]["id"] == pid
        assert body["header"]["first_name"] == "Patient"
        assert body["header"]["mrn"]
        assert body["header"]["primary_clinician_id"] == "actor-clinician-demo"
        # Counts default to zero, not None
        c = body["counts"]
        assert c["active_courses"] == 0
        assert c["active_irb_protocols"] == 0
        assert c["active_trials"] == 0
        assert c["consent_records"] == 0
        assert c["adverse_events"] == 0
        assert c["outcome_assessments"] == 0
        # Roll-up flags
        assert body["has_serious_ae"] is False
        assert isinstance(body["disclaimers"], list) and body["disclaimers"]

    def test_detail_emits_audit_view_event(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        pid = _make_patient(client, h)
        # Pull pre-count so we can confirm the GET appended a row.
        events_before = client.get(
            f"/api/v1/patients/{pid}/audit-events", headers=h
        ).json().get("total", 0)
        client.get(f"/api/v1/patients/{pid}/detail", headers=h)
        events_after = client.get(
            f"/api/v1/patients/{pid}/audit-events", headers=h
        ).json()
        # Audit ping must be visible AND attribute to patient_profile surface.
        assert events_after["total"] >= events_before + 1
        actions = {it["action"] for it in events_after["items"]}
        assert "patient_profile.detail.read" in actions


# ── /consent-history append-only ordering ─────────────────────────────────


class TestConsentHistory:
    def test_empty_state_honest(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        pid = _make_patient(client, h)
        r = client.get(f"/api/v1/patients/{pid}/consent-history", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["patient_id"] == pid
        assert body["items"] == []
        assert body["total"] == 0
        assert isinstance(body["disclaimers"], list)

    def test_real_rows_returned_newest_first(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        pid = _make_patient(client, h)
        c1 = _seed_consent(pid)
        c2 = _seed_consent(pid)
        r = client.get(f"/api/v1/patients/{pid}/consent-history", headers=h)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 2
        # Newest first by created_at
        assert items[0]["created_at"] >= items[1]["created_at"]
        # Both rows surface signed_by + status (no fabricated fields)
        for it in items:
            assert it["signed_by"]
            assert it["status"]
            assert it["consent_type"]
        assert {items[0]["id"], items[1]["id"]} == {c1, c2}


# ── audit-events POST + GET round-trip ────────────────────────────────────


def test_audit_events_post_get_round_trip(
    client: TestClient, auth_headers: dict
) -> None:
    h = auth_headers["clinician"]
    pid = _make_patient(client, h)
    initial = client.get(
        f"/api/v1/patients/{pid}/audit-events", headers=h
    )
    assert initial.status_code == 200
    initial_total = initial.json()["total"]

    post = client.post(
        f"/api/v1/patients/{pid}/audit-events",
        json={"event": "view", "note": "page mount"},
        headers=h,
    )
    assert post.status_code == 200, post.text
    body = post.json()
    assert body["accepted"] is True
    assert body["event_id"].startswith("patient_profile-")

    after = client.get(
        f"/api/v1/patients/{pid}/audit-events", headers=h
    )
    assert after.status_code == 200
    after_body = after.json()
    assert after_body["total"] == initial_total + 1
    cd = [it for it in after_body["items"] if it["target_type"] == "patient_profile"]
    assert any(r["action"] == "patient_profile.view" for r in cd)


def test_audit_events_visible_at_global_audit_trail(
    client: TestClient, auth_headers: dict
) -> None:
    """The umbrella /api/v1/audit-trail surface must surface patient_profile rows."""
    h = auth_headers["clinician"]
    pid = _make_patient(client, h)
    r = client.post(
        f"/api/v1/patients/{pid}/audit-events",
        json={"event": "view", "note": "x"},
        headers=h,
    )
    assert r.status_code == 200
    listing = client.get(
        "/api/v1/audit-trail?surface=patient_profile",
        headers=h,
    )
    # The shared audit-trail listing must accept patient_profile as a valid
    # surface filter and return at least the row we just wrote.
    assert listing.status_code == 200, listing.text
    data = listing.json()
    if "items" in data:
        assert any(
            (it.get("surface") == "patient_profile"
             or it.get("target_type") == "patient_profile")
            for it in data["items"]
        )


def test_audit_events_demo_flag_recorded(
    client: TestClient, auth_headers: dict
) -> None:
    h = auth_headers["clinician"]
    pid = _make_patient(client, h)
    r = client.post(
        f"/api/v1/patients/{pid}/audit-events",
        json={"event": "view", "note": "x", "using_demo_data": True},
        headers=h,
    )
    assert r.status_code == 200
    rows = client.get(
        f"/api/v1/patients/{pid}/audit-events", headers=h
    ).json()["items"]
    cd = [it for it in rows if it["target_type"] == "patient_profile"]
    assert any("DEMO" in (it["note"] or "") for it in cd)


# ── exports — DEMO prefix + role gate ─────────────────────────────────────


class TestExports:
    def test_csv_export_envelope(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        pid = _make_patient(client, h)
        r = client.get(f"/api/v1/patients/{pid}/export.csv", headers=h)
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        text = r.text
        # Demo clinic in fixtures → CSV must carry the # DEMO prefix
        # OR the X-Patient-Demo header is "0" (real data fallback).
        assert (
            text.lstrip().startswith("# DEMO")
            or r.headers.get("X-Patient-Demo") == "0"
        )
        # Section header rows are present (patient + courses + adverse_events
        # + audit_events).
        assert "section" in text and "patient" in text
        assert "courses" in text
        assert "adverse_events" in text
        assert "audit_events" in text
        # Patient id appears in body.
        assert pid in text

    def test_ndjson_export_envelope(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        pid = _make_patient(client, h)
        r = client.get(f"/api/v1/patients/{pid}/export.ndjson", headers=h)
        assert r.status_code == 200, r.text
        assert "x-ndjson" in r.headers.get("content-type", "")
        lines = [ln for ln in r.text.splitlines() if ln.strip()]
        assert lines, "ndjson body must have at least one line"
        is_demo = r.headers.get("X-Patient-Demo") == "1"
        if is_demo:
            first = json.loads(lines[0])
            assert first.get("_meta") == "DEMO"
        kinds = {
            json.loads(ln).get("_kind")
            for ln in lines
            if ln.strip().startswith("{")
        }
        assert "patient" in kinds

    def test_exports_require_clinician(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients/anything/export.csv",
            headers=auth_headers["guest"],
        )
        assert r.status_code in (403, 404)


# ── Cross-clinic isolation ────────────────────────────────────────────────


def test_cross_clinic_returns_404_for_clinician(
    client: TestClient, auth_headers: dict
) -> None:
    """A clinician for another clinic must see a 404 (never the row).

    Simulated by reassigning the patient's ``clinician_id`` to a foreign
    actor after creation, so the demo clinician is no longer the owner and
    every patient_profile endpoint returns 404 (not 403).
    """
    h = auth_headers["clinician"]
    pid = _make_patient(client, h)

    db = SessionLocal()
    try:
        from app.persistence.models import Patient as _Patient

        p = db.query(_Patient).filter_by(id=pid).first()
        assert p is not None
        p.clinician_id = "actor-clinician-other"
        db.commit()
    finally:
        db.close()

    for path in (
        f"/api/v1/patients/{pid}/detail",
        f"/api/v1/patients/{pid}/consent-history",
        f"/api/v1/patients/{pid}/audit-events",
        f"/api/v1/patients/{pid}/export.csv",
        f"/api/v1/patients/{pid}/export.ndjson",
    ):
        r = client.get(path, headers=h)
        assert r.status_code == 404, (path, r.status_code)


def test_cross_clinic_admin_sees_200(
    client: TestClient, auth_headers: dict
) -> None:
    """Admins are cross-clinic by design and must see 200 even after the
    patient is reassigned to another clinician."""
    h_clin = auth_headers["clinician"]
    h_admin = auth_headers["admin"]
    pid = _make_patient(client, h_clin)
    db = SessionLocal()
    try:
        from app.persistence.models import Patient as _Patient

        p = db.query(_Patient).filter_by(id=pid).first()
        assert p is not None
        p.clinician_id = "actor-clinician-other"
        db.commit()
    finally:
        db.close()

    r = client.get(f"/api/v1/patients/{pid}/detail", headers=h_admin)
    assert r.status_code == 200, r.text


# ── Schema validation (pause/resume/close not applicable to patient profile;
# ensure the audit endpoint validates the event field length to prevent
# injection of spam audit rows).


def test_audit_event_payload_validation(
    client: TestClient, auth_headers: dict
) -> None:
    h = auth_headers["clinician"]
    pid = _make_patient(client, h)
    # Empty event → 422 (Field min_length=1).
    r = client.post(
        f"/api/v1/patients/{pid}/audit-events",
        json={"event": "", "note": "x"},
        headers=h,
    )
    assert r.status_code == 422
    # Oversized note → 422 (Field max_length=512).
    r = client.post(
        f"/api/v1/patients/{pid}/audit-events",
        json={"event": "view", "note": "x" * 600},
        headers=h,
    )
    assert r.status_code == 422
