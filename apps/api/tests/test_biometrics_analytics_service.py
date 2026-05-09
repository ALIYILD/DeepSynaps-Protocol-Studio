"""Tests for app.services.biometrics_analytics — analytics façade.

Covers:
- summaries_to_feature_matrix returns dict of float lists
- summaries_to_feature_matrix averages duplicated source rows for same date
- summaries_to_feature_matrix omits all-NaN feature columns
- correlation_payload returns note when too few features
- correlation_payload returns matrix key when enough data
- features_payload returns daily mean/std for available features
- features_payload includes rolling_7d key
- features_payload engine field is correct
- baseline_payload returns message dict when feature missing from matrix
- baseline_payload returns message dict when fewer than 4 days
- alerts_payload returns list (may be empty on sparse data)
- resolve_analytics_patient_id raises ApiServiceError for guest role
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch
import types


def _make_summary(patient_id: str, date: str, source: str, **kwargs):
    s = MagicMock()
    s.patient_id = patient_id
    s.date = date
    s.source = source
    # All feature fields default None
    fields = (
        "rhr_bpm", "hrv_ms", "sleep_duration_h", "sleep_consistency_score",
        "steps", "spo2_pct", "skin_temp_delta", "readiness_score",
        "mood_score", "pain_score", "anxiety_score",
    )
    for f in fields:
        setattr(s, f, kwargs.get(f, None))
    return s


def test_summaries_to_feature_matrix_empty_input():
    from app.services.biometrics_analytics import summaries_to_feature_matrix

    result = summaries_to_feature_matrix([])
    assert isinstance(result, dict)
    assert len(result) == 0


def test_summaries_to_feature_matrix_single_row():
    from app.services.biometrics_analytics import summaries_to_feature_matrix

    row = _make_summary("p1", "2026-05-01", "garmin", rhr_bpm=62.0, steps=5000.0)
    result = summaries_to_feature_matrix([row])
    assert "rhr_bpm" in result
    assert "steps" in result
    assert result["rhr_bpm"] == [62.0]


def test_summaries_to_feature_matrix_averages_same_date():
    from app.services.biometrics_analytics import summaries_to_feature_matrix

    r1 = _make_summary("p1", "2026-05-01", "garmin", rhr_bpm=60.0)
    r2 = _make_summary("p1", "2026-05-01", "oura", rhr_bpm=64.0)
    result = summaries_to_feature_matrix([r1, r2])
    assert "rhr_bpm" in result
    # Mean of 60 and 64 = 62
    assert abs(result["rhr_bpm"][0] - 62.0) < 0.01


def test_summaries_to_feature_matrix_omits_all_none_feature():
    from app.services.biometrics_analytics import summaries_to_feature_matrix

    row = _make_summary("p1", "2026-05-01", "garmin", rhr_bpm=70.0)
    result = summaries_to_feature_matrix([row])
    # anxiety_score was not set — should not appear
    assert "anxiety_score" not in result


def test_correlation_payload_note_when_too_few_features():
    from app.services.biometrics_analytics import correlation_payload

    # Single feature with enough data — still need >=2 for correlation
    matrix = {"rhr_bpm": [62.0, 65.0, 63.0, 61.0]}
    result = correlation_payload(matrix)
    assert "note" in result
    assert result["matrix"] == {}


def test_correlation_payload_note_when_too_few_data_points():
    from app.services.biometrics_analytics import correlation_payload

    # Two features but fewer than 3 data points each
    matrix = {"rhr_bpm": [62.0, 65.0], "steps": [5000.0, 5200.0]}
    result = correlation_payload(matrix)
    assert "note" in result


def test_features_payload_returns_daily_and_rolling_keys():
    from app.services.biometrics_analytics import features_payload

    matrix = {
        "rhr_bpm": [60.0, 62.0, 63.0, 61.0, 64.0, 60.0, 65.0, 61.0],
    }
    result = features_payload(matrix)
    assert "daily" in result
    assert "rolling_7d" in result
    assert "rhr_bpm_mean" in result["daily"]
    assert "rhr_bpm_std" in result["daily"]


def test_features_payload_engine_field():
    from app.services.biometrics_analytics import features_payload

    result = features_payload({"hrv_ms": [42.0, 44.0, 43.0]})
    assert result.get("engine") == "deepsynaps_biometrics.features"


def test_baseline_payload_message_when_feature_missing():
    from app.services.biometrics_analytics import baseline_payload

    result = baseline_payload({"rhr_bpm": [60.0, 62.0, 63.0, 61.0]},
                               patient_id="p1", feature="steps")
    assert isinstance(result, dict)
    assert "message" in result


def test_baseline_payload_message_when_too_few_days():
    from app.services.biometrics_analytics import baseline_payload

    result = baseline_payload({"rhr_bpm": [60.0, 61.0]},
                               patient_id="p1", feature="rhr_bpm")
    assert isinstance(result, dict)
    assert "message" in result


def test_alerts_payload_returns_list():
    from app.services.biometrics_analytics import alerts_payload

    # Enough data to attempt baseline, may return empty list — just checks contract
    matrix = {
        "rhr_bpm": [60.0, 62.0, 63.0, 61.0, 64.0],
    }
    with patch(
        "app.services.biometrics_analytics.estimate_personal_baseline_and_deviation"
    ) as mock_est, patch(
        "app.services.biometrics_analytics.generate_biometric_alerts",
        return_value=[],
    ):
        mock_profile = MagicMock()
        mock_est.return_value = (mock_profile, 0.5)
        result = alerts_payload(matrix, patient_id="p1")

    assert isinstance(result, list)


def test_resolve_analytics_patient_id_rejects_guest():
    from app.services.biometrics_analytics import resolve_analytics_patient_id
    from app.errors import ApiServiceError

    actor = MagicMock()
    actor.role = "guest"
    db = MagicMock()

    try:
        resolve_analytics_patient_id(actor, db, patient_id=None)
        assert False, "Expected ApiServiceError for guest role"
    except ApiServiceError as e:
        assert e.status_code == 401
