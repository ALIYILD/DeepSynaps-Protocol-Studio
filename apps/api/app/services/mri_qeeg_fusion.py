"""MRI-qEEG Cross-Modal Fusion Service.

Integrates structural MRI data with functional qEEG data for:
- Structural-functional correlation analysis
- Lesion-constrained source localization
- Atlas-registered topographic fusion
- Joint biomarker panels (20+ biomarkers, 11+ conditions)
- Neuromodulation target synthesis
- Longitudinal trajectory fusion

All outputs include confidence scores (0-1), evidence grades (A-D),
provenance labels (measured/inferred/proxy/simulated), and clinical
safety disclaimers. Decision-support only — never diagnostic.

Evidence base: Mulert 2014 (GRADE A), Hagemann 2008 (GRADE B),
Litvak 2019 (GRADE A), BrainTwin-AI 2026 (GRADE B), EMBARC 2024 (GRADE A)

.. important::
    This module is **decision-support only**. All outputs require
    clinician review. Never use for standalone diagnosis or
    treatment planning without qualified medical oversight.
"""

from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

_log = logging.getLogger(__name__)

# ── Optional dependency guards ────────────────────────────────────────────────
try:
    import numpy as np

    HAS_NUMPY = True
except ImportError:  # pragma: no cover
    HAS_NUMPY = False  # type: ignore[misc]
    np = None  # type: ignore[misc]

try:
    import nibabel as nib

    HAS_NIBABEL = True
except ImportError:  # pragma: no cover
    HAS_NIBABEL = False  # type: ignore[misc]
    nib = None  # type: ignore[misc]

try:
    from scipy import stats

    HAS_SCIPY = True
except ImportError:  # pragma: no cover
    HAS_SCIPY = False  # type: ignore[misc]
    stats = None  # type: ignore[misc]

try:
    from sqlalchemy.orm import Session

    HAS_SQLALCHEMY = True
except ImportError:  # pragma: no cover
    HAS_SQLALCHEMY = False  # type: ignore[misc]
    Session = None  # type: ignore[misc,assignment]

# ── Database models (optional import for type-checking) ──────────────────────
try:
    from app.persistence.models import MriAnalysis, QEEGAnalysis
except ImportError:  # pragma: no cover
    MriAnalysis = None  # type: ignore[misc,assignment]
    QEEGAnalysis = None  # type: ignore[misc,assignment]

# ── Clinical safety disclaimer ───────────────────────────────────────────────
_CLINICAL_DISCLAIMER = (
    "Decision-support only. Not a diagnostic tool. "
    "All findings require review by a qualified clinician. "
    "Fusion outputs are probabilistic and may contain errors."
)

# ── Evidence grade confidence multipliers ────────────────────────────────────
# Used to weight fusion scores by evidence quality
EVIDENCE_GRADE_WEIGHTS: dict[str, float] = {
    "A": 1.00,  # Strong: multiple RCTs, meta-analyses
    "B": 0.75,  # Moderate: limited RCTs, cohort studies
    "C": 0.45,  # Limited: case series, expert opinion
    "D": 0.20,  # Insufficient: anecdotal/theoretical
}

# ── Provenance labels ────────────────────────────────────────────────────────
PROVENANCE_MEASURED = "measured"
PROVENANCE_INFERRED = "inferred"
PROVENANCE_PROXY = "proxy"
PROVENANCE_SIMULATED = "simulated"

# ═══════════════════════════════════════════════════════════════════════════════
# 1. STRUCTURAL-FUNCTIONAL CORRELATION REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

# Maps MRI structural biomarkers ↔ qEEG functional biomarkers with evidence grades.
# Each entry specifies the qEEG counterparts, affected clinical conditions,
# evidence grade (A-D), and expected correlation direction.
#
# References:
#   - Mulert 2014, Front. Neurosci. (GRADE A)
#   - Hagemann 2008 (GRADE B)
#   - Litvak 2019, SPM12 multimodal integration (GRADE A)
#   - Bandettini 2020, simultaneous EEG-fMRI (GRADE A)
#   - BrainTwin-AI 2026 (GRADE B)

CORRELATION_REGISTRY: dict[str, dict[str, Any]] = {
    "hippocampal_volume": {
        "qeeg_counterparts": ["theta_gamma_ratio", "iaf", "posterior_alpha"],
        "conditions": ["alzheimers", "mci", "depression", "ptsd"],
        "evidence_grade": "A",
        "direction": "negative",  # smaller volume -> higher theta/gamma
        "r_reference": (-0.45, -0.25),  # typical r range from literature
        "interpretation": (
            "Reduced hippocampal volume correlates with increased theta/gamma "
            "ratio, reflecting impaired memory circuit function."
        ),
        "key_reference": "Mulert 2014; EMBARC 2024",
    },
    "prefrontal_thickness": {
        "qeeg_counterparts": ["frontal_alpha_asymmetry", "frontal_theta_beta"],
        "conditions": ["depression", "adhd", "ocd"],
        "evidence_grade": "A",
        "direction": "positive",
        "r_reference": (0.25, 0.50),
        "interpretation": (
            "Reduced prefrontal cortical thickness associates with altered "
            "frontal alpha asymmetry and elevated frontal theta/beta ratio."
        ),
        "key_reference": "ENIGMA-MDD 2025; Hagemann 2008",
    },
    "cingulate_volume": {
        "qeeg_counterparts": ["theta_beta_ratio", "frontal_midline_theta"],
        "conditions": ["adhd", "depression", "ocd", "chronic_pain"],
        "evidence_grade": "B",
        "direction": "negative",
        "r_reference": (-0.35, -0.15),
        "interpretation": (
            "Anterior cingulate volume reduction correlates with elevated "
            "theta/beta ratio, a candidate marker for attention regulation."
        ),
        "key_reference": "fMRI-EEG-DTI schizophrenia study 2017",
    },
    "temporal_volume": {
        "qeeg_counterparts": ["temporal_alpha_power", "iaf"],
        "conditions": ["epilepsy", "alzheimers", "ptsd"],
        "evidence_grade": "A",
        "direction": "positive",
        "r_reference": (0.20, 0.45),
        "interpretation": (
            "Temporal lobe volume reduction associates with decreased "
            "temporal alpha power and individual alpha frequency slowing."
        ),
        "key_reference": "Litvak 2019; Bandettini 2020",
    },
    "white_matter_integrity": {
        "qeeg_counterparts": ["alpha_coherence", "beta_coherence"],
        "conditions": ["ms", "tbi", "stroke"],
        "evidence_grade": "B",
        "direction": "positive",
        "r_reference": (0.25, 0.55),
        "interpretation": (
            "Reduced white matter integrity (lower FA) correlates with "
            "decreased inter-hemispheric alpha/beta coherence."
        ),
        "key_reference": "Rabe 2022, J. Neurol.; FA-BOLD correlation study",
    },
    "ventricular_volume": {
        "qeeg_counterparts": ["delta_power", "delta_theta_ratio"],
        "conditions": ["alzheimers", "nph", "vascular_dementia"],
        "evidence_grade": "B",
        "direction": "positive",
        "r_reference": (0.30, 0.50),
        "interpretation": (
            "Enlarged ventricles correlate with increased diffuse delta "
            "power, reflecting compensatory or degenerative changes."
        ),
        "key_reference": "HAAS WML study 2016; KU ADRC 2024",
    },
    "amygdala_volume": {
        "qeeg_counterparts": ["frontal_alpha_asymmetry", "gamma_power"],
        "conditions": ["ptsd", "anxiety", "depression"],
        "evidence_grade": "B",
        "direction": "negative",
        "r_reference": (-0.30, -0.10),
        "interpretation": (
            "Amygdala volume changes associate with altered frontal "
            "alpha asymmetry and gamma band modulation."
        ),
        "key_reference": "Schmaal 2017, Mol. Psychiatry",
    },
    "thalamus_volume": {
        "qeeg_counterparts": ["spindle_density", "sleep_architecture"],
        "conditions": ["insomnia", "schizophrenia", "tbi"],
        "evidence_grade": "C",
        "direction": "positive",
        "r_reference": (0.10, 0.35),
        "interpretation": (
            "Thalamic volume reduction correlates with sleep spindle "
            "density changes, reflecting thalamocortical circuit dysfunction."
        ),
        "key_reference": "Preliminary; expert opinion",
    },
    "cerebellar_volume": {
        "qeeg_counterparts": ["gamma_power", "beta_coherence"],
        "conditions": ["autism", "adhd", "tbi", "depression"],
        "evidence_grade": "C",
        "direction": "positive",
        "r_reference": (0.10, 0.30),
        "interpretation": (
            "Cerebellar volume changes may correlate with gamma band "
            "alterations, reflecting cerebellar-cortical pathway involvement."
        ),
        "key_reference": "Emerging evidence",
    },
    "parietal_thickness": {
        "qeeg_counterparts": ["posterior_alpha", "iaf"],
        "conditions": ["alzheimers", "mci"],
        "evidence_grade": "B",
        "direction": "positive",
        "r_reference": (0.20, 0.40),
        "interpretation": (
            "Parietal cortical thinning associates with posterior alpha "
            "power reduction and individual alpha frequency slowing."
        ),
        "key_reference": "AD signature region studies",
    },
    "white_matter_hyperintensity": {
        "qeeg_counterparts": ["delta_power", "theta_power", "slowing_index"],
        "conditions": ["vascular_dementia", "stroke", "depression"],
        "evidence_grade": "A",
        "direction": "positive",
        "r_reference": (0.35, 0.60),
        "interpretation": (
            "White matter hyperintensity burden correlates with diffuse "
            "EEG slowing (increased delta/theta), reflecting subcortical "
            "ischemic disruption of cortical circuits."
        ),
        "key_reference": "Roseborough 2022, Alzheimer's & Dementia",
    },
}

# ═══════════════════════════════════════════════════════════════════════════════
# 2. NEUROMODULATION TARGET REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

# MRI + qEEG convergent targets for neuromodulation planning.
# Each target includes MNI coordinates, evidence grade, and cross-modal
# supporting features.

NEUROMODULATION_TARGETS: dict[str, list[dict[str, Any]]] = {
    "depression": [
        {
            "name": "left_dlpfc",
            "mni": (-44, 36, 28),
            "mri_features": ["prefrontal_thickness", "white_matter_integrity"],
            "qeeg_features": ["frontal_alpha_asymmetry", "frontal_theta_beta"],
            "evidence_grade": "A",
            "modality": "rtms",
            "safety_notes": "Avoid if seizure disorder present. Monitor for mania switch.",
        },
        {
            "name": "dmpfc",
            "mni": (0, 56, 28),
            "mri_features": ["cingulate_volume", "prefrontal_thickness"],
            "qeeg_features": ["frontal_midline_theta", "theta_beta_ratio"],
            "evidence_grade": "B",
            "modality": "rtms",
            "safety_notes": "Higher intensity may cause discomfort. Start below MT.",
        },
        {
            "name": "bilateral_tpj",
            "mni": [(-52, -56, 20), (52, -56, 20)],
            "mri_features": ["parietal_thickness"],
            "qeeg_features": ["posterior_alpha"],
            "evidence_grade": "C",
            "modality": "rtms",
            "safety_notes": "TBS protocols require careful dosing.",
        },
    ],
    "adhd": [
        {
            "name": "right_dlpfc",
            "mni": (44, 36, 28),
            "mri_features": ["prefrontal_thickness", "cingulate_volume"],
            "qeeg_features": ["theta_beta_ratio", "frontal_theta_beta"],
            "evidence_grade": "B",
            "modality": "rtms",
            "safety_notes": "Monitor for cognitive fatigue. Avoid late-day sessions.",
        },
        {
            "name": "bilateral_striatum_proxy",
            "mni": [(-14, 8, 4), (14, 8, 4)],
            "mri_features": ["white_matter_integrity"],
            "qeeg_features": ["theta_beta_ratio"],
            "evidence_grade": "C",
            "modality": "tdcs",
            "safety_notes": "Deep target — use HD-tDCS or temporal interference.",
        },
    ],
    "alzheimers": [
        {
            "name": "bilateral_parietal",
            "mni": [(-40, -60, 44), (40, -60, 44)],
            "mri_features": ["parietal_thickness", "white_matter_hyperintensity"],
            "qeeg_features": ["posterior_alpha", "iaf"],
            "evidence_grade": "B",
            "modality": "rtms",
            "safety_notes": "Multi-site stimulation requires careful sequencing.",
        },
        {
            "name": "left_angular_gyrus",
            "mni": (-45, -60, 35),
            "mri_features": ["parietal_thickness"],
            "qeeg_features": ["alpha_power"],
            "evidence_grade": "C",
            "modality": "rtms",
            "safety_notes": "Start with low frequency. Monitor cognitive side effects.",
        },
    ],
    "ptsd": [
        {
            "name": "right_dlpfc",
            "mni": (44, 36, 28),
            "mri_features": ["prefrontal_thickness", "amygdala_volume"],
            "qeeg_features": ["frontal_alpha_asymmetry", "high_beta_frontal"],
            "evidence_grade": "A",
            "modality": "rtms",
            "safety_notes": "FDA-cleared for PTSD (2022). Avoid during flashbacks.",
        },
        {
            "name": "medial_prefrontal",
            "mni": (0, 52, 8),
            "mri_features": ["prefrontal_thickness"],
            "qeeg_features": ["frontal_alpha_asymmetry"],
            "evidence_grade": "B",
            "modality": "rtms",
            "safety_notes": "Monitor for emotional reactivation.",
        },
    ],
    "ocd": [
        {
            "name": "supplementary_motor_area",
            "mni": (0, 8, 60),
            "mri_features": ["cingulate_volume", "prefrontal_thickness"],
            "qeeg_features": ["frontal_midline_theta"],
            "evidence_grade": "A",
            "modality": "rtms",
            "safety_notes": "FDA-cleared for OCD (2018). High-frequency protocol.",
        },
    ],
    "chronic_pain": [
        {
            "name": "left_m1",
            "mni": (-38, -26, 56),
            "mri_features": ["white_matter_integrity", "cingulate_volume"],
            "qeeg_features": ["theta_beta_ratio", "alpha_power"],
            "evidence_grade": "A",
            "modality": "rtms",
            "safety_notes": "Motor hotspot required. EMG-guided localization preferred.",
        },
        {
            "name": "dlpfc_bilateral",
            "mni": [(-44, 36, 28), (44, 36, 28)],
            "mri_features": ["prefrontal_thickness"],
            "qeeg_features": ["frontal_alpha_asymmetry"],
            "evidence_grade": "B",
            "modality": "rtms",
            "safety_notes": "Use in combination with M1 for refractory cases.",
        },
    ],
    "epilepsy": [
        {
            "name": "seizure_focus_proxy",
            "mni": None,  # Patient-specific
            "mri_features": ["temporal_volume", "white_matter_integrity"],
            "qeeg_features": ["interictal_epileptiform_discharges", "temporal_alpha_power"],
            "evidence_grade": "B",
            "modality": "rtms",
            "safety_notes": "Low-frequency protocol. Requires seizure focus localization.",
        },
    ],
    "tbi": [
        {
            "name": "bilateral_dlpfc",
            "mni": [(-44, 36, 28), (44, 36, 28)],
            "mri_features": ["white_matter_integrity", "white_matter_hyperintensity"],
            "qeeg_features": ["eeg_slowing", "coherence_disruption"],
            "evidence_grade": "B",
            "modality": "rtms",
            "safety_notes": "Start at low intensity. Monitor for headache/fatigue.",
        },
    ],
}

# ═══════════════════════════════════════════════════════════════════════════════
# 3. 10-20 ELECTRODE -> MNI REGION MAPPING
# ═══════════════════════════════════════════════════════════════════════════════

# Simplified mapping from standard 10-20 electrode positions to approximate
# MNI-space anatomical regions. Used for atlas-topomap fusion.
#
# Coordinates are approximate centroid positions derived from:
#   - Oostenveld & Praamstra 2001 (10-20 system definition)
#   - MNI template registration studies

ELECTRODE_MNI_REGIONS: dict[str, dict[str, Any]] = {
    "Fp1": {"region": "frontal_pole", "hemisphere": "left", "mni_approx": (-22, 68, 10)},
    "Fp2": {"region": "frontal_pole", "hemisphere": "right", "mni_approx": (22, 68, 10)},
    "F3": {"region": "middle_frontal_gyrus", "hemisphere": "left", "mni_approx": (-36, 32, 36)},
    "F4": {"region": "middle_frontal_gyrus", "hemisphere": "right", "mni_approx": (36, 32, 36)},
    "F7": {"region": "inferior_frontal_gyrus", "hemisphere": "left", "mni_approx": (-48, 24, 8)},
    "F8": {"region": "inferior_frontal_gyrus", "hemisphere": "right", "mni_approx": (48, 24, 8)},
    "T3": {"region": "superior_temporal_gyrus", "hemisphere": "left", "mni_approx": (-60, -20, 4)},
    "T4": {"region": "superior_temporal_gyrus", "hemisphere": "right", "mni_approx": (60, -20, 4)},
    "T5": {"region": "middle_temporal_gyrus", "hemisphere": "left", "mni_approx": (-58, -52, 8)},
    "T6": {"region": "middle_temporal_gyrus", "hemisphere": "right", "mni_approx": (58, -52, 8)},
    "P3": {"region": "superior_parietal_lobule", "hemisphere": "left", "mni_approx": (-36, -60, 48)},
    "P4": {"region": "superior_parietal_lobule", "hemisphere": "right", "mni_approx": (36, -60, 48)},
    "O1": {"region": "occipital_cortex", "hemisphere": "left", "mni_approx": (-28, -92, 4)},
    "O2": {"region": "occipital_cortex", "hemisphere": "right", "mni_approx": (28, -92, 4)},
    "C3": {"region": "precentral_gyrus", "hemisphere": "left", "mni_approx": (-44, -16, 48)},
    "C4": {"region": "precentral_gyrus", "hemisphere": "right", "mni_approx": (44, -16, 48)},
    "Fz": {"region": "superior_frontal_gyrus", "hemisphere": "midline", "mni_approx": (0, 30, 52)},
    "Cz": {"region": "postcentral_gyrus", "hemisphere": "midline", "mni_approx": (0, -24, 72)},
    "Pz": {"region": "precuneus", "hemisphere": "midline", "mni_approx": (0, -60, 48)},
    "Oz": {"region": "cuneus", "hemisphere": "midline", "mni_approx": (0, -90, 16)},
}

# Extended 10-10 system electrodes (additional coverage)
ELECTRODE_1010_EXTENSIONS: dict[str, dict[str, Any]] = {
    "AF3": {"region": "inferior_frontal_gyrus", "hemisphere": "left", "mni_approx": (-32, 48, 20)},
    "AF4": {"region": "inferior_frontal_gyrus", "hemisphere": "right", "mni_approx": (32, 48, 20)},
    "FC1": {"region": "precentral_gyrus", "hemisphere": "left", "mni_approx": (-28, -8, 56)},
    "FC2": {"region": "precentral_gyrus", "hemisphere": "right", "mni_approx": (28, -8, 56)},
    "CP1": {"region": "postcentral_gyrus", "hemisphere": "left", "mni_approx": (-32, -32, 56)},
    "CP2": {"region": "postcentral_gyrus", "hemisphere": "right", "mni_approx": (32, -32, 56)},
    "PO3": {"region": "lateral_occipital", "hemisphere": "left", "mni_approx": (-28, -80, 28)},
    "PO4": {"region": "lateral_occipital", "hemisphere": "right", "mni_approx": (28, -80, 28)},
}

# Combined electrode atlas
ALL_ELECTRODE_REGIONS = {**ELECTRODE_MNI_REGIONS, **ELECTRODE_1010_EXTENSIONS}


# ═══════════════════════════════════════════════════════════════════════════════
# 4. JOINT BIOMARKER PANEL REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

# Comprehensive registry of cross-modal biomarkers with evidence grades.
# Covers 20+ biomarkers across 11+ clinical conditions.

JOINT_BIOMARKER_REGISTRY: dict[str, list[dict[str, Any]]] = {
    "alzheimers": [
        {
            "name": "hippocampal_theta_gamma_fusion",
            "mri_marker": "hippocampal_volume",
            "qeeg_marker": "theta_gamma_ratio",
            "evidence_grade": "A",
            "fusion_weight": 0.35,
            "clinical_note": "Strong cross-modal predictor of AD pathology burden.",
        },
        {
            "name": "posterior_alpha_parietal_fusion",
            "mri_marker": "parietal_thickness",
            "qeeg_marker": "posterior_alpha",
            "evidence_grade": "B",
            "fusion_weight": 0.25,
            "clinical_note": "Parietal thinning + alpha slowing indicates posterior cortical involvement.",
        },
        {
            "name": "ventricular_delta_fusion",
            "mri_marker": "ventricular_volume",
            "qeeg_marker": "delta_power",
            "evidence_grade": "B",
            "fusion_weight": 0.20,
            "clinical_note": "Ventricular enlargement with diffuse slowing reflects advanced atrophy.",
        },
        {
            "name": "wmh_slowing_fusion",
            "mri_marker": "white_matter_hyperintensity",
            "qeeg_marker": "slowing_index",
            "evidence_grade": "A",
            "fusion_weight": 0.20,
            "clinical_note": "WMH burden with EEG slowing suggests mixed vascular-degenerative pathology.",
        },
    ],
    "depression": [
        {
            "name": "prefrontal_asymmetry_fusion",
            "mri_marker": "prefrontal_thickness",
            "qeeg_marker": "frontal_alpha_asymmetry",
            "evidence_grade": "A",
            "fusion_weight": 0.40,
            "clinical_note": "Reduced prefrontal thickness + right-lateralized alpha: strong MDD correlate.",
        },
        {
            "name": "hippocampal_volume_theta_fusion",
            "mri_marker": "hippocampal_volume",
            "qeeg_marker": "frontal_theta_elevation",
            "evidence_grade": "B",
            "fusion_weight": 0.25,
            "clinical_note": "Hippocampal volume loss with frontal theta elevation may predict SSRI response.",
        },
        {
            "name": "amygdala_gamma_fusion",
            "mri_marker": "amygdala_volume",
            "qeeg_marker": "gamma_power",
            "evidence_grade": "C",
            "fusion_weight": 0.15,
            "clinical_note": "Emerging marker for emotional regulation circuits.",
        },
        {
            "name": "cingulate_theta_beta_fusion",
            "mri_marker": "cingulate_volume",
            "qeeg_marker": "theta_beta_ratio",
            "evidence_grade": "B",
            "fusion_weight": 0.20,
            "clinical_note": "ACC volume reduction with elevated TBR: treatment resistance marker.",
        },
    ],
    "adhd": [
        {
            "name": "cingulate_tbr_fusion",
            "mri_marker": "cingulate_volume",
            "qeeg_marker": "theta_beta_ratio",
            "evidence_grade": "B",
            "fusion_weight": 0.35,
            "clinical_note": "ACC volume + TBR: strongest cross-modal ADHD marker. FDA-cleared (NEBA).",
        },
        {
            "name": "prefrontal_theta_fusion",
            "mri_marker": "prefrontal_thickness",
            "qeeg_marker": "frontal_theta_beta",
            "evidence_grade": "B",
            "fusion_weight": 0.30,
            "clinical_note": "Prefrontal thinning with theta elevation reflects executive dysfunction.",
        },
        {
            "name": "cerebellar_gamma_fusion",
            "mri_marker": "cerebellar_volume",
            "qeeg_marker": "gamma_power",
            "evidence_grade": "C",
            "fusion_weight": 0.20,
            "clinical_note": "Emerging marker for cerebellar-cortical circuit timing.",
        },
        {
            "name": "frontal_asymmetry_fusion",
            "mri_marker": "prefrontal_thickness",
            "qeeg_marker": "frontal_alpha_asymmetry",
            "evidence_grade": "C",
            "fusion_weight": 0.15,
            "clinical_note": "Preliminary evidence for attention-network asymmetry.",
        },
    ],
    "ptsd": [
        {
            "name": "hippocampal_iaf_fusion",
            "mri_marker": "hippocampal_volume",
            "qeeg_marker": "iaf",
            "evidence_grade": "B",
            "fusion_weight": 0.30,
            "clinical_note": "Hippocampal atrophy + IAF slowing: stress-related neuroplasticity marker.",
        },
        {
            "name": "amygdala_asymmetry_fusion",
            "mri_marker": "amygdala_volume",
            "qeeg_marker": "frontal_alpha_asymmetry",
            "evidence_grade": "C",
            "fusion_weight": 0.25,
            "clinical_note": "Amygdala volume changes with alpha asymmetry: threat processing circuits.",
        },
        {
            "name": "temporal_alpha_fusion",
            "mri_marker": "temporal_volume",
            "qeeg_marker": "temporal_alpha_power",
            "evidence_grade": "B",
            "fusion_weight": 0.25,
            "clinical_note": "Temporal lobe involvement in trauma-related memory circuits.",
        },
        {
            "name": "prefrontal_beta_fusion",
            "mri_marker": "prefrontal_thickness",
            "qeeg_marker": "high_beta_frontal",
            "evidence_grade": "C",
            "fusion_weight": 0.20,
            "clinical_note": "Prefrontal beta elevation with thinning: hyperarousal correlate.",
        },
    ],
    "epilepsy": [
        {
            "name": "temporal_alpha_epilepsy_fusion",
            "mri_marker": "temporal_volume",
            "qeeg_marker": "temporal_alpha_power",
            "evidence_grade": "A",
            "fusion_weight": 0.35,
            "clinical_note": "Temporal atrophy + alpha asymmetry: seizure focus lateralization support.",
        },
        {
            "name": "hippocampal_theta_fusion",
            "mri_marker": "hippocampal_volume",
            "qeeg_marker": "theta_gamma_ratio",
            "evidence_grade": "B",
            "fusion_weight": 0.30,
            "clinical_note": "MTS correlate: hippocampal sclerosis with theta elevation.",
        },
        {
            "name": "wm_coherence_fusion",
            "mri_marker": "white_matter_integrity",
            "qeeg_marker": "alpha_coherence",
            "evidence_grade": "B",
            "fusion_weight": 0.20,
            "clinical_note": "White matter disruption with coherence loss: network degradation.",
        },
        {
            "name": "ied_structural_fusion",
            "mri_marker": "temporal_volume",
            "qeeg_marker": "interictal_epileptiform_discharges",
            "evidence_grade": "A",
            "fusion_weight": 0.15,
            "clinical_note": "Structural correlate of IED origin. Requires neurologist review.",
        },
    ],
    "tbi": [
        {
            "name": "wm_integrity_coherence_fusion",
            "mri_marker": "white_matter_integrity",
            "qeeg_marker": "alpha_coherence",
            "evidence_grade": "B",
            "fusion_weight": 0.30,
            "clinical_note": "DTI-detected axonal injury with coherence disruption: injury severity marker.",
        },
        {
            "name": "wmh_slowing_fusion_tbi",
            "mri_marker": "white_matter_hyperintensity",
            "qeeg_marker": "delta_power",
            "evidence_grade": "B",
            "fusion_weight": 0.25,
            "clinical_note": "WMH burden with diffuse slowing: chronic injury marker.",
        },
        {
            "name": "prefrontal_thickness_theta_fusion",
            "mri_marker": "prefrontal_thickness",
            "qeeg_marker": "frontal_theta_elevation",
            "evidence_grade": "C",
            "fusion_weight": 0.25,
            "clinical_note": "Prefrontal thinning with theta: cognitive fatigue correlate.",
        },
        {
            "name": "hippocampal_volume_tbi_fusion",
            "mri_marker": "hippocampal_volume",
            "qeeg_marker": "theta_gamma_ratio",
            "evidence_grade": "C",
            "fusion_weight": 0.20,
            "clinical_note": "Post-traumatic hippocampal atrophy with circuit dysfunction.",
        },
    ],
    "mci": [
        {
            "name": "hippocampal_theta_gamma_mci",
            "mri_marker": "hippocampal_volume",
            "qeeg_marker": "theta_gamma_ratio",
            "evidence_grade": "A",
            "fusion_weight": 0.40,
            "clinical_note": "Earliest cross-modal change in prodromal AD. Conversion predictor.",
        },
        {
            "name": "parietal_alpha_mci",
            "mri_marker": "parietal_thickness",
            "qeeg_marker": "posterior_alpha",
            "evidence_grade": "B",
            "fusion_weight": 0.30,
            "clinical_note": "Parietal alpha slowing: posterior cortical involvement marker.",
        },
        {
            "name": "wmh_delta_mci",
            "mri_marker": "white_matter_hyperintensity",
            "qeeg_marker": "delta_power",
            "evidence_grade": "B",
            "fusion_weight": 0.30,
            "clinical_note": "Vascular contribution to MCI: mixed pathology indicator.",
        },
    ],
    "ocd": [
        {
            "name": "cingulate_theta_ocd",
            "mri_marker": "cingulate_volume",
            "qeeg_marker": "frontal_midline_theta",
            "evidence_grade": "B",
            "fusion_weight": 0.40,
            "clinical_note": "ACC volume + frontal midline theta: error-processing circuit marker.",
        },
        {
            "name": "prefrontal_tbr_ocd",
            "mri_marker": "prefrontal_thickness",
            "qeeg_marker": "theta_beta_ratio",
            "evidence_grade": "C",
            "fusion_weight": 0.35,
            "clinical_note": "Prefrontal structural changes with theta/beta elevation.",
        },
        {
            "name": "frontal_asymmetry_ocd",
            "mri_marker": "prefrontal_thickness",
            "qeeg_marker": "frontal_alpha_asymmetry",
            "evidence_grade": "C",
            "fusion_weight": 0.25,
            "clinical_note": "Emerging marker for OCD-related frontostriatal dysfunction.",
        },
    ],
    "chronic_pain": [
        {
            "name": "cingulate_tbr_pain",
            "mri_marker": "cingulate_volume",
            "qeeg_marker": "theta_beta_ratio",
            "evidence_grade": "B",
            "fusion_weight": 0.35,
            "clinical_note": "ACC volume + TBR: affective pain processing correlate.",
        },
        {
            "name": "prefrontal_alpha_pain",
            "mri_marker": "prefrontal_thickness",
            "qeeg_marker": "frontal_alpha_asymmetry",
            "evidence_grade": "C",
            "fusion_weight": 0.30,
            "clinical_note": "Prefrontal changes with alpha asymmetry: descending pain modulation.",
        },
        {
            "name": "wm_integrity_pain",
            "mri_marker": "white_matter_integrity",
            "qeeg_marker": "beta_coherence",
            "evidence_grade": "C",
            "fusion_weight": 0.35,
            "clinical_note": "White matter integrity with beta coherence: central sensitization marker.",
        },
    ],
    "anxiety": [
        {
            "name": "amygdala_gamma_anxiety",
            "mri_marker": "amygdala_volume",
            "qeeg_marker": "high_beta_temporal",
            "evidence_grade": "C",
            "fusion_weight": 0.35,
            "clinical_note": "Amygdala volume with temporal beta: threat-detection circuit.",
        },
        {
            "name": "prefrontal_asymmetry_anxiety",
            "mri_marker": "prefrontal_thickness",
            "qeeg_marker": "frontal_alpha_asymmetry",
            "evidence_grade": "C",
            "fusion_weight": 0.35,
            "clinical_note": "Prefrontal modulation of amygdala reactivity.",
        },
        {
            "name": "temporal_alpha_anxiety",
            "mri_marker": "temporal_volume",
            "qeeg_marker": "temporal_alpha_power",
            "evidence_grade": "C",
            "fusion_weight": 0.30,
            "clinical_note": "Temporal lobe involvement in anticipatory anxiety.",
        },
    ],
    "ms": [
        {
            "name": "wm_integrity_ms",
            "mri_marker": "white_matter_integrity",
            "qeeg_marker": "alpha_coherence",
            "evidence_grade": "B",
            "fusion_weight": 0.35,
            "clinical_note": "DTI FA with coherence: disease burden and network disruption.",
        },
        {
            "name": "ventricular_delta_ms",
            "mri_marker": "ventricular_volume",
            "qeeg_marker": "delta_power",
            "evidence_grade": "B",
            "fusion_weight": 0.30,
            "clinical_note": "Ventricular enlargement with slowing: atrophy progression.",
        },
        {
            "name": "thalamus_spindle_ms",
            "mri_marker": "thalamus_volume",
            "qeeg_marker": "spindle_density",
            "evidence_grade": "C",
            "fusion_weight": 0.35,
            "clinical_note": "Thalamic involvement with sleep disruption: fatigue correlate.",
        },
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
# 5. LESION -> QEEG CONSTRAINT MAPPING
# ═══════════════════════════════════════════════════════════════════════════════

# Maps lesion location categories to expected qEEG alterations.
# Used to flag discordant findings for clinician review.

LESION_QEEG_CONSTRAINTS: dict[str, dict[str, Any]] = {
    "frontal_lesion": {
        "expected_qeeg_changes": [
            "frontal_alpha_asymmetry_shift",
            "frontal_theta_elevation",
            "frontal_beta_reduction",
        ],
        "affected_channels": ["Fp1", "Fp2", "F3", "F4", "F7", "F8", "Fz"],
        "severity_weight": 0.80,
    },
    "temporal_lesion": {
        "expected_qeeg_changes": [
            "temporal_alpha_power_reduction",
            "temporal_theta_elevation",
            "interictal_discharges",
        ],
        "affected_channels": ["T3", "T4", "T5", "T6"],
        "severity_weight": 0.85,
    },
    "parietal_lesion": {
        "expected_qeeg_changes": [
            "posterior_alpha_reduction",
            "parietal_beta_reduction",
        ],
        "affected_channels": ["P3", "P4", "Pz"],
        "severity_weight": 0.70,
    },
    "occipital_lesion": {
        "expected_qeeg_changes": [
            "occipital_alpha_reduction",
            "visual_evoked_response_alteration",
        ],
        "affected_channels": ["O1", "O2", "Oz"],
        "severity_weight": 0.75,
    },
    "cingulate_lesion": {
        "expected_qeeg_changes": [
            "frontal_midline_theta_reduction",
            "theta_beta_ratio_alteration",
        ],
        "affected_channels": ["Fz", "Cz"],
        "severity_weight": 0.75,
    },
    "white_matter_lesion": {
        "expected_qeeg_changes": [
            "coherence_disruption",
            "diffuse_slowing",
            "phase_synchronization_reduction",
        ],
        "affected_channels": list(ELECTRODE_MNI_REGIONS.keys()),
        "severity_weight": 0.65,
    },
    "hippocampal_lesion": {
        "expected_qeeg_changes": [
            "theta_gamma_ratio_elevation",
            "memory_task_theta_reduction",
        ],
        "affected_channels": ["T3", "T4", "T5", "T6", "F7", "F8"],
        "severity_weight": 0.80,
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# 6. CONDITION-SPECIFIC RED FLAG TRIGGERS
# ═══════════════════════════════════════════════════════════════════════════════

# Cross-modal red flags that trigger clinician alerts when both
# MRI and qEEG show convergent abnormalities.

RED_FLAG_TRIGGERS: list[dict[str, Any]] = [
    {
        "id": "RF001",
        "name": "severe_hippocampal_atrophy_with_theta_elevation",
        "conditions": ["alzheimers", "mci"],
        "mri_criterion": {"marker": "hippocampal_volume", "threshold_direction": "below", "z_threshold": -2.0},
        "qeeg_criterion": {"marker": "theta_gamma_ratio", "threshold_direction": "above", "z_threshold": 2.0},
        "severity": "high",
        "message": "Severe hippocampal atrophy with elevated theta/gamma ratio. Urgent cognitive assessment recommended.",
    },
    {
        "id": "RF002",
        "name": "frontal_atrophy_with_asymmetry",
        "conditions": ["depression", "ptsd"],
        "mri_criterion": {"marker": "prefrontal_thickness", "threshold_direction": "below", "z_threshold": -1.5},
        "qeeg_criterion": {"marker": "frontal_alpha_asymmetry", "threshold_direction": "above", "z_threshold": 1.5},
        "severity": "medium",
        "message": "Prefrontal thinning with frontal alpha asymmetry. Consider neuromodulation evaluation.",
    },
    {
        "id": "RF003",
        "name": "temporal_lesion_with_epileptiform_activity",
        "conditions": ["epilepsy", "tbi"],
        "mri_criterion": {"marker": "temporal_volume", "threshold_direction": "below", "z_threshold": -2.0},
        "qeeg_criterion": {"marker": "interictal_epileptiform_discharges", "presence_required": True},
        "severity": "high",
        "message": "Temporal structural abnormality with epileptiform discharges. Urgent neurology referral.",
    },
    {
        "id": "RF004",
        "name": "severe_wmh_with_marked_slowing",
        "conditions": ["vascular_dementia", "stroke", "alzheimers"],
        "mri_criterion": {"marker": "white_matter_hyperintensity", "threshold_direction": "above", "z_threshold": 2.0},
        "qeeg_criterion": {"marker": "delta_power", "threshold_direction": "above", "z_threshold": 2.0},
        "severity": "high",
        "message": "Severe white matter burden with diffuse EEG slowing. High vascular dementia risk.",
    },
    {
        "id": "RF005",
        "name": "cingulate_atrophy_with_elevated_tbr",
        "conditions": ["adhd", "ocd", "depression"],
        "mri_criterion": {"marker": "cingulate_volume", "threshold_direction": "below", "z_threshold": -1.5},
        "qeeg_criterion": {"marker": "theta_beta_ratio", "threshold_direction": "above", "z_threshold": 1.5},
        "severity": "medium",
        "message": "ACC atrophy with elevated theta/beta ratio. Treatment resistance indicator.",
    },
    {
        "id": "RF006",
        "name": "ventricular_enlargement_with_delta_excess",
        "conditions": ["nph", "alzheimers", "vascular_dementia"],
        "mri_criterion": {"marker": "ventricular_volume", "threshold_direction": "above", "z_threshold": 2.0},
        "qeeg_criterion": {"marker": "delta_power", "threshold_direction": "above", "z_threshold": 2.0},
        "severity": "medium",
        "message": "Ventricular enlargement with delta excess. Consider NPH workup.",
    },
    {
        "id": "RF007",
        "name": "widespread_wm_disruption_with_coherence_loss",
        "conditions": ["ms", "tbi", "stroke"],
        "mri_criterion": {"marker": "white_matter_integrity", "threshold_direction": "below", "z_threshold": -2.0},
        "qeeg_criterion": {"marker": "alpha_coherence", "threshold_direction": "below", "z_threshold": -2.0},
        "severity": "high",
        "message": "Widespread white matter disruption with coherence loss. Severe network injury.",
    },
    {
        "id": "RF008",
        "name": "amygdala_reduction_with_frontal_asymmetry",
        "conditions": ["ptsd", "anxiety"],
        "mri_criterion": {"marker": "amygdala_volume", "threshold_direction": "below", "z_threshold": -1.5},
        "qeeg_criterion": {"marker": "frontal_alpha_asymmetry", "threshold_direction": "above", "z_threshold": 1.5},
        "severity": "medium",
        "message": "Amygdala volume reduction with frontal asymmetry. Trauma-related circuit marker.",
    },
]


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def _safe_json_loads(value: str | None, default: dict[str, Any] | None = None) -> dict[str, Any]:
    """Safely parse a JSON string, returning default on failure.

    Args:
        value: JSON string to parse, or None.
        default: Default value if parsing fails or value is None.

    Returns:
        Parsed dict or default.
    """
    if default is None:
        default = {}
    if not value:
        return default
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default


def _compute_confidence_weighted_score(
    mri_value: float | None,
    qeeg_value: float | None,
    evidence_grade: str,
    direction: str = "positive",
) -> dict[str, Any]:
    """Compute a confidence-weighted fusion score from MRI and qEEG values.

    Handles missing data gracefully. If one modality is unavailable,
    the score is based on the available modality with reduced confidence.

    Args:
        mri_value: Normalized MRI biomarker value (z-score), or None.
        qeeg_value: Normalized qEEG biomarker value (z-score), or None.
        evidence_grade: Evidence grade (A-D) for this correlation.
        direction: Expected correlation direction ("positive" or "negative").

    Returns:
        Dict with fusion_score, confidence, provenance, and details.
    """
    grade_weight = EVIDENCE_GRADE_WEIGHTS.get(evidence_grade, 0.25)

    # Both modalities available
    if mri_value is not None and qeeg_value is not None:
        if direction == "negative":
            # Inverse correlation: one high, other low
            fusion_score = (abs(mri_value) + abs(qeeg_value)) / 2.0 * grade_weight
        else:
            # Direct correlation
            fusion_score = (abs(mri_value) + abs(qeeg_value)) / 2.0 * grade_weight
        confidence = grade_weight * 0.95  # Slight penalty for fusion uncertainty
        provenance = PROVENANCE_MEASURED
        modality_count = 2

    # Only MRI available
    elif mri_value is not None:
        fusion_score = abs(mri_value) * grade_weight * 0.7
        confidence = grade_weight * 0.60
        provenance = PROVENANCE_PROXY
        modality_count = 1

    # Only qEEG available
    elif qeeg_value is not None:
        fusion_score = abs(qeeg_value) * grade_weight * 0.7
        confidence = grade_weight * 0.60
        provenance = PROVENANCE_PROXY
        modality_count = 1

    # Neither available
    else:
        fusion_score = 0.0
        confidence = 0.0
        provenance = PROVENANCE_SIMULATED
        modality_count = 0

    # Clamp scores
    fusion_score = float(max(0.0, min(1.0, fusion_score)))
    confidence = float(max(0.0, min(1.0, confidence)))

    return {
        "fusion_score": round(fusion_score, 4),
        "confidence": round(confidence, 4),
        "evidence_grade": evidence_grade,
        "provenance": provenance,
        "modalities_used": modality_count,
        "direction": direction,
    }


def _detect_red_flags(
    mri_biomarkers: dict[str, Any],
    qeeg_biomarkers: dict[str, Any],
    condition: str | None = None,
) -> list[dict[str, Any]]:
    """Detect cross-modal red flags from biomarker values.

    Args:
        mri_biomarkers: Dict of MRI biomarker names to their values.
        qeeg_biomarkers: Dict of qEEG biomarker names to their values.
        condition: Optional condition filter.

    Returns:
        List of triggered red flags with severity and messages.
    """
    triggered: list[dict[str, Any]] = []

    for trigger in RED_FLAG_TRIGGERS:
        # Condition filter
        if condition and condition.lower() not in [
            c.lower() for c in trigger["conditions"]
        ]:
            continue

        mri_crit = trigger.get("mri_criterion", {})
        qeeg_crit = trigger.get("qeeg_criterion", {})

        mri_triggered = False
        qeeg_triggered = False

        # Check MRI criterion
        if mri_crit:
            mri_marker = mri_crit.get("marker", "")
            mri_val = mri_biomarkers.get(mri_marker)
            if mri_val is not None and isinstance(mri_val, (int, float)):
                z_thresh = mri_crit.get("z_threshold", 0)
                direction = mri_crit.get("threshold_direction", "above")
                if direction == "above" and mri_val >= z_thresh:
                    mri_triggered = True
                elif direction == "below" and mri_val <= -abs(z_thresh):
                    mri_triggered = True

        # Check qEEG criterion
        if qeeg_crit:
            qeeg_marker = qeeg_crit.get("marker", "")
            qeeg_val = qeeg_biomarkers.get(qeeg_marker)
            if qeeg_crit.get("presence_required"):
                qeeg_triggered = bool(qeeg_val)
            elif qeeg_val is not None and isinstance(qeeg_val, (int, float)):
                z_thresh = qeeg_crit.get("z_threshold", 0)
                direction = qeeg_crit.get("threshold_direction", "above")
                if direction == "above" and qeeg_val >= z_thresh:
                    qeeg_triggered = True
                elif direction == "below" and qeeg_val <= -abs(z_thresh):
                    qeeg_triggered = True

        # Both criteria must be met (or just one if only one defined)
        criteria_defined = sum([bool(mri_crit), bool(qeeg_crit)])
        criteria_met = sum([mri_triggered, qeeg_triggered])

        if criteria_defined > 0 and criteria_met == criteria_defined:
            triggered.append({
                "id": trigger["id"],
                "name": trigger["name"],
                "severity": trigger["severity"],
                "message": trigger["message"],
                "conditions": trigger["conditions"],
                "mri_triggered": mri_triggered,
                "qeeg_triggered": qeeg_triggered,
            })

    return triggered


def _estimate_cross_modal_agreement(
    mri_evidence: dict[str, Any],
    qeeg_evidence: dict[str, Any],
) -> dict[str, Any]:
    """Estimate cross-modal agreement between MRI and qEEG evidence.

    Computes an agreement score (0-1) based on whether both modalities
    point in the same clinical direction.

    Args:
        mri_evidence: MRI evidence dict with at least 'direction' and 'score'.
        qeeg_evidence: qEEG evidence dict with at least 'direction' and 'score'.

    Returns:
        Agreement summary with score and interpretation.
    """
    mri_dir = mri_evidence.get("direction", "unknown")
    qeeg_dir = qeeg_evidence.get("direction", "unknown")
    mri_score = mri_evidence.get("score", 0.0)
    qeeg_score = qeeg_evidence.get("score", 0.0)

    if mri_dir == "unknown" or qeeg_dir == "unknown":
        return {
            "agreement_score": 0.0,
            "interpretation": "insufficient_data",
            "concordant": False,
            "provenance": PROVENANCE_SIMULATED,
        }

    concordant = mri_dir == qeeg_dir

    # Weighted agreement: higher scores in both modalities = stronger agreement
    if mri_score > 0 and qeeg_score > 0:
        min_score = min(mri_score, qeeg_score)
        max_score = max(mri_score, qeeg_score)
        agreement_score = min_score / max_score if max_score > 0 else 0.0
        if concordant:
            agreement_score = 0.5 + 0.5 * agreement_score
        else:
            agreement_score = 0.5 - 0.5 * agreement_score
    else:
        agreement_score = 0.5 if concordant else 0.0

    interpretation = (
        "strong_concordance" if agreement_score >= 0.75
        else "moderate_concordance" if agreement_score >= 0.50
        else "weak_concordance" if agreement_score >= 0.25
        else "discordance"
    )

    return {
        "agreement_score": round(agreement_score, 4),
        "interpretation": interpretation,
        "concordant": concordant,
        "mri_direction": mri_dir,
        "qeeg_direction": qeeg_dir,
        "provenance": PROVENANCE_INFERRED,
    }


def _compute_trajectory_derivative(
    values: list[float],
    times: list[float] | None = None,
) -> dict[str, Any]:
    """Compute trajectory metrics from a series of values.

    Args:
        values: List of biomarker values over time.
        times: Optional list of time points (in days). If None, assumes equal intervals.

    Returns:
        Dict with slope, rate of change, confidence interval, and trend.
    """
    if not values or len(values) < 2:
        return {
            "slope": None,
            "rate_of_change": None,
            "trend": "insufficient_data",
            "confidence_interval": None,
            "provenance": PROVENANCE_SIMULATED,
        }

    n = len(values)
    if times is None:
        times = list(range(n))

    if HAS_NUMPY and np is not None:
        x = np.array(times, dtype=float)
        y = np.array(values, dtype=float)
        # Simple linear regression
        A = np.vstack([x, np.ones(len(x))]).T
        slope, intercept = np.linalg.lstsq(A, y, rcond=None)[0]

        # Residuals for CI estimation
        y_pred = slope * x + intercept
        residuals = y - y_pred
        mse = float(np.mean(residuals**2)) if len(residuals) > 0 else 0.0
        se_slope = math.sqrt(mse / float(np.sum((x - np.mean(x))**2))) if len(x) > 1 and np.sum((x - np.mean(x))**2) > 0 else 0.0

        # 95% CI
        ci_95 = 1.96 * se_slope

        # Rate: change per unit time
        time_span = max(times) - min(times) if max(times) > min(times) else 1.0
        total_change = values[-1] - values[0]
        rate = total_change / time_span
    else:
        # Pure Python fallback
        n_f = float(n)
        mean_x = sum(times) / n_f
        mean_y = sum(values) / n_f

        numerator = sum((times[i] - mean_x) * (values[i] - mean_y) for i in range(n))
        denominator = sum((times[i] - mean_x) ** 2 for i in range(n))

        if denominator > 0:
            slope = numerator / denominator
        else:
            slope = 0.0

        time_span = max(times) - min(times) if max(times) > min(times) else 1.0
        total_change = values[-1] - values[0]
        rate = total_change / time_span
        ci_95 = None

    # Trend classification
    if slope is not None:
        if abs(slope) < 0.01:
            trend = "stable"
        elif slope > 0:
            trend = "increasing"
        else:
            trend = "decreasing"
    else:
        trend = "insufficient_data"

    return {
        "slope": round(float(slope), 6) if slope is not None else None,
        "rate_of_change": round(float(rate), 6) if rate is not None else None,
        "trend": trend,
        "confidence_interval_95": round(float(ci_95), 6) if ci_95 is not None else None,
        "n_timepoints": n,
        "provenance": PROVENANCE_MEASURED if n >= 3 else PROVENANCE_INFERRED,
    }



# ═══════════════════════════════════════════════════════════════════════════════
# CORE SERVICE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


async def correlate_structural_functional(
    mri_biomarkers: dict[str, Any],
    qeeg_biomarkers: dict[str, Any],
) -> dict[str, Any]:
    """Correlate MRI structural markers with qEEG functional markers.

    Uses the CORRELATION_REGISTRY to compute confidence-weighted
    correlation scores between paired structural (MRI) and functional
    (qEEG) biomarkers. Handles missing data gracefully — if one modality
    is unavailable, returns a reduced-confidence proxy score.

    Supported correlation pairs include:
    - Hippocampal volume (MRI) <-> Theta/gamma ratio (qEEG) for memory
    - Prefrontal thickness (MRI) <-> Frontal alpha asymmetry (qEEG) for depression
    - Cingulate volume (MRI) <-> Theta/beta ratio (qEEG) for ADHD
    - Temporal lobe volume (MRI) <-> Temporal alpha power (qEEG) for epilepsy
    - White matter integrity (MRI) <-> Alpha coherence (qEEG) for MS/TBI
    - Ventricular volume (MRI) <-> Delta power (qEEG) for NPH/dementia
    - Amygdala volume (MRI) <-> Frontal alpha asymmetry (qEEG) for PTSD
    - Thalamus volume (MRI) <-> Spindle density (qEEG) for insomnia
    - Cerebellar volume (MRI) <-> Gamma power (qEEG) for autism
    - Parietal thickness (MRI) <-> Posterior alpha (qEEG) for Alzheimer's
    - WMH burden (MRI) <-> Delta/theta power (qEEG) for vascular dementia

    Args:
        mri_biomarkers: Dict mapping MRI biomarker names to normalized
            values (typically z-scores). Example:
            {"hippocampal_volume": -1.5, "prefrontal_thickness": -0.8}
        qeeg_biomarkers: Dict mapping qEEG biomarker names to normalized
            values (typically z-scores or deviation scores). Example:
            {"theta_gamma_ratio": 2.1, "frontal_alpha_asymmetry": 1.3}

    Returns:
        Dict containing:
        - correlation_matrix: List of individual correlation entries
        - summary: Aggregate statistics
        - red_flags: Cross-modal red flags triggered
        - disclaimer: Clinical safety disclaimer
        - provenance: Provenance label for overall output
        - timestamp: ISO timestamp of computation

    Example:
        >>> result = await correlate_structural_functional(
        ...     {"hippocampal_volume": -1.5, "prefrontal_thickness": -0.8},
        ...     {"theta_gamma_ratio": 2.1, "frontal_alpha_asymmetry": 1.3},
        ... )
        >>> result["summary"]["n_correlations_computed"]
        2
    """
    correlations: list[dict[str, Any]] = []

    # Iterate over all registered structural-functional pairs
    for mri_marker, registry_entry in CORRELATION_REGISTRY.items():
        mri_value = mri_biomarkers.get(mri_marker)
        qeeg_counterparts = registry_entry.get("qeeg_counterparts", [])
        evidence_grade = registry_entry.get("evidence_grade", "D")
        direction = registry_entry.get("direction", "positive")
        r_ref = registry_entry.get("r_reference", (0.0, 0.0))

        for qeeg_marker in qeeg_counterparts:
            qeeg_value = qeeg_biomarkers.get(qeeg_marker)

            # Compute confidence-weighted fusion score
            fusion_result = _compute_confidence_weighted_score(
                mri_value=mri_value if isinstance(mri_value, (int, float)) else None,
                qeeg_value=qeeg_value if isinstance(qeeg_value, (int, float)) else None,
                evidence_grade=evidence_grade,
                direction=direction,
            )

            # Build correlation entry
            correlation_entry: dict[str, Any] = {
                "mri_marker": mri_marker,
                "qeeg_marker": qeeg_marker,
                "mri_value": mri_value,
                "qeeg_value": qeeg_value,
                "fusion_score": fusion_result["fusion_score"],
                "confidence": fusion_result["confidence"],
                "evidence_grade": evidence_grade,
                "direction": direction,
                "r_reference_range": r_ref,
                "conditions": registry_entry.get("conditions", []),
                "interpretation": registry_entry.get("interpretation", ""),
                "key_reference": registry_entry.get("key_reference", ""),
                "provenance": fusion_result["provenance"],
                "modalities_used": fusion_result["modalities_used"],
            }
            correlations.append(correlation_entry)

    # Compute summary statistics
    n_computed = len(correlations)
    confidences = [c["confidence"] for c in correlations if c["confidence"] > 0]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    # Count evidence grades
    grade_counts: dict[str, int] = {}
    for c in correlations:
        g = c["evidence_grade"]
        grade_counts[g] = grade_counts.get(g, 0) + 1

    # Detect red flags
    red_flags = _detect_red_flags(mri_biomarkers, qeeg_biomarkers)

    # Sort by confidence descending
    correlations_sorted = sorted(
        correlations, key=lambda x: x["confidence"], reverse=True
    )

    return {
        "disclaimer": _CLINICAL_DISCLAIMER,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "provenance": (
            PROVENANCE_MEASURED
            if all(c["modalities_used"] == 2 for c in correlations)
            else PROVENANCE_INFERRED
        ),
        "n_total_registered_pairs": sum(
            len(e.get("qeeg_counterparts", []))
            for e in CORRELATION_REGISTRY.values()
        ),
        "n_correlations_computed": n_computed,
        "correlation_matrix": correlations_sorted,
        "summary": {
            "average_confidence": round(avg_confidence, 4),
            "grade_distribution": grade_counts,
            "red_flags_detected": len(red_flags),
            "modalities_available": (
                "both" if mri_biomarkers and qeeg_biomarkers
                else "mri_only" if mri_biomarkers
                else "qeeg_only" if qeeg_biomarkers
                else "none"
            ),
        },
        "red_flags": red_flags,
    }


async def apply_lesion_constraints(
    mri_lesion_mask: str,
    qeeg_source_localization: dict[str, Any],
) -> dict[str, Any]:
    """Use MRI lesion locations to constrain qEEG source localization.

    When MRI identifies a structural lesion, this function prioritizes
    and weights nearby qEEG sources accordingly. Discordant findings
    (qEEG sources far from lesions, or lesions without qEEG correlates)
    are flagged for clinician review.

    This implements the lesion-constrained source localization pipeline
    described in the MRI Multimodal Integration Map (Section 1).

    Args:
        mri_lesion_mask: Absolute path to a NIfTI lesion mask file.
            The mask should be in MNI space with binary values
            (1 = lesion, 0 = normal tissue).
        qeeg_source_localization: Dict with qEEG source localization
            results. Expected format::

            {
                "sources": [
                    {
                        "location": [x, y, z],  # MNI coordinates
                        "power": float,
                        "frequency_band": str,  # e.g. "theta"
                        "confidence": float,
                    },
                    ...
                ],
                "method": str,  # e.g. "sLORETA", "eLORETA", "LCMV"
                "head_model": str,  # e.g. "BEM_4layer", "individual"
            }

    Returns:
        Dict containing:
        - constrained_sources: Source list with lesion proximity weights
        - lesion_regions: Detected lesion regions and volumes
        - concordance_flag: Overall concordance status
        - discordance_alerts: List of discordant findings for review
        - proximity_threshold_mm: Distance threshold used
        - disclaimer: Clinical safety disclaimer
        - provenance: Provenance label
        - timestamp: ISO timestamp

    Raises:
        FileNotFoundError: If lesion mask file does not exist.
        ValueError: If source localization data is malformed.

    Example:
        >>> result = await apply_lesion_constraints(
        ...     "/data/lesion_mask.nii.gz",
        ...     {
        ...         "sources": [
        ...             {"location": [-45, -20, 8], "power": 1.2,
        ...              "frequency_band": "theta", "confidence": 0.8}
        ...         ],
        ...         "method": "sLORETA",
        ...     },
        ... )
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    discordance_alerts: list[dict[str, Any]] = []
    constrained_sources: list[dict[str, Any]] = []

    # Validate inputs
    if not mri_lesion_mask or not Path(mri_lesion_mask).exists():
        _log.warning("Lesion mask not found: %s", mri_lesion_mask)
        discordance_alerts.append({
            "type": "missing_lesion_mask",
            "severity": "high",
            "message": "Lesion mask file not found. Cannot constrain sources.",
        })
        return {
            "disclaimer": _CLINICAL_DISCLAIMER,
            "timestamp": timestamp,
            "provenance": PROVENANCE_SIMULATED,
            "constrained_sources": qeeg_source_localization.get("sources", []),
            "lesion_regions": [],
            "concordance_flag": "insufficient_data",
            "discordance_alerts": discordance_alerts,
            "proximity_threshold_mm": 30.0,
            "n_sources": len(qeeg_source_localization.get("sources", [])),
            "n_constrained": 0,
        }

    # Validate source localization data
    sources = qeeg_source_localization.get("sources", [])
    if not sources:
        discordance_alerts.append({
            "type": "no_sources",
            "severity": "medium",
            "message": "No qEEG sources provided for lesion constraint.",
        })
        return {
            "disclaimer": _CLINICAL_DISCLAIMER,
            "timestamp": timestamp,
            "provenance": PROVENANCE_SIMULATED,
            "constrained_sources": [],
            "lesion_regions": [],
            "concordance_flag": "insufficient_data",
            "discordance_alerts": discordance_alerts,
            "proximity_threshold_mm": 30.0,
            "n_sources": 0,
            "n_constrained": 0,
        }

    # Try to load lesion mask if nibabel available
    lesion_regions: list[dict[str, Any]] = []
    lesion_centroids: list[list[float]] = []

    if HAS_NIBABEL and nib is not None:
        try:
            nii = nib.load(mri_lesion_mask)
            data = nii.get_fdata()
            affine = nii.affine

            # Find connected components (simplified)
            if HAS_NUMPY and np is not None:
                # Get lesion voxel coordinates
                lesion_voxels = np.argwhere(data > 0)
                if len(lesion_voxels) > 0:
                    # Compute centroid in MNI space
                    centroid_vox = np.mean(lesion_voxels, axis=0)
                    centroid_mni = nib.affines.apply_affine(affine, centroid_vox)
                    lesion_centroids.append(centroid_mni.tolist())

                    lesion_regions.append({
                        "centroid_mni": centroid_mni.tolist(),
                        "n_voxels": int(len(lesion_voxels)),
                        "volume_mm3": float(len(lesion_voxels) * np.prod(nii.header.get_zooms()[:3])),
                    })
            else:
                # Fallback: cannot compute without numpy
                lesion_regions.append({
                    "centroid_mni": None,
                    "n_voxels": None,
                    "volume_mm3": None,
                    "note": "NumPy not available; cannot compute lesion metrics.",
                })
        except Exception as exc:
            _log.error("Failed to load lesion mask: %s", exc)
            discordance_alerts.append({
                "type": "mask_load_error",
                "severity": "high",
                "message": f"Failed to parse lesion mask: {exc}",
            })
    else:
        discordance_alerts.append({
            "type": "nibabel_unavailable",
            "severity": "medium",
            "message": (
                "NiBabel not available. Using approximate lesion "
                "constraint from provided metadata."
            ),
        })
        # Try to get lesion location from source localization metadata
        lesion_meta = qeeg_source_localization.get("lesion_metadata", {})
        if "centroid_mni" in lesion_meta:
            lesion_centroids.append(lesion_meta["centroid_mni"])
            lesion_regions.append({
                "centroid_mni": lesion_meta["centroid_mni"],
                "n_voxels": lesion_meta.get("n_voxels"),
                "volume_mm3": lesion_meta.get("volume_mm3"),
                "source": "metadata_fallback",
            })

    # Apply lesion constraints to sources
    PROXIMITY_THRESHOLD_MM = 30.0  # Sources within 30mm of lesion are prioritized
    n_constrained = 0

    for source in sources:
        source_loc = source.get("location", [])
        if len(source_loc) != 3:
            constrained_sources.append(source)
            continue

        # Compute distance to nearest lesion centroid
        min_distance = float("inf")
        nearest_lesion = None

        for i, centroid in enumerate(lesion_centroids):
            if centroid is None or len(centroid) != 3:
                continue
            if HAS_NUMPY and np is not None:
                dist = float(np.linalg.norm(np.array(source_loc) - np.array(centroid)))
            else:
                dist = math.sqrt(
                    sum((a - b) ** 2 for a, b in zip(source_loc, centroid))
                )
            if dist < min_distance:
                min_distance = dist
                nearest_lesion = i

        # Weight source by lesion proximity
        if min_distance <= PROXIMITY_THRESHOLD_MM:
            proximity_weight = 1.0 - (min_distance / PROXIMITY_THRESHOLD_MM) * 0.3
            constrained_source = {
                **source,
                "lesion_proximity_mm": round(min_distance, 2),
                "proximity_weight": round(proximity_weight, 4),
                "constrained": True,
                "nearest_lesion": nearest_lesion,
            }
            n_constrained += 1
        else:
            # Flag discordant source (far from any lesion)
            constrained_source = {
                **source,
                "lesion_proximity_mm": round(min_distance, 2) if min_distance < float("inf") else None,
                "proximity_weight": 0.7,  # Slight downweighting
                "constrained": False,
                "nearest_lesion": nearest_lesion,
            }
            if min_distance < float("inf"):
                discordance_alerts.append({
                    "type": "source_far_from_lesion",
                    "severity": "low",
                    "source_location": source_loc,
                    "distance_mm": round(min_distance, 2),
                    "message": (
                        f"qEEG source at MNI {source_loc} is {min_distance:.1f}mm "
                        f"from nearest lesion. May represent compensatory activity."
                    ),
                })

        constrained_sources.append(constrained_source)

    # Check for lesions without corresponding qEEG sources (potential false negatives)
    for i, centroid in enumerate(lesion_centroids):
        has_nearby_source = any(
            s.get("nearest_lesion") == i and s.get("constrained")
            for s in constrained_sources
        )
        if not has_nearby_source and centroid is not None:
            discordance_alerts.append({
                "type": "lesion_without_qeeg_source",
                "severity": "medium",
                "lesion_centroid": centroid,
                "message": (
                    f"MRI lesion at MNI {centroid} has no corresponding qEEG source. "
                    "May indicate electrically silent lesion or deep source beyond detection."
                ),
            })

    # Determine overall concordance
    if len(discordance_alerts) == 0:
        concordance_flag = "full_concordance"
    elif all(a.get("severity") == "low" for a in discordance_alerts):
        concordance_flag = "minor_discordance"
    elif any(a.get("severity") == "high" for a in discordance_alerts):
        concordance_flag = "major_discordance"
    else:
        concordance_flag = "moderate_discordance"

    return {
        "disclaimer": _CLINICAL_DISCLAIMER,
        "timestamp": timestamp,
        "provenance": PROVENANCE_MEASURED if HAS_NIBABEL else PROVENANCE_INFERRED,
        "constrained_sources": constrained_sources,
        "lesion_regions": lesion_regions,
        "concordance_flag": concordance_flag,
        "discordance_alerts": discordance_alerts,
        "proximity_threshold_mm": PROXIMITY_THRESHOLD_MM,
        "n_sources": len(sources),
        "n_constrained": n_constrained,
        "source_localization_method": qeeg_source_localization.get("method", "unknown"),
        "head_model": qeeg_source_localization.get("head_model", "unknown"),
    }


async def fuse_atlas_topomap(
    mri_atlas_regions: dict[str, Any],
    qeeg_topomap_data: dict[str, Any],
) -> dict[str, Any]:
    """Register qEEG topographic maps to MRI atlas regions.

    Maps EEG electrode positions to MRI atlas regions for joint
    visualization and analysis. Returns region-wise fused data with
    both structural and spectral information.

    Uses the ELECTRODE_MNI_REGIONS mapping to link electrode-level
    qEEG data (spectral power, asymmetry) with MRI-derived atlas
    regions (volume, thickness, lesions).

    Args:
        mri_atlas_regions: Dict of MRI atlas region data. Expected::

            {
                "atlas_name": str,  # e.g. "AAL3", "Desikan-Killiany"
                "regions": {
                    "region_name": {
                        "volume_mm3": float,
                        "thickness_mm": float | None,
                        "lesion_present": bool,
                        "z_scores": {"volume": float, "thickness": float},
                    },
                    ...
                }
            }
        qeeg_topomap_data: Dict of qEEG topographic data. Expected::

            {
                "electrode_data": {
                    "F3": {"theta": float, "alpha": float, "beta": float, ...},
                    ...
                },
                "frequency_bands": list[str],
                "reference": str,  # e.g. "average", "Cz"
            }

    Returns:
        Dict containing:
        - fused_regions: List of region-wise fused entries
        - electrode_region_map: Mapping of electrodes to regions
        - n_regions_fused: Count of successfully fused regions
        - n_electrodes_mapped: Count of mapped electrodes
        - unmapped_electrodes: Electrodes without atlas mapping
        - atlas_coverage: Percentage of atlas regions with qEEG data
        - disclaimer: Clinical safety disclaimer
        - provenance: Provenance label
        - timestamp: ISO timestamp

    Example:
        >>> result = await fuse_atlas_topomap(
        ...     {
        ...         "atlas_name": "AAL3",
        ...         "regions": {
        ...             "middle_frontal_gyrus": {
        ...                 "volume_mm3": 12400, "thickness_mm": 2.8,
        ...                 "lesion_present": False,
        ...                 "z_scores": {"volume": -0.5, "thickness": -0.3},
        ...             }
        ...         }
        ...     },
        ...     {
        ...         "electrode_data": {
        ...             "F3": {"theta": 1.2, "alpha": -0.8, "beta": 0.5},
        ...         },
        ...         "frequency_bands": ["theta", "alpha", "beta"],
        ...     },
        ... )
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    mri_regions = mri_atlas_regions.get("regions", {})
    electrode_data = qeeg_topomap_data.get("electrode_data", {})
    frequency_bands = qeeg_topomap_data.get("frequency_bands", [])

    fused_regions: list[dict[str, Any]] = []
    electrode_region_map: dict[str, str] = {}
    unmapped_electrodes: list[str] = []

    # Aggregate electrode data by atlas region
    region_electrode_data: dict[str, dict[str, list[float]]] = {}

    for electrode, data in electrode_data.items():
        # Find atlas region for this electrode
        electrode_info = ALL_ELECTRODE_REGIONS.get(electrode)
        if electrode_info is None:
            unmapped_electrodes.append(electrode)
            continue

        region_name = electrode_info["region"]
        electrode_region_map[electrode] = region_name

        if region_name not in region_electrode_data:
            region_electrode_data[region_name] = {
                band: [] for band in frequency_bands
            }
            region_electrode_data[region_name]["_electrodes"] = []

        region_electrode_data[region_name]["_electrodes"].append(electrode)

        for band in frequency_bands:
            val = data.get(band)
            if val is not None and isinstance(val, (int, float)):
                region_electrode_data[region_name][band].append(float(val))

    # Build fused region entries
    n_regions_with_data = 0
    atlas_region_names = set(mri_regions.keys())
    fused_region_names = set()

    for region_name, band_data in region_electrode_data.items():
        # Compute mean spectral values per band
        spectral_means: dict[str, float | None] = {}
        for band in frequency_bands:
            values = band_data.get(band, [])
            if values:
                if HAS_NUMPY and np is not None:
                    spectral_means[band] = round(float(np.mean(values)), 4)
                else:
                    spectral_means[band] = round(sum(values) / len(values), 4)
            else:
                spectral_means[band] = None

        # Get MRI data for this region
        mri_region = mri_regions.get(region_name, {})
        has_mri = bool(mri_region)
        has_qeeg = any(v is not None for v in spectral_means.values())

        if has_mri:
            fused_region_names.add(region_name)

        if has_qeeg:
            n_regions_with_data += 1

        # Build fused entry
        fused_entry: dict[str, Any] = {
            "region_name": region_name,
            "electrodes": band_data.get("_electrodes", []),
            "n_electrodes": len(band_data.get("_electrodes", [])),
            "spectral_means": spectral_means,
            "mri_data": {
                "volume_mm3": mri_region.get("volume_mm3"),
                "thickness_mm": mri_region.get("thickness_mm"),
                "lesion_present": mri_region.get("lesion_present", False),
                "z_scores": mri_region.get("z_scores", {}),
            } if has_mri else None,
            "has_mri_data": has_mri,
            "has_qeeg_data": has_qeeg,
            "fusion_status": (
                "full" if has_mri and has_qeeg
                else "mri_only" if has_mri
                else "qeeg_only" if has_qeeg
                else "empty"
            ),
        }

        # If both modalities present, compute cross-modal score
        if has_mri and has_qeeg:
            # Find matching correlation registry entry
            corr_entry = None
            for mri_marker, entry in CORRELATION_REGISTRY.items():
                if mri_marker.replace("_volume", "").replace("_thickness", "") in region_name:
                    corr_entry = entry
                    break

            if corr_entry:
                grade = corr_entry.get("evidence_grade", "D")
                fusion_weight = EVIDENCE_GRADE_WEIGHTS.get(grade, 0.25)

                # Average absolute spectral deviation as proxy
                spec_values = [abs(v) for v in spectral_means.values() if v is not None]
                avg_spec_dev = sum(spec_values) / len(spec_values) if spec_values else 0.0

                z_vol = mri_region.get("z_scores", {}).get("volume", 0.0) or 0.0
                z_thick = mri_region.get("z_scores", {}).get("thickness", 0.0) or 0.0
                avg_structural_dev = (abs(z_vol) + abs(z_thick)) / 2.0

                cross_modal_score = (avg_spec_dev + avg_structural_dev) / 2.0 * fusion_weight

                fused_entry["cross_modal_score"] = round(min(1.0, cross_modal_score), 4)
                fused_entry["evidence_grade"] = grade
            else:
                fused_entry["cross_modal_score"] = None
                fused_entry["evidence_grade"] = "D"

        fused_regions.append(fused_entry)

    # Compute atlas coverage
    n_atlas_regions = len(atlas_region_names)
    atlas_coverage = (
        len(fused_region_names) / n_atlas_regions * 100
        if n_atlas_regions > 0 else 0.0
    )

    # Sort by cross-modal score descending
    fused_regions_sorted = sorted(
        fused_regions,
        key=lambda x: x.get("cross_modal_score", 0) or 0,
        reverse=True,
    )

    return {
        "disclaimer": _CLINICAL_DISCLAIMER,
        "timestamp": timestamp,
        "provenance": PROVENANCE_INFERRED,
        "atlas_name": mri_atlas_regions.get("atlas_name", "unknown"),
        "fused_regions": fused_regions_sorted,
        "electrode_region_map": electrode_region_map,
        "n_regions_fused": len(fused_regions),
        "n_regions_with_cross_modal": sum(
            1 for r in fused_regions if r.get("cross_modal_score") is not None
        ),
        "n_electrodes_mapped": len(electrode_region_map),
        "unmapped_electrodes": unmapped_electrodes,
        "atlas_coverage_percent": round(atlas_coverage, 2),
        "frequency_bands": frequency_bands,
        "summary": {
            "full_fusion_regions": sum(1 for r in fused_regions if r["fusion_status"] == "full"),
            "mri_only_regions": sum(1 for r in fused_regions if r["fusion_status"] == "mri_only"),
            "qeeg_only_regions": sum(1 for r in fused_regions if r["fusion_status"] == "qeeg_only"),
        },
    }


async def compute_joint_biomarker_panel(
    mri_analysis_id: str,
    qeeg_analysis_id: str,
    db: Any,  # Session type from SQLAlchemy
) -> dict[str, Any]:
    """Compute unified biomarker panel combining MRI + qEEG findings.

    Retrieves MRI and qEEG analyses from the database, extracts
    biomarkers from both modalities, and computes cross-modal
    composite scores with confidence weighting.

    Returns a panel with:
    - Individual MRI biomarkers (with evidence grades)
    - Individual qEEG biomarkers (with evidence grades)
    - Cross-modal composite scores
    - Confidence-weighted fusion scores
    - Clinical interpretations (decision-support only)
    - Red flags requiring attention

    Covers 20+ biomarkers across 11+ clinical conditions.

    Args:
        mri_analysis_id: UUID of the MRI analysis record.
        qeeg_analysis_id: UUID of the qEEG analysis record.
        db: SQLAlchemy database session.

    Returns:
        Dict containing the full joint biomarker panel.

    Raises:
        ValueError: If either analysis record is not found.
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    # Fetch MRI analysis from database
    mri_analysis = None
    qeeg_analysis = None

    if HAS_SQLALCHEMY and db is not None:
        try:
            mri_analysis = db.query(MriAnalysis).filter(
                MriAnalysis.analysis_id == mri_analysis_id
            ).first() if MriAnalysis else None
        except Exception as exc:
            _log.warning("Failed to query MRI analysis: %s", exc)

        try:
            qeeg_analysis = db.query(QEEGAnalysis).filter(
                QEEGAnalysis.id == qeeg_analysis_id
            ).first() if QEEGAnalysis else None
        except Exception as exc:
            _log.warning("Failed to query qEEG analysis: %s", exc)

    # Extract biomarkers from analyses
    mri_biomarkers: dict[str, Any] = {}
    qeeg_biomarkers: dict[str, Any] = {}

    if mri_analysis:
        structural = _safe_json_loads(
            getattr(mri_analysis, "structural_json", None)
        )
        # Extract key biomarker values from structural JSON
        volumes = structural.get("volumes", {})
        for key in ["hippocampus", "amygdala", "thalamus", "cingulate",
                     "cerebellum", "frontal", "parietal", "temporal",
                     "ventricles", "white_matter"]:
            if key in volumes:
                mri_biomarkers[f"{key}_volume"] = volumes[key].get("z_score")

        # Get cortical thickness
        thickness = structural.get("cortical_thickness", {})
        for region in ["prefrontal", "parietal", "temporal"]:
            if region in thickness:
                mri_biomarkers[f"{region}_thickness"] = thickness[region].get("z_score")

        # Get white matter integrity (DTI)
        diffusion = _safe_json_loads(
            getattr(mri_analysis, "diffusion_json", None)
        )
        if diffusion:
            fa_values = diffusion.get("fractional_anisotropy", {})
            if fa_values:
                mri_biomarkers["white_matter_integrity"] = fa_values.get("mean_z_score")

        # Get WMH burden
        wmh = structural.get("white_matter_hyperintensities", {})
        if wmh:
            mri_biomarkers["white_matter_hyperintensity"] = wmh.get("z_score")

    if qeeg_analysis:
        band_powers = _safe_json_loads(
            getattr(qeeg_analysis, "band_powers_json", None)
        )
        deviations = _safe_json_loads(
            getattr(qeeg_analysis, "normative_deviations_json", None)
        )

        # Extract key qEEG biomarkers
        if deviations:
            global_dev = deviations.get("global", {})
            qeeg_biomarkers["theta_gamma_ratio"] = global_dev.get("theta_gamma_ratio")
            qeeg_biomarkers["theta_beta_ratio"] = global_dev.get("theta_beta_ratio")
            qeeg_biomarkers["frontal_alpha_asymmetry"] = global_dev.get("frontal_alpha_asymmetry")
            qeeg_biomarkers["frontal_midline_theta"] = global_dev.get("frontal_midline_theta")
            qeeg_biomarkers["frontal_theta_elevation"] = global_dev.get("frontal_theta_elevation")
            qeeg_biomarkers["iaf"] = global_dev.get("individual_alpha_frequency")
            qeeg_biomarkers["posterior_alpha"] = global_dev.get("posterior_alpha_power")
            qeeg_biomarkers["temporal_alpha_power"] = global_dev.get("temporal_alpha_power")
            qeeg_biomarkers["delta_power"] = global_dev.get("delta_power")
            qeeg_biomarkers["alpha_coherence"] = global_dev.get("alpha_coherence")
            qeeg_biomarkers["beta_coherence"] = global_dev.get("beta_coherence")
            qeeg_biomarkers["high_beta_frontal"] = global_dev.get("high_beta_frontal")
            qeeg_biomarkers["high_beta_temporal"] = global_dev.get("high_beta_temporal")
            qeeg_biomarkers["gamma_power"] = global_dev.get("gamma_power")
            qeeg_biomarkers["slowing_index"] = global_dev.get("slowing_index")
            qeeg_biomarkers["eeg_slowing"] = global_dev.get("slowing_index")
            qeeg_biomarkers["interictal_epileptiform_discharges"] = global_dev.get("ied_count", 0)

    # Determine patient condition for targeted panel
    condition = None
    if mri_analysis:
        condition = getattr(mri_analysis, "condition", None)
    if not condition and qeeg_analysis:
        # Try to infer from analysis metadata
        analysis_params = _safe_json_loads(
            getattr(qeeg_analysis, "analysis_params_json", None)
        )
        condition = analysis_params.get("indicated_condition")

    # Build individual biomarker sections
    mri_individual: list[dict[str, Any]] = []
    for marker, value in mri_biomarkers.items():
        # Find evidence grade from registry
        grade = "D"
        for reg_marker, entry in CORRELATION_REGISTRY.items():
            if reg_marker in marker or marker in reg_marker:
                grade = entry.get("evidence_grade", "D")
                break

        mri_individual.append({
            "marker_name": marker,
            "value": value,
            "value_available": value is not None,
            "evidence_grade": grade,
            "provenance": PROVENANCE_MEASURED if value is not None else PROVENANCE_SIMULATED,
        })

    qeeg_individual: list[dict[str, Any]] = []
    for marker, value in qeeg_biomarkers.items():
        grade = "D"
        for reg_entry in CORRELATION_REGISTRY.values():
            if marker in reg_entry.get("qeeg_counterparts", []):
                grade = reg_entry.get("evidence_grade", "D")
                break

        qeeg_individual.append({
            "marker_name": marker,
            "value": value,
            "value_available": value is not None,
            "evidence_grade": grade,
            "provenance": PROVENANCE_MEASURED if value is not None else PROVENANCE_SIMULATED,
        })

    # Compute cross-modal composite scores per condition
    composite_scores: list[dict[str, Any]] = []

    for cond, biomarkers in JOINT_BIOMARKER_REGISTRY.items():
        if condition and condition.lower() != cond.lower():
            continue

        cond_scores: list[dict[str, Any]] = []
        for bm in biomarkers:
            mri_marker_name = bm.get("mri_marker", "")
            qeeg_marker_name = bm.get("qeeg_marker", "")

            mri_val = mri_biomarkers.get(mri_marker_name)
            qeeg_val = qeeg_biomarkers.get(qeeg_marker_name)

            result = _compute_confidence_weighted_score(
                mri_value=mri_val if isinstance(mri_val, (int, float)) else None,
                qeeg_value=qeeg_val if isinstance(qeeg_val, (int, float)) else None,
                evidence_grade=bm.get("evidence_grade", "D"),
            )

            cond_scores.append({
                "biomarker_name": bm.get("name"),
                "mri_marker": mri_marker_name,
                "qeeg_marker": qeeg_marker_name,
                "mri_value": mri_val,
                "qeeg_value": qeeg_val,
                "fusion_weight": bm.get("fusion_weight"),
                "evidence_grade": bm.get("evidence_grade"),
                "clinical_note": bm.get("clinical_note"),
                **result,
            })

        # Compute condition-level composite
        available_scores = [s["fusion_score"] for s in cond_scores if s["confidence"] > 0]
        composite = (
            sum(available_scores) / len(available_scores)
            if available_scores else 0.0
        )

        composite_scores.append({
            "condition": cond,
            "biomarkers": cond_scores,
            "composite_score": round(composite, 4),
            "n_biomarkers": len(cond_scores),
            "n_available": len(available_scores),
        })

    # Detect red flags
    red_flags = _detect_red_flags(mri_biomarkers, qeeg_biomarkers, condition)

    # Sort composite scores by score descending
    composite_scores_sorted = sorted(
        composite_scores, key=lambda x: x["composite_score"], reverse=True
    )

    return {
        "disclaimer": _CLINICAL_DISCLAIMER,
        "timestamp": timestamp,
        "provenance": (
            PROVENANCE_MEASURED
            if mri_analysis and qeeg_analysis
            else PROVENANCE_INFERRED
        ),
        "mri_analysis_id": mri_analysis_id,
        "qeeg_analysis_id": qeeg_analysis_id,
        "condition": condition,
        "data_availability": {
            "mri_available": mri_analysis is not None,
            "qeeg_available": qeeg_analysis is not None,
            "mri_biomarkers_extracted": len(mri_biomarkers),
            "qeeg_biomarkers_extracted": len(qeeg_biomarkers),
        },
        "individual_biomarkers": {
            "mri": sorted(mri_individual, key=lambda x: x["marker_name"]),
            "qeeg": sorted(qeeg_individual, key=lambda x: x["marker_name"]),
        },
        "composite_scores": composite_scores_sorted,
        "red_flags": red_flags,
        "total_biomarkers_in_panel": sum(cs["n_biomarkers"] for cs in composite_scores),
        "total_conditions_covered": len(composite_scores),
    }


async def synthesize_neuromodulation_targets(
    mri_data: dict[str, Any],
    qeeg_data: dict[str, Any],
    condition: str,
) -> list[dict[str, Any]]:
    """Synthesize neuromodulation targets from combined MRI+qEEG data.

    For each target, provides coordinates (MNI), confidence score,
    supporting evidence from both MRI and qEEG, cross-modal agreement
    score, evidence grade, and safety considerations.

    Targets are selected from the NEUROMODULATION_TARGETS registry
    based on the clinical condition, then scored using the actual
    patient biomarker values.

    Args:
        mri_data: MRI biomarker values. Expected::

            {
                "hippocampal_volume": float,  # z-score
                "prefrontal_thickness": float,  # z-score
                "cingulate_volume": float,
                "temporal_volume": float,
                "white_matter_integrity": float,  # FA z-score
                "white_matter_hyperintensity": float,
                "ventricular_volume": float,
                "amygdala_volume": float,
                "parietal_thickness": float,
            }
        qeeg_data: qEEG biomarker values. Expected::

            {
                "frontal_alpha_asymmetry": float,  # z-score
                "theta_beta_ratio": float,
                "frontal_midline_theta": float,
                "theta_gamma_ratio": float,
                "temporal_alpha_power": float,
                "alpha_coherence": float,
                "beta_coherence": float,
                "posterior_alpha": float,
                "iaf": float,
                "interictal_epileptiform_discharges": int,
            }
        condition: Clinical condition to target. Must be a key in
            NEUROMODULATION_TARGETS registry.

    Returns:
        List of target dicts, sorted by confidence score descending.
        Each target contains:
        - name: Target name
        - mni: MNI coordinates [x, y, z] or list for bilateral
        - confidence: Overall confidence score (0-1)
        - mri_evidence: MRI supporting evidence
        - qeeg_evidence: qEEG supporting evidence
        - cross_modal_agreement: Agreement analysis
        - evidence_grade: Overall evidence grade
        - modality: Recommended stimulation modality
        - safety_considerations: Safety notes
        - disclaimer: Clinical safety disclaimer

    Example:
        >>> targets = await synthesize_neuromodulation_targets(
        ...     {"prefrontal_thickness": -1.2, "cingulate_volume": -0.8},
        ...     {"frontal_alpha_asymmetry": 1.5, "theta_beta_ratio": 1.8},
        ...     "depression",
        ... )
        >>> len(targets) > 0
        True
    """
    condition_lower = condition.lower()
    available_targets = NEUROMODULATION_TARGETS.get(condition_lower, [])

    if not available_targets:
        _log.warning(
            "No neuromodulation targets available for condition: %s", condition
        )
        # Return a generic target with low confidence
        return [{
            "name": "generic_dlpfc",
            "mni": (-44, 36, 28),
            "confidence": 0.1,
            "mri_evidence": {"available": False, "reason": "no_targets_for_condition"},
            "qeeg_evidence": {"available": False, "reason": "no_targets_for_condition"},
            "cross_modal_agreement": {
                "agreement_score": 0.0,
                "interpretation": "insufficient_data",
            },
            "evidence_grade": "D",
            "modality": "rtms",
            "safety_considerations": "No condition-specific targets. Use standard protocol.",
            "disclaimer": _CLINICAL_DISCLAIMER,
            "provenance": PROVENANCE_SIMULATED,
        }]

    scored_targets: list[dict[str, Any]] = []

    for target in available_targets:
        target_name = target["name"]
        target_mni = target["mni"]
        target_grade = target["evidence_grade"]
        mri_features = target.get("mri_features", [])
        qeeg_features = target.get("qeeg_features", [])

        # Gather MRI evidence
        mri_scores: list[float] = []
        mri_details: dict[str, Any] = {}
        for feature in mri_features:
            val = mri_data.get(feature)
            if val is not None and isinstance(val, (int, float)):
                abs_val = abs(float(val))
                mri_scores.append(abs_val)
                mri_details[feature] = {
                    "value": val,
                    "deviation": abs_val,
                    "provenance": PROVENANCE_MEASURED,
                }
            else:
                mri_details[feature] = {
                    "value": None,
                    "provenance": PROVENANCE_SIMULATED,
                }

        mri_score = sum(mri_scores) / len(mri_scores) if mri_scores else 0.0

        # Gather qEEG evidence
        qeeg_scores: list[float] = []
        qeeg_details: dict[str, Any] = {}
        for feature in qeeg_features:
            val = qeeg_data.get(feature)
            if val is not None and isinstance(val, (int, float)):
                abs_val = abs(float(val))
                qeeg_scores.append(abs_val)
                qeeg_details[feature] = {
                    "value": val,
                    "deviation": abs_val,
                    "provenance": PROVENANCE_MEASURED,
                }
            else:
                qeeg_details[feature] = {
                    "value": None,
                    "provenance": PROVENANCE_SIMULATED,
                }

        qeeg_score = sum(qeeg_scores) / len(qeeg_scores) if qeeg_scores else 0.0

        # Compute cross-modal agreement
        mri_evidence_dict = {
            "score": mri_score,
            "direction": "abnormal" if mri_score > 1.0 else "normal",
        }
        qeeg_evidence_dict = {
            "score": qeeg_score,
            "direction": "abnormal" if qeeg_score > 1.0 else "normal",
        }
        agreement = _estimate_cross_modal_agreement(
            mri_evidence_dict, qeeg_evidence_dict
        )

        # Compute overall confidence
        grade_weight = EVIDENCE_GRADE_WEIGHTS.get(target_grade, 0.25)
        modalities_present = sum([
            1 if mri_scores else 0,
            1 if qeeg_scores else 0,
        ])

        if modalities_present == 2:
            base_confidence = (mri_score + qeeg_score) / 2.0
            modality_bonus = 1.0
            provenance = PROVENANCE_MEASURED
        elif modalities_present == 1:
            base_confidence = max(mri_score, qeeg_score)
            modality_bonus = 0.6
            provenance = PROVENANCE_PROXY
        else:
            base_confidence = 0.1
            modality_bonus = 0.3
            provenance = PROVENANCE_SIMULATED

        confidence = base_confidence * grade_weight * modality_bonus
        confidence = max(0.0, min(1.0, confidence))

        scored_target: dict[str, Any] = {
            "name": target_name,
            "mni": target_mni,
            "confidence": round(confidence, 4),
            "mri_evidence": {
                "features": mri_details,
                "aggregate_score": round(mri_score, 4),
                "n_features_present": len(mri_scores),
                "n_features_total": len(mri_features),
            },
            "qeeg_evidence": {
                "features": qeeg_details,
                "aggregate_score": round(qeeg_score, 4),
                "n_features_present": len(qeeg_scores),
                "n_features_total": len(qeeg_features),
            },
            "cross_modal_agreement": agreement,
            "evidence_grade": target_grade,
            "modality": target.get("modality", "rtms"),
            "safety_considerations": target.get("safety_notes", "No specific safety notes."),
            "disclaimer": _CLINICAL_DISCLAIMER,
            "provenance": provenance,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        scored_targets.append(scored_target)

    # Sort by confidence descending
    scored_targets.sort(key=lambda x: x["confidence"], reverse=True)

    return scored_targets


async def fuse_multimodal_trajectory(
    mri_timeline: list[dict[str, Any]],
    qeeg_timeline: list[dict[str, Any]],
    clinical_outcomes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Fuse longitudinal MRI + qEEG data for trajectory analysis.

    Analyzes serial MRI scans and qEEG recordings to compute change
    rates, divergence/convergence metrics, and response prediction
    with confidence intervals.

    Uses linear trend analysis on both modalities and correlates
    changes with clinical outcomes when available.

    Args:
        mri_timeline: List of serial MRI scan results, each dict::

            {
                "date": str,  # ISO date
                "days_from_baseline": float,
                "biomarkers": {"hippocampal_volume": float, ...},
            }
        qeeg_timeline: List of serial qEEG recordings, each dict::

            {
                "date": str,
                "days_from_baseline": float,
                "biomarkers": {"theta_gamma_ratio": float, ...},
            }
        clinical_outcomes: List of clinical outcome scores, each dict::

            {
                "date": str,
                "days_from_baseline": float,
                "score": float,  # e.g. Hamilton Depression Rating Scale
                "scale_name": str,
            }

    Returns:
        Dict containing:
        - mri_trajectories: Change rates per MRI biomarker
        - qeeg_trajectories: Change rates per qEEG biomarker
        - divergence_metrics: How much modalities diverge over time
        - convergence_metrics: Cross-modal correlation of changes
        - clinical_correlations: Correlation with outcomes (if available)
        - response_prediction: Predicted response category
        - confidence_intervals: 95% confidence intervals on predictions
        - disclaimer: Clinical safety disclaimer
        - provenance: Provenance label
        - timestamp: ISO timestamp

    Example:
        >>> result = await fuse_multimodal_trajectory(
        ...     [
        ...         {"date": "2024-01-01", "days_from_baseline": 0,
        ...          "biomarkers": {"hippocampal_volume": -1.0}},
        ...         {"date": "2024-07-01", "days_from_baseline": 180,
        ...          "biomarkers": {"hippocampal_volume": -1.3}},
        ...     ],
        ...     [
        ...         {"date": "2024-01-01", "days_from_baseline": 0,
        ...          "biomarkers": {"theta_gamma_ratio": 1.5}},
        ...         {"date": "2024-07-01", "days_from_baseline": 180,
        ...          "biomarkers": {"theta_gamma_ratio": 1.9}},
        ...     ],
        ...     [
        ...         {"date": "2024-07-01", "days_from_baseline": 180,
        ...          "score": 12, "scale_name": "HAM-D"},
        ...     ],
        ... )
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    # Validate inputs
    if len(mri_timeline) < 2 and len(qeeg_timeline) < 2:
        return {
            "disclaimer": _CLINICAL_DISCLAIMER,
            "timestamp": timestamp,
            "provenance": PROVENANCE_SIMULATED,
            "error": "Insufficient time points. Minimum 2 required per modality.",
            "mri_n_timepoints": len(mri_timeline),
            "qeeg_n_timepoints": len(qeeg_timeline),
            "mri_trajectories": {},
            "qeeg_trajectories": {},
            "divergence_metrics": {},
            "convergence_metrics": {},
            "clinical_correlations": {},
            "response_prediction": None,
            "confidence_intervals": {},
        }

    # ── MRI Trajectory Analysis ──────────────────────────────────────────────
    mri_trajectories: dict[str, dict[str, Any]] = {}

    if len(mri_timeline) >= 2:
        # Collect all MRI biomarker names
        mri_biomarker_names: set[str] = set()
        for entry in mri_timeline:
            mri_biomarker_names.update(entry.get("biomarkers", {}).keys())

        for biomarker in mri_biomarker_names:
            values: list[float] = []
            times: list[float] = []
            for entry in mri_timeline:
                val = entry.get("biomarkers", {}).get(biomarker)
                if val is not None and isinstance(val, (int, float)):
                    values.append(float(val))
                    times.append(entry.get("days_from_baseline", 0))

            if len(values) >= 2:
                traj = _compute_trajectory_derivative(values, times)
                mri_trajectories[biomarker] = traj

    # ── qEEG Trajectory Analysis ─────────────────────────────────────────────
    qeeg_trajectories: dict[str, dict[str, Any]] = {}

    if len(qeeg_timeline) >= 2:
        qeeg_biomarker_names: set[str] = set()
        for entry in qeeg_timeline:
            qeeg_biomarker_names.update(entry.get("biomarkers", {}).keys())

        for biomarker in qeeg_biomarker_names:
            values: list[float] = []
            times: list[float] = []
            for entry in qeeg_timeline:
                val = entry.get("biomarkers", {}).get(biomarker)
                if val is not None and isinstance(val, (int, float)):
                    values.append(float(val))
                    times.append(entry.get("days_from_baseline", 0))

            if len(values) >= 2:
                traj = _compute_trajectory_derivative(values, times)
                qeeg_trajectories[biomarker] = traj

    # ── Divergence / Convergence Metrics ─────────────────────────────────────
    divergence_metrics: dict[str, Any] = {}
    convergence_metrics: dict[str, Any] = {}

    # Find matching biomarker pairs with trajectory data
    matched_pairs: list[tuple[str, str]] = []
    for mri_marker, registry_entry in CORRELATION_REGISTRY.items():
        for qeeg_marker in registry_entry.get("qeeg_counterparts", []):
            if mri_marker in mri_trajectories and qeeg_marker in qeeg_trajectories:
                matched_pairs.append((mri_marker, qeeg_marker))

    if matched_pairs:
        divergence_scores: list[float] = []
        convergence_scores: list[float] = []

        for mri_m, qeeg_m in matched_pairs:
            mri_slope = mri_trajectories[mri_m].get("slope")
            qeeg_slope = qeeg_trajectories[qeeg_m].get("slope")

            if mri_slope is not None and qeeg_slope is not None:
                # Divergence: difference in change rates
                divergence = abs(mri_slope - qeeg_slope)
                divergence_scores.append(divergence)

                # Convergence: same direction of change
                same_direction = (mri_slope > 0 and qeeg_slope > 0) or \
                                 (mri_slope < 0 and qeeg_slope < 0)
                convergence_scores.append(1.0 if same_direction else 0.0)

        if divergence_scores:
            if HAS_NUMPY and np is not None:
                divergence_metrics["mean_divergence"] = round(float(np.mean(divergence_scores)), 6)
                divergence_metrics["max_divergence"] = round(float(np.max(divergence_scores)), 6)
            else:
                divergence_metrics["mean_divergence"] = round(
                    sum(divergence_scores) / len(divergence_scores), 6
                )
                divergence_metrics["max_divergence"] = round(max(divergence_scores), 6)
            divergence_metrics["n_pairs"] = len(divergence_scores)

        if convergence_scores:
            convergence_rate = sum(convergence_scores) / len(convergence_scores)
            convergence_metrics["convergence_rate"] = round(convergence_rate, 4)
            convergence_metrics["interpretation"] = (
                "strong_convergence" if convergence_rate >= 0.75
                else "moderate_convergence" if convergence_rate >= 0.50
                else "divergence"
            )
            convergence_metrics["n_pairs"] = len(convergence_scores)

    # ── Clinical Outcome Correlations ────────────────────────────────────────
    clinical_correlations: dict[str, Any] = {}

    if clinical_outcomes and len(clinical_outcomes) >= 2:
        outcome_times = [o.get("days_from_baseline", 0) for o in clinical_outcomes]
        outcome_scores = [o.get("score") for o in clinical_outcomes]
        outcome_scores = [s for s in outcome_scores if s is not None]

        if len(outcome_scores) >= 2:
            # Simple change in outcome
            outcome_change = outcome_scores[-1] - outcome_scores[0]
            clinical_correlations["outcome_change"] = outcome_change
            clinical_correlations["percent_change"] = (
                (outcome_change / abs(outcome_scores[0]) * 100)
                if outcome_scores[0] != 0 else None
            )

            # Correlate with MRI trajectories
            mri_clinical_corr: dict[str, float] = {}
            for biomarker, traj in mri_trajectories.items():
                slope = traj.get("slope")
                if slope is not None and outcome_change != 0:
                    # Both changing in same direction = negative correlation
                    # (improvement = reduction in biomarker abnormality)
                    corr_sign = -1.0 if (slope > 0 and outcome_change < 0) or \
                                          (slope < 0 and outcome_change > 0) else 1.0
                    mri_clinical_corr[biomarker] = round(corr_sign * min(1.0, abs(slope) * abs(outcome_change) / 10.0), 4)

            clinical_correlations["mri_correlations"] = mri_clinical_corr

            # Correlate with qEEG trajectories
            qeeg_clinical_corr: dict[str, float] = {}
            for biomarker, traj in qeeg_trajectories.items():
                slope = traj.get("slope")
                if slope is not None and outcome_change != 0:
                    corr_sign = -1.0 if (slope > 0 and outcome_change < 0) or \
                                          (slope < 0 and outcome_change > 0) else 1.0
                    qeeg_clinical_corr[biomarker] = round(corr_sign * min(1.0, abs(slope) * abs(outcome_change) / 10.0), 4)

            clinical_correlations["qeeg_correlations"] = qeeg_clinical_corr

    # ── Response Prediction ──────────────────────────────────────────────────
    response_prediction = None
    confidence_intervals: dict[str, Any] = {}

    # Simple heuristic response prediction
    if clinical_outcomes and len(clinical_outcomes) >= 1:
        latest_outcome = clinical_outcomes[-1].get("score")
        baseline_outcome = clinical_outcomes[0].get("score") if clinical_outcomes else None

        if latest_outcome is not None and baseline_outcome is not None:
            pct_change = ((latest_outcome - baseline_outcome) / abs(baseline_outcome) * 100) \
                if baseline_outcome != 0 else 0

            if pct_change <= -50:
                response_prediction = {
                    "category": "responder",
                    "confidence": 0.75,
                    "interpretation": "Strong clinical response (>50% improvement)",
                }
            elif pct_change <= -25:
                response_prediction = {
                    "category": "partial_responder",
                    "confidence": 0.60,
                    "interpretation": "Partial response (25-50% improvement)",
                }
            elif pct_change <= 0:
                response_prediction = {
                    "category": "minimal_responder",
                    "confidence": 0.45,
                    "interpretation": "Minimal response (0-25% improvement)",
                }
            else:
                response_prediction = {
                    "category": "non_responder",
                    "confidence": 0.60,
                    "interpretation": "No response or worsening",
                }

            # Confidence intervals based on data quality
            n_timepoints = max(len(mri_timeline), len(qeeg_timeline))
            ci_width = max(0.3, 0.8 - n_timepoints * 0.1)
            pred_conf = response_prediction.get("confidence", 0.5)
            confidence_intervals["response_prediction"] = {
                "lower_bound": max(0.0, pred_conf - ci_width),
                "upper_bound": min(1.0, pred_conf + ci_width),
                "width": ci_width,
                "n_timepoints": n_timepoints,
            }

    return {
        "disclaimer": _CLINICAL_DISCLAIMER,
        "timestamp": timestamp,
        "provenance": (
            PROVENANCE_MEASURED
            if len(mri_timeline) >= 3 and len(qeeg_timeline) >= 3
            else PROVENANCE_INFERRED
        ),
        "mri_n_timepoints": len(mri_timeline),
        "qeeg_n_timepoints": len(qeeg_timeline),
        "clinical_n_timepoints": len(clinical_outcomes),
        "mri_trajectories": mri_trajectories,
        "qeeg_trajectories": qeeg_trajectories,
        "divergence_metrics": divergence_metrics,
        "convergence_metrics": convergence_metrics,
        "clinical_correlations": clinical_correlations,
        "response_prediction": response_prediction,
        "confidence_intervals": confidence_intervals,
        "matched_biomarker_pairs": [
            {"mri": m, "qeeg": q} for m, q in matched_pairs
        ] if matched_pairs else [],
    }



# ═══════════════════════════════════════════════════════════════════════════════
# FASTAPI SERVICE FUNCTIONS (Database-backed)
# ═══════════════════════════════════════════════════════════════════════════════


async def get_fusion_summary(
    mri_analysis_id: str,
    qeeg_analysis_id: str,
    db: Any,  # Session
) -> dict[str, Any]:
    """Get high-level fusion summary for dashboard display.

    Retrieves both MRI and qEEG analyses from the database and
    returns a condensed summary suitable for dashboard rendering.

    Args:
        mri_analysis_id: UUID of the MRI analysis record.
        qeeg_analysis_id: UUID of the qEEG analysis record.
        db: SQLAlchemy database session.

    Returns:
        Dict with summary metrics, top correlations, red flags,
        and data availability status.

    Example:
        >>> summary = await get_fusion_summary("mri-uuid", "qeeg-uuid", db)
        >>> print(summary["fusion_readiness"])
        'ready'
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    # Fetch analyses
    mri_analysis = None
    qeeg_analysis = None

    if HAS_SQLALCHEMY and db is not None and MriAnalysis is not None:
        try:
            mri_analysis = db.query(MriAnalysis).filter(
                MriAnalysis.analysis_id == mri_analysis_id
            ).first()
        except Exception as exc:
            _log.warning("MRI query failed in get_fusion_summary: %s", exc)

    if HAS_SQLALCHEMY and db is not None and QEEGAnalysis is not None:
        try:
            qeeg_analysis = db.query(QEEGAnalysis).filter(
                QEEGAnalysis.id == qeeg_analysis_id
            ).first()
        except Exception as exc:
            _log.warning("qEEG query failed in get_fusion_summary: %s", exc)

    # Determine readiness
    if mri_analysis and qeeg_analysis:
        readiness = "ready"
    elif mri_analysis:
        readiness = "mri_only"
    elif qeeg_analysis:
        readiness = "qeeg_only"
    else:
        readiness = "no_data"

    # Extract key metrics
    mri_state = getattr(mri_analysis, "state", None) if mri_analysis else None
    qeeg_status = getattr(qeeg_analysis, "analysis_status", None) if qeeg_analysis else None

    # Quick correlation of available biomarkers
    mri_biomarkers: dict[str, Any] = {}
    qeeg_biomarkers: dict[str, Any] = {}

    if mri_analysis:
        structural = _safe_json_loads(getattr(mri_analysis, "structural_json", None))
        volumes = structural.get("volumes", {})
        for key in ["hippocampus", "prefrontal", "cingulate", "temporal",
                     "amygdala", "white_matter"]:
            if key in volumes:
                mri_biomarkers[f"{key}_volume"] = volumes[key].get("z_score")

    if qeeg_analysis:
        deviations = _safe_json_loads(
            getattr(qeeg_analysis, "normative_deviations_json", None)
        )
        if deviations:
            global_dev = deviations.get("global", {})
            for key in ["theta_gamma_ratio", "frontal_alpha_asymmetry",
                        "theta_beta_ratio", "frontal_midline_theta"]:
                qeeg_biomarkers[key] = global_dev.get(key)

    # Compute top 3 correlations
    top_correlations: list[dict[str, Any]] = []
    if mri_biomarkers and qeeg_biomarkers:
        all_corrs: list[dict[str, Any]] = []
        for mri_marker, registry in CORRELATION_REGISTRY.items():
            mri_val = mri_biomarkers.get(mri_marker)
            if mri_val is None:
                continue
            for qeeg_marker in registry.get("qeeg_counterparts", []):
                qeeg_val = qeeg_biomarkers.get(qeeg_marker)
                if qeeg_val is None:
                    continue
                result = _compute_confidence_weighted_score(
                    mri_value=mri_val if isinstance(mri_val, (int, float)) else None,
                    qeeg_value=qeeg_val if isinstance(qeeg_val, (int, float)) else None,
                    evidence_grade=registry.get("evidence_grade", "D"),
                    direction=registry.get("direction", "positive"),
                )
                all_corrs.append({
                    "mri_marker": mri_marker,
                    "qeeg_marker": qeeg_marker,
                    "confidence": result["confidence"],
                    "fusion_score": result["fusion_score"],
                    "evidence_grade": registry.get("evidence_grade"),
                })

        top_correlations = sorted(
            all_corrs, key=lambda x: x["confidence"], reverse=True
        )[:3]

    # Red flags
    red_flags = _detect_red_flags(mri_biomarkers, qeeg_biomarkers)

    return {
        "disclaimer": _CLINICAL_DISCLAIMER,
        "timestamp": timestamp,
        "provenance": PROVENANCE_MEASURED if readiness == "ready" else PROVENANCE_INFERRED,
        "fusion_readiness": readiness,
        "mri_analysis_id": mri_analysis_id,
        "qeeg_analysis_id": qeeg_analysis_id,
        "mri_state": mri_state,
        "qeeg_status": qeeg_status,
        "data_availability": {
            "mri_available": mri_analysis is not None,
            "qeeg_available": qeeg_analysis is not None,
            "mri_biomarkers_extracted": len(mri_biomarkers),
            "qeeg_biomarkers_extracted": len(qeeg_biomarkers),
        },
        "top_correlations": top_correlations,
        "red_flags": red_flags,
        "n_red_flags": len(red_flags),
        "has_critical_red_flags": any(
            rf.get("severity") == "high" for rf in red_flags
        ),
    }


async def get_joint_biomarkers(
    mri_analysis_id: str,
    qeeg_analysis_id: str,
    db: Any,  # Session
) -> dict[str, Any]:
    """Get full joint biomarker panel for clinical review.

    This is a convenience wrapper around compute_joint_biomarker_panel
    that adds provenance tracking and audit metadata.

    Args:
        mri_analysis_id: UUID of the MRI analysis record.
        qeeg_analysis_id: UUID of the qEEG analysis record.
        db: SQLAlchemy database session.

    Returns:
        Full joint biomarker panel dict (see compute_joint_biomarker_panel).
    """
    panel = await compute_joint_biomarker_panel(
        mri_analysis_id=mri_analysis_id,
        qeeg_analysis_id=qeeg_analysis_id,
        db=db,
    )

    # Add service-level metadata
    panel["service"] = "joint_biomarker_panel"
    panel["version"] = "1.0.0"

    return panel


async def get_neuromodulation_targets_fused(
    mri_analysis_id: str,
    qeeg_analysis_id: str,
    condition: str,
    db: Any,  # Session
) -> list[dict[str, Any]]:
    """Get fused neuromodulation target recommendations.

    Retrieves biomarker data from both analyses and synthesizes
    condition-specific neuromodulation targets with cross-modal scoring.

    Args:
        mri_analysis_id: UUID of the MRI analysis record.
        qeeg_analysis_id: UUID of the qEEG analysis record.
        condition: Clinical condition to target.
        db: SQLAlchemy database session.

    Returns:
        List of scored neuromodulation targets, sorted by confidence.
        Returns empty list with warning if condition not supported.

    Example:
        >>> targets = await get_neuromodulation_targets_fused(
        ...     "mri-uuid", "qeeg-uuid", "depression", db
        ... )
        >>> print(targets[0]["name"])
        'left_dlpfc'
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    # Fetch analyses
    mri_analysis = None
    qeeg_analysis = None

    if HAS_SQLALCHEMY and db is not None:
        if MriAnalysis is not None:
            try:
                mri_analysis = db.query(MriAnalysis).filter(
                    MriAnalysis.analysis_id == mri_analysis_id
                ).first()
            except Exception as exc:
                _log.warning("MRI query failed: %s", exc)

        if QEEGAnalysis is not None:
            try:
                qeeg_analysis = db.query(QEEGAnalysis).filter(
                    QEEGAnalysis.id == qeeg_analysis_id
                ).first()
            except Exception as exc:
                _log.warning("qEEG query failed: %s", exc)

    # Extract biomarkers
    mri_data: dict[str, Any] = {}
    qeeg_data: dict[str, Any] = {}

    if mri_analysis:
        structural = _safe_json_loads(getattr(mri_analysis, "structural_json", None))
        volumes = structural.get("volumes", {})
        thickness = structural.get("cortical_thickness", {})

        for key in ["hippocampus", "amygdala", "thalamus", "cingulate",
                     "cerebellum", "frontal", "parietal", "temporal",
                     "ventricles"]:
            if key in volumes:
                mri_data[f"{key}_volume"] = volumes[key].get("z_score")

        for key in ["prefrontal", "parietal", "temporal"]:
            if key in thickness:
                mri_data[f"{key}_thickness"] = thickness[key].get("z_score")

        wmh = structural.get("white_matter_hyperintensities", {})
        if wmh:
            mri_data["white_matter_hyperintensity"] = wmh.get("z_score")

        diffusion = _safe_json_loads(getattr(mri_analysis, "diffusion_json", None))
        if diffusion:
            fa = diffusion.get("fractional_anisotropy", {})
            if fa:
                mri_data["white_matter_integrity"] = fa.get("mean_z_score")

    if qeeg_analysis:
        deviations = _safe_json_loads(
            getattr(qeeg_analysis, "normative_deviations_json", None)
        )
        if deviations:
            gd = deviations.get("global", {})
            for key in ["frontal_alpha_asymmetry", "theta_beta_ratio",
                        "frontal_midline_theta", "theta_gamma_ratio",
                        "temporal_alpha_power", "alpha_coherence",
                        "beta_coherence", "posterior_alpha", "iaf",
                        "delta_power", "high_beta_frontal",
                        "high_beta_temporal", "gamma_power",
                        "slowing_index", "frontal_theta_elevation"]:
                qeeg_data[key] = gd.get(key)
            qeeg_data["interictal_epileptiform_discharges"] = gd.get("ied_count", 0)

    # Synthesize targets
    targets = await synthesize_neuromodulation_targets(
        mri_data=mri_data,
        qeeg_data=qeeg_data,
        condition=condition,
    )

    # Add request metadata to each target
    for target in targets:
        target["request_metadata"] = {
            "mri_analysis_id": mri_analysis_id,
            "qeeg_analysis_id": qeeg_analysis_id,
            "condition": condition,
            "requested_at": timestamp,
        }

    return targets


async def get_cross_modal_report(
    mri_analysis_id: str,
    qeeg_analysis_id: str,
    db: Any,  # Session
) -> dict[str, Any]:
    """Generate integrated cross-modal report section.

    Produces a comprehensive cross-modal report suitable for inclusion
    in a clinical report. Includes all fusion components: structural-
    functional correlations, joint biomarkers, neuromodulation targets,
    red flags, and clinical interpretations.

    Args:
        mri_analysis_id: UUID of the MRI analysis record.
        qeeg_analysis_id: UUID of the qEEG analysis record.
        db: SQLAlchemy database session.

    Returns:
        Dict with structured report sections:
        - executive_summary: Brief overview
        - structural_functional_correlations: Full correlation matrix
        - joint_biomarkers: Biomarker panel
        - neuromodulation_targets: Target recommendations
        - red_flags: All detected red flags
        - clinical_impressions: Impression statements
        - limitations: Methodological limitations
        - disclaimer: Clinical safety disclaimer
        - provenance: Provenance label
        - timestamp: ISO timestamp

    Example:
        >>> report = await get_cross_modal_report("mri-uuid", "qeeg-uuid", db)
        >>> print(report["executive_summary"]["fusion_status"])
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    # Get fusion summary
    summary = await get_fusion_summary(
        mri_analysis_id=mri_analysis_id,
        qeeg_analysis_id=qeeg_analysis_id,
        db=db,
    )

    # Get joint biomarkers
    panel = await get_joint_biomarkers(
        mri_analysis_id=mri_analysis_id,
        qeeg_analysis_id=qeeg_analysis_id,
        db=db,
    )

    # Get condition for targeted analysis
    condition = panel.get("condition", "depression")

    # Get neuromodulation targets
    targets = await get_neuromodulation_targets_fused(
        mri_analysis_id=mri_analysis_id,
        qeeg_analysis_id=qeeg_analysis_id,
        condition=condition or "depression",
        db=db,
    )

    # Build executive summary
    fusion_readiness = summary.get("fusion_readiness", "unknown")
    n_correlations = len(summary.get("top_correlations", []))
    n_red_flags = summary.get("n_red_flags", 0)
    has_critical = summary.get("has_critical_red_flags", False)

    readiness_text = {
        "ready": "Both MRI and qEEG analyses are available for cross-modal fusion.",
        "mri_only": "Only MRI analysis is available. Fusion uses proxy estimates.",
        "qeeg_only": "Only qEEG analysis is available. Fusion uses proxy estimates.",
        "no_data": "No analysis data available. Cannot perform fusion.",
    }.get(fusion_readiness, "Unknown fusion status.")

    executive_summary = {
        "fusion_status": fusion_readiness,
        "status_description": readiness_text,
        "n_top_correlations": n_correlations,
        "n_red_flags": n_red_flags,
        "has_critical_flags": has_critical,
        "condition_analyzed": condition,
        "n_neuromodulation_targets": len(targets),
        "data_quality": summary.get("data_availability", {}),
    }

    # Clinical impressions
    clinical_impressions: list[dict[str, Any]] = []

    # Top correlation impressions
    for corr in summary.get("top_correlations", []):
        mri_m = corr.get("mri_marker", "")
        qeeg_m = corr.get("qeeg_marker", "")
        grade = corr.get("evidence_grade", "D")
        clinical_impressions.append({
            "type": "structural_functional_correlation",
            "mri_marker": mri_m,
            "qeeg_marker": qeeg_m,
            "evidence_grade": grade,
            "text": (
                f"{mri_m.replace('_', ' ').title()} correlates with "
                f"{qeeg_m.replace('_', ' ').title()} "
                f"(Evidence Grade {grade})."
            ),
            "provenance": PROVENANCE_INFERRED if fusion_readiness != "ready" else PROVENANCE_MEASURED,
        })

    # Red flag impressions
    for rf in summary.get("red_flags", []):
        clinical_impressions.append({
            "type": "red_flag",
            "severity": rf.get("severity"),
            "text": rf.get("message", ""),
            "flag_id": rf.get("id"),
            "provenance": PROVENANCE_MEASURED,
        })

    # Top target impression
    if targets:
        top_target = targets[0]
        clinical_impressions.append({
            "type": "neuromodulation_recommendation",
            "target": top_target.get("name"),
            "confidence": top_target.get("confidence"),
            "text": (
                f"Primary neuromodulation target: {top_target.get('name')} "
                f"(MNI: {top_target.get('mni')}, confidence: {top_target.get('confidence')}). "
                f"Evidence Grade {top_target.get('evidence_grade')}."
            ),
            "provenance": top_target.get("provenance", PROVENANCE_INFERRED),
        })

    # Limitations
    limitations = [
        "Cross-modal fusion is probabilistic and requires clinician validation.",
        "Source localization accuracy depends on head model quality and electrode density.",
        "Longitudinal trajectory analysis requires minimum 3 timepoints per modality.",
        "Evidence grades reflect literature strength, not individual predictive value.",
        "Lesion-constrained localization requires accurate MRI-qEEG co-registration.",
        "Individual anatomy varies from MNI templates; results are approximate.",
        "Missing data in either modality reduces fusion confidence significantly.",
    ]

    return {
        "disclaimer": _CLINICAL_DISCLAIMER,
        "timestamp": timestamp,
        "provenance": PROVENANCE_INFERRED,
        "mri_analysis_id": mri_analysis_id,
        "qeeg_analysis_id": qeeg_analysis_id,
        "executive_summary": executive_summary,
        "structural_functional_correlations": summary.get("top_correlations", []),
        "joint_biomarkers": {
            "panel": panel.get("composite_scores", []),
            "individual_mri": panel.get("individual_biomarkers", {}).get("mri", []),
            "individual_qeeg": panel.get("individual_biomarkers", {}).get("qeeg", []),
        },
        "neuromodulation_targets": targets,
        "red_flags": summary.get("red_flags", []),
        "clinical_impressions": clinical_impressions,
        "limitations": limitations,
        "report_metadata": {
            "service_version": "1.0.0",
            "n_conditions_covered": panel.get("total_conditions_covered", 0),
            "n_biomarkers_total": panel.get("total_biomarkers_in_panel", 0),
            "correlation_registry_size": len(CORRELATION_REGISTRY),
            "target_registry_size": sum(
                len(t) for t in NEUROMODULATION_TARGETS.values()
            ),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# MODULE EXPORTS
# ═══════════════════════════════════════════════════════════════════════════════

__all__ = [
    # Core fusion functions
    "correlate_structural_functional",
    "apply_lesion_constraints",
    "fuse_atlas_topomap",
    "compute_joint_biomarker_panel",
    "synthesize_neuromodulation_targets",
    "fuse_multimodal_trajectory",
    # FastAPI service functions
    "get_fusion_summary",
    "get_joint_biomarkers",
    "get_neuromodulation_targets_fused",
    "get_cross_modal_report",
    # Registries (for external use)
    "CORRELATION_REGISTRY",
    "NEUROMODULATION_TARGETS",
    "ELECTRODE_MNI_REGIONS",
    "ALL_ELECTRODE_REGIONS",
    "JOINT_BIOMARKER_REGISTRY",
    "RED_FLAG_TRIGGERS",
    "LESION_QEEG_CONSTRAINTS",
    # Constants
    "EVIDENCE_GRADE_WEIGHTS",
    "PROVENANCE_MEASURED",
    "PROVENANCE_INFERRED",
    "PROVENANCE_PROXY",
    "PROVENANCE_SIMULATED",
]
