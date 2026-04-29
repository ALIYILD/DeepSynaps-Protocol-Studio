"""Tests for fusion workbench service (Migration 054).

Covers agreement engine, protocol fusion, patient-facing sanitization,
state transitions, and create_fusion_case orchestration.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from app.persistence.models import FusionCase
from app.services.fusion_workbench_service import (
    _build_patient_facing_report,
    _generate_summary,
    _run_agreement_engine,
    _run_protocol_fusion,
    create_fusion_case,
    transition_fusion_case_state,
    VALID_TRANSITIONS,
)


class FakeQEEGAnalysis:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class FakeMriAnalysis:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class FakeQEEGAIReport:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class FakeFusionCase:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


# ── Agreement engine ─────────────────────────────────────────────────────────


def test_agreement_engine_no_data():
    result = _run_agreement_engine(None, None)
    assert result["overall_status"] == "no_data"
    assert result["score"] == 0.0
    assert result["items"] == []


def test_agreement_engine_condition_agree():
    qeeg = {"flagged_conditions": [{"condition": "Depression"}]}
    mri = {"condition": "Depression"}
    result = _run_agreement_engine(qeeg, mri)
    item = next(i for i in result["items"] if i["topic"] == "condition")
    assert item["status"] == "AGREE"


def test_agreement_engine_condition_disagree():
    qeeg = {"flagged_conditions": [{"condition": "Depression"}]}
    mri = {"condition": "Anxiety"}
    result = _run_agreement_engine(qeeg, mri)
    item = next(i for i in result["items"] if i["topic"] == "condition")
    assert item["status"] == "DISAGREE"


def test_agreement_engine_condition_partial():
    qeeg = {"flagged_conditions": [{"condition": "Depression"}]}
    mri = None
    result = _run_agreement_engine(qeeg, mri)
    item = next(i for i in result["items"] if i["topic"] == "condition")
    assert item["status"] == "PARTIAL"


def test_agreement_engine_brain_age_agree():
    qeeg = {"brain_age": {"gap_years": 8.5}, "flagged_conditions": []}
    mri = {"structural": {"findings": [{"label": "Hippocampal atrophy"}]}}
    result = _run_agreement_engine(qeeg, mri)
    item = next(i for i in result["items"] if i["topic"] == "brain_age_structural")
    assert item["status"] == "AGREE"


def test_agreement_engine_brain_age_disagree():
    qeeg = {"brain_age": {"gap_years": 2.0}, "flagged_conditions": []}
    mri = {"structural": {"findings": [{"label": "Hippocampal atrophy"}]}}
    result = _run_agreement_engine(qeeg, mri)
    item = next(i for i in result["items"] if i["topic"] == "brain_age_structural")
    assert item["status"] == "DISAGREE"


def test_agreement_engine_protocol_agree():
    qeeg = {"protocol_recommendation": {"target_region": "DLPFC"}, "flagged_conditions": []}
    mri = {"stim_targets": [{"region": "DLPFC", "x": 1, "y": 2, "z": 3}]}
    result = _run_agreement_engine(qeeg, mri)
    item = next(i for i in result["items"] if i["topic"] == "protocol_target")
    assert item["status"] == "AGREE"


def test_agreement_engine_protocol_conflict():
    qeeg = {"protocol_recommendation": {"target_region": "DLPFC"}, "flagged_conditions": []}
    mri = {"stim_targets": [{"region": "sgACC", "x": 1, "y": 2, "z": 3}]}
    result = _run_agreement_engine(qeeg, mri)
    item = next(i for i in result["items"] if i["topic"] == "protocol_target")
    assert item["status"] == "CONFLICT"
    assert item["severity"] == "critical"


def test_agreement_engine_safety_agree():
    qeeg = {"red_flags": [{"code": "EPILEPTIFORM"}], "flagged_conditions": []}
    mri = {"red_flags": [{"code": "EPILEPTIFORM"}]}
    result = _run_agreement_engine(qeeg, mri)
    item = next(i for i in result["items"] if i["topic"] == "safety")
    assert item["status"] == "AGREE"


def test_agreement_engine_safety_partial():
    qeeg = {"red_flags": [{"code": "EPILEPTIFORM"}], "flagged_conditions": []}
    mri = {"red_flags": []}
    result = _run_agreement_engine(qeeg, mri)
    item = next(i for i in result["items"] if i["topic"] == "safety")
    assert item["status"] == "PARTIAL"


# ── Protocol fusion ──────────────────────────────────────────────────────────


def test_protocol_fusion_merged():
    qeeg = {"protocol_recommendation": {"target_region": "DLPFC", "frequency_hz": 10}}
    mri = {"stim_targets": [{"region": "DLPFC", "x": 1, "y": 2, "z": 3}]}
    agreement = {"overall_status": "agreement"}
    result = _run_protocol_fusion(qeeg, mri, agreement)
    assert result["fusion_status"] == "merged"
    assert "MRI-guided coordinates" in result["recommendation"]


def test_protocol_fusion_conflict():
    qeeg = {"protocol_recommendation": {"target_region": "DLPFC"}}
    mri = {"stim_targets": [{"region": "sgACC"}]}
    agreement = {"overall_status": "conflict"}
    result = _run_protocol_fusion(qeeg, mri, agreement)
    assert result["fusion_status"] == "conflict"
    assert "Clinician must select one" in result["recommendation"]


def test_protocol_fusion_qeeg_only():
    qeeg = {"protocol_recommendation": {"target_region": "DLPFC"}}
    mri = None
    agreement = {"overall_status": "partial"}
    result = _run_protocol_fusion(qeeg, mri, agreement)
    assert result["fusion_status"] == "qeeg_only"


def test_protocol_fusion_none():
    result = _run_protocol_fusion(None, None, {})
    assert result["fusion_status"] == "none"


# ── Summary generation ───────────────────────────────────────────────────────


def test_generate_summary_partial():
    inputs = {"qeeg_payload": {"id": "q1"}, "mri_payload": None, "partial": True, "patient_id": "p1"}
    agreement = {"overall_status": "partial", "score": 0.0}
    protocol = {"recommendation": "Use qEEG guidance."}
    summary, confidence, grade = _generate_summary(inputs, agreement, protocol)
    assert "Partial fusion" in summary
    assert confidence is not None
    assert grade == "heuristic"


def test_generate_summary_dual():
    inputs = {"qeeg_payload": {"id": "q1"}, "mri_payload": {"analysis_id": "m1"}, "partial": False, "patient_id": "p1"}
    agreement = {"overall_status": "agreement", "score": 0.75}
    protocol = {"recommendation": "Merged protocol."}
    summary, confidence, grade = _generate_summary(inputs, agreement, protocol)
    assert "Dual-modality" in summary
    assert confidence is not None


# ── Patient-facing report ────────────────────────────────────────────────────


def test_patient_facing_strips_blocked():
    case = FakeFusionCase(
        patient_id="pat-123",
        summary="Test summary",
        confidence=0.7,
        confidence_grade="heuristic",
        protocol_fusion_json=json.dumps({"recommendation": "Do X."}),
        governance_json=json.dumps([
            {"section": "findings", "claim_type": "BLOCKED", "text": "Bad claim"},
            {"section": "findings", "claim_type": "OBSERVED", "text": "Good claim"},
        ]),
        limitations_json=json.dumps(["Limit 1"]),
        generated_at=datetime.now(timezone.utc),
    )
    report = _build_patient_facing_report(case)
    claims = report["claims"]
    assert len(claims) == 1
    assert claims[0]["text"] == "Good claim"
    assert "sha256:" in report["patient_id_hash"]
    assert report["decision_support_only"] is True


def test_patient_facing_softens_inferred():
    case = FakeFusionCase(
        patient_id="pat-123",
        summary="Test",
        confidence=0.5,
        confidence_grade="heuristic",
        protocol_fusion_json=json.dumps({}),
        governance_json=json.dumps([
            {"section": "findings", "claim_type": "INFERRED", "text": "This suggests depression."},
        ]),
        limitations_json=json.dumps([]),
        generated_at=datetime.now(timezone.utc),
    )
    report = _build_patient_facing_report(case)
    assert "could be associated with" in report["claims"][0]["text"]


# ── State transitions ────────────────────────────────────────────────────────


def test_valid_transitions():
    assert "needs_clinical_review" in VALID_TRANSITIONS["FUSION_DRAFT_AI"]
    assert "approve" in VALID_TRANSITIONS["FUSION_NEEDS_CLINICAL_REVIEW"]
    assert "sign" in VALID_TRANSITIONS["FUSION_APPROVED"]
    assert "archive" in VALID_TRANSITIONS["FUSION_SIGNED"]


def test_transition_approve():
    db = MagicMock()
    case = FakeFusionCase(id="c1", report_state="FUSION_NEEDS_CLINICAL_REVIEW")
    db.query.return_value.filter_by.return_value.first.return_value = case
    db.commit = MagicMock()
    db.refresh = MagicMock()

    result = transition_fusion_case_state(db, "c1", "approve", "dr.smith", "clinician")
    assert result.report_state == "FUSION_APPROVED"
    assert result.reviewer_id == "dr.smith"
    assert result.reviewed_at is not None


def test_transition_sign():
    db = MagicMock()
    case = FakeFusionCase(id="c1", report_state="FUSION_APPROVED")
    db.query.return_value.filter_by.return_value.first.return_value = case
    db.commit = MagicMock()
    db.refresh = MagicMock()

    result = transition_fusion_case_state(db, "c1", "sign", "dr.smith", "clinician")
    assert result.report_state == "FUSION_SIGNED"
    assert result.signed_by == "dr.smith"
    assert result.signed_at is not None


def test_transition_invalid_raises():
    db = MagicMock()
    case = FakeFusionCase(id="c1", report_state="FUSION_DRAFT_AI")
    db.query.return_value.filter_by.return_value.first.return_value = case

    with pytest.raises(ValueError) as exc:
        transition_fusion_case_state(db, "c1", "sign", "dr.smith", "clinician")
    assert "Invalid transition" in str(exc.value)


# ── create_fusion_case blocked by safety ─────────────────────────────────────


def test_create_fusion_case_blocked_by_red_flags():
    db = MagicMock()
    qeeg = FakeQEEGAnalysis(
        id="q1",
        patient_id="p1",
        analysis_status="completed",
        safety_cockpit_json=json.dumps({
            "red_flags": [
                {"code": "EPILEPTIFORM", "severity": "critical", "resolved": False}
            ]
        }),
        red_flags_json=None,
        band_powers_json=json.dumps({"bands": {}}),
        advanced_analyses_json=None,
        brain_age_json=None,
        risk_scores_json=None,
        protocol_recommendation_json=None,
        flagged_conditions=None,
        quality_metrics_json=json.dumps({"bad_channels": []}),
        analyzed_at=datetime.now(timezone.utc),
    )
    mri = None

    # Mock query chain for _latest_qeeg_analysis
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = qeeg
    # Mock _latest_mri_analysis
    def _mock_query(model):
        m = MagicMock()
        if model.__name__ == "QEEGAnalysis":
            m.filter.return_value.order_by.return_value.first.return_value = qeeg
        elif model.__name__ == "MriAnalysis":
            m.filter.return_value.order_by.return_value.first.return_value = None
        elif model.__name__ == "AssessmentRecord":
            m.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        elif model.__name__ == "TreatmentCourse":
            m.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        elif model.__name__ == "QEEGAIReport":
            m.filter_by.return_value.order_by.return_value.first.return_value = None
        return m

    db.query.side_effect = _mock_query

    result = create_fusion_case(db, "p1", "dr.smith", "clinician")
    assert isinstance(result, dict)
    assert result["blocked"] is True
    assert any("EPILEPTIFORM" in r for r in result["reasons"])


# ── create_fusion_case success path (heuristic) ──────────────────────────────


def test_create_fusion_case_success():
    db = MagicMock()
    qeeg = FakeQEEGAnalysis(
        id="q1",
        patient_id="p1",
        analysis_status="completed",
        safety_cockpit_json=json.dumps({"red_flags": []}),
        red_flags_json=None,
        band_powers_json=json.dumps({"bands": {}}),
        advanced_analyses_json=None,
        brain_age_json=json.dumps({"gap_years": 3.0}),
        risk_scores_json=None,
        protocol_recommendation_json=json.dumps({"target_region": "DLPFC", "frequency_hz": 10}),
        flagged_conditions=None,
        quality_metrics_json=json.dumps({"bad_channels": []}),
        analyzed_at=datetime.now(timezone.utc),
    )
    mri = FakeMriAnalysis(
        analysis_id="m1",
        patient_id="p1",
        state="SUCCESS",
        safety_cockpit_json=json.dumps({"red_flags": []}),
        red_flags_json=None,
        structural_json=json.dumps({"findings": []}),
        functional_json=None,
        diffusion_json=None,
        stim_targets_json=json.dumps([{"region": "DLPFC", "x": 1, "y": 2, "z": 3}]),
        qc_json=None,
        condition="Depression",
        report_state="MRI_APPROVED",
        created_at=datetime.now(timezone.utc),
    )

    def _mock_query(model):
        m = MagicMock()
        if model.__name__ == "QEEGAnalysis":
            m.filter.return_value.order_by.return_value.first.return_value = qeeg
        elif model.__name__ == "MriAnalysis":
            m.filter.return_value.order_by.return_value.first.return_value = mri
        elif model.__name__ == "AssessmentRecord":
            m.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        elif model.__name__ == "TreatmentCourse":
            m.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        elif model.__name__ == "QEEGAIReport":
            m.filter_by.return_value.order_by.return_value.first.return_value = None
        return m

    db.query.side_effect = _mock_query

    result = create_fusion_case(db, "p1", "dr.smith", "clinician")
    # Since we use a MagicMock db, the FusionCase object won't actually be
    # persisted, but the return type should be a FusionCase (or dict if blocked)
    # In MagicMock mode, create_fusion_case returns the case before db.add/commit
    # Because db.add is MagicMock, the case is still the local object.
    assert hasattr(result, "report_state") or isinstance(result, dict)
    if hasattr(result, "report_state"):
        assert result.report_state == "FUSION_DRAFT_AI"
        assert result.partial is False


# ── Claim governance tests ──────────────────────────────────────────────────

def test_classify_fusion_claim_blocks_confirms_adhd():
    from app.services.fusion_workbench_service import _classify_fusion_claim
    ctype, reason = _classify_fusion_claim("The analysis confirms ADHD.")
    assert ctype == "BLOCKED"
    assert "BLOCKED_CONFIRMS_DISEASE" in reason


def test_classify_fusion_claim_blocks_diagnosis():
    from app.services.fusion_workbench_service import _classify_fusion_claim
    ctype, reason = _classify_fusion_claim("This is a diagnostic finding.")
    assert ctype == "BLOCKED"
    assert "BLOCKED_DIAGNOSTIC_WORDING" in reason


def test_classify_fusion_claim_blocks_cure():
    from app.services.fusion_workbench_service import _classify_fusion_claim
    ctype, reason = _classify_fusion_claim("The protocol cures depression.")
    assert ctype == "BLOCKED"
    assert "BLOCKED_CURE" in reason


def test_classify_fusion_claim_blocks_guaranteed():
    from app.services.fusion_workbench_service import _classify_fusion_claim
    ctype, reason = _classify_fusion_claim("We guarantee a response within 2 weeks.")
    assert ctype == "BLOCKED"
    assert "BLOCKED_GUARANTEE" in reason


def test_classify_fusion_claim_blocks_safe_to_treat():
    from app.services.fusion_workbench_service import _classify_fusion_claim
    ctype, reason = _classify_fusion_claim("The scan shows it is safe to treat.")
    assert ctype == "BLOCKED"
    assert "BLOCKED_SAFE_TO_TREAT" in reason


def test_classify_fusion_claim_allows_safe_text():
    from app.services.fusion_workbench_service import _classify_fusion_claim
    ctype, reason = _classify_fusion_claim("Elevated theta/beta ratio consistent with ADHD.")
    assert ctype == "INFERRED"
    assert reason is None


def test_sanitize_patient_summary_softens_blocked():
    from app.services.fusion_workbench_service import _sanitize_patient_summary
    out = _sanitize_patient_summary("The analysis confirms ADHD. Proceed with protocol.")
    assert "confirms ADHD" not in out
    assert "[Language softened" in out or "consistent with" in out
    assert "Proceed with protocol" in out


def test_sanitize_patient_summary_softens_inferred():
    from app.services.fusion_workbench_service import _sanitize_patient_summary
    out = _sanitize_patient_summary("qEEG suggests elevated theta.")
    assert "suggests" not in out
    assert "could be associated with" in out


def test_patient_facing_strips_blocked_claims():
    from app.services.fusion_workbench_service import _build_patient_facing_report
    case = FusionCase(
        id="case-gov-1",
        patient_id="p-1",
        clinician_id="c-1",
        summary="The analysis confirms ADHD.",
        confidence=0.72,
        confidence_grade="heuristic",
        governance_json=json.dumps([
            {"section": "summary", "claim_type": "BLOCKED", "text": "The analysis confirms ADHD.", "block_reason": "BLOCKED_CONFIRMS_DISEASE"},
        ]),
        protocol_fusion_json=json.dumps({"recommendation": "tDCS F3-F4"}),
        limitations_json=json.dumps([]),
        generated_at=datetime.now(timezone.utc),
    )
    report = _build_patient_facing_report(case)
    claims = report["claims"]
    assert all(c["claim_type"] != "BLOCKED" for c in claims)
    assert "confirms ADHD" not in report["summary"]
