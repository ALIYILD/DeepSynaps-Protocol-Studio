from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    Clinic,
    DeepTwinAnalysisRun,
    MriAnalysis,
    Patient,
    QEEGAnalysis,
    User,
)


def _seed_two_clinics_with_patient() -> dict[str, str]:
    """Seed two clinics + two clinicians + one patient (clinic A)."""
    db = SessionLocal()
    try:
        clinic_a = Clinic(id="clinic-ps-a", name="PS Clinic A")
        clinic_b = Clinic(id="clinic-ps-b", name="PS Clinic B")
        db.add_all([clinic_a, clinic_b])
        db.flush()

        clinician_a = User(
            id="actor-ps-clin-a",
            email="clin_a@example.com",
            display_name="Clin A",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_a.id,
        )
        clinician_b = User(
            id="actor-ps-clin-b",
            email="clin_b@example.com",
            display_name="Clin B",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_b.id,
        )
        db.add_all([clinician_a, clinician_b])
        db.flush()

        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clinician_a.id,
            first_name="Pat",
            last_name="A",
            dob="2000-01-01",
            gender="female",
            primary_condition="mdd",
            status="active",
            consent_signed=True,
            consent_date="2026-01-01",
        )
        db.add(patient)
        db.commit()
        return {"patient_id": patient.id, "clinician_a": clinician_a.id, "clinician_b": clinician_b.id}
    finally:
        db.close()


def _seed_patient_for_demo_clinician() -> dict[str, str]:
    """Seed a clinic + ensure demo clinician owns a patient for auth tests."""
    db = SessionLocal()
    try:
        clinic = Clinic(id="clinic-ps-demo", name="PS Clinic Demo")
        db.add(clinic)
        db.flush()

        demo = db.query(User).filter_by(id="actor-clinician-demo").first()
        assert demo is not None
        demo.clinic_id = clinic.id
        db.flush()

        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=demo.id,
            first_name="Pat",
            last_name="Demo",
            dob="2000-01-01",
            gender="female",
            primary_condition="mdd",
            status="active",
            consent_signed=True,
            consent_date="2026-01-01",
        )
        db.add(patient)
        db.commit()
        return {"patient_id": patient.id, "clinic_id": clinic.id, "clinician_id": demo.id}
    finally:
        db.close()


def test_protocol_studio_evidence_health_structured(client: TestClient, auth_headers: dict) -> None:
    res = client.get("/api/v1/protocol-studio/evidence/health", headers=auth_headers["clinician"])
    assert res.status_code == 200
    body = res.json()
    assert set(body.keys()) >= {
        "local_evidence_available",
        "local_count",
        "live_literature_available",
        "vector_search_available",
        "fallback_mode",
        "last_checked",
        "safe_user_message",
    }
    assert body["fallback_mode"] in ("local_only", "keyword_fallback", "unavailable")


def test_protocol_studio_evidence_search_unavailable_is_honest(client: TestClient, auth_headers: dict, monkeypatch) -> None:
    # Force evidence unavailable so we never "fake papers".
    monkeypatch.setenv("EVIDENCE_DB_PATH", "/tmp/does-not-exist-evidence.db")
    res = client.get("/api/v1/protocol-studio/evidence/search?q=tms", headers=auth_headers["clinician"])
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "unavailable"
    assert body["results"] == []


def test_protocol_catalog_has_required_safety_fields(client: TestClient, auth_headers: dict) -> None:
    res = client.get("/api/v1/protocol-studio/protocols?limit=10", headers=auth_headers["clinician"])
    assert res.status_code == 200
    data = res.json()
    assert "items" in data and "total" in data
    for item in data["items"]:
        assert item["clinician_review_required"] is True
        assert item["not_autonomous_prescription"] is True
        # Off-label must carry a warning.
        if item["off_label"] is True:
            assert item["off_label_warning"]


def test_patient_context_requires_auth(client: TestClient) -> None:
    res = client.get("/api/v1/protocol-studio/patients/pt-does-not-matter/context")
    # unauthenticated -> actor is guest -> clinician role required
    assert res.status_code in (401, 403)


def test_patient_context_cross_clinic_blocked(client: TestClient) -> None:
    seeded = _seed_two_clinics_with_patient()

    # Forge a clinician token by reusing demo token mechanism: in test env, demo
    # actor's clinic_id is pulled from DB if user row exists. We can seed the
    # demo clinician into clinic B for this test.
    db = SessionLocal()
    try:
        demo = db.query(User).filter_by(id="actor-clinician-demo").first()
        assert demo is not None
        demo.clinic_id = "clinic-ps-b"
        db.commit()
    finally:
        db.close()

    res = client.get(
        f"/api/v1/protocol-studio/patients/{seeded['patient_id']}/context",
        headers={"Authorization": "Bearer clinician-demo-token"},
    )
    assert res.status_code == 403
    body = res.json()
    assert body.get("code") == "cross_clinic_access_denied"


def _monkeypatch_evidence_ok(monkeypatch) -> None:
    # Avoid depending on a real evidence.db in tests.
    monkeypatch.setattr("app.services.evidence_rag._default_db_path", lambda: "/tmp/evidence.db")
    monkeypatch.setattr("app.services.protocol_studio_generation._local_evidence_available", lambda: True)
    monkeypatch.setattr(
        "app.services.evidence_rag.search_evidence",
        lambda *args, **kwargs: [
            {"paper_id": "P1", "title": "Paper 1", "url": "https://example.test/p1"},
        ],
    )


def _monkeypatch_evidence_empty(monkeypatch) -> None:
    monkeypatch.setattr("app.services.evidence_rag._default_db_path", lambda: "/tmp/evidence.db")
    monkeypatch.setattr("app.services.protocol_studio_generation._local_evidence_available", lambda: True)
    monkeypatch.setattr("app.services.evidence_rag.search_evidence", lambda *args, **kwargs: [])


def _monkeypatch_evidence_unavailable(monkeypatch) -> None:
    monkeypatch.setattr("app.services.protocol_studio_generation._local_evidence_available", lambda: False)


def test_generate_evidence_search_without_evidence_returns_insufficient(client: TestClient, auth_headers: dict, monkeypatch) -> None:
    _monkeypatch_evidence_unavailable(monkeypatch)
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers=auth_headers["clinician"],
        json={
            "mode": "evidence_search",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "insufficient_evidence"
    assert body["clinician_review_required"] is True
    assert body["not_autonomous_prescription"] is True


def test_generate_evidence_search_with_evidence_returns_draft_requires_review(client: TestClient, auth_headers: dict, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers=auth_headers["clinician"],
        json={
            "mode": "evidence_search",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "draft_requires_review"
    assert body["evidence_links"]
    assert body["clinician_review_required"] is True
    assert body["not_autonomous_prescription"] is True


def test_generate_qeeg_mode_without_patient_returns_needs_more_data(client: TestClient, auth_headers: dict, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers=auth_headers["clinician"],
        json={
            "mode": "qeeg_guided",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "needs_more_data"
    assert "patient_id" in body["missing_data"]


def test_generate_qeeg_mode_with_patient_but_no_qeeg_returns_needs_more_data(client: TestClient, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    seeded = _seed_patient_for_demo_clinician()
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers={"Authorization": "Bearer clinician-demo-token"},
        json={
            "patient_id": seeded["patient_id"],
            "mode": "qeeg_guided",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "needs_more_data"
    assert "qeeg" in body["missing_data"]


def test_generate_qeeg_mode_with_patient_and_qeeg_can_draft(client: TestClient, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    seeded = _seed_patient_for_demo_clinician()
    db = SessionLocal()
    try:
        db.add(
            QEEGAnalysis(
                patient_id=seeded["patient_id"],
                clinician_id=seeded["clinician_id"],
                analysis_status="completed",
            )
        )
        db.commit()
    finally:
        db.close()
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers={"Authorization": "Bearer clinician-demo-token"},
        json={
            "patient_id": seeded["patient_id"],
            "mode": "qeeg_guided",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "draft_requires_review"
    assert body["patient_context_used"]["sources"]["qeeg"]["available"] is True


def test_generate_mri_mode_requires_mri_source(client: TestClient, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    seeded = _seed_patient_for_demo_clinician()
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers={"Authorization": "Bearer clinician-demo-token"},
        json={
            "patient_id": seeded["patient_id"],
            "mode": "mri_guided",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res.status_code == 200
    assert res.json()["status"] == "needs_more_data"

    db = SessionLocal()
    try:
        db.add(MriAnalysis(analysis_id=str(uuid.uuid4()), patient_id=seeded["patient_id"], state="completed"))
        db.commit()
    finally:
        db.close()
    res2 = client.post(
        "/api/v1/protocol-studio/generate",
        headers={"Authorization": "Bearer clinician-demo-token"},
        json={
            "patient_id": seeded["patient_id"],
            "mode": "mri_guided",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "draft_requires_review"


def test_generate_deeptwin_mode_requires_deeptwin_source(client: TestClient, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    seeded = _seed_patient_for_demo_clinician()
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers={"Authorization": "Bearer clinician-demo-token"},
        json={
            "patient_id": seeded["patient_id"],
            "mode": "deeptwin_personalized",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res.status_code == 200
    assert res.json()["status"] == "needs_more_data"

    db = SessionLocal()
    try:
        db.add(
            DeepTwinAnalysisRun(
                patient_id=seeded["patient_id"],
                clinician_id=seeded["clinician_id"],
                analysis_type="protocol-studio-fixture",
                input_sources_json="[]",
                output_summary_json="{}",
            )
        )
        db.commit()
    finally:
        db.close()
    res2 = client.post(
        "/api/v1/protocol-studio/generate",
        headers={"Authorization": "Bearer clinician-demo-token"},
        json={
            "patient_id": seeded["patient_id"],
            "mode": "deeptwin_personalized",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "draft_requires_review"


def test_generate_multimodal_requires_two_sources(client: TestClient, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    seeded = _seed_patient_for_demo_clinician()
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers={"Authorization": "Bearer clinician-demo-token"},
        json={
            "patient_id": seeded["patient_id"],
            "mode": "multimodal",
            "condition": "mdd",
            "modality": "tms",
            "protocol_id": "PRO-FHIR",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "needs_more_data"
    assert "multimodal_requires_two_sources" in body["missing_data"]


def test_generate_off_label_disabled_blocks_off_label_protocol(client: TestClient, auth_headers: dict, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    # PRO-FHIR is a test fixture protocol in registries, and it is off-label.
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers=auth_headers["clinician"],
        json={"mode": "evidence_search", "condition": "mdd", "modality": "tms", "protocol_id": "PRO-FHIR", "include_off_label": False, "constraints": {}},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "blocked_requires_review"
    assert body["off_label"] is True
    assert body["off_label_warning"]


def test_generate_off_label_enabled_includes_warning(client: TestClient, auth_headers: dict, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers=auth_headers["clinician"],
        json={"mode": "evidence_search", "condition": "mdd", "modality": "tms", "protocol_id": "PRO-FHIR", "include_off_label": True, "constraints": {}},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["off_label"] is True
    assert body["off_label_warning"]


def test_generate_writes_audit_event(client: TestClient, auth_headers: dict, monkeypatch) -> None:
    _monkeypatch_evidence_ok(monkeypatch)
    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers=auth_headers["clinician"],
        json={"mode": "evidence_search", "condition": "mdd", "modality": "tms", "include_off_label": True, "constraints": {}},
    )
    assert res.status_code == 200
    draft_id = res.json().get("draft_id")
    assert draft_id
    db = SessionLocal()
    try:
        row = db.query(AuditEventRecord).filter_by(action="protocol_studio.generate_attempt", target_id=draft_id).first()
        assert row is not None
        assert "mode=" in (row.note or "")
        assert "status=" in (row.note or "")
    finally:
        db.close()

