"""Tests for qEEG Report Annotations router (/api/v1/qeeg-report-annotations).

Covers:
- happy-path create / list / update / delete / resolve / summary / audit events
- auth gating (guest 403, unauthenticated 401/403)
- 422 validation (body too long)
- missing required query params → 422
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User


# ── Helpers ────────────────────────────────────────────────────────────────────

_ANNS = "/api/v1/qeeg-report-annotations"


def _seed_patient(db, pid: str, clinician_id: str) -> None:
    if db.query(Patient).filter_by(id=pid).first() is None:
        db.add(Patient(
            id=pid,
            clinician_id=clinician_id,
            first_name="Ann",
            last_name="Test",
            dob="1990-01-01",
        ))
        db.commit()


@pytest.fixture
def ann_patient(auth_headers: dict) -> str:
    """Create a patient owned by the demo clinician and return patient_id."""
    db = SessionLocal()
    try:
        pid = "ann-test-patient-1"
        _seed_patient(db, pid, "actor-clinician-demo")
        return pid
    finally:
        db.close()


_GOOD_BODY = {
    "section_path": "alpha.frontal",
    "annotation_kind": "margin_note",
    "body": "Elevated frontal theta noted.",
    "flag_type": None,
}


def _create_payload(patient_id: str, report_id: str = "rep-001") -> dict:
    return {
        "patient_id": patient_id,
        "report_id": report_id,
        "section_path": "alpha.frontal",
        "annotation_kind": "margin_note",
        "body": "Elevated frontal theta noted.",
    }


# ── Create ─────────────────────────────────────────────────────────────────────

class TestCreateAnnotation:
    def test_clinician_creates_annotation(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        resp = client.post(
            f"{_ANNS}/annotations",
            json=_create_payload(ann_patient),
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["patient_id"] == ann_patient
        assert data["annotation_kind"] == "margin_note"
        assert "id" in data

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        resp = client.post(
            f"{_ANNS}/annotations",
            json=_create_payload(ann_patient),
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403, resp.text

    def test_unauthenticated_rejected(
        self, client: TestClient, ann_patient: str
    ) -> None:
        resp = client.post(
            f"{_ANNS}/annotations",
            json=_create_payload(ann_patient),
        )
        assert resp.status_code in (401, 403), resp.text

    def test_body_too_long_422(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        payload = _create_payload(ann_patient)
        payload["body"] = "x" * 3000   # BODY_MAX_LEN is 2000
        resp = client.post(
            f"{_ANNS}/annotations",
            json=payload,
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_missing_required_fields_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Missing patient_id, report_id, body etc.
        resp = client.post(
            f"{_ANNS}/annotations",
            json={"body": "test"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text


# ── List ───────────────────────────────────────────────────────────────────────

class TestListAnnotations:
    def test_list_requires_patient_id_and_report_id(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Missing required query params
        resp = client.get(f"{_ANNS}/annotations", headers=auth_headers["clinician"])
        assert resp.status_code == 422, resp.text

    def test_list_returns_empty_for_unknown_patient(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        resp = client.get(
            f"{_ANNS}/annotations?patient_id={ann_patient}&report_id=rep-empty",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_returns_created_annotation(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        # Create one first
        create_resp = client.post(
            f"{_ANNS}/annotations",
            json=_create_payload(ann_patient, "rep-X"),
            headers=auth_headers["clinician"],
        )
        assert create_resp.status_code == 201

        resp = client.get(
            f"{_ANNS}/annotations?patient_id={ann_patient}&report_id=rep-X",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["annotation_kind"] == "margin_note"

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        resp = client.get(
            f"{_ANNS}/annotations?patient_id={ann_patient}&report_id=rep-X",
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403, resp.text


# ── Update / Resolve / Delete ──────────────────────────────────────────────────

class TestAnnotationMutations:
    def _create(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> str:
        resp = client.post(
            f"{_ANNS}/annotations",
            json=_create_payload(ann_patient),
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_patch_updates_body(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        ann_id = self._create(client, auth_headers, ann_patient)
        resp = client.patch(
            f"{_ANNS}/annotations/{ann_id}",
            json={"body": "Updated note."},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["body"] == "Updated note."

    def test_resolve_marks_annotation(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        ann_id = self._create(client, auth_headers, ann_patient)
        resp = client.post(
            f"{_ANNS}/annotations/{ann_id}/resolve",
            json={"resolution_note": "Reviewed by senior clinician."},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["resolved_at"] is not None

    def test_delete_returns_204(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        ann_id = self._create(client, auth_headers, ann_patient)
        resp = client.delete(
            f"{_ANNS}/annotations/{ann_id}",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 204, resp.text


# ── Summary ────────────────────────────────────────────────────────────────────

class TestSummaryEndpoint:
    def test_summary_empty_report(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        resp = client.get(
            f"{_ANNS}/summary?patient_id={ann_patient}&report_id=rep-no-anns",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] == 0
        assert data["open"] == 0

    def test_summary_counts_annotation(
        self, client: TestClient, auth_headers: dict, ann_patient: str
    ) -> None:
        client.post(
            f"{_ANNS}/annotations",
            json=_create_payload(ann_patient, "rep-sum-1"),
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            f"{_ANNS}/summary?patient_id={ann_patient}&report_id=rep-sum-1",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] == 1
        assert data["open"] == 1

    def test_summary_requires_patient_id_and_report_id(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(f"{_ANNS}/summary", headers=auth_headers["clinician"])
        assert resp.status_code == 422, resp.text


# ── Audit events ───────────────────────────────────────────────────────────────

class TestAuditEvents:
    def test_get_audit_events_empty(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(f"{_ANNS}/audit-events", headers=auth_headers["clinician"])
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "items" in data
        assert data["surface"] == "qeeg_report_annotations"

    def test_post_audit_event(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_ANNS}/audit-events",
            json={"event": "page_view"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["accepted"] is True
        assert "event_id" in data

    def test_audit_event_too_long_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_ANNS}/audit-events",
            json={"event": "x" * 100},  # event max 64
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_guest_audit_events_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(f"{_ANNS}/audit-events", headers=auth_headers["guest"])
        assert resp.status_code == 403, resp.text
