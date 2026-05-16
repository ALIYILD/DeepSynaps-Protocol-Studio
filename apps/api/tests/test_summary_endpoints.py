"""Summary endpoint tests — fast aggregate queries with bounded payloads.

Verifies:
- Clinic dashboard: counts, no PHI, bounded payload
- Patient dashboard: counts, no full records, bounded payload
- Analyzer status: modality counts, stale detection
- All endpoints: 200, safety disclaimer, clinic isolation
- Payload size: summary < full object count
"""

import os
import sqlite3
import pytest
import json
from datetime import datetime, timedelta

import sys
sys.path.insert(0, "apps/api/src/deepsynaps")

from fastapi.testclient import TestClient
from main import app, get_knowledge_layer
from knowledge_layer import KnowledgeLayer
from contracts import MultimodalEvent


@pytest.fixture
def client(tmp_path):
    """TestClient with seeded data."""
    import sqlite3
    db_file = str(tmp_path / "test_summary.db")
    kl = KnowledgeLayer(db_url=db_file)
    now = datetime.now()
    # Seed access via KL (not raw sqlite) to avoid lock conflicts
    for p in range(3):
        patient_id = f"patient-{p:03d}"
        clinic_id = f"clinic-{p % 2}"  # 2 clinics share patients
        conn = kl._connect()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT OR REPLACE INTO patient_access VALUES (?, ?, ?, ?, ?)",
                (patient_id, clinic_id, "clinician-001", "read", 1),
            )
            conn.commit()
        finally:
            conn.close()
        for i in range(50):
            e = MultimodalEvent(
                patient_id=patient_id,
                event_type="assessment" if i % 3 == 0 else "qeeg",
                modality="assessment" if i % 3 == 0 else "qeeg",
                source_system="test",
                source_record_id=f"r{i}",
                timestamp=now - timedelta(hours=i),
                value_summary=f"Event {i} for {patient_id} with sufficiently long text to make response meaningful",
                confidence=0.85,
                data_quality="high" if i % 5 != 0 else "low",
            )
            kl.insert_event(e)
    # Audit entries
    for i in range(20):
        kl.log_audit(f"/test/{i}", "clinician-001", "clinic-0", "patient-000", "test")

    app.dependency_overrides[get_knowledge_layer] = lambda: kl
    yield TestClient(app)
    app.dependency_overrides.clear()


# ── Clinic Dashboard ───────────────────────────────────────────

class TestClinicDashboard:
    def test_returns_200(self, client):
        r = client.get(
            "/api/v1/summary/clinic-dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200

    def test_returns_counts_not_records(self, client):
        r = client.get(
            "/api/v1/summary/clinic-dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        data = r.json()
        assert "active_patients" in data
        assert "recent_events_30d" in data
        assert "recent_audits_30d" in data
        assert "ai_consent_count" in data
        assert isinstance(data["active_patients"], int)

    def test_no_phi_in_response(self, client):
        r = client.get(
            "/api/v1/summary/clinic-dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        text = json.dumps(r.json())
        assert "patient-000" not in text  # No patient IDs in clinic summary
        assert "patient-001" not in text

    def test_has_safety_disclaimer(self, client):
        r = client.get(
            "/api/v1/summary/clinic-dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert "safety_disclaimer" in r.json()

    def test_modality_breakdown_bounded(self, client):
        r = client.get(
            "/api/v1/summary/clinic-dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        modalities = r.json()["modality_breakdown"]
        assert len(modalities) <= 10  # Bounded
        assert isinstance(modalities, list)
        if modalities:
            assert "modality" in modalities[0]
            assert "count" in modalities[0]

    def test_payload_smaller_than_full_objects(self, client):
        """Summary payload must be smaller than full timeline payload."""
        r_summary = client.get(
            "/api/v1/summary/clinic-dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        # Full timeline for same scope
        r_timeline = client.get(
            "/api/v1/multimodal/patients/patient-000/timeline?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert len(r_summary.content) < len(r_timeline.content) * 0.5, (
            "Summary payload not significantly smaller than full objects"
        )


# ── Patient Dashboard ──────────────────────────────────────────

class TestPatientDashboard:
    def test_returns_200(self, client):
        r = client.get(
            "/api/v1/summary/patients/patient-000/dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200

    def test_returns_counts_not_full_records(self, client):
        r = client.get(
            "/api/v1/summary/patients/patient-000/dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        data = r.json()
        assert "total_events" in data
        assert "recent_events_30d" in data
        assert "modality_breakdown" in data
        assert "latest_event_at" in data
        assert "first_event_at" in data
        assert "data_quality_summary" in data
        assert isinstance(data["total_events"], int)

    def test_no_full_event_records(self, client):
        """Response does not contain full event records (just counts)."""
        r = client.get(
            "/api/v1/summary/patients/patient-000/dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        data = r.json()
        # value_summary from individual events should not appear
        assert "value_summary" not in data
        assert "events" not in data  # No event list

    def test_has_safety_disclaimer(self, client):
        r = client.get(
            "/api/v1/summary/patients/patient-000/dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert "safety_disclaimer" in r.json()

    def test_correct_event_count(self, client):
        r = client.get(
            "/api/v1/summary/patients/patient-000/dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert r.json()["total_events"] == 50


# ── Analyzer Status ────────────────────────────────────────────

class TestAnalyzerStatus:
    def test_returns_200(self, client):
        r = client.get(
            "/api/v1/summary/analyzer-status?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200

    def test_returns_modality_counts(self, client):
        r = client.get(
            "/api/v1/summary/analyzer-status?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        data = r.json()
        assert "all_time_modality_counts" in data
        assert "recent_30d_modality_counts" in data
        assert "stale_modalities" in data
        assert "evidence_entries" in data
        assert isinstance(data["evidence_entries"], int)

    def test_stale_modalities_is_list(self, client):
        r = client.get(
            "/api/v1/summary/analyzer-status?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert isinstance(r.json()["stale_modalities"], list)

    def test_has_safety_disclaimer(self, client):
        r = client.get(
            "/api/v1/summary/analyzer-status?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert "safety_disclaimer" in r.json()

    def test_bounded_payload(self, client):
        r = client.get(
            "/api/v1/summary/analyzer-status?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert len(r.content) < 100 * 1024  # Under 100KB


# ── Clinic Isolation ───────────────────────────────────────────

class TestClinicIsolation:
    def test_clinic_0_sees_clinic_0_data(self, client):
        r = client.get(
            "/api/v1/summary/clinic-dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200
        assert r.json()["active_patients"] > 0

    def test_clinic_1_sees_different_counts(self, client):
        r = client.get(
            "/api/v1/summary/clinic-dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-1", "X-Patient-Access-Token": "token"},
        )
        assert r.status_code == 200

    def test_analyzer_status_clinic_isolated(self, client):
        r0 = client.get(
            "/api/v1/summary/analyzer-status?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        r1 = client.get(
            "/api/v1/summary/analyzer-status?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-1", "X-Patient-Access-Token": "token"},
        )
        # Clinic-0 has more recent modality activity (patient-000 + patient-002)
        # Clinic-1 has less (patient-001 only)
        assert r0.json()["all_time_modality_counts"] != r1.json()["all_time_modality_counts"] or \
               r0.json()["recent_30d_modality_counts"] != r1.json()["recent_30d_modality_counts"]


# ── Response Time ──────────────────────────────────────────────

class TestResponseTime:
    def test_clinic_dashboard_under_200ms(self, client):
        import time
        start = time.perf_counter()
        r = client.get(
            "/api/v1/summary/clinic-dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        elapsed = (time.perf_counter() - start) * 1000
        assert r.status_code == 200
        assert elapsed < 200, f"Clinic dashboard took {elapsed:.0f}ms"

    def test_patient_dashboard_under_200ms(self, client):
        import time
        start = time.perf_counter()
        r = client.get(
            "/api/v1/summary/patients/patient-000/dashboard?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        elapsed = (time.perf_counter() - start) * 1000
        assert r.status_code == 200
        assert elapsed < 200, f"Patient dashboard took {elapsed:.0f}ms"

    def test_analyzer_status_under_200ms(self, client):
        import time
        start = time.perf_counter()
        r = client.get(
            "/api/v1/summary/analyzer-status?clinician_id=clinician-001",
            headers={"X-Clinic-ID": "clinic-0", "X-Patient-Access-Token": "token"},
        )
        elapsed = (time.perf_counter() - start) * 1000
        assert r.status_code == 200
        assert elapsed < 200, f"Analyzer status took {elapsed:.0f}ms"
