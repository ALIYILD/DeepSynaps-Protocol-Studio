# DeepSynaps Video/Movement Analyzer: Clinical Validation Plan

## Prospective Multi-Site Clinical Agreement Study Protocol

---

**Document Version:** 1.0  
**Protocol ID:** DS-VMA-CLINVAL-001  
**Date:** 2025-08-28  
**Device Name:** DeepSynaps Video/Movement Analyzer  
**Regulatory Context:** FDA 510(k) Clinical Validation, EU MDR Clinical Evaluation  
**Aligned Standards:** ISO 14155:2020, FDA Guidance "Clinical Trial Endpoints for Parkinson's Disease"  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Study Objectives](#2-study-objectives)
3. [Study Design](#3-study-design)
4. [Primary Endpoints](#4-primary-endpoints)
5. [Secondary Endpoints](#5-secondary-endpoints)
6. [Sample Size Calculation](#6-sample-size-calculation)
7. [Inclusion & Exclusion Criteria](#7-inclusion--exclusion-criteria)
8. [Study Sites & Investigators](#8-study-sites--investigators)
9. [Study Procedures](#9-study-procedures)
10. [Statistical Analysis Plan](#10-statistical-analysis-plan)
11. [Bland-Altman Analysis](#11-bland-altman-analysis)
12. [Intraclass Correlation Coefficient (ICC) Analysis](#12-intraclass-correlation-coefficient-icc-analysis)
13. [Sensitivity & Specificity Analysis](#13-sensitivity--specificity-analysis)
14. [Inter-Rater Reliability](#14-inter-rater-reliability)
15. [Test-Retest Reliability](#15-test-retest-reliability)
16. [Data Management & Quality Assurance](#16-data-management--quality-assurance)
17. [Ethical Considerations](#17-ethical-considerations)
18. [Risk Assessment & Mitigation](#18-risk-assessment--mitigation)
19. [Timeline & Milestones](#19-timeline--milestones)
20. [References](#20-references)

---

## 1. Executive Summary

This document presents the clinical validation protocol for the DeepSynaps Video/Movement Analyzer, a clinical decision-support system that uses computer vision and machine learning to extract quantitative movement biomarkers from patient videos. The validation study is a prospective, multi-site, observational agreement study designed to demonstrate clinical validity and analytical accuracy for regulatory submission (FDA 510(k) and EU MDR).

**Study Type:** Prospective, multi-site, observational agreement study  
**Primary Objective:** Demonstrate agreement between video-derived movement biomarkers and gold standard clinical reference methods  
**Study Population:** Adults (18+ years) with movement disorders and healthy controls  
**Number of Sites:** 5 clinical sites across 3 geographic regions  
**Target Enrollment:** 450 participants  
**Study Duration:** 12 months (enrollment) + 2 months (analysis)  
**Regulatory Purpose:** Support FDA 510(k) premarket notification and EU MDR clinical evaluation  

**Biomarkers Validated:**

| Biomarker | Reference Method | Primary Metric |
|-----------|-----------------|----------------|
| Stride Length | Instrumented walkway (GAITRite) | Bland-Altman limits of agreement; ICC |
| Cadence | Instrumented walkway + footswitch | Bland-Altman; ICC |
| Gait Velocity | Instrumented walkway | Bland-Altman; ICC |
| Stride Time Variability | Instrumented walkway | Bland-Altman CV; ICC |
| Tremor Frequency | Triaxial accelerometer (APDM Opal) | Bland-Altman; ICC |
| Tremor Amplitude | Triaxial accelerometer | Bland-Altman; ICC |
| Postural Sway Area | Force platform (AMTI) | Bland-Altman; ICC |
| Hypomimia Score | Clinician-rated facial movement scale | Weighted Kappa; ICC |
| Movement Classification | Expert clinician consensus (blinded video review) | Sensitivity; Specificity; AUC |

---

## 2. Study Objectives

### 2.1 Primary Objective

To evaluate the agreement between movement biomarkers extracted by the DeepSynaps Video/Movement Analyzer and corresponding gold standard clinical reference measurements in adult patients with movement disorders and healthy controls.

### 2.2 Secondary Objectives

1. To assess inter-rater reliability of video-derived biomarkers when captured by different clinical operators
2. To assess test-retest reliability of video-derived biomarkers on repeat assessment within the same session
3. To evaluate the sensitivity and specificity of movement classification algorithms for distinguishing between movement disorder subtypes
4. To assess the clinical utility of the system as a decision-support tool for movement disorder assessment
5. To identify factors affecting measurement accuracy (camera angle, distance, lighting, patient demographics)
6. To establish normative ranges for each biomarker across age groups and demographic categories

### 2.3 Exploratory Objectives

1. To evaluate the correlation between video-derived biomarkers and clinical disease severity scales (MDS-UPDRS Part III, Tinetti, Berg Balance Scale)
2. To assess longitudinal reproducibility in a subset of participants returning for follow-up
3. To evaluate patient and clinician satisfaction with the system
4. To assess the impact of explainability features on clinical decision confidence

---

## 3. Study Design

### 3.1 Design Overview

This is a **prospective, multi-site, observational agreement study** with the following characteristics:

| Parameter | Specification |
|-----------|--------------|
| **Design** | Prospective, observational, cross-sectional with test-retest subset |
| **Sites** | 5 academic movement disorder centers |
| **Enrollment** | Target 450 participants over 12 months |
| **Comparison** | DeepSynaps Video Analyzer vs. gold standard reference methods |
| **Blinding** | Reference measurement raters blinded to video analysis results; video analysis is automated (no blinding possible) |
| **Controls** | Healthy age-matched controls (target 30% of cohort) |

### 3.2 Study Schema

```
SCREENING (Visit 0)
    |
    v
INFORMED CONSENT + DEMOGRAPHICS
    |
    v
CLINICAL ASSESSMENT
    - Medical history
    - Movement disorder diagnosis confirmation
    - Disease severity scales (MDS-UPDRS Part III, Tinetti, Berg)
    |
    v
VIDEO CAPTURE SESSION 1 (Operator A)
    - Standardized movement tasks
    - Simultaneous reference measurement
    |
    v
VIDEO CAPTURE SESSION 2 (Operator B) [test-retest subset, n=100]
    - Same tasks, different operator
    - Simultaneous reference measurement
    |
    v
REFERENCE MEASUREMENTS
    - Instrumented gait analysis (GAITRite)
    - Accelerometry (APDM Opal)
    - Force platform (AMTI)
    - Clinician video rating (blinded)
    |
    v
DEEPSYNAPS VIDEO ANALYSIS (automated)
    |
    v
DATA ANALYSIS
    - Agreement analysis
    - Reliability analysis
    - Subgroup analysis
    |
    v
STUDY COMPLETION
```

### 3.3 Study Arms

This is a single-arm agreement study with two cohorts:

| Cohort | Description | Target N | Purpose |
|--------|-------------|----------|---------|
| **Movement Disorder Cohort** | Patients with confirmed movement disorder diagnosis | 315 (70%) | Evaluate agreement in target population; assess sensitivity for abnormality detection |
| **Healthy Control Cohort** | Age- and sex-matched healthy individuals | 135 (30%) | Establish normative ranges; assess specificity |

### 3.4 Condition Distribution (Movement Disorder Cohort)

| Condition | Target N | % of Cohort | Rationale |
|-----------|----------|-------------|-----------|
| Parkinson's Disease (Hoehn & Yahr I-III) | 160 | 51% | Primary target condition; largest evidence base |
| Parkinson's Disease (Hoehn & Yahr IV) | 30 | 10% | Severe disease; assess performance with significant movement impairment |
| Essential Tremor | 40 | 13% | Pure tremor disorder; tremor validation |
| Cerebellar Ataxia | 25 | 8% | Ataxic gait pattern; assess classification |
| Atypical Parkinsonism (PSP, MSA, CBS) | 35 | 11% | Challenging differential diagnosis |
| Other movement disorders | 25 | 8% | Dystonia, Huntington's, drug-induced |

---

## 4. Primary Endpoints

### 4.1 Primary Endpoint Definition

The primary endpoint is the **agreement between video-derived movement biomarkers and gold standard reference measurements**, quantified by:

1. **Intraclass Correlation Coefficient (ICC)** using a two-way random-effects model for absolute agreement (ICC 2,1)
2. **Bland-Altman limits of agreement** (mean bias +/- 1.96 * SD)

### 4.2 Primary Endpoint by Biomarker

| Biomarker | Reference Method | Primary Metric | Acceptance Criterion |
|-----------|-----------------|----------------|---------------------|
| Stride Length | GAITRite instrumented walkway | ICC (2,1) | ICC >= 0.90 |
| Stride Length | GAITRite instrumented walkway | Bland-Altman mean bias | <= 5 cm |
| Cadence | GAITRite + footswitch | ICC (2,1) | ICC >= 0.90 |
| Cadence | GAITRite + footswitch | Bland-Altman mean bias | <= 2 steps/min |
| Gait Velocity | GAITRite instrumented walkway | ICC (2,1) | ICC >= 0.90 |
| Gait Velocity | GAITRite instrumented walkway | Bland-Altman mean bias | <= 5 cm/s |
| Stride Time Variability | GAITRite instrumented walkway | ICC (2,1) | ICC >= 0.85 |
| Tremor Frequency | APDM Opal accelerometer | ICC (2,1) | ICC >= 0.95 |
| Tremor Frequency | APDM Opal accelerometer | Bland-Altman mean bias | <= 0.5 Hz |
| Tremor Amplitude | APDM Opal accelerometer | ICC (2,1) | ICC >= 0.85 |
| Postural Sway Area | AMTI force platform | ICC (2,1) | ICC >= 0.85 |
| Hypomimia Score | Clinician-rated (blinded, 3-rater consensus) | Weighted Kappa | Kappa >= 0.70 |

### 4.3 Endpoint Hierarchy

Endpoints are assessed hierarchically to control Type I error:

1. **Co-Primary:** Stride Length ICC + Gait Velocity ICC (both must meet criterion)
2. **Key Secondary:** Cadence ICC, Tremor Frequency ICC (tested sequentially)
3. **Secondary:** All other ICC and Bland-Altman endpoints
4. **Exploratory:** Sensitivity, specificity, correlation with clinical scales

---

## 5. Secondary Endpoints

### 5.1 Inter-Rater Reliability

**Objective:** Assess whether video-derived biomarkers are consistent when captured by different clinical operators.

| Endpoint | Method | Acceptance |
|----------|--------|------------|
| Inter-rater ICC (Operator A vs. Operator B) | ICC (2,1) | >= 0.85 for all biomarkers |
| Mean absolute difference between operators | Paired t-test | No significant systematic bias (p > 0.05) |

### 5.2 Test-Retest Reliability

**Objective:** Assess whether video-derived biomarkers are consistent on repeated capture within the same session.

| Endpoint | Method | Acceptance |
|----------|--------|------------|
| Test-retest ICC (Session 1 vs. Session 2) | ICC (2,1) | >= 0.85 for all biomarkers |
| Minimal Detectable Change (MDC) | 1.96 * sqrt(2) * SEM | Reported for each biomarker |
| Coefficient of Variation (CV) | (SD/mean) * 100 | <= 10% for gait parameters; <= 15% for tremor |

### 5.3 Sensitivity and Specificity (Movement Classification)

**Objective:** Evaluate the ability of the movement classification algorithm to correctly identify movement disorder patterns.

| Classification Task | Reference Standard | Metrics |
|--------------------|-------------------|---------|
| Parkinsonian gait vs. normal gait | Expert consensus (2 movement disorder specialists) | Sensitivity, Specificity, AUC, PPV, NPV |
| Tremor present vs. absent | Accelerometer (APDM) + clinician rating | Sensitivity, Specificity, AUC |
| Ataxic gait vs. parkinsonian gait | Expert consensus | Sensitivity, Specificity, AUC |
| Bradykinesia present vs. absent | MDS-UPDRS Part III bradykinesia items (>= 2) | Sensitivity, Specificity, AUC |

**Acceptance Criteria:**
- Sensitivity >= 80% for all classification tasks
- Specificity >= 80% for all classification tasks
- AUC >= 0.85 for all classification tasks

### 5.4 Clinical Utility Assessment

| Endpoint | Method | Timing |
|----------|--------|--------|
| Clinician satisfaction | Custom questionnaire (5-point Likert) | End of study |
| Clinical decision confidence | Before/after system use comparison | Each session |
| Time to clinical assessment | Time-stamped workflow analysis | Each session |
| Perceived clinical utility | Standardized utility questionnaire | End of study |

---

## 6. Sample Size Calculation

### 6.1 Primary Endpoint: ICC Agreement

**Statistical Method:** Sample size calculation based on ICC agreement study using the method of Walter et al. (1998).

**Parameters:**

| Parameter | Value | Justification |
|-----------|-------|---------------|
| Null hypothesis ICC | 0.70 | Minimum acceptable agreement |
| Alternative hypothesis ICC | 0.90 | Target agreement (excellent) |
| Significance level (alpha) | 0.025 (one-sided) | Adjusted for co-primary endpoints |
| Power (1-beta) | 0.90 | Standard for clinical studies |
| Number of raters/measurements | 2 | Video vs. reference |

**Calculation:**

For stride length ICC testing (H0: ICC = 0.70 vs. H1: ICC = 0.90):

Using the formula: n = [2 * (Z_alpha + Z_beta)^2 * (1 - ICC_null)^2] / (ICC_alt - ICC_null)^2 + 1

With adjustment for finite sample and two co-primary endpoints:

- Required sample size per co-primary endpoint: **n = 68 participants**
- With 10% dropout rate: **n = 75 participants**

For the complete biomarker validation with 12 biomarkers:
- Bonferroni-adjusted alpha: 0.05 / 12 = 0.004
- Required sample size per biomarker: **n = 85**
- With 10% dropout: **n = 94**

### 6.2 Secondary Endpoint: Sensitivity/Specificity

**Parameters for tremor detection sensitivity:**

| Parameter | Value |
|-----------|-------|
| Expected sensitivity | 0.90 |
| Null sensitivity | 0.70 |
| Alpha | 0.05 |
| Power | 0.90 |
| Prevalence (tremor in movement disorder cohort) | 0.60 |

**Calculation:**
- Required participants with tremor: **n = 60**
- Total movement disorder cohort: **n = 60 / 0.60 = 100**
- With 10% dropout: **n = 110**

### 6.3 Secondary Endpoint: Inter-Rater Reliability

**Parameters:**

| Parameter | Value |
|-----------|-------|
| Expected ICC | 0.90 |
| Minimum acceptable ICC | 0.75 |
| Alpha | 0.05 |
| Power | 0.80 |
| Number of raters | 2 (operators) |

**Calculation:**
- Required sample: **n = 87 pairs**
- With 10% dropout: **n = 96**

### 6.4 Final Sample Size Determination

| Factor | Calculation | Result |
|--------|-------------|--------|
| Primary endpoint (largest required) | 94 per primary biomarker | 94 |
| Secondary endpoint (sensitivity) | 110 for tremor cohort | 110 |
| Inter-rater reliability | 96 pairs | 96 |
| Subgroup analysis (age, sex, FST) | 30 per subgroup; minimum 8 subgroups | 240 |
| Normative range establishment | 30 per age decade x 5 decades | 150 |
| **Total with overlap adjustment** | Largest single factor + 50% margin | **450** |

**Final Target Enrollment: 450 participants**

| Cohort | Target N | With 15% Over-enrollment |
|--------|----------|--------------------------|
| Movement Disorder | 315 | 362 |
| Healthy Control | 135 | 155 |
| **Total** | **450** | **517** |

**Test-retest subset:** 100 participants (randomly selected from full cohort)

---

## 7. Inclusion & Exclusion Criteria

### 7.1 Inclusion Criteria

All participants must meet the following criteria:

| Criterion | Requirement |
|-----------|-------------|
| **Age** | 18 years or older |
| **Consent** | Able to provide written informed consent (or guardian for cognitively impaired) |
| **Mobility** | Able to walk independently or with assistive device for at least 10 meters |
| **Communication** | Able to follow simple instructions for movement tasks (or caregiver assistance available) |
| **Video suitability** | Willing and able to be video-recorded for research purposes |
| **Diagnosis (movement disorder cohort)** | Confirmed movement disorder diagnosis by movement disorder specialist |

### 7.2 Exclusion Criteria

Participants will be excluded if any of the following apply:

| Criterion | Rationale |
|-----------|-----------|
| **Severe orthopedic limitation** | Unable to perform required movement tasks independently |
| **Recent surgery (< 3 months)** | Acute recovery affecting movement patterns |
| **Active vestibular disorder with acute vertigo** | Confounding movement disorder |
| **Severe visual impairment** | Safety concern for walking tasks |
| **Pregnancy (third trimester)** | Altered gait not related to target conditions |
| **Current participation in another interventional movement study** | Confounding intervention effects |
| **Inability to provide consent (without available guardian)** | Regulatory requirement |
| **Severe cognitive impairment (MMSE < 10)** | Unable to follow movement instructions |

### 7.3 Healthy Control Inclusion Criteria

| Criterion | Requirement |
|-----------|-------------|
| Age | Age- and sex-matched to movement disorder cohort |
| Health | No known neurological condition affecting movement |
| Medications | No medications affecting movement (e.g., beta-blockers, antipsychotics) |
| Screening | Normal neurological examination by study clinician |

---

## 8. Study Sites & Investigators

### 8.1 Site Selection

| Site | Location | Principal Investigator | Expected Enrollment |
|------|----------|----------------------|---------------------|
| Site 01 | Boston, MA | Dr. [Name], Movement Disorder Center | 100 |
| Site 02 | Cleveland, OH | Dr. [Name], Cleveland Clinic Neurological Institute | 100 |
| Site 03 | Houston, TX | Dr. [Name], Baylor College of Medicine | 90 |
| Site 04 | San Francisco, CA | Dr. [Name], UCSF Movement Disorder & Neuromodulation Center | 90 |
| Site 05 | Rochester, MN | Dr. [Name], Mayo Clinic Neurology | 70 |

### 8.2 Site Requirements

Each site must have:
- GAITRite instrumented walkway (or equivalent) for reference gait measurement
- APDM Opal triaxial accelerometers (or equivalent) for tremor reference
- AMTI force platform (or equivalent) for postural sway reference
- Standardized video capture setup (tripod, lighting, backdrop)
- Dedicated research coordinator
- IRB/Ethics Committee approval
- Delegation of authority log

---

## 9. Study Procedures

### 9.1 Visit Schedule

| Visit | Timepoint | Activities | Duration |
|-------|-----------|------------|----------|
| **V0 (Screening)** | Day -14 to -1 | Informed consent; eligibility assessment; demographics; medical history | 45 minutes |
| **V1 (Baseline)** | Day 0 | Clinical scales; video capture Session 1 + reference; video capture Session 2 (subset) | 90 minutes |
| **V2 (Follow-up)** | Month 6 (subset n=100) | Repeat video capture + reference; clinical scales | 60 minutes |

### 9.2 Standardized Movement Tasks

All participants perform the following tasks in order:

| Task | Description | Duration | Reference Measurement |
|------|-------------|----------|----------------------|
| T1. Quiet Standing | Stand still, feet together, arms at sides, eyes open | 30 seconds | Force platform (AMTI) |
| T2. Quiet Standing (EOC) | Stand still, feet together, eyes closed | 30 seconds | Force platform (AMTI) |
| T3. Rest Tremor Assessment | Seated, hands resting on thighs, relaxed | 30 seconds | Accelerometer (APDM) on most affected hand |
| T4. Postural Tremor Assessment | Arms outstretched forward, pronated, at shoulder height | 30 seconds | Accelerometer (APDM) on both hands |
| T5. Finger-to-Nose (Right) | Right hand, nose to examiner's finger, 3 repetitions | ~20 seconds | Video only (coordination assessment) |
| T6. Finger-to-Nose (Left) | Left hand, nose to examiner's finger, 3 repetitions | ~20 seconds | Video only (coordination assessment) |
| T7. 10-Meter Walk Test (Comfortable) | Walk 10 meters at comfortable self-selected speed | ~15 seconds | GAITRite instrumented walkway |
| T8. 10-Meter Walk Test (Fast) | Walk 10 meters at maximum safe speed | ~10 seconds | GAITRite instrumented walkway |
| T9. Timed Up and Go (TUG) | Stand from chair, walk 3 meters, turn, return, sit | ~15 seconds | Stopwatch + video |
| T10. Facial Expression Sequence | Smile, eyebrow raise, lip pursing, eye closure (each held 3 seconds) | ~30 seconds | Video only + clinician rating |

### 9.3 Video Capture Protocol

| Parameter | Specification |
|-----------|--------------|
| Camera | iPhone 13 or higher (standardized across sites) |
| Resolution | 1080p (1920 x 1080) |
| Frame Rate | 60 fps |
| Camera Position | Fixed tripod at 3.0 meters from walkway center |
| Camera Height | 1.0 meter from floor |
| Camera Angle | Frontal (0 degrees) for gait tasks; Sagittal (90 degrees) for TUG |
| Lighting | Ring light + room lights; target 300-500 lux |
| Background | Plain, light-colored wall or standardized backdrop |
| Audio | Recorded for task instruction verification |

### 9.4 Reference Measurement Protocol

**GAITRite Instrumented Walkway:**
- GAITRite Platinum (or equivalent) with active length >= 5 meters
- Calibrated per manufacturer specifications monthly
- Placed to capture at least 3 complete gait cycles per walk
- Gait parameters extracted: stride length, step length, cadence, velocity, stride time, stance time, swing time, double support time, stride time variability

**APDM Opal Accelerometers:**
- Triaxial accelerometers (128 Hz sampling)
- Placement: dorsal aspect of most affected hand (tremor tasks)
- Attachment: Elastic strap; consistent placement marked for test-retest
- Tremor parameters extracted: dominant frequency, amplitude (RMS), power spectral density, harmonic ratio

**AMTI Force Platform:**
- AccuGait (or equivalent) force platform
- Sampling: 1000 Hz
- Postural parameters extracted: sway area, sway path length, medio-lateral sway, anterior-posterior sway, sway velocity

**Clinician Video Rating:**
- 3 independent movement disorder specialists
- Blinded to: participant identity, diagnosis, video analysis results, other raters' scores
- Rating scales: standardized hypomimia score (0-4), presence/absence of tremor, gait pattern classification
- Inter-rater reliability target: Weighted Kappa >= 0.70

---

## 10. Statistical Analysis Plan

### 10.1 Analysis Populations

| Population | Definition | Use |
|------------|-----------|-----|
| **Intent-to-Analyze (ITA)** | All enrolled participants who complete at least one video capture + reference measurement | Primary analysis |
| **Per-Protocol (PP)** | All ITA participants without major protocol deviations | Sensitivity analysis |
| **Test-Retest Subset** | Randomly selected 100 participants who complete two capture sessions | Reliability analysis |
| **Healthy Control Subset** | ITA participants in healthy control cohort | Normative analysis |

### 10.2 Analysis Software

| Software | Version | Use |
|----------|---------|-----|
| R | 4.3+ | Primary statistical analysis |
| Python | 3.11+ | Data processing; machine learning analysis |
| SPSS | 29+ | Sensitivity analysis |
| SAS | 9.4+ | Regulatory submission tables |

### 10.3 Primary Analysis

**Intraclass Correlation Coefficient (ICC):**
- Model: Two-way random-effects, absolute agreement, single measure (ICC 2,1)
- Interpretation scale: < 0.50 = poor; 0.50-0.75 = moderate; 0.75-0.90 = good; > 0.90 = excellent
- 95% confidence interval reported for all ICC estimates
- Missing data handled via complete case analysis (primary) and multiple imputation (sensitivity)

**Bland-Altman Analysis:**
- Mean bias (DeepSynaps - Reference) reported with 95% CI
- Limits of agreement (bias +/- 1.96 * SD) reported
- Proportional bias tested via regression of difference on mean (slope significance)
- Bland-Altman plots generated for all biomarker pairs
- Clinical significance of mean bias assessed (is bias within acceptable clinical range?)

### 10.4 Secondary Analysis

**Inter-Rater Reliability:**
- ICC (2,1) between Operator A and Operator B video captures
- Paired t-test for systematic bias
- Bland-Altman plot for operator comparison

**Test-Retest Reliability:**
- ICC (2,1) between Session 1 and Session 2
- Standard Error of Measurement (SEM) = SD_pooled * sqrt(1 - ICC)
- Minimal Detectable Change (MDC) = 1.96 * SEM * sqrt(2)
- Coefficient of Variation (CV) = (SD_difference / mean) * 100

**Sensitivity/Specificity:**
- Confusion matrix for each classification task
- Sensitivity, Specificity, PPV, NPV with 95% CI (Clopper-Pearson)
- ROC curve with AUC (DeLong test for AUC comparison)
- Optimal threshold determined by Youden's J statistic

### 10.5 Subgroup Analysis

Pre-specified subgroup analyses will be performed for:

| Subgroup | Categories | Purpose |
|----------|------------|---------|
| Age group | 18-35, 36-64, 65-79, 80+ | Age-related performance variation |
| Sex | Female, Male | Sex-based performance comparison |
| FST Category | I-II, III-IV, V-VI | Skin-tone related performance |
| Disease severity | Mild (H&Y I-II), Moderate (H&Y III), Severe (H&Y IV+) | Performance across disease spectrum |
| Camera condition | Optimal, Suboptimal | Robustness assessment |
| BMI category | < 25, 25-30, > 30 | Body habitus performance |

**Multiplicity Control:** Subgroup analyses are exploratory; no formal multiplicity adjustment. Results interpreted cautiously with acknowledgment of multiple comparisons.

### 10.6 Missing Data Handling

| Scenario | Approach |
|----------|----------|
| Missing reference measurement | Exclude from agreement analysis for that biomarker only |
| Missing video capture | Exclude from analysis; document reason |
| Technical failure (equipment) | Schedule repeat visit within 7 days |
| Partial task completion | Include available tasks; document reasons for incomplete tasks |
| Missing covariate | Complete case for affected analysis; multiple imputation for sensitivity |

### 10.7 Interim Analysis

No formal interim analysis is planned. A single interim data review will occur at 50% enrollment (n ~ 225) to assess:
- Enrollment rate and feasibility
- Safety events
- Preliminary ICC estimates (blinded to treatment arm -- not applicable for single-arm study)
- Sample size re-estimation (conditional power)

### 10.8 Sensitivity Analyses

| Analysis | Description | Purpose |
|----------|-------------|---------|
| Per-protocol | Exclude participants with major protocol deviations | Robustness of primary findings |
| Multiple imputation | Impute missing data using MICE | Missing data robustness |
| Outlier exclusion | Exclude outliers > 3 SD from mean bias | Outlier influence assessment |
| Site-adjusted | Include site as random effect in ICC model | Site variation assessment |

---

## 11. Bland-Altman Analysis

### 11.1 Bland-Altman Methodology

Bland-Altman analysis will be performed for all continuous biomarkers to assess:
- Systematic bias (mean difference between methods)
- Random error (SD of differences)
- Limits of agreement (mean difference +/- 1.96 * SD)
- Proportional bias (trend of difference with magnitude)

### 11.2 Bland-Altman Specifications

| Parameter | Setting |
|-----------|---------|
| X-axis | Mean of DeepSynaps and Reference values |
| Y-axis | Difference (DeepSynaps - Reference) |
| Bias line | Mean difference (solid line) |
| LOA lines | Mean +/- 1.96 * SD (dashed lines) |
| Confidence intervals | 95% CI for bias and LOA |
| Proportional bias | Regression of difference on mean; test slope = 0 |

### 11.3 Bland-Altman Acceptance Criteria

| Biomarker | Max Acceptable Mean Bias | Max Acceptable LOA Range |
|-----------|-------------------------|-------------------------|
| Stride Length | 5 cm | +/- 15 cm |
| Cadence | 2 steps/min | +/- 6 steps/min |
| Gait Velocity | 5 cm/s | +/- 15 cm/s |
| Stride Time Variability | 0.5% CV | +/- 2% CV |
| Tremor Frequency | 0.5 Hz | +/- 1.5 Hz |
| Tremor Amplitude | 15% relative | +/- 45% relative |
| Postural Sway Area | 20% relative | +/- 60% relative |

---

## 12. Intraclass Correlation Coefficient (ICC) Analysis

### 12.1 ICC Model Selection

| Parameter | Setting | Justification |
|-----------|---------|---------------|
| Model | Two-way random effects | Both video and reference methods are random samples of possible measurement methods |
| Type | Absolute agreement | Interested in actual agreement, not just consistency |
| Unit | Single measure | Single video capture vs. single reference measurement |
| Formulation | ICC (2,1) per Shrout & Fleiss | Standard for method comparison studies |

### 12.2 ICC Interpretation

| ICC Value | Interpretation | Clinical Action |
|-----------|---------------|----------------|
| < 0.50 | Poor agreement | Not suitable for clinical use |
| 0.50 - 0.75 | Moderate agreement | Limited clinical utility; may be useful for screening |
| 0.75 - 0.90 | Good agreement | Suitable for clinical decision-support |
| 0.90 - 0.95 | Excellent agreement | Suitable for clinical monitoring and research |
| > 0.95 | Outstanding agreement | Suitable for individual patient clinical decisions |

---

## 13. Sensitivity & Specificity Analysis

### 13.1 Classification Tasks

| Task | Positive Class | Negative Class | Reference Standard |
|------|---------------|---------------|-------------------|
| Tremor Detection | Tremor present | No tremor | APDM accelerometer (power > 3x baseline) + clinician rating |
| Gait Abnormality | Abnormal gait pattern | Normal gait | Expert consensus (2 blinded specialists) |
| Bradykinesia Detection | Bradykinesia present | No bradykinesia | MDS-UPDRS bradykinesia items (finger tapping, hand movements, pronation-supination) >= 2 on any item |
| Ataxia vs. Parkinsonian Gait | Ataxic gait | Parkinsonian gait | Expert consensus in participants with confirmed diagnoses |

### 13.2 ROC Analysis

- ROC curves generated for each classification task
- AUC calculated with 95% CI (DeLong method)
- Optimal cutoff determined by Youden's J statistic
- Sensitivity and specificity reported at optimal cutoff
- Clinical utility considered for cutoff selection (may prioritize sensitivity over specificity)

---

## 14. Inter-Rater Reliability

### 14.1 Design

- 100 randomly selected participants undergo duplicate video capture
- Two trained operators (Operator A and Operator B) capture independent videos
- Same equipment, same room, same lighting conditions
- Captures performed sequentially (not simultaneously)
- Operators blinded to each other's results

### 14.2 Analysis

- ICC (2,1) for continuous biomarkers
- Weighted Kappa for categorical classifications
- Bland-Altman plots for operator comparison
- Paired t-test for systematic bias detection

---

## 15. Test-Retest Reliability

### 15.1 Design

- 100 randomly selected participants complete two identical assessment sessions
- Minimum 15-minute rest between sessions
- Same operator for both sessions (to isolate test-retest from inter-rater)
- Same equipment and conditions

### 15.2 Analysis

- ICC (2,1) between Session 1 and Session 2
- SEM and MDC calculation
- Bland-Altman plots
- Coefficient of Variation (CV)
- Learning effect assessment (paired t-test for systematic difference)

---

## 16. Data Management & Quality Assurance

### 16.1 Data Collection

| System | Purpose | Validation |
|--------|---------|------------|
| REDCap | Electronic Case Report Forms (eCRF); demographics; clinical scales | Double data entry for 10% of records |
| DeepSynaps Platform | Automated video analysis; biomarker outputs | Algorithm version controlled; validation run on every deployment |
| GAITRite Software | Reference gait parameters | Calibration log; monthly QC |
| APDM Mobility Lab | Reference tremor parameters | Calibration per manufacturer; monthly QC |
| AMTI Software | Reference postural parameters | Calibration log; monthly QC |

### 16.2 Data Quality Procedures

- Range checks for all biomarker values
- Logic checks (e.g., stride length must be positive)
- Outlier flagging (> 3 SD from cohort mean)
- Missing data tracking and reporting
- Source data verification for 20% of participants

### 16.3 Data Security

- All data encrypted at rest (AES-256) and in transit (TLS 1.3)
- Role-based access control
- Audit trail for all data access
- HIPAA-compliant storage and transmission
- Data retention per institutional policy (minimum 7 years post-study)

---

## 17. Ethical Considerations

### 17.1 Regulatory Approvals

- IRB/Ethics Committee approval at each site before enrollment
- FDA Investigational Device Exemption (IDE) not required (non-significant risk determination)
- ClinicalTrials.gov registration before first enrollment
- EU Clinical Trials Information System (CTIS) registration for EU sites

### 17.2 Informed Consent

The informed consent process includes:
- Study purpose and procedures
- Video recording and data use
- Risks and benefits
- Confidentiality protections
- Right to withdraw without penalty
- Data sharing and future research use (optional, separate consent)
- Contact information for questions

### 17.3 Data Privacy

- All participant data de-identified using unique study IDs
- Video recordings stored separately from clinical data
- Facial blurring option available for participants who request it (analysis uses unblurred video)
- Data sharing only in aggregate form
- GDPR compliance for EU participants

### 17.4 Vulnerable Populations

- Cognitively impaired participants: Guardian consent + participant assent
- Pregnant women: Excluded in third trimester only
- Prisoners: Not included
- Children: Not included (adults 18+ only; separate pediatric validation planned)

---

## 18. Risk Assessment & Mitigation

| Risk | Probability | Severity | Mitigation |
|------|-------------|----------|------------|
| Falls during walking tasks | Low | High | GAITRite walkway with non-slip surface; researcher within arm's reach; gait belt if indicated |
| Musculoskeletal injury | Very Low | Moderate | Warm-up period; participants instructed to perform at comfortable pace; stop if pain |
| Psychological distress from video recording | Low | Low | Optional participation; can withdraw at any time; privacy protections explained |
| Data breach | Very Low | High | Encryption; access controls; audit trail; HIPAA compliance |
| Incorrect biomarker affecting clinical care | Low | High | Decision-support only design; all results reviewed by clinician; uncertainty flags |

---

## 19. Timeline & Milestones

| Phase | Activity | Timeline | Duration |
|-------|----------|----------|----------|
| **Preparation** | | | |
| | Protocol finalization | Month 1-2 | 2 months |
| | IRB/Ethics approval | Month 2-4 | 2 months |
| | Site training + initiation | Month 3-4 | 1 month |
| | ClinicalTrials.gov registration | Month 4 | -- |
| **Enrollment** | | | |
| | Enrollment begins | Month 5 | -- |
| | 25% enrolled | Month 7 | -- |
| | 50% enrolled (interim review) | Month 9 | -- |
| | 75% enrolled | Month 11 | -- |
| | 100% enrolled | Month 14 | -- |
| **Analysis** | | | |
| | Database lock | Month 15 | -- |
| | Primary analysis | Month 15-16 | 1 month |
| | Report writing | Month 16-17 | 1 month |
| | Final report | Month 17 | -- |
| **Total Study Duration** | | | **17 months** |

---

## 20. References

1. Bland, J.M. & Altman, D.G. (1986). "Statistical methods for assessing agreement between two methods of clinical measurement." Lancet, 1(8476):307-310.
2. Shrout, P.E. & Fleiss, J.L. (1979). "Intraclass correlations: uses in assessing rater reliability." Psychological Bulletin, 86(2):420-428.
3. Koo, T.K. & Li, M.Y. (2016). "A guideline of selecting and reporting intraclass correlation coefficients for reliability research." Journal of Chiropractic Medicine, 15(2):155-163.
4. Walter, S.D. et al. (1998). "Confidenceestimation for intraclass correlation in reliability studies." Statistics in Medicine, 17(13):1509-1524.
5. ISO 14155:2020. "Clinical investigation of medical devices for human subjects -- Good clinical practice."
6. FDA. (2023). "Clinical Trial Endpoints for Parkinson's Disease." Guidance Document.
7. FDA. (2021). "Good Machine Learning Practice for Medical Device Development: Guiding Principles."
8. IMDRF. (2017). "Software as a Medical Device (SaMD): Clinical Evaluation." December 2017.
9. Goetz, C.G. et al. (2008). "Movement Disorder Society-sponsored revision of the Unified Parkinson's Disease Rating Scale (MDS-UPDRS)." Movement Disorders, 23(15):2121-2170.
10. Tinetti, M.E. (1986). "Performance-oriented assessment of mobility problems in elderly patients." Journal of the American Geriatrics Society, 34(2):119-126.
11. Berg, K. et al. (1992). "Measuring balance in the elderly: validation of an instrument." Canadian Journal of Public Health, 83(S2):S7-S11.
12. DeepSynaps Protocol Studio. "VIDEO_ANALYZER_FDA_SaMD_CLASSIFICATION.md." Regulatory Strategy Document, 2025.
13. DeepSynaps Protocol Studio. "VIDEO_ANALYZER_BIAS_TESTING_PROTOCOL.md." Bias Testing Protocol, 2025.

---

*Document Control: This protocol is controlled under the DeepSynaps Quality Management System. Any modifications require IRB amendment and regulatory notification.*

*Protocol Version: 1.0*
*Next Review Date: Following FDA Q-Sub feedback*
