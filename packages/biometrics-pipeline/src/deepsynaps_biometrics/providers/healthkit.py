"""Apple HealthKit — data only on-device; bridge uploads to backend."""

from __future__ import annotations

from typing import Any

from deepsynaps_biometrics.enums import SourceProvider
from deepsynaps_biometrics.schemas import BiometricSample


def connect_healthkit_account(state: str, redirect_uri: str) -> dict[str, Any]:
    """iOS app requests HealthKit types; no OAuth to Apple for read — bridge pattern.

    Returns payload fields for deep-link or mobile SDK (implemented in iOS app).
    """
    del state, redirect_uri
    return {
        "mode": "native_permission_sheet",
        "provider": SourceProvider.APPLE_HEALTHKIT.value,
        "note": "Authorization is via HKHealthStore on device; server stores consent record only.",
    }


def fetch_supported_healthkit_types() -> list[str]:
    """HKQuantityTypeIdentifier / HKCategoryTypeIdentifier string ids for MVP."""
    return [
        "HKQuantityTypeIdentifierHeartRate",
        "HKQuantityTypeIdentifierRestingHeartRate",
        "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
        "HKCategoryTypeIdentifierSleepAnalysis",
        "HKQuantityTypeIdentifierStepCount",
        "HKQuantityTypeIdentifierOxygenSaturation",
        "HKQuantityTypeIdentifierBodyTemperature",
    ]


def sync_healthkit_data(
    *,
    user_id: str,
    connection_id: str,
    anchor_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    """Incremental sync using HKAnchoredObjectQuery anchors (stored server-side)."""
    del user_id, connection_id
    return {"anchor_out": anchor_payload or {}, "batch_status": "stub"}


def map_healthkit_samples_to_common_model(rows: list[dict[str, Any]]) -> list[BiometricSample]:
    """Map HealthKit export rows → BiometricSample (completed in API layer)."""
    del rows
    return []
