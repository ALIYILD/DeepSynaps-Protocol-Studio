from __future__ import annotations

import json

from app.database import SessionLocal
from app.persistence.models import Patient, QEEGAnalysis, QEEGAIReport, QeegCleaningVersion


def test_ai_report_persists_raw_review_handoff(client, auth_headers, monkeypatch) -> None:
    from app.services import qeeg_ai_interpreter

    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-qeeg-raw-handoff",
            clinician_id="actor-clinician-demo",
            first_name="Raw",
            last_name="Handoff",
        )
        db.add(patient)
        analysis = QEEGAnalysis(
            id="analysis-qeeg-raw-handoff",
            patient_id=patient.id,
            clinician_id="actor-clinician-demo",
            analysis_status="completed",
            band_powers_json=json.dumps(
                {
                    "bands": {
                        "alpha": {
                            "channels": {"Pz": {"absolute_uv2": 12.0, "relative_pct": 22.0}},
                        }
                    }
                }
            ),
            quality_metrics_json=json.dumps(
                {
                    "bad_channels": ["Fp1"],
                    "n_epochs_total": 100,
                    "n_epochs_retained": 92,
                    "pipeline_version": "test-pipeline",
                }
            ),
            cleaning_config_json=json.dumps(
                {
                    "cleaning_version_id": "cleaning-qeeg-raw-handoff",
                    "cleaning_version_number": 2,
                }
            ),
            medication_confounds=json.dumps(["methylphenidate"]),
        )
        db.add(analysis)
        version = QeegCleaningVersion(
            id="cleaning-qeeg-raw-handoff",
            analysis_id=analysis.id,
            version_number=2,
            review_status="rerun_requested",
            notes="Manual artifact cleanup completed.",
            bad_channels_json=json.dumps(["Fp1", "T7"]),
            rejected_segments_json=json.dumps(
                [{"start_sec": 1.0, "end_sec": 2.0, "description": "BAD_user"}]
            ),
            rejected_ica_components_json=json.dumps([0, 3]),
            interpolated_channels_json=json.dumps(["Fp1"]),
            cleaned_summary_json=json.dumps({"retained_data_pct": 97.5}),
            created_by_actor_id="actor-clinician-demo",
            derived_analysis_id=analysis.id,
        )
        db.add(version)
        db.commit()
    finally:
        db.close()

    async def _fake_generate_ai_report(**kwargs):
        return {
            "success": True,
            "source": "mock",
            "model_used": "mock-model",
            "prompt_hash": "1" * 64,
            "literature_refs": [],
            "data": {
                "executive_summary": "Review artifact burden before interpretation.",
                "findings": [
                    {
                        "region": "frontal",
                        "band": "alpha",
                        "observation": "Alpha preserved posteriorly.",
                        "citations": [],
                    }
                ],
                "protocol_recommendations": [],
                "confidence_level": "moderate",
            },
        }

    monkeypatch.setattr(
        qeeg_ai_interpreter,
        "generate_ai_report",
        _fake_generate_ai_report,
    )
    monkeypatch.setattr(
        qeeg_ai_interpreter,
        "match_condition_patterns",
        lambda payload: [],
    )

    resp = client.post(
        "/api/v1/qeeg-analysis/analysis-qeeg-raw-handoff/ai-report",
        json={"report_type": "standard", "patient_context": "Artifact-focused review."},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text

    db = SessionLocal()
    try:
        report = db.query(QEEGAIReport).filter_by(analysis_id="analysis-qeeg-raw-handoff").one()
        payload = json.loads(report.ai_narrative_json or "{}")
    finally:
        db.close()

    handoff = payload.get("raw_review_handoff")
    assert isinstance(handoff, dict)
    assert handoff["cleaning_version_id"] == "cleaning-qeeg-raw-handoff"
    assert handoff["cleaning_version_number"] == 2
    assert handoff["bad_channels"] == ["Fp1", "T7"]
    assert handoff["rejected_segments"][0]["description"] == "BAD_user"
    assert handoff["rejected_ica_components"] == [0, 3]
    assert handoff["interpolated_channels"] == ["Fp1"]
    assert handoff["medication_confounds"] == ["methylphenidate"]
