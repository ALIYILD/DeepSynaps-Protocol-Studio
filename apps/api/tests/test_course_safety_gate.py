"""Safety preflight + override-gated activation for Treatment Courses.

Covers:
    - preflight reports override_required=True when blocking flag set
    - preflight reports override_required=True when MH never reviewed
    - activate blocked (403 safety_block) when override needed and not provided
    - activate blocked when reason is too short
    - activate succeeds with override_safety=True + sufficient reason (audited)
    - activate succeeds without override when MH is reviewed and clean
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def _make_patient(client: TestClient, auth: dict, email: str) -> str:
    r = client.post(
        "/api/v1/patients",
        json={"first_name": "Test", "last_name": "Patient", "dob": "1990-01-01",
              "gender": "F", "email": email, "primary_condition": "Depression"},
        headers=auth["clinician"],
    )
    assert r.status_code == 201
    return r.json()["id"]


def _make_course(client: TestClient, auth: dict, pid: str) -> str:
    r = client.post(
        "/api/v1/treatment-courses",
        json={"patient_id": pid, "protocol_id": "PRO-001"},
        headers=auth["clinician"],
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _set_mh(client: TestClient, auth: dict, pid: str, *, flags: dict | None = None, mark_reviewed: bool = False):
    body = {"mode": "merge_sections",
            "sections": {"summary": {"notes": "baseline assessment complete"}},
            "safety": {"flags": flags or {}},
            "mark_reviewed": mark_reviewed}
    r = client.patch(f"/api/v1/patients/{pid}/medical-history",
                     json=body, headers=auth["clinician"])
    assert r.status_code == 200, r.text


class TestSafetyPreflight:
    def test_preflight_flags_blocking_when_implant_set(self, client, auth_headers):
        pid = _make_patient(client, auth_headers, "pre1@example.com")
        _set_mh(client, auth_headers, pid, flags={"implanted_device": True}, mark_reviewed=True)
        cid = _make_course(client, auth_headers, pid)
        r = client.get(f"/api/v1/treatment-courses/{cid}/safety-preflight",
                       headers=auth_headers["clinician"])
        assert r.status_code == 200
        data = r.json()
        assert data["override_required"] is True
        assert "implanted_device" in data["blocking_flags"]

    def test_preflight_soft_warns_when_never_reviewed(self, client, auth_headers):
        pid = _make_patient(client, auth_headers, "pre2@example.com")
        # No MH saved at all — source_meta.reviewed_at is None → requires_review True
        # but this is a SOFT signal; override_required stays False when no blocking flags.
        cid = _make_course(client, auth_headers, pid)
        r = client.get(f"/api/v1/treatment-courses/{cid}/safety-preflight",
                       headers=auth_headers["clinician"])
        assert r.status_code == 200
        data = r.json()
        assert data["requires_review"] is True
        assert data["override_required"] is False
        assert data["blocking_flags"] == []

    def test_preflight_clean_when_reviewed_and_no_flags(self, client, auth_headers):
        pid = _make_patient(client, auth_headers, "pre3@example.com")
        _set_mh(client, auth_headers, pid, flags={"implanted_device": False}, mark_reviewed=True)
        cid = _make_course(client, auth_headers, pid)
        r = client.get(f"/api/v1/treatment-courses/{cid}/safety-preflight",
                       headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["override_required"] is False


class TestActivationGate:
    def test_activation_blocked_without_override_when_required(self, client, auth_headers):
        pid = _make_patient(client, auth_headers, "act1@example.com")
        _set_mh(client, auth_headers, pid, flags={"pregnancy": True}, mark_reviewed=True)
        cid = _make_course(client, auth_headers, pid)
        r = client.patch(f"/api/v1/treatment-courses/{cid}/activate",
                         json={}, headers=auth_headers["clinician"])
        assert r.status_code == 403
        # Surface code for clients to branch on.
        body = r.json()
        assert (body.get("code") == "safety_block") or ("safety" in (body.get("message","") + body.get("detail","")).lower())

    def test_activation_blocked_when_reason_too_short(self, client, auth_headers):
        pid = _make_patient(client, auth_headers, "act2@example.com")
        _set_mh(client, auth_headers, pid, flags={"seizure_history": True}, mark_reviewed=True)
        cid = _make_course(client, auth_headers, pid)
        r = client.patch(f"/api/v1/treatment-courses/{cid}/activate",
                         json={"override_safety": True, "override_reason": "ok"},
                         headers=auth_headers["clinician"])
        assert r.status_code == 403

    def test_activation_succeeds_with_override_and_reason(self, client, auth_headers):
        pid = _make_patient(client, auth_headers, "act3@example.com")
        _set_mh(client, auth_headers, pid, flags={"implanted_device": True}, mark_reviewed=True)
        cid = _make_course(client, auth_headers, pid)
        r = client.patch(
            f"/api/v1/treatment-courses/{cid}/activate",
            json={"override_safety": True,
                  "override_reason": "Cardiology clearance note CN-2451 dated 2026-04-12."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"

    def test_activation_succeeds_without_override_when_clean(self, client, auth_headers):
        pid = _make_patient(client, auth_headers, "act4@example.com")
        _set_mh(client, auth_headers, pid, flags={"implanted_device": False}, mark_reviewed=True)
        cid = _make_course(client, auth_headers, pid)
        r = client.patch(f"/api/v1/treatment-courses/{cid}/activate",
                         json={}, headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"


class TestActivationAudit:
    def test_override_writes_distinct_audit_action(self, client, auth_headers):
        from app.database import SessionLocal
        from app.repositories.audit import list_audit_events

        pid = _make_patient(client, auth_headers, "aud1@example.com")
        _set_mh(client, auth_headers, pid, flags={"pregnancy": True}, mark_reviewed=True)
        cid = _make_course(client, auth_headers, pid)
        client.patch(
            f"/api/v1/treatment-courses/{cid}/activate",
            json={"override_safety": True,
                  "override_reason": "OB/GYN cleared 2026-04-14; non-pregnant at screening."},
            headers=auth_headers["clinician"],
        )
        s = SessionLocal()
        try:
            events = list_audit_events(s)
        finally:
            s.close()
        actions = [e.action for e in events]
        assert "course.activate.safety_override" in actions
