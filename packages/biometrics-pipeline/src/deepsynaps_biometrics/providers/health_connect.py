"""Android Health Connect — standardized records API."""

from __future__ import annotations

from typing import Any

from deepsynaps_biometrics.enums import SourceProvider


def connect_health_connect_account() -> dict[str, Any]:
    """Triggers PermissionController + Health Connect permission APIs on device."""
    return {
        "mode": "health_connect_intent",
        "provider": SourceProvider.ANDROID_HEALTH_CONNECT.value,
    }


def fetch_supported_health_connect_records() -> list[str]:
    """Record types for MVP read scope."""
    return [
        "HeartRate",
        "RestingHeartRate",
        "SleepSession",
        "Steps",
        "Distance",
        "OxygenSaturation",
        "SkinTemperature",
    ]


def sync_health_connect_data(
    *,
    user_id: str,
    connection_id: str,
    changes_token: str | None,
) -> dict[str, Any]:
    """Use Changes API token for incremental sync."""
    del user_id, connection_id
    return {"next_changes_token": changes_token or "stub-token", "batch_status": "stub"}


def map_health_connect_records_to_common_model(records: list[dict[str, Any]]):
    del records
    return []
