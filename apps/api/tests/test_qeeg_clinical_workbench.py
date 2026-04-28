"""Unit tests for qEEG Clinical Intelligence Workbench services (Migration 048).

Covers:
  - qeeg_safety_engine
  - qeeg_claim_governance
  - qeeg_clinician_review
  - qeeg_protocol_fit
  - qeeg_timeline
  - qeeg_bids_export
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from app.errors import ApiServiceError


class FakeAnalysis:
    """Minimal mock for QEEGAnalysis safety checks."""

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


# ── Safety Engine ────────────────────────────────────────────────────────────


def _good_analysis(**overrides):
    """Return a FakeAnalysis that passes all safety checks."""
    defaults = dict(
        recording_duration_sec=300.0,
        sample_rate_hz=256.0,
        channel_count=19,
        eyes_condition="closed",
        artifact_rejection_json=json.dumps(
            {"epochs_total": 100, "epochs_kept": 95}
        ),
        quality_metrics_json=json.dumps({"bad_channels": []}),
        pipeline_version="v2.1",
        channels_json=json.dumps(
            ["Fp1","Fp2","F7","F3","Fz","F4","F8","T3","C3","Cz","C4","T4","T5","P3","Pz","P4","T6","O1","O2"]
        ),
        band_powers_json=json.dumps({"bands": {"alpha": {"channels": {"Cz": {}}}}}),
        normative_zscores_json=None,
    )
    defaults.update(overrides)
    return FakeAnalysis(**defaults)


def test_compute_safety_cockpit_passes_basic_checks():
    from app.services.qeeg_safety_engine import compute_safety_cockpit

    analysis = _good_analysis()
    cockpit = compute_safety_cockpit(analysis)
    assert cockpit["overall_status"] == "VALID_FOR_REVIEW"
    assert any(c["label"] == "Duration" and c["status"] == "pass" for c in cockpit["checks"])
    assert any(c["label"] == "Sample rate" and c["status"] == "pass" for c in cockpit["checks"])


def test_compute_safety_cockpit_fails_short_duration():
    from app.services.qeeg_safety_engine import compute_safety_cockpit

    analysis = _good_analysis(recording_duration_sec=30.0)
    cockpit = compute_safety_cockpit(analysis)
    assert cockpit["overall_status"] == "REPEAT_RECOMMENDED"
    assert any(c["label"] == "Duration" and c["status"] == "fail" for c in cockpit["checks"])


def test_compute_interpretability_status():
    from app.services.qeeg_safety_engine import compute_interpretability_status

    assert compute_interpretability_status({"overall_status": "VALID_FOR_REVIEW"}) == "VALID_FOR_REVIEW"
    assert compute_interpretability_status({"overall_status": "REPEAT_RECOMMENDED"}) == "REPEAT_RECOMMENDED"


def test_detect_red_flags_epileptiform():
    from app.services.qeeg_safety_engine import detect_red_flags

    analysis = FakeAnalysis(
        band_powers_json=json.dumps(
            {"bands": {"beta": {"channels": {"T3": {"absolute_uv2": 250.0}}}}}
        ),
        normative_zscores_json=None,
        quality_metrics_json=json.dumps({"bad_channels": []}),
        artifact_rejection_json=json.dumps({"epochs_total": 100, "epochs_kept": 95}),
        channel_count=19,
    )
    result = detect_red_flags(analysis, notes="")
    assert result["flag_count"] > 0
    assert any(f["code"] == "EPILEPTIFORM_HEURISTIC" for f in result["flags"])


def test_detect_red_flags_no_flags():
    from app.services.qeeg_safety_engine import detect_red_flags

    analysis = FakeAnalysis(
        band_powers_json=json.dumps({"bands": {}}),
        normative_zscores_json=None,
        quality_metrics_json=json.dumps({"bad_channels": []}),
        artifact_rejection_json=json.dumps({"epochs_total": 100, "epochs_kept": 95}),
        channel_count=19,
    )
    result = detect_red_flags(analysis, notes="")
    assert result["flag_count"] == 0


# ── Claim Governance ─────────────────────────────────────────────────────────


def test_classify_claims_blocks_diagnostic_language():
    from app.services.qeeg_claim_governance import classify_claims

    narrative = {
        "executive_summary": "The qEEG confirms ADHD and diagnoses autism with 95% certainty.",
        "findings": [],
        "condition_correlations": [],
        "protocol_recommendations": [],
        "band_analysis": {},
        "key_biomarkers": {},
    }
    result = classify_claims(narrative)
    assert any(c["claim_type"] == "BLOCKED" for c in result)


def test_classify_claims_allows_observed():
    from app.services.qeeg_claim_governance import classify_claims

    narrative = {
        "executive_summary": "",
        "findings": [
            {"observation": "Elevated frontal theta power (15.2 µV²) was observed relative to normative data.", "citations": []}
        ],
        "condition_correlations": [],
        "protocol_recommendations": [],
        "band_analysis": {},
        "key_biomarkers": {},
    }
    result = classify_claims(narrative)
    finding_claims = [c for c in result if c["section"].startswith("findings")]
    assert any(c["claim_type"] == "OBSERVED" for c in finding_claims)


def test_sanitize_for_patient_strips_blocked():
    from app.services.qeeg_claim_governance import sanitize_for_patient

    report = {
        "executive_summary": "The qEEG diagnoses ADHD.",
        "findings": [
            {"observation": "Excessive theta confirms ADHD.", "region": "frontal"}
        ],
        "protocol_recommendations": [
            {"modality": "rTMS", "target": "DLPFC", "rationale": "May improve focus."}
        ],
        "band_analysis": {},
        "key_biomarkers": {},
    }
    out = sanitize_for_patient(report)
    assert "diagnoses" not in out["executive_summary"].lower()
    # Blocked finding should be removed entirely
    assert not any("confirm" in (f.get("observation") or "").lower() for f in out.get("findings", []))


def test_scan_for_banned_words():
    from app.services.qeeg_claim_governance import scan_for_banned_words

    assert "diagnosis" in scan_for_banned_words("This is a diagnostic tool for diagnosis.")
    assert scan_for_banned_words("Normal observation.") == []


# ── Clinician Review ─────────────────────────────────────────────────────────


def test_transition_report_state_draft_to_review():
    from app.services.qeeg_clinician_review import transition_report_state

    report = MagicMock()
    report.report_state = "DRAFT_AI"
    report.reviewer_id = None
    report.reviewed_at = None
    report.report_version = 1
    report.id = "r1"

    actor = MagicMock()
    actor.actor_id = "clin_1"
    actor.role = "clinician"

    db = MagicMock()

    result = transition_report_state(report, "NEEDS_REVIEW", actor, db)
    assert result.report_state == "NEEDS_REVIEW"


def test_transition_report_state_invalid_transition():
    from app.services.qeeg_clinician_review import transition_report_state

    report = MagicMock()
    report.report_state = "DRAFT_AI"
    report.id = "r1"

    actor = MagicMock()
    actor.actor_id = "clin_1"
    actor.role = "clinician"

    db = MagicMock()

    with pytest.raises(ApiServiceError) as exc:
        transition_report_state(report, "APPROVE", actor, db)
    assert exc.value.code == "invalid_transition"


def test_sign_report_requires_approved_state():
    from app.services.qeeg_clinician_review import sign_report

    db = MagicMock()
    report = MagicMock()
    report.report_state = "DRAFT_AI"
    report.signed_by = None
    report.signed_at = None
    db.query.return_value.filter_by.return_value.first.return_value = report

    actor = MagicMock()
    actor.actor_id = "clin_1"
    actor.role = "clinician"

    with pytest.raises(ApiServiceError) as exc:
        sign_report("r1", actor, db)
    assert exc.value.code == "not_approved"


def test_can_export_gate():
    from app.services.qeeg_clinician_review import can_export

    assert can_export(MagicMock(report_state="APPROVED", signed_by="clin_1", signed_at=datetime.now(timezone.utc)))
    assert not can_export(MagicMock(report_state="DRAFT_AI", signed_by="clin_1", signed_at=datetime.now(timezone.utc)))
    assert not can_export(MagicMock(report_state="APPROVED", signed_by=None, signed_at=None))


# ── Protocol Fit ─────────────────────────────────────────────────────────────


def test_compute_protocol_fit_returns_structured_result():
    from app.services.qeeg_protocol_fit import compute_protocol_fit

    analysis = FakeAnalysis(
        id="a1",
        patient_id="p1",
        band_powers_json=json.dumps(
            {"bands": {"theta": {"channels": {"Fz": {"relative_pct": 35}}}}}
        ),
        normative_zscores_json=None,
    )
    patient = MagicMock()
    patient.id = "p1"
    patient.date_of_birth = datetime(1990, 1, 1, tzinfo=timezone.utc)
    patient.gender = "female"
    patient.primary_condition = "MDD"

    db = MagicMock()
    db.add = MagicMock()

    fit = compute_protocol_fit(analysis, patient, db)
    assert fit.pattern_summary
    assert fit.analysis_id == "a1"
    db.add.assert_called_once()


# ── Timeline ─────────────────────────────────────────────────────────────────


def test_build_timeline_returns_sorted_events():
    from app.services.qeeg_timeline import build_timeline
    from app.persistence.models import QEEGAnalysis, OutcomeSeries, OutcomeEvent, WearableDailySummary

    analyses = [
        FakeAnalysis(
            id="a1",
            patient_id="p1",
            created_at=datetime(2024, 1, 15, tzinfo=timezone.utc),
            analyzed_at=datetime(2024, 1, 15, tzinfo=timezone.utc),
            analysis_status="completed",
            band_powers_json=json.dumps({"global_summary": {"theta_mean_uv2": 10.0}}),
            channel_count=19,
            sample_rate_hz=256.0,
            recording_duration_sec=300.0,
            interpretability_status="VALID_FOR_REVIEW",
        ),
        FakeAnalysis(
            id="a2",
            patient_id="p1",
            created_at=datetime(2024, 3, 10, tzinfo=timezone.utc),
            analyzed_at=datetime(2024, 3, 10, tzinfo=timezone.utc),
            analysis_status="completed",
            band_powers_json=json.dumps({"global_summary": {"theta_mean_uv2": 12.0}}),
            channel_count=19,
            sample_rate_hz=256.0,
            recording_duration_sec=300.0,
            interpretability_status="VALID_FOR_REVIEW",
        ),
    ]

    def _mock_query(model):
        q = MagicMock()
        if model is QEEGAnalysis:
            q.filter_by.return_value.order_by.return_value.all.return_value = analyses
        else:
            q.filter_by.return_value.order_by.return_value.all.return_value = []
            q.filter_by.return_value.order_by.return_value.limit.return_value.all.return_value = []
        return q

    db = MagicMock()
    db.query.side_effect = _mock_query

    events = build_timeline("p1", db)
    assert len(events) >= 2
    dates = [e["date"] for e in events]
    assert dates == sorted(dates)
    # First event should be baseline, second followup
    assert events[0]["event_type"] == "qeeg_baseline"
    assert events[1]["event_type"] == "qeeg_followup"
    assert events[1]["rci"] is not None


def test_build_timeline_empty():
    from app.services.qeeg_timeline import build_timeline

    db = MagicMock()
    db.query.return_value.filter_by.return_value.order_by.return_value.all.return_value = []
    events = build_timeline("p1", db)
    assert events == []


# ── BIDS Export ──────────────────────────────────────────────────────────────


def test_build_bids_package_returns_zip_buffer():
    from app.services.qeeg_bids_export import build_bids_package

    analysis = FakeAnalysis(
        id="a1",
        patient_id="p1",
        analysis_status="completed",
        sample_rate_hz=256.0,
        channel_count=19,
        recording_duration_sec=300.0,
        analysis_params_json=json.dumps({"filter": "1-45 Hz"}),
        pipeline_version="v2.1",
        norm_db_version="v1.0",
        band_powers_json=json.dumps({"bands": {}}),
        normative_deviations_json=None,
        normative_zscores_json=None,
        advanced_analyses_json=None,
        source_roi_json=None,
        quality_metrics_json=json.dumps({"bad_channels": []}),
        artifact_rejection_json=json.dumps({"bad_segments": []}),
        safety_cockpit_json=None,
        red_flags_json=None,
        created_at=datetime(2024, 1, 15, tzinfo=timezone.utc),
    )

    db = MagicMock()
    # First query: QEEGAnalysis; second query: QEEGAIReport (return None so export gating is skipped)
    db.query.return_value.filter_by.return_value.first.return_value = analysis
    db.query.return_value.filter_by.return_value.order_by.return_value.first.return_value = None

    actor = MagicMock()
    actor.actor_id = "clin_1"

    buf = build_bids_package("a1", actor, db)
    assert hasattr(buf, "read")


def test_build_bids_package_blocked_when_not_signed():
    from app.services.qeeg_bids_export import build_bids_package

    analysis = FakeAnalysis(
        id="a1",
        patient_id="p1",
        analysis_status="completed",
        sample_rate_hz=256.0,
        channel_count=19,
        recording_duration_sec=300.0,
        analysis_params_json=None,
        pipeline_version=None,
        norm_db_version=None,
        band_powers_json=None,
        normative_deviations_json=None,
        normative_zscores_json=None,
        advanced_analyses_json=None,
        source_roi_json=None,
        quality_metrics_json=None,
        artifact_rejection_json=None,
        safety_cockpit_json=None,
        red_flags_json=None,
        created_at=datetime(2024, 1, 15, tzinfo=timezone.utc),
    )

    report = MagicMock()
    report.report_state = "DRAFT_AI"
    report.signed_by = None
    report.signed_at = None

    db = MagicMock()
    db.query.return_value.filter_by.return_value.first.return_value = analysis
    db.query.return_value.filter_by.return_value.order_by.return_value.first.return_value = report

    actor = MagicMock()
    actor.actor_id = "clin_1"

    with pytest.raises(ApiServiceError) as exc:
        build_bids_package("a1", actor, db)
    assert exc.value.code == "export_not_allowed"
