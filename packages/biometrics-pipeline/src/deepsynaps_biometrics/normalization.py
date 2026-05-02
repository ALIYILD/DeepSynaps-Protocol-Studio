"""Timestamp normalization and vendor → canonical mapping helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from deepsynaps_biometrics.schemas import BiometricSample


def normalize_biometric_timestamps(
    sample: BiometricSample,
    *,
    target_tz_utc: bool = True,
) -> BiometricSample:
    """Ensure ISO-8601 UTC strings; strip naive ambiguity."""
    del target_tz_utc
    start = _parse_utc(sample.observed_at_start_utc)
    end = (
        _parse_utc(sample.observed_at_end_utc)
        if sample.observed_at_end_utc
        else None
    )
    out = sample.model_copy()
    out.observed_at_start_utc = start.isoformat().replace("+00:00", "Z")
    if end:
        out.observed_at_end_utc = end.isoformat().replace("+00:00", "Z")
    return out


def _parse_utc(s: str) -> datetime:
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def vendor_metric_to_canonical_unit(vendor_unit: str) -> tuple[str, float]:
    """Map vendor unit string to (canonical_unit, scale_factor)."""
    u = vendor_unit.lower().strip()
    if u in ("bpm", "count/min"):
        return "bpm", 1.0
    if u in ("ms", "milliseconds"):
        return "ms", 1.0
    if u in ("%", "percent"):
        return "percent", 1.0
    if u in ("celsius", "°c", "c"):
        return "celsius", 1.0
    return vendor_unit, 1.0


def dedupe_fingerprint(sample: BiometricSample) -> str:
    """Stable key for idempotent upserts (no PHI beyond internal ids)."""
    res = sample.resolution_seconds or 0.0
    return "|".join(
        [
            sample.user_id,
            sample.biometric_type.value,
            sample.observed_at_start_utc,
            f"{res:.3f}",
            sample.provider.value,
            sample.connection_id or "",
            sample.raw_vendor_type or "",
        ]
    )
