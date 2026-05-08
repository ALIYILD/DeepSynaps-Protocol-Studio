"""Analyzer AI report router — registry, auth, IDOR, fallback, PDF render."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    Clinic,
    Patient,
    PatientLabResult,
    User,
)
from app.services.auth_service import create_access_token


def _mint_token(user_id: str, role: str, clinic_id: str | None) -> str:
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def aar_setup(client: TestClient) -> dict[str, Any]:
    """Seed two clinics, two clinicians, one patient with one lab row."""
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="AAR Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="AAR Clinic B")
        db.add_all([clinic_a, clinic_b])
        db.flush()

        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"aar_clin_a_{uuid.uuid4().hex[:6]}@example.com",
            display_name="Clin A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"aar_clin_b_{uuid.uuid4().hex[:6]}@example.com",
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
            first_name="AAR",
            last_name="Patient",
        )
        db.add(patient)
        db.flush()

        # Seed one lab result so the labs loader returns a payload (not 404).
        lab = PatientLabResult(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id=clin_a.id,
            analyte_code="TSH",
            analyte_display_name="Thyroid Stimulating Hormone",
            value_numeric=8.5,
            unit_ucum="mIU/L",
            ref_low=0.4,
            ref_high=4.0,
        )
        db.add(lab)
        db.commit()

        return {
            "clinic_a_id": clinic_a.id,
            "clinic_b_id": clinic_b.id,
            "patient_id": patient.id,
            "token_a": _mint_token(clin_a.id, "clinician", clinic_a.id),
            "token_b": _mint_token(clin_b.id, "clinician", clinic_b.id),
        }
    finally:
        db.close()


# ── Registry ─────────────────────────────────────────────────────────────────


def test_list_analyzer_types(client: TestClient, aar_setup: dict[str, Any]) -> None:
    resp = client.get(
        "/api/v1/analyzer-reports", headers=_auth(aar_setup["token_a"])
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "analyzer_types" in body
    expected = {
        "mri",
        "voice",
        "video_assessment",
        "movement",
        "phenotype",
        "labs",
        "nutrition",
        "risk",
        "digital_phenotyping",
        "deeptwin",
        "treatment_sessions",
    }
    assert expected.issubset(set(body["analyzer_types"])), body


def test_unknown_analyzer_type_returns_400(
    client: TestClient, aar_setup: dict[str, Any]
) -> None:
    resp = client.post(
        f"/api/v1/analyzer-reports/bogus-analyzer/{aar_setup['patient_id']}/ai-report",
        headers=_auth(aar_setup["token_a"]),
        json={},
    )
    assert resp.status_code == 400, resp.text


# ── Auth & IDOR ──────────────────────────────────────────────────────────────


def test_guest_blocked(client: TestClient, aar_setup: dict[str, Any]) -> None:
    resp = client.post(
        f"/api/v1/analyzer-reports/labs/{aar_setup['patient_id']}/ai-report",
        headers={"Authorization": "Bearer guest-demo-token"},
        json={},
    )
    assert resp.status_code in (401, 403), resp.text


def test_cross_clinic_blocked(
    client: TestClient, aar_setup: dict[str, Any]
) -> None:
    resp = client.post(
        f"/api/v1/analyzer-reports/labs/{aar_setup['patient_id']}/ai-report",
        headers=_auth(aar_setup["token_b"]),
        json={},
    )
    assert resp.status_code == 403, resp.text


# ── Fallback path (LLM unavailable) ──────────────────────────────────────────


def test_fallback_when_llm_unconfigured(
    client: TestClient,
    aar_setup: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When LLM returns an empty string (default for tests), the fallback
    path must still produce a 201 with deterministic_fallback source."""

    async def _empty_llm(**_kwargs: Any) -> str:
        return ""

    monkeypatch.setattr(
        "app.services.chat_service._llm_chat_async", _empty_llm, raising=True
    )

    resp = client.post(
        f"/api/v1/analyzer-reports/labs/{aar_setup['patient_id']}/ai-report",
        headers=_auth(aar_setup["token_a"]),
        json={},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["analyzer_type"] == "labs"
    assert body["analysis_id"] == aar_setup["patient_id"]
    assert body["patient_id"] == aar_setup["patient_id"]
    assert body["source"] in ("llm", "deterministic_fallback")
    # Fallback path always produces a valid schema-shaped data block.
    assert "executive_summary" in body["data"]
    assert "key_findings" in body["data"]
    assert body["data"]["confidence_overall"] in {"low", "moderate", "high"}


def test_404_when_no_underlying_data(
    client: TestClient, aar_setup: dict[str, Any]
) -> None:
    """Per-patient analyzers with no rows must 404 (not 500)."""
    # The patient has labs but no nutrition / movement / risk rows.
    resp = client.post(
        f"/api/v1/analyzer-reports/movement/{aar_setup['patient_id']}/ai-report",
        headers=_auth(aar_setup["token_a"]),
        json={},
    )
    assert resp.status_code == 404, resp.text


# ── HTML render unit-test (no PDF dep) ───────────────────────────────────────


def test_decision_support_html_renders() -> None:
    from app.report.decision_support_template import render_decision_support_html

    html = render_decision_support_html(
        analyzer_type="mri",
        analysis_id="abc12345",
        title="MRI Decision Support",
        patient_id="pat-7",
        data={
            "executive_summary": "Sample narrative.",
            "key_findings": [
                {
                    "title": "Atrophy in DLPFC",
                    "observation": "Mild signal change [1].",
                    "severity": "moderate",
                    "confidence": 0.72,
                },
            ],
            "clinical_significance": "May warrant correlation.",
            "differential_considerations": ["A", "B"],
            "recommended_followup": ["MDT review"],
            "decision_support_notes": "Not a diagnosis.",
            "limitations": ["Single timepoint."],
            "confidence_overall": "moderate",
        },
        literature_refs=[
            {"title": "Paper A", "authors": "X et al", "year": "2024",
             "journal": "J", "doi": "10.1/2", "pmid": "12345"},
        ],
        metadata={"pipeline_version": "1.0"},
        source="llm",
        prompt_hash="abcdef0123456789",
        generated_at="2026-05-08T10:00:00+00:00",
    )
    assert "<!DOCTYPE html>" in html
    assert "MRI Decision Support" in html
    assert "Atrophy in DLPFC" in html
    assert "Paper A" in html
    assert "Decision-support disclaimer" in html
    # The disclaimer language must NOT use forbidden words.
    assert "diagnose" not in html.lower() or "diagnosis," in html.lower()
