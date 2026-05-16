"""Bridge connecting Knowledge Layer medication adapters to Medication Analyzer.

Provides normalized, provenance-aware medication data for drug lookup,
interaction checking, pharmacogenomic checking, and contraindications.
Decision-support only -- not a replacement for clinical pharmacy review.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

_WEIGHTS: dict[str, float] = {"rxnorm": 0.95, "pharmgkb": 0.88, "openfda": 0.75, "clinvar": 0.90, "local_fallback": 0.50}
_RESEARCH_SOURCES: set[str] = {"pharmgkb", "openfda", "clinvar"}
_LOCAL_RULES: list[dict[str, Any]] = [
    {"drugs": ["sertraline", "tramadol"], "severity": "severe", "description": "Risk of serotonin syndrome.", "recommendation": "Use an alternative analgesic.", "evidence_grade": "B"},
    {"drugs": ["warfarin", "aspirin"], "severity": "moderate", "description": "Increased bleeding risk.", "recommendation": "Monitor INR closely.", "evidence_grade": "B"},
    {"drugs": ["lithium", "ibuprofen"], "severity": "moderate", "description": "NSAIDs may increase lithium levels.", "recommendation": "Monitor lithium levels.", "evidence_grade": "B"},
    {"drugs": ["ssri", "maoi"], "severity": "severe", "description": "Serotonin syndrome risk.", "recommendation": "Contraindicated. Allow washout.", "evidence_grade": "A"},
]
_SEV = {"none": 0, "mild": 1, "moderate": 2, "severe": 3}


def _prov(sources: list[str], query: str, confidence: float, *, research: bool = False, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build provenance envelope."""
    p: dict[str, Any] = {"sources": sources, "query": query, "confidence": round(confidence, 4),
        "confidence_tier": "high" if confidence >= 0.9 else "moderate" if confidence >= 0.7 else "low" if confidence >= 0.4 else "insufficient",
        "is_research_only": research, "accessed_at": datetime.now(timezone.utc).isoformat(), "bridge": "medication_analyzer_bridge", "version": "1.0.0"}
    if meta: p["metadata"] = meta
    return p


class MedicationAnalyzerBridge:
    """Bridge connecting Knowledge Layer medication adapters to Medication Analyzer."""

    def __init__(self, registry: Any) -> None:
        self._rxnorm = registry.get("rxnorm")
        self._pharmgkb = registry.get("pharmgkb")
        self._openfda = registry.get("openfda")
        self._clinvar = registry.get("clinvar")
        for name, adapter in [("rxnorm", self._rxnorm), ("pharmgkb", self._pharmgkb), ("openfda", self._openfda), ("clinvar", self._clinvar)]:
            if not adapter: logger.warning("MedicationAnalyzerBridge: %s adapter not available", name)

    async def normalize_medication(self, medication_name: str) -> dict[str, Any]:
        """Normalize medication name to canonical form with full provenance."""
        query = medication_name.strip()
        logger.info("normalize_medication: %s", query)
        if self._rxnorm:
            try:
                r = await self._rxnorm.normalize(query)
                if r and r.get("rxcui"): return {"canonical_name": r.get("name", query), "rxcui": r["rxcui"], "tty": r.get("tty", "UNK"), "provenance": _prov(["rxnorm"], query, _WEIGHTS["rxnorm"], meta={"adapter_response": r})}
            except Exception as e: logger.warning("normalize_medication: RxNorm failed: %s", e)
        if self._pharmgkb:
            try:
                r = await self._pharmgkb.lookup_drug(query)
                if r and r.get("pharmgkb_id"): return {"canonical_name": r.get("name", query), "pharmgkb_id": r["pharmgkb_id"], "provenance": _prov(["pharmgkb"], query, _WEIGHTS["pharmgkb"], research=True, meta={"adapter_response": r})}
            except Exception as e: logger.warning("normalize_medication: PharmGKB failed: %s", e)
        logger.info("normalize_medication: local fallback for %s", query)
        return {"canonical_name": query.title(), "rxcui": None, "pharmgkb_id": None, "tty": "UNK",
            "provenance": _prov(["local_fallback"], query, _WEIGHTS["local_fallback"], research=True, meta={"note": "No adapter available"})}

    async def check_interactions(self, medications: list[str]) -> dict[str, Any]:
        """Check drug-drug interactions with confidence scoring."""
        logger.info("check_interactions: %s", medications)
        clean_meds = [m.strip() for m in medications if m and str(m).strip()]
        lower_meds = [m.lower() for m in clean_meds]
        interactions: list[dict[str, Any]] = []
        sources: list[str] = []
        scores: list[float] = []
        for adapter_name, adapter in [("openfda", self._openfda), ("pharmgkb", self._pharmgkb)]:
            if not adapter: continue
            try:
                r = await adapter.check_interactions(clean_meds) if adapter_name == "openfda" else await adapter.check_interactions(clean_meds)
                if r and r.get("interactions"):
                    for ix in r["interactions"]: interactions.append({**ix, "provenance_source": adapter_name, "is_research_only": True})
                    sources.append(adapter_name); scores.append(_WEIGHTS[adapter_name])
            except Exception as e: logger.warning("check_interactions: %s failed: %s", adapter_name, e)
        if not interactions:
            logger.info("check_interactions: using local fallback")
            for rule in _LOCAL_RULES:
                if all(any(drug in name for name in lower_meds) for drug in rule["drugs"]):
                    interactions.append({"drugs": list(rule["drugs"]), "severity": rule["severity"], "description": rule["description"],
                        "recommendation": rule["recommendation"], "provenance_source": "local_fallback", "is_research_only": True, "evidence_grade": rule["evidence_grade"]})
            if interactions: sources.append("local_fallback"); scores.append(_WEIGHTS["local_fallback"])
        worst = "none"
        for ix in interactions:
            sev = str(ix.get("severity", "none"))
            if _SEV.get(sev, 0) > _SEV.get(worst, 0): worst = sev
        avg_c = sum(scores) / len(scores) if scores else 0.30
        return {"medications": clean_meds, "interactions": interactions, "interaction_count": len(interactions), "worst_severity": worst,
            "provenance": _prov(sources or ["none"], str(clean_meds), avg_c, research=bool(set(sources) & _RESEARCH_SOURCES or "local_fallback" in sources), meta={"severity_order": _SEV})}

    async def check_pgx_interactions(self, medication: str, genetic_profile: dict[str, Any]) -> dict[str, Any]:
        """Check pharmacogenomic interactions for a medication."""
        logger.info("check_pgx_interactions: %s", medication)
        query = medication.strip()
        results: list[dict[str, Any]] = []
        sources: list[str] = []
        scores: list[float] = []
        for adapter_name, adapter in [("pharmgkb", self._pharmgkb), ("clinvar", self._clinvar)]:
            if not adapter: continue
            try:
                r = await adapter.get_pgx_guidance(query, genetic_profile) if adapter_name == "pharmgkb" else await adapter.get_variant_drug_links(query, genetic_profile)
                key = "guidance" if adapter_name == "pharmgkb" else "associations"
                if r and r.get(key):
                    for item in r[key]: results.append({**item, "provenance_source": adapter_name, "is_research_only": True})
                    sources.append(adapter_name); scores.append(_WEIGHTS[adapter_name])
            except Exception as e: logger.warning("check_pgx_interactions: %s failed: %s", adapter_name, e)
        avg_c = sum(scores) / len(scores) if scores else 0.30
        return {"medication": query, "genetic_profile_summary": {"genes_tested": list(genetic_profile.keys()), "gene_count": len(genetic_profile)},
            "pgx_guidance": results, "guidance_count": len(results),
            "provenance": _prov(sources or ["none"], query, avg_c, research=True, meta={"genes_queried": list(genetic_profile.keys()), "sources_responsive": len(sources)})}

    async def get_medication_details(self, medication: str) -> dict[str, Any]:
        """Get comprehensive medication details with provenance."""
        logger.info("get_medication_details: %s", medication)
        query = medication.strip()
        details: dict[str, Any] = {"query": query}
        sources: list[str] = []
        scores: list[float] = []
        if self._rxnorm:
            try:
                r = await self._rxnorm.get_details(query)
                if r: details["canonical_identity"] = {"rxcui": r.get("rxcui"), "name": r.get("name"), "synonyms": r.get("synonyms", []), "drug_class": r.get("drug_class")}; sources.append("rxnorm"); scores.append(_WEIGHTS["rxnorm"])
            except Exception as e: logger.warning("get_medication_details: RxNorm failed: %s", e)
        if self._openfda:
            try:
                r = await self._openfda.get_label(query)
                if r: details["fda_labeling"] = {"warnings": r.get("warnings", []), "contraindications": r.get("contraindications", []), "adverse_reactions": r.get("adverse_reactions", []), "boxed_warnings": r.get("boxed_warnings", [])}; sources.append("openfda"); scores.append(_WEIGHTS["openfda"])
            except Exception as e: logger.warning("get_medication_details: openFDA failed: %s", e)
        if self._pharmgkb:
            try:
                r = await self._pharmgkb.get_drug_annotations(query)
                if r: details["pharmacogenomics"] = {"annotated_genes": r.get("genes", []), "clinical_annotations": r.get("annotations", []), "evidence_level": r.get("evidence_level")}; sources.append("pharmgkb"); scores.append(_WEIGHTS["pharmgkb"])
            except Exception as e: logger.warning("get_medication_details: PharmGKB failed: %s", e)
        avg_c = sum(scores) / len(scores) if scores else 0.30
        return {"medication": query, "details": details, "provenance": _prov(sources or ["local_fallback"], query, avg_c, research=bool(set(sources) & _RESEARCH_SOURCES), meta={"sources_responsive": len(sources)})}

    async def get_contraindications(self, medication: str, patient_conditions: list[str]) -> dict[str, Any]:
        """Check contraindications with evidence grading."""
        logger.info("get_contraindications: %s conditions=%s", medication, patient_conditions)
        query = medication.strip()
        clean_conds = [c.strip() for c in patient_conditions if c and str(c).strip()]
        contras: list[dict[str, Any]] = []
        sources: list[str] = []
        scores: list[float] = []
        if self._openfda:
            try:
                r = await self._openfda.get_contraindications(query)
                if r and r.get("contraindications"):
                    for c in r["contraindications"]:
                        match = any(cond.lower() in c.get("condition", "").lower() for cond in clean_conds)
                        contras.append({"condition": c.get("condition", "Unknown"), "severity": c.get("severity", "unknown"), "description": c.get("description", ""),
                            "patient_match": match, "provenance_source": "openfda", "is_research_only": True, "evidence_grade": "C"})
                    sources.append("openfda"); scores.append(_WEIGHTS["openfda"])
            except Exception as e: logger.warning("get_contraindications: openFDA failed: %s", e)
        if self._pharmgkb:
            try:
                r = await self._pharmgkb.get_contraindications(query, clean_conds)
                if r and r.get("contraindications"):
                    for c in r["contraindications"]: contras.append({**c, "provenance_source": "pharmgkb", "is_research_only": True})
                    sources.append("pharmgkb"); scores.append(_WEIGHTS["pharmgkb"])
            except Exception as e: logger.warning("get_contraindications: PharmGKB failed: %s", e)
        avg_c = sum(scores) / len(scores) if scores else 0.30
        matched = [c for c in contras if c.get("patient_match")]
        return {"medication": query, "patient_conditions": clean_conds, "contraindications": contras, "matched_contraindications": matched, "match_count": len(matched),
            "provenance": _prov(sources or ["local_fallback"], f"{query} + {clean_conds}", avg_c, research=True, meta={"conditions_checked": len(clean_conds), "total_found": len(contras), "patient_matches": len(matched)})}
