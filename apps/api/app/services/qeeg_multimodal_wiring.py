"""qEEG Multimodal Integration — wire qEEG to MRI, biomarkers, medications, DeepTwin.

Decision-support only. Cross-analyzer correlations are temporal associations,
not causal proof.

This module implements Deliverable D54–D57 from the DeepSynaps qEEG Analyzer
Roadmap: Multimodal Integration + FHIR Wiring (Week 15).

Safety Rule 2 (Supportive Context Only) and Rule 17 (Clinical Correlation
Mandate) are enforced in all outputs.
"""

from __future__ import annotations

import logging
from typing import Any

_log = logging.getLogger(__name__)

# ── Supported cross-analyzer fusion targets ──────────────────────────────────

FUSION_TARGETS: list[str] = [
    "mri",
    "biomarkers",
    "medications",
    "assessments",
    "risk",
    "deeptwin",
]

# ── Cross-analyzer context definitions ───────────────────────────────────────

_CONTEXT_TEMPLATES: dict[str, dict[str, Any]] = {
    "mri": {
        "relevance": (
            "MRI provides structural context for qEEG functional findings. "
            "Integration enables structure-function correlation."
        ),
        "qeeeg_contributes": [
            "Functional activity patterns (spectral power, connectivity)",
            "Source localization constraints",
            "Protocol planning targets for neuromodulation",
            "EEG-informed regions of interest for MRI review",
        ],
        "mri_contributes": [
            "Structural abnormalities (lesions, atrophy, malformations)",
            "Lesion mapping for source localization exclusion",
            "Cortical thickness for normative comparison",
            "Individual MRI for improved source localization accuracy (~4x)",
        ],
        "fusion_opportunity": (
            "MRI-informed source localization improves spatial accuracy approximately 4x "
            "(from ~20 mm template error to ~5 mm individual error). "
            "Structure-function coupling indices can be computed."
        ),
        "integration_method": "Co-registration via MNI152 template or individual fiducials",
        "clinical_value": "HIGH — structural lesions explain functional deviations",
    },
    "biomarkers": {
        "relevance": (
            "Blood biomarkers provide biological context for EEG patterns. "
            "Combined panels may improve sensitivity for neurodegeneration and psychiatric conditions."
        ),
        "qeeeg_contributes": [
            "Brain activity patterns (neural oscillation markers)",
            "Individual Alpha Frequency (linked to cholinergic tone)",
            "Theta/beta ratio (correlates with catecholaminergic function)",
        ],
        "biomarker_contributes": [
            "Inflammatory markers (IL-6, TNF-alpha, CRP)",
            "Neurotransmitter metabolites (HIAA, HVA, MHPG)",
            "Hormonal levels (cortisol, thyroid, sex hormones)",
            "Neurodegeneration markers (NfL, p-tau, amyloid)",
            "Nutritional markers (B12, folate, vitamin D, omega-3 index)",
        ],
        "fusion_opportunity": (
            "Combined biomarker + qEEG panels improve sensitivity for early neurodegeneration "
            "and may support personalized neurotransmitter-targeted interventions. "
            "Example: low IAF + elevated inflammatory markers suggests cholinergic-inflammatory mechanism."
        ),
        "integration_method": "Temporal correlation with shared phenotyping timestamps",
        "clinical_value": "MODERATE — biological mechanisms inform interpretation",
    },
    "medications": {
        "relevance": (
            "Medications affect EEG patterns; qEEG can monitor medication effects objectively. "
            "Drug-EEG interactions must be considered in all interpretations."
        ),
        "qeeeg_contributes": [
            "Baseline brain activity pre-medication",
            "Medication response tracking (longitudinal)",
            "Objective endpoint for dose optimization",
            "Detection of medication-induced EEG changes before clinical symptoms",
        ],
        "medication_contributes": [
            "Known EEG effects per drug class (e.g., benzodiazepines increase beta)",
            "Dose-response relationships",
            "Pharmacogenomic metabolizer status (CYP2D6, CYP2C19)",
            "Medication adherence timestamps",
        ],
        "fusion_opportunity": (
            "qEEG can detect medication-induced EEG changes before clinical symptom changes, "
            "providing an early objective marker of treatment response. "
            "Medication-naive baselines are gold standard for interpretation."
        ),
        "integration_method": "Time-aligned medication history with EEG recording timestamps",
        "clinical_value": "HIGH — medication confounds are major interpretation factor",
    },
    "assessments": {
        "relevance": (
            "Cognitive and behavioral assessments correlate with EEG patterns. "
            "Combined assessment + qEEG improves diagnostic accuracy."
        ),
        "qeeeg_contributes": [
            "Objective neural measures of attention and arousal",
            "Theta/beta ratio as attention biomarker (NEBA FDA-cleared)",
            "Frontal alpha asymmetry as mood marker",
            "Connectivity metrics as cognitive network markers",
        ],
        "assessment_contributes": [
            "Cognitive performance scores (IQ, memory, executive function)",
            "Behavioral rating scales (Conners, BDI, STAI, PCL-5)",
            "Symptom severity scores",
            "Functional impairment ratings",
        ],
        "fusion_opportunity": (
            "qEEG + cognitive assessment improves ADHD diagnosis accuracy beyond either alone. "
            "Objective neural markers validate subjective symptom reports. "
            "Dissonance between qEEG and assessment triggers deeper clinical review."
        ),
        "integration_method": "Correlation matrix between qEEG features and assessment scores",
        "clinical_value": "HIGH — convergent validity strengthens interpretation",
    },
    "risk": {
        "relevance": (
            "qEEG patterns may be associated with certain risk profiles. "
            "Combined risk stratification supports preventive intervention planning."
        ),
        "qeeeg_contributes": [
            "Neural instability markers (excess beta, spike-wave activity)",
            "Epileptiform activity detection",
            "Slowing patterns suggesting encephalopathy",
            "Connectivity disruption as vulnerability marker",
        ],
        "risk_contributes": [
            "Historical risk factors (family history, prior events)",
            "Demographic risk (age, sex, genetic factors)",
            "Comorbidity burden scores",
            "Lifestyle factors (sleep, substance use)",
        ],
        "fusion_opportunity": (
            "Combined risk + qEEG for seizure risk stratification and "
            "neurodegeneration early warning. qEEG adds objective neural dimension to risk scores."
        ),
        "integration_method": "Risk score enrichment with qEEG-derived neural features",
        "clinical_value": "MODERATE — adds objective neural dimension to risk models",
    },
    "deeptwin": {
        "relevance": (
            "qEEG is a core modality in the patient digital twin (DeepTwin). "
            "EEG data enriches the multimodal patient model with real-time brain-state information."
        ),
        "qeeeg_contributes": [
            "Real-time brain state (arousal, engagement, cognitive load)",
            "Longitudinal trajectories (treatment response tracking)",
            "Treatment response prediction (personalized outcome modeling)",
            "Pre/post intervention change quantification",
        ],
        "deeptwin_contributes": [
            "Multimodal patient model (integrating all data streams)",
            "Causal hypothesis ranking (what interventions may work best)",
            "Outcome prediction (prognostic modeling)",
            "Population benchmarking (where does this patient sit relative to cohort)",
        ],
        "fusion_opportunity": (
            "qEEG enriches DeepTwin with brain-level information that no other modality provides. "
            "DeepTwin contextualizes qEEG findings within the full patient picture. "
            "Together they enable precision neuromodulation and personalized neurofeedback planning."
        ),
        "integration_method": "DeepTwin Fusion API — qEEG features ingested as neural state vectors",
        "clinical_value": "HIGH — brain-level data is unique qEEG contribution to digital twin",
    },
}


# ── Public API ────────────────────────────────────────────────────────────────


def get_cross_analyzer_context(
    patient_id: str,
    analysis_id: str,
    target_analyzer: str,
) -> dict[str, Any]:
    """Get relevant qEEG context for another analyzer.

    Returns structured context that other analyzers can use to interpret
    qEEG findings within their own domain.  All outputs carry the mandatory
    safety note that cross-analyzer correlations are temporal associations,
    not causal proof.

    Parameters
    ----------
    patient_id
        The patient identifier.
    analysis_id
        The qEEG analysis run identifier.
    target_analyzer
        One of: mri, biomarkers, medications, assessments, risk, deeptwin.

    Returns
    -------
    dict
        Structured context with relevance, contributions, fusion opportunities,
        and safety notes.
    """
    if target_analyzer not in FUSION_TARGETS:
        _log.warning("Unknown fusion target: %s", target_analyzer)
        return {
            "patient_id": patient_id,
            "qeeeg_analysis_id": analysis_id,
            "target_analyzer": target_analyzer,
            "error": f"Unknown analyzer: {target_analyzer}. "
            f"Supported: {', '.join(FUSION_TARGETS)}",
            "safety_note": "Cross-analyzer correlations are temporal associations, not causal proof.",
        }

    context = _CONTEXT_TEMPLATES.get(target_analyzer, {})

    return {
        "patient_id": patient_id,
        "qeeeg_analysis_id": analysis_id,
        "target_analyzer": target_analyzer,
        "fusion_relevance": context.get("relevance", ""),
        "qeeeg_contributes": context.get("qeeeg_contributes", []),
        f"{target_analyzer}_contributes": context.get(f"{target_analyzer}_contributes", []),
        "fusion_opportunity": context.get("fusion_opportunity", ""),
        "integration_method": context.get("integration_method", ""),
        "clinical_value": context.get("clinical_value", "UNKNOWN"),
        "safety_note": (
            "Cross-analyzer correlations are temporal associations, not causal proof. "
            "All findings require independent clinical validation."
        ),
        "governance_note": (
            "Data sharing across analyzers requires patient consent per FHIR R4 Consent resource. "
            "Audit trail maintained for all cross-analyzer queries."
        ),
    }


def list_fusion_targets() -> list[dict[str, str]]:
    """Return all supported fusion targets with descriptions."""
    return [
        {
            "target": target,
            "description": _CONTEXT_TEMPLATES[target]["relevance"][:200] + "...",
            "clinical_value": _CONTEXT_TEMPLATES[target].get("clinical_value", "UNKNOWN"),
        }
        for target in FUSION_TARGETS
    ]


# ── Re-exports ────────────────────────────────────────────────────────────────

__all__ = [
    "FUSION_TARGETS",
    "get_cross_analyzer_context",
    "list_fusion_targets",
]
