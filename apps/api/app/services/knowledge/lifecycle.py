"""Knowledge-adapter lifecycle state derivation.

Pure-function helpers that compute a normalized lifecycle state for every
catalogued / registered knowledge adapter. Consumed by:

- ``/api/v1/knowledge/live/adapters`` (and ``/_lifecycle``) for client-facing
  introspection.
- ``/health``, ``/healthz``, ``/api/v1/health`` for ops dashboards.

This module performs READ-ONLY introspection of registry state. It must
not trigger adapter instantiation, ``connect()``, or live health checks.
"""

from __future__ import annotations

import os
from enum import Enum
from typing import TYPE_CHECKING, Any, Dict, Iterable, List, Optional

if TYPE_CHECKING:  # pragma: no cover
    from app.services.knowledge.adapter_registry import AdapterRegistry


class LifecycleState(str, Enum):
    CATALOGUED = "catalogued"
    REGISTERED = "registered"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DISABLED = "disabled"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"


_OK_STATUS_VALUES = frozenset({"ok", "healthy", "up", "ready", "green", "operational"})
_DEGRADED_STATUS_VALUES = frozenset({"degraded", "warn", "warning", "partial", "yellow", "stale"})
_DOWN_STATUS_VALUES = frozenset({"down", "error", "fail", "failed", "unavailable", "red", "offline"})

DISABLED_ADAPTERS_ENV = "DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS"


def read_disabled_adapter_keys(
    env: Optional[Dict[str, str]] = None,
) -> frozenset[str]:
    raw = (env or os.environ).get(DISABLED_ADAPTERS_ENV, "") or ""
    return frozenset(token.strip() for token in raw.split(",") if token.strip())


def derive_state_from_health(cached: Optional[Dict[str, Any]]) -> LifecycleState:
    if not cached:
        return LifecycleState.UNKNOWN

    status = str(cached.get("status", "")).strip().lower()
    if status in _DEGRADED_STATUS_VALUES:
        return LifecycleState.DEGRADED
    if status in _DOWN_STATUS_VALUES:
        return LifecycleState.UNAVAILABLE
    if status in _OK_STATUS_VALUES:
        return LifecycleState.HEALTHY

    if cached.get("error"):
        return LifecycleState.UNAVAILABLE
    connected = cached.get("connected")
    if connected is True and status == "":
        return LifecycleState.HEALTHY
    if connected is False:
        return LifecycleState.UNAVAILABLE

    return LifecycleState.UNKNOWN


def compute_registry_lifecycle(
    registry: "AdapterRegistry",
    *,
    catalog_keys: Optional[Iterable[str]] = None,
    disabled_keys: Optional[Iterable[str]] = None,
) -> Dict[str, LifecycleState]:
    states: Dict[str, LifecycleState] = {}
    registered_names = set(registry.list_adapters())
    catalog_set = set(catalog_keys or ())
    disabled_set = set(disabled_keys or ())

    missing_keys = (catalog_set | disabled_set) - registered_names
    for key in missing_keys:
        states[key] = (
            LifecycleState.DISABLED if key in disabled_set else LifecycleState.CATALOGUED
        )

    cached_health = registry.get_all_cached_health()
    for name in registered_names:
        cached = cached_health.get(name)
        if cached is None:
            states[name] = LifecycleState.REGISTERED
        else:
            states[name] = derive_state_from_health(cached)

    return states


def summarize_lifecycle(states: Dict[str, LifecycleState]) -> Dict[str, Any]:
    by_state: Dict[str, int] = {member.value: 0 for member in LifecycleState}
    for state in states.values():
        by_state[state.value] = by_state.get(state.value, 0) + 1
    return {
        "total": len(states),
        "by_state": by_state,
        "adapters": {key: state.value for key, state in states.items()},
    }


def peek_registry_lifecycle_summary() -> Dict[str, Any]:
    from app.services.knowledge import adapter_bootstrap as _bootstrap

    catalog_keys = list(_bootstrap.list_production_adapter_keys())
    disabled_keys = read_disabled_adapter_keys()

    registry = _bootstrap._registry
    if registry is None:
        states: Dict[str, LifecycleState] = {}
        for key in catalog_keys:
            states[key] = (
                LifecycleState.DISABLED if key in disabled_keys else LifecycleState.CATALOGUED
            )
    else:
        states = compute_registry_lifecycle(
            registry,
            catalog_keys=catalog_keys,
            disabled_keys=disabled_keys,
        )

    return summarize_lifecycle(states)


__all__: List[str] = [
    "DISABLED_ADAPTERS_ENV",
    "LifecycleState",
    "compute_registry_lifecycle",
    "derive_state_from_health",
    "peek_registry_lifecycle_summary",
    "read_disabled_adapter_keys",
    "summarize_lifecycle",
]
