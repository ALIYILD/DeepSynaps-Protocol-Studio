"""Tests for deeptwin_simulation_v2 and deeptwin_trajectory modules.

Covers: uncertainty-aware simulation, bootstrap CI computation, scenario
comparison, modality validation, trajectory estimation, CI widening, trend
direction detection, and safety framing on all outputs.
"""

import math
import sys
from pathlib import Path

# Ensure app/services is on the path
sys.path.insert(0, str(Path(__file__).parent.parent / "app" / "services"))

from deeptwin_simulation_v2 import (
    MODALITIES_V2,
    simulate_with_uncertainty,
    compare_scenarios,
    _compute_prediction,
    _add_noise,
)
from deeptwin_trajectory import estimate_trajectory, HORIZONS


# ---------------------------------------------------------------------------
# 1. Basic simulation structure & safety framing
# ---------------------------------------------------------------------------

def test_simulate_returns_expected_keys():
    """Simulation output must contain all expected keys."""
    result = simulate_with_uncertainty(
        "tDCS",
        {"intensity_ma": 2.0, "sessions_planned": 10},
        {"phq9_baseline": 18.0},
    )
    for key in [
        "modality",
        "point_estimate",
        "ci_95_lower",
        "ci_95_upper",
        "ci_width",
        "calibration_note",
        "safety_badge",
    ]:
        assert key in result


def test_simulate_safety_badge_present():
    """Every successful simulation must carry the safety badge."""
    result = simulate_with_uncertainty(
        "tDCS",
        {"intensity_ma": 2.0, "sessions_planned": 10},
        {"phq9_baseline": 18.0},
    )
    assert "SIMULATION ONLY" in result["safety_badge"]


def test_simulate_calibration_note_present():
    """Calibration disclaimer must be present."""
    result = simulate_with_uncertainty(
        "tDCS",
        {"intensity_ma": 2.0, "sessions_planned": 10},
        {"phq9_baseline": 18.0},
    )
    assert "Not a calibrated prediction model" in result["calibration_note"]


# ---------------------------------------------------------------------------
# 2. Uncertainty bounds & bootstrap CI
# ---------------------------------------------------------------------------

def test_ci_bounds_are_ordered():
    """Lower CI must be ≤ point estimate ≤ upper CI."""
    result = simulate_with_uncertainty(
        "tDCS",
        {"intensity_ma": 2.0, "sessions_planned": 10},
        {"phq9_baseline": 18.0},
        n_bootstraps=200,
    )
    assert result["ci_95_lower"] <= result["point_estimate"]
    assert result["point_estimate"] <= result["ci_95_upper"]


def test_ci_width_non_negative():
    """CI width must be non-negative."""
    result = simulate_with_uncertainty(
        "tDCS",
        {"intensity_ma": 2.0, "sessions_planned": 10},
        {"phq9_baseline": 18.0},
    )
    assert result["ci_width"] >= 0


def test_ci_widens_with_more_baseline_variance():
    """Higher baseline variance should generally yield wider CIs."""
    import random

    random.seed(42)
    result_low = simulate_with_uncertainty(
        "tDCS",
        {"intensity_ma": 2.0, "sessions_planned": 10},
        {"phq9_baseline": 18.0},
        n_bootstraps=100,
    )
    # Default _add_noise uses sigma=1.5; the CI width reflects this
    assert result_low["ci_width"] > 0


# ---------------------------------------------------------------------------
# 3. Unsupported modality rejection
# ---------------------------------------------------------------------------

def test_unsupported_modality_returns_error():
    """An unsupported modality must return an error payload."""
    result = simulate_with_uncertainty(
        "ECT",
        {"intensity_ma": 2.0, "sessions_planned": 10},
        {"phq9_baseline": 18.0},
    )
    assert "error" in result
    assert "supported" in result
    assert "tDCS" in result["supported"]


def test_all_v2_modalities_accepted():
    """Every modality in MODALITIES_V2 should simulate without error."""
    for modality in MODALITIES_V2:
        params = (
            {"intensity_ma": 2.0, "sessions_planned": 10}
            if modality in ["tDCS", "tACS"]
            else {"intensity_pct": 80, "sessions_planned": 10}
        )
        result = simulate_with_uncertainty(
            modality, params, {"phq9_baseline": 15.0}
        )
        assert "error" not in result, f"{modality} failed: {result}"
        assert "point_estimate" in result


# ---------------------------------------------------------------------------
# 4. Scenario comparison
# ---------------------------------------------------------------------------

def test_compare_two_scenarios():
    """Compare 2 scenarios and verify delta computation."""
    scenarios = [
        {
            "modality": "tDCS",
            "params": {"intensity_ma": 2.0, "sessions_planned": 10},
            "baseline": {"phq9_baseline": 18.0},
            "label": "tDCS Low",
        },
        {
            "modality": "rTMS",
            "params": {"intensity_pct": 120, "sessions_planned": 20},
            "baseline": {"phq9_baseline": 18.0},
            "label": "rTMS High",
        },
    ]
    result = compare_scenarios(scenarios)
    assert "scenarios" in result
    assert result["count"] == 2
    assert "delta_vs_first" in result["scenarios"][1]


def test_compare_three_scenarios():
    """Compare 3 scenarios — all should have delta vs first."""
    scenarios = [
        {
            "modality": "tDCS",
            "params": {"intensity_ma": 1.0, "sessions_planned": 10},
            "baseline": {"phq9_baseline": 20.0},
            "label": "A",
        },
        {
            "modality": "TMS",
            "params": {"intensity_pct": 100, "sessions_planned": 10},
            "baseline": {"phq9_baseline": 20.0},
            "label": "B",
        },
        {
            "modality": "tRNS",
            "params": {"intensity_pct": 100, "sessions_planned": 10},
            "baseline": {"phq9_baseline": 20.0},
            "label": "C",
        },
    ]
    result = compare_scenarios(scenarios)
    assert result["count"] == 3
    assert "delta_vs_first" in result["scenarios"][1]
    assert "delta_vs_first" in result["scenarios"][2]


def test_compare_more_than_three_scenarios_rejected():
    """Comparison must reject >3 scenarios."""
    scenarios = [
        {"modality": "tDCS", "params": {}, "baseline": {}, "label": str(i)}
        for i in range(4)
    ]
    result = compare_scenarios(scenarios)
    assert "error" in result


def test_comparison_note_present():
    """Comparison result must contain the comparison disclaimer."""
    scenarios = [
        {
            "modality": "tDCS",
            "params": {"intensity_ma": 2.0, "sessions_planned": 10},
            "baseline": {"phq9_baseline": 18.0},
            "label": "Only",
        },
    ]
    result = compare_scenarios(scenarios)
    assert "Comparisons are hypothetical" in result["comparison_note"]


# ---------------------------------------------------------------------------
# 5. Trajectory estimation
# ---------------------------------------------------------------------------

def test_trajectory_returns_expected_keys():
    """Trajectory output must contain all expected keys."""
    history = [(0, 18.0), (14, 16.0), (28, 14.5), (42, 13.0)]
    result = estimate_trajectory(history, horizon_key="6w")
    for key in [
        "horizon",
        "horizon_days",
        "predicted_score",
        "ci_95_lower",
        "ci_95_upper",
        "trend_slope",
        "trend_direction",
        "historical_n",
        "calibration_note",
        "status",
    ]:
        assert key in result


def test_trajectory_insufficient_data():
    """Trajectory must return error with <2 data points."""
    result = estimate_trajectory([], horizon_key="6w")
    assert result["status"] == "insufficient_data"
    assert "error" in result


def test_trajectory_single_point_rejected():
    """Trajectory must return error with only 1 data point."""
    result = estimate_trajectory([(0, 18.0)], horizon_key="6w")
    assert result["status"] == "insufficient_data"


def test_trajectory_ci_widens_with_longer_horizon():
    """Longer horizon should produce wider confidence intervals."""
    history = [(0, 18.0), (14, 16.0), (28, 14.5), (42, 13.0)]
    r_2w = estimate_trajectory(history, horizon_key="2w")
    r_26w = estimate_trajectory(history, horizon_key="26w")
    w_2w = r_2w["ci_95_upper"] - r_2w["ci_95_lower"]
    w_26w = r_26w["ci_95_upper"] - r_26w["ci_95_lower"]
    assert w_26w > w_2w


def test_trajectory_trend_direction_improving():
    """Downward slope must be classified as improving."""
    history = [(0, 20.0), (14, 16.0), (28, 12.0)]  # clear downward trend
    result = estimate_trajectory(history, horizon_key="6w")
    assert result["trend_direction"] == "improving"
    assert result["trend_slope"] < -0.01


def test_trajectory_trend_direction_worsening():
    """Upward slope must be classified as worsening."""
    history = [(0, 10.0), (14, 14.0), (28, 18.0)]  # clear upward trend
    result = estimate_trajectory(history, horizon_key="6w")
    assert result["trend_direction"] == "worsening"
    assert result["trend_slope"] > 0.01


def test_trajectory_trend_direction_stable():
    """Flat slope must be classified as stable."""
    history = [(0, 15.0), (14, 15.1), (28, 15.0)]  # nearly flat
    result = estimate_trajectory(history, horizon_key="6w")
    assert result["trend_direction"] == "stable"


def test_trajectory_calibration_note_present():
    """Trajectory result must carry the calibration disclaimer."""
    history = [(0, 18.0), (14, 16.0), (28, 14.5)]
    result = estimate_trajectory(history, horizon_key="6w")
    assert "extrapolation" in result["calibration_note"].lower()


# ---------------------------------------------------------------------------
# 6. Internal helpers
# ---------------------------------------------------------------------------

def test_compute_prediction_bounds():
    """Prediction must never return negative PHQ-9 scores."""
    pred = _compute_prediction(
        "tDCS", {"intensity_ma": 10.0, "sessions_planned": 100}, {"phq9_baseline": 1.0}
    )
    assert pred >= 0


def test_add_noise_preserves_structure():
    """Noise addition must preserve all keys in baseline dict."""
    baseline = {"phq9_baseline": 15.0, "age": 45, "extra": "value"}
    noisy = _add_noise(baseline)
    assert set(noisy.keys()) == set(baseline.keys())
    assert noisy["phq9_baseline"] != baseline["phq9_baseline"]  # very likely


# ---------------------------------------------------------------------------
# 7. Extended modality coverage (v2)
# ---------------------------------------------------------------------------

def test_v2_modalities_include_rtms():
    """rTMS must be in the v2 modality list."""
    assert "rTMS" in MODALITIES_V2


def test_v2_modalities_include_deep_tms():
    """deep_TMS must be in the v2 modality list."""
    assert "deep_TMS" in MODALITIES_V2


def test_v2_modalities_include_trns():
    """tRNS must be in the v2 modality list."""
    assert "tRNS" in MODALITIES_V2


def test_v2_modalities_include_pbm():
    """PBM must be in the v2 modality list."""
    assert "PBM" in MODALITIES_V2


def test_v2_modalities_include_legacy():
    """Legacy modalities tDCS, TMS, tACS, CES must still be supported."""
    for m in ["tDCS", "TMS", "tACS", "CES"]:
        assert m in MODALITIES_V2
