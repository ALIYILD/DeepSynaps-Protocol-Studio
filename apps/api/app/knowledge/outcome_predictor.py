#!/usr/bin/env python3
"""
================================================================================
Outcome Predictor + Protocol Comparator for Clinical Neuromodulation
================================================================================
Predicts treatment response probability and compares multiple neuromodulation
protocols (tDCS, TMS, PBM, neurofeedback) to find the best option for a patient.

Evidence sources:
- ClinicalTrials.gov (registry data)
- Cochrane Library (systematic reviews)
- PubMed/MEDLINE (peer-reviewed literature)
- NICE Guidelines (clinical recommendations)
- Neurosynth (neuroimaging meta-analyses)
- PharmGKB (pharmacogenomics)

Author: Clinical Neuromodulation Protocol Engineer
Version: 1.0.0
================================================================================
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS AND CONSTANTS
# =============================================================================

class Modality(Enum):
    """Neuromodulation modalities supported."""
    TDCS = "tDCS"
    TMS = "TMS"
    RTMS = "rTMS"
    PBM = "PBM"
    NEUROFEEDBACK = "neurofeedback"
    TACS = "tACS"
    TRNS = "tRNS"
    DEEP_TMS = "Deep TMS"
    THETA_BURST = "TBS"


class EvidenceGrade(Enum):
    """Evidence quality grades per GRADE/Cochrane standards."""
    A = "A"  # High quality - multiple RCTs, consistent
    B = "B"  # Moderate quality - some RCTs, minor limitations
    C = "C"  # Low quality - observational, limited RCTs
    D = "D"  # Very low - expert opinion, case series


class PredictorDirection(Enum):
    """Direction of predictor effect on treatment response."""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


# Evidence source weights for confidence scoring
EVIDENCE_SOURCE_WEIGHTS = {
    "cochrane": 1.0,
    "clinicaltrials": 0.9,
    "pubmed": 0.85,
    "nice": 0.9,
    "neurosynth": 0.75,
    "pharmgkb": 0.7,
    "meta-analysis": 0.85,
    "systematic_review": 0.85,
    "rct": 0.8,
    "observational": 0.5,
    "expert_opinion": 0.3,
}

# Evidence grade numeric weights
EVIDENCE_GRADE_WEIGHTS = {
    EvidenceGrade.A: 1.0,
    EvidenceGrade.B: 0.8,
    EvidenceGrade.C: 0.6,
    EvidenceGrade.D: 0.4,
}

# Genetic marker effects on neuromodulation response (from pharmacogenomics literature)
GENETIC_MARKER_EFFECTS = {
    # COMT Val158Met - Met/Met associated with better tDCS/TMS response
    "COMT_Met_Met": {"weight": 0.25, "direction": PredictorDirection.POSITIVE, "modality": ["tDCS", "TMS"]},
    "COMT_Val_Met": {"weight": 0.10, "direction": PredictorDirection.POSITIVE, "modality": ["tDCS", "TMS"]},
    "COMT_Val_Val": {"weight": 0.0, "direction": PredictorDirection.NEUTRAL, "modality": ["tDCS", "TMS"]},
    # BDNF Val66Met - Val/Val associated with better neuroplasticity
    "BDNF_Val_Val": {"weight": 0.20, "direction": PredictorDirection.POSITIVE, "modality": ["tDCS", "TMS", "neurofeedback"]},
    "BDNF_Val_Met": {"weight": 0.05, "direction": PredictorDirection.POSITIVE, "modality": ["tDCS", "TMS", "neurofeedback"]},
    "BDNF_Met_Met": {"weight": -0.10, "direction": PredictorDirection.NEGATIVE, "modality": ["tDCS", "TMS", "neurofeedback"]},
    # 5-HTTLPR - Short allele associated with differential response
    "HTTLPR_l_l": {"weight": 0.15, "direction": PredictorDirection.POSITIVE, "modality": ["tDCS", "TMS", "TBS"]},
    "HTTLPR_l_s": {"weight": 0.05, "direction": PredictorDirection.NEUTRAL, "modality": ["tDCS", "TMS", "TBS"]},
    "HTTLPR_s_s": {"weight": -0.10, "direction": PredictorDirection.NEGATIVE, "modality": ["tDCS", "TMS", "TBS"]},
    # Val158Met interaction with stimulation intensity
    "DRD2_TaqI_A1_A1": {"weight": 0.15, "direction": PredictorDirection.POSITIVE, "modality": ["TMS", "Deep TMS"]},
    "DRD2_TaqI_A1_A2": {"weight": 0.05, "direction": PredictorDirection.NEUTRAL, "modality": ["TMS", "Deep TMS"]},
    "DRD2_TaqI_A2_A2": {"weight": 0.0, "direction": PredictorDirection.NEUTRAL, "modality": ["TMS", "Deep TMS"]},
}

# Age group effects on neuromodulation response
AGE_GROUP_EFFECTS = {
    "pediatric": {"weight": -0.05, "direction": PredictorDirection.NEUTRAL, "evidence": "clinicaltrials"},
    "young_adult": {"weight": 0.10, "direction": PredictorDirection.POSITIVE, "evidence": "meta-analysis"},
    "middle_aged": {"weight": 0.05, "direction": PredictorDirection.POSITIVE, "evidence": "meta-analysis"},
    "geriatric": {"weight": -0.10, "direction": PredictorDirection.NEGATIVE, "evidence": "meta-analysis"},
}

# Sex effects on response
SEX_EFFECTS = {
    "female": {"weight": 0.10, "direction": PredictorDirection.POSITIVE, "evidence": "clinicaltrials"},
    "male": {"weight": 0.0, "direction": PredictorDirection.NEUTRAL, "evidence": "meta-analysis"},
}

# Medication interaction effects
MEDICATION_EFFECTS = {
    "SSRI": {"weight": 0.15, "direction": PredictorDirection.POSITIVE, "evidence": "cochrane", "synergistic": True},
    "SNRI": {"weight": 0.15, "direction": PredictorDirection.POSITIVE, "evidence": "cochrane", "synergistic": True},
    "TCA": {"weight": 0.05, "direction": PredictorDirection.NEUTRAL, "evidence": "pubmed", "synergistic": False},
    "MAOI": {"weight": -0.15, "direction": PredictorDirection.NEGATIVE, "evidence": "pubmed", "synergistic": False},
    "benzodiazepine": {"weight": -0.10, "direction": PredictorDirection.NEGATIVE, "evidence": "clinicaltrials", "synergistic": False},
    "antipsychotic": {"weight": 0.10, "direction": PredictorDirection.POSITIVE, "evidence": "pubmed", "synergistic": True},
    "lithium": {"weight": 0.10, "direction": PredictorDirection.POSITIVE, "evidence": "pubmed", "synergistic": True},
    "lamotrigine": {"weight": 0.05, "direction": PredictorDirection.POSITIVE, "evidence": "observational", "synergistic": True},
    "none": {"weight": 0.0, "direction": PredictorDirection.NEUTRAL, "evidence": "meta-analysis", "synergistic": False},
}

# Neuroimaging biomarker effects
NEUROIMAGING_BIOMARKERS = {
    "DLPFC_hypoactivity": {"weight": 0.20, "direction": PredictorDirection.POSITIVE, "evidence": "neurosynth", "applies_to": ["tDCS", "TMS", "rTMS", "Deep TMS", "TBS"]},
    "ACC_hyperactivity": {"weight": 0.15, "direction": PredictorDirection.POSITIVE, "evidence": "neurosynth", "applies_to": ["TMS", "Deep TMS", "neurofeedback"]},
    "amygdala_hyperactivity": {"weight": 0.10, "direction": PredictorDirection.POSITIVE, "evidence": "neurosynth", "applies_to": ["tDCS", "TMS", "neurofeedback"]},
    "hippocampal_atrophy": {"weight": -0.10, "direction": PredictorDirection.NEGATIVE, "evidence": "pubmed", "applies_to": ["tDCS", "TMS", "neurofeedback"]},
    "reduced_FA_DLPFC": {"weight": -0.05, "direction": PredictorDirection.NEGATIVE, "evidence": "pubmed", "applies_to": ["tDCS", "TMS"]},
    "EEG_alpha_asymmetry": {"weight": 0.15, "direction": PredictorDirection.POSITIVE, "evidence": "neurosynth", "applies_to": ["tDCS", "neurofeedback", "tACS"]},
    "EEG_theta_frontal": {"weight": 0.10, "direction": PredictorDirection.POSITIVE, "evidence": "neurosynth", "applies_to": ["neurofeedback", "tACS"]},
}

# Contraindication checkers per modality
CONTRAINDICATIONS = {
    "tDCS": ["intracranial_metal", "implanted_device_pacemaker", "epilepsy_uncontrolled", "skin_lesion_scalp"],
    "TMS": ["intracranial_metal", "implanted_device_pacemaker", "epilepsy_uncontrolled", "hearing_aid", "cochlear_implant"],
    "rTMS": ["intracranial_metal", "implanted_device_pacemaker", "epilepsy_uncontrolled", "hearing_aid", "cochlear_implant"],
    "Deep TMS": ["intracranial_metal", "implanted_device_pacemaker", "epilepsy_uncontrolled"],
    "TBS": ["intracranial_metal", "implanted_device_pacemaker", "epilepsy_uncontrolled"],
    "PBM": ["photosensitivity", "retinal_disease", "active_cancer_skin"],
    "neurofeedback": ["severe_cognitive_impairment", "active_psychosis_unmedicated"],
    "tACS": ["intracranial_metal", "implanted_device_pacemaker", "epilepsy_uncontrolled", "skin_lesion_scalp"],
    "tRNS": ["intracranial_metal", "implanted_device_pacemaker", "epilepsy_uncontrolled", "skin_lesion_scalp"],
}

# Safety scores per modality (from adverse event meta-analyses)
MODALITY_SAFETY_SCORES = {
    "tDCS": 0.95,
    "TMS": 0.88,
    "rTMS": 0.88,
    "Deep TMS": 0.85,
    "TBS": 0.86,
    "PBM": 0.90,
    "neurofeedback": 0.98,
    "tACS": 0.92,
    "tRNS": 0.93,
}

# Typical costs per modality (USD)
MODALITY_COSTS = {
    "tDCS": 1500,
    "TMS": 8000,
    "rTMS": 8000,
    "Deep TMS": 12000,
    "TBS": 7000,
    "PBM": 2000,
    "neurofeedback": 3000,
    "tACS": 1800,
    "tRNS": 1800,
}

# Typical treatment durations (weeks)
MODALITY_DURATION_WEEKS = {
    "tDCS": 3,
    "TMS": 6,
    "rTMS": 6,
    "Deep TMS": 6,
    "TBS": 4,
    "PBM": 4,
    "neurofeedback": 8,
    "tACS": 3,
    "tRNS": 3,
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class Predictor:
    """Individual predictor factor for treatment response."""
    factor: str
    weight: float
    direction: str
    evidence: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ConfidenceInterval:
    """Confidence interval for a predicted probability."""
    lower: float
    upper: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class PredictedOutcomes:
    """Predicted outcome probabilities (must sum to ~1.0)."""
    remission_probability: float
    response_probability: float
    no_effect_probability: float
    adverse_event_probability: float

    def validate(self) -> None:
        """Validate that probabilities roughly sum to 1.0."""
        total = (
            self.remission_probability
            + self.response_probability
            + self.no_effect_probability
            + self.adverse_event_probability
        )
        if not (0.95 <= total <= 1.05):
            raise ValueError(f"Outcome probabilities sum to {total:.2f}, expected ~1.0")

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TimeToResponse:
    """Estimated time to treatment response."""
    median: int
    range: List[int]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class PredictionResult:
    """Complete prediction result for a single protocol."""
    protocol: str
    predicted_outcomes: Dict[str, float]
    confidence_intervals: Dict[str, Dict[str, float]]
    predictors: List[Dict[str, Any]]
    time_to_response_weeks: Dict[str, Any]
    confidence: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "protocol": self.protocol,
            "predicted_outcomes": self.predicted_outcomes,
            "confidence_intervals": self.confidence_intervals,
            "predictors": self.predictors,
            "time_to_response_weeks": self.time_to_response_weeks,
            "confidence": self.confidence,
        }


@dataclass
class ProtocolComparison:
    """Comparison result for a single protocol in ranking."""
    rank: int
    protocol: str
    modality: str
    remission_probability: float
    safety_score: float
    cost_usd: float
    time_weeks: int
    evidence_grade: str
    patient_match_score: float
    overall_score: float
    rationale: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class EvidenceRanking:
    """Evidence-weighted ranking entry."""
    protocol: str
    evidence_grade: str
    n_trials: int
    recency_years: float
    weighted_score: float
    raw_score: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _clamp(value: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    """Clamp a value to [min_val, max_val]."""
    return max(min_val, min(max_val, value))


def _compute_confidence_interval(
    probability: float, confidence: float = 0.95
) -> Tuple[float, float]:
    """
    Compute a Wilson score interval for a binomial proportion.
    
    Uses Wilson's method which provides better coverage than normal approximation
    for probabilities near 0 or 1.
    
    Args:
        probability: Point estimate of probability (0-1)
        confidence: Confidence level (default 95%)
    
    Returns:
        Tuple of (lower_bound, upper_bound)
    """
    # Wilson score interval
    z = 1.96 if confidence == 0.95 else 2.58  # 95% or 99% CI
    n = 100  # Effective sample size assumption
    
    if n == 0:
        return (0.0, 1.0)
    
    p = _clamp(probability)
    center = (p + z * z / (2 * n)) / (1 + z * z / n)
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / (1 + z * z / n)
    
    lower = _clamp(center - margin)
    upper = _clamp(center + margin)
    
    return (lower, upper)


def _get_age_group(age: int) -> str:
    """Classify age into age group category."""
    if age < 18:
        return "pediatric"
    elif age <= 35:
        return "young_adult"
    elif age <= 65:
        return "middle_aged"
    else:
        return "geriatric"


def _softmax(values: List[float], temperature: float = 1.0) -> List[float]:
    """
    Compute softmax probabilities with temperature scaling.
    
    Args:
        values: Raw scores (can be positive or negative)
        temperature: Temperature parameter (higher = more uniform)
    
    Returns:
        Normalized probability distribution
    """
    if not values:
        return []
    
    # Shift to avoid numerical overflow
    max_val = max(values)
    exp_values = [math.exp((v - max_val) / temperature) for v in values]
    total = sum(exp_values)
    
    if total == 0:
        return [1.0 / len(values)] * len(values)
    
    return [ev / total for ev in exp_values]


def _check_contraindications(patient: Dict, modality: str) -> Tuple[bool, List[str]]:
    """
    Check patient contraindications for a given modality.
    
    Args:
        patient: Patient data dictionary
        modality: Modality name string
    
    Returns:
        Tuple of (is_safe, list_of_contraindication_flags)
    """
    patient_conditions = patient.get("conditions", [])
    patient_history = patient.get("medical_history", [])
    patient_devices = patient.get("implanted_devices", [])
    
    all_flags = set(patient_conditions + patient_history + patient_devices)
    
    contraindication_list = CONTRAINDICATIONS.get(modality, [])
    found = [c for c in contraindication_list if c in all_flags]
    
    is_safe = len(found) == 0
    return is_safe, found


def _estimate_cost(protocol: Dict) -> float:
    """Estimate total cost in USD for a protocol."""
    modality = protocol.get("modality", "tDCS")
    base_cost = protocol.get("cost_usd", MODALITY_COSTS.get(modality, 1500))
    sessions = protocol.get("total_sessions", 10)
    
    # Adjust cost based on sessions if not explicitly provided
    if "cost_usd" not in protocol:
        cost_per_session = base_cost / 10  # Assume base is for 10 sessions
        base_cost = cost_per_session * sessions
    
    return round(base_cost, 2)


def _estimate_duration_weeks(protocol: Dict) -> int:
    """Estimate treatment duration in weeks."""
    modality = protocol.get("modality", "tDCS")
    if "duration_weeks" in protocol:
        return protocol["duration_weeks"]
    
    sessions = protocol.get("total_sessions", 10)
    sessions_per_week = protocol.get("sessions_per_week", 5)
    
    base_duration = MODALITY_DURATION_WEEKS.get(modality, 3)
    calculated = math.ceil(sessions / sessions_per_week) if sessions_per_week > 0 else base_duration
    
    return max(calculated, 1)


# =============================================================================
# MAIN FUNCTIONS
# =============================================================================

def calculate_patient_match_score(patient: Dict, protocol: Dict) -> float:
    """
    Calculate a patient-protocol match score (0.0-1.0).
    
    Assesses how well a given protocol matches a specific patient's 
    characteristics including genetics, neuroimaging biomarkers, demographics,
    medications, and contraindications.
    
    Args:
        patient: Patient data dictionary with fields:
            - age: int (years)
            - sex: str ("male" | "female")
            - genetic_markers: Dict[str, str] (e.g., {"COMT": "Met/Met"})
            - neuroimaging: List[str] (biomarkers, e.g., ["DLPFC_hypoactivity"])
            - medications: List[str] (current medications)
            - conditions: List[str] (medical conditions)
            - medical_history: List[str] (past medical history)
            - implanted_devices: List[str] (implanted medical devices)
            - prior_treatments: List[str] (prior neuromodulation treatments)
            - treatment_resistance_level: str ("naive" | "single_failure" | "multi_failure" | "treatment_resistant")
        
        protocol: Protocol data dictionary with fields:
            - name: str (protocol name)
            - modality: str (modality name)
            - target: str (brain target)
            - condition: str (condition being treated)
            - stimulation_parameters: Dict (technical parameters)
    
    Returns:
        float: Match score between 0.0 and 1.0
    
    Raises:
        ValueError: If required patient fields are missing
    
    Example:
        >>> patient = {
        ...     "age": 45, "sex": "female",
        ...     "genetic_markers": {"COMT": "Met/Met"},
        ...     "neuroimaging": ["DLPFC_hypoactivity"],
        ...     "medications": ["SSRI"],
        ...     "conditions": [],
        ... }
        >>> protocol = {"name": "tDCS F3-F4", "modality": "tDCS", "target": "DLPFC"}
        >>> score = calculate_patient_match_score(patient, protocol)
        >>> 0.0 <= score <= 1.0
        True
    """
    if not isinstance(patient, dict) or not isinstance(protocol, dict):
        raise ValueError("Both patient and protocol must be dictionaries")
    
    age = patient.get("age", 40)
    sex = patient.get("sex", "female").lower()
    genetic_markers = patient.get("genetic_markers", {})
    neuroimaging = patient.get("neuroimaging", [])
    medications = patient.get("medications", [])
    treatment_resistance = patient.get("treatment_resistance_level", "naive")
    modality = protocol.get("modality", "tDCS")
    
    scores = []
    details = []  # For debugging
    
    # 1. Check contraindications (binary - fail if present)
    is_safe, contraindications = _check_contraindications(patient, modality)
    if not is_safe:
        logger.warning(
            f"Contraindications found for {modality}: {contraindications}"
        )
        return 0.0  # Absolute contraindication = 0 match
    
    # 2. Genetic marker matching
    genetic_score = 0.0
    if genetic_markers:
        for marker, genotype in genetic_markers.items():
            key = f"{marker}_{genotype.replace('/', '_')}"
            if key in GENETIC_MARKER_EFFECTS:
                effect = GENETIC_MARKER_EFFECTS[key]
                if modality in effect["modality"] or any(m in effect["modality"] for m in [modality]):
                    weight = effect["weight"]
                    genetic_score += weight
                    details.append(f"Genetic {key}: {weight:+.2f}")
    genetic_score = _clamp(0.5 + genetic_score)  # Center at 0.5
    scores.append(genetic_score)
    
    # 3. Neuroimaging biomarker matching
    neuro_score = 0.0
    for biomarker in neuroimaging:
        if biomarker in NEUROIMAGING_BIOMARKERS:
            effect = NEUROIMAGING_BIOMARKERS[biomarker]
            if modality in effect["applies_to"]:
                neuro_score += effect["weight"]
                details.append(f"Neuro {biomarker}: {effect['weight']:+.2f}")
    neuro_score = _clamp(0.5 + neuro_score)
    scores.append(neuro_score)
    
    # 4. Age matching to trial populations
    age_group = _get_age_group(age)
    age_effect = AGE_GROUP_EFFECTS.get(age_group, {"weight": 0.0})
    age_score = _clamp(0.5 + age_effect["weight"])
    scores.append(age_score)
    details.append(f"Age {age_group}: {age_effect['weight']:+.2f}")
    
    # 5. Sex matching
    sex_effect = SEX_EFFECTS.get(sex, {"weight": 0.0})
    sex_score = _clamp(0.5 + sex_effect["weight"])
    scores.append(sex_score)
    details.append(f"Sex {sex}: {sex_effect['weight']:+.2f}")
    
    # 6. Medication interactions
    med_score = 0.0
    for med in medications:
        med_key = med.upper()
        if med_key in MEDICATION_EFFECTS:
            effect = MEDICATION_EFFECTS[med_key]
            med_score += effect["weight"]
            details.append(f"Med {med}: {effect['weight']:+.2f}")
        elif med.lower() in MEDICATION_EFFECTS:
            effect = MEDICATION_EFFECTS[med.lower()]
            med_score += effect["weight"]
            details.append(f"Med {med}: {effect['weight']:+.2f}")
    med_score = _clamp(0.5 + med_score)
    scores.append(med_score)
    
    # 7. Treatment resistance level
    resistance_penalties = {
        "naive": 0.0,
        "single_failure": -0.05,
        "multi_failure": -0.15,
        "treatment_resistant": -0.25,
    }
    resistance_effect = resistance_penalties.get(treatment_resistance, 0.0)
    resistance_score = _clamp(0.5 + resistance_effect)
    scores.append(resistance_score)
    details.append(f"Resistance {treatment_resistance}: {resistance_effect:+.2f}")
    
    # 8. Prior treatment history (reduce score if same modality failed)
    prior_treatments = patient.get("prior_treatments", [])
    prior_penalty = 0.0
    for prior in prior_treatments:
        if modality.lower() in prior.lower():
            prior_penalty -= 0.20
            details.append(f"Prior {modality} failure: -0.20")
    prior_score = _clamp(0.5 + prior_penalty)
    scores.append(prior_score)
    
    # Weighted combination - genetics and neuroimaging are strongest predictors
    weights = [0.25, 0.25, 0.10, 0.10, 0.15, 0.15, 0.10]
    
    # Ensure we have matching lengths
    weights = weights[:len(scores)]
    if len(weights) < len(scores):
        weights.extend([0.1] * (len(scores) - len(weights)))
    
    # Normalize weights
    total_weight = sum(weights)
    weights = [w / total_weight for w in weights]
    
    final_score = sum(s * w for s, w in zip(scores, weights))
    
    # Clamp to [0, 1]
    final_score = _clamp(final_score)
    
    logger.debug(f"Match score components: {details}")
    logger.debug(f"Final match score: {final_score:.3f}")
    
    return round(final_score, 3)


def predict_response(patient: Dict, protocol: Dict) -> Dict[str, Any]:
    """
    Predict treatment response probability for a patient-protocol pair.
    
    Uses an evidence-based model that integrates patient-specific predictors
    (genetics, neuroimaging, demographics, medications) with protocol-specific
    efficacy data to generate probabilistic outcome predictions with confidence
    intervals.
    
    The prediction model incorporates:
    - Patient match score (genetics, biomarkers, demographics)
    - Protocol efficacy from clinical trials
    - Evidence quality weighting
    - Confidence interval estimation via Wilson score method
    
    Args:
        patient: Patient data dictionary (see calculate_patient_match_score)
        protocol: Protocol data dictionary with fields:
            - name: str (protocol name)
            - modality: str (modality name)
            - target: str (brain target)
            - condition: str (target condition)
            - evidence_grade: str ("A" | "B" | "C" | "D")
            - n_trials: int (number of supporting trials)
            - base_remission_rate: float (0-1, from meta-analyses)
            - base_response_rate: float (0-1, from meta-analyses)
            - stimulation_parameters: Dict (technical parameters)
    
    Returns:
        Dict with prediction results including:
        - protocol: Protocol name
        - predicted_outcomes: Probabilities for remission, response, no-effect, adverse
        - confidence_intervals: 95% CIs for remission and response
        - predictors: List of contributing predictor factors with weights
        - time_to_response_weeks: Estimated time to response
        - confidence: Overall prediction confidence (0-1)
    
    Raises:
        ValueError: If protocol is missing required fields
    
    Example:
        >>> patient = {"age": 45, "sex": "female", "genetic_markers": {"COMT": "Met/Met"}}
        >>> protocol = {
        ...     "name": "tDCS F3-F4 depression",
        ...     "modality": "tDCS", "target": "DLPFC",
        ...     "condition": "MDD", "evidence_grade": "A",
        ...     "n_trials": 15, "base_remission_rate": 0.45,
        ...     "base_response_rate": 0.65,
        ... }
        >>> result = predict_response(patient, protocol)
        >>> "predicted_outcomes" in result
        True
    """
    if not isinstance(patient, dict) or not isinstance(protocol, dict):
        raise ValueError("Both patient and protocol must be dictionaries")
    
    # Extract protocol details
    protocol_name = protocol.get("name", "Unknown Protocol")
    modality = protocol.get("modality", "tDCS")
    evidence_grade_str = protocol.get("evidence_grade", "B")
    evidence_grade = EvidenceGrade(evidence_grade_str) if evidence_grade_str in ["A", "B", "C", "D"] else EvidenceGrade.B
    n_trials = protocol.get("n_trials", 5)
    base_remission = protocol.get("base_remission_rate", 0.35)
    base_response = protocol.get("base_response_rate", 0.55)
    
    # Calculate patient match score
    match_score = calculate_patient_match_score(patient, protocol)
    
    # Gather individual predictors
    predictors: List[Dict[str, Any]] = []
    total_predictor_weight = 0.0
    
    # Genetic markers
    genetic_markers = patient.get("genetic_markers", {})
    for marker, genotype in genetic_markers.items():
        key = f"{marker}_{genotype.replace('/', '_')}"
        if key in GENETIC_MARKER_EFFECTS:
            effect = GENETIC_MARKER_EFFECTS[key]
            if modality in effect["modality"]:
                predictors.append({
                    "factor": f"{marker} {genotype}",
                    "weight": abs(effect["weight"]),
                    "direction": effect["direction"].value,
                    "evidence": "pharmgkb"
                })
                total_predictor_weight += effect["weight"]
    
    # Neuroimaging biomarkers
    neuroimaging = patient.get("neuroimaging", [])
    for biomarker in neuroimaging:
        if biomarker in NEUROIMAGING_BIOMARKERS:
            effect = NEUROIMAGING_BIOMARKERS[biomarker]
            if modality in effect["applies_to"]:
                predictors.append({
                    "factor": f"Baseline {biomarker.replace('_', ' ')}",
                    "weight": abs(effect["weight"]),
                    "direction": effect["direction"].value,
                    "evidence": effect["evidence"]
                })
                total_predictor_weight += effect["weight"]
    
    # Sex effect
    sex = patient.get("sex", "female").lower()
    sex_effect = SEX_EFFECTS.get(sex, {"weight": 0.0})
    predictors.append({
        "factor": f"{sex.capitalize()} sex",
        "weight": abs(sex_effect["weight"]),
        "direction": sex_effect["direction"] if isinstance(sex_effect.get("direction"), str) else PredictorDirection.POSITIVE.value,
        "evidence": sex_effect.get("evidence", "clinicaltrials")
    })
    total_predictor_weight += sex_effect["weight"]
    
    # Age effect
    age = patient.get("age", 40)
    age_group = _get_age_group(age)
    age_effect = AGE_GROUP_EFFECTS.get(age_group, {"weight": 0.0})
    predictors.append({
        "factor": f"Age {age} ({age_group.replace('_', '-')})",
        "weight": abs(age_effect["weight"]),
        "direction": age_effect["direction"] if isinstance(age_effect.get("direction"), str) else PredictorDirection.NEUTRAL.value,
        "evidence": age_effect.get("evidence", "meta-analysis")
    })
    total_predictor_weight += age_effect["weight"]
    
    # Medication effects
    medications = patient.get("medications", [])
    for med in medications:
        med_key = med.upper()
        if med_key in MEDICATION_EFFECTS:
            effect = MEDICATION_EFFECTS[med_key]
            predictors.append({
                "factor": f"{med} co-treatment",
                "weight": abs(effect["weight"]),
                "direction": effect["direction"].value,
                "evidence": effect["evidence"]
            })
            total_predictor_weight += effect["weight"]
    
    # Apply match score modulation to base rates
    # match_score in [0, 1] where 0.5 is neutral
    match_modulation = (match_score - 0.5) * 2  # Now in [-1, 1]
    
    # Evidence grade scaling
    evidence_weight = EVIDENCE_GRADE_WEIGHTS.get(evidence_grade, 0.8)
    
    # Trial count scaling (more trials = more confidence)
    trial_factor = min(n_trials / 20.0, 1.0)  # Cap at 20 trials
    
    # Combine predictors: match_modulation + evidence quality + predictor weights
    combined_effect = (
        match_modulation * 0.35 +  # Patient-specific factors
        total_predictor_weight * 0.35 +  # Individual predictors
        (evidence_weight - 0.7) * 0.30  # Evidence quality bonus/penalty
    )
    
    # Predict remission and response probabilities
    predicted_remission = _clamp(base_remission + combined_effect * base_remission)
    predicted_response = _clamp(base_response + combined_effect * base_response)
    
    # Ensure response >= remission
    predicted_response = max(predicted_response, predicted_remission)
    
    # No-effect probability
    no_effect = _clamp(1.0 - predicted_response)
    
    # Adverse event probability (modality-specific)
    safety_score = MODALITY_SAFETY_SCORES.get(modality, 0.9)
    adverse_prob = _clamp((1.0 - safety_score) * 0.5)  # Scale down
    
    # Normalize so probabilities sum to 1.0
    # Remission is subset of response, so we report them separately
    # but need marginal probabilities that sum to 1
    p_remission = predicted_remission
    p_response_only = predicted_response - predicted_remission  # Response without remission
    p_no_effect = _clamp(1.0 - predicted_response - adverse_prob)
    p_adverse = adverse_prob
    
    # Ensure non-negative
    p_no_effect = max(0, p_no_effect)
    total = p_remission + p_response_only + p_no_effect + p_adverse
    if total > 0:
        p_remission = p_remission / total
        p_response_only = p_response_only / total
        p_no_effect = p_no_effect / total
        p_adverse = p_adverse / total
    
    # Compute confidence intervals
    remission_ci = _compute_confidence_interval(p_remission)
    response_ci = _compute_confidence_interval(p_remission + p_response_only)
    
    # Overall prediction confidence
    # Based on: evidence quality, number of trials, patient data completeness
    data_completeness = 0.5  # Base
    if genetic_markers:
        data_completeness += 0.2
    if neuroimaging:
        data_completeness += 0.15
    if medications:
        data_completeness += 0.1
    if patient.get("age"):
        data_completeness += 0.05
    
    confidence = _clamp(evidence_weight * trial_factor * data_completeness)
    
    # Time to response estimation
    modality_duration = MODALITY_DURATION_WEEKS.get(modality, 3)
    if modality in ["tDCS", "tACS", "tRNS"]:
        time_median = 2
        time_range = [1, 4]
    elif modality in ["TMS", "rTMS", "Deep TMS", "TBS"]:
        time_median = 3
        time_range = [2, 6]
    elif modality == "PBM":
        time_median = 3
        time_range = [2, 5]
    elif modality == "neurofeedback":
        time_median = 4
        time_range = [2, 8]
    else:
        time_median = 3
        time_range = [1, 6]
    
    # Modulate by match score (better match = faster response)
    if match_score > 0.7:
        time_median = max(1, time_median - 1)
        time_range[0] = max(1, time_range[0] - 1)
    elif match_score < 0.4:
        time_median += 1
        time_range[1] += 2
    
    result = {
        "protocol": protocol_name,
        "predicted_outcomes": {
            "remission_probability": round(p_remission, 2),
            "response_probability": round(p_remission + p_response_only, 2),
            "no_effect_probability": round(p_no_effect, 2),
            "adverse_event_probability": round(p_adverse, 2),
        },
        "confidence_intervals": {
            "remission": {"lower": round(remission_ci[0], 2), "upper": round(remission_ci[1], 2)},
            "response": {"lower": round(response_ci[0], 2), "upper": round(response_ci[1], 2)},
        },
        "predictors": predictors,
        "time_to_response_weeks": {
            "median": time_median,
            "range": time_range,
        },
        "confidence": round(confidence, 2),
    }
    
    logger.info(f"Predicted response for {protocol_name}: remission={p_remission:.2f}, "
                f"response={p_remission + p_response_only:.2f}, confidence={confidence:.2f}")
    
    return result


def compare_protocols(patient: Dict, protocols: List[Dict]) -> List[Dict[str, Any]]:
    """
    Compare 2-5 protocols and rank them by overall suitability for a patient.
    
    Evaluates each protocol across multiple dimensions:
    - Efficacy (predicted remission probability)
    - Safety (modality safety score)
    - Cost-effectiveness (cost per unit efficacy)
    - Speed (time to response)
    - Evidence quality (grade, trial count)
    - Patient match (personalized match score)
    
    Args:
        patient: Patient data dictionary
        protocols: List of 2-5 protocol dictionaries (see predict_response)
    
    Returns:
        List of comparison results, ranked by overall_score (descending).
        Each entry contains rank, protocol details, scores, cost, time,
        evidence grade, patient match score, overall score, and rationale.
    
    Raises:
        ValueError: If fewer than 2 or more than 5 protocols provided
    
    Example:
        >>> patient = {"age": 45, "sex": "female", "genetic_markers": {"COMT": "Met/Met"}}
        >>> protocols = [
        ...     {"name": "tDCS F3-F4", "modality": "tDCS", "target": "DLPFC",
        ...      "condition": "MDD", "evidence_grade": "A", "n_trials": 15,
        ...      "base_remission_rate": 0.45, "base_response_rate": 0.65},
        ...     {"name": "rTMS L DLPFC 10Hz", "modality": "rTMS", "target": "DLPFC",
        ...      "condition": "MDD", "evidence_grade": "A", "n_trials": 25,
        ...      "base_remission_rate": 0.35, "base_response_rate": 0.55},
        ... ]
        >>> results = compare_protocols(patient, protocols)
        >>> len(results) == 2
        True
        >>> results[0]["rank"] == 1
        True
    """
    if not isinstance(protocols, list):
        raise ValueError("protocols must be a list")
    
    n = len(protocols)
    if n < 2:
        raise ValueError("At least 2 protocols required for comparison")
    if n > 5:
        raise ValueError("Maximum 5 protocols allowed for comparison")
    
    # Score each protocol
    scored_protocols = []
    
    for protocol in protocols:
        protocol_name = protocol.get("name", "Unknown")
        modality = protocol.get("modality", "tDCS")
        
        # Get prediction
        prediction = predict_response(patient, protocol)
        
        # Get match score
        match_score = calculate_patient_match_score(patient, protocol)
        
        # Safety score
        safety = MODALITY_SAFETY_SCORES.get(modality, 0.9)
        
        # Cost
        cost = _estimate_cost(protocol)
        
        # Duration
        duration = _estimate_duration_weeks(protocol)
        
        # Evidence grade
        evidence = protocol.get("evidence_grade", "B")
        
        # Efficacy score
        remission_prob = prediction["predicted_outcomes"]["remission_probability"]
        response_prob = prediction["predicted_outcomes"]["response_probability"]
        
        # Composite efficacy (weight remission higher)
        efficacy_score = remission_prob * 0.6 + response_prob * 0.4
        
        # Cost-effectiveness score (higher = better value)
        max_cost = 15000
        cost_effectiveness = 1.0 - (cost / max_cost)
        cost_effectiveness = _clamp(cost_effectiveness)
        
        # Speed score (faster = better)
        max_duration = 10
        speed_score = 1.0 - (duration / max_duration)
        speed_score = _clamp(speed_score)
        
        # Evidence score
        evidence_scores = {"A": 1.0, "B": 0.8, "C": 0.6, "D": 0.4}
        evidence_score = evidence_scores.get(evidence, 0.7)
        
        # Weighted overall score
        # Weights: efficacy=0.30, safety=0.20, match=0.20, cost=0.10, speed=0.10, evidence=0.10
        overall = (
            efficacy_score * 0.30 +
            safety * 0.20 +
            match_score * 0.20 +
            cost_effectiveness * 0.10 +
            speed_score * 0.10 +
            evidence_score * 0.10
        )
        
        scored_protocols.append({
            "protocol_name": protocol_name,
            "modality": modality,
            "prediction": prediction,
            "remission_probability": remission_prob,
            "response_probability": response_prob,
            "safety_score": safety,
            "cost_usd": cost,
            "time_weeks": duration,
            "evidence_grade": evidence,
            "patient_match_score": round(match_score, 2),
            "efficacy_score": round(efficacy_score, 3),
            "overall_score": round(overall, 3),
        })
    
    # Rank by overall score (descending)
    scored_protocols.sort(key=lambda x: x["overall_score"], reverse=True)
    
    # Generate ranked results with rationale
    results = []
    for i, sp in enumerate(scored_protocols):
        rank = i + 1
        protocol_name = sp["protocol_name"]
        modality = sp["modality"]
        remission = sp["remission_probability"]
        safety = sp["safety_score"]
        cost = sp["cost_usd"]
        duration = sp["time_weeks"]
        evidence = sp["evidence_grade"]
        match = sp["patient_match_score"]
        overall = sp["overall_score"]
        
        # Generate rationale
        parts = []
        if rank == 1:
            parts.append("Highest overall score")
        
        # Highlight strengths
        strengths = []
        if remission >= 0.5:
            strengths.append("strong predicted efficacy")
        if safety >= 0.92:
            strengths.append("excellent safety profile")
        if match >= 0.8:
            strengths.append("strong patient match")
        if evidence == "A":
            strengths.append("high-quality evidence")
        if cost <= 2000:
            strengths.append("cost-effective")
        if duration <= 3:
            strengths.append("short treatment duration")
        
        weaknesses = []
        if cost >= 8000:
            weaknesses.append("higher cost")
        if duration >= 6:
            weaknesses.append("longer treatment course")
        if remission < 0.3:
            weaknesses.append("lower predicted efficacy")
        if match < 0.5:
            weaknesses.append("moderate patient match")
        
        if strengths:
            parts.append(", ".join(strengths))
        if weaknesses:
            parts.append("; " + ", ".join(weaknesses))
        
        rationale = "; ".join(parts) if parts else f"Overall score: {overall:.3f}"
        
        results.append({
            "rank": rank,
            "protocol": protocol_name,
            "modality": modality,
            "remission_probability": remission,
            "safety_score": round(safety, 2),
            "cost_usd": cost,
            "time_weeks": duration,
            "evidence_grade": evidence,
            "patient_match_score": match,
            "overall_score": round(overall, 2),
            "rationale": rationale,
        })
    
    return results


def rank_by_evidence(protocols: List[Dict]) -> List[Dict[str, Any]]:
    """
    Rank protocols by evidence quality.
    
    Weights by: evidence grade (A=1.0, B=0.8, C=0.6, D=0.4) x n_trials x recency_factor.
    Protocols with more recent, higher-quality evidence from larger trial 
    populations receive higher rankings.
    
    Args:
        protocols: List of protocol dictionaries, each with:
            - name: str (protocol name)
            - modality: str (modality name)
            - evidence_grade: str ("A" | "B" | "C" | "D")
            - n_trials: int (number of supporting trials)
            - last_trial_year: int (year of most recent major trial)
            - total_n_patients: int (total patients across trials)
    
    Returns:
        List of evidence-weighted rankings with:
        - protocol: Protocol name
        - modality: Modality
        - evidence_grade: Letter grade
        - n_trials: Number of trials
        - recency_years: Years since most recent trial
        - weighted_score: Final weighted evidence score
        - raw_score: Raw unweighted score
    
    Raises:
        ValueError: If protocols list is empty
    
    Example:
        >>> protocols = [
        ...     {"name": "tDCS F3-F4", "modality": "tDCS", "evidence_grade": "A",
        ...      "n_trials": 15, "last_trial_year": 2023, "total_n_patients": 450},
        ...     {"name": "rTMS L DLPFC", "modality": "rTMS", "evidence_grade": "A",
        ...      "n_trials": 25, "last_trial_year": 2022, "total_n_patients": 1200},
        ... ]
        >>> ranked = rank_by_evidence(protocols)
        >>> len(ranked) == 2
        True
    """
    if not protocols:
        raise ValueError("At least one protocol required for evidence ranking")
    
    current_year = datetime.now().year
    scored = []
    
    for protocol in protocols:
        name = protocol.get("name", "Unknown")
        modality = protocol.get("modality", "tDCS")
        grade_str = protocol.get("evidence_grade", "B")
        
        # Parse evidence grade
        try:
            grade = EvidenceGrade(grade_str)
        except ValueError:
            grade = EvidenceGrade.B
        
        n_trials = protocol.get("n_trials", 1)
        last_trial_year = protocol.get("last_trial_year", current_year)
        total_n = protocol.get("total_n_patients", n_trials * 30)
        
        # Grade weight
        grade_weight = EVIDENCE_GRADE_WEIGHTS.get(grade, 0.8)
        
        # Recency factor (exponential decay - older = lower weight)
        years_ago = max(0, current_year - last_trial_year)
        recency_factor = math.exp(-0.15 * years_ago)  # 15% decay per year
        
        # Trial count scaling (diminishing returns)
        trial_factor = math.log1p(n_trials) / math.log1p(50)  # Normalize to ~50 trials
        trial_factor = min(trial_factor, 1.0)
        
        # Sample size factor
        sample_factor = math.log1p(total_n) / math.log1p(2000)  # Normalize to ~2000
        sample_factor = min(sample_factor, 1.0)
        
        # Calculate raw score
        raw_score = grade_weight * n_trials * recency_factor
        
        # Calculate weighted score
        weighted_score = grade_weight * trial_factor * recency_factor * sample_factor
        
        scored.append({
            "protocol": name,
            "modality": modality,
            "evidence_grade": grade_str,
            "n_trials": n_trials,
            "recency_years": years_ago,
            "total_n_patients": total_n,
            "weighted_score": round(weighted_score, 4),
            "raw_score": round(raw_score, 4),
        })
    
    # Sort by weighted score descending
    scored.sort(key=lambda x: x["weighted_score"], reverse=True)
    
    # Add rank
    for i, entry in enumerate(scored):
        entry["rank"] = i + 1
    
    return scored


def generate_outcome_report(
    patient: Dict, 
    protocols: List[Dict], 
    output_format: str = "json"
) -> Union[str, Dict]:
    """
    Generate a comprehensive outcome prediction report.
    
    Args:
        patient: Patient data dictionary
        protocols: List of protocols to evaluate
        output_format: "json", "dict", or "markdown"
    
    Returns:
        Report in requested format
    
    Example:
        >>> patient = {"age": 45, "sex": "female", "genetic_markers": {"COMT": "Met/Met"}}
        >>> protocols = [
        ...     {"name": "tDCS F3-F4", "modality": "tDCS", "target": "DLPFC",
        ...      "condition": "MDD", "evidence_grade": "A", "n_trials": 15,
        ...      "base_remission_rate": 0.45, "base_response_rate": 0.65},
        ... ]
        >>> report = generate_outcome_report(patient, protocols, "dict")
        >>> "predictions" in report
        True
    """
    # Get predictions for each protocol
    predictions = []
    for protocol in protocols:
        pred = predict_response(patient, protocol)
        predictions.append({
            "protocol": protocol.get("name", "Unknown"),
            "modality": protocol.get("modality", "Unknown"),
            "prediction": pred,
        })
    
    # Get comparison
    comparison = compare_protocols(patient, protocols)
    
    # Get evidence ranking
    evidence_ranking = rank_by_evidence(protocols)
    
    report = {
        "generated_at": datetime.now().isoformat(),
        "patient_summary": {
            "age": patient.get("age"),
            "sex": patient.get("sex"),
            "age_group": _get_age_group(patient.get("age", 40)),
            "genetic_markers": patient.get("genetic_markers", {}),
            "neuroimaging": patient.get("neuroimaging", []),
            "medications": patient.get("medications", []),
            "treatment_resistance_level": patient.get("treatment_resistance_level", "naive"),
        },
        "n_protocols_evaluated": len(protocols),
        "predictions": predictions,
        "protocol_comparison": comparison,
        "evidence_ranking": evidence_ranking,
    }
    
    if output_format == "json":
        return json.dumps(report, indent=2)
    elif output_format == "markdown":
        return _generate_markdown_report(report)
    else:
        return report


def _generate_markdown_report(report: Dict) -> str:
    """Generate a human-readable markdown report."""
    lines = []
    lines.append("# Neuromodulation Outcome Prediction Report")
    lines.append(f"\nGenerated: {report['generated_at']}\n")
    
    # Patient summary
    lines.append("## Patient Summary\n")
    ps = report["patient_summary"]
    lines.append(f"- **Age:** {ps['age']} ({ps['age_group']})")
    lines.append(f"- **Sex:** {ps['sex']}")
    lines.append(f"- **Genetic Markers:** {ps['genetic_markers']}")
    lines.append(f"- **Neuroimaging:** {ps['neuroimaging']}")
    lines.append(f"- **Medications:** {ps['medications']}")
    lines.append(f"- **Treatment Resistance:** {ps['treatment_resistance_level']}\n")
    
    # Protocol comparison
    lines.append("## Protocol Comparison (Ranked)\n")
    lines.append("| Rank | Protocol | Modality | Remission | Safety | Cost | Weeks | Evidence | Match | Overall |")
    lines.append("|------|----------|----------|-----------|--------|------|-------|----------|-------|---------|")
    
    for entry in report["protocol_comparison"]:
        lines.append(
            f"| {entry['rank']} | {entry['protocol']} | {entry['modality']} | "
            f"{entry['remission_probability']:.2f} | {entry['safety_score']:.2f} | "
            f"${entry['cost_usd']:,} | {entry['time_weeks']} | {entry['evidence_grade']} | "
            f"{entry['patient_match_score']:.2f} | {entry['overall_score']:.2f} |"
        )
    
    lines.append("\n### Rationale\n")
    for entry in report["protocol_comparison"]:
        lines.append(f"**{entry['rank']}. {entry['protocol']}:** {entry['rationale']}\n")
    
    # Detailed predictions
    lines.append("## Detailed Predictions\n")
    for pred in report["predictions"]:
        p = pred["prediction"]
        lines.append(f"### {pred['protocol']} ({pred['modality']})\n")
        
        outcomes = p["predicted_outcomes"]
        lines.append("**Predicted Outcomes:**")
        lines.append(f"- Remission: {outcomes['remission_probability']:.0%}")
        lines.append(f"- Response: {outcomes['response_probability']:.0%}")
        lines.append(f"- No Effect: {outcomes['no_effect_probability']:.0%}")
        lines.append(f"- Adverse Event: {outcomes['adverse_event_probability']:.0%}\n")
        
        cis = p["confidence_intervals"]
        lines.append("**Confidence Intervals (95%):**")
        lines.append(f"- Remission: [{cis['remission']['lower']:.2f}, {cis['remission']['upper']:.2f}]")
        lines.append(f"- Response: [{cis['response']['lower']:.2f}, {cis['response']['upper']:.2f}]\n")
        
        time_resp = p["time_to_response_weeks"]
        lines.append(f"**Time to Response:** {time_resp['median']} weeks (range: {time_resp['range']})\n")
        lines.append(f"**Prediction Confidence:** {p['confidence']:.0%}\n")
        
        if p["predictors"]:
            lines.append("**Key Predictors:**")
            for predictor in p["predictors"]:
                emoji = "+" if predictor["direction"] == "positive" else "-" if predictor["direction"] == "negative" else "~"
                lines.append(f"- {emoji} {predictor['factor']} (weight: {predictor['weight']:.2f}, {predictor['evidence']})")
            lines.append("")
    
    # Evidence ranking
    lines.append("## Evidence Ranking\n")
    lines.append("| Rank | Protocol | Grade | Trials | Patients | Weighted Score |")
    lines.append("|------|----------|-------|--------|----------|----------------|")
    
    for entry in report["evidence_ranking"]:
        lines.append(
            f"| {entry['rank']} | {entry['protocol']} | {entry['evidence_grade']} | "
            f"{entry['n_trials']} | {entry['total_n_patients']} | {entry['weighted_score']:.4f} |"
        )
    
    lines.append("")
    
    return "\n".join(lines)


# =============================================================================
# CLINICAL PROTOCOL DATABASE
# =============================================================================

# Pre-configured evidence-based protocols for common conditions
CANONICAL_PROTOCOLS = {
    "MDD": [
        {
            "name": "tDCS F3-F4 depression",
            "modality": "tDCS",
            "target": "DLPFC (F3-F4)",
            "condition": "MDD",
            "evidence_grade": "A",
            "n_trials": 15,
            "last_trial_year": 2023,
            "total_n_patients": 450,
            "base_remission_rate": 0.45,
            "base_response_rate": 0.65,
            "stimulation_parameters": {
                "intensity_ma": 2.0,
                "duration_min": 20,
                "sessions": 10,
                "anode": "F3",
                "cathode": "F4",
            },
        },
        {
            "name": "rTMS L DLPFC 10Hz",
            "modality": "rTMS",
            "target": "Left DLPFC",
            "condition": "MDD",
            "evidence_grade": "A",
            "n_trials": 25,
            "last_trial_year": 2022,
            "total_n_patients": 1200,
            "base_remission_rate": 0.35,
            "base_response_rate": 0.55,
            "stimulation_parameters": {
                "frequency_hz": 10,
                "intensity_mt": 120,
                "pulses_per_session": 3000,
                "sessions": 20,
            },
        },
        {
            "name": "Deep TMS H1 coil MDD",
            "modality": "Deep TMS",
            "target": "Bilateral PFC",
            "condition": "MDD",
            "evidence_grade": "A",
            "n_trials": 8,
            "last_trial_year": 2023,
            "total_n_patients": 800,
            "base_remission_rate": 0.50,
            "base_response_rate": 0.70,
            "stimulation_parameters": {
                "frequency_hz": 18,
                "intensity_mt": 120,
                "sessions": 20,
            },
        },
        {
            "name": "TBS L DLPFC",
            "modality": "TBS",
            "target": "Left DLPFC",
            "condition": "MDD",
            "evidence_grade": "A",
            "n_trials": 6,
            "last_trial_year": 2021,
            "total_n_patients": 300,
            "base_remission_rate": 0.40,
            "base_response_rate": 0.60,
            "stimulation_parameters": {
                "pattern": "iTBS",
                "intensity_mt": 80,
                "sessions": 20,
            },
        },
    ],
    "OCD": [
        {
            "name": "Deep TMS H7 coil OCD",
            "modality": "Deep TMS",
            "target": "mPFC/ACC",
            "condition": "OCD",
            "evidence_grade": "A",
            "n_trials": 5,
            "last_trial_year": 2023,
            "total_n_patients": 250,
            "base_remission_rate": 0.35,
            "base_response_rate": 0.50,
            "stimulation_parameters": {
                "frequency_hz": 20,
                "intensity_mt": 100,
                "sessions": 25,
            },
        },
        {
            "name": "rTMS SMA OCD",
            "modality": "rTMS",
            "target": "Supplementary Motor Area",
            "condition": "OCD",
            "evidence_grade": "B",
            "n_trials": 8,
            "last_trial_year": 2020,
            "total_n_patients": 200,
            "base_remission_rate": 0.25,
            "base_response_rate": 0.40,
            "stimulation_parameters": {
                "frequency_hz": 1,
                "intensity_mt": 110,
                "sessions": 20,
            },
        },
    ],
    "chronic_pain": [
        {
            "name": "tDCS M1 contralateral pain",
            "modality": "tDCS",
            "target": "M1",
            "condition": "chronic_pain",
            "evidence_grade": "A",
            "n_trials": 20,
            "last_trial_year": 2022,
            "total_n_patients": 600,
            "base_remission_rate": 0.30,
            "base_response_rate": 0.55,
            "stimulation_parameters": {
                "intensity_ma": 2.0,
                "duration_min": 20,
                "sessions": 10,
            },
        },
        {
            "name": "rTMS M1 10Hz pain",
            "modality": "rTMS",
            "target": "M1",
            "condition": "chronic_pain",
            "evidence_grade": "A",
            "n_trials": 12,
            "last_trial_year": 2021,
            "total_n_patients": 400,
            "base_remission_rate": 0.25,
            "base_response_rate": 0.50,
            "stimulation_parameters": {
                "frequency_hz": 10,
                "intensity_mt": 90,
                "sessions": 10,
            },
        },
    ],
    "ADHD": [
        {
            "name": "tDCS R DLPFC ADHD",
            "modality": "tDCS",
            "target": "Right DLPFC",
            "condition": "ADHD",
            "evidence_grade": "B",
            "n_trials": 8,
            "last_trial_year": 2023,
            "total_n_patients": 200,
            "base_remission_rate": 0.25,
            "base_response_rate": 0.45,
            "stimulation_parameters": {
                "intensity_ma": 1.0,
                "duration_min": 15,
                "sessions": 10,
            },
        },
        {
            "name": "Neurofeedback theta/beta ADHD",
            "modality": "neurofeedback",
            "target": "EEG theta/beta ratio",
            "condition": "ADHD",
            "evidence_grade": "B",
            "n_trials": 10,
            "last_trial_year": 2022,
            "total_n_patients": 350,
            "base_remission_rate": 0.20,
            "base_response_rate": 0.40,
            "stimulation_parameters": {
                "n_sessions": 30,
                "session_duration_min": 30,
                "frequency_target": "SMR",
            },
        },
    ],
    "PTSD": [
        {
            "name": "rTMS R DLPFC PTSD",
            "modality": "rTMS",
            "target": "Right DLPFC",
            "condition": "PTSD",
            "evidence_grade": "B",
            "n_trials": 6,
            "last_trial_year": 2022,
            "total_n_patients": 200,
            "base_remission_rate": 0.30,
            "base_response_rate": 0.50,
            "stimulation_parameters": {
                "frequency_hz": 10,
                "intensity_mt": 110,
                "sessions": 20,
            },
        },
        {
            "name": "tDCS bilateral DLPFC PTSD",
            "modality": "tDCS",
            "target": "Bilateral DLPFC",
            "condition": "PTSD",
            "evidence_grade": "C",
            "n_trials": 4,
            "last_trial_year": 2021,
            "total_n_patients": 120,
            "base_remission_rate": 0.20,
            "base_response_rate": 0.40,
            "stimulation_parameters": {
                "intensity_ma": 2.0,
                "duration_min": 20,
                "sessions": 10,
            },
        },
    ],
    "cognitive_enhancement": [
        {
            "name": "tDCS L DLPFC cognition",
            "modality": "tDCS",
            "target": "Left DLPFC",
            "condition": "cognitive_enhancement",
            "evidence_grade": "B",
            "n_trials": 12,
            "last_trial_year": 2023,
            "total_n_patients": 400,
            "base_remission_rate": 0.20,
            "base_response_rate": 0.50,
            "stimulation_parameters": {
                "intensity_ma": 1.5,
                "duration_min": 20,
                "sessions": 5,
            },
        },
        {
            "name": "tRNS F3-F4 cognition",
            "modality": "tRNS",
            "target": "DLPFC (F3-F4)",
            "condition": "cognitive_enhancement",
            "evidence_grade": "B",
            "n_trials": 5,
            "last_trial_year": 2022,
            "total_n_patients": 150,
            "base_remission_rate": 0.20,
            "base_response_rate": 0.45,
            "stimulation_parameters": {
                "frequency_range": "100-640 Hz",
                "intensity_ma": 1.0,
                "duration_min": 20,
                "sessions": 5,
            },
        },
    ],
}


def get_protocols_for_condition(condition: str) -> List[Dict]:
    """
    Get canonical evidence-based protocols for a given condition.
    
    Args:
        condition: Condition code (e.g., "MDD", "OCD", "ADHD")
    
    Returns:
        List of protocol dictionaries
    
    Example:
        >>> protocols = get_protocols_for_condition("MDD")
        >>> len(protocols) > 0
        True
    """
    return CANONICAL_PROTOCOLS.get(condition, [])


# =============================================================================
# MAIN EXECUTION
# =============================================================================

if __name__ == "__main__":
    # Demonstration with example patient
    example_patient = {
        "age": 45,
        "sex": "female",
        "genetic_markers": {"COMT": "Met/Met", "BDNF": "Val/Val"},
        "neuroimaging": ["DLPFC_hypoactivity", "EEG_alpha_asymmetry"],
        "medications": ["SSRI"],
        "conditions": [],
        "medical_history": [],
        "implanted_devices": [],
        "prior_treatments": [],
        "treatment_resistance_level": "single_failure",
    }
    
    # Get protocols for MDD
    mdd_protocols = get_protocols_for_condition("MDD")
    
    if len(mdd_protocols) >= 2:
        # Run comparison
        comparison = compare_protocols(example_patient, mdd_protocols[:4])
        
        print("=" * 70)
        print("OUTCOME PREDICTOR + PROTOCOL COMPARATOR - DEMONSTRATION")
        print("=" * 70)
        print(f"\nPatient: {example_patient['age']}-year-old {example_patient['sex']}")
        print(f"Genetics: {example_patient['genetic_markers']}")
        print(f"Neuroimaging: {example_patient['neuroimaging']}")
        print(f"Medications: {example_patient['medications']}")
        print(f"Treatment resistance: {example_patient['treatment_resistance_level']}")
        
        print("\n--- PROTOCOL COMPARISON ---\n")
        for entry in comparison:
            print(f"Rank {entry['rank']}: {entry['protocol']} ({entry['modality']})")
            print(f"  Remission: {entry['remission_probability']:.0%} | "
                  f"Safety: {entry['safety_score']:.2f} | "
                  f"Cost: ${entry['cost_usd']:,} | "
                  f"Time: {entry['time_weeks']} weeks | "
                  f"Evidence: {entry['evidence_grade']} | "
                  f"Match: {entry['patient_match_score']:.2f} | "
                  f"Overall: {entry['overall_score']:.2f}")
            print(f"  Rationale: {entry['rationale']}\n")
        
        # Detailed prediction for top protocol
        top_protocol = mdd_protocols[0]
        prediction = predict_response(example_patient, top_protocol)
        
        print("--- DETAILED PREDICTION (Top Protocol) ---\n")
        print(f"Protocol: {prediction['protocol']}")
        print(f"Predicted Outcomes:")
        for outcome, prob in prediction['predicted_outcomes'].items():
            print(f"  {outcome}: {prob:.0%}")
        print(f"\nConfidence Intervals (95%):")
        for outcome, ci in prediction['confidence_intervals'].items():
            print(f"  {outcome}: [{ci['lower']:.2f}, {ci['upper']:.2f}]")
        print(f"\nTime to Response: {prediction['time_to_response_weeks']['median']} weeks "
              f"(range: {prediction['time_to_response_weeks']['range']})")
        print(f"Prediction Confidence: {prediction['confidence']:.0%}")
        print(f"\nKey Predictors:")
        for pred in prediction['predictors']:
            print(f"  {pred['factor']}: weight={pred['weight']:.2f}, "
                  f"direction={pred['direction']}, evidence={pred['evidence']}")
        
        # Evidence ranking
        evidence_ranking = rank_by_evidence(mdd_protocols[:4])
        print("\n--- EVIDENCE RANKING ---\n")
        for entry in evidence_ranking:
            print(f"Rank {entry['rank']}: {entry['protocol']}")
            print(f"  Grade: {entry['evidence_grade']} | "
                  f"Trials: {entry['n_trials']} | "
                  f"Patients: {entry['total_n_patients']} | "
                  f"Weighted Score: {entry['weighted_score']:.4f}")
    else:
        print("Insufficient protocols for comparison.")
