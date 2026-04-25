"""Adapter registry — maps provider slugs to adapter instances."""
from __future__ import annotations

from .base_adapter import BaseSyncAdapter
from .adapters.apple_health import AppleHealthAdapter
from .adapters.android_health import AndroidHealthAdapter
from .adapters.fitbit import FitbitAdapter
from .adapters.garmin import GarminAdapter
from .adapters.oura import OuraAdapter
from .adapters.whoop import WHOOPAdapter

ADAPTER_REGISTRY: dict[str, BaseSyncAdapter] = {
    "apple_healthkit": AppleHealthAdapter(),
    "google_health": AndroidHealthAdapter(),
    "fitbit": FitbitAdapter(),
    "garmin_connect": GarminAdapter(),
    "oura_ring": OuraAdapter(),
    "whoop": WHOOPAdapter(),
}


def get_adapter(provider_id: str) -> BaseSyncAdapter:
    """Return adapter for a provider slug.  Raises ``KeyError`` if unknown."""
    adapter = ADAPTER_REGISTRY.get(provider_id)
    if adapter is None:
        raise KeyError(f"Unknown provider: {provider_id}")
    return adapter


def list_adapters() -> dict[str, BaseSyncAdapter]:
    """Return all registered adapters."""
    return dict(ADAPTER_REGISTRY)


def is_demo_mode(provider_id: str) -> bool:
    """True when the provider has no real credentials configured."""
    try:
        return not get_adapter(provider_id).has_real_credentials()
    except KeyError:
        return True
