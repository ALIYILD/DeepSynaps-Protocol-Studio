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
    role: str = "clinician",
) -> tuple[str, str]:
    from app.database import SessionLocal
    from app.persistence.models import Clinic, ConsentRecord, Patient, QEEGAnalysis, User
    from app.services.auth_service import create_access_token

    su = _uniq()
    clinic_id = f"rag-clinic-{su}"
    user_id = f"rag-user-{su}"
    patient_id = f"rag-patient-{su}"
    analysis_id = f"rag-analysis-{su}"

    db = SessionLocal()
    try:
        db.add(Clinic(id=clinic_id, name="RAG Draft Clinic"))
        db.add(
            User(
                id=user_id,
                email=f"{user_id}@example.com",
                display_name="RAG Clinician",
                hashed_password="not_real",
                role=role,
                clinic_id=clinic_id,
            )
        )
        db.add(
            Patient(
                id=patient_id,
                clinician_id=user_id,
                first_name="Rag",
                last_name="Draft",
                dob="1991-06-01",
            )
        )
        if with_consent:
            db.add(
                ConsentRecord(
                    patient_id=patient_id,
                    clinician_id=user_id,
                    consent_type="ai_analysis",
                    status="active",
                    signed=True,
                )
            )
        db.add(
            QEEGAnalysis(
                id=analysis_id,
                patient_id=patient_id,
                clinician_id=user_id,
                analysis_status="completed",
                eyes_condition="closed",
                band_powers_json=json.dumps(
                    {"bands": {"alpha": {"channels": {"Cz": {"absolute_uv2": 12.0, "relative_pct": 22.0}}}}}
                ),
            )
        )
        db.commit()
    finally:
        db.close()

    token = create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )
    return analysis_id, token


def test_rag_report_returns_403_without_ai_analysis_consent(
    client: TestClient,
    monkeypatch,
) -> None:
    from app.services import qeeg_ai_interpreter

    analysis_id, token = _seed_bundle(with_consent=False)

    def _must_not_call_generate(**kwargs):
        raise AssertionError("generate_ai_report must not run before consent passes")

    monkeypatch.setattr(qeeg_ai_interpreter, "generate_ai_report", _must_not_call_generate)

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_id}/rag-report",
        json={"output_mode": "clinician_draft", "include_evidence": True, "recording_condition": "eyes_closed"},
        headers=_headers(token),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "consent_missing"


def test_rag_report_blocks_non_clinician_role_before_generation(
    client: TestClient,
    monkeypatch,
) -> None:
    from app.services import qeeg_ai_interpreter

    analysis_id, token = _seed_bundle(with_consent=True, role="guest")

    def _must_not_call_generate(**kwargs):
        raise AssertionError("generate_ai_report must not run for guest role")

    monkeypatch.setattr(qeeg_ai_interpreter, "generate_ai_report", _must_not_call_generate)

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_id}/rag-report",
        json={"output_mode": "clinician_draft", "include_evidence": True, "recording_condition": "eyes_closed"},
        headers=_headers(token),
    )
    assert resp.status_code == 403, resp.text


def test_rag_report_persists_needs_review_draft_and_structured_evidence(
    client: TestClient,
    monkeypatch,
) -> None:
    from app.database import SessionLocal
    from app.persistence.models import AuditEventRecord, QEEGAIReport
    from app.services import qeeg_ai_interpreter

    analysis_id, token = _seed_bundle(with_consent=True)

    async def _fake_generate_ai_report(**kwargs):
        assert kwargs["require_real_citations"] is True
        return {
            "success": True,
            "source": "llm",
            "model_used": "mock-model",
            "prompt_hash": "abcd" * 4,
            "literature_refs": [
                {
                    "n": 1,
                    "title": "Frontal theta and attention control",
                    "pmid": "123456",
                    "doi": "10.1000/mock",
                    "url": "https://pubmed.ncbi.nlm.nih.gov/123456/",
                    "relevance_score": 0.91,
                }
            ],
            "data": {
                "executive_summary": "Elevated frontal theta warrants clinician review [1].",
                "findings": [
                    {
                        "region": "frontal",
                        "band": "theta",
                        "observation": "Frontal theta was elevated relative to baseline expectations [1].",
                        "citations": [1],
                    }
                ],
                "protocol_recommendations": [
                    {"modality": "neurofeedback", "target": "midline", "rationale": "Draft idea only."}
                ],
                "confidence_level": "moderate",
                "disclaimer": "Decision-support only.",
            },
        }

    monkeypatch.setattr(qeeg_ai_interpreter, "generate_ai_report", _fake_generate_ai_report)
    monkeypatch.setattr(qeeg_ai_interpreter, "match_condition_patterns", lambda payload: [])

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_id}/rag-report",
        json={"output_mode": "clinician_draft", "include_evidence": True, "recording_condition": "eyes_closed"},
        headers=_headers(token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "clinician_review_required"
    assert body["clinical_use"] == "decision_support_only"
    assert body["report_state"] == "NEEDS_REVIEW"
    assert body["evidence_status"] == "available"
    assert body["output_mode"] == "clinician_draft"
    assert body["evidence"][0]["pmid"] == "123456"
    measured_section = next(section for section in body["sections"] if section["title"] == "Measured qEEG context")
    assert measured_section["source"] == "measured"
    summary_section = next(section for section in body["sections"] if section["title"] == "Executive Summary")
    assert summary_section["source"] == "evidence_grounded"

    db = SessionLocal()
    try:
        row = db.query(QEEGAIReport).filter_by(id=body["report_id"]).one()
        assert row.report_state == "NEEDS_REVIEW"
        assert row.report_type == "rag_draft"
        audit_actions = {
            action
            for (action,) in db.query(AuditEventRecord.action)
            .filter(AuditEventRecord.target_id == analysis_id)
            .all()
        }
        assert "qeeg.rag_report_requested" in audit_actions
        assert "qeeg.rag_report_generated" in audit_actions
    finally:
        db.close()
