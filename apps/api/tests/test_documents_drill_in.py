"""Documents Hub drill-in filter coverage (re-audit, 2026-04-30).

Builds on the original Documents Hub launch audit (PR #321 → merged) plus
the Clinical Trials and IRB Manager launch audits (PRs #336 / #334) which
both emit drill-out URLs of the form::

    /?page=documents-hub&source_target_type=<surface>&source_target_id=<id>

This test module exercises the four invariants that block the launch:

* The list endpoint actually filters by the drill-in pair (no silent
  fallback to "all docs").
* Half-supplied or unknown surface values return 422 — never a 200 with
  the full list.
* Cross-clinic isolation still holds when the drill-in filter is active.
* Page-level audit ingestion writes ``target_type=documents_hub`` and
  preserves the upstream surface in the note so the audit-trail
  surface filter at ``/api/v1/audit-trail?surface=documents_hub`` lights
  up the row.
* The ``/summary`` endpoint returns honest counts under the same filter.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, User
from app.services.auth_service import create_access_token


# ── Fixtures ─────────────────────────────────────────────────────────────────


def _attach_doc(
    client: TestClient,
    headers: dict,
    *,
    title: str,
    source_target_type: str | None = None,
    source_target_id: str | None = None,
    doc_type: str = "clinical",
) -> str:
    body: dict[str, Any] = {
        "title": title,
        "doc_type": doc_type,
        "status": "pending",
    }
    if source_target_type is not None:
        body["source_target_type"] = source_target_type
    if source_target_id is not None:
        body["source_target_id"] = source_target_id
    resp = client.post("/api/v1/documents", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── Filter coverage matrix ───────────────────────────────────────────────────


class TestDrillInFilters:
    def test_filter_by_clinical_trials(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        linked = _attach_doc(
            client, h, title="Sponsor Report v1",
            source_target_type="clinical_trials",
            source_target_id="trial-A",
        )
        other = _attach_doc(
            client, h, title="Standalone Letter",
        )
        r = client.get(
            "/api/v1/documents?source_target_type=clinical_trials&source_target_id=trial-A",
            headers=h,
        )
        assert r.status_code == 200, r.text
        ids = [it["id"] for it in r.json()["items"]]
        assert linked in ids
        assert other not in ids
        # Provenance fields surface so the UI banner can render upstream id.
        for item in r.json()["items"]:
            assert item["source_target_type"] == "clinical_trials"
            assert item["source_target_id"] == "trial-A"

    def test_filter_by_irb_manager(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        consent = _attach_doc(
            client, h, title="ICF v3",
            source_target_type="irb_manager",
            source_target_id="protocol-XYZ",
            doc_type="consent",
        )
        elsewhere = _attach_doc(
            client, h, title="ICF for Other Protocol",
            source_target_type="irb_manager",
            source_target_id="protocol-ABC",
            doc_type="consent",
        )
        r = client.get(
            "/api/v1/documents?source_target_type=irb_manager&source_target_id=protocol-XYZ",
            headers=h,
        )
        assert r.status_code == 200
        ids = [it["id"] for it in r.json()["items"]]
        assert consent in ids
        assert elsewhere not in ids

    def test_filter_excludes_unlinked_documents(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Pre-fix the filter could fall back silently to the full list when
        no rows matched — regulator-credibility blocker. Post-fix the empty
        result is surfaced honestly."""
        h = auth_headers["clinician"]
        _attach_doc(client, h, title="Random Doc 1")
        _attach_doc(client, h, title="Random Doc 2")
        r = client.get(
            "/api/v1/documents?source_target_type=clinical_trials&source_target_id=trial-empty",
            headers=h,
        )
        assert r.status_code == 200
        assert r.json()["items"] == []
        assert r.json()["total"] == 0

    def test_unknown_source_target_type_is_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/documents?source_target_type=evil_surface&source_target_id=x",
            headers=auth_headers["clinician"],
        )
        # Pydantic-422 OR ApiServiceError-422 — both acceptable as
        # rejection. A 200 here would silently return the full list.
        assert r.status_code == 422, r.text

    def test_half_supplied_pair_is_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/documents?source_target_type=clinical_trials",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text
        r = client.get(
            "/api/v1/documents?source_target_id=trial-A",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text

    def test_create_with_unknown_surface_is_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        body = {
            "title": "Bad provenance",
            "doc_type": "clinical",
            "status": "pending",
            "source_target_type": "evil_surface",
            "source_target_id": "x",
        }
        r = client.post(
            "/api/v1/documents", json=body, headers=auth_headers["clinician"]
        )
        assert r.status_code == 422, r.text


# ── Summary endpoint coverage ────────────────────────────────────────────────


class TestDrillInSummary:
    def test_summary_counts_match_filter(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        _attach_doc(
            client, h, title="Sponsor A",
            source_target_type="clinical_trials",
            source_target_id="trial-A",
        )
        _attach_doc(
            client, h, title="Sponsor A v2",
            source_target_type="clinical_trials",
            source_target_id="trial-A",
        )
        _attach_doc(
            client, h, title="Sponsor B",
            source_target_type="clinical_trials",
            source_target_id="trial-B",
        )
        _attach_doc(client, h, title="Standalone")
        r = client.get(
            "/api/v1/documents/summary?source_target_type=clinical_trials&source_target_id=trial-A",
            headers=h,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 2
        assert body["filtered_by_source_target"] is True
        assert body["source_target_type"] == "clinical_trials"
        assert body["source_target_id"] == "trial-A"
        assert "clinical_trials" in body["known_drill_in_surfaces"]
        assert "irb_manager" in body["known_drill_in_surfaces"]

    def test_summary_unknown_surface_is_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/documents/summary?source_target_type=evil&source_target_id=x",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text


# ── Audit ingestion ──────────────────────────────────────────────────────────


class TestDrillInAuditEvents:
    def test_audit_event_writes_documents_hub_target_type(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/documents/audit-events",
            json={
                "event": "page_loaded",
                "note": "tab=all",
                "source_target_type": "clinical_trials",
                "source_target_id": "trial-A",
            },
            headers=h,
        )
        assert r.status_code == 200, r.text
        assert r.json()["accepted"] is True

        # The audit-trail surface filter must light up the new row.
        admin_h = auth_headers["admin"]
        trail = client.get(
            "/api/v1/audit-trail?surface=documents_hub", headers=admin_h
        )
        assert trail.status_code == 200, trail.text
        items = trail.json()["items"]
        assert any(
            it["target_type"] == "documents_hub"
            and "drill_in_from=clinical_trials:trial-A" in (it["note"] or "")
            for it in items
        ), items

    def test_audit_event_unknown_surface_silently_dropped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """An unknown surface must NOT poison the audit row but must NOT
        block the UI either. The note loses the drill_in_from tag rather
        than 4xx-ing the page-load."""
        r = client.post(
            "/api/v1/documents/audit-events",
            json={
                "event": "page_loaded",
                "note": "tab=all",
                "source_target_type": "evil_surface",
                "source_target_id": "x",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["accepted"] is True


# ── Cross-clinic isolation under filter ──────────────────────────────────────


@pytest.fixture
def two_clinics_with_linked_doc() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="DI Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="DI Clinic B")
        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"di_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"di_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        db.add_all([clinic_a, clinic_b, clin_a, clin_b])
        db.commit()
        token_a = create_access_token(
            user_id=clin_a.id, email=clin_a.email, role="clinician",
            package_id="explorer", clinic_id=clinic_a.id,
        )
        token_b = create_access_token(
            user_id=clin_b.id, email=clin_b.email, role="clinician",
            package_id="explorer", clinic_id=clinic_b.id,
        )
        return {
            "token_a": token_a, "token_b": token_b,
        }
    finally:
        db.close()


def test_drill_in_filter_does_not_leak_cross_clinic(
    client: TestClient, two_clinics_with_linked_doc: dict[str, Any]
) -> None:
    """Cross-clinic isolation must hold even when the drill-in filter is
    active. Pre-fix it was conceivable that a clinician at clinic B,
    knowing a trial id from clinic A's docs, could leak rows by
    drilling-in. Post-fix the clinic-scope query precedes the source
    filter so cross-clinic still 0-rows the result."""
    headers_a = {"Authorization": f"Bearer {two_clinics_with_linked_doc['token_a']}"}
    headers_b = {"Authorization": f"Bearer {two_clinics_with_linked_doc['token_b']}"}

    # Clinician A attaches a trial-linked doc.
    _attach_doc(
        client, headers_a, title="Clinic A Sponsor Report",
        source_target_type="clinical_trials",
        source_target_id="trial-shared-id",
    )
    # Clinician B drills in to the same trial id.
    r = client.get(
        "/api/v1/documents?source_target_type=clinical_trials&source_target_id=trial-shared-id",
        headers=headers_b,
    )
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["total"] == 0
