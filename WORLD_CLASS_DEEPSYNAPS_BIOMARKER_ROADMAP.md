# DeepSynaps Protocol Studio: World-Class Biomarker Evidence Roadmap
## Clinical Biomarker Intelligence for Neuromodulation & Neuropsychiatric Care

**Version:** 1.0 | **Date:** July 2025
**Evidence Grade:** A=Meta-analysis/RCT, B=Cohort/Controlled, C=Observational/Preclinical
**Clinical Safety Disclaimer:** All biomarkers documented herein are for clinical decision support only. No biomarker should be used as a standalone diagnostic tool. All findings require clinical interpretation within the full patient context.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [qEEG Biomarker Evidence Matrix](#2-qeeg-biomarker-evidence-matrix)
3. [MRI Neuromarker Evidence Matrix](#3-mri-neuromarker-evidence-matrix)
4. [Blood/Lab Biomarker Matrix](#4-bloodlab-biomarker-matrix)
5. [Wearable/Digital Biomarker Matrix](#5-wearabledigital-biomarker-matrix)
6. [Multimodal Fusion Design](#6-multimodal-fusion-design)
7. [Open Source Integration Opportunities](#7-open-source-integration-opportunities)
8. [UX Benchmark Findings](#8-ux-benchmark-findings)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Sources & Citations](#10-sources--citations)

---

## 1. Executive Summary

### Key Findings Overview

This comprehensive evidence review synthesizes the latest clinical biomarker research across six modalities relevant to neuromodulation and neuropsychiatric care. The evidence landscape reveals a rapidly maturing field with significant advances in blood-based neurodegeneration markers (NfL, p-tau181), MRI brain age prediction, and wearable-derived circadian biomarkers, while qEEG biomarkers show mixed diagnostic utility.

### Critical Evidence Summary

| Modality | Highest-Evidence Biomarker | Evidence Grade | Clinical Readiness |
|----------|---------------------------|----------------|-------------------|
| qEEG | EEG slowing (theta/delta increase) for dementia | B (systematic reviews) | Clinical adjunct |
| qEEG | Frontal alpha asymmetry for depression | A (meta-analysis, mixed results) | Research-only |
| qEEG | Theta/Beta Ratio for ADHD | A (meta-analysis, no diagnostic value confirmed) | Neurofeedback stratification only |
| MRI | Hippocampal volume for AD | A (established) | Clinical standard |
| MRI | Brain age prediction | B (deep learning, >14K subjects) | Emerging clinical |
| Blood | Plasma p-tau181 for AD pathology | A (multiple cohorts, AUC >0.96) | Clinical implementation |
| Blood | Plasma NfL for neurodegeneration | A (broad evidence) | Clinical implementation |
| Blood | IL-6 for depression inflammation | B (Mendelian randomization) | Research/clinical adjunct |
| Wearable | Circadian rhythm (CosinorAge) | B (80K+ participants) | Emerging screening |
| Wearable | Sleep fragmentation for depression/anxiety | B (wrist-wearable RCTs) | Clinical adjunct |

### Strategic Recommendation

**Multimodal fusion approaches combining 2-3 complementary biomarker modalities demonstrate superior accuracy to any single modality.** The strongest near-term clinical opportunity lies in integrating blood-based neurodegeneration markers (p-tau181, NfL) with MRI volumetrics and qEEG slowing patterns for dementia risk stratification.

---

## 2. qEEG Biomarker Evidence Matrix

### 2.1 ASD Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Elevated delta power (frontal, central, parietal) | Significantly increased delta in ASD children across Fz, F3, F4, Cz, C3, C4, P3, P4 (p<0.001) | B | Research-only | "Delta activity pattern observed; non-specific, requires clinical correlation" |
| Elevated beta2 power (parietal, temporal) | Beta2 significantly elevated at P3, P4, Pz, T3, T4, O1, O2 (p<0.001) | B | Research-only | "Beta band pattern differs from typical; significance unclear" |
| Increased theta (eyes-open) | Theta elevation across frontal and central sites in ASD | B | Research-only | "Theta activity noted; multiple factors can influence this measure" |

**Source:** PMC12626940 (2025) - Exploratory qEEG in children with ASD

### 2.2 ADHD Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Theta/Beta Ratio (TBR) | **2024 meta-analysis (N=417) found NO diagnostic value for ADHD.** Grand mean effect sizes non-significant (-0.212 < d < 0.218). Two subtypes identified: high TBR and slow alpha peak frequency | A | NOT diagnostic | "TBR is not a diagnostic marker for ADHD; may inform neurofeedback protocol selection" |
| Slow alpha peak frequency | Associated with TBR elevation but independent behavioral profile | A | Research-only | "Alpha peak frequency within theta range noted" |
| Widespread cortical thinning (MRI correlate) | ADHD children show significant cortical thinning across frontal, temporal, parietal, occipital association cortices (FDR-corrected p<0.0006) | B | Research adjunct | "Structural cortical differences observed in ADHD populations" |

**Critical Clinical Note:** The 2024 Boxum et al. meta-analysis definitively challenged TBR's diagnostic value. A free online tool (Brainmarker-IV) provides age- and sex-corrected TBR decile scores for neurofeedback protocol stratification ONLY.

**Sources:** Boxum et al. 2024 (Appl Psychophysiol Biofeedback), PMC2891193 (cortical thickness)

### 2.3 Depression Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Frontal alpha asymmetry (FAA, F4-F3) | 2025 meta-analysis: significant effect at F3/F4 but high heterogeneity. Relative left frontal activation pattern observed. Three-way interaction of gender x age x depression severity | A | Research-only | "Frontal alpha asymmetry pattern observed; not diagnostic for depression" |
| FAA (F8-F7, Fp2-Fp1) | Non-significant negative values suggesting subtle left lateralization tendency; insufficient sample sizes | A | Research-only | "Asymmetry patterns vary by electrode location" |
| Theta band alterations | Increased frontal theta and theta asymmetry reported in multiple studies | B | Research-only | "Theta activity may reflect aspects of mood state" |

**Critical Clinical Note:** Despite 30+ years of research, no clear evidence supports FAA as a standalone diagnostic biomarker. A 2017 meta-analysis (van der Vinne et al., NeuroImage: Clinical) concluded the association is "partial or negligible." FAA may reflect a component of depression rather than the disorder itself.

**Sources:** Nature 2025 (s44184-025-00117-x), PMC6454961, van der Vinne et al. 2017

### 2.4 PTSD Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Frontal alpha coherence | Limited direct evidence in search results; peripheral biomarker focus | C | Research-only | "Limited qEEG evidence for PTSD; clinical assessment remains primary" |

**Note:** PTSD biomarker literature focuses predominantly on peripheral measures (HRV, cortisol) and fMRI. qEEG-specific PTSD biomarkers remain underdeveloped.

### 2.5 Dementia / Neurodegeneration Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Generalized EEG slowing (decreased alpha/beta, increased delta/theta) | Consistent progressive slowing across AD continuum. Decreased alpha and beta power, increased delta and theta dominance in MCI and AD | A (multiple systematic reviews) | Clinical adjunct | "EEG slowing pattern observed; consistent with neurodegenerative changes, non-specific" |
| Posterior dominant rhythm (PDR) slowing | Significant PDR slowing in AD vs FTD; PDR power reduced in AD but preserved in FTD | B | Emerging clinical | "Posterior rhythm slowing noted; may support differential assessment" |
| Reduced functional connectivity | Declining functional connectivity and changing hub locations in AD | B | Research adjunct | "Functional connectivity patterns differ from typical aging" |
| Reduced sleep spindle density | Disintegration of NREM/REM sleep architecture, reduced spindles | B | Research-only | "Sleep EEG changes may reflect neurodegenerative processes" |
| ERP P300 latency prolongation | P3 abnormalities in ~50% of studies on selective attention in MCI/AD | B | Clinical adjunct | "Event-related potential latency changes observed" |

**FDA/Regulatory Status:** BrainScope has completed proof-of-concept for an EEG-based ML biomarker predicting Alzheimer's onset from earliest memory complaints (2024, ADDF-funded). Next phase: validation studies.

**Sources:** PMC12583641, PMC12960770, PMC274 (Nature 2026), PMC242, NeurologyLive 2024

### 2.6 Neurofeedback Biomarkers

| Application | Evidence | Grade | Clinical Status |
|-------------|----------|-------|----------------|
| TBR-based neurofeedback for ADHD | TBR useful for stratifying patients between neurofeedback protocols despite lack of diagnostic value | B | Clinical practice adjunct |
| Alpha asymmetry neurofeedback for depression | Limited by heterogeneity of FAA findings; individualized approaches show promise | C | Research/experimental |
| SMR neurofeedback for sleep/ADHD | Some evidence for motor regulation improvement | B | Clinical practice |

**Source:** PMC12428149 (2024)

---

## 3. MRI Neuromarker Evidence Matrix

### 3.1 Structural MRI Neurodegeneration Markers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Hippocampal volume reduction | Strong positive correlation with MMSE (r=0.57) and MoCA (r=0.60). Mean NHV: AD 2.38cm3, aMCI 2.91cm3, normal 3.07cm3 (p<0.001) | A | Clinical standard | "Hippocampal volume below expected range; associated with memory impairment" |
| Cortical thickness reduction | Widespread cortical thinning is robust anatomical marker for ADHD; extends beyond prefrontal circuits | B | Research adjunct | "Cortical thickness patterns differ from age-expected norms" |
| Hippocampus-to-cortex ratio | Most effective sMRI biomarker for differentiating AD subtypes; aligns with tau pathology distribution | B | Research | "Structural ratio analysis may support subtype characterization" |
| Precuneus atrophy | Associated with increased amyloid load in preclinical AD | B | Research | "Precuneus volume reduction may indicate early changes" |

**Source:** PMC5122988 (hippocampal volumetry), PMC2891193 (cortical thickness ADHD)

### 3.2 DTI White Matter Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| White matter microstructural changes | Reduced fractional anisotropy (FA) and increased mean diffusivity (MD) across AD continuum | B | Research adjunct | "White matter microstructural changes observed; non-specific" |
| Structural-functional network integration | Combining dMRI with fMRI improves classification accuracy for multiple disorders | B | Research | "Multimodal imaging provides complementary information" |

**Source:** PMC12660184

### 3.3 MRI Brain Age Prediction

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Brain age gap (predicted - chronological) | 3D DenseNet-169 model: MAE 2.73 years on clinical 2D scans. AD patients show +3.10 years gap vs controls (p<0.001) | B | Emerging clinical | "Brain age estimate exceeds chronological age; suggests accelerated brain aging" |
| Disease progression tracking | Brain age gap: CU 0.57yr vs MCI 2.15yr vs AD 2.47yr (ADNI); PD 2.23yr vs prodromal 1.42yr (PPMI) | B | Emerging clinical | "Brain age gap magnitude correlates with disease stage" |
| CSF region focus | Model focuses on cerebrospinal fluid regions and adjacent tissue (ventricles, insula) | B | Research | "Prediction driven by ventricular and cortical morphometry" |

**Limitations:** Lack of standardization across models; ethnic/demographic biases in training data; age bias correction required for clinical 2D scans. Inference: 1.3 seconds per scan on NVIDIA L40S.

**Source:** Nature 2025 (s41514-025-00260-x), PMC12237103

### 3.4 AI MRI Analysis

| Application | Evidence | Grade | Clinical Status |
|-------------|----------|-------|----------------|
| Multimodal AI (T1w MRI + dMRI + fMRI) | Accuracy 84.2% for ASD, 91.57% for schizophrenia, 75.2% for MDD | B | Research |
| Brain age for neurodegeneration risk | Multimodal approaches surpass unimodal models; mean absolute error <2.71 years | B | Emerging clinical |
| fMRI + structural MRI fusion | Significantly enhances brain age predictions; functional connectivity captures distinct aging patterns | B | Research |

**FDA Status:** No FDA-cleared AI MRI biomarker products identified in search. Multiple research pipelines in development.

**Source:** PMC12147894 (AI-powered multimodal integration)

---

## 4. Blood/Lab Biomarker Matrix

### 4.1 Inflammation Biomarkers for Depression

| Biomarker | Reference Range | Evidence | Grade | Clinical Interpretation |
|-----------|----------------|----------|-------|------------------------|
| CRP (C-reactive protein) | <3.0 mg/L (normal); >3 elevated | Elevated in subsets of depressed individuals; women with MDD show modest elevations vs healthy females; sex-specific profiles observed | A (meta-analysis) | Elevated CRP suggests inflammatory subtype; NOT diagnostic for depression |
| IL-6 | <5 pg/mL (normal) | Most robust inflammatory marker in late-life depression. Remains significantly elevated after multiple testing adjustment. Mendelian randomization supports causal role (genetically predicted higher IL-6 associated with depression odds) | A | IL-6 elevation may indicate inflammation-associated depression; consider anti-inflammatory interventions |
| TNF-alpha | <8.1 pg/mL (normal) | Elevated in depression but less consistent than IL-6 | B | Supports inflammatory activation pattern |
| IL-1beta | <5 pg/mL (normal) | No consistent differences relative to controls in late-life depression | C | Limited clinical utility |

**Clinical Caveat:** Inflammatory biomarkers are non-specific and can be elevated in infection, autoimmune disease, obesity, and cardiovascular disease. Always interpret within full clinical context.

**Source:** Nature Index 2025 (Inflammatory Biomarkers in Depression)

### 4.2 Vitamin D, B12, Folate Cognitive Biomarkers

| Biomarker | Reference Range | Evidence | Grade | Clinical Interpretation |
|-----------|----------------|----------|-------|------------------------|
| Vitamin D (25-OH) | 30-100 ng/mL (adequate); <20 deficient | Strongest cognitive predictor among vitamins. Levels below 50th percentile linked with elevated cognitive impairment risk in elderly. Dose-response: lower vitamin D = higher impairment risk | B | Deficiency associated with cognitive decline; supplementation may benefit |
| Folate | >4.0 ng/mL (normal) | Negatively correlated with cognitive disorders; synergistic with vitamin D | B | Low folate may contribute to cognitive impairment |
| Vitamin B12 | 200-900 pg/mL (normal); <300 borderline | U-shaped association with cognitive disorders; both very low and very high potentially problematic | B | B12 deficiency common in elderly; check methylmalonic acid for functional deficiency |

**Interaction Note:** Vitamin D and folate show group synergistic effects (groupPIP=1). B12 has potential interaction with folate. Combined assessment recommended.

**Source:** PMC12796845

### 4.3 Metabolic Biomarkers

| Biomarker | Reference Range | Evidence | Grade | Clinical Interpretation |
|-----------|----------------|----------|-------|------------------------|
| HbA1c | <5.7% normal; 5.7-6.4% prediabetic; >6.5% diabetic | Depression prevalence 2x higher in diabetes (17.6% vs 9.8%). HbA1c >7% associated with higher depression rates (78.2% vs 70.9%, p=0.032). Complex bidirectional relationship | B | Poor glycemic control may worsen mood; depression may impair self-management |

**Source:** PMC8967126

### 4.4 HPA Axis / Cortisol Biomarkers

| Biomarker | Reference Range | Evidence | Grade | Clinical Interpretation |
|-----------|----------------|----------|-------|------------------------|
| Cortisol awakening response (CAR) | Peak 30-75% above waking; decline by 60min | Abnormal CAR patterns in mood and cognitive disorders; hyperactivation in melancholic depression; hippocampal GR downregulation in chronic stress | B | Abnormal CAR suggests HPA axis dysregulation; associated with stress vulnerability |
| Hair cortisol | Varies by length/period | Elevated in chronic stress conditions and autoimmune disease | B | Reflects chronic cortisol exposure over weeks/months |

**Source:** PMC12563903

### 4.5 Neurodegeneration Blood Biomarkers

| Biomarker | Reference Range | Evidence | Grade | Clinical Status | Safe Report Wording |
|-----------|----------------|----------|-------|----------------|-------------------|
| Plasma p-tau181 | <1.5-2.0 pg/mL (approximate) | **AUC 0.964** for distinguishing AD from FTD. Correlates with CSF p-tau181 (rho=0.619) and amyloid PET. Improves prediction of cognitive decline in MCI. Specific for AD pathology | A | Clinical implementation | "Elevated p-tau181 suggests AD-associated tau pathology; correlate with clinical assessment" |
| Plasma NfL | <10-15 pg/mL (age-dependent) | General neurodegeneration marker; higher in FTD than AD. Correlates with CSF NfL (rho=0.668). Indicates neuronal injury but NOT AD-specific | A | Clinical implementation | "Elevated NfL indicates neuronal injury; non-specific, multiple causes possible" |
| Plasma GFAP | Varies by assay | Astrocytosis marker; higher in AD than FTD; influenced by beta-amyloid pathology; good discrimination of neurodegenerative dementias from HC | B | Emerging clinical | "GFAP elevation suggests astrocytic activation; may indicate neuroinflammatory processes" |
| CSF p-tau181/A beta42 ratio | >0.0779 = AD profile | Defines AD CSF profile; plasma NfL elevated in CN participants with AD CSF profile | A | Clinical standard | "CSF ratio supports AD pathology classification" |

**Key Clinical Distinction:** p-tau181 is AD-specific; NfL is non-specific neurodegeneration; GFAP reflects astrocytosis. Combined panels provide optimal differential diagnosis.

**Source:** PMC7995778, PMC9555092

### 4.6 Autoimmune / Neuroinflammatory Biomarkers

| Biomarker | Clinical Context | Evidence | Grade |
|-----------|-----------------|----------|-------|
| NfL (CSF/plasma) | MS, autoimmune encephalitis | Higher in RRMS and progressive MS; correlates with disease activity | A |
| CHI3L1 (YKL-40) | MS progression | Elevated in progressive MS; predicts RRMS to SPMS conversion | B |
| CXCL13, CXCL8, IL-12p40 | CIS to MS conversion | Predict progression from clinically isolated syndrome to MS | B |
| IL-6, IL-17, CXCL13 | NMO, autoimmune encephalitis | Key factors in NMO lesion formation; correlate with disease severity | B |
| Anti-NMDAR antibodies | Anti-NMDA receptor encephalitis | Diagnostic; target GluN1 subunit | A (diagnostic) |
| Anti-LGI1, anti-CASPR2 | Limbic encephalitis | Diagnostic for voltage-gated potassium channel complex disorders | A (diagnostic) |

**Source:** PMC10113662, PMC11464805

---

## 5. Wearable/Digital Biomarker Matrix

### 5.1 HRV (Heart Rate Variability) Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| HRV as mental health biomarker | HRV moderates relationship between alpha asymmetry and depressive symptoms; linked to emotion regulation capacity | B | Research adjunct | "HRV pattern may reflect autonomic regulation; non-specific" |
| HRV-based circadian markers | Heart rate MESOR, amplitude, relative amplitude show stronger associations with metabolic syndrome than sleep markers | B | Emerging | "Circadian HRV patterns suggest autonomic dysregulation" |

### 5.2 Sleep Biomarkers from Wearables

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Sleep-wake transition frequency | Number of sleep-wake transitions correlated with: pain (r=0.13), sleep discontinuity (r=0.10), anxiety (r=0.06), depression (r=0.05), all p<0.05 | B | Clinical adjunct | "Increased sleep fragmentation observed; associated with multiple symptom domains" |
| Wake percentage (24h) | Inversely correlated with pain (r=-0.14), depression (r=-0.05), anxiety | B | Clinical adjunct | "Sleep efficiency metrics within expected ranges" or "Sleep efficiency reduced" |
| Sleep spindle density | Reduced in neurodegenerative disease; disintegration of NREM/REM architecture | B | Research-only | "Sleep architecture changes may reflect underlying neurological processes" |

**Source:** JAMA Psychiatry 2023 (wrist-wearable PTSD study)

### 5.3 Digital Phenotyping / Smartphone Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Device interaction patterns | Typing speed, error rates, correction patterns reflect psychomotor slowing in cognitive fatigue | B | Research | "Device interaction patterns may reflect cognitive state changes" |
| App usage / screen time | Alterations during fatigue episodes; may reflect attention capacity changes | C | Research | "Usage pattern changes noted; significance requires clinical correlation" |
| GPS mobility patterns | Reduced life-space mobility during symptom exacerbations | C | Research | "Mobility patterns may indicate functional changes" |
| Battery charging frequency | Exploratory digital phenotype for depression monitoring | C | Experimental | "Not a validated clinical measure" |

**Privacy Warning:** Digital phenotyping raises significant privacy and ethical concerns. All implementations require explicit informed consent and robust data protection.

**Source:** PMC12002295, PMC10585447

### 5.4 Circadian Rhythm Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| CosinorAge (circadian biological age) | Novel circadian age predictor from wearable accelerometry (80K+ participants). Fast circadian aging associated with 2.86x increase in dementia risk and 3.25x increase in PD risk | B | Emerging screening | "Circadian rhythm patterns suggest accelerated biological aging; non-diagnostic" |
| Relative amplitude (RA) | Lower RA in metabolic syndrome (p<0.001); values >0.15 associated with reduced MetS probability | B | Clinical adjunct | "Circadian amplitude reduced; associated with metabolic dysregulation" |
| Interdaily stability (IS) | Reduced in metabolic syndrome; reflects consistency of daily rhythms | B | Clinical adjunct | "Daily rhythm consistency below expected range" |
| Continuous wavelet circadian rhythm energy (CCE) | Novel marker; highest importance for MetS identification. Lower CCE_MID values associated with higher MetS risk | B | Research | "Circadian rhythm energy marker abnormal; research measure" |

**Source:** PMC12311872, Nature 2024 (s41746-024-01111-x)

### 5.5 Activity / Gait Biomarkers for Neurodegeneration

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Daily activity variance | Inversely correlated with pain severity (r=-0.14) | B | Clinical adjunct | "Activity variability reduced; may indicate functional limitation" |
| Maximum daily activity | Correlated with pain (r=-0.15), depressive symptoms (r=-0.04) | B | Clinical adjunct | "Activity levels below personal baseline" |
| Gait parameters (step length, speed, variability) | Correlated with fatigue severity in neurological disorders; smartphone accelerometer-derived | B | Research | "Gait parameters may indicate motor system changes" |
| Peak activity timing | Delayed peak activity associated with increased pain | B | Research | "Activity timing pattern shifted" |

### 5.6 Cognitive Fatigue Digital Biomarkers

| Feature | Evidence | Grade | Clinical Status | Safe Report Wording |
|---------|----------|-------|----------------|-------------------|
| Composite fatigue scores (ML-derived) | Gradient boosting assigns weights: gait variability 0.28, typing accuracy 0.23, sleep efficiency 0.19; correlation with clinical scales r=0.68-0.85 | B | Research | "Digital composite score elevated; correlate with clinical assessment" |
| Smartphone-based SDMT | Correlates with fMRI alterations in MS patients; sensitive to cognitive fatigue | B | Research | "Processing speed measure suggests cognitive load impact" |
| Voice analysis (speech rate, pauses) | Emerging biomarker of fatigue; reflects cognitive and motor system impacts | C | Experimental | "Voice pattern analysis experimental only" |

**Source:** PMC12110069 (Digital biomarkers for fatigue)

---

## 6. Multimodal Fusion Design

### 6.1 Evidence for Multimodal Approaches

| Fusion Type | Modalities | Evidence | Performance Gain |
|-------------|-----------|----------|-----------------|
| EEG + fNIRS | Neurophysiological | Li Y. et al. 2023 - combining modalities improved depression classification accuracy | Moderate improvement over single modality |
| EEG + ECG/MEG | Neurophysiological + autonomic | Rawat & Sharma - multimodal CNN-Bi-Transformer achieved very high accuracy | Significant improvement |
| T1w MRI + dMRI + fMRI | Structural + functional + connectivity | Zhao et al. - 91.57% accuracy for schizophrenia; 84.2% for ASD | Consistent improvement |
| MRI + EEG + clinical | Imaging + neurophysiology + clinical | Dauwan et al. - qEEG highest accuracy for DLB vs NC; MRI highest for AD vs NC | Complementary strengths |
| fMRI + EEG | Functional + temporal | Millar et al. - functional connectivity captures aging patterns structural MRI misses | Distinct information captured |
| Plasma p-tau181 + NfL + GFAP | Blood panel | Combined blood biomarkers optimize differential diagnosis of neurodegenerative dementias | Essential for clinical practice |

### 6.2 Recommended Multimodal Architecture

```
Layer 1: Data Ingestion & Normalization
  - qEEG: band power, connectivity, asymmetry indices
  - MRI: volumetrics, cortical thickness, brain age gap
  - Blood: p-tau181, NfL, GFAP, CRP, IL-6, vitamin D, B12, HbA1c
  - Wearable: HRV, sleep efficiency, circadian amplitude, activity patterns
  - Digital: device interaction, cognitive tests, voice (with explicit consent)

Layer 2: Unimodal Feature Extraction
  - Each modality processed independently with modality-specific models
  - Quality scoring: flag low-quality or missing data

Layer 3: Feature Fusion
  - Early fusion: concatenate normalized features
  - Intermediate fusion: joint representations via cross-modal attention
  - Late fusion: ensemble predictions with modality confidence weighting

Layer 4: Uncertainty Quantification
  - Conformal prediction bands for biomarker trajectories
  - Group-conditional coverage for demographic subgroups
  - Uncertainty-calibrated risk scores

Layer 5: Clinical Decision Support Output
  - Condition risk scores (NOT diagnoses)
  - Confidence intervals on all predictions
  - Trend analysis over time
  - Alert thresholds for clinician review
```

### 6.3 Uncertainty Scoring Framework

Based on conformal prediction research (Tassopoulou et al., NeurIPS 2025):

| Component | Method | Clinical Value |
|-----------|--------|---------------|
| Trajectory-wide nonconformity score | Max normalized absolute error across all timepoints | Guarantees simultaneous coverage over entire future trajectory |
| Group-conditional conformal bands | Subgroup-specific coverage (age, sex, APOE status) | Addresses population heterogeneity |
| Uncertainty-calibrated risk score | Rate of Change Bound using lower conformal bound | Identifies 17.5% more high-risk MCI patients progressing to AD |

**Source:** arxiv 2025 (2511.13911), NeurIPS 2025

---

## 7. Open Source Integration Opportunities

### 7.1 qEEG / EEG Analysis

| Tool | License | Key Features | Integration Priority |
|------|---------|-------------|---------------------|
| **MNE-Python** | BSD-3-Clause | Full EEG/MEG analysis: preprocessing, visualization, source estimation, time-frequency, connectivity, ML, statistics. Python >=3.10. 20.4M parameter 3D DenseNet models compatible. | **P0 - Core dependency** |
| **PyEEG** | Open source | Python module for EEG feature extraction: entropy, Hjorth parameters, PFD, DFA, spectral features. Modular design. | **P1 - Feature extraction** |
| **YASA** | MIT | Sleep EEG analysis: sleep staging, spindle detection, slow wave detection. | **P1 - Sleep EEG** |

### 7.2 MRI / Neuroimaging Analysis

| Tool | License | Key Features | Integration Priority |
|------|---------|-------------|---------------------|
| **FreeSurfer** | Open source | Structural MRI: skull-stripping, segmentation, cortical surface reconstruction, thickness, volumetrics. Human Connectome Project standard. | **P0 - Core dependency** |
| **FSL (FMRIB)** | Open source | fMRI, DTI, structural analysis. Extensive command-line tools. UK Biobank standard. | **P1 - DTI/fMRI** |
| **NiBabel** | MIT | Python library for reading/writing neuroimaging data formats (CIFTI, NIfTI, CIFTI). | **P0 - Data I/O** |
| **nilearn** | BSD | Python ML for neuroimaging: decoding, connectivity, plotting. | **P1 - ML pipelines** |

### 7.3 Wearable Data Analysis

| Tool | License | Key Features | Integration Priority |
|------|---------|-------------|---------------------|
| **SciKit Digital Health (SKDH)** | MIT | Gait, sit-to-stand, physical activity, sleep algorithms. Convention over configuration. conda/PyPI installable. | **P0 - Core dependency** |
| **ReBAIT** | LGPLv3 | Real-time IMU gait analysis with biofeedback. Python 3.9+. XSENS sensor support. | **P2 - Gait biofeedback** |

### 7.4 Clinical Data Integration

| Tool / Standard | License | Key Features | Integration Priority |
|------|---------|-------------|---------------------|
| **FHIR (Fast Healthcare Interoperability Resources)** | Open standard | R4/Genomics: Patient, Specimen, DiagnosticReport, Observation resources. LOINC-coded lab mapping to HPO phenotypes. | **P0 - Data exchange** |
| **LOINC** | Open standard | Universal lab test identifiers for biomarker normalization across labs | **P0 - Lab normalization** |
| **HPO (Human Phenotype Ontology)** | Open | Maps abnormal lab results to phenotypic abnormalities via LOINC + FHIR | **P1 - Phenotyping** |

### 7.5 Multimodal ML / AI Framework

| Tool | License | Key Features | Integration Priority |
|------|---------|-------------|---------------------|
| **PyTorch / torchvision** | BSD | Deep learning for multimodal fusion (DenseNet, transformers) | **P0 - Core ML** |
| **scikit-learn** | BSD | Classical ML: SVM, RF, gradient boosting for biomarker classification | **P0 - Core ML** |
| **Hugging Face Transformers** | Apache 2.0 | Transformer architectures for multimodal attention fusion | **P1 - Advanced fusion** |
| **Conformal Prediction libraries** | Various | MAPIE (scikit-compatible conformal prediction) | **P1 - Uncertainty quant** |

---

## 8. UX Benchmark Findings

### 8.1 Clinical Dashboard Best Practices

From Guava Health and Elucidata benchmarks:

| Feature | Implementation Standard | Clinical Value |
|---------|------------------------|---------------|
| Unified lab view | Normalize units (mg/dL to mmol/L), LOINC alignment, chronological organization | Eliminates manual comparison across lab sources |
| Longitudinal biomarker tracking | Trend lines, reference range shading, anomaly highlighting | Enables early detection of gradual changes |
| Custom reference ranges | Condition-specific ranges (e.g., functional medicine ranges) | Personalized clinical interpretation |
| Biomarker grouping | Panel-based organization (metabolic, inflammatory, nutritional, neurological) | Reduces cognitive load |
| Wearable integration | Fitbit, Oura, Dexcom, Apple Health data alongside labs | Holistic patient view |
| AI-powered PDF extraction | Automatic parsing of lab reports into structured data | Reduces manual data entry |

### 8.2 Essential UX Requirements for Biomarker Dashboard

1. **Uncertainty Visualization:** All biomarker values must display confidence intervals or prediction bands
2. **Temporal Context:** Time-series visualization with visit markers and intervention annotations
3. **Multimodal Correlation:** Side-by-side or overlay view of biomarkers from different modalities
4. **Evidence Grade Indicators:** Visual indication of evidence strength (A/B/C) for each biomarker
5. **Safe Report Wording:** Built-in templates for patient-facing language (never diagnostic)
6. **Alert Fatigue Management:** Tiered alerts (informational/warning/critical) with snooze capabilities
7. **Demographic Context:** Age, sex, and ethnicity-specific reference ranges
8. **Export Capability:** FHIR-compliant export for EHR integration

---

## 9. Implementation Roadmap

### P0: Foundation (Months 1-3)

| Component | Deliverable | Dependencies |
|-----------|------------|-------------|
| MNE-Python integration | EEG preprocessing pipeline, qEEG feature extraction (band power, asymmetry, connectivity) | Python 3.10+, MNE 1.10 |
| SKDH integration | Wearable data ingestion (Fitbit, Apple Health), gait and sleep feature extraction | SKDH from PyPI |
| NiBabel integration | MRI data I/O, volumetric feature extraction | NiBabel, nilearn |
| FHIR R4 data model | Biomarker Observation resources, Patient linking | FHIR validation library |
| Blood biomarker module | CRP, IL-6, p-tau181, NfL, GFAP, vitamin D, B12, HbA1c data ingestion and normalization | LOINC mapping tables |
| Basic dashboard | Single-patient biomarker timeline, reference range visualization | React/Vue frontend |

### P1: Clinical Intelligence (Months 4-6)

| Component | Deliverable | Dependencies |
|-----------|------------|-------------|
| FreeSurfer pipeline | Automated cortical thickness, hippocampal volume, brain age gap estimation | FreeSurfer 7.4+ |
| Multimodal fusion engine | Early fusion architecture combining 2+ modalities | PyTorch, scikit-learn |
| Conformal prediction module | Uncertainty-calibrated biomarker trajectories | MAPIE or custom implementation |
| Condition-specific panels | Dementia risk panel (MRI + p-tau181 + NfL + EEG), Depression panel (FAA + IL-6 + sleep) | P0 components |
| Trend analysis | Personal baseline establishment, deviation detection, rate-of-change alerts | 3+ timepoints per patient |
| Clinical decision support | Evidence-graded recommendations, safe report generation | Evidence matrix database |

### P2: Advanced Features (Months 7-12)

| Component | Deliverable | Dependencies |
|-----------|------------|-------------|
| Intermediate fusion | Cross-modal attention mechanisms, joint representations | Transformer architectures |
| Digital phenotyping | Smartphone-derived features (with privacy framework) | Explicit consent system |
| Circadian age (CosinorAge) | Wearable-derived biological age estimation | 7-day continuous wearable data |
| Population analytics | Cohort-level biomarker distribution, normative modeling | 1000+ patient dataset |
| EHR integration | Bidirectional FHIR sync, CCDA import, Epic/Cerner compatibility | FHIR server, OAuth2 |
| Regulatory pathway | FDA 510(k) pre-submission for decision support software | Quality management system |

---

## 10. Sources & Citations

### qEEG Evidence
1. **PMC12626940** - Exploratory qEEG characteristics in children with ASD (2025)
2. **s44184-025-00117-x** - Meta-analysis of resting frontal alpha asymmetry as depression biomarker (Nature, 2025)
3. **PMC6454961** - Study of frontal alpha asymmetry in mild depression (2019)
4. **Boxum et al. 2024** - Challenging the diagnostic value of theta/beta ratio in ADHD (Appl Psychophysiol Biofeedback, 2024)
5. **PMC2891193** - Widespread cortical thinning as anatomical marker for ADHD (J Am Acad Child Adolesc Psychiatry, 2009)
6. **PMC12428149** - From aberrant brainwaves to altered plasticity: qEEG and neurofeedback (2024)
7. **PMC12583641** - EEG biomarkers for Alzheimer's disease: automated pipeline (2025)
8. **s44400-026-00089-5** - EEG in neurodegenerative disease and dementia (Nature, 2026)
9. **PMC12960770** - Biomarkers for Alzheimer's disease and MCI: task-based EEG (2025)
10. **BrainScope/ADDF 2024** - Proof-of-concept for EEG-based Alzheimer's prediction biomarker

### MRI Evidence
11. **PMC12660184** - Structural and microstructural changes across AD continuum (2025)
12. **PMC5122988** - Hippocampal volumetry as biomarker for dementia (2016)
13. **s41514-025-00260-x** - Deep learning brain age prediction for clinical MRI (Nature, 2025)
14. **PMC12237103** - Brain age prediction from MRI in neurodegenerative diseases (2025)
15. **PMC12147894** - AI-powered integration of multimodal imaging (2025)

### Blood Biomarker Evidence
16. **Nature Index 2025** - Inflammatory biomarkers in depression and mental health
17. **PMC12796845** - Relationship between serum vitamins and cognitive impairment (2025)
18. **PMC8967126** - Association of HbA1c and depression in adults with diabetes (2022)
19. **PMC12563903** - Role of HPA axis and cortisol dysregulation (2025)
20. **PMC7995778** - Plasma NfL and p-tau181 as biomarkers of AD pathology (2021)
21. **PMC9555092** - Diagnostic value of plasma p-tau181, NfL, and GFAP (2022)
22. **PMC10113662** - Biomarkers in autoimmune diseases of the CNS (2023)
23. **PMC11464805** - Emerging biomarkers for early detection of autoimmune encephalitis (2024)

### Wearable/Digital Evidence
24. **JAMA Psychiatry 2023** - Utility of wrist-wearable data for PTSD outcomes
25. **PMC12002295** - Digital phenotyping using smartphones for mental health (2025)
26. **PMC10585447** - Digital phenotyping: data-driven psychiatry (2023)
27. **PMC12311872** - Circadian biomarkers for metabolic syndrome from wearables (2025)
28. **s41746-024-01111-x** - Circadian rhythm analysis as digital biomarker of aging (Nature, 2024)
29. **PMC12110069** - Digital biomarkers and AI for fatigue monitoring (2025)

### Multimodal & Technical
30. **PMC12849106** - Systematic review of EEG-based biomarkers with XAI (2025)
31. **arxiv 2511.13911** - Uncertainty-calibrated prediction of biomarker trajectories (2025)
32. **NeurIPS 2025** - Conformal prediction for biomarker trajectories (posterior)
33. **Guava Health 2025** - Lab integration dashboard for providers
34. **Elucidata 2024** - Integrated biomarker discovery workflow
35. **mne-tools/mne-python** - GitHub, BSD-3-Clause
36. **surfer.nmr.mgh.harvard.edu** - FreeSurfer open source
37. **PfizerRD/scikit-digital-health** - SKDH, MIT license
38. **PMC12963594** - FHIR Genomics adequacy assessment (2025)
39. **s41746-019-0110-4** - Semantic integration of clinical lab tests with FHIR (Nature, 2019)
40. **PMC3070217** - PyEEG: open source Python module for EEG feature extraction

---

## Clinical Safety & Ethics Statement

**This document is intended for clinical researchers and healthcare technology developers.** All biomarkers described are for clinical decision support only and must not be used as standalone diagnostic tools. Biomarker interpretation requires:

1. Clinical correlation with full patient history and examination
2. Consideration of confounding factors (medications, comorbidities, age, sex)
3. Integration with established clinical assessment tools
4. Appropriate informed consent for any data collection
5. Compliance with HIPAA, GDPR, and applicable privacy regulations
6. Evidence-graded communication with patients and families

**No biomarker replaces clinical judgment. All findings require interpretation by qualified healthcare professionals.**

---

*Document compiled from peer-reviewed literature, NIH/PMC sources, Nature Portfolio, and established clinical guidelines. All evidence grades reflect the strength of available research as of July 2025. The biomarker landscape evolves rapidly; regular updates are essential.*
