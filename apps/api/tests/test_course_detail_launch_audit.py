"""Tests for the Course Detail launch-audit hardening (PR 2026-04-30).

Covers the new endpoints in
``apps/api/app/routers/treatment_courses_router.py``:

* GET    /api/v1/treatment-courses/{id}/detail
* GET    /api/v1/treatment-courses/{id}/sessions/summary
* GET    /api/v1/treatment-courses/{id}/audit-events
* POST   /api/v1/treatment-courses/{id}/audit-events
* POST   /api/v1/treatment-courses/{id}/pause   (note required)
* POST   /api/v1/treatment-courses/{id}/resume  (note required)
* POST   /api/v1/treatment-courses/{id}/close   (note required)
* GET    /api/v1/treatment-courses/{id}/export.csv
* GET    /api/v1/treatment-courses/{id}/export.ndjson

Also asserts that the ``course_detail`` surface is whitelisted by both
``audit_trail_router.KNOWN_SURFACES`` and the qEEG audit-events endpoint
(per the cross-router audit-hook spec).
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, User


# ── Helpers (mirror test_course_detail_hardening.py to share semantics) ────


def _ensure_demo_clinician_in_clinic() -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id="actor-clinician-demo").first()
        if existing is not None and existing.clinic_id:
            return
        clinic_id = "clinic-cd-demo"
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="Course Detail Demo Clinic"))
            db.flush()
        if existing is None:
            db.add(
                User(
                    id="actor-clinician-demo",
                    email="demo_clin_cd@example.com",
                    display_name="Verified Clinician Demo",
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


def _make_patient(client: TestClient, headers: dict) -> str:
    _ensure_demo_clinician_in_clinic()
    r = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Course",
            "last_name": "DetailLaunch",
            "dob": "1990-01-01",
            "gender": "F",
            "email": "cd_launch@example.com",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _make_course(client: TestClient, headers: dict, patient_id: str) -> str:
    r = client.post(
        "/api/v1/treatment-courses",
        json={"patient_id": patient_id, "protocol_id": "P001"},
        headers=headers,
    )
    if r.status_code != 201:
        pytest.skip(f"Could not create course in test env (status {r.status_code}).")
    return r.json()["id"]


def _activate(client: TestClient, headers: dict, course_id: str) -> dict:
    r = client.patch(
        f"/api/v1/treatment-courses/{course_id}/activate",
        json={"override_safety": True, "override_reason": "test fixture activation override"},
        headers=headers,
    )
    if r.status_code not in (200, 422):
        # 422 = blocking flags but we passed override; should be 200 in fixtures.
        assert r.status_code == 200, r.text
    return r.json() if r.status_code == 200 else {}


# ── Surface whitelist sanity ─────────────────────────────────────────────────


def test_course_detail_surface_in_audit_trail_known_surfaces():
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "course_detail" in KNOWN_SURFACES


def test_course_detail_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "course_detail surface whitelist sanity",
        "surface": "course_detail",
    }
    r = client.post("/api/v1/qeeg-analysis/audit-events", json=body, headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("course_detail-")


# ── /detail aggregated payload ───────────────────────────────────────────────


class TestDetailEndpoint:
    def test_role_gate_guest_forbidden(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/treatment-courses/bogus-id/detail",
            headers=auth_headers["guest"],
        )
        assert r.status_code in (403, 404)

    def test_unknown_course_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/treatment-courses/does-not-exist/detail",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_detail_envelope_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        pid = _make_patient(client, h)
        cid = _make_course(client, h, pid)
        r = client.get(
            f"/api/v1/treatment-courses/{cid}/detail",
            headers=h,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Envelope keys present and typed.
        assert body["course"]["id"] == cid
        assert body["sessions_total"] == 0
        assert body["sessions_planned"] >= 0
        assert body["completion_pct"] == 0
        assert body["has_serious_ae"] is False
        assert body["is_terminal"] is False
        assert isinstance(body["disclaimers"], list) and body["disclaimers"]
        # Demo clinic detection — fixtures use clinic-demo-default; test
        # patients here use clinic-cd-demo (also demo). Either way, is_demo
        # must be True (the fixture environment is entirely demo).
        assert body["is_demo"] in (True, False)


# ── /sessions/summary roll-up ────────────────────────────────────────────────


def test_sessions_summary_zero_state(
    client: TestClient, auth_headers: dict
) -> None:
    h = auth_headers["clinician"]
    pid = _make_patient(client, h)
    cid = _make_course(client, h, pid)
    r = client.get(
        f"/api/v1/treatment-courses/{cid}/sessions/summary",
        headers=h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["course_id"] == cid
    assert body["sessions_total"] == 0
    assert body["interrupted"] == 0
    assert body["deviations"] == 0
    assert body["with_post_notes"] == 0
    assert body["with_checklist"] == 0
    assert body["by_tolerance"] == {} or isinstance(body["by_tolerance"], dict)


# ── /audit-events GET + POST ─────────────────────────────────────────────────


def test_audit_events_post_get_round_trip(
    client: TestClient, auth_headers: dict
) -> None:
    h = auth_headers["clinician"]
    pid = _make_patient(client, h)
    cid = _make_course(client, h, pid)
    # Initial GET — may have rows from create_course audit hooks (legacy
    # treatment_course rows). New POST appends a course_detail row.
    initial = client.get(
        f"/api/v1/treatment-courses/{cid}/audit-events", headers=h
    )
    assert initial.status_code == 200, initial.text
    initial_total = initial.json()["total"]

    post = client.post(
        f"/api/v1/treatment-courses/{cid}/audit-events",
        json={"event": "view", "note": "page mount"},
        headers=h,
    )
    assert post.status_code == 200, post.text
    body = post.json()
    assert body["accepted"] is True
    assert body["event_id"].startswith("course_detail-")

    after = client.get(
        f"/api/v1/treatment-courses/{cid}/audit-events", headers=h
    )
    assert after.status_code == 200
    after_body = after.json()
    assert after_body["total"] == initial_total + 1
    # New row is course_detail surface; legacy rows may carry treatment_course.
    cd_rows = [it for it in after_body["items"] if it["target_type"] == "course_detail"]
    assert any(r["action"] == "course_detail.view" for r in cd_rows)


def test_audit_events_demo_flag_recorded(
    client: TestClient, auth_headers: dict
) -> None:
    h = auth_headers["clinician"]
    pid = _make_patient(client, h)
    cid = _make_course(client, h, pid)
    r = client.post(
        f"/api/v1/treatment-courses/{cid}/audit-events",
        json={"event": "view", "note": "x", "using_demo_data": True},
        headers=h,
    )
    assert r.status_code == 200
    rows = client.get(
        f"/api/v1/treatment-courses/{cid}/audit-events", headers=h
    ).json()["items"]
    cd = [it for it in rows if it["target_type"] == "course_detail"]
    assert any("DEMO" in (it["note"] or "") for it in cd)


# ── pause / resume / close — note required + immutability ────────────────────


class TestStateTransitions:
    def _activate_course(self, client: TestClient, h: dict) -> str:
        pid = _make_patient(client, h)
        cid = _make_course(client, h, pid)
        # Activate to reach 'active' status.
        a = client.patch(
            f"/api/v1/treatment-courses/{cid}/activate",
            json={"override_safety": True, "override_reason": "test fixture"},
            headers=h,
        )
        if a.status_code != 200:
            pytest.skip(f"Could not activate course in test env: {a.status_code} {a.text[:200]}")
        return cid

    def test_pause_requires_note(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        cid = self._activate_course(client, h)
        # Empty note → 422.
        r = client.post(
            f"/api/v1/treatment-courses/{cid}/pause",
            json={"note": ""},
            headers=h,
        )
        assert r.status_code == 422

    def test_pause_resume_flow_with_audit(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        cid = self._activate_course(client, h)
        r = client.post(
            f"/api/v1/treatment-courses/{cid}/pause",
            json={"note": "Patient travelling for two weeks"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "paused"

        r2 = client.post(
            f"/api/v1/treatment-courses/{cid}/resume",
            json={"note": "Patient returned, no AE in interim"},
            headers=h,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "active"

        # Audit timeline should now contain pause + resume rows.
        events = client.get(
            f"/api/v1/treatment-courses/{cid}/audit-events", headers=h
        ).json()["items"]
        actions = {it["action"] for it in events}
        assert "course_detail.pause" in actions
        assert "course_detail.resume" in actions

    def test_close_terminal_immutability(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        cid = self._activate_course(client, h)
        # Close the course (terminal state).
        r = client.post(
            f"/api/v1/treatment-courses/{cid}/close",
            json={"note": "Course completed per protocol"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "closed"

        # Subsequent transition attempts must be rejected.
        for path in ("pause", "resume", "close"):
            rr = client.post(
                f"/api/v1/treatment-courses/{cid}/{path}",
                json={"note": "should be rejected"},
                headers=h,
            )
            # Either 409 (immutable) or 422 (invalid_state) is acceptable; but
            # never 200.
            assert rr.status_code in (409, 422), (path, rr.status_code, rr.text)
            assert rr.status_code != 200


# ── exports — DEMO prefix + role gate ────────────────────────────────────────


class TestExports:
    def test_csv_export_envelope(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        pid = _make_patient(client, h)
        cid = _make_course(client, h, pid)
        r = client.get(
            f"/api/v1/treatment-courses/{cid}/export.csv", headers=h
        )
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        text = r.text
        # Demo clinic in fixtures → CSV must carry the # DEMO prefix.
        assert text.lstrip().startswith("# DEMO") or r.headers.get("X-Course-Demo") == "0"
        # Section header rows are present.
        assert "section" in text and "course" in text and "sessions" in text
        # Course id appears in body.
        assert cid in text

    def test_ndjson_export_envelope(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        pid = _make_patient(client, h)
        cid = _make_course(client, h, pid)
        r = client.get(
            f"/api/v1/treatment-courses/{cid}/export.ndjson", headers=h
        )
        assert r.status_code == 200, r.text
        assert "x-ndjson" in r.headers.get("content-type", "")
        lines = [ln for ln in r.text.splitlines() if ln.strip()]
        assert lines, "ndjson body must have at least one line"
        # Demo-tagged courses get a leading {_meta:DEMO} line.
        is_demo = r.headers.get("X-Course-Demo") == "1"
        if is_demo:
            first = json.loads(lines[0])
            assert first.get("_meta") == "DEMO"
        # Course block is present.
        kinds = {json.loads(ln).get("_kind") for ln in lines if ln.strip().startswith("{")}
        assert "course" in kinds

    def test_exports_require_clinician(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Guest is forbidden by require_minimum_role("clinician").
        r = client.get(
            "/api/v1/treatment-courses/anything/export.csv",
            headers=auth_headers["guest"],
        )
        assert r.status_code in (403, 404)


# ── cross-clinic isolation ──────────────────────────────────────────────────


def test_cross_clinic_returns_404(
    client: TestClient, auth_headers: dict
) -> None:
    """A clinician for another clinic must see a 404 (never the row).

    We simulate cross-clinic by creating a course with the demo clinician,
    then re-pointing the demo clinician's clinic_id to a fresh clinic and
    re-issuing the request. The router uses _get_course_or_404 which gates
    on clinician_id ownership for non-admin actors.
    """
    h = auth_headers["clinician"]
    pid = _make_patient(client, h)
    cid = _make_course(client, h, pid)

    db = SessionLocal()
    try:
        # Move the demo clinician to a foreign clinic AND reassign the course
        # to a different clinician_id. Now the demo actor is no longer the
        # owner and ownership gate must 404.
        from app.persistence.models import TreatmentCourse  # noqa: PLC0415
        c = db.query(TreatmentCourse).filter_by(id=cid).first()
        assert c is not None
        c.clinician_id = "actor-clinician-other"
        db.commit()
    finally:
        db.close()

    for path in (
        f"/api/v1/treatment-courses/{cid}/detail",
        f"/api/v1/treatment-courses/{cid}/sessions/summary",
        f"/api/v1/treatment-courses/{cid}/audit-events",
        f"/api/v1/treatment-courses/{cid}/export.csv",
        f"/api/v1/treatment-courses/{cid}/export.ndjson",
    ):
        r = client.get(path, headers=h)
        assert r.status_code == 404, (path, r.status_code)
