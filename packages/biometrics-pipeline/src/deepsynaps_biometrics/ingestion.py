"""Ingestion pipeline entrypoints (wire to API + DB in apps/api)."""

from __future__ import annotations

from typing import Any, Optional

from deepsynaps_biometrics.enums import SourceProvider
from deepsynaps_biometrics.schemas import BiometricSample, BiometricSeries


def import_biometric_stream(
    user_id: str,
    provider: SourceProvider,
    connection_id: Optional[str],
    payload: dict[str, Any],
    *,
    sync_received_at_utc: str,
) -> list[BiometricSample]:
    """Parse a vendor batch payload into canonical samples (stub).

    Real implementations route through ``providers/*`` mappers then
    ``normalization.normalize_biometric_timestamps`` + dedupe keys.
    """
    del user_id, provider, connection_id, payload, sync_received_at_utc
    return []


def upsert_biometric_samples(
    samples: list[BiometricSample],
    *,
    dedupe_key_fn,
) -> tuple[int, int]:
    """Return (inserted, skipped_duplicate). Persistence lives in API layer.

    ``dedupe_key_fn(sample) -> str`` should include user_id, type, time bucket,
    provider, and connection_id to avoid double ingest.
    """
    del dedupe_key_fn
    return len(samples), 0


def merge_multidevice_streams(
    series_list: list[BiometricSeries],
    *,
    precedence: Optional[list[SourceProvider]] = None,
) -> BiometricSeries:
    """Merge overlapping streams using provider precedence (caller-supplied).

    MVP: concatenate + sort by time; dedupe wins first provider in ``precedence``.
    """
    del precedence
    if not series_list:
        raise ValueError("series_list must not be empty")
    base = series_list[0]
    all_samples: list[BiometricSample] = []
    for s in series_list:
        all_samples.extend(s.samples)
    all_samples.sort(key=lambda x: x.observed_at_start_utc)
    return BiometricSeries(
        user_id=base.user_id,
        biometric_type=base.biometric_type,
        provider=base.provider,
        connection_id=base.connection_id,
        samples=all_samples,
        series_start_utc=min(s.series_start_utc for s in series_list),
        series_end_utc=max(s.series_end_utc for s in series_list),
    )
