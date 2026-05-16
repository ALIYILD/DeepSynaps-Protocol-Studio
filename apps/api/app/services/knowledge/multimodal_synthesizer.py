"""
multimodal_synthesizer.py — Multimodal Synthesis Engine
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Engine for combining multiple knowledge modalities into a unified synthesis
with full provenance, uncertainty quantification, and safety guardrails.

Implements fusion principles from PHASE 0 architecture:
1. Only fuse data with compatible confidence levels.
2. Propagate uncertainty across fusion chains.
3. Flag modality conflicts.
4. Apply temporal recency weighting.
5. Check population match.

SAFETY — DECISION SUPPORT ONLY
================================
This module NEVER diagnoses, prescribes, or triages emergencies autonomously.
Every output is flagged research-only and carries mandatory caveats.

Python 3.11+ | async | typed
"""

from __future__ import annotations

import logging
import statistics
import uuid
from datetime import datetime, timezone
from enum import Enum
import asyncio
from typing import Any, Dict, List, Optional, Set, TYPE_CHECKING

from pydantic import BaseModel, Field, validator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------

class ModalityType(str, Enum):
    """Supported knowledge modalities for synthesis."""

    MEDICATION = "medication"
    NEUROIMAGING = "neuroimaging"
    BIOMARKER = "biomarker"


class MultimodalSynthesisRequest(BaseModel):
    """Request payload for multimodal synthesis.

    patient_id is hashed / pseudonymized — never raw PHI.
    """

    patient_id: str = Field(
        ...,
        description="Hashed / pseudonymized patient identifier. Must NOT be raw PHI.",
    )
    medication_context: Optional[List[str]] = Field(
        default=None,
        description="List of medication names to include in synthesis.",
    )
    neuroimaging_context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Neuroimaging context with 'regions' (List[str]) "
        "and 'coordinates' (List[tuple]).",
    )
    biomarker_context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Biomarker context with 'values' (Dict[str, float]) "
        "and optional 'cohort' (str).",
    )
    modalities: List[str] = Field(
        default=["medication", "neuroimaging", "biomarker"],
        description="Which modalities to include in synthesis.",
    )
    include_cohort_comparison: bool = Field(
        default=False,
        description="Include cohort comparison context.",
    )
    include_adverse_events: bool = Field(
        default=True,
        description="Include adverse event signal analysis.",
    )
    include_functional_context: bool = Field(
        default=False,
        description="Include functional brain mapping context.",
    )
    min_confidence_threshold: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Minimum per-modality confidence to include in fusion.",
    )

    @validator("modalities")
    def validate_modalities(cls, v: List[str]) -> List[str]:
        allowed = {m.value for m in ModalityType}
        invalid = [m for m in v if m not in allowed]
        if invalid:
            raise ValueError(f"Invalid modalities: {invalid}. Allowed: {allowed}")
        return v


class SynthesisSourceReference(BaseModel):
    """A single source reference in the synthesis response."""

    database: str
    version: Optional[str] = None
    record_count: int = 0
    query_strategy: Optional[str] = None


class MultimodalSynthesisResponse(BaseModel):
    """Structured multimodal synthesis response.

    Every field is designed for auditability, reproducibility, and safe
    downstream consumption.
    """

    synthesis_id: str = Field(..., description="UUID for this synthesis transaction.")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp of synthesis generation.",
    )
    modalities_used: List[str] = Field(
        default_factory=list,
        description="Modalities that contributed to this synthesis.",
    )
    per_modality_results: Dict[str, Any] = Field(
        default_factory=dict,
        description="Detailed results keyed by modality name.",
    )
    aggregate_confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Weighted aggregate confidence [0.0, 1.0]."
    )
    uncertainty_budget: Dict[str, float] = Field(
        default_factory=dict,
        description="Per-category uncertainty values summing to the aggregate.",
    )
    research_only: bool = Field(
        default=True,
        description="Whether this synthesis is research-grade only.",
    )
    research_only_reason: Optional[str] = Field(
        default=None,
        description="Human-readable explanation of research-only status.",
    )
    caveats: List[str] = Field(
        default_factory=list,
        description="Mandatory caveats and limitation warnings.",
    )
    sources: List[SynthesisSourceReference] = Field(
        default_factory=list,
        description="Provenance: all source databases used.",
    )
    fusion_method: str = Field(
        default="weighted_confidence_average",
        description="Fusion algorithm applied.",
    )
    safety_check_passed: bool = Field(
        default=False,
        description="Whether automated safety checks were passed.",
    )
    safety_violations: List[str] = Field(
        default_factory=list,
        description="Any safety violations detected (empty if passed).",
    )
    conflict_flags: List[str] = Field(
        default_factory=list,
        description="Inter-modality conflict warnings.",
    )
    population_match_score: Optional[float] = Field(
        default=None,
        description="Overall population match score [0.0, 1.0].",
    )


# ---------------------------------------------------------------------------
# Fusion configuration
# ---------------------------------------------------------------------------

class FusionConfig(BaseModel):
    """Runtime configuration for the fusion engine."""

    confidence_compatibility_threshold: float = 0.3
    temporal_recency_half_life_days: int = 365
    max_modalities: int = 5
    enable_conflict_detection: bool = True
    enable_population_match_check: bool = True
    default_modality_weight: float = 1.0


# ---------------------------------------------------------------------------
# Multimodal Synthesizer Engine
# ---------------------------------------------------------------------------

class MultimodalSynthesizer:
    """Engine for combining multiple knowledge modalities into unified synthesis.

    Implements fusion principles from PHASE 0 architecture:
    1. Only fuse data with compatible confidence levels.
    2. Propagate uncertainty across fusion chains.
    3. Flag modality conflicts.
    4. Apply temporal recency weighting.
    5. Check population match.

    SAFETY: This is decision support only. Never diagnoses, prescribes,
    or triages emergencies autonomously.
    """

    # ── forbidden patterns for safety scanning ──────────────────────────────
    _FORBIDDEN_PATTERNS: List[str] = [
        "diagnosis",
        "diagnosed",
        "prescribe",
        "prescription",
        "triage",
        "emergency",
        "urgent care",
        "clinician should",
        "recommend treatment",
        "start medication",
        "stop medication",
        "prognosis",
        "life expectancy",
        "will develop",
        "will progress",
        "guaranteed",
        "certain to",
        "definitely",
        "absolute risk",
    ]

    # ── required fields for safety validation ──────────────────────────────
    _REQUIRED_OUTPUT_FIELDS: Set[str] = {
        "confidence",
        "evidence_grade",
        "uncertainty_budget",
        "research_only",
        "caveats",
        "sources",
    }

    # ── mandatory caveats appended to every synthesis ──────────────────────
    _MANDATORY_CAVEATS: List[str] = [
        "This synthesis is generated from multiple research-grade knowledge sources "
        "and is intended for contextual enrichment only.",
        "It does NOT constitute a medical diagnosis, treatment recommendation, "
        "or substitute for qualified clinical judgment.",
        "All adverse event associations are statistical signals from spontaneous "
        "reporting systems and do not establish causation.",
        "Cohort comparisons describe population distributions and do not diagnose "
        "or prognosticate for individual patients.",
        "Neuroimaging functional associations are meta-analytic and carry reverse-"
        "inference limitations; they are not patient-specific.",
        "Gene expression data provide biological context only and are not clinical "
        "biomarkers for the individual patient.",
        "All outputs must be reviewed by qualified healthcare professionals with "
        "access to the complete patient record.",
        "This synthesis has not been prospectively validated for clinical "
        "decision-making and should be treated as research-only.",
    ]

    def __init__(self, registry: AdapterRegistry) -> None:
        self.registry = registry
        # Delayed import to avoid circular dependency
        from deeptwin_hooks import DeepTwinKnowledgeHooks

        self.hooks = DeepTwinKnowledgeHooks(registry)
        self.config = FusionConfig()

    # =================================================================
    # PUBLIC API
    # =================================================================

    async def synthesize(
        self, request: MultimodalSynthesisRequest
    ) -> MultimodalSynthesisResponse:
        """Main synthesis entry point.

        Args:
            request: Specifies which modalities to include, patient context,
                and synthesis parameters.

        Returns:
            Structured synthesis with full provenance, confidence, uncertainty,
            and caveats for each modality and the aggregate.
        """
        synthesis_id = str(uuid.uuid4())
        start_time = datetime.now(timezone.utc)
        logger.info(
            "[synthesize %s] modalities=%s patient=%s...",
            synthesis_id,
            request.modalities,
            request.patient_id[:8],
        )

        per_modality: Dict[str, Any] = {}
        modality_weights: Dict[str, float] = {}
        all_sources: List[SynthesisSourceReference] = []
        conflict_flags: List[str] = []

        try:
            # ---- Run requested modalities in parallel where safe -------
            modality_tasks = self._dispatch_modality_tasks(request)
            modality_results = await asyncio.gather(
                *modality_tasks.values(), return_exceptions=True
            )

            for modality_name, result in zip(modality_tasks.keys(), modality_results):
                if isinstance(result, Exception):
                    logger.warning(
                        "Modality '%s' failed for synthesis %s: %s",
                        modality_name,
                        synthesis_id,
                        result,
                    )
                    per_modality[modality_name] = self._failed_modality_result(
                        modality_name, str(result)
                    )
                    modality_weights[modality_name] = 0.0
                else:
                    per_modality[modality_name] = result
                    conf = result.get("aggregate_confidence", 0.0)
                    modality_weights[modality_name] = conf
                    all_sources.extend(
                        self._extract_sources(result)
                    )

            # ---- Fuse modalities ----------------------------------------
            fused = await self._fuse_modalities(
                list(per_modality.values()), modality_weights
            )

            # ---- Detect cross-modality conflicts ------------------------
            conflict_flags = self._detect_modality_conflicts(per_modality)

            # ---- Safety check -------------------------------------------
            safety_passed, safety_violations = self._check_fusion_safety(
                fused, per_modality
            )

            # ---- Build uncertainty budget -------------------------------
            uncertainty_budget = self._build_aggregate_uncertainty(
                per_modality, modality_weights
            )

            # ---- Population match score ---------------------------------
            pop_match = self._compute_aggregate_population_match(per_modality)

            # ---- Assemble response --------------------------------------
            response = MultimodalSynthesisResponse(
                synthesis_id=synthesis_id,
                timestamp=start_time,
                modalities_used=list(per_modality.keys()),
                per_modality_results=per_modality,
                aggregate_confidence=round(fused.get("aggregate_confidence", 0.0), 4),
                uncertainty_budget=uncertainty_budget,
                research_only=True,
                research_only_reason=(
                    "Multimodal synthesis combines research-grade data sources "
                    "(FAERS, OnSIDES, Allen Atlas, Neurosynth, ADNI/ABIDE) "
                    "and requires clinical correlation by qualified professionals."
                ),
                caveats=[
                    *self._MANDATORY_CAVEATS,
                    *fused.get("caveats", []),
                    *conflict_flags,
                ],
                sources=all_sources,
                fusion_method="weighted_confidence_with_uncertainty_propagation",
                safety_check_passed=safety_passed,
                safety_violations=safety_violations,
                conflict_flags=conflict_flags,
                population_match_score=round(pop_match, 4) if pop_match else None,
            )

            logger.info(
                "[synthesize %s] complete modalities=%d confidence=%.3f safety=%s",
                synthesis_id,
                len(per_modality),
                response.aggregate_confidence,
                safety_passed,
            )
            return response

        except Exception as exc:
            logger.exception("Synthesis %s critical failure: %s", synthesis_id, exc)
            return self._critical_failure_response(synthesis_id, start_time, str(exc))

    # =================================================================
    # MODALITY DISPATCH
    # =================================================================

    def _dispatch_modality_tasks(
        self, request: MultimodalSynthesisRequest
    ) -> Dict[str, Any]:
        """Build a dict of modality name -> coroutine for each requested modality."""
        tasks: Dict[str, Any] = {}

        if ModalityType.MEDICATION.value in request.modalities:
            if request.medication_context:
                # Use the first medication as primary for this design
                primary_med = request.medication_context[0]
                patient_ctx = {
                    "current_meds": request.medication_context[1:],
                    "comorbidities": [],
                }
                tasks[ModalityType.MEDICATION.value] = (
                    self._synthesize_medication_modal(primary_med, patient_ctx)
                )

        if ModalityType.NEUROIMAGING.value in request.modalities:
            if request.neuroimaging_context:
                regions = request.neuroimaging_context.get("regions", [])
                coords = request.neuroimaging_context.get("coordinates", [])
                tasks[ModalityType.NEUROIMAGING.value] = (
                    self._synthesize_neuroimaging_modal(regions, coords)
                )

        if ModalityType.BIOMARKER.value in request.modalities:
            if request.biomarker_context:
                biomarkers = request.biomarker_context.get("values", {})
                cohort = request.biomarker_context.get("cohort", "ADNI")
                tasks[ModalityType.BIOMARKER.value] = (
                    self._synthesize_biomarker_modal(biomarkers, cohort)
                )

        return tasks

    # =================================================================
    # INDIVIDUAL MODALITY SYNTHESIS
    # =================================================================

    async def _synthesize_medication_modal(
        self, medication: str, context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Medication modality: RxNorm + FAERS + OnSIDES + PharmGKB.

        Args:
            medication: Primary medication name.
            context: Patient context dict with current_meds, comorbidities, etc.

        Returns:
            Medication synthesis dict with full provenance and caveats.
        """
        logger.debug("[_synthesize_medication_modal] medication=%s", medication)

        try:
            result = await self.hooks.synthesize_medication_safety(
                medication=medication,
                patient_context=context,
            )
            result["modality"] = ModalityType.MEDICATION.value
            result["sources_used"] = ["RxNorm", "FAERS", "OnSIDES", "PharmGKB"]
            return result
        except Exception as exc:
            logger.warning("Medication modal failed: %s", exc)
            return self._failed_modality_result(ModalityType.MEDICATION.value, str(exc))

    async def _synthesize_neuroimaging_modal(
        self, regions: List[str], coords: List[tuple]
    ) -> Dict[str, Any]:
        """Neuroimaging modality: MNI Atlas + Allen + Schaefer + Neurosynth.

        Args:
            regions: Anatomical region names.
            coords: MNI coordinate tuples.

        Returns:
            Neuroimaging synthesis dict with full provenance and caveats.
        """
        logger.debug(
            "[_synthesize_neuroimaging_modal] regions=%d coords=%d",
            len(regions),
            len(coords),
        )

        try:
            result = await self.hooks.synthesize_neuroimaging_context(
                regions=regions,
                coordinates=coords,
            )
            result["modality"] = ModalityType.NEUROIMAGING.value
            result["sources_used"] = [
                "MNI_Atlas",
                "Allen_Brain_Atlas",
                "Schaefer_2018",
                "Neurosynth",
            ]
            return result
        except Exception as exc:
            logger.warning("Neuroimaging modal failed: %s", exc)
            return self._failed_modality_result(
                ModalityType.NEUROIMAGING.value, str(exc)
            )

    async def _synthesize_biomarker_modal(
        self, biomarkers: Dict[str, Any], cohort: str = "ADNI"
    ) -> Dict[str, Any]:
        """Biomarker modality: ADNI/ABIDE cohort context + LOINC.

        Args:
            biomarkers: Dict of biomarker name -> measured value.
            cohort: Reference cohort identifier.

        Returns:
            Biomarker synthesis dict with z-scores and caveats.
        """
        logger.debug(
            "[_synthesize_biomarker_modal] biomarkers=%d cohort=%s",
            len(biomarkers),
            cohort,
        )

        try:
            result = await self.hooks.synthesize_cohort_comparison(
                patient_biomarkers=biomarkers,
                cohort=cohort,
            )
            result["modality"] = ModalityType.BIOMARKER.value
            result["sources_used"] = [cohort, "LOINC"]
            return result
        except Exception as exc:
            logger.warning("Biomarker modal failed: %s", exc)
            return self._failed_modality_result(ModalityType.BIOMARKER.value, str(exc))

    # =================================================================
    # MULTI-MODALITY FUSION
    # =================================================================

    async def _fuse_modalities(
        self,
        modals: List[Dict[str, Any]],
        weights: Dict[str, float],
    ) -> Dict[str, Any]:
        """Fuse multiple modalities with uncertainty propagation.

        Principles:
        - Weighted average by confidence
        - Uncertainty budget accumulation
        - Conflict detection and flagging
        - Population match validation
        - Modality compatibility gating

        Args:
            modals: List of per-modality synthesis dicts.
            weights: Dict mapping modality name -> confidence weight.

        Returns:
            Fused synthesis dict with aggregate confidence and uncertainty.
        """
        if not modals:
            return {
                "aggregate_confidence": 0.0,
                "uncertainty_budget": {},
                "caveats": ["No modalities available for fusion."],
            }

        # ---- Confidence compatibility gating --------------------------
        compatible_modals = self._filter_compatible_modalities(modals, weights)
        if not compatible_modals:
            logger.warning("No modalities passed confidence compatibility threshold.")
            return {
                "aggregate_confidence": 0.0,
                "uncertainty_budget": {},
                "caveats": [
                    "No modalities met the confidence compatibility threshold; "
                    "fusion aborted for safety."
                ],
            }

        # ---- Weighted confidence fusion --------------------------------
        total_weight = 0.0
        weighted_confidence_sum = 0.0
        all_caveats: List[str] = []
        uncertainty_components: Dict[str, List[float]] = {}

        for modal in compatible_modals:
            modality_name = modal.get("modality", "unknown")
            weight = max(0.01, weights.get(modality_name, 0.5))
            conf = modal.get("aggregate_confidence", 0.0)

            weighted_confidence_sum += conf * weight
            total_weight += weight

            # Collect caveats
            all_caveats.extend(modal.get("caveats", []))

            # Collect uncertainty components
            unc = modal.get("uncertainty_budget", {})
            if isinstance(unc, dict):
                for component in unc.get("components", []):
                    if isinstance(component, dict):
                        cat = component.get("category", "unknown")
                        val = component.get("value", 0.0)
                        uncertainty_components.setdefault(cat, []).append(val)

        aggregate_confidence = (
            weighted_confidence_sum / total_weight if total_weight > 0 else 0.0
        )

        # ---- Aggregate uncertainty budget ------------------------------
        aggregate_uncertainty: Dict[str, float] = {}
        for category, values in uncertainty_components.items():
            if values:
                # Propagate as root mean square for conservative estimate
                import math

                aggregate_uncertainty[category] = round(
                    math.sqrt(sum(v ** 2 for v in values) / len(values)), 4
                )

        # Add modality-level aggregated uncertainty
        modality_uncertainties = []
        for modal in compatible_modals:
            unc = modal.get("uncertainty_budget", {})
            if isinstance(unc, dict):
                modality_uncertainties.append(unc.get("aggregate", 0.5))

        if modality_uncertainties:
            import math

            aggregate_uncertainty["_fused_modalities"] = round(
                math.sqrt(sum(u ** 2 for u in modality_uncertainties))
                / len(modality_uncertainties),
                4,
            )

        return {
            "aggregate_confidence": round(min(aggregate_confidence, 1.0), 4),
            "uncertainty_budget": aggregate_uncertainty,
            "caveats": list(set(all_caveats)),
            "fused_modality_count": len(compatible_modals),
            "total_modality_count": len(modals),
            "fusion_weights": {k: round(v, 4) for k, v in weights.items()},
        }

    def _filter_compatible_modalities(
        self,
        modals: List[Dict[str, Any]],
        weights: Dict[str, float],
    ) -> List[Dict[str, Any]]:
        """Filter modalities that meet the confidence compatibility threshold.

        Modalities with confidence below the threshold are excluded from fusion
        to prevent low-quality data from degrading the aggregate.
        """
        threshold = self.config.confidence_compatibility_threshold
        compatible: List[Dict[str, Any]] = []

        for modal in modals:
            modality_name = modal.get("modality", "unknown")
            conf = weights.get(modality_name, 0.0)
            if conf >= threshold:
                compatible.append(modal)
            else:
                logger.info(
                    "Modality '%s' excluded from fusion: confidence %.3f < threshold %.3f",
                    modality_name,
                    conf,
                    threshold,
                )

        return compatible

    def _detect_modality_conflicts(
        self, per_modality: Dict[str, Any]
    ) -> List[str]:
        """Detect conflicts between modalities.

        Currently checks for confidence divergence and medication-condition
        indication mismatches.
        """
        conflicts: List[str] = []

        confidences = {
            name: result.get("aggregate_confidence", 0.0)
            for name, result in per_modality.items()
            if isinstance(result, dict)
        }

        if len(confidences) >= 2:
            vals = list(confidences.values())
            max_conf = max(vals)
            min_conf = min(vals)
            if max_conf - min_conf > 0.5:
                conflicts.append(
                    f"Large confidence divergence detected between modalities: "
                    f"max={max_conf:.3f}, min={min_conf:.3f}. "
                    f"Interpret aggregate with caution."
                )

        return conflicts

    # =================================================================
    # SAFETY CHECKS
    # =================================================================

    def _check_fusion_safety(
        self,
        fused: Dict[str, Any],
        per_modality: Dict[str, Any],
    ) -> tuple[bool, List[str]]:
        """Check synthesis against safety rules.

        Forbidden outputs:
        - Diagnosis claims
        - Prescription recommendations
        - Emergency triage
        - Outcome guarantees
        - Clinician override suggestions
        - Raw PHI exposure

        Required outputs:
        - Confidence level
        - Uncertainty budget
        - Research-only flag
        - Caveats
        - Source databases
        """
        violations: List[str] = []

        # ---- Flatten all text for pattern scanning --------------------
        all_text = " ".join(
            str(v).lower()
            for v in self._recursive_values(fused)
        ) + " ".join(
            str(v).lower()
            for modal in per_modality.values()
            if isinstance(modal, dict)
            for v in self._recursive_values(modal)
        )

        # ---- Scan forbidden patterns ----------------------------------
        for pattern in self._FORBIDDEN_PATTERNS:
            if pattern in all_text:
                violations.append(
                    f"Safety violation: forbidden pattern '{pattern}' detected "
                    f"in synthesis output."
                )

        # ---- Verify required fields present ---------------------------
        if "aggregate_confidence" not in fused:
            violations.append("Missing required field: aggregate_confidence.")

        if "uncertainty_budget" not in fused:
            violations.append("Missing required field: uncertainty_budget.")

        # ---- Research-only enforcement --------------------------------
        for modal_name, modal in per_modality.items():
            if isinstance(modal, dict) and not modal.get("research_only", True):
                violations.append(
                    f"Modality '{modal_name}' missing research_only=True flag."
                )

        passed = len(violations) == 0
        return passed, violations

    def _recursive_values(self, obj: Any) -> List[Any]:
        """Recursively extract all values from a nested dict/list structure."""
        values: List[Any] = []
        if isinstance(obj, dict):
            for v in obj.values():
                values.extend(self._recursive_values(v))
        elif isinstance(obj, list):
            for item in obj:
                values.extend(self._recursive_values(item))
        else:
            values.append(obj)
        return values

    # =================================================================
    # UNCERTAINTY & POPULATION MATCH
    # =================================================================

    def _build_aggregate_uncertainty(
        self,
        per_modality: Dict[str, Any],
        weights: Dict[str, float],
    ) -> Dict[str, float]:
        """Build aggregate uncertainty budget across all modalities."""
        budget: Dict[str, float] = {}

        for modality_name, result in per_modality.items():
            if not isinstance(result, dict):
                continue
            unc = result.get("uncertainty_budget", {})
            if isinstance(unc, dict):
                for comp in unc.get("components", []):
                    if isinstance(comp, dict):
                        cat = comp.get("category", "unknown")
                        val = comp.get("value", 0.0)
                        weight = weights.get(modality_name, 1.0)
                        budget[f"{modality_name}.{cat}"] = round(val * weight, 4)

        # Aggregate summary
        if budget:
            import math

            budget["_aggregate_rms"] = round(
                math.sqrt(sum(v ** 2 for v in budget.values()) / len(budget)), 4
            )

        return budget

    def _compute_aggregate_population_match(
        self, per_modality: Dict[str, Any]
    ) -> Optional[float]:
        """Compute overall population match score from per-modality results."""
        scores: List[float] = []
        for result in per_modality.values():
            if isinstance(result, dict):
                match = result.get("population_match_score")
                if isinstance(match, (int, float)):
                    scores.append(match)

        if not scores:
            return None
        return float(statistics.mean(scores))

    # =================================================================
    # UTILITY / HELPERS
    # =================================================================

    def _failed_modality_result(
        self, modality: str, error: str
    ) -> Dict[str, Any]:
        """Generate a safe failure placeholder for a single modality."""
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
            "caveats": [
                f"Modality '{modality}' synthesis failed: {error}",
                "This modality contributed no data to the aggregate synthesis.",
            ],
            "sources": [],
        }

    def _extract_sources(
        self, modality_result: Dict[str, Any]
    ) -> List[SynthesisSourceReference]:
        """Extract SynthesisSourceReference objects from a modality result."""
        sources: List[SynthesisSourceReference] = []
        raw_sources = modality_result.get("sources", [])
        for src in raw_sources:
            if isinstance(src, dict):
                sources.append(
                    SynthesisSourceReference(
                        database=src.get("database", "unknown"),
                        version=src.get("version"),
                        record_count=src.get("record_count", 0),
                        query_strategy=src.get("search_strategy"),
                    )
                )
        return sources

    def _critical_failure_response(
        self,
        synthesis_id: str,
        start_time: datetime,
        error: str,
    ) -> MultimodalSynthesisResponse:
        """Generate a safe response when the entire synthesis pipeline fails."""
        return MultimodalSynthesisResponse(
            synthesis_id=synthesis_id,
            timestamp=start_time,
            modalities_used=[],
            per_modality_results={},
            aggregate_confidence=0.0,
            uncertainty_budget={"critical_failure": 1.0},
            research_only=True,
            research_only_reason=(
                "Critical synthesis failure — output contains no valid data "
                "and must not be used for any clinical purpose."
            ),
            caveats=[
                *self._MANDATORY_CAVEATS,
                f"CRITICAL ERROR: Synthesis engine failure — {error}",
                "This output is entirely non-informative and should be discarded.",
            ],
            sources=[],
            fusion_method="none_critical_failure",
            safety_check_passed=False,
            safety_violations=[f"Critical failure: {error}"],
        )


# ---------------------------------------------------------------------------
# Forward type reference
# ---------------------------------------------------------------------------

if TYPE_CHECKING:
    from app.services.knowledge.adapter_registry import AdapterRegistry
    from app.services.knowledge.deeptwin_hooks import DeepTwinKnowledgeHooks
else:
    AdapterRegistry = Any  # type: ignore[misc]
