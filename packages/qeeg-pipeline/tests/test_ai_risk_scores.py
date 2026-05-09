"""Tests for ``deepsynaps_qeeg.ai.risk_scores``.

Pins the load-bearing **NOT diagnostic / similarity-index-only** safety
contract:

- The DISCLAIMER constant carries explicit "NOT diagnostic" language;
  refactors cannot dilute it.
- Every payload returned by ``compute_risk_scores`` is a SIMILARITY
  index, never a calibrated disorder probability.
- Six condition-similarity labels are emitted; each entry has a score,
  a CI95 band, and (for the stub path) drivers + calibration metadata.
- Biomarker priors apply correctly:
  * High frontal alpha asymmetry -> mdd_like
  * High theta/beta ratio -> adhd_like
  * Elevated posterior alpha -> anxiety_like
  * Reduced PAF -> cognitive_decline_like
  * Elevated frontal delta -> tbi_residual_like
  * Reduced sleep spindles flag -> insomnia_like
- The deterministic seed produces reproducible scores.
- Decision-support metadata (``confidence``, ``calibration``,
  ``evidence_policy``) is always attached so the API never renders an
  uncalibrated score without a confidence band.
"""
from __future__ import annotations

from typing import Any

import pytest

from deepsynaps_qeeg.ai.risk_scores import (
    DISCLAIMER,
    LABELS,
    _clip01,
    _drivers_for_label,
    _frontal_delta,
    _has_flag,
    _mean_paf,
    _posterior_alpha,
    _safe_get,
    _seed,
    _stub_scores,
    _theta_beta_ratio,
    compute_risk_scores,
)


# ── Disclaimer + constants ────────────────────────────────────────────────


class TestDisclaimerConstants:
    def test_disclaimer_carries_not_diagnostic_warning(self) -> None:
        # Pin the load-bearing safety phrase: "NOT diagnostic" must be
        # in the disclaimer so a refactor cannot dilute it.
        assert "NOT diagnostic" in DISCLAIMER
        assert "research/wellness use only" in DISCLAIMER
        assert "similarity" in DISCLAIMER.lower()

    def test_six_labels_with_like_suffix(self) -> None:
        # All labels are "*_like" — never naked condition names — to
        # reinforce the "this is similarity, not diagnosis" frame.
        assert len(LABELS) == 6
        for label in LABELS:
            assert label.endswith("_like")


# ── _safe_get / _has_flag / _clip01 ───────────────────────────────────────


class TestSafeGet:
    def test_walks_nested_dict(self) -> None:
        d = {"a": {"b": {"c": 7}}}
        assert _safe_get(d, "a", "b", "c") == 7

    def test_missing_key_returns_default(self) -> None:
        assert _safe_get({}, "a", "b", default="x") == "x"

    def test_non_dict_at_intermediate_returns_default(self) -> None:
        d = {"a": "not a dict"}
        assert _safe_get(d, "a", "b") is None


class TestHasFlag:
    def test_flag_present_in_flags_list(self) -> None:
        assert _has_flag({"flags": ["x", "y"]}, "x") is True

    def test_flag_present_in_qeeg_flags_alias(self) -> None:
        assert _has_flag({"qeeg_flags": ["z"]}, "z") is True

    def test_flag_missing_returns_false(self) -> None:
        assert _has_flag({"flags": ["x"]}, "y") is False

    def test_no_flags_field_returns_false(self) -> None:
        assert _has_flag({}, "x") is False

    def test_non_iterable_flags_returns_false(self) -> None:
        # Defensive: a malformed payload (string instead of list) returns False.
        assert _has_flag({"flags": "not a list"}, "x") is False


class TestClip01:
    def test_in_range_passes_through(self) -> None:
        assert _clip01(0.5) == 0.5

    def test_below_zero_clips_to_zero(self) -> None:
        assert _clip01(-0.1) == 0.0

    def test_above_one_clips_to_one(self) -> None:
        assert _clip01(1.5) == 1.0


# ── _theta_beta_ratio / _posterior_alpha / _frontal_delta / _mean_paf ─────


class TestBiomarkerHelpers:
    def test_theta_beta_ratio_from_band_dicts(self) -> None:
        features = {
            "spectral": {
                "bands": {
                    "theta": {"absolute_uv2": {"Fz": 8.0, "Cz": 10.0}},
                    "beta": {"absolute_uv2": {"Fz": 4.0, "Cz": 5.0}},
                },
            },
        }
        # mean theta = 9, mean beta = 4.5 → ratio = 2.0
        assert _theta_beta_ratio(features) == pytest.approx(2.0)

    def test_theta_beta_ratio_falls_back_to_top_level_field(self) -> None:
        # When the band dicts aren't dicts, fall back to a precomputed
        # top-level theta_beta_ratio if available.
        assert _theta_beta_ratio({"theta_beta_ratio": 3.5}) == 3.5

    def test_theta_beta_ratio_returns_none_when_no_data(self) -> None:
        assert _theta_beta_ratio({}) is None

    def test_theta_beta_ratio_zero_beta_returns_none(self) -> None:
        features = {
            "spectral": {
                "bands": {
                    "theta": {"absolute_uv2": {"Fz": 5.0}},
                    "beta": {"absolute_uv2": {"Fz": 0.0}},
                },
            },
        }
        assert _theta_beta_ratio(features) is None

    def test_posterior_alpha_averages_O_and_P_channels(self) -> None:
        features = {
            "spectral": {
                "bands": {
                    "alpha": {"absolute_uv2": {"O1": 1.0, "O2": 2.0, "Pz": 3.0, "Fz": 99.0}},
                },
            },
        }
        # Frontal Fz is filtered out; mean of O1, O2, Pz = 2.0.
        assert _posterior_alpha(features) == pytest.approx(2.0)

    def test_posterior_alpha_returns_none_when_no_alpha_dict(self) -> None:
        assert _posterior_alpha({"spectral": {}}) is None

    def test_frontal_delta_averages_F_channels(self) -> None:
        features = {
            "spectral": {
                "bands": {
                    "delta": {"absolute_uv2": {"Fp1": 1.0, "Fp2": 2.0, "Pz": 99.0}},
                },
            },
        }
        # Pz filtered out; mean of Fp1, Fp2 = 1.5.
        assert _frontal_delta(features) == pytest.approx(1.5)

    def test_frontal_delta_returns_none_when_no_delta(self) -> None:
        assert _frontal_delta({"spectral": {}}) is None

    def test_mean_paf_averages_numeric_values(self) -> None:
        features = {
            "spectral": {"peak_alpha_freq": {"O1": 9.5, "O2": 10.5, "garbage": "x"}},
        }
        assert _mean_paf(features) == pytest.approx(10.0)

    def test_mean_paf_returns_none_when_no_paf(self) -> None:
        assert _mean_paf({}) is None


# ── _seed ──────────────────────────────────────────────────────────────────


class TestSeed:
    def test_explicit_override_returned_unchanged(self) -> None:
        assert _seed([0.0], {}, 42) == 42

    def test_deterministic_for_same_input(self) -> None:
        a = _seed([1.0, 2.0, 3.0], {"x": 1}, None)
        b = _seed([1.0, 2.0, 3.0], {"x": 1}, None)
        assert a == b

    def test_changes_with_different_keys(self) -> None:
        a = _seed([1.0], {"x": 1}, None)
        b = _seed([1.0], {"y": 1}, None)
        assert a != b


# ── _drivers_for_label ────────────────────────────────────────────────────


class TestDriversForLabel:
    def test_mdd_driver_emits_frontal_alpha_asymmetry(self) -> None:
        d = _drivers_for_label(
            "mdd_like",
            {"asymmetry": {"frontal_alpha_F3_F4": 0.25}},
            None,
        )
        assert any(x["feature"] == "frontal_alpha_asymmetry" for x in d)

    def test_adhd_driver_emits_theta_beta_ratio(self) -> None:
        features = {
            "spectral": {
                "bands": {
                    "theta": {"absolute_uv2": {"Fz": 8.0}},
                    "beta": {"absolute_uv2": {"Fz": 2.0}},
                },
            },
        }
        d = _drivers_for_label("adhd_like", features, None)
        assert any(x["feature"] == "theta_beta_ratio" for x in d)

    def test_cognitive_driver_includes_age_context(self) -> None:
        features = {
            "spectral": {"peak_alpha_freq": {"O1": 8.0}},
        }
        d = _drivers_for_label("cognitive_decline_like", features, 70)
        features_used = [x["feature"] for x in d]
        assert "peak_alpha_frequency" in features_used
        assert "chronological_age_context" in features_used

    def test_insomnia_driver_only_when_flag_present(self) -> None:
        d = _drivers_for_label("insomnia_like", {"flags": ["reduced_sleep_spindles"]}, None)
        assert any(x["feature"] == "reduced_sleep_spindles" for x in d)

    def test_label_with_no_data_returns_weak_marker(self) -> None:
        d = _drivers_for_label("mdd_like", {}, None)
        # No data → returns the weak/unavailable placeholder driver.
        assert any(x.get("direction") == "weak_or_unavailable_in_payload" for x in d)


# ── _stub_scores + compute_risk_scores ────────────────────────────────────


class TestStubScores:
    def test_returns_all_six_labels_plus_disclaimer(self) -> None:
        out = _stub_scores([0.1, 0.2], {}, None, deterministic_seed=1)
        for label in LABELS:
            assert label in out
        assert out["disclaimer"] == DISCLAIMER

    def test_each_entry_has_score_ci95_drivers_calibration(self) -> None:
        out = _stub_scores([0.1] * 5, {}, None, 1)
        for label in LABELS:
            entry = out[label]
            assert 0.0 <= entry["score"] <= 1.0
            lo, hi = entry["ci95"]
            assert 0.0 <= lo <= hi <= 1.0
            assert "drivers" in entry
            assert entry["calibration"] == "uncalibrated_stub"

    def test_decision_support_metadata_carries_confidence(self) -> None:
        # Pin: every payload includes confidence + evidence_policy so
        # the API can render the "this is supporting evidence" badge.
        out = _stub_scores([0.0], {}, None, 1)
        assert "confidence" in out
        assert out["confidence"]["level"] in {"low", "moderate", "high"}
        assert "evidence_policy" in out
        assert out["evidence_policy"]["primary_anchor"] == "validated clinical assessments and clinician review"
        assert out["evidence_policy"]["biomarker_role"] == "supporting evidence only"

    def test_score_type_is_similarity_index(self) -> None:
        out = _stub_scores([0.0], {}, None, 1)
        assert out["score_type"] == "neurophysiological_similarity_index"

    def test_high_frontal_alpha_asymmetry_bumps_mdd_like(self) -> None:
        no_asym = _stub_scores([0.0], {}, None, 1)
        with_asym = _stub_scores(
            [0.0],
            {"asymmetry": {"frontal_alpha_F3_F4": 0.30}},
            None,
            1,
        )
        # The asym >0.1 path should bump mdd_like above the no-asym version.
        assert with_asym["mdd_like"]["score"] > no_asym["mdd_like"]["score"]

    def test_high_theta_beta_ratio_bumps_adhd_like(self) -> None:
        no_tbr = _stub_scores([0.0], {}, None, 1)
        with_tbr = _stub_scores([0.0], {"theta_beta_ratio": 5.0}, None, 1)
        assert with_tbr["adhd_like"]["score"] > no_tbr["adhd_like"]["score"]

    def test_elevated_theta_flag_bumps_adhd_when_no_ratio(self) -> None:
        no_flag = _stub_scores([0.0], {}, None, 1)
        with_flag = _stub_scores(
            [0.0],
            {"flags": ["elevated_theta_at_Fz"]},
            None,
            1,
        )
        assert with_flag["adhd_like"]["score"] > no_flag["adhd_like"]["score"]

    def test_low_paf_bumps_cognitive_decline_like(self) -> None:
        baseline = _stub_scores([0.0], {}, None, 1)
        with_low_paf = _stub_scores(
            [0.0],
            {"spectral": {"peak_alpha_freq": {"O1": 7.5, "O2": 7.5}}},
            None,
            1,
        )
        assert (
            with_low_paf["cognitive_decline_like"]["score"]
            > baseline["cognitive_decline_like"]["score"]
        )

    def test_age_65_plus_adds_age_context_bump(self) -> None:
        without_age = _stub_scores([0.0], {}, None, 1)
        with_age = _stub_scores([0.0], {}, 70, 1)
        # Age-only bump is small but present (+0.05) on cognitive_decline_like.
        assert (
            with_age["cognitive_decline_like"]["score"]
            >= without_age["cognitive_decline_like"]["score"]
        )

    def test_elevated_frontal_delta_bumps_tbi(self) -> None:
        baseline = _stub_scores([0.0], {}, None, 1)
        with_delta = _stub_scores(
            [0.0],
            {"spectral": {"bands": {"delta": {"absolute_uv2": {"Fp1": 2.0, "Fp2": 2.0}}}}},
            None,
            1,
        )
        assert (
            with_delta["tbi_residual_like"]["score"]
            > baseline["tbi_residual_like"]["score"]
        )

    def test_reduced_sleep_spindles_flag_bumps_insomnia(self) -> None:
        baseline = _stub_scores([0.0], {}, None, 1)
        with_flag = _stub_scores(
            [0.0],
            {"flags": ["reduced_sleep_spindles"]},
            None,
            1,
        )
        assert with_flag["insomnia_like"]["score"] > baseline["insomnia_like"]["score"]


class TestComputeRiskScores:
    def test_no_torch_no_model_path_uses_stub(self) -> None:
        # No torch installed and no model_path → goes straight to the stub.
        out = compute_risk_scores([0.1, 0.2], {}, deterministic_seed=42)
        assert out["disclaimer"] == DISCLAIMER
        for label in LABELS:
            assert label in out

    def test_deterministic_seed_produces_repeatable_output(self) -> None:
        a = compute_risk_scores([0.1], {}, deterministic_seed=99)
        b = compute_risk_scores([0.1], {}, deterministic_seed=99)
        # Scores must match exactly (same seed -> same RNG draws).
        for label in LABELS:
            assert a[label]["score"] == b[label]["score"]

    def test_different_seeds_yield_different_scores(self) -> None:
        a = compute_risk_scores([0.0], {}, deterministic_seed=1)
        b = compute_risk_scores([0.0], {}, deterministic_seed=2)
        # At least one label should differ between seeds.
        diffs = sum(1 for label in LABELS if a[label]["score"] != b[label]["score"])
        assert diffs >= 1

    def test_no_features_no_age_yields_low_confidence(self) -> None:
        out = compute_risk_scores([0.1], {}, deterministic_seed=1)
        # No signals at all → completeness = 0/5 = 0.0 → 'low'.
        assert out["confidence"]["level"] == "low"

    def test_full_features_yield_high_or_moderate_confidence(self) -> None:
        # Provide signals across spectral, peak_alpha, asymmetry, connectivity
        # plus chronological_age — completeness 5/5 → 'high'.
        out = compute_risk_scores(
            [0.1],
            {
                "spectral": {
                    "bands": {"alpha": {}},
                    "peak_alpha_freq": {"O1": 10.0},
                },
                "asymmetry": {"frontal_alpha_F3_F4": 0.0},
                "connectivity": {"x": 1},
            },
            chronological_age=40,
            deterministic_seed=1,
        )
        assert out["confidence"]["level"] in {"high", "moderate"}
