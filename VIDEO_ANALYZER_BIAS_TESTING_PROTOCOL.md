# DeepSynaps Video/Movement Analyzer: Bias Testing Protocol

## Demographic Fairness, Camera Variability, and Environmental Robustness Assessment

---

**Document Version:** 1.0  
**Date:** 2025-08-28  
**Device Name:** DeepSynaps Video/Movement Analyzer  
**Regulatory Context:** FDA AI/ML SaMD Action Plan, FDA Guidance on Clinical Decision Support  
**Aligned Standards:** ISO/IEC 23053:2022, ISO/IEC 23894:2023, NIST AI RMF 1.0  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Regulatory Context & Standards Alignment](#2-regulatory-context--standards-alignment)
3. [Demographic Bias Categories](#3-demographic-bias-categories)
4. [Camera Variability Testing](#4-camera-variability-testing)
5. [Environmental Variability Testing](#5-environmental-variability-testing)
6. [Test Datasets](#6-test-datasets)
7. [Performance Metrics](#7-performance-metrics)
8. [Fairness Metrics](#8-fairness-metrics)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Testing Procedures](#10-testing-procedures)
11. [Remediation Procedures](#11-remediation-procedures)
12. [Reporting & Documentation](#12-reporting--documentation)
13. [Continuous Monitoring](#13-continuous-monitoring)
14. [Appendices](#14-appendices)

---

## 1. Executive Summary

This document defines the comprehensive bias testing protocol for the DeepSynaps Video/Movement Analyzer, a clinical decision-support system that uses computer vision and machine learning to extract movement biomarkers from patient videos. The protocol addresses demographic bias (skin tone, age, sex, body type, ethnicity), camera variability (angle, distance, resolution, lighting), and environmental conditions (indoor/outdoor, background complexity) that may affect algorithmic performance.

**Scope:** This protocol applies to all ML-based components of the Video/Movement Analyzer, including:
- Pose estimation (MediaPipe BlazePose, RTMPose)
- Gait analysis engine (stride length, cadence, velocity, variability)
- Tremor detection module (frequency, amplitude)
- Postural stability assessment
- Facial movement analysis (hypomimia scoring)
- Movement classification (stereotypical movements, bradykinesia)

**Objective:** Ensure equitable, reliable, and safe performance across all patient populations and real-world clinical environments before commercial deployment. Demonstrate compliance with FDA AI/ML guidance, NIST AI Risk Management Framework, and international standards for AI system fairness.

**Key Principle:** All bias testing follows the "no single number tells the whole story" philosophy -- aggregate accuracy is insufficient; per-subgroup performance must be explicitly measured and reported.

---

## 2. Regulatory Context & Standards Alignment

### 2.1 FDA Requirements

| FDA Guidance/Document | Applicability |
|----------------------|---------------|
| "Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device (SaMD) Action Plan" (Jan 2021) | Requires transparency and real-world performance monitoring across demographic groups |
| "Good Machine Learning Practice for Medical Device Development" (Oct 2021) | Principle 4: Ensure datasets represent the intended patient population |
| "Cybersecurity in Medical Devices" (Sep 2023) | Includes model security and adversarial robustness |
| "Marketing Submission Recommendations for a Predetermined Change Control Plan" (Apr 2023) | Requires bias evaluation as part of modification protocols |

### 2.2 NIST AI Risk Management Framework

| Function | Category | DeepSynaps Implementation |
|----------|----------|--------------------------|
| Govern | GOVERN 1-6 | Bias governance structure; roles and responsibilities defined |
| Map | MAP 1-5 | Context mapping; demographic factors identified; stakeholder engagement |
| Measure | MEASURE 1-4 | This protocol; quantitative fairness metrics; per-subgroup performance |
| Manage | MANAGE 1-4 | Remediation procedures; risk prioritization; continuous monitoring |

### 2.3 ISO Standards

| Standard | Application |
|----------|-------------|
| ISO/IEC 23053:2022 (Framework for AI systems using ML) | ML system bias evaluation framework |
| ISO/IEC 23894:2023 (AI Risk Management) | Risk-based approach to AI bias assessment |
| ISO/TR 24027:2020 (AI bias in AI systems) | Bias types and mitigation techniques |
| ISO/IEC 25059 (SQuAIRE -- AI quality model) | Quality characteristics for AI-based systems |

---

## 3. Demographic Bias Categories

### 3.1 Skin Tone -- Fitzpatrick Scale (I-VI)

The Fitzpatrick skin phototype scale (FST) is used as the primary skin tone categorization framework. This aligns with the FAIR benchmark evaluation methodology and the Dermatology AI consensus on skin tone classification.

| FST Category | Description | ITA Range (Individual Typology Angle) |
|--------------|-------------|--------------------------------------|
| Type I | Very fair; always burns, never tans | > 55 |
| Type II | Fair; usually burns, tans minimally | 41-55 |
| Type III | Medium; sometimes burns, tans gradually | 28-40 |
| Type IV | Olive; rarely burns, tans well | 10-27 |
| Type V | Brown; very rarely burns, tans darkly | -30 to 10 |
| Type VI | Dark; never burns, deeply pigmented | < -30 |

**Rationale for Testing:** Research consistently demonstrates that computer vision models exhibit systematic performance variation across skin tones. The FAIR benchmark shows most multimodal models achieve only 40-50% accuracy in skin tone recognition tasks, with consistent bias toward lighter skin tones. Pose estimation accuracy (mAP) can vary by 5-15 percentage points between FST I and FST VI in uncontrolled conditions.

**DeepSynaps Implementation:**
- Minimum sample size: **300 individuals per FST category** (n=1,800 total minimum)
- ITA measurement via automated skin tone extraction from facial region
- Independent ITA verification by trained human annotators (n=3 annotators per sample)
- Performance reported separately for each FST category

### 3.2 Age Groups

| Age Group | Code | Age Range | Rationale |
|-----------|------|-----------|-----------|
| Pediatric (Early) | AGE-P1 | 2-5 years | Rapid motor development; small body size; different movement patterns |
| Pediatric (Late) | AGE-P2 | 6-12 years | School-age; standardization possible; neurodevelopmental conditions |
| Adolescent | AGE-A | 13-17 years | Pubertal changes; adolescent-onset movement disorders |
| Young Adult | AGE-YA | 18-35 years | Reference population; baseline movement norms |
| Middle Age | AGE-MA | 36-64 years | Adult-onset movement disorders; pre-senile conditions |
| Older Adult (Young-Old) | AGE-O1 | 65-79 years | Age-related movement changes; Parkinson's peak incidence |
| Older Adult (Old-Old) | AGE-O2 | 80+ years | Frailty; balance impairment; highest fall risk |

**DeepSynaps Implementation:**
- Minimum sample size: **200 individuals per age group** (n=1,400 total minimum)
- Age verification via government-issued ID
- Age-appropriate movement tasks (simplified tasks for pediatric/geriatric)
- Separate normative ranges per age group
- Pediatric-specific consent workflow with guardian authorization

### 3.3 Sex

| Category | Definition | Testing Notes |
|----------|------------|---------------|
| Female | Self-reported female | Includes hormonal cycle phase annotation where relevant |
| Male | Self-reported male | Reference for comparative analysis |
| Intersex | Self-reported intersex | Documented separately; small sample expectations noted |

**DeepSynaps Implementation:**
- Minimum sample size: **400 females, 400 males**; intersex individuals included with appropriate privacy protections
- Sex-specific analysis for movement parameters known to differ (e.g., gait parameters, Q-angle)
- Performance gap analysis between sexes for all biomarkers

### 3.4 Body Type / Body Habitus

| Category | BMI Range | Movement Implications |
|----------|-----------|----------------------|
| Underweight | BMI < 18.5 | Altered joint visibility; potential cachexia-related movement changes |
| Normal | BMI 18.5-24.9 | Reference population; optimal pose estimation conditions |
| Overweight | BMI 25.0-29.9 | Potential self-occlusion; altered gait mechanics |
| Obese Class I | BMI 30.0-34.9 | Self-occlusion of joints; waddling gait; pose estimation challenges |
| Obese Class II | BMI 35.0-39.9 | Significant self-occlusion; altered movement patterns |
| Obese Class III | BMI >= 40.0 | Severe pose estimation challenges; modified movement tasks may be needed |

**DeepSynaps Implementation:**
- Minimum sample size: **150 individuals per BMI category** (n=900 total minimum)
- BMI calculated from measured height/weight at time of video capture
- Self-occlusion handling explicitly tested
- Modified pose estimation parameters for high-BMI individuals
- Alternative landmark tracking for occluded joints

### 3.5 Ethnicity / Ancestry

| Category | Self-Reported Categories | Rationale |
|----------|------------------------|-----------|
| African / Black | African, African American, Caribbean, Afro-Latino | Highest FST V-VI representation; potential algorithmic bias |
| East Asian | Chinese, Japanese, Korean, Vietnamese | Distinct facial structure; potential pose estimation variation |
| South Asian | Indian, Pakistani, Bangladeshi, Sri Lankan | FST range III-V; diverse body types |
| European / White | European ancestry | Often overrepresented in training data; reference group risk |
| Hispanic / Latino | Latin American, Hispanic | Mixed ancestry; diverse FST range |
| Middle Eastern | Arab, Persian, Turkish, North African | FST range II-V; distinct facial features |
| Indigenous | Native American, First Nations, Aboriginal, Maori | Underrepresented in training data |
| Multiracial / Other | Mixed ancestry | Growing population; intersectional bias risk |

**DeepSynaps Implementation:**
- Minimum sample size: **200 individuals per ethnic category** (n=1,600 total minimum)
- Self-report with free-text option for specificity
- Cross-analysis with FST category (ethnicity x skin tone interaction)
- Explicit testing for underrepresented groups (Indigenous, multiracial)
- Community partnership for equitable recruitment

---

## 4. Camera Variability Testing

### 4.1 Camera Angle

| Angle | Description | Clinical Context | Testing Priority |
|-------|-------------|------------------|------------------|
| Frontal (0 degrees) | Camera facing subject directly | Standard clinical capture; gait analysis | High |
| Sagittal Left (90 degrees) | Camera to subject's left side | Gait profile; stride length validation | High |
| Sagittal Right (90 degrees) | Camera to subject's right side | Gait profile; asymmetry detection | High |
| 45-degree oblique left | Camera at 45 degrees to subject's left | Compromise view; telehealth common | Medium |
| 45-degree oblique right | Camera at 45 degrees to subject's right | Compromise view; telehealth common | Medium |
| Overhead (~60-80 degrees) | Camera above subject looking down | Ceiling-mounted; inpatient settings | Low |
| Low angle (~10-30 degrees) | Camera below eye level | Improvised telehealth setup | Medium |

**DeepSynaps Implementation:**
- Minimum 50 videos per angle (n=350 total minimum)
- Automated angle detection and validation
- Performance comparison across all angles for each biomarker
- Optimal angle recommendation per biomarker type
- Graceful degradation specification for suboptimal angles

### 4.2 Camera Distance

| Distance | Category | Field of View | Use Case |
|----------|----------|---------------|----------|
| 1.0-1.5 meters | Very close | Full body fills frame | Facial analysis; upper limb tremor |
| 1.5-2.5 meters | Close | Full body visible | Standard clinical room; facial + body analysis |
| 2.5-4.0 meters | Standard | Full body + walking path | Gait analysis; recommended range |
| 4.0-6.0 meters | Wide | Full gait cycle visible | Large clinic room; 10-meter walk test |
| 6.0+ meters | Very wide | Multiple gait cycles | Home environment; hallway capture |

**DeepSynaps Implementation:**
- Minimum 50 videos per distance category (n=250 total minimum)
- Accuracy degradation curve across distances
- Distance estimation from video metadata
- Optimal distance recommendation per biomarker
- Minimum acceptable distance threshold with warning

### 4.3 Camera Resolution

| Resolution | Pixels | Category | Clinical Context |
|------------|--------|----------|------------------|
| 480p | 854 x 480 | Low | Older smartphones; compressed video; minimum acceptable |
| 720p | 1280 x 720 | Standard | Typical telehealth; acceptable quality |
| 1080p | 1920 x 1080 | High | Recommended; standard clinical capture |
| 1440p (2K) | 2560 x 1440 | Very High | Premium smartphones; enhanced detail |
| 2160p (4K) | 3840 x 2160 | Ultra High | Research settings; maximum detail |

**DeepSynaps Implementation:**
- Minimum 100 videos per resolution (n=500 total minimum)
- Same video content downsampled to each resolution for controlled comparison
- Per-biomarker minimum resolution requirements
- Resolution-based confidence adjustment
- Automatic quality assessment before processing

### 4.4 Lighting Conditions

| Condition | Lux Range | Description | Clinical Context |
|-----------|-----------|-------------|------------------|
| Very dim | < 50 lux | Poorly lit room; evening | Home telehealth; inadequate |
| Dim | 50-100 lux | Suboptimal indoor lighting | Home environment; marginal |
| Standard indoor | 100-300 lux | Office/clinic lighting | Standard clinical setting |
| Bright indoor | 300-500 lux | Well-lit clinic room | Optimal indoor conditions |
| Very bright indoor | 500-1000 lux | Near-window; bright LED | Potential overexposure |
| Natural outdoor (overcast) | 1000-10000 lux | Cloudy day | Outdoor rehabilitation |
| Natural outdoor (direct sun) | 10000-100000 lux | Direct sunlight | Harsh shadows; overexposure |
| Mixed lighting | Variable | Window + indoor light | Uneven exposure |

**DeepSynaps Implementation:**
- Minimum 50 videos per lighting condition (n=400 total minimum)
- Lux measurement with calibrated light meter at time of capture
- Low-light performance threshold defined
- Automatic lighting quality assessment
- Pre-processing pipeline (histogram equalization, gamma correction)
- Minimum lighting requirement with user guidance

### 4.5 Frame Rate

| Frame Rate | Category | Suitability |
|------------|----------|-------------|
| 15 fps | Very low | Unacceptable for tremor analysis; acceptable for slow gait |
| 24 fps | Low | Cinematic standard; marginal for clinical use |
| 30 fps | Standard | Minimum acceptable; sufficient for gait and posture |
| 60 fps | High | Recommended for tremor and rapid movements |
| 120+ fps | Very high | Research-grade; optimal for fine movement analysis |

**DeepSynaps Implementation:**
- Minimum 50 videos per frame rate (n=250 total minimum)
- Per-biomarker minimum frame rate requirements
- Temporal interpolation testing for low frame rate inputs
- Frame rate detection and validation

---

## 5. Environmental Variability Testing

### 5.1 Indoor vs. Outdoor

| Environment | Sub-categories | Challenges |
|-------------|---------------|------------|
| Indoor - Clinic | Examination room, gym, hallway | Controlled; reference standard |
| Indoor - Home | Living room, bedroom, hallway | Variable lighting; background clutter |
| Indoor - Hospital | Patient room, ward, rehab unit | Space constraints; shared rooms |
| Outdoor - Paved | Sidewalk, parking lot, track | Sun/shadow variation; distractions |
| Outdoor - Grass | Lawn, park, sports field | Uneven surface; lighting variation |
| Outdoor - Mixed | Partially covered areas | Mixed lighting conditions |

**DeepSynaps Implementation:**
- Minimum 100 videos per environment type (n=600 total minimum)
- Background subtraction robustness testing
- Environmental factor tagging and analysis
- Per-environment performance reporting
- Environment-specific quality thresholds

### 5.2 Background Complexity

| Complexity Level | Description | Example |
|------------------|-------------|---------|
| Minimal | Plain, uniform background | White wall; studio backdrop |
| Low | Simple, uncluttered background | Single-color wall; empty room |
| Medium | Some background objects | Furniture; medical equipment visible |
| High | Complex, busy background | Home environment; multiple objects |
| Very High | Moving background elements | Other people walking; traffic; animals |

**DeepSynaps Implementation:**
- Minimum 50 videos per complexity level (n=250 total minimum)
- Background complexity scoring algorithm
- Segmentation accuracy across complexity levels
- Minimum background complexity requirement
- Foreground/background separation robustness

### 5.3 Clothing Variability

| Clothing Factor | Categories | Impact on Pose Estimation |
|-----------------|------------|--------------------------|
| Color contrast | Dark on light background, Light on dark background, Similar tones | Affects keypoint visibility |
| Clothing type | Tight-fitting, Loose, Traditional/cultural dress, Uniform/scrubs | Affects body contour detection |
| Skin coverage | Full coverage (long sleeves/pants), Partial coverage, Minimal coverage | Affects limb visibility |
| Accessories | Watch, Bracelet, Walking aid, Head covering | Potential false keypoints |

**DeepSynaps Implementation:**
- Minimum 50 videos per clothing category (n=200 total minimum)
- Occlusion handling assessment
- False keypoint rate per clothing type
- Accessory detection and handling

### 5.4 Simultaneous Persons

| Scenario | Description | Handling |
|----------|-------------|----------|
| Single subject | Only patient in frame | Standard processing |
| Subject + caregiver | Caregiver assisting patient | Multi-person detection; subject isolation |
| Subject + clinician | Clinician in frame | Multi-person detection; subject isolation |
| Subject + bystanders | Other people in background | Background person suppression |

**DeepSynaps Implementation:**
- Minimum 50 videos per scenario (n=200 total minimum)
- Multi-person pose estimation accuracy
- Subject identification and tracking
- Background person exclusion validation

---

## 6. Test Datasets

### 6.1 Minimum Sample Sizes

The following table summarizes minimum sample sizes per demographic group for each biomarker module:

| Biomarker Module | Overall Minimum | Per FST (x6) | Per Age (x7) | Per Sex (x2) | Per BMI (x6) | Per Ethnicity (x8) |
|-----------------|-----------------|--------------|--------------|--------------|--------------|-------------------|
| Pose Estimation (all keypoints) | 2,000 | 300 | 200 | 400 | 150 | 200 |
| Gait Analysis | 1,500 | 250 | 150 | 300 | 120 | 150 |
| Tremor Detection | 900 | 150 | 100 | 200 | 75 | 100 |
| Postural Stability | 1,000 | 150 | 100 | 200 | 100 | 120 |
| Facial Analysis (Hypomimia) | 1,200 | 200 | 100 | 200 | 100 | 150 |
| Movement Classification | 1,500 | 250 | 150 | 300 | 120 | 150 |

**Total unique individuals required:** Minimum 3,000 (accounting for overlap across modules)

### 6.2 Dataset Composition Requirements

| Requirement | Specification |
|-------------|---------------|
| Geographic diversity | Minimum 5 clinical sites across 3 geographic regions |
| Condition representation | Minimum 30% with movement disorder diagnosis; 70% healthy controls |
| Condition types | Parkinson's (15%), Essential Tremor (5%), Ataxia (3%), Other movement disorders (7%) |
| Age distribution | Representative of target population; no age group < 5% |
| Sex distribution | Target 50% female, 50% male; acceptable range 45-55% |
| Ethnic distribution | Match US Census demographics within 10% margin |
| Camera diversity | Minimum 15 different device models across 5 manufacturers |
| Environment diversity | 40% clinic, 30% home, 15% outdoor, 15% hospital |

### 6.3 Data Collection Protocol

1. **Standardized Movement Tasks:**
   - 10-meter walk test (self-paced, comfortable speed)
   - Timed Up and Go (TUG)
   - Finger-to-nose test (bilateral, 3 repetitions)
   - Postural tremor assessment (arms outstretched, 30 seconds)
   - Rest tremor assessment (seated, hands on lap, 30 seconds)
   - Facial movement sequence (smile, eyebrow raise, lip pursing)
   - Optional: Romberg test, heel-to-toe walking, finger tapping

2. **Reference Measurements (Gold Standard):**
   - Gait: Instrumented walkway (GAITRite or equivalent) OR motion capture (VICON)
   - Tremor: Accelerometer (APDM Opal or equivalent) on affected limb
   - Posture: Force platform (AMTI or equivalent) for center of pressure
   - Facial: Clinician-rated hypomimia scale (standardized photographic assessment)
   - All: Video capture simultaneously with reference measurement

3. **Metadata Collection:**
   - FST assessment (3 independent raters, photographic ITA measurement)
   - Self-reported demographics (age, sex, ethnicity)
   - Measured height, weight for BMI
   - Camera specifications (model, resolution, frame rate)
   - Environmental conditions (indoor/outdoor, lux measurement)
   - Clinical diagnosis and disease severity (if applicable)

### 6.4 Dataset Splitting

| Split | Purpose | Proportion | Stratification |
|-------|---------|------------|---------------|
| Bias Test Set | Primary bias evaluation | 60% | Stratified by all demographic factors |
| Validation Set | Hyperparameter tuning | 20% | Stratified by all demographic factors |
| Holdout Set | Final unbiased evaluation | 20% | Stratified by all demographic factors; locked until final evaluation |

---

## 7. Performance Metrics

### 7.1 Per-Subgroup Metrics

For each demographic subgroup and camera/environmental condition, the following metrics are computed:

| Metric | Symbol | Formula / Description | Threshold |
|--------|--------|----------------------|-----------|
| Accuracy | ACC | (TP + TN) / (TP + TN + FP + FN) | Group-specific |
| Precision | PPV | TP / (TP + FP) | Group-specific |
| Recall (Sensitivity) | TPR | TP / (TP + FN) | Group-specific |
| Specificity | TNR | TN / (TN + FP) | Group-specific |
| F1 Score | F1 | 2 * (PPV * TPR) / (PPV + TPR) | Group-specific |
| Area Under ROC Curve | AUC | Integral of ROC curve | Group-specific |
| Mean Absolute Error | MAE | Mean of absolute differences from reference | Per-biomarker threshold |
| Root Mean Square Error | RMSE | Sqrt of mean squared differences | Per-biomarker threshold |
| Intraclass Correlation Coefficient | ICC | Absolute agreement ICC(2,1) | > 0.85 |
| Mean Bias | Bias | Mean of differences (DeepSynaps - Reference) | Per-biomarker specification |
| Limits of Agreement | LoA | Bias +/- 1.96 * SD of differences | Within clinically acceptable range |

### 7.2 Pose Estimation Specific Metrics

| Metric | Description | Acceptance |
|--------|-------------|------------|
| Keypoint Detection Rate | % of keypoints detected above confidence threshold | > 95% per keypoint per subgroup |
| Mean Per Joint Position Error (MPJPE) | Euclidean distance in pixels from ground truth | < 5% of limb length per subgroup |
| Percentage of Correct Keypoints (PCK@0.05) | % of keypoints within 5% of limb length from ground truth | > 90% per subgroup |
| OKS-based mAP | Object Keypoint Similarity mean Average Precision | > 0.85 per subgroup |

### 7.3 Gait Parameter Specific Metrics

| Parameter | Reference Method | MAE Threshold | ICC Threshold |
|-----------|-----------------|---------------|---------------|
| Stride Length | Instrumented walkway | < 5 cm | > 0.90 |
| Cadence | Footswitch / IMU | < 2 steps/min | > 0.95 |
| Gait Velocity | Instrumented walkway | < 5 cm/s | > 0.90 |
| Stride Time Variability | Instrumented walkway | < 5% CV | > 0.85 |
| Step Length Asymmetry | Instrumented walkway | < 3% asymmetry index | > 0.85 |

### 7.4 Tremor Parameter Specific Metrics

| Parameter | Reference Method | MAE Threshold | ICC Threshold |
|-----------|-----------------|---------------|---------------|
| Tremor Frequency | Accelerometer (FFT) | < 0.5 Hz | > 0.95 |
| Tremor Amplitude | Accelerometer (RMS) | < 15% relative | > 0.85 |
| Tremor Distribution | Clinical rating (0-4) | Weighted kappa > 0.70 | -- |

---

## 8. Fairness Metrics

### 8.1 Demographic Parity

**Definition:** The probability of a positive outcome (e.g., detected abnormality flag) should be independent of the demographic attribute.

**Formula:** P(Y_pred = 1 | A = a) = P(Y_pred = 1 | A = a') for all groups a, a'

**DeepSynaps Application:** Since our system outputs continuous biomarker values (not binary predictions), demographic parity is assessed by comparing the distribution of biomarker values across demographic groups for the same underlying clinical condition. Equal clinical severity should produce equal biomarker outputs regardless of demographic attribute.

**Metric:** Standardized Mean Difference (SMD) of biomarker outputs between demographic groups, controlling for clinical severity.

| SMD Value | Interpretation |
|-----------|---------------|
| < 0.1 | Negligible difference |
| 0.1-0.2 | Small difference |
| 0.2-0.5 | Moderate difference -- requires investigation |
| > 0.5 | Large difference -- requires remediation |

**Acceptance:** SMD < 0.2 for all biomarkers across all demographic pairs.

### 8.2 Equalized Odds

**Definition:** True Positive Rate (TPR) and False Positive Rate (FPR) should be equal across demographic groups.

**Formula:** P(Y_pred = 1 | Y_true = 1, A = a) = P(Y_pred = 1 | Y_true = 1, A = a') AND P(Y_pred = 1 | Y_true = 0, A = a) = P(Y_pred = 1 | Y_true = 0, A = a')

**DeepSynaps Application:** For binary classification tasks (e.g., tremor detected/not detected, gait abnormal/normal), TPR and FPR are compared across demographic groups using the same clinically-defined threshold.

**Metric:** Maximum absolute difference in TPR and FPR between any pair of demographic groups.

**Acceptance:**
- TPR difference < 0.10 between any two demographic groups
- FPR difference < 0.10 between any two demographic groups

### 8.3 Calibration (Predictive Parity)

**Definition:** For any predicted probability score, the actual outcome rate should be the same across demographic groups.

**Formula:** P(Y_true = 1 | S = s, A = a) = P(Y_true = 1 | S = s, A = a') for all score values s

**DeepSynaps Application:** Calibration curves (observed vs. predicted) are compared across demographic groups. The confidence scores output by the system should be equally well-calibrated across all groups.

**Metric:** Calibration error (Expected Calibration Error, ECE) per demographic group; maximum difference in ECE between groups.

**Acceptance:** ECE < 0.05 for all demographic groups; ECE difference < 0.03 between any two groups.

### 8.4 Individual Fairness

**Definition:** Similar individuals (in terms of relevant clinical characteristics) should receive similar outputs regardless of demographic attributes.

**DeepSynaps Application:** Counterfactual fairness testing -- same video with synthetic demographic attribute changes (via generative models) should produce equivalent biomarker outputs within measurement tolerance.

**Metric:** Biomarker output difference for counterfactual pairs; percentage of pairs within acceptable tolerance.

**Acceptance:** > 95% of counterfactual pairs produce biomarker outputs within measurement tolerance (< 3% relative difference).

### 8.5 Fairness Metric Summary Table

| Fairness Metric | Target | Measurement Method | Priority |
|----------------|--------|-------------------|----------|
| Demographic Parity (SMD) | < 0.2 | Standardized mean difference, severity-controlled | High |
| Equalized Odds (TPR gap) | < 0.10 | Maximum TPR difference between groups | High |
| Equalized Odds (FPR gap) | < 0.10 | Maximum FPR difference between groups | High |
| Calibration (ECE) | < 0.05 per group | Expected Calibration Error | High |
| Calibration (ECE gap) | < 0.03 between groups | Maximum ECE difference | High |
| Individual Fairness | > 95% within tolerance | Counterfactual testing | Medium |
| Treatment Equality | < 0.15 ratio | FP/FN ratio equality across groups | Medium |

---

## 9. Acceptance Criteria

### 9.1 Performance Gap Limits

| Biomarker | Overall Accuracy Requirement | Maximum Inter-Group Gap | Groups Compared |
|-----------|---------------------------|------------------------|----------------|
| Pose Estimation (mAP) | > 0.90 | < 0.05 (5 percentage points) | FST I vs FST VI; Age O2 vs Age YA |
| Stride Length (MAE) | < 5 cm | < 3 cm additional error | FST I vs FST VI; BMI Normal vs BMI III |
| Cadence (MAE) | < 2 steps/min | < 1.5 steps/min additional error | All demographic pairs |
| Gait Velocity (MAE) | < 5 cm/s | < 3 cm/s additional error | Age O2 vs Age YA; Outdoor vs Indoor |
| Tremor Frequency (MAE) | < 0.5 Hz | < 0.3 Hz additional error | All demographic pairs |
| Tremor Amplitude (MAE) | < 15% relative | < 10% additional relative error | All demographic pairs |
| Postural Sway (ICC) | > 0.85 | < 0.10 ICC difference | Age O2 vs Age YA |
| Facial Movement Range (MAE) | < 10% relative | < 5% additional relative error | FST I vs FST VI; East Asian vs European |
| Movement Classification (AUC) | > 0.85 | < 0.05 AUC difference | All demographic pairs |

### 9.2 Camera/Environment Acceptance Criteria

| Variability Factor | Optimal Range | Acceptable Range | Degraded Performance Range | Unacceptable Range |
|-------------------|---------------|------------------|---------------------------|-------------------|
| Camera Angle | Frontal, Sagittal | 45-degree oblique | Low angle (< 30 degrees) | Overhead |
| Camera Distance | 2.5-4.0 meters | 1.5-6.0 meters | 1.0-1.5 meters; 6-8 meters | < 1.0 meter; > 8 meters |
| Resolution | 1080p+ | 720p+ | 480p | < 480p |
| Lighting | 300-500 lux | 100-1000 lux | 50-100 lux | < 50 lux |
| Frame Rate | 60 fps | 30 fps | 24 fps | < 24 fps |
| Environment | Indoor clinic | Indoor home | Outdoor overcast | Outdoor direct sun |
| Background | Minimal complexity | Low complexity | Medium complexity | High complexity |

### 9.3 Overall System Acceptance

The DeepSynaps Video/Movement Analyzer will be considered bias-acceptable for deployment if and only if ALL of the following conditions are met:

1. **No group falls below minimum accuracy:** Every demographic subgroup achieves the minimum accuracy threshold for every biomarker.
2. **Performance gap within limits:** The maximum performance gap between any two demographic groups is within the specified limits for all biomarkers.
3. **Fairness metrics met:** All high-priority fairness metrics (demographic parity, equalized odds, calibration) meet their acceptance thresholds.
4. **Camera robustness:** Performance remains within acceptable ranges across the full "acceptable" camera/environment parameter space.
5. **Graceful degradation:** Performance degrades predictably and is detectable in suboptimal conditions, with appropriate uncertainty flags and user warnings.
6. **No unexplained disparities:** All performance differences > 2 percentage points between groups have documented root cause analysis and mitigation plans.

---

## 10. Testing Procedures

### 10.1 Test Execution Workflow

```
Phase 1: Dataset Preparation (Weeks 1-4)
  - Collect and annotate test dataset per Section 6
  - Split into bias test / validation / holdout sets
  - Verify demographic stratification
  - Lock holdout set (no access until final evaluation)

Phase 2: Baseline Evaluation (Weeks 5-6)
  - Run full test suite on bias test set
  - Calculate all performance metrics per subgroup
  - Calculate all fairness metrics
  - Generate baseline report

Phase 3: Issue Identification (Weeks 7-8)
  - Identify subgroups with below-threshold performance
  - Identify performance gaps exceeding limits
  - Root cause analysis for each issue
  - Prioritize issues by severity and patient impact

Phase 4: Remediation (Weeks 9-14)
  - Implement targeted interventions per Section 11
  - Retrain or fine-tune models as needed
  - Validate on validation set (not holdout)

Phase 5: Validation Evaluation (Weeks 15-16)
  - Re-run full test suite on validation set
  - Verify issues are resolved
  - Document improvements

Phase 6: Final Evaluation (Weeks 17-18)
  - Run single evaluation on locked holdout set
  - Generate final bias report
  - Document all findings and residual risks
  - Go/No-Go decision for deployment
```

### 10.2 Statistical Testing

| Test | Purpose | Application |
|------|---------|-------------|
| Two-sample t-test | Compare mean biomarker accuracy between groups | All pairwise group comparisons |
| Chi-square test | Compare categorical outcome rates between groups | Detection rates, classification accuracy |
| ANOVA | Compare means across multiple groups | Multi-group demographic comparisons |
| Bland-Altman analysis | Assess agreement with reference across groups | Systematic bias detection per subgroup |
| Bootstrap confidence intervals | Estimate confidence intervals for performance gaps | 10,000 bootstrap samples; 95% CI |
| McNemar's test | Compare paired classification outcomes | Before/after remediation comparison |
| Bonferroni correction | Adjust for multiple comparisons | All pairwise tests; alpha = 0.05 / N |

### 10.3 Testing Tools

| Tool | Purpose | Source |
|------|---------|--------|
| Aequitas | Bias and fairness audit toolkit | University of Chicago |
| Fairlearn | Fairness assessment and improvement | Microsoft |
| What-If Tool | Interactive model exploration | Google PAIR |
| MLflow | Experiment tracking and model comparison | Open source |
| Custom scripts | DeepSynaps-specific metrics | Internal development |

---

## 11. Remediation Procedures

### 11.1 Remediation Trigger Conditions

Remediation is triggered when any of the following conditions are met:

| Condition | Severity | Response Timeline |
|-----------|----------|------------------|
| Any demographic group below minimum accuracy threshold | **Critical** | Immediate; halt deployment if in pre-launch |
| Performance gap > 5 percentage points between any two groups for any biomarker | **Critical** | Immediate intervention required |
| Fairness metric exceeds threshold (SMD > 0.2, TPR gap > 0.10, ECE gap > 0.03) | **High** | Remediation within 2 weeks |
| Performance gap > 3 percentage points but < 5 percentage points | **Medium** | Remediation within 4 weeks |
| Unexplained performance variation > 2 percentage points | **Low-Medium** | Investigation within 4 weeks; remediation plan within 8 weeks |
| Camera/environment condition causes > 10% accuracy degradation from optimal | **Medium** | Improved pre-processing or user guidance within 2 weeks |

### 11.2 Remediation Strategies

| Strategy | Applicability | Implementation | Effectiveness |
|----------|--------------|----------------|---------------|
| **Targeted Data Collection** | Underperforming subgroups with insufficient training data | Collect additional labeled data from underperforming demographic group; minimum 200 additional samples | High for data-scarcity issues |
| **Data Augmentation** | Camera/environment variability | Synthetic data generation (GAN-based); geometric transformations; lighting simulation; noise injection | Medium-High for environmental variability |
| **Adversarial Debiasing** | Systematic demographic bias | Adversarial training to remove demographic information from learned representations; fairness constraints in loss function | High for representation bias |
| **Re-weighting** | Class imbalance within subgroups | Importance weighting of underrepresented examples in training loss; focal loss for hard examples | Medium for class imbalance |
| **Post-processing Calibration** | Miscalibrated confidence scores | Temperature scaling per subgroup; Platt scaling; isotonic regression | High for calibration issues |
| **Threshold Adjustment** | Different operating points needed per group | Subgroup-specific decision thresholds; ROC curve analysis per group | Medium for equalized odds |
| **Ensemble Diversification** | Single-model limitations | Ensemble of models trained on different demographic subsets; diversity-promoting regularization | Medium for model bias |
| **Architecture Modification** | Fundamental model limitations | Switch to more robust backbone (e.g., RTMPose-l instead of RTMPose-m); add domain adaptation layers | High for architecture limitations |
| **Pre-processing Improvement** | Image quality issues | Histogram equalization; contrast enhancement; shadow removal; skin-tone-aware normalization | Medium-High for lighting/skin-tone issues |
| **Fallback Procedures** | Unresolvable edge cases | Human review trigger for low-confidence outputs; manual annotation pipeline; clinician override workflow | Always applicable as safety net |

### 11.3 Remediation Documentation

Each remediation effort must be documented with:
1. Trigger condition and root cause analysis
2. Selected remediation strategy with rationale
3. Implementation details (code changes, data additions, parameter tuning)
4. Validation results before and after remediation
5. Holdout set evaluation results
6. Residual risk assessment
7. Sign-off by clinical safety officer

### 11.4 Escalation Path

| Level | Trigger | Decision Maker | Action |
|-------|---------|---------------|--------|
| 1 | Single biomarker, single subgroup | Engineering Lead | Implement standard remediation; 2-week timeline |
| 2 | Multiple biomarkers or subgroups; or remediation failure | VP Engineering + Clinical Safety Officer | Comprehensive review; consider architecture changes |
| 3 | Systematic bias across all biomarkers; or Level 2 failure | CEO + Regulatory Affairs + External Advisory Board | Go/No-Go decision; potential project halt; notify FDA if post-market |
| 4 | Patient harm or safety event | CEO + Legal + FDA (if reported) | Immediate device recall or suspension; full investigation |

---

## 12. Reporting & Documentation

### 12.1 Bias Test Report Contents

Each bias test execution must produce a comprehensive report containing:

1. **Executive Summary**
   - Overall pass/fail determination
   - Number of subgroups tested
   - Number of issues identified and resolved
   - Go/No-Go recommendation

2. **Demographic Distribution**
   - Actual vs. target distribution per demographic factor
   - Recruitment summary by site
   - Exclusion reasons and counts

3. **Per-Subgroup Performance Tables**
   - Complete performance metrics per demographic subgroup
   - Confidence intervals for all metrics
   - Comparison to acceptance thresholds

4. **Fairness Metrics Summary**
   - All fairness metrics with values and thresholds
   - Visual fairness dashboards (parity plots, calibration curves)
   - Trend analysis vs. previous test cycles

5. **Camera/Environment Robustness Results**
   - Performance heatmaps across parameter space
   - Degradation curves for each parameter
   - Operating envelope specification

6. **Issue Log**
   - All identified issues with severity classification
   - Root cause analysis
   - Remediation actions taken
   - Validation results post-remediation

7. **Residual Risk Assessment**
   - Unresolved issues with risk level
   - Risk control measures in place
   - Monitoring plan for residual risks

8. **Appendices**
   - Raw data tables
   - Statistical test results
   - Model configuration details
   - Data collection protocols

### 12.2 Regulatory Submission Components

The following bias testing documentation is included in the FDA 510(k) submission:

| Document | Content | Location in Submission |
|----------|---------|----------------------|
| Bias Test Report | Full results of bias testing | Section 19 (Additional Information) |
| Fairness Metrics Summary | Key metrics and acceptance criteria | Section 12 (Performance Testing) |
| Demographic Distribution | Dataset composition and recruitment | Section 16 (Clinical Studies) |
| Remediation Log | Issues and resolutions | Section 19 (Additional Information) |
| Continuous Monitoring Plan | Post-market bias surveillance | Section 17 (Labeling) |

---

## 13. Continuous Monitoring

### 13.1 Post-Market Bias Surveillance

| Monitoring Activity | Frequency | Trigger | Action |
|--------------------|-----------|---------|--------|
| Automated performance tracking | Continuous | Performance drop > 10% from baseline | Alert engineering team |
| Subgroup performance review | Monthly | Gap > 5 percentage points emerging | Immediate investigation |
| Fairness metrics dashboard | Monthly | Any fairness metric exceeds threshold | Remediation within 2 weeks |
| Periodic bias re-testing | Quarterly | Full bias test protocol on new data | Comprehensive report |
| Annual external audit | Annually | Independent third-party assessment | Public transparency report |
| Real-world evidence analysis | Semi-annually | Population shift detected | Model update or retraining |

### 13.2 Model Drift and Bias Amplification

| Drift Type | Indicator | Detection Method | Response |
|------------|-----------|-----------------|----------|
| **Data drift** | Input distribution changes | Feature distribution monitoring (KS test); ITA distribution shifts | Investigate; retrain if persistent |
| **Concept drift** | Relationship between features and outcomes changes | Performance degradation on reference cases; residual analysis | Retrain with updated data |
| **Demographic drift** | Patient population changes | Demographic distribution monitoring | Adjust normative ranges; targeted data collection |
| **Bias amplification** | Fairness metrics degrade over time | Trend analysis of fairness metrics; subgroup performance gaps | Immediate remediation per Section 11 |

### 13.3 Transparency and Reporting

- Bias testing results are reported internally to the Clinical Safety Committee monthly
- Annual public transparency report published (anonymized, aggregate data)
- Serious bias issues reported to FDA as required (MDR reporting if patient harm)
- Bias metrics included in periodic safety updates for EU MDR

---

## 14. Appendices

### Appendix A: Fitzpatrick Skin Tone Assessment Protocol

1. Cleanse skin of any makeup, lotion, or sunscreen
2. Photograph facial skin under standardized lighting (5500K, 500 lux)
3. Extract ITA from cheek region using validated algorithm
4. Three independent human raters classify FST category
5. Consensus FST assignment (majority vote; discuss if disagreement)
6. Document ITA value, FST category, and rater agreement

### Appendix B: Data Collection Forms

Standardized data collection forms for demographic metadata, camera specifications, environmental conditions, and clinical reference measurements. Available separately in the DeepSynaps Data Management System.

### Appendix C: Statistical Analysis Code

Python/R code templates for all statistical tests, fairness metric calculations, and visualization generation. Available in the DeepSynaps GitHub repository under `/tools/bias-testing/`.

### Appendix D: Remediation Case Studies

Documented examples of bias remediation efforts from internal testing, including problem identification, strategy selection, implementation, and validation results. Maintained as living document.

### Appendix E: References

1. Buolamwini, J. & Gebru, T. (2018). "Gender Shades: Intersectional Accuracy Disparities in Commercial Gender Classification." Proceedings of Machine Learning Research, 81:1-15.
2. Zhao, J. et al. (2017). "Men also like shopping: Reducing gender bias amplification using corpus-level constraints." EMNLP 2017.
3. FDA. (2021). "Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device (SaMD) Action Plan."
4. NIST. (2023). "Artificial Intelligence Risk Management Framework (AI RMF 1.0)."
5. ISO/IEC 23053:2022. "Framework for Artificial Intelligence (AI) Systems Using Machine Learning (ML)."
6. ISO/IEC TR 24027:2020. "Information technology -- Artificial intelligence (AI) -- Bias in AI systems and AI aided decision making."
7. Mehrabi, N. et al. (2021). "A Survey on Bias and Fairness in Machine Learning." ACM Computing Surveys, 54(6):1-35.
8. Suresh, H. & Guttag, J.V. (2021). "A Framework for Understanding Sources of Harm throughout the Machine Learning Life Cycle." FAccT 2021.
9. HUST (2025). "Lowest average ITA error (11.20) and bias score (1.58) on FAIR benchmark." ICCV 2025.
10. DeepSynaps Protocol Studio. "VIDEO_AI_SAFETY_ETHICS_REPORT.md." Comprehensive safety and ethics analysis for clinical video AI.

---

*Document Control: This document is controlled under the DeepSynaps Quality Management System. All bias testing must be conducted according to this protocol; deviations require written approval from the Clinical Safety Officer.*

*Next Review Date: 2026-02-28*
*Protocol Version History: 1.0 (Initial release)*
