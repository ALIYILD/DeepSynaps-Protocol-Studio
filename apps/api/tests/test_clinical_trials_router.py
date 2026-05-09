"""Tests for clinical_trials_router.py.

Covers:
  - Auth: guest (unauthenticated) is rejected (403) on all endpoints
  - GET  /api/v1/clinical-trials/trials: list returns 200 with expected shape
  - GET  /api/v1/clinical-trials/trials/summary: returns count fields
  - POST /api/v1/clinical-trials/trials: create trial with valid IRB + real PI
  - POST /api/v1/clinical-trials/trials: invalid IRB protocol id → 422
  - POST /api/v1/clinical-trials/trials: unknown PI user → 422
  - POST /api/v1/clinical-trials/trials: invalid phase → 422
  - GET  /api/v1/clinical-trials/trials/{id}: detail returns correct record
  - GET  /api/v1/clinical-trials/trials/{id}: unknown id → 404
  - PATCH /api/v1/clinical-trials/trials/{id}: title update recorded
  - PATCH /api/v1/clinical-trials/trials/{id}: empty patch → 422
  - POST /api/v1/clinical-trials/trials/{id}/pause: note required
  - POST /api/v1/clinical-trials/trials/{id}/pause: note accepted, status → paused
  - POST /api/v1/clinical-trials/trials/{id}/resume: resumes paused trial
  - POST /api/v1/clinical-trials/trials/{id}/close: note required; trial immutable after close
  - GET  /api/v1/clinical-trials/trials/export.csv: returns CSV content-type
  - GET  /api/v1/clinical-trials/trials/export.ndjson: returns NDJSON content-type
  - POST /api/v1/clinical-trials/trials/audit-events: page audit ingested
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, IRBProtocol, Patient, User


# ── helpers ───────────────────────────────────────────────────────────────────


def _pid() -> str:
    return f"pt-ct-{uuid.uuid4().hex[:8]}"


def _uid(suffix: str = "") -> str:
    return f"usr-ct-{suffix}{uuid.uuid4().hex[:6]}"


def _mint(user_id: str, role: str, clinic_id: str | None) -> str:
    from app.services.auth_service import create_access_token

    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="clinician_pro",
        clinic_id=clinic_id,
    )


def _hdrs(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seeded() -> dict[str, Any]:
    """Seed clinic + clinician + IRB protocol + patient; return ids and tokens."""
    db = SessionLocal()
    try:
        clinic_id = f"clinic-ct-{uuid.uuid4().hex[:8]}"
        db.add(Clinic(id=clinic_id, name="CT Test Clinic"))
        db.flush()

        clin_id = _uid("clin-")
        db.add(
            User(
                id=clin_id,
                email=f"{clin_id}@example.com",
                display_name="CT Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )

        # PI user (can be same as clinician in tests).
        pi_id = clin_id

        # IRB protocol — required FK for trial creation.
        irb_id = str(uuid.uuid4())
        db.add(
            IRBProtocol(
                id=irb_id,
                clinic_id=clinic_id,
                protocol_code="DS-2026-CT-001",
                title="Test Neurostimulation Protocol",
                description="IRB-approved protocol for testing.",
                pi_user_id=pi_id,
                status="active",
                created_by=clin_id,
            )
        )

        pid = _pid()
        db.add(
            Patient(
                id=pid,
                clinician_id=clin_id,
                first_name="Trial",
                last_name="Patient",
                email=f"{pid}@example.com",
                consent_signed=True,
                status="active",
            )
        )
        db.commit()
    finally:
        db.close()

    token = _mint(clin_id, "clinician", clinic_id)
    admin_token = _mint("actor-admin-demo", "admin", clinic_id)
    return {
        "clinic_id": clinic_id,
        "clinician_id": clin_id,
        "pi_id": pi_id,
        "irb_protocol_id": irb_id,
        "patient_id": pid,
        "token": token,
        "admin_token": admin_token,
    }


def _create_trial(
    client: TestClient,
    headers: dict,
    *,
    irb_protocol_id: str,
    pi_user_id: str,
    title: str = "Phase II Neurostimulation Trial",
    **overrides,
) -> dict:
    payload = {
        "title": title,
        "description": "Test trial description.",
        "irb_protocol_id": irb_protocol_id,
        "pi_user_id": pi_user_id,
        "status": "planning",
        **overrides,
    }
    r = client.post("/api/v1/clinical-trials/trials", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── auth guards ───────────────────────────────────────────────────────────────


class TestAuthGuards:
    def test_guest_rejected_on_list(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/clinical-trials/trials", headers=auth_headers["guest"])
        assert r.status_code == 403

    def test_guest_rejected_on_create(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinical-trials/trials",
            json={
                "title": "x",
                "irb_protocol_id": "any",
                "pi_user_id": "any",
            },
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_guest_rejected_on_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinical-trials/trials/summary", headers=auth_headers["guest"]
        )
        assert r.status_code == 403


# ── GET /trials (list) ────────────────────────────────────────────────────────


class TestListTrials:
    def test_list_returns_200_with_expected_shape(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.get("/api/v1/clinical-trials/trials", headers=hdrs)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert "limit" in body
        assert "offset" in body
        assert "disclaimers" in body

    def test_list_includes_created_trial(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        r = client.get("/api/v1/clinical-trials/trials", headers=hdrs)
        ids = [item["id"] for item in r.json()["items"]]
        assert trial["id"] in ids


# ── GET /trials/summary ───────────────────────────────────────────────────────


class TestTrialsSummary:
    def test_summary_returns_expected_shape(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.get("/api/v1/clinical-trials/trials/summary", headers=hdrs)
        assert r.status_code == 200
        body = r.json()
        for key in ("total", "active", "recruiting", "paused", "closed", "planning"):
            assert key in body, f"missing key: {key}"

    def test_summary_counts_increment_after_create(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r0 = client.get("/api/v1/clinical-trials/trials/summary", headers=hdrs)
        initial = r0.json()["total"]
        _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        r1 = client.get("/api/v1/clinical-trials/trials/summary", headers=hdrs)
        assert r1.json()["total"] == initial + 1


# ── POST /trials (create) ─────────────────────────────────────────────────────


class TestCreateTrial:
    def test_create_minimal_trial(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        assert trial["irb_protocol_id"] == seeded["irb_protocol_id"]
        assert trial["pi_user_id"] == seeded["pi_id"]
        assert trial["status"] == "planning"
        assert "id" in trial
        assert "created_at" in trial

    def test_create_with_nct_number(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
            nct_number="NCT01234567",
        )
        assert trial["nct_number"] == "NCT01234567"

    def test_invalid_irb_protocol_returns_422(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.post(
            "/api/v1/clinical-trials/trials",
            json={
                "title": "Bad Trial",
                "irb_protocol_id": "nonexistent-irb-id",
                "pi_user_id": seeded["pi_id"],
            },
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_unknown_pi_user_returns_422(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.post(
            "/api/v1/clinical-trials/trials",
            json={
                "title": "Bad PI Trial",
                "irb_protocol_id": seeded["irb_protocol_id"],
                "pi_user_id": "nonexistent-pi-user",
            },
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_invalid_phase_returns_422(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.post(
            "/api/v1/clinical-trials/trials",
            json={
                "title": "Bad Phase Trial",
                "irb_protocol_id": seeded["irb_protocol_id"],
                "pi_user_id": seeded["pi_id"],
                "phase": "invalid_phase_xyz",
            },
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_demo_flag_stored(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
            is_demo=True,
        )
        assert trial["is_demo"] is True


# ── GET /trials/{id} ─────────────────────────────────────────────────────────


class TestGetTrial:
    def test_get_returns_correct_record(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
            title="Unique Title For Get Test",
        )
        r = client.get(f"/api/v1/clinical-trials/trials/{trial['id']}", headers=hdrs)
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == trial["id"]
        assert body["title"] == "Unique Title For Get Test"
        assert "enrollments" in body

    def test_unknown_id_returns_404(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.get(
            f"/api/v1/clinical-trials/trials/{uuid.uuid4()}", headers=hdrs
        )
        assert r.status_code == 404


# ── PATCH /trials/{id} ───────────────────────────────────────────────────────


class TestPatchTrial:
    def test_update_title(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        r = client.patch(
            f"/api/v1/clinical-trials/trials/{trial['id']}",
            json={"title": "Updated Trial Title"},
            headers=hdrs,
        )
        assert r.status_code == 200
        assert r.json()["title"] == "Updated Trial Title"

    def test_empty_patch_returns_422(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        r = client.patch(
            f"/api/v1/clinical-trials/trials/{trial['id']}",
            json={},
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_patch_terminal_status_via_patch_blocked(
        self, client: TestClient, seeded: dict
    ) -> None:
        """Setting status=closed via PATCH must be rejected (use /close endpoint)."""
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        r = client.patch(
            f"/api/v1/clinical-trials/trials/{trial['id']}",
            json={"status": "closed"},
            headers=hdrs,
        )
        assert r.status_code == 422


# ── POST /trials/{id}/pause ───────────────────────────────────────────────────


class TestPauseTrial:
    def test_pause_requires_note(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
            status="active",
        )
        r = client.post(
            f"/api/v1/clinical-trials/trials/{trial['id']}/pause",
            json={"note": ""},
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_pause_with_note_succeeds(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
            status="active",
        )
        r = client.post(
            f"/api/v1/clinical-trials/trials/{trial['id']}/pause",
            json={"note": "Safety signal detected; pausing enrollment."},
            headers=hdrs,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "paused"


# ── POST /trials/{id}/resume ──────────────────────────────────────────────────


class TestResumeTrial:
    def test_resume_requires_paused_state(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
            status="planning",
        )
        r = client.post(
            f"/api/v1/clinical-trials/trials/{trial['id']}/resume",
            json={"note": "Resuming."},
            headers=hdrs,
        )
        assert r.status_code == 409

    def test_resume_paused_trial(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
            status="active",
        )
        # Pause first.
        client.post(
            f"/api/v1/clinical-trials/trials/{trial['id']}/pause",
            json={"note": "Pause for review."},
            headers=hdrs,
        )
        r = client.post(
            f"/api/v1/clinical-trials/trials/{trial['id']}/resume",
            json={"note": "Safety signal cleared; resuming."},
            headers=hdrs,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "active"


# ── POST /trials/{id}/close ───────────────────────────────────────────────────


class TestCloseTrial:
    def test_close_requires_note(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        r = client.post(
            f"/api/v1/clinical-trials/trials/{trial['id']}/close",
            json={"note": ""},
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_close_with_note_succeeds(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        r = client.post(
            f"/api/v1/clinical-trials/trials/{trial['id']}/close",
            json={"note": "Study completed per protocol."},
            headers=hdrs,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "closed"

    def test_closed_trial_immutable(self, client: TestClient, seeded: dict) -> None:
        """PATCH on a closed trial must return 409."""
        hdrs = _hdrs(seeded["token"])
        trial = _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        client.post(
            f"/api/v1/clinical-trials/trials/{trial['id']}/close",
            json={"note": "Closed permanently."},
            headers=hdrs,
        )
        r = client.patch(
            f"/api/v1/clinical-trials/trials/{trial['id']}",
            json={"title": "Attempt to modify closed trial"},
            headers=hdrs,
        )
        assert r.status_code == 409


# ── exports ───────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_returns_correct_content_type(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.get(
            "/api/v1/clinical-trials/trials/export.csv", headers=hdrs
        )
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]

    def test_ndjson_export_returns_correct_content_type(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.get(
            "/api/v1/clinical-trials/trials/export.ndjson", headers=hdrs
        )
        assert r.status_code == 200
        assert "ndjson" in r.headers["content-type"] or "json" in r.headers["content-type"]

    def test_csv_export_contains_header_row(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        _create_trial(
            client,
            hdrs,
            irb_protocol_id=seeded["irb_protocol_id"],
            pi_user_id=seeded["pi_id"],
        )
        r = client.get(
            "/api/v1/clinical-trials/trials/export.csv", headers=hdrs
        )
        content = r.text
        assert "id" in content
        assert "title" in content
        assert "status" in content


# ── audit-events ──────────────────────────────────────────────────────────────


class TestAuditEvents:
    def test_audit_event_ingested(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.post(
            "/api/v1/clinical-trials/trials/audit-events",
            json={"event": "list_viewed", "note": "User opened clinical trials hub."},
            headers=hdrs,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is True
        assert "event_id" in body
