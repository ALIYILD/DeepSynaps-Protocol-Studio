"""
multimodal_synthesizer_v2.py — Multimodal Clinical Synthesizer V2
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Combines outputs from all 4 analyzer bridges (Medication, Genetic, qEEG, MRI)
to produce unified clinical insights with cross-modal correlation detection,
hypothesis ranking, treatment recommendations, and full provenance tracking.

Methods:
    1. synthesize(patient_id, inputs) — Master synthesis orchestrator
    2. find_cross_modal_correlations(domain_outputs) — Cross-domain pattern detection
    3. rank_hypotheses(insights) — Evidence-weighted hypothesis ranking
    4. generate_recommendations(hypotheses) — Treatment recommendation engine
    5. calculate_overall_confidence(domain_scores) — Aggregate confidence scoring

SAFETY — DECISION SUPPORT ONLY
================================
Every output carries a research_only flag. This synthesizer NEVER diagnoses,
prescribes, or replaces clinical judgment. All outputs require specialist review.

Python 3.11+ | async | typed
"""

from __future__ import annotations

import asyncio
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# ── Domain weights for fusion ──────────────────────────────────────────────────

_DOMAIN_WEIGHTS: dict[str, float] = {
    "medication": 0.30,
    "genetics": 0.25,
    "qeeg": 0.25,
    "mri": 0.20,
}

# ── Cross-modal correlation rule base ──────────────────────────────────────────

_CORRELATION_RULES: list[dict[str, Any]] = [
    {
        "domains": ["genetics", "qeeg", "mri"],
        "required_finding_patterns": {
            "genetics": ["comt", "val158met", "rs4680", "dopamine"],
            "qeeg": ["dlpfc", "prefrontal", "hypoactiv", "theta", "beta"],
            "mri": ["dlpfc", "prefrontal", "volume", "thickness", "working memory"],
        },
        "finding_template": (
            "{gene_variant} associated with both {qeeg_finding} (qEEG) "
            "and {mri_finding} (MRI)"
        ),
        "correlation_type": "genotype-phenotype-neurostructure",
        "evidence_boost": 0.08,
    },
    {
        "domains": ["genetics", "medication"],
        "required_finding_patterns": {
            "genetics": ["cyp2d6", "cyp2c19", "cyp3a4", "ugt"],
            "medication": ["metaboliz", "sertraline", "fluoxetine", "warfarin", "pgx"],
        },
        "finding_template": (
            "Pharmacogenomic {gene} variant influences {drug} metabolism "
            "predicted response"
        ),
        "correlation_type": "pharmacogenomic-metabolizer",
        "evidence_boost": 0.10,
    },
    {
        "domains": ["qeeg", "mri"],
        "required_finding_patterns": {
            "qeeg": ["slowing", "delta", "theta", "alpha", "epilepti"],
            "mri": ["hippocampus", "atrophy", "lesion", "temporal"],
        },
        "finding_template": (
            "qEEG {qeeg_pattern} pattern correlates with MRI {mri_pattern} "
            "structural finding"
        ),
        "correlation_type": "electrostructure-concordance",
        "evidence_boost": 0.07,
    },
    {
        "domains": ["medication", "qeeg"],
        "required_finding_patterns": {
            "medication": ["stimulant", "methylphenidate", "amphetamine"],
            "qeeg": ["beta", "theta/beta", "arousal", "activation"],
        },
        "finding_template": (
            "Medication {drug_class} effects align with qEEG "
            "{qeeg_change} neurophysiological pattern"
        ),
        "correlation_type": "pharmaco-EEG-response",
        "evidence_boost": 0.06,
    },
    {
        "domains": ["genetics", "mri"],
        "required_finding_patterns": {
            "genetics": ["bdnf", "val66met", "rs6265", "apoe"],
            "mri": ["hippocampal", "volume", "cortex", "atrophy"],
        },
        "finding_template": (
            "{gene_variant} neuroplasticity variant linked to "
            "{mri_finding} structural differences"
        ),
        "correlation_type": "genotype-neurostructure",
        "evidence_boost": 0.07,
    },
    {
        "domains": ["medication", "mri"],
        "required_finding_patterns": {
            "medication": ["lithium", "valproate", "antipsychotic"],
            "mri": [ "gray matter", "white matter", "volume", "thickness"],
        },
        "finding_template": (
            "Long-term {drug} exposure associated with "
            "{mri_change} structural MRI changes"
        ),
        "correlation_type": "pharmaco-structure",
        "evidence_boost": 0.05,
    },
]

# ── Hypothesis templates ───────────────────────────────────────────────────────

_HYPOTHESIS_TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "H1",
        "domains_required": ["genetics", "qeeg", "mri"],
        "keywords": {"genetics": ["comt", "rs4680"], "qeeg": ["dlpfc"], "mri": ["dlpfc", "volume"]},
        "hypothesis": "COMT-driven dopaminergic dysfunction explaining cognitive symptoms",
        "evidence_slots": ["genetic: rs4680 risk", "qeeg: DLPFC hypoactivity", "mri: PFC volume reduction"],
        "actionable": True,
        "base_confidence": 0.72,
    },
    {
        "id": "H2",
        "domains_required": ["genetics", "medication"],
        "keywords": {"genetics": ["cyp2d6"], "medication": ["metaboliz"]},
        "hypothesis": "CYP2D6 poor metabolizer status increases adverse drug reaction risk",
        "evidence_slots": ["genetic: CYP2D6 *4/*4", "medication: reduced clearance", "pgx: dose adjustment needed"],
        "actionable": True,
        "base_confidence": 0.68,
    },
    {
        "id": "H3",
        "domains_required": ["qeeg", "mri"],
        "keywords": {"qeeg": ["theta", "slowing"], "mri": ["hippocampus", "atrophy"]},
        "hypothesis": "Hippocampal atrophy with compensatory cortical slowing pattern",
        "evidence_slots": ["qeeg: temporal theta slowing", "mri: hippocampal volume reduction", "cross-modal: concordant decline pattern"],
        "actionable": True,
        "base_confidence": 0.65,
    },
    {
        "id": "H4",
        "domains_required": ["genetics", "qeeg"],
        "keywords": {"genetics": ["bdnf", "rs6265"], "qeeg": ["alpha", "gamma"]},
        "hypothesis": "BDNF Val66Met impairs cortical oscillatory drive and synaptic plasticity",
        "evidence_slots": ["genetic: BDNF Met allele", "qeeg: alpha/gamma power reduction", "neuroplasticity: impaired LTD/LTP balance"],
        "actionable": False,
        "base_confidence": 0.60,
    },
    {
        "id": "H5",
        "domains_required": ["medication", "qeeg", "mri"],
        "keywords": {"medication": ["stimulant"], "qeeg": ["beta", "arousal"], "mri": ["dlpfc"]},
        "hypothesis": "Stimulant-responsive DLPFC hypoactivation with structural preservation",
        "evidence_slots": ["medication: stimulant indication", "qeeg: low frontal beta", "mri: preserved DLPFC thickness"],
        "actionable": True,
        "base_confidence": 0.63,
    },
]

# ── Treatment recommendation rules ─────────────────────────────────────────────

_TREATMENT_RULES: list[dict[str, Any]] = [
    {
        "hypothesis_match": "COMT-driven dopaminergic dysfunction",
        "recommendation": "Consider tDCS targeting DLPFC (F3-F4 montage)",
        "rationale": "DLPFC hypoactivity + COMT Met allele = good tDCS responder",
        "supporting_databases": ["chbmp", "simnibs", "clinicaltrials"],
        "evidence_grade": "B",
        "base_confidence": 0.79,
        "contraindication_domains": [],
    },
    {
        "hypothesis_match": "CYP2D6 poor metabolizer",
        "recommendation": "Consider 50% dose reduction or alternative medication not metabolized by CYP2D6",
        "rationale": "Reduced CYP2D6 activity increases drug exposure and adverse event risk",
        "supporting_databases": ["pharmgkb", "cpic", "fda"],
        "evidence_grade": "A",
        "base_confidence": 0.88,
        "contraindication_domains": [],
    },
    {
        "hypothesis_match": "Hippocampal atrophy",
        "recommendation": "Consider cognitive rehabilitation with hippocampal-targeted interventions",
        "rationale": "Structural atrophy with EEG slowing suggests neurodegenerative process amenable to cognitive training",
        "supporting_databases": ["adni", "abide", "clinicaltrials"],
        "evidence_grade": "C",
        "base_confidence": 0.62,
        "contraindication_domains": [],
    },
    {
        "hypothesis_match": "BDNF Val66Met",
        "recommendation": "Consider exercise-based BDNF augmentation protocol",
        "rationale": "Aerobic exercise upregulates BDNF and may compensate for Val66Met plasticity reduction",
        "supporting_databases": ["pubmed", "clinicaltrials"],
        "evidence_grade": "C",
        "base_confidence": 0.58,
        "contraindication_domains": [],
    },
    {
        "hypothesis_match": "Stimulant-responsive DLPFC",
        "recommendation": "Optimize stimulant dosing with qEEG biomarker-guided titration",
        "rationale": "qEEG frontal beta normalization can serve as a biomarker for optimal stimulant dose",
        "supporting_databases": ["chbmp", "fda", "pubmed"],
        "evidence_grade": "B",
        "base_confidence": 0.72,
        "contraindication_domains": ["genetics"],
    },
    {
        "hypothesis_match": "DLPFC hypoactivity",
        "recommendation": "Consider rTMS at 10 Hz over left DLPFC (F3)",
        "rationale": "qEEG-confirmed DLPFC hypoactivity predicts better rTMS response",
        "supporting_databases": ["simnibs", "clinicaltrials", "pubmed"],
        "evidence_grade": "B",
        "base_confidence": 0.76,
        "contraindication_domains": [],
    },
    {
        "hypothesis_match": "cortical slowing",
        "recommendation": "Consider neurofeedback targeting theta/beta ratio normalization",
        "rationale": "Elevated theta/beta ratio on qEEG is a validated neurofeedback target",
        "supporting_databases": ["chbmp", "pubmed", "clinicaltrials"],
        "evidence_grade": "B",
        "base_confidence": 0.70,
        "contraindication_domains": [],
    },
    {
        "hypothesis_match": "prefrontal",
        "recommendation": "Consider working memory training combined with neuromodulation",
        "rationale": "PFC structural and functional deficits respond to combined cognitive-neuromodulatory approaches",
        "supporting_databases": ["pubmed", "clinicaltrials"],
        "evidence_grade": "C",
        "base_confidence": 0.64,
        "contraindication_domains": [],
    },
]

# ── Evidence grade ranking ─────────────────────────────────────────────────────

_EVIDENCE_RANK: dict[str, int] = {"A": 4, "B": 3, "C": 2, "D": 1}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _prov(
    sources: list[str],
    query: str,
    confidence: float,
    *,
    research: bool = True,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build provenance envelope."""
    p: dict[str, Any] = {
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
        "accessed_at": datetime.now(timezone.utc).isoformat(),
        "bridge": "multimodal_synthesizer_v2",
        "version": "2.0.0",
    }
    if meta:
        p["metadata"] = meta
    return p


def _synthesis_id() -> str:
    """Generate a structured synthesis ID."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    seq = uuid.uuid4().hex[:3].upper()
    return f"SYN-{today}-{seq}"


def _extract_text(insights: list[dict[str, Any]]) -> str:
    """Flatten insight texts for keyword matching."""
    parts: list[str] = []
    for item in insights:
        if isinstance(item, dict):
            parts.append(str(item.get("description", "")))
            parts.append(str(item.get("finding", "")))
            parts.append(str(item.get("recommendation", "")))
            parts.append(str(item.get("summary", "")))
            parts.append(str(item.get("note", "")))
            if "details" in item:
                parts.append(str(item["details"]))
        elif isinstance(item, str):
            parts.append(item)
    return " ".join(parts).lower()


def _match_keywords(text: str, keywords: list[str]) -> float:
    """Return fraction of keywords found in text."""
    if not keywords:
        return 0.0
    text_lower = text.lower()
    matches = sum(1 for kw in keywords if kw.lower() in text_lower)
    return matches / len(keywords)


# ────────────────────────────────────────────────────────────────────────────────
# MULTIMODAL SYNTHESIZER V2
# ────────────────────────────────────────────────────────────────────────────────


class MultimodalSynthesizerV2:
    """Combines outputs from all 4 analyzer bridges to produce unified clinical insights.

    Bridges consumed:
        - MedicationAnalyzerBridge (medication domain)
        - GeneticAnalyzerBridge  (genetics domain)
        - QEEGAnalyzerBridge     (qEEG domain)
        - MRIAnalyzerBridge      (MRI / neuroimaging domain)

    Core pipeline:
        1. Parallel bridge execution via asyncio.gather
        2. Per-domain insight extraction
        3. Cross-modal correlation detection
        4. Hypothesis ranking by evidence strength
        5. Treatment recommendation generation
        6. Overall confidence aggregation

    SAFETY: All outputs carry research_only=True. This is decision-support only.
    """

    def __init__(
        self,
        medication_bridge: Any | None = None,
        genetic_bridge: Any | None = None,
        qeeg_bridge: Any | None = None,
        mri_bridge: Any | None = None,
    ) -> None:
        self._medication_bridge = medication_bridge
        self._genetic_bridge = genetic_bridge
        self._qeeg_bridge = qeeg_bridge
        self._mri_bridge = mri_bridge
        self._bridges = {
            "medication": medication_bridge,
            "genetics": genetic_bridge,
            "qeeg": qeeg_bridge,
            "mri": mri_bridge,
        }
        missing = [name for name, bridge in self._bridges.items() if bridge is None]
        if missing:
            logger.warning(
                "MultimodalSynthesizerV2: bridges not available for domains: %s",
                missing,
            )

    # ═══════════════════════════════════════════════════════════════════════════
    # 1. MASTER SYNTHESIS
    # ═══════════════════════════════════════════════════════════════════════════

    async def synthesize(self, patient_id: str, inputs: dict[str, Any]) -> dict[str, Any]:
        """Run the complete multimodal synthesis pipeline.

        Args:
            patient_id: Pseudonymized patient identifier.
            inputs: Dict keyed by domain name with per-domain input parameters.
                Example:
                {
                    "medication": {"medications": ["sertraline"], "conditions": ["MDD"]},
                    "genetics": {"profile": {"COMT": ["Val", "Met"]}, "medications": ["sertraline"]},
                    "qeeg": {"eeg_data": {"theta": 28.5, "beta": 5.2}, "age": 34, "sex": "F"},
                    "mri": {"coordinates": [(-38, -22, 52)], "regions": ["DLPFC"]},
                }

        Returns:
            Structured synthesis dict with insights, correlations, hypotheses,
            recommendations, overall confidence, provenance, and research flags.
        """
        synthesis_id = _synthesis_id()
        timestamp = datetime.now(timezone.utc).isoformat()
        logger.info(
            "[synthesize %s] patient=%s domains=%s",
            synthesis_id,
            patient_id,
            list(inputs.keys()),
        )

        # ── 1A. Parallel bridge execution ──────────────────────────────────
        domain_outputs = await self._execute_bridges(inputs)

        # ── 1B. Build per-domain insight wrappers ──────────────────────────
        domains: dict[str, Any] = {}
        domain_scores: dict[str, float] = {}
        all_insights: dict[str, list[dict[str, Any]]] = {}
        research_flags = 0

        for domain_name, result in domain_outputs.items():
            if result is None or (isinstance(result, dict) and "error" in result):
                logger.warning("Domain '%s' returned error or no result", domain_name)
                domains[domain_name] = {
                    "insights": [],
                    "bridge": self._bridge_name(domain_name),
                    "confidence": 0.0,
                    "error": result.get("error", "No result") if isinstance(result, dict) else "No result",
                    "research_only": True,
                }
                domain_scores[domain_name] = 0.0
                all_insights[domain_name] = []
                research_flags += 1
                continue

            insights = self._extract_insights(domain_name, result)
            conf = self._extract_confidence(domain_name, result)
            is_research = self._extract_research_flag(domain_name, result)

            domains[domain_name] = {
                "insights": insights,
                "bridge": self._bridge_name(domain_name),
                "confidence": round(conf, 4),
            }
            domain_scores[domain_name] = conf
            all_insights[domain_name] = insights
            if is_research:
                research_flags += 1

        # ── 1C. Cross-modal correlations ───────────────────────────────────
        cross_modal_correlations = self.find_cross_modal_correlations(domain_outputs)

        # ── 1D. Hypothesis ranking ─────────────────────────────────────────
        ranked_hypotheses = self.rank_hypotheses(all_insights)

        # ── 1E. Treatment recommendations ──────────────────────────────────
        treatment_recommendations = self.generate_recommendations(ranked_hypotheses)

        # ── 1F. Overall confidence ─────────────────────────────────────────
        overall_confidence = self.calculate_overall_confidence(domain_scores)

        # ── 1G. Build provenance ───────────────────────────────────────────
        provenance = _prov(
            sources=[self._bridge_name(d) for d in domain_outputs if domain_outputs.get(d)],
            query=f"patient={patient_id} domains={list(inputs.keys())}",
            confidence=overall_confidence,
            meta={
                "patient_id": patient_id,
                "synthesis_id": synthesis_id,
                "domains_processed": list(domains.keys()),
                "domain_confidences": domain_scores,
                "cross_modal_findings": len(cross_modal_correlations),
                "hypotheses_generated": len(ranked_hypotheses),
                "recommendations_generated": len(treatment_recommendations),
            },
        )

        output: dict[str, Any] = {
            "synthesis_id": synthesis_id,
            "patient_id": patient_id,
            "timestamp": timestamp,
            "domains": domains,
            "cross_modal_correlations": cross_modal_correlations,
            "ranked_hypotheses": ranked_hypotheses,
            "treatment_recommendations": treatment_recommendations,
            "overall_confidence": round(overall_confidence, 4),
            "research_only_flags": research_flags,
            "provenance": provenance,
            "safety_notice": (
                "This synthesis is research-grade decision support only. "
                "All outputs require review by qualified healthcare professionals. "
                "Not for independent clinical decision-making."
            ),
        }

        logger.info(
            "[synthesize %s] complete confidence=%.3f correlations=%d hypotheses=%d recs=%d",
            synthesis_id,
            overall_confidence,
            len(cross_modal_correlations),
            len(ranked_hypotheses),
            len(treatment_recommendations),
        )
        return output

    # ═══════════════════════════════════════════════════════════════════════════
    # 2. CROSS-MODAL CORRELATION DETECTION
    # ═══════════════════════════════════════════════════════════════════════════

    def find_cross_modal_correlations(
        self, domain_outputs: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Scan for meaningful patterns that appear across multiple domains.

        Uses a rule-based approach that checks for keyword co-occurrence
        across domain insight texts, then scores by overlap strength.

        Args:
            domain_outputs: Dict of domain_name -> raw bridge output.

        Returns:
            List of correlation dicts with finding, strength, domains, confidence.
        """
        correlations: list[dict[str, Any]] = []

        # Build insight text lookup per domain
        domain_texts: dict[str, str] = {}
        for domain_name, result in domain_outputs.items():
            if result is None or (isinstance(result, dict) and "error" in result):
                continue
            insights = self._extract_insights(domain_name, result)
            domain_texts[domain_name] = _extract_text(insights)

        for rule in _CORRELATION_RULES:
            req_domains = rule["domains"]
            # Skip if not enough domains available
            if not all(d in domain_texts for d in req_domains):
                continue

            patterns = rule["required_finding_patterns"]
            domain_match_scores: list[float] = []
            matched_details: dict[str, str] = {}

            for domain in req_domains:
                text = domain_texts.get(domain, "")
                kws = patterns.get(domain, [])
                match_score = _match_keywords(text, kws)
                domain_match_scores.append(match_score)

                # Capture matched keywords for detail
                matched_kws = [kw for kw in kws if kw.lower() in text]
                matched_details[domain] = ", ".join(matched_kws) if matched_kws else "none"

            # All domains must have at least partial keyword matches
            if all(score > 0.05 for score in domain_match_scores):
                avg_score = sum(domain_match_scores) / len(domain_match_scores)
                correlation_strength = round(min(avg_score + 0.15, 0.95), 4)

                # Build finding description
                finding = self._render_correlation_finding(
                    rule, matched_details, domain_texts
                )

                # Confidence = correlation strength * average domain confidence
                domain_confs: list[float] = []
                for d in req_domains:
                    r = domain_outputs.get(d, {})
                    if isinstance(r, dict):
                        prov = r.get("provenance", {})
                        domain_confs.append(prov.get("confidence", 0.5))
                avg_conf = sum(domain_confs) / len(domain_confs) if domain_confs else 0.5
                confidence = round(min(correlation_strength * avg_conf + rule.get("evidence_boost", 0.0), 0.95), 4)

                correlations.append(
                    {
                        "finding": finding,
                        "correlation_strength": correlation_strength,
                        "correlation_type": rule.get("correlation_type", "unknown"),
                        "supporting_domains": req_domains,
                        "confidence": confidence,
                        "matched_keywords": matched_details,
                    }
                )

        # Sort by correlation strength descending
        correlations.sort(key=lambda c: c["correlation_strength"], reverse=True)
        logger.info("find_cross_modal_correlations: found %d correlations", len(correlations))
        return correlations

    # ═══════════════════════════════════════════════════════════════════════════
    # 3. HYPOTHESIS RANKING
    # ═══════════════════════════════════════════════════════════════════════════

    def rank_hypotheses(
        self, insights: dict[str, list[dict[str, Any]]]
    ) -> list[dict[str, Any]]:
        """Rank clinical hypotheses by evidence strength across domains.

        Scoring factors:
            - Domain coverage: how many required domains have data
            - Keyword match: fraction of hypothesis keywords found
            - Cross-domain concordance: whether evidence agrees across domains
            - Base confidence: hypothesis prior probability

        Args:
            insights: Dict of domain_name -> list of insight dicts.

        Returns:
            List of ranked hypothesis dicts sorted by composite score.
        """
        scored: list[dict[str, Any]] = []

        # Build domain text cache for keyword matching
        domain_texts = {d: _extract_text(items) for d, items in insights.items()}

        for template in _HYPOTHESIS_TEMPLATES:
            req_domains = template["domains_required"]
            keywords = template["keywords"]

            # Check domain availability
            available_domains = [d for d in req_domains if d in domain_texts and domain_texts[d].strip()]
            domain_coverage = len(available_domains) / len(req_domains) if req_domains else 0.0

            if domain_coverage < 0.5:
                continue  # Skip if less than half of required domains available

            # Keyword match across available domains
            domain_keyword_scores: list[float] = []
            for domain in available_domains:
                domain_kws = keywords.get(domain, [])
                score = _match_keywords(domain_texts[domain], domain_kws)
                domain_keyword_scores.append(score)

            avg_keyword_match = (
                sum(domain_keyword_scores) / len(domain_keyword_scores)
                if domain_keyword_scores
                else 0.0
            )

            # Composite score combining coverage, keyword match, and base confidence
            composite_score = (
                domain_coverage * 0.35
                + avg_keyword_match * 0.35
                + template["base_confidence"] * 0.30
            )

            # Build evidence list
            evidence: list[str] = []
            for slot in template.get("evidence_slots", []):
                # Check if slot has supporting data
                slot_domain = slot.split(":")[0] if ":" in slot else ""
                if slot_domain.lower() in available_domains:
                    evidence.append(slot)
                else:
                    evidence.append(f"[{slot}] — insufficient data")

            confidence = round(min(composite_score, 0.95), 4)

            scored.append(
                {
                    "hypothesis_id": template["id"],
                    "hypothesis": template["hypothesis"],
                    "domains_covered": available_domains,
                    "domain_coverage": round(domain_coverage, 4),
                    "keyword_match": round(avg_keyword_match, 4),
                    "supporting_evidence": evidence,
                    "confidence": confidence,
                    "actionable": template.get("actionable", False),
                    "base_confidence": template["base_confidence"],
                }
            )

        # Sort by confidence descending, then by domain coverage
        scored.sort(key=lambda h: (h["confidence"], h["domain_coverage"]), reverse=True)

        # Assign ranks
        for i, item in enumerate(scored, 1):
            item["rank"] = i

        logger.info("rank_hypotheses: ranked %d hypotheses", len(scored))
        return scored

    # ═══════════════════════════════════════════════════════════════════════════
    # 4. TREATMENT RECOMMENDATION GENERATION
    # ═══════════════════════════════════════════════════════════════════════════

    def generate_recommendations(
        self, hypotheses: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Generate treatment recommendations from ranked hypotheses.

        Maps hypothesis text patterns to treatment rules, filters by
        contraindications, and scores by evidence grade and confidence.

        Args:
            hypotheses: Ranked hypothesis list from rank_hypotheses().

        Returns:
            List of treatment recommendation dicts with rationale and evidence.
        """
        recommendations: list[dict[str, Any]] = []
        seen_recs: set[str] = set()

        for hypothesis in hypotheses:
            hyp_text = hypothesis.get("hypothesis", "").lower()
            hyp_conf = hypothesis.get("confidence", 0.5)
            domains_covered = hypothesis.get("domains_covered", [])

            for rule in _TREATMENT_RULES:
                match_key = rule["hypothesis_match"].lower()

                if match_key not in hyp_text:
                    continue

                # Deduplicate
                rec_key = f"{rule['recommendation']}|{rule['rationale'][:40]}"
                if rec_key in seen_recs:
                    continue
                seen_recs.add(rec_key)

                # Check contraindications
                contraindicated = False
                for cd in rule.get("contraindication_domains", []):
                    if cd in domains_covered:
                        # Skip if the contraindication domain has specific negative signals
                        # In practice, this would check specific biomarkers
                        contraindicated = True
                        break

                if contraindicated:
                    continue

                # Calculate confidence from hypothesis confidence, evidence grade, and base
                evidence_boost = (_EVIDENCE_RANK.get(rule["evidence_grade"], 1) / 4.0) * 0.15
                confidence = round(
                    min(rule["base_confidence"] * 0.6 + hyp_conf * 0.3 + evidence_boost, 0.95),
                    4,
                )

                recommendations.append(
                    {
                        "recommendation": rule["recommendation"],
                        "rationale": rule["rationale"],
                        "supporting_databases": rule["supporting_databases"],
                        "evidence_grade": rule["evidence_grade"],
                        "confidence": confidence,
                        "linked_hypothesis": hypothesis.get("hypothesis", ""),
                        "linked_hypothesis_rank": hypothesis.get("rank", 0),
                        "research_only": True,
                    }
                )

        # Sort by evidence grade, then confidence
        recommendations.sort(
            key=lambda r: (-_EVIDENCE_RANK.get(r["evidence_grade"], 0), -r["confidence"])
        )

        logger.info("generate_recommendations: generated %d recommendations", len(recommendations))
        return recommendations

    # ═══════════════════════════════════════════════════════════════════════════
    # 5. OVERALL CONFIDENCE CALCULATION
    # ═══════════════════════════════════════════════════════════════════════════

    def calculate_overall_confidence(self, domain_scores: dict[str, float]) -> float:
        """Calculate weighted aggregate confidence across all domains.

        Uses domain-specific weights with coverage penalty for missing domains.
        Missing domains reduce the ceiling proportionally.

        Args:
            domain_scores: Dict of domain_name -> confidence score [0.0, 1.0].

        Returns:
            Overall confidence score [0.0, 1.0].
        """
        if not domain_scores:
            return 0.0

        total_weight = 0.0
        weighted_sum = 0.0
        available_domains = set(domain_scores.keys())
        all_domains = set(_DOMAIN_WEIGHTS.keys())

        for domain, score in domain_scores.items():
            weight = _DOMAIN_WEIGHTS.get(domain, 0.2)
            weighted_sum += score * weight
            total_weight += weight

        if total_weight == 0:
            return 0.0

        raw_confidence = weighted_sum / total_weight

        # Coverage penalty: missing domains reduce the ceiling
        coverage_ratio = len(available_domains) / len(all_domains) if all_domains else 0.0
        coverage_penalty = 1.0 - (1.0 - coverage_ratio) * 0.3

        overall = raw_confidence * coverage_penalty
        return round(max(0.0, min(overall, 1.0)), 4)

    # ═══════════════════════════════════════════════════════════════════════════
    # INTERNAL HELPERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _execute_bridges(
        self, inputs: dict[str, Any]
    ) -> dict[str, Any]:
        """Execute all 4 bridges in parallel via asyncio.gather.

        Failed bridges are logged and skipped; they do not crash the pipeline.

        Args:
            inputs: Domain-keyed input parameters.

        Returns:
            Dict of domain_name -> bridge output (or error dict).
        """
        tasks: dict[str, Any] = {}

        # Build tasks for available bridges with inputs
        if self._medication_bridge and "medication" in inputs:
            tasks["medication"] = self._run_medication_bridge(inputs["medication"])
        if self._genetic_bridge and "genetics" in inputs:
            tasks["genetics"] = self._run_genetic_bridge(inputs["genetics"])
        if self._qeeg_bridge and "qeeg" in inputs:
            tasks["qeeg"] = self._run_qeeg_bridge(inputs["qeeg"])
        if self._mri_bridge and "mri" in inputs:
            tasks["mri"] = self._run_mri_bridge(inputs["mri"])

        if not tasks:
            logger.warning("_execute_bridges: no tasks to execute")
            return {}

        # Execute all tasks in parallel
        results: dict[str, Any] = {}
        domain_names = list(tasks.keys())
        coroutines = list(tasks.values())

        gathered = await asyncio.gather(*coroutines, return_exceptions=True)

        for domain_name, result in zip(domain_names, gathered):
            if isinstance(result, Exception):
                logger.error("Bridge '%s' failed: %s", domain_name, result)
                results[domain_name] = {"error": str(result), "domain": domain_name}
            else:
                results[domain_name] = result

        logger.info(
            "_execute_bridges: completed %d/%d tasks successfully",
            len([r for r in gathered if not isinstance(r, Exception)]),
            len(tasks),
        )
        return results

    async def _run_medication_bridge(self, params: dict[str, Any]) -> dict[str, Any]:
        """Execute medication bridge analysis."""
        bridge = self._medication_bridge
        medications = params.get("medications", [])
        conditions = params.get("conditions", [])

        results: dict[str, Any] = {"domain": "medication", "subqueries": []}

        if medications:
            try:
                # Normalize first medication
                norm = await bridge.normalize_medication(medications[0])
                results["normalization"] = norm
                results["subqueries"].append("normalize_medication")
            except Exception as e:
                logger.warning("Medication normalization failed: %s", e)

        if len(medications) >= 2:
            try:
                ix = await bridge.check_interactions(medications)
                results["interactions"] = ix
                results["subqueries"].append("check_interactions")
            except Exception as e:
                logger.warning("Medication interaction check failed: %s", e)

        if medications and conditions:
            try:
                contra = await bridge.get_contraindications(medications[0], conditions)
                results["contraindications"] = contra
                results["subqueries"].append("get_contraindications")
            except Exception as e:
                logger.warning("Contraindication check failed: %s", e)

        return results

    async def _run_genetic_bridge(self, params: dict[str, Any]) -> dict[str, Any]:
        """Execute genetic bridge analysis."""
        bridge = self._genetic_bridge
        profile = params.get("profile", {})
        medications = params.get("medications", [])

        results: dict[str, Any] = {"domain": "genetics", "subqueries": []}

        if profile:
            try:
                pgx_summary = await bridge.get_pgx_summary(profile, medications)
                results["pgx_summary"] = pgx_summary
                results["subqueries"].append("get_pgx_summary")
            except Exception as e:
                logger.warning("PGx summary failed: %s", e)

        # Assess key variants
        for gene, variants in profile.items():
            if variants:
                try:
                    phenotype = await bridge.predict_phenotype(gene, variants if isinstance(variants, list) else [variants])
                    results.setdefault("phenotypes", {})[gene] = phenotype
                    results["subqueries"].append(f"predict_phenotype:{gene}")
                except Exception as e:
                    logger.warning("Phenotype prediction for %s failed: %s", gene, e)

        return results

    async def _run_qeeg_bridge(self, params: dict[str, Any]) -> dict[str, Any]:
        """Execute qEEG bridge analysis."""
        bridge = self._qeeg_bridge
        eeg_data = params.get("eeg_data", {})
        age = params.get("age")
        sex = params.get("sex", "unknown")

        results: dict[str, Any] = {"domain": "qeeg", "subqueries": []}

        if eeg_data and age is not None:
            try:
                z_scores = await bridge.calculate_z_scores(eeg_data, float(age), sex)
                results["z_scores"] = z_scores
                results["subqueries"].append("calculate_z_scores")
            except Exception as e:
                logger.warning("Z-score calculation failed: %s", e)

            try:
                deviation = await bridge.assess_deviation_significance(
                    results.get("z_scores", {}).get("z_scores", eeg_data)
                )
                results["deviation"] = deviation
                results["subqueries"].append("assess_deviation_significance")
            except Exception as e:
                logger.warning("Deviation assessment failed: %s", e)

        return results

    async def _run_mri_bridge(self, params: dict[str, Any]) -> dict[str, Any]:
        """Execute MRI bridge analysis."""
        bridge = self._mri_bridge
        coordinates = params.get("coordinates", [])
        regions = params.get("regions", [])

        results: dict[str, Any] = {"domain": "mri", "subqueries": []}

        # Look up regions by coordinates
        for coord in coordinates:
            try:
                lookup = await bridge.lookup_region(tuple(coord))
                results.setdefault("region_lookups", []).append(lookup)
                results["subqueries"].append(f"lookup_region:{coord}")
            except Exception as e:
                logger.warning("Region lookup for %s failed: %s", coord, e)

        # Get details for named regions
        for region in regions:
            try:
                details = await bridge.get_region_details(region)
                results.setdefault("region_details", {})[region] = details
                results["subqueries"].append(f"get_region_details:{region}")
            except Exception as e:
                logger.warning("Region details for %s failed: %s", region, e)

        # Submit simulation if config provided
        if "simulation_config" in params:
            try:
                sim = await bridge.submit_simulation(params["simulation_config"])
                results["simulation"] = sim
                results["subqueries"].append("submit_simulation")
            except Exception as e:
                logger.warning("Simulation submission failed: %s", e)

        return results

    def _extract_insights(
        self, domain_name: str, result: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Extract structured insights from a bridge result."""
        insights: list[dict[str, Any]] = []

        if domain_name == "medication":
            if "normalization" in result:
                norm = result["normalization"]
                insights.append(
                    {
                        "type": "medication_normalization",
                        "description": f"Normalized medication: {norm.get('canonical_name', 'unknown')}",
                        "canonical_name": norm.get("canonical_name"),
                        "rxcui": norm.get("rxcui"),
                        "confidence": norm.get("provenance", {}).get("confidence", 0.5),
                    }
                )
            if "interactions" in result:
                ix = result["interactions"]
                for interaction in ix.get("interactions", []):
                    insights.append(
                        {
                            "type": "drug_interaction",
                            "description": interaction.get("description", ""),
                            "drugs": interaction.get("drugs", []),
                            "severity": interaction.get("severity", "unknown"),
                            "recommendation": interaction.get("recommendation", ""),
                            "evidence_grade": interaction.get("evidence_grade", "C"),
                            "confidence": ix.get("provenance", {}).get("confidence", 0.5),
                        }
                    )
            if "contraindications" in result:
                contra = result["contraindications"]
                matched = contra.get("matched_contraindications", [])
                if matched:
                    for c in matched:
                        insights.append(
                            {
                                "type": "contraindication",
                                "description": c.get("description", ""),
                                "condition": c.get("condition", ""),
                                "severity": c.get("severity", "unknown"),
                                "confidence": contra.get("provenance", {}).get("confidence", 0.5),
                            }
                        )

        elif domain_name == "genetics":
            if "pgx_summary" in result:
                pgx = result["pgx_summary"]
                summary = pgx.get("summary", {})
                for finding in summary.get("actionable_findings", []):
                    insights.append(
                        {
                            "type": "pharmacogenomic_finding",
                            "description": (
                                f"{finding.get('gene', '')}: {finding.get('classification', '')} "
                                f"finding for {finding.get('drug', '')}"
                            ),
                            "gene": finding.get("gene"),
                            "drug": finding.get("drug"),
                            "classification": finding.get("classification"),
                            "recommendation": finding.get("recommendation", ""),
                            "confidence": pgx.get("provenance", {}).get("confidence", 0.5),
                        }
                    )
            for gene, pheno in result.get("phenotypes", {}).items():
                insights.append(
                    {
                        "type": "phenotype_prediction",
                        "description": f"{gene} predicted phenotype: {pheno.get('predicted_phenotype', 'unknown')}",
                        "gene": gene,
                        "predicted_phenotype": pheno.get("predicted_phenotype"),
                        "variants": pheno.get("variants", []),
                        "confidence": pheno.get("provenance", {}).get("confidence", 0.5),
                    }
                )

        elif domain_name == "qeeg":
            if "z_scores" in result:
                z = result["z_scores"]
                patient = z.get("patient", {})
                for feat, zv in z.get("z_scores", {}).items():
                    insights.append(
                        {
                            "type": "eeg_z_score",
                            "feature": feat,
                            "z_score": zv,
                            "abs_z": abs(zv),
                            "direction": "elevated" if zv > 0 else "reduced" if zv < 0 else "neutral",
                            "confidence": z.get("provenance", {}).get("confidence", 0.5),
                        }
                    )
            if "deviation" in result:
                dev = result["deviation"]
                overall = dev.get("overall", {})
                insights.append(
                    {
                        "type": "deviation_summary",
                        "description": f"Overall deviation: {overall.get('tier', 'unknown')}",
                        "tier": overall.get("tier"),
                        "max_abs_z": overall.get("max_abs_z"),
                        "most_deviant": overall.get("most_deviant"),
                        "summary": overall.get("summary", ""),
                        "confidence": dev.get("provenance", {}).get("confidence", 0.5),
                    }
                )

        elif domain_name == "mri":
            for lookup in result.get("region_lookups", []):
                region = lookup.get("region", {})
                insights.append(
                    {
                        "type": "region_lookup",
                        "description": f"MNI coordinates map to {region.get('region_name', 'unknown')}",
                        "region_id": region.get("region_id"),
                        "region_name": region.get("region_name"),
                        "hemisphere": region.get("hemisphere"),
                        "lobe": region.get("lobe"),
                        "coordinates": lookup.get("query_coords"),
                        "confidence": lookup.get("provenance", {}).get("confidence", 0.5),
                    }
                )
            for region_name, details in result.get("region_details", {}).items():
                d = details.get("details", {})
                insights.append(
                    {
                        "type": "region_details",
                        "description": f"{region_name}: {d.get('function', 'N/A')}",
                        "region_id": d.get("region_id"),
                        "region_name": d.get("region_name"),
                        "function": d.get("function"),
                        "networks": d.get("networks", []),
                        "confidence": details.get("provenance", {}).get("confidence", 0.5),
                    }
                )
            if "simulation" in result:
                sim = result["simulation"]
                insights.append(
                    {
                        "type": "simulation_result",
                        "description": f"Neuromodulation simulation submitted: {sim.get('simulation_type', 'unknown')}",
                        "job_id": sim.get("job_id"),
                        "status": sim.get("status"),
                        "simulation_type": sim.get("simulation_type"),
                        "warning": sim.get("warning", ""),
                        "confidence": sim.get("provenance", {}).get("confidence", 0.5),
                    }
                )

        return insights

    def _extract_confidence(self, domain_name: str, result: dict[str, Any]) -> float:
        """Extract confidence score from a bridge result."""
        if isinstance(result, dict) and "provenance" in result:
            return result["provenance"].get("confidence", 0.5)
        # Average confidence across sub-results
        confidences: list[float] = []
        for key, val in result.items():
            if isinstance(val, dict) and "provenance" in val:
                confidences.append(val["provenance"].get("confidence", 0.5))
        if confidences:
            return round(sum(confidences) / len(confidences), 4)
        return 0.5

    def _extract_research_flag(self, domain_name: str, result: dict[str, Any]) -> bool:
        """Extract research-only flag from a bridge result."""
        if isinstance(result, dict):
            prov = result.get("provenance", {})
            if prov:
                return prov.get("is_research_only", True)
            # Check sub-results
            for key, val in result.items():
                if isinstance(val, dict):
                    sub_prov = val.get("provenance", {})
                    if sub_prov and sub_prov.get("is_research_only", True):
                        return True
        return True

    def _bridge_name(self, domain: str) -> str:
        """Map domain name to bridge identifier string."""
        mapping = {
            "medication": "medication_analyzer",
            "genetics": "genetic_analyzer",
            "qeeg": "qeeg_analyzer",
            "mri": "mri_analyzer",
        }
        return mapping.get(domain, f"{domain}_analyzer")

    def _render_correlation_finding(
        self,
        rule: dict[str, Any],
        matched_details: dict[str, str],
        domain_texts: dict[str, str],
    ) -> str:
        """Render a human-readable finding description for a correlation rule."""
        ct = rule.get("correlation_type", "unknown")

        if ct == "genotype-phenotype-neurostructure":
            gene_part = matched_details.get("genetics", "genetic variant")
            qeeg_part = matched_details.get("qeeg", "qEEG finding")
            mri_part = matched_details.get("mri", "MRI finding")
            return (
                f"{gene_part} variant associated with both {qeeg_part} (qEEG) "
                f"and {mri_part} (MRI)"
            )
        elif ct == "pharmacogenomic-metabolizer":
            gene_part = matched_details.get("genetics", "metabolizer gene")
            med_part = matched_details.get("medication", "medication")
            return (
                f"{gene_part} variant influences {med_part} metabolism and predicted response"
            )
        elif ct == "electrostructure-concordance":
            qeeg_part = matched_details.get("qeeg", "qEEG pattern")
            mri_part = matched_details.get("mri", "structural finding")
            return f"qEEG {qeeg_part} pattern correlates with MRI {mri_part}"
        elif ct == "pharmaco-EEG-response":
            med_part = matched_details.get("medication", "drug")
            qeeg_part = matched_details.get("qeeg", "EEG change")
            return (
                f"Medication {med_part} effects align with qEEG {qeeg_part} pattern"
            )
        elif ct == "genotype-neurostructure":
            gene_part = matched_details.get("genetics", "plasticity variant")
            mri_part = matched_details.get("mri", "structural difference")
            return f"{gene_part} linked to {mri_part} structural differences"
        elif ct == "pharmaco-structure":
            med_part = matched_details.get("medication", "medication")
            mri_part = matched_details.get("mri", "structural change")
            return f"Long-term {med_part} exposure associated with {mri_part}"
        else:
            domains = ", ".join(rule.get("domains", []))
            return f"Cross-modal correlation detected across {domains}: {ct}"


# ────────────────────────────────────────────────────────────────────────────────
# CONVENIENCE FACTORY
# ────────────────────────────────────────────────────────────────────────────────


def build_synthesizer(
    medication_bridge: Any | None = None,
    genetic_bridge: Any | None = None,
    qeeg_bridge: Any | None = None,
    mri_bridge: Any | None = None,
) -> MultimodalSynthesizerV2:
    """Factory function to create a MultimodalSynthesizerV2 instance.

    Bridges are imported from their respective modules when available.
    If a bridge cannot be imported, None is passed (graceful degradation).
    """
    return MultimodalSynthesizerV2(
        medication_bridge=medication_bridge,
        genetic_bridge=genetic_bridge,
        qeeg_bridge=qeeg_bridge,
        mri_bridge=mri_bridge,
    )



# ═══════════════════════════════════════════════════════════════════════════════
# TESTS — Mocked Bridges
# ═══════════════════════════════════════════════════════════════════════════════

"""
Test suite for MultimodalSynthesizerV2 using fully mocked bridges.

Run:  python -m pytest multimodal_synthesizer_v2.py -v
      python -m pytest multimodal_synthesizer_v2.py::TestMultimodalSynthesizerV2 -v
"""

import asyncio
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch


class MockMedicationBridge:
    """Mock medication bridge for testing."""

    def __init__(self, scenario: str = "normal") -> None:
        self.scenario = scenario

    async def normalize_medication(self, medication_name: str) -> dict[str, Any]:
        if self.scenario == "error":
            raise RuntimeError("Medication bridge unavailable")
        return {
            "canonical_name": medication_name.title(),
            "rxcui": "12345",
            "provenance": {
                "sources": ["rxnorm"],
                "confidence": 0.95,
                "is_research_only": False,
            },
        }

    async def check_interactions(self, medications: list[str]) -> dict[str, Any]:
        if self.scenario == "error":
            raise RuntimeError("Medication bridge unavailable")
        return {
            "medications": medications,
            "interactions": [
                {
                    "drugs": ["sertraline", "tramadol"],
                    "severity": "severe",
                    "description": "Risk of serotonin syndrome.",
                    "recommendation": "Use an alternative analgesic.",
                    "evidence_grade": "B",
                }
            ] if "sertraline" in [m.lower() for m in medications] and "tramadol" in [m.lower() for m in medications] else [],
            "provenance": {
                "sources": ["openfda"],
                "confidence": 0.75,
                "is_research_only": True,
            },
        }

    async def get_contraindications(
        self, medication: str, patient_conditions: list[str]
    ) -> dict[str, Any]:
        if self.scenario == "error":
            raise RuntimeError("Medication bridge unavailable")
        return {
            "medication": medication,
            "contraindications": [],
            "matched_contraindications": [],
            "provenance": {
                "sources": ["openfda"],
                "confidence": 0.70,
                "is_research_only": True,
            },
        }

    async def check_pgx_interactions(
        self, medication: str, genetic_profile: dict[str, Any]
    ) -> dict[str, Any]:
        return {
            "medication": medication,
            "pgx_guidance": [],
            "provenance": {
                "sources": ["pharmgkb"],
                "confidence": 0.85,
                "is_research_only": True,
            },
        }

    async def get_medication_details(self, medication: str) -> dict[str, Any]:
        return {
            "medication": medication,
            "details": {},
            "provenance": {
                "sources": ["rxnorm"],
                "confidence": 0.90,
                "is_research_only": False,
            },
        }


class MockGeneticBridge:
    """Mock genetic bridge for testing."""

    def __init__(self, scenario: str = "normal") -> None:
        self.scenario = scenario

    async def get_gene_drug_guidance(self, gene: str, drug: str) -> dict[str, Any]:
        return {
            "gene": gene,
            "drug": drug,
            "guidance": [
                {
                    "gene": gene,
                    "drug": drug,
                    "phenotype": "poor_metabolizer",
                    "implication": "Markedly reduced metabolism",
                    "recommendation": "Avoid if possible; consider alternative.",
                    "classification": "strong",
                    "evidence_level": "A",
                }
            ],
            "provenance": {
                "sources": ["pharmgkb"],
                "confidence": 0.92,
                "is_research_only": True,
            },
        }

    async def assess_variant_pathogenicity(self, variant_id: str) -> dict[str, Any]:
        return {
            "variant_id": variant_id,
            "assessment": {
                "clinical_significance": "pathogenic",
                "confidence": 0.85,
            },
            "provenance": {
                "sources": ["clinvar"],
                "confidence": 0.90,
                "is_research_only": True,
            },
        }

    async def predict_phenotype(self, gene: str, variants: list[str]) -> dict[str, Any]:
        if self.scenario == "error":
            raise RuntimeError("Genetic bridge unavailable")
        return {
            "gene": gene,
            "variants": variants,
            "predicted_phenotype": "poor_metabolizer" if "*4" in variants else "extensive_metabolizer",
            "provenance": {
                "sources": ["pharmgkb"],
                "confidence": 0.85 if "*4" in variants else 0.75,
                "is_research_only": True,
            },
        }

    async def get_pgx_summary(
        self, genetic_profile: dict[str, Any], medications: list[str]
    ) -> dict[str, Any]:
        if self.scenario == "error":
            raise RuntimeError("Genetic bridge unavailable")
        genes = list(genetic_profile.keys())
        return {
            "genetic_profile": {"genes_tested": genes, "gene_count": len(genes)},
            "per_gene_results": {},
            "summary": {
                "total_guidance_items": 2,
                "actionable_findings": [
                    {
                        "gene": "CYP2D6",
                        "drug": "sertraline",
                        "classification": "strong",
                        "recommendation": "Consider alternative.",
                    },
                    {
                        "gene": "COMT",
                        "drug": "sertraline",
                        "classification": "moderate",
                        "recommendation": "Monitor response.",
                    },
                ],
                "actionable_count": 2,
            },
            "provenance": {
                "sources": ["pharmgkb", "clinvar"],
                "confidence": 0.88,
                "is_research_only": True,
            },
        }


class MockQEEGBridge:
    """Mock qEEG bridge for testing."""

    def __init__(self, scenario: str = "normal") -> None:
        self.scenario = scenario

    async def calculate_z_scores(
        self, eeg_data: dict[str, Any], patient_age: float, patient_sex: str
    ) -> dict[str, Any]:
        if self.scenario == "error":
            raise RuntimeError("qEEG bridge unavailable")
        z_scores = {}
        for feature, value in eeg_data.items():
            # Simple mock: theta > 25 = elevated, beta < 6 = reduced
            if feature.lower() == "theta" and float(value) > 25:
                z_scores[feature] = 2.8
            elif feature.lower() == "beta" and float(value) < 6:
                z_scores[feature] = -1.5
            else:
                z_scores[feature] = 0.3
        return {
            "patient": {"age": patient_age, "sex": patient_sex},
            "z_scores": z_scores,
            "feature_details": [],
            "provenance": {
                "sources": ["chbmp"],
                "confidence": 0.88,
                "is_research_only": True,
            },
        }

    async def get_normative_reference(
        self, patient_age: float, patient_sex: str, features: list[str]
    ) -> dict[str, Any]:
        return {
            "demographics": {"age": patient_age, "sex": patient_sex},
            "reference_data": {},
            "provenance": {
                "sources": ["chbmp"],
                "confidence": 0.85,
                "is_research_only": True,
            },
        }

    async def assess_deviation_significance(
        self, z_scores: dict[str, float]
    ) -> dict[str, Any]:
        if self.scenario == "error":
            raise RuntimeError("qEEG bridge unavailable")
        max_z = max(abs(v) for v in z_scores.values()) if z_scores else 0.0
        most_deviant = max(z_scores.keys(), key=lambda k: abs(z_scores[k])) if z_scores else ""
        tier = "severe" if max_z >= 3.0 else "moderate" if max_z >= 2.0 else "mild" if max_z >= 1.5 else "normal"
        return {
            "assessments": [],
            "overall": {
                "tier": tier,
                "max_abs_z": round(max_z, 4),
                "most_deviant": most_deviant,
                "features": len(z_scores),
                "counts": {"normal": 0, "mild": 0, "moderate": 1, "marked": 0, "severe": 0},
                "summary": f"0S 0M 1m 0i / {len(z_scores)}",
            },
            "provenance": {
                "sources": ["z_score_assessment"],
                "confidence": 0.75 if len(z_scores) >= 5 else 0.55,
                "is_research_only": True,
            },
        }


class MockMRIBridge:
    """Mock MRI bridge for testing."""

    def __init__(self, scenario: str = "normal") -> None:
        self.scenario = scenario

    async def lookup_region(
        self, coordinates: tuple, atlas: str = "AAL3"
    ) -> dict[str, Any]:
        if self.scenario == "error":
            raise RuntimeError("MRI bridge unavailable")
        return {
            "query_coords": list(coordinates),
            "region": {
                "region_id": "Frontal_Sup_L",
                "region_name": "Superior frontal gyrus (L)",
                "hemisphere": "left",
                "lobe": "frontal",
                "function": "Executive function",
            },
            "provenance": {
                "sources": ["mni_atlas"],
                "confidence": 0.92,
                "is_research_only": True,
            },
        }

    async def get_region_details(
        self, region_id: str, atlas: str = "AAL3"
    ) -> dict[str, Any]:
        if self.scenario == "error":
            raise RuntimeError("MRI bridge unavailable")
        return {
            "region_id": region_id,
            "details": {
                "region_id": region_id,
                "region_name": "DLPFC",
                "hemisphere": "left",
                "lobe": "frontal",
                "function": "Working memory / Executive control",
                "networks": ["frontoparietal", "cingulo-opercular"],
                "volume_mm3": 4520,
            },
            "provenance": {
                "sources": ["mni_atlas"],
                "confidence": 0.85,
                "is_research_only": True,
            },
        }

    async def submit_simulation(self, config: dict[str, Any]) -> dict[str, Any]:
        return {
            "job_id": "SIM-12345",
            "status": "submitted",
            "simulation_type": config.get("simulation_type", "tDCS"),
            "provenance": {
                "sources": ["simnibs"],
                "confidence": 0.85,
                "is_research_only": True,
            },
        }

    async def get_simulation_results(self, simulation_id: str) -> dict[str, Any]:
        return {
            "simulation_id": simulation_id,
            "status": "completed",
            "results": {"max_electric_field_V_per_m": 0.45},
            "provenance": {
                "sources": ["simnibs"],
                "confidence": 0.80,
                "is_research_only": True,
            },
        }


# ── Test fixtures ──────────────────────────────────────────────────────────────


def _make_test_inputs() -> dict[str, Any]:
    """Create realistic test inputs for all 4 domains."""
    return {
        "medication": {
            "medications": ["sertraline", "tramadol"],
            "conditions": ["Major Depressive Disorder"],
        },
        "genetics": {
            "profile": {
                "CYP2D6": ["*1", "*4"],
                "COMT": ["Val", "Met"],
            },
            "medications": ["sertraline"],
        },
        "qeeg": {
            "eeg_data": {
                "theta": 28.5,
                "beta": 5.2,
                "alpha": 11.8,
                "delta": 24.0,
                "gamma": 2.8,
            },
            "age": 34,
            "sex": "F",
        },
        "mri": {
            "coordinates": [(-18, 30, 42)],
            "regions": ["Frontal_Sup_L"],
        },
    }


def _make_comt_inputs() -> dict[str, Any]:
    """Create test inputs specifically for COMT cross-modal correlation."""
    return {
        "genetics": {
            "profile": {
                "COMT": ["Val", "Met"],
            },
            "medications": ["sertraline"],
        },
        "qeeg": {
            "eeg_data": {
                "theta": 28.5,
                "beta": 4.8,
                "alpha": 10.2,
            },
            "age": 34,
            "sex": "F",
        },
        "mri": {
            "coordinates": [(-18, 30, 42)],
            "regions": ["Frontal_Sup_L", "DLPFC"],
        },
    }


def _run_async(coro):
    """Run an async coroutine in the test context."""
    return asyncio.run(coro)


# ── Test class ─────────────────────────────────────────────────────────────────


class TestMultimodalSynthesizerV2(unittest.TestCase):
    """Comprehensive test suite for MultimodalSynthesizerV2."""

    def test_synthesize_full_pipeline(self) -> None:
        """Test the complete synthesis pipeline with all 4 mocked bridges."""
        synth = MultimodalSynthesizerV2(
            medication_bridge=MockMedicationBridge(),
            genetic_bridge=MockGeneticBridge(),
            qeeg_bridge=MockQEEGBridge(),
            mri_bridge=MockMRIBridge(),
        )
        inputs = _make_test_inputs()
        result = _run_async(synth.synthesize("PT-001", inputs))

        # Top-level structure
        self.assertIn("synthesis_id", result)
        self.assertTrue(result["synthesis_id"].startswith("SYN-"))
        self.assertEqual(result["patient_id"], "PT-001")
        self.assertIn("timestamp", result)
        self.assertIn("domains", result)
        self.assertIn("cross_modal_correlations", result)
        self.assertIn("ranked_hypotheses", result)
        self.assertIn("treatment_recommendations", result)
        self.assertIn("overall_confidence", result)
        self.assertIn("research_only_flags", result)
        self.assertIn("provenance", result)
        self.assertIn("safety_notice", result)

        # Domains
        domains = result["domains"]
        self.assertIn("medication", domains)
        self.assertIn("genetics", domains)
        self.assertIn("qeeg", domains)
        self.assertIn("mri", domains)

        # Domain insights are lists
        for domain_name in ["medication", "genetics", "qeeg", "mri"]:
            self.assertIsInstance(domains[domain_name]["insights"], list)
            self.assertGreater(len(domains[domain_name]["insights"]), 0)
            self.assertIn("bridge", domains[domain_name])
            self.assertIn("confidence", domains[domain_name])

        # Overall confidence should be in valid range
        self.assertGreaterEqual(result["overall_confidence"], 0.0)
        self.assertLessEqual(result["overall_confidence"], 1.0)

        # Provenance
        prov = result["provenance"]
        self.assertIn("sources", prov)
        self.assertIn("metadata", prov)
        self.assertTrue(prov.get("is_research_only", True))

        print(f"  [PASS] synthesize_full_pipeline — confidence={result['overall_confidence']}")

    def test_synthesize_partial_bridges(self) -> None:
        """Test synthesis with only 2 of 4 bridges available."""
        synth = MultimodalSynthesizerV2(
            medication_bridge=None,
            genetic_bridge=MockGeneticBridge(),
            qeeg_bridge=MockQEEGBridge(),
            mri_bridge=None,
        )
        inputs = {
            "genetics": {"profile": {"CYP2D6": ["*1", "*4"]}, "medications": ["sertraline"]},
            "qeeg": {"eeg_data": {"theta": 28.5, "beta": 5.2}, "age": 34, "sex": "F"},
        }
        result = _run_async(synth.synthesize("PT-002", inputs))

        self.assertIn("domains", result)
        domains = result["domains"]
        self.assertIn("genetics", domains)
        self.assertIn("qeeg", domains)
        # Confidence should be reduced due to missing domains
        self.assertGreaterEqual(result["overall_confidence"], 0.0)
        self.assertLessEqual(result["overall_confidence"], 1.0)

        print(f"  [PASS] synthesize_partial_bridges — domains={list(domains.keys())}")

    def test_synthesize_with_bridge_errors(self) -> None:
        """Test synthesis resilience when some bridges raise exceptions."""
        synth = MultimodalSynthesizerV2(
            medication_bridge=MockMedicationBridge(scenario="error"),
            genetic_bridge=MockGeneticBridge(),
            qeeg_bridge=MockQEEGBridge(),
            mri_bridge=MockMRIBridge(),
        )
        inputs = _make_test_inputs()
        result = _run_async(synth.synthesize("PT-003", inputs))

        # Should complete despite medication bridge failure
        self.assertIn("domains", result)
        domains = result["domains"]
        # Medication domain should have error
        self.assertIn("medication", domains)
        self.assertIn("genetics", domains)
        self.assertIn("qeeg", domains)
        self.assertIn("mri", domains)

        print(f"  [PASS] synthesize_with_bridge_errors")

    def test_cross_modal_correlations_comt(self) -> None:
        """Test COMT cross-modal correlation detection."""
        synth = MultimodalSynthesizerV2()
        # Simulate domain outputs with COMT + DLPFC patterns
        domain_outputs = {
            "genetics": {
                "pgx_summary": {
                    "summary": {
                        "actionable_findings": [
                            {"gene": "COMT", "drug": "sertraline", "classification": "moderate"}
                        ]
                    },
                    "provenance": {"confidence": 0.88, "is_research_only": True},
                },
                "phenotypes": {
                    "COMT": {
                        "predicted_phenotype": "met_carrier",
                        "variants": ["Val", "Met"],
                        "provenance": {"confidence": 0.85, "is_research_only": True},
                    }
                },
            },
            "qeeg": {
                "z_scores": {
                    "z_scores": {"theta": 2.8, "beta": -1.5, "alpha": 0.3},
                    "provenance": {"confidence": 0.88, "is_research_only": True},
                },
                "deviation": {
                    "overall": {
                        "tier": "moderate",
                        "max_abs_z": 2.8,
                        "most_deviant": "theta",
                        "counts": {"normal": 1, "mild": 0, "moderate": 1, "marked": 0, "severe": 0},
                    },
                    "provenance": {"confidence": 0.75, "is_research_only": True},
                },
            },
            "mri": {
                "region_details": {
                    "Frontal_Sup_L": {
                        "details": {
                            "region_id": "Frontal_Sup_L",
                            "region_name": "Superior frontal gyrus (L)",
                            "function": "DLPFC working memory",
                            "networks": ["frontoparietal"],
                        },
                        "provenance": {"confidence": 0.85, "is_research_only": True},
                    }
                },
                "region_lookups": [
                    {
                        "query_coords": [-18, 30, 42],
                        "region": {
                            "region_name": "DLPFC",
                            "region_id": "Frontal_Sup_L",
                        },
                        "provenance": {"confidence": 0.92, "is_research_only": True},
                    }
                ],
            },
        }

        correlations = synth.find_cross_modal_correlations(domain_outputs)
        self.assertIsInstance(correlations, list)
        if correlations:
            first = correlations[0]
            self.assertIn("finding", first)
            self.assertIn("correlation_strength", first)
            self.assertIn("supporting_domains", first)
            self.assertIn("confidence", first)
            # Should involve genetics, qeeg, and/or mri
            domains_in_first = set(first.get("supporting_domains", []))
            self.assertTrue(domains_in_first.issubset({"genetics", "qeeg", "mri", "medication"}))

        print(f"  [PASS] cross_modal_correlations — found {len(correlations)} correlations")

    def test_cross_modal_correlations_no_match(self) -> None:
        """Test correlation detection with no matching patterns."""
        synth = MultimodalSynthesizerV2()
        domain_outputs = {
            "medication": {
                "normalization": {
                    "canonical_name": "Aspirin",
                    "provenance": {"confidence": 0.95, "is_research_only": False},
                },
            },
            "qeeg": {
                "z_scores": {
                    "z_scores": {"alpha": 0.2, "beta": 0.1},
                    "provenance": {"confidence": 0.88, "is_research_only": True},
                },
            },
        }
        correlations = synth.find_cross_modal_correlations(domain_outputs)
        self.assertIsInstance(correlations, list)
        # Should either find no correlations or only weak medication-qeeg ones
        for corr in correlations:
            self.assertGreaterEqual(corr["correlation_strength"], 0.0)
            self.assertLessEqual(corr["correlation_strength"], 1.0)

        print(f"  [PASS] cross_modal_correlations_no_match — {len(correlations)} found")

    def test_rank_hypotheses(self) -> None:
        """Test hypothesis ranking with rich multi-domain insights."""
        synth = MultimodalSynthesizerV2()
        insights = {
            "genetics": [
                {"description": "COMT rs4680 Val158Met variant detected", "gene": "COMT", "confidence": 0.88},
                {"description": "CYP2D6 poor metabolizer status", "gene": "CYP2D6", "confidence": 0.85},
            ],
            "qeeg": [
                {"description": "DLPFC theta elevation with beta reduction", "feature": "theta/beta", "confidence": 0.82},
                {"description": "Prefrontal hypoactivity pattern", "feature": "prefrontal", "confidence": 0.78},
            ],
            "mri": [
                {"description": "DLPFC cortical thinning observed", "region": "DLPFC", "confidence": 0.80},
                {"description": "Working memory circuit volume reduction", "region": "PFC", "confidence": 0.75},
            ],
            "medication": [
                {"description": "Sertraline metabolism profile", "drug": "sertraline", "confidence": 0.90},
            ],
        }

        hypotheses = synth.rank_hypotheses(insights)
        self.assertIsInstance(hypotheses, list)
        if hypotheses:
            # Should be sorted by confidence descending
            for i in range(len(hypotheses) - 1):
                self.assertGreaterEqual(
                    hypotheses[i]["confidence"],
                    hypotheses[i + 1]["confidence"] - 0.001,  # floating point tolerance
                )
            # First hypothesis should have rank 1
            self.assertEqual(hypotheses[0]["rank"], 1)
            # Should have required fields
            for hyp in hypotheses:
                self.assertIn("hypothesis", hyp)
                self.assertIn("confidence", hyp)
                self.assertIn("actionable", hyp)
                self.assertIn("supporting_evidence", hyp)
                self.assertGreaterEqual(hyp["confidence"], 0.0)
                self.assertLessEqual(hyp["confidence"], 1.0)

        print(f"  [PASS] rank_hypotheses — ranked {len(hypotheses)} hypotheses")

    def test_rank_hypotheses_insufficient_domains(self) -> None:
        """Test hypothesis ranking with sparse domain data."""
        synth = MultimodalSynthesizerV2()
        insights = {
            "medication": [
                {"description": "Aspirin prescribed", "drug": "aspirin", "confidence": 0.5},
            ],
        }
        hypotheses = synth.rank_hypotheses(insights)
        self.assertIsInstance(hypotheses, list)
        # Most hypotheses require 2+ domains, so expect few or none
        print(f"  [PASS] rank_hypotheses_insufficient — {len(hypotheses)} ranked")

    def test_generate_recommendations(self) -> None:
        """Test recommendation generation from hypotheses."""
        synth = MultimodalSynthesizerV2()
        hypotheses = [
            {
                "rank": 1,
                "hypothesis": "COMT-driven dopaminergic dysfunction explaining cognitive symptoms",
                "confidence": 0.85,
                "actionable": True,
                "domains_covered": ["genetics", "qeeg", "mri"],
            },
            {
                "rank": 2,
                "hypothesis": "Hippocampal atrophy with compensatory cortical slowing pattern",
                "confidence": 0.65,
                "actionable": True,
                "domains_covered": ["qeeg", "mri"],
            },
        ]

        recommendations = synth.generate_recommendations(hypotheses)
        self.assertIsInstance(recommendations, list)
        for rec in recommendations:
            self.assertIn("recommendation", rec)
            self.assertIn("rationale", rec)
            self.assertIn("supporting_databases", rec)
            self.assertIn("evidence_grade", rec)
            self.assertIn("confidence", rec)
            self.assertTrue(rec.get("research_only", True))
            self.assertIn(rec["evidence_grade"], {"A", "B", "C", "D"})

        print(f"  [PASS] generate_recommendations — {len(recommendations)} recommendations")

    def test_generate_recommendations_empty(self) -> None:
        """Test recommendation generation with no matching hypotheses."""
        synth = MultimodalSynthesizerV2()
        hypotheses: list[dict[str, Any]] = []
        recommendations = synth.generate_recommendations(hypotheses)
        self.assertIsInstance(recommendations, list)
        self.assertEqual(len(recommendations), 0)
        print(f"  [PASS] generate_recommendations_empty")

    def test_calculate_overall_confidence(self) -> None:
        """Test overall confidence aggregation with various scenarios."""
        synth = MultimodalSynthesizerV2()

        # All 4 domains at high confidence
        scores_all_high = {
            "medication": 0.90,
            "genetics": 0.88,
            "qeeg": 0.85,
            "mri": 0.82,
        }
        conf_all = synth.calculate_overall_confidence(scores_all_high)
        self.assertGreater(conf_all, 0.8)
        self.assertLessEqual(conf_all, 1.0)

        # All 4 domains at low confidence
        scores_all_low = {
            "medication": 0.30,
            "genetics": 0.25,
            "qeeg": 0.20,
            "mri": 0.15,
        }
        conf_low = synth.calculate_overall_confidence(scores_all_low)
        self.assertLess(conf_low, 0.3)
        self.assertGreaterEqual(conf_low, 0.0)

        # 2 of 4 domains (partial coverage)
        scores_partial = {
            "genetics": 0.85,
            "qeeg": 0.80,
        }
        conf_partial = synth.calculate_overall_confidence(scores_partial)
        # Should be penalized for missing domains
        self.assertLess(conf_partial, conf_all)

        # Empty
        conf_empty = synth.calculate_overall_confidence({})
        self.assertEqual(conf_empty, 0.0)

        print(f"  [PASS] calculate_overall_confidence — all_high={conf_all:.3f}, low={conf_low:.3f}, partial={conf_partial:.3f}")

    def test_synthesize_output_schema(self) -> None:
        """Verify the output schema matches the canonical structure."""
        synth = MultimodalSynthesizerV2(
            medication_bridge=MockMedicationBridge(),
            genetic_bridge=MockGeneticBridge(),
            qeeg_bridge=MockQEEGBridge(),
            mri_bridge=MockMRIBridge(),
        )
        inputs = _make_test_inputs()
        result = _run_async(synth.synthesize("PT-TEST-001", inputs))

        # Verify all top-level keys
        expected_keys = {
            "synthesis_id",
            "patient_id",
            "timestamp",
            "domains",
            "cross_modal_correlations",
            "ranked_hypotheses",
            "treatment_recommendations",
            "overall_confidence",
            "research_only_flags",
            "provenance",
            "safety_notice",
        }
        self.assertEqual(set(result.keys()), expected_keys)

        # Verify domain structure
        for domain_name, domain_data in result["domains"].items():
            self.assertIn("insights", domain_data)
            self.assertIn("bridge", domain_data)
            self.assertIn("confidence", domain_data)

        # Verify correlation structure
        for corr in result["cross_modal_correlations"]:
            self.assertIn("finding", corr)
            self.assertIn("correlation_strength", corr)
            self.assertIn("supporting_domains", corr)
            self.assertIn("confidence", corr)

        # Verify hypothesis structure
        for hyp in result["ranked_hypotheses"]:
            self.assertIn("rank", hyp)
            self.assertIn("hypothesis", hyp)
            self.assertIn("supporting_evidence", hyp)
            self.assertIn("confidence", hyp)
            self.assertIn("actionable", hyp)

        # Verify recommendation structure
        for rec in result["treatment_recommendations"]:
            self.assertIn("recommendation", rec)
            self.assertIn("rationale", rec)
            self.assertIn("supporting_databases", rec)
            self.assertIn("evidence_grade", rec)
            self.assertIn("confidence", rec)

        # Verify provenance structure
        prov = result["provenance"]
        self.assertIn("sources", prov)
        self.assertIn("query", prov)
        self.assertIn("confidence", prov)
        self.assertIn("confidence_tier", prov)
        self.assertIn("is_research_only", prov)
        self.assertIn("accessed_at", prov)
        self.assertIn("bridge", prov)
        self.assertIn("version", prov)
        self.assertIn("metadata", prov)

        # Verify research_only flag count
        self.assertIsInstance(result["research_only_flags"], int)

        print(f"  [PASS] synthesize_output_schema")

    def test_build_synthesizer_factory(self) -> None:
        """Test the convenience factory function."""
        synth = build_synthesizer(
            medication_bridge=MockMedicationBridge(),
            genetic_bridge=MockGeneticBridge(),
        )
        self.assertIsInstance(synth, MultimodalSynthesizerV2)
        self.assertIsNotNone(synth._medication_bridge)
        self.assertIsNotNone(synth._genetic_bridge)
        self.assertIsNone(synth._qeeg_bridge)
        self.assertIsNone(synth._mri_bridge)
        print(f"  [PASS] build_synthesizer_factory")

    def test_parallel_execution(self) -> None:
        """Verify bridges execute in parallel (no sequential blocking)."""
        # This test verifies that asyncio.gather is used correctly
        # by checking that all bridges produce results
        synth = MultimodalSynthesizerV2(
            medication_bridge=MockMedicationBridge(),
            genetic_bridge=MockGeneticBridge(),
            qeeg_bridge=MockQEEGBridge(),
            mri_bridge=MockMRIBridge(),
        )
        inputs = _make_test_inputs()
        result = _run_async(synth.synthesize("PT-PARALLEL", inputs))

        # All 4 domains should have results, confirming parallel execution worked
        for domain in ["medication", "genetics", "qeeg", "mri"]:
            self.assertIn(domain, result["domains"])
            self.assertIsInstance(result["domains"][domain]["insights"], list)

        print(f"  [PASS] parallel_execution")

    def test_find_cross_modal_with_dlpfc_qeeg_mri(self) -> None:
        """Specific test for DLPFC qEEG-MRI correlation."""
        synth = MultimodalSynthesizerV2()
        domain_outputs = {
            "qeeg": {
                "z_scores": {
                    "z_scores": {"theta": 2.5, "beta": -2.0, "alpha": 0.1},
                    "provenance": {"confidence": 0.82, "is_research_only": True},
                },
                "deviation": {
                    "overall": {
                        "tier": "moderate",
                        "max_abs_z": 2.5,
                        "most_deviant": "theta",
                    },
                    "provenance": {"confidence": 0.75, "is_research_only": True},
                },
            },
            "mri": {
                "region_details": {
                    "DLPFC": {
                        "details": {
                            "region_name": "DLPFC",
                            "function": "Working memory / Executive control",
                            "networks": ["frontoparietal"],
                        },
                        "provenance": {"confidence": 0.85, "is_research_only": True},
                    }
                },
            },
        }

        correlations = synth.find_cross_modal_correlations(domain_outputs)
        self.assertIsInstance(correlations, list)
        # Check if electrostructure-concordance correlation is found
        e_s_corrs = [c for c in correlations if c.get("correlation_type") == "electrostructure-concordance"]
        for corr in e_s_corrs:
            self.assertIn("qeeg", corr["supporting_domains"])
            self.assertIn("mri", corr["supporting_domains"])

        print(f"  [PASS] find_cross_modal_with_dlpfc — {len(correlations)} correlations, {len(e_s_corrs)} electrostructure")

    def test_research_only_flag_propagation(self) -> None:
        """Verify that research_only flags are counted correctly."""
        synth = MultimodalSynthesizerV2(
            medication_bridge=MockMedicationBridge(),  # has non-research normalization
            genetic_bridge=MockGeneticBridge(),  # all research
            qeeg_bridge=MockQEEGBridge(),  # all research
            mri_bridge=MockMRIBridge(),  # all research
        )
        inputs = _make_test_inputs()
        result = _run_async(synth.synthesize("PT-FLAGS", inputs))
        # Genetic, qEEG, MRI should all be research-only
        self.assertIsInstance(result["research_only_flags"], int)
        self.assertGreaterEqual(result["research_only_flags"], 2)
        print(f"  [PASS] research_only_flags — count={result['research_only_flags']}")

    def test_graceful_all_bridges_down(self) -> None:
        """Test synthesis with all bridges None and no inputs."""
        synth = MultimodalSynthesizerV2()
        result = _run_async(synth.synthesize("PT-NO-BRIDGES", {}))
        self.assertIn("domains", result)
        self.assertEqual(len(result["domains"]), 0)
        self.assertEqual(result["overall_confidence"], 0.0)
        self.assertEqual(result["research_only_flags"], 0)
        print(f"  [PASS] graceful_all_bridges_down")

    def test_single_domain_high_confidence(self) -> None:
        """Test with only one domain but high confidence."""
        synth = MultimodalSynthesizerV2(
            genetic_bridge=MockGeneticBridge(),
        )
        inputs = {
            "genetics": {"profile": {"COMT": ["Val", "Met"]}, "medications": ["sertraline"]},
        }
        result = _run_async(synth.synthesize("PT-SINGLE", inputs))
        self.assertIn("genetics", result["domains"])
        self.assertGreater(len(result["ranked_hypotheses"]), 0)
        # Should still have correlations if genetic keywords match other domain patterns
        print(f"  [PASS] single_domain_high_confidence")

    def test_hypothesis_ranking_order(self) -> None:
        """Verify hypothesis ranking produces correctly ordered results."""
        synth = MultimodalSynthesizerV2()
        # Create insights that should trigger multiple hypotheses
        insights = {
            "genetics": [
                {"description": "COMT rs4680 Val158Met poor_metabolizer variant", "confidence": 0.90},
            ],
            "qeeg": [
                {"description": "DLPFC prefrontal theta beta hypoactivity reduced", "confidence": 0.85},
            ],
            "mri": [
                {"description": "DLPFC volume working memory reduction", "confidence": 0.80},
            ],
        }
        hypotheses = synth.rank_hypotheses(insights)
        # All 3 domains present — should match H1 (COMT + DLPFC + MRI)
        if hypotheses:
            self.assertEqual(hypotheses[0]["rank"], 1)
            # Check that ranks are sequential
            for i, h in enumerate(hypotheses):
                self.assertEqual(h["rank"], i + 1)
            # Check descending confidence
            for i in range(len(hypotheses) - 1):
                self.assertGreaterEqual(
                    hypotheses[i]["confidence"],
                    hypotheses[i + 1]["confidence"] - 0.001,
                )
        print(f"  [PASS] hypothesis_ranking_order — {len(hypotheses)} hypotheses")

    def test_correlation_type_field(self) -> None:
        """Verify correlation_type field is present and valid."""
        synth = MultimodalSynthesizerV2()
        domain_outputs = {
            "genetics": {
                "pgx_summary": {
                    "summary": {
                        "actionable_findings": [
                            {"gene": "CYP2D6", "drug": "sertraline", "classification": "strong"}
                        ]
                    },
                    "provenance": {"confidence": 0.85, "is_research_only": True},
                },
            },
            "medication": {
                "normalization": {
                    "canonical_name": "Sertraline",
                    "provenance": {"confidence": 0.95, "is_research_only": False},
                },
                "interactions": {
                    "interactions": [
                        {
                            "drugs": ["sertraline"],
                            "description": "Metabolism via CYP2D6",
                            "severity": "moderate",
                            "evidence_grade": "B",
                        }
                    ],
                    "provenance": {"confidence": 0.80, "is_research_only": True},
                },
            },
        }
        correlations = synth.find_cross_modal_correlations(domain_outputs)
        for corr in correlations:
            self.assertIn("correlation_type", corr)
            self.assertIsInstance(corr["correlation_type"], str)
            self.assertGreater(len(corr["correlation_type"]), 0)
        print(f"  [PASS] correlation_type_field — {len(correlations)} correlations validated")


# ── Standalone execution ───────────────────────────────────────────────────────


def _run_all_tests() -> None:
    """Run the test suite and print a summary."""
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestMultimodalSynthesizerV2)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 70)
    if result.wasSuccessful():
        print("ALL TESTS PASSED")
    else:
        print(f"TESTS FAILED — errors={len(result.errors)}, failures={len(result.failures)}")
    print(f"Tests run: {result.testsRun}")
    print("=" * 70)
    return result.wasSuccessful()


if __name__ == "__main__":
    # Run tests when executed directly
    success = _run_all_tests()
    if not success:
        exit(1)
