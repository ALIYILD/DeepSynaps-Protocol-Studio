# AI Safety & Ethics for Clinical Video Analysis: A Comprehensive Framework
## Movement Analysis and Pose Estimation in Healthcare Environments

---

> **Report Classification:** Safety & Ethics Reference Document
> **Version:** 1.0
> **Scope:** Bias analysis, false positive risk, explainability, pediatric privacy,
> consent frameworks, safe clinician communication, and regulatory compliance for
> AI-assisted clinical video analysis systems.
>
> **Intended Audience:** Clinical researchers, healthcare AI developers,
> regulatory affairs specialists, ethics review boards, and clinical deployment teams.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Bias in Computer Vision for Clinical Applications](#2-bias-in-computer-vision-for-clinical-applications)
3. [False Positive Risks in Clinical Video Analysis](#3-false-positive-risks-in-clinical-video-analysis)
4. [Explainability and Uncertainty Quantification](#4-explainability-and-uncertainty-quantification)
5. [Pediatric Privacy and Consent](#5-pediatric-privacy-and-consent)
6. [Consent Frameworks for Video-Based AI Analysis](#6-consent-frameworks-for-video-based-ai-analysis)
7. [Safe Clinician Wording and Communication Standards](#7-safe-clinician-wording-and-communication-standards)
8. [Regulatory Landscape and Compliance Requirements](#8-regulatory-landscape-and-compliance-requirements)
9. [Integrated Safety Recommendations](#9-integrated-safety-recommendations)
10. [References and Sources](#10-references-and-sources)

---

## 1. Executive Summary

The deployment of AI-assisted video analysis for clinical movement assessment represents a
promising frontier in healthcare technology. Systems using human pose estimation, action
recognition, and movement classification have demonstrated potential for detecting
Parkinsonian tremor, analyzing gait in neurological conditions, monitoring rehabilitation
exercises, and quantifying stereotypical motor movements in autism spectrum disorder.
However, the translation of these technologies from research environments to clinical
practice introduces significant safety, ethical, and regulatory challenges that must be
addressed systematically.

This report provides a comprehensive analysis of seven critical domains of concern:

- **Bias in pose estimation** across skin tone, age, body type, camera angle, and lighting
- **False positive risks** from camera artifacts, clothing, and environmental confusion
- **Explainability requirements** for clinical decision support
- **Pediatric privacy protections** including COPPA considerations and consent requirements
- **Consent frameworks** for recording, AI analysis, research use, and withdrawal
- **Safe clinician wording** to prevent over-reliance and miscommunication
- **Regulatory compliance** including FDA guidance, CE marking, and clinical validation

**Key Finding:** Current pose estimation models, including widely-used systems like
OpenPose, MoveNet, and MediaPipe, exhibit measurable performance disparities across
demographic groups. Studies document accuracy degradation in darker skin tones, reduced
precision for very young children and elderly individuals, body-type bias toward mean
shapes, and significant sensitivity to camera positioning and lighting conditions.
These biases are not merely academic concerns -- they directly impact the clinical
validity of automated movement assessments and can exacerbate existing health disparities.

---

## 2. Bias in Computer Vision for Clinical Applications

### 2.1 Skin Tone Bias in Pose Estimation

**Evidence Base:**

Research consistently demonstrates that computer vision models exhibit systematic bias
in skin tone recognition and pose estimation. The FAIR benchmark evaluation shows that
most multimodal models achieve accuracy between only 40-50% in skin tone recognition,
with a consistent bias toward lighter skin tones. Recent work (HUST, ICCV 2025) achieves
the lowest average ITA error (11.20) and bias score (1.58) on the FAIR benchmark, but
even state-of-the-art methods show per-type ITA errors that vary across all six
Fitzpatrick skin type categories.

In action recognition models, divergence rate analysis reveals that the same motion
performed by actors of different skin colors produces different predictions from the same
model. TC-CLIP, despite achieving the highest overall accuracy on synthetic datasets,
consistently demonstrates the highest divergence rates across all skin tone pairs,
suggesting that accuracy may come at the cost of fairness. Models may partially rely on
appearance-based cues rather than motion cues for classification, which is deeply
problematic for clinical applications where movement -- not appearance -- should drive
all diagnostic inference.

**Actionable Safety Recommendations:**

- **REC-BIAS-001:** Before clinical deployment, evaluate all pose estimation models on
the FAIR benchmark or equivalent skin-tone evaluation datasets. Document per-skin-type
accuracy metrics separately.

- **REC-BIAS-002:** Establish a minimum acceptable per-skin-type mean average precision
(mAP) threshold that does not deviate more than 5 percentage points from the mean
performance across all Fitzpatrick types.

- **REC-BIAS-003:** For clinical systems, collect calibration data across the full
Fitzpatrick skin type spectrum (I through VI) within the target deployment population.
Underrepresented skin types must trigger targeted data collection before deployment.

- **REC-BIAS-004:** Implement runtime skin-tone-aware confidence thresholds that adjust
per-keypoint confidence requirements based on empirical performance stratification data.
Lower-confidence detections on historically underperforming skin types must not be
suppressed; instead, systems should report lower confidence and request human review.

- **REC-BIAS-005:** Publish skin-tone-stratified performance metrics in system
documentation and informed consent materials. Patients have the right to know if
system accuracy varies by skin tone.

### 2.2 Age-Related Pose Estimation Accuracy

**Evidence Base:**

Age estimation and gender classification models show significant performance degradation
at distribution tails. Accuracy for the 1-4 year age group drops to 72.2% (compared to
>95% for ages 20-69), and 5-9 year accuracy reaches only 86.9%. Performance also
degrades for individuals 70+, where increased variability in physical appearance and
data scarcity combine to reduce model accuracy.

For pose estimation specifically, the simplified skeletal models used by clinical systems
(e.g., MediaPipe's 33 keypoints) do not capture the full complexity of spinal articulation
or true anatomical joint centers. This abstraction introduces clinically meaningful
discrepancies, particularly in pediatric populations where body proportions differ
significantly from the adult distributions that dominate training data.

Studies of fall detection in older adults (aged 64+ years) using OpenPose found good
accuracy for hip impact velocity estimation (MAPE 7.28%) but poor accuracy for hip
impact acceleration (MAPE 26.3%), with substantial underestimation of high-acceleration
events. This demonstrates that pose estimation algorithms struggle with rapid, complex
movements characteristic of certain age groups.

**Actionable Safety Recommendations:**

- **REC-BIAS-006:** Implement age-stratified performance validation for all pose
estimation models. Minimum validation cohorts should include: toddlers (1-3 years),
preschool (4-5 years), school-age (6-12 years), adolescents (13-17 years), adults
(18-64 years), older adults (65-79 years), and elderly (80+ years).

- **REC-BIAS-007:** Pediatric-specific models should be fine-tuned on pediatric-specific
training data. Off-the-shelf models trained primarily on adult datasets must not be used
for clinical pediatric movement analysis without additional validation.

- **REC-BIAS-008:** For elderly patients, implement movement-speed-aware processing
pipelines. Rapid movements (such as fall events) require specialized temporal filtering
to prevent keypoint dropout.

- **REC-BIAS-009:** Include body-proportion calibration steps for pediatric systems.
Since standard pose estimators do not capture differences in limb length ratios between
children and adults, add anthropometric calibration or use pediatric-specific body models.

- **REC-BIAS-010:** Document age-specific accuracy metrics in clinical validation
reports. Systems deployed across age groups must provide age-stratified sensitivity and
specificity data.

### 2.3 Body Type Bias in Movement Detection

**Evidence Base:**

Parametric pose estimation methods using statistical body models (e.g., SMPL, MANO)
are documented to "struggle in capturing detailed body shape and are biased towards
the mean shape." Non-parametric methods that directly predict 3D vertex coordinates
produce non-smooth results when trained on limited data, producing anatomically implausible
predictions for individuals with body shapes that deviate from training data distributions.

The COCO keypoint detection benchmark, which underpins most modern pose estimators, is
known to underrepresent certain body types, and the standard evaluation metric (OKS --
Object Keypoint Similarity) can introduce systematic bias. PCK (Percentage of Correct
Keypoints) metrics depend on reference length, which can be artificially inflated for
individuals with larger body frames or raised arms, making evaluation less strict and
potentially masking accuracy problems.

**Actionable Safety Recommendations:**

- **REC-BIAS-011:** Validate pose estimation models across BMI categories
(underweight <18.5, normal 18.5-24.9, overweight 25-29.9, obese 30-39.9, severely
obese >40) and document per-category performance metrics.

- **REC-BIAS-012:** Test model performance on individuals with assistive devices
(wheelchairs, walkers, canes, prosthetics) that may cause occlusion or alter expected
body proportions. These cases must not be silently dropped from validation.

- **REC-BIAS-013:** Implement body-shape-aware quality control that flags when
predicted body proportions deviate significantly from anatomically plausible ranges,
triggering human review of those video segments.

- **REC-BIAS-014:** Ensure training datasets for clinical systems include sufficient
representation of the body type distribution in the target clinical population, not just
the general population. Rehabilitation and chronic disease populations often have
different body type distributions than healthy control datasets.

### 2.4 Camera Angle and Height Bias

**Evidence Base:**

Pose estimation systems show measurable performance degradation with non-standard camera
angles. Studies evaluating robustness checks found that "classification accuracy dropped
by less than 3%" under slight camera angle shifts (within +/- 15 degrees), but this
assessment was performed in controlled conditions. Real-world clinical deployments face
much greater camera variability, including extreme angles in rehabilitation gyms,
overhead cameras in gait labs, and handheld devices at inconsistent heights.

The standard pose estimation pipeline assumes a frontal or near-frontal camera view at
roughly eye level. Camera height significantly impacts limb occlusion patterns and joint
visibility. Low cameras looking upward increase self-occlusion of lower limbs; high
cameras looking downward alter perceived joint angles due to perspective distortion.

3D pose estimation from monocular images is fundamentally underdetermined due to depth
ambiguity. When camera angle and height deviate from training distributions, the depth
ambiguity problem is amplified, leading to systematically incorrect joint positions in 3D
space even when 2D projections appear correct.

**Actionable Safety Recommendations:**

- **REC-BIAS-015:** Define and enforce standardized camera placement protocols for each
clinical assessment protocol. Document the acceptable camera angle range and provide
visual guides for camera operators.

- **REC-BIAS-016:** Implement real-time camera-angle detection that warns operators when
the camera position deviates from the validated range. Do not proceed with automated
analysis until the camera is repositioned.

- **REC-BIAS-017:** If multi-angle analysis is required, train separate model instances
for each validated angle range or use angle-invariant architectures with explicit
viewpoint conditioning.

- **REC-BIAS-018:** For home-based or unsupervised assessments, include camera setup
calibration sequences (e.g., a standard reference object or body pose) that validate
camera angle and distance before clinical measurement begins.

- **REC-BIAS-019:** Include camera angle as a covariate in all clinical validation
studies. Report whether performance varies significantly by camera angle.

### 2.5 Lighting Condition Effects

**Evidence Base:**

Pose estimation methods must be "invariant to changes in scale, perspective, lighting
and even partial occlusion of a body part." However, achieving this invariance remains
challenging. Studies of robustness under reduced lighting found that classification
accuracy "dropped by less than 3%" -- but this was under controlled, moderate lighting
reduction. Clinical environments include backlighting, fluorescent flicker, directional
spotlights, and shadow patterns from equipment that pose more severe challenges.

The HUST method for unbiased facial albedo estimation explicitly identifies illumination
as a confounding factor: "The albedo map is the illumination-invariant texture map,
which enables us to use inexpensive texture data for diffuse albedo estimation by
eliminating illumination." This same principle applies to pose estimation -- skin
tone appearance changes under different lighting, which can systematically affect
keypoint detection accuracy.

Medical imaging research has established that "datasets are often collected in controlled
indoor settings that focus on specific activities, making them biased towards these
scenarios." Models trained on such biased datasets tend to perform poorly when applied
to other datasets, as demonstrated by cross-dataset inference.

**Actionable Safety Recommendations:**

- **REC-BIAS-020:** Define minimum and maximum illumination requirements for clinical
video capture. Use lux meters to verify compliance before assessment.

- **REC-BIAS-021:** Evaluate model performance under the full range of expected lighting
conditions: bright overhead fluorescent, dim ambient, directional window light,
backlighting, and mixed lighting scenarios.

- **REC-BIAS-022:** Implement a lighting quality check in the video capture pipeline.
Flag frames with extreme lighting conditions (overexposure, underexposure, harsh shadows
across body landmarks) for human review rather than automated analysis.

- **REC-BIAS-023:** Use infrared or depth-sensing cameras where lighting conditions
cannot be controlled, as these modalities are less sensitive to visible-light variations.

- **REC-BIAS-024:** When comparing longitudinal measurements for a single patient,
ensure lighting conditions are consistent across sessions, or use illumination-normalized
preprocessing that has been validated to not introduce systematic bias.

---

## 3. False Positive Risks in Clinical Video Analysis

### 3.1 Over-detection of Movement Disorders

**Evidence Base:**

False positives are a well-documented risk in automated movement disorder detection.
In a remote AI screening study for Parkinson's disease, manual review of false positive
cases revealed that "failure to follow task instructions was a common contributing factor,
occurring in 58% of such instances -- most frequently during the finger-tapping task (47%)."
This indicates that user behavior (not disease) drives a majority of false positive flags.

In the same study, annotators "observed Parkinsonian symptoms in individuals who did not
report a PD diagnosis," suggesting that some apparent "false positives" may actually be
true positives from undiagnosed individuals. However, for clinical safety, these cases
represent inappropriate AI-driven diagnostic suggestions without proper clinical context.

A study on automated stereotypical movement detection in children with ASD found that the
algorithm initially appeared to yield "a high number of false positives" with precision
of only 36.6% at a threshold of 0.85. Comprehensive reannotation revealed that 51% of
segments initially designated as false positives were actually true positives missed by
human annotators. While this improved precision to 66.8%, it also illustrates the danger
of AI systems flagging movements that clinicians may not observe, potentially leading to
over-pathologization.

**Actionable Safety Recommendations:**

- **REC-FP-001:** Implement a two-stage verification workflow: AI flag -> human clinical
review -> diagnostic determination. The AI must never be the sole determinant of a
movement disorder classification.

- **REC-FP-002:** Set AI detection thresholds to minimize false positives (prioritize
high specificity over high sensitivity). In screening contexts, a false positive rate
above 10% is unacceptable without mandatory human review.

- **REC-FP-003:** When the AI flags a potential movement abnormality, provide the
clinician with the specific video segment, confidence score, and the model's basis for
the flag. Do not provide a diagnostic label.

- **REC-FP-004:** Track and monitor false positive rates stratified by patient
demographics. If false positive rates differ across subgroups, the system must be
retrained or recalibrated before continued deployment.

- **REC-FP-005:** Include a prominent disclaimer on all AI-generated reports: "This
flag represents an algorithmic observation, not a clinical diagnosis. Clinical
interpretation by a qualified healthcare provider is required."

### 3.2 Camera Artifact Misclassification

**Evidence Base:**

Camera artifacts represent a significant source of false positives in video-based
movement analysis. Common artifacts include:

- **Motion blur:** Causes keypoint localization errors that can mimic tremor or
involuntary movement
- **Frame dropout/interpolation:** Creates apparent position jumps that may be
misclassified as jerky movements
- **Rolling shutter effects:** Distort body geometry during rapid movement,
potentially mimicking abnormal posture
- **Compression artifacts:** Create block-like patterns near body edges that can
confuse edge-based keypoint detectors
- **Fluorescent light flicker:** Introduces periodic intensity variations that may
be confused with rhythmic movement

In neurosurgical applications, "false positives occurred when notifications were
triggered despite continued device visibility or motion artifacts, such as patient head
movement." The same principle applies to clinical movement analysis: any camera artifact
that introduces apparent motion can trigger false movement disorder flags.

**Actionable Safety Recommendations:**

- **REC-FP-006:** Implement artifact detection preprocessing that identifies and flags
video segments with motion blur, frame dropout, or compression artifacts before pose
estimation analysis.

- **REC-FP-007:** Require minimum frame rate (30 fps for general movement, 60 fps for
tremor analysis) and flag segments that fall below this threshold.

- **REC-FP-008:** Distinguish between camera-induced motion (global motion affecting
the entire frame or background) and body-segment-specific motion. Flags triggered by
global motion should be suppressed with a camera-motion warning.

- **REC-FP-009:** For tremor detection specifically, implement frequency-domain filtering
to distinguish between camera flicker (typically 50-60 Hz or harmonics) and physiological
tremor (typically 4-12 Hz).

- **REC-FP-010:** Include video quality metadata in all analysis outputs so clinicians
can assess whether flagged findings may be artifact-driven.

### 3.3 Clothing-Induced False Movements

**Evidence Base:**

Clothing presents a significant challenge for markerless pose estimation systems.
Baggy clothing obscures true joint positions, causing keypoint detection on fabric
rather than anatomy. Patterns (stripes, plaid) can create Moire artifacts that confuse
edge detectors. Reflective or high-contrast clothing can create false contours.

In clinical validation of pose estimation for 3D joint center localization, researchers
noted that "larger errors caused by issues such as false positive detections, tracking
failures and erroneous switching of limbs" are significant limitations. Clothing-induced
occlusion is a primary contributor to these errors.

For upper body movement analysis, sleeveless vs. long-sleeved garments alter the visible
contour of arms and shoulders. For lower body analysis, loose pants vs. fitted clothing
changes apparent hip and knee positions by several centimeters -- a clinically meaningful
error in joint angle calculations.

**Actionable Safety Recommendations:**

- **REC-FP-011:** Establish clothing protocols for clinical video capture. Where
clinically appropriate, request form-fitting clothing or standardized clinical attire
(e.g., athletic shorts and tank top for gait analysis).

- **REC-FP-012:** If standardized clothing is not possible, include clothing type as
a covariate in validation studies and document whether performance varies by clothing type.

- **REC-FP-013:** Implement clothing-aware confidence scoring that reduces keypoint
confidence estimates when body contours are obscured by loose clothing.

- **REC-FP-014:** Include a clothing quality assessment in the pre-analysis checklist.
If clothing would prevent reliable analysis, postpone the assessment or switch to a
wearable sensor-based alternative.

- **REC-FP-015:** For longitudinal monitoring, require consistent clothing across
sessions or account for clothing variability in the analysis pipeline.

### 3.4 Background Confusion

**Evidence Base:**

Background confusion is a well-documented failure mode in pose estimation. Multi-person
detection errors occur when "joint centres jump between the study participant in the
foreground and people in the background." This is particularly problematic in clinical
settings where multiple staff members, family members, or other patients may be visible.

In physical therapy environments, equipment (parallel bars, weights, therapy balls)
can create structural edges that confuse pose estimators. In hospital rooms, beds,
IV stands, monitors, and furniture create complex background scenes. In home settings,
background variability is even more extreme.

DeepLabCut (a widely-used pose estimation tool) exhibited "a tendency for joint centres
to jump between the study participant in the foreground and people in the background."
This issue is not unique to DeepLabCut -- all pose estimators face this challenge.

**Actionable Safety Recommendations:**

- **REC-FP-016:** Implement and enforce standardized background requirements for
clinical video capture. Use plain, non-patterned backgrounds with good contrast against
the patient.

- **REC-FP-017:** Use person-detection confidence and skeleton consistency checks to
identify when the model has switched to tracking the wrong person. Flag such frames
for human review.

- **REC-FP-018:** For multi-person scenarios, require explicit subject selection
(e.g., a bounding box selection by the camera operator) rather than relying on
automatic person selection.

- **REC-FP-019:** Implement background subtraction or segmentation preprocessing to
isolate the subject from complex backgrounds before pose estimation.

- **REC-FP-020:** In the analysis pipeline, track skeleton consistency over time.
Sudden switches in apparent body size, position, or proportion are strong indicators
of person-switching errors.

---

## 4. Explainability and Uncertainty Quantification

### 4.1 Why Did the System Flag This Movement?

**Evidence Base:**

Explainability is not optional for clinical AI systems. A systematic review of
Explainable AI (XAI) in Clinical Decision Support Systems analyzed 62 studies and found
that "SHAP, LIME, and Grad-CAM emerged as the most widely adopted XAI methods, with
model-agnostic techniques dominating tabular data tasks and model-specific approaches
prevailing in image-based domains."

However, the review identified critical gaps: "major gaps remain in the clinical
translation of XAI systems. Only a subset of the studies incorporated usability testing,
clinician feedback, or human-in-the-loop trials. Moreover, evaluation of explanations,
beyond predictive accuracy, remains inconsistent and lacks standardized benchmarks."

For clinical video analysis specifically, clinicians need to understand:
1. Which body segments or keypoints contributed to a flag
2. What kinematic features (velocity, acceleration, frequency, amplitude) triggered the flag
3. Whether the flag is based on a single anomalous frame or a sustained pattern
4. How the current observation compares to population norms and to the patient's own history

**Actionable Safety Recommendations:**

- **REC-EXP-001:** Every AI-generated flag must be accompanied by an explanation showing
the specific video segment, the keypoints involved, and the kinematic features that
triggered the flag.

- **REC-EXP-002:** Use Grad-CAM or similar attention visualization to show which regions
of the input video the model focused on when making its decision.

- **REC-EXP-003:** Provide temporal context: show a time series of the relevant movement
metric with the flagged segment highlighted, alongside population reference ranges.

- **REC-EXP-004:** All explanations must be presented in clinically meaningful terms
(e.g., "reduced peak angular velocity of the right wrist during finger tapping")
rather than technical model terms (e.g., "negative activation in layer 7 of the CNN").

- **REC-EXP-005:** Include a "why might this be wrong?" section in every explanation
template that lists common confounders for the flagged observation.

### 4.2 Confidence Scores Per Keypoint

**Evidence Base:**

Modern pose estimation models output per-keypoint confidence scores, but these scores
are not systematically validated for clinical use. Research on uncertainty in pose
estimation notes that "neural networks typically output a single point estimate for
each joint or keypoint, which is then propagated through downstream modules. Performance
is commonly summarized using average accuracy metrics aggregated over entire sequences
or datasets. While informative at a global level, these metrics fail to capture
frame-wise reliability."

The work on "Uncertainty-Aware Mapping from 3D Keypoints to Anatomical Landmarks"
introduces a critical framework: "Predictive uncertainty refers to the model's
quantified degree of confidence in its own predictions. In machine learning,
uncertainty is commonly decomposed into aleatoric uncertainty, reflecting irreducible
observation noise, and epistemic uncertainty, capturing uncertainty in model parameters
due to limited or biased training data."

This decomposition is essential for clinical safety: aleatoric uncertainty (from video
quality, occlusion) indicates irreducible noise in a specific measurement, while epistemic
uncertainty (from out-of-distribution inputs) indicates the model is operating outside
its validated domain.

**Actionable Safety Recommendations:**

- **REC-EXP-006:** Report per-keypoint confidence scores for every frame and aggregate
them (e.g., mean, minimum) over the analysis window. Do not report overall movement
scores without this keypoint-level resolution.

- **REC-EXP-007:** Define validated confidence thresholds below which keypoint
detections are considered unreliable. Keypoints below threshold must be excluded from
clinical calculations and flagged for human review.

- **REC-EXP-008:** Distinguish between aleatoric and epistemic uncertainty. High
aleatoric uncertainty (noisy video) suggests the measurement is inherently uncertain;
high epistemic uncertainty (unfamiliar scenario) suggests the model may be outside
its validated domain.

- **REC-EXP-009:** Implement selective prediction: when overall confidence falls below
a validated threshold, the system should decline to provide an automated assessment
and recommend human evaluation.

- **REC-EXP-010:** Display keypoint confidence visually (e.g., color-coding skeleton
joints by confidence level) so clinicians can immediately identify which body landmarks
the model is least certain about.

### 4.3 Visual Attention Maps for Movement Classification

**Evidence Base:**

The Dynamic Medical Graph Framework (DMGF) with Attention-Guided Optimization Strategy
(AGOS) provides a concrete approach for attention-based movement analysis. The framework
incorporates "temporal consistency constraint to smooth predictions over consecutive time
points, reducing abrupt fluctuations" and a multi-objective loss function that includes
fairness, clinical alignment, uncertainty, sparsity, and temporal consistency components.

In explainable gait analysis, "SHAP and LIME were the most widely adopted methods,
while others used Grad-CAM, attention mechanisms, and Layer-wise Relevance Propagation.
Clinical populations studied included Parkinson's disease, stroke, sarcopenia, cerebral
palsy, and musculoskeletal disorders. Reported outcomes highlighted biomechanically
relevant features such as stride length and joint angles as key discriminators of
pathological gait."

**Actionable Safety Recommendations:**

- **REC-EXP-011:** For movement classification models, generate saliency maps that
show which spatial regions and which temporal segments most influenced the classification.

- **REC-EXP-012:** Use attention-weighted kinematic feature summaries that identify
which specific movement parameters (range of motion, peak velocity, movement asymmetry,
rhythm variability) contributed most to a classification.

- **REC-EXP-013:** Provide side-by-side comparison visualizations: the patient's
movement alongside normative reference movement, with attention maps highlighting
deviation regions.

- **REC-EXP-014:** All visual explanations must be interpretable by clinicians without
AI expertise. Technical saliency maps require clinical annotation and translation.

- **REC-EXP-015:** Include attention map reliability indicators: explanations should
only be shown when the model's explanation is itself reliable (assessed via explanation
fidelity metrics).

### 4.4 Uncertainty Quantification

**Evidence Base:**

Uncertainty quantification in clinical movement analysis is an active research area
with demonstrated clinical value. "Calibrated uncertainty estimation for clinical gait
analysis using probabilistic multi-view markerless pipelines" has shown "improved
trustworthiness at the step level."

The key insight is that "a model can exhibit low average error while producing severe
outliers during critical gait events, such as toe-off or peak knee flexion. In contrast
to marker-based systems, which provide implicit quality indicators through physical markers
and signal integrity, markerless pipelines lack a principled mechanism to distinguish
reliable anatomical estimates from hallucinated predictions driven by model uncertainty."

The Pose estimation for health data analysis framework introduces an explicit uncertainty
loss term: "Through this multi-objective loss framework, AGOS ensures that AI-driven
healthcare models remain robust, interpretable, fair, and clinically aligned."

**Actionable Safety Recommendations:**

- **REC-EXP-016:** Implement explicit uncertainty quantification for every clinical
measurement derived from pose estimation. Report confidence intervals alongside point
estimates.

- **REC-EXP-017:** Use uncertainty-based selective inference: when uncertainty exceeds
validated thresholds, do not report clinical measurements. Instead, request re-recording
or human assessment.

- **REC-EXP-018:** Separate reporting of measurement uncertainty (statistical precision)
from clinical significance (whether the difference is clinically meaningful). A highly
precise but clinically trivial difference should be distinguished from an uncertain but
potentially significant finding.

- **REC-EXP-019:** Include uncertainty calibration as part of system validation.
Confidence intervals should achieve their stated coverage probability (e.g., 95% CIs
should contain the true value 95% of the time).

- **REC-EXP-020:** Provide clinicians with uncertainty literacy training as part of
system deployment. Clinicians must understand how to interpret and act on uncertainty
estimates.

---

## 5. Pediatric Privacy and Consent

### 5.1 Video of Children in Healthcare

**Evidence Base:**

The use of AI in pediatric care raises distinct ethical considerations related to
children's developing autonomy and vulnerability. The PEARL-AI framework provides a
structured approach: "Ensure AI enabled healthcare systems protect children's data and
privacy. There must be a responsible data approach to the handling of children's data.
A balance must be found such that there is sufficient data about children for the
development of AI systems while minimizing data collection to safeguard privacy and
security."

Key ethical principles include:
- **Autonomy:** Unlike adults, children cannot independently consent. A parent or legal
guardian must provide consent for data collection. Decisionally competent adolescents
have developing autonomy, and their consent should be sought alongside parental consent.
- **Gillick competence:** Applied when determining whether a child under 16 is competent
to consent, dependent on the child's maturity and intelligence. Higher levels of
competence are required for more complicated decisions.
- **Open future:** "The use of AI in pediatric care should not infringe the child's right
to an open future. This can occur through infringements of confidentiality and privacy,
or generally if decisions are made on the basis of AI which unreasonably narrows the
child's future options."

**Actionable Safety Recommendations:**

- **REC-PED-001:** Obtain written consent from a parent or legal guardian for all video
recording of children under 18. Verbal consent alone is insufficient.

- **REC-PED-002:** For children with Gillick competence (under 16 but mature enough to
understand), obtain assent in addition to parental consent. The child's dissent should
be respected even if parents consent.

- **REC-PED-003:** Inform parents and children (in age-appropriate language) about how
the AI system works, what data it collects, how the data is used, and who has access.

- **REC-PED-004:** Implement data minimization: collect only the video data necessary
for the clinical assessment. Crop or mask regions of the video not relevant to the
movement analysis.

- **REC-PED-005:** As children mature, periodically revisit the consent process.
Children who reach the age of consent should be able to reverse previously given
parental consent and exercise their right to data erasure.

### 5.2 COPPA Considerations

**Evidence Base:**

While COPPA (Children's Online Privacy Protection Act) applies primarily to online
services, its principles extend to clinical AI systems that process children's data
digitally. COPPA requires verifiable parental consent before collecting personal
information from children under 13, restricts data use and sharing, and requires
reasonable data security measures.

Healthcare-specific considerations include:
- HIPAA governs health information but does not fully address AI-specific uses such as
algorithmic training, secondary analysis, and long-term data retention.
- State laws vary significantly. Illinois recently passed laws protecting minors in
digital content, requiring trust funds for children featured in monetized video content.
- UNICEF promotes "children maintaining control over their own data with the capacity to
access, securely share, understand the use of, and delete their data, in accordance with
their age and maturity."

**Actionable Safety Recommendations:**

- **REC-PED-006:** Treat all pediatric video data as subject to COPPA-equivalent
protections regardless of whether the system is technically an "online service." Obtain
verifiable parental consent using COPPA-compliant mechanisms.

- **REC-PED-007:** Do not use pediatric video data for commercial purposes, advertising,
or any purpose beyond the specific clinical or research use described in the consent
process.

- **REC-PED-008:** Implement data retention limits for pediatric video: store raw video
only as long as clinically necessary, then retain only de-identified kinematic
extracts (keypoint coordinates, joint angles) without the underlying video.

- **REC-PED-009:** If video data must be retained for longitudinal comparison, use
encryption at rest and in transit, with access restricted to the clinical team.

- **REC-PED-010:** Do not transfer pediatric video data to third-party AI services
(e.g., cloud pose estimation APIs) without explicit parental consent for that specific
data transfer and processing location.

### 5.3 Parental Consent Requirements

**Evidence Base:**

Consent for pediatric video recording must be specific, informed, and documented. Based
on the PR-COIN registry model, consent materials should cover: the purpose and information
collected, risks and benefits, the process of enrolling, withdrawing or declining to
participate, and the methods to receive results.

For AI-assisted video analysis, consent must specifically address:
- The use of AI algorithms to analyze the video
- Whether the AI is used as a decision-support tool or for automated assessment
- The known limitations and accuracy of the AI system
- Whether human clinicians will review AI outputs before any clinical decisions
- Data storage, sharing, and retention policies
- The child's right to withdraw and request data deletion

**Actionable Safety Recommendations:**

- **REC-PED-011:** Use a dedicated AI video analysis consent form, not just the standard
treatment consent. This form should be separate from general clinical consent and
specifically address AI use.

- **REC-PED-012:** The consent form must state clearly whether the AI has been validated
in pediatric populations. If not, this limitation must be disclosed.

- **REC-PED-013:** Provide consent forms in the parent's preferred language and at an
appropriate reading level (6th-8th grade reading level recommended).

- **REC-PED-014:** Document consent using video consent methods where possible --
showing parents a video explanation of the AI analysis process can improve understanding
and retention compared to written forms alone.

- **REC-PED-015:** Maintain a consent registry that tracks what each family has
consented to, so different uses (clinical care, quality improvement, research) can be
managed separately.

### 5.4 School vs Clinical Video Use

**Evidence Base:**

Video recordings in school settings present additional complexity. School-based health
services may be subject to both educational privacy laws (FERPA) and healthcare privacy
laws (HIPAA). The context of video capture matters significantly:

- **Clinical setting video:** Captured for medical diagnosis or treatment, governed by
HIPAA, subject to medical consent requirements
- **School-based video:** May be captured for educational, behavioral, or health
purposes, potentially subject to both FERPA and HIPAA depending on context
- **Research video:** Captured for research purposes, subject to IRB approval and
research consent requirements
- **Parent-recorded video:** Recorded by parents and shared with clinicians, may not be
subject to HIPAA but raises separate consent issues

The American College of Radiology recommends including "a statement regarding
authorization specifically for use in children, including a description of the evidence
that does/does not support use in children, or if there is a lack of such evidence"
on all FDA-authorized AI devices.

**Actionable Safety Recommendations:**

- **REC-PED-016:** Distinguish clearly between school-based and clinic-based video
capture. School-based video should not be used for clinical AI analysis without
separate clinical consent.

- **REC-PED-017:** If school-based video is used (e.g., for autism behavioral assessment),
obtain separate consent that covers both the school context and any clinical AI analysis.

- **REC-PED-018:** Parent-recorded home video shared with clinicians should be treated
with the same privacy protections as clinic-recorded video once it enters the clinical
system.

- **REC-PED-019:** For multi-site studies involving both school and clinical data,
establish clear data governance protocols that identify which privacy framework applies
to each data element.

- **REC-PED-020:** Include context-of-capture metadata with all video data so that
privacy protections can be applied appropriately based on the setting.

---

## 6. Consent Frameworks for Video-Based AI Analysis

### 6.1 Recording Consent

**Evidence Base:**

Recording consent is the foundational layer of ethical video analysis. Hospital policies
require that "recordings are only permitted after the individual obtains the express
consent of all persons who may be reasonably expected to be recorded, including any
staff or visitors. Everyone has the right to refuse to be recorded."

Key principles:
- Hidden or unauthorized recordings are strictly prohibited
- Recordings during treatments or procedures require consent from all staff present
- Recordings in group treatment areas are generally not permitted
- Consent must be obtained before recording begins, not retroactively

**Actionable Safety Recommendations:**

- **REC-CNS-001:** Obtain explicit, written consent before any video recording begins.
The consent must cover who is being recorded, why, how long the recording will be
retained, and who will have access.

- **REC-CNS-002:** Ensure all individuals visible in the recording (patients, family
members, staff) have consented or are excluded from the recording.

- **REC-CNS-003:** Provide a visual indicator (e.g., recording light, on-screen display)
when recording is active so patients are always aware.

- **REC-CNS-004:** Maintain a consent-audit trail: who consented, when, for what
purpose, and under which consent form version.

- **REC-CNS-005:** Make consent materials publicly available so patients can review
them before their appointment if desired.

### 6.2 AI Analysis Consent

**Evidence Base:**

Consent for AI analysis should be separate from recording consent. Patients may consent
to video recording for clinical documentation but not to AI processing. The FDA's
transparency principles state that "users (clinicians, patients) should be provided
appropriate information, including logic or explainability to the extent practicable."

AI analysis consent should cover:
- Which specific AI algorithms will be applied
- What the AI will analyze (pose, gait, facial expression, hand movements)
- What outputs the AI will produce
- The accuracy and limitations of the AI system
- Whether AI outputs will be used for clinical decisions or only research
- Whether AI outputs will be reviewed by human clinicians

**Actionable Safety Recommendations:**

- **REC-CNS-006:** Create a separate AI Analysis Consent form distinct from the video
recording consent. Patients may decline AI analysis while still allowing recording.

- **REC-CNS-007:** The AI Analysis Consent must describe the specific algorithms being
used, their validation status, and their known limitations in language understandable
to non-technical patients.

- **REC-CNS-008:** Include a clear statement: "A human clinician will review all
AI-generated observations before they are used in your care."

- **REC-CNS-009:** If AI analysis results may be stored in the electronic health record,
state this explicitly and explain what will be stored.

- **REC-CNS-010:** Provide patients with a sample AI report (with de-identified data)
so they understand what information the system will generate about them.

### 6.3 Research Use Consent

**Evidence Base:**

Research use of clinical video data requires specific consent beyond clinical care
consent. The Common Rule (45 CFR 46) and institutional IRB requirements govern research
use of video data. Key considerations include:

- Data collected for clinical care can be used for research only with additional
consent or under a waiver of consent approved by the IRB
- De-identification alone may not be sufficient for video data, as individuals may
be recognizable from their movement patterns or body characteristics
- Future unspecified research uses require broad consent, which must describe the
types of research that may be conducted
- Data sharing with external researchers requires additional consent

**Actionable Safety Recommendations:**

- **REC-CNS-011:** Implement tiered consent: clinical care, quality improvement,
internal research, external sharing, and commercial use should each require separate
explicit consent.

- **REC-CNS-012:** For future unspecified research (broad consent), provide clear
categories of research types and allow patients to opt in or out of each category.

- **REC-CNS-013:** Before sharing video data with external researchers, verify that
all sharing is covered by the patient's consent and that recipient institutions have
adequate data protection measures.

- **REC-CNS-014:** When video data is used for research, maintain a research registry
that tracks which studies used which data, enabling accountability and audit.

- **REC-CNS-015:** For multi-site research studies, establish a central consent
registry and ensure all sites apply the most restrictive consent terms across the
study.

### 6.4 Withdrawal of Consent and Data Deletion

**Evidence Base:**

The right to withdraw consent and request data deletion is a fundamental privacy
principle. The PEARL-AI framework states: "Children who reach the age of consent
are able to reverse parental consent previously given and exercise their 'right to be
forgotten' and for their data to be erased."

For AI systems, withdrawal is complicated by:
- Models that may have been trained on the patient's data (model unlearning is
computationally expensive and often incomplete)
- Shared datasets where deletion from one copy does not ensure deletion from all copies
- Published research results derived from the data (which cannot be "unpublished")
- Aggregate statistics that include the patient's data

**Actionable Safety Recommendations:**

- **REC-CNS-016:** Implement a withdrawal-of-consent process that can be initiated by
the patient or parent at any time, with no penalty to clinical care.

- **REC-CNS-017:** Upon withdrawal, delete all raw video data within 30 days. Delete
all processed data (keypoints, angles, scores) within 90 days unless retention is
required by law.

- **REC-CNS-018:** If the patient's data was used to train AI models, implement a model
unlearning process or retrain models without the withdrawn data. Document this process.

- **REC-CNS-019:** Maintain a "data provenance ledger" that tracks where each patient's
data has been copied, shared, or used for model training. This enables complete
withdrawal enforcement.

- **REC-CNS-020:** Provide patients with a confirmation of data deletion, including a
summary of what was deleted and any legal exceptions that required retention.

---

## 7. Safe Clinician Wording and Communication Standards

### 7.1 "Model-Assisted Observation" Not "AI Detected"

**Evidence Base:**

The language used to communicate AI outputs significantly impacts clinical decision-making
and patient trust. Research on AI in healthcare emphasizes that "providers may become
accustomed to AI-generated documentation" and that "AI systems may eventually influence
clinical thinking by suggesting certain diagnostic pathways." This creates a risk of
automation bias, where clinicians defer to AI outputs without sufficient critical evaluation.

The FDA emphasizes "transparency and explainability" as vital for trust and widespread
adoption. The World Health Organization recommends that AI systems support rather than
replace clinical judgment.

**Actionable Safety Recommendations:**

- **REC-WRD-001:** Standardize terminology: use "model-assisted observation" or
"algorithmic assessment" rather than "AI detected" or "AI diagnosed."

- **REC-WRD-002:** Never use language that suggests the AI has diagnostic authority.
Instead of "The AI detected tremor," use "The model observed movement patterns
consistent with tremor that require clinical confirmation."

- **REC-WRD-003:** Include the model version and date of analysis in all reports so
clinicians can contextualize the output.

- **REC-WRD-004:** Reports should state the human review status: "Reviewed by [clinician
name] on [date]" or "Pending clinical review -- not for use in clinical decisions."

- **REC-WRD-005:** Train all clinicians who will interact with AI outputs on
appropriate interpretation and communication of AI-assisted observations.

### 7.2 "Requires Clinical Confirmation"

**Evidence Base:**

Every AI output in clinical contexts must be explicitly framed as requiring human
confirmation. The FDA's approach to AI/ML medical devices requires that devices include
"appropriate information, including logic or explainability to the extent practicable"
but does not authorize autonomous diagnostic systems for most clinical applications.

Research on remote AI screening for Parkinson's disease found that "failure to follow
task instructions was a common contributing factor" for false positives -- a finding that
only human review could properly assess.

**Actionable Safety Recommendations:**

- **REC-WRD-006:** Every AI-generated observation must include the phrase "Requires
clinical confirmation" or equivalent language, prominently displayed.

- **REC-WRD-007:** For high-stakes findings (potential movement disorder flags), require
structured clinical confirmation: the reviewing clinician must document agreement,
disagreement, or uncertainty with the AI observation.

- **REC-WRD-008:** If the clinician disagrees with the AI observation, provide a
mechanism to document the disagreement and flag the case for model improvement.

- **REC-WRD-009:** Include a standard disclaimer on all AI-assisted reports: "This
assessment was generated with computational assistance and is not a substitute for
clinical evaluation by a qualified healthcare provider."

- **REC-WRD-010:** Track AI-clinician agreement rates as a quality metric. Systematic
disagreement patterns may indicate model drift, bias, or changing patient populations.

### 7.3 "Low-Confidence Marker" Not "Early Sign"

**Evidence Base:**

The temptation to interpret low-confidence AI outputs as "early signs" of disease is a
significant safety risk. Early disease detection is valuable, but labeling uncertain
AI outputs as early signs creates false expectations and may drive unnecessary testing
or treatment.

In uncertainty quantification research, the distinction between aleatoric uncertainty
(measurement noise) and epistemic uncertainty (model uncertainty about the input) is
critical. A low-confidence detection could mean either the signal is noisy or the model
has never seen similar inputs before. Neither case justifies clinical action without
human evaluation.

**Actionable Safety Recommendations:**

- **REC-WRD-011:** Replace "early sign" terminology with "low-confidence marker" or
"observation requiring verification" when the AI confidence is below validated thresholds.

- **REC-WRD-012:** Define clear confidence thresholds that determine the language used:
- High confidence (>90%): "Consistent with [observation] -- clinical correlation recommended"
- Medium confidence (70-90%): "Suggestive of [observation] -- requires clinical confirmation"
- Low confidence (<70%): "Low-confidence marker -- not sufficient for clinical decision-making"

- **REC-WRD-013:** Never use language that implies disease progression or prognosis
(e.g., "early-stage," "developing") based solely on AI movement analysis without
clinical correlation.

- **REC-WRD-014:** When low-confidence markers are present, provide the clinician with
the specific factors that reduced confidence (occlusion, lighting, unusual movement
pattern) so they can assess whether repeat assessment is warranted.

- **REC-WRD-015:** Include in patient-facing materials a clear explanation that
low-confidence AI observations are not diagnoses and do not necessarily indicate disease.

### 7.4 "Research-Only Signal" for Unvalidated Features

**Evidence Base:**

Many AI systems output features that have not been clinically validated. The TAS Test
for automated hand movement analysis achieved AUCs of 0.82 (SCD vs HC), 0.78 (MCI vs HC),
and 0.91 (Dementia vs HC) -- but these are research settings, not clinical diagnostic
tools. The difference between research-validated features and clinically validated
diagnostic tools is critical for safe communication.

FDA-authorized AI devices must demonstrate clinical validation. Systems that have not
completed this validation should only be used in research contexts, and their outputs
must be clearly labeled as such.

**Actionable Safety Recommendations:**

- **REC-WRD-016:** For features that have not completed clinical validation, use the
label "Research-Only Signal" with a clear statement: "This feature has not been
validated for clinical decision-making and should be used only for research purposes."

- **REC-WRD-017:** Maintain a validation status registry for all AI features. Each
feature should have a documented validation status: Research Only, Pilot Validation,
or Clinically Validated.

- **REC-WRD-018:** Research-only signals must not be included in clinical reports that
might be used for patient care decisions. They should be accessible only through
separate research interfaces.

- **REC-WRD-019:** Track validation status changes and ensure that communication
templates are updated when features transition from research to clinically validated.

- **REC-WRD-020:** For pilot-validated features, include language such as: "This
feature has undergone preliminary validation and may assist clinical assessment, but
should not be the sole basis for clinical decisions."

---

## 8. Regulatory Landscape and Compliance Requirements

### 8.1 FDA Guidance on AI/ML-Based SaMD

**Evidence Base:**

The FDA has developed a comprehensive regulatory framework for AI/ML-based Software as
a Medical Device (SaMD). Key documents include:

1. **April 2019:** "Proposed Regulatory Framework for Modifications to AI/ML-Based SaMD"
2. **January 2021:** "AI/ML SaMD Action Plan"
3. **October 2021:** "Good Machine Learning Practice for Medical Device Development" (10 guiding principles)
4. **April 2023:** Draft guidance on Predetermined Change Control Plans (PCCP)
5. **December 2024:** Final guidance on PCCP for AI-Enabled Device Software Functions
6. **January 2025:** "AI-Enabled Device Software Functions: Lifecycle Management and Marketing Submission Recommendations"

The FDA uses a Total Product Lifecycle (TPLC) regulatory approach because "the traditional
paradigm was not designed for adaptive artificial intelligence and machine learning
technologies." The TPLC approach integrates premarket evaluation with continuous
post-market monitoring.

**Key FDA Requirements:**
- Good Machine Learning Practice (GMLP): 10 principles covering data quality, model
development, evaluation, and transparency
- Predetermined Change Control Plans (PCCP): Pre-approved plans for how the AI model
can be updated post-market without requiring new premarket submissions
- Transparency: Users must be provided "appropriate information, including logic or
explainability to the extent practicable"
- Performance monitoring: Real-world performance must be tracked post-deployment

**Actionable Safety Recommendations:**

- **REC-REG-001:** Map the clinical video analysis system to the appropriate FDA
regulatory pathway: 510(k), De Novo, or PMA based on risk classification.

- **REC-REG-002:** Implement Good Machine Learning Practice (GMLP) throughout the
development lifecycle. Document compliance with all 10 GMLP principles.

- **REC-REG-003:** Develop a Predetermined Change Control Plan (PCCP) that specifies
the scope of permissible modifications, retraining protocols, performance evaluation
procedures, and update procedures.

- **REC-REG-004:** Maintain a "nutrition label" summary of the AI device including:
intended use, performance metrics, demographic representativeness of training data,
known limitations, and pediatric use authorization status.

- **REC-REG-005:** Implement post-market performance monitoring with predefined
thresholds for performance drift that would trigger model review or retraining.

### 8.2 Medical Device Classification for Video Analysis

**Evidence Base:**

Clinical video analysis systems may fall under FDA device classification depending on
their intended use:

- **Class I:** Low risk (e.g., general wellness, non-diagnostic movement tracking)
- **Class II:** Moderate risk (e.g., diagnostic assistance, clinical decision support)
- **Class III:** High risk (e.g., systems that directly inform treatment decisions
without clinician review)

The FDA maintains a list of authorized AI-enabled medical devices. In 2024, authorized
devices included AI systems for seizure detection (EpiMonitor, 89.5-98.8% performance),
sleep monitoring (Oxevision, >88% performance), and stroke assessment (CINA-ASPECTS).

The intended use statement is critical: "An AI/ML tool for physician-users that
identified benign and malignant skin lesions" has a different classification than the
same tool made patient-facing.

**Actionable Safety Recommendations:**

- **REC-REG-006:** Define the intended use precisely: Who is the user (clinician vs.
patient)? What is the clinical purpose (screening, diagnosis, monitoring)? What is
the clinical workflow (decision support vs. standalone)?

- **REC-REG-007:** Identify the predicate device for 510(k) submissions by searching
the FDA's authorized AI device database for devices with similar intended use.

- **REC-REG-008:** If no appropriate predicate exists, prepare for the De Novo pathway,
which requires additional clinical evidence but establishes a new device category.

- **REC-REG-009:** Systems intended for direct patient use (without clinician
intermediation) require more rigorous validation than clinician-facing systems.

- **REC-REG-010:** Engage with the FDA early (pre-submission meetings) to confirm
the regulatory pathway and specific requirements for the intended use.

### 8.3 CE Marking Requirements

**Evidence Base:**

For European market access, AI-enabled medical devices must comply with:

1. **EU MDR (2017/745):** Medical Device Regulation -- requires CE marking based on
conformity assessment by a Notified Body
2. **EU AI Act (2024/1689):** Requires CE-marking of high-risk AI systems with
obligations including risk management, data governance, transparency, human oversight,
accuracy, robustness, and cybersecurity
3. **IVDR (2017/746):** For in-vitro diagnostic applications

The AI Act defines "AI system" as "a machine-based system that is designed to operate
with varying levels of autonomy and that may exhibit adaptiveness after deployment."
Clinical video analysis systems that meet this definition are regulated as high-risk AI
systems requiring CE marking.

Key requirements:
- Risk management system throughout the lifecycle
- Training, validation, and test datasets must meet quality criteria
- Technical documentation including model architecture and performance metrics
- Transparency and provision of information to users
- Human oversight measures
- Accuracy, robustness, and cybersecurity
- Post-market monitoring

**Actionable Safety Recommendations:**

- **REC-REG-011:** Conduct a conformity assessment under both EU MDR and EU AI Act
requirements. The AI Act adds requirements beyond the MDR specifically for AI systems.

- **REC-REG-012:** Implement a risk management system per ISO 14971 that specifically
addresses AI risks: bias, drift, brittleness, and human-AI interaction failures.

- **REC-REG-013:** Prepare technical documentation including: system architecture,
data governance practices, model training procedures, validation results stratified by
demographics, and known limitations.

- **REC-REG-014:** Designate a human oversight role with authority to override AI
outputs. Document the oversight workflow.

- **REC-REG-015:** Establish post-market surveillance including performance monitoring
across demographic subgroups and periodic safety reporting to competent authorities.

### 8.4 Clinical Validation Requirements

**Evidence Base:**

Clinical validation requirements vary by regulatory pathway but generally include:

- **Performance metrics:** Sensitivity, specificity, PPV, NPV, AUC reported with
confidence intervals
- **Demographic representativeness:** Performance stratified by age, sex, race/ethnicity,
skin tone, and relevant clinical subgroups
- **External validation:** Performance in independent cohorts different from the
development data
- **Comparator:** Performance relative to an appropriate reference standard (gold
standard clinical assessment)
- **Usability validation:** Evidence that clinicians can correctly interpret and use
the AI outputs in the intended workflow

The FDA's 2024 review of authorized AI devices found that many devices report limited
demographic data: "Many devices reported 'NR' (not reported) for demographic
representativeness," raising concerns about whether performance is consistent across
populations.

Clinical validation studies for movement analysis typically compare against:
- Clinical expert assessment (video review by movement disorder specialists)
- Instrumented reference systems (marker-based motion capture, accelerometry, gyroscopy)
- Established clinical scales (MDS-UPDRS, FMS, gait speed, etc.)

Validation metrics from the literature:
- Markerless vs. marker-based motion capture: ICC > 0.70 for most metrics
- Video vs. accelerometry: MAE 0.10 Hz for tremor frequency, 97% within +/- 0.5 Hz
- Automated vs. clinician assessment: ~70% agreement for error pattern recognition
- Finger tapping vs. high-speed video: mean errors ~3.3/2.4 px for peak/valley

**Actionable Safety Recommendations:**

- **REC-REG-016:** Conduct a prospective clinical validation study comparing the AI
system against an appropriate reference standard in the target population.

- **REC-REG-017:** Report all performance metrics with 95% confidence intervals and
stratify by demographic subgroups (age, sex, skin tone, body type).

- **REC-REG-018:** Include external validation in a cohort independent from the
development data, ideally at a separate clinical site with different equipment.

- **REC-REG-019:** Validate the clinical workflow, not just the algorithm: demonstrate
that clinicians can correctly interpret AI outputs and integrate them into clinical
decision-making.

- **REC-REG-020:** Plan for continuous clinical validation: define protocols for
ongoing performance monitoring, periodic re-validation, and criteria that would trigger
re-validation studies.

---

## 9. Integrated Safety Recommendations

### 9.1 Pre-Deployment Safety Checklist

Before deploying any AI-assisted clinical video analysis system, complete the following:

| # | Safety Check | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Bias evaluation across skin tones (Fitzpatrick I-VI) | | FAIR benchmark results |
| 2 | Bias evaluation across age groups (toddler to elderly) | | Age-stratified mAP |
| 3 | Bias evaluation across body types (BMI categories) | | BMI-stratified performance |
| 4 | Camera angle validation (+/- 15 deg, standard positions) | | Angle-stratified accuracy |
| 5 | Lighting condition validation (full expected range) | | Lux-stratified performance |
| 6 | False positive rate < 10% at clinical threshold | | Confusion matrix |
| 7 | Artifact detection and handling implemented | | Test results |
| 8 | Per-keypoint confidence reporting active | | Output samples |
| 9 | Uncertainty quantification validated | | Calibration curves |
| 10 | Explainability features operational | | Clinician review |
| 11 | Pediatric-specific validation completed (if applicable) | | Age-group performance |
| 12 | Consent forms finalized and approved | | Legal review |
| 13 | Withdrawal process tested | | Process documentation |
| 14 | Safe clinician wording templates approved | | Communication review |
| 15 | Regulatory pathway confirmed | | FDA/CE correspondence |
| 16 | Post-market monitoring plan established | | Monitoring SOP |
| 17 | Human oversight workflow defined | | Workflow diagram |
| 18 | Incident reporting process established | | Safety SOP |
| 19 | Training materials for clinicians prepared | | Training completion records |
| 20 | Patient-facing materials approved | | Patient advisory review |

### 9.2 Safety-Critical Design Principles

1. **Human-in-the-loop always:** AI systems provide observations, not diagnoses. A
qualified clinician must review all AI outputs before clinical action.

2. **Transparency by design:** Every AI output includes: what was analyzed, how it
was analyzed, how confident the system is, what the limitations are, and what the
clinician should do next.

3. **Bias-aware deployment:** Systems are evaluated for bias before deployment,
monitored for bias during deployment, and recalibrated when bias is detected.

4. **Privacy-first architecture:** Collect the minimum data necessary, protect it
with encryption, retain it only as long as needed, and delete it upon request.

5. **Graduated autonomy:** Research-only signals are clearly separated from
clinically validated features. New features enter at research level, progress through
pilot validation, and only then become clinically validated.

6. **Continuous monitoring:** Post-deployment performance is tracked continuously.
Drift in any metric triggers review. Disparate performance across subgroups triggers
immediate intervention.

7. **Patient empowerment:** Patients have the right to know what the AI system does,
how accurate it is for people like them, and how to withdraw their data. Communicate
in language patients understand.

### 9.3 Risk Matrix

| Risk | Likelihood | Severity | Mitigation Priority |
|------|-----------|----------|-------------------|
| Skin tone bias in pose estimation | High | High | Critical |
| False positive movement disorder flag | Medium | High | Critical |
| Pediatric privacy violation | Medium | High | Critical |
| Clinician over-reliance on AI output | High | High | Critical |
| Camera artifact misclassification | Medium | Medium | High |
| Age-related accuracy degradation | High | Medium | High |
| Body type bias | Medium | Medium | High |
| Background confusion | Medium | Medium | High |
| Lighting sensitivity | High | Low | Medium |
| Clothing-induced errors | Medium | Low | Medium |
| Inadequate consent documentation | Low | High | High |
| Data retention beyond need | Medium | Medium | Medium |

---

## 10. References and Sources

### Regulatory and Guidance Documents

1. U.S. Food and Drug Administration. "Artificial Intelligence in Software as a Medical Device."
   https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-software-medical-device
   Accessed March 2025.

2. U.S. Food and Drug Administration. "AI-Enabled Device Software Functions: Lifecycle Management
   and Marketing Submission Recommendations." January 2025 (Draft Guidance).

3. U.S. Food and Drug Administration. "Good Machine Learning Practice for Medical Device
   Development: Guiding Principles." October 2021.

4. U.S. Food and Drug Administration. "Marketing Submission Recommendations for a Predetermined
   Change Control Plan for AI-Enabled Device Software Functions." December 2024 (Final Guidance).

5. European Union. Regulation (EU) 2024/1689 -- Artificial Intelligence Act.

6. European Union. Regulation (EU) 2017/745 -- Medical Device Regulation (MDR).

### Bias and Fairness Research

7. Cross JL, Onofrey J, et al. "Bias in medical AI: Implications for clinical decision-making."
   PLOS Digital Health. 2024;3(11):e0000651.

8. Ran Z, et al. "HUST: High-Fidelity Unbiased Skin Tone Estimation via Texture Quantization."
   ICCV 2025.

9. "Identifying Ethical Biases in Action Recognition Models." arXiv:2604.17971v1. 2026.

10. "A Case Study in Fairness Evaluation: Current Limitations." AAAI-23 Workshop on
    Reponsible AI in Healthcare.

11. Koerber NM, et al. "Photoplethysmography in Diverse Skin Tones: Evaluating Bias in Smartwatch
    Health Monitoring." Cureus. 2025.

12. "Bias in artificial intelligence for medical imaging." Digital Imaging Research. 2024.

### Explainability and Uncertainty

13. "Explainable AI in Clinical Decision Support Systems: A Systematic Review."
    MDPI Healthcare. 2025;13(17):2154.

14. "Explainable artificial intelligence for gait analysis." PMC/NIH. 2025.
    Systematic review registered on PROSPERO (CRD42024622752).

15. "Uncertainty-Aware Mapping from 3D Keypoints to Anatomical Landmarks for Markerless
    Biomechanics." arXiv:2603.26844v1. 2026.

16. "Pose estimation for health data analysis: advancing AI in neuroscience and psychology."
    PMC. 2021.

### Clinical Validation

17. "A real time action scoring system for movement analysis and feedback in physical therapy
    using human pose estimation." Scientific Reports. 2025.

18. "Validation of a markerless motion capture app for automated scoring of sit-to-stand, timed
    up and go, and short physical performance battery tests." PLOS Digital Health. 2021.

19. "TAS test clinical validation: automated hand movement analysis helps discriminate subjective
    cognitive decline, mild cognitive impairment and dementia." Neurology Open. 2024.

20. "Clinical Validation of an On-Device AI-Driven Real-Time Human Pose Estimation and Exercise
    Prescription Program." PMC. 2024.

21. "AI Video Analysis in Parkinson's Disease: A Systematic Review." MDPI Sensors. 2025.

### Movement Disorder Detection and False Positives

22. "Remote AI Screening for Parkinson's Disease: A Multimodal, Cross-Setting Validation Study."
    PMC. 2025.

23. "Automated Analysis of Stereotypical Movements in Videos of Children With ASD."
    JAMA Network Open. 2024.

24. "Automated video analysis for early detection of bradykinesia in Parkinson's disease."
    PMC. 2025.

25. "Real-Time Artificial Intelligence Assistance in [Neurosurgery]." Neurosurgery. 2026.

26. "Understanding the robustness of vision-language models to medical image artefacts."
    npj Digital Medicine. 2025.

### Pediatric Ethics and Privacy

27. "Ethical considerations in AI for child health and the PEARL-AI framework."
    PMC. 2025.

28. "Video consent is preferred over written informed consent in pediatrics."
    Hospital for Sick Children (SickKids). PMC. 2025.

29. Jackson LLP. "Using Minor Patients' Photos and Videos to Promote Your Practice." 2025.

### Pose Estimation Technical References

30. "The accuracy of several pose estimation methods for 3D joint centre localisation."
    PMC. 2021.

31. "Estimating hip impact velocity and acceleration from video-captured falls using a pose
    estimation algorithm." Scientific Reports. 2025.

32. "Evaluating the Accuracy of Cloud-based 3D Human Pose Estimation Tools." 2024.

33. "A survey on deep learning for 2D and 3D human pose estimation."
    Artificial Intelligence Review. 2025.

### AI Regulation and Governance

34. "United States Food and Drug Administration Regulation of Clinical Software in the Era of
    Artificial Intelligence and Machine Learning." PMC. 2025.

35. "Machine Learning-Enabled Medical Devices Authorized by the FDA in 2024: Regulatory
    Characteristics, Predicate Lineage, and Transparency Reporting." PMC. 2025.

36. "FDA Expectations for AI/ML Model Training in SaMD (2025 guide)." Rook Quality Systems.

37. "A Complete Guide to the FDA's AI/ML Guidance for Medical Devices." Ketryx.

38. Bipartisan Policy Center. "FDA Oversight: Understanding the Regulation of Health AI Tools."
    2025.

39. "AI Medical Device Software under EU MDR & IVDR." Decomplix. 2025.

---

## Appendix A: Glossary of Terms

| Term | Definition |
|------|-----------|
| **SaMD** | Software as a Medical Device -- software intended to be used for medical purposes |
| **PCCP** | Predetermined Change Control Plan -- FDA framework for managing post-market AI updates |
| **GMLP** | Good Machine Learning Practice -- FDA's 10 guiding principles for AI medical devices |
| **XAI** | Explainable Artificial Intelligence -- methods for making AI decisions interpretable |
| **mAP** | mean Average Precision -- standard metric for pose estimation accuracy |
| **OKS** | Object Keypoint Similarity -- COCO benchmark similarity metric |
| **PCK** | Percentage of Correct Keypoints -- alternative accuracy metric |
| **ICC** | Intraclass Correlation Coefficient -- reliability metric for clinical validation |
| **MAPE** | Mean Absolute Percentage Error -- accuracy metric for continuous measurements |
| **SHAP** | SHapley Additive exPlanations -- model-agnostic explainability method |
| **LIME** | Local Interpretable Model-agnostic Explanations -- explainability method |
| **Grad-CAM** | Gradient-weighted Class Activation Mapping -- visual explanation technique |
| **Aleatoric uncertainty** | Irreducible observation noise inherent in the data |
| **Epistemic uncertainty** | Model uncertainty due to limited or biased training data |
| **Fitzpatrick scale** | Six-category classification of skin types (I=very light to VI=very dark) |
| **FAIR benchmark** | Standardized benchmark for evaluating skin tone estimation fairness |
| **COPPA** | Children's Online Privacy Protection Act |
| **HIPAA** | Health Insurance Portability and Accountability Act |
| **MDS-UPDRS** | Movement Disorder Society Unified Parkinson's Disease Rating Scale |
| **TPLC** | Total Product Lifecycle -- FDA's regulatory approach for AI/ML devices |

## Appendix B: Recommended Reading Order

**For Clinical Teams:**
1. Sections 7 (Safe Clinician Wording) and 9.1 (Pre-Deployment Checklist)
2. Sections 5 (Pediatric Privacy) and 6 (Consent Frameworks)
3. Sections 3 (False Positive Risks) and 4 (Explainability)

**For Technical Teams:**
1. Sections 2 (Bias) and 3 (False Positive Risks)
2. Section 4 (Explainability and Uncertainty)
3. Section 9.1 (Pre-Deployment Checklist)

**For Regulatory Teams:**
1. Section 8 (Regulatory Landscape)
2. Section 6 (Consent Frameworks)
3. Section 9.2 (Safety-Critical Design Principles)

**For Ethics Review Boards:**
1. Section 5 (Pediatric Privacy) and 6 (Consent Frameworks)
2. Section 2 (Bias in Computer Vision)
3. Section 9 (Integrated Safety Recommendations)

---

> **Document Integrity Notice**
> This report integrates findings from peer-reviewed literature, regulatory guidance
documents, and technical benchmarks current as of the date of compilation. All
recommendations are advisory and should be adapted to specific clinical contexts
in consultation with legal counsel, ethics review boards, and regulatory affairs
specialists. This report does not constitute legal advice or regulatory guidance.

---

*Report compiled from systematic web research across 7 major topic areas incorporating
findings from FDA guidance documents, peer-reviewed clinical and computer vision
literature, regulatory analyses, and ethical frameworks for pediatric AI.*
