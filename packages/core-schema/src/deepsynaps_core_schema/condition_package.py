"""
Condition Package Pydantic models — schema_version 1.0.0

One ConditionPackage per condition covers all 13 clinical sections needed
to generate every downstream output: protocols, handbooks, consent docs,
home programs, monitoring rules, and report templates.

These models mirror the JSON Schema at:
  data/schemas/condition-package.schema.json
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared / reused sub-models
# ---------------------------------------------------------------------------


class AssessmentRef(BaseModel):
    """A reference to an assessment in the assessment bundle."""

    assessment_id: str
    name: str
    full_name: Optional[str] = None
    clinician_vs_patient: Optional[
        Literal[
            "Patient self-report",
            "Clinician-rated",
            "Parent/caregiver report",
            "Observer-rated",
            "Either",
        ]
    ] = None
    rationale: str
    lower_is_better: Optional[bool] = None
    admin_duration_minutes: Optional[int] = None
    access: Optional[str] = None
    population: Optional[str] = None


class PhenotypeCluster(BaseModel):
    id: str
    name: str
    description: str
    primary_modality: Optional[str] = None
    qeeg_signature: Optional[str] = None


# ---------------------------------------------------------------------------
# Section 1 — Condition Overview
# ---------------------------------------------------------------------------


class ConditionOverview(BaseModel):
    summary: str
    prevalence: str
    phenotype_clusters: list[PhenotypeCluster] = Field(default_factory=list)
    severity_levels: list[str] = Field(default_factory=list)
    population: list[str] = Field(default_factory=list)
    symptom_clusters: list[str] = Field(default_factory=list)
    highest_evidence_level: Literal["EV-A", "EV-B", "EV-C", "EV-D"]
    relevant_modalities: list[str] = Field(default_factory=list)
    neurobiology: str
    comorbidities: list[str] = Field(default_factory=list)
    differential_diagnoses: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Section 2 — Patient-Friendly Explanation
# ---------------------------------------------------------------------------


class FAQ(BaseModel):
    question: str
    answer: str


class PatientFriendlyExplanation(BaseModel):
    what_is_it: str
    how_it_affects_you: str
    treatment_options_overview: str
    what_to_expect: str
    faq: list[FAQ] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Section 3 — Medical History Requirements
# ---------------------------------------------------------------------------


class RequiredField(BaseModel):
    field: str
    reason: str
    blocks_protocol: bool = False


class SpecialPopulationIntake(BaseModel):
    population: str
    additional_requirements: list[str] = Field(default_factory=list)


class MedicalHistoryRequirements(BaseModel):
    required_fields: list[RequiredField] = Field(default_factory=list)
    clinical_interview_checklist: list[str] = Field(default_factory=list)
    rule_out_differentials: list[str] = Field(default_factory=list)
    comorbidity_screen: list[str] = Field(default_factory=list)
    prior_treatment_required: list[str] = Field(default_factory=list)
    special_population_flags: list[SpecialPopulationIntake] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Section 4 — Contraindications
# ---------------------------------------------------------------------------


class AbsoluteContraindication(BaseModel):
    condition: str
    rationale: str


class RelativeContraindication(BaseModel):
    condition: str
    rationale: str
    mitigation: str


class SpecialPopulationFlag(BaseModel):
    population: str
    flag: str


class Contraindications(BaseModel):
    absolute: list[AbsoluteContraindication] = Field(default_factory=list)
    relative: list[RelativeContraindication] = Field(default_factory=list)
    special_populations: list[SpecialPopulationFlag] = Field(default_factory=list)
    modality_specific: dict[str, list[str]] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Section 5 — Assessment Bundle
# ---------------------------------------------------------------------------


class AssessmentBundle(BaseModel):
    screening: list[AssessmentRef] = Field(default_factory=list)
    diagnostic: list[AssessmentRef] = Field(default_factory=list)
    baseline: list[AssessmentRef] = Field(default_factory=list)
    monitoring: list[AssessmentRef] = Field(default_factory=list)
    outcome: list[AssessmentRef] = Field(default_factory=list)
    neurophysiological: list[AssessmentRef] = Field(default_factory=list)
    functional: list[AssessmentRef] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Section 6 — Protocol Bundle
# ---------------------------------------------------------------------------


class BrainTargetRef(BaseModel):
    region: str
    laterality: str
    eeg_position: Optional[str] = None
    effect_direction: Optional[str] = None


class ProtocolParameters(BaseModel):
    frequency_hz: Optional[str] = None
    intensity: Optional[str] = None
    pulse_count: Optional[str] = None
    electrode_placement: Optional[str] = None
    coil_type: Optional[str] = None
    current_ma: Optional[str] = None
    current_density: Optional[str] = None
    ramp_up_seconds: Optional[int] = None
    ramp_down_seconds: Optional[int] = None
    reward_band: Optional[str] = None
    inhibit_band: Optional[str] = None
    threshold_type: Optional[str] = None
    feedback_modality: Optional[str] = None
    electrode_sites: Optional[str] = None
    additional_params: dict[str, str] = Field(default_factory=dict)


class SessionStep(BaseModel):
    order: int
    title: str
    duration_minutes: int
    detail: str


class SessionStructureDetail(BaseModel):
    sessions_per_week: int
    session_duration_minutes: int
    total_sessions: int
    total_weeks: int
    maintenance_sessions: Optional[str] = None
    steps: list[SessionStep] = Field(default_factory=list)


class ProtocolGovernance(BaseModel):
    patient_export_allowed: bool
    requires_clinician_sign_off: bool
    off_label_acknowledgement_required: bool
    dual_review_required: bool = False
    notes: Optional[str] = None


class Protocol(BaseModel):
    protocol_id: str
    name: str
    modality_slug: str
    phenotype_id: str
    device_id: Optional[str] = None
    on_label_vs_off_label: Literal["On-label", "Off-label", "Investigational"]
    evidence_grade: Literal["EV-A", "EV-B", "EV-C", "EV-D"]
    evidence_summary: str
    references: list[str] = Field(default_factory=list)
    brain_target: BrainTargetRef
    parameters: ProtocolParameters
    session_structure: SessionStructureDetail
    monitoring_required: list[str] = Field(default_factory=list)
    contraindication_check_required: bool
    adverse_event_monitoring: str
    escalation_rules: list[str] = Field(default_factory=list)
    patient_facing_allowed: Optional[bool] = None
    clinician_review_required: Optional[bool] = None
    governance: ProtocolGovernance
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Section 7 — Device Options
# ---------------------------------------------------------------------------


class DeviceOption(BaseModel):
    device_id: str
    name: str
    manufacturer: str
    modality_slug: str
    regulatory_status: Literal[
        "FDA-cleared",
        "FDA-cleared (other indication)",
        "CE-marked",
        "Investigational",
        "Research-only",
        "Not approved",
    ]
    cleared_indication: Optional[str] = None
    use_setting: Literal["Clinic", "Home", "Hybrid"]
    compatible_protocols: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Section 8 — Brain Targets
# ---------------------------------------------------------------------------


class BrainTarget(BaseModel):
    region: str
    abbreviation: str
    laterality: Literal["Left", "Right", "Bilateral", "Midline", "N/A"]
    rationale: str
    effect_direction: Optional[Literal["Excitatory", "Inhibitory", "Normalise", "N/A"]] = None
    modalities: list[str] = Field(default_factory=list)
    eeg_position_10_20: str
    brodmann_area: Optional[str] = None
    network: Optional[str] = None
    qeeg_target: Optional[str] = None
    evidence_note: Optional[str] = None


# ---------------------------------------------------------------------------
# Section 9 — Handbook Outputs
# ---------------------------------------------------------------------------


class HandbookSubsection(BaseModel):
    title: str
    content: list[str] = Field(default_factory=list)


class HandbookSectionContent(BaseModel):
    section_id: str
    title: str
    content: list[str] = Field(default_factory=list)
    subsections: list[HandbookSubsection] = Field(default_factory=list)


class HandbookDocumentFull(BaseModel):
    title: str
    audience: str
    sections: list[HandbookSectionContent] = Field(default_factory=list)


class HandbookOutputs(BaseModel):
    clinician_handbook: HandbookDocumentFull
    patient_guide: HandbookDocumentFull
    technician_sop: HandbookDocumentFull


# ---------------------------------------------------------------------------
# Section 10 — Monitoring Rules
# ---------------------------------------------------------------------------


class AssessmentScheduleEntry(BaseModel):
    assessment_id: str
    assessment_name: Optional[str] = None
    timing: str
    frequency: str
    administered_by: Literal[
        "Patient self-report",
        "Clinician-rated",
        "Technician-guided",
        "Either",
    ]


class ResponseThreshold(BaseModel):
    assessment_id: str
    assessment_name: Optional[str] = None
    lower_is_better: Optional[bool] = None
    response_threshold: str
    remission_threshold: Optional[str] = None
    non_response_threshold: str
    deterioration_threshold: str


class AdverseEventTrigger(BaseModel):
    event_type: str
    severity: Literal["Mild", "Moderate", "Severe", "Serious"]
    action: str
    suspend_treatment: bool = False


class EscalationRule(BaseModel):
    trigger: str
    action: str
    urgency: Literal["Routine", "Urgent", "Emergency"]


class AdherenceRules(BaseModel):
    minimum_session_adherence_pct: float
    consecutive_missed_sessions_flag: int
    action_on_low_adherence: str


class MonitoringRules(BaseModel):
    assessment_schedule: list[AssessmentScheduleEntry] = Field(default_factory=list)
    response_thresholds: list[ResponseThreshold] = Field(default_factory=list)
    adverse_event_triggers: list[AdverseEventTrigger] = Field(default_factory=list)
    escalation_rules: list[EscalationRule] = Field(default_factory=list)
    adherence_rules: Optional[AdherenceRules] = None


# ---------------------------------------------------------------------------
# Section 11 — Report Templates
# ---------------------------------------------------------------------------


class ReportSection(BaseModel):
    section_id: str
    title: str
    auto_populate_from: list[str] = Field(default_factory=list)
    clinician_narrative_prompt: str
    required: bool = True


class ReportTemplate(BaseModel):
    id: str
    name: str
    report_type: Literal[
        "intake-summary",
        "progress-report",
        "end-of-course-report",
        "adverse-event-report",
        "referral-letter",
        "soap-note",
    ]
    audience: Literal["Clinician", "Patient", "Referring Physician", "Insurer", "Internal"]
    frequency: str
    sections: list[ReportSection] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Section 12 — Home Program Templates
# ---------------------------------------------------------------------------


class HomeProgramTemplate(BaseModel):
    id: str
    name: str
    modality_slug: str
    device_required: Optional[str] = None
    prerequisite_clinic_sessions: Optional[int] = None
    sessions_per_week: int
    session_duration_minutes: int
    total_weeks: Optional[int] = None
    patient_instructions: list[str] = Field(default_factory=list)
    safety_checklist: list[str] = Field(default_factory=list)
    reporting_requirements: list[str] = Field(default_factory=list)
    contraindications_for_home: list[str] = Field(default_factory=list)
    evidence_note: Optional[str] = None


# ---------------------------------------------------------------------------
# Section 13 — Consent Documents
# ---------------------------------------------------------------------------


class ConsentDocument(BaseModel):
    id: str
    name: str
    document_type: Literal[
        "informed-consent",
        "contraindication-screening",
        "off-label-acknowledgement",
        "data-sharing-consent",
        "photography-consent",
        "minor-assent",
        "caregiver-authorisation",
        "research-participation",
        "home-device-agreement",
    ]
    modality_slug: Optional[str] = None
    when_required: str
    key_disclosures: list[str] = Field(default_factory=list)
    signature_required: bool
    witness_required: bool = False
    clinician_co_sign_required: bool = False
    review_frequency: Optional[str] = None


# ---------------------------------------------------------------------------
# Root — ConditionPackage
# ---------------------------------------------------------------------------

ConditionCategory = Literal[
    "Psychiatric — Mood",
    "Psychiatric — Anxiety",
    "Psychiatric — Trauma",
    "Psychiatric — OCD-Spectrum",
    "Psychiatric — Psychosis",
    "Neurodevelopmental",
    "Neurological — Movement",
    "Neurological — Epilepsy",
    "Neurological — Pain",
    "Neurological — Headache",
    "Neurological — Cognitive",
    "Neurological — Rehabilitation",
    "Sleep",
    "Addiction",
    "Sensory",
    "Other",
]


class ConditionPackageFull(BaseModel):
    """
    Master Condition Package — one instance per condition.

    A valid package must cover all 13 clinical sections needed to generate:
      - Protocol plans
      - Clinician handbooks, patient guides, and technician SOPs
      - Monitoring dashboards and escalation rules
      - Progress and outcome reports
      - Home program prescriptions
      - Consent and governance documents
    """

    schema_version: str = "1.0.0"
    id: str = Field(..., pattern=r"^CON-\d{3}$")
    slug: str = Field(..., pattern=r"^[a-z0-9-]+$")
    name: str
    category: ConditionCategory
    icd_10: list[str] = Field(default_factory=list)
    dsm_5_code: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    review_status: Literal["reviewed", "draft", "needs-update", "deprecated"] = "draft"
    reviewed_by: Optional[str] = None

    # 13 clinical sections
    condition_overview: ConditionOverview                       # Section 1
    patient_friendly_explanation: PatientFriendlyExplanation   # Section 2
    medical_history_requirements: MedicalHistoryRequirements   # Section 3
    contraindications: Contraindications                       # Section 4
    assessment_bundle: AssessmentBundle                        # Section 5
    protocol_bundle: list[Protocol] = Field(default_factory=list)  # Section 6
    device_options: list[DeviceOption] = Field(default_factory=list)   # Section 7
    brain_targets: list[BrainTarget] = Field(default_factory=list)     # Section 8
    handbook_outputs: HandbookOutputs                          # Section 9
    monitoring_rules: MonitoringRules                          # Section 10
    report_templates: list[ReportTemplate] = Field(default_factory=list)       # Section 11
    home_program_templates: list[HomeProgramTemplate] = Field(default_factory=list)  # Section 12
    consent_documents: list[ConsentDocument] = Field(default_factory=list)     # Section 13

    def governance_check(self, protocol_id: str) -> dict:
        """
        Return the governance flags for a named protocol.
        Used by the generation engine before exporting any output.
        """
        for p in self.protocol_bundle:
            if p.protocol_id == protocol_id:
                return {
                    "patient_export_allowed": p.governance.patient_export_allowed,
                    "requires_clinician_sign_off": p.governance.requires_clinician_sign_off,
                    "off_label_acknowledgement_required": p.governance.off_label_acknowledgement_required,
                    "dual_review_required": p.governance.dual_review_required,
                    "evidence_grade": p.evidence_grade,
                    "on_label": p.on_label_vs_off_label == "On-label",
                }
        raise ValueError(f"Protocol {protocol_id!r} not found in condition package {self.slug!r}")

    def required_consents_for_modality(self, modality_slug: str) -> list[ConsentDocument]:
        """Return consent documents required for a given modality."""
        return [
            c for c in self.consent_documents
            if c.modality_slug is None or c.modality_slug == modality_slug
        ]

    def blocking_history_fields(self) -> list[str]:
        """Return field names that block protocol generation when missing."""
        return [f.field for f in self.medical_history_requirements.required_fields if f.blocks_protocol]
