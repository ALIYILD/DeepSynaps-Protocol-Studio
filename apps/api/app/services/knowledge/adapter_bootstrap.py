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
from app.services.knowledge.lifecycle import (
    AdapterStage,
    get_ledger,
    read_disabled_adapter_keys,
    record_stage,
)
from app.services.knowledge.adapters.abide_adapter import ABIDEAdapter
from app.services.knowledge.adapters.acp_journal_club_adapter import (
    ACPJournalClubAdapter,
)
from app.services.knowledge.adapters.adni_adapter import ADNIAdapter
from app.services.knowledge.adapters.allen_brain_adapter import AllenBrainAdapter
from app.services.knowledge.adapters.chbmp_adapter import CHBMPAdapter
from app.services.knowledge.adapters.clinicaltrials_adapter import (
    ClinicalTrialsAdapter,
)
from app.services.knowledge.adapters.clinvar_adapter import ClinVarAdapter
from app.services.knowledge.adapters.cochrane_adapter import CochraneAdapter
from app.services.knowledge.adapters.crossref_adapter import CrossRefAdapter
from app.services.knowledge.adapters.dynamed_adapter import DynaMedAdapter
from app.services.knowledge.adapters.epistemonikos_adapter import (
    EpistemonikosAdapter,
)
from app.services.knowledge.adapters.eudract_adapter import EudraCTAdapter
from app.services.knowledge.adapters.europepmc_adapter import EuropePMCAdapter
from app.services.knowledge.adapters.faers_adapter import FAERSAdapter
from app.services.knowledge.adapters.gnomad_adapter import GnomadAdapter
from app.services.knowledge.adapters.icd10_adapter import ICD10Adapter
from app.services.knowledge.adapters.loinc_adapter import LOINCAdapter
from app.services.knowledge.adapters.mesh_adapter import MeSHAdapter
from app.services.knowledge.adapters.mni_atlas_adapter import MNIAtlasAdapter
from app.services.knowledge.adapters.neurosynth_adapter import NeurosynthAdapter
from app.services.knowledge.adapters.nice_adapter import NICEAdapter
from app.services.knowledge.adapters.ols_adapter import OLSAdapter
from app.services.knowledge.adapters.onsides_adapter import OnSIDESAdapter
from app.services.knowledge.adapters.openalex_adapter import OpenAlexAdapter
from app.services.knowledge.adapters.openfda_adapter import OpenFDAAdapter
from app.services.knowledge.adapters.pharmgkb_adapter import PharmGKBAdapter
from app.services.knowledge.adapters.promis_adapter import PROMISAdapter
from app.services.knowledge.adapters.pubmed_adapter import PubMedAdapter
from app.services.knowledge.adapters.pubmed_central_adapter import (
    PubMedCentralAdapter,
)
from app.services.knowledge.adapters.rxnorm_adapter import RxNormAdapter
from app.services.knowledge.adapters.schaefer_adapter import SchaeferAdapter
from app.services.knowledge.adapters.simnibs_adapter import SimNIBSAdapter
from app.services.knowledge.adapters.snomedct_adapter import SNOMEDCTAdapter
from app.services.knowledge.adapters.trip_database_adapter import (
    TripDatabaseAdapter,
)
from app.services.knowledge.adapters.umls_adapter import UMLSAdapter
from app.services.knowledge.base_adapter import DatabaseAdapter

logger = logging.getLogger(__name__)


# Declarative catalog. Each entry: registry-key → (class, tier, config).
# Keep keys URL-safe and stable; clients depend on them.
_ADAPTER_CATALOG: Dict[str, Tuple[Type[DatabaseAdapter], str, Dict[str, Any]]] = {
    "rxnorm":           (RxNormAdapter,           "P0", {}),
    "pharmgkb":         (PharmGKBAdapter,         "P0", {}),
    "clinvar":          (ClinVarAdapter,          "P0", {}),
    "loinc":            (LOINCAdapter,            "P0", {}),
    "openfda":          (OpenFDAAdapter,          "P0", {}),
    "chbmp":            (CHBMPAdapter,            "P0", {}),
    "mni_atlas":        (MNIAtlasAdapter,         "P0", {}),
    "promis":           (PROMISAdapter,           "P0", {}),
    "simnibs":          (SimNIBSAdapter,          "P0", {}),
    "faers":            (FAERSAdapter,            "P1", {}),
    "onsides":          (OnSIDESAdapter,          "P1", {}),
    "allen_brain":      (AllenBrainAdapter,       "P1", {}),
    "schaefer":         (SchaeferAdapter,         "P1", {}),
    "neurosynth":       (NeurosynthAdapter,       "P1", {}),
    "adni":             (ADNIAdapter,             "P1", {}),
    "abide":            (ABIDEAdapter,            "P1", {}),
    "pubmed":           (PubMedAdapter,           "P0", {}),
    "ctgov":            (ClinicalTrialsAdapter,   "P0", {}),
    "cochrane":         (CochraneAdapter,         "P0", {}),
    "europepmc":        (EuropePMCAdapter,        "P1", {}),
    "gnomad":           (GnomadAdapter,           "P1", {}),
    "openalex":         (OpenAlexAdapter,         "P1", {}),
    # ── Category 8: Diagnosis Coding ─────────────────────────────────────────
    # Terminology adapters used by /api/v1/diagnosis/* for normalization,
    # literature-search expansion, and eligibility-context. UMLS is
    # license-gated and remains DEGRADED until UMLS_API_KEY is set.
    "icd10":            (ICD10Adapter,            "P0", {}),
    "snomedct":         (SNOMEDCTAdapter,         "P0", {}),
    "mesh":             (MeSHAdapter,             "P0", {}),
    "ols":              (OLSAdapter,              "P0", {}),
    "umls":             (UMLSAdapter,             "P1", {}),
    # ── Category 3: Clinical Evidence (Slice A — catalogued only) ────────────
    # Live network adapters land in Slice B (PRs #1074 CrossRef, #1092 PMC).
    # These entries make every Cat-3 source visible to the registry so the
    # HTTP layer can report honest lifecycle state.
    "pubmed_central":   (PubMedCentralAdapter,    "P1", {}),
    "nice":             (NICEAdapter,             "P1", {}),
    "trip":             (TripDatabaseAdapter,     "P2", {}),
    "epistemonikos":    (EpistemonikosAdapter,    "P2", {}),
    "crossref":         (CrossRefAdapter,         "P1", {}),
    "eudract":          (EudraCTAdapter,          "P1", {}),
    "acp_journal_club": (ACPJournalClubAdapter,   "P2", {}),
    "dynamed":          (DynaMedAdapter,          "P2", {}),
}


def list_production_adapter_keys() -> Tuple[str, ...]:
    """Public read-only view of the catalog keys, in declaration order."""
    return tuple(_ADAPTER_CATALOG.keys())


def list_disabled_adapter_keys() -> Tuple[str, ...]:
    """Adapter keys explicitly disabled via ``DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS``.

    Lives in :mod:`app.services.knowledge.lifecycle` so it stays close to the
    state derivation that consumes it; re-exported here for convenience.
    """
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
    import time

    overrides = overrides or {}
    disabled = read_disabled_adapter_keys()
    registry = AdapterRegistry()
    ledger = get_ledger()
    # Fresh build → fresh ledger. Tests that monkeypatch _registry and
    # invoke this function repeatedly rely on a clean slate.
    ledger.reset()

    for key, (cls, tier, default_config) in _ADAPTER_CATALOG.items():
        # Stage 1: DECLARED — catalog entry exists, before we touch anything.
        record_stage(key, AdapterStage.DECLARED)

        if key in disabled:
            logger.info(
                "Skipping knowledge adapter %r — disabled via %s.",
                key,
                "DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS",
            )
            record_stage(
                key,
                AdapterStage.DISABLED,
                previous_stage=AdapterStage.DECLARED,
            )
            continue

        # Stage 2: IMPORTED — class object is reachable from this scope,
        # so the import already happened cleanly at module-load time. We
        # still record IMPORTED for ledger completeness so consumers see
        # every progression stage.
        record_stage(key, AdapterStage.IMPORTED, previous_stage=AdapterStage.DECLARED)

        config = {**default_config, **overrides.get(key, {})}

        # Stage 3: INSTANTIATED — call the class constructor.
        t0 = time.monotonic()
        try:
            adapter = cls(config)
        except Exception as exc:
            duration = (time.monotonic() - t0) * 1000
            logger.warning(
                "Adapter %r failed to instantiate (%s): %s",
                key,
                cls.__name__,
                exc,
            )
            record_stage(
                key,
                AdapterStage.FAILED_INIT,
                previous_stage=AdapterStage.IMPORTED,
                duration_ms=round(duration, 3),
                error=exc,
            )
            continue
        record_stage(
            key,
            AdapterStage.INSTANTIATED,
            previous_stage=AdapterStage.IMPORTED,
            duration_ms=round((time.monotonic() - t0) * 1000, 3),
        )

        # Stage 4: VALIDATED — Phase 2 will call `adapter.validate_contract()`
        # here. Until that lands, we pass-through unconditionally so the
        # state machine is well-formed and downstream consumers can rely
        # on a VALIDATED transition existing for every healthy adapter.
        record_stage(
            key,
            AdapterStage.VALIDATED,
            previous_stage=AdapterStage.INSTANTIATED,
        )

        # Stage 5: METADATA_RESOLVED — touch the metadata fields that
        # AdapterRegistry.register() reads. This is where the pre-fix
        # bug with `_version`-missing adapters surfaces (silent
        # `AttributeError` half-registered them). Now those failures
        # land as FAILED_METADATA in the ledger with a traceback.
        try:
            source_version = adapter.source_version
            _ = adapter.source_name
            _ = adapter.get_license()
        except Exception as exc:
            logger.warning(
                "Adapter %r failed metadata resolution (%s): %s",
                key,
                cls.__name__,
                exc,
            )
            record_stage(
                key,
                AdapterStage.FAILED_METADATA,
                previous_stage=AdapterStage.VALIDATED,
                error=exc,
            )
            continue
        record_stage(
            key,
            AdapterStage.METADATA_RESOLVED,
            previous_stage=AdapterStage.VALIDATED,
            adapter_version=str(source_version),
        )

        # Stage 6: REGISTERED — actually add to the registry. This is
        # where the inheritance-failure bug (FAERS/OnSIDES pre-#1054)
        # surfaced as TypeError from the isinstance check. Now those
        # failures land as FAILED_VALIDATION (the registry uses
        # isinstance as its contract validator).
        try:
            registry.register(key, adapter, tier=tier)
        except TypeError as exc:
            # AdapterRegistry.register raises TypeError when the
            # adapter is not a DatabaseAdapter subclass.
            logger.warning(
                "Adapter %r failed registry contract (%s): %s",
                key,
                cls.__name__,
                exc,
            )
            record_stage(
                key,
                AdapterStage.FAILED_VALIDATION,
                previous_stage=AdapterStage.METADATA_RESOLVED,
                error=exc,
                adapter_version=str(source_version),
            )
            continue
        except Exception as exc:
            logger.warning(
                "Adapter %r failed registry insertion (%s): %s",
                key,
                cls.__name__,
                exc,
            )
            record_stage(
                key,
                AdapterStage.FAILED_METADATA,
                previous_stage=AdapterStage.METADATA_RESOLVED,
                error=exc,
                adapter_version=str(source_version),
            )
            continue
        record_stage(
            key,
            AdapterStage.REGISTERED,
            previous_stage=AdapterStage.METADATA_RESOLVED,
            adapter_version=str(source_version),
        )
        logger.info(
            "Registered knowledge adapter %r → %s (tier=%s, version=%s)",
            key,
            cls.__name__,
            tier,
            source_version,
        )
        # HEALTHY is a deferred terminal stage — set only after a live
        # health_check() returns OK, which happens lazily on first
        # /health/{key} call, not at bootstrap. Keeps cold-start fast.

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
