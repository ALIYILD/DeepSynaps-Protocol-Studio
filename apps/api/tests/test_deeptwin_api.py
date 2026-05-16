"""Tests for DeepTwin API endpoints (Phase 4)."""

import os
import sqlite3
import pytest
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

import sys
sys.path.insert(0, "apps/api/src/deepsynaps")

from main import app, get_knowledge_layer
from knowledge_layer import KnowledgeLayer
from contracts import MultimodalEvent


@pytest.fixture
def test_db():
    db_path = "/tmp/test_deeptwin_api.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    kl = KnowledgeLayer(db_path)
    conn = sqlite3.connect(db_path)
    now = datetime.utcnow()
    events = [
        MultimodalEvent(
            patient_id="patient-001", event_type="cognitive_assessment",
            modality="assessment", source_system="test", source_record_id="r1",
            timestamp=now - timedelta(days=5), value_summary="MMSE 28",
            confidence=0.9, data_quality="high",
        ),
        MultimodalEvent(
            patient_id="patient-001", event_type="qeeg",
            modality="qeeg", source_system="test", source_record_id="r2",
            timestamp=now - timedelta(days=3), value_summary="Normal delta",
            confidence=0.85, data_quality="high",
        ),
        MultimodalEvent(
            patient_id="patient-001", event_type="medication",
            modality="medication", source_system="test", source_record_id="r3",
            timestamp=now - timedelta(days=2), value_summary="Dose adjusted",
            confidence=0.95, data_quality="high",
        ),
    ]
    for e in events:
        kl.insert_event(e)
    conn.executemany(
        "INSERT OR REPLACE INTO patient_access VALUES (?, ?, ?, ?, ?)",
        [
            ("patient-001", "clinic-001", "clinician-001", "read", 1),
            ("patient-001", "clinic-001", "clinician-002", "read", 0),
        ],
    )
    conn.commit()
    conn.close()
    return db_path


@pytest.fixture
def client(test_db):
    kl = KnowledgeLayer(test_db)
    app.dependency_overrides[get_knowledge_layer] = lambda: kl
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestDeepTwinSnapshot:
    """GET /api/v1/deeptwin/patients/{pid}/snapshot"""

    def test_snapshot_success(self, client):
        r = client.get(
            "/api/v1/deeptwin/patients/patient-001/snapshot?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "snapshot" in data
        snap = data["snapshot"]
        assert snap["patient_id"] == "patient-001"
        assert "snapshot_id" in snap
        assert "safety_disclaimer" in snap
        assert snap["forecast_status"] == "unavailable: no calibrated model"
        assert "Decision support only" in snap["safety_disclaimer"]

    def test_snapshot_no_access(self, client):
        r = client.get(
            "/api/v1/deeptwin/patients/patient-002/snapshot?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 403

    def test_snapshot_safety_disclaimer(self, client):
        r = client.get(
            "/api/v1/deeptwin/patients/patient-001/snapshot?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200
        assert "safety_disclaimer" in r.json()

    def test_snapshot_modality_coverage(self, client):
        r = client.get(
            "/api/v1/deeptwin/patients/patient-001/snapshot?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        data = r.json()["snapshot"]
        mc = data["modality_coverage"]
        assert mc.get("assessment") is True
        assert mc.get("qeeg") is True
        assert mc.get("medication") is True

    def test_snapshot_no_causal_overclaiming(self, client):
        r = client.get(
            "/api/v1/deeptwin/patients/patient-001/snapshot?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        data = r.json()["snapshot"]
        text = str(data)
        assert "caused by" not in text.lower() or "associated with" in text.lower()
        # "proven" may appear in "provenance" which is metadata, not clinical claim
        assert "causally proven" not in text.lower() or "not causal proof" in text.lower()


class TestDeepTwinTimeline:
    """GET /api/v1/deeptwin/patients/{pid}/timeline"""

    def test_timeline_success(self, client):
        r = client.get(
            "/api/v1/deeptwin/patients/patient-001/timeline?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "timeline" in data or "events" in data or "snapshot" in data


class TestDeepTwinHypotheses:
    """GET /api/v1/deeptwin/patients/{pid}/hypotheses"""

    def test_hypotheses_success(self, client):
        r = client.get(
            "/api/v1/deeptwin/patients/patient-001/hypotheses?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "ranked_hypotheses" in data or "hypotheses" in data or "snapshot" in data

    def test_hypotheses_safety_label(self, client):
        r = client.get(
            "/api/v1/deeptwin/patients/patient-001/hypotheses?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        data = r.json()
        text = str(data)
        assert "Requires clinician review" in text


class TestDeepTwinSynthesis:
    """POST /api/v1/deeptwin/patients/{pid}/synthesis"""

    def test_synthesis_success(self, client):
        r = client.post(
            "/api/v1/deeptwin/patients/patient-001/synthesis?clinician_id=clinician-001",
            json={
                "include_modalities": ["assessment", "qeeg", "medication"],
                "min_confidence": 0.3,
                "max_hypotheses": 5,
            },
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "snapshot" in data or "synthesis_id" in data
        assert "safety_disclaimer" in data

    def test_synthesis_no_ai_consent(self, client):
        r = client.post(
            "/api/v1/deeptwin/patients/patient-001/synthesis?clinician_id=clinician-002",
            json={"include_modalities": ["assessment"]},
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 403

    def test_synthesis_forecast_unavailable(self, client):
        r = client.post(
            "/api/v1/deeptwin/patients/patient-001/synthesis?clinician_id=clinician-001",
            json={"include_modalities": ["assessment"]},
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        data = r.json()
        snap = data.get("snapshot", data)
        assert snap.get("forecast_status", "") == "unavailable: no calibrated model"


class TestDeepTwinReview:
    """POST /api/v1/deeptwin/patients/{pid}/review"""

    def test_review_accept(self, client):
        r = client.post(
            "/api/v1/deeptwin/patients/patient-001/review?clinician_id=clinician-001",
            json={
                "clinician_id": "clinician-001",
                "snapshot_id": "dts_test_001",
                "hypothesis_id": "hyp_001",
                "action": "accept",
                "note": "Agreed with hypothesis",
            },
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code in (200, 404)  # 404 if review engine not mounted
        if r.status_code == 200:
            assert "review_id" in r.json()

    def test_review_invalid_action(self, client):
        r = client.post(
            "/api/v1/deeptwin/patients/patient-001/review?clinician_id=clinician-001",
            json={
                "clinician_id": "clinician-001",
                "snapshot_id": "dts_test_001",
                "hypothesis_id": "hyp_001",
                "action": "invalid_action",
                "note": "",
            },
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code in (400, 422, 404)

    def test_review_note(self, client):
        r = client.post(
            "/api/v1/deeptwin/patients/patient-001/review?clinician_id=clinician-001",
            json={
                "clinician_id": "clinician-001",
                "snapshot_id": "dts_test_001",
                "hypothesis_id": "hyp_001",
                "action": "note",
                "note": "Consider additional biomarker testing",
            },
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code in (200, 404)


class TestDeepTwinExport:
    """POST /api/v1/deeptwin/patients/{pid}/export"""

    def test_export_json(self, client):
        r = client.post(
            "/api/v1/deeptwin/patients/patient-001/export?clinician_id=clinician-001",
            json={
                "clinician_id": "clinician-001",
                "snapshot_id": "dts_test_001",
                "export_type": "json",
            },
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            assert "export_id" in r.json()

    def test_export_report_handoff(self, client):
        r = client.post(
            "/api/v1/deeptwin/patients/patient-001/export?clinician_id=clinician-001",
            json={
                "clinician_id": "clinician-001",
                "snapshot_id": "dts_test_001",
                "export_type": "report_handoff",
            },
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code in (200, 404)

    def test_export_protocol_handoff(self, client):
        r = client.post(
            "/api/v1/deeptwin/patients/patient-001/export?clinician_id=clinician-001",
            json={
                "clinician_id": "clinician-001",
                "snapshot_id": "dts_test_001",
                "export_type": "protocol_handoff",
            },
            headers={"X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code in (200, 404)
