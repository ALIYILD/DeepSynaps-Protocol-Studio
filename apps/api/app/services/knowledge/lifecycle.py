"""Knowledge-adapter lifecycle state derivation.

Pure-function helpers that compute a normalized lifecycle state for every
catalogued / registered knowledge adapter. Consumed by:

- ``/api/v1/knowledge/live/adapters`` (and ``/_lifecycle``) for client-facing
  introspection.
- ``/health``, ``/healthz``, ``/api/v1/health`` for ops dashboards.

This module performs READ-ONLY introspection of registry state. It must
not trigger adapter instantiation, ``connect()``, or live health checks —
the goal is to keep health endpoints cheap and safe even when every
upstream API is unreachable.

The state vocabulary is part of the HTTP contract; values must remain
stable.
"""

from __future__ import annotations

import os
from enum import Enum
from typing import TYPE_CHECKING, Any, Dict, Iterable, List, Optional

if TYPE_CHECKING:  # pragma: no cover — type-only import
    from app.services.knowledge.adapter_registry import AdapterRegistry


class LifecycleState(str, Enum):
    """Normalized adapter lifecycle states (stable HTTP contract).

    Extended values (additive, do not remove):

    - ``SOFTWARE_RESOURCE`` — the source is distributed as a software package /
      library (e.g. NeuroMaps), not a queryable HTTP API. Catalogued for
      documentation; not federated by the live search endpoint.
    - ``REQUIRES_APPLICATION`` — restricted-access dataset that requires an
      external application / DUA / institutional approval (e.g. HCP, UK Biobank,
      OASIS, ABCD, EBRAINS, cNeuroMod). Catalogued but gated; ``enabled=False``
      and never auto-federated.
    - ``DEPRECATED`` — the source has been retired or migrated to a successor
      (e.g. OpenfMRI → OpenNeuro). Kept for provenance; ``enabled=False``.
    """

    CATALOGUED = "catalogued"
    REGISTERED = "registered"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DISABLED = "disabled"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"
    SOFTWARE_RESOURCE = "software_resource"
    REQUIRES_APPLICATION = "requires_application"
    DEPRECATED = "deprecated"


_OK_STATUS_VALUES = frozenset({"ok", "healthy", "up", "ready", "green", "operational"})
_DEGRADED_STATUS_VALUES = frozenset(
    {"degraded", "warn", "warning", "partial", "yellow", "stale"}
)
_DOWN_STATUS_VALUES = frozenset(
    {"down", "error", "fail", "failed", "unavailable", "red", "offline"}
)


# Env var name to mark adapter keys as DISABLED. Comma-separated list, e.g.:
#     DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS=gnomad,cochrane
# Disabled adapters are skipped at registry build time AND surfaced as
# DISABLED (not CATALOGUED) by lifecycle inspection so operators can tell
# "missing because we turned it off" from "missing because it failed to
# instantiate".
DISABLED_ADAPTERS_ENV = "DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS"


def read_disabled_adapter_keys(
    env: Optional[Dict[str, str]] = None,
) -> frozenset:
    """Return the set of adapter keys disabled via env var.

    ``env`` is injectable for tests. Empty / unset → empty set.
    """
    raw = (env or os.environ).get(DISABLED_ADAPTERS_ENV, "") or ""
    return frozenset(token.strip() for token in raw.split(",") if token.strip())


def derive_state_from_health(cached: Optional[Dict[str, Any]]) -> LifecycleState:
    """Map a cached health-check dict to a ``LifecycleState``.

    Pure function — no I/O. ``cached`` is whatever the registry stored from
    the adapter's ``health_check()`` (possibly an error sentinel).
    """
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
    """Compute per-adapter lifecycle state from registry + catalog metadata.

    Args:
        registry: Live ``AdapterRegistry`` to inspect (read-only).
        catalog_keys: Static catalog of expected adapter keys. Catalogued
            keys not present in the registry are surfaced as ``CATALOGUED``.
        disabled_keys: Keys explicitly disabled via config. They show up as
            ``DISABLED`` (instead of ``CATALOGUED``) when missing from the
            registry. A disabled key that is somehow ALSO registered is
            still reported by its health state — the disable flag controls
            labelling of *absent* adapters only.

    Returns:
        Mapping of adapter key → ``LifecycleState``. Read-only operation.
    """
    states: Dict[str, LifecycleState] = {}
    registered_names = set(registry.list_adapters())
    catalog_set = set(catalog_keys or ())
    disabled_set = set(disabled_keys or ())

    missing_keys = (catalog_set | disabled_set) - registered_names
    for key in missing_keys:
        if key in disabled_set:
            states[key] = LifecycleState.DISABLED
        else:
            states[key] = LifecycleState.CATALOGUED

    cached_health = registry.get_all_cached_health()
    for name in registered_names:
        cached = cached_health.get(name)
        if cached is None:
            states[name] = LifecycleState.REGISTERED
        else:
            states[name] = derive_state_from_health(cached)

    return states


def summarize_lifecycle(
    states: Dict[str, LifecycleState],
) -> Dict[str, Any]:
    """Aggregate a ``{key → state}`` mapping into a compact summary."""
    by_state: Dict[str, int] = {member.value: 0 for member in LifecycleState}
    for state in states.values():
        by_state[state.value] = by_state.get(state.value, 0) + 1
    return {
        "total": len(states),
        "by_state": by_state,
        "adapters": {key: state.value for key, state in states.items()},
    }


def peek_registry_lifecycle_summary() -> Dict[str, Any]:
    """Side-effect-free peek at the production registry lifecycle.

    Reads the bootstrap singleton without acquiring its async lock and
    never triggers adapter instantiation, ``connect()``, or live health
    checks. Safe to call from synchronous handlers like ``/health``.

    When the production registry has not been built yet (e.g., the first
    HTTP call to ``/api/v1/knowledge/live/*`` is still in flight on a
    cold container), every catalogued adapter is reported as ``CATALOGUED``
    and every disabled key as ``DISABLED``.
    """
    from app.services.knowledge import adapter_bootstrap as _bootstrap

    catalog_keys = list(_bootstrap.list_production_adapter_keys())
    disabled_keys = read_disabled_adapter_keys()

    registry = _bootstrap._registry  # singleton snapshot; None before build
    if registry is None:
        states: Dict[str, LifecycleState] = {}
        for key in catalog_keys:
            if key in disabled_keys:
                states[key] = LifecycleState.DISABLED
            else:
                states[key] = LifecycleState.CATALOGUED
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
