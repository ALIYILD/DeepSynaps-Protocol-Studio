# World-Class qEEG Report Template
## Quantitative Electroencephalography Clinical Report Standard v1.0

---

**Document Classification**: Clinical Technical Report  
**Scope**: Quantitative EEG (qEEG) analysis for clinical assessment and neurofeedback protocol planning  
**Compliance**: Aligned with IQCB 2025 Guidelines, ACNS Guideline 7 (Tatum et al., 2016), ACNS qEEG Practice Guidelines  
**Version**: 1.0 | **Date**: [Report Generation Date]  
**Classification**: CONFIDENTIAL - Protected Health Information (PHI)

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Scan Metadata & Technical Information](#2-scan-metadata--technical-information)
3. [Quality Assurance / QC Section](#3-quality-assurance--qc-section)
4. [Spectral Analysis Summary](#4-spectral-analysis-summary)
5. [Topographic Map Key Images](#5-topographic-map-key-images)
6. [Connectivity Summary](#6-connectivity-summary)
7. [Source Localization Summary](#7-source-localization-summary)
8. [Findings Table (with Evidence Grades)](#8-findings-table-with-evidence-grades)
9. [Limitations](#9-limitations)
10. [Protocol Implications](#10-protocol-implications)
11. [Patient-Friendly Summary](#11-patient-friendly-summary)
12. [Clinician Sign-Off](#12-clinician-sign-off)
13. [Evidence Appendix](#13-evidence-appendix)
14. [Key Images Appendix](#14-key-images-appendix)

---

## 1. EXECUTIVE SUMMARY

> **Purpose**: Provide a concise, clinician-oriented overview of all significant findings and actionable recommendations. This section should be readable by non-EEG specialists (general practitioners, psychologists, nurses) and serve as a standalone summary.

### Template Structure

```
================================================================================
                         EXECUTIVE SUMMARY
================================================================================

PATIENT: [Full Name]           |  REPORT DATE: [Date]
AGE: [X] years / [X] months    |  CLINICIAN: [Name, Credentials]
GENDER: [Male/Female]          |  CERTIFICATION: [QEEG-D / QEEG-DL / BCN]
HANDEDNESS: [Right/Left/Mixed] |  REVIEWER: [Name, Credentials] (if applicable)
REFERRER: [Referring Clinician]|  CONDITION: [Eyes Open / Eyes Closed / Both]

REASON FOR QEEG: [Clinical indication as stated by referring clinician]

OVERALL IMPRESSION:
[One-paragraph summary of whether the qEEG is within normal limits, mildly 
deviant, moderately deviant, or markedly deviant from normative expectations
for age and sex. State the primary regions and frequency bands of concern.]

KEY FINDINGS (Top 3-5):
1. [Primary finding: Region, frequency band, direction (excess/deficit), 
    Z-score magnitude, clinical correlation]
2. [Secondary finding]
3. [Tertiary finding]
4. [Quaternary finding - if applicable]
5. [Quinary finding - if applicable]

CLINICAL CORRELATION:
[Integration of qEEG findings with presenting symptoms, medical history, 
and current medications. Explain how findings fit (or do not fit) the 
clinical picture. Reference relevant Brodmann areas and associated functions.]

RECOMMENDATIONS:
[Actionable recommendations within the clinician's scope of practice:
 - Neurofeedback protocol priorities (if indicated)
 - Referral recommendations (if applicable)
 - Suggested follow-up assessments]

DISCLAIMER: This qEEG report does not infer etiology or diagnose medical
or psychological conditions. It is not a substitute for medical or 
psychological evaluation. Findings are based on research linking 
neuromarkers with functional dysregulation and should be integrated with 
a comprehensive clinical assessment.
================================================================================
```

### Writing Standards (per ACNS & IQCB Guidelines)

| Principle | Application |
|-----------|-------------|
| **Conciseness** | Limit to 1 page; most clinicians read only this section |
| **Jargon-free** | Avoid EEG-specific terminology; use functional language |
| **Integrative** | Always correlate with clinical presentation |
| **Graded** | Clearly state degree of abnormality if present |
| **Actionable** | Provide clear, specific recommendations |
| **Qualified** | Use cautious phrasing: "suggests," "is consistent with," "may indicate" |

---

## 2. SCAN METADATA & TECHNICAL INFORMATION

> **Purpose**: Document all technical parameters necessary for reproducibility and to enable another qualified clinician to evaluate the quality and validity of the analysis.

### 2.1 Patient Demographics

```
--------------------------------------------------------------------------------
PATIENT INFORMATION
--------------------------------------------------------------------------------
Full Name:        ____________________________________
Date of Birth:    ____________________________________
Age:              _____ years / _____ months (at time of recording)
Sex:              [ ] Male  [ ] Female  [ ] Other
Gender:           ____________________________________
Handedness:       [ ] Right  [ ] Left  [ ] Mixed / Ambidextrous
Referring Clinician: ____________________________________
Referring Diagnosis/Indication: ____________________________________
Primary Language: ____________________________________
Interpreter Used: [ ] Yes  [ ] No

CURRENT MEDICATIONS (list all that may affect EEG):
1. ________________________ Dose: ________ Frequency: ________
2. ________________________ Dose: ________ Frequency: ________
3. ________________________ Dose: ________ Frequency: ________

RELEVANT MEDICAL HISTORY:
[Include: prior head injury, seizures, psychiatric diagnoses, sleep disorders,
 substance use, prior neurofeedback or neuromodulation treatment]

PRESENTING SYMPTOMS (patient-reported):
[Summarize primary complaints and their duration]

PRE-RECORDING CONDITIONS:
Hours of sleep prior night: _____
Last caffeine intake: _____ hours before recording
Fasting: [ ] Yes  [ ] No
Sleep deprivation: [ ] Yes  [ ] No  Hours: _____
Current substance use: ____________________________________
--------------------------------------------------------------------------------
```

### 2.2 Recording Parameters

```
--------------------------------------------------------------------------------
TECHNICAL SPECIFICATIONS
--------------------------------------------------------------------------------
Recording Date:           ___________________
Recording Start Time:     ___________________
Recording Site/Location:  ___________________
Equipment Manufacturer:   ___________________
Amplifier Model:          ___________________
Software Version:         ___________________

ELECTRODE CONFIGURATION:
Electrode System:         [ ] International 10-20  [ ] 10-10  [ ] Other: _____
Number of Channels:       _____
Channel Labels:           ________________________________________________
Electrode Type:           [ ] Ag/AgCl  [ ] Tin  [ ] Other: _____________
Impedance Threshold:      < _____ kOhm
Ground Electrode:         ___________________
Reference:                [ ] Linked Ears  [ ] Average  [ ] Cz  [ ] Laplacian
                          [ ] Other: _____________

RECORDING PARAMETERS:
Sampling Rate:            _____ Hz
Bandpass Filter:          _____ - _____ Hz
Notch Filter:             [ ] 50 Hz  [ ] 60 Hz  [ ] None
Resolution (bit depth):   _____ bits
Epoch Length:             _____ seconds
Number of Epochs:         _____
Total Usable Recording:   _____ minutes : _____ seconds

RECORDING CONDITIONS:
Condition 1:              [ ] Eyes Open   Duration: _____ min  Lighting: ______
Condition 2:              [ ] Eyes Closed Duration: _____ min  Lighting: ______
Condition 3:              [ ] Task: _____________ Duration: _____ min
Patient State:            [ ] Awake  [ ] Drowsy  [ ] Asleep
Room Conditions:          Temperature: _____  Noise Level: _____  Lighting: _____
--------------------------------------------------------------------------------
```

### 2.3 Database Reference Information

```
--------------------------------------------------------------------------------
NORMATIVE DATABASE SPECIFICATIONS
--------------------------------------------------------------------------------
Database Name/Version:    ___________________
Database Population:      N = _____
Age Range:                _____ to _____ years
Sex Stratification:       [ ] Yes  [ ] No
Race/Ethnicity:           ___________________
Database Montage:         ___________________
Age Regression Method:    [ ] GAM  [ ] Sliding Window  [ ] Other: _____
Z-Score Distribution:     [ ] Gaussian verified  [ ] Log10 transform applied
                          [ ] Box-Cox transform applied  [ ] Other: _____
Z-Score Threshold:        [ ] 1.5 SD (trend)  [ ] 2.0 SD (significant)
                          [ ] 2.5 SD  [ ] 3.0 SD (marked)

QEEG ANALYSIS SOFTWARE:
Analysis Platform:        ___________________
Version:                ___________________
Artifact Method:        ___________________
Spectral Method:        [ ] FFT  [ ] Welch  [ ] AR  [ ] Multi-taper
Connectivity Method:    [ ] Coherence  [ ] Phase  [ ] PLV  [ ] PLI
                          [ ] Lagged Coherence  [ ] Imaginary Coherence
                          [ ] Other: _____________
Source Localization:    [ ] LORETA  [ ] sLORETA  [ ] eLORETA
                          [ ] swLORETA  [ ] Other: _____________
Head Model:             [ ] 3-sphere  [ ] BEM  [ ] FEM
                          [ ] Individual MRI  [ ] MNI Template
--------------------------------------------------------------------------------
```

---

## 3. QUALITY ASSURANCE / QC SECTION

> **Purpose**: Document data quality, artifact handling, and reliability metrics to establish confidence in the reported findings. Per IQCB 2025: "The efficacy of QEEG depends strongly on the quality of the acquired EEG and the correctness of subsequent inspection, selection, and processing."

### 3.1 Data Quality Metrics

```
================================================================================
                    QUALITY ASSURANCE / QC SUMMARY
================================================================================

OVERALL DATA QUALITY RATING: [ ] EXCELLENT  [ ] GOOD  [ ] ACCEPTABLE  [ ] MARGINAL  [ ] POOR

RELIABILITY METRICS:
Split-Half Reliability:       _____ (target: > 0.90)
Test-Retest Reliability:      _____ (target: > 0.80)

ARTIFACT REJECTION SUMMARY:
Total Recording Time:         _____ minutes
Artifact-Rejected Time:       _____ minutes (___%)
Usable/Clean Data:            _____ minutes (___%)

ARTIFACT BREAKDOWN:
Artifact Type          |  Rejected Time  |  Percentage of Total
-----------------------|-----------------|-----------------------
Eye Blink (EOG)        |     _____ min   |       ___%
Eye Movement (EOG)     |     _____ min   |       ___%
Muscle (EMG)           |     _____ min   |       ___%
Movement               |     _____ min   |       ___%
Cardiac (ECG)          |     _____ min   |       ___%
Electrode Pop/Noise    |     _____ min   |       ___%
Other: _____________   |     _____ min   |       ___%
-----------------------|-----------------|-----------------------
TOTAL                  |     _____ min   |       ___%

BAD CHANNELS DETECTED:
[ ] None
[ ] _____ (reason: _______________)
[ ] _____ (reason: _______________)
[ ] _____ (reason: _______________)

INTERPOLATION USED:
[ ] No interpolation required
[ ] Yes: Channels _____ interpolated using _____ method

MINIMUM USABLE DATA CHECK:
[ ] PASS - Sufficient clean data available for reliable analysis
[ ] CAUTION - Borderline usable data; interpret with caution
[ ] FAIL - Insufficient clean data; report findings are preliminary

QC ASSESSMENT NOTES:
[Describe any quality concerns, environmental factors, patient cooperation 
issues, or other factors that may influence interpretation]
================================================================================
```

### 3.2 Raw EEG Quality Assessment

```
--------------------------------------------------------------------------------
RAW EEG QUALITY OBSERVATIONS
--------------------------------------------------------------------------------

Overall Signal Quality:  [ ] Excellent  [ ] Good  [ ] Fair  [ ] Poor
Background Rhythm:       [ ] Present and well-defined
                         [ ] Present but suboptimal
                         [ ] Difficult to assess
                         [ ] Absent/not interpretable

Posterior Dominant Rhythm (PDR):
Frequency:    _____ Hz (expected for age: _____ Hz)
Amplitude:    _____ uV
Reactivity:   [ ] Present (attenuates with eye opening)
              [ ] Reduced  [ ] Absent

State During Recording:
[ ] Continuous awake state
[ ] Brief drowsiness episodes (___% of recording)
[ ] Significant drowsiness (___% of recording)
[ ] Sleep features observed

Distinguishing Features:
[Describe any notable raw EEG features, including posterior dominant rhythm,
drowsiness patterns, or paroxysmal activity observed during visual inspection]

SAMPLE EEG SEGMENTS:
[Reference to key EEG epochs included in the Key Images Appendix]
Figure A1: Representative eyes-closed segment (___ seconds)
Figure A2: Representative eyes-open segment (___ seconds)
[Additional segments as clinically relevant]
--------------------------------------------------------------------------------
```

---

## 4. SPECTRAL ANALYSIS SUMMARY

> **Purpose**: Present quantitative spectral findings across all frequency bands, electrode sites, and montages. Findings should be organized systematically following established interpretation hierarchies.

### 4.1 Frequency Band Definitions

```
--------------------------------------------------------------------------------
FREQUENCY BAND SPECIFICATIONS
--------------------------------------------------------------------------------
Band Name        |  Frequency Range  |  Primary Associated Functions
-----------------|-------------------|------------------------------------------
Delta            |    1 - 3 Hz       |  Deep sleep, unconscious processes, 
                 |                   |  basic homeostatic regulation
-----------------|-------------------|------------------------------------------
Theta            |    4 - 7 Hz       |  Drowsiness, memory encoding, 
                 |                   |  creative processing, emotional integration
-----------------|-------------------|------------------------------------------
Alpha            |    8 - 12 Hz      |  Relaxed awareness, visual processing, 
                 |                   |  inhibitory control, information flow
-----------------|-------------------|------------------------------------------
Low Beta         |   13 - 20 Hz      |  Active thinking, focused attention, 
                 |                   |  engagement with external world
-----------------|-------------------|------------------------------------------
High Beta        |   21 - 30 Hz      |  Analytical processing, alertness, 
                 |                   |  motor planning
-----------------|-------------------|------------------------------------------
Gamma            |   31 - 50 Hz      |  Higher cognitive integration, 
                 |                   |  binding problem, consciousness
-----------------|-------------------|------------------------------------------

[Note: Exact frequency boundaries may vary by analysis platform and 
clinical context. Alternative subdivision (e.g., alpha-1/alpha-2) 
should be noted when used.]
--------------------------------------------------------------------------------
```

### 4.2 Spectral Power Summary Tables

#### Absolute Power - Linked Ears Reference (or Primary Montage)

```
================================================================================
          Z-SCORE SUMMARY: ABSOLUTE POWER (Eyes Closed / Eyes Open)
================================================================================

Z-Score Interpretation Key:
    -3.00 to -2.50 (Dark Red)  = Markedly elevated
    -2.49 to -2.00 (Red)       = Significantly elevated
    -1.99 to -1.50 (Orange)    = Trend elevated
    -1.49 to +1.49 (Green)     = Within normal range
    +1.50 to +1.99 (Yellow)    = Trend reduced
    +2.00 to +2.50 (Blue)      = Significantly reduced
    +2.51 to +3.00 (Dark Blue) = Markedly reduced

Note: Direction convention varies by software. Verify software convention.

Region / Electrode(s) | Delta  | Theta  | Alpha  | LoBeta | HiBeta | Gamma
----------------------|--------|--------|--------|--------|--------|-------
FRONTAL
  Fp1, Fp2           |        |        |        |        |        |
  F3, F4             |        |        |        |        |        |
  F7, F8             |        |        |        |        |        |
  Fz                 |        |        |        |        |        |
TEMPORAL
  T3 (T7), T4 (T8)   |        |        |        |        |        |
  T5 (P7), T6 (P8)   |        |        |        |        |        |
CENTRAL
  C3, C4             |        |        |        |        |        |
  Cz                 |        |        |        |        |        |
PARIETAL
  P3, P4             |        |        |        |        |        |
  Pz                 |        |        |        |        |        |
OCCIPITAL
  O1, O2             |        |        |        |        |        |

MULTIVARIATE REGION SUMMARIES:
Region                | Delta  | Theta  | Alpha  | LoBeta | HiBeta | Gamma
----------------------|--------|--------|--------|--------|--------|-------
Left Anterior         |        |        |        |        |        |
Right Anterior        |        |        |        |        |        |
Left Central          |        |        |        |        |        |
Right Central         |        |        |        |        |        |
Left Posterior        |        |        |        |        |        |
Right Posterior       |        |        |        |        |        |
Midline               |        |        |        |        |        |
================================================================================
```

#### Relative Power Summary

```
================================================================================
          Z-SCORE SUMMARY: RELATIVE POWER (% of Total Power)
================================================================================
Region / Electrode(s) | Delta  | Theta  | Alpha  | LoBeta | HiBeta | Gamma
----------------------|--------|--------|--------|--------|--------|-------
[Same regional structure as Absolute Power table above]
================================================================================
```

#### Frequency Ratios

```
================================================================================
          FREQUENCY RATIO ANALYSIS
================================================================================
Ratio                    |  Value  |  Z-Score  |  Interpretation
-------------------------|---------|-----------|--------------------------
Theta/Beta (e.g., Fz)    |         |           |
Theta/Beta (e.g., Cz)    |         |           |
Alpha/Theta              |         |           |
Delta/Alpha              |         |           |
SMR/Theta (e.g., C4)     |         |           |
[Additional ratios]      |         |           |
================================================================================
```

### 4.3 Spectral Analysis Narrative

```
--------------------------------------------------------------------------------
SPECTRAL ANALYSIS INTERPRETATION
--------------------------------------------------------------------------------

[Provide a structured narrative interpretation following this hierarchy:

1. ABSOLUTE POWER: Describe the distribution of absolute power across regions
   and bands. Note any areas of significant excess or deficit.

2. RELATIVE POWER: Describe the proportional distribution of power. Note
   any disproportionate allocation to specific frequency bands.

3. FREQUENCY RATIOS: Note any clinically significant ratio deviations.

4. REGIONAL PATTERNS: Identify clustered abnormalities that may indicate
   localized dysfunction. Look for patterns where multiple measures 
   (absolute + relative power, asymmetry, coherence) converge on the same
   region.

5. GLOBAL PATTERNS: Note any diffuse or generalized abnormalities that may
   indicate systemic or metabolic factors.

6. CLINICAL CORRELATION: Connect spectral findings to presenting symptoms
   and functional domains.]

Example structure:
"The absolute power analyses revealed [excessive/deficit] [band] activity 
in the [region], with Z-scores ranging from [X.XX] to [X.XX]. This pattern
[is/is not] consistent with the patient's reported [symptom domain]. The 
theta/beta ratio at [location] was [elevated/reduced] (Z = [X.XX]), which
[is/is not] consistent with [clinical presentation]..."
--------------------------------------------------------------------------------
```

---

## 5. TOPOGRAPHIC MAP KEY IMAGES

> **Purpose**: Present the most clinically significant topographic maps as visual evidence for reported findings. Include maps for all measures with notable deviations.

### 5.1 Map Presentation Template

```
================================================================================
                     TOPOGRAPHIC MAP KEY IMAGES
================================================================================

Map Display Parameters:
Color Scale:     [ ] Z-Score (standard deviations from normative mean)
                 [ ] Raw Values (uV^2)
                 [ ] Percentile
Interpolation:   [ ] Spline  [ ] Linear  [ ] Other: _____
Projection:      [ ] 2D Top-down  [ ] 3D Head  [ ] Both
View:            [ ] Nose up  [ ] Nose left  [ ] Nose right

FIGURE 1: ABSOLUTE POWER TOPOGRAPHIC MAPS - EYES CLOSED
[Insert figure with all six band maps arranged in grid]
     Delta        Theta        Alpha        LoBeta       HiBeta       Gamma
[Map]        [Map]        [Map]        [Map]        [Map]        [Map]

Notable Features:
- [Describe key visual patterns, regional hotspots, asymmetries]

FIGURE 2: ABSOLUTE POWER TOPOGRAPHIC MAPS - EYES OPEN
[same structure]

FIGURE 3: RELATIVE POWER TOPOGRAPHIC MAPS - EYES CLOSED
[same structure]

FIGURE 4: RELATIVE POWER TOPOGRAPHIC MAPS - EYES OPEN
[same structure]

FIGURE 5: ASYMMETRY MAPS
[Left-Right asymmetry maps for key frequency bands]

FIGURE 6: COHERENCE MAPS (if included in surface analysis)
[Phase and coherence maps for key band/frequency pairs]

FIGURE 7: MEAN FREQUENCY MAPS
[Center of gravity / mean frequency maps]

FIGURE 8: MULTIVARIATE PROBABILITY MAPS
[Discriminant function / multivariate probability maps if applicable]
================================================================================
```

### 5.2 Map Interpretation Guide (For Clinician Reference)

```
--------------------------------------------------------------------------------
TOPOGRAPHIC MAP INTERPRETATION PRINCIPLES
--------------------------------------------------------------------------------

When interpreting topographic maps:

1. EXPECTED NORMAL PATTERNS:
   - Delta, Theta, and Beta: Relatively flat distribution across cortex
   - Alpha: Builds posteriorly, greatest over occipital regions
   - Overall: Should be approximately symmetrical left-right
   - Approximately 40% of individuals show low EEG amplitude under normal 
     conditions

2. ABNORMALITY INDICATORS:
   - Clustered deviations (multiple measures abnormal in same region)
   - Significant asymmetries (> 2 SD difference left-right)
   - Focal hotspots or cold spots
   - Diffuse/global deviations from expected patterns

3. REGION-FUNCTION ASSOCIATIONS:
   Frontal:    Executive function, planning, emotional regulation, motor control
   Temporal:   Auditory processing, memory, language, face recognition
   Parietal:   Spatial processing, attention, somatosensory integration
   Occipital:  Visual processing
   Central:    Sensorimotor integration

4. STATISTICAL INTERPRETATION:
   - Blue highlighted: Trends (-1.50 to -2.00 SD) - consider with caution
   - Red highlighted: Significant findings (beyond +/- 2.00 SD)
   - Clustered abnormalities suggest localized cortical dysfunction
   - Diffuse patterns suggest generalized disturbance
   - Statistical significance != Clinical significance (always correlate)
--------------------------------------------------------------------------------
```

---

## 6. CONNECTIVITY SUMMARY

> **Purpose**: Document functional connectivity findings including coherence, phase relationships, and network analyses. Connectivity measures reflect functional integration and differentiation between brain regions.

### 6.1 Connectivity Metrics Summary

```
================================================================================
                    CONNECTIVITY ANALYSIS SUMMARY
================================================================================

CONNECTIVITY METHOD: [ ] Surface Coherence  [ ] Phase Lag Index (PLI)
                    [ ] Lagged Coherence     [ ] Imaginary Coherence
                    [ ] Phase Synchrony      [ ] sLORETA Connectivity
                    [ ] Other: ___________________

FREQUENCY BANDS ANALYZED: [ ] All standard bands
                          [ ] Selected: ___________________

--------------------------------------------------------------------------------
SURFACE COHERENCE SUMMARY (Eyes Closed / Eyes Open)
--------------------------------------------------------------------------------

Connection Pair      | Band   | Coherence Z-Score | Phase Z-Score | Interpretation
---------------------|--------|-------------------|---------------|------------------
F3 - F4              | Theta  |                   |               |
F3 - F4              | Alpha  |                   |               |
F3 - F4              | Beta   |                   |               |
F3 - Fz              | Theta  |                   |               |
F3 - C3              | Alpha  |                   |               |
F4 - C4              | Alpha  |                   |               |
C3 - C4              | Theta  |                   |               |
C3 - C4              | Alpha  |                   |               |
C3 - C4              | Beta   |                   |               |
C3 - P3              | Alpha  |                   |               |
C4 - P4              | Alpha  |                   |               |
P3 - P4              | Alpha  |                   |               |
P3 - O1              | Alpha  |                   |               |
P4 - O2              | Alpha  |                   |               |
T3 - T4              | Theta  |                   |               |
F7 - T3              | Theta  |                   |               |
F8 - T4              | Theta  |                   |               |
T5 - O1              | Alpha  |                   |               |
T6 - O2              | Alpha  |                   |               |
[Additional pairs]   |        |                   |               |

CONNECTIVITY INTERPRETATION:
- Elevated coherence: Indicates reduced functional differentiation
- Reduced coherence: Indicates reduced functional connectivity
- Both conditions may relate to reduced speed and efficiency of 
  information processing
- Phase relationships provide information about directionality and 
  timing of information flow

NETWORK SUMMARY:
Intra-hemispheric coherence:  [ ] Normal  [ ] Elevated  [ ] Reduced
Inter-hemispheric coherence:  [ ] Normal  [ ] Elevated  [ ] Reduced
Long-range connectivity:      [ ] Normal  [ ] Elevated  [ ] Reduced
Local connectivity:           [ ] Normal  [ ] Elevated  [ ] Reduced

SIGNIFICANT CONNECTIONS (|Z| > 2.0):
Elevated coherence (> +2.0 SD):
- [List connections, bands, and Z-scores]

Reduced coherence (< -2.0 SD):
- [List connections, bands, and Z-scores]

Phase anomalies:
- [List significant phase deviations]
================================================================================
```

### 6.2 Connectivity Narrative

```
--------------------------------------------------------------------------------
CONNECTIVITY INTERPRETATION
--------------------------------------------------------------------------------

[Describe the overall connectivity profile:

1. HEMISPHERIC INTEGRATION: Assess the balance of inter-hemispheric vs.
   intra-hemispheric connectivity. Note any lateralized patterns.

2. NETWORK PATTERNS: Identify which functional networks show altered
   connectivity (e.g., Default Mode Network, Executive Network, Salience
   Network, Dorsal Attention Network).

3. FREQUENCY-SPECIFIC PATTERNS: Note which frequency bands show the most
   significant connectivity deviations.

4. CLINICAL RELEVANCE: Connect connectivity findings to clinical symptoms.
   For example, reduced prefrontal connectivity may relate to executive
   dysfunction; altered temporal connectivity may relate to memory or
   language difficulties.]
--------------------------------------------------------------------------------
```

---

## 7. SOURCE LOCALIZATION SUMMARY

> **Purpose**: Present source localization findings using inverse solution methods (LORETA/sLORETA/eLORETA/swLORETA). Source analysis estimates the intracortical generators of scalp EEG signals, providing improved spatial resolution.

### 7.1 Source Localization Parameters

```
================================================================================
               SOURCE LOCALIZATION ANALYSIS SUMMARY
================================================================================

METHOD: [ ] LORETA  [ ] sLORETA  [ ] eLORETA  [ ] swLORETA
        [ ] Other: ___________________

HEAD MODEL: [ ] 3-Sphere Spherical  [ ] Boundary Element Model (BEM)
           [ ] Finite Element Model (FEM)  [ ] Individual MRI
ATLAS:     [ ] MNI  [ ] Talairach  [ ] Other: ___________________
VOXEL RESOLUTION: _____ mm

TRANSFORM: [ ] Log10  [ ] Box-Cox  [ ] None  [ ] Other: ___________

NORMATIVE DATABASE: [ ] Yes - Source: ________________  [ ] No

BRODMANN AREA REFERENCE: Included in analysis
================================================================================
```

### 7.2 Source Localization Findings

```
================================================================================
               SIGNIFICANT SOURCE LOCALIZATION FINDINGS
================================================================================

Significance Threshold: [ ] Z > 2.0  [ ] Z > 2.5  [ ] Z > 3.0  [ ] p < 0.05

FINDINGS TABLE:

Region / BA               | Freq Band | Z-Score | Direction   | Associated Functions
--------------------------|-----------|---------|-------------|----------------------
[Example: BA 11 L]        | Theta     | +2.34   | Excess      | Executive, emotional
[Example: BA 38 L]        | Theta     | +2.89   | Excess      | Language, memory
[Example: BA 30 R]        | Delta     | -2.56   | Deficit     | Memory integration
[BA __ ]                  |           |         |             |
[BA __ ]                  |           |         |             |
[BA __ ]                  |           |         |             |
[BA __ ]                  |           |         |             |
[BA __ ]                  |           |         |             |

SUMMARY OF SOURCE FINDINGS:
[Provide narrative summary of most significant source deviations,
organized by lobe and clinical relevance]

FRONTAL REGIONS:
- [Summary of frontal source findings and associated Brodmann areas]

TEMPORAL REGIONS:
- [Summary of temporal source findings]

PARIETAL REGIONS:
- [Summary of parietal source findings]

OCCIPITAL REGIONS:
- [Summary of occipital source findings]

SUBCORTICAL / LIMBIC:
- [Summary of subcortical findings if available]
================================================================================
```

### 7.3 Source Connectivity (if performed)

```
================================================================================
               SOURCE CONNECTIVITY ANALYSIS (if applicable)
================================================================================

METHOD: [ ] Lagged Coherence  [ ] Other: ________________

NETWORK FINDINGS:
Network                     | Status          | Clinical Relevance
----------------------------|-----------------|---------------------------
Default Mode Network        | [ ] Normal      |
                            | [ ] Altered:    |
Executive Network           | [ ] Normal      |
                            | [ ] Altered:    |
Salience Network            | [ ] Normal      |
                            | [ ] Altered:    |
Dorsal Attention Network    | [ ] Normal      |
                            | [ ] Altered:    |
Ventral Attention Network   | [ ] Normal      |
                            | [ ] Altered:    |
Sensorimotor Network        | [ ] Normal      |
                            | [ ] Altered:    |
Central Autonomic Network   | [ ] Normal      |
                            | [ ] Altered:    |

SIGNIFICANT CONNECTION CHANGES:
[Describe most significant source-level connectivity findings]
================================================================================
```

---

## 8. FINDINGS TABLE (WITH EVIDENCE GRADES)

> **Purpose**: Present all significant findings in a structured, tabular format with evidence grades for each neuromarker finding. This section integrates all analyses into a unified clinical picture.

### 8.1 Evidence Grading System

```
================================================================================
                    EVIDENCE GRADING SYSTEM
================================================================================

For each neuromarker finding, evidence is graded on two dimensions:

A. STATISTICAL EVIDENCE (Strength of qEEG deviation):
   Grade S (Strong):    |Z| >= 2.50 SD - Marked deviation, high confidence
   Grade M (Moderate):  2.00 <= |Z| < 2.50 SD - Significant deviation
   Grade T (Trend):     1.50 <= |Z| < 2.00 SD - Possible deviation
   Grade N (Normal):    |Z| < 1.50 SD - Within normal range

B. CLINICAL EVIDENCE (Research support for clinical relevance):
   Grade A: Well-established neuromarker with strong research support
            (multiple RCTs, meta-analyses, clinical guidelines)
   Grade B: Moderate research support (some controlled studies, 
            consistent findings)
   Grade C: Emerging evidence (preliminary studies, case series)
   Grade D: Investigational (limited or contradictory evidence)

C. CONVERGENCE (Cross-measure confirmation):
   Grade H (High):    Finding supported by >= 3 independent measures
   Grade M (Medium):  Finding supported by 2 independent measures
   Grade L (Low):     Finding supported by single measure only

OVERALL EVIDENCE SCORE = Statistical x Clinical x Convergence
Example: S-A-H = Strong statistical deviation, well-established neuromarker, 
         high convergence (highest confidence finding)
================================================================================
```

### 8.2 Comprehensive Findings Table

```
================================================================================
              COMPREHENSIVE FINDINGS TABLE
================================================================================

#  | Finding                          | Region     | Band  | Z     | Evidence | Clinical Correlation
---|----------------------------------|------------|-------|-------|----------|----------------------
1  | [e.g., Excess theta power]       | L Frontal  | Theta | +2.34 | M-B-H    | [Link to symptoms]
2  | [e.g., Reduced alpha coherence]  | Inter-hem  | Alpha | -2.12 | M-A-M    | [Link to symptoms]
3  |                                  |            |       |       |          |
4  |                                  |            |       |       |          |
5  |                                  |            |       |       |          |
6  |                                  |            |       |       |          |
7  |                                  |            |       |       |          |
8  |                                  |            |       |       |          |
9  |                                  |            |       |       |          |
10 |                                  |            |       |       |          |

LEGEND:
Z = Z-score (standard deviations from normative mean)
Evidence = Statistical Grade-Clinical Grade-Convergence Grade
   Statistical: S=Strong, M=Moderate, T=Trend, N=Normal
   Clinical: A=Well-established, B=Moderate, C=Emerging, D=Investigational
   Convergence: H=High(3+), M=Medium(2), L=Low(1)

SUMMARY STATISTICS:
Total Findings:         _____
High Confidence (S-A/M-H): _____
Moderate Confidence:    _____
Trend Findings:         _____
Primary Regions Affected: _________________
Primary Bands Affected:   _________________
================================================================================
```

### 8.3 Neuromarker-Condition Reference Matrix

```
================================================================================
NEUROMARKER-CONDITION CORRELATION MATRIX (Evidence-Based)
================================================================================

This matrix indicates the degree to which identified neuromarkers have been
associated with specific clinical conditions in published research. It does NOT
diagnose - it provides contextual information for clinical integration.

Neuromarker Finding          | Condition Associations (Literature-Based)
-----------------------------|--------------------------------------------
Elevated frontal theta       | ADHD, depression, executive dysfunction,
                             | cognitive fatigue
-----------------------------|--------------------------------------------
Elevated theta/beta ratio    | ADHD (particularly pediatric), attentional
                             | difficulties, impulsivity
-----------------------------|--------------------------------------------
Reduced posterior alpha      | Anxiety, hypervigilance, sleep difficulties
-----------------------------|--------------------------------------------
Frontal alpha asymmetry      | Depression (left hypoactivation), approach/
                             | withdrawal tendencies
-----------------------------|--------------------------------------------
Elevated beta (frontal)      | Anxiety, rumination, hyperarousal, OCD
-----------------------------|--------------------------------------------
Reduced coherence (diffuse)  | TBI, cognitive decline, information processing
                             | difficulties
-----------------------------|--------------------------------------------
Elevated coherence (focal)   | Reduced functional differentiation, 
                             | seizure risk consideration
-----------------------------|--------------------------------------------
[Additional neuromarkers]    | [Associated conditions]

IMPORTANT: These associations are based on group-level research findings
and do not establish individual diagnosis. Clinical correlation is essential.
================================================================================
```

---

## 9. LIMITATIONS

> **Purpose**: Transparently document all factors that may limit the validity, reliability, or generalizability of the findings. Per ACNS guidelines: reports should be "complete and objective, enabling another electroencephalographer to arrive at a conclusion."

```
================================================================================
                         LIMITATIONS
================================================================================

A. METHODOLOGICAL LIMITATIONS:
   [ ] Data quality: [Describe any quality concerns - see QC Section 3]
   [ ] Recording duration: [Note if shorter than ideal]
   [ ] Patient state: [Note if drowsy, uncooperative, etc.]
   [ ] Medication effects: [List medications known to affect EEG]
   [ ] Artifact contamination: [Note persistent artifact types]

B. STATISTICAL LIMITATIONS:
   [ ] Normative database match: [Age/sex match quality]
   [ ] Database representation: [Note if patient demographics differ 
                                 significantly from database population]
   [ ] Multiple comparisons: [Note that multiple measures increase 
                             chance of Type I error]
   [ ] Statistical significance != clinical significance

C. CLINICAL LIMITATIONS:
   [ ] qEEG does not determine etiology
   [ ] qEEG does not diagnose medical or psychological conditions
   [ ] Findings should be integrated with comprehensive clinical assessment
   [ ] Individual results may not generalize from group-level research
   [ ] Medication effects may confound neuromarker interpretation
   [ ] Same qEEG pattern may be associated with multiple conditions

D. TECHNICAL LIMITATIONS:
   [ ] Source localization spatial resolution is limited (LORETA: ~7-10mm)
   [ ] Surface measures may reflect volume-conducted signals
   [ ] Inverse solutions have inherent mathematical assumptions
   [ ] EEG primarily reflects cortical activity; subcortical generators
       are poorly represented

E. SPECIFIC STUDY LIMITATIONS:
[Describe any study-specific limitations relevant to this case]

================================================================================
```

---

## 10. PROTOCOL IMPLICATIONS

> **Purpose**: Translate qEEG findings into actionable neurofeedback protocol recommendations. Per IQCB guidelines, recommendations should be "evaluated with caution and should only be considered as possible strategies."

### 10.1 Protocol Recommendation Framework

```
================================================================================
              NEUROFEEDBACK PROTOCOL IMPLICATIONS
================================================================================

RECOMMENDATION STATUS: 
[ ] Protocol recommendations appropriate based on findings
[ ] Caution advised - [reason]
[ ] Protocol recommendations deferred pending: _________________

PRIORITY FRAMEWORK:
Priority 1 (Address First):  [Condition-targeted protocols]
Priority 2 (Core Training):  [Primary qEEG deviations]
Priority 3 (Supportive):    [Secondary findings]
Priority 4 (Maintenance):    [Long-term optimization]

================================================================================
```

### 10.2 Specific Protocol Recommendations

```
================================================================================
           DETAILED PROTOCOL RECOMMENDATIONS
================================================================================

PROTOCOL 1: [Primary - Name/Description]
--------------------------------------------------------------------------------
Target:           [Electrode sites / Brodmann areas]
Frequency Band:   [e.g., 4-7 Hz down, 8-12 Hz up]
Modality:         [ ] Surface Neurofeedback (move toward Z=0)
                  [ ] Coherence Neurofeedback (move toward Z=0)
                  [ ] LORETA/sLORETA Neurofeedback (move toward Z=0)
                  [ ] Other: ________________
Reward/Criteria:  [Specific reward parameters, e.g., reward %, duration]
Rationale:        [Link to specific qEEG finding and evidence base]
Evidence Level:   [A/B/C/D per Section 8.1 grading]
Priority:         [1/2/3/4]
Cautions:         [Any contraindications or special considerations]
--------------------------------------------------------------------------------

PROTOCOL 2: [Secondary]
--------------------------------------------------------------------------------
Target:           
Frequency Band:   
Modality:         
Reward/Criteria:  
Rationale:        
Evidence Level:   
Priority:         
Cautions:         
--------------------------------------------------------------------------------

PROTOCOL 3: [Tertiary - if applicable]
--------------------------------------------------------------------------------
[Same structure]
--------------------------------------------------------------------------------

TRAINING ORDER RECOMMENDATIONS:
[If depression or poor mood/motivation is a concern, consider treating this
condition first through alpha frequency enhancement or other mood-targeted
biofeedback protocol before implementing other strategies.]

EXPECTED OUTCOMES:
[Describe realistic expectations for neurofeedback training based on the
identified deviations, typical course of treatment, and evidence base]

CONTRAINDICATIONS / CAUTIONS:
[List any conditions or factors that would modify or contraindicate the
recommended protocols]
================================================================================
```

### 10.3 Z-Score Targeting Summary (if applicable)

```
================================================================================
           Z-SCORE NEUROFEEDBACK TARGET SUMMARY
================================================================================

SURFACE Z-SCORE TARGETS:
Site    | Band       | Current Z | Target | Direction
--------|------------|-----------|--------|------------
        |            |           | 0      | Suppress / Enhance
        |            |           | 0      | Suppress / Enhance
        |            |           | 0      | Suppress / Enhance

COHERENCE Z-SCORE TARGETS:
Connection | Band    | Current Z | Target | Direction
-----------|---------|-----------|--------|------------
           |         |           | 0      | Increase / Decrease
           |         |           | 0      | Increase / Decrease

LORETA Z-SCORE TARGETS:
BA / Region | Band   | Current Z | Target | Direction
------------|--------|-----------|--------|------------
            |        |           | 0      | Suppress / Enhance
            |        |           | 0      | Suppress / Enhance

SCIENTIFIC SUPPORT LEVEL: [Determined by agreement between EEG results
and symptoms, plus available research evidence for the target condition]
================================================================================
```

---

## 11. PATIENT-FRIENDLY SUMMARY

> **Purpose**: Provide a plain-language summary that patients and families can understand. This section translates technical findings into accessible information about brain function.

```
================================================================================
                  YOUR BRAIN MAP SUMMARY
              [Plain-Language Version for Patient]
================================================================================

What is a qEEG Brain Map?
----------------------------
A qEEG (quantitative electroencephalogram) is a way to measure the electrical
activity in your brain. Think of it like an EKG for your heart, but for your
brain instead. We use small sensors on your scalp to record your brain's
natural electrical patterns, then compare them to patterns from people of the
same age and gender who don't have any known brain difficulties.

What We Found
----------------------------
[In 2-4 sentences using plain language, describe the overall findings.
Example: "Your brain map showed that some areas of your brain are working
harder than expected, while other areas may not be as active as they could be.
These patterns are often seen in people who have difficulty with [specific
symptoms]."]

What This Means for You
----------------------------
[Connect findings to the patient's specific symptoms and daily life.
Example: "The area at the front of your brain that helps with focus and
planning showed [excess/too little] activity. This may help explain some of
the difficulties you've been having with [specific symptom]."]

What Happens Next?
----------------------------
[Outline recommended next steps in accessible language:
- "Based on these findings, we recommend..."
- "Neurofeedback is a type of brain training that can help..."
- "We also suggest talking to your doctor about..."]

Important Notes
----------------------------
- This brain map does NOT diagnose any medical or psychological condition.
- It shows how your brain is functioning, not why it functions that way.
- These findings should be discussed with all members of your healthcare team.
- Brain patterns can change with treatment, including neurofeedback training.

Questions to Ask Your Provider
----------------------------
- How do these findings relate to my symptoms?
- What treatment options are available?
- How might neurofeedback help in my situation?
- Should I share this report with other healthcare providers?

If You Have Questions
----------------------------
Please contact [Provider Name] at [Contact Information]
================================================================================
```

---

## 12. CLINICIAN SIGN-OFF

> **Purpose**: Provide formal attestation of report authorship, review, and clinical responsibility. Per IQCB guidelines: "All interpretations must be thoroughly reviewed and signed by a qualified clinician (QEEG-D or QEEG-DL)."

```
================================================================================
                     CLINICIAN SIGN-OFF
================================================================================

REPORT AUTHORSHIP AND CERTIFICATION:

Primary Analyst:
Name: ___________________________________________________________
Credentials: ______________________________________________________
  [ ] QEEG-D (International QEEG Certification Board - Diplomate)
  [ ] QEEG-DL (International QEEG Certification Board - Diplomate Level)
  [ ] BCN (Board Certified in Neurofeedback)
  [ ] Licensed Healthcare Professional: ___________________________
  [ ] Other: _____________________________________________________
Institution/Practice: _____________________________________________
Contact: __________________________________________________________
Email: ____________________________________________________________
Phone: ____________________________________________________________

Date of Analysis: _________________________________________________
Date of Report: ___________________________________________________

SUPERVISOR / REVIEWER (if applicable):
Name: ___________________________________________________________
Credentials: ______________________________________________________
Review Date: ______________________________________________________

ELECTRONIC SIGNATURE:
[Digital signature block or printed name with date]

I certify that:
1. I have personally reviewed all raw EEG data included in this analysis
2. I have verified the quality control metrics and artifact rejection
3. I have reviewed all quantitative analyses presented in this report
4. The findings and interpretations represent my professional judgment
5. This report has been prepared in accordance with IQCB and ACNS guidelines
6. I have reviewed and approved the clinical recommendations
7. I understand that this report does not constitute a diagnosis

Signed: ___________________________  Date: _______________________

================================================================================
```

### 12.1 Report Distribution Record

```
--------------------------------------------------------------------------------
REPORT DISTRIBUTION:

Recipient                     | Role              | Date Sent | Method
------------------------------|-------------------|-----------|------------
[Referring clinician]         | Referrer          |           |
[Patient/Guardian]            | Patient           |           |
[Additional provider]         |                   |           |
[Medical records]             | File              |           |

REPORT VERSION HISTORY:
Version | Date       | Author     | Changes
--------|------------|------------|-------------------------------
1.0     | [Date]     | [Name]     | Initial report
[1.1]   | [Date]     | [Name]     | [If amended]
--------------------------------------------------------------------------------
```

---

## 13. EVIDENCE APPENDIX

> **Purpose**: Provide a comprehensive bibliography and evidence summary supporting the neuromarkers and clinical interpretations cited in this report.

### 13.1 Neuromarker Evidence Bibliography

```
================================================================================
                    EVIDENCE APPENDIX
================================================================================

SECTION A: QEEG METHODOLOGY AND STANDARDS
--------------------------------------------------------------------------------
1. Collura, T., Cantor, D., Chartier, D., et al. (2025). International QEEG 
   Certification Board Guideline: Minimum Technical Requirements for Performing 
   Clinical Quantitative Electroencephalography. Clinical EEG and Neuroscience.
   https://doi.org/10.1177/15500594241308654

2. Tatum, W.O., Selioutski, O., Ochoa, J.G., et al. (2016). American Clinical 
   Neurophysiology Society Guideline 7: Guidelines for EEG Reporting. Journal 
   of Clinical Neurophysiology, 33(4), 328-332.

3. IQCB Committee (2025). Summary of IQCB Recommended Guidelines for 
   Quantitative Electroencephalogram (QEEG) Report Writing. 
   International QEEG Certification Board.

4. Tenney, J.R., et al. (2021). Practice Guideline: Use of Quantitative EEG 
   for the Diagnosis of Mild Traumatic Brain Injury. Journal of Clinical 
   Neurophysiology, 38(4), 287-292.

5. Thatcher, R.W., et al. (2003). Quantitative EEG Normative Databases: 
   Validation and Clinical Correlation. Journal of Neurotherapy.

SECTION B: SPECTRAL ANALYSIS AND NORMATIVE DATABASES
--------------------------------------------------------------------------------
6. Thatcher, R.W., Walker, R.A., & Guidice, S. (1987). Human cerebral 
   hemispheres develop at different rates and ages. Science, 236, 1110-1113.

7. [ISB-NormDB or equivalent database reference]

8. John, E.R., et al. (1988). The neurophysiology of intelligence. In 
   "Machinery of the Mind" (John, E.R., Ed.).

SECTION C: SOURCE LOCALIZATION
--------------------------------------------------------------------------------
9. Pascual-Marqui, R.D. (1999). Review of methods for solving the EEG inverse 
   problem. International Journal of Bioelectromagnetism, 1, 75-86.

10. Pascual-Marqui, R.D., Esslen, M., Kochi, K., & Lehmann, D. (2002). 
    Functional imaging with low resolution brain electromagnetic tomography 
    (LORETA): Review, new comparisons, and new validation. Japanese Journal 
    of Clinical Neurophysiology, 30, 81-94.

SECTION D: CONNECTIVITY
--------------------------------------------------------------------------------
11. Pascual-Marqui, R.D. (2007). Discrete, 3D distributed, linear imaging 
    methods of electric neuronal activity. Part 1: exact, zero error localization.
    arXiv:0710.3341.

12. [Connectivity method-specific references]

SECTION E: NEUROMARKER-CONDITION ASSOCIATIONS
--------------------------------------------------------------------------------
[Patient-specific references based on findings]
- [ ] ADHD/Attention: ___________________________________________
- [ ] Depression/Mood: ___________________________________________
- [ ] Anxiety: ___________________________________________________
- [ ] TBI/Concussion: ____________________________________________
- [ ] Cognitive Decline: _________________________________________
- [ ] Sleep: _____________________________________________________
- [ ] Other: _____________________________________________________

SECTION F: NEUROFEEDBACK EFFICACY
--------------------------------------------------------------------------------
13. [Evidence level references per AAPB/ISNR guidelines]

================================================================================
```

### 13.2 Glossary of Terms

```
================================================================================
                    GLOSSARY OF TECHNICAL TERMS
================================================================================

Absolute Power:    The actual power (voltage squared, in uV^2) in the
                   patient's EEG at specific frequencies and locations.

Asymmetry:         Difference in EEG activity between homologous regions
                   of the left and right hemispheres.

Brodmann Area (BA): A region of the cerebral cortex defined by its
                   cytoarchitectonic (cellular) structure, numbered 1-52.

Coherence:         A measure of the correlation between EEG signals at
                   two different locations, reflecting functional 
                   connectivity and shared neural activity.

Connectivity:      The functional relationships between different brain
                   regions, measured through coherence, phase, or other
                   statistical relationships.

EEG:               Electroencephalogram - recording of electrical activity
                   of the brain via electrodes placed on the scalp.

Epoch:             A segment of EEG data (typically 2 seconds) used for
                   spectral analysis.

Inverse Problem:   The mathematical challenge of estimating the location
                   of brain electrical sources from scalp recordings.

LORETA:            Low Resolution Electromagnetic Tomography - a method
                   for estimating the 3D distribution of electrical
                   activity in the brain from scalp EEG.

Neuromarker:       A measurable brain activity pattern associated with
                   specific cognitive, emotional, or clinical states.

Neurofeedback:     A type of biofeedback that uses real-time displays of
                   brain activity to teach self-regulation.

Normative Database: A collection of EEG data from healthy individuals
                   used as a reference for comparing individual results.

Phase:             The timing relationship between EEG signals at 
                   different locations.

Posterior Dominant Rhythm (PDR): The dominant alpha frequency observed
                   over posterior regions during relaxed eyes-closed state.

QEEG:              Quantitative Electroencephalography - mathematical
                   analysis of EEG data, typically compared to normative
                   databases.

Relative Power:    The percentage of total power contained within a 
                   specific frequency band.

sLORETA:           Standardized LORETA - an improved version of LORETA
                   with exact, zero-error localization in noise-free
                   conditions.

Spectral Analysis: Decomposition of EEG signals into their frequency
                   components (delta, theta, alpha, beta, gamma).

Topographic Map:   A 2D or 3D visualization of EEG activity distributed
                   across the scalp surface.

Volume Conduction: The passive spread of electrical signals through
                   biological tissue, which can affect scalp-recorded EEG.

Z-Score:           A standardized score indicating how many standard
                   deviations a value is from the normative mean.
                   Z = (Individual Value - Normative Mean) / SD
================================================================================
```

---

## 14. KEY IMAGES APPENDIX

> **Purpose**: Provide a complete gallery of all clinically relevant images referenced in the report body.

### 14.1 Image Index

```
================================================================================
                    KEY IMAGES APPENDIX - INDEX
================================================================================

FIGURE A1:  Representative Raw EEG - Eyes Closed (segment)
FIGURE A2:  Representative Raw EEG - Eyes Open (segment)
FIGURE A3:  Raw EEG with Drowsiness Features (if present)
FIGURE A4:  Absolute Power Topographic Maps - Eyes Closed (all bands)
FIGURE A5:  Absolute Power Topographic Maps - Eyes Open (all bands)
FIGURE A6:  Relative Power Topographic Maps - Eyes Closed (all bands)
FIGURE A7:  Relative Power Topographic Maps - Eyes Open (all bands)
FIGURE A8:  Power Spectral Density Plots - Key Electrodes
FIGURE A9:  Asymmetry Index Maps - Key Bands
FIGURE A10: Coherence Topographic Maps - Key Bands
FIGURE A11: Phase Maps - Key Bands
FIGURE A12: Z-Score Tables - Absolute Power (full)
FIGURE A13: Z-Score Tables - Relative Power (full)
FIGURE A14: Z-Score Tables - Coherence (full)
FIGURE A15: Z-Score Tables - Phase (full)
FIGURE A16: LORETA/sLORETA Source Maps - Key Bands
FIGURE A17: LORETA/sLORETA Axial/Slice Views
FIGURE A18: Source Connectivity Maps (if performed)
FIGURE A19: Discriminant/Multivariate Analysis Maps (if applicable)
FIGURE A20: Neurofeedback Protocol Target Maps (if applicable)

ADDITIONAL FIGURES:
[Patient-specific additional images]

================================================================================
```

### 14.2 Image Display Standards

```
================================================================================
                    IMAGE DISPLAY STANDARDS
================================================================================

All images in this appendix should include:

1. PATIENT IDENTIFIER: Exam number or coded ID (not full name per HIPAA)
2. RECORDING CONDITION: Eyes Open / Eyes Closed / Task
3. DATE OF RECORDING
4. COLOR SCALE LEGEND: With Z-score values or raw value units
5. ORIENTATION MARKERS: Nose direction, left/right labels
6. ELECTRODE LABELS: Standard 10-20 or 10-10 labels visible
7. SOFTWARE VERSION: Analysis platform and version number
8. DATABASE REFERENCE: Normative database name and version

Z-SCORE COLOR STANDARD:
Dark Red (Hot):    Z <= -2.50  (Markedly elevated)
Red:               -2.50 < Z <= -2.00  (Significantly elevated)
Orange:            -2.00 < Z <= -1.50  (Trend elevated)
Green (Normal):    -1.50 < Z < +1.50  (Within normal range)
Yellow:            +1.50 <= Z < +2.00  (Trend reduced)
Blue:              +2.00 <= Z < +2.50  (Significantly reduced)
Dark Blue (Cold):  Z >= +2.50  (Markedly reduced)

Note: Color convention may vary by software platform. Verify direction.
================================================================================
```

---

## COMPLIANCE & REGULATORY NOTES

```
================================================================================
                 REGULATORY COMPLIANCE STATEMENTS
================================================================================

HIPAA COMPLIANCE:
This report contains Protected Health Information (PHI) as defined by the
Health Insurance Portability and Accountability Act (HIPAA). Distribution
is limited to authorized healthcare providers and the patient/guardian.

DISCLAIMER (REQUIRED - per IQCB Guidelines):
This qEEG report does not infer etiology or diagnose medical or 
psychological conditions, nor is it a substitute for medical or 
psychological evaluation. It is based on research linking neuromarkers 
with functional dysregulation. All findings should be integrated with a 
comprehensive clinical assessment by qualified healthcare professionals.

AI/ASSISTED ANALYSIS DISCLAIMER (if applicable):
[ ] No AI-assisted interpretation was used in this report.
[ ] AI-assisted tools were used for [specific purpose only]. All 
    interpretations, clinical correlations, and recommendations were 
    reviewed and approved by the signing clinician.

SCOPE OF PRACTICE:
All recommendations in this report are within the scope of practice of
the signing clinician. Recommendations for medical or pharmacological
intervention are referred to appropriately licensed physicians.

STANDARDS COMPLIANCE:
This report was prepared in accordance with:
- International QEEG Certification Board (IQCB) Report Writing Guidelines (2025)
- American Clinical Neurophysiology Society (ACNS) Guideline 7: Guidelines 
  for EEG Reporting (Tatum et al., 2016)
- ACNS Practice Guideline: Use of Quantitative EEG (Tenney et al., 2021)
- IQCB Minimum Technical Requirements for Performing Clinical QEEG (Collura 
  et al., 2025)

DATA RETENTION:
Raw EEG data and analysis files are retained per institutional policy
and applicable regulations. Minimum retention: 7 years (adult) / until
age of majority + 7 years (pediatric).
================================================================================
```

---

## REFERENCES (Report Template Methodology)

1. Collura, T., Cantor, D., Chartier, D., Crago, R., Hartzoge, A., Hurd, M., Kerson, C., Lubar, J., Nash, J., Prichep, L.S., Surmeli, T., Thompson, T., Tracy, M., & Turner, R. (2025). International QEEG Certification Board Guideline: Minimum Technical Requirements for Performing Clinical Quantitative Electroencephalography. *Clinical EEG and Neuroscience*. https://doi.org/10.1177/15500594241308654

2. IQCB Committee (Turner, R., van der Ryst, M., Prichep, L., Kerson, C., Tracy, M., Eure, J., Eichler West, R.) (2025). Summary of IQCB Recommended Guidelines for Quantitative Electroencephalogram (QEEG) Report Writing. International QEEG Certification Board.

3. Tatum, W.O., Selioutski, O., Ochoa, J.G., Munger Clary, H., Cheek, J., Drislane, F., & Tsuchida, T.N. (2016). American Clinical Neurophysiology Society Guideline 7: Guidelines for EEG Reporting. *Journal of Clinical Neurophysiology*, 33(4), 328-332. https://doi.org/10.1097/WNP.0000000000000319

4. Tenney, J.R., et al. (2021). Practice Guideline: Use of Quantitative EEG for the Diagnosis of Mild Traumatic Brain Injury: Report of the Guideline Committee of the American Clinical Neurophysiology Society. *Journal of Clinical Neurophysiology*, 38(4), 287-292.

5. Tatum, W.O. (2013). How to write an EEG report: Dos and don'ts. *Neurophysiologie Clinique*, 43(5-6), 341-347. (PMC3590044)

6. Pascual-Marqui, R.D. (2002). Standardized low-resolution brain electromagnetic tomography (sLORETA): technical details. *Methods and Findings in Experimental and Clinical Pharmacology*, 24(Suppl D), 5-12.

7. Thatcher, R.W., et al. (2005). Evaluation and validity of a LORETA normative EEG database. *Clinical EEG and Neuroscience*, 36(2), 116-122.

8. Hammond, D.C., et al. (2004). Standards for the Use of Quantitative Electroencephalography (QEEG) in Neurofeedback: A Position Paper. *Journal of Neurotherapy*, 8(1), 5-27.

9. Pascual-Marqui, R.D. (2007). Discrete, 3D distributed, linear imaging methods of electric neuronal activity. Part 1: exact, zero error localization. arXiv:0710.3341.

10. Thatcher, R.W., et al. (2003). Quantitative EEG Normative Databases: Validation and Clinical Correlation. *Journal of Neurotherapy*, 7(3&4), 87-122.

---

*Template Version: 1.0 | Based on IQCB 2025 Guidelines, ACNS Guideline 7, and*
*evidence-based clinical neurophysiology best practices.*
*This template is intended as a structured framework and should be adapted*
*to individual clinical contexts, scope of practice, and institutional requirements.*
