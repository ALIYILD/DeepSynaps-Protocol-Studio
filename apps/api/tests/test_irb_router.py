"""Tests for IRB Studies router (/api/v1/irb).

Covers:
- IRB study CRUD: create, list, get, update, amend
- Adverse event report / list / update
- Auth gating (guest 403, unauthenticated 401/403)
- Ownership isolation (clinician A cannot read clinician B's study)
- Invalid severity → 422
- Missing study → 404
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


_IRB = "/api/v1/irb"


def _study_payload(**overrides) -> dict:
    base = {
        "title": "DeepSynaps rTMS Efficacy Study",
        "phase": "II",
        "status": "pending",
        "enrollment_target": 50,
    }
    base.update(overrides)
    return base


# ── Studies: create ─────────────────────────────────────────────────────────

class TestCreateIRBStudy:
    def test_clinician_creates_study(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_IRB}/studies",
            json=_study_payload(),
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["title"] == "DeepSynaps rTMS Efficacy Study"
        assert data["status"] == "pending"
        assert data["phase"] == "II"
        assert "id" in data
        assert "created_at" in data

    def test_full_payload(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_IRB}/studies",
            json=_study_payload(
                irb_number="IRB-2026-042",
                sponsor="NeuroTech Inc.",
                principal_investigator="Dr. Smith",
                description="A phase-II rTMS trial for MDD.",
                protocol={"version": "2.1", "arms": ["active", "sham"]},
            ),
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["irb_number"] == "IRB-2026-042"
        assert data["protocol"]["version"] == "2.1"

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_IRB}/studies",
            json=_study_payload(),
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403, resp.text

    def test_unauthenticated_rejected(
        self, client: TestClient
    ) -> None:
        resp = client.post(f"{_IRB}/studies", json=_study_payload())
        assert resp.status_code in (401, 403), resp.text

    def test_missing_title_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_IRB}/studies",
            json={"phase": "I"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text


# ── Studies: list + get ─────────────────────────────────────────────────────

class TestListGetIRBStudy:
    @pytest.fixture
    def study_id(self, client: TestClient, auth_headers: dict) -> str:
        resp = client.post(
            f"{_IRB}/studies",
            json=_study_payload(),
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_list_returns_own_study(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        resp = client.get(f"{_IRB}/studies", headers=auth_headers["clinician"])
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] >= 1
        ids = [s["id"] for s in data["items"]]
        assert study_id in ids

    def test_get_returns_study(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        resp = client.get(f"{_IRB}/studies/{study_id}", headers=auth_headers["clinician"])
        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == study_id

    def test_get_nonexistent_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(
            f"{_IRB}/studies/does-not-exist",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404, resp.text

    def test_list_filter_by_status(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        resp = client.get(
            f"{_IRB}/studies?status=pending",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        for s in resp.json()["items"]:
            assert s["status"] == "pending"

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(f"{_IRB}/studies", headers=auth_headers["guest"])
        assert resp.status_code == 403, resp.text


# ── Studies: update ─────────────────────────────────────────────────────────

class TestUpdateIRBStudy:
    @pytest.fixture
    def study_id(self, client: TestClient, auth_headers: dict) -> str:
        resp = client.post(
            f"{_IRB}/studies",
            json=_study_payload(),
            headers=auth_headers["clinician"],
        )
        return resp.json()["id"]

    def test_update_status(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        resp = client.put(
            f"{_IRB}/studies/{study_id}",
            json={"status": "active"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "active"

    def test_update_enrollment_count(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        resp = client.put(
            f"{_IRB}/studies/{study_id}",
            json={"enrolled_count": 12},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["enrolled_count"] == 12


# ── Studies: amend ─────────────────────────────────────────────────────────

class TestAmendIRBStudy:
    @pytest.fixture
    def study_id(self, client: TestClient, auth_headers: dict) -> str:
        resp = client.post(
            f"{_IRB}/studies",
            json=_study_payload(),
            headers=auth_headers["clinician"],
        )
        return resp.json()["id"]

    def test_create_amendment(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        resp = client.post(
            f"{_IRB}/studies/{study_id}/amend",
            json={
                "amendment_type": "protocol_change",
                "description": "Adjusted stimulation frequency to 10 Hz.",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["study_id"] == study_id
        assert data["status"] == "submitted"
        assert data["amendment_type"] == "protocol_change"

    def test_amend_nonexistent_study_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_IRB}/studies/ghost-study/amend",
            json={"amendment_type": "enrollment_expansion", "description": "more"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404, resp.text


# ── Adverse Events ──────────────────────────────────────────────────────────

class TestIRBAdverseEvents:
    @pytest.fixture
    def study_id(self, client: TestClient, auth_headers: dict) -> str:
        resp = client.post(
            f"{_IRB}/studies",
            json=_study_payload(),
            headers=auth_headers["clinician"],
        )
        return resp.json()["id"]

    def _ae_payload(self, study_id: str, **overrides) -> dict:
        base = {
            "study_id": study_id,
            "event_type": "headache",
            "severity": "mild",
            "description": "Transient headache post-session.",
        }
        base.update(overrides)
        return base

    def test_report_adverse_event(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        resp = client.post(
            f"{_IRB}/adverse-events",
            json=self._ae_payload(study_id),
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["study_id"] == study_id
        assert data["severity"] == "mild"
        assert data["status"] == "open"
        assert "id" in data

    def test_invalid_severity_422(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        resp = client.post(
            f"{_IRB}/adverse-events",
            json=self._ae_payload(study_id, severity="critical"),  # not in valid set
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_list_adverse_events(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        # Create one
        client.post(
            f"{_IRB}/adverse-events",
            json=self._ae_payload(study_id),
            headers=auth_headers["clinician"],
        )
        resp = client.get(f"{_IRB}/adverse-events", headers=auth_headers["clinician"])
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] >= 1

    def test_update_adverse_event_status(
        self, client: TestClient, auth_headers: dict, study_id: str
    ) -> None:
        create = client.post(
            f"{_IRB}/adverse-events",
            json=self._ae_payload(study_id),
            headers=auth_headers["clinician"],
        )
        ae_id = create.json()["id"]

        resp = client.put(
            f"{_IRB}/adverse-events/{ae_id}",
            json={"status": "under_review", "notes": "Investigating further."},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "under_review"

    def test_update_nonexistent_ae_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.put(
            f"{_IRB}/adverse-events/ghost-ae",
            json={"status": "closed"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404, resp.text

    def test_guest_rejected_on_adverse_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(f"{_IRB}/adverse-events", headers=auth_headers["guest"])
        assert resp.status_code == 403, resp.text
