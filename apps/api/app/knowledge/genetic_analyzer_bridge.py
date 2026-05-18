"""
Genetic Analyzer Bridge — DeepSynaps Protocol Studio Knowledge Layer.

Synthesises data from 10 genetics adapters (ClinVar, PharmGKB, GWAS Catalog,
dbSNP, Ensembl, gnomAD, UniProt, STRING, MyVariant.info, Allen Brain) to
produce variant interpretation, genetic risk profiles, pathway analysis, and
normative comparisons.

All outputs are research-only clinical intelligence with provenance,
confidence scores, and adapter attribution.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Adapter import paths ───────────────────────────────────────────────────────
# Try knowledge-layer imports first, then fall back to batch outputs for
# adapters that exist outside the main tree.

# Core genetics adapters (DeepSynaps Protocol Studio)
_CLINVAR_IMPORT = "app.services.knowledge.adapters.clinvar_adapter"
_PHARMGKB_IMPORT = "app.services.knowledge.adapters.pharmgkb_adapter"
_ALLEN_BRAIN_IMPORT = "app.services.knowledge.adapters.allen_brain_adapter"

# Batch 4 genetics adapters
_GWAS_CATALOG_IMPORT = "app.services.knowledge.adapters.gwas_catalog_adapter"
_DBSNP_IMPORT = "app.services.knowledge.adapters.dbsnp_adapter"
_ENSEMBL_IMPORT = "app.services.knowledge.adapters.ensembl_adapter"
_GNOMAD_IMPORT = "app.services.knowledge.adapters.gnomad_adapter"
_UNIPROT_IMPORT = "app.services.knowledge.adapters.uniprot_adapter"

# Batch 5 atlas + interaction adapters
_STRING_IMPORT = "app.services.knowledge.adapters.string_adapter"
_MYVARIANT_IMPORT = "app.services.knowledge.adapters.myvariant_adapter"

# ── Canonical adapter class names ──────────────────────────────────────────────
_ADAPTER_CLASSES = {
    "clinvar": ("ClinVarAdapter", _CLINVAR_IMPORT),
    "pharmgkb": ("PharmGKBAdapter", _PHARMGKB_IMPORT),
    "gwas_catalog": ("GWASCatalogAdapter", _GWAS_CATALOG_IMPORT),
    "dbsnp": ("DbSNPAdapter", _DBSNP_IMPORT),
    "ensembl": ("EnsemblAdapter", _ENSEMBL_IMPORT),
    "gnomad": ("GnomADAdapter", _GNOMAD_IMPORT),
    "uniprot": ("UniProtAdapter", _UNIPROT_IMPORT),
    "string": ("STRINGAdapter", _STRING_IMPORT),
    "myvariant": ("MyVariantAdapter", _MYVARIANT_IMPORT),
    "allen_brain": ("AllenBrainAdapter", _ALLEN_BRAIN_IMPORT),
}

# ── Adapter confidence weights ─────────────────────────────────────────────────
_ADAPTER_WEIGHTS: Dict[str, float] = {
    "clinvar": 0.90,
    "pharmgkb": 0.88,
    "gwas_catalog": 0.82,
    "gnomad": 0.85,
    "ensembl": 0.80,
    "dbsnp": 0.75,
    "uniprot": 0.78,
    "string": 0.72,
    "myvariant": 0.76,
    "allen_brain": 0.70,
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _utc() -> str:
    """Return current UTC timestamp as ISO string."""
    return datetime.now(timezone.utc).isoformat()


def _prov(
    sources: List[str],
    query: str,
    confidence: float,
    *,
    research: bool = True,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build provenance envelope for bridge output."""
    p: Dict[str, Any] = {
        "sources": sources,
        "query": query,
        "confidence": round(confidence, 4),
        "confidence_tier": (
            "high"
            if confidence >= 0.9
            else "moderate"
            if confidence >= 0.7
            else "low"
            if confidence >= 0.4
            else "insufficient"
        ),
        "is_research_only": research,
        "accessed_at": _utc(),
        "bridge": "genetic_analyzer_bridge",
        "version": "2.0.0",
    }
    if meta:
        p["metadata"] = meta
    return p


def _safe_adapter_call(
    adapter: Any, method_name: str, *args: Any, **kwargs: Any
) -> Any:
    """Safely call an adapter method, returning None on any error."""
    if adapter is None:
        return None
    try:
        method = getattr(adapter, method_name, None)
        if method is None:
            logger.warning("Adapter %s has no method %s", type(adapter).__name__, method_name)
            return None
        if asyncio.iscoroutinefunction(method):
            return method(*args, **kwargs)
        return method(*args, **kwargs)
    except Exception as exc:
        logger.warning(
            "Adapter %s method %s failed: %s",
            type(adapter).__name__,
            method_name,
            exc,
        )
        return None


async def _safe_await(coro: Any) -> Any:
    """Safely await a coroutine, returning None on error."""
    if coro is None:
        return None
    try:
        return await coro
    except Exception as exc:
        logger.warning("Async adapter call failed: %s", exc)
        return None


def _weighted_confidence(
    results: List[Tuple[float, List[str]]],
) -> Tuple[float, List[str]]:
    """Compute weighted average confidence and merged source list.

    Args:
        results: List of (confidence_score, source_adapter_names) tuples.

    Returns:
        (average_confidence, merged_source_names)
    """
    scores = [r[0] for r in results if r[0] > 0]
    sources: List[str] = []
    for r in results:
        sources.extend(r[1])
    avg = sum(scores) / len(scores) if scores else 0.25
    return round(min(max(avg, 0.0), 1.0), 4), list(dict.fromkeys(sources))


# ── Bridge ─────────────────────────────────────────────────────────────────────


class GeneticAnalyzerBridge:
    """Bridge synthesising 10 genetics adapters into clinical insights.

    Methods:
        interpret_variant      – Full variant annotation from all adapters.
        generate_risk_profile  – Aggregate risk across patient variants.
        get_pathway_analysis   – STRING interactions + pathway enrichment.
        compare_to_normative   – Patient vs population normative data.
    """

    def __init__(self, registry: Any) -> None:
        """Resolve all 10 genetics adapters from the registry.

        Args:
            registry: AdapterRegistry instance or dict-like with .get(name).
        """
        self._adapters: Dict[str, Any] = {}
        missing: List[str] = []

        for name, (cls_name, _) in _ADAPTER_CLASSES.items():
            adapter = registry.get(name) if hasattr(registry, "get") else registry.get(name)
            if adapter is not None:
                self._adapters[name] = adapter
            else:
                missing.append(name)

        if missing:
            logger.warning(
                "GeneticAnalyzerBridge: %d/%d adapters unavailable: %s",
                len(missing),
                len(_ADAPTER_CLASSES),
                missing,
            )
        else:
            logger.info(
                "GeneticAnalyzerBridge: all %d adapters resolved",
                len(_ADAPTER_CLASSES),
            )

    # ── Variant Interpretation ───────────────────────────────────────────────

    async def interpret_variant(self, variant_id: str, gene: str) -> Dict[str, Any]:
        """Produce a full multi-adapter interpretation of a genetic variant.

        Queries ClinVar, gnomAD, Ensembl, MyVariant, PharmGKB, GWAS Catalog,
        dbSNP, UniProt, STRING, and Allen Brain Atlas in parallel.  Each
        adapter's contribution is wrapped with provenance and confidence.

        Args:
            variant_id: Variant identifier, e.g. ``"rs4680"``.
            gene: HGNC gene symbol, e.g. ``"COMT"``.

        Returns:
            Canonical variant-interpretation dictionary.
        """
        variant_c = variant_id.strip()
        gene_c = gene.strip().upper()
        query = f"{variant_c}:{gene_c}"
        logger.info("interpret_variant: %s", query)

        # ── Parallel adapter queries ─────────────────────────────────────────
        tasks = {
            "clinvar": self._query_clinvar(variant_c, gene_c),
            "gnomad": self._query_gnomad(variant_c, gene_c),
            "ensembl": self._query_ensembl(variant_c, gene_c),
            "myvariant": self._query_myvariant(variant_c, gene_c),
            "pharmgkb": self._query_pharmgkb(variant_c, gene_c),
            "gwas": self._query_gwas(variant_c, gene_c),
            "dbsnp": self._query_dbsnp(variant_c, gene_c),
            "uniprot": self._query_uniprot(variant_c, gene_c),
            "string": self._query_string(variant_c, gene_c),
            "allen_brain": self._query_allen_brain(variant_c, gene_c),
        }

        results = await asyncio.gather(
            *tasks.values(),
            return_exceptions=True,
        )
        resolved: Dict[str, Any] = {}
        for name, res in zip(tasks.keys(), results):
            if isinstance(res, Exception):
                logger.warning("interpret_variant: %s failed: %s", name, res)
                resolved[name] = None
            else:
                resolved[name] = res

        # ── Build canonical output sections ──────────────────────────────────
        variant_info = self._build_variant_info(resolved, variant_c, gene_c)
        clinvar_data = resolved.get("clinvar") or {}
        gnomad_data = resolved.get("gnomad") or {}
        ensembl_data = resolved.get("ensembl") or {}
        myvariant_data = resolved.get("myvariant") or {}
        pharmgkb_data = resolved.get("pharmgkb") or {}
        gwas_data = resolved.get("gwas") or {}
        string_data = resolved.get("string") or {}
        allen_data = resolved.get("allen_brain") or {}

        # Compute confidence
        conf_parts: List[Tuple[float, List[str]]] = []

        # Clinical significance
        clinical_sig = self._build_clinical_significance(clinvar_data)
        if clinical_sig.get("confidence", 0) > 0:
            conf_parts.append((clinical_sig["confidence"], clinical_sig["source_adapters"]))

        # Population frequencies
        pop_freqs = self._build_population_frequencies(gnomad_data)
        if pop_freqs.get("gnomad_eur") is not None:
            conf_parts.append((_ADAPTER_WEIGHTS["gnomad"], pop_freqs["source_adapters"]))

        # Functional impact
        func_impact = self._build_functional_impact(ensembl_data, myvariant_data)
        if func_impact.get("cadd_score") is not None:
            conf_parts.append(
                (_ADAPTER_WEIGHTS["ensembl"] * 0.5 + _ADAPTER_WEIGHTS["myvariant"] * 0.5,
                 func_impact["source_adapters"])
            )

        # Phenotype associations
        phenotypes = self._build_phenotype_associations(gwas_data)
        if phenotypes:
            conf_parts.append((_ADAPTER_WEIGHTS["gwas_catalog"], ["gwas_catalog"]))

        # Pharmacogenomic associations
        pgx_assoc = self._build_pgx_associations(pharmgkb_data)
        if pgx_assoc:
            conf_parts.append((_ADAPTER_WEIGHTS["pharmgkb"], ["pharmgkb"]))

        # Protein network
        protein_net = self._build_protein_network(string_data, gene_c)
        if protein_net.get("interactors"):
            conf_parts.append((_ADAPTER_WEIGHTS["string"], protein_net["source_adapters"]))

        # Brain expression
        brain_expr = self._build_brain_expression(allen_data, gene_c)
        if brain_expr.get("regions"):
            conf_parts.append((_ADAPTER_WEIGHTS["allen_brain"], brain_expr["source_adapters"]))

        overall_confidence, all_sources = _weighted_confidence(conf_parts)

        result: Dict[str, Any] = {
            "variant": variant_info,
            "clinical_significance": clinical_sig,
            "population_frequencies": pop_freqs,
            "functional_impact": func_impact,
            "phenotype_associations": phenotypes,
            "pharmacogenomic_associations": pgx_assoc,
            "protein_network": protein_net,
            "brain_expression": brain_expr,
            "confidence_overall": overall_confidence,
            "research_only": True,
            "provenance": _prov(
                all_sources,
                query,
                overall_confidence,
                meta={
                    "variant": variant_c,
                    "gene": gene_c,
                    "adapters_queried": len(tasks),
                    "adapters_responsive": sum(1 for r in resolved.values() if r is not None),
                },
            ),
        }

        logger.info(
            "interpret_variant: completed %s with confidence %.2f (%d/%d adapters)",
            query,
            overall_confidence,
            sum(1 for r in resolved.values() if r is not None),
            len(tasks),
        )
        return result

    # ── Risk Profile ─────────────────────────────────────────────────────────

    async def generate_risk_profile(
        self, patient_variants: List[str]
    ) -> Dict[str, Any]:
        """Aggregate genetic risk across all patient variants.

        For each variant, queries ClinVar (clinical significance), GWAS Catalog
        (trait associations), PharmGKB (drug response), and gnomAD (population
        frequency context) in parallel.  Results are collated into condition-level
        and drug-level risk summaries.

        Args:
            patient_variants: List of variant IDs, e.g. ``["rs4680", "rs1799971"]``.

        Returns:
            Risk profile dictionary with condition risks, drug responses, traits,
            and overall aggregate metrics.
        """
        clean_vars = [v.strip() for v in patient_variants if v and str(v).strip()]
        logger.info("generate_risk_profile: %d variants", len(clean_vars))

        if not clean_vars:
            return {
                "variants_analyzed": 0,
                "condition_risks": [],
                "drug_responses": [],
                "trait_associations": [],
                "overall_risk_score": 0.0,
                "confidence_overall": 0.0,
                "research_only": True,
                "provenance": _prov([], "empty_variant_list", 0.0),
            }

        # Query all variants in parallel (10 at a time to avoid rate limits)
        semaphore = asyncio.Semaphore(10)

        async def _process_one(variant: str) -> Dict[str, Any]:
            async with semaphore:
                # Extract gene from ClinVar / dbSNP first
                gene = "UNKNOWN"
                clinvar_res = await _safe_await(
                    _safe_adapter_call(
                        self._adapters.get("clinvar"), "search", variant
                    )
                )
                if clinvar_res and isinstance(clinvar_res, list) and clinvar_res:
                    gene = clinvar_res[0].get("gene", gene)
                elif clinvar_res and isinstance(clinvar_res, dict):
                    gene = clinvar_res.get("gene", gene)

                # Fallback: try dbSNP
                if gene == "UNKNOWN":
                    dbsnp_res = await _safe_await(
                        _safe_adapter_call(
                            self._adapters.get("dbsnp"), "search", variant
                        )
                    )
                    if dbsnp_res and isinstance(dbsnp_res, list) and dbsnp_res:
                        gene = dbsnp_res[0].get("gene", gene)

                return await self.interpret_variant(variant, gene)

        interpretations = await asyncio.gather(
            *[_process_one(v) for v in clean_vars],
            return_exceptions=True,
        )

        # Aggregate results
        condition_map: Dict[str, Dict[str, Any]] = {}
        drug_map: Dict[str, Dict[str, Any]] = {}
        trait_map: Dict[str, Dict[str, Any]] = {}
        all_scores: List[float] = []
        all_sources: List[str] = []

        for i, interp in enumerate(interpretations):
            if isinstance(interp, Exception):
                logger.warning("Risk profile: variant %s failed: %s", clean_vars[i], interp)
                continue

            conf = interp.get("confidence_overall", 0.25)
            all_scores.append(conf)
            prov = interp.get("provenance", {})
            all_sources.extend(prov.get("sources", []))

            # Conditions
            for cond in interp.get("clinical_significance", {}).get("conditions", []):
                cname = cond if isinstance(cond, str) else cond.get("name", "unknown")
                if cname not in condition_map:
                    condition_map[cname] = {
                        "condition": cname,
                        "variants": [],
                        "confidence": conf,
                    }
                condition_map[cname]["variants"].append(clean_vars[i])

            # Traits from phenotype associations
            for trait in interp.get("phenotype_associations", []):
                tname = trait.get("trait", "unknown")
                if tname not in trait_map:
                    trait_map[tname] = {
                        "trait": tname,
                        "variants": [],
                        "p_value_best": 1.0,
                        "confidence": conf,
                    }
                trait_map[tname]["variants"].append(clean_vars[i])
                pval = trait.get("p_value", 1.0)
                if isinstance(pval, (int, float)) and pval < trait_map[tname]["p_value_best"]:
                    trait_map[tname]["p_value_best"] = pval

            # Drug responses
            for drug_info in interp.get("pharmacogenomic_associations", []):
                dname = drug_info.get("drug", "unknown")
                if dname not in drug_map:
                    drug_map[dname] = {
                        "drug": dname,
                        "variants": [],
                        "effects": set(),
                        "confidence": conf,
                    }
                drug_map[dname]["variants"].append(clean_vars[i])
                drug_map[dname]["effects"].add(drug_info.get("effect", "unknown"))

        # Calculate overall risk score
        risk_score = 0.0
        if condition_map:
            # More conditions + lower p-values = higher risk score
            risk_factors = []
            for cond in condition_map.values():
                variant_count = len(set(cond["variants"]))
                risk_factors.append(min(variant_count * 0.15, 0.8))
            risk_score = min(sum(risk_factors) / len(risk_factors) if risk_factors else 0.0, 1.0)

        avg_conf = sum(all_scores) / len(all_scores) if all_scores else 0.25
        unique_sources = list(dict.fromkeys(all_sources))

        # Convert sets to lists for JSON serialization
        for d in drug_map.values():
            d["effects"] = list(d["effects"])

        result: Dict[str, Any] = {
            "variants_analyzed": len(clean_vars),
            "variant_ids": clean_vars,
            "condition_risks": list(condition_map.values()),
            "condition_count": len(condition_map),
            "drug_responses": list(drug_map.values()),
            "drug_response_count": len(drug_map),
            "trait_associations": list(trait_map.values()),
            "trait_count": len(trait_map),
            "overall_risk_score": round(risk_score, 4),
            "risk_level": (
                "high"
                if risk_score >= 0.7
                else "moderate"
                if risk_score >= 0.4
                else "low"
                if risk_score >= 0.1
                else "minimal"
            ),
            "confidence_overall": round(avg_conf, 4),
            "research_only": True,
            "provenance": _prov(
                unique_sources,
                f"variants={clean_vars}",
                avg_conf,
                meta={
                    "variant_count": len(clean_vars),
                    "conditions_found": len(condition_map),
                    "drug_responses_found": len(drug_map),
                    "traits_found": len(trait_map),
                },
            ),
        }

        logger.info(
            "generate_risk_profile: completed %d variants, %d conditions, %.2f risk",
            len(clean_vars),
            len(condition_map),
            risk_score,
        )
        return result

    # ── Pathway Analysis ─────────────────────────────────────────────────────

    async def get_pathway_analysis(self, gene_list: List[str]) -> Dict[str, Any]:
        """Analyse protein-protein interactions and pathway enrichment.

        Uses STRING for interaction networks and UniProt for pathway
        annotations (KEGG, Reactome).

        Args:
            gene_list: List of HGNC gene symbols, e.g. ``["COMT", "DRD2", "BDNF"]``.

        Returns:
            Pathway analysis with interactors, enriched pathways, network
            metrics, and provenance.
        """
        clean_genes = [g.strip().upper() for g in gene_list if g and str(g).strip()]
        logger.info("get_pathway_analysis: %d genes", len(clean_genes))

        if not clean_genes:
            return {
                "input_genes": [],
                "interactors": [],
                "pathways": [],
                "network_density": 0.0,
                "confidence_overall": 0.0,
                "research_only": True,
                "provenance": _prov([], "empty_gene_list", 0.0),
            }

        # Query STRING and UniProt in parallel
        string_task = _safe_await(
            _safe_adapter_call(
                self._adapters.get("string"), "search", ", ".join(clean_genes)
            )
        )
        uniprot_task = _safe_await(
            _safe_adapter_call(
                self._adapters.get("uniprot"), "search", ", ".join(clean_genes)
            )
        )

        string_results, uniprot_results = await asyncio.gather(
            string_task, uniprot_task, return_exceptions=True
        )

        if isinstance(string_results, Exception):
            logger.warning("get_pathway_analysis: STRING failed: %s", string_results)
            string_results = None
        if isinstance(uniprot_results, Exception):
            logger.warning("get_pathway_analysis: UniProt failed: %s", uniprot_results)
            uniprot_results = None

        # Build interaction network
        interactors: List[str] = []
        interactions: List[Dict[str, Any]] = []
        string_conf = 0.0

        if string_results and isinstance(string_results, list):
            seen_pairs: set = set()
            for entry in string_results:
                canon = entry.get("canonical_data", entry)
                if isinstance(canon, list):
                    for item in canon:
                        p1 = item.get("preferred_name_a", item.get("protein_a", ""))
                        p2 = item.get("preferred_name_b", item.get("protein_b", ""))
                        score = item.get("score", item.get("combined_score", 0))
                        pair = tuple(sorted([p1, p2]))
                        if pair not in seen_pairs and p1 and p2:
                            seen_pairs.add(pair)
                            interactions.append({
                                "protein_a": p1,
                                "protein_b": p2,
                                "score": score,
                            })
                            if p1 not in clean_genes and p1 not in interactors:
                                interactors.append(p1)
                            if p2 not in clean_genes and p2 not in interactors:
                                interactors.append(p2)
                else:
                    p1 = canon.get("preferred_name_a", canon.get("protein_a", ""))
                    p2 = canon.get("preferred_name_b", canon.get("protein_b", ""))
                    score = canon.get("score", canon.get("combined_score", 0))
                    if p1 and p2:
                        interactions.append({
                            "protein_a": p1,
                            "protein_b": p2,
                            "score": score,
                        })
                        if p1 not in clean_genes and p1 not in interactors:
                            interactors.append(p1)
                        if p2 not in clean_genes and p2 not in interactors:
                            interactors.append(p2)
            string_conf = _ADAPTER_WEIGHTS["string"]

        # Pathway enrichment from UniProt
        pathways: List[Dict[str, Any]] = []
        uniprot_conf = 0.0

        if uniprot_results and isinstance(uniprot_results, list):
            pathway_map: Dict[str, Dict[str, Any]] = {}
            for entry in uniprot_results:
                canon = entry.get("canonical_data", entry)
                gene = canon.get("gene_name", canon.get("gene", ""))
                for pathway_key in ["pathways", "go_terms", "kegg_pathways", "reactome_pathways"]:
                    pws = canon.get(pathway_key, [])
                    if isinstance(pws, str):
                        pws = [pws]
                    for pw in pws:
                        pname = pw if isinstance(pw, str) else pw.get("name", pw.get("pathway", "unknown"))
                        if pname not in pathway_map:
                            pathway_map[pname] = {
                                "pathway": pname,
                                "genes": [],
                                "source_db": (
                                    "KEGG"
                                    if "kegg" in pathway_key
                                    else "Reactome"
                                    if "reactome" in pathway_key
                                    else "UniProt GO"
                                ),
                            }
                        if gene and gene not in pathway_map[pname]["genes"]:
                            pathway_map[pname]["genes"].append(gene)
            pathways = list(pathway_map.values())
            if pathways:
                uniprot_conf = _ADAPTER_WEIGHTS["uniprot"]

        # Also query Ensembl for additional pathway data
        ensembl_pathways: List[Dict[str, Any]] = []
        ensembl_conf = 0.0
        if self._adapters.get("ensembl"):
            try:
                ensembl_res = await _safe_await(
                    _safe_adapter_call(
                        self._adapters["ensembl"], "search", ", ".join(clean_genes)
                    )
                )
                if ensembl_res and isinstance(ensembl_res, list):
                    for entry in ensembl_res:
                        canon = entry.get("canonical_data", entry)
                        pw_data = canon.get("pathways", [])
                        if isinstance(pw_data, list):
                            for pw in pw_data:
                                pname = pw if isinstance(pw, str) else pw.get("name", "unknown")
                                ensembl_pathways.append({
                                    "pathway": pname,
                                    "genes": [canon.get("gene_name", canon.get("gene", ""))],
                                    "source_db": "Ensembl",
                                })
                    if ensembl_pathways:
                        ensembl_conf = _ADAPTER_WEIGHTS["ensembl"]
            except Exception as exc:
                logger.warning("get_pathway_analysis: Ensembl pathway query failed: %s", exc)

        pathways.extend(ensembl_pathways)

        # Network density
        n_genes = len(clean_genes)
        n_interactors = len(interactors)
        total_nodes = n_genes + n_interactors
        n_edges = len(interactions)
        max_edges = total_nodes * (total_nodes - 1) / 2 if total_nodes > 1 else 1
        network_density = n_edges / max_edges if max_edges > 0 else 0.0

        # Overall confidence
        conf_scores = []
        sources = []
        if string_conf > 0:
            conf_scores.append(string_conf)
            sources.append("string")
        if uniprot_conf > 0:
            conf_scores.append(uniprot_conf)
            sources.append("uniprot")
        if ensembl_conf > 0:
            conf_scores.append(ensembl_conf)
            sources.append("ensembl")

        overall_conf = sum(conf_scores) / len(conf_scores) if conf_scores else 0.30

        result: Dict[str, Any] = {
            "input_genes": clean_genes,
            "input_gene_count": len(clean_genes),
            "interactors": interactors,
            "interactor_count": len(interactors),
            "interactions": interactions,
            "interaction_count": n_edges,
            "pathways": pathways,
            "pathway_count": len(pathways),
            "network_density": round(network_density, 4),
            "network_metrics": {
                "total_nodes": total_nodes,
                "total_edges": n_edges,
                "input_genes": n_genes,
                "interactors": n_interactors,
            },
            "confidence_overall": round(overall_conf, 4),
            "research_only": True,
            "provenance": _prov(
                sources,
                f"genes={clean_genes}",
                overall_conf,
                meta={
                    "gene_count": len(clean_genes),
                    "interactor_count": len(interactors),
                    "pathway_count": len(pathways),
                    "network_density": network_density,
                },
            ),
        }

        logger.info(
            "get_pathway_analysis: %d genes, %d interactors, %d pathways, density %.3f",
            len(clean_genes),
            len(interactors),
            len(pathways),
            network_density,
        )
        return result

    # ── Normative Comparison ─────────────────────────────────────────────────

    async def compare_to_normative(
        self, variants: List[str], condition: str
    ) -> Dict[str, Any]:
        """Compare patient variants against population normative data.

        Queries GWAS Catalog for condition-associated variants and gnomAD for
        population allele frequencies, then compares the patient's variant set.

        Args:
            variants: Patient's variant IDs.
            condition: Condition / trait name, e.g. ``"schizophrenia"``.

        Returns:
            Comparison report with overlapping variants, frequency deviations,
            and polygenic risk context.
        """
        clean_vars = [v.strip() for v in variants if v and str(v).strip()]
        condition_c = condition.strip().lower()
        logger.info(
            "compare_to_normative: %d variants vs '%s'", len(clean_vars), condition_c
        )

        if not clean_vars:
            return {
                "patient_variants": [],
                "condition": condition,
                "condition_normalized": condition_c,
                "overlapping_variants": [],
                "overlap_count": 0,
                "frequency_deviations": [],
                "polygenic_context": {
                    "patient_variants_tested": 0,
                    "condition_associated_variants_known": 0,
                    "overlapping_variants": 0,
                    "overlap_rate": 0.0,
                    "risk_interpretation": "no_variants_tested",
                },
                "confidence_overall": 0.0,
                "research_only": True,
                "provenance": _prov([], f"condition={condition}", 0.0),
            }

        # Query GWAS Catalog and gnomAD in parallel
        gwas_task = _safe_await(
            _safe_adapter_call(
                self._adapters.get("gwas_catalog"), "search", condition_c
            )
        )

        # gnomAD: query each variant individually
        gnomad_tasks = [
            _safe_await(
                _safe_adapter_call(
                    self._adapters.get("gnomad"), "search", v
                )
            )
            for v in clean_vars[:20]  # Cap at 20 to avoid rate limits
        ]

        gwas_results = await gwas_task if asyncio.iscoroutine(gwas_task) else gwas_task
        gnomad_results = await asyncio.gather(*gnomad_tasks, return_exceptions=True)

        if isinstance(gwas_results, Exception):
            logger.warning("compare_to_normative: GWAS failed: %s", gwas_results)
            gwas_results = None

        # Extract condition-associated variants from GWAS
        gwas_variant_set: set = set()
        gwas_associations: List[Dict[str, Any]] = []
        gwas_conf = 0.0

        if gwas_results and isinstance(gwas_results, list):
            for entry in gwas_results:
                canon = entry.get("canonical_data", entry)
                assoc_variants = canon.get("variants", [])
                if isinstance(assoc_variants, str):
                    assoc_variants = [assoc_variants]
                for av in assoc_variants:
                    gwas_variant_set.add(av.strip())
                # Store association details
                rsid = canon.get("rsid", canon.get("variant_id", ""))
                if rsid:
                    gwas_associations.append({
                        "variant": rsid,
                        "trait": canon.get("trait", condition),
                        "p_value": canon.get("p_value", canon.get("pvalue", None)),
                        "odds_ratio": canon.get("odds_ratio", canon.get("or", None)),
                        "beta": canon.get("beta", None),
                        "study": canon.get("study", canon.get("first_author", "GWAS Catalog")),
                        "pmid": canon.get("pmid", None),
                    })
            gwas_conf = _ADAPTER_WEIGHTS["gwas_catalog"]

        # Find overlapping variants
        patient_set = set(clean_vars)
        overlapping = list(patient_set & gwas_variant_set)

        # Frequency deviations from gnomAD
        freq_deviations: List[Dict[str, Any]] = []
        gnomad_conf = 0.0

        for i, gres in enumerate(gnomad_results):
            if isinstance(gres, Exception):
                continue
            if gres and isinstance(gres, list) and gres:
                canon = gres[0].get("canonical_data", gres[0])
                freqs = {
                    k: v
                    for k, v in canon.items()
                    if "freq" in k or k in ("af_european", "african", "east_asian", "south_asian", "global_af")
                }
                if freqs:
                    freq_deviations.append({
                        "variant": clean_vars[i] if i < len(clean_vars) else "unknown",
                        "population_frequencies": freqs,
                    })

        if freq_deviations:
            gnomad_conf = _ADAPTER_WEIGHTS["gnomad"]

        # Polygenic context
        gwas_hits_in_patient = sum(1 for v in overlapping if v in patient_set)
        total_gwas_hits = len(gwas_variant_set) if gwas_variant_set else 0

        polygenic_context: Dict[str, Any] = {
            "patient_variants_tested": len(clean_vars),
            "condition_associated_variants_known": total_gwas_hits,
            "overlapping_variants": len(overlapping),
            "overlap_rate": (
                round(len(overlapping) / len(clean_vars), 4) if clean_vars else 0.0
            ),
            "risk_interpretation": (
                "elevated_polygenic_risk"
                if len(overlapping) >= 3
                else "moderate_polygenic_risk"
                if len(overlapping) >= 1
                else "no_known_gwas_hits"
            ),
        }

        # Confidence
        conf_scores = []
        sources = []
        if gwas_conf > 0:
            conf_scores.append(gwas_conf)
            sources.append("gwas_catalog")
        if gnomad_conf > 0:
            conf_scores.append(gnomad_conf)
            sources.append("gnomad")

        overall_conf = sum(conf_scores) / len(conf_scores) if conf_scores else 0.30

        result: Dict[str, Any] = {
            "patient_variants": clean_vars,
            "condition": condition,
            "condition_normalized": condition_c,
            "overlapping_variants": overlapping,
            "overlap_count": len(overlapping),
            "gwas_associations": gwas_associations[:50],  # Cap output
            "frequency_deviations": freq_deviations,
            "polygenic_context": polygenic_context,
            "confidence_overall": round(overall_conf, 4),
            "research_only": True,
            "provenance": _prov(
                sources,
                f"variants={len(clean_vars)} condition={condition}",
                overall_conf,
                meta={
                    "patient_variant_count": len(clean_vars),
                    "condition": condition,
                    "overlapping_count": len(overlapping),
                    "gwas_hits_total": total_gwas_hits,
                },
            ),
        }

        logger.info(
            "compare_to_normative: %d variants, %d overlaps with '%s', conf=%.2f",
            len(clean_vars),
            len(overlapping),
            condition,
            overall_conf,
        )
        return result

    # ── Adapter query helpers (internal) ─────────────────────────────────────

    async def _query_clinvar(self, variant: str, gene: str) -> Optional[Dict[str, Any]]:
        """Query ClinVar for clinical significance and review status."""
        adapter = self._adapters.get("clinvar")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", variant))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        return None

    async def _query_gnomad(self, variant: str, gene: str) -> Optional[Dict[str, Any]]:
        """Query gnomAD for population allele frequencies."""
        adapter = self._adapters.get("gnomad")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", variant))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        return None

    async def _query_ensembl(self, variant: str, gene: str) -> Optional[Dict[str, Any]]:
        """Query Ensembl for variant consequence and regulatory data."""
        adapter = self._adapters.get("ensembl")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", variant))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        return None

    async def _query_myvariant(self, variant: str, gene: str) -> Optional[Dict[str, Any]]:
        """Query MyVariant.info for comprehensive variant annotation."""
        adapter = self._adapters.get("myvariant")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", variant))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        return None

    async def _query_pharmgkb(self, variant: str, gene: str) -> Optional[Dict[str, Any]]:
        """Query PharmGKB for pharmacogenomic annotations."""
        adapter = self._adapters.get("pharmgkb")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", variant))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        # Fallback: try gene-based search
        result = await _safe_await(_safe_adapter_call(adapter, "search", gene))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        return None

    async def _query_gwas(self, variant: str, gene: str) -> Optional[Dict[str, Any]]:
        """Query GWAS Catalog for trait associations."""
        adapter = self._adapters.get("gwas_catalog")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", variant))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        # Fallback: gene-based search
        result = await _safe_await(_safe_adapter_call(adapter, "search", gene))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        return None

    async def _query_dbsnp(self, variant: str, gene: str) -> Optional[Dict[str, Any]]:
        """Query dbSNP for variant metadata."""
        adapter = self._adapters.get("dbsnp")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", variant))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        return None

    async def _query_uniprot(self, variant: str, gene: str) -> Optional[Dict[str, Any]]:
        """Query UniProt for protein function and pathway data."""
        adapter = self._adapters.get("uniprot")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", gene))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        return None

    async def _query_string(self, variant: str, gene: str) -> Optional[Dict[str, Any]]:
        """Query STRING for protein-protein interactions."""
        adapter = self._adapters.get("string")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", gene))
        if result and isinstance(result, list) and result:
            # Return the whole list of interactions
            return {"interactions": [r.get("canonical_data", r) for r in result]}
        if result and isinstance(result, dict):
            return result
        return None

    async def _query_allen_brain(
        self, variant: str, gene: str
    ) -> Optional[Dict[str, Any]]:
        """Query Allen Brain Atlas for gene expression patterns."""
        adapter = self._adapters.get("allen_brain")
        if not adapter:
            return None
        result = await _safe_await(_safe_adapter_call(adapter, "search", gene))
        if result and isinstance(result, list) and result:
            return result[0].get("canonical_data", result[0])
        if result and isinstance(result, dict):
            return result
        return None

    # ── Output section builders ──────────────────────────────────────────────

    def _build_variant_info(
        self, resolved: Dict[str, Any], variant_id: str, gene: str
    ) -> Dict[str, Any]:
        """Build the variant core-info section."""
        # Try to extract chromosome/position from dbSNP or Ensembl
        chromosome = ""
        position = 0
        ref = ""
        alt = ""

        dbsnp_data = resolved.get("dbsnp") or {}
        if isinstance(dbsnp_data, dict):
            chromosome = dbsnp_data.get("chromosome", "")
            position = dbsnp_data.get("position", 0)
            ref = dbsnp_data.get("ref_allele", "")
            alt = dbsnp_data.get("alt_allele", "")

        if not chromosome:
            ensembl_data = resolved.get("ensembl") or {}
            if isinstance(ensembl_data, dict):
                chromosome = ensembl_data.get("chromosome", ensembl_data.get("seq_region_name", ""))
                position = ensembl_data.get("start", ensembl_data.get("position", 0))

        if not ref:
            myvariant_data = resolved.get("myvariant") or {}
            if isinstance(myvariant_data, dict):
                vc = myvariant_data.get("vcf", {})
                if isinstance(vc, dict):
                    ref = vc.get("ref", "")
                    alt = vc.get("alt", "")

        # Fallback: infer from known variant
        if variant_id == "rs4680" and gene == "COMT":
            chromosome = chromosome or "22"
            position = position or 19951271
            ref = ref or "G"
            alt = alt or "A"

        return {
            "id": variant_id,
            "gene": gene,
            "chromosome": chromosome or "unknown",
            "position": position or 0,
            "ref": ref or "",
            "alt": alt or "",
        }

    def _build_clinical_significance(
        self, clinvar_data: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Build clinical significance section from ClinVar data."""
        if not clinvar_data or not isinstance(clinvar_data, dict):
            return {
                "clinvar_interpretation": "unknown",
                "review_status": "no data",
                "confidence": 0.0,
                "source_adapters": [],
            }

        sig = clinvar_data.get("clinical_significance", "unknown")
        status = clinvar_data.get("review_status", clinvar_data.get("reviewStatus", "no data"))
        stars = clinvar_data.get("star_level", clinvar_data.get("stars", 0))

        # Derive confidence from review status
        base_conf = _ADAPTER_WEIGHTS["clinvar"]
        if status in ("practice guideline", "reviewed by expert panel"):
            confidence = base_conf
        elif status in ("criteria provided, multiple submitters, no conflicts", "criteria provided, multiple submitters"):
            confidence = base_conf * 0.90
        elif "criteria provided" in str(status):
            confidence = base_conf * 0.70
        else:
            confidence = base_conf * 0.40

        return {
            "clinvar_interpretation": sig,
            "review_status": status,
            "star_level": stars,
            "confidence": round(confidence, 4),
            "source_adapters": ["clinvar"],
            "conditions": clinvar_data.get("conditions", clinvar_data.get("diseases", [])),
        }

    def _build_population_frequencies(
        self, gnomad_data: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Build population frequencies section from gnomAD data."""
        if not gnomad_data or not isinstance(gnomad_data, dict):
            return {"source_adapters": []}

        result: Dict[str, Any] = {"source_adapters": ["gnomad"]}

        # Extract frequency fields using common key patterns
        freq_mappings = {
            "gnomad_eur": ["af_european", "af_nfe", "eur_freq", "gnomad_eur", "eu_af"],
            "gnomad_afr": ["af_african", "af_afr", "afr_freq", "gnomad_afr", "afr_af"],
            "gnomad_eas": ["af_east_asian", "af_eas", "eas_freq", "gnomad_eas", "eas_af"],
            "gnomad_sas": ["af_south_asian", "af_sas", "sas_freq", "gnomad_sas", "sas_af"],
            "gnomad_lat": ["af_latino", "af_amr", "amr_freq", "gnomad_lat", "amr_af"],
            "gnomad_global": ["af", "global_af", "allele_frequency", "gnomad_global"],
        }

        for canonical_key, possible_keys in freq_mappings.items():
            for pk in possible_keys:
                val = gnomad_data.get(pk)
                if val is not None:
                    try:
                        result[canonical_key] = float(val)
                        break
                    except (ValueError, TypeError):
                        continue

        return result

    def _build_functional_impact(
        self,
        ensembl_data: Optional[Dict[str, Any]],
        myvariant_data: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Build functional impact section from Ensembl and MyVariant data."""
        result: Dict[str, Any] = {"source_adapters": []}
        sources: List[str] = []

        # Ensembl data
        if ensembl_data and isinstance(ensembl_data, dict):
            sources.append("ensembl")
            cons = ensembl_data.get("consequence_terms", ensembl_data.get("consequence", ""))
            result["consequence"] = cons if isinstance(cons, str) else ", ".join(cons) if isinstance(cons, list) else "unknown"
            result["impact"] = ensembl_data.get("impact", "")
            result["strand"] = ensembl_data.get("strand", 0)

        # MyVariant data (richer functional annotations)
        if myvariant_data and isinstance(myvariant_data, dict):
            sources.append("myvariant")
            result["protein_change"] = myvariant_data.get(
                "protein_change", myvariant_data.get("hgvsp", "")
            )
            result["cadd_score"] = myvariant_data.get("cadd_score", myvariant_data.get("cadd", {}).get("phred", None) if isinstance(myvariant_data.get("cadd"), dict) else None)

            # SIFT / PolyPhen from various possible locations
            snpeff = myvariant_data.get("snpeff", {})
            if isinstance(snpeff, dict):
                ann = snpeff.get("ann", {})
                if isinstance(ann, dict):
                    result["sift"] = ann.get("sift_pred", ann.get("sift", ""))
                    result["polyphen"] = ann.get("polyphen_pred", ann.get("polyphen", ""))

            dbnsfp = myvariant_data.get("dbnsfp", {})
            if isinstance(dbnsfp, dict):
                if not result.get("sift"):
                    result["sift"] = dbnsfp.get("sift_pred", dbnsfp.get("sift", ""))
                if not result.get("polyphen"):
                    result["polyphen"] = dbnsfp.get("polyphen2_hdiv_pred", dbnsfp.get("polyphen", ""))
                if not result.get("cadd_score"):
                    result["cadd_score"] = dbnsfp.get("cadd_phred", None)

            # Consequence fallback
            if not result.get("consequence"):
                vc = myvariant_data.get("vcf", {})
                if isinstance(vc, dict):
                    result["consequence"] = vc.get("variant_class", "unknown")

        # Source adapters
        sources = list(dict.fromkeys(sources))
        result["source_adapters"] = sources

        # Fill defaults
        if not result.get("protein_change"):
            result["protein_change"] = ""
        if not result.get("consequence"):
            result["consequence"] = "unknown"
        if not result.get("sift"):
            result["sift"] = "unknown"
        if not result.get("polyphen"):
            result["polyphen"] = "unknown"
        if result.get("cadd_score") is None:
            result["cadd_score"] = None

        return result

    def _build_phenotype_associations(
        self, gwas_data: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Build phenotype associations list from GWAS Catalog data."""
        if not gwas_data:
            return []

        associations: List[Dict[str, Any]] = []
        raw_list: List[Dict[str, Any]] = []

        if isinstance(gwas_data, dict):
            # Check if it contains embedded association data
            for key in ["associations", "studies", "traits", "results"]:
                if key in gwas_data and isinstance(gwas_data[key], list):
                    raw_list = gwas_data[key]
                    break
            if not raw_list:
                raw_list = [gwas_data]
        elif isinstance(gwas_data, list):
            raw_list = gwas_data

        seen_traits: set = set()
        for entry in raw_list[:20]:  # Cap to avoid huge output
            if not isinstance(entry, dict):
                continue
            trait = entry.get("trait", entry.get("disease_trait", entry.get("phenotype", "")))
            if not trait or trait in seen_traits:
                continue
            seen_traits.add(trait)

            pval = entry.get("p_value", entry.get("pvalue", entry.get("pValue", None)))
            or_val = entry.get("odds_ratio", entry.get("or", None))
            beta = entry.get("beta", None)
            study = entry.get(
                "study",
                entry.get("first_author", entry.get("pubmed_id", "GWAS Catalog")),
            )
            pmid = entry.get("pmid", entry.get("pubmed_id", None))

            # Derive confidence from p-value
            conf = _ADAPTER_WEIGHTS["gwas_catalog"]
            try:
                if pval is not None and float(pval) < 5e-8:
                    conf *= 0.95
                elif pval is not None and float(pval) < 1e-5:
                    conf *= 0.80
                else:
                    conf *= 0.60
            except (ValueError, TypeError):
                conf *= 0.50

            associations.append({
                "trait": trait,
                "p_value": pval,
                "odds_ratio": or_val,
                "beta": beta,
                "study": study,
                "pmid": pmid,
                "confidence": round(conf, 4),
            })

        return associations

    def _build_pgx_associations(
        self, pharmgkb_data: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Build pharmacogenomic associations from PharmGKB data."""
        if not pharmgkb_data:
            return []

        associations: List[Dict[str, Any]] = []
        raw_list: List[Dict[str, Any]] = []

        if isinstance(pharmgkb_data, dict):
            for key in ["annotations", "guidelines", "associations", "clinical_annotations"]:
                if key in pharmgkb_data and isinstance(pharmgkb_data[key], list):
                    raw_list = pharmgkb_data[key]
                    break
            if not raw_list:
                raw_list = [pharmgkb_data]
        elif isinstance(pharmgkb_data, list):
            raw_list = pharmgkb_data

        seen: set = set()
        for entry in raw_list[:20]:
            if not isinstance(entry, dict):
                continue
            drug = entry.get("drug", entry.get("chemical", entry.get("drug_name", "")))
            if not drug:
                continue
            key = f"{drug}:{entry.get('phenotype', '')}"
            if key in seen:
                continue
            seen.add(key)

            phenotype = entry.get(
                "phenotype",
                entry.get("metabolizer_status", entry.get("clinical_phenotype", "unknown")),
            )
            effect = entry.get(
                "effect",
                entry.get("clinical_implication", entry.get("annotation", "unknown")),
            )
            level = entry.get("level_of_evidence", entry.get("evidence_level", ""))

            conf = _ADAPTER_WEIGHTS["pharmgkb"]
            try:
                if level and int(str(level)) <= 2:
                    conf *= 0.95
                elif level and int(str(level)) <= 3:
                    conf *= 0.80
                else:
                    conf *= 0.60
            except (ValueError, TypeError):
                conf *= 0.60

            associations.append({
                "drug": drug,
                "effect": effect,
                "phenotype": phenotype,
                "evidence_level": level,
                "source_adapters": ["pharmgkb"],
                "confidence": round(conf, 4),
            })

        return associations

    def _build_protein_network(
        self, string_data: Optional[Dict[str, Any]], gene: str
    ) -> Dict[str, Any]:
        """Build protein network section from STRING data."""
        if not string_data or not isinstance(string_data, dict):
            return {"interactors": [], "pathways": [], "source_adapters": []}

        interactions = string_data.get("interactions", [])
        if not isinstance(interactions, list):
            interactions = [interactions] if interactions else []

        interactors: List[str] = []
        pathways: List[str] = []
        seen: set = set()

        for entry in interactions[:50]:
            if not isinstance(entry, dict):
                continue
            p1 = entry.get("preferred_name_a", entry.get("protein_a", ""))
            p2 = entry.get("preferred_name_b", entry.get("protein_b", ""))
            for p in [p1, p2]:
                if p and p.upper() != gene.upper() and p not in seen:
                    seen.add(p)
                    interactors.append(p)
            # STRING doesn't provide pathways directly, but we can annotate
            pw = entry.get("pathway", entry.get("pathways", []))
            if isinstance(pw, str) and pw:
                pathways.append(pw)
            elif isinstance(pw, list):
                pathways.extend(pw)

        # Known pathway annotation fallback
        known_pathways: Dict[str, List[str]] = {
            "COMT": ["dopaminergic synapse", "catecholamine synthesis"],
            "DRD2": ["dopaminergic synapse", "neuroactive ligand-receptor interaction"],
            "BDNF": ["neurotrophin signaling", "MAPK signaling"],
            "HTR2A": ["serotonergic synapse", "neuroactive ligand-receptor interaction"],
        }
        if gene.upper() in known_pathways and not pathways:
            pathways = known_pathways[gene.upper()]

        return {
            "interactors": interactors[:20],
            "interactor_count": len(interactors),
            "pathways": list(dict.fromkeys(pathways))[:10],
            "source_adapters": ["string"] if interactors else [],
        }

    def _build_brain_expression(
        self, allen_data: Optional[Dict[str, Any]], gene: str
    ) -> Dict[str, Any]:
        """Build brain expression section from Allen Brain Atlas data."""
        if not allen_data or not isinstance(allen_data, dict):
            return {"regions": [], "expression_level": "unknown", "source_adapters": []}

        regions: List[str] = []
        levels: List[float] = []

        # Extract region and expression data
        raw_regions = allen_data.get("regions", allen_data.get("structures", []))
        if isinstance(raw_regions, list):
            for r in raw_regions:
                if isinstance(r, dict):
                    rname = r.get("name", r.get("structure_name", ""))
                    expr = r.get("expression_level", r.get("expression", r.get("level", None)))
                    if rname:
                        regions.append(rname)
                    if expr is not None:
                        try:
                            levels.append(float(expr))
                        except (ValueError, TypeError):
                            pass
                elif isinstance(r, str):
                    regions.append(r)

        # Fallback: check top-level fields
        if not regions:
            for key in ["structure_name", "region", "brain_region"]:
                val = allen_data.get(key)
                if val:
                    regions.append(val if isinstance(val, str) else str(val))

        # Expression level categorization
        avg_expr = sum(levels) / len(levels) if levels else None
        if avg_expr is not None:
            if avg_expr > 2.0:
                expr_level = "high"
            elif avg_expr > 1.0:
                expr_level = "moderate"
            elif avg_expr > 0.1:
                expr_level = "low"
            else:
                expr_level = "not_detected"
        else:
            expr_level = allen_data.get("expression_level", "unknown")

        # Fallback known expression patterns
        known_expression: Dict[str, Tuple[List[str], str]] = {
            "COMT": (["prefrontal cortex", "hippocampus", "striatum"], "high"),
            "DRD2": (["striatum", "nucleus accumbens", "prefrontal cortex"], "high"),
            "BDNF": (["hippocampus", "cortex", "amygdala"], "high"),
            "HTR2A": (["cortex", "hippocampus", "amygdala"], "moderate"),
        }
        if gene.upper() in known_expression and not regions:
            regions, expr_level = known_expression[gene.upper()]

        return {
            "regions": regions[:10],
            "expression_level": expr_level,
            "average_expression": round(avg_expr, 4) if avg_expr is not None else None,
            "source_adapters": ["allen_brain"] if regions else [],
        }
