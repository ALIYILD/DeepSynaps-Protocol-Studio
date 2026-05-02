"""Oura Cloud API — OAuth2 + REST (premium direct integration)."""

from __future__ import annotations

from typing import Any

from deepsynaps_biometrics.enums import SourceProvider


def connect_oura_account(authorize_url_hint: str = "") -> dict[str, Any]:
    """OAuth2 authorization code flow — aligns with ``device_sync`` Oura adapter."""
    del authorize_url_hint
    return {
        "oauth": True,
        "provider": SourceProvider.OURA_DIRECT.value,
        "scopes": ["personal", "daily", "heartrate", "session", "tag"],
    }


def sync_oura_data(
    *,
    user_id: str,
    access_token: str,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    """Fetch daily_activity, daily_sleep, heart_rate — pagination TBD."""
    del user_id, access_token, start_date, end_date
    return {"status": "stub"}


def map_oura_payloads_to_common_model(payloads: list[dict[str, Any]]):
    del payloads
    return []
