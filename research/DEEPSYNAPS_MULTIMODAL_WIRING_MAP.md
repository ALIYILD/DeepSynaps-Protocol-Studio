# DeepSynaps Multimodal Wiring Map
## Comprehensive Data Flow, Integration Architecture & API Specification

**Document Version:** 2.1.0  
**Last Updated:** 2024-12-19  
**Classification:** Internal Architecture - Confidential  
**Authors:** DeepSynaps Architecture Team  
**Reviewers:** Clinical Safety Board, Engineering Leadership  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Data Source Layer (12 Sources)](#2-data-source-layer-12-sources)
3. [Analyzer Processing Layer (17 Analyzers)](#3-analyzer-processing-layer-17-analyzers)
4. [Intelligence Layer (DeepTwin)](#4-intelligence-layer-deeptwin)
5. [Intervention Layer (7 Categories)](#5-intervention-layer-7-categories)
6. [Output Layer](#6-output-layer)
7. [Cross-Module API Wiring](#7-cross-module-api-wiring)
8. [Event Flow](#8-event-flow)
9. [Data Consistency & Governance](#9-data-consistency--governance)
10. [Scalability Considerations](#10-scalability-considerations)
11. [Security & Privacy Architecture](#11-security--privacy-architecture)
12. [Appendices](#12-appendices)

---

## 1. Executive Summary

### 1.1 Purpose

This document provides the authoritative reference for all data flows, integration points, and API wiring within the DeepSynaps Clinical Intelligence Platform. It serves as the definitive blueprint for frontend architects, backend engineers, DevOps teams, and clinical safety officers to understand how multimodal clinical data traverses the system from ingestion to clinical decision support output.

### 1.2 Architecture Philosophy

DeepSynaps employs a **multimodal integration architecture** designed around three core principles:

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **Clinical Safety First** | Every data flow prioritizes patient safety and clinical accuracy | Multi-layer validation, uncertainty quantification, human-in-the-loop requirements |
| **Privacy by Design** | HIPAA/GDPR compliance embedded at every layer | Consent-aware processing, field-level encryption, audit immutability |
| **Modular Extensibility** | New analyzers and data sources can be added without system rearchitecture | Plugin-based analyzer framework, standardized API contracts, event-driven integration |

### 1.3 System Overview

The architecture consists of five horizontal layers:

```
+---------------------------------------------------------------------+
|                        OUTPUT LAYER                                  |
|   Clinician Reports | Patient Summaries | Protocols | Audit Logs    |
+---------------------------------------------------------------------+
|                     INTERVENTION LAYER                               |
|   Neurostimulation | Pharmacological | Psychotherapy | Lifestyle    |
|   Biomarker-Guided | Digital Therapeutics | Preventive             |
+---------------------------------------------------------------------+
|                    INTELLIGENCE LAYER                                |
|   DeepTwin: Correlation Engine | Hypothesis Generator | Evidence DB  |
+---------------------------------------------------------------------+
|                  ANALYZER PROCESSING LAYER                           |
|   17 Specialized Analyzers: qEEG, MRI, Voice, Movement, Labs, etc.  |
+---------------------------------------------------------------------+
|                     DATA SOURCE LAYER                                |
|   12 Multimodal Sources: Assessments, qEEG, MRI, Wearables, etc.    |
+---------------------------------------------------------------------+
```

### 1.4 Key Metrics

| Metric | Value | Target |
|--------|-------|--------|
| Data Sources | 12 | 16 (by Q2 2025) |
| Analyzers | 17 | 24 (by Q2 2025) |
| Intervention Categories | 7 | 9 (by Q3 2025) |
| API Endpoints | 240+ | 300+ |
| Event Types | 45 | 60+ |
| Average Ingestion-to-Insight Latency | < 3 minutes | < 90 seconds |
| PHI Handling | Zero-trust | Zero-trust |
| Uptime SLA | 99.95% | 99.99% |

---

## 2. Data Source Layer (12 Sources)

### 2.1 Overview

The Data Source Layer is the foundation of the DeepSynaps platform. All 12 sources feed into a unified ingestion pipeline that handles normalization, validation, encryption, and consent verification before data becomes available to the Analyzer Processing Layer.

### 2.2 Ingestion Pipeline Architecture

```
Raw Data → Ingestion Gateway → Validation Layer → Consent Check
                                         ↓
                           Encryption at Rest → Normalization
                                         ↓
                              Canonical Model → Event Bus
                                         ↓
                                Analyzer Router
```

### 2.3 Source Specifications

#### 2.3.1 Assessments

| Attribute | Value |
|-----------|-------|
| **Data Type** | Structured clinical assessment forms |
| **Primary Formats** | JSON Schema v7, FHIR Questionnaire |
| **Frequency** | Per-visit (typically weekly to monthly) |
| **Privacy Level** | PHI - Full protection |
| **Volume per Patient** | 50-200 KB per assessment |
| **Retention** | 7 years minimum (HIPAA) |
| **Schema Version** | 3.2.1 |

**Supported Assessment Batteries:**
- PHQ-9 (Depression Severity)
- GAD-7 (Anxiety Severity)
- MDQ (Mood Disorder Questionnaire)
- YMRS (Young Mania Rating Scale)
- RBANS (Repeatable Battery for Neuropsychological Status)
- C-SSRS (Columbia Suicide Severity Rating Scale)
- Custom clinic-defined forms

**Ingestion Flow:**
```
Clinician/Portal → POST /api/v1/ingestion/assessments
                        → Schema Validation (JSON Schema v7)
                        → Score Computation
                        → Severity Classification
                        → Store in Assessment Repository
                        → Emit: assessment.completed event
                        → Trigger: Assessment Analyzer
```

**Canonical Data Model:**
```json
{
  "assessment_id": "uuid",
  "patient_id": "uuid",
  "clinic_id": "uuid",
  "clinician_id": "uuid",
  "battery_type": "PHQ-9",
  "administered_at": "2024-12-19T10:30:00Z",
  "responses": [...],
  "computed_scores": {
    "total_score": 14,
    "severity": "moderate",
    "subscales": {...}
  },
  "metadata": {
    "schema_version": "3.2.1",
    "source_device": "tablet",
    "language": "en-US"
  }
}
```

---

#### 2.3.2 qEEG (Quantitative Electroencephalography)

| Attribute | Value |
|-----------|-------|
| **Data Type** | Time-series spectral data |
| **Primary Formats** | EDF (.edf), CSV, BDF+ |
| **Frequency** | Per-session (typically monthly) |
| **Privacy Level** | PHI - Full protection |
| **Volume per Session** | 50-500 MB per recording |
| **Channels** | 19-128 (standard 10-20 system) |
| **Sampling Rate** | 256-2048 Hz |
| **Duration** | 15-60 minutes |

**Signal Characteristics:**
- Delta (0.5-4 Hz): Deep sleep, unconscious processes
- Theta (4-8 Hz): Drowsiness, memory encoding
- Alpha (8-13 Hz): Relaxed awareness, posterior dominant rhythm
- Beta (13-30 Hz): Active thinking, focus, anxiety
- Gamma (30-100 Hz): Higher cognitive functions
- Custom frequency bands for research protocols

**Ingestion Flow:**
```
EEG Acquisition Device → EDF Upload → Signal Quality Check
                              → Artifact Detection (EOG, EMG, movement)
                              → Reference Scheme Validation
                              → Store Raw EDF in Object Storage
                              → Emit: qeeg.raw_ingested event
                              → Trigger: qEEG Analyzer (async pipeline)
```

**Preprocessing Pipeline:**
```
Raw EDF → Bandpass Filter (0.5-100Hz) → Notch Filter (50/60Hz)
              → Artifact Rejection (ASR/ICA) → Re-referencing (Average/REST)
              → Epoching (2-4s) → Spectral Decomposition (Welch/FFT)
              → Normative Database Comparison → Z-score Computation
              → Brain Mapping Generation → Deviation Signature Extraction
```

**Canonical Data Model (Spectral Output):**
```json
{
  "qeeg_id": "uuid",
  "patient_id": "uuid",
  "session_id": "uuid",
  "acquired_at": "2024-12-19T10:30:00Z",
  "acquisition_metadata": {
    "device": "Neuroscan SynAmps RT",
    "channels": 19,
    "sampling_rate": 1000,
    "reference": "linked_ears",
    "duration_seconds": 1800
  },
  "spectral_analysis": {
    "absolute_power": {"delta": {...}, "theta": {...}, "alpha": {...}, ...},
    "relative_power": {...},
    "coherence": {...},
    "asymmetry": {...},
    "phase_lag": {...}
  },
  "deviation_signatures": [
    {
      "region": "frontal_left",
      "band": "alpha",
      "z_score": -2.3,
      "percentile": 1.1,
      "clinical_interpretation": "excessive_slowing"
    }
  ],
  "quality_metrics": {
    "artifact_rejection_rate": 0.12,
    "signal_quality_score": 0.88,
    "epochs_analyzed": 450
  }
}
```

---

#### 2.3.3 MRI (Magnetic Resonance Imaging)

| Attribute | Value |
|-----------|-------|
| **Data Type** | 3D volumetric imaging data |
| **Primary Formats** | DICOM (.dcm), NIfTI (.nii/.nii.gz) |
| **Frequency** | Per-scan (typically baseline, 6-month, 12-month) |
| **Privacy Level** | PHI - Full protection + Face De-identification |
| **Volume per Scan** | 200 MB - 2 GB per sequence |
| **Sequences** | T1, T2, FLAIR, DWI, DTI, fMRI, rs-fMRI |
| **Resolution** | 1mm isotropic (T1) to 3mm (fMRI) |

**Supported MRI Modalities:**
- **T1-weighted (T1w)**: Gray/white matter segmentation, cortical thickness
- **T2-weighted (T2w)**: Lesion detection, general pathology
- **FLAIR**: White matter hyperintensities, lesion quantification
- **Diffusion Tensor Imaging (DTI)**: White matter integrity, tractography
- **Resting-state fMRI**: Functional connectivity, default mode network
- **Task-based fMRI**: Regional activation patterns

**Ingestion Flow:**
```
PACS/Scanner → DICOM Push (DIMSE/C-MOVE) → DICOM Router
                      → De-identification (face removal, tag scrubbing)
                      → Quality Check (motion, artifact assessment)
                      → Store in DICOM Repository
                      → Convert to NIfTI for processing
                      → Emit: mri.scan_ingested event
                      → Trigger: MRI Analyzer (async, queue-based)
```

**Preprocessing Pipeline:**
```
Raw DICOM → DICOM to NIfTI → Intensity Normalization
                → Brain Extraction (BET/SynthStrip) → Bias Field Correction
                → Spatial Normalization (MNI152) → Segmentation (FreeSurfer/FSL)
                → Cortical Thickness Estimation → Volumetric Analysis
                → Lesion Segmentation (if FLAIR/T2) → Connectivity Mapping (if fMRI)
                → Biomarker Extraction → Deviation Analysis
```

**Canonical Data Model:**
```json
{
  "mri_id": "uuid",
  "patient_id": "uuid",
  "scan_session_id": "uuid",
  "acquired_at": "2024-12-19T10:30:00Z",
  "acquisition_metadata": {
    "scanner": "Siemens Prisma 3T",
    "field_strength": "3T",
    "sequences": ["T1w", "FLAIR", "DTI", "rs-fMRI"],
    "resolution_mm": [1.0, 1.0, 1.0],
    "volumes_acquired": 192
  },
  "structural_analysis": {
    "total_brain_volume_ml": 1250.4,
    "gray_matter_volume_ml": 680.2,
    "white_matter_volume_ml": 520.1,
    "csf_volume_ml": 150.4,
    "hippocampal_volume_ml": 7.8,
    "hippocampal_z_score": -0.45,
    "cortical_thickness_mm": 2.65,
    "thickness_percentile": 42.0,
    "ventricular_volume_ml": 22.1,
    "white_matter_hyperintensity_ml": 2.3
  },
  "functional_connectivity": {
    "default_mode_network_coherence": 0.72,
    "salience_network_coherence": 0.68,
    "executive_network_coherence": 0.65,
    "network_comparison_z_scores": {...}
  },
  "quality_metrics": {
    "motion_rms_mm": 0.12,
    "tSNR": 65.4,
    "structural_quality_score": 0.95
  }
}
```

---

#### 2.3.4 Labs (Laboratory Results)

| Attribute | Value |
|-----------|-------|
| **Data Type** | Structured laboratory results |
| **Primary Formats** | HL7 FHIR R4 (Observation), JSON |
| **Frequency** | Per-order (typically monthly to quarterly) |
| **Privacy Level** | PHI - Full protection |
| **Integration** | EHR/LIS via FHIR API, HL7 v2.x, manual entry |

**Supported Lab Panels:**
- **CBC**: WBC, RBC, Hemoglobin, Hematocrit, Platelets
- **CMP**: Glucose, BUN, Creatinine, eGFR, Electrolytes, Liver enzymes
- **Thyroid**: TSH, Free T3, Free T4, Anti-TPO, Anti-TG
- **Inflammatory**: hs-CRP, ESR, Ferritin, Homocysteine
- **Metabolic**: HbA1c, Fasting Insulin, Vitamin D, B12, Folate
- **Lipids**: Total Cholesterol, LDL, HDL, Triglycerides
- **Toxicology/Drug Levels**: Lithium, Valproate, Clozapine, etc.

**Ingestion Flow:**
```
EHR/LIS → FHIR Subscription / HL7 ORU Message → FHIR Router
                → LOINC Code Validation
                → Reference Range Mapping
                → Abnormal Flag Detection
                → Store in FHIR Repository
                → Emit: lab.result_received event
                → Trigger: Lab Analyzer + Biomarker Analyzer
```

**Canonical Data Model (FHIR R4 Observation):**
```json
{
  "resourceType": "Observation",
  "id": "uuid",
  "meta": {
    "versionId": "1",
    "profile": ["http://deepsynaps.org/fhir/StructureDefinition/deepsynaps-lab-result"]
  },
  "status": "final",
  "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "laboratory"}]}],
  "code": {"coding": [{"system": "http://loinc.org", "code": "33717-0", "display": "Vitamin D 25-OH"}]},
  "subject": {"reference": "Patient/uuid"},
  "effectiveDateTime": "2024-12-19T08:00:00Z",
  "valueQuantity": {
    "value": 22.5,
    "unit": "ng/mL",
    "system": "http://unitsofmeasure.org"
  },
  "referenceRange": [{
    "low": {"value": 30.0, "unit": "ng/mL"},
    "high": {"value": 100.0, "unit": "ng/mL"},
    "text": "Insufficient: <30, Optimal: 30-100"
  }],
  "interpretation": {"coding": [{"code": "L", "display": "Low"}]},
  "deepsynaps_analysis": {
    "clinical_significance": "moderate",
    "psychiatric_relevance": "associated_with_depression",
    "recommended_action": "supplementation_considered"
  }
}
```

---

#### 2.3.5 Biomarkers (Blood/Inflammation)

| Attribute | Value |
|-----------|-------|
| **Data Type** | Blood-based biomarker concentrations |
| **Primary Formats** | CSV, JSON, FHIR Observation |
| **Frequency** | Per-draw (typically monthly) |
| **Privacy Level** | PHI - Full protection |
| **Special Handling** | Cold chain tracking, processing time metadata |

**Biomarker Categories:**
- **Inflammatory**: IL-6, TNF-alpha, hs-CRP, ESR, procalcitonin
- **Neurotrophic**: BDNF, NGF, VEGF, GDNF
- **Metabolic**: HbA1c, fasting glucose, insulin, HOMA-IR
- **Nutritional**: Omega-3 index, vitamin D, B12, folate, zinc, magnesium
- **Oxidative Stress**: MDA, GSH, SOD, catalase
- **Hormonal**: Cortisol (AM/PM), DHEA-S, testosterone, estrogen, progesterone
- **Autoimmune**: ANA, Anti-TPO, Anti-TG, celiac panel
- **Gut-Brain Axis**: Zonulin, LPS-binding protein, short-chain fatty acids

**Ingestion Flow:**
```
Lab Portal / Manual Entry → POST /api/v1/ingestion/biomarkers
                              → Biomarker ID Validation
                              → Unit Conversion and Standardization
                              → Reference Range Application
                              → Trend Analysis (vs. prior draws)
                              → Store in Biomarker Repository
                              → Emit: biomarker.draw_processed event
                              → Trigger: Biomarker Analyzer
```

---

#### 2.3.6 Medications

| Attribute | Value |
|-----------|-------|
| **Data Type** | Structured medication lists with dosing |
| **Primary Formats** | FHIR R4 (MedicationRequest, MedicationStatement), JSON |
| **Frequency** | Ongoing (real-time updates) |
| **Privacy Level** | PHI - Full protection |
| **Integration** | EHR Medication List, e-Prescribing |

**Medication Data Elements:**
- Drug name (generic + brand), RXCUI mapping
- Dose, route, frequency, duration
- Prescriber, pharmacy, fill dates
- Adherence metrics (if available via pharmacy data)
- Side effect tracking (patient-reported)
- Prior medication history (switch/trial tracking)

**Ingestion Flow:**
```
EHR / e-Prescribing → FHIR MedicationRequest → Medication Router
                          → Drug Interaction Check
                          → Therapeutic Class Classification
                          → Dose Normalization
                          → Adherence Calculation
                          → Store in Medication Repository
                          → Emit: medication.updated event
                          → Trigger: Medication Analyzer
```

---

#### 2.3.7 Voice

| Attribute | Value |
|-----------|-------|
| **Data Type** | Audio recordings + automated transcripts |
| **Primary Formats** | WAV (48kHz/16-bit), JSON (transcript), WebM |
| **Frequency** | Per-recording (typically monthly) |
| **Privacy Level** | PHI - Full protection + Voiceprint De-identification |
| **Duration** | 2-10 minutes per recording |
| **Storage** | Encrypted object storage with voiceprint scrubbing |

**Voice Assessment Protocols:**
- **Read Speech**: Standardized passage reading for acoustic feature extraction
- **Spontaneous Speech**: Open-ended prompts (describe your week, tell a story)
- **Emotional Prosody**: Emotional expression tasks
- **Phonemic Fluency**: Rapid word generation (sustained phonation)
- **Semantic Fluency**: Category-based word generation

**Ingestion Flow:**
```
Recording Device / Portal → Audio Upload → Quality Check (SNR, clipping)
                              → Voiceprint Anonymization (voice conversion)
                              → Transcription (Whisper API, HIPAA-compliant)
                              → Speaker Diarization (if multiple speakers)
                              → Acoustic Feature Extraction
                              → Linguistic Feature Extraction
                              → Store Audio + Transcript + Features
                              → Emit: voice.recording_processed event
                              → Trigger: Voice Analyzer
```

**Acoustic Features Extracted:**
- Fundamental frequency (F0) and variation
- Jitter, shimmer, HNR (harmonics-to-noise ratio)
- Formant frequencies (F1, F2, F3) and transitions
- Speaking rate, pause duration and frequency
- Spectral centroid, spectral rolloff, MFCCs
- Prosodic contour (pitch variation patterns)

**Linguistic Features Extracted:**
- Word count, sentence length, type-token ratio
- Sentiment polarity and intensity
- Semantic density (idea density, content density)
- Syntactic complexity (parse tree depth)
- Named entity recognition (self-reference patterns)
- Topic modeling (latent themes)

---

#### 2.3.8 Video

| Attribute | Value |
|-----------|-------|
| **Data Type** | Video recordings + behavioral annotations |
| **Primary Formats** | MP4 (H.264), JSON (annotations), AVI |
| **Frequency** | Per-recording (typically monthly) |
| **Privacy Level** | PHI - Full protection + Facial Blurring |
| **Duration** | 5-20 minutes per recording |
| **Resolution** | 720p minimum, 1080p preferred |

**Video Assessment Protocols:**
- **Structured Interview**: Clinician-patient interaction
- **Task Performance**: Neuropsychological task completion
- **Spontaneous Behavior**: Waiting room or natural setting observation
- **Emotional Expression**: Emotion elicitation and display
- **Gait and Movement**: Walking and posture analysis

**Ingestion Flow:**
```
Camera / Portal → Video Upload → Quality Check (resolution, lighting)
                    → Facial De-identification (blur/mask optional regions)
                    → Frame Extraction (1-5 fps for analysis)
                    → Pose Estimation (MediaPipe/Human Pose)
                    → Facial Action Unit Detection
                    → Gaze Tracking
                    → Movement Quantification
                    → Store Video + Annotations + Features
                    → Emit: video.recording_processed event
                    → Trigger: Video Analyzer + Movement Analyzer
```

---

#### 2.3.9 Movement (Sensor Data)

| Attribute | Value |
|-----------|-------|
| **Data Type** | Motion sensor data from standardized assessments |
| **Primary Formats** | CSV, JSON, BVH (motion capture) |
| **Frequency** | Per-assessment (typically quarterly) |
| **Privacy Level** | PHI - Full protection |
| **Sensors** | Accelerometer, gyroscope, force plates, motion capture |

**Movement Assessment Protocols:**
- **Fine Motor**: Finger tapping, grooved pegboard, spiral drawing
- **Gait Analysis**: TUG (Timed Up and Go), 10-meter walk, gait variability
- **Balance**: Sway measurement, Romberg test, balance board
- **Tremor Analysis**: Resting, postural, kinetic tremor quantification
- **Bradykinesia**: Rapid alternating movements, repetitive motion
- **Coordination**: Heel-to-shin, finger-to-nose

**Ingestion Flow:**
```
Sensor Device / App → Data Upload → Calibration Validation
                        → Signal Preprocessing (filtering, alignment)
                        → Feature Extraction
                        → Normative Comparison
                        → Store in Movement Repository
                        → Emit: movement.assessment_completed event
                        → Trigger: Movement Analyzer
```

---

#### 2.3.10 Wearables

| Attribute | Value |
|-----------|-------|
| **Data Type** | Continuous physiological and activity data |
| **Primary Formats** | CSV, API-sync (REST/Webhook), JSON |
| **Frequency** | Real-time streaming + daily batch sync |
| **Privacy Level** | Partial PHI (de-identified for analysis) |
| **Sync Interval** | 1-15 minutes (device-dependent) |
| **Devices** | Apple Watch, Fitbit, Garmin, Oura Ring, Empatica E4, Whoop |

**Wearable Data Streams:**
- **Heart Rate**: Continuous HR, resting HR, HR variability (HRV)
- **Activity**: Steps, distance, floors, active minutes, sedentary time
- **Sleep**: Duration, stages (light/deep/REM), sleep onset latency, WASO
- **SpO2**: Blood oxygen saturation (nighttime and spot checks)
- **Temperature**: Skin temperature, wrist temperature trends
- **Electrodermal Activity**: Stress response (EDA/GSR)
- **Blood Glucose**: CGM data (if integrated)
- **Respiration**: Breathing rate, respiratory variability

**Ingestion Flow:**
```
Wearable Device → Platform API (Apple HealthKit / Google Fit / Device API)
                    → OAuth Consent Flow
                    → Daily Data Sync (batch)
                    → Real-time Webhooks (critical alerts)
                    → Data Validation and Outlier Detection
                    → Feature Aggregation (hourly, daily)
                    → Store in Wearables Time-Series DB
                    → Emit: wearables.data_synced event
                    → Trigger: Wearables Analyzer
```

---

#### 2.3.11 Digital Phenotyping (Passive Sensing)

| Attribute | Value |
|-----------|-------|
| **Data Type** | Passive smartphone and device sensing data |
| **Primary Formats** | JSON, Parquet (aggregated), encrypted |
| **Frequency** | Continuous (background collection) |
| **Privacy Level** | Partial PHI (consent-tiered, anonymized patterns) |
| **Platform** | DeepSynaps Phenotyping SDK (iOS/Android) |

**Digital Phenotyping Features:**
- **Mobility Patterns**: GPS-derived location variance, radius of gyration, home stay time
- **Communication Patterns**: Call/SMS frequency, duration, reciprocity (metadata only)
- **App Usage Patterns**: Screen time, app categories, usage rhythm
- **Typing Dynamics**: Keystroke timing, autocorrect frequency (opt-in)
- **Sleep Detection**: Phone movement, screen off patterns, ambient light
- **Social Activity**: Social app engagement patterns (anonymized)
- **Circadian Rhythm**: Activity onset, peak activity times, regularity index

**Ingestion Flow:**
```
Smartphone (SDK) → Encrypted Buffer → Daily Upload (WiFi)
                     → Consent Tier Filtering
                     → Anonymization (hashed identifiers)
                     → Feature Computation
                     → Behavioral Pattern Extraction
                     → Store in Phenotyping Repository
                     → Emit: phenotyping.features_computed event
                     → Trigger: Digital Phenotyping Analyzer
```

---

#### 2.3.12 Clinical Notes

| Attribute | Value |
|-----------|-------|
| **Data Type** | Unstructured clinical text notes |
| **Primary Formats** | Markdown, JSON (structured extraction), FHIR DocumentReference |
| **Frequency** | Per-visit |
| **Privacy Level** | PHI - Full protection |
| **Types** | Progress notes, intake notes, treatment plans, discharge summaries |

**Clinical Note Types:**
- **Intake/Initial Evaluation**: Comprehensive clinical history
- **Progress Notes**: Visit-by-visit documentation (SOAP format)
- **Treatment Planning**: Goals, interventions, timeline
- **Discharge/Transfer Summaries**: Episode completion documentation
- **Consultation Notes**: Specialist input
- **Narrative Summaries**: Patient-generated health narratives

**Ingestion Flow:**
```
EHR / Direct Entry → Note Upload → Section Parsing (SOAP / Custom)
                       → NLP Processing (entity extraction)
                       → Sentiment and Tone Analysis
                       → Symptom and Diagnosis Extraction (SNOMED/ICD mapping)
                       → Medication Mention Extraction
                       → Temporal Expression Extraction
                       → Store Note + Structured Extractions
                       → Emit: note.processed event
                       → Trigger: Clinical Notes Analyzer
```

---

### 2.4 Source Cross-Reference Matrix

| Source | PHQ-9 | qEEG | MRI | Labs | BDNF | Voice | Video | Movement | Wearables | Phenotyping | Notes |
|--------|-------|------|-----|------|------|-------|-------|----------|-----------|-------------|-------|
| Assessments | x | | | | | | | | x | x | x |
| qEEG | x | x | x | | | | | | | | x |
| MRI | | x | x | | | | | x | | | x |
| Labs | x | | | x | x | | | | x | | x |
| Biomarkers | x | | | x | x | | | | x | | x |
| Medications | x | x | x | x | | | | | x | | x |
| Voice | x | | | | | x | x | | | x | x |
| Video | x | | | | | x | x | x | | x | x |
| Movement | x | | x | | | | x | x | x | x | x |
| Wearables | x | | | x | | | | x | x | x | x |
| Phenotyping | x | | | | | x | x | x | x | x | x |
| Notes | x | x | x | x | x | x | x | x | x | x | x |

---

## 3. Analyzer Processing Layer (17 Analyzers)

### 3.1 Overview

The Analyzer Processing Layer transforms raw multimodal data into clinical signals through 17 specialized analyzers. Each analyzer is a self-contained processing unit with defined inputs, outputs, evidence bases, and uncertainty quantification.

### 3.2 Analyzer Architecture Pattern

Every analyzer follows a standardized architecture:

```
+-------------------------------------------------------------+
|                      ANALYZER MODULE                         |
|                                                              |
|  +-------------+   +--------------+   +------------------+  |
|  | Input Ports | → | Processing   | → | Output Signals   |  |
|  | (typed)     |   | Pipeline     |   | (structured)     |  |
|  +-------------+   +--------------+   +------------------+  |
|         ↑                 ↑                  ↑               |
|  +-------------+   +--------------+   +------------------+  |
|  | Consent     |   | Evidence     |   | Uncertainty      |  |
|  | Validator   |   | Engine       |   | Quantifier       |  |
|  +-------------+   +--------------+   +------------------+  |
+-------------------------------------------------------------+
```

---

### 3.3 Analyzer 1: Assessment Analyzer (AA-001)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | AA-001 |
| **Name** | Assessment Scoring and Trend Analyzer |
| **Version** | 4.2.0 |
| **Processing Mode** | Synchronous (< 2 seconds) |
| **Clinical Risk Level** | Low |

**Input Data Sources:**
- Assessments (primary)
- Clinical Notes (supplementary for context)
- Medications (for medication-symptom correlation)

**Processing Pipeline:**
```
1. Score Validation → Check response completeness, out-of-range detection
2. Normative Comparison → Compare to age/sex-matched population norms
3. Severity Classification → Map score to clinical severity category
4. Longitudinal Trend → Calculate trajectory (improving/stable/worsening)
5. Change Score → Reliable Change Index (RCI) computation
6. Risk Flagging → Suicide risk, functional decline alerts
7. Correlation Matrix → Cross-assessment correlation analysis
8. Narrative Generation → Plain-language summary generation
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `severity_score` | Float | Normalized severity (0-100) |
| `severity_category` | Enum | None/Minimal/Mild/Moderate/Severe/Extreme |
| `trend_direction` | Enum | Improving/Stable/Worsening/Rapid Change |
| `trend_slope` | Float | Rate of change per week |
| `reliable_change` | Boolean | Statistically significant change |
| `risk_flags` | Array | Active risk indicators |
| `cross_assessment_profile` | Object | Multi-domain symptom profile |

**Evidence Links:**
- Score interpretation: Validated instrument manuals, population norm studies
- Trend analysis: Reliable Change Index methodology (Jacobson & Truax, 1991)
- Risk flagging: C-SSRS validation studies, Columbia protocol

**Uncertainty Quantification:**
- Score confidence: Based on response consistency and completeness
- Trend confidence: Based on data point density and time span
- Minimum visits for trend: 2 (with warning: "trend based on limited data")
- Trend reliability increases with 4+ data points

**Consent Requirements:**
- Standard clinical consent (Level 1)
- Assessment data always available for scoring

**API Endpoints:**
```
POST /api/v1/analyzers/assessment/score
GET  /api/v1/analyzers/assessment/{patient_id}/trend
GET  /api/v1/analyzers/assessment/{patient_id}/cross-profile
GET  /api/v1/analyzers/assessment/{patient_id}/risk-flags
```

---

### 3.4 Analyzer 2: qEEG Spectral Analyzer (QSA-002)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | QSA-002 |
| **Name** | qEEG Spectral and Connectivity Analyzer |
| **Version** | 5.1.0 |
| **Processing Mode** | Asynchronous (2-10 minutes) |
| **Clinical Risk Level** | Medium |

**Input Data Sources:**
- qEEG (primary, raw EDF)
- MRI (structural context for source localization)
- Medications (for medication-EEG interaction analysis)
- Clinical Notes (for symptom-EEG correlation)

**Processing Pipeline:**
```
1. Signal Quality Assessment → tSNR, artifact ratio, channel integrity
2. Spectral Decomposition → FFT/Welch for all 19-128 channels
3. Band Power Analysis → Absolute and relative power (delta, theta, alpha, beta, gamma)
4. Coherence Analysis → Inter- and intra-hemispheric connectivity
5. Asymmetry Analysis → Frontal, temporal, parietal asymmetry indices
6. Source Localization → LORETA/eLORETA for 3D brain mapping (requires MRI)
7. Normative Database Comparison → Z-score mapping against age-matched norms
8. Deviation Signature Detection → Identify atypical patterns
9. Clinical Interpretation → Map deviations to clinical phenotypes
10. Longitudinal Comparison → Track changes across sessions
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `spectral_profile` | Object | Full spectral decomposition per region |
| `z_score_map` | Object | Normative deviation scores per region/band |
| `connectivity_matrix` | 2D Array | Region-to-region connectivity strengths |
| `asymmetry_index` | Object | Asymmetry metrics per region pair |
| `deviation_signature` | Object | Clustered atypical pattern description |
| `clinical_phenotype` | Array | Matched EEG phenotypes (e.g., "frontal_alpha_asymmetry") |
| `source_localization` | Object | 3D cortical activity distribution |
| `medication_response_prediction` | Object | Predicted EEG response to common medications |
| `quality_grade` | Enum | A (excellent) to F (unusable) |

**Evidence Links:**
- Spectral analysis: FDA-cleared qEEG systems (Neuroguide, NeuroSpec)
- Normative database: validated lifespan norms (n > 10,000)
- Clinical phenotypes: Johnstone et al. EEG phenotyping literature
- Medication prediction: Sufficiency-based prediction model

**Uncertainty Quantification:**
- Signal quality grade directly impacts confidence
- Z-score confidence intervals: 95% CI provided
- Source localization uncertainty: Point Spread Function (PSF) per source
- Minimum channels for full analysis: 19
- MRI co-registration improves localization confidence by ~30%

**Consent Requirements:**
- Standard clinical consent (Level 1)
- Research consent (Level 2) for normative database comparison
- Biobank consent (Level 3) for data contribution

**API Endpoints:**
```
POST /api/v1/analyzers/qeeg/spectral-analysis       → Initiate analysis
GET  /api/v1/analyzers/qeeg/{analysis_id}/status    → Check progress
GET  /api/v1/analyzers/qeeg/{analysis_id}/results   → Full results
GET  /api/v1/analyzers/qeeg/{analysis_id}/z-scores  → Deviation map
GET  /api/v1/analyzers/qeeg/{analysis_id}/connectivity → Connectivity matrix
GET  /api/v1/analyzers/qeeg/{patient_id}/longitudinal → Session comparison
GET  /api/v1/analyzers/qeeg/{analysis_id}/source-localization → LORETA output
```

---

### 3.5 Analyzer 3: MRI Structural Analyzer (MSA-003)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | MSA-003 |
| **Name** | MRI Structural and Volumetric Analyzer |
| **Version** | 3.8.0 |
| **Processing Mode** | Asynchronous (15-45 minutes) |
| **Clinical Risk Level** | Medium |

**Input Data Sources:**
- MRI T1-weighted (primary)
- MRI FLAIR/T2 (for lesion detection)
- Age, sex, handedness (demographics for normative comparison)
- Prior MRI scans (for longitudinal analysis)

**Processing Pipeline:**
```
1. Quality Assessment → Motion, contrast, artifact evaluation
2. Brain Extraction → Remove skull, dura, non-brain tissue
3. Bias Field Correction → Intensity non-uniformity correction
4. Tissue Segmentation → Gray matter, white matter, CSF classification
5. Cortical Surface Reconstruction → Pial and white matter surfaces
6. Cortical Thickness Estimation → Per-vertex thickness mapping
7. Subcortical Segmentation → Hippocampus, amygdala, thalamus, etc.
8. Volumetric Analysis → Total and regional volumes
9. Normative Comparison → Age/sex-adjusted z-scores
10. Lesion Segmentation (if FLAIR) → White matter hyperintensity quantification
11. Longitudinal Analysis → Atrophy rate calculation
12. Clinical Correlation → Volume-thickness-symptom mapping
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `brain_volumes` | Object | Total, GM, WM, CSF, ventricular volumes |
| `regional_volumes` | Object | 50+ subcortical structure volumes with z-scores |
| `cortical_thickness` | Object | Per-region thickness with z-scores |
| `surface_area` | Object | Cortical surface area per region |
| `atrophy_rate` | Float | Annualized volume change (if longitudinal) |
| `lesion_burden` | Object | White matter hyperintensity volume and count |
| `quality_grade` | Enum | A (excellent) to F (unusable) |
| `clinical_flags` | Array | Significant findings requiring review |

**Evidence Links:**
- Segmentation: FreeSurfer 7.x, validated against histology
- Normative data: ADNI, UK Biobank population data
- Hippocampal analysis: Harmonized protocol (HarP)
- Cortical thickness: Desikan-Killiany atlas (68 regions)

**Uncertainty Quantification:**
- Segmentation confidence: Dice coefficient per region
- Volumetric precision: Test-retest reliability coefficients
- Minimum field strength: 1.5T (3T recommended)
- Longitudinal precision: > 6 months between scans for reliable atrophy detection

**Consent Requirements:**
- Standard clinical consent (Level 1)
- MRI safety screening (separate)
- Research consent (Level 2) for population comparison

**API Endpoints:**
```
POST /api/v1/analyzers/mri/structural-analysis
GET  /api/v1/analyzers/mri/{analysis_id}/status
GET  /api/v1/analyzers/mri/{analysis_id}/volumes
GET  /api/v1/analyzers/mri/{analysis_id}/thickness
GET  /api/v1/analyzers/mri/{analysis_id}/lesions
GET  /api/v1/analyzers/mri/{patient_id}/longitudinal
```

---

### 3.6 Analyzer 4: MRI Functional Analyzer (MFA-004)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | MFA-004 |
| **Name** | MRI Functional Connectivity Analyzer |
| **Version** | 3.2.0 |
| **Processing Mode** | Asynchronous (20-60 minutes) |
| **Clinical Risk Level** | Medium |

**Input Data Sources:**
- rs-fMRI (primary)
- T1-weighted MRI (for registration and parcellation)
- Demographics (age, sex for normative comparison)
- Clinical assessments (for symptom-connectivity correlation)

**Processing Pipeline:**
```
1. Preprocessing → Slice timing, motion correction, spatial normalization
2. Denoising → CompCor, motion scrubbing, bandpass filtering
3. Network Construction → ROI-based and ICA-based parcellation
4. Connectivity Matrix → Pearson correlation between all region pairs
5. Graph Theory Metrics → Small-worldness, modularity, hub identification
6. Network Analysis → DMN, SN, CEN, FPN functional connectivity
7. Clinical Correlation → Link connectivity patterns to symptom domains
8. Longitudinal Tracking → Connectivity change over time
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `connectivity_matrix` | 2D Array | Full connectivity matrix (68x68 or 400x400) |
| `network_coherence` | Object | Within-network connectivity strength per network |
| `between_network_connectivity` | Object | Cross-network connectivity indices |
| `graph_metrics` | Object | Global efficiency, clustering coefficient, path length |
| `clinical_correlations` | Object | Connectivity-symptom correlation coefficients |
| `quality_metrics` | Object | Motion, tSNR, coverage metrics |

**API Endpoints:**
```
POST /api/v1/analyzers/mri/functional-analysis
GET  /api/v1/analyzers/mri/{analysis_id}/connectivity
GET  /api/v1/analyzers/mri/{analysis_id}/networks
GET  /api/v1/analyzers/mri/{analysis_id}/graph-metrics
```

---

### 3.7 Analyzer 5: Laboratory Results Analyzer (LRA-005)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | LRA-005 |
| **Name** | Laboratory Results Interpretation Analyzer |
| **Version** | 4.0.0 |
| **Processing Mode** | Synchronous (< 1 second) |
| **Clinical Risk Level** | High (abnormal value detection) |

**Input Data Sources:**
- Labs (primary, FHIR Observation resources)
- Medications (drug-lab interaction checking)
- Demographics (age/sex-specific reference ranges)
- Prior lab results (trend analysis)

**Processing Pipeline:**
```
1. Result Validation → LOINC code verification, unit standardization
2. Reference Range Application → Age/sex-adjusted normal ranges
3. Abnormal Flagging → Critical value identification
4. Trend Analysis → Direction of change, rate of change
5. Drug Interaction Check → Medication impact on lab values
6. Clinical Significance Assessment → Psychiatric relevance scoring
7. Deficiency/Excess Mapping → Nutritional and metabolic status
8. Panel Completeness Check → Missing tests identification
9. Alert Generation → Critical/abnormal value notifications
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `abnormal_flags` | Array | Abnormal results with severity (info/warning/critical) |
| `critical_alerts` | Array | Values requiring immediate attention |
| `trend_analysis` | Object | Trajectory per lab value over time |
| `clinical_significance` | Object | Psychiatric condition associations |
| `deficiency_profile` | Object | Identified nutritional/metabolic deficiencies |
| `drug_interactions` | Array | Medications affecting lab results |
| `recommended_tests` | Array | Suggested follow-up testing |

**Critical Value Alerts (Immediate Notification):**
- Glucose < 50 or > 400 mg/dL
- Potassium < 2.5 or > 6.5 mEq/L
- Sodium < 120 or > 160 mEq/L
- eGFR < 15 mL/min
- Lithium > 2.0 mEq/L (toxic)
- Clozapine absolute neutrophil count < 1500

**API Endpoints:**
```
GET  /api/v1/analyzers/labs/{patient_id}/panel-status
GET  /api/v1/analyzers/labs/{patient_id}/abnormal-results
GET  /api/v1/analyzers/labs/{patient_id}/deficiency-profile
GET  /api/v1/analyzers/labs/{patient_id}/critical-alerts
POST /api/v1/analyzers/labs/interpret-panel
GET  /api/v1/analyzers/labs/{patient_id}/trend/{loinc_code}
```

---

### 3.8 Analyzer 6: Biomarker Analyzer (BMA-006)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | BMA-006 |
| **Name** | Blood-Based Biomarker Integration Analyzer |
| **Version** | 2.5.0 |
| **Processing Mode** | Synchronous (< 2 seconds) |
| **Clinical Risk Level** | Medium |

**Input Data Sources:**
- Biomarkers (primary)
- Labs (overlapping measurements)
- Assessments (for biomarker-symptom correlation)
- Medications (for medication-biomarker interaction)

**Processing Pipeline:**
```
1. Biomarker Validation → ID confirmation, unit conversion, range check
2. Inflammatory Index → Composite inflammation score
3. Neurotrophic Index → BDNF/NGF composite score
4. Metabolic Risk Score → Insulin resistance, metabolic syndrome markers
5. Oxidative Stress Index → Composite oxidative stress score
6. Gut-Brain Index → Zonulin, LPS, SCFA composite
7. Hormonal Balance Score → Cortisol rhythm, sex hormone balance
8. Nutrient Sufficiency Score → Vitamin/mineral adequacy
9. Biomarker-Clinical Correlation → Link to symptom dimensions
10. Treatment Response Prediction → Predicted response to interventions
11. Trend Analysis → Longitudinal biomarker trajectories
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `inflammatory_index` | Float | Composite inflammation (0-100) |
| `neurotrophic_index` | Float | Neuroplasticity potential (0-100) |
| `metabolic_risk_score` | Float | Metabolic dysfunction severity |
| `oxidative_stress_index` | Float | Oxidative burden (0-100) |
| `gut_brain_index` | Float | Gut barrier integrity (0-100) |
| `hormonal_balance` | Object | Cortisol, thyroid, sex hormone status |
| `nutrient_sufficiency` | Object | Vitamin/mineral adequacy scores |
| `composite_biomarker_profile` | Object | Integrated multi-system view |
| `treatment_predictions` | Array | Predicted intervention responses |

**API Endpoints:**
```
GET  /api/v1/analyzers/biomarkers/{patient_id}/full-profile
GET  /api/v1/analyzers/biomarkers/{patient_id}/inflammatory-index
GET  /api/v1/analyzers/biomarkers/{patient_id}/neurotrophic-index
GET  /api/v1/analyzers/biomarkers/{patient_id}/metabolic-risk
GET  /api/v1/analyzers/biomarkers/{patient_id}/nutrient-status
POST /api/v1/analyzers/biomarkers/predict-response
```

---

### 3.9 Analyzer 7: Medication Analyzer (MA-007)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | MA-007 |
| **Name** | Medication Optimization and Safety Analyzer |
| **Version** | 4.5.0 |
| **Processing Mode** | Synchronous (< 1 second) |
| **Clinical Risk Level** | High (drug interaction detection) |

**Input Data Sources:**
- Medications (primary)
- Labs (drug levels, organ function)
- Assessments (symptom tracking for efficacy)
- Biomarkers (pharmacogenomic markers if available)
- Clinical Notes (treatment response documentation)

**Processing Pipeline:**
```
1. Medication Reconciliation → Current list validation, duplicate detection
2. Drug Interaction Check → Drug-drug, drug-food, drug-disease interactions
3. Dosing Validation → Age/weight-based dosing, renal/hepatic adjustment
4. Adherence Estimation → MPR (Medication Possession Ratio) calculation
5. Efficacy Tracking → Symptom change correlated with medication timing
6. Side Effect Profile → Active side effect assessment
7. Drug Level Monitoring → Therapeutic drug monitoring (TDM) alerts
8. Pharmacogenomic Guidance → CYP450 phenotype-based recommendations
9. Deprescribing Opportunities → Unnecessary medication identification
10. Treatment Resistance Detection → Failed trial identification
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `drug_interactions` | Array | Active interactions with severity levels |
| `adherence_score` | Float | MPR-based adherence (0-100) |
| `efficacy_indicators` | Object | Symptom response per medication |
| `side_effect_profile` | Object | Active and predicted side effects |
| `tdm_alerts` | Array | Drug level monitoring reminders |
| `dosing_recommendations` | Array | Optimal dosing suggestions |
| `deprescribing_candidates` | Array | Medications to consider discontinuing |
| `treatment_resistance_flags` | Array | Failed adequate trials |

**API Endpoints:**
```
GET  /api/v1/analyzers/medications/{patient_id}/safety-check
GET  /api/v1/analyzers/medications/{patient_id}/adherence
GET  /api/v1/analyzers/medications/{patient_id}/efficacy
GET  /api/v1/analyzers/medications/{patient_id}/interactions
POST /api/v1/analyzers/medications/check-compatibility
```

---

### 3.10 Analyzer 8: Voice Acoustic Analyzer (VAA-008)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | VAA-008 |
| **Name** | Voice Acoustic Feature Analyzer |
| **Version** | 3.0.0 |
| **Processing Mode** | Asynchronous (1-5 minutes) |
| **Clinical Risk Level** | Low-Medium |

**Input Data Sources:**
- Voice recordings (primary)
- Medications (for medication-voice effects, e.g., anticholinergic dry mouth)
- Assessments (for mood-voice correlation)
- Demographics (age/sex for normative vocal comparison)

**Processing Pipeline:**
```
1. Audio Quality Assessment → SNR, clipping, background noise
2. Voice Activity Detection → Segment speech vs. silence
3. Fundamental Frequency Analysis → F0 statistics, range, variability
4. Voice Perturbation Analysis → Jitter, shimmer, HNR
5. Formant Analysis → F1, F2, F3 frequencies and transitions
6. Spectral Analysis → MFCCs, spectral centroid, bandwidth
7. Prosodic Analysis → Intonation contour, stress patterns, rhythm
8. Speaking Rate Analysis → Syllables per second, articulation rate
9. Pause Pattern Analysis → Pause duration, frequency, distribution
10. Affective Acoustic Analysis → Emotional valence from prosody
11. Longitudinal Comparison → Track changes across recordings
12. Clinical Correlation → Map features to depression/mania/cognitive markers
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `f0_statistics` | Object | Mean, SD, range, variability of fundamental frequency |
| `voice_perturbation` | Object | Jitter, shimmer, HNR values |
| `formant_profile` | Object | F1, F2, F3 central tendencies |
| `spectral_features` | Object | MFCCs, spectral descriptors |
| `prosodic_features` | Object | Pitch contour, rhythm metrics |
| `speaking_rate` | Float | Syllables per second |
| `affective_markers` | Object | Emotional valence, arousal, depression probability |
| `cognitive_markers` | Object | Speech coherence, fluency metrics |
| `quality_grade` | Enum | Audio quality rating |

**Evidence Links:**
- Depression detection: Cummins et al. voice-based depression detection (AUC 0.75-0.85)
- Cognitive markers: ROI-based speech analysis for MCI detection
- Prosodic features: Scherer emotion expression studies

**API Endpoints:**
```
POST /api/v1/analyzers/voice/acoustic-analysis
GET  /api/v1/analyzers/voice/{analysis_id}/acoustic-features
GET  /api/v1/analyzers/voice/{patient_id}/longitudinal-acoustic
```

---

### 3.11 Analyzer 9: Voice Linguistic Analyzer (VLA-009)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | VLA-009 |
| **Name** | Voice Linguistic and Semantic Analyzer |
| **Version** | 2.8.0 |
| **Processing Mode** | Asynchronous (1-5 minutes) |
| **Clinical Risk Level** | Low-Medium |

**Input Data Sources:**
- Voice transcripts (primary)
- Clinical Notes (for contextual understanding)
- Assessments (for symptom-linguistic correlation)
- Demographics (education level for linguistic complexity norms)

**Processing Pipeline:**
```
1. Transcript Validation → Completeness, language detection
2. Lexical Analysis → Word frequency, vocabulary diversity
3. Syntactic Analysis → Parse trees, grammatical complexity
4. Semantic Analysis → Topic modeling, coherence, semantic density
5. Sentiment Analysis → Valence, arousal, dominance
6. Psycholinguistic Features → LIWC category frequencies
7. Cognitive Markers → Idea density, proposition generation
8. Pragmatic Analysis → Turn-taking, repair, discourse markers
9. Self-Reference Analysis → First-person singular pronoun frequency
10. Temporal Orientation → Past/present/future focus
11. Clinical Correlation → Map to depression, anxiety, mania, psychosis markers
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `lexical_diversity` | Float | Type-token ratio, MATTR |
| `syntactic_complexity` | Float | Mean dependency depth |
| `semantic_density` | Float | Ideas per clause |
| `sentiment_profile` | Object | Positive/negative ratio, emotional tone |
| `psycholinguistic_categories` | Object | LIWC category percentages |
| `cognitive_linguistic_markers` | Object | Coherence, fluency, organization |
| `depression_linguistic_markers` | Object | First-person singular, absolutist words |
| `anxiety_linguistic_markers` | Object | Uncertainty words, threat references |
| `topic_distribution` | Object | Latent topic proportions |

**API Endpoints:**
```
POST /api/v1/analyzers/voice/linguistic-analysis
GET  /api/v1/analyzers/voice/{analysis_id}/linguistic-features
GET  /api/v1/analyzers/voice/{patient_id}/longitudinal-linguistic
```

---

### 3.12 Analyzer 10: Video Behavioral Analyzer (VBA-010)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | VBA-010 |
| **Name** | Video Behavioral and Affective Analyzer |
| **Version** | 3.3.0 |
| **Processing Mode** | Asynchronous (5-15 minutes) |
| **Clinical Risk Level** | Low |

**Input Data Sources:**
- Video recordings (primary)
- Voice recordings (for multimodal affective analysis)
- Assessments (for behavior-symptom correlation)

**Processing Pipeline:**
```
1. Video Quality Assessment → Resolution, lighting, face detection rate
2. Face Detection and Tracking → Bounding boxes, identity consistent tracking
3. Facial Action Unit Detection → FACS-based AU activation (AU1-AU45)
4. Expression Classification → Neutral, happy, sad, angry, fearful, disgusted, surprised
5. Gaze Tracking → Eye gaze direction, fixations, saccades
6. Head Pose Estimation → Pitch, yaw, roll angles
7. Body Pose Estimation → Skeletal keypoints, posture analysis
8. Movement Quantification → Head movement, fidgeting, restlessness
9. Affective Dynamics → Emotion expression patterns over time
10. Engagement Assessment → Attention, interaction quality
11. Psychomotor Analysis → Movement speed, amplitude, variability
12. Clinical Correlation → Map to depression, anxiety, psychosis, mania markers
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `facial_au_profile` | Object | Action unit activation frequencies and intensities |
| `expression_distribution` | Object | Time spent in each emotional expression |
| `gaze_metrics` | Object | Fixation duration, saccade frequency, gaze aversion |
| `head_pose_variance` | Object | Head movement patterns |
| `body_pose_features` | Object | Posture, body language descriptors |
| `psychomotor_activity` | Float | Overall movement index (retardation/agitation) |
| `affective_valence` | Float | Overall emotional tone |
| `engagement_score` | Float | Patient engagement level |
| `behavioral_markers` | Object | Depression, anxiety, mania behavioral indicators |

**API Endpoints:**
```
POST /api/v1/analyzers/video/behavioral-analysis
GET  /api/v1/analyzers/video/{analysis_id}/behavioral-features
GET  /api/v1/analyzers/video/{analysis_id}/affective-timeline
GET  /api/v1/analyzers/video/{patient_id}/longitudinal-behavioral
```

---

### 3.13 Analyzer 11: Movement Quantification Analyzer (MQA-011)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | MQA-011 |
| **Name** | Movement Quantification and Motor Analyzer |
| **Version** | 2.2.0 |
| **Processing Mode** | Asynchronous (2-10 minutes) |
| **Clinical Risk Level** | Low |

**Input Data Sources:**
- Movement sensor data (primary)
- Video recordings (for visual validation)
- Medications (for medication-motor effects, e.g., EPS)
- Assessments (for motor-symptom correlation)

**Processing Pipeline:**
```
1. Signal Preprocessing → Filtering, calibration, axis alignment
2. Activity Segmentation → Task vs. rest period identification
3. Tremor Analysis → Frequency, amplitude, distribution (rest/postural/kinetic)
4. Bradykinesia Assessment → Movement speed, amplitude, decrement
5. Gait Analysis → Step length, cadence, variability, symmetry
6. Balance Assessment → Sway area, velocity, directional stability
7. Fine Motor Assessment → Precision, speed, coordination metrics
8. Coordination Analysis → Finger-to-nose accuracy, dysmetria
9. Medication Effect Detection → Motor side effect quantification
10. Longitudinal Comparison → Motor trajectory tracking
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `tremor_metrics` | Object | Frequency, amplitude by type |
| `bradykinesia_index` | Float | Slowness severity (0-100) |
| `gait_parameters` | Object | Speed, stride length, variability |
| `balance_metrics` | Object | Sway area, velocity, stability |
| `fine_motor_score` | Float | Precision and speed composite |
| `coordination_index` | Float | Coordination quality (0-100) |
| `eps_risk_score` | Float | Extrapyramidal symptom probability |
| `motor_phenotype` | Array | Classified motor profile |

**API Endpoints:**
```
POST /api/v1/analyzers/movement/quantification
GET  /api/v1/analyzers/movement/{analysis_id}/motor-features
GET  /api/v1/analyzers/movement/{patient_id}/longitudinal-motor
```

---

### 3.14 Analyzer 12: Wearables Physiological Analyzer (WPA-012)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | WPA-012 |
| **Name** | Wearables Physiological Pattern Analyzer |
| **Version** | 4.0.0 |
| **Processing Mode** | Batch (hourly) + Streaming (real-time alerts) |
| **Clinical Risk Level** | Medium (real-time alert capability) |

**Input Data Sources:**
- Wearables (primary)
- Assessments (for symptom-physiology correlation)
- Medications (for medication-physiology effects)

**Processing Pipeline:**
```
1. Data Validation → Missing data handling, outlier detection
2. HRV Analysis → Time domain (RMSSD, pNN50), frequency domain (LF/HF)
3. Circadian Rhythm Analysis → Activity onset, acrophase, amplitude
4. Sleep Architecture → Duration, efficiency, stage distribution
5. Activity Pattern → Step count, intensity distribution, sedentary time
6. Stress Index → HRV-derived stress, EDA (if available)
7. Recovery Metrics → Resting HR trend, HRV recovery
8. Anomaly Detection → Unusual patterns (sudden HR spike, sleep disruption)
9. Symptom Correlation → Link physiological patterns to reported symptoms
10. Predictive Modeling → Forecast symptom changes from physiology
11. Alert Generation → Real-time anomaly and risk alerts
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `hrv_summary` | Object | Daily RMSSD, SDNN, LF/HF ratio |
| `circadian_metrics` | Object | Rhythm amplitude, stability, onset |
| `sleep_summary` | Object | Duration, efficiency, stages, quality score |
| `activity_summary` | Object | Steps, active minutes, sedentary time |
| `stress_index` | Float | Composite stress score (0-100) |
| `recovery_score` | Float | Overnight recovery quality (0-100) |
| `anomaly_alerts` | Array | Detected physiological anomalies |
| `physiological_phenotype` | Object | Dominant physiological patterns |
| `symptom_predictions` | Object | Predicted symptom changes |

**API Endpoints:**
```
GET  /api/v1/analyzers/wearables/{patient_id}/hrv-summary
GET  /api/v1/analyzers/wearables/{patient_id}/sleep-summary
GET  /api/v1/analyzers/wearables/{patient_id}/activity-summary
GET  /api/v1/analyzers/wearables/{patient_id}/stress-index
GET  /api/v1/analyzers/wearables/{patient_id}/full-physiology
GET  /api/v1/analyzers/wearables/{patient_id}/alerts
POST /api/v1/analyzers/wearables/set-alert-thresholds
```

---

### 3.15 Analyzer 13: Digital Phenotyping Analyzer (DPA-013)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | DPA-013 |
| **Name** | Digital Phenotyping and Behavioral Pattern Analyzer |
| **Version** | 2.5.0 |
| **Processing Mode** | Batch (daily) |
| **Clinical Risk Level** | Low |

**Input Data Sources:**
- Digital Phenotyping (primary)
- Wearables (for cross-validation)
- Assessments (for behavior-symptom correlation)

**Processing Pipeline:**
```
1. Feature Extraction → Mobility, communication, device usage patterns
2. Circadian Regularity Analysis → Sleep-wake rhythm stability
3. Social Activity Index → Communication frequency, reciprocity
4. Mobility Pattern Analysis → Location variance, routine adherence
5. Device Usage Profiling → Screen time, app category usage
6. Anomaly Detection → Significant deviation from individual baseline
7. Behavioral Phenotyping → Cluster into behavioral subtypes
8. Symptom Correlation → Link digital features to symptom changes
9. Early Warning Detection → Predict deterioration before clinical detection
10. Privacy-Preserving Aggregation → Anonymized pattern reporting
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `circadian_regularity_index` | Float | Rhythm stability (0-100) |
| `social_activity_index` | Float | Communication engagement level |
| `mobility_index` | Float | Movement and exploration level |
| `device_usage_profile` | Object | Screen time, app categories |
| `behavioral_phenotype` | Array | Classified behavioral subtype |
| `anomaly_score` | Float | Deviation from baseline |
| `early_warning_score` | Float | Risk of clinical deterioration |
| `routine_adherence` | Float | Consistency of daily patterns |

**API Endpoints:**
```
GET  /api/v1/analyzers/phenotyping/{patient_id}/behavioral-profile
GET  /api/v1/analyzers/phenotyping/{patient_id}/circadian-index
GET  /api/v1/analyzers/phenotyping/{patient_id}/social-activity
GET  /api/v1/analyzers/phenotyping/{patient_id}/anomaly-score
GET  /api/v1/analyzers/phenotyping/{patient_id}/early-warning
```

---

### 3.16 Analyzer 14: Clinical Notes NLP Analyzer (CNNA-014)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | CNNA-014 |
| **Name** | Clinical Notes Natural Language Processing Analyzer |
| **Version** | 3.5.0 |
| **Processing Mode** | Asynchronous (1-5 minutes per note) |
| **Clinical Risk Level** | Medium (entity extraction accuracy) |

**Input Data Sources:**
- Clinical Notes (primary)
- Medications (for medication mention validation)
- Assessments (for symptom extraction cross-reference)

**Processing Pipeline:**
```
1. Text Preprocessing → Section segmentation, sentence tokenization
2. Named Entity Recognition → Symptoms, diagnoses, medications, procedures
3. Entity Linking → Map to SNOMED CT, RxNorm, ICD-10 codes
4. Relation Extraction → Entity relationships (e.g., medication treats symptom)
5. Negation Detection → Identify negated findings
6. Temporal Extraction → Timeline of events, duration, frequency
7. Sentiment Analysis → Tone of note (objective/concerned/reassuring)
8. Section Classification → SOAP, HPI, assessment, plan
9. Clinical Summary Generation → Key findings and action items
10. Risk Mention Detection → Suicide, violence, self-harm mentions
11. Quality Metrics → Documentation completeness assessment
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `extracted_entities` | Array | Symptoms, diagnoses, medications with codes |
| `entity_relations` | Array | Relationships between entities |
| `negated_findings` | Array | Explicitly negated conditions |
| `temporal_events` | Array | Timeline of clinical events |
| `note_sentiment` | Object | Overall tone and concern level |
| `clinical_summary` | String | Auto-generated summary |
| `risk_mentions` | Array | Safety-related mentions requiring attention |
| `documentation_quality` | Object | Completeness score by section |

**API Endpoints:**
```
POST /api/v1/analyzers/notes/nlp-analysis
GET  /api/v1/analyzers/notes/{analysis_id}/entities
GET  /api/v1/analyzers/notes/{analysis_id}/summary
GET  /api/v1/analyzers/notes/{patient_id}/entity-timeline
GET  /api/v1/analyzers/notes/{patient_id}/documentation-quality
```

---

### 3.17 Analyzer 15: Multimodal Correlation Analyzer (MCA-015)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | MCA-015 |
| **Name** | Cross-Modal Correlation and Integration Analyzer |
| **Version** | 2.0.0 |
| **Processing Mode** | Asynchronous (5-15 minutes) |
| **Clinical Risk Level** | Medium |

**Input Data Sources:**
- ALL analyzer outputs (primary)
- Assessments, qEEG, MRI, Labs, Biomarkers, Voice, Video, Movement, Wearables, Phenotyping, Notes

**Processing Pipeline:**
```
1. Signal Collection → Gather all available analyzer outputs
2. Temporal Alignment → Synchronize signals by timestamp
3. Cross-Correlation Analysis → Pearson/Spearman correlations between modalities
4. Granger Causality Analysis → Directional influence detection
5. Latent Factor Analysis → Identify shared underlying factors
6. Clustering → Group patients by multimodal profiles
7. Predictive Modeling → Use multimodal features to predict outcomes
8. Feature Importance → Identify most informative modalities
9. Missing Data Imputation → Handle incomplete multimodal data
10. Confidence Integration → Combine uncertainty across modalities
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `correlation_matrix` | 2D Array | Cross-modal correlation matrix |
| `significant_correlations` | Array | Statistically significant correlations |
| `latent_factors` | Object | Shared underlying factors |
| `patient_cluster` | String | Multimodal phenotype cluster assignment |
| `predictive_features` | Array | Most informative features ranked |
| `multimodal_confidence` | Float | Integrated confidence score |
| `data_completeness` | Object | Coverage by modality |

**API Endpoints:**
```
POST /api/v1/analyzers/multimodal/correlation-analysis
GET  /api/v1/analyzers/multimodal/{analysis_id}/correlations
GET  /api/v1/analyzers/multimodal/{patient_id}/phenotype-cluster
```

---

### 3.18 Analyzer 16: Safety and Risk Analyzer (SRA-016)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | SRA-016 |
| **Name** | Clinical Safety and Risk Stratification Analyzer |
| **Version** | 4.0.0 |
| **Processing Mode** | Synchronous + Event-driven |
| **Clinical Risk Level** | CRITICAL |

**Input Data Sources:**
- ALL data sources (comprehensive monitoring)
- Assessment Analyzer outputs (suicide risk indicators)
- Lab Analyzer outputs (critical values)
- Wearables Analyzer outputs (physiological anomalies)
- Voice Analyzer outputs (affective distress markers)
- Clinical Notes Analyzer outputs (risk mentions)

**Processing Pipeline:**
```
1. Risk Factor Aggregation → Collect all risk indicators across modalities
2. Suicide Risk Assessment → C-SSRS + linguistic + behavioral risk fusion
3. Violence Risk Detection → Behavioral markers + history + context
4. Medical Emergency Detection → Critical lab values, vital sign anomalies
5. Medication Safety Check → Adverse events, interactions, compliance
6. Treatment Response Monitoring → Deterioration detection
7. Risk Stratification → Low/Moderate/High/Imminent classification
8. Alert Prioritization → Rank alerts by severity and urgency
9. Escalation Pathway → Route alerts to appropriate clinician level
10. Documentation → Risk assessment audit trail
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `suicide_risk_level` | Enum | None/Low/Moderate/High/Imminent |
| `violence_risk_level` | Enum | None/Low/Moderate/High |
| `medical_risk_alerts` | Array | Critical health concerns |
| `medication_risk_alerts` | Array | Active medication safety issues |
| `overall_risk_score` | Float | Composite risk (0-100) |
| `risk_factors` | Array | Active risk factor list with evidence |
| `recommended_actions` | Array | Specific safety interventions |
| `escalation_level` | Enum | Required clinician seniority |

**Critical Alert Triggers (Immediate Escalation):**
- Suicide risk: "Imminent" classification
- C-SSRS score: Ideation with intent and plan
- Lab: Potassium < 2.5 or > 6.5, glucose < 50 or > 400
- Wearables: Sustained HR > 150 or < 40 bpm (if age-adjusted)
- Notes: Explicit self-harm or violence plan documentation

**API Endpoints:**
```
GET  /api/v1/analyzers/safety/{patient_id}/risk-assessment
GET  /api/v1/analyzers/safety/{patient_id}/active-alerts
POST /api/v1/analyzers/safety/screen-patient
GET  /api/v1/analyzers/safety/alerts/pending
POST /api/v1/analyzers/safety/acknowledge-alert
GET  /api/v1/analyzers/safety/{patient_id}/risk-history
```

---

### 3.19 Analyzer 17: Treatment Response Predictor (TRP-017)

| Attribute | Value |
|-----------|-------|
| **Analyzer ID** | TRP-017 |
| **Name** | Treatment Response Prediction Analyzer |
| **Version** | 2.0.0 |
| **Processing Mode** | Asynchronous (10-30 minutes) |
| **Clinical Risk Level** | Medium |

**Input Data Sources:**
- ALL analyzer outputs (comprehensive)
- Evidence Database (treatment efficacy literature)
- Protocol Library (available interventions)
- Historical patient outcomes (anonymized)

**Processing Pipeline:**
```
1. Patient Profiling → Compile multimodal patient fingerprint
2. Similar Patient Matching → Find historically similar patients (k-NN)
3. Evidence Retrieval → Query evidence DB for relevant trials/studies
4. Predictive Modeling → ML models for response prediction per intervention
5. Confidence Scoring → Uncertainty quantification for predictions
6. Ranking → Order interventions by predicted response probability
7. Rationale Generation → Explain why each intervention is recommended
8. Safety Filtering → Remove contraindicated interventions
9. Personalization → Adjust for patient preferences and constraints
10. Output Generation → Ranked recommendation list with evidence
```

**Output Signals:**
| Signal | Type | Description |
|--------|------|-------------|
| `intervention_ranking` | Array | Ranked interventions with predicted response |
| `response_probabilities` | Object | P(response) per intervention |
| `time_to_response` | Object | Predicted weeks to meaningful improvement |
| `similar_patients` | Array | Anonymized similar patient outcomes |
| `supporting_evidence` | Array | Relevant clinical trial citations |
| `contraindications` | Array | Interventions to avoid |
| `prediction_confidence` | Float | Model confidence (0-100) |
| `rationale` | String | Human-readable explanation |

**API Endpoints:**
```
POST /api/v1/analyzers/treatment/predict-response
GET  /api/v1/analyzers/treatment/{patient_id}/recommendations
GET  /api/v1/analyzers/treatment/{patient_id}/similar-outcomes
GET  /api/v1/analyzers/treatment/{prediction_id}/rationale
```

---

### 3.20 Analyzer Summary Matrix

| ID | Analyzer | Mode | Latency | Risk | Sources |
|----|----------|------|---------|------|---------|
| AA-001 | Assessment Analyzer | Sync | < 2s | Low | Assessments, Notes, Meds |
| QSA-002 | qEEG Spectral Analyzer | Async | 2-10min | Medium | qEEG, MRI, Meds, Notes |
| MSA-003 | MRI Structural Analyzer | Async | 15-45min | Medium | MRI T1, FLAIR |
| MFA-004 | MRI Functional Analyzer | Async | 20-60min | Medium | rs-fMRI, T1 |
| LRA-005 | Lab Results Analyzer | Sync | < 1s | High | Labs, Meds |
| BMA-006 | Biomarker Analyzer | Sync | < 2s | Medium | Biomarkers, Labs |
| MA-007 | Medication Analyzer | Sync | < 1s | High | Meds, Labs, Assessments |
| VAA-008 | Voice Acoustic Analyzer | Async | 1-5min | Low-Med | Voice, Meds |
| VLA-009 | Voice Linguistic Analyzer | Async | 1-5min | Low-Med | Voice, Notes |
| VBA-010 | Video Behavioral Analyzer | Async | 5-15min | Low | Video, Voice |
| MQA-011 | Movement Quantification | Async | 2-10min | Low | Movement, Video |
| WPA-012 | Wearables Physiological | Batch/Stream | Hourly | Medium | Wearables |
| DPA-013 | Digital Phenotyping | Batch | Daily | Low | Phenotyping, Wearables |
| CNNA-014 | Clinical Notes NLP | Async | 1-5min | Medium | Notes, Meds |
| MCA-015 | Multimodal Correlation | Async | 5-15min | Medium | All analyzers |
| SRA-016 | Safety and Risk | Sync/Event | < 1s | CRITICAL | All sources |
| TRP-017 | Treatment Response Predictor | Async | 10-30min | Medium | All analyzers + Evidence DB |

---

## 4. Intelligence Layer (DeepTwin)

### 4.1 Overview

DeepTwin is the central intelligence engine of the DeepSynaps platform. It receives signals from all 17 analyzers, performs cross-modal correlation analysis, temporal modeling, and hypothesis generation to produce clinically actionable insights.

### 4.2 DeepTwin Architecture

```
+--------------------------------------------------------------------------+
|                           DEEPTWIN INTELLIGENCE LAYER                     |
|                                                                           |
|  +------------------+   +------------------+   +----------------------+  |
|  | Signal Ingestion | → | Correlation      | → | Hypothesis Generator |  |
|  | Hub (all 17      |   | Engine           |   |                      |  |
|  | analyzers)       |   |                  |   |                      |  |
|  +------------------+   +------------------+   +----------------------+  |
|           |                      |                       |               |
|  +------------------+   +------------------+   +----------------------+  |
|  | Temporal         |   | Evidence         |   | Protocol Matcher     |  |
|  | Analysis Engine  |   | Integrator       |   |                      |  |
|  |                  |   |                  |   |                      |  |
|  +------------------+   +------------------+   +----------------------+  |
|           |                      |                       |               |
|  +------------------+   +------------------+   +----------------------+  |
|  | Patient Model    |   | Confidence       |   | Report Generator     |  |
|  | Repository       |   | Quantifier       |   |                      |  |
|  |                  |   |                  |   |                      |  |
|  +------------------+   +------------------+   +----------------------+  |
+--------------------------------------------------------------------------+
```

### 4.3 Input: All Analyzer Signals

DeepTwin ingests structured signals from all 17 analyzers. Each signal arrives with:

```json
{
  "signal_id": "uuid",
  "analyzer_id": "QSA-002",
  "patient_id": "uuid",
  "timestamp": "2024-12-19T10:30:00Z",
  "signal_type": "spectral_profile",
  "signal_value": {...},
  "confidence": 0.92,
  "evidence_grade": "B",
  "uncertainty": {
    "confidence_interval": [lower, upper],
    "sample_size": 1,
    "reliability": "high"
  },
  "metadata": {
    "schema_version": "5.1.0",
    "processing_duration_ms": 45000
  }
}
```

### 4.4 Processing: Correlation Engine

#### 4.4.1 Cross-Modal Correlation Analysis

The correlation engine computes relationships between all pairs of modalities:

```python
# Correlation computation pipeline
def compute_multimodal_correlations(patient_signals):
    correlations = {}
    for modality_a, modality_b in all_pairs:
        # Temporal alignment
        aligned = temporal_align(modality_a, modality_b, window='30d')
        # Correlation computation
        corr = compute_correlation(aligned, method='spearman')
        # Significance testing
        p_value = permutation_test(corr, n_permutations=10000)
        # Clinical relevance filter
        if abs(corr) > 0.3 and p_value < 0.05:
            correlations[f"{modality_a}_{modality_b}"] = {
                "correlation": corr,
                "p_value": p_value,
                "clinical_relevance": assess_relevance(corr, modality_a, modality_b),
                "confidence": compute_correlation_confidence(aligned)
            }
    return correlations
```

**Key Correlation Patterns Tracked:**

| Correlation Pair | Expected Relationship | Clinical Significance |
|-----------------|----------------------|----------------------|
| qEEG Alpha Power ↔ Depression Severity | Negative correlation | Frontal alpha asymmetry linked to depression |
| HRV (RMSSD) ↔ Anxiety Severity | Negative correlation | Reduced vagal tone in anxiety |
| Hippocampal Volume ↔ Memory Performance | Positive correlation | Structural-functional coupling |
| BDNF Level ↔ Depression Severity | Negative correlation | Neuroplasticity marker |
| Sleep Quality ↔ Next-day Mood | Positive correlation | Sleep-mood bidirectional relationship |
| Voice Prosody ↔ Affective State | Correlation | Affective flattening in depression |
| Activity Level ↔ Depression Severity | Negative correlation | Psychomotor retardation |
| Inflammatory Markers ↔ Depression | Positive correlation | Inflammation-depression hypothesis |
| Vitamin D ↔ Depression Severity | Negative correlation | Nutritional psychiatry |
| Cortisol Rhythm ↔ Stress Reports | Negative (flattened rhythm) | HPA axis dysregulation |

#### 4.4.2 Temporal Analysis Engine

The temporal analysis engine tracks changes over time:

```
Temporal Analysis Pipeline:
1. Time Series Construction → Build longitudinal signal per modality
2. Change Point Detection → Identify significant shifts (CUSUM algorithm)
3. Trajectory Modeling → Linear/nonlinear trend fitting
4. Seasonality Detection → Circadian, weekly, monthly patterns
5. Intervention Effect Detection → Pre/post comparison with controls
6. Predictive Forecasting → ARIMA/LSTM-based future state prediction
7. Anomaly Detection → Deviation from expected trajectory
8. Causal Inference → Granger causality between time series
```

### 4.5 Processing: Hypothesis Generator

The hypothesis generator creates ranked clinical hypotheses based on all available evidence:

**Hypothesis Generation Pipeline:**
```
1. Evidence Gathering → Collect all analyzer signals, correlations, temporal patterns
2. Pattern Matching → Compare to known clinical phenotypes
3. Differential Generation → Create ranked list of possible explanations
4. Evidence Scoring → Grade supporting evidence (A=strong, D=weak)
5. Confidence Assignment → Statistical confidence for each hypothesis
6. Contradiction Detection → Identify conflicting signals
7. Recommendation Linking → Connect to evidence-based interventions
8. Narrative Generation → Human-readable explanation
```

**Hypothesis Output Format:**
```json
{
  "hypothesis_id": "uuid",
  "patient_id": "uuid",
  "generated_at": "2024-12-19T10:30:00Z",
  "hypotheses": [
    {
      "rank": 1,
      "title": "Major Depressive Disorder with Inflammatory Component",
      "confidence": 0.87,
      "evidence_grade": "B",
      "supporting_evidence": [
        {"source": "PHQ-9", "value": 18, "weight": 0.3},
        {"source": "hs-CRP", "value": 8.2, "weight": 0.25},
        {"source": "qEEG_alpha", "value": "reduced_frontal", "weight": 0.2},
        {"source": "HRV", "value": "reduced_RMSSD", "weight": 0.15},
        {"source": "sleep", "value": "fragmented", "weight": 0.1}
      ],
      "contradicting_evidence": [],
      "recommended_interventions": [
        "rTMS_left_DLPFC",
        "anti_inflammatory_protocol",
        "sleep_optimization"
      ],
      "differential_diagnoses": [
        {"diagnosis": "MDD melancholic", "probability": 0.45},
        {"diagnosis": "MDD atypical", "probability": 0.35},
        {"diagnosis": "Bipolar II depression", "probability": 0.15}
      ]
    }
  ],
  "multimodal_correlations": [
    {"pair": "inflammation_mood", "correlation": -0.65, "significance": 0.001}
  ],
  "longitudinal_insights": [
    {"insight": "Depression severity worsening coincides with CRP elevation", "confidence": 0.82}
  ],
  "uncertainty": {
    "overall_confidence": 0.78,
    "data_completeness": 0.85,
    "missing_modalities": ["MRI", "Voice"]
  }
}
```

### 4.6 Processing: Evidence Integration

DeepTwin integrates with the Evidence Database:

```
Evidence DB Query Flow:
1. Extract patient phenotype → Multimodal feature vector
2. Query Evidence DB → Search for matching clinical trials
3. Filter by → Population match, intervention type, recency
4. Grade Evidence → RCT > Cohort > Case-control > Expert opinion
5. Apply to Hypothesis → Link each recommendation to evidence
6. Update Confidence → Evidence strength modifies hypothesis confidence
```

### 4.7 Processing: Protocol Matching

```
Protocol Matching Flow:
1. Identify active hypotheses → Top-ranked differential diagnoses
2. Query Protocol Library → Find protocols matching hypotheses
3. Patient Constraint Filtering → Apply contraindications, preferences
4. Safety Check → Cross-reference with medication analyzer
5. Personalization → Adjust parameters based on patient profile
6. Evidence Linking → Attach supporting evidence to each protocol
7. Rank and Present → Order by predicted efficacy
```

### 4.8 Output: DeepTwin Signals

| Output Signal | Type | Description | Consumers |
|--------------|------|-------------|-----------|
| `ranked_hypotheses` | Array | Top 5 clinical hypotheses | Clinician Dashboard, Reports |
| `multimodal_correlations` | Object | Significant cross-modal correlations | Correlation View, Reports |
| `longitudinal_insights` | Array | Temporal pattern discoveries | Timeline, Reports |
| `patient_phenotype` | Object | Multimodal patient classification | DeepTwin Profile, Reports |
| `intervention_recommendations` | Array | Evidence-based protocol suggestions | Protocol Builder, Reports |
| `risk_forecast` | Object | Predicted risk trajectory | Safety Monitor, Alerts |
| `confidence_report` | Object | Uncertainty quantification across all signals | Quality Dashboard |
| `evidence_summary` | Array | Supporting literature | Report Generator |

### 4.9 DeepTwin API Endpoints

```
# Core Intelligence
GET  /api/v1/deeptwin/{patient_id}/full-analysis
GET  /api/v1/deeptwin/{patient_id}/hypotheses
GET  /api/v1/deeptwin/{patient_id}/correlations
GET  /api/v1/deeptwin/{patient_id}/phenotype
GET  /api/v1/deeptwin/{patient_id}/longitudinal-insights
GET  /api/v1/deeptwin/{patient_id}/recommendations
GET  /api/v1/deeptwin/{patient_id}/risk-forecast
POST /api/v1/deeptwin/{patient_id}/refresh-analysis

# Multimodal Context (used by all modules)
GET  /api/v1/deeptwin/multimodal-context/{patient_id}
GET  /api/v1/deeptwin/signal-status/{patient_id}
GET  /api/v1/deeptwin/data-completeness/{patient_id}

# Evidence and Protocols
GET  /api/v1/deeptwin/evidence/{patient_id}/matching-studies
GET  /api/v1/deeptwin/protocols/{patient_id}/matched
POST /api/v1/deeptwin/protocols/{patient_id}/generate-custom

# Configuration
POST /api/v1/deeptwin/config/update-weights
GET  /api/v1/deeptwin/config/active-weights
```

### 4.10 Uncertainty: Confidence Intervals and Evidence Grades

DeepTwin implements a multi-tier uncertainty framework:

**Evidence Grades:**
| Grade | Definition | Confidence Range | Color Code |
|-------|-----------|-----------------|------------|
| A | Strong evidence, multiple RCTs | 0.85-1.00 | Dark green |
| B | Moderate evidence, cohort studies | 0.70-0.85 | Light green |
| C | Limited evidence, expert consensus | 0.55-0.70 | Yellow |
| D | Very limited, case reports only | 0.40-0.55 | Orange |
| E | Insufficient evidence | < 0.40 | Red |

**Confidence Computation:**
```
overall_confidence = w1 * data_quality + w2 * evidence_grade + 
                     w3 * temporal_consistency + w4 * cross_modal_agreement

where:
  data_quality = signal_quality_scores.mean() * completeness_ratio
  evidence_grade = mapped evidence grade (0-1)
  temporal_consistency = 1 - variance(trajectory_predictions)
  cross_modal_agreement = 1 - contradiction_ratio
```

---

## 5. Intervention Layer (7 Categories)

### 5.1 Overview

The Intervention Layer translates DeepTwin insights into actionable, evidence-based treatment protocols across 7 intervention categories. Each category has defined input requirements, decision support outputs, and safety boundaries.

### 5.2 Intervention Category 1: Neurostimulation

| Attribute | Value |
|-----------|-------|
| **Category ID** | INT-001 |
| **Name** | Neurostimulation Therapies |
| **Modalities** | rTMS, tDCS, tACS, ECT (tracking), DBS (tracking) |
| **Risk Level** | High |
| **Regulatory** | FDA clearance required for device-based |

**Required Analyzer Inputs:**

| Analyzer | Signals Used | Purpose |
|----------|-------------|---------|
| qEEG Spectral (QSA-002) | Spectral profile, source localization | Target identification, protocol personalization |
| MRI Structural (MSA-003) | Cortical thickness, target region anatomy | Safety margin, coil positioning |
| MRI Functional (MFA-004) | Connectivity matrix, network coherence | Network-targeted stimulation |
| Assessment (AA-001) | Severity scores, symptom profile | Baseline, outcome tracking |
| Safety (SRA-016) | Risk assessment | Contraindication screening |

**Decision Support Outputs:**

```json
{
  "intervention_category": "neurostimulation",
  "patient_id": "uuid",
  "recommended_protocols": [
    {
      "modality": "rTMS",
      "target": "left_DLPFC_BA9_46",
      "rationale": "Reduced left frontal alpha, excitability deficit in DLPFC",
      "parameters": {
        "frequency_hz": 10,
        "intensity_mt": 120,
        "pulse_count_per_session": 3000,
        "session_duration_min": 37,
        "sessions_per_week": 5,
        "total_sessions": 36
      },
      "personalization": {
        "motor_threshold": "individualized",
        "coil_type": "figure_of_8",
        "targeting_method": "neuronavigation_MRI_guided",
        "angle": "45_degrees_sagittal"
      },
      "predicted_response_probability": 0.72,
      "predicted_time_to_response_weeks": 4,
      "evidence": [
        {"study": "O'Reardon et al. 2007 (Neuronetics)", "grade": "A", "n": 301},
        {"study": "Blumberger et al. 2018 (THREE-D)", "grade": "A", "n": 414}
      ],
      "safety_screening": {
        "seizure_risk": "low",
        "contraindications_checked": ["metal_implants", "pacemaker", "seizure_history"],
        "screening_passed": true
      }
    }
  ]
}
```

**Protocol Generation Flow:**
```
DeepTwin Hypothesis → qEEG Target Identification → MRI Safety Check
  → Parameter Optimization → Evidence Linking → Safety Screening
  → Protocol Document Generation → Clinician Review Required
  → Patient Consent → Session Scheduling → Progress Tracking
```

**Safety Boundaries:**
- Seizure risk monitoring: Mandatory for all rTMS protocols
- Motor threshold re-assessment: Every 2 weeks or after medication change
- Session intensity limits: 120% MT for rTMS, 2 mA for tDCS
- Contraindication check: Metal implants, pacemakers, seizure history
- Adverse event tracking: Headache, scalp discomfort, syncope
- Protocol modification rules: Predefined adjustment criteria

---

### 5.3 Intervention Category 2: Pharmacological

| Attribute | Value |
|-----------|-------|
| **Category ID** | INT-002 |
| **Name** | Pharmacological Interventions |
| **Scope** | Medication selection, dosing, monitoring, optimization |
| **Risk Level** | High |
| **Regulatory** | Prescriber license, FDA guidance |

**Required Analyzer Inputs:**

| Analyzer | Signals Used | Purpose |
|----------|-------------|---------|
| Medication (MA-007) | Current meds, interactions, adherence | Safety baseline |
| Lab Results (LRA-005) | Organ function, drug levels | Dosing safety, TDM |
| Biomarker (BMA-006) | Inflammatory, metabolic, genomic markers | Precision targeting |
| Assessment (AA-001) | Symptom profile, severity | Indication matching |
| Safety (SRA-016) | Risk flags | Safety prioritization |
| Treatment Response (TRP-017) | Predicted response | Selection ranking |

**Decision Support Outputs:**
- Ranked medication options with predicted response probability
- Dosing recommendations with renal/hepatic adjustment
- Pharmacogenomic guidance (if CYP450 data available)
- Drug interaction alerts
- Monitoring plan (labs, assessments, timing)
- Side effect prediction and management plan
- Deprescribing recommendations

**Safety Boundaries:**
- Black box warning alerts: Mandatory override documentation
- Drug interaction severity: Contraindicated > Major > Moderate > Minor
- TDM requirements: Lithium, valproate, clozapine, carbamazepine
- Pregnancy/Lactation checking: Automatic teratogenicity screening
- QTc prolongation monitoring: Required for high-risk agents
- Age-based dosing limits: Pediatric and geriatric adjustments

---

### 5.4 Intervention Category 3: Psychotherapy

| Attribute | Value |
|-----------|-------|
| **Category ID** | INT-003 |
| **Name** | Psychotherapy and Behavioral Interventions |
| **Modalities** | CBT, DBT, IPT, ACT, EMDR, psychodynamic, family therapy |
| **Risk Level** | Medium |

**Required Analyzer Inputs:**

| Analyzer | Signals Used | Purpose |
|----------|-------------|---------|
| Assessment (AA-001) | Symptom profile, functional status | Modality matching |
| Voice (VAA-008, VLA-009) | Cognitive markers, affective state | Engagement/response prediction |
| Video (VBA-010) | Behavioral markers, engagement | Session quality |
| Digital Phenotyping (DPA-013) | Activity, social patterns | Homework adherence prediction |
| Treatment Response (TRP-017) | Predicted response | Modality ranking |

**Decision Support Outputs:**
- Psychotherapy modality recommendation with rationale
- Session frequency and duration recommendations
- Focus area prioritization
- Homework assignment suggestions
- Progress monitoring plan
- Engagement prediction and dropout risk

**Safety Boundaries:**
- Trauma-informed care requirements: Screening before trauma-focused therapy
- Risk level matching: High-risk patients require appropriate modality
- Competency requirements: Therapy matched to clinician training
- Session limits: Insurance/setting constraints

---

### 5.5 Intervention Category 4: Lifestyle and Wellness

| Attribute | Value |
|-----------|-------|
| **Category ID** | INT-004 |
| **Name** | Lifestyle and Wellness Interventions |
| **Modalities** | Exercise, nutrition, sleep hygiene, stress management, social engagement |
| **Risk Level** | Low |

**Required Analyzer Inputs:**

| Analyzer | Signals Used | Purpose |
|----------|-------------|---------|
| Wearables (WPA-012) | Activity, sleep, HRV | Baseline and target setting |
| Biomarker (BMA-006) | Nutritional status, metabolic | Deficiency targeting |
| Assessment (AA-001) | Functional status, motivation | Readiness assessment |
| Digital Phenotyping (DPA-013) | Routine, mobility | Lifestyle pattern identification |
| MRI (MSA-003) | Structural factors | Exercise prescription safety |

**Decision Support Outputs:**
- Personalized exercise prescription (type, intensity, frequency)
- Nutritional recommendations (supplementation, dietary changes)
- Sleep optimization protocol
- Stress reduction techniques
- Social engagement plan
- Wearable-based monitoring plan

**Safety Boundaries:**
- Medical clearance: Required for vigorous exercise programs
- Supplement interaction checking: With current medications
- Sleep restriction safety: Contraindicated for certain conditions
- Activity limitations: Based on medical conditions

---

### 5.6 Intervention Category 5: Biomarker-Guided Interventions

| Attribute | Value |
|-----------|-------|
| **Category ID** | INT-005 |
| **Name** | Biomarker-Guided Precision Interventions |
| **Modalities** | Anti-inflammatory, metabolic, nutritional, hormonal |
| **Risk Level** | Medium |
| **Evidence Base** | Emerging (nutritional psychiatry, immunopsychiatry) |

**Required Analyzer Inputs:**

| Analyzer | Signals Used | Purpose |
|----------|-------------|---------|
| Biomarker (BMA-006) | All biomarker indices | Target identification |
| Lab Results (LRA-005) | Deficiency/excess detection | Intervention selection |
| Assessment (AA-001) | Symptom profile | Clinical relevance |
| qEEG (QSA-002) | Neurophysiological markers | Treatment monitoring |
| Treatment Response (TRP-017) | Predicted response | Intervention ranking |

**Decision Support Outputs:**
- Biomarker-targeted supplement/medication recommendations
- Repeat testing schedule
- Expected biomarker change timeline
- Clinical response prediction based on biomarker normalization

**Safety Boundaries:**
- Reference range adherence: Supplementation within evidence-based ranges
- Upper limit monitoring: Toxicity prevention (e.g., vitamin D > 100 ng/mL)
- Drug interaction checking: Supplement-medication interactions
- Lab monitoring schedule: Predefined follow-up timing

---

### 5.7 Intervention Category 6: Digital Therapeutics

| Attribute | Value |
|-----------|-------|
| **Category ID** | INT-006 |
| **Name** | Digital Therapeutic Interventions |
| **Modalities** | Prescription digital therapeutics, CBT apps, meditation apps, biofeedback |
| **Risk Level** | Low-Medium |
| **Regulatory** | FDA 510(k) for prescription digital therapeutics |

**Required Analyzer Inputs:**

| Analyzer | Signals Used | Purpose |
|----------|-------------|---------|
| Digital Phenotyping (DPA-013) | Usage patterns, engagement | Baseline and adherence prediction |
| Assessment (AA-001) | Symptom profile, tech comfort | Suitability matching |
| Wearables (WPA-012) | Physiological response | Biofeedback calibration |
| Voice/Video | Engagement markers | Session quality (if live) |

**Decision Support Outputs:**
- Digital therapeutic recommendation with evidence link
- Engagement strategy (push notification timing, content personalization)
- Biofeedback parameter calibration
- Adherence monitoring plan
- Outcome measurement integration

---

### 5.8 Intervention Category 7: Preventive and Monitoring

| Attribute | Value |
|-----------|-------|
| **Category ID** | INT-007 |
| **Name** | Preventive Care and Long-term Monitoring |
| **Modalities** | Screening protocols, relapse prevention, maintenance treatment |
| **Risk Level** | Low |

**Required Analyzer Inputs:**

| Analyzer | Signals Used | Purpose |
|----------|-------------|---------|
| ALL analyzers | Comprehensive | Full risk assessment |
| Safety (SRA-016) | Risk stratification | Alert prioritization |
| DeepTwin | Risk forecast | Predictive monitoring |
| Wearables (WPA-012) | Continuous monitoring | Early detection |
| Digital Phenotyping (DPA-013) | Behavioral early warning | Relapse prediction |

**Decision Support Outputs:**
- Personalized screening schedule
- Relapse risk prediction with early warning indicators
- Maintenance treatment recommendations
- Crisis prevention plan
- Care coordination recommendations

**Safety Boundaries:**
- Screening frequency limits: Evidence-based intervals
- Alert fatigue prevention: Tiered alerting with acknowledgment requirements
- Crisis protocol activation: Automated for imminent risk

---

### 5.9 Intervention Integration Flow

```
DeepTwin Recommendations → Protocol Builder → Safety Screening
                                    ↓
                          Evidence Linking → Clinician Review
                                    ↓
                          Patient Consent → Implementation
                                    ↓
                          Progress Tracking → Outcome Measurement
                                    ↓
                          Protocol Adjustment → DeepTwin Feedback Loop
```

---

## 6. Output Layer

### 6.1 Overview

The Output Layer produces all clinical-facing deliverables from the DeepSynaps platform. Every output is evidence-linked, uncertainty-aware, and governed by clinical safety protocols.

### 6.2 Clinician Reports (Structured, Sign-off Required)

**Report Types:**

| Report Type | Purpose | Frequency | Sign-off |
|------------|---------|-----------|----------|
| Initial Assessment Summary | Baseline multimodal profile | Once per episode | Attending physician |
| Progress Report | Treatment response tracking | Per visit (weekly-monthly) | Treating clinician |
| Protocol Recommendation | Evidence-based intervention plan | As needed | Attending physician |
| Safety Alert Report | Risk assessment and actions | Event-driven | Responsible clinician |
| Discharge Summary | Episode completion documentation | At discharge | Attending physician |
| Research Summary | Anonymized data for research | Periodic | PI + IRB |

**Report Components:**
```json
{
  "report_id": "uuid",
  "patient_id": "uuid",
  "type": "progress_report",
  "generated_at": "2024-12-19T10:30:00Z",
  "sections": {
    "executive_summary": "...",
    "assessment_results": {...},
    "biomarker_status": {...},
    "neurophysiological_findings": {...},
    "structural_findings": {...},
    "multimodal_correlations": {...},
    "deepTwin_hypotheses": {...},
    "intervention_response": {...},
    "recommendations": {...},
    "safety_assessment": {...},
    "evidence_summary": {...},
    "uncertainty_disclosure": {...}
  },
  "evidence_links": [
    {"claim": "...", "evidence": [{"study": "...", "grade": "A"}]}
  ],
  "confidence_summary": {
    "overall": 0.82,
    "by_section": {...}
  },
  "sign_off": {
    "required": true,
    "signed_by": null,
    "signed_at": null,
    "status": "pending_review"
  }
}
```

**Sign-off Workflow:**
```
Report Generated → Clinician Notification → Review Interface
  → Accept / Request Modification / Reject
  → If Accepted: Electronic Signature → Finalized → Patient Available
  → If Modification: Return to Draft → Edit → Re-submit
  → If Reject: Document Reason → Flag for Quality Review
```

### 6.3 Patient Summaries (De-identified, Plain Language)

**Characteristics:**
- De-identified: No PHI, no dates, no identifying information
- Plain language: 6th-8th grade reading level
- Visual: Charts, graphs, color-coded indicators
- Actionable: Clear next steps for patient
- Educational: Links to evidence and explanations

**Components:**
- Symptom summary with trend visualization
- Treatment plan overview (medications, therapies, lifestyle)
- Progress tracking with goals
- Safety reminders and crisis resources
- Appointment and testing schedule
- Educational resources (personalized)

### 6.4 Protocol Documents (Evidence-Linked)

**Protocol Document Structure:**
1. Protocol identifier and version
2. Clinical rationale with evidence citations
3. Step-by-step implementation guide
4. Parameter specifications with ranges
5. Safety monitoring plan
6. Expected outcomes with timeline
7. Adjustment criteria and procedures
8. Discontinuation criteria
9. Evidence references (linked to Evidence DB)
10. Confidence grade and uncertainty disclosure

### 6.5 Audit Logs (Immutable)

**Audit Log Requirements:**
- Immutable append-only storage
- Cryptographic integrity verification
- Every data access logged with user, timestamp, action
- Analyzer runs logged with inputs, outputs, versions
- Consent changes logged with before/after state
- Report sign-offs logged with identity and timestamp
- Retention: Minimum 7 years (HIPAA)

**Audit Log Schema:**
```json
{
  "log_id": "uuid",
  "timestamp": "2024-12-19T10:30:00Z",
  "event_type": "analyzer_run",
  "actor": {"type": "system", "id": "QSA-002"},
  "patient_id": "uuid",
  "action": "qEEG spectral analysis completed",
  "details": {
    "analyzer_version": "5.1.0",
    "input_size_mb": 120,
    "processing_duration_s": 180,
    "output_signals": ["spectral_profile", "z_score_map"],
    "consent_level": "1"
  },
  "integrity_hash": "sha256:..."
}
```

### 6.6 Export Packages (Governed)

**Export Types:**

| Export Type | Contents | Governance |
|------------|----------|------------|
| Full Clinical Record | All data, all analyzers | Patient request + identity verification |
| Research Dataset | Anonymized, aggregated | IRB approval + DUA |
| Continuity of Care | Summary for new provider | Patient consent + recipient verification |
| Legal/Insurance | Specific records requested | Legal review + authorization |
| Quality Assurance | De-identified for internal QA | QI committee approval |

**Export Process:**
```
Export Request → Authorization Verification → Data Compilation
  → De-identification (if required) → Format Conversion
  → Quality Check → Governance Approval
  → Secure Delivery (encrypted) → Access Logging
```

---

## 7. Cross-Module API Wiring

### 7.1 Overview

This section documents every significant API call between modules. Each entry specifies the source module, endpoint, target module, and purpose.

### 7.2 Wiring Map Format

```
Source Module → HTTP_METHOD /api/v{version}/path → Target Module → Purpose
```

### 7.3 Data Source → Ingestion → Analyzer Wiring

```
# Assessments
Assessment Portal → POST /api/v1/ingestion/assessments → Ingestion Gateway → Validate and store
Ingestion Gateway → POST /api/v1/analyzers/assessment/score → Assessment Analyzer (AA-001) → Score computation
Assessment Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Update patient model

# qEEG
EEG Device → POST /api/v1/ingestion/qeeg/edf → Ingestion Gateway → Upload and validate
Ingestion Gateway → POST /api/v1/analyzers/qeeg/spectral-analysis → qEEG Analyzer (QSA-002) → Initiate async analysis
qEEG Analyzer → GET /api/v1/analyzers/mri/{mri_id}/structural → MRI Structural Analyzer → Source localization context
qEEG Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Update patient model

# MRI
PACS System → POST /api/v1/ingestion/mri/dicom → DICOM Router → Receive and route
DICOM Router → POST /api/v1/analyzers/mri/structural-analysis → MRI Structural Analyzer (MSA-003) → Structural analysis
DICOM Router → POST /api/v1/analyzers/mri/functional-analysis → MRI Functional Analyzer (MFA-004) → Functional connectivity
MRI Structural Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Structural context
MRI Functional Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Functional context

# Labs
EHR/FHIR Server → POST /api/v1/ingestion/labs/fhir → FHIR Router → Receive FHIR Observations
FHIR Router → POST /api/v1/analyzers/labs/interpret-panel → Lab Analyzer (LRA-005) → Interpret results
FHIR Router → POST /api/v1/analyzers/biomarkers/process-draw → Biomarker Analyzer (BMA-006) → Process biomarkers
Lab Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Lab context
Biomarker Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Biomarker context
Lab Analyzer → POST /api/v1/analyzers/safety/lab-alert-check → Safety Analyzer (SRA-016) → Critical value alert

# Voice
Recording App → POST /api/v1/ingestion/voice/recording → Ingestion Gateway → Upload audio
Ingestion Gateway → POST /api/v1/analyzers/voice/acoustic-analysis → Voice Acoustic Analyzer (VAA-008) → Acoustic features
Ingestion Gateway → POST /api/v1/analyzers/voice/linguistic-analysis → Voice Linguistic Analyzer (VLA-009) → Linguistic features
Voice Acoustic Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Acoustic context
Voice Linguistic Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Linguistic context

# Video
Camera/Portal → POST /api/v1/ingestion/video/recording → Ingestion Gateway → Upload video
Ingestion Gateway → POST /api/v1/analyzers/video/behavioral-analysis → Video Behavioral Analyzer (VBA-010) → Behavioral analysis
Video Behavioral Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Behavioral context

# Movement
Sensor/App → POST /api/v1/ingestion/movement/data → Ingestion Gateway → Upload sensor data
Ingestion Gateway → POST /api/v1/analyzers/movement/quantification → Movement Analyzer (MQA-011) → Motor analysis
Movement Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Motor context

# Wearables
Wearable Platform → POST /api/v1/ingestion/wearables/sync → Wearables Sync Service → Daily data sync
Wearables Sync Service → POST /api/v1/analyzers/wearables/process-batch → Wearables Analyzer (WPA-012) → Physiological analysis
Wearables Sync Service → POST /api/v1/analyzers/phenotyping/process-features → Digital Phenotyping Analyzer (DPA-013) → Behavioral patterns
Wearables Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Physiological context
Digital Phenotyping Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Phenotyping context

# Clinical Notes
EHR/Portal → POST /api/v1/ingestion/notes/document → Ingestion Gateway → Upload note
Ingestion Gateway → POST /api/v1/analyzers/notes/nlp-analysis → Clinical Notes NLP Analyzer (CNNA-014) → NLP processing
Clinical Notes NLP Analyzer → POST /api/v1/deeptwin/signal-ingest/{patient_id} → DeepTwin → Notes context
Clinical Notes NLP Analyzer → POST /api/v1/analyzers/safety/risk-mention-check → Safety Analyzer (SRA-016) → Risk detection
```

### 7.4 Analyzer → DeepTwin Wiring

```
# All analyzers feed into DeepTwin
Assessment Analyzer (AA-001) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/assessment → DeepTwin → Symptom signals
qEEG Analyzer (QSA-002) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/qeeg → DeepTwin → Neurophysiological signals
MRI Structural (MSA-003) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/mri-structural → DeepTwin → Structural signals
MRI Functional (MFA-004) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/mri-functional → DeepTwin → Functional signals
Lab Analyzer (LRA-005) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/labs → DeepTwin → Laboratory signals
Biomarker Analyzer (BMA-006) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/biomarkers → DeepTwin → Biomarker signals
Medication Analyzer (MA-007) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/medications → DeepTwin → Medication signals
Voice Acoustic (VAA-008) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/voice-acoustic → DeepTwin → Acoustic signals
Voice Linguistic (VLA-009) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/voice-linguistic → DeepTwin → Linguistic signals
Video Behavioral (VBA-010) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/video → DeepTwin → Behavioral signals
Movement Analyzer (MQA-011) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/movement → DeepTwin → Motor signals
Wearables Analyzer (WPA-012) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/wearables → DeepTwin → Physiological signals
Digital Phenotyping (DPA-013) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/phenotyping → DeepTwin → Phenotyping signals
Clinical Notes NLP (CNNA-014) → POST /api/v1/deeptwin/signal-ingest/{patient_id}/notes → DeepTwin → Notes signals
Multimodal Correlation (MCA-015) → POST /api/v1/deeptwin/correlation-ingest/{patient_id} → DeepTwin → Correlation signals
Safety Analyzer (SRA-016) → POST /api/v1/deeptwin/safety-signal/{patient_id} → DeepTwin → Safety signals
Treatment Response (TRP-017) → POST /api/v1/deeptwin/treatment-prediction/{patient_id} → DeepTwin → Prediction signals
```

### 7.5 DeepTwin → Intervention Layer Wiring

```
DeepTwin → GET /api/v1/deeptwin/{patient_id}/hypotheses → Protocol Builder → Hypothesis-driven protocol creation
DeepTwin → GET /api/v1/deeptwin/{patient_id}/recommendations → Protocol Builder → Ranked intervention list
DeepTwin → GET /api/v1/deeptwin/{patient_id}/correlations → Protocol Builder → Multimodal targeting
DeepTwin → GET /api/v1/deeptwin/{patient_id}/risk-forecast → Safety Monitor → Predictive risk management
DeepTwin → GET /api/v1/deeptwin/evidence/{patient_id}/matching-studies → Evidence Integrator → Evidence linking
DeepTwin → POST /api/v1/deeptwin/{patient_id}/refresh-analysis → All Analyzers → Trigger re-analysis on new data
```

### 7.6 DeepTwin → Output Layer Wiring

```
DeepTwin → GET /api/v1/deeptwin/{patient_id}/full-analysis → Report Generator → Comprehensive report
DeepTwin → GET /api/v1/deeptwin/{patient_id}/phenotype → Patient Summary Generator → Phenotype summary
DeepTwin → GET /api/v1/deeptwin/{patient_id}/longitudinal-insights → Timeline Generator → Temporal insights
DeepTwin → POST /api/v1/deeptwin/{patient_id}/refresh-analysis → Dashboard → Real-time updates
```

### 7.7 Intervention → Output Wiring

```
Protocol Builder → POST /api/v1/reports/protocol-document → Report Generator → Protocol documentation
Protocol Builder → POST /api/v1/consent/request → Consent Manager → Patient consent workflow
Safety Monitor → POST /api/v1/alerts/clinical-alert → Alert System → Real-time notifications
Progress Tracker → POST /api/v1/reports/progress-update → Report Generator → Progress documentation
```

### 7.8 Internal Service Wiring

```
Consent Manager → GET /api/v1/consent/{patient_id}/active → All Modules → Consent verification
Consent Manager → POST /api/v1/consent/{patient_id}/update → Analyzer Router → Consent change propagation
Evidence DB → GET /api/v1/evidence/search → DeepTwin + Protocol Builder → Evidence retrieval
Evidence DB → POST /api/v1/evidence/flag-update → Protocol Library → Protocol update triggers
Audit Logger → POST /api/v1/audit/log → All Modules → Audit trail
User Auth → GET /api/v1/auth/permissions/{user_id} → All Modules → Access control
Encryption Service → POST /api/v1/crypto/encrypt → Ingestion + Storage → Data encryption
Encryption Service → POST /api/v1/crypto/decrypt → Authorized Modules → Data decryption
```

### 7.9 Complete API Endpoint Catalog

#### Authentication & Authorization
```
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
GET  /api/v1/auth/permissions/{user_id}
GET  /api/v1/auth/roles/{user_id}
POST /api/v1/auth/verify-mfa
```

#### Patient Management
```
GET    /api/v1/patients
POST   /api/v1/patients
GET    /api/v1/patients/{patient_id}
PUT    /api/v1/patients/{patient_id}
DELETE /api/v1/patients/{patient_id} (soft delete)
GET    /api/v1/patients/{patient_id}/consent
PUT    /api/v1/patients/{patient_id}/consent
GET    /api/v1/patients/{patient_id}/data-completeness
GET    /api/v1/patients/{patient_id}/timeline
```

#### Ingestion
```
POST /api/v1/ingestion/assessments
POST /api/v1/ingestion/qeeg/edf
POST /api/v1/ingestion/mri/dicom
POST /api/v1/ingestion/labs/fhir
POST /api/v1/ingestion/biomarkers
POST /api/v1/ingestion/voice/recording
POST /api/v1/ingestion/video/recording
POST /api/v1/ingestion/movement/data
POST /api/v1/ingestion/wearables/sync
POST /api/v1/ingestion/notes/document
POST /api/v1/ingestion/medications/fhir
GET  /api/v1/ingestion/status/{ingestion_id}
GET  /api/v1/ingestion/queue/status
```

#### Analyzers (all 17)
```
# Assessment (AA-001)
POST /api/v1/analyzers/assessment/score
GET  /api/v1/analyzers/assessment/{patient_id}/trend
GET  /api/v1/analyzers/assessment/{patient_id}/cross-profile
GET  /api/v1/analyzers/assessment/{patient_id}/risk-flags

# qEEG (QSA-002)
POST /api/v1/analyzers/qeeg/spectral-analysis
GET  /api/v1/analyzers/qeeg/{analysis_id}/status
GET  /api/v1/analyzers/qeeg/{analysis_id}/results
GET  /api/v1/analyzers/qeeg/{analysis_id}/z-scores
GET  /api/v1/analyzers/qeeg/{analysis_id}/connectivity
GET  /api/v1/analyzers/qeeg/{patient_id}/longitudinal
GET  /api/v1/analyzers/qeeg/{analysis_id}/source-localization

# MRI Structural (MSA-003)
POST /api/v1/analyzers/mri/structural-analysis
GET  /api/v1/analyzers/mri/{analysis_id}/status
GET  /api/v1/analyzers/mri/{analysis_id}/volumes
GET  /api/v1/analyzers/mri/{analysis_id}/thickness
GET  /api/v1/analyzers/mri/{analysis_id}/lesions
GET  /api/v1/analyzers/mri/{patient_id}/longitudinal

# MRI Functional (MFA-004)
POST /api/v1/analyzers/mri/functional-analysis
GET  /api/v1/analyzers/mri/{analysis_id}/connectivity
GET  /api/v1/analyzers/mri/{analysis_id}/networks
GET  /api/v1/analyzers/mri/{analysis_id}/graph-metrics

# Labs (LRA-005)
GET  /api/v1/analyzers/labs/{patient_id}/panel-status
GET  /api/v1/analyzers/labs/{patient_id}/abnormal-results
GET  /api/v1/analyzers/labs/{patient_id}/deficiency-profile
GET  /api/v1/analyzers/labs/{patient_id}/critical-alerts
POST /api/v1/analyzers/labs/interpret-panel
GET  /api/v1/analyzers/labs/{patient_id}/trend/{loinc_code}

# Biomarkers (BMA-006)
GET  /api/v1/analyzers/biomarkers/{patient_id}/full-profile
GET  /api/v1/analyzers/biomarkers/{patient_id}/inflammatory-index
GET  /api/v1/analyzers/biomarkers/{patient_id}/neurotrophic-index
GET  /api/v1/analyzers/biomarkers/{patient_id}/metabolic-risk
GET  /api/v1/analyzers/biomarkers/{patient_id}/nutrient-status
POST /api/v1/analyzers/biomarkers/predict-response

# Medications (MA-007)
GET  /api/v1/analyzers/medications/{patient_id}/safety-check
GET  /api/v1/analyzers/medications/{patient_id}/adherence
GET  /api/v1/analyzers/medications/{patient_id}/efficacy
GET  /api/v1/analyzers/medications/{patient_id}/interactions
POST /api/v1/analyzers/medications/check-compatibility

# Voice Acoustic (VAA-008)
POST /api/v1/analyzers/voice/acoustic-analysis
GET  /api/v1/analyzers/voice/{analysis_id}/acoustic-features
GET  /api/v1/analyzers/voice/{patient_id}/longitudinal-acoustic

# Voice Linguistic (VLA-009)
POST /api/v1/analyzers/voice/linguistic-analysis
GET  /api/v1/analyzers/voice/{analysis_id}/linguistic-features
GET  /api/v1/analyzers/voice/{patient_id}/longitudinal-linguistic

# Video Behavioral (VBA-010)
POST /api/v1/analyzers/video/behavioral-analysis
GET  /api/v1/analyzers/video/{analysis_id}/behavioral-features
GET  /api/v1/analyzers/video/{analysis_id}/affective-timeline
GET  /api/v1/analyzers/video/{patient_id}/longitudinal-behavioral

# Movement (MQA-011)
POST /api/v1/analyzers/movement/quantification
GET  /api/v1/analyzers/movement/{analysis_id}/motor-features
GET  /api/v1/analyzers/movement/{patient_id}/longitudinal-motor

# Wearables (WPA-012)
GET  /api/v1/analyzers/wearables/{patient_id}/hrv-summary
GET  /api/v1/analyzers/wearables/{patient_id}/sleep-summary
GET  /api/v1/analyzers/wearables/{patient_id}/activity-summary
GET  /api/v1/analyzers/wearables/{patient_id}/stress-index
GET  /api/v1/analyzers/wearables/{patient_id}/full-physiology
GET  /api/v1/analyzers/wearables/{patient_id}/alerts
POST /api/v1/analyzers/wearables/set-alert-thresholds

# Digital Phenotyping (DPA-013)
GET  /api/v1/analyzers/phenotyping/{patient_id}/behavioral-profile
GET  /api/v1/analyzers/phenotyping/{patient_id}/circadian-index
GET  /api/v1/analyzers/phenotyping/{patient_id}/social-activity
GET  /api/v1/analyzers/phenotyping/{patient_id}/anomaly-score
GET  /api/v1/analyzers/phenotyping/{patient_id}/early-warning

# Clinical Notes NLP (CNNA-014)
POST /api/v1/analyzers/notes/nlp-analysis
GET  /api/v1/analyzers/notes/{analysis_id}/entities
GET  /api/v1/analyzers/notes/{analysis_id}/summary
GET  /api/v1/analyzers/notes/{patient_id}/entity-timeline
GET  /api/v1/analyzers/notes/{patient_id}/documentation-quality

# Multimodal Correlation (MCA-015)
POST /api/v1/analyzers/multimodal/correlation-analysis
GET  /api/v1/analyzers/multimodal/{analysis_id}/correlations
GET  /api/v1/analyzers/multimodal/{patient_id}/phenotype-cluster

# Safety (SRA-016)
GET  /api/v1/analyzers/safety/{patient_id}/risk-assessment
GET  /api/v1/analyzers/safety/{patient_id}/active-alerts
POST /api/v1/analyzers/safety/screen-patient
GET  /api/v1/analyzers/safety/alerts/pending
POST /api/v1/analyzers/safety/acknowledge-alert
GET  /api/v1/analyzers/safety/{patient_id}/risk-history

# Treatment Response (TRP-017)
POST /api/v1/analyzers/treatment/predict-response
GET  /api/v1/analyzers/treatment/{patient_id}/recommendations
GET  /api/v1/analyzers/treatment/{patient_id}/similar-outcomes
GET  /api/v1/analyzers/treatment/{prediction_id}/rationale
```

#### DeepTwin Intelligence
```
GET  /api/v1/deeptwin/{patient_id}/full-analysis
GET  /api/v1/deeptwin/{patient_id}/hypotheses
GET  /api/v1/deeptwin/{patient_id}/correlations
GET  /api/v1/deeptwin/{patient_id}/phenotype
GET  /api/v1/deeptwin/{patient_id}/longitudinal-insights
GET  /api/v1/deeptwin/{patient_id}/recommendations
GET  /api/v1/deeptwin/{patient_id}/risk-forecast
POST /api/v1/deeptwin/{patient_id}/refresh-analysis
GET  /api/v1/deeptwin/multimodal-context/{patient_id}
GET  /api/v1/deeptwin/signal-status/{patient_id}
GET  /api/v1/deeptwin/data-completeness/{patient_id}
GET  /api/v1/deeptwin/evidence/{patient_id}/matching-studies
GET  /api/v1/deeptwin/protocols/{patient_id}/matched
POST /api/v1/deeptwin/protocols/{patient_id}/generate-custom
POST /api/v1/deeptwin/config/update-weights
GET  /api/v1/deeptwin/config/active-weights
```

#### Protocol Builder
```
GET  /api/v1/protocols
POST /api/v1/protocols
GET  /api/v1/protocols/{protocol_id}
PUT  /api/v1/protocols/{protocol_id}
POST /api/v1/protocols/{protocol_id}/activate
POST /api/v1/protocols/{protocol_id}/deactivate
GET  /api/v1/protocols/{protocol_id}/evidence
POST /api/v1/protocols/{protocol_id}/sessions
GET  /api/v1/protocols/{protocol_id}/sessions
PUT  /api/v1/protocols/{protocol_id}/sessions/{session_id}
POST /api/v1/protocols/{protocol_id}/adjust-parameters
GET  /api/v1/protocols/library/search
```

#### Reporting
```
GET  /api/v1/reports
POST /api/v1/reports/generate
GET  /api/v1/reports/{report_id}
GET  /api/v1/reports/{report_id}/download
POST /api/v1/reports/{report_id}/sign-off
GET  /api/v1/reports/{patient_id}/history
POST /api/v1/reports/{report_id}/request-modification
```

#### Alerts & Safety
```
GET  /api/v1/alerts
GET  /api/v1/alerts/pending
GET  /api/v1/alerts/{alert_id}
POST /api/v1/alerts/{alert_id}/acknowledge
POST /api/v1/alerts/{alert_id}/escalate
GET  /api/v1/alerts/{patient_id}/history
POST /api/v1/alerts/create-manual
```

#### Evidence Database
```
GET  /api/v1/evidence/search
GET  /api/v1/evidence/{evidence_id}
GET  /api/v1/evidence/by-condition/{condition_id}
GET  /api/v1/evidence/by-intervention/{intervention_id}
GET  /api/v1/evidence/by-modality/{modality_id}
POST /api/v1/evidence/flag-update
GET  /api/v1/evidence/meta-analyses
GET  /api/v1/evidence/guidelines
```

#### Export & Data Governance
```
POST /api/v1/export/request
GET  /api/v1/export/requests
GET  /api/v1/export/{export_id}/status
GET  /api/v1/export/{export_id}/download
GET  /api/v1/export/templates
POST /api/v1/consent/request
GET  /api/v1/consent/{patient_id}/history
PUT  /api/v1/consent/{patient_id}/update
GET  /api/v1/consent/{patient_id}/active
```

---

## 8. Event Flow

### 8.1 Overview

DeepSynaps operates as an event-driven system. Every significant action generates events that trigger downstream processing. The event bus is the central nervous system of the platform.

### 8.2 Event Architecture

```
+-----------------+     +------------------+     +------------------+
|  Event Sources   | --> |   Event Bus      | --> | Event Consumers   |
|  (20+ sources)   |     |  (message queue) |     | (40+ consumers)  |
+-----------------+     +------------------+     +------------------+
                               |
                    +----------+----------+
                    |                     |
              Dead Letter          Event Persistence
              Queue                (audit, replay)
```

### 8.3 Event Types Catalog

#### Data Source Events
```
data_source.assessment.completed
data_source.assessment.updated
data_source.qeeg.raw_ingested
data_source.qeeg.processing_completed
data_source.mri.scan_ingested
data_source.mri.processing_completed
data_source.lab.result_received
data_source.lab.critical_value
data_source.biomarker.draw_processed
data_source.medication.added
data_source.medication.changed
data_source.medication.discontinued
data_source.voice.recording_processed
data_source.video.recording_processed
data_source.movement.assessment_completed
data_source.wearables.data_synced
data_source.wearables.realtime_alert
data_source.phenotyping.features_computed
data_source.note.created
data_source.note.updated
```

#### Analyzer Events
```
analyzer.assessment.scored
analyzer.assessment.trend_detected
analyzer.qeeg.analysis_completed
analyzer.qeeg.deviation_detected
analyzer.mri.structural.completed
analyzer.mri.functional.completed
analyzer.lab.abnormal_detected
analyzer.lab.critical_alert
analyzer.biomarker.profile_updated
analyzer.medication.interaction_detected
analyzer.medication.adherence_alert
analyzer.voice.acoustic.completed
analyzer.voice.linguistic.completed
analyzer.video.behavioral.completed
analyzer.movement.motor.completed
analyzer.wearables.anomaly_detected
analyzer.wearables.alert_triggered
analyzer.phenotyping.anomaly_detected
analyzer.phenotyping.early_warning
analyzer.notes.nlp.completed
analyzer.multimodal.correlations_updated
analyzer.safety.risk_changed
analyzer.safety.alert_generated
analyzer.treatment.prediction_updated
```

#### DeepTwin Events
```
deeptwin.hypothesis.generated
deeptwin.hypothesis.updated
deeptwin.correlation.discovered
deeptwin.phenotype.classified
deeptwin.recommendation.generated
deeptwin.risk_forecast.updated
deeptwin.insight.generated
deeptwin.confidence.changed
```

#### Intervention Events
```
intervention.protocol.created
intervention.protocol.approved
intervention.protocol.started
intervention.protocol.modified
intervention.protocol.completed
intervention.session.scheduled
intervention.session.completed
intervention.session.cancelled
intervention.progress.milestone
intervention.safety.boundary_triggered
```

#### Output Events
```
output.report.generated
output.report.signed_off
output.report.modification_requested
output.alert.sent
output.alert.acknowledged
output.alert.escalated
output.export.completed
output.export.delivered
```

#### System Events
```
system.user.login
system.user.logout
system.consent.updated
system.consent.withdrawn
system.data_access.granted
system.data_access.revoked
system.analyzer.updated
system.evidence_db.updated
system.maintenance.scheduled
system.security.alert
```

### 8.4 Critical Event Flows

#### Flow 1: New Assessment → Clinical Insight

```
[Step 1]  Clinician submits assessment via portal
               ↓
[Step 2]  Event: data_source.assessment.completed
               ↓
[Step 3]  Ingestion Gateway validates and stores
               ↓
[Step 4]  Event triggers Assessment Analyzer (AA-001)
               ↓
[Step 5]  Analyzer computes scores, trends, risk flags
               ↓
[Step 6]  Event: analyzer.assessment.scored
               ↓
[Step 7]  Signal ingested into DeepTwin
               ↓
[Step 8]  DeepTwin updates patient model
               ↓
[Step 9]  DeepTwin re-evaluates hypotheses
               ↓
[Step 10] Event: deeptwin.hypothesis.updated
               ↓
[Step 11] Safety Analyzer checks for risk changes
               ↓
[Step 12] If risk detected: Event: analyzer.safety.alert_generated
               ↓
[Step 13] Clinician dashboard updated in real-time
               ↓
[Step 14] Notification sent (in-app + optional SMS/email)
               ↓
[Step 15] Report updated with new assessment results
```

#### Flow 2: New Biomarker → Abnormal Detection → Intervention

```
[Step 1]  Lab uploads biomarker results
               ↓
[Step 2]  Event: data_source.biomarker.draw_processed
               ↓
[Step 3]  Biomarker Analyzer (BMA-006) processes
               ↓
[Step 4]  Inflammatory, metabolic, nutritional indices computed
               ↓
[Step 5]  Event: analyzer.biomarker.profile_updated
               ↓
[Step 6]  Lab Analyzer (LRA-005) checks for critical values
               ↓
[Step 7]  If abnormal: Event: analyzer.lab.abnormal_detected
               ↓
[Step 8]  If critical: Event: analyzer.lab.critical_alert
               ↓
[Step 9]  Critical alert immediately routed to responsible clinician
               ↓
[Step 10] Safety Analyzer (SRA-016) evaluates clinical significance
               ↓
[Step 11] DeepTwin receives updated biomarker signals
               ↓
[Step 12] DeepTwin updates hypotheses with new biomarker context
               ↓
[Step 13] Protocol Builder receives biomarker-guided recommendations
               ↓
[Step 14] If intervention indicated: Event: intervention.protocol.created
               ↓
[Step 15] Clinician review required before activation
```

#### Flow 3: Consent Change → Data Access Update → Re-computation

```
[Step 1]  Patient updates consent preferences via portal
               ↓
[Step 2]  Event: system.consent.updated
               ↓
[Step 3]  Consent Manager validates and stores new consent
               ↓
[Step 4]  Access Control evaluates affected analyzers
               ↓
[Step 5]  If data access reduced:
               ↓
[Step 6]    Event: system.data_access.revoked
               ↓
[Step 7]    Analyzer Router identifies affected analyzers
               ↓
[Step 8]    If previously included data now excluded:
               ↓
[Step 9]      Mark affected analysis results as STALE
               ↓
[Step 10]     Trigger re-computation of affected analyzers
               ↓
[Step 11]     Event: analyzer.{id}.recomputed
               ↓
[Step 12]     DeepTwin receives updated signals
               ↓
[Step 13]     DeepTwin re-evaluates with new data constraints
               ↓
[Step 14]     Event: deeptwin.hypothesis.updated
               ↓
[Step 15]     Dashboards and reports updated
               ↓
[Step 16]     Clinician notification: "Analysis updated due to consent change"
```

#### Flow 4: New Evidence Paper → Evidence DB → Protocol Updates

```
[Step 1]  Evidence team adds new peer-reviewed paper to Evidence DB
               ↓
[Step 2]  Event: system.evidence_db.updated
               ↓
[Step 3]  NLP processing extracts findings, populations, interventions
               ↓
[Step 4]  Evidence grading algorithm assigns grade (A-E)
               ↓
[Step 5]  Event: evidence.paper.graded
               ↓
[Step 6]  Protocol Library scans for affected protocols
               ↓
[Step 7]  If protocol affected:
               ↓
[Step 8]    Protocol flagged for review
               ↓
[Step 9]    Event: intervention.protocol.evidence_updated
               ↓
[Step 10]   Affected patients identified
               ↓
[Step 11]   Clinicians notified of evidence update
               ↓
[Step 12]   Protocol recommendations re-ranked based on new evidence
               ↓
[Step 13]   Active protocols may be flagged for parameter adjustment
               ↓
[Step 14]   Audit trail documents evidence-based protocol evolution
```

#### Flow 5: Real-time Wearable Anomaly → Alert → Clinical Action

```
[Step 1]  Wearable device streams physiological data
               ↓
[Step 2]  Data ingested in real-time (1-15 min intervals)
               ↓
[Step 3]  Wearables Analyzer (WPA-012) processes stream
               ↓
[Step 4]  Anomaly detection algorithm flags deviation
               ↓
[Step 5]  Event: analyzer.wearables.anomaly_detected
               ↓
[Step 6]  Safety Analyzer (SRA-016) evaluates severity
               ↓
[Step 7]  Alert severity classified: Info / Warning / Critical
               ↓
[Step 8]  If Warning or Critical:
               ↓
[Step 9]    Event: output.alert.sent
               ↓
[Step 10]   Alert routed to responsible clinician (push + SMS)
               ↓
[Step 11]   Clinician views alert in dashboard
               ↓
[Step 12]   Clinician acknowledges: POST /api/v1/alerts/{id}/acknowledge
               ↓
[Step 13]   If not acknowledged within threshold (15 min critical, 4 hr warning):
               ↓
[Step 14]     Event: output.alert.escalated
               ↓
[Step 15]     Escalated to next level (attending → department head)
               ↓
[Step 16]   Clinician documents action taken
               ↓
[Step 17]   DeepTwin receives alert context for model update
```

#### Flow 6: New MRI Scan → Full Multimodal Update

```
[Step 1]  MRI scan completed, DICOM pushed to DeepSynaps
               ↓
[Step 2]  Event: data_source.mri.scan_ingested
               ↓
[Step 3]  DICOM de-identified and validated
               ↓
[Step 4]  Converted to NIfTI, quality assessed
               ↓
[Step 5]  Structural analysis queued (MSA-003)
               ↓
[Step 6]  If rs-fMRI: Functional analysis queued (MFA-004)
               ↓
[Step 7]  Both analyses run in parallel (async, 15-60 min)
               ↓
[Step 8]  Event: analyzer.mri.structural.completed
               ↓
[Step 9]  Structural signals ingested into DeepTwin
               ↓
[Step 10] Event: analyzer.mri.functional.completed
               ↓
[Step 11] Functional signals ingested into DeepTwin
               ↓
[Step 12] DeepTwin triggers Multimodal Correlation Analyzer
               ↓
[Step 13] Correlation analysis with qEEG, assessments, biomarkers
               ↓
[Step 14] Event: analyzer.multimodal.correlations_updated
               ↓
[Step 15] DeepTwin updates hypotheses with new structural context
               ↓
[Step 16] If neurostimulation candidate:
               ↓
[Step 17]   Target identification updated with MRI-guided coordinates
               ↓
[Step 18]   Protocol recommendations refreshed
               ↓
[Step 19] Event: deeptwin.recommendation.generated
               ↓
[Step 20] Full patient report queued for update
               ↓
[Step 21] Clinician notification: "MRI analysis complete - insights available"
```

### 8.5 Event Priority Matrix

| Priority | Event Types | Delivery Guarantee | Latency Target |
|----------|------------|-------------------|----------------|
| CRITICAL | Safety alerts, critical lab values, imminent risk | Exactly-once | < 5 seconds |
| HIGH | New data ingestion, analyzer completion, hypothesis update | At-least-once | < 30 seconds |
| NORMAL | Report generation, evidence updates, protocol changes | At-least-once | < 5 minutes |
| LOW | Audit logging, analytics, batch jobs | At-least-once | < 1 hour |

---

## 9. Data Consistency & Governance

### 9.1 Source of Truth by Data Type

| Data Type | Source of Truth | Backup Strategy | Recovery RTO |
|-----------|----------------|-----------------|--------------|
| Patient Demographics | FHIR Patient Resource | Cross-region replication | 1 hour |
| Assessments | Assessment Repository | Daily snapshots + WAL | 30 minutes |
| qEEG Raw | Object Storage (S3) | Cross-region + versioning | 4 hours |
| qEEG Analysis | Analysis Results DB | Daily snapshots + WAL | 30 minutes |
| MRI DICOM | DICOM Repository (PACS) | Cross-region + lifecycle | 4 hours |
| MRI Analysis | Analysis Results DB | Daily snapshots + WAL | 30 minutes |
| Lab Results | FHIR Observation Store | Cross-region replication | 1 hour |
| Biomarkers | Biomarker Repository | Daily snapshots + WAL | 30 minutes |
| Medications | FHIR Medication Store | Cross-region replication | 1 hour |
| Voice/Video | Object Storage (S3) | Cross-region + versioning | 4 hours |
| Wearables | Time-Series DB (TimescaleDB) | Continuous backup | 15 minutes |
| Phenotyping | Phenotyping Repository | Daily snapshots | 1 hour |
| Clinical Notes | Notes Repository | Daily snapshots + WAL | 30 minutes |
| Analyzer Results | Analyzer Results DB | Daily snapshots + WAL | 30 minutes |
| DeepTwin State | DeepTwin Graph DB | Cross-region + snapshots | 15 minutes |
| Protocols | Protocol Repository | Cross-region replication | 1 hour |
| Reports | Report Store | Cross-region + versioning | 1 hour |
| Audit Logs | Immutable Ledger | Append-only + multi-region | 15 minutes |
| Consent | Consent Registry | Cross-region + legal hold | 1 hour |
| Evidence DB | Evidence Repository | Cross-region replication | 4 hours |

### 9.2 Caching Strategies

| Cache Layer | Technology | TTL | Invalidation |
|------------|-----------|-----|-------------|
| API Response Cache | Redis | 5-60 min | Event-driven invalidation |
| Patient Dashboard | Redis | 2 min | On any patient data update |
| Analyzer Results | Redis | 24 hours | On re-computation |
| DeepTwin Hypotheses | Redis | 5 min | On signal update |
| Evidence DB Queries | Redis | 1 hour | On evidence update |
| Static Assets | CDN (CloudFront) | 24 hours | Version-based |
| Session State | Redis | Session lifetime | On logout/timeout |
| Report Templates | Local cache | 1 hour | On template update |

**Cache Invalidation Rules:**
```
New assessment data  → Invalidate: patient dashboard, assessment cache, hypothesis cache
New qEEG analysis    → Invalidate: qEEG cache, correlation cache, hypothesis cache
New MRI analysis     → Invalidate: MRI cache, correlation cache, hypothesis cache, neurostimulation targets
New lab results      → Invalidate: lab cache, biomarker cache, safety assessment
Consent change       → Invalidate: All patient-related caches, re-trigger analyzers
Analyzer update      → Invalidate: Analyzer result cache, DeepTwin cache
Evidence update      → Invalidate: Evidence cache, protocol recommendations
```

### 9.3 Stale Data Detection

**Stale Data Rules:**

| Data Type | Freshness Threshold | Stale Action |
|-----------|-------------------|--------------|
| Assessments | 30 days | Flag for re-assessment |
| qEEG Analysis | 90 days | Recommend new session |
| MRI Analysis | 180 days | Recommend follow-up scan |
| Lab Results | 30 days | Flag for re-testing |
| Biomarkers | 90 days | Recommend new draw |
| Medication List | 7 days | Verify current |
| Voice/Video | 90 days | Recommend new recording |
| Movement | 90 days | Recommend re-assessment |
| Wearables | 48 hours | Check device sync |
| Phenotyping | 7 days | Check SDK status |
| Clinical Notes | 14 days | Flag for note review |
| DeepTwin Model | 7 days since last update | Trigger refresh |

**Stale Data Indicators in UI:**
- Green: Fresh (within threshold)
- Yellow: Approaching stale (75% of threshold)
- Orange: Stale (exceeded threshold, still usable with warning)
- Red: Very stale (2x threshold, recommend new data)
- Gray: Missing (no data available)

### 9.4 Re-computation Triggers

**Automatic Re-computation Events:**

| Trigger | Affected Analyzers | Priority |
|---------|-------------------|----------|
| New assessment completed | AA-001, MCA-015, SRA-016, TRP-017 | HIGH |
| qEEG analysis completed | QSA-002, MCA-015, TRP-017 | HIGH |
| MRI analysis completed | MSA-003, MFA-004, MCA-015, TRP-017 | HIGH |
| New lab results | LRA-005, BMA-006, MA-007, SRA-016, TRP-017 | CRITICAL |
| Medication changed | MA-007, SRA-016, TRP-017 | HIGH |
| Voice analysis completed | VAA-008, VLA-009, MCA-015 | NORMAL |
| Video analysis completed | VBA-010, MCA-015 | NORMAL |
| Movement analysis completed | MQA-011, MCA-015 | NORMAL |
| Wearables batch completed | WPA-012, DPA-013, MCA-015 | NORMAL |
| Phenotyping batch completed | DPA-013, MCA-015 | NORMAL |
| Notes NLP completed | CNNA-014, MCA-015, SRA-016 | HIGH |
| Consent changed | All affected analyzers | CRITICAL |
| Analyzer version updated | All affected analyzer runs | NORMAL |
| Evidence DB updated | TRP-017, Protocol Library | LOW |
| Manual re-analysis request | Specified analyzers | HIGH |

### 9.5 Versioning Strategy

**Versioning Levels:**

| Level | What is Versioned | Version Format | Change Type |
|-------|------------------|----------------|-------------|
| Data | Raw data files, analysis results | UUID + timestamp | Immutable |
| Schema | Data models, JSON schemas | Semantic (MAJOR.MINOR.PATCH) | Breaking/Non-breaking |
| Analyzer | Analyzer implementations | Semantic (MAJOR.MINOR.PATCH) | Feature/Fix/Breaking |
| API | API contracts | URL path (/v1/, /v2/) | Breaking changes |
| Protocol | Clinical protocols | Semantic + revision date | Evidence-based updates |
| Evidence | Evidence DB entries | Entry date + evidence grade | New research |
| Report | Generated reports | UUID + timestamp + version | Each generation |

**Version Compatibility Rules:**
```
Analyzer vMAJOR.MINOR.PATCH:
  MAJOR: Breaking change (re-computation required)
  MINOR: New features (backward compatible)
  PATCH: Bug fix (backward compatible)

Schema vMAJOR.MINOR.PATCH:
  MAJOR: Breaking change (migration required)
  MINOR: New fields (backward compatible)
  PATCH: Documentation/correction

When MAJOR changes:
  1. New version deployed alongside old
  2. Existing data flagged for re-computation
  3. Backward compatibility maintained for 30 days
  4. Migration tools provided
  5. Audit trail documents version change
```

---

## 10. Scalability Considerations

### 10.1 Overview

DeepSynaps is designed to scale from single-clinic deployments to multi-hospital networks. The architecture separates synchronous and asynchronous workloads to optimize resource utilization.

### 10.2 Async Processing for Heavy Analyzers

**Synchronous Analyzers (< 2 seconds):**
- Assessment Analyzer (AA-001)
- Lab Results Analyzer (LRA-005)
- Biomarker Analyzer (BMA-006)
- Medication Analyzer (MA-007)
- Safety Analyzer (SRA-016)

**Asynchronous Analyzers (queued processing):**

| Analyzer | Typical Duration | Worker Type | Priority |
|----------|-----------------|-------------|----------|
| qEEG Spectral (QSA-002) | 2-10 min | GPU + CPU | HIGH |
| MRI Structural (MSA-003) | 15-45 min | CPU (multi-core) | NORMAL |
| MRI Functional (MFA-004) | 20-60 min | GPU | NORMAL |
| Voice Acoustic (VAA-008) | 1-5 min | CPU | NORMAL |
| Voice Linguistic (VLA-009) | 1-5 min | CPU | NORMAL |
| Video Behavioral (VBA-010) | 5-15 min | GPU | NORMAL |
| Movement Quantification (MQA-011) | 2-10 min | CPU | NORMAL |
| Clinical Notes NLP (CNNA-014) | 1-5 min | GPU | NORMAL |
| Multimodal Correlation (MCA-015) | 5-15 min | CPU | LOW |
| Treatment Response (TRP-017) | 10-30 min | GPU | LOW |

**Queue Architecture:**
```
+------------------------------------------------------------------+
|                      MESSAGE QUEUE (RabbitMQ / SQS)              |
|                                                                   |
|  +----------------+  +----------------+  +--------------------+  |
|  | Critical Queue |  | High Queue     |  | Normal Queue       |  |
|  | (safety)       |  | (patient data) |  | (analysis)         |  |
|  | TTL: 5s        |  | TTL: 60s       |  | TTL: 24hr          |  |
|  | Workers: 10+   |  | Workers: 20+   |  | Workers: auto-scale|  |
|  +----------------+  +----------------+  +--------------------+  |
|  +----------------+  +----------------+                         |
|  | Low Queue      |  | Dead Letter    |                         |
|  | (batch jobs)   |  | Queue          |                         |
|  | TTL: 7 days    |  | (retry 3x)     |                         |
|  | Workers: 2-5   |  |                |                         |
|  +----------------+  +----------------+                         |
+------------------------------------------------------------------+
```

### 10.3 Queue-Based Pipeline

```
Data Ingestion → Validation Queue → Normalization Queue → Analyzer Router
                                                          ↓
                                    +---------------------+---------------------+
                                    ↓                     ↓                     ↓
                              GPU Workers            CPU Workers          IO Workers
                              (qEEG, MRI-func,      (MRI-struct, Labs,    (FHIR sync,
                               Video, NLP,           Voice, Movement,     Wearables,
                               DeepTwin)             Notes, Biomarkers)   Export)
                                    ↓                     ↓                     ↓
                              Results Queue ────────────────────────────────→
                                                          ↓
                                                    DeepTwin Ingestion
                                                          ↓
                                                   Hypothesis Update
                                                          ↓
                                                    Output Generation
```

### 10.4 Horizontal Scaling

**Scaling Dimensions:**

| Component | Scaling Strategy | Trigger | Max Scale |
|-----------|-----------------|---------|-----------|
| API Gateway | Auto-scaling pods | CPU > 70%, latency > 200ms | 50 instances |
| Sync Analyzers | Auto-scaling pods | Request queue depth > 100 | 30 instances |
| Async Workers | Auto-scaling workers | Queue depth > 50 | 100 GPU, 200 CPU |
| DeepTwin Engine | Sharded by patient_id | CPU > 80% | 20 instances |
| Database | Read replicas + sharding | Read latency > 50ms | 10 replicas |
| Object Storage | Cloud-native | Automatic | Unlimited |
| Time-Series DB | Partitioning + clustering | Write throughput > 10K/s | 10 nodes |
| Cache | Cluster mode | Memory > 80% | 10 nodes |
| Event Bus | Partitioned topics | Throughput > 50K msg/s | 20 partitions |

### 10.5 Database Sharding by Clinic

**Sharding Strategy:**
```
Primary Shard Key: clinic_id (for patient data)
Secondary Shard Key: patient_id (for cross-clinic analytics)

Shard Distribution:
- Clinic A (1,000 patients) → Shard 1
- Clinic B (5,000 patients) → Shard 2
- Clinic C (2,000 patients) → Shard 3
- Clinic D (10,000 patients) → Shards 4-5
- Multi-clinic analytics → Aggregator layer

Cross-Shard Operations:
- Patient transfers: Async migration with consent
- Multi-clinic reports: Aggregator queries with caching
- Evidence DB: Shared shard (all clinics)
- Audit logs: Separate shard (regulatory isolation)
```

**Database Architecture:**
```
+------------------+    +------------------+    +------------------+
|   Primary DB     |    |   Read Replica   |    |   Read Replica   |
|   (writes)       | -->|   (clinic 1-3)   |    |   (clinic 4-6)   |
|   (sharded)      |    |                  |    |                  |
+------------------+    +------------------+    +------------------+
        |
+------------------+    +------------------+
|   TimescaleDB    |    |   Neo4j (Graph)  |
|   (wearables,    |    |   (DeepTwin      |
|    time-series)  |    |    relationships)|
+------------------+    +------------------+

+------------------+    +------------------+
|   Object Store   |    |   Redis Cluster  |
|   (S3 - files)   |    |   (cache, session)|
+------------------+    +------------------+
```

### 10.6 CDN for Static Assets

| Asset Type | CDN | TTL | Compression |
|-----------|-----|-----|------------|
| Brain maps (PNG) | CloudFront | 24 hours | Yes |
| Spectrograms | CloudFront | 24 hours | Yes |
| Report templates | CloudFront | 1 hour | Yes |
| UI assets (JS/CSS) | CloudFront | 24 hours (busted) | Yes |
| Documentation | CloudFront | 1 hour | Yes |
| Evidence PDFs | CloudFront | 24 hours | Yes |
| Patient education | CloudFront | 24 hours | Yes |

### 10.7 Performance Targets

| Metric | Target | Current | Scaling Threshold |
|--------|--------|---------|-------------------|
| API Response (p95) | < 200ms | 150ms | Scale at > 300ms |
| Dashboard Load | < 2 seconds | 1.5s | Optimize at > 3s |
| Report Generation | < 30 seconds | 20s | Async at > 60s |
| qEEG Analysis | < 10 minutes | 8 min | Scale GPU at > 15 min |
| MRI Structural | < 30 minutes | 25 min | Scale CPU at > 45 min |
| MRI Functional | < 45 minutes | 40 min | Scale GPU at > 60 min |
| Wearables Sync | < 5 minutes | 3 min | Scale at > 10 min |
| DeepTwin Refresh | < 2 minutes | 90s | Scale at > 5 min |
| Safety Alert Latency | < 5 seconds | 3s | Scale at > 10s |
| Concurrent Patients | 10,000 | 5,000 | Plan at > 8,000 |
| Daily Analyses | 50,000 | 20,000 | Scale at > 40,000 |

### 10.8 Disaster Recovery

| Scenario | RTO | RPO | Strategy |
|----------|-----|-----|----------|
| Single AZ failure | 5 minutes | 0 | Multi-AZ deployment |
| Single region failure | 30 minutes | < 1 hour | Cross-region replica |
| Database corruption | 1 hour | < 15 min | Point-in-time recovery |
| Complete system failure | 4 hours | < 1 hour | Cross-region DR site |
| Data loss (single patient) | 15 minutes | 0 | Replication + WAL |
| Cyber attack | 4 hours | < 1 hour | Air-gapped backups |

---

## 11. Security & Privacy Architecture

### 11.1 Zero-Trust Architecture

Every request is authenticated, authorized, and audited regardless of origin.

```
+------------------------------------------------------------------+
|                     ZERO-TRUST SECURITY LAYER                     |
|                                                                   |
|  Request → Identity Verification → Consent Check → Role Check    |
|     ↓                                                                    |
|  MFA (if sensitive) → Rate Limit → Encryption (TLS 1.3) → Audit  |
|                                                                   |
|  Data at Rest: AES-256 (field-level for PHI)                     |
|  Data in Transit: TLS 1.3 (mandatory)                            |
|  Data in Use: Memory encryption, secure enclaves (SGX)           |
+------------------------------------------------------------------+
```

### 11.2 Consent-Tiered Processing

| Consent Level | Data Access | Analyzers Enabled | Research Use |
|--------------|-------------|-------------------|--------------|
| Level 0 (Emergency) | Minimum necessary | Safety only | No |
| Level 1 (Clinical) | All clinical data | All analyzers | No |
| Level 2 (Research) | All + de-identified | All + population norms | Aggregated only |
| Level 3 (Biobank) | All + identifiable | All + contribution | With IRB approval |

### 11.3 Field-Level Encryption

PHI fields are encrypted at the field level:
```json
{
  "patient_id": "enc:AES256:GCM:...",
  "name": "enc:AES256:GCM:...",
  "ssn": "enc:AES256:GCM:...",
  "email": "enc:AES256:GCM:...",
  "phone": "enc:AES256:GCM:...",
  "address": "enc:AES256:GCM:...",
  "date_of_birth": "enc:AES256:GCM:...",
  "mrn": "enc:AES256:GCM:..."
}
```

### 11.4 Audit Trail Requirements

Every data access is logged:
- Who (user identity, role)
- What (data accessed, action performed)
- When (timestamp with timezone)
- Where (IP address, device, location)
- Why (purpose, consent reference)
- How (API endpoint, method)

### 11.5 HIPAA Compliance Checklist

| Requirement | Implementation | Verification |
|------------|---------------|--------------|
| Administrative Safeguards | Role-based access, training, policies | Annual audit |
| Physical Safeguards | Cloud provider certifications (SOC 2, ISO 27001) | Provider audit |
| Technical Safeguards | Encryption, audit logs, access controls | Continuous monitoring |
| Breach Notification | Automated detection + notification workflow | Quarterly drill |
| Business Associate Agreements | Signed BAAs with all vendors | Annual review |
| Risk Assessment | Annual formal risk assessment | Documented |
| Minimum Necessary | Field-level access control | Per-request audit |
| Patient Rights | Access, amendment, accounting of disclosures | Self-service portal |

---

## 12. Appendices

### Appendix A: Glossary

| Term | Definition |
|------|-----------|
| DLPFC | Dorsolateral Prefrontal Cortex |
| DMN | Default Mode Network |
| EDF | European Data Format (EEG file format) |
| EHR | Electronic Health Record |
| FHIR | Fast Healthcare Interoperability Resources |
| fMRI | Functional Magnetic Resonance Imaging |
| HRV | Heart Rate Variability |
| LOINC | Logical Observation Identifiers Names and Codes |
| PHI | Protected Health Information |
| qEEG | Quantitative Electroencephalography |
| rTMS | Repetitive Transcranial Magnetic Stimulation |
| SNR | Signal-to-Noise Ratio |
| tDCS | Transcranial Direct Current Stimulation |
| TDM | Therapeutic Drug Monitoring |
| TUG | Timed Up and Go (mobility test) |

### Appendix B: Analyzer Evidence Base Summary

| Analyzer | Primary Evidence | Validation Studies | FDA/CE Status |
|----------|-----------------|-------------------|---------------|
| AA-001 | Validated instruments | 1000+ studies | Instrument-dependent |
| QSA-002 | Neuroguide, Neurometric | FDA-cleared systems | Reference only |
| MSA-003 | FreeSurfer, ADNI | 500+ studies | Research tool |
| MFA-004 | CONN, FSL | 1000+ studies | Research tool |
| LRA-005 | LOINC, CLIA | Standard of care | N/A |
| BMA-006 | Nutritional psychiatry | Emerging (50+ RCTs) | Research context |
| MA-007 | FDA labeling, Lexicomp | Standard of care | Clinical decision support |
| VAA-008 | Cummins et al. | Multiple studies | Research context |
| VLA-009 | LIWC, NLP psychiatry | Emerging | Research context |
| VBA-010 | OpenFace, MediaPipe | Emerging | Research context |
| MQA-011 | IMU validation | Established | Research context |
| WPA-012 | Consumer wearables | Validated vs. medical grade | Consumer device context |
| DPA-013 | Beiwe, mindLAMP | Emerging | Research context |
| CNNA-014 | cTAKES, clinical NLP | Emerging | Clinical decision support |
| MCA-015 | Multimodal psychiatry | Emerging | Research context |
| SRA-016 | C-SSRS, Columbia Protocol | Validated | Clinical decision support |
| TRP-017 | Precision psychiatry | Emerging | Research context |

### Appendix C: API Response Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PUT |
| 201 | Created | Successful POST (new resource) |
| 202 | Accepted | Async job queued |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation error |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource state conflict |
| 422 | Unprocessable | Business logic violation |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server error |
| 503 | Service Unavailable | Maintenance/overload |

### Appendix D: Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2024-06-01 | Arch Team | Initial document |
| 1.5.0 | 2024-08-15 | Arch Team | Added 3 analyzers, expanded API catalog |
| 2.0.0 | 2024-10-01 | Arch Team | Major revision: added DeepTwin, event flows |
| 2.1.0 | 2024-12-19 | Arch Team | Added scalability section, updated all analyzers |

---

*End of Document*

**Document Classification:** Internal Architecture - Confidential  
**Next Review Date:** 2025-03-19  
**Distribution:** Architecture Team, Engineering Leadership, Clinical Safety Board, DevOps Team
