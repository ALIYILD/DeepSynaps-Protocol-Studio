# DeepSynaps Protocol Studio: EEG Normative Database Integration Report

**Document ID**: DS-EEG-NORM-RPT-001
**Version**: 1.0.0
**Date**: 2025-06-17
**Classification**: Technical Integration Report / PHASE 1 Knowledge Layer
**Author**: Clinical Neurophysiology Research Specialist

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [CHBMP Deep Dive](#2-chbmp-deep-dive)
3. [Normative Database Comparison](#3-normative-database-comparison)
4. [Z-Score Methodology](#4-z-score-methodology)
5. [EEG Feature Normalization](#5-eeg-feature-normalization)
6. [Governance & Confidence Model](#6-governance--confidence-model)
7. [DeepSynaps Integration Architecture](#7-deepsynaps-integration-architecture)
8. [Provenance & Licensing](#8-provenance--licensing)
9. [Implementation Recommendations](#9-implementation-recommendations)
10. [Clinical Safety Rules](#10-clinical-safety-rules)
11. [Risks & Mitigations](#11-risks--mitigations)

---

## 1. Executive Summary

### 1.1 Mission Overview

This report provides a comprehensive technical analysis of EEG normative databases and standards for integration into the DeepSynaps Protocol Studio clinical neuromodulation platform. The objective is to establish a robust, ethically sound, and scientifically validated Knowledge Layer (PHASE 1) that enables quantitative EEG (qEEG) analysis with normative comparisons for neurofeedback and clinical neuromodulation workflows.

### 1.2 Key Findings

**Critical Discovery: "CHBMP" in EEG Normative Context Refers to the Cuban Human Brain Mapping Project**

The acronym "CHBMP" in published neuroimaging literature refers to the **Cuban Human Brain Mapping Project** (Centro de Neurociencias de Cuba), not a Chinese initiative. This is an open-access, multimodal (EEG + MRI + cognition) dataset available through the CONP Portal and LORIS. No standalone "Chinese Brain Mapping Project EEG Normative Database" exists as a publicly accessible resource. Major Chinese neuroimaging initiatives (SALD, BABRI, Colour Nest, Chinese2020) are primarily MRI-focused.

**Available Normative EEG Databases for Clinical Use:**

| Database | Origin | Sample Size | Age Range | Open Access | FDA Status |
|----------|--------|-------------|-----------|-------------|------------|
| NeuroGuide (NJS/Thatcher) | USA | 727 (EC/EO) | 2 mo - 82 yr | No | 510(k) Cleared |
| BrainDX (ex-NYU/NxLink) | USA | 464-782 | 6-90 yr | No | 510(k) Cleared |
| HBI (HBImed) | International | 1,000+ | 7-60+ yr | No | CE Mark |
| qEEG-Pro | Netherlands | 1,482 EC / 1,232 EO | 6-83 yr | No | FDA Registered |
| ISB-NormDB | South Korea | 1,289 | 4.5-81 yr | No | KFDA Approved |
| CHBMP (Cuban) | Cuba | 211 | 5-80 yr | **Yes** | No |
| SKIL/SKIL3 | USA | 175 | 6-55 yr | No | No |
| Neurometrics | USA | 782 | 6-90 yr | No | 510(k) Cleared |

**Recommended Integration Strategy**: Implement a multi-database adapter architecture that supports multiple normative databases with runtime selection, prioritizing FDA-registered databases (NeuroGuide, BrainDX, qEEG-Pro) for clinical use while incorporating open-access CHBMP data for research validation and algorithm development.

### 1.3 Statistical Methodology Consensus

The scientific literature converges on the following best practices:
- **Age regression** via Generalized Additive Models (GAM) with spline interpolation is superior to age-bin stratification
- **Log transformation** of power values before z-score calculation to address distribution bias
- **Gaussian cross-validation** with leave-one-out methodology for sensitivity optimization
- **Amplifier matching** is mandatory for valid clinical comparisons (FDA standard)
- **Surface Laplacian (CSD)** and Average Reference should both be supported with separate norms

### 1.4 Clinical Safety Priority

Normative data integration carries significant clinical risk. Incorrect z-score calculations, inappropriate population matching, or insufficient artifact rejection can lead to misinterpretation of patient data and erroneous neurofeedback protocols. This report establishes 12 clinical safety rules and a 5-tier confidence scoring system to mitigate these risks.

---

## 2. CHBMP Deep Dive

### 2.1 Identity Clarification

**IMPORTANT**: The acronym "CHBMP" in peer-reviewed neuroimaging literature identifies the **Cuban Human Brain Mapping Project**, developed at the Neurosciences Center of Cuba (Centro de Neurociencias de Cuba) in collaboration with the Cuban Ministry of Public Health. This is frequently confused with Chinese brain mapping initiatives.

### 2.2 CHBMP (Cuban Human Brain Mapping Project)

#### 2.2.1 Overview and Availability

The CHBMP is a **population-based, open-access multimodal dataset** comprising EEG, MRI, and cognitive assessment data from healthy Cuban individuals. It is one of the few genuinely open-access normative neuroimaging resources available globally.

**Access Points:**
- **CONP Portal**: https://portal.conp.ca/dataset?id=projects/CHBMP
- **LORIS Instance**: https://chbmp-open.loris.ca
- **DataLad Installation**: `datalad install projects/CHBMP`
- **Code Repository**: https://github.com/eduardo-aubert/CHBMP-Code
- **Publication**: Nature Scientific Data (2021), doi: 10.1038/s41597-021-00829-7

#### 2.2.2 Sample Characteristics

| Parameter | Value |
|-----------|-------|
| Total Participants | 211 healthy individuals |
| Age Range | 5 - 80 years |
| Sex Distribution | 105 males, 106 females (near-balanced) |
| Recruitment Period | 1988 - 1990 |
| Location | Neurosciences Center of Cuba |
| Population | Cuban/Latin American |
| Exclusion Criteria | Medical conditions, neurological diseases, psychiatric disorders, prenatal/perinatal antecedents, sleep disorders, familial pathological backgrounds, drug addiction, abnormal neurological physical exam |

#### 2.2.3 Data Modalities

The CHBMP is a **multimodal dataset** including:

1. **EEG Recordings**: 19-channel, 10-20 system, monopolar linked-ear reference, 256 Hz sampling rate
2. **MRI Scans**: Structural T1-weighted anatomical images
3. **Cognitive Assessments**: WAIS-III (Wechsler Adult Intelligence Scale), MMSE (Mini-Mental State Examination), Reaction Time tests
4. **Demographics**: Age, sex, handedness (CSV format)
5. **BIDS Format**: All data stored in Brain Imaging Data Structure (BIDS) format

#### 2.2.4 EEG Recording Parameters

| Parameter | Specification |
|-----------|---------------|
| Electrode System | International 10-20 |
| Number of Channels | 19 |
| Reference | Monopolar linked ear |
| Sampling Rate | 256 Hz |
| Impedance | < 5 kOhm |
| Data Format | BIDS-EEG (converted from NEURONIC format) |

#### 2.2.5 CHBMP Normative Features

The CHBMP EEG data supports computation of:
- Absolute power (delta, theta, alpha, beta)
- Relative power ratios
- Coherence between electrode pairs
- Amplitude asymmetry
- Mean frequency within bands
- Z-score deviations from normative means

**Validation Studies**: Martinez-Briones et al. demonstrated that children with learning disabilities (IQ > 75) showed significantly elevated theta/alpha ratio z-scores (> 1.645) when compared against the CHBMP normative database.

#### 2.2.6 Licensing and Terms

The CHBMP is distributed as an **open-access dataset** under the CONP (Canadian Open Neuroscience Platform) framework. Key usage considerations:

- **Open Access**: Yes, freely available for research
- **Commercial Use**: Permitted under CONP terms with attribution
- **Attribution Required**: Yes, cite original publication
- **Ethics Note**: Gender imbalance exists in the sample by official request
- **Population Note**: Socioeconomic status was identified as the most important predictor of EEG normality deviations in early multinational studies
- **Data Quality**: Participants had benefits of adequate lifelong diet, free national education and healthcare, early stimulation programs

#### 2.2.7 CHBMP Code Availability

Three software tools are provided:
1. **Anomplg.exe**: Anonymization tool for EEG records
2. **Plg2bids.exe**: NEURONIC to BIDS format converter
3. **Joinbids.exe**: Combines BIDS-EEG and MRI-BIDS into unified structure

### 2.3 Chinese Neuroimaging Initiatives (Contextual Note)

No standalone "Chinese Brain Mapping Project EEG Normative Database" was identified in the literature. Major Chinese neuroimaging initiatives include:

| Initiative | Institution | Focus | EEG Component |
|------------|-------------|-------|---------------|
| **SALD** (Southwest University Adult Lifespan Dataset) | Southwest University | 494 individuals, 19-80 yr, T1 + rs-fMRI | No |
| **BABRI** (Beijing Aging Brain Rejuvenation Initiative) | Beijing Normal University | 5000+ people, >50 yr, multimodal | Limited |
| **Colour Nest Project** | CAS Institute of Psychology | Longitudinal, 6-84 yr, up to 1200 people | No |
| **Chinese2020** | Multiple sites | Brain template from 2020 people (mainland China + Hong Kong) | No |
| **REST-meta-MDD** | CAS Institute of Psychology | 2428 participants (1300 MDD patients), rs-fMRI indices | No |
| **ChineseEEG Dataset** | Multiple (2024) | 10 subjects, Chinese language semantic alignment, 12 hrs each | Yes (research) |

**Recommendation**: For clinical normative comparisons in the Chinese population, the Chinese2020 anatomical template is available for source localization, but a dedicated Chinese normative EEG database does not yet exist in the public domain. The ISB-NormDB (Korean) or qEEG-Pro databases would be the closest geographic/cultural matches, though population-specific validation would be required.

---

## 3. Normative Database Comparison

### 3.1 Comprehensive Database Comparison Table

| Parameter | NeuroGuide | BrainDX | HBI | qEEG-Pro | ISB-NormDB | CHBMP | SKIL3 | Neurometrics |
|-----------|-----------|---------|-----|----------|------------|-------|-------|--------------|
| **Developer** | R. Thatcher / ANI | E.R. John / NYU | J. Kropotov / HBImed | Keizer et al. / qEEG-Pro B.V. | Ko et al. / iMediSync | Bosch-Bayard / Cuba | Sterman & Kaiser | Duffy et al. |
| **Country** | USA | USA | International | Netherlands | South Korea | Cuba | USA | USA |
| **FDA Status** | 510(k) Cleared | 510(k) Cleared | CE Mark | FDA Registered | KFDA Approved | No | No | 510(k) Cleared |
| **Sample Size (EC)** | 727 | 782 | ~1,000 | 1,482 | 1,289 | 211 | 175 | 782 |
| **Sample Size (EO)** | 727 | - | ~1,000 | 1,232 | 1,290 | 211 | 175 | 782 |
| **Age Range** | 2 mo - 82 yr | 6-90 yr | 7-60+ yr | 6-83 yr | 4.5-81 yr | 5-80 yr | 6-55 yr | 6-90 yr |
| **Children (n)** | 458 (6-16 yr) | 356 (6-16 yr) | 300 (7-17 yr) | Included | Included | Included | 30 (6-11 yr) | 356 (6-16 yr) |
| **Sex (M/F)** | 355M/270F | - | Balanced | 955M/527F (EC) | 553M/736F | 105M/106F | 108M/27F | - |
| **Ethnicity** | Multi-ethnic (71.4% White, 24.2% Black, 3.2% Asian) | - | European | Dutch | Korean | Cuban/Latin American | US mixed | US mixed |
| **Channels** | 19 (10-20) | 19 (10-20) | 19 (10-20) | 19 (10-20) | 19 (10-20) | 19 (10-20) | 19 (10-20) | 19 (10-20) |
| **Sampling Rate** | 256 Hz | >= 100 Hz | - | 128(8%) / 256(92%) | 250 Hz | 256 Hz | - | 256 Hz |
| **Reference** | Linked ears | Linked ears | - | Linked ear | Average reference (CAR) | Linked ear | Linked ear | Linked ear |
| **Recording Length** | ~2 min per condition | ~2 min | 3 min EO, 3 min EC | 10 min EO, 10 min EC | 4 min EO, 4 min EC | Variable | Variable | ~2 min |
| **De-artifacting** | Semi-automatic + manual | Manual | Automatic | Automatic (S.A.R.A.) | AI-driven (iSyncBrain) | Manual | Manual | Manual |
| **Age Regression** | Polynomial (sliding window) | Age bins | Age bins | Sliding window | GAM (nonlinear spline) | Age bins | Age bins | Age bins |
| **EO/EC Norms** | Yes (separate) | Yes | Yes (EO, EC + 5 tasks) | Yes (separate) | Yes (separate) | Yes | Yes | Yes |
| **Montage Options** | Linked ears, Avg ref, CSD (Laplacian) | Linked ears | - | Linked ear | Average reference | Linked ear | Linked ear | Linked ears |
| **Source Localization** | LORETA, sLORETA, eLORETA | Limited | LORETA | No | Yes (iSyncBrain) | No | No | No |
| **Phase Reset Norms** | Yes (LORETA + Surface) | No | No | No | No | No | No | No |
| **ERP Norms** | No | Yes | Yes (5 tasks) | No | No | No | No | Yes |
| **Gamma Band** | No (up to 30 Hz) | Limited | Yes | 1-45 Hz | Yes | No | No | No |
| **Cross-Frequency** | Yes | No | No | No | No | No | No | No |
| **Open Access** | No | No | No | No | No | **Yes** | No | No |
| **Cost (Base)** | $3,395 | License fee | License fee | License fee | License fee | Free | License fee | License fee |

### 3.2 NeuroGuide (NJS / Thatcher Lifespan Normative EEG Database) - Detailed

**Developer**: Robert W. Thatcher, PhD, Applied Neuroscience, Inc.
**Status**: The most extensively validated and feature-rich commercial normative database.

#### 3.2.1 Key Features
- 943 computed EEG parameters per subject
- Absolute power, relative power, power ratios, peak frequency
- Coherence, phase difference, amplitude asymmetry
- Eyes-open (EO) and eyes-closed (EC) separate norms
- Three reference montages: Linked ears, Average reference, Current Source Density (CSD/Surface Laplacian)
- Birth to 82 years lifespan coverage
- Multi-ethnic composition: 71.4% White, 24.2% Black, 3.2% Oriental

#### 3.2.2 Advanced Capabilities
- **LORETA/sLORETA/eLORETA norms**: 3D source-level z-scores
- **Phase Reset norms**: Phase shift duration and phase lock duration (2008+)
- **Cross-frequency norms**: Phase-amplitude coupling, cross-frequency phase lock
- **Functional connectivity norms**: Coherence and phase difference between Brodmann areas
- **Effective connectivity norms**: Magnitude of information flow
- **Symptom Checklist**: Links symptoms to brain areas and generates neurofeedback protocols
- **Discriminant functions**: Learning disabilities and mild TBI classifiers

#### 3.2.3 Pricing Structure (2024-2025)

| Module | 1st License | 2nd License |
|--------|-------------|-------------|
| NeuroGuide Base (NG) | $3,395 | $1,700 |
| Discriminant Functions (DIS) | $2,000 | - |
| LORETA Phase Reset (LPR) | $1,200 | $600 |
| Collection Module (NC) | $600/amplifier | - |
| NF1: 1-19 Ch Z-Score NFB | $2,000 | - |
| NF2: sLORETA Z-Score NFB | - | - |
| NF3: Cross-Frequency Surface NFB | $2,000 | - |
| swNF: swLORETA Z-Score NFB | $3,000 | - |
| BrainSurfer | $3,000 | - |
| NeuroNavigator (NN) | Contact | Contact |
| NNZ: CSD Normative DB | Add-on | Add-on |
| NNF: Functional Connectivity | Add-on | Add-on |
| NNI: Effective Connectivity | Add-on | Add-on |

#### 3.2.4 Scientific Publications
- Thatcher et al. (2003): Quantitative EEG Normative Databases: Validation and Clinical Correlation
- Thatcher et al. (2005): Evaluation and Validity of a LORETA normative EEG database
- Thatcher (2008): History of the scientific standards of QEEG normative databases
- Thatcher et al. (2008): Development of cortical connectivity as measured by EEG coherence and phase
- Thatcher et al. (2009): Self-organized criticality and the development of EEG phase reset
- Thatcher (2010): Reliability and validity of quantitative electroencephalography (qEEG)
- Thatcher & Lubar (2014): Z Score Neurofeedback: Clinical Applications

### 3.3 BrainDX (Formerly NxLink/NYU Database)

**Developer**: E. Roy John, PhD, Brain Research Laboratories, NYU School of Medicine
**Status**: FDA 510(k) cleared, extensive peer-reviewed publication history.

- Total of 464-782 subjects (database evolved over time)
- Development period: 1970s-1980s
- Manual deartifacting performed
- Over $50M in public and private grant funding for development
- Over 20,000 qEEG readings in expanded database
- US FDA 510K approval (#K974748, July 1998)
- Pioneer of neurometric analysis
- Measures: delta, theta, alpha, low-frequency beta, absolute/relative power, coherence, mean frequency, symmetry (left-right, front-back)

### 3.4 HBI (Human Brain Index)

**Developer**: Juri Kropotov, PhD, HBImed AG
**Status**: Unique for including ERP norms alongside EEG norms.

**Reference groups:**
1. Children/adolescents: age 7-17 (n=300)
2. Adults: age 18-60 (n=500)
3. Seniors: age 61+ (n=200)

**Recording conditions:**
- Eyes open (minimum 3 min), eyes closed (minimum 3 min)
- Five task conditions: two-stimulus GO/NOGO, arithmetic, reading, auditory recognition, auditory oddball

**Exclusion criteria:** Uneventful perinatal period, no head injury with cerebral symptoms, no neurological/psychiatric disease history, no convulsions, normal mental and physical development, average or better school grades

**ERP Decomposition:** Brain responses decomposed into independent components associated with distinctive psychological operations

### 3.5 qEEG-Pro (Dutch Normative Database)

**Developer**: Keizer et al., qEEG-Pro B.V., Netherlands
**Status**: FDA-registered, innovative client-based approach with psychopathology regression.

**Unique Methodology:**
The qEEG-Pro database uses a **client-based** rather than purely healthy-control approach:
- 1,482 eyes-closed and 1,231 eyes-open recordings from neurofeedback clinic clients (2008-2014)
- Each client completed extensive DSM-based questionnaire
- Statistical regression removes variance explained by psychopathology from EEG data
- Result: corrected data corresponds to zero symptom scores across all DSM categories

**Advantages of client-based approach:**
- Research shows paying healthy subjects can significantly affect brain activity vs. clinical clients
- Payment structure differences produce measurable differences in power spectral distribution
- Regression-based correction arguably produces more ecologically valid norms

**Technical Specifications:**
- Amplifier: Deymed TruScanEEG
- 10 min eyes-closed, 10 min eyes-open
- Automatic artifact rejection via S.A.R.A. (Standardized Artifact Rejection Algorithm)
- Frequency range: 1-45 Hz (broader than many competitors)
- Age regression: Sliding window method

### 3.6 ISB-NormDB (Korean Normative Database)

**Developer**: Ko, Park, Kim & Kang / iMediSync Inc., Seoul National University
**Status**: KFDA approved, first sex-differentiated normative database.

**Key Innovation:** Sex- and age-differentiated modeling using Generalized Additive Models (GAM)

**Sample:**
- 1,797 subjects recruited (2014-2019), 1,289 passed strict screening
- 553 males, 736 females; ages 4.5-81 years
- Four-stage screening: pre-screening, cognitive evaluation, emotional evaluation, behavioral evaluation
- IQ/percentile cutoffs: WPPSI, CNS Vital Signs, MMSE (age-dependent instruments)

**Methodology:**
- Log transformation to address distribution bias
- GAM with spline method for continuous age regression (avoids age-band boundary discontinuity)
- Separate models for males and females (ISB-NormDB-Male, ISB-NormDB-Female)
- Gamma band (30-45 Hz) included in addition to standard bands
- Source-level analysis via iSyncBrain cloud platform

**Validation:**
- Cross-validation with qEEG-Pro showed correlation r > 0.7 across all bands
- ADHD, aMCI, and anxiety test cases demonstrated improved anomaly detection with sex-specific models

### 3.7 SKIL/SKIL3 (Sterman-Kaiser Imaging Laboratory)

**Developer**: M.B. Sterman & D. Kaiser
**Status**: Historical significance, smaller sample.

- SKIL: 135 adults (18-55 years)
- SKIL3: 175 subjects (115 adults, 30 teenagers 12-19, 30 children 6-11)
- 80% male in original SKIL database (n=108M, 27F)
- Composition: 50% students/lab personnel, 25% community volunteers, 25% US Air Force
- Excluded physical and psychiatric disorders and medication use

### 3.8 Neurometrics Database

**Developer**: Early qEEG pioneers (Duffy et al.)
**Status**: First FDA 510(k) cleared qEEG database (July 1998, #K974748)

- n=782 "normal" individuals (356 aged 6-16, 426 aged 16-90)
- Bands: delta, theta, alpha, low-frequency beta
- Features: absolute power, relative power, coherence, mean frequency within band, symmetry (left-right, front-back)
- Historical significance as first FDA-cleared normative database

### 3.9 CNS Vital Signs (CNS VS)

**Note**: CNS Vital Signs is primarily a **computerized neuropsychological test battery**, not an EEG normative database. It is relevant to DeepSynaps because:

- Used by ISB-NormDB for cognitive screening of normative subjects
- 7 subtests generating 11 cognitive domain scores
- Normative sample: 1,069+ participants (age 8-90), expanded to 1,600+
- Standard scores: mean=100, SD=15 (IQ-like metric)
- Some clinicians use CNS VS alongside qEEG for comprehensive assessment
- US Military Veterans hospitals use it for neurocognitive screening

### 3.10 Cross-Database Validation Studies

Independent cross-validation between NYU (BrainDX) and University of Maryland (NeuroGuide) databases demonstrated high correlation coefficients:

| Feature | Anterior | Posterior |
|---------|----------|-----------|
| Absolute Power (Delta) | 0.815 | 0.880 |
| Absolute Power (Theta) | 0.926 | 0.940 |
| Absolute Power (Alpha) | 0.951 | 0.958 |
| Absolute Power (Beta) | 0.820 | 0.882 |
| Relative Power (Delta) | 0.854 | 0.925 |
| Relative Power (Theta) | 0.877 | 0.895 |
| Coherence (Delta) | 0.804 | 0.935 |
| Coherence (Theta) | 0.853 | 0.914 |
| Amplitude Asymmetry (Delta) | 0.854 | 0.820 |

These high correlations (r > 0.8 for most features) demonstrate that well-constructed normative databases converge on similar normative ranges despite different populations and methodologies.

---

## 4. Z-Score Methodology

### 4.1 Fundamental Z-Score Equation

The z-score in qEEG analysis is computed as:

```
Z = (X - mu) / sigma

Where:
  X     = Individual patient's EEG metric value
  mu    = Age-regressed expected mean from normative database
  sigma = Age-regressed expected standard deviation from normative database
```

The z-score follows a standard normal distribution: Z ~ N(0, 1)

### 4.2 Z-Score Calculation Pseudocode

```python
def compute_zscore(patient_value: float,
                   patient_age_months: float,
                   patient_sex: str,  # 'M' or 'F'
                   feature_id: str,   # e.g., 'abs_power_alpha_F3'
                   condition: str,    # 'EO' or 'EC'
                   montage: str,      # 'linked_ears', 'avg_ref', 'laplacian'
                   norm_db: NormativeDatabase) -> dict:
    """
    Compute age- and sex-matched z-score for a single EEG metric.
    
    PHASE 1 Implementation for DeepSynaps Protocol Studio
    """
    
    # Step 1: Validate inputs
    if not norm_db.supports_feature(feature_id):
        raise UnsupportedFeatureError(f"Feature {feature_id} not in database")
    
    if not norm_db.covers_age(patient_age_months):
        raise AgeOutOfRangeError(
            f"Age {patient_age_months}mo outside database range")
    
    # Step 2: Apply log transformation for power-based features
    # Power values follow log-normal distribution
    if is_power_feature(feature_id):
        patient_value = np.log(patient_value + epsilon)
    
    # Step 3: Retrieve age- and sex-regressed mean and SD
    # Method A: GAM (Generalized Additive Model) - ISB-NormDB style
    if norm_db.regression_method == 'GAM':
        mu = norm_db.gam_predict_mean(feature_id, patient_age_months, 
                                       patient_sex, condition, montage)
        sigma = norm_db.gam_predict_sd(feature_id, patient_age_months, 
                                        patient_sex, condition, montage)
    
    # Method B: Polynomial Age Regression - NeuroGuide style
    elif norm_db.regression_method == 'polynomial':
        coeffs_mean = norm_db.get_polynomial_coeffs(feature_id, 'mean',
                                                     patient_sex, condition, montage)
        coeffs_sd = norm_db.get_polynomial_coeffs(feature_id, 'sd',
                                                   patient_sex, condition, montage)
        mu = evaluate_polynomial(coeffs_mean, patient_age_months)
        sigma = evaluate_polynomial(coeffs_sd, patient_age_months)
    
    # Method C: Sliding Window - qEEG-Pro style
    elif norm_db.regression_method == 'sliding_window':
        window = norm_db.get_sliding_window(feature_id, patient_age_months,
                                             patient_sex, condition, montage)
        mu = window.mean
        sigma = window.std
    
    # Step 4: Compute z-score
    z_score = (patient_value - mu) / sigma
    
    # Step 5: Determine clinical significance
    significance = classify_zscore(z_score)
    
    # Step 6: Compute percentile
    percentile = norm.cdf(z_score) * 100  # scipy.stats.norm.cdf
    
    # Step 7: Multiple comparison correction
    n_comparisons = norm_db.get_n_comparisons(feature_id)
    bonferroni_threshold = 1.96 / np.sqrt(n_comparisons)  # Simplified
    
    return {
        'z_score': round(z_score, 3),
        'percentile': round(percentile, 1),
        'expected_mean': round(mu, 6),
        'expected_sd': round(sigma, 6),
        'significance': significance,
        'is_significant_uncorrected': abs(z_score) > 1.96,
        'is_significant_corrected': abs(z_score) > bonferroni_threshold,
        'direction': 'elevated' if z_score > 0 else 'reduced',
        'feature_id': feature_id,
        'database_id': norm_db.id,
        'database_version': norm_db.version,
        'confidence_tier': compute_confidence_tier(norm_db, patient_age_months, 
                                                    patient_sex),
        'patient_value_raw': patient_value,
        'patient_value_transformed': patient_value if is_power_feature(feature_id) else None,
        'montage': montage,
        'condition': condition,
        'age_months': patient_age_months
    }


def classify_zscore(z: float) -> str:
    """Classify z-score into clinical significance categories."""
    if abs(z) < 1.0:
        return 'normal'
    elif abs(z) < 1.645:
        return 'borderline'
    elif abs(z) < 1.96:
        return 'mild_deviation'
    elif abs(z) < 2.58:
        return 'significant_deviation'  # p < 0.05
    elif abs(z) < 3.29:
        return 'highly_significant'      # p < 0.01
    else:
        return 'extremely_significant'   # p < 0.001


def compute_confidence_tier(norm_db, age_months, sex) -> dict:
    """
    Compute confidence tier for normative comparison.
    5-tier system for DeepSynaps clinical safety.
    """
    # Check population density at this age/sex
    density = norm_db.get_sample_density(age_months, sex)
    
    if density.n_subjects < 10:
        return {'tier': 1, 'label': 'INSUFFICIENT_DATA', 
                'color': 'red', 'clinical_use': False}
    elif density.n_subjects < 25:
        return {'tier': 2, 'label': 'LOW_CONFIDENCE',
                'color': 'orange', 'clinical_use': 'caution'}
    elif density.n_subjects < 50:
        return {'tier': 3, 'label': 'MODERATE_CONFIDENCE',
                'color': 'yellow', 'clinical_use': True}
    elif density.n_subjects < 100:
        return {'tier': 4, 'label': 'HIGH_CONFIDENCE',
                'color': 'light_green', 'clinical_use': True}
    else:
        return {'tier': 5, 'label': 'VERY_HIGH_CONFIDENCE',
                'color': 'green', 'clinical_use': True}
```

### 4.3 Age Regression Techniques

#### 4.3.1 Method Comparison

| Method | Description | Pros | Cons | Used By |
|--------|-------------|------|------|---------|
| **Age Bins** | Divide subjects into age groups, compute mean/SD per bin | Simple, intuitive | Discontinuity at boundaries, small N per bin | CHBMP, HBI, Neurometrics |
| **Sliding Window** | Overlapping age bins (e.g., 1-yr bins with 0.75-yr overlap) | Smoother than fixed bins | Still has step discontinuities | NeuroGuide (historical), qEEG-Pro |
| **Polynomial Regression** | Fit polynomial (linear, quadratic, cubic) across age range | Continuous, interpretable | May underfit complex developmental curves | NeuroGuide (early versions) |
| **GAM (Spline)** | Generalized Additive Models with spline interpolation | Continuous, flexible, handles non-linear trends, interpretable | Computationally intensive | ISB-NormDB, recommended |
| **Neural Network** | Black-box machine learning prediction | Can model complex non-linear relationships | Not interpretable, may overfit | Not widely used |

#### 4.3.2 GAM (Generalized Additive Model) - Recommended Method

The GAM approach using spline interpolation (Hastie & Tibshirani, 1986) is the recommended age regression method for DeepSynaps:

```python
# GAM pseudocode for age regression
from pygam import LinearGAM, s  # spline term

def fit_gam_norm(ages, feature_values, sex):
    """
    Fit GAM for a single EEG feature across ages.
    
    Steps:
    1. Log-transform power values (address skewness)
    2. Fit GAM with spline smooth on age
    3. Extract predicted mean and prediction intervals
    4. Store model coefficients for real-time prediction
    """
    # Log transform for power features
    y = np.log(feature_values + epsilon)
    
    # Fit GAM: y ~ s(age) + sex
    gam = LinearGAM(s(0, n_splines=20, spline_order=3))  # cubic spline
    gam.fit(ages, y)
    
    # Predict mean and confidence intervals
    age_grid = np.linspace(ages.min(), ages.max(), 500)
    mean_pred = gam.predict(age_grid)
    conf_intervals = gam.confidence_intervals(age_grid, width=0.95)
    
    # Standard deviation from prediction intervals
    sd_pred = (conf_intervals[:, 1] - conf_intervals[:, 0]) / (2 * 1.96)
    
    return {
        'model': gam,
        'age_grid': age_grid,
        'mean': mean_pred,
        'sd': sd_pred,
        'spline_coeffs': gam.coef_,
        'model_statistics': gam.statistics_
    }
```

#### 4.3.3 Developmental EEG Trends (Established Patterns)

The literature establishes consistent age-related EEG patterns that any age regression model must capture:

1. **Delta/Theta (slow waves)**: Sharp decline from infancy through adolescence (4.5-19 yr), relatively stable after age 20
2. **Alpha**: Fluctuates in childhood/adolescence, steady decrease after age 20
3. **Beta**: Decreases in childhood/adolescence, steady increase after age 20
4. **Peak Alpha Frequency**: Increases with age in children, plateaus in adulthood
5. **Coherence**: Generally decreases with maturation (reflecting increasing regional specialization)

### 4.4 Distribution Transformations

#### 4.4.1 Log Transformation (Mandatory for Power)

EEG power values follow a **log-normal distribution**, not a Gaussian distribution. Log transformation is mandatory before z-score calculation:

```python
# Correct approach
log_power = np.log(raw_power + epsilon)  # epsilon avoids log(0)
z_score = (log_power - mean_log_power) / sd_log_power

# Without log transformation, z-scores will be biased
# toward overestimating deviations at higher power values
```

#### 4.4.2 Gaussian Approximation Validation

The FDA standard for normative databases requires:
1. Compute z-scores for all subjects in the database against the remaining subjects
2. Verify z-score distribution approximates N(0,1) using Kolmogorov-Smirnov test
3. Optimize cross-validation sensitivity (typically 90-95%)
4. Apply Box-Cox or other transformations if Gaussian approximation is inadequate

### 4.5 Multiple Comparison Corrections

In a full 19-channel qEEG analysis, the number of simultaneous comparisons is substantial:

```
For 19 channels, 5 frequency bands:
- Absolute power: 19 x 5 = 95 comparisons
- Relative power: 19 x 5 = 95 comparisons  
- Coherence: 171 pairs x 5 bands = 855 comparisons
- Phase lag: 171 pairs x 5 bands = 855 comparisons
- Amplitude asymmetry: ~50 pairs x 5 bands = 250 comparisons
- Power ratios: ~50 pairs x 5 bands = 250 comparisons
TOTAL: ~2,350+ comparisons per condition (EO or EC)
```

#### 4.5.1 Correction Methods

| Method | Description | Threshold (for 2,350 tests) | Clinical Use |
|--------|-------------|----------------------------|--------------|
| **None (uncorrected)** | Per-comparison alpha = 0.05 | Z > 1.96 | Display only, not diagnostic |
| **Bonferroni** | alpha / N | Z > 4.42 | Too conservative for qEEG |
| **Holm-Bonferroni** | Step-down Bonferroni | ~Z > 4.0 | Better than Bonferroni |
| **FDR (Benjamini-Hochberg)** | Controls false discovery rate | Z > 2.8-3.5 (adaptive) | **Recommended** |
| **Spatial Cluster** | Cluster-based permutation | Variable | Best for topographic patterns |
| **Split-Test** | Conjunction of split-half analyses | Variable | Good for reducing false positives |

**DeepSynaps Recommendation**: Use FDR correction (q=0.05) as the primary method, with spatial cluster thresholding for topographic map display. Report both uncorrected and FDR-corrected significance.

### 4.6 Statistical Significance Thresholds

| Z-Score Range | Interpretation | Percentile | Clinical Action |
|---------------|----------------|------------|-----------------|
| -1.0 to +1.0 | Normal | 16th-84th | No action needed |
| -1.645 to -1.0 or +1.0 to +1.645 | Borderline | 5th-16th or 84th-95th | Monitor |
| -1.96 to -1.645 or +1.645 to +1.96 | Mild deviation | 2.5th-5th or 95th-97.5th | Consider follow-up |
| -2.58 to -1.96 or +1.96 to +2.58 | Significant (p<0.05) | 0.5th-2.5th or 97.5th-99.5th | Clinical attention |
| -3.29 to -2.58 or +2.58 to +3.29 | Highly significant (p<0.01) | 0.05th-0.5th or 99.5th-99.95th | Active intervention |
| < -3.29 or > +3.29 | Extremely significant (p<0.001) | <0.05th or >99.95th | Urgent attention |

### 4.7 Surface Laplacian vs. Average Reference Implications

#### 4.7.1 Key Differences

| Property | Surface Laplacian (CSD) | Average Reference |
|----------|------------------------|-------------------|
| **Reference-free** | Yes (mathematically) | No (dependent on all channels) |
| **Volume conduction** | Eliminated/reduced | Present |
| **Spatial filtering** | High-pass (local activity) | Low-pass (broad activity) |
| **Deep sources** | Attenuated | Better preserved |
| **SNR** | Higher for local sources | Higher for distributed sources |
| **Number of valid channels** | All 19 | All 19 |
| **Normative availability** | NeuroGuide, ISB-NormDB | ISB-NormDB |

#### 4.7.2 Clinical Implications

1. **Surface Laplacian is optimal for**: Focal abnormalities, cortical surface activity, reducing reference contamination, SSVEP/SSEP studies
2. **Average Reference is optimal for**: Distributed source activity, deep source estimation, LORETA source analysis, ERP studies
3. **DeepSynaps should compute z-scores in BOTH montages** and present them separately
4. **Never mix norms**: Laplacian z-scores must be compared against Laplacian norms; average reference against average reference norms

### 4.8 LORETA Source-Level Z-Scores

For source localization-based norms, the NeuroGuide/LORETA pipeline provides:

```
1. Compute cross-spectra from EEG time series
2. Apply LORETA/sLORETA/eLORETA inverse solution
3. Extract current source density (CSD) at Brodmann areas/voxels
4. Compare against age-matched CSD norms
5. Compute z-scores for each voxel/band combination

Spatial resolution: ~7 mm voxels (sLORETA/eLORETA)
Cortical coverage: 6,239 voxels (standard head model)
Brodmann areas: 44 (left + right hemisphere)
```

**NeuroGuide LORETA Normative Features:**
- Current Source Density (CSD) norms
- Functional Connectivity (Coherence + Phase) norms
- Effective Connectivity (Information Flow) norms
- Phase Reset (Phase Shift + Phase Lock Duration) norms

---

## 5. EEG Feature Normalization

### 5.1 Feature Taxonomy

#### 5.1.1 Absolute Power

**Definition**: Total power (microvolts squared, uV^2) in a frequency band at a given electrode.

| Band | Frequency Range | Clinical Relevance |
|------|----------------|-------------------|
| Delta | 1-4 Hz | Deep sleep, unconsciousness, brain injury, developmental issues |
| Theta | 4-8 Hz | Drowsiness, creativity, ADHD marker (frontal excess), meditation |
| Alpha | 8-12 Hz | Relaxed wakefulness, eyes-closed peak, decreases with age |
| Low Alpha | 8-10 Hz | Idling, posterior dominant rhythm |
| High Alpha | 10-12 Hz | Active inhibition, cognitive processing |
| Beta | 12-30 Hz | Active thinking, focus, anxiety (excess), medication effects |
| Low Beta | 12-15 Hz | Sensorimotor rhythm (SMR), relaxed attention |
| Mid Beta | 15-18 Hz | Active processing |
| High Beta | 18-25 Hz | Excitement, stress, cognitive load |
| Gamma | 25-45 Hz | Conscious attention, binding problem, meditation |

**Normalization**: Log transformation mandatory before z-score computation.

#### 5.1.2 Relative Power

**Definition**: Band power expressed as percentage of total power (1-30 Hz).

```python
relative_power_band = absolute_power_band / sum(all_bands_absolute_power) * 100
```

**Clinical Utility**: Less affected by overall amplitude differences (e.g., skull thickness, electrode impedance), more sensitive to distribution shifts.

**Key Ratios:**
- **Theta/Beta Ratio (TBR)**: Frontal theta / frontal beta; ADHD marker (Barry et al., 2003)
- **Theta/Alpha Ratio**: Cognitive fatigue, depression
- **Alpha/Theta Ratio**: Relaxation vs. alertness
- **Delta/Alpha Ratio**: Deep pathology indicator

#### 5.1.3 Coherence

**Definition**: Correlation coefficient (0-1) measuring phase consistency between two electrode sites at a given frequency.

```python
coherence(f) = |S_xy(f)|^2 / (S_xx(f) * S_yy(f))
```

Where S_xy is the cross-spectral density and S_xx, S_yy are auto-spectral densities.

**Clinical Interpretation:**
- **High coherence**: Functional coupling between regions
- **Low coherence**: Regional independence/specialization
- **Developmental pattern**: Coherence generally decreases with age (increasing specialization)
- **Pathological patterns**: Focal hyper-coherence (seizure risk), diffuse hyper-coherence (TBI), inter-hemispheric hypo-coherence (callosal issues)

**Total Coherence Comparisons (19 channels):**
- Number of unique pairs: C(19,2) = 171
- Per band: 171 coherence values
- Across 5 bands: 855 coherence z-scores

#### 5.1.4 Phase Lag / Phase Difference

**Definition**: Time delay (in degrees or milliseconds) between oscillations at two electrode sites.

```python
phase_difference(f) = arctan(Imag(S_xy(f)) / Real(S_xy(f)))
```

**Clinical Interpretation:**
- Phase lag reflects directional information flow
- Short phase lag = rapid communication
- Long phase lag = slower communication pathway
- Phase lag norms are less developed than coherence norms

#### 5.1.5 Amplitude Asymmetry

**Definition**: Log-ratio of power between homologous left/right electrode pairs.

```python
amplitude_asymmetry = log10(P_left / P_right)
```

**Key Asymmetry Pairs:**
- F3-F4 (frontal): Emotional regulation, depression, anxiety
- C3-C4 (central): Motor function
- T3-T4 (temporal): Language, memory
- P3-P4 (parietal): Spatial processing
- O1-O2 (occipital): Visual processing

**Clinical Patterns:**
- **Frontal alpha asymmetry (F4>F3)**: Associated with approach motivation, depression risk
- **Frontal alpha asymmetry (F3>F4)**: Associated with withdrawal, anxiety

#### 5.1.6 Phase Reset / Phase Lock Duration

**Definition**: Measures of neural synchronization dynamics (Thatcher et al., 2008, 2009).

- **Phase Shift Duration (SD)**: Time for phase relationship to change between two sites (~25-65 ms)
- **Phase Lock Duration (LD)**: Time that phase relationship remains stable (~300-450 ms)
- **Phase Reset (PR)**: Complete cycle = SD + LD

**Clinical Significance:**
- Phase reset metrics reflect neural network stability and flexibility
- Discrete temporal "quanta" suggest self-organized criticality in brain networks
- Abnormal phase reset patterns linked to ADHD, autism, TBI, depression
- NeuroGuide offers the only LORETA-level phase reset normative database

**NeuroGuide Phase Reset Norms:**
- 44 Brodmann areas x 44 Brodmann areas = 1,936 pairs
- 8 frequency bands
- Phase shift and phase lock duration norms
- Eyes-open and eyes-closed conditions

#### 5.1.7 Source Localization-Based Norms

**sLORETA/eLORETA Z-Scores:**
- Current source density at 6,239 voxels (7mm resolution)
- Standardized against Montreal Neurological Institute (MNI) MRI atlas
- 3D visualization of deviation from norm
- Brodmann area-level aggregation for clinical interpretation

**Key Brodmann Areas:**
- BA 8, 9, 10 (prefrontal): Executive function, working memory
- BA 11, 47 (orbitofrontal): Emotional regulation, reward
- BA 21, 22 (temporal): Language, auditory processing
- BA 39, 40 (parietal): Spatial processing, attention
- BA 17, 18, 19 (occipital): Visual processing

### 5.2 Eyes Open vs. Eyes Closed Norms

#### 5.2.1 Key Differences

| Feature | Eyes Closed (EC) | Eyes Open (EO) | Clinical Note |
|---------|-----------------|----------------|---------------|
| **Posterior alpha** | High (peak at 10 Hz) | Suppressed (alpha blocking) | Most reliable EC marker |
| **Overall alpha** | Higher across scalp | Lower across scalp | EO alpha ~30-50% lower posteriorly |
| **Delta** | Lower posteriorly | Higher posteriorly | EO > EC in delta |
| **Theta** | Lower frontally | Higher frontally | EO > EC in theta (developmental) |
| **Beta/Gamma** | Lower | Higher | EO > EC in all fast frequencies |
| **Task relevance** | Pure resting state | Alert resting state | Different clinical interpretations |

#### 5.2.2 DeepSynaps Recommendation

1. **Always record both conditions** (minimum 3 minutes each)
2. **Compute z-scores against condition-matched norms** (EC norms for EC data, EO norms for EO data)
3. **Never mix conditions** in z-score computation
4. **Report both conditions separately** in clinical displays
5. **Alpha reactivity index**: (EC_alpha - EO_alpha) / EC_alpha provides additional diagnostic information

### 5.3 Data Format Examples

#### 5.3.1 Normative Database Record Format (JSON)

```json
{
  "database_metadata": {
    "name": "DeepSynaps-NormDB-v1",
    "based_on": "ISB-NormDB-GAM",
    "version": "1.0.0",
    "created": "2025-06-17",
    "license": "Commercial/Research",
    "n_subjects_total": 1289,
    "age_range_months": [54, 972],
    "sex_stratified": true,
    "ethnicity": "Korean",
    "reference": "average_reference",
    "sampling_rate_hz": 250,
    "fft_window": "Hann",
    "epoch_length_sec": 2,
    "overlap_percent": 50
  },
  "feature_norm": {
    "abs_power_delta_F3_EC": {
      "feature_id": "abs_power_delta_F3_EC",
      "description": "Absolute delta power (1-4 Hz) at F3, eyes closed",
      "unit": "log_uV2",
      "transformation": "natural_log",
      "regression_method": "GAM",
      "gam_model": {
        "male": {
          "spline_coefficients": [...],
          "intercept": 2.345,
          "edf": 8.23,
          "gcv_score": 0.0412,
          "r_squared": 0.876
        },
        "female": {
          "spline_coefficients": [...],
          "intercept": 2.189,
          "edf": 7.91,
          "gcv_score": 0.0387,
          "r_squared": 0.891
        }
      },
      "sample_density": {
        "age_5yr": 85,
        "age_10yr": 72,
        "age_20yr": 68,
        "age_40yr": 95,
        "age_60yr": 102,
        "age_80yr": 45
      }
    }
  }
}
```

#### 5.3.2 Patient Z-Score Result Format (JSON)

```json
{
  "patient_id": "DS-PAT-2025-0042",
  "assessment_date": "2025-06-17T14:30:00Z",
  "demographics": {
    "age_months": 456,
    "sex": "F",
    "ethnicity": "East Asian",
    "handedness": "R"
  },
  "recording": {
    "amplifier_id": "Mitsar-EEG-201",
    "amplifier_matched": true,
    "sampling_rate_hz": 250,
    "channels": 19,
    "montage": "average_reference",
    "condition": "EC",
    "duration_sec": 180,
    "artifact_rejection": "ASR+ICA",
    "artifact_percent_rejected": 4.2
  },
  "normative_comparison": {
    "database_id": "ISB-NormDB-v2021",
    "database_ethnicity": "Korean",
    "ethnicity_match_warning": true,
    "confidence_tier": 4,
    "n_comparisons": 2350,
    "fdr_q_value": 0.05
  },
  "z_scores": {
    "absolute_power": {
      "delta": {
        "Fp1": {"z": 1.23, "percentile": 89.1, "sig": false},
        "F3": {"z": 2.34, "percentile": 99.0, "sig": true, "fdr_sig": true},
        "C3": {"z": 0.87, "percentile": 80.8, "sig": false},
        "P3": {"z": -0.45, "percentile": 32.6, "sig": false},
        "O1": {"z": -1.12, "percentile": 13.1, "sig": false}
      },
      "theta": { ... },
      "alpha": { ... },
      "beta": { ... },
      "gamma": { ... }
    },
    "relative_power": { ... },
    "coherence": { ... },
    "amplitude_asymmetry": { ... },
    "phase_lag": { ... }
  },
  "summary": {
    "n_significant_uncorrected": 89,
    "n_significant_fdr_corrected": 23,
    "n_elevated": 12,
    "n_reduced": 11,
    "top_deviation": "F3_delta_elevated_z2.34",
    "clinical_flags": ["frontal_delta_excess"]
  }
}
```

---

## 6. Governance & Confidence Model

### 6.1 Population Match Requirements

#### 6.1.1 Matching Dimensions

| Dimension | Priority | DeepSynaps Handling |
|-----------|----------|-------------------|
| **Age** | Critical | Exact age regression (month-level precision) |
| **Sex** | High | Separate norms when available (ISB-NormDB style) |
| **Ethnicity/Geography** | Medium-High | Warning flag if patient ethnicity differs from norm population |
| **Handedness** | Low | Note in record; no separate norms (insufficient data) |
| **Recording condition** | Critical | EO norms for EO data, EC norms for EC data |
| **Montage/Reference** | Critical | Separate norms for each montage; never mix |
| **Amplifier** | High | Amplifier matching required; calibration coefficients |
| **Medication status** | Medium | Flag if patient on CNS-active medication |
| **Time of day** | Low | Note in record |

#### 6.1.2 Ethnicity/Geographic Considerations

**Key Evidence:**
- ISB-NormDB (Korean) validated against qEEG-Pro (Dutch) showed r > 0.7 correlation, suggesting ethnicity has secondary influence on EEG norms after age/sex
- However, early multinational studies identified **socioeconomic status** as the most important predictor of EEG normality deviations
- CHBMP documentation explicitly warns that their Cuban sample had benefits of free education/healthcare that may differ from comparison populations
- **ChineseEEG Dataset** (2024) is the first Chinese-language-specific EEG resource but is research-focused (10 subjects, language paradigm), not a normative database

**DeepSynaps Ethnicity Matching Rules:**

```python
ETHNICITY_MATCH_SCORES = {
    ('East Asian', 'Korean'): 0.95,      # ISB-NormDB best match
    ('East Asian', 'Chinese'): 0.85,       # Cultural proximity
    ('East Asian', 'Dutch'): 0.60,         # Different population
    ('European', 'Dutch'): 0.95,           # qEEG-Pro best match
    ('European', 'American'): 0.90,        # NeuroGuide match
    ('Latin American', 'Cuban'): 0.95,     # CHBMP best match
    ('African', 'American_NeuroGuide'): 0.75,  # Suboptimal
}

MATCH_THRESHOLD = 0.80  # Below this, show warning
```

### 6.2 Age-Matching Protocols

1. **Exact age regression**: Use continuous age (in months) for GAM prediction; never round to nearest year
2. **Boundary protection**: For ages near database limits, reduce confidence tier
3. **Pediatric caution**: Ages < 2 years have limited normative data across all databases
4. **Geriatric caution**: Ages > 80 years may have insufficient sample density
5. **Developmental windows**: Critical periods (infancy, puberty, aging) require higher sample density

### 6.3 When Normative Data Is Inappropriate

Normative comparison is **CONTRAINDICATED** in the following situations:

| Condition | Reason | DeepSynaps Action |
|-----------|--------|-------------------|
| Age < 2 months | No normative data available | Block comparison, show message |
| Active seizure/epileptiform activity | Violates normative assumptions | Flag, suggest neurologist review |
| Severe head injury (acute) | Not a stable brain state | Defer comparison, acute care priority |
| Sedation/anesthesia | Alters EEG fundamentally | Block comparison |
| Active psychosis with medication changes | Non-steady state | Flag, defer until stable |
| Significant movement disorder | Excessive artifact | Flag, may not obtain valid recording |
| Recording quality < 60% artifact-free | Insufficient valid data | Request re-recording |
| Wrong amplifier (unmatched) | Systematic frequency bias | Block comparison until calibrated |

### 6.4 Research-Only Flagging

When normative comparison quality is insufficient for clinical decisions:

```python
RESEARCH_ONLY_TRIGGERS = [
    'ethnicity_mismatch_score < 0.60',
    'sample_density_at_age < 10',
    'amplifier_not_matched',
    'database_not_fda_cleared',
    'recording_duration < 2_minutes',
    'artifact_rejection_rate > 20%',
    'montage_norm_not_available',
    'age_outside_database_range',
]
```

When any trigger is active:
- Display **"RESEARCH USE ONLY"** watermark on all visualizations
- Disable clinical protocol suggestions
- Allow data exploration but add disclaimer
- Flag for clinician review

### 6.5 Confidence Scoring System (5-Tier)

```python
CONFIDENCE_TIERS = {
    1: {
        'label': 'INSUFFICIENT_DATA',
        'color': '#DC3545',  # Red
        'clinical_use': False,
        'description': 'Sample size < 10 at this age/sex. Do not use for clinical decisions.',
        'display_action': 'Show research-only banner, disable clinical features'
    },
    2: {
        'label': 'LOW_CONFIDENCE',
        'color': '#FD7E14',  # Orange
        'clinical_use': 'caution',
        'description': 'Sample size 10-25. Use with extreme caution.',
        'display_action': 'Show warning icon, qualify all interpretations'
    },
    3: {
        'label': 'MODERATE_CONFIDENCE',
        'color': '#FFC107',  # Yellow
        'clinical_use': True,
        'description': 'Sample size 25-50. Acceptable for clinical use with caveats.',
        'display_action': 'Show note about sample size'
    },
    4: {
        'label': 'HIGH_CONFIDENCE',
        'color': '#28A745',  # Green
        'clinical_use': True,
        'description': 'Sample size 50-100. Good clinical confidence.',
        'display_action': 'Standard display'
    },
    5: {
        'label': 'VERY_HIGH_CONFIDENCE',
        'color': '#198754',  # Dark green
        'clinical_use': True,
        'description': 'Sample size > 100. Excellent clinical confidence.',
        'display_action': 'Standard display, highest reliability'
    }
}
```

**Confidence tier is computed as the MINIMUM of:**
- Sample density at patient's age and sex
- Ethnicity match score
- Amplifier match status
- Recording quality score
- Database validation status

---

## 7. DeepSynaps Integration Architecture

### 7.1 System Architecture Overview

```
+------------------+     +-------------------+     +---------------------+
|   EEG Acquisition | --> |  Artifact Removal  | --> |  Feature Extraction  |
|   (Mitsar, etc.)  |     |  (ASR + ICA)       |     |  (FFT, Coherence)    |
+------------------+     +-------------------+     +---------+-----------+
                                                              |
+------------------+     +-------------------+                |
|   Neurofeedback   | <-- |  Protocol Engine   | <--------------+
|   Display/Game    |     |  (Target Selection)|
+------------------+     +---------+-----------+
                                   |
+------------------+     +---------v-----------+     +---------------------+
|   Clinical Report | <-- |  Z-Score Engine    | <-- |  Normative Database  |
|   Generator       |     |  (Real-time)       |     |  Adapter             |
+------------------+     +--------------------+     +---------+-----------+
                                                              |
                                    +-------------------------+----------+
                                    |          Normative Database Registry |
                                    |  +---------------+ +---------------+|
                                    |  | NeuroGuide    | |  qEEG-Pro     ||
                                    |  | (Primary)     | |  (Secondary)  ||
                                    |  +---------------+ +---------------+|
                                    |  +---------------+ +---------------+|
                                    |  | ISB-NormDB    | |  CHBMP        ||
                                    |  | (East Asian)  | |  (Open)       ||
                                    |  +---------------+ +---------------+|
                                    |  +---------------+ +---------------+|
                                    |  | BrainDX       | |  HBI          ||
                                    |  | (Tertiary)    | |  (ERP tasks)  ||
                                    |  +---------------+ +---------------+|
                                    +--------------------------------------+
```

### 7.2 Normative Database Adapter Architecture

```python
# ============================================
# DeepSynaps Normative Database Adapter Layer
# PHASE 1 Implementation
# ============================================

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import numpy as np


@dataclass
class NormDBMetadata:
    """Metadata for a normative database registration."""
    db_id: str                          # Unique identifier
    name: str                           # Human-readable name
    version: str                        # Semantic version
    developer: str                      # Organization
    country: str                        # Population origin
    ethnicity: str                      # Primary ethnicity
    fda_status: Optional[str]           # FDA 510(k), Registered, CE Mark, None
    age_range_months: Tuple[int, int]   # [min, max]
    sex_stratified: bool                # Separate M/F norms
    n_subjects_ec: int                  # Eyes-closed sample size
    n_subjects_eo: int                  # Eyes-open sample size
    channels: int                       # Number of EEG channels
    reference_types: List[str]          # Supported references
    sampling_rate_hz: int               # Original sampling rate
    frequency_range_hz: Tuple[float, float]
    features: List[str]                 # Supported feature types
    has_source_localization: bool       # LORETA/eLORETA support
    has_phase_reset: bool               # Phase reset norms
    has_erp_norms: bool                 # ERP norms
    license_type: str                   # Commercial, Research, Open
    cost_usd: Optional[float]           # Licensing cost
    confidence_tier_default: int        # Default confidence


class NormativeDatabaseAdapter(ABC):
    """
    Abstract base class for all normative database adapters.
    Each commercial/open database implements this interface.
    """
    
    @property
    @abstractmethod
    def metadata(self) -> NormDBMetadata:
        """Return database metadata."""
        pass
    
    @abstractmethod
    def get_zscore(self, 
                   feature_id: str,
                   patient_value: float,
                   age_months: float,
                   sex: str,
                   condition: str,  # 'EO' or 'EC'
                   montage: str) -> dict:
        """
        Compute z-score for a single feature.
        Must handle all transformations internally.
        """
        pass
    
    @abstractmethod
    def get_batch_zscores(self,
                          features: Dict[str, float],
                          age_months: float,
                          sex: str,
                          condition: str,
                          montage: str) -> Dict[str, dict]:
        """Compute z-scores for multiple features efficiently."""
        pass
    
    @abstractmethod
    def get_sample_density(self, age_months: float, sex: str) -> int:
        """Return number of normative subjects at given age/sex."""
        pass
    
    @abstractmethod
    def supports_feature(self, feature_id: str) -> bool:
        """Check if this database includes norms for the given feature."""
        pass
    
    @abstractmethod
    def covers_age(self, age_months: float) -> bool:
        """Check if patient's age is within database range."""
        pass
    
    @abstractmethod
    def get_age_regression_model(self, feature_id: str, sex: str) -> dict:
        """Return the age regression model parameters for audit."""
        pass


class ISBNormDBAdapter(NormativeDatabaseAdapter):
    """
    Adapter for ISB-NormDB (Korean, sex-differentiated, GAM-based).
    Primary adapter for East Asian populations.
    """
    
    @property
    def metadata(self) -> NormDBMetadata:
        return NormDBMetadata(
            db_id='ISB-NormDB-v2021',
            name='ISB-NormDB (Korean qEEG Normative Database)',
            version='2021.1.0',
            developer='iMediSync Inc. / Seoul National University',
            country='South Korea',
            ethnicity='Korean (East Asian)',
            fda_status='KFDA Approved',
            age_range_months=(54, 972),
            sex_stratified=True,
            n_subjects_ec=1289,
            n_subjects_eo=1290,
            channels=19,
            reference_types=['average_reference'],
            sampling_rate_hz=250,
            frequency_range_hz=(1.0, 45.0),
            features=['abs_power', 'rel_power', 'coherence', 
                      'asymmetry', 'source_level'],
            has_source_localization=True,
            has_phase_reset=False,
            has_erp_norms=False,
            license_type='Commercial',
            cost_usd=None,  # Contact iMediSync
            confidence_tier_default=4
        )
    
    def get_zscore(self, feature_id, patient_value, age_months, 
                   sex, condition, montage):
        # GAM-based prediction with log transformation
        # Implementation using pre-trained GAM models
        model = self._load_gam_model(feature_id, sex, condition, montage)
        log_val = np.log(patient_value + 1e-10)
        mu = model.predict(age_months)
        sigma = model.predict_sd(age_months)
        z = (log_val - mu) / sigma
        return self._format_result(z, mu, sigma)
    
    def _load_gam_model(self, feature_id, sex, condition, montage):
        # Load pre-computed GAM spline coefficients
        pass


class NeuroGuideAdapter(NormativeDatabaseAdapter):
    """
    Adapter for NeuroGuide Lifespan Normative Database.
    Most comprehensive, FDA 510(k) cleared.
    """
    
    @property
    def metadata(self) -> NormDBMetadata:
        return NormDBMetadata(
            db_id='NeuroGuide-LSNDB-v2013',
            name='NeuroGuide Lifespan Normative Database',
            version='2013.1.0',
            developer='Applied Neuroscience, Inc. / Robert Thatcher',
            country='USA',
            ethnicity='Multi-ethnic (71.4% White, 24.2% Black, 3.2% Asian)',
            fda_status='FDA 510(k) Cleared',
            age_range_months=(2, 984),
            sex_stratified=False,
            n_subjects_ec=727,
            n_subjects_eo=727,
            channels=19,
            reference_types=['linked_ears', 'average_reference', 'laplacian'],
            sampling_rate_hz=256,
            frequency_range_hz=(1.0, 30.0),
            features=['abs_power', 'rel_power', 'power_ratios', 'coherence',
                      'phase_delay', 'asymmetry', 'source_csd', 
                      'source_connectivity', 'phase_reset',
                      'cross_frequency'],
            has_source_localization=True,
            has_phase_reset=True,
            has_erp_norms=False,
            license_type='Commercial',
            cost_usd=3395,
            confidence_tier_default=4
        )


class CHBMPAdapter(NormativeDatabaseAdapter):
    """
    Adapter for Cuban Human Brain Mapping Project (CHBMP).
    Open-access, research validation use.
    """
    
    @property
    def metadata(self) -> NormDBMetadata:
        return NormDBMetadata(
            db_id='CHBMP-v2021',
            name='Cuban Human Brain Mapping Project',
            version='2021.1.0',
            developer='Centro de Neurociencias de Cuba',
            country='Cuba',
            ethnicity='Cuban/Latin American',
            fda_status=None,
            age_range_months=(60, 960),
            sex_stratified=True,
            n_subjects_ec=211,
            n_subjects_eo=211,
            channels=19,
            reference_types=['linked_ears'],
            sampling_rate_hz=256,
            frequency_range_hz=(1.0, 30.0),
            features=['abs_power', 'rel_power', 'coherence', 
                      'asymmetry', 'mean_freq'],
            has_source_localization=False,
            has_phase_reset=False,
            has_erp_norms=False,
            license_type='Open Access (CONP)',
            cost_usd=0,
            confidence_tier_default=3
        )


# ============================================
# Database Registry and Patient Matching
# ============================================

class NormativeDatabaseRegistry:
    """
    Central registry for all normative databases.
    Handles database selection, patient matching, and confidence scoring.
    """
    
    def __init__(self):
        self._adapters: Dict[str, NormativeDatabaseAdapter] = {}
        self._primary_db: Optional[str] = None
        
    def register(self, adapter: NormativeDatabaseAdapter, primary: bool = False):
        """Register a normative database adapter."""
        self._adapters[adapter.metadata.db_id] = adapter
        if primary:
            self._primary_db = adapter.metadata.db_id
    
    def select_database(self, 
                        patient_demographics: dict,
                        recording_params: dict,
                        clinical_context: dict) -> Tuple[str, dict]:
        """
        Select best database match for a patient.
        
        Returns:
            (db_id, match_report)
        """
        scores = []
        
        for db_id, adapter in self._adapters.items():
            meta = adapter.metadata
            score = 0.0
            reasons = []
            
            # 1. Age coverage (0-30 points)
            if meta.covers_age(patient_demographics['age_months']):
                score += 30
                density = adapter.get_sample_density(
                    patient_demographics['age_months'],
                    patient_demographics.get('sex', 'Unknown')
                )
                if density > 100:
                    score += 0
                elif density > 50:
                    score -= 5
                elif density > 25:
                    score -= 10
                else:
                    score -= 20
            else:
                reasons.append("Age out of range")
            
            # 2. Ethnicity match (0-25 points)
            eth_score = self._ethnicity_match(
                patient_demographics.get('ethnicity', 'Unknown'),
                meta.ethnicity
            )
            score += eth_score * 25
            if eth_score < 0.8:
                reasons.append(f"Ethnicity mismatch: {meta.ethnicity}")
            
            # 3. Condition support (0-15 points)
            condition = recording_params.get('condition', 'EC')
            if condition == 'EC' and meta.n_subjects_ec > 50:
                score += 15
            elif condition == 'EO' and meta.n_subjects_eo > 50:
                score += 15
            else:
                reasons.append("Insufficient condition data")
            
            # 4. Montage match (0-15 points)
            montage = recording_params.get('montage', 'linked_ears')
            if montage in meta.reference_types:
                score += 15
            else:
                reasons.append(f"Montage {montage} not supported")
            
            # 5. FDA status (0-15 points)
            if meta.fda_status and '510(k)' in meta.fda_status:
                score += 15
            elif meta.fda_status:
                score += 10
            else:
                reasons.append("Not FDA cleared")
            
            scores.append({
                'db_id': db_id,
                'score': score,
                'reasons': reasons,
                'metadata': meta
            })
        
        # Sort by score descending
        scores.sort(key=lambda x: x['score'], reverse=True)
        
        best = scores[0]
        return best['db_id'], {
            'selection_score': best['score'],
            'warnings': best['reasons'],
            'all_matches': scores,
            'confidence_tier': self._score_to_tier(best['score'])
        }
    
    def _ethnicity_match(self, patient_eth: str, db_eth: str) -> float:
        """Compute ethnicity match score."""
        # See ETHNICITY_MATCH_SCORES dictionary in section 6.1.2
        return ETHNICITY_MATCH_SCORES.get(
            (patient_eth, db_eth), 0.5
        )
    
    def _score_to_tier(self, score: float) -> int:
        if score >= 90: return 5
        elif score >= 75: return 4
        elif score >= 60: return 3
        elif score >= 40: return 2
        else: return 1
```

### 7.3 Real-Time Z-Score Calculation Pipeline

```
+------------------+    +---------------------+    +------------------+
|  EEG Buffer      |    |  FFT Computation    |    |  Feature Vector   |
|  (256 Hz, 19ch)  | -> |  (Epoch: 2s, 50%)  | -> |  (All metrics)    |
+------------------+    +---------------------+    +--------+---------+
                                                            |
+------------------+    +---------------------+    +--------v---------+
|  Feedback Signal | <- |  Threshold Engine   | <- |  Z-Score Lookup  |
|  (Reward/Audio)  |    |  (% in range)       |    |  (Norm DB)       |
+------------------+    +---------------------+    +------------------+

Timing Requirements:
- Epoch length: 2 seconds (512 samples at 256 Hz)
- Overlap: 50% (new computation every 1 second)
- Z-score lookup latency: < 5 ms (pre-computed GAM)
- Total pipeline latency: < 100 ms end-to-end
- Display update rate: 1 Hz (every epoch)
```

**Performance Specifications:**
- CPU load: < 10% (modern processor)
- Memory: ~500 MB for full normative database cache
- Disk: ~2 GB per database (compressed GAM models)

### 7.4 Patient-to-Norm Matching Logic

```python
def match_patient_to_norm(patient, registry) -> MatchResult:
    """
    Full patient-to-norm matching pipeline.
    """
    
    # Step 1: Validate patient record
    validation = validate_patient_record(patient)
    if not validation.ok:
        return MatchResult(error=validation.errors)
    
    # Step 2: Select best database
    db_id, match_report = registry.select_database(
        patient.demographics,
        patient.recording_params,
        patient.clinical_context
    )
    
    # Step 3: Check contraindications
    contraindications = check_contraindications(patient)
    
    # Step 4: Compute confidence tier
    confidence = compute_overall_confidence(
        match_report['selection_score'],
        match_report['warnings'],
        contraindications
    )
    
    # Step 5: Generate match report
    return MatchResult(
        database_id=db_id,
        match_score=match_report['selection_score'],
        confidence_tier=confidence.tier,
        clinical_usable=confidence.tier >= 3 and not contraindications,
        warnings=match_report['warnings'],
        contraindications=contraindications,
        research_only=confidence.tier < 3 or bool(contraindications)
    )
```

### 7.5 Display Rules for qEEG Analyzer

#### 7.5.1 Topographic Map Display

```python
DISPLAY_RULES = {
    'topographic_map': {
        'z_score_range': (-3.0, +3.0),           # Color scale limits
        'colormap': 'RdBu_r',                       # Red=elevated, Blue=reduced
        'contour_levels': [-2.58, -1.96, 0, 1.96, 2.58],
        'significance_overlay': True,               # Show FDR-corrected regions
        'confidence_masking': True,                 # Mask low-confidence regions
    },
    'z_score_table': {
        'sort_by': 'z_score_abs',                   # Sort by |z-score| descending
        'highlight_threshold': 1.96,                # Highlight significant rows
        'show_uncorrected': True,                   # Show raw p-values
        'show_fdr_corrected': True,                 # Show FDR-corrected values
        'color_coding': True,                       # Color by significance level
    },
    'spectral_display': {
        'show_patient_spectrum': True,
        'show_normative_band': True,                # Mean +/- 1 SD shading
        'show_percentile_markers': [5, 50, 95],
        'frequency_resolution': 0.5,                # Hz
    },
    'deviation_metrics': {
        'total_comparisons': 2350,
        'significant_uncorrected': 'count + %',
        'significant_fdr_corrected': 'count + %',
        'n_elevated': 'count',
        'n_reduced': 'count',
        'top_5_deviations': 'list',
    }
}
```

#### 7.5.2 Clinical Interpretation Display

```
+----------------------------------------------------------+
| DeepSynaps qEEG Analysis Report                         |
+----------------------------------------------------------+
| Patient: DS-PAT-0042 | Age: 38y F | Date: 2025-06-17    |
| Database: ISB-NormDB-v2021 | Confidence: HIGH (Tier 4)  |
+----------------------------------------------------------+
|                                                           |
| [Topographic Maps: Delta Theta Alpha Beta Gamma]         |
| [Z-Score Table: Sorted by deviation magnitude]           |
| [Spectra: Patient vs. Normative bands]                   |
| [Source Analysis: LORETA (if available)]                 |
|                                                           |
| Summary Statistics:                                      |
| - Total comparisons: 2,350                                |
| - Significant (uncorrected): 89 (3.8%)                   |
| - Significant (FDR-corrected): 23 (1.0%)                 |
| - Elevated: 12 | Reduced: 11                             |
|                                                           |
| Top Deviations:                                          |
| 1. F3 Delta: z=+2.34 (elevated)                         |
| 2. P4 Alpha: z=-2.12 (reduced)                          |
| 3. F7-F8 Coherence (Theta): z=+2.08                     |
|                                                           |
| Clinical Flags:                                          |
| [WARNING] Frontal delta excess - consider ADHD evaluation|
| [NOTE] Posterior alpha reduction - monitor               |
|                                                           |
+----------------------------------------------------------+
```

### 7.6 Integration with Neurofeedback Workflow

```
Phase 1: Assessment
  |
  v
+----------------------------------+
| 1. Record EEG (EO + EC, 3 min)  |
| 2. Artifact rejection (ASR+ICA) |
| 3. Feature extraction           |
| 4. Z-score computation          |
| 5. Database matching            |
| 6. Confidence scoring           |
| 7. Report generation            |
+----------------------------------+
  |
  v
Phase 2: Protocol Selection
  |
  v
+----------------------------------+
| 1. Identify top deviations      |
| 2. Link to symptom checklist    |
| 3. Suggest training targets     |
| 4. Clinician review/approval    |
+----------------------------------+
  |
  v
Phase 3: Neurofeedback Training
  |
  v
+----------------------------------+
| 1. Real-time z-score computation|
| 2. Threshold monitoring         |
| 3. Reward signal generation     |
| 4. Progress tracking            |
| 5. Session statistics           |
+----------------------------------+
  |
  v
Phase 4: Re-assessment
  |
  v
+----------------------------------+
| 1. Post-treatment recording     |
| 2. Z-score comparison           |
| 3. Change metrics (pre-post)    |
| 4. Outcome report               |
+----------------------------------+
```

---

## 8. Provenance & Licensing

### 8.1 Provenance Tracking

Every z-score computation must track:

```python
PROVENANCE_RECORD = {
    'computation_id': 'uuid-v4',
    'timestamp_utc': '2025-06-17T14:30:00Z',
    'database': {
        'db_id': 'ISB-NormDB-v2021',
        'version': '2021.1.0',
        'developer': 'iMediSync Inc.',
        'population': 'Korean, 1289 subjects, 4.5-81 yr',
        'fda_status': 'KFDA Approved'
    },
    'model': {
        'regression_method': 'GAM',
        'spline_order': 3,
        'transformation': 'natural_log',
        'sex_stratified': True,
        'sex_model_used': 'female'
    },
    'patient': {
        'age_months': 456,
        'sex': 'F',
        'ethnicity': 'East Asian',
        'ethnicity_match_score': 0.95
    },
    'recording': {
        'amplifier': 'Mitsar-EEG-201',
        'amplifier_matched': True,
        'montage': 'average_reference',
        'condition': 'EC',
        'artifact_rejection_method': 'ASR+ICA',
        'artifact_rejection_rate_percent': 4.2
    },
    'features_computed': 2350,
    'multiple_comparison_method': 'FDR_BenjaminiHochberg',
    'fdr_q_value': 0.05,
    'software_version': 'DeepSynaps-v1.0.0',
    'confidence_tier': 4
}
```

### 8.2 Licensing Framework

| Database | License Type | DeepSynaps Usage | Cost Estimate |
|----------|-------------|-----------------|---------------|
| **NeuroGuide** | Commercial per-seat | Clinical: Requires ANI license | $3,395-$6,000+ |
| **BrainDX** | Commercial | Clinical: Requires BrainDX license | Contact vendor |
| **HBI** | Commercial | Clinical: Requires HBImed license | Contact vendor |
| **qEEG-Pro** | Commercial | Clinical: Requires qEEG-Pro license | Contact vendor |
| **ISB-NormDB** | Commercial | Clinical: Requires iMediSync license | Contact vendor |
| **CHBMP** | Open Access (CONP) | Research + Commercial (with attribution) | Free |
| **ChineseEEG** | Open Access | Research validation | Free |

### 8.3 Compliance Requirements

1. **FDA 510(k)**: If DeepSynaps makes clinical claims based on normative comparisons, the system may require FDA clearance
2. **Data attribution**: All reports must cite the normative database used
3. **Version tracking**: Database versions must be tracked for reproducibility
4. **Audit trail**: All z-score computations must be auditable
5. **Research-only flags**: Automatically applied when confidence is insufficient

---

## 9. Implementation Recommendations

### 9.1 Phase 1 Implementation (Immediate)

| Priority | Task | Timeline | Effort |
|----------|------|----------|--------|
| 1 | Implement CHBMP adapter (open-access validation) | Week 1-2 | 2 dev-days |
| 2 | Implement core z-score engine with GAM support | Week 2-3 | 3 dev-days |
| 3 | Implement confidence scoring system (5-tier) | Week 3-4 | 2 dev-days |
| 4 | Build database registry with matching logic | Week 4-5 | 3 dev-days |
| 5 | Integrate with EEG acquisition pipeline | Week 5-6 | 2 dev-days |
| 6 | Build topographic map display component | Week 6-7 | 3 dev-days |
| 7 | Implement FDR multiple comparison correction | Week 7 | 1 dev-day |
| 8 | Clinical safety rule engine | Week 7-8 | 2 dev-days |

### 9.2 Phase 2 Implementation (Commercial Integration)

| Priority | Task | Timeline | Effort |
|----------|------|----------|--------|
| 1 | NeuroGuide adapter (licensed) | Month 2-3 | 5 dev-days |
| 2 | ISB-NormDB adapter (East Asian focus) | Month 3 | 4 dev-days |
| 3 | qEEG-Pro adapter (European focus) | Month 3-4 | 4 dev-days |
| 4 | LORETA source-level z-score integration | Month 4-5 | 5 dev-days |
| 5 | Real-time neurofeedback z-score loop | Month 5-6 | 5 dev-days |
| 6 | Automated clinical report generation | Month 6 | 4 dev-days |

### 9.3 Technical Stack Recommendations

| Component | Recommended Technology | Rationale |
|-----------|----------------------|-----------|
| GAM computation | pyGAM or R mgcv | Mature spline fitting |
| FFT/Signal processing | MNE-Python | Gold standard for EEG |
| Topographic maps | Matplotlib + MNE viz | Proven EEG visualization |
| Source localization | LORETA-Key (sLORETA) | Free, validated |
| Real-time processing | Python + ZeroMQ | <100ms latency achievable |
| Data storage | PostgreSQL + JSONB | Flexible normative records |
| Caching | Redis | <5ms z-score lookup |

### 9.4 Data Structure Recommendations

```sql
-- Normative database feature norms table
CREATE TABLE norm_feature_models (
    id SERIAL PRIMARY KEY,
    db_id VARCHAR(50) REFERENCES norm_databases(db_id),
    feature_id VARCHAR(100) NOT NULL,
    feature_type VARCHAR(50),        -- abs_power, rel_power, coherence, etc.
    band VARCHAR(20),                -- delta, theta, alpha, beta, gamma
    electrode VARCHAR(10),           -- F3, Cz, O1, etc. (NULL for pair features)
    electrode_pair VARCHAR(20),      -- F3-F4 (for coherence/asymmetry)
    condition VARCHAR(5),            -- EO or EC
    montage VARCHAR(20),             -- linked_ears, avg_ref, laplacian
    sex VARCHAR(1),                  -- M, F, or NULL for combined
    
    -- GAM model parameters
    regression_method VARCHAR(20),   -- GAM, polynomial, sliding_window
    spline_coefficients JSONB,       -- GAM spline coefficients
    intercept FLOAT,
    model_edf FLOAT,                 -- Effective degrees of freedom
    gcv_score FLOAT,                 -- Generalized cross-validation
    r_squared FLOAT,
    
    -- Validation metrics
    n_subjects INTEGER,
    age_min_months INTEGER,
    age_max_months INTEGER,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    version VARCHAR(20),
    
    UNIQUE(db_id, feature_id, condition, montage, sex)
);

-- Patient z-score results table
CREATE TABLE patient_zscore_results (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    assessment_id VARCHAR(50) NOT NULL,
    computation_timestamp TIMESTAMP DEFAULT NOW(),
    
    -- Database provenance
    db_id VARCHAR(50),
    db_version VARCHAR(20),
    
    -- Feature reference
    feature_id VARCHAR(100),
    feature_type VARCHAR(50),
    
    -- Values
    patient_value_raw FLOAT,
    patient_value_transformed FLOAT,
    expected_mean FLOAT,
    expected_sd FLOAT,
    z_score FLOAT,
    percentile FLOAT,
    
    -- Significance
    is_significant_uncorrected BOOLEAN,
    is_significant_fdr_corrected BOOLEAN,
    fdr_q_value FLOAT,
    direction VARCHAR(10),           -- elevated or reduced
    
    -- Confidence
    confidence_tier INTEGER,
    sample_density INTEGER,
    
    -- Full provenance
    provenance JSONB,
    
    UNIQUE(patient_id, assessment_id, feature_id, db_id)
);
```

---

## 10. Clinical Safety Rules

### 10.1 Mandatory Safety Rules

```python
CLINICAL_SAFETY_RULES = {
    'RULE_01_AGE_RANGE': {
        'description': 'Block comparison if patient age outside database range',
        'severity': 'BLOCKING',
        'check': 'patient_age_months >= db_age_min AND patient_age_months <= db_age_max',
        'message': 'Patient age {age} is outside the normative database range. '
                   'Clinical comparison is not available for this age group.'
    },
    
    'RULE_02_AMPLIFIER_MATCH': {
        'description': 'Warn if amplifier not matched to database',
        'severity': 'WARNING',
        'check': 'amplifier_matched == True',
        'message': 'Amplifier {model} is not matched to the normative database. '
                   'Systematic frequency bias may produce spurious z-scores.'
    },
    
    'RULE_03_CONFIDENCE_TIER': {
        'description': 'Research-only flag for tier < 3',
        'severity': 'RESEARCH_ONLY',
        'check': 'confidence_tier >= 3',
        'message': 'Low confidence tier ({tier}): insufficient normative data. '
                   'Results are for research exploration only.'
    },
    
    'RULE_04_EPILEPTIFORM': {
        'description': 'Flag epileptiform activity before normative comparison',
        'severity': 'BLOCKING',
        'check': 'not has_epileptiform_activity',
        'message': 'Epileptiform activity detected. Normative comparison is '
                   'contraindicated. Refer to neurologist.'
    },
    
    'RULE_05_RECORDING_QUALITY': {
        'description': 'Minimum 60% artifact-free data required',
        'severity': 'BLOCKING',
        'check': 'artifact_rejection_rate <= 40',
        'message': 'Recording quality insufficient ({rate}% rejected). '
                   'Minimum 60% valid data required for reliable comparison.'
    },
    
    'RULE_06_EO_EC_MATCH': {
        'description': 'EO norms for EO data, EC norms for EC data',
        'severity': 'BLOCKING',
        'check': 'condition == norm_condition',
        'message': 'Condition mismatch: patient recorded {patient_cond} but '
                   'norms are for {norm_cond}.'
    },
    
    'RULE_07_MONOGRAPH_MATCH': {
        'description': 'Montage-specific norms only',
        'severity': 'BLOCKING',
        'check': 'montage in db_supported_montages',
        'message': 'Montage {montage} not supported by database {db}. '
                   'Available: {available_montages}.'
    },
    
    'RULE_08_MEDICATION_FLAG': {
        'description': 'Flag CNS-active medication',
        'severity': 'WARNING',
        'check': 'not on_cns_medication',
        'message': 'Patient reported CNS-active medication. EEG patterns may '
                   'be medication-influenced. Interpret with caution.'
    },
    
    'RULE_09_FDR_CORRECTION': {
        'description': 'Always apply FDR correction for clinical decisions',
        'severity': 'REQUIRED',
        'check': 'fdr_correction_applied == True',
        'message': 'FDR correction required for clinical interpretation. '
                   'Uncorrected results may contain false positives.'
    },
    
    'RULE_10_ETHNICITY_WARNING': {
        'description': 'Warn if patient ethnicity differs from norm population',
        'severity': 'WARNING',
        'check': 'ethnicity_match_score >= 0.80',
        'message': 'Ethnicity mismatch: patient ({patient_eth}) vs. '
                   'database ({db_eth}). Match score: {score}.'
    },
    
    'RULE_11_MINIMUM_DURATION': {
        'description': 'Minimum 2 minutes recording per condition',
        'severity': 'WARNING',
        'check': 'recording_duration_sec >= 120',
        'message': 'Recording duration ({dur}s) below recommended minimum. '
                   'Longer recordings improve reliability.'
    },
    
    'RULE_12_DATABASE_ATTRIBUTION': {
        'description': 'Every report must cite database source',
        'severity': 'REQUIRED',
        'check': 'database_citation_in_report == True',
        'message': 'Database attribution required on all clinical reports.'
    }
}
```

### 10.2 Safety Rule Engine

```python
class ClinicalSafetyEngine:
    """
    Evaluates all clinical safety rules before allowing
    normative comparison results to be displayed or used clinically.
    """
    
    def evaluate(self, patient_context, database_context) -> SafetyResult:
        results = []
        blocking_rules_triggered = []
        warnings = []
        
        for rule_id, rule in CLINICAL_SAFETY_RULES.items():
            passed = self._evaluate_rule(rule, patient_context, database_context)
            
            results.append({
                'rule_id': rule_id,
                'passed': passed,
                'severity': rule['severity'],
                'message': rule['message'] if not passed else None
            })
            
            if not passed:
                if rule['severity'] == 'BLOCKING':
                    blocking_rules_triggered.append(rule_id)
                elif rule['severity'] in ('WARNING', 'RESEARCH_ONLY'):
                    warnings.append(rule_id)
        
        return SafetyResult(
            can_proceed_clinically=len(blocking_rules_triggered) == 0,
            can_display_research_only=len(blocking_rules_triggered) == 0,
            blocking_rules=blocking_rules_triggered,
            warnings=warnings,
            all_results=results
        )
```

---

## 11. Risks & Mitigations

### 11.1 Risk Register

| ID | Risk | Probability | Impact | Mitigation | Owner |
|----|------|-------------|--------|------------|-------|
| R01 | Z-score miscalculation due to wrong transformation | Medium | Critical | Automated validation pipeline; unit tests for known cases; log transform enforcement | Engineering |
| R02 | Age regression model failure at boundaries | Medium | High | Confidence tier reduction near boundaries; boundary interpolation warnings | Data Science |
| R03 | Ethnicity bias in normative comparison | High | High | Multi-database support; ethnicity match scoring; research-only flags; local validation studies | Clinical Team |
| R04 | Amplifier mismatch producing spurious z-scores | Medium | Critical | Amplifier calibration protocol; mandatory amplifier matching check; frequency response validation | Engineering |
| R05 | Database licensing termination | Low | Critical | Multi-database architecture; open-source fallback (CHBMP); contractual safeguards | Legal |
| R06 | Insufficient normative data for pediatric/geriatric | High | Medium | Tier 1/2 confidence flags; research-only mode; age-specific protocol warnings | Clinical Team |
| R07 | Multiple comparison false positives | Medium | High | Mandatory FDR correction; Bonferroni for conservative mode; cluster thresholding | Data Science |
| R08 | Phase reset/complexity norms unavailable | Medium | Medium | Clear feature availability matrix; NeuroGuide as primary for advanced features | Product |
| R09 | Real-time latency exceeds threshold | Low | High | GPU acceleration for FFT; pre-computed z-score lookup tables; Redis caching | Engineering |
| R10 | Data provenance loss | Low | Critical | Immutable provenance records; versioned database models; audit logging | Engineering |
| R11 | LORETA source localization error | Medium | Medium | Multiple inverse methods; quality metrics for source reconstruction; expert review flag | Clinical Team |
| R12 | Regulatory non-compliance (FDA) | Medium | Critical | Classify as research tool initially; pursue 510(k) for clinical claims; legal review | Legal |

### 11.2 Risk Mitigation Matrix

#### R01: Z-Score Miscalculation (CRITICAL)

```python
# Automated validation test
TEST_CASES = [
    # (input_value, age, sex, feature, expected_z_range)
    (10.0, 240, 'M', 'abs_power_alpha_F3_EC', (-0.5, 0.5)),  # Normal adult
    (50.0, 240, 'M', 'abs_power_alpha_F3_EC', (2.0, 4.0)),   # Elevated adult
    (1.0, 60, 'F', 'abs_power_delta_Fp1_EC', (0.5, 2.5)),    # Child pattern
]

def validate_zscore_computation(adapter):
    """Run all test cases against adapter."""
    for val, age, sex, feat, expected_range in TEST_CASES:
        result = adapter.get_zscore(val, age, sex, feat, 'EC', 'avg_ref')
        assert expected_range[0] <= result['z_score'] <= expected_range[1], \
            f"Validation failed for {feat}: z={result['z_score']}"
```

#### R03: Ethnicity Bias (HIGH PRIORITY)

**Mitigation Strategy:**
1. **Immediate**: Implement ethnicity match scoring with warning system
2. **Short-term**: Partner with iMediSync (ISB-NormDB) for East Asian coverage
3. **Medium-term**: Validate qEEG-Pro (Dutch) and NeuroGuide (US multi-ethnic) against local populations
4. **Long-term**: Support development of population-specific normative databases

#### R05: Database Licensing (HIGH PRIORITY)

**Mitigation Strategy:**
1. Implement multi-database adapter architecture (no single point of failure)
2. Maintain CHBMP integration as always-available open-source fallback
3. Negotiate multi-year licensing agreements with primary vendors
4. Build internal capability to create custom norms from client data (qEEG-Pro model)

### 11.3 Fallback Strategy

In the event that all commercial normative databases become unavailable:

```python
FALLBACK_STRATEGY = {
    'level_1': {
        'description': 'Use CHBMP open-access database',
        'accuracy': 'Moderate (Cuban population, n=211)',
        'clinical_use': 'Research only with warnings'
    },
    'level_2': {
        'description': 'Use published normative equations (Thatcher 2003)',
        'accuracy': 'Low (published means/SDs only)',
        'clinical_use': 'Educational reference only'
    },
    'level_3': {
        'description': 'Build local norms from clinic population',
        'accuracy': 'Variable (depends on sample size)',
        'clinical_use': 'Internal reference with caveats'
    },
    'level_4': {
        'description': 'Raw score display without normative comparison',
        'accuracy': 'N/A',
        'clinical_use': 'Expert interpretation required'
    }
}
```

---

## Appendices

### Appendix A: Glossary

| Term | Definition |
|------|------------|
| **qEEG** | Quantitative EEG - mathematical analysis of EEG signals |
| **Z-score** | Standardized deviation from normative mean (Z ~ N(0,1)) |
| **Normative Database** | Collection of healthy subject EEG data for comparison |
| **GAM** | Generalized Additive Model - flexible regression method |
| **LORETA** | Low Resolution Electromagnetic Tomography - source localization |
| **sLORETA** | Standardized LORETA - exact, zero-error localization |
| **eLORETA** | Exact LORETA - improved version with exact localization |
| **CSD** | Current Source Density - surface Laplacian transformation |
| **Coherence** | Measure of phase consistency between two signals |
| **Phase Reset** | Neural synchronization dynamic (shift + lock cycle) |
| **FDR** | False Discovery Rate - multiple comparison correction |
| **Amplifier Matching** | Calibrating amplifier frequency response to database |
| **EC/EO** | Eyes Closed / Eyes Open recording conditions |
| **10-20 System** | Standard EEG electrode placement system |

### Appendix B: Key Publications

1. Thatcher et al. (2003). "Quantitative EEG Normative Databases: Validation and Clinical Correlation." *Journal of Neurotherapy*, 7(3-4), 87-121.
2. Thatcher (2010). "Reliability and validity of quantitative electroencephalography (qEEG)." *J. Neurotherapy*, 14, 122-152.
3. Ko et al. (2021). "Quantitative Electroencephalogram Standardization: A Sex- and Age-Differentiated Normative Database." *Frontiers in Neuroscience*, 15, 766781.
4. Keizer et al. (2019). "Standardization and Personalized Medicine Using qEEG."
5. Bosch-Bayard et al. (2021). "The Cuban Human Brain Mapping Project." *Nature Scientific Data*.
6. Barry et al. (2003). "The adult EEG: normative aging and clinical implication." *Clinical Neurophysiology*.
7. Kropotov (2016). *Functional Neuromarkers for Psychiatry: Applications for Diagnosis and Treatment*. Academic Press.
8. Thatcher & Lubar (2014). *Z Score Neurofeedback: Clinical Applications*. Academic Press.

### Appendix C: Normative Database Validation Checklist

For any normative database used in DeepSynaps, verify:

- [ ] Peer-reviewed publications describing construction methodology
- [ ] FDA 510(k) clearance or equivalent regulatory status
- [ ] Amplifier matching protocol documented
- [ ] Artifact rejection methodology described and validated
- [ ] Test-retest reliability reported (>0.8 acceptable)
- [ ] Inclusion/exclusion criteria clearly defined
- [ ] Minimum sample size per age group: N >= 25
- [ ] Gaussian cross-validation sensitivity reported
- [ ] Clinical correlation studies published
- [ ] Age regression method documented
- [ ] Eyes open and eyes closed norms available
- [ ] Multiple montage norms available (minimum: linked ears, average reference)

### Appendix D: Implementation Checklist

- [ ] CHBMP adapter implemented and validated
- [ ] Core z-score engine with GAM support
- [ ] Log transformation enforced for power features
- [ ] 5-tier confidence scoring system
- [ ] Database registry with patient matching
- [ ] FDR multiple comparison correction
- [ ] Clinical safety rule engine (12 rules)
- [ ] Research-only flagging system
- [ ] Provenance tracking for all computations
- [ ] Topographic map visualization
- [ ] Real-time z-score computation pipeline
- [ ] Neurofeedback protocol integration
- [ ] Automated clinical report generation
- [ ] Unit tests for z-score validation cases
- [ ] Documentation and clinical training materials

---

**END OF REPORT**

*Document generated for DeepSynaps Protocol Studio - PHASE 1 Knowledge Layer*
*Classification: Technical Integration Report*
*Next Review: Upon PHASE 2 commercial database integration*
