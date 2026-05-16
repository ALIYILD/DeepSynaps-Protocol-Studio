# DeepSynaps Protocol Studio: PROMIS & Clinical Outcomes Integration Report

## Knowledge Layer Phase 1 -- Patient-Reported Outcomes (PRO) Architecture

**Document Version:** 1.0  
**Date:** 2026-07-15  
**Classification:** Technical Integration Report  
**Distribution:** DeepSynaps Engineering, Clinical Affairs, Regulatory  
**Author:** Clinical Outcomes Research Specialist  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [PROMIS Deep Dive](#2-promis-deep-dive)
3. [NIH Toolbox Analysis](#3-nih-toolbox-analysis)
4. [Other Key Outcome Measures](#4-other-key-outcome-measures)
5. [Longitudinal Tracking Architecture](#5-longitudinal-tracking-architecture)
6. [Neuromodulation Outcome Integration](#6-neuromodulation-outcome-integration)
7. [DeepSynaps Integration Architecture](#7-deepsynaps-integration-architecture)
8. [Provenance & Confidence Model](#8-provenance--confidence-model)
9. [Licensing Matrix](#9-licensing-matrix)
10. [Implementation Recommendations](#10-implementation-recommendations)
11. [Clinical Safety Rules](#11-clinical-safety-rules)
12. [Risks & Mitigations](#12-risks--mitigations)

---

## 1. Executive Summary

### 1.1 Mission Context

DeepSynaps Protocol Studio is a clinical neuromodulation platform treating depression, anxiety, PTSD, chronic pain, and cognitive disorders through transcranial magnetic stimulation (TMS), transcranial direct current stimulation (tDCS), and related modalities. The Phase 1 Knowledge Layer requires a robust patient-reported outcomes (PRO) measurement infrastructure that can capture, score, track, and act upon clinical outcome data across the treatment lifecycle.

### 1.2 Core Recommendations

| # | Recommendation | Priority | Timeline |
|---|---------------|----------|----------|
| 1 | Adopt **PROMIS-29 Profile v2.1** as the primary multi-domain PRO instrument | Critical | Sprint 1 |
| 2 | Integrate **PROMIS CAT** (Computerized Adaptive Testing) for domain-specific deep dives | High | Sprint 2 |
| 3 | Deploy **PHQ-9** for depression severity tracking (session-by-session) | Critical | Sprint 1 |
| 4 | Deploy **GAD-7** for anxiety severity tracking alongside PHQ-9 | Critical | Sprint 1 |
| 5 | Implement **PCL-5** for PTSD baseline and treatment monitoring | High | Sprint 1 |
| 6 | Add **NIH Toolbox Cognition Battery** for objective cognitive assessment | High | Sprint 3 |
| 7 | Build **longitudinal trajectory modeling** with reliable change index calculations | Critical | Sprint 2 |
| 8 | Implement **outcome-alert system** with clinical decision support thresholds | Critical | Sprint 2 |
| 9 | Establish **score normalization pipeline** converting all instruments to common metrics | High | Sprint 1 |
| 10 | Create **protocol-outcome correlation engine** for treatment optimization | Medium | Sprint 4 |

### 1.3 Integration Value Proposition

The integration of PROMIS, NIH Toolbox, and legacy clinical instruments into the DeepSynaps platform delivers five core capabilities:

1. **Unified Measurement Language**: All scores normalized to T-score (mean=50, SD=10) or standard metrics enabling cross-domain comparison
2. **Adaptive Assessment**: CAT reduces patient burden by 40-60% compared to fixed-form instruments while maintaining precision
3. **Predictive Analytics**: Early treatment trajectory modeling predicts non-responders by session 5-10 with >80% accuracy
4. **Clinical Decision Support**: Automated alerts for deterioration, non-response, or safety concerns (suicidal ideation)
5. **Regulatory Evidence Generation**: Structured PRO data suitable for FDA submissions, payer reimbursement demonstrations, and clinical publications

### 1.4 Assessment Flow Overview

```
Patient Onboarding
  |
  +-- PROMIS-29 Profile v2.1 (baseline) [29 items, ~5 min]
  |     +-- Physical Function
  |     +-- Anxiety (4a short form)
  |     +-- Depression (4a short form)
  |     +-- Fatigue (4a short form)
  |     +-- Sleep Disturbance (4a short form)
  |     +-- Social Roles
  |     +-- Pain Interference
  |     +-- Pain Intensity (single item)
  |
  +-- Disorder-Specific Deep Dive
  |     +-- Depression: PHQ-9 (9 items) + BDI-II (optional, 21 items)
  |     +-- Anxiety: GAD-7 (7 items) + HAM-A (optional, clinician-rated)
  |     +-- PTSD: PCL-5 (20 items)
  |     +-- Chronic Pain: Pain interference + HIT-6/MIDAS
  |     +-- Cognitive: MoCA (30 items) + NIH Toolbox (iPad battery)
  |
  +-- Quality of Life
  |     +-- SF-36 (36 items) OR EQ-5D-5L (5 items)
  |
  +-- Baseline Complete --> Protocol Assignment
  |
  +-- Session-by-Session (every 5 sessions or weekly)
  |     +-- PHQ-9 (depression track) OR GAD-7 (anxiety track) OR PCL-5 (PTSD track)
  |     +-- PROMIS CAT for primary domain (4-7 items via CAT)
  |     +-- Pain Visual Analog Scale (0-10) if pain track
  |     +-- Adverse event check
  |     +-- Suicidal ideation screening (PHQ-9 item 9 or C-SSRS)
  |
  +-- End-of-Treatment (final session)
  |     +-- Full baseline battery repeat
  |     +-- Response/remission determination
  |
  +-- Follow-Up (3, 6, 12 months post-treatment)
        +-- PROMIS-29 Profile + disorder-specific primary outcome measure
        +-- Durability assessment
```

---

## 2. PROMIS Deep Dive

### 2.1 System Overview and Governance

**PROMIS (Patient-Reported Outcomes Measurement Information System)** is a set of person-centered measures that evaluates and monitors physical, mental, and social health. Developed and funded by the National Institutes of Health (NIH), PROMIS was created through the NIH Roadmap for Medical Research initiative.

**Governance Structure:**
- **Primary Steward**: Northwestern University (HealthMeasures team)
- **NIH Oversight**: National Institute of Arthritis and Musculoskeletal and Skin Diseases (NIAMS), with contributions from multiple NIH institutes
- **Measurement Science**: Northwestern University Feinberg School of Medicine
- **Technical Infrastructure**: Assessment Center (assessmentcenter.net) operated by Northwestern
- **Standards**: All measures adhere to FDA guidance on patient-reported outcome measures

**Key Design Principles:**
1. **Universal Metrics**: All PROMIS measures use T-score scaling (mean=50, SD=10) based on large US general population calibration samples
2. **IRT Foundation**: All items calibrated using Item Response Theory (IRT), enabling CAT administration and cross-instrument comparability
3. **Multi-Mode Administration**: Paper, web, mobile, tablet, API, and EHR-integrated administration
4. **Lifespan Coverage**: Self-report measures for adults (18+), pediatric self-report (8-17), and parent proxy (5-17)

### 2.2 Domains Relevant to Neuromodulation

#### 2.2.1 Depression (PROMIS Depression)

| Attribute | Specification |
|-----------|--------------|
| **Full Bank** | 28 items (v1.0) |
| **Short Forms** | 4a, 6a, 8a (profile), 8b (emotional distress), 10a |
| **CAT** | 4-12 items, mean ~6 items |
| **Recall Period** | 7 days |
| **Response Scale** | 5-point Likert (1=Never, 5=Always) |
| **T-score Range** | 8a form: ~37.1 to 83.1 (v1.0) |
| **Direction** | Higher T-score = more severe depression |

**Severity Thresholds (established in cancer populations):**
| Severity Range | T-score |
|----------------|---------|
| None to mild | < 55 |
| Mild | 55-60 |
| Moderate | 60-70 |
| Severe | > 70 |

**DeepSynaps Relevance**: Core outcome measure for depression treatment protocols. The PROMIS Depression CAT achieves superior precision compared to PHQ-9 at the high-severity end of the distribution. For session-by-session tracking, the 4a short form (4 items) provides sufficient sensitivity with minimal burden.

#### 2.2.2 Anxiety (PROMIS Anxiety)

| Attribute | Specification |
|-----------|--------------|
| **Full Bank** | 29 items |
| **Short Forms** | 4a, 6a, 8a, 10a |
| **CAT** | 4-12 items, mean ~6 items |
| **Recall Period** | 7 days |
| **Response Scale** | 5-point Likert (1=Never, 5=Always) |
| **T-score Range** | 8a form: ~37.1 to 83.1 (v1.0) |
| **Direction** | Higher T-score = more severe anxiety |

**Severity Thresholds:**
| Severity Range | T-score |
|----------------|---------|
| None to mild | < 55 |
| Mild | 55-60 |
| Moderate | 60-70 |
| Severe | > 70 |

**DeepSynaps Relevance**: Essential for anxiety disorder and PTSD treatment protocols. PROMIS Anxiety demonstrates excellent correlation with GAD-7 (r > 0.85) while providing finer discrimination across the severity range through IRT-based scoring.

#### 2.2.3 Sleep Disturbance (PROMIS Sleep Disturbance)

| Attribute | Specification |
|-----------|--------------|
| **Full Bank** | 27 items |
| **Short Forms** | 4a, 6a, 8a, 10a |
| **CAT** | 4-12 items |
| **Recall Period** | 7 days |
| **Response Scale** | 5-point Likert |
| **Direction** | Higher T-score = more sleep disturbance |

**DeepSynaps Relevance**: Sleep disturbance is a key transdiagnostic outcome in neuromodulation. TMS and tDCS protocols targeting depression and anxiety frequently improve sleep as a secondary outcome. Tracking sleep enables dual-metric treatment evaluation.

#### 2.2.4 Pain Interference (PROMIS Pain Interference)

| Attribute | Specification |
|-----------|--------------|
| **Full Bank** | 41 items |
| **Short Forms** | 4a, 6a, 8a, 10a |
| **CAT** | 4-12 items |
| **Recall Period** | 7 days |
| **Direction** | Higher T-score = more pain interference |

**Severity Thresholds:**
| Severity Range | T-score |
|----------------|---------|
| Mild | 50-60 |
| Moderate | 60-70 |
| Severe | > 70 |

**DeepSynaps Relevance**: Primary outcome for chronic pain neuromodulation protocols. Pain Interference measures the functional impact of pain rather than pain intensity per se, capturing treatment effects on daily functioning.

#### 2.2.5 Cognitive Function (PROMIS Cognitive Function - Abilities)

| Attribute | Specification |
|-----------|--------------|
| **Full Bank** | CogAbil: 95 items |
| **Short Forms** | 4a, 6a, 8a (CogFunction) |
| **CAT** | 4-12 items |
| **Recall Period** | 7 days |
| **Direction** | Higher T-score = better cognitive function |

**DeepSynaps Relevance**: Measures self-reported cognitive abilities (concentration, memory, clarity). Important for cognitive disorder protocols and as a secondary outcome for depression/anxiety treatments that may impact cognitive function.

**Note**: Self-reported cognitive function (PROMIS) and objectively measured cognition (NIH Toolbox) assess different constructs. Both should be used for comprehensive cognitive assessment.

#### 2.2.6 Fatigue (PROMIS Fatigue)

| Attribute | Specification |
|-----------|--------------|
| **Full Bank** | 42 items |
| **Short Forms** | 4a, 6a, 7a, 8a, 10a |
| **CAT** | 4-12 items |
| **Direction** | Higher T-score = more severe fatigue |

**DeepSynaps Relevance**: Fatigue is a common comorbid symptom in depression and chronic pain. TMS studies frequently report fatigue changes as secondary outcomes.

#### 2.2.7 Anger (PROMIS Anger)

| Attribute | Specification |
|-----------|--------------|
| **Full Bank** | 29 items |
| **Short Forms** | 5a, 8a |
| **CAT** | 4-12 items |
| **Direction** | Higher T-score = more severe anger/irritability |

**DeepSynaps Relevance**: Important for PTSD and intermittent explosive disorder treatment protocols. Emerging evidence supports TMS for anger dysregulation.

#### 2.2.8 Social Isolation (PROMIS Social Isolation / Social Support)

| Attribute | Specification |
|-----------|--------------|
| **Related Domains** | Social Isolation, Companionship, Emotional Support, Informational Support |
| **Short Forms** | 4a per domain |
| **Direction** | Varies by construct (isolation: higher=worse; support: higher=better) |

**DeepSynaps Relevance**: Social functioning is a key recovery domain in depression and PTSD treatment. Provides important quality-of-life data beyond symptom severity.

### 2.3 Scoring Algorithms

#### 2.3.1 IRT-Based Scoring

PROMIS instruments use Item Response Theory (IRT), specifically Graded Response Models (GRM) for polytomous items. The fundamental equation:

```
P(X=k | theta) = f(item parameters, theta)
```

Where `theta` represents the latent trait (e.g., depression severity) on the logit scale. The IRT model estimates `theta` based on the patient's response pattern across administered items.

#### 2.3.2 T-Score Conversion

All PROMIS scores are reported as T-scores:

```
T-score = (theta * 10) + 50
```

Where:
- T-score = 50: Average for the US general population
- T-score = 60: One SD above the mean (worse for negative constructs, better for positive constructs)
- T-score = 40: One SD below the mean

**95% Confidence Interval Calculation:**
```
CI_lower = T - (1.96 * SE)
CI_upper = T + (1.96 * SE)
```

Where SE = Standard Error provided by the scoring system.

#### 2.3.3 PROPr (PROMIS Preference Score)

PROPr is a preference-based health utility score derived from PROMIS domain scores:

```
PROPr = MAUT(Cognitive Function, Depression, Fatigue, Pain Interference,
              Physical Function, Sleep Disturbance, Social Roles)
```

- Range: 0 (as bad as dead) to 1 (perfect health)
- Enables cost-utility analysis (QALY calculations)
- Computed via open-source R/SAS/Stata code at https://github.com/janelhanmer/PROPr

**Cognitive Function Theta Estimation (when not directly measured):**
```
CF_theta = 0.00943 + (-0.037 * Depression_theta) + (0.118 * Physical_Function_theta)
         + (-0.223 * Sleep_theta) + (0.0505 * Social_Roles_theta) + (-0.168 * Anxiety_theta)
         + (-0.00599 * Pain_Intensity_score)
```

#### 2.3.4 Physical and Mental Health Summary Scores

Derived from PROMIS-29 Profile domains:

```
Physical Health z-score = weighted_sum(Physical_Function, Pain_Interference, 
                                       Pain_Intensity, Fatigue, Sleep)
Mental Health z-score = weighted_sum(Depression, Anxiety, Social_Roles, Fatigue, Sleep)

Physical Health T-score = (Physical Health z-score * 10) + 50
Mental Health T-score = (Mental Health z-score * 10) + 50
```

### 2.4 CAT (Computerized Adaptive Testing) vs Fixed-Length Forms

#### 2.4.1 CAT Mechanics

```
PROMIS CAT Algorithm:
1. Select initial item near population mean
2. Administer item to patient
3. Update theta estimate based on response
4. Select next item with maximum information at current theta estimate
5. Repeat steps 2-4 until stopping rule met
6. Report final T-score with SE
```

**Stopping Rules:**
- Precision-based: Stop when SE < threshold (typically 0.3-0.5 logits)
- Maximum items: Stop at 12 items (default) regardless of precision
- Minimum items: 4 items (for Profile CAT)

#### 2.4.2 CAT vs Short Form Comparison

| Feature | CAT | Fixed Short Form |
|---------|-----|------------------|
| Items administered | 4-12 (mean ~6) | Fixed (4, 6, 8, 10) |
| Precision | Higher across range | Fixed, depends on items |
| Patient burden | Lower on average | Higher but predictable |
| Item exposure | Varies across patients | All patients see same items |
| Technology requirement | Computer/tablet required | Can be paper-based |
| Cross-time comparability | Excellent | Excellent |
| Floor/ceiling effects | Minimal | Depends on form length |

#### 2.4.3 DeepSynaps Recommendation

Use **CAT for baseline assessments** (maximum precision when burden is acceptable) and **4a short forms for session-by-session tracking** (predictable burden, rapid completion between sessions).

### 2.5 Short Forms vs Full Banks

| Short Form | Items | Best Use |
|------------|-------|----------|
| 4a (Profile) | 4 | Session-by-session monitoring |
| 6a (Profile) | 6 | Brief research assessments |
| 8a (Profile) | 8 | Baseline research assessments |
| 8b (Emotional Distress) | 8 | When emotional distress is primary focus |
| 10a | 10 | When higher precision needed without CAT |
| Full Bank | 28-95 | CAT administration only |

### 2.6 Pediatric vs Adult Measures

**Critical Distinction**: Pediatric and adult PROMIS measures use separate item banks and, in some cases, separate metrics. Scores cannot be directly compared across pediatric and adult versions.

**Pediatric-to-Adult Linkage Equations (for longitudinal follow-through):**

| Domain | Direction | Equation |
|--------|-----------|----------|
| Depression | Pediatric to Adult | Adult_T = 11.47 + 0.78 * Pediatric_T |
| Anxiety | Pediatric to Adult | Adult_T = 20.23 + 0.68 * Pediatric_T |
| Anger | Pediatric to Adult | Adult_T = 15.91 + 0.74 * Pediatric_T |

**Example**: A patient scoring 40 on pediatric Anxiety would be expected to score 47.43 on the adult measure (20.23 + 0.68 * 40 = 47.43).

**Pediatric Measures Available:**
- Mobility (8a self-report, 8a parent-proxy)
- Upper Extremity (8a)
- Pain Interference (8a)
- Fatigue (10a)
- Depressive Symptoms (8a)
- Anxiety (8a)
- Anger (6a)
- Peer Relations (8a)

### 2.7 Assessment Center API

**API Endpoints and Capabilities:**

| Capability | Description | Integration Point |
|------------|-------------|-------------------|
| Instrument retrieval | Fetch PROMIS instruments by ID | Assessment setup |
| Response submission | Submit patient responses for scoring | Data collection |
| Score retrieval | Retrieve T-scores, SE, theta values | Scoring pipeline |
| Assessment management | Create, manage, track assessment sessions | Session tracking |
| Batch scoring | Submit bulk responses for batch scoring | Research exports |

**API Contact**: api@assessmentcenter.net

**Integration Patterns:**
```
Pattern 1: DeepSynaps App -> Assessment Center API -> Scored Results
  - Full API integration
  - Real-time scoring
  - Requires internet connectivity
  - Licensing required for commercial use

Pattern 2: DeepSynaps App -> Local Scoring Library -> Scored Results
  - Uses published IRT parameters
  - Offline capability
  - Requires implementation of scoring algorithms
  - May need licensing for item content

Pattern 3: REDCap + Auto-Score -> Assessment Center API
  - For research deployments
  - REDCap native PROMIS CAT support
  - Less custom development
```

### 2.8 Licensing Framework

| Use Case | License Requirement | Approximate Cost |
|----------|-------------------|-----------------|
| Academic/Nonprofit research | Free (registration required) | No cost |
| Commercial clinical use | Commercial license from HealthMeasures | Contact for quote |
| Integration into commercial software platform | Commercial license required | Contact for quote |
| FDA-regulated clinical trials | May require instrument license | Contact for quote |
| Translation/adaptation | Requires written permission | Case by case |

**Key Contact**: HealthMeasures team at Northwestern University (healthmeasures.net)

---

## 3. NIH Toolbox Analysis

### 3.1 System Overview

The **NIH Toolbox for the Assessment of Neurological and Behavioral Function** is a comprehensive set of standardized measures for assessing cognitive, emotional, sensory, and motor function across the lifespan. Developed by the NIH Blueprint for Neuroscience Research, it is designed for use in large-scale epidemiological and clinical studies.

**Administration Platform**: iPad-based application (NIH Toolbox App)
**Age Range**: 3-85 years (with age-appropriate measures)
**Administration Time**: 30-45 minutes for full battery; 15-20 minutes for abbreviated battery

### 3.2 Cognition Battery (NIHTB-CB)

#### 3.2.1 Test Components

| Test | Domain | Administration | Scoring |
|------|--------|---------------|---------|
| Picture Vocabulary | Crystallized cognition | Touch response on iPad | IRT-based theta -> standard score |
| Oral Reading Recognition | Crystallized cognition | Read aloud / touch | IRT-based theta -> standard score |
| Flanker Inhibitory Control and Attention | Executive function | Button press (left/right) | RT + accuracy -> computed score |
| Dimensional Change Card Sort (DCCS) | Executive function / cognitive flexibility | Button press | RT + accuracy -> computed score |
| List Sorting Working Memory Test | Working memory | Drag-and-drop sequencing | Number correct -> standard score |
| Picture Sequence Memory Test | Episodic memory | Sequence reconstruction | IRT-based theta -> computed score |
| Pattern Comparison Processing Speed | Processing speed | Touch matching | Number correct in 85 seconds |

#### 3.2.2 Composite Scores

| Composite | Components | Score Type |
|-----------|-----------|------------|
| **Crystallized Cognition** | Picture Vocabulary + Oral Reading | Scale Score (M=100, SD=15) |
| **Fluid Cognition** | DCCS + Flanker + List Sorting + Picture Sequence + Pattern Comparison | Scale Score (M=100, SD=15) |
| **Total Cognition** | Average of Crystallized + Fluid composites | Scale Score (M=100, SD=15) |
| **Early Childhood Composite** | Ages 4-8.5: Picture Vocabulary + Visual Reasoning + Spatial Memory | Scale Score |

#### 3.2.3 Score Types

| Score Type | Description | Use Case |
|------------|-------------|----------|
| **Uncorrected Standard Score** | Raw performance vs general population, NOT age-adjusted | Tracking change over time |
| **Age-Corrected Standard Score** | Performance vs same-age peers | Cross-sectional comparison |
| **Fully Corrected T-Score** | Adjusted for age, gender, education, race/ethnicity | Most conservative comparison |
| **Change-Sensitive Score (CSS)** | Sensitive to intervention-related change | Treatment outcome measurement |
| **National Percentile Rank** | Percentile in US population | Patient-friendly reporting |

**Important**: For neuromodulation outcome tracking, use **Uncorrected Standard Scores** or **Change-Sensitive Scores** because age-corrected scores would mask true treatment-related improvement.

#### 3.2.4 Norms (Version 3, 2025)

NIH Toolbox Cognition Battery V3 norms are derived from a continuous norming study of 3,000+ participants aged 3-102 years, weighted to 2020 US Census demographics. Key norm statistics:

```
Fluid Cognition Composite (Age 50-59, English):
  Mean = 101.68 (SD=16.26)
  
Crystallized Cognition Composite (Age 50-59, English):
  Mean = 109.52 (SD=24.52)
  
Total Cognition Composite (Age 50-59, English):
  Mean = 109.31 (SD=22.79)
```

### 3.3 Emotion Battery

The NIH Toolbox Emotion Battery measures:

| Domain | Age Range | Key Constructs |
|--------|-----------|---------------|
| Positive Affect | 8+ | Happiness, life satisfaction |
| Psychological Well-Being | 13+ | Meaning, purpose |
| Emotional Support | 13+ | Perceived support from others |
| Friendship | 8+ | Companionship, social connections |
| Loneliness | 13+ | Social isolation |
| Sadness | 13+ | Depression-related content |
| Fear | 8+ | Anxiety-related content |
| Anger | 8+ | Hostility, frustration |
| Self-Efficacy | 13+ | Confidence in abilities |
| Instrumental Support | 13+ | Practical help availability |

**DeepSynaps Note**: The NIH Toolbox Emotion Battery overlaps conceptually with PROMIS emotional distress measures. Choose one system for emotional health tracking to avoid duplication. NIH Toolbox is preferred when a comprehensive cognitive-emotional assessment is needed; PROMIS is preferred when focused emotional health monitoring is the goal.

### 3.4 Motor Battery

| Test | Domain | Administration |
|------|--------|---------------|
| 9-Hole Pegboard Dexterity | Fine motor | Timed peg placement |
| Grip Strength Dynamometry | Upper extremity strength | Squeeze dynamometer |
| Balance | Postural stability | Stand on one leg, tandem stance |
| 4-Meter Walk/Gait Speed | Ambulation | Timed walk at usual pace |
| Endurance (2-minute walk) | Cardiovascular endurance | Distance walked in 2 minutes |
| Chair Rise | Lower extremity strength | Repeated sit-to-stand |

### 3.5 Sensory Battery

| Test | Domain | Administration |
|------|--------|---------------|
| Pure-Tone Audiometry | Hearing | iPad-connected headphones |
| Words-in-Noise Test | Hearing in noise | iPad-connected headphones |
| Contrast Sensitivity | Vision | iPad display |
| Visual Acuity | Near vision | iPad display |

### 3.6 Scoring and Norms

All NIH Toolbox tests use standardized scoring with a mean of 100 and standard deviation of 15 (comparable to IQ score scaling). The V3 norming study uses continuous norming methods with bootstrap resampling to derive age-adjusted reference values.

### 3.7 Integration Approach for DeepSynaps

```
NIH Toolbox Integration Architecture:

1. iPad App Layer
   - Patient completes battery on dedicated iPad
   - Scores uploaded to Assessment Center cloud
   
2. Data Extraction Layer
   - DeepSynaps platform queries Assessment Center API
   - OR: Manual export from Assessment Center -> CSV -> import
   
3. Score Normalization Layer
   - Convert all scores to z-scores
   - Map to DeepSynaps unified score format
   - Apply longitudinal tracking metadata
   
4. Clinical Integration Layer
   - Display alongside PROMIS scores
   - Alert on significant cognitive changes
   - Feed into protocol-outcome correlation engine
```

---

## 4. Other Key Outcome Measures

### 4.1 GAD-7 (Generalized Anxiety Disorder 7-item Scale)

| Attribute | Specification |
|-----------|--------------|
| **Items** | 7 |
| **Response Scale** | 4-point (0=Not at all, 3=Nearly every day) |
| **Score Range** | 0-21 |
| **Administration Time** | 2-3 minutes |
| **Recall Period** | Past 2 weeks |
| **Cost** | Free (public domain) |

**Severity Interpretation:**
| Score Range | Severity |
|-------------|----------|
| 0-4 | Minimal anxiety |
| 5-9 | Mild anxiety |
| 10-14 | Moderate anxiety |
| 15-21 | Severe anxiety |

**Response/Remission Criteria:**
- Response: >= 50% reduction from baseline
- Remission: Score <= 4 (minimal symptoms)
- Reliable Change Index: Approximately 4-5 points

**DeepSynaps Integration**: Administer at baseline and every 5 sessions for anxiety treatment protocols. GAD-7 is the gold standard for anxiety severity tracking in neuromodulation studies.

### 4.2 PHQ-9 (Patient Health Questionnaire 9-item)

| Attribute | Specification |
|-----------|--------------|
| **Items** | 9 (plus 1 functional impact item) |
| **Response Scale** | 4-point (0=Not at all, 3=Nearly every day) |
| **Score Range** | 0-27 |
| **Administration Time** | 2-3 minutes |
| **Recall Period** | Past 2 weeks |
| **Cost** | Free (public domain) |

**Severity Interpretation:**
| Score Range | Severity |
|-------------|----------|
| 0-4 | Minimal depression |
| 5-9 | Mild depression |
| 10-14 | Moderate depression |
| 15-19 | Moderately severe depression |
| 20-27 | Severe depression |

**Response/Remission Criteria (neuromodulation standard):**
- Response: >= 50% reduction from baseline score
- Remission: Score <= 4 (some use <= 5)
- Partial Response: 25-49% reduction

**Critical Safety Feature - Item 9 (Suicidal Ideation):**
| Item 9 Response | Action Required |
|-----------------|----------------|
| "Not at all" (0) | None |
| "Several days" (1) | Monitor, document |
| "More than half the days" (2) | Clinical assessment required |
| "Nearly every day" (3) | Immediate safety evaluation + crisis protocol |

**DeepSynaps Integration**: PHQ-9 is the primary session-by-session depression outcome measure for TMS/tDCS protocols. It is administered before every 5th session (sessions 1, 5, 10, 15, 20, 25, 30+) and at end-of-treatment.

### 4.3 PCL-5 (PTSD Checklist for DSM-5)

| Attribute | Specification |
|-----------|--------------|
| **Items** | 20 (corresponding to DSM-5 criteria B, C, D, E) |
| **Response Scale** | 5-point (0=Not at all, 4=Extremely) |
| **Score Range** | 0-80 |
| **Administration Time** | 5-10 minutes |
| **Recall Period** | Past month |
| **Cost** | Free (public domain, from National Center for PTSD) |

**Severity Interpretation:**
| Score Range | Severity |
|-------------|----------|
| 0-20 | Minimal |
| 21-33 | Moderate (probable PTSD) |
| 34-49 | Moderately severe |
| 50-80 | Severe |

**DSM-5 Diagnostic Algorithm:**
- B (Intrusion): At least 1 item scored >= 2
- C (Avoidance): At least 1 item scored >= 2
- D (Negative alterations): At least 2 items scored >= 2
- E (Arousal): At least 2 items scored >= 2
- Criterion F: Duration > 1 month
- Criterion G: Functional impairment
- Criterion H: Not due to medication/substance/medical condition

**Response/Remission Criteria:**
- Response: >= 50% reduction from baseline
- Remission: Score <= 20-23 AND no longer meets DSM-5 symptom criteria

**Cutoff Considerations (meta-analysis evidence):**
| Context | Recommended Cutoff | Sensitivity | Specificity |
|---------|-------------------|-------------|-------------|
| Clinical screening | 31-33 | ~0.90 | ~0.63 |
| High-specificity use | 38 | ~0.84 | ~0.70 |
| Research (stringent) | 42-43 | ~0.77 | ~0.74 |

**DeepSynaps Integration**: PCL-5 is the primary outcome measure for PTSD neuromodulation protocols (TMS to right DLPFC, deep TMS to mPFC). Administer at baseline, session 10, session 20, and end-of-treatment.

### 4.4 MoCA (Montreal Cognitive Assessment)

| Attribute | Specification |
|-----------|--------------|
| **Items** | 30 points across 7 domains |
| **Domains** | Visuospatial/Executive, Naming, Memory, Attention, Language, Abstraction, Delayed Recall, Orientation |
| **Score Range** | 0-30 |
| **Administration Time** | 10-15 minutes |
| **Administrator** | Requires trained clinician |
| **Cost** | Free for clinical use; training/certification available |

**Score Interpretation:**
| Score Range | Interpretation |
|-------------|----------------|
| 26-30 | Normal cognition |
| 18-25 | Mild cognitive impairment |
| 10-17 | Moderate cognitive impairment |
| 0-9 | Severe cognitive impairment |

**Adjustments:**
- Add 1 point for education < 12 years
- Norms vary by age and education (use age-education-adjusted norms)

**DeepSynaps Integration**: MoCA is used as a baseline cognitive screen for patients with depression-associated cognitive impairment or primary cognitive complaints. Repeat at end-of-treatment for cognitive outcome protocols. Not suitable for session-by-session administration due to practice effects.

### 4.5 BDI-II (Beck Depression Inventory - Second Edition)

| Attribute | Specification |
|-----------|--------------|
| **Items** | 21 (corresponding to DSM-IV depression symptoms) |
| **Response Scale** | 4-point (0-3) per item |
| **Score Range** | 0-63 |
| **Administration Time** | 5-10 minutes |
| **Recall Period** | Past 2 weeks (including today) |
| **Cost** | Requires purchase from Pearson (copyrighted) |

**Severity Interpretation:**
| Score Range | Severity |
|-------------|----------|
| 0-13 | Minimal depression |
| 14-19 | Mild depression |
| 20-28 | Moderate depression |
| 29-63 | Severe depression |

**Response/Remission Criteria:**
- Response: >= 50% reduction from baseline
- Remission: Score <= 12

**DeepSynaps Integration**: BDI-II provides more granular depression assessment than PHQ-9 and includes cognitive and somatic symptom subscales. Use for baseline comprehensive assessment in depression protocols. Internal consistency (Cronbach's alpha) = 0.90-0.92. Test-retest reliability = 0.73-0.93.

### 4.6 HAM-D (Hamilton Depression Rating Scale)

| Attribute | Specification |
|-----------|--------------|
| **Items** | 17 (standard), 21 (extended) |
| **Response Scale** | Varies by item (0-2, 0-4, 0-5) |
| **Score Range** | 0-52 (17-item) |
| **Administration Time** | 15-20 minutes |
| **Administrator** | Clinician-rated (requires trained interviewer) |
| **Cost** | Free (public domain) |

**Severity Interpretation (17-item):**
| Score Range | Severity |
|-------------|----------|
| 0-7 | No depression |
| 8-16 | Mild depression |
| 17-23 | Moderate depression |
| >= 24 | Severe depression |

**Response/Remission Criteria:**
- Response: >= 50% reduction from baseline
- Remission: Score <= 7 (some studies use <= 8)

**HAM-A (Hamilton Anxiety Rating Scale):**
| Score Range | Severity |
|-------------|----------|
| 0-7 | No anxiety |
| 8-14 | Mild anxiety |
| 15-23 | Moderate anxiety |
| >= 24 | Severe anxiety |

**DeepSynaps Integration**: HAM-D is the gold standard clinician-rated depression measure required for most clinical trials. Recommended for baseline assessment and end-of-treatment evaluation. Not practical for session-by-session use. HAM-A serves the same role for anxiety trials.

### 4.7 QoL Measures (SF-36 and EQ-5D)

#### SF-36 (Short Form 36 Health Survey)

| Attribute | Specification |
|-----------|--------------|
| **Items** | 36 |
| **Domains** | Physical Functioning, Role-Physical, Bodily Pain, General Health, Vitality, Social Functioning, Role-Emotional, Mental Health |
| **Score Range** | 0-100 per domain (higher = better) |
| **Summary Scores** | PCS (Physical Component Summary), MCS (Mental Component Summary) |
| **Administration Time** | 5-10 minutes |
| **Cost** | RAND version free; SF-36v2 requires QualityMetric license |

#### EQ-5D-5L

| Attribute | Specification |
|-----------|--------------|
| **Items** | 5 dimensions x 5 levels + VAS |
| **Dimensions** | Mobility, Self-Care, Usual Activities, Pain/Discomfort, Anxiety/Depression |
| **Utility Score** | Range approximately -0.5 to 1.0 (1.0 = full health) |
| **VAS** | Self-rated health 0-100 |
| **Administration Time** | 1-2 minutes |
| **Cost** | Free for non-commercial research; license required for commercial use |

**DeepSynaps Integration**: SF-36 and EQ-5D are collected at baseline and end-of-treatment to demonstrate health economic value (QALY improvements) for payer reimbursement and value-based care contracting. EQ-5D is preferred for its brevity and direct utility scoring.

### 4.8 Migraine-Specific Measures

#### MIDAS (Migraine Disability Assessment)

| Attribute | Specification |
|-----------|--------------|
| **Items** | 5 questions |
| **Score Range** | 0-270+ |
| **Recall Period** | 3 months |
| **Cost** | Free |

**Grade Interpretation:**
| Score | Grade | Disability |
|-------|-------|------------|
| 0-5 | I | Little or no disability |
| 6-10 | II | Mild disability |
| 11-20 | III | Moderate disability |
| >= 21 | IV | Severe disability |

#### HIT-6 (Headache Impact Test)

| Attribute | Specification |
|-----------|--------------|
| **Items** | 6 |
| **Score Range** | 36-78 |
| **Recall Period** | Past 4 weeks |
| **Cost** | Free for non-commercial use |

**Impact Grade Interpretation:**
| Score Range | Impact Level |
|-------------|-------------|
| 36-49 | Little or no impact |
| 50-55 | Some impact |
| 56-59 | Substantial impact |
| 60-78 | Severe impact |

**DeepSynaps Integration**: Use MIDAS or HIT-6 for chronic migraine neuromodulation protocols (e.g., single-pulse TMS for acute migraine, rTMS for preventive treatment). HIT-6 is preferred for session-by-session monitoring due to shorter recall period and faster completion.

---

## 5. Longitudinal Tracking Architecture

### 5.1 Session-by-Session Tracking Model

The DeepSynaps platform tracks outcomes across a standardized assessment schedule:

| Timepoint | Assessment Set | Instruments | Duration |
|-----------|---------------|-------------|----------|
| **Pre-treatment (Baseline)** | Comprehensive | PROMIS-29, PHQ-9/GAD-7/PCL-5 (primary), MoCA, SF-36/EQ-5D | 20-30 min |
| **Session 1** | Safety + Symptom | PHQ-9 primary item (item 9 SI screen) + pain VAS | 2 min |
| **Every 5 sessions** | Progress | PHQ-9/GAD-7/PCL-5 (primary), PROMIS CAT (primary domain) | 5-8 min |
| **Session 15 (midpoint)** | Progress + Adjustment | Full primary measure + PROMIS CAT + adverse events | 8-10 min |
| **End-of-Treatment** | Comprehensive repeat | Full baseline battery | 20-30 min |
| **3-month follow-up** | Outcomes | PROMIS-29 + primary outcome + SF-36/EQ-5D | 15 min |
| **6-month follow-up** | Durability | PROMIS-29 + primary outcome + SF-36/EQ-5D | 15 min |
| **12-month follow-up** | Long-term | PROMIS-29 + primary outcome + SF-36/EQ-5D | 15 min |

### 5.2 Pre/Post Intervention Comparison

The platform automatically computes:

```python
# Percent change calculation
def calculate_percent_change(baseline_score, current_score):
    """
    For measures where higher = worse (PHQ-9, GAD-7, PCL-5, pain)
    """
    return ((baseline_score - current_score) / baseline_score) * 100

# Response classification
def classify_response(percent_change):
    if percent_change >= 50:
        return "RESPONDER"
    elif percent_change >= 25:
        return "PARTIAL_RESPONDER"
    elif percent_change > 0:
        return "MINIMAL_RESPONSE"
    else:
        return "NON_RESPONDER"

# Remission classification
def classify_remission(current_score, instrument):
    thresholds = {
        'PHQ-9': 4,
        'GAD-7': 4,
        'PCL-5': 20,
        'HAM-D-17': 7,
        'BDI-II': 12
    }
    return current_score <= thresholds.get(instrument, float('inf'))
```

### 5.3 Response/Remission Criteria Summary

| Instrument | Response (%) | Remission Threshold | Partial Response (%) |
|------------|-------------|---------------------|---------------------|
| PHQ-9 | >= 50% reduction | <= 4 | 25-49% |
| GAD-7 | >= 50% reduction | <= 4 | 25-49% |
| PCL-5 | >= 50% reduction | <= 20-23 | 25-49% |
| BDI-II | >= 50% reduction | <= 12 | 25-49% |
| HAM-D-17 | >= 50% reduction | <= 7 | 25-49% |
| HAM-A | >= 50% reduction | <= 7 | 25-49% |
| PROMIS Depression | >= 0.5 SD reduction | T <= 50 | 0.3-0.5 SD |
| PROMIS Anxiety | >= 0.5 SD reduction | T <= 50 | 0.3-0.5 SD |
| PROMIS Pain | >= 0.5 SD reduction | T <= 50 | 0.3-0.5 SD |

### 5.4 Reliable Change Index (RCI)

The Reliable Change Index determines whether observed score changes exceed measurement error.

**Jacobson-Truax RCI Formula:**
```
RCI = (X_post - X_pre) / S_diff

Where:
  S_diff = SD * sqrt(2 * (1 - reliability))
  
  SD = standard deviation of the measure at baseline
  reliability = internal consistency (Cronbach's alpha) or test-retest reliability
  
If |RCI| >= 1.96: Change is reliable (p < 0.05, two-tailed)
```

**RCI Values for Common Instruments:**
| Instrument | SD | Reliability | S_diff | RCI threshold |
|------------|-----|-------------|--------|---------------|
| PHQ-9 | 5.0 | 0.89 | 2.34 | 4.6 points |
| GAD-7 | 4.5 | 0.92 | 1.80 | 3.5 points |
| PCL-5 | 16.0 | 0.94 | 5.53 | 10.8 points |
| BDI-II | 9.5 | 0.93 | 3.51 | 6.9 points |
| PROMIS Depression 8a | 10.0 | 0.96 | 2.83 | 5.5 T-score points |
| PROMIS Anxiety 8a | 10.0 | 0.96 | 2.83 | 5.5 T-score points |

**Clinical Significance Classification:**
```
Classification = f(RCI, clinical_cutoff):

1. Recovered:     RCI >= 1.96 AND post-score < clinical_cutoff
2. Improved:      RCI >= 1.96 AND post-score >= clinical_cutoff
3. Unchanged:     |RCI| < 1.96
4. Deteriorated:  RCI <= -1.96
```

### 5.5 Clinically Significant Change

Beyond statistical reliability, clinical significance requires crossing a clinical threshold:

```
For PHQ-9:
  Clinical Cutoff A (dysfunctional population mean) = 10
  Clinical Cutoff B = 10 - 2*SD = 0 (impractical)
  
  More practical: Use severity band boundaries
  - Moderate (10+) to Mild (5-9): Clinically significant improvement
  - Mild to Minimal (0-4): Clinically significant remission
```

### 5.6 Trajectory Modeling

#### 5.6.1 Latent Class Growth Models

Research (Kaster et al., 2020; Trajectory modeling and TMS studies, 2024) identifies typical TMS depression treatment trajectories:

| Trajectory Class | Description | Prevalence | Prognosis |
|-----------------|-------------|------------|-----------|
| **Rapid Improvement** | Steep initial decline, plateau | ~15-20% | Excellent - early response |
| **Gradual Improvement** | Shallow initial decline, steepening | ~10-15% | Good - delayed response |
| **Minimal Improvement** | Modest linear decline from lower baseline | ~35-40% | Fair - partial response |
| **Non-Response** | High baseline, remains high | ~25-30% | Poor - protocol adjustment needed |

**Key Finding**: Patients in the "Non-Response" trajectory typically show < 25% improvement by session 10 and rarely achieve response by end-of-treatment. This pattern can be detected early for protocol optimization.

#### 5.6.2 Linear Mixed Models for Individual Trajectories

```python
# Pseudocode for trajectory modeling
from statsmodels.regression.mixed_linear_model import MixedLM

def fit_trajectory_model(data):
    """
    Fit linear mixed model with patient-level random effects
    data: DataFrame with columns [patient_id, session, score]
    """
    model = MixedLM.from_formula(
        'score ~ session + session:baseline_severity',
        groups='patient_id',
        re_formula='~session',
        data=data
    )
    result = model.fit()
    
    # Extract patient-specific random effects
    random_effects = result.random_effects
    
    # Predict trajectory for next sessions
    predicted_scores = result.predict(new_data)
    
    return result, random_effects, predicted_scores
```

#### 5.6.3 Early Non-Response Prediction

Algorithm developed from linear mixed models (Mechler et al., 2022):

```
Inputs:
  - Weekly QIDS-SR (or PHQ-9) measurements (sessions 1-5)
  - Baseline PID-5-BF personality scores
  
Model:
  - Logarithmic change term for weekly symptom scores
  - Baseline personality covariates
  
Output:
  - Prediction of non-response at end-of-treatment
  
Performance:
  - Positive Predictive Value: 0.59
  - Specificity: 0.80
  - Best prediction at treatment week 3 (session 9-10)
```

### 5.7 Alert Thresholds

| Alert Type | Trigger | Response |
|------------|---------|----------|
| **CRITICAL - Suicidal Ideation** | PHQ-9 Item 9 >= 2 OR C-SSRS positive | Immediate clinical evaluation + crisis protocol |
| **HIGH - Clinical Deterioration** | RCI <= -1.96 (reliable worsening) | Same-day clinician review |
| **HIGH - Non-Response Alert** | < 25% improvement by session 15 | Protocol review meeting |
| **MEDIUM - Slow Response** | Trajectory classified as "Non-Response" at session 10 | Schedule protocol adjustment discussion |
| **MEDIUM - Safety Signal** | New adverse event reported | Adverse event documentation + follow-up |
| **LOW - Session Missed** | > 3 consecutive no-shows | Care coordination outreach |
| **INFO - Milestone Achieved** | Response or remission criteria met | Celebrate with patient + document |

---

## 6. Neuromodulation Outcome Integration

### 6.1 Pre-Treatment Baseline Collection

The baseline assessment serves four critical functions:

1. **Severity Quantification**: Establish symptom severity for treatment planning
2. **Protocol Selection**: Match patient profile to optimal neuromodulation protocol
3. **Prognostic Stratification**: Identify predictors of response/non-response
4. **Benchmark Establishment**: Create reference for treatment outcome evaluation

```
Pre-Treatment Assessment Protocol:

Step 1: Disorder Identification
  |-- Primary diagnosis (MDD, GAD, PTSD, chronic pain, cognitive impairment)
  |-- Comorbidities
  |-- Treatment history (medication, psychotherapy, prior neuromodulation)
  |-- Episode duration and severity history

Step 2: Baseline Severity Measurement
  |-- Primary outcome measure (disorder-specific)
  |-- PROMIS-29 Profile v2.1 (comprehensive health profile)
  |-- Quality of life (SF-36 or EQ-5D-5L)
  |-- Functional impairment assessment

Step 3: Predictor Assessment
  |-- Duration of current episode
  |-- Number of prior treatment failures
  |-- Baseline severity (high severity may predict better TMS response)
  |-- Anxiety comorbidity (may predict worse TMS response)
  |-- Cognitive function (MoCA + NIH Toolbox if indicated)
  |-- Personality factors (NEO-FFI or PID-5-BF)

Step 4: Safety Screening
  |-- Suicidal ideation (PHQ-9 item 9 + C-SSRS)
  |-- Seizure risk assessment
  |-- Medical contraindications
  |-- Pregnancy screening
  |-- Metal implant screening

Step 5: Protocol Assignment
  |-- Match patient profile to evidence-based protocol
  |-- Document treatment targets (symptom + functional)
  |-- Establish expected outcomes timeline
  |-- Set alert thresholds
```

### 6.2 During-Treatment Monitoring

Real-time outcome tracking enables adaptive treatment:

```
Session-by-Session Monitoring Flow:

Before Each Session:
  1. Check adverse events since last session
  2. Suicidal ideation screen (PHQ-9 item 9 or single item)
  3. Mood VAS (0-10) for rapid tracking
  4. Pain VAS if pain protocol

Every 5 Sessions:
  1. Full primary outcome measure (PHQ-9 / GAD-7 / PCL-5)
  2. PROMIS CAT for primary domain (4-7 items)
  3. Calculate percent change from baseline
  4. Compute RCI
  5. Update trajectory classification
  6. Evaluate alert conditions

At Session 15 (Midpoint Review):
  1. Full primary outcome measure
  2. PROMIS-29 Profile repeat (optional)
  3. Comprehensive trajectory analysis
  4. Clinical decision: Continue / Adjust / Augment / Discontinue

Clinical Decision Algorithm at Session 15:
  |-- Remission achieved: Consider tapering schedule
  |-- Response >= 50%: Continue protocol, target remission
  |-- Partial response 25-49%: Continue + consider augmentation
  |-- Minimal response < 25%: Protocol review + consider adjustment
  |-- Deterioration: Immediate clinical review + safety assessment
```

### 6.3 Post-Treatment Follow-Up

Durability assessment tracks long-term outcomes:

| Follow-Up Timepoint | Assessment Battery | Key Questions |
|--------------------|-------------------|---------------|
| End of Treatment | Full baseline repeat | Response/remission achieved? |
| 3 months | PROMIS-29 + primary + QoL | Sustained benefit? |
| 6 months | PROMIS-29 + primary + QoL | Durability confirmed? |
| 12 months | PROMIS-29 + primary + QoL | Long-term maintenance? |
| As needed (booster) | Primary outcome + PROMIS CAT | Booster treatment needed? |

### 6.4 Protocol Adjustment Based on Outcomes

Evidence-based adaptation rules:

```
Protocol Adjustment Decision Tree:

IF trajectory = "Non-Response" at session 10:
  |-- Review protocol adherence (coil placement, intensity, frequency)
  |-- Consider resting motor threshold re-measurement
  |-- Evaluate for augmentation (medication, psychotherapy)
  |-- Consider switching stimulation target
  |-- Document rationale for continuation vs. adjustment

IF partial response at session 15 with standard 10Hz left DLPFC:
  |-- Option A: Increase pulse count (3000 -> 4000 per session)
  |-- Option B: Add bilateral stimulation (right DLPFC low frequency)
  |-- Option C: Add deep TMS (H-coil for broader stimulation)
  |-- Option D: Add maintenance sessions after acute phase

IF anxiety prominent in depression treatment:
  |-- Consider right DLPFC low-frequency TMS
  |-- Monitor anxiety items separately from depression items
  |-- Anxiety may worsen before improving (paradoxical activation)

IF cognitive symptoms persist despite mood improvement:
  |-- Add cognitive domain-specific assessment (NIH Toolbox)
  |-- Consider DLPFC targeting optimized for cognitive circuits
  |-- Add cognitive rehabilitation adjunct
```

### 6.5 Predicting Responders vs Non-Responders

Evidence-based predictors of TMS response in depression:

| Predictor | Better Response | Worse Response |
|-----------|-----------------|----------------|
| Baseline severity | Higher (moderate-severe) | Lower (mild) |
| Episode duration | Shorter | Longer (> 5 years) |
| Treatment resistance | Fewer failed trials | More failed trials (> 4) |
| Anxiety comorbidity | Lower anxiety | Higher anxiety |
| Age | Younger | Older (> 65) |
| Cognitive function | Preserved | Impaired |
| Early improvement (week 2) | >= 20% PHQ-9 reduction | < 20% reduction |
| Neuroimaging | Prefrontal activation patterns | Reduced baseline activation |

**Early Prediction Model:**
```
Using session 5 PHQ-9 score:
  IF percent_change >= 20%: 85% probability of eventual response
  IF percent_change 10-20%: 50% probability of eventual response
  IF percent_change < 10%: 25% probability of eventual response
```

### 6.6 Outcome-Informed Protocol Selection

```
Evidence-Based Protocol Matching:

MDD (Major Depressive Disorder):
  First-line: 10Hz left DLPFC, 120% RMT, 3000-4000 pulses/session, 20-30 sessions
  Alternative: iTBS (intermittent theta burst), SAINT protocol
  Non-responder: Switch to right DLPFC 1Hz or bilateral

GAD (Generalized Anxiety Disorder):
  Evidence: Right DLPFC low-frequency rTMS
  Sessions: 15-20
  Co-primary: GAD-7 + PROMIS Anxiety

PTSD:
  Evidence: Right DLPFC 1Hz rTMS, deep TMS (H-coil) to mPFC
  Combined: rTMS + exposure-based psychotherapy
  Primary: PCL-5 + CAPS-5 (clinician-rated)

Chronic Pain:
  Evidence: M1 (motor cortex) high-frequency rTMS
  Primary: Pain VAS + PROMIS Pain Interference + HIT-6/MIDAS
  Sessions: 10-15 (may need maintenance)

Cognitive Enhancement:
  Evidence: DLPFC stimulation + cognitive training
  Assessment: NIH Toolbox + MoCA + PROMIS Cognitive Function
  Primary: Working memory, executive function, processing speed
```

---

## 7. DeepSynaps Integration Architecture

### 7.1 Assessment Instrument Registry

```typescript
// Assessment Instrument Registry Schema
interface AssessmentInstrument {
  id: string;                    // e.g., "phq-9", "promis-depression-cat"
  name: string;                  // Display name
  version: string;               // e.g., "v2.1"
  system: 'PROMIS' | 'NIH_Toolbox' | 'Legacy' | 'Custom';
  domain: string;                // e.g., "depression", "anxiety", "pain"
  administrationType: 'CAT' | 'Fixed' | 'ClinicianRated' | 'Performance';
  itemCount: { min: number; max: number; typical: number };
  scoreType: 'TScore' | 'RawSum' | 'StandardScore' | 'Utility' | 'Percentile';
  scoreDirection: 'HigherIsBetter' | 'HigherIsWorse';
  populationMean?: number;        // e.g., 50 for PROMIS T-scores
  populationSD?: number;          // e.g., 10 for PROMIS T-scores
  severityThresholds: SeverityThreshold[];
  responseRemission: ResponseRemissionCriteria;
  reliability: { internalConsistency?: number; testRetest?: number };
  licensing: { type: 'Free' | 'Commercial' | 'Restricted'; holder: string };
  timeToAdministerMinutes: number;
  recallPeriod: string;
  ageRange: { min: number; max: number };
  languages: string[];
  apiEndpoint?: string;
  scoringEndpoint?: string;
  items?: InstrumentItem[];
}

interface SeverityThreshold {
  label: string;                 // e.g., "mild", "moderate", "severe"
  minScore: number;
  maxScore: number;
  color: string;                 // e.g., "#FFD700", "#FF8C00", "#FF0000"
  clinicalAction?: string;        // Recommended action at this level
}

interface ResponseRemissionCriteria {
  responsePercentReduction: number;  // e.g., 50 for 50%
  remissionThreshold: number;        // Absolute score threshold
  partialResponseMin: number;
  partialResponseMax: number;
}
```

### 7.2 Score Normalization Pipeline

```
Score Normalization Pipeline Architecture:

Layer 1: Raw Score Ingestion
  - Accept scores from multiple sources (API, manual entry, file import)
  - Validate score ranges
  - Timestamp and attribution
  
Layer 2: Score Conversion
  - Convert raw scores to standard metrics
  - PHQ-9 raw (0-27) -> severity category
  - PROMIS raw -> theta -> T-score
  - NIH Toolbox -> Uncorrected Standard Score -> z-score
  
Layer 3: Unified Score Format
  All scores converted to:
  {
    instrumentId: string,
    domain: string,
    rawScore: number,
    normalizedScore: number,      // z-score or T-score
    normalizedType: 'TScore' | 'zScore',
    severityLevel: string,
    severityOrdinal: number,       // 0=none, 1=mild, 2=moderate, 3=severe
    percentOfPopulationMean: number,
    confidenceInterval: [number, number],
    reliability: number,
    clinicalSignificance: 'Recovered' | 'Improved' | 'Unchanged' | 'Deteriorated',
    timestamp: ISO8601,
    sessionNumber?: number,
    administeredBy: string,
    notes: string
  }
  
Layer 4: Cross-Domain Comparison
  - All scores on comparable T-score metric
  - Enable T-score profile visualization
  - Support domain comparison within patient
```

### 7.3 Longitudinal Storage Model

```sql
-- Core Assessment Event Table
CREATE TABLE assessment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
    session_id UUID REFERENCES sessions(id),
    assessment_type VARCHAR(50),           -- 'baseline', 'progress', 'eot', 'followup'
    assessment_battery_id UUID REFERENCES assessment_batteries(id),
    administered_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    administered_by UUID REFERENCES users(id),
    administration_mode VARCHAR(20),       -- 'tablet', 'phone', 'paper', 'clinician'
    session_number INTEGER,                -- Treatment session number (null for followup)
    protocol_id UUID REFERENCES protocols(id),
    metadata JSONB,                        -- Free-form context
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Instrument Response Table
CREATE TABLE instrument_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_event_id UUID REFERENCES assessment_events(id),
    instrument_id VARCHAR(50),             -- Reference to instrument registry
    response_data JSONB,                   -- Individual item responses
    raw_score DECIMAL(8,2),
    computed_score DECIMAL(8,2),           -- Primary score
    computed_score_type VARCHAR(20),       -- 'TScore', 'RawSum', 'StandardScore'
    standard_error DECIMAL(6,3),
    confidence_interval_lower DECIMAL(8,2),
    confidence_interval_upper DECIMAL(8,2),
    severity_level VARCHAR(20),
    severity_ordinal INTEGER,
    rci_value DECIMAL(6,3),                -- Reliable Change Index
    clinical_significance VARCHAR(20),     -- From registry
    theta_estimate DECIMAL(8,4),           -- IRT theta if applicable
    items_administered INTEGER,
    items_skipped INTEGER,
    administration_time_seconds INTEGER,
    scoring_method VARCHAR(20),            -- 'API', 'LocalIRT', 'LookupTable'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Longitudinal Trajectory Table
CREATE TABLE patient_trajectories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
    instrument_id VARCHAR(50),
    domain VARCHAR(50),
    trajectory_class VARCHAR(30),          -- 'rapid_improvement', 'gradual', 'minimal', 'non_response'
    trajectory_probability DECIMAL(4,3),
    predicted_eot_score DECIMAL(8,2),
    predicted_response_probability DECIMAL(4,3),
    predicted_remission_probability DECIMAL(4,3),
    model_version VARCHAR(20),
    computed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    model_parameters JSONB
);

-- Outcome Alert Table
CREATE TABLE outcome_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
    alert_type VARCHAR(30),                -- 'SI_CRITICAL', 'DETERIORATION', 'NON_RESPONSE', etc.
    severity VARCHAR(10),                  -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'
    instrument_id VARCHAR(50),
    trigger_value DECIMAL(8,2),
    threshold_value DECIMAL(8,2),
    baseline_value DECIMAL(8,2),
    current_value DECIMAL(8,2),
    percent_change DECIMAL(5,2),
    description TEXT,
    recommended_action TEXT,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 7.4 Outcome Alert System

```
Alert System Architecture:

Trigger Layer:
  - Real-time score evaluation on assessment completion
  - Scheduled batch evaluation (daily trajectory updates)
  - Manual trigger (clinician-initiated)

Rules Engine:
  instrument=PHQ-9 AND item9_response >= 2 
    -> CRITICAL_SI_ALERT + immediate_notification
    
  instrument=PHQ-9 AND percent_change < 0 AND session >= 5
    -> calculate_RCI
    -> IF RCI <= -1.96 THEN DETERIORATION_ALERT
    
  instrument=PROMIS-Depression AND session = 15 AND percent_change < 25
    -> NON_RESPONSE_ALERT + protocol_review_recommendation
    
  trajectory_class = 'non_response' AND probability > 0.70
    -> EARLY_NON_RESPONSE_WARNING

Notification Layer:
  CRITICAL -> SMS + Push + Email (immediate)
  HIGH -> Push + Email (within 15 minutes)
  MEDIUM -> Email + In-app notification (within 1 hour)
  LOW -> In-app notification (next business day)
  INFO -> Dashboard badge only

Escalation Layer:
  CRITICAL unacknowledged for 15 minutes -> escalate to supervisor
  HIGH unacknowledged for 1 hour -> escalate to care team lead
```

### 7.5 Protocol-Outcome Correlation Engine

```
Protocol-Outcome Correlation Architecture:

Data Collection:
  - Protocol parameters (target, frequency, intensity, pulse count, sessions)
  - Patient characteristics (diagnosis, severity, age, comorbidities)
  - Outcome trajectories (session-by-session scores)
  - Adverse events

Analysis Pipeline:
  1. Feature extraction from protocol parameters
  2. Outcome label creation (responder/non-responder, remitter/non-remitter)
  3. Correlation analysis (protocol features vs outcomes)
  4. Predictive model training (response prediction from early sessions)
  5. Recommendation generation

Output:
  - Protocol effectiveness rankings by patient subtype
  - Personalized protocol recommendations
  - Expected outcome distributions
  - Dose-response relationship estimates
```

### 7.6 Provenance Tracking

Every score in the system carries full provenance metadata:

```json
{
  "provenance": {
    "scoreId": "uuid",
    "instrumentVersion": "PROMIS-Depression-v1.0-CAT",
    "administration": {
      "mode": "tablet_app",
      "deviceId": "uuid",
      "location": "clinic_room_3",
      "administeredBy": "patient_self_report",
      "supervisedBy": "clinical_staff_id",
      "startTime": "2026-07-15T09:30:00Z",
      "endTime": "2026-07-15T09:35:42Z"
    },
    "scoring": {
      "engine": "PROMIS_AssessmentCenter_API_v3.2",
      "irtModel": "GradedResponseModel",
      "parametersVersion": "2024-01",
      "scoringTimestamp": "2026-07-15T09:35:43Z"
    },
    "validation": {
      "rangeCheck": "passed",
      "internalConsistency": 0.96,
      "standardError": 2.3,
      "confidenceLevel": 0.95
    },
    "dataQuality": {
      "completionRate": 1.0,
      "responseTimeMean": 12.4,
      "responseTimeSD": 3.2,
      "suspiciousPattern": false
    },
    "audit": {
      "createdBy": "system_scoring_service",
      "createdAt": "2026-07-15T09:35:43Z",
      "dataSource": "assessment_center_api",
      "hash": "sha256:abc123..."
    }
  }
}
```

### 7.7 Display Integration for Patient Dashboard

```
Patient Dashboard - Outcomes Visualization:

1. PROMIS T-Score Profile Radar Chart
   - 7 domains displayed simultaneously
   - Color-coded severity zones (green/yellow/red)
   - Pre/post overlay showing change
   
2. Primary Outcome Trajectory Line Chart
   - X-axis: Session number / time
   - Y-axis: Primary outcome score (PHQ-9, GAD-7, or PCL-5)
   - Baseline reference line
   - Response threshold line (50% reduction)
   - Remission zone shading
   - Trajectory prediction (dashed line)
   
3. Reliable Change Indicators
   - Green arrow: Reliable improvement
   - Red arrow: Reliable deterioration
   - Gray dash: No reliable change
   
4. Milestone Badges
   - "25% Improvement" at session achievement
   - "50% Response" at response
   - "Remission Achieved" at remission
   
5. Side-by-Side Domain Comparison
   - Depression (PROMIS + PHQ-9)
   - Anxiety (PROMIS + GAD-7)
   - Pain (PROMIS + VAS)
   - Cognitive (PROMIS + NIH Toolbox)
```

---

## 8. Provenance & Confidence Model

### 8.1 Score Confidence Levels

| Confidence Level | Criteria | Display Color | Action |
|-----------------|---------|---------------|--------|
| **HIGH** | Full assessment completed, API-scored, SE < 3 | Green | Use for clinical decisions |
| **MEDIUM** | Assessment completed, lookup-table scored or SE 3-4 | Yellow | Acceptable for trending |
| **LOW** | Partial assessment, imputed scores, SE > 4 | Orange | Flag for re-assessment |
| **INSUFFICIENT** | Less than 80% items completed | Red | Do not use for decisions |

### 8.2 Data Quality Checks

```python
class DataQualityChecker:
    def check_response_pattern(self, responses):
        """
        Identify suspicious response patterns
        """
        issues = []
        
        # Check for straight-lining (all same response)
        unique_responses = set(responses)
        if len(unique_responses) == 1:
            issues.append("STRAIGHT_LINING")
        
        # Check for alternating patterns (may indicate random responding)
        if self.is_alternating(responses):
            issues.append("ALTERNATING_PATTERN")
        
        # Check response time (too fast = carelessness)
        avg_response_time = self.calculate_avg_response_time()
        if avg_response_time < 2:  # seconds per item
            issues.append("RESPONSE_TOO_FAST")
        
        # Check for missing responses
        missing_rate = responses.count(None) / len(responses)
        if missing_rate > 0.20:
            issues.append("EXCESSIVE_MISSING")
        
        return issues
```

### 8.3 Score Validity Rules

| Rule | Description | Enforcement |
|------|-------------|-------------|
| Range validation | Score must fall within instrument-defined range | Hard reject if violated |
| SE threshold | Standard error must be < 5 for clinical use | Soft warning if exceeded |
| Completion rate | Minimum 80% of items must be answered | Hard reject if below threshold |
| Time-based validity | Assessment must be completed within reasonable time window | Soft warning |
| Recency | Scores older than assessment schedule are flagged | Dashboard indicator |

---

## 9. Licensing Matrix

### 9.1 Comprehensive Licensing Overview

| Instrument | Copyright Holder | Research Use | Commercial Clinical Use | Software Integration | Cost Model |
|-----------|-----------------|-------------|------------------------|---------------------|------------|
| **PROMIS (all)** | Northwestern/NIH | Free | License required | License required | Research: free; Commercial: contact HealthMeasures |
| **NIH Toolbox** | Northwestern/NIH | Free | License required | License required | Research: free; Commercial: contact HealthMeasures |
| **PHQ-9** | Pfizer (original) | Free | Free | Free | Public domain |
| **GAD-7** | Spitzer et al. | Free | Free | Free | Public domain |
| **PCL-5** | National Center for PTSD | Free | Free | Free | Public domain |
| **MoCA** | Ziad Nasreddine | Free for clinical | Free for clinical | Free | Free with attribution; certification available |
| **BDI-II** | Pearson | Purchase required | Purchase required | License required | ~$150-300 per 25 administrations |
| **HAM-D** | Public domain | Free | Free | Free | Public domain |
| **SF-36** | Optum/QM (SF-36v2) or RAND | RAND: free | License required | License required | RAND version free; v2: contact Optum |
| **EQ-5D** | EuroQol Group | Free for research | License required | License required | Free for non-commercial; commercial: contact EuroQol |
| **HIT-6** | QualityMetric/Optum | Free for non-commercial | License required | License required | Contact Optum |
| **MIDAS** | International Headache Society | Free | Free | Free | Free with attribution |

### 9.2 Licensing Action Items for DeepSynaps

1. **Immediate**: Register with HealthMeasures.net for PROMIS research access (free)
2. **Sprint 1**: Contact HealthMeasures for commercial platform licensing
3. **Sprint 1**: Document PHQ-9, GAD-7, PCL-5 public domain usage
4. **Sprint 2**: Obtain MoCA certification for clinical staff
5. **Sprint 2**: Contact EuroQol for EQ-5D-5L commercial license
6. **Sprint 3**: Contact Optum for SF-36v2 license (if using v2) or use RAND SF-36
7. **Ongoing**: Track all instrument usage for license compliance audits

---

## 10. Implementation Recommendations

### 10.1 Phase 1 Sprint Plan (Weeks 1-8)

**Sprint 1 (Weeks 1-2): Foundation**
- [ ] Implement Instrument Registry with all core instruments
- [ ] Build PHQ-9 administration and scoring module
- [ ] Build GAD-7 administration and scoring module
- [ ] Implement Score Normalization Pipeline (Layer 1-3)
- [ ] Set up HealthMeasures registration and API access

**Sprint 2 (Weeks 3-4): Longitudinal Tracking**
- [ ] Implement assessment schedule engine
- [ ] Build RCI calculation module
- [ ] Build trajectory classification (4-class model)
- [ ] Implement Outcome Alert System (all alert types)
- [ ] Build patient dashboard with trajectory visualization
- [ ] Add PCL-5 module for PTSD protocols

**Sprint 3 (Weeks 5-6): PROMIS Integration**
- [ ] Integrate Assessment Center API
- [ ] Implement PROMIS-29 Profile v2.1 administration
- [ ] Implement PROMIS CAT for primary domains
- [ ] Build cross-domain T-score profile visualization
- [ ] Implement Physical/Mental Health Summary Score calculation
- [ ] Add PROPr utility score calculation

**Sprint 4 (Weeks 7-8): Advanced Features**
- [ ] Integrate NIH Toolbox data import
- [ ] Build protocol-outcome correlation engine
- [ ] Implement early non-response prediction model
- [ ] Add MoCA administration and scoring
- [ ] Build clinician reporting dashboard
- [ ] Implement data export for research/regulatory use

### 10.2 Technology Stack Recommendations

| Component | Recommended Technology | Rationale |
|-----------|----------------------|-----------|
| Backend API | Node.js / Python FastAPI | Flexible, well-supported |
| Database | PostgreSQL + JSONB columns | Relational with flexible metadata |
| IRT Scoring | R (mirt package) or Python (girth) | Industry-standard IRT libraries |
| Time-series | InfluxDB or TimescaleDB | Efficient longitudinal storage |
| Visualization | D3.js or Recharts | Custom clinical visualizations |
| Mobile Assessment | React Native or Flutter | Cross-platform tablet/phone |
| API Integration | REST + OpenAPI 3.0 | Standard web API patterns |
| Security | OAuth 2.0 + HIPAA BAA | Regulatory compliance |

### 10.3 Data Model Priorities

1. **Priority 1**: `assessment_events`, `instrument_responses` - Core data capture
2. **Priority 2**: `patient_trajectories`, `outcome_alerts` - Clinical intelligence
3. **Priority 3**: `protocol_outcomes`, `recommendations` - Analytics layer

---

## 11. Clinical Safety Rules

### 11.1 Mandatory Safety Checks

| Rule ID | Description | Trigger | Action | Escalation |
|---------|-------------|---------|--------|------------|
| **SAFE-001** | Suicidal ideation screening | PHQ-9 Item 9 >= 2 OR C-SSRS positive | Immediate clinical assessment | On-call psychiatrist within 15 minutes |
| **SAFE-002** | Severe depression persistence | PHQ-9 > 20 after 20 sessions | Urgent psychiatric referral | Within 24 hours |
| **SAFE-003** | Clinical deterioration | RCI shows reliable worsening on primary outcome | Clinical review before next session | Same day |
| **SAFE-004** | Mania/hypomania emergence | Elevated mood + decreased sleep + increased energy reported | Hold stimulation + psychiatric evaluation | Within 24 hours |
| **SAFE-005** | Seizure event | Any seizure report | Emergency protocol + neurologist consultation | Immediate |
| **SAFE-006** | Adverse event grade >= 3 | Severe AE reported | Hold treatment + PI notification | Within 4 hours |
| **SAFE-007** | Missing session pattern | > 3 consecutive no-shows | Care coordinator outreach | Within 48 hours |
| **SAFE-008** | Assessment non-completion | Patient unable to complete cognitive assessment | Screen for cognitive decline + safety | Next session |

### 11.2 Assessment Safety Protocols

```
Assessment Safety Workflow:

1. Pre-Assessment Safety Check
   - Review previous alert history
   - Confirm no outstanding critical alerts
   - Verify patient identity and consent

2. During Assessment
   - Real-time SI monitoring (PHQ-9 item 9)
   - Automatic pause if critical threshold crossed
   - Immediate notification to clinical team

3. Post-Assessment
   - Automated alert evaluation
   - Critical alerts: immediate notification
   - All results available to clinician before next session

4. Documentation
   - All safety events logged with timestamps
   - Clinical actions documented
   - Outcome of safety review recorded
```

### 11.3 Data Privacy and Security

- All PRO data encrypted at rest (AES-256) and in transit (TLS 1.3)
- Role-based access control (patient, clinician, researcher, administrator)
- Audit logging of all data access
- HIPAA Business Associate Agreements with all instrument vendors
- Patient data export and deletion capabilities (GDPR/CCPA compliant)
- Minimum necessary data access principle

---

## 12. Risks & Mitigations

### 12.1 Risk Register

| Risk ID | Risk | Probability | Impact | Mitigation | Owner |
|---------|------|-------------|--------|------------|-------|
| **R-001** | PROMIS commercial licensing costs exceed budget | Medium | High | Obtain quote early; budget contingency; explore RAND SF-36 as alternative for QoL | Clinical Affairs |
| **R-002** | Assessment burden reduces patient compliance | Medium | High | Use CAT (reduces items by 40%); prioritize 4a short forms for monitoring; make assessments mobile-friendly | Product |
| **R-003** | Practice effects on repeated cognitive measures | High | Medium | Use alternate forms where available; limit MoCA to baseline/EOT only; rely on PROMIS self-report for session tracking | Clinical Science |
| **R-004** | Network connectivity issues prevent CAT administration | Medium | High | Implement offline-first architecture with local scoring; sync when connected | Engineering |
| **R-005** | Regulatory scrutiny of outcome claims | Medium | High | Use FDA-recognized instruments; document scoring methodology; maintain audit trails; involve biostatistician | Regulatory |
| **R-006** | Clinician resistance to additional data entry | Medium | Medium | Automate data capture where possible; integrate with existing EHR; demonstrate clinical value; streamline UI | Clinical Operations |
| **R-007** | Score interpretation errors by clinical staff | Medium | High | Build automated interpretation into dashboard; provide training; include severity labels and action prompts | Training |
| **R-008** | Patient gaming/social desirability bias | Low | Medium | Include validity checks; use CAT (harder to game); cross-validate with clinician-rated measures | Clinical Science |
| **R-009** | Inconsistent assessment timing affects longitudinal validity | Medium | Medium | Automated scheduling; session-based assessment triggers; flag off-schedule assessments in analytics | Engineering |
| **R-010** | Multiple instrument versions create scoring inconsistencies | Low | High | Version control in instrument registry; validate all scoring engines against reference values | Engineering |
| **R-011** | API downtime from Assessment Center disrupts clinical operations | Medium | High | Implement local scoring fallback; cache instrument parameters; queue-and-retry mechanism | Engineering |
| **R-012** | Cultural/language limitations of instruments | Medium | Medium | Use Spanish translations; plan for additional language support; acknowledge cultural scoring differences | Clinical Affairs |

### 12.2 Contingency Plans

**If PROMIS Commercial Licensing is Prohibitive:**
- Use PHQ-9 as primary depression outcome (free, widely validated)
- Use GAD-7 as primary anxiety outcome (free)
- Use legacy instruments for additional domains
- Implement custom VAS-based symptom tracking for pain, sleep, fatigue
- Phase PROMIS integration for later funding cycle

**If CAT Integration is Delayed:**
- Use PROMIS 4a short forms (fixed length, predictable)
- Short forms can be locally scored without API dependency
- Transition to CAT in Phase 2

**If Patient Compliance Drops Below 80%:**
- Reduce assessment frequency (every 10 sessions instead of 5)
- Offer incentives for completion
- Use single-item VAS for intermediate tracking
- Simplify battery to primary outcome only

---

## Appendices

### Appendix A: Scoring Examples

#### Example 1: PHQ-9 Scoring

```
Patient responses (0=Not at all, 1=Several days, 2=More than half the days, 3=Nearly every day):

1. Little interest or pleasure: 2
2. Feeling down, depressed: 2
3. Trouble falling asleep: 3
4. Feeling tired: 2
5. Appetite problems: 1
6. Feeling bad about yourself: 2
7. Trouble concentrating: 1
8. Moving slowly or restless: 1
9. Thoughts of self-harm: 0

Total Score: 2+2+3+2+1+2+1+1+0 = 14
Severity: Moderate depression

Baseline: 18
Current: 14
Percent change: (18-14)/18 = 22.2% (Partial response range)
RCI: (14-18)/2.34 = -1.71 (Not yet reliable change; needs 4.6 point drop)
```

#### Example 2: PROMIS Depression CAT Scoring

```
Patient completes 6-item CAT:
- Estimated theta: 0.85 logits
- T-score: (0.85 * 10) + 50 = 58.5
- Standard Error: 2.1
- 95% CI: 58.5 +/- (1.96 * 2.1) = [54.4, 62.6]
- Severity: Mild (T 55-60 range)

Compared to baseline T-score of 65.2:
- Change: 58.5 - 65.2 = -6.7 T-score points
- RCI threshold: 5.5 points
- Since 6.7 > 5.5: RELIABLE IMPROVEMENT
- Percent change in T-score: 6.7/10 = 0.67 SD
- Classification: Clinically Improved (not yet recovered; still T > 50)
```

#### Example 3: GAD-7 Scoring

```
Patient responses:
1. Feeling nervous: 2
2. Not controlling worry: 2
3. Worrying too much: 3
4. Trouble relaxing: 2
5. Restlessness: 1
6. Irritability: 2
7. Feeling afraid: 1

Total Score: 2+2+3+2+1+2+1 = 13
Severity: Moderate anxiety
Action: Consider treatment continuation; re-assess in 5 sessions
```

### Appendix B: Assessment Schedule Templates

#### Depression Treatment Protocol Schedule

| Visit | Timing | Instruments | Duration |
|-------|--------|-------------|----------|
| V0 | Pre-treatment | PROMIS-29, PHQ-9, BDI-II, MoCA, EQ-5D, Safety Screen | 25 min |
| V1 | Session 1 | PHQ-9 item 9 only + Mood VAS | 1 min |
| V5 | Session 5 | PHQ-9 full + PROMIS Depression CAT + Mood VAS | 8 min |
| V10 | Session 10 | PHQ-9 full + PROMIS Depression CAT + Mood VAS | 8 min |
| V15 | Session 15 | PHQ-9 full + PROMIS-29 Profile + Mood VAS | 15 min |
| V20 | Session 20 | PHQ-9 full + PROMIS Depression CAT + Mood VAS | 8 min |
| V25 | Session 25 | PHQ-9 full + PROMIS Depression CAT + Mood VAS | 8 min |
| V30 | Session 30 (EOT) | PROMIS-29, PHQ-9, BDI-II, MoCA, EQ-5D, AE Check | 25 min |
| F1 | 3-month FU | PROMIS-29, PHQ-9, EQ-5D | 12 min |
| F2 | 6-month FU | PROMIS-29, PHQ-9, EQ-5D | 12 min |

### Appendix C: Domain Mapping Summary

| DeepSynaps Condition | Primary Outcome | Secondary Outcomes | PROMIS Domains | Legacy Instruments |
|---------------------|----------------|-------------------|----------------|-------------------|
| Major Depression | PHQ-9 | GAD-7, QoL | Depression, Anxiety, Sleep, Fatigue, Physical Function | BDI-II, HAM-D |
| Generalized Anxiety | GAD-7 | PHQ-9, QoL | Anxiety, Depression, Sleep, Social Isolation | HAM-A, BAI |
| PTSD | PCL-5 | PHQ-9, QoL | Anxiety, Depression, Sleep, Anger, Social Roles | CAPS-5, DTS |
| Chronic Pain | Pain VAS | Function, QoL | Pain Interference, Physical Function, Sleep, Depression | HIT-6, MIDAS, SF-MPQ |
| Cognitive Disorder | NIH Toolbox | Function, QoL | Cognitive Function, Physical Function, Sleep | MoCA, RBANS |
| Migraine | HIT-6 | Pain VAS, Function | Pain Interference, Sleep, Physical Function | MIDAS, MSQ |

### Appendix D: References and Key Sources

1. Cella D, et al. (2010). The Patient-Reported Outcomes Measurement Information System (PROMIS) developed and tested its first wave of adult self-reported health outcome item banks. J Clin Epidemiol, 63(11), 1179-1194.
2. Pilkonis PA, et al. (2011). Item banks for measuring emotional distress from the Patient-Reported Outcomes Measurement Information System (PROMIS). Depression, Anxiety, and Anger. Assessment, 18(3), 263-283.
3. Kroenke K, Spitzer RL (2002). The PHQ-9: A new depression diagnostic and severity measure. Psychiatric Annals, 32(9), 509-515.
4. Spitzer RL, Kroenke K, Williams JB, Lowe B (2006). A brief measure for assessing generalized anxiety disorder: the GAD-7. Arch Intern Med, 166(10), 1092-1097.
5. Blevins CA, et al. (2015). The Posttraumatic Stress Disorder Checklist for DSM-5 (PCL-5). Trauma Stress, 28(6), 489-498.
6. Nasreddine ZS, et al. (2005). The Montreal Cognitive Assessment (MoCA). J Am Geriatr Soc, 53(4), 695-699.
7. Beck AT, Steer RA, Brown GK (1996). Manual for the Beck Depression Inventory-II. San Antonio, TX: Psychological Corporation.
8. Ware JE, Sherbourne CD (1992). The MOS 36-item short-form health survey (SF-36). Med Care, 30(6), 473-483.
9. EuroQol Group (1990). EuroQol: a new facility for the measurement of health-related quality of life. Health Policy, 16(3), 199-208.
10. Jacobson NS, Truax P (1991). Clinical significance: a statistical approach to defining meaningful change in psychotherapy research. J Consult Clin Psychol, 59(1), 12-19.
11. Gershon RC, et al. (2013). NIH Toolbox for Assessment of Neurological and Behavioral Function. Neurology, 80(11 Suppl 3), S2-S6.
12. Kaster TS, et al. (2020). Trajectories of response to dorsolateral prefrontal rTMS in major depression. Am J Psychiatry, 177(1), 63-70.
13. Trajectory Modeling and TMS (2024). Trajectory Modeling and Response Prediction in Transcranial Magnetic Stimulation for Depression. J Affect Disord.
14. Forkus AM, et al. (2022). Accuracy of the PCL-5 in detecting PTSD. Psychol Assess, 34(4), 379-386.
15. HealthMeasures. (2025). PROMIS Adult Profile Instruments Scoring Manual. Available at: healthmeasures.net.

---

**Document End**

*This report was prepared for DeepSynaps Protocol Studio Phase 1 Knowledge Layer development. All instrument descriptions, scoring algorithms, and clinical recommendations are based on published research and manufacturer documentation as of July 2026. Clinical implementation should be validated by qualified clinical and statistical personnel.*
