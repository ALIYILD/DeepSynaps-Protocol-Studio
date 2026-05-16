"""Test FastAPI endpoints for the Multimodal Intelligence Engine API."""

import os
import sys
import sqlite3
import pytest
from datetime import datetime, timedelta

# Ensure the deepsynaps package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from fastapi.testclient import TestClient
from main import app, get_knowledge_layer
from knowledge_layer import KnowledgeLayer


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def client(tmp_path):
    """Create a TestClient with fresh temp file database."""
    db_file = str(tmp_path / "test_api.db")
    kl = KnowledgeLayer(db_file)
    # Seed test data
    from contracts import MultimodalEvent
    now = datetime.utcnow()
    events = [
        MultimodalEvent(
            event_id="evt_test_001",
            patient_id="patient-001",
            event_type="cognitive_assessment",
            modality="assessment",
            source_system="test_system",
            source_record_id="rec_001",
            timestamp=now - timedelta(days=10),
            value_summary="MMSE score 26/30",
            confidence=0.85,
            data_quality="high",
        ),
        MultimodalEvent(
            event_id="evt_test_002",
            patient_id="patient-001",
            event_type="qEEG_recording",
            modality="qeeg",
            source_system="test_system",
            source_record_id="rec_002",
            timestamp=now - timedelta(days=8),
            value_summary="Elevated delta power in frontal regions",
            confidence=0.75,
            data_quality="high",
        ),
        MultimodalEvent(
            event_id="evt_test_003",
            patient_id="patient-001",
            event_type="sleep_summary",
            modality="wearable",
            source_system="test_system",
            source_record_id="rec_003",
            timestamp=now - timedelta(days=7),
            value_summary="Average sleep 5.2h, fragmented",
            confidence=0.60,
            data_quality="medium",
        ),
        MultimodalEvent(
            event_id="evt_test_004",
            patient_id="patient-001",
            event_type="medication_log",
            modality="medication",
            source_system="test_system",
            source_record_id="rec_004",
            timestamp=now - timedelta(days=5),
            value_summary="Started cholinesterase inhibitor",
            confidence=0.95,
            data_quality="high",
        ),
        MultimodalEvent(
            event_id="evt_test_005",
            patient_id="patient-002",
            event_type="biomarker_panel",
            modality="biomarker",
            source_system="test_system",
            source_record_id="rec_005",
            timestamp=now - timedelta(days=3),
            value_summary="NfL elevated at 45 pg/mL",
            confidence=0.80,
            data_quality="high",
        ),
    ]
    for evt in events:
        kl.insert_event(evt)

    # Grant patient access
    conn = sqlite3.connect(kl.db_path)
    cursor = conn.cursor()
    cursor.executemany(
        "INSERT OR REPLACE INTO patient_access VALUES (?, ?, ?, ?, ?)",
        [
            ("patient-001", "clinic-001", "clinician-001", "read", 1),
            ("patient-001", "clinic-001", "clinician-002", "read", 0),
            ("patient-002", "clinic-002", "clinician-001", "read", 1),
        ]
    )
    conn.commit()
    conn.close()

    # Override dependencies
    def override_knowledge_layer():
        return kl

    app.dependency_overrides[get_knowledge_layer] = override_knowledge_layer
    yield TestClient(app)
    app.dependency_overrides.clear()


# ── Health Check ──────────────────────────────────────────────────────────────

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["phase"] == "3"
    assert "timeline" in data["modules"]
    assert "correlation" in data["modules"]
    assert "confound" in data["modules"]
    assert "evidence" in data["modules"]
    assert "hypothesis" in data["modules"]
    assert "missing_data" in data["modules"]


# ── Auth Enforcement ──────────────────────────────────────────────────────────

def test_timeline_missing_clinic_id(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-001/timeline?clinician_id=clinician-001"
    )
    # Missing required header returns 422 (validation error) or 400 (caught by error handler)
    assert response.status_code in (400, 422)


def test_timeline_missing_access_token(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-001/timeline?clinician_id=clinician-001",
        headers={"X-Clinic-ID": "clinic-001"},
    )
    assert response.status_code in (400, 422)


def test_timeline_unauthorized_clinic(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-001/timeline?clinician_id=clinician-001",
        headers={"X-Clinic-ID": "clinic-999", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 403


def test_timeline_no_ai_consent_for_synthesis(client):
    response = client.post(
        "/api/v1/multimodal/patients/patient-001/synthesis?clinician_id=clinician-002",
        json={"include_modalities": ["assessment"]},
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 403


# ── Timeline Endpoint ─────────────────────────────────────────────────────────

def test_timeline_success(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-001/timeline?clinician_id=clinician-001",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == "patient-001"
    assert "events" in data
    assert "event_count" in data
    assert data["event_count"] > 0
    assert "safety_disclaimer" in data
    assert "clinician review" in data["safety_disclaimer"].lower()


def test_timeline_with_modality_filter(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-001/timeline?clinician_id=clinician-001&modality=assessment&modality=qeeg",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert all(e["modality"] in ("assessment", "qeeg") for e in data["events"])


def test_timeline_with_date_range(client):
    now = datetime.utcnow()
    from_date = (now - timedelta(days=30)).isoformat()
    to_date = now.isoformat()
    response = client.get(
        f"/api/v1/multimodal/patients/patient-001/timeline?clinician_id=clinician-001&from_date={from_date}&to_date={to_date}",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["event_count"] > 0


def test_timeline_patient_not_in_clinic(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-002/timeline?clinician_id=clinician-001",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 403


# ── Correlations Endpoint ─────────────────────────────────────────────────────

def test_correlations_success(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-001/correlations?clinician_id=clinician-001&window_days=30&min_confidence=0.3",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == "patient-001"
    assert "correlations" in data
    assert "safety_disclaimer" in data
    # All correlations should have safety labels
    for corr in data["correlations"]:
        assert any("Temporal association" in label for label in corr.get("safety_labels", []))


def test_correlations_high_confidence_filter(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-001/correlations?clinician_id=clinician-001&window_days=30&min_confidence=0.9",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 200
    data = response.json()
    # High confidence filter may return no results, which is fine
    assert "safety_disclaimer" in data


# ── Confounders Endpoint ──────────────────────────────────────────────────────

def test_confounders_success(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-001/confounders?clinician_id=clinician-001",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == "patient-001"
    assert "confounders" in data
    assert "safety_disclaimer" in data


def test_confounders_patient_not_in_clinic(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-002/confounders?clinician_id=clinician-001",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 403


# ── Quality Flags Endpoint ────────────────────────────────────────────────────

def test_quality_flags_success(client):
    response = client.get(
        "/api/v1/multimodal/patients/patient-001/quality-flags?clinician_id=clinician-001",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == "patient-001"
    assert "quality_flags" in data
    assert "safety_disclaimer" in data


# ── Synthesis Endpoint ────────────────────────────────────────────────────────

def test_synthesis_success(client):
    response = client.post(
        "/api/v1/multimodal/patients/patient-001/synthesis?clinician_id=clinician-001",
        json={
            "include_modalities": ["assessment", "qeeg", "wearable", "medication"],
            "date_range": ["2024-01-01", "2024-12-31"],
            "focus_areas": ["cognitive", "sleep"],
            "min_confidence": 0.3,
            "max_hypotheses": 5,
        },
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "synthesis_id" in data
    assert data["patient_id"] == "patient-001"
    assert "timeline" in data
    assert "correlations" in data
    assert "confounders" in data
    assert "quality_flags" in data
    assert "ranked_hypotheses" in data
    assert "evidence_summary" in data
    assert "safety_disclaimer" in data
    assert "generated_at" in data

    # Safety checks on hypotheses
    for hyp in data["ranked_hypotheses"]:
        assert hyp.get("clinician_review_required") is True
        assert len(hyp.get("safety_labels", [])) > 0
        assert hyp.get("confidence", 1.0) < 0.95


def test_synthesis_requires_ai_consent(client):
    response = client.post(
        "/api/v1/multimodal/patients/patient-001/synthesis?clinician_id=clinician-002",
        json={"include_modalities": ["assessment"]},
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 403
    data = response.json()
    assert "detail" in data
    assert any("consent" in str(err).lower() for err in data["detail"])


def test_synthesis_patient_not_in_clinic(client):
    response = client.post(
        "/api/v1/multimodal/patients/patient-002/synthesis?clinician_id=clinician-001",
        json={"include_modalities": ["assessment"]},
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    assert response.status_code == 403


# ── Safety Disclaimer in All Responses ────────────────────────────────────────

def test_all_patient_endpoints_return_safety_disclaimer(client):
    endpoints = [
        ("get", "/api/v1/multimodal/patients/patient-001/timeline?clinician_id=clinician-001"),
        ("get", "/api/v1/multimodal/patients/patient-001/correlations?clinician_id=clinician-001"),
        ("get", "/api/v1/multimodal/patients/patient-001/confounders?clinician_id=clinician-001"),
        ("get", "/api/v1/multimodal/patients/patient-001/quality-flags?clinician_id=clinician-001"),
    ]
    for method, url in endpoints:
        response = client.request(
            method, url,
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert response.status_code == 200, f"{method.upper()} {url} failed"
        data = response.json()
        assert "safety_disclaimer" in data, f"{method.upper()} {url} missing safety_disclaimer"
        assert "clinician review" in data["safety_disclaimer"].lower()


# ── Audit Logging ─────────────────────────────────────────────────────────────

def test_audit_log_created(client, tmp_path):
    # Make a request
    client.get(
        "/api/v1/multimodal/patients/patient-001/timeline?clinician_id=clinician-001",
        headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
    )
    # Access the DB file directly to verify audit log
    db_file = str(tmp_path / "test_api.db")
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_log WHERE patient_id = ?", ("patient-001",))
    rows = cursor.fetchall()
    conn.close()
    assert len(rows) > 0
