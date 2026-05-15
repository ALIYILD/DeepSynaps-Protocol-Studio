# QEEG Normative Model Governance Framework

## A Comprehensive Reference for Safe Interpretation, Database Selection, and Clinical Governance of Quantitative EEG Normative Comparisons

**Version:** 1.0  
**Classification:** Research & Clinical Governance Reference  
**Scope:** Normative database comparison, safe interpretation guidelines, pediatric norms, artifact limitations, licensing constraints, confidence intervals, and regulatory considerations for qEEG analysis.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Major Normative Databases: Detailed Comparison](#2-major-normative-databases-detailed-comparison)
3. [Age-Matched Norms & Stratification Methods](#3-age-matched-norms--stratification-methods)
4. [Pediatric Norms & Developmental Trajectories](#4-pediatric-norms--developmental-trajectories)
5. [Confidence Intervals & Statistical Thresholds](#5-confidence-intervals--statistical-thresholds)
6. [Artifact Limitations & Data Quality Requirements](#6-artifact-limitations--data-quality-requirements)
7. [Safe Interpretation Guidelines: "Below Normal" vs "Abnormal" Language](#7-safe-interpretation-guidelines-below-normal-vs-abnormal-language)
8. [Database Licensing Constraints & Access Requirements](#8-database-licensing-constraints--access-requirements)
9. [Database Update Frequency & Recalibration](#9-database-update-frequency--recalibration)
10. [Amplifier Matching & Technical Standardization](#10-amplifier-matching--technical-standardization)
11. [Gold Standard Checklist for Normative Database Evaluation](#11-gold-standard-checklist-for-normative-database-evaluation)
12. [Regulatory Status (FDA & International)](#12-regulatory-status-fda--international)
13. [Key References & Citations](#13-key-references--citations)

---

## 1. Executive Summary

Quantitative EEG (qEEG) normative databases provide statistical reference distributions against which an individual's EEG measures are compared. These databases form the backbone of modern clinical and research qEEG analysis. **No normative database is perfect; all are statistical references.** Adherence to scientific standards and mathematical rigor is essential for valid clinical application.

### Key Governance Principles

| Principle | Guidance |
|-----------|----------|
| **Statistical, Not Diagnostic** | qEEG normative comparisons indicate statistical deviation from a healthy reference population; they do **not** diagnose |
| **Complementary Tool** | qEEG is an adjunct to, not a substitute for, clinical EEG interpretation by trained professionals |
| **Artifact Sensitivity** | All normative comparisons depend critically on artifact-free data; contaminated data invalidates comparisons |
| **Age-Matched Required** | Norms must be age-matched; developmental trajectories span 2 months to 82+ years |
| **Amplifier Calibrated** | EEG hardware must be amplifier-matched to the specific normative database |
| **Cautious Language** | Use "below/above expected range" or "deviation from norms" rather than "abnormal" in isolation |

### Z-Score Reference Thresholds

| Z-Score Range | Population Percentile | Interpretation Category |
|---------------|----------------------|------------------------|
| -1.0 to +1.0 | ~68% | Within normal expected range |
| -1.5 to +1.5 | ~87% | Within typical expected range |
| -2.0 to +2.0 | ~95% (2.3% per tail) | Borderline deviation; review context |
| -2.5 to +2.5 | ~99% | Significant deviation from norms |
| -3.0 to +3.0 | ~99.7% (0.13% per tail) | Marked deviation; requires clinical correlation |
| > | 3.0 | <0.13% | Extreme deviation; strong clinical correlation required |

> **Critical Caveat on "Fat Tails":** EEG data distributions often deviate from ideal Gaussian (normal) distributions, exhibiting "fat tails" where extreme values occur more frequently than predicted. Research by Kustermann et al. (2023) demonstrates that a Z-score cut-off of 2 SD can inflate false positives by 32-96%, and a 3 SD cut-off can inflate false positives by over 1100% depending on the distribution parameters. Database providers should disclose skewness, kurtosis, and QQ-plots for all parameters.

---

## 2. Major Normative Databases: Detailed Comparison

### 2.1 NeuroGuide (Applied Neuroscience, Inc.)

| Attribute | Specification |
|-----------|--------------|
| **Also Known As** | University of Maryland (UM) / Thatcher Lifespan Normative EEG Database |
| **Developer** | Robert W. Thatcher, Ph.D.; Applied Neuroscience, Inc. |
| **Age Range** | 2 months to 82 years (lifespan database) |
| **Sample Size** | 625 (2003) → 678 (2008) → 727+ (ongoing additions) |
| **Children** | 458 subjects aged 6-16; 470 subjects aged 1-14 |
| **Conditions** | Eyes-closed (EC) and Eyes-open (EO) resting state |
| **Channels** | 19 (10-20 system) |
| **Reference Montages** | Linked ears, Average Reference, Current Source Density (CSD/Laplacian) |
| **Metrics** | Absolute power, Relative power, Amplitude Asymmetry, Coherence, Phase, Ratios, Peak Frequency |
| **Source Analysis** | LORETA / sLORETA / swLORETA normative databases available |
| **Frequency Range** | 0.5-30 Hz (standard); up to 40+ Hz for some analyses |
| **Age Grouping** | 22 age groups with sliding 2-year averages (6-month overlap) |
| **Deartifacting** | Manual + automatic editing tools |
| **FDA Status** | 510(k) cleared (K041263) |
| **Peer Review** | Extensively published (Thatcher et al., 1987, 2003, 2009, 2010) |
| **Key Strength** | Longest history (since 1979), most extensively validated, largest pediatric coverage, excellent age stratification |
| **Key Limitation** | Smaller adult sample size (N~155 for ages 14-83); requires 10-year adult age groups with 5-year overlap |

**Database Construction Methodology:**
- Subjects recruited 1979-1987; additional adults added 2000 and ongoing
- Rigorous inclusion/exclusion criteria: no neurological/psychiatric history, no head injury with cerebral symptoms, no psychotropic medication, grade-appropriate academic performance
- Gaussian approximation via log10 transforms to reduce skewness and kurtosis
- Leave-one-out cross-validation performed for all age groups
- Clinical correlation with neuropsychological test scores (content validation)
- Discriminant analysis and neural network validation (predictive validation)

**Licensing Model:** Commercial software license; per-use and subscription options available. Amplifier matching file required for each EEG hardware system.

---

### 2.2 BrainDx (BrainDx LLC / formerly NXLink-NYU / ANI)

| Attribute | Specification |
|-----------|--------------|
| **Origin** | Based on the original Neurometrics database (E. Roy John) |
| **Developer** | BrainDx LLC (formerly Neuro-Diagnostics, Inc.) |
| **Age Range** | 16-80 years |
| **Sample Size** | 464 subjects |
| **Children** | 310 subjects aged 16 and under (historically); primary focus 16+ |
| **Conditions** | Eyes-closed (EC) and Eyes-open (EO) resting state |
| **Channels** | 19 (10-20 system) |
| **Reference** | Linked-ear reference |
| **Metrics** | Absolute power, Relative power, Mean frequency, Intra- and inter-hemispheric symmetry, Intra- and inter-hemispheric coherence |
| **FDA Status** | 510(k) cleared (historically, through Neurometrics lineage: K974748) |
| **Key Strength** | FDA-cleared lineage, discriminant functions for clinical conditions (ADHD, depression, schizophrenia, autism, TBI, dementia, PTSD) |
| **Key Limitation** | Does not cover pediatric ages below ~6 years; smaller overall sample; adult-focused |

**Database Construction Methodology:**
- Manual deartifacting performed
- Based on original Neurometrics database developed 1970s-1980s
- Participant exclusion: head injury, neurological/psychiatric disorders, psychological problems, alcohol/drug abuse, psychotropic medication, academic/social problems
- FDA 510(k) clearance received July 1998 (K974748)

**Licensing Model:** Used primarily through BEE Medic's Cygnet software for Z-score neurofeedback. Subscription-based pricing. BrainDx provides discriminant analysis functions for clinical classification.

---

### 2.3 HBI Database (HBImed AG)

| Attribute | Specification |
|-----------|--------------|
| **Full Name** | Human Brain Index (HBI) Reference Database |
| **Developer** | HBImed AG (Switzerland) |
| **Age Range** | 7-17 years (children/adolescents), 18-60 years (adults), 61+ years (seniors) |
| **Sample Size** | 1,000 total (300 children, 500 adults, 200 seniors) |
| **Conditions** | EC resting, EO resting, **plus 5 active tasks**: GO/NOGO (2 variants), arithmetic task, reading task, auditory recognition, auditory oddball |
| **Channels** | 19+ (multi-channel) |
| **Metrics** | EEG spectra (absolute/relative power), ERP components, Event-related desynchronization, Coherence |
| **Deartifacting** | Automatic artifact removal |
| **FDA Status** | Referenced in FDA-registered systems |
| **Key Strength** | Only major database with active task conditions (not just resting state); strong ERP normative data; comprehensive task battery |
| **Key Limitation** | Data collected in the 1990s; no subjects below age 7; limited peer-reviewed publications compared to NeuroGuide; smaller senior sample |

**Database Construction Methodology:**
- Data collected in the 1990s
- Inclusion criteria: uneventful perinatal period, no head injury with cerebral symptoms, no neurological/psychiatric disease history, no convulsions, normal mental and physical development, average or better school grades
- Normalized QEEG characteristics with mean and standard deviations for separate age groups
- ERP components decomposed into independent components associated with psychological operations

**Licensing Model:** Commercial license through HBImed. Includes database software, security dongle, and access credits (100 free accesses included). Requires WinEEG advanced software for analysis.

---

### 2.4 qEEG-Pro Database (qEEG-Pro B.V.)

| Attribute | Specification |
|-----------|--------------|
| **Developer** | qEEG-Pro B.V. (Netherlands) |
| **Age Range** | 6-82 years |
| **Sample Size** | 1,482 (EC) / 1,232 (EO) |
| **Conditions** | Eyes-closed (EC) and Eyes-open (EO) resting state |
| **Channels** | 19 (10-20 system) |
| **Sampling Rate** | 128 Hz (8%) and 256 Hz (92%) |
| **Reference** | Linked-ear |
| **Metrics** | Absolute power, Relative power, Coherence, Amplitude Asymmetry, Phase |
| **Deartifacting** | Automatic artifact filtering (client-side progressive approach) |
| **FDA Status** | FDA registered (K171414) |
| **Key Strength** | Large sample size; client-side progressive database (incorporates new individuals); automatic deartifacting; good age coverage |
| **Key Limitation** | Does not cover ages below 6 years; relatively newer with fewer independent validation studies than NeuroGuide |

**Database Construction Methodology:**
- Data collected 2004-2013
- Client-based approach: progressively incorporates new individuals through automatic artifact filtering
- Stratified by age bands with means and standard deviations computed per band
- Gaussian cross-validation performed

**Licensing Model:** Commercial license. Client-based installation with progressive updates.

---

### 2.5 ISB-NormDB (Korean Reference Database)

| Attribute | Specification |
|-----------|--------------|
| **Developer** | Institute for Science of Brain Dynamics |
| **Age Range** | 4.5-81 years |
| **Sample Size** | 1,289 subjects (553M / 736F) |
| **Conditions** | Resting state |
| **Channels** | 19 (10-20 system) |
| **Sampling Rate** | 250 Hz |
| **Reference** | Linked-ear |
| **FDA Status** | KFDA (Korea FDA) approved |
| **Key Innovation** | **First database to simultaneously control for both age AND sex**; includes gamma band norms (not available in most legacy databases) |
| **Modeling Method** | Generalized Additive Models (GAM) using spline method - continuous curve fitting rather than age bins |

**Database Construction Methodology:**
- Four strict standards of normality for subject selection
- Minimizes influence of race/ethnic factors
- Uses nonlinear regression (GAM with splines) instead of age-band stratification
- Log transformation for distribution bias correction
- Presents gamma band standardized distributions (methodological advance)
- Cross-validated across wide age range; high correlation with other databases

---

### 2.6 Side-by-Side Database Comparison

| Feature | NeuroGuide | BrainDx | HBI | qEEG-Pro | ISB-NormDB |
|---------|-----------|---------|-----|----------|------------|
| **Age Range** | 2 mo - 82 yr | 6-90 yr (primarily 16+) | 7-17, 18-60, 61+ | 6-82 yr | 4.5-81 yr |
| **Total N** | 727+ | 464 | 1,000 | 1,482 EC / 1,232 EO | 1,289 |
| **Pediatric Coverage** | Excellent (2 mo+) | Limited (6+ yr) | Good (7-17 yr) | Moderate (6+ yr) | Good (4.5+ yr) |
| **Resting Conditions** | EC + EO | EC + EO | EC + EO | EC + EO | EC + EO |
| **Active Tasks** | No | No | **Yes (5 tasks)** | No | No |
| **ERP Norms** | Yes (P300) | Limited | **Yes (extensive)** | No | No |
| **Source Analysis** | LORETA/sLORETA | No | No | No | No |
| **Reference Montages** | Linked, Avg, CSD | Linked-ear | Multi | Linked-ear | Linked-ear |
| **FDA Cleared** | **Yes** | **Yes** | Referenced | **Yes** | KFDA |
| **Peer Reviewed** | Extensive | Moderate | Limited | Moderate | Yes |
| **Gamma Band** | Limited | No | No | No | **Yes** |
| **Sex-Controlled** | Age only | Age only | Age only | Age only | **Age + Sex** |
| **Update Model** | Periodic additions | Periodic | Static (1990s) | Progressive | Periodic |

---

## 3. Age-Matched Norms & Stratification Methods

### 3.1 Why Age-Matching Is Critical

EEG changes profoundly across the lifespan. Failure to use age-matched norms produces systematic errors:

| Life Stage | Key EEG Characteristics |
|------------|------------------------|
| **Infancy (0-12 mo)** | PDR emerges at 3-4 Hz by 2 months; reaches 5-7 Hz by 12 months; asynchronous sleep spindles |
| **Toddler (1-3 yr)** | PDR reaches ~8 Hz by age 3; prominent theta/delta; mu rhythm develops |
| **Preschool (3-6 yr)** | Theta remains in background; PDR 8-9 Hz by 5-8 years; posterior slow waves of youth |
| **School Age (6-12 yr)** | PDR 9-10 Hz by age 10; alpha rhythm amplitude peaks 6-9 years; adult range by 12-13 |
| **Adolescence (13-18 yr)** | PDR reaches adult range (8-12 Hz); minimal alpha frequency 8.5 Hz by age 16 |
| **Young Adult (18-40 yr)** | Stable adult patterns; peak alpha ~10 Hz |
| **Middle Age (40-60 yr)** | Gradual slowing; alpha peak frequency begins slight decline |
| **Senior (60+ yr)** | Progressive slowing; increased theta/delta; alpha peak frequency decreases toward 8 Hz |

### 3.2 Age Stratification Methods

Two primary methods are used for constructing age-dependent norms:

**Method 1: Age Stratification (Non-Overlapping/Overlapping Bins)**
- Subjects grouped into discrete age bins
- Mean and SD computed per bin
- Used by: NeuroGuide (22 overlapping age groups), HBI, qEEG-Pro, most legacy databases
- **Pros:** Direct computation; captures developmental spurts
- **Cons:** "Jumps" at bin boundaries; lower time resolution

**Method 2: Polynomial/Curve-Fit Regression**
- Continuous regression across age
- Used by: ISB-NormDB (GAM splines), some implementations
- **Pros:** Smooth transitions; no boundary jumps
- **Cons:** May miss developmental spurts (language at 5-7, formal operations at 9-11, puberty at 11-14); accounts for smaller % of variance

### 3.3 NeuroGuide Age Group Structure (Example)

NeuroGuide uses **22 age groups** with 2-year sliding averages and 6-month overlap:

- Ages 0.5-5.99: 5 groups (high density for rapid developmental change)
- Ages 6-9.99: 2 groups
- Ages 10-12.99: 1 group
- Ages 13-15.99: 1 group
- Ages 16-Adult: Fine-grained adult groups
- Adults: Expanded 10-year groups with 5-year overlap (reduced jumps of ~0.5 SD)

---

## 4. Pediatric Norms & Developmental Trajectories

### 4.1 Developmental EEG Milestones

| Age | Posterior Dominant Rhythm | Key Features |
|-----|--------------------------|--------------|
| 2 months | 3-4 Hz | PDR established |
| 6 months | 4-5 Hz | Sleep spindles developing (often asynchronous) |
| 12 months | 5-7 Hz | V-waves and K-complexes developed |
| 2 years | ~7 Hz | Mu rhythm develops; beta emerges |
| 3 years | ~8 Hz | Sleep spindles should be synchronous |
| 5-6 years | 8-9 Hz | Theta still in background; posterior slow waves of youth |
| 8 years | 8-9 Hz | PDR well-established |
| 10 years | 9-10 Hz | |
| 12-13 years | 8-12 Hz (adult range) | |
| 16+ years | >= 8.5 Hz minimum | |

### 4.2 Pediatric Amplitude Norms

| Source | Age | Amplitude (eyes open) |
|--------|-----|----------------------|
| Hagne (1968) | First months | 10-20 uV |
| Hagne (1968) | 6-12 months | 20-40 uV |
| Pampiglione (1972) | 3 months (passive eye closure) | 50-100 uV |
| Pampiglione (1972) | 9 months | 100-200 uV |
| Pampiglione (1972) | 2 years | 50-80 uV |

- Alpha rhythm amplitude **peaks between 6-9 years**, then declines
- Average alpha amplitude ages 3-15: **56 uV** (90% range: 30-100 uV)
- Alpha amplitude <20 uV **not seen in normal children**
- Wave-to-wave variation in first year: 30-100 uV; occasional waves up to 200 uV

### 4.3 Alpha Asymmetry in Children

- Alpha amplitude tends to be **higher on the right** (Corbin & Bickford, 1955; Cornil & Gastaut, 1947)
- Alpha asymmetry present in **nearly all children** (Petersen & Eeg-Olofsson, 1971)
- Amplitude asymmetry >20% seen in only **5%** of children
- **No correlation with handedness**

### 4.4 Special Pediatric Considerations

| Consideration | Guidance |
|---------------|----------|
| **Rapid Development** | Pediatric EEG changes more rapidly than adult; 1-year age groups are ideal for ages 2-15 |
| **Hypnagogic Hypersynchrony** | High-voltage delta/sharp activity during drowsiness is normal in ages 2-4; do not misinterpret as pathology |
| **Posterior Slow Waves of Youth** | Occipital slow waves intermixed with alpha are normal; may persist into late 20s |
| **Hyperventilation Response** | Prominent slow-wave buildup during HV is normal in children; available from ~3 years of cooperation |
| **Sample Size Needs** | Pediatric norms require larger samples per age group due to rapid developmental change |
| **Sleep vs. Wake** | Norms must specify state; sleep and wake EEG differ dramatically in children |

### 4.5 Czada / Amplitude-Integrated EEG Pediatric Reference Values

For amplitude-integrated EEG (aEEG) in children aged 2 months to 16 years (MacDarby et al., 2022; Czada et al., 2022):

| Age Group | Upper/Lower Awake | Upper/Lower Asleep |
|-----------|-------------------|-------------------|
| **< 6 years** | 38 uV / 7 uV | 54 uV / 10 uV |
| **> 6 years** | 33 uV / 5 uV | 36 uV / 6 uV |

- aEEG amplitudes **increase over first 2 years** then diminish
- Amplitudes greater during sleep for children <6 years
- Upper and lower margin amplitudes and bandwidth are age- and state-dependent
- 10th percentile lower margin >5 uV across all ages (continuous normal voltage)

---

## 5. Confidence Intervals & Statistical Thresholds

### 5.1 Standard Z-Score Thresholds

| Threshold | Z-Score | Percentile (Expected) | Clinical Convention |
|-----------|---------|----------------------|---------------------|
| **Mild** | +/- 1.0 to 1.5 | 68-87% | Within expected range |
| **Moderate** | +/- 1.5 to 2.0 | 87-95% | Borderline; monitor |
| **Significant** | +/- 2.0 to 2.5 | 95-99% | Deviation from norms |
| **Marked** | +/- 2.5 to 3.0 | 99-99.7% | Significant deviation |
| **Extreme** | > +/- 3.0 | > 99.7% | Extreme deviation |

### 5.2 The "Fat Tails" Problem

EEG spectral power distributions frequently deviate from Gaussian (normal) distributions. This has critical implications:

**Key Findings from Kustermann et al. (2023):**
- Even slight deviations from Gaussian distribution cause **dramatic inflation** in "abnormal" classifications
- Cut-off at 2 SD: **32-96% inflation** in false positives vs. expected Gaussian rate
- Cut-off at 3 SD: **>1100% inflation** in false positives
- Skewness and kurtosis values alone are insufficient to characterize distributions
- The error in estimating variance is amplified exponentially at tails

**Mitigation Strategies:**
1. Database providers should disclose: skewness, kurtosis, confidence intervals, and QQ-plots for ALL parameters
2. Consider percentile-based cut-offs (95th/99th percentiles) instead of SD-based cut-offs
3. Use Shapiro-Wilk tests and visual QQ-plot inspection
4. Apply appropriate log-transforms to approximate Gaussian distributions
5. Report measurement uncertainty with all normative comparisons

### 5.3 Multiple Comparisons Problem

A full 19-channel qEEG analysis examines **1,200+ measures** across frequency bands, channels, and metrics.

| Statistic | Value |
|-----------|-------|
| Total measures (19 ch, linked ears) | ~1,200+ |
| Expected "abnormal" at 2 SD by chance alone | ~5% of measures = ~60 measures |
| Expected "abnormal" at 3 SD by chance alone | ~0.3% of measures = ~3-4 measures |

**Mitigation:**
- Use non-parametric statistics to estimate Type I and Type II errors
- Apply Bonferroni or FDR corrections for multiple comparisons
- Consider spatial clustering: isolated single-channel deviations are less clinically meaningful than regional patterns
- Require **convergence across multiple metrics** for clinical significance

### 5.4 Test-Retest Reliability

| Parameter | Expected Reliability |
|-----------|---------------------|
| Split-half reliability | >0.85 for adequate quality; >0.90 preferred |
| Eyes-open reliability | Typically slightly lower than eyes-closed |
| Inter-session reliability | Varies by frequency band (alpha typically most reliable) |
| Minimal clinically important change | Generally >0.5 SD change for pre-post comparison |

> **Note:** NeuroGuide reports split-half reliability per channel. Values <0.80 indicate insufficient data quality for reliable normative comparison.

---

## 6. Artifact Limitations & Data Quality Requirements

### 6.1 Critical Principle: "Garbage In, Garbage Out"

**All normative database comparisons are INVALID if the EEG data contains artifact.** Artifact contamination is the single largest source of error in qEEG analysis.

### 6.2 Required Data Quality Standards

| Standard | Minimum Requirement | Preferred |
|----------|-------------------|-----------|
| **Recording duration (EC)** | 3 minutes artifact-free | 5+ minutes |
| **Recording duration (EO)** | 3 minutes artifact-free | 5+ minutes |
| **Total recording time** | 20 minutes (10 EC + 10 EO) | 20+ minutes |
| **Artifact-free harvest** | 2-5 minutes total | 5+ minutes per condition |
| **Sampling rate** | 128 Hz minimum | 256 Hz |
| **Impedance** | <10 kOhm (5 kOhm preferred) | <5 kOhm |
| **Split-half reliability** | >0.80 | >0.90 |
| **Electrode count** | 19 channels (10-20 system) | 19+ for surface; 32+ for source analysis |

### 6.3 Artifact Types and Their Impact on Normative Comparisons

| Artifact Type | Impact on qEEG | Mitigation |
|---------------|----------------|------------|
| **Eye blinks** | Frontal delta/theta inflation; coherence distortion | ICA removal, regression, manual deselection |
| **Eye movements (horizontal)** | Frontal-temporal contamination | EOG channels, ICA |
| **Muscle (EMG)** | Broad-spectrum beta/gamma inflation; most dangerous artifact | High-frequency filtering, manual deselection, ICA |
| **Cardiac (ECG)** | Occasional low-frequency contamination | ECG channel, ICA |
| **Movement (head/body)** | Broad-spectrum distortion | Motion sensors, manual deselection |
| **Drowsiness/sleep** | Theta/delta inflation; alpha dropout | State monitoring, re-recording |
| **Electrode pop/loose** | Spike artifacts; single-channel distortion | Impedance checking, re-gelling |
| **60/50 Hz line noise** | Power line frequency contamination | Notch filter, shielding |

### 6.4 Artifact Removal Methods: Strengths and Limitations

| Method | Strengths | Limitations |
|--------|-----------|-------------|
| **Manual Deselection** | Expert judgment; preserves EEG context | Time-consuming; subjective; inter-rater variability |
| **Threshold Rejection** | Automated; consistent | Discards valuable data; may miss subtle artifacts |
| **ICA (Independent Component Analysis)** | Separates multiple artifact types | Requires >19 channels ideally; may remove neural signals; computationally intensive |
| **Regression (EOG/ECG)** | Effective for ocular/cardiac | Requires reference channels; bidirectional contamination risk |
| **Wavelet Decomposition** | Channel-level artifact removal | Requires base function selection; computationally intensive |
| **Automatic Pipelines (AutoReject, etc.)** | Scalable; reproducible | Requires calibration; may be overly aggressive; dataset-specific |

### 6.5 Recording Best Practices for Normative Comparison

1. **Record EO before EC** to minimize drowsiness contamination
2. **Monitor vigilance** throughout recording; drowsiness invalidates normative comparison
3. **Check impedances** before and during recording
4. **Minimize EMG** - ensure relaxed jaw, neck, forehead
5. **Minimize eye movements** - instruct patient to fixate during EO, relax eyes during EC
6. **Maintain consistent state** - normative databases reflect awake, alert, resting states
7. **Document conditions** - any deviation from standard protocol affects interpretability

### 6.6 Warning: NeuroGuide Artifact Statement

> "EEG artifact can invalidate analyses and improper positioning of electrodes or significant deviations from accepted standards of electroencephalographic recording methodology can invalidate EEG recordings." — NeuroGuide Manual, Appendix A

---

## 7. Safe Interpretation Guidelines: "Below Normal" vs "Abnormal" Language

### 7.1 Core Principle: qEEG Describes Statistical Deviation, Not Pathology

A normative database comparison indicates how an individual's EEG **statistically deviates** from a healthy reference population. It does **not** indicate disease, disorder, or pathology. The language used in reports must reflect this fundamental limitation.

### 7.2 Recommended Safe Language Framework

| Z-Score Range | UNSAFE Language | SAFE Language |
|---------------|----------------|---------------|
| -1.0 to +1.0 | "Normal" | "Within expected range for age" |
| -1.5 to +1.5 | "Normal" | "Within typical range" |
| -2.0 to -2.5 | "Abnormal" | "Below expected range" / "Decreased relative to norms" |
| +2.0 to +2.5 | "Abnormal" | "Above expected range" / "Increased relative to norms" |
| -2.5 to -3.0 | "Pathological" | "Significantly below expected range" |
| +2.5 to +3.0 | "Pathological" | "Significantly above expected range" |
| > | 3.0 | "Severely abnormal" | "Marked deviation from age-matched norms" |

### 7.3 Mandatory Report Disclaimers

**Every qEEG normative comparison report MUST include:**

> "This quantitative EEG analysis compares the patient's EEG measures to a normative reference database of healthy individuals matched for age. Results indicate statistical deviation from the reference population and should be interpreted in the context of the patient's complete clinical presentation, history, and other diagnostic evaluations. qEEG normative comparisons are not diagnostic and do not replace clinical EEG interpretation by a qualified professional."

**Additional Required Statements:**

1. **For Z-scores between -2 and +2:**
   > "Values within the range of +/- 2 standard deviations from the mean are expected to occur in approximately 95% of the healthy population and should be interpreted cautiously."

2. **For isolated single deviations:**
   > "Isolated deviations in single channels or single frequency bands may represent normal variation. Clinical significance increases when deviations converge across multiple channels, frequency bands, and metrics."

3. **For pediatric cases:**
   > "Pediatric EEG undergoes rapid developmental change. Normative comparisons must be interpreted with awareness that developmental trajectories vary across individuals. Clinical correlation with developmental history and behavioral observations is essential."

4. **For any clinical decision:**
   > "This analysis is intended as an adjunct to, not a replacement for, comprehensive clinical assessment. No clinical decisions should be based solely on qEEG normative comparisons."

### 7.4 "Below Normal" vs "Abnormal": Language Guidance

| Context | Recommended Terminology |
|---------|------------------------|
| **Decreased power** | "Below the expected range" / "Reduced relative to age-matched norms" / "Lower than typical for age" |
| **Increased power** | "Above the expected range" / "Elevated relative to age-matched norms" / "Higher than typical for age" |
| **Regional pattern** | "[Region] shows [frequency] activity that deviates from the expected range for age" |
| **Overall summary** | "Statistical deviations from the normative database are present in [regions/frequencies]. Clinical correlation is recommended." |

**AVOID:**
- "Abnormal EEG" (too broad)
- "Pathological" (diagnostic claim)
- "Brain damage" (unsupported by qEEG alone)
- "Dysfunction" (implies mechanism not measured)
- "Disorder" (diagnostic claim)
- "The patient has..." (diagnostic claim)

**USE INSTEAD:**
- "Statistically deviates from norms"
- "Below/above the expected range"
- "Decreased/increased relative to age-matched reference"
- "Consistent with patterns reported in [condition] literature" (when correlating with clinical findings)

### 7.5 Condition-Specific Wording Examples

| Context | Safe Interpretation Language |
|---------|------------------------------|
| **Elevated frontal theta** | "Absolute theta power in frontal regions is above the expected range for age. This pattern has been reported in the ADHD literature (Barry et al., 2003; Loo, 2012) but is not specific to any single condition. Clinical correlation with attention and behavioral measures is recommended." |
| **Reduced alpha coherence** | "Inter-hemispheric alpha coherence is below the expected range. Reduced coherence has been associated with various conditions affecting white matter integrity. Correlation with neuropsychological assessment and structural imaging is recommended." |
| **Generalized delta elevation** | "Elevated delta activity is present across multiple regions, above the expected range for age. Waking delta is typically associated with slow-wave sleep; during wakefulness, increased delta may reflect drowsiness, medication effects, or neurological factors. Assessment of recording state and clinical correlation is essential." |

---

## 8. Database Licensing Constraints & Access Requirements

### 8.1 Licensing Models by Database

| Database | Licensing Model | Key Constraints |
|----------|----------------|----------------|
| **NeuroGuide** | Commercial software license; perpetual + subscription options | Amplifier matching file required per hardware; annual update subscription for latest versions; per-use fees for some features |
| **BrainDx** | Subscription-based (via Cygnet/BEE Medic) | Ongoing subscription required for database access; bundled with Z-score neurofeedback software |
| **HBI** | Commercial license with hardware dongle | 100 free database accesses included; additional access credits required; requires WinEEG advanced software |
| **qEEG-Pro** | Commercial license; client-based installation | Progressive database updates included; requires compatible amplifier |
| **ISB-NormDB** | Research/academic licensing | Primarily available through Korean institutions; KFDA regulated |

### 8.2 General Licensing Constraints

1. **Amplifier Matching Requirement:** Each EEG amplifier must be individually matched/calibrated to the normative database. Without amplifier matching, all Z-score comparisons are **potentially invalid**. This matching is performed by the database manufacturer.

2. **Hardware Compatibility:** Not all EEG amplifiers are compatible with all normative databases. Compatibility must be verified before clinical use.

3. **Software Lock:** Most databases require proprietary software for analysis (dongle, subscription authentication, or hardware-locked licenses).

4. **Updates:** Database updates may be included in subscription or require separate purchase. Staying current with updates is recommended.

5. **Multi-User vs. Single-User:** Licenses may be restricted to specific computers or users. Site licenses are available for most databases.

6. **Copyright:** Database contents (means, standard deviations) are proprietary and may not be redistributed or used in third-party software without license.

### 8.3 Usage Restrictions

| Restriction | Rationale |
|-------------|-----------|
| **Qualified professionals only** | qEEG requires trained clinical interpretation |
| **Not for standalone diagnosis** | Must be used adjunctively with clinical assessment |
| **Amplifier must be matched** | Ensures valid microvolt comparisons |
| **Artifact-free data required** | Contaminated data produces invalid Z-scores |
| **Age must be specified** | Activates appropriate age-matched norms |
| **Montage must match database** | Different references produce different Z-scores |

---

## 9. Database Update Frequency & Recalibration

### 9.1 Historical Update Patterns

| Database | First Collection | Major Updates | Update Frequency |
|----------|-----------------|---------------|-----------------|
| **NeuroGuide** | 1979-1987 | 2000 (+53 adults), 2008, 2013 (+adult subjects) | Periodic additions; continuous sliding average refinement |
| **BrainDx** | 1970s-1980s | Periodic updates through Neurometrics lineage | Periodic |
| **HBI** | 1990s | None reported (static database) | Static |
| **qEEG-Pro** | 2004-2013 | Progressive client-side additions | Progressive (ongoing) |
| **ISB-NormDB** | 2014-2019 | Initial release | Periodic |

### 9.2 Amplifier Recalibration

Amplifiers should be recalibrated when:
- New amplifier hardware is purchased
- Amplifier firmware is updated
- Filters are modified
- After significant hardware repair
- When switching between normative databases

### 9.3 Best Practices for Database Currency

1. **Use the most recent database version** available for your license
2. **Verify amplifier matching** is current and documented
3. **Document the database version** used in every report
4. **Monitor for database updates** from the manufacturer
5. **Re-evaluate historical comparisons** when database versions change
6. **Consider that static databases** (e.g., HBI) may become less representative over time

---

## 10. Amplifier Matching & Technical Standardization

### 10.1 Why Amplifier Matching Is Essential

EEG amplifiers have different frequency response curves due to variations in filters, gain, and hardware design. Without amplifier matching, absolute power comparisons between a patient's EEG and the normative database are **invalid**.

### 10.2 Amplifier Matching Procedure

The standard method (Thatcher et al., 2003):

1. Inject calibrated microvolt sine waves at discrete frequencies (1-30 Hz) into:
   - The patient's EEG amplifier
   - The normative database reference amplifier
2. Record the frequency response curve for each amplifier
3. Compute the ratio of microvolt values at each frequency
4. Use these ratios as amplitude scaling coefficients in the FFT analysis
5. This creates a "universal equilibration" where microvolts are comparable across systems

### 10.3 Montage Considerations

| Montage | Use Case | Database Support |
|---------|----------|-----------------|
| **Linked Ears** | Traditional; widely available | All major databases |
| **Average Reference** | Modern standard; reduces reference bias | NeuroGuide, qEEG-Pro |
| **Laplacian/CSD** | Local activity; reduced volume conduction | NeuroGuide |
| **Bipolar** | Specific clinical patterns | Limited normative support |

**Critical Rule:** The montage used for patient recording must match the montage of the normative database being used. Z-scores computed with mismatched montages are not valid.

### 10.4 Minimum Technical Standards

| Standard | Requirement |
|----------|-------------|
| Electrode placement | International 10-20 system minimum |
| Minimum channels | 19 for surface metrics; 32 for LORETA source analysis |
| Sampling rate | >= 128 Hz (256 Hz preferred) |
| Filter settings | Must match or exceed normative database amplifier characteristics |
| ADC resolution | >= 12 bit |
| Input impedance | >= 100 MOhm |

---

## 11. Gold Standard Checklist for Normative Database Evaluation

Based on Thatcher & Lubar (2008) and the American EEG Association standards:

| # | Standard | NeuroGuide | BrainDx | HBI | qEEG-Pro | ISB-NormDB |
|---|----------|-----------|---------|-----|----------|------------|
| 1 | **Amplifier Matching** | Yes | Yes | Yes | Yes | Yes |
| 2 | **Peer-Reviewed Publications** | Extensive | Moderate | Limited | Moderate | Yes |
| 3 | **Artifact Rejection** | Manual + Auto | Manual | Automatic | Automatic | Strict criteria |
| 4 | **Test-Retest Reliability** | Published | Limited | Limited | Limited | Published |
| 5 | **Inclusion/Exclusion Criteria** | Rigorous | Rigorous | Clear | Clear | 4 strict standards |
| 6 | **Adequate Sample Size per Age Group** | Yes (N>20 for 15/15 pediatric groups) | Moderate | Moderate | Yes | Yes |
| 7 | **Approximation to Gaussian** | Published | Limited | Limited | Published | Published |
| 8 | **Cross-Validation** | Leave-one-out published | Limited | Limited | Published | Published |
| 9 | **Clinical Correlation** | Extensive | Yes | Yes | Moderate | Published |
| 10 | **FDA Registered** | **Yes (510k)** | **Yes (510k)** | Referenced | **Yes (510k)** | KFDA |

**Additional Evaluation Criteria:**

| # | Criterion | Importance |
|---|-----------|-----------|
| 11 | **Lifespan age coverage** | Critical for pediatric/elderly applications |
| 12 | **Sex-stratified norms** | Important for accurate interpretation |
| 13 | **Multiple recording conditions** | EC + EO minimum; active tasks desirable |
| 14 | **Multiple montage support** | Linked ears + average reference + CSD |
| 15 | **Source analysis norms** | LORETA/sLORETA for 3D localization |
| 16 | **ERP norms** | Important for cognitive assessment |
| 17 | **Gamma band coverage** | Emerging importance for cognitive processing |
| 18 | **Distribution transparency** | QQ-plots, skewness, kurtosis disclosed |

---

## 12. Regulatory Status (FDA & International)

### 12.1 FDA 510(k) Cleared qEEG Systems

| Database/Product | FDA 510(k) Number | Year | Status |
|-----------------|------------------|------|--------|
| NeuroGuide Analysis System | K041263 | 2004 | Active - Class II |
| BrainDx (Neurometrics lineage) | K974748 | 1998 | Active - Class II |
| qEEG-Pro | K171414 | 2017 | Active - Class II |
| BrainView QEEG | K212684 | 2023 | Active - Class II |
| ISB-NormDB | KFDA approved | - | Active (Korea) |

### 12.2 FDA Classification

- **Regulation Number:** 21 CFR 882.1400
- **Regulation Name:** Electroencephalograph
- **Regulatory Class:** Class II (Special Controls)
- **Product Code:** OLU
- **Panel:** Neurology

### 12.3 Regulatory Constraints on Use

Per FDA 510(k) clearances and guidance:

1. **Qualified professional required:** Device is for use by "qualified medical or clinical professionals"
2. **Not standalone:** "Used for the statistical evaluation of the human EEG" - not a standalone diagnostic
3. **Labeling must be truthful and not misleading**
4. **Good Manufacturing Practice (GMP)** required for database construction
5. **Software life cycle processes** must follow IEC 62304

### 12.4 Medico-Legal Considerations

For admissibility in legal proceedings (Daubert standards):

| Daubert Factor | qEEG Database Requirement |
|----------------|--------------------------|
| **Testable/Falsifiable** | Cross-validation studies published |
| **Peer Review** | Multiple peer-reviewed publications |
| **Known Error Rate** | Gaussian cross-validation sensitivity rates published |
| **Standards** | FDA 510(k) clearance; IEC 62304 compliance |
| **General Acceptance** | Used in hundreds of studies; NIH, VA, DoD |

---

## 13. Key References & Citations

### Foundational Normative Database Publications

1. **Thatcher, R.W., Walker, R.A., Biver, C.J., North, D.N. & Curtin, R.** (2003). Quantitative EEG normative databases: Validation and clinical correlation. *Journal of Neurotherapy*, 7(3/4), 87-121.

2. **Thatcher, R.W., North, D., & Biver, C.** (2005). Evaluation and validity of a LORETA normative EEG database. *Clinical EEG and Neuroscience*, 36(2), 116-122.

3. **Thatcher, R.W. & Lubar, J.F.** (2008). History of the scientific standards of QEEG normative databases. In: *Introduction to QEEG and Neurofeedback*, Academic Press.

4. **Thatcher, R.W.** (2010). Reliability and validity of quantitative electroencephalography (qEEG). *Journal of Neurotherapy*, 14, 122-152.

5. **Thatcher, R.W., North, D., & Biver, C.** (2009). Self-organized criticality and the development of EEG phase reset. *Human Brain Mapping*, 30(2), 553-574.

6. **John, E.R.** (1977). *Neurometrics: Clinical Applications of Quantitative Electrophysiology*. Erlbaum.

### Database Comparison & Validation

7. **Cheung, W.C.L.** (2011). Comparisons of EEG/QEEG normative databases and review of studies of neurofeedback for dyslexia. *Journal of Biochemistry and Molecular Biology in the Post Genomic Era*, 1(2), 127-190.

8. **Prichep, L.S. et al.** (2021). Validation of quantitative electroencephalogram (qEEG) normative databases. *Pragmatic and Scientific Research Perspectives*, 4, 120-181.

9. **Ko, Y. et al.** (2021). Quantitative electroencephalogram standardization: A sex- and age-controlled data-driven approach. *Frontiers in Neuroscience*, 15, 766781.

10. **Kustermann, T., Wyckoff, S.N., Kessler, J.W.** (2023). Fat tails and the need to disclose distribution parameters of qEEG databases. *Brain Topography*, 36, 10769036.

### Pediatric EEG Norms

11. **Hagne, I.** (1968). Development of the EEG in normal infants during the first year of life. *Neuropadiatrie*, 1, 35-50.

12. **Pampiglione, G.** (1972). Development of EEG and clinical data. *Developmental Medicine and Child Neurology*, 14, 391-397.

13. **MacDarby, L.J. et al.** (2022). Amplitude integrated electroencephalography - Reference values in children aged 2 months to 16 years. *Acta Paediatrica*, 111(12), 2337-2343.

14. **Czada, M. et al.** (2022). Reference values for amplitude-integrated EEGs in children from 1 month to 17 years of age. *medRxiv*.

15. **Petersen, I. & Eeg-Olofsson, O.** (1971). The development of the EEG in normal children and adolescents from 1 to 21 years. *Neuropadiatrie*, 2, 243-304.

### Lifespan EEG Development

16. **Smit, C.M. et al.** (2011). Heritability of background EEG across the power spectrum. *Psychophysiology*, 42, 702-712.

17. **Barry, R.J. & De Blasio, F.M.** (2017). EEG differences between eyes-closed and eyes-open resting remain in healthy ageing. *Biological Psychology*, 129, 231-246.

18. **Feinberg, I. & Campbell, I.G.** (2010). Sleep EEG changes during adolescence. *Brain and Cognition*, 72(1), 59-65.

### Technical Standards & Guidelines

19. **American EEG Society** (1994). Guidelines for standard electrode position nomenclature. *Journal of Clinical Neurophysiology*.

20. **Hughes, J.R. & John, E.R.** (1999). Conventional and quantitative electroencephalography in psychiatry. *Journal of Neuropsychiatry*, 11(2), 190-208.

21. **QEEG Certification Board / ECNS** (current). QEEG minimum guidelines. Available at: qeegcertificationboard.org.

22. **FDA** (2004). 510(k) clearance K041263: NeuroGuide Analysis System.

23. **FDA** (2023). 510(k) clearance K212684: BrainView QEEG Software Package.

24. **Acharya, J.N. et al.** (2016). American Clinical Neurophysiology Society guideline 2. *Journal of Clinical Neurophysiology*, 33(4), 308-321.

---

## Appendix A: Quick Reference - Z-Score Interpretation Decision Tree

```
Z-SCORE INTERPRETATION DECISION TREE
=====================================

Step 1: DATA QUALITY CHECK
  |
  +-- Split-half reliability >= 0.85? 
  |     NO --> Do NOT interpret; re-record or edit
  |     YES --> Proceed to Step 2
  |
Step 2: ARTIFACT ASSESSMENT
  |
  +-- Data artifact-free per visual inspection?
  |     NO --> Do NOT interpret; re-edit or re-record
  |     YES --> Proceed to Step 3
  |
Step 3: AMPLIFIER & MONTAGE MATCH
  |
  +-- Amplifier matched to database? Montage matches?
  |     NO --> Do NOT interpret; obtain matching or convert
  |     YES --> Proceed to Step 4
  |
Step 4: AGE MATCH
  |
  +-- Patient age within database age range?
  |     NO --> Do NOT interpret; database does not cover age
  |     YES --> Proceed to Step 5
  |
Step 5: Z-SCORE MAGNITUDE
  |
  +-- |Z| < 1.5?
  |     YES --> "Within expected range for age"
  |
  +-- 1.5 <= |Z| < 2.0?
  |     YES --> "Borderline deviation; monitor. Consider clinical context."
  |
  +-- 2.0 <= |Z| < 2.5?
  |     YES --> "Deviation from age-matched norms. Clinical correlation recommended."
  |
  +-- 2.5 <= |Z| < 3.0?
  |     YES --> "Significant deviation from norms. Clinical correlation and 
  |              additional assessment strongly recommended."
  |
  +-- |Z| >= 3.0?
  |     YES --> "Marked deviation from age-matched norms. Requires comprehensive 
  |              clinical correlation and may warrant further diagnostic evaluation."
  |
Step 6: SPATIAL CONSISTENCY
  |
  +-- Isolated single-channel deviation?
  |     YES --> Reduced clinical significance; note but de-emphasize
  |
  +-- Regional pattern (multiple adjacent channels)?
  |     YES --> Increased clinical significance
  |
  +-- Widespread pattern?
  |     YES --> High clinical significance; assess for confounds (drowsiness, medication)
  |
Step 7: CROSS-METRIC CONVERGENCE
  |
  +-- Deviation consistent across absolute power, relative power, 
  |     coherence, asymmetry?
  |     YES --> Highly significant finding
  |     NO  --> Interpret cautiously; may be metric-specific artifact
  |
Step 8: CLINICAL CORRELATION
  |
  +-- ALWAYS integrate with:
      - Clinical history
      - Behavioral observations
      - Other diagnostic findings
      - Medication status
      - Recording conditions
      - Developmental context (for pediatric)
```

## Appendix B: Glossary of Terms

| Term | Definition |
|------|-----------|
| **qEEG** | Quantitative Electroencephalography - mathematical and statistical analysis of EEG |
| **Normative Database** | Reference distribution of EEG measures from a healthy population |
| **Z-Score** | Number of standard deviations a measure deviates from the mean |
| **Gaussian Distribution** | Normal (bell-curve) distribution; basis for standard Z-score interpretation |
| **Fat Tails** | Distribution property where extreme values occur more frequently than Gaussian predicts |
| **Amplifier Matching** | Calibration procedure to equate frequency responses across EEG amplifiers |
| **Montage** | Specific arrangement of electrode reference combinations |
| **Artifact** | Non-neural signal contamination (eye, muscle, movement, etc.) |
| **Split-Half Reliability** | Internal consistency measure comparing odd vs. even data segments |
| **LORETA** | Low-Resolution Electromagnetic Tomography; 3D source localization |
| **EC/EO** | Eyes-Closed / Eyes-Open recording conditions |
| **Absolute Power** | Power in a frequency band in microvolts-squared (uV^2) |
| **Relative Power** | Percentage of total power in a frequency band |
| **Coherence** | Correlation of activity between two electrode sites at a given frequency |
| **Phase** | Temporal relationship between oscillations at two sites |
| **Amplitude Asymmetry** | Difference in power between homologous left-right electrode pairs |

---

*Document compiled from peer-reviewed literature, FDA 510(k) submissions, database manufacturer documentation, and established clinical guidelines. This document is intended as a research and governance reference and does not constitute clinical advice. Always consult with qualified clinical neurophysiologists and follow local regulatory requirements.*

*Last updated: 2025*
