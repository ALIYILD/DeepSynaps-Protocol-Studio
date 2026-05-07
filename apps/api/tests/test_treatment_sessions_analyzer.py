"""Treatment Sessions Analyzer aggregate endpoint."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AudioAnalysis,
    PatientMediaUpload,
    VideoAssessmentSession,
    WearableDailySummary,
)
from test_patients_router import _create_patient


class TestTreatmentSessionsAnalyzer:
    def test_clinician_get_returns_payload_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient(client, auth_headers)
        r = client.get(
            f"/api/v1/patients/{pid}/treatment-sessions-analyzer",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["schema_version"] == "1.2.0"
        assert body["patient_id"] == pid
        assert "planning_snapshot" in body
        assert "multimodal_contributors" in body
        assert isinstance(body["sessions"], list)
        assert "enrich_evidence" in body
        ev = body["enrich_evidence"]
        assert "live_evidence_corpus" in ev
        assert "neuromodulation_research_bundle" in ev
        assert "filters_used" in ev
        mi = body["enrich_medication_interactions"]
        assert "interactions" in mi
        assert "severity_summary" in mi
        ae = body["audit_events"]
        assert isinstance(ae, list)
        assert len(ae) >= 1
        assert ae[0].get("ml_feedback") is True
        snap = body["planning_snapshot"]
        assert snap["forecast_status"]["available"] is False
        assert snap["forecast_status"]["reason"] == "no_calibrated_model"
        assert snap["response_probability"]["available"] is False
        assert snap["response_probability"]["point"] is None
        assert snap["response_probability"]["ci"] == []
        assert snap["session_count_estimate"]["available"] is False
        assert snap["session_count_estimate"]["median"] is None
        assert snap["session_count_estimate"]["range"] == []
        assert "no_calibrated_forecast_model" in snap["uncertainty"]["drivers"]
        assert "withheld" in body["meta"]["forecast_note"]

    def test_guest_is_forbidden(self, client: TestClient, auth_headers: dict) -> None:
        pid = _create_patient(client, auth_headers)
        r = client.get(
            f"/api/v1/patients/{pid}/treatment-sessions-analyzer",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_multimodal_contributors_use_live_patient_artifacts_not_stub_provenance(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient(client, auth_headers)
        db = SessionLocal()
        try:
            db.add(
                AudioAnalysis(
                    analysis_id=f"analysis-{uuid.uuid4().hex[:8]}",
                    patient_id=pid,
                    status="completed",
                    created_at=datetime.now(timezone.utc),
                )
            )
            db.add(
                PatientMediaUpload(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    uploaded_by=pid,
                    media_type="text",
                    text_content="Patient notes a mild headache after treatment.",
                    status="analyzed",
                )
            )
            db.add(
                PatientMediaUpload(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    uploaded_by=pid,
                    media_type="video",
                    status="approved_for_analysis",
                )
            )
            db.add(
                VideoAssessmentSession(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    protocol_name="Motor follow-up",
                    protocol_version="v1",
                    overall_status="completed",
                    session_json="{}",
                )
            )
            db.add(
                WearableDailySummary(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    source="oura",
                    date="2026-05-01",
                    readiness_score=72.0,
                )
            )
            db.commit()
        finally:
            db.close()

        r = client.get(
            f"/api/v1/patients/{pid}/treatment-sessions-analyzer",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        contributors = {item["domain"]: item for item in body["multimodal_contributors"]}

        assert contributors["voice"]["provenance"]["source_ref"] == "audio_analyses"
        assert contributors["voice"]["linked_artifact_ids"]
        assert "stub" not in contributors["voice"]["provenance"]["source_ref"]

        assert contributors["text"]["provenance"]["source_ref"] == "patient_media_uploads:text"
        assert contributors["text"]["linked_artifact_ids"]
        assert "stub" not in contributors["text"]["provenance"]["source_ref"]

        assert contributors["video"]["provenance"]["source_ref"] == "video_assessment_sessions"
        assert contributors["video"]["linked_artifact_ids"]
        assert "stub" not in contributors["video"]["provenance"]["source_ref"]

        assert contributors["biometrics"]["provenance"]["source_ref"] == "wearable_daily_summaries"
        assert contributors["biometrics"]["linked_artifact_ids"]
        assert "stub" not in contributors["biometrics"]["provenance"]["source_ref"]
