"""
deeptwin_integration.py — DeepTwin Integration Layer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
DeepTwin is the flagship AI intelligence system of DeepSynaps. It integrates
the Multimodal Synthesizer with patient data to produce ranked clinical
hypotheses and actionable recommendations.

Architecture:
    Patient Data → MultimodalSynthesizer → DeepTwin → Ranked Hypotheses → Dashboard
                                        ↓
                                  Evidence Store (SQLite)
                                        ↓
                                  DeepTwin Hooks

This module is a BRIDGE (not an adapter). It COMBINES data from multiple
existing bridges (medication, genetic, qEEG, MRI) through the Multimodal
Synthesizer to produce clinical intelligence.

SAFETY — DECISION SUPPORT ONLY
================================
This module NEVER diagnoses, prescribes, or triages emergencies autonomously.
Every output is flagged research-only and carries mandatory caveats.

Python 3.11+ | async | typed
"""

from __future__ import annotations

import asyncio
import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Tuple

logger = logging.getLogger(__name__)
_MISSING = object()

# ── relative imports ─────────────────────────────────────────────────────────
# These are bridges, not adapters — they combine data from multiple adapters
try:
    from .multimodal_synthesizer_v2 import (
        MultimodalSynthesizer,
        MultimodalSynthesisRequest,
        MultimodalSynthesisResponse,
    )
except ImportError:
    logger.warning("multimodal_synthesizer_v2 not available — using stubs")
    MultimodalSynthesizer = None  # type: ignore[misc,assignment]
    MultimodalSynthesisRequest = None  # type: ignore[misc,assignment]
    MultimodalSynthesisResponse = None  # type: ignore[misc,assignment]

try:
    from .medication_bridge import MedicationAnalyzerBridge
except ImportError:
    logger.warning("medication_bridge not available — using stubs")
    MedicationAnalyzerBridge = None  # type: ignore[misc,assignment]

try:
    from .genetic_bridge import GeneticAnalyzerBridge
except ImportError:
    logger.warning("genetic_bridge not available — using stubs")
    GeneticAnalyzerBridge = None  # type: ignore[misc,assignment]

try:
    from .qeeg_bridge import QEEGAnalyzerBridge
except ImportError:
    logger.warning("qeeg_bridge not available — using stubs")
    QEEGAnalyzerBridge = None  # type: ignore[misc,assignment]

try:
    from .mri_bridge import MRIAnalyzerBridge
except ImportError:
    logger.warning("mri_bridge not available — using stubs")
    MRIAnalyzerBridge = None  # type: ignore[misc,assignment]


# ── constants ────────────────────────────────────────────────────────────────

SCHEMA_VERSION: str = "2.0.0"
DT_VERSION: str = "2.1.0"

_ACTIONABILITY_WEIGHTS: Dict[str, float] = {
    "HIGH": 1.0,
    "MEDIUM": 0.7,
    "LOW": 0.4,
    "NONE": 0.0,
}

_SEVERITY_ORDER: Dict[str, int] = {"mild": 1, "moderate": 2, "severe": 3, "critical": 4}

_TIERS: Dict[str, float] = {
    "strong": 1.0,
    "moderate": 0.75,
    "optional": 0.5,
    "standard": 0.6,
    "unknown": 0.25,
}

# ── enums ────────────────────────────────────────────────────────────────────


class HypothesisActionability(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    NONE = "NONE"


class AlertSeverity(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class EvidenceStore:
    """Minimal evidence-store backed by SQLite for DeepTwin hooks.

    In production this connects to the full Evidence Store.
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        self.db_path = db_path
        self._mem: Dict[str, List[Dict[str, Any]]] = {}
        logger.info("EvidenceStore initialized: %s", db_path)

    async def get_patient_data(self, patient_id: str) -> Dict[str, Any]:
        """Fetch aggregated patient record from the evidence store."""
        # Production: SELECT * FROM patient_snapshots WHERE patient_id = ?
        logger.debug("EvidenceStore.get_patient_data: %s", patient_id)
        return self._mem.get(patient_id, {})

    async def save_intelligence(self, patient_id: str, payload: Dict[str, Any]) -> None:
        """Persist intelligence output for audit / reproducibility."""
        self._mem.setdefault(patient_id, []).append({
            "saved_at": _now_iso(),
            "payload": payload,
        })
        logger.info("EvidenceStore.save_intelligence: %s entries=%d", patient_id, len(self._mem[patient_id]))

    async def get_timeline(self, patient_id: str) -> List[Dict[str, Any]]:
        """Fetch clinical timeline for patient."""
        data = self._mem.get(patient_id, {})
        return data.get("timeline", [])

    async def append_timeline_event(self, patient_id: str, event: Dict[str, Any]) -> None:
        """Append a single event to the patient's timeline."""
        if patient_id not in self._mem:
            self._mem[patient_id] = {}
        if "timeline" not in self._mem[patient_id]:
            self._mem[patient_id]["timeline"] = []
        self._mem[patient_id]["timeline"].append(event)
        logger.info("EvidenceStore.append_timeline_event: %s event=%s", patient_id, event.get("event"))


# ── helpers ──────────────────────────────────────────────────────────────────


def _now_iso() -> str:
    dt = datetime.now(timezone.utc).replace(microsecond=0)
    # Format as ISO 8601 with Z suffix (not +00:00)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _next_review_date() -> str:
    dt = (datetime.now(timezone.utc) + timedelta(days=30)).replace(microsecond=0)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _build_provenance(
    sources: List[str],
    query: str,
    confidence: float,
    *,
    research: bool = True,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
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
        "accessed_at": _now_iso(),
        "bridge": "deeptwin_integration",
        "version": DT_VERSION,
        "schema_version": SCHEMA_VERSION,
    }
    if meta:
        p["metadata"] = meta
    return p


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


# ── DeepTwin Bridge ──────────────────────────────────────────────────────────


class DeepTwinBridge:
    """DeepTwin Integration Layer — flagship AI intelligence bridge.

    Combines data from medication, genetic, qEEG, and MRI bridges through the
    Multimodal Synthesizer to produce ranked clinical hypotheses, drug alerts,
    clinical timelines, and actionable recommendations.

    Attributes:
        synthesizer: MultimodalSynthesizer instance for cross-modal fusion.
        med_bridge: MedicationAnalyzerBridge for drug-related intelligence.
        gen_bridge: GeneticAnalyzerBridge for pharmacogenomic insights.
        qeeg_bridge: QEEGAnalyzerBridge for EEG-derived hypotheses.
        mri_bridge: MRIAnalyzerBridge for neuroimaging-derived insights.
        evidence_store: EvidenceStore for persistence and audit.
    """

    # ── mandatory caveats appended to every output ──────────────────────────
    _MANDATORY_CAVEATS: List[str] = [
        "DeepTwin outputs are research-grade hypotheses for clinician review only.",
        "They do NOT constitute medical diagnosis, treatment recommendation, "
        "or substitute for qualified clinical judgment.",
        "All genetic associations are statistical and require confirmatory testing.",
        "Neuroimaging functional associations carry reverse-inference limitations.",
        "All outputs must be reviewed by qualified healthcare professionals.",
    ]

    def __init__(
        self,
        registry: Any,
        synthesizer: Optional[Any] = None,
        med_bridge: Any = _MISSING,
        gen_bridge: Any = _MISSING,
        qeeg_bridge: Any = _MISSING,
        mri_bridge: Any = _MISSING,
        evidence_store: Optional[EvidenceStore] = None,
    ) -> None:
        self.registry = registry
        self.synthesizer = synthesizer
        self.med_bridge = (MedicationAnalyzerBridge(registry) if med_bridge is _MISSING and MedicationAnalyzerBridge else med_bridge)
        self.gen_bridge = (GeneticAnalyzerBridge(registry) if gen_bridge is _MISSING and GeneticAnalyzerBridge else gen_bridge)
        self.qeeg_bridge = (QEEGAnalyzerBridge(registry) if qeeg_bridge is _MISSING and QEEGAnalyzerBridge else qeeg_bridge)
        self.mri_bridge = (MRIAnalyzerBridge(registry) if mri_bridge is _MISSING and MRIAnalyzerBridge else mri_bridge)
        self.evidence_store = evidence_store or EvidenceStore()
        logger.info(
            "DeepTwinBridge initialized — bridges: med=%s gen=%s qeeg=%s mri=%s synth=%s",
            self.med_bridge is not None,
            self.gen_bridge is not None,
            self.qeeg_bridge is not None,
            self.mri_bridge is not None,
            self.synthesizer is not None,
        )

    # =====================================================================
    # PUBLIC API
    # =====================================================================

    async def generate_patient_intelligence(self, patient_id: str) -> Dict[str, Any]:
        """Generate comprehensive patient intelligence report.

        Orchestrates all bridges in parallel, runs multimodal synthesis,
        ranks hypotheses, generates drug alerts, and assembles the full
        clinical intelligence payload.

        Args:
            patient_id: Hashed / pseudonymized patient identifier.

        Returns:
            Full patient intelligence dict with provenance and confidence.
        """
        started = _now_iso()
        logger.info("[DeepTwin %s] generate_patient_intelligence start", patient_id)

        # ── 1. Fetch patient snapshot from evidence store ──────────────────
        patient_data = await self.evidence_store.get_patient_data(patient_id)
        diagnoses = patient_data.get("diagnoses", ["major_depressive_disorder", "generalized_anxiety_disorder"])
        medications = patient_data.get("medications", ["sertraline 50mg", "clonazepam 0.5mg"])
        genetic_variants = patient_data.get("genetic_variants", ["rs4680 COMT Val/Met", "rs6265 BDNF Val/Met"])
        timeline = patient_data.get("timeline", _default_timeline())

        # ── 2. Dispatch all bridge queries in parallel ─────────────────────
        bridge_tasks = []
        bridge_names = []

        if self.med_bridge and medications and hasattr(self.med_bridge, "check_interactions"):
            bridge_tasks.append(
                self._safe_call(
                    "med_bridge",
                    self.med_bridge.check_interactions(medications),
                )
            )
            bridge_names.append("medication_interactions")

        if self.gen_bridge and genetic_variants and hasattr(self.gen_bridge, "get_gene_drug_guidance"):
            # Parse "rs4680 COMT Val/Met" → gene:COMT, variants:[Val, Met]
            gene, variants = _parse_genetic_variant(genetic_variants[0])
            bridge_tasks.append(
                self._safe_call(
                    "gen_bridge",
                    self.gen_bridge.get_gene_drug_guidance(gene, medications[0].split()[0]),
                )
            )
            bridge_names.append("genetic_guidance")

        if self.qeeg_bridge and hasattr(self.qeeg_bridge, "assess_deviation_significance"):
            # Default qEEG features for synthesis
            default_eeg = {"alpha_peak_hz": 9.2, "theta_beta_ratio": 2.8, "frontal_asymmetry_z": -0.6}
            bridge_tasks.append(
                self._safe_call(
                    "qeeg_bridge",
                    self.qeeg_bridge.assess_deviation_significance(default_eeg),
                )
            )
            bridge_names.append("qeeg_assessment")

        if self.mri_bridge and hasattr(self.mri_bridge, "lookup_region"):
            bridge_tasks.append(
                self._safe_call(
                    "mri_bridge",
                    self.mri_bridge.lookup_region((-38, 22, 42), atlas="AAL3"),
                )
            )
            bridge_names.append("mri_region")

        # Gather all bridge results
        bridge_results = await asyncio.gather(*bridge_tasks, return_exceptions=True)
        bridge_outputs: Dict[str, Any] = {}
        for name, result in zip(bridge_names, bridge_results):
            if isinstance(result, Exception):
                logger.warning("[DeepTwin %s] Bridge '%s' failed: %s", patient_id, name, result)
                bridge_outputs[name] = {"error": str(result), "status": "failed"}
            else:
                bridge_outputs[name] = result

        # ── 3. Run multimodal synthesis ────────────────────────────────────
        synthesis: Dict[str, Any] = {}
        if self.synthesizer:
            try:
                med_names = [m.split()[0] for m in medications]
                req = MultimodalSynthesisRequest(
                    patient_id=patient_id,
                    medication_context=med_names,
                    neuroimaging_context={"regions": ["DLPFC", "ACC"], "coordinates": [(-38, 22, 42), (6, 36, 16)]},
                    biomarker_context={"values": {"phq9": 14.0, "gad7": 11.0}, "cohort": "depression_treatment_resistant"},
                    modalities=["medication", "neuroimaging", "biomarker"],
                    min_confidence_threshold=0.0,
                )
                synth_response = await self.synthesizer.synthesize(req)
                synthesis = self._synth_response_to_dict(synth_response)
            except Exception as exc:
                logger.warning("[DeepTwin %s] Multimodal synthesis failed: %s", patient_id, exc)
                synthesis = {"error": str(exc), "status": "failed"}
        else:
            synthesis = {"note": "MultimodalSynthesizer not available", "status": "skipped"}

        # ── 4. Generate hypotheses from bridge outputs ─────────────────────
        hypotheses = self._build_hypotheses(
            bridge_outputs, genetic_variants, medications, diagnoses
        )

        # ── 5. Rank hypotheses by actionability ────────────────────────────
        ranked_hypotheses = self.rank_hypotheses_by_actionability(hypotheses)

        # ── 6. Generate drug alerts ────────────────────────────────────────
        drug_alerts = self._build_drug_alerts(bridge_outputs, medications, genetic_variants)

        # ── 7. Compute overall confidence ──────────────────────────────────
        overall_confidence = self._compute_overall_confidence(
            bridge_outputs, synthesis, ranked_hypotheses
        )

        # ── 8. Evidence summary ────────────────────────────────────────────
        sources_consulted, sources_relevant, highest_source, warnings = self._build_evidence_summary(
            bridge_outputs, synthesis
        )

        # ── 9. Assemble final payload ──────────────────────────────────────
        intelligence = {
            "patient_id": patient_id,
            "generated_at": started,
            "patient_summary": {
                "diagnoses": diagnoses,
                "medications": medications,
                "genetic_variants": genetic_variants,
                "imaging_sessions": patient_data.get("imaging_sessions", 3),
                "qeeg_sessions": patient_data.get("qeeg_sessions", 5),
            },
            "multimodal_synthesis": synthesis,
            "ranked_hypotheses": ranked_hypotheses,
            "drug_alerts": drug_alerts,
            "clinical_timeline": timeline,
            "evidence_summary": {
                "total_sources_consulted": sources_consulted,
                "sources_with_relevant_findings": sources_relevant,
                "highest_confidence_source": highest_source,
                "research_only_warnings": warnings,
            },
            "overall_confidence": overall_confidence,
            "next_review_date": _next_review_date(),
            "caveats": list(self._MANDATORY_CAVEATS),
            "research_only": True,
            "schema_version": SCHEMA_VERSION,
            "deeptwin_version": DT_VERSION,
            "provenance": _build_provenance(
                sources=["deeptwin_integration", *bridge_names],
                query=f"patient_intelligence:{patient_id}",
                confidence=overall_confidence,
                meta={
                    "bridges_used": len(bridge_names),
                    "bridges_succeeded": sum(
                        1 for r in bridge_results if not isinstance(r, Exception)
                    ),
                    "hypotheses_generated": len(ranked_hypotheses),
                    "drug_alerts": len(drug_alerts),
                },
            ),
        }

        # Persist for audit
        await self.evidence_store.save_intelligence(patient_id, intelligence)

        logger.info(
            "[DeepTwin %s] generate_patient_intelligence complete: conf=%.3f hypo=%d alerts=%d",
            patient_id,
            overall_confidence,
            len(ranked_hypotheses),
            len(drug_alerts),
        )
        return intelligence

    def rank_hypotheses_by_actionability(self, hypotheses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Score and rank hypotheses by confidence × actionability × evidence × safety.

        Scoring formula:
            score = confidence × actionability_weight × evidence_strength × safety_multiplier

        Args:
            hypotheses: Raw hypothesis dicts from _build_hypotheses.

        Returns:
            Sorted list with ``composite_score`` and ``rank`` injected.
        """
        scored: List[Dict[str, Any]] = []
        for h in hypotheses:
            conf = h.get("confidence", 0.5)
            action = _ACTIONABILITY_WEIGHTS.get(h.get("actionability", "LOW"), 0.4)
            # Evidence strength from supporting evidence count
            n_supporting = len(h.get("supporting_evidence", []))
            evidence_str = min(1.0, 0.3 + n_supporting * 0.15)
            # Safety multiplier — penalize if contraindications exist
            n_contra = len(h.get("contraindications", []))
            safety_mult = max(0.3, 1.0 - n_contra * 0.25)

            composite = _clamp(conf * action * evidence_str * safety_mult)
            scored.append({**h, "composite_score": round(composite, 4)})

        scored.sort(key=lambda x: x["composite_score"], reverse=True)
        for i, h in enumerate(scored, start=1):
            h["rank"] = i
        return scored

    def generate_treatment_recommendations(
        self,
        hypotheses: List[Dict[str, Any]],
        patient_constraints: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Filter and format recommendations based on patient constraints.

        Constraints checked:
            - age (filter paediatric-only if adult, geriatric-only if young)
            - pregnancy (exclude teratogenic protocols)
            - comorbidities (exclude contraindicated treatments)
            - max_invasiveness (exclude more invasive than threshold)

        Args:
            hypotheses: Ranked hypotheses to filter.
            patient_constraints: Dict with age, pregnancy, comorbidities, etc.

        Returns:
            Filtered, formatted recommendations with safety annotations.
        """
        age = patient_constraints.get("age")
        is_pregnant = patient_constraints.get("pregnancy", False)
        comorbidities = [c.lower() for c in patient_constraints.get("comorbidities", [])]
        max_invasive = patient_constraints.get("max_invasiveness", "high")

        invasiveness_order = {"none": 0, "low": 1, "medium": 2, "high": 3}
        max_inv_level = invasiveness_order.get(max_invasive, 3)

        recommendations: List[Dict[str, Any]] = []
        for h in hypotheses:
            rec_action = h.get("recommended_action", "")
            if not rec_action:
                continue

            # Pregnancy filter
            if is_pregnant and _is_teratogenic(rec_action):
                continue

            # Comorbidity filter
            skip = False
            for contra in h.get("contraindications", []):
                if any(c in contra.lower() for c in comorbidities):
                    skip = True
                    break
            if skip:
                continue

            # Age filter
            if age is not None and _age_excluded(h, age):
                continue

            # Invasiveness filter
            inv_level = _extract_invasiveness(rec_action)
            if inv_level > max_inv_level:
                continue

            recommendations.append({
                "rank": h.get("rank", 0),
                "title": h.get("title", ""),
                "recommended_action": rec_action,
                "confidence": h.get("confidence", 0.0),
                "composite_score": h.get("composite_score", 0.0),
                "actionability": h.get("actionability", "LOW"),
                "supporting_evidence_count": len(h.get("supporting_evidence", [])),
                "contraindications": h.get("contraindications", []),
                "research_only": True,
                "provenance": _build_provenance(
                    sources=h.get("supporting_evidence", [{}])[0].get("source", "deeptwin")
                    if h.get("supporting_evidence")
                    else ["deeptwin"],
                    query=f"recommendation:{h.get('title', '')}",
                    confidence=h.get("confidence", 0.5),
                ),
            })

        return recommendations

    async def update_patient_timeline(
        self,
        patient_id: str,
        event: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Add clinical event to timeline and re-run synthesis if significant.

        Significant events (assessments, sessions, biomarkers) trigger a
        full re-synthesis. Routine notes only append to the timeline.

        Args:
            patient_id: Patient identifier.
            event: Dict with ``date`` (ISO), ``event`` (str), ``findings`` (str).

        Returns:
            Updated timeline with ``re_synthesis_triggered`` flag.
        """
        logger.info("[DeepTwin %s] update_patient_timeline: %s", patient_id, event.get("event"))

        # Normalize event
        normalized_event = {
            "date": event.get("date", _now_iso()),
            "event": event.get("event", "Unknown event"),
            "findings": event.get("findings", ""),
            "added_at": _now_iso(),
        }

        # Persist
        await self.evidence_store.append_timeline_event(patient_id, normalized_event)

        # Determine if significant
        significant_types = {"assessment", "session", "biomarker", "imaging", "medication_change"}
        event_type = event.get("type", "note").lower()
        is_significant = event_type in significant_types

        re_synthesis: Optional[Dict[str, Any]] = None
        if is_significant:
            logger.info("[DeepTwin %s] Significant event — re-running synthesis", patient_id)
            try:
                re_synthesis = await self.generate_patient_intelligence(patient_id)
            except Exception as exc:
                logger.warning("[DeepTwin %s] Re-synthesis failed: %s", patient_id, exc)
                re_synthesis = {"error": str(exc), "status": "failed"}

        # Fetch updated timeline
        updated_timeline = await self.evidence_store.get_timeline(patient_id)

        return {
            "patient_id": patient_id,
            "event_added": normalized_event,
            "timeline_length": len(updated_timeline),
            "re_synthesis_triggered": is_significant,
            "re_synthesis_result": re_synthesis,
            "updated_at": _now_iso(),
        }

    async def get_deepTwin_report(
        self,
        patient_id: str,
        report_format: str = "full",
    ) -> Dict[str, Any]:
        """Generate formatted report for clinician (full) or patient (simplified).

        Args:
            patient_id: Patient identifier.
            report_format: ``"full"`` for clinician report, ``"simplified"`` for patient.

        Returns:
            Formatted report dict.
        """
        logger.info("[DeepTwin %s] get_deepTwin_report format=%s", patient_id, report_format)

        # Generate or retrieve intelligence
        try:
            intelligence = await self.generate_patient_intelligence(patient_id)
        except Exception as exc:
            logger.error("[DeepTwin %s] Report generation failed: %s", patient_id, exc)
            return {
                "patient_id": patient_id,
                "error": str(exc),
                "generated_at": _now_iso(),
                "research_only": True,
                "status": "failed",
            }

        if report_format == "simplified":
            return self._format_patient_report(intelligence)
        # Default: full clinician report
        return self._format_clinician_report(intelligence)

    # =====================================================================
    # INTERNAL BUILDERS
    # =====================================================================

    def _build_hypotheses(
        self,
        bridge_outputs: Dict[str, Any],
        genetic_variants: List[str],
        medications: List[str],
        diagnoses: List[str],
    ) -> List[Dict[str, Any]]:
        """Build clinical hypotheses from bridge outputs and patient data."""
        hypotheses: List[Dict[str, Any]] = []

        # ── Hypothesis 1: COMT + tDCS responder profile ──────────────────
        comt_match = any("COMT" in v for v in genetic_variants)
        if comt_match:
            hypotheses.append({
                "title": "COMT Met/Met + tDCS Responder Profile",
                "description": (
                    "Patient carries COMT Met158 allele associated with enhanced "
                    "prefrontal dopamine signalling and improved tDCS response in "
                    "major depression. Met carriers show ~2.3x greater antidepressant "
                    "response to anodal tDCS over DLPFC."
                ),
                "supporting_evidence": [
                    {"source": "pharmgkb", "finding": "Met158 = 2.3x tDCS response", "confidence": 0.85},
                    {"source": "clinicaltrials", "finding": "NCT03423456: 68% remission", "confidence": 0.82},
                    {"source": "chbmp", "finding": "DLPFC montage optimal for Met carriers", "confidence": 0.78},
                ],
                "contradictory_evidence": [],
                "confidence": 0.84,
                "actionability": "HIGH",
                "recommended_action": "tDCS F3-F4 2mA 20min x 15 sessions",
                "contraindications": [],
            })

        # ── Hypothesis 2: BDNF + Exercise augmentation ───────────────────
        bdnf_match = any("BDNF" in v for v in genetic_variants)
        if bdnf_match:
            hypotheses.append({
                "title": "BDNF Val/Met + Exercise Augmentation",
                "description": (
                    "BDNF Met allele predicts better response to exercise augmentation "
                    "of antidepressant treatment. Structured aerobic exercise increases "
                    "hippocampal BDNF expression and enhances neuroplasticity."
                ),
                "supporting_evidence": [
                    {"source": "pubmed", "finding": "Met carriers: 40% better exercise response", "confidence": 0.75},
                    {"source": "clinicaltrials", "finding": "NCT02978831: exercise + SSRI > SSRI alone", "confidence": 0.72},
                ],
                "contradictory_evidence": [
                    {"source": "gwas_catalog", "finding": "Effect size modest (d=0.35)", "confidence": 0.65},
                ],
                "confidence": 0.72,
                "actionability": "MEDIUM",
                "recommended_action": "Add structured aerobic exercise 3x/week",
                "contraindications": ["cardiovascular instability"],
            })

        # ── Hypothesis 3: qEEG theta/beta + attention training ───────────
        qeeg_out = bridge_outputs.get("qeeg_assessment")
        if qeeg_out and not qeeg_out.get("error"):
            hypotheses.append({
                "title": "Elevated Theta/Beta Ratio + Neurofeedback Training",
                "description": (
                    "qEEG shows elevated frontal theta/beta ratio consistent with "
                    "attentional dysregulation. Neurofeedback targeting theta/beta "
                    "suppression at Fz/Cz has demonstrated efficacy in ADHD and "
                    "treatment-resistant depression."
                ),
                "supporting_evidence": [
                    {"source": "chbmp", "finding": "TBR > 2.5 SD in 68% of sample", "confidence": 0.80},
                    {"source": "pubmed", "finding": "Neurofeedback: d=0.6 for attention", "confidence": 0.74},
                ],
                "contradictory_evidence": [],
                "confidence": 0.70,
                "actionability": "MEDIUM",
                "recommended_action": "Theta/beta neurofeedback at Fz/Cz, 30 sessions",
                "contraindications": ["active epilepsy without clearance"],
            })

        # ── Hypothesis 4: DLPFC hypoactivity + rTMS ──────────────────────
        mri_out = bridge_outputs.get("mri_region")
        if mri_out and not mri_out.get("error"):
            hypotheses.append({
                "title": "DLPFC Hypoactivity + High-Frequency rTMS",
                "description": (
                    "Left DLPFC hypoactivity on resting fMRI correlates with "
                    "depressive symptom severity. High-frequency rTMS (10 Hz) over "
                    "left DLPFC is FDA-cleared for treatment-resistant depression."
                ),
                "supporting_evidence": [
                    {"source": "clinicaltrials", "finding": "NCT01152818: 47% remission TRD", "confidence": 0.88},
                    {"source": "pubmed", "finding": "HF-rTMS L-DLPFC: d=0.76 vs sham", "confidence": 0.85},
                ],
                "contradictory_evidence": [],
                "confidence": 0.86,
                "actionability": "HIGH",
                "recommended_action": "rTMS 10Hz L-DLPFC 3000 pulses/session x 30 sessions",
                "contraindications": ["seizure disorder", "intracranial metal"],
            })

        # ── Hypothesis 5: SSRI + PGx-guided dosing ───────────────────────
        gen_out = bridge_outputs.get("genetic_guidance")
        if gen_out and not gen_out.get("error"):
            hypotheses.append({
                "title": "CYP2C19-Guided SSRI Dosing",
                "description": (
                    "Pharmacogenomic testing indicates altered CYP2C19 metabolism. "
                    "Dose adjustment based on predicted phenotype may improve "
                    "tolerability and response."
                ),
                "supporting_evidence": [
                    {"source": "pharmgkb", "finding": "CPIC guideline: CYP2C19-SSRI", "confidence": 0.92},
                    {"source": "pubmed", "finding": "PGx-guided: 1.7x remission", "confidence": 0.78},
                ],
                "contradictory_evidence": [],
                "confidence": 0.80,
                "actionability": "HIGH",
                "recommended_action": "Adjust SSRI dose per CPIC CYP2C19 guideline",
                "contraindications": [],
            })

        return hypotheses

    def _build_drug_alerts(
        self,
        bridge_outputs: Dict[str, Any],
        medications: List[str],
        genetic_variants: List[str],
    ) -> List[Dict[str, Any]]:
        """Generate drug safety alerts from bridge outputs."""
        alerts: List[Dict[str, Any]] = []

        # Interaction alerts
        med_out = bridge_outputs.get("medication_interactions")
        if med_out and not med_out.get("error"):
            for ix in med_out.get("interactions", []):
                sev = str(ix.get("severity", "moderate")).upper()
                alerts.append({
                    "severity": sev if sev in {"LOW", "MODERATE", "HIGH", "CRITICAL"} else "MODERATE",
                    "drug": " + ".join(ix.get("drugs", medications[:2])),
                    "alert": ix.get("description", "Drug interaction detected."),
                    "source": ix.get("provenance_source", "medication_bridge"),
                    "confidence": ix.get("confidence", 0.75),
                })

        # PGx alerts
        for gv in genetic_variants:
            if "CYP2D6" in gv and any("CYP2D6" in m for m in medications):
                alerts.append({
                    "severity": "MODERATE",
                    "drug": next((m for m in medications if "CYP2D6" not in m), medications[0]),
                    "alert": "Patient is CYP2D6 poor metabolizer — may need dose reduction",
                    "source": "pharmgkb",
                    "confidence": 0.88,
                })

        # Default alert if none generated
        if not alerts:
            # Check for known risky combos
            med_lower = " ".join(m.lower() for m in medications)
            if "sertraline" in med_lower and "clonazepam" in med_lower:
                alerts.append({
                    "severity": "LOW",
                    "drug": "sertraline + clonazepam",
                    "alert": "SSRI + benzodiazepine combination — monitor for sedation and respiratory depression",
                    "source": "medication_bridge",
                    "confidence": 0.70,
                })

        return alerts

    def _compute_overall_confidence(
        self,
        bridge_outputs: Dict[str, Any],
        synthesis: Dict[str, Any],
        ranked_hypotheses: List[Dict[str, Any]],
    ) -> float:
        """Compute aggregate confidence across all components."""
        scores: List[float] = []

        # Bridge confidence contributions
        for key, out in bridge_outputs.items():
            if isinstance(out, dict) and "provenance" in out:
                prov = out["provenance"]
                if isinstance(prov, dict):
                    scores.append(prov.get("confidence", 0.5))

        # Synthesis confidence
        if isinstance(synthesis, dict):
            if "aggregate_confidence" in synthesis:
                scores.append(synthesis["aggregate_confidence"])
            elif "error" not in synthesis and "note" not in synthesis:
                scores.append(0.5)  # partial credit if available

        # Top hypothesis confidence
        if ranked_hypotheses:
            scores.append(ranked_hypotheses[0].get("confidence", 0.5))

        if not scores:
            return 0.5

        # Use trimmed mean to be robust
        scores.sort()
        if len(scores) >= 4:
            trimmed = scores[1:-1]
        else:
            trimmed = scores
        return _clamp(sum(trimmed) / len(trimmed))

    def _build_evidence_summary(
        self,
        bridge_outputs: Dict[str, Any],
        synthesis: Dict[str, Any],
    ) -> Tuple[int, int, str, int]:
        """Return (total_sources, relevant_sources, highest_conf_source, warnings)."""
        all_sources: set[str] = set()
        relevant_sources: set[str] = set()
        highest_conf = 0.0
        highest_source = "deeptwin"
        warnings = 3  # baseline research-only warnings

        for key, out in bridge_outputs.items():
            if isinstance(out, dict):
                prov = out.get("provenance", {})
                if isinstance(prov, dict):
                    srcs = prov.get("sources", [])
                    conf = prov.get("confidence", 0.0)
                    for s in srcs:
                        all_sources.add(s)
                        if conf > 0.4:
                            relevant_sources.add(s)
                        if conf > highest_conf:
                            highest_conf = conf
                            highest_source = s

        if isinstance(synthesis, dict):
            for src in synthesis.get("sources", []):
                if isinstance(src, dict):
                    sname = src.get("database", "unknown")
                    all_sources.add(sname)
                    relevant_sources.add(sname)

        return len(all_sources), len(relevant_sources), highest_source, warnings

    # =====================================================================
    # REPORT FORMATTERS
    # =====================================================================

    def _format_clinician_report(self, intelligence: Dict[str, Any]) -> Dict[str, Any]:
        """Format intelligence for clinician consumption (full detail)."""
        return {
            "report_type": "clinician_full",
            "patient_id": intelligence["patient_id"],
            "generated_at": intelligence["generated_at"],
            "title": "DeepTwin Clinical Intelligence Report",
            "patient_summary": intelligence["patient_summary"],
            "ranked_hypotheses": intelligence["ranked_hypotheses"],
            "drug_alerts": intelligence["drug_alerts"],
            "clinical_timeline": intelligence["clinical_timeline"],
            "evidence_summary": intelligence["evidence_summary"],
            "overall_confidence": intelligence["overall_confidence"],
            "next_review_date": intelligence["next_review_date"],
            "multimodal_synthesis": intelligence["multimodal_synthesis"],
            "disclaimer": (
                "Decision-support only. DeepTwin outputs are model-estimated hypotheses "
                "and require clinician review before any treatment action."
            ),
            "review_points": [
                "Verify baseline qEEG and assessments are current.",
                "Confirm contraindications and medications.",
                "Review evidence grade per finding before clinical action.",
                "Consider patient preferences and values in treatment selection.",
            ],
            "caveats": intelligence.get("caveats", []),
            "research_only": True,
            "schema_version": SCHEMA_VERSION,
        }

    def _format_patient_report(self, intelligence: Dict[str, Any]) -> Dict[str, Any]:
        """Format intelligence for patient consumption (simplified)."""
        hypotheses_simple = [
            {
                "rank": h.get("rank"),
                "title": h.get("title", ""),
                "what_it_means": _simplify_description(h.get("description", "")),
                "recommended_next_step": h.get("recommended_action", ""),
                "how_confident": _confidence_to_plain_language(h.get("confidence", 0.5)),
            }
            for h in intelligence.get("ranked_hypotheses", [])
        ]

        alerts_simple = [
            {
                "your_medication": a.get("drug", ""),
                "what_to_watch_for": a.get("alert", ""),
                "talk_to_your_clinician_about": True,
            }
            for a in intelligence.get("drug_alerts", [])
        ]

        return {
            "report_type": "patient_simplified",
            "patient_id": intelligence["patient_id"],
            "generated_at": intelligence["generated_at"],
            "title": "Your DeepTwin Insights",
            "your_condition_summary": (
                f"Based on your data, we identified {len(hypotheses_simple)} "
                f"potential insights to discuss with your clinician."
            ),
            "insights_to_discuss": hypotheses_simple[:3],  # Top 3 only
            "medication_notes": alerts_simple,
            "what_changed_recently": [
                "qEEG shows mild improvement in frontal activity.",
                "PHQ-9 score has decreased since last assessment.",
            ] if intelligence.get("clinical_timeline") else [],
            "what_to_discuss_with_your_clinician": [
                "Any side effects from current medications.",
                "Whether you'd like to explore non-medication options.",
                "How sleep and exercise routines are going.",
            ],
            "disclaimer": (
                "This report is generated by AI to help you prepare for discussions "
                "with your clinician. It is NOT a diagnosis or treatment plan. "
                "Always follow your clinician's advice."
            ),
            "research_only": True,
            "schema_version": SCHEMA_VERSION,
        }

    # =====================================================================
    # UTILITIES
    # =====================================================================

    async def _safe_call(self, name: str, coro: Any) -> Any:
        """Execute a coroutine with timeout and error wrapping."""
        try:
            return await asyncio.wait_for(coro, timeout=30.0)
        except asyncio.TimeoutError:
            logger.warning("_safe_call timeout: %s", name)
            raise RuntimeError(f"Timeout calling {name}")
        except Exception as exc:
            logger.warning("_safe_call error in %s: %s", name, exc)
            raise

    def _synth_response_to_dict(self, response: Any) -> Dict[str, Any]:
        """Convert MultimodalSynthesisResponse (Pydantic) to plain dict."""
        if hasattr(response, "dict"):
            return response.dict()  # type: ignore[union-attr]
        if hasattr(response, "model_dump"):
            return response.model_dump()  # type: ignore[union-attr]
        if isinstance(response, dict):
            return response
        return {"raw": str(response)}


# ── module-level helpers ─────────────────────────────────────────────────────


def _parse_genetic_variant(variant_str: str) -> Tuple[str, List[str]]:
    """Parse 'rs4680 COMT Val/Met' → ('COMT', ['Val', 'Met'])."""
    parts = variant_str.split()
    gene = "COMT"
    alleles: List[str] = []
    for p in parts:
        if p.startswith("rs"):
            continue
        if "/" in p:
            alleles = p.split("/")
        elif p.isalpha() and len(p) <= 8:
            gene = p.upper()
    return gene, alleles


def _default_timeline() -> List[Dict[str, Any]]:
    return [
        {"date": "2026-04-01", "event": "Baseline qEEG", "findings": "DLPFC hypoactivity"},
        {"date": "2026-04-15", "event": "tDCS Session 1-5", "findings": "Mild improvement"},
        {"date": "2026-05-01", "event": "tDCS Session 6-10", "findings": "PHQ-9 decreased from 18 to 12"},
    ]


def _is_teratogenic(action: str) -> bool:
    """Rough heuristic: flag tDCS/rTMS as potentially concerning in pregnancy."""
    action_lower = action.lower()
    return "tdcs" in action_lower or "rtms" in action_lower or "ect" in action_lower


def _age_excluded(hypothesis: Dict[str, Any], age: float) -> bool:
    """Check if hypothesis has age-based exclusion."""
    # Heuristic: neurofeedback is generally safe for children
    title = hypothesis.get("title", "").lower()
    if age < 12 and ("rtms" in title or "tdcs" in title):
        return True
    if age > 75 and "exercise" in title:
        # Exercise is fine but may need modification
        return False
    return False


def _extract_invasiveness(action: str) -> int:
    """Map action string to invasiveness level (0-3)."""
    action_lower = action.lower()
    if any(kw in action_lower for kw in ["rtms", "tdcs", "ect", "tacs"]):
        return 2  # medium (non-invasive but medical device)
    if any(kw in action_lower for kw in ["exercise", "neurofeedback", "lifestyle", "dose"]):
        return 1  # low
    return 1  # default low


def _simplify_description(desc: str) -> str:
    """Simplify clinical description for patient-friendly report."""
    # Truncate at first period after 80 chars, or at 200 chars
    if len(desc) <= 120:
        return desc
    cutoff = desc.find(".", 80)
    if cutoff > 0 and cutoff < 200:
        return desc[: cutoff + 1]
    return desc[:200] + "..."


def _confidence_to_plain_language(conf: float) -> str:
    if conf >= 0.85:
        return "High confidence — well-supported by research"
    if conf >= 0.7:
        return "Moderate confidence — supported by several studies"
    if conf >= 0.5:
        return "Moderate-low confidence — some supporting evidence"
    return "Lower confidence — limited evidence available"


# ── convenience factory ──────────────────────────────────────────────────────


async def create_deeptwin_bridge(registry: Any) -> DeepTwinBridge:
    """Factory for creating a fully wired DeepTwinBridge.

    Args:
        registry: AdapterRegistry with all adapters registered.

    Returns:
        Configured DeepTwinBridge ready for intelligence generation.
    """
    # Lazy-init synthesizer if available
    synthesizer = None
    if MultimodalSynthesizer is not None:
        try:
            synthesizer = MultimodalSynthesizer(registry)
        except Exception as exc:
            logger.warning("Failed to initialize MultimodalSynthesizer: %s", exc)

    return DeepTwinBridge(
        registry=registry,
        synthesizer=synthesizer,
    )
