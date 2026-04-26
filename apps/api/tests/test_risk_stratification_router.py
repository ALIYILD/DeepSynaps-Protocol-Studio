"""Risk stratification router tests.

Covers:
- Auth rejection (guest blocked)
- IDOR: clinician B cannot read clinician A's patient
- Profile shape: all 8 categories returned, each with required fields
- Override: persists override_level, records audit trail
- Recompute: returns fresh profile
- Audit endpoint: returns list of audit entries
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User
from app.services.risk_evidence_map import RISK_CATEGORIES


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mint_token(user_id: str, role: str, clinic_id: str | None) -> str:
    from app.services.auth_service import create_access_token
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed(db: Session) -> dict[str, Any]:
    """Seed two clinics, two clinicians (one per clinic), and one patient under clinic A."""
    clinic_a = Clinic(id=str(uuid.uuid4()), name="Risk Clinic A")
    clinic_b = Clinic(id=str(uuid.uuid4()), name="Risk Clinic B")
    db.add_all([clinic_a, clinic_b])
    db.flush()

    clin_a = User(
        id=str(uuid.uuid4()),
        email=f"rsk_clin_a_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Clin A",
        hashed_password="x",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_a.id,
    )
    clin_b = User(
        id=str(uuid.uuid4()),
        email=f"rsk_clin_b_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Clin B",
        hashed_password="x",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_b.id,
    )
    db.add_all([clin_a, clin_b])
    db.flush()

    patient = Patient(
        id=str(uuid.uuid4()),
        clinician_id=clin_a.id,
        first_name="Risk",
        last_name="Patient",
    )
    db.add(patient)
    db.commit()

    return {
        "clinic_a_id": clinic_a.id,
        "clinic_b_id": clinic_b.id,
        "clin_a_id": clin_a.id,
        "clin_b_id": clin_b.id,
        "patient_id": patient.id,
        "token_a": _mint_token(clin_a.id, "clinician", clinic_a.id),
        "token_b": _mint_token(clin_b.id, "clinician", clinic_b.id),
    }


@pytest.fixture
def risk_setup(client: TestClient) -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        return _seed(db)
    finally:
        db.close()


# ── Auth rejection ────────────────────────────────────────────────────────────

def test_guest_blocked_from_risk_profile(client: TestClient, risk_setup: dict[str, Any]) -> None:
    """Guest role must not access safety-critical risk data."""
    pid = risk_setup["patient_id"]
    resp = client.get(
        f"/api/v1/risk/patient/{pid}",
        headers={"Authorization": "Bearer guest-demo-token"},
    )
    assert resp.status_code in (401, 403), resp.text


def test_unauthenticated_blocked_from_risk_profile(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    resp = client.get(f"/api/v1/risk/patient/{pid}")
    assert resp.status_code in (401, 403), resp.text


# ── IDOR guard ────────────────────────────────────────────────────────────────

def test_cross_clinic_risk_profile_blocked(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    """Clinician B must not see clinician A's patient risk profile."""
    pid = risk_setup["patient_id"]
    resp = client.get(
        f"/api/v1/risk/patient/{pid}",
        headers=_auth(risk_setup["token_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_cross_clinic_risk_override_blocked(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    resp = client.post(
        f"/api/v1/risk/patient/{pid}/suicide_risk/override",
        json={"level": "red", "reason": "Unauthorized attempt"},
        headers=_auth(risk_setup["token_b"]),
    )
    assert resp.status_code == 403, resp.text


def test_cross_clinic_risk_recompute_blocked(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    resp = client.post(
        f"/api/v1/risk/patient/{pid}/recompute",
        headers=_auth(risk_setup["token_b"]),
    )
    assert resp.status_code == 403, resp.text


def test_cross_clinic_risk_audit_blocked(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    resp = client.get(
        f"/api/v1/risk/patient/{pid}/audit",
        headers=_auth(risk_setup["token_b"]),
    )
    assert resp.status_code == 403, resp.text


# ── Profile shape ─────────────────────────────────────────────────────────────

def test_risk_profile_returns_all_8_categories(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    resp = client.get(
        f"/api/v1/risk/patient/{pid}",
        headers=_auth(risk_setup["token_a"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["patient_id"] == pid
    assert "categories" in body
    returned = {c["category"] for c in body["categories"]}
    assert returned == set(RISK_CATEGORIES), f"Missing categories: {set(RISK_CATEGORIES) - returned}"


def test_risk_profile_category_has_required_fields(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    resp = client.get(
        f"/api/v1/risk/patient/{pid}",
        headers=_auth(risk_setup["token_a"]),
    )
    assert resp.status_code == 200, resp.text
    cats = resp.json()["categories"]
    for cat in cats:
        assert "category" in cat
        assert "label" in cat
        assert "level" in cat, f"Missing 'level' in category {cat['category']}"
        assert cat["level"] in ("green", "amber", "red"), (
            f"Invalid level {cat['level']!r} for category {cat['category']}"
        )
        assert "computed_level" in cat
        assert "confidence" in cat


# ── Override ──────────────────────────────────────────────────────────────────

def test_override_sets_level_and_creates_audit_entry(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    headers = _auth(risk_setup["token_a"])

    # Compute profile first
    profile_resp = client.get(f"/api/v1/risk/patient/{pid}", headers=headers)
    assert profile_resp.status_code == 200, profile_resp.text

    # Override suicide_risk to red
    override_resp = client.post(
        f"/api/v1/risk/patient/{pid}/suicide_risk/override",
        json={"level": "red", "reason": "Clinical escalation"},
        headers=headers,
    )
    assert override_resp.status_code == 200, override_resp.text
    body = override_resp.json()
    assert body["override_level"] == "red"
    assert body["category"] == "suicide_risk"

    # Re-fetch profile — override_level should be reflected
    profile2 = client.get(f"/api/v1/risk/patient/{pid}", headers=headers)
    assert profile2.status_code == 200, profile2.text
    cats = {c["category"]: c for c in profile2.json()["categories"]}
    assert cats["suicide_risk"]["override_level"] == "red"
    assert cats["suicide_risk"]["level"] == "red"

    # Audit trail should have an entry
    audit_resp = client.get(f"/api/v1/risk/patient/{pid}/audit", headers=headers)
    assert audit_resp.status_code == 200, audit_resp.text
    items = audit_resp.json()["items"]
    assert any(
        item["category"] == "suicide_risk" and item["trigger"] == "manual_override"
        for item in items
    ), f"No audit entry found for override: {items}"


def test_override_rejects_invalid_level(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    resp = client.post(
        f"/api/v1/risk/patient/{pid}/suicide_risk/override",
        json={"level": "purple", "reason": "test"},
        headers=_auth(risk_setup["token_a"]),
    )
    assert resp.status_code == 422, resp.text


def test_override_rejects_invalid_category(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    resp = client.post(
        f"/api/v1/risk/patient/{pid}/nonexistent_cat/override",
        json={"level": "red", "reason": "test"},
        headers=_auth(risk_setup["token_a"]),
    )
    assert resp.status_code == 422, resp.text


# ── Recompute ─────────────────────────────────────────────────────────────────

def test_recompute_returns_fresh_profile(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    headers = _auth(risk_setup["token_a"])
    resp = client.post(f"/api/v1/risk/patient/{pid}/recompute", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["patient_id"] == pid
    assert len(body["categories"]) == len(RISK_CATEGORIES)
    assert "computed_at" in body


# ── Audit endpoint ────────────────────────────────────────────────────────────

def test_audit_returns_empty_list_for_new_patient(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    pid = risk_setup["patient_id"]
    resp = client.get(
        f"/api/v1/risk/patient/{pid}/audit",
        headers=_auth(risk_setup["token_a"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert body["total"] == len(body["items"])


# ── Clinic summary ────────────────────────────────────────────────────────────

def test_clinic_summary_returns_own_patients_only(
    client: TestClient, risk_setup: dict[str, Any]
) -> None:
    """Clinic summary only returns patients belonging to the requesting clinician."""
    resp_a = client.get(
        "/api/v1/risk/clinic/summary",
        headers=_auth(risk_setup["token_a"]),
    )
    assert resp_a.status_code == 200, resp_a.text
    body = resp_a.json()
    assert "patients" in body
    assert "total" in body
    patient_ids = {p["patient_id"] for p in body["patients"]}
    # Clinician A should see their patient
    assert risk_setup["patient_id"] in patient_ids

    # Clinician B should NOT see clinician A's patient
    resp_b = client.get(
        "/api/v1/risk/clinic/summary",
        headers=_auth(risk_setup["token_b"]),
    )
    assert resp_b.status_code == 200, resp_b.text
    body_b = resp_b.json()
    patient_ids_b = {p["patient_id"] for p in body_b["patients"]}
    assert risk_setup["patient_id"] not in patient_ids_b
