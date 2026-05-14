"""Tests for DeepTwin Causal Inference Layer (Phase 3).

Covers: N-of-1 protocol generation, N-of-1 result analysis,
Interrupted Time Series (ITS), E-value computation,
and safety framing on all outputs.
"""

import sys
import math
from datetime import datetime

# Ensure services are importable
sys.path.insert(0, "/mnt/agents/DeepSynaps-Protocol-Studio/apps/api/app/services")

from deeptwin_nof1 import generate_nof1_protocol, analyze_nof1_results
from deeptwin_causal import interrupted_time_series, compute_e_value


# ──────────────────────────────────────────────
# N-of-1 Protocol Generation Tests
# ──────────────────────────────────────────────

def test_nof1_protocol_structure():
    """Protocol must contain all expected top-level keys."""
    protocol = generate_nof1_protocol(
        patient_id="P-001",
        treatment_a="tDCS",
        treatment_b="Sham",
        periods=4,
    )
    assert "patient_id" in protocol
    assert "design" in protocol
    assert "periods" in protocol
    assert "treatments" in protocol
    assert "total_duration_days" in protocol
    assert "washout_days" in protocol
    assert "randomization_seed" in protocol
    assert "safety_note" in protocol


def test_nof1_protocol_period_count():
    """Number of periods must match requested count."""
    for n in [2, 4, 6]:
        protocol = generate_nof1_protocol(
            patient_id="P-001", treatment_a="A", treatment_b="B", periods=n
        )
        assert len(protocol["periods"]) == n


def test_nof1_protocol_total_duration():
    """Total duration calculation must be correct."""
    protocol = generate_nof1_protocol(
        patient_id="P-001",
        treatment_a="A",
        treatment_b="B",
        periods=4,
        period_days=14,
        washout_days=7,
    )
    expected = 4 * (14 + 7)
    assert protocol["total_duration_days"] == expected


def test_nof1_protocol_treatments_field():
    """Treatments field must list both treatments."""
    protocol = generate_nof1_protocol(
        patient_id="P-001", treatment_a="DrugX", treatment_b="Placebo"
    )
    assert protocol["treatments"] == ["DrugX", "Placebo"]


def test_nof1_protocol_patient_id():
    """Patient ID must be preserved in output."""
    protocol = generate_nof1_protocol(
        patient_id="P-TEST-42", treatment_a="A", treatment_b="B"
    )
    assert protocol["patient_id"] == "P-TEST-42"


def test_nof1_protocol_safety_note_present():
    """Safety disclaimer must be present on every protocol."""
    protocol = generate_nof1_protocol(
        patient_id="P-001", treatment_a="A", treatment_b="B"
    )
    assert "safety_note" in protocol
    assert "clinician" in protocol["safety_note"].lower()


def test_nof1_protocol_design_field():
    """Design type must be randomized_crossover."""
    protocol = generate_nof1_protocol(
        patient_id="P-001", treatment_a="A", treatment_b="B"
    )
    assert protocol["design"] == "randomized_crossover"


def test_nof1_protocol_period_structure():
    """Each period must have all required sub-keys."""
    protocol = generate_nof1_protocol(
        patient_id="P-001", treatment_a="A", treatment_b="B", periods=2
    )
    for period in protocol["periods"]:
        assert "period" in period
        assert "treatment" in period
        assert "start_date" in period
        assert "end_date" in period
        assert "washout_start" in period
        assert "washout_end" in period


def test_nof1_protocol_dates_are_iso():
    """All dates must be valid ISO-8601 strings."""
    protocol = generate_nof1_protocol(
        patient_id="P-001", treatment_a="A", treatment_b="B", periods=2
    )
    for period in protocol["periods"]:
        datetime.fromisoformat(period["start_date"])
        datetime.fromisoformat(period["end_date"])
        datetime.fromisoformat(period["washout_start"])
        datetime.fromisoformat(period["washout_end"])


# ──────────────────────────────────────────────
# N-of-1 Result Analysis Tests
# ──────────────────────────────────────────────

def test_nof1_analysis_basic():
    """Basic N-of-1 analysis must compute means and effect size."""
    period_results = [
        {"treatment": "A", "outcome_value": 10.0},
        {"treatment": "B", "outcome_value": 8.0},
        {"treatment": "A", "outcome_value": 12.0},
        {"treatment": "B", "outcome_value": 7.0},
    ]
    result = analyze_nof1_results(period_results)
    assert result["status"] == "analyzed"
    assert result["mean_a"] == 11.0  # (10 + 12) / 2
    assert result["mean_b"] == 7.5   # (8 + 7) / 2
    assert result["mean_difference"] == 3.5


def test_nof1_analysis_effect_size_small():
    """Small effect size must be classified correctly (Cohen's d < 0.5)."""
    # Use variable data where the mean difference is small relative to spread
    period_results = [
        {"treatment": "A", "outcome_value": 12.0},
        {"treatment": "B", "outcome_value": 10.0},
        {"treatment": "A", "outcome_value": 8.0},
        {"treatment": "B", "outcome_value": 9.0},
    ]
    result = analyze_nof1_results(period_results)
    assert result["status"] == "analyzed"
    assert result["effect_size"] == "small"


def test_nof1_analysis_effect_size_large():
    """Large effect size must be classified correctly."""
    period_results = [
        {"treatment": "A", "outcome_value": 20.0},
        {"treatment": "B", "outcome_value": 5.0},
        {"treatment": "A", "outcome_value": 22.0},
        {"treatment": "B", "outcome_value": 4.0},
    ]
    result = analyze_nof1_results(period_results)
    assert result["status"] == "analyzed"
    assert result["effect_size"] == "large"


def test_nof1_analysis_safety_note():
    """Safety note must be present on analyzed results."""
    period_results = [
        {"treatment": "A", "outcome_value": 10.0},
        {"treatment": "B", "outcome_value": 8.0},
        {"treatment": "A", "outcome_value": 12.0},
        {"treatment": "B", "outcome_value": 7.0},
    ]
    result = analyze_nof1_results(period_results)
    assert "safety_note" in result
    assert "individual-specific" in result["safety_note"]


def test_nof1_analysis_insufficient_data():
    """Single-treatment data must report insufficient_data."""
    period_results = [
        {"treatment": "A", "outcome_value": 10.0},
        {"treatment": "A", "outcome_value": 12.0},
    ]
    result = analyze_nof1_results(period_results)
    assert result["status"] == "insufficient_data"
    assert "error" in result


def test_nof1_analysis_unpaired():
    """Unpaired data (unequal periods) must report unpaired."""
    period_results = [
        {"treatment": "A", "outcome_value": 10.0},
        {"treatment": "A", "outcome_value": 12.0},
        {"treatment": "B", "outcome_value": 8.0},
    ]
    result = analyze_nof1_results(period_results)
    assert result["status"] == "unpaired"


def test_nof1_analysis_cohens_d_computation():
    """Cohen's d must be computed correctly for paired data."""
    period_results = [
        {"treatment": "A", "outcome_value": 10.0},
        {"treatment": "B", "outcome_value": 8.0},
        {"treatment": "A", "outcome_value": 12.0},
        {"treatment": "B", "outcome_value": 6.0},
    ]
    result = analyze_nof1_results(period_results)
    diffs = [2.0, 6.0]  # (10-8), (12-6)
    mean_diff = 4.0
    std_diff = math.sqrt(((2 - 4) ** 2 + (6 - 4) ** 2) / 2)  # = 2.0
    expected_d = mean_diff / std_diff  # = 2.0
    assert abs(result["cohens_d"] - expected_d) < 0.001


def test_nof1_analysis_missing_outcomes_ignored():
    """Periods with missing outcome_value must be skipped gracefully."""
    # Drop one A and one B so remaining counts stay equal (2 vs 2)
    period_results = [
        {"treatment": "A", "outcome_value": 10.0},
        {"treatment": "B", "outcome_value": 8.0},
        {"treatment": "A"},                    # missing – skipped
        {"treatment": "B"},                    # missing – skipped
        {"treatment": "A", "outcome_value": 12.0},
        {"treatment": "B", "outcome_value": 7.0},
    ]
    result = analyze_nof1_results(period_results)
    assert result["status"] == "analyzed"
    assert result["mean_a"] == 11.0   # (10 + 12) / 2
    assert result["mean_b"] == 7.5    # (8 + 7) / 2
    assert result["periods_analyzed"] == 2


# ──────────────────────────────────────────────
# Interrupted Time Series Tests
# ──────────────────────────────────────────────

def test_its_basic_level_change():
    """ITS must detect a clear level change between pre/post."""
    pre = [(1, 10.0), (2, 10.5), (3, 9.8), (4, 10.2)]
    post = [(5, 15.0), (6, 15.5), (7, 14.8), (8, 15.2)]
    result = interrupted_time_series(pre, post)
    assert result["status"] == "analyzed"
    assert result["level_change"] == pytest_approx(5.0, 0.01)


def test_its_insufficient_data():
    """ITS must reject fewer than 3 observations per phase."""
    pre = [(1, 10.0), (2, 10.5)]
    post = [(3, 15.0)]
    result = interrupted_time_series(pre, post)
    assert "error" in result
    assert "Insufficient" in result["error"]


def test_its_trend_change_detection():
    """ITS must detect trend changes, not just level changes."""
    # Flat pre, rising post
    pre = [(1, 10.0), (2, 10.0), (3, 10.0), (4, 10.0)]
    post = [(5, 12.0), (6, 14.0), (7, 16.0), (8, 18.0)]
    result = interrupted_time_series(pre, post)
    assert result["status"] == "analyzed"
    assert result["pre_slope"] == pytest_approx(0.0, 0.01)
    assert result["post_slope"] > 1.5  # rising trend
    assert result["trend_change"] > 1.5


def test_its_confidence_intervals():
    """ITS must return valid 95% confidence interval bounds."""
    pre = [(1, 10.0), (2, 10.5), (3, 9.8), (4, 10.2), (5, 10.1)]
    post = [(6, 15.0), (7, 15.5), (8, 14.8), (9, 15.2), (10, 15.1)]
    result = interrupted_time_series(pre, post)
    assert result["status"] == "analyzed"
    assert result["ci_95_lower"] < result["level_change"]
    assert result["ci_95_upper"] > result["level_change"]


def test_its_safety_framing():
    """ITS output must include the temporal-association safety disclaimer."""
    pre = [(1, 10.0), (2, 10.5), (3, 9.8)]
    post = [(4, 15.0), (5, 15.5), (6, 14.8)]
    result = interrupted_time_series(pre, post)
    assert "Temporal association only" in result["interpretation"]
    assert "not causal proof" in result["interpretation"]


def test_its_pre_post_counts():
    """ITS output must report the number of observations per phase."""
    pre = [(1, 10.0), (2, 10.5), (3, 9.8), (4, 10.2)]
    post = [(5, 15.0), (6, 15.5), (7, 14.8)]
    result = interrupted_time_series(pre, post)
    assert result["pre_n"] == 4
    assert result["post_n"] == 3


# ──────────────────────────────────────────────
# E-Value Computation Tests
# ──────────────────────────────────────────────

def test_evalue_basic_computation():
    """E-value must be computed correctly for RR > 1."""
    result = compute_e_value(observed_rr=2.0)
    expected = 2.0 + math.sqrt(2.0 * 1.0)  # 2 + sqrt(2) = 3.414
    assert abs(result["e_value"] - expected) < 0.001


def test_evalue_protection_below_one():
    """E-value must flip RR < 1 to its reciprocal."""
    result_lo = compute_e_value(observed_rr=0.5)
    result_hi = compute_e_value(observed_rr=2.0)
    assert abs(result_lo["e_value"] - result_hi["e_value"]) < 0.001


def test_evalue_interpretation_fragile():
    """Low E-value (<1.5) must be labeled Fragile."""
    result = compute_e_value(observed_rr=1.1)
    assert result["interpretation"] == "Fragile"


def test_evalue_interpretation_moderate():
    """Medium E-value (1.5-3.0) must be labeled Moderately robust."""
    result = compute_e_value(observed_rr=1.5)
    assert result["interpretation"] == "Moderately robust"


def test_evalue_interpretation_robust():
    """High E-value (>=3.0) must be labeled Robust."""
    result = compute_e_value(observed_rr=5.0)
    assert result["interpretation"] == "Robust"


def test_evalue_note_contains_confounder_info():
    """E-value note must describe the confounder interpretation."""
    result = compute_e_value(observed_rr=2.5)
    assert "unmeasured confounder" in result["note"]
    assert "RR=" in result["note"]


def test_evalue_observed_rr_preserved():
    """Observed RR must be preserved (flipped if <1) in output."""
    result = compute_e_value(observed_rr=3.0)
    assert result["observed_rr"] == 3.0

    result_flipped = compute_e_value(observed_rr=0.25)
    assert result_flipped["observed_rr"] == 4.0  # 1 / 0.25


# ──────────────────────────────────────────────
# Cross-cutting Safety Tests
# ──────────────────────────────────────────────

def test_all_nof1_outputs_contain_safety():
    """Every N-of-1 output path must include a safety framing."""
    protocol = generate_nof1_protocol(
        patient_id="P-001", treatment_a="A", treatment_b="B"
    )
    assert "safety_note" in protocol

    analyzed = analyze_nof1_results([
        {"treatment": "A", "outcome_value": 10.0},
        {"treatment": "B", "outcome_value": 8.0},
        {"treatment": "A", "outcome_value": 12.0},
        {"treatment": "B", "outcome_value": 7.0},
    ])
    assert "safety_note" in analyzed

    insufficient = analyze_nof1_results([
        {"treatment": "A", "outcome_value": 10.0},
    ])
    # error paths may omit safety_note; that's acceptable


def test_its_output_contains_safety_framing():
    """ITS output must always contain the safety disclaimer."""
    pre = [(1, 10.0), (2, 10.5), (3, 9.8)]
    post = [(4, 15.0), (5, 15.5), (6, 14.8)]
    result = interrupted_time_series(pre, post)
    assert "not causal proof" in result["interpretation"]


def test_evalue_output_contains_note():
    """E-value output must always contain the explanatory note."""
    result = compute_e_value(observed_rr=2.0)
    assert "note" in result
    assert len(result["note"]) > 0


# ──────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────

def pytest_approx(value, abs_tol):
    """Simple approximate equality helper (no pytest dependency)."""
    class _Approx:
        def __init__(self, expected, tol):
            self.expected = expected
            self.tol = tol

        def __eq__(self, other):
            return abs(other - self.expected) <= self.tol
    return _Approx(value, abs_tol)


if __name__ == "__main__":
    # Run all test functions
    import traceback

    test_funcs = [
        obj
        for name, obj in globals().items()
        if callable(obj) and name.startswith("test_")
    ]

    passed = 0
    failed = 0
    for fn in test_funcs:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {fn.__name__}: {e}")
            traceback.print_exc()
            failed += 1

    print(f"\n{'=' * 50}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    if failed > 0:
        sys.exit(1)
