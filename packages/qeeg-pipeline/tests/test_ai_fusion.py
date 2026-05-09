"""Tests for ``deepsynaps_qeeg.ai.fusion``.

Pins the multi-modal qEEG + MRI fusion summary contract:

- ``synthesize_fusion_recommendation`` always returns a complete
  envelope (patient_id, recommendations, summary, confidence,
  confidence_disclaimer, modality_agreement, limitations,
  missing_modalities) so the API never has to defensively patch.
- ``confidence_grade`` is hard-pinned to "heuristic" — the safety
  contract that this score is NOT evidence-graded clinical validation.
- ``confidence_disclaimer`` always present + reminds clinicians to
  review.
- Fusion handles single-modality (qEEG only or MRI only) gracefully:
  surfaces the missing modality and tags the confidence appropriately.
- Top qEEG / MRI signal extractors handle malformed input (None, str,
  int, garbage shapes) without raising.
"""
from __future__ import annotations

from datetime import datetime

import pytest

from deepsynaps_qeeg.ai.fusion import (
    _build_recommendations,
    _clamp,
    _pick_top_mri_signals,
    _pick_top_qeeg_signals,
    _safe_float,
    synthesize_fusion_recommendation,
)


# ── _clamp + _safe_float ──────────────────────────────────────────────────


class TestClamp:
    def test_clamp_within_range(self) -> None:
        assert _clamp(0.5) == 0.5

    def test_clamp_below_low(self) -> None:
        assert _clamp(-0.1) == 0.0

    def test_clamp_above_high(self) -> None:
        assert _clamp(1.5) == 1.0

    def test_custom_range(self) -> None:
        assert _clamp(7.0, low=0.0, high=5.0) == 5.0


class TestSafeFloat:
    def test_none_returns_none(self) -> None:
        assert _safe_float(None) is None

    def test_string_number(self) -> None:
        assert _safe_float("3.14") == pytest.approx(3.14)

    def test_invalid_string_returns_none(self) -> None:
        assert _safe_float("garbage") is None

    def test_int(self) -> None:
        assert _safe_float(7) == 7.0


# ── _pick_top_qeeg_signals ─────────────────────────────────────────────────


class TestPickTopQeegSignals:
    def test_none_returns_empty(self) -> None:
        assert _pick_top_qeeg_signals(None) == []

    def test_non_dict_returns_empty(self) -> None:
        assert _pick_top_qeeg_signals("garbage") == []  # type: ignore[arg-type]

    def test_risk_scores_extracted_with_pct_format(self) -> None:
        out = _pick_top_qeeg_signals(
            {
                "risk_scores": {
                    "adhd_like": {"score": 0.78},
                    "mdd_like": {"score": 0.65},
                    "disclaimer": "ignore me",  # special key skipped
                },
            }
        )
        assert any("78%" in s for s in out)
        assert any("adhd like" in s for s in out)
        # The 'disclaimer' key is filtered out.
        assert not any("disclaimer" in s for s in out)

    def test_capped_at_three_signals(self) -> None:
        out = _pick_top_qeeg_signals(
            {
                "risk_scores": {
                    "a": {"score": 0.9},
                    "b": {"score": 0.85},
                    "c": {"score": 0.8},
                },
                "flagged_conditions": ["adhd", "anxiety", "depression"],
            }
        )
        # Output capped at 3 even though there are 5+ candidates.
        assert len(out) <= 3

    def test_protocol_recommendation_signal(self) -> None:
        out = _pick_top_qeeg_signals(
            {
                "protocol_recommendation": {
                    "primary_modality": "rTMS",
                    "target_region": "L-DLPFC",
                },
            }
        )
        assert any("rTMS" in s and "L-DLPFC" in s for s in out)

    def test_brain_age_gap_direction(self) -> None:
        # Positive gap → "older", negative → "younger".
        older = _pick_top_qeeg_signals({"brain_age": {"gap_years": 4.5}})
        younger = _pick_top_qeeg_signals({"brain_age": {"gap_years": -3.2}})
        assert any("older" in s for s in older)
        assert any("younger" in s for s in younger)

    def test_skips_invalid_score_payload(self) -> None:
        out = _pick_top_qeeg_signals(
            {
                "risk_scores": {
                    "good": {"score": 0.9},
                    "bad": "not a dict",
                    "missing_score": {"label": "x"},
                },
            }
        )
        assert any("good" in s for s in out)


# ── _pick_top_mri_signals ──────────────────────────────────────────────────


class TestPickTopMriSignals:
    def test_none_returns_empty(self) -> None:
        assert _pick_top_mri_signals(None) == []

    def test_stim_targets_extracted_with_modality_and_confidence(self) -> None:
        out = _pick_top_mri_signals(
            {
                "stim_targets": [
                    {
                        "region_name": "L-DLPFC",
                        "modality": "rtms",
                        "confidence": "high",
                    },
                ],
            }
        )
        assert any("L-DLPFC" in s and "rtms" in s and "high" in s for s in out)

    def test_functional_anticorrelation_signal(self) -> None:
        out = _pick_top_mri_signals(
            {
                "functional": {
                    "sgACC_DLPFC_anticorrelation": {"z": -2.5},
                },
            }
        )
        assert any("sgACC-DLPFC anticorrelation" in s for s in out)

    def test_structural_brain_age_gap_signal(self) -> None:
        out = _pick_top_mri_signals(
            {
                "structural": {
                    "brain_age": {"brain_age_gap_years": 5.0},
                },
            }
        )
        assert any("brain-age gap" in s for s in out)

    def test_qc_failed_warning(self) -> None:
        out = _pick_top_mri_signals({"qc": {"passed": False}})
        assert any("QC did not fully pass" in s for s in out)


# ── _build_recommendations ─────────────────────────────────────────────────


class TestBuildRecommendations:
    def test_combined_qeeg_protocol_plus_mri_target(self) -> None:
        out = _build_recommendations(
            "P-1",
            qeeg={"protocol_recommendation": {"primary_modality": "rTMS"}},
            mri={"stim_targets": [{"region_name": "L-DLPFC"}]},
        )
        assert any("Combine" in r for r in out)

    def test_qeeg_only_with_target(self) -> None:
        out = _build_recommendations(
            "P-1",
            qeeg={
                "protocol_recommendation": {
                    "primary_modality": "rTMS",
                    "target_region": "L-DLPFC",
                },
            },
            mri=None,
        )
        assert any("Proceed with the qEEG" in r for r in out)
        assert any("L-DLPFC" in r for r in out)

    def test_qeeg_only_without_target(self) -> None:
        out = _build_recommendations(
            "P-1",
            qeeg={"protocol_recommendation": {"primary_modality": "tDCS"}},
            mri=None,
        )
        # "verify target selection clinically" branch.
        assert any("verify target selection" in r for r in out)

    def test_mri_only(self) -> None:
        out = _build_recommendations(
            "P-1",
            qeeg=None,
            mri={"stim_targets": [{"region_name": "M1", "modality": "tFUS"}]},
        )
        assert any("MRI targeting" in r for r in out)

    def test_neither_modality_present(self) -> None:
        out = _build_recommendations("P-1", qeeg=None, mri=None)
        assert any("No strong persisted markers" in r for r in out)


# ── synthesize_fusion_recommendation envelope ──────────────────────────────


class TestSynthesizeFusionRecommendation:
    def test_full_envelope_keys(self) -> None:
        out = synthesize_fusion_recommendation(
            patient_id="P-1",
            qeeg_analysis_id="Q1",
            qeeg={"protocol_recommendation": {"primary_modality": "rTMS"}},
            mri_analysis_id="M1",
            mri={"stim_targets": [{"region_name": "L-DLPFC"}]},
        )
        # Pin: every contract field is always present.
        assert set(out.keys()) >= {
            "patient_id",
            "qeeg_analysis_id",
            "mri_analysis_id",
            "recommendations",
            "summary",
            "confidence",
            "confidence_disclaimer",
            "confidence_grade",
            "generated_at",
            "modality_agreement",
            "limitations",
            "missing_modalities",
        }
        # Pin the safety contract.
        assert out["confidence_grade"] == "heuristic"
        assert "not evidence-graded" in out["confidence_disclaimer"]
        # generated_at is an ISO timestamp.
        datetime.fromisoformat(out["generated_at"].replace("Z", "+00:00"))

    def test_no_modalities_yields_summary_and_missing_both(self) -> None:
        out = synthesize_fusion_recommendation(
            patient_id="P-1",
            qeeg_analysis_id=None,
            qeeg=None,
            mri_analysis_id=None,
            mri=None,
        )
        assert out["missing_modalities"] == ["qEEG", "MRI"]
        assert "No completed qEEG or MRI analyses" in out["summary"]
        assert out["modality_agreement"]["status"] == "none_available"

    def test_qeeg_only_marks_mri_missing(self) -> None:
        out = synthesize_fusion_recommendation(
            patient_id="P-1",
            qeeg_analysis_id="Q1",
            qeeg={"risk_scores": {"adhd": {"score": 0.7}}},
            mri_analysis_id=None,
            mri=None,
        )
        assert out["missing_modalities"] == ["MRI"]
        assert out["modality_agreement"]["status"] == "single_modality"
        assert "Add MRI" in out["summary"]

    def test_mri_only_marks_qeeg_missing(self) -> None:
        out = synthesize_fusion_recommendation(
            patient_id="P-1",
            qeeg_analysis_id=None,
            qeeg=None,
            mri_analysis_id="M1",
            mri={"stim_targets": [{"region_name": "L-DLPFC"}]},
        )
        assert out["missing_modalities"] == ["qEEG"]
        assert "Add qEEG" in out["summary"]

    def test_both_modalities_present_marks_multimodal(self) -> None:
        out = synthesize_fusion_recommendation(
            patient_id="P-1",
            qeeg_analysis_id="Q1",
            qeeg={"risk_scores": {"adhd": {"score": 0.9}}},
            mri_analysis_id="M1",
            mri={"stim_targets": [{"region_name": "L-DLPFC"}]},
        )
        assert out["missing_modalities"] == []
        assert out["modality_agreement"]["status"] == "multimodal_available"
        assert "score" in out["modality_agreement"]
        # No "Add X" suggestion in summary when complete.
        assert "Add MRI" not in out["summary"]
        assert "Add qEEG" not in out["summary"]

    def test_low_confidence_emits_below_threshold_caution(self) -> None:
        # Pin: when confidence < 0.5 the limitations array surfaces a
        # threshold caution. With no modalities + no signals, confidence
        # = clamp(0.15) = 0.15 → caution fires.
        out = synthesize_fusion_recommendation(
            patient_id="P-1",
            qeeg_analysis_id=None,
            qeeg=None,
            mri_analysis_id=None,
            mri=None,
        )
        assert any(
            "Confidence is below the preferred threshold" in lim
            for lim in out["limitations"]
        )

    def test_dual_modality_emits_research_support_caution(self) -> None:
        # Pin: when both modalities are present, the research-support
        # caution is the active limitation.
        out = synthesize_fusion_recommendation(
            patient_id="P-1",
            qeeg_analysis_id="Q1",
            qeeg={"risk_scores": {"adhd": {"score": 0.9}}},
            mri_analysis_id="M1",
            mri={"stim_targets": [{"region_name": "L-DLPFC"}]},
        )
        assert any(
            "research-support only" in lim or "clinician judgement" in lim
            for lim in out["limitations"]
        )

    def test_recommendations_capped_at_three(self) -> None:
        out = synthesize_fusion_recommendation(
            patient_id="P-1",
            qeeg_analysis_id="Q1",
            qeeg={"protocol_recommendation": {"primary_modality": "rTMS"}},
            mri_analysis_id="M1",
            mri={"stim_targets": [{"region_name": "L-DLPFC"}]},
        )
        assert len(out["recommendations"]) <= 3
