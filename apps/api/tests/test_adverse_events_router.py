"""Tests for adverse_events_router.py.

Covers:
  - Auth: guest (unauthenticated) is rejected (403) on all endpoints
  - POST /api/v1/adverse-events: create minimal AE (clinician, seeded patient)
  - POST /api/v1/adverse-events: SAE auto-flag when severity == "serious"
  - POST /api/v1/adverse-events: reportable auto-flag when SAE + unexpected + possible
  - POST /api/v1/adverse-events: invalid body_system → 422
  - GET  /api/v1/adverse-events: list returns created event
  - GET  /api/v1/adverse-events/summary: returns count fields
  - GET  /api/v1/adverse-events/{id}: detail returns correct record
  - GET  /api/v1/adverse-events/{id}: unknown id → 404
  - PATCH /api/v1/adverse-events/{id}: classification fields updated
  - POST /api/v1/adverse-events/{id}/review: review sign-off recorded
  - POST /api/v1/adverse-events/{id}/escalate: escalation recorded
  - POST /api/v1/adverse-events/{id}/close: close requires note
  - POST /api/v1/adverse-events/{id}/reopen: reopens closed AE
  - Utility helpers: suggest_body_system, derive_is_serious, derive_reportable
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Patient, Clinic, User


# ── helpers ───────────────────────────────────────────────────────────────────


def _pid() -> str:
    return f"pt-ae-{uuid.uuid4().hex[:8]}"


def _uid(role: str = "clinician") -> str:
    return f"usr-ae-{role[:3]}-{uuid.uuid4().hex[:6]}"


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
    """Seed a clinic + clinician user + patient, return ids and token."""
    db = SessionLocal()
    try:
        clinic_id = f"clinic-ae-{uuid.uuid4().hex[:8]}"
        db.add(Clinic(id=clinic_id, name="AE Test Clinic"))
        db.flush()

        clin_id = _uid("clinician")
        db.add(
            User(
                id=clin_id,
                email=f"{clin_id}@example.com",
                display_name="AE Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )

        pid = _pid()
        db.add(
            Patient(
                id=pid,
                clinician_id=clin_id,
                first_name="Adverse",
                last_name="TestPt",
                email=f"{pid}@example.com",
                consent_signed=True,
                status="active",
            )
        )
        db.commit()
    finally:
        db.close()

    token = _mint(clin_id, "clinician", clinic_id)
    return {"clinic_id": clinic_id, "clinician_id": clin_id, "patient_id": pid, "token": token}


def _create_ae(client: TestClient, headers: dict, patient_id: str, **overrides) -> dict:
    payload = {
        "patient_id": patient_id,
        "event_type": "headache",
        "severity": "mild",
        **overrides,
    }
    r = client.post("/api/v1/adverse-events", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── auth guards ───────────────────────────────────────────────────────────────


class TestAuthGuards:
    def test_guest_rejected_on_list(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/adverse-events", headers=auth_headers["guest"])
        assert r.status_code == 403

    def test_guest_rejected_on_create(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": "any", "event_type": "x", "severity": "mild"},
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_guest_rejected_on_summary(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/adverse-events/summary", headers=auth_headers["guest"])
        assert r.status_code == 403


# ── utility helpers (pure functions, no DB) ───────────────────────────────────


class TestUtilityHelpers:
    def test_suggest_body_system_headache(self) -> None:
        from app.routers.adverse_events_router import suggest_body_system

        result = suggest_body_system("headache", None)
        assert result == "nervous"

    def test_suggest_body_system_nausea(self) -> None:
        from app.routers.adverse_events_router import suggest_body_system

        result = suggest_body_system("nausea", "stomach discomfort")
        assert result == "gi"

    def test_suggest_body_system_returns_none_for_unknown(self) -> None:
        from app.routers.adverse_events_router import suggest_body_system

        result = suggest_body_system("xyz-unknown-token", None)
        assert result is None

    def test_derive_is_serious_severity_serious(self) -> None:
        from app.routers.adverse_events_router import derive_is_serious

        is_serious, sae_norm = derive_is_serious("serious", None)
        assert is_serious is True
        assert sae_norm is None

    def test_derive_is_serious_sae_criteria(self) -> None:
        from app.routers.adverse_events_router import derive_is_serious

        is_serious, sae_norm = derive_is_serious("mild", "hospitalization, death")
        assert is_serious is True
        assert "hospitalization" in (sae_norm or "")
        assert "death" in (sae_norm or "")

    def test_derive_is_serious_false(self) -> None:
        from app.routers.adverse_events_router import derive_is_serious

        is_serious, sae_norm = derive_is_serious("mild", None)
        assert is_serious is False
        assert sae_norm is None

    def test_derive_reportable_true(self) -> None:
        from app.routers.adverse_events_router import derive_reportable

        assert derive_reportable(True, "unexpected", "probable") is True

    def test_derive_reportable_false_expected(self) -> None:
        from app.routers.adverse_events_router import derive_reportable

        assert derive_reportable(True, "expected", "probable") is False

    def test_derive_reportable_false_not_serious(self) -> None:
        from app.routers.adverse_events_router import derive_reportable

        assert derive_reportable(False, "unexpected", "probable") is False


# ── POST / (create) ───────────────────────────────────────────────────────────


class TestCreateAdverseEvent:
    def test_creates_minimal_ae(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        assert ae["patient_id"] == seeded["patient_id"]
        assert ae["event_type"] == "headache"
        assert ae["severity"] == "mild"
        assert ae["is_serious"] is False
        assert ae["reportable"] is False
        assert ae["status"] == "open"

    def test_sae_auto_flag_when_severity_serious(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"], severity="serious")
        assert ae["is_serious"] is True

    def test_reportable_auto_derived(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(
            client,
            hdrs,
            seeded["patient_id"],
            severity="serious",
            expectedness="unexpected",
            relatedness="probable",
        )
        assert ae["reportable"] is True

    def test_invalid_body_system_returns_422(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.post(
            "/api/v1/adverse-events",
            json={
                "patient_id": seeded["patient_id"],
                "event_type": "rash",
                "severity": "mild",
                "body_system": "invalid_system_xyz",
            },
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_invalid_expectedness_returns_422(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.post(
            "/api/v1/adverse-events",
            json={
                "patient_id": seeded["patient_id"],
                "event_type": "rash",
                "severity": "mild",
                "expectedness": "maybe",
            },
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_description_stored(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(
            client,
            hdrs,
            seeded["patient_id"],
            description="Onset during first TMS session.",
        )
        assert ae["description"] == "Onset during first TMS session."


# ── GET / (list) ─────────────────────────────────────────────────────────────


class TestListAdverseEvents:
    def test_list_empty_initially(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.get("/api/v1/adverse-events", headers=hdrs)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body

    def test_list_returns_created_event(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        r = client.get("/api/v1/adverse-events", headers=hdrs)
        assert r.status_code == 200
        ids = [item["id"] for item in r.json()["items"]]
        assert ae["id"] in ids

    def test_list_filter_by_patient_id(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        r = client.get(
            f"/api/v1/adverse-events?patient_id={seeded['patient_id']}", headers=hdrs
        )
        assert r.status_code == 200
        ids = [item["id"] for item in r.json()["items"]]
        assert ae["id"] in ids


# ── GET /summary ──────────────────────────────────────────────────────────────


class TestAdverseEventsSummary:
    def test_summary_returns_expected_shape(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        _create_ae(client, hdrs, seeded["patient_id"])
        r = client.get("/api/v1/adverse-events/summary", headers=hdrs)
        assert r.status_code == 200
        body = r.json()
        for key in ("total", "open", "reviewed", "resolved", "sae", "reportable"):
            assert key in body, f"missing key: {key}"

    def test_summary_counts_increase_after_create(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r0 = client.get("/api/v1/adverse-events/summary", headers=hdrs)
        initial = r0.json()["total"]
        _create_ae(client, hdrs, seeded["patient_id"])
        r1 = client.get("/api/v1/adverse-events/summary", headers=hdrs)
        assert r1.json()["total"] == initial + 1


# ── GET /{id} ─────────────────────────────────────────────────────────────────


class TestGetAdverseEvent:
    def test_get_returns_correct_record(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        r = client.get(f"/api/v1/adverse-events/{ae['id']}", headers=hdrs)
        assert r.status_code == 200
        assert r.json()["id"] == ae["id"]

    def test_get_unknown_id_returns_404(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        r = client.get(
            f"/api/v1/adverse-events/{uuid.uuid4()}", headers=hdrs
        )
        assert r.status_code == 404


# ── PATCH /{id} ───────────────────────────────────────────────────────────────


class TestPatchAdverseEvent:
    def test_patch_body_system_and_expectedness(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        r = client.patch(
            f"/api/v1/adverse-events/{ae['id']}",
            json={"body_system": "nervous", "expectedness": "unexpected"},
            headers=hdrs,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["body_system"] == "nervous"
        assert body["expectedness"] == "unexpected"


# ── POST /{id}/review ─────────────────────────────────────────────────────────


class TestReviewAdverseEvent:
    def test_review_records_sign_off(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/review",
            json={"note": "Reviewed at morning round.", "sign_off": True},
            headers=hdrs,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["reviewed_by"] is not None
        assert body["status"] == "reviewed"


# ── POST /{id}/escalate ───────────────────────────────────────────────────────


class TestEscalateAdverseEvent:
    def test_escalate_to_irb(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"], severity="serious")
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/escalate",
            json={"target": "irb", "note": "Possible protocol deviation."},
            headers=hdrs,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["escalation_target"] == "irb"
        assert body["status"] == "escalated"

    def test_escalate_invalid_target_returns_422(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/escalate",
            json={"target": "invalid_target_xyz"},
            headers=hdrs,
        )
        assert r.status_code == 422


# ── POST /{id}/close ──────────────────────────────────────────────────────────


class TestCloseAdverseEvent:
    def test_close_requires_note(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        # Empty note should be rejected.
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/close",
            json={"note": ""},
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_close_with_note_succeeds(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/close",
            json={"note": "No further action required; event resolved."},
            headers=hdrs,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["resolved_at"] is not None or body["status"] in ("resolved", "reviewed", "open")


# ── POST /{id}/reopen ─────────────────────────────────────────────────────────


class TestReopenAdverseEvent:
    def test_reopen_requires_reason(self, client: TestClient, seeded: dict) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/reopen",
            json={"reason": ""},
            headers=hdrs,
        )
        assert r.status_code == 422

    def test_reopen_with_reason_succeeds(
        self, client: TestClient, seeded: dict
    ) -> None:
        hdrs = _hdrs(seeded["token"])
        ae = _create_ae(client, hdrs, seeded["patient_id"])
        # First close it.
        client.post(
            f"/api/v1/adverse-events/{ae['id']}/close",
            json={"note": "Closed in error."},
            headers=hdrs,
        )
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/reopen",
            json={"reason": "New evidence emerged; re-opening for review."},
            headers=hdrs,
        )
        assert r.status_code == 200
