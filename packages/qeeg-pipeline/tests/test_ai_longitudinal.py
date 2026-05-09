"""Tests for ``deepsynaps_qeeg.ai.longitudinal``.

Pins the longitudinal trajectory analysis contracts:

- The trajectory envelope ALWAYS returns the full schema (n_sessions,
  baseline_date, days_since_baseline, feature_trajectories,
  brain_age_trajectory, normative_distance_trajectory, plotly_html,
  is_stub) so the API never has to defensively patch.
- ``compute_change_scores`` returns {} when fewer than 2 sessions
  exist (no change to compute) — never raises.
- Reliable Change Index (RCI) is approximated as
  (current - baseline) / sample_sd; degenerate sd=0 returns 0.0.
- Linear slope: zero-spread x or single-point input returns 0.0.
- Benjamini-Hochberg FDR correction marks all p-values <= the largest
  rank where p_i <= (i/n)*q as significant.
- _walk_number supports a "mean" key that averages across all numeric
  children of the current node (regional aggregation pattern).
- _safe_loads parses JSON strings, passes through dicts/lists/numbers,
  and returns None for bad input — never raises.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

import pytest

from deepsynaps_qeeg.ai.longitudinal import (
    HAS_NUMPY,
    HAS_PANDAS,
    _benjamini_hochberg,
    _compute_days_from_baseline,
    _flatten_analysis_features,
    _linear_slope,
    _normative_distance,
    _parse_iso,
    _pvalue_from_rci,
    _reliable_change_index,
    _row_date,
    _safe_loads,
    _to_records,
    _walk_number,
    compute_change_scores,
    generate_trajectory_report,
    get_patient_trajectory,
)


# ── _safe_loads ───────────────────────────────────────────────────────────


class TestSafeLoads:
    def test_none_returns_none(self) -> None:
        assert _safe_loads(None) is None

    def test_dict_passes_through(self) -> None:
        assert _safe_loads({"a": 1}) == {"a": 1}

    def test_list_passes_through(self) -> None:
        assert _safe_loads([1, 2]) == [1, 2]

    def test_number_passes_through(self) -> None:
        assert _safe_loads(42) == 42
        assert _safe_loads(3.14) == 3.14

    def test_json_string_parsed(self) -> None:
        assert _safe_loads('{"a": 1}') == {"a": 1}

    def test_invalid_json_returns_none(self) -> None:
        assert _safe_loads("not json") is None

    def test_unsupported_type_returns_none(self) -> None:
        assert _safe_loads(object()) is None


# ── _walk_number ──────────────────────────────────────────────────────────


class TestWalkNumber:
    def test_simple_path(self) -> None:
        d = {"spectral": {"bands": {"alpha": {"absolute": 12.3}}}}
        assert _walk_number(d, ["spectral", "bands", "alpha", "absolute"]) == 12.3

    def test_missing_key_returns_none(self) -> None:
        d = {"spectral": {}}
        assert _walk_number(d, ["spectral", "bands"]) is None

    def test_mean_aggregator(self) -> None:
        # The "mean" sentinel averages all numeric children of the current node.
        d = {"alpha": {"Fz": 10.0, "Cz": 20.0, "garbage": "x"}}
        assert _walk_number(d, ["alpha", "mean"]) == 15.0

    def test_mean_on_empty_dict_returns_none(self) -> None:
        assert _walk_number({}, ["a", "mean"]) is None

    def test_mean_on_non_dict_returns_none(self) -> None:
        d = {"alpha": 10}
        assert _walk_number(d, ["alpha", "mean"]) is None

    def test_non_numeric_leaf_returns_none(self) -> None:
        d = {"a": "not a number"}
        assert _walk_number(d, ["a"]) is None

    def test_traverse_through_non_dict_returns_none(self) -> None:
        d = {"a": [1, 2]}
        assert _walk_number(d, ["a", "b"]) is None


# ── _flatten_analysis_features ────────────────────────────────────────────


class TestFlattenAnalysisFeatures:
    def test_dict_row_with_band_powers_json(self) -> None:
        row = {
            "band_powers_json": {
                "bands": {
                    "alpha": {
                        "channels": {
                            "Fz": {"absolute_uv2": 12.0, "relative_pct": 25.0},
                            "Cz": {"absolute_uv2": 14.0, "relative_pct": 30.0},
                        }
                    },
                },
            },
        }
        out = _flatten_analysis_features(row, ["spectral.bands.alpha.absolute_uv2.mean"])
        # The mean across Fz=12 and Cz=14 is 13.
        assert out["spectral.bands.alpha.absolute_uv2.mean"] == 13.0

    def test_object_row_uses_getattr(self) -> None:
        class _Row:
            band_powers_json = None
            aperiodic_json = None
            peak_alpha_freq_json = None
            asymmetry_json = None
            connectivity_json = None
            graph_metrics_json = None
            source_roi_json = None
            brain_age_json = '{"gap_years": 5.0}'
            risk_scores_json = None
            centiles_json = None

        out = _flatten_analysis_features(_Row(), ["brain_age.gap_years"])
        assert out["brain_age.gap_years"] == 5.0

    def test_missing_paths_silently_skipped(self) -> None:
        row = {"band_powers_json": None}
        out = _flatten_analysis_features(row, ["does.not.exist"])
        assert out == {}


# ── _row_date / _parse_iso / _compute_days_from_baseline ──────────────────


class TestDateHelpers:
    def test_row_date_from_dict_recording_date(self) -> None:
        assert _row_date({"recording_date": "2024-01-10"}) == "2024-01-10"

    def test_row_date_falls_back_to_created_at(self) -> None:
        assert _row_date({"created_at": "2024-02-01"}) == "2024-02-01"

    def test_row_date_returns_none_when_missing(self) -> None:
        assert _row_date({}) is None

    def test_row_date_from_object_with_isoformat(self) -> None:
        class _Row:
            recording_date = None
            created_at = datetime(2024, 3, 1, tzinfo=timezone.utc)

        out = _row_date(_Row())
        assert out is not None
        assert "2024-03-01" in out

    def test_parse_iso_handles_zulu(self) -> None:
        d = _parse_iso("2024-04-15T10:00:00Z")
        assert d is not None and d.year == 2024

    def test_parse_iso_handles_date_only(self) -> None:
        d = _parse_iso("2024-04-15")
        assert d is not None and d.month == 4

    def test_parse_iso_returns_none_for_garbage(self) -> None:
        assert _parse_iso("not a date") is None
        assert _parse_iso(None) is None

    def test_compute_days_from_baseline(self) -> None:
        rows = [
            {"recording_date": "2024-01-10"},
            {"recording_date": "2024-01-15"},
            {"recording_date": "2024-02-10"},
        ]
        days = _compute_days_from_baseline(rows)
        assert days == [0, 5, 31]

    def test_compute_days_falls_back_to_zero_when_baseline_missing(self) -> None:
        rows = [{"recording_date": None}, {"recording_date": "2024-02-10"}]
        days = _compute_days_from_baseline(rows)
        # baseline is None → all days set to 0.
        assert days == [0, 0]


# ── _benjamini_hochberg ───────────────────────────────────────────────────


class TestBenjaminiHochberg:
    def test_empty_input_returns_empty(self) -> None:
        assert _benjamini_hochberg([]) == []

    def test_all_significant_when_all_pvals_tiny(self) -> None:
        out = _benjamini_hochberg([1e-9, 1e-9, 1e-9], q=0.05)
        assert all(out)

    def test_none_significant_when_all_pvals_large(self) -> None:
        out = _benjamini_hochberg([0.99, 0.99, 0.99], q=0.05)
        assert not any(out)

    def test_partial_significance_at_threshold(self) -> None:
        # n=4, q=0.05 → BH critical at rank k: (k/4)*0.05.
        # rank 1 = 0.0125 → 0.001 passes; rank 2 = 0.025 → 0.04 fails;
        # ranks 3, 4 fail. So threshold_met_at = 1 → only 1 significant.
        out = _benjamini_hochberg([0.001, 0.04, 0.5, 0.7], q=0.05)
        assert sum(out) == 1
        # The original-index-0 (0.001) is the significant one.
        assert out[0] is True
        assert out[1] is False


# ── _reliable_change_index ────────────────────────────────────────────────


class TestReliableChangeIndex:
    def test_constant_history_returns_zero(self) -> None:
        # sd=0 → return 0.0 to avoid division by zero.
        assert _reliable_change_index([5.0, 5.0, 5.0]) == 0.0

    def test_single_value_returns_zero(self) -> None:
        assert _reliable_change_index([1.0]) == 0.0

    def test_increasing_history_positive_rci(self) -> None:
        rci = _reliable_change_index([1.0, 2.0, 3.0])
        assert rci > 0

    def test_decreasing_history_negative_rci(self) -> None:
        rci = _reliable_change_index([3.0, 2.0, 1.0])
        assert rci < 0


# ── _linear_slope ─────────────────────────────────────────────────────────


class TestLinearSlope:
    def test_constant_returns_zero_slope(self) -> None:
        assert _linear_slope([5.0, 5.0, 5.0]) == 0.0

    def test_single_point_returns_zero(self) -> None:
        assert _linear_slope([7.0]) == 0.0

    def test_perfect_linear(self) -> None:
        # y = 2x → slope 2.
        s = _linear_slope([0.0, 2.0, 4.0, 6.0])
        assert s == pytest.approx(2.0)

    def test_explicit_x_axis(self) -> None:
        # y values at x=[0, 10, 20] grow by 2 per unit x.
        s = _linear_slope([0.0, 20.0, 40.0], x=[0.0, 10.0, 20.0])
        assert s == pytest.approx(2.0)

    def test_zero_spread_x_returns_zero(self) -> None:
        s = _linear_slope([1.0, 2.0, 3.0], x=[5.0, 5.0, 5.0])
        assert s == 0.0


# ── _pvalue_from_rci ──────────────────────────────────────────────────────


class TestPvalueFromRci:
    def test_zero_rci_yields_pvalue_one(self) -> None:
        assert _pvalue_from_rci(0.0) == pytest.approx(1.0)

    def test_large_rci_yields_tiny_pvalue(self) -> None:
        # |rci|=10 is far in the tail.
        p = _pvalue_from_rci(10.0)
        assert 0.0 <= p < 0.01

    def test_negative_rci_uses_abs(self) -> None:
        # Two-tailed: -2 and +2 produce the same p-value.
        assert _pvalue_from_rci(-2.0) == pytest.approx(_pvalue_from_rci(2.0))


# ── _to_records ────────────────────────────────────────────────────────────


class TestToRecords:
    def test_none_returns_empty(self) -> None:
        assert _to_records(None) == []

    def test_list_passes_through(self) -> None:
        out = _to_records([{"a": 1}, {"a": 2}])
        assert out == [{"a": 1}, {"a": 2}]


# ── _normative_distance ───────────────────────────────────────────────────


class TestNormativeDistance:
    def test_no_risk_score_keys_returns_none(self) -> None:
        assert _normative_distance({"foo": 1}) is None

    def test_aggregates_risk_score_dot_score_keys(self) -> None:
        rec = {
            "risk_scores.adhd.score": 0.5,
            "risk_scores.mdd.score": 0.5,
            "irrelevant.field": 99.0,
        }
        d = _normative_distance(rec)
        # sqrt(((0.5)^2 + (0.5)^2) / 2) = sqrt(0.25) = 0.5
        assert d == pytest.approx(0.5)


# ── compute_change_scores ─────────────────────────────────────────────────


class TestComputeChangeScores:
    def test_fewer_than_two_sessions_returns_empty(self) -> None:
        assert compute_change_scores([{"feat": 1.0}]) == {}
        assert compute_change_scores([]) == {}

    def test_two_sessions_emit_baseline_current_delta_rci_pvalue(self) -> None:
        records = [
            {
                "analysis_id": "a1",
                "recording_date": "2024-01-01",
                "days_from_baseline": 0,
                "session_number": 1,
                "spectral.bands.alpha.absolute_uv2.mean": 10.0,
            },
            {
                "analysis_id": "a2",
                "recording_date": "2024-02-01",
                "days_from_baseline": 31,
                "session_number": 2,
                "spectral.bands.alpha.absolute_uv2.mean": 14.0,
            },
        ]
        out = compute_change_scores(records)
        feat = out["spectral.bands.alpha.absolute_uv2.mean"]
        assert feat["baseline"] == 10.0
        assert feat["current"] == 14.0
        assert feat["delta"] == 4.0
        assert "rci" in feat
        assert "p_value" in feat
        assert "significant" in feat
        assert feat["n"] == 2

    def test_skips_features_with_fewer_than_two_numeric_values(self) -> None:
        records = [
            {"feat_a": 10.0, "feat_b": "n/a", "session_number": 1},
            {"feat_a": 12.0, "feat_b": None, "session_number": 2},
        ]
        out = compute_change_scores(records)
        assert "feat_a" in out
        assert "feat_b" not in out


# ── get_patient_trajectory ────────────────────────────────────────────────


class TestGetPatientTrajectory:
    def test_no_db_session_returns_empty(self) -> None:
        out = get_patient_trajectory("P-1", db_session=None)
        # Either DataFrame (pandas installed) or list — both must be empty.
        if HAS_PANDAS:
            assert len(out) == 0
        else:
            assert out == []


# ── generate_trajectory_report ────────────────────────────────────────────


class TestGenerateTrajectoryReport:
    def test_no_data_returns_full_envelope(self) -> None:
        out = generate_trajectory_report("P-1", db_session=None)
        # Pin: every contract field is always present.
        assert set(out.keys()) >= {
            "n_sessions",
            "baseline_date",
            "days_since_baseline",
            "feature_trajectories",
            "brain_age_trajectory",
            "normative_distance_trajectory",
            "plotly_html",
            "is_stub",
        }
        assert out["n_sessions"] == 0
        assert out["baseline_date"] is None
        assert out["days_since_baseline"] == 0
        assert out["feature_trajectories"] == {}
        assert out["brain_age_trajectory"]["gap_years"] == []
        assert out["normative_distance_trajectory"] == []

    def test_is_stub_when_pandas_missing(self) -> None:
        # is_stub is True when either numpy or pandas is missing.
        out = generate_trajectory_report("P-1", db_session=None)
        # The flag mirrors the actual install state.
        assert out["is_stub"] == (not (HAS_NUMPY and HAS_PANDAS))
