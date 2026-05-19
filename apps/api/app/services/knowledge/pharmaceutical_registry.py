"""Category 1 pharmaceutical registry and inventory helpers.

This module is intentionally separate from the canonical knowledge adapter
registry. It provides a category-scoped inventory for the 11 pharmaceutical
databases requested by the clinical utility brief, while keeping the broader
knowledge-layer wiring unchanged.
"""

from __future__ import annotations

import asyncio
import importlib
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional, Tuple, Type

from app.services.knowledge.adapter_registry import AdapterRegistry
from app.services.knowledge.base_adapter import DatabaseAdapter

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PharmaSpec:
    key: str
    display_name: str
    category: str
    access_type: str
    source_url: str
    clinical_utility: str
    api_key_required: bool
    enabled: bool
    registered: bool
    live_exposed: bool
    tier: str
    import_path: str = ""
    class_name: str = ""
    notes: str = ""


PHARMACEUTICAL_SPECS: tuple[PharmaSpec, ...] = (
    PharmaSpec(
        key="rxnorm",
        display_name="RxNorm",
        category="pharmaceutical",
        access_type="free",
        source_url="https://rxnav.nlm.nih.gov/REST/",
        clinical_utility="Drug name normalization and RxCUI lookup before neuromodulation screening.",
        api_key_required=False,
        enabled=True,
        registered=True,
        live_exposed=True,
        tier="P0",
        import_path="app.services.knowledge.adapters.rxnorm_adapter",
        class_name="RxNormAdapter",
    ),
    PharmaSpec(
        key="drugbank",
        display_name="DrugBank",
        category="pharmaceutical",
        access_type="free/paid",
        source_url="https://go.drugbank.com/",
        clinical_utility="Drug-target and interaction references for medication reconciliation and safety review.",
        api_key_required=True,
        enabled=True,
        registered=True,
        live_exposed=True,
        tier="P0",
        import_path="app.knowledge.drugbank_adapter",
        class_name="DrugBankAdapter",
        notes="Requires API key for full data. Public fallback remains decision-support only.",
    ),
    PharmaSpec(
        key="openfda",
        display_name="OpenFDA",
        category="pharmaceutical",
        access_type="free",
        source_url="https://api.fda.gov/",
        clinical_utility="Adverse events, labels, and recalls for medication safety monitoring.",
        api_key_required=False,
        enabled=True,
        registered=True,
        live_exposed=True,
        tier="P0",
        import_path="app.services.knowledge.adapters.openfda_adapter",
        class_name="OpenFDAAdapter",
    ),
    PharmaSpec(
        key="pubchem",
        display_name="PubChem",
        category="pharmaceutical",
        access_type="free",
        source_url="https://pubchem.ncbi.nlm.nih.gov/rest/pug/",
        clinical_utility="Chemical structure and identifier lookups for drug cross-reference workflows.",
        api_key_required=False,
        enabled=True,
        registered=True,
        live_exposed=True,
        tier="P0",
        import_path="app.knowledge.pubchem_adapter",
        class_name="PubChemAdapter",
    ),
    PharmaSpec(
        key="chembl",
        display_name="ChEMBL",
        category="pharmaceutical",
        access_type="free",
        source_url="https://www.ebi.ac.uk/chembl/api/data/",
        clinical_utility="Bioactivity and target data to contextualize drug mechanisms.",
        api_key_required=False,
        enabled=True,
        registered=True,
        live_exposed=True,
        tier="P0",
        import_path="app.knowledge.chembl_adapter",
        class_name="ChEMBLAdapter",
    ),
    PharmaSpec(
        key="dailymed",
        display_name="DailyMed",
        category="pharmaceutical",
        access_type="free",
        source_url="https://dailymed.nlm.nih.gov/dailymed/",
        clinical_utility="Labeling and contraindication references for clinician review.",
        api_key_required=False,
        enabled=False,
        registered=False,
        live_exposed=False,
        tier="P1",
        import_path="app.knowledge.dailymed_adapter",
        class_name="DailyMedAdapter",
        notes="Listed for inventory completeness; disabled until verification is complete.",
    ),
    PharmaSpec(
        key="orange_book",
        display_name="Orange Book",
        category="pharmaceutical",
        access_type="free",
        source_url="https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files",
        clinical_utility="Therapeutic equivalence and product identification for medication review.",
        api_key_required=False,
        enabled=False,
        registered=False,
        live_exposed=False,
        tier="P1",
        notes="Listed for inventory completeness; disabled until verification is complete.",
    ),
    PharmaSpec(
        key="ndc_directory",
        display_name="NDC Directory",
        category="pharmaceutical",
        access_type="free",
        source_url="https://www.accessdata.fda.gov/cder/ndc/",
        clinical_utility="National Drug Code lookup for package-level prescription validation.",
        api_key_required=False,
        enabled=False,
        registered=False,
        live_exposed=False,
        tier="P1",
        notes="Listed for inventory completeness; disabled until verification is complete.",
    ),
    PharmaSpec(
        key="unii",
        display_name="UNII",
        category="pharmaceutical",
        access_type="free",
        source_url="https://fdasis.nlm.nih.gov/srs/",
        clinical_utility="Substance identifier normalization for ingredient-level matching.",
        api_key_required=False,
        enabled=False,
        registered=False,
        live_exposed=False,
        tier="P1",
        notes="Listed for inventory completeness; disabled until verification is complete.",
    ),
    PharmaSpec(
        key="pharmgkb",
        display_name="PharmGKB",
        category="pharmaceutical",
        access_type="free",
        source_url="https://www.pharmgkb.org/",
        clinical_utility="Pharmacogenomic annotations for medication review and genotype-aware screening.",
        api_key_required=False,
        enabled=False,
        registered=False,
        live_exposed=False,
        tier="P0",
        import_path="app.knowledge.pharmgkb_adapter",
        class_name="PharmGKBAdapter",
        notes="Listed for inventory completeness; disabled until verification is complete.",
    ),
    PharmaSpec(
        key="aeolus",
        display_name="AEOLUS",
        category="pharmaceutical",
        access_type="research",
        source_url="https://datadryad.org/stash/dataset/doi:10.5061/dryad.8q0s4",
        clinical_utility="Standardized FAERS-derived adverse-event evidence for research-only review.",
        api_key_required=False,
        enabled=False,
        registered=False,
        live_exposed=False,
        tier="P1",
        notes="Listed for inventory completeness; disabled until verification is complete.",
    ),
)

_SPECS_BY_KEY: Dict[str, PharmaSpec] = {spec.key: spec for spec in PHARMACEUTICAL_SPECS}
_CONNECTED_KEYS: Tuple[str, ...] = tuple(spec.key for spec in PHARMACEUTICAL_SPECS if spec.enabled and spec.registered)
_LOCK = asyncio.Lock()
_REGISTRY: Optional[AdapterRegistry] = None


def list_pharmaceutical_keys() -> Tuple[str, ...]:
    return tuple(spec.key for spec in PHARMACEUTICAL_SPECS)


def list_connected_pharmaceutical_keys() -> Tuple[str, ...]:
    return _CONNECTED_KEYS


def list_disabled_pharmaceutical_keys() -> Tuple[str, ...]:
    return tuple(spec.key for spec in PHARMACEUTICAL_SPECS if not spec.enabled)


def get_pharmaceutical_spec(key: str) -> Optional[PharmaSpec]:
    return _SPECS_BY_KEY.get(key)


def _resolve_adapter_class(spec: PharmaSpec) -> Type[DatabaseAdapter]:
    if not spec.import_path or not spec.class_name:
        raise ImportError(f"{spec.key} is inventory-only and has no import path")
    module = importlib.import_module(spec.import_path)
    adapter_cls = getattr(module, spec.class_name)
    if not issubclass(adapter_cls, DatabaseAdapter):
        raise TypeError(
            f"{spec.key} resolved to non-DatabaseAdapter class {adapter_cls!r}"
        )
    return adapter_cls


def _build_config(spec: PharmaSpec, overrides: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, Any]:
    config = dict((overrides or {}).get(spec.key, {}))
    if spec.key == "drugbank" and "api_key" not in config:
        env_key = os.environ.get("DRUGBANK_API_KEY", "").strip()
        if env_key:
            config["api_key"] = env_key
    return config


def build_pharmaceutical_registry(
    *,
    overrides: Optional[Dict[str, Dict[str, Any]]] = None,
) -> AdapterRegistry:
    overrides = overrides or {}
    registry = AdapterRegistry()
    for spec in PHARMACEUTICAL_SPECS:
        if not (spec.enabled and spec.registered):
            continue
        adapter_cls = _resolve_adapter_class(spec)
        adapter = adapter_cls(_build_config(spec, overrides))
        if not hasattr(adapter, "_version"):
            version = getattr(adapter, "version", None)
            setattr(adapter, "_version", str(version or "live"))
        registry.register(spec.key, adapter, tier=spec.tier)
    return registry


async def get_pharmaceutical_registry() -> AdapterRegistry:
    global _REGISTRY
    if _REGISTRY is not None:
        return _REGISTRY
    async with _LOCK:
        if _REGISTRY is None:
            _REGISTRY = build_pharmaceutical_registry()
    return _REGISTRY


async def reset_pharmaceutical_registry() -> None:
    global _REGISTRY
    async with _LOCK:
        if _REGISTRY is not None:
            try:
                await _REGISTRY.shutdown_all()
            except Exception:  # pragma: no cover - best effort teardown
                logger.debug("pharmaceutical registry shutdown_all raised", exc_info=True)
            _REGISTRY = None


def build_pharmaceutical_inventory(
    *,
    registry: Optional[AdapterRegistry] = None,
) -> list[Dict[str, Any]]:
    info = registry.get_all_info() if registry is not None else {}
    rows: list[Dict[str, Any]] = []
    for spec in PHARMACEUTICAL_SPECS:
        adapter = registry.get(spec.key) if registry is not None else None
        connected = bool(adapter and getattr(adapter, "is_connected", False))
        api_key_configured = bool(getattr(adapter, "api_key", None))
        if not spec.enabled:
            lifecycle_state = "disabled"
            status = "disabled"
        elif spec.api_key_required and not api_key_configured:
            lifecycle_state = "degraded"
            status = "degraded"
        elif connected:
            lifecycle_state = "healthy"
            status = "healthy"
        elif spec.registered:
            lifecycle_state = "registered"
            status = "registered"
        else:
            lifecycle_state = "unavailable"
            status = "unavailable"

        license_type = ""
        if adapter is not None:
            try:
                license_meta = adapter.get_license()
                license_type = str(getattr(license_meta, "license_type", ""))
            except Exception:  # pragma: no cover - best effort metadata
                logger.debug("license lookup failed for %s", spec.key, exc_info=True)

        rows.append(
            {
                "key": spec.key,
                "display_name": spec.display_name,
                "category": spec.category,
                "access_type": spec.access_type,
                "source_url": spec.source_url,
                "clinical_utility": spec.clinical_utility,
                "api_key_required": spec.api_key_required,
                "enabled": spec.enabled,
                "registered": spec.registered,
                "live_exposed": spec.live_exposed,
                "tier": spec.tier,
                "status": status,
                "lifecycle_state": lifecycle_state,
                "connected": connected,
                "api_key_configured": api_key_configured,
                "source_version": str(info.get(spec.key, {}).get("source_version", "")),
                "license_type": license_type,
                "notes": spec.notes,
            }
        )
    return rows


__all__ = [
    "PHARMACEUTICAL_SPECS",
    "PharmaSpec",
    "build_pharmaceutical_inventory",
    "build_pharmaceutical_registry",
    "get_pharmaceutical_registry",
    "get_pharmaceutical_spec",
    "list_connected_pharmaceutical_keys",
    "list_disabled_pharmaceutical_keys",
    "list_pharmaceutical_keys",
    "reset_pharmaceutical_registry",
]
