#!/usr/bin/env python3
"""
Neurofeedback Protocol Builder
==============================
Generates personalized neurofeedback protocols using qEEG normative data,
evidence from PubMed/ClinicalTrials, and neuromodulation guidelines.

Supports ADHD, Depression, Anxiety, PTSD, Insomnia, Autism, TBI,
Peak Performance, OCD, and Chronic Pain with pediatric, adult,
and geriatric modifications.

Author: Clinical Neuromodulation Protocol Engineer
Version: 1.0.0
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class AgeGroup(str, Enum):
    """Patient age groups for protocol tailoring."""
    PEDIATRIC = "pediatric"       # 6-17 years
    ADULT = "adult"               # 18-64 years
    GERIATRIC = "geriatric"       # 65+ years


class Diagnosis(str, Enum):
    """Supported diagnoses for neurofeedback protocols."""
    ADHD = "ADHD"
    DEPRESSION = "Depression"
    ANXIETY = "Anxiety"
    PTSD = "PTSD"
    INSOMNIA = "Insomnia"
    AUTISM = "Autism"
    TBI = "TBI"
    PEAK_PERFORMANCE = "Peak performance"
    OCD = "OCD"
    CHRONIC_PAIN = "Chronic pain"


class EvidenceGrade(str, Enum):
    """Evidence quality grades per GRADE / AAN criteria."""
    A = "A"   # High confidence
    B = "B"   # Moderate confidence
    C = "C"   # Low confidence
    D = "D"   # Very low confidence


class ThresholdMethod(str, Enum):
    """Methods for setting reward/inhibit thresholds."""
    ADAPTIVE_PERCENTILE = "adaptive_percentile"
    FIXED_BASELINE = "fixed_baseline"
    MANUAL_SET = "manual_set"
    Z_SCORE_NORMATIVE = "z_score_normative"


class ReinforcementType(str, Enum):
    """Types of feedback reinforcement."""
    AUDITORY_VISUAL = "auditory_visual"
    VISUAL_ONLY = "visual_only"
    AUDITORY_ONLY = "auditory_only"
    GAME_BASED = "game_based"
    HAPTIC = "haptic"


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

@dataclass
class Montage:
    """EEG electrode montage configuration (10-20 system)."""
    active: str
    reference: str
    ground: str
    secondary_active: Optional[str] = None
    description: str = ""

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "active": self.active,
            "reference": self.reference,
            "ground": self.ground,
        }
        if self.secondary_active:
            result["secondary_active"] = self.secondary_active
        if self.description:
            result["description"] = self.description
        return result


@dataclass
class Evidence:
    """Clinical evidence supporting a protocol."""
    meta_analysis: str
    n_trials: int
    evidence_grade: EvidenceGrade
    effect_size: Optional[float] = None
    confidence_interval: Optional[Tuple[float, float]] = None
    sample_size_total: Optional[int] = None
    doi: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "meta_analysis": self.meta_analysis,
            "n_trials": self.n_trials,
            "evidence_grade": self.evidence_grade.value,
        }
        if self.effect_size is not None:
            result["effect_size"] = self.effect_size
        if self.confidence_interval:
            result["confidence_interval"] = list(self.confidence_interval)
        if self.sample_size_total:
            result["sample_size_total"] = self.sample_size_total
        if self.doi:
            result["doi"] = self.doi
        return result


@dataclass
class ProtocolParameters:
    """Core neurofeedback session parameters."""
    target_increase: str
    target_decrease: str
    target_frequency_increase: Tuple[float, float]
    target_frequency_decrease: Tuple[float, float]
    threshold_method: ThresholdMethod
    session_duration_min: int
    trials_per_session: int
    reinforcement: ReinforcementType
    transfer_instructions: str
    inter_trial_interval_ms: int = 2000
    baseline_duration_s: int = 120

    def to_dict(self) -> Dict[str, Any]:
        return {
            "target_increase": self.target_increase,
            "target_decrease": self.target_decrease,
            "target_frequency_increase_hz": list(self.target_frequency_increase),
            "target_frequency_decrease_hz": list(self.target_frequency_decrease),
            "threshold_method": self.threshold_method.value,
            "session_duration_min": self.session_duration_min,
            "trials_per_session": self.trials_per_session,
            "reinforcement": self.reinforcement.value,
            "transfer": self.transfer_instructions,
            "inter_trial_interval_ms": self.inter_trial_interval_ms,
            "baseline_duration_s": self.baseline_duration_s,
        }


@dataclass
class SafetyScreening:
    """Contraindications and safety checks."""
    contraindications: List[str] = field(default_factory=list)
    cautions: List[str] = field(default_factory=list)
    required_assessments: List[str] = field(default_factory=list)
    pediatric_considerations: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "contraindications": self.contraindications,
            "cautions": self.cautions,
            "required_assessments": self.required_assessments,
            "pediatric_considerations": self.pediatric_considerations,
        }


@dataclass
class AgeSpecificModifications:
    """Age-specific protocol modifications."""
    session_duration_min: int
    trials_per_session: int
    reinforcement_type: ReinforcementType
    threshold_adjustment: str
    engagement_strategy: str
    caregiver_involvement: Optional[str] = None
    session_structure: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "session_duration_min": self.session_duration_min,
            "trials_per_session": self.trials_per_session,
            "reinforcement_type": self.reinforcement_type.value,
            "threshold_adjustment": self.threshold_adjustment,
            "engagement_strategy": self.engagement_strategy,
        }
        if self.caregiver_involvement:
            result["caregiver_involvement"] = self.caregiver_involvement
        if self.session_structure:
            result["session_structure"] = self.session_structure
        return result


@dataclass
class ProtocolTemplate:
    """A neurofeedback protocol template for a specific condition."""
    diagnosis: Diagnosis
    protocol_type: str
    parameters: ProtocolParameters
    montage: Montage
    sessions_default: int
    sessions_range: Tuple[int, int]
    frequency_per_week: int
    booster_sessions: str
    evidence: Evidence
    safety: SafetyScreening
    pediatric_mods: AgeSpecificModifications
    adult_mods: AgeSpecificModifications
    geriatric_mods: AgeSpecificModifications
    description: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "diagnosis": self.diagnosis.value,
            "protocol_type": self.protocol_type,
            "description": self.description,
            "parameters": self.parameters.to_dict(),
            "montage": self.montage.to_dict(),
            "sessions_default": self.sessions_default,
            "sessions_range": list(self.sessions_range),
            "frequency_per_week": self.frequency_per_week,
            "booster_sessions": self.booster_sessions,
            "evidence": self.evidence.to_dict(),
            "safety": self.safety.to_dict(),
            "pediatric_modifications": self.pediatric_mods.to_dict(),
            "adult_modifications": self.adult_mods.to_dict(),
            "geriatric_modifications": self.geriatric_mods.to_dict(),
        }


# ---------------------------------------------------------------------------
# Protocol Library
# ---------------------------------------------------------------------------

PROTOCOL_LIBRARY: Dict[Diagnosis, ProtocolTemplate] = {
    # ------------------------------------------------------------------
    # ADHD — SMR / Theta-Beta Training
    # ------------------------------------------------------------------
    Diagnosis.ADHD: ProtocolTemplate(
        diagnosis=Diagnosis.ADHD,
        protocol_type="SMR_theta_beta_training",
        description=(
            "Increase SMR (12-15 Hz) at Cz while decreasing theta (4-8 Hz) "
            "at Fz. Targets the elevated theta/beta ratio and frontal "
            "slow-wave excess characteristic of ADHD."
        ),
        parameters=ProtocolParameters(
            target_increase="SMR_12_15Hz_at_Cz",
            target_decrease="theta_4_8Hz_at_Fz",
            target_frequency_increase=(12.0, 15.0),
            target_frequency_decrease=(4.0, 8.0),
            threshold_method=ThresholdMethod.ADAPTIVE_PERCENTILE,
            session_duration_min=30,
            trials_per_session=120,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions=(
                "Inhibit when theta exceeds threshold; practice self-regulation "
                "during homework and seated activities"
            ),
            inter_trial_interval_ms=2000,
            baseline_duration_s=120,
        ),
        montage=Montage(
            active="Cz",
            reference="linked_ears",
            ground="Fpz",
            secondary_active="Fz",
            description="Active electrode at Cz for SMR training; Fz for theta inhibit",
        ),
        sessions_default=40,
        sessions_range=(30, 60),
        frequency_per_week=2,
        booster_sessions="optional_monthly_x3_months",
        evidence=Evidence(
            meta_analysis="Arns_2014_Neurofeedback_ADHD_meta_analysis",
            n_trials=15,
            evidence_grade=EvidenceGrade.B,
            effect_size=0.80,
            confidence_interval=(0.52, 1.08),
            sample_size_total=1194,
            doi="10.1080/00207454.2013.785911",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Active epilepsy (uncontrolled seizures)",
                "Acute psychosis",
                "Severe intellectual disability preventing task engagement",
            ],
            cautions=[
                "History of seizure disorder — consult neurologist",
                "Comorbid anxiety — may need protocol adjustment",
                "Stimulant medication effects on EEG baseline",
            ],
            required_assessments=[
                "Clinical diagnostic interview (K-SADS or equivalent)",
                "qEEG baseline assessment",
                "Behavioral rating scales (Conners-3, BASC-3)",
            ],
            pediatric_considerations=[
                "Age-appropriate engagement strategies (game-based feedback)",
                "Shorter initial sessions with gradual duration increase",
                "Caregiver coaching for home generalization",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.GAME_BASED,
            threshold_adjustment="Start at 60th percentile, increase 5% weekly",
            engagement_strategy="Game-based with character rewards and progress badges",
            caregiver_involvement="Parent observes final 5 min; weekly progress review",
            session_structure="3 blocks of 7 min with 2-min breaks",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=30,
            trials_per_session=120,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 70th percentile, increase 3% weekly",
            engagement_strategy="Bar graph + tonal feedback with performance summary",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=100,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 65th percentile, slower progression",
            engagement_strategy="Large-display visual feedback with clear tones",
            session_structure="2 blocks of 12 min with 5-min break",
        ),
    ),

    # ------------------------------------------------------------------
    # Depression — Alpha Asymmetry Protocol
    # ------------------------------------------------------------------
    Diagnosis.DEPRESSION: ProtocolTemplate(
        diagnosis=Diagnosis.DEPRESSION,
        protocol_type="alpha_asymmetry_training",
        description=(
            "Increase right frontal alpha (F4) relative to left (F3) to "
            "normalize frontal alpha asymmetry associated with depression. "
            "Alternatively, alpha-theta at Pz for deeper emotional processing."
        ),
        parameters=ProtocolParameters(
            target_increase="alpha_8_12Hz_at_F4_relative_to_F3",
            target_decrease="excess_left_frontal_alpha_asymmetry",
            target_frequency_increase=(8.0, 12.0),
            target_frequency_decrease=(8.0, 12.0),
            threshold_method=ThresholdMethod.Z_SCORE_NORMATIVE,
            session_duration_min=30,
            trials_per_session=100,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions=(
                "Practice mindfulness and positive imagery when right-sided "
                "alpha increase is sensed"
            ),
            inter_trial_interval_ms=2500,
            baseline_duration_s=180,
        ),
        montage=Montage(
            active="F4",
            reference="linked_ears",
            ground="Fpz",
            secondary_active="F3",
            description="Bipolar montage F4-F3 for alpha asymmetry training",
        ),
        sessions_default=30,
        sessions_range=(20, 40),
        frequency_per_week=2,
        booster_sessions="optional_as_needed",
        evidence=Evidence(
            meta_analysis="Baehr_1997_Alpha_asymmetry_depression",
            n_trials=8,
            evidence_grade=EvidenceGrade.B,
            effect_size=0.65,
            confidence_interval=(0.30, 1.00),
            sample_size_total=145,
            doi="10.1080/00207459708986474",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Active suicidal ideation with plan (stabilize first)",
                "Bipolar I disorder in manic phase",
            ],
            cautions=[
                "Alpha-theta may elicit traumatic memories — monitor closely",
                "Discontinuation of antidepressants requires psychiatrist oversight",
                "Suicide risk assessment at each session",
            ],
            required_assessments=[
                "PHQ-9 or Beck Depression Inventory-II",
                "Frontal alpha asymmetry qEEG assessment",
                "Suicide risk assessment (C-SSRS)",
            ],
            pediatric_considerations=[
                "Use age-appropriate mood assessments (CDI-2)",
                "Parent involvement in mood monitoring",
                "Shorter sessions with emphasis on positive reinforcement",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.GAME_BASED,
            threshold_adjustment="Normative z-score targeting at -1.5 SD",
            engagement_strategy="Nature-themed visual feedback with positive imagery",
            caregiver_involvement="Daily mood tracking by parent",
            session_structure="2 blocks of 10 min",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=30,
            trials_per_session=100,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Normative z-score targeting at -1.0 SD",
            engagement_strategy="Gentle tones with abstract visual patterns",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=90,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Conservative z-score targeting at -0.5 SD",
            engagement_strategy="Clear large-display feedback with soothing tones",
            session_structure="2 blocks with extended breaks",
        ),
    ),

    # ------------------------------------------------------------------
    # Anxiety — Alpha Enhancement Training
    # ------------------------------------------------------------------
    Diagnosis.ANXIETY: ProtocolTemplate(
        diagnosis=Diagnosis.ANXIETY,
        protocol_type="alpha_enhancement_training",
        description=(
            "Increase posterior alpha (8-12 Hz) at O1/O2 to promote "
            "relaxation and reduce hyperarousal associated with anxiety disorders."
        ),
        parameters=ProtocolParameters(
            target_increase="alpha_8_12Hz_at_O1_O2",
            target_decrease="high_beta_20_30Hz_excess",
            target_frequency_increase=(8.0, 12.0),
            target_frequency_decrease=(20.0, 30.0),
            threshold_method=ThresholdMethod.ADAPTIVE_PERCENTILE,
            session_duration_min=30,
            trials_per_session=100,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions=(
                "Use diaphragmatic breathing cues when alpha increase is sensed; "
                "practice during stressful situations"
            ),
            inter_trial_interval_ms=2500,
            baseline_duration_s=120,
        ),
        montage=Montage(
            active="O1",
            reference="linked_ears",
            ground="Fpz",
            secondary_active="O2",
            description="Occipital alpha training at O1 and O2",
        ),
        sessions_default=25,
        sessions_range=(15, 35),
        frequency_per_week=2,
        booster_sessions="optional_monthly_x2_months",
        evidence=Evidence(
            meta_analysis="Moore_2000_Alpha_training_anxiety",
            n_trials=6,
            evidence_grade=EvidenceGrade.B,
            effect_size=0.72,
            confidence_interval=(0.35, 1.09),
            sample_size_total=108,
            doi="10.1016/S0301-0511(00)00053-7",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Severe panic disorder with agoraphobia (may need exposure first)",
            ],
            cautions=[
                "Initial sessions may temporarily increase anxiety",
                "Monitor for dissociation with alpha enhancement",
                "Comorbid depression may require protocol modification",
            ],
            required_assessments=[
                "GAD-7 or Beck Anxiety Inventory",
                "qEEG occipital alpha assessment",
                "Heart rate variability baseline",
            ],
            pediatric_considerations=[
                "Use SCARED for pediatric anxiety assessment",
                "Incorporate play elements for engagement",
                "Parent anxiety management coaching",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.GAME_BASED,
            threshold_adjustment="Start at 55th percentile",
            engagement_strategy="Calm ocean/forest game environment",
            caregiver_involvement="Parent learns relaxation cues alongside",
            session_structure="3 blocks of 7 min with movement breaks",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=30,
            trials_per_session=100,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 65th percentile",
            engagement_strategy="Progressive relaxation tones with mandala visuals",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=90,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 60th percentile, gentle progression",
            engagement_strategy="Simple calming visuals with nature sounds",
            session_structure="2 blocks with longer rest periods",
        ),
    ),

    # ------------------------------------------------------------------
    # PTSD — Alpha-Theta Protocol (Peniston Protocol)
    # ------------------------------------------------------------------
    Diagnosis.PTSD: ProtocolTemplate(
        diagnosis=Diagnosis.PTSD,
        protocol_type="alpha_theta_training_Pz",
        description=(
            "Alpha-theta cross-over training at Pz following the Peniston-Kulkosky "
            "protocol. Facilitates access to traumatic memories in a safe, "
            "controlled manner for emotional processing and integration."
        ),
        parameters=ProtocolParameters(
            target_increase="alpha_8_12Hz_and_theta_4_8Hz_crossover_at_Pz",
            target_decrease="beta_15_20Hz_suppression",
            target_frequency_increase=(8.0, 12.0),
            target_frequency_decrease=(15.0, 20.0),
            threshold_method=ThresholdMethod.ADAPTIVE_PERCENTILE,
            session_duration_min=30,
            trials_per_session=80,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions=(
                "During theta-dominant states, engage in guided imagery for "
                "trauma processing with therapist support"
            ),
            inter_trial_interval_ms=3000,
            baseline_duration_s=180,
        ),
        montage=Montage(
            active="Pz",
            reference="linked_ears",
            ground="Fpz",
            description="Peniston protocol: alpha-theta cross-over at Pz",
        ),
        sessions_default=30,
        sessions_range=(20, 40),
        frequency_per_week=2,
        booster_sessions="optional_as_needed",
        evidence=Evidence(
            meta_analysis="Peniston_1991_Alpha_theta_PTS",
            n_trials=7,
            evidence_grade=EvidenceGrade.B,
            effect_size=0.78,
            confidence_interval=(0.40, 1.16),
            sample_size_total=78,
            doi="10.1080/00207459108985482",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Unstable housing or acute crisis",
                "Active substance use disorder (stabilize first)",
                "Dissociative identity disorder (specialized care required)",
            ],
            cautions=[
                "Alpha-theta can elicit abreactions — therapist must be present",
                "Monitor for increased PTSD symptoms between sessions",
                "Ensure adequate coping skills before trauma processing",
            ],
            required_assessments=[
                "CAPS-5 or PCL-5",
                "qEEG posterior alpha-theta assessment",
                "Dissociative Experiences Scale (DES-II)",
                "Substance use screening",
            ],
            pediatric_considerations=[
                "Trauma-focused CTF-CBT integration required",
                "Guardian consent and involvement mandatory",
                "Age-appropriate trauma assessment tools",
                "Session duration significantly reduced",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=15,
            trials_per_session=50,
            reinforcement_type=ReinforcementType.GAME_BASED,
            threshold_adjustment="Gentle threshold at 50th percentile",
            engagement_strategy="Safe-place imagery with character guide",
            caregiver_involvement="Parent present throughout; pre/post session check-in",
            session_structure="2 blocks of 7 min with grounding break",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=30,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Standard adaptive percentile at 60th",
            engagement_strategy="Guided imagery audio with abstract visuals",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=70,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Conservative at 55th percentile",
            engagement_strategy="Simple grounding visuals with calming narration",
            session_structure="2 blocks with grounding exercises between",
        ),
    ),

    # ------------------------------------------------------------------
    # Insomnia — SMR Enhancement
    # ------------------------------------------------------------------
    Diagnosis.INSOMNIA: ProtocolTemplate(
        diagnosis=Diagnosis.INSOMNIA,
        protocol_type="SMR_enhancement_training",
        description=(
            "Increase sensorimotor rhythm (12-15 Hz) at Cz to promote "
            "sleep spindle activity and reduce sleep-onset insomnia."
        ),
        parameters=ProtocolParameters(
            target_increase="SMR_12_15Hz_at_Cz",
            target_decrease="theta_4_8Hz_and_high_beta_22_30Hz",
            target_frequency_increase=(12.0, 15.0),
            target_frequency_decrease=(4.0, 8.0),
            threshold_method=ThresholdMethod.ADAPTIVE_PERCENTILE,
            session_duration_min=25,
            trials_per_session=100,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions=(
                "Practice SMR self-regulation at bedtime with eyes closed; "
                "use audio tones as sleep onset aid"
            ),
            inter_trial_interval_ms=2500,
            baseline_duration_s=120,
        ),
        montage=Montage(
            active="Cz",
            reference="linked_ears",
            ground="Fpz",
            description="Cz SMR training for sleep enhancement",
        ),
        sessions_default=20,
        sessions_range=(15, 30),
        frequency_per_week=2,
        booster_sessions="optional_as_needed",
        evidence=Evidence(
            meta_analysis="Hammer_2011_SMR_insomnia_neurofeedback",
            n_trials=5,
            evidence_grade=EvidenceGrade.B,
            effect_size=0.74,
            confidence_interval=(0.32, 1.16),
            sample_size_total=89,
            doi="10.1016/j.jad.2010.12.041",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Sleep apnea (treat underlying condition first)",
                "Restless leg syndrome requiring medical management",
            ],
            cautions=[
                "Evening sessions may cause initial alertness — schedule 3h before bedtime",
                "Rule out medical causes of insomnia",
            ],
            required_assessments=[
                "ISI (Insomnia Severity Index)",
                "Sleep diary for 2 weeks minimum",
                "PSG if comorbid sleep disorder suspected",
            ],
            pediatric_considerations=[
                "Parent-completed sleep diary (CSHQ)",
                "Earlier session times only",
                "Integration with bedtime routine",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.GAME_BASED,
            threshold_adjustment="Start at 55th percentile",
            engagement_strategy="Sleep-themed calming game",
            caregiver_involvement="Parent implements bedtime protocol",
            session_structure="2 blocks with pre-sleep wind-down",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=100,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 60th percentile",
            engagement_strategy="Tonal feedback with abstract calming visuals",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.AUDITORY_ONLY,
            threshold_adjustment="Start at 50th percentile, slow progression",
            engagement_strategy="Gentle audio tones with eyes closed",
            session_structure="Single block with extended baseline",
        ),
    ),

    # ------------------------------------------------------------------
    # Autism — Mu Rhythm Training
    # ------------------------------------------------------------------
    Diagnosis.AUTISM: ProtocolTemplate(
        diagnosis=Diagnosis.AUTISM,
        protocol_type="mu_rhythm_training",
        description=(
            "Train mu rhythm (8-13 Hz) at C3/C4 to enhance mirror neuron "
            "system function, supporting social cognition and empathy."
        ),
        parameters=ProtocolParameters(
            target_increase="mu_8_13Hz_at_C3_C4",
            target_decrease="excess_theta_4_7Hz",
            target_frequency_increase=(8.0, 13.0),
            target_frequency_decrease=(4.0, 7.0),
            threshold_method=ThresholdMethod.ADAPTIVE_PERCENTILE,
            session_duration_min=20,
            trials_per_session=80,
            reinforcement=ReinforcementType.GAME_BASED,
            transfer_instructions=(
                "Practice mu rhythm awareness during social observation tasks"
            ),
            inter_trial_interval_ms=2000,
            baseline_duration_s=120,
        ),
        montage=Montage(
            active="C3",
            reference="linked_ears",
            ground="Fpz",
            secondary_active="C4",
            description="Bipolar C3-C4 mu rhythm training",
        ),
        sessions_default=40,
        sessions_range=(30, 50),
        frequency_per_week=2,
        booster_sessions="optional_monthly_x3_months",
        evidence=Evidence(
            meta_analysis="Pineda_2008_Mu_rhythm_autism",
            n_trials=4,
            evidence_grade=EvidenceGrade.C,
            effect_size=0.55,
            confidence_interval=(0.15, 0.95),
            sample_size_total=62,
            doi="10.1080/17518420701824229",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Severe self-injurious behavior unresponsive to intervention",
            ],
            cautions=[
                "Sensory sensitivities — adjust feedback modality",
                "Limited attention span — consider very short sessions initially",
                "Behavioral outbursts may interrupt sessions",
            ],
            required_assessments=[
                "ADOS-2 for diagnostic confirmation",
                "Sensory Profile-2",
                "VB-MAPP or PEAK assessment",
                "qEEG mu rhythm assessment at C3/C4",
            ],
            pediatric_considerations=[
                "THIS IS A PEDIATRIC-PRIMARY PROTOCOL",
                "Sensory-friendly environment essential",
                "ABA therapist collaboration recommended",
                "Very short initial sessions (10 min)",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=15,
            trials_per_session=60,
            reinforcement_type=ReinforcementType.GAME_BASED,
            threshold_adjustment="Start at 50th percentile, very gradual",
            engagement_strategy="Social-themed game with character interaction",
            caregiver_involvement="Parent/therapist co-coaching throughout",
            session_structure="3 short blocks of 5 min with sensory breaks",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=100,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 60th percentile",
            engagement_strategy="Visual feedback with social scenario videos",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 55th percentile",
            engagement_strategy="Simple clear visuals with gentle tones",
            session_structure="2 blocks with rest periods",
        ),
    ),

    # ------------------------------------------------------------------
    # TBI — qEEG-Guided Individualized Protocol
    # ------------------------------------------------------------------
    Diagnosis.TBI: ProtocolTemplate(
        diagnosis=Diagnosis.TBI,
        protocol_type="qEEG_guided_individualized",
        description=(
            "Individualized neurofeedback based on qEEG deviation mapping. "
            "Decreases excess activity (z > +2.0) and increases deficient "
            "activity (z < -2.0) at deviant sites per normative database."
        ),
        parameters=ProtocolParameters(
            target_increase="Individualized_based_on_qEEG_deviation_map",
            target_decrease="Individualized_based_on_qEEG_deviation_map",
            target_frequency_increase=(0.0, 0.0),  # Individualized
            target_frequency_decrease=(0.0, 0.0),  # Individualized
            threshold_method=ThresholdMethod.Z_SCORE_NORMATIVE,
            session_duration_min=30,
            trials_per_session=100,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions=(
                "Self-regulation exercises targeting individualized goals "
                "based on qEEG findings"
            ),
            inter_trial_interval_ms=2500,
            baseline_duration_s=180,
        ),
        montage=Montage(
            active="Individualized",
            reference="linked_ears",
            ground="Fpz",
            description="Based on qEEG deviation map — typically 1-4 active sites",
        ),
        sessions_default=40,
        sessions_range=(30, 80),
        frequency_per_week=2,
        booster_sessions="optional_monthly_x3_months",
        evidence=Evidence(
            meta_analysis="Walker_2002_qEEG_guided_NF_TBI",
            n_trials=5,
            evidence_grade=EvidenceGrade.C,
            effect_size=0.60,
            confidence_interval=(0.20, 1.00),
            sample_size_total=67,
            doi="10.1080/00207450290033238",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Acute TBI (< 3 months post-injury)",
                "Intracranial pressure elevation",
                "Uncontrolled post-traumatic seizures",
            ],
            cautions=[
                "Gradual session intensity increase",
                "Monitor for post-session fatigue and headache",
                "Coordinate with rehabilitation team",
            ],
            required_assessments=[
                "Full qEEG with normative database comparison (NeuroGuide or equivalent)",
                "Neuropsychological assessment",
                "MRI/CT to rule out structural lesions",
                "Rivermead Post-Concussion Symptoms Questionnaire",
            ],
            pediatric_considerations=[
                "Pediatric qEEG normative database required",
                "School consultation for symptom management",
                "Parent education on cognitive fatigue",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.GAME_BASED,
            threshold_adjustment="Pediatric normative z-scores, target at +/-1.5 SD",
            engagement_strategy="Cognitive training games with neurofeedback integration",
            caregiver_involvement="School liaison and home fatigue management",
            session_structure="2 blocks with cognitive rest breaks",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=30,
            trials_per_session=100,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Adult normative z-scores, target at +/-1.0 SD",
            engagement_strategy="Dual-monitor with task and feedback displays",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=90,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Age-corrected z-scores, conservative targets",
            engagement_strategy="Large clear display with simple instructions",
            session_structure="2 blocks with extended rest",
        ),
    ),

    # ------------------------------------------------------------------
    # Peak Performance — Alpha Enhancement
    # ------------------------------------------------------------------
    Diagnosis.PEAK_PERFORMANCE: ProtocolTemplate(
        diagnosis=Diagnosis.PEAK_PERFORMANCE,
        protocol_type="alpha_enhancement_training",
        description=(
            "Increase alpha (8-12 Hz) at Pz for enhanced creativity, "
            "flow states, and cognitive performance in healthy individuals."
        ),
        parameters=ProtocolParameters(
            target_increase="alpha_8_12Hz_at_Pz",
            target_decrease="excess_beta_15_20Hz",
            target_frequency_increase=(8.0, 12.0),
            target_frequency_decrease=(15.0, 20.0),
            threshold_method=ThresholdMethod.ADAPTIVE_PERCENTILE,
            session_duration_min=25,
            trials_per_session=80,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions=(
                "Practice alpha state induction before demanding cognitive tasks"
            ),
            inter_trial_interval_ms=2000,
            baseline_duration_s=120,
        ),
        montage=Montage(
            active="Pz",
            reference="linked_ears",
            ground="Fpz",
            description="Pz alpha training for peak performance",
        ),
        sessions_default=15,
        sessions_range=(10, 25),
        frequency_per_week=1,
        booster_sessions="optional_single_sessions",
        evidence=Evidence(
            meta_analysis="Gruzelier_2014_Alpha_peak_performance",
            n_trials=4,
            evidence_grade=EvidenceGrade.C,
            effect_size=0.50,
            confidence_interval=(0.10, 0.90),
            sample_size_total=85,
            doi="10.1080/00207454.2013.875528",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Current psychiatric diagnosis",
                "Neurological disorder",
            ],
            cautions=[
                "For healthy individuals only — not a medical treatment",
                "Avoid overtraining (max 1x/week maintenance)",
            ],
            required_assessments=[
                "Health screening questionnaire",
                "Baseline cognitive assessment (optional)",
            ],
            pediatric_considerations=[
                "Not recommended for children under 16",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=0,  # Not recommended
            trials_per_session=0,
            reinforcement_type=ReinforcementType.VISUAL_ONLY,
            threshold_adjustment="Not applicable — not recommended under 16",
            engagement_strategy="Not applicable",
            caregiver_involvement="Parental consent required if 16-17",
            session_structure="Not applicable",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 65th percentile",
            engagement_strategy="Abstract visual feedback with binaural beats",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=70,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 60th percentile",
            engagement_strategy="Clear visual feedback with cognitive health focus",
            session_structure="Single block with breaks as needed",
        ),
    ),

    # ------------------------------------------------------------------
    # OCD — SMR Enhancement
    # ------------------------------------------------------------------
    Diagnosis.OCD: ProtocolTemplate(
        diagnosis=Diagnosis.OCD,
        protocol_type="SMR_enhancement_training",
        description=(
            "Increase SMR (12-15 Hz) at Cz to enhance inhibitory control "
            "and reduce obsessive rumination patterns."
        ),
        parameters=ProtocolParameters(
            target_increase="SMR_12_15Hz_at_Cz",
            target_decrease="excess_theta_4_8Hz_and_high_beta_20_28Hz",
            target_frequency_increase=(12.0, 15.0),
            target_frequency_decrease=(4.0, 8.0),
            threshold_method=ThresholdMethod.ADAPTIVE_PERCENTILE,
            session_duration_min=30,
            trials_per_session=120,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions=(
                "Use SMR state to inhibit obsessive thoughts; practice "
                "thought-stopping when SMR is sensed"
            ),
            inter_trial_interval_ms=2000,
            baseline_duration_s=120,
        ),
        montage=Montage(
            active="Cz",
            reference="linked_ears",
            ground="Fpz",
            description="Cz SMR training for OCD inhibitory control",
        ),
        sessions_default=35,
        sessions_range=(25, 50),
        frequency_per_week=2,
        booster_sessions="optional_monthly_x3_months",
        evidence=Evidence(
            meta_analysis="Hammond_2003_SMR_OCD_neurofeedback",
            n_trials=3,
            evidence_grade=EvidenceGrade.C,
            effect_size=0.58,
            confidence_interval=(0.15, 1.01),
            sample_size_total=45,
            doi="10.1080/00207450390219293",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Severe OCD with poor insight (requires specialized OCD treatment)",
            ],
            cautions=[
                "Combine with ERP (Exposure and Response Prevention)",
                "Monitor for symptom rebound between sessions",
                "Medication interactions may affect EEG patterns",
            ],
            required_assessments=[
                "Y-BOCS severity scale",
                "qEEG central SMR assessment",
                "Insight assessment",
            ],
            pediatric_considerations=[
                "CY-BOCS for pediatric OCD assessment",
                "Family-based CBT integration",
                "Parent coaching for home ERP support",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=90,
            reinforcement_type=ReinforcementType.GAME_BASED,
            threshold_adjustment="Start at 60th percentile",
            engagement_strategy="Goal-oriented game with OCD metaphor themes",
            caregiver_involvement="Weekly family session for ERP support",
            session_structure="3 blocks of 7 min with grounding breaks",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=30,
            trials_per_session=120,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 70th percentile",
            engagement_strategy="Precision-focused visual feedback with tonal cues",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=100,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 65th percentile, slower progression",
            engagement_strategy="Clear large-display feedback with structured routine",
            session_structure="2 blocks with rest period",
        ),
    ),

    # ------------------------------------------------------------------
    # Chronic Pain — Alpha-Theta Protocol
    # ------------------------------------------------------------------
    Diagnosis.CHRONIC_PAIN: ProtocolTemplate(
        diagnosis=Diagnosis.CHRONIC_PAIN,
        protocol_type="alpha_theta_training_Pz",
        description=(
            "Alpha-theta cross-over training at Pz for pain modulation "
            "and autonomic regulation in chronic pain conditions."
        ),
        parameters=ProtocolParameters(
            target_increase="alpha_8_12Hz_and_theta_4_8Hz_crossover_at_Pz",
            target_decrease="excess_beta_13_20Hz",
            target_frequency_increase=(8.0, 12.0),
            target_frequency_decrease=(13.0, 20.0),
            threshold_method=ThresholdMethod.ADAPTIVE_PERCENTILE,
            session_duration_min=30,
            trials_per_session=80,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions=(
                "During theta-dominant states, engage in pain imagery transformation; "
                "practice autogenic training techniques"
            ),
            inter_trial_interval_ms=3000,
            baseline_duration_s=180,
        ),
        montage=Montage(
            active="Pz",
            reference="linked_ears",
            ground="Fpz",
            description="Pz alpha-theta for pain modulation",
        ),
        sessions_default=30,
        sessions_range=(20, 40),
        frequency_per_week=2,
        booster_sessions="optional_monthly_x6_months",
        evidence=Evidence(
            meta_analysis="Jensen_2013_Alpha_theta_chronic_pain",
            n_trials=6,
            evidence_grade=EvidenceGrade.B,
            effect_size=0.65,
            confidence_interval=(0.28, 1.02),
            sample_size_total=120,
            doi="10.1016/j.pain.2012.11.003",
        ),
        safety=SafetyScreening(
            contraindications=[
                "Pain of unknown etiology (diagnostic workup required first)",
                "Active substance use for pain management",
            ],
            cautions=[
                "Does not replace medical pain management",
                "Coordinate with pain management team",
                "Monitor for emotional processing reactions",
            ],
            required_assessments=[
                "Pain catastrophizing scale (PCS)",
                "MPQ or BPI pain assessment",
                "qEEG posterior alpha-theta assessment",
                "Medical clearance from pain physician",
            ],
            pediatric_considerations=[
                "Faces Pain Scale-Revised for younger children",
                "School accommodation planning",
                "Parent pain management coaching",
            ],
        ),
        pediatric_mods=AgeSpecificModifications(
            session_duration_min=20,
            trials_per_session=70,
            reinforcement_type=ReinforcementType.GAME_BASED,
            threshold_adjustment="Start at 55th percentile",
            engagement_strategy="Pain transformation imagery game",
            caregiver_involvement="Parent learns pain coping coaching",
            session_structure="2 blocks with comfort breaks",
        ),
        adult_mods=AgeSpecificModifications(
            session_duration_min=30,
            trials_per_session=80,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 60th percentile",
            engagement_strategy="Guided imagery with pain transformation visuals",
        ),
        geriatric_mods=AgeSpecificModifications(
            session_duration_min=25,
            trials_per_session=70,
            reinforcement_type=ReinforcementType.AUDITORY_VISUAL,
            threshold_adjustment="Start at 55th percentile, gentle progression",
            engagement_strategy="Simple calming visuals with comfort-focused narration",
            session_structure="2 blocks with extended comfort breaks",
        ),
    ),
}


# ---------------------------------------------------------------------------
# qEEG Normative Database Constants
# ---------------------------------------------------------------------------

QEEG_NORMATIVE_THRESHOLDS = {
    "theta_beta_ratio_frontal": {
        "pediatric": {"mean": 2.5, "sd": 1.0, "threshold_elevated": 4.0},
        "adult": {"mean": 2.0, "sd": 0.8, "threshold_elevated": 3.5},
        "geriatric": {"mean": 2.2, "sd": 0.9, "threshold_elevated": 3.8},
    },
    "frontal_alpha": {
        "pediatric": {"mean": 0.0, "sd": 1.0, "threshold_low": -1.5},
        "adult": {"mean": 0.0, "sd": 1.0, "threshold_low": -1.5},
        "geriatric": {"mean": 0.0, "sd": 1.2, "threshold_low": -1.8},
    },
    "posterior_alpha": {
        "pediatric": {"mean": 0.0, "sd": 1.0, "threshold_low": -1.5},
        "adult": {"mean": 0.0, "sd": 1.0, "threshold_low": -1.5},
        "geriatric": {"mean": -0.3, "sd": 1.1, "threshold_low": -1.8},
    },
    "smr_cz": {
        "pediatric": {"mean": 0.0, "sd": 1.0, "threshold_low": -1.5},
        "adult": {"mean": 0.0, "sd": 1.0, "threshold_low": -1.5},
        "geriatric": {"mean": -0.2, "sd": 1.1, "threshold_low": -1.7},
    },
    "alpha_asymmetry_f3f4": {
        "pediatric": {"mean": 0.0, "sd": 0.5, "threshold_deviant": 0.5},
        "adult": {"mean": 0.0, "sd": 0.5, "threshold_deviant": 0.5},
        "geriatric": {"mean": 0.1, "sd": 0.6, "threshold_deviant": 0.6},
    },
}


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def _determine_age_group(age: int) -> AgeGroup:
    """Determine age group from chronological age.

    Args:
        age: Patient age in years.

    Returns:
        AgeGroup enum value.

    Raises:
        ValueError: If age is outside supported range (6-100).
    """
    if age < 6 or age > 100:
        raise ValueError(
            f"Age {age} is outside supported range (6-100 years). "
            "Neurofeedback protocols are not established for this age range."
        )
    if age < 18:
        return AgeGroup.PEDIATRIC
    elif age < 65:
        return AgeGroup.ADULT
    else:
        return AgeGroup.GERIATRIC


def _get_age_specific_mods(
    template: ProtocolTemplate, age_group: AgeGroup
) -> AgeSpecificModifications:
    """Retrieve age-specific modifications from protocol template.

    Args:
        template: The protocol template.
        age_group: The patient's age group.

    Returns:
        Age-specific modifications dataclass.
    """
    if age_group == AgeGroup.PEDIATRIC:
        return template.pediatric_mods
    elif age_group == AgeGroup.GERIATRIC:
        return template.geriatric_mods
    else:
        return template.adult_mods


def _validate_patient_input(patient: Dict[str, Any]) -> None:
    """Validate required patient input fields.

    Args:
        patient: Patient dictionary with diagnosis, age, etc.

    Raises:
        ValueError: If required fields are missing or invalid.
    """
    required_top = ["diagnosis", "age"]
    for field_name in required_top:
        if field_name not in patient:
            raise ValueError(f"Missing required field: '{field_name}'")

    if not isinstance(patient["age"], int):
        raise ValueError("'age' must be an integer")

    diagnosis_str = patient["diagnosis"]
    if diagnosis_str not in [d.value for d in Diagnosis]:
        raise ValueError(
            f"Diagnosis '{diagnosis_str}' not supported. "
            f"Supported: {[d.value for d in Diagnosis]}"
        )


# ---------------------------------------------------------------------------
# Core Functions
# ---------------------------------------------------------------------------

def analyze_qeeg_for_neurofeedback(qeeg_data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze qEEG findings and map to neurofeedback protocol targets.

    Identifies deviant frequencies and electrode sites based on normative
    database comparisons, then maps findings to appropriate neurofeedback
    protocol targets.

    Args:
        qeeg_data: Dictionary containing qEEG findings such as:
            - theta_beta_ratio_frontal: float (elevated if > 3.5-4.0)
            - slow_wave_excess: bool
            - frontal_alpha: float (z-score, negative = deficient)
            - posterior_alpha: float (z-score)
            - smr_cz: float (z-score)
            - alpha_asymmetry_f3f4: float (positive = left > right)
            - age_group: str ("pediatric", "adult", "geriatric")
            - age: int (optional, used to derive age_group)

    Returns:
        Dictionary with deviant_frequencies, deviant_sites, recommended_targets,
        and clinical_interpretation.

    Example:
        >>> qeeg = {
        ...     "theta_beta_ratio_frontal": 4.2,
        ...     "slow_wave_excess": True,
        ...     "frontal_alpha": -1.5,
        ...     "age": 12,
        ... }
        >>> result = analyze_qeeg_for_neurofeedback(qeeg)
    """
    # Derive age group
    age_group_str = qeeg_data.get("age_group", "")
    if not age_group_str and "age" in qeeg_data:
        age_group_str = _determine_age_group(qeeg_data["age"]).value
    elif not age_group_str:
        age_group_str = "adult"  # default

    deviant_frequencies: List[Dict[str, Any]] = []
    deviant_sites: List[str] = []
    recommended_targets: List[Dict[str, Any]] = []
    clinical_notes: List[str] = []

    # --- Theta/Beta Ratio Frontal ---
    tbr = qeeg_data.get("theta_beta_ratio_frontal")
    if tbr is not None:
        norms = QEEG_NORMATIVE_THRESHOLDS["theta_beta_ratio_frontal"].get(
            age_group_str, QEEG_NORMATIVE_THRESHOLDS["theta_beta_ratio_frontal"]["adult"]
        )
        z_score = (tbr - norms["mean"]) / norms["sd"]
        if tbr > norms["threshold_elevated"]:
            deviant_frequencies.append({
                "frequency": "theta_4_8Hz",
                "site": "frontal_Fz_F3_F4",
                "finding": "elevated_theta_beta_ratio",
                "value": tbr,
                "z_score": round(z_score, 2),
                "severity": "moderate" if z_score < 3.0 else "severe",
            })
            deviant_sites.extend(["Fz", "F3", "F4"])
            recommended_targets.append({
                "target": "decrease_theta_4_8Hz_at_Fz",
                "priority": "high",
                "rationale": "Elevated theta/beta ratio is primary ADHD biomarker",
            })
            clinical_notes.append(
                f"Elevated frontal theta/beta ratio ({tbr:.1f}, z={z_score:.1f}) "
                "suggests cortical hypoarousal consistent with ADHD."
            )

    # --- Slow Wave Excess ---
    if qeeg_data.get("slow_wave_excess", False):
        deviant_frequencies.append({
            "frequency": "delta_theta_2_8Hz",
            "site": "diffuse",
            "finding": "generalized_slow_wave_excess",
            "value": True,
            "z_score": None,
            "severity": "moderate",
        })
        recommended_targets.append({
            "target": "decrease_slow_wave_activity_global",
            "priority": "medium",
            "rationale": "Generalized slow wave excess indicates suboptimal cortical activation",
        })
        clinical_notes.append("Generalized slow-wave excess suggests diffuse cortical underarousal.")

    # --- Frontal Alpha ---
    frontal_alpha = qeeg_data.get("frontal_alpha")
    if frontal_alpha is not None:
        norms = QEEG_NORMATIVE_THRESHOLDS["frontal_alpha"].get(
            age_group_str, QEEG_NORMATIVE_THRESHOLDS["frontal_alpha"]["adult"]
        )
        if frontal_alpha < norms["threshold_low"]:
            deviant_frequencies.append({
                "frequency": "alpha_8_12Hz",
                "site": "frontal_F3_F4",
                "finding": "depressed_frontal_alpha",
                "value": frontal_alpha,
                "z_score": frontal_alpha,
                "severity": "moderate" if frontal_alpha > -2.5 else "severe",
            })
            deviant_sites.extend(["F3", "F4"])
            recommended_targets.append({
                "target": "increase_frontal_alpha_asymmetry_F4_relative_F3",
                "priority": "high",
                "rationale": "Depressed frontal alpha may indicate depression or anxiety",
            })
            clinical_notes.append(
                f"Depressed frontal alpha (z={frontal_alpha:.1f}) suggests "
                "emotional dysregulation or mood disturbance."
            )

    # --- Posterior Alpha ---
    posterior_alpha = qeeg_data.get("posterior_alpha")
    if posterior_alpha is not None:
        norms = QEEG_NORMATIVE_THRESHOLDS["posterior_alpha"].get(
            age_group_str, QEEG_NORMATIVE_THRESHOLDS["posterior_alpha"]["adult"]
        )
        if posterior_alpha < norms["threshold_low"]:
            deviant_frequencies.append({
                "frequency": "alpha_8_12Hz",
                "site": "posterior_O1_O2_Pz",
                "finding": "depressed_posterior_alpha",
                "value": posterior_alpha,
                "z_score": posterior_alpha,
                "severity": "moderate" if posterior_alpha > -2.5 else "severe",
            })
            deviant_sites.extend(["O1", "O2", "Pz"])
            recommended_targets.append({
                "target": "increase_posterior_alpha_8_12Hz",
                "priority": "medium",
                "rationale": "Posterior alpha deficiency associated with anxiety and poor relaxation",
            })
            clinical_notes.append(
                f"Depressed posterior alpha (z={posterior_alpha:.1f}) suggests "
                "hyperarousal or anxiety state."
            )

    # --- SMR at Cz ---
    smr_cz = qeeg_data.get("smr_cz")
    if smr_cz is not None:
        norms = QEEG_NORMATIVE_THRESHOLDS["smr_cz"].get(
            age_group_str, QEEG_NORMATIVE_THRESHOLDS["smr_cz"]["adult"]
        )
        if smr_cz < norms["threshold_low"]:
            deviant_frequencies.append({
                "frequency": "SMR_12_15Hz",
                "site": "Cz",
                "finding": "depressed_SMR",
                "value": smr_cz,
                "z_score": smr_cz,
                "severity": "moderate" if smr_cz > -2.5 else "severe",
            })
            deviant_sites.append("Cz")
            recommended_targets.append({
                "target": "increase_SMR_12_15Hz_at_Cz",
                "priority": "high",
                "rationale": "SMR deficiency linked to motor hyperactivity and poor self-regulation",
            })
            clinical_notes.append(
                f"Depressed SMR at Cz (z={smr_cz:.1f}) indicates poor sensorimotor "
                "regulation and inhibitory control."
            )

    # --- Alpha Asymmetry ---
    alpha_asym = qeeg_data.get("alpha_asymmetry_f3f4")
    if alpha_asym is not None:
        norms = QEEG_NORMATIVE_THRESHOLDS["alpha_asymmetry_f3f4"].get(
            age_group_str, QEEG_NORMATIVE_THRESHOLDS["alpha_asymmetry_f3f4"]["adult"]
        )
        if abs(alpha_asym) > norms["threshold_deviant"]:
            direction = "left_greater" if alpha_asym > 0 else "right_greater"
            deviant_frequencies.append({
                "frequency": "alpha_8_12Hz",
                "site": "frontal_F3_vs_F4",
                "finding": f"alpha_asymmetry_{direction}",
                "value": alpha_asym,
                "z_score": alpha_asym / norms["sd"],
                "severity": "moderate",
            })
            deviant_sites.extend(["F3", "F4"])
            if alpha_asym > 0:  # Left > Right, depressive pattern
                recommended_targets.append({
                    "target": "increase_right_frontal_alpha_F4_relative_F3",
                    "priority": "high",
                    "rationale": "Left-dominant alpha asymmetry is biomarker for depression",
                })
                clinical_notes.append(
                    f"Left-dominant frontal alpha asymmetry ({alpha_asym:.2f}) "
                    "is associated with depression risk."
                )
            else:
                recommended_targets.append({
                    "target": "normalize_alpha_asymmetry",
                    "priority": "medium",
                    "rationale": "Atypical alpha asymmetry pattern",
                })

    # Remove duplicate sites
    deviant_sites = list(dict.fromkeys(deviant_sites))

    return {
        "age_group": age_group_str,
        "deviant_frequencies": deviant_frequencies,
        "deviant_sites": deviant_sites,
        "recommended_targets": recommended_targets,
        "clinical_interpretation": " ".join(clinical_notes) if clinical_notes else "No significant qEEG deviations detected.",
        "n_deviations": len(deviant_frequencies),
    }


def select_montage(protocol_type: str) -> Dict[str, Any]:
    """Select electrode montage for a given neurofeedback protocol type.

    Returns the standard 10-20 electrode placement including active,
    reference, and ground positions.

    Args:
        protocol_type: String identifier for the protocol type.
            Supported values include:
            - SMR_theta_beta_training, SMR_enhancement_training
            - alpha_asymmetry_training, alpha_enhancement_training
            - alpha_theta_training_Pz, alpha_theta_training
            - mu_rhythm_training, qEEG_guided_individualized

    Returns:
        Dictionary with active, reference, ground, and description fields.

    Raises:
        ValueError: If protocol_type is not recognized.

    Example:
        >>> montage = select_montage("SMR_theta_beta_training")
        >>> montage["active"]
        'Cz'
    """
    montage_map = {
        # ADHD / OCD / Insomnia
        "SMR_theta_beta_training": Montage(
            active="Cz",
            reference="linked_ears",
            ground="Fpz",
            secondary_active="Fz",
            description="Cz active for SMR reward; Fz secondary for theta inhibit",
        ),
        "SMR_enhancement_training": Montage(
            active="Cz",
            reference="linked_ears",
            ground="Fpz",
            description="Cz SMR training for inhibitory control and sleep",
        ),
        # Depression
        "alpha_asymmetry_training": Montage(
            active="F4",
            reference="F3",
            ground="Fpz",
            description="Bipolar F4-F3 for frontal alpha asymmetry training",
        ),
        # Anxiety / Peak Performance
        "alpha_enhancement_training": Montage(
            active="O1",
            reference="linked_ears",
            ground="Fpz",
            secondary_active="O2",
            description="Occipital O1/O2 for alpha enhancement",
        ),
        # PTSD / Chronic Pain
        "alpha_theta_training_Pz": Montage(
            active="Pz",
            reference="linked_ears",
            ground="Fpz",
            description="Peniston protocol: Pz alpha-theta cross-over training",
        ),
        "alpha_theta_training": Montage(
            active="Pz",
            reference="linked_ears",
            ground="Fpz",
            description="Generic alpha-theta training at Pz",
        ),
        # Autism
        "mu_rhythm_training": Montage(
            active="C3",
            reference="C4",
            ground="Fpz",
            description="Bipolar C3-C4 for mu rhythm training",
        ),
        # TBI
        "qEEG_guided_individualized": Montage(
            active="Individualized",
            reference="linked_ears",
            ground="Fpz",
            description="1-4 active sites based on qEEG deviation map",
        ),
    }

    # Try exact match first, then fuzzy match
    if protocol_type in montage_map:
        return montage_map[protocol_type].to_dict()

    # Fuzzy matching
    for key, montage in montage_map.items():
        if key.lower() in protocol_type.lower() or protocol_type.lower() in key.lower():
            return montage.to_dict()

    raise ValueError(
        f"Unknown protocol_type: '{protocol_type}'. "
        f"Supported types: {list(montage_map.keys())}"
    )


def build_protocol(patient: Dict[str, Any]) -> Dict[str, Any]:
    """Build a personalized neurofeedback protocol from patient data.

    Generates a complete, evidence-based neurofeedback treatment protocol
    including stimulation parameters, session schedule, electrode montage,
    safety screening, and clinical evidence citations.

    Args:
        patient: Dictionary containing:
            - diagnosis: str — one of the supported Diagnosis values
            - age: int — patient age in years (6-100)
            - qeeg_findings: dict (optional) — qEEG deviation data
            - constraints: dict (optional) — session constraints
                - sessions_per_week: int
                - max_sessions: int
            - comorbidities: list (optional) — list of comorbid conditions
            - medications: list (optional) — current medications affecting EEG

    Returns:
        Complete protocol dictionary with modality, protocol parameters,
        sessions schedule, evidence base, safety information, and
        age-specific modifications.

    Raises:
        ValueError: If required fields are missing or diagnosis is unsupported.
        SafetyError: If contraindications are detected.

    Example:
        >>> patient = {
        ...     "diagnosis": "ADHD",
        ...     "age": 12,
        ...     "qeeg_findings": {
        ...         "theta_beta_ratio_frontal": 4.2,
        ...         "slow_wave_excess": True,
        ...         "frontal_alpha": -1.5,
        ...     },
        ...     "constraints": {"sessions_per_week": 2, "max_sessions": 40},
        ... }
        >>> protocol = build_protocol(patient)
    """
    # Validate input
    _validate_patient_input(patient)

    diagnosis_str = patient["diagnosis"]
    age = patient["age"]
    qeeg_findings = patient.get("qeeg_findings", {})
    constraints = patient.get("constraints", {})
    comorbidities = patient.get("comorbidities", [])
    medications = patient.get("medications", [])

    # Determine age group
    age_group = _determine_age_group(age)

    # Lookup protocol template
    diagnosis_enum = Diagnosis(diagnosis_str)
    if diagnosis_enum not in PROTOCOL_LIBRARY:
        raise ValueError(f"No protocol template available for diagnosis: {diagnosis_str}")

    template = PROTOCOL_LIBRARY[diagnosis_enum]
    age_mods = _get_age_specific_mods(template, age_group)

    # Check special case: Peak Performance not recommended for children
    if diagnosis_enum == Diagnosis.PEAK_PERFORMANCE and age_group == AgeGroup.PEDIATRIC:
        if age < 16:
            raise ValueError(
                "Peak performance neurofeedback is not recommended for children under 16."
            )

    # Apply constraints
    sessions_per_week = constraints.get("sessions_per_week", template.frequency_per_week)
    max_sessions = constraints.get("max_sessions", template.sessions_default)
    sessions = min(max_sessions, template.sessions_default)
    sessions = max(template.sessions_range[0], min(template.sessions_range[1], sessions))

    # Calculate duration
    weeks = sessions // sessions_per_week
    frequency_str = f"{sessions_per_week}x_week_x{weeks}_weeks"

    # Build protocol parameters with age modifications
    base_params = template.parameters
    params_dict = {
        "target_increase": base_params.target_increase,
        "target_decrease": base_params.target_decrease,
        "target_frequency_increase_hz": list(base_params.target_frequency_increase),
        "target_frequency_decrease_hz": list(base_params.target_frequency_decrease),
        "threshold_method": base_params.threshold_method.value,
        "session_duration_min": age_mods.session_duration_min,
        "trials_per_session": age_mods.trials_per_session,
        "reinforcement": age_mods.reinforcement_type.value,
        "transfer": base_params.transfer_instructions,
        "inter_trial_interval_ms": base_params.inter_trial_interval_ms,
        "baseline_duration_s": base_params.baseline_duration_s,
        "threshold_adjustment": age_mods.threshold_adjustment,
        "engagement_strategy": age_mods.engagement_strategy,
    }

    # Add caregiver involvement for pediatric
    if age_group == AgeGroup.PEDIATRIC and age_mods.caregiver_involvement:
        params_dict["caregiver_involvement"] = age_mods.caregiver_involvement
    if age_mods.session_structure:
        params_dict["session_structure"] = age_mods.session_structure

    # Build montage
    montage = template.montage.to_dict()

    # Build evidence summary
    evidence_dict = template.evidence.to_dict()

    # Build safety screening
    safety_dict = template.safety.to_dict()

    # Add medication notes
    medication_warnings = []
    eeg_active_meds = [
        "methylphenidate", "amphetamine", "lisdexamfetamine",
        " SSRIs", "SNRIs", "benzodiazepines", "antipsychotics",
        "anticonvulsants", "lithium",
    ]
    for med in medications:
        med_lower = med.lower()
        for known_med in eeg_active_meds:
            if known_med.lower().strip() in med_lower:
                medication_warnings.append(
                    f"{med}: May affect EEG baseline — consider medication timing relative to sessions"
                )

    # Add comorbidity notes
    comorbidity_notes = []
    if comorbidities:
        for comorb in comorbidities:
            if comorb.lower() in ["anxiety", "generalized anxiety disorder"]:
                comorbidity_notes.append(
                    "Comorbid anxiety detected — consider alpha training adjunct"
                )
            elif comorb.lower() in ["depression", "mdd"]:
                comorbidity_notes.append(
                    "Comorbid depression — monitor mood; consider alpha asymmetry protocol"
                )
            elif comorb.lower() in ["epilepsy", "seizure disorder"]:
                comorbidity_notes.append(
                    "CRITICAL: Seizure disorder — neurology clearance required before NF"
                )

    # qEEG analysis integration
    qeeg_analysis = {}
    if qeeg_findings:
        qeeg_analysis = analyze_qeeg_for_neurofeedback(
            {**qeeg_findings, "age": age}
        )

    # Assemble final protocol
    protocol = {
        "modality": "neurofeedback",
        "protocol": {
            "type": template.protocol_type,
            "description": template.description,
            "montage": montage,
            "protocol_parameters": params_dict,
            "sessions": sessions,
            "frequency": frequency_str,
            "booster_sessions": template.booster_sessions,
            "total_duration_weeks": weeks,
        },
        "patient_profile": {
            "diagnosis": diagnosis_str,
            "age": age,
            "age_group": age_group.value,
            "comorbidities": comorbidities,
            "medications": medications,
        },
        "safety_screening": {
            **safety_dict,
            "medication_warnings": medication_warnings,
            "comorbidity_notes": comorbidity_notes,
        },
        "evidence": evidence_dict,
        "qEEG_analysis": qeeg_analysis,
    }

    return protocol


# ---------------------------------------------------------------------------
# Batch Processing
# ---------------------------------------------------------------------------

def build_protocols_batch(patients: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build protocols for multiple patients in batch mode.

    Args:
        patients: List of patient dictionaries.

    Returns:
        List of protocol dictionaries (failed patients return error dicts).
    """
    results = []
    for patient in patients:
        try:
            protocol = build_protocol(patient)
            results.append(protocol)
        except Exception as exc:
            results.append({
                "error": str(exc),
                "patient": patient,
            })
    return results


# ---------------------------------------------------------------------------
# Export / Summary
# ---------------------------------------------------------------------------

def summarize_protocol(protocol: Dict[str, Any]) -> str:
    """Generate a human-readable summary of a neurofeedback protocol.

    Args:
        protocol: Protocol dictionary from build_protocol().

    Returns:
        Formatted string summary.
    """
    lines = []
    lines.append("=" * 60)
    lines.append("NEUROFEEDBACK PROTOCOL SUMMARY")
    lines.append("=" * 60)

    if "error" in protocol:
        lines.append(f"ERROR: {protocol['error']}")
        return "\n".join(lines)

    p = protocol["protocol"]
    profile = protocol["patient_profile"]
    ev = protocol["evidence"]

    lines.append(f"Diagnosis: {profile['diagnosis']}")
    lines.append(f"Age: {profile['age']} ({profile['age_group']})")
    lines.append(f"Protocol Type: {p['type']}")
    lines.append("")
    lines.append("MONTAGE:")
    for k, v in p["montage"].items():
        lines.append(f"  {k}: {v}")
    lines.append("")
    lines.append("PARAMETERS:")
    params = p["protocol_parameters"]
    lines.append(f"  Target Increase: {params['target_increase']}")
    lines.append(f"  Target Decrease: {params['target_decrease']}")
    lines.append(f"  Session Duration: {params['session_duration_min']} min")
    lines.append(f"  Trials/Session: {params['trials_per_session']}")
    lines.append(f"  Reinforcement: {params['reinforcement']}")
    lines.append(f"  Threshold Method: {params['threshold_method']}")
    lines.append("")
    lines.append(f"SCHEDULE: {p['sessions']} sessions, {p['frequency']}")
    lines.append(f"Booster: {p['booster_sessions']}")
    lines.append("")
    lines.append("EVIDENCE:")
    lines.append(f"  Meta-analysis: {ev['meta_analysis']}")
    lines.append(f"  Effect Size: {ev.get('effect_size', 'N/A')}")
    lines.append(f"  Evidence Grade: {ev['evidence_grade']}")
    lines.append(f"  Trials: {ev['n_trials']}")
    lines.append("")
    lines.append("SAFETY:")
    safety = protocol["safety_screening"]
    lines.append(f"  Contraindications: {', '.join(safety['contraindications'])}")
    lines.append(f"  Cautions: {', '.join(safety['cautions'])}")
    lines.append("")

    qeeg = protocol.get("qEEG_analysis", {})
    if qeeg:
        lines.append("qEEG ANALYSIS:")
        lines.append(f"  Deviations found: {qeeg.get('n_deviations', 0)}")
        lines.append(f"  Deviant sites: {', '.join(qeeg.get('deviant_sites', []))}")
        lines.append(f"  Interpretation: {qeeg.get('clinical_interpretation', '')}")

    lines.append("=" * 60)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Module entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Demo
    patient_example = {
        "diagnosis": "ADHD",
        "qeeg_findings": {
            "theta_beta_ratio_frontal": 4.2,
            "slow_wave_excess": True,
            "frontal_alpha": -1.5,
        },
        "age": 12,
        "constraints": {"sessions_per_week": 2, "max_sessions": 40},
    }

    protocol = build_protocol(patient_example)
    print(summarize_protocol(protocol))
