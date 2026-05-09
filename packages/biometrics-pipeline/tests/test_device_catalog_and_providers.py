"""Tests for ``deepsynaps_biometrics.device_catalog`` + ``providers/*``.

PR #651 covered every pure-function module except the marketplace
device catalog and the four wearable provider stubs (deferred there
because they "need real vendor payload fixtures"). This file pins the
deterministic stubs so refactors cannot silently drop the connection
mode strings or the support flags.

Pinned contracts:

- The default catalog ships at least Oura + Apple Watch.
- recommend_supported_device prefers HRV-capable devices when the user
  is missing HRV, sleep-capable when missing sleep.
- explain_device_recommendation surfaces "fills HRV gap" /
  "fills sleep structure gap" reasons.
- HealthKit, Health Connect, Oura, Terra connection helpers all
  return a stable dict shape with the canonical provider id.
- map_*_to_common_model functions accept the documented input shape
  and return [] (stub) without crashing.
- run_scheduled_biometric_sync returns SyncStatus.PENDING (stub
  behaviour pinned so callers can wire it later without a surprise).
"""
from __future__ import annotations

from typing import Any

import pytest

from deepsynaps_biometrics.device_catalog import (
    DeviceRecommendationRule,
    MarketplaceDevice,
    SupportedDataCapability,
    explain_device_recommendation,
    list_supported_marketplace_devices,
    recommend_supported_device,
)
from deepsynaps_biometrics.enums import SourceProvider, SyncStatus
from deepsynaps_biometrics.providers.health_connect import (
    connect_health_connect_account,
    fetch_supported_health_connect_records,
    map_health_connect_records_to_common_model,
    sync_health_connect_data,
)
from deepsynaps_biometrics.providers.healthkit import (
    connect_healthkit_account,
    fetch_supported_healthkit_types,
    map_healthkit_samples_to_common_model,
    sync_healthkit_data,
)
from deepsynaps_biometrics.providers.oura import (
    connect_oura_account,
    map_oura_payloads_to_common_model,
    sync_oura_data,
)
from deepsynaps_biometrics.providers.terra import connect_terra_placeholder
from deepsynaps_biometrics.workflow_orchestration import (
    run_scheduled_biometric_sync,
)


# ── Schemas ───────────────────────────────────────────────────────────────


class TestDeviceCatalogSchemas:
    def test_supported_data_capability_schema(self) -> None:
        c = SupportedDataCapability(key="supports_hrv", description="Heart rate variability")
        assert c.key == "supports_hrv"

    def test_marketplace_device_default_flags_false(self) -> None:
        d = MarketplaceDevice(
            device_id="x", vendor="X", display_name="X", category="ring"
        )
        assert d.supports_hr is False
        assert d.supports_hrv is False
        assert d.supports_sleep is False
        assert d.supports_spo2 is False
        assert d.supports_temperature is False
        assert d.direct_api_available is False
        assert d.sync_via_healthkit is False
        assert d.sync_via_health_connect is False
        assert d.recommended_for_use_cases == []

    def test_device_recommendation_rule_defaults(self) -> None:
        r = DeviceRecommendationRule(missing_capability="supports_hrv")
        assert r.prefer_direct_api is False
        assert r.prefer_healthkit is False


# ── list_supported_marketplace_devices ────────────────────────────────────


class TestListSupportedMarketplaceDevices:
    def test_default_catalog_includes_oura_and_apple(self) -> None:
        devices = list_supported_marketplace_devices()
        ids = {d.device_id for d in devices}
        assert "oura_ring_gen3" in ids
        assert "apple_watch" in ids

    def test_returns_a_copy(self) -> None:
        # Pin: list_supported_marketplace_devices returns a fresh list
        # so callers can't mutate the global default catalog.
        a = list_supported_marketplace_devices()
        a.clear()
        b = list_supported_marketplace_devices()
        assert len(b) >= 2  # the global is unchanged

    def test_oura_supports_hrv_temperature_sleep(self) -> None:
        devices = list_supported_marketplace_devices()
        oura = next(d for d in devices if d.device_id == "oura_ring_gen3")
        assert oura.supports_hrv is True
        assert oura.supports_temperature is True
        assert oura.supports_sleep is True
        assert oura.direct_api_available is True

    def test_apple_supports_spo2(self) -> None:
        devices = list_supported_marketplace_devices()
        apple = next(d for d in devices if d.device_id == "apple_watch")
        assert apple.supports_spo2 is True
        # No direct API for Apple Watch; goes via HealthKit.
        assert apple.direct_api_available is False
        assert apple.sync_via_healthkit is True


# ── recommend_supported_device ───────────────────────────────────────────


class TestRecommendSupportedDevice:
    def test_no_missing_returns_full_catalog(self) -> None:
        out = recommend_supported_device({})
        ids = {d.device_id for d in out}
        # When nothing is "missing", the function falls back to the
        # full catalog (no scoring).
        assert "oura_ring_gen3" in ids
        assert "apple_watch" in ids

    def test_missing_hrv_keeps_hrv_capable_devices(self) -> None:
        out = recommend_supported_device({"missing_hrv": True})
        # Both Oura and Apple Watch support HRV → both stay.
        ids = {d.device_id for d in out}
        assert "oura_ring_gen3" in ids
        assert "apple_watch" in ids

    def test_missing_sleep_keeps_sleep_capable_devices(self) -> None:
        out = recommend_supported_device({"missing_sleep": True})
        ids = {d.device_id for d in out}
        assert "oura_ring_gen3" in ids
        assert "apple_watch" in ids

    def test_results_sorted_by_display_name(self) -> None:
        out = recommend_supported_device({"missing_hrv": True})
        names = [d.display_name for d in out]
        assert names == sorted(names)


# ── explain_device_recommendation ────────────────────────────────────────


class TestExplainDeviceRecommendation:
    def test_hrv_gap_reason_surfaced(self) -> None:
        oura = next(
            d for d in list_supported_marketplace_devices()
            if d.device_id == "oura_ring_gen3"
        )
        msg = explain_device_recommendation(oura, {"missing_hrv": True})
        assert "fills HRV gap" in msg

    def test_sleep_gap_reason_surfaced(self) -> None:
        apple = next(
            d for d in list_supported_marketplace_devices()
            if d.device_id == "apple_watch"
        )
        msg = explain_device_recommendation(apple, {"missing_sleep": True})
        assert "fills sleep structure gap" in msg

    def test_both_gaps_combined(self) -> None:
        oura = next(
            d for d in list_supported_marketplace_devices()
            if d.device_id == "oura_ring_gen3"
        )
        msg = explain_device_recommendation(
            oura, {"missing_hrv": True, "missing_sleep": True}
        )
        assert "fills HRV gap" in msg
        assert "fills sleep structure gap" in msg

    def test_no_gaps_returns_generic_message(self) -> None:
        apple = next(
            d for d in list_supported_marketplace_devices()
            if d.device_id == "apple_watch"
        )
        msg = explain_device_recommendation(apple, {})
        assert "supported ecosystem option" in msg


# ── HealthKit provider ───────────────────────────────────────────────────


class TestHealthKitProvider:
    def test_connect_returns_native_permission_sheet(self) -> None:
        out = connect_healthkit_account(state="abc", redirect_uri="x://y")
        assert out["mode"] == "native_permission_sheet"
        assert out["provider"] == SourceProvider.APPLE_HEALTHKIT.value
        # Pin: the bridge note carries a reference to HKHealthStore so
        # the iOS team knows where the actual auth lives.
        assert "HKHealthStore" in out["note"]

    def test_supported_types_includes_hrv(self) -> None:
        types = fetch_supported_healthkit_types()
        assert "HKQuantityTypeIdentifierHeartRateVariabilitySDNN" in types
        assert "HKCategoryTypeIdentifierSleepAnalysis" in types

    def test_sync_returns_anchor_passthrough(self) -> None:
        out = sync_healthkit_data(
            user_id="U1",
            connection_id="C1",
            anchor_payload={"some": "anchor"},
        )
        assert out["anchor_out"] == {"some": "anchor"}
        assert out["batch_status"] == "stub"

    def test_sync_with_no_anchor_returns_empty_dict(self) -> None:
        out = sync_healthkit_data(user_id="U1", connection_id="C1", anchor_payload=None)
        assert out["anchor_out"] == {}

    def test_map_samples_returns_empty_list(self) -> None:
        # Stub: the API layer fills in the real mapping later.
        assert map_healthkit_samples_to_common_model([{"foo": 1}]) == []


# ── Health Connect provider ──────────────────────────────────────────────


class TestHealthConnectProvider:
    def test_connect_returns_intent_mode(self) -> None:
        out = connect_health_connect_account()
        assert out["mode"] == "health_connect_intent"
        assert out["provider"] == SourceProvider.ANDROID_HEALTH_CONNECT.value

    def test_supported_records_includes_sleep_and_hrv(self) -> None:
        records = fetch_supported_health_connect_records()
        assert "HeartRate" in records
        assert "SleepSession" in records
        assert "OxygenSaturation" in records

    def test_sync_returns_changes_token_passthrough(self) -> None:
        out = sync_health_connect_data(
            user_id="U", connection_id="C", changes_token="abc-123"
        )
        assert out["next_changes_token"] == "abc-123"

    def test_sync_with_no_token_returns_stub_token(self) -> None:
        out = sync_health_connect_data(
            user_id="U", connection_id="C", changes_token=None
        )
        assert out["next_changes_token"] == "stub-token"

    def test_map_records_returns_empty_list(self) -> None:
        assert map_health_connect_records_to_common_model([{"foo": 1}]) == []


# ── Oura provider ────────────────────────────────────────────────────────


class TestOuraProvider:
    def test_connect_uses_oauth2(self) -> None:
        out = connect_oura_account()
        assert out["oauth"] is True
        assert out["provider"] == SourceProvider.OURA_DIRECT.value
        # Pin the scopes so a refactor cannot silently drop one.
        for scope in ("personal", "daily", "heartrate", "session", "tag"):
            assert scope in out["scopes"]

    def test_sync_returns_stub_status(self) -> None:
        out = sync_oura_data(
            user_id="U",
            access_token="t",
            start_date="2024-01-01",
            end_date="2024-01-31",
        )
        assert out["status"] == "stub"

    def test_map_returns_empty_list(self) -> None:
        assert map_oura_payloads_to_common_model([{"x": 1}]) == []


# ── Terra placeholder ────────────────────────────────────────────────────


class TestTerraPlaceholder:
    def test_connect_returns_post_mvp_marker(self) -> None:
        # Pin: the placeholder explicitly says "not_implemented" so the
        # API layer cannot accidentally treat it as a working integration.
        out = connect_terra_placeholder()
        assert out["status"] == "not_implemented"
        assert out["phase"] == "post_mvp"


# ── workflow_orchestration ───────────────────────────────────────────────


class TestWorkflowOrchestration:
    def test_run_scheduled_returns_pending(self) -> None:
        # Pin the stub: until the worker layer is wired, scheduled sync
        # always reports PENDING — caller cannot misread "stub" as "done".
        assert run_scheduled_biometric_sync("conn-1") == SyncStatus.PENDING
