# MRI AI Safety & Governance Report
## Comprehensive Regulatory, Safety, and Operational Framework for AI-Assisted Radiology

**Version:** 1.0  
**Date:** July 2025  
**Domain:** MRI / Neuroimaging / AI-Assisted Radiology  
**Classification:** Research & Reference Document  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [FDA Guidance on Radiology AI](#2-fda-guidance-on-radiology-ai--samd--premarket-pathways)
3. [EU MDR for AI Imaging](#3-eu-mdr-for-ai-imaging)
4. [Health Canada Guidance](#4-health-canada-guidance)
5. [False Positive / Negative Management](#5-false-positive--negative-management)
6. [Urgent Findings Governance](#6-urgent-findings-governance)
7. [Reporting Limitations and Safe Language](#7-reporting-limitations-and-safe-language)
8. [PHI in DICOM Metadata - De-identification](#8-phi-in-dicom-metadata--de-identification)
9. [Clinician / Radiologist Review Requirements](#9-clinician--radiologist-review-requirements)
10. [Human-in-the-Loop Requirements](#10-human-in-the-loop-requirements)
11. [Bias and Fairness in Neuroimaging AI](#11-bias-and-fairness-in-neuroimaging-ai)
12. [Health Equity Considerations](#12-health-equity-considerations)
13. [CE Marking for AI Radiology](#13-ce-marking-for-ai-radiology)
14. [TGA Guidance](#14-tga-guidance)
15. [Regulatory Sandbox Approaches](#15-regulatory-sandbox-approaches)
16. [Quality Assurance for AI Imaging](#16-quality-assurance-for-ai-imaging)
17. [Top 20 Safety Rules](#17-top-20-safety-rules)
18. [Appendix: Safe Language Reference](#18-appendix-safe-language-reference)
19. [References](#19-references)

---

## 1. Executive Summary

AI-enabled medical imaging has transitioned from experimental proof-of-concept to regulated clinical products with remarkable speed. As of late 2024, the FDA had authorized over **1,000 AI/ML-enabled medical devices**, with radiology dominating at **74.4%** of all clearances. All 168 AI/ML devices cleared by the FDA in 2024 were classified as **Class II (moderate-risk)** devices, cleared via 510(k) (94.6%) or De Novo (5.4%) pathways. No Class III (high-risk, PMA) AI/ML SaMD has been authorized to date.

This report provides a comprehensive framework covering:
- **Regulatory pathways** across FDA, EU MDR, Health Canada, TGA, and emerging frameworks
- **Clinical safety governance** including false positive/negative management and urgent findings
- **Data governance** including DICOM PHI de-identification and HIPAA/GDPR compliance
- **Human oversight** requirements including clinician review and human-in-the-loop mandates
- **Equity and bias** considerations specific to neuroimaging AI
- **Quality assurance** frameworks including the ACR Assess-AI registry

**Key Insight:** The regulatory landscape is rapidly converging around principles of risk-based classification, total product lifecycle oversight, mandatory human oversight, transparency, and post-market performance monitoring. Organizations deploying MRI AI must navigate multi-jurisdictional requirements while maintaining rigorous clinical governance.

---

## 2. FDA Guidance on Radiology AI -- SaMD, Premarket Pathways

### 2.1 Software as a Medical Device (SaMD) Classification

The FDA regulates AI/ML-based Software as a Medical Device (SaMD) under the same risk-based framework as all medical devices. AI/ML algorithms used in clinical care generally qualify as SaMD unless explicitly exempted (e.g., administrative tools, basic wellness apps).

| FDA Device Class | Risk Description | Regulatory Pathway | Example AI/ML SaMD |
|---|---|---|---|
| **Class I** | Low risk (general wellness, specimen handling) | Usually exempt; if not exempt -> 510(k) | Basic image viewers, wellness apps (enforcement discretion) |
| **Class II** | Moderate risk (diagnosis, monitoring) | 510(k) clearance or De Novo | IDx-DR (diabetic retinopathy), Viz ICH Plus, Lunit INSIGHT CXR |
| **Class III** | High risk (life-sustaining support) | PMA (Premarket Approval) | None authorized to date as pure AI/ML SaMD |

### 2.2 Premarket Pathways

**510(k) Premarket Notification:** The most commonly used pathway. Requires demonstrating **"substantial equivalence" (SE)** to a predicate device. In 2024, 94.6% of AI/ML devices were cleared via 510(k). Median clearance time: ~142 days (4.5 months).

**De Novo Classification:** For novel devices without a predicate. 5.4% of AI/ML devices in 2024. Establishes a new device classification. Average review: 10-11 months.

**PMA (Premarket Approval):** Required for Class III devices. Full evidence of safety and effectiveness. No pure AI/ML SaMD has required PMA to date.

### 2.3 Total Product Lifecycle (TPLC) Approach

The FDA's oversight has evolved toward total product lifecycle management:

- **January 2021:** AI/ML SaMD Action Plan published
- **October 2021:** Good Machine Learning Practice (GMLP) Guiding Principles (joint FDA, Health Canada, MHRA)
- **April 2023:** Draft PCCP Guidance
- **June 2024:** Transparency for ML-Enabled Medical Devices: Guiding Principles
- **December 2024:** Final PCCP Guidance

### 2.4 Predetermined Change Control Plans (PCCP)

A PCCP enables manufacturers to define anticipated algorithm modifications upfront, specifying:
- **Pre-specifications:** What may be changed (e.g., performance, inputs)
- **Algorithm Change Protocol:** How changes are managed and validated

This mechanism allows pre-specified algorithm updates without new submissions, enabling continuous learning while maintaining regulatory oversight.

### 2.5 Good Machine Learning Practice (GMLP) - 10 Guiding Principles

| Principle | Description |
|---|---|
| 1. Multi-Disciplinary Expertise | Diverse expertise across the product lifecycle |
| 2. Good Software Engineering | Robust engineering, data QA, cybersecurity |
| 3. Representative Data | Training data reflecting intended patient population |
| 4. Independence of Datasets | Training and test data kept independent |
| 5. Best Reference Datasets | Clinically relevant, well-characterized reference data |
| 6. Model Design Aligned | Design appropriate for data and clinical use |
| 7. Human-AI Team Performance | Optimized human-AI interaction in clinical settings |
| 8. Clinically Relevant Testing | Testing under real-world clinical conditions |
| 9. Clear User Information | Transparent labeling about intended use, limitations |
| 10. Deployed Model Monitoring | Continuous monitoring with re-training risk management |

---

## 3. EU MDR for AI Imaging

### 3.1 Regulatory Framework

Under EU MDR (Regulation (EU) 2017/745), AI imaging software qualifies as a medical device when intended for diagnosis, prevention, monitoring, prediction, or treatment of disease.

**Rule 11** is the main classification rule for medical software under EU MDR. Most SaMD falls into **Class IIa, IIb, or III** because software often influences diagnosis or treatment decisions.

| Class | Description | Examples |
|---|---|---|
| Class I | Low risk | Wellness apps, specimen handling software |
| Class IIa | Low-moderate risk | Software generating 3D models from scans |
| Class IIb | Moderate-high risk | Diagnosis of emphysema from tomography |
| Class III | High risk | Melanoma screening app, robotic surgical software |

### 3.2 EU AI Act (Regulation (EU) 2024/1689)

The EU AI Act introduces a **dual compliance framework** for AI-enabled medical devices:
- AI medical devices classified as MDR Class IIa or higher generally qualify as **high-risk AI systems**
- Dual CE marking required: under both AI Act and EU MDR/IVDR
- Single conformity assessment by the same Notified Body where possible

**Key Deadlines:**
- February 2025: Prohibitions on unacceptable-risk AI; AI literacy obligations
- August 2025: General-purpose AI model obligations
- August 2026: Core high-risk AI obligations (conformity assessment, human oversight)
- August 2027: Extended transition for MDR/IVDR-regulated AI systems

### 3.3 EU AI Act Requirements for High-Risk MDAI

| Requirement | Description |
|---|---|
| Risk Management System | Continuous risk assessment (Art. 9) |
| Data Governance | High-quality, representative, unbiased datasets (Art. 10) |
| Technical Documentation | Comprehensive design, development, and performance records (Art. 11) |
| Record Keeping | Automatic logging of operations (Art. 12) |
| Transparency | Clear information to deployers about capabilities and limitations (Art. 13) |
| Human Oversight | Designed-in ability for humans to monitor, override, or stop outputs (Art. 14) |
| Accuracy, Robustness, Cybersecurity | Validated performance and security measures (Art. 15) |
| Quality Management System | QMS aligned with MDR and AI Act (Art. 17) |
| Post-Market Monitoring | Continuous performance surveillance (Art. 72) |
| Incident Reporting | Serious incidents reported within 15 days (Art. 73) |

---

## 4. Health Canada Guidance

### 4.1 SaMD Classification

Health Canada's 2019 Guidance "Software as a Medical Device (SaMD): Definition and Classification" clarifies:
- AI/ML SaMD is regulated based on **intended purpose**, not the presence of AI
- Classification follows risk-based rules aligned with the EU framework
- Manufacturers must determine if software is a medical device, its risk class, and applicable conformity assessment

### 4.2 Classification Examples

| Software Product | Determination |
|---|---|
| Risk calculator based on well-established, publicly available models | **Not a medical device** |
| Picture Archiving and Communication System (PACS) | **Not a medical device** |
| Software classifying screening mammography into BI-RADS density categories | **Class II medical device** |
| Software performing image analysis for detection of intracranial hemorrhage | **Class III medical device** |

### 4.3 Pre-market Guidance for ML-Enabled Medical Devices

Health Canada's guidance is structured around the iterative MLMD lifecycle:
1. **Predetermined Change Control Plan (PCCP):** Pre-specified modifications and change protocols
2. **License Terms and Conditions:** Ongoing safety and effectiveness requirements
3. **Continuous Monitoring:** Post-market performance surveillance

Health Canada was one of the three agencies (with FDA and MHRA) that issued the GMLP guiding principles in 2021.

---

## 5. False Positive / Negative Management

### 5.1 Understanding the Safety Impact

AI algorithms in radiology operate on a spectrum of diagnostic certainty. Managing false positives (FP) and false negatives (FN) is critical to patient safety:

| Error Type | Clinical Impact | Priority |
|---|---|---|
| **False Negative** (AI misses a real finding) | Delayed diagnosis, missed treatment window, potential harm | CRITICAL |
| **False Positive** (AI flags normal as abnormal) | Unnecessary procedures, patient anxiety, increased costs, follow-up burden | HIGH |
| **Overcall on triage** | Resource diversion from truly urgent cases | HIGH |
| **Undercall on triage** | Delayed care for emergent findings | CRITICAL |

### 5.2 Management Strategies

**1. Local Validation Before Deployment:**
AI algorithms trained on external datasets must be validated against the institution's specific patient population, imaging protocols, and scanner configurations. Sensitivity and specificity should be measured locally before go-live.

**2. Tiered Triage Protocols:**
Define how AI priority scores translate into operational actions:
- **Immediate escalation:** Radiologist paged within 5 minutes
- **Urgent queue routing:** Read within 30 minutes
- **Priority read:** Read within 2 hours
- **Routine scheduling:** Standard workflow

**3. Override and Override Rate Monitoring:**
- Track radiologist override rates for AI priority scores
- Override rates >15-20% may indicate poor calibration
- Quarterly audits of model performance as patient populations evolve

**4. Discordance Detection:**
- Implement auxiliary QA AI models to detect discordance between the radiologist's report and the AI model
- Flag cases with high discrepancy for secondary review

**5. Stop Rules and Performance Thresholds:**
- Define minimum acceptable sensitivity/specificity thresholds
- Implement automated alerts when local performance drifts below thresholds
- Maintain capability to deactivate AI tools when performance is unacceptable

### 5.3 Key Metrics for FP/FN Monitoring

| Metric | Target | Monitoring Frequency |
|---|---|---|
| Sensitivity (true positive rate) | >=90% for critical findings | Weekly |
| Specificity (true negative rate) | >=85% | Weekly |
| Positive Predictive Value | >=70% | Monthly |
| Negative Predictive Value | >=98% for critical findings | Monthly |
| False Negative Rate | <2% for critical findings | Weekly |
| Radiologist Override Rate | 5-15% | Monthly |
| Time to critical result communication | <15 minutes | Real-time |

---

## 6. Urgent Findings Governance

### 6.1 Critical Finding Communication Requirements

Urgent findings governance ensures that AI-flagged critical results trigger appropriate clinical action within defined timeframes. Pennsylvania's ACT 112 (Patient Test Result Information Act) exemplifies legislative requirements mandating direct patient communication when "significant abnormalities" are found.

### 6.2 AI Triage Workflow for Urgent Findings

| Workflow Stage | Without AI | With AI Optimization | Time Saved |
|---|---|---|---|
| Queue prioritization | Manual or FIFO | Automated real-time triage | 15-60 min per urgent study |
| Critical finding notification | Post-read radiologist call | Automated pre-read alert | 20-45 min average |
| Report structuring | Free-text dictation | AI-pre-populated templates | 5-12 min per report |
| Prior comparison | Manual retrieval | AI auto-comparison with deltas | 3-8 min per study |

### 6.3 Governance Framework for Urgent Findings

**1. Tiered Communication Protocols:**
- **Critical (Life-threatening):** Immediate notification to ordering physician AND stat page to reading radiologist (<5 min)
- **Urgent (Time-sensitive):** Direct communication within 30 minutes
- **Unexpected:** Communication within 2 hours
- **Incidental:** Standard reporting with follow-up recommendation

**2. Automated Alert Systems:**
- AI-detected critical findings should trigger automated alerts to the reading radiologist
- Alerts must include: finding type, confidence level, image location, patient identifier
- Alert fatigue management: ensure high specificity for critical alerts to maintain clinician trust

**3. Documentation and Audit Trail:**
- All critical finding communications must be documented with timestamp
- Proof of delivery and acknowledgment required
- Audit trail maintained for regulatory compliance and liability protection

**4. Post-Alert Verification:**
- AI-flagged critical findings require radiologist confirmation before direct patient communication
- Override capability with mandatory justification documentation
- Peer review for all overridden critical alerts

### 6.4 Legal and Liability Considerations

- Lawsuits have been filed when incidental findings from emergency department imaging were overlooked
- Legislation in multiple states requires direct patient notification for significant abnormalities
- AI does not replace the radiologist's legal responsibility for timely communication

---

## 7. Reporting Limitations and Safe Language

### 7.1 The Principle of Safe Reporting

AI-generated findings must use language that accurately communicates uncertainty, avoids definitive diagnoses, and clearly attributes responsibility to the reviewing clinician. Safe language patterns prevent clinical misinterpretation and reduce medicolegal risk.

### 7.2 Safe vs. Unsafe Language Patterns

| UNSAFE (Avoid) | SAFE (Use Instead) | Rationale |
|---|---|---|
| "Diagnosed with [condition]" | "Possible finding of [condition]" | AI does not diagnose; it detects candidates |
| "Lesion identified" | "Candidate region requiring review" | Avoids implying confirmed pathology |
| "Confirmed abnormality" | "Requires radiologist review" | Only a credentialed radiologist confirms |
| "Is [pathology]" | "Suspicious for [pathology]" | Communicates uncertainty appropriately |
| "Proves [condition]" | "Correlation recommended" | AI suggests; clinical correlation confirms |
| "No evidence of disease" | "No abnormality detected by this algorithm" | Limits claims to AI capability scope |
| "Normal study" | "No algorithm-detected findings" | Prevents false reassurance |
| "AI detected no abnormalities" | "AI analysis did not identify findings above threshold" | Transparent about limitations |

### 7.3 Required Report Elements

Every AI-assisted report must include:
1. **AI system identification:** Name, version, manufacturer
2. **Intended use statement:** What the AI is designed to detect
3. **Limitations disclosure:** Known failure modes and excluded conditions
4. **Confidence indicators:** When available, include confidence scores
5. **Mandatory review statement:** "All findings require review and interpretation by a qualified radiologist"
6. **Algorithm performance data:** Expected sensitivity/specificity for the use case
7. **Patient population notes:** Any population-specific performance limitations

### 7.4 Example: Safe AI-Assisted Report Template

```
AI-ASSISTED RADIOLOGY REPORT

AI System: [System Name] v[Version] - [Manufacturer]
Intended Use: Detection of [specific findings] on [modality]

AI OUTPUT:
- Possible candidate region: [description], confidence: [score]
- No additional algorithm-detected findings above threshold

RADIOLOGIST INTERPRETATION:
[Full radiologist interpretation integrating AI findings with clinical context]

DISCLAIMER:
This report incorporates AI-generated candidate findings. AI output is an 
adjunct to, not a replacement for, radiologist interpretation. All findings 
require correlation with clinical history, prior imaging, and other diagnostic 
studies as appropriate.

PERFORMANCE NOTE:
This AI system has demonstrated [X]% sensitivity and [Y]% specificity for 
[target finding] in validation studies. Performance may vary based on patient 
population, imaging protocol, and equipment.
```

---

## 8. PHI in DICOM Metadata -- De-identification

### 8.1 The Three Locations of PHI in Medical Imaging

**Location 1: DICOM Metadata Header**
- Patient name, patient ID, accession number
- Institution name, referring physician
- Device serial numbers, study dates
- Protected by structured de-identification tools

**Location 2: Pixel Data (Burned-in Text)**
- Text burned into images by modality (patient overlays, laterality markers, technician annotations)
- Requires optical character recognition (OCR) combined with pixel-level de-identification
- More complex than header scrubbing; requires specialized tools

**Location 3: Anatomy (Facial Recognition Risk)**
- Standard facial recognition software correctly identified 85% of research volunteers from reconstructed MRI scans (Mayo Clinic study)
- **Defacing algorithms** required for 3D head and neck imaging shared for research or commercial training
- Facial features can re-identify patients even after metadata removal

### 8.2 De-identification Methods

**Safe Harbor (HIPAA):** Requires removal of 18 specified identifiers:
1. Names
2. Geographic subdivisions smaller than state
3. Dates (except year)
4. Telephone numbers
5. Fax numbers
6. Email addresses
7. SSN
8. Medical record numbers
9. Health plan beneficiary numbers
10. Account numbers
11. Certificate/license numbers
12. Vehicle identifiers
13. Device identifiers
14. Web URLs
15. IP addresses
16. Biometric identifiers
17. Full-face photos
18. Other unique identifying numbers

**Expert Determination:** Requires a qualified statistician to determine that the risk of re-identification is very small. Allows richer data retention but requires documented statistical analysis.

### 8.3 Best Practices for DICOM De-identification

- De-identify data **at the source site** before moving off-site
- Validate compliance with DICOM Application-Level Confidentiality Profile Attributes (ALCPA)
- Handle both header de-identification **and** burned-in pixel annotation removal
- Apply defacing algorithms for head/neck imaging
- Keep records of software, version, affected data, and results for every de-identification event
- Ensure traceability and compliance audit capability
- Consult expert radiologists to validate that de-identification does not jeopardize diagnostic utility

### 8.4 Technical Implementation

```
TWO-STAGE DE-IDENTIFICATION PROCESS:

Stage 1 (Source PACS Export):
- Substitution/removal of PII attributes in DICOM headers
- Initial scrubbing of standard tags

Stage 2 (Detailed Attribute Investigation):
- Exhaustive attribute-level investigation of DICOM headers
- Identification of PII-revealing attributes requiring further processing
- Verification of DICOM standard compatibility after de-identification
- Pixel-level PHI detection and removal via OCR
- Defacing for 3D head/neck imaging
- Quality assurance validation by domain expert
```

---

## 9. Clinician / Radiologist Review Requirements

### 9.1 The Radiologist as the Responsible Interpreter

AI imaging tools function as **clinical decision support systems (CDSS)**, not autonomous diagnostic systems. The final radiological interpretation and signed report remain the responsibility of the **credentialed radiologist**.

### 9.2 Regulatory Requirements for Clinician Review

| Jurisdiction | Requirement |
|---|---|
| **FDA** | AI-assisted devices cleared as Class II require labeling indicating the device assists, not replaces, clinician judgment |
| **EU MDR** | Human oversight required per AI Act Art. 14; must allow monitoring, understanding, and override |
| **Health Canada** | Clinical Decision Support System exemption only applies if NOT replacing clinical judgment |
| **TGA (Australia)** | Software assisting clinical decisions is regulated as medical device; human review required |

### 9.3 Minimum Review Standards

1. **All AI-flagged findings must be reviewed by a qualified radiologist** before being incorporated into a final report
2. **All AI-negative studies** with high clinical suspicion require dedicated radiologist review (the "false negative safety net")
3. **AI confidence scores** below a defined threshold must trigger mandatory human review
4. **Override documentation:** When radiologists disagree with AI findings, the disagreement and rationale must be documented
5. **Peer review:** Random audit of AI-assisted reports by a second radiologist (5-10% sampling)

### 9.4 The "Human-in-Command" Principle

Radiologists maintain ultimate authority:
- AI cannot sign reports independently
- AI cannot communicate findings directly to patients or referring physicians
- AI cannot order follow-up studies
- AI cannot make clinical management recommendations without human review

---

## 10. Human-in-the-Loop Requirements

### 10.1 Definition and Rationale

Human-in-the-Loop (HITL) is a design pattern where human intelligence is strategically embedded into the AI/ML lifecycle -- training, validation, and real-time operation -- allowing human users to supervise, fine-tune, and intervene as needed.

**Key Principle:** "'We told it to ask permission' is not the same as 'it cannot act without permission.' The first is an instruction. The second is an architectural constraint."

### 10.2 HITL Across the AI Lifecycle

| Phase | Human Role | Implementation |
|---|---|---|
| **Data Annotation** | Supply labeled training data | Expert radiologist annotation |
| **Model Training** | Validate training outputs | Intermittent quality checks |
| **Inference (Real-Time)** | Review and validate model outputs | Mandatory radiologist review of AI findings |
| **Edge Case Handling** | Respond to scenarios outside normal distribution | Escalation protocols for unusual cases |
| **Post-Deployment** | Monitor and provide feedback | Continuous quality improvement loop |

### 10.3 Architectural Safeguards

| Safeguard | Description |
|---|---|
| **Risk-based categorization** | Verification for high-risk tasks, augmentation for moderate-risk, human-in-command for critical decisions |
| **Pre-execution review** | Human approval required for irreversible actions or sensitive data |
| **Confidence thresholds** | AI operates autonomously only when confidence >= set threshold; below threshold, automatic human review |
| **Graduated autonomy** | AI gains more independence only after demonstrating consistent accuracy |
| **Kill switch** | Ability to immediately disable AI recommendations without system shutdown |
| **Audit trail** | Complete logging of all AI outputs, human reviews, and overrides |

### 10.4 EU AI Act Human Oversight Requirements (Article 14)

High-risk AI systems must be designed to allow:
- **Monitoring** of AI system operation by natural persons
- **Understanding** of system capabilities and limitations
- **Override** or **stop** system outputs when necessary
- **Intervention** in the operation of the AI system

### 10.5 Protocols for Human Reviewers

- Response time requirements for AI-flagged findings
- Workload distribution to prevent fatigue
- Procedures for handling non-responses or system failures
- Escalation protocols when reviewer disagrees with AI
- Documentation requirements for all review actions

---

## 11. Bias and Fairness in Neuroimaging AI

### 11.1 The Bias Problem in Medical AI

Despite 882 AI medical devices approved by the FDA by mid-2024, studies reveal that **50% of healthcare AI models carry high bias risks**. In neuroimaging specifically:
- **97.5%** of neuroimaging models rely on data from high-income groups
- Only **15.5%** of AI models underwent external validation
- **Only 3.6%** of FDA-approved AI devices reported race/ethnicity of validation cohorts
- **Less than 1%** provided socioeconomic information
- **Fewer than 2%** linked to peer-reviewed performance studies

### 11.2 Sources of Bias in Neuroimaging AI

| Source | Description | Example |
|---|---|---|
| **Training Data Bias** | Underrepresentation of minority populations | Models trained primarily on white, high-income populations |
| **Labeling Bias** | Inconsistent or biased ground truth labels | Different diagnostic thresholds across populations |
| **Scanner Bias** | Different MRI hardware/protocols across sites | Lower accuracy on images from community hospitals vs. academic centers |
| **Demographic Proxy Variables** | Indirect indicators reinforcing systemic bias | Zip code as proxy for socioeconomic status |
| **Threshold Bias** | Fixed decision thresholds across populations | Same cut-off applied regardless of population-specific prevalence |

### 11.3 Bias Mitigation Strategies

**Pre-processing Phase:**
- Re-sampling and re-weighting to balance class distribution
- Causal inference to estimate effects of specific variables
- Fair data augmentation using synthetic data

**Training Phase:**
- Distributionally robust optimization
- Adversarial debiasing
- Invariant risk minimization
- Domain-independent training
- Multi-modal strategies promoting fairness

**Post-processing Phase:**
- Equalized odds calibration
- Reject option-based classification
- Threshold optimization per subgroup

**Ongoing:**
- Regular bias audits using frameworks like PROBAST
- External validation on diverse populations
- Subgroup performance reporting
- Continuous monitoring for demographic performance drift

### 11.4 Explainable AI (XAI) for Bias Detection

| Method Type | Techniques | Purpose |
|---|---|---|
| **Perturbation-based** | Occlusion, LIME, SHAP | Identify features driving predictions |
| **Backpropagation-based** | Saliency maps, CAM, Grad-CAM | Visualize regions of image influencing decisions |

XAI methods help determine if confounders or biases are present in the model, allowing for their control or removal.

---

## 12. Health Equity Considerations

### 12.1 Equity Challenges in AI Neuroimaging

AI models trained predominantly on high-income population data may underperform for:
- Racial and ethnic minorities
- Low socioeconomic status populations
- Rural populations
- Non-English speaking patients
- Patients with uncommon comorbidities

### 12.2 Equity-by-Design Framework

| Principle | Implementation |
|---|---|
| **Diverse Training Data** | Ensure datasets represent the full spectrum of the intended patient population |
| **External Validation** | Validate on datasets from different geographic regions, healthcare systems, and populations |
| **Subgroup Analysis** | Report performance metrics stratified by race, ethnicity, age, sex, and socioeconomic factors |
| **Community Engagement** | Include affected patient populations in development and testing |
| **Equity Audits** | Regular assessment using standardized frameworks (PROBAST, PRISMA) |
| **Fairness Metrics** | Monitor demographic parity, equalized odds, equal opportunity |

### 12.3 Equity Metrics for AI Deployment

- **Demographic Parity:** Equal positive prediction rates across groups
- **Equalized Odds:** Equal true positive and false positive rates across groups
- **Equal Opportunity:** Equal true positive rates across groups
- **Calibration:** Predicted probabilities reflect actual outcomes across groups
- **Counterfactual Fairness:** Predictions would be the same if sensitive attributes were different

### 12.4 Organizational Equity Practices

- Diverse AI development teams
- Partnership with community healthcare organizations
- Transparent reporting of performance across demographic groups
- Commitment to continuous equity monitoring post-deployment
- Collaboration between developers, clinicians, and patient advocacy groups

---

## 13. CE Marking for AI Radiology

### 13.1 CE Marking Process

Any Software as a Medical Device placed on the EU market must obtain CE marking, confirming the software meets MDR requirements for safety, performance, risk management, and post-market monitoring.

### 13.2 Steps to CE Marking

1. **Classification:** Determine risk class using MDR Rule 11
2. **Conformity Assessment:** Route based on classification (Notified Body required for Class IIa and above)
3. **Technical Documentation:** Clinical evaluation, risk management, software lifecycle documentation
4. **Quality Management System:** ISO 13485 certification
5. **Post-Market Surveillance:** PMCF (Post-Market Clinical Follow-up) plan
6. **UDI Assignment:** Unique Device Identification
7. **EUDAMED Registration:** EU database registration
8. **CE Affixation:** Declaration of conformity and CE marking

### 13.3 Dual CE Marking (MDR + AI Act)

For high-risk AI medical devices:
- **CE marking under MDR/IVDR:** Safety and performance as medical device
- **CE marking under AI Act:** Requirements for data governance, transparency, robustness, human oversight
- Single conformity assessment where Notified Body is accredited under both frameworks
- MDCG 2025-6 provides guidance on the interplay between AI Act and EU MDR/IVDR

### 13.4 Key Standards for CE Marking AI Radiological Software

| Standard | Purpose |
|---|---|
| IEC 62304 | Software lifecycle processes |
| ISO 14971 | Risk management |
| IEC 62366-1 | Usability engineering |
| ISO 13485 | Quality management systems |
| IEC 80001 / IEC 81001-5-1 | Cybersecurity |
| ISO/IEC 29147 / 30111 | Vulnerability handling |

---

## 14. TGA Guidance

### 14.1 Australian Regulatory Framework

Australia's Therapeutic Goods Administration (TGA) regulates AI medical devices under the existing Software as a Medical Device (SaMD) framework. In February 2026, the TGA released updated guidance clarifying how AI-enabled SaMD is regulated.

### 14.2 Key Principles

- AI medical software is regulated based on **intended purpose**, not the presence of AI
- No separate legal category or approval pathway created solely for AI
- Technology-agnostic, risk-based regulation
- AI/ML-based tools are regulated according to their intended medical purpose

### 14.3 Classification (Australian Risk Classes)

| Class | Risk | Examples |
|---|---|---|
| Class I | Low risk | Dental treatment application software |
| Class IIa | Low-moderate risk | App monitoring muscular dystrophy; software generating 3D models from scans |
| Class IIb | Moderate-high risk | Diagnosis of emphysema from tomography; CABG recommendation software |
| Class III | High risk | Melanoma screening app; robotic surgical unit software |

### 14.4 Requirements for AI Medical Software

Manufacturers must provide transparent evidence including:
- Statement of AI/ML model objectives
- Algorithm and model design, tuning techniques
- Training and testing data description
- Generalisability assessment
- Risk management (overfitting, bias, performance degradation/data drift)
- Clinical evidence proportional to risk classification

### 14.5 Clinical Decision Support System (CDSS) Exemption

CDSS software is exempt from ARTG inclusion when ALL of the following apply:
1. Solely provides or supports a recommendation to a health professional
2. NOT intended to directly process or analyze a medical image or signal
3. NOT intended to replace the clinical judgment of a health professional

**Important:** AI software that analyzes medical images typically does NOT qualify for this exemption.

### 14.6 Change Control and Off-Label Use

- Manufacturers must monitor for **scope/feature creep** that changes intended purpose
- Updates changing functionality require regulatory assessment before deployment
- If off-label use is discovered, manufacturers must implement controls or cease supply
- Synthetic data may supplement training but generally cannot replace clinical evidence

### 14.7 Key Standards

| Standard | Purpose |
|---|---|
| IEC 62304 | Software lifecycle |
| ISO 14971 | Risk management |
| IEC 62366-1 | Usability |
| ISO 13485 | QMS |
| IEC 80001, IEC 81001-5-1, ISO/IEC 29147/30111 | Cybersecurity |

---

## 15. Regulatory Sandbox Approaches

### 15.1 Definition and Purpose

Regulatory sandboxes provide controlled environments for safe AI development and testing, allowing real-world experimentation within risk-managed frameworks. They aim to:
- Reduce administrative burden on developers
- Enable flexible, real-world testing scenarios
- Foster innovation while maintaining patient safety guardrails
- Inform future regulatory guidance and policy

### 15.2 Notable Regulatory Sandbox Initiatives

| Initiative | Jurisdiction | Description |
|---|---|---|
| **MHRA AI Airlock** | UK | First regulatory sandbox for AI as a Medical Device (AIaMD); launched Spring 2024; Phase 2 underway; multi-year funding secured |
| **EU AI Act Regulatory Sandboxes** | EU | Article 57 requires each member state to introduce at least one Regulatory Sandbox; operational by August 2026 |
| **TEF-Health** | EU | Network of real-world testing facilities for AI-enabled medical devices |
| **FDA Digital Health Pre-Cert** | US | Voluntary pilot for streamlined regulatory review of digital health tools |
| **Living Labs** | Global | Environments for generating evidence and testing innovations in real-world clinical settings |

### 15.3 MHRA AI Airlock (UK) - Detailed Model

- **Launched:** Spring 2024
- **Objective:** Balance oversight to protect patient safety with agility needed for AI-specific challenges
- **Approach:** Uses real-world products; brings together MHRA, UK Approved Bodies, NHS, and other regulators
- **Phase 1 (Pilot):** Complete April 2025; reports published
- **Phase 2:** Underway; testing complex regulatory challenges; due Spring 2026
- **Phase 3:** Design in progress
- **Outputs:** Inform future MHRA guidance and policy; reports inform National Commission into Regulation of AI in Healthcare

### 15.4 Sandbox Benefits and Limitations

**Benefits:**
- Accelerated learning about regulatory challenges
- Real-world evidence generation in controlled settings
- Multi-stakeholder collaboration
- Reduced regulatory uncertainty for innovators

**Limitations:**
- Relatively conservative compared to broader Living Lab concepts
- Focus on mid-to-late development stages
- Potential access, backlog, and delay concerns
- Long-term impact largely unknown and undocumented

---

## 16. Quality Assurance for AI Imaging

### 16.1 The ACR Practice Parameter for Imaging AI (2026)

In May 2026, the American College of Radiology (ACR) and SIIM approved the first-ever Practice Parameter for Imaging AI. This applies to:
- Physicians, technologists, medical physicists
- Informatics and IT teams, data scientists, administrators

### 16.2 Key QA Components

1. **AI Governance Group:** Clinical, technical, and compliance leaders
2. **AI Tool Inventory:** All AI tools in use, including versions and intended use
3. **Local Acceptance Testing:** Pre-deployment validation with tracking
4. **Real-World Performance Monitoring:** Drift and safety issue detection with stop rules
5. **HIPAA Compliance:** Privacy and security requirements, access controls, logging

### 16.3 ACR Assess-AI Registry

**Assess-AI** is the world's first AI quality registry and data service:

| Feature | Description |
|---|---|
| **Purpose** | Post-deployment AI governance via concordance measurement between AI outputs and radiology reports |
| **Method** | LLM-based prompting for surrogate label extraction from de-identified radiology reports |
| **Integration** | ACR Connect for de-identified data with centralized analytics |
| **Benchmarking** | Site data compared to aggregated national performance benchmarks |
| **Forensics** | ACR Forensics for local investigation of discordant cases |
| **Supported Use Cases** | ICH, PE, pneumothorax, LVO, bone age, cervical spine fracture, breast density, pneumoperitoneum, tube malposition, pleural effusion, brain mass effect, obstructive hydrocephalus |

### 16.4 ACR ARCH-AI Designation

ACR Recognized Center for Healthcare-AI (ARCH-AI) is the first international AI facility quality assurance program. Sites implementing AI responsibly can earn this designation by demonstrating:
- AI governance structure
- Tool inventory management
- Acceptance testing protocols
- Ongoing performance monitoring
- Privacy and security compliance

### 16.5 Automated QA Approaches

| Approach | Description | Benefit |
|---|---|---|
| **Interactive Verification** | Diagnostician verifies AI results during case work-up | Catch errors before they affect patients; XAI for interpretability |
| **Discordance Detection** | Auxiliary AI detects disagreement between radiologist report and AI model | Automated quality monitoring for ICH and other critical findings |
| **Continuous Monitoring** | 24/7 automated performance tracking | ~80% reduction in manual QA hours |
| **Automated Error Detection** | Real-time comparison of AI outputs with established radiological reports | Up to 95% accuracy in identifying deviations |

### 16.6 Local Acceptance Testing Checklist

Before AI deployment, validate:
- [ ] Sensitivity and specificity on local patient population
- [ ] Performance across different scanner vendors and protocols
- [ ] False positive rate in local workflow context
- [ ] Integration with PACS/RIS systems
- [ ] Radiologist user interface and workflow integration
- [ ] Alert and notification system functionality
- [ ] Override and documentation capabilities
- [ ] Data privacy and security compliance
- [ ] Backup and failover procedures

### 16.7 Post-Deployment Monitoring Schedule

| Activity | Frequency | Responsible Party |
|---|---|---|
| Performance metrics review (sensitivity, specificity, PPV, NPV) | Weekly | Quality assurance team |
| Radiologist override rate analysis | Monthly | Medical director |
| Patient outcome correlation analysis | Monthly | Clinical team |
| Demographic performance stratification | Quarterly | Equity officer |
| Model drift detection | Continuous (automated) | Technical team |
| Full QA audit | Quarterly | External reviewer |
| Vendor performance review | Annually | Procurement + clinical team |

---

## 17. Top 20 Safety Rules

### Priority 1: CRITICAL (Immediate Harm Prevention)

**RULE 1 - RADIOLOGIST REVIEW MANDATE:**  
All AI-generated findings MUST be reviewed by a qualified, credentialed radiologist before incorporation into any clinical report or patient communication. AI outputs are candidates, not diagnoses.

**RULE 2 - NO AUTONOMOUS PATIENT COMMUNICATION:**  
AI systems SHALL NOT communicate findings directly to patients, referring physicians, or clinical teams without human review and approval.

**RULE 3 - CRITICAL FINDING ESCALATION:**  
AI-detected critical findings (ICH, PE, pneumothorax, LVO) MUST trigger immediate radiologist notification within 5 minutes via automated alert systems with proof of delivery.

**RULE 4 - FALSE NEGATIVE SAFETY NET:**  
High clinical suspicion cases with AI-negative results MUST receive mandatory dedicated radiologist review. The AI does not replace clinical judgment.

**RULE 5 - SAFE LANGUAGE ONLY:**  
Use only approved language patterns: "Possible finding," "Candidate region," "Suspicious for," "Requires radiologist review," "Correlation recommended." NEVER use "Diagnosed," "Confirmed," "Proves," "Is."

---

### Priority 2: HIGH (Regulatory & Data Protection)

**RULE 6 - DICOM DE-IDENTIFICATION:**  
All DICOM data used for AI training, validation, or research MUST be de-identified at the source site before off-site transfer per HIPAA Safe Harbor (18 identifiers) or Expert Determination.

**RULE 7 - PIXEL-LEVEL PHI REMOVAL:**  
Burned-in text overlays, patient annotations, and embedded PHI in pixel data MUST be removed using OCR-based pixel de-identification, not just header scrubbing.

**RULE 8 - FACIAL DEFACING:**  
All 3D head and neck imaging data shared for research, training, or external processing MUST undergo facial defacing algorithms to prevent facial recognition re-identification.

**RULE 9 - TRACEABILITY & AUDIT:**  
Maintain complete audit trails of: AI version, patient identifier, timestamp, confidence scores, radiologist review status, override decisions, and final report. Retain for regulatory compliance.

**RULE 10 - REGULATORY CLASSIFICATION COMPLIANCE:**  
Determine and comply with regulatory classification in ALL target jurisdictions: FDA Class II 510(k)/De Novo, EU MDR Class IIa+, Health Canada Class II+, TGA Class IIa+.

---

### Priority 3: HIGH (Performance & Bias)

**RULE 11 - LOCAL VALIDATION REQUIRED:**  
AI algorithms MUST be validated on local patient populations, imaging protocols, and scanner configurations before clinical deployment. Do not rely solely on vendor-reported benchmarks.

**RULE 12 - BIAS AUDIT PROTOCOL:**  
Conduct pre-deployment and quarterly post-deployment bias audits stratified by race, ethnicity, age, sex, socioeconomic status, and imaging site. Minimum 20% low-risk bias rating required per PROBAST framework.

**RULE 13 - EXTERNAL VALIDATION:**  
AI models MUST demonstrate acceptable performance on at least one external validation dataset from a different geographic region or healthcare system before deployment.

**RULE 14 - SUBGROUP PERFORMANCE REPORTING:**  
Report sensitivity, specificity, PPV, and NPV stratified by demographic subgroups. Flag any subgroup where performance drops >10% below overall mean for remediation.

---

### Priority 4: MEDIUM (Governance & Quality)

**RULE 15 - HUMAN-OVERSIGHT ARCHITECTURE:**  
AI systems MUST be architected with mandatory human oversight -- confidence thresholds routing low-confidence cases to human review, override capability, and kill switch functionality.

**RULE 16 - PERFORMANCE DRIFT MONITORING:**  
Implement continuous automated monitoring for model performance drift. Define stop rules with automatic deactivation triggers when sensitivity/specificity falls below defined thresholds.

**RULE 17 - AI GOVERNANCE COMMITTEE:**  
Establish a multidisciplinary AI governance committee with clinical, technical, compliance, and patient representation. Meet monthly to review AI performance, incidents, and updates.

**RULE 18 - INVENTORY AND VERSION CONTROL:**  
Maintain an inventory of all AI tools in use including: manufacturer, version, intended use, validation status, performance metrics, and update history. Track changes as regulatory events.

**RULE 19 - EU AI ACT HUMAN OVERSIGHT COMPLIANCE:**  
For EU deployment, implement AI Act Article 14 human oversight: monitoring capability, understanding requirements, override/stop functionality, and intervention procedures.

**RULE 20 - CONTINUOUS EDUCATION & AI LITERACY:**  
All staff interacting with AI systems must complete AI literacy training covering capabilities, limitations, bias awareness, and safe use. Training must be updated annually and documented.

---

## 18. Appendix: Safe Language Reference

### A. Finding Classification Language

| Finding Level | Safe Language | Unsafe Language |
|---|---|---|
| Definite (high confidence) | "Consistent with [finding]" | "Is [finding]" |
| Probable | "Suspicious for [finding]" | "Diagnosed [finding]" |
| Possible | "Possible [finding] cannot be excluded" | "Finding identified" |
| Uncertain | "Equivocal; correlation recommended" | "Abnormality detected" |
| Absent | "No finding detected by this algorithm" | "Normal study" |

### B. AI Output Description Language

| Context | Safe Language | Unsafe Language |
|---|---|---|
| Region of interest | "Candidate region at [location]" | "Lesion at [location]" |
| Measurement | "AI-estimated measurement [value]; manual verification recommended" | "Measurement is [value]" |
| Confidence | "Algorithm confidence: [X]%" | "Certainty: [X]%" |
| Limitation | "Performance may vary for [population/scanner/protocol]" | "Validated for all populations" |
| Follow-up | "Clinical correlation and follow-up per radiologist discretion" | "No follow-up needed" |

### C. Required Report Disclaimers

**Standard AI Disclaimer:**  
"This report incorporates AI-generated candidate findings as an adjunct to radiologist interpretation. AI output is not a substitute for clinical judgment. All findings require review by a qualified radiologist and correlation with clinical history."

**Limitations Disclaimer:**  
"This AI system [name, version] is validated for [intended use]. Known limitations include: [list limitations]. Performance metrics from validation studies: [sensitivity, specificity]. Performance may vary based on patient population and imaging protocol."

**Equity Disclaimer (when applicable):**  
"This algorithm's training data included [X]% [demographic] patients. Performance in underrepresented populations may differ from reported overall metrics. Subgroup performance data available upon request."

---

## 19. References

### Regulatory Documents

1. FDA. "Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device (SaMD) Action Plan." January 2021.
2. FDA. "Good Machine Learning Practice for Medical Device Development: Guiding Principles." October 2021.
3. FDA. "Marketing Submission Recommendations for a Predetermined Change Control Plan for AI/ML-Enabled Device Software Functions." December 2024.
4. FDA. "Transparency for Machine Learning-Enabled Medical Devices: Guiding Principles." June 2024.
5. IMDRF. "Machine Learning-Enabled Medical Devices: Ten Guiding Principles." January 2025.
6. European Union. "Regulation (EU) 2017/745 - Medical Device Regulation (MDR)."
7. European Union. "Regulation (EU) 2024/1689 - Artificial Intelligence Act." August 2024.
8. MDCG 2025-6. "Interplay between the AI Act and the EU MDR/IVDR."
9. Health Canada. "Software as a Medical Device (SaMD): Definition and Classification." 2019.
10. Health Canada. "Pre-market guidance for machine learning-enabled medical devices."
11. TGA. "Artificial intelligence (AI) and medical device software regulation." February 2026.
12. TGA. "Standards for software-based medical devices." February 2026.
13. MHRA. "AI Airlock: the regulatory sandbox for AIaMD." Spring 2024.

### Technical Standards

14. IEC 62304:2006 - Medical device software - Software lifecycle processes.
15. ISO 14971:2019 - Medical devices - Application of risk management.
16. IEC 62366-1:2015 - Medical devices - Usability engineering.
17. ISO 13485:2016 - Quality management systems for medical devices.
18. IEC 80001-1:2021 - Risk management for IT networks incorporating medical devices.
19. DICOM Standard - Application-Level Confidentiality Profile.

### Key Studies and Reviews

20. FDA. "Artificial Intelligence in Software as a Medical Device." 2025.
21. Intuition Labs. "FDA SaMD Classification: AI & Machine Learning Guide." 2026.
22. PMC. "Artificial Intelligence-Based Software as a Medical Device (AI-SaMD): A Systematic Review." 2025.
23. Nature npj Digital Medicine. "How AI is used in FDA-authorized medical devices." 2025.
24. PMC. "A Two-Stage De-Identification Process for Privacy-Preserving Medical Image Analysis." 2022.
25. PMC. "Bias in artificial intelligence for medical imaging." 2025.
26. Censinet. "The Bias Blind Spot: Ensuring AI Equity Across Patient Populations." 2024.
27. PMC. "A roadmap for safe, regulation-compliant Living Labs for AI and digital health development." 2025.
28. ACR/SIIM. "Practice Parameter for Imaging Artificial Intelligence." May 2026.
29. ACR Data Science Institute. "Assess-AI: AI Quality Registry Technical Framework." 2026.
30. PMC. "Mapping the Landscape of Care Providers' Quality Assurance Approaches for AI in Diagnostic Imaging." 2022.
31. FDA, Health Canada, MHRA. "Good Machine Learning Practice (GMLP) Guiding Principles." October 2021.
32. PMC. "Medicine, healthcare and the AI act: gaps, challenges." 2024.
33. Nature npj Digital Medicine. "Navigating the European Union Artificial Intelligence Act for Healthcare." 2024.

---

*This report was compiled from publicly available regulatory guidance, peer-reviewed literature, and authoritative industry sources. It is intended for informational and reference purposes and should not be construed as legal or regulatory advice. Organizations should consult qualified regulatory professionals for jurisdiction-specific compliance strategies.*

---

**Document End**
