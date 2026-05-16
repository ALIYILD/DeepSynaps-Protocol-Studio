"""Bridge connecting Knowledge Layer PGx adapters to Genetic Medication Analyzer.

Provides gene-drug guidance, CPIC retrieval, variant pathogenicity,
phenotype prediction, and full PGx summaries.
Decision-support only -- not a replacement for clinical pharmacogenomic testing.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

_WEIGHTS: dict[str, float] = {"pharmgkb_cpic": 0.92, "pharmgkb_clinical": 0.85, "clinvar_pathogenic": 0.90, "clinvar_uncertain": 0.50, "local_fallback": 0.35}

_LOCAL_CPIC: dict[str, dict[str, Any]] = {
    "CYP2D6": {"drugs": ["nortriptyline", "amitriptyline", "paroxetine", "fluoxetine", "risperidone"],
        "phenotype_guidance": {
            "ultrarapid_metabolizer": {"implication": "Reduced plasma concentrations", "recommendation": "Consider alternative or monitor levels.", "classification": "moderate"},
            "extensive_metabolizer": {"implication": "Normal metabolism", "recommendation": "Start with standard dosing.", "classification": "standard"},
            "intermediate_metabolizer": {"implication": "Reduced metabolism", "recommendation": "Consider 25% dose reduction.", "classification": "moderate"},
            "poor_metabolizer": {"implication": "Markedly reduced metabolism", "recommendation": "Avoid if possible; consider alternative.", "classification": "strong"},
        }},
    "CYP2C19": {"drugs": ["escitalopram", "sertraline", "citalopram", "diazepam"],
        "phenotype_guidance": {
            "ultrarapid_metabolizer": {"implication": "Increased metabolism", "recommendation": "Start standard dose; titrate.", "classification": "optional"},
            "extensive_metabolizer": {"implication": "Normal metabolism", "recommendation": "Start with standard dosing.", "classification": "standard"},
            "intermediate_metabolizer": {"implication": "Reduced metabolism", "recommendation": "Consider 50% starting dose reduction.", "classification": "moderate"},
            "poor_metabolizer": {"implication": "Markedly reduced metabolism", "recommendation": "Avoid standard dosing; consider alternative.", "classification": "strong"},
        }},
}

_DIPTABLE: dict[str, dict[str, str]] = {
    "CYP2D6": {"*1/*1": "extensive_metabolizer", "*1/*2": "extensive_metabolizer", "*1/*4": "intermediate_metabolizer", "*4/*4": "poor_metabolizer"},
    "CYP2C19": {"*1/*1": "extensive_metabolizer", "*1/*2": "intermediate_metabolizer", "*2/*2": "poor_metabolizer", "*17/*17": "ultrarapid_metabolizer"},
}


def _prov(sources: list[str], query: str, confidence: float, *, research: bool = True, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build provenance envelope."""
    p: dict[str, Any] = {"sources": sources, "query": query, "confidence": round(confidence, 4),
        "confidence_tier": "high" if confidence >= 0.9 else "moderate" if confidence >= 0.7 else "low" if confidence >= 0.4 else "insufficient",
        "is_research_only": research, "accessed_at": datetime.now(timezone.utc).isoformat(), "bridge": "genetic_analyzer_bridge", "version": "1.0.0"}
    if meta: p["metadata"] = meta
    return p


class GeneticAnalyzerBridge:
    """Bridge connecting Knowledge Layer PGx adapters to Genetic Medication Analyzer."""

    def __init__(self, registry: Any) -> None:
        self._pharmgkb = registry.get("pharmgkb")
        self._clinvar = registry.get("clinvar")
        if not self._pharmgkb: logger.warning("GeneticAnalyzerBridge: PharmGKB adapter not available")
        if not self._clinvar: logger.warning("GeneticAnalyzerBridge: ClinVar adapter not available")

    async def get_gene_drug_guidance(self, gene: str, drug: str) -> dict[str, Any]:
        """Get CPIC guideline-based guidance for gene-drug pair."""
        gene_c, drug_c = gene.strip().upper(), drug.strip().lower()
        query = f"{gene_c}:{drug_c}"
        logger.info("get_gene_drug_guidance: %s", query)
        guidance: list[dict[str, Any]] = []
        sources: list[str] = []
        scores: list[float] = []
        if self._pharmgkb:
            try:
                r = await self._pharmgkb.get_cpic_guideline(gene_c, drug_c)
                if r and r.get("guidelines"):
                    for g in r["guidelines"]:
                        guidance.append({"gene": gene_c, "drug": drug_c, "phenotype": g.get("phenotype", "Unknown"), "implication": g.get("implication", ""),
                            "recommendation": g.get("recommendation", ""), "classification": g.get("classification", "unknown"), "evidence_level": g.get("evidence_level", "Unknown"),
                            "guideline_source": "CPIC", "pmids": g.get("pmids", []), "provenance_source": "pharmgkb", "is_research_only": True})
                    sources.append("pharmgkb"); scores.append(_WEIGHTS["pharmgkb_cpic"])
            except Exception as e: logger.warning("get_gene_drug_guidance: PharmGKB failed: %s", e)
        if not guidance:
            logger.info("get_gene_drug_guidance: local fallback for %s", query)
            local = _LOCAL_CPIC.get(gene_c)
            if local and drug_c in [d.lower() for d in local.get("drugs", [])]:
                for ph, gd in local.get("phenotype_guidance", {}).items():
                    guidance.append({"gene": gene_c, "drug": drug_c, "phenotype": ph, **gd, "evidence_level": "C", "guideline_source": "CPIC (embedded fallback)", "pmids": [], "provenance_source": "local_fallback", "is_research_only": True})
                sources.append("local_fallback"); scores.append(_WEIGHTS["local_fallback"])
        avg_c = sum(scores) / len(scores) if scores else 0.25
        return {"gene": gene_c, "drug": drug_c, "guidance": guidance, "guidance_count": len(guidance),
            "provenance": _prov(sources or ["none"], query, avg_c, meta={"gene": gene_c, "drug": drug_c, "phenotypes_covered": len(guidance)})}

    async def assess_variant_pathogenicity(self, variant_id: str) -> dict[str, Any]:
        """Assess variant pathogenicity from ClinVar with confidence."""
        variant_c = variant_id.strip()
        logger.info("assess_variant_pathogenicity: %s", variant_c)
        assessment: dict[str, Any] = {"variant_id": variant_c, "clinical_significance": "unknown", "confidence": 0.0}
        sources: list[str] = []
        scores: list[float] = []
        if self._clinvar:
            try:
                r = await self._clinvar.get_variant(variant_c)
                if r:
                    sig, status, stars = r.get("clinical_significance", "unknown"), r.get("review_status", "no_assertion"), r.get("star_level", 0)
                    base = _WEIGHTS["clinvar_pathogenic"] if status in ("practice_guideline", "reviewed_by_expert_panel") else 0.70 if status in ("criteria_provided", "multiple_submitters") else _WEIGHTS["clinvar_uncertain"]
                    assessment = {"variant_id": variant_c, "clinical_significance": sig, "review_status": status, "star_level": stars, "gene": r.get("gene"), "hgvs": r.get("hgvs"), "conditions": r.get("conditions", []), "submissions": r.get("submission_count", 0)}
                    sources.append("clinvar"); scores.append(base)
            except Exception as e: logger.warning("assess_variant_pathogenicity: ClinVar failed: %s", e)
        avg_c = sum(scores) / len(scores) if scores else 0.20
        return {"variant_id": variant_c, "assessment": assessment, "provenance": _prov(sources or ["none"], variant_c, avg_c, meta={"variant_id": variant_c, "clinical_significance": assessment["clinical_significance"], "sources_responsive": len(sources)})}

    async def predict_phenotype(self, gene: str, variants: list[str]) -> dict[str, Any]:
        """Predict metabolizer phenotype from variants."""
        gene_c = gene.strip().upper()
        var_list = [v.strip() for v in variants if v and str(v).strip()]
        logger.info("predict_phenotype: %s %s", gene_c, var_list)
        predicted, meta = "unknown", {"gene": gene_c, "variants": var_list}
        sources, scores = [], []
        if self._pharmgkb:
            try:
                r = await self._pharmgkb.get_phenotype(gene_c, var_list)
                if r and r.get("phenotype"): predicted = r["phenotype"]; sources.append("pharmgkb"); scores.append(_WEIGHTS["pharmgkb_clinical"]); meta["activity_score"] = r.get("activity_score")
            except Exception as e: logger.warning("predict_phenotype: PharmGKB failed: %s", e)
        if predicted == "unknown":
            logger.info("predict_phenotype: local fallback for %s", gene_c)
            dip = "/".join(sorted(var_list[:2])) if len(var_list) >= 2 else None
            table = _DIPTABLE.get(gene_c, {})
            if dip and dip in table: predicted = table[dip]; sources.append("local_fallback"); scores.append(_WEIGHTS["local_fallback"]); meta["diplotype_key"] = dip
        avg_c = sum(scores) / len(scores) if scores else 0.20
        return {"gene": gene_c, "variants": var_list, "predicted_phenotype": predicted, "activity_score": meta.get("activity_score"),
            "provenance": _prov(sources or ["none"], f"{gene_c}:{var_list}", avg_c, meta=meta)}

    async def get_pgx_summary(self, genetic_profile: dict[str, Any], medications: list[str]) -> dict[str, Any]:
        """Get full PGx summary for patient-medication combinations."""
        logger.info("get_pgx_summary: genes=%s meds=%s", list(genetic_profile.keys()), medications)
        clean_meds = [m.strip().lower() for m in medications if m and str(m).strip()]
        genes = list(genetic_profile.keys())
        per_gene: dict[str, list[dict[str, Any]]] = {}
        all_scores: list[float] = []
        sources_used: set[str] = set()
        actionable: list[dict[str, Any]] = []
        total_gd = 0
        for gene in genes:
            gup = gene.strip().upper()
            gvars = genetic_profile.get(gene, [])
            if not isinstance(gvars, list): gvars = [gvars]
            gresults: list[dict[str, Any]] = []
            for med in clean_meds:
                gd = await self.get_gene_drug_guidance(gup, med)
                if gd.get("guidance"):
                    for item in gd["guidance"]:
                        total_gd += 1; gresults.append(item)
                        if item.get("classification") in ("strong", "moderate"):
                            actionable.append({"gene": gup, "drug": med, "classification": item["classification"], "recommendation": item.get("recommendation", "")})
                if gvars:
                    ph = await self.predict_phenotype(gup, gvars)
                    if ph.get("predicted_phenotype") != "unknown":
                        gresults.append({"type": "phenotype_prediction", "gene": gup, "predicted_phenotype": ph["predicted_phenotype"], "activity_score": ph.get("activity_score"), "provenance": ph.get("provenance", {})})
                for src in gd.get("provenance", {}).get("sources", []): sources_used.add(src)
                all_scores.append(gd.get("provenance", {}).get("confidence", 0.0))
            if gresults: per_gene[gup] = gresults
        avg_c = sum(all_scores) / len(all_scores) if all_scores else 0.25
        return {"genetic_profile": {"genes_tested": genes, "gene_count": len(genes), "medications_queried": clean_meds, "medication_count": len(clean_meds)},
            "per_gene_results": per_gene, "summary": {"total_guidance_items": total_gd, "actionable_findings": actionable, "actionable_count": len(actionable), "genes_with_results": list(per_gene.keys())},
            "provenance": _prov(list(sources_used) or ["none"], f"genes={genes} drugs={clean_meds}", avg_c, meta={"combinations_evaluated": len(genes) * len(clean_meds), "genes": genes, "medications": clean_meds})}
