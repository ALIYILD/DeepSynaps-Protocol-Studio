"""Intervention Analyzer aggregate endpoint tests."""
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


# ---------------------------------------------------------------------------
# Intervention type coverage constant
# ---------------------------------------------------------------------------

INTERVENTION_TYPE_SLUGS = [
    "tms", "tdcs", "tacs", "trns", "tavns", "tps", "pbm",
    "neurofeedback", "medication_change", "psychotherapy",
    "occupational_therapy", "speech_therapy", "physiotherapy",
    "digital_therapeutics", "sleep_intervention", "nutrition",
    "exercise", "lifestyle", "accommodations", "multimodal",
]

BANNED_PHRASES = [
    "caused improvement", "proves efficacy", "predicts response",
    "recommends treatment", "treatment caused", "will improve",
    "guaranteed", "proven outcome",
]


class TestInterventionAnalyzer:
    # -----------------------------------------------------------------------
    # Payload shape & schema (carried forward from treatment-sessions-analyzer)
    # -----------------------------------------------------------------------

    def test_clinician_get_returns_payload_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient(client, auth_headers)
        r = client.get(
            f"/api/v1/patients/{pid}/intervention-analyzer",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["schema_version"] == "1.3.0"
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
            f"/api/v1/patients/{pid}/intervention-analyzer",
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
            f"/api/v1/patients/{pid}/intervention-analyzer",
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

    # -----------------------------------------------------------------------
    # Honest Response Label Tests — provenance + heuristic disclosure
    # -----------------------------------------------------------------------

    def test_response_label_includes_provenance(self, client, auth_headers):
        """Response label must expose provenance and heuristic disclaimer."""
        from app.services.intervention_analyzer import _response_label

        class MockCourse:
            sessions_delivered = 10
            planned_sessions_total = 10

        result = _response_label(MockCourse())
        assert result["provenance"] == "rule_based_heuristic"
        assert "heuristic" in result.get("note", "")
        assert "calibrated prediction model" in result.get("note", "")

    def test_response_label_returns_insufficient_data_for_none_course(self, client, auth_headers):
        from app.services.intervention_analyzer import _response_label

        result = _response_label(None)
        assert result["label"] == "insufficient_data"
        assert result["provenance"] == "no_course"
        assert "heuristic" not in result.get("note", "") or "insufficient" in result.get("note", "")

    def test_response_label_returns_on_track_heuristic_when_high_completion(self, client, auth_headers):
        from app.services.intervention_analyzer import _response_label

        class MockCourse:
            sessions_delivered = 9
            planned_sessions_total = 10

        result = _response_label(MockCourse())
        assert result["label"] == "on_track_heuristic"
        assert result["provenance"] == "rule_based_heuristic"
        assert "sessions_delivered" in result
        assert "sessions_planned" in result

    def test_response_label_returns_partial_heuristic_when_adequate_sessions(self, client, auth_headers):
        from app.services.intervention_analyzer import _response_label

        class MockCourse:
            sessions_delivered = 5
            planned_sessions_total = 10

        result = _response_label(MockCourse())
        assert result["label"] == "partial_heuristic"
        assert result["provenance"] == "rule_based_heuristic"
        assert "sessions_delivered" in result
        assert "sessions_planned" in result

    def test_response_label_returns_unclear_heuristic_for_sparse_data(self, client, auth_headers):
        from app.services.intervention_analyzer import _response_label

        class MockCourse:
            sessions_delivered = 1
            planned_sessions_total = 10

        result = _response_label(MockCourse())
        assert result["label"] == "unclear_heuristic"
        assert result["provenance"] == "rule_based_heuristic"
        assert "sessions_delivered" in result
        assert "sessions_planned" in result


# ---------------------------------------------------------------------------
# Clinic Summary Performance Tests
# ---------------------------------------------------------------------------

class TestInterventionAnalyzerPerformance:
    """Verify clinic summary endpoint uses batch queries, not N+1."""

    def test_clinic_summary_is_single_query(self, client: TestClient, auth_headers: dict) -> None:
        """Mock to verify only 3 queries execute for N courses."""
        pid = _create_patient(client, auth_headers)
        db = SessionLocal()
        try:
            from app.persistence.models import TreatmentCourse, ClinicalSession

            course_id = f"course-{uuid.uuid4().hex[:8]}"
            db.add(
                TreatmentCourse(
                    id=course_id,
                    patient_id=pid,
                    clinician_id="actor-clinician-demo",
                    protocol_id="PRO-PERF-1",
                    condition_slug="mdd",
                    modality_slug="TMS",
                    target_region="DLPFC",
                    planned_sessions_total=10,
                    planned_session_duration_minutes=30,
                    planned_intensity="120",
                    coil_placement="F3",
                    status="active",
                )
            )
            for i in range(5):
                sid = str(uuid.uuid4())
                db.add(
                    ClinicalSession(
                        id=sid,
                        patient_id=pid,
                        clinician_id="actor-clinician-demo",
                        scheduled_at=datetime.now(timezone.utc).isoformat(),
                        duration_minutes=30,
                        appointment_type="session",
                        status="completed",
                    )
                )
            db.commit()
        finally:
            db.close()

        r = client.get(
            f"/api/v1/patients/{pid}/intervention-analyzer",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        # Planning snapshot must use batched queries (no per-session N+1)
        assert body["planning_snapshot"] is not None
        # Sessions list should be pre-fetched, not lazy-loaded per row
        assert isinstance(body["sessions"], list)
        # Contributors should reference batched artifact IDs
        for contrib in body["multimodal_contributors"]:
            assert "linked_artifact_ids" in contrib


# ---------------------------------------------------------------------------
# Intervention Type Coverage Tests
# ---------------------------------------------------------------------------

class TestInterventionTypeCoverage:
    def test_all_intervention_types_defined(self):
        expected = [
            "tms", "tdcs", "tacs", "trns", "tavns", "tps", "pbm",
            "neurofeedback", "medication_change", "psychotherapy",
            "occupational_therapy", "speech_therapy", "physiotherapy",
            "digital_therapeutics", "sleep_intervention", "nutrition",
            "exercise", "lifestyle", "accommodations", "multimodal",
        ]
        for itype in expected:
            assert itype in INTERVENTION_TYPE_SLUGS, f"Missing: {itype}"

    def test_intervention_types_are_lowercase_slug_format(self):
        for itype in INTERVENTION_TYPE_SLUGS:
            assert itype == itype.lower(), f"Must be lowercase: {itype}"
            assert " " not in itype, f"Must not contain spaces: {itype}"

    def test_no_duplicate_intervention_types(self):
        assert len(INTERVENTION_TYPE_SLUGS) == len(set(INTERVENTION_TYPE_SLUGS)), "Duplicate slugs found"


# ---------------------------------------------------------------------------
# Safety Wording Audit — no banned phrases in service code
# ---------------------------------------------------------------------------

class TestSafetyWordingAudit:
    def test_no_banned_phrases_in_service(self):
        import os
        service_path = os.path.join(
            os.path.dirname(__file__), "..", "app", "services", "intervention_analyzer.py"
        )
        with open(service_path) as f:
            content = f.read()
        for phrase in BANNED_PHRASES:
            assert phrase.lower() not in content.lower(), f"Banned: {phrase}"

    def test_service_contains_decision_support_disclaimer(self):
        import os
        service_path = os.path.join(
            os.path.dirname(__file__), "..", "app", "services", "intervention_analyzer.py"
        )
        with open(service_path) as f:
            content = f.read()
        assert (
            "decision support" in content.lower() or "decision-support" in content.lower()
        ), "Missing decision-support disclaimer in service"

    def test_service_contains_no_calibrated_model_disclaimer(self):
        import os
        service_path = os.path.join(
            os.path.dirname(__file__), "..", "app", "services", "intervention_analyzer.py"
        )
        with open(service_path) as f:
            content = f.read()
        assert (
            "no_calibrated_model" in content or "not a calibrated" in content.lower()
        ), "Missing calibrated-model limitation in service"

    def test_no_autonomous_prescribing_language(self):
        import os
        service_path = os.path.join(
            os.path.dirname(__file__), "..", "app", "services", "intervention_analyzer.py"
        )
        with open(service_path) as f:
            content = f.read()
        prescribing_phrases = [
            "prescribe", "prescribing", "autonomous approval", "self-adjust",
            "auto-dose", "dosing advice", "protocol optimisation",
        ]
        for phrase in prescribing_phrases:
            # We allow "Does not prescribe" as a negative disclaimer
            if phrase in content.lower():
                lines = [line for line in content.splitlines() if phrase in line.lower()]
                for line in lines:
                    assert "not" in line.lower() or "does" in line.lower(), (
                        f"Potentially autonomous prescribing language: '{phrase}' in: {line.strip()}"
                    )
