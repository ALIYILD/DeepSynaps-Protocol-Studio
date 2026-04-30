# qEEG Clinical Intelligence Workbench

## Overview

The Clinical Intelligence Workbench is a set of 10 integrated features that add safety, governance, review, and transparency to the qEEG analysis pipeline. Every feature is decision-support only and requires clinician review before any clinical action.

## Features

### 1. Clinical Safety Cockpit
- **Endpoint**: `GET /api/v1/qeeg-analysis/{id}/safety-cockpit`
- Validates duration, sample rate, channel count, eyes condition, montage completeness, artifact burden, and epochs retained
- Returns `VALID_FOR_REVIEW`, `LIMITED_QUALITY`, or `REPEAT_RECOMMENDED`
- Persisted to `qeeg_analyses.safety_cockpit_json`

### 2. Red Flag Detector
- **Endpoint**: `GET /api/v1/qeeg-analysis/{id}/red-flags`
- Flags epileptiform patterns, severe asymmetry, excessive slowing, poor signal quality, medication confounds, acute neuro concerns
- Persisted to `qeeg_analyses.red_flags_json`

### 3. Normative Model Card
- **Endpoint**: `GET /api/v1/qeeg-analysis/{id}/normative-model-card`
- Shows normative database name/version, age range, compatibility, z-score method, confidence interval
- Includes out-of-distribution (OOD) warnings and limitations

### 4. AI Protocol Fit Panel
- **Endpoints**: `POST/GET /api/v1/qeeg-analysis/{id}/protocol-fit`
- Pattern summary, symptom linkage, contraindications, evidence grade, off-label flag
- Requires clinician review before protocol activation

### 5. Clinician Review Workflow
- **Endpoints**:
  - `POST /api/v1/qeeg-analysis/reports/{id}/transition` (state machine)
  - `POST /api/v1/qeeg-analysis/reports/{id}/findings/{finding_id}` (per-finding review)
  - `POST /api/v1/qeeg-analysis/reports/{id}/sign` (digital sign-off)
- States: `DRAFT_AI → NEEDS_REVIEW → APPROVED/REJECTED/REVIEWED_WITH_AMENDMENTS → APPROVED`
- Audit trail immutable in `qeeg_report_audits`

### 6. Patient-Facing Report
- **Endpoint**: `GET /api/v1/qeeg-analysis/reports/{id}/patient-facing`
- Gated: only available after clinician approval
- Removes BLOCKED claims, softens INFERRED claims, strips technical jargon
- Always includes decision-support disclaimer

### 7. Longitudinal Timeline
- **Endpoint**: `GET /api/v1/qeeg-analysis/patient/{patient_id}/timeline`
- Aggregates qEEG analyses, symptom scales, treatment events, sleep/wearables
- Chronologically sorted with RCI and change classification

### 8. BIDS Export (Gated)
- **Endpoint**: `POST /api/v1/qeeg-analysis/{id}/export-bids`
- Gated: requires approved AND signed report
- Generates BIDS-EEG derivatives zip with de-identified pseudonyms
- Includes safety cockpit, red flags, AI report, review state, and audit trail

### 9. Claim Governance Engine
- Classifies every AI statement as: `OBSERVED | COMPUTED | INFERRED | PROTOCOL_LINKED | UNSUPPORTED | BLOCKED`
- Blocks diagnostic language: "diagnoses ADHD", "confirms autism", "proves depression", "guarantees treatment", "cures"
- Integrated into AI report generation automatically

### 10. Copilot 2.0
- WebSocket context expanded with safety cockpit, red flags, normative metadata, interpretability status
- New quick-action chips for clinical workbench topics
- Offline demo replies cover all 10 features

## Frontend Integration

- Analysis tab auto-mounts: Safety Cockpit, Red Flags, Normative Card, Protocol Fit
- Report tab auto-mounts: Clinician Review, Patient Report, Timeline
- All panels are null-guarded — legacy analyses without new fields render unchanged
