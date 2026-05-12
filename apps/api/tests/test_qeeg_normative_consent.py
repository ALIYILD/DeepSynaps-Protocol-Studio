"""Consent enforcement for qEEG normative card and AI report (PR2 hardening, refs #841)."""

from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient


def _uniq() -> str:
    return uuid.uuid4().hex[:10]


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    with TestClient(app) as tc:
        yield tc


def _seed_bundle(
    *,
    with_consent: bool,
    demo_patient: bool = False,
    patient_id: str | None = None,
) -> tuple[str, str]:
    """Return ``(analysis_id, jwt)`` after seeding Clinic/User/Patient/QEEGAnalysis.

    ``patient_id`` overrides the default ``cg-pt-*`` / ``demo-pt-*`` roster when set
    (used for negative tests on demo-like strings that must **not** bypass consent).
    """
    from app.database import SessionLocal
    from app.persistence.models import Clinic, ConsentRecord, Patient, QEEGAnalysis, User
    from app.routers.qeeg_analysis_router import _is_demo_id
    from app.services.auth_service import create_access_token

    su = _uniq()
    clinic_id = f"cg-clinic-{su}"
    user_id = f"cg-cli-{su}"
    if patient_id is not None:
        resolved_patient = patient_id
    else:
        resolved_patient = f"demo-pt-{su}" if demo_patient else f"cg-pt-{su}"
    analysis_id = f"cg-an-{su}"

    db = SessionLocal()
    try:
        db.add(Clinic(id=clinic_id, name="Consent Gate"))
        db.add(
            User(
                id=user_id,
                email=f"{user_id}@example.com",
                display_name="CG Clinician",
                hashed_password="not_real",
                role="clinician",
                clinic_id=clinic_id,
            )
        )
        db.add(
            Patient(
                id=resolved_patient,
                clinician_id=user_id,
                first_name="C",
                last_name="G",
                dob="1991-06-01",
            )
        )
        if with_consent and not _is_demo_id(resolved_patient):
            db.add(
                ConsentRecord(
                    patient_id=resolved_patient,
                    clinician_id=user_id,
                    consent_type="ai_analysis",
                    status="active",
                    signed=True,
                )
            )
        db.add(
            QEEGAnalysis(
                id=analysis_id,
                patient_id=resolved_patient,
                clinician_id=user_id,
                analysis_status="completed",
                eyes_condition="closed",
                band_powers_json=json.dumps({"bands": {"alpha": {"channels": {"Cz": {}}}}}),
            )
        )
        db.commit()
    finally:
        db.close()

    token = create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_id,
    )
    return analysis_id, token


def test_normative_model_card_returns_403_without_ai_analysis_consent(
    client: TestClient,
) -> None:
    analysis_id, token = _seed_bundle(with_consent=False, demo_patient=False)
    r = client.get(
        f"/api/v1/qeeg-analysis/{analysis_id}/normative-model-card",
        headers=_headers(token),
    )
    assert r.status_code == 403, r.text
    body = r.json()
    assert body.get("code") == "consent_missing"
    assert set(body.keys()) <= {"code", "message", "warnings", "details"}
    assert body.get("message") == "ai_analysis consent required"


def test_normative_model_card_returns_200_with_ai_analysis_consent(
    client: TestClient,
) -> None:
    analysis_id, token = _seed_bundle(with_consent=True, demo_patient=False)
    r = client.get(
        f"/api/v1/qeeg-analysis/{analysis_id}/normative-model-card",
        headers=_headers(token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "normative_provider" in body
    assert body.get("recording_condition") == "eyes_closed"


def test_normative_model_card_demo_patient_skips_consent_gate(
    client: TestClient,
) -> None:
    analysis_id, token = _seed_bundle(with_consent=False, demo_patient=True)
    r = client.get(
        f"/api/v1/qeeg-analysis/{analysis_id}/normative-model-card",
        headers=_headers(token),
    )
    assert r.status_code == 200, r.text


def test_ai_report_returns_403_without_ai_analysis_consent(
    client: TestClient,
) -> None:
    from unittest import mock

    analysis_id, token = _seed_bundle(with_consent=False, demo_patient=False)

    def _must_not_call_generate(**kwargs):
        raise AssertionError("generate_ai_report must not run before consent passes")

    with mock.patch(
        "app.services.qeeg_ai_interpreter.generate_ai_report",
        side_effect=_must_not_call_generate,
    ):
        r = client.post(
            f"/api/v1/qeeg-analysis/{analysis_id}/ai-report",
            json={"report_type": "standard", "patient_context": "ctx"},
            headers=_headers(token),
        )
    assert r.status_code == 403, r.text
    body = r.json()
    assert body.get("code") == "consent_missing"
    # PHI safety: generic denial only (no filenames, patient ids, or clinical payload).
    assert set(body.keys()) <= {"code", "message", "warnings", "details"}
    assert body.get("message") == "ai_analysis consent required"
    dumped = json.dumps(body)
    assert "cg-pt-" not in dumped
    assert "edf" not in dumped.lower()


@pytest.mark.parametrize(
    "risky_patient_id",
    [
        "demographic-patient-123",
        "demoed-real-patient-id",
        "testicular-clinic-case-id",
        "mockery-real-analysis",
        "sample-real-upload",
        "demo-clinical-trial-007",
        "mock-protocol-alpha",
    ],
)
def test_normative_consent_not_bypassed_for_demo_like_substrings(
    client: TestClient,
    risky_patient_id: str,
) -> None:
    """Regression: consent bypass is allowlisted, not naive ``demo-*`` prefix matching."""
    analysis_id, token = _seed_bundle(
        with_consent=False,
        patient_id=risky_patient_id,
    )
    r = client.get(
        f"/api/v1/qeeg-analysis/{analysis_id}/normative-model-card",
        headers=_headers(token),
    )
    assert r.status_code == 403, (risky_patient_id, r.text)


def test_normative_demo_patient_synthetic_bypasses_without_consent(
    client: TestClient,
) -> None:
    analysis_id, token = _seed_bundle(
        with_consent=False,
        patient_id="demo-patient-synthetic",
    )
    r = client.get(
        f"/api/v1/qeeg-analysis/{analysis_id}/normative-model-card",
        headers=_headers(token),
    )
    assert r.status_code == 200, r.text
