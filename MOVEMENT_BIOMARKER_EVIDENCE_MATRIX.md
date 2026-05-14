# Clinical Movement Biomarker Evidence Matrix

## DeepSynaps Protocol Studio -- Decision-Support Research Document

**Document Version:** 1.0
**Date:** 2025-06-26
**Scope:** Movement-based biomarkers for neurological and psychiatric conditions
**Evidence Horizon:** 2023--2026
**Classification:** Decision-support research -- NOT clinical advice

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Evidence Grading Framework](#2-evidence-grading-framework)
3. [Gait Analysis Biomarkers](#3-gait-analysis-biomarkers)
4. [Tremor Biomarkers](#4-tremor-biomarkers)
5. [Bradykinesia Markers](#5-bradykinesia-markers)
6. [Postural Instability](#6-postural-instability)
7. [Dyskinesia Detection](#7-dyskinesia-detection)
8. [ASD Behavioural Movement](#8-asd-behavioural-movement)
9. [ADHD Movement Patterns](#9-adhd-movement-patterns)
10. [Developmental Motor Delay](#10-developmental-motor-delay)
11. [Rehabilitation Progression](#11-rehabilitation-progression)
12. [Facial Affect Limitations](#12-facial-affect-limitations)
13. [Balance/Fall Risk](#13-balancefall-risk)
14. [Movement Asymmetry](#14-movement-asymmetry)
15. [Integration Recommendations for DeepSynaps](#15-integration-recommendations-for-deepsynaps)
16. [Regulatory Landscape](#16-regulatory-landscape)
17. [References](#17-references)

---

## 1. Executive Summary

This evidence matrix synthesises peer-reviewed literature (2023--2026) on movement-based biomarkers across neurological and psychiatric conditions relevant to the DeepSynaps video-analysis platform. The matrix covers 12 major biomarker domains spanning Parkinson's disease, Alzheimer's disease and MCI, stroke, multiple sclerosis, ALS, autism spectrum disorder, ADHD, developmental conditions, and fall-risk assessment.

**Key Findings:**
- **FDA-cleared tools** are emerging: Neu Health received 510(k) clearance in 2025 for smartphone-based tremor monitoring in Parkinson's disease.
- **Computer vision pose estimation** (MediaPipe, OpenPose, ViTPose) is now validated for clinical movement assessment with AUC values of 0.71--0.99 for PD diagnosis.
- **Gait parameters** (stride length, cadence, velocity, variability) show the strongest evidence base with multiple meta-analytic supports.
- **Dual-task gait assessment** is a rapidly growing biomarker domain for MCI/AD detection, with AUC values reaching 0.92 for dementia classification.
- **Hypomimia detection** via facial video analysis achieves 81--92% accuracy for PD auxiliary diagnosis.
- **ASD stereotypical movement detection** via 3D-CNN achieves 92.5% recall with 66.8% precision.
- **ADHD motor activity** quantification via pose estimation achieves 81.8% classification accuracy (AUC 0.85).

---

## 2. Evidence Grading Framework

| Grade | Definition | Icon |
|-------|-----------|------|
| **A** | Meta-analysis, systematic review, or large RCT (n>100) | |
| **B** | Randomised controlled trial or well-designed prospective study | |
| **C** | Observational study, case-control, or pilot with n<50 | |
| **D** | Proof-of-concept, in-silico, or expert opinion | |

### Clinical-Use Status Categories

| Status | Description |
|--------|-------------|
| **FDA-cleared** | 510(k) or PMA approved by US FDA |
| **CE-marked** | Conformite Europeenne marked |
| **Clinical-adjunct** | Used alongside standard clinical assessment |
| **Research-only** | Not validated for clinical decision-making |

---

## 3. Gait Analysis Biomarkers

### 3.1 Parkinson's Disease -- Stride Length

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease |
| **Movement Feature** | Stride length (m) during 10-m walk and Timed Up-and-Go |
| **Evidence Strength** | **A** -- Multiple systematic reviews and meta-analyses confirm stride length reduction in PD |
| **Clinical-Use Status** | Clinical-adjunct (instrumented walkways); research-only (video-based) |
| **Research-Only Flag** | True for CV-based assessment; FDA-cleared systems exist for wearable approaches |
| **Safe Clinical Wording** | "Research indicates that reduced stride length is commonly observed in Parkinson's disease and may serve as a supportive metric alongside clinical evaluation. Video-based stride length estimation should not replace in-person clinical assessment." |
| **DeepSynaps Integration** | Extract stride length from video-based gait analysis using MediaPipe pose landmarks (ankle tracking). Correlate with H&Y stage. Display as trend metric in PD monitoring dashboard. |

**Evidence Details:**
- Korean PD cohort study (n=33): stride length AUC=0.73 for PD vs HC discrimination, specificity 100%, sensitivity 50% (PMC12599442, 2025)
- Stride length negatively correlated with MDS-UPDRS III (r=-0.696, p<0.001) (Frontiers Neurology, 2025)
- Levodopa-responsive: stride length increased from 0.87+/-0.28m (OFF) to 1.00m (ON) (p=0.011) (Frontiers Neurology, 2025)
- Digital gait biomarker framework identifies stride length as a core "pace" domain biomarker for monitoring disease progression (PMC11928532, 2025)
- Systematic review of AI video analysis: gait diagnostic AUC 0.91--0.99, accuracy 86--100% (MDPI Sensors, 2025)

---

### 3.2 Parkinson's Disease -- Cadence

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease |
| **Movement Feature** | Cadence (steps per minute) |
| **Evidence Strength** | **A** -- Consistently replicated across studies |
| **Clinical-Use Status** | Clinical-adjunct |
| **Research-Only Flag** | False (instrumented); True (video-based) |
| **Safe Clinical Wording** | "Studies show that cadence changes may accompany Parkinson's disease, with some patients demonstrating compensatory increases in step rate. This metric should be interpreted within the broader clinical context." |
| **DeepSynaps Integration** | Count steps from video using ankle landmark crossing detection. Calculate steps/min. Flag deviations from age-normative values. |

**Evidence Details:**
- PD patients show elevated cadence as compensatory response to reduced stride length (PMC12599442, 2025)
- Cadence increases in H&Y stages 1.0 and 1.5 but normalises at stage 2.0 as disease progresses
- AUC for cadence alone: 0.64 (specificity 80%, sensitivity 66.7%)
- Levodopa increases cadence from 50.9 to 53.7 steps/min (p=0.036)

---

### 3.3 Parkinson's Disease -- Gait Variability (Stride Time Variability)

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease, fall risk |
| **Movement Feature** | Stride time variability (CV%) |
| **Evidence Strength** | **A** -- Identified as prognostic/fall-risk biomarker in PD |
| **Clinical-Use Status** | Research-only (video-based) |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Increased variability in walking patterns has been associated with higher fall risk in some neurological conditions. This research marker requires further validation for individual risk prediction." |
| **DeepSynaps Integration** | Calculate coefficient of variation for step-to-step timing from video landmark tracking. Flag high-variability patterns. |

**Evidence Details:**
- Step time variability identified as key prognostic/fall-risk gait biomarker in PD (PMC11928532)
- Combined with velocity and cadence in fall-risk prediction models

---

### 3.4 Alzheimer's Disease / MCI -- Gait Speed (Dual-Task)

| Field | Detail |
|-------|--------|
| **Condition(s)** | Mild cognitive impairment (MCI), Alzheimer's disease, dementia |
| **Movement Feature** | Dual-task gait speed reduction (cognitive cost %) |
| **Evidence Strength** | **A** -- Meta-analytic support; AUC up to 0.926 for dementia classification |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Research suggests that walking speed while performing a secondary cognitive task may differ between individuals with and without cognitive concerns. This is a research measure and not a diagnostic tool." |
| **DeepSynaps Integration** | Implement dual-task protocol (walking + counting backwards). Measure gait speed reduction from baseline. Classify MCI risk (AUC 0.788 NC vs MCI; 0.897 NC vs Dementia). |

**Evidence Details:**
- Dual-task turn velocity: AUC 0.801 (NC vs MCI), 0.923 (NC vs Dementia) (Frontiers Aging Neuroscience, 2024)
- Each 1 cm/s increase in dual-task gait speed decreases dementia risk by 26.2% (OR logistic regression)
- Dual-task gait speed: NC 65.2+/-11.3 vs MCI 48.8+/-14.3 vs Dementia 42.6+/-14.4 cm/s (p<0.05)
- Dual-task stride length: NC 86.9+/-11.8 vs MCI 66.4+/-15.9 vs Dementia 58.5+/-16.7 cm (Frontiers Aging Neuroscience, 2024)
- Upper body sway (APS, MLS) during dual-task shows equivalent discriminative power to lower-limb gait measures (PMC12551351, 2025)
- Gait pace slower and variability greater in AD dementia vs cognitively unimpaired (Johns Hopkins, 2025)

---

### 3.5 Multiple Sclerosis -- Gait Variability & Symmetry

| Field | Detail |
|-------|--------|
| **Condition(s)** | Multiple sclerosis |
| **Movement Feature** | Gait variability (pace, rhythm, stability, symmetry domains) |
| **Evidence Strength** | **B** -- Framework established; smartphone sensor validation ongoing |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Gait pattern changes may be observed in multiple sclerosis. Digital gait measures are under investigation as potential supportive tools for monitoring mobility." |
| **DeepSynaps Integration** | Implement 8-domain gait framework (pace, rhythm, stability, symmetry, variability, smoothness, complexity, fatigability) using video pose estimation. Track over time. |

**Evidence Details:**
- Smartphone-based framework proposes 8 gait domains for PwMS with standardised digital measures (PMC12008473, 2024)
- Double support time and trunk sway are strongest predictors of 6-minute walk distance (R2=0.68, p<0.001) (MDPI Sensors, 2024)
- Gait variability increases early in MS and worsens with disability progression
- Body-worn sensors detect balance and gait deficits in PwMS with normal walking speed

---

### 3.6 Stroke -- Hemiparetic Gait Asymmetry

| Field | Detail |
|-------|--------|
| **Condition(s)** | Stroke (hemiparetic gait) |
| **Movement Feature** | Step length asymmetry, stance time asymmetry, swing time asymmetry |
| **Evidence Strength** | **A** -- Extensive literature; validated rehabilitation outcomes |
| **Clinical-Use Status** | Clinical-adjunct (instrumented walkways) |
| **Research-Only Flag** | True for video-based assessment |
| **Safe Clinical Wording** | "Gait asymmetry is common after stroke and may be quantified to support rehabilitation monitoring. These measures should be used alongside standard clinical assessments." |
| **DeepSynaps Integration** | Quantify affected vs unaffected limb step lengths, stance times, swing times from video. Calculate symmetry indices. Correlate with Fugl-Meyer and Berg Balance Scale. |

**Evidence Details:**
- Spatiotemporal gait asymmetry correlates with walking speed (r=-0.36 to -0.63 with BBS) (Nature Scientific Reports, 2024)
- Both paretic AND non-paretic limb kinematics differ by balance impairment level (BBS high vs low) (Nature Scientific Reports, 2024)
- Significant asymmetry in hip and knee joint angles throughout gait cycle (PMC12283793, 2025)
- Posterolateral putamen lesion associated with temporal gait asymmetry (Stroke, 2009)
- Split-belt treadmill training improves step length symmetry by 27.3% (Frontiers Physiology, 2024)

---

## 4. Tremor Biomarkers

### 4.1 Parkinson's vs Essential Tremor -- Frequency Discrimination

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease (rest tremor), Essential tremor (action/postural tremor) |
| **Movement Feature** | Tremor peak power frequency (Hz), tremor amplitude |
| **Evidence Strength** | **B** -- Video-based validation against IMU gold standard |
| **Clinical-Use Status** | FDA-cleared (wearable: Neu Health, 2025); research-only (video) |
| **Research-Only Flag** | True for video-based; False for wearable (FDA-cleared) |
| **Safe Clinical Wording** | "Tremor characteristics differ between Parkinson's disease and essential tremor. Video-based tremor analysis may provide supportive frequency and amplitude data but does not replace clinical diagnosis by a movement disorder specialist." |
| **DeepSynaps Integration** | Extract hand/head tremor frequency via spectral analysis of landmark trajectories. Display peak power frequency and amplitude. Flag frequencies in PD range (4--6 Hz) vs ET range (6--12 Hz). |

**Evidence Details:**
- Video-based tremor analysis (TremAn3): ICC 0.70--0.80 agreement with IMU sensors for tremor power (PMC12899472, 2026)
- Peak power frequency: moderate agreement for hands (ICC 0.60--0.67), poor for head (ICC 0.08)
- Video vs accelerometer: dominant frequency MAE 0.229+/-0.174 Hz, amplitude r=1.00 (MDPI Sensors systematic review, 2025)
- Medication effect detectable: frequency reduced from 2.01+/-1.39 to 1.53+/-1.01 Hz post-levodopa (MDPI Sensors, 2025)
- Neu Health smartphone tremor module: FDA 510(k) cleared 2025; Oxford PD Centre validated; EHR-integrated

---

### 4.2 General Tremor Quantification (Contactless)

| Field | Detail |
|-------|--------|
| **Condition(s)** | Essential tremor, dystonic tremor, Parkinson's tremor |
| **Movement Feature** | Tremor peak power, peak power frequency, centre-of-mass displacement |
| **Evidence Strength** | **C** -- Pilot validation (n=30) |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Contactless tremor measurement is a developing research tool that may offer a convenient alternative to wearable sensors for tremor monitoring in some settings." |
| **DeepSynaps Integration** | Implement centre-of-mass tracking algorithm on hand/head regions. Apply FFT for spectral analysis. Output tremor power and dominant frequency metrics. |

---

## 5. Bradykinesia Markers

### 5.1 Finger Tapping Speed & Amplitude Decay

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease |
| **Movement Feature** | Finger tapping frequency (taps/sec), amplitude decay over time, inter-tap variability |
| **Evidence Strength** | **A** -- Core MDS-UPDRS item; multiple digital validation studies |
| **Clinical-Use Status** | Clinical-adjunct (wearable: Kinesia); research-only (video) |
| **Research-Only Flag** | True for video-based |
| **Safe Clinical Wording** | "Finger tapping speed and regularity are standard clinical measures of bradykinesia. Video-based analysis may provide supplementary quantitative data to support clinical observation." |
| **DeepSynaps Integration** | Track fingertip landmarks during 10-second tapping task. Calculate tap frequency, amplitude envelope decay, and coefficient of variation. Map to MDS-UPDRS item 3.4 scoring. |

**Evidence Details:**
- Kinect-based system: combined motor tasks (finger tapping, hand movements, pronation-supination) achieved AUC 0.955 for PD diagnosis (PMC12960457, 2025)
- Monipar smartwatch: high correlation between digital measures and MDS-UPDRS bradykinesia items
- Roche-PD mobile app: all 3 bradykinesia tests (hand turning, draw shape, dexterity) correlated with MDS-UPDRS upper limb items
- Smartphone seconds-long finger tapping videos: ML classifiers for motor severity (PMC12960457)
- WATCH-PD: 12-month longitudinal decline in fine motor digital measures exceeded MDS-UPDRS item changes

---

### 5.2 Hand Pronation-Supination

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease |
| **Movement Feature** | Pronation-supination angular velocity, range of motion, movement decay |
| **Evidence Strength** | **B** -- Validated with wearable sensors and video |
| **Clinical-Use Status** | Clinical-adjunct |
| **Research-Only Flag** | True for video-based |
| **Safe Clinical Wording** | "Pronation-supination movement assessment is a standard component of bradykinesia evaluation. Digital tracking may enhance objectivity of this clinical observation." |
| **DeepSynaps Integration** | Track wrist rotation via forearm landmark angles. Calculate angular velocity, ROM, and fatigue decay curve. |

**Evidence Details:**
- Kinesia One sensor: detected improvement in all subcomponents of upper extremity bradykinesia with STN DBS (PMC12960457)
- Sigcha et al.: digital pronation-supination data showed high correlation with MDS-UPDRS

---

## 6. Postural Instability

### 6.1 Postural Sway (Video-Based Estimation)

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease, elderly fall risk, multiple sclerosis |
| **Movement Feature** | Postural sway area, RMS displacement, sway velocity, ellipse area |
| **Evidence Strength** | **B** -- Validated with force platform reference |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Postural sway measurements may provide information about balance control. Video-based sway estimation is under investigation and should not replace clinical balance assessment." |
| **DeepSynaps Integration** | Track head-torso-pelvis landmarks during quiet stance. Estimate centre-of-mass proxy. Calculate RMS, velocity, path length, and ellipse area in time and frequency domains. |

**Evidence Details:**
- CV-based balance assessment: stabilising camera and tracking head-torso-pelvis landmarks allows CoM proxy estimation (MDPI Sensors systematic review, 2025)
- Sotirakis et al.: random forest model detected significant motor symptom progression within 15 months from gait and postural sway features while MDS-UPDRS Part III did not capture change (PMC12960457)
- Trunk regularity/stability identified as key gait domain for disease progression monitoring (PMC11928532)

---

## 7. Dyskinesia Detection

### 7.1 Peak-Dose Dyskinesia (Wearable + Video)

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease (levodopa-induced dyskinesia) |
| **Movement Feature** | Dyskinesia presence/duration, choreiform movement intensity, body region affected |
| **Evidence Strength** | **C** -- Wearable pilot validated; video-based emerging |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Levodopa-induced movement fluctuations are common in Parkinson's disease. Objective monitoring may help characterise patterns of dyskinesia as an adjunct to clinical observation." |
| **DeepSynaps Integration** | Implement choreiform movement detection from whole-body landmark trajectories. Correlate with medication timing. Flag dyskinesia episodes for clinical review. |

**Evidence Details:**
- Wearable IMU: dyskinesia detection accuracy 96.3%, specificity 98.4%, sensitivity 56.9% (PMC12748983, 2025)
- Levodopa significantly increased sensor-detected dyskinesia (p=0.0169) while reducing tremor (p=0.0247)
- Video-based dyskinesia features show responsiveness to levodopa (Parkinsonism Related Disorders, 2018)
- PDMonitor body-worn sensors: reliable accuracy for dyskinesia and OFF period detection compared to MDS-UPDRS (PMC12960457)

---

## 8. ASD Behavioural Movement

### 8.1 Stereotypical Motor Movement (SMM) Detection

| Field | Detail |
|-------|--------|
| **Condition(s)** | Autism spectrum disorder (ASD) |
| **Movement Feature** | Stereotypical motor movements (hand flapping, body rocking, repetitive gestures) -- frequency, duration, type |
| **Evidence Strength** | **B** -- Large cohort (n=241), automated detection validated against manual annotation |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Repetitive movements are commonly observed in autism spectrum disorder. Automated video analysis may support objective quantification of these behaviours for research and clinical monitoring purposes. This tool does not diagnose ASD." |
| **DeepSynaps Integration** | Implement 3D-CNN SMM recognition on pose-estimation skeletal features. Detect and classify SMM episodes. Output count, duration, and type per session. Correlate with ADOS-2 scores. |

**Evidence Details:**
- 3D-CNN on 241 children: 92.53% recall (95% CI 81.09--95.10%), 66.82% precision (PMC11393723, 2024)
- Algorithm-detected SMM count and duration highly correlated with manual annotation (r=0.80 and r=0.88 respectively, p<0.001)
- 580 hours of video footage, 7,352 manually annotated SMM segments
- Heterogeneous SMM types automatically identified across different children

---

### 8.2 Atypical Gait in ASD

| Field | Detail |
|-------|--------|
| **Condition(s)** | Autism spectrum disorder |
| **Movement Feature** | Gait atypicalities (toe-walking, reduced arm swing, postural anomalies) |
| **Evidence Strength** | **C** -- Described in literature; limited video-based quantification |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Some individuals with autism spectrum disorder show differences in walking patterns. Video-based gait analysis may help characterise these patterns for research purposes." |
| **DeepSynaps Integration** | Extend standard gait analysis pipeline to flag atypical gait features (reduced arm swing, toe-walking patterns, asymmetric stride). |

---

## 9. ADHD Movement Patterns

### 9.1 Excess Motor Activity / Fidgeting

| Field | Detail |
|-------|--------|
| **Condition(s)** | Attention-deficit/hyperactivity disorder (ADHD) |
| **Movement Feature** | Global activity index (head, upper limb, lower limb displacement), regional movement counts |
| **Evidence Strength** | **B** -- Case-control study with ML classification (n=66) |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Increased motor activity during structured interactions has been observed in some children with ADHD. Video-based movement analysis may provide supplementary objective data alongside standard clinical assessment. It does not diagnose ADHD." |
| **DeepSynaps Integration** | Use MediaPipe Pose on POV or webcam video during 5-minute semi-structured interaction. Calculate pelvic-root-referenced displacement for all landmarks. Output global activity index and regional movement breakdown. |

**Evidence Details:**
- Global activity index significantly higher in ADHD vs controls (p=0.003) (PMC13035793, 2025)
- Significant group differences in shoulder, elbow, ankle, foot, and head movements
- Correlation between global activity index and parent-reported hyperactivity scores (r=0.28, p=0.025)
- AdaBoost classifier: accuracy 81.82%, F1=83.78%, ROC-AUC=0.85
- Right-sided body features contributed more strongly to classification (possible handedness effect)
- Prior studies: webcam-based video activity score correlates with independent movement ratings; chair sensor SVM achieved AUC 0.98; OpenPose-based analysis achieved accuracy 91%, AUC 0.94

---

### 9.2 Fidgeting and Cognitive Task Performance

| Field | Detail |
|-------|--------|
| **Condition(s)** | ADHD |
| **Movement Feature** | Intrinsic fidgeting (wrist and ankle actigraphy during cognitive tasks) |
| **Evidence Strength** | **B** -- Objective actigraphy correlation with performance |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Fidgeting behaviours during cognitive tasks have been studied in ADHD. Objective measurement may contribute to understanding the relationship between movement and attention." |
| **DeepSynaps Integration** | Track limb displacement during cognitive task performance. Correlate movement patterns with task accuracy and reaction time. |

**Evidence Details:**
- Fidgeting objectively measured via wrist and ankle actigraphy during Flanker task (Frontiers Psychiatry, 2024)
- Trial-by-trial analysis of movement-acceleration data synchronised with task events

---

## 10. Developmental Motor Delay

### 10.1 Milestone Assessment via Video

| Field | Detail |
|-------|--------|
| **Condition(s)** | Developmental motor delay, cerebral palsy risk |
| **Movement Feature** | Motor milestone achievement (head control, rolling, sitting, crawling, walking), primitive reflex persistence |
| **Evidence Strength** | **D** -- Limited 2024 video-based evidence; primarily questionnaire-based |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Video-based motor milestone assessment is an emerging research approach. Standardised clinical developmental screening remains essential. This tool should not replace paediatric evaluation." |
| **DeepSynaps Integration** | Implement General Movement Assessment (GMA) pipeline for infant video. Track limb movement quality (fidgety vs cramped-synchronised). Flag absent or atypical motor patterns for clinician review. |

**Evidence Context:**
- General Movement Assessment (GMA) is the gold standard for early neurological diagnosis but requires expert training
- Video-based approaches for infant movement analysis are in early development
- Integration with primitive reflex assessment (Moro, ATNR, STNR) via pose estimation is theoretically possible but unvalidated

---

## 11. Rehabilitation Progression

### 11.1 Upper Limb Recovery (Stroke)

| Field | Detail |
|-------|--------|
| **Condition(s)** | Stroke (upper extremity motor recovery) |
| **Movement Feature** | Reaching movement kinematics: mean palm speed, bivariate variable error (BVE), shoulder/trunk compensation patterns |
| **Evidence Strength** | **C** -- Proof-of-principle study (n=7) |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Tracking upper limb movement patterns during rehabilitation may provide additional information about recovery progress. These measures complement standard clinical assessments such as the Fugl-Meyer Assessment." |
| **DeepSynaps Integration** | Use MediaPipe Pose Landmarker on reaching task videos. Extract hand, shoulder, and trunk kinematics. Calculate mean speed and BVE. Track across sessions for recovery trends. |

**Evidence Details:**
- MediaPipe Pose Landmarker proof-of-principle: tracked reaching movements in post-stroke individuals (FMA-UE range 40--66) (Springer, 2025)
- Increased mean palm speed and reduced palm BVE across 5 sessions observed
- Shoulder and trunk movement patterns may contribute to hand outcome improvements
- Single-camera markerless motion capture suitable for complementing FMA

---

### 11.2 Gait Rehabilitation Progression

| Field | Detail |
|-------|--------|
| **Condition(s)** | Stroke, Parkinson's disease, MS |
| **Movement Feature** | Gait velocity, stride length, symmetry index, step time variability |
| **Evidence Strength** | **A** -- Well-established rehabilitation outcome measures |
| **Clinical-Use Status** | Clinical-adjunct (instrumented) |
| **Research-Only Flag** | True for video-based |
| **Safe Clinical Wording** | "Gait parameters are widely used to monitor recovery during neurological rehabilitation. Video-based gait analysis may offer a convenient method for tracking changes over time." |
| **DeepSynaps Integration** | Longitudinal gait parameter tracking with automated video analysis. Display trends for velocity, stride length, symmetry. Alert clinicians to significant improvements or deteriorations. |

---

## 12. Facial Affect Limitations

### 12.1 Hypomimia (Facial Masking) in Parkinson's Disease

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease |
| **Movement Feature** | Facial expression amplitude (smile, surprise, disgust), action unit activation, blink rate, facial movement velocity |
| **Evidence Strength** | **B** -- Multiple studies with AUC 0.71--0.99; validated against MDS-UPDRS |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Reduced facial expressivity (hypomimia) is a recognised feature of Parkinson's disease. Video-based facial analysis may provide supportive quantitative data but does not replace clinical neurological examination." |
| **DeepSynaps Integration** | Implement dense facial landmarking (468-point mesh). Extract action units, expression amplitude, blink dynamics. Map to MDS-UPDRS item 3.2. Detect on/off medication states. |

**Evidence Details:**
- SVM using facial expression amplitude: F1 score 99% for PD diagnosis (PMC12568243, 2025)
- CNN hypomimia detection: AUROC 0.71 (comparable to expert neurologist AUROC 0.75); classified on/off drug states 63% accuracy (PMC12568243)
- Alan Alda pre/post-diagnosis interviews: model perfectly distinguished pre- vs post-PD diagnosis
- XGBoost on facial action units: identifies facial regions contributing to hypomimia; correlates with clinical scores (PMC11928638)
- Dynamic facial expression analysis (CLIP+LSTM): accuracy 81.73--92.68% (arXiv, 2025)
- 20 facial landmark features from happiness expression: mouth (r=0.600), eyes (r=0.641) correlate with sialorrhea severity (Frontiers Neurology, 2025)
- Systematic review: facial expression diagnostic AUC 0.71 to F1 0.99; wider variability than gait (MDPI Sensors, 2025)

---

### 12.2 Blink Dynamics

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease |
| **Movement Feature** | Blink rate, inter-blink interval, blink duration, glabellar tap habituation |
| **Evidence Strength** | **C** -- Emerging evidence; high-frame-rate video required |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Changes in blink patterns have been described in Parkinson's disease. High-resolution video capture may enable quantitative blink analysis for research purposes." |
| **DeepSynaps Integration** | Extract eye landmark closure ratio. Calculate blink rate and duration. Test glabellar tap habituation response if protocol implemented. |

**Evidence Details:**
- PD patients: higher spontaneous blink frequency and longer duration; levodopa reduces frequency toward control levels (MDPI Sensors, 2025)
- PD did not habituate to glabellar tap; healthy controls habituated by approximately fourth tap

---

## 13. Balance/Fall Risk

### 13.1 Single-Leg Stance Duration

| Field | Detail |
|-------|--------|
| **Condition(s)** | Elderly fall risk, Parkinson's disease, stroke, multiple sclerosis |
| **Movement Feature** | Single-leg stance duration (seconds); centre of pressure (CoP) mediolateral amplitude |
| **Evidence Strength** | **A** -- Longitudinal fall prediction validated; systematic review support |
| **Clinical-Use Status** | Clinical-adjunct |
| **Research-Only Flag** | True for video-based CoP estimation |
| **Safe Clinical Wording** | "The ability to stand on one leg is associated with fall risk in older adults. Video-based balance assessment may support, but not replace, standardised clinical balance testing." |
| **DeepSynaps Integration** | Automatic single-leg stance timing from video. Track body sway (head/torso displacement) as CoP proxy. Predict 6-month fall risk. Flag <10 seconds as high risk. |

**Evidence Details:**
- Longitudinal study (n=153, 6-month follow-up): single-leg stance time predicted falls (p=0.001, Hedge's G=0.60) (PMC11566129, 2024)
- Each 1-second increase in single-leg stance decreases fall odds by 5% (OR=0.95)
- ML amplitude during single-leg stance: OR=1.51 per 1cm increase (p=0.003)
- Mayo Clinic (2024): standing on non-dominant leg shows highest rate of decline with age
- SLS <5 seconds predicts injurious falls (RR=2.13); SLS >=10 seconds associated with lower all-cause mortality
- Cannot maintain tandem stance >23 seconds may indicate early balance deficits (PMC11566129)

---

### 13.2 Timed Up-and-Go (TUG)

| Field | Detail |
|-------|--------|
| **Condition(s)** | Fall risk, Parkinson's disease, dementia, elderly |
| **Movement Feature** | Total TUG duration (seconds), sub-component timing (sit-to-stand, walk, turn, return) |
| **Evidence Strength** | **A** -- Extensively validated; widely used clinically |
| **Clinical-Use Status** | Clinical-adjunct |
| **Research-Only Flag** | True for video-based sub-component analysis |
| **Safe Clinical Wording** | "The Timed Up-and-Go test is a well-established measure of functional mobility. Video-based sub-component analysis may provide additional detail beyond total time." |
| **DeepSynaps Integration** | Automate TUG timing from video. Break down into sit-to-stand, walking, turning, and return phases. Calculate each sub-component duration. |

---

### 13.3 Berg Balance Scale (BBS) Correlation

| Field | Detail |
|-------|--------|
| **Condition(s)** | Stroke, Parkinson's disease, elderly fall risk |
| **Movement Feature** | BBS score (0--56) correlated with gait kinematic principal components |
| **Evidence Strength** | **A** -- Gold standard balance measure; extensive normative data |
| **Clinical-Use Status** | Clinical standard (BBS); research-only (video correlation) |
| **Research-Only Flag** | True for video-kinematic correlation |
| **Safe Clinical Wording** | "The Berg Balance Scale is a validated clinical tool for balance assessment. Video-derived movement features may correlate with BBS scores for research monitoring purposes." |
| **DeepSynaps Integration** | Extract movement features from video that correlate with BBS items (sitting-to-standing, standing unsupported, turning 360 degrees). Build BBS proxy score from video features. |

**Evidence Details:**
- BBS threshold: <45 indicates greater fall risk; <36 indicates near 100% fall risk; >=49 indicates ability to walk without aid (UBC PT, 2024)
- Stroke: both paretic AND non-paretic limb kinematics correlate with BBS score (Nature Scientific Reports, 2024)
- Higher spatiotemporal asymmetry associated with lower BBS (r=-0.36 to -0.63)
- Balance impairment exacerbates kinematic control differences in both limbs

---

## 14. Movement Asymmetry

### 14.1 Parkinson's Disease -- More/Less Affected Side

| Field | Detail |
|-------|--------|
| **Condition(s)** | Parkinson's disease (unilateral onset, asymmetric presentation) |
| **Movement Feature** | Interlimb coordination differences between more-affected (MA) and less-affected (LA) sides; dual-task cost asymmetry |
| **Evidence Strength** | **C** -- Inconclusive findings; complex relationship |
| **Clinical-Use Status** | Research-only |
| **Research-Only Flag** | True |
| **Safe Clinical Wording** | "Parkinson's disease often presents with asymmetric motor symptoms. Quantifying movement differences between sides is a research approach that may support disease characterisation." |
| **DeepSynaps Integration** | Compare left/right limb ROM, coordination, and dual-task performance. Calculate asymmetry indices for shoulder, hip, and ankle movements. |

**Evidence Details:**
- Interlimb coordination in PD is minimally affected by motor symptom asymmetry (Peer Community Journal, inconclusive null findings)
- Reduced arm swing during dual-tasking on LA side (consistent with Mirelman et al., 2016)
- Gait asymmetry: LA ROM more similar to healthy peers; MA side less similar (Roggendorf et al., 2012)
- Differential dual-task cost between MA and LA sides for hip ROM (significant) but not shoulder ROM

---

### 14.2 Stroke -- Paretic vs Non-Paretic Limb

| Field | Detail |
|-------|--------|
| **Condition(s)** | Stroke |
| **Movement Feature** | Step length symmetry index, stance time symmetry, swing time symmetry, joint angle asymmetry |
| **Evidence Strength** | **A** -- Extensively validated; rehabilitation outcome |
| **Clinical-Use Status** | Clinical-adjunct |
| **Research-Only Flag** | True for video-based |
| **Safe Clinical Wording** | "Gait asymmetry after stroke is an important rehabilitation target. Video-based symmetry quantification may support monitoring of recovery progress." |
| **DeepSynaps Integration** | Calculate step length, stance time, swing time symmetry indices from video gait analysis. Display affected vs unaffected limb kinematics. Track symmetry improvement over rehabilitation course. |

**Evidence Details:**
- Step length symmetry improvement of 27.3% after split-belt treadmill training (Frontiers Physiology, 2024)
- PCA reveals both paretic and non-paretic limb kinematics differ by balance level (BBS) (Nature Scientific Reports, 2024)
- Reduced paretic ankle dorsiflexion, knee flexion, and hip flexion in balance-impaired stroke patients
- Posterolateral putamen lesion associated with temporal gait asymmetry (Stroke, 2009)

---

## 15. Integration Recommendations for DeepSynaps

### 15.1 High-Priority Integrations (Strong Evidence + Clinical Need)

| Priority | Biomarker | Condition | Rationale |
|----------|-----------|-----------|-----------|
| **1** | Gait speed, stride length, cadence | Parkinson's disease | Strongest evidence (AUC 0.91-0.99); core clinical need; levodopa-responsive |
| **2** | Dual-task gait speed | MCI / Dementia | AUC up to 0.926; non-invasive screening potential; strong 2024 evidence |
| **3** | Hypomimia / facial expression | Parkinson's disease | AUC 0.71-0.99; early PD marker; natural fit for video platform |
| **4** | Tremor frequency & amplitude | Parkinson's, Essential tremor | FDA-cleared wearable exists; video validation strong (ICC 0.70-0.80) |
| **5** | Finger tapping / bradykinesia | Parkinson's disease | Core MDS-UPDRS item; AUC 0.955 with combined tasks |

### 15.2 Medium-Priority Integrations (Emerging Evidence)

| Priority | Biomarker | Condition | Rationale |
|----------|-----------|-----------|-----------|
| **6** | SMM detection | ASD | 92.5% recall; large unmet need for objective quantification |
| **7** | Motor activity index | ADHD | 81.8% accuracy; supports clinical observation |
| **8** | Single-leg stance / sway | Fall risk (elderly) | Longitudinal fall prediction validated; practical application |
| **9** | Gait asymmetry | Stroke | Rehabilitation monitoring; established clinical relevance |
| **10** | Dyskinesia detection | Parkinson's disease | Medication monitoring need; wearable validated |

### 15.3 Lower-Priority Integrations (Early Research)

| Priority | Biomarker | Condition | Rationale |
|----------|-----------|-----------|-----------|
| **11** | Postural sway (video-based) | PD, MS, elderly | CoP proxy from video; accuracy limitations |
| **12** | Developmental milestones | Infants / motor delay | GMA approach; limited validation data |
| **13** | Upper limb kinematics | Stroke recovery | Proof-of-principle only (n=7) |
| **14** | PD movement asymmetry | Parkinson's | Inconclusive evidence; complex interpretation |

---

## 16. Regulatory Landscape

### FDA-Cleared / Approved Movement Biomarker Devices

| Device | Company | Clearance | Year | Measures | Status |
|--------|---------|-----------|------|----------|--------|
| Neu Health tremor module | Neu Health (Oxford, UK) | 510(k) | 2025 | Tremor severity (smartphone-based) | FDA-cleared |
| Kinesia One / 360 | Great Lakes NeuroTechnologies | 510(k) | 2012+ | Tremor, bradykinesia, dyskinesia (wearable) | FDA-cleared |
| PKG Watch | Global Kinetics Corporation | 510(k) | 2014+ | Bradykinesia, dyskinesia, tremor (wrist-worn) | FDA-cleared |
| OPAL / APDM | APDM (Clario) | Research use | -- | Gait, balance, activity (wearable IMU) | Research/clinical |

### Regulatory Considerations for DeepSynaps

1. **Software as Medical Device (SaMD):** Video-based biomarker analysis may be classified as SaMD depending on intended use
2. **510(k) pathway:** Demonstration of substantial equivalence to existing cleared devices
3. **Clinical validation requirements:** Minimum AUC >0.80 recommended for diagnostic claims
4. **Labelling:** All outputs should include "for research use" or "adjunct to clinical assessment" until regulatory clearance obtained
5. **HIPAA / GDPR:** Video data requires robust privacy protection and consent frameworks

---

## 17. References

### Key Sources (2023--2026)

1. PMC12599442 (2025). Gait Patterns and Balance Impairment in Parkinson's Disease. *Journal of Movement Disorders*.
2. Frontiers in Neurology (2025). Quantitative analysis of gait parameters in Parkinson's disease. doi:10.3389/fneur.2025.1527020
3. MDPI Sensors (2025). AI Video Analysis in Parkinson's Disease: Systematic Review. doi:10.3390/s25206373
4. PMC11928532 (2025). Digital gait biomarkers in Parkinson's disease.
5. PMC12899472 (2026). A Vision-Based Algorithm for Assessing Head and Hand Tremor.
6. PMC11393723 (2024). Automated Analysis of Stereotypical Movements in Videos of Children With ASD. *JAMA Network Open*.
7. PMC13035793 (2025). ADHD assessment through POV glasses and machine learning.
8. Frontiers in Psychiatry (2024). Quantitative analysis of fidgeting in ADHD. doi:10.3389/fpsyt.2024.1394096
9. PMC12568243 (2025). AI Video Analysis in Parkinson's Disease -- PMC Systematic Review.
10. PMC11928638 (2025). Explaining facial action units' correlation with hypomimia in PD.
11. PMC12551351 (2025). Dual-task walking for early detection of Alzheimer's disease.
12. Frontiers in Aging Neuroscience (2024). Dual-task turn velocity -- digital biomarker for MCI/dementia. doi:10.3389/fnagi.2024.1304265
13. PMC11566129 (2024). Standing balance test for fall prediction in older adults. *BMC Geriatrics*.
14. Mayo Clinic (2024). What standing on one leg can tell you about aging. *PLOS ONE*.
15. PMC12748983 (2025). Wearable inertial device for monitoring Parkinson's disease symptoms.
16. PMC12960457 (2025). Digital Technologies for Symptom Monitoring in Parkinson Disease.
17. PMC12342252 (2025). Screening for Parkinson's disease using computer vision.
18. Nature Scientific Reports (2024). Stroke walking and balance characteristics via PCA. doi:10.1038/s41598-024-60943-5
19. PMC12283793 (2025). Hemiparetic gait patterns and walking function after stroke.
20. PMC11749066 (2025). Quantifying Gait Asymmetry in Stroke Patients.
21. Frontiers in Physiology (2024). Split-belt vs single-belt treadmill symmetry training post-stroke. doi:10.3389/fphys.2024.1409304
22. PMC12008473 (2024). Characterizing gait in MS using smartphone sensors.
23. Springer (2025). Using MediaPipe to track upper-limb reaching movements after stroke.
24. Practical Neurology (2025). Smartphone Tremor Monitoring -- FDA News.
25. arXiv (2025). Dynamic Facial Expressions Analysis Based Parkinson's Disease Auxiliary Diagnosis.
26. JMIR (2020/2026). Diagnosing Parkinson Disease Through Facial Expression Recognition. doi:10.2196/18697
27. Frontiers in Neurology (2025). Facial expression analysis: sialorrhea and hypomimia in PD. doi:10.3389/fneur.2025.1661043
28. MDPI Sensors (2024). Walk Longer! Gait aspects for walking endurance in MS. doi:10.3390/s24227284
29. PMC12113744 (2024). Functional Mobility Assessment in People with Multiple Sclerosis.
30. UBC PT (2024). Berg Balance Scale and Single Leg Stance Test reference materials.

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-06-26 | Clinical Movement Biomarker Research | Initial compilation from 2023--2026 literature |

---

*Disclaimer: This document is provided for decision-support research purposes only. It does not constitute clinical advice, diagnosis, or treatment recommendations. All biomarker measures described are intended to complement, not replace, standard clinical assessment by qualified healthcare professionals. Regulatory clearance may be required before clinical deployment of video-based biomarker analysis tools.*
