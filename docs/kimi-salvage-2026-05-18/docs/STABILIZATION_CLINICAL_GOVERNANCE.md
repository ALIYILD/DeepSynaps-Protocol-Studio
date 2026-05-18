<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
<!--
REGULATED-CLINICAL DOCUMENT — CONSERVATIVE EDIT POLICY APPLIED

The FDA / EU-AI-Act / HIPAA / GDPR framework sections (AI Safety Wording
Standards, Consent Management, Clinician Review Systems, Regulatory Alignment)
are substantively preserved because the legal/regulatory content is
independently verifiable and broadly accurate.

IMPLEMENTATION CLAIMS THAT CANNOT BE VERIFIED AGAINST CURRENT MAIN are tagged
with  <!-- TODO: clinical-governance review required against current main -->
<!-- rather than rewritten.

Specific known divergences:
- Sections referencing `require_clinician_auth`, `kl.check_patient_access()`,
  `patient_access` table, `ai_analysis_consent`, `cross_clinic_access`, or
  `super_admin` role do NOT match current main. Current auth is
  `require_minimum_role(actor, "clinician")` in `apps/api/app/auth.py`;
  roles are guest/patient/technician/reviewer/clinician/admin/supervisor.
- The "Regulatory Alignment" table row "CDS Software Criterion 3/4 — Compliant"
  and "SaMD classification — In Progress" are aspirational claims whose current
  status is unverified.
- BIDS / FHIR export governance text is a design aspiration; actual export
  implementation is in `apps/api/app/routers/export_router.py` and
  `apps/api/app/services/bids_export.py` / `fhir_export.py`.
-->

# STABILIZATION_CLINICAL_GOVERNANCE.md

> **Document Version:** 1.0.0
> **Effective Date:** 2026-07-18
> **Classification:** DeepSynaps Protocol Studio - Governance & Compliance Framework
> **Authors:** Clinical Governance Research Division
> **Scope:** AI-enabled clinical analysis systems, patient data pipelines, and human-in-the-loop review architectures

---

## Executive Summary

This document establishes the clinical governance framework for DeepSynaps Protocol Studio, covering five critical domains: **Export Governance**, **Audit Workflows**, **AI Safety Wording Standards**, **Consent Management**, and **Clinician Review Systems**. The framework aligns with FDA Clinical Decision Support (CDS) guidance (2026 Final Guidance), the EU AI Act (Regulation 2024/1689), HIPAA Security Rule requirements, and GDPR Article 9 special-category data protections.

Clinical AI systems operate at the intersection of medical device regulation, data protection law, and professional liability. A single AI failure involving patient data can trigger three separate notification obligations: the FDA/Market Surveillance Authority (AI Act Article 62), the national competent authority for medical devices (MDR), and the data protection authority (GDPR breach notification). This document provides actionable governance patterns to mitigate these overlapping risks.

**Key Findings:**
- The FDA 2026 CDS Final Guidance explicitly states that CDS software must **not be intended to replace or direct the HCP's judgment** (Criterion 3), and must enable **independent review of the basis for recommendations** (Criterion 4).
- The EU AI Act classifies clinical AI as **high-risk** under both Annex I (MDR/IVDR-integrated) and Annex III (healthcare access), with full enforcement staggered between August 2026 and August 2027.
- HIPAA requires **6-year minimum retention** for audit logs and compliance documentation, with immutable storage and separation-of-duties access controls.
- Cross-border patient data transfers require **Standard Contractual Clauses (SCCs)** and a **Transfer Impact Assessment (TIA)** under GDPR, even when HIPAA Business Associate Agreements are in place.
- The EU AI Act **Article 5** prohibits 8 categories of AI practices outright (effective since February 2, 2025), with penalties up to **EUR 35 million or 7% of global turnover**.

---

## Export Governance

### FHIR Export Governance

FHIR (Fast Healthcare Interoperability Resources) bulk data export operations (`$export`) are governed by the HL7 FHIR Bulk Data Access specification. For clinical AI systems, these exports represent high-risk data transfer events that require multi-layer governance.

**Security Requirements:**
- **Transport Layer Security:** TLS 1.2+ with forward secrecy; disable TLS 1.0/1.1 and weak ciphers. Enable HSTS and OCSP stapling.
- **Authorization:** OAuth 2.0 SMART Backend Services with asymmetric keys and JWKS rotation. Scope tokens narrowly (e.g., `system/*.read`) to limit blast radius.
- **Token Protection:** Bind tokens to client via mTLS or DPoP; rotate keys regularly; revoke on compromise.
- **Operational Controls:** Continuously scan for TLS misconfigurations; log handshake errors; pin expected CA chains in infrastructure-as-code.

**Consent Integration:**
Every `$export` request must validate that the requesting entity has documented consent for the specific data types and purposes. The export workflow must check consent flags before including any patient data in the export bundle. Consent validation should be logged as part of the export audit trail.

### BIDS Export Governance

BIDS (Brain Imaging Data Structure) export governance applies specifically to neuroimaging pipelines. While BIDS itself is a data organization standard rather than a transport protocol, export governance for BIDS-formatted data must address:

| Requirement | Implementation |
|---|---|
| De-identification | All DICOM metadata must be scrubbed; facial features in structural MRI must be defaced |
| Data Minimization | Export only the BIDS modalities explicitly consented to |
| File Integrity | Cryptographic checksums (SHA-256) for all exported files |
| Transfer Security | SFTP/HTTPS with client certificates; no unencrypted channels |
| Recipient Verification | Pre-registered and approved research collaborators only |
| Audit Trail | Every file exported logged with timestamp, recipient, and checksum |

### Patient Data Export Consent

Export consent operates under a **granular, purpose-specific model**:

1. **Per-Modality Consent:** Separate consent flags for each data type (radiology, pathology, genomics, neuroimaging, clinical notes).
2. **Per-Purpose Consent:** Distinct consent for treatment, research, quality improvement, and AI model training.
3. **Per-Recipient Consent:** Explicit approval of specific receiving entities or entity categories.
4. **Duration Limits:** Time-bounded consent with automatic expiry and renewal workflows.

Before any export operation, the system must verify that **all three consent dimensions** (modality, purpose, recipient) are satisfied. Partial consent must result in **partial export** (only consented data types) rather than binary allow/deny.

### Cross-Border Data Transfer Rules

Cross-border patient data transfer operates at the intersection of **HIPAA** and **GDPR**, creating dual compliance obligations:

| Aspect | HIPAA | GDPR | DeepSynaps Requirement |
|---|---|---|---|
| Scope | Covered Entities and BAs | Any entity targeting EU data subjects | Apply stricter of both frameworks |
| Consent Model | Authorization for specific uses | Explicit opt-in for health data (Art. 9) | Explicit opt-in + purpose specification |
| Transfer Mechanism | BAA required | SCCs, BCRs, or Adequacy Decision | BAA + SCCs + Transfer Impact Assessment |
| Breach Notification | 60 days to HHS | 72 hours to Supervisory Authority | 72-hour internal triage; notify per strictest timeline |
| Data Subject Rights | Access + Amend | Access + Rectification + Erasure + Portability + Objection to AI | All GDPR rights + HIPAA access/amend |
| Retention | 6-year documentation minimum | No fixed period; purpose limitation | 6-year minimum with purpose review at year 3 |
| Penalties | Tiered civil penalties ($137-$2.067M+ per category) | Up to EUR 20M or 4% global turnover | Budget for maximum exposure under both |

**Transfer Impact Assessment (TIA):** Every cross-border data transfer must include a documented TIA assessing whether U.S. surveillance laws (e.g., FISA 702) compromise the protections guaranteed by SCCs. Supplementary measures (end-to-end encryption, access controls) must be implemented where gaps are identified.

### Export Governance Matrix

| Data Type | Export Format | Consent Required | De-ID Required | Encryption | Audit Level | Retention |
|---|---|---|---|---|---|---|
| Clinical Imaging (DICOM) | FHIR ImagingStudy + DICOMweb | Per-modality, per-purpose | Yes (pixel data scrubbed) | AES-256 at rest, TLS 1.3 in transit | Full - every instance | 7 years |
| Neuroimaging (NIfTI) | BIDS + NIfTI | Per-modality, per-study | Yes (defacing + metadata scrub) | AES-256 at rest, TLS 1.3 in transit | Full - every file | 7 years |
| Clinical Notes | FHIR DocumentReference | Per-document type, per-purpose | Yes (PHI redaction) | AES-256 at rest, TLS 1.3 in transit | Full - every document | 7 years |
| Structured Data (Labs, Vitals) | FHIR Observation Bundle | Per-data-type, per-purpose | Pseudonymization | AES-256 at rest, TLS 1.3 in transit | Full - every resource | 7 years |
| Genomic Data | FHIR Observation + Sequence | Per-modality, per-purpose | Yes (germline masking) | AES-256 at rest, TLS 1.3 in transit | Full - every sequence | 10 years |
| AI Model Training Exports | Custom (anonymized features) | Per-purpose (training) | Full anonymization | AES-256 at rest, TLS 1.3 in transit | Full - every export batch | 7 years |
| Audit Log Exports | Structured JSON/CSV | Operational consent | Pseudonymization | AES-256 at rest, TLS 1.3 in transit | Full - every export | 6 years |

---

## Audit Workflows

### Immutable Audit Trails

Audit logs must be **tamper-evident and append-only**. This is a non-negotiable requirement for clinical AI governance.

**Implementation Requirements:**
- **Write-Once Storage:** Use WORM (Write Once, Read Many) storage, append-only databases, or object storage with Object Lock (e.g., S3 Object Lock in Compliance Mode).
- **Cryptographic Integrity:** Every log entry must include a cryptographic hash linking it to the previous entry (hash chain). Periodically verify checksums.
- **Infrastructure Separation:** Log storage must reside in a separate infrastructure account/project from application systems. A compromised application server must not be able to delete its own audit trail.
- **Separation of Duties:** Application service accounts have **write-only** access (create log entries but not read or modify). Security/compliance teams have **read-only** access. **No one has delete access**.

**Structured Logging Format:**
All audit events must use a consistent schema:
```json
{
  "event_id": "uuid",
  "timestamp": "2026-07-18T14:32:01Z",
  "event_type": "AI_INFERENCE",
  "actor": {"user_id": "clinician_123", "role": "radiologist", "ip": "10.0.1.5"},
  "patient_id_hash": "sha256:abc123...",
  "study_id": "STU-2026-0718-001",
  "action": "ai_analysis_requested",
  "ai_model": {"name": "DeepSynaps-CXR-v3.2.1", "version": "3.2.1", "confidence": 0.94},
  "outcome": "completed",
  "override_recorded": false,
  "consent_verified": true,
  "hash_chain": "sha256:prev_hash+event_data"
}
```

### Audit Log Retention Policies

A **tiered, risk-based retention model** balances detection capability with storage cost:

| Tier | Duration | Storage Class | Access SLA | Use Case |
|---|---|---|---|---|
| Hot (Immediate) | 90 days | Searchable SIEM | < 5 seconds | Real-time monitoring, incident response |
| Warm | 12-24 months | Indexed archive | < 5 minutes | Trend analysis, compliance reviews, access complaints |
| Cold | 3-6 years | Compressed archive | < 24 hours | Regulatory audits, breach investigations |
| Deep Archive | 6+ years (per state law) | Glacier/deep storage | < 48 hours | Litigation hold, long-term regulatory compliance |

**Key Retention Rules:**
- HIPAA mandates a **6-year minimum** for compliance documentation (45 CFR 164.316).
- High-risk systems (EHR, e-prescribing, imaging platforms) should retain **24 months hot + 6 years archived**.
- State laws may impose stricter requirements (e.g., 10 years in Arkansas; until age 30 for minors in North Carolina).
- Destruction after retention must be **controlled, logged, and irreversible**.

### Audit Log Access Controls

| Role | Permission Scope | MFA Required | Justification |
|---|---|---|---|
| Application Service | Write-only | N/A (service account) | Create log entries only |
| Security Analyst | Read-only (all systems) | Yes | Threat detection and incident investigation |
| Compliance Officer | Read-only (filtered by scope) | Yes | Regulatory audit and compliance verification |
| System Administrator | No direct access | N/A | Administers infrastructure but cannot read/modify logs |
| External Auditor | Time-bounded read-only (specific systems) | Yes | Third-party audit with explicit authorization window |
| Security Officer | Read + alert configuration | Yes | Meta-logging and anomaly rule management |

**Meta-Logging Principle:** Access to audit logs must itself be audited. Every query, export, or access to the log store generates a meta-log entry.

### Real-Time Audit Monitoring

Implement automated alerting for the following anomaly patterns:

| Alert Category | Trigger Threshold | Response Time |
|---|---|---|
| Unusual Access Patterns | User accesses >3x their 30-day baseline | < 15 minutes |
| After-Hours PHI Access | Access outside approved shift hours | < 30 minutes |
| Failed Authentication Spikes | >5 failures in 5 minutes from single source | < 5 minutes |
| Bulk Data Exports | Export exceeding 100 records in 1 minute | < 10 minutes |
| Privilege Escalation | Any role change or permission modification | < 5 minutes |
| Geographic Anomalies | Access from unapproved IP ranges/countries | < 15 minutes |
| AI Override Clustering | >3 overrides by same clinician in 1 hour | < 30 minutes |
| Low-Confidence AI Acceptance | Clinician accepts AI output below 70% confidence | < 60 minutes (review queue) |
| Configuration Changes | Any modification to security/audit controls | < 5 minutes |
| Consent Withdrawal | Immediate halt of all related processing | < 60 seconds |

### Audit Anomaly Detection

Anomaly detection should employ both **rule-based** and **ML-based** approaches:

1. **Rule-Based Detection:** Hard thresholds for known bad patterns (e.g., bulk exports, failed logins).
2. **Behavioral Baselines:** Per-user and per-role baselines for access patterns, with statistical deviation alerts.
3. **Cross-System Correlation:** Correlate events across EHR, imaging, AI inference, and access control systems to detect multi-stage attacks.
4. **AI-Specific Anomalies:** Monitor for model drift indicators, unusual inference patterns, and confidence score distribution shifts.

---

## AI Safety Wording Standards

### FDA Guidance on AI/ML SaMD Language

The **FDA 2026 Clinical Decision Support (CDS) Final Guidance** establishes the definitive language framework for clinical AI in the United States.

**Criterion 3 - Non-Device CDS Language (FDA Section 520(o)(1)(E)(ii)):**
To qualify as non-device CDS, software must:
- Provide condition-, disease-, and/or patient-specific information to **enhance, inform, and/or influence** a healthcare decision.
- **Not provide a specific preventive, diagnostic, or treatment output or directive**.
- Be **not intended to replace or direct the HCP's judgment**.

**Criterion 4 - Independent Review (FDA Section 520(o)(1)(E)(iii)):**
Software must enable HCPs to **independently review the basis for recommendations**. This requires:
- Plain language description of the algorithm development and validation.
- Summary of logic or methods (e.g., meta-analysis, statistical modeling, AI/ML techniques).
- Description of training data representativeness (subgroups, disease conditions, collection sites, sex, ethnicity).
- Clinical validation study results including sub-population performance.

**FDA-Preferred Language Pattern:**
> "This software provides [information/recommendations] for [HCP type] to consider when making [type of clinical decision]. The [HCP type] should independently review the basis for these recommendations, consider all patient-specific factors, and apply their clinical judgment before making any treatment decision."

### EU AI Act Requirements

The **EU AI Act (Regulation 2024/1689)** imposes additional transparency and wording requirements on high-risk AI systems in healthcare:

**Article 13 - Transparency Obligations:**
- Users must be **explicitly informed** that they are interacting with an AI system.
- Instructions for use must explain the system's **intended purpose, limitations, and required human oversight processes**.
- Key performance metrics (accuracy, known biases) must be disclosed.

**Article 26 - Human Oversight (Deployer Obligations):**
- Clinical AI must **support, not replace, clinical judgement**.
- The clinician must be the **final decision-maker**.
- Deployers must document which clinician reviews AI output, what training they received, how they override AI, and what happens when AI and clinician disagree.

**Article 10 - Data Governance:**
- Training, validation, and testing data must be **relevant, representative, and as error-free as possible**.
- Data quality must be continuously monitored.

### "Decision Support Only" Standards

Clinical AI interfaces must consistently communicate the **decision-support** nature of outputs:

| Element | Required Language |
|---|---|
| System Label | "Clinical Decision Support" or "AI-Assisted Analysis" |
| Output Header | "Recommendation for Review" or "Suggested Finding" |
| Confidence Display | "Confidence Score: X% - For Consideration Only" |
| Action Required | "Clinician Review Required" |
| Disclaimer | "This AI output does not replace clinical judgment. Final diagnosis requires independent clinical evaluation." |
| Override Option | Clearly visible "Override/Disagree" button with required reason capture |
| Reference Information | Link to evidence basis, training data summary, and model validation results |

### Confidence Communication Best Practices

Confidence scores must be communicated transparently but responsibly:

1. **Numerical + Visual:** Display confidence as both a percentage and a visual indicator (color-coded bar).
2. **Contextual Thresholds:** Define what different confidence ranges mean for the specific clinical task:
   - **90-100%:** High confidence - review recommended but likely consistent with AI finding.
   - **70-89%:** Moderate confidence - careful independent review required.
   - **50-69%:** Low confidence - strong recommendation for independent evaluation.
   - **Below 50%:** Insufficient confidence - AI finding should not be relied upon.
3. **Calibration Disclosure:** State whether confidence scores are calibrated to actual probability.
4. **Uncertainty Quantification:** Where available, display uncertainty ranges or confidence intervals.
5. **No Binary Outcomes:** Avoid presenting AI outputs as definitive yes/no clinical conclusions.

### Forbidden Language List

The following language is **strictly prohibited** in all clinical AI interfaces, labeling, and documentation:

| Prohibited Phrase | Required Replacement | Rationale |
|---|---|---|
| "The AI diagnoses..." | "The AI suggests..." or "This analysis indicates..." | AI does not make diagnoses; clinicians do |
| "AI-recommended treatment" | "Treatment options for clinician consideration" | Treatment decisions require clinical judgment |
| "Replace your doctor" | "Support your clinical team" | Undermines HCP authority and patient trust |
| "100% accurate" / "Foolproof" | "Validated on [dataset] with [metric] performance" | Absolute accuracy claims are misleading |
| "No human review needed" | "Human review always required" | Violates FDA Criterion 3 and EU AI Act Art. 26 |
| "Autonomous diagnosis" | "AI-assisted analysis requiring clinical review" | Autonomous clinical decisions are prohibited |
| "The patient has [condition]" | "Analysis suggests possible [condition]" | Definitive statements without clinical correlation |
| "Override not recommended" | "Override requires documentation of clinical reasoning" | Discouraging override violates HCP autonomy |
| "AI-confirmed" | "AI-flagged for clinician confirmation" | Confirmation requires human judgment |
| "Final report" (AI-only) | "Draft for clinician review and finalization" | AI outputs are drafts, not final reports |
| "Eliminates diagnostic error" | "May assist in identifying findings" | Overstatement of AI capabilities |
| "FDA-approved" (for CDS software) | "FDA-cleared" or "Non-device CDS per 520(o)(1)(E)" | CDS software uses different regulatory pathways |
| "Better than a radiologist" | "Performance characteristics on validation dataset" | Comparative superiority claims are unsubstantiated |
| "Immediate action required" (AI-initiated) | "Urgent review recommended" (clinician-initiated) | AI should not dictate urgency without HCP assessment |
| "Standard of care" | "Evidence-based recommendations" | "Standard of care" is a legal term requiring peer validation |

---

## Consent Management

### Consent Architecture

Consent management must be implemented as a **foundational infrastructure layer**, not a frontend feature. This means:

- **Standalone Consent Service:** Separate data store, API, and versioning system. Not embedded in user authentication.
- **Event-Driven Propagation:** When consent status changes, events publish to all dependent services, triggering appropriate data handling workflows.
- **Audit-Ready Logging:** Every consent interaction is logged with sufficient detail to satisfy supervisory authority investigation.
- **Consent-Aware Pipelines:** ETL, analytics, and AI training pipelines check consent status before processing any health data records.

### Granular Consent Model

Implement consent as a **set of independent flags**, not a single boolean:

```
Consent Dimensions:
├── Data Modality
│   ├── radiology_imaging
│   ├── pathology_imaging
│   ├── neuroimaging
│   ├── clinical_notes
│   ├── structured_labs
│   ├── genomics
│   └── wearable_device_data
├── Processing Purpose
│   ├── direct_patient_care
│   ├── ai_clinical_decision_support
│   ├── ai_model_training (anonymized)
│   ├── quality_improvement
│   ├── clinical_research
│   └── population_health_analysis
├── Data Recipient Category
│   ├── treating_clinicians
│   ├── affiliated_researchers
│   ├── external_research_partners
│   ├── ai_system_operators
│   └── public_health_authorities
└── Temporal & Geographic Constraints
    ├── expiry_date
    ├── geographic_restriction (e.g., EU only)
    └── data_residency_requirement
```

Each flag operates independently. A patient may consent to AI clinical decision support for radiology imaging but decline the same for genomics. The data processing pipeline must check the **relevant consent flag before each operation**.

### Consent Model Recommendations

| Recommendation | Implementation | Regulatory Basis |
|---|---|---|
| **Explicit Opt-In** | No pre-checked boxes; no bundled consent; granular per-purpose selection | GDPR Art. 9, HIPAA Authorization |
| **Separate Consent for AI** | Distinct consent flag for AI processing, separate from treatment consent | EU AI Act Art. 10, GDPR DPIA requirement |
| **Plain Language** | Consent descriptions at 8th-grade reading level; no legal jargon | FDA CDS Criterion 4, GDPR transparency principle |
| **Visual Consent Dashboard** | Patient-facing portal showing all active consents, with easy modification | GDPR Art. 12-14, patient engagement best practices |
| **Versioning** | Every consent change creates a new version; full audit trail of consent history | HIPAA documentation requirements |
| **Regular Re-Confirmation** | Annual re-confirmation for research/training consent; event-driven for clinical | GDPR purpose limitation principle |
| **Child/Guardian Consent** | Separate workflow for minors requiring guardian consent + assent | GDPR Art. 8, state minor consent laws |
| **Emergency Override** | Documented emergency treatment exception with post-hoc consent workflow | HIPAA emergency treatment exception |

### Consent Withdrawal Handling

When a user withdraws consent, the following sequence must execute within defined SLAs:

| Step | Action | SLA | Responsible System |
|---|---|---|---|
| 1 | Halt all related data processing immediately | < 60 seconds | Consent Service Event Bus |
| 2 | Delete or anonymize the data | < 24 hours | Data Pipeline Service |
| 3 | Notify all downstream processors/partners | < 4 hours | Consent Propagation API |
| 4 | Retain the consent record (consent + withdrawal) | Permanent | Compliance Archive |
| 5 | Confirm withdrawal to user with full audit trail | < 24 hours | Patient Portal |
| 6 | Update AI training datasets to exclude withdrawn data | < 72 hours | ML Pipeline Service |
| 7 | Verify completion via compliance check | < 7 days | Compliance Monitoring |

**Important:** The record of consent (and its withdrawal) must be retained for compliance purposes even after the underlying data is deleted. This is a non-negotiable audit requirement.

### Regulatory Consent Requirements Summary

| Regulation | Consent Requirement | Health Data Classification | Penalty for Non-Compliance |
|---|---|---|---|
| **GDPR** | Explicit opt-in for special category data (Art. 9) | Special Category Data | Up to EUR 20M or 4% global turnover |
| **HIPAA** | Authorization for uses beyond TPO | Protected Health Information (PHI) | $137 - $2.067M+ per violation category |
| **EU AI Act** | Data governance for training/validation (Art. 10) | High-risk system input data | Up to EUR 35M or 7% global turnover |
| **FDA 21 CFR Part 50** | Informed consent for clinical investigations | Research subject data | Enforcement action, study disqualification |
| **State Laws** | Varies by state (e.g., CCPA, state health privacy laws) | May be broader than HIPAA | Varies by state |

---

## Clinician Review Systems

### Review Workflow Design

The human-in-the-loop (HITL) workflow must be designed as a **core system feature from day one**, not retrofitted:

**Stage 1: AI Analysis Generation**
- AI system generates analysis with confidence score, evidence basis, and patient-specific context.
- All inputs, model version, and intermediate steps are logged to the immutable audit trail.
- Output is marked as "Pending Clinical Review" and queued for the appropriate clinician.

**Stage 2: Clinician Review Assignment**
- Assignment based on: specialty match, workload balancing, and required qualification for the study type.
- Routing rules: High-confidence, low-risk findings -> standard queue. Low-confidence or high-risk findings -> priority queue.
- Escalation: Unreviewed critical findings trigger escalation after defined time thresholds.

**Stage 3: Clinician Review Interface**
- Display AI output with full context: original imaging/data, confidence score, evidence basis, model limitations, and patient history.
- Provide three disposition options: **Accept**, **Modify**, or **Override**.
- Override requires a **mandatory reason** from a standardized reason code list plus free-text elaboration.
- Time-to-review metrics tracked and reported.

**Stage 4: Documentation and Finalization**
- All review actions (accept/modify/override) are logged to the immutable audit trail.
- Modified or overridden outputs retain the original AI output + clinician modification + reason.
- Finalized report includes both AI contribution and clinician attestation.
- Feedback loop: override reasons feed into model improvement evaluation sets.

### Override Documentation

Every AI override must capture the following data elements:

| Field | Description | Example Values |
|---|---|---|
| `override_id` | Unique identifier | UUID |
| `original_ai_output` | Full text of AI finding | "Possible pulmonary nodule, 8mm, right upper lobe" |
| `override_type` | Category of override | "disagree", "clarify", "add_context", "insufficient_evidence" |
| `override_reason_code` | Standardized reason | "false_positive", "clinical_context_missing", "better_alternative_dx", "insufficient_quality" |
| `override_reason_text` | Free-text explanation | "No nodule visible on comparison imaging from 2024" |
| `clinician_id` | Reviewing clinician identifier | "rad_9876" |
| `clinician_credentials` | Board certification, years of experience | "Board-certified radiologist, 12 years" |
| `review_duration_seconds` | Time spent reviewing | 245 |
| `additional_tests_ordered` | Whether follow-up was triggered | "CT_chest_recommended" |
| `timestamp` | When override occurred | "2026-07-18T14:45:22Z" |
| `ai_model_version` | Model at time of analysis | "DeepSynaps-CXR-v3.2.1" |

### Review Audit Requirements

| Audit Element | Frequency | Responsible Party | Documentation |
|---|---|---|---|
| Override rate by clinician | Monthly | Quality Assurance | Dashboard + trend analysis |
| Override rate by AI model version | Per-release | ML Engineering | Model performance report |
| Time-to-review distribution | Weekly | Operations | SLA compliance report |
| Inter-reviewer agreement (kappa) | Quarterly | Clinical Governance | Calibration study |
| Escalation frequency and reasons | Monthly | Clinical Governance | Escalation log |
| Downstream incidents tied to missed reviews | Per-incident | Risk Management | Root cause analysis |
| AI model drift vs. override patterns | Continuous | ML Engineering | Automated monitoring |

### Liability Considerations

Physicians face **dual liability risk** with clinical AI:

**Liability from Using AI:**
- **Automation bias:** Over-reliance on AI recommendations when clinical signs contradict them constitutes negligence.
- **AI hallucinations:** Accepting LLM-generated clinical guidance without verification carries malpractice exposure.
- **Black box decisions:** Inability to explain why AI made a recommendation does not excuse the physician from explaining their clinical decision.

**Liability from NOT Using AI:**
- As AI becomes standard practice, failure to adopt validated tools may constitute negligence.
- Plaintiff attorneys are already asking: *"A validated AI tool existed that could have caught this. Why didn't you use it?"*

**Mitigation Strategies:**
1. **Always verify AI outputs** through independent clinical judgment.
2. **Document your reasoning** whether you follow or override AI.
3. **Use only FDA-cleared AI** for clinical decisions (avoid experimental AI).
4. **Monitor specialty standards** through society guidelines and peer practice.
5. **Verify malpractice insurance** explicitly covers AI-assisted clinical decisions.
6. **Mandatory override documentation** for every disagreement with AI output.

### Best Practices for Human-in-the-Loop AI

| Practice | Implementation Detail |
|---|---|
| **Design HITL from Day One** | Define review triggers, routing rules, and escalation paths in initial product requirements |
| **Confidence-Based Routing** | High-confidence, low-risk cases -> standard queue. Low-confidence or high-stakes -> human review |
| **Reviewer Playbooks** | Standardized rubrics with real examples and edge cases; "approve if" and "reject if" guidance |
| **Reason Codes** | Standardized override reasons that become structured training data for model improvement |
| **Calibration Sessions** | Weekly alignment sessions on tricky cases to ensure inter-reviewer consistency |
| **Sampling Audits** | Periodic senior reviewer spot-checks of "approved" cases for quality assurance |
| **Feedback Loops** | Human review scores feed evaluation sets; measure whether model changes improve outcomes |
| **Reviewer Fatigue Monitoring** | Track review times and agreement rates; adjust workload to prevent burnout |
| **Escalation Paths** | Clear chain: Reviewer -> Senior Reviewer -> Department Lead -> Medical Director |
| **Continuous Monitoring** | Track: override rate, time-to-review, reviewer agreement, escalation frequency, downstream incidents |

---

## Regulatory Alignment (FDA/EU)

<!-- TODO: clinical-governance review required against current main -->
<!-- "Status" column values (Compliant / In Progress / Planned / Ongoing) are
     aspirational assertions that have not been verified against the current
     codebase or any external audit.  Do not cite these statuses in regulatory
     filings without independent verification. -->

### FDA Alignment Summary

| FDA Requirement | DeepSynaps Implementation | Status |
|---|---|---|
| CDS Software Criterion 3 - Not replace HCP judgment | All outputs labeled "for review"; override always available | Compliant |
| CDS Software Criterion 4 - Enable independent review | Evidence basis, validation summary, and model limitations displayed | Compliant |
| Predetermined Change Control Plans (PCCP) | Documented model update procedures with validation gates | Planned |
| Software as Medical Device (SaMD) classification | Classified per intended use; regulatory pathway defined | In Progress |
| Digital Health Advisory Committee input | Monitor DHAC guidance updates | Ongoing |
| Human factors / usability | HITL workflow validated with clinical users | Planned |

### EU AI Act Alignment Summary

| EU AI Act Requirement | DeepSynaps Implementation | Enforcement Date |
|---|---|---|
| **Article 5** - Prohibited Practices (8 categories) | Screened against all 8 prohibited categories; no overlap identified | Active since Feb 2025 |
| **Article 10** - Data Governance | Training data documented, representative, quality-controlled | Per system deployment |
| **Article 11** - Technical Documentation | Comprehensive technical file per Annex IV template | Per system deployment |
| **Article 12** - Logging (functional traceability) | Automated logging of model outputs, versions, pipeline actions | Per system deployment |
| **Article 13** - Transparency to users | Clear instructions, limitations, performance metrics disclosed | Per system deployment |
| **Article 26** - Human oversight (deployer obligations) | Documented review workflow, clinician training, override procedures | Aug 2026 (Annex III) / Aug 2027 (Annex I) |
| **Article 4** - AI Literacy | Tool-specific training for all clinical staff using AI | Active since Feb 2025 |
| **Article 62** - Incident Reporting | Triple-reporting playbook: MSA + MDR competent authority + DPA | Per enforcement timeline |
| **Conformity Assessment** | Integrated with MDR/IVDR process for Annex I systems | Per product timeline |

### Triple Incident Reporting Burden

A single AI failure involving patient data can trigger **three separate notification obligations**:

1. **AI Act Article 62:** Report to national market surveillance authority.
2. **MDR/IVDR:** Report to national competent authority for medical devices.
3. **GDPR Article 33:** Report to data protection authority (if personal data breach).

**Required:** An incident response playbook that branches at first assessment: *"Is it a PHI breach? -> Follow HIPAA. Is it an AI system failure? -> Follow AI Act + MDR. Is it a personal data breach? -> Follow GDPR."*

---

## DeepSynaps Governance Recommendations

### Immediate Actions (0-30 Days)

1. **Implement the Forbidden Language List** across all AI interfaces, documentation, and labeling.
2. **Deploy Granular Consent Flags** for all data modalities and processing purposes.
3. **Establish Immutable Audit Logging** with append-only storage and cryptographic integrity.
4. **Document HITL Workflow** with defined review triggers, routing rules, and escalation paths.
5. **Screen All AI Use Cases** against EU AI Act Article 5 prohibited practices.

### Short-Term Actions (30-90 Days)

1. **Conduct Transfer Impact Assessment (TIA)** for all cross-border data transfers.
2. **Implement Real-Time Audit Monitoring** with automated alerting for the 10 critical anomaly patterns.
3. **Deploy Consent Withdrawal Pipeline** with defined SLAs for data deletion and downstream notification.
4. **Establish Override Documentation System** with standardized reason codes and free-text capture.
5. **Create Triple Incident Reporting Playbook** covering AI Act, MDR, and GDPR notification requirements.

### Medium-Term Actions (90-180 Days)

1. **Build Consent Dashboard** for patient-facing consent management and visualization.
2. **Implement Behavioral Anomaly Detection** for cross-system audit correlation.
3. **Establish AI Literacy Training Program** (required under EU AI Act Article 4).
4. **Complete Technical Documentation** per EU AI Act Annex IV template.
5. **Validate HITL Workflow** through pilot with real reviewers and real clinical tasks.

### Long-Term Actions (180+ Days)

1. **Achieve Integrated MDR/AI Act Conformity Assessment** for Annex I systems.
2. **Implement Federated Learning** for privacy-preserving multi-site model training.
3. **Establish Interactive Explainability Tools** allowing clinicians to probe AI reasoning dynamically.
4. **Pursue External Audit Certification** from recognized clinical AI governance body.
5. **Continuous Regulatory Monitoring** - track FDA, EU, and state regulatory developments with automated update alerts.

---

## Risk Assessment

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|
| Clinician automation bias leading to patient harm | Medium | Critical | Mandatory override documentation; confidence thresholds; calibration training | Low |
| Non-compliant cross-border data transfer | Medium | Critical | BAA + SCCs + TIA for all transfers; automated compliance checks | Low |
| Audit log tampering or deletion | Low | Critical | Immutable storage; separation of duties; cryptographic integrity | Very Low |
| Use of prohibited language in AI interface | Medium | High | Forbidden language list; automated content validation; QA review | Low |
| Consent withdrawal not propagated | Low | High | Event-driven architecture; SLA monitoring; verification checks | Very Low |
| AI model failure undetected | Medium | Critical | Real-time monitoring; drift detection; HITL review; override analysis | Low |
| Regulatory enforcement action (FDA/EU) | Low | Critical | Full regulatory alignment program; external legal review; conformity assessment | Low |
| Liability from AI-assisted clinical decision | Medium | High | Override documentation; insurance verification; HITL workflow; FDA-cleared AI only | Low |
| Patient data breach during export | Low | Critical | Encryption at rest/transit; access controls; audit logging; breach response plan | Very Low |
| Failure to meet AI literacy requirements | Medium | Medium | Tool-specific training program; competency verification; documentation | Low |

### Penalty Exposure Summary

| Regulation | Maximum Penalty | DeepSynaps Exposure |
|---|---|---|
| EU AI Act Article 5 (Prohibited Practices) | EUR 35M or 7% global turnover | High - must screen all systems |
| EU AI Act High-Risk Non-Compliance | EUR 15M or 3% global turnover | Medium - ongoing compliance program |
| GDPR Violation | EUR 20M or 4% global turnover | Medium - dual HIPAA/GDPR compliance |
| HIPAA Violation | $2.067M+ per violation category | Low-Medium - established compliance program |
| FDA Enforcement | Warning letter + consent decree + product seizure | Low - regulatory pathway defined |
| State Privacy Laws | Varies (up to $7,500 per violation under CCPA) | Low - state law mapping complete |

---

## Appendices

### Appendix A: Glossary

| Term | Definition |
|---|---|
| **HITL** | Human-in-the-Loop: AI workflow design incorporating mandatory human review |
| **SaMD** | Software as Medical Device: software regulated under medical device frameworks |
| **CDS** | Clinical Decision Support: software providing information to inform clinical decisions |
| **PHI** | Protected Health Information: individually identifiable health information under HIPAA |
| **SCCs** | Standard Contractual Clauses: GDPR-authorized contractual mechanism for cross-border transfers |
| **TIA** | Transfer Impact Assessment: evaluation of data protection risks in cross-border transfers |
| **BAA** | Business Associate Agreement: HIPAA-required contract for PHI handling |
| **DPA** | Data Processing Agreement: GDPR-required contract for processor relationships |
| **ROPA** | Record of Processing Activities: GDPR Article 30 documentation requirement |
| **DPIA** | Data Protection Impact Assessment: GDPR-required risk assessment for high-risk processing |
| **PCCP** | Predetermined Change Control Plan: FDA framework for planned AI model updates |
| **MDR** | Medical Device Regulation: EU Regulation 2017/745 |
| **IVDR** | In Vitro Diagnostic Regulation: EU Regulation 2017/746 |

### Appendix B: References

1. FDA, "Clinical Decision Support Software - Final Guidance" (January 2026), [^300^](https://www.fda.gov/media/191561/download)
2. EU Regulation 2024/1689 - Artificial Intelligence Act
3. HIPAA Security Rule (45 CFR Part 160 and Subparts A and C of Part 164)
4. GDPR Regulation (EU) 2016/679, Articles 9, 25, 30, 32, 33, 35
5. EU AI Act Article 5 - Prohibited AI Practices [^335^](https://euaicompass.com/article-5-prohibited-ai-practices-explained.html)
6. EU AI Act Healthcare Guide [^285^](https://euaicompass.com/eu-ai-act-for-healthcare.html)
7. Physician AI Liability Handbook [^292^](https://physicianaihandbook.com/implementation/liability.html)
8. Momentum AI, "GDPR Consent Requirements for Health Data" [^299^](https://www.themomentum.ai/blog/gdpr-consent-requirements-health-data)
9. Swept AI, "AI Audit Trail: Compliance, Accountability & Evidence" [^284^](https://www.swept.ai/ai-audit-trail)
10. Accountable HQ, "HIPAA Security Rule Audit Log Retention Period" [^296^](https://www.accountablehq.com/post/hipaa-security-rule-audit-log-retention-period-how-long-to-keep-logs)
11. Arnold & Porter, "FDA Cuts Red Tape on Clinical Decision Support Software" (January 2026) [^306^](https://www.arnoldporter.com/en/perspectives/advisories/2026/01/fda-cuts-red-tape-on-clinical-decision-support-software)
12. Hardian Health, "FDA's 2026 CDS Guidance Update" [^298^](https://www.hardianhealth.com/insights/fda-2026-clinical-decision-support-c-guidance-update)
13. eInfochips, "AI Regulation in Medical Devices: FDA & EU AI Act" [^289^](https://www.einfochips.com/blog/ai-regulation-in-medical-devices-balancing-innovation-and-compliance-under-the-fda-and-eu-ai-act/)
14. Product School, "Human-in-the-Loop: How Oversight Drives AI Quality" [^286^](https://productschool.com/blog/artificial-intelligence/human-in-the-loop-ai)
15. Comet ML, "Human-in-the-Loop Review Workflows for LLM Apps" [^290^](https://www.comet.com/site/blog/human-in-the-loop/)

---

*End of Document*

> **Document Control:**
> - Version: 1.0.0
> - Last Updated: 2026-07-18
> - Next Review: 2026-10-18
> - Owner: DeepSynaps Clinical Governance Committee
> - Distribution: Internal - Protocol Studio Engineering, Legal, Clinical Affairs
