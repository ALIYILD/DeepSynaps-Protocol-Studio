"""Cross-module tests for deepsynaps_biometrics.

Covers correlation, baseline, ingestion (stubs), normalization, quality
heuristics, and schema construction — all without external deps.
"""

from __future__ import annotations

import math

import pytest

from deepsynaps_biometrics.baseline import estimate_personal_baseline_and_deviation
from deepsynaps_biometrics.correlation import (
    compute_biomarker_correlation_matrix,
    compute_lagged_correlations,
    compute_within_person_correlations,
)
from deepsynaps_biometrics.enums import (
    AlertSeverity,
    BiometricType,
    SampleQuality,
    SourceProvider,
    SyncStatus,
)
from deepsynaps_biometrics.ingestion import (
    import_biometric_stream,
    merge_multidevice_streams,
    upsert_biometric_samples,
)
from deepsynaps_biometrics.normalization import (
    dedupe_fingerprint,
    normalize_biometric_timestamps,
    vendor_metric_to_canonical_unit,
)
from deepsynaps_biometrics.quality import (
    compute_signal_quality_scores,
    detect_data_gaps_and_nonwear,
    resample_biometric_series,
)
from deepsynaps_biometrics.schemas import (
    BiometricSample,
    BiometricSeries,
    DeviceSourceMetadata,
    LaggedCorrelationResult,
    PersonalBaselineProfile,
    UserDeviceConnection,
)


# ───────────────────────────── helpers ──────────────────────────────────────


def _sample(
    *,
    sample_id: str = "s-1",
    user_id: str = "u-1",
    biometric_type: BiometricType = BiometricType.HEART_RATE,
    value: float = 72.0,
    unit: str = "bpm",
    observed_at_start_utc: str = "2026-05-08T12:00:00Z",
    observed_at_end_utc: str | None = None,
    provider: SourceProvider = SourceProvider.APPLE_HEALTHKIT,
    connection_id: str | None = "conn-1",
    raw_vendor_type: str | None = None,
    resolution_seconds: float | None = None,
    sync_received_at_utc: str = "2026-05-08T12:05:00Z",
) -> BiometricSample:
    return BiometricSample(
        sample_id=sample_id,
        user_id=user_id,
        biometric_type=biometric_type,
        value=value,
        unit=unit,
        observed_at_start_utc=observed_at_start_utc,
        observed_at_end_utc=observed_at_end_utc,
        provider=provider,
        connection_id=connection_id,
        raw_vendor_type=raw_vendor_type,
        resolution_seconds=resolution_seconds,
        sync_received_at_utc=sync_received_at_utc,
    )


def _series(samples: list[BiometricSample] | None = None) -> BiometricSeries:
    samples = samples or [_sample()]
    return BiometricSeries(
        user_id="u-1",
        biometric_type=BiometricType.HEART_RATE,
        provider=SourceProvider.APPLE_HEALTHKIT,
        connection_id="conn-1",
        samples=samples,
        series_start_utc="2026-05-08T12:00:00Z",
        series_end_utc="2026-05-08T13:00:00Z",
    )


# ───────────────────────────── correlation.py ──────────────────────────────


class TestCorrelationMatrix:
    def test_perfect_positive(self) -> None:
        m = compute_biomarker_correlation_matrix(
            {"a": [1.0, 2.0, 3.0, 4.0], "b": [2.0, 4.0, 6.0, 8.0]},
        )
        assert m[("a", "b")] == pytest.approx(1.0)
        # Symmetric.
        assert m[("b", "a")] == pytest.approx(1.0)
        # Diagonal.
        assert m[("a", "a")] == pytest.approx(1.0)

    def test_perfect_negative(self) -> None:
        m = compute_biomarker_correlation_matrix(
            {"a": [1.0, 2.0, 3.0, 4.0], "b": [4.0, 3.0, 2.0, 1.0]},
        )
        assert m[("a", "b")] == pytest.approx(-1.0)

    def test_single_feature_returns_empty(self) -> None:
        assert compute_biomarker_correlation_matrix({"a": [1.0, 2.0]}) == {}

    def test_too_few_points_returns_nan(self) -> None:
        m = compute_biomarker_correlation_matrix({"a": [1.0, 2.0], "b": [3.0, 4.0]})
        assert math.isnan(m[("a", "b")])

    def test_pairwise_complete_with_nan(self) -> None:
        m = compute_biomarker_correlation_matrix(
            {"a": [1.0, 2.0, float("nan"), 4.0], "b": [2.0, 4.0, 6.0, 8.0]},
        )
        # 3 non-nan rows remaining → finite coefficient.
        assert math.isfinite(m[("a", "b")])

    def test_within_person_alias(self) -> None:
        a = compute_biomarker_correlation_matrix({"a": [1.0, 2.0, 3.0], "b": [2.0, 4.0, 6.0]})
        b = compute_within_person_correlations({"a": [1.0, 2.0, 3.0], "b": [2.0, 4.0, 6.0]})
        assert a == b


class TestLaggedCorrelations:
    def test_returns_empty_when_too_short(self) -> None:
        assert compute_lagged_correlations([1.0, 2.0], [3.0, 4.0], max_lag=7) == []

    def test_returns_empty_when_lengths_differ(self) -> None:
        assert compute_lagged_correlations([1.0] * 10, [2.0] * 5) == []

    def test_returns_lagged_results(self) -> None:
        # Series of 14 with a 1-day lag relationship.
        a = list(range(14))
        b = [v + 0.5 for v in a]  # b lags a by 0 actually; just test shape
        results = compute_lagged_correlations(a, b, max_lag=3, feature_a="x", feature_b="y")
        assert len(results) == 3
        assert all(isinstance(r, LaggedCorrelationResult) for r in results)
        assert results[0].lag == "1d"
        assert results[1].lag == "2d"
        assert results[2].lag == "3d"
        assert results[0].feature_a == "x"
        assert results[0].feature_b == "y"


# ───────────────────────────── baseline.py ─────────────────────────────────


class TestEstimateBaseline:
    def test_returns_profile_and_z(self) -> None:
        profile, z = estimate_personal_baseline_and_deviation(
            [60.0, 62.0, 61.0, 100.0],
            user_id="u-1",
            feature_name="hr",
            window_days=30,
            effective_from_utc="2026-05-08T00:00:00Z",
        )
        assert isinstance(profile, PersonalBaselineProfile)
        assert profile.user_id == "u-1"
        assert profile.feature_name == "hr"
        assert profile.method == "rolling_mean_pstdev"
        assert profile.n_days_used == 3  # excludes the last point
        # Last point (100) is well above mean of 61 → large positive z.
        assert z > 5

    def test_drops_none_values(self) -> None:
        profile, _ = estimate_personal_baseline_and_deviation(
            [60.0, None, 62.0, 61.0, 100.0],  # type: ignore[list-item]
            user_id="u-1",
            feature_name="hr",
            window_days=30,
            effective_from_utc="2026-05-08T00:00:00Z",
        )
        assert profile.n_days_used == 3

    def test_too_few_points_raises(self) -> None:
        with pytest.raises(ValueError, match="at least 3 points"):
            estimate_personal_baseline_and_deviation(
                [60.0, 62.0],
                user_id="u-1",
                feature_name="hr",
                window_days=30,
                effective_from_utc="2026-05-08T00:00:00Z",
            )

    def test_zero_std_uses_one(self) -> None:
        # All same → pstdev = 0 → impl falls back to 1.0.
        profile, z = estimate_personal_baseline_and_deviation(
            [60.0, 60.0, 60.0, 65.0],
            user_id="u-1",
            feature_name="hr",
            window_days=30,
            effective_from_utc="2026-05-08T00:00:00Z",
        )
        assert profile.std == 1.0
        assert z == pytest.approx(5.0)


# ───────────────────────────── ingestion.py (stubs) ────────────────────────


class TestIngestionStubs:
    def test_import_biometric_stream_returns_empty(self) -> None:
        # MVP stub — pin behaviour as a contract baseline.
        result = import_biometric_stream(
            "u-1",
            SourceProvider.APPLE_HEALTHKIT,
            "conn-1",
            {"raw": "payload"},
            sync_received_at_utc="2026-05-08T12:00:00Z",
        )
        assert result == []

    def test_upsert_returns_inserted_and_skipped(self) -> None:
        samples = [_sample() for _ in range(3)]
        inserted, skipped = upsert_biometric_samples(samples, dedupe_key_fn=lambda s: s.sample_id)
        assert inserted == 3
        assert skipped == 0

    def test_merge_empty_raises(self) -> None:
        with pytest.raises(ValueError, match="must not be empty"):
            merge_multidevice_streams([])

    def test_merge_single_series_passes_through(self) -> None:
        s = _series()
        merged = merge_multidevice_streams([s])
        assert isinstance(merged, BiometricSeries)
        assert len(merged.samples) == 1

    def test_merge_concatenates_and_sorts_by_time(self) -> None:
        s1 = _series([
            _sample(sample_id="b", observed_at_start_utc="2026-05-08T13:00:00Z"),
        ])
        s2 = _series([
            _sample(sample_id="a", observed_at_start_utc="2026-05-08T12:00:00Z"),
        ])
        merged = merge_multidevice_streams([s1, s2])
        # Sorted ascending by observed_at_start_utc.
        assert [s.sample_id for s in merged.samples] == ["a", "b"]


# ───────────────────────────── normalization.py ────────────────────────────


class TestNormalizeTimestamps:
    def test_z_suffix_passes_through(self) -> None:
        out = normalize_biometric_timestamps(
            _sample(observed_at_start_utc="2026-05-08T12:00:00Z"),
        )
        assert out.observed_at_start_utc == "2026-05-08T12:00:00Z"

    def test_offset_suffix_normalised_to_z(self) -> None:
        out = normalize_biometric_timestamps(
            _sample(observed_at_start_utc="2026-05-08T08:00:00-04:00"),
        )
        # 08:00 EDT == 12:00 UTC.
        assert out.observed_at_start_utc == "2026-05-08T12:00:00Z"

    def test_naive_timestamp_assumed_utc(self) -> None:
        out = normalize_biometric_timestamps(
            _sample(observed_at_start_utc="2026-05-08T12:00:00"),
        )
        assert out.observed_at_start_utc == "2026-05-08T12:00:00Z"

    def test_end_timestamp_normalised_when_present(self) -> None:
        out = normalize_biometric_timestamps(
            _sample(
                observed_at_start_utc="2026-05-08T08:00:00-04:00",
                observed_at_end_utc="2026-05-08T08:30:00-04:00",
            ),
        )
        assert out.observed_at_end_utc == "2026-05-08T12:30:00Z"


class TestVendorUnitMapping:
    @pytest.mark.parametrize(
        "vendor,expected",
        [
            ("bpm", ("bpm", 1.0)),
            ("BPM", ("bpm", 1.0)),
            ("count/min", ("bpm", 1.0)),
            ("ms", ("ms", 1.0)),
            ("milliseconds", ("ms", 1.0)),
            ("%", ("percent", 1.0)),
            ("percent", ("percent", 1.0)),
            ("Celsius", ("celsius", 1.0)),
            ("°C", ("celsius", 1.0)),
            ("c", ("celsius", 1.0)),
            # Unknown unit passes through as-is.
            ("Watts", ("Watts", 1.0)),
        ],
    )
    def test_units(self, vendor: str, expected: tuple[str, float]) -> None:
        assert vendor_metric_to_canonical_unit(vendor) == expected


class TestDedupeFingerprint:
    def test_includes_all_disambiguators(self) -> None:
        s = _sample(
            connection_id="conn-1",
            raw_vendor_type="hr_avg",
            resolution_seconds=60.0,
        )
        fp = dedupe_fingerprint(s)
        # The fingerprint contains every field that could distinguish two
        # samples — pin so a refactor can't accidentally drop one.
        assert s.user_id in fp
        assert s.biometric_type.value in fp
        assert s.observed_at_start_utc in fp
        assert "60.000" in fp  # resolution to 3 dp
        assert s.provider.value in fp
        assert "conn-1" in fp
        assert "hr_avg" in fp

    def test_handles_missing_optional_fields(self) -> None:
        s = _sample(connection_id=None, raw_vendor_type=None, resolution_seconds=None)
        fp = dedupe_fingerprint(s)
        # Empty positions must still be present so the structure stays stable.
        assert fp.count("|") == 6


# ───────────────────────────── quality.py (MVP stubs) ──────────────────────


class TestQuality:
    def test_compute_signal_quality_returns_unknown(self) -> None:
        assert compute_signal_quality_scores(_sample()) is SampleQuality.UNKNOWN

    def test_resample_passes_through_in_mvp(self) -> None:
        s = _series()
        out = resample_biometric_series(s, target_resolution_s=60.0)
        assert out is s

    def test_detect_gaps_returns_empty_when_no_expected_interval(self) -> None:
        assert detect_data_gaps_and_nonwear(_series(), expected_interval_s=None) == []

    def test_detect_gaps_returns_empty_when_too_few_samples(self) -> None:
        assert detect_data_gaps_and_nonwear(_series(), expected_interval_s=60.0) == []

    def test_detect_gaps_flags_non_monotonic_timestamps(self) -> None:
        s = _series([
            _sample(sample_id="a", observed_at_start_utc="2026-05-08T13:00:00Z"),
            _sample(sample_id="b", observed_at_start_utc="2026-05-08T12:00:00Z"),
        ])
        gaps = detect_data_gaps_and_nonwear(s, expected_interval_s=60.0)
        assert gaps
        assert gaps[0][1] == "non_monotonic_timestamps"


# ───────────────────────────── schemas.py ──────────────────────────────────


class TestSchemas:
    def test_biometric_sample_construction(self) -> None:
        s = _sample()
        assert s.sample_id == "s-1"
        assert s.biometric_type is BiometricType.HEART_RATE

    def test_device_source_metadata_defaults(self) -> None:
        m = DeviceSourceMetadata()
        assert m.vendor is None
        assert m.app_name is None

    def test_user_device_connection_default_status(self) -> None:
        c = UserDeviceConnection(
            connection_id="c-1",
            user_id="u-1",
            provider=SourceProvider.APPLE_HEALTHKIT,
        )
        assert c.status is SyncStatus.PENDING
        assert c.consent_scopes == []
        assert isinstance(c.metadata, DeviceSourceMetadata)

    def test_biometric_series_holds_samples(self) -> None:
        s = _series([_sample(), _sample(sample_id="s-2")])
        assert len(s.samples) == 2

    def test_lagged_correlation_result_construction(self) -> None:
        r = LaggedCorrelationResult(
            feature_a="a",
            feature_b="b",
            lag="1d",
            coefficient=0.42,
            n_samples=100,
            computed_at_utc="2026-05-08T12:00:00Z",
        )
        assert r.coefficient == 0.42

    @pytest.mark.parametrize("severity", list(AlertSeverity))
    def test_alert_severity_values_iterable(self, severity: AlertSeverity) -> None:
        assert isinstance(severity.value, str)

    @pytest.mark.parametrize("provider", list(SourceProvider))
    def test_source_providers_iterable(self, provider: SourceProvider) -> None:
        assert isinstance(provider.value, str)
