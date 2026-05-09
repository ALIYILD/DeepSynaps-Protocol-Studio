"""Tests for prediction, causal, and features modules.

These are MVP stubs / simple deterministic functions — pin every branch
so a real implementation can't silently regress the contract.
"""

from __future__ import annotations

import pytest

from deepsynaps_biometrics.causal import (
    build_biometric_dag,
    compare_correlation_vs_causal_effect,
    estimate_intervention_effect,
    suggest_backdoor_adjustment_set,
)
from deepsynaps_biometrics.enums import (
    AlertSeverity,
    BiometricType,
    CausalModuleWarning,
    SourceProvider,
)
from deepsynaps_biometrics.features import (
    build_feature_window,
    extract_activity_features,
    extract_hr_features,
    extract_hrv_features,
    extract_sleep_features,
    extract_spo2_features,
    extract_temperature_features,
)
from deepsynaps_biometrics.prediction import (
    generate_biometric_alerts,
    predict_next_day_readiness,
)
from deepsynaps_biometrics.schemas import (
    BiometricFeatureWindow,
    BiometricSample,
    BiometricSeries,
    CausalAnalysisRequest,
    CausalAnalysisResult,
    PredictiveAlert,
    SleepSession,
)


def _sample(value: float, sample_id: str = "s") -> BiometricSample:
    return BiometricSample(
        sample_id=sample_id,
        user_id="u-1",
        biometric_type=BiometricType.HEART_RATE,
        value=value,
        unit="bpm",
        observed_at_start_utc="2026-05-08T12:00:00Z",
        sync_received_at_utc="2026-05-08T12:05:00Z",
        provider=SourceProvider.APPLE_HEALTHKIT,
    )


def _hr_series(values: list[float]) -> BiometricSeries:
    return BiometricSeries(
        user_id="u-1",
        biometric_type=BiometricType.HEART_RATE,
        provider=SourceProvider.APPLE_HEALTHKIT,
        samples=[_sample(v, sample_id=f"s-{i}") for i, v in enumerate(values)],
        series_start_utc="2026-05-08T00:00:00Z",
        series_end_utc="2026-05-09T00:00:00Z",
    )


# ───────────────────────────── prediction.py ───────────────────────────────


class TestPredictNextDayReadiness:
    def test_high_sleep_high_hrv_caps_at_100(self) -> None:
        result = predict_next_day_readiness([8.0] * 7, [60.0] * 7)
        assert result["readiness_0_100"] <= 100.0
        assert result["readiness_0_100"] == 100.0

    def test_low_sleep_low_hrv_low_score(self) -> None:
        result = predict_next_day_readiness([0.0] * 7, [0.0] * 7)
        assert result["readiness_0_100"] == 0.0

    def test_components_returned(self) -> None:
        result = predict_next_day_readiness([6.0] * 7, [40.0] * 7)
        assert "component_sleep" in result
        assert "component_hrv" in result
        assert result["component_sleep"] == 6.0
        assert result["component_hrv"] == 40.0

    def test_uses_last_seven_days_only(self) -> None:
        # 14 days of sleep — only last 7 should drive the score.
        result = predict_next_day_readiness([0.0] * 7 + [8.0] * 7, [50.0] * 14)
        assert result["component_sleep"] == 8.0


class TestGenerateBiometricAlerts:
    def test_below_threshold_no_alert(self) -> None:
        alerts = generate_biometric_alerts(
            user_id="u-1",
            z_scores={"hrv": 1.0},
        )
        assert alerts == []

    def test_above_default_threshold_emits_medium(self) -> None:
        alerts = generate_biometric_alerts(
            user_id="u-1",
            z_scores={"hrv": 3.0},
        )
        assert len(alerts) == 1
        assert isinstance(alerts[0], PredictiveAlert)
        assert alerts[0].severity is AlertSeverity.MEDIUM
        assert alerts[0].requires_clinical_review is True

    def test_above_high_threshold_emits_high(self) -> None:
        alerts = generate_biometric_alerts(
            user_id="u-1",
            z_scores={"hrv": 4.0},
        )
        assert alerts[0].severity is AlertSeverity.HIGH

    def test_negative_z_above_threshold_also_alerts(self) -> None:
        alerts = generate_biometric_alerts(
            user_id="u-1",
            z_scores={"hrv": -3.0},
        )
        assert len(alerts) == 1

    def test_per_feature_threshold_overrides_default(self) -> None:
        alerts = generate_biometric_alerts(
            user_id="u-1",
            z_scores={"hrv": 1.5, "spo2": 1.5},
            thresholds={"hrv": 1.0, "default": 5.0},
        )
        # hrv exceeds its 1.0 threshold; spo2 (1.5) is below default 5.0.
        assert len(alerts) == 1
        assert alerts[0].feature_refs == ["hrv"]

    def test_score_capped_at_one(self) -> None:
        alerts = generate_biometric_alerts(
            user_id="u-1",
            z_scores={"hrv": 100.0},
        )
        assert alerts[0].score_0_1 == 1.0


# ───────────────────────────── causal.py ───────────────────────────────────


class TestBuildBiometricDag:
    def test_extracts_unique_nodes(self) -> None:
        dag = build_biometric_dag([("a", "b"), ("b", "c"), ("a", "c")])
        assert dag["nodes"] == ["a", "b", "c"]
        assert dag["edges"] == [("a", "b"), ("b", "c"), ("a", "c")]

    def test_handles_empty_edges(self) -> None:
        dag = build_biometric_dag([])
        assert dag == {"nodes": [], "edges": []}


class TestSuggestBackdoorAdjustmentSet:
    def test_returns_parents_of_exposure(self) -> None:
        result = suggest_backdoor_adjustment_set(
            [("c1", "exposure"), ("c2", "exposure"), ("exposure", "outcome")],
            exposure="exposure",
            outcome="outcome",
        )
        assert sorted(result) == ["c1", "c2"]

    def test_no_parents_returns_empty(self) -> None:
        assert suggest_backdoor_adjustment_set(
            [("a", "b")], exposure="a", outcome="b",
        ) == []


class TestEstimateInterventionEffect:
    def test_returns_not_implemented_with_warnings(self) -> None:
        request = CausalAnalysisRequest(
            user_id="u-1",
            exposure_feature="hrv",
            outcome_feature="readiness",
        )
        result = estimate_intervention_effect(request, observed_data={})
        assert isinstance(result, CausalAnalysisResult)
        assert result.estimated_effect is None
        assert result.method == "not_implemented_observational"
        # Warning bundle pins the safety contract: "this is observational
        # and assumption-driven, never diagnostic".
        assert CausalModuleWarning.OBSERVATIONAL_ONLY.value in result.warnings
        assert CausalModuleWarning.ASSUMPTION_DRIVEN.value in result.warnings
        assert CausalModuleWarning.NOT_DIAGNOSTIC.value in result.warnings


class TestCompareCorrelationVsCausal:
    def test_returns_both_with_disclaimer(self) -> None:
        result = compare_correlation_vs_causal_effect(0.7, 0.3)
        assert result["correlation"] == 0.7
        assert result["causal_effect_observational"] == 0.3
        assert "DAG assumptions" in result["interpretation"]

    def test_handles_none_causal_estimate(self) -> None:
        result = compare_correlation_vs_causal_effect(0.5, None)
        assert result["causal_effect_observational"] is None


# ───────────────────────────── features.py ─────────────────────────────────


class TestExtractHrFeatures:
    def test_empty_series_returns_empty(self) -> None:
        assert extract_hr_features(_hr_series([])) == {}

    def test_computes_mean_max_min_n(self) -> None:
        result = extract_hr_features(_hr_series([60.0, 70.0, 80.0]))
        assert result["hr_mean"] == pytest.approx(70.0)
        assert result["hr_max"] == 80.0
        assert result["hr_min"] == 60.0
        assert result["hr_n"] == 3.0


class TestExtractHrvFeatures:
    def test_returns_empty_dict_in_mvp(self) -> None:
        # MVP stub — pin so real impl is a deliberate change.
        assert extract_hrv_features([]) == {}


class TestExtractSleepFeatures:
    def test_empty_returns_empty(self) -> None:
        assert extract_sleep_features([]) == {}

    def test_returns_last_session_metrics(self) -> None:
        sessions = [
            SleepSession(
                session_id="sl-1",
                user_id="u-1",
                provider=SourceProvider.APPLE_HEALTHKIT,
                sleep_start_utc="2026-05-07T22:00:00Z",
                wake_time_utc="2026-05-08T06:00:00Z",
                sync_received_at_utc="2026-05-08T06:05:00Z",
                total_sleep_min=420,
                efficiency_pct=85.0,
            ),
            SleepSession(
                session_id="sl-2",
                user_id="u-1",
                provider=SourceProvider.APPLE_HEALTHKIT,
                sleep_start_utc="2026-05-08T22:00:00Z",
                wake_time_utc="2026-05-09T06:00:00Z",
                sync_received_at_utc="2026-05-09T06:05:00Z",
                total_sleep_min=480,
                efficiency_pct=92.0,
            ),
        ]
        result = extract_sleep_features(sessions)
        assert result["last_total_sleep_min"] == 480.0
        assert result["last_sleep_efficiency_pct"] == 92.0

    def test_handles_missing_metrics_with_zero(self) -> None:
        sessions = [
            SleepSession(
                session_id="sl-1",
                user_id="u-1",
                provider=SourceProvider.APPLE_HEALTHKIT,
                sleep_start_utc="2026-05-07T22:00:00Z",
                wake_time_utc="2026-05-08T06:00:00Z",
                sync_received_at_utc="2026-05-08T06:05:00Z",
            ),
        ]
        result = extract_sleep_features(sessions)
        assert result["last_total_sleep_min"] == 0.0


class TestStubFeatureExtractors:
    def test_extract_activity_features_empty(self) -> None:
        assert extract_activity_features({}) == {}

    def test_extract_temperature_features_empty(self) -> None:
        assert extract_temperature_features(_hr_series([36.5])) == {}

    def test_extract_spo2_features_uses_hr_pattern(self) -> None:
        # In MVP, spo2 reduce uses the same pattern as HR.
        result = extract_spo2_features(_hr_series([95.0, 96.0, 97.0]))
        assert result["hr_mean"] == pytest.approx(96.0)


class TestBuildFeatureWindow:
    def test_filters_to_numeric_features(self) -> None:
        window = build_feature_window(
            user_id="u-1",
            start_utc="2026-05-01T00:00:00Z",
            end_utc="2026-05-08T00:00:00Z",
            label="weekly",
            features={"a": 1.0, "b": 2, "c": "ignored", "d": None},
        )
        assert isinstance(window, BiometricFeatureWindow)
        assert set(window.features.keys()) == {"a", "b"}
        assert window.features["b"] == 2.0
        assert window.window_id == "fw-u-1-weekly"
