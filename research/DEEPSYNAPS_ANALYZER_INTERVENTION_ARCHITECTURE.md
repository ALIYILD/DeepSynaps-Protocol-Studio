# DeepSynaps Analyzer — Intervention — DeepTwin — Report Architecture

## Comprehensive Technical Reference v1.0

---

**Document ID:** DS-ARCH-001
**Version:** 1.0.0
**Classification:** Architecture Reference
**Last Updated:** 2025-01-15
**Maintainers:** DeepSynaps Architecture Team

---

## Table of Contents

1. [Analyzer Ecosystem (17 Analyzers)](#1-analyzer-ecosystem)
2. [Intervention Ecosystem (7 Categories)](#2-intervention-ecosystem)
3. [Signal Flow Architecture](#3-signal-flow-architecture)
4. [DeepTwin Integration Points](#4-deeptwin-integration-points)
5. [Report Generation Flow](#5-report-generation-flow)
6. [Cross-Module Navigation](#6-cross-module-navigation)
7. [Consent & Governance Flow](#7-consent--governance-flow)

---

## Executive Summary

This document defines the complete data and control flow architecture for the DeepSynaps Clinical Intelligence Platform, covering the journey from raw clinical data ingestion through analyzer processing, DeepTwin multimodal synthesis, intervention planning, and report generation. The architecture connects 17 analyzers, 7 intervention categories, and a multimodal DeepTwin intelligence layer into a unified clinical decision-support ecosystem.

**Key architectural principles:**
- Every signal is traceable to its source analyzer with full audit lineage
- DeepTwin serves as the central synthesis and correlation engine
- All interventions are evidence-linked with confidence grading
- Consent and governance are enforced at every transition point
- Uncertainty is explicitly modeled, not hidden
- Safety boundaries are hard-coded at intervention boundaries

---

## 1. Analyzer Ecosystem

> **Design Philosophy:** Each analyzer is an autonomous signal-processing unit that consumes domain-specific data, produces structured signals with uncertainty quantification, links evidence, and integrates with DeepTwin. Analyzers are not black boxes — every output includes provenance, confidence, and audit trails.

---

### 1.1 Risk Analyzer

**Analyzer ID:** `ANLZ-RISK-001`
**Domain:** Clinical Risk Stratification
**Status:** Production

#### What It Produces

| Signal Type | Description | Format | Frequency |
|---|---|---|---|
| `risk_score` | Composite risk score (0-100) | Float, 2 decimal | Per assessment |
| `risk_tier` | Categorical: LOW/MODERATE/HIGH/CRITICAL | Enum | Per assessment |
| `risk_flags` | List of active risk flags | Array<RiskFlag> | Real-time |
| `risk_trend` | Longitudinal risk trajectory | TimeSeries | Per session |
| `risk_drivers` | Top contributing factors | Array<Driver> | Per assessment |
| `alert_trigger` | Threshold-crossing alerts | AlertEvent | Real-time |

**Signal Schema (risk_score):**
```json
{
  "signal_id": "sig_risk_001",
  "analyzer": "ANLZ-RISK-001",
  "patient_id": "PT-12345",
  "timestamp": "2025-01-15T09:30:00Z",
  "signal_type": "risk_score",
  "value": 67.4,
  "confidence": 0.89,
  "uncertainty_type": "mixed",
  "value_range": {"min": 45.0, "max": 78.0},
  "contributing_factors": [
    {"factor": "elevated_inflammation", "weight": 0.23, "source": "biomarkers"},
    {"factor": "sleep_disruption", "weight": 0.18, "source": "biometrics"},
    {"factor": "cognitive_decline_trend", "weight": 0.31, "source": "qEEG"},
    {"factor": "social_withdrawal", "weight": 0.15, "source": "digital_phenotyping"},
    {"factor": "medication_adherence", "weight": 0.13, "source": "medication_studio"}
  ],
  "evidence_links": ["evd_001", "evd_045", "evd_112"],
  "model_version": "risk_v3.2.1",
  "audit_trail": ["audit_001", "audit_002"]
}
```

#### What It Consumes

| Data Source | Type | Refresh Rate | Required |
|---|---|---|---|
| Biomarker signals | Processed signals | Per session | Yes |
| Biometric trends | Time series | Real-time | Yes |
| qEEG features | Spectral features | Per assessment | Yes |
| Digital phenotyping | Passive metrics | Daily | No |
| Medication adherence | Event data | Real-time | No |
| Clinical notes (NLP) | Extracted entities | Per session | No |
| MRI volumetrics | Structural data | Per scan | No |
| Genetic medication data | Metabolizer status | Static | No |

#### Evidence Links

- **Suicide risk scales:** Columbia Suicide Severity Rating Scale (C-SSRS) correlation
- **Cardiovascular risk:** Framingham risk score integration
- **Metabolic risk:** Metabolic syndrome criteria (ATP III)
- **Cognitive risk:** MoCA/MMSE trajectory modeling
- **Inflammation:** CRP/IL-6/GlycA correlation with psychiatric outcomes
- **Population norms:** Matched-cohort comparison from Bio Database

#### Uncertainty Patterns

| Pattern | Description | Handling Strategy |
|---|---|---|
| Missing data bias | Incomplete biomarker history | Multiple imputation with uncertainty propagation |
| Temporal drift | Changing risk factors over time | Exponential decay weighting |
| Model uncertainty | Algorithmic confidence limits | Bayesian posterior credible intervals |
| Inter-rater variance | Clinician disagreement on flags | Consensus modeling with kappa statistics |

**Uncertainty Quantification:**
- `confidence` field: 0.0-1.0 representing model certainty
- `value_range`: 95% credible interval for score estimates
- `uncertainty_type`: `statistical` | `systematic` | `mixed` | `epistemic`
- Missing data flagged with `imputation_flag: true` and `imputation_method`

#### Consent Requirements

- **Minimum:** General clinical assessment consent (Consent Type A)
- **Risk flag sharing:** Explicit consent for alert distribution to care team (Consent Type F)
- **Third-party data:** Separate consent for each external data source
- **Research use:** Optional research consent for model improvement
- **Withdrawal:** Immediate suppression of risk scores upon consent withdrawal

#### DeepTwin Integration Points

| Integration | Direction | Data | Purpose |
|---|---|---|---|
| Risk synthesis | Receives | Risk scores + drivers | Correlate with multimodal state |
| Anomaly detection | Sends | Risk trend anomalies | Flag unusual trajectories |
| Correlation engine | Bidirectional | Risk × biomarker × biometrics | Identify hidden risk drivers |
| Hypothesis generator | Receives | Generated hypotheses | "Risk elevation may be driven by undiagnosed sleep apnea" |

#### Intervention Connections

- **Medication Studio:** Risk tier HIGH/CRITICAL triggers medication review
- **Neuromodulation Studio:** Risk elevation may prompt neurostimulation evaluation
- **Wellness & Lifestyle:** Risk flags auto-generate lifestyle intervention suggestions
- **Alert system:** CRITICAL tier triggers immediate clinician notification
- **Handbooks & Evidence:** Risk drivers linked to relevant clinical guidelines

---

### 1.2 Biomarkers Analyzer

**Analyzer ID:** `ANLZ-BIOMARK-002`
**Domain:** Blood-Based Biological Markers
**Status:** Production

#### What It Produces

| Signal Type | Description | Units | Reference Range Source |
|---|---|---|---|
| `inflammatory_panel` | CRP, IL-6, TNF-alpha, GlycA | mg/L, pg/mL | Bio Database normative |
| `metabolic_panel` | Glucose, HbA1c, insulin, lipids | Various | Bio Database normative |
| `hormonal_panel` | Cortisol, testosterone, estrogen, thyroid | Various | Bio Database, age/gender stratified |
| `nutritional_markers` | B12, folate, vitamin D, iron, zinc | Various | Bio Database normative |
| `autoimmune_markers` | ANA, RF, anti-CCP, etc. | Titer/IU | Bio Database clinical |
| `oxidative_stress` | MDA, GSH, SOD | Various | Research reference |
| `biomarker_trend` | Longitudinal trajectory | Delta/unit time | Internal calculation |
| `abnormal_flags` | Outside reference range indicators | Boolean array | Bio Database comparison |

**Signal Schema (inflammatory_panel):**
```json
{
  "signal_id": "sig_biom_001",
  "analyzer": "ANLZ-BIOMARK-002",
  "patient_id": "PT-12345",
  "timestamp": "2025-01-15T08:00:00Z",
  "signal_type": "inflammatory_panel",
  "values": {
    "CRP": {"value": 8.4, "unit": "mg/L", "flag": "HIGH", "z_score": 2.3},
    "IL6": {"value": 12.1, "unit": "pg/mL", "flag": "ELEVATED", "z_score": 1.8},
    "TNFA": {"value": 3.2, "unit": "pg/mL", "flag": "NORMAL", "z_score": 0.4},
    "GlycA": {"value": 385, "unit": "µmol/L", "flag": "HIGH", "z_score": 2.1}
  },
  "confidence": 0.95,
  "uncertainty_type": "statistical",
  "lab_source": "LabCorp",
  "collection_method": "fasting_venous",
  "reference_source": "bio_db_v2024_3",
  "trend": {"direction": "increasing", "slope": 0.34, "p_value": 0.02},
  "evidence_links": ["evd_inflam_001", "evd_psych_inflam_045"],
  "clinical_notes": "CRP elevated consistent with low-grade inflammation"
}
```

#### What It Consumes

| Data Source | Type | Format | Integration |
|---|---|---|---|
| Lab result feeds | HL7 FHIR R4 | API polling | Direct EHR connection |
| Manual entry | Structured form | Web UI | Clinician input |
| External lab PDFs | OCR-processed | File upload | Document parser |
| Historical records | Time series | Bulk import | Migration pipeline |

#### Evidence Links

- **Inflammation-psychiatry:** Meta-analyses (Köhler et al., 2017; Fernandes et al., 2016)
- **Cytokine depression:** CRP >3mg/L associated with treatment resistance
- **Metabolic-psychiatric:** Diabetes-inflammation-depression triangle
- **HPA axis:** Cortisol awakening response in PTSD/depression
- **Nutritional psychiatry:** B12/folate/D correlations with mood disorders
- **Autoimmune:** Hashimoto's, lupus, RA psychiatric comorbidities

#### Uncertainty Patterns

| Pattern | Description | Mitigation |
|---|---|---|
| Pre-analytic variability | Collection time, fasting status, handling | Standardize collection protocols |
| Inter-lab variation | Different analyzers, methods | Lab-specific reference range adjustment |
| Biological variability | Diurnal, menstrual, seasonal | Time-aware normalization |
| Pre-analytical error | Hemolysis, lipemia, icterus | Quality flag integration |
| Reference range adequacy | Population mismatch | Age/gender/ethnicity stratification |

#### Consent Requirements

- **Minimum:** General blood work consent (standard of care)
- **Extended panel:** Explicit consent for research-grade markers (GlycA, advanced cytokines)
- **Genetic correlation:** Optional linking to pharmacogenomic data
- **Research biobank:** Separate consent for sample storage and future analysis
- **Cross-border:** GDPR compliance for international lab processing

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Inflammation-psych correlation | Sends | CRP/IL-6 correlated with mood symptom severity |
| Metabolic state synthesis | Sends | Metabolic panel integrated into overall state model |
| Nutritional gap analysis | Sends | Deficiency patterns linked to dietary analyzer |
| Trend projection | Receives | DeepTwin provides trajectory predictions |
| Multi-omics fusion | Bidirectional | Combined with genetic, imaging, EEG data |

#### Intervention Connections

- **Nutrition & Metabolic:** Deficiencies trigger supplementation protocols
- **Medication Studio:** Inflammation informs anti-inflammatory augmentation
- **Wellness & Lifestyle:** Exercise prescriptions for metabolic optimization
- **Risk Analyzer:** Inflammatory markers feed composite risk scoring

---

### 1.3 Biometrics Analyzer

**Analyzer ID:** `ANLZ-BIOMET-003`
**Domain:** Continuous Physiological Monitoring
**Status:** Production

#### What It Produces

| Signal Type | Description | Source Devices | Resolution |
|---|---|---|---|
| `hrv_summary` | Time/frequency domain HRV metrics | Wearable, ECG patch | 1-min epochs |
| `sleep_architecture` | Stages, efficiency, latency, WASO | Wearable, bed sensor | 30-sec epochs |
| `activity_profile` | Steps, intensity, sedentary time | Wearable, phone IMU | 1-min epochs |
| `cardiovascular_load` | HR, BP, recovery metrics | Wearable, cuff | Continuous/spot |
| `temperature_trend` | Skin/core temperature trends | Wearable, patch | 1-min epochs |
| `respiratory_rate` | Breathing rate, apnea indicators | Wearable, bed sensor | 1-min epochs |
| `biometric_alerts` | Threshold breaches, anomalies | All devices | Real-time |
| `recovery_index` | Overnight recovery composite | Wearable, HRV | Daily |

**Signal Schema (hrv_summary):**
```json
{
  "signal_id": "sig_biomet_001",
  "analyzer": "ANLZ-BIOMET-003",
  "patient_id": "PT-12345",
  "timestamp": "2025-01-15T06:00:00Z",
  "signal_type": "hrv_summary",
  "epoch": "overnight_0200_0600",
  "values": {
    "RMSSD": {"value": 32.4, "unit": "ms", "percentile": 25, "flag": "LOW"},
    "SDNN": {"value": 45.2, "unit": "ms", "percentile": 30, "flag": "LOW-NORMAL"},
    "LF_power": {"value": 892, "unit": "ms²", "percentile": 40, "flag": "NORMAL"},
    "HF_power": {"value": 445, "unit": "ms²", "percentile": 20, "flag": "LOW"},
    "LF_HF_ratio": {"value": 2.0, "percentile": 65, "flag": "NORMAL"}
  },
  "confidence": 0.82,
  "uncertainty_type": "systematic",
  "device_source": "oura_ring_gen3",
  "signal_quality": "good",
  "artifact_percentage": 3.2,
  "trend_7d": {"RMSSD_slope": -1.4, "p_value": 0.08},
  "evidence_links": ["evd_hrv_depression_001", "evd_autonomic_psych_033"]
}
```

#### What It Consumes

| Data Source | Devices | Integration Method | Frequency |
|---|---|---|---|
| Consumer wearables | Oura, Whoop, Apple Watch, Garmin | API/oauth | Continuous |
| Clinical wearables | Actigraph, Empatica E4 | Dedicated app | Continuous |
| Bed sensors | Withings Sleep, EMFIT | WiFi/Bluetooth | Nightly |
| ECG patches | Zio Patch, Bardy CAM | Manual upload | As prescribed |
| Blood pressure | Omron, Withings BPM | Bluetooth/ Manual | Spot checks |
| Weight/scales | Withings, FitTrack | WiFi | Daily |

#### Evidence Links

- **HRV-depression:** Reduced RMSSD associated with MDD (Kemp et al., 2010)
- **HRV-PTSD:** LF/HF ratio alterations in trauma spectrum
- **Sleep-psychiatry:** Sleep disruption precedes mood episodes (Harvey, 2008)
- **Activity-depression:** Step count inversely correlated with PHQ-9
- **Cardiovascular-psych:** Shared autonomic dysregulation pathways

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Device accuracy | Consumer vs. clinical grade | Quality scoring per device type |
| Signal artifact | Motion, loose contact | Artifact detection and exclusion |
| Missing epochs | Device removal, charging | Gap imputation with uncertainty |
| Cross-device variance | Different algorithms | Device-normalized z-scores |
| Behavioral confounds | Alcohol, exercise timing | Contextual annotation |

#### Consent Requirements

- **Wearable connection:** Explicit OAuth consent per device
- **Continuous monitoring:** Clear explanation of data scope and duration
- **Data storage:** Retention period and deletion rights
- **Research use:** Optional de-identified use for algorithm training
- **Emergency alerts:** Consent for automated clinician notification

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Circadian modeling | Sends | Sleep/wake data feeds circadian state |
| Autonomic state | Sends | HRV feeds autonomic nervous system model |
| Activity-mood correlation | Sends | Physical activity correlated with symptom reports |
| Anomaly detection | Receives | DeepTwin flags multi-day pattern anomalies |
| Recovery prediction | Receives | Predicted recovery trajectories post-intervention |

#### Intervention Connections

- **Wellness & Lifestyle:** Sleep hygiene, exercise prescriptions based on data
- **Neuromodulation Studio:** HRV targets for biofeedback-guided protocols
- **Risk Analyzer:** Sleep disruption feeds risk scoring
- **Rehab/Physiotherapy:** Activity data informs physical rehabilitation plans

---

### 1.4 Labs Analyzer

**Analyzer ID:** `ANLZ-LABS-004`
**Domain:** Laboratory Result Processing and Interpretation
**Status:** Production

#### What It Produces

| Signal Type | Description | Coverage |
|---|---|---|
| `cbc_panel` | Complete blood count with differential | All patients |
| `metabolic_panel` | CMP/BMP with calculated indices | All patients |
| `liver_function` | AST, ALT, ALP, bilirubin, GGT | Medication monitoring |
| `renal_function` | eGFR, creatinine, BUN, electrolytes | All patients |
| `thyroid_panel` | TSH, free T3/T4, antibodies | Indicated |
| `lipid_panel` | LDL, HDL, triglycerides, ratios | Metabolic monitoring |
| `drug_levels` | Trough levels for mood stabilizers, antipsychotics | Medication monitoring |
| `abnormal_flags` | Delta-check, critical values, trend alerts | All |

#### What It Consumes

| Source | Format | Method |
|---|---|---|
| EHR lab feeds | HL7 ORU | Real-time interface |
| External lab portals | PDF/OCR | Scheduled import |
| Direct entry | Structured form | Manual input |
| Patient-imported results | Photo/PDF | OCR processing |

#### Evidence Links

- **Lithium monitoring:** ISBD guidelines for renal/thyroid surveillance
- **Clozapine:** Mandatory ANC monitoring (Clozapine REMS)
- **Valproate:** Hepatic function, pregnancy screening
- **Metabolic monitoring:** ADA guidelines for antipsychotic metabolic effects

#### Uncertainty Patterns

| Pattern | Description | Mitigation |
|---|---|---|
| Delta-check failures | Unexpected value changes | Repeat test recommendation |
| Critical value delays | Communication gaps | Automated alert escalation |
| Reference range mismatch | Lab-specific ranges | Standardized reporting |
| Pre-analytical variables | Fasting, timing, handling | Collection metadata capture |

#### Consent Requirements

- **Standard of care:** Implicit consent for clinically indicated labs
- **Medication monitoring:** Specific consent for drug level monitoring
- **Genetic labs:** Separate consent for pharmacogenomic testing
- **Research panels:** Optional extended research marker panels

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Lab-psych correlation | Sends | Abnormal labs linked to psychiatric symptoms |
| Medication safety | Sends | Drug levels + liver/renal → safety signals |
| Metabolic modeling | Sends | Lipid/glucose feeds metabolic risk model |
| Pattern detection | Receives | DeepTwin identifies multi-panel patterns |

#### Intervention Connections

- **Medication Studio:** Lab results inform medication safety monitoring
- **Nutrition & Metabolic:** Metabolic panel triggers dietary interventions
- **Risk Analyzer:** Abnormal labs feed risk scoring

---

### 1.5 Nutrition Analyzer

**Analyzer ID:** `ANLZ-NUTRIT-005`
**Domain:** Dietary Pattern Analysis and Metabolic Impact
**Status:** Production

#### What It Produces

| Signal Type | Description | Method |
|---|---|---|
| `dietary_pattern` | Macro/micronutrient intake profile | Food diary analysis |
| `metabolic_impact` | Postprandial glucose response, insulin load | CGM correlation |
| `gut_microbiome_proxy` | Fiber diversity, fermented food index | Questionnaire + intake |
| `inflammatory_diet_score` | DII (Dietary Inflammatory Index) | Calculated |
| `mediterranean_diet_score` | MD adherence scoring | Questionnaire + intake |
| `nutrient_gap_analysis` | Deficiency risk assessment | Intake vs. requirement |
| `meal_timing_pattern` | Circadian alignment of eating | Timestamp analysis |
| `hydration_status` | Fluid intake assessment | Self-report + biomarkers |

#### What It Consumes

| Source | Type | Frequency |
|---|---|---|
| Food diary (patient) | Text/photo/voice | Daily |
| Dietitian notes | Structured text | Per session |
| CGM data | Glucose time series | When available |
| Biomarker results | Nutritional markers | Per lab draw |
| Body composition | DEXA, BIA, etc. | Periodic |
| Questionnaires | FFQ, 24-hr recall | Baseline + periodic |

#### Evidence Links

- **Mediterranean diet depression:** SMILES trial, HELFIMED trial
- **Anti-inflammatory diet:** DII and depression severity
- **Omega-3 depression:** EPA dosage response meta-analyses
- **Gut-brain axis:** Psychobiotics, fiber-fermentation-SCFA pathways
- **Ketogenic psychiatry:** Keto for bipolar, schizophrenia emerging evidence

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Self-report bias | Under/over-reporting | Validation with biomarkers |
| Recall accuracy | 24-hr recall limitations | Multiple day averaging |
| Photo analysis error | AI misclassification | Manual correction workflow |
| Seasonal variation | Changing dietary patterns | Long-term averaging |

#### Consent Requirements

- **Dietary data:** Consent for food diary processing
- **CGM integration:** Separate device consent
- **Research use:** Optional dietary pattern research consent

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Diet-mood correlation | Sends | Nutritional patterns linked to symptom changes |
| Inflammation synthesis | Sends | DII correlated with CRP/IL-6 |
| Metabolic modeling | Sends | Nutritional state feeds metabolic model |
| Recommendation engine | Receives | DeepTwin suggests nutritional adjustments |

#### Intervention Connections

- **Nutrition & Metabolic:** Direct protocol generation
- **Medication Studio:** Dietary factors in medication pharmacokinetics
- **Biomarkers:** Nutritional marker monitoring

---

### 1.6 Bio Database

**Analyzer ID:** `ANLZ-BIODB-006`
**Domain:** Reference Data and Normative Comparison Engine
**Status:** Production (Infrastructure)

#### What It Produces

| Signal Type | Description | Source |
|---|---|---|
| `reference_range` | Age/gender/ethnicity stratified norms | Literature + population data |
| `percentile_score` | Patient value vs. population percentile | Internal calculation |
| `z_score` | Standardized deviation from mean | Internal calculation |
| `population_benchmark` | Cohort comparison metrics | Aggregated anonymized data |
| `evidence_summary` | Condensed clinical evidence per marker | Literature database |
| `guideline_link` | Clinical guideline cross-reference | NICE, APA, WHO guidelines |
| `drug_reference` | Interaction database, pharmacokinetics | Drug databases |
| `normative_trajectory` | Expected age-related changes | Longitudinal cohorts |

#### What It Consumes

| Source | Type | Update Frequency |
|---|---|---|
| Peer-reviewed literature | PubMed, journal feeds | Continuous |
| Clinical guidelines | NICE, APA, RANZCP | Quarterly review |
| Population datasets | NHANES, UK Biobank | Annual update |
| Pharmacology databases | DrugBank, PharmGKB | Monthly sync |
| Internal anonymized data | Platform-wide aggregated | Continuous |

#### Evidence Links

- All analyzer outputs reference Bio Database for normative comparison
- Evidence grading: A (systematic review), B (RCT), C (cohort), D (expert)
- Guideline integration: Automatic linking to applicable guidelines

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Population mismatch | Patient demographics vs. reference population | Ethnicity-specific ranges where available |
| Publication bias | Positive result predominance | Bayesian evidence synthesis |
| Outdated references | Older studies may not reflect current practice | Date-stamped evidence with freshness scoring |
| Small sample norms | Rare condition reference ranges | Explicit small-sample flag |

#### Consent Requirements

- **Reference data usage:** No patient consent required (public/aggregate data)
- **Population benchmarking:** Requires opt-in for anonymized contribution
- **Evidence display:** Standard consent for evidence-based recommendations

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Normative context | Provides | Reference data for all patient comparisons |
| Evidence lookup | Provides | On-demand evidence retrieval |
| Population modeling | Receives | DeepTwin feeds anonymized pattern data |

#### Intervention Connections

- **All interventions:** Reference data supports protocol selection
- **Handbooks & Evidence:** Primary evidence source
- **Medication Studio:** Drug interaction and pharmacokinetic data

---

### 1.7 Intervention Analyzer

**Analyzer ID:** `ANLZ-INTERVENT-007`
**Domain:** Treatment Session Analysis and Outcome Tracking
**Status:** Production

#### What It Produces

| Signal Type | Description | Granularity |
|---|---|---|
| `session_outcome` | Pre/post session symptom change | Per session |
| `treatment_response_trajectory` | Longitudinal response curve | Per treatment course |
| `protocol_adherence` | Session completion, protocol fidelity | Per session |
| `dose_response_curve` | Parameter optimization data | Cumulative |
| `side_effect_profile` | Adverse effects per intervention | Event-based |
| `comparative_effectiveness` | Cross-protocol comparison | Cohort-level |
| `resistance_indicators` | Treatment resistance signals | Pattern-based |
| `maintenance_schedule` | Taper/continuation recommendations | Algorithmic |

#### What It Consumes

| Source | Type | Frequency |
|---|---|---|
| Session metadata | Protocol parameters, timestamps | Per session |
| Pre/post assessments | Symptom scales, cognitive tests | Per session |
| Biometric change | Physiological response | Per session |
| Patient-reported outcomes | Diary, questionnaire | Daily/weekly |
| Clinician notes | Session observations | Per session |
| Device logs | Neurostimulation parameters | Per session (TMS/tDCS) |

#### Evidence Links

- **TMS depression:** FDA clearance evidence, STAR*D augmentation
- **tDCS cognitive enhancement:** Meta-analyses of montage efficacy
- **Neurofeedback:** ISNR guidelines, evidence grades per protocol
- **Medication augmentation:** Augmentation strategy evidence hierarchy

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Placebo response | Non-specific improvement | Sham-controlled reference comparison |
| Regression to mean | Natural symptom fluctuation | Baseline variability modeling |
| Measurement reactivity | Assessment frequency effects | Sparse assessment protocols |
| Dropout bias | Non-completer patterns | LOCF, MM, pattern-mixture models |

#### Consent Requirements

- **Treatment consent:** Standard informed consent per intervention
- **Outcome tracking:** Consent for longitudinal outcome monitoring
- **Comparative data:** Optional consent for effectiveness comparison
- **Device data:** Specific consent for neurostimulation device logging

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Response prediction | Receives | DeepTwin predicts response likelihood |
| Protocol optimization | Sends | Historical response data for optimization |
| Multi-modal outcome | Sends | All intervention outcomes for synthesis |
| Adverse event pattern | Sends | Side effect patterns for safety monitoring |

#### Intervention Connections

- **All intervention studios:** Direct outcome feedback loop
- **Risk Analyzer:** Treatment resistance triggers risk reassessment
- **Reports:** Outcome summaries for clinical reports

---

### 1.8 Voice Analyzer

**Analyzer ID:** `ANLZ-VOICE-008`
**Domain:** Speech Pattern and Acoustic Feature Analysis
**Status:** Production

#### What It Produces

| Signal Type | Description | Features |
|---|---|---|
| `acoustic_features` | Fundamental frequency, jitter, shimmer, HNR | Spectral/temporal |
| `prosody_analysis` | Intonation, rhythm, speech rate | Prosodic contours |
| `voice_quality` | Hoarseness, breathiness, tension | GRBAS scale proxy |
| `sentiment_score` | Emotional valence from speech | -1 to +1 |
| `speech_rate` | Words per minute, pausing patterns | Temporal |
| `articulatory_precision` | Consonant/vowel clarity | Spectral |
| `cognitive_load_markers` | Filled pauses, revisions, discourse markers | Linguistic |
| `depression_voice_markers` | Reduced prosodic variation, slower rate | Composite score |
| `anxiety_voice_markers` | Increased rate, pitch elevation, tremor | Composite score |

#### What It Consumes

| Source | Type | Quality Requirement |
|---|---|---|
| Clinical interview recordings | Audio | 16kHz+, <5% noise |
| Voice diary entries | Audio | 8kHz+ acceptable |
| Telehealth session audio | Audio | Variable, quality flagging |
| Structured speech tasks | Read/passage description | Controlled environment |

#### Evidence Links

- **Voice depression:** Low F0, reduced jitter, flat prosody (Cummins et al., 2015)
- **Voice anxiety:** Pitch elevation, rate increase, tremor
- **Cognitive decline:** Articulatory slurring, word-finding pauses
- **PTSD speech:** Specific acoustic patterns in trauma narrative

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Recording quality | Noise, distance, compression | Quality scoring, exclusion thresholds |
| Language dependence | Feature differences across languages | Language-specific models |
| Context dependence | Read vs. spontaneous speech | Task-specific baselines |
| Physical confounds | Cold, allergies, vocal strain | Self-report health flags |

#### Consent Requirements

- **Audio recording:** Explicit consent for recording and analysis
- **Voice biometrics:** Separate consent for voiceprint storage
- **Research use:** Optional consent for voice research
- **Retention:** Defined audio retention period (default: 90 days post-analysis)

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Mood state inference | Sends | Voice sentiment feeds mood model |
| Cognitive state | Sends | Cognitive load markers feed cognition model |
| Cross-modal validation | Bidirectional | Correlated with text sentiment, facial analysis |
| Anomaly detection | Sends | Sudden voice changes flagged |

#### Intervention Connections

- **Behaviour Workspace:** Voice markers feed behavioral assessment
- **Neuromodulation Studio:** Pre/post voice comparison for treatment monitoring
- **Risk Analyzer:** Voice depression markers feed risk signals

---

### 1.9 Text Analyzer

**Analyzer ID:** `ANLZ-TEXT-009`
**Domain:** Clinical Note NLP and Text Extraction
**Status:** Production

#### What It Produces

| Signal Type | Description | NLP Method |
|---|---|---|
| `entity_extraction` | Symptoms, diagnoses, medications, procedures | Clinical NER |
| `relation_extraction` | Drug-symptom, diagnosis-treatment relationships | Relation extraction |
| `sentiment_analysis` | Emotional tone of clinical narrative | Sentiment classifier |
| `temporal_extraction` | Timeline of symptom onset, medication changes | Temporal NLP |
| `risk_mentions` | Suicidal ideation, self-harm references | Rule + ML hybrid |
| `symptom_severity` | Extracted severity indicators | Contextual classification |
| `topic_modeling` | Dominant themes across notes | LDA/BERTopic |
| `documentation_quality` | Note completeness, structured data capture | Heuristic scoring |

#### What It Consumes

| Source | Type | Format |
|---|---|---|
| Clinical progress notes | Free text | EHR export, direct entry |
| Patient messages | Portal messages | API import |
| Discharge summaries | Structured + free text | HL7 CDA |
| Intake assessments | Semi-structured | Form + text |
| External correspondence | Letters, reports | PDF/OCR |
| Patient diaries | Free text | App input |

#### Evidence Links

- **NLP depression detection:** Clinical note NLP for depression screening
- **Suicide risk:** Natural language processing of clinical notes for SI
- **Medication extraction:** RxNorm mapping for medication reconciliation
- **Temporal reasoning:** Disease progression timeline construction

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Negation scope | "No depression" vs. "depression" | Negation detection (NegEx) |
| Family history confusion | Personal vs. family conditions | Family history extraction separate |
| Copy-forward errors | Outdated information copied | Temporal validation |
| Abbreviation ambiguity | Context-dependent abbreviations | Clinical abbreviation expansion |

#### Consent Requirements

- **Clinical notes:** Standard treatment consent covers clinical documentation
- **NLP processing:** Specific consent for AI-assisted text analysis
- **Research NLP:** Optional consent for NLP model improvement
- **Third-party notes:** Consent for external correspondence import

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Clinical timeline | Sends | Extracted temporal events feed timeline |
| Symptom graph | Sends | Entities and relations feed symptom network |
| Documentation insights | Sends | Note quality and completeness metrics |
| Cross-reference | Receives | DeepTwin links extracted entities to signals |

#### Intervention Connections

- **Medication Studio:** Extracted medication data feeds medication reconciliation
- **Risk Analyzer:** Risk mentions feed risk scoring
- **Behaviour Workspace:** Symptom extraction feeds behavioral assessment

---

### 1.10 Video Assessments Analyzer

**Analyzer ID:** `ANLZ-VIDEO-010`
**Domain:** Movement, Behavior, and Facial Expression Analysis
**Status:** Production

#### What It Produces

| Signal Type | Description | Method |
|---|---|---|
| `facial_expression` | Emotion recognition (7 basic emotions) | FACS-based ML |
| `facial_movement` | Expressivity, symmetry, micro-expressions | Optical flow |
| `gaze_behavior` | Fixation patterns, eye contact duration | Eye tracking |
| `head_pose` | Orientation, nodding, shaking | Pose estimation |
| `upper_body_movement` | Gesture, posture, fidgeting | Skeleton tracking |
| `affect_flattening` | Reduced emotional expressivity | Composite score |
| `psychomotor_retardation` | Slowed movement patterns | Velocity analysis |
| `akathisia_assessment` | Restlessness, involuntary movements | Movement classification |
| `engagement_score` | Attention, participation level | Multi-feature composite |

#### What It Consumes

| Source | Type | Setup |
|---|---|---|
| Clinical interview video | Video | Office camera, standardized setup |
| Structured video tasks | Video | Emotion elicitation, speech tasks |
| Telehealth video | Video | Webcam, variable quality |
| Gaze tracking video | Video + gaze data | Tobii/remote eye tracking |
| Movement tasks video | Video | Standardized movement tasks |

#### Evidence Links

- **Facial affect depression:** Reduced positive expression (Ekman, 1993; Girard, 2014)
- **Psychomotor retardation:** Movement velocity in MDD (Lemke et al., 2000)
- **Eye contact:** Gaze avoidance in social anxiety, autism, depression
- **Akathisia detection:** Movement patterns for medication side effects

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Lighting variation | Uneven illumination | Preprocessing normalization |
| Camera angle | Non-frontal views | Angle-invariant features |
| Cultural expression differences | Emotion display rules vary | Culture-aware models |
| Privacy concerns | Patient discomfort | Consent withdrawal handling |

#### Consent Requirements

- **Video recording:** Explicit detailed consent for recording and analysis
- **Facial analysis:** Specific consent for facial emotion recognition
- **Storage:** Video retention period with automatic deletion
- **Research:** Separate consent for video-based research
- **Withdrawal:** Immediate deletion upon consent withdrawal

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Affect state | Sends | Facial expression feeds affect model |
| Motor state | Sends | Movement analysis feeds motor model |
| Engagement tracking | Sends | Session engagement for treatment monitoring |
| Cross-modal fusion | Bidirectional | Face + voice + text emotion fusion |

#### Intervention Connections

- **Neuromodulation Studio:** Pre/post movement comparison
- **Medication Studio:** Akathisia monitoring for antipsychotics
- **Behaviour Workspace:** Behavioral observation data
- **Movement Analyzer:** Overlapping movement assessment data

---

### 1.11 Movement Analyzer

**Analyzer ID:** `ANLZ-MOVEMENT-011`
**Domain:** Gait, Motor Function, and Movement Disorder Analysis
**Status:** Production

#### What It Produces

| Signal Type | Description | Method |
|---|---|---|
| `gait_analysis` | Speed, stride length, symmetry, variability | IMU/camera |
| `tremor_quantification` | Rest/postural/kinetic tremor amplitude | Accelerometer |
| `bradykinesia_score` | Movement speed, amplitude decrement | Video/IMU |
| `rigidity_assessment` | Stiffness indicators | Clinical + movement |
| `balance_assessment` | Sway, postural stability | Force plate/IMU |
| `fine_motor` | Finger tapping, dexterity | Touchscreen/IMU |
| `activity_pattern` | Movement throughout day | Wearable IMU |
| `medication_on_off` | Fluctuation in motor state | Time-series pattern |

#### What It Consumes

| Source | Type | Frequency |
|---|---|---|
| Wearable IMU | Accelerometer, gyroscope | Continuous |
| Video movement tasks | Standardized tasks | Per assessment |
| Smartphone sensors | Touchscreen, accelerometer | Task-based |
| Force plate | Postural sway | Per assessment |
| Clinical rating scales | UPDRS, Fahn-Tolosa-Marin | Per session |

#### Evidence Links

- **Gait depression:** Reduced velocity, increased variability (Michalak et al., 2009)
- **Gait cognition:** Dual-task gait and cognitive load
- **Tremor quantification:** Objective tremor measurement vs. clinical rating
- **Parkinsonian signs:** Antipsychotic-induced movement disorders
- **Psychomotor retardation:** Movement slowing in depression

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Environment variability | Floor surface, shoes, space | Standardized protocols |
| Fatigue effects | Declining performance over session | Session-order effects modeling |
| Device placement | Wearable position variation | Placement calibration |
| Age norming | Age-related movement changes | Age-stratified norms |

#### Consent Requirements

- **Movement recording:** Consent for video/IMU recording
- **Continuous monitoring:** Consent for ongoing movement tracking
- **Research:** Optional consent for movement pattern research

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Motor state | Sends | Movement features feed motor model |
| Medication side effects | Sends | Movement disorder signals |
| Activity modeling | Sends | Daily movement patterns |
| Cross-domain | Receives | DeepTwin correlates movement with mood, cognition |

#### Intervention Connections

- **Rehab/Physiotherapy:** Direct movement assessment for therapy planning
- **Medication Studio:** Movement disorder monitoring
- **Neuromodulation Studio:** Movement outcome tracking
- **Risk Analyzer:** Functional decline indicators

---

### 1.12 Digital Phenotyping Analyzer

**Analyzer ID:** `ANLZ-DIGIPH-012`
**Domain:** Passive Sensing and Digital Behavior Analysis
**Status:** Production

#### What It Produces

| Signal Type | Description | Data Source |
|---|---|---|
| `social_activity` | Call/SMS frequency, duration, reciprocity | Phone metadata |
| `mobility_patterns` | Location variance, home stay time | GPS |
| `app_usage` | Screen time, app categories, usage patterns | Phone usage stats |
| `typing_patterns` | Keystroke dynamics, error rate | Keyboard input |
| `circadian_regularity` | Sleep-wake regularity from phone use | Phone sensors |
| `social_withdrawal_index` | Composite withdrawal score | Multi-feature |
| `cognitive_tap_patterns` | Reaction time, cognitive app performance | Task apps |
| `anomaly_detection` | Sudden behavior changes | Time-series anomaly |

#### What It Consumes

| Source | Type | Privacy Level |
|---|---|---|
| Smartphone sensors | GPS, accelerometer, light | High |
| Phone usage logs | Screen on/off, app opens | High |
| Communication metadata | Call/SMS logs (no content) | High |
| Keyboard metadata | Keystroke timing (no content) | High |
| Voice call patterns | Duration, frequency | Medium |
| App-specific data | Selected health/wellness apps | Medium |

**Privacy Architecture:**
- All processing on-device where possible
- Metadata only — no content captured
- Differential privacy for population-level analytics
- Granular consent per data type
- Automatic expiration and deletion

#### Evidence Links

- **Social withdrawal:** Reduced call/SMS frequency in depression (Choudhury et al., 2013)
- **Circadian disruption:** Phone-based sleep regularity in mood disorders
- **Mobility depression:** GPS-based location variance reduction (Canzian & Musolesi, 2015)
- **Typing patterns:** Keystroke dynamics in cognitive impairment

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Phone sharing | Multiple users per device | User identification heuristics |
| Phone absence | Device not carried | Gap detection and imputation |
| Context missing | Why behavior changed | Contextual annotation prompts |
| Privacy noise | Intentional data reduction | Respect privacy over completeness |

#### Consent Requirements

- **Passive sensing:** Granular opt-in per sensor type
- **Metadata vs. content:** Clear explanation that only metadata is collected
- **Retention period:** Explicit data retention and deletion policy
- **Withdrawal:** Immediate data collection cessation
- **Export:** Patient right to data export

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Social state | Sends | Social activity feeds social functioning model |
| Circadian model | Sends | Regularity data feeds circadian state |
| Behavior change detection | Sends | Sudden changes flagged |
| Longitudinal patterns | Sends | Weeks-to-months behavior trajectories |
| Cross-domain correlation | Receives | DeepTwin links behavior with clinical data |

#### Intervention Connections

- **Wellness & Lifestyle:** Behavior insights inform lifestyle coaching
- **Risk Analyzer:** Social withdrawal feeds risk scoring
- **Behaviour Workspace:** Objective behavioral data for assessment
- **Reports:** Behavioral summaries in clinical reports

---

### 1.13 Behaviour Workspace Analyzer

**Analyzer ID:** `ANLZ-BEHAVE-013`
**Domain:** Behavioral Observations and Functional Assessment
**Status:** Production

#### What It Produces

| Signal Type | Description | Assessment Method |
|---|---|---|
| `functional_assessment` | ADL, IADL, work/school functioning | Standardized scales |
| `behavioral_observations` | Clinician-observed behaviors | Structured observation |
| `cognitive_screening` | MoCA, MMSE, domain-specific tests | Administered tests |
| `executive_function` | TMT, Stroop, WCST, fluency | Neuropsych battery |
| `attention_assessment` | Sustained, selective, divided attention | CPT, dual-task |
| `memory_profile` | Verbal, visual, working, episodic memory | Memory tests |
| `behavioral_symptoms` | Agitation, disinhibition, apathy | NPI, specific scales |
| `adherence_assessment` | Medication, appointment, lifestyle adherence | Multi-modal |

#### What It Consumes

| Source | Type | Frequency |
|---|---|---|
| Standardized scales | Patient + clinician rated | Per session |
| Neuropsychological testing | Administered battery | Baseline, periodic |
| Clinician observations | Structured + narrative | Per session |
| Caregiver reports | Collateral information | Per session |
| Functional assessments | ADL/IADL measures | Baseline, change |
| Voice/Video/Text | Multimodal behavioral data | Per session |
| Movement data | Objective motor assessment | Per session |

#### Evidence Links

- **Functional outcomes:** WHODAS 2.0, SF-36 validity evidence
- **Cognitive screening:** MoCA sensitivity/specificity by condition
- **Executive function:** TMT-B in depression, PTSD, TBI
- **Behavioral symptoms:** NPI in dementia, Overt Aggression Scale

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Rater variance | Inter-rater reliability | Training, calibration videos |
| Practice effects | Test-retest improvement | Alternate forms, norming |
| Effort/malingering | Suboptimal effort | Performance validity testing |
| Cultural bias | Test cultural appropriateness | Culture-fair instruments |

#### Consent Requirements

- **Assessment consent:** Standard clinical assessment consent
- **Neuropsychological testing:** Specific testing consent
- **Caregiver input:** Caregiver consent for collateral report
- **Recording:** Consent for session recording during assessment

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Cognitive state | Sends | Test results feed cognition model |
| Functional state | Sends | Functioning data feed disability model |
| Multi-modal synthesis | Sends | Observations integrated with voice/video/movement |
| Pattern recognition | Receives | DeepTwin identifies cognitive/behavioral patterns |

#### Intervention Connections

- **Rehab/Physiotherapy:** Functional assessment informs therapy goals
- **Medication Studio:** Cognitive side effect monitoring
- **Neuromodulation Studio:** Cognitive outcome tracking
- **All interventions:** Functional outcomes across all treatments

---

### 1.14 MRI Analyzer

**Analyzer ID:** `ANLZ-MRI-014`
**Domain:** Neuroimaging Analysis (Structural, Functional, DTI)
**Status:** Production

#### What It Produces

| Signal Type | Description | Sequence |
|---|---|---|
| `volumetric_analysis` | Regional brain volumes, cortical thickness | T1-weighted MPRAGE |
| `white_matter_integrity` | FA, MD, RD, AD by tract | DTI/dMRI |
| `functional_connectivity` | Resting-state network connectivity | rs-fMRI |
| `lesion_detection` | White matter lesions, infarcts | FLAIR, T2 |
| `asymmetry_indices` | Hemispheric asymmetry metrics | T1, multi-modal |
| `hippocampal_analysis` | Volume, shape, subfield segmentation | T1, high-res |
| `ventricular_size` | Enlargement, asymmetry | T1, FLAIR |
| `scan_quality` | Motion, SNR, artifact scoring | All sequences |

**Signal Schema (volumetric_analysis):**
```json
{
  "signal_id": "sig_mri_001",
  "analyzer": "ANLZ-MRI-014",
  "patient_id": "PT-12345",
  "timestamp": "2025-01-10T14:00:00Z",
  "signal_type": "volumetric_analysis",
  "scanner": "siemens_prisma_3t",
  "sequence": "t1_mprage",
  "volumes": {
    "total_intracranial": {"value": 1450.2, "unit": "mL", "z_score": -0.2},
    "gray_matter": {"value": 678.4, "unit": "mL", "z_score": -0.5},
    "white_matter": {"value": 512.1, "unit": "mL", "z_score": -0.1},
    "hippocampus_left": {"value": 3.82, "unit": "mL", "z_score": -1.8, "flag": "REDUCED"},
    "hippocampus_right": {"value": 3.91, "unit": "mL", "z_score": -1.6, "flag": "REDUCED"},
    "amygdala_left": {"value": 1.45, "unit": "mL", "z_score": -0.8},
    "amygdala_right": {"value": 1.52, "unit": "mL", "z_score": -0.6},
    "prefrontal_cortex": {"value": 142.3, "unit": "mL", "z_score": -0.9}
  },
  "confidence": 0.94,
  "uncertainty_type": "systematic",
  "normative_reference": "oasis3_age_matched",
  "segmentation_method": "freesurfer_v7.3",
  "quality_score": 0.92,
  "motion_parameters": {"max_translation": 0.8, "max_rotation": 0.5},
  "evidence_links": ["evd_hippocampus_depression_001", "evd_volume_aging_023"],
  "clinical_notes": "Bilateral hippocampal reduction may be consistent with chronic stress/depression history"
}
```

#### What It Consumes

| Source | Format | Processing |
|---|---|---|
| DICOM from scanner | DICOM | PACS integration |
| NIfTI exports | NIfTI | Cloud processing |
| Prior scans | Historical DICOM | Longitudinal comparison |
| External imaging | DICOM on CD | Import pipeline |
| Research scans | Various | Dedicated research pipeline |

#### Evidence Links

- **Hippocampal volume:** Reduced volume in recurrent depression (Videbech & Ravnkilde, 2004)
- **PFC thickness:** Cortical thinning in depression, PTSD
- **White matter integrity:** DTI abnormalities in MDD, bipolar disorder
- **Functional connectivity:** Default mode network alterations
- **Aging brain:** Age-adjusted volumetric norms

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Scanner variability | Different field strengths, sequences | Harmonization (ComBat) |
| Motion artifact | Patient movement during scan | Motion correction, quality exclusion |
| Segmentation error | Algorithm misclassification | Manual QC, uncertainty quantification |
| Normative matching | Age, gender, scanner match | Closest-match flagging |
| Longitudinal registration | Scan-rescan alignment | Robust registration methods |

#### Consent Requirements

- **MRI scan:** Standard MRI safety and procedure consent
- **Research imaging:** Separate research imaging consent
- **Data sharing:** Optional neuroimaging data sharing consent
- **Radiation:** Not applicable (MRI uses magnetic fields, not radiation)
- **Contrast:** Specific gadolinium consent if contrast used

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Structural state | Sends | Volumetric data feed brain structure model |
| Connectivity state | Sends | Functional connectivity feed network model |
| Multi-modal fusion | Sends | MRI + qEEG structural-functional correlation |
| Risk correlation | Receives | DeepTwin links structure with clinical risk |
| Trajectory modeling | Receives | DeepTwin predicts volumetric changes |

#### Intervention Connections

- **Neuromodulation Studio:** MRI guides targeting (neuronavigation)
- **Risk Analyzer:** Structural findings feed risk assessment
- **Medication Studio:** Neuroimaging-informed medication selection
- **Reports:** Neuroimaging summaries for clinical reports

---

### 1.15 qEEG Analyzer

**Analyzer ID:** `ANLZ-QEEG-015`
**Domain:** Quantitative EEG Analysis
**Status:** Production

#### What It Produces

| Signal Type | Description | Method |
|---|---|---|
| `spectral_power` | Absolute/relative power by band and region | FFT, Welch |
| `coherence_analysis` | Inter-electrode synchronization | Magnitude-squared coherence |
| `phase_lag_index` | Directed connectivity, phase coupling | PLI, dPLI |
| `source_localization` | Cortical source estimation | eLORETA, MNE |
| `microstate_analysis` | Temporal dynamics of global states | K-means clustering |
| `event_related_potentials` | Time-locked responses (P300, N170, etc.) | Averaging |
| `frequency_peak` | Individual alpha frequency (IAF) | Peak detection |
| `thalamocortical_dysrhythmia` | Low-frequency pathology marker | TCD detection |
| `epileptiform_detection` | Spike/sharp wave detection | Automated + review |
| `deviation_score` | Z-score vs. normative database | Database comparison |

**Signal Schema (spectral_power):**
```json
{
  "signal_id": "sig_qeeg_001",
  "analyzer": "ANLZ-QEEG-015",
  "patient_id": "PT-12345",
  "timestamp": "2025-01-12T10:00:00Z",
  "signal_type": "spectral_power",
  "recording_duration": 300,
  "eyes_condition": "closed",
  "montage": "10-20_19ch",
  "bands": {
    "delta": {"absolute": {"F3": 45.2, "F4": 48.1, "O1": 38.9}, "relative": {"F3": 0.18, "F4": 0.19}},
    "theta": {"absolute": {"F3": 52.3, "F4": 55.8, "O1": 31.2}, "relative": {"F3": 0.21, "F4": 0.22}},
    "alpha": {"absolute": {"O1": 42.1, "O2": 39.8}, "relative": {"O1": 0.28, "O2": 0.27}},
    "beta": {"absolute": {"F3": 38.5, "F4": 40.2}, "relative": {"F3": 0.25, "F4": 0.26}},
    "gamma": {"absolute": {"F3": 12.1, "F4": 11.8}, "relative": {"F3": 0.08, "F4": 0.08}}
  },
  "deviation_scores": {
    "theta_beta_ratio": {"value": 2.8, "z_score": 2.4, "flag": "ELEVATED"},
    "alpha_asymmetry": {"value": 0.12, "z_score": 0.8, "flag": "NORMAL"},
    "frontal_alpha": {"value": 18.5, "z_score": 1.6, "flag": "NORMAL"}
  },
  "confidence": 0.91,
  "uncertainty_type": "mixed",
  "artifact_percentage": 4.5,
  "normative_database": "neuroguide_adult",
  "evidence_links": ["evd_theta_beta_adhd_001", "evd_alpha_anxiety_033"]
}
```

#### What It Consumes

| Source | Format | Specification |
|---|---|---|
| EEG amplifier raw data | EDF/BDF | 256-2048 Hz sampling |
| Wearable EEG | Dry electrode data | Variable quality |
| Historical qEEG | Prior exports | Longitudinal comparison |
| ERP paradigms | Task-triggered data | Oddball, GO/NOGO, etc. |
| Sleep EEG | Polysomnography | Overnight recording |

#### Evidence Links

- **Theta/beta ratio:** Elevated in ADHD (Snyder & Hall, 2006 meta-analysis)
- **Alpha asymmetry:** Frontal asymmetry in depression (Davidson, 2004)
- **Source localization:** eLORETA validation for cortical source estimation
- **Microstates:** Altered dynamics in schizophrenia, depression
- **TCD marker:** Thalamocortical dysrhythmia in neuropsychiatric conditions

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Artifact contamination | Eye blink, muscle, movement | ICA/PCA artifact rejection |
| Reference electrode effect | Choice-dependent results | Reference-free measures (PLI) |
| Normative database match | Age, medication state | Matched norms or explicit mismatch flag |
| Recording length | Short recording reliability | Minimum length enforcement |
| Medication effects | Drug-induced EEG changes | Medication status annotation |

#### Consent Requirements

- **EEG recording:** Standard EEG procedure consent
- **Video-EEG:** Additional video recording consent if applicable
- **Research EEG:** Separate research recording consent
- **Neurofeedback:** Specific consent for neurofeedback training sessions

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Brain state model | Sends | qEEG features feed brain state |
| Protocol targeting | Sends | Spectral features guide neuromodulation |
| Structural correlation | Sends | qEEG-MRI structure-function correlation |
| Trajectory modeling | Receives | DeepTwin predicts EEG changes |
| Anomaly detection | Receives | DeepTwin flags unusual patterns |

#### Intervention Connections

- **Neuromodulation Studio:** Direct protocol parameter derivation
- **Risk Analyzer:** qEEG patterns feed risk assessment
- **Medication Studio:** EEG-informed medication selection
- **Reports:** qEEG summaries for clinical documentation

---

### 1.16 Genetic Medication Analyzer

**Analyzer ID:** `ANLZ-GENETIC-016`
**Domain:** Pharmacogenomic Analysis for Psychiatric Medication
**Status:** Production

#### What It Produces

| Signal Type | Description | Genes |
|---|---|---|
| `metabolizer_status` | CYP450 metabolizer phenotype | CYP2D6, CYP2C19, CYP3A4, CYP1A2 |
| `medication_guidance` | Gene-drug interaction recommendations | Multi-gene |
| `adverse_risk_profile` | Side effect risk by medication | HLA-B*57:01, HLA-A*31:01, etc. |
| `dose_recommendation` | Starting dose guidance | CYP + clinical factors |
| `augmentation_logic` | Augmentation strategy suggestions | Multi-gene + clinical |
| `warfarin_dosing` | CYP2C9/VKORC1 dosing | If applicable |
| `clozapine_metabolism` | Clozapine-specific guidance | CYP1A2, CYP3A4 |
| `report_summary` | Patient-friendly pharmacogenomic report | All tested genes |

#### What It Consumes

| Source | Type | Method |
|---|---|---|
| Genetic test results | SNP array, sequencing | Lab import |
| Medication history | Current/past medications | EHR import |
| Clinical factors | Age, weight, comorbidities | Clinical data |
| CPIC guidelines | Guideline database | Curated integration |
| FDA labels | Pharmacogenomic labeling | Automated sync |
| DPWG/CPNDS | International guidelines | Curated integration |

#### Evidence Links

- **CPIC guidelines:** Clinical Pharmacogenetics Implementation Consortium
- **DPWG guidelines:** Dutch Pharmacogenetics Working Group
- **FDA table:** Table of pharmacogenomic biomarkers
- **Psychiatric pharmacogenomics:** GeneSight, CNSDose evidence

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Phenotype inference | Genotype-to-phenotype prediction | Activity score + clinical validation |
| Rare variants | Variants of unknown significance | Explicit VUS reporting |
| Polygenic interactions | Multi-gene effects | Priority to single-gene with strongest evidence |
| Guideline recency | Rapidly evolving field | Date-stamped guideline version |
| Clinical factors | Phenoconversion | Clinical override capability |

#### Consent Requirements

- **Genetic testing:** Comprehensive genetic testing consent
- **Pharmacogenomic use:** Specific consent for medication guidance
- **Data storage:** Genetic data special category under GDPR
- **Research:** Optional genetic research consent
- **Family implications:** Counseling on family implications
- **Insurance protection:** GINA (US) / genetic discrimination protections
- **Withdrawal:** Permanent deletion requirements for genetic data

#### DeepTwin Integration Points

| Integration | Direction | Detail |
|---|---|---|
| Medication modeling | Sends | Metabolizer data feeds medication model |
| Safety integration | Sends | Adverse risk feeds safety monitoring |
| Multi-omic fusion | Sends | Genetic + biomarker + imaging correlation |
| Outcome prediction | Receives | DeepTwin predicts medication response |

#### Intervention Connections

- **Medication Studio:** Primary consumer of genetic data
- **Risk Analyzer:** Genetic risk factors
- **Reports:** Pharmacogenomic summaries

---

### 1.17 DeepTwin Insights Analyzer

**Analyzer ID:** `ANLZ-DEEPTWIN-017`
**Domain:** Multimodal Synthesis and Intelligence Engine
**Status:** Production (Core Platform Engine)

#### What It Produces

| Signal Type | Description | Synthesis Method |
|---|---|---|
| `unified_patient_state` | Holistic patient state representation | Multi-modal fusion |
| `cross_domain_correlation` | Inter-analyzer pattern discovery | Correlation mining |
| `hypothesis_generation` | Clinician-facing hypotheses | Causal inference |
| `anomaly_synthesis` | Multi-modal anomaly detection | Ensemble detection |
| `response_prediction` | Predicted treatment response | Predictive modeling |
| `trajectory_forecast` | Projected clinical trajectory | Time-series forecasting |
| `evidence_synthesis` | Cross-domain evidence integration | Evidence grading |
| `uncertainty_quantification` | Unified uncertainty model | Uncertainty propagation |
| `knowledge_gap` | Missing data recommendations | Information theory |

#### What It Consumes

| Source | Type | Volume |
|---|---|---|
| All analyzer signals | Processed signals | All 16 analyzers |
| Patient history | Longitudinal record | Complete |
| Population patterns | Anonymized cohort data | Platform-wide |
| Evidence database | Literature + guidelines | Continuously updated |
| Clinician feedback | Validation/correction | Interactive |
| Outcome data | Treatment results | Post-intervention |

#### Evidence Links

- **Multi-modal psychiatry:** Integration of imaging, EEG, biomarker evidence
- **Personalized medicine:** Patient-specific evidence synthesis
- **Precision psychiatry:** Emerging multi-modal prediction literature

#### Uncertainty Patterns

| Pattern | Description | Handling |
|---|---|---|
| Conflicting signals | Analyzers disagree | Explicit conflict reporting with confidence |
| Missing modalities | Incomplete data | Reduced-confidence synthesis |
| Model uncertainty | Algorithm limitation | Transparent uncertainty reporting |
| Population drift | Changing patient population | Continuous model recalibration |

#### Consent Requirements

- **DeepTwin processing:** Consent for multi-modal AI processing
- **Population learning:** Optional consent for anonymized learning
- **Hypothesis review:** Clinician review required before action
- **Transparency:** Right to explanation for all hypotheses

#### DeepTwin Integration Points

DeepTwin IS the integration hub. All 16 analyzers feed into it, and it produces the unified insights that drive reports and interventions.

#### Intervention Connections

- **All interventions:** DeepTwin insights inform all intervention planning
- **All analyzers:** Bidirectional feedback loop
- **Reports:** Primary input for report generation
- **Risk Analyzer:** Highest-level risk synthesis

---

## 2. Intervention Ecosystem

> **Design Philosophy:** Interventions are evidence-linked, safety-bounded, and dynamically personalized. No intervention is generated without traceable evidence, safety checks, and clinician oversight. The intervention system operates as a decision-support tool — clinical judgment always prevails.

---

### 2.1 Neuromodulation Studio

**Intervention ID:** `INTV-NEURO-001`
**Category:** Neurostimulation and Brain-Based Interventions
**Status:** Production
**Evidence Grading:** FDA-cleared to experimental (by protocol)

#### Overview

The Neuromodulation Studio manages all brain stimulation and neurofeedback interventions, including transcranial magnetic stimulation (TMS), transcranial direct current stimulation (tDCS), transcranial alternating current stimulation (tACS), transcranial random noise stimulation (tRNS), and photobiomodulation (PBM). It serves as both a protocol design environment and a session management system.

#### What Signals It Consumes

| Signal Source | Specific Signals | Purpose |
|---|---|---|
| qEEG Analyzer | Spectral power, coherence, source localization | Protocol targeting, frequency selection |
| MRI Analyzer | Volumetrics, DTI tracts, functional connectivity | Neuronavigation, target selection |
| Risk Analyzer | Risk tier, specific flags | Safety assessment, contraindication check |
| Biometrics | HRV, sleep quality | Physiological readiness assessment |
| Intervention Analyzer | Historical response data | Protocol optimization |
| DeepTwin | Unified brain state, response prediction | Personalized protocol selection |
| Genetic Medication | CYP1A2 (clozapine-TMS interaction) | Drug-interaction safety |
| Biomarkers | Inflammatory markers | Treatment resistance indicators |

#### What It Produces

| Output | Description | Format |
|---|---|---|
| `stimulation_protocol` | Parameter set for stimulation session | Structured protocol document |
| `session_plan` | Complete session workflow | Session checklist |
| `targeting_coordinates` | MNI or native space coordinates | Coordinate file |
| `protocol_rationale` | Evidence-based justification | Text + evidence links |
| `safety_checklist` | Contraindication verification | Boolean checklist |
| `outcome_tracker` | Pre/post session measures | Assessment battery |
| `progression_logic` | Parameter adaptation rules | Decision tree |
| `termination_criteria` | Stopping rules | Threshold definitions |

**Protocol Schema (TMS depression):**
```json
{
  "protocol_id": "proto_tms_001",
  "intervention_type": "rTMS",
  "indication": "major_depressive_disorder",
  "target": {
    "region": "left_dorsolateral_prefrontal_cortex",
    "method": "neuronavigated",
    "coordinates_mni": {"x": -42, "y": 45, "z": 30},
    "confirmation": "mri_guided"
  },
  "parameters": {
    "frequency": 10,
    "intensity": "120%_rmt",
    "train_duration": 4,
    "inter_train_interval": 11,
    "pulses_per_session": 3000,
    "coil_type": "figure_of_eight"
  },
  "schedule": {
    "sessions_per_week": 5,
    "total_sessions": 30,
    "session_duration_min": 37
  },
  "evidence_base": {
    "primary": "O'Reardon et al. 2007 (Neuronetics FDA clearance)",
    "guideline": "APA 2010, CANMAT 2016",
    "effect_size": "d=0.55 vs. sham"
  },
  "safety_constraints": {
    "seizure_risk_screen": true,
    "intracranial_metal_check": true,
    "medication_interactions": ["theophylline", "anticonvulsants"],
    "max_intensity": "120%_rmt"
  },
  "personalization": {
    "based_on": ["qEEG_alpha_asymmetry", "baseline_severity", "prior_response"],
    "target_adjustment": "qEEG_guided_f3_f4"
  }
}
```

#### Analyzer Feed Mapping

```
qEEG spectral power → Frequency selection for tACS/tRNS
qEEG coherence → Connectivity-targeted protocols
qEEG source localization → Cortical target refinement
MRI volumetrics → Structural target confirmation
MRI DTI → Tract-based targeting
Risk score → Safety level determination
HRV → Session readiness, stress state
Historical response → Protocol optimization
DeepTwin synthesis → Personalized protocol selection
```

#### DeepTwin Integration

| Integration Point | Function |
|---|---|
| Response prediction | Predict likelihood of response to specific protocol |
| Target optimization | Suggest optimal targets based on individual neurophysiology |
| Protocol comparison | Compare expected outcomes across candidate protocols |
| Safety synthesis | Integrated safety assessment across all data sources |
| Progression guidance | Recommend parameter adjustments based on trajectory |
| Anomaly detection | Flag unexpected response patterns |

#### Evidence Requirements

| Protocol Category | Evidence Standard | Documentation Required |
|---|---|---|
| FDA-cleared (TMS MDD) | Regulatory + guidelines | Device clearance, APA/CANMAT |
| CE-marked (tDCS) | European regulatory | CE certificate, evidence summary |
| Research protocols | IRB-approved protocol | IRB number, protocol document |
| Off-label | Case series + mechanistic rationale | Explicit off-label documentation |
| Experimental | Registered clinical trial | ClinicalTrials.gov ID |

#### Safety Boundaries

```
HARD CONSTRAINTS (non-overrideable):
- Seizure history → Automatic escalation review
- Intracranial metal/implants → Protocol exclusion
- Theophylline use → Dose reduction required
- Pregnancy → Absolute contraindication (TMS)
- Substance use acute intoxication → Session deferral

SOFT CONSTRAINTS (clinician overrideable with documentation):
- Age >65 → Reduced intensity consideration
- Polypharmacy → Interaction review required
- Elevated risk tier → Enhanced monitoring
- First-degree seizure relative → Enhanced consent

MONITORING REQUIREMENTS:
- Seizure risk: SAC (Seizure Risk Screen) before first session
- Cognitive: Baseline + session 10 + session 30 cognitive check
- Mood: PHQ-9 before each session week
- Adverse events: Mandatory post-session AE reporting
```

#### Protocol Categories Within Studio

**TMS Protocols:**
- 10 Hz left DLPFC (standard depression)
- iTBS (intermittent theta burst) — shorter sessions
- Bilateral stimulation (treatment-resistant)
- Deep TMS (H-coil) — broader targeting
- Maintenance TMS (relapse prevention)
- OCD-specific (supplementary motor area)

**tDCS Protocols:**
- Depression: F3 anode/F4 cathode (cathodal right)
- Cognitive enhancement: F3 anode/FP2 cathode
- Anxiety: right DLPFC cathodal
- Pain: M1 anode/contralateral supraorbital cathode
- tDCS + task coupling (concurrent stimulation)

**tACS/tRNS Protocols:**
- Alpha entrainment (tACS for anxiety/insomnia)
- Gamma tACS (cognitive enhancement — experimental)
- tRNS for learning/cognitive enhancement
- Coupled with neurofeedback

**Photobiomodulation:**
- Transcranial PBM (1064-1070nm)
- Intranasal PBM
- Systemic PBM (full body)

**Neurofeedback Protocols:**
- SMR (sensorimotor rhythm) training
- Alpha/theta training
- SCP (slow cortical potential) training
- sLORETA/z-score NF
- Infra-low frequency (ILF) training

---

### 2.2 Medication Studio

**Intervention ID:** `INTV-MED-002`
**Category:** Pharmacological Decision Support
**Status:** Production (Decision-Support Only — Not Prescribing)
**Evidence Grading:** Guidelines-based

#### Overview

The Medication Studio provides evidence-based medication decision-support. It explicitly does NOT prescribe — it generates recommendations that must be reviewed, modified, and approved by a licensed prescriber. All outputs are labeled "Decision Support — Requires Clinician Review."

#### What Signals It Consumes

| Signal Source | Specific Signals | Purpose |
|---|---|---|
| Genetic Medication Analyzer | CYP450 metabolizer status | Dose optimization, drug selection |
| Biomarkers | Inflammatory markers | Augmentation logic (anti-inflammatory) |
| Labs Analyzer | Renal, hepatic, metabolic function | Safety screening, monitoring |
| Risk Analyzer | Risk tier, suicide risk | Medication selection, safety |
| Intervention Analyzer | Prior medication response | Resistance/switch logic |
| Text Analyzer | Current medications, allergies | Reconciliation |
| Biometrics | Weight, metabolic trends | Metabolic monitoring |
| DeepTwin | Unified state, response prediction | Personalized selection |
| Bio Database | Drug interactions, guidelines | Safety/efficacy evidence |
| MRI/qEEG | Neuroimaging markers | Neuroimaging-informed selection |

#### What It Produces

| Output | Description | Clinical Use |
|---|---|---|
| `medication_recommendation` | Evidence-based options ranked | Prescriber review |
| `dose_guidance` | Starting/target dose by metabolizer | Prescriber adjustment |
| `augmentation_strategy` | Evidence-based combinations | Treatment optimization |
| `switch_strategy` | Cross-taper protocols | Medication change |
| `safety_monitoring_plan` | Required labs, assessments | Monitoring schedule |
| `interaction_alert` | Drug-drug, drug-gene interactions | Safety warning |
| `resistance_assessment` | Treatment resistance analysis | Strategy change |
| `discontinuation_protocol` | Taper schedule | Safe cessation |

#### Analyzer Feed Mapping

```
Genetic metabolizer status → Drug selection, dose adjustment
CRP/IL-6 elevation → Anti-inflammatory augmentation suggestion
Renal function → Dose adjustment for renally cleared drugs
Hepatic function → Avoid hepatotoxic agents
Current medication list → Interaction screening
Prior response history → Resistance analysis
Risk tier → Safety medication selection (avoid high-risk in high-risk patients)
Weight/metabolic trends → Metabolic monitoring frequency
Neuroimaging markers → Neuroimaging-informed selection (e.g., hippocampal volume → avoid anticholinergics)
```

#### DeepTwin Integration

| Integration Point | Function |
|---|---|
| Response prediction | Predict medication response likelihood |
| Side effect prediction | Predict adverse effect risk profile |
| Optimal sequencing | Recommend medication trial order |
| Outcome forecasting | Project symptom trajectory |
| Resistance detection | Identify treatment resistance patterns |
| Personalization | Integrate all patient data for individualized recommendations |

#### Evidence Requirements

All recommendations require:
- Primary guideline citation (APA, CANMAT, NICE, WHO)
- Evidence grade (A/B/C/D)
- Mechanism of action summary
- Key trial references
- Effect size estimate where available

#### Safety Boundaries

```
HARD CONSTRAINTS:
- Recommendation only — no direct prescribing authority
- All outputs require licensed prescriber review and signature
- High-risk medications flagged with enhanced safety review
- Controlled substance recommendations trigger additional workflow
- Pediatric/geriatric dosing limits enforced
- Pregnancy/lactation contraindications checked

REQUIRED REVIEW TRIGGERS:
- Clozapine recommendations → Hematology review
- Lithium → Renal/thyroid function verification
- MAOIs → Dietary restriction counseling
- Antipsychotics metabolic risk → Baseline metabolic panel
- Anti-dementia medications → Diagnosis verification
```

---

### 2.3 Rehab / Physiotherapy Studio

**Intervention ID:** `INTV-REHAB-003`
**Category:** Physical Rehabilitation and Motor Interventions
**Status:** Production
**Evidence Grading:** Guidelines-based

#### What Signals It Consumes

| Signal Source | Specific Signals | Purpose |
|---|---|---|
| Movement Analyzer | Gait, balance, motor function | Baseline assessment, goal setting |
| Biometrics | Activity, HRV, sleep | Functional capacity, recovery |
| Biomarkers | Inflammatory markers | Exercise tolerance |
| Risk Analyzer | Risk tier | Safety level, supervision needs |
| Intervention Analyzer | Prior therapy response | Protocol selection |
| Behaviour Workspace | Functional assessment | Goal-oriented therapy planning |
| MRI Analyzer | Structural findings | Neurorehabilitation targeting |
| DeepTwin | Unified state | Comprehensive rehabilitation planning |

#### What It Produces

| Output | Description | Format |
|---|---|---|
| `therapy_plan` | Structured rehabilitation program | Multi-week plan |
| `exercise_prescription` | Specific exercises with parameters | Video + text |
| `session_protocol` | Per-session structure | Checklist |
| `progression_criteria` | When and how to advance | Decision rules |
| `safety_screening` | Contraindication check | Boolean + narrative |
| `outcome_measures` | Assessment battery | Scale selection |
| `home_program` | Between-session assignments | Patient portal content |

#### Analyzer Feed Mapping

```
Gait analysis → Gait training protocol selection
Balance assessment → Balance training intensity
Activity data → Exercise tolerance estimation
Motor function → Task-specific rehabilitation
MRI findings → Neurorehabilitation protocol targeting
Cognitive assessment → Dual-task training integration
Risk tier → Supervision level, safety equipment
```

#### Evidence Requirements

- Stroke rehabilitation: AHA/ASA guidelines
- TBI rehabilitation: INCOG guidelines, CARE4TB
- Parkinson's: PD-specific exercise protocols (LSVT BIG, PWR!)
- Falls prevention: Otago Exercise Programme, STEADI
- Cardiac rehab: AACVPR guidelines

#### Safety Boundaries

```
CONTRAINDICATION SCREENING:
- Acute cardiovascular event → Cardiology clearance
- Uncontrolled hypertension → Defer high-intensity
- Recent surgery → Surgeon clearance
- Osteoporosis → High-impact exercise restrictions
- Balance disorder → Fall prevention equipment

MONITORING:
- Vital signs pre/post session
- Pain scale during exercise
- Fatigue monitoring
- Adverse event reporting
```

---

### 2.4 Nutrition & Metabolic Studio

**Intervention ID:** `INTV-NUTR-004`
**Category:** Dietary Interventions and Metabolic Optimization
**Status:** Production
**Evidence Grading:** Evidence-based to emerging

#### What Signals It Consumes

| Signal Source | Specific Signals | Purpose |
|---|---|---|
| Nutrition Analyzer | Dietary pattern, gaps, inflammatory score | Protocol personalization |
| Biomarkers | Nutritional markers, metabolic panel | Deficiency correction |
| Labs Analyzer | Glucose, lipids, HbA1c | Metabolic monitoring |
| Biometrics | Weight, body composition, activity | Progress tracking |
| Genetic Medication | Metabolic genes | Personalized nutrition |
| Risk Analyzer | Metabolic risk | Intervention intensity |
| DeepTwin | Unified metabolic state | Comprehensive plan |

#### What It Produces

| Output | Description | Format |
|---|---|---|
| `nutrition_protocol` | Structured dietary intervention | Meal plan + education |
| `supplement_regimen` | Evidence-based supplementation | Dose, timing, form |
| `metabolic_optimization_plan` | Metabolic health improvement | Multi-domain plan |
| `elimination_protocol` | Food sensitivity investigation | Structured elimination |
| `ketogenic_protocol` | Keto for psychiatric conditions | Medical keto protocol |
| `anti_inflammatory_plan` | DII reduction strategy | Dietary guidance |
| `gut_health_protocol` | Microbiome-supportive nutrition | Fermented foods, fiber, pre/probiotics |

#### Evidence Requirements

- Mediterranean diet depression: SMILES trial (Jacka et al., 2017)
- Omega-3: Mischoulon/Freeman meta-analyses
- Vitamin D: Anglin et al. systematic review
- Ketogenic psychiatry: Case series + mechanistic rationale
- Probiotics: Wallace/Milev psychobiotic reviews

#### Safety Boundaries

```
CONTRAINDICATIONS:
- Eating disorder history → Specialized protocol required
- Kidney disease → Protein restriction, potassium monitoring
- Diabetes medication → Hypoglycemia risk with dietary change
- Warfarin → Vitamin K consistency
- Pregnancy → Modified protocols for safety

MONITORING:
- Weight trends
- Biomarker reassessment (6-12 weeks)
- Symptom tracking
- Medication interactions (supplements)
```

---

### 2.5 Wellness & Lifestyle Studio

**Intervention ID:** `INTV-WELLNESS-005`
**Category:** Sleep, Stress, Exercise, Lifestyle Interventions
**Status:** Production
**Evidence Grading:** Guidelines-based

#### What Signals It Consumes

| Signal Source | Specific Signals | Purpose |
|---|---|---|
| Biometrics | Sleep, HRV, activity, temperature | Baseline, progress tracking |
| Digital Phenotyping | Behavior patterns, circadian data | Intervention targeting |
| Risk Analyzer | Stress/sleep-related risk flags | Priority setting |
| Biomarkers | Cortisol, inflammation | Physiological stress markers |
| Intervention Analyzer | Prior lifestyle intervention response | Protocol selection |
| DeepTwin | Unified wellness state | Holistic planning |

#### What It Produces

| Output | Description | Components |
|---|---|---|
| `sleep_hygiene_protocol` | Sleep improvement program | CBT-I components, environment |
| `stress_management_plan` | Stress reduction strategy | HRV biofeedback, mindfulness |
| `exercise_prescription` | Activity program | Type, intensity, frequency, progression |
| `circadian_optimization` | Rhythm alignment protocol | Light exposure, meal timing, activity |
| `social_engagement_plan` | Connection enhancement | Structured social activities |
| `digital_wellness_plan` | Technology use optimization | Screen time, app recommendations |

#### Safety Boundaries

- Exercise intensity matched to baseline fitness
- Sleep medication changes require prescriber coordination
- CBT-I for insomnia requires trained provider
- Light therapy requires timing precision (circadian phase)

---

### 2.6 Complementary Studio

**Intervention ID:** `INTV-COMP-006`
**Category:** Acupuncture, Mindfulness, Biofeedback, Complementary Approaches
**Status:** Production
**Evidence Grading:** Selective evidence-based

#### What Signals It Consumes

| Signal Source | Specific Signals | Purpose |
|---|---|---|
| Biometrics | HRV, stress markers | Biofeedback baseline |
| qEEG | Brain state | Neurofeedback targeting |
| Biomarkers | Inflammatory markers | Acupuncture mechanism correlation |
| Risk Analyzer | Risk tier | Safety assessment |
| DeepTwin | Unified state | Complementary therapy matching |

#### What It Produces

| Output | Description | Evidence Level |
|---|---|---|
| `acupuncture_protocol` | Point selection, frequency, duration | Moderate (depression, anxiety) |
| `mindfulness_program` | MBSR, MBCT, ACT protocols | Strong (depression relapse prevention) |
| `biofeedback_protocol` | HRV, EEG, GSR biofeedback | Moderate (anxiety, ADHD) |
| `breathing_protocol` | Controlled breathing exercises | Emerging |
| `yoga/movement_program` | Yoga for mental health | Moderate |
| `nature_exposure_plan` | Ecotherapy, forest bathing | Emerging |

#### Safety Boundaries

- Acupuncture: Licensed practitioner required, sterile technique
- Neurofeedback: Appropriate training required
- Herbal supplements: Drug interaction screening required
- Yoga/Exercise: Physical contraindication screening

---

### 2.7 Handbooks & Evidence Studio

**Intervention ID:** `INTV-EVID-007`
**Category:** Clinical Guidelines, Research Protocols, Evidence Repository
**Status:** Production
**Evidence Grading:** All levels

#### What Signals It Consumes

| Signal Source | Specific Signals | Purpose |
|---|---|---|
| Bio Database | Literature, guidelines | Content source |
| All analyzers | Patient-specific data | Personalized evidence matching |
| DeepTwin | Patient state | Evidence relevance scoring |
| Clinician input | Clinical questions | On-demand evidence retrieval |

#### What It Produces

| Output | Description | Coverage |
|---|---|---|
| `guideline_summary` | Condition-specific guideline extraction | APA, NICE, CANMAT, WHO |
| `evidence_summary` | Research evidence for specific questions | PubMed-synthesized |
| `protocol_template` | Research protocol templates | Investigator-initiated |
| `case_conference_prep` | Evidence packet for discussion | Multi-source synthesis |
| `patient_education` | Evidence-based patient materials | Reading level appropriate |
| `audit_tool` | Quality improvement tools | Guideline adherence |

---

## 3. Signal Flow Architecture

### 3.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEEPSYNAPS SIGNAL FLOW ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DATA SOURCES          ANALYZERS              SIGNALS           INTERVENTIONS │
│  ─────────────         ─────────              ───────           ─────────── │
│                                                                              │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐        ┌─────────┐ │
│  │ Lab Feeds│────────▶│ Biomarkers │────────▶│ bio_sigs│───────▶│Medication│ │
│  │(HL7 FHIR)│         │  Analyzer  │         │         │┌─────▶│ Studio   │ │
│  └──────────┘         └────────────┘         └─────────┘│      └─────────┘ │
│       │                                              │    │      ┌─────────┐ │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│      │Nutrition │ │
│  │Wearables │────────▶│ Biometrics │────────▶│ bio_sigs││      │& Metab. │ │
│  │  APIs    │         │  Analyzer  │         │         ││      └─────────┘ │
│  └──────────┘         └────────────┘         └─────────┘│                   │
│       │                                              │    │      ┌─────────┐ │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│      │ Wellness│ │
│  │  EEG Amp │────────▶│   qEEG     │────────▶│eeg_sigs │├─────▶│& Lifestyle│ │
│  │          │         │  Analyzer  │         │         ││      └─────────┘ │
│  └──────────┘         └────────────┘         └─────────┘│                   │
│       │                                              │    │      ┌─────────┐ │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│      │Neuromod- │ │
│  │  MRI     │────────▶│   MRI      │────────▶│mri_sigs │├─────▶│ulation  │ │
│  │ Scanner  │         │  Analyzer  │         │         ││      │ Studio   │ │
│  └──────────┘         └────────────┘         └─────────┘│      └─────────┘ │
│       │                                              │    │                   │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│      ┌─────────┐ │
│  │  Audio   │────────▶│   Voice    │────────▶│voc_sigs ││      │ Rehab/   │ │
│  │  Record  │         │  Analyzer  │         │         ││      │Physio   │ │
│  └──────────┘         └────────────┘         └─────────┘│      └─────────┘ │
│       │                                              │    │                   │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│      ┌─────────┐ │
│  │  Video   │────────▶│   Video    │────────▶│vid_sigs ││      │Complemen-│ │
│  │  Record  │         │ Assessment │         │         ││      │tary     │ │
│  └──────────┘         └────────────┘         └─────────┘│      └─────────┘ │
│       │                                              │    │                   │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│      ┌─────────┐ │
│  │  Phone   │────────▶│  Digital   │────────▶│dig_sigs ││      │Handbooks │ │
│  │  Sensors │         │Phenotyping │         │         ││      │&Evidence│ │
│  └──────────┘         └────────────┘         └─────────┘│      └─────────┘ │
│       │                                              │    │                   │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│                   │
│  │ Genetic  │────────▶│  Genetic   │────────▶│gen_sigs ││                   │
│  │  Tests   │         │ Medication │         │         ││                   │
│  └──────────┘         └────────────┘         └─────────┘│                   │
│       │                                              │    │                   │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│                   │
│  │ Clinical │────────▶│   Text     │────────▶│txt_sigs ││                   │
│  │  Notes   │         │  Analyzer  │         │         ││                   │
│  └──────────┘         └────────────┘         └─────────┘│                   │
│       │                                              │    │                   │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│                   │
│  │ Movement │────────▶│  Movement  │────────▶│mov_sigs ││                   │
│  │  Sensors │         │  Analyzer  │         │         ││                   │
│  └──────────┘         └────────────┘         └─────────┘│                   │
│       │                                              │    │                   │
│  ┌──────────┐         ┌────────────┐         ┌─────────┐│                   │
│  │ Clinician│────────▶│  Behaviour │────────▶│beh_sigs ││                   │
│  │  Ratings │         │ Workspace  │         │         ││                   │
│  └──────────┘         └────────────┘         └─────────┘│                   │
│                       ┌────────────┐         ┌─────────┐│                   │
│                       │    Risk    │────────▶│risk_sigs││                   │
│                       │  Analyzer  │         │         ││                   │
│                       └────────────┘         └─────────┘│                   │
│                       ┌────────────┐         ┌─────────┐│                   │
│                       │   Labs     │────────▶│lab_sigs ││                   │
│                       │  Analyzer  │         │         ││                   │
│                       └────────────┘         └─────────┘│                   │
│                       ┌────────────┐         ┌─────────┐│                   │
│                       │  Nutrition │────────▶│nut_sigs ││                   │
│                       │  Analyzer  │         │         ││                   │
│                       └────────────┘         └─────────┘│                   │
│                       ┌────────────┐         ┌─────────┐│                   │
│                       │   Bio      │────────▶│ref_sigs ││                   │
│                       │  Database  │         │         ││                   │
│                       └────────────┘         └─────────┘│                   │
│                       ┌────────────┐         ┌─────────┐│                   │
│                       │Intervention│────────▶│int_sigs ││                   │
│                       │  Analyzer  │         │         ││                   │
│                       └────────────┘         └─────────┘│                   │
│                              │                         │    │                   │
│                              ▼                         ▼    │                   │
│                    ┌──────────────────────────────────┐   │                   │
│                    │         DEEPREVIEW LAYER          │   │                   │
│                    │     (Signal Quality & Routing)    │   │                   │
│                    └──────────────────────────────────┘   │                   │
│                              │                         │    │                   │
│                              ▼                         ▼    │                   │
│                    ┌──────────────────────────────────┐   │                   │
│                    │          DEEPDYN LAYER           │◄──┘                   │
│                    │   (Intelligence & Orchestration)  │                       │
│                    │                                  │                       │
│                    │  ┌────────────┐  ┌────────────┐ │                       │
│                    │  │  DeepTwin  │  │  Evidence  │ │                       │
│                    │  │  Engine    │  │   Engine   │ │                       │
│                    │  │            │  │            │ │                       │
│                    │  │• Multimodal│  │• Guideline │ │                       │
│                    │  │  Fusion    │  │  Matching  │ │                       │
│                    │  │• Correlat. │  │• Literature│ │                       │
│                    │  │• Hypotheses│  │  Search    │ │                       │
│                    │  │• Anomaly   │  │• Evidence  │ │                       │
│                    │  │  Detection │  │  Grading   │ │                       │
│                    │  │• Prediction│  │• Citation  │ │                       │
│                    │  │• Uncertainty│ │  Linking   │ │                       │
│                    │  └────────────┘  └────────────┘ │                       │
│                    └──────────────────────────────────┘                       │
│                              │                                               │
│                              ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        REPORT GENERATION                             │   │
│  │                                                                      │   │
│  │   DeepTwin Synthesis + Evidence + Clinician Review ──▶ Final Report  │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Specific Signal Flows

#### 3.2.1 qEEG → Protocol Builder Flow

```
qEEG Recording ──▶ Artifact Rejection ──▶ Spectral Analysis
                                              │
                                              ▼
┌──────────────────────────────────────────────────────────────┐
│  SPECTRAL FEATURE EXTRACTION                                  │
│  ├── Absolute power by band (delta, theta, alpha, beta, gamma)│
│  ├── Relative power ratios                                   │
│  ├── Inter-hemispheric coherence                             │
│  ├── Phase lag index (directional connectivity)              │
│  ├── Source localization (eLORETA)                           │
│  └── Deviation from normative database (z-scores)            │
└──────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌──────────────────────────────────────────────────────────────┐
│  PROTOCOL PARAMETER DERIVATION                                │
│                                                              │
│  IF theta/beta ratio > 2.0 z-score:                        │
│    → Target: F3 (left DLPFC)                               │
│    → Protocol: Beta up-training (SMR or beta NFT)          │
│    → OR tDCS: F3 anode / F4 cathode                        │
│    → Frequency: 15-20 Hz if tACS                           │
│                                                              │
│  IF alpha asymmetry (F4>F3) > 1.5 z-score:                │
│    → Target: Left frontal (F3)                             │
│    → Protocol: Alpha enhancement / rTMS 10 Hz left DLPFC   │
│    → Asymmetry index guides protocol selection               │
│                                                              │
│  IF frontal hypoactivation (low beta):                     │
│    → Target: F3/F4                                         │
│    → Protocol: tDCS anodal to frontal / Beta NFT           │
│                                                              │
│  IF thalamocortical dysrhythmia markers:                   │
│    → Target: Thalamic-cortical loop regions                │
│    → Protocol: tRNS or specific frequency targeting          │
│                                                              │
│  IF connectivity deficit (low coherence):                  │
│    → Target: Disconnected regions                          │
│    → Protocol: tACS at intrinsic frequency                 │
└──────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌──────────────────────────────────────────────────────────────┐
│  SAFETY & PERSONALIZATION LAYER                               │
│  ├── MRI confirmation of target location                     │
│  ├── Risk tier assessment (contraindication check)           │
│  ├── Medication interaction screening                        │
│  ├── Seizure risk evaluation                                 │
│  ├── Prior response history integration                      │
│  └── Patient preference incorporation                        │
└──────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                                  FINAL PROTOCOL
                                  ┌─────────────┐
                                  │ • Target    │
                                  │ • Parameters│
                                  │ • Schedule  │
                                  │ • Safety    │
                                  │ • Rationale │
                                  │ • Evidence  │
                                  └─────────────┘
                                              │
                                              ▼
                                    DeepTwin Review
                                    Clinician Approval
                                    Session Execution
                                    Outcome Loopback
```

#### 3.2.2 MRI → Risk Analyzer + DeepTwin Flow

```
MRI Acquisition ──▶ Preprocessing ──▶ Multi-Sequence Analysis
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
              ┌─────────┐          ┌──────────┐          ┌──────────┐
              │T1 Volume│          │  DTI     │          │rs-fMRI   │
              │Analysis │          │  Tracts  │          │Networks  │
              └────┬────┘          └────┬─────┘          └────┬─────┘
                   │                    │                     │
                   ▼                    ▼                     ▼
            Hippocampal          White matter           Default mode
            volume               integrity              network
            reduction            (FA/MD)                connectivity
            (z-score)                                   alteration
                   │                    │                     │
                   └────────────────────┼─────────────────────┘
                                        │
                                        ▼
                    ┌──────────────────────────────────────┐
                    │    STRUCTURAL SIGNAL AGGREGATION      │
                    │                                       │
                    │ • Regional volumes (normalized)       │
                    │ • Cortical thickness by region         │
                    │ • White matter integrity by tract      │
                    │ • Functional connectivity matrices     │
                    │ • Lesion/structural anomaly detection  │
                    │ • Asymmetry indices                    │
                    │ • Quality metrics                      │
                    └──────────────────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
            ┌──────────────┐                      ┌──────────────┐
            │ RISK ANALYZER │                      │   DEEPTWIN   │
            │               │                      │              │
            │ Risk signal   │                      │ Structural-  │
            │ components:   │                      │ functional   │
            │               │                      │ correlation  │
            │ • Structural│                      │              │
            │   risk factor │                      • Volume-     │
            │   (atrophy)   │                      │   cognition  │
            │ • Age-adjusted│                      │   link       │
            │   deviation   │                      │              │
            │ • Cognition-  │                      • WM integrity-│
            │   structure   │                      │   speed link  │
            │   correlation │                      │              │
            │ • Longitudinal│                      • DMN          │
            │   change rate │                      │   depression  │
            │               │                      │   correlation │
            └───────────────┘                      │              │
                    │                              • Multi-modal  │
                    │                              │   hypothesis  │
                    │                              │   generation  │
                    │                              └──────────────┘
                    │                                      │
                    └──────────────┬───────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────┐
                    │    COMBINED RISK ASSESSMENT           │
                    │                                       │
                    │ Structural findings × Clinical risk   │
                    │ × Biomarkers × Biometrics × History   │
                    │                                       │
                    │ Example:                              │
                    │ "Hippocampal volume -1.8z + elevated  │
                    │ CRP + sleep disruption + prior episode│
                    │ → Elevated relapse risk (confidence:  │
                    │ 0.82) → Consider maintenance therapy" │
                    └──────────────────────────────────────┘
```

#### 3.2.3 Biomarkers → Medication Studio + Nutrition Flow

```
Lab Draw ──▶ Lab Processing ──▶ Result Entry
                                      │
                                      ▼
                    ┌──────────────────────────────────────┐
                    │    BIOMARKER PANEL PROCESSING         │
                    │                                       │
                    │  INFLAMMATORY PANEL:                  │
                    │  ├── CRP: 8.4 mg/L (HIGH, z=2.3)     │
                    │  ├── IL-6: 12.1 pg/mL (ELEVATED)     │
                    │  ├── TNF-alpha: 3.2 pg/mL (NORMAL)   │
                    │  └── GlycA: 385 µmol/L (HIGH)        │
                    │                                       │
                    │  METABOLIC PANEL:                     │
                    │  ├── Glucose: 112 mg/dL (ELEVATED)   │
                    │  ├── HbA1c: 5.9% (BORDERLINE)        │
                    │  ├── Insulin: 18 µIU/mL (ELEVATED)   │
                    │  └── HOMA-IR: 5.0 (INSULIN RESISTANT)│
                    │                                       │
                    │  NUTRITIONAL PANEL:                   │
                    │  ├── Vitamin D: 18 ng/mL (DEFICIENT) │
                    │  ├── B12: 280 pg/mL (LOW-NORMAL)      │
                    │  ├── Folate: 12 ng/mL (NORMAL)        │
                    │  └── Omega-3 index: 3.2% (LOW)       │
                    │                                       │
                    │  HORMONAL PANEL:                      │
                    │  ├── Cortisol AM: 18 µg/dL (ELEVATED)│
                    │  ├── Testosterone: 380 ng/dL (LOW)    │
                    │  └── Thyroid: TSH 3.8 (BORDERLINE)   │
                    └──────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │ MEDICATION    │  │   NUTRITION   │  │   DEEPTWIN   │
            │   STUDIO      │  │   & METABOLIC │  │              │
            │               │  │    STUDIO     │  │              │
            │ Inflammation  │  │               │  │ Metabolic-   │
            │ informs:      │  │ Deficiency-   │  │ inflammatory │
            │               │  │ driven        │  │ synthesis    │
            │ • Anti-       │  │ interventions:│  │              │
            │   inflammat.  │  │               │  │ Hypothesis:  │
            │   augment.    │  │ • Vitamin D3  │  │ "Inflammatory│
            │   (NSAID,     │  │   4000 IU/day │  │  depression  │
            │    minocycline│  │               │  │  with insulin│
            │    etc.)      │  │ • Omega-3     │  │  resistance  │
            │               │  │   EPA 2g/day  │  │  → Consider  │
            │ Metabolic     │  │               │  │  metformin   │
            │ risk informs: │  │ • B12         │  │  augmentation│
            │               │  │   supplementation│              │
            │ • Avoid       │  │               │  │ Priority:    │
            │   weight-gain │  │ • Anti-       │  │ Address      │
            │   agents      │  │   inflammatory│  │ metabolic    │
            │ • Metabolic   │  │   diet        │  │ syndrome     │
            │   monitoring  │  │               │  │ first"       │
            │   frequency   │  │ • Stress      │  │              │
            │               │  │   management  │  │              │
            │ Cortisol      │  │   (cortisol)  │  │              │
            │ informs:      │  │               │  │              │
            │               │  │ • Exercise    │  │              │
            │ • Consider    │  │   prescription│  │              │
            │   stress      │  │               │  │              │
            │   reduction   │  │ • Sleep       │  │              │
            │   as augment. │  │   optimization│  │              │
            └───────────────┘  └───────────────┘  └──────────────┘
```

#### 3.2.4 Voice/Video/Text → Behaviour Workspace Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    VOICE    │    │    VIDEO    │    │    TEXT     │
│   RECORD    │    │   RECORD    │    │    NOTES    │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│Voice Analyzer│   │Video Assess.│   │ Text Analyzer│
│             │    │   Analyzer   │    │             │
│ • Prosody   │    │ • Facial     │    │ • Entities  │
│ • Sentiment │    │   expression │    │ • Relations │
│ • Rate      │    │ • Movement   │    │ • Sentiment │
│ • Cognitive │    │ • Gaze       │    │ • Temporal  │
│   markers   │    │ • Affect     │    │ • Risk      │
│ • Depression│    │   flattening │    │   mentions  │
│   voice     │    │ • Psychomotor│    │             │
│   markers   │    │   retardation│    │             │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  MULTIMODAL FUSION    │
              │     (DeepTwin)        │
              │                       │
              │  Cross-modal validation│
              │  ─────────────────────│
              │  Voice depression +    │
              │  Facial reduced affect │
              │  + Text negative       │
              │  sentiment             │
              │  → CONVERGENT: High    │
              │  confidence depression │
              │  signal                │
              │                       │
              │  Voice depression +    │
              │  Facial normal affect +│
              │  Text neutral          │
              │  → DIVERGENT: Explore  │
              │  context (masking,     │
              │  situational factor)   │
              │                       │
              │  Inconsistency         │
              │  detection → Flag for  │
              │  clinical attention    │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  BEHAVIOUR WORKSPACE  │
              │                       │
              │ Integrated behavioral │
              │ assessment with:      │
              │                       │
              │ • Voice markers       │
              │ • Facial analysis     │
              │ • Movement data       │
              │ • Cognitive tests     │
              │ • Functional assess.  │
              │ • Self-report scales  │
              │ • Digital phenotype   │
              │                       │
              │ → Comprehensive       │
              │   behavioral profile  │
              │   for diagnosis and   │
              │   treatment planning  │
              └───────────────────────┘
```

#### 3.2.5 Digital Phenotyping → Longitudinal Insights Flow

```
Continuous Phone Sensing ──▶ Raw Feature Extraction
                                    │
                                    ▼
                    ┌──────────────────────────────────────┐
                    │    DIGITAL BEHAVIOR FEATURES          │
                    │                                       │
                    │  SOCIAL:                              │
                    │  ├── Call frequency (daily)           │
                    │  ├── Call duration distribution       │
                    │  ├── SMS frequency                    │
                    │  ├── Response time                    │
                    │  └── Reciprocity index                │
                    │                                       │
                    │  MOBILITY:                            │
                    │  ├── Location variance (entropy)      │
                    │  ├── Home stay time %                 │
                    │  ├── Number of unique locations       │
                    │  ├── Regular vs. irregular patterns   │
                    │  └── Travel radius                    │
                    │                                       │
                    │  APP/DIGITAL:                         │
                    │  ├── Screen on time                   │
                    │  ├── App category usage               │
                    │  ├── Typing speed/patterns            │
                    │  └── Phone unlock frequency           │
                    │                                       │
                    │  CIRCADIAN:                           │
                    │  ├── Sleep/wake regularity            │
                    │  ├── First/last phone use             │
                    │  └── Weekend regularity index         │
                    └──────────────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────────────┐
                    │    TEMPORAL PATTERN ANALYSIS          │
                    │                                       │
                    │  TREND DETECTION:                     │
                    │  ├── 7-day rolling averages           │
                    │  ├── Week-over-week change            │
                    │  ├── Seasonal patterns                │
                    │  └── Holiday/event deviations         │
                    │                                       │
                    │  ANOMALY DETECTION:                   │
                    │  ├── Sudden change alerts             │
                    │  ├── Gradual drift detection          │
                    │  ├── Individual baseline dev.         │
                    │  └── Population outlier flag          │
                    │                                       │
                    │  PATTERN TYPES:                       │
                    │  • Improving (gradual normalization)  │
                    │  • Declining (gradual worsening)      │
                    │  • Crisis (sudden dramatic change)    │
                    │  • Cyclic (recurring patterns)        │
                    │  • Stable (consistent baseline)       │
                    └──────────────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────────────┐
                    │    LONGITUDINAL INSIGHTS              │
                    │    (DeepTwin Integration)             │
                    │                                       │
                    │ Cross-domain temporal correlation:    │
                    │ "Social withdrawal preceded by 3-5    │
                    │  days of sleep disruption"            │
                    │                                       │
                    │ Predictive patterns:                  │
                    │ "Pattern of reduced mobility +        │
                    │  increased nighttime phone use        │
                    │  historically predicts mood episode   │
                    │  onset in 7-10 days (sensitivity 0.72│
                    │  specificity 0.84)"                   │
                    │                                       │
                    │ Intervention timing:                  │
                    │ "Optimal intervention window detected │
                    │  based on early warning pattern"      │
                    │                                       │
                    │ Circadian alignment score:            │
                    │ Track and correlate with symptom      │
                    │ severity and treatment response       │
                    └──────────────────────────────────────┘
```

#### 3.2.6 Genetic → Medication Studio Flow

```
Genetic Sample ──▶ Sequencing/Genotyping ──▶ Variant Calling
                                                  │
                                                  ▼
                    ┌──────────────────────────────────────────┐
                    │    PHARMACOGENOMIC ANALYSIS               │
                    │                                           │
                    │  CYP2D6: *1/*4 (INTERMEDIATE metabolizer)│
                    │  CYP2C19: *1/*2 (INTERMEDIATE metabolizer)│
                    │  CYP3A4: *1/*1 (NORMAL/extensive)        │
                    │  CYP1A2: *1F/*1F (ULTRA-RAPID, induced)  │
                    │  CYP2B6: *1/*6 (REDUCED function)        │
                    │                                           │
                    │  HLA-B*57:01: Negative (safe for CBZ)    │
                    │  HLA-A*31:01: Negative                   │
                    │  HLA-B*15:02: Negative                   │
                    │                                           │
                    │  SLCO1B1: *1A/*1A (normal statin)        │
                    │  VKORC1: -1639 G/A (intermediate warfarin)│
                    │  MTHFR: C677T heterozygous                │
                    └──────────────────────────────────────────┘
                                                  │
                                                  ▼
                    ┌──────────────────────────────────────────┐
                    │    MEDICATION IMPLICATIONS                │
                    │                                           │
                    │ CYP2D6 INTERMEDIATE:                      │
                    │ • Venlafaxine: Reduce dose 25%            │
                    │ • Aripiprazole: Standard dose (partial)   │
                    │ • Haloperidol: Consider 30% dose reduction│
                    │ • Atomoxetine: Increased response at std  │
                    │ • Tricyclics: Toxicity risk → alternatives│
                    │                                           │
                    │ CYP2C19 INTERMEDIATE:                     │
                    │ • Escitalopram: May need dose increase    │
                    │ • Citalopram: Monitor levels              │
                    │ • Sertraline: Alternative preferred       │
                    │                                           │
                    │ CYP1A2 ULTRA-RAPID (smoking/inducible):   │
                    │ • Clozapine: May need 50%+ higher dose    │
                    │ • Olanzapine: Reduced levels likely       │
                    │ • Important: Smoking status affects dose  │
                    │                                           │
                    │ COMBINED EFFECTS:                         │
                    │ • Venlafaxine (CYP2D6) + smoking (CYP1A2)│
                    │   → Complex interaction, TDM recommended  │
                    │ • MTHFR variant → Consider L-methylfolate │
                    │   augmentation                            │
                    └──────────────────────────────────────────┘
                                                  │
                                                  ▼
                    ┌──────────────────────────────────────────┐
                    │    MEDICATION STUDIO INTEGRATION          │
                    │                                           │
                    │ Priority medication list:                 │
                    │ 1. Sertraline (CYP2C19 tolerable)        │
                    │ 2. Escitalopram (monitor, may titrate up)│
                    │ 3. Avoid: Venlafaxine if possible (CYP2D6)│
                    │ 4. Augmentation: L-methylfolate 15mg     │
                    │    (MTHFR variant)                        │
                    │                                           │
                    │ Safety monitoring:                        │
                    │ • Standard metabolizer = standard monitoring│
                    │ • No HLA-B risk alleles detected          │
                    │ • If clozapine needed: TDM required       │
                    │                                           │
                    │ Evidence: CPIC guidelines (2023),         │
                    │ FDA pharmacogenomic table                 │
                    └──────────────────────────────────────────┘
```

#### 3.2.7 All Analyzers → DeepTwin Flow

```
All 16 analyzers ──▶ Signal Ingestion Layer ──▶ Quality Scoring
                                                      │
                                                      ▼
                                    ┌────────────────────────────────┐
                                    │     SIGNAL QUALITY CHECKS       │
                                    │                                │
                                    │ • Confidence threshold (>0.5)   │
                                    │ • Missing data flagging         │
                                    │ • Temporal alignment           │
                                    │ • Consistency checks           │
                                    │ • Outlier detection            │
                                    │ • Source verification          │
                                    └────────────────────────────────┘
                                                      │
                                                      ▼
                                    ┌────────────────────────────────┐
                                    │    DEEPDYN INTELLIGENCE LAYER   │
                                    │                                │
                                    │ ┌────────────────────────────┐ │
                                    │ │      DeepTwin Engine       │ │
                                    │ │                            │ │
                                    │ │  1. MULTIMODAL FUSION      │ │
                                    │ │     • Feature concatenation│ │
                                    │ │     • Attention weighting  │ │
                                    │ │     • Temporal alignment   │ │
                                    │ │     • Missing data handling│ │
                                    │ │                            │ │
                                    │ │  2. CORRELATION MINING     │ │
                                    │ │     • Cross-domain pattern │ │
                                    │ │       discovery            │ │
                                    │ │     • Temporal lag analysis│ │
                                    │ │     • Granger causality    │ │
                                    │ │     • Partial correlation  │ │
                                    │ │                            │ │
                                    │ │  3. HYPOTHESIS GENERATION  │ │
                                    │ │     • Clinician-facing     │ │
                                    │ │       explanations         │ │
                                    │ │     • Causal inference     │ │
                                    │ │     • Counterfactuals      │ │
                                    │ │                            │ │
                                    │ │  4. ANOMALY DETECTION      │ │
                                    │ │     • Multi-modal outliers │ │
                                    │ │     • Pattern breaks       │ │
                                    │ │     • Safety-critical flags│ │
                                    │ │                            │ │
                                    │ │  5. PREDICTION ENGINE      │ │
                                    │ │     • Response prediction  │ │
                                    │ │     • Trajectory forecast  │ │
                                    │ │     • Risk projection      │ │
                                    │ │                            │ │
                                    │ │  6. UNCERTAINTY ENGINE      │ │
                                    │ │     • Confidence calibration│ │
                                    │     • Conflict resolution    │ │
                                    │ │     • Missing data impact  │ │
                                    │ └────────────────────────────┘ │
                                    │                                │
                                    │ ┌────────────────────────────┐ │
                                    │ │     Evidence Engine        │ │
                                    │ │                            │ │
                                    │ │  • Guideline matching      │ │
                                    │ │  • Literature retrieval    │ │
                                    │ │  • Evidence grading        │ │
                                    │ │  • Citation linking        │ │
                                    │ │  • Population norms        │ │
                                    │ └────────────────────────────┘ │
                                    └────────────────────────────────┘
                                                      │
                                                      ▼
                                    ┌────────────────────────────────┐
                                    │      DEEPTWIN OUTPUTS           │
                                    │                                │
                                    │ • Unified Patient State        │
                                    │ • Cross-Domain Correlations    │
                                    │ • Generated Hypotheses         │
                                    │ • Predicted Trajectories       │
                                    │ • Anomaly Alerts               │
                                    │ • Evidence-Supported Insights  │
                                    │ • Uncertainty Summary          │
                                    │ • Knowledge Gap Analysis       │
                                    └────────────────────────────────┘
                                                      │
                                                      ▼
                                           REPORT GENERATION
```

#### 3.2.8 DeepTwin → Reports Flow

```
DeepTwin Outputs ──▶ Report Assembly ──▶ Clinician Review
                                                  │
                                                  ▼
                    ┌──────────────────────────────────────────┐
                    │    REPORT COMPONENTS                      │
                    │                                           │
                    │ EXECUTIVE SUMMARY                         │
                    │ • Key findings (confidence-graded)        │
                    │ • Risk assessment summary                 │
                    │ • Prioritized recommendations             │
                    │ • Uncertainty summary                     │
                    │                                           │
                    │ MULTI-MODAL SYNTHESIS                     │
                    │ • DeepTwin correlation findings           │
                    │ • Cross-domain pattern analysis           │
                    │ • Hypotheses with supporting evidence     │
                    │ • Contradictions and conflicts flagged    │
                    │                                           │
                    │ ANALYZER SECTIONS (by domain)             │
                    │ • Risk: Score, tier, drivers, trend       │
                    │ • Biomarkers: Panel results, trends       │
                    │ • Biometrics: HRV, sleep, activity        │
                    │ • Neuroimaging: MRI + qEEG findings       │
                    │ • Behavioral: Voice, video, text, tests   │
                    │ • Genetic: Medication guidance            │
                    │ • Digital: Passive sensing summary        │
                    │                                           │
                    │ EVIDENCE BASE                             │
                    │ • Guideline references                    │
                    │ • Key trial citations                     │
                    │ • Population comparison                   │
                    │ • Evidence grades                         │
                    │                                           │
                    │ RECOMMENDATIONS                           │
                    │ • Prioritized intervention options        │
                    │ • Protocol suggestions (where applicable) │
                    │ • Monitoring plan                         │
                    │ • Follow-up schedule                      │
                    │                                           │
                    │ UNCERTAINTY & LIMITATIONS                 │
                    │ • Explicit uncertainty statement          │
                    │ • Missing data gaps                       │
                    │ • Confidence levels per finding           │
                    │ • Recommended additional testing          │
                    │                                           │
                    │ GOVERNANCE                                │
                    │ • Consent verification                    │
                    │ • Audit trail                             │
                    │ • Clinician attestation                   │
                    │ • Report version                          │
                    └──────────────────────────────────────────┘
```

### 3.3 Signal Routing Rules

```
ROUTING LOGIC:

1. EVERY signal includes:
   - Source analyzer ID
   - Patient ID
   - Timestamp
   - Confidence score
   - Uncertainty type
   - Evidence links

2. Signal routing decisions:
   IF confidence < 0.5 → Flag for manual review, exclude from synthesis
   IF confidence 0.5-0.7 → Include with uncertainty annotation
   IF confidence > 0.7 → Include in standard synthesis
   IF confidence > 0.9 → Include as high-confidence evidence

3. Missing data handling:
   IF modality missing → Graceful degradation
   IF critical modality missing → Report generation blocked pending data
   IF >50% modalities missing → Report generation deferred

4. Conflict resolution:
   IF analyzers conflict → DeepTwin conflict resolution protocol
   IF DeepTwin cannot resolve → Flag for clinical review
   IF safety-critical conflict → Escalation alert

5. Temporal alignment:
   All signals timestamped and aligned to assessment date
   Signals >90 days old flagged as "stale"
   Longitudinal signals time-series aligned
```

---

## 4. DeepTwin Integration Points

### 4.1 DeepTwin Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEEPTWIN ENGINE ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT LAYER ──▶ PROCESSING LAYER ──▶ OUTPUT LAYER ──▶ FEEDBACK LOOP      │
│                                                                              │
│  ┌───────────┐    ┌───────────────────────────────┐    ┌──────────────┐   │
│  │  Signal   │    │    MULTIMODAL PROCESSING      │    │   Unified    │   │
│  │  Ingest.  │───▶│                               │───▶│   Patient    │   │
│  │  (16      │    │  ┌─────────────────────────┐  │    │   State      │   │
│  │   analyzers│    │  │  Feature Engineering    │  │    │   Vector     │   │
│  └───────────┘    │  │  • Domain encoding      │  │    └──────┬───────┘   │
│                   │  │  • Temporal features    │  │           │           │
│  ┌───────────┐    │  │  • Cross-modal features │  │           ▼           │
│  │  Patient  │───▶│  └─────────────────────────┘  │    ┌──────────────┐   │
│  │  History  │    │                               │    │  Correlation │   │
│  │  (longit.)│    │  ┌─────────────────────────┐  │    │    Matrix    │   │
│  └───────────┘    │  │  Attention / Weighting  │  │    └──────┬───────┘   │
│                   │  │  • Signal reliability    │  │           │           │
│  ┌───────────┐    │  │  • Temporal relevance   │  │           ▼           │
│  │  Evidence │───▶│  │  • Clinical priority    │  │    ┌──────────────┐   │
│  │  Database │    │  └─────────────────────────┘  │    │  Hypotheses  │   │
│  │           │    │                               │    │  (clinician  │   │
│  └───────────┘    │  ┌─────────────────────────┐  │    │   facing)    │   │
│                   │  │  Fusion / Integration   │  │    └──────┬───────┘   │
│  ┌───────────┐    │  │  • Early fusion         │  │           │           │
│  │ Population│───▶│  │  • Late fusion          │  │           ▼           │
│  │  Patterns │    │  │  • Hybrid fusion        │  │    ┌──────────────┐   │
│  │           │    │  └─────────────────────────┘  │    │  Predictions │   │
│  └───────────┘    │                               │    │  & Forecasts │   │
│                   │  ┌─────────────────────────┐  │    └──────┬───────┘   │
│                   │  │  Uncertainty Quant.     │  │           │           │
│                   │  │  • Confidence calibration│  │           ▼           │
│                   │  │  • Error propagation    │  │    ┌──────────────┐   │
│                   │  │  • Missing data impact  │  │    │  Anomaly     │   │
│                   │  │  • Ensemble variance    │  │    │  Alerts      │   │
│                   │  └─────────────────────────┘  │    └──────────────┘   │
│                   └───────────────────────────────┘                         │
│                                                                              │
│  FEEDBACK LOOP:                                                              │
│  • Clinician corrections → Model refinement                                  │
│  • Outcome validation → Prediction calibration                               │
│  • New evidence → Knowledge base update                                      │
│  • Population learning → Pattern library growth                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Per-Analyzer DeepTwin Connections

#### 4.2.1 Risk Analyzer ↔ DeepTwin

| Direction | Data | Detail |
|---|---|---|
| Analyzer → DeepTwin | Risk score, tier, flags, drivers, trend | Primary risk signal |
| DeepTwin → Analyzer | Risk synthesis, cross-domain risk factors | Enhanced risk context |

**What DeepTwin Receives:**
- Composite risk score (0-100) with confidence
- Risk tier classification
- Individual risk flags with weights
- Risk trend direction and slope
- Contributing factor breakdown

**What DeepTwin Produces:**
- Risk correlation with other modalities: "Elevated risk correlates with sleep disruption (r=0.72) and inflammatory markers (r=0.65)"
- Risk drivers explanation: "Cognitive decline trend contributes 31% of risk score"
- Risk trajectory prediction: "At current trajectory, risk tier may elevate to HIGH in 14-21 days"
- Hypotheses: "Risk elevation may be driven by undiagnosed obstructive sleep apnea — consider sleep study"

**What Uncertainty DeepTwin Exposes:**
- Risk score confidence interval
- Missing data impact: "Risk score confidence reduced to 0.62 due to missing biomarker data"
- Model limitation: "Risk prediction less reliable for patients with bipolar disorder"

#### 4.2.2 Biomarkers ↔ DeepTwin

| Direction | Data | Detail |
|---|---|---|
| Analyzer → DeepTwin | All biomarker panels with trends | Biological state signal |
| DeepTwin → Analyzer | Inflammation-psych correlation | Context for interpretation |

**What DeepTwin Receives:**
- Inflammatory panel (CRP, IL-6, TNF-alpha, GlycA)
- Metabolic panel (glucose, HbA1c, insulin, lipids)
- Hormonal panel (cortisol, testosterone, thyroid)
- Nutritional markers (B12, folate, vitamin D, iron)
- Trend data (slopes, p-values)

**What DeepTwin Produces:**
- Inflammation-psychiatric symptom correlation
- Metabolic syndrome-psychiatric outcome association
- Nutritional deficiency-cognitive function link
- Multi-biomarker risk profile
- Hypotheses: "Elevated CRP + Low vitamin D + Depressive symptoms → Consider anti-inflammatory augmentation + vitamin D replacement"

#### 4.2.3 Biometrics ↔ DeepTwin

| Direction | Data | Detail |
|---|---|---|
| Analyzer → DeepTwin | HRV, sleep, activity, cardiovascular | Physiological state |
| DeepTwin → Analyzer | Circadian-psych correlation | Pattern context |

**What DeepTwin Receives:**
- HRV time-series (RMSSD, SDNN, LF, HF, LF/HF)
- Sleep architecture (stages, efficiency, latency)
- Activity profile (steps, intensity, sedentary time)
- Recovery index
- Biometric alerts

**What DeepTwin Produces:**
- Circadian rhythm quality score
- Autonomic nervous system state assessment
- Activity-mood correlation analysis
- Recovery trajectory predictions
- Hypotheses: "Low RMSSD + Sleep fragmentation + Morning fatigue → Autonomic dysregulation may be maintaining depressive symptoms"

#### 4.2.4 qEEG ↔ DeepTwin

| Direction | Data | Detail |
|---|---|---|
| Analyzer → DeepTwin | Spectral features, connectivity, source localization | Brain state signal |
| DeepTwin → Analyzer | Structure-function correlation | Interpretation context |

**What DeepTwin Receives:**
- Spectral power by band and region
- Coherence and connectivity matrices
- Source localization estimates
- Deviation scores vs. normative database
- Microstate dynamics
- ERP components

**What DeepTwin Produces:**
- qEEG-MRI structure-function correlation: "Reduced hippocampal volume correlates with increased theta power in temporal regions"
- qEEG-biomarker correlation: "Elevated theta/gamma ratio associated with elevated CRP"
- Brain state classification
- Protocol targeting recommendations for Neuromodulation Studio
- Hypotheses: "Slowing in frontal regions + Executive dysfunction on testing → Prefrontal hypofunction consistent with depression subtype"

#### 4.2.5 MRI ↔ DeepTwin

| Direction | Data | Detail |
|---|---|---|
| Analyzer → DeepTwin | Volumetrics, DTI, functional connectivity | Structural brain signal |
| DeepTwin → Analyzer | Multi-modal correlation | Enhanced interpretation |

**What DeepTwin Receives:**
- Regional brain volumes (normalized)
- Cortical thickness maps
- White matter integrity (FA, MD by tract)
- Resting-state connectivity matrices
- Lesion/structural anomaly data

**What DeepTwin Produces:**
- Structure-function mapping: "Hippocampal volume reduction correlates with memory test performance"
- Structural-biomarker correlation: "White matter integrity (FA) positively associated with omega-3 index"
- Structural-clinical correlation: "Prefrontal cortical thickness negatively associated with depression duration"
- Aging vs. pathological change distinction
- Hypotheses: "Bilateral hippocampal reduction in context of chronic stress → "Toxic stress" pattern, may benefit from trauma-focused intervention"

#### 4.2.6 Genetic ↔ DeepTwin

| Direction | Data | Detail |
|---|---|---|
| Analyzer → DeepTwin | Metabolizer status, risk alleles | Pharmacogenomic profile |
| DeepTwin → Analyzer | Multi-omic correlation | Enhanced medication guidance |

**What DeepTwin Receives:**
- CYP450 metabolizer phenotypes
- HLA risk alleles
- Pharmacodynamic gene variants
- Drug interaction genetic profile

**What DeepTwin Produces:**
- Gene-biomarker correlation: "CYP2D6 poor metabolizer + Elevated venlafaxine levels + Hypertension → Toxicity risk"
- Gene-clinical correlation: "MTHFR variant + Low folate + Depressive symptoms → L-methylfolate responder"
- Multi-gene interaction analysis
- Population-stratified recommendations

#### 4.2.7 Voice/Video/Text ↔ DeepTwin

| Direction | Data | Detail |
|---|---|---|
| Analyzer → DeepTwin | Acoustic, facial, text features | Affective/behavioral state |
| DeepTwin → Analyzer | Cross-modal validation | Confidence adjustment |

**What DeepTwin Receives:**
- Voice: Prosody, sentiment, rate, cognitive load markers
- Video: Facial expression, movement, gaze, affect flattening
- Text: Entities, sentiment, risk mentions, topics

**What DeepTwin Produces:**
- Cross-modal affect analysis: "Voice depression markers + Reduced facial positive expression + Text negative sentiment = CONVERGENT high-confidence depression signal"
- Cross-modal inconsistency detection: "Voice depression + Normal facial affect + Neutral text = DIVERGENT — possible masking or situational factor"
- Psychomotor state synthesis
- Cognitive state inference
- Hypotheses: "Reduced prosodic variation + Psychomotor slowing + Cognitive test decline → Melancholic depression subtype"

#### 4.2.8 Digital Phenotyping ↔ DeepTwin

| Direction | Data | Detail |
|---|---|---|
| Analyzer → DeepTwin | Social, mobility, app usage, circadian patterns | Behavioral state |
| DeepTwin → Analyzer | Longitudinal pattern context | Enhanced analysis |

**What DeepTwin Receives:**
- Social activity metrics (call, SMS, reciprocity)
- Mobility patterns (entropy, home stay, radius)
- App/digital behavior (screen time, typing)
- Circadian regularity indices
- Anomaly detections

**What DeepTwin Produces:**
- Digital-clinical correlation: "Social withdrawal index correlates with PHQ-9 (r=0.78)"
- Circadian-psych correlation: "Irregular sleep-wake pattern precedes mood episodes by 5-7 days"
- Predictive behavioral patterns
- Early warning signal synthesis
- Hypotheses: "Weekend social activity drop + Increased nighttime phone use → Possible social anxiety or depressive relapse"

### 4.3 DeepTwin Synthesis Types

#### 4.3.1 Correlation Synthesis

DeepTwin continuously searches for cross-domain correlations:

| Correlation Type | Example | Clinical Significance |
|---|---|---|
| Biomarker-EEG | CRP ↔ frontal theta power | Inflammation-brain function link |
| Imaging-behavior | Hippocampal volume ↔ memory test | Structure-function validation |
| Biometric-symptom | HRV ↔ anxiety severity | Autonomic-psychiatric link |
| Genetic-response | CYP2D6 ↔ medication level | Pharmacogenomic utility |
| Digital-clinical | Social activity ↔ depression | Objective outcome marker |
| Voice-cognitive | Speech rate ↔ processing speed | Motor-cognitive integration |

#### 4.3.2 Hypothesis Generation

DeepTwin generates clinician-facing hypotheses:

```
HYPOTHESIS FORMAT:

ID: HYP-2025-0115-001
Statement: "Elevated inflammatory markers (CRP 8.4, IL-6 12.1) combined 
           with reduced HRV (RMSSD 32.4ms, 25th percentile) and alpha 
           asymmetry (F4>F3 by 0.12) suggests an inflammatory subtype 
           of depression with autonomic dysregulation."

Supporting Evidence:
  • Biomarkers: CRP z=2.3, IL-6 z=1.8 [LINK]
  • Biometrics: RMSSD 25th percentile [LINK]
  • qEEG: Alpha asymmetry z=0.8 [LINK]
  • Literature: Felger et al. 2016 (inflammation-DBS correlation) [LINK]
  • Confidence: 0.78

Implications:
  • Consider anti-inflammatory augmentation (minocycline, aspirin)
  • Autonomic modulation (HRV biofeedback, vagal stimulation)
  • Alpha asymmetry neurofeedback or left frontal tDCS

Uncertainty:
  • Causal direction unclear — could be depression causing inflammation
  • Effect size of anti-inflammatory augmentation moderate (d=0.35)
  • Individual response prediction confidence: 0.62

Suggested Testing:
  • Full autoimmune screen (ANA, RF, anti-CCP)
  • Sleep study (sleep apnea as inflammation driver)
  • Gut microbiome assessment (if available)
```

#### 4.3.3 Anomaly Detection

DeepTwin multi-modal anomaly detection:

```
ANOMALY DETECTION HIERARCHY:

Level 1: Single-modality anomaly
  → Flagged by individual analyzer
  → Example: CRP jumps from 2.1 to 18.4 in one week

Level 2: Cross-modal consistency anomaly
  → DeepTwin detects unusual pattern across 2+ modalities
  → Example: Biomarkers normal + qEEG normal + Risk score HIGH
  → Interpretation: Risk driven by non-biological factors (psychosocial)

Level 3: Temporal pattern break
  → Longitudinal pattern suddenly changes
  → Example: 6-month stable sleep pattern → sudden fragmentation
  → May indicate medication change, life event, or emerging illness

Level 4: Safety-critical anomaly
  → Immediate escalation required
  → Example: Risk score CRITICAL + Suicide risk mentions in text + 
    Social withdrawal + No activity for 48 hours
  → Automatic alert to care team

Level 5: Population outlier
  → Patient pattern unusual compared to matched cohort
  → Example: Exceptional treatment response to standard protocol
  → May indicate unique subtype or data quality issue
```

#### 4.3.4 Prediction Engine

DeepTwin prediction capabilities:

| Prediction Target | Input Modalities | Horizon | Validation |
|---|---|---|---|
| Treatment response (medication) | Genetic, biomarker, clinical history, qEEG | 4-8 weeks | Historical accuracy tracked |
| Treatment response (TMS) | qEEG, MRI, clinical features, prior treatment | 2-4 weeks | STAR*D augmentation |
| Relapse risk | All modalities, longitudinal pattern | 30-90 days | Time-to-event validation |
| Symptom trajectory | Biometrics, digital phenotype, clinical | 7-14 days | Rolling forecast validation |
| Adverse event risk | Genetic, biomarker, medication, clinical | Ongoing | Safety signal detection |
| Functional outcome | All modalities, treatment plan | 3-6 months | Outcome correlation |

### 4.4 DeepTwin Evidence Linking

```
EVIDENCE INTEGRATION WORKFLOW:

1. SIGNAL GENERATION: Analyzer produces signal with confidence
                    ↓
2. EVIDENCE MATCHING: Evidence engine matches signal to:
   - Relevant clinical guidelines (APA, NICE, CANMAT)
   - Supporting clinical trials
   - Population normative data
   - Mechanistic research
                    ↓
3. EVIDENCE GRADING:
   - Grade A: Systematic review/meta-analysis
   - Grade B: Randomized controlled trial
   - Grade C: Cohort/case-control study
   - Grade D: Expert opinion/case series
   - Grade E: Mechanistic/preclinical
                    ↓
4. EVIDENCE SYNTHESIS:
   - Multi-source evidence integration
   - Conflicting evidence resolution
   - Confidence calibration based on evidence quality
                    ↓
5. CLINICIAN PRESENTATION:
   - Evidence summary with citations
   - Grade labeling
   - Population applicability
   - Limitations statement
```

---

## 5. Report Generation Flow

### 5.1 Report Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       REPORT GENERATION PIPELINE                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  PHASE 1: DATA COLLECTION & VALIDATION                                        │
│  ─────────────────────────────────────                                        │
│                                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Analyzer   │  │   DeepTwin  │  │   Evidence  │  │  Patient    │        │
│  │   Signals   │  │  Synthesis  │  │    Links    │  │  Context    │        │
│  │  (16 types) │  │  (fused)    │  │  (graded)   │  │  (history)  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                 │
│         └────────────────┴────────────────┴────────────────┘                 │
│                                       │                                       │
│                                       ▼                                       │
│                    ┌──────────────────────────────────────┐                  │
│                    │    SIGNAL VALIDATION & QUALITY CHECK  │                  │
│                    │                                       │                  │
│                    │ • Confidence threshold check          │                  │
│                    │ • Missing data assessment             │                  │
│                    │ • Temporal currency check             │                  │
│                    │ • Consistency validation              │                  │
│                    │ • Safety flag verification            │                  │
│                    │ • Consent verification                │                  │
│                    │                                       │                  │
│                    │ Quality Score: 0.0-1.0                │                  │
│                    │ IF < 0.6 → Report generation blocked  │                  │
│                    │ IF 0.6-0.8 → Uncertainty emphasized   │                  │
│                    │ IF > 0.8 → Standard report flow       │                  │
│                    └──────────────────────────────────────┘                  │
│                                       │                                       │
│                                       ▼                                       │
│  PHASE 2: REPORT ASSEMBLY                                                     │
│  ────────────────────────                                                     │
│                                                                               │
│                    ┌──────────────────────────────────────┐                  │
│                    │    REPORT TEMPLATE ENGINE            │                  │
│                    │                                       │                  │
│                    │ Template Selection:                   │                  │
│                    │ • Comprehensive Assessment            │                  │
│                    │ • Focused Follow-up                   │                  │
│                    │ • Intervention Outcome                │                  │
│                    │ • Emergency/Rapid                     │                  │
│                    │ • Research/Academic                   │                  │
│                    │                                       │                  │
│                    │ Section Assembly:                     │                  │
│                    │ 1. Patient Header + Metadata          │                  │
│                    │ 2. Executive Summary (DeepTwin)       │                  │
│                    │ 3. Risk Assessment                    │                  │
│                    │ 4. Biomarker Summary                  │                  │
│                    │ 5. Biometric Summary                  │                  │
│                    │ 6. Neuroimaging (MRI + qEEG)          │                  │
│                    │ 7. Behavioral Assessment              │                  │
│                    │ 8. Genetic/Medication                 │                  │
│                    │ 9. Digital Phenotype Summary          │                  │
│                    │ 10. Intervention Recommendations      │                  │
│                    │ 11. Evidence Summary                  │                  │
│                    │ 12. Uncertainty & Limitations         │                  │
│                    │ 13. Appendices (raw data)             │                  │
│                    │                                       │                  │
│                    │ Confidence Coding:                    │                  │
│                    │ ████ High confidence (>0.9)           │                  │
│                    │ ░░░░ Moderate confidence (0.7-0.9)    │                  │
│                    │ ▒▒▒▒ Low confidence (<0.7)            │                  │
│                    │ ⚠ Flagged for clinical review         │                  │
│                    └──────────────────────────────────────┘                  │
│                                       │                                       │
│                                       ▼                                       │
│  PHASE 3: DEEPREVIEW (AI-POWERED REVIEW)                                      │
│  ────────────────────────────────────────                                     │
│                                                                               │
│                    ┌──────────────────────────────────────┐                  │
│                    │    DEEPREVIEW LAYER                   │                  │
│                    │                                       │                  │
│                    │ Automated Quality Checks:             │                  │
│                    │ • Internal consistency                │                  │
│                    │ • Evidence link validation            │                  │
│                    │ • Safety contradiction detection      │                  │
│                    │ • Dosing calculation verification     │                  │
│                    │ • Reference range currency            │                  │
│                    │ • Citation accuracy                   │                  │
│                    │                                       │                  │
│                    │ Smart Suggestions:                    │                  │
│                    │ • Missing test recommendations        │                  │
│                    │ • Alternative interpretation flags    │                  │
│                    │ • Additional evidence suggestions     │                  │
│                    │ • Documentation gap alerts            │                  │
│                    │                                       │                  │
│                    │ DeepReview Score: PASS / REVIEW / FAIL│                  │
│                    │ PASS → Direct to clinician            │                  │
│                    │ REVIEW → Flagged items for attention  │                  │
│                    │ FAIL → Returned for correction        │                  │
│                    └──────────────────────────────────────┘                  │
│                                       │                                       │
│                                       ▼                                       │
│  PHASE 4: CLINICIAN REVIEW                                                    │
│  ─────────────────────────                                                    │
│                                                                               │
│                    ┌──────────────────────────────────────┐                  │
│                    │    CLINICIAN REVIEW INTERFACE         │                  │
│                    │                                       │                  │
│                    │ Review Components:                    │                  │
│                    │ • Accept/reject each section          │                  │
│                    │ • Edit any finding or recommendation  │                  │
│                    │ • Add clinical judgment/notes         │                  │
│                    │ • Override confidence assessments     │                  │
│                    │ • Add additional evidence             │                  │
│                    │ • Flag for second opinion             │                  │
│                    │                                       │                  │
│                    │ Required Actions:                     │                  │
│                    │ ✓ Review all HIGH/CRITICAL risk flags │                  │
│                    │ ✓ Confirm medication recommendations  │                  │
│                    │ ✓ Validate intervention safety        │                  │
│                    │ ✓ Review uncertainty statements       │                  │
│                    │ ✓ Confirm evidence citations          │                  │
│                    │                                       │                  │
│                    │ Attestation:                          │                  │
│                    │ "I have reviewed this report, made    │                  │
│                    │  necessary modifications, and attest  │                  │
│                    │  to its clinical accuracy."           │                  │
│                    │                                       │                  │
│                    │ [CLINICIAN SIGN-OFF REQUIRED]         │                  │
│                    └──────────────────────────────────────┘                  │
│                                       │                                       │
│                                       ▼                                       │
│  PHASE 5: FINALIZATION & DISTRIBUTION                                         │
│  ────────────────────────────────────                                         │
│                                                                               │
│                    ┌──────────────────────────────────────┐                  │
│                    │    FINAL REPORT                       │                  │
│                    │                                       │                  │
│                    │ Report Metadata:                      │                  │
│                    │ • Report ID (unique, auditable)       │                  │
│                    │ • Version number                      │                  │
│                    │ • Generation timestamp                │                  │
│                    │ • Clinician of record                 │                  │
│                    │ • Review timestamp                    │                  │
│                    │ • Quality score                       │                  │
│                    │                                       │                  │
│                    │ Distribution:                         │                  │
│                    │ • Patient portal (patient-appropriate)│                  │
│                    │ • EHR integration (full clinical)     │                  │
│                    │ • Care team sharing (authorized)      │                  │
│                    │ • Export (PDF, FHIR, HL7)             │                  │
│                    │                                       │                  │
│                    │ Audit Trail:                          │                  │
│                    │ • Every access logged                 │                  │
│                    │ • Every modification tracked          │                  │
│                    │ • Every export recorded               │                  │
│                    │ • Retention policy enforced           │                  │
│                    └──────────────────────────────────────┘                  │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Report Types

| Report Type | Trigger | Sections | Audience | SLA |
|---|---|---|---|---|
| Comprehensive Assessment | Initial evaluation | All 13 sections | Clinical team | 24-48 hours |
| Focused Follow-up | Return visit | Updated sections, trend analysis | Clinical team | Same session |
| Intervention Outcome | Post-treatment | Pre/post comparison, response metrics | Clinical team | 24 hours |
| Rapid/Emergency | Safety alert | Risk, immediate actions, safety plan | Emergency team | Immediate |
| Progress Summary | Milestone | Key metrics, trajectory, recommendations | Patient + team | 24 hours |
| Research Export | Study participation | De-identified, protocol-specific | Research team | Per protocol |

### 5.3 Report Quality Assurance

```
QUALITY CHECKS (automated):

1. COMPLETENESS: All expected sections present
2. CONSISTENCY: No contradictory statements across sections
3. ACCURACY: Calculated values match source data
4. CURRENCY: All data within acceptable age thresholds
5. EVIDENCE: All claims linked to evidence
6. SAFETY: No safety-critical errors or omissions
7. CONSENT: All data sources have verified consent
8. IDENTIFICATION: Correct patient attribution
9. FORMATTING: Professional, readable output
10. CONFIDENTIALITY: Appropriate access controls
```

---

## 6. Cross-Module Navigation

### 6.1 Primary Navigation Flows

#### 6.1.1 Patient Assessment Flow

```
PATIENT LIST ──▶ PATIENT DETAIL ──▶ ASSESSMENT ──▶ ANALYZER ──▶ INTERVENTION ──▶ REPORT

[Patient List]              [Patient Detail]              [Assessment]
┌──────────────┐           ┌────────────────┐           ┌──────────────┐
│ • Search     │──▶        │ • Demographics │──▶        │ • Select     │
│ • Filter     │  Patient  │ • Diagnoses    │  Select   │   assessment │
│ • Sort       │  Select   │ • Medications  │  assess.  │   type       │
│ • Alerts     │           │ • Active flags │           │ • Configure  │
│ • Status     │           │ • Care team    │           │   modalities │
│ • Quick view │           │ • Timeline     │           │ • Schedule   │
└──────────────┘           │ • Access data  │           │ • Consent    │
                           └────────────────┘           └──────────────┘
                                                                   │
                    [Analyzer Results]                               ▼
                    ┌────────────────┐                    ┌──────────────┐
                    │ • View results │◀──── Results ──────│ • Run        │
                    │   by analyzer  │      appear        │   analyzers  │
                    │ • Compare      │                    │ • Monitor    │
                    │   modalities   │                    │   progress   │
                    │ • DeepTwin     │                    │ • Review     │
                    │   synthesis    │                    │   quality    │
                    │ • Evidence     │                    │ • View       │
                    │   links        │                    │   preliminary│
                    │ • Uncertainty  │                    │   results    │
                    │   view         │                    └──────────────┘
                    └───────┬────────┘
                            │
    [Intervention Planning] ▼
    ┌────────────────┐    ┌────────────────┐
    │ • Browse       │◀───│ • Review       │
    │   interventions│    │   DeepTwin     │
    │ • View evidence│    │   insights     │
    │ • Compare      │    │ • Confirm      │
    │   protocols    │    │   signals      │
    │ • Safety check │    │ • Generate     │
    │ • Customize    │    │   hypotheses   │
    │ • Schedule     │    └────────────────┘
    │ • Document     │
    │   rationale    │
    └───────┬────────┘
            │
         [Report]
            ▼
    ┌────────────────┐
    │ • Review draft │
    │ • Edit sections│
    │ • Add notes    │
    │ • Confirm      │
    │   evidence     │
    │ • Sign-off     │
    │ • Distribute   │
    │ • Export       │
    └────────────────┘
```

#### 6.1.2 Evidence-to-Protocol Flow

```
EVIDENCE SEARCH ──▶ PROTOCOL SELECTION ──▶ INTERVENTION PLANNING ──▶ SESSION SCHEDULING

[Evidence Search]              [Protocol Selection]
┌──────────────────┐          ┌──────────────────────┐
│ • Clinical query │──▶       │ • Evidence-graded    │──▶
│ • Condition      │ Results  │   protocol list      │ Select
│ • Patient match  │          │ • Comparison table   │ Protocol
│ • Guideline      │          │ • Contraindication   │
│   lookup         │          │   check              │
│ • Trial search   │          │ • Personalization    │
│ • Citation       │          │   options            │
│   management     │          │ • Safety profile     │
└──────────────────┘          └──────────────────────┘

[Intervention Planning]              [Session Scheduling]
┌──────────────────────┐            ┌──────────────────────┐
│ • Protocol parameters │──▶         │ • Calendar view      │
│ • Safety checklist    │            │ • Resource booking   │
│ • Monitoring plan     │            │ • Provider assign.   │
│ • Outcome measures    │            │ • Recurring series   │
│ • Consent verification│            │ • Reminder setup     │
│ • Documentation       │            │ • Prep instructions  │
└──────────────────────┘            └──────────────────────┘
```

#### 6.1.3 Alert-to-Action Flow

```
ALERT/FLAG ──▶ DEEPTWIN CORRELATION ──▶ MULTIPLE ANALYZERS ──▶ INTERVENTION ADJUSTMENT

[Alert Trigger]                [DeepTwin Correlation]
┌──────────────────┐          ┌──────────────────────┐
│ • Risk threshold │──▶       │ • Cross-domain       │──▶
│ • Safety flag    │ Alert    │   correlation        │ Correlate
│ • Anomaly detect │          │ • Root cause         │
│ • Missing data   │          │   analysis           │
│ • Critical lab   │          │ • Pattern matching   │
│ • Adverse event  │          │ • Predictive model   │
└──────────────────┘          └──────────────────────┘

[Multi-Analyzer Investigation]     [Intervention Adjustment]
┌──────────────────────┐          ┌──────────────────────┐
│ • Trigger relevant   │──▶       │ • Protocol adjustment │
│   analyzers          │ Invest.  │ • Safety modification │
│ • Gather additional  │          │ • Dose change         │
│   data               │          │ • Target modification │
│ • Correlation search │          │ • Schedule change     │
│ • Evidence review    │          │ • New intervention    │
│ • Hypothesis testing │          │ • Discontinuation     │
└──────────────────────┘          │ • Referral            │
                                  └──────────────────────┘
```

### 6.2 Navigation Interface Patterns

#### 6.2.1 Sidebar Hierarchy (Clinical Workstation)

```
┌──────────────────────────────────────────────────────────────┐
│  DeepSynaps                              [Search] [Alerts] [Profile]│
├──────────┬───────────────────────────────────────────────────┤
│          │                                                       │
│ PATIENT  │  [Main Content Area - Context Adaptive]              │
│  MODULE  │                                                       │
│          │                                                       │
│ ◀ Patient│  Context-sensitive navigation:                       │
│    List  │                                                       │
│    ○ All │  When viewing patient:                                │
│    ○ My  │  ─────────────────────                                │
│    ○ Flag│  │ Overview │ Timeline │ Assessments │ Reports │     │
│    ○ Rec.│                                                       │
│          │  When in assessment:                                  │
│ ◀ Current│  ─────────────────────                                │
│    Patient│  │ Configure │ Run Status │ Results │ Review │       │
│    ───── │                                                       │
│    Overview│  When in results:                                   │
│    Timeline  ─────────────────────                                │
│    Assessments  │ By Analyzer │ DeepTwin │ Evidence │ Actions │  │
│    Reports                                                         │
│    Care Team                                                       │
│    Documents                                                       │
│    Settings                                                        │
│          │                                                       │
│ ANALYSIS │                                                       │
│  MODULE  │                                                       │
│          │                                                       │
│ ◀ Risk   │                                                       │
│ ◀ Biomark│                                                       │
│ ◀ Biometr│                                                       │
│ ◀ Labs   │                                                       │
│ ◀ Nutrition                                                      │
│ ◀ Bio DB │                                                       │
│ ◀ Interv.│                                                       │
│ ◀ Voice  │                                                       │
│ ◀ Text   │                                                       │
│ ◀ Video  │                                                       │
│ ◀ Movement                                                       │
│ ◀ Digital│                                                       │
│ ◀ Behav. │                                                       │
│ ◀ MRI    │                                                       │
│ ◀ qEEG   │                                                       │
│ ◀ Genetic│                                                       │
│ ◀ DeepTwin│                                                       │
│          │                                                       │
│ INTERVENT│                                                       │
│ -ION     │                                                       │
│  MODULE  │                                                       │
│          │                                                       │
│ ◀ Neuro- │                                                       │
│    modul.│                                                       │
│ ◀ Medicat│                                                       │
│ ◀ Rehab  │                                                       │
│ ◀ Nutrit.│                                                       │
│ ◀ Wellness│                                                       │
│ ◀ Complem│                                                       │
│ ◀ Handbks│                                                       │
│          │                                                       │
│ REPORTS  │                                                       │
│          │                                                       │
│ ◀ Drafts │                                                       │
│ ◀ Signed │                                                       │
│ ◀ Pending│                                                       │
│ ◀ Exports│                                                       │
│          │                                                       │
│ EVIDENCE │                                                       │
│          │                                                       │
│ ◀ Guide- │                                                       │
│    lines │                                                       │
│ ◀ Trials │                                                       │
│ ◀ Search │                                                       │
│          │                                                       │
│ ADMIN    │                                                       │
│          │                                                       │
│ ◀ Users  │                                                       │
│ ◀ Consent│                                                       │
│ ◀ Audit  │                                                       │
│ ◀ Settings                                                        │
│          │                                                       │
├──────────┴───────────────────────────────────────────────────────┤
│  [Status] [Sync] [Help] [Feedback]                       v1.0.0   │
└───────────────────────────────────────────────────────────────────┘
```

#### 6.2.2 Context-Sensitive Breadcrumbs

```
Patient List > Jane Smith (PT-12345) > Assessments > Assessment #42 (2025-01-15)
> qEEG Analyzer > Spectral Power > Protocol Suggestion

Each breadcrumb element is clickable and maintains state:
• "Jane Smith" → Patient overview
• "Assessment #42" → Assessment summary
• "qEEG Analyzer" → All qEEG results
• "Spectral Power" → Detailed spectral view
• "Protocol Suggestion" → Intervention planning
```

#### 6.2.3 Role-Aware Navigation

| Role | Visible Modules | Actions Available |
|---|---|---|
| Psychiatrist | All | Full access — view, edit, sign-off reports |
| Psychologist | All except Medication/Genetic | Full assessment, therapy planning, reports |
| Neuropsychologist | Behaviour, qEEG, MRI, Text | Testing, cognitive reports |
| Neurologist | MRI, qEEG, Movement, Labs | Neuroimaging interpretation |
| Nurse/MA | Risk, Biometrics, Labs | Data collection, vitals, basic assessment |
| Physiotherapist | Movement, Biometrics, Rehab | Therapy planning, exercise prescription |
| Dietitian | Nutrition, Biomarkers, Labs | Dietary planning |
| Researcher | De-identified data only | Research queries, no patient identifiers |
| Administrator | Admin, Audit, Consent | User management, audit review |
| Patient (portal) | Own data only | View reports, enter data, view education |

### 6.3 Emergency/Break-Glass Navigation

```
EMERGENCY ACCESS PATTERN:

Normal Flow:                    Break-Glass Flow:
─────────────                   ────────────────

Login → Patient Search          Login → Emergency Override
      → Open Patient                    → Select Patient
      → View Data                       → Immediate Access
      (role-based filtering)            (all data visible)
                                        → Full audit logging
                                        → Post-emergency review
                                        → Automatic notification

Break-Glass Triggers:
• Emergency department visit
• Safety alert (suicide risk, violence)
• On-call coverage
• System outage requiring backup access

Break-Glass Requirements:
• Explicit justification entry
• Second approver (when available)
• All access logged with EMERGENCY tag
• Care team notification
• Post-hoc review within 24 hours
• Access expires automatically (configurable, default 4 hours)
```

---

## 7. Consent & Governance Flow

### 7.1 Consent Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONSENT & GOVERNANCE ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CONSENT LAYERS (nested, granular)                                           │
│  ─────────────────────────────────                                           │
│                                                                              │
│  LAYER 1: PLATFORM ACCESS                                                    │
│  ├── General platform consent (terms of service)                             │
│  ├── Data processing consent (GDPR/CCPA)                                     │
│  └── Communication preferences                                               │
│                                                                              │
│  LAYER 2: DATA SOURCE CONSENT                                                │
│  ├── Clinical data (EHR) import consent                                      │
│  ├── Wearable device connection consent (per device)                         │
│  ├── Genetic testing consent (special category)                              │
│  ├── Imaging data (MRI, EEG) consent                                         │
│  ├── Audio/Video recording consent                                           │
│  ├── Digital phenotyping (passive sensing) consent                           │
│  └── Research data sharing consent (optional)                                │
│                                                                              │
│  LAYER 3: ANALYZER CONSENT                                                   │
│  ├── General analysis consent                                                │
│  ├── AI/ML processing consent                                                │
│  ├── DeepTwin multimodal synthesis consent                                   │
│  └── Population learning contribution (opt-in)                               │
│                                                                              │
│  LAYER 4: INTERVENTION CONSENT                                               │
│  ├── Specific intervention consent (per type)                                │
│  ├── Neurostimulation safety consent                                         │
│  ├── Medication decision-support understanding                               │
│  └── Complementary therapy consent                                           │
│                                                                              │
│  LAYER 5: REPORT & SHARING CONSENT                                           │
│  ├── Report generation consent                                               │
│  ├── Care team sharing consent                                               │
│  ├── Patient portal access consent                                           │
│  ├── External provider sharing consent                                       │
│  └── Research export consent (de-identified)                                 │
│                                                                              │
│  LAYER 6: EXPORT & RETENTION                                                 │
│  ├── Data export consent (portability)                                       │
│  ├── Retention period preferences                                            │
│  └── Deletion/destruction request                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Consent-to-Action Enforcement

```
CONCEPTUAL FLOW:

                    CONSENT STATE CHECK
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌──────────┐
    │GRANTED  │    │ PARTIAL  │    │ DENIED/  │
    │         │    │          │    │ WITHDRAWN│
    └────┬────┘    └────┬─────┘    └────┬─────┘
         │              │                │
         ▼              ▼                ▼
    ┌─────────┐   ┌──────────┐    ┌──────────┐
    │ FULL    │   │ LIMITED  │    │ BLOCKED  │
    │ ACCESS  │   │ ACCESS   │    │ ACCESS   │
    │         │   │          │    │          │
    │ All     │   │ Only     │    │ Data not │
    │ data    │   │ consented│    │ processed│
    │ flows   │   │ sources  │    │ Alert to │
    │ normally│   │ flow     │    │ clinician│
    │         │   │ Missing  │    │ Gap noted│
    │         │   │ flagged  │    │ in report│
    │         │   │ in output│    │          │
    └─────────┘   └──────────┘    └──────────┘
```

### 7.3 Audit Trail Architecture

```
EVERY STATE TRANSITION IS LOGGED:

AUDIT RECORD FORMAT:
{
  "audit_id": "aud_2025_001",
  "timestamp": "2025-01-15T09:30:00.000Z",
  "event_type": "data_access",
  "actor": {
    "user_id": "USR-456",
    "role": "psychiatrist",
    "session_id": "sess_abc123"
  },
  "resource": {
    "type": "patient_data",
    "patient_id": "PT-12345",
    "data_type": "biomarker",
    "specific": "CRP_result"
  },
  "action": "view",
  "consent_verification": {
    "consent_id": "cns_biom_001",
    "status": "granted",
    "verified_at": "2025-01-15T09:30:00.000Z"
  },
  "access_context": {
    "source_module": "biomarker_analyzer",
    "purpose": "clinical_assessment",
    "emergency_override": false
  },
  "result": "allowed",
  "ip_address": "10.0.1.100",
  "user_agent": "DeepSynaps-Web/1.0",
  "correlation_id": "corr_session_789"
}

LOGGED EVENTS:
• Every data access (view, create, update, delete)
• Every consent grant/modification/withdrawal
• Every analyzer execution
• Every signal generation
• Every DeepTwin synthesis
• Every intervention planning action
• Every report generation, edit, sign-off
• Every export/distribution
• Every role/permission change
• Every break-glass access
• Every system configuration change
```

### 7.4 Role-Based Access Control (RBAC)

```
RBAC HIERARCHY:

┌─────────────────────────────────────────────────────────────────────────────┐
│                         ROLE DEFINITIONS                                     │
├──────────────┬─────────────────────────────────────────────────────────────┤
│ Role         │ Permissions                                                 │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Super Admin  │ Full system access, user management, configuration, audit   │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Clinic Admin │ Clinic-level config, staff management, billing, reports     │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Attending MD │ Full patient access, all analyzers, all interventions,      │
│              │ report sign-off, break-glass                                │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Resident/Fellow│ Patient access (assigned), most analyzers, interventions  │
│              │ with supervision, co-sign required                          │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Psychologist │ Full patient access (assigned), behavioral analyzers,       │
│              │ therapy interventions, reports (no medication/genetic)      │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ NP/PA        │ Patient access, most analyzers, interventions with          │
│              │ collaboration agreement, medication with supervision        │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Nurse/MA     │ Vitals collection, biometric data, risk screening,          │
│              │ outcome measures, no report sign-off                        │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Therapist    │ Assigned patients, specific intervention modules,           │
│ (Specialist) │ progress notes, no analyzer access                          │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Researcher   │ De-identified data only, research queries, export           │
│              │ (IRB-required), no individual patient access                │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Patient      │ Own data only, portal view, data entry, export              │
│              │ (portability), consent management                           │
├──────────────┼─────────────────────────────────────────────────────────────┤
│ Caregiver    │ Patient-authorized data only, collateral input,             │
│              │ read-only reports (patient-authorized)                      │
└──────────────┴─────────────────────────────────────────────────────────────┘
```

### 7.5 Break-Glass Emergency Access

```
BREAK-GLASS PROTOCOL:

TRIGGER CONDITIONS:
✓ Emergency department presentation
✓ Safety alert (imminent risk)
✓ On-call coverage (after hours)
✓ Primary clinician unavailable + patient in crisis
✓ System failover scenario

ACCESS FLOW:

Step 1: Emergency override request
  → Clinician clicks "Emergency Access"
  → Prompted for justification (free text, required)
  → System verifies clinician identity + current role

Step 2: Approval (when possible)
  → Automatic approval if: on-call + verified identity
  → Second approver required if: non-on-call staff
  → Delayed approval if: no second approver available (default allow + alert)

Step 3: Access granted
  → All patient data visible (overrides consent for safety)
  → Access time-limited (default: 4 hours)
  → Full audit logging with EMERGENCY tag
  → Automatic notification to:
    • Patient (if safe to notify)
    • Care team
    • Privacy officer
    • Clinic administrator

Step 4: Post-emergency review
  → Mandatory review within 24 hours
  → Justification validated by supervisor
  → Documentation added to patient record
  → If unjustified → Access revocation + incident report

AUDIT REQUIREMENTS:
• Every break-glass event generates permanent audit record
• Quarterly break-glass usage review
• Annual privacy impact assessment
• Integration with compliance reporting
```

### 7.6 Patient Notification System

```
NOTIFICATION TRIGGERS:

AUTOMATIC PATIENT NOTIFICATIONS:
• New clinician added to care team
• Report generated and available
• New data source connected
• Consent status changed
• Break-glass access to their record
• Data export completed
• Account security event

NOTIFICATION CHANNELS:
• In-app notification (primary)
• Email (configurable)
• SMS (configurable, for critical only)
• Patient portal message

NOTIFICATION CONTENT:
• Who accessed what
• When and why
• Patient rights reminder
• How to request information or revoke consent

PRIVACY OFFICER NOTIFICATIONS:
• Break-glass events (immediate)
• Bulk data access (immediate)
• Consent withdrawal (daily digest)
• Unusual access patterns (weekly)
• Compliance metrics (monthly)
```

### 7.7 Data Retention & Deletion

```
RETENTION POLICY:

DATA TYPE                    RETENTION PERIOD     DELETION METHOD
─────────────────────────────────────────────────────────────────
Raw clinical data            7 years (minimum)    Secure deletion
Analyzer signals             7 years              Secure deletion
DeepTwin synthesis           7 years              Secure deletion
Reports                      7 years              Secure deletion
Audio recordings             90 days post-analysis Secure deletion
Video recordings             90 days post-analysis Secure deletion
Genetic data                 7 years              Cryptographic deletion
Digital phenotype raw        2 years              Secure deletion
Digital phenotype aggregate  7 years              Secure deletion
Audit logs                   7 years              Archive + secure delete
Consent records              7 years post-last    Secure deletion
                             contact
Export records               3 years              Secure deletion

PATIENT RIGHTS:
• Right to access (30-day response)
• Right to correction
• Right to deletion (where legally permissible)
• Right to portability (structured export)
• Right to object to processing
• Right to withdraw consent (effective immediately)
• Right to explanation (for AI-derived insights)

DELETION WORKFLOW:
1. Patient requests deletion → Ticket created
2. Identity verification → Confirmed
3. Legal hold check → If no hold, proceed
4. Deletion execution → All systems purged
5. Audit record created → Permanent (who, what, when)
6. Confirmation → Patient notified
7. Exception log → If any data cannot be deleted (legal hold)
```

### 7.8 Compliance Framework

```
REGULATORY ALIGNMENT:

HIPAA (US):
• Business Associate Agreement requirements
• Minimum necessary standard
• Patient access rights
• Breach notification
• Audit requirements

GDPR (EU/UK):
• Lawful basis for processing (health data = special category)
• Data Protection Impact Assessment
• Data Protection Officer coordination
• Cross-border transfer safeguards
• Right to explanation for automated decisions

FDA (US - if regulated):
• Software as Medical Device (SaMD) classification
• Clinical validation requirements
• Quality Management System
• Post-market surveillance

State/Local:
• State-specific privacy laws (CCPA/CPRA, etc.)
• Professional licensing board requirements
• State medical record laws
• Telehealth regulations

INTERNATIONAL:
• PIPEDA (Canada)
• Privacy Act (Australia)
• PDPA (Singapore)
• Local data residency requirements
```

---

## Appendices

### Appendix A: Analyzer Summary Matrix

| Analyzer | ID | Signals Produced | Key Data Sources | Primary Interventions | DeepTwin Role |
|---|---|---|---|---|---|
| Risk | ANLZ-RISK | Score, tier, flags, trend | All analyzers | All | Risk synthesis |
| Biomarkers | ANLZ-BIOMARK | Inflammatory, metabolic, hormonal | Lab feeds | Medication, Nutrition | Biological state |
| Biometrics | ANLZ-BIOMET | HRV, sleep, activity | Wearables | Wellness, Rehab | Physiological state |
| Labs | ANLZ-LABS | CBC, metabolic, LFT, RFT | EHR labs | Medication | Safety monitoring |
| Nutrition | ANLZ-NUTRIT | Dietary pattern, gaps | Food diary, CGM | Nutrition & Metabolic | Metabolic state |
| Bio Database | ANLZ-BIODB | Reference ranges, norms | Literature | All | Evidence provider |
| Intervention | ANLZ-INTERVENT | Outcome, response, adherence | Session data | All | Outcome tracking |
| Voice | ANLZ-VOICE | Acoustic, prosody, sentiment | Audio recordings | Behaviour, Neuromod | Affective state |
| Text | ANLZ-TEXT | Entities, sentiment, risk | Clinical notes | Medication, Risk | NLP extraction |
| Video | ANLZ-VIDEO | Facial expression, movement | Video recordings | Behaviour, Neuromod | Behavioral state |
| Movement | ANLZ-MOVEMENT | Gait, tremor, motor function | IMU, video | Rehab, Medication | Motor state |
| Digital Pheno. | ANLZ-DIGIPH | Social, mobility, circadian | Phone sensors | Wellness, Risk | Behavioral objective |
| Behaviour | ANLZ-BEHAVE | Functional, cognitive, behavioral | Scales, tests | All | Comprehensive assessment |
| MRI | ANLZ-MRI | Volumetrics, DTI, connectivity | MRI scanner | Neuromod, Risk | Structural brain state |
| qEEG | ANLZ-QEEG | Spectral, connectivity, source | EEG amplifier | Neuromodulation | Functional brain state |
| Genetic Med | ANLZ-GENETIC | Metabolizer, guidance | Genetic tests | Medication | Pharmacogenomic profile |
| DeepTwin | ANLZ-DEEPTWIN | Synthesis, correlation, hypotheses | All 16 analyzers | All | Central intelligence |

### Appendix B: Signal Type Registry

| Signal Type | Analyzer Source | Format | Confidence Range | Evidence Grade |
|---|---|---|---|---|
| risk_score | ANLZ-RISK | Float 0-100 | 0.0-1.0 | B |
| inflammatory_panel | ANLZ-BIOMARK | JSON panel | 0.0-1.0 | A |
| hrv_summary | ANLZ-BIOMET | JSON metrics | 0.0-1.0 | B |
| spectral_power | ANLZ-QEEG | JSON bands | 0.0-1.0 | B |
| volumetric_analysis | ANLZ-MRI | JSON volumes | 0.0-1.0 | A |
| metabolizer_status | ANLZ-GENETIC | JSON phenotypes | 0.0-1.0 | A |
| facial_expression | ANLZ-VIDEO | JSON emotions | 0.0-1.0 | C |
| acoustic_features | ANLZ-VOICE | JSON features | 0.0-1.0 | C |
| entity_extraction | ANLZ-TEXT | JSON entities | 0.0-1.0 | C |
| digital_behavior | ANLZ-DIGIPH | JSON patterns | 0.0-1.0 | C |
| functional_assessment | ANLZ-BEHAVE | JSON scores | 0.0-1.0 | A |
| unified_state | ANLZ-DEEPTWIN | JSON composite | 0.0-1.0 | B |
| stimulation_protocol | INTV-NEURO | JSON protocol | N/A | A-D |
| medication_recommendation | INTV-MED | JSON recommendation | N/A | A-D |
| therapy_plan | INTV-REHAB | JSON plan | N/A | A-B |
| nutrition_protocol | INTV-NUTR | JSON protocol | N/A | B-C |

### Appendix C: Evidence Grading Scale

| Grade | Description | Icon | Example |
|---|---|---|---|
| A | Systematic review / Meta-analysis | ████ | Cochrane review |
| B | Randomized controlled trial | ▓▓▓▓ | RCT with adequate power |
| C | Cohort / Case-control study | ░░░░ | Prospective cohort |
| D | Case series / Expert opinion | ▒▒▒▒ | Clinical series |
| E | Mechanistic / Preclinical | ::: | Animal study |

### Appendix D: Uncertainty Taxonomy

| Type | Definition | Example |
|---|---|---|
| Statistical | Sampling/measurement variability | Confidence interval around lab value |
| Systematic | Methodological bias | Device accuracy limitations |
| Epistemic | Knowledge limitation | Unknown causal mechanism |
| Mixed | Multiple sources combined | Risk score with multiple inputs |

### Appendix E: Glossary

| Term | Definition |
|---|---|
| Analyzer | Signal-processing unit for a specific clinical domain |
| DeepTwin | Multimodal synthesis and intelligence engine |
| DeepDyn | Intelligence orchestration layer |
| DeepReview | AI-powered quality review system |
| Signal | Structured output from an analyzer with provenance and confidence |
| Evidence Link | Reference to supporting clinical evidence |
| Protocol | Structured intervention plan with parameters |
| Break-Glass | Emergency access mechanism overriding normal controls |
| Digital Phenotyping | Passive sensing of behavior via digital devices |
| qEEG | Quantitative electroencephalography |
| DTI | Diffusion tensor imaging |
| rs-fMRI | Resting-state functional MRI |
| CPIC | Clinical Pharmacogenetics Implementation Consortium |
| TDM | Therapeutic drug monitoring |

### Appendix F: Integration Specifications

```
API ENDPOINTS (v1):

/analyzers/{analyzer_id}/execute
  POST: Run analyzer on patient data
  Returns: Signal set with confidence

/analyzers/{analyzer_id}/signals/{signal_id}
  GET: Retrieve specific signal
  Returns: Signal with full provenance

/deeptwin/synthesize
  POST: Request multimodal synthesis
  Returns: Unified patient state

/deeptwin/hypotheses
  GET: Retrieve generated hypotheses
  Returns: Hypothesis list with evidence

/interventions/{intervention_id}/protocol
  POST: Generate protocol
  Returns: Protocol with safety checks

/reports
  POST: Generate report
  Returns: Draft report

/reports/{report_id}/signoff
  POST: Clinician sign-off
  Returns: Signed report

/consent/{patient_id}
  GET: Retrieve consent status
  PUT: Update consent
  DELETE: Withdraw consent

/audit/{patient_id}
  GET: Retrieve audit trail
  Query: filter by date, actor, action

/emergency/breakglass
  POST: Request emergency access
  Requires: justification, second approver
```

### Appendix G: Version History

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2025-01-15 | Initial comprehensive architecture document |

---

**End of Document**

*This document is a living reference. As the DeepSynaps platform evolves, this architecture document should be updated to reflect new analyzers, interventions, signal types, and integration patterns. All changes should be versioned and communicated to the clinical and technical teams.*

---

© 2025 DeepSynaps. All rights reserved.
This document contains confidential and proprietary information.
Distribution is limited to authorized personnel.

---
