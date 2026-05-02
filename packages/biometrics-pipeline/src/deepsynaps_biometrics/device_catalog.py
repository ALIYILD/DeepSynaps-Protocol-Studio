"""Marketplace-ready device capability catalog (data-driven recommendations)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SupportedDataCapability(BaseModel):
    key: str  # e.g. supports_hrv
    description: str


class MarketplaceDevice(BaseModel):
    device_id: str
    vendor: str
    display_name: str
    category: str  # ring | watch | band | scale | patch | other
    supports_hr: bool = False
    supports_hrv: bool = False
    supports_sleep: bool = False
    supports_spo2: bool = False
    supports_temperature: bool = False
    direct_api_available: bool = False
    sync_via_healthkit: bool = False
    sync_via_health_connect: bool = False
    recommended_for_use_cases: list[str] = Field(default_factory=list)


class DeviceRecommendationRule(BaseModel):
    """Declarative rule: if missing capability X, prefer vendors with X."""

    missing_capability: str
    prefer_direct_api: bool = False
    prefer_healthkit: bool = False


_DEFAULT_CATALOG: list[MarketplaceDevice] = [
    MarketplaceDevice(
        device_id="oura_ring_gen3",
        vendor="Oura",
        display_name="Oura Ring",
        category="ring",
        supports_hr=True,
        supports_hrv=True,
        supports_sleep=True,
        supports_spo2=False,
        supports_temperature=True,
        direct_api_available=True,
        sync_via_healthkit=True,
        sync_via_health_connect=True,
        recommended_for_use_cases=["sleep_recovery", "hrv_trending"],
    ),
    MarketplaceDevice(
        device_id="apple_watch",
        vendor="Apple",
        display_name="Apple Watch",
        category="watch",
        supports_hr=True,
        supports_hrv=True,
        supports_sleep=True,
        supports_spo2=True,
        supports_temperature=False,
        direct_api_available=False,
        sync_via_healthkit=True,
        sync_via_health_connect=False,
        recommended_for_use_cases=["activity", "ecosystem_ios"],
    ),
]


def list_supported_marketplace_devices() -> list[MarketplaceDevice]:
    return list(_DEFAULT_CATALOG)


def recommend_supported_device(user_data_profile: dict[str, bool]) -> list[MarketplaceDevice]:
    """``user_data_profile`` keys like missing_hrv → True if user lacks HRV."""
    missing_hrv = user_data_profile.get("missing_hrv", False)
    missing_sleep = user_data_profile.get("missing_sleep", False)
    ranked: list[MarketplaceDevice] = []
    for d in _DEFAULT_CATALOG:
        score = 0
        if missing_hrv and d.supports_hrv:
            score += 2
        if missing_sleep and d.supports_sleep:
            score += 2
        if score:
            ranked.append(d)
    ranked.sort(key=lambda x: x.display_name)
    return ranked or list(_DEFAULT_CATALOG)


def explain_device_recommendation(device: MarketplaceDevice, user_data_profile: dict[str, bool]) -> str:
    reasons: list[str] = []
    if user_data_profile.get("missing_hrv") and device.supports_hrv:
        reasons.append("fills HRV gap")
    if user_data_profile.get("missing_sleep") and device.supports_sleep:
        reasons.append("fills sleep structure gap")
    if not reasons:
        return f"{device.display_name} is a supported ecosystem option."
    return f"{device.display_name}: recommended because it " + ", ".join(reasons) + "."
