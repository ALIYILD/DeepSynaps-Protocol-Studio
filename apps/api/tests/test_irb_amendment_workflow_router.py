"""Tests for IRB-AMD1: IRB Amendment Workflow router.

Covers:
- GET /amendments — empty list returns list shape
- GET /amendments — guest → 403
- POST /amendments — create draft amendment against a real protocol
- POST /amendments — missing required fields → 422
- GET /amendments/{id} — detail endpoint returns diff + payload
- GET /amendments — status filter with invalid value → 422
- GET /audit-events — happy path returns surface audit list
- POST /audit-events — page-level audit ingestion → accepted=True
"""
from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import IRBProtocol

_BASE = "/api/v1/irb-amendment-workflow"


@pytest.fixture
def irb_protocol() -> IRBProtocol:
    """Seed a minimal IRBProtocol owned by the demo clinic."""
    db = SessionLocal()
    try:
        proto = IRBProtocol(
            id=str(uuid.uuid4()),
            clinic_id="clinic-demo-default",
            title="Demo rTMS Protocol for Amendment Tests",
            status="approved",
            pi_user_id="actor-clinician-demo",
            created_by="actor-clinician-demo",
            is_demo=False,
        )
        db.add(proto)
        db.commit()
        db.refresh(proto)
        return proto
    finally:
        db.close()


class TestListAmendments:
    def test_empty_list_returns_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/amendments", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)
        assert "total" in body

    def test_guest_is_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/amendments", headers=auth_headers["guest"])
        assert r.status_code == 403, r.text

    def test_invalid_status_filter_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/amendments?status=invalid_status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text


class TestCreateAmendment:
    def test_happy_path_creates_draft(
        self,
        client: TestClient,
        auth_headers: dict,
        irb_protocol: IRBProtocol,
    ) -> None:
        r = client.post(
            f"{_BASE}/amendments",
            json={
                "parent_protocol_id": irb_protocol.id,
                "title": "Amendment v2 — updated eligibility criteria",
                "reason": "Expanded inclusion criteria to include age 65-75.",
                "amendment_type": "protocol_change",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert "id" in body
        assert body["status"] == "draft"
        assert "diff" in body
        assert isinstance(body["diff"], list)

    def test_missing_reason_422(
        self, client: TestClient, auth_headers: dict, irb_protocol: IRBProtocol
    ) -> None:
        r = client.post(
            f"{_BASE}/amendments",
            json={
                "parent_protocol_id": irb_protocol.id,
                "title": "No reason amendment",
                # reason is required
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text

    def test_missing_title_422(
        self, client: TestClient, auth_headers: dict, irb_protocol: IRBProtocol
    ) -> None:
        r = client.post(
            f"{_BASE}/amendments",
            json={
                "parent_protocol_id": irb_protocol.id,
                "reason": "Valid reason without title",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text

    def test_nonexistent_protocol_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{_BASE}/amendments",
            json={
                "parent_protocol_id": "no-such-protocol",
                "title": "Orphan amendment",
                "reason": "This protocol does not exist.",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


class TestGetAmendmentDetail:
    def test_detail_returns_payload_and_diff(
        self,
        client: TestClient,
        auth_headers: dict,
        irb_protocol: IRBProtocol,
    ) -> None:
        # First create an amendment.
        create_r = client.post(
            f"{_BASE}/amendments",
            json={
                "parent_protocol_id": irb_protocol.id,
                "title": "Detail test amendment",
                "reason": "Testing the detail endpoint.",
            },
            headers=auth_headers["clinician"],
        )
        assert create_r.status_code == 201, create_r.text
        amd_id = create_r.json()["id"]

        r = client.get(
            f"{_BASE}/amendments/{amd_id}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == amd_id
        assert "payload" in body
        assert "diff" in body

    def test_nonexistent_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/amendments/does-not-exist",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


class TestAuditEvents:
    def test_get_returns_list_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/audit-events", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert "surface" in body

    def test_post_page_audit_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{_BASE}/audit-events",
            json={"event": "amendments_list_viewed"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert "event_id" in body
