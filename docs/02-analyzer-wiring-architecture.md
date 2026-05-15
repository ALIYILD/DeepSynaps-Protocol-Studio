# Analyzer Wiring Architecture
**Status:** ACTIVE  
**Date:** May 14, 2026  
**Purpose:** Define data flow, sources, consumers, and readiness for each analyzer

---

## RISK TRIAGE

**Purpose:** Safety-first decision support. Identifies high-risk patients and situations.

**Receives from:**
- Assessments (PHQ-9, GAD-7, suicidality screens)
- Biomarkers (qEEG abnormalities, MRI red flags)
- Labs (electrolytes, metabolic markers)
- Sessions (treatment compliance, side effects)
- Digital phenotyping (passive sensing anomalies)
- Clinician notes (adverse events, safety concerns)

**Backend endpoints:**
- `GET /api/risk/patient/{id}/score` — current risk profile
- `GET /api/risk/patient/{id}/history` — longitudinal risk trajectory
- `POST /api/risk/patient/{id}/intervention` — log safety plan

**Sends to:**
- Dashboard (alerts, pending reviews)
- Patient profile (risk summary card)
- Reports (population risk stratification)
- DeepTwin (risk input to simulation)

**Consent:** Requires risk assessment consent (override: supervisor review gate)  
**Readiness:** **LIVE** (production, monitored)

---

## BIOMARKERS (Composite)

**Purpose:** Unified biomarker interpretation across modalities (labs, imaging, neurophysiology)

**Receives from:**
- Labs Analyzer (blood markers)
- qEEG Analyzer (brain oscillations)
- MRI Analyzer (structural findings)
- Video Assessments (movement biomarkers)
- Nutrition Analyzer (metabolic indicators)
- Wearables (circadian markers)

**Backend endpoints:**
- `GET /api/biomarkers/patient/{id}` — all biomarkers + time series
- `GET /api/biomarkers/patient/{id}/modality/{mod}` — modality-specific
- `GET /api/biomarkers/patient/{id}/normative` — population comparison

**Sends to:**
- Patient profile (biomarker summary)
- Risk Triage (biomarker risk signals)
- Interventions (protocol matching via biomarkers)
- DeepTwin (unified biomarker input)
- Reports (population biomarker distributions)

**Evidence integration:** Links to research corpus (PMID references)  
**Consent:** Medical record release required  
**Readiness:** **LIVE** (production, 100+ markers tracked)

---

## LABS ANALYZER

**Purpose:** Blood test interpretation, deficiency/toxicity detection, medication interaction review.

**Receives from:**
- Bio Database (incoming lab orders + results)
- Patient records (historical labs)
- Assessments (relevant clinical context)

**Backend endpoints:**
- `GET /api/labs/patient/{id}/latest` — most recent panel
- `GET /api/labs/patient/{id}/timeline` — longitudinal trends
- `GET /api/labs/patient/{id}/interpretation` — AI-assisted interpretation

**Sends to:**
- Biomarkers analyzer (lab biomarkers)
- Nutrition Analyzer (micronutrient findings)
- Medication Analyzer (drug-level review)
- Intervention planning (protocol cautions based on labs)

**Demo/offline:** Mock lab data available; can operate standalone  
**Consent:** Medical record release  
**Readiness:** **LIVE** (production, real-time integration with lab systems)

---

## qEEG ANALYZER

**Purpose:** Neurophysiology interpretation, spectral analysis, normative deviation, ERP.

**Receives from:**
- qEEG raw files (uploaded EEG data)
- MNE pipeline (signal processing)
- Normative database (age/sex matched controls)
- Assessments (clinical context)

**Backend endpoints:**
- `GET /api/qeeg/patient/{id}/analysis/{fileId}` — analysis results
- `GET /api/qeeg/patient/{id}/montage` — electrode placement verification
- `POST /api/qeeg/patient/{id}/spike-detection` — automated spike marking

**Sends to:**
- Biomarkers (qEEG biomarkers: theta/alpha/beta power, asymmetries)
- Brain Map Planner (target selection for neuromodulation)
- Risk Triage (abnormality flags)
- DeepTwin (neurophysiology component)

**Demo/offline:** Tutorial EEG files available  
**Consent:** Medical record release + neuroimaging research consent (if gene  tic database access)  
**Readiness:** **LIVE** (production, 246 test cases passing)

---

## MRI ANALYZER

**Purpose:** Structural imaging interpretation, volumetry, lesion detection, brainage.

**Receives from:**
- Medical image storage (DICOM files)
- Cornerstone viewer (interactive segmentation)
- AI models (volumetry, lesion segmentation)
- Assessments (clinical indication)

**Backend endpoints:**
- `GET /api/mri/patient/{id}/analysis` — segmentation, volumetry results
- `GET /api/mri/patient/{id}/brainage` — biological age estimate
- `POST /api/mri/patient/{id}/compare` — longitudinal comparison

**Sends to:**
- Biomarkers (volumetry findings, lesion markers)
- Risk Triage (abnormality alerts)
- DeepTwin (structural component)
- Reports (imaging research data)

**Readiness:** **LIVE** (production, Cornerstone integrated)

---

## BIOMETRICS ANALYZER

**Purpose:** Wearable data interpretation—HRV, sleep, activity, recovery, stress trends.

**Receives from:**
- Wearables integrations (Apple Watch, Oura, Whoop, Fitbit)
- Mobile app sensors (accelerometer, gyro)
- Passive context sensing (location, social context proxies)

**Backend endpoints:**
- `GET /api/biometrics/patient/{id}/daily` — daily summaries
- `GET /api/biometrics/patient/{id}/weekly` — weekly trends
- `GET /api/biometrics/patient/{id}/anomaly` — deviation detection

**Sends to:**
- Digital Phenotyping (behavioral patterns)
- Risk Triage (stress/recovery anomalies → risk signals)
- DeepTwin (longitudinal biometric trends)
- Reports (population activity/sleep benchmarks)

**Demo/offline:** Synthetic wearable data available  
**Consent:** Wearable data sharing consent  
**Readiness:** **LIVE** (production, real-time sync)

---

## NUTRITION ANALYZER

**Purpose:** Metabolic insights: deficiency detection, supplementation review, dietary optimization.

**Receives from:**
- Labs Analyzer (micronutrients: B12, D, iron, zinc, folate)
- Nutrition surveys (dietary intake logs)
- Biomarkers (inflammatory markers relevant to diet)

**Backend endpoints:**
- `GET /api/nutrition/patient/{id}/deficiencies` — identified gaps
- `GET /api/nutrition/patient/{id}/recommendations` — evidence-based suggestions
- `GET /api/nutrition/patient/{id}/supplement-interactions` — medication check

**Sends to:**
- Biomarkers (nutritional biomarkers)
- Interventions (nutrition care plan)
- Patient education (handbooks)

**Demo/offline:** Reference nutrition guidelines available  
**Consent:** Medical record + dietary data  
**Readiness:** **LIVE** (production, 119 biomarker markers integrated)

---

## DIGITAL PHENOTYPING

**Purpose:** Behavioral summaries from passive sensing—mood, activity, social patterns, sleep-wake cycles.

**Receives from:**
- Biometrics Analyzer (aggregated trends)
- Mobile sensors (app usage, typing speed, location)
- Passive voice/text (keywords, sentiment)
- Wearables (circadian rhythm data)

**Backend endpoints:**
- `GET /api/phenotype/patient/{id}/summary` — current phenotype profile
- `GET /api/phenotype/patient/{id}/trajectory` — behavioral trajectory over time
- `GET /api/phenotype/patient/{id}/risk-signals` — anomaly flags

**Sends to:**
- Risk Triage (behavioral risk markers)
- DeepTwin (phenotype component)
- Research Datasets (de-identified phenotype profiles)

**Demo/offline:** Reference phenotype data available  
**Consent:** Passive sensing consent (strict privacy controls)  
**Readiness:** **LIVE** (production, privacy-hardened)

---

## VOICE ANALYZER

**Purpose:** Vocal biomarkers, transcription, sentiment analysis, speech rate/clarity.

**Receives from:**
- Uploaded voice files (patient records, therapy sessions)
- Virtual Care recordings (telemedicine sessions)
- Browser microphone consent (real-time recording during assessments)

**Backend endpoints:**
- `POST /api/voice/upload/{fileId}/analyze` — async analysis
- `GET /api/voice/patient/{id}/transcripts` — transcription history
- `GET /api/voice/patient/{id}/biomarkers` — vocal features (pitch, rate, clarity)

**Sends to:**
- Biomarkers (vocal biomarkers)
- Text Analyzer (NLP on transcripts)
- Risk Triage (speech anomalies → mental state inferences)
- DeepTwin (voice component)

**Demo/offline:** Reference voice samples available  
**Consent:** Audio recording consent + HIPAA transcription review  
**Readiness:** **LIVE** (production, Anthropic transcription integrated)

---

## TEXT ANALYZER

**Purpose:** NLP on clinical notes—entity extraction, symptom summaries, risk keywords, protocol relevance.

**Receives from:**
- Clinical notes (charting)
- Assessment transcripts (from Voice Analyzer)
- Patient messages (portal submit)
- Documents (uploaded PDFs parsed)

**Backend endpoints:**
- `POST /api/text/analyze` — async NLP processing
- `GET /api/text/patient/{id}/entities` — extracted medical entities
- `GET /api/text/patient/{id}/summaries` — auto-generated summaries

**Sends to:**
- Risk Triage (risk keywords → alerts)
- Biomarkers (symptom extraction)
- Interventions (protocol-relevant findings)
- Reports (patient cohort analytics)

**Demo/offline:** Reference note templates available  
**Consent:** Medical record release  
**Readiness:** **LIVE** (production, Anthropic LLM integrated)

---

## VIDEO ASSESSMENTS

**Purpose:** Movement task performance—gait, balance, motor coordination guided assessments.

**Receives from:**
- Guided webcam tasks (standardized assessment protocols)
- Uploaded video files (patient self-recordings)
- Clinic observation videos (therapist-recorded)

**Backend endpoints:**
- `POST /api/video/upload/{fileId}/analyze` — pose detection + analysis
- `GET /api/video/patient/{id}/assessments` — assessment history
- `GET /api/video/patient/{id}/metrics` — extracted movement metrics

**Sends to:**
- Movement Analyzer (movement feature extraction)
- Biomarkers (motor biomarkers)
- Rehab/Physiotherapy (progress tracking)
- Risk Triage (fall risk from gait)

**Demo/offline:** Reference video library available  
**Consent:** Video recording + media consent  
**Readiness:** **LIVE** (production, MediaPipe integration)

---

## MOVEMENT ANALYZER

**Purpose:** Motor biomarkers—gait velocity, balance, tremor, smoothness, fall risk.

**Receives from:**
- Video Assessments (pose-derived metrics)
- Wearable IMU (accelerometer, gyro from devices)
- Rehab session data (exercise performance)

**Backend endpoints:**
- `GET /api/movement/patient/{id}/gait` — gait analysis
- `GET /api/movement/patient/{id}/balance` — balance metrics
- `GET /api/movement/patient/{id}/tremor` — tremor features

**Sends to:**
- Biomarkers (motor biomarkers)
- Risk Triage (fall risk summary)
- Rehab/Physiotherapy (protocol adjustment)
- DeepTwin (motor component)

**Demo/offline:** Reference movement profiles available  
**Consent:** Video + sensor data consent  
**Readiness:** **LIVE** (production, 4 movement pipelines integrated)

---

## SESSIONS ANALYZER (Treatment Response)

**Purpose:** Longitudinal treatment intelligence—adherence, response, side effects, protocol effectiveness.

**Receives from:**
- Neuromodulation sessions (stim logs, parameters, tolerability)
- Medication sessions (prescription adherence, side effect reports)
- Rehab sessions (exercise completion, progression)
- Nutrition follow-up (dietary adherence check-ins)
- Virtual Care sessions (attendance, subjective outcomes)
- Assessments pre/post (outcome measurement)

**Backend endpoints:**
- `GET /api/sessions/patient/{id}/adherence` — engagement metrics
- `GET /api/sessions/patient/{id}/response` — outcome trajectories
- `GET /api/sessions/patient/{id}/safety` — adverse event tracking

**Sends to:**
- Risk Triage (non-adherence → risk escalation)
- Biomarkers (session-derived biomarkers)
- Interventions (protocol adjustment recommendations)
- Patient profile (progress visualization)
- Reports (population treatment effectiveness)
- DeepTwin (treatment response component)

**Demo/offline:** Reference session logs available  
**Consent:** Treatment data consent  
**Readiness:** **LIVE** (production, 246 test cases)

---

## DEEPTWIN INSIGHTS (Multimodal Synthesis)

**Purpose:** Unified digital twin—integrates all analyzers into one comprehensive patient model + AI simulation.

**Receives from:** ALL analyzers
- Risk summary
- Biomarkers (all modalities)
- Biometrics trends
- Digital phenotyping
- Voice/text analysis
- Movement features
- Sessions history
- Historical assessments

**Backend endpoints:**
- `GET /api/deeptwin/patient/{id}` — current twin state
- `POST /api/deeptwin/patient/{id}/simulation` — what-if scenario
- `GET /api/deeptwin/patient/{id}/recommendations` — AI-assisted interventions

**Sends to:**
- Dashboard (twin visualization)
- Patient profile (comprehensive twin display)
- Interventions (protocol recommendation engine)
- Reports (research-grade twin export)

**Demo/offline:** Reference digital twins available  
**Consent:** Full medical record + research consent (if AI model training)  
**Readiness:** **PREVIEW** (active development, core integration complete, AI model refinement in progress)

---

## READINESS KEY

- **LIVE**: Production, tested, monitored, safety critical
- **PARTIAL**: Core features working, gaps documented in issues
- **PREVIEW**: Active development, stable enough for limited use
- **BROKEN**: Regression or dependency failure, DO NOT PROD
- **RESEARCH-ONLY**: Prototype, demo data only, no production use

