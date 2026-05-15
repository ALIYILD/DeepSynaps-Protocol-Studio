# Intervention Analyzer Safety Copy Guidelines

## Clinical Intervention Analytics - Safe Language Framework

**Version:** 1.0  
**Date:** 2025  
**Classification:** Clinical Safety Documentation  
**Purpose:** Provide evidence-based safe language guidelines for clinical intervention analytics interfaces, ensuring compliance with FDA, EU MDR, TGA, and Health Canada regulatory frameworks while preventing miscommunication of correlation as causation.

---

## Table of Contents

1. [Correlation vs. Causation](#1-correlation-vs-causation)
2. [Treatment Response Uncertainty](#2-treatment-response-uncertainty)
3. [Confounding Disclosures](#3-confounding-disclosures)
4. [Missing Data Handling](#4-missing-data-handling)
5. [Prediction vs. Context](#5-prediction-vs-context)
6. [Clinician Oversight](#6-clinician-oversight)
7. [Regulatory Considerations](#7-regulatory-considerations)
8. [Safe Copy Templates](#8-safe-copy-templates)
9. [Example Transformations](#9-example-transformations)
10. [Top 20 Safe Copy Rules](#10-top-20-safe-copy-rules)

---

## 1. Correlation vs. Causation

### 1.1 Overview

Clinical intervention analytics systems analyze temporal relationships between interventions (e.g., medication changes, therapy sessions, TMS treatments) and patient-reported or clinician-reported outcomes. A fundamental safety requirement is that **no analytics system can establish causation from observational data alone**. Causation requires randomized controlled trials (RCTs) with appropriate controls, and even then, language must remain appropriately qualified.

### 1.2 Forbidden Phrases

The following phrases **must never appear** in any intervention analytics output:

| Forbidden Phrase | Risk Level | Rationale |
|---|---|---|
| "caused improvement" | CRITICAL | Directly asserts causation without RCT evidence |
| "caused decline" | CRITICAL | Directly asserts causation |
| "treatment worked" | CRITICAL | Colloquial causation claim |
| "treatment failed" | CRITICAL | Colloquial causation claim |
| "proves efficacy" | CRITICAL | "Proves" implies definitive evidence; efficacy requires RCTs |
| "proves effectiveness" | CRITICAL | Same as above |
| "demonstrates efficacy" | HIGH | Stronger than observational data supports |
| "the intervention was effective" | HIGH | Implies causal efficacy |
| " resulted in improvement" | HIGH | "Resulted in" implies causation |
| "led to improvement" | HIGH | "Led to" implies causation |
| "produced a response" | HIGH | "Produced" implies causal production |
| "was responsible for" | CRITICAL | Direct causation assignment |
| "drove improvement" | CRITICAL | Active causation language |
| "successfully treated" | CRITICAL | Outcome attribution to intervention |
| "patient improved due to [intervention]" | CRITICAL | Explicit causal attribution |
| "significant improvement proves" | CRITICAL | Statistical + causal overreach |
| "clinical response to treatment" | HIGH | "Response" implies biological causation |
| "benefited from" | HIGH | Implies intervention caused benefit |
| "efficacy signal" | HIGH | "Efficacy" is reserved for RCT contexts |
| "robust efficacy" | CRITICAL | Inappropriate for observational data |

### 1.3 Required Phrases

The following phrases **must be used** to describe intervention-outcome relationships:

| Required Phrase | Context of Use |
|---|---|
| "temporal association" | Primary replacement for causal language |
| "temporally associated with" | When describing timing relationships |
| "possible contributor" | When listing potential factors |
| "one of several possible contributors" | Emphasizing multiplicity of factors |
| "correlation signal" | Statistical framing of observed relationship |
| "observed co-occurrence" | Neutral description of parallel events |
| "concurrent change" | Describing simultaneous but not causal events |
| "direction consistent with improvement" | Outcome framing without causation |
| "moved in a direction consistent with" | Score change description |
| "statistically detectable pattern" | When statistical methods identify relationships |
| "potential explanatory factor" | Hypothesis-generating language |
| "not sufficient to establish causation" | Mandatory caveat |
| "cannot rule out alternative explanations" | Standard uncertainty language |
| "confounded by unmeasured variables" | Honest limitation statement |

### 1.4 Transition Language Templates

Use these sentence structures to transition from observation to appropriate qualification:

**Standard Transition (Always Required):**
> "While [INTERVENTION] was temporally associated with [OUTCOME_CHANGE], this observation alone does not establish causation. Other factors including [LIST_CONFOUNDS] may have contributed."

**Conservative Transition (Recommended Default):**
> "[OUTCOME_MEASURE] showed change in a direction consistent with [IMPROVEMENT/DECLINE] during the period when [INTERVENTION] was active. This temporal association may reflect intervention effects, natural variation, regression to the mean, concurrent treatments, or other unmeasured factors."

**Strong Caution Transition (When Data Is Limited):**
> "The observed change in [OUTCOME_MEASURE] occurred during a period with incomplete data on potential confounding variables. No reliable causal inference can be drawn. Results should be interpreted with substantial caution and reviewed with a clinician."

**Multiple Factors Transition:**
> "Multiple changes occurred during this period: [INTERVENTION], [MEDICATION_CHANGE], and [LIFE_EVENT]. The relative contribution of each factor cannot be determined from available data."

### 1.5 Statistical Language Guidelines

| Concept | Safe Phrasing | Unsafe Phrasing |
|---|---|---|
| p < 0.05 | "statistically detectable at conventional thresholds" | "significant" (without qualification) |
| Effect size | "observed magnitude of association was [size]" | "large effect" / "strong effect" |
| Confidence interval | "compatibility interval: [range]" or "the data are compatible with effects between X and Y" | "the true effect is between X and Y" |
| R-squared | "the model accounts for approximately X% of observed variance" | "X% of improvement explained by" |
| Correlation coefficient | "degree of statistical association: r = [value]" | "strength of relationship" |
| Trend line | "visual pattern in plotted data" | "trend shows" / "clear trend" |

---

## 2. Treatment Response Uncertainty

### 2.1 Individual Variability Framing

Patients respond differently to the same intervention due to genetic, environmental, psychological, and social factors. All outputs must acknowledge this variability.

**Required Language:**
- "Individual treatment responses vary substantially."
- "Your results may differ from group averages."
- "This pattern represents one patient's trajectory; it is not predictive of your outcome."
- "Past response does not guarantee future response."
- "Treatment effects are heterogeneous across individuals."

**Forbidden Language:**
- "Expected response" (implies predictability)
- "Typical improvement" (may create false expectations)
- "Patients like you improve by X%" (predictive without calibration)
- "You should expect similar results" (guarantees nothing)

### 2.2 Confidence Intervals vs. Point Estimates

Always present uncertainty ranges, never single numbers as definitive.

**Safe Format:**
> "Among patients with similar baseline characteristics in published studies, the observed range of PHQ-9 score change was -3 to -12 points (95% compatibility interval), with substantial variation. Individual outcomes cannot be predicted."

**Unsafe Format:**
> "Patients like you typically improve by 6 points on the PHQ-9."

### 2.3 "Your Results May Differ" Language

Every patient-facing output must include a statement of individual variability:

**Template:**
> "The information presented reflects patterns observed in available data. Your individual response to any intervention may differ due to factors including your specific clinical condition, concurrent treatments, genetic factors, life circumstances, and other variables not captured in this analysis. This information is not a prediction of your personal outcome."

**Abbreviated (for dashboards):**
> "Individual results vary. This is not a personalized prediction."

### 2.4 Subgroup Considerations

When data suggests differential effects across subgroups:

**Safe Language:**
- "This pattern was observed in a subset of patients with [CHARACTERISTIC]; it may not generalize to other populations."
- "Subgroup findings are hypothesis-generating and require confirmation in dedicated studies."
- "The number of patients with [CHARACTERISTIC] in this dataset is small; estimates are imprecise."
- "Effect modification by [FACTOR] is biologically plausible but not confirmed."

**Unsafe Language:**
- "This intervention works better for [GROUP]"
- "If you have [CHARACTERISTIC], you can expect [OUTCOME]"
- "Subgroup analysis proves differential effects"

### 2.5 Uncertainty Visualization Guidelines

When displaying data visually:
- Always include confidence/compatibility intervals where possible
- Use shading or error bars to represent uncertainty
- Include sample size indicators
- Label missing data points explicitly
- Never show trend lines without scatter/cloud data

---

## 3. Confounding Disclosures

### 3.1 Concurrent Medication Changes

Medication changes are among the most common confounders in intervention analytics. They must always be disclosed.

**Required Disclosure Template:**
> "During the observation period, the following medication changes occurred: [LIST]. The relative contribution of medication changes versus [INTERVENTION] to observed outcome changes cannot be determined from available data."

**Safe Language:**
- "Concurrent medication adjustments limit causal interpretation."
- "Medication changes co-occurred with the intervention period."
- "The observed pattern may reflect pharmacological changes, intervention effects, or their interaction."

**Unsafe Language:**
- "After controlling for medications, the intervention showed..." (unless formal causal methods were used)
- "The improvement was independent of medication changes" (cannot be established)

### 3.2 Life Events and Stressors

Life events substantially affect mental health outcomes but are often unmeasured.

**Required Template:**
> "Patient-reported and clinician-documented life events during this period include: [LIST_OR_'None documented']. Life events can substantially affect outcome measures independent of clinical interventions. Unreported or undocumented stressors may also be present."

**Standard Boilerplate:**
> "Life events, stressors, and psychosocial factors are known to influence the outcomes measured here. Not all such factors may be documented in the clinical record. The contribution of these factors to observed changes cannot be quantified."

### 3.3 Seasonal Effects

Seasonal variation affects mood disorders and other conditions.

**Required Template (when applicable):**
> "This observation period spans [SEASONS]. Seasonal variation is known to affect [CONDITION] outcomes, with [KNOWN_PATTERN]. Seasonal effects cannot be separated from intervention effects in this analysis."

**Standard Language:**
- "Seasonal effects are a potential confounding factor."
- "The observed timing overlaps with known seasonal patterns for this condition."

### 3.4 Placebo and Regression to the Mean

These statistical phenomena explain much of what appears to be treatment response.

**Placebo Effect Disclosure:**
> "In clinical trials, patients receiving placebo often show measurable improvement due to factors including expectation effects, natural healing, and the therapeutic relationship. The observed change here may partially or fully reflect these non-specific effects."

**Regression to the Mean Disclosure:**
> "Patients are often identified for intervention when their symptoms are at their most severe. By chance alone, subsequent measurements tend to be less extreme (regression to the mean). Studies suggest that a substantial portion of observed improvement in clinical settings may reflect this statistical phenomenon rather than intervention effects."

**Combined Disclosure:**
> "The observed change may reflect: (1) the natural course of the condition, (2) regression to the mean (tendency for extreme initial values to move toward average on repeat measurement), (3) placebo/contextual effects, (4) concurrent treatments, (5) life events, and (6) potential intervention effects. The relative contribution of each cannot be determined."

### 3.5 Confounding Disclosure Checklist

Every intervention summary must address:

- [ ] Concurrent medication changes
- [ ] Documented life events/stressors
- [ ] Seasonal timing
- [ ] Regression to the mean potential
- [ ] Natural history of the condition
- [ ] Hawthorne effect (being observed/measurement itself)
- [ ] Therapeutic relationship changes
- [ ] Healthcare utilization changes

---

## 4. Missing Data Handling

### 4.1 "Insufficient Data for Reliable Assessment"

This phrase must appear whenever data completeness falls below defined thresholds.

**Required Triggers:**
- Baseline data: < 80% of required fields complete
- Follow-up rate: < 70% of expected assessments
- Outcome data: Any period with > 30% missing values
- Demographic data: Missing age, sex, or primary diagnosis

**Template:**
> "Insufficient data is available for a reliable assessment. The following data elements are incomplete: [LIST]. Interpretation of any patterns would be unreliable. Please ensure complete data collection before proceeding with analysis."

### 4.2 Incomplete Baseline

**Template:**
> "Baseline assessment is incomplete ([X]% of required items missing). Without a complete baseline, outcome changes cannot be meaningfully interpreted. Baseline completion is required before intervention-outcome analysis can proceed."

### 4.3 Missing Follow-up

**Template:**
> "Expected follow-up assessments at [TIMEPOINTS] were not completed. The available data covers only [X]% of the intended observation period. Patterns in incomplete data may not represent the full intervention course. Missing assessments should be completed before drawing conclusions."

**Attrition Bias Note:**
> "Patients with missing follow-up data may differ systematically from those with complete data. If patients who did not respond to treatment were less likely to complete assessments, available data may overestimate benefit."

### 4.4 Data Quality Indicators

**Dashboard Elements:**

| Indicator | Display | Meaning |
|---|---|---|
| Data Completeness Score | 0-100% or color-coded | Overall completeness of required data |
| Baseline Status | Complete / Incomplete | Whether baseline assessment is usable |
| Follow-up Rate | X of Y expected | Proportion of expected assessments completed |
| Last Assessment | Date | Currency of data |
| Missing Items | List or count | Specific gaps in data |
| Confidence Level | High / Medium / Low / Insufficient | Derived composite of above factors |

**Safe Language for Quality Levels:**
- **High:** "Data completeness is adequate for exploratory review. Causal conclusions cannot be drawn."
- **Medium:** "Data is partially complete. Patterns should be interpreted with caution due to missing elements."
- **Low:** "Data completeness is concerning. Any observed patterns are unreliable."
- **Insufficient:** "Analysis cannot proceed due to inadequate data. Please complete required assessments."

---

## 5. Prediction vs. Context

### 5.1 "Not a Calibrated Prediction Model"

This statement must appear on any output that could be interpreted as predictive.

**Required Statement:**
> "This system is not a calibrated prediction model. It does not forecast individual patient outcomes, estimate probabilities of response, or provide prognostic information. It presents historical and contemporaneous data for contextual review only."

**Placement:** Must appear:
- In report footers
- On dashboard landing pages
- In tooltips for any visual element showing trends
- In patient-facing summaries

### 5.2 "Context Review" vs. "Prediction"

| Unsafe Term | Safe Replacement | Rationale |
|---|---|---|
| "Prediction" | "Context review" | Avoids implying prognostic capability |
| "Forecast" | "Trend review" | Avoids implying future projection |
| "Expected outcome" | "Reference range from literature" | Anchors to external data, not model output |
| "Risk score" | "Risk factor inventory" | Inventory is descriptive, not computed |
| "Likelihood of response" | "Response patterns in published data" | Shifts to population evidence |
| "Prognosis" | "Clinical trajectory to date" | Removes forward-looking implication |
| "Will improve" | "Has shown change consistent with" | Past tense, descriptive only |
| "Projected course" | "Observed course with historical reference" | Anchors to observation |

### 5.3 "Association Signal" vs. "Response"

| Unsafe Term | Safe Replacement |
|---|---|
| "Treatment response" | "Observed outcome change during treatment period" |
| "Clinical response" | "Score change meeting threshold during observation" |
| "Non-response" | "No detectable score change during observation period" |
| "Partial response" | "Score change of X points (interpretation requires clinical judgment)" |
| "Complete response" | "Score change to below threshold (clinical significance to be determined)" |
| "Responder" | "Patient with observed score change of >= X points" |
| "Non-responder" | "Patient without observed score change of >= X points" |

### 5.4 "Trend Review" vs. "Forecast"

**Safe Language for Trend Visualization:**
- "Historical data points shown for context"
- "Past trajectory, not predictive of future course"
- "Review of available measurements to date"
- "Observed pattern (may reflect measurement variation)"

**Required Trend Disclaimer:**
> "Lines connecting data points are for visual reference only and do not imply continuous measurement. Any pattern may reflect natural variation, measurement error, or true change. Past patterns do not predict future trajectories."

---

## 6. Clinician Oversight

### 6.1 "Requires Clinician Review" Placement

This statement must be prominently displayed:

**Required Locations:**
- Top banner of all patient-facing reports
- Header of every printed summary
- First element in email notifications
- Modal dialog on first dashboard access
- Footer of every page

**Template:**
> **CLINICAL REVIEW REQUIRED**  
> "This report is generated by an analytics system for decision-support purposes. It requires review and interpretation by a qualified healthcare professional. Do not make clinical decisions based solely on this output."

### 6.2 "Decision-Support Only" Prominence

The phrase "Decision-Support Only" must be:
- Displayed in the header of every output
- Included in all PDF exports
- Shown in the application title bar or persistent header
- Included in email subject lines

**Standard Header:**
> **[DECISION-SUPPORT ONLY - NOT FOR INDEPENDENT CLINICAL DECISION-MAKING]**

### 6.3 "Not a Substitute for Clinical Judgment"

**Required Statement:**
> "This system provides information to support clinical decision-making. It is not a substitute for professional medical advice, diagnosis, or treatment. Clinical judgment must always supersede system output. The treating clinician is solely responsible for all clinical decisions."

### 6.4 When to Flag for Urgent Review

The system must flag for urgent clinician review when:

| Condition | Flag Level | Required Action |
|---|---|---|
| Suicidal ideation scores elevated | CRITICAL | Immediate notification to treating clinician |
| Score indicates severe symptom range | HIGH | Urgent review flag within 24 hours |
| Sharp score increase (> 2 SD from prior) | HIGH | Review flag with 48-hour follow-up |
| Medication interaction detected | CRITICAL | Immediate alert |
| Missing data in critical safety measure | HIGH | Data collection alert |
| Multiple failed follow-up attempts | MEDIUM | Care team notification |
| Score crosses clinical threshold downward | MEDIUM | Routine review flag |

**Urgent Flag Template:**
> **URGENT CLINICAL REVIEW REQUIRED**  
> "[MEASURE] indicates [FINDING]. This requires review by the treating clinician.  
> **This alert does not constitute a diagnosis or clinical directive. It flags data for professional review.**  
> If this is an emergency, contact [EMERGENCY_NUMBER] or go to the nearest emergency department."

### 6.5 Clinician Oversight Checklist

Every output must include or reference:
- [ ] Decision-support only designation
- [ ] Clinician review requirement
- [ ] Not a substitute for clinical judgment statement
- [ ] System limitations disclosure
- [ ] Contact information for clinical questions
- [ ] Emergency guidance (when appropriate)
- [ ] Date of data extraction (currency indicator)
- [ ] Data quality summary

---

## 7. Regulatory Considerations

### 7.1 FDA Guidance on Clinical Decision Support (2022 / 2026 Update)

**Statutory Framework:** Under Section 520(o)(1)(E) of the FD&C Act, as amended by the 21st Century Cures Act, CDS software is excluded from the statutory definition of a "device" if it satisfies four criteria:

1. **No Signal/Image Analysis:** Not intended to acquire or analyze medical images, IVD signals, or physiological patterns
2. **Information Display Only:** Intended to display, analyze, or print medical information
3. **Support, Not Replace:** Intended to support or provide recommendations to HCPs about prevention, diagnosis, or treatment
4. **Independent Review Enabled:** Intended to enable HCPs to independently review the basis for recommendations

**Key Requirements for Non-Device CDS (from FDA Guidance, 2022/2026):**

- **Transparency:** The software must provide "plain language descriptions of the underlying algorithm development and validation"
- **Input Disclosure:** Required input medical information must be identified with "plain language instructions on how the inputs should be obtained, their relevance, and data quality requirements"
- **Logic Disclosure:** Summary of logic or methods (e.g., meta-analysis, statistical modeling, AI/ML techniques)
- **Validation Disclosure:** Description of data relied upon, including representativeness of patient population
- **Output Disclosure:** Relevant patient-specific information, knowns/unknowns, missing data identification
- **No Time-Critical Decisions:** Software for time-critical decisions where HCP cannot review basis does not qualify for exclusion
- **No Black Box:** Complex ML models must incorporate explainability features enabling genuine independent clinical assessment

**2026 Update Key Changes:**
- FDA now exercises enforcement discretion for single-output CDS where one recommendation is clinically appropriate
- Clarified definition of "medical information"
- Elevated usability and disclosure expectations
- Increased focus on mitigating automation bias

**Safety Copy Implications:**
> All outputs must "provide the HCP user with relevant patient-specific information and other knowns/unknowns for consideration (e.g., missing, corrupted, or unexpected input data values) that will enable the HCP to independently review the basis for the recommendations." -- FDA Clinical Decision Support Software Guidance, 2022/2026

### 7.2 EU MDR for Software Medical Devices

**Regulation (EU) 2017/745 (MDR)** governs clinical decision support software in Europe.

**Classification (MDCG 2019-11, Rule 11):**

| Healthcare Situation | Information Significance | MDR Classification |
|---|---|---|
| Critical | Treat or Diagnose | Class III |
| Critical | Drive Clinical Management | Class IIb |
| Critical | Inform Clinical Management | Class IIa |
| Serious | Treat or Diagnose | Class IIb |
| Serious | Drive Clinical Management | Class IIa |
| Serious | Inform Clinical Management | Class IIa |
| Non-serious | Any | Class IIa (minimum for diagnostic/therapeutic info) |

**Key Requirements:**
- **Class IIa minimum** for software providing information for diagnostic or therapeutic decisions
- **Conformity assessment** by Notified Body required
- **Clinical evidence** proportionate to risk classification
- **Post-market surveillance** including software-specific requirements
- **Transparency and explainability** for AI/ML-based systems
- **Risk management** per ISO 14971
- **Quality management system** (ISO 13485)

**Safety Copy Implications:**
- Software intended to "inform clinical management" in mental health contexts falls under Class IIa minimum
- All outputs must be transparent about basis, limitations, and uncertainty
- Documentation of intended purpose must match actual outputs
- Claims must not exceed validated intended use

### 7.3 TGA (Australia) Guidance

**Therapeutic Goods Act 1989** and associated regulations govern CDSS in Australia.

**Exemption Criteria (2021 reforms):** CDSS is exempt from ARTG inclusion if it meets ALL three criteria:

1. Does NOT directly process or analyze a medical image or signal from another medical device (including IVD)
2. Is solely used to provide or support a recommendation to a health professional about prevention, diagnosis, curing or alleviating disease
3. Does NOT replace the clinical judgement of a health professional

**Key Distinction:**
- "Making a diagnosis" = regulated medical device
- "Making a recommendation about diagnosis" = potentially exempt
- "Specifying treatment" = regulated medical device
- "Making a recommendation about treatment" = potentially exempt

**Requirements for Exempt CDSS:**
- Sponsor must notify TGA within 30 working days of supply
- Must comply with Essential Principles for safety and performance
- Adverse event reporting required
- Subject to recall actions or safety alerts
- Must comply with advertising requirements

**Excluded Categories (not regulated):**
- Consumer health products (wellness apps, fitness trackers)
- Digitization software (simple calculators, electronic health records)
- Population-based analytics (not for individual clinical use)

**Safety Copy Implications:**
- Software must not "replace clinical judgement" - explicit clinician oversight language is required
- Outputs must be clearly "recommendations" not "directives"
- Advertising and claims must comply with therapeutic goods regulations

### 7.4 Health Canada Guidance

**Software as a Medical Device (SaMD) Guidance** aligns with IMDRF framework.

**Inclusion Criteria:** Software is a medical device when:
1. Intended for one or more medical purposes as defined in the Act
2. Performs these purposes without being part of a hardware medical device

**CDS/PDS Categories:**
- **Clinical Decision Support (CDS):** For healthcare professionals
- **Patient Decision Support (PDS):** For patients/caregivers

**Key 2024/2025 Updates:**
- **Predetermined Change Control Plan (PCCP):** Mechanism for managing planned ML model changes
- Greater focus on real-world data, real-world evidence, and Sex and Gender Based Analysis Plus (SGBA+)
- Lowered threshold for "significant change" requiring license amendment
- Increased scrutiny of software performance, cybersecurity, and compatibility changes

**Safety Copy Implications:**
- All CDS/PDS intended for medical purposes requires clear intended use statement
- Claims must be supported by clinical evidence
- Software must not imply diagnostic or therapeutic capability beyond validated intended use
- Transparency about algorithm basis, data sources, and limitations required

### 7.5 IMDRF Risk Categorization Framework

The International Medical Device Regulators Forum (IMDRF) provides the globally harmonized risk framework:

| | Treat or Diagnose | Drive Clinical Management | Inform Clinical Management |
|---|---|---|---|
| **Critical** | Category IV | Category III | Category II |
| **Serious** | Category III | Category II | Category I |
| **Non-serious** | Category II | Category I | Category I |

**Note:** The IMDRF categories are not regulatory classifications but guide evidence requirements and regulatory approach.

---

## 8. Safe Copy Templates

### 8.1 Intervention Summary Template

```
INTERVENTION SUMMARY - DECISION-SUPPORT ONLY
[Patient Identifier] | [Date Range] | [Report Generated: DATE]

CLINICAL REVIEW REQUIRED: This summary requires interpretation by a qualified 
healthcare professional. It is not a substitute for clinical judgment.

---
INTERVENTION: [Intervention Name/Type]
PERIOD: [Start Date] to [End Date]
SESSIONS/ENCOUNTERS: [Number] of [Expected] completed

TEMPORAL ASSOCIATION WITH OUTCOMES:
The following outcome measures showed change during the intervention period:
- [Measure 1]: [Baseline] -> [Follow-up] ([Direction] of [Magnitude])
- [Measure 2]: [Baseline] -> [Follow-up] ([Direction] of [Magnitude])

CAUSAL INTERPRETATION: The timing of these changes overlaps with the 
intervention period. This temporal association does NOT establish that the 
intervention caused the observed changes. Other factors may have contributed.

CONCURRENT FACTORS TO CONSIDER:
- Medication changes: [List or "None documented"]
- Life events: [List or "None documented"]
- Seasonal effects: [Relevant seasonal considerations]
- Regression to the mean: [Assessment of baseline severity context]
- Other treatments: [List or "None documented"]

DATA QUALITY: [High / Medium / Low / Insufficient]
- Baseline completeness: [X]%
- Follow-up rate: [X]%
- Missing data: [Description]

LIMITATIONS:
- This analysis is based on [N] observations
- [X]% of expected data is missing
- Confounding variables may not be fully captured
- Individual results vary; this is not predictive of future outcomes

REQUIRES CLINICIAN REVIEW BEFORE ANY CLINICAL DECISION.
```

### 8.2 Outcome Association Template

```
OUTCOME ASSOCIATION REPORT - DECISION-SUPPORT ONLY

MEASURE: [Outcome Measure Name]
TIME PERIOD: [Start] to [End]

OBSERVED PATTERN:
Baseline: [Score] ([Severity Category])
Current/Final: [Score] ([Severity Category])
Change: [Magnitude] points ([Direction])

STATISTICAL CONTEXT:
- This magnitude of change was observed in [X]% of similar patients in [Reference]
- The 95% compatibility interval for change in this population is [Range]
- Individual variation is substantial

INTERPRETATION FRAMEWORK:
This change occurred during a period when [INTERVENTION] was active.
This temporal association does not establish causation.

Alternative explanations include:
1. Natural variation in symptom course
2. Regression to the mean (extreme initial scores tend toward average)
3. Placebo/contextual effects
4. Concurrent medication changes
5. Life events and psychosocial factors
6. Seasonal variation
7. Measurement variability
8. Therapeutic relationship effects

The relative contribution of each factor cannot be determined from 
observational data alone.

NOT A PREDICTION. REQUIRES CLINICAL INTERPRETATION.
```

### 8.3 Adverse Event / Concern Template

```
CLINICAL REVIEW FLAG - DECISION-SUPPORT ONLY
PRIORITY: [ROUTINE / ELEVATED / URGENT / CRITICAL]

FINDING:
[Measure] indicates [Observation] as of [Date].

This is an automated flag based on data patterns. It does not constitute 
a diagnosis or clinical directive.

RECOMMENDED ACTION:
Review by treating clinician is [recommended / required].

This flag was generated because:
[Criterion that triggered the flag]

IMPORTANT:
- This system cannot determine clinical significance
- Context from the treating clinician is essential
- Patient safety depends on professional clinical judgment
- If this is an emergency, contact [emergency contact] immediately

DATA BASIS:
- Source: [Data source]
- Date: [Assessment date]
- Completeness: [X]%
- Confounding factors: [List or "Unknown"]

NOT A DIAGNOSIS. NOT A CLINICAL DIRECTIVE. CLINICAL REVIEW REQUIRED.
```

### 8.4 Missing Data Template

```
DATA QUALITY ALERT - DECISION-SUPPORT ONLY

INSUFFICIENT DATA FOR RELIABLE ASSESSMENT

The following required data elements are incomplete:
[ ] Baseline assessment: [X]% complete (Threshold: 80%)
[ ] Follow-up assessments: [X] of [Y] completed (Threshold: 70%)
[ ] Outcome measures: [X]% missing
[ ] Demographic data: [Missing items]

IMPACT:
Analysis cannot proceed reliably with incomplete data. Any patterns 
identified in partial data may be misleading.

Missing data can arise from:
- Patient non-completion
- Administrative omission
- Technical issues
- Clinical judgment that assessment was not appropriate

RECOMMENDATION:
Complete missing assessments before generating intervention summaries.
If assessments were intentionally omitted, document the clinical rationale.

This data quality indicator does not reflect on patient care quality 
or clinical competence.
```

### 8.5 Report Footer Template

```
=============================================================================
DECISION-SUPPORT ONLY | NOT FOR INDEPENDENT CLINICAL DECISION-MAKING
=============================================================================

This report is generated by an analytics system intended to support, not 
replace, clinical judgment. It requires review and interpretation by a 
qualified healthcare professional.

LIMITATIONS:
- Correlation does not imply causation. Temporal associations between 
  interventions and outcomes do not establish that the intervention caused 
  the observed changes.
- Individual treatment responses vary. This report does not predict 
  individual outcomes.
- Confounding variables (concurrent treatments, life events, seasonal 
  effects, regression to the mean) may explain observed patterns.
- Missing data may bias results. Data quality is indicated above.
- This system is not a calibrated prediction model.

REGULATORY: This software is intended for decision-support purposes only.
It is not a medical device for diagnostic or treatment purposes.

Report generated: [DATE] | Data extracted: [DATE] | Data quality: [STATUS]
System version: [VERSION] | Review required by: [ROLE]

Questions? Contact: [CONTACT]
Emergencies: [EMERGENCY_CONTACT]
=============================================================================
```

### 8.6 Alert / Warning Template

```
+------------------------------------------------------------------+
|  [DECISION-SUPPORT ONLY - CLINICAL REVIEW REQUIRED]              |
|                                                                  |
|  ALERT TYPE: [TYPE]                                              |
|  PRIORITY: [LEVEL]                                               |
|                                                                  |
|  [DESCRIPTION OF WHAT TRIGGERED THE ALERT]                       |
|                                                                  |
|  This alert flags data for clinical review. It does NOT:         |
|  - Constitute a diagnosis                                        |
|  - Replace clinical judgment                                     |
|  - Direct any specific clinical action                           |
|  - Predict patient outcomes                                      |
|                                                                  |
|  REQUIRED ACTION: Review by treating clinician                   |
|                                                                  |
|  DATA CONTEXT:                                                   |
|  - Measure: [NAME]                                               |
|  - Current value: [VALUE]                                        |
|  - Previous value: [VALUE]                                       |
|  - Change: [MAGNITUDE]                                           |
|  - Data quality: [STATUS]                                        |
|  - Confounders: [LIST]                                           |
|                                                                  |
|  If emergency: Call [NUMBER] or go to nearest ED                 |
+------------------------------------------------------------------+
```

---

## 9. Example Transformations

### 9.1 Comprehensive Transformation Table

The following table presents 25+ examples of transforming unsafe clinical language into safe, decision-support-appropriate language:

| # | Unsafe (FORBIDDEN) | Safe (REQUIRED) |
|---|---|---|
| 1 | "Patient responded well to TMS" | "TMS sessions were completed; PHQ-9 scores moved in a direction consistent with improvement. This temporal association does not establish causation." |
| 2 | "TMS improved depression" | "TMS sessions were temporally associated with PHQ-9 reduction. Confounders include concurrent medication changes, life events, and regression to the mean. Causation cannot be inferred." |
| 3 | "Treatment was effective" | "Outcome scores changed during the treatment period. Multiple factors may have contributed. Clinical interpretation required." |
| 4 | "Medication caused side effects" | "Symptoms were reported during the medication period. Temporal association noted. Causality assessment requires clinical review." |
| 5 | "Patient failed antidepressant" | "Outcome scores did not show change meeting the predefined threshold during the medication trial period." |
| 6 | "Therapy worked" | "Therapy sessions occurred; outcome measures showed change. The contribution of therapy specifically cannot be isolated." |
| 7 | "The intervention was successful" | "The intervention was delivered as planned; observed outcome changes were in a direction consistent with goals. Confounders may explain part or all of the observed change." |
| 8 | "Patient is a responder" | "Patient's observed score change was >= [X] points on [Measure]. Clinical significance to be determined by treating clinician." |
| 9 | "Non-responder to treatment" | "No detectable score change of >= [X] points was observed during the treatment period. Alternative explanations include inadequate measurement, ongoing stressors, or treatment ineffectiveness." |
| 10 | "Significant improvement" | "Statistically detectable score change at conventional thresholds. Clinical significance requires independent assessment." |
| 11 | "Dramatic response to treatment" | "Large magnitude score change observed during intervention period. Attribution to intervention cannot be established." |
| 12 | "Treatment was a success" | "All planned sessions were completed. Outcome trajectory was consistent with goals. Multiple factors may have contributed." |
| 13 | "Drug proved effective" | "The observational data show a temporal association between medication initiation and score change. 'Efficacy' can only be established through randomized controlled trials." |
| 14 | "Patient benefited from therapy" | "Therapy was delivered; concurrent outcome changes were observed. Causal attribution requires controlled study evidence." |
| 15 | "The dose was therapeutic" | "The prescribed dose was administered. Any relationship between dose and observed changes cannot be determined from observational data." |
| 16 | "Clinical response achieved" | "Score changes met the predefined threshold during the observation period. This is a statistical observation, not evidence of biological response." |
| 17 | "Remission achieved" | "Scores fell below the clinical threshold at the most recent assessment. Sustained remission requires continued monitoring. Single timepoint below threshold is not definitive." |
| 18 | "Relapse occurred" | "Scores increased above the clinical threshold at the most recent assessment. This may reflect natural variation, new stressors, measurement timing, or true deterioration. Clinical assessment required." |
| 19 | "Patient is treatment-resistant" | "The patient has completed trials of [Interventions A, B, C] without observed score changes meeting the predefined threshold. This pattern is sometimes referred to as 'treatment-refractory' in literature, but each case requires individualized clinical assessment." |
| 20 | "Optimal treatment identified" | "Among the interventions documented, the period with [Intervention X] showed the largest observed score change. This comparison is confounded by timing, concurrent factors, and natural history. No optimal intervention can be identified from observational data." |
| 21 | "Treatment failure" | "The planned intervention course was completed. Outcome scores did not change in the anticipated direction. Possible explanations include: natural illness course, concurrent negative life events, inadequate intervention delivery, or true intervention ineffectiveness." |
| 22 | "Rapid responder" | "Score change of [X] points was observed within [Y] weeks. This trajectory was faster than average in reference data. Individual trajectories vary; this observation is not predictive." |
| 23 | "Maintained gains" | "Scores remained below baseline levels at follow-up assessment. Single follow-up data point; sustained change requires additional monitoring. Regression to the mean and natural history may explain persistence." |
| 24 | "Symptoms resolved" | "Symptom scores fell below the measurement threshold at the most recent assessment. 'Resolution' implies clinical judgment; scores alone cannot confirm symptom absence." |
| 25 | "Cognitive improvement from training" | "Cognitive test scores changed during the training program. Practice effects, learning effects, and regression to the mean are alternative explanations. Isolated cognitive training effects cannot be established." |
| 26 | "Intervention produced durable benefits" | "Outcome scores at [Time 2] were different from baseline. Durability cannot be assessed without continued follow-up. Attrition and measurement variability limit interpretation." |
| 27 | "Algorithm predicted clinical deterioration" | "Pattern recognition detected a score trajectory that, in historical data, was associated with subsequent adverse events. This is not a calibrated prediction. Clinical context required." |
| 28 | "AI recommends medication change" | "Data patterns were reviewed. Published evidence suggests [consideration]. This information is provided for clinical context. Treatment decisions remain the responsibility of the treating clinician." |

### 9.2 Special Case: TMS / Neuromodulation

TMS and other neuromodulation interventions require particularly careful language due to direct-to-consumer marketing of these treatments.

| Unsafe | Safe |
|---|---|
| "TMS improved mood" | "TMS sessions occurred; mood scale scores showed change during the treatment period" |
| "rTMS was effective for depression" | "rTMS was delivered; PHQ-9 scores moved in a direction consistent with improvement. Efficacy claims require RCT evidence." |
| "Patient responded to neurostimulation" | "The patient completed the planned neurostimulation course. Outcome data showed changes during the treatment period." |

### 9.3 Special Case: Psychotherapy

| Unsafe | Safe |
|---|---|
| "CBT reduced anxiety" | "CBT sessions were delivered; GAD-7 scores changed during the therapy period" |
| "Therapy was beneficial" | "Therapy was provided; outcome scores moved in a direction consistent with goals" |
| "Patient made progress" | "Outcome scores changed in a favorable direction. 'Progress' is a clinical judgment." |

### 9.4 Special Case: Pharmacotherapy

| Unsafe | Safe |
|---|---|
| "Medication improved symptoms" | "Medication was prescribed and reportedly taken; symptom scores changed during the medication period" |
| "Dose was effective" | "The prescribed dose was maintained; outcome changes were observed. Dose-response cannot be determined." |
| "Side effects caused discontinuation" | "The medication was discontinued after symptom onset. Causality assessment requires clinical review." |

---

## 10. Top 20 Safe Copy Rules

1. **Never use causal language.** Replace "caused," "resulted in," "led to," "produced," and "drove" with "was temporally associated with," "occurred during," or "was observed concurrent with."

2. **Always include the causation caveat.** Every intervention-outcome statement must include: "This temporal association does not establish causation" or equivalent.

3. **Replace "efficacy" with "observed change."** The term "efficacy" is reserved for randomized controlled trials. Use "outcome change," "score movement," or "observed pattern."

4. **Present confidence intervals, never point predictions.** Show ranges and uncertainty, never single numbers as definitive outcomes.

5. **Include "Your results may differ" on every patient-facing output.** Individual variability must be explicitly acknowledged.

6. **Disclose all concurrent interventions.** Medication changes, therapy changes, and other treatments must be listed and their confounding effect acknowledged.

7. **Acknowledge missing data explicitly.** State what data is missing, how much, and what impact it has on interpretation.

8. **Use "Decision-Support Only" on every output.** This must appear in headers, footers, and prominently in all reports.

9. **Require clinician review on every output.** Every report must state that clinical review is required and that the system is not a substitute for clinical judgment.

10. **Disclose regression to the mean.** When patients are selected for intervention at symptom peaks, acknowledge that statistical regression may explain observed improvement.

11. **Never say "predict," "forecast," or "project."** Use "context review," "trend review," "historical pattern," or "reference data."

12. **List confounders even when unknown.** Include "unmeasured confounders" and "other unknown factors" in all limitation statements.

13. **Use "correlation signal" not "response."** The term "response" implies biological causation. Use statistical or observational language instead.

14. **Include data quality indicators.** Every output must show data completeness, follow-up rate, and overall confidence level.

15. **Flag for urgent review when appropriate.** Safety-critical findings must trigger clinical review flags without implying diagnostic capability.

16. **Avoid "significant" without qualification.** Use "statistically detectable" or "meeting predefined threshold" and specify the threshold.

17. **Replace "benefited from" with neutral language.** Use "received [intervention]; concurrent changes were observed."

18. **Include seasonal and temporal context.** When relevant, note that seasonal effects may confound observed patterns.

19. **Never black-box the algorithm.** Provide plain-language description of methods, data sources, and limitations per FDA Criterion 4.

20. **Include emergency guidance.** When safety-critical measures are involved, always provide emergency contact information and guidance.

---

## Appendix A: Quick Reference - Word Substitution Guide

| Never Use | Always Use |
|---|---|
| Caused | Was temporally associated with |
| Proved efficacy | Showed observed change |
| Treatment worked | Outcome scores changed during treatment |
| Patient responded | Score change of [X] points observed |
| Effective | Was associated with outcome change |
| Response | Observed score change |
| Predicted | Identified in historical data |
| Forecast | Past trajectory review |
| Significant (alone) | Statistically detectable |
| Benefited from | Received; concurrent change observed |
| Resolved | Scores below threshold |
| Relapsed | Scores above threshold |
| Treatment failure | No detectable score change |
| Optimal treatment | Largest observed change (confounded) |
| Clinical response | Score meeting threshold |
| Efficacy signal | Association signal |
| Prognosis | Clinical trajectory to date |
| Risk score | Risk factor inventory |
| Expected outcome | Reference range from literature |
| Drove improvement | Co-occurred with improvement |

## Appendix B: Measurement-Based Care Communication Standards

Based on APA Guidelines for Measurement-Based Care (2023) and systematic review evidence:

1. **Transparency:** Provide clear rationale for measurement at the outset
2. **Collaboration:** Review data collaboratively with patients during sessions
3. **Shared interpretation:** Discuss results together, not as unilateral pronouncements
4. **Graphical feedback:** Use visualizations that are cognitively simple
5. **Contextual integration:** Supplement scores with clinical discussion
6. **Privacy assurance:** Explain who will access the data and where it is stored
7. **Crisis protocols:** Provide information about how to reach out in crisis
8. **Voluntary participation:** Respect patient right to refuse measurement
9. **Frequency:** Provide feedback as close to assessment time as possible
10. **Non-algorithmic:** MBC enhances clinical responsiveness, not replaces clinical judgment

## Appendix C: References

1. FDA Clinical Decision Support Software Guidance (2022; updated 2026). U.S. Food and Drug Administration.
2. Section 520(o)(1)(E) of the Federal Food, Drug, and Cosmetic Act (21st Century Cures Act).
3. Regulation (EU) 2017/745 (MDR) - Medical Device Regulation.
4. MDCG 2019-11: Guidance on Qualification and Classification of Software.
5. Therapeutic Goods Administration. Understanding clinical decision support software (2025).
6. Health Canada. Software as a Medical Device (SaMD) Guidance Document.
7. IMDRF SaMD Working Group. Risk Categorization Framework.
8. APA Guidelines for Measurement-Based Care (2023).
9. Boswell et al. Measurement-Based Care (APA Services, 2022).
10. McDonald CJ et al. How much of the placebo 'effect' is really statistical regression? Stat Med (1983).
11. Hrobjartsson A. Placebo response and effect in randomized clinical trials (2021).
12. CMS Clinical Decision Support: More Than Just 'Alerts' Tipsheet.

---

*This document was prepared for clinical analytics safety compliance. It should be reviewed by legal counsel and regulatory affairs before implementation in any clinical system. Requirements may vary by jurisdiction and intended use.*

**End of Document**
