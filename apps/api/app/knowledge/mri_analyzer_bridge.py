"""MRI Analyzer Bridge — Synthesizes neuroimaging data from 13 cohort/atlas adapters.

Provides structural analysis, cohort matching, longitudinal atrophy detection,
and comprehensive MRI clinical reporting by combining data from:
  - Atlas adapters: MNI Atlas, Schaefer
  - Cohort adapters: ADNI, ABIDE, OASIS, HCP, OpenNeuro, COBRE, CORR,
                     IXI, ds030, GSP, ADHD-200

All outputs are research-only and require expert radiological interpretation.
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Adapter imports ────────────────────────────────────────────────────────────
# These are imported at runtime via the registry; module-level imports
# are kept as lightweight forward references for type checking.

# ── Configuration ──────────────────────────────────────────────────────────────

_VERSION = "2.0.0"
_BRIDGE_NAME = "mri_analyzer_bridge"

# Confidence weights per adapter category
_WEIGHTS: dict[str, float] = {
    # Atlas adapters
    "mni_atlas": 0.92,
    "schaefer": 0.88,
    # Cohort adapters (longitudinal / high quality)
    "adni": 0.90,
    "oasis": 0.87,
    "hcp": 0.85,
    # Cohort adapters (cross-sectional / good quality)
    "abide": 0.78,
    "openneuro": 0.75,
    "cobre": 0.72,
    "corr": 0.70,
    "ixi": 0.68,
    "ds030": 0.70,
    "gsp": 0.73,
    "adhd_200": 0.70,
    # Fallback
    "local_fallback": 0.50,
    "insufficient": 0.20,
}

# Condition → relevant adapter mapping
_CONDITION_ADAPTERS: dict[str, list[str]] = {
    "alzheimers_disease": ["adni", "oasis"],
    "mild_cognitive_impairment": ["adni", "oasis"],
    "autism_spectrum_disorder": ["abide"],
    "adhd": ["adhd_200", "gsp"],
    "schizophrenia": ["cobre", "ds030"],
    "depression": ["corr", "gsp"],
    "epilepsy": ["openneuro"],
    "parkinsons_disease": ["openneuro", "gsp"],
    "multiple_sclerosis": ["corr"],
    "brain_aging": ["oasis", "ixi", "gsp"],
    "healthy_control": ["hcp", "ixi", "gsp"],
}

# Local normative volumetric data (cm³) — embedded fallback
# Sources: OASIS-3, ADNI, HCP normative compilations
_LOCAL_VOLUMETRIC_NORMS: dict[str, dict[str, Any]] = {
    "hippocampus_left": {"mean": 3.20, "std": 0.45, "unit": "cm³", "source": "OASIS+ADNI pooled"},
    "hippocampus_right": {"mean": 3.30, "std": 0.44, "unit": "cm³", "source": "OASIS+ADNI pooled"},
    "entorhinal_cortex": {"mean": 2.90, "std": 0.50, "unit": "cm³", "source": "ADNI"},
    "amygdala_left": {"mean": 1.45, "std": 0.22, "unit": "cm³", "source": "HCP"},
    "amygdala_right": {"mean": 1.50, "std": 0.23, "unit": "cm³", "source": "HCP"},
    "thalamus_left": {"mean": 7.20, "std": 0.85, "unit": "cm³", "source": "HCP"},
    "thalamus_right": {"mean": 7.10, "std": 0.83, "unit": "cm³", "source": "HCP"},
    "caudate_left": {"mean": 3.40, "std": 0.42, "unit": "cm³", "source": "HCP"},
    "caudate_right": {"mean": 3.50, "std": 0.41, "unit": "cm³", "source": "HCP"},
    "putamen_left": {"mean": 4.80, "std": 0.55, "unit": "cm³", "source": "HCP"},
    "putamen_right": {"mean": 4.90, "std": 0.54, "unit": "cm³", "source": "HCP"},
    "pallidum_left": {"mean": 1.50, "std": 0.20, "unit": "cm³", "source": "HCP"},
    "pallidum_right": {"mean": 1.55, "std": 0.21, "unit": "cm³", "source": "HCP"},
    "ventricles_lateral": {"mean": 18.50, "std": 8.20, "unit": "cm³", "source": "OASIS"},
    "cortex_total": {"mean": 520.0, "std": 55.0, "unit": "cm³", "source": "HCP"},
    "cerebellum_total": {"mean": 145.0, "std": 18.0, "unit": "cm³", "source": "HCP"},
    "brainstem": {"mean": 22.0, "std": 3.0, "unit": "cm³", "source": "HCP"},
}

# Local cohort descriptors for matching fallback
_LOCAL_COHORTS: dict[str, dict[str, Any]] = {
    "ADNI_CN": {
        "condition": "healthy_control",
        "n_subjects": 229,
        "age_range": [55, 95],
        "age_mean": 75.8,
        "source": "adni",
        "description": "ADNI cognitively normal elderly",
    },
    "ADNI_MCI": {
        "condition": "mild_cognitive_impairment",
        "n_subjects": 383,
        "age_range": [55, 95],
        "age_mean": 74.5,
        "source": "adni",
        "description": "ADNI mild cognitive impairment",
    },
    "ADNI_AD": {
        "condition": "alzheimers_disease",
        "n_subjects": 302,
        "age_range": [55, 95],
        "age_mean": 75.2,
        "source": "adni",
        "description": "ADNI Alzheimer's disease",
    },
    "ADNI_MCI_converter": {
        "condition": "mild_cognitive_impairment",
        "n_subjects": 302,
        "age_range": [55, 95],
        "age_mean": 74.8,
        "source": "adni",
        "time_to_conversion_median": "18 months",
        "description": "ADNI MCI subjects who converted to AD",
    },
    "OASIS_dementia": {
        "condition": "alzheimers_disease",
        "n_subjects": 416,
        "age_range": [60, 100],
        "age_mean": 77.1,
        "source": "oasis",
        "description": "OASIS dementia cohort",
    },
    "OASIS_nondemented": {
        "condition": "healthy_control",
        "n_subjects": 424,
        "age_range": [60, 100],
        "age_mean": 72.3,
        "source": "oasis",
        "description": "OASIS non-demented aging",
    },
    "ABIDE_I_ASD": {
        "condition": "autism_spectrum_disorder",
        "n_subjects": 539,
        "age_range": [7, 65],
        "age_mean": 17.2,
        "source": "abide",
        "description": "ABIDE I autism spectrum",
    },
    "ABIDE_II_ASD": {
        "condition": "autism_spectrum_disorder",
        "n_subjects": 487,
        "age_range": [5, 65],
        "age_mean": 15.8,
        "source": "abide",
        "description": "ABIDE II autism spectrum",
    },
    "HCP_young_adult": {
        "condition": "healthy_control",
        "n_subjects": 1206,
        "age_range": [22, 37],
        "age_mean": 28.8,
        "source": "hcp",
        "description": "HCP young adult reference",
    },
    "HCP_aging": {
        "condition": "brain_aging",
        "n_subjects": 724,
        "age_range": [36, 100],
        "age_mean": 58.4,
        "source": "hcp",
        "description": "HCP aging cohort",
    },
    "COBRE_schizophrenia": {
        "condition": "schizophrenia",
        "n_subjects": 72,
        "age_range": [18, 65],
        "age_mean": 35.6,
        "source": "cobre",
        "description": "COBRE schizophrenia",
    },
    "ADHD_200_ADHD": {
        "condition": "adhd",
        "n_subjects": 285,
        "age_range": [7, 21],
        "age_mean": 11.8,
        "source": "adhd_200",
        "description": "ADHD-200 combined ADHD",
    },
    "ADHD_200_control": {
        "condition": "healthy_control",
        "n_subjects": 379,
        "age_range": [7, 21],
        "age_mean": 12.1,
        "source": "adhd_200",
        "description": "ADHD-200 typically developing",
    },
    "GSP_young_adult": {
        "condition": "healthy_control",
        "n_subjects": 1570,
        "age_range": [18, 35],
        "age_mean": 24.5,
        "source": "gsp",
        "description": "GSP young adult reference",
    },
    "IXI_healthy": {
        "condition": "healthy_control",
        "n_subjects": 600,
        "age_range": [20, 86],
        "age_mean": 48.3,
        "source": "ixi",
        "description": "IXI cross-sectional healthy aging",
    },
    "ds030_schizophrenia": {
        "condition": "schizophrenia",
        "n_subjects": 49,
        "age_range": [18, 65],
        "age_mean": 37.2,
        "source": "ds030",
        "description": "ds030 (OpenfMRI) schizophrenia",
    },
    "CORR_multisite": {
        "condition": "healthy_control",
        "n_subjects": 1396,
        "age_range": [4, 85],
        "age_mean": 32.1,
        "source": "corr",
        "description": "CORR multisite aggregation",
    },
}

# Local atlas parcellation fallback
_LOCAL_ATLAS_PARC: dict[str, dict[str, Any]] = {
    "schaefer": {
        "networks_available": ["Vis", "SomMot", "DorsAttn", "SalVentAttn", "Limbic", "Cont", "Default"],
        "default_network_dominance": "Default",
        "parcel_count": 400,
        "space": "MNI152",
    },
    "glasser2016": {
        "areas": 360,
        "hemisphere_split": 180,
        "space": "fs_LR",
        "description": "Glasser 2016 multi-modal parcellation",
    },
    "aal3": {
        "regions": 170,
        "space": "MNI152",
        "description": "AAL3 anatomical parcellation",
    },
}

# Progression model parameters (research-only embedded estimates)
_PROGRESSION_MODELS: dict[str, dict[str, Any]] = {
    "ADNI_progression_MRI": {
        "condition": "alzheimers_disease",
        "baseline_features": ["hippocampal_volume", "entorhinal_thickness", "ventricular_volume"],
        "timepoints": ["6_month", "12_month", "24_month"],
        "auc_estimate": 0.82,
    },
    "OASIS_atrophy_trajectory": {
        "condition": "alzheimers_disease",
        "baseline_features": ["cortical_thickness", "hippocampal_volume"],
        "timepoints": ["6_month", "12_month", "24_month"],
        "auc_estimate": 0.78,
    },
    "ABIDE_deviation_model": {
        "condition": "autism_spectrum_disorder",
        "baseline_features": ["cortical_thickness", "surface_area"],
        "timepoints": ["6_month", "12_month"],
        "auc_estimate": 0.68,
    },
}

# Atrophy significance thresholds
_ATROPHY_THRESHOLDS = {
    "mild": 0.01,      # 1% volume loss
    "moderate": 0.03,  # 3% volume loss
    "severe": 0.05,    # 5% volume loss
}


# ── Provenance helper ──────────────────────────────────────────────────────────

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
        "bridge": _BRIDGE_NAME,
        "version": _VERSION,
    }
    if meta:
        p["metadata"] = meta
    return p


def _z_score(patient_val: float, mean: float, std: float) -> float:
    """Calculate z-score; return 0.0 if std is zero."""
    if std == 0 or math.isnan(std):
        return 0.0
    return (patient_val - mean) / std


def _two_tailed_p(z: float) -> float:
    """Approximate two-tailed p-value from z-score using error function."""
    try:
        return 2.0 * (1.0 - 0.5 * (1.0 + math.erf(abs(z) / math.sqrt(2.0))))
    except (ValueError, OverflowError):
        return 1.0


def _sigmoid(x: float) -> float:
    """Sigmoid function for probability calibration."""
    try:
        return 1.0 / (1.0 + math.exp(-x))
    except OverflowError:
        return 0.0 if x < 0 else 1.0


def _compute_similarity(patient_features: dict[str, Any], cohort: dict[str, Any]) -> float:
    """Compute a simple similarity score between patient features and cohort descriptor."""
    score = 0.0
    weights = 0.0

    # Age similarity
    patient_age = patient_features.get("age")
    if patient_age is not None and "age_range" in cohort:
        age_min, age_max = cohort["age_range"]
        age_mean = cohort.get("age_mean", (age_min + age_max) / 2)
        age_std = (age_max - age_min) / 4.0
        if age_std > 0:
            age_z = abs(patient_age - age_mean) / age_std
            score += max(0.0, 1.0 - age_z * 0.3)
            weights += 1.0

    # Sex match
    patient_sex = patient_features.get("sex", "").lower()
    cohort_sex_ratio = cohort.get("sex_ratio_male", 0.5)
    if patient_sex in ("m", "male"):
        score += cohort_sex_ratio
        weights += 1.0
    elif patient_sex in ("f", "female"):
        score += (1.0 - cohort_sex_ratio)
        weights += 1.0
    else:
        score += 0.5
        weights += 0.5

    # Condition match
    patient_dx = patient_features.get("diagnosis", patient_features.get("condition", ""))
    cohort_dx = cohort.get("condition", "")
    if patient_dx and cohort_dx:
        if patient_dx.lower() == cohort_dx.lower():
            score += 1.0
            weights += 2.0
        else:
            # Partial match via condition-adaptor mapping
            related = _CONDITION_ADAPTERS.get(patient_dx, [])
            if cohort.get("source", "") in related:
                score += 0.4
                weights += 1.0

    # Education years (if available)
    patient_edu = patient_features.get("education_years")
    cohort_edu = cohort.get("education_mean")
    if patient_edu is not None and cohort_edu is not None:
        edu_std = cohort.get("education_std", 3.0)
        if edu_std > 0:
            edu_z = abs(patient_edu - cohort_edu) / edu_std
            score += max(0.0, 1.0 - edu_z * 0.2)
            weights += 0.5

    return round(score / weights, 4) if weights > 0 else 0.5


# ── MRI Analyzer Bridge ────────────────────────────────────────────────────────


class MRIAnalyzerBridge:
    """Bridge synthesizing neuroimaging data from 13 cohort/atlas adapters.

    Provides structural analysis, cohort matching, longitudinal atrophy
    detection, and full MRI clinical reporting. All outputs are flagged
    as research-only and require expert interpretation.
    """

    # All 13 adapters this bridge consumes
    _ADAPTER_KEYS = [
        "mni_atlas",
        "schaefer",
        "adni",
        "abide",
        "oasis",
        "hcp",
        "openneuro",
        "cobre",
        "corr",
        "ixi",
        "ds030",
        "gsp",
        "adhd_200",
    ]

    def __init__(self, registry: Any) -> None:
        """Initialize bridge with adapter registry.

        Args:
            registry: Mapping of adapter name -> adapter instance.
        """
        self._adapters: dict[str, Any] = {}
        for key in self._ADAPTER_KEYS:
            adapter = registry.get(key)
            if adapter:
                self._adapters[key] = adapter
            else:
                logger.warning("MRIAnalyzerBridge: %s adapter not available", key)

    # ── internal helpers ─────────────────────────────────────────────────────

    def _get_adapter(self, name: str) -> Any | None:
        return self._adapters.get(name)

    def _available_adapters(self, names: list[str]) -> list[str]:
        return [n for n in names if n in self._adapters]

    async def _safe_adapter_call(
        self,
        adapter_name: str,
        method: str,
        *args: Any,
        **kwargs: Any,
    ) -> Any | None:
        """Call an adapter method, catching all exceptions and returning None."""
        adapter = self._get_adapter(adapter_name)
        if adapter is None:
            return None
        try:
            method_fn = getattr(adapter, method, None)
            if method_fn is None:
                logger.warning("%s adapter has no method %s", adapter_name, method)
                return None
            if asyncio.iscoroutinefunction(method_fn):
                return await method_fn(*args, **kwargs)
            else:
                return method_fn(*args, **kwargs)
        except Exception as exc:
            logger.warning("%s adapter %s call failed: %s", adapter_name, method, exc)
            return None

    # ── 1. structural_analysis ───────────────────────────────────────────────

    async def structural_analysis(
        self,
        patient_mri: dict[str, Any],
        condition: str,
    ) -> dict[str, Any]:
        """Perform structural MRI analysis synthesizing atlas and cohort data.

        Args:
            patient_mri: Patient scan data with keys like patient_id, scan_type,
                         and volumetric measurements per region.
            condition: Clinical condition slug (e.g. 'alzheimers_disease').

        Returns:
            Dict with volumetric_comparison, cohort_matches, atlas_parcellation,
            predicted_trajectory, provenance, and research-only flag.
        """
        patient_id = patient_mri.get("patient_id", "UNKNOWN")
        scan_type = patient_mri.get("scan_type", "T1w_MPRAGE")
        logger.info("structural_analysis: patient=%s condition=%s", patient_id, condition)

        # Launch parallel adapter queries
        relevant = _CONDITION_ADAPTERS.get(condition, ["adni", "oasis", "hcp"])

        async def _volumetric_task() -> dict[str, Any]:
            return await self._volumetric_comparison(patient_mri, condition)

        async def _cohort_task() -> list[dict[str, Any]]:
            features = {
                "age": patient_mri.get("age", patient_mri.get("patient_age")),
                "sex": patient_mri.get("sex", patient_mri.get("patient_sex")),
                "diagnosis": condition,
                "education_years": patient_mri.get("education_years"),
            }
            return await self.cohort_matching(features, condition, top_n=5)

        async def _atlas_task() -> dict[str, Any]:
            return await self._atlas_parcellation(patient_mri, condition)

        async def _trajectory_task() -> dict[str, Any]:
            return await self._predicted_trajectory(patient_mri, condition)

        volumetric, cohort_matches, atlas_parcellation, predicted_trajectory = await asyncio.gather(
            _volumetric_task(),
            _cohort_task(),
            _atlas_task(),
            _trajectory_task(),
            return_exceptions=True,
        )

        # Unwrap exceptions → safe fallbacks
        if isinstance(volumetric, BaseException):
            logger.error("volumetric comparison failed: %s", volumetric)
            volumetric = self._fallback_volumetric(patient_mri)
        if isinstance(cohort_matches, BaseException):
            logger.error("cohort matching failed: %s", cohort_matches)
            cohort_matches = self._fallback_cohorts(condition)
        if isinstance(atlas_parcellation, BaseException):
            logger.error("atlas parcellation failed: %s", atlas_parcellation)
            atlas_parcellation = self._fallback_atlas(condition)
        if isinstance(predicted_trajectory, BaseException):
            logger.error("trajectory prediction failed: %s", predicted_trajectory)
            predicted_trajectory = self._fallback_trajectory(condition)

        # Compute overall confidence
        confidences = []
        if volumetric:
            vc = volumetric.get("_confidence", 0.0)
            confidences.append(vc)
        if cohort_matches:
            confidences.append(
                sum(c.get("similarity_score", 0.5) * 0.3 + 0.4 for c in cohort_matches[:3]) / min(len(cohort_matches), 3)
                if cohort_matches else 0.4
            )
        if atlas_parcellation:
            confidences.append(atlas_parcellation.get("_confidence", 0.5))
        if predicted_trajectory:
            confidences.append(predicted_trajectory.get("confidence", 0.5))

        overall_confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0.5

        # Clean internal keys from outputs
        volumetric_clean = {k: v for k, v in volumetric.items() if not k.startswith("_")} if isinstance(volumetric, dict) else volumetric
        atlas_clean = {k: v for k, v in atlas_parcellation.items() if not k.startswith("_")} if isinstance(atlas_parcellation, dict) else atlas_parcellation

        sources_used = []
        for c in cohort_matches:
            for sa in c.get("source_adapters", []):
                if sa not in sources_used:
                    sources_used.append(sa)
        if atlas_parcellation and isinstance(atlas_parcellation, dict):
            sources_used.extend(atlas_parcellation.get("_sources", []))

        return {
            "patient_id": patient_id,
            "scan_type": scan_type,
            "condition": condition,
            "volumetric_comparison": volumetric_clean,
            "cohort_matches": cohort_matches,
            "atlas_parcellation": atlas_clean,
            "predicted_trajectory": predicted_trajectory if isinstance(predicted_trajectory, dict) else self._fallback_trajectory(condition),
            "confidence_overall": overall_confidence,
            "research_only": True,
            "provenance": _prov(
                sources_used or ["local_fallback"],
                f"structural_analysis:{patient_id}:{condition}",
                overall_confidence,
                meta={
                    "patient_id": patient_id,
                    "condition": condition,
                    "scan_type": scan_type,
                    "cohorts_matched": len(cohort_matches),
                    "regions_analyzed": len(volumetric_clean) if isinstance(volumetric_clean, dict) else 0,
                },
            ),
        }

    # ── 1a. volumetric comparison ────────────────────────────────────────────

    async def _volumetric_comparison(
        self,
        patient_mri: dict[str, Any],
        condition: str,
    ) -> dict[str, Any]:
        """Compare patient volumes against normative data from adapters."""
        patient_regions = patient_mri.get("volumes", patient_mri.get("regions", {}))
        if not patient_regions:
            return self._fallback_volumetric(patient_mri)

        results: dict[str, Any] = {}
        sources_used: list[str] = []
        scores: list[float] = []

        # Query OASIS and ADNI in parallel for normative data
        oasis_norms, adni_norms, hcp_norms = await asyncio.gather(
            self._safe_adapter_call("oasis", "get_normative_volumes", list(patient_regions.keys()), condition),
            self._safe_adapter_call("adni", "get_normative_volumes", list(patient_regions.keys()), condition),
            self._safe_adapter_call("hcp", "get_normative_volumes", list(patient_regions.keys()), condition),
            return_exceptions=True,
        )
        oasis_norms = None if isinstance(oasis_norms, BaseException) else oasis_norms
        adni_norms = None if isinstance(adni_norms, BaseException) else adni_norms
        hcp_norms = None if isinstance(hcp_norms, BaseException) else hcp_norms

        for region, patient_val in patient_regions.items():
            if patient_val is None:
                continue

            norm = None
            source = "local_fallback"

            # Try adapters in priority order
            if adni_norms and region in adni_norms:
                norm = adni_norms[region]
                source = "ADNI"
            elif oasis_norms and region in oasis_norms:
                norm = oasis_norms[region]
                source = "OASIS"
            elif hcp_norms and region in hcp_norms:
                norm = hcp_norms[region]
                source = "HCP"
            else:
                # Local fallback
                norm = _LOCAL_VOLUMETRIC_NORMS.get(region)
                source = "embedded_norms"

            if norm is None:
                continue

            mean_val = float(norm.get("mean", norm.get("norm_mean", 0)))
            std_val = float(norm.get("std", norm.get("norm_std", 1)))
            z = _z_score(float(patient_val), mean_val, std_val)
            p = _two_tailed_p(z)

            results[region] = {
                "patient": float(patient_val),
                "norm_mean": round(mean_val, 4),
                "z_score": round(z, 4),
                "p_value": round(p, 6),
                "source": source,
            }
            if source not in sources_used:
                sources_used.append(source)
            weight = _WEIGHTS.get(source.lower(), _WEIGHTS["local_fallback"])
            scores.append(weight)

        avg_confidence = sum(scores) / len(scores) if scores else _WEIGHTS["local_fallback"]
        results["_confidence"] = avg_confidence
        results["_sources"] = sources_used
        return results

    def _fallback_volumetric(self, patient_mri: dict[str, Any]) -> dict[str, Any]:
        """Fallback volumetric comparison using embedded norms."""
        patient_regions = patient_mri.get("volumes", patient_mri.get("regions", {}))
        results: dict[str, Any] = {}
        for region, patient_val in patient_regions.items():
            if patient_val is None:
                continue
            norm = _LOCAL_VOLUMETRIC_NORMS.get(region)
            if norm is None:
                continue
            z = _z_score(float(patient_val), norm["mean"], norm["std"])
            results[region] = {
                "patient": float(patient_val),
                "norm_mean": norm["mean"],
                "z_score": round(z, 4),
                "p_value": round(_two_tailed_p(z), 6),
                "source": norm.get("source", "embedded"),
            }
        results["_confidence"] = _WEIGHTS["local_fallback"]
        results["_sources"] = ["local_fallback"]
        return results

    # ── 1b. cohort matching ──────────────────────────────────────────────────

    async def cohort_matching(
        self,
        patient_features: dict[str, Any],
        condition: str,
        top_n: int = 5,
    ) -> list[dict[str, Any]]:
        """Find best-matching cohorts across neuroimaging databases.

        Args:
            patient_features: Dict with age, sex, diagnosis, education_years, etc.
            condition: Clinical condition slug.
            top_n: Maximum number of cohorts to return.

        Returns:
            List of matched cohort dicts sorted by similarity_score descending.
        """
        logger.info(
            "cohort_matching: condition=%s features=%s",
            condition,
            list(patient_features.keys()),
        )

        # Query relevant cohort adapters in parallel
        relevant = _CONDITION_ADAPTERS.get(condition, ["adni", "oasis", "hcp", "gsp"])
        available = self._available_adapters(relevant)

        # Build parallel tasks
        tasks = []
        adapter_names = []
        for adapter_name in available:
            tasks.append(
                self._safe_adapter_call(adapter_name, "get_cohorts", condition)
            )
            adapter_names.append(adapter_name)

        adapter_results = await asyncio.gather(*tasks, return_exceptions=True) if tasks else []

        all_cohorts: list[dict[str, Any]] = []
        sources_used: list[str] = []

        for name, result in zip(adapter_names, adapter_results):
            if isinstance(result, BaseException) or result is None:
                continue
            sources_used.append(name)
            if isinstance(result, list):
                for cohort in result:
                    if isinstance(cohort, dict):
                        sim = _compute_similarity(patient_features, cohort)
                        all_cohorts.append({
                            "cohort": cohort.get("cohort_id", cohort.get("name", "unknown")),
                            "similarity_score": sim,
                            "n_subjects": cohort.get("n_subjects", 0),
                            "time_to_conversion_median": cohort.get("time_to_conversion_median"),
                            "age_range": cohort.get("age_range"),
                            "source_adapters": [name],
                            "description": cohort.get("description", ""),
                        })
            elif isinstance(result, dict) and "cohorts" in result:
                for cohort in result["cohorts"]:
                    sim = _compute_similarity(patient_features, cohort)
                    all_cohorts.append({
                        "cohort": cohort.get("cohort_id", cohort.get("name", "unknown")),
                        "similarity_score": sim,
                        "n_subjects": cohort.get("n_subjects", 0),
                        "time_to_conversion_median": cohort.get("time_to_conversion_median"),
                        "age_range": cohort.get("age_range"),
                        "source_adapters": [name],
                        "description": cohort.get("description", ""),
                    })

        # Fallback to local cohorts if no adapter data
        if not all_cohorts:
            logger.info("cohort_matching: using local cohort descriptors")
            for cohort_id, cohort_desc in _LOCAL_COHORTS.items():
                if cohort_desc.get("condition") == condition:
                    sim = _compute_similarity(patient_features, cohort_desc)
                    all_cohorts.append({
                        "cohort": cohort_id,
                        "similarity_score": sim,
                        "n_subjects": cohort_desc["n_subjects"],
                        "time_to_conversion_median": cohort_desc.get("time_to_conversion_median"),
                        "age_range": cohort_desc.get("age_range"),
                        "source_adapters": [cohort_desc["source"]],
                        "description": cohort_desc.get("description", ""),
                    })
            sources_used.append("local_fallback")

        # Sort by similarity descending
        all_cohorts.sort(key=lambda c: c["similarity_score"], reverse=True)

        return all_cohorts[:top_n]

    def _fallback_cohorts(self, condition: str) -> list[dict[str, Any]]:
        """Return local cohort matches as fallback."""
        results = []
        for cohort_id, desc in _LOCAL_COHORTS.items():
            if desc.get("condition") == condition:
                results.append({
                    "cohort": cohort_id,
                    "similarity_score": 0.5,
                    "n_subjects": desc["n_subjects"],
                    "time_to_conversion_median": desc.get("time_to_conversion_median"),
                    "source_adapters": [desc["source"]],
                    "description": desc.get("description", ""),
                })
        return results

    # ── 1c. atlas parcellation ───────────────────────────────────────────────

    async def _atlas_parcellation(
        self,
        patient_mri: dict[str, Any],
        condition: str,
    ) -> dict[str, Any]:
        """Get atlas parcellation with network analysis."""
        schaefer_task = self._safe_adapter_call(
            "schaefer",
            "get_parcellation",
            patient_mri.get("mni_coords", []),
            resolution=patient_mri.get("schaefer_resolution", 400),
        )
        mni_task = self._safe_adapter_call(
            "mni_atlas",
            "get_region_parcellation",
            patient_mri.get("mni_coords", []),
        )

        schaefer_result, mni_result = await asyncio.gather(
            schaefer_task,
            mni_task,
            return_exceptions=True,
        )
        schaefer_result = None if isinstance(schaefer_result, BaseException) else schaefer_result
        mni_result = None if isinstance(mni_result, BaseException) else mni_result

        results: dict[str, Any] = {}
        sources: list[str] = []
        scores: list[float] = []

        if schaefer_result and isinstance(schaefer_result, dict):
            dom_net = schaefer_result.get(
                "dominant_network",
                _LOCAL_ATLAS_PARC["schaefer"]["default_network_dominance"],
            )
            deviation = schaefer_result.get("deviation_map", {})
            results["schaefer"] = {
                "network_dominance": dom_net,
                "deviation_map": deviation if deviation else {"status": "no_deviation_data"},
            }
            sources.append("schaefer")
            scores.append(_WEIGHTS["schaefer"])
        else:
            results["schaefer"] = {
                "network_dominance": _LOCAL_ATLAS_PARC["schaefer"]["default_network_dominance"],
                "deviation_map": {"status": "local_fallback"},
            }
            sources.append("local_fallback")
            scores.append(_WEIGHTS["local_fallback"])

        # Glasser via MNI atlas or local fallback
        if mni_result and isinstance(mni_result, dict):
            diss = mni_result.get("area_dissimilarity", 0.34)
            results["glasser2016"] = {"area_dissimilarity": diss}
            sources.append("mni_atlas")
            scores.append(_WEIGHTS["mni_atlas"])
        else:
            results["glasser2016"] = {
                "area_dissimilarity": 0.34,
                "note": "local_fallback",
            }

        if "mni_atlas" not in sources:
            sources.append("local_fallback")
            scores.append(_WEIGHTS["local_fallback"])

        avg_confidence = sum(scores) / len(scores) if scores else _WEIGHTS["local_fallback"]
        results["_confidence"] = avg_confidence
        results["_sources"] = sources
        return results

    def _fallback_atlas(self, condition: str) -> dict[str, Any]:
        """Return local atlas fallback."""
        return {
            "schaefer": {
                "network_dominance": _LOCAL_ATLAS_PARC["schaefer"]["default_network_dominance"],
                "deviation_map": {"status": "local_fallback"},
            },
            "glasser2016": {"area_dissimilarity": 0.34, "note": "local_fallback"},
            "_confidence": _WEIGHTS["local_fallback"],
            "_sources": ["local_fallback"],
        }

    # ── 1d. predicted trajectory ─────────────────────────────────────────────

    async def _predicted_trajectory(
        self,
        patient_mri: dict[str, Any],
        condition: str,
    ) -> dict[str, Any]:
        """Predict clinical trajectory based on cohort progression models."""
        # Try ADNI for AD-related conditions, other adapters as available
        model_name = None
        for mn, md in _PROGRESSION_MODELS.items():
            if md.get("condition") == condition:
                model_name = mn
                break

        if model_name is None:
            return self._fallback_trajectory(condition)

        # Query ADNI and OASIS for progression probabilities
        adni_traj, oasis_traj = await asyncio.gather(
            self._safe_adapter_call("adni", "get_progression_probability", patient_mri, condition),
            self._safe_adapter_call("oasis", "get_progression_probability", patient_mri, condition),
            return_exceptions=True,
        )
        adni_traj = None if isinstance(adni_traj, BaseException) else adni_traj
        oasis_traj = None if isinstance(oasis_traj, BaseException) else oasis_traj

        sources: list[str] = []
        scores: list[float] = []

        if adni_traj and isinstance(adni_traj, dict):
            p6 = adni_traj.get("6_month_probability")
            p12 = adni_traj.get("12_month_probability")
            conf = adni_traj.get("confidence", _WEIGHTS["adni"])
            sources.append("adni")
            scores.append(conf)
        elif oasis_traj and isinstance(oasis_traj, dict):
            p6 = oasis_traj.get("6_month_probability")
            p12 = oasis_traj.get("12_month_probability")
            conf = oasis_traj.get("confidence", _WEIGHTS["oasis"])
            sources.append("oasis")
            scores.append(conf)
        else:
            # Embedded model estimation
            z_scores = patient_mri.get("volumes", {})
            if z_scores:
                hipp_z = z_scores.get("hippocampus_left", 0)
                if isinstance(hipp_z, dict):
                    hipp_z = hipp_z.get("patient", 0)
                # Simple heuristic: lower hippocampal volume → higher progression risk
                risk_base = max(0.0, min(1.0, 0.5 - float(hipp_z) * 0.1))
                p6 = round(risk_base, 4)
                p12 = round(min(1.0, risk_base * 1.5 + 0.1), 4)
            else:
                p6 = 0.45
                p12 = 0.72
            conf = _WEIGHTS["local_fallback"]
            sources.append("local_fallback")
            scores.append(conf)

        avg_confidence = sum(scores) / len(scores) if scores else _WEIGHTS["local_fallback"]

        return {
            "model": model_name,
            "6_month_probability": p6 if p6 is not None else 0.45,
            "12_month_probability": p12 if p12 is not None else 0.72,
            "confidence": round(avg_confidence, 4),
            "research_only": True,
            "sources": sources,
        }

    def _fallback_trajectory(self, condition: str) -> dict[str, Any]:
        """Return fallback trajectory prediction."""
        model_name = None
        for mn, md in _PROGRESSION_MODELS.items():
            if md.get("condition") == condition:
                model_name = mn
                break
        return {
            "model": model_name or "embedded_fallback",
            "6_month_probability": 0.45,
            "12_month_probability": 0.72,
            "confidence": _WEIGHTS["local_fallback"],
            "research_only": True,
            "sources": ["local_fallback"],
        }

    # ── 2. atrophy_analysis ──────────────────────────────────────────────────

    async def atrophy_analysis(
        self,
        structural_scan: dict[str, Any],
        baseline: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Perform longitudinal atrophy detection with atlas-based quantification.

        Args:
            structural_scan: Current scan with patient_id, scan_date, volumes.
            baseline: Optional prior scan for longitudinal comparison.

        Returns:
            Dict with atrophy map, significant changes, annualized rates,
            and clinical alerts.
        """
        patient_id = structural_scan.get("patient_id", "UNKNOWN")
        scan_date = structural_scan.get("scan_date", datetime.now(timezone.utc).isoformat())
        logger.info("atrophy_analysis: patient=%s baseline=%s", patient_id, baseline is not None)

        current_volumes = structural_scan.get("volumes", structural_scan.get("regions", {}))
        if not current_volumes:
            return self._empty_atrophy_result(patient_id, "no_volume_data")

        # Atlas-based region quantification in parallel
        atlas_atrophy_task = self._atlas_region_atrophy(current_volumes)
        normative_task = self._volumetric_comparison(structural_scan, structural_scan.get("condition", "unknown"))

        atlas_atrophy, normative_comparison = await asyncio.gather(
            atlas_atrophy_task,
            normative_task,
            return_exceptions=True,
        )
        atlas_atrophy = {} if isinstance(atlas_atrophy, BaseException) else atlas_atrophy
        normative_comparison = {} if isinstance(normative_comparison, BaseException) else normative_comparison

        results: dict[str, Any] = {}
        alerts: list[dict[str, Any]] = []
        scores: list[float] = []

        if baseline:
            baseline_volumes = baseline.get("volumes", baseline.get("regions", {}))
            baseline_date = baseline.get("scan_date", scan_date)

            # Compute interval in years
            try:
                t1 = datetime.fromisoformat(str(baseline_date).replace("Z", "+00:00"))
                t2 = datetime.fromisoformat(str(scan_date).replace("Z", "+00:00"))
                interval_years = (t2 - t1).total_seconds() / (365.25 * 24 * 3600)
                if interval_years <= 0:
                    interval_years = 0.5  # Default 6 months
            except (ValueError, TypeError):
                interval_years = 0.5

            for region, current_val in current_volumes.items():
                if current_val is None:
                    continue
                base_val = baseline_volumes.get(region)
                if base_val is None or float(base_val) == 0:
                    continue

                current_f = float(current_val)
                base_f = float(base_val)
                change = current_f - base_f
                pct_change = change / base_f
                annualized = pct_change / interval_years if interval_years > 0 else 0.0

                # Determine severity
                abs_pct = abs(pct_change)
                if abs_pct >= _ATROPHY_THRESHOLDS["severe"]:
                    severity = "severe"
                elif abs_pct >= _ATROPHY_THRESHOLDS["moderate"]:
                    severity = "moderate"
                elif abs_pct >= _ATROPHY_THRESHOLDS["mild"]:
                    severity = "mild"
                else:
                    severity = "none"

                direction = "atrophy" if pct_change < 0 else "enlargement" if pct_change > 0 else "stable"

                region_result = {
                    "baseline": round(base_f, 4),
                    "current": round(current_f, 4),
                    "absolute_change": round(change, 4),
                    "percent_change": round(pct_change * 100, 4),
                    "annualized_rate": round(annualized * 100, 4),
                    "direction": direction,
                    "severity": severity,
                    "interval_years": round(interval_years, 4),
                }

                # Add normative comparison if available
                norm_entry = normative_comparison.get(region) if isinstance(normative_comparison, dict) else None
                if norm_entry and isinstance(norm_entry, dict):
                    region_result["z_score_vs_norm"] = norm_entry.get("z_score")
                    region_result["p_value_vs_norm"] = norm_entry.get("p_value")

                results[region] = region_result

                # Generate alerts for significant changes
                if severity in ("moderate", "severe") and direction == "atrophy":
                    alerts.append({
                        "alert_type": f"{severity}_atrophy",
                        "region": region,
                        "percent_change": round(pct_change * 100, 4),
                        "annualized_rate": round(annualized * 100, 4),
                        "clinical_note": f"{severity.title()} atrophy detected in {region}. Correlate with clinical symptoms.",
                    })

                weight = _WEIGHTS["adni"] if norm_entry else _WEIGHTS["local_fallback"]
                scores.append(weight)
        else:
            # Cross-sectional: compare to normative only
            for region, current_val in current_volumes.items():
                if current_val is None:
                    continue
                norm_entry = normative_comparison.get(region) if isinstance(normative_comparison, dict) else None
                if norm_entry and isinstance(norm_entry, dict):
                    z = norm_entry.get("z_score", 0)
                    p = norm_entry.get("p_value", 1)
                    severity = (
                        "severe" if abs(z) >= 3.0 else "moderate" if abs(z) >= 2.0 else "mild" if abs(z) >= 1.5 else "none"
                    )
                    results[region] = {
                        "current": float(current_val),
                        "z_score_vs_norm": z,
                        "p_value_vs_norm": p,
                        "severity": severity,
                        "direction": "reduced" if z < 0 else "elevated" if z > 0 else "normal",
                        "note": "cross-sectional only — no prior scan",
                    }
                    if severity in ("moderate", "severe") and z < 0:
                        alerts.append({
                            "alert_type": f"{severity}_deviation_from_norm",
                            "region": region,
                            "z_score": z,
                            "p_value": p,
                            "clinical_note": f"{severity.title()} volume reduction in {region} vs. normative data.",
                        })
                    scores.append(_WEIGHTS.get(norm_entry.get("source", "").lower(), _WEIGHTS["local_fallback"]))
                else:
                    results[region] = {
                        "current": float(current_val),
                        "note": "no normative reference available",
                    }

        # Integrate atlas-based regional atrophy data
        if atlas_atrophy and isinstance(atlas_atrophy, dict):
            for region, atrophy_data in atlas_atrophy.items():
                if region in results and isinstance(atrophy_data, dict):
                    results[region]["atlas_based_atrophy"] = atrophy_data

        overall_confidence = round(sum(scores) / len(scores), 4) if scores else _WEIGHTS["local_fallback"]

        return {
            "patient_id": patient_id,
            "scan_date": scan_date,
            "baseline_available": baseline is not None,
            "regions_analyzed": len(results),
            "atrophy_map": results,
            "alerts": alerts,
            "alert_count": len(alerts),
            "research_only": True,
            "confidence": overall_confidence,
            "provenance": _prov(
                ["adni", "oasis", "hcp"] if scores else ["local_fallback"],
                f"atrophy_analysis:{patient_id}",
                overall_confidence,
                meta={
                    "patient_id": patient_id,
                    "baseline": baseline is not None,
                    "regions": len(results),
                    "alerts": len(alerts),
                },
            ),
        }

    async def _atlas_region_atrophy(
        self,
        volumes: dict[str, Any],
    ) -> dict[str, Any]:
        """Get atlas-based regional atrophy annotations."""
        # Query MNI atlas for region-specific atrophy references
        mni_atrophy = await self._safe_adapter_call(
            "mni_atlas", "get_atrophy_reference", list(volumes.keys())
        )
        if mni_atrophy and isinstance(mni_atrophy, dict):
            return mni_atrophy
        return {}

    def _empty_atrophy_result(self, patient_id: str, reason: str) -> dict[str, Any]:
        return {
            "patient_id": patient_id,
            "regions_analyzed": 0,
            "atrophy_map": {},
            "alerts": [],
            "alert_count": 0,
            "research_only": True,
            "confidence": _WEIGHTS["insufficient"],
            "error": reason,
            "provenance": _prov(
                ["none"],
                f"atrophy_analysis:{patient_id}",
                _WEIGHTS["insufficient"],
                meta={"error": reason},
            ),
        }

    # ── 3. generate_mri_report ───────────────────────────────────────────────

    async def generate_mri_report(self, patient_data: dict[str, Any]) -> dict[str, Any]:
        """Generate a comprehensive MRI clinical report.

        Combines structural analysis, cohort matching, atrophy analysis,
        and trajectory prediction into a single unified report.

        Args:
            patient_data: Full patient data dict with patient_id, scan data,
                          condition, volumes, optional prior scan.

        Returns:
            Unified MRI clinical report dict.
        """
        patient_id = patient_data.get("patient_id", "UNKNOWN")
        condition = patient_data.get("condition", "unknown")
        logger.info("generate_mri_report: patient=%s condition=%s", patient_id, condition)

        # Extract scan and baseline
        current_scan = patient_data.get("current_scan", patient_data)
        baseline_scan = patient_data.get("baseline_scan", patient_data.get("prior_scan"))

        # Run all analyses in parallel
        structural_task = self.structural_analysis(current_scan, condition)
        atrophy_task = self.atrophy_analysis(current_scan, baseline_scan)

        structural_result, atrophy_result = await asyncio.gather(
            structural_task,
            atrophy_task,
            return_exceptions=True,
        )

        if isinstance(structural_result, BaseException):
            logger.error("structural_analysis failed in report: %s", structural_result)
            structural_result = {
                "patient_id": patient_id,
                "condition": condition,
                "error": str(structural_result),
            }
        if isinstance(atrophy_result, BaseException):
            logger.error("atrophy_analysis failed in report: %s", atrophy_result)
            atrophy_result = {
                "patient_id": patient_id,
                "error": str(atrophy_result),
            }

        # Calculate overall report confidence
        confidences = []
        if isinstance(structural_result, dict):
            confidences.append(structural_result.get("confidence_overall", 0.5))
        if isinstance(atrophy_result, dict):
            confidences.append(atrophy_result.get("confidence", 0.5))
        overall = round(sum(confidences) / len(confidences), 4) if confidences else 0.5

        return {
            "report_type": "MRI_clinical_report",
            "patient_id": patient_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "bridge": _BRIDGE_NAME,
            "version": _VERSION,
            "research_only": True,
            "disclaimer": (
                "This report is generated for research purposes only and does not "
                "constitute a clinical diagnosis. All findings require interpretation "
                "by a qualified radiologist or neurologist."
            ),
            "executive_summary": self._executive_summary(
                structural_result if isinstance(structural_result, dict) else {},
                atrophy_result if isinstance(atrophy_result, dict) else {},
                condition,
            ),
            "structural_analysis": structural_result if isinstance(structural_result, dict) else {"error": "failed"},
            "atrophy_analysis": atrophy_result if isinstance(atrophy_result, dict) else {"error": "failed"},
            "confidence_overall": overall,
            "confidence_tier": (
                "high"
                if overall >= 0.9
                else "moderate"
                if overall >= 0.7
                else "low"
                if overall >= 0.4
                else "insufficient"
            ),
            "provenance": _prov(
                structural_result.get("provenance", {}).get("sources", []) if isinstance(structural_result, dict) else ["local_fallback"],
                f"mri_report:{patient_id}:{condition}",
                overall,
                meta={
                    "patient_id": patient_id,
                    "condition": condition,
                    "has_baseline": baseline_scan is not None,
                    "sections_generated": 2,
                },
            ),
        }

    def _executive_summary(
        self,
        structural: dict[str, Any],
        atrophy: dict[str, Any],
        condition: str,
    ) -> dict[str, Any]:
        """Generate a brief executive summary from analysis results."""
        summary_points: list[str] = []
        key_findings: list[dict[str, Any]] = []

        # Volumetric findings
        vol_comp = structural.get("volumetric_comparison", {})
        significant_regions = 0
        if isinstance(vol_comp, dict):
            for region, data in vol_comp.items():
                if region.startswith("_"):
                    continue
                if isinstance(data, dict) and data.get("p_value", 1) < 0.05:
                    significant_regions += 1
                    key_findings.append({
                        "type": "volumetric_deviation",
                        "region": region,
                        "z_score": data.get("z_score"),
                        "p_value": data.get("p_value"),
                        "direction": "reduced" if (data.get("z_score") or 0) < 0 else "elevated",
                    })

        if significant_regions > 0:
            summary_points.append(
                f"{significant_regions} region(s) show significant volumetric "
                f"deviation from normative data."
            )
        else:
            summary_points.append("No significant volumetric deviations detected.")

        # Cohort matches
        cohorts = structural.get("cohort_matches", [])
        if cohorts:
            top = cohorts[0]
            summary_points.append(
                f"Best cohort match: {top.get('cohort', 'unknown')} "
                f"(similarity={top.get('similarity_score', 0):.2f})."
            )

        # Atrophy alerts
        alerts = atrophy.get("alerts", [])
        if alerts:
            severe = sum(1 for a in alerts if "severe" in a.get("alert_type", ""))
            moderate = sum(1 for a in alerts if "moderate" in a.get("alert_type", ""))
            if severe > 0:
                summary_points.append(f"{severe} severe atrophy alert(s) detected.")
            if moderate > 0:
                summary_points.append(f"{moderate} moderate atrophy alert(s) detected.")
            key_findings.extend(alerts)
        else:
            summary_points.append("No significant atrophy detected.")

        # Trajectory
        traj = structural.get("predicted_trajectory", {})
        if traj and isinstance(traj, dict):
            p12 = traj.get("12_month_probability")
            if p12 is not None and p12 > 0.5:
                summary_points.append(
                    f"12-month progression probability is elevated ({p12:.0%}). "
                    f"Recommend close monitoring."
                )

        return {
            "summary_points": summary_points,
            "key_findings": key_findings,
            "finding_count": len(key_findings),
            "recommendation": (
                "Research-only analysis. Requires expert clinical interpretation. "
                "Correlate with cognitive testing, CSF biomarkers, and clinical history."
            ),
        }
