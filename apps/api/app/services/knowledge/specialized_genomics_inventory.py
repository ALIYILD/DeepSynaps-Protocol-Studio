"""Category 12 specialized genomics inventory and query helpers.

This layer extends Category 2 genetics with disease-focused genomic context.
It does not replace the general genetics registry and it must not produce
deterministic treatment or responder-prediction claims.
"""

from __future__ import annotations

import importlib
import os
from dataclasses import dataclass
from threading import Lock
from typing import Any, Dict, List, Optional

from app.services.knowledge.genetics_inventory import GeneticRegistry
from app.services.knowledge.lifecycle import LifecycleState


SPECIALIZED_GENOMICS_DISCLAIMER = (
    "Decision support only. Not diagnostic, not predictive of treatment response, "
    "and not a treatment recommendation. Specialized genomic findings require "
    "clinician or genetic specialist review. Associations may be population-specific, "
    "incomplete, and not determinative for neuromodulation selection."
)


@dataclass(frozen=True)
class SpecializedGenomicsSpec:
    key: str
    display_name: str
    disease_focus: str
    source_type: str
    access_type: str
    source_url: str
    clinical_utility_summary: str
    category: str = "specialized_genomics"
    api_key_required: bool = False
    license_required: bool = False
    implemented: bool = False
    enabled: bool = True
    import_path: str = ""
    class_name: str = ""
    crosslink_only: bool = False
    backing_sources: tuple[str, ...] = ()
    limitations: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    provenance_metadata: str = ""
    last_import_check: str = "unknown"


def _spec(**kwargs: Any) -> SpecializedGenomicsSpec:
    return SpecializedGenomicsSpec(**kwargs)


SPECIALIZED_GENOMICS_SPECS: tuple[SpecializedGenomicsSpec, ...] = (
    _spec(
        key="epilepsygenome",
        display_name="EpilepsyGenome",
        disease_focus="epilepsy",
        source_type="curated disease gene list",
        access_type="free",
        source_url="multi-source",
        clinical_utility_summary=(
            "Epilepsy gene and variant context for clinician-reviewed VNS/DBS planning, "
            "seizure phenotype review, and neurogenetic research support."
        ),
        implemented=True,
        import_path="app.adapters.epilepsygenome_adapter",
        class_name="EpilepsyGenomeAdapter",
        backing_sources=("ClinVar", "OMIM", "UniProt", "OpenTargets", "curated_epilepsy_literature"),
        limitations=(
            "Disease-specific associations are research support only and do not establish VNS/DBS responder prediction.",
        ),
        warnings=(
            "Do not use epilepsy genes alone to autonomously clear or exclude a patient for stimulation.",
        ),
        provenance_metadata="Multi-source epilepsy genetics aggregation with curated fallback gene lists.",
        last_import_check="adapter_import_verified",
    ),
    _spec(
        key="alzgene",
        display_name="AlzGene",
        disease_focus="alzheimer",
        source_type="multi-source",
        access_type="free",
        source_url="multi-source",
        clinical_utility_summary=(
            "Alzheimer and aging-related gene context for research-grounded protocol review "
            "and biomarker interpretation support."
        ),
        implemented=True,
        import_path="app.adapters.alzgene_adapter",
        class_name="AlzGeneAdapter",
        backing_sources=("OpenTargets", "UniProt", "NCBI E-Utils", "curated_ad_literature"),
        limitations=(
            "APOE and related findings are not diagnostic and must not be used as deterministic treatment-selection rules.",
        ),
        warnings=(
            "No predictive diagnosis or guaranteed protocol-response language is supported.",
        ),
        provenance_metadata="Multi-source Alzheimer genetics aggregation with curated biomarker and pathway context.",
        last_import_check="adapter_import_verified",
    ),
    _spec(
        key="neurodev_sfari",
        display_name="NeuroDev / SFARI",
        disease_focus="autism_ndd",
        source_type="multi-source",
        access_type="free",
        source_url="multi-source",
        clinical_utility_summary=(
            "Autism and neurodevelopmental gene context for neurofeedback/NDD evidence review "
            "and clinician-facing research support."
        ),
        implemented=True,
        import_path="app.adapters.neurodev_adapter",
        class_name="NeuroDevAdapter",
        backing_sources=("SFARI", "NCBI E-Utils", "UniProt", "OpenTargets", "curated_ndd_literature"),
        limitations=(
            "Autism/NDD gene associations are not diagnostic and do not predict neurofeedback response.",
        ),
        warnings=(
            "Do not use SFARI/NeuroDev context as a standalone autism diagnosis or patient-selection rule.",
        ),
        provenance_metadata="Multi-source ASD/NDD genetics aggregation with curated SFARI category context.",
        last_import_check="adapter_import_verified",
    ),
    _spec(
        key="pharmacogenomics",
        display_name="Pharmacogenomics",
        disease_focus="pharmacogenomics",
        source_type="PGx",
        access_type="free",
        source_url="various",
        clinical_utility_summary=(
            "Drug-gene context for combined drug-device therapy review via Category 2 PGx cross-links."
        ),
        implemented=True,
        crosslink_only=True,
        backing_sources=("pharmgkb", "myvariant", "clinvar", "dbsnp"),
        limitations=(
            "Cross-linked PGx context is not a substitute for validated pharmacogenomic testing or prescribing decisions.",
        ),
        warnings=(
            "Do not use PGx context alone to prescribe neuromodulation or medication changes.",
        ),
        provenance_metadata="Cross-link-only specialized layer backed by Category 2 genetics/PGx sources.",
        last_import_check="category2_crosslink_only",
    ),
    _spec(
        key="neurogenetics",
        display_name="NeuroGenetics",
        disease_focus="neurogenetics",
        source_type="registry",
        access_type="free",
        source_url="various",
        clinical_utility_summary="General neurogenetic variant context for research-grade interpretation.",
        implemented=False,
        enabled=True,
        limitations=("No concrete NeuroGenetics adapter is implemented in the canonical runtime.",),
        warnings=("Represented for lifecycle completeness only.",),
        provenance_metadata="Catalogued placeholder pending concrete adapter wiring.",
    ),
    _spec(
        key="pgc",
        display_name="Psychiatric Genomics Consortium",
        disease_focus="psychiatric",
        source_type="GWAS summary",
        access_type="free",
        source_url="https://www.med.unc.edu/pgc/",
        clinical_utility_summary=(
            "Population-level psychiatric GWAS context for clinician-reviewed neuromodulation evidence review."
        ),
        implemented=False,
        enabled=True,
        limitations=(
            "Population-level GWAS findings are not individual-level response predictors.",
        ),
        warnings=(
            "Do not over-personalize PGC findings for TMS/tDCS protocol selection.",
        ),
        provenance_metadata="Catalogued GWAS summary-stat source pending tested import/query support.",
    ),
    _spec(
        key="stroke_genetics",
        display_name="Stroke Genetics",
        disease_focus="stroke",
        source_type="registry",
        access_type="free",
        source_url="various",
        clinical_utility_summary=(
            "Post-stroke genetic research context for rehabilitation evidence review."
        ),
        implemented=False,
        enabled=True,
        limitations=(
            "Stroke genetics remains experimental in this layer unless directly validated and clinically supported.",
        ),
        warnings=(
            "Do not present stroke genetic context as determinative rehabilitation guidance.",
        ),
        provenance_metadata="Catalogued placeholder pending concrete source integration.",
    ),
)

_SPECS_BY_KEY = {spec.key: spec for spec in SPECIALIZED_GENOMICS_SPECS}
_ORDER = tuple(spec.key for spec in SPECIALIZED_GENOMICS_SPECS)
_LOCK = Lock()
_REGISTRY: "SpecializedGenomicsRegistry | None" = None


def list_specialized_genomics_keys() -> tuple[str, ...]:
    return _ORDER


def get_specialized_genomics_spec(key: str) -> SpecializedGenomicsSpec | None:
    return _SPECS_BY_KEY.get(key)


def _instantiate_adapter(spec: SpecializedGenomicsSpec) -> Any:
    if not spec.implemented or spec.crosslink_only:
        return None
    if not spec.import_path or not spec.class_name:
        return None
    module = importlib.import_module(spec.import_path)
    adapter_cls = getattr(module, spec.class_name)
    if spec.key == "epilepsygenome":
        return adapter_cls(api_key=os.getenv("NCBI_API_KEY") or os.getenv("DEEPSYNAPS_NCBI_API_KEY"))
    if spec.key in {"alzgene", "neurodev_sfari"}:
        return adapter_cls()
    return adapter_cls()


class SpecializedGenomicsRegistry:
    def __init__(self, adapters: Optional[Dict[str, Any]] = None) -> None:
        self._adapters = adapters or {}

    def get(self, key: str) -> Any:
        return self._adapters.get(key)

    def describe(self, key: str, *, category2_registry: GeneticRegistry | None = None) -> Dict[str, Any]:
        spec = _SPECS_BY_KEY[key]
        adapter = self._adapters.get(key)

        if not spec.enabled:
            lifecycle = LifecycleState.DISABLED
        elif spec.crosslink_only:
            if category2_registry and any(category2_registry.get(src) is not None for src in spec.backing_sources):
                lifecycle = LifecycleState.DEGRADED
            else:
                lifecycle = LifecycleState.CATALOGUED
        elif adapter is None:
            lifecycle = LifecycleState.CATALOGUED if not spec.implemented else LifecycleState.UNAVAILABLE
        else:
            lifecycle = LifecycleState.HEALTHY

        return {
            "id": spec.key,
            "key": spec.key,
            "display_name": spec.display_name,
            "category": spec.category,
            "disease_focus": spec.disease_focus,
            "source_type": spec.source_type,
            "access_type": spec.access_type,
            "source_url": spec.source_url,
            "api_key_required": spec.api_key_required,
            "license_required": spec.license_required,
            "implemented": spec.implemented,
            "enabled": spec.enabled,
            "registered": adapter is not None,
            "lifecycle_state": lifecycle.value,
            "status": lifecycle.value,
            "clinical_utility_summary": spec.clinical_utility_summary,
            "backing_sources": list(spec.backing_sources),
            "limitations": list(spec.limitations),
            "warnings": list(spec.warnings),
            "provenance_metadata": spec.provenance_metadata,
            "last_import_check": spec.last_import_check,
        }

    def get_all_info(self, *, category2_registry: GeneticRegistry | None = None) -> Dict[str, Dict[str, Any]]:
        return {key: self.describe(key, category2_registry=category2_registry) for key in _ORDER}


def build_specialized_genomics_registry() -> SpecializedGenomicsRegistry:
    adapters: Dict[str, Any] = {}
    for key in _ORDER:
        spec = _SPECS_BY_KEY[key]
        adapter = _instantiate_adapter(spec)
        if adapter is not None:
            adapters[key] = adapter
    return SpecializedGenomicsRegistry(adapters)


def get_specialized_genomics_registry() -> SpecializedGenomicsRegistry:
    global _REGISTRY
    if _REGISTRY is not None:
        return _REGISTRY
    with _LOCK:
        if _REGISTRY is None:
            _REGISTRY = build_specialized_genomics_registry()
    return _REGISTRY


def summarize_specialized_genomics_lifecycle(
    registry: SpecializedGenomicsRegistry | None = None,
    *,
    category2_registry: GeneticRegistry | None = None,
) -> Dict[str, Any]:
    registry = registry or get_specialized_genomics_registry()
    info = registry.get_all_info(category2_registry=category2_registry)
    by_state: Dict[str, int] = {}
    for row in info.values():
        by_state[row["lifecycle_state"]] = by_state.get(row["lifecycle_state"], 0) + 1
    return {
        "total": len(info),
        "by_state": by_state,
        "sources": {key: row["lifecycle_state"] for key, row in info.items()},
    }


async def _query_category2_adapter(adapter: Any, query: str) -> List[Dict[str, Any]]:
    if adapter is None:
        return []
    try:
        result = await adapter.search(query, filters={})
    except TypeError:
        result = await adapter.search(query)
    if result is None:
        return []
    if isinstance(result, dict):
        return [result]
    return list(result)


def _normalized_related_modality(disease_focus: str, requested_modality: str | None) -> str:
    if requested_modality:
        return requested_modality
    mapping = {
        "epilepsy": "VNS/DBS",
        "alzheimer": "unknown",
        "autism_ndd": "neurofeedback",
        "pharmacogenomics": "unknown",
        "neurogenetics": "unknown",
        "psychiatric": "TMS/tDCS",
        "stroke": "rehab",
        "general": "unknown",
    }
    return mapping.get(disease_focus, "unknown")


def _normalize_specialized_gene_result(
    *,
    spec: SpecializedGenomicsSpec,
    gene_symbol: str,
    phenotype: str,
    evidence_type: str,
    modality: str | None,
    backing_sources: List[str],
    raw: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "source": spec.display_name,
        "source_id": spec.key,
        "disease_focus": spec.disease_focus,
        "gene_symbol": gene_symbol,
        "variant_id": raw.get("variant_id") or raw.get("rs_id") or None,
        "phenotype": phenotype,
        "evidence_type": evidence_type,
        "association_direction": raw.get("association_direction"),
        "population_ancestry_caveats": raw.get("population") or None,
        "related_modality": _normalized_related_modality(spec.disease_focus, modality),
        "backing_sources": backing_sources,
        "provenance": {
            "source_url": spec.source_url,
            "last_import_check": spec.last_import_check,
        },
        "limitations": list(spec.limitations),
        "warnings": list(spec.warnings),
        "decision_support_disclaimer": SPECIALIZED_GENOMICS_DISCLAIMER,
    }


async def query_specialized_genomics(
    *,
    specialized_registry: SpecializedGenomicsRegistry,
    category2_registry: GeneticRegistry,
    disease_focus: str,
    gene_symbol: str | None = None,
    variant_id: str | None = None,
    modality: str | None = None,
    condition: str | None = None,
) -> Dict[str, Any]:
    source_statuses = specialized_registry.get_all_info(category2_registry=category2_registry)
    results: List[Dict[str, Any]] = []
    cross_links: Dict[str, List[Dict[str, Any]]] = {}
    caveats: List[str] = [
        SPECIALIZED_GENOMICS_DISCLAIMER,
        "Possible disease-specific genetic context only; not determinative for neuromodulation planning.",
    ]

    focus = disease_focus.strip().lower()
    focus_map = {
        "alzheimer": "alzheimer",
        "alzheimers": "alzheimer",
        "autism": "autism_ndd",
        "autism/ndd": "autism_ndd",
        "ndd": "autism_ndd",
        "pharmacogenomics": "pharmacogenomics",
        "psychiatric": "psychiatric",
        "stroke": "stroke",
        "epilepsy": "epilepsy",
        "general": "general",
    }
    normalized_focus = focus_map.get(focus, focus)
    query_term = (gene_symbol or variant_id or condition or "").strip()

    if normalized_focus == "epilepsy":
        adapter = specialized_registry.get("epilepsygenome")
        spec = _SPECS_BY_KEY["epilepsygenome"]
        if adapter is not None:
            genes = adapter.search_epilepsy_genes(gene_symbol=gene_symbol or "", limit=5)
            for gene in genes:
                results.append(
                    _normalize_specialized_gene_result(
                        spec=spec,
                        gene_symbol=gene.gene_symbol,
                        phenotype="epilepsy",
                        evidence_type="curated_gene",
                        modality=modality,
                        backing_sources=list(getattr(gene, "sources", []) or spec.backing_sources),
                        raw=gene.model_dump() if hasattr(gene, "model_dump") else gene.__dict__,
                    )
                )
            if gene_symbol:
                for variant in adapter.get_variants(gene_symbol=gene_symbol, limit=5):
                    raw = variant.model_dump() if hasattr(variant, "model_dump") else variant.__dict__
                    results.append(
                        _normalize_specialized_gene_result(
                            spec=spec,
                            gene_symbol=raw.get("gene_symbol") or gene_symbol,
                            phenotype=raw.get("phenotype") or "epilepsy",
                            evidence_type="variant_annotation",
                            modality=modality,
                            backing_sources=["ClinVar"],
                            raw=raw,
                        )
                    )
    elif normalized_focus == "alzheimer":
        adapter = specialized_registry.get("alzgene")
        spec = _SPECS_BY_KEY["alzgene"]
        if adapter is not None:
            genes = adapter.search_ad_genes(gene_symbol=gene_symbol or "", limit=5)
            for gene in genes:
                results.append(
                    _normalize_specialized_gene_result(
                        spec=spec,
                        gene_symbol=gene.gene_symbol,
                        phenotype="alzheimer",
                        evidence_type="curated_gene",
                        modality=modality,
                        backing_sources=list(getattr(gene, "sources", []) or spec.backing_sources),
                        raw=gene.model_dump() if hasattr(gene, "model_dump") else gene.__dict__,
                    )
                )
            if gene_symbol:
                for variant in adapter.get_variants(gene_symbol=gene_symbol, limit=5):
                    raw = variant.model_dump() if hasattr(variant, "model_dump") else variant.__dict__
                    results.append(
                        _normalize_specialized_gene_result(
                            spec=spec,
                            gene_symbol=raw.get("gene_symbol") or gene_symbol,
                            phenotype=condition or "alzheimer",
                            evidence_type="variant_annotation",
                            modality=modality,
                            backing_sources=["curated", "ClinVar"],
                            raw=raw,
                        )
                    )
    elif normalized_focus == "autism_ndd":
        adapter = specialized_registry.get("neurodev_sfari")
        spec = _SPECS_BY_KEY["neurodev_sfari"]
        if adapter is not None:
            genes = adapter.search_nd_genes(gene_symbol=gene_symbol or "", limit=5)
            for gene in genes:
                raw = gene.model_dump() if hasattr(gene, "model_dump") else gene.__dict__
                results.append(
                    _normalize_specialized_gene_result(
                        spec=spec,
                        gene_symbol=gene.gene_symbol,
                        phenotype=raw.get("syndrome_name") or "autism/NDD",
                        evidence_type="curated_gene",
                        modality=modality,
                        backing_sources=list(raw.get("sources") or spec.backing_sources),
                        raw=raw,
                    )
                )
    elif normalized_focus in {"pharmacogenomics", "psychiatric", "stroke", "neurogenetics", "general"}:
        if normalized_focus == "pharmacogenomics":
            caveats.append(
                "Pharmacogenomic context may support drug-device review, but it is not predictive of neuromodulation response."
            )
        if normalized_focus == "psychiatric":
            caveats.append("PGC/GWAS findings are population-level evidence only and must not be over-personalized.")
        if normalized_focus == "stroke":
            caveats.append("Stroke genetic context is research-grade and not determinative for rehabilitation planning.")

    category2_keys = ["clinvar", "dbsnp", "gwas_catalog", "myvariant"]
    if normalized_focus in {"pharmacogenomics", "psychiatric"}:
        category2_keys.append("pharmgkb")

    for key in category2_keys:
        adapter = category2_registry.get(key)
        if adapter is None or not query_term:
            continue
        try:
            hits = await _query_category2_adapter(adapter, query_term)
        except Exception:
            hits = []
        if hits:
            cross_links[key] = hits[:5]

    if normalized_focus == "pharmacogenomics":
        source_statuses["pharmacogenomics"]["backing_sources"] = ["pharmgkb", "myvariant", "clinvar", "dbsnp"]

    return {
        "disease_focus": normalized_focus,
        "matched_context": {
            "gene_symbol": gene_symbol,
            "variant_id": variant_id,
            "condition": condition,
            "modality": modality,
        },
        "source_statuses": source_statuses,
        "results": results,
        "category2_cross_links": cross_links,
        "caveats": caveats,
        "provenance": {
            "query_parameters": {
                "disease_focus": normalized_focus,
                "gene_symbol": gene_symbol,
                "variant_id": variant_id,
                "condition": condition,
                "modality": modality,
            },
            "patient_identifier_sent_to_external_sources": False,
            "category2_reused": list(cross_links.keys()),
        },
        "decision_support_disclaimer": SPECIALIZED_GENOMICS_DISCLAIMER,
    }
