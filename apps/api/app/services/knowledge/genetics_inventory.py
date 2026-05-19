"""Category 2 genetics inventory and lazy registry helpers.

This module keeps the genetics surface separate from the main production
knowledge registry so the Category 2 work can be represented honestly:

- 8 adapters are backed by real adapter classes in this repo
- 6 adapters are catalogued but disabled because no canonical adapter exists

The router layer uses this module to expose lifecycle state, query what is
available, and degrade cleanly when a source is missing or unavailable.
"""

from __future__ import annotations

import importlib
import os
from dataclasses import dataclass
from threading import Lock
from typing import Any, Callable, Dict, Iterable, List, Optional

from app.services.knowledge.lifecycle import LifecycleState


@dataclass(frozen=True)
class GeneticSourceSpec:
    key: str
    display_name: str
    access_type: str
    source_url: str
    clinical_utility_summary: str
    category: str = "genetic"
    api_key_required: bool = False
    implemented: bool = False
    enabled: bool = True
    source_version_hint: str = "unknown"
    import_path: str = ""
    class_name: str = ""
    access_note: str = ""


def _spec(
    *,
    key: str,
    display_name: str,
    access_type: str,
    source_url: str,
    clinical_utility_summary: str,
    api_key_required: bool = False,
    implemented: bool = False,
    enabled: bool = True,
    source_version_hint: str = "unknown",
    import_path: str = "",
    class_name: str = "",
    access_note: str = "",
) -> GeneticSourceSpec:
    return GeneticSourceSpec(
        key=key,
        display_name=display_name,
        access_type=access_type,
        source_url=source_url,
        clinical_utility_summary=clinical_utility_summary,
        api_key_required=api_key_required,
        implemented=implemented,
        enabled=enabled,
        source_version_hint=source_version_hint,
        import_path=import_path,
        class_name=class_name,
        access_note=access_note,
    )


_SERVICE = "app.services.knowledge.adapters"
_LEGACY = "app.knowledge"

GENETIC_SOURCES: Dict[str, GeneticSourceSpec] = {
    "dbsnp": _spec(
        key="dbsnp",
        display_name="dbSNP",
        access_type="open",
        source_url="https://eutils.ncbi.nlm.nih.gov/entrez/eutils/",
        clinical_utility_summary="Variant lookup and genomic coordinates for rsIDs relevant to decision-support.",
        implemented=True,
        source_version_hint="2024-06",
        import_path=f"{_LEGACY}.dbsnp_adapter",
        class_name="DbsnpAdapter",
    ),
    "clinvar": _spec(
        key="clinvar",
        display_name="ClinVar",
        access_type="open",
        source_url="https://www.ncbi.nlm.nih.gov/clinvar/",
        clinical_utility_summary="Clinical significance and review status for human variants.",
        implemented=True,
        source_version_hint="2024-06",
        import_path=f"{_SERVICE}.clinvar_adapter",
        class_name="ClinVarAdapter",
    ),
    "gwas_catalog": _spec(
        key="gwas_catalog",
        display_name="GWAS Catalog",
        access_type="open",
        source_url="https://www.ebi.ac.uk/gwas/rest/api/",
        clinical_utility_summary="Population-level trait associations that may be relevant to phenotype context.",
        implemented=True,
        source_version_hint="2024-06",
        import_path=f"{_LEGACY}.gwas_catalog_adapter",
        class_name="GwasCatalogAdapter",
    ),
    "ensembl": _spec(
        key="ensembl",
        display_name="Ensembl",
        access_type="open",
        source_url="https://rest.ensembl.org/",
        clinical_utility_summary="Gene and variant annotations, transcript context, and consequence terms.",
        implemented=True,
        source_version_hint="e112",
        import_path=f"{_LEGACY}.ensembl_adapter",
        class_name="EnsemblAdapter",
    ),
    "uniprot": _spec(
        key="uniprot",
        display_name="UniProt",
        access_type="open",
        source_url="https://rest.uniprot.org/",
        clinical_utility_summary="Protein function and pathway context for target-level interpretation.",
        implemented=True,
        source_version_hint="2024-06",
        import_path=f"{_LEGACY}.uniprot_adapter",
        class_name="UniprotAdapter",
    ),
    "disgenet": _spec(
        key="disgenet",
        display_name="DisGeNET",
        access_type="freemium",
        source_url="https://www.disgenet.org/",
        clinical_utility_summary="Gene-disease associations for context; currently catalogued but disabled.",
        api_key_required=True,
        implemented=False,
        enabled=False,
        access_note="No canonical adapter present in this repo.",
    ),
    "opentargets": _spec(
        key="opentargets",
        display_name="Open Targets",
        access_type="open",
        source_url="https://platform-api.opentargets.io/",
        clinical_utility_summary="Target-disease evidence for context; currently catalogued but disabled.",
        implemented=False,
        enabled=False,
        access_note="No canonical adapter present in this repo.",
    ),
    "string": _spec(
        key="string",
        display_name="STRING",
        access_type="open",
        source_url="https://string-db.org/api/",
        clinical_utility_summary="Protein-protein interaction context for pathway-level interpretation.",
        implemented=True,
        source_version_hint="v12",
        import_path=f"{_LEGACY}.string_adapter",
        class_name="StringAdapter",
    ),
    "biogrid": _spec(
        key="biogrid",
        display_name="BioGRID",
        access_type="open",
        source_url="https://webservice.thebiogrid.org/",
        clinical_utility_summary="Protein and genetic interaction context; currently catalogued but disabled.",
        implemented=False,
        enabled=False,
        access_note="No canonical adapter present in this repo.",
    ),
    "reactome": _spec(
        key="reactome",
        display_name="Reactome",
        access_type="open",
        source_url="https://reactome.org/ContentService/",
        clinical_utility_summary="Pathway context for mechanism-level interpretation; currently catalogued but disabled.",
        implemented=False,
        enabled=False,
        access_note="No canonical adapter present in this repo.",
    ),
    "kegg": _spec(
        key="kegg",
        display_name="KEGG",
        access_type="open",
        source_url="https://rest.kegg.jp/",
        clinical_utility_summary="Pathway maps for neurotransmitter and signalling context; currently catalogued but disabled.",
        implemented=False,
        enabled=False,
        access_note="No canonical adapter present in this repo.",
    ),
    "omim": _spec(
        key="omim",
        display_name="OMIM",
        access_type="licensed",
        source_url="https://api.omim.org/api/",
        clinical_utility_summary="Mendelian disease context and phenotype overlap; currently catalogued but disabled.",
        api_key_required=True,
        implemented=False,
        enabled=False,
        access_note="No canonical adapter present in this repo.",
    ),
    "gnomad": _spec(
        key="gnomad",
        display_name="gnomAD",
        access_type="open",
        source_url="https://gnomad.broadinstitute.org/api/",
        clinical_utility_summary="Population allele frequencies for population-level interpretation only.",
        implemented=True,
        source_version_hint="gnomad_r4/GRCh38",
        import_path=f"{_SERVICE}.gnomad_adapter",
        class_name="GnomadAdapter",
    ),
    "myvariant": _spec(
        key="myvariant",
        display_name="MyVariant.info",
        access_type="open",
        source_url="https://myvariant.info/v1/",
        clinical_utility_summary="Variant annotation aggregation across multiple sources.",
        implemented=True,
        source_version_hint="1.0",
        import_path=f"{_LEGACY}.myvariant_adapter",
        class_name="MyVariantAdapter",
    ),
}

_SOURCE_ORDER: tuple[str, ...] = (
    "dbsnp",
    "clinvar",
    "gwas_catalog",
    "ensembl",
    "uniprot",
    "disgenet",
    "opentargets",
    "string",
    "biogrid",
    "reactome",
    "kegg",
    "omim",
    "gnomad",
    "myvariant",
)


def list_genetic_keys() -> tuple[str, ...]:
    return _SOURCE_ORDER


def get_genetic_spec(key: str) -> GeneticSourceSpec | None:
    return GENETIC_SOURCES.get(key)


def _load_adapter_class(spec: GeneticSourceSpec):
    if not spec.import_path or not spec.class_name:
        return None
    module = importlib.import_module(spec.import_path)
    return getattr(module, spec.class_name)


def _instantiate_adapter(spec: GeneticSourceSpec):
    if not spec.implemented or not spec.enabled:
        return None
    adapter_cls = _load_adapter_class(spec)
    if adapter_cls is None:
        return None
    # Keep constructor arguments explicit so API keys never leak into logs.
    if spec.key == "dbsnp":
        api_key = os.getenv("NCBI_API_KEY") or os.getenv("DEEPSYNAPS_NCBI_API_KEY")
        return adapter_cls(api_key=api_key)
    if spec.key in {"ensembl", "gwas_catalog", "uniprot"}:
        return adapter_cls(api_key=os.getenv(f"DEEPSYNAPS_{spec.key.upper()}_API_KEY"))
    if spec.key == "string":
        return adapter_cls(cache_dir=os.getenv("DEEPSYNAPS_STRING_CACHE_DIR"))
    if spec.key == "clinvar":
        return adapter_cls({"timeout": 60})
    if spec.key == "gnomad":
        return adapter_cls({"timeout": 30, "dataset": "gnomad_r4"})
    if spec.key == "myvariant":
        return adapter_cls()
    return adapter_cls()


class GeneticRegistry:
    """Lazy, category-scoped registry for Category 2 genetics sources."""

    def __init__(self, adapters: Optional[Dict[str, Any]] = None) -> None:
        self._adapters = adapters or {}

    def get(self, key: str) -> Any:
        return self._adapters.get(key)

    def keys(self) -> tuple[str, ...]:
        return _SOURCE_ORDER

    def list_adapters(self) -> List[Dict[str, Any]]:
        return [self.describe(key) for key in _SOURCE_ORDER]

    def describe(self, key: str) -> Dict[str, Any]:
        spec = GENETIC_SOURCES[key]
        adapter = self._adapters.get(key)
        implemented = spec.implemented
        registered = adapter is not None
        connected = bool(getattr(adapter, "is_connected", False)) if adapter is not None else False
        if not spec.enabled:
            lifecycle = LifecycleState.DISABLED
        elif adapter is None:
            lifecycle = LifecycleState.UNAVAILABLE if spec.implemented else LifecycleState.DISABLED
        elif spec.api_key_required and not _has_required_key(spec):
            lifecycle = LifecycleState.DEGRADED
        elif connected:
            lifecycle = LifecycleState.HEALTHY
        else:
            lifecycle = LifecycleState.REGISTERED
        return {
            "key": key,
            "display_name": spec.display_name,
            "category": spec.category,
            "access_type": spec.access_type,
            "source_url": spec.source_url,
            "clinical_utility_summary": spec.clinical_utility_summary,
            "api_key_required": spec.api_key_required,
            "implemented": implemented,
            "registered": registered,
            "enabled": spec.enabled,
            "connected": connected,
            "source_version": getattr(adapter, "source_version", spec.source_version_hint) if adapter is not None else spec.source_version_hint,
            "lifecycle_state": lifecycle.value,
            "access_note": spec.access_note,
        }

    def get_all_info(self) -> Dict[str, Dict[str, Any]]:
        return {key: self.describe(key) for key in _SOURCE_ORDER}


def _has_required_key(spec: GeneticSourceSpec) -> bool:
    if not spec.api_key_required:
        return True
    env_candidates = [
        f"DEEPSYNAPS_{spec.key.upper()}_API_KEY",
        f"{spec.key.upper()}_API_KEY",
        f"{spec.key.upper()}_TOKEN",
    ]
    return any(os.getenv(name) for name in env_candidates)


_registry_lock = Lock()
_registry_instance: GeneticRegistry | None = None


def build_genetic_registry() -> GeneticRegistry:
    adapters: Dict[str, Any] = {}
    for key in _SOURCE_ORDER:
        spec = GENETIC_SOURCES[key]
        adapter = _instantiate_adapter(spec)
        if adapter is not None:
            adapters[key] = adapter
    return GeneticRegistry(adapters)


def get_genetic_registry() -> GeneticRegistry:
    global _registry_instance
    if _registry_instance is not None:
        return _registry_instance
    with _registry_lock:
        if _registry_instance is None:
            _registry_instance = build_genetic_registry()
    return _registry_instance


def reset_genetic_registry() -> None:
    global _registry_instance
    with _registry_lock:
        _registry_instance = None


def summarize_genetic_lifecycle(registry: GeneticRegistry | None = None) -> Dict[str, Any]:
    registry = registry or get_genetic_registry()
    info = registry.get_all_info()
    by_state: Dict[str, int] = {}
    for row in info.values():
        by_state[row["lifecycle_state"]] = by_state.get(row["lifecycle_state"], 0) + 1
    return {
        "total": len(info),
        "by_state": by_state,
        "adapters": {key: row["lifecycle_state"] for key, row in info.items()},
    }

