"""Signal quality, gaps, and non-wear heuristics (MVP stubs)."""

from __future__ import annotations

from typing import Optional

from deepsynaps_biometrics.enums import SampleQuality
from deepsynaps_biometrics.schemas import BiometricSample, BiometricSeries


def detect_data_gaps_and_nonwear(
    series: BiometricSeries,
    *,
    expected_interval_s: Optional[float],
    gap_multiplier: float = 3.0,
) -> list[tuple[str, str]]:
    """Return list of (gap_start_utc, reason) for large inter-sample gaps."""
    del gap_multiplier
    gaps: list[tuple[str, str]] = []
    if expected_interval_s is None or len(series.samples) < 2:
        return gaps
    # Minimal placeholder: compare consecutive samples only.
    for a, b in zip(series.samples, series.samples[1:]):
        # Caller should parse ISO; here we skip strict parsing in MVP stub.
        if a.observed_at_start_utc >= b.observed_at_start_utc:
            gaps.append((a.observed_at_start_utc, "non_monotonic_timestamps"))
    return gaps


def compute_signal_quality_scores(sample: BiometricSample) -> SampleQuality:
    """Map sensor flags / motion proxies to quality tier."""
    del sample
    return SampleQuality.UNKNOWN


def resample_biometric_series(
    series: BiometricSeries,
    *,
    target_resolution_s: float,
) -> BiometricSeries:
    """Down/up-sample to fixed grid (numpy interpolation in full impl)."""
    del target_resolution_s
    return series
