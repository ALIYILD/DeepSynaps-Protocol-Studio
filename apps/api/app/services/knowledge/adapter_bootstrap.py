"""
Production adapter-registry bootstrap.

Instantiates the production knowledge adapters and registers them with the
canonical ``AdapterRegistry`` from ``app.services.knowledge.adapter_registry``.

This module is the single integration point that turns standalone adapter
class files (``apps/api/app/services/knowledge/adapters/<name>_adapter.py``)
into a working, queryable registry exposed via the HTTP layer.

It is intentionally separate from:
- The FastAPI ``lifespan`` in ``app/main.py`` — that file is concurrent-edit
  hot and we don't want this wiring to fight other sessions there.
- ``app/lifespan_wiring.py`` — a generic wiring module, but adding to it
  would couple knowledge-layer concerns to a broader scope.

Singleton pattern with async lock allows lazy init on first HTTP call,
which is what the new live router uses. The optional ``initialize_all()``
call performs upstream health pings and is skipped by default to keep
startup fast and to allow offline / test environments.

The manifest at ``adapter_manifest.py`` is the declarative source of truth
for which adapters ship in production. To add a new adapter:

    1. Implement it at ``apps/api/app/services/knowledge/adapters/<name>_adapter.py``.
    2. Add one row to ``ADAPTER_MANIFEST``.
    3. Update ``docs/engineering/knowledge-adapter-roadmap.md``.
"""

from __future__ import annotations

import asyncio
import importlib
import logging
from typing import Any, Dict, Optional, Tuple, Type

from app.services.knowledge.adapter_registry import AdapterRegistry
from app.services.knowledge.adapter_manifest import (
    get_manifest_entry,
    get_registered_manifest_keys,
)
from app.services.knowledge.lifecycle import read_disabled_adapter_keys
from app.services.knowledge.base_adapter import DatabaseAdapter

logger = logging.getLogger(__name__)


def _resolve_adapter_class(key: str) -> Type[DatabaseAdapter]:
    entry = get_manifest_entry(key)
    if entry is None:
        raise KeyError(f"Adapter manifest entry not found for {key!r}")

    import_path = str(entry.get("import_path", "")).strip()
    class_name = str(entry.get("class_name", "")).strip()
    if not import_path or not class_name:
        raise ImportError(f"Adapter {key!r} is missing import metadata in the manifest")

    module = importlib.import_module(import_path)
    adapter_cls = getattr(module, class_name)
    if not issubclass(adapter_cls, DatabaseAdapter):
        raise TypeError(
            f"Manifest class for {key!r} is not a DatabaseAdapter: {adapter_cls!r}"
        )
    return adapter_cls


def _build_adapter_catalog() -> Dict[str, Tuple[Type[DatabaseAdapter], str, Dict[str, Any]]]:
    catalog: Dict[str, Tuple[Type[DatabaseAdapter], str, Dict[str, Any]]] = {}
    for key in get_registered_manifest_keys():
        entry = get_manifest_entry(key)
        if entry is None:
            continue
        catalog[key] = (_resolve_adapter_class(key), str(entry.get("tier", "P1")), {})
    return catalog


_ADAPTER_CATALOG: Dict[str, Tuple[Type[DatabaseAdapter], str, Dict[str, Any]]] = _build_adapter_catalog()


def list_production_adapter_keys() -> Tuple[str, ...]:
    """Public read-only view of manifest-approved bootstrap keys."""
    return tuple(_ADAPTER_CATALOG.keys())


def list_disabled_adapter_keys() -> Tuple[str, ...]:
    """Return adapter keys disabled via environment configuration."""
    return tuple(sorted(read_disabled_adapter_keys()))


def build_production_registry(
    *,
    overrides: Optional[Dict[str, Dict[str, Any]]] = None,
) -> AdapterRegistry:
    """Instantiate and register every catalogued production adapter.

    Args:
        overrides: Optional ``{adapter_key: extra_config_dict}`` mapping that
            is merged on top of the default catalog config. Useful for tests
            and for environment-specific knobs (api_key, base_url overrides).

    Returns:
        A new ``AdapterRegistry`` with all catalogued adapters registered.
        Adapters that fail to instantiate are logged and skipped rather
        than aborting the whole registry; missing adapters will simply
        return ``None`` from ``registry.get(key)``.
    """
    overrides = overrides or {}
    disabled = read_disabled_adapter_keys()
    registry = AdapterRegistry()
    for key, (cls, tier, default_config) in _ADAPTER_CATALOG.items():
        if key in disabled:
            logger.info(
                "Skipping knowledge adapter %r — disabled via %s.",
                key,
                "DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS",
            )
            continue
        config = {**default_config, **overrides.get(key, {})}
        try:
            adapter = cls(config)
            registry.register(key, adapter, tier=tier)
            logger.info(
                "Registered knowledge adapter %r → %s (tier=%s)",
                key,
                cls.__name__,
                tier,
            )
        except Exception as exc:
            logger.warning(
                "Failed to register knowledge adapter %r (%s): %s",
                key,
                cls.__name__,
                exc,
                exc_info=False,
            )
    return registry


# ---------------------------------------------------------------------------
# Singleton accessor — lazy init, async-safe
# ---------------------------------------------------------------------------

_registry: Optional[AdapterRegistry] = None
_lock: asyncio.Lock = asyncio.Lock()


async def get_production_registry() -> AdapterRegistry:
    """Return the process-wide production registry, initialising on first call.

    Safe to call concurrently from many HTTP handlers — the async lock
    ensures the build happens exactly once.
    """
    global _registry
    if _registry is not None:
        return _registry
    async with _lock:
        if _registry is None:
            _registry = build_production_registry()
    return _registry


async def reset_production_registry() -> None:
    """Drop the cached registry and disconnect any live adapter sessions.

    Tests should call this in fixture teardown. Production code should not
    call this — there is no use case for shutting the registry down without
    also shutting the process down.
    """
    global _registry
    async with _lock:
        if _registry is not None:
            try:
                await _registry.shutdown_all()
            except Exception as exc:  # noqa: BLE001 — best-effort teardown
                logger.warning("registry shutdown_all raised %s", exc)
            _registry = None
