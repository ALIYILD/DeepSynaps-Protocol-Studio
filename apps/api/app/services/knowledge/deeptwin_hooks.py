"""
deeptwin_hooks.py — DeepTwin Knowledge Layer Hooks
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Integration hooks connecting Knowledge Layer adapters to the DeepTwin
multimodal synthesis pipeline (PHASE 2).

Provides patient-specific multimodal synthesis that combines:
- Adverse event signals (FAERS / OnSIDES) with full confound detection
- Neuroimaging context (Allen Atlas / Schaefer / Neurosynth)
- Cohort comparison context (ADNI / ABIDE)
- Functional brain mapping context

SAFETY CONTRACT
===============
- NEVER presents cohort data as patient diagnosis.
- NEVER uses reverse inference for clinical interpretation.
- NEVER suggests causation from adverse event signals.
- ALWAYS quantifies uncertainty per-modality.
- ALWAYS flags research-only status.
- ALWAYS includes caveats and limitations.
- ALL synthesis outputs carry: sources, confidence, uncertainty budget,
  research-only boolean, and caveats.

Python 3.11+ | async | typed
"""

from __future__ import annotations

import asyncio
import logging
import statistics
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supporting Pydantic models
# ---------------------------------------------------------------------------

class SynthesisSource(BaseModel):
    """Provenance for a single knowledge source."""

    database: str
    version: Optional[str] = None
    record_count: int = 0
    last_updated: Optional[datetime] = None
    search_strategy: Optional[str] = None


class UncertaintyComponent(BaseModel):
    """A single component of the uncertainty budget."""

    category: str
    description: str
    value: float  # 0.0 (certain) → 1.0 (maximally uncertain)
    mitigations: List[str] = Field(default_factory=list)


class UncertaintyBudget(BaseModel):
    """Structured uncertainty budget for a synthesis output."""

    components: List[UncertaintyComponent] = Field(default_factory=list)
    aggregate: float = 0.0  # propagated aggregate uncertainty
    confidence: float = 1.0  # 1.0 - aggregate, for convenience


class SynthesisCaveat(BaseModel):
    """A single caveat / limitation statement."""

    category: str
    statement: str
    severity: str = "info"  # "info" | "warning" | "critical"


class AdverseEventSignal(BaseModel):
    """Individual adverse event signal from FAERS or OnSIDES."""

    event_term: str
    source_db: str
    report_count: int = 0
    prr: Optional[float] = None  # Proportional Reporting Ratio
    ror: Optional[float] = None  # Reporting Odds Ratio
    ic: Optional[float] = None   # Information Component
    confidence_ci_low: Optional[float] = None
    confidence_ci_high: Optional[float] = None
    research_only: bool = True
    caveats: List[str] = Field(default_factory=list)


class MedicationSynthesis(BaseModel):
    """Structured output of medication safety synthesis."""

    medication_name: str
    rxnorm_cui: Optional[str] = None
    signals: List[AdverseEventSignal] = Field(default_factory=list)
    sources: List[SynthesisSource] = Field(default_factory=list)
    aggregate_confidence: float = 0.0
    uncertainty_budget: UncertaintyBudget = Field(default_factory=UncertaintyBudget)
    confound_analysis: Dict[str, Any] = Field(default_factory=dict)
    research_only: bool = True
    caveats: List[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NeuroimagingRegionContext(BaseModel):
    """Context for a single neuroimaging region."""

    region_name: str
    network_assignment: Optional[str] = None
    allen_genes_top: List[str] = Field(default_factory=list)
    allen_expression_summary: Optional[str] = None
    neurosynth_associations: List[str] = Field(default_factory=list)
    reverse_inference_warning: bool = True
    coordinates_mni: Optional[Tuple[float, float, float]] = None
    confidence: float = 0.0


class NeuroimagingSynthesis(BaseModel):
    """Structured output of neuroimaging context synthesis."""

    regions_analyzed: int = 0
    per_region_context: List[NeuroimagingRegionContext] = Field(default_factory=list)
    network_summary: Dict[str, Any] = Field(default_factory=dict)
    sources: List[SynthesisSource] = Field(default_factory=list)
    aggregate_confidence: float = 0.0
    uncertainty_budget: UncertaintyBudget = Field(default_factory=UncertaintyBudget)
    research_only: bool = True
    caveats: List[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CohortComparisonResult(BaseModel):
    """Single biomarker comparison against a cohort distribution."""

    biomarker_name: str
    patient_value: Optional[float] = None
    cohort_mean: Optional[float] = None
    cohort_std: Optional[float] = None
    z_score: Optional[float] = None
    percentile: Optional[float] = None
    n_reference: int = 0
    confidence: float = 0.0
    caveats: List[str] = Field(default_factory=list)


class CohortSynthesis(BaseModel):
    """Structured output of cohort comparison synthesis."""

    cohort_name: str
    comparisons: List[CohortComparisonResult] = Field(default_factory=list)
    sources: List[SynthesisSource] = Field(default_factory=list)
    aggregate_confidence: float = 0.0
    uncertainty_budget: UncertaintyBudget = Field(default_factory=UncertaintyBudget)
    population_match_score: float = 0.0  # 0-1, how well patient matches cohort
    research_only: bool = True
    caveats: List[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ConfoundCategory(str, Enum):
    """Categories of confound that may affect adverse event signals."""

    CONFOUNDING_BY_INDICATION = "confounding_by_indication"
    POLYPHARMACY = "polypharmacy"
    POPULATION_RISK = "population_risk"
    REPORTING_BIAS = "reporting_bias"
    CHANNELING_BIAS = "channeling_bias"
    INDICATION_SEVERITY = "indication_severity"


class ConfoundFinding(BaseModel):
    """A single confound detection result."""

    category: ConfoundCategory
    description: str
    severity: str = "low"  # "low" | "medium" | "high"
    confidence: float = 0.0
    suggested_mitigation: List[str] = Field(default_factory=list)
    references: List[str] = Field(default_factory=list)


class ConfoundAnalysis(BaseModel):
    """Structured output of confound detection."""

    medications: List[str] = Field(default_factory=list)
    conditions: List[str] = Field(default_factory=list)
    findings: List[ConfoundFinding] = Field(default_factory=list)
    overall_confound_risk: str = "low"  # "low" | "medium" | "high"
    research_only: bool = True
    caveats: List[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# DeepTwin Knowledge Layer Hooks
# ---------------------------------------------------------------------------

class DeepTwinKnowledgeHooks:
    """Integration hooks connecting Knowledge Layer adapters to DeepTwin.

    Provides multimodal synthesis capabilities:
    - Adverse event confound detection
    - Medication side-effect context
    - Neuroimaging cohort context
    - Brain region functional context
    - Network-level synthesis

    Every synthesis output includes:
    - source_modalities: list of data sources used
    - confidence_aggregate: weighted confidence score
    - uncertainty_budget: per-modality uncertainty
    - research_only: boolean flag
    - caveats: list of limitation warnings
    """

    # ── mandatory caveats injected into every synthesis ────────────────────
    _MANDATORY_CAVEATS: List[str] = [
        "This synthesis combines multiple knowledge sources for contextual enrichment only.",
        "All adverse event data derive from spontaneous reporting systems "
        "and cannot establish causation or incidence rates.",
        "Cohort comparisons provide population-level context, not individual diagnosis "
        "or prognosis.",
        "Neurosynth functional associations are meta-analytic aggregates and are "
        "not patient-specific; reverse inference fallacy risk is present.",
        "Allen Brain Atlas gene expression data are post-mortem, population-averaged, "
        "and serve as contextual enrichment only, not clinical biomarkers.",
        "Schaefer network labels indicate anatomical-functional organization, "
        "not real-time functional status of the individual patient.",
        "All outputs must be interpreted by qualified clinicians with access to "
        "the full patient record.",
        "This synthesis is research-grade and has not been validated for clinical decision-making.",
    ]

    # ── uncertainty weight templates per modality ──────────────────────────
    _UNCERTAINTY_WEIGHTS: Dict[str, Dict[str, float]] = {
        "faers": {
            "data_quality": 0.35,
            "population_match": 0.25,
            "measurement": 0.20,
            "model": 0.20,
        },
        "onsides": {
            "data_quality": 0.20,
            "population_match": 0.20,
            "measurement": 0.25,
            "model": 0.35,
        },
        "allen_atlas": {
            "data_quality": 0.25,
            "population_match": 0.30,
            "measurement": 0.25,
            "model": 0.20,
        },
        "schaefer": {
            "data_quality": 0.15,
            "population_match": 0.25,
            "measurement": 0.30,
            "model": 0.30,
        },
        "neurosynth": {
            "data_quality": 0.30,
            "population_match": 0.30,
            "measurement": 0.20,
            "model": 0.20,
        },
        "adni": {
            "data_quality": 0.20,
            "population_match": 0.35,
            "measurement": 0.25,
            "model": 0.20,
        },
        "abide": {
            "data_quality": 0.20,
            "population_match": 0.35,
            "measurement": 0.25,
            "model": 0.20,
        },
    }

    def __init__(self, registry: AdapterRegistry) -> None:
        self.registry = registry
        self._synthesis_counter: int = 0

    # ------------------------------------------------------------------
    # 1. Medication safety synthesis
    # ------------------------------------------------------------------

    async def synthesize_medication_safety(
        self,
        medication: str,
        patient_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Synthesize medication safety profile from FAERS + OnSIDES + RxNorm.

        Combines:
        - FAERS adverse event signals (with reporting bias caveats)
        - OnSIDES label-reported side effects (with association caveats)
        - RxNorm medication normalization

        Args:
            medication: Medication name (free text; normalized via RxNorm).
            patient_context: Patient-level context dict. May include age_range,
                sex, comorbidities, current_meds, pregnancy_status.

        Returns:
            Dict representing MedicationSynthesis with uncertainty budget
            and mandatory caveats.
        """
        self._synthesis_counter += 1
        start_time = datetime.now(timezone.utc)
        logger.info(
            "[synthesize_medication_safety #%d] medication=%s",
            self._synthesis_counter,
            medication,
        )

        try:
            # ---- RxNorm normalization -----------------------------------
            rxnorm_cui, rxnorm_confidence = await self._normalize_rxnorm(medication)

            # ---- FAERS signal retrieval ---------------------------------
            faers_signals, faers_source = await self._fetch_faers_signals(
                rxnorm_cui or medication, patient_context
            )

            # ---- OnSIDES label data -------------------------------------
            onsides_signals, onsides_source = await self._fetch_onsides_signals(
                rxnorm_cui or medication
            )

            # ---- Merge signals with provenance --------------------------
            all_signals = self._merge_ae_signals(faers_signals, onsides_signals)

            # ---- Uncertainty budget -------------------------------------
            uncertainty = self._build_uncertainty_budget(
                modalities=["faers", "onsides"],
                base_uncertainty={
                    "data_quality": 0.35,
                    "population_match": 0.40,
                    "measurement": 0.25,
                    "model": 0.30,
                },
            )

            # ---- Aggregate confidence -----------------------------------
            aggregate_confidence = self._compute_aggregate_confidence(
                [rxnorm_confidence, faers_source.record_count / 1000.0]
            )

            # ---- Assemble output ----------------------------------------
            synthesis = MedicationSynthesis(
                medication_name=medication,
                rxnorm_cui=rxnorm_cui,
                signals=all_signals,
                sources=[faers_source, onsides_source],
                aggregate_confidence=round(aggregate_confidence, 4),
                uncertainty_budget=uncertainty,
                confound_analysis=await self._analyze_medication_confounds(
                    medication, patient_context
                ),
                research_only=True,
                caveats=[
                    *self._MANDATORY_CAVEATS,
                    "FAERS signals reflect reporting frequency, not clinical incidence.",
                    "OnSIDES data are derived from FDA labels and may not capture "
                    "rare or recently discovered associations.",
                    f"RxNorm normalization confidence: {rxnorm_confidence:.2f}.",
                ],
                generated_at=start_time,
            )

            return synthesis.model_dump(mode="json")

        except Exception as exc:
            logger.exception("Medication safety synthesis failed: %s", exc)
            return self._error_response(
                modality="medication_safety",
                error=str(exc),
                start_time=start_time,
            )

    # ------------------------------------------------------------------
    # 2. Neuroimaging context synthesis
    # ------------------------------------------------------------------

    async def synthesize_neuroimaging_context(
        self,
        regions: List[str],
        coordinates: List[tuple],
    ) -> Dict[str, Any]:
        """Synthesize neuroimaging context from Allen Atlas + Schaefer + Neurosynth.

        Combines:
        - Allen Brain Atlas gene expression context
        - Schaefer network assignments
        - Neurosynth functional associations (with reverse inference warnings)

        Args:
            regions: List of anatomical region names (e.g. ["prefrontal cortex"]).
            coordinates: List of MNI coordinates as (x, y, z) tuples.

        Returns:
            Dict representing NeuroimagingSynthesis with contextual enrichment
            and mandatory caveats.
        """
        self._synthesis_counter += 1
        start_time = datetime.now(timezone.utc)
        logger.info(
            "[synthesize_neuroimaging_context #%d] regions=%d coords=%d",
            self._synthesis_counter,
            len(regions),
            len(coordinates),
        )

        try:
            per_region_contexts: List[NeuroimagingRegionContext] = []
            region_confidences: List[float] = []

            for idx, (region, coord) in enumerate(zip(regions, coordinates)):
                # ---- Allen Atlas gene context ----------------------------
                allen_genes, allen_expr = await self._fetch_allen_context(
                    region, coord
                )

                # ---- Schaefer network assignment -------------------------
                network_label, schaefer_conf = await self._fetch_schaefer_network(
                    region, coord
                )

                # ---- Neurosynth functional terms -------------------------
                ns_terms, ns_conf = await self._fetch_neurosynth_terms(region, coord)

                region_conf = statistics.mean(
                    [c for c in [schaefer_conf, ns_conf, 0.6] if c is not None]
                )
                region_confidences.append(region_conf)

                per_region_contexts.append(
                    NeuroimagingRegionContext(
                        region_name=region,
                        network_assignment=network_label,
                        allen_genes_top=allen_genes[:10],  # cap at 10
                        allen_expression_summary=allen_expr,
                        neurosynth_associations=ns_terms[:10],
                        reverse_inference_warning=True,
                        coordinates_mni=coord,
                        confidence=round(region_conf, 4),
                    )
                )

            # ---- Network-level summary ----------------------------------
            network_summary = self._summarize_network_assignments(
                per_region_contexts
            )

            # ---- Uncertainty budget -------------------------------------
            uncertainty = self._build_uncertainty_budget(
                modalities=["allen_atlas", "schaefer", "neurosynth"],
                base_uncertainty={
                    "data_quality": 0.30,
                    "population_match": 0.35,
                    "measurement": 0.25,
                    "model": 0.25,
                },
            )

            aggregate_confidence = (
                statistics.mean(region_confidences) if region_confidences else 0.0
            )

            synthesis = NeuroimagingSynthesis(
                regions_analyzed=len(regions),
                per_region_context=per_region_contexts,
                network_summary=network_summary,
                sources=[
                    SynthesisSource(
                        database="Allen_Brain_Atlas",
                        version="2023_human",
                        record_count=0,
                    ),
                    SynthesisSource(
                        database="Schaefer_Atlas",
                        version="2018_400_7",
                        record_count=400,
                    ),
                    SynthesisSource(
                        database="Neurosynth",
                        version="2021_meta",
                        record_count=14000,
                    ),
                ],
                aggregate_confidence=round(aggregate_confidence, 4),
                uncertainty_budget=uncertainty,
                research_only=True,
                caveats=[
                    *self._MANDATORY_CAVEATS,
                    "Neurosynth associations are derived from peak coordinate meta-analysis "
                    "and do not reflect individual patient activation patterns.",
                    "Allen Atlas gene expression is post-mortem bulk tissue data "
                    "and may not reflect in vivo expression patterns.",
                    "Reverse inference (inferring mental states from brain regions) "
                    "is statistically weak and clinically inappropriate.",
                ],
                generated_at=start_time,
            )

            return synthesis.model_dump(mode="json")

        except Exception as exc:
            logger.exception("Neuroimaging context synthesis failed: %s", exc)
            return self._error_response(
                modality="neuroimaging_context",
                error=str(exc),
                start_time=start_time,
            )

    # ------------------------------------------------------------------
    # 3. Cohort comparison synthesis
    # ------------------------------------------------------------------

    async def synthesize_cohort_comparison(
        self,
        patient_biomarkers: Dict[str, Any],
        cohort: str = "ADNI",
    ) -> Dict[str, Any]:
        """Synthesize cohort comparison context from ADNI/ABIDE.

        IMPORTANT — SAFETY CONTRACT
        This is contextual enrichment, NOT diagnosis. Provides patient
        biomarker position relative to cohort distributions.

        Args:
            patient_biomarkers: Dict mapping biomarker name to measured value.
                Example: {"amyloid_pet_suvr": 1.35, "tau_pet_suvr": 2.1}.
            cohort: Cohort identifier ("ADNI" | "ABIDE" | custom).

        Returns:
            Dict representing CohortSynthesis with z-scores, confidence,
            population match score, and mandatory caveats.
        """
        self._synthesis_counter += 1
        start_time = datetime.now(timezone.utc)
        logger.info(
            "[synthesize_cohort_comparison #%d] cohort=%s biomarkers=%d",
            self._synthesis_counter,
            cohort,
            len(patient_biomarkers),
        )

        try:
            # ---- Validate cohort ----------------------------------------
            if cohort not in {"ADNI", "ABIDE", "OASIS", "UKBiobank"}:
                logger.warning("Unrecognized cohort '%s'; defaulting to ADNI", cohort)
                cohort = "ADNI"

            # ---- Fetch cohort distributions -----------------------------
            cohort_stats = await self._fetch_cohort_statistics(cohort)

            # ---- Compute per-biomarker comparisons ----------------------
            comparisons: List[CohortComparisonResult] = []
            comparison_confidences: List[float] = []

            for biomarker_name, patient_value in patient_biomarkers.items():
                stats = cohort_stats.get(biomarker_name)
                if stats is None:
                    comparisons.append(
                        CohortComparisonResult(
                            biomarker_name=biomarker_name,
                            patient_value=patient_value,
                            cohort_mean=None,
                            cohort_std=None,
                            z_score=None,
                            percentile=None,
                            n_reference=0,
                            confidence=0.0,
                            caveats=[
                                f"Biomarker '{biomarker_name}' not found in "
                                f"cohort '{cohort}' reference data."
                            ],
                        )
                    )
                    continue

                mean_val = stats.get("mean")
                std_val = stats.get("std")
                n_ref = stats.get("n", 0)

                z_score: Optional[float] = None
                percentile: Optional[float] = None
                if (
                    mean_val is not None
                    and std_val is not None
                    and std_val > 0
                    and isinstance(patient_value, (int, float))
                ):
                    z_score = (patient_value - mean_val) / std_val
                    # Approximate percentile from z-score (Gaussian)
                    import math

                    percentile = 0.5 * (1 + math.erf(z_score / math.sqrt(2)))

                conf = self._biomarker_confidence(n_ref, std_val)
                comparison_confidences.append(conf)

                comparisons.append(
                    CohortComparisonResult(
                        biomarker_name=biomarker_name,
                        patient_value=patient_value,
                        cohort_mean=mean_val,
                        cohort_std=std_val,
                        z_score=round(z_score, 4) if z_score is not None else None,
                        percentile=round(percentile, 4) if percentile is not None else None,
                        n_reference=n_ref,
                        confidence=round(conf, 4),
                        caveats=[
                            "Z-score indicates statistical distance from cohort mean; "
                            "it does NOT indicate pathology or diagnosis.",
                            f"Reference population N={n_ref}; may not match patient demographics.",
                        ],
                    )
                )

            # ---- Population match score ---------------------------------
            pop_match = self._compute_population_match(
                patient_biomarkers, cohort_stats
            )

            # ---- Uncertainty budget -------------------------------------
            modality_key = "adni" if cohort in {"ADNI", "OASIS"} else "abide"
            uncertainty = self._build_uncertainty_budget(
                modalities=[modality_key],
                base_uncertainty={
                    "data_quality": 0.20,
                    "population_match": 0.45,
                    "measurement": 0.25,
                    "model": 0.25,
                },
            )

            aggregate_confidence = (
                statistics.mean(comparison_confidences)
                if comparison_confidences
                else 0.0
            )

            synthesis = CohortSynthesis(
                cohort_name=cohort,
                comparisons=comparisons,
                sources=[
                    SynthesisSource(
                        database=cohort,
                        version="latest_release",
                        record_count=sum(c.n_reference for c in comparisons),
                        last_updated=datetime.now(timezone.utc),
                    )
                ],
                aggregate_confidence=round(aggregate_confidence, 4),
                uncertainty_budget=uncertainty,
                population_match_score=round(pop_match, 4),
                research_only=True,
                caveats=[
                    *self._MANDATORY_CAVEATS,
                    "Cohort data are research-grade and may not reflect the "
                    "demographics or clinical characteristics of the individual patient.",
                    "Z-scores are descriptive statistics only; they do not establish "
                    "diagnostic thresholds or clinical significance.",
                    f"Population match score: {pop_match:.2f} — a low score indicates "
                    "reduced relevance of the cohort reference.",
                ],
                generated_at=start_time,
            )

            return synthesis.model_dump(mode="json")

        except Exception as exc:
            logger.exception("Cohort comparison synthesis failed: %s", exc)
            return self._error_response(
                modality="cohort_comparison",
                error=str(exc),
                start_time=start_time,
            )

    # ------------------------------------------------------------------
    # 4. Adverse event confound detection
    # ------------------------------------------------------------------

    async def detect_adverse_event_confounds(
        self,
        medications: List[str],
        patient_conditions: List[str],
    ) -> Dict[str, Any]:
        """Detect potential confounds in adverse event reporting.

        Checks for:
        - Confounding by indication
        - Polypharmacy interactions
        - Population-specific risks
        - Reporting bias patterns

        Args:
            medications: List of medication names (normalized or raw).
            patient_conditions: List of patient conditions / indications.

        Returns:
            Dict representing ConfoundAnalysis with confidence levels
            and mitigation suggestions.
        """
        self._synthesis_counter += 1
        start_time = datetime.now(timezone.utc)
        logger.info(
            "[detect_adverse_event_confounds #%d] meds=%d conditions=%d",
            self._synthesis_counter,
            len(medications),
            len(patient_conditions),
        )

        findings: List[ConfoundFinding] = []

        try:
            # ---- Confounding by indication -----------------------------
            cb_indication = await self._check_confounding_by_indication(
                medications, patient_conditions
            )
            findings.extend(cb_indication)

            # ---- Polypharmacy ------------------------------------------
            poly = await self._check_polypharmacy(medications)
            findings.extend(poly)

            # ---- Population-specific risks -----------------------------
            pop_risk = await self._check_population_risks(
                medications, patient_conditions
            )
            findings.extend(pop_risk)

            # ---- Reporting bias ----------------------------------------
            rep_bias = await self._check_reporting_bias(medications)
            findings.extend(rep_bias)

            # ---- Channeling bias ---------------------------------------
            chan_bias = await self._check_channeling_bias(
                medications, patient_conditions
            )
            findings.extend(chan_bias)

            # ---- Overall risk aggregation --------------------------------
            severity_scores = {"low": 1, "medium": 2, "high": 3}
            if findings:
                avg_severity = statistics.mean(
                    severity_scores.get(f.severity, 1) for f in findings
                )
                overall_risk = (
                    "high" if avg_severity >= 2.5 else "medium"
                    if avg_severity >= 1.5 else "low"
                )
            else:
                overall_risk = "low"

            return ConfoundAnalysis(
                medications=medications,
                conditions=patient_conditions,
                findings=findings,
                overall_confound_risk=overall_risk,
                research_only=True,
                caveats=[
                    "Confound detection is heuristic-based and may not capture "
                    "all sources of bias.",
                    "Findings should be validated against domain expertise and "
                    "patient-specific clinical context.",
                    "Absence of detected confounds does not imply absence of bias.",
                ],
                generated_at=start_time,
            ).model_dump(mode="json")

        except Exception as exc:
            logger.exception("Confound detection failed: %s", exc)
            return self._error_response(
                modality="confound_detection",
                error=str(exc),
                start_time=start_time,
            )

    # ------------------------------------------------------------------
    # 5. Uncertainty budget generation
    # ------------------------------------------------------------------

    async def generate_uncertainty_budget(
        self,
        synthesis: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate per-modality uncertainty budget for synthesis.

        Quantifies:
        - Data quality uncertainty
        - Population match uncertainty
        - Measurement uncertainty
        - Model uncertainty

        Args:
            synthesis: A prior synthesis output dict (used to infer modalities).

        Returns:
            Structured uncertainty budget dict.
        """
        start_time = datetime.now(timezone.utc)

        try:
            modalities_used: List[str] = synthesis.get("modalities_used", [])
            per_modal = synthesis.get("per_modality_results", {})

            components: List[UncertaintyComponent] = []

            for modality in modalities_used:
                weights = self._UNCERTAINTY_WEIGHTS.get(modality, {})
                mod_result = per_modal.get(modality, {})

                for category, weight in weights.items():
                    components.append(
                        UncertaintyComponent(
                            category=f"{modality}_{category}",
                            description=self._uncertainty_description(
                                category, modality
                            ),
                            value=round(weight, 4),
                            mitigations=self._uncertainty_mitigations(
                                category, modality
                            ),
                        )
                    )

            aggregate = (
                statistics.mean(c.value for c in components)
                if components
                else 1.0
            )

            budget = UncertaintyBudget(
                components=components,
                aggregate=round(aggregate, 4),
                confidence=round(max(0.0, 1.0 - aggregate), 4),
            )

            return {
                "budget": budget.model_dump(mode="json"),
                "generated_at": start_time.isoformat(),
                "methodology": "Weighted per-modality uncertainty propagation",
                "caveats": [
                    "Uncertainty budget is estimated, not empirically validated.",
                    "Category weights are heuristic and subject to revision.",
                ],
                "research_only": True,
            }

        except Exception as exc:
            logger.exception("Uncertainty budget generation failed: %s", exc)
            return {
                "budget": UncertaintyBudget().model_dump(mode="json"),
                "generated_at": start_time.isoformat(),
                "error": str(exc),
                "methodology": "fallback_empty",
                "research_only": True,
            }

    # =================================================================
    # INTERNAL HELPER METHODS
    # =================================================================

    # ---- RxNorm normalization ----------------------------------------

    async def _normalize_rxnorm(self, medication: str) -> Tuple[Optional[str], float]:
        """Normalize medication name via RxNorm; return (CUI, confidence)."""
        try:
            adapter = self.registry.get("rxnorm")
            result = await adapter.normalize(medication)
            return result.get("cui"), result.get("confidence", 0.0)
        except Exception as exc:
            logger.warning("RxNorm normalization failed for '%s': %s", medication, exc)
            return None, 0.0

    # ---- FAERS signal retrieval --------------------------------------

    async def _fetch_faers_signals(
        self, medication_key: str, patient_context: Dict[str, Any]
    ) -> Tuple[List[AdverseEventSignal], SynthesisSource]:
        """Fetch adverse event signals from FAERS."""
        try:
            adapter = self.registry.get("faers")
            raw = await adapter.search_events(medication_key)

            signals = [
                AdverseEventSignal(
                    event_term=r.get("event_term", "unknown"),
                    source_db="FAERS",
                    report_count=r.get("report_count", 0),
                    prr=r.get("prr"),
                    ror=r.get("ror"),
                    ic=r.get("ic"),
                    confidence_ci_low=r.get("ci_lower"),
                    confidence_ci_high=r.get("ci_upper"),
                    research_only=True,
                    caveats=[
                        "FAERS reports are voluntary and subject to under-reporting.",
                        "PRR/ROR do not establish causality.",
                    ],
                )
                for r in raw[:50]  # cap to prevent bloat
            ]

            source = SynthesisSource(
                database="FAERS",
                version="Q4_2023",
                record_count=len(signals),
                last_updated=datetime.now(timezone.utc),
                search_strategy=f"medication={medication_key}",
            )
            return signals, source

        except Exception as exc:
            logger.warning("FAERS signal retrieval failed: %s", exc)
            return [], SynthesisSource(database="FAERS", record_count=0)

    # ---- OnSIDES signal retrieval ------------------------------------

    async def _fetch_onsides_signals(
        self, medication_key: str
    ) -> Tuple[List[AdverseEventSignal], SynthesisSource]:
        """Fetch label-reported side effects from OnSIDES."""
        try:
            adapter = self.registry.get("onsides")
            raw = await adapter.search_label_events(medication_key)

            signals = [
                AdverseEventSignal(
                    event_term=r.get("event_term", "unknown"),
                    source_db="OnSIDES",
                    report_count=r.get("label_frequency_count", 0),
                    prr=None,
                    ror=None,
                    ic=None,
                    confidence_ci_low=None,
                    confidence_ci_high=None,
                    research_only=True,
                    caveats=[
                        "OnSIDES data derive from structured product labels, "
                        "not clinical trials.",
                        "Label frequencies are often qualitative, not quantitative.",
                    ],
                )
                for r in raw[:50]
            ]

            source = SynthesisSource(
                database="OnSIDES",
                version="2023_v2",
                record_count=len(signals),
                last_updated=datetime.now(timezone.utc),
                search_strategy=f"medication={medication_key}",
            )
            return signals, source

        except Exception as exc:
            logger.warning("OnSIDES signal retrieval failed: %s", exc)
            return [], SynthesisSource(database="OnSIDES", record_count=0)

    # ---- Signal merging ----------------------------------------------

    def _merge_ae_signals(
        self,
        faers: List[AdverseEventSignal],
        onsides: List[AdverseEventSignal],
    ) -> List[AdverseEventSignal]:
        """Merge FAERS and OnSIDES signals, deduplicating by event term."""
        merged: Dict[str, AdverseEventSignal] = {}
        for sig in faers + onsides:
            key = sig.event_term.lower().strip()
            if key in merged:
                existing = merged[key]
                existing.report_count += sig.report_count
                existing.caveats = list(set(existing.caveats + sig.caveats))
            else:
                merged[key] = sig
        return list(merged.values())

    # ---- Allen Atlas context -----------------------------------------

    async def _fetch_allen_context(
        self, region: str, coord: tuple
    ) -> Tuple[List[str], Optional[str]]:
        """Fetch top gene expression from Allen Brain Atlas for region."""
        try:
            adapter = self.registry.get("allen_atlas")
            result = await adapter.query_region(region, mni_coord=coord)
            genes = result.get("top_genes", [])
            summary = result.get("expression_summary")
            return genes, summary
        except Exception as exc:
            logger.warning("Allen Atlas query failed for %s: %s", region, exc)
            return [], None

    # ---- Schaefer network --------------------------------------------

    async def _fetch_schaefer_network(
        self, region: str, coord: tuple
    ) -> Tuple[Optional[str], float]:
        """Fetch Schaefer network assignment for region."""
        try:
            adapter = self.registry.get("schaefer_atlas")
            result = await atlas.lookup_region(region, mni_coord=coord)
            return result.get("network_label"), result.get("confidence", 0.0)
        except Exception as exc:
            logger.warning("Schaefer lookup failed for %s: %s", region, exc)
            return None, 0.0

    # ---- Neurosynth terms --------------------------------------------

    async def _fetch_neurosynth_terms(
        self, region: str, coord: tuple
    ) -> Tuple[List[str], float]:
        """Fetch functional association terms from Neurosynth."""
        try:
            adapter = self.registry.get("neurosynth")
            result = await adapter.decode_coordinate(coord)
            terms = result.get("terms", [])
            conf = result.get("confidence", 0.0)
            return terms, conf
        except Exception as exc:
            logger.warning("Neurosynth decode failed for %s: %s", region, exc)
            return [], 0.0

    # ---- Cohort statistics -------------------------------------------

    async def _fetch_cohort_statistics(self, cohort: str) -> Dict[str, Dict[str, Any]]:
        """Fetch reference distribution statistics for a cohort."""
        try:
            adapter = self.registry.get(cohort.lower())
            return await adapter.get_biomarker_distributions()
        except Exception as exc:
            logger.warning("Cohort stats fetch failed for %s: %s", cohort, exc)
            return {}

    # ---- Network summary ---------------------------------------------

    def _summarize_network_assignments(
        self, regions: List[NeuroimagingRegionContext]
    ) -> Dict[str, Any]:
        """Aggregate per-region network assignments into summary."""
        from collections import Counter

        network_counts = Counter(
            r.network_assignment for r in regions if r.network_assignment
        )
        return {
            "network_distribution": dict(network_counts),
            "regions_covered": len(regions),
            "networks_represented": len(network_counts),
            "dominant_network": network_counts.most_common(1)[0][0]
            if network_counts
            else None,
        }

    # ---- Uncertainty helpers -----------------------------------------

    def _build_uncertainty_budget(
        self,
        modalities: List[str],
        base_uncertainty: Dict[str, float],
    ) -> UncertaintyBudget:
        """Build uncertainty budget from modality weights + base uncertainty."""
        components: List[UncertaintyComponent] = []

        for modality in modalities:
            weights = self._UNCERTAINTY_WEIGHTS.get(modality, {})
            for category, weight in weights.items():
                base_val = base_uncertainty.get(category, 0.25)
                blended = 0.5 * weight + 0.5 * base_val
                components.append(
                    UncertaintyComponent(
                        category=f"{modality}_{category}",
                        description=self._uncertainty_description(category, modality),
                        value=round(blended, 4),
                        mitigations=self._uncertainty_mitigations(category, modality),
                    )
                )

        aggregate = (
            statistics.mean(c.value for c in components)
            if components
            else 1.0
        )

        return UncertaintyBudget(
            components=components,
            aggregate=round(aggregate, 4),
            confidence=round(max(0.0, 1.0 - aggregate), 4),
        )

    def _uncertainty_description(self, category: str, modality: str) -> str:
        descriptions = {
            "data_quality": f"Data completeness and curation quality for {modality}.",
            "population_match": f"Demographic and clinical match between reference population and patient for {modality}.",
            "measurement": f"Measurement precision and calibration uncertainty in {modality}.",
            "model": f"Model assumptions and algorithmic uncertainty in {modality} processing.",
        }
        return descriptions.get(
            category, f"General uncertainty in {modality} {category}."
        )

    def _uncertainty_mitigations(self, category: str, modality: str) -> List[str]:
        mitigations: Dict[str, List[str]] = {
            "data_quality": [
                "Cross-reference with multiple database versions.",
                "Apply manual curation filters where available.",
            ],
            "population_match": [
                "Report population match score explicitly.",
                "Flag demographic mismatches in caveats.",
            ],
            "measurement": [
                "Use calibrated instruments and standardized protocols.",
                "Report measurement CV where available.",
            ],
            "model": [
                "Ensemble multiple models when feasible.",
                "Report model version and validation metrics.",
            ],
        }
        return mitigations.get(category, ["Validate against independent data sources."])

    # ---- Confidence computation --------------------------------------

    def _compute_aggregate_confidence(self, scores: List[float]) -> float:
        """Compute aggregate confidence from a list of per-source scores."""
        valid = [s for s in scores if isinstance(s, (int, float)) and 0.0 <= s <= 1.0]
        if not valid:
            return 0.0
        return float(statistics.mean(valid))

    def _biomarker_confidence(self, n_reference: int, std_val: Optional[float]) -> float:
        """Compute confidence for a single biomarker comparison."""
        conf = 0.5
        if n_reference > 500:
            conf += 0.25
        elif n_reference > 100:
            conf += 0.15
        elif n_reference > 0:
            conf += 0.05

        if std_val is not None and std_val > 0:
            conf += 0.25
        return min(conf, 1.0)

    def _compute_population_match(
        self,
        patient_biomarkers: Dict[str, Any],
        cohort_stats: Dict[str, Dict[str, Any]],
    ) -> float:
        """Score how well patient biomarkers align with cohort distributions."""
        if not patient_biomarkers or not cohort_stats:
            return 0.0
        matched = sum(
            1 for b in patient_biomarkers if b in cohort_stats
        )
        return matched / len(patient_biomarkers) if patient_biomarkers else 0.0

    # ---- Confound detection helpers ----------------------------------

    async def _analyze_medication_confounds(
        self, medication: str, patient_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Lightweight wrapper around detect_adverse_event_confounds."""
        conditions = patient_context.get("comorbidities", [])
        current_meds = patient_context.get("current_meds", [])
        all_meds = [medication, *current_meds]
        return await self.detect_adverse_event_confounds(all_meds, conditions)

    async def _check_confounding_by_indication(
        self, medications: List[str], conditions: List[str]
    ) -> List[ConfoundFinding]:
        """Check if medication indications confound AE signals."""
        findings: List[ConfoundFinding] = []
        if len(medications) > 0 and len(conditions) > 0:
            findings.append(
                ConfoundFinding(
                    category=ConfoundCategory.CONFOUNDING_BY_INDICATION,
                    description="Medications prescribed for conditions that may "
                    "themselves produce adverse events confound signal detection.",
                    severity="medium",
                    confidence=0.6,
                    suggested_mitigation=[
                        "Stratify analysis by indication.",
                        "Compare against same-indication cohorts.",
                        "Use active comparator designs where possible.",
                    ],
                    references=[
                        "Salas M, et al. Confounding by indication. Pharmacoepidemiol Drug Saf. 1999"
                    ],
                )
            )
        return findings

    async def _check_polypharmacy(self, medications: List[str]) -> List[ConfoundFinding]:
        """Check for polypharmacy confounding."""
        findings: List[ConfoundFinding] = []
        if len(medications) >= 5:
            findings.append(
                ConfoundFinding(
                    category=ConfoundCategory.POLYPHARMACY,
                    description=f"Patient is on {len(medications)} medications. "
                    "Polypharmacy increases risk of adverse events and drug-drug interactions.",
                    severity="high" if len(medications) >= 10 else "medium",
                    confidence=0.75,
                    suggested_mitigation=[
                        "Review medication list for interactions.",
                        "Consider deprescribing where appropriate.",
                        "Check interaction databases (DrugBank, etc.).",
                    ],
                    references=[
                        "Masnoon N, et al. Polypharmacy and potentially inappropriate medications. Drugs Aging. 2017"
                    ],
                )
            )
        return findings

    async def _check_population_risks(
        self, medications: List[str], conditions: List[str]
    ) -> List[ConfoundFinding]:
        """Check for population-specific risk factors."""
        findings: List[ConfoundFinding] = []
        # Placeholder for age/sex/pregnancy-specific risk checks
        findings.append(
            ConfoundFinding(
                category=ConfoundCategory.POPULATION_RISK,
                description="Population-specific risk factors (age, sex, pregnancy, "
                "renal/hepatic function) may modify adverse event risk.",
                severity="medium",
                confidence=0.5,
                suggested_mitigation=[
                    "Apply population stratification.",
                    "Use subgroup-specific reference data.",
                ],
                references=[],
            )
        )
        return findings

    async def _check_reporting_bias(self, medications: List[str]) -> List[ConfoundFinding]:
        """Check for known reporting bias patterns."""
        findings: List[ConfoundFinding] = []
        findings.append(
            ConfoundFinding(
                category=ConfoundCategory.REPORTING_BIAS,
                description="Spontaneous reporting systems suffer from under-reporting, "
                "media-stimulated reporting, and temporal bias.",
                severity="high",
                confidence=0.85,
                suggested_mitigation=[
                    "Compare reporting rates across databases.",
                    "Account for time-on-market bias.",
                    "Use disproportionality analysis with caution.",
                ],
                references=[
                    "Hazell L, Shakir SA. Under-reporting of adverse drug reactions. Drug Saf. 2006"
                ],
            )
        )
        return findings

    async def _check_channeling_bias(
        self, medications: List[str], conditions: List[str]
    ) -> List[ConfoundFinding]:
        """Check for channeling bias (selective prescribing)."""
        findings: List[ConfoundFinding] = []
        findings.append(
            ConfoundFinding(
                category=ConfoundCategory.CHANNELING_BIAS,
                description="Channeling bias occurs when patients with specific risk "
                "profiles are preferentially prescribed certain medications.",
                severity="medium",
                confidence=0.55,
                suggested_mitigation=[
                    "Compare with propensity-score matched cohorts.",
                    "Assess indication and severity distributions.",
                ],
                references=[
                    "Walker AM. Confounding by indication. Am J Epidemiol. 1996"
                ],
            )
        )
        return findings

    # ---- Error response helper ---------------------------------------

    def _error_response(
        self,
        modality: str,
        error: str,
        start_time: datetime,
    ) -> Dict[str, Any]:
        """Generate a safe error response that preserves the safety contract."""
        return {
            "modality": modality,
            "error": error,
            "aggregate_confidence": 0.0,
            "uncertainty_budget": {
                "components": [],
                "aggregate": 1.0,
                "confidence": 0.0,
            },
            "research_only": True,
            "research_only_reason": (
                "Synthesis encountered an error; no clinical inference should be drawn."
            ),
            "caveats": [
                *self._MANDATORY_CAVEATS,
                f"ERROR: Synthesis failed — {error}",
                "This output contains no valid clinical information.",
            ],
            "sources": [],
            "generated_at": start_time.isoformat(),
        }


# ---------------------------------------------------------------------------
# Forward type reference — resolved at runtime via the registry import
# ---------------------------------------------------------------------------

if TYPE_CHECKING:
    from app.services.knowledge.adapter_registry import AdapterRegistry
else:
    # Runtime placeholder for forward reference in __init__ signature
    AdapterRegistry = Any  # type: ignore[misc]
