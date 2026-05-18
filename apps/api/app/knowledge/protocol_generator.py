#!/usr/bin/env python3
"""
================================================================================
Protocol Generator Engine — Core Orchestrator
================================================================================
Personalized neuromodulation treatment protocol generator coordinating
multiple modality builders (tDCS, TMS, PBM, Neurofeedback) with
safety validation, outcome prediction, protocol ranking, and
clinical report generation.

Architecture:
    Patient Profile → Protocol Generator → [tDCS, TMS, PBM, Neurofeedback] Builders
                                                  ↓
                                        Safety Checker (contraindications)
                                                  ↓
                                        Outcome Predictor (response probability)
                                                  ↓
                                        Protocol Comparator (rank best 2-5)
                                                  ↓
                                        Report Generator (PDF/JSON output)

Author: Clinical Neuromodulation Protocol Engineer
Version: 1.0.0
Schema: Canonical Clinical Schema v2.1
================================================================================
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import math
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import (
    Any,
    Callable,
    Coroutine,
    Dict,
    List,
    Optional,
    Protocol,
    Set,
    Tuple,
    Union,
)

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logger = logging.getLogger("protocol_generator")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(
        logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
        )
    )
    logger.addHandler(_handler)

# =============================================================================
# ENUMERATIONS — Canonical Clinical Schema
# =============================================================================


class ModalityType(str, Enum):
    """Supported neuromodulation modalities."""

    TDCS = "TDCS"
    TMS = "TMS"
    PBM = "PBM"
    NEUROFEEDBACK = "NEUROFEEDBACK"
    TACS = "TACS"
    TRNS = "TRNS"
    DCS = "DCS"


class EvidenceGrade(str, Enum):
    """Evidence quality grades (Oxford CEBM-style)."""

    A_SYSTEMATIC_REVIEW = "A"  # Systematic review / meta-analysis
    B_RANDOMIZED_TRIAL = "B"  # RCT with consistent results
    COHORT_STUDY = "B-"  # High-quality cohort study
    C_CASE_CONTROL = "C"  # Case-control / observational
    D_EXPERT = "D"  # Expert opinion / case series
    INSUFFICIENT = "I"  # Insufficient evidence


class SafetyLevel(str, Enum):
    """Safety classification for protocols."""

    SAFE = "safe"
    CAUTION = "caution"
    CONTRAINDICATED = "contraindicated"
    UNKNOWN = "unknown"


class ContraindicationSeverity(str, Enum):
    """Severity levels for contraindications."""

    ABSOLUTE = "absolute_contraindication"
    RELATIVE = "relative_contraindication"
    PRECAUTION = "precaution"


class PatientSex(str, Enum):
    """Patient sex for physiological calculations."""

    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNKNOWN = "unknown"


class DiagnosisCategory(str, Enum):
    """Canonical diagnosis categories."""

    MAJOR_DEPRESSIVE_DISORDER = "major_depressive_disorder"
    TREATMENT_RESISTANT_DEPRESSION = "treatment_resistant_depression"
    GENERALIZED_ANXIETY_DISORDER = "generalized_anxiety_disorder"
    PTSD = "post_traumatic_stress_disorder"
    ADHD = "attention_deficit_hyperactivity_disorder"
    ALZHEIMERS_DISEASE = "alzheimers_disease"
    MILD_COGNITIVE_IMPAIRMENT = "mild_cognitive_impairment"
    PARKINSONS_DISEASE = "parkinsons_disease"
    FIBROMYALGIA = "fibromyalgia"
    CHRONIC_PAIN = "chronic_pain"
    MIGRAINE = "migraine"
    STROKE_REHABILITATION = "stroke_rehabilitation"
    TBI = "traumatic_brain_injury"
    SCHIZOPHRENIA = "schizophrenia"
    BIPOLAR_DISORDER = "bipolar_disorder"
    OCD = "obsessive_compulsive_disorder"
    SUBSTANCE_USE_DISORDER = "substance_use_disorder"
    INSOMNIA = "insomnia"
    EPILEPSY = "epilepsy"
    AUTISM_SPECTRUM = "autism_spectrum_disorder"


# =============================================================================
# DATA CLASSES — Domain Models
# =============================================================================


@dataclass
class PatientProfile:
    """Structured patient demographic and clinical data."""

    age_years: int
    sex: PatientSex
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    medications: List[str] = field(default_factory=list)
    comorbidities: List[str] = field(default_factory=list)
    prior_neuromodulation: List[Dict[str, Any]] = field(default_factory=list)
    genetic_variants: Dict[str, str] = field(default_factory=dict)
    imaging_available: List[str] = field(default_factory=list)
    qeeg_available: bool = False
    qeeg_patterns: Dict[str, Any] = field(default_factory=dict)
    mri_findings: Dict[str, Any] = field(default_factory=dict)
    pet_findings: Dict[str, Any] = field(default_factory=dict)
    severity_score: Optional[float] = None  # 0-10 clinical severity
    treatment_history: List[str] = field(default_factory=list)
    implant_devices: List[str] = field(default_factory=list)
    pregnancy_status: bool = False
    skin_conditions: List[str] = field(default_factory=list)
    seizure_history: bool = False

    @property
    def bmi(self) -> Optional[float]:
        """Calculate body mass index if weight and height available."""
        if self.weight_kg and self.height_cm and self.height_cm > 0:
            return self.weight_kg / ((self.height_cm / 100) ** 2)
        return None

    @property
    def age_group(self) -> str:
        """Classify patient into age group for protocol adjustments."""
        if self.age_years < 12:
            return "pediatric"
        elif self.age_years < 18:
            return "adolescent"
        elif self.age_years < 65:
            return "adult"
        elif self.age_years < 80:
            return "geriatric"
        return "late_geriatric"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "age_years": self.age_years,
            "sex": self.sex.value,
            "age_group": self.age_group,
            "bmi": self.bmi,
            "medications": self.medications,
            "comorbidities": self.comorbidities,
            "genetic_variants": self.genetic_variants,
            "imaging_available": self.imaging_available,
            "qeeg_available": self.qeeg_available,
            "implant_devices": self.implant_devices,
            "seizure_history": self.seizure_history,
            "pregnancy_status": self.pregnancy_status,
            "severity_score": self.severity_score,
        }


@dataclass
class StimulationParameters:
    """Base stimulation parameters — extended by modality-specific subclasses."""

    duration_min: int
    sessions: int
    frequency: str  # e.g., "daily_x5_weeks", "3x_weekly", "twice_daily"
    ramp_up_s: Optional[int] = None
    ramp_down_s: Optional[int] = None
    rest_period_min: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TDCSParameters(StimulationParameters):
    """Transcranial Direct Current Stimulation parameters."""

    anode: str = ""  # 10-20 electrode position
    cathode: str = ""  # 10-20 electrode position
    electrode_size_cm2: int = 25
    current_ma: float = 2.0
    current_density_ma_cm2: Optional[float] = None
    saline_concentration: Optional[str] = None
    electrode_type: str = "sponge"
    sham_probability: Optional[float] = None
    polarity: str = "anodal"

    def __post_init__(self):
        if self.electrode_size_cm2 > 0:
            self.current_density_ma_cm2 = round(
                self.current_ma / self.electrode_size_cm2, 3
            )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TMSParameters(StimulationParameters):
    """Transcranial Magnetic Stimulation parameters."""

    coil_type: str = "figure-8"
    target_region: str = ""  # e.g., "dlPFC_L", "DLPFC_R"
    stimulation_pattern: str = "rTMS"
    frequency_hz: float = 10.0
    intensity_pct_mso: float = 120.0
    pulses_per_session: int = 3000
    train_duration_s: float = 5.0
    inter_train_interval_s: float = 25.0
    total_trains: int = 30
    neuronavigation: bool = False
    resting_motor_threshold: Optional[float] = None
    neuronavigation_method: Optional[str] = None
    maintenance_sessions: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class PBMParameters(StimulationParameters):
    """Photobiomodulation / Low-Level Light Therapy parameters."""

    wavelength_nm: int = 810
    power_mw: float = 250.0
    fluence_j_cm2: float = 60.0
    irradiance_mw_cm2: Optional[float] = None
    device_type: str = "helmet"
    led_or_laser: str = "LED"
    target_regions: List[str] = field(default_factory=list)
    pulsing_frequency_hz: Optional[float] = None
    duty_cycle_pct: Optional[float] = None
    total_energy_delivered_j: Optional[float] = None

    def __post_init__(self):
        if self.irradiance_mw_cm2 and self.duration_min:
            self.total_energy_delivered_j = round(
                self.irradiance_mw_cm2 * self.duration_min * 60 / 1000, 2
            )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class NeurofeedbackParameters(StimulationParameters):
    """EEG Neurofeedback / EEG-biofeedback parameters."""

    protocol_type: str = "SMR"  # SMR, alpha_theta, SCP, Z-score, ILF
    feedback_channel: str = "Cz"
    target_frequency_hz: Optional[Tuple[float, float]] = None
    inhibit_frequency_hz: Optional[Tuple[float, float]] = None
    threshold_method: str = "adaptive"
    sessions_per_week: int = 2
    total_sessions: int = 40
    session_duration_min: int = 30
    artifact_rejection: bool = True
    reward_band_hz: Optional[Tuple[float, float]] = None
    inhibit_bands_hz: List[Tuple[float, float]] = field(default_factory=list)
    hardware: str = "19_channel_egi"
    software: str = "neuroguide"
    assessment_qeeg: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class EvidenceBase:
    """Structured evidence summary for a protocol."""

    n_trials: int = 0
    n_participants: int = 0
    meta_analysis_citation: str = ""
    effect_size_d: Optional[float] = None
    p_value: Optional[float] = None
    confidence_interval: Optional[Tuple[float, float]] = None
    source_adapters: List[str] = field(default_factory=list)
    evidence_grade: EvidenceGrade = EvidenceGrade.INSUFFICIENT
    latest_study_year: int = 2024
    primary_endpoints: List[str] = field(default_factory=list)
    key_references: List[str] = field(default_factory=list)
    confidence: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["evidence_grade"] = self.evidence_grade.value
        return d


@dataclass
class PredictedResponse:
    """Predicted treatment response from the outcome predictor."""

    remission_probability: float = 0.0
    response_probability: float = 0.0
    confidence: float = 0.0
    time_to_response_weeks: Optional[float] = None
    expected_improvement_pct: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SafetyProfile:
    """Safety profile including side effects and contraindications."""

    common_side_effects: List[str] = field(default_factory=list)
    rare_but_serious: List[str] = field(default_factory=list)
    contraindications_checked: List[str] = field(default_factory=list)
    safe_for_patient: bool = True
    required_monitoring: List[str] = field(default_factory=list)
    safety_level: SafetyLevel = SafetyLevel.SAFE

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["safety_level"] = self.safety_level.value
        return d


@dataclass
class ProtocolContraindication:
    """A specific contraindication finding."""

    condition: str
    severity: ContraindicationSeverity
    modality: str
    reason: str
    mitigation: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "condition": self.condition,
            "severity": self.severity.value,
            "modality": self.modality,
            "reason": self.reason,
            "mitigation": self.mitigation,
        }


@dataclass
class TreatmentProtocol:
    """A complete, generated treatment protocol."""

    rank: int = 0
    modality: str = ""
    name: str = ""
    protocol_id: str = ""
    parameters: Dict[str, Any] = field(default_factory=dict)
    evidence_base: EvidenceBase = field(default_factory=EvidenceBase)
    predicted_response: PredictedResponse = field(default_factory=PredictedResponse)
    safety: SafetyProfile = field(default_factory=SafetyProfile)
    contraindications: List[ProtocolContraindication] = field(default_factory=list)
    confidence_overall: float = 0.0
    estimated_cost_usd: float = 0.0
    total_time_weeks: float = 0.0
    age_adjustments: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rank": self.rank,
            "modality": self.modality,
            "name": self.name,
            "protocol_id": self.protocol_id,
            "parameters": self.parameters,
            "evidence_base": self.evidence_base.to_dict(),
            "predicted_response": self.predicted_response.to_dict(),
            "safety": self.safety.to_dict(),
            "contraindications": [c.to_dict() for c in self.contraindications],
            "confidence_overall": self.confidence_overall,
            "estimated_cost_usd": self.estimated_cost_usd,
            "total_time_weeks": self.total_time_weeks,
            "age_adjustments": self.age_adjustments,
        }


@dataclass
class RejectedProtocol:
    """A protocol rejected during safety or feasibility screening."""

    modality: str
    reason: str
    severity: ContraindicationSeverity

    def to_dict(self) -> Dict[str, Any]:
        return {
            "modality": self.modality,
            "reason": self.reason,
            "severity": self.severity.value,
        }


@dataclass
class GenerationConstraints:
    """Patient- or payer-specified constraints on protocol generation."""

    max_sessions: Optional[int] = None
    max_time_per_session_min: Optional[int] = None
    max_total_weeks: Optional[int] = None
    max_budget_usd: Optional[float] = None
    preferred_modalities: List[str] = field(default_factory=list)
    excluded_modalities: List[str] = field(default_factory=list)
    home_based_only: bool = False
    insurance_covered_only: bool = False
    min_evidence_grade: str = "C"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class GenerationResult:
    """Top-level result container for protocol generation."""

    patient_id: str = ""
    generated_at: str = ""
    diagnosis: str = ""
    protocols: List[TreatmentProtocol] = field(default_factory=list)
    rejected_protocols: List[RejectedProtocol] = field(default_factory=list)
    overall_confidence: float = 0.0
    next_review: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "patient_id": self.patient_id,
            "generated_at": self.generated_at,
            "diagnosis": self.diagnosis,
            "protocols": [p.to_dict() for p in self.protocols],
            "rejected_protocols": [r.to_dict() for r in self.rejected_protocols],
            "overall_confidence": self.overall_confidence,
            "next_review": self.next_review,
            "metadata": self.metadata,
        }

    def to_json(self, indent: int = 2) -> str:
        """Serialize result to JSON string."""
        return json.dumps(self.to_dict(), indent=indent, default=str)


# =============================================================================
# SAFETY CHECKER — Contraindications & Risk Assessment
# =============================================================================


class SafetyChecker:
    """
    Validates patient safety for each neuromodulation modality.

    Checks against canonical contraindication databases and returns
    structured safety profiles with severity classifications.
    """

    # --- Canonical contraindication databases --------------------------------

    TDCS_ABSOLUTE_CONTRAINDICATIONS: List[str] = [
        "intracranial_metal_implant",
        "intracranial_metal_fragment",
        "brain_stimulator_deep",
        "cochlear_implant",
        "cardiac_pacemaker",
        "implanted_defibrillator",
        "ventriculoperitoneal_shunt",
        "uncontrolled_epilepsy",
        "active_skin_lesion_electrode_site",
        "cranial_surgery_recent_6mo",
    ]

    TDCS_RELATIVE_CONTRAINDICATIONS: List[str] = [
        "pregnancy",
        "epilepsy_history",
        "cardiac_condition",
        "skin_condition_local",
        "medication_mood_stabilizer",
        "medication_anticonvulsant",
    ]

    TMS_ABSOLUTE_CONTRAINDICATIONS: List[str] = [
        "intracranial_metal_implant",
        "intracranial_metal_fragment",
        "cochlear_implant",
        "cardiac_pacemaker",
        "implanted_defibrillator",
        "deep_brain_stimulator",
        "vagal_nerve_stimulator_active",
        "aneurysm_clip",
        "ferromagnetic_ocular_implant",
    ]

    TMS_RELATIVE_CONTRAINDICATIONS: List[str] = [
        "seizure_history",
        "epilepsy",
        "medication_anticonvulsant",
        "medication_antipsychotic",
        "medication_tricyclic",
        "pregnancy",
        "severe_cardiac_condition",
        "substance_use_active",
        "tbi_acute",
    ]

    PBM_ABSOLUTE_CONTRAINDICATIONS: List[str] = [
        "photosensitive_epilepsy",
        "active_skin_malignancy_target_area",
        "retinal_disease_photosensitizing",
    ]

    PBM_RELATIVE_CONTRAINDICATIONS: List[str] = [
        "pregnancy",
        "medication_photosensitizing",
        "thyroid_condition_target_area",
        "tachycardia",
    ]

    NEUROFEEDBACK_ABSOLUTE_CONTRAINDICATIONS: List[str] = [
        "active_psychosis_unstable",
        "severe_dissociative_disorder_unstable",
    ]

    NEUROFEEDBACK_RELATIVE_CONTRAINDICATIONS: List[str] = [
        "seizure_history_no_medication",
        "bipolar_manic_phase",
        "severe_personality_disorder",
        "substance_withdrawal_acute",
    ]

    MEDICATION_INTERACTIONS: Dict[str, Dict[str, List[str]]] = {
        "TDCS": {
            "enhance_effect": ["SSRI", "SNRI", "lithium"],
            "reduce_effect": ["benzodiazepine", "anticonvulsant"],
            "increase_risk": ["tramadol", "theophylline"],
        },
        "TMS": {
            "enhance_effect": [],
            "reduce_threshold": ["antipsychotic", "tricyclic", "anticonvulsant"],
            "increase_seizure_risk": ["clozapine", "theophylline", "tramadol"],
        },
        "PBM": {
            "photosensitizing": ["tetracycline", "doxycycline", "amiodarone", "chlorpromazine"],
            "anticoagulant_interaction": ["warfarin", "aspirin_high_dose"],
        },
        "NEUROFEEDBACK": {
            "may_interfere": ["benzodiazepine", "stimulant"],
        },
    }

    def __init__(self):
        self._warning_log: List[str] = []

    def _log(self, message: str) -> None:
        self._warning_log.append(message)
        logger.debug(f"[SafetyChecker] {message}")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check_patient(
        self,
        modality: ModalityType,
        patient: PatientProfile,
    ) -> Tuple[SafetyProfile, List[ProtocolContraindication]]:
        """
        Full safety assessment for a patient × modality pair.

        Returns:
            (safety_profile, contraindication_list)
        """
        contras: List[ProtocolContraindication] = []
        checked: List[str] = []

        # --- modality-specific checks ----------------------------------
        if modality == ModalityType.TDCS:
            contras, checked = self._check_tdcs(patient)
        elif modality == ModalityType.TMS:
            contras, checked = self._check_tms(patient)
        elif modality == ModalityType.PBM:
            contras, checked = self._check_pbm(patient)
        elif modality == ModalityType.NEUROFEEDBACK:
            contras, checked = self._check_neurofeedback(patient)
        else:
            self._log(f"No specific checks for modality {modality.value}")

        # --- medication interaction checks -----------------------------
        med_contras = self._check_medication_interactions(modality.value, patient)
        contras.extend(med_contras)
        checked.extend([m for m in patient.medications])

        # --- age-specific checks ---------------------------------------
        age_contras = self._check_age_specific(modality.value, patient)
        contras.extend(age_contras)

        # --- build safety profile --------------------------------------
        absolute = any(
            c.severity == ContraindicationSeverity.ABSOLUTE for c in contras
        )
        relative = any(
            c.severity == ContraindicationSeverity.RELATIVE for c in contras
        )

        if absolute:
            safety_level = SafetyLevel.CONTRAINDICATED
            safe_for = False
        elif relative:
            safety_level = SafetyLevel.CAUTION
            safe_for = True  # proceed with caution
        else:
            safety_level = SafetyLevel.SAFE
            safe_for = True

        side_effects = self._get_common_side_effects(modality.value)
        monitoring = self._get_required_monitoring(modality.value, contras)

        profile = SafetyProfile(
            common_side_effects=side_effects,
            contraindications_checked=checked,
            safe_for_patient=safe_for,
            required_monitoring=monitoring,
            safety_level=safety_level,
        )
        return profile, contras

    def pre_screen(
        self,
        modalities: List[ModalityType],
        patient: PatientProfile,
    ) -> List[RejectedProtocol]:
        """
        Quick pre-screen to eliminate absolutely contraindicated modalities
        before protocol generation begins.

        Returns a list of rejected modalities with reasons.
        """
        rejected: List[RejectedProtocol] = []
        for modality in modalities:
            profile, contras = self.check_patient(modality, patient)
            if profile.safety_level == SafetyLevel.CONTRAINDICATED:
                reasons = [c.reason for c in contras if c.severity == ContraindicationSeverity.ABSOLUTE]
                rejected.append(
                    RejectedProtocol(
                        modality=modality.value,
                        reason="; ".join(reasons) if reasons else "Absolute contraindication detected",
                        severity=ContraindicationSeverity.ABSOLUTE,
                    )
                )
        return rejected

    # ------------------------------------------------------------------
    # Modality-specific checkers
    # ------------------------------------------------------------------

    def _check_tdcs(
        self, patient: PatientProfile
    ) -> Tuple[List[ProtocolContraindication], List[str]]:
        contras: List[ProtocolContraindication] = []
        checked: List[str] = []

        for device in patient.implant_devices:
            checked.append(device)
            if device.lower() in ["cochlear_implant", "brain_stimulator", "deep_brain_stimulator"]:
                contras.append(
                    ProtocolContraindication(
                        condition=device,
                        severity=ContraindicationSeverity.ABSOLUTE,
                        modality="TDCS",
                        reason=f"Active implant ({device}) — risk of current shunting and device interference",
                    )
                )
            elif device.lower() in ["cardiac_pacemaker", "implanted_defibrillator"]:
                contras.append(
                    ProtocolContraindication(
                        condition=device,
                        severity=ContraindicationSeverity.ABSOLUTE,
                        modality="TDCS",
                        reason=f"Cardiac implant ({device}) — potential electromagnetic interference",
                    )
                )

        if patient.seizure_history:
            checked.append("seizure_history")
            contras.append(
                ProtocolContraindication(
                    condition="seizure_history",
                    severity=ContraindicationSeverity.RELATIVE,
                    modality="TDCS",
                    reason="History of seizures — use reduced current intensity, require physician monitoring",
                    mitigation="Reduce to 1.0 mA, add EEG monitoring",
                )
            )

        if patient.pregnancy_status:
            checked.append("pregnancy")
            contras.append(
                ProtocolContraindication(
                    condition="pregnancy",
                    severity=ContraindicationSeverity.RELATIVE,
                    modality="TDCS",
                    reason="Pregnancy — limited safety data; avoid extracephalic montages",
                )
            )

        for skin in patient.skin_conditions:
            checked.append(f"skin_{skin}")
            contras.append(
                ProtocolContraindication(
                    condition=f"skin_{skin}",
                    severity=ContraindicationSeverity.PRECAUTION,
                    modality="TDCS",
                    reason=f"Skin condition ({skin}) at electrode site — risk of irritation or breakdown",
                    mitigation="Inspect skin pre/post, use hypoallergenic electrodes",
                )
            )

        return contras, checked

    def _check_tms(
        self, patient: PatientProfile
    ) -> Tuple[List[ProtocolContraindication], List[str]]:
        contras: List[ProtocolContraindication] = []
        checked: List[str] = []

        for device in patient.implant_devices:
            checked.append(device)
            if device.lower() in [
                "cochlear_implant", "deep_brain_stimulator",
                "cardiac_pacemaker", "implanted_defibrillator",
                "aneurysm_clip", "vagal_nerve_stimulator",
            ]:
                contras.append(
                    ProtocolContraindication(
                        condition=device,
                        severity=ContraindicationSeverity.ABSOLUTE,
                        modality="TMS",
                        reason=f"Ferromagnetic or electronic implant ({device}) — TMS can displace, heat, or malfunction device",
                    )
                )

        if patient.seizure_history:
            checked.append("seizure_history")
            contras.append(
                ProtocolContraindication(
                    condition="seizure_history",
                    severity=ContraindicationSeverity.RELATIVE,
                    modality="TMS",
                    reason="Seizure history — TMS carries ~0.01-0.1% seizure risk per session",
                    mitigation="Start at low intensity, gradual titration, EEG monitoring",
                )
            )

        if patient.pregnancy_status:
            checked.append("pregnancy")
            contras.append(
                ProtocolContraindication(
                    condition="pregnancy",
                    severity=ContraindicationSeverity.RELATIVE,
                    modality="TMS",
                    reason="Pregnancy — acoustic artifact may affect fetus; limited data",
                )
            )

        return contras, checked

    def _check_pbm(
        self, patient: PatientProfile
    ) -> Tuple[List[ProtocolContraindication], List[str]]:
        contras: List[ProtocolContraindication] = []
        checked: List[str] = []

        if patient.pregnancy_status:
            checked.append("pregnancy")
            contras.append(
                ProtocolContraindication(
                    condition="pregnancy",
                    severity=ContraindicationSeverity.RELATIVE,
                    modality="PBM",
                    reason="Pregnancy — avoid direct abdominal/thoracic exposure",
                )
            )

        for med in patient.medications:
            checked.append(med)
            if any(
                photosens in med.lower()
                for photosens in ["tetracycline", "doxycycline", "chlorpromazine", "amiodarone"]
            ):
                contras.append(
                    ProtocolContraindication(
                        condition=f"photosensitizing_medication_{med}",
                        severity=ContraindicationSeverity.RELATIVE,
                        modality="PBM",
                        reason=f"Photosensitizing medication ({med}) — may increase phototoxicity risk",
                        mitigation="Use lower fluence, monitor skin response",
                    )
                )

        if patient.seizure_history:
            checked.append("seizure_history")
            contras.append(
                ProtocolContraindication(
                    condition="seizure_history",
                    severity=ContraindicationSeverity.PRECAUTION,
                    modality="PBM",
                    reason="History of seizures — flickering light at certain frequencies may trigger",
                    mitigation="Avoid pulsing frequencies <30 Hz, use continuous wave",
                )
            )

        return contras, checked

    def _check_neurofeedback(
        self, patient: PatientProfile
    ) -> Tuple[List[ProtocolContraindication], List[str]]:
        contras: List[ProtocolContraindication] = []
        checked: List[str] = []

        if "active_psychosis" in [c.lower() for c in patient.comorbidities]:
            checked.append("active_psychosis")
            contras.append(
                ProtocolContraindication(
                    condition="active_psychosis",
                    severity=ContraindicationSeverity.ABSOLUTE,
                    modality="NEUROFEEDBACK",
                    reason="Active psychosis — NF may exacerbate delusional or dissociative states",
                )
            )

        if "severe_dissociative_disorder" in [c.lower() for c in patient.comorbidities]:
            checked.append("severe_dissociative_disorder")
            contras.append(
                ProtocolContraindication(
                    condition="severe_dissociative_disorder",
                    severity=ContraindicationSeverity.ABSOLUTE,
                    modality="NEUROFEEDBACK",
                    reason="Severe dissociative disorder — NF may trigger dissociative episodes",
                )
            )

        if patient.seizure_history:
            checked.append("seizure_history")
            contras.append(
                ProtocolContraindication(
                    condition="seizure_history",
                    severity=ContraindicationSeverity.RELATIVE,
                    modality="NEUROFEEDBACK",
                    reason="Seizure history — avoid protocols that may lower threshold",
                    mitigation="Avoid SMR suppression protocols; use SCP training",
                )
            )

        return contras, checked

    def _check_medication_interactions(
        self, modality: str, patient: PatientProfile
    ) -> List[ProtocolContraindication]:
        contras: List[ProtocolContraindication] = []
        interactions = self.MEDICATION_INTERACTIONS.get(modality, {})

        for med in patient.medications:
            med_lower = med.lower()
            for interaction_type, med_list in interactions.items():
                for known_med in med_list:
                    if known_med.lower() in med_lower:
                        severity = (
                            ContraindicationSeverity.PRECAUTION
                            if interaction_type in ["enhance_effect", "may_interfere"]
                            else ContraindicationSeverity.RELATIVE
                        )
                        contras.append(
                            ProtocolContraindication(
                                condition=f"medication_interaction_{med}",
                                severity=severity,
                                modality=modality,
                                reason=f"{modality} × {med}: {interaction_type.replace('_', ' ')}",
                                mitigation="Monitor closely, adjust parameters if needed",
                            )
                        )
        return contras

    def _check_age_specific(
        self, modality: str, patient: PatientProfile
    ) -> List[ProtocolContraindication]:
        contras: List[ProtocolContraindication] = []
        age = patient.age_years

        if modality == "TDCS" and age < 8:
            contras.append(
                ProtocolContraindication(
                    condition="age_under_8",
                    severity=ContraindicationSeverity.PRECAUTION,
                    modality="TDCS",
                    reason="Age <8 years — developing brain; use lowest effective current",
                    mitigation="Max 0.5-1.0 mA, smaller electrodes, shorter duration",
                )
            )
        elif modality == "TMS" and age < 12:
            contras.append(
                ProtocolContraindication(
                    condition="age_under_12",
                    severity=ContraindicationSeverity.PRECAUTION,
                    modality="TMS",
                    reason="Age <12 years — thinner skull, developing cortex; motor threshold lower",
                    mitigation="Start at 80% RMT, use figure-8 coil, shorter trains",
                )
            )
        elif modality == "PBM" and age < 3:
            contras.append(
                ProtocolContraindication(
                    condition="age_under_3",
                    severity=ContraindicationSeverity.PRECAUTION,
                    modality="PBM",
                    reason="Age <3 years — immature retinal and neural development",
                    mitigation="Use indirect exposure, lower fluence",
                )
            )
        elif modality == "NEUROFEEDBACK" and age < 5:
            contras.append(
                ProtocolContraindication(
                    condition="age_under_5",
                    severity=ContraindicationSeverity.PRECAUTION,
                    modality="NEUROFEEDBACK",
                    reason="Age <5 years — limited compliance, EEG reference norms less validated",
                    mitigation="Use game-based feedback, shorter sessions (15 min)",
                )
            )

        if age > 80 and modality in ("TMS", "TDCS"):
            contras.append(
                ProtocolContraindication(
                    condition="advanced_age_over_80",
                    severity=ContraindicationSeverity.PRECAUTION,
                    modality=modality,
                    reason="Age >80 — atrophy may alter current distribution / coil coupling",
                    mitigation="Use MRI-guided targeting, adjust intensity downward",
                )
            )

        return contras

    @staticmethod
    def _get_common_side_effects(modality: str) -> List[str]:
        side_effects_map = {
            "TDCS": [
                "mild tingling under electrodes",
                "skin redness",
                "itching sensation",
                "mild headache",
                "skin burning sensation (rare)",
            ],
            "TMS": [
                "scalp discomfort at stimulation site",
                "headache",
                "facial twitching",
                "neck pain",
                "transient hearing change",
                "lightheadedness",
            ],
            "PBM": [
                "mild warmth sensation",
                "temporary skin redness",
                "headache (rare)",
                "eye strain (if goggles not worn)",
            ],
            "NEUROFEEDBACK": [
                "temporary fatigue after session",
                "mild headache",
                "difficulty sleeping (if evening session)",
                "emotional release",
            ],
        }
        return side_effects_map.get(modality, [])

    @staticmethod
    def _get_required_monitoring(
        modality: str, contras: List[ProtocolContraindication]
    ) -> List[str]:
        base_monitoring = {
            "TDCS": ["skin inspection pre/post", "adverse event log"],
            "TMS": ["MEP monitoring (first session)", "seizure protocol ready", "adverse event log"],
            "PBM": ["skin temperature check", "eye protection verification", "adverse event log"],
            "NEUROFEEDBACK": ["EEG quality check", "mood assessment", "adverse event log"],
        }
        monitoring = base_monitoring.get(modality, ["adverse event log"])

        if any(c.severity == ContraindicationSeverity.RELATIVE for c in contras):
            monitoring.append("enhanced_monitoring_protocol")
        if any(c.severity == ContraindicationSeverity.ABSOLUTE for c in contras):
            monitoring.append("CONTRAINDICATED — do not proceed without specialist clearance")

        return monitoring


# =============================================================================
# OUTCOME PREDICTOR — Evidence-Based Response Scoring
# =============================================================================


class OutcomePredictor:
    """
    Predicts treatment response probability using:
    1. Meta-analytic effect sizes per diagnosis × modality
    2. Patient-specific modifier factors (age, severity, genetics)
    3. Evidence quality weighting
    """

    # --- Meta-analytic effect sizes (Cohen's d) and pooled response rates -----
    # Source: Brunoni 2017, Blumberger 2018, Saleh 2021, etc.
    META_ANALYTIC_DATABASE: Dict[str, Dict[str, Dict[str, Any]]] = {
        "major_depressive_disorder": {
            "tDCS": {
                "d": 0.63,
                "response_rate": 0.41,
                "remission_rate": 0.26,
                "n_trials": 47,
                "meta_citation": "Brunoni et al., 2017, JAMA Psychiatry; Mutz et al., 2019, Lancet Psychiatry",
                "confidence": 0.85,
            },
            "TMS": {
                "d": 0.88,
                "response_rate": 0.47,
                "remission_rate": 0.31,
                "n_trials": 35,
                "meta_citation": "Berlim et al., 2014, World Psychiatry; Brunoni et al., 2017",
                "confidence": 0.90,
            },
            "PBM": {
                "d": 0.46,
                "response_rate": 0.35,
                "remission_rate": 0.18,
                "n_trials": 12,
                "meta_citation": "Cassano et al., 2019, Photobiomodulation Photomed Surg",
                "confidence": 0.65,
            },
            "neurofeedback": {
                "d": 0.52,
                "response_rate": 0.38,
                "remission_rate": 0.22,
                "n_trials": 18,
                "meta_citation": "Cristea et al., 2017, Neurosci Biobehav Rev; Mayberg-derived protocols",
                "confidence": 0.60,
            },
        },
        "treatment_resistant_depression": {
            "tDCS": {
                "d": 0.42,
                "response_rate": 0.30,
                "remission_rate": 0.17,
                "n_trials": 15,
                "meta_citation": "Brunoni et al., 2014, PLOS ONE",
                "confidence": 0.70,
            },
            "TMS": {
                "d": 0.95,
                "response_rate": 0.52,
                "remission_rate": 0.35,
                "n_trials": 28,
                "meta_citation": "Blumberger et al., 2018, Lancet; George et al., 2010",
                "confidence": 0.92,
            },
            "PBM": {
                "d": 0.38,
                "response_rate": 0.28,
                "remission_rate": 0.14,
                "n_trials": 5,
                "meta_citation": "Cassano et al., 2018",
                "confidence": 0.50,
            },
            "neurofeedback": {
                "d": 0.35,
                "response_rate": 0.25,
                "remission_rate": 0.12,
                "n_trials": 6,
                "meta_citation": "Chaho et al., 2019",
                "confidence": 0.45,
            },
        },
        "generalized_anxiety_disorder": {
            "tDCS": {
                "d": 0.55,
                "response_rate": 0.45,
                "remission_rate": 0.20,
                "n_trials": 8,
                "meta_citation": "Shiozawa et al., 2014",
                "confidence": 0.60,
            },
            "TMS": {
                "d": 0.72,
                "response_rate": 0.50,
                "remission_rate": 0.25,
                "n_trials": 10,
                "meta_citation": "Diefenbach et al., 2016",
                "confidence": 0.70,
            },
            "neurofeedback": {
                "d": 0.58,
                "response_rate": 0.42,
                "remission_rate": 0.18,
                "n_trials": 9,
                "meta_citation": "Morris et al., 2020",
                "confidence": 0.55,
            },
        },
        "post_traumatic_stress_disorder": {
            "tDCS": {
                "d": 0.65,
                "response_rate": 0.48,
                "remission_rate": 0.22,
                "n_trials": 11,
                "meta_citation": "Kemp et al., 2020, Depression & Anxiety",
                "confidence": 0.72,
            },
            "TMS": {
                "d": 0.78,
                "response_rate": 0.55,
                "remission_rate": 0.30,
                "n_trials": 9,
                "meta_citation": "Nahas et al., 2020",
                "confidence": 0.75,
            },
            "neurofeedback": {
                "d": 0.85,
                "response_rate": 0.60,
                "remission_rate": 0.35,
                "n_trials": 14,
                "meta_citation": "Gapen et al., 2016; van der Kolk et al., 2016",
                "confidence": 0.78,
            },
        },
        "attention_deficit_hyperactivity_disorder": {
            "tDCS": {
                "d": 0.40,
                "response_rate": 0.35,
                "remission_rate": 0.10,
                "n_trials": 14,
                "meta_citation": "Nejati et al., 2020",
                "confidence": 0.60,
            },
            "neurofeedback": {
                "d": 0.72,
                "response_rate": 0.60,
                "remission_rate": 0.28,
                "n_trials": 22,
                "meta_citation": "Arns et al., 2014, EEG Clin Neurophysiol; Janzen et al., 2020",
                "confidence": 0.82,
            },
        },
        "alzheimers_disease": {
            "tDCS": {
                "d": 0.38,
                "response_rate": 0.32,
                "remission_rate": 0.0,
                "n_trials": 12,
                "meta_citation": "Im et al., 2019",
                "confidence": 0.55,
            },
            "TMS": {
                "d": 0.55,
                "response_rate": 0.40,
                "remission_rate": 0.0,
                "n_trials": 10,
                "meta_citation": "Dong et al., 2018",
                "confidence": 0.60,
            },
            "PBM": {
                "d": 0.72,
                "response_rate": 0.50,
                "remission_rate": 0.0,
                "n_trials": 8,
                "meta_citation": "Saltmarche et al., 2017; Berman et al., 2017",
                "confidence": 0.65,
            },
        },
        "mild_cognitive_impairment": {
            "tDCS": {
                "d": 0.45,
                "response_rate": 0.38,
                "remission_rate": 0.0,
                "n_trials": 6,
                "meta_citation": "Andre et al., 2019",
                "confidence": 0.55,
            },
            "PBM": {
                "d": 0.68,
                "response_rate": 0.48,
                "remission_rate": 0.0,
                "n_trials": 4,
                "meta_citation": "Nizamutdinov et al., 2021",
                "confidence": 0.55,
            },
        },
        "fibromyalgia": {
            "tDCS": {
                "d": 0.73,
                "response_rate": 0.50,
                "remission_rate": 0.15,
                "n_trials": 16,
                "meta_citation": "Lefaucheur et al., 2017, Brain Stimulation",
                "confidence": 0.80,
            },
            "TMS": {
                "d": 0.60,
                "response_rate": 0.42,
                "remission_rate": 0.10,
                "n_trials": 8,
                "meta_citation": "Boyd et al., 2016",
                "confidence": 0.65,
            },
            "PBM": {
                "d": 0.85,
                "response_rate": 0.58,
                "remission_rate": 0.18,
                "n_trials": 10,
                "meta_citation": "Mojarad et al., 2019",
                "confidence": 0.70,
            },
        },
        "chronic_pain": {
            "tDCS": {
                "d": 0.58,
                "response_rate": 0.42,
                "remission_rate": 0.12,
                "n_trials": 32,
                "meta_citation": "O'Connell et al., 2018, Cochrane Review",
                "confidence": 0.82,
            },
            "TMS": {
                "d": 0.65,
                "response_rate": 0.48,
                "remission_rate": 0.15,
                "n_trials": 15,
                "meta_citation": "Lefaucheur et al., 2020",
                "confidence": 0.75,
            },
            "PBM": {
                "d": 0.78,
                "response_rate": 0.55,
                "remission_rate": 0.20,
                "n_trials": 22,
                "meta_citation": "Glazov et al., 2016",
                "confidence": 0.78,
            },
        },
        "migraine": {
            "tDCS": {
                "d": 0.35,
                "response_rate": 0.30,
                "remission_rate": 0.10,
                "n_trials": 7,
                "meta_citation": "Azizi et al., 2019",
                "confidence": 0.55,
            },
            "TMS": {
                "d": 0.72,
                "response_rate": 0.55,
                "remission_rate": 0.25,
                "n_trials": 8,
                "meta_citation": "Lipton et al., 2010; Starling et al., 2018 (sTMS)",
                "confidence": 0.75,
            },
        },
        "stroke_rehabilitation": {
            "tDCS": {
                "d": 0.52,
                "response_rate": 0.45,
                "remission_rate": 0.0,
                "n_trials": 48,
                "meta_citation": "Elsner et al., 2016, Cochrane; Tedesco Triccas et al., 2016",
                "confidence": 0.82,
            },
            "TMS": {
                "d": 0.48,
                "response_rate": 0.42,
                "remission_rate": 0.0,
                "n_trials": 22,
                "meta_citation": "Hsu et al., 2012",
                "confidence": 0.70,
            },
        },
        "traumatic_brain_injury": {
            "tDCS": {
                "d": 0.45,
                "response_rate": 0.38,
                "remission_rate": 0.0,
                "n_trials": 10,
                "meta_citation": "Rabadi et al., 2020",
                "confidence": 0.55,
            },
            "PBM": {
                "d": 0.82,
                "response_rate": 0.60,
                "remission_rate": 0.0,
                "n_trials": 8,
                "meta_citation": "Naeser et al., 2014; Hamblin, 2018",
                "confidence": 0.65,
            },
        },
        "obsessive_compulsive_disorder": {
            "TMS": {
                "d": 0.75,
                "response_rate": 0.45,
                "remission_rate": 0.25,
                "n_trials": 12,
                "meta_citation": "Rehn et al., 2018; Carmi et al., 2019",
                "confidence": 0.72,
            },
            "tDCS": {
                "d": 0.55,
                "response_rate": 0.35,
                "remission_rate": 0.15,
                "n_trials": 8,
                "meta_citation": "Najafi et al., 2022",
                "confidence": 0.58,
            },
        },
        "insomnia": {
            "tDCS": {
                "d": 0.42,
                "response_rate": 0.35,
                "remission_rate": 0.18,
                "n_trials": 6,
                "meta_citation": "Frase et al., 2019",
                "confidence": 0.50,
            },
            "neurofeedback": {
                "d": 0.88,
                "response_rate": 0.65,
                "remission_rate": 0.35,
                "n_trials": 12,
                "meta_citation": "Cortoos et al., 2010; Hammer et al., 2011",
                "confidence": 0.80,
            },
        },
        "schizophrenia": {
            "tDCS": {
                "d": 0.50,
                "response_rate": 0.35,
                "remission_rate": 0.10,
                "n_trials": 20,
                "meta_citation": "Khadka et al., 2019; Orlov et al., 2017",
                "confidence": 0.70,
            },
            "TMS": {
                "d": 0.58,
                "response_rate": 0.40,
                "remission_rate": 0.15,
                "n_trials": 15,
                "meta_citation": "Dougall et al., 2015; Slotema et al., 2014",
                "confidence": 0.68,
            },
        },
        "autism_spectrum_disorder": {
            "tDCS": {
                "d": 0.45,
                "response_rate": 0.38,
                "remission_rate": 0.0,
                "n_trials": 10,
                "meta_citation": "Gomez et al., 2017",
                "confidence": 0.50,
            },
            "neurofeedback": {
                "d": 0.60,
                "response_rate": 0.45,
                "remission_rate": 0.0,
                "n_trials": 8,
                "meta_citation": "Coben et al., 2010",
                "confidence": 0.52,
            },
        },
    }

    # --- Patient modifier factors --------------------------------------------
    SEVERITY_MODIFIER: Dict[str, Dict[str, float]] = {
        "mild": {"response_multiplier": 1.15, "remission_multiplier": 1.20},
        "moderate": {"response_multiplier": 1.00, "remission_multiplier": 1.00},
        "severe": {"response_multiplier": 0.80, "remission_multiplier": 0.65},
        "very_severe": {"response_multiplier": 0.60, "remission_multiplier": 0.45},
    }

    AGE_MODIFIER: Dict[str, Dict[str, float]] = {
        "pediatric": {"response_multiplier": 1.10, "remission_multiplier": 1.05},
        "adolescent": {"response_multiplier": 1.05, "remission_multiplier": 1.00},
        "adult": {"response_multiplier": 1.00, "remission_multiplier": 1.00},
        "geriatric": {"response_multiplier": 0.90, "remission_multiplier": 0.85},
        "late_geriatric": {"response_multiplier": 0.80, "remission_multiplier": 0.70},
    }

    GENETIC_MODIFIER: Dict[str, Dict[str, float]] = {
        "BDNF_val66met_met": {"response_multiplier": 1.20, "modality_preference": "tDCS"},
        "BDNF_val66met_val": {"response_multiplier": 1.00, "modality_preference": None},
        "COMT_met158": {"response_multiplier": 1.15, "modality_preference": "TMS"},
        "COMT_val158": {"response_multiplier": 0.95, "modality_preference": None},
        "5HTTLPR_ll": {"response_multiplier": 1.10, "modality_preference": None},
        "5HTTLPR_ss": {"response_multiplier": 0.90, "modality_preference": None},
    }

    def __init__(self):
        self.logger = logging.getLogger("OutcomePredictor")

    def predict(
        self,
        diagnosis: str,
        modality: str,
        patient: PatientProfile,
    ) -> PredictedResponse:
        """
        Predict response for a given diagnosis × modality × patient.

        Uses Bayesian combination of population-level meta-analytic data
        with patient-specific modifiers.
        """
        # --- Get base rates from meta-analytic database ----------------
        diag_data = self.META_ANALYTIC_DATABASE.get(diagnosis, {})
        mod_data = diag_data.get(modality, {})

        if not mod_data:
            self.logger.warning(
                f"No meta-analytic data for {diagnosis} × {modality} — using defaults"
            )
            return PredictedResponse(
                remission_probability=0.15,
                response_probability=0.30,
                confidence=0.30,
            )

        base_response = mod_data["response_rate"]
        base_remission = mod_data["remission_rate"]
        base_confidence = mod_data["confidence"]

        # --- Apply patient modifiers -----------------------------------
        response, remission, confidence = self._apply_modifiers(
            base_response, base_remission, base_confidence, patient, modality, diagnosis
        )

        # --- Estimate time to response ---------------------------------
        time_to_response = self._estimate_time_to_response(
            diagnosis, modality, patient
        )

        # --- Calculate expected improvement ----------------------------
        expected_improvement = response * 100 * 0.6  # heuristic: 60% of responders show 50%+ improvement

        return PredictedResponse(
            remission_probability=round(remission, 3),
            response_probability=round(response, 3),
            confidence=round(confidence, 3),
            time_to_response_weeks=round(time_to_response, 1),
            expected_improvement_pct=round(expected_improvement, 1),
        )

    def _apply_modifiers(
        self,
        response: float,
        remission: float,
        confidence: float,
        patient: PatientProfile,
        modality: str,
        diagnosis: str,
    ) -> Tuple[float, float, float]:
        """Apply all patient-specific modifiers to base rates."""
        r, rem, conf = response, remission, confidence

        # Severity modifier
        severity = self._classify_severity(patient.severity_score)
        sev_mod = self.SEVERITY_MODIFIER.get(severity, {})
        r *= sev_mod.get("response_multiplier", 1.0)
        rem *= sev_mod.get("remission_multiplier", 1.0)

        # Age modifier
        age_mod = self.AGE_MODIFIER.get(patient.age_group, {})
        r *= age_mod.get("response_multiplier", 1.0)
        rem *= age_mod.get("remission_multiplier", 1.0)

        # Genetic modifiers
        for variant, effect in self.GENETIC_MODIFIER.items():
            if variant.replace("_", "") in str(patient.genetic_variants).replace("_", "").lower():
                r *= effect.get("response_multiplier", 1.0)
                if effect.get("modality_preference") == modality:
                    conf = min(1.0, conf * 1.15)

        # Treatment resistance modifier
        if diagnosis in ("treatment_resistant_depression",):
            r *= 0.85
            rem *= 0.75
            conf *= 0.90

        # Prior neuromodulation non-response
        prior_nm = patient.prior_neuromodulation
        if prior_nm and all(p.get("response") == "none" for p in prior_nm):
            r *= 0.70
            rem *= 0.60
            conf *= 0.85

        # Clamp to valid probability range
        r = max(0.05, min(0.95, r))
        rem = max(0.02, min(0.90, rem))
        conf = max(0.20, min(0.95, conf))

        return r, rem, conf

    @staticmethod
    def _classify_severity(score: Optional[float]) -> str:
        if score is None:
            return "moderate"
        if score < 4:
            return "mild"
        elif score < 6:
            return "moderate"
        elif score < 8:
            return "severe"
        return "very_severe"

    @staticmethod
    def _estimate_time_to_response(
        diagnosis: str, modality: str, patient: PatientProfile
    ) -> float:
        """Estimate weeks to first meaningful response."""
        base_times = {
            "tDCS": 2.5,
            "TMS": 3.0,
            "PBM": 4.0,
            "neurofeedback": 6.0,
        }
        base = base_times.get(modality, 4.0)

        # Geriatric patients may respond slower
        if patient.age_group in ("geriatric", "late_geriatric"):
            base *= 1.3

        # Prior non-responders may take longer
        prior_nm = patient.prior_neuromodulation
        if prior_nm and all(p.get("response") == "none" for p in prior_nm):
            base *= 1.4

        return base

    def get_evidence_summary(
        self, diagnosis: str, modality: str
    ) -> EvidenceBase:
        """Retrieve evidence summary for a diagnosis × modality."""
        diag_data = self.META_ANALYTIC_DATABASE.get(diagnosis, {})
        mod_data = diag_data.get(modality, {})

        if not mod_data:
            return EvidenceBase(
                n_trials=0,
                evidence_grade=EvidenceGrade.INSUFFICIENT,
            )

        # Determine evidence grade
        n_trials = mod_data.get("n_trials", 0)
        if n_trials >= 20:
            grade = EvidenceGrade.A_SYSTEMATIC_REVIEW
        elif n_trials >= 10:
            grade = EvidenceGrade.B_RANDOMIZED_TRIAL
        elif n_trials >= 3:
            grade = EvidenceGrade.COHORT_STUDY
        elif n_trials >= 1:
            grade = EvidenceGrade.C_CASE_CONTROL
        else:
            grade = EvidenceGrade.D_EXPERT

        return EvidenceBase(
            n_trials=n_trials,
            effect_size_d=mod_data.get("d"),
            meta_analysis_citation=mod_data.get("meta_citation", ""),
            source_adapters=["pubmed_meta_analysis", "clinicaltrials", "cochrane"],
            evidence_grade=grade,
            confidence=mod_data.get("confidence"),
        )


# =============================================================================
# PROTOCOL BUILDERS — Modality-Specific
# =============================================================================


class BaseProtocolBuilder:
    """Abstract base for all modality-specific protocol builders."""

    MODALITY: ModalityType = ModalityType.TDCS  # override in subclass

    # Cost estimates per session (USD)
    COST_PER_SESSION: Dict[str, float] = {
        "tDCS": 75.0,
        "TMS": 300.0,
        "PBM": 125.0,
        "neurofeedback": 150.0,
    }

    def __init__(
        self,
        safety_checker: SafetyChecker,
        outcome_predictor: OutcomePredictor,
    ):
        self.safety = safety_checker
        self.predictor = outcome_predictor
        self.logger = logging.getLogger(self.__class__.__name__)

    async def build(
        self,
        patient: PatientProfile,
        diagnosis: str,
        constraints: Optional[GenerationConstraints] = None,
    ) -> Optional[TreatmentProtocol]:
        """
        Build a protocol for the given patient × diagnosis.

        Returns None if the modality is contraindicated or no protocol
        can be generated.
        """
        raise NotImplementedError

    def _apply_age_adjustments(
        self, params: Dict[str, Any], patient: PatientProfile
    ) -> Dict[str, Any]:
        """Adjust parameters based on patient age group."""
        adjustments: Dict[str, Any] = {}
        age_group = patient.age_group

        if age_group == "pediatric":
            adjustments["note"] = "Pediatric protocol — reduced intensity"
            adjustments["intensity_modifier"] = 0.5
            adjustments["max_duration_min"] = 15
        elif age_group == "adolescent":
            adjustments["note"] = "Adolescent protocol — moderate intensity"
            adjustments["intensity_modifier"] = 0.75
            adjustments["max_duration_min"] = 20
        elif age_group == "geriatric":
            adjustments["note"] = "Geriatric protocol — conservative parameters"
            adjustments["intensity_modifier"] = 0.85
        elif age_group == "late_geriatric":
            adjustments["note"] = "Late geriatric — very conservative"
            adjustments["intensity_modifier"] = 0.75
            adjustments["max_duration_min"] = 15
        else:
            adjustments["note"] = "Standard adult protocol"
            adjustments["intensity_modifier"] = 1.0

        return adjustments

    def _estimate_cost(
        self, modality: str, sessions: int, parameters: Dict[str, Any]
    ) -> float:
        """Estimate total treatment cost in USD."""
        cost_per = self.COST_PER_SESSION.get(modality, 100.0)

        # Adjust for complexity
        complexity_multiplier = 1.0
        if parameters.get("neuronavigation"):
            complexity_multiplier += 0.5
        if parameters.get("assessment_qeeg"):
            complexity_multiplier += 0.3
        if parameters.get("sham_probability"):
            complexity_multiplier += 0.2  # double-blind setup

        return round(cost_per * sessions * complexity_multiplier, 2)

    def _calculate_total_weeks(self, sessions: int, frequency: str) -> float:
        """Calculate total treatment duration in weeks."""
        freq_map = {
            "daily": 7,
            "daily_x5_weeks": 5,
            "3x_weekly": 3,
            "2x_weekly": 2,
            "weekly": 1,
            "twice_daily": 14,
            "alternate_day": 3.5,
        }
        sessions_per_week = freq_map.get(frequency, 3)
        return round(sessions / sessions_per_week, 1)


class TDCSProtocolBuilder(BaseProtocolBuilder):
    """Protocol builder for Transcranial Direct Current Stimulation (tDCS)."""

    MODALITY = ModalityType.TDCS

    # Canonical montages per diagnosis (10-20 system)
    TARGET_MONTAGES: Dict[str, Dict[str, Any]] = {
        "major_depressive_disorder": {
            "name": "tDCS F3-F4 Bilateral DLPFC",
            "anode": "F3",
            "cathode": "F4",
            "current_ma": 2.0,
            "duration_min": 20,
            "electrode_size_cm2": 25,
            "polarity": "anodal_left",
            "frequency": "daily_x5_weeks",
            "sessions": 15,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "treatment_resistant_depression": {
            "name": "tDCS F3-F4 + F4-F3 (bifrontal)",
            "anode": "F3",
            "cathode": "F4",
            "current_ma": 2.0,
            "duration_min": 30,
            "electrode_size_cm2": 25,
            "polarity": "anodal_left",
            "frequency": "daily_x5_weeks",
            "sessions": 20,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "generalized_anxiety_disorder": {
            "name": "tDCS F3-FPz (left DLPFC-cathodal)",
            "anode": "F3",
            "cathode": "FPz",
            "current_ma": 2.0,
            "duration_min": 20,
            "electrode_size_cm2": 25,
            "polarity": "anodal",
            "frequency": "daily_x5_weeks",
            "sessions": 12,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "post_traumatic_stress_disorder": {
            "name": "tDCS F3-FPz (trauma-focused)",
            "anode": "F3",
            "cathode": "FPz",
            "current_ma": 2.0,
            "duration_min": 20,
            "electrode_size_cm2": 35,
            "polarity": "anodal_left",
            "frequency": "daily_x5_weeks",
            "sessions": 15,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "attention_deficit_hyperactivity_disorder": {
            "name": "tDCS F3-F4 (bifrontal DLPFC)",
            "anode": "F3",
            "cathode": "F4",
            "current_ma": 1.0,
            "duration_min": 15,
            "electrode_size_cm2": 25,
            "polarity": "anodal_left",
            "frequency": "daily_x5_weeks",
            "sessions": 10,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "fibromyalgia": {
            "name": "tDCS M1-Oz (motor cortex-cathodal)",
            "anode": "M1",
            "cathode": "Oz",
            "current_ma": 2.0,
            "duration_min": 20,
            "electrode_size_cm2": 35,
            "polarity": "anodal",
            "frequency": "daily_x5_weeks",
            "sessions": 10,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "chronic_pain": {
            "name": "tDCS M1-contralateral supraorbital",
            "anode": "M1",
            "cathode": "Fp2",
            "current_ma": 2.0,
            "duration_min": 20,
            "electrode_size_cm2": 35,
            "polarity": "anodal",
            "frequency": "daily_x5_weeks",
            "sessions": 10,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "alzheimers_disease": {
            "name": "tDCS TP7-TP8 (temporal-parietal)",
            "anode": "TP7",
            "cathode": "TP8",
            "current_ma": 1.5,
            "duration_min": 20,
            "electrode_size_cm2": 25,
            "polarity": "bilateral_anodal",
            "frequency": "daily_x5_weeks",
            "sessions": 15,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "stroke_rehabilitation": {
            "name": "tDCS M1-CP6 (ipsilesional anodal)",
            "anode": "M1",
            "cathode": "CP6",
            "current_ma": 1.0,
            "duration_min": 20,
            "electrode_size_cm2": 25,
            "polarity": "anodal_ipsilesional",
            "frequency": "daily_x5_weeks",
            "sessions": 10,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "schizophrenia": {
            "name": "tDCS F3-F4 (left anodal for negative symptoms)",
            "anode": "F3",
            "cathode": "F4",
            "current_ma": 2.0,
            "duration_min": 20,
            "electrode_size_cm2": 25,
            "polarity": "anodal_left",
            "frequency": "daily_x5_weeks",
            "sessions": 15,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "insomnia": {
            "name": "tDCS F3-Oz (frontal-cathodal)",
            "anode": "F3",
            "cathode": "Oz",
            "current_ma": 2.0,
            "duration_min": 20,
            "electrode_size_cm2": 25,
            "polarity": "anodal_frontal",
            "frequency": "daily_x5_weeks",
            "sessions": 10,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
        "obsessive_compulsive_disorder": {
            "name": "tDCS F3-F4 (supplementary motor area)",
            "anode": "F3",
            "cathode": "F4",
            "current_ma": 2.0,
            "duration_min": 20,
            "electrode_size_cm2": 25,
            "polarity": "anodal_left",
            "frequency": "daily_x5_weeks",
            "sessions": 15,
            "ramp_up_s": 30,
            "ramp_down_s": 30,
        },
    }

    async def build(
        self,
        patient: PatientProfile,
        diagnosis: str,
        constraints: Optional[GenerationConstraints] = None,
    ) -> Optional[TreatmentProtocol]:
        """Build a tDCS protocol for the given patient and diagnosis."""
        self.logger.info(f"Building tDCS protocol for {diagnosis}, patient {patient.age_group}")

        # --- Get base montage -----------------------------------------
        base = self.TARGET_MONTAGES.get(diagnosis)
        if not base:
            self.logger.warning(f"No canonical tDCS montage for {diagnosis}")
            base = self.TARGET_MONTAGES["major_depressive_disorder"]

        # --- Age adjustments ------------------------------------------
        age_adj = self._apply_age_adjustments({}, patient)
        intensity_mod = age_adj.get("intensity_modifier", 1.0)
        max_duration = age_adj.get("max_duration_min", 30)

        current_ma = round(base["current_ma"] * intensity_mod, 1)
        duration_min = min(base["duration_min"], max_duration)
        sessions = base["sessions"]

        # Apply constraint overrides
        if constraints:
            if constraints.max_sessions:
                sessions = min(sessions, constraints.max_sessions)
            if constraints.max_time_per_session_min:
                duration_min = min(duration_min, constraints.max_time_per_session_min)

        # --- Build parameters dict ------------------------------------
        params = TDCSParameters(
            anode=base["anode"],
            cathode=base["cathode"],
            electrode_size_cm2=base["electrode_size_cm2"],
            current_ma=current_ma,
            duration_min=duration_min,
            sessions=sessions,
            frequency=base["frequency"],
            ramp_up_s=base["ramp_up_s"],
            ramp_down_s=base["ramp_down_s"],
            polarity=base["polarity"],
            electrode_type="sponge",
        )

        # --- Safety check ---------------------------------------------
        safety_profile, contras = self.safety.check_patient(
            ModalityType.TDCS, patient
        )

        if safety_profile.safety_level == SafetyLevel.CONTRAINDICATED:
            self.logger.warning("tDCS contraindicated for this patient")
            return None

        # --- Outcome prediction ---------------------------------------
        prediction = self.predictor.predict(diagnosis, "tDCS", patient)
        evidence = self.predictor.get_evidence_summary(diagnosis, "tDCS")

        # --- Cost & time estimates ------------------------------------
        cost = self._estimate_cost("tDCS", sessions, params.to_dict())
        weeks = self._calculate_total_weeks(sessions, base["frequency"])

        # --- Build protocol object ------------------------------------
        protocol = TreatmentProtocol(
            modality="TDCS",
            name=base["name"],
            protocol_id=f"TDCS-{diagnosis[:10].upper()}-{uuid.uuid4().hex[:6]}",
            parameters=params.to_dict(),
            evidence_base=evidence,
            predicted_response=prediction,
            safety=safety_profile,
            contraindications=contras,
            confidence_overall=round(evidence.confidence or 0.5, 3),
            estimated_cost_usd=cost,
            total_time_weeks=weeks,
            age_adjustments=age_adj,
        )

        return protocol


class TMSProtocolBuilder(BaseProtocolBuilder):
    """Protocol builder for Transcranial Magnetic Stimulation (TMS)."""

    MODALITY = ModalityType.TMS

    TARGET_PROTOCOLS: Dict[str, Dict[str, Any]] = {
        "major_depressive_disorder": {
            "name": "rTMS Left DLPFC 10 Hz (FDA-cleared)",
            "target_region": "DLPFC_L",
            "coil_type": "figure-8",
            "stimulation_pattern": "rTMS",
            "frequency_hz": 10.0,
            "intensity_pct_mso": 120.0,
            "pulses_per_session": 3000,
            "train_duration_s": 4.0,
            "inter_train_interval_s": 26.0,
            "total_trains": 37,
            "duration_min": 37,
            "sessions": 30,
            "frequency": "daily_x5_weeks",
            "neuronavigation": False,
            "resting_motor_threshold": None,
        },
        "treatment_resistant_depression": {
            "name": "rTMS/iTBS Left DLPFC (accelerated)",
            "target_region": "DLPFC_L",
            "coil_type": "figure-8",
            "stimulation_pattern": "iTBS",
            "frequency_hz": 50.0,
            "intensity_pct_mso": 120.0,
            "pulses_per_session": 1800,
            "train_duration_s": 2.0,
            "inter_train_interval_s": 8.0,
            "total_trains": 600,
            "duration_min": 9,
            "sessions": 20,
            "frequency": "daily_x5_weeks",
            "neuronavigation": True,
            "resting_motor_threshold": None,
        },
        "obsessive_compulsive_disorder": {
            "name": "dTMS H7 Coil (SMA targeting)",
            "target_region": "SMA",
            "coil_type": "H7",
            "stimulation_pattern": "rTMS",
            "frequency_hz": 1.0,
            "intensity_pct_mso": 120.0,
            "pulses_per_session": 1800,
            "train_duration_s": 20.0,
            "inter_train_interval_s": 30.0,
            "total_trains": 60,
            "duration_min": 50,
            "sessions": 30,
            "frequency": "daily_x5_weeks",
            "neuronavigation": True,
            "resting_motor_threshold": None,
        },
        "fibromyalgia": {
            "name": "rTMS M1 10 Hz (bilateral)",
            "target_region": "M1_L",
            "coil_type": "figure-8",
            "stimulation_pattern": "rTMS",
            "frequency_hz": 10.0,
            "intensity_pct_mso": 90.0,
            "pulses_per_session": 1500,
            "train_duration_s": 5.0,
            "inter_train_interval_s": 25.0,
            "total_trains": 25,
            "duration_min": 20,
            "sessions": 10,
            "frequency": "3x_weekly",
            "neuronavigation": False,
            "resting_motor_threshold": None,
        },
        "chronic_pain": {
            "name": "rTMS M1 10 Hz (left motor cortex)",
            "target_region": "M1_L",
            "coil_type": "figure-8",
            "stimulation_pattern": "rTMS",
            "frequency_hz": 10.0,
            "intensity_pct_mso": 90.0,
            "pulses_per_session": 2000,
            "train_duration_s": 5.0,
            "inter_train_interval_s": 25.0,
            "total_trains": 30,
            "duration_min": 25,
            "sessions": 10,
            "frequency": "daily_x5_weeks",
            "neuronavigation": False,
            "resting_motor_threshold": None,
        },
        "migraine": {
            "name": "sTMS single-pulse (occipital cortex)",
            "target_region": "OCCIPITAL",
            "coil_type": "sTMS",
            "stimulation_pattern": "single_pulse",
            "frequency_hz": 1.0,
            "intensity_pct_mso": 100.0,
            "pulses_per_session": 12,
            "train_duration_s": 1.0,
            "inter_train_interval_s": 60.0,
            "total_trains": 12,
            "duration_min": 15,
            "sessions": 1,  # acute treatment
            "frequency": "prn",
            "neuronavigation": False,
            "resting_motor_threshold": None,
        },
        "stroke_rehabilitation": {
            "name": "rTMS contralesional M1 (inhibitory 1 Hz)",
            "target_region": "M1_contralesional",
            "coil_type": "figure-8",
            "stimulation_pattern": "rTMS",
            "frequency_hz": 1.0,
            "intensity_pct_mso": 90.0,
            "pulses_per_session": 1200,
            "train_duration_s": 15.0,
            "inter_train_interval_s": 10.0,
            "total_trains": 60,
            "duration_min": 25,
            "sessions": 10,
            "frequency": "daily_x5_weeks",
            "neuronavigation": False,
            "resting_motor_threshold": None,
        },
        "schizophrenia": {
            "name": "rTMS left DLPFC (negative symptoms)",
            "target_region": "DLPFC_L",
            "coil_type": "figure-8",
            "stimulation_pattern": "rTMS",
            "frequency_hz": 10.0,
            "intensity_pct_mso": 110.0,
            "pulses_per_session": 2000,
            "train_duration_s": 5.0,
            "inter_train_interval_s": 30.0,
            "total_trains": 30,
            "duration_min": 30,
            "sessions": 15,
            "frequency": "daily_x5_weeks",
            "neuronavigation": False,
            "resting_motor_threshold": None,
        },
        "alzheimers_disease": {
            "name": "rTMS precuneus/DMN 20 Hz",
            "target_region": "PRECUNEUS",
            "coil_type": "H1",
            "stimulation_pattern": "rTMS",
            "frequency_hz": 20.0,
            "intensity_pct_mso": 100.0,
            "pulses_per_session": 2000,
            "train_duration_s": 2.0,
            "inter_train_interval_s": 28.0,
            "total_trains": 40,
            "duration_min": 25,
            "sessions": 20,
            "frequency": "daily_x5_weeks",
            "neuronavigation": True,
            "resting_motor_threshold": None,
        },
    }

    async def build(
        self,
        patient: PatientProfile,
        diagnosis: str,
        constraints: Optional[GenerationConstraints] = None,
    ) -> Optional[TreatmentProtocol]:
        """Build a TMS protocol for the given patient and diagnosis."""
        self.logger.info(f"Building TMS protocol for {diagnosis}")

        base = self.TARGET_PROTOCOLS.get(diagnosis)
        if not base:
            self.logger.warning(f"No canonical TMS protocol for {diagnosis}")
            return None

        # --- Age adjustments ------------------------------------------
        age_adj = self._apply_age_adjustments({}, patient)
        intensity_mod = age_adj.get("intensity_modifier", 1.0)
        max_duration = age_adj.get("max_duration_min", 60)

        intensity = round(base["intensity_pct_mso"] * intensity_mod, 0)
        duration = min(base["duration_min"], max_duration)
        sessions = base["sessions"]

        if constraints:
            if constraints.max_sessions:
                sessions = min(sessions, constraints.max_sessions)
            if constraints.max_time_per_session_min:
                duration = min(duration, constraints.max_time_per_session_min)

        # --- Build parameters -----------------------------------------
        params = TMSParameters(
            coil_type=base["coil_type"],
            target_region=base["target_region"],
            stimulation_pattern=base["stimulation_pattern"],
            frequency_hz=base["frequency_hz"],
            intensity_pct_mso=intensity,
            pulses_per_session=base["pulses_per_session"],
            train_duration_s=base["train_duration_s"],
            inter_train_interval_s=base["inter_train_interval_s"],
            total_trains=base["total_trains"],
            duration_min=duration,
            sessions=sessions,
            frequency=base["frequency"],
            neuronavigation=base["neuronavigation"],
            resting_motor_threshold=None,
        )

        # --- Safety check ---------------------------------------------
        safety_profile, contras = self.safety.check_patient(
            ModalityType.TMS, patient
        )
        if safety_profile.safety_level == SafetyLevel.CONTRAINDICATED:
            self.logger.warning("TMS contraindicated for this patient")
            return None

        # --- Outcome prediction ---------------------------------------
        prediction = self.predictor.predict(diagnosis, "TMS", patient)
        evidence = self.predictor.get_evidence_summary(diagnosis, "TMS")

        cost = self._estimate_cost("TMS", sessions, params.to_dict())
        weeks = self._calculate_total_weeks(sessions, base["frequency"])

        protocol = TreatmentProtocol(
            modality="TMS",
            name=base["name"],
            protocol_id=f"TMS-{diagnosis[:10].upper()}-{uuid.uuid4().hex[:6]}",
            parameters=params.to_dict(),
            evidence_base=evidence,
            predicted_response=prediction,
            safety=safety_profile,
            contraindications=contras,
            confidence_overall=round(evidence.confidence or 0.5, 3),
            estimated_cost_usd=cost,
            total_time_weeks=weeks,
            age_adjustments=age_adj,
        )

        return protocol


class PBMProtocolBuilder(BaseProtocolBuilder):
    """Protocol builder for Photobiomodulation / Low-Level Light Therapy."""

    MODALITY = ModalityType.PBM

    TARGET_PROTOCOLS: Dict[str, Dict[str, Any]] = {
        "major_depressive_disorder": {
            "name": "PBM 810 nm Transcranial (left prefrontal)",
            "wavelength_nm": 810,
            "power_mw": 250.0,
            "fluence_j_cm2": 60.0,
            "device_type": "helmet",
            "led_or_laser": "LED",
            "target_regions": ["left_prefrontal", "right_prefrontal"],
            "pulsing_frequency_hz": 10.0,
            "duty_cycle_pct": 50.0,
            "duration_min": 20,
            "sessions": 15,
            "frequency": "3x_weekly",
        },
        "treatment_resistant_depression": {
            "name": "PBM 810 nm + 1064 nm Dual Wavelength",
            "wavelength_nm": 810,
            "power_mw": 300.0,
            "fluence_j_cm2": 80.0,
            "device_type": "helmet",
            "led_or_laser": "LED",
            "target_regions": ["bilateral_prefrontal", "default_mode_network"],
            "pulsing_frequency_hz": 10.0,
            "duty_cycle_pct": 50.0,
            "duration_min": 25,
            "sessions": 20,
            "frequency": "3x_weekly",
        },
        "alzheimers_disease": {
            "name": "PBM 1064 nm Default Mode Network",
            "wavelength_nm": 1064,
            "power_mw": 300.0,
            "fluence_j_cm2": 100.0,
            "device_type": "helmet",
            "led_or_laser": "LED",
            "target_regions": ["bilateral_prefrontal", "bilateral_parietal"],
            "pulsing_frequency_hz": 10.0,
            "duty_cycle_pct": 50.0,
            "duration_min": 25,
            "sessions": 24,
            "frequency": "3x_weekly",
        },
        "mild_cognitive_impairment": {
            "name": "PBM 810 nm Bilateral Prefrontal",
            "wavelength_nm": 810,
            "power_mw": 200.0,
            "fluence_j_cm2": 50.0,
            "device_type": "helmet",
            "led_or_laser": "LED",
            "target_regions": ["bilateral_prefrontal"],
            "pulsing_frequency_hz": None,
            "duty_cycle_pct": 100.0,
            "duration_min": 20,
            "sessions": 18,
            "frequency": "3x_weekly",
        },
        "fibromyalgia": {
            "name": "PBM 810 nm + 850 nm Combined (head + body)",
            "wavelength_nm": 810,
            "power_mw": 300.0,
            "fluence_j_cm2": 60.0,
            "device_type": "multi_array",
            "led_or_laser": "LED",
            "target_regions": ["bilateral_prefrontal", "cervical", "trapezius"],
            "pulsing_frequency_hz": 10.0,
            "duty_cycle_pct": 50.0,
            "duration_min": 25,
            "sessions": 15,
            "frequency": "3x_weekly",
        },
        "chronic_pain": {
            "name": "PBM 810 nm Targeted Pain Sites",
            "wavelength_nm": 810,
            "power_mw": 250.0,
            "fluence_j_cm2": 60.0,
            "device_type": "handheld_cluster",
            "led_or_laser": "LED",
            "target_regions": ["pain_site", "spinal_dorsal_horn"],
            "pulsing_frequency_hz": 10.0,
            "duty_cycle_pct": 50.0,
            "duration_min": 20,
            "sessions": 12,
            "frequency": "3x_weekly",
        },
        "traumatic_brain_injury": {
            "name": "PBM 810 nm + 1064 nm Multi-Region",
            "wavelength_nm": 810,
            "power_mw": 300.0,
            "fluence_j_cm2": 80.0,
            "device_type": "helmet",
            "led_or_laser": "LED",
            "target_regions": ["bilateral_prefrontal", "bilateral_parietal", "bilateral_temporal"],
            "pulsing_frequency_hz": 10.0,
            "duty_cycle_pct": 50.0,
            "duration_min": 30,
            "sessions": 20,
            "frequency": "3x_weekly",
        },
    }

    async def build(
        self,
        patient: PatientProfile,
        diagnosis: str,
        constraints: Optional[GenerationConstraints] = None,
    ) -> Optional[TreatmentProtocol]:
        """Build a PBM protocol for the given patient and diagnosis."""
        self.logger.info(f"Building PBM protocol for {diagnosis}")

        base = self.TARGET_PROTOCOLS.get(diagnosis)
        if not base:
            self.logger.warning(f"No canonical PBM protocol for {diagnosis}")
            return None

        # --- Age adjustments ------------------------------------------
        age_adj = self._apply_age_adjustments({}, patient)
        intensity_mod = age_adj.get("intensity_modifier", 1.0)
        max_duration = age_adj.get("max_duration_min", 30)

        power_mw = round(base["power_mw"] * intensity_mod, 0)
        fluence = round(base["fluence_j_cm2"] * intensity_mod, 0)
        duration = min(base["duration_min"], max_duration)
        sessions = base["sessions"]

        if constraints:
            if constraints.max_sessions:
                sessions = min(sessions, constraints.max_sessions)
            if constraints.max_time_per_session_min:
                duration = min(duration, constraints.max_time_per_session_min)

        # --- Build parameters -----------------------------------------
        params = PBMParameters(
            wavelength_nm=base["wavelength_nm"],
            power_mw=power_mw,
            fluence_j_cm2=fluence,
            device_type=base["device_type"],
            led_or_laser=base["led_or_laser"],
            target_regions=base["target_regions"],
            pulsing_frequency_hz=base["pulsing_frequency_hz"],
            duty_cycle_pct=base["duty_cycle_pct"],
            duration_min=duration,
            sessions=sessions,
            frequency=base["frequency"],
            irradiance_mw_cm2=power_mw / 25,  # approximate
        )

        # --- Safety check ---------------------------------------------
        safety_profile, contras = self.safety.check_patient(
            ModalityType.PBM, patient
        )
        if safety_profile.safety_level == SafetyLevel.CONTRAINDICATED:
            self.logger.warning("PBM contraindicated for this patient")
            return None

        # --- Outcome prediction ---------------------------------------
        prediction = self.predictor.predict(diagnosis, "PBM", patient)
        evidence = self.predictor.get_evidence_summary(diagnosis, "PBM")

        cost = self._estimate_cost("PBM", sessions, params.to_dict())
        weeks = self._calculate_total_weeks(sessions, base["frequency"])

        protocol = TreatmentProtocol(
            modality="PBM",
            name=base["name"],
            protocol_id=f"PBM-{diagnosis[:10].upper()}-{uuid.uuid4().hex[:6]}",
            parameters=params.to_dict(),
            evidence_base=evidence,
            predicted_response=prediction,
            safety=safety_profile,
            contraindications=contras,
            confidence_overall=round(evidence.confidence or 0.5, 3),
            estimated_cost_usd=cost,
            total_time_weeks=weeks,
            age_adjustments=age_adj,
        )

        return protocol


class NeurofeedbackProtocolBuilder(BaseProtocolBuilder):
    """Protocol builder for EEG Neurofeedback."""

    MODALITY = ModalityType.NEUROFEEDBACK

    TARGET_PROTOCOLS: Dict[str, Dict[str, Any]] = {
        "attention_deficit_hyperactivity_disorder": {
            "name": "SMR + Theta/Beta NF (standard ADHD)",
            "protocol_type": "SMR",
            "feedback_channel": "Cz",
            "target_frequency_hz": (12, 15),
            "inhibit_frequency_hz": (4, 7),
            "threshold_method": "adaptive",
            "sessions_per_week": 2,
            "total_sessions": 40,
            "session_duration_min": 30,
            "artifact_rejection": True,
            "frequency": "2x_weekly",
            "reward_band_hz": (12, 15),
            "inhibit_bands_hz": [(4, 7), (22, 36)],
            "hardware": "19_channel_egi",
            "software": "neuroguide",
            "assessment_qeeg": True,
        },
        "major_depressive_disorder": {
            "name": "Alpha-Theta NF (depression/anxiety)",
            "protocol_type": "alpha_theta",
            "feedback_channel": "Pz",
            "target_frequency_hz": (8, 12),
            "inhibit_frequency_hz": None,
            "threshold_method": "adaptive",
            "sessions_per_week": 2,
            "total_sessions": 30,
            "session_duration_min": 30,
            "artifact_rejection": True,
            "frequency": "2x_weekly",
            "reward_band_hz": (8, 12),
            "inhibit_bands_hz": [(13, 20)],
            "hardware": "19_channel_egi",
            "software": "neuroguide",
            "assessment_qeeg": True,
        },
        "post_traumatic_stress_disorder": {
            "name": "Alpha-Theta NF + ILF (trauma-informed)",
            "protocol_type": "alpha_theta",
            "feedback_channel": "Pz",
            "target_frequency_hz": (8, 12),
            "inhibit_frequency_hz": None,
            "threshold_method": "adaptive",
            "sessions_per_week": 2,
            "total_sessions": 40,
            "session_duration_min": 35,
            "artifact_rejection": True,
            "frequency": "2x_weekly",
            "reward_band_hz": (8, 12),
            "inhibit_bands_hz": [(20, 30)],
            "hardware": "19_channel_egi",
            "software": "neuroguide",
            "assessment_qeeg": True,
        },
        "generalized_anxiety_disorder": {
            "name": "Alpha Enhancement NF (anxiety reduction)",
            "protocol_type": "alpha_enhancement",
            "feedback_channel": "O1",
            "target_frequency_hz": (8, 12),
            "inhibit_frequency_hz": (13, 30),
            "threshold_method": "adaptive",
            "sessions_per_week": 2,
            "total_sessions": 25,
            "session_duration_min": 30,
            "artifact_rejection": True,
            "frequency": "2x_weekly",
            "reward_band_hz": (8, 12),
            "inhibit_bands_hz": [(13, 30)],
            "hardware": "19_channel_egi",
            "software": "neuroguide",
            "assessment_qeeg": True,
        },
        "insomnia": {
            "name": "SMR NF + Slow Wave Enhancement (sleep)",
            "protocol_type": "SMR",
            "feedback_channel": "Cz",
            "target_frequency_hz": (12, 15),
            "inhibit_frequency_hz": (2, 3),
            "threshold_method": "adaptive",
            "sessions_per_week": 2,
            "total_sessions": 20,
            "session_duration_min": 30,
            "artifact_rejection": True,
            "frequency": "2x_weekly",
            "reward_band_hz": (12, 15),
            "inhibit_bands_hz": [(2, 3), (22, 36)],
            "hardware": "19_channel_egi",
            "software": "neuroguide",
            "assessment_qeeg": True,
        },
        "autism_spectrum_disorder": {
            "name": "Mu Rhythm NF (social cognition)",
            "protocol_type": "mu_rhythm",
            "feedback_channel": "C3",
            "target_frequency_hz": (8, 13),
            "inhibit_frequency_hz": (3, 7),
            "threshold_method": "adaptive",
            "sessions_per_week": 2,
            "total_sessions": 40,
            "session_duration_min": 25,
            "artifact_rejection": True,
            "frequency": "2x_weekly",
            "reward_band_hz": (8, 13),
            "inhibit_bands_hz": [(3, 7)],
            "hardware": "19_channel_egi",
            "software": "neuroguide",
            "assessment_qeeg": True,
        },
        "mild_cognitive_impairment": {
            "name": "SMR + Gamma Enhancement (MCI/cognition)",
            "protocol_type": "SMR_gamma",
            "feedback_channel": "Cz",
            "target_frequency_hz": (12, 15),
            "inhibit_frequency_hz": (4, 7),
            "threshold_method": "adaptive",
            "sessions_per_week": 2,
            "total_sessions": 30,
            "session_duration_min": 30,
            "artifact_rejection": True,
            "frequency": "2x_weekly",
            "reward_band_hz": (12, 15),
            "inhibit_bands_hz": [(4, 7)],
            "hardware": "19_channel_egi",
            "software": "neuroguide",
            "assessment_qeeg": True,
        },
    }

    async def build(
        self,
        patient: PatientProfile,
        diagnosis: str,
        constraints: Optional[GenerationConstraints] = None,
    ) -> Optional[TreatmentProtocol]:
        """Build a neurofeedback protocol for the given patient and diagnosis."""
        self.logger.info(f"Building Neurofeedback protocol for {diagnosis}")

        base = self.TARGET_PROTOCOLS.get(diagnosis)
        if not base:
            self.logger.warning(f"No canonical NF protocol for {diagnosis}")
            return None

        # --- Age adjustments ------------------------------------------
        age_adj = self._apply_age_adjustments({}, patient)
        max_duration = age_adj.get("max_duration_min", 40)

        duration = min(base["session_duration_min"], max_duration)
        sessions = base["total_sessions"]

        if constraints:
            if constraints.max_sessions:
                sessions = min(sessions, constraints.max_sessions)
            if constraints.max_time_per_session_min:
                duration = min(duration, constraints.max_time_per_session_min)

        # --- Build parameters -----------------------------------------
        params = NeurofeedbackParameters(
            protocol_type=base["protocol_type"],
            feedback_channel=base["feedback_channel"],
            target_frequency_hz=base["target_frequency_hz"],
            inhibit_frequency_hz=base["inhibit_frequency_hz"],
            threshold_method=base["threshold_method"],
            sessions_per_week=base["sessions_per_week"],
            total_sessions=sessions,
            session_duration_min=duration,
            artifact_rejection=base["artifact_rejection"],
            frequency=base["frequency"],
            reward_band_hz=base["reward_band_hz"],
            inhibit_bands_hz=base["inhibit_bands_hz"],
            hardware=base["hardware"],
            software=base["software"],
            assessment_qeeg=base["assessment_qeeg"],
            duration_min=duration,
            sessions=sessions,
        )

        # --- Safety check ---------------------------------------------
        safety_profile, contras = self.safety.check_patient(
            ModalityType.NEUROFEEDBACK, patient
        )
        if safety_profile.safety_level == SafetyLevel.CONTRAINDICATED:
            self.logger.warning("Neurofeedback contraindicated for this patient")
            return None

        # --- Outcome prediction ---------------------------------------
        prediction = self.predictor.predict(diagnosis, "neurofeedback", patient)
        evidence = self.predictor.get_evidence_summary(diagnosis, "neurofeedback")

        cost = self._estimate_cost("neurofeedback", sessions, params.to_dict())
        weeks = self._calculate_total_weeks(sessions, base["frequency"])

        protocol = TreatmentProtocol(
            modality="NEUROFEEDBACK",
            name=base["name"],
            protocol_id=f"NF-{diagnosis[:10].upper()}-{uuid.uuid4().hex[:6]}",
            parameters=params.to_dict(),
            evidence_base=evidence,
            predicted_response=prediction,
            safety=safety_profile,
            contraindications=contras,
            confidence_overall=round(evidence.confidence or 0.5, 3),
            estimated_cost_usd=cost,
            total_time_weeks=weeks,
            age_adjustments=age_adj,
        )

        return protocol


# =============================================================================
# PROTOCOL COMPARATOR — Rank & Score
# =============================================================================


class ProtocolComparator:
    """
    Ranks generated protocols using multi-criteria scoring.

    Scoring weights (customizable):
        - predicted_response_probability: 30%
        - evidence_quality: 25%
        - safety_profile: 20%
        - cost_efficiency: 15%
        - time_efficiency: 10%
    """

    DEFAULT_WEIGHTS = {
        "predicted_response": 0.30,
        "evidence_quality": 0.25,
        "safety_profile": 0.20,
        "cost_efficiency": 0.15,
        "time_efficiency": 0.10,
    }

    def __init__(self, weights: Optional[Dict[str, float]] = None):
        self.weights = weights or self.DEFAULT_WEIGHTS
        self._validate_weights()

    def _validate_weights(self) -> None:
        total = sum(self.weights.values())
        if abs(total - 1.0) > 0.01:
            logger.warning(f"Weights sum to {total}, normalizing")
            factor = 1.0 / total
            self.weights = {k: v * factor for k, v in self.weights.items()}

    def rank(
        self,
        protocols: List[TreatmentProtocol],
        max_results: int = 5,
    ) -> List[TreatmentProtocol]:
        """
        Rank protocols by composite score.

        Returns top-N protocols with rank field populated.
        """
        if not protocols:
            return []

        scored = []
        for protocol in protocols:
            score = self._compute_score(protocol)
            scored.append((score, protocol))

        # Sort by score descending
        scored.sort(key=lambda x: x[0], reverse=True)

        # Assign ranks and return top N
        result = []
        for rank, (score, protocol) in enumerate(scored[:max_results], 1):
            protocol.rank = rank
            protocol.confidence_overall = round(score, 3)
            result.append(protocol)

        return result

    def _compute_score(self, protocol: TreatmentProtocol) -> float:
        """Compute composite score for a protocol."""
        w = self.weights

        # Predicted response component (0-1)
        pred = protocol.predicted_response
        response_score = pred.response_probability * pred.confidence

        # Evidence quality component (0-1)
        evidence = protocol.evidence_base
        grade_scores = {
            EvidenceGrade.A_SYSTEMATIC_REVIEW: 1.0,
            EvidenceGrade.B_RANDOMIZED_TRIAL: 0.85,
            EvidenceGrade.COHORT_STUDY: 0.70,
            EvidenceGrade.C_CASE_CONTROL: 0.55,
            EvidenceGrade.D_EXPERT: 0.40,
            EvidenceGrade.INSUFFICIENT: 0.20,
        }
        evidence_score = grade_scores.get(evidence.evidence_grade, 0.5)
        if evidence.effect_size_d:
            evidence_score = min(1.0, evidence_score + (evidence.effect_size_d * 0.1))

        # Safety profile component (0-1)
        safety_scores = {
            SafetyLevel.SAFE: 1.0,
            SafetyLevel.CAUTION: 0.75,
            SafetyLevel.CONTRAINDICATED: 0.0,
            SafetyLevel.UNKNOWN: 0.5,
        }
        safety_score = safety_scores.get(protocol.safety.safety_level, 0.5)

        # Cost efficiency (inverse, normalized) — lower cost = higher score
        # Benchmark: $5000 for full course
        cost_score = max(0, 1.0 - (protocol.estimated_cost_usd / 5000))

        # Time efficiency (inverse, normalized) — shorter = higher score
        # Benchmark: 12 weeks
        time_score = max(0, 1.0 - (protocol.total_time_weeks / 12))

        composite = (
            w["predicted_response"] * response_score
            + w["evidence_quality"] * evidence_score
            + w["safety_profile"] * safety_score
            + w["cost_efficiency"] * cost_score
            + w["time_efficiency"] * time_score
        )

        return round(min(1.0, max(0.0, composite)), 3)


# =============================================================================
# REPORT GENERATOR — JSON / Dict Output
# =============================================================================


class ReportGenerator:
    """
    Generates structured clinical reports from generation results.

    Supports JSON and dictionary output formats.
    PDF generation is stubbed for integration with a PDF library.
    """

    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = Path(output_dir) if output_dir else Path(".")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate(
        self,
        result: GenerationResult,
        format_type: str = "json",
    ) -> str:
        """
        Generate report in specified format.

        Args:
            result: The generation result to report on
            format_type: "json", "dict", or "pdf" (stubbed)

        Returns:
            File path of generated report (for json/pdf) or str representation
        """
        if format_type == "json":
            return self._generate_json(result)
        elif format_type == "dict":
            return self._generate_dict(result)
        elif format_type == "pdf":
            return self._generate_pdf_stub(result)
        else:
            raise ValueError(f"Unsupported format: {format_type}")

    def _generate_json(self, result: GenerationResult) -> str:
        """Generate JSON report file."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"protocol_report_{result.patient_id}_{timestamp}.json"
        filepath = self.output_dir / filename

        json_str = result.to_json(indent=2)
        filepath.write_text(json_str)

        logger.info(f"JSON report saved to {filepath}")
        return str(filepath)

    def _generate_dict(self, result: GenerationResult) -> Dict[str, Any]:
        """Generate dictionary report (for API responses)."""
        return result.to_dict()

    def _generate_pdf_stub(self, result: GenerationResult) -> str:
        """Stub for PDF generation — returns JSON path with note."""
        json_path = self._generate_json(result)
        logger.info(f"PDF generation stubbed — JSON report at {json_path}")
        return json_path


# =============================================================================
# MAIN ORCHESTRATOR — Protocol Generator
# =============================================================================


class ProtocolGenerator:
    """
    Core orchestrator for neuromodulation protocol generation.

    Coordinates modality builders, safety checks, outcome prediction,
    protocol ranking, and report generation.

    Example:
        generator = ProtocolGenerator()
        result = await generator.generate_protocols(
            patient_id="PT-001",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS", "PBM", "neurofeedback"],
            patient_profile={"age_years": 45, "sex": "female", ...},
            constraints={"max_sessions": 20, "max_budget_usd": 5000},
        )
    """

    def __init__(
        self,
        safety_checker: Optional[SafetyChecker] = None,
        outcome_predictor: Optional[OutcomePredictor] = None,
        comparator: Optional[ProtocolComparator] = None,
        report_generator: Optional[ReportGenerator] = None,
    ):
        self.safety = safety_checker or SafetyChecker()
        self.predictor = outcome_predictor or OutcomePredictor()
        self.comparator = comparator or ProtocolComparator()
        self.reporter = report_generator or ReportGenerator()

        # --- Builder registry -------------------------------------------
        self.builders: Dict[ModalityType, BaseProtocolBuilder] = {
            ModalityType.TDCS: TDCSProtocolBuilder(self.safety, self.predictor),
            ModalityType.TMS: TMSProtocolBuilder(self.safety, self.predictor),
            ModalityType.PBM: PBMProtocolBuilder(self.safety, self.predictor),
            ModalityType.NEUROFEEDBACK: NeurofeedbackProtocolBuilder(self.safety, self.predictor),
        }
        self.logger = logging.getLogger("ProtocolGenerator")

    def _parse_modalities(self, modalities: List[str]) -> List[ModalityType]:
        """Parse modality strings into ModalityType enums.
        
        Accepts case-insensitive modality names.
        """
        result = []
        modality_map = {m.value.upper(): m for m in ModalityType}
        for m in modalities:
            m_upper = m.upper()
            if m_upper in modality_map:
                result.append(modality_map[m_upper])
            else:
                logger.warning(f"Unknown modality: {m}, skipping")
        return result

    # ------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------

    async def generate_protocols(
        self,
        patient_id: str,
        diagnosis: str,
        modalities: List[str],
        patient_profile: Dict[str, Any],
        constraints: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate personalized neuromodulation protocols.

        This is the main entry point. It:
        1. Parses patient profile
        2. Pre-screens for contraindications
        3. Builds protocols in parallel for allowed modalities
        4. Ranks protocols by composite score
        5. Returns structured result with metadata

        Args:
            patient_id: Unique patient identifier
            diagnosis: Canonical diagnosis key (e.g., "major_depressive_disorder")
            modalities: List of modality names ["tDCS", "TMS", ...]
            patient_profile: Dict with age, sex, medications, etc.
            constraints: Optional limits on sessions, time, budget

        Returns:
            Structured dictionary with ranked protocols, rejected protocols,
            confidence scores, and metadata.
        """
        self.logger.info(
            f"Starting protocol generation for {patient_id}, "
            f"diagnosis={diagnosis}, modalities={modalities}"
        )

        # --- Step 1: Parse inputs ---------------------------------------
        patient = self._parse_patient_profile(patient_profile)
        cons = self._parse_constraints(constraints or {})

        # --- Step 2: Pre-screen modalities ------------------------------
        modality_types = self._parse_modalities(modalities)
        rejected = self.safety.pre_screen(modality_types, patient)
        allowed_modalities = [
            m for m in modality_types
            if m.value not in [r.modality for r in rejected]
        ]

        self.logger.info(
            f"Pre-screen: {len(allowed_modalities)} allowed, "
            f"{len(rejected)} rejected"
        )

        # --- Step 3: Build protocols in parallel ------------------------
        protocols = await self._build_all_protocols(
            allowed_modalities, patient, diagnosis, cons
        )

        # --- Step 4: Rank protocols -------------------------------------
        ranked = self.comparator.rank(protocols, max_results=5)

        # --- Step 5: Calculate overall confidence -----------------------
        overall_confidence = self._calculate_overall_confidence(ranked)

        # --- Step 6: Build result ---------------------------------------
        generated_at = datetime.utcnow().isoformat() + "Z"
        next_review = (datetime.utcnow() + timedelta(days=30)).isoformat() + "Z"

        result = GenerationResult(
            patient_id=patient_id,
            generated_at=generated_at,
            diagnosis=diagnosis,
            protocols=ranked,
            rejected_protocols=rejected,
            overall_confidence=round(overall_confidence, 3),
            next_review=next_review,
            metadata={
                "generator_version": "1.0.0",
                "schema_version": "canonical_clinical_v2.1",
                "modalities_requested": modalities,
                "modalities_allowed": [m.value for m in allowed_modalities],
                "n_protocols_generated": len(protocols),
                "n_protocols_ranked": len(ranked),
                "patient_age_group": patient.age_group,
                "evidence_sources": ["pubmed", "clinicaltrials.gov", "cochrane"],
            },
        )

        self.logger.info(
            f"Protocol generation complete: {len(ranked)} ranked, "
            f"{len(rejected)} rejected, confidence={overall_confidence:.3f}"
        )

        return result.to_dict()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_patient_profile(profile: Dict[str, Any]) -> PatientProfile:
        """Parse raw patient profile dict into typed PatientProfile."""
        sex_str = profile.get("sex", "unknown")
        sex = PatientSex(sex_str.lower()) if sex_str else PatientSex.UNKNOWN

        return PatientProfile(
            age_years=int(profile.get("age_years", 0)),
            sex=sex,
            weight_kg=profile.get("weight_kg"),
            height_cm=profile.get("height_cm"),
            medications=list(profile.get("medications", [])),
            comorbidities=list(profile.get("comorbidities", [])),
            prior_neuromodulation=list(profile.get("prior_neuromodulation", [])),
            genetic_variants=dict(profile.get("genetic_variants", {})),
            imaging_available=list(profile.get("imaging_available", [])),
            qeeg_available=bool(profile.get("qeeg_available", False)),
            qeeg_patterns=dict(profile.get("qeeg_patterns", {})),
            mri_findings=dict(profile.get("mri_findings", {})),
            pet_findings=dict(profile.get("pet_findings", {})),
            severity_score=profile.get("severity_score"),
            treatment_history=list(profile.get("treatment_history", [])),
            implant_devices=list(profile.get("implant_devices", [])),
            pregnancy_status=bool(profile.get("pregnancy_status", False)),
            skin_conditions=list(profile.get("skin_conditions", [])),
            seizure_history=bool(profile.get("seizure_history", False)),
        )

    @staticmethod
    def _parse_constraints(constraints: Dict[str, Any]) -> GenerationConstraints:
        """Parse constraints dict into typed GenerationConstraints."""
        return GenerationConstraints(
            max_sessions=constraints.get("max_sessions"),
            max_time_per_session_min=constraints.get("max_time_per_session_min"),
            max_total_weeks=constraints.get("max_total_weeks"),
            max_budget_usd=constraints.get("max_budget_usd"),
            preferred_modalities=list(constraints.get("preferred_modalities", [])),
            excluded_modalities=list(constraints.get("excluded_modalities", [])),
            home_based_only=bool(constraints.get("home_based_only", False)),
            insurance_covered_only=bool(constraints.get("insurance_covered_only", False)),
            min_evidence_grade=constraints.get("min_evidence_grade", "C"),
        )

    # _parse_modalities is now an instance method above

    async def _build_all_protocols(
        self,
        modalities: List[ModalityType],
        patient: PatientProfile,
        diagnosis: str,
        constraints: GenerationConstraints,
    ) -> List[TreatmentProtocol]:
        """Build protocols for all allowed modalities in parallel."""
        tasks = []
        for modality in modalities:
            builder = self.builders.get(modality)
            if builder:
                tasks.append(builder.build(patient, diagnosis, constraints))
            else:
                self.logger.warning(f"No builder registered for {modality.value}")

        results = await asyncio.gather(*tasks, return_exceptions=True)

        protocols: List[TreatmentProtocol] = []
        for result in results:
            if isinstance(result, Exception):
                self.logger.error(f"Protocol build error: {result}")
            elif result is not None:
                protocols.append(result)

        return protocols

    @staticmethod
    def _calculate_overall_confidence(protocols: List[TreatmentProtocol]) -> float:
        """Calculate overall confidence across all ranked protocols."""
        if not protocols:
            return 0.0
        scores = [p.confidence_overall for p in protocols]
        # Weight top protocol more heavily
        weights = [0.5, 0.25, 0.15, 0.07, 0.03]
        total = 0.0
        for i, score in enumerate(scores):
            if i < len(weights):
                total += score * weights[i]
            else:
                total += score * 0.01
        return min(1.0, total / sum(weights[: len(scores)]))


# =============================================================================
# SYNC WRAPPER — Convenience function for synchronous contexts
# =============================================================================


def generate_protocols_sync(
    patient_id: str,
    diagnosis: str,
    modalities: List[str],
    patient_profile: Dict[str, Any],
    constraints: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Synchronous wrapper for ProtocolGenerator.generate_protocols().

    Convenience function for non-async contexts (e.g., Jupyter notebooks,
    traditional Flask/Django views).

    Example:
        result = generate_protocols_sync(
            patient_id="PT-001",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS"],
            patient_profile={"age_years": 45, "sex": "female"},
        )
    """
    generator = ProtocolGenerator()
    return asyncio.run(
        generator.generate_protocols(
            patient_id=patient_id,
            diagnosis=diagnosis,
            modalities=modalities,
            patient_profile=patient_profile,
            constraints=constraints,
        )
    )


# =============================================================================
# MODULE ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    # --- Quick smoke test -----------------------------------------------
    async def _smoke_test():
        generator = ProtocolGenerator()

        test_profile = {
            "age_years": 45,
            "sex": "female",
            "medications": ["sertraline", "lorazepam"],
            "comorbidities": [],
            "severity_score": 7.5,
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }

        result = await generator.generate_protocols(
            patient_id="PT-SMOKE-001",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS", "PBM", "neurofeedback"],
            patient_profile=test_profile,
            constraints={"max_sessions": 20, "max_budget_usd": 5000},
        )

        print(json.dumps(result, indent=2, default=str))
        print(f"\nGenerated {len(result['protocols'])} ranked protocols")
        print(f"Rejected {len(result['rejected_protocols'])} protocols")
        print(f"Overall confidence: {result['overall_confidence']}")

    asyncio.run(_smoke_test())
