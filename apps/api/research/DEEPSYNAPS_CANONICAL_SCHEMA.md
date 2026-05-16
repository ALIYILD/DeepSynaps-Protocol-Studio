# DeepSynaps Canonical Clinical Schema (DCCS)

> **Version:** 1.0.0 | **Status:** Canonical -- All 73 external databases map INTO this schema
> **Owner:** Clinical Data Architecture Team | **Last Updated:** 2025-01-28

---

## 1. Design Philosophy

The DeepSynaps Canonical Clinical Schema (DCCS) is the **single type-safe, clinically-informed data model** that normalizes all external database records into one unified graph. DeepSynaps owns this schema. Every upstream adapter transforms into DCCS entities at the ingestion boundary. No external schema leaks past the adapter layer.

### 1.1 Core Principles

| Principle | Enforcement |
|-----------|-------------|
| **Canonical ownership** | DCCS entity names, field semantics, type constraints defined by DeepSynaps only |
| **No PHI in canonical IDs** | `patient_id` is a synthetic UUID; no MRNs, SSNs, or birth dates cross the boundary |
| **Age bands, not dates** | Demographics use coarse bands ("18-25", "26-35") to prevent re-identification |
| **Every clinical claim carries provenance** | `ProvenanceRecord` on every entity traces upstream DB, version, adapter, license |
| **Every clinical output carries confidence** | `ConfidenceScore` on every entity quantifies data quality, evidence strength, uncertainty |
| **Research-only isolation** | Every entity has a `research_only` flag; research-phase data never contaminates clinical pathways |
| **Evidence-grade annotations** | All clinical claims reference `EvidenceCitation` records with A/B/C/D grading |

### 1.2 Ingestion Contract

```
External Database (any of 73 sources)
      |
      v
  [ADAPTER / ETL JOB]  --- normalizes, validates, enriches
      |
      v
  [DCCS ENTITY INSTANCE] --- writes to clinical graph
      |
      v
  [ProvenanceRecord + ConfidenceScore] --- attached atomically
```

---

## 2. Entity-Relationship Overview

### 2.1 Entity Graph

```
                           +------------------+
                           | ClinicalPatient  |
                           | (root entity)    |
                           +--------+---------+
                                    |
     +----------+----------+--------+--------+----------+----------+--------+
     |          |          |         |        |          |          |        |
     v          v          v         v        v          v          v        v
 +--------+ +---------+ +------+ +-------+ +------+ +------+ +------+ +-------+
 |Interven| |Medication| |Bio-  | | qEEG  | | MRI  | |Wear- | |Genetic| | Risk |
 | tion   | | Profile  | |marker| |Snapshot| |Session| |able  | |Profile| |Signal|
 +----+---+ +----+-----+ +--+---+ +--+----+ +--+---+ +--+---+ +------+ +--+----+
      |          |          |         |        |        |
      v          v          v         v        v        v
 +---------+ +---------+ +------+ +-------+ +------+ +------+
 | Outcome | | Protocol| |Deep- | |Digital| |Deep- | |Adverse|
 | Measure | | Reference |Twin | |Pheno- | |Twin  | | Event |
 | Session | |  Device   |Syn-  | | type  | |Synthesis| |       |
 +----+----+ +----+----+ |thesis| +------+ +------+ +------+
      |          |       +--+---+                        |
      |          |          |                             |
      v          v          v                             v
 +---------+ +---------+ +------+                   +---------+
 |Evidence | |Evidence | |Evidence|                  |Evidence |
 |Citation | |Citation | |Citation|                  |Citation |
 +---------+ +---------+ +------+                   +---------+
      ^          ^          ^                             ^
      |          |          |                             |
      +----------+----------+-------------+---------------+
                                            |
                                     +------+------+
                                     | Provenance  |
                                     |  Record     |
                                     +-------------+
```

### 2.2 Cardinality Summary

| Parent | Child | Cardinality |
|--------|-------|-------------|
| ClinicalPatient | Intervention | 1:N |
| ClinicalPatient | MedicationProfile | 1:N |
| ClinicalPatient | BiomarkerReading | 1:N |
| ClinicalPatient | qEEGSnapshot | 1:N |
| ClinicalPatient | MRISession | 1:N |
| ClinicalPatient | WearableStream | 1:N |
| ClinicalPatient | GeneticProfile | 0:1 |
| ClinicalPatient | DigitalPhenotype | 0:1 |
| ClinicalPatient | RiskSignal | 1:N |
| ClinicalPatient | DeepTwinSynthesis | 1:N |
| ClinicalPatient | Assessment | 1:N |
| Intervention | Session | 1:N |
| Intervention | OutcomeMeasure | 1:N |
| Intervention | DeepTwinCorrelation | 1:N |
| qEEGSnapshot | EEGDeviation | 1:N |
| MRISession | MRIDeviation | 1:N |
| MedicationProfile | AdverseEvent | 1:N |
| MedicationProfile | PGxInteraction | 1:N |
| DeepTwinSynthesis | RankedHypothesis | 1:N |
| DeepTwinSynthesis | SynthesisInput | 1:N |
| DeepTwinSynthesis | SynthesisOutput | 1:N |

---

## 3. Cross-Cutting Types

Embedded in every clinical entity. Not standalone tables -- composite value objects.

### 3.1 ProvenanceRecord

```python
ProvenanceRecord {
  source_databases: [string]           # e.g. ["drugbank", "rxnorm"]
  source_versions: { db -> version }   # e.g. {"drugbank": "5.1.12"}
  ingestion_date: datetime
  last_updated: datetime
  ingestion_pipeline: string           # e.g. "drugbank_adapter_v3"
  ingestion_run_id: UUID?              # ETL run for batch tracing
  license: string                      # e.g. "CC-BY-NC-4.0", "public_domain"
  attribution_required: boolean
  attribution_text: string?
  confidence_tier: "validated" | "peer_reviewed" | "preliminary" | "research_only"
  data_steward: string?                # Team responsible
  quality_flags: [string]              # e.g. ["age_band_imputed"]
}
```

### 3.2 ConfidenceScore

```python
ConfidenceScore {
  overall: float                      # 0.0 -- 1.0 composite
  data_quality: float                # Completeness, recency
  evidence_strength: float            # Grade A-D mapped to 0-1
  sample_size: float                  # Normalized: n / (n + 100)
  conflicting_evidence: boolean
  conflicting_evidence_summary: string?
  research_only_components: [string]  # Which inputs are research-only
  uncertainty_description: string     # Human-readable uncertainty
  computed_at: datetime
  score_version: string               # e.g. "confidence_v2.1"
}
```

**Evidence-grade to evidence_strength mapping:**

| Grade | Definition | Strength |
|-------|-----------|----------|
| A | Meta-analysis or multiple RCTs | 0.85 -- 1.00 |
| B | Single RCT or high-quality cohort | 0.60 -- 0.84 |
| C | Observational or case-control | 0.30 -- 0.59 |
| D | Expert opinion or preclinical | 0.00 -- 0.29 |

### 3.3 EvidenceCitation

```python
EvidenceCitation {
  citation_id: UUID
  source_database: "PubMed" | "Cochrane" | "PharmGKB" | "ClinVar"
                 | "ClinicalTrials.gov" | "NICE" | "Internal"
  external_id: string                # PMID, DOI, NCT ID
  title: string
  authors: [string]
  journal: string?
  year: int
  doi: string?
  evidence_grade: "A" | "B" | "C" | "D"
  study_type: "meta_analysis" | "RCT" | "cohort" | "case_control"
            | "observational" | "expert_opinion" | "preclinical" | "systematic_review"
  modalities: [string]
  conditions: [string]
  interventions: [string]
  n_subjects: int?
  effect_size: float?
  p_value: float?
  relevance_to_entity: string         # How this evidence relates
  relevance_score: float             # DeepSynaps computed (0-1)
  decay_status: "current" | "review_recommended" | "outdated"
  decay_date: datetime?
  provenance: ProvenanceRecord
}
```

### 3.4 BrainRegionTarget

```python
BrainRegionTarget {
  target_id: UUID
  atlas: "AAL" | "AAL3" | "FreeSurfer" | "Schaefer_100" | "Schaefer_200"
       | "Schaefer_400" | "Schaefer_1000" | "HCP-MMP1" | "Brainnetome"
       | "Juelich" | "Brodmann" | "custom"
  region_id: string
  region_name: string
  hemisphere: "L" | "R" | "bilateral" | "midline"
  mni_x: float?; mni_y: float?; mni_z: float?
  volume_mm3: float?
  associated_function: string?         # e.g. "executive_control"
  stimulation_type: "excitatory" | "inhibitory" | "modulatory" | "not_applicable"
  targeting_method: "neuronavigation" | "fMRI_guided" | "EEG_guided" | "10-20_system"
                  | "image_guided" | "landmark_based"
  evidence_for_target: [EvidenceCitation]
}
```

---

## 4. Entity: ClinicalPatient

Root entity. All clinical data belongs to exactly one patient. No direct PHI stored.

```python
ClinicalPatient {
  patient_id: UUID                    # DeepSynaps synthetic canonical ID
  clinic_id: UUID                     # Multi-tenancy
  tenant_id: string                   # e.g. "neuroclinic_nyc_001"

  demographic_profile: {
    age_band: "18-25" | "26-35" | "36-50" | "51-65" | "65+"
    biological_sex: "M" | "F" | "unknown"
    years_since_onset: float?          # If applicable
    primary_condition_category: string?  # ICD-10 chapter, e.g. "F32-F33"
    secondary_condition_categories: [string]?
    handedness: "R" | "L" | "ambidextrous" | "unknown"?
    education_years: int?              # 0-25
  }

  assessments: [Assessment]
  interventions: [Intervention]
  medications: [MedicationProfile]
  biomarkers: [BiomarkerReading]
  genetic_profile: GeneticProfile?
  qeeg_snapshots: [qEEGSnapshot]
  mri_sessions: [MRISession]
  wearable_streams: [WearableStream]
  digital_phenotype: DigitalPhenotype?
  risk_signals: [RiskSignal]
  deeptwin_syntheses: [DeepTwinSynthesis]

  provenance: ProvenanceRecord
  created_at: datetime
  updated_at: datetime
  is_active: boolean                   # Soft-delete
}
```

**Constraints:** `patient_id` UUID v4 immutable; `age_band` strict enum (no free text); `primary_condition_category` ICD-10 3-char chapter prefix only.

---

## 5. Entity: Intervention

Neuromodulation, pharmacological, psychotherapeutic, and lifestyle interventions.

```python
Intervention {
  intervention_id: UUID
  patient_id: UUID
  clinic_id: UUID

  modality: "TMS" | "rTMS" | "TBS" | "tDCS" | "tACS" | "tRNS"
          | "taVNS" | "TPS" | "PBM" | "ECT" | "DBS"
          | "neurofeedback" | "qEEG_informed" | "MRI_informed"
          | "medication" | "psychotherapy" | "CBT" | "DBT" | "ACT"
          | "physical_therapy" | "lifestyle" | "combined" | "other"

  protocol: ProtocolReference?         # Links to Protocol Studio
  device: DeviceProfile?
  target_regions: [BrainRegionTarget]
  target_symptoms: [string]?
  parameters: InterventionParameters
  sessions: [Session]
  schedule: TreatmentSchedule?
  outcomes: [OutcomeMeasure]
  response_status: "non_responder" | "partial_responder" | "responder"
                 | "remitter" | "not_yet_assessed"

  evidence_links: [EvidenceCitation]
  deeptwin_correlations: [DeepTwinCorrelation]
  biomarker_changes: [BiomarkerDelta]?

  provenance: ProvenanceRecord
  confidence: ConfidenceScore
  research_only: boolean
  requires_irb: boolean?
  irb_reference: string?
}
```

### 5.1 ProtocolReference

```python
ProtocolReference {
  protocol_id: UUID
  protocol_name: string
  protocol_version: string            # Semantic version
  modality: string                    # Denormalized for query speed
  indication: string?
  evidence_summary: string?
  protocol_studio_url: string?
}
```

### 5.2 DeviceProfile

```python
DeviceProfile {
  device_id: UUID
  device_type: "TMS_coil" | "tDCS_unit" | "tACS_unit" | "tRNS_unit"
             | "neurofeedback_amplifier" | "PBM_device" | "other"
  manufacturer: string?; model: string?
  serial_hash: string?                # Hashed for privacy
  coil_type: "figure8" | "double_cone" | "H_coil" | "circular" | "custom"?
  software_version: string?
  calibration_date: datetime?
}
```

### 5.3 InterventionParameters

Polymorphic by modality. All fields optional; relevant fields populated based on modality.

```python
InterventionParameters {
  # TMS
  frequency_hz: float?; intensity_mt: float?; pulse_count: int?
  train_duration_s: float?; inter_train_interval_s: float?
  coil_orientation: string?
  # tDCS/tACS/tRNS
  current_ma: float?; electrode_size_cm2: float?
  electrode_montage: string?; duration_min: float?
  # Neurofeedback
  feedback_modality: string?; target_frequency_band: string?
  threshold_strategy: string?
  # Medication
  medication_reference: { rxnorm_cui: string?, generic_name: string? }?
  dosage_mg: float?; frequency_per_day: float?
  # Psychotherapy
  therapy_format: string?; session_length_min: int?
  # Common
  total_planned_sessions: int?; actual_sessions_completed: int?
  adherence_pct: float?                # 0.0 -- 100.0
  notes: string?
}
```

### 5.4 Session

```python
Session {
  session_id: UUID; intervention_id: UUID; session_number: int
  scheduled_date: datetime; actual_date: datetime?
  status: "scheduled" | "completed" | "no_show" | "cancelled" | "rescheduled"
  delivered_parameters: InterventionParameters?
  eeg_during_session: [qEEGSnapshot]?
  hr_during_session: [WearableReading]?
  adverse_events: [AdverseEvent]
  patient_tolerance: int?              # 1-10
  clinician_observations: string?
  provenance: ProvenanceRecord; created_at: datetime
}
```

### 5.5 OutcomeMeasure

```python
OutcomeMeasure {
  outcome_id: UUID; intervention_id: UUID
  measure_name: string                 # e.g. "HAMD-17"
  measure_code: string?                # e.g. "HAMD17"
  timepoint: "baseline" | "mid_treatment" | "post_treatment" | "follow_up_1m"
           | "follow_up_3m" | "follow_up_6m" | "follow_up_12m" | "per_session"
  raw_score: float; normalized_score: float?
  change_from_baseline: float?; percent_change: float?
  clinical_significance: "deteriorated" | "no_change" | "improved"
                       | "clinically_significant" | "remitted"?
  normative_comparison: {
    norm_database: string; population_mean: float?
    population_sd: float?; patient_percentile: float?
  }?
  responder_threshold_met: boolean?
  evidence_links: [EvidenceCitation]
  collected_by: "clinician" | "patient_self_report" | "observer" | "automated"
  provenance: ProvenanceRecord
  confidence: ConfidenceScore
}
```

---

## 6. Entity: qEEG Snapshot

Quantitative EEG acquisition with normative comparison and protocol-suggestion scoring.

```python
qEEGSnapshot {
  snapshot_id: UUID; patient_id: UUID; clinic_id: UUID
  acquisition_date: datetime; acquisition_duration_s: float?
  technician_id: UUID?
  equipment: {
    amplifier_model: string?; sampling_rate_hz: float?
    electrode_count: int?; electrode_system: "10-20" | "10-10" | "custom"
    reference: "averaged_ears" | "Cz" | "average_reference" | "mastoid" | "other"
  }?

  normative_comparison: {
    database: "CHBMP" | "NeuroGuide" | "NIH_Lifespan" | "custom"
    database_version: string?; age_matched: boolean; sex_matched: boolean?
    n_norm_subjects: int?
    z_scores: { electrode: string, band_z_scores: {
      band: "delta" | "theta" | "alpha" | "low_alpha" | "high_alpha" | "beta"
          | "low_beta" | "high_beta" | "gamma" | "smr" | "total_power"
      z_score: float; percentile: float?
    }}
    deviations: [EEGDeviation]
  }

  connectivity: ConnectivityMatrix?
  source_localization: SourceLocalization?
  protocol_suggestions: [ProtocolFit]
  digital_phenotype_features: [string]?

  evidence_links: [EvidenceCitation]
  provenance: ProvenanceRecord
  confidence: ConfidenceScore
  research_only: boolean
}
```

### 6.1 EEGDeviation

```python
EEGDeviation {
  deviation_id: UUID
  electrode: string; frequency_band: string
  deviation_type: "elevated" | "reduced" | "asymmetry" | "coherence_abnormal"
  z_score: float
  severity: "mild" | "moderate" | "severe"     # Based on |z| thresholds
  clinical_interpretation: string?
  associated_symptoms: [string]?
  source_regions: [BrainRegionTarget]?
  evidence_links: [EvidenceCitation]
}
```

### 6.2 ConnectivityMatrix

```python
ConnectivityMatrix {
  matrix_id: UUID
  method: "coherence" | "phase_lag_index" | "wPLI" | "directed_transfer_function"
        | "granger_causality" | "phase_synchrony" | "cross_correlation"
  frequency_band: string; electrodes: [string]; matrix_values: [[float]]
  thresholded: boolean; threshold_method: string?
  graph_metrics: {
    global_efficiency: float?; clustering_coefficient: float?
    characteristic_path_length: float?; modularity: float?
    small_world_index: float?
  }?
  significant_connections: [{ from_electrode: string, to_electrode: string,
    strength: float, direction: string? }]?
}
```

### 6.3 SourceLocalization

```python
SourceLocalization {
  localization_id: UUID
  method: "eLORETA" | "sLORETA" | "MNE" | "dSPM" | "beamformer" | "custom"
  atlas: "AAL" | "AAL3" | "FreeSurfer" | "custom"
  source_regions: [{
    region: BrainRegionTarget; estimated_activity: float
    confidence_interval: { low: float, high: float }?
    statistical_significance: float?
  }]
}
```

### 6.4 ProtocolFit

```python
ProtocolFit {
  fit_id: UUID; protocol: ProtocolReference
  fit_score: float                    # 0.0 -- 1.0
  match_rationale: string
  supporting_deviations: [EEGDeviation]
  evidence_for_protocol: [EvidenceCitation]
  contraindications: [string]?
  confidence: ConfidenceScore
}
```

---

## 7. Entity: MRISession

Structural and functional MRI with atlas registration, biomarker extraction, stimulation target planning.

```python
MRISession {
  session_id: UUID; patient_id: UUID; clinic_id: UUID
  acquisition_date: datetime
  scanner: { manufacturer: string?; model: string?
    field_strength_t: float?; institution: string? }

  sequences: [MRISequence]

  atlas_registrations: [{
    atlas: "AAL" | "AAL3" | "FreeSurfer" | "Schaefer_100" | "Schaefer_200"
         | "Schaefer_400" | "Schaefer_1000" | "HCP-MMP1" | "Brainnetome"
         | "Juelich" | "custom"
    registration_method: "linear" | "nonlinear" | "surface-based"
    quality_metric: float?; regions: [AtlasRegion]
  }]

  biomarkers_extracted: [MRIExtractedFeature]

  normative_comparison: {
    database: "ADNI" | "ABIDE" | "UK_Biobank" | "HCP" | "OASIS" | "custom"
    database_version: string?; age_matched: boolean; sex_matched: boolean?
    deviations: [MRIDeviation]
  }

  stimulation_targets: [BrainRegionTarget]
  evidence_links: [EvidenceCitation]
  provenance: ProvenanceRecord; confidence: ConfidenceScore; research_only: boolean
}
```

### 7.1 MRISequence

```python
MRISequence {
  sequence_id: UUID
  sequence_type: "T1w" | "T2w" | "FLAIR" | "DWI" | "DTI" | "fMRI_BOLD"
               | "fMRI_resting_state" | "MRS" | "SWI" | "ASL" | "MPRAGE"
               | "MP2RAGE" | "custom"
  sequence_name: string?; te_ms: float?; tr_ms: float?; ti_ms: float?
  voxel_size_mm: [float]?; matrix_size: [int]?
  n_volumes: int?; scan_duration_s: float?
  quality_rating: "usable" | "good" | "excellent" | "exclude"?
  artifacts: [string]?; file_references: [string]?
}
```

### 7.2 AtlasRegion

```python
AtlasRegion {
  region_id: string; region_name: string
  hemisphere: "L" | "R" | "bilateral"
  volume_mm3: float?; cortical_thickness_mm: float?; surface_area_mm2: float?
  mean_intensity: float?
  functional_connectivity: [{ connected_region: string, connectivity_strength: float }]?
}
```

### 7.3 MRIExtractedFeature

```python
MRIExtractedFeature {
  feature_id: UUID
  feature_type: "gray_matter_volume" | "cortical_thickness" | "white_matter_volume"
              | "hippocampal_volume" | "ventricular_volume" | "lesion_count"
              | "FA_tract_value" | "functional_connectivity" | "ALFF" | "fALFF"
              | "ReHo" | "perfusion" | "spectroscopy_metabolite" | "custom"
  region: BrainRegionTarget; value: float; unit: string?
  laterality_index: float?            # (L - R) / (L + R)
  compared_to_norm: { z_score: float?; percentile: float?; significant: boolean? }?
  method: string?; evidence_links: [EvidenceCitation]
}
```

### 7.4 MRIDeviation

```python
MRIDeviation {
  deviation_id: UUID; feature_type: string; region: BrainRegionTarget
  deviation_direction: "increased" | "decreased" | "abnormal_pattern"
  z_score: float?; severity: "mild" | "moderate" | "severe"
  clinical_interpretation: string?; differential_diagnosis: [string]?
  evidence_links: [EvidenceCitation]
}
```

---

## 8. Entity: BiomarkerReading

Lab results, wearable-derived biomarkers, and physiological readings.

```python
BiomarkerReading {
  reading_id: UUID; patient_id: UUID; clinic_id: UUID

  biomarker_type: "BDNF_serum" | "BDNF_plasma" | "CRP" | "hs_CRP" | "IL_6"
                | "TNF_alpha" | "cortisol_salivary" | "cortisol_serum"
                | "HRV_RMSSD" | "HRV_SDNN" | "HRV_LF_HF" | "blood_glucose"
                | "HbA1c" | "omega3_index" | "vitamin_D" | "testosterone"
                | "estradiol" | "homocysteine" | "folate" | "B12"
                | "iron_ferritin" | "TSH" | "sleep_efficiency"
                | "sleep_duration" | "steps_daily" | "custom"
  loinc_code: string?; biomarker_name: string

  value: float; unit: string
  reference_range: { low: float; high: float; optimal_low: float?; optimal_high: float?; source: string }

  collection_date: datetime
  collection_time_of_day: "morning" | "afternoon" | "evening" | "night" | "unknown"?
  fasting_status: "fasting" | "non_fasting" | "unknown"?
  source_database: "NHANES" | "NHANES_HRV" | "clinical_lab" | "wearable"
                  | "patient_reported" | "custom"
  source_lab: string?; method: string?

  status_vs_reference: "below_normal" | "normal" | "above_normal" | "critical_low" | "critical_high"
  status_vs_optimal: string?
  longitudinal_trend: "improving" | "stable" | "worsening" | "insufficient_data"?
  trend_basis_n: int?

  neuropsychiatric_relevance: string?
  evidence_links: [EvidenceCitation]
  provenance: ProvenanceRecord; confidence: ConfidenceScore; research_only: boolean
}
```

---

## 9. Entity: MedicationProfile

Medication record with pharmacogenomics, adverse events, and evidence.

```python
MedicationProfile {
  profile_id: UUID; patient_id: UUID; clinic_id: UUID

  medication: {
    name: string; generic_name: string; rxnorm_cui: string?
    atc_code: string?; atc_description: string?
    drugbank_id: string?; ndc_codes: [string]?
  }

  dosage: { amount: float; unit: string; frequency: string
    route: "oral" | "IM" | "IV" | "SC" | "transdermal" | "sublingual" | "other"?
    max_daily_dose: float? }

  indication: string?                   # ICD-10 category
  prescriber_role: "psychiatrist" | "neurologist" | "GP" | "nurse_practitioner" | "other"
  status: "active" | "discontinued" | "held" | "completed" | "planned"
  start_date: datetime?; end_date: datetime?; discontinuation_reason: string?

  genetic_interactions: [PGxInteraction]
  adverse_events: [AdverseEvent]
  black_box_warnings: [string]?
  contraindications: [string]?

  evidence_links: [EvidenceCitation]
  provenance: ProvenanceRecord; confidence: ConfidenceScore; research_only: boolean
}
```

### 9.1 PGxInteraction

```python
PGxInteraction {
  interaction_id: UUID
  variant: { variant_id: string; gene: string; phenotype: string
    clinical_significance: "pathogenic" | "likely_pathogenic" | "risk_factor"
                         | "protective" | "benign" | "uncertain" }
  effect_on_drug: "reduced_metabolism" | "increased_metabolism" | "altered_response"
                | "increased_toxicity" | "reduced_efficacy" | "contraindicated"
  cpic_guideline_summary: string?; cpic_level: string?
  dpwg_level: string?; recommendation: string?
  evidence_links: [EvidenceCitation]
  source: "PharmGKB" | "ClinVar" | "PharmCAT" | "CPIC" | "custom"
}
```

### 9.2 AdverseEvent

```python
AdverseEvent {
  event_id: UUID; medication_id: UUID?; intervention_id: UUID?
  event_term: string; meddra_code: string?
  severity: "mild" | "moderate" | "severe" | "life_threatening" | "fatal"
  onset_date: datetime?; resolution_date: datetime?
  outcome: "resolved" | "resolving" | "not_resolved" | "fatal" | "unknown"
  action_taken: string?; causality_assessment: string?
  reported_by: "patient" | "clinician" | "caregiver" | "automated_system"
  source: "FAERS" | "patient_report" | "clinical_observation" | "literature"
  evidence_links: [EvidenceCitation]; provenance: ProvenanceRecord
}
```

---

## 10. Entity: GeneticProfile

Pharmacogenomic and disease-risk variants for neuromodulation and medication selection.

```python
GeneticProfile {
  profile_id: UUID; patient_id: UUID

  variants: [{
    variant_id: string; gene: string                  # CYP2D6, CYP2C19, BDNF, COMT, MTHFR, etc.
    chromosome: string?; position: int?; genotype: string?
    phenotype: string
    clinical_significance: "pathogenic" | "likely_pathogenic" | "risk_factor"
                         | "protective" | "benign" | "uncertain"
    drugs_affected: [string]; conditions_associated: [string]?
    cpic_guideline_summary: string?; dpwg_guideline_summary: string?
    allele_frequencies: { population: string, frequency: float }
    source: "ClinVar" | "PharmGKB" | "PharmCAT" | "gnomAD" | "dbSNP" | "custom"
    evidence_grade: "A" | "B" | "C" | "D"
    evidence_links: [EvidenceCitation]
  }]

  overall_risk_assessment: string?     # Summarized narrative, NOT a diagnosis
  treatment_response_predictors: [{
    intervention_type: string; predicted_response: string
    confidence: float; supporting_variants: [string]
    evidence_links: [EvidenceCitation]
  }]?

  provenance: ProvenanceRecord; confidence: ConfidenceScore
  research_only: boolean; consent_obtained: boolean?
  consent_date: datetime?; genetic_counseling_recommended: boolean?
}
```

---

## 11. Entity: WearableStream

Continuous/semi-continuous data from consumer and clinical wearable devices.

```python
WearableStream {
  stream_id: UUID; patient_id: UUID; clinic_id: UUID

  device: { device_type: "smartwatch" | "fitness_tracker" | "chest_strap" | "ring"
    | "blood_pressure_monitor" | "continuous_glucose_monitor" | "EEG_headband"
    | "sleep_mat" | "other"; manufacturer: string?; model: string?; serial_hash: string? }

  readings: [WearableReading]
  aggregation_level: "raw" | "minute" | "hourly" | "daily"
  date_range: { start: datetime; end: datetime }

  computed_metrics: { avg_resting_hr: float?; avg_hrv_rmssd: float?
    sleep_efficiency_pct: float?; total_sleep_duration_min: float?
    deep_sleep_pct: float?; rem_sleep_pct: float?; steps_daily_avg: float? }

  anomaly_periods: [{ start: datetime; end: datetime
    anomaly_type: string; severity: "mild" | "moderate" | "severe" }]?

  provenance: ProvenanceRecord; confidence: ConfidenceScore; research_only: boolean
}
```

### 11.1 WearableReading

```python
WearableReading {
  reading_id: UUID; timestamp: datetime
  heart_rate_bpm: float?; hr_variability_ms: float?
  blood_pressure_systolic: float?; blood_pressure_diastolic: float?
  blood_glucose_mgdl: float?; spo2_pct: float?
  steps_count: int?; calories_kcal: float?
  sleep_stage: "awake" | "light" | "deep" | "rem" | "unknown"?
  skin_temperature_c: float?; activity_intensity: string?
  acceleration_g: [float]?
}
```

---

## 12. Entity: DigitalPhenotype

Computed behavioral phenotype from multiple data streams.

```python
DigitalPhenotype {
  phenotype_id: UUID; patient_id: UUID; clinic_id: UUID
  computed_at: datetime; computation_version: string
  input_modalities: [string]; lookback_days: int

  dimensions: [{
    dimension_name: string; dimension_code: string
    value: float; percentile: float?; trend: string?
    contributing_features: [string]; clinical_interpretation: string?
    evidence_links: [EvidenceCitation]
  }]

  overall_classification: string?; risk_flags: [string]?; protective_factors: [string]?

  provenance: ProvenanceRecord; confidence: ConfidenceScore
  research_only: boolean; validated_against: [string]?
}
```

---

## 13. Entity: RiskSignal

AI-generated risk signals requiring clinician attention.

```python
RiskSignal {
  signal_id: UUID; patient_id: UUID; clinic_id: UUID

  signal_type: "suicide_risk" | "relapse_risk" | "treatment_resistance"
             | "cognitive_decline" | "medication_non_adherence" | "biomarker_critical"
             | "sleep_disruption" | "mood_deterioration" | "anomaly_detected" | "custom"
  severity: "info" | "low" | "moderate" | "high" | "critical"
  title: string; description: string
  contributing_factors: [{ factor_name: string; factor_weight: float
    source_modality: string; source_reading_id: UUID? }]

  supporting_evidence: [EvidenceCitation]; model_version: string
  recommended_actions: [string]?; auto_escalation: boolean
  acknowledged_by: UUID?; acknowledged_at: datetime?
  resolution_status: "open" | "acknowledged" | "addressed" | "resolved" | "false_positive"

  provenance: ProvenanceRecord; confidence: ConfidenceScore
  research_only: boolean; requires_clinician_review: boolean   # Always true
}
```

---

## 14. Entity: DeepTwinSynthesis

Core intelligence output: AI syntheses fusing multimodal data, ranking hypotheses, supporting clinical decisions.

```python
DeepTwinSynthesis {
  synthesis_id: UUID; patient_id: UUID; clinic_id: UUID
  timestamp: datetime
  synthesis_type: "longitudinal" | "correlational" | "hypothesis_ranking"
                 | "trajectory" | "protocol_support" | "differential_diagnosis"
                 | "treatment_response_prediction" | "risk_stratification"
  modalities_fused: [string]

  inputs: [SynthesisInput]; outputs: [SynthesisOutput]
  hypotheses: [RankedHypothesis]; uncertainty: UncertaintyEstimate
  evidence_map: { modality -> [EvidenceCitation] }

  requires_clinician_review: boolean    # Always true
  clinician_reviewed_by: UUID?; clinician_reviewed_at: datetime?
  clinician_notes: string?; clinician_action_taken: string?

  provenance: ProvenanceRecord; confidence: ConfidenceScore
  research_only: boolean; model_version: string; computation_time_ms: int?
}
```

### 14.1 SynthesisInput

```python
SynthesisInput {
  input_id: UUID; input_type: string    # e.g. "qEEG_snapshot", "biomarker_reading"
  source_entity_id: UUID; source_date: datetime
  modality_weight: float; data_quality_score: float
  key_features_extracted: [string]
}
```

### 14.2 SynthesisOutput

```python
SynthesisOutput {
  output_id: UUID; output_type: "summary_narrative" | "recommendation"
              | "risk_assessment" | "trajectory_forecast" | "protocol_suggestion" | "alert"
  content: string; confidence: float
  supporting_data: [{ feature: string; value: float; contribution: float }]
  contradictions: [string]?
}
```

### 14.3 RankedHypothesis

```python
RankedHypothesis {
  hypothesis_id: UUID; rank: int        # 1 = most likely
  hypothesis_text: string
  prior_probability: float; posterior_probability: float
  supporting_evidence: [EvidenceCitation]; contradicting_evidence: [EvidenceCitation]?
  required_data_to_confirm: [string]?; clinical_implications: [string]?
  uncertainty: float
}
```

### 14.4 UncertaintyEstimate

```python
UncertaintyEstimate {
  estimate_id: UUID
  method: "ensemble_variance" | "monte_carlo" | "bootstrap" | "bayesian_credible"
         | "conformal_prediction" | "epistemic" | "aleatoric" | "hybrid"
  overall_uncertainty: float            # 0.0 = certain, 1.0 = completely uncertain
  epistemic_uncertainty: float?; aleatoric_uncertainty: float?
  confidence_intervals: [{ parameter: string; estimate: float
    ci_low: float; ci_high: float; confidence_level: float }]?
  calibration_assessment: string?
}
```

### 14.5 DeepTwinCorrelation

```python
DeepTwinCorrelation {
  correlation_id: UUID; intervention_id: UUID; synthesis_id: UUID
  correlation_type: string
  predicted_outcome: string?; actual_outcome: string?
  correlation_strength: float; p_value: float?
  evidence_links: [EvidenceCitation]; confidence: ConfidenceScore
}
```

---

## 15. Entity: Assessment

Clinical rating scales, cognitive tests, functional measures.

```python
Assessment {
  assessment_id: UUID; patient_id: UUID; clinic_id: UUID

  assessment_name: string; assessment_code: string?
  category: "mood" | "anxiety" | "cognition" | "function" | "quality_of_life"
           | "sleep" | "pain" | "substance_use" | "suicide_risk" | "custom"
  version: string?; source_database: string?

  administration_date: datetime
  administered_by: string; rater_id: UUID?; time_to_complete_min: int?

  total_score: float
  raw_scores: [{ subscale_name: string; score: float; max_possible: float?
    interpretation: string? }]?
  normative_comparison: { database: string; population_mean: float?
    population_sd: float?; patient_percentile: float? }?

  clinical_interpretation: string?; severity_level: string?; functional_impact: string?

  evidence_links: [EvidenceCitation]
  provenance: ProvenanceRecord; confidence: ConfidenceScore; research_only: boolean
}
```

---

## 16. Schema Statistics

| Metric | Count |
|--------|-------|
| Top-level entities | 12 |
| Embedded composite types | 32 |
| External databases normalized | 73 |
| Provenance attachment points | Every entity |
| Confidence score attachment points | Every clinical output |
| Research-only isolation flags | Every entity |
| Typed fields (total) | 400+ |

---

## 17. Key Relationships Summary

| From | To | Cardinality |
|------|-----|-------------|
| ClinicalPatient | Intervention | 1:N |
| ClinicalPatient | MedicationProfile | 1:N |
| ClinicalPatient | BiomarkerReading | 1:N |
| ClinicalPatient | qEEGSnapshot | 1:N |
| ClinicalPatient | MRISession | 1:N |
| ClinicalPatient | WearableStream | 1:N |
| ClinicalPatient | GeneticProfile | 0:1 |
| ClinicalPatient | DigitalPhenotype | 0:1 |
| ClinicalPatient | RiskSignal | 1:N |
| ClinicalPatient | DeepTwinSynthesis | 1:N |
| ClinicalPatient | Assessment | 1:N |
| Intervention | Session | 1:N |
| Intervention | OutcomeMeasure | 1:N |
| Intervention | DeepTwinCorrelation | 1:N |
| qEEGSnapshot | EEGDeviation | 1:N |
| MRISession | MRIDeviation | 1:N |
| MedicationProfile | AdverseEvent | 1:N |
| MedicationProfile | PGxInteraction | 1:N |
| DeepTwinSynthesis | RankedHypothesis | 1:N |
| DeepTwinSynthesis | SynthesisInput | 1:N |
| *Every entity* | EvidenceCitation | N:M |
| *Every entity* | ProvenanceRecord | 1:1 |
| *Every output* | ConfidenceScore | 1:1 |

---

## 18. Type Constraint Registry

| Field | Type | Constraints |
|-------|------|-------------|
| All `*_id` fields | UUID | v4, immutable |
| `age_band` | enum | {"18-25","26-35","36-50","51-65","65+"} |
| `biological_sex` | enum | {"M","F","unknown"} |
| `evidence_grade` | enum | {"A","B","C","D"} |
| `confidence_tier` | enum | {"validated","peer_reviewed","preliminary","research_only"} |
| `overall` (ConfidenceScore) | float | [0.0, 1.0] |
| `sample_size` (ConfidenceScore) | float | [0.0, 0.99] |
| `research_only` | boolean | Default: false |
| `requires_clinician_review` | boolean | Always true for AI outputs |
| `z_score` | float | Typically [-5.0, +5.0] |
| `adherence_pct` | float | [0.0, 100.0] |
| `patient_tolerance` | int | [1, 10] |
| `year` (EvidenceCitation) | int | [1900, current_year] |
| `n_subjects` | int | >= 0 |

---

## 19. Database Adapter Mapping

73 external databases from the Master Registry map into DCCS:

| External Database | DCCS Target Entity(s) | Adapter |
|-------------------|----------------------|---------|
| DrugBank | MedicationProfile | drugbank_client.py |
| RxNorm | MedicationProfile.medication | rxnorm_client.py |
| ATC Codes | MedicationProfile.medication | atc_importer.py |
| FAERS | AdverseEvent | faers_importer.py |
| PharmGKB | PGxInteraction, GeneticProfile | pharmgkb_client.py |
| ClinVar | GeneticProfile.variants | clinvar_importer.py |
| PubMed | EvidenceCitation | pubmed_client.py |
| Cochrane Library | EvidenceCitation | cochrane_client.py |
| ClinicalTrials.gov | EvidenceCitation | clinicaltrials_client.py |
| NIH PROMIS | Assessment, OutcomeMeasure | promis_client.py |
| LOINC | BiomarkerReading.loinc_code | loinc_importer.py |
| USDA FoodData | CachedFoodItem | usda_client.py |
| NHANES | BiomarkerReading.reference_range | nhanes_importer.py |
| CHBMP | qEEGSnapshot.normative_comparison | chbmp_importer.py |
| NeuroGuide | qEEGSnapshot.normative_comparison | neuroguide_importer.py |
| AAL Atlas | BrainRegionTarget, AtlasRegion | aal_importer.py |
| FreeSurfer | AtlasRegion | freesurfer_service.py |
| Schaefer Atlas | AtlasRegion | schaefer_importer.py |
| HCP-MMP1 | AtlasRegion | hcpmmp1_importer.py |
| ADNI | MRISession.normative_comparison | adni_service.py |
| ABIDE | MRISession.normative_comparison | abide_service.py |
| UK Biobank | MRISession.normative_comparison | ukbiobank_service.py |
| Allen Brain Atlas | MRIExtractedFeature | allenbrain_client.py |
| gnomAD | GeneticProfile.allele_frequencies | gnomad_service.py |
| dbSNP | GeneticProfile.variants | dbsnp_service.py |

---

## 20. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-01-28 | Clinical Data Architecture Team | Initial canonical schema release |

*DeepSynaps Protocol Studio -- Clinical Data Architecture*
*Confidential -- Internal Use Only*
