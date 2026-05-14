# DeepSynaps Video/Movement Analyzer: Explainability Requirements

## AI Transparency, Interpretability, and Clinical Communication Standards

---

**Document Version:** 1.0  
**Date:** 2025-08-28  
**Device Name:** DeepSynaps Video/Movement Analyzer  
**Regulatory Context:** FDA AI/ML SaMD Action Plan, EU AI Act (Article 13 -- Transparency), IMDRF SaMD N12 "Machine Learning-Enabled Medical Devices"  
**Aligned Standards:** ISO/IEC 23053:2022, ISO/IEC 25059 (SQuAIRE), NIST AI RMF 1.0  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Regulatory Context & Explainability Requirements](#2-regulatory-context--explainability-requirements)
3. [Explainability Architecture Overview](#3-explainability-architecture-overview)
4. [Feature Importance per Movement Biomarker](#4-feature-importance-per-movement-biomarker)
5. [Keypoint Confidence Visualization](#5-keypoint-confidence-visualization)
6. [Temporal Attention Maps](#6-temporal-attention-maps)
7. [Confidence Score Breakdown](#7-confidence-score-breakdown)
8. [Uncertainty Quantification Methods](#8-uncertainty-quantification-methods)
9. [Clinician-Facing Explanation Format](#9-clinician-facing-explanation-format)
10. [Patient-Facing Explanation Format](#10-patient-facing-explanation-format)
11. [Documentation Requirements for Regulatory Submission](#11-documentation-requirements-for-regulatory-submission)
12. [Explainability Evaluation & Validation](#12-explainability-evaluation--validation)
13. [Implementation Specifications](#13-implementation-specifications)
14. [References](#14-references)

---

## 1. Executive Summary

This document defines the comprehensive explainability and transparency requirements for the DeepSynaps Video/Movement Analyzer, a clinical decision-support system that uses deep learning-based computer vision to extract movement biomarkers from patient videos. The requirements address three stakeholder groups: clinicians (primary users who interpret system outputs), patients (who may view simplified explanations), and regulators (who review system documentation for approval).

**Explainability Principles:**

| Principle | Description | DeepSynaps Implementation |
|-----------|-------------|--------------------------|
| **Meaningful** | Explanations must be clinically relevant and actionable | Feature importance tied to clinically validated movement biomarkers |
| **Accessible** | Explanations must match the user's expertise level | Separate formats for clinicians and patients |
| **Accurate** | Explanations must faithfully represent model behavior | Model-agnostic and model-specific explanations validated against actual model internals |
| **Complete** | All outputs include appropriate uncertainty information | Per-keypoint, per-frame, and overall confidence scores |
| **Transparent** | System limitations and failure modes are disclosed | Explicit uncertainty visualization; degradation mode communication |

**Regulatory Drivers:**
- FDA "Good Machine Learning Practice" Principle 5: Focus on the performance of the Human-AI team
- FDA "Transparency" requirement: Users should understand how the device works and its limitations
- EU AI Act Article 13: AI systems must be designed and developed to ensure transparency
- IMDRF N12: SaMD using ML should include appropriate transparency and explainability measures

---

## 2. Regulatory Context & Explainability Requirements

### 2.1 FDA Explainability Requirements

| FDA Document | Explainability Requirement | DeepSynaps Implementation |
|--------------|---------------------------|--------------------------|
| Good ML Practice (Oct 2021) | "Focus on the performance of the Human-AI team" | Clinician-facing explanations designed for integration with clinical judgment |
| AI/ML SaMD Action Plan (Jan 2021) | "Transparency" as core principle | All outputs include uncertainty and explanation |
| CDS Guidance (Sep 2022) | Explainability supports intended use as decision-support | Explanations reinforce "not standalone diagnostic" framing |
| Predetermined Change Control Plan (Apr 2023) | Transparency for model modifications | Explainability metrics included in change assessment |

### 2.2 EU AI Act Requirements (Article 13)

| Requirement | Article | DeepSynaps Compliance |
|-------------|---------|----------------------|
| Transparency to users | Article 13(1) | Clinician-facing explanations with confidence scores |
| Instructions for use must include system capabilities and limitations | Article 13(3)(a) | Comprehensive system documentation; explicit limitation statements |
| Instructions must include conditions of use | Article 13(3)(b) | Camera, lighting, and environmental requirements in all outputs |
| Instructions must include performance information | Article 13(3)(c) | Per-biomarker accuracy metrics; subgroup performance data |
| Instructions must include known limitations | Article 13(3)(d) | Uncertainty quantification; failure mode descriptions |
| High-risk AI systems must enable interpretability | Article 13(3)(e) | Feature importance; attention maps; confidence breakdowns |

### 2.3 IMDRF SaMD N12 Requirements

| IMDRF Requirement | Implementation in DeepSynaps |
|-------------------|-------------------------------|
| "Understand why the SaMD made a particular recommendation or prediction" | SHAP-based feature importance for each biomarker output |
| "Understand how the SaMD reached a particular recommendation or prediction" | Temporal attention maps showing which video frames/regions influenced output |
| "Understand the level of confidence in the recommendation or prediction" | Multi-level confidence score (per-keypoint, per-frame, overall) |
| "Understand when the SaMD may not perform as expected" | Degradation mode with explicit quality warnings and failure mode descriptions |

---

## 3. Explainability Architecture Overview

### 3.1 System Architecture

The DeepSynaps Explainability Engine operates as a modular component integrated with all biomarker extraction pipelines:

```
Video Input
    |
    v
[Pose Estimation Module] --> Keypoint Coordinates + Confidence Scores
    |                                    |
    v                                    v
[Gait/Tremor/Posture/Facial Engine]  [Keypoint Confidence Visualizer]
    |                                    |
    v                                    v
[Biomarker Output] + [Uncertainty Quantifier] + [Attention Extractor]
    |                       |                       |
    +-----------------------+-----------------------+
                            |
                    [Explainability Aggregator]
                            |
              +-------------+-------------+
              |                           |
    [Clinician Dashboard]      [Patient Summary]
              |                           |
    [Feature Importance]       [Simplified Explanation]
    [Temporal Attention]       [Confidence Indicator]
    [Confidence Breakdown]     [What This Means]
    [Uncertainty Flags]        [Next Steps]
```

### 3.2 Explainability Methods by Component

| System Component | Primary Explainability Method | Output Format |
|-----------------|------------------------------|---------------|
| Pose Estimation | Keypoint confidence heatmap | Visual overlay on video frame |
| Gait Analysis | SHAP feature importance + Temporal attention | Bar chart + timeline visualization |
| Tremor Detection | Frequency-domain attribution + Wavelet attention | Spectrum plot + confidence bands |
| Postural Stability | Center-of-pressure trajectory + Confidence ellipse | Trajectory plot with uncertainty region |
| Facial Analysis | Landmark displacement heatmap + AU importance | Facial heatmap + text description |
| Movement Classification | Temporal class activation maps (CAM) | Video overlay with attention highlighting |
| Overall System | Ensemble disagreement + MC Dropout variance | Unified confidence dashboard |

### 3.3 Explainability Levels

| Level | Name | Description | Stakeholder |
|-------|------|-------------|-------------|
| 1 | **Raw Confidence** | Numerical confidence scores per output | System / Technical |
| 2 | **Technical Explanation** | Feature importance values, attention weights, SHAP values | Data Scientist / Validator |
| 3 | **Clinical Explanation** | Clinically meaningful explanation with uncertainty context | Clinician (Primary User) |
| 4 | **Patient Explanation** | Simplified, jargon-free explanation with actionable guidance | Patient / Caregiver |
| 5 | **Regulatory Explanation** | Formal documentation of model behavior and limitations | Regulator / Auditor |

---

## 4. Feature Importance per Movement Biomarker

### 4.1 Gait Analysis -- Feature Importance

The gait analysis engine computes stride length, cadence, velocity, stride time variability, and step length asymmetry from pose estimation keypoints. Feature importance is computed using SHAP (SHapley Additive exPlanations) to identify which keypoint trajectories and derived features contribute most to each gait parameter.

| Biomarker | Primary Features (SHAP Importance) | Secondary Features | Clinical Interpretation |
|-----------|-----------------------------------|-------------------|------------------------|
| **Stride Length** | Ankle landmark x-displacement (0.42); Hip-ankle Euclidean distance (0.28); Frame-to-frame ankle displacement (0.15) | Knee angle; Trunk angle; Step duration | "Stride length is primarily determined by ankle trajectory and hip-ankle spatial relationship" |
| **Cadence** | Ankle landmark zero-crossing rate (0.45); Step detection confidence (0.30); Temporal step interval (0.15) | Frame rate consistency; Detection threshold | "Cadence is calculated from the frequency of ankle landmark crossings at midline" |
| **Gait Velocity** | Stride length (0.50); Cadence (0.35); Stride time (0.10) | Anthropometric calibration; Floor reference | "Velocity is derived from stride length and cadence, which are computed from ankle and hip trajectories" |
| **Stride Time Variability** | Inter-stride interval SD (0.55); Step detection timing consistency (0.25); Frame timing stability (0.15) | Gait event detection confidence; Noise level | "Variability reflects the consistency of step timing across consecutive strides" |
| **Step Length Asymmetry** | Left vs. right ankle displacement difference (0.60); Single support time ratio (0.25); Hip symmetry (0.10) | Trunk sway; Knee angle symmetry | "Asymmetry is quantified by comparing left and right ankle trajectory distances" |

**SHAP Visualization Requirements:**
- Horizontal bar chart showing top 10 features ranked by absolute SHAP value
- Color coding by feature direction (red = increases value, blue = decreases value)
- Per-feature confidence interval based on ensemble variability
- Feature descriptions in clinical terminology (not technical feature names)
- Option to drill down into feature-level time series

### 4.2 Tremor Detection -- Feature Importance

| Biomarker | Primary Features (SHAP Importance) | Secondary Features | Clinical Interpretation |
|-----------|-----------------------------------|-------------------|------------------------|
| **Tremor Frequency** | Dominant FFT peak frequency (0.50); Spectral peak prominence (0.25); Wrist landmark oscillation frequency (0.15) | Noise floor level; Harmonic peaks; Frame rate | "Tremor frequency is identified as the dominant spectral peak in wrist landmark oscillation" |
| **Tremor Amplitude** | Wrist landmark displacement SD (0.45); Spectral power at dominant frequency (0.30); Peak-to-peak displacement (0.15) | Background noise level; Compensatory movement; Joint angle | "Amplitude is quantified from the standard deviation of wrist position oscillation" |
| **Tremor Distribution** | Affected body segments (0.40); Tremor presence confidence per segment (0.30); Bilateral symmetry index (0.20) | Rest vs. postural context; Activation pattern | "Distribution describes which body regions show tremor and the confidence of detection per region" |

### 4.3 Postural Stability -- Feature Importance

| Biomarker | Primary Features (SHAP Importance) | Secondary Features | Clinical Interpretation |
|-----------|-----------------------------------|-------------------|------------------------|
| **Sway Area** | Ankle landmark position variance (0.40); Hip center displacement area (0.35); Sway path length (0.15) | Romberg ratio; Eye closure effect; Base of support | "Sway area is computed from the two-dimensional variance of ankle and hip positions during quiet stance" |
| **Sway Velocity** | Frame-to-frame center-of-mass displacement (0.50); Mean sway path velocity (0.30); Medio-lateral sway (0.15) | Anterior-posterior sway ratio; Frequency spectrum | "Sway velocity measures the rate of body displacement during quiet standing" |
| **Balance Confidence** | Sway area (0.35); Sway velocity (0.30); Keypoint detection stability (0.25) | Number of detected keypoints; Confidence consistency | "Balance confidence combines measured sway with the reliability of pose detection" |

### 4.4 Facial Movement Analysis (Hypomimia) -- Feature Importance

| Biomarker | Primary Features (SHAP Importance) | Secondary Features | Clinical Interpretation |
|-----------|-----------------------------------|-------------------|------------------------|
| **Facial Movement Range** | Lip corner displacement during smile (0.35); Eyebrow vertical displacement (0.25); Eye aperture change (0.20) | Cheek raiser movement; Jaw movement symmetry; Nasolabial fold depth | "Movement range is quantified from displacement of facial landmarks during expression tasks" |
| **Expression Symmetry** | Left-right lip corner displacement ratio (0.45); Eye aperture symmetry (0.30); Brow raise symmetry (0.15) | Overall facial landmark symmetry score; Resting asymmetry | "Symmetry compares left and right facial movement during bilateral expression tasks" |
| **Hypomimia Score** | Composite movement range (0.40); Expression latency (0.25); Movement velocity (0.20); Symmetry (0.10) | Voluntary vs. spontaneous expression ratio; Eye blink rate | "Hypomimia score integrates movement range, speed, and symmetry into a composite facial bradykinesia metric" |

### 4.5 Feature Importance Display Requirements

**Clinician Dashboard:**
- Interactive SHAP force plot showing feature contributions to the specific output
- Feature values displayed in clinically meaningful units (cm, degrees, Hz, not normalized units)
- Reference ranges shown for each feature (population normative values)
- Feature reliability indicator (green/yellow/red based on detection confidence)
- Hover tooltips with clinical interpretation of each feature

**Patient Summary:**
- Top 3 features described in plain language (e.g., "Your ankle movement pattern," "Your walking speed")
- Visual icons representing each feature category
- No technical terms (no "SHAP," "SHAP value," "feature," "keypoint")

---

## 5. Keypoint Confidence Visualization

### 5.1 Keypoint Confidence Overview

The pose estimation module outputs 33 body keypoints and 468 facial landmarks, each with a confidence score. These confidence scores are critical for clinicians to assess the reliability of downstream biomarker calculations.

### 5.2 Keypoint Confidence Levels

| Confidence Score | Level | Color Code | Clinical Meaning |
|-----------------|-------|------------|-----------------|
| 0.95 - 1.00 | Excellent | Dark Green | Highly reliable detection; optimal conditions |
| 0.80 - 0.94 | Good | Light Green | Reliable detection; minor uncertainty |
| 0.60 - 0.79 | Moderate | Yellow | Usable with caution; may affect downstream accuracy |
| 0.40 - 0.59 | Poor | Orange | Significant uncertainty; results should be interpreted with care |
| < 0.40 | Unreliable | Red | Detection not reliable; biomarker may be invalid |
| Not Detected | Missing | Gray | Keypoint not detected; occlusion or out-of-frame |

### 5.3 Visualization Requirements

**Skeletal Overlay on Video Frame:**
- Each detected keypoint displayed as a colored circle (confidence-coded)
- Connecting lines (bones) colored by the minimum confidence of connected keypoints
- Semi-transparent fill for body segments with average confidence > 0.70
- Pulsing animation for keypoints with confidence < 0.60 (attention-grabbing)
- Ghosted outline for missing keypoints showing expected anatomical position

**Confidence Heatmap (Full Body):**
- Full-body heatmap showing confidence distribution across all keypoints
- Gradient from green (high) to red (low)
- Aggregated confidence score per body region (head, torso, left arm, right arm, left leg, right leg)
- Summary statistics: mean, min, max confidence; percentage of keypoints above 0.80

**Facial Landmark Confidence:**
- 468-point facial mesh colored by confidence
- Per-region aggregation: brows, eyes, nose, mouth, jaw, cheeks
- Special emphasis on lip corners and eye landmarks (critical for hypomimia)

### 5.4 Keypoint Confidence Impact on Biomarkers

| Biomarker | Critical Keypoints | If Critical Keypoint Confidence < 0.60 | Action |
|-----------|-------------------|----------------------------------------|--------|
| Stride Length | Left ankle, Right ankle, Left hip, Right hip | Flag stride length as "uncertain" | Show warning; suggest re-capture |
| Cadence | Left ankle, Right ankle | Flag cadence as "uncertain" | Show warning; suggest re-capture |
| Tremor Frequency | Dominant wrist, Elbow | Flag tremor as "uncertain" | Show warning; suggest longer capture |
| Sway Area | Left ankle, Right ankle, Nose/head | Flag sway as "uncertain" | Show warning; suggest longer quiet stance |
| Hypomimia Score | Lip corners, Eyebrow landmarks, Eye landmarks | Flag hypomimia as "uncertain" | Show warning; suggest face-front capture |

---

## 6. Temporal Attention Maps

### 6.1 Purpose

Temporal attention maps identify which video frames and time periods most influenced the biomarker calculation. This is critical for:
- Understanding when in the movement sequence the system made key observations
- Enabling clinicians to correlate system attention with their own clinical observations
- Detecting spurious correlations (e.g., the system attending to a background event rather than patient movement)
- Supporting clinical education and training

### 6.2 Temporal Attention by Biomarker Type

**Gait Analysis Temporal Attention:**
- Attention heatmap over the full video timeline
- Highlighted segments showing heel-strike and toe-off events
- Frame-level attention scores (0-1) showing which frames most influenced stride length/cadence
- Gait cycle segmentation with per-cycle confidence
- Attention overlay on video: brighter frames = higher attention

**Tremor Detection Temporal Attention:**
- Spectrogram-style attention map (frequency x time)
- Attention concentrated at the dominant tremor frequency band
- Temporal segments showing highest tremor confidence
- Distractor detection: attention on non-tremor frequencies flagged for review
- Segment-level confidence bands (colored background on timeline)

**Movement Classification Temporal Attention:**
- Class Activation Map (CAM) across video timeline
- Per-class attention: which time segments support each movement class
- Temporal convolution attention weights visualized
- Attention pooled over time to identify discriminative segments
- Attention coherence check: continuous attention to single movement vs. scattered attention (scattered = potential confusion)

### 6.3 Temporal Attention Visualization Requirements

**Clinician View:**
- Interactive timeline with attention intensity as background color
- Playable video with synchronized attention indicator (vertical line on timeline)
- Zoom and pan on timeline to examine specific segments
- Click on attention peak to jump to corresponding video frame
- Export attention map as image for documentation

**Patient View:**
- Simple timeline with highlighted "important moments"
- Text annotation: "System focused on your walking from 0:05 to 0:15"
- No technical attention scores or heatmaps

---

## 7. Confidence Score Breakdown

### 7.1 Hierarchical Confidence Structure

The DeepSynaps Video/Movement Analyzer implements a three-level confidence hierarchy:

```
Overall Biomarker Confidence (0-100%)
    |
    +-- Per-Frame Confidence (temporal average)
    |       |
    |       +-- Frame 1: Keypoint Confidence (spatial average)
    |       |       +-- Keypoint 1: Individual confidence
    |       |       +-- Keypoint 2: Individual confidence
    |       |       +-- ...
    |       |
    |       +-- Frame 2: Keypoint Confidence
    |       |       +-- Keypoint 1: Individual confidence
    |       |       +-- ...
    |       |
    |       +-- ...
    |
    +-- Model Confidence (ensemble agreement)
    |       |
    |       +-- Model 1 prediction: value + confidence
    |       +-- Model 2 prediction: value + confidence
    |       +-- Model 3 prediction: value + confidence
    |       +-- Ensemble agreement score
    |
    +-- Input Quality Confidence
            |
            +-- Video resolution adequacy
            +-- Frame rate adequacy
            +-- Lighting adequacy
            +-- Camera angle adequacy
            +-- Background complexity
```

### 7.2 Confidence Score Calculation

**Per-Keypoint Confidence:**
- Direct output from pose estimation model (MediaPipe / RTMPose)
- Range: 0.0 to 1.0
- Thresholds: > 0.80 (reliable), 0.60-0.80 (moderate), < 0.60 (poor)

**Per-Frame Confidence:**
```
Frame_Confidence = weighted_mean(Keypoint_Confidences) * Quality_Multiplier

Where:
- weighted_mean: mean of keypoint confidences weighted by importance for the specific biomarker
- Quality_Multiplier: [0.0-1.0] based on frame-specific quality (blur, exposure, compression artifacts)
```

**Overall Biomarker Confidence:**
```
Overall_Confidence = temporal_mean(Frame_Confidences) * Model_Agreement * Input_Quality_Factor

Where:
- temporal_mean: mean of per-frame confidences across all frames used for biomarker calculation
- Model_Agreement: [0.0-1.0] based on ensemble coefficient of variation (CV); CV < 5% -> 1.0, CV > 20% -> 0.0
- Input_Quality_Factor: [0.0-1.0] based on overall video quality assessment
```

### 7.3 Confidence Visualization Dashboard

**Confidence Meter:**
- Circular gauge showing overall confidence (0-100%)
- Color-coded: green (> 80%), yellow (60-80%), orange (40-60%), red (< 40%)
- Text label: "High Confidence," "Moderate Confidence," "Low Confidence," "Insufficient Confidence"

**Confidence Breakdown Panel:**
- Stacked bar showing contribution from: Keypoint Detection, Model Agreement, Input Quality
- Each component shown as percentage of total confidence
- Hover for detailed values and thresholds

**Temporal Confidence Plot:**
- Line graph showing per-frame confidence over time
- Shaded regions indicating confidence bands
- Threshold lines at 0.60 (warning) and 0.40 (critical)
- Annotation of confidence drops with potential causes

### 7.4 Confidence-Based Actions

| Overall Confidence | Display | Clinical Action | System Action |
|-------------------|---------|----------------|---------------|
| > 80% | Green "High Confidence" | Use as standard clinical adjunct | Normal processing; store result |
| 60-80% | Yellow "Moderate Confidence" | Use with additional clinical judgment | Flag for attention; add uncertainty note to report |
| 40-60% | Orange "Low Confidence" | Consider repeating video capture | Warning banner; suggest re-capture; still provide estimate |
| < 40% | Red "Insufficient Confidence" | Do not use for clinical decision; repeat capture | Critical warning; biomarker marked invalid; prevent report generation without override |

---

## 8. Uncertainty Quantification Methods

### 8.1 Uncertainty Taxonomy

The DeepSynaps Video/Movement Analyzer distinguishes between two types of uncertainty:

| Uncertainty Type | Description | Source | Quantification Method |
|-----------------|-------------|--------|----------------------|
| **Aleatoric (Data) Uncertainty** | Irreducible uncertainty from noisy or ambiguous data | Video noise, motion blur, occlusion, natural movement variability | Learned aleatoric uncertainty (log-likelihood loss); per-input noise estimation |
| **Epistemic (Model) Uncertainty** | Uncertainty due to limited model knowledge | Out-of-distribution inputs; underrepresented training data; model approximation | MC Dropout (50 forward passes); Deep Ensembles (5 models); evidential learning |

### 8.2 MC Dropout Implementation

Monte Carlo Dropout is applied to the temporal analysis and movement classification modules:

| Parameter | Setting |
|-----------|---------|
| Dropout rate | 0.2 (inference time) |
| Forward passes | 50 |
| Output statistics | Mean, Standard Deviation, 95% CI |
| Computational overhead | ~2.5x single inference |

**Interpretation:** The standard deviation across 50 dropout runs represents epistemic uncertainty. High SD indicates the model is uncertain about the prediction (potentially out-of-distribution input).

### 8.3 Deep Ensemble Implementation

Five independently trained models with different random initializations and data augmentation:

| Parameter | Setting |
|-----------|---------|
| Ensemble size | 5 models |
| Architecture | Identical (MotionBERT for temporal, Custom CNN for classification) |
| Training difference | Random seed, data augmentation order, dropout mask |
| Output statistics | Mean, SD, CV, 95% CI, individual model predictions |

**Interpretation:** High coefficient of variation (CV > 10%) across ensemble members indicates epistemic uncertainty.

### 8.4 Confidence Interval Display

| Presentation | Format | Example |
|-------------|--------|---------|
| Point estimate with CI | Value (95% CI: lower-upper) | "Stride length: 1.12 m (95% CI: 1.05-1.19 m)" |
| Relative uncertainty | Value +/- percentage | "Stride length: 1.12 m +/- 6.3%" |
| Qualitative bands | Category labels | "Moderate uncertainty -- interpret with caution" |
| Visual error bars | Error bars on trend charts | Vertical error bars showing 95% CI on longitudinal plots |

### 8.5 Uncertainty Calibration

The system undergoes regular calibration to ensure confidence scores match actual accuracy:

| Calibration Method | Application | Frequency |
|-------------------|-------------|-----------|
| Temperature Scaling | Global calibration of confidence scores | After each model update |
| Isotonic Regression | Per-biomarker calibration | Quarterly |
| Platt Scaling | Binary classification calibration (abnormal/normal flags) | After each model update |
| Reliability Diagrams | Visual calibration assessment | Monthly review |

**Target:** Expected Calibration Error (ECE) < 0.05 for all biomarkers.

---

## 9. Clinician-Facing Explanation Format

### 9.1 Explanation Dashboard Layout

The clinician-facing explanation interface is organized into four sections:

```
+--------------------------------------------------+
| SECTION 1: BIOMARKER OVERVIEW                     |
| - Biomarker value with confidence interval        |
| - Comparison to reference range (normative data)  |
| - Trend indicator (if longitudinal data)          |
| - Overall confidence score with color coding      |
+--------------------------------------------------+
| SECTION 2: WHAT INFLUENCED THIS RESULT            |
| - Top 5 features contributing to the output       |
| - SHAP bar chart with clinical descriptions       |
| - Keypoint confidence overlay (skeletal view)     |
| - Notable quality issues (if any)                 |
+--------------------------------------------------+
| SECTION 3: TEMPORAL ANALYSIS                      |
| - Video timeline with attention heatmap           |
| - Synchronized video playback with attention      |
| - Key movement segments highlighted               |
| - Frame-level confidence plot                     |
+--------------------------------------------------+
| SECTION 4: UNCERTAINTY & LIMITATIONS              |
| - Confidence breakdown (keypoints/model/input)    |
| - Known limitations for this specific case        |
| - Conditions that could affect accuracy           |
| - Suggestion for repeat capture if needed         |
+--------------------------------------------------+
```

### 9.2 Explanation Content Requirements

Every biomarker output must include the following explanation elements:

**1. Value Presentation:**
- Primary value with units (e.g., "Stride Length: 1.12 meters")
- 95% confidence interval (e.g., "95% CI: 1.05 - 1.19 m")
- Reference range with percentile (e.g., "25th percentile for age-matched controls")
- Direction from previous measurement if longitudinal (e.g., "Decreased 0.08 m from last visit")

**2. How This Was Measured:**
- 1-2 sentence description of the measurement method
- Reference to the specific video segment analyzed
- Key anatomical landmarks used
- Reference method for validation (e.g., "Compared to instrumented walkway gold standard")

**3. Confidence Assessment:**
- Overall confidence level (High/Moderate/Low/Insufficient)
- Specific factors affecting confidence (e.g., "Left ankle detection confidence was 0.72 (moderate)")
- Any quality warnings or flags
- Recommended actions based on confidence level

**4. System Limitations:**
- Standard limitation statement: "This is a decision-support tool. Results should be interpreted by a qualified clinician in the context of the full clinical picture."
- Biomarker-specific limitations (e.g., "Stride length estimation accuracy decreases with camera angles > 30 degrees from frontal")
- Population-specific caveats if applicable (e.g., "Normative data for this age group is based on n=150 individuals")

### 9.3 Explanation Language Standards

| Requirement | Standard |
|-------------|----------|
| Technical terms | Defined on first use; hover tooltips available |
| Uncertainty language | "Estimated," "Calculated," "Approximately" -- never "Is" or "Equals" |
| Confidence language | "High confidence," "Moderate uncertainty" -- never "Accurate" or "Precise" without qualification |
| Diagnostic framing | No diagnostic statements; only measurement descriptions |
| Comparative framing | "Compared to reference population" not "Abnormal" or "Normal" |
| Actionability | Suggestions phrased as considerations, not directives |

### 9.4 Example: Clinician Explanation for Gait Velocity

```
====================================================================
GAIT VELOCITY -- CLINICAL DECISION SUPPORT
====================================================================

VALUE: 0.89 m/s (95% CI: 0.82 - 0.96 m/s)
Reference: 25th percentile for age-matched controls (expected range: 0.90 - 1.40 m/s)
Previous: 1.02 m/s (Visit: 2025-06-15)

CONFIDENCE: MODERATE (72%)
- Keypoint detection: Good (84%)
- Model agreement: Good (88%)
- Input quality: Moderate (65%) -- lighting below optimal

HOW THIS WAS MEASURED:
Gait velocity was estimated from 4 complete gait cycles captured in
a 10-meter walk test video (frontal camera angle, 3.2m distance).
Ankle and hip landmarks were tracked across 180 frames; stride
length and cadence were combined to compute velocity. This method
has been validated against instrumented walkway with ICC = 0.91.

KEY FEATURES INFLUENCING THIS RESULT:
1. Ankle displacement pattern (primary contributor)
2. Step timing consistency (moderate contributor)
3. Hip-ankle spatial relationship (moderate contributor)
4. Video frame rate stability (minor contributor)

TEMPORAL ANALYSIS:
- Highest confidence: frames 45-120 (steady walking)
- Lower confidence: frames 1-30 (acceleration phase)
- Recommended: Focus on middle segment for most reliable estimate

UNCERTAINTY & LIMITATIONS:
- Lighting was 150 lux (below optimal 300 lux); this may increase
  estimation variance by approximately 5-8%
- Camera angle was 8 degrees from frontal (optimal)
- This is a single measurement; clinical interpretation should
  consider multiple assessments over time
- Results should be interpreted alongside clinical examination
  and other functional assessments

RECOMMENDATION:
Consider repeat capture with improved lighting for higher
confidence estimate if this value will inform a clinical decision.
====================================================================
```

---

## 10. Patient-Facing Explanation Format

### 10.1 Design Principles

| Principle | Implementation |
|-----------|---------------|
| **No medical jargon** | All terms defined in plain language; glossary available |
| **Visual-first** | Icons, colors, and graphics primary; text secondary |
| **Reassuring tone** | Neutral, non-alarmist language; focus on information not anxiety |
| **Actionable** | Clear next steps; what to discuss with clinician |
| **Empowering** | Information supports patient-clinician conversation |
| **No self-diagnosis** | Explicit statement that clinician interpretation is required |

### 10.2 Patient Explanation Structure

```
+--------------------------------------------------+
| YOUR MOVEMENT ANALYSIS SUMMARY                    |
| (Prepared for discussion with your clinician)     |
+--------------------------------------------------+
|                                                   |
| [Icon] Walking Speed                               |
| Your estimated walking speed: 0.89 m/s            |
| [Visual scale showing position relative to range] |
|                                                   |
| [Icon] Walking Pattern                             |
| Your step pattern was analyzed from the video.    |
| The system tracked your ankle and hip movements   |
| to estimate how you walk.                         |
|                                                   |
| [Icon] Confidence Level                            |
| Moderate confidence                               |
| The lighting in the video could have been         |
| brighter for the most accurate measurement.       |
|                                                   |
| [Icon] What This Means                            |
| This information is for discussion with your      |
| clinician. They will interpret these results      |
| along with your overall health picture.           |
|                                                   |
| NEXT STEPS:                                       |
| - Discuss these results with your clinician       |
| - Your clinician may recommend repeating the      |
|   video with better lighting                      |
| - These results are one piece of your overall     |
|   clinical assessment                             |
|                                                   |
| [Button: Learn More About This Analysis]          |
| [Button: Questions to Ask Your Clinician]         |
+--------------------------------------------------+
```

### 10.3 Patient Explanation Content Rules

| Rule | Example |
|------|---------|
| Use "estimated" not "measured" | "Your estimated walking speed" not "Your walking speed" |
| Use "the system analyzed" not "the AI detected" | "The system tracked your ankle movements" not "The AI detected your gait pattern" |
| Reference the clinician | "Your clinician will interpret these results" |
| Include confidence simply | "Moderate confidence" with visual indicator |
| Never include raw confidence numbers | No "72% confidence" or "p-value" |
| Never compare to disease labels | No "This suggests Parkinson's disease" |
| Always include "discuss with your clinician" | Every patient-facing output |

### 10.4 Example: Patient Explanation for Tremor Assessment

```
====================================================================
YOUR MOVEMENT ANALYSIS -- TREMOR ASSESSMENT
====================================================================

WHAT WAS ANALYZED:
The video of your hands at rest was analyzed to look for any
shaking or trembling movements.

WHAT THE SYSTEM FOUND:
The system detected a slight rhythmic movement in your right hand.
The estimated rate was 5 cycles per second.

[Visual: Small animated hand icon with gentle movement]

CONFIDENCE: HIGH
The video quality was good, so this estimate is reliable.

IMPORTANT NOTES:
- This analysis is for discussion with your clinician only
- Your clinician will consider this along with their own
  examination and your medical history
- Many factors can cause hand movements; this analysis
  identifies movement patterns but does not explain their cause
- A single video analysis is one piece of information;
  your clinician may want to observe over time

QUESTIONS TO ASK YOUR CLINICIAN:
- What does this movement pattern mean for my situation?
- Should we repeat this assessment?
- Are there other tests that would be helpful?
- How does this fit with my other symptoms and assessments?

This report was generated by the DeepSynaps Movement Analysis
System on [DATE] and reviewed by your care team.
====================================================================
```

### 10.5 Pediatric Patient / Guardian Explanations

For pediatric patients, explanations are directed at the parent/guardian:

- Age-appropriate language for the child if present
- Detailed explanation for the guardian
- Emphasis on the non-diagnostic nature of the assessment
- Clear statement that this supports, not replaces, clinical evaluation
- Guardian consent acknowledgment included

---

## 11. Documentation Requirements for Regulatory Submission

### 11.1 FDA 510(k) Explainability Documentation

| Document | Section | Content |
|----------|---------|---------|
| Algorithm Description | Section 12 | Architecture diagram; model selection rationale; feature extraction pipeline |
| Model Performance Report | Section 12 | Per-biomarker accuracy; subgroup performance; confidence calibration |
| Explainability White Paper | Section 19 | Detailed explanation of all explainability methods; validation results |
| Labeling | Section 17 | User-facing explanation examples; limitation statements; uncertainty labels |
| Risk Management | ISO 14971 | Explainability-related risk analysis; mitigation strategies |

### 11.2 Algorithm Description Document

Per FDA "Good Machine Learning Practice," the algorithm description must include:

1. **Model Architecture:**
   - Full network architecture diagram (MediaPipe BlazePose, RTMPose, MotionBERT)
   - Layer descriptions and dimensions
   - Activation functions and normalization
   - Pre-trained weights source and fine-tuning approach

2. **Feature Extraction:**
   - List of all input features (keypoint coordinates, velocities, angles)
   - Feature engineering pipeline
   - Feature normalization/standardization approach
   - Feature importance ranking (global)

3. **Training Process:**
   - Dataset description (size, source, annotation method)
   - Training/validation/test split methodology
   - Hyperparameter selection approach
   - Optimization algorithm and learning rate schedule
   - Regularization techniques
   - Convergence criteria

4. **Inference Process:**
   - Input preprocessing pipeline
   - Forward pass description
   - Output post-processing (e.g., temporal smoothing)
   - Confidence score calculation
   - Uncertainty quantification method

5. **Explainability Implementation:**
   - SHAP kernel and parameters
   - Attention extraction method
   - Confidence aggregation formula
   - Calibration methodology

### 11.3 Explainability Validation Documentation

| Validation Activity | Method | Pass Criteria | Evidence |
|--------------------|--------|--------------|----------|
| Explanation accuracy | Compare SHAP rankings with actual parameter sensitivity | Rank correlation > 0.80 | Validation report |
| Attention alignment | Compare temporal attention with clinical expert annotation | Overlap > 70% | Expert annotation study |
| Confidence calibration | Reliability diagrams; ECE calculation | ECE < 0.05 | Calibration report |
| Clinician comprehension | Survey of clinicians using explanation interface | > 80% correct interpretation | Usability study |
| Patient comprehension | Survey of patients viewing simplified explanations | > 80% correct understanding | Patient feedback study |

### 11.4 EU AI Act Technical Documentation

For EU MDR/AI Act compliance, additional documentation required:

| Document | AI Act Article | Content |
|----------|---------------|---------|
| Technical Documentation | Article 11(1) | Full system description including explainability methods |
| Instructions for Use | Article 13(3) | How to interpret explanations and confidence scores |
| Conformity Assessment | Article 43 | Explainability validation as part of notified body review |
| Post-Market Monitoring | Article 61 | Real-world explainability performance tracking |

---

## 12. Explainability Evaluation & Validation

### 12.1 Explanation Fidelity

Explanation fidelity measures whether the explanation accurately reflects the model's actual decision process.

| Metric | Method | Target |
|--------|--------|--------|
| **Deletion/Insertion** | Remove/insert most important features per explanation; measure prediction change | AUC > 0.70 for deletion curve |
| **Faithfulness Correlation** | Correlation between explanation feature importance and actual gradient-based importance | Pearson r > 0.80 |
| **Sufficiency** | Is the explanation sufficient to reconstruct the prediction? | Prediction reconstruction error < 10% |

### 12.2 Explanation Comprehensibility

| Stakeholder | Evaluation Method | Target |
|-------------|------------------|--------|
| **Clinicians** | Structured survey after using explanation interface; clinical case interpretation accuracy | > 85% correct interpretation of explanation |
| **Patients** | Simplified comprehension questionnaire; Teach-back method | > 80% correct understanding of key points |
| **Regulators** | Documentation completeness review against FDA guidance | All required elements present |

### 12.3 Explanation Utility

| Metric | Method | Target |
|--------|--------|--------|
| Decision time | Time for clinician to reach clinical decision with vs. without explanation | No significant increase; potential decrease |
| Decision confidence | Self-reported confidence in clinical decision | Increase with explanation |
| Appropriate trust | Calibration between system confidence and clinical reliance | Clinicians appropriately weight low-confidence outputs |
| Error detection | Clinician ability to identify incorrect system outputs | Higher detection rate with explanations |

---

## 13. Implementation Specifications

### 13.1 API Response Format

The explainability data is included in all API responses for biomarker endpoints:

```json
{
  "biomarker": "gait_velocity",
  "value": 0.89,
  "unit": "m/s",
  "confidence": {
    "overall": 0.72,
    "level": "moderate",
    "ci_95": [0.82, 0.96],
    "breakdown": {
      "keypoint_confidence": 0.84,
      "model_agreement": 0.88,
      "input_quality": 0.65
    }
  },
  "explanation": {
    "feature_importance": [
      {"feature": "ankle_displacement_pattern", "shap_value": 0.42, "description": "Ankle movement pattern"},
      {"feature": "step_timing_consistency", "shap_value": 0.25, "description": "Step timing consistency"},
      {"feature": "hip_ankle_spatial_rel", "shap_value": 0.18, "description": "Hip-ankle spatial relationship"},
      {"feature": "frame_rate_stability", "shap_value": 0.08, "description": "Video frame rate stability"},
      {"feature": "background_complexity", "shap_value": 0.05, "description": "Background complexity"}
    ],
    "temporal_attention": {
      "peak_frames": [45, 67, 89, 112],
      "peak_confidence": [0.92, 0.95, 0.91, 0.88],
      "attention_heatmap_url": "/api/v1/attention/12345/gait_velocity"
    },
    "keypoint_confidence_map": {
      "left_ankle": 0.91,
      "right_ankle": 0.89,
      "left_hip": 0.94,
      "right_hip": 0.93,
      "nose": 0.97
    }
  },
  "uncertainty": {
    "epistemic_sd": 0.035,
    "aleatoric_sd": 0.042,
    "total_uncertainty": 0.055
  },
  "quality_flags": [
    {
      "type": "lighting_below_optimal",
      "severity": "moderate",
      "message": "Lighting was 150 lux (optimal: 300+ lux). This may increase estimation variance by 5-8%.",
      "recommendation": "Consider repeat capture with improved lighting."
    }
  ],
  "limitations": [
    "This is a decision-support tool. Results should be interpreted by a qualified clinician.",
    "Single measurement; clinical interpretation should consider multiple assessments over time.",
    "Accuracy decreases with non-frontal camera angles (>30 degrees)."
  ]
}
```

### 13.2 Frontend Implementation

The explanation interface is implemented in the DeepSynaps React frontend:

| Component | Library | Description |
|-----------|---------|-------------|
| SHAP Bar Chart | D3.js + Custom | Horizontal bar chart with clinical feature names |
| Confidence Gauge | Custom SVG | Circular confidence meter with color coding |
| Temporal Timeline | Custom Canvas | Interactive video timeline with attention heatmap |
| Keypoint Overlay | Custom Canvas | Skeletal overlay on video with confidence colors |
| Uncertainty Plot | Recharts | Line chart with confidence bands |
| Patient Summary | Custom React | Simplified explanation with icons and plain language |

### 13.3 Performance Requirements

| Metric | Requirement |
|--------|-------------|
| Explanation generation time | < 500ms (synchronous with biomarker calculation) |
| Frontend rendering time | < 200ms for full explanation dashboard |
| Memory overhead | < 50MB additional per video for explanation data |
| Storage overhead | < 10MB per video for explanation artifacts |
| API payload size | < 100KB per biomarker for explanation JSON |

---

## 14. References

### Regulatory References
1. FDA. (2021). "Good Machine Learning Practice for Medical Device Development: Guiding Principles." October 2021.
2. FDA. (2021). "Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device (SaMD) Action Plan." January 2021.
3. FDA. (2023). "Marketing Submission Recommendations for a Predetermined Change Control Plan." April 2023.
4. European Union. (2024). "Artificial Intelligence Act (EU AI Act)." Regulation (EU) 2024/1689.
5. IMDRF. (2021). "Machine Learning-Enabled Medical Devices: Key Terms and Definitions." N12.
6. IMDRF. (2021). "Machine Learning-Enabled Medical Devices: Transparency and Explainability." N13.

### Standards References
7. ISO/IEC 23053:2022. "Framework for Artificial Intelligence (AI) Systems Using Machine Learning (ML)."
8. ISO/IEC 25059. "Systems and software engineering -- System and software Quality Requirements and Evaluation (SQuAIRE) -- Quality model for AI systems."
9. ISO/IEC 23894:2023. "Artificial intelligence -- Risk management."
10. NIST. (2023). "Artificial Intelligence Risk Management Framework (AI RMF 1.0)."

### Technical References
11. Lundberg, S.M. & Lee, S.I. (2017). "A Unified Approach to Interpreting Model Predictions." NeurIPS 2017.
12. Gal, Y. & Ghahramani, Z. (2016). "Dropout as a Bayesian Approximation: Representing Model Uncertainty in Deep Learning." ICML 2016.
13. Lakshminarayanan, B. et al. (2017). "Simple and Scalable Predictive Uncertainty Estimation using Deep Ensembles." NeurIPS 2017.
14. Sensoy, M. et al. (2018). "Evidential Deep Learning to Quantify Classification Uncertainty." NeurIPS 2018.
15. Samek, W. et al. (2019). "Explaining Deep Neural Networks and Beyond: A Review of Methods and Applications." Proceedings of the IEEE, 109(3):247-278.
16. Tonekaboni, S. et al. (2019). "What Clinicians Want: Contextualizing Explainable Machine Learning for Clinical End Use." MLHC 2019.
17. DeepSynaps Protocol Studio. "VIDEO_ANALYZER_COMPUTER_VISION_STACK.md." Technical Report, 2025.
18. DeepSynaps Protocol Studio. "MULTIMODAL_VIDEO_FUSION_DESIGN.md." Architecture Document, 2025.

---

*Document Control: This document is controlled under the DeepSynaps Quality Management System. Explainability requirements are mandatory for all biomarker outputs.*

*Next Review Date: 2026-02-28*
*Document Version History: 1.0 (Initial release)*
