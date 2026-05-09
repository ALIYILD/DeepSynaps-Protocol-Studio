"""Tests for risk_analyzer_router.py.

Covers:
- Auth: unauthenticated (guest) gets 403 (require_minimum_role fires before payload)
- GET  /patient/{id}: unknown patient returns 404
- GET  /patient/{id}: owned patient returns expected payload shape (service mocked)
- GET  /patient/{id}: cross-clinic clinician gets 403/404 (IDOR guard)
- POST /patient/{id}/recompute: runs for owned patient (service mocked)
- POST /patient/{id}/override: invalid category → 422
- POST /patient/{id}/override: valid override saved (service mocked)
- POST /patient/{id}/formulation: persists formulation data
- POST /patient/{id}/safety-plan: persists safety plan
- GET  /patient/{id}/audit: returns audit events list
"""
from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User


# Minimal stub returned from the mocked payload builder so we never hit ML/torch code.
_STUB_PAYLOAD = {
    "patient_id": "REPLACED_AT_RUNTIME",
    "risk_profile": {},
    "categories": {},
    "formulation": {},
    "safety_plan": {},
    "audit_events": [],
}


def _mint(user_id: str, role: str, clinic_id: str | None) -> str:
    from app.services.auth_service import create_access_token
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )


def _hdrs(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seeded() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="RA Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="RA Clinic B")
        db.add_all([clinic_a, clinic_b])
        db.flush()

        clin_a_id = str(uuid.uuid4())
        clin_b_id = str(uuid.uuid4())
        clin_a = User(
            id=clin_a_id,
            email=f"ra_a_{clin_a_id[:6]}@example.com",
            display_name="RA A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=clin_b_id,
            email=f"ra_b_{clin_b_id[:6]}@example.com",
            display_name="RA B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        db.add_all([clin_a, clin_b])
        db.flush()

        patient_id = str(uuid.uuid4())
        patient = Patient(
            id=patient_id,
            clinician_id=clin_a_id,
            first_name="Risk",
            last_name="Patient",
        )
        db.add(patient)
        db.commit()

        return {
            "patient_id": patient_id,
            "clinic_a_id": clinic_a.id,
            "tok_a": _mint(clin_a_id, "clinician", clinic_a.id),
            "tok_b": _mint(clin_b_id, "clinician", clinic_b.id),
        }
    finally:
        db.close()


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_get_page_requires_auth(client: TestClient) -> None:
    """Unauthenticated (guest) request must be rejected with 403."""
    r = client.get("/api/v1/risk/analyzer/patient/some-pid")
    assert r.status_code == 403


def test_guest_token_rejected(client: TestClient) -> None:
    r = client.get(
        "/api/v1/risk/analyzer/patient/some-pid",
        headers={"Authorization": "Bearer guest-demo-token"},
    )
    assert r.status_code == 403


# ── Not-found ────────────────────────────────────────────────────────────────

def test_unknown_patient_returns_404(client: TestClient, seeded: dict) -> None:
    """Payload builder returns patient_not_found → router raises 404."""
    with patch(
        "app.routers.risk_analyzer_router.build_risk_analyzer_payload",
        return_value={"error": "patient_not_found"},
    ):
        r = client.get(
            "/api/v1/risk/analyzer/patient/no-such-patient",
            headers=_hdrs(seeded["tok_a"]),
        )
    assert r.status_code == 404


# ── IDOR guard ───────────────────────────────────────────────────────────────

def test_cross_clinic_clinician_cannot_read_page(client: TestClient, seeded: dict) -> None:
    r = client.get(
        f"/api/v1/risk/analyzer/patient/{seeded['patient_id']}",
        headers=_hdrs(seeded["tok_b"]),
    )
    assert r.status_code in {403, 404}


# ── Happy path ───────────────────────────────────────────────────────────────

def test_get_page_returns_expected_keys(client: TestClient, seeded: dict) -> None:
    stub = {**_STUB_PAYLOAD, "patient_id": seeded["patient_id"]}
    with patch(
        "app.routers.risk_analyzer_router.build_risk_analyzer_payload",
        return_value=stub,
    ):
        r = client.get(
            f"/api/v1/risk/analyzer/patient/{seeded['patient_id']}",
            headers=_hdrs(seeded["tok_a"]),
        )
    assert r.status_code == 200
    body = r.json()
    # The payload passes through to the caller; check for the injected audit_events
    assert "audit_events" in body
    assert isinstance(body["audit_events"], list)


def test_recompute_endpoint(client: TestClient, seeded: dict) -> None:
    stub = {**_STUB_PAYLOAD, "patient_id": seeded["patient_id"]}
    with patch(
        "app.routers.risk_analyzer_router.build_risk_analyzer_payload",
        return_value=stub,
    ), patch("app.routers.risk_analyzer_router.compute_risk_profile"):
        r = client.post(
            f"/api/v1/risk/analyzer/patient/{seeded['patient_id']}/recompute",
            json={"reason": "routine review"},
            headers=_hdrs(seeded["tok_a"]),
        )
    assert r.status_code == 200


# ── Override ──────────────────────────────────────────────────────────────────

def test_override_invalid_category_422(client: TestClient, seeded: dict) -> None:
    r = client.post(
        f"/api/v1/risk/analyzer/patient/{seeded['patient_id']}/override",
        json={"category": "not_a_real_category", "level": "red", "reason": "test reason"},
        headers=_hdrs(seeded["tok_a"]),
    )
    assert r.status_code == 422


def test_override_valid_category(client: TestClient, seeded: dict) -> None:
    from app.services.risk_evidence_map import RISK_CATEGORIES
    category = next(iter(RISK_CATEGORIES))
    stub = {**_STUB_PAYLOAD, "patient_id": seeded["patient_id"]}
    with patch(
        "app.routers.risk_analyzer_router.apply_category_override",
        return_value={"ok": True},
    ), patch(
        "app.routers.risk_analyzer_router.build_risk_analyzer_payload",
        return_value=stub,
    ):
        r = client.post(
            f"/api/v1/risk/analyzer/patient/{seeded['patient_id']}/override",
            json={"category": category, "level": "amber", "reason": "clinical assessment"},
            headers=_hdrs(seeded["tok_a"]),
        )
    assert r.status_code == 200


# ── Formulation & safety plan ─────────────────────────────────────────────────

def test_save_formulation(client: TestClient, seeded: dict) -> None:
    r = client.post(
        f"/api/v1/risk/analyzer/patient/{seeded['patient_id']}/formulation",
        json={"narrative_formulation": "Patient presents with chronic low mood."},
        headers=_hdrs(seeded["tok_a"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "formulation" in body


def test_save_safety_plan(client: TestClient, seeded: dict) -> None:
    r = client.post(
        f"/api/v1/risk/analyzer/patient/{seeded['patient_id']}/safety-plan",
        json={"status": "in_progress", "summary": "Crisis numbers given."},
        headers=_hdrs(seeded["tok_a"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "safety_plan" in body


def test_get_audit(client: TestClient, seeded: dict) -> None:
    r = client.get(
        f"/api/v1/risk/analyzer/patient/{seeded['patient_id']}/audit",
        headers=_hdrs(seeded["tok_a"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["patient_id"] == seeded["patient_id"]
    assert isinstance(body["events"], list)
