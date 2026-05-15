# AI-Assisted MRI Pathology Findings Detection and Safe Reporting Framework

## Document Information
- **Version**: 1.0
- **Classification**: Clinical Decision Support Framework
- **Scope**: AI-assisted MRI brain findings detection, safety classification, and radiologist-supervised reporting
- **Last Updated**: 2025

---

## IMPORTANT SAFETY DISCLAIMER

> **THIS FRAMEWORK IS A CLINICAL DECISION SUPPORT TOOL ONLY. IT DOES NOT REPLACE A BOARD-CERTIFIED RADIOLOGIST OR NEURORADIOLOGIST. ALL AI-GENERATED FINDINGS MUST BE REVIEWED AND CONFIRMED BY A QUALIFIED PHYSICIAN BEFORE ANY CLINICAL ACTION.**
>
> **Emergency flags must display: "URGENT CLINICAL/RADIOLOGY REVIEW REQUIRED"**
>
> **AI-generated findings are interpretive aids, not diagnostic conclusions.**

---

## Table of Contents

1. [Framework Overview](#1-framework-overview)
2. [General Principles](#2-general-principles)
3. [Evidence Grading System](#3-evidence-grading-system)
4. [Urgency Classification System](#4-urgency-classification-system)
5. [Safe Reporting Language Standards](#5-safe-reporting-language-standards)
6. [Finding-Specific Guidelines](#6-finding-specific-guidelines)
7. [AI Performance Reference Data](#7-ai-performance-reference-data)
8. [Appendices](#8-appendices)

---

## 1. Framework Overview

### 1.1 Purpose

This framework establishes standardized protocols for AI-assisted detection of MRI brain pathology findings, including:
- Detection methodology (AI capabilities and limitations)
- False positive/negative risk quantification
- Safe, non-diagnostic reporting language
- Clinical urgency classification
- Required follow-up protocols
- Evidence grade classification
- Prohibited and required phrasing

### 1.2 Core Principles

1. **Radiologist-in-the-Loop**: AI never replaces radiologist interpretation
2. **Safety-First Reporting**: All communications prioritize patient safety
3. **Transparency**: AI involvement is explicitly disclosed in every report
4. **Uncertainty Quantification**: Confidence levels accompany all findings
5. **Urgency-Based Escalation**: Critical findings trigger immediate notification

### 1.3 AI Performance Context

Based on current peer-reviewed literature (2020-2025):

| Finding Category | AI Sensitivity Range | AI Specificity Range | Evidence Quality |
|-----------------|---------------------|---------------------|-----------------|
| Brain Tumors (glioma/meningioma/pituitary) | 92-99.5% | 92-98% | High |
| Acute Ischemic Stroke (DWI) | 86-93% | 84-96% | Moderate-High |
| Intracranial Hemorrhage | 89-94% | 90-97% | Moderate-High |
| White Matter Hyperintensities (Fazekas) | 85-94% | 88-95% | Moderate |
| Brain Atrophy (global/regional) | 82-92% | 85-93% | Moderate |
| Hippocampal Volume (Scheltens) | 78-89% | 85-92% | Moderate |
| Demyelinating Lesions | 75-87% | 80-90% | Low-Moderate |
| Cortical Thinning | 70-85% | 78-88% | Low-Moderate |
| Cerebellar Abnormalities | 72-86% | 80-90% | Low-Moderate |
| Basal Ganglia Findings | 68-82% | 75-88% | Low |
| Corpus Callosum Abnormalities | 65-80% | 78-88% | Low |
| Ventriculomegaly | 85-95% | 88-96% | Moderate |
| Developmental Anomalies | 60-78% | 72-85% | Low |

*Sources: Systematic reviews and meta-analyses from PubMed/PMC 2020-2025. See Section 7 for detailed references.*

---

## 2. General Principles

### 2.1 Universal Rules

| Rule # | Principle | Action Required |
|--------|-----------|----------------|
| 1 | **Never Replace Radiologist** | All AI outputs require radiologist review |
| 2 | **Emergency Flags** | Critical findings: "URGENT CLINICAL/RADIOLOGY REVIEW REQUIRED" |
| 3 | **Disclose AI Use** | Every report must state AI assistance |
| 4 | **Confidence Threshold** | Findings below 70% confidence must be flagged for manual review |
| 5 | **No Independent Diagnosis** | AI never provides definitive diagnosis |
| 6 | **False Positive Acknowledgment** | All AI-positive findings require human confirmation |
| 7 | **False Negative Safety Net** | Negative AI screen does not exclude pathology |
| 8 | **Temporal Context** | Comparison with prior imaging when available |
| 9 | **Clinical Correlation** | All findings require clinical context |
| 10 | **Documentation Standard** | All AI findings logged with confidence scores |

### 2.2 Universal Never-Say Phrases

The following phrases must **NEVER** appear in AI-generated reports:

- "This is..." (definitive diagnostic statement)
- "Diagnosis is..." (AI cannot diagnose)
- "No pathology present" (AI cannot exclude all pathology)
- "Normal study" (AI cannot certify normality)
- "Rules out [condition]" (AI cannot rule out disease)
- "The patient has..." (clinical diagnosis)
- "Biopsy is not needed" (treatment recommendation)
- "No follow-up required" (follow-up decisions are clinical)
- "This finding is benign" (AI cannot determine benignity)
- "This finding is malignant" (AI cannot determine malignancy)
- "100% certain..." (AI has inherent uncertainty)
- "No radiologist review needed"
- "AI-confirmed diagnosis"
- "This replaces clinical evaluation"

### 2.3 Universal Always-Say Phrases

The following phrases must **ALWAYS** appear where applicable:

- "AI-assisted detection with radiologist review pending"
- "This is a non-diagnostic AI screening finding"
- "Radiologist interpretation required for confirmation"
- "Clinical correlation recommended"
- "Comparison with prior imaging recommended when available"
- "AI confidence score: [X]%"
- "URGENT CLINICAL/RADIOLOGY REVIEW REQUIRED" (for critical findings)
- "AI may miss subtle findings; radiologist review essential"
- "This report was generated with AI assistance and requires physician review"

---

## 3. Evidence Grading System

Based on the Fryback-Thornbury hierarchical model of efficacy and AJNR Levels of Evidence for AI-enabled imaging tools:

### 3.1 Evidence Levels

| Grade | Level | Description | Clinical Application |
|-------|-------|-------------|---------------------|
| **A** | Level 1-2 | Multiple RCTs or meta-analyses; strong diagnostic accuracy evidence | Safe for clinical decision support |
| **B** | Level 3 | Limited RCTs or well-designed observational studies; moderate evidence | Requires radiologist confirmation |
| **C** | Level 4-5 | Expert opinion, case series, or limited studies; emerging evidence | High caution; extensive radiologist review needed |
| **D** | Level 6-7 | Theoretical/technical feasibility only; limited clinical data | Experimental; not for clinical use without expert review |
| **I** | Insufficient | No peer-reviewed evidence | Cannot be used for clinical support |

### 3.2 Evidence Grading by Finding Type

| Finding Category | Evidence Grade | Basis |
|-----------------|---------------|-------|
| Lesions (mass/tumor/cyst) | **A** | Multiple meta-analyses; F1 scores >0.95 |
| Infarcts (acute) | **A** | Meta-analyses; pooled sensitivity 93%, specificity 93% |
| Hemorrhage | **B** | Good accuracy; motion artifacts reduce performance |
| Mass Effect | **B** | Strong evidence for shift detection |
| Atrophy (global) | **B** | Good volumetric correlation |
| Ventriculomegaly | **B** | Strong linear measurements; iNPH vs ex vacuo requires clinical context |
| WMH (Fazekas) | **B** | Automated grading validated against visual scores |
| Demyelinating Lesions | **C** | Moderate sensitivity; Dawson fingers have limited AI validation |
| Hippocampal Volume (Scheltens) | **B** | Good correlation with volumetric measures |
| Cortical Thinning | **C** | Emerging evidence; regional variability |
| Cerebellar Abnormalities | **C** | Limited dedicated studies |
| Basal Ganglia Findings | **C** | Iron-sensitive sequences improve detection |
| Corpus Callosum | **C** | Limited AI-specific validation |
| Developmental Anomalies | **D** | Complex patterns; limited AI training data |

---

## 4. Urgency Classification System

### 4.1 Urgency Levels

| Level | Classification | Response Time | Notification Method |
|-------|---------------|---------------|-------------------|
| **CRITICAL** | Life-threatening; requires immediate intervention | Immediate (<15 min) | Pager/SMS/Phone + PACS flag |
| **URGENT** | Potentially serious; requires prompt evaluation | <2 hours | PACS flag + email notification |
| **ROUTINE** | Non-urgent; standard reporting workflow | Standard turnaround | Standard reporting queue |

### 4.2 Critical Findings Requiring Immediate Flag

The following findings are classified as **CRITICAL** and must display "URGENT CLINICAL/RADIOLOGY REVIEW REQUIRED":

- Acute intracranial hemorrhage (any type)
- Acute territorial infarct with mass effect
- Large vessel occlusion
- Significant midline shift (>5mm)
- Herniation (any type)
- Acute hydrocephalus
- New space-occupying lesion with mass effect

---

## 5. Safe Reporting Language Standards

### 5.1 Hierarchy of Certainty

Radiologists and AI systems should use a consistent scale of certainty:

| Certainty Level | Phrasing | When to Use |
|----------------|----------|-------------|
| **Definitive** | "is" | Anatomical facts only (e.g., "there is a 2.1 cm lesion") |
| **Highly Probable** | "is indicative of" | Strong evidence with classic appearance |
| **Probable** | "is consistent with" | Good evidence supporting a differential |
| **Possible** | "is suggestive of" | Findings that raise consideration |
| **Uncertain** | "cannot exclude" | Nonspecific findings; differential broad |

### 5.2 Required Report Structure

Every AI-assisted report must include:

1. **AI Disclosure Statement**: "This report was generated with AI assistance and requires radiologist review"
2. **Technical Quality Assessment**: Image quality and limitations noted
3. **Findings Section**: AI-detected findings with confidence scores
4. **Uncertainty Qualification**: Residual uncertainty explicitly stated
5. **Impression Section**: Requires radiologist review before finalization
6. **Follow-up Recommendations**: Based on urgency level
7. **Disclaimer**: Non-diagnostic nature of AI findings

---

## 6. Finding-Specific Guidelines

---

### 6.1 LESIONS -- Mass, Tumor, Cyst

#### Detection Method
- **AI**: CNN-based 3D segmentation (T1, T1CE, T2, FLAIR sequences)
- **Human**: Board-certified neuroradiologist interpretation
- **Best Practice**: AI pre-screening + radiologist review + multidisciplinary correlation

#### AI Performance Metrics
- Glioma detection F1: 0.961
- Meningioma detection F1: 0.950
- Pituitary tumor detection F1: 0.955
- Overall tumor detection accuracy: 95.2% (meta-analysis of 79 studies)
- Processing time: ~2-4 seconds per case

#### False Positive Risk
- **Rate**: 5-15% depending on lesion type and sequence quality
- **Common Causes**: 
  - Vascular flow voids mimicking lesions
  - Partial volume effects at skull base
  - Benign anatomical variants (Virchow-Robin spaces)
  - Motion artifacts
  - Post-surgical changes
- **Mitigation**: Multi-sequence analysis; radiologist mandatory review

#### False Negative Risk
- **Rate**: 3-10% depending on size and location
- **Common Causes**:
  - Lesions <5mm
  - Non-enhancing low-grade gliomas
  - Brainstem lesions
  - Cortical lesions without contrast
  - Lesions obscured by artifact
- **Mitigation**: Systematic slice-by-slice review; never rely on AI alone

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "A [size] cm T1-hypointense, T2-hyperintense lesion is identified in [location]" | "This is a glioma" |
| "A mass lesion with [imaging characteristics] is present" | "This is benign/malignant" |
| "The lesion demonstrates [enhancement pattern]" | "No tumor present" |
| "Findings are suggestive of a space-occupying process" | "This is a meningioma" |
| "Differential considerations include..." | "No follow-up needed" |

#### Urgency Level
- **New lesion with mass effect**: CRITICAL
- **New lesion without mass effect**: URGENT
- **Stable lesion on follow-up**: ROUTINE
- **Cystic lesion (likely arachnoid)**: ROUTINE

#### Required Follow-up
- New solid lesion: Contrast-enhanced MRI within 24-72 hours; neurosurgical consultation if mass effect
- Cystic lesion: MRI follow-up in 3-6 months
- Incidental lesion: Clinical correlation; consider prior imaging comparison

#### Evidence Grade: **A**

#### Never-Say Phrases
- "This is a [specific tumor type]"
- "This is definitely malignant/benign"
- "No tumor is present" (AI cannot exclude)
- "Biopsy is unnecessary"
- "The patient does not have cancer"

#### Always-Say Phrases
- "AI-assisted detection with radiologist review pending"
- "A space-occupying lesion is identified in [location] measuring [size]"
- "Further characterization requires radiologist interpretation"
- "Clinical correlation and prior imaging comparison recommended"
- "URGENT CLINICAL/RADIOLOGY REVIEW REQUIRED" (if new with mass effect)

---

### 6.2 INFARCTS -- Acute, Subacute, Chronic

#### Detection Method
- **AI**: DWI sequence analysis (restricted diffusion detection); ADC map correlation; 3D CNN (ResNeXt+CBAM)
- **Human**: Neuroradiologist with stroke expertise; ASPECTS scoring
- **Best Practice**: AI triage for acute stroke protocols + neuroradiologist confirmation

#### AI Performance Metrics
- **Acute Ischemic Stroke** (pooled meta-analysis):
  - Sensitivity: 86.9% (95% CI: 69.9-95%)
  - Specificity: 88.6% (95% CI: 77.8-94.5%)
  - DOR: 51.5 (strong diagnostic efficacy)
  - Processing time: 2-4 minutes
- **AI for MRI stroke detection**: Sensitivity 93%, Specificity 93% (HSROC analysis)

#### False Positive Risk
- **Rate**: 7-15% for acute infarcts
- **Common Causes**:
  - T2 shine-through effects
  - Magnetic susceptibility artifacts
  - Chronic lacunar infarcts misclassified as acute
  - Vasogenic edema mimicking cytotoxic edema
- **Mitigation**: ADC correlation; temporal evolution assessment; clinical context

#### False Negative Risk
- **Rate**: 5-14% for acute infarcts; higher for posterior circulation (up to 58%)
- **Common Causes**:
  - Hyperacute infarcts (<3 hours) with subtle DWI changes
  - Small lacunar infarcts (<15mm)
  - Brainstem/cerebellar infarcts
  - Motion artifacts
  - Posterior circulation strokes
- **Mitigation**: Multi-sequence review; FLAIR-DWI mismatch assessment; clinical stroke scale correlation

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Restricted diffusion is identified in [vascular territory]" | "This is an acute stroke" |
| "Signal abnormality on DWI with corresponding ADC hypointensity" | "The patient is having a stroke" |
| "Findings are consistent with acute/subacute ischemia" | "This rules out stroke" |
| "Evidence of prior infarct in [location]" | "No stroke present" |
| "Multiple chronic-appearing lacunar lesions" | "TIA with no infarction" |

#### Urgency Level
- **Acute infarct with DWI positivity**: CRITICAL
- **Acute infarct without mass effect**: CRITICAL
- **Subacute infarct**: URGENT
- **Chronic infarct**: ROUTINE (unless new since prior)

#### Required Follow-up
- Acute DWI-positive lesion: Immediate stroke team activation; vascular imaging
- Subacute lesion: Clinical correlation; antithrombotic management review
- Chronic lesion: Vascular risk factor assessment; routine follow-up
- Multiple chronic lesions: Vascular dementia workup; stroke prevention protocol

#### Evidence Grade: **A**

#### Never-Say Phrases
- "This is a stroke" (clinical diagnosis)
- "No stroke" (AI cannot exclude)
- "Tissue plasminogen activator should be given" (treatment directive)
- "The patient will recover"
- "This is an old stroke only"

#### Always-Say Phrases
- "URGENT CLINICAL/RADIOLOGY REVIEW REQUIRED" (all acute infarcts)
- "DWI hyperintensity with corresponding ADC hypointensity identified in [location]"
- "Clinical stroke assessment and vascular imaging recommended"
- "These findings require immediate neuroradiologist review"
- "AI sensitivity for hyperacute infarcts is limited; radiologist review essential"

---

### 6.3 HEMORRHAGE -- Intraparenchymal, Subdural, Epidural, SAH

#### Detection Method
- **AI**: SWI/GRE/T2* sequence analysis; CT-based AI (primary) with MRI correlation
- **Human**: Neuroradiologist; trauma protocol review
- **Best Practice**: AI triage on SWI + radiologist confirmation; multi-sequence correlation

#### AI Performance Metrics
- **Intracranial Hemorrhage Detection** (pooled meta-analysis):
  - Sensitivity: 90.6% (95% CI: 86.2-93.6%)
  - Specificity: 93.9% (95% CI: 87.6-97.2%)
  - DOR: 148.8 (very strong diagnostic efficacy)
- **Hemorrhagic Stroke**: LR+ 14.9, LR- 0.1

#### False Positive Risk
- **Rate**: 6-10%
- **Common Causes**:
  - Calcification mimicking hemorrhage
  - Flow voids
  - Air-bone interfaces
  - Contrast extravasation (post-confusion)
  - Hemorrhagic transformation of infarct
- **Mitigation**: CT correlation when available; multi-sequence MRI; phase imaging

#### False Negative Risk
- **Rate**: 4-10%
- **Common Causes**:
  - Small petechial hemorrhages (<3mm)
  - Subacute hemorrhage with methemoglobin (isointense on some sequences)
  - Subarachnoid hemorrhage (especially convexal)
  - Chronic microbleeds vs. new hemorrhage
  - Motion artifacts (21% reduction in AI accuracy for hemorrhage detection)
- **Mitigation**: SWI minIP review; radiologist systematic review of all sequences

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Signal abnormality consistent with blood products in [location]" | "This is an acute hemorrhage" |
| "Hypointense signal on SWI/GRE in [location]" | "The patient has a brain bleed" |
| "Evidence of blood products in subdural/epidural space" | "No hemorrhage present" |
| "Hyperdense collection in subdural space" | "Surgery is not needed" |
| "Multiple microhemorrhages scattered throughout..." | "This is a stable SDH" |

#### Urgency Level
- **Acute intraparenchymal hemorrhage**: CRITICAL
- **Subdural hematoma (acute/subacute)**: CRITICAL
- **Epidural hematoma**: CRITICAL
- **Subarachnoid hemorrhage**: CRITICAL
- **Chronic microbleeds**: ROUTINE

#### Required Follow-up
- Acute ICH: Immediate neurosurgical consultation; blood pressure management; coagulation studies
- SDH: Neurosurgical evaluation; serial imaging; anticoagulation review
- SAH: CTA/vascular imaging; neurosurgical consultation; aneurysm workup
- Microbleeds: Cerebral amyloid angiopathy workup; antithrombotic risk assessment

#### Evidence Grade: **B**

#### Never-Say Phrases
- "This is a hemorrhagic stroke" (clinical diagnosis)
- "No bleeding" (AI cannot exclude)
- "This does not require surgery" (clinical decision)
- "The hemorrhage is stable"
- "This is only chronic blood"

#### Always-Say Phrases
- "URGENT CLINICAL/RADIOLOGY REVIEW REQUIRED" (all acute hemorrhages)
- "Signal abnormality consistent with blood products identified in [location]"
- "Immediate neurosurgical and clinical evaluation recommended"
- "AI sensitivity for small hemorrhages is limited; radiologist review essential"
- "This finding requires immediate physician notification"

---

### 6.4 MASS EFFECT -- Midline Shift, Herniation

#### Detection Method
- **AI**: Automated ventricular segmentation; septum pellucidum deviation measurement; cistern effacement detection
- **Human**: Radiologist measurement of septum pellucidum position; assessment of cisterns and sulci
- **Best Practice**: AI quantitative measurement + radiologist visual assessment

#### AI Performance Metrics
- Midline shift detection sensitivity: 85-95%
- Measurement accuracy: Within 2mm of radiologist measurement
- Ventricular compression detection: 88-94%

#### False Positive Risk
- **Rate**: 5-12%
- **Common Causes**:
  - Congenital asymmetry
  - Volume averaging
  - Positioning artifacts
  - Prior craniotomy/craniectomy
- **Mitigation**: Clinical context; prior imaging comparison; knowledge of prior surgery

#### False Negative Risk
- **Rate**: 5-10%
- **Common Causes**:
  - Subtle early effacement
  - Bilateral symmetric mass effect (no midline shift)
  - Pineal gland displacement without septal shift
- **Mitigation**: Systematic cistern and sulcal review; assessment of basal cisterns

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Deviation of the septum pellucidum approximately [X] mm from midline" | "There is uncal herniation" |
| "Effacement of the [cistern/sulci]" | "The patient is herniating" |
| "Ventricular asymmetry with compression of the [side] lateral ventricle" | "No herniation" |
| "Mass effect on the [structure]" | "This is not life-threatening" |
| "Compression of the fourth ventricle identified" | "The patient is fine" |

#### Urgency Level
- **Midline shift >5mm**: CRITICAL
- **Cisternal effacement**: CRITICAL
- **Ventricular entrapment**: CRITICAL
- **Any herniation sign**: CRITICAL
- **Subtle asymmetry**: URGENT

#### Required Follow-up
- Significant midline shift: Immediate neurosurgical consultation; ICP management
- Herniation signs: Emergency intervention; critical care transfer
- Mild effacement: Close monitoring; serial imaging; clinical correlation

#### Evidence Grade: **B**

#### Never-Say Phrases
- "The patient is herniating" (clinical assessment)
- "This is life-threatening" (prognostic statement)
- "No mass effect" (AI cannot exclude)
- "Surgery is needed immediately" (treatment directive)
- "The patient will be fine"

#### Always-Say Phrases
- "URGENT CLINICAL/RADIOLOGY REVIEW REQUIRED" (if shift >3mm or cisternal effacement)
- "Septum pellucidum deviated approximately [X] mm [direction]"
- "Clinical correlation for signs of increased intracranial pressure recommended"
- "Immediate neurosurgical evaluation recommended for significant mass effect"

---

### 6.5 ATROPHY -- Global, Regional, Pattern-Specific

#### Detection Method
- **AI**: Voxel-based morphometry (VBM); automated brain volume quantification; cortical thickness mapping; comparison to age-matched normative atlases
- **Human**: Visual assessment of sulcal prominence; ventricular size; gyral width
- **Best Practice**: AI volumetric quantification + radiologist pattern recognition

#### AI Performance Metrics
- Global atrophy detection accuracy: 82-92%
- Regional atrophy correlation with manual measures: r=0.85-0.94
- Processing time: 5-10 minutes for full volumetric analysis

#### False Positive Risk
- **Rate**: 8-18%
- **Common Causes**:
  - Physiological age-related changes over-read as atrophy
  - Dehydration/volume depletion
  - High-positioning in scanner
  - Normal variant prominent sulci
- **Mitigation**: Age-matched normative comparison; clinical context; prior imaging

#### False Negative Risk
- **Rate**: 8-18%
- **Common Causes**:
  - Early-stage atrophy
  - Focal atrophy (subtle)
  - Asymmetric atrophy (interpreted as normal variant)
  - Coexisting hydrocephalus masking atrophy
- **Mitigation**: Quantitative volumetric analysis; pattern-based assessment; longitudinal comparison

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Volume loss is noted in [region/lobe]" | "This is Alzheimer's disease" |
| "Sulcal prominence and ventricular enlargement consistent with atrophy" | "The patient has dementia" |
| "Regional atrophy pattern in [lobe(s)]" | "This is normal aging" |
| "Pattern of volume loss suggests [differential]" | "No atrophy present" |
| "Generalized volume reduction compared to age norms" | "The patient has frontotemporal dementia" |

#### Urgency Level
- **Rapidly progressive atrophy**: URGENT
- **Focal/asymmetric atrophy**: URGENT (may indicate Rasmussen encephalitis, PML)
- **Pattern-specific atrophy (e.g., mesial temporal)**: ROUTINE
- **Stable age-appropriate atrophy**: ROUTINE

#### Required Follow-up
- New or progressive atrophy: Neurocognitive evaluation; dementia workup
- Pattern-specific atrophy: Targeted clinical evaluation (e.g., Alzheimer's, FTD, Lewy body)
- Rapid progression: Urgent neurology referral; metabolic/infectious workup

#### Evidence Grade: **B**

#### Never-Say Phrases
- "This is Alzheimer's disease" (clinical diagnosis)
- "The patient has dementia" (clinical diagnosis)
- "This is just normal aging" (dismissive; AI cannot determine)
- "No atrophy" (AI cannot exclude early change)
- "The patient has [specific neurodegenerative disease]"

#### Always-Say Phrases
- "Volume loss pattern noted in [specific region(s)]"
- "Clinical correlation with cognitive status recommended"
- "Comparison with prior imaging recommended to assess for interval change"
- "AI-assisted volumetric analysis with radiologist review"
- "Neurocognitive evaluation may be beneficial"

---

### 6.6 VENTRICULOMEGALY -- Hydrocephalus, Ex Vacuo

#### Detection Method
- **AI**: Automated ventricular segmentation; Evans' Index calculation; temporal horn width measurement; callosal angle measurement
- **Human**: Visual assessment of ventricular size; sulcal pattern; CSF spaces
- **Best Practice**: AI quantitative measurements + radiologist pattern assessment for iNPH vs. ex vacuo

#### AI Performance Metrics
- Ventriculomegaly detection: Sensitivity 85-95%, Specificity 88-96%
- Evans' Index measurement accuracy: Within 0.02
- iNPH feature detection: Moderate accuracy

#### False Positive Risk
- **Rate**: 10-20%
- **Common Causes**:
  - Physiological age-related ventricular enlargement
  - Megalencephaly with large ventricles
  - Post-infectious ventricular enlargement (chronic)
  - Anatomical variant
- **Mitigation**: Evans' Index calculation; sulcal assessment; clinical triad evaluation

#### False Negative Risk
- **Rate**: 5-12%
- **Common Causes**:
  - Early hydrocephalus with normal ventricular size
  - Focal entrapment (isolated temporal horn)
  - Normal pressure hydrocephalus with borderline measurements
- **Mitigation**: CSF flow study assessment; callosal angle measurement; clinical correlation

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Ventricular enlargement with Evans' Index of [X]" | "This is normal pressure hydrocephalus" |
| "Ventriculomegaly disproportionate to sulcal prominence" | "The patient needs a shunt" |
| "Ventricular enlargement consistent with ex vacuo change" | "This is compensated hydrocephalus" |
| "Enlarged ventricles with features suggestive of [differential]" | "No hydrocephalus" |
| "Temporal horns are enlarged bilaterally" | "LP should be performed" |

#### Urgency Level
- **Acute hydrocephalus**: CRITICAL
- **iNPH with classic triad**: URGENT
- **Chronic ventriculomegaly**: ROUTINE
- **Ex vacuo enlargement**: ROUTINE

#### Required Follow-up
- Acute hydrocephalus: Emergency neurosurgical consultation
- iNPH features: Neurosurgical referral; CSF tap test consideration
- Ex vacuo: Dementia evaluation; routine follow-up
- New onset: Urgent clinical evaluation for cause

#### Key Differentiating Features (iNPH vs. Ex Vacuo)

| Feature | iNPH | Ex Vacuo |
|---------|------|----------|
| Callosal angle | Small (<90 degrees) | Wide (>100 degrees) |
| Sylvian fissure | Dilated | Normal |
| Superior parietal sulci | Narrowed | Widened |
| Temporal horns | Enlarged | May be enlarged |
| Sulcal prominence | Disproportionate | Proportional |
| Radial force pattern | Present | Absent |

#### Evidence Grade: **B**

#### Never-Say Phrases
- "This is normal pressure hydrocephalus" (clinical-radiological syndrome)
- "The patient needs a shunt" (treatment recommendation)
- "This is compensated hydrocephalus"
- "No hydrocephalus" (AI cannot exclude)
- "LP should be performed" (procedural recommendation)

#### Always-Say Phrases
- "Ventriculomegaly identified with Evans' Index of [X]"
- "Features [suggestive of/consistent with] [differential] noted"
- "Clinical evaluation for gait, cognitive, and urinary symptoms recommended"
- "Distinguishing iNPH from ex vacuo change requires clinical correlation"

---

### 6.7 WHITE MATTER HYPERINTENSITIES (WMH) -- Fazekas Scale

#### Detection Method
- **AI**: FLAIR sequence hyperintensity detection and quantification; automated Fazekas scoring; lesion segmentation
- **Human**: Visual Fazekas grading by radiologist; manual lesion counting
- **Best Practice**: AI automated quantification + radiologist visual confirmation

#### Fazekas Scale (Standard Reporting)

**Periventricular White Matter (PVWM)**:
- 0 = Absent
- 1 = "Caps" or pencil-thin lining
- 2 = Smooth "halo"
- 3 = Irregular periventricular signal extending into deep white matter

**Deep White Matter (DWM)**:
- 0 = Absent
- 1 = Punctate foci
- 2 = Beginning confluence
- 3 = Large confluent areas

*Note: DWM score is most useful for dementia assessment. Report both components.*

#### AI Performance Metrics
- Fazekas scoring correlation with radiologist: ICC 0.73-0.85
- WMH volume quantification accuracy: 85-94%
- Sensitivity for moderate-severe WMH: 90-95%

#### False Positive Risk
- **Rate**: 10-20%
- **Common Causes**:
  - Perivascular (Virchow-Robin) spaces
  - Artifact from CSF pulsation
  - Partial volume effects
  - Normal periventricular "caps" in young adults
- **Mitigation**: Multi-planar assessment; knowledge of normal variants; age-adjusted thresholds

#### False Negative Risk
- **Rate**: 8-15%
- **Common Causes**:
  - Very small punctate lesions
  - Lesions adjacent to ventricles (difficult to distinguish from ependymitis granularis)
  - Infratentorial WMH
  - Subtle subcortical lesions
- **Mitigation**: Careful review of centrum semiovale; assessment of brainstem; FLAIR quality check

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "T2/FLAIR hyperintensities in periventricular and deep white matter" | "This is small vessel disease" (diagnosis) |
| "Fazekas grade [X] PVWM, grade [X] DWM" | "The patient has vascular dementia" |
| "Multiple white matter hyperintensities consistent with chronic microvascular changes" | "These are just age-related" (dismissive) |
| "White matter signal abnormalities noted" | "No white matter disease" |
| "Distribution suggests [differential]" | "This confirms MS" |

#### Urgency Level
- **Severe (Fazekas 3,3) with rapid progression**: URGENT
- **Moderate (Fazekas 2,2)**: ROUTINE
- **Mild (Fazekas 1,1 or less)**: ROUTINE
- **Acute disseminated pattern**: URGENT

#### Required Follow-up
- Severe WMH: Vascular risk factor assessment; cognitive screening
- Moderate WMH: Blood pressure management; lifestyle modification
- New acute lesions: Differential workup (demyelination, infection, vasculitis)
- Progressive WMH: CADASIL workup; genetic counseling if family history

#### Evidence Grade: **B**

#### Never-Say Phrases
- "This is small vessel disease" (pathological diagnosis)
- "This confirms vascular dementia" (clinical diagnosis)
- "These are just normal aging changes"
- "No white matter disease" (AI cannot exclude all pathology)
- "This confirms [any diagnosis]"

#### Always-Say Phrases
- "White matter T2/FLAIR hyperintensities quantified as Fazekas grade [X]"
- "Findings are suggestive of chronic microvascular changes"
- "Vascular risk factor assessment and management recommended"
- "Clinical correlation for cognitive symptoms recommended"

---

### 6.8 DEMYELINATING LESIONS -- Dawson Fingers, Ovoid Lesions

#### Detection Method
- **AI**: FLAIR hyperintensity detection; lesion morphology analysis (ovoid shape, perpendicular orientation); juxtacortical and periventricular distribution assessment
- **Human**: Neuroradiologist with demyelinating disease expertise; McDonald criteria application
- **Best Practice**: AI lesion detection + radiologist DIS (dissemination in space) and DIT (dissemination in time) assessment

#### AI Performance Metrics
- Demyelinating lesion detection: Sensitivity 75-87%, Specificity 80-90%
- Ovoid lesion classification: Moderate accuracy
- Dawson finger detection: Limited validation

#### False Positive Risk
- **Rate**: 15-25%
- **Common Causes**:
  - Chronic small vessel ischemic disease (most common mimic)
  - Migraine-related white matter lesions
  - Infectious/inflammatory lesions
  - Susac syndrome (corpus callosum lesions)
- **Mitigation**: Lesion distribution analysis; central vein sign assessment; shape characterization

#### False Negative Risk
- **Rate**: 13-25%
- **Common Causes**:
  - Small juxtacortical lesions
  - Cortical lesions (difficult on conventional MRI)
  - Infratentorial lesions (posterior fossa artifact)
  - Spinal cord lesions (not assessed on brain MRI)
  - Early lesions without characteristic morphology
- **Mitigation**: Dedicated MS protocol with thin-slice FLAIR; contrast-enhanced imaging; spinal MRI when indicated

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Multiple ovoid T2/FLAIR hyperintensities in periventricular/juxtacortical distribution" | "This is multiple sclerosis" |
| "Lesions oriented perpendicular to ventricles (Dawson finger-like)" | "McDonald criteria are met" |
| "Demyelination-pattern lesions identified" | "The patient has MS" |
| "White matter lesions with distribution suggestive of demyelination" | "No demyelination present" |
| "Enhancing lesion noted, suggestive of active inflammation" | "This rules out MS" |

#### Urgency Level
- **Active demyelination with neurological symptoms**: URGENT
- **Typical MS-pattern lesions (stable)**: ROUTINE
- **Acute disseminated encephalomyelitis pattern**: URGENT
- **Radiologically isolated syndrome**: ROUTINE

#### Required Follow-up
- Active demyelination: Neurology referral; CSF analysis; consider treatment
- Typical lesions: Neurology evaluation; McDonald criteria assessment
- ADEM pattern: Hospital admission; infectious workup; high-dose steroids
- RIS: Clinical monitoring; consider McDonald criteria; shared decision-making

#### Evidence Grade: **C**

#### Never-Say Phrases
- "This is multiple sclerosis" (clinical diagnosis)
- "McDonald criteria are met" (requires clinical correlation)
- "The patient has a demyelinating disease" (clinical diagnosis)
- "No demyelination" (AI cannot exclude)
- "Treatment with [specific medication] should be started"

#### Always-Say Phrases
- "Multiple T2/FLAIR hyperintense lesions with [distributions] noted"
- "Lesion morphology and distribution raise consideration for demyelinating disease"
- "Clinical correlation with neurological examination recommended"
- "Neurology referral recommended for further evaluation"
- "Spinal MRI may be beneficial for comprehensive assessment"

---

### 6.9 HIPPOCAMPAL VOLUME -- Scheltens Scale

#### Detection Method
- **AI**: Automated hippocampal segmentation on T1-weighted coronal images; volumetric quantification; comparison to age-adjusted normative data
- **Human**: Visual Scheltens rating by radiologist; manual volumetric analysis (gold standard)
- **Best Practice**: AI segmentation + radiologist visual Scheltens rating + clinical correlation

#### Scheltens Visual Rating Scale (0-4)

| Score | Choroidal Fissure Width | Temporal Horn Width | Hippocampal Height |
|-------|------------------------|--------------------|--------------------|
| 0 (Normal) | Normal | Normal | Normal |
| 1 | Slightly wide | Slightly wide | Slightly reduced |
| 2 | Moderately wide | Moderately wide | Moderately reduced |
| 3 | Severely wide | Severely wide | Severely reduced |
| 4 (Severe) | Very severely wide | Very severely wide | Very severely reduced |

*Assessed on T1-weighted coronal image at level of anterior pons where both hippocampi are visible*

#### AI Performance Metrics
- Automated segmentation accuracy (Dice): 0.82-0.91
- Volume correlation with manual: r=0.85-0.94
- Scheltens scoring correlation: ICC 0.78-0.88

#### False Positive Risk
- **Rate**: 10-20%
- **Common Causes**:
  - Normal age-related hippocampal volume reduction
  - Slice positioning variation
  - Partial volume effects
  - Variant anatomy (e.g., hippocampal sulcus remnant cysts)
- **Mitigation**: Age-matched normative comparison; consistent slice positioning; clinical context

#### False Negative Risk
- **Rate**: 12-22%
- **Common Causes**:
  - Early bilateral symmetric atrophy (subtle)
  - Unilateral atrophy (may be missed if algorithm averages)
  - Technical quality issues
  - Subfield-specific atrophy not captured by global volume
- **Mitigation**: Visual confirmation of segmentation; subfield analysis when available; clinical correlation

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Hippocampal volumes are [reduced/normal] bilaterally" | "This is Alzheimer's disease" |
| "Scheltens score [X] bilaterally" | "The patient has dementia" |
| "Medial temporal lobe atrophy rated as [severity]" | "This confirms MCI" |
| "Hippocampal volume [X] percentile for age" | "No memory impairment" |
| "Asymmetric hippocampal volumes noted" | "The patient has [specific dementia subtype]" |

#### Urgency Level
- **Marked bilateral atrophy (Scheltens 3-4)**: URGENT (dementia workup)
- **Moderate atrophy (Scheltens 2)**: ROUTINE
- **Mild/asymmetric atrophy**: ROUTINE

#### Required Follow-up
- Marked atrophy: Neurocognitive evaluation; Alzheimer's biomarker assessment
- Moderate atrophy: Cognitive screening; risk factor modification
- Asymmetric atrophy: Consider mesial temporal sclerosis; epilepsy evaluation
- All cases: Clinical correlation with memory/cognitive symptoms

#### Evidence Grade: **B**

#### Never-Say Phrases
- "This is Alzheimer's disease"
- "The patient has dementia"
- "This confirms mild cognitive impairment"
- "No atrophy" (AI cannot exclude subtle change)
- "The hippocampal volume is normal for age" (oversimplification)

#### Always-Say Phrases
- "Hippocampal volumes measured at [X] mL (right) and [X] mL (left)"
- "Scheltens visual rating: [X] right, [X] left"
- "Clinical correlation with cognitive status recommended"
- "Neuropsychological evaluation may be beneficial"
- "Comparison with prior imaging recommended to assess for interval change"

---

### 6.10 CORTICAL THINNING -- Regional Patterns

#### Detection Method
- **AI**: Surface-based cortical thickness analysis on T1-weighted images; vertex-wise comparison to normative atlases; regional parcellation
- **Human**: Visual assessment of cortical ribbon; sulcal depth analysis
- **Best Practice**: AI surface-based analysis + radiologist regional pattern recognition

#### AI Performance Metrics
- Cortical thickness measurement reproducibility: CV <2%
- AD-pattern detection sensitivity: 75-85%
- Regional specificity: Moderate

#### False Positive Risk
- **Rate**: 12-20%
- **Common Causes**:
  - Age-related cortical thinning (normal)
  - Image quality artifacts
  - Registration errors
  - Head size variation
- **Mitigation**: Age-matched comparison; quality control; surface inspection

#### False Negative Risk
- **Rate**: 15-25%
- **Common Causes**:
  - Early-stage thinning (within normal range)
  - Patchy/asymmetric thinning
  - Technical limitations (motion, field strength)
  - Subcortical atrophy predominance
- **Mitigation**: Longitudinal comparison; multi-modal assessment; clinical correlation

#### Regional Patterns and Clinical Correlation

| Pattern | Regions Affected | Clinical Consideration |
|---------|-----------------|----------------------|
| Medial temporal | Entorhinal, hippocampal | Alzheimer's disease |
| Posterior cortical | Parietal, precuneus, posterior cingulate | Posterior cortical atrophy |
| Frontal | Prefrontal, anterior cingulate | Frontotemporal dementia |
| Asymmetric | L > R or R > L | CBS, PPA |
| Diffuse | All regions | Advanced neurodegeneration |

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Regional cortical thinning noted in [lobe(s)]" | "This is Alzheimer's disease" |
| "Pattern of thinning involves [regions]" | "The patient has FTD" |
| "Cortical thickness reduced in [region] compared to age norms" | "This is PCA" |
| "Asymmetric cortical thinning [L>R / R>L]" | "No cortical thinning" |

#### Urgency Level
- **Rapidly progressive thinning**: URGENT
- **AD-signature pattern**: ROUTINE
- **Asymmetric pattern**: ROUTINE
- **Stable mild thinning**: ROUTINE

#### Required Follow-up
- Pattern-specific thinning: Targeted cognitive/neurological evaluation
- Rapid progression: Urgent workup for treatable causes
- AD-signature: Memory clinic referral; biomarker assessment

#### Evidence Grade: **C**

#### Never-Say Phrases
- "This is [specific neurodegenerative disease]"
- "The pattern confirms [diagnosis]"
- "No cortical thinning" (AI cannot exclude early change)
- "The patient will develop dementia"

#### Always-Say Phrases
- "Regional cortical thinning pattern noted in [specific regions]"
| "Pattern suggests [differential] but clinical correlation required"
| "Neuropsychological evaluation recommended"
| "Longitudinal monitoring recommended"

---

### 6.11 CEREBELLAR ABNORMALITIES -- Atrophy, Dysplasia

#### Detection Method
- **AI**: Cerebellar volumetric analysis; fissure width assessment; vermian morphology evaluation
- **Human**: Visual assessment of cerebellar folial pattern; vermian size; fissure prominence
- **Best Practice**: AI volumetrics + radiologist pattern recognition + clinical context

#### AI Performance Metrics
- Cerebellar volume accuracy: Moderate (72-86% sensitivity)
- Vermian hypoplasia detection: Limited validation
- Atrophy detection: 75-85%

#### False Positive Risk
- **Rate**: 12-22%
- **Common Causes**:
  - Normal variant prominent cerebellar fissures
  - Age-related cerebellar volume loss
  - Alcohol-related changes (clinical history may not be known)
  - Slice positioning artifacts
- **Mitigation**: Age-matched norms; clinical context; alcohol history when available

#### False Negative Risk
- **Rate**: 14-25%
- **Common Causes**:
  - Subtle vermian hypoplasia
  - Focal cerebellar dysplasia
  - Posterior fossa artifact
  - Isolated hemisphere atrophy
- **Mitigation**: Dedicated posterior fossa sequences; thin-slice imaging; clinical correlation

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Cerebellar volume appears reduced" | "This is cerebellar degeneration" |
| "Prominent cerebellar fissures consistent with atrophy" | "The patient has ataxia" |
| "Vermian hypoplasia/dysplasia noted" | "This is spinocerebellar ataxia" |
| "Cerebellar folial pattern appears abnormal" | "No cerebellar abnormality" |

#### Urgency Level
- **Acute cerebellar swelling**: CRITICAL
- **New atrophy with symptoms**: URGENT
- **Chronic stable atrophy**: ROUTINE
- **Developmental anomaly**: ROUTINE

#### Required Follow-up
- Acute: Emergency evaluation; posterior fossa decompression if needed
- Progressive ataxia: Neurology referral; genetic testing; alcohol assessment
- Developmental: Genetic counseling; developmental evaluation

#### Evidence Grade: **C**

#### Never-Say Phrases
- "This is cerebellar degeneration"
- "The patient has ataxia" (clinical symptom)
- "This is [specific hereditary ataxia]"
- "No cerebellar abnormality"

#### Always-Say Phrases
- "Cerebellar [volume/folial pattern] noted to be [description]"
| "Clinical correlation for gait/balance symptoms recommended"
| "Neurology referral recommended if progressive symptoms"

---

### 6.12 BASAL GANGLIA FINDINGS -- Iron, Calcification, Lesions

#### Detection Method
- **AI**: SWI/T2* hypointensity quantification; T1 hyperintensity detection; morphology analysis
- **Human**: Visual assessment of signal characteristics; comparison to red nucleus; age-adjusted norms
- **Best Practice**: AI signal analysis + radiologist pattern recognition + iron-sensitive sequences

#### Normal Age-Related Iron Deposition
- Globus pallidus and substantia nigra normally become T2 hypointense by end of first decade
- Compare GP/SN to red nucleus as internal reference
- Iron increases with age physiologically

#### AI Performance Metrics
- Iron detection on SWI: 68-82% sensitivity
- Calcification detection: 70-85% sensitivity
- Lesion detection: 72-86% sensitivity
- Pattern recognition: Limited

#### False Positive Risk
- **Rate**: 15-25%
- **Common Causes**:
  - Physiological iron deposition over-read as abnormal
  - Calcification misclassified as iron
  - Flow artifacts in basal ganglia region
  - Normal variant prominent perivascular spaces
- **Mitigation**: Age-adjusted norms; comparison to red nucleus; CT correlation for calcification

#### False Negative Risk
- **Rate**: 18-30%
- **Common Causes**:
  - Early abnormal iron deposition (subtle signal change)
  - Non-iron-related signal changes
  - Small focal lesions
  - Motion artifacts in this region
- **Mitigation**: Dedicated iron-sensitive sequences; high-field MRI when available; clinical correlation

#### Key Patterns and Differentials

| Pattern | Iron Distribution | Associated Features | Consideration |
|---------|-------------------|-------------------|---------------|
| Eye-of-the-tiger | GP central hyperintensity, surrounding hypointensity | - | PKAN (NBIA) |
| Halo sign | Substantia nigra | Thin corpus callosum | BPAN |
| Widespread | GP, SN, thalamus, cerebellum | Cavitation | Neuroferritinopathy |
| Diffuse uniform | All basal ganglia | Systemic iron overload | Aceruloplasminemia |
| T1 hyperintensity | Bilateral GP | Liver disease | Manganese deposition |

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "T2 hypointensity in globus pallidus bilaterally" | "This is PKAN" |
| "Iron deposition pattern noted in [structures]" | "The patient has NBIA" |
| "Signal abnormality in basal ganglia bilaterally" | "This is Wilson disease" |
| "Calcification in basal ganglia noted on [sequence]" | "No basal ganglia abnormality" |

#### Urgency Level
- **Acute basal ganglia lesion**: URGENT
- **Symmetric signal abnormality**: URGENT (metabolic/toxic)
- **Iron deposition pattern**: ROUTINE
- **Calcification**: ROUTINE

#### Required Follow-up
- Acute: Urgent metabolic/toxic workup; infectious workup
- Symmetric abnormality: MRI with contrast; metabolic labs; toxicology
- Iron deposition: Neurology referral; genetic testing; ophthalmology evaluation
- Calcification: Calcium/phosphorus/PTH assessment; metabolic workup

#### Evidence Grade: **C**

#### Never-Say Phrases
- "This is [specific NBIA subtype]"
- "The patient has [metabolic disorder]"
- "This is Wilson disease/Huntington disease"
- "No basal ganglia abnormality"

#### Always-Say Phrases
- "Signal abnormality in [specific basal ganglia structure] noted"
| "Pattern [suggestive of/consistent with] [differential]"
| "Clinical and laboratory correlation recommended"
| "Neurology referral recommended for pattern evaluation"

---

### 6.13 CORPUS CALLOSUM -- Thinning, Agenesis, Lesions

#### Detection Method
- **AI**: Callosal segmentation and thickness mapping; agenesis detection; signal analysis
- **Human**: Visual assessment of corpus callosum on sagittal T1; thickness evaluation; morphology assessment
- **Best Practice**: AI segmentation + radiologist sagittal review + associated anomaly assessment

#### AI Performance Metrics
- Callosal thickness measurement: 65-80% sensitivity
- Agenesis detection: 85-95% (for complete agenesis)
- Partial agenesis/hypoplasia: 60-75%
- Lesion detection: Limited

#### False Positive Risk
- **Rate**: 10-20%
- **Common Causes**:
  - Partial volume effects
  - Midline slice selection errors
  - Normal variant thin splenium
  - Age-related thinning
- **Mitigation**: Dedicated sagittal imaging; multi-planar review; age norms

#### False Negative Risk
- **Rate**: 20-35%
- **Common Causes**:
  - Partial agenesis (subtle)
  - Small focal lesions
  - Thinning secondary to hydrocephalus (not primary)
  - Signal changes without morphologic change
- **Mitigation**: Systematic sagittal review; assessment of associated structures (Probst bundles, colpocephaly)

#### Key Findings and Associations

| Finding | MRI Features | Associated Anomalies |
|---------|-------------|---------------------|
| Complete agenesis | Absent corpus callosum | Probst bundles, colpocephaly, parallel ventricles |
| Partial agenesis | Thin/absent segments | Less severe associations |
| Thinning | Reduced thickness | Chronic hydrocephalus, metabolic, age |
| Lesions | T2 hyperintensity | MS, Susac syndrome, lymphoma, metabolic |
| Lipoma | T1 hyperintense midline mass | May have associated dysgenesis |

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Corpus callosum appears thinned/hypoplastic" | "This is agenesis of the corpus callosum" (if partial) |
| "Corpus callosum is not identified" | "The patient has developmental delay" |
| "Signal abnormality in corpus callosum" | "This is MS" |
| "Corpus callosum measures [X] mm in thickness" | "No callosal abnormality" |

#### Urgency Level
- **Complete agenesis with acute symptoms**: URGENT
- **New focal lesion**: URGENT
- **Thinning/stable hypoplasia**: ROUTINE
- **Incidental lipoma**: ROUTINE

#### Required Follow-up
- Agenesis: Genetic counseling; developmental evaluation; seizure assessment
- New lesions: Neurology referral; demyelinating workup; contrast imaging
- Thinning: Clinical correlation; hydrocephalus assessment

#### Evidence Grade: **C**

#### Never-Say Phrases
- "This is agenesis of the corpus callosum" (radiological description sufficient)
- "The patient will have developmental problems"
- "This confirms MS/Susac syndrome"
- "No callosal abnormality"

#### Always-Say Phrases
- "Corpus callosum [thinned/not identified/hypoplastic] on sagittal imaging"
| "Associated findings include [Probst bundles/colpocephaly/etc.]"
| "Clinical correlation and genetic counseling may be beneficial"

---

### 6.14 DEVELOPMENTAL ANOMALIES -- Malformations of Cortical Development

#### Detection Method
- **AI**: Cortical thickness analysis; gyrification assessment; gray-white matter junction evaluation; ventricular morphology
- **Human**: Expert pediatric neuroradiologist; pattern recognition; genetic correlation
- **Best Practice**: Expert review mandatory; AI can assist with detection but interpretation requires subspecialist

#### Classification of Malformations of Cortical Development (MCD)

| Category | Key MRI Features | Examples |
|----------|-----------------|----------|
| Focal Cortical Dysplasia (FCD) | Blurred gray-white junction, cortical thickening, transmantle sign | FCD Type I, II, III |
| Gray Matter Heterotopia | Gray matter in abnormal location (subcortical band, periventricular) | Subcortical band heterotopia |
| Lissencephaly | Absent/reduced gyri, cortical thickening, figure-of-eight appearance | LIS1, DCX mutations |
| Polymicrogyria | Excessive small convolutions, irregular cortical surface | Bilateral perisylvian |
| Schizencephaly | Transcortical cleft lined by polymicrogyric cortex | Open/closed lip |
| Cobblestone malformation | Irregular cobblestone cortex, overmigration | Walker-Warburg |

#### AI Performance Metrics
- FCD detection: 60-78% sensitivity
- Lissencephaly detection: Higher (obvious structural anomaly)
- Heterotopia detection: 65-80%
- Polymicrogyria detection: 55-70%

#### False Positive Risk
- **Rate**: 20-30%
- **Common Causes**:
  - Partial volume effects mimicking blurred gray-white junction
  - Normal variant cortical irregularities
  - Motion artifacts simulating polymicrogyria
  - Incomplete myelination in infants
- **Mitigation**: Age-appropriate interpretation; high-resolution imaging; expert review

#### False Negative Risk
- **Rate**: 22-40%
- **Common Causes**:
  - Subtle FCD (especially Type I)
  - Small focal dysplasia
  - Age-dependent appearance (myelination-related)
  - Thin subcortical band heterotopia
- **Mitigation**: High-resolution 3D T1; FLAIR; expert pediatric neuroradiology review

#### Reporting Language (Safe, Non-Diagnostic)

| Acceptable | Unacceptable |
|-----------|-------------|
| "Abnormal cortical gyral pattern noted in [location]" | "This is focal cortical dysplasia" |
| "Cortical thickening with blurred gray-white junction" | "The patient has epilepsy" |
| "Gray matter signal tissue in subcortical white matter" | "This is [specific syndrome]" |
| "Simplified gyral pattern noted" | "No cortical abnormality" |
| "Transmantle sign present" | "Surgery is indicated" |

#### Urgency Level
- **Newly diagnosed in acute setting**: URGENT
- **Known anomaly, new symptoms**: URGENT
- **Incidental finding**: ROUTINE
- **Prenatal/screening**: ROUTINE (genetic counseling)

#### Required Follow-up
- New MCD: Genetic counseling; epilepsy evaluation; developmental assessment
- Known MCD: Neurology follow-up; seizure monitoring; developmental support
- FCD with epilepsy: Epilepsy surgery evaluation
- Genetic: Targeted genetic testing; family counseling

#### Evidence Grade: **D**

#### Never-Say Phrases
- "This is [specific MCD subtype]" (requires pathology correlation)
- "The patient will have seizures"
- "This is [genetic syndrome]"
- "No malformation present"
- "Surgery should be performed"

#### Always-Say Phrases
- "Abnormal cortical development pattern noted in [location]"
| "Findings suggest malformation of cortical development"
| "Expert pediatric neuroradiology review recommended"
| "Genetic evaluation and counseling recommended"
| "Clinical correlation for seizures/developmental delay recommended"

---

## 7. AI Performance Reference Data

### 7.1 Summary of Key Studies

#### Brain Tumor Detection
- **Meta-analysis (2024)**: 79 studies, CNN/ensemble algorithms, F1=0.952, accuracy=95.2%
  - Glioma F1: 0.961
  - Meningioma F1: 0.950
  - Pituitary F1: 0.955
  - Source: PMC12306512

#### Acute Stroke Detection
- **Meta-analysis (2025)**: Pooled sensitivity 86.9%, specificity 88.6%
  - Hemorrhagic stroke: Sensitivity 90.6%, specificity 93.9%
  - DOR for hemorrhage: 148.8
  - Source: PMC12378110, PMC12588366

#### MRI-Specific Stroke Detection
- **Systematic Review (2024)**: 33 studies, sensitivity 93%, specificity 93%
  - HSROC positive LR: 12.6
  - HSROC negative LR: 0.079
  - Source: Springer, Insights Imaging

#### False Positive Reduction
- **Breast MRI AI**: 27.3% reduction in false positives, 24.5% improvement in inter-reader variability
  - Source: Nature Communications, PMC12966481
- **Prostate MRI AI**: 50.4% reduction in false positives
  - Source: Diagnostic Imaging, 2024

### 7.2 Quality Assessment Framework

Based on CLAIM (Checklist for AI in Medical Imaging) and QUADAS-2:

| Criterion | Current State | Target |
|-----------|--------------|--------|
| Peer-reviewed evidence for AI products | 66% (2023) | >80% |
| Prospective validation | 16% | >30% |
| Multi-center studies | 41% | >50% |
| Vendor-independent studies | 45% | >60% |
| Higher efficacy levels (3-6) | 24% | >35% |

### 7.3 Known AI Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| Motion artifacts | 21% reduction in hemorrhage detection accuracy | Shorter sequences; motion correction |
| Posterior fossa | Reduced sensitivity for brainstem/cerebellar lesions | Dedicated posterior fossa sequences |
| Small lesions (<5mm) | Higher false negative rate | Thin-slice imaging; radiologist review |
| Rare conditions | Limited training data | Expert consultation; case-based learning |
| Image quality variation | Reduced performance on non-optimal studies | Quality assurance; rescan protocols |
| Scanner variability | Inter-vendor performance differences | Multi-scanner validation; harmonization |

---

## 8. Appendices

### Appendix A: Emergency Escalation Protocol

```
CRITICAL FINDING DETECTED
=========================
1. AI flags finding with CRITICAL urgency
2. System displays: "URGENT CLINICAL/RADIOLOGY REVIEW REQUIRED"
3. Automated notification to on-call radiologist
4. Notification to ordering physician/clinical team
5. PACS flag with red indicator
6. Documentation in critical results log
7. Follow-up confirmation of radiologist review
8. Direct communication to clinical team confirmed
```

### Appendix B: Report Template

```
AI-ASSISTED MRI BRAIN INTERPRETATION
====================================
DISCLAIMER: This report was generated with AI assistance and requires
review by a board-certified radiologist. AI-generated findings are
interpretive aids, not diagnostic conclusions.

TECHNIQUE: [Sequence details]
           AI software version: [Version]
           AI confidence threshold: [Threshold]

CLINICAL HISTORY: [As provided]

COMPARISON: [Prior studies if available]

AI DETECTION FINDINGS:
- Finding 1: [Description] | AI Confidence: [X]% | Urgency: [Level]
- Finding 2: [Description] | AI Confidence: [X]% | Urgency: [Level]

FINDINGS REQUIRING RADIOLOGIST REVIEW:
- [List of all findings flagged for human review]

IMPRESSION:
[REQUIRES RADIOLOGIST REVIEW AND APPROVAL]

FOLLOW-UP RECOMMENDATIONS:
[To be determined by radiologist]

NOTIFIED: [Radiologist name] at [Time]
CONFIRMED: [Radiologist signature required]
```

### Appendix C: Glossary of Terms

| Term | Definition |
|------|-----------|
| **AI** | Artificial Intelligence |
| **ASPECTS** | Alberta Stroke Program Early CT Score |
| **ADC** | Apparent Diffusion Coefficient |
| **DWI** | Diffusion-Weighted Imaging |
| **FLAIR** | Fluid-Attenuated Inversion Recovery |
| **FCD** | Focal Cortical Dysplasia |
| **GRE** | Gradient Recalled Echo |
| **iNPH** | Idiopathic Normal Pressure Hydrocephalus |
| **MCD** | Malformations of Cortical Development |
| **MS** | Multiple Sclerosis |
| **NBIA** | Neurodegeneration with Brain Iron Accumulation |
| **NPV** | Negative Predictive Value |
| **PPV** | Positive Predictive Value |
| **RIS** | Radiologically Isolated Syndrome |
| **SWI** | Susceptibility-Weighted Imaging |
| **VBM** | Voxel-Based Morphometry |
| **WMH** | White Matter Hyperintensities |

### Appendix D: Regulatory and Safety Standards

| Standard | Application |
|----------|------------|
| FDA 510(k) | Medical device clearance for AI software |
| CE Mark | European conformity for AI products |
| HIPAA | Patient data protection |
| CLAIM | Checklist for AI in Medical Imaging reporting |
| QUADAS-2 | Quality assessment of diagnostic accuracy studies |
| MI-CLAIM | Minimum information about clinical AI modeling |
| ACR-AI-LAB | American College of Radiology AI validation |
| RSNA | Reporting standards and AI ethics |

### Appendix E: Levels of Evidence for AI Tools (AJNR Framework)

| Level | Evidence Type |
|-------|--------------|
| 1 | Multiple RCTs demonstrating positive clinical impact |
| 3 | Retrospective multicenter studies; no prospective data |
| 5B | Single retrospective study; model development without external validation |
| 6-7 | Technical feasibility; regulatory compliance; IT compatibility |

---

## REFERENCES

### Key Meta-Analyses and Systematic Reviews

1. Performance Evaluation of AI Techniques in Brain Tumors: Systematic Review and Meta-Analysis. PMC12306512, 2024.
2. Evaluating Diagnostic Accuracy of AI in Ischemic Stroke: Meta-Analysis. PMC12378110, 2024.
3. AI for MRI Stroke Detection: Systematic Review and Meta-Analysis. Insights Imaging, 2024.
4. Role of AI in Reducing Error Rates in Radiology. PMC12512053, 2024.
5. AI in Stroke Imaging: Systematic Review. PMC12588366, 2024.
6. BL4AS: Interpretable AI System Reducing False-Positive MRI Diagnoses. Nature Communications, 2026.
7. AI vs. Radiologist False-Positives: AJR Study, 2025.
8. 173 Commercially Available AI Products and Scientific Evidence. PMC12711992, 2025.
9. Critical Appraisal of AI-Enabled Imaging Tools Using Levels of Evidence. AJNR, 2023.
10. Fazekas Scale: Radiopaedia Reference Article, 2025.
11. Correlation Between Hippocampal Volumes and Medial Temporal Lobe Atrophy. PMC5341264.
12. MRI Evaluation of Pathologies Affecting the Corpus Callosum. PMC3932574.
13. Malformations of Cortical Development: Practical Guidelines. PMC7586092, 2018.
14. Brain MRI Pattern Recognition in Neurodegeneration with Brain Iron Accumulation. PMC7511538.
15. Differences in Brain Morphology Between Hydrocephalus Ex Vacuo and iNPH. PMC8328827, 2021.
16. Dawson's Fingers in Cerebral Small Vessel Disease. PMC7396560.
17. Dawson's Finger Radiological Presentation of Relapsing MS. PMC12010641.
18. Regional WMH and Longitudinal Alzheimer-Like Neurodegeneration. JAMA Network Open, 2021.
19. MRI Evaluation of Corpus Callosum Malformation. Cureus, 2024.
20. AI Reduces False Positives in MRI (Prostate). Diagnostic Imaging, 2024.

### Reporting Guidelines

21. Radiology Report Writing Skills: Linguistic and Technical Guide. PMC7506086.
22. Report Finds Radiologists to Blame for Missed Diagnoses. PSQH, 2018.
23. Disorders of the Corpus Callosum (NODCC), 2025.
24. Agenesis of the Corpus Callosum (Lurie Children's).

---

*This framework is intended for educational and clinical decision support purposes. It does not constitute medical advice. All clinical decisions must be made by qualified healthcare professionals.*

*AI-assisted tools are clinical aids only. Patient care decisions require physician judgment.*

---

**END OF DOCUMENT**
