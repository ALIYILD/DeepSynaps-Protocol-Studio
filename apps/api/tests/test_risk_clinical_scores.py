"""Contract tests for the unified clinical decision-support scores.

These tests target ``app.services.risk_clinical_scores`` and the
``ScoreResponse`` schema in ``packages/evidence``. They run pure
Python — no DB, no FastAPI client — so they pass even when heavy
dependencies are unavailable.

The tests enforce:
* every score returns the required ``ScoreResponse`` fields
* confidence is always in {low, med, high, no_data}
* ``top_contributors`` length >= 1 when score has a value
* ``cautions[]`` is present (and non-empty) when input quality is low
* high confidence is REFUSED when a validated assessment is missing
* range validation: similarity scores in [0, 1]; brain_age guard for
  out-of-range; research_grade scores cannot exceed med
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make the evidence package + apps/api importable without an editable install.
REPO_ROOT = Path(__file__).resolve().parents[3]
for p in (
    REPO_ROOT / "packages" / "evidence" / "src",
    REPO_ROOT / "apps" / "api",
):
    sys.path.insert(0, str(p))

from app.services.risk_clinical_scores import (  # noqa: E402
    SCORE_IDS,
    build_adherence_risk_score,
    build_all_clinical_scores,
    build_anxiety_score,
    build_brain_age_score,
    build_depression_score,
    build_mci_score,
    build_relapse_risk_score,
    build_response_probability_score,
    build_stress_score,
)
from deepsynaps_evidence.score_response import (  # noqa: E402
    ScoreResponse,
    cap_confidence,
    hash_inputs,
)


VALID_CONFIDENCE = {"low", "med", "high", "no_data"}
REQUIRED_FIELDS = {
    "score_id",
    "value",
    "scale",
    "interpretation",
    "confidence",
    "uncertainty_band",
    "top_contributors",
    "assessment_anchor",
    "evidence_refs",
    "cautions",
    "method_provenance",
    "computed_at",
}


# ── Helper fixtures ──────────────────────────────────────────────────────────


def _gad7(score: int = 12) -> dict:
    return {"template_id": "gad7", "score_numeric": score, "score": score}


def _phq9(score: int = 14, item9: int = 0) -> dict:
    return {
        "template_id": "phq9",
        "score_numeric": score,
        "score": score,
        "items": {"phq9_9": item9},
    }


def _moca(score: int = 22) -> dict:
    return {"template_id": "moca", "score_numeric": score, "score": score}


def _qeeg_payload() -> dict:
    return {
        "anxiety_like": {
            "score": 0.42,
            "ci95": [0.34, 0.50],
            "drivers": [{"feature": "posterior_alpha", "value": 1.6, "direction": "higher_when_elevated"}],
            "calibration": "uncalibrated_stub",
        },
        "mdd_like": {
            "score": 0.55,
            "ci95": [0.47, 0.63],
            "drivers": [{"feature": "frontal_alpha_asymmetry", "value": 0.22, "direction": "higher_when_elevated"}],
            "calibration": "uncalibrated_stub",
        },
        "cognitive_decline_like": {
            "score": 0.31,
            "ci95": [0.23, 0.39],
            "drivers": [{"feature": "peak_alpha_frequency", "value": 8.4, "direction": "higher_when_reduced"}],
            "calibration": "uncalibrated_stub",
        },
        "calibration": {"status": "not_clinic_calibrated"},
        "disclaimer": "research/wellness",
    }


def _brain_age_payload(predicted: float = 45.0, chrono: int = 40, is_stub: bool = False) -> dict:
    return {
        "predicted_years": predicted,
        "chronological_years": chrono,
        "gap_years": predicted - chrono,
        "gap_percentile": 60.0,
        "confidence": "high",
        "electrode_importance": {"Fz": 0.5, "Cz": 0.3, "Pz": 0.2},
        "is_stub": is_stub,
    }


# ── Generic contract assertions ──────────────────────────────────────────────


def _assert_contract(score: ScoreResponse, score_id: str) -> None:
    assert isinstance(score, ScoreResponse), f"{score_id} did not return ScoreResponse"
    payload = score.model_dump()
    missing = REQUIRED_FIELDS - set(payload.keys())
    assert not missing, f"{score_id} missing fields: {missing}"
    assert score.score_id == score_id
    assert score.confidence in VALID_CONFIDENCE
    assert score.method_provenance.model_id
    assert score.method_provenance.inputs_hash
    # Cautions is always a list
    assert isinstance(score.cautions, list)


def test_all_scores_contract_minimal_inputs():
    """Every score returns the unified contract even with empty inputs."""
    out = build_all_clinical_scores(
        assessments=[],
        qeeg_risk_payload=None,
        brain_age_payload=None,
        wearable_summary=None,
        trajectory_change_scores=None,
        adverse_event_count=0,
        adherence_summary=None,
        chronological_age=None,
    )
    assert set(out.keys()) == set(SCORE_IDS)
    for sid, score in out.items():
        _assert_contract(score, sid)


# ── Anxiety / Depression: validated anchors ──────────────────────────────────


def test_anxiety_with_gad7_anchors_to_validated_assessment():
    score = build_anxiety_score(
        assessments=[_gad7(score=14)],
        qeeg_risk_payload=_qeeg_payload(),
    )
    _assert_contract(score, "anxiety")
    assert score.assessment_anchor == "GAD-7"
    assert score.scale == "raw_assessment"
    assert score.value == 14
    # PROM-anchored → can reach high
    assert score.confidence == "high"
    assert len(score.top_contributors) >= 1


def test_anxiety_without_prom_falls_back_to_biomarker_capped_med():
    score = build_anxiety_score(
        assessments=[],
        qeeg_risk_payload=_qeeg_payload(),
    )
    _assert_contract(score, "anxiety")
    assert score.assessment_anchor is None
    assert score.scale == "similarity_index"
    assert score.value is not None and 0.0 <= score.value <= 1.0
    # Refuse high without validated anchor
    assert score.confidence in {"low", "med"}
    assert any(c.code == "missing-validated-anchor" for c in score.cautions)


def test_depression_phq9_item9_emits_safety_caution():
    score = build_depression_score(
        assessments=[_phq9(score=18, item9=2)],
        qeeg_risk_payload=_qeeg_payload(),
    )
    _assert_contract(score, "depression")
    assert score.assessment_anchor == "PHQ-9"
    codes = {c.code for c in score.cautions}
    assert "phq9-item9-positive" in codes
    blocking = [c for c in score.cautions if c.severity == "block"]
    assert blocking, "PHQ-9 item9 >=2 must surface a blocking caution"


def test_anxiety_score_no_inputs_returns_no_data():
    score = build_anxiety_score(assessments=[], qeeg_risk_payload=None)
    _assert_contract(score, "anxiety")
    assert score.confidence == "no_data"
    assert score.value is None
    assert score.cautions  # at least the missing-inputs notice


# ── MCI ──────────────────────────────────────────────────────────────────────


def test_mci_with_moca_anchors():
    score = build_mci_score(
        assessments=[_moca(score=22)],
        qeeg_risk_payload=_qeeg_payload(),
        chronological_age=70,
    )
    _assert_contract(score, "mci")
    assert score.assessment_anchor == "MoCA"
    assert score.value == 22


def test_mci_young_age_emits_ood_warning():
    score = build_mci_score(
        assessments=[],
        qeeg_risk_payload=_qeeg_payload(),
        chronological_age=25,
    )
    _assert_contract(score, "mci")
    codes = {c.code for c in score.cautions}
    assert "out-of-distribution-age" in codes


# ── Brain-age ────────────────────────────────────────────────────────────────


def test_brain_age_consumes_payload_and_validates_range():
    score = build_brain_age_score(brain_age_payload=_brain_age_payload(predicted=45.0, chrono=40))
    _assert_contract(score, "brain_age")
    assert score.value == 45.0
    assert score.scale == "years"
    assert score.confidence in {"low", "med", "high"}
    # Brain-age has no PROM anchor → confidence cannot exceed med
    assert score.confidence != "high"


def test_brain_age_out_of_range_warns():
    score = build_brain_age_score(brain_age_payload=_brain_age_payload(predicted=120.0, chrono=40))
    _assert_contract(score, "brain_age")
    codes = {c.code for c in score.cautions}
    assert "out-of-range-brain-age" in codes


def test_brain_age_stub_flag_surfaces_caution():
    score = build_brain_age_score(brain_age_payload=_brain_age_payload(is_stub=True))
    _assert_contract(score, "brain_age")
    codes = {c.code for c in score.cautions}
    assert "stub-model-fallback" in codes
    assert score.method_provenance.upstream_is_stub is True


def test_brain_age_missing_payload_returns_no_data():
    score = build_brain_age_score(brain_age_payload=None)
    _assert_contract(score, "brain_age")
    assert score.confidence == "no_data"
    assert score.value is None


# ── Stress ───────────────────────────────────────────────────────────────────


def test_stress_without_pss_marked_research_grade():
    score = build_stress_score(
        assessments=[],
        wearable_summary={"mood_score": 4, "anxiety_score": 7, "hrv_ms": 35, "sleep_hours": 5.5},
    )
    _assert_contract(score, "stress")
    assert score.assessment_anchor is None
    assert score.scale == "research_grade"
    codes = {c.code for c in score.cautions}
    assert "research-grade-score" in codes
    assert "missing-validated-anchor" in codes
    assert score.confidence in {"low", "med"}  # research-grade ceiling
    assert 0.0 <= (score.value or 0.0) <= 1.0


def test_stress_no_inputs_no_data():
    score = build_stress_score(assessments=[], wearable_summary=None)
    _assert_contract(score, "stress")
    assert score.confidence == "no_data"


# ── Relapse ──────────────────────────────────────────────────────────────────


def test_relapse_research_grade_capped_med():
    trajectory = {
        "alpha_power_F3": {"baseline": 10.0, "current": 14.0, "delta": 4.0, "rci": 1.5, "p_value": 0.04, "n": 5, "significant": True},
        "theta_beta_ratio": {"baseline": 2.1, "current": 2.7, "delta": 0.6, "rci": 0.8, "p_value": 0.18, "n": 5, "significant": False},
    }
    score = build_relapse_risk_score(trajectory_change_scores=trajectory, adverse_event_count=2)
    _assert_contract(score, "relapse_risk")
    assert score.scale == "research_grade"
    assert score.confidence in {"low", "med"}  # ceiling
    assert score.assessment_anchor is None
    assert score.value is not None and 0.0 <= score.value <= 1.0
    codes = {c.code for c in score.cautions}
    assert "research-grade-score" in codes
    assert len(score.top_contributors) >= 1


def test_relapse_no_inputs_returns_no_data():
    score = build_relapse_risk_score(trajectory_change_scores=None, adverse_event_count=0)
    _assert_contract(score, "relapse_risk")
    assert score.confidence == "no_data"


# ── Adherence ────────────────────────────────────────────────────────────────


def test_adherence_high_risk_when_low_rate_and_open_flags():
    score = build_adherence_risk_score(
        adherence_summary={
            "sessions_logged": 10,
            "sessions_expected": 30,
            "adherence_rate_pct": 33.3,
            "open_flags": 2,
            "side_effect_count": 4,
        }
    )
    _assert_contract(score, "adherence_risk")
    assert score.value is not None and 0.0 <= score.value <= 1.0
    assert score.confidence in {"low", "med"}  # research-grade ceiling
    # Should emit research-grade caution
    assert any(c.code == "research-grade-score" for c in score.cautions)


def test_adherence_missing_planned_sessions_warns():
    score = build_adherence_risk_score(
        adherence_summary={
            "sessions_logged": 5,
            "sessions_expected": None,
            "adherence_rate_pct": None,
            "open_flags": 0,
            "side_effect_count": 0,
        }
    )
    _assert_contract(score, "adherence_risk")
    codes = {c.code for c in score.cautions}
    assert "missing-planned-sessions" in codes


# ── Response probability ─────────────────────────────────────────────────────


def test_response_probability_research_grade_and_capped():
    score = build_response_probability_score(
        qeeg_risk_payload=_qeeg_payload(),
        primary_target="depression",
    )
    _assert_contract(score, "response_probability")
    assert score.scale == "research_grade"
    assert score.value is not None and 0.0 <= score.value <= 1.0
    assert score.confidence in {"low", "med"}  # ceiling
    codes = {c.code for c in score.cautions}
    assert "research-grade-score" in codes
    assert "evidence-pending" in codes


def test_response_probability_no_payload_no_data():
    score = build_response_probability_score(qeeg_risk_payload=None)
    _assert_contract(score, "response_probability")
    assert score.confidence == "no_data"


# ── Confidence policy ────────────────────────────────────────────────────────


def test_cap_confidence_research_grade_caps_at_med():
    assert cap_confidence("high", has_validated_anchor=True, research_grade=True) == "med"
    assert cap_confidence("high", has_validated_anchor=False, research_grade=False) == "med"
    assert cap_confidence("high", has_validated_anchor=True, research_grade=False) == "high"
    assert cap_confidence("low", has_validated_anchor=False, research_grade=True) == "low"


def test_hash_inputs_deterministic():
    a = hash_inputs({"x": 1, "y": [1, 2, 3]})
    b = hash_inputs({"y": [1, 2, 3], "x": 1})
    assert a == b
    c = hash_inputs({"x": 2, "y": [1, 2, 3]})
    assert a != c


# ── Probabilities & range validation ─────────────────────────────────────────


def test_similarity_indexed_scores_stay_in_unit_interval():
    payload = _qeeg_payload()
    out = build_all_clinical_scores(
        assessments=[],
        qeeg_risk_payload=payload,
        brain_age_payload=None,
        wearable_summary=None,
        trajectory_change_scores=None,
        adherence_summary=None,
    )
    for sid in ("anxiety", "depression", "mci"):
        s = out[sid]
        if s.value is not None and s.scale == "similarity_index":
            assert 0.0 <= s.value <= 1.0


def test_top_contributors_when_score_has_value():
    score = build_depression_score(
        assessments=[_phq9(score=14, item9=0)],
        qeeg_risk_payload=_qeeg_payload(),
    )
    assert score.value is not None
    assert len(score.top_contributors) >= 1


def test_low_input_quality_produces_cautions():
    """When key inputs are missing, the score must surface at least one caution."""
    s = build_anxiety_score(assessments=[], qeeg_risk_payload=None)
    assert len(s.cautions) >= 1
    s2 = build_brain_age_score(brain_age_payload=None)
    assert len(s2.cautions) >= 1


def test_uncertainty_band_validator_rejects_inverted_bounds():
    from deepsynaps_evidence.score_response import (
        MethodProvenance,
        ScoreResponse,
        hash_inputs,
    )

    with pytest.raises(Exception):
        ScoreResponse(
            score_id="anxiety",
            value=0.5,
            scale="similarity_index",
            interpretation="x",
            confidence="low",
            uncertainty_band=(0.8, 0.2),  # inverted
            top_contributors=[],
            method_provenance=MethodProvenance(
                model_id="x", version="v1", inputs_hash=hash_inputs({}),
            ),
        )
