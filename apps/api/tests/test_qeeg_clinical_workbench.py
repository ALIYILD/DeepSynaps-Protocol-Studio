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


class FakeAnalysis:
    """Minimal mock for QEEGAnalysis safety checks."""

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


# ── Safety Engine ────────────────────────────────────────────────────────────


def test_compute_safety_cockpit_passes_basic_checks():
    from app.services.qeeg_safety_engine import compute_safety_cockpit

    analysis = FakeAnalysis(
        duration_sec=300,
        sample_rate=256.0,
        channel_count=19,
        eyes_condition="closed",
        montage_type="10-20",
        band_powers_json=json.dumps({"bands": {"alpha": {"channels": {"Cz": {}}}}}),
        rejected_epochs=2,
        total_epochs=100,
        artifact_summary_json=None,
    )
    cockpit = compute_safety_cockpit(analysis)
    assert cockpit["overall_status"] == "VALID_FOR_REVIEW"
    assert any(c["name"] == "Duration" and c["passed"] for c in cockpit["checks"])
    assert any(c["name"] == "Sample Rate" and c["passed"] for c in cockpit["checks"])


def test_compute_safety_cockpit_fails_short_duration():
    from app.services.qeeg_safety_engine import compute_safety_cockpit

    analysis = FakeAnalysis(
        duration_sec=30,
        sample_rate=256.0,
        channel_count=19,
        eyes_condition="closed",
        montage_type="10-20",
        band_powers_json=json.dumps({"bands": {}}),
        rejected_epochs=0,
        total_epochs=10,
        artifact_summary_json=None,
    )
    cockpit = compute_safety_cockpit(analysis)
    assert cockpit["overall_status"] == "REPEAT_RECOMMENDED"
    assert any(c["name"] == "Duration" and not c["passed"] for c in cockpit["checks"])


def test_compute_interpretability_status():
    from app.services.qeeg_safety_engine import compute_interpretability_status

    assert compute_interpretability_status({"overall_status": "VALID_FOR_REVIEW"}) == "VALID_FOR_REVIEW"
    assert compute_interpretability_status({"overall_status": "REPEAT_RECOMMENDED"}) == "REPEAT_RECOMMENDED"


def test_detect_red_flags_epileptiform():
    from app.services.qeeg_safety_engine import detect_red_flags

    analysis = FakeAnalysis(
        ai_narrative_json=json.dumps({"findings": [{"description": "sharp waves in temporal region"}]}),
        band_powers_json=json.dumps({"bands": {}}),
    )
    result = detect_red_flags(analysis, notes="")
    assert result["flag_count"] > 0
    assert any(f["category"] == "Epileptiform" for f in result["flags"])


# ── Claim Governance ─────────────────────────────────────────────────────────


def test_classify_claims_blocks_diagnostic_language():
    from app.services.qeeg_claim_governance import classify_claims

    text = "The qEEG confirms ADHD and diagnoses autism with 95% certainty."
    result = classify_claims(text)
    claims = result["claims"]
    assert any(c["type"] == "BLOCKED" for c in claims)


def test_classify_claims_allows_observed():
    from app.services.qeeg_claim_governance import classify_claims

    text = "Elevated frontal theta power was observed relative to normative data."
    result = classify_claims(text)
    claims = result["claims"]
    assert any(c["type"] == "OBSERVED" for c in claims)


def test_sanitize_for_patient_strips_blocked():
    from app.services.qeeg_claim_governance import sanitize_for_patient

    report = {
        "executive_summary": "The qEEG diagnoses ADHD.",
        "findings": [{"description": "Excessive theta confirms ADHD."}],
        "protocol_recommendations": [{"name": "Neurofeedback"}],
    }
    out = sanitize_for_patient(report)
    assert "diagnoses" not in out["content"]["executive_summary"].lower()
    assert "confirm" not in out["content"]["findings"][0]["description"].lower()


# ── Clinician Review ─────────────────────────────────────────────────────────


def test_transition_report_state_draft_to_review():
    from app.services.qeeg_clinician_review import transition_report_state

    report = MagicMock()
    report.report_state = "DRAFT_AI"
    report.reviewer_id = None
    report.reviewed_at = None

    actor = MagicMock()
    actor.actor_id = "clin_1"

    db = MagicMock()

    result = transition_report_state(report, "SUBMIT_FOR_REVIEW", actor, db)
    assert result.report_state == "NEEDS_REVIEW"
    assert result.reviewer_id == "clin_1"


def test_transition_report_state_invalid_transition():
    from app.services.qeeg_clinician_review import transition_report_state

    report = MagicMock()
    report.report_state = "DRAFT_AI"

    actor = MagicMock()
    actor.actor_id = "clin_1"

    db = MagicMock()

    with pytest.raises(ValueError):
        transition_report_state(report, "APPROVE", actor, db)


def test_sign_report_requires_approved_state():
    from app.services.qeeg_clinician_review import sign_report

    report = MagicMock()
    report.report_state = "DRAFT_AI"
    report.signed_by = None
    report.signed_at = None

    actor = MagicMock()
    actor.actor_id = "clin_1"

    db = MagicMock()
    db.query.return_value.filter_by.return_value.first.return_value = report

    with pytest.raises(ValueError):
        sign_report("r1", actor, db)


def test_can_export_gate():
    from app.services.qeeg_clinician_review import can_export

    assert can_export(MagicMock(report_state="APPROVED", signed_by="clin_1"))
    assert not can_export(MagicMock(report_state="DRAFT_AI", signed_by="clin_1"))
    assert not can_export(MagicMock(report_state="APPROVED", signed_by=None))


# ── Protocol Fit ─────────────────────────────────────────────────────────────


def test_compute_protocol_fit_returns_structured_result():
    from app.services.qeeg_protocol_fit import compute_protocol_fit

    analysis = FakeAnalysis(
        id="a1",
        patient_id="p1",
        band_powers_json=json.dumps({"bands": {"theta": {"channels": {"Fz": {"relative_pct": 35}}}}}),
    )
    patient = MagicMock()
    patient.id = "p1"
    patient.date_of_birth = datetime(1990, 1, 1, tzinfo=timezone.utc)
    patient.gender = "female"

    db = MagicMock()
    db.add = MagicMock()
    db.commit = MagicMock()

    fit = compute_protocol_fit(analysis, patient, db)
    assert fit.pattern_summary
    assert fit.analysis_id == "a1"
    db.add.assert_called_once()


# ── Timeline ─────────────────────────────────────────────────────────────────


def test_build_timeline_returns_sorted_events():
    from app.services.qeeg_timeline import build_timeline

    db = MagicMock()
    db.query.return_value.filter_by.return_value.all.return_value = [
        FakeAnalysis(
            id="a1",
            patient_id="p1",
            created_at=datetime(2024, 1, 15, tzinfo=timezone.utc),
            analysis_status="completed",
            safety_cockpit_json=json.dumps({"overall_status": "VALID_FOR_REVIEW"}),
        ),
        FakeAnalysis(
            id="a2",
            patient_id="p1",
            created_at=datetime(2024, 3, 10, tzinfo=timezone.utc),
            analysis_status="completed",
            safety_cockpit_json=json.dumps({"overall_status": "VALID_FOR_REVIEW"}),
        ),
    ]

    events = build_timeline("p1", db)
    assert len(events) >= 2
    dates = [e["date"] for e in events]
    assert dates == sorted(dates)


# ── BIDS Export ──────────────────────────────────────────────────────────────


def test_build_bids_package_returns_zip_buffer():
    from app.services.qeeg_bids_export import build_bids_package

    analysis = FakeAnalysis(
        id="a1",
        patient_id="p1",
        analysis_status="completed",
        band_powers_json=json.dumps({"bands": {}}),
        created_at=datetime(2024, 1, 15, tzinfo=timezone.utc),
    )

    db = MagicMock()
    db.query.return_value.filter_by.return_value.first.return_value = analysis

    actor = MagicMock()
    actor.actor_id = "clin_1"

    buf = build_bids_package("a1", actor, db)
    assert hasattr(buf, "read")
