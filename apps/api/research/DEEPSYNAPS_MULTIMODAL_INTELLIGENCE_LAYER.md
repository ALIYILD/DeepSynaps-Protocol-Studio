# DeepSynaps Multimodal Intelligence Layer

> **Version:** 1.0.0 | **Updated:** 2025-01-21 | **Owner:** Research Engineering
> **Status:** Design Document -- Pending Implementation Review | **Classification:** Confidential

---

## Executive Summary

The **Multimodal Intelligence Layer** fuses data across **8 modalities** (qEEG, MRI, biomarker, medication, genetic, intervention, wearable, assessment), ranks clinical hypotheses by evidence strength, quantifies uncertainty at every output, and maintains strict safety boundaries. **Never autonomously diagnoses or prescribes.** Every output carries: evidence citations, confidence scores, uncertainty descriptions, provenance traces, research-only flags, and `requires_review: ALWAYS true`.

## 1. Design Philosophy
### 1.1 Core Principles
| Principle | Enforcement |
|-----------|-------------|
| **Human-in-the-Loop** | `requires_review: ALWAYS true` on all outputs |
| **Evidence-First** | Provenance trace on every output node |
| **Uncertainty-Rich** | `UncertaintyEngine` runs on every output |
| **Modality-Agnostic** | Weighted consensus with conflict detection |
| **Research-Segregated** | `research_only` boolean on all data points |
| **Confound-Aware** | `detect_confounds()` runs before every synthesis |
### 1.2 Non-Goals

This system does **NOT**: make autonomous diagnoses, generate autonomous prescriptions, present research as clinical evidence without labeling, hide conflicting evidence, suppress uncertainty, or fuse data without temporal alignment.

### 1.3 Relationship to DeepTwin

```
+-------------------------- DeepTwin UI Layer --------------------------+
| Signal Matrix | Insights Panel | Trajectory | Citations | Confounds |
+----------------------------^------------------------------------------+
                             | consumes
+-------------------- Multimodal Intelligence Layer --------------------+
| FusionEngine | HypothesisRanker | UncertaintyEngine | ConfoundDetector |
| CorrelationEngine | TrajectoryAnalyzer | DeepTwinInterface | SafetyGate |
+----------------------------^------------------------------------------+
                             | queries
+----------------------- Database Adapter Layer ------------------------+
| DrugBank | MRI Atlas | qEEG | Evidence RAG | Wearables | PGx | OpenFDA |
+-----------------------------------------------------------------------+
```

---

## 2. Modality Registry

### 2.1 Canonical Definitions

```python
MODALITIES: dict[str, dict[str, Any]] = {
    "qEEG": {
        "features": [
            "power_spectral_density", "coherence", "phase_lag_index",
            "source_localization", "alpha_peak_frequency", "theta_beta_ratio",
            "frontal_asymmetry", "global_relative_power", "spectral_edge_frequency",
        ],
        "normative_dbs": ["CHBMP", "NeuroGuide", "NIH-Lifespan"],
        "confidence_factors": ["data_quality", "normative_match", "artifact_level"],
        "min_electrodes": 19,
        "artifact_thresholds": {
            "max_eye_blink_rejection_pct": 15,
            "max_muscle_rejection_pct": 10,
            "max_epoch_rejection_pct": 20,
        },
    },
    "MRI": {
        "features": [
            "volume", "cortical_thickness", "lesion_burden",
            "structural_connectivity", "perfusion", "white_matter_integrity",
            "regional_activation", "network_efficiency",
        ],
        "normative_dbs": ["ADNI", "ABIDE", "UK-Biobank", "HCP", "OASIS"],
        "confidence_factors": ["resolution", "sequence_quality", "registration_accuracy"],
        "resolution_requirements": {"t1w": "1 mm iso", "fmri": "3 mm iso", "dti": "2 mm iso"},
    },
    "biomarker": {
        "features": [
            "BDNF", "CRP", "IL6", "TNF_alpha", "cortisol_am", "cortisol_pm",
            "HRV_rmssd", "HRV_sdnn", "neurofilament_light", "GFAP",
            "amyloid_beta_42_40", "p_tau181",
        ],
        "normative_dbs": ["NHANES", "clinical_lab_reference"],
        "confidence_factors": ["assay_precision", "collection_timing", "reference_range"],
        "collection_requirements": {
            "cortisol_am": "within 1 hour of waking",
            "cortisol_pm": "8-10 hours after waking",
        },
    },
    "medication": {
        "features": [
            "active_drugs", "dosage", "genetic_interactions",
            "adverse_events_history", "adherence_estimate", "drug_drug_interactions",
        ],
        "normative_dbs": ["DrugBank", "PharmGKB", "FAERS", "RxNorm"],
        "confidence_factors": ["adherence_data", "genetic_data_available", "interactions_known"],
    },
    "genetic": {
        "features": [
            "CYP2D6_metabolizer_status", "CYP2C19_metabolizer_status",
            "BDNF_val66met", "COMT_val158met", "MTHFR_c677t",
            "SLC6A4_5httlpr", "APOE_epsilon", "ANK3", "CACNA1C",
        ],
        "normative_dbs": ["ClinVar", "PharmGKB", "gnomAD", "dbSNP"],
        "confidence_factors": ["variant_classification", "allele_frequency", "functional_validation"],
    },
    "intervention": {
        "features": [
            "modality", "protocol_id", "dose_parameters", "neural_target",
            "response_metrics", "adverse_events", "protocol_adherence_pct",
        ],
        "normative_dbs": ["ClinicalTrials.gov", "Cochrane", "Internal_Protocol_Library"],
        "confidence_factors": ["protocol_adherence", "outcome_data", "follow_up_length"],
    },
    "wearable": {
        "features": [
            "sleep_total_min", "sleep_deep_min", "sleep_rem_min",
            "sleep_efficiency_pct", "steps_daily", "active_minutes",
            "HRV_nightly_rmssd", "resting_heart_rate", "respiratory_rate",
        ],
        "normative_dbs": ["population_norms", "NHANES_activity"],
        "confidence_factors": ["device_accuracy", "wear_time", "data_completeness"],
        "min_daily_wear_hours": 20,
    },
    "assessment": {
        "features": [
            "FMA_total", "MoCA_total", "GAD7_total", "PHQ9_total",
            "BBS_total", "ASRS_total", "MMSE_total", "PSQI_total",
            "MFIS_total", "BPI_severity",
        ],
        "normative_dbs": ["PROMIS", "NIH_Toolbox"],
        "confidence_factors": ["administrator_training", "patient_compliance", "normative_match"],
    },
}
```

### 2.2 Modality Confidence Scoring

```python
class ModalityConfidence:
    """Weighted sum of per-modality confidence factors (0-1 each)."""

    WEIGHTS: dict[str, dict[str, float]] = {
        "qEEG":       {"data_quality": 0.40, "normative_match": 0.35, "artifact_level": 0.25},
        "MRI":        {"resolution": 0.35, "sequence_quality": 0.35, "registration_accuracy": 0.30},
        "biomarker":  {"assay_precision": 0.40, "collection_timing": 0.35, "reference_range": 0.25},
        "medication": {"adherence": 0.30, "genetic_data_available": 0.35, "interactions_known": 0.35},
        "genetic":    {"variant_classification": 0.40, "allele_frequency": 0.30, "functional_validation": 0.30},
        "intervention": {"protocol_adherence": 0.35, "outcome_data": 0.40, "follow_up_length": 0.25},
        "wearable":   {"device_accuracy": 0.35, "wear_time": 0.35, "data_completeness": 0.30},
        "assessment": {"administrator_training": 0.25, "patient_compliance": 0.35, "normative_match": 0.40},
    }

    def compute(self, modality: str, scores: dict[str, float]) -> float:
        w = self.WEIGHTS[modality]
        return round(sum(scores[k] * w[k] for k in w), 3)
```

### 2.3 Cross-Modal Correlation Pairs (28 unique)

Priority pairs by clinical relevance: (1) qEEG x assessment, (2) biomarker x medication, (3) MRI x intervention, (4) genetic x medication, (5) wearable x biomarker, (6) qEEG x intervention, (7) assessment x wearable, (8) MRI x genetic.

---

## 3. Fusion Engine

```python
class MultimodalFusionEngine:
    """Fuse data across modalities with uncertainty quantification.

    SAFETY: NEVER produces autonomous diagnoses or prescriptions.
    All outputs flagged with research_only where applicable;
    requires_review ALWAYS true.
    """

    def __init__(self, adapters: dict[str, ModalityAdapter],
                 correlator: CorrelationEngine, uncertainty: UncertaintyEngine,
                 confounds: ConfoundDetector, evidence: EvidenceRAGService) -> None:
        self.adapters = adapters
        self.correlator = correlator
        self.uncertainty = uncertainty
        self.confounds = confounds
        self.evidence = evidence

    async def fuse(self, patient_id: UUID, modalities: list[str],
                   context: ClinicalContext | None = None) -> FusionResult:
        """Primary fusion pipeline:
        1. Load data from each modality adapter
        2. Normalize to canonical schema
        3. Compute cross-modal correlations
        4. Rank confounders
        5. Quantify uncertainty
        6. Generate evidence-linked synthesis
        """
        modal_data: dict[str, ModalData] = {}
        for m in modalities:
            if m in self.adapters:
                raw = await self.adapters[m].load(patient_id)
                modal_data[m] = self.adapters[m].normalize(raw)

        correlations = await self._compute_correlations(modal_data)
        confound_signals = await self.confounds.detect(patient_id, modal_data)
        uncertainty = self.uncertainty.compute(list(modal_data.values()), correlations)
        synthesis = await self._build_synthesis(patient_id, modal_data, correlations,
                                                 confound_signals, uncertainty, context)

        return FusionResult(
            patient_id=patient_id, synthesis=synthesis, correlations=correlations,
            confounds=confound_signals, uncertainty=uncertainty,
            research_only=any(m.research_only for m in modal_data.values()),
            requires_review=True,  # ALWAYS true -- safety boundary
            generated_at=datetime.now(timezone.utc).isoformat(),
            provenance=build_provenance(modalities),
        )

    async def correlate(self, modality_a: str, feature_a: str,
                        modality_b: str, feature_b: str,
                        patient_id: UUID | None = None) -> CorrelationResult:
        """Pearson + Spearman correlation with bootstrap CIs and confound assessment."""
        data_a = await self.adapters[modality_a].load_feature(patient_id, feature_a)
        data_b = await self.adapters[modality_b].load_feature(patient_id, feature_b)
        pr, pr_ci = self.correlator.pearson_with_ci(data_a, data_b)
        sr, sr_ci = self.correlator.spearman_with_ci(data_a, data_b)
        return CorrelationResult(
            modality_a=modality_a, feature_a=feature_a,
            modality_b=modality_b, feature_b=feature_b,
            pearson_r=pr, pearson_ci_95=pr_ci,
            spearman_rho=sr, spearman_ci_95=sr_ci,
            n_samples=min(len(data_a), len(data_b)),
            significance=self.correlator._assess_significance(pr, min(len(data_a), len(data_b))),
            confound_risk=await self.confounds.assess_correlation_confound(
                modality_a, feature_a, modality_b, feature_b),
        )

    async def detect_confounds(self, patient_id: UUID,
                               modal_data: dict[str, ModalData] | None = None) -> list[ConfoundSignal]:
        if modal_data is None:
            modal_data = {m: self.adapters[m].normalize(await self.adapters[m].load(patient_id))
                          for m in self.adapters}
        return await self.confounds.detect(patient_id, modal_data)

    async def compute_longitudinal_trend(self, patient_id: UUID, modality: str,
                                         feature: str, window_months: int = 6) -> TrendResult:
        ts = await self.adapters[modality].load_time_series(patient_id, feature, window_months)
        if len(ts) < 3:
            return TrendResult(feature=feature, modality=modality, trend="insufficient_data",
                               n_points=len(ts), research_only=True, requires_review=True)
        slope, ci = self._compute_slope_with_ci(ts)
        return TrendResult(feature=feature, modality=modality,
                           trend=self._classify_trend(slope, ci),
                           slope=slope, confidence_interval=ci,
                           n_points=len(ts), raw_series=ts,
                           research_only=len(ts) < 10, requires_review=True)

    # --- helpers ---
    async def _compute_correlations(self, modal_data: dict[str, ModalData]) -> list[CorrelationResult]:
        correlations: list[CorrelationResult] = []
        mods = list(modal_data.keys())
        for i, ma in enumerate(mods):
            for mb in mods[i+1:]:
                for fa in modal_data[ma].features:
                    for fb in modal_data[mb].features:
                        c = await self.correlator.compute(modal_data[ma], fa, modal_data[mb], fb)
                        if c.strength > 0.3:
                            correlations.append(c)
        return correlations
```

### 3.2 Fusion Result Schema

```python
class FusionResult(BaseModel):
    patient_id: UUID
    synthesis: MultimodalSynthesis
    correlations: list[CorrelationResult]
    confounds: list[ConfoundSignal]
    uncertainty: UncertaintyEstimate
    research_only: bool
    requires_review: Literal[True]
    generated_at: str
    provenance: ProvenanceTrace

    @model_validator(mode="after")
    def _validate_safety(self) -> "FusionResult":
        if not self.requires_review:
            raise ValueError("requires_review must ALWAYS be True")
        return self


class MultimodalSynthesis(BaseModel):
    summary_text: str  # Softened language
    modality_summaries: dict[str, ModalitySummary]
    cross_modal_insights: list[CrossModalInsight]
    evidence_citations: list[EvidenceCitation]
    uncertainty_summary: str
    confound_warnings: list[str]
    missing_modalities: list[str]
    conflicting_findings: list[ConflictingFinding]


class CrossModalInsight(BaseModel):
    insight_text: str  # "associated with", not "causes"
    supporting_modalities: list[str]
    correlation_results: list[CorrelationResult]
    evidence_grade: Literal["low", "moderate", "high"]
    confidence: float
    research_only: bool
    confound_risk: float
    citations: list[EvidenceCitation]
```

---

## 4. Hypothesis Ranking

```python
class HypothesisRanker:
    """Rank clinical hypotheses by evidence strength and multimodal support.

    Each hypothesis gets: evidence_score (0-1), modal_support list,
    confound_risk (0-1), research_only boolean, requires_review ALWAYS true.
    This is a suggestion engine, NOT a diagnosis system.
    """

    def __init__(self, fusion: MultimodalFusionEngine,
                 evidence: EvidenceRAGService, uncertainty: UncertaintyEngine) -> None:
        self.fusion = fusion; self.evidence = evidence; self.uncertainty = uncertainty

    async def rank(self, patient_id: UUID, context: ClinicalContext,
                   pool: list[str] | None = None) -> list[RankedHypothesis]:
        """Rank hypotheses. Auto-generates pool if not provided."""
        pool = pool or await self._generate_hypotheses(patient_id, context)
        mods = list(self.fusion.adapters.keys())
        fusion_r = await self.fusion.fuse(patient_id, mods, context)
        ranked = [await self._score_hypothesis(h, fusion_r, context) for h in pool]
        ranked.sort(key=lambda h: h.evidence_score - h.confound_risk * 0.5, reverse=True)
        return ranked

    async def _score_hypothesis(self, hypothesis: str, fusion_r: FusionResult,
                                context: ClinicalContext) -> RankedHypothesis:
        modality_evidence = {m: await self._modality_supports(hypothesis, s, context)
                             for m, s in fusion_r.synthesis.modality_summaries.items()}
        cross_modal = self._compute_cross_modal_coherence(fusion_r.correlations, hypothesis)
        lit = await self.evidence.score_hypothesis(hypothesis, context.condition)
        evidence_score = self._composite_evidence(modality_evidence, cross_modal, lit)
        confound_risk = max((c.risk_level for c in fusion_r.confounds), default=0.0)
        research_only = (any(m.research_only for m in fusion_r.synthesis.modality_summaries.values())
                         or lit.grade == "low" or len(modality_evidence) < 2)

        return RankedHypothesis(
            hypothesis=hypothesis, evidence_score=round(evidence_score, 3),
            modal_support=[m for m, s in modality_evidence.items() if s > 0.3],
            confound_risk=round(confound_risk, 3), research_only=research_only,
            requires_review=True, uncertainty=fusion_r.uncertainty,
            conflicting_evidence=self._find_conflicts(fusion_r, hypothesis),
            citations=lit.citations,
        )

    async def _generate_hypotheses(self, patient_id: UUID, context: ClinicalContext) -> list[str]:
        h: list[str] = []
        h.extend(await self._extract_data_hypotheses(patient_id))
        h.extend(await self.evidence.find_related_hypotheses(context.condition, context.demographics))
        h.extend(CONDITION_HYPOTHESIS_TEMPLATES.get(context.condition, []))
        return list(set(h))


class RankedHypothesis(BaseModel):
    hypothesis: str
    evidence_score: float  # 0-1
    modal_support: list[str]
    confound_risk: float   # 0-1
    research_only: bool
    requires_review: Literal[True]
    uncertainty: UncertaintyEstimate
    conflicting_evidence: list[ConflictingFinding]
    citations: list[EvidenceCitation]
    rank: int | None = None

    def to_clinician_summary(self) -> str:
        return (f"Hypothesis: {self.hypothesis}\n"
                f"Evidence: {self.evidence_score:.1%} | Modalities: {', '.join(self.modal_support)}\n"
                f"Confound Risk: {self.confound_risk:.1%} | Research-Only: {'YES' if self.research_only else 'No'}\n"
                f"Conflicts: {len(self.conflicting_evidence)} | Citations: {len(self.citations)}\n"
                f"REQUIRES CLINICIAN REVIEW")
```

---

## 5. DeepTwin Integration

```python
class DeepTwinIntelligenceInterface:
    """Adapter translating between intelligence layer outputs and DeepTwin data shapes."""

    def __init__(self, fusion: MultimodalFusionEngine, ranker: HypothesisRanker,
                 uncertainty: UncertaintyEngine, trajectory: TrajectoryAnalyzer) -> None:
        self.fusion = fusion; self.ranker = ranker
        self.uncertainty = uncertainty; self.trajectory = trajectory

    async def generate_synthesis(self, patient_id: UUID,
                                  synthesis_type: Literal["full_multimodal", "quick_status",
                                                           "pre_session", "post_session",
                                                           "longitudinal_review", "intervention_response"],
                                  window_months: int = 3) -> DeepTwinSynthesis:
        """Generate multimodal synthesis for DeepTwin display."""
        modalities = self._select_modalities(synthesis_type)
        fusion_r = await self.fusion.fuse(patient_id, modalities)
        context = ClinicalContext.from_patient(patient_id)
        hypotheses = await self.ranker.rank(patient_id, context)
        trends = await self._compute_trends_if_needed(patient_id, modalities, synthesis_type, window_months)

        return DeepTwinSynthesis(
            patient_id=patient_id, synthesis_type=synthesis_type,
            signal_matrix=self._build_signal_matrix(fusion_r),
            insights_panel=self._build_insights_panel(hypotheses),
            trajectory_cards=self._build_trajectory_cards(trends),
            uncertainty_banner=self.uncertainty.format_for_clinician(fusion_r.uncertainty),
            confound_alerts=[c.description for c in fusion_r.confounds if c.risk_level > 0.5],
            research_only_flags=self._collect_research_flags(fusion_r),
            citations=self._deduplicate_citations([c for h in hypotheses for c in h.citations]),
            requires_review=True,
            disclaimer=INTELLIGENCE_SAFETY_RULES["required_disclaimer"],
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    async def update_from_intervention(self, patient_id: UUID,
                                        intervention_id: UUID) -> SynthesisDelta:
        """Compute before/after deltas for all relevant modalities."""
        mods = ["qEEG", "biomarker", "assessment", "wearable"]
        pre = await self.fusion.fuse(patient_id, mods)
        post = await self.fusion.fuse(patient_id, mods)
        deltas = self._compute_modality_deltas(pre, post)
        sig = [d for d in deltas if abs(d.effect_size) > 0.2 and d.p_value < 0.05]
        return SynthesisDelta(
            patient_id=patient_id, intervention_id=intervention_id,
            pre_timestamp=pre.generated_at, post_timestamp=post.generated_at,
            modality_deltas=deltas, significant_changes=sig,
            uncertainty=self.uncertainty.compute_for_delta(pre, post),
            research_only=pre.research_only or post.research_only,
            requires_review=True,
        )

    async def rank_protocol_suggestions(self, patient_id: UUID,
                                         condition: str) -> list[ProtocolSuggestion]:
        """Rank protocol suggestions with evidence -- NOT prescriptions."""
        protocols = await self._load_available_protocols(condition)
        fusion = await self.fusion.fuse(patient_id,
            ["genetic", "medication", "biomarker", "MRI", "qEEG"])
        suggestions: list[ProtocolSuggestion] = []
        for p in protocols:
            contra = await self._check_contraindications(p, fusion)
            fit = await self._score_protocol_fit(p, condition, fusion)
            ev = await self.evidence.get_protocol_evidence(p, condition)
            suggestions.append(ProtocolSuggestion(
                protocol_name=p, condition=condition, fit_score=round(fit, 3),
                contraindications=contra, evidence_grade=ev.grade,
                supporting_studies=ev.studies, research_only=ev.grade == "low",
                requires_review=True,
                uncertainty=self.uncertainty.compute_for_protocol(p, fusion),
            ))
        suggestions.sort(key=lambda s: s.fit_score, reverse=True)
        return suggestions

    def _select_modalities(self, t: str) -> list[str]:
        M = {"full_multimodal": ["qEEG","MRI","biomarker","medication","genetic","intervention","wearable","assessment"],
             "quick_status": ["qEEG","assessment","wearable"],
             "pre_session": ["qEEG","biomarker","wearable"],
             "post_session": ["qEEG","assessment","wearable","biomarker"],
             "longitudinal_review": ["qEEG","assessment","wearable","biomarker","intervention"],
             "intervention_response": ["qEEG","biomarker","assessment","MRI","wearable"]}
        return M.get(t, M["full_multimodal"])

    def _build_signal_matrix(self, fusion_r: FusionResult) -> dict[str, Any]:
        signals = [{"domain": m.lower(), "name": f.name, "unit": f.unit,
                    "baseline": f.baseline, "current": f.current_value,
                    "delta": f.delta, "confidence": f.confidence,
                    "evidence_grade": f.evidence_grade, "n_observations": f.n_observations}
                   for m, s in fusion_r.synthesis.modality_summaries.items() for f in s.features]
        return {"signals": signals}

    def _build_insights_panel(self, hypotheses: list[RankedHypothesis]) -> dict[str, Any]:
        return {"top_hypotheses": [{"text": soften_language(h.hypothesis),
                                     "confidence": h.evidence_score,
                                     "modal_support": h.modal_support,
                                     "confound_risk": h.confound_risk,
                                     "research_only": h.research_only}
                                    for h in hypotheses[:5]],
                "conflict_alerts": [{"hypotheses": c.hypotheses, "description": c.description}
                                    for h in hypotheses for c in h.conflicting_evidence]}


class DeepTwinSynthesis(BaseModel):
    patient_id: UUID; synthesis_type: str
    signal_matrix: dict[str, Any]; insights_panel: dict[str, Any]
    trajectory_cards: list[dict[str, Any]]; uncertainty_banner: str
    confound_alerts: list[str]; research_only_flags: list[str]
    citations: list[EvidenceCitation]; requires_review: Literal[True]
    disclaimer: str; generated_at: str
```

---

## 6. Uncertainty Quantification

```python
class UncertaintyEngine:
    """Quantify and display uncertainty. Missing data is NOT negative evidence -- it increases uncertainty."""

    def compute_uncertainty(self, data: list[ModalData],
                            correlations: list[CorrelationResult] | None = None) -> UncertaintyEstimate:
        f: dict[str, float] = {}
        available = {d.modality for d in data}
        missing = set(MODALITIES.keys()) - available
        f["missing_modalities"] = len(missing) / len(MODALITIES)

        total_pts = sum(len(d.features) for d in data)
        f["low_confidence"] = (sum(1 for d in data for feat in d.features if feat.confidence < 0.5)
                               / total_pts if total_pts else 1.0)
        f["conflicting"] = (len([c for c in correlations or [] if c.significance == "conflicting"])
                            / len(correlations) if correlations else 0.0)
        f["small_samples"] = (sum(1 for d in data for feat in d.features if feat.n_observations < 30)
                              / total_pts if total_pts else 1.0)

        now = datetime.now(timezone.utc)
        thresholds = {"qEEG": 30, "MRI": 180, "biomarker": 90, "medication": 7,
                      "genetic": 3650, "intervention": 14, "wearable": 7, "assessment": 30}
        f["outdated"] = sum(1 for d in data if (now - d.last_updated).days > thresholds.get(d.modality, 30)) / len(data) if data else 1.0
        f["research_only"] = sum(1 for d in data if d.research_only) / len(data) if data else 0.0
        if len(data) >= 2:
            ts = [d.last_updated for d in data]
            f["temporal_misalignment"] = min((max(ts) - min(ts)).days / 30, 1.0)
        else:
            f["temporal_misalignment"] = 0.0

        agg = 1.0 - np.prod([1.0 - v for v in f.values() if v > 0.05])
        return UncertaintyEstimate(overall_uncertainty=round(agg, 3), per_factor=f,
                                   contributing=[k for k, v in f.items() if v > 0.2],
                                   interpretation=self._interpret(agg),
                                   recommendation=self._recommend(agg, f))

    def format_for_clinician(self, u: UncertaintyEstimate) -> str:
        lines = [f"Overall Uncertainty: {u.overall_uncertainty:.1%}", f"Level: {u.interpretation}", "", "Contributing Factors:"]
        for factor, val in u.per_factor.items():
            if val > 0.05:
                icon = "HIGH" if val > 0.5 else "MODERATE" if val > 0.2 else "LOW"
                lines.append(f"  [{icon}] {factor.replace('_', ' ').title()}: {val:.1%}")
        lines.extend(["", f"Recommendation: {u.recommendation}"])
        return "\n".join(lines)

    def _interpret(self, a: float) -> str:
        if a < 0.2: return "LOW -- Results relatively reliable"
        if a < 0.4: return "MODERATE -- Interpret with caution"
        if a < 0.6: return "ELEVATED -- Consider additional data"
        if a < 0.8: return "HIGH -- Strong caution; conclusions preliminary"
        return "VERY HIGH -- Insufficient data for meaningful conclusions"

    def _recommend(self, agg: float, f: dict[str, float]) -> str:
        r: list[str] = []
        if f.get("missing_modalities", 0) > 0.3: r.append("Collect additional modalities")
        if f.get("low_confidence", 0) > 0.3: r.append("Re-collect low-confidence data")
        if f.get("conflicting", 0) > 0.2: r.append("Review conflicting cross-modal findings")
        if f.get("small_samples", 0) > 0.3: r.append("Increase observation frequency")
        if f.get("outdated", 0) > 0.3: r.append("Update stale measurements")
        if f.get("research_only", 0) > 0.3: r.append("Confirm research findings clinically")
        return "; ".join(r) if r else "Continue current monitoring"


class UncertaintyEstimate(BaseModel):
    overall_uncertainty: float; per_factor: dict[str, float]
    contributing_factors: list[str]; interpretation: str; recommendation: str
```

## 7. Safety Boundaries

```python
INTELLIGENCE_SAFETY_RULES: dict[str, Any] = {
    "forbidden_outputs": [
        "autonomous_diagnosis", "autonomous_prescription",
        "unsupported_causal_claim", "black_box_verdict",
        "hidden_data_fusion", "research_presented_as_clinical",
    ],
    "required_outputs": [
        "evidence_citations", "confidence_scores",
        "uncertainty_description", "provenance_trace",
        "research_only_flags", "clinician_review_required",
        "conflicting_evidence_noted",
    ],
    "fusion_principles": [
        "missing_data_is_not_negative_evidence",
        "conflicting_modalities_require_human_review",
        "research_only_data_never_overrides_clinical",
        "uncertainty_compounds_across_modalities",
        "temporal_alignment_required_for_longitudinal",
    ],
    "language_rules": [
        "Use 'associated with' not 'causes'",
        "Use 'suggests' not 'proves'",
        "Use 'may be linked to' not 'is responsible for'",
        "Use 'consistent with' not 'diagnostic of'",
        "Always qualify with confidence level",
        "Always mention confound limitations",
    ],
    "required_disclaimer": (
        "This output is generated by an AI-powered decision-support system and is "
        "intended for clinician review only. It does not constitute a medical diagnosis, "
        "treatment recommendation, or substitute for professional clinical judgment. "
        "All outputs require review by a qualified healthcare provider."
    ),
}
```

### 7.2 Safety Validation Gate

```python
class SafetyValidationGate:
    """Validate ALL intelligence outputs against safety rules before returning to any consumer."""

    FORBIDDEN_WORDS = ["causes", "proves", "diagnostic of", "prescribe"]

    def validate(self, output: IntelligenceOutput) -> ValidationResult:
        violations: list[str] = []
        for fb in INTELLIGENCE_SAFETY_RULES["forbidden_outputs"]:
            if self._contains_forbidden(output, fb):
                violations.append(f"Forbidden: {fb}")
        for req in INTELLIGENCE_SAFETY_RULES["required_outputs"]:
            if not self._has_required(output, req):
                violations.append(f"Missing: {req}")
        if not getattr(output, "requires_review", False):
            violations.append("requires_review must be True")
        if not hasattr(output, "uncertainty") or output.uncertainty is None:
            violations.append("Uncertainty missing")
        text = self._extract_all_text(output).lower()
        for w in self.FORBIDDEN_WORDS:
            if w in text: violations.append(f"Overstrong language: '{w}'")
        return ValidationResult(passed=len(violations) == 0, violations=violations)
```

## 8. Correlation Engine

```python
class CorrelationEngine:
    """Pearson (linear), Spearman (monotonic), partial correlation (controlling confounds).
    Bootstrap CIs on all coefficients."""

    def __init__(self, n_bootstrap: int = 1000) -> None:
        self.n_bootstrap = n_bootstrap

    def pearson_with_ci(self, x: list[float], y: list[float],
                        confidence: float = 0.95) -> tuple[float, tuple[float, float]]:
        if len(x) < 3: return 0.0, (0.0, 0.0)
        r = float(np.corrcoef(x, y)[0, 1])
        boots = []
        rng = np.random.default_rng(42)
        n = min(len(x), len(y))
        for _ in range(self.n_bootstrap):
            idx = rng.integers(0, n, n)
            bx, by = [x[i] for i in idx], [y[i] for i in idx]
            if np.std(bx) > 0 and np.std(by) > 0:
                boots.append(float(np.corrcoef(bx, by)[0, 1]))
        return round(r, 4), (round(float(np.percentile(boots, 2.5)), 4),
                              round(float(np.percentile(boots, 97.5)), 4))

    def spearman_with_ci(self, x: list[float], y: list[float],
                         confidence: float = 0.95) -> tuple[float, tuple[float, float]]:
        if len(x) < 3: return 0.0, (0.0, 0.0)
        from scipy.stats import spearmanr
        rho, _ = spearmanr(x, y)
        boots = []
        rng = np.random.default_rng(42)
        n = min(len(x), len(y))
        for _ in range(self.n_bootstrap):
            idx = rng.integers(0, n, n)
            try: boots.append(float(spearmanr([x[i] for i in idx], [y[i] for i in idx])[0]))
            except Exception: pass
        return round(float(rho), 4), (round(float(np.percentile(boots, 2.5)), 4),
                                       round(float(np.percentile(boots, 97.5)), 4))

    def partial_correlation(self, x: list[float], y: list[float],
                            z: list[list[float]]) -> tuple[float, float]:
        """Partial correlation controlling for confound variables z."""
        import statsmodels.api as sm
        zc = sm.add_constant(np.array(z).T)
        xr = sm.OLS(x, zc).fit().resid
        yr = sm.OLS(y, zc).fit().resid
        return round(float(np.corrcoef(xr, yr)[0, 1]), 4), 0.0

    def _assess_significance(self, r: float, n: int) -> str:
        if n < 5: return "insufficient_data"
        if abs(r) < 0.1: return "negligible"
        if abs(r) < 0.3: return "weak"
        if abs(r) < 0.5: return "moderate"
        if abs(r) < 0.7: return "strong"
        return "very_strong"
```

---

## 9. Longitudinal Trajectory Analysis

```python
class TrajectoryAnalyzer:
    """LOESS smoothing + bootstrapped linear trend with CIs. Requires temporal alignment."""

    def __init__(self, n_bootstrap: int = 500) -> None:
        self.n_bootstrap = n_bootstrap

    def analyze(self, time_series: list[tuple[datetime, float]],
                window_days: int = 180) -> TrajectoryResult:
        if len(time_series) < 3:
            return TrajectoryResult(trend="insufficient_data", n_points=len(time_series), reliable=False)
        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
        filt = [(t, v) for t, v in time_series if t >= cutoff]
        if len(filt) < 3:
            return TrajectoryResult(trend="insufficient_data_in_window", n_points=len(filt), reliable=False)
        times = np.array([(t - filt[0][0]).days for t, _ in filt])
        vals = np.array([v for _, v in filt])
        from scipy.stats import linregress
        slope, _, r, p, _ = linregress(times, vals)
        rng = np.random.default_rng(42)
        boot_slopes = []
        for _ in range(self.n_bootstrap):
            idx = rng.integers(0, len(times), len(times))
            try: boot_slopes.append(float(linregress(times[idx], vals[idx]).slope))
            except Exception: pass
        ci_l, ci_u = np.percentile(boot_slopes, 2.5), np.percentile(boot_slopes, 97.5)
        return TrajectoryResult(trend=self._classify(slope, (ci_l, ci_u), p),
                                slope=round(float(slope), 4),
                                slope_ci_95=(round(float(ci_l), 4), round(float(ci_u), 4)),
                                r_squared=round(float(r**2), 4), p_value=round(float(p), 4),
                                n_points=len(filt), time_span_days=int(times[-1] - times[0]),
                                reliable=len(filt) >= 10 and p < 0.1)

    def _classify(self, slope: float, ci: tuple[float, float], p: float) -> str:
        lo, hi = ci
        if p > 0.1: return "stable_or_noisy"
        if lo > 0 and hi > 0: return "increasing_reliable" if slope > 0 else "decreasing_reliable"
        if lo < 0 and hi < 0: return "decreasing_reliable" if slope < 0 else "increasing_reliable"
        return "possibly_increasing" if slope > 0 else "possibly_decreasing"


class TrajectoryResult(BaseModel):
    trend: str; slope: float | None = None
    slope_ci_95: tuple[float, float] | None = None
    r_squared: float | None = None; p_value: float | None = None
    n_points: int; time_span_days: int | None = None
    reliable: bool = False
```

## 10. Confound Handling

```python
class ConfoundDetector:
    """Detect and rank confounds. Ranked by potential impact, surfaced as clinician warnings."""

    CATALOGUE: list[dict[str, Any]] = [
        {"name": "time_of_day", "affects": ["qEEG","biomarker","wearable","assessment"], "severity": "moderate"},
        {"name": "acute_stress", "affects": ["qEEG","biomarker","HRV","assessment"], "severity": "high"},
        {"name": "medication_changes", "affects": ["qEEG","biomarker","MRI","assessment"], "severity": "high"},
        {"name": "sleep_quality_last_night", "affects": ["qEEG","biomarker","assessment","wearable"], "severity": "moderate"},
        {"name": "caffeine_intake", "affects": ["qEEG","HRV"], "severity": "moderate"},
        {"name": "recent_exercise", "affects": ["biomarker","HRV","BDNF"], "severity": "moderate"},
        {"name": "menstrual_cycle", "affects": ["biomarker","qEEG","HRV","assessment"], "severity": "moderate"},
        {"name": "concurrent_illness", "affects": ["biomarker","assessment","wearable"], "severity": "high"},
        {"name": "testing_environment", "affects": ["qEEG","assessment"], "severity": "low"},
    ]

    async def detect(self, patient_id: UUID,
                     modal_data: dict[str, ModalData]) -> list[ConfoundSignal]:
        signals: list[ConfoundSignal] = []
        available = set(modal_data.keys())
        for c in self.CATALOGUE:
            overlap = set(c["affects"]) & available
            if not overlap: continue
            coverage = len(overlap) / len(c["affects"])
            evidence = await self._check_evidence(c["name"], modal_data)
            sev = {"low": 0.2, "moderate": 0.5, "high": 0.8}[c["severity"]]
            risk = sev * coverage * (0.5 + 0.5 * evidence)
            if risk > 0.1:
                signals.append(ConfoundSignal(
                    name=c["name"], affected_modalities=list(overlap),
                    severity=c["severity"], risk_level=round(risk, 3),
                    evidence_strength=evidence,
                    description=(f"{c['name'].replace('_',' ').title()} may affect "
                                 f"{', '.join(sorted(overlap))} (risk: {risk:.1%})")))
        signals.sort(key=lambda s: s.risk_level, reverse=True)
        return signals

    async def assess_correlation_confound(self, ma: str, fa: str, mb: str, fb: str) -> float:
        risk = 0.0
        for c in self.CATALOGUE:
            if ma in c["affects"] and mb in c["affects"]:
                risk = max(risk, {"low": 0.2, "moderate": 0.5, "high": 0.8}.get(c["severity"], 0.3))
        return risk

    async def _check_evidence(self, name: str, data: dict[str, ModalData]) -> float:
        return 0.3  # Patient-specific lookup in full implementation


class ConfoundSignal(BaseModel):
    name: str; affected_modalities: list[str]
    severity: Literal["low", "moderate", "high"]
    risk_level: float; evidence_strength: float; description: str
```

---

## 11. Evidence-Linked Reasoning Pipeline

```python
class EvidenceCitation(BaseModel):
    pmid: str | None; doi: str | None; title: str; authors: list[str]
    year: int; journal: str
    evidence_grade: Literal["low", "moderate", "high"]
    study_type: Literal["RCT","systematic_review","meta_analysis","cohort",
                        "case_control","cross_sectional","pilot","case_report"]
    n_subjects: int | None; key_finding: str; limitation_note: str | None

class ProvenanceTrace(BaseModel):
    source_modalities: list[str]; databases_queried: list[str]
    algorithms_used: list[str]; confidence_factors: dict[str, float]
    processing_steps: list[dict[str, Any]]
    generated_at: str; version: str = "1.0.0"

class ConflictingFinding(BaseModel):
    description: str; hypotheses: list[str]; modalities_involved: list[str]
    conflict_type: Literal["directional", "magnitude", "significance", "temporal"]
    severity: Literal["low", "moderate", "high"]; recommendation: str
```

## 12. Implementation Architecture

### 12.1 File Structure

```
app/services/intelligence/
    __init__.py
    fusion_engine.py          # MultimodalFusionEngine
    hypothesis_ranker.py      # HypothesisRanker
    uncertainty_engine.py     # UncertaintyEngine
    correlation_engine.py     # CorrelationEngine
    trajectory_analyzer.py    # TrajectoryAnalyzer
    confound_detector.py      # ConfoundDetector
    deeptwin_interface.py     # DeepTwinIntelligenceInterface
    safety_gate.py            # SafetyValidationGate
    modality_registry.py      # MODALITIES + ModalityConfidence
    schemas.py                # All Pydantic models
    language_utils.py         # soften_language
```

### 12.2 API Endpoints

```
/api/v1/intelligence/fuse               POST  -- Full multimodal fusion
/api/v1/intelligence/correlate          POST  -- Cross-modal correlation
/api/v1/intelligence/hypotheses         POST  -- Rank hypotheses
/api/v1/intelligence/trends             POST  -- Longitudinal trends
/api/v1/intelligence/confounds          GET   -- Detect confounds
/api/v1/deeptwin/synthesis              POST  -- DeepTwin synthesis
/api/v1/deeptwin/intervention-delta     POST  -- Post-intervention delta
/api/v1/deeptwin/protocol-suggestions   POST  -- Rank protocol suggestions
```

### 12.3 SLAs

| Metric | Target |
|--------|--------|
| Fusion (8 modalities) | < 2 s |
| Correlation | < 500 ms |
| Hypothesis ranking | < 1 s |
| Uncertainty computation | < 200 ms |
| Safety gate | < 50 ms |
| DeepTwin synthesis | < 3 s |

## 13. Summary

### Component Count

| Component | Count |
|-----------|-------|
| Registered Modalities | 8 |
| Total Modality Features | 72 |
| Normative Databases | 25+ |
| Cross-Modal Correlation Pairs | 28 |
| Core Engine Classes | 7 |
| DeepTwin Interface Methods | 3 |
| Correlation Methods | 3 |
| Confound Categories | 9 |
| Uncertainty Factors | 8 |

### Safety Rules Count

```
Forbidden outputs:          6
Required outputs:           7
Fusion principles:          5
Language rules:             6
Total safety rules:        24
```

*DeepSynaps Protocol Studio -- Research Division | Confidential -- Internal Use Only*
     