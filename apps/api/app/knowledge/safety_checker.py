"""
================================================================================
SAFETY & CONTRAINDICATION CHECKER — Neuromodulation Protocol Safety Gate
================================================================================

This module is the SAFETY GATE that validates every neuromodulation protocol
before it can be prescribed. It cross-checks patient data against safety rules
derived from FAERS, SIDER, OnSIDES, PharmGKB, and established clinical guidelines.

No protocol can be prescribed without passing through this checker first.

Supported Modalities:
    - tDCS (transcranial Direct Current Stimulation)
    - TMS (Transcranial Magnetic Stimulation)
    - PBM (Photobiomodulation)
    - Neurofeedback

Evidence Sources:
    - Bikson et al. (2016) — tDCS safety guidelines
    - Rossi et al. (2021) — TMS safety consensus
    - Fregni et al. (2015) — tDCS contraindications review
    - Wassermann (1998); Rossi et al. (2009) — TMS seizure risk
    - FDA MAUDE database — device adverse events
    - PharmGKB — pharmacogenomic interactions
    - SIDER/OnSIDES — drug side effects & indications
    - Nitsche et al. (2003) — tDCS safety parameters
    - Chou et al. (2022) — PBM safety guidelines
    - Hammond (2007) — Neurofeedback safety

Author: Clinical Neuromodulation Protocol Engineer
Version: 1.0.0
================================================================================
"""

from __future__ import annotations

import enum
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class Modality(enum.Enum):
    """Supported neuromodulation modalities."""

    TDCS = "tDCS"
    TMS = "TMS"
    PBM = "PBM"
    NEUROFEEDBACK = "neurofeedback"


class RiskLevel(enum.Enum):
    """Risk stratification levels."""

    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class ContraindicationSeverity(enum.Enum):
    """Severity classification for contraindications."""

    ABSOLUTE = "absolute"
    RELATIVE = "relative"


class EvidenceLevel(enum.Enum):
    """Level of clinical evidence for safety rules."""

    A_SYSTEMATIC_REVIEW = "A — Systematic Review / Meta-analysis"
    B_RANDOMIZED_TRIAL = "B — RCT / Prospective Study"
    C_EXPERT_CONSENSUS = "C — Expert Consensus / Guidelines"
    D_CASE_SERIES = "D — Case Series / Reports"
    E_THEORETICAL = "E — Theoretical / Mechanistic"


class AgeGroup(enum.Enum):
    """Patient age groups for protocol modifications."""

    NEONATE = "neonate"          # 0–28 days
    INFANT = "infant"            # 1–12 months
    TODDLER = "toddler"          # 1–2 years
    PRESCHOOL = "preschool"      # 2–5 years
    CHILD = "child"              # 6–11 years
    ADOLESCENT = "adolescent"    # 12–17 years
    ADULT = "adult"              # 18–64 years
    GERIATRIC = "geriatric"      # 65+ years


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class SafetyRule:
    """A single safety rule with evidence citation."""

    rule_id: str
    modality: Modality
    condition: str                          # What triggers this rule
    severity: ContraindicationSeverity
    message: str
    evidence_source: str
    evidence_level: EvidenceLevel
    pmid: Optional[str] = None
    notes: str = ""
    override_possible: bool = False         # Can clinician override?


@dataclass
class DrugInteraction:
    """Drug-neuromodulation interaction record."""

    drug_name: str
    modality: Modality
    interaction_type: str                   # e.g., "lowers_seizure_threshold"
    severity: RiskLevel
    mechanism: str
    evidence_source: str
    recommendation: str
    pmid: Optional[str] = None


@dataclass
class GeneticRiskFactor:
    """Genetic variant safety risk factor."""

    gene: str
    variant: str
    modality: Modality
    risk_description: str
    clinical_impact: str
    evidence_source: str
    pmid: Optional[str] = None
    recommendation: str = ""


@dataclass
class MonitoringRequirement:
    """Required monitoring for a protocol."""

    parameter: str
    frequency: str                          # e.g., "every_session", "baseline"
    rationale: str
    evidence_source: str
    threshold_for_stop: Optional[str] = None


# ---------------------------------------------------------------------------
# Safety Knowledge Base
# ---------------------------------------------------------------------------


class SafetyKnowledgeBase:
    """
    Central repository for all safety rules, drug interactions, and genetic
    risk factors. This is the authoritative knowledge base for the safety gate.
    """

    # --- tDCS Safety Rules ------------------------------------------------

    TDCS_ABSOLUTE_RULES: List[SafetyRule] = [
        SafetyRule(
            rule_id="TDCS-ABS-001",
            modality=Modality.TDCS,
            condition="intracranial_metal_implant",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Intracranial metal implants "
                "(clips, plates, shunts) present. tDCS can cause heating "
                "of ferromagnetic materials and induce unintended current "
                "pathways."
            ),
            evidence_source="Bikson et al., 2016 — tDCS safety guidelines",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="27633771",
            override_possible=False,
        ),
        SafetyRule(
            rule_id="TDCS-ABS-002",
            modality=Modality.TDCS,
            condition="cardiac_pacemaker",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Cardiac pacemaker or ICD present. "
                "Although tDCS current is small (~2 mA), theoretical risk of "
                "electromagnetic interference with pacemaker function exists."
            ),
            evidence_source="Bikson et al., 2016; Fregni et al., 2015",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="27633771",
            override_possible=False,
        ),
        SafetyRule(
            rule_id="TDCS-ABS-003",
            modality=Modality.TDCS,
            condition="active_dbs",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Active deep brain stimulator. "
                "tDCS may interact with DBS hardware and alter stimulation "
                "fields unpredictably."
            ),
            evidence_source="Bikson et al., 2016 — tDCS safety guidelines",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="27633771",
            override_possible=False,
        ),
        SafetyRule(
            rule_id="TDCS-ABS-004",
            modality=Modality.TDCS,
            condition="scalp_open_wounds",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Open wounds or broken skin at "
                "proposed electrode sites. Risk of infection, pain, and "
                "uneven current distribution."
            ),
            evidence_source="Nitsche et al., 2003; Bikson et al., 2016",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="12617500",
            override_possible=False,
        ),
        SafetyRule(
            rule_id="TDCS-ABS-005",
            modality=Modality.TDCS,
            condition="age_under_2",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Patient under 2 years of age. "
                "Cranial fontanelles not fully closed; skull thickness "
                "insufficient for safe current distribution."
            ),
            evidence_source="Bikson et al., 2016 — Pediatric tDCS guidelines",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="27633771",
            override_possible=False,
        ),
    ]

    TDCS_RELATIVE_RULES: List[SafetyRule] = [
        SafetyRule(
            rule_id="TDCS-REL-001",
            modality=Modality.TDCS,
            condition="epilepsy_seizure_disorder",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Seizure disorder / epilepsy. "
                "While some epilepsy protocols USE tDCS therapeutically, "
                "general protocols require neurologist clearance. "
                "Risk of seizure induction is very low with standard "
                "parameters (<0.01% per Nitsche et al.)."
            ),
            evidence_source="Nitsche et al., 2003; San-Juan et al., 2015",
            evidence_level=EvidenceLevel.B_RANDOMIZED_TRIAL,
            pmid="12617500",
            override_possible=True,
            notes="Epilepsy-specific tDCS protocols (e.g., cathodal M1) may be appropriate",
        ),
        SafetyRule(
            rule_id="TDCS-REL-002",
            modality=Modality.TDCS,
            condition="pregnancy",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Pregnancy. Limited evidence on "
                "tDCS safety in pregnancy; animal studies suggest no "
                "teratogenic effects at standard currents, but human "
                "data is insufficient. Risk-benefit analysis required."
            ),
            evidence_source="Bikson et al., 2016; Kuo et al., 2020",
            evidence_level=EvidenceLevel.D_CASE_SERIES,
            pmid="27633771",
            override_possible=True,
            notes="Consider only if benefits clearly outweigh risks",
        ),
        SafetyRule(
            rule_id="TDCS-REL-003",
            modality=Modality.TDCS,
            condition="skin_conditions_electrode_site",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Skin conditions (eczema, psoriasis, "
                "dermatitis) at proposed electrode sites. Risk of irritation, "
                "burning sensation, and skin breakdown under electrodes."
            ),
            evidence_source="Palm et al., 2016 — Skin reactions to tDCS",
            evidence_level=EvidenceLevel.D_CASE_SERIES,
            pmid="25823809",
            override_possible=True,
            notes="Alternative electrode sites or skin barrier may be used",
        ),
        SafetyRule(
            rule_id="TDCS-REL-004",
            modality=Modality.TDCS,
            condition="severe_skin_reaction_history",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: History of severe skin reaction "
                "to tDCS electrodes. Risk of recurrent dermatological adverse event."
            ),
            evidence_source="Palm et al., 2016",
            evidence_level=EvidenceLevel.D_CASE_SERIES,
            pmid="25823809",
            override_possible=True,
            notes="Consider alternative electrode types (rubber vs. sponge) or lower current density",
        ),
        SafetyRule(
            rule_id="TDCS-REL-005",
            modality=Modality.TDCS,
            condition="recent_stroke_under_3mo",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Stroke within past 3 months. "
                "Acute phase stroke protocols differ from chronic; excitability "
                "changes may be unpredictable. Neurologist clearance recommended."
            ),
            evidence_source="Bikson et al., 2016; Lefaucheur et al., 2017",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="27633771",
            override_possible=True,
            notes="Sub-acute stroke tDCS protocols exist but require specialist oversight",
        ),
        SafetyRule(
            rule_id="TDCS-REL-006",
            modality=Modality.TDCS,
            condition="active_substance_withdrawal",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Active substance withdrawal. "
                "Patient may have altered seizure threshold, autonomic "
                "instability, and difficulty tolerating the procedure."
            ),
            evidence_source="Clinical consensus — no direct tDCS studies",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            override_possible=True,
            notes="Stabilize withdrawal before proceeding",
        ),
    ]

    # --- TMS Safety Rules -------------------------------------------------

    TMS_ABSOLUTE_RULES: List[SafetyRule] = [
        SafetyRule(
            rule_id="TMS-ABS-001",
            modality=Modality.TMS,
            condition="cochlear_implant",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Cochlear implant. "
                "FDA-cleared contraindication — strong magnetic pulses "
                "can damage implant electronics and cause device malfunction."
            ),
            evidence_source="FDA MAUDE database; Rossi et al., 2021",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="34180796",
            override_possible=False,
        ),
        SafetyRule(
            rule_id="TMS-ABS-002",
            modality=Modality.TMS,
            condition="active_dbs",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Active deep brain stimulator. "
                "Magnetic pulses can induce currents in DBS leads, cause "
                "device heating, and trigger unintended stimulation. "
                "If DBS is OFF and cleared by neurosurgery, may proceed."
            ),
            evidence_source="Rossi et al., 2021 — TMS safety consensus",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="34180796",
            override_possible=False,
            notes="If DBS is surgically turned off and neurosurgery clears, rule may be waived",
        ),
        SafetyRule(
            rule_id="TMS-ABS-003",
            modality=Modality.TMS,
            condition="intracranial_ferromagnetic_metal",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Intracranial ferromagnetic metal "
                "objects (excluding titanium plates/screws >3cm from coil). "
                "Risk of metal displacement, heating, and induced currents."
            ),
            evidence_source="Rossi et al., 2021 — TMS safety consensus",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="34180796",
            override_possible=False,
            notes="Non-ferromagnetic titanium hardware may be OK if >3cm from coil site",
        ),
        SafetyRule(
            rule_id="TMS-ABS-004",
            modality=Modality.TMS,
            condition="cardiac_pacemaker",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Cardiac pacemaker or ICD. "
                "Magnetic field can interfere with pacemaker function; "
                "induced currents in leads may cause arrhythmia."
            ),
            evidence_source="Rossi et al., 2021",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="34180796",
            override_possible=False,
        ),
    ]

    TMS_RELATIVE_RULES: List[SafetyRule] = [
        SafetyRule(
            rule_id="TMS-REL-001",
            modality=Modality.TMS,
            condition="seizure_history",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: History of seizure. "
                "Seizure risk with TMS: ~0.01–0.1% per session with standard "
                "parameters; increases with higher frequency, intensity, "
                "and train duration. Risk is dose-dependent."
            ),
            evidence_source="Wassermann, 1998; Rossi et al., 2009, 2021",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="19889507",
            override_possible=True,
            notes="rTMS protocols under 1000 pulses/session and <5Hz have very low risk",
        ),
        SafetyRule(
            rule_id="TMS-REL-002",
            modality=Modality.TMS,
            condition="pregnancy",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Pregnancy. Magnetic field "
                "penetration to fetus is minimal (field drops with cube "
                "of distance), but data limited. Risk-benefit analysis required."
            ),
            evidence_source="Rossi et al., 2021; Eberle et al., 2020",
            evidence_level=EvidenceLevel.D_CASE_SERIES,
            pmid="34180796",
            override_possible=True,
            notes="Single-pulse and paired-pulse TMS carry lower risk than rTMS",
        ),
        SafetyRule(
            rule_id="TMS-REL-003",
            modality=Modality.TMS,
            condition="cns_active_medications",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Concurrent CNS-active medications "
                "that may lower seizure threshold. Increased seizure risk "
                "with certain antidepressants, antipsychotics, and stimulants."
            ),
            evidence_source="Rossi et al., 2021; FDA FAERS database",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="34180796",
            override_possible=True,
            notes="See check_drug_interactions() for medication-specific guidance",
        ),
        SafetyRule(
            rule_id="TMS-REL-004",
            modality=Modality.TMS,
            condition="hearing_impairment",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Hearing impairment. "
                "TMS coil produces ~120 dB clicks; earplugs REQUIRED. "
                "Pre-existing hearing loss may worsen with repeated exposure."
            ),
            evidence_source="Rossi et al., 2021; Counter et al., 1990",
            evidence_level=EvidenceLevel.B_RANDOMIZED_TRIAL,
            pmid="34180796",
            override_possible=True,
            notes="Mandatory hearing protection for all TMS patients",
        ),
        SafetyRule(
            rule_id="TMS-REL-005",
            modality=Modality.TMS,
            condition="recent_brain_surgery",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Brain surgery within past 6 months. "
                "Healing skull defect may alter current paths; craniotomy site "
                "must be evaluated for ferromagnetic clips."
            ),
            evidence_source="Rossi et al., 2021",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="34180796",
            override_possible=True,
            notes="Neurosurgical clearance required; avoid coil placement over surgical site",
        ),
    ]

    # --- PBM Safety Rules -------------------------------------------------

    PBM_ABSOLUTE_RULES: List[SafetyRule] = [
        SafetyRule(
            rule_id="PBM-ABS-001",
            modality=Modality.PBM,
            condition="active_skin_cancer_site",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Active skin cancer (melanoma, "
                "basal cell carcinoma, squamous cell carcinoma) at treatment "
                "site. Light therapy may theoretically promote tumor growth."
            ),
            evidence_source="Chou et al., 2022 — PBM safety guidelines",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="35023964",
            override_possible=False,
        ),
        SafetyRule(
            rule_id="PBM-ABS-002",
            modality=Modality.PBM,
            condition="active_photosensitivity_disorder",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Active photosensitivity disorder "
                "(porphyria, lupus erythematosus, xeroderma pigmentosum, "
                "epidermolysis bullosa). Phototoxic reactions can be severe "
                "and life-threatening."
            ),
            evidence_source="Chou et al., 2022; Bjordal et al., 2017",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="35023964",
            override_possible=False,
        ),
    ]

    PBM_RELATIVE_RULES: List[SafetyRule] = [
        SafetyRule(
            rule_id="PBM-REL-001",
            modality=Modality.PBM,
            condition="retinal_disease",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Pre-existing retinal disease "
                "(macular degeneration, retinitis pigmentosa, diabetic "
                "retinopathy). Infrared light may affect retinal tissue. "
                "Eye protection is MANDATORY."
            ),
            evidence_source="Chou et al., 2022; Rojas et al., 2011",
            evidence_level=EvidenceLevel.D_CASE_SERIES,
            pmid="35023964",
            override_possible=True,
            notes="Never shine PBM device directly into eyes; protective goggles required",
        ),
        SafetyRule(
            rule_id="PBM-REL-002",
            modality=Modality.PBM,
            condition="photosensitizing_medications",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Photosensitizing medications. "
                "Tetracyclines, fluoroquinolones, psoralens, amiodarone, "
                "and some NSAIDs increase photosensitivity. Risk of phototoxic "
                "or photoallergic reactions."
            ),
            evidence_source="Chou et al., 2022; OnSIDES database",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="35023964",
            override_possible=True,
            notes="See check_drug_interactions() for medication-specific guidance",
        ),
        SafetyRule(
            rule_id="PBM-REL-003",
            modality=Modality.PBM,
            condition="thyroid_condition_neck_pbm",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Thyroid condition when PBM "
                "applied to neck. Light may affect thyroid hormone production. "
                "Monitor thyroid function if neck PBM used."
            ),
            evidence_source="Chou et al., 2022",
            evidence_level=EvidenceLevel.E_THEORETICAL,
            pmid="35023964",
            override_possible=True,
            notes="Avoid direct thyroid exposure or use lower fluence",
        ),
        SafetyRule(
            rule_id="PBM-REL-004",
            modality=Modality.PBM,
            condition="pregnancy",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Pregnancy. Limited data on "
                "PBM safety in pregnancy; avoid abdominal application. "
                "Transcranial PBM appears safe in animal studies."
            ),
            evidence_source="Chou et al., 2022",
            evidence_level=EvidenceLevel.D_CASE_SERIES,
            pmid="35023964",
            override_possible=True,
            notes="Avoid direct abdominal/pelvic PBM during pregnancy",
        ),
    ]

    # --- Neurofeedback Safety Rules ---------------------------------------

    NEUROFEEDBACK_ABSOLUTE_RULES: List[SafetyRule] = [
        SafetyRule(
            rule_id="NFB-ABS-001",
            modality=Modality.NEUROFEEDBACK,
            condition="active_psychosis",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Active psychosis. Alpha or "
                "theta enhancement protocols may worsen psychotic symptoms, "
                "increase dissociation, or trigger hallucinations. "
                "Psychiatric stabilization required first."
            ),
            evidence_source="Hammond, 2007 — Neurofeedback safety; Surmeli et al., 2012",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="17499675",
            override_possible=False,
            notes="Some schizophrenia NF protocols exist but require specialist oversight",
        ),
        SafetyRule(
            rule_id="NFB-ABS-002",
            modality=Modality.NEUROFEEDBACK,
            condition="active_substance_intoxication",
            severity=ContraindicationSeverity.ABSOLUTE,
            message=(
                "Absolute contraindication: Active substance intoxication. "
                "Patient unable to participate meaningfully; EEG signals "
                "contaminated by substance effects; safety concerns with "
                "impaired judgment."
            ),
            evidence_source="Hammond, 2007 — Clinical consensus",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="17499675",
            override_possible=False,
        ),
    ]

    NEUROFEEDBACK_RELATIVE_RULES: List[SafetyRule] = [
        SafetyRule(
            rule_id="NFB-REL-001",
            modality=Modality.NEUROFEEDBACK,
            condition="severe_adhd_inability_to_sit_still",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Inability to sit still for "
                "required duration (common in severe pediatric ADHD). "
                "May need shortened sessions, movement-compatible systems, "
                "or alternative modalities."
            ),
            evidence_source="Janssen et al., 2016 — Pediatric NF protocols",
            evidence_level=EvidenceLevel.B_RANDOMIZED_TRIAL,
            pmid="26970064",
            override_possible=True,
            notes="Consider HEG (Hemoencephalography) or movement-tolerant amplifiers",
        ),
        SafetyRule(
            rule_id="NFB-REL-002",
            modality=Modality.NEUROFEEDBACK,
            condition="cognitive_impairment_precluding_task",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: Cognitive impairment preventing "
                "comprehension of NF task. Patient must understand the "
                "feedback mechanism to benefit. Severe dementia or "
                "intellectual disability may preclude participation."
            ),
            evidence_source="Hammond, 2007 — Clinical consensus",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
            pmid="17499675",
            override_possible=True,
            notes="Assess comprehension with practice session before starting protocol",
        ),
        SafetyRule(
            rule_id="NFB-REL-003",
            modality=Modality.NEUROFEEDBACK,
            condition="history_of_dissociation",
            severity=ContraindicationSeverity.RELATIVE,
            message=(
                "Relative contraindication: History of dissociative episodes. "
                "Alpha-theta protocols may trigger dissociation. Close "
                "monitoring required if proceeding."
            ),
            evidence_source="Hammond, 2007; White, 2008",
            evidence_level=EvidenceLevel.D_CASE_SERIES,
            pmid="17499675",
            override_possible=True,
            notes="Avoid deep-state protocols; use SMR or beta training instead",
        ),
    ]

    # --- Drug Interaction Database ----------------------------------------

    DRUG_INTERACTIONS: List[DrugInteraction] = [
        # Seizure-threshold lowering drugs (TMS / tDCS concern)
        DrugInteraction(
            drug_name="bupropion",
            modality=Modality.TMS,
            interaction_type="lowers_seizure_threshold",
            severity=RiskLevel.MODERATE,
            mechanism="Dopamine/norepinephrine reuptake inhibition; "
                      "dose-dependent seizure risk increases 4× at 450mg/day",
            evidence_source="Rossi et al., 2021; FDA FAERS",
            recommendation="Reduce TMS intensity/frequency; monitor for seizure signs",
            pmid="34180796",
        ),
        DrugInteraction(
            drug_name="clozapine",
            modality=Modality.TMS,
            interaction_type="lowers_seizure_threshold",
            severity=RiskLevel.HIGH,
            mechanism="High affinity for multiple receptors; seizure risk "
                      "dose-dependent (up to 3% at >600mg/day)",
            evidence_source="Rossi et al., 2021; Devinsky et al., 1991",
            recommendation="Consider TMS contraindicated if clozapine dose >600mg; "
                           "specialist evaluation required",
            pmid="34180796",
        ),
        DrugInteraction(
            drug_name="tramadol",
            modality=Modality.TMS,
            interaction_type="lowers_seizure_threshold",
            severity=RiskLevel.MODERATE,
            mechanism="SNRI activity; lowers seizure threshold at therapeutic doses",
            evidence_source="Rossi et al., 2021; FDA FAERS",
            recommendation="Reduce TMS train duration; use single-pulse where possible",
            pmid="34180796",
        ),
        DrugInteraction(
            drug_name="theophylline",
            modality=Modality.TMS,
            interaction_type="lowers_seizure_threshold",
            severity=RiskLevel.HIGH,
            mechanism="Adenosine receptor antagonism; well-documented TMS seizure risk",
            evidence_source="Rossi et al., 2009",
            recommendation="Avoid rTMS if theophylline level > therapeutic; "
                           "single-pulse may be safer",
            pmid="19889507",
        ),
        DrugInteraction(
            drug_name="imipramine",
            modality=Modality.TMS,
            interaction_type="lowers_seizure_threshold",
            severity=RiskLevel.MODERATE,
            mechanism="TCA with dose-dependent seizure risk; cardiotoxic",
            evidence_source="Rossi et al., 2021",
            recommendation="Use lower TMS intensity; cardiac monitoring recommended",
            pmid="34180796",
        ),
        DrugInteraction(
            drug_name="amitriptyline",
            modality=Modality.TMS,
            interaction_type="lowers_seizure_threshold",
            severity=RiskLevel.MODERATE,
            mechanism="Tricyclic antidepressant; lowers seizure threshold",
            evidence_source="Rossi et al., 2021",
            recommendation="Reduce TMS intensity; monitor for autonomic effects",
            pmid="34180796",
        ),
        DrugInteraction(
            drug_name="lithium",
            modality=Modality.TMS,
            interaction_type="potential_risk",
            severity=RiskLevel.LOW,
            mechanism="May potentiate TMS effects on cortical excitability; "
                      "rare case reports of seizures",
            evidence_source="Nahas et al., 2000; Rossi et al., 2021",
            recommendation="Monitor for signs of serotonin syndrome; "
                           "generally safe at therapeutic levels",
            pmid="34180796",
        ),
        # tDCS-specific drug interactions
        DrugInteraction(
            drug_name="bupropion",
            modality=Modality.TDCS,
            interaction_type="lowers_seizure_threshold",
            severity=RiskLevel.LOW,
            mechanism="Theoretical increased seizure risk; tDCS seizure "
                      "risk is already very low (<0.01%)",
            evidence_source="Bikson et al., 2016",
            recommendation="Standard tDCS protocols generally safe; "
                           "avoid high-intensity (>2mA) montages",
            pmid="27633771",
        ),
        DrugInteraction(
            drug_name="dextromethorphan",
            modality=Modality.TDCS,
            interaction_type="nmda_antagonist_interaction",
            severity=RiskLevel.LOW,
            mechanism="NMDA receptor antagonism may theoretically interact "
                      "with tDCS metaplasticity; limited evidence",
            evidence_source="Nitsche et al., 2003; Kuo et al., 2014",
            recommendation="No protocol adjustment needed; monitor for unusual effects",
            pmid="12617500",
        ),
        # Photosensitizing drugs (PBM concern)
        DrugInteraction(
            drug_name="tetracycline",
            modality=Modality.PBM,
            interaction_type="photosensitization",
            severity=RiskLevel.MODERATE,
            mechanism="Tetracycline accumulation in skin; UVA/visible light "
                      "causes phototoxic reactions",
            evidence_source="OnSIDES; SIDER; Chou et al., 2022",
            recommendation="Reduce PBM fluence by 50%; shorten exposure time; "
                           "monitor skin reaction",
            pmid="35023964",
        ),
        DrugInteraction(
            drug_name="doxycycline",
            modality=Modality.PBM,
            interaction_type="photosensitization",
            severity=RiskLevel.MODERATE,
            mechanism="Phototoxic reaction with 400-500nm light; "
                      "risk of exaggerated sunburn response",
            evidence_source="OnSIDES; Chou et al., 2022",
            recommendation="Reduce fluence; use longer wavelength (>800nm); "
                           "monitor skin",
            pmid="35023964",
        ),
        DrugInteraction(
            drug_name="ciprofloxacin",
            modality=Modality.PBM,
            interaction_type="photosensitization",
            severity=RiskLevel.MODERATE,
            mechanism="Fluoroquinolone phototoxicity with UV/blue light",
            evidence_source="OnSIDES; Chou et al., 2022",
            recommendation="Reduce fluence; avoid wavelengths <500nm",
            pmid="35023964",
        ),
        DrugInteraction(
            drug_name="amiodarone",
            modality=Modality.PBM,
            interaction_type="photosensitization",
            severity=RiskLevel.MODERATE,
            mechanism="Accumulates in skin; causes photosensitivity to "
                      "UVA and visible light (blue-gray skin discoloration)",
            evidence_source="OnSIDES; Chou et al., 2022",
            recommendation="Reduce fluence by 50%; monitor skin; "
                           "consider alternative modality",
            pmid="35023964",
        ),
        DrugInteraction(
            drug_name="methotrexate",
            modality=Modality.PBM,
            interaction_type="photosensitization",
            severity=RiskLevel.LOW,
            mechanism="UVA photosensitivity; theoretical PBM interaction",
            evidence_source="OnSIDES; Chou et al., 2022",
            recommendation="Standard precautions; monitor skin reaction",
            pmid="35023964",
        ),
        DrugInteraction(
            drug_name="ibuprofen",
            modality=Modality.PBM,
            interaction_type="photosensitization",
            severity=RiskLevel.LOW,
            mechanism="NSAID phototoxicity reported; rare with PBM parameters",
            evidence_source="OnSIDES",
            recommendation="No adjustment needed; standard skin monitoring",
            pmid=None,
        ),
        DrugInteraction(
            drug_name="naproxen",
            modality=Modality.PBM,
            interaction_type="photosensitization",
            severity=RiskLevel.LOW,
            mechanism="NSAID phototoxic potential at UV wavelengths; "
                      "minimal risk with NIR PBM",
            evidence_source="OnSIDES",
            recommendation="No adjustment needed for NIR PBM (>800nm)",
            pmid=None,
        ),
        DrugInteraction(
            drug_name="psoralen",
            modality=Modality.PBM,
            interaction_type="photosensitization",
            severity=RiskLevel.HIGH,
            mechanism="Potent photosensitizer used in PUVA therapy; "
                      "severe phototoxic reactions possible",
            evidence_source="OnSIDES; Chou et al., 2022",
            recommendation="CONTRAINDICATED: Avoid PBM if patient on psoralens; "
                           "consider alternative modality",
            pmid="35023964",
        ),
        DrugInteraction(
            drug_name="isotretinoin",
            modality=Modality.PBM,
            interaction_type="photosensitization",
            severity=RiskLevel.MODERATE,
            mechanism="Retinoid photosensitivity; skin fragility; "
                      "increased sunburn risk",
            evidence_source="OnSIDES; Chou et al., 2022",
            recommendation="Reduce fluence; monitor skin closely; "
                           "avoid aggressive PBM parameters",
            pmid="35023964",
        ),
    ]

    # --- Genetic Risk Factors ---------------------------------------------

    GENETIC_RISKS: List[GeneticRiskFactor] = [
        GeneticRiskFactor(
            gene="COMT",
            variant="Val158Met (Met/Met)",
            modality=Modality.TDCS,
            risk_description=(
                "COMT Met/Met carriers have higher prefrontal dopamine "
                "levels and show BETTER tDCS response. No safety issue — "
                "this is a POSITIVE predictive factor."
            ),
            clinical_impact="Positive responder marker; no safety adjustment needed",
            evidence_source="Krause et al., 2017; Nieratschker et al., 2015",
            pmid="28202718",
            recommendation="Standard tDCS protocol; expect enhanced response",
        ),
        GeneticRiskFactor(
            gene="BDNF",
            variant="Val66Met",
            modality=Modality.TDCS,
            risk_description=(
                "BDNF Val66Met carriers show reduced activity-dependent "
                "BDNF secretion. May require adjusted stimulation parameters "
                "or longer treatment course for equivalent effects."
            ),
            clinical_impact="Reduced plasticity response; may need protocol extension",
            evidence_source="Cheeran et al., 2008; Antal et al., 2010",
            pmid="19001572",
            recommendation="Consider longer session duration or additional sessions; "
                           "combine with motor learning for synergy",
        ),
        GeneticRiskFactor(
            gene="CACNA1C",
            variant="rs1006737 (A-allele)",
            modality=Modality.TDCS,
            risk_description=(
                "CACNA1C encodes Cav1.2 calcium channel. Risk allele "
                "associated with channelopathy; theoretical concern about "
                "altered neuronal excitability under tDCS."
            ),
            clinical_impact="Theoretical increased excitability; use conservative parameters",
            evidence_source="Bhat et al., 2012; Cross-Disorder Group, 2013",
            pmid="22495311",
            recommendation="Use standard (not high-intensity) tDCS; monitor for adverse effects",
        ),
        GeneticRiskFactor(
            gene="SCN1A",
            variant="Pathogenic variants",
            modality=Modality.TMS,
            risk_description=(
                "SCN1A sodium channelopathies (Dravet syndrome, GEFS+). "
                "Increased risk of seizure induction with TMS due to "
                "hyperexcitable neuronal membrane."
            ),
            clinical_impact="Elevated seizure risk with TMS; specialist evaluation required",
            evidence_source="Rossi et al., 2021; Cramer et al., 2001",
            pmid="34180796",
            recommendation="Neurology consultation mandatory; avoid high-frequency rTMS; "
                           "single-pulse TMS only with close monitoring",
        ),
        GeneticRiskFactor(
            gene="SCN2A",
            variant="Pathogenic variants",
            modality=Modality.TMS,
            risk_description=(
                "SCN2A sodium channelopathy. Altered cortical excitability "
                "may increase seizure risk with TMS."
            ),
            clinical_impact="Elevated seizure risk; conservative TMS parameters advised",
            evidence_source="Rossi et al., 2021",
            pmid="34180796",
            recommendation="Neurology consultation; single-pulse TMS preferred; "
                           "avoid rTMS >1Hz",
        ),
        GeneticRiskFactor(
            gene="HLA-B",
            variant="*1502",
            modality=Modality.TDCS,
            risk_description=(
                "HLA-B*1502 associated with carbamazepine-induced "
                "Stevens-Johnson syndrome. Relevant if tDCS + carbamazepine "
                "combination considered for epilepsy."
            ),
            clinical_impact="Pharmacogenomic interaction; not a direct tDCS risk",
            evidence_source="PharmGKB; Chung et al., 2004",
            pmid="15199411",
            recommendation="If carbamazepine used alongside tDCS, verify HLA-B*1502 status",
        ),
        GeneticRiskFactor(
            gene="CYP2D6",
            variant="Poor/Ultrarapid metabolizer",
            modality=Modality.TMS,
            risk_description=(
                "CYP2D6 metabolizer status affects many CNS-active drugs "
                "(antidepressants, antipsychotics). May alter concurrent "
                "medication levels that affect seizure threshold."
            ),
            clinical_impact="Indirect effect via medication levels; check pharmacogenomic profile",
            evidence_source="PharmGKB; Hicks et al., 2015 (CPIC guidelines)",
            pmid="26417998",
            recommendation="Verify medication levels if on CYP2D6 substrates; "
                           "adjust TMS parameters accordingly",
        ),
    ]

    # --- Monitoring Requirements by Modality ------------------------------

    MONITORING_REQUIREMENTS: Dict[Modality, List[MonitoringRequirement]] = {
        Modality.TDCS: [
            MonitoringRequirement(
                parameter="skin_sensation_and_appearance",
                frequency="every_session",
                rationale="Detect early signs of skin irritation or burn",
                evidence_source="Bikson et al., 2016",
                threshold_for_stop="Pain >5/10, erythema >2cm, blistering",
            ),
            MonitoringRequirement(
                parameter="mood_assessment",
                frequency="baseline_and_midpoint",
                rationale="Monitor for mood changes (mania induction rare but reported)",
                evidence_source="Arul-Anandam et al., 2010",
                threshold_for_stop="YMRS increase >4 points or emergence of manic symptoms",
            ),
            MonitoringRequirement(
                parameter="headache_severity",
                frequency="every_session",
                rationale="Headache most common tDCS adverse event (~12%)",
                evidence_source="Bikson et al., 2016; Minhas et al., 2010",
                threshold_for_stop="Severe headache precluding continuation",
            ),
        ],
        Modality.TMS: [
            MonitoringRequirement(
                parameter="seizure_precautions",
                frequency="every_session",
                rationale="Seizure is most serious TMS risk (~0.01-0.1% per session)",
                evidence_source="Wassermann, 1998; Rossi et al., 2021",
                threshold_for_stop="ANY seizure activity — abort session immediately",
            ),
            MonitoringRequirement(
                parameter="hearing_protection_compliance",
                frequency="every_session",
                rationale="TMS coil produces ~120 dB acoustic artifact",
                evidence_source="Counter et al., 1990; Rossi et al., 2021",
                threshold_for_stop="Patient unable to tolerate earplugs/headphones",
            ),
            MonitoringRequirement(
                parameter="motor_threshold_reassessment",
                frequency="weekly",
                rationale="MT may change over course of treatment",
                evidence_source="Rossi et al., 2021",
                threshold_for_stop="MT change >20% from baseline",
            ),
            MonitoringRequirement(
                parameter="mood_monitoring",
                frequency="every_session",
                rationale="Monitor for mood changes and suicidal ideation",
                evidence_source="Rossi et al., 2021",
                threshold_for_stop="Emergence/worsening of suicidal ideation",
            ),
        ],
        Modality.PBM: [
            MonitoringRequirement(
                parameter="skin_temperature_and_appearance",
                frequency="every_session",
                rationale="Detect thermal injury or photosensitivity reactions",
                evidence_source="Chou et al., 2022",
                threshold_for_stop="Temperature rise >2°C or any blistering/erythema",
            ),
            MonitoringRequirement(
                parameter="eye_protection_compliance",
                frequency="every_session",
                rationale="Prevent retinal exposure to therapeutic light",
                evidence_source="Chou et al., 2022; Rojas et al., 2011",
                threshold_for_stop="Patient unable to keep protective eyewear in place",
            ),
        ],
        Modality.NEUROFEEDBACK: [
            MonitoringRequirement(
                parameter="psychological_state",
                frequency="every_session",
                rationale="Monitor for adverse psychological reactions",
                evidence_source="Hammond, 2007",
                threshold_for_stop="Emergence of anxiety, dissociation, or psychotic symptoms",
            ),
            MonitoringRequirement(
                parameter="engagement_and_fatigue",
                frequency="every_session",
                rationale="Ensure patient can maintain attention for feedback",
                evidence_source="Hammond, 2007; Janssen et al., 2016",
                threshold_for_stop="Patient unable to engage after rest period",
            ),
        ],
    }

    # --- Medications that lower seizure threshold (comprehensive list) -----

    SEIZURE_THRESHOLD_DRUGS: Dict[str, Dict[str, Any]] = {
        "bupropion": {"risk_level": "moderate", "category": "antidepressant"},
        "clozapine": {"risk_level": "high", "category": "antipsychotic"},
        "tramadol": {"risk_level": "moderate", "category": "analgesic"},
        "theophylline": {"risk_level": "high", "category": "bronchodilator"},
        "imipramine": {"risk_level": "moderate", "category": "tca"},
        "amitriptyline": {"risk_level": "moderate", "category": "tca"},
        "clomipramine": {"risk_level": "moderate", "category": "tca"},
        "maprotiline": {"risk_level": "high", "category": "antidepressant"},
        "chlorpromazine": {"risk_level": "moderate", "category": "antipsychotic"},
        "olanzapine": {"risk_level": "low", "category": "antipsychotic"},
        "quetiapine": {"risk_level": "low", "category": "antipsychotic"},
        "ciprofloxacin": {"risk_level": "moderate", "category": "antibiotic"},
        "norfloxacin": {"risk_level": "moderate", "category": "antibiotic"},
        "isoniazid": {"risk_level": "moderate", "category": "antibiotic"},
        "lindane": {"risk_level": "high", "category": "antiparasitic"},
        "mefloquine": {"risk_level": "high", "category": "antimalarial"},
        "amphetamine": {"risk_level": "moderate", "category": "stimulant"},
        "methylphenidate": {"risk_level": "low", "category": "stimulant"},
        "lithium": {"risk_level": "low", "category": "mood_stabilizer"},
        "dextromethorphan": {"risk_level": "low", "category": "antitussive"},
        "ketamine": {"risk_level": "high", "category": "anesthetic"},
        "pethidine": {"risk_level": "moderate", "category": "opioid"},
        "propofol": {"risk_level": "moderate", "category": "anesthetic"},
    }

    # --- Photosensitizing drugs (comprehensive) ---------------------------

    PHOTOSENSITIZING_DRUGS: Dict[str, Dict[str, Any]] = {
        "tetracycline": {"risk_level": "moderate", "category": "antibiotic"},
        "doxycycline": {"risk_level": "moderate", "category": "antibiotic"},
        "minocycline": {"risk_level": "moderate", "category": "antibiotic"},
        "ciprofloxacin": {"risk_level": "moderate", "category": "antibiotic"},
        "norfloxacin": {"risk_level": "moderate", "category": "antibiotic"},
        "ofloxacin": {"risk_level": "moderate", "category": "antibiotic"},
        "levofloxacin": {"risk_level": "moderate", "category": "antibiotic"},
        "amiodarone": {"risk_level": "moderate", "category": "antiarrhythmic"},
        "chlorpromazine": {"risk_level": "moderate", "category": "antipsychotic"},
        "methotrexate": {"risk_level": "moderate", "category": "antimetabolite"},
        "ibuprofen": {"risk_level": "low", "category": "nsaid"},
        "naproxen": {"risk_level": "low", "category": "nsaid"},
        "piroxicam": {"risk_level": "moderate", "category": "nsaid"},
        "psoralen": {"risk_level": "high", "category": "photosensitizer"},
        "methoxsalen": {"risk_level": "high", "category": "photosensitizer"},
        "isotretinoin": {"risk_level": "moderate", "category": "retinoid"},
        "acitretin": {"risk_level": "moderate", "category": "retinoid"},
        "tretinoin": {"risk_level": "moderate", "category": "retinoid"},
        "sulfonamides": {"risk_level": "moderate", "category": "antibiotic"},
        "sulfamethoxazole": {"risk_level": "moderate", "category": "antibiotic"},
        "hydrochlorothiazide": {"risk_level": "moderate", "category": "diuretic"},
        "furosemide": {"risk_level": "low", "category": "diuretic"},
        "griseofulvin": {"risk_level": "moderate", "category": "antifungal"},
        "voriconazole": {"risk_level": "moderate", "category": "antifungal"},
    }

    @classmethod
    def get_all_rules(cls, modality: Modality) -> Tuple[List[SafetyRule], List[SafetyRule]]:
        """
        Return (absolute_rules, relative_rules) for a given modality.

        Args:
            modality: The neuromodulation modality.

        Returns:
            Tuple of (absolute_rules, relative_rules) lists.
        """
        rule_map = {
            Modality.TDCS: (cls.TDCS_ABSOLUTE_RULES, cls.TDCS_RELATIVE_RULES),
            Modality.TMS: (cls.TMS_ABSOLUTE_RULES, cls.TMS_RELATIVE_RULES),
            Modality.PBM: (cls.PBM_ABSOLUTE_RULES, cls.PBM_RELATIVE_RULES),
            Modality.NEUROFEEDBACK: (
                cls.NEUROFEEDBACK_ABSOLUTE_RULES,
                cls.NEUROFEEDBACK_RELATIVE_RULES,
            ),
        }
        if modality not in rule_map:
            raise ValueError(f"Unknown modality: {modality}")
        return rule_map[modality]


# ---------------------------------------------------------------------------
# Patient Data Extractor
# ---------------------------------------------------------------------------


class PatientDataExtractor:
    """Extract and normalize patient data for safety checking."""

    @staticmethod
    def get_age(patient: Dict[str, Any]) -> Optional[float]:
        """Extract age in years from patient dict."""
        age = patient.get("age")
        if age is not None:
            return float(age)
        dob = patient.get("date_of_birth")
        if dob:
            try:
                birth_date = datetime.strptime(str(dob), "%Y-%m-%d")
                return (datetime.now() - birth_date).days / 365.25
            except (ValueError, TypeError):
                logger.warning(f"Could not parse date_of_birth: {dob}")
        return None

    @staticmethod
    def get_age_group(patient: Dict[str, Any]) -> Optional[AgeGroup]:
        """Determine age group from patient age."""
        age = PatientDataExtractor.get_age(patient)
        if age is None:
            return None
        if age < 0.08:      # ~28 days
            return AgeGroup.NEONATE
        elif age < 1:
            return AgeGroup.INFANT
        elif age < 2:
            return AgeGroup.TODDLER
        elif age < 5:
            return AgeGroup.PRESCHOOL
        elif age < 12:
            return AgeGroup.CHILD
        elif age < 18:
            return AgeGroup.ADOLESCENT
        elif age < 65:
            return AgeGroup.ADULT
        else:
            return AgeGroup.GERIATRIC

    @staticmethod
    def has_condition(patient: Dict[str, Any], condition_key: str) -> bool:
        """
        Check if patient has a specific condition.

        Looks in both 'conditions' and 'diagnoses' keys, supports both
        string matching and boolean flags.
        """
        conditions = patient.get("conditions", {})
        diagnoses = patient.get("diagnoses", {})
        all_conditions = {**conditions, **diagnoses}

        # Direct key match with boolean True
        if condition_key in all_conditions and all_conditions[condition_key] is True:
            return True

        # Check 'other_conditions' list (exact and substring match)
        other = patient.get("other_conditions", [])
        if isinstance(other, list):
            other_lower = [c.lower() for c in other]
            if condition_key.lower() in other_lower:
                return True
            # Substring match: e.g., "shunt" matches "ventriculoperitoneal shunt"
            if any(condition_key.lower() in item for item in other_lower):
                return True

        # Substring match in condition keys
        for key, value in all_conditions.items():
            if condition_key.lower() in key.lower() and value is True:
                return True

        return False

    @staticmethod
    def get_medications(patient: Dict[str, Any]) -> List[str]:
        """Extract list of current medications (normalized to lowercase)."""
        meds = patient.get("medications", [])
        if isinstance(meds, list):
            return [m.lower().strip() for m in meds]
        return []

    @staticmethod
    def get_genetic_variants(patient: Dict[str, Any]) -> List[str]:
        """Extract list of known genetic variants."""
        variants = patient.get("genetic_variants", [])
        if isinstance(variants, list):
            return [v.upper().strip() for v in variants]
        return []

    @staticmethod
    def get_devices(patient: Dict[str, Any]) -> List[str]:
        """Extract list of implanted devices."""
        devices = patient.get("implanted_devices", [])
        device_list: List[str] = []
        if isinstance(devices, list):
            device_list = [d.lower().strip() for d in devices]

        # Also check specific device flags in conditions
        conditions = patient.get("conditions", {})
        for key, value in conditions.items():
            if "pacemaker" in key.lower() or "icd" in key.lower() or "dbs" in key.lower():
                if value is True:
                    device_list.append(key.lower())
        return device_list


# ---------------------------------------------------------------------------
# Core Safety Checker
# ---------------------------------------------------------------------------


class SafetyChecker:
    """
    Main safety gate that validates neuromodulation protocols against
    patient-specific safety rules. No protocol can be prescribed without
    passing through this checker.
    """

    def __init__(self) -> None:
        """Initialize the safety checker with the knowledge base."""
        self.kb = SafetyKnowledgeBase()
        self.extractor = PatientDataExtractor()
        self._validation_errors: List[str] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check_safety(
        self,
        patient: Dict[str, Any],
        protocol: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Check if a protocol is safe to prescribe for a given patient.

        This is the primary safety gate — every protocol must pass through
        this function before being prescribed.

        Args:
            patient: Patient data dictionary containing demographics,
                     conditions, medications, genetic variants, devices.
            protocol: Protocol dictionary containing modality, parameters,
                      electrode/coil placement, stimulation settings.

        Returns:
            Safety check result with the following structure:
            {
                "safe_to_proceed": bool,
                "absolute_contraindications": list,
                "relative_contraindications": list,
                "warnings": list,
                "required_monitoring": list,
                "modified_protocol": dict or None,
                "safety_score": float (0.0–1.0),
                "risk_level": str,
                "details": dict,
            }

        Raises:
            ValueError: If patient or protocol data is missing required fields.
        """
        self._validation_errors = []

        # Validate inputs
        self._validate_inputs(patient, protocol)
        if self._validation_errors:
            raise ValueError(
                "Invalid inputs: " + "; ".join(self._validation_errors)
            )

        modality_str = protocol.get("modality", "")
        modality = self._parse_modality(modality_str)

        # Run all safety checks
        absolute_contras: List[Dict[str, Any]] = []
        relative_contras: List[Dict[str, Any]] = []
        warnings: List[Dict[str, Any]] = []

        # 1. Check contraindications against knowledge base
        abs_rules, rel_rules = self.kb.get_all_rules(modality)

        for rule in abs_rules:
            if self._check_rule_trigger(patient, rule):
                absolute_contras.append(self._rule_to_dict(rule))

        for rule in rel_rules:
            if self._check_rule_trigger(patient, rule):
                relative_contras.append(self._rule_to_dict(rule))

        # 2. Check drug interactions
        drug_interactions = self._check_patient_medications(patient, modality)
        for di in drug_interactions:
            entry = {
                "type": "drug_interaction",
                "drug": di.drug_name,
                "interaction": di.interaction_type,
                "severity": di.severity.value,
                "mechanism": di.mechanism,
                "recommendation": di.recommendation,
                "evidence_source": di.evidence_source,
                "pmid": di.pmid,
            }
            if di.severity in (RiskLevel.HIGH,):
                relative_contras.append(entry)
            else:
                warnings.append(entry)

        # 3. Check genetic risks
        genetic_risks = self._check_genetic_risks(patient, modality)
        for gr in genetic_risks:
            entry = {
                "type": "genetic_risk",
                "gene": gr.gene,
                "variant": gr.variant,
                "risk_description": gr.risk_description,
                "clinical_impact": gr.clinical_impact,
                "recommendation": gr.recommendation,
                "evidence_source": gr.evidence_source,
                "pmid": gr.pmid,
            }
            warnings.append(entry)

        # 4. Age-specific checks
        age_warnings = self._check_age_specific_safety(patient, modality, protocol)
        warnings.extend(age_warnings)

        # 5. Protocol parameter safety checks
        param_warnings = self._check_protocol_parameters(protocol)
        warnings.extend(param_warnings)

        # 6. Determine if safe to proceed
        safe_to_proceed = len(absolute_contras) == 0

        # 7. Calculate safety score
        safety_score = self._calculate_safety_score(
            absolute_contras, relative_contras, warnings
        )

        # 8. Determine risk level
        risk_level = self._determine_risk_level(
            absolute_contras, relative_contras, warnings
        )

        # 9. Get monitoring requirements
        monitoring = self._get_monitoring_requirements(modality, patient)

        # 10. Generate modified protocol if needed
        modified_protocol = None
        if safe_to_proceed and (relative_contras or risk_level in (RiskLevel.MODERATE, RiskLevel.HIGH)):
            modified_protocol = self._generate_modified_protocol(
                patient, protocol, relative_contras, warnings
            )

        result = {
            "safe_to_proceed": safe_to_proceed,
            "absolute_contraindications": absolute_contras,
            "relative_contraindications": relative_contras,
            "warnings": warnings,
            "required_monitoring": monitoring,
            "modified_protocol": modified_protocol,
            "safety_score": round(safety_score, 4),
            "risk_level": risk_level.value,
            "details": {
                "modality": modality.value,
                "patient_age": self.extractor.get_age(patient),
                "age_group": (
                    self.extractor.get_age_group(patient).value
                    if self.extractor.get_age_group(patient)
                    else None
                ),
                "checked_at": datetime.now().isoformat(),
                "checker_version": "1.0.0",
            },
        }

        logger.info(
            f"Safety check complete: modality={modality.value}, "
            f"safe={safe_to_proceed}, score={safety_score:.3f}, "
            f"risk={risk_level.value}"
        )

        return result

    def check_drug_interactions(
        self,
        medication: str,
        modality: str,
    ) -> List[Dict[str, Any]]:
        """
        Check for known drug-neuromodulation interactions.

        Cross-references PharmGKB, FAERS, SIDER, and OnSIDES data for
        medication-specific safety concerns with each modality.

        Args:
            medication: Name of the medication (case-insensitive).
            modality: Target neuromodality ("tDCS", "TMS", "PBM", "neurofeedback").

        Returns:
            List of interaction records, each containing:
            - drug_name, interaction_type, severity, mechanism,
            - recommendation, evidence_source, pmid
        """
        med_lower = medication.lower().strip()
        modality_enum = self._parse_modality(modality)

        interactions: List[Dict[str, Any]] = []

        # Check specific interactions in knowledge base
        for di in self.kb.DRUG_INTERACTIONS:
            if di.drug_name == med_lower and di.modality == modality_enum:
                interactions.append({
                    "drug_name": di.drug_name,
                    "modality": di.modality.value,
                    "interaction_type": di.interaction_type,
                    "severity": di.severity.value,
                    "mechanism": di.mechanism,
                    "recommendation": di.recommendation,
                    "evidence_source": di.evidence_source,
                    "pmid": di.pmid,
                })

        # Check seizure threshold drugs for TMS/tDCS
        if modality_enum in (Modality.TMS, Modality.TDCS):
            if med_lower in self.kb.SEIZURE_THRESHOLD_DRUGS:
                drug_info = self.kb.SEIZURE_THRESHOLD_DRUGS[med_lower]
                # Only add if not already in interactions list
                existing = [i["drug_name"] for i in interactions]
                if med_lower not in existing:
                    interactions.append({
                        "drug_name": med_lower,
                        "modality": modality_enum.value,
                        "interaction_type": "lowers_seizure_threshold",
                        "severity": drug_info["risk_level"],
                        "mechanism": (
                            f"{drug_info['category']} medication known to "
                            f"lower seizure threshold (FAERS/PharmGKB data)"
                        ),
                        "recommendation": (
                            "Use conservative stimulation parameters; "
                            "ensure seizure precautions in place"
                        ),
                        "evidence_source": "FAERS; PharmGKB; Rossi et al., 2021",
                        "pmid": "34180796" if modality_enum == Modality.TMS else "27633771",
                    })

        # Check photosensitizing drugs for PBM
        if modality_enum == Modality.PBM:
            if med_lower in self.kb.PHOTOSENSITIZING_DRUGS:
                drug_info = self.kb.PHOTOSENSITIZING_DRUGS[med_lower]
                existing = [i["drug_name"] for i in interactions]
                if med_lower not in existing:
                    interactions.append({
                        "drug_name": med_lower,
                        "modality": "PBM",
                        "interaction_type": "photosensitization",
                        "severity": drug_info["risk_level"],
                        "mechanism": (
                            f"{drug_info['category']} with known "
                            f"photosensitivity potential (OnSIDES/SIDER data)"
                        ),
                        "recommendation": (
                            "Reduce fluence by 50%; monitor skin; "
                            "consider alternative wavelength"
                        ),
                        "evidence_source": "OnSIDES; SIDER; Chou et al., 2022",
                        "pmid": "35023964",
                    })

        return interactions

    def check_genetic_risks(
        self,
        variants: List[str],
        modality: str,
    ) -> List[Dict[str, Any]]:
        """
        Check genetic variant safety risks for a given modality.

        Args:
            variants: List of genetic variant strings (e.g., ["COMT_MET/MET", "BDNF_VAL/MET"]).
            modality: Target neuromodality ("tDCS", "TMS", "PBM", "neurofeedback").

        Returns:
            List of genetic risk records with clinical impact and recommendations.
        """
        modality_enum = self._parse_modality(modality)
        variants_upper = [v.upper().strip() for v in variants]

        risks: List[Dict[str, Any]] = []

        for gr in self.kb.GENETIC_RISKS:
            if gr.modality == modality_enum:
                # Check for gene match in variant list
                gene_match = any(gr.gene.upper() in v for v in variants_upper)
                variant_match = any(gr.variant.upper() in v for v in variants_upper)

                if gene_match or variant_match:
                    risks.append({
                        "gene": gr.gene,
                        "variant": gr.variant,
                        "modality": gr.modality.value,
                        "risk_description": gr.risk_description,
                        "clinical_impact": gr.clinical_impact,
                        "recommendation": gr.recommendation,
                        "evidence_source": gr.evidence_source,
                        "pmid": gr.pmid,
                    })

        return risks

    def generate_safety_report(
        self,
        patient: Dict[str, Any],
        protocols: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Generate a comprehensive safety report for all proposed protocols.

        Args:
            patient: Patient data dictionary.
            protocols: List of protocol dictionaries to evaluate.

        Returns:
            Comprehensive safety report with:
            - individual protocol results
            - overall risk stratification
            - consolidated monitoring plan
            - clinical recommendations
        """
        report = {
            "report_type": "comprehensive_safety_assessment",
            "generated_at": datetime.now().isoformat(),
            "checker_version": "1.0.0",
            "patient_summary": self._summarize_patient(patient),
            "protocol_results": [],
            "overall_risk_level": None,
            "overall_safe_to_proceed": True,
            "consolidated_monitoring": [],
            "clinical_recommendations": [],
        }

        all_monitoring: List[Dict[str, Any]] = []
        highest_risk = RiskLevel.LOW

        for protocol in protocols:
            protocol_name = protocol.get("name", protocol.get("protocol_id", "unnamed"))
            try:
                result = self.check_safety(patient, protocol)
                report["protocol_results"].append({
                    "protocol_name": protocol_name,
                    "result": result,
                })

                # Update overall safety
                if not result["safe_to_proceed"]:
                    report["overall_safe_to_proceed"] = False

                # Track highest risk
                protocol_risk = RiskLevel(result["risk_level"])
                if self._risk_is_higher(protocol_risk, highest_risk):
                    highest_risk = protocol_risk

                # Collect monitoring requirements
                for mon in result["required_monitoring"]:
                    if mon not in all_monitoring:
                        all_monitoring.append(mon)

            except ValueError as e:
                report["protocol_results"].append({
                    "protocol_name": protocol_name,
                    "error": str(e),
                    "safe_to_proceed": False,
                })
                report["overall_safe_to_proceed"] = False

        report["overall_risk_level"] = highest_risk.value
        report["consolidated_monitoring"] = all_monitoring
        report["clinical_recommendations"] = self._generate_recommendations(
            report["protocol_results"]
        )

        # Summary statistics
        total = len(report["protocol_results"])
        safe_count = sum(
            1 for p in report["protocol_results"]
            if p.get("result", {}).get("safe_to_proceed", False)
        )
        report["summary"] = {
            "total_protocols_evaluated": total,
            "protocols_safe_to_proceed": safe_count,
            "protocols_contraindicated": total - safe_count,
            "absolute_contraindication_count": sum(
                len(p.get("result", {}).get("absolute_contraindications", []))
                for p in report["protocol_results"]
            ),
            "relative_contraindication_count": sum(
                len(p.get("result", {}).get("relative_contraindications", []))
                for p in report["protocol_results"]
            ),
        }

        return report

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _validate_inputs(
        self, patient: Dict[str, Any], protocol: Dict[str, Any]
    ) -> None:
        """Validate that required fields are present."""
        if not isinstance(patient, dict):
            self._validation_errors.append("patient must be a dictionary")
        if not isinstance(protocol, dict):
            self._validation_errors.append("protocol must be a dictionary")
            return
        if not protocol.get("modality"):
            self._validation_errors.append("protocol['modality'] is required")

    def _parse_modality(self, modality_str: str) -> Modality:
        """Parse modality string into Modality enum."""
        modality_map = {
            "tdcs": Modality.TDCS,
            "t_dcs": Modality.TDCS,
            "transcranial_direct_current_stimulation": Modality.TDCS,
            "tms": Modality.TMS,
            "transcranial_magnetic_stimulation": Modality.TMS,
            "pbm": Modality.PBM,
            "photobiomodulation": Modality.PBM,
            "lllt": Modality.PBM,
            "neurofeedback": Modality.NEUROFEEDBACK,
            "eeg_biofeedback": Modality.NEUROFEEDBACK,
            "nf": Modality.NEUROFEEDBACK,
        }
        key = modality_str.lower().strip().replace(" ", "_")
        if key in modality_map:
            return modality_map[key]
        raise ValueError(
            f"Unknown modality: '{modality_str}'. "
            f"Supported: {[m.value for m in Modality]}"
        )

    def _check_rule_trigger(
        self,
        patient: Dict[str, Any],
        rule: SafetyRule,
    ) -> bool:
        """Check if a safety rule's condition is met by the patient."""
        condition = rule.condition
        extractor = self.extractor

        # Condition dispatch table
        condition_checks = {
            # tDCS absolute
            "intracranial_metal_implant": lambda p: (
                extractor.has_condition(p, "intracranial_metal")
                or extractor.has_condition(p, "metal_implant")
                or extractor.has_condition(p, "cranial_plates")
                or extractor.has_condition(p, "shunt")
                or any(
                    d in dev
                    for dev in extractor.get_devices(p)
                    for d in ["cranial plate", "metal clip", "shunt"]
                )
            ),
            "cardiac_pacemaker": lambda p: (
                extractor.has_condition(p, "pacemaker")
                or extractor.has_condition(p, "icd")
                or extractor.has_condition(p, "cardiac_device")
                or any(
                    d in dev
                    for dev in extractor.get_devices(p)
                    for d in ["pacemaker", "icd", "defibrillator"]
                )
            ),
            "active_dbs": lambda p: (
                extractor.has_condition(p, "dbs")
                or extractor.has_condition(p, "deep_brain_stimulator")
                or any("dbs" in dev for dev in extractor.get_devices(p))
            ),
            "scalp_open_wounds": lambda p: (
                extractor.has_condition(p, "scalp_wounds")
                or extractor.has_condition(p, "open_wounds")
                or extractor.has_condition(p, "skin_breakdown_head")
            ),
            "age_under_2": lambda p: (
                (age := extractor.get_age(p)) is not None and age < 2
            ),

            # tDCS relative
            "epilepsy_seizure_disorder": lambda p: (
                extractor.has_condition(p, "epilepsy")
                or extractor.has_condition(p, "seizure")
                or extractor.has_condition(p, "seizure_disorder")
            ),
            "pregnancy": lambda p: (
                extractor.has_condition(p, "pregnant")
                or extractor.has_condition(p, "pregnancy")
            ),
            "skin_conditions_electrode_site": lambda p: (
                extractor.has_condition(p, "eczema")
                or extractor.has_condition(p, "psoriasis")
                or extractor.has_condition(p, "dermatitis")
                or extractor.has_condition(p, "skin_condition")
            ),
            "severe_skin_reaction_history": lambda p: (
                extractor.has_condition(p, "severe_skin_reaction")
                or extractor.has_condition(p, "tdcs_skin_burn_history")
            ),
            "recent_stroke_under_3mo": lambda p: (
                extractor.has_condition(p, "recent_stroke")
                or extractor.has_condition(p, "stroke_acute")
                or extractor.has_condition(p, "stroke_under_3_months")
            ),
            "active_substance_withdrawal": lambda p: (
                extractor.has_condition(p, "substance_withdrawal")
                or extractor.has_condition(p, "alcohol_withdrawal")
                or extractor.has_condition(p, "benzodiazepine_withdrawal")
                or extractor.has_condition(p, "opioid_withdrawal")
            ),

            # TMS absolute
            "cochlear_implant": lambda p: (
                extractor.has_condition(p, "cochlear_implant")
                or any("cochlear" in dev for dev in extractor.get_devices(p))
            ),
            "intracranial_ferromagnetic_metal": lambda p: (
                extractor.has_condition(p, "ferromagnetic_implant")
                or extractor.has_condition(p, "aneurysm_clip")
                or extractor.has_condition(p, "ferromagnetic_metal")
            ),

            # TMS relative
            "seizure_history": lambda p: (
                extractor.has_condition(p, "seizure_history")
                or extractor.has_condition(p, "previous_seizure")
                or extractor.has_condition(p, "febrile_seizure_history")
            ),
            "cns_active_medications": lambda p: (
                any(
                    med in m
                    for med in self.kb.SEIZURE_THRESHOLD_DRUGS.keys()
                    for m in extractor.get_medications(p)
                )
            ),
            "hearing_impairment": lambda p: (
                extractor.has_condition(p, "hearing_loss")
                or extractor.has_condition(p, "deafness")
                or extractor.has_condition(p, "hearing_impairment")
            ),
            "recent_brain_surgery": lambda p: (
                extractor.has_condition(p, "recent_brain_surgery")
                or extractor.has_condition(p, "craniotomy")
                or extractor.has_condition(p, "brain_surgery_6mo")
            ),

            # PBM absolute
            "active_skin_cancer_site": lambda p: (
                extractor.has_condition(p, "skin_cancer")
                or extractor.has_condition(p, "melanoma")
                or extractor.has_condition(p, "basal_cell_carcinoma")
                or extractor.has_condition(p, "squamous_cell_carcinoma")
            ),
            "active_photosensitivity_disorder": lambda p: (
                extractor.has_condition(p, "porphyria")
                or extractor.has_condition(p, "lupus")
                or extractor.has_condition(p, "lupus_erythematosus")
                or extractor.has_condition(p, "xeroderma_pigmentosum")
                or extractor.has_condition(p, "epidermolysis_bullosa")
                or extractor.has_condition(p, "photosensitivity")
            ),

            # PBM relative
            "retinal_disease": lambda p: (
                extractor.has_condition(p, "retinal_disease")
                or extractor.has_condition(p, "macular_degeneration")
                or extractor.has_condition(p, "retinitis_pigmentosa")
                or extractor.has_condition(p, "diabetic_retinopathy")
            ),
            "photosensitizing_medications": lambda p: (
                any(
                    med in m
                    for med in self.kb.PHOTOSENSITIZING_DRUGS.keys()
                    for m in extractor.get_medications(p)
                )
            ),
            "thyroid_condition_neck_pbm": lambda p: (
                extractor.has_condition(p, "thyroid_disease")
                or extractor.has_condition(p, "hyperthyroidism")
                or extractor.has_condition(p, "hypothyroidism")
            ),

            # Neurofeedback absolute
            "active_psychosis": lambda p: (
                extractor.has_condition(p, "psychosis")
                or extractor.has_condition(p, "schizophrenia_active")
                or extractor.has_condition(p, "active_psychosis")
            ),
            "active_substance_intoxication": lambda p: (
                extractor.has_condition(p, "substance_intoxication")
                or extractor.has_condition(p, "alcohol_intoxication")
                or extractor.has_condition(p, "drug_intoxication")
            ),

            # Neurofeedback relative
            "severe_adhd_inability_to_sit_still": lambda p: (
                extractor.has_condition(p, "severe_adhd")
                or extractor.has_condition(p, "inability_sit_still")
            ),
            "cognitive_impairment_precluding_task": lambda p: (
                extractor.has_condition(p, "severe_dementia")
                or extractor.has_condition(p, "severe_cognitive_impairment")
                or extractor.has_condition(p, "intellectual_disability_severe")
            ),
            "history_of_dissociation": lambda p: (
                extractor.has_condition(p, "dissociation")
                or extractor.has_condition(p, "dissociative_disorder")
                or extractor.has_condition(p, "depersonalization")
            ),
        }

        if condition in condition_checks:
            return condition_checks[condition](patient)

        logger.warning(f"Unknown condition check: {condition}")
        return False

    def _check_patient_medications(
        self,
        patient: Dict[str, Any],
        modality: Modality,
    ) -> List[DrugInteraction]:
        """Check all patient medications for interactions."""
        medications = self.extractor.get_medications(patient)
        interactions: List[DrugInteraction] = []

        for med in medications:
            for di in self.kb.DRUG_INTERACTIONS:
                if di.drug_name == med and di.modality == modality:
                    interactions.append(di)

        return interactions

    def _check_genetic_risks(
        self,
        patient: Dict[str, Any],
        modality: Modality,
    ) -> List[GeneticRiskFactor]:
        """Check patient's genetic variants for modality-specific risks."""
        variants = self.extractor.get_genetic_variants(patient)
        risks: List[GeneticRiskFactor] = []

        for gr in self.kb.GENETIC_RISKS:
            if gr.modality == modality:
                gene_match = any(gr.gene.upper() in v for v in variants)
                variant_match = any(
                    gr.variant.upper().replace(" ", "") in v.replace(" ", "")
                    for v in variants
                )
                if gene_match or variant_match:
                    risks.append(gr)

        return risks

    def _check_age_specific_safety(
        self,
        patient: Dict[str, Any],
        modality: Modality,
        protocol: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Check age-specific safety considerations."""
        warnings: List[Dict[str, Any]] = []
        age_group = self.extractor.get_age_group(patient)
        age = self.extractor.get_age(patient)

        if age_group is None or age is None:
            warnings.append({
                "type": "age_unknown",
                "message": (
                    "Patient age unknown — cannot apply age-specific safety rules. "
                    "Verify age before proceeding."
                ),
                "severity": "moderate",
                "evidence_source": "Clinical standard of care",
            })
            return warnings

        # Pediatric warnings
        if age_group in (AgeGroup.TODDLER, AgeGroup.PRESCHOOL, AgeGroup.CHILD):
            if modality == Modality.TDCS:
                warnings.append({
                    "type": "pediatric_tdcs",
                    "message": (
                        f"Pediatric tDCS (age {age:.1f}y): Use reduced current "
                        f"intensity (0.5–1.0 mA), smaller electrodes, shorter "
                        f"sessions (10–15 min). Parental consent and child "
                        f"assent required."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Bikson et al., 2016; Kessler et al., 2013",
                    "pmid": "27633771",
                    "recommendation": (
                        "Reduce to 0.5–1.0 mA; use 20–25 cm² electrodes; "
                        "max 10–15 min per session"
                    ),
                })
            elif modality == Modality.TMS:
                warnings.append({
                    "type": "pediatric_tms",
                    "message": (
                        f"Pediatric TMS (age {age:.1f}y): Use age-adjusted "
                        f"motor threshold (lower MT in children). "
                        f"Seizure risk may differ from adults. "
                        f"Specialist pediatric neurophysiology input required."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Garvey et al., 2009; Rossi et al., 2021",
                    "pmid": "34180796",
                    "recommendation": (
                        "Use pediatric MT norms; start at 80% MT; "
                        "max 1200 pulses/session for children"
                    ),
                })
            elif modality == Modality.PBM:
                warnings.append({
                    "type": "pediatric_pbm",
                    "message": (
                        f"Pediatric PBM (age {age:.1f}y): Use reduced fluence. "
                        f" thinner skull may increase light penetration. "
                        f"Eye protection especially important."
                    ),
                    "severity": "low",
                    "evidence_source": "Chou et al., 2022; Henderson & Morries, 2015",
                    "pmid": "35023964",
                    "recommendation": "Reduce fluence by 25–50%; mandatory eye protection",
                })

        # Geriatric warnings
        elif age_group == AgeGroup.GERIATRIC:
            if modality == Modality.TDCS:
                warnings.append({
                    "type": "geriatric_tdcs",
                    "message": (
                        f"Geriatric tDCS (age {age:.1f}y): May need longer "
                        f"sessions for equivalent effects due to age-related "
                        f"cortical atrophy. Skin thinner — monitor for irritation."
                    ),
                    "severity": "low",
                    "evidence_source": "Fecteau et al., 2012; Peterchev et al., 2012",
                    "pmid": "23085476",
                    "recommendation": (
                        "Standard parameters generally safe; "
                        "monitor skin closely due to age-related thinning"
                    ),
                })
            elif modality == Modality.TMS:
                warnings.append({
                    "type": "geriatric_tms",
                    "message": (
                        f"Geriatric TMS (age {age:.1f}y): Motor threshold may "
                        f"be higher. Seizure risk lower than younger adults. "
                        f"Consider cognitive effects of medications."
                    ),
                    "severity": "low",
                    "evidence_source": "Rossi et al., 2021; McConnell et al., 2001",
                    "pmid": "34180796",
                    "recommendation": "May need higher intensity; lower seizure risk",
                })

        # Adolescent
        elif age_group == AgeGroup.ADOLESCENT:
            warnings.append({
                "type": "adolescent_protocol",
                "message": (
                    f"Adolescent patient (age {age:.1f}y): "
                    f"Ongoing brain development. Use conservative parameters. "
                    f"Parental consent and adolescent assent required."
                ),
                "severity": "low",
                "evidence_source": "Croarkin et al., 2020; Kessler et al., 2013",
                "pmid": "32040001",
                "recommendation": "Standard adult parameters generally acceptable; "
                                  "document parental consent",
            })

        return warnings

    def _check_protocol_parameters(
        self,
        protocol: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Check protocol parameters for safety limits."""
        warnings: List[Dict[str, Any]] = []
        modality = self._parse_modality(protocol.get("modality", ""))
        params = protocol.get("parameters", {})

        if modality == Modality.TDCS:
            current = params.get("current_ma", params.get("current", 0))
            duration = params.get("duration_min", params.get("duration", 0))
            electrode_size = params.get("electrode_size_cm2", 35)

            if current > 2000:  # > 2 mA
                warnings.append({
                    "type": "parameter_exceeds_safe_limit",
                    "message": (
                        f"tDCS current {current/1000:.1f} mA exceeds standard "
                        f"safety limit of 2.0 mA. Higher currents increase "
                        f"risk of skin burns and adverse effects."
                    ),
                    "severity": "high",
                    "evidence_source": "Bikson et al., 2016; Nitsche et al., 2003",
                    "pmid": "27633771",
                    "recommendation": "Reduce to ≤2.0 mA unless specialized protocol",
                })
            if duration > 40:
                warnings.append({
                    "type": "parameter_exceeds_safe_limit",
                    "message": (
                        f"tDCS duration {duration} min exceeds typical "
                        f"safe limit of 40 min. Extended duration increases "
                        f"risk of skin irritation and metal ion migration."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Bikson et al., 2016",
                    "pmid": "27633771",
                    "recommendation": "Limit to ≤40 min per session",
                })
            current_density = (current / 1000) / electrode_size if electrode_size > 0 else 0
            if current_density > 0.08:  # A/m² = mA/cm²
                warnings.append({
                    "type": "current_density_excessive",
                    "message": (
                        f"Current density {current_density:.3f} mA/cm² exceeds "
                        f"recommended limit of 0.08 mA/cm². Risk of skin burn."
                    ),
                    "severity": "high",
                    "evidence_source": "Bikson et al., 2016; Minhas et al., 2010",
                    "pmid": "27633771",
                    "recommendation": "Increase electrode size or reduce current",
                })

        elif modality == Modality.TMS:
            frequency = params.get("frequency_hz", 0)
            intensity_pct_mt = params.get("intensity_pct_mt", 0)
            total_pulses = params.get("total_pulses", 0)
            train_duration = params.get("train_duration_s", 0)

            if frequency > 20:
                warnings.append({
                    "type": "high_frequency_tms",
                    "message": (
                        f"TMS frequency {frequency} Hz is high. "
                        f"Seizure risk increases with frequency >10 Hz. "
                        f"Requires experienced operator and full safety setup."
                    ),
                    "severity": "high",
                    "evidence_source": "Rossi et al., 2021; Wassermann, 1998",
                    "pmid": "34180796",
                    "recommendation": "Ensure seizure rescue protocol in place; "
                                      "consider lower frequency",
                })
            elif frequency > 10:
                warnings.append({
                    "type": "moderate_frequency_tms",
                    "message": (
                        f"TMS frequency {frequency} Hz carries moderate "
                        f"seizure risk. Use with caution."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Rossi et al., 2021",
                    "pmid": "34180796",
                })

            if intensity_pct_mt > 120:
                warnings.append({
                    "type": "tms_intensity_excessive",
                    "message": (
                        f"TMS intensity {intensity_pct_mt}% MT exceeds "
                        f"recommended maximum of 120% MT."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Rossi et al., 2021",
                    "pmid": "34180796",
                    "recommendation": "Reduce to ≤120% of resting motor threshold",
                })

            if total_pulses > 3000:
                warnings.append({
                    "type": "tms_pulse_count_high",
                    "message": (
                        f"Total pulses {total_pulses} exceeds typical safety "
                        f"guideline of 3000 pulses/session."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Rossi et al., 2021",
                    "pmid": "34180796",
                    "recommendation": "Consider splitting across sessions if clinically appropriate",
                })

            if train_duration > 10 and frequency > 1:
                warnings.append({
                    "type": "long_train_duration",
                    "message": (
                        f"Train duration {train_duration}s at {frequency} Hz "
                        f"increases seizure risk."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Rossi et al., 2021",
                    "pmid": "34180796",
                    "recommendation": "Limit train duration to ≤10s or reduce frequency",
                })

        elif modality == Modality.PBM:
            wavelength = params.get("wavelength_nm", 0)
            power = params.get("power_mw", 0)
            fluence = params.get("fluence_j_cm2", 0)

            if wavelength < 600:
                warnings.append({
                    "type": "pbm_wavelength_short",
                    "message": (
                        f"PBM wavelength {wavelength} nm in visible range. "
                        f"Higher photosensitivity risk than NIR wavelengths."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Chou et al., 2022",
                    "pmid": "35023964",
                    "recommendation": "Consider NIR wavelengths (800–1100 nm) "
                                      "for transcranial application",
                })
            if power > 500:
                warnings.append({
                    "type": "pbm_power_high",
                    "message": (
                        f"PBM power {power} mW is high. Risk of thermal injury."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Chou et al., 2022",
                    "pmid": "35023964",
                    "recommendation": "Use power ≤500 mW for transcranial PBM",
                })
            if fluence > 60:
                warnings.append({
                    "type": "pbm_fluence_high",
                    "message": (
                        f"PBM fluence {fluence} J/cm² exceeds typical "
                        f"safe range (≤60 J/cm²). Risk of thermal effects."
                    ),
                    "severity": "moderate",
                    "evidence_source": "Chou et al., 2022",
                    "pmid": "35023964",
                    "recommendation": "Reduce fluence or increase treatment area",
                })

        return warnings

    def _calculate_safety_score(
        self,
        absolute_contras: List[Dict],
        relative_contras: List[Dict],
        warnings: List[Dict],
    ) -> float:
        """
        Calculate a safety score from 0.0 to 1.0.

        1.0 = completely safe, 0.0 = completely contraindicated.
        """
        if absolute_contras:
            return 0.0

        score = 1.0

        # Relative contraindications reduce score
        for rc in relative_contras:
            severity = rc.get("severity", "moderate")
            if severity == "high":
                score -= 0.15
            elif severity == "moderate":
                score -= 0.08
            else:
                score -= 0.03

        # Warnings reduce score slightly
        for w in warnings:
            severity = w.get("severity", "low")
            if severity == "high":
                score -= 0.05
            elif severity == "moderate":
                score -= 0.02
            else:
                score -= 0.01

        return max(0.0, min(1.0, score))

    def _determine_risk_level(
        self,
        absolute_contras: List[Dict],
        relative_contras: List[Dict],
        warnings: List[Dict],
    ) -> RiskLevel:
        """Determine overall risk level from contraindications and warnings."""
        if absolute_contras:
            return RiskLevel.CRITICAL

        # Count severity levels in relative contraindications.
        # Rules from the knowledge base have severity "relative" (from
        # ContraindicationSeverity.RELATIVE.value); drug interactions may
        # have "high" / "moderate" / "low".
        high_rel = sum(
            1 for rc in relative_contras if rc.get("severity") == "high"
        )
        mod_rel = sum(
            1 for rc in relative_contras
            if rc.get("severity") in ("moderate", "relative")
        )
        any_rel = len(relative_contras)
        high_warn = sum(
            1 for w in warnings if w.get("severity") == "high"
        )
        mod_warn = sum(
            1 for w in warnings if w.get("severity") == "moderate"
        )

        if high_rel >= 2 or (high_rel >= 1 and mod_rel >= 2):
            return RiskLevel.HIGH
        elif high_rel >= 1 or mod_rel >= 2 or high_warn >= 2:
            return RiskLevel.MODERATE
        elif any_rel >= 1 or mod_warn >= 1 or high_warn >= 1:
            return RiskLevel.MODERATE
        else:
            return RiskLevel.LOW

    def _get_monitoring_requirements(
        self,
        modality: Modality,
        patient: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Get monitoring requirements for a modality, potentially augmented."""
        base_monitoring = self.kb.MONITORING_REQUIREMENTS.get(modality, [])
        monitoring = [
            {
                "parameter": m.parameter,
                "frequency": m.frequency,
                "rationale": m.rationale,
                "evidence_source": m.evidence_source,
                "threshold_for_stop": m.threshold_for_stop,
            }
            for m in base_monitoring
        ]

        # Add extra monitoring for high-risk patients
        if self.extractor.has_condition(patient, "epilepsy") or \
           self.extractor.has_condition(patient, "seizure_history"):
            if modality in (Modality.TMS, Modality.TDCS):
                monitoring.append({
                    "parameter": "seizure_observation",
                    "frequency": "every_session_and_30min_post",
                    "rationale": "Elevated seizure risk — extended observation period",
                    "evidence_source": "Rossi et al., 2021; Bikson et al., 2016",
                    "threshold_for_stop": "ANY seizure or aura activity",
                })

        return monitoring

    def _generate_modified_protocol(
        self,
        patient: Dict[str, Any],
        protocol: Dict[str, Any],
        relative_contras: List[Dict],
        warnings: List[Dict],
    ) -> Optional[Dict[str, Any]]:
        """
        Generate a modified (safer) version of the protocol if needed.

        Returns None if no modifications are needed.
        """
        modality = self._parse_modality(protocol.get("modality", ""))
        modified = dict(protocol)
        modifications_applied: List[str] = []

        if modality == Modality.TDCS:
            params = dict(modified.get("parameters", {}))

            # Reduce current if patient on seizure-threshold drugs
            if any(
                rc.get("type") == "drug_interaction"
                and "seizure" in rc.get("interaction", "")
                for rc in relative_contras
            ):
                original_current = params.get("current_ma", params.get("current", 2000))
                if original_current > 1000:
                    params["current_ma"] = 1000
                    modifications_applied.append(
                        f"Reduced current from {original_current} μA to 1000 μA "
                        f"due to seizure-threshold medication"
                    )

            # Reduce duration for skin conditions
            if any(
                "skin" in rc.get("message", "").lower()
                for rc in relative_contras
            ):
                original_duration = params.get("duration_min", params.get("duration", 20))
                if original_duration > 15:
                    params["duration_min"] = 15
                    modifications_applied.append(
                        f"Reduced duration from {original_duration} to 15 min "
                        f"due to skin condition"
                    )

            # Pediatric modification
            age = self.extractor.get_age(patient)
            if age is not None and age < 18:
                params["current_ma"] = min(params.get("current_ma", 1000), 1000)
                params["duration_min"] = min(params.get("duration_min", 20), 15)
                params["electrode_size_cm2"] = 25
                modifications_applied.append(
                    "Pediatric parameters applied (≤1mA, ≤15min, 25cm² electrodes)"
                )

            if modifications_applied:
                modified["parameters"] = params
                modified["modifications"] = modifications_applied
                return modified

        elif modality == Modality.TMS:
            params = dict(modified.get("parameters", {}))

            # Reduce frequency for seizure risk
            if any(
                "seizure" in rc.get("message", "").lower()
                for rc in relative_contras
            ):
                original_freq = params.get("frequency_hz", 10)
                if original_freq > 5:
                    params["frequency_hz"] = min(original_freq, 5)
                    modifications_applied.append(
                        f"Reduced frequency from {original_freq} Hz to "
                        f"{params['frequency_hz']} Hz due to seizure risk"
                    )

            # Reduce intensity for medication interactions
            if any(
                rc.get("type") == "drug_interaction"
                for rc in relative_contras
            ):
                original_intensity = params.get("intensity_pct_mt", 120)
                if original_intensity > 100:
                    params["intensity_pct_mt"] = 100
                    modifications_applied.append(
                        f"Reduced intensity from {original_intensity}% to 100% MT "
                        f"due to medication interaction"
                    )

            # Reduce pulses for hearing impairment
            if any(
                "hearing" in rc.get("message", "").lower()
                for rc in relative_contras
            ):
                original_pulses = params.get("total_pulses", 1500)
                if original_pulses > 1000:
                    params["total_pulses"] = 1000
                    modifications_applied.append(
                        f"Reduced pulse count from {original_pulses} to 1000 "
                        f"to minimize noise exposure"
                    )

            if modifications_applied:
                modified["parameters"] = params
                modified["modifications"] = modifications_applied
                return modified

        elif modality == Modality.PBM:
            params = dict(modified.get("parameters", {}))

            # Reduce fluence for photosensitizing drugs
            if any(
                rc.get("type") == "drug_interaction"
                and "photo" in rc.get("interaction", "")
                for rc in relative_contras
            ):
                original_fluence = params.get("fluence_j_cm2", 30)
                params["fluence_j_cm2"] = original_fluence * 0.5
                modifications_applied.append(
                    f"Reduced fluence from {original_fluence} to "
                    f"{params['fluence_j_cm2']:.1f} J/cm² due to "
                    f"photosensitizing medication"
                )

            # Adjust wavelength for retinal disease
            if any(
                "retinal" in rc.get("message", "").lower()
                for rc in relative_contras
            ):
                original_wavelength = params.get("wavelength_nm", 810)
                if original_wavelength < 800:
                    params["wavelength_nm"] = 1064
                    modifications_applied.append(
                        f"Shifted wavelength from {original_wavelength} nm to "
                        f"1064 nm to reduce retinal hazard"
                    )

            if modifications_applied:
                modified["parameters"] = params
                modified["modifications"] = modifications_applied
                return modified

        return None if not modifications_applied else modified

    def _rule_to_dict(self, rule: SafetyRule) -> Dict[str, Any]:
        """Convert a SafetyRule to a serializable dictionary."""
        return {
            "rule_id": rule.rule_id,
            "modality": rule.modality.value,
            "condition": rule.condition,
            "severity": rule.severity.value,
            "message": rule.message,
            "evidence_source": rule.evidence_source,
            "evidence_level": rule.evidence_level.value,
            "pmid": rule.pmid,
            "override_possible": rule.override_possible,
            "notes": rule.notes,
        }

    def _risk_is_higher(self, a: RiskLevel, b: RiskLevel) -> bool:
        """Check if risk level a is higher than b."""
        order = {
            RiskLevel.LOW: 0,
            RiskLevel.MODERATE: 1,
            RiskLevel.HIGH: 2,
            RiskLevel.CRITICAL: 3,
        }
        return order.get(a, 0) > order.get(b, 0)

    def _summarize_patient(self, patient: Dict[str, Any]) -> Dict[str, Any]:
        """Create a de-identified patient summary for the report."""
        age = self.extractor.get_age(patient)
        age_group = self.extractor.get_age_group(patient)

        # List active conditions (without PII)
        conditions = patient.get("conditions", {})
        active_conditions = [
            k for k, v in conditions.items()
            if v is True
        ]
        diagnoses = patient.get("diagnoses", {})
        active_diagnoses = [
            k for k, v in diagnoses.items()
            if v is True
        ]

        return {
            "age_years": round(age, 1) if age else None,
            "age_group": age_group.value if age_group else None,
            "sex": patient.get("sex"),
            "active_condition_count": len(active_conditions) + len(active_diagnoses),
            "condition_categories": list(set(active_conditions + active_diagnoses)),
            "medication_count": len(self.extractor.get_medications(patient)),
            "genetic_variant_count": len(self.extractor.get_genetic_variants(patient)),
            "implanted_device_count": len(self.extractor.get_devices(patient)),
        }

    def _generate_recommendations(
        self,
        protocol_results: List[Dict[str, Any]],
    ) -> List[str]:
        """Generate clinical recommendations from safety results."""
        recommendations: List[str] = []

        has_absolute = any(
            len(p.get("result", {}).get("absolute_contraindications", [])) > 0
            for p in protocol_results
            if "result" in p
        )

        if has_absolute:
            recommendations.append(
                "ABSOLUTE CONTRAINDICATIONS detected — do NOT proceed "
                "without specialist clearance and documentation of risk acceptance."
            )

        # Check for common patterns
        seizure_risk_protocols = [
            p for p in protocol_results
            if "result" in p
            and any(
                "seizure" in rc.get("message", "").lower()
                for rc in p["result"].get("relative_contraindications", [])
            )
        ]
        if seizure_risk_protocols:
            recommendations.append(
                "Seizure risk identified — ensure rescue medications "
                "(benzodiazepines) available; train staff on seizure first aid."
            )

        drug_interaction_protocols = [
            p for p in protocol_results
            if "result" in p
            and any(
                rc.get("type") == "drug_interaction"
                for rc in p["result"].get("relative_contraindications", [])
            )
        ]
        if drug_interaction_protocols:
            recommendations.append(
                "Drug interactions detected — consider medication review "
                "with prescriber; document decision to continue."
            )

        if not has_absolute:
            safe_count = sum(
                1 for p in protocol_results
                if p.get("result", {}).get("safe_to_proceed", False)
            )
            if safe_count == len(protocol_results):
                recommendations.append(
                    "All protocols pass safety screening. Proceed with "
                    "standard monitoring."
                )
            else:
                recommendations.append(
                    f"{safe_count}/{len(protocol_results)} protocols safe. "
                    "Review contraindicated protocols before proceeding."
                )

        return recommendations


# ---------------------------------------------------------------------------
# Convenience functions (module-level API)
# ---------------------------------------------------------------------------


def check_safety(patient: Dict[str, Any], protocol: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convenience wrapper for SafetyChecker.check_safety().

    Primary safety gate — every protocol must pass through this function
    before being prescribed.

    Args:
        patient: Patient data dictionary.
        protocol: Protocol dictionary.

    Returns:
        Safety check result dictionary.
    """
    checker = SafetyChecker()
    return checker.check_safety(patient, protocol)


def check_drug_interactions(medication: str, modality: str) -> List[Dict[str, Any]]:
    """
    Convenience wrapper for SafetyChecker.check_drug_interactions().

    Check for known drug-neuromodulation interactions.

    Args:
        medication: Medication name.
        modality: Neuromodulation modality.

    Returns:
        List of interaction records.
    """
    checker = SafetyChecker()
    return checker.check_drug_interactions(medication, modality)


def check_genetic_risks(variants: List[str], modality: str) -> List[Dict[str, Any]]:
    """
    Convenience wrapper for SafetyChecker.check_genetic_risks().

    Check genetic variant safety risks.

    Args:
        variants: List of genetic variant strings.
        modality: Neuromodulation modality.

    Returns:
        List of genetic risk records.
    """
    checker = SafetyChecker()
    return checker.check_genetic_risks(variants, modality)


def generate_safety_report(
    patient: Dict[str, Any],
    protocols: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Convenience wrapper for SafetyChecker.generate_safety_report().

    Generate comprehensive safety report for multiple protocols.

    Args:
        patient: Patient data dictionary.
        protocols: List of protocol dictionaries.

    Returns:
        Comprehensive safety report.
    """
    checker = SafetyChecker()
    return checker.generate_safety_report(patient, protocols)


# ---------------------------------------------------------------------------
# JSON export for integration
# ---------------------------------------------------------------------------


def export_safety_rules_to_json(output_path: str) -> None:
    """
    Export all safety rules to JSON for external integration.

    Args:
        output_path: Path to write the JSON file.
    """
    kb = SafetyKnowledgeBase()
    all_rules = {
        "tDCS": {
            "absolute": [rule.__dict__ for rule in kb.TDCS_ABSOLUTE_RULES],
            "relative": [rule.__dict__ for rule in kb.TDCS_RELATIVE_RULES],
        },
        "TMS": {
            "absolute": [rule.__dict__ for rule in kb.TMS_ABSOLUTE_RULES],
            "relative": [rule.__dict__ for rule in kb.TMS_RELATIVE_RULES],
        },
        "PBM": {
            "absolute": [rule.__dict__ for rule in kb.PBM_ABSOLUTE_RULES],
            "relative": [rule.__dict__ for rule in kb.PBM_RELATIVE_RULES],
        },
        "Neurofeedback": {
            "absolute": [rule.__dict__ for rule in kb.NEUROFEEDBACK_ABSOLUTE_RULES],
            "relative": [rule.__dict__ for rule in kb.NEUROFEEDBACK_RELATIVE_RULES],
        },
    }

    # Convert enums to strings
    def serialize(obj: Any) -> Any:
        if isinstance(obj, enum.Enum):
            return obj.value
        raise TypeError(f"Cannot serialize {type(obj)}")

    with open(output_path, "w") as f:
        json.dump(all_rules, f, indent=2, default=serialize)

    logger.info(f"Safety rules exported to {output_path}")


# ---------------------------------------------------------------------------
# Module execution
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s — %(name)s — %(levelname)s — %(message)s",
    )

    # Demo: Safety check a sample patient against a tDCS protocol
    demo_patient = {
        "age": 45,
        "sex": "F",
        "conditions": {
            "depression": True,
            "anxiety": True,
        },
        "diagnoses": {},
        "medications": ["sertraline", "bupropion"],
        "genetic_variants": ["COMT_MET/MET"],
        "implanted_devices": [],
        "other_conditions": [],
    }

    demo_protocol = {
        "protocol_id": "DEP-001",
        "name": "tDCS for Depression — F3/Fp2 montage",
        "modality": "tDCS",
        "parameters": {
            "current_ma": 2000,
            "duration_min": 20,
            "electrode_size_cm2": 35,
            "anode": "F3",
            "cathode": "Fp2",
        },
        "target": "dorsolateral_prefrontal_cortex",
        "indication": "major_depressive_disorder",
    }

    result = check_safety(demo_patient, demo_protocol)
    print("=" * 60)
    print("SAFETY CHECK RESULT — Demo Patient")
    print("=" * 60)
    print(f"Safe to proceed: {result['safe_to_proceed']}")
    print(f"Safety score: {result['safety_score']}")
    print(f"Risk level: {result['risk_level']}")
    print(f"Absolute contraindications: {len(result['absolute_contraindications'])}")
    print(f"Relative contraindications: {len(result['relative_contraindications'])}")
    print(f"Warnings: {len(result['warnings'])}")

    if result["relative_contraindications"]:
        print("\nRelative Contraindications:")
        for rc in result["relative_contraindications"]:
            print(f"  - [{rc.get('rule_id', 'N/A')}] {rc['message'][:100]}...")

    if result["warnings"]:
        print("\nWarnings:")
        for w in result["warnings"]:
            print(f"  - {w.get('type')}: {w.get('message', '')[:100]}...")

    if result["modified_protocol"]:
        print("\nModified Protocol Generated:")
        print(f"  Modifications: {result['modified_protocol'].get('modifications', [])}")
