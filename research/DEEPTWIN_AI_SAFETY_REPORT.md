# DeepTwin AI Safety Research Report

## Comprehensive Guidelines for Safe Clinical Digital Twins

**Report Date:** 2026-01-19  
**Version:** 1.0  
**Classification:** Technical Safety Reference  
**Target Audience:** DeepTwin Engineering, Clinical Safety Officers, Regulatory Affairs

---

## Executive Summary

This report establishes a comprehensive AI safety framework for DeepTwin, a clinical digital twin platform operating at the intersection of artificial intelligence and healthcare delivery. Drawing from regulatory guidance across five jurisdictions (FDA, EU MDR/AI Act, Health Canada, TGA Australia, and WHO), peer-reviewed literature, and established best practices in clinical AI safety, this document provides actionable guidelines across eight critical safety domains.

**Key Finding:** Clinical digital twins are classified as high-risk AI systems under all major regulatory frameworks. They require human-in-the-loop oversight, transparency mechanisms, uncertainty quantification, bias monitoring, and robust audit trails as non-negotiable safety requirements.

**Top 20 AI Safety Rules for DeepTwin (Quick Reference):**

1. ALWAYS display confidence intervals alongside point estimates -- never present single-value predictions
2. ALWAYS include calibration status indicators on every output panel
3. NEVER present time-critical predictions without clear "automation bias" warnings
4. ALWAYS decompose uncertainty into epistemic (model knowledge) and aleatoric (inherent noise) components
5. NEVER use causal language ("causes," "produces," "results in") -- always use associative framing ("may be associated with," "correlates with")
6. ALWAYS disclose known confounders and data limitations beneath every prediction
7. LABEL every output as "HYPOTHESIS ONLY -- REQUIRES CLINICIAN VERIFICATION"
8. NEVER fabricate or hallucinate citations -- all evidence must reference retrievable sources
9. ALWAYS provide source tracking for every data element used in a prediction
10. ALWAYS display data quality indicators (completeness, recency, source reliability)
11. ALWAYS show model version number, training data cutoff date, and last calibration date
12. LOG every clinician override with timestamp, reason, and clinical context
13. NEVER allow fully automated clinical decisions -- clinician review is MANDATORY
14. ALWAYS provide a plain-language explanation of how each recommendation was derived
15. NEVER deploy without subgroup fairness validation across demographics
16. ALWAYS display population representation metrics for the training data
17. NEVER process medical images or physiological signals without FDA device clearance
18. ALWAYS implement retrieval-augmented generation (RAG) with verified medical knowledge bases
19. ALWAYS provide "forecast unavailable" messaging when confidence thresholds are not met
20. NEVER store patient data without full audit trail, encryption, and access controls

---

## Table of Contents

1. [Uncertainty Display](#1-uncertainty-display)
2. [Avoiding Causal Overclaiming](#2-avoiding-causal-overclaiming)
3. [Provenance Visibility](#3-provenance-visibility)
4. [Clinician Override](#4-clinician-override)
5. [Human-in-the-Loop Requirements](#5-human-in-the-loop-requirements)
6. [Hallucination Prevention](#6-hallucination-prevention)
7. [Bias and Fairness](#7-bias-and-fairness)
8. [Safe Language Patterns](#8-safe-language-patterns)
9. [Top 20 Safety Rules (Detailed)](#9-top-20-detailed-safety-rules)
10. [Regulatory Compliance Matrix](#10-regulatory-compliance-matrix)
11. [Implementation Checklist](#11-implementation-checklist)
12. [References](#12-references)

---

## 1. Uncertainty Display

### 1.1 Confidence Intervals vs Point Estimates

**Regulatory Basis:** FDA CDS Guidance Criterion 4 requires transparency that enables healthcare professionals to independently review the basis of recommendations. The 2026 FDA guidance specifically requires disclosure of "patient-specific knowns and unknowns" and "data quality requirements."

**Safety Requirement:** DeepTwin must NEVER present single-value (point) predictions without accompanying uncertainty ranges. Point estimates alone create dangerous false precision -- clinicians may treat a predicted value of "72% risk" as deterministic when the true 95% confidence interval spans 45-89%.

**Implementation Standards:**

| Display Element | Required Format | Example |
|-----------------|-----------------|---------|
| Primary prediction | Central estimate with CI | "Risk: 72% (95% CI: 45-89%)" |
| Distribution shape | Visual density plot | Show full posterior distribution |
| Prediction bounds | Absolute min/max | "Range: 38-94%" |
| Calibration status | Badge/icon | "Well-calibrated" / "Underconfident" / "Overconfident" |
| Sample size backing | Count | "Based on N=12,847 similar patients" |
| Time horizon | Explicit window | "72-hour prediction window" |

**Key Principle:** The display should answer: "What do we know?", "How well do we know it?", and "What don't we know?" simultaneously.

### 1.2 Calibration Status Indicators

**Definition:** Calibration measures whether a model's predicted probabilities match observed frequencies. A well-calibrated model predicting 80% risk should see the adverse outcome occur in approximately 80% of such cases.

**Requirement:** Every prediction panel must display a calibration status indicator showing:

- **Calibration curve** (predicted vs. observed) for the current patient population
- **Expected Calibration Error (ECE)** score
- **Recency of last calibration check**
- **Warning if calibration drifts** beyond acceptable thresholds

**Display Format:**
```
[GREEN] Calibration: Validated (last check: 2026-01-15)
Expected Calibration Error: 0.023 (excellent)
Warning: Recalibration recommended if ECE > 0.1
```

### 1.3 "Forecast Unavailable" Messaging

**Requirement:** DeepTwin must refuse to generate predictions when confidence thresholds are not met, displaying clear "Forecast Unavailable" messaging rather than producing low-confidence guesses.

**Trigger Conditions for Unavailable Forecasts:**

1. Input data completeness below 70% for critical features
2. Patient characteristics outside training data distribution (OOD detection)
3. Epistemic uncertainty exceeds clinically acceptable thresholds
4. Model calibration error exceeds 0.15 ECE
5. Conflicting input signals that cannot be resolved
6. Time-critical context where independent clinician review is not feasible (per FDA Criterion 4)

**Required Message Format:**
```
FORECAST UNAVAILABLE

Reason: Patient characteristics outside model training distribution
         (Age >95 years; training data max: 88 years)

What this means: The model has insufficient evidence for patients
matching this profile. Predictions would be unreliable.

Recommended action: Clinical judgment should guide decision-making.
Consider consulting specialist services.

Technical: Epistemic uncertainty = 0.87 (threshold: 0.5)
```

### 1.4 Uncertainty Decomposition (Epistemic vs Aleatoric)

**Academic Basis:** Research in clinical uncertainty quantification (PMC12306758, 2025) demonstrates that decomposing uncertainty into epistemic (model doesn't know due to limited data) and aleatoric (inherent randomness in the system) components is essential for safe clinical decision support.

**Definitions:**

- **Aleatoric Uncertainty:** Irreducible uncertainty from inherent biological variability, measurement noise, and stochastic physiological processes. This cannot be eliminated with more data. Represented as the variance of residual errors.
- **Epistemic Uncertainty:** Uncertainty from model limitations -- incomplete training data, distributional shift, or model architecture constraints. This CAN be reduced with more/better data. Critical for OOD detection.

**Display Requirements:**

Every prediction must decompose total uncertainty:

```
Total Uncertainty: +/- 22%
  |-- Aleatoric (inherent): +/- 15% [========----] 68%
  |-- Epistemic (model knowledge gap): +/- 7% [===---------] 32%

Interpretation: Most uncertainty comes from inherent biological variability.
Model confidence is high for this patient profile. Prediction is reliable.
```

**Clinical Significance:**

| Pattern | Interpretation | Action |
|---------|----------------|--------|
| High aleatoric, low epistemic | Noisy but well-understood domain | Prediction is as good as it gets -- trust but expect variation |
| Low aleatoric, high epistemic | Model lacks data for this case | CAUTION: Model is extrapolating. Flag for expert review |
| High both | Uncharted territory | Forecast unavailable -- do not present prediction |

**Technical Implementation:** Use spectral-normalized neural Gaussian processes or deep Bayesian Gaussian processes, which enforce explicit functional priors and provide reliable per-case epistemic uncertainty estimates (PMC12306758).

---

## 2. Avoiding Causal Overclaiming

### 2.1 Correlation vs Causation Language

**Why This Matters:** AI models identify statistical patterns, not causal mechanisms. Presenting associative findings as causal can lead to dangerous clinical decisions -- treating correlations as if they were proven therapeutic pathways.

**FORBIDDEN Language (Never Use in DeepTwin Outputs):**

| Forbidden Term | Safe Replacement | Rationale |
|----------------|-----------------|-----------|
| "X causes Y" | "X may be associated with Y" | Causation requires RCT evidence |
| "X produces Y" | "X correlates with observed Y" | Statistical, not mechanistic |
| "X results in Y" | "X temporally precedes Y in observed data" | Temporal != causal |
| "X leads to Y" | "X is a risk factor for Y" | Risk factor implies association |
| "X triggers Y" | "X temporally associated with Y onset" | "Trigger" implies causation |
| "The effect of X on Y" | "The observed relationship between X and Y" | "Effect" is causal language |
| "X protects against Y" | "X associated with lower Y incidence" | Protection implies mechanism |
| "X increases Y" | "Higher X values co-occur with higher Y" | Correlation framing |

### 2.2 Temporal Association Framing

**Requirement:** When DeepTwin identifies temporal patterns (e.g., "lab value X changed before event Y"), the system must use explicit temporal association language rather than predictive/causal framing.

**Safe Temporal Patterns:**

| Instead of... | Use... |
|---------------|--------|
| "Predicts future cardiac event" | "Identified temporal pattern: elevated troponin historically precedes cardiac events in similar patients" |
| "Forecasting 30-day readmission" | "Temporal projection: based on historical discharge patterns, readmission observed in similar cases" |
| "Will deteriorate within 48 hours" | "Pattern match: patients with similar trajectories showed deterioration within 48 hours in historical data" |
| "Risk score indicates..." | "Composite indicator synthesizes multiple correlated factors observed in historical outcomes" |

### 2.3 Confounder Disclosure

**Requirement:** Every prediction must include an automatically generated "Known Confounders" section listing variables that could explain the observed association.

**Example Confounder Disclosure:**

```
KNOWN CONFOUNDERS & LIMITATIONS
---------------------------------
This prediction is based on observational data. The following factors
may confound the observed association:

- Smoking status: Not recorded in 23% of training data
- Socioeconomic factors: Limited granularity (postcode-level only)
- Medication adherence: Self-reported; may be unreliable
- Comorbidity severity: Based on ICD codes; coding practices vary
- Healthcare access: Training data from tertiary centers; may not
d  generalize to primary care settings

This is a HYPOTHESIS, not a diagnosis. Clinical judgment required.
```

### 2.4 "Hypothesis Only" Labeling

**Requirement:** Every DeepTwin output must carry prominent "HYPOTHESIS ONLY" labeling that:

1. Appears in the header of every prediction panel
2. Cannot be dismissed or hidden
3. Is included in any exported/downloaded reports
4. Appears in the user interface at all times

**Standard Label:**

```
+---------------------------------------------------------------+
|  [HYPOTHESIS ONLY -- REQUIRES CLINICIAN VERIFICATION]         |
|  This output is an AI-generated hypothesis for consideration. |
|  It does NOT constitute a diagnosis or treatment plan.        |
|  Clinical expertise is REQUIRED before any clinical action.   |
+---------------------------------------------------------------+
```

---

## 3. Provenance Visibility

### 3.1 Source Tracking for All Outputs

**Regulatory Basis:** The EU AI Act (2024/1689) requires that high-risk AI systems maintain "technical documentation" including "a description of the data sets used to train, validate and test the system." FDA CDS Guidance Criterion 4 requires "algorithm development and validation" descriptions. TGA Australia requires "documentation of the AI model's alignment with the SaMD's intended purpose."

**Requirement:** Every prediction must display:

1. **Data sources** -- which EHR fields, lab systems, devices contributed
2. **Data timestamps** -- when each input was recorded
3. **Data lineage** -- transformation steps from raw data to model input
4. **Model version** -- specific version identifier
5. **Training data description** -- population, time period, size
6. **Last validation date** -- when model performance was last verified

**Example Provenance Panel:**

```
DATA PROVENANCE
---------------
Input Sources:
  - Epic EHR: demographics, diagnoses, medications (last updated: 2026-01-19 08:32)
  - Cerner Lab: CBC, metabolic panel (2026-01-18 14:22)
  - Philips Monitor: vitals stream (2026-01-19 09:15 - 09:45)
  - Missing: smoking history, family history, social determinants

Model: DeepTwin-v3.2.1-cardiac
Training: 45,000 patients (2019-2024) from 12 US health systems
Last validated: 2026-01-10 (AUC: 0.84, calibration ECE: 0.031)
```

### 3.2 Data Quality Indicators

**Requirement:** Each input data element must carry a quality score:

| Quality Level | Indicator | Action |
|---------------|-----------|--------|
| Verified | [GREEN] Direct from source system | Use normally |
| Interpolated | [YELLOW] Gap-filled using imputation | Flag in output |
| Derived | [YELLOW] Calculated from other values | Show calculation |
| Missing | [RED] Critical data unavailable | Degrade confidence |
| Stale | [YELLOW] Exceeds freshness threshold | Flag recency |
| Conflicting | [RED] Multiple sources disagree | Require resolution |

### 3.3 Model Version Tracking

**Requirement:** DeepTwin must maintain:

1. **Immutable model registry** -- every deployed model version is permanently archived
2. **Version diff** -- what changed between versions (data, architecture, hyperparameters)
3. **Performance comparison** -- head-to-head validation between versions
4. **Rollback capability** -- ability to revert to previous version if issues detected
5. **Predetermined Change Control Plan (PCCP)** -- pre-approved update protocol per FDA/Health Canada/EU guidance

**Version Display Format:**
```
Model: DeepTwin-v3.2.1-cardiac
  Data cutoff: 2024-12-31
  Deployed: 2026-01-05
  PCCP approved: 2025-11-20
  Change from v3.2.0: Added age interaction term, retrained on extended cohort
  Performance delta: AUC +0.02, calibration improved (ECE: 0.045 -> 0.031)
```

### 3.4 Audit Trail Requirements

**Regulatory Basis:** HIPAA requires audit trails. EU AI Act requires logging for high-risk systems. FDA requires post-market surveillance including "incidents of misclassification."

**Required Audit Events:**

| Event | Data Captured | Retention |
|-------|--------------|-----------|
| Prediction generated | All inputs, model version, timestamp, output, confidence | 7 years |
| Clinician viewed | User ID, timestamp, patient context | 7 years |
| Clinician accepted | User ID, timestamp, clinical action taken | 7 years |
| Clinician rejected | User ID, timestamp, rejection reason | 7 years |
| Clinician modified | Original prediction, modified interpretation, reason | 7 years |
| Override | Full context including urgency level | 7 years |
| Data quality alert | Alert details, resolution | 7 years |
| Model update | Version change, performance metrics | Permanent |

---

## 4. Clinician Override

### 4.1 Accept/Reject Hypothesis Mechanisms

**Design Principle:** DeepTwin is a hypothesis generator, not a decision maker. Every output must have explicit accept/reject/revise mechanisms built into the workflow.

**Required Interface Elements:**

```
+---------------------------------------------------------------+
| DeepTwin Hypothesis: Elevated readmission risk (72%)          |
|                                                               |
| [ACCEPT]  [REJECT]  [MODIFY]  [REQUEST MORE INFO]           |
|                                                               |
| If rejecting or modifying, please indicate reason:            |
| ( ) Clinical picture doesn't match                            |
| ( ) Missing critical context not in data                      |
| ( ) Model overconfident / underconfident                      |
| ( ) Disagree with interpretation                              |
| ( ) Other: _______________                                    |
+---------------------------------------------------------------+
```

**Requirement:** The system must not allow the clinician to proceed with documentation/charting without explicitly recording their stance on the hypothesis.

### 4.2 Override Logging

**Every override must capture:**

1. **Timestamp** (UTC, immutable)
2. **Clinician identifier** (authenticated user)
3. **Patient context** (de-identified for analytics)
4. **Original hypothesis** (full prediction with confidence)
5. **Override action** (accept/reject/modify/escalate)
6. **Override reason** (structured + free text)
7. **Clinical outcome** (if available -- linked to follow-up data)
8. **Time pressure** (was this an emergency or planned review?)

### 4.3 Override Analytics

**Continuous Monitoring:** DeepTwin must maintain a real-time override analytics dashboard tracking:

| Metric | Purpose | Alert Threshold |
|--------|---------|-----------------|
| Override rate by model version | Detect model degradation | >15% increase |
| Override reasons distribution | Identify systematic issues | Clustering of "model overconfident" |
| Override by patient subgroup | Detect bias | >20% disparity between groups |
| Override by time of day | Detect fatigue/automation bias | Higher override rates at 3-6am |
| Override by clinician experience | Detect training gaps | Novice override patterns differ |
| Time to override | Measure engagement | <5 seconds suggests automation bias |

### 4.4 Feedback Loops

**Closed-Loop Learning (with safeguards):**

1. **Override data feeds into model review** -- quarterly analysis of override patterns
2. **Systematic errors trigger retraining** -- if a consistent bias is detected
3. **Clinician feedback directly incorporated** -- structured feedback on specific predictions
4. **NO real-time learning from overrides** -- prevents feedback loops and confirmation bias
5. **All model updates go through PCCP** -- pre-approved change control process

---

## 5. Human-in-the-Loop Requirements

### 5.1 FDA Guidance on Clinical Decision Support (2026)

**Four Statutory Criteria for Non-Device CDS (21st Century Cures Act, Section 520(o)(1)(E)):**

DeepTwin must meet ALL FOUR criteria to be excluded from FDA device regulation:

**Criterion 1:** Software does NOT acquire, process, or analyze medical images, signals, or patterns from signal acquisition systems.
- **Implication:** If DeepTwin processes continuous monitoring data (ECG waveforms, CGM signals), it becomes a regulated device.
- **Action:** Process only discrete medical information (single lab values, documented diagnoses) unless pursuing formal FDA clearance.

**Criterion 2:** Software displays, analyzes, or prints medical information normally communicated between HCPs.
- **Implication:** Only discrete, clinically meaningful data elements.
- **Action:** No raw signal processing; only processed, interpretable data.

**Criterion 3:** Software provides recommendations (information/options) to an HCP rather than a specific output or directive.
- **Implication:** Cannot replace clinician judgment.
- **Action:** Always provide multiple options, never a single directive.

**Criterion 4:** Software provides the basis of recommendations so the HCP does not rely primarily on any recommendations to make a decision.
- **Implication:** Must be fully transparent.
- **Action:** Plain-language explanations, full provenance, independent review capability.

**Key 2026 Update:** FDA removed the risk-based enforcement discretion approach. Regulatory status is now strictly determined by whether the software meets all four criteria. The guidance also tightened definitions around signals, patterns, and specific recommendations.

**CRITICAL:** DeepTwin processing continuous monitoring data or providing single-recommendation outputs is a REGULATED MEDICAL DEVICE requiring 510(k), De Novo, or PMA pathway.

### 5.2 EU MDR for AI Medical Devices

**Dual Compliance Framework (MDR + AI Act):**

Since August 2024, AI systems used as medical devices face dual regulation:

**EU MDR (2017/745) Requirements:**
- General Safety and Performance Requirements (GSPRs)
- Risk management per ISO 14971
- Quality management per ISO 13485 / IEC 62304
- Clinical evaluation and post-market surveillance
- Conformity assessment by Notified Body

**EU AI Act (2024/1689) Additional Requirements:**
- **High-risk classification:** AI medical devices are automatically high-risk
- **Data governance:** Dataset quality, representativeness, bias testing
- **Transparency and explainability:** Technical documentation, user instructions
- **Human oversight:** Must enable human oversight during use
- **Accuracy and robustness:** Validation across subgroups
- **Registration:** Future EU AI database registration
- **Predetermined Change Control Plan (PCCP):** Pre-approved model update protocol

**MDCG 2025-6 / AIB 2025-1 Guidance** clarifies the interplay between MDR and AI Act, recommending unified documentation covering both frameworks.

### 5.3 Health Canada Guidance

**Key Requirements for ML-Enabled Medical Devices:**

Health Canada issued Pre-market Guidance for Machine-Learning-Enabled Medical Devices (PMG-MLMD) in February 2025:

1. **Risk management including bias:** Must address sex and gender-based analysis plus (SGBA+)
2. **Data set quality:** Must adequately represent Canadian population (biological differences across sexes and skin pigmentation)
3. **Training methods:** Documentation of algorithm design and optimization
4. **Performance testing:** Clinical validation with appropriate metrics
5. **Transparency:** Labelling considerations including limitations
6. **Predetermined Change Control Plan (PCCP):** Risk-based, evidence-informed change management
7. **Post-market performance monitoring:** Continuous real-world performance tracking

### 5.4 TGA (Australia) Guidance

**TGA AI Medical Device Software Regulation (2026 Update):**

The TGA regulates AI medical software within the existing Software as a Medical Device (SaMD) framework:

1. **Technology-agnostic, risk-based regulation:** Classification based on intended medical purpose, not AI technology itself
2. **Intended purpose determines regulation:** If AI influences clinical decisions or patient care, it is regulated
3. **Off-label use management:** Manufacturers must intervene if AI is used outside approved purpose
4. **Synthetic data allowed but limited:** May supplement but generally not replace clinical evidence
5. **Lifecycle management:** Full development, validation, deployment, maintenance, and update obligations
6. **Required standards:** IEC 62304, ISO 14971, IEC 62366-1, ISO 13485, cybersecurity standards

### 5.5 WHO Guidelines (2024)

**Ethics and Governance of AI for Health -- Key Requirements:**

1. **Protect patient and clinician autonomy:** Humans remain central to clinical decisions; clear disclosure when AI influences care
2. **Require strong privacy and data protection:** Meaningful informed consent, ability to delete user information
3. **Impact assessments:** Address ethics, human rights, safety, data protection throughout AI lifecycle; audited by independent third party
4. **Risk disclosure:** Developers must disclose known risks and any errors causing harm; cannot hide in fine print
5. **Accountability:** Clear liability pathways and compensation mechanisms for patients harmed by errors
6. **Explainability:** AI tools must be "explainable" -- developers, clinicians, regulators, and patients can understand how AI is used
7. **Labelling:** AI-generated content must be labelled to distinguish from human-generated records
8. **Bias monitoring:** Design without bias; monitor for disparities; don't contribute to digital divide
9. **Education:** Public and professional education on AI strengths and risks
10. **Ongoing quality control:** Subject to ongoing quality control, not just one-time validation

### 5.6 Always Requires Clinician Review

**This is non-negotiable across ALL jurisdictions:**

| Jurisdiction | Human Oversight Requirement |
|--------------|---------------------------|
| FDA (USA) | CDS must not replace HCP judgment; HCP must independently review basis |
| EU MDR/AI Act | High-risk AI requires "meaningful human oversight" during use |
| Health Canada | Human review required; AI supports but does not replace clinical judgment |
| TGA (Australia) | SaMD must not supplant clinical judgment |
| WHO | Humans must remain central to clinical decisions |

**DeepTwin SHALL NOT:**
- Trigger automated clinical actions without clinician confirmation
- Send alerts directly to patients without clinician review
- Generate orders, prescriptions, or care plans that auto-execute
- Override clinician judgment with automated protocols
- Operate in fully autonomous mode under any circumstances

---

## 6. Hallucination Prevention

### 6.1 Never Fabricate Citations

**The Problem:** Medical LLMs hallucinate citations at rates of 15-40% on clinical tasks (JBHI Special Issue, 2025). Fabricated references appear authoritative but are completely fictitious.

**DeepTwin Safeguards:**

1. **Retrieval-Augmented Generation (RAG) ONLY:** All clinical claims must be grounded in retrievable, pre-indexed medical knowledge bases
2. **Verified citation database:** Cross-reference all citations against PubMed, Cochrane, and approved clinical guidelines
3. **Citation link verification:** Every citation includes a DOI or direct link that resolves
4. **No generation of novel references:** The system must never create a citation that doesn't exist in the verified database
5. **Confidence gating:** If source confidence is below threshold, omit the claim entirely

**Citation Verification Pipeline:**
```
Claim generated -> Search verified KB -> Retrieve source -> 
Verify DOI resolves -> Check publication date -> Confirm relevance -> 
Include with full citation OR Reject claim
```

### 6.2 Evidence-Backed Only

**Hierarchy of Evidence for DeepTwin Claims:**

| Evidence Level | Source Type | Confidence |
|---------------|-------------|------------|
| 1 (Highest) | Systematic reviews, meta-analyses, RCTs | High |
| 2 | Well-designed cohort studies | Moderate-High |
| 3 | Case-control studies, observational data | Moderate |
| 4 | Expert opinion, case series | Low-Moderate |
| 5 | Unverified / no source | REJECTED |

**Requirement:** Every clinical claim must reference evidence at Level 3 or above. Level 4 claims must be explicitly flagged as "Limited evidence."

### 6.3 Structured Output Constraints

**Requirement:** DeepTwin must use constrained output generation to prevent hallucination:

1. **JSON schema validation:** All outputs conform to predefined schemas
2. **Field constraints:** Output fields have strict type, length, and value constraints
3. **Enum values:** Where possible, output from a closed set of validated values
4. **Template-based generation:** Use clinical templates that structure output into predefined sections
5. **Output filtering:** Post-generation validation against known clinical facts and constraints

### 6.4 Confidence Thresholds

**Hallucination Prevention Thresholds:**

| Scenario | Confidence Threshold | Action |
|----------|---------------------|--------|
| Direct clinical claim | >90% source-verified | Include with citation |
| Risk association | >80% calibrated probability | Include with CI |
| Novel finding | >95% with 2+ independent sources | Flag as emerging evidence |
| Contradicts guidelines | ANY | Block and alert |
| Unverifiable claim | N/A | REJECT -- do not include |

**Multi-Faceted Hallucination Prevention:**

1. **Pre-Response Validation:** Assess whether retrieval is necessary; eliminate irrelevant/conflicting context
2. **Post-Response Refinement:** Decompose response into atomic statements; verify each against retrieved data
3. **Human-in-the-Loop Review:** Every output reviewed by clinician before incorporation in care
4. **Real-Time Monitoring:** Flag deviations from expected output patterns
5. **Regular Auditing:** Periodic expert review of output quality and citation accuracy

---

## 7. Bias and Fairness

### 7.1 Population Representation

**Regulatory Basis:** Health Canada requires data "adequately represent Canada's population" including biological differences across sexes and skin pigmentation. EU AI Act requires datasets to be "representative." FDA calls for representative data across demographics.

**DeepTwin Requirements:**

1. **Training data demographic reporting:** Every model must report:
   - Age distribution (mean, SD, quartiles)
   - Sex/gender distribution
   - Race/ethnicity distribution
   - Geographic distribution (urban/rural, region)
   - Socioeconomic status indicators
   - Comorbidity burden distribution

2. **Representation gaps must be disclosed:**
```
TRAINING DATA REPRESENTATION
------------------------------
Total: N=45,000
  Age: 18-95 (median 62)
  Sex: 52% male, 48% female
  Race: 68% White, 15% Black, 12% Hispanic, 5% Asian
  [WARNING: Native American/Indigenous: 0.3% -- UNDERREPRESENTED]
  [WARNING: Rural populations: 8% -- UNDERREPRESENTED]
  Geography: 85% urban tertiary centers
  
Caution: Predictions may be less reliable for underrepresented groups.
```

### 7.2 Subgroup Analysis

**Requirement:** Every model must report performance across demographic subgroups:

| Subgroup | N | AUC | Sensitivity | Specificity | Calibration ECE | vs. Overall |
|----------|---|-----|-------------|-------------|-----------------|-------------|
| Overall | 45,000 | 0.84 | 0.78 | 0.82 | 0.031 | -- |
| Female | 21,600 | 0.85 | 0.80 | 0.83 | 0.028 | +0.01 |
| Male | 23,400 | 0.83 | 0.76 | 0.81 | 0.035 | -0.01 |
| Age >75 | 12,000 | 0.79 | 0.72 | 0.78 | 0.052 | -0.05 |
| Black | 6,750 | 0.80 | 0.74 | 0.79 | 0.048 | -0.04 |
| Hispanic | 5,400 | 0.81 | 0.75 | 0.80 | 0.042 | -0.03 |

**Action Required:** If any subgroup shows >0.05 AUC decrement or >0.05 ECE increment:
- Flag predictions for that subgroup with enhanced uncertainty warnings
- Prioritize targeted data collection
- Consider subgroup-specific model calibration

### 7.3 Fairness Metrics

**Required Fairness Assessment:**

| Metric | Definition | Target |
|--------|-----------|--------|
| Demographic Parity | Equal positive prediction rates across groups | Difference < 5% |
| Equal Opportunity | Equal true positive rates across groups | Difference < 5% |
| Equalized Odds | Equal TPR and FPR across groups | Difference < 5% |
| Calibration | Predicted probabilities match observed rates per group | ECE < 0.05 per group |

**Continuous Monitoring:** Fairness metrics must be recalculated monthly on production data and reported in the Safety Dashboard.

### 7.4 Health Equity Considerations

**Beyond Algorithmic Fairness:**

1. **Digital divide:** Ensure DeepTwin works on standard hospital infrastructure, not requiring specialized hardware
2. **Language accessibility:** Support multiple languages for non-English speaking clinicians and patients
3. **Rural access:** Model performance validated on rural patient data, not just urban tertiary centers
4. **Health literacy:** Output written at appropriate reading level; plain-language explanations
5. **Disability inclusion:** Interface accessible to clinicians with disabilities
6. **Global health equity:** If deployed in LMIC settings, validate on local populations

---

## 8. Safe Language Patterns

### 8.1 "May Be Associated With" vs "Causes"

**Universal Rule:** DeepTwin ALWAYS uses associative language. Causal language is NEVER used in any user-facing output.

**Pattern Library:**

| Unsafe (FORBIDDEN) | Safe (REQUIRED) |
|---------------------|-----------------|
| "Diabetes causes kidney disease" | "Diabetes is associated with increased kidney disease risk (OR 3.2, 95% CI 2.8-3.7)" |
| "High BP leads to stroke" | "Elevated BP observed in 68% of patients who later experienced stroke" |
| "The drug produces remission" | "The drug was associated with remission in 45% of trial participants" |
| "Smoking results in cancer" | "Smoking history correlates with elevated cancer incidence in longitudinal data" |
| "This gene causes the disorder" | "Variants in this gene are associated with disorder risk (p<0.001)" |

### 8.2 "Temporal Context" vs "Prediction"

| Unsafe | Safe |
|--------|------|
| "Predicts 30-day mortality" | "Based on historical patterns, patients with similar profiles had observed 30-day mortality of X%" |
| "Will readmit within 7 days" | "Historical data: Y% of similar patients had unplanned readmission within 7 days" |
| "Forecast: sepsis likely" | "Temporal pattern: early indicators observed in Z% of prior sepsis cases" |

### 8.3 "Correlation Signal" vs "Response"

| Unsafe | Safe |
|--------|------|
| "Biomarker response indicates..." | "Correlation signal: biomarker change co-occurs with..." |
| "The patient responded to therapy" | "The patient showed biomarker changes temporally associated with therapy initiation" |
| "Inflammatory response detected" | "Elevated inflammatory markers observed" |

### 8.4 "Requires Clinician Review" Placement

**"Requires Clinician Review" must appear:**

1. **Page header:** Persistent banner at top of all DeepTwin interfaces
2. **Per prediction:** Directly adjacent to every output
3. **In exports:** Embedded in all downloaded/printed reports
4. **In alerts:** Part of every notification or alert text
5. **In API responses:** Included in all programmatic outputs
6. **In documentation:** Prominently featured in all user-facing documentation

**Standard Wording Options:**

```
Short: "[REQUIRES CLINICIAN REVIEW]"
Medium: "This is an AI hypothesis for clinical consideration. Expert review required."
Full: "This output is generated by an artificial intelligence system as a hypothesis
for clinical consideration only. It does not constitute medical advice, diagnosis,
or treatment. A qualified healthcare professional must review and validate this
information before any clinical action is taken."
```

---

## 9. Top 20 Detailed Safety Rules

### Rule 1: Confidence Intervals Always
**Statement:** ALWAYS display confidence intervals alongside point estimates -- never present single-value predictions.  
**Rationale:** Point estimates create false precision. Clinicians need uncertainty ranges to contextualize predictions.  
**Implementation:** Every numeric prediction shows 95% CI by default.  
**Enforcement:** Automated output validation rejects predictions without CIs.

### Rule 2: Calibration Status Visible
**Statement:** ALWAYS include calibration status indicators on every output panel.  
**Rationale:** A model can have high AUC but poor calibration, meaning predicted probabilities don't match real frequencies.  
**Implementation:** Color-coded calibration badge with ECE score and last check date.  
**Enforcement:** Cannot be hidden or dismissed by users.

### Rule 3: Time-Critical Warning
**Statement:** NEVER present time-critical predictions without clear "automation bias" warnings.  
**Rationale:** FDA Criterion 4 is unlikely to be met in time-critical contexts. Automation bias is highest in emergencies.  
**Implementation:** Extra confirmation steps and prominent warnings for predictions used in acute contexts.  
**Enforcement:** System detects time-critical context and escalates warning level automatically.

### Rule 4: Uncertainty Decomposition
**Statement:** ALWAYS decompose uncertainty into epistemic (model knowledge) and aleatoric (inherent noise) components.  
**Rationale:** Different uncertainty types require different clinical responses.  
**Implementation:** Visual bar chart showing uncertainty decomposition with interpretation text.  
**Enforcement:** Required component of every prediction display.

### Rule 5: No Causal Language
**Statement:** NEVER use causal language -- always use associative framing.  
**Rationale:** AI identifies statistical patterns, not causal mechanisms. Causal claims require RCT evidence.  
**Implementation:** Real-time language filter replacing forbidden terms with safe alternatives.  
**Enforcement:** Pre-deployment NLP validation of all output templates.

### Rule 6: Confounder Disclosure
**Statement:** ALWAYS disclose known confounders and data limitations beneath every prediction.  
**Rationale:** Transparency about limitations enables informed clinical judgment (FDA Criterion 4).  
**Implementation:** Auto-generated confounder section based on known data gaps.  
**Enforcement:** Prediction cannot be generated without this section.

### Rule 7: Hypothesis Labeling
**Statement:** LABEL every output as "HYPOTHESIS ONLY -- REQUIRES CLINICIAN VERIFICATION."  
**Rationale:** Prevents misinterpretation of AI output as definitive clinical truth.  
**Implementation:** Persistent, non-dismissible banner on all interfaces.  
**Enforcement:** Included in all output rendering pipelines.

### Rule 8: No Hallucinated Citations
**Statement:** NEVER fabricate or hallucinate citations -- all evidence must reference retrievable sources.  
**Rationale:** Medical LLMs hallucinate 15-40% of citations. Fictional references undermine trust and safety.  
**Implementation:** RAG-only architecture with verified citation database.  
**Enforcement:** Citation verification pipeline; unverifiable claims rejected.

### Rule 9: Source Tracking
**Statement:** ALWAYS provide source tracking for every data element used in a prediction.  
**Rationale:** Clinicians must understand what data informed the prediction (FDA Criterion 4, EU AI Act).  
**Implementation:** Clickable provenance panel showing all data sources with timestamps.  
**Enforcement:** Provenance logging is mandatory for every prediction.

### Rule 10: Data Quality Indicators
**Statement:** ALWAYS display data quality indicators (completeness, recency, source reliability).  
**Rationale:** Low-quality inputs produce unreliable outputs. Clinicians need this context.  
**Implementation:** Quality badges on each input; overall quality score in prediction header.  
**Enforcement:** Predictions on low-quality data show enhanced uncertainty warnings.

### Rule 11: Model Version Transparency
**Statement:** ALWAYS show model version number, training data cutoff date, and last calibration date.  
**Rationale:** Model behavior changes with versions. Clinicians need to know which model generated the prediction.  
**Implementation:** Standardized version display in prediction footer.  
**Enforcement:** All predictions include version metadata.

### Rule 12: Override Logging
**Statement:** LOG every clinician override with timestamp, reason, and clinical context.  
**Rationale:** Override data is critical for model improvement and safety monitoring.  
**Implementation:** Structured override capture with required fields.  
**Enforcement:** Cannot proceed without capturing override reason.

### Rule 13: Mandatory Human Review
**Statement:** NEVER allow fully automated clinical decisions -- clinician review is MANDATORY.  
**Rationale:** This is a legal requirement across all jurisdictions (FDA, EU, Canada, Australia, WHO).  
**Implementation:** System requires authenticated clinician action before any output is used clinically.  
**Enforcement:** Technical and procedural controls prevent autonomous action.

### Rule 14: Explainable Outputs
**Statement:** ALWAYS provide a plain-language explanation of how each recommendation was derived.  
**Rationale:** FDA Criterion 4 and EU AI Act require transparency enabling independent review.  
**Implementation:** Auto-generated explanation of key contributing factors and model logic.  
**Enforcement:** Explanation is mandatory component of every prediction.

### Rule 15: Fairness Validation
**Statement:** NEVER deploy without subgroup fairness validation across demographics.  
**Rationale:** Models that perform well overall may harm underrepresented subgroups.  
**Implementation:** Pre-deployment fairness audit with defined metrics and thresholds.  
**Enforcement:** Deployment blocked if fairness criteria not met.

### Rule 16: Representation Metrics
**Statement:** ALWAYS display population representation metrics for the training data.  
**Rationale:** Clinicians need to assess whether the model was trained on patients like theirs.  
**Implementation:** Demographic summary panel with representation warnings.  
**Enforcement:** Displayed on model information page and in prediction context.

### Rule 17: Signal Processing Boundary
**Statement:** NEVER process medical images or physiological signals without FDA device clearance.  
**Rationale:** FDA Criterion 1 explicitly excludes signal-processing software from Non-Device CDS.  
**Implementation:** System architecture processes only discrete data elements.  
**Enforcement:** Input validation blocks continuous signal data.

### Rule 18: RAG Architecture
**Statement:** ALWAYS implement retrieval-augmented generation (RAG) with verified medical knowledge bases.  
**Rationale:** RAG grounds clinical claims in verified evidence, preventing hallucination.  
**Implementation:** Integration with PubMed, Cochrane, approved clinical guidelines.  
**Enforcement:** All clinical claims pass through RAG verification pipeline.

### Rule 19: Forecast Unavailability
**Statement:** ALWAYS provide "forecast unavailable" messaging when confidence thresholds are not met.  
**Rationale:** Low-confidence predictions are worse than no predictions -- they create dangerous false confidence.  
**Implementation:** OOD detection and epistemic uncertainty gating.  
**Enforcement:** System refuses prediction generation when thresholds unmet.

### Rule 20: Data Security
**Statement:** NEVER store patient data without full audit trail, encryption, and access controls.  
**Rationale:** HIPAA, GDPR, and all regulatory frameworks mandate data protection.  
**Implementation:** End-to-end encryption, role-based access, comprehensive audit logging.  
**Enforcement:** Technical controls enforce encryption and access restrictions.

---

## 10. Regulatory Compliance Matrix

| Requirement | FDA (USA) | EU MDR + AI Act | Health Canada | TGA (Australia) | WHO |
|-------------|-----------|-----------------|---------------|-----------------|-----|
| Human oversight | CDS 4 criteria | Meaningful oversight required | Required | Required | Central to decisions |
| Transparency/Explainability | Criterion 4 | Technical docs + user info | Required | Evidence of safety/performance | Explainability mandate |
| Bias assessment | Encouraged | Dataset governance + fairness | SGBA+ required | Risk management | Monitor for disparities |
| Data quality | Implied | Representative datasets | Adequate representation | Data quality evidence | Quality data |
| Audit trail | Post-market surveillance | Logging for high-risk systems | Post-market monitoring | Lifecycle management | Accountability |
| Risk management | ISO 14971 | ISO 14971 + AI Act | ISO 14971 | ISO 14971 | Impact assessments |
| Change control | PCCP recommended | Predetermined Change Control | PCCP required | Change assessment | Ongoing QC |
| Version tracking | Required | Technical documentation | Required | Required | Documentation |
| Clinical evidence | Per device class | Clinical evaluation | Clinical evidence required | Essential principles | Safety standards |
| Post-market monitoring | MDR reporting | PSUR + AI database | Performance monitoring | ARTG obligations | Monitor for harm |

---

## 11. Implementation Checklist

### Pre-Deployment

- [ ] Uncertainty quantification pipeline implemented (epistemic + aleatoric)
- [ ] Confidence intervals on all predictions validated
- [ ] Calibration monitoring dashboard operational
- [ ] "Forecast unavailable" logic tested across OOD scenarios
- [ ] Language filter blocking all causal terminology
- [ ] Confounder disclosure templates created for all prediction types
- [ ] "HYPOTHESIS ONLY" labeling applied to all outputs
- [ ] Provenance tracking logging all data elements
- [ ] Data quality scoring validated
- [ ] Model version registry with immutability
- [ ] PCCP approved by regulatory
- [ ] Clinician override workflow tested
- [ ] Override logging capturing all required fields
- [ ] Override analytics dashboard operational
- [ ] RAG pipeline with verified citation DB operational
- [ ] Hallucination detection pipeline validated
- [ ] Subgroup fairness analysis completed
- [ ] Demographic representation metrics calculated
- [ ] Fairness monitoring dashboard operational
- [ ] Audit trail system capturing all required events
- [ ] Encryption and access controls validated
- [ ] Regulatory review completed (FDA/EU/Canada/Australia as applicable)
- [ ] Clinician training materials prepared
- [ ] Emergency override procedures documented
- [ ] Rollback procedures tested

### Post-Deployment (Ongoing)

- [ ] Calibration checked weekly
- [ ] Fairness metrics recalculated monthly
- [ ] Override patterns reviewed monthly
- [ ] Model performance monitored continuously
- [ ] Citation accuracy audited quarterly
- [ ] Subgroup performance validated quarterly
- [ ] Safety incidents reviewed within 24 hours
- [ ] User feedback incorporated monthly
- [ ] Regulatory updates monitored continuously
- [ ] Annual independent safety audit
- [ ] PCCP updates as needed
- [ ] Training data refresh per PCCP schedule

---

## 12. References

### Regulatory Sources

1. **FDA Clinical Decision Support Software Guidance** (January 2026, revised January 29, 2026). U.S. Food and Drug Administration. Docket FDA-2017-D-6569. https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software

2. **FDA Clinical Decision Support Software FAQs** (December 2024). U.S. Food and Drug Administration. https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs

3. **EU MDR (2017/745)**. Regulation (EU) 2017/745 of the European Parliament and of the Council on medical devices.

4. **EU AI Act (2024/1689)**. Regulation (EU) 2024/1689 laying down harmonised rules on artificial intelligence.

5. **MDCG 2025-6 / AIB 2025-1** (2025). Interplay between the Medical Devices Regulation/IVDR and the AI Act. European Commission.

6. **Health Canada Pre-market Guidance for Machine-Learning-Enabled Medical Devices** (February 2025). Health Canada.

7. **FDA, Health Canada, MHRA -- Transparency for Machine Learning-Enabled Medical Devices: Guiding Principles** (June 2024).

8. **TGA Australia -- Artificial intelligence (AI) and medical device software regulation** (2026 update). Therapeutic Goods Administration.

9. **WHO Ethics and Governance of AI for Health: Guidance on Large Multi-Modal Models** (2024). World Health Organization.

### Academic Sources

10. **Olawade DB et al.** (2026). "Human in the loop artificial intelligence in healthcare: applications, outcomes, and implementation challenges." International Journal of Medical Informatics, 213:106362. PMID: 41740273.

11. **Lindenmeyer et al.** (2025). "Implicit versus explicit Bayesian priors for epistemic uncertainty in clinical deep learning." PMC12306758. Demonstrates that spectral-normalized neural Gaussian processes provide reliable per-case epistemic uncertainty estimates for clinical safety.

12. **From Aleatoric to Epistemic: Exploring Uncertainty Quantification Techniques in AI.** (2025). arXiv:2501.03282v1. Comprehensive review of uncertainty quantification methods for high-risk AI applications.

13. **J-BHI Special Issue** (2025). "Mitigating Hallucinations in Large Language Models for Healthcare: Towards Trustworthy Medical AI." IEEE Journal of Biomedical and Health Informatics. Documents 15-40% hallucination rates in medical LLMs.

14. **Subgroup Disparity Study** (2024). "Evaluating and Reducing Subgroup Disparity in AI Models." PMC11451670. Found 50.7% prevalence of subgroup disparities in pediatric COVID-19 models.

15. **Bias Recognition and Mitigation in Healthcare AI** (2025). npj Digital Medicine. Comprehensive review of bias mitigation strategies across the AI model lifecycle.

### Technical Sources

16. **AI Data Provenance and Audit Trails in Healthcare Tech** (2025). OnHealthcare.tech. Framework for comprehensive audit trails in healthcare AI systems.

17. **Digital Twins in Healthcare: Regulatory and Compliance Guide** (2026). AccountableHQ. HIPAA, FDA, and data privacy requirements for healthcare digital twins.

18. **FDA GMLP -- Good Machine Learning Practice for Medical Device Development** (2021, updated 2024). Ten guiding principles for ML medical devices.

19. **EU GMP Annex 22 Draft** (2025). Requirements for AI/ML in pharmaceutical manufacturing, including human-in-the-loop requirements.

20. **IntuitionLabs -- EU MDR & AI Act Compliance for AI Medical Devices** (2026). Comprehensive analysis of dual compliance requirements.

---

## Appendix A: Quick Reference Cards

### For Engineers: Uncertainty Display Checklist
```
Every prediction MUST include:
[x] Point estimate
[x] 95% confidence interval
[x] Calibration status badge
[x] Epistemic uncertainty component
[x] Aleatoric uncertainty component
[x] Interpretation text
[x] Sample size / evidence strength
[x] "Forecast unavailable" if thresholds not met
```

### For Clinicians: Interpreting DeepTwin Output
```
1. Check the "HYPOTHESIS ONLY" banner
2. Review confidence intervals, not just point estimates
3. Check calibration status
4. Review uncertainty decomposition
5. Read known confounders
6. Verify data sources and quality
7. Consider population representation
8. Make independent clinical judgment
9. Document accept/reject/modify decision
10. Provide feedback if prediction seems incorrect
```

### For Compliance: Regulatory Filing Checklist
```
[x] Four FDA CDS criteria analysis documented
[x] EU MDR GSPR compliance matrix completed
[x] EU AI Act high-risk system requirements addressed
[x] Health Canada PMG-MLMD requirements met
[x] TGA Essential Principles compliance documented
[x] PCCP approved for all model updates
[x] Human oversight mechanism documented
[x] Bias assessment across subgroups completed
[x] Audit trail architecture documented
[x] Post-market surveillance plan established
```

---

*This document is a living safety reference. It must be reviewed quarterly and updated whenever regulatory guidance changes or new safety evidence emerges.*

*Document Owner: DeepTwin Clinical Safety Team*  
*Next Review Date: 2026-04-19*  
*Classification: Engineering Safety Reference*
