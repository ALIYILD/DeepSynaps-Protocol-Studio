"""MRI Biomarker Panel -- evidence-graded neuroimaging markers.

Implements 6 biomarker categories with 47 markers total.
All outputs include evidence grade (A-D) and safety framing.

Decision-support only -- not a diagnosis.  Every result carries
``requires_clinical_correlation: True`` and the standard MRI disclaimer.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional

_log = logging.getLogger(__name__)

# ── Biomarker registry ─ 47 markers across 6 categories ──────────────────────
# Each entry carries:
#   description      -- human-readable label
#   z_score_threshold-- threshold for flagging as abnormal
#   evidence_grade   -- A (systematic review / meta-analysis)
#                       B (RCT / large cohort)
#                       C (small cohort / case-control)
#                       D (expert opinion / preclinical)
#   conditions       -- disease contexts where marker is relevant
#   value_keys       -- JSON key path(s) inside structural_volume_json to extract
#   measure_type     -- "volume" | "thickness" | "fa" | "md" | "connectivity" |
#                       "composite" | "count"

BIOMARKER_REGISTRY: dict[str, dict[str, dict[str, Any]]] = {
    "structural": {
        # ---- Cortical thickness (regional) ----
        "cortical_thickness_frontal": {
            "description": "Frontal cortical thickness",
            "value_keys": ["cortical_thickness_mm", "frontal"],
            "z_score_threshold": 2.5,
            "evidence_grade": "A",
            "conditions": ["depression", "alzheimers", "parkinsons", "ftd"],
            "measure_type": "thickness",
            "region_detail": ["superior_frontal", "middle_frontal", "inferior_frontal", "precentral"],
        },
        "cortical_thickness_temporal": {
            "description": "Temporal cortical thickness",
            "value_keys": ["cortical_thickness_mm", "temporal"],
            "z_score_threshold": 2.5,
            "evidence_grade": "A",
            "conditions": ["alzheimers", "depression", "ptsd", "epilepsy", "mci"],
            "measure_type": "thickness",
            "region_detail": ["superior_temporal", "middle_temporal", "inferior_temporal", "entorhinal"],
        },
        "cortical_thickness_parietal": {
            "description": "Parietal cortical thickness",
            "value_keys": ["cortical_thickness_mm", "parietal"],
            "z_score_threshold": 2.5,
            "evidence_grade": "A",
            "conditions": ["alzheimers", "parkinsons"],
            "measure_type": "thickness",
            "region_detail": ["superior_parietal", "inferior_parietal", "precuneus", "postcentral"],
        },
        "cortical_thickness_occipital": {
            "description": "Occipital cortical thickness",
            "value_keys": ["cortical_thickness_mm", "occipital"],
            "z_score_threshold": 2.5,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "parkinsons", "glaucoma"],
            "measure_type": "thickness",
            "region_detail": ["cuneus", "lingual", "lateral_occipital"],
        },
        "cortical_thickness_cingulate": {
            "description": "Cingulate cortical thickness",
            "value_keys": ["cortical_thickness_mm", "cingulate"],
            "z_score_threshold": 2.5,
            "evidence_grade": "A",
            "conditions": ["depression", "alzheimers", "bipolar", "ocd"],
            "measure_type": "thickness",
            "region_detail": ["rostral_anterior_cingulate", "caudal_anterior_cingulate", "posterior_cingulate", "isthmus_cingulate"],
        },
        "cortical_thickness_insula": {
            "description": "Insular cortical thickness",
            "value_keys": ["cortical_thickness_mm", "insula"],
            "z_score_threshold": 2.5,
            "evidence_grade": "B",
            "conditions": ["depression", "ptsd", "chronic_pain", "addiction"],
            "measure_type": "thickness",
            "region_detail": ["insula_left", "insula_right"],
        },
        # ---- Hippocampal volume ----
        "hippocampal_volume_left": {
            "description": "Left hippocampal volume",
            "value_keys": ["subcortical_volume_mm3", "hippocampus_l"],
            "z_score_threshold": 2.0,
            "evidence_grade": "A",
            "conditions": ["alzheimers", "depression", "ptsd", "epilepsy", "mci"],
            "measure_type": "volume",
        },
        "hippocampal_volume_right": {
            "description": "Right hippocampal volume",
            "value_keys": ["subcortical_volume_mm3", "hippocampus_r"],
            "z_score_threshold": 2.0,
            "evidence_grade": "A",
            "conditions": ["alzheimers", "depression", "ptsd", "epilepsy", "mci"],
            "measure_type": "volume",
        },
        "hippocampal_volume_total": {
            "description": "Total hippocampal volume (left + right)",
            "value_keys": [],  # computed from left + right
            "z_score_threshold": 2.0,
            "evidence_grade": "A",
            "conditions": ["alzheimers", "depression", "ptsd", "epilepsy", "mci"],
            "measure_type": "volume",
        },
        "hippocampal_asymmetry": {
            "description": "Hippocampal asymmetry index",
            "value_keys": ["hippocampal_asymmetry_index"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["epilepsy", "alzheimers", "depression"],
            "measure_type": "composite",
        },
        # ---- Ventricular volume ----
        "ventricular_volume_lateral_left": {
            "description": "Left lateral ventricle volume",
            "value_keys": ["ventricular_volume_mm3", "lateral_left"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "hydrocephalus", "aging", "schizophrenia"],
            "measure_type": "volume",
        },
        "ventricular_volume_lateral_right": {
            "description": "Right lateral ventricle volume",
            "value_keys": ["ventricular_volume_mm3", "lateral_right"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "hydrocephalus", "aging", "schizophrenia"],
            "measure_type": "volume",
        },
        "ventricular_volume_third": {
            "description": "Third ventricle volume",
            "value_keys": ["ventricular_volume_mm3", "third"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "hydrocephalus", "parkinsons"],
            "measure_type": "volume",
        },
        "ventricular_volume_total_csf": {
            "description": "Total CSF volume",
            "value_keys": ["ventricular_volume_ml"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "hydrocephalus", "aging"],
            "measure_type": "volume",
        },
        # ---- Other subcortical volumes ----
        "amygdala_volume_left": {
            "description": "Left amygdala volume",
            "value_keys": ["subcortical_volume_mm3", "amygdala_l"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["depression", "ptsd", "anxiety", "alzheimers"],
            "measure_type": "volume",
        },
        "amygdala_volume_right": {
            "description": "Right amygdala volume",
            "value_keys": ["subcortical_volume_mm3", "amygdala_r"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["depression", "ptsd", "anxiety", "alzheimers"],
            "measure_type": "volume",
        },
        "thalamus_volume_left": {
            "description": "Left thalamus volume",
            "value_keys": ["subcortical_volume_mm3", "thalamus_l"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "parkinsons", "schizophrenia", "tbi"],
            "measure_type": "volume",
        },
        "thalamus_volume_right": {
            "description": "Right thalamus volume",
            "value_keys": ["subcortical_volume_mm3", "thalamus_r"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "parkinsons", "schizophrenia", "tbi"],
            "measure_type": "volume",
        },
        "caudate_volume_left": {
            "description": "Left caudate volume",
            "value_keys": ["subcortical_volume_mm3", "caudate_l"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["parkinsons", "huntingtons", "depression", "ocd"],
            "measure_type": "volume",
        },
        "caudate_volume_right": {
            "description": "Right caudate volume",
            "value_keys": ["subcortical_volume_mm3", "caudate_r"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["parkinsons", "huntingtons", "depression", "ocd"],
            "measure_type": "volume",
        },
        "putamen_volume_left": {
            "description": "Left putamen volume",
            "value_keys": ["subcortical_volume_mm3", "putamen_l"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["parkinsons", "huntingtons", "dystonia"],
            "measure_type": "volume",
        },
        "putamen_volume_right": {
            "description": "Right putamen volume",
            "value_keys": ["subcortical_volume_mm3", "putamen_r"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["parkinsons", "huntingtons", "dystonia"],
            "measure_type": "volume",
        },
        "pallidum_volume_left": {
            "description": "Left globus pallidus volume",
            "value_keys": ["subcortical_volume_mm3", "pallidum_l"],
            "z_score_threshold": 2.0,
            "evidence_grade": "C",
            "conditions": ["parkinsons", "dystonia"],
            "measure_type": "volume",
        },
        "pallidum_volume_right": {
            "description": "Right globus pallidus volume",
            "value_keys": ["subcortical_volume_mm3", "pallidum_r"],
            "z_score_threshold": 2.0,
            "evidence_grade": "C",
            "conditions": ["parkinsons", "dystonia"],
            "measure_type": "volume",
        },
        "acc_volume_left": {
            "description": "Left anterior cingulate cortex volume",
            "value_keys": ["subcortical_volume_mm3", "acc_l"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["depression", "ocd", "bipolar", "chronic_pain"],
            "measure_type": "volume",
        },
        "acc_volume_right": {
            "description": "Right anterior cingulate cortex volume",
            "value_keys": ["subcortical_volume_mm3", "acc_r"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["depression", "ocd", "bipolar", "chronic_pain"],
            "measure_type": "volume",
        },
    },
    "diffusion": {
        "fractional_anisotropy_corpus_callosum": {
            "description": "Fractional anisotropy -- corpus callosum",
            "value_keys": ["diffusion", "bundles", "corpus_callosum"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["tbi", "stroke", "ms", "dementia"],
            "measure_type": "fa",
            "bundle": "corpus_callosum",
        },
        "fractional_anisotropy_corticospinal": {
            "description": "Fractional anisotropy -- corticospinal tract",
            "value_keys": ["diffusion", "bundles", "corticospinal"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["stroke", "als", "parkinsons", "tbi"],
            "measure_type": "fa",
            "bundle": "corticospinal",
        },
        "fractional_anisotropy_superior_longitudinal": {
            "description": "Fractional anisotropy -- superior longitudinal fasciculus",
            "value_keys": ["diffusion", "bundles", "superior_longitudinal"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["tbi", "stroke", "aphasia", "adhd"],
            "measure_type": "fa",
            "bundle": "superior_longitudinal",
        },
        "fractional_anisotropy_uncinate": {
            "description": "Fractional anisotropy -- uncinate fasciculus",
            "value_keys": ["diffusion", "bundles", "uncinate"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["depression", "bipolar", "ftd", "tbi"],
            "measure_type": "fa",
            "bundle": "uncinate",
        },
        "fractional_anisotropy_fornix": {
            "description": "Fractional anisotropy -- fornix",
            "value_keys": ["diffusion", "bundles", "fornix"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "depression", "amnesia"],
            "measure_type": "fa",
            "bundle": "fornix",
        },
        "mean_diffusivity_frontal_wm": {
            "description": "Mean diffusivity -- frontal white matter",
            "value_keys": ["diffusion", "md", "frontal_wm"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["tbi", "stroke", "dementia", "ms"],
            "measure_type": "md",
        },
        "mean_diffusivity_parietal_wm": {
            "description": "Mean diffusivity -- parietal white matter",
            "value_keys": ["diffusion", "md", "parietal_wm"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["tbi", "stroke", "dementia"],
            "measure_type": "md",
        },
        "mean_diffusivity_temporal_wm": {
            "description": "Mean diffusivity -- temporal white matter",
            "value_keys": ["diffusion", "md", "temporal_wm"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["tbi", "stroke", "dementia"],
            "measure_type": "md",
        },
        "mean_diffusivity_occipital_wm": {
            "description": "Mean diffusivity -- occipital white matter",
            "value_keys": ["diffusion", "md", "occipital_wm"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["tbi", "stroke", "dementia"],
            "measure_type": "md",
        },
    },
    "white_matter": {
        "wmh_burden_total": {
            "description": "White matter hyperintensity total volume (mL)",
            "value_keys": ["wmh_volume_ml"],
            "z_score_threshold": 2.0,
            "evidence_grade": "A",
            "conditions": ["dementia", "stroke", "hypertension", "aging", "diabetes"],
            "measure_type": "volume",
        },
        "wmh_fazekas_periventricular": {
            "description": "Fazekas scale -- periventricular WMH (0-3)",
            "value_keys": ["wmh_fazekas", "periventricular"],
            "z_score_threshold": 1.5,
            "evidence_grade": "A",
            "conditions": ["dementia", "stroke", "aging"],
            "measure_type": "count",
        },
        "wmh_fazekas_deep": {
            "description": "Fazekas scale -- deep WMH (0-3)",
            "value_keys": ["wmh_fazekas", "deep"],
            "z_score_threshold": 1.5,
            "evidence_grade": "A",
            "conditions": ["dementia", "stroke", "aging", "hypertension"],
            "measure_type": "count",
        },
        "wmh_top_locations": {
            "description": "Top 3 WMH locations",
            "value_keys": ["wmh_top_locations"],
            "z_score_threshold": None,
            "evidence_grade": "B",
            "conditions": ["dementia", "stroke", "aging"],
            "measure_type": "count",
        },
    },
    "functional": {
        "bold_connectivity_dmn": {
            "description": "Default mode network (DMN) functional connectivity",
            "value_keys": ["functional", "networks", "DMN"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["depression", "alzheimers", "autism", "adhd", "schizophrenia"],
            "measure_type": "connectivity",
        },
        "bold_connectivity_salience": {
            "description": "Salience network functional connectivity",
            "value_keys": ["functional", "networks", "SN"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["depression", "anxiety", "chronic_pain", "ptsd"],
            "measure_type": "connectivity",
        },
        "bold_connectivity_cen": {
            "description": "Central executive network (CEN) functional connectivity",
            "value_keys": ["functional", "networks", "CEN"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["depression", "adhd", "alzheimers", "mci"],
            "measure_type": "connectivity",
        },
        "bold_connectivity_language": {
            "description": "Language network functional connectivity",
            "value_keys": ["functional", "networks", "language"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["aphasia", "autism", "stroke"],
            "measure_type": "connectivity",
        },
        "bold_connectivity_sensorimotor": {
            "description": "Sensorimotor network functional connectivity",
            "value_keys": ["functional", "networks", "sensorimotor"],
            "z_score_threshold": 2.0,
            "evidence_grade": "C",
            "conditions": ["stroke", "parkinsons", "chronic_pain"],
            "measure_type": "connectivity",
        },
        "bold_connectivity_sgacc_dlpfc": {
            "description": "sgACC-DLPFC anticorrelation",
            "value_keys": ["functional", "sgACC_DLPFC_anticorrelation"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["depression", "anxiety"],
            "measure_type": "connectivity",
        },
    },
    "composite": {
        "brain_age_gap": {
            "description": "Brain age gap (predicted - chronological age)",
            "value_keys": ["structural", "brain_age", "brain_age_gap_years"],
            "z_score_threshold": None,
            "evidence_grade": "B",
            "conditions": ["dementia", "diabetes", "hypertension", "depression"],
            "measure_type": "composite",
            "threshold_years": 5.0,
        },
        "atrophy_score_global": {
            "description": "Global atrophy composite score",
            "value_keys": ["atrophy_score"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "aging", "mci"],
            "measure_type": "composite",
        },
        "ventricular_enlargement_index": {
            "description": "Ventricular enlargement relative to ICV",
            "value_keys": ["ventricular_volume_ml"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "hydrocephalus", "aging"],
            "measure_type": "composite",
        },
        "cortical_thinning_index": {
            "description": "Mean cortical thinning index (global average z)",
            "value_keys": ["cortical_thinning_index"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["alzheimers", "aging", "ftd"],
            "measure_type": "composite",
        },
        "hippocampal_reduction_index": {
            "description": "Hippocampal volume reduction index",
            "value_keys": ["hippocampal_reduction_index"],
            "z_score_threshold": 2.0,
            "evidence_grade": "A",
            "conditions": ["alzheimers", "depression", "ptsd"],
            "measure_type": "composite",
        },
        "icv_total": {
            "description": "Intracranial volume (ICV)",
            "value_keys": ["icv_ml"],
            "z_score_threshold": 2.0,
            "evidence_grade": "B",
            "conditions": ["aging", "developmental"],
            "measure_type": "volume",
        },
    },
}

# Flat count for validation
_TOTAL_MARKER_COUNT = sum(len(markers) for markers in BIOMARKER_REGISTRY.values())


# ── Public API ───────────────────────────────────────────────────────────────


def compute_biomarker_panel(
    analysis_data: dict[str, Any],
    patient_age: int,
    patient_sex: str,
) -> dict[str, Any]:
    """Compute the full evidence-graded biomarker panel.

    Parameters
    ----------
    analysis_data:
        Parsed MRI analysis JSON (the ``structural_volume_json`` payload).
    patient_age:
        Chronological age in years.
    patient_sex:
        ``"M"``, ``"F"``, or ``"O"``.

    Returns
    -------
    dict
        Panel with all 47 markers grouped by category, plus a summary.
        Decision-support only -- not a diagnosis.
    """
    panel: dict[str, Any] = {
        "patient_age": patient_age,
        "patient_sex": patient_sex,
        "categories": {},
        "abnormal_count": 0,
        "total_count": 0,
        "safety_note": (
            "Biomarkers are decision support only. "
            "Requires clinician/radiologist review. Not a diagnostic device."
        ),
        "requires_clinical_correlation": True,
    }

    for category, markers in BIOMARKER_REGISTRY.items():
        category_results: dict[str, dict[str, Any]] = {}
        for marker_name, marker_def in markers.items():
            result = _compute_single_biomarker(
                name=marker_name,
                definition=marker_def,
                data=analysis_data,
                age=patient_age,
                sex=patient_sex,
            )
            category_results[marker_name] = result
            panel["total_count"] += 1
            if result.get("is_abnormal"):
                panel["abnormal_count"] += 1
        panel["categories"][category] = category_results

    panel["summary"] = (
        f"{panel['abnormal_count']}/{panel['total_count']} biomarkers abnormal "
        f"(requires clinical correlation)"
    )
    return panel


def get_biomarker_registry() -> dict[str, dict[str, dict[str, Any]]]:
    """Return the full biomarker registry (for documentation / UI rendering)."""
    return BIOMARKER_REGISTRY


def get_registry_summary() -> dict[str, Any]:
    """Return a high-level summary of the biomarker registry."""
    return {
        "total_markers": _TOTAL_MARKER_COUNT,
        "category_counts": {
            cat: len(markers) for cat, markers in BIOMARKER_REGISTRY.items()
        },
        "evidence_grade_distribution": _grade_distribution(),
        "categories": list(BIOMARKER_REGISTRY.keys()),
    }


# ── Internal helpers ─────────────────────────────────────────────────────────


def _compute_single_biomarker(
    name: str,
    definition: dict[str, Any],
    data: dict[str, Any],
    age: int,
    sex: str,
) -> dict[str, Any]:
    """Compute a single biomarker with z-score and evidence grade."""
    value = _extract_value(data, definition.get("value_keys", []))

    if value is None and name == "hippocampal_volume_total":
        # Special case: compute total from left + right
        left = _extract_value(data, ["subcortical_volume_mm3", "hippocampus_l"])
        right = _extract_value(data, ["subcortical_volume_mm3", "hippocampus_r"])
        if left is not None and right is not None:
            value = left + right

    if value is None:
        return {
            "name": name,
            "description": definition["description"],
            "status": "missing_data",
            "evidence_grade": definition.get("evidence_grade", "D"),
            "is_abnormal": False,
            "requires_clinical_correlation": True,
            "note": "Data not available for this analysis.",
        }

    # Compute z-score using normative database
    population_mean = _get_population_mean(name, age, sex)
    population_std = _get_population_std(name, age, sex)

    if population_std and population_std > 0:
        z_score = (value - population_mean) / population_std
    else:
        z_score = None

    # Determine abnormality
    threshold = definition.get("z_score_threshold")
    if threshold is not None and z_score is not None:
        is_abnormal = abs(z_score) > threshold
    elif name == "brain_age_gap":
        gap_threshold = definition.get("threshold_years", 5.0)
        is_abnormal = value > gap_threshold
    else:
        is_abnormal = False

    return {
        "name": name,
        "description": definition["description"],
        "value": round(value, 4) if isinstance(value, float) else value,
        "z_score": round(z_score, 2) if z_score is not None else None,
        "population_mean": population_mean,
        "population_std": population_std,
        "threshold": threshold,
        "is_abnormal": is_abnormal,
        "evidence_grade": definition.get("evidence_grade", "D"),
        "conditions": definition.get("conditions", []),
        "measure_type": definition.get("measure_type", "unknown"),
        "status": "abnormal" if is_abnormal else "normal",
        "requires_clinical_correlation": True,
    }


def _extract_value(data: dict[str, Any], key_path: list[str]) -> Any:
    """Extract a nested value from a dict using a key path.

    Supports two access patterns:
    1.  Nested dict traversal: ``data[a][b][c]``
    2.  Flat key lookup with structured value: if the leaf is a dict
        with ``value`` or ``z`` keys, extract the numeric value.
    """
    if not key_path:
        return None
    node: Any = data
    for key in key_path:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
        if node is None:
            return None
    # Unwrap structured values
    if isinstance(node, dict):
        if "value" in node:
            return node["value"]
        if "z" in node:
            return node["z"]  # z-score stored directly
    return node


def _get_population_mean(name: str, age: int, sex: str) -> float:
    """Get population mean from normative database (stub).

    In production this would query an age- and sex-matched normative
    database (e.g., iSTAGING, UK Biobank-derived norms).
    """
    # Stub: return sensible defaults per marker type
    _DEFAULT_MEANS: dict[str, float] = {
        "cortical_thickness": 2.6,
        "hippocampal_volume": 3800.0,
        "amygdala_volume": 1500.0,
        "thalamus_volume": 7000.0,
        "caudate_volume": 3500.0,
        "putamen_volume": 5000.0,
        "pallidum_volume": 1500.0,
        "acc_volume": 2800.0,
        "ventricular_volume": 25.0,
        "fractional_anisotropy": 0.45,
        "mean_diffusivity": 7.5e-4,
        "wmh_burden": 2.0,
        "bold_connectivity": 0.35,
        "brain_age_gap": 0.0,
        "atrophy_score": 0.0,
        "icv": 1450.0,
    }
    for prefix, mean in _DEFAULT_MEANS.items():
        if prefix in name:
            return mean
    return 0.0


def _get_population_std(name: str, age: int, sex: str) -> float:
    """Get population standard deviation from normative database (stub).

    In production this would query an age- and sex-matched normative
    database with variance estimates.
    """
    _DEFAULT_STDS: dict[str, float] = {
        "cortical_thickness": 0.15,
        "hippocampal_volume": 400.0,
        "amygdala_volume": 200.0,
        "thalamus_volume": 600.0,
        "caudate_volume": 300.0,
        "putamen_volume": 400.0,
        "pallidum_volume": 150.0,
        "acc_volume": 250.0,
        "ventricular_volume": 8.0,
        "fractional_anisotropy": 0.05,
        "mean_diffusivity": 1.0e-4,
        "wmh_burden": 1.5,
        "bold_connectivity": 0.08,
        "brain_age_gap": 4.0,
        "atrophy_score": 1.0,
        "icv": 120.0,
    }
    for prefix, std in _DEFAULT_STDS.items():
        if prefix in name:
            return std
    return 1.0


def _grade_distribution() -> dict[str, int]:
    """Count markers per evidence grade."""
    dist: dict[str, int] = {"A": 0, "B": 0, "C": 0, "D": 0}
    for markers in BIOMARKER_REGISTRY.values():
        for marker in markers.values():
            grade = marker.get("evidence_grade", "D")
            dist[grade] = dist.get(grade, 0) + 1
    return dist
