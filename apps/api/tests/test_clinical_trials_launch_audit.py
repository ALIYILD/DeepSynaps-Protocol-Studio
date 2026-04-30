"""Tests for the Clinical Trials launch-audit hardening (2026-04-30).

Covers the new clinical-trial register endpoints in
``apps/api/app/routers/clinical_trials_router.py``:

* GET    /api/v1/clinical-trials/trials                       (filters)
* GET    /api/v1/clinical-trials/trials/summary
* GET    /api/v1/clinical-trials/trials/export.csv
* GET    /api/v1/clinical-trials/trials/export.ndjson
* GET    /api/v1/clinical-trials/trials/{id}
* POST   /api/v1/clinical-trials/trials
* PATCH  /api/v1/clinical-trials/trials/{id}
* POST   /api/v1/clinical-trials/trials/{id}/pause
* POST   /api/v1/clinical-trials/trials/{id}/resume
* POST   /api/v1/clinical-trials/trials/{id}/close
* POST   /api/v1/clinical-trials/trials/{id}/enrollments
* POST   /api/v1/clinical-trials/trials/{id}/enrollments/{eid}/withdraw
* POST   /api/v1/clinical-trials/trials/audit-events

Cross-cutting checks: clinic-isolation, role gate, immutability of
closed trials, real-IRBProtocol FK enforcement, real-User PI enforcement,
real-Patient enrolment + cross-clinic gate, withdrawal-reason requirement,
demo-flag prefixing exports, and audit-event surface attribution to the
new ``clinical_trials`` whitelist.
"""
from __future__ import annotations

import csv
import io
import json
import uuid

import pytest
from fastapi.testclient import TestClient


# ── Helpers ──────────────────────────────────────────────────────────────────


def _seed_irb_protocol(
    *,
    clinic_id: str | None = "clinic-demo-default",
    pi_user_id: str = "actor-clinician-demo",
    status: str = "active",
    protocol_code: str = "DS-TR-2026-001",
) -> str:
    """Seed an IRB protocol so trials can FK to it."""
    from app.database import SessionLocal
    from app.persistence.models import IRBProtocol

    db = SessionLocal()
    try:
        proto_id = str(uuid.uuid4())
        db.add(
            IRBProtocol(
                id=proto_id,
                clinic_id=clinic_id,
                protocol_code=protocol_code,
                title="Theta Burst TMS for TRD: Pilot RCT",
                description="Sample seeded IRB protocol for clinical trial testing.",
                pi_user_id=pi_user_id,
                phase="ii",
                status=status,
                created_by=pi_user_id,
            )
        )
        db.commit()
        return proto_id
    finally:
        db.close()


def _seed_patient(
    *,
    clinician_id: str = "actor-clinician-demo",
    first_name: str = "Trial",
    last_name: str = "Patient",
) -> str:
    from app.database import SessionLocal
    from app.persistence.models import Patient

    db = SessionLocal()
    try:
        pid = str(uuid.uuid4())
        db.add(
            Patient(
                id=pid,
                clinician_id=clinician_id,
                first_name=first_name,
                last_name=last_name,
            )
        )
        db.commit()
        return pid
    finally:
        db.close()


@pytest.fixture
def proto_id() -> str:
    return _seed_irb_protocol()


@pytest.fixture
def patient_id() -> str:
    return _seed_patient()


def _create(
    client: TestClient,
    headers: dict,
    *,
    title: str = "Theta Burst TMS for TRD",
    irb_protocol_id: str,
    pi_user_id: str = "actor-clinician-demo",
    phase: str = "ii",
    status: str = "planning",
    nct_number: str | None = "NCT99999999",
    sponsor: str | None = "DeepSynaps Research",
    sites: list | None = None,
    enrollment_target: int | None = 24,
    description: str = "",
    is_demo: bool = False,
) -> dict:
    body = {
        "title": title,
        "irb_protocol_id": irb_protocol_id,
        "pi_user_id": pi_user_id,
        "phase": phase,
        "status": status,
        "nct_number": nct_number,
        "sponsor": sponsor,
        "sites": sites if sites is not None else [{"name": "Main Site"}],
        "enrollment_target": enrollment_target,
        "description": description,
        "is_demo": is_demo,
    }
    body = {k: v for k, v in body.items() if v is not None}
    resp = client.post("/api/v1/clinical-trials/trials", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Role gating ──────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_forbidden(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get(
            "/api/v1/clinical-trials/trials", headers=auth_headers["guest"]
        )
        assert resp.status_code == 403
        assert resp.json()["code"] == "insufficient_role"

    def test_patient_forbidden(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get(
            "/api/v1/clinical-trials/trials", headers=auth_headers["patient"]
        )
        assert resp.status_code == 403

    def test_clinician_allowed(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get(
            "/api/v1/clinical-trials/trials", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body and "total" in body
        assert any("immutable" in d.lower() for d in body["disclaimers"])

    def test_admin_allowed(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get(
            "/api/v1/clinical-trials/trials", headers=auth_headers["admin"]
        )
        assert resp.status_code == 200


# ── Create / list / detail ──────────────────────────────────────────────────


class TestCreateAndList:
    def test_create_minimal(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        body = _create(
            client,
            auth_headers["clinician"],
            title="Pilot Study",
            irb_protocol_id=proto_id,
        )
        assert body["title"] == "Pilot Study"
        assert body["status"] == "planning"
        assert body["irb_protocol_id"] == proto_id
        assert body["irb_protocol_code"] == "DS-TR-2026-001"
        assert body["pi_user_id"] == "actor-clinician-demo"
        assert body["pi_display_name"]
        assert body["created_by"] == "actor-clinician-demo"
        assert body["revision_count"] >= 1
        assert body["payload_hash"] and len(body["payload_hash"]) == 16
        assert body["sites"] and body["sites"][0]["name"] == "Main Site"

    def test_invalid_irb_protocol_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            "/api/v1/clinical-trials/trials",
            json={
                "title": "x",
                "irb_protocol_id": "not-a-real-protocol",
                "pi_user_id": "actor-clinician-demo",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_irb_protocol"

    def test_invalid_pi_rejected(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        resp = client.post(
            "/api/v1/clinical-trials/trials",
            json={
                "title": "x",
                "irb_protocol_id": proto_id,
                "pi_user_id": "Dr. Pretend",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_pi"

    def test_invalid_phase(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        resp = client.post(
            "/api/v1/clinical-trials/trials",
            json={
                "title": "x",
                "irb_protocol_id": proto_id,
                "pi_user_id": "actor-clinician-demo",
                "phase": "fake",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_phase"

    def test_list_returns_created(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        a = _create(client, auth_headers["clinician"], title="A", irb_protocol_id=proto_id)
        b = _create(client, auth_headers["clinician"], title="B", irb_protocol_id=proto_id)
        resp = client.get(
            "/api/v1/clinical-trials/trials",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        ids = {it["id"] for it in resp.json()["items"]}
        assert a["id"] in ids and b["id"] in ids

    def test_get_detail_includes_enrollments(
        self,
        client: TestClient,
        auth_headers: dict,
        proto_id: str,
        patient_id: str,
    ) -> None:
        t = _create(client, auth_headers["clinician"], irb_protocol_id=proto_id)
        client.post(
            f"/api/v1/clinical-trials/trials/{t['id']}/enrollments",
            json={"patient_id": patient_id, "arm": "Active TBS"},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            f"/api/v1/clinical-trials/trials/{t['id']}",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["enrollments"]) == 1
        assert body["enrollments"][0]["patient_id"] == patient_id
        assert body["enrollments"][0]["arm"] == "Active TBS"
        assert body["enrolled_active"] == 1


# ── Filters & summary ───────────────────────────────────────────────────────


class TestFiltersAndSummary:
    def test_filter_by_status(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        a = _create(client, auth_headers["clinician"], title="alpha", irb_protocol_id=proto_id)
        _create(client, auth_headers["clinician"], title="beta", irb_protocol_id=proto_id)
        client.post(
            f"/api/v1/clinical-trials/trials/{a['id']}/close",
            json={"note": "study completed"},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/clinical-trials/trials?status=planning",
            headers=auth_headers["clinician"],
        )
        items = resp.json()["items"]
        assert all(it["status"] == "planning" for it in items)
        assert a["id"] not in {it["id"] for it in items}

    def test_filter_by_phase(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        triple = _create(
            client,
            auth_headers["clinician"],
            title="phase3",
            irb_protocol_id=proto_id,
            phase="iii",
        )
        _create(
            client,
            auth_headers["clinician"],
            title="pilotonly",
            irb_protocol_id=proto_id,
            phase="pilot",
        )
        resp = client.get(
            "/api/v1/clinical-trials/trials?phase=iii",
            headers=auth_headers["clinician"],
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert triple["id"] in ids
        assert all(it["phase"] == "iii" for it in resp.json()["items"])

    def test_filter_by_nct(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        a = _create(
            client,
            auth_headers["clinician"],
            irb_protocol_id=proto_id,
            nct_number="NCT11111111",
        )
        _create(
            client,
            auth_headers["clinician"],
            irb_protocol_id=proto_id,
            nct_number="NCT22222222",
        )
        resp = client.get(
            "/api/v1/clinical-trials/trials?nct_number=NCT11111111",
            headers=auth_headers["clinician"],
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert a["id"] in ids
        assert all(
            it["nct_number"] == "NCT11111111" for it in resp.json()["items"]
        )

    def test_filter_by_q(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        a = _create(
            client,
            auth_headers["clinician"],
            title="Theta Burst TMS for TRD",
            description="iTBS protocol for treatment-resistant MDD",
            irb_protocol_id=proto_id,
        )
        _create(
            client,
            auth_headers["clinician"],
            title="Other study",
            description="Not what we're looking for",
            irb_protocol_id=proto_id,
        )
        resp = client.get(
            "/api/v1/clinical-trials/trials?q=theta",
            headers=auth_headers["clinician"],
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert a["id"] in ids

    def test_filter_by_site_id(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        a = _create(
            client,
            auth_headers["clinician"],
            irb_protocol_id=proto_id,
            sites=[{"id": "site-london", "name": "London"}],
        )
        _create(
            client,
            auth_headers["clinician"],
            irb_protocol_id=proto_id,
            sites=[{"id": "site-oxford", "name": "Oxford"}],
        )
        resp = client.get(
            "/api/v1/clinical-trials/trials?site_id=site-london",
            headers=auth_headers["clinician"],
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert a["id"] in ids

    def test_filter_since_until(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        a = _create(client, auth_headers["clinician"], irb_protocol_id=proto_id)
        # since=2099-01-01 → future, no match
        resp = client.get(
            "/api/v1/clinical-trials/trials?since=2099-01-01",
            headers=auth_headers["clinician"],
        )
        assert a["id"] not in {it["id"] for it in resp.json()["items"]}
        # until=2099-01-01 → all rows visible
        resp = client.get(
            "/api/v1/clinical-trials/trials?until=2099-01-01",
            headers=auth_headers["clinician"],
        )
        assert a["id"] in {it["id"] for it in resp.json()["items"]}

    def test_summary_counts(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        a = _create(client, auth_headers["clinician"], title="a", irb_protocol_id=proto_id, phase="ii")
        b = _create(client, auth_headers["clinician"], title="b", irb_protocol_id=proto_id, phase="iii")
        client.post(
            f"/api/v1/clinical-trials/trials/{a['id']}/close",
            json={"note": "completed"},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/clinical-trials/trials/summary",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        s = resp.json()
        assert s["total"] == 2
        assert s["closed"] >= 1
        assert s["planning"] >= 1
        assert s["by_phase"].get("ii", 0) + s["by_phase"].get("iii", 0) >= 2
        # b is still 'planning' so enrollment_open == 0 (planning is pre-recruiting).
        # If we patch to active it would tick up enrollment_open.
        assert "enrollment_open" in s
        assert "pending_irb" in s


# ── Patch / immutability / pause-resume ─────────────────────────────────────


class TestPatchAndImmutability:
    def test_patch_phase_increments_revision(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        before = f["revision_count"]
        resp = client.patch(
            f"/api/v1/clinical-trials/trials/{f['id']}",
            json={"phase": "iii"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.json()["phase"] == "iii"
        assert resp.json()["revision_count"] == before + 1

    def test_patch_status_to_terminal_blocked(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        resp = client.patch(
            f"/api/v1/clinical-trials/trials/{f['id']}",
            json={"status": "closed"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "use_terminal_endpoint"

    def test_patch_status_to_paused_blocked(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        resp = client.patch(
            f"/api/v1/clinical-trials/trials/{f['id']}",
            json={"status": "paused"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "use_pause_resume_endpoint"

    def test_closed_is_immutable(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/close",
            json={"note": "done"},
            headers=auth_headers["clinician"],
        )
        resp = client.patch(
            f"/api/v1/clinical-trials/trials/{f['id']}",
            json={"phase": "iii"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "trial_immutable"

    def test_empty_patch_rejected(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        resp = client.patch(
            f"/api/v1/clinical-trials/trials/{f['id']}",
            json={},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "empty_patch"


# ── Pause / Resume / Close ──────────────────────────────────────────────────


class TestPauseResumeClose:
    def test_pause_requires_note(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        # First flip to recruiting via PATCH so pause has something to act on.
        client.patch(
            f"/api/v1/clinical-trials/trials/{f['id']}",
            json={"status": "recruiting"},
            headers=auth_headers["clinician"],
        )
        resp = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/pause",
            json={"note": "   "},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "pause_note_required"

    def test_pause_then_resume(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        client.patch(
            f"/api/v1/clinical-trials/trials/{f['id']}",
            json={"status": "recruiting"},
            headers=auth_headers["clinician"],
        )
        p = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/pause",
            json={"note": "Sponsor on-site visit"},
            headers=auth_headers["clinician"],
        )
        assert p.status_code == 200
        assert p.json()["status"] == "paused"
        assert p.json()["pause_reason"]
        # Cannot pause twice
        p2 = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/pause",
            json={"note": "again"},
            headers=auth_headers["clinician"],
        )
        assert p2.status_code == 409
        # Resume requires note
        r0 = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/resume",
            json={"note": ""},
            headers=auth_headers["clinician"],
        )
        assert r0.status_code == 422
        r = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/resume",
            json={"note": "Sponsor visit complete"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["status"] == "active"
        assert r.json()["paused_at"] is None

    def test_close_requires_note(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        resp = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/close",
            json={"note": "  "},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "closure_note_required"

    def test_close_is_terminal_no_reopen(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        c = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/close",
            json={"note": "study completed"},
            headers=auth_headers["clinician"],
        )
        assert c.status_code == 200
        assert c.json()["status"] == "closed"
        # Cannot close again
        c2 = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/close",
            json={"note": "again"},
            headers=auth_headers["clinician"],
        )
        assert c2.status_code == 409
        # No reopen endpoint exists — verifying patch is blocked is the
        # documented contract.
        p = client.patch(
            f"/api/v1/clinical-trials/trials/{f['id']}",
            json={"phase": "iii"},
            headers=auth_headers["clinician"],
        )
        assert p.status_code == 409


# ── Enrollment ──────────────────────────────────────────────────────────────


class TestEnrollment:
    def test_enroll_invalid_patient(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        resp = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments",
            json={"patient_id": "not-a-real-patient"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_patient"

    def test_enroll_real_patient(
        self,
        client: TestClient,
        auth_headers: dict,
        proto_id: str,
        patient_id: str,
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        resp = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments",
            json={"patient_id": patient_id, "arm": "Active TBS"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["patient_id"] == patient_id
        assert body["status"] == "active"
        assert body["enrolled_by"] == "actor-clinician-demo"
        assert body["patient_display_name"]

    def test_enroll_blocks_duplicate(
        self,
        client: TestClient,
        auth_headers: dict,
        proto_id: str,
        patient_id: str,
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments",
            json={"patient_id": patient_id},
            headers=auth_headers["clinician"],
        )
        dup = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments",
            json={"patient_id": patient_id},
            headers=auth_headers["clinician"],
        )
        assert dup.status_code == 409
        assert dup.json()["code"] == "patient_already_enrolled"

    def test_enroll_blocks_other_clinic(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        # Seed a patient owned by a clinician in a different clinic.
        from app.database import SessionLocal
        from app.persistence.models import Clinic, Patient, User

        db = SessionLocal()
        try:
            other_clinic_id = "clinic-other-trials"
            if db.query(Clinic).filter_by(id=other_clinic_id).first() is None:
                db.add(Clinic(id=other_clinic_id, name="Other Clinic"))
            other_user_id = "actor-other-clinician"
            if db.query(User).filter_by(id=other_user_id).first() is None:
                db.add(
                    User(
                        id=other_user_id,
                        email="other-trials@example.com",
                        display_name="Other Clinician",
                        hashed_password="x",
                        role="clinician",
                        package_id="clinician_pro",
                        clinic_id=other_clinic_id,
                    )
                )
            ppid = str(uuid.uuid4())
            db.add(
                Patient(
                    id=ppid,
                    clinician_id=other_user_id,
                    first_name="Cross",
                    last_name="Clinic",
                )
            )
            db.commit()
        finally:
            db.close()
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        resp = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments",
            json={"patient_id": ppid},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "patient_cross_clinic"

    def test_enroll_blocked_on_closed_trial(
        self,
        client: TestClient,
        auth_headers: dict,
        proto_id: str,
        patient_id: str,
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/close",
            json={"note": "done"},
            headers=auth_headers["clinician"],
        )
        resp = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments",
            json={"patient_id": patient_id},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 409


# ── Withdraw enrolment ──────────────────────────────────────────────────────


class TestWithdraw:
    def test_withdraw_requires_reason(
        self,
        client: TestClient,
        auth_headers: dict,
        proto_id: str,
        patient_id: str,
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        e = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments",
            json={"patient_id": patient_id},
            headers=auth_headers["clinician"],
        ).json()
        resp = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments/{e['id']}/withdraw",
            json={"reason": "   "},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "withdraw_reason_required"

    def test_withdraw_active_only(
        self,
        client: TestClient,
        auth_headers: dict,
        proto_id: str,
        patient_id: str,
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x", irb_protocol_id=proto_id)
        e = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments",
            json={"patient_id": patient_id},
            headers=auth_headers["clinician"],
        ).json()
        first = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments/{e['id']}/withdraw",
            json={"reason": "patient request"},
            headers=auth_headers["clinician"],
        )
        assert first.status_code == 200
        assert first.json()["status"] == "withdrawn"
        assert first.json()["withdrawal_reason"] == "patient request"
        # Already withdrawn → 409 on second attempt
        again = client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments/{e['id']}/withdraw",
            json={"reason": "again"},
            headers=auth_headers["clinician"],
        )
        assert again.status_code == 409
        assert again.json()["code"] == "enrollment_not_active"


# ── Cross-clinic isolation ──────────────────────────────────────────────────


class TestClinicScope:
    def _seed_other_clinic_trial(self) -> str:
        from app.database import SessionLocal
        from app.persistence.models import (
            Clinic,
            ClinicalTrial,
            IRBProtocol,
            User,
        )

        db = SessionLocal()
        try:
            other_clinic_id = "clinic-other-trials"
            if db.query(Clinic).filter_by(id=other_clinic_id).first() is None:
                db.add(Clinic(id=other_clinic_id, name="Other Clinic"))
            other_user_id = "actor-other-trials-pi"
            if db.query(User).filter_by(id=other_user_id).first() is None:
                db.add(
                    User(
                        id=other_user_id,
                        email="other-trials-pi@example.com",
                        display_name="Other PI",
                        hashed_password="x",
                        role="clinician",
                        package_id="clinician_pro",
                        clinic_id=other_clinic_id,
                    )
                )
            other_proto_id = str(uuid.uuid4())
            db.add(
                IRBProtocol(
                    id=other_proto_id,
                    clinic_id=other_clinic_id,
                    title="Other-clinic IRB protocol",
                    description="x",
                    pi_user_id=other_user_id,
                    phase="ii",
                    status="active",
                    created_by=other_user_id,
                )
            )
            tid = str(uuid.uuid4())
            db.add(
                ClinicalTrial(
                    id=tid,
                    clinic_id=other_clinic_id,
                    irb_protocol_id=other_proto_id,
                    title="Cross-clinic trial",
                    description="should be invisible to demo clinician",
                    pi_user_id=other_user_id,
                    phase="ii",
                    status="planning",
                    created_by=other_user_id,
                )
            )
            db.commit()
            return tid
        finally:
            db.close()

    def test_clinician_cannot_see_other_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        tid = self._seed_other_clinic_trial()
        resp = client.get(
            f"/api/v1/clinical-trials/trials/{tid}",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404
        assert resp.json()["code"] == "trial_not_found"

    def test_admin_can_see_other_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        tid = self._seed_other_clinic_trial()
        resp = client.get(
            f"/api/v1/clinical-trials/trials/{tid}",
            headers=auth_headers["admin"],
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Cross-clinic trial"


# ── Exports ─────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_columns(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        _create(
            client, auth_headers["clinician"], title="csv-row", irb_protocol_id=proto_id
        )
        resp = client.get(
            "/api/v1/clinical-trials/trials/export.csv",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        assert (
            "filename=clinical_trials.csv"
            in resp.headers["content-disposition"]
        )
        body = resp.text
        assert not body.startswith("# DEMO")
        reader = csv.reader(io.StringIO(body))
        header = next(reader)
        assert "id" in header and "phase" in header and "payload_hash" in header
        assert "irb_protocol_id" in header and "nct_number" in header

    def test_csv_export_demo_prefix(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        _create(
            client,
            auth_headers["clinician"],
            title="demo-row",
            irb_protocol_id=proto_id,
            is_demo=True,
        )
        resp = client.get(
            "/api/v1/clinical-trials/trials/export.csv",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.text.startswith("# DEMO"), resp.text[:80]
        assert resp.headers.get("X-Trial-Demo-Rows") == "1"

    def test_ndjson_export_one_per_line(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        a = _create(client, auth_headers["clinician"], title="a", irb_protocol_id=proto_id)
        b = _create(client, auth_headers["clinician"], title="b", irb_protocol_id=proto_id)
        resp = client.get(
            "/api/v1/clinical-trials/trials/export.ndjson",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        lines = [ln for ln in resp.text.splitlines() if ln.strip()]
        ids = {
            json.loads(ln).get("id")
            for ln in lines
            if ln.startswith("{") and "_meta" not in ln
        }
        assert a["id"] in ids and b["id"] in ids

    def test_ndjson_export_demo_meta(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        _create(
            client,
            auth_headers["clinician"],
            title="demo-ndjson",
            irb_protocol_id=proto_id,
            is_demo=True,
        )
        resp = client.get(
            "/api/v1/clinical-trials/trials/export.ndjson",
            headers=auth_headers["clinician"],
        )
        lines = [ln for ln in resp.text.splitlines() if ln.strip()]
        assert json.loads(lines[0])["_meta"] == "DEMO"


# ── Audit-event ingestion ───────────────────────────────────────────────────


class TestAuditEvents:
    def test_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            "/api/v1/clinical-trials/trials/audit-events",
            json={"event": "page_loaded", "note": "test"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("clinical_trials-")

    def test_audit_event_visible_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.post(
            "/api/v1/clinical-trials/trials/audit-events",
            json={"event": "filter_changed", "note": "status=active"},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/audit-trail?surface=clinical_trials",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        events = resp.json()["items"]
        assert any(
            ev["action"] == "clinical_trials.filter_changed" for ev in events
        )

    def test_create_emits_audit_row(
        self, client: TestClient, auth_headers: dict, proto_id: str
    ) -> None:
        f = _create(
            client,
            auth_headers["clinician"],
            title="audited",
            irb_protocol_id=proto_id,
        )
        resp = client.get(
            "/api/v1/audit-trail?surface=clinical_trials&event_type=created",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        events = resp.json()["items"]
        assert any(
            ev["target_id"] == f["id"]
            and ev["action"] == "clinical_trials.created"
            for ev in events
        )

    def test_enrollment_emits_audit_row(
        self,
        client: TestClient,
        auth_headers: dict,
        proto_id: str,
        patient_id: str,
    ) -> None:
        f = _create(client, auth_headers["clinician"], irb_protocol_id=proto_id)
        client.post(
            f"/api/v1/clinical-trials/trials/{f['id']}/enrollments",
            json={"patient_id": patient_id},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/audit-trail?surface=clinical_trials&event_type=enrolled",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        events = resp.json()["items"]
        assert any(
            ev["target_id"] == f["id"]
            and ev["action"] == "clinical_trials.enrolled"
            for ev in events
        )
