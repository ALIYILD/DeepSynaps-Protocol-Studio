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

The catalog at ``_ADAPTER_CATALOG`` is the **declarative source of truth**
for which adapters ship in production. To add a new adapter:

    1. Implement it at ``apps/api/app/services/knowledge/adapters/<name>_adapter.py``.
    2. Add one row to ``_ADAPTER_CATALOG`` below.
    3. Update ``docs/engineering/knowledge-adapter-roadmap.md``.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional, Tuple, Type

from app.services.knowledge.adapter_registry import AdapterRegistry
from app.services.knowledge.adapters.abide_adapter import ABIDEAdapter
from app.services.knowledge.adapters.adni_adapter import ADNIAdapter
from app.services.knowledge.adapters.allen_brain_adapter import AllenBrainAdapter
from app.services.knowledge.adapters.chbmp_adapter import CHBMPAdapter
from app.services.knowledge.adapters.clinicaltrials_adapter import (
    ClinicalTrialsAdapter,
)
from app.services.knowledge.adapters.clinvar_adapter import ClinVarAdapter
from app.services.knowledge.adapters.cochrane_adapter import CochraneAdapter
from app.services.knowledge.adapters.europepmc_adapter import EuropePMCAdapter
from app.services.knowledge.adapters.faers_adapter import FAERSAdapter
from app.services.knowledge.adapters.gnomad_adapter import GnomadAdapter
from app.services.knowledge.adapters.loinc_adapter import LOINCAdapter
from app.services.knowledge.adapters.mni_atlas_adapter import MNIAtlasAdapter
from app.services.knowledge.adapters.neurosynth_adapter import NeurosynthAdapter
from app.services.knowledge.adapters.onsides_adapter import OnSIDESAdapter
from app.services.knowledge.adapters.openfda_adapter import OpenFDAAdapter
from app.services.knowledge.adapters.pharmgkb_adapter import PharmGKBAdapter
from app.services.knowledge.adapters.promis_adapter import PROMISAdapter
from app.services.knowledge.adapters.pubmed_adapter import PubMedAdapter
from app.services.knowledge.adapters.rxnorm_adapter import RxNormAdapter
from app.services.knowledge.adapters.schaefer_adapter import SchaeferAdapter
from app.services.knowledge.adapters.simnibs_adapter import SimNIBSAdapter
from app.services.knowledge.adapters.openalex_adapter import OpenAlexAdapter
from app.services.knowledge.base_adapter import DatabaseAdapter

logger = logging.getLogger(__name__)


# Declarative catalog. Each entry: registry-key → (class, tier, config).
# Keep keys URL-safe and stable; clients depend on them.
_ADAPTER_CATALOG: Dict[str, Tuple[Type[DatabaseAdapter], str, Dict[str, Any]]] = {
    "rxnorm":       (RxNormAdapter,         "P0", {}),
    "pharmgkb":     (PharmGKBAdapter,       "P0", {}),
    "clinvar":      (ClinVarAdapter,        "P0", {}),
    "loinc":        (LOINCAdapter,          "P0", {}),
    "openfda":      (OpenFDAAdapter,        "P0", {}),
    "chbmp":        (CHBMPAdapter,          "P0", {}),
    "mni_atlas":    (MNIAtlasAdapter,       "P0", {}),
    "promis":       (PROMISAdapter,         "P0", {}),
    "simnibs":      (SimNIBSAdapter,        "P0", {}),
    "faers":        (FAERSAdapter,          "P1", {}),
    "onsides":      (OnSIDESAdapter,        "P1", {}),
    "allen_brain":  (AllenBrainAdapter,     "P1", {}),
    "schaefer":     (SchaeferAdapter,       "P1", {}),
    "neurosynth":   (NeurosynthAdapter,     "P1", {}),
    "adni":         (ADNIAdapter,           "P1", {}),
    "abide":        (ABIDEAdapter,          "P1", {}),
    "pubmed":       (PubMedAdapter,         "P0", {}),
    "ctgov":        (ClinicalTrialsAdapter, "P0", {}),
    "cochrane":     (CochraneAdapter,       "P0", {}),
    "europepmc":    (EuropePMCAdapter,      "P1", {}),
    "gnomad":       (GnomadAdapter,         "P1", {}),
    "openalex":     (OpenAlexAdapter,       "P0", {}),
}


def list_production_adapter_keys() -> Tuple[str, ...]:
    """Public read-only view of the catalog keys, in declaration order."""
    return tuple(_ADAPTER_CATALOG.keys())


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
    registry = AdapterRegistry()
    for key, (cls, tier, default_config) in _ADAPTER_CATALOG.items():
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
