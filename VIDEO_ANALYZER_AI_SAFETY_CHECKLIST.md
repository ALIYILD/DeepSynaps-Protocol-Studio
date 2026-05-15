# DeepSynaps Video/Movement Analyzer: AI Safety & Ethics Compliance Checklist

## Pre-Launch Regulatory, Safety, and Ethics Verification

---

**Document Version:** 1.0  
**Date:** 2025-08-28  
**Device Name:** DeepSynaps Video/Movement Analyzer  
**Regulatory Context:** FDA SaMD, EU AI Act, HIPAA, COPPA, State AI Laws  
**Checklist Type:** Pre-Launch Mandatory Verification  
**Aligned Standards:** ISO/IEC 42001, NIST AI RMF 1.0, ISO 14971, IEC 62304  

---

## Table of Contents

1. [How to Use This Checklist](#1-how-to-use-this-checklist)
2. [Consent Framework](#2-consent-framework)
3. [Bias Disclosure](#3-bias-disclosure)
4. [Uncertainty Labels](#4-uncertainty-labels)
5. [Diagnostic Claims Prohibition](#5-diagnostic-claims-prohibition)
6. [Clinician Review Requirement](#6-clinician-review-requirement)
7. [Pediatric Consent Workflow](#7-pediatric-consent-workflow)
8. [Data Retention Policy](#8-data-retention-policy)
9. [Audit Trail](#9-audit-trail)
10. [Degradation Mode](#10-degradation-mode)
11. [Emergency Override Procedures](#11-emergency-override-procedures)
12. [Adverse Event Reporting](#12-adverse-event-reporting)
13. [Human-in-the-Loop Requirements](#13-human-in-the-loop-requirements)
14. [Additional Safety Items](#14-additional-safety-items)
15. [Sign-Off](#15-sign-off)

---

## 1. How to Use This Checklist

### 1.1 Checklist Status Codes

| Status | Symbol | Meaning |
|--------|--------|---------|
| PASS | [x] | Item verified complete; evidence on file |
| FAIL | [ ] | Item incomplete; must be resolved before launch |
| N/A | [-] | Not applicable to current configuration |
| PENDING | [~] | In progress; expected completion date documented |
| WAIVED | [w] | Waived with written justification; approval on file |

### 1.2 Evidence Requirements

Each checklist item requires:
1. **Verification Method:** How was this item checked? (code review, document review, test execution, inspection)
2. **Evidence Reference:** Document ID, test ID, commit hash, or screenshot reference
3. **Verified By:** Name, role, date, signature (electronic or physical)
4. **Reviewed By:** Independent reviewer name, role, date, signature

### 1.3 Launch Criteria

**LAUNCH IS BLOCKED if any item marked [ ] (FAIL) remains unresolved.**
A maximum of 3 items may be marked [~] (PENDING) at time of launch, each with:
- Written justification for pending status
- Expected completion date within 30 days of launch
- Interim risk control measures documented
- Escalation plan if not completed on schedule

---

## 2. Consent Framework

### 2.1 Recording Consent

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 2.1.1 | Video recording consent is obtained BEFORE any camera activation | [ ] | | | | | |
| 2.1.2 | Consent form clearly states purpose of video recording (clinical movement assessment) | [ ] | | | | | |
| 2.1.3 | Consent form specifies who will have access to the video (clinical care team, AI system) | [ ] | | | | | |
| 2.1.4 | Consent form states video storage duration and deletion policy | [ ] | | | | | |
| 2.1.5 | Consent form includes option to withdraw consent and request video deletion | [ ] | | | | | |
| 2.1.6 | Consent is documented with timestamp and cannot be bypassed in workflow | [ ] | | | | | |
| 2.1.7 | Consent status is checked before EVERY video capture (not just initial enrollment) | [ ] | | | | | |
| 2.1.8 | Consent expiry is enforced (auto-re-consent after 12 months) | [ ] | | | | | |
| 2.1.9 | Consent withdrawal immediately prevents new captures and flags existing data for review | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- Consent workflow integrated into React frontend at `/consent/video-capture`
- Electronic consent captured via DocuSign integration or checkbox with legal text
- Consent status stored in PostgreSQL `patient_consents` table with `consent_type='VIDEO_RECORDING'`
- API endpoint `GET /api/v1/consent/{patient_id}/video` returns current consent status
- Camera activation is blocked by frontend if consent is not active
- Audit log entry created for every consent grant, renewal, and withdrawal
- Consent withdrawal triggers data governance workflow (see Section 8)

### 2.2 AI Analysis Consent

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 2.2.1 | Separate consent obtained for AI-powered analysis (distinct from recording consent) | [ ] | | | | | |
| 2.2.2 | AI consent explains in plain language what the AI system does and does not do | [ ] | | | | | |
| 2.2.3 | AI consent clarifies that AI is a decision-support tool, not a diagnostic device | [ ] | | | | | |
| 2.2.4 | AI consent states that a qualified clinician will review all AI-generated outputs | [ ] | | | | | |
| 2.2.5 | AI consent includes right to opt-out of AI analysis (human-only review option) | [ ] | | | | | |
| 2.2.6 | AI consent describes data protection measures for video analysis | [ ] | | | | | |
| 2.2.7 | AI consent is separate from general research consent (if applicable) | [ ] | | | | | |
| 2.2.8 | AI consent documentation includes version number and date of consent | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- AI analysis consent is a separate checkbox in the consent workflow
- Legal text reviewed by healthcare compliance attorney
- Opt-out pathway routes to manual clinician video review without AI processing
- Consent stored with `consent_type='AI_ANALYSIS'` in database
- AI analysis is blocked at API gateway if `ai_analysis_consent != 'GRANTED'`

### 2.3 Research Use Consent (Optional)

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 2.3.1 | Research use consent is separate from clinical care consent | [ ] | | | | | |
| 2.3.2 | Research consent clearly describes how data may be used for research | [ ] | | | | | |
| 2.3.3 | Research consent specifies whether data will be de-identified | [ ] | | | | | |
| 2.3.4 | Research consent includes right to withdraw without affecting clinical care | [ ] | | | | | |
| 2.3.5 | Research consent specifies data sharing with third parties (if applicable) | [ ] | | | | | |

---

## 3. Bias Disclosure

### 3.1 Bias Disclosure to Users

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 3.1.1 | Bias disclosure statement visible to clinicians before system use | [ ] | | | | | |
| 3.1.2 | Bias disclosure statement visible to patients (or guardians) before video capture | [ ] | | | | | |
| 3.1.3 | Bias disclosure states that algorithmic performance may vary across demographic groups | [ ] | | | | | |
| 3.1.4 | Bias disclosure lists known performance limitations by demographic category | [ ] | | | | | |
| 3.1.5 | Bias disclosure includes skin tone (Fitzpatrick I-VI) performance variation data | [ ] | | | | | |
| 3.1.6 | Bias disclosure includes age-related performance variation data | [ ] | | | | | |
| 3.1.7 | Bias disclosure includes body type / BMI-related performance variation data | [ ] | | | | | |
| 3.1.8 | Bias disclosure is written in accessible language (8th-grade reading level for patients) | [ ] | | | | | |
| 3.1.9 | Bias disclosure is available in multiple languages (matching service population) | [ ] | | | | | |
| 3.1.10 | Bias disclosure includes date of last bias assessment and next assessment date | [ ] | | | | | |
| 3.1.11 | Bias disclosure provides contact information for reporting performance concerns | [ ] | | | | | |
| 3.1.12 | Bias disclosure is acknowledged by user (click-to-accept) with timestamp logged | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- Bias disclosure component: `<BiasDisclosure />` rendered before first system use
- Content sourced from `VIDEO_ANALYZER_BIAS_TESTING_PROTOCOL.md` results
- Disclosure updated quarterly with latest bias test results
- Stored in `user_disclosure_acknowledgments` table with timestamp
- Clinician-facing disclosure in Dashboard > Settings > System Information
- Patient-facing disclosure in consent workflow and pre-capture screen

### 3.2 Bias Disclosure Content

The following specific statements must appear in the bias disclosure:

```
ALGORITHMIC PERFORMANCE VARIATION NOTICE

The DeepSynaps Video/Movement Analyzer uses artificial intelligence to analyze
movement patterns. Like all AI systems, its performance may vary depending on
individual characteristics and recording conditions.

Known factors that may affect accuracy:
- Skin tone: Performance has been tested across all skin tone types (Fitzpatrick
  I-VI). Most biomarkers show consistent performance; some gait parameters show
  up to 5% variation between the lightest and darkest skin tones.

- Age: Performance is validated for adults 18 years and older. Accuracy is
  highest for ages 18-65 and may decrease slightly for adults over 80.

- Body type: Very high BMI (>40) may affect pose estimation accuracy due to
  self-occlusion of body landmarks. Alternative analysis modes are available.

- Recording conditions: Camera angle, distance, lighting, and background can
  all affect accuracy. The system will warn you if conditions are suboptimal.

We continuously monitor performance across all groups and work to improve
fairness. If you believe the system performed poorly for you or your patient,
please contact [contact info].

Last updated: [DATE]
Next assessment: [DATE + 3 months]
```

---

## 4. Uncertainty Labels

### 4.1 Uncertainty on All Outputs

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 4.1.1 | Every biomarker output includes a confidence score (0-100%) | [ ] | | | | | |
| 4.1.2 | Confidence scores are color-coded (Green/Yellow/Orange/Red) | [ ] | | | | | |
| 4.1.3 | Confidence scores include qualitative label ("High"/"Moderate"/"Low"/"Insufficient") | [ ] | | | | | |
| 4.1.4 | Confidence scores include numerical uncertainty range (95% CI) | [ ] | | | | | |
| 4.1.5 | Confidence score breakdown shows components (keypoint/model/input) | [ ] | | | | | |
| 4.1.6 | Low confidence outputs (< 40%) trigger a warning banner | [ ] | | | | | |
| 4.1.7 | Low confidence outputs suggest re-capture with specific guidance | [ ] | | | | | |
| 4.1.8 | Uncertainty labels are visible on all exported reports | [ ] | | | | | |
| 4.1.9 | Uncertainty labels are visible on all dashboard views | [ ] | | | | | |
| 4.1.10 | Uncertainty labels cannot be disabled or hidden by users | [ ] | | | | | |
| 4.1.11 | Historical trend plots include error bars showing uncertainty | [ ] | | | | | |
| 4.1.12 | Comparison to reference ranges includes uncertainty context | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- Confidence display component: `<ConfidenceBadge score={0.72} />` used on all biomarker cards
- Colors: >80% green, 60-80% yellow, 40-60% orange, <40% red (defined in design system)
- Warning banner component: `<LowConfidenceWarning />` conditionally rendered
- Uncertainty enforced at API level -- all biomarker responses include `confidence` object
- Frontend validation ensures confidence field is present before rendering
- Exported PDF reports include confidence visualization
- See `VIDEO_ANALYZER_EXPLAINABILITY_REQUIREMENTS.md` for full confidence architecture

### 4.2 Uncertainty Calibration Verification

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 4.2.1 | Confidence scores are calibrated against actual accuracy | [ ] | | | | | |
| 4.2.2 | Calibration validation performed within last 3 months | [ ] | | | | | |
| 4.2.3 | Expected Calibration Error (ECE) < 0.05 for all biomarkers | [ ] | | | | | |
| 4.2.4 | Calibration is documented in calibration report | [ ] | | | | | |
| 4.2.5 | Calibration is re-performed after every model update | [ ] | | | | | |

---

## 5. Diagnostic Claims Prohibition

### 5.1 Absence of Diagnostic Claims

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 5.1.1 | NO output states or implies a diagnosis (e.g., "Parkinson's Disease," "Ataxia") | [ ] | | | | | |
| 5.1.2 | NO output states or implies disease probability or risk score | [ ] | | | | | |
| 5.1.3 | NO output uses diagnostic language ("pathological," "abnormal gait pattern") | [ ] | | | | | |
| 5.1.4 | ALL outputs use measurement language ("stride length," "tremor frequency") | [ ] | | | | | |
| 5.1.5 | ALL outputs frame results as "estimated" or "calculated," never "is" or "equals" | [ ] | | | | | |
| 5.1.6 | Reference ranges are labeled as "population reference" not "normal/abnormal" | [ ] | | | | | |
| 5.1.7 | ALL reports include decision-support disclaimer | [ ] | | | | | |
| 5.1.8 | Patient-facing outputs include "discuss with your clinician" on every screen | [ ] | | | | | |
| 5.1.9 | Marketing materials do not claim diagnostic capability | [ ] | | | | | |
| 5.1.10 | Sales training explicitly prohibits diagnostic claims | [ ] | | | | | |
| 5.1.11 | Website content reviewed for absence of diagnostic language | [ ] | | | | | |
| 5.1.12 | Automated code scan confirms no diagnostic strings in output templates | [ ] | | | | | |
| 5.1.13 | Clinician training includes "no diagnostic claims" as core principle | [ ] | | | | | |
| 5.1.14 | Third-party integrations reviewed for diagnostic claim propagation | [ ] | | | | | |

**Required Disclaimer Text (must appear on every output):**

```
DISCLAIMER: This is a clinical decision-support tool. The information provided
is for use by qualified healthcare professionals only and should not be used as
a standalone basis for diagnosis or treatment decisions. All outputs must be
interpreted by a qualified clinician in the context of the full clinical picture,
including patient history, physical examination, and other diagnostic tests.
This system does not provide medical diagnoses.
```

### 5.2 Language Standards Verification

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 5.2.1 | All UI strings reviewed for prohibited diagnostic language | [ ] | | | | | |
| 5.2.2 | All API response strings reviewed for prohibited diagnostic language | [ ] | | | | | |
| 5.2.3 | All email/notification templates reviewed for prohibited diagnostic language | [ ] | | | | | |
| 5.2.4 | All PDF report templates reviewed for prohibited diagnostic language | [ ] | | | | | |
| 5.2.5 | Linting rule exists to flag prohibited diagnostic terms in code | [ ] | | | | | |
| 5.2.6 | Prohibited terms list maintained and version-controlled | [ ] | | | | | |

**Prohibited Terms List:**
- "diagnosed with," "diagnosis of," "diagnostic"
- "Parkinson's Disease" (as a label for patient), "has Parkinson's"
- "pathological," "pathologic gait," "abnormal" (without "compared to reference" context)
- "disease probability," "disease risk," "likelihood of disease"
- "normal" (as patient classification), "abnormal" (as patient classification)
- "screen positive," "screen negative"

---

## 6. Clinician Review Requirement

### 6.1 Human-in-the-Loop Workflow

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 6.1.1 | ALL AI-generated biomarkers require clinician review before incorporation into clinical record | [ ] | | | | | |
| 6.1.2 | System enforces clinician review (biomarker status "pending review" until acknowledged) | [ ] | | | | | |
| 6.1.3 | Clinician must actively acknowledge review (not passive/auto-acknowledge) | [ ] | | | | | |
| 6.1.4 | Clinician acknowledgment is logged with timestamp and user ID | [ ] | | | | | |
| 6.1.5 | Reports cannot be finalized without clinician sign-off | [ ] | | | | | |
| 6.1.6 | Patient-facing results are NOT released before clinician review | [ ] | | | | | |
| 6.1.7 | Clinician can override, annotate, or reject any AI-generated biomarker | [ ] | | | | | |
| 6.1.8 | Clinician override reasons are collected (dropdown + free text) | [ ] | | | | | |
| 6.1.9 | Override data is used for model improvement (with consent) | [ ] | | | | | |
| 6.1.10 | Clinician role verification required (licensure check or institutional verification) | [ ] | | | | | |
| 6.1.11 | Unauthorized users cannot access biomarker review interface | [ ] | | | | | |
| 6.1.12 | Clinician review is required even for "High Confidence" outputs | [ ] | | | | | |
| 6.1.13 | Time spent on review is tracked (minimum recommended: 2 minutes per case) | [ ] | | | | | |
| 6.1.14 | Clinician review training module is completed before system access granted | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- Biomarker status flow: `PENDING` -> `UNDER_REVIEW` -> `CLINICIAN_REVIEWED` / `CLINICIAN_OVERRIDDEN`
- State transition enforced at API level; invalid transitions rejected with 409 Conflict
- Clinician dashboard shows review queue with pending cases
- Override workflow: clinician selects reason from dropdown (e.g., "Disagree with value," "Technical artifact," "Clinical context not captured") + optional free text
- RBAC: `ROLE_CLINICIAN_REVIEWER` required for review interface access
- Audit log: `clinician_review_events` table with reviewer_id, timestamp, action, reason

### 6.2 Clinician Training Requirements

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 6.2.1 | All clinicians complete training module before system access | [ ] | | | | | |
| 6.2.2 | Training covers system capabilities and limitations | [ ] | | | | | |
| 6.2.3 | Training covers uncertainty interpretation | [ ] | | | | | |
| 6.2.4 | Training covers bias awareness and limitations | [ ] | | | | | |
| 6.2.5 | Training includes case studies with examples of correct/incorrect outputs | [ ] | | | | | |
| 6.2.6 | Training competency assessment passed (> 80% score) | [ ] | | | | | |
| 6.2.7 | Annual refresher training is required | [ ] | | | | | |
| 6.2.8 | Training completion is documented and auditable | [ ] | | | | | |

---

## 7. Pediatric Consent Workflow

### 7.1 Age Verification and Gating

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 7.1.1 | Patient age is verified at registration (government ID or institutional record) | [ ] | | | | | |
| 7.1.2 | System automatically flags patients under 18 for pediatric workflow | [ ] | | | | | |
| 7.1.3 | Pediatric workflow cannot be bypassed by user override | [ ] | | | | | |
| 7.1.4 | Age cutoff is strictly enforced (18 years = adult; 17 years 364 days = pediatric) | [ ] | | | | | |
| 7.1.5 | Pediatric workflow requires guardian electronic signature | [ ] | | | | | |
| 7.1.6 | Pediatric workflow requires assent from minor (age-appropriate explanation) | [ ] | | | | | |
| 7.1.7 | Pediatric workflow requires dual authorization (guardian + clinician) | [ ] | | | | | |
| 7.1.8 | Pediatric consent form is distinct from adult consent form | [ ] | | | | | |
| 7.1.9 | Pediatric consent form uses age-appropriate language for assent portion | [ ] | | | | | |
| 7.1.10 | Pediatric video storage has enhanced access controls | [ ] | | | | | |
| 7.1.11 | Pediatric data is tagged and filterable in all reporting | [ ] | | | | | |
| 7.1.12 | COPPA compliance verified for all pediatric data handling | [ ] | | | | | |
| 7.1.13 | Pediatric-specific biomarker reference ranges are used | [ ] | | | | | |
| 7.1.14 | Pediatric-specific limitations are disclosed to guardian | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- Age verification via `patient.date_of_birth` field; age calculated server-side
- Pediatric flag: `is_pediatric = age < 18` computed at registration and stored
- Pediatric workflow route: `/patients/{id}/capture/pediatric` enforced by frontend router
- Guardian signature: DocuSign template with guardian-specific fields
- Assent module: Interactive animated explanation (3-5 minutes) appropriate for ages 7+
- Dual authorization: `pediatric_capture_requires_dual_auth=true` in system configuration
- COPPA: Privacy policy includes COPPA section; data retention for minors = until age 21 or 7 years, whichever is longer
- See `FRONTEND_CONSENT_UX_GUIDE.md` for full pediatric consent UX specification

### 7.2 Pediatric-Specific Limitations

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 7.2.1 | Pediatric normative data is available for all biomarkers | [ ] | | | | | |
| 7.2.2 | Pediatric normative data sample size > 50 per age group | [ ] | | | | | |
| 7.2.3 | Age-appropriate movement task instructions are available | [ ] | | | | | |
| 7.2.4 | System accounts for rapid developmental changes in movement patterns | [ ] | | | | | |
| 7.2.5 | Guardians are informed that pediatric validation is separate and ongoing | [ ] | | | | | |

---

## 8. Data Retention Policy

### 8.1 Retention Policy Implementation

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 8.1.1 | Data retention policy is documented and approved by Legal/Compliance | [ ] | | | | | |
| 8.1.2 | Video retention period is defined (default: 7 years post-capture) | [ ] | | | | | |
| 8.1.3 | Biomarker data retention period is defined (default: 7 years or per institutional policy) | [ ] | | | | | |
| 8.1.4 | Consent withdrawal triggers automatic data deletion workflow | [ ] | | | | | |
| 8.1.5 | Data deletion is verifiable (deletion log with proof of destruction) | [ ] | | | | | |
| 8.1.6 | Backup data is included in deletion scope | [ ] | | | | | |
| 8.1.7 | Data deletion occurs within 30 days of consent withdrawal | [ ] | | | | | |
| 8.1.8 | Anonymized aggregate data may be retained for research (with separate consent) | [ ] | | | | | |
| 8.1.9 | Data retention policy is communicated to all users | [ ] | | | | | |
| 8.1.10 | Data retention policy is included in terms of service | [ ] | | | | | |
| 8.1.11 | Automated retention policy enforcement is implemented (scheduled deletion jobs) | [ ] | | | | | |
| 8.1.12 | Data retention exceptions require documented approval and audit trail | [ ] | | | | | |
| 8.1.13 | Pediatric data has extended retention (until age 21 or 7 years, whichever is longer) | [ ] | | | | | |
| 8.1.14 | Cross-border data transfer complies with data localization requirements | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- Retention policy: `data_retention_config.yaml` with per-data-type retention periods
- Automated deletion: Celery scheduled task runs daily for expired records
- Deletion workflow: Soft delete -> 30-day grace period -> cryptographic erasure -> deletion log entry
- Consent withdrawal: Immediate soft delete + grace period notification
- Backup deletion: S3 object lifecycle policy with 7-year expiration
- Audit: `data_deletion_log` table with record_id, deletion_time, method, verification_hash
- Export before deletion: Patient data export available during grace period

### 8.2 Data Minimization

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 8.2.1 | Only necessary video frames are retained (key frames, not full video where possible) | [ ] | | | | | |
| 8.2.2 | PII is separated from biomarker data (pseudonymization) | [ ] | | | | | |
| 8.2.3 | Video is processed on-device where possible (edge processing) | [ ] | | | | | |
| 8.2.4 | Raw video is not retained if only derived biomarkers are needed | [ ] | | | | | |
| 8.2.5 | Data collection is limited to what is necessary for the stated purpose | [ ] | | | | | |

---

## 9. Audit Trail

### 9.1 Audit Logging Requirements

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 9.1.1 | All data access is logged (who, what, when, from where) | [ ] | | | | | |
| 9.1.2 | All biomarker calculations are logged (input, output, model version) | [ ] | | | | | |
| 9.1.3 | All clinician actions are logged (review, override, annotation, report generation) | [ ] | | | | | |
| 9.1.4 | All consent actions are logged (grant, renewal, withdrawal) | [ ] | | | | | |
| 9.1.5 | All system configuration changes are logged (what changed, by whom, old/new value) | [ ] | | | | | |
| 9.1.6 | All model deployments are logged (version, timestamp, deployment trigger) | [ ] | | | | | |
| 9.1.7 | All API requests are logged (endpoint, parameters, response code, user) | [ ] | | | | | |
| 9.1.8 | Audit logs are immutable (tamper-evident storage) | [ ] | | | | | |
| 9.1.9 | Audit logs are retained for minimum 7 years | [ ] | | | | | |
| 9.1.10 | Audit logs are protected from unauthorized modification or deletion | [ ] | | | | | |
| 9.1.11 | Audit logs are searchable and exportable for compliance review | [ ] | | | | | |
| 9.1.12 | Audit log access itself is logged (meta-auditing) | [ ] | | | | | |
| 9.1.13 | Audit log integrity is verified periodically (hash chain verification) | [ ] | | | | | |
| 9.1.14 | Real-time audit anomaly detection is implemented (unusual access patterns) | [ ] | | | | | |
| 9.1.15 | Audit trail covers all system components (frontend, API, ML, database, storage) | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- Audit system: Centralized logging via structured JSON to append-only log store
- Schema: `{timestamp, user_id, action, resource_type, resource_id, old_value, new_value, ip_address, session_id, correlation_id}`
- Immutability: Logs written to append-only storage (e.g., AWS CloudTrail + S3 with Object Lock)
- Retention: 7 years in cold storage with quarterly integrity verification
- Search: Elasticsearch index for real-time audit log querying
- Alerts: Real-time anomaly detection for bulk access, off-hours access, unknown IP patterns
- Compliance report: Automated generation of audit summary for compliance reviews

### 9.2 Audit Trail Completeness Check

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 9.2.1 | Audit trail captures all 18 HIPAA-specified audit events | [ ] | | | | | |
| 9.2.2 | Audit trail captures consent lifecycle events | [ ] | | | | | |
| 9.2.3 | Audit trail captures ML inference events (model version, input hash, output) | [ ] | | | | | |
| 9.2.4 | Audit trail captures report generation and distribution | [ ] | | | | | |
| 9.2.5 | Audit trail captures data export events | [ ] | | | | | |
| 9.2.6 | Audit trail captures failed authentication attempts | [ ] | | | | | |
| 9.2.7 | Audit trail captures permission changes | [ ] | | | | | |

---

## 10. Degradation Mode

### 10.1 Low-Quality Video Handling

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 10.1.1 | System assesses video quality BEFORE processing | [ ] | | | | | |
| 10.1.2 | Quality assessment covers: resolution, frame rate, lighting, blur, occlusion | [ ] | | | | | |
| 10.1.3 | Quality score is computed and displayed to user | [ ] | | | | | |
| 10.1.4 | If quality is below minimum threshold: processing is blocked with specific guidance | [ ] | | | | | |
| 10.1.5 | If quality is suboptimal but processable: biomarker is calculated with elevated uncertainty | [ ] | | | | | |
| 10.1.6 | Degradation mode triggers enhanced uncertainty display | [ ] | | | | | |
| 10.1.7 | Degradation mode includes specific guidance for quality improvement | [ ] | | | | | |
| 10.1.8 | Degradation mode is logged for quality monitoring | [ ] | | | | | |
| 10.1.9 | Degradation thresholds are configurable per deployment | [ ] | | | | | |
| 10.1.10 | Graceful degradation occurs for partial keypoint detection (missing/occluded joints) | [ ] | | | | | |
| 10.1.11 | Degradation mode does not crash or produce unhandled exceptions | [ ] | | | | | |
| 10.1.12 | Degradation mode produces valid but appropriately flagged outputs (never silent failure) | [ ] | | | | | |
| 10.1.13 | Frame-level quality assessment is available for temporal quality issues | [ ] | | | | | |
| 10.1.14 | Quality metrics are included in the explanation for clinician review | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- Quality pipeline: Video upload -> `VideoQualityAnalyzer` -> quality score -> routing decision
- Quality dimensions: resolution_score, fps_score, lighting_score, blur_score, occlusion_score
- Routing: `quality_score > 0.7` -> normal processing; `0.4 < quality_score <= 0.7` -> degraded mode; `quality_score <= 0.4` -> reject with guidance
- Degraded mode: All uncertainty multipliers increased by 1.5x; additional warning banners; enhanced explanation
- Guidance: Specific actionable feedback ("Move closer to light source," "Ensure full body is visible")
- Graceful partial: If 25/33 keypoints detected with > 0.6 confidence, proceed with available keypoints; missing keypoints flagged

### 10.2 Degradation Thresholds

| Quality Parameter | Good (Normal) | Degraded | Rejected |
|-------------------|--------------|----------|----------|
| Overall Quality Score | > 0.70 | 0.40 - 0.70 | < 0.40 |
| Resolution | >= 720p | 480p - 720p | < 480p |
| Frame Rate | >= 30 fps | 24-30 fps | < 24 fps |
| Lighting | >= 200 lux | 100-200 lux | < 100 lux |
| Blur (Laplacian variance) | > 100 | 50-100 | < 50 |
| Keypoint Detection Rate | > 90% | 70-90% | < 70% |

---

## 11. Emergency Override Procedures

### 11.1 Emergency Override Capabilities

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 11.1.1 | Emergency stop capability exists to halt all AI processing system-wide | [ ] | | | | | |
| 11.1.2 | Emergency stop is accessible to authorized personnel 24/7 | [ ] | | | | | |
| 11.1.3 | Emergency stop activation triggers immediate notification to on-call team | [ ] | | | | | |
| 11.1.4 | Emergency stop does not affect data already in clinical records | [ ] | | | | | |
| 11.1.5 | Emergency stop rationale is collected and logged | [ ] | | | | | |
| 11.1.6 | Emergency resume procedure exists with documented safety checks | [ ] | | | | | |
| 11.1.7 | Individual patient record can be excluded from AI processing on request | [ ] | | | | | |
| 11.1.8 | System can be rolled back to previous model version within 15 minutes | [ ] | | | | | |
| 11.1.9 | Rollback procedure is tested monthly | [ ] | | | | | |
| 11.1.10 | Incident response plan is documented and distributed to on-call team | [ ] | | | | | |
| 11.1.11 | Incident response team roles and contact information are current | [ ] | | | | | |
| 11.1.12 | Emergency communication tree is tested quarterly | [ ] | | | | | |
| 11.1.13 | Post-incident review is conducted within 48 hours of any emergency activation | [ ] | | | | | |
| 11.1.14 | Patient safety impact assessment is conducted for any emergency activation | [ ] | | | | | |

**DeepSynaps Implementation Details:**
- Emergency stop: Admin dashboard button + API endpoint `POST /admin/emergency-stop`
- Authorization: Requires `ROLE_SYSTEM_ADMIN` + second-factor confirmation
- Effect: Sets `system_status=EMERGENCY_STOPPED` in Redis; all AI processing halted
- Notification: PagerDuty integration; on-call engineer + clinical safety officer notified
- Rollback: Blue-green deployment; `kubectl rollout undo` or traffic switch to previous model version
- Individual exclusion: `POST /patients/{id}/exclude-from-ai` with clinical reason
- Recovery: Documented runbook at `/docs/runbooks/emergency-override.md`

### 11.2 Incident Response Plan

| Severity | Definition | Response Time | Actions |
|----------|-----------|--------------|---------|
| **Critical** | Patient safety risk; system-wide failure | 15 minutes | Emergency stop; immediate notification; all-hands response |
| **High** | Significant accuracy degradation; data breach potential | 1 hour | Degraded mode activation; investigation; stakeholder notification |
| **Medium** | Single-patient issue; non-safety performance concern | 4 hours | Case-level override; investigation; fix scheduling |
| **Low** | Minor UI issue; documentation error | 24 hours | Ticket creation; scheduled fix |

---

## 12. Adverse Event Reporting

### 12.1 Adverse Event Detection and Reporting

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 12.1.1 | Adverse event (AE) definition is documented for this device | [ ] | | | | | |
| 12.1.2 | AE reporting mechanism is available to all users (clinicians, patients, staff) | [ ] | | | | | |
| 12.1.3 | AE reporting form is accessible within the application | [ ] | | | | | |
| 12.1.4 | AE can be reported anonymously | [ ] | | | | | |
| 12.1.5 | AE submission triggers immediate notification to clinical safety officer | [ ] | | | | | |
| 12.1.6 | All AEs are logged in a central adverse event database | [ ] | | | | | |
| 12.1.7 | AE severity is assessed within 24 hours of report | [ ] | | | | | |
| 12.1.8 | Serious AEs (patient harm) are reported to FDA within required timeframe | [ ] | | | | | |
| 12.1.9 | Serious AEs trigger immediate device safety review | [ ] | | | | | |
| 12.1.10 | AE trends are analyzed monthly for systematic issues | [ ] | | | | | |
| 12.1.11 | AE data is included in periodic safety updates (PSUR for EU MDR) | [ ] | | | | | |
| 12.1.12 | Clinician training includes AE identification and reporting procedures | [ ] | | | | | |
| 12.1.13 | AE reporting contact information is visible on all outputs | [ ] | | | | | |
| 12.1.14 | AE investigation includes root cause analysis with timeline | [ ] | | | | | |
| 12.1.15 | Corrective and preventive actions (CAPA) are documented for all confirmed AEs | [ ] | | | | | |

**DeepSynaps Adverse Event Definition:**

An adverse event for the DeepSynaps Video/Movement Analyzer is defined as any undesirable experience associated with the use of the device, including but not limited to:

- **Direct harm:** Injury resulting from device use (e.g., fall during video capture)
- **Clinical decision harm:** Patient harm resulting from over-reliance on AI output, missed diagnosis due to system error, or incorrect clinical decision informed by inaccurate biomarker
- **Data harm:** Unauthorized access to or breach of patient video/data
- **Psychological harm:** Significant patient distress from AI-generated results
- **System failure:** Unexpected device behavior affecting patient care

**AE Severity Classification:**

| Class | Definition | Example | Reporting Timeline |
|-------|-----------|---------|-------------------|
| Serious | Patient death, serious injury, or serious illness | Incorrect fall risk assessment leading to unmonitored fall | Immediate (within 24 hours) |
| Moderate | Requires medical intervention or extended monitoring | Delayed clinical assessment due to system downtime | Within 72 hours |
| Minor | No medical intervention required; transient issue | Patient anxiety from viewing preliminary results | Within 30 days |
| Near-miss | Could have resulted in harm but was caught | Clinician identified obviously incorrect biomarker before acting | Within 30 days |

**FDA Reporting:**
- MDR (Medical Device Report) filed within 30 days for device-related serious injury/malfunction
- 5-day report for events requiring remedial action to prevent unreasonable risk of substantial harm

### 12.2 AE Reporting Form Fields

| Field | Required | Description |
|-------|----------|-------------|
| Reporter type | Yes | Clinician / Patient / Caregiver / Staff |
| Event date | Yes | Date the event occurred |
| Event description | Yes | Narrative description of what happened |
| Patient identifier | No (if anonymous) | Study ID or patient reference |
| Device version | Auto-populated | Software version at time of event |
| Biomarker involved | If applicable | Which biomarker was affected |
| Confidence score | Auto-populated | System confidence at time of event |
| Severity assessment | Yes | Reporter's assessment of severity |
| Patient outcome | Yes | Death / Serious injury / Intervention required / None |
| Contributing factors | No | Environmental, user, system factors |
| Reporter contact | No (unless anonymous waived) | For follow-up if needed |

---

## 13. Human-in-the-Loop Requirements

### 13.1 Mandatory Human Review

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 13.1.1 | Human (qualified clinician) review is REQUIRED for all AI-generated biomarkers | [ ] | | | | | |
| 13.1.2 | Human review is enforced by workflow design (not just policy) | [ ] | | | | | |
| 13.1.3 | AI system cannot generate final clinical reports without human sign-off | [ ] | | | | | |
| 13.1.4 | AI system cannot directly write to EHR/clinical record without human approval | [ ] | | | | | |
| 13.1.5 | Patient cannot view AI-generated results before clinician review | [ ] | | | | | |
| 13.1.6 | Low-confidence outputs trigger enhanced human review requirements | [ ] | | | | | |
| 13.1.7 | Flagged cases (outliers, edge cases) require mandatory senior clinician review | [ ] | | | | | |
| 13.1.8 | Human override capability is available for all AI outputs | [ ] | | | | | |
| 13.1.9 | Override reasons are collected and analyzed for model improvement | [ ] | | | | | |
| 13.1.10 | Human review time is tracked and reported (minimum 2 minutes per case) | [ ] | | | | | |
| 13.1.11 | Review quality is assessed through periodic spot-checks | [ ] | | | | | |
| 13.1.12 | Human-AI disagreement is tracked and analyzed | [ ] | | | | | |
| 13.1.13 | Feedback loop exists from clinicians to model improvement team | [ ] | | | | | |
| 13.1.14 | Human review is never bypassed by automation, including during high-volume periods | [ ] | | | | | |
| 13.1.15 | On-call clinician coverage is required for 24/7 operations (if applicable) | [ ] | | | | | |

### 13.2 Human-AI Interaction Design

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 13.2.1 | AI outputs are presented as suggestions, not conclusions | [ ] | | | | | |
| 13.2.2 | AI confidence is always visible alongside outputs | [ ] | | | | | |
| 13.2.3 | AI limitations are visible in context (not buried in documentation) | [ ] | | | | | |
| 13.2.4 | Clinician can easily access raw video alongside AI analysis | [ ] | | | | | |
| 13.2.5 | Clinician can request re-analysis with different parameters | [ ] | | | | | |
| 13.2.6 | System remembers clinician preferences and override patterns | [ ] | | | | | |
| 13.2.7 | AI explanations are designed for clinical workflow integration | [ ] | | | | | |
| 13.2.8 | System supports collaborative review (multiple clinicians can review same case) | [ ] | | | | | |
| 13.2.9 | System provides appropriate trust calibration (not over-confident) | [ ] | | | | | |
| 13.2.10 | System gracefully handles cases where clinician disagrees with AI | [ ] | | | | | |

---

## 14. Additional Safety Items

### 14.1 Cybersecurity

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 14.1.1 | SBOM (Software Bill of Materials) is complete and current | [ ] | | | | | |
| 14.1.2 | Penetration testing completed within last 6 months with no critical findings | [ ] | | | | | |
| 14.1.3 | All critical and high vulnerabilities are remediated | [ ] | | | | | |
| 14.1.4 | MFA is enforced for all user accounts | [ ] | | | | | |
| 14.1.5 | Role-based access control (RBAC) is implemented and verified | [ ] | | | | | |
| 14.1.6 | Encryption at rest (AES-256) and in transit (TLS 1.3) is verified | [ ] | | | | | |
| 14.1.7 | Backup and disaster recovery plan is tested and documented | [ ] | | | | | |
| 14.1.8 | Incident response plan is documented and team trained | [ ] | | | | | |

### 14.2 Model Governance

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 14.2.1 | Model version is controlled and documented for every deployment | [ ] | | | | | |
| 14.2.2 | Model training data is documented (source, size, demographics) | [ ] | | | | | |
| 14.2.3 | Model validation results are current and within acceptance criteria | [ ] | | | | | |
| 14.2.4 | Bias testing results are current (within 3 months) | [ ] | | | | | |
| 14.2.5 | Predetermined Change Control Plan (PCCP) is documented and FDA-aligned | [ ] | | | | | |
| 14.2.6 | Model rollback capability is tested and documented | [ ] | | | | | |
| 14.2.7 | Model performance monitoring is active in production | [ ] | | | | | |
| 14.2.8 | Drift detection is configured with alerting thresholds | [ ] | | | | | |

### 14.3 Labeling and Instructions

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 14.3.1 | Instructions for Use (IFU) document is complete and reviewed | [ ] | | | | | |
| 14.3.2 | IFU includes all limitations and contraindications | [ ] | | | | | |
| 14.3.3 | IFU includes decision-support disclaimer | [ ] | | | | | |
| 14.3.4 | IFU includes camera setup and quality requirements | [ ] | | | | | |
| 14.5.5 | IFU includes troubleshooting guide | [ ] | | | | | |
| 14.3.6 | User manual is available in all supported languages | [ ] | | | | | |
| 14.3.7 | Quick-start guide is available for new users | [ ] | | | | | |

### 14.4 Training and Competency

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 14.4.1 | Clinician training program is developed and deployed | [ ] | | | | | |
| 14.4.2 | Training includes system limitations and appropriate use | [ ] | | | | | |
| 14.4.3 | Competency assessment is required before system access | [ ] | | | | | |
| 14.4.4 | Technical support training is completed for support staff | [ ] | | | | | |
| 14.4.5 | Training materials are version-controlled and current | [ ] | | | | | |
| 14.4.6 | Training completion is tracked per user | [ ] | | | | | |

### 14.5 EU AI Act Compliance (if applicable)

| # | Item | Status | Evidence Ref | Verified By | Date | Reviewed By | Date |
|---|------|--------|-------------|-------------|------|-------------|------|
| 14.5.1 | High-risk AI system registration completed (if classified as high-risk) | [ ] | | | | | |
| 14.5.2 | EU CE marking requirements understood and compliance planned | [ ] | | | | | |
| 14.5.3 | Post-market monitoring plan is documented | [ ] | | | | | |
| 14.5.4 | Fundamental rights impact assessment completed (if required) | [ ] | | | | | |

---

## 15. Sign-Off

### 15.1 Pre-Launch Verification Summary

| Category | Total Items | Pass | Fail | Pending | N/A | Waived |
|----------|------------|------|------|---------|-----|--------|
| Consent Framework | 17 | | | | | |
| Bias Disclosure | 12 | | | | | |
| Uncertainty Labels | 17 | | | | | |
| Diagnostic Claims | 25 | | | | | |
| Clinician Review | 21 | | | | | |
| Pediatric Consent | 19 | | | | | |
| Data Retention | 19 | | | | | |
| Audit Trail | 22 | | | | | |
| Degradation Mode | 14 | | | | | |
| Emergency Override | 14 | | | | | |
| Adverse Event Reporting | 15 | | | | | |
| Human-in-the-Loop | 25 | | | | | |
| Additional Safety | 31 | | | | | |
| **TOTAL** | **271** | | | | | |

### 15.2 Launch Authorization

**LAUNCH IS:**

- [ ] **APPROVED** -- All critical items passed; zero blocking failures
- [ ] **APPROVED WITH CONDITIONS** -- Items pending with documented mitigation (max 3)
- [ ] **BLOCKED** -- Items failing require resolution before launch

### 15.3 Signatures

| Role | Name | Signature | Date |
|------|------|-----------|------|
| VP Engineering | | | |
| Clinical Safety Officer | | | |
| Regulatory Affairs Lead | | | |
| Chief Medical Officer | | | |
| Quality Assurance Lead | | | |
| Data Protection Officer | | | |
| CEO | | | |

### 15.4 Post-Sign-Off Notes

```
[Space for any conditions, reservations, or notes accompanying the sign-off]






```

---

## Appendix A: Cross-Reference to Regulatory Documents

| Checklist Item | Supporting Document | Section |
|---------------|-------------------|---------|
| Consent Framework | `FRONTEND_CONSENT_UX_GUIDE.md` | Full document |
| Bias Testing | `VIDEO_ANALYZER_BIAS_TESTING_PROTOCOL.md` | Full document |
| Explainability | `VIDEO_ANALYZER_EXPLAINABILITY_REQUIREMENTS.md` | Full document |
| Clinical Validation | `VIDEO_ANALYZER_CLINICAL_VALIDATION_PLAN.md` | Full document |
| FDA Classification | `VIDEO_ANALYZER_FDA_SaMD_CLASSIFICATION.md` | Full document |
| Safety & Ethics | `VIDEO_AI_SAFETY_ETHICS_REPORT.md` | Full document |

## Appendix B: Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-08-28 | Initial release | Clinical Regulatory Team |

---

*Document Control: This checklist is a controlled document under the DeepSynaps Quality Management System. All checklist items must be completed and signed off before commercial launch.*

*Next Review Date: Before each major release; minimum quarterly*
