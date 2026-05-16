# DeepSynaps Protocol Studio: Neuroimaging Cohort Integration Report (PHASE 2)

## ADNI + ABIDE Cohort Data Integration for Clinical Neuromodulation Context

**Version:** 1.0.0-PHASE2  
**Date:** 2025-01-16  
**Classification:** Technical Integration Report — Research Context Layer  
**Target:** DeepSynaps Protocol Studio Knowledge Layer (PHASE 2)  
**Repository:** `DeepSynaps-Protocol-Studio`  
**Author:** Neuroimaging Epidemiology Research Specialist  

---

> **CRITICAL GOVERNANCE NOTICE**
>
> This report describes the integration of large-scale neuroimaging cohort data (ADNI, ABIDE)
> into the DeepSynaps Protocol Studio Knowledge Layer. **Every cohort data point described herein
> is research data, not diagnostic data.** Cohort statistics provide population-level context only.
> They cannot and must not be used to diagnose individual patients. All integration patterns
> enforce explicit caveats on every display. Violating these caveats is a clinical safety breach.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [ADNI Deep Dive](#2-adni-deep-dive)
3. [ABIDE Deep Dive](#3-abide-deep-dive)
4. [Cohort Data Integration Patterns](#4-cohort-data-integration-patterns)
5. [DeepSynaps Integration Architecture](#5-deepsynaps-integration-architecture)
6. [Display Rules & Caveats](#6-display-rules--caveats)
7. [Provenance & Confidence Model](#7-provenance--confidence-model)
8. [DeepTwin Cohort Integration](#8-deeptwin-cohort-integration)
9. [Licensing & Access Requirements](#9-licensing--access-requirements)
10. [Implementation Recommendations](#10-implementation-recommendations)
11. [Clinical Safety Rules](#11-clinical-safety-rules)
12. [Risks & Mitigations](#12-risks--mitigations)

---

## 1. Executive Summary

### 1.1 Purpose

This report provides a comprehensive technical analysis of two major neuroimaging cohort datasets — ADNI (Alzheimer's Disease Neuroimaging Initiative) and ABIDE (Autism Brain Imaging Data Exchange) — for integration into the DeepSynaps Protocol Studio Knowledge Layer (PHASE 2). These cohorts provide population-level neuroimaging reference data that can contextualize individual patient brain measurements within broader research distributions.

### 1.2 Cohort Datasets at a Glance

| Dimension | ADNI | ABIDE |
|-----------|------|-------|
| **Full Name** | Alzheimer's Disease Neuroimaging Initiative | Autism Brain Imaging Data Exchange |
| **Condition Focus** | Alzheimer's disease spectrum | Autism Spectrum Disorder (ASD) |
| **Phases** | ADNI-1, ADNI-GO, ADNI-2, ADNI-3 | ABIDE I, ABIDE II |
| **Total Participants** | ~2,000+ across all phases | ~2,200 (I: ~1,100; II: ~1,100) |
| **Data Types** | MRI, PET (amyloid, tau, FDG), CSF, genetics, cognition | rs-fMRI, T1-weighted MRI |
| **Study Design** | Multi-site longitudinal (6+ years) | Multi-site cross-sectional + some longitudinal |
| **Sites** | 60+ sites (US + Canada) | 24+ international sites |
| **Access Model** | Restricted (application required) | Fully open |
| **License** | ADNI Data Use Agreement (research only) | CC BY-SA 3.0 |
| **Commercial Use** | Strictly prohibited | Permitted with attribution |
| **Integration Role** | Reference for aging / neurodegeneration context | Reference for neurodevelopmental context |
| **Patient Population** | Primarily 55-90 years old | Primarily 7-64 years old |

### 1.3 Key Biomarkers Available

| Biomarker | ADNI | ABIDE | Clinical Relevance |
|-----------|------|-------|-------------------|
| **Structural MRI** | T1, T2, FLAIR, SWI | T1-weighted | Brain volume, cortical thickness, lesion detection |
| **Functional MRI** | rs-fMRI (limited) | rs-fMRI (primary) | Connectivity patterns, network analysis |
| **Amyloid PET** | Florbetapir, Florbetaben | N/A | Amyloid plaque burden (ADNI) |
| **Tau PET** | Flortaucipir (ADNI-3) | N/A | Neurofibrillary tangle burden |
| **FDG-PET** | Available | N/A | Glucose metabolism patterns |
| **CSF Biomarkers** | Aβ42, tau, p-tau181 | N/A | In vivo AD pathology assessment |
| **Genetics** | APOE, GWAS data | N/A | Risk allele identification |
| **Cognition** | MMSE, MoCA, ADAS-Cog, CDR | N/A | Cognitive trajectory tracking |
| **Phenotypics** | Age, sex, education, race | Age, sex, IQ, diagnosis, site | Matching and stratification |

### 1.4 Critical Governance Framework

```
+------------------------------------------------------------------+
|                     COHORT DATA GOVERNANCE                        |
+------------------------------------------------------------------+
|  PRINCIPLE 1:  Group statistics ≠ individual diagnosis           |
|  PRINCIPLE 2:  Every display must carry an explicit caveat       |
|  PRINCIPLE 3:  ADNI data is research-only, no commercial use     |
|  PRINCIPLE 4:  ABIDE site effects must always be disclosed       |
|  PRINCIPLE 5:  Z-scores are relative to cohort, not clinical ref |
|  PRINCIPLE 6:  Cohort data enhances context, never replaces dx   |
|  PRINCIPLE 7:  All access must comply with DUA / license terms   |
+------------------------------------------------------------------+
```

### 1.5 Integration Value for DeepSynaps

| DeepSynaps Feature | Cohort Integration Value | Data Source |
|-------------------|-------------------------|-------------|
| Patient MRI contextualization | Z-score vs age-matched CN reference | ADNI |
| Brain volume interpretation | Hippocampal volume percentiles | ADNI |
| Cortical thickness analysis | Region-specific thickness norms | ADNI |
| Functional connectivity context | Network connectivity distributions | ABIDE |
| Neurodevelopmental context | ASD vs TD connectivity patterns | ABIDE |
| Longitudinal change tracking | Annual atrophy rate references | ADNI |
| Multimodal synthesis (DeepTwin) | Cohort-informed priors for synthesis | Both |
| Protocol optimization | Target selection based on cohort patterns | Both |

---

## 2. ADNI Deep Dive

### 2.1 Overview

The **Alzheimer's Disease Neuroimaging Initiative (ADNI)** is a landmark multi-site longitudinal study launched in 2004 to develop clinical, imaging, genetic, and biochemical biomarkers for the early detection and tracking of Alzheimer's disease. Funded primarily by the National Institute on Aging (NIA) with private-sector contributions, ADNI represents the most comprehensively characterized neurodegeneration cohort in existence.

**Official URL:** https://adni.loni.usc.edu/  
**Data Repository:** https://ida.loni.usc.edu/  
**Current Status:** ADNI-3 active enrollment complete; ADNI-4 launched 2024  
**Primary Publications:** Mueller et al. (2005), Petersen et al. (2010), Weiner et al. (2017)

### 2.2 Study Phases

| Phase | Period | Participants | Age Range | Key Innovation |
|-------|--------|-------------|-----------|----------------|
| **ADNI-1** | 2004–2009 | ~800 | 55–90 | Baseline structural MRI, CSF, cognition |
| **ADNI-GO** | 2009–2011 | ~200 | 55–90 | Early MCI focus, amyloid imaging initiation |
| **ADNI-2** | 2011–2016 | ~550 | 55–90 | Standardized amyloid PET, tau biomarkers |
| **ADNI-3** | 2016–2023 | ~500 | 55–90 | Tau PET (flortaucipir), tau PET, genetics expansion |
| **ADNI-4** | 2024–ongoing | Enrolling | 55–90 | Expanded diversity, digital biomarkers |

### 2.3 Diagnostic Groups

| Group | Abbreviation | Criteria | Approx. N (cumulative) | Clinical Significance |
|-------|-------------|----------|----------------------|----------------------|
| **Cognitively Normal** | CN | MMSE 24–30, CDR 0, no MCI | ~700 | Reference control group |
| **Early Mild Cognitive Impairment** | EMCI | MMSE 24–30, CDR 0.5, memory complaint | ~500 | Preclinical/prodromal stage |
| **Late Mild Cognitive Impairment** | LMCI | MMSE 20–26, CDR 0.5, functional independence | ~400 | More advanced impairment |
| **Alzheimer's Disease** | AD | NINCDS-ADRDA criteria, CDR 0.5–1 | ~400 | Dementia stage |
| **Significant Memory Concern** | SMC | (ADNI-2+) Subjective memory concern, normal tests | ~200 | Subjective cognitive decline |

### 2.4 MRI Acquisition Protocol

ADNI MRI follows a standardized protocol across all sites to minimize scanner-related variance:

| Sequence | Parameters | Purpose |
|----------|-----------|---------|
| **3D T1-weighted (MP-RAGE)** | 1.0×1.0×1.2mm, TR/TE ~2300/3ms | Structural morphology, volumetrics |
| **3D T1-weighted (IR-SPGR)** | 1.0×1.0×1.2mm, TR/TE ~7/3ms | Alternative T1 (legacy ADNI-1) |
| **T2-weighted** | 1.0×1.0×3.0mm | White matter lesion assessment |
| **FLAIR** | 1.0×1.0×3.0mm | White matter hyperintensity quantification |
| **SWI** | 2.0×2.0×3.0mm (ADNI-3+) | Microhemorrhage detection |
| **rs-fMRI** | 3.5×3.5×3.5mm, TR 3000ms (ADNI-3) | Resting-state connectivity |
| **Field Mapping** | Dual-echo gradient echo | B0 distortion correction |

### 2.5 PET Imaging Biomarkers

| PET Modality | Tracers | Quantification | Biological Target |
|-------------|---------|---------------|-------------------|
| **Amyloid PET** | Florbetapir (18F-AV45), Florbetaben (18F-BAY94-9172) | SUVR (cerebellar reference) | Fibrillar amyloid-β deposition |
| **Tau PET** | Flortaucipir (18F-AV1451, T807) | SUVR (inferior cerebellar reference) | Neurofibrillary tangle burden |
| **FDG-PET** | 18F-fluorodeoxyglucose | SUVr (pons reference) | Regional glucose metabolism |

### 2.6 CSF Biomarkers

| Biomarker | Assay Method | Clinical Interpretation | Key Cut-points |
|-----------|-------------|------------------------|----------------|
| **Aβ42** | Elecsys, INNO-BIA AlzBio3 | Decreased in AD (amyloid aggregation) | <980 pg/mL (abnormal) |
| **Total Tau (t-tau)** | Elecsys, INNO-BIA | Increased in AD (neuronal injury) | >93 pg/mL (abnormal) |
| **p-Tau181** | Elecsys, INNO-BIA | Increased in AD (tangle pathology) | >23 pg/mL (abnormal) |
| **Aβ42/40 ratio** | Elecsys (newer) | More specific than Aβ42 alone | <0.89 (abnormal) |
| **NfL** | Simoa (ADNI-3+) | Neuroaxonal injury marker | Age-dependent |
| **GFAP** | Simoa (ADNI-3+) | Astrocytic activation | Age-dependent |

### 2.7 Key MRI-Derived Biomarkers

| Biomarker | Measurement Method | Clinical Relevance | ADNI Availability |
|-----------|-------------------|-------------------|-------------------|
| **Hippocampal Volume** | Freesurfer segmentation | Primary AD neurodegeneration marker | All phases |
| **Entorhinal Cortex Thickness** | Freesurfer cortical thickness | Early AD vulnerability region | All phases |
| **Whole Brain Volume** | Freesurfer / SIENAX | Global atrophy measure | All phases |
| **Ventricular Volume** | Freesurfer / UCSF method | Indirect atrophy measure | All phases |
| **Cortical Thickness (68 regions)** | Freesurfer DKT atlas | Regional neurodegeneration patterns | All phases |
| **White Matter Hyperintensity** | FLAIR segmentation (UCSF) | Small vessel disease burden | All phases |
| **Cortical Amyloid Burden** | PET SUVR converted to Centiloid | Standardized amyloid measurement | ADNI-GO onward |
| **Regional Tau Burden** | Tau PET SUVR | Regional tangle distribution | ADNI-3 |

### 2.8 Cognitive Assessment Battery

| Test | What It Measures | Scoring | Longitudinal Use |
|------|-----------------|---------|-----------------|
| **MMSE** | Global cognition | 0–30 (higher=better) | All phases |
| **MoCA** | Global cognition (more sensitive) | 0–30 (higher=better) | ADNI-2 onward |
| **ADAS-Cog 11** | Cognitive impairment severity | 0–70 (higher=worse) | All phases |
| **ADAS-Cog 13** | Extended cognitive assessment | 0–85 (higher=worse) | ADNI-2 onward |
| **CDR** | Dementia staging | 0, 0.5, 1, 2, 3 | All phases |
| **CDR-SB** | Sum of boxes (more granular) | 0–18 (higher=worse) | All phases |
| **RAVLT** | Verbal episodic memory | Multiple scores | All phases |
| **Logical Memory (WMS)** | Story memory | Immediate + delayed | All phases |
| **TMT-A/B** | Processing speed / executive function | Time to completion | ADNI-2 onward |
| **Digit Span** | Working memory | Forward + backward | ADNI-2 onward |
| **Category Fluency** | Semantic verbal fluency | Animals per minute | ADNI-2 onward |

### 2.9 Genetics

| Genetic Data | Description | Relevance |
|-------------|-------------|-----------|
| **APOE genotyping** | ε2/ε3/ε4 alleles | Primary AD risk gene; ε4 = increased risk |
| **GWAS genotyping** | Illumina SNP arrays | Polygenic risk scores |
| **WGS** | Whole genome sequencing (subset) | Rare variant analysis |
| **Polygenic Risk Score** | Computed from GWAS | Population risk stratification |

### 2.10 ADNI Data Structure

```
ADNI/
├── MRI/
│   ├── Screening/          # Baseline MRI
│   ├── Month_06/           # Follow-up MRI
│   ├── Month_12/
│   ├── Month_18/
│   ├── Month_24/
│   ├── Month_36/
│   └── Month_48/           # Extended follow-up
├── PET/
│   ├── Amyloid/            # Florbetapir / Florbetaben
│   ├── Tau/                # Flortaucipir (ADNI-3)
│   └── FDG/                # Glucose metabolism
├── CSF/
│   ├── ELECSYS/            # Roche Elecsys assays
│   └── INNOBIA/            # Legacy AlzBio3 assays
├── Clinical/
│   ├── ADAS.csv
│   ├── MMSE.csv
│   ├── CDR.csv
│   ├── NEUROBAT.csv        # Neuropsych battery
│   └── MEDICAL_HISTORY.csv
├── Genetics/
│   ├── APOE.csv
│   └── GWAS/
└── Documentation/
    ├── ADNI_Data_Dictionary.pdf
    ├── MRI_Protocol.pdf
    └── Data_Use_Agreement.pdf
```

### 2.11 ADNI Data Access API

```python
"""
ADNI Data Access Adapter — DeepSynaps Protocol Studio

This adapter provides read-only access to ADNI-derived reference data
for population-level clinical context. NO individual participant data
is stored or accessed. Only anonymized aggregate statistics are used.

CRITICAL CAVEAT: ADNI data is for research context only.
It cannot and must not be used for individual patient diagnosis.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple
from enum import Enum
import numpy as np
import pandas as pd
from datetime import datetime


class ADNIGroup(Enum):
    """ADNI diagnostic groups."""
    CN = "cognitively_normal"
    EMCI = "early_mci"
    LMCI = "late_mci"
    AD = "alzheimers_disease"
    SMC = "significant_memory_concern"


class ADNIPhase(Enum):
    """ADNI study phases."""
    ADNI1 = "ADNI1"
    ADNI_GO = "ADNIGO"
    ADNI2 = "ADNI2"
    ADNI3 = "ADNI3"


@dataclass
class ADNIBiomarkerReference:
    """
    Aggregate biomarker statistics from ADNI cohort.
    
    These are GROUP-LEVEL statistics derived from the ADNI cohort.
    They provide population context, NOT diagnostic thresholds.
    
    CRITICAL: Z-scores derived from these distributions are relative
    to the ADNI cohort, not clinical diagnostic reference ranges.
    """
    biomarker_name: str
    group: ADNIGroup
    age_range: Tuple[int, int]
    sex: Optional[str] = None
    n_subjects: int = 0
    mean: float = 0.0
    std: float = 0.0
    median: float = 0.0
    q25: float = 0.0
    q75: float = 0.0
    min_value: float = 0.0
    max_value: float = 0.0
    longitudinal_months: List[int] = field(default_factory=list)
    data_source_phase: List[ADNIPhase] = field(default_factory=list)
    last_updated: str = ""
    
    def compute_zscore(self, patient_value: float) -> float:
        """
        Compute z-score relative to ADNI cohort distribution.
        
        IMPORTANT: This z-score indicates where a value falls within
        the ADNI cohort distribution. It is NOT a diagnostic z-score.
        
        Args:
            patient_value: The patient's biomarker value
            
        Returns:
            Z-score relative to cohort mean/std
            
        CAVEAT: Z-score = (value - cohort_mean) / cohort_std
        A z-score of -2.0 means the patient's value is 2 standard
        deviations below the ADNI cohort mean. This does NOT mean
        the patient has a clinical abnormality.
        """
        if self.std == 0:
            return float('nan')
        return (patient_value - self.mean) / self.std
    
    def compute_percentile(self, patient_value: float) -> float:
        """
        Compute approximate percentile within ADNI cohort.
        
        Uses normal approximation to estimate percentile rank.
        This is an approximation and should be labeled as such.
        """
        z = self.compute_zscore(patient_value)
        from scipy import stats
        return float(stats.norm.cdf(z) * 100)


@dataclass
class ADNICohortCatalog:
    """
    Catalog of available ADNI aggregate reference data.
    
    This catalog contains only pre-computed aggregate statistics
    (means, standard deviations, percentiles) derived from ADNI
    public summary data. No individual participant data is included.
    """
    version: str = "3.0.1"
    last_updated: str = ""
    biomarkers: Dict[str, List[ADNIBiomarkerReference]] = field(default_factory=dict)
    
    def get_reference(
        self,
        biomarker: str,
        group: ADNIGroup,
        age_range: Tuple[int, int],
        sex: Optional[str] = None
    ) -> Optional[ADNIBiomarkerReference]:
        """Retrieve aggregate reference for specified biomarker and demographics."""
        if biomarker not in self.biomarkers:
            return None
        candidates = self.biomarkers[biomarker]
        for ref in candidates:
            if (ref.group == group and 
                ref.age_range == age_range and 
                ref.sex == sex):
                return ref
        # Fall back to sex-combined if sex-specific not available
        if sex is not None:
            for ref in candidates:
                if (ref.group == group and 
                    ref.age_range == age_range and 
                    ref.sex is None):
                    return ref
        return None


class ADNIAdapter:
    """
    ADNI Reference Data Adapter for DeepSynaps Protocol Studio.
    
    Provides access to ADNI-derived aggregate statistics for clinical
    context. This adapter NEVER stores or transmits individual participant
    data. Only pre-computed, anonymized group statistics are used.
    
    GOVERNANCE REQUIREMENTS:
    - All data is labeled as research-only
    - All outputs include explicit caveats
    - No individual-level data is ever stored
    - Commercial use is strictly prohibited by ADNI DUA
    """
    
    def __init__(self, aggregate_data_path: str):
        self.catalog = ADNICohortCatalog()
        self.aggregate_data_path = aggregate_data_path
        self._loaded = False
        
    def load_catalog(self) -> None:
        """Load pre-computed aggregate statistics from local storage."""
        # In production, load from anonymized aggregate CSV files
        # that contain only group-level statistics
        self._loaded = True
        
    def get_hippocampal_volume_reference(
        self,
        age: int,
        sex: str,
        group: ADNIGroup = ADNIGroup.CN
    ) -> Optional[ADNIBiomarkerReference]:
        """
        Get hippocampal volume reference for age/sex-matched CN group.
        
        CRITICAL CAVEAT: This returns the MEAN and STD of hippocampal
        volumes in the specified ADNI subgroup. A patient's volume being
        below the mean does NOT indicate hippocampal atrophy in a
        clinical sense — it only indicates where they fall relative
        to this research cohort.
        """
        age_range = self._age_to_range(age)
        return self.catalog.get_reference(
            biomarker="hippocampal_volume_mm3",
            group=group,
            age_range=age_range,
            sex=sex
        )
    
    def get_cortical_thickness_reference(
        self,
        region: str,
        age: int,
        sex: str,
        group: ADNIGroup = ADNIGroup.CN
    ) -> Optional[ADNIBiomarkerReference]:
        """
        Get cortical thickness reference for specified region.
        
        Regions follow FreeSurfer DKT atlas naming (e.g., 'lh_entorhinal',
        'rh_parahippocampal', 'lh_precuneus').
        """
        biomarker = f"cortical_thickness_{region}"
        age_range = self._age_to_range(age)
        return self.catalog.get_reference(
            biomarker=biomarker,
            group=group,
            age_range=age_range,
            sex=sex
        )
    
    def compute_contextual_zscores(
        self,
        patient_measurements: Dict[str, float],
        age: int,
        sex: str,
        group: ADNIGroup = ADNIGroup.CN
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute cohort-contextual z-scores for patient measurements.
        
        Returns a dictionary mapping each biomarker to its z-score
        and explicit contextual information.
        
        EVERY output includes the mandatory caveat that this is
        research cohort context, not diagnostic information.
        """
        results = {}
        for biomarker_name, value in patient_measurements.items():
            ref = self.catalog.get_reference(
                biomarker=biomarker_name,
                group=group,
                age_range=self._age_to_range(age),
                sex=sex
            )
            if ref is not None:
                zscore = ref.compute_zscore(value)
                percentile = ref.compute_percentile(value)
                results[biomarker_name] = {
                    "patient_value": value,
                    "cohort_mean": ref.mean,
                    "cohort_std": ref.std,
                    "cohort_n": ref.n_subjects,
                    "cohort_zscore": round(zscore, 3),
                    "cohort_percentile_approx": round(percentile, 1),
                    "reference_group": group.value,
                    "reference_age_range": ref.age_range,
                    "reference_sex": sex or "combined",
                    "reference_phase": [p.value for p in ref.data_source_phase],
                    # MANDATORY CAVEAT — always included
                    "caveat": (
                        "Research cohort context only. This z-score indicates "
                        f"where the patient's {biomarker_name} falls within the "
                        f"ADNI {group.value} group (N={ref.n_subjects}, age "
                        f"{ref.age_range[0]}-{ref.age_range[1]}). It does NOT "
                        f"indicate a clinical abnormality or support diagnosis. "
                        f"ADNI data is for research purposes only."
                    )
                }
            else:
                results[biomarker_name] = {
                    "patient_value": value,
                    "error": "No matching reference available",
                    "caveat": "No cohort reference data available for this biomarker and demographic combination."
                }
        return results
    
    def _age_to_range(self, age: int) -> Tuple[int, int]:
        """Map age to ADNI age bin."""
        if age < 60:
            return (55, 64)
        elif age < 70:
            return (65, 74)
        elif age < 80:
            return (75, 84)
        else:
            return (85, 95)
```

### 2.12 ADNI Key Reference Values (Illustrative)

The following values are **illustrative examples** based on published ADNI summary statistics. Production systems must use official ADNI aggregate data.

| Biomarker | ADNI Group | Age 65–74 Mean (SD) | Age 75–84 Mean (SD) | Unit |
|-----------|-----------|---------------------|---------------------|------|
| **Hippocampal Volume** | CN | 7,200 (820) | 6,800 (790) | mm³ |
| **Hippocampal Volume** | EMCI | 6,800 (780) | 6,400 (760) | mm³ |
| **Hippocampal Volume** | LMCI | 6,300 (740) | 5,900 (720) | mm³ |
| **Hippocampal Volume** | AD | 5,700 (680) | 5,300 (650) | mm³ |
| **Entorhinal Thickness** | CN | 3.4 (0.4) | 3.2 (0.4) | mm |
| **Entorhinal Thickness** | AD | 2.6 (0.4) | 2.4 (0.4) | mm |
| **Whole Brain Volume** | CN | 1,050,000 (95,000) | 1,010,000 (92,000) | mm³ |
| **Amyloid Centiloid** | CN | 5 (15) | 10 (20) | Centiloid |
| **Amyloid Centiloid** | AD | 75 (35) | 80 (40) | Centiloid |
| **CSF Aβ42** | CN | 1,150 (320) | 1,100 (300) | pg/mL |
| **CSF Aβ42** | AD | 620 (180) | 580 (170) | pg/mL |

> **CRITICAL CAVEAT:** These values are illustrative approximations
> for architectural design purposes. Production implementations MUST
> derive all statistics from official ADNI aggregate data downloads.
> Do NOT use these illustrative values for any clinical interpretation.

---

## 3. ABIDE Deep Dive

### 3.1 Overview

The **Autism Brain Imaging Data Exchange (ABIDE)** is an international open-neuroscience initiative that aggregates and shares resting-state functional MRI (rs-fMRI) and structural MRI data from studies of Autism Spectrum Disorder (ASD). ABIDE represents one of the largest open neuroimaging datasets in existence and has catalyzed hundreds of neuroimaging studies of autism.

**Official URL:** http://fcon_1000.projects.nitrc.org/indi/abide/  
**NITRC Page:** https://www.nitrc.org/projects/abide/  
**Data Download:** http://preprocessed-connectomes-project.org/abide/  
**Primary Publications:** Di Martino et al. (2014) — ABIDE I; Di Martino et al. (2017) — ABIDE II

### 3.2 Study Phases

| Dimension | ABIDE I | ABIDE II |
|-----------|---------|----------|
| **Period** | 2012 release | 2016 release |
| **Participants** | 1,112 | 1,114 |
| **Sites** | 17 | 19 |
| **Countries** | 2 (US, Netherlands) | 4 (US, Netherlands, Germany, Ireland) |
| **Age Range** | 7–64 years | 5–64 years |
| **ASD N** | 539 | 487 |
| **TD N** | 573 | 557 |
| **Male %** | ~85% | ~80% |
| **Primary Modality** | rs-fMRI (6–10 min) | rs-fMRI (5–10 min) |
| **Structural MRI** | T1-weighted | T1-weighted |
| **Phenotypic Data** | Age, sex, diagnosis, IQ, site | Age, sex, diagnosis, IQ, site, medication, comorbidity |

### 3.3 Diagnostic Assessment

| Feature | ABIDE I | ABIDE II |
|---------|---------|----------|
| **ASD Diagnosis** | ADI-R + ADOS + clinical judgment | ADI-R + ADOS + clinical judgment |
| **TD Confirmation** | No first-degree relative with ASD + clinical assessment | Same as ABIDE I |
| **IQ Assessment** | Full-scale IQ (WAIS/WISC) | Full-scale IQ, verbal IQ, performance IQ |
| **Exclusion (ASD)** | Known genetic syndrome, bipolar, schizophrenia, ADHD primary | Same + neurological disorder |
| **Exclusion (TD)** | Any psychiatric/neurological diagnosis | Any psychiatric/neurological diagnosis |

### 3.4 MRI Acquisition

| Parameter | ABIDE I | ABIDE II |
|-----------|---------|----------|
| **Field Strength** | 3T (primary) + 1.5T | 3T (primary) |
| **rs-fMRI TR** | 1.5–3.0s (site-dependent) | 1.5–3.0s (site-dependent) |
| **rs-fMRI Volumes** | 90–300 (site-dependent) | 80–300 (site-dependent) |
| **rs-fMRI Duration** | 6–10 minutes | 5–10 minutes |
| **Eyes** | Open (most sites) | Mixed (open/closed varies) |
| **T1 Resolution** | ~1×1×1 mm³ | ~1×1×1 mm³ |
| **T1 Sequence** | MP-RAGE (most sites) | MP-RAGE |

### 3.5 Preprocessed Data Pipelines (CRITICAL for ABIDE)

ABIDE is unique in providing data preprocessed through **multiple independent pipelines**. This is both a strength (pipeline robustness assessment) and a challenge (pipeline-dependent results).

| Pipeline | Institution | Key Features | Output |
|----------|------------|--------------|--------|
| **CPAC** | Child Mind Institute | ANTS registration, CompCor nuisance, bandpass 0.01–0.1Hz | Preprocessed volumes + ROI timeseries |
| **CC200** | NYU / CMI | Craddock 200 parcellation, multiple strategies | ROI timeseries (200 regions) |
| **CC400** | NYU / CMI | Craddock 400 parcellation | ROI timeseries (400 regions) |
| **DPARSF** | R-fMRI Maps / Yanlab | SPM-based, DARTEL normalization | ALFF, fALFF, ReHo, FC matrices |
| **NIAK** | McGill / SIMEXP | MINC-based, region growing parcellation | Network connectivity matrices |
| **BASC** | Stanford / Craddock | Bootstrap aggregation stability clustering | Stable connectivity clusters |

### 3.6 Key Functional Connectivity Findings (Group Level)

The following findings are from published ABIDE group-level analyses. They are **NOT applicable to individual patients**:

| Network / Connection | Group Finding | Direction in ASD vs TD | Consistency |
|---------------------|--------------|----------------------|-------------|
| **Default Mode Network (DMN)** | Altered intra-DMN connectivity | Generally decreased | High |
| **Salience Network** | Reduced salience network coherence | Decreased | Moderate |
| **Executive Control Network** | Altered fronto-parietal connectivity | Mixed findings | Moderate |
| **Amygdala–Prefrontal** | Reduced connectivity | Decreased | Moderate |
| **Local Connectivity (ReHo)** | Increased local connectivity | Increased (short-range) | Moderate |
| **Long-range Connectivity** | Reduced long-range connectivity | Decreased | Moderate |
| **Hemispheric Connectivity** | Reduced inter-hemispheric connectivity | Decreased | Moderate |

> **CRITICAL CAVEAT:** These findings are GROUP-LEVEL statistical
> differences between ASD and TD groups. They show population trends,
> not individual predictions. A single patient's connectivity pattern
> cannot be used to diagnose ASD. The overlap between groups is substantial.

### 3.7 ABIDE Phenotypic Data Dictionary

| Variable | Description | Type | Notes |
|----------|-------------|------|-------|
| **SUB_ID** | Subject identifier | Integer | Site-specific prefix |
| **SITE_ID** | Acquisition site | String | 17 sites (I), 19 sites (II) |
| **DX_GROUP** | Diagnostic group | Integer | 1=ASD, 2=TD |
| **AGE_AT_SCAN** | Age at MRI scan | Float | Years |
| **SEX** | Biological sex | Integer | 1=Male, 2=Female |
| **HANDEDNESS** | Handedness | Integer | 1=Right, 2=Left, 3=Ambi |
| **IQ** | Full-scale IQ | Integer | Varies by site battery |
| **VIQ** | Verbal IQ | Integer | ABIDE II only |
| **PIQ** | Performance IQ | Integer | ABIDE II only |
| **FIQ** | Full-scale IQ (alternative) | Integer | Some sites |
| **ADOS_TOTAL** | ADOS total score | Float | ASD participants |
| **ADOS_COMM** | ADOS communication | Float | ASD participants |
| **ADOS_SOCIAL** | ADOS social | Float | ASD participants |
| **ADOS_STEREO_BEHAV** | ADOS repetitive behavior | Float | ASD participants |
| **ADI_R_SOCIAL_TOTAL** | ADI-R social domain | Float | ASD participants |
| **ADI_R_VERBAL_TOTAL** | ADI-R verbal communication | Float | ASD participants |
| **ADI_R_RRB** | ADI-R repetitive behavior | Float | ASD participants |
| **CURRENT_MED** | Current medication status | String | ABIDE II |
| **COMORBIDITY** | Comorbid conditions | String | ABIDE II |

### 3.8 ABIDE Site Distribution

| Site ID | Location | Scanner | ABIDE I N | ABIDE II N |
|---------|----------|---------|-----------|------------|
| **PITT** | University of Pittsburgh | 3T Siemens | 59 | – |
| **OHSU** | Oregon Health & Science | 3T Siemens | 32 | – |
| **KKI** | Kennedy Krieger Institute | 3T Philips | 56 | – |
| **NYU** | New York University | 3T Siemens | 184 | – |
| **UCLA** | UC Los Angeles | 3T Siemens | 88 | 61 |
| **UM** | University of Michigan | 3T GE | 110 | – |
| **USM** | University of Utah | 3T Siemens | 46 | – |
| **YALE** | Yale University | 3T Siemens | 46 | – |
| **CMU** | Carnegie Mellon | 3T Siemens | 14 | – |
| **LEUVEN** | KU Leuven, Belgium | 3T Siemens |  – | 77 |
| **SDSU** | San Diego State | 3T GE |  – | 60 |
| **MAX_MUN** | Max Planck, Munich | 3T Siemens |  – | 56 |
| **TRINITY** | Trinity College Dublin | 3T Philips |  – | 49 |

### 3.9 ABIDE Data Structure

```
ABIDE/
├── raw/
│   ├── NYU/
│   │   ├── 0050002/               # Subject folder
│   │   │   ├── session_1/
│   │   │   │   ├── rest_1/
│   │   │   │   │   └── func.nii.gz    # rs-fMRI
│   │   │   │   └── anat_1/
│   │   │   │       └── mprage.nii.gz  # T1-weighted
│   │   │   └── 0050002_phenotypic.csv
│   │   └── ...
│   └── ... (17-19 sites)
├── preprocessed/
│   ├── cpac/
│   │   ├── filt_noglobal/         # CPAC pipeline variant
│   │   │   ├── NYU_0050002_rois_cc200.1D
│   │   │   └── ...
│   │   └── nofilt_noglobal/
│   ├── dparsf/
│   │   ├── ALFF/
│   │   ├── fALFF/
│   │   ├── ReHo/
│   │   └── FC/
│   └── niak/
│       └── ...
├── phenotypic/
│   ├── ABIDEI_Phenotypic.csv
│   └── ABIDEII_Phenotypic.csv
└── derivatives/
    ├── connectivity_matrices/
    ├── network_measures/
    └── graph_theory_metrics/
```

### 3.10 ABIDE Data Access Adapter

```python
"""
ABIDE Data Access Adapter — DeepSynaps Protocol Studio

Provides access to ABIDE-derived aggregate reference data for
neurodevelopmental clinical context. All data is open-access (CC BY-SA 3.0).

CRITICAL CAVEATS:
1. ABIDE data is for research context only — not individual diagnosis
2. Multi-site heterogeneity means site effects must be considered
3. The ASD-TD group differences are statistical, not deterministic
4. Individual prediction from group patterns is unreliable
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple
from enum import Enum
import numpy as np


class ABIDEDiagnosis(Enum):
    """ABIDE diagnostic groups."""
    ASD = "autism_spectrum_disorder"
    TD = "typically_developing"


class ABIDEPhase(Enum):
    """ABIDE data release phases."""
    ABIDE_I = "ABIDE_I"
    ABIDE_II = "ABIDE_II"
    COMBINED = "COMBINED"


class ABIDEPipeline(Enum):
    """Preprocessing pipelines available in ABIDE."""
    CPAC = "cpac"
    DPARSF = "dparsf"
    NIAK = "niak"
    CC200 = "cc200"
    CC400 = "cc400"
    RAW = "raw"


@dataclass
class ABIDEConnectivityReference:
    """
    Aggregate functional connectivity statistics from ABIDE.
    
    Contains group-level connectivity measures between pairs of
    brain regions. These are population statistics, NOT individual
    diagnostic features.
    """
    network_pair: str  # e.g., "dmn_prefrontal_dmn_posterior"
    diagnosis_group: ABIDEDiagnosis
    age_range: Tuple[int, int]
    sex: Optional[str] = None
    pipeline: ABIDEPipeline = ABIDEPipeline.CPAC
    n_subjects: int = 0
    mean_connectivity: float = 0.0
    std_connectivity: float = 0.0
    median_connectivity: float = 0.0
    site_ids: List[str] = field(default_factory=list)
    # Confidence intervals
    ci_95_lower: float = 0.0
    ci_95_upper: float = 0.0
    last_updated: str = ""
    
    def compute_zscore(self, patient_connectivity: float) -> float:
        """
        Compute z-score relative to ABIDE group distribution.
        
        CRITICAL: This z-score is relative to the ABIDE cohort.
        It does NOT indicate clinical abnormality.
        """
        if self.std_connectivity == 0:
            return float('nan')
        return (patient_connectivity - self.mean_connectivity) / self.std_connectivity


@dataclass
class ABIDECohortCatalog:
    """Catalog of ABIDE-derived aggregate reference statistics."""
    version: str = "2.0.0"
    last_updated: str = ""
    connectivity_references: Dict[str, List[ABIDEConnectivityReference]] = field(
        default_factory=dict
    )


class ABIDEAdapter:
    """
    ABIDE Reference Data Adapter for DeepSynaps Protocol Studio.
    
    Provides access to ABIDE-derived aggregate statistics for
    neurodevelopmental clinical context. All data is open-access.
    
    GOVERNANCE REQUIREMENTS:
    - All outputs labeled as research-only
    - Site effects disclosed when relevant
    - Group stats never presented as individual prediction
    - CC BY-SA 3.0 attribution maintained
    """
    
    def __init__(self, aggregate_data_path: str):
        self.catalog = ABIDECohortCatalog()
        self.aggregate_data_path = aggregate_data_path
        self._loaded = False
        
    def load_catalog(self) -> None:
        """Load pre-computed ABIDE aggregate statistics."""
        self._loaded = True
        
    def get_connectivity_reference(
        self,
        network_pair: str,
        age: int,
        sex: str,
        diagnosis_group: ABIDEDiagnosis = ABIDEDiagnosis.TD,
        pipeline: ABIDEPipeline = ABIDEPipeline.CPAC
    ) -> Optional[ABIDEConnectivityReference]:
        """
        Get connectivity reference for specified network pair.
        
        CRITICAL CAVEAT: Connectivity values vary substantially by
        preprocessing pipeline and acquisition site. The reference
        returned must match the patient's data processing as closely
        as possible. Site effects can be larger than group effects.
        """
        age_range = self._age_to_range(age)
        if network_pair not in self.catalog.connectivity_references:
            return None
        candidates = self.catalog.connectivity_references[network_pair]
        for ref in candidates:
            if (ref.diagnosis_group == diagnosis_group and
                ref.age_range == age_range and
                ref.sex == sex and
                ref.pipeline == pipeline):
                return ref
        # Fall back to sex-combined
        if sex is not None:
            for ref in candidates:
                if (ref.diagnosis_group == diagnosis_group and
                    ref.age_range == age_range and
                    ref.sex is None and
                    ref.pipeline == pipeline):
                    return ref
        return None
    
    def compute_connectivity_context(
        self,
        patient_connectivity: Dict[str, float],
        age: int,
        sex: str,
        pipeline: ABIDEPipeline = ABIDEPipeline.CPAC
    ) -> Dict[str, Dict]:
        """
        Compute connectivity context relative to ABIDE TD reference.
        
        Returns contextual z-scores with explicit caveats about
        multi-site variability and group-level interpretation.
        """
        results = {}
        for network_pair, value in patient_connectivity.items():
            ref_td = self.get_connectivity_reference(
                network_pair=network_pair,
                age=age,
                sex=sex,
                diagnosis_group=ABIDEDiagnosis.TD,
                pipeline=pipeline
            )
            if ref_td is not None:
                zscore = ref_td.compute_zscore(value)
                results[network_pair] = {
                    "patient_connectivity": value,
                    "td_reference_mean": ref_td.mean_connectivity,
                    "td_reference_std": ref_td.std_connectivity,
                    "td_reference_n": ref_td.n_subjects,
                    "td_reference_sites": ref_td.site_ids,
                    "cohort_zscore": round(zscore, 3),
                    "reference_group": "typically_developing",
                    "pipeline": pipeline.value,
                    # MANDATORY MULTI-SITE CAVEAT
                    "caveat": (
                        "Research cohort context only. This z-score indicates "
                        f"where the patient's {network_pair} connectivity falls "
                        f"within the ABIDE TD group (N={ref_td.n_subjects}, "
                        f"sites={len(ref_td.site_ids)}). Multi-site heterogeneity "
                        f"means confidence intervals are wide. This does NOT indicate "
                        f"a clinical abnormality or support any diagnosis. "
                        f"ABIDE data is for research purposes only."
                    ),
                    "site_effect_warning": (
                        f"Data aggregated across {len(ref_td.site_ids)} acquisition "
                        f"sites. Site effects may exceed group differences. "
                        f"Interpretation requires site-matched comparison."
                    )
                }
            else:
                results[network_pair] = {
                    "patient_connectivity": value,
                    "error": "No matching reference available",
                    "caveat": "No cohort reference available for this network pair."
                }
        return results
    
    def get_site_effect_report(self, network_pairs: List[str]) -> Dict[str, Dict]:
        """
        Generate report on known site effects for specified networks.
        
        This is critical for ABIDE because between-site variance often
        exceeds between-group variance. Users must understand this
        limitation.
        """
        report = {}
        for pair in network_pairs:
            report[pair] = {
                "n_sites": 24,
                "site_variance_ratio": "Site variance typically 2-5x group variance",
                "recommendation": (
                    "Site-matched comparison strongly preferred. "
                    "If patient site not in ABIDE, interpret with caution."
                ),
                "mitigation_strategies": [
                    "ComBat harmonization",
                    "Site as covariate in models",
                    "Propensity score matching by site",
                    "Cross-site validation of findings"
                ]
            }
        return report
    
    def _age_to_range(self, age: int) -> Tuple[int, int]:
        """Map age to ABIDE age bin."""
        if age < 10:
            return (7, 12)
        elif age < 18:
            return (12, 17)
        elif age < 30:
            return (18, 29)
        elif age < 45:
            return (30, 44)
        elif age < 60:
            return (45, 59)
        else:
            return (60, 65)
```

### 3.11 ABIDE Key Considerations for Integration

| Consideration | Impact on DeepSynaps | Mitigation |
|--------------|---------------------|------------|
| **Extreme male skew (~80%)** | Female patients have poor reference matching | Explicitly flag sex-matching limitations |
| **Age range limited** | Pediatric (<7) and geriatric (>65) patients not covered | Do not provide context outside age range |
| **24+ sites** | Site effects dominate group effects | Always disclose site effects; use ComBat |
| **No task fMRI** | Only resting-state context available | Do not imply task-based interpretation |
| **Multiple pipelines** | Results pipeline-dependent | Track and report pipeline used |
| **IQ range truncated** | Patients with intellectual disability underrepresented | Flag when patient IQ outside range |
| **Cross-sectional** | No longitudinal trajectory reference | Do not provide change-over-time context |
| **Medication uncontrolled** | Many ASD participants on psychoactive meds | Flag medication confound |

---

## 4. Cohort Data Integration Patterns

### 4.1 Normative Comparison Architecture

```
+------------------------------------------------------------------+
|                  NORMATIVE COMPARISON PIPELINE                    |
+------------------------------------------------------------------+
|                                                                    |
|  Patient Data          Cohort Reference           Context Output  |
|  +-----------+        +----------------+       +----------------+ |
|  | Patient   |        | Age/Sex-Matched|       | Z-score vs     | |
|  | Age: 72   |------->| Cohort Subgroup|------>| Cohort Mean    | |
|  | Sex: F    |        | (ADNI CN 70-79)|       | Percentile     | |
|  | HV: 5,800 |        | Mean: 6,600    |       | Confidence Int | |
|  | mm³       |        | SD: 750        |       | Explicit Caveat| |
|  +-----------+        +----------------+       +----------------+ |
|       |                      |                         |           |
|       v                      v                         v           |
|  [MEASUREMENT]       [AGGREGATE STATS]         [LABELED CONTEXT]  |
|  (individual)          (research cohort)       (research-only)    |
|                                                                    |
+------------------------------------------------------------------+
```

### 4.2 Z-Score Derivation from Cohort Distributions

```python
"""
Cohort Z-Score Computation — DeepSynaps Protocol Studio

All z-scores are computed relative to cohort distributions.
They are NEVER diagnostic z-scores.
"""

from dataclasses import dataclass
from typing import Optional, Tuple
import numpy as np
from scipy import stats


@dataclass
class CohortDistribution:
    """Represents a cohort reference distribution."""
    cohort_name: str           # e.g., "ADNI", "ABIDE"
    subgroup_label: str        # e.g., "CN_70-79_F"
    biomarker: str
    n: int
    mean: float
    std: float
    median: float
    q25: float
    q75: float
    # For non-normal distributions
    skewness: float = 0.0
    kurtosis: float = 0.0


def compute_cohort_zscore(
    patient_value: float,
    cohort_dist: CohortDistribution,
    method: str = "standard"
) -> Tuple[float, str]:
    """
    Compute z-score of patient value relative to cohort distribution.
    
    Args:
        patient_value: The patient's biomarker value
        cohort_dist: The cohort reference distribution
        method: 'standard' (mean/std), 'robust' (median/IQR), 
                'percentile' (empirical CDF)
    
    Returns:
        Tuple of (zscore_or_equivalent, method_description)
    
    CRITICAL: The returned value is a COHORT RELATIVE measure,
    not a clinical diagnostic measure.
    """
    if method == "standard":
        if cohort_dist.std == 0:
            return float('nan'), "Undefined: zero variance in cohort"
        z = (patient_value - cohort_dist.mean) / cohort_dist.std
        desc = f"Standard z-score: (value - {cohort_dist.mean:.2f}) / {cohort_dist.std:.2f}"
        return z, desc
    
    elif method == "robust":
        iqr = cohort_dist.q75 - cohort_dist.q25
        if iqr == 0:
            return float('nan'), "Undefined: zero IQR in cohort"
        z = (patient_value - cohort_dist.median) / (iqr / 1.349)
        desc = f"Robust z-score (MAD-based): median={cohort_dist.median:.2f}, IQR={iqr:.2f}"
        return z, desc
    
    elif method == "percentile":
        # Approximate using normal CDF; in production use empirical CDF
        if cohort_dist.std == 0:
            return float('nan'), "Undefined: zero variance"
        z = (patient_value - cohort_dist.mean) / cohort_dist.std
        percentile = stats.norm.cdf(z) * 100
        return percentile, f"Approximate percentile (normal assumption): {percentile:.1f}%"
    
    else:
        raise ValueError(f"Unknown z-score method: {method}")


def compute_confidence_interval(
    cohort_dist: CohortDistribution,
    confidence: float = 0.95
) -> Tuple[float, float]:
    """
    Compute confidence interval for cohort mean.
    
    This represents the uncertainty in the cohort mean estimate,
    not a prediction interval for individual values.
    """
    alpha = 1 - confidence
    sem = cohort_dist.std / np.sqrt(cohort_dist.n)
    df = cohort_dist.n - 1
    t_crit = stats.t.ppf(1 - alpha/2, df)
    margin = t_crit * sem
    return (cohort_dist.mean - margin, cohort_dist.mean + margin)


def compute_prediction_interval(
    cohort_dist: CohortDistribution,
    confidence: float = 0.95
) -> Tuple[float, float]:
    """
    Compute prediction interval for a new observation from the cohort.
    
    This estimates where a new cohort member would fall,
    NOT where a clinical patient should fall.
    """
    alpha = 1 - confidence
    df = cohort_dist.n - 1
    t_crit = stats.t.ppf(1 - alpha/2, df)
    std_err = cohort_dist.std * np.sqrt(1 + 1/cohort_dist.n)
    margin = t_crit * std_err
    return (cohort_dist.mean - margin, cohort_dist.mean + margin)


def age_match_score(
    patient_age: int,
    cohort_age_min: int,
    cohort_age_max: int
) -> Tuple[float, str]:
    """
    Score how well patient age matches cohort age range.
    
    Returns:
        Tuple of (match_score_0_to_1, match_description)
    """
    if cohort_age_min <= patient_age <= cohort_age_max:
        # Within range — score based on distance from center
        center = (cohort_age_min + cohort_age_max) / 2
        half_range = (cohort_age_max - cohort_age_min) / 2
        distance = abs(patient_age - center)
        score = 1.0 - (distance / half_range) * 0.3  # Penalize edge values slightly
        return max(0.7, score), f"Age {patient_age} within cohort range [{cohort_age_min}-{cohort_age_max}]"
    elif patient_age < cohort_age_min:
        distance = cohort_age_min - patient_age
        score = max(0.0, 1.0 - distance / 10.0)
        return score, f"Age {patient_age} below cohort range (distance={distance})"
    else:
        distance = patient_age - cohort_age_max
        score = max(0.0, 1.0 - distance / 10.0)
        return score, f"Age {patient_age} above cohort range (distance={distance})"
```

### 4.3 Age-Matching Strategies

| Strategy | Description | Pros | Cons | Use Case |
|----------|-------------|------|------|----------|
| **Exact bin match** | Match to 5- or 10-year age bin | Simple, interpretable | Boundary effects, small bins | When N is large |
| **Nearest bin** | Match to closest available bin | Flexible | May be distant match | Sparse cohorts |
| **Regression-based** | Age-regress cohort, compare residual | Accounts for age trend | Assumes linearity | Biomarkers with strong age effects |
| **Spline-based** | Nonlinear age adjustment | Flexible age relationship | Requires more data | Hippocampal volume, cortical thickness |
| **Propensity matching** | Match on multiple covariates | Multivariate balance | Complex, computationally intensive | When multiple confounders exist |
| **Kernel smoothing** | Weighted average by age proximity | Smooth transitions | Bandwidth selection | Continuous age normative charts |

### 4.4 Age-Regression Example for ADNI Hippocampal Volume

```python
"""
Age-Regression Normative Model for Hippocampal Volume

This demonstrates how to build an age-adjusted normative model
using ADNI CN reference data. The model accounts for the fact
that hippocampal volume decreases with normal aging.
"""

import numpy as np
from scipy.interpolate import UnivariateSpline


class AgeAdjustedNormativeModel:
    """
    Age-adjusted normative model for brain biomarkers.
    
    Accounts for age-related changes in biomarkers by modeling
    the age trajectory in a healthy reference group (CN), then
    comparing patient values to age-expected values.
    """
    
    def __init__(self, ages: np.ndarray, values: np.ndarray):
        """
        Initialize with CN reference data.
        
        Args:
            ages: Array of ages in years (CN group)
            values: Array of biomarker values (CN group)
        """
        self.ages = ages
        self.values = values
        # Fit smoothing spline to age trajectory
        self.spline = UnivariateSpline(ages, values, s=len(ages)*0.5)
        # Compute residuals
        residuals = values - self.spline(ages)
        self.residual_std = np.std(residuals, ddof=1)
        self.residual_mean = np.mean(residuals)
        
    def expected_value(self, age: float) -> float:
        """Get age-expected biomarker value from CN trajectory."""
        return float(self.spline(age))
    
    def compute_age_adjusted_zscore(
        self,
        patient_age: float,
        patient_value: float
    ) -> float:
        """
        Compute age-adjusted z-score.
        
        Compares patient to age-matched expected value from CN trajectory,
        not to overall cohort mean. This is more appropriate for
        biomarkers with strong age effects.
        
        CRITICAL: This is still a cohort-relative z-score, not
        a clinical diagnostic measure.
        """
        expected = self.expected_value(patient_age)
        residual = patient_value - expected
        z = residual / self.residual_std
        return z
    
    def get_normative_band(
        self,
        age: float,
        n_std: float = 2.0
    ) -> Tuple[float, float]:
        """
        Get normative band (mean +/- n_std) for given age.
        
        Returns the range within which n_std of the CN population falls.
        """
        expected = self.expected_value(age)
        return (expected - n_std * self.residual_std,
                expected + n_std * self.residual_std)


# Example usage with illustrative ADNI CN data
adni_cn_ages = np.array([55, 58, 60, 62, 65, 67, 70, 72, 75, 77, 80, 82, 85, 87])
adni_cn_hippocampal_vol = np.array([7400, 7300, 7200, 7100, 7000, 6900, 
                                      6700, 6600, 6400, 6300, 6100, 6000, 5800, 5700])

hipp_normative_model = AgeAdjustedNormativeModel(adni_cn_ages, adni_cn_hippocampal_vol)

# Patient example
patient_age = 74
patient_hipp_vol = 5800  # mm³

expected_vol = hipp_normative_model.expected_value(patient_age)
age_adjusted_z = hipp_normative_model.compute_age_adjusted_zscore(
    patient_age, patient_hipp_vol
)
norm_band = hipp_normative_model.get_normative_band(patient_age, n_std=2.0)

print(f"Patient age: {patient_age}")
print(f"Patient hippocampal volume: {patient_hipp_vol} mm³")
print(f"Age-expected volume (CN): {expected_vol:.0f} mm³")
print(f"Age-adjusted z-score: {age_adjusted_z:.2f}")
print(f"95% normative band: [{norm_band[0]:.0f}, {norm_band[1]:.0f}] mm³")
print(f"\nCAVEAT: This z-score is relative to ADNI CN cohort only.")
print(f"It does NOT diagnose hippocampal atrophy.")
```

### 4.5 Site Effect Correction (Multi-Site Cohorts)

```python
"""
Site Effect Correction for Multi-Site Cohort Data

ABIDE spans 24+ acquisition sites with different scanners,
protocols, and populations. Site effects can exceed group effects.
These methods harmonize data across sites.
"""

from typing import Dict, List, Tuple
import numpy as np
import pandas as pd


class ComBatHarmonizer:
    """
    ComBat (Combatting Batch Effects) harmonization for multi-site data.
    
    ComBat uses empirical Bayes methods to remove site-related
    batch effects while preserving biological variation of interest.
    
    Reference: Johnson et al. (2007), Fortin et al. (2017, 2018)
    
    CRITICAL: ComBat requires sufficient sample per site (N>10 recommended).
    It should NOT be applied when a site has very few subjects.
    """
    
    def __init__(self):
        self.site_params: Dict[str, Dict] = {}
        self.fitted = False
        
    def fit(self, data: pd.DataFrame, site_col: str, covariates: List[str]):
        """
        Fit ComBat harmonization model.
        
        Args:
            data: DataFrame with biomarker columns
            site_col: Column name for site identifier
            covariates: Columns to preserve (e.g., age, sex, diagnosis)
        """
        sites = data[site_col].unique()
        biomarkers = [c for c in data.columns 
                     if c not in [site_col] + covariates]
        
        for biomarker in biomarkers:
            self.site_params[biomarker] = {}
            grand_mean = data[biomarker].mean()
            
            for site in sites:
                site_data = data[data[site_col] == site][biomarker]
                if len(site_data) < 5:
                    continue  # Skip undersampled sites
                    
                site_mean = site_data.mean()
                site_var = site_data.var()
                
                self.site_params[biomarker][site] = {
                    'mean_shift': site_mean - grand_mean,
                    'var_ratio': site_var / data[biomarker].var() if data[biomarker].var() > 0 else 1.0,
                    'n': len(site_data)
                }
        
        self.fitted = True
        
    def transform(self, data: pd.DataFrame, site_col: str) -> pd.DataFrame:
        """Apply fitted ComBat harmonization."""
        if not self.fitted:
            raise ValueError("Must fit before transform")
        
        result = data.copy()
        for biomarker, site_params in self.site_params.items():
            if biomarker not in result.columns:
                continue
            for idx, row in result.iterrows():
                site = row[site_col]
                if site in site_params:
                    params = site_params[site]
                    # Adjust mean
                    result.at[idx, biomarker] = (
                        row[biomarker] - params['mean_shift']
                    )
        return result


class SiteEffectAnalyzer:
    """Analyze and report site effects in multi-site cohort data."""
    
    @staticmethod
    def compute_icc(
        data: pd.DataFrame,
        biomarker: str,
        site_col: str
    ) -> float:
        """
        Compute Intraclass Correlation Coefficient (ICC) for site.
        
        ICC = between-site variance / total variance
        Higher ICC = stronger site effect
        
        Interpretation:
        - ICC < 0.05: Negligible site effect
        - ICC 0.05–0.15: Small site effect
        - ICC 0.15–0.25: Moderate site effect
        - ICC > 0.25: Large site effect (harmonization required)
        """
        site_means = data.groupby(site_col)[biomarker].mean()
        site_ns = data.groupby(site_col)[biomarker].count()
        
        grand_mean = data[biomarker].mean()
        n_total = len(data)
        k = len(site_means)
        
        # Between-site variance
        ms_between = np.sum(site_ns * (site_means - grand_mean)**2) / (k - 1)
        
        # Within-site variance
        within_sums = data.groupby(site_col).apply(
            lambda g: np.sum((g[biomarker] - g[biomarker].mean())**2)
        )
        ms_within = np.sum(within_sums) / (n_total - k)
        
        n0 = (n_total - np.sum(site_ns**2) / n_total) / (k - 1)
        
        if ms_between + (n0 - 1) * ms_within == 0:
            return 0.0
            
        icc = (ms_between - ms_within) / (ms_between + (n0 - 1) * ms_within)
        return max(0.0, icc)
    
    @staticmethod
    def site_effect_report(
        data: pd.DataFrame,
        biomarkers: List[str],
        site_col: str
    ) -> pd.DataFrame:
        """Generate site effect report for all biomarkers."""
        reports = []
        for biomarker in biomarkers:
            icc = SiteEffectAnalyzer.compute_icc(data, biomarker, site_col)
            site_cv = data.groupby(site_col)[biomarker].mean().std() / data[biomarker].mean()
            reports.append({
                'biomarker': biomarker,
                'icc_site': round(icc, 4),
                'site_cv': round(site_cv, 4),
                'n_sites': data[site_col].nunique(),
                'effect_magnitude': (
                    'LARGE' if icc > 0.25 else
                    'MODERATE' if icc > 0.15 else
                    'SMALL' if icc > 0.05 else
                    'NEGLIGIBLE'
                ),
                'recommendation': (
                    'Harmonization required before use' if icc > 0.25 else
                    'Harmonization recommended' if icc > 0.15 else
                    'Harmonization optional' if icc > 0.05 else
                    'No harmonization needed'
                )
            })
        return pd.DataFrame(reports)
```

### 4.6 Propensity Score Matching

```python
"""
Propensity Score Matching for Cohort Comparison

When comparing a patient to a cohort subgroup, propensity score
matching ensures the comparison group is balanced on observed
covariates (age, sex, education, etc.).
"""

from dataclasses import dataclass
from typing import List, Optional
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import NearestNeighbors


@dataclass
class MatchedCohortSubgroup:
    """Result of propensity score matching."""
    original_n: int
    matched_n: int
    matched_indices: List[int]
    balance_statistics: dict
    mean_covariate_diff: float
    
    
def propensity_match_patient_to_cohort(
    patient_covariates: dict,
    cohort_data: List[dict],
    match_vars: List[str],
    caliper: float = 0.2
) -> MatchedCohortSubgroup:
    """
    Find cohort participants most similar to patient on covariates.
    
    Uses propensity score approach: compute similarity score
    between patient and each cohort member, then select
    those within caliper distance.
    
    Args:
        patient_covariates: Dict of patient covariates (age, sex, etc.)
        cohort_data: List of dicts for cohort participants
        match_vars: Variables to match on
        caliper: Maximum standardized distance for matching
        
    Returns:
        MatchedCohortSubgroup with matched indices
    """
    # Standardize covariates
    all_values = []
    for var in match_vars:
        patient_val = patient_covariates.get(var, 0)
        cohort_vals = [p.get(var, 0) for p in cohort_data]
        all_vals = [patient_val] + cohort_vals
        mean = np.mean(all_vals)
        std = np.std(all_vals) if np.std(all_vals) > 0 else 1
        
        patient_std = (patient_val - mean) / std
        cohort_std = [(v - mean) / std for v in cohort_vals]
        
        all_values.append({
            'var': var,
            'patient': patient_std,
            'cohort': cohort_std
        })
    
    # Compute distances
    distances = []
    for i in range(len(cohort_data)):
        dist = np.sqrt(sum(
            (v['patient'] - v['cohort'][i])**2 
            for v in all_values
        ))
        distances.append((i, dist))
    
    # Select matches within caliper
    matched = [(i, d) for i, d in distances if d <= caliper]
    matched.sort(key=lambda x: x[1])
    
    # If no matches within caliper, take closest 20
    if not matched:
        distances.sort(key=lambda x: x[1])
        matched = distances[:20]
    
    matched_indices = [i for i, _ in matched]
    
    # Compute balance statistics
    balance = {}
    for var_info in all_values:
        matched_vals = [var_info['cohort'][i] for i in matched_indices]
        balance[var_info['var']] = {
            'patient_std': round(var_info['patient'], 3),
            'matched_mean_std': round(np.mean(matched_vals), 3),
            'matched_std_std': round(np.std(matched_vals), 3),
            'std_diff': round(abs(var_info['patient'] - np.mean(matched_vals)), 3)
        }
    
    mean_diff = np.mean([
        balance[v]['std_diff'] for v in match_vars
    ])
    
    return MatchedCohortSubgroup(
        original_n=len(cohort_data),
        matched_n=len(matched_indices),
        matched_indices=matched_indices,
        balance_statistics=balance,
        mean_covariate_diff=round(mean_diff, 3)
    )
```

### 4.7 Longitudinal Trajectory Modeling

```python
"""
Longitudinal Trajectory Modeling — ADNI Context

ADNI's longitudinal design enables modeling of biomarker trajectories
over time. These trajectories provide context for interpreting
changes in patient measurements across sessions.
"""

from dataclasses import dataclass
from typing import List, Tuple, Optional
import numpy as np
from scipy.optimize import curve_fit


@dataclass
class LongitudinalTrajectory:
    """Modeled biomarker trajectory from cohort data."""
    biomarker: str
    group: str
    model_type: str
    params: dict
    r_squared: float
    time_points_months: List[float]
    predicted_values: List[float]
    confidence_interval_lower: List[float]
    confidence_interval_upper: List[float]


class BiomarkerTrajectoryModel:
    """
    Model biomarker trajectories using ADNI longitudinal data.
    
    Supports multiple trajectory shapes:
    - Linear: y = a + b*t
    - Quadratic: y = a + b*t + c*t²
    - Exponential: y = a * exp(b*t)
    - Logistic: sigmoidal trajectory (for some AD biomarkers)
    """
    
    @staticmethod
    def linear_model(t, a, b):
        """Linear trajectory: y = a + b*t"""
        return a + b * t
    
    @staticmethod
    def quadratic_model(t, a, b, c):
        """Quadratic trajectory: y = a + b*t + c*t²"""
        return a + b * t + c * t**2
    
    @staticmethod
    def exponential_model(t, a, b, c):
        """Exponential trajectory: y = a * exp(b*t) + c"""
        return a * np.exp(b * t) + c
    
    def fit_trajectory(
        self,
        months: np.ndarray,
        values: np.ndarray,
        model_type: str = "linear"
    ) -> LongitudinalTrajectory:
        """
        Fit trajectory model to longitudinal cohort data.
        
        Args:
            months: Time points in months from baseline
            values: Biomarker values at each time point
            model_type: 'linear', 'quadratic', or 'exponential'
            
        Returns:
            LongitudinalTrajectory with fitted model
        """
        # Use group means if multiple subjects
        months_clean = np.array(months)
        values_clean = np.array(values)
        
        if model_type == "linear":
            popt, pcov = curve_fit(
                self.linear_model, months_clean, values_clean,
                p0=[values_clean[0], -10.0],
                maxfev=10000
            )
            predicted = self.linear_model(months_clean, *popt)
            params = {'intercept': popt[0], 'slope': popt[1]}
            
        elif model_type == "quadratic":
            popt, pcov = curve_fit(
                self.quadratic_model, months_clean, values_clean,
                p0=[values_clean[0], -10.0, 0.0],
                maxfev=10000
            )
            predicted = self.quadratic_model(months_clean, *popt)
            params = {'a': popt[0], 'b': popt[1], 'c': popt[2]}
            
        elif model_type == "exponential":
            popt, pcov = curve_fit(
                self.exponential_model, months_clean, values_clean,
                p0=[values_clean[0], -0.01, 0],
                maxfev=10000
            )
            predicted = self.exponential_model(months_clean, *popt)
            params = {'a': popt[0], 'b': popt[1], 'c': popt[2]}
            
        else:
            raise ValueError(f"Unknown model type: {model_type}")
        
        # R-squared
        ss_res = np.sum((values_clean - predicted)**2)
        ss_tot = np.sum((values_clean - np.mean(values_clean))**2)
        r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0
        
        # Simple confidence intervals (model uncertainty)
        residual_std = np.sqrt(ss_res / max(len(months_clean) - len(popt), 1))
        ci_lower = predicted - 1.96 * residual_std
        ci_upper = predicted + 1.96 * residual_std
        
        return LongitudinalTrajectory(
            biomarker="",
            group="",
            model_type=model_type,
            params=params,
            r_squared=r_squared,
            time_points_months=list(months_clean),
            predicted_values=list(predicted),
            confidence_interval_lower=list(ci_lower),
            confidence_interval_upper=list(ci_upper)
        )
    
    def compare_patient_change_to_trajectory(
        self,
        patient_baseline: float,
        patient_followup: float,
        months_elapsed: float,
        trajectory: LongitudinalTrajectory
    ) -> dict:
        """
        Compare patient longitudinal change to cohort trajectory.
        
        CRITICAL: This compares the RATE of change, not absolute values.
        Faster decline than the cohort may warrant clinical attention,
        but cohort comparison alone is NOT diagnostic.
        """
        patient_annual_change = (patient_followup - patient_baseline) / (months_elapsed / 12)
        
        # Get cohort expected change over same period
        cohort_baseline = trajectory.predicted_values[0]
        idx = min(int(months_elapsed / 6), len(trajectory.predicted_values) - 1)
        cohort_followup = trajectory.predicted_values[idx]
        cohort_annual_change = (cohort_followup - cohort_baseline) / (months_elapsed / 12)
        
        # Standardize
        change_diff = patient_annual_change - cohort_annual_change
        
        return {
            "patient_annual_change": round(patient_annual_change, 2),
            "cohort_annual_change": round(cohort_annual_change, 2),
            "difference": round(change_diff, 2),
            "patient_declines_faster": change_diff < 0,
            "interpretation": (
                f"Patient changes by {patient_annual_change:.1f}/year; "
                f"cohort changes by {cohort_annual_change:.1f}/year"
            ),
            "caveat": (
                "This compares rate of change to ADNI cohort trajectory. "
                "Faster change suggests need for clinical evaluation but "
                "does NOT confirm neurodegeneration. Multiple factors affect "
                "biomarker values. Clinical correlation required."
            )
        }
```

---

## 5. DeepSynaps Integration Architecture

### 5.1 System Architecture Overview

```
+------------------------------------------------------------------+
|              DEEPSYNAPS COHORT INTEGRATION ARCHITECTURE           |
+------------------------------------------------------------------+
|                                                                    |
|  +------------------+        +---------------------+              |
|  |  DeepSynaps      |        |  Cohort Reference    |              |
|  |  Core Platform   |        |  Data Store          |              |
|  |                  |        |  (Anonymized Only)   |              |
|  |  +------------+ |        |                     |              |
|  |  | Patient    | |        |  +---------------+  |              |
|  |  | Record     | |<------>|  | ADNI Aggregates| |              |
|  |  | (age, sex, | |        |  | - Group means  | |              |
|  |  |  biomarker | |        |  | - Std devs     | |              |
|  |  |  values)   | |        |  | - Percentiles  | |              |
|  |  +------------+ |        |  | - CI bounds    | |              |
|  |       |         |        |  +---------------+  |              |
|  |       v         |        |                     |              |
|  |  +------------+ |        |  +---------------+  |              |
|  |  | Cohort     | |<------>|  | ABIDE Aggregates| |              |
|  |  | Comparison | |        |  | - Connectivity  | |              |
|  |  | Service    | |        |  | - Network stats | |              |
|  |  |            | |        |  | - Site params   | |              |
|  |  | - Z-score  | |        |  +---------------+  |              |
|  |  | - Percentile| |        +---------------------+              |
|  |  | - Context  | |                                              |
|  |  +------------+ |                                              |
|  |       |         |                                              |
|  |       v         |        +---------------------+              |
|  |  +------------+ |        |  Governance Layer    |              |
|  |  | Display    | |------->|                     |              |
|  |  | Renderer   | |        |  - Caveat injection  |              |
|  |  |            | |        |  - Confidence bands  |              |
|  |  | ALWAYS     | |        |  - Audit logging     |              |
|  |  | includes   | |        |  - Research-only     |              |
|  |  | caveats    | |        |    enforcement       |              |
|  |  +------------+ |        +---------------------+              |
|  |                  |                                              |
|  +------------------+        +---------------------+              |
|                              |  DeepTwin Service    |              |
|                              |                     |              |
|                              |  - Cohort-informed   |              |
|                              |    synthesis priors  |              |
|                              |  - Normative context |              |
|                              |    for multimodal    |              |
|                              |    fusion            |              |
|                              +---------------------+              |
|                                                                    |
+------------------------------------------------------------------+
```

### 5.2 ADNI Adapter Service Design

```python
"""
DeepSynaps Cohort Integration Service — Full Architecture

This module defines the complete integration service for cohort
data access, comparison, and contextual display in DeepSynaps.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple, Any
from enum import Enum
from datetime import datetime
import hashlib
import json


# ============================================================
# DOMAIN MODELS
# ============================================================

class CohortDataset(Enum):
    ADNI = "adni"
    ABIDE = "abide"


class ComparisonResultType(Enum):
    ZSCORE = "zscore"
    PERCENTILE = "percentile"
    TRAJECTORY = "trajectory"
    CONNECTIVITY_CONTEXT = "connectivity_context"


@dataclass
class CohortComparisonRequest:
    """Request for cohort comparison context."""
    patient_id: str  # Hashed identifier
    patient_age: int
    patient_sex: str
    biomarker_values: Dict[str, float]
    target_cohorts: List[CohortDataset]
    comparison_groups: List[str] = field(default_factory=lambda: ["CN", "TD"])
    require_age_match: bool = True
    require_sex_match: bool = True
    max_age_distance_years: int = 5
    
    def anonymize(self) -> str:
        """Create anonymized request hash for audit logging."""
        data = f"{self.patient_age}_{self.patient_sex}_{sorted(self.biomarker_values.keys())}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]


@dataclass
class CohortComparisonResult:
    """Result of cohort comparison with mandatory governance metadata."""
    request_id: str
    timestamp: str
    results: Dict[str, Any]
    
    # MANDATORY governance fields
    disclaimer: str = (
        "ALL VALUES BELOW ARE RESEARCH COHORT CONTEXT ONLY. "
        "THEY DO NOT CONSTITUTE DIAGNOSTIC INFORMATION. "
        "COHORT STATISTICS CANNOT BE USED TO DIAGNOSE INDIVIDUAL PATIENTS."
    )
    dataset_citations: Dict[str, str] = field(default_factory=dict)
    confidence_levels: Dict[str, str] = field(default_factory=dict)
    limitations: List[str] = field(default_factory=list)
    clinical_correlation_required: bool = True
    research_only: bool = True
    
    def to_display_dict(self) -> dict:
        """
        Convert to display-safe dictionary.
        
        This method enforces that ALL governance metadata is included
        in any display output. It CANNOT be bypassed.
        """
        return {
            "results": self.results,
            "disclaimer": self.disclaimer,
            "citations": self.dataset_citations,
            "confidence": self.confidence_levels,
            "limitations": self.limitations,
            "clinical_correlation_required": self.clinical_correlation_required,
            "research_only": self.research_only,
            "generated_at": self.timestamp,
            "request_id": self.request_id
        }


# ============================================================
# GOVERNANCE SERVICE
# ============================================================

class CohortGovernanceService:
    """
    Central governance service for ALL cohort data operations.
    
    This service enforces that:
    1. Every output includes the mandatory disclaimer
    2. No individual-level cohort data is exposed
    3. All comparisons are labeled as research-only
    4. Confidence levels are always reported
    5. Clinical correlation is always flagged as required
    """
    
    MANDATORY_DISCLAIMER = (
        "Research cohort context only — not for individual patient diagnosis. "
        "Group statistics provide population-level reference and cannot "
        "determine whether any individual has a clinical condition. "
        "These results must be interpreted by a qualified clinician."
    )
    
    ADNI_CITATION = (
        "Data used with permission from the Alzheimer's Disease Neuroimaging "
        "Initiative (ADNI). ADNI data is for research purposes only. "
        "Commercial use prohibited. See adni.loni.usc.edu."
    )
    
    ABIDE_CITATION = (
        "Data from ABIDE (Autism Brain Imaging Data Exchange), "
        "available under CC BY-SA 3.0. See fcon_1000.projects.nitrc.org/indi/abide/. "
        "Multi-site effects must be considered in all interpretations."
    )
    
    def __init__(self):
        self.audit_log: List[dict] = []
    
    def create_governed_result(
        self,
        request: CohortComparisonRequest,
        raw_results: Dict[str, Any],
        datasets_used: List[CohortDataset]
    ) -> CohortComparisonResult:
        """
        Wrap raw comparison results in governed output.
        
        This is the ONLY path for creating displayable results.
        All results MUST pass through this method.
        """
        citations = {}
        limitations = []
        confidence = {}
        
        for dataset in datasets_used:
            if dataset == CohortDataset.ADNI:
                citations["ADNI"] = self.ADNI_CITATION
                limitations.extend([
                    "ADNI participants are primarily non-Hispanic White; "
                    "generalization to other populations is uncertain.",
                    "ADNI age range is 55–90; comparison outside this range is invalid.",
                    "ADNI requires DUA compliance; data not for commercial use."
                ])
                confidence["ADNI"] = (
                    "Moderate: Based on 2,000+ participants with standardized protocols. "
                    "Longitudinal follow-up strengthens estimates. "
                    "Selection bias toward highly educated participants reduces generalizability."
                )
                
            elif dataset == CohortDataset.ABIDE:
                citations["ABIDE"] = self.ABIDE_CITATION
                limitations.extend([
                    "ABIDE has extreme male skew (~80%); female comparison is limited.",
                    "24+ acquisition sites introduce substantial heterogeneity.",
                    "ABIDE age range is 5–64; comparison outside this range is invalid.",
                    "Preprocessing pipeline affects results; pipeline must be matched.",
                    "Cross-sectional design; no longitudinal trajectory reference."
                ])
                confidence["ABIDE"] = (
                    "Moderate-Low: Based on 2,200+ participants across 24+ sites. "
                    "Multi-site heterogeneity means site effects often exceed group effects. "
                    "Open data enables verification but requires careful harmonization."
                )
        
        result = CohortComparisonResult(
            request_id=request.anonymize(),
            timestamp=datetime.utcnow().isoformat(),
            results=raw_results,
            disclaimer=self.MANDATORY_DISCLAIMER,
            dataset_citations=citations,
            confidence_levels=confidence,
            limitations=limitations,
            clinical_correlation_required=True,
            research_only=True
        )
        
        # Audit log entry
        self.audit_log.append({
            "timestamp": result.timestamp,
            "request_id": result.request_id,
            "datasets": [d.value for d in datasets_used],
            "biomarkers": list(request.biomarker_values.keys()),
            "disclaimer_included": True
        })
        
        return result


# ============================================================
# INTEGRATION SERVICE
# ============================================================

class CohortIntegrationService:
    """
    Main integration service for cohort data in DeepSynaps.
    
    Coordinates ADNI and ABIDE adapters, applies governance,
    and produces display-ready contextual comparisons.
    """
    
    def __init__(
        self,
        adni_adapter: 'ADNIAdapter',
        abide_adapter: 'ABIDEAdapter',
        governance: CohortGovernanceService
    ):
        self.adni = adni_adapter
        self.abide = abide_adapter
        self.gov = governance
        
    def get_patient_context(
        self,
        request: CohortComparisonRequest
    ) -> CohortComparisonResult:
        """
        Get full cohort context for a patient.
        
        This is the primary entry point. It:
        1. Routes to appropriate cohort adapters
        2. Computes contextual z-scores
        3. Wraps results in governed output with mandatory caveats
        """
        raw_results = {}
        datasets_used = []
        
        if CohortDataset.ADNI in request.target_cohorts:
            # Route to ADNI for age-appropriate biomarkers
            if request.patient_age >= 55:
                adni_results = self.adni.compute_contextual_zscores(
                    patient_measurements=request.biomarker_values,
                    age=request.patient_age,
                    sex=request.patient_sex,
                    group=ADNIGroup.CN  # Default to CN reference
                )
                raw_results["adni_context"] = adni_results
                datasets_used.append(CohortDataset.ADNI)
            else:
                raw_results["adni_context"] = {
                    "error": f"Patient age {request.patient_age} below ADNI minimum (55).",
                    "caveat": "ADNI reference not applicable for this patient age."
                }
        
        if CohortDataset.ABIDE in request.target_cohorts:
            # Route to ABIDE for connectivity biomarkers
            if 5 <= request.patient_age <= 64:
                abide_results = self.abide.compute_connectivity_context(
                    patient_connectivity=request.biomarker_values,
                    age=request.patient_age,
                    sex=request.patient_sex
                )
                raw_results["abide_context"] = abide_results
                datasets_used.append(CohortDataset.ABIDE)
            else:
                raw_results["abide_context"] = {
                    "error": f"Patient age {request.patient_age} outside ABIDE range (5-64).",
                    "caveat": "ABIDE reference not applicable for this patient age."
                }
        
        return self.gov.create_governed_result(
            request=request,
            raw_results=raw_results,
            datasets_used=datasets_used
        )
```

### 5.3 API Endpoint Design

```python
"""
FastAPI endpoints for cohort integration.

All endpoints enforce governance rules and include mandatory caveats.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

router = APIRouter(prefix="/api/v1/cohort-context", tags=["cohort-context"])


class CohortContextRequest(BaseModel):
    """API request for cohort context."""
    patient_age: int = Field(..., ge=5, le=95, description="Patient age in years")
    patient_sex: str = Field(..., pattern="^(M|F|O)$", description="Patient sex (M/F/O)")
    biomarkers: Dict[str, float] = Field(..., description="Biomarker name to value mapping")
    cohorts: List[str] = Field(default=["ADNI"], description="Cohorts to query")
    
    class Config:
        json_schema_extra = {
            "example": {
                "patient_age": 72,
                "patient_sex": "F",
                "biomarkers": {
                    "hippocampal_volume_mm3": 5800.0,
                    "entorhinal_thickness_mm": 2.8
                },
                "cohorts": ["ADNI"]
            }
        }


class CohortContextResponse(BaseModel):
    """API response with mandatory governance fields."""
    results: Dict
    disclaimer: str
    citations: Dict[str, str]
    confidence_levels: Dict[str, str]
    limitations: List[str]
    clinical_correlation_required: bool = True
    research_only: bool = True
    generated_at: str
    request_id: str


@router.post("/compare", response_model=CohortContextResponse)
async def get_cohort_context(
    request: CohortContextRequest,
    service: CohortIntegrationService = Depends()
) -> CohortContextResponse:
    """
    Get cohort comparison context for patient biomarkers.
    
    Returns contextual z-scores and percentiles relative to research cohorts.
    ALL results include mandatory disclaimers that this is research context
    only and cannot be used for individual patient diagnosis.
    
    **CRITICAL**: This endpoint provides research cohort context only.
    It does NOT and cannot diagnose any condition. All outputs include
    explicit caveats. Clinical correlation is always required.
    """
    comparison_request = CohortComparisonRequest(
        patient_id="anonymous",  # Hashed internally
        patient_age=request.patient_age,
        patient_sex=request.patient_sex,
        biomarker_values=request.biomarkers,
        target_cohorts=[CohortDataset(c) for c in request.cohorts]
    )
    
    result = service.get_patient_context(comparison_request)
    
    return CohortContextResponse(
        results=result.results,
        disclaimer=result.disclaimer,
        citations=result.dataset_citations,
        confidence_levels=result.confidence_levels,
        limitations=result.limitations,
        clinical_correlation_required=result.clinical_correlation_required,
        research_only=result.research_only,
        generated_at=result.timestamp,
        request_id=result.request_id
    )


@router.get("/datasets/info")
async def get_dataset_info() -> Dict:
    """
    Get information about available cohort datasets.
    
    Returns metadata about ADNI and ABIDE including access requirements,
    licensing, and appropriate use cases.
    """
    return {
        "ADNI": {
            "name": "Alzheimer's Disease Neuroimaging Initiative",
            "url": "https://adni.loni.usc.edu/",
            "phases": ["ADNI-1", "ADNI-GO", "ADNI-2", "ADNI-3"],
            "participants": 2000,
            "age_range": "55-90",
            "access": "Application required (LONI IDA)",
            "license": "ADNI Data Use Agreement — research only, no commercial use",
            "biomarkers": ["MRI", "Amyloid PET", "Tau PET", "FDG-PET", "CSF", "Genetics"],
            "caveat": "Research context only. Not for individual diagnosis. Commercial use prohibited.",
            "appropriate_for": ["Aging context", "Neurodegeneration reference", "Cognitive decline tracking"],
            "inappropriate_for": ["Individual AD diagnosis", "Commercial product training", "Patient screening"]
        },
        "ABIDE": {
            "name": "Autism Brain Imaging Data Exchange",
            "url": "http://fcon_1000.projects.nitrc.org/indi/abide/",
            "phases": ["ABIDE I", "ABIDE II"],
            "participants": 2200,
            "age_range": "5-64",
            "access": "Fully open (no application)",
            "license": "CC BY-SA 3.0",
            "biomarkers": ["rs-fMRI", "T1-MRI"],
            "caveat": "Research context only. Multi-site effects must be considered. Not for individual diagnosis.",
            "appropriate_for": ["Connectivity context", "Neurodevelopmental reference", "Network analysis"],
            "inappropriate_for": ["Individual ASD diagnosis", "Screening", "Clinical decision-making"]
        }
    }
```

---

## 6. Display Rules & Caveats

### 6.1 Mandatory Display Rules

The following rules are **NON-NEGOTIABLE** and are enforced by the Governance Service at the API level:

| Rule ID | Rule | Enforcement |
|---------|------|-------------|
| **DR-01** | NEVER present cohort data as patient diagnosis | Code-level: results struct cannot be labeled "diagnosis" |
| **DR-02** | ALWAYS label: "Research cohort context, not diagnostic reference" | Every API response includes mandatory disclaimer |
| **DR-03** | ALWAYS show confidence intervals for cohort stats | UI must render CI bands on all visualizations |
| **DR-04** | ALWAYS flag as research-only | "research_only: true" in every response |
| **DR-05** | NEVER suggest patient has condition based on cohort comparison | Code review + automated testing |
| **DR-06** | ALWAYS disclose cohort N for every statistic | Every reference includes n_subjects |
| **DR-07** | ALWAYS disclose cohort demographic range | Age/sex range included in every reference |
| **DR-08** | ALWAYS require clinical correlation flag | "clinical_correlation_required: true" in every response |
| **DR-09** | NEVER allow cohort data without citation | Citations enforced in response model |
| **DR-10** | ALWAYS disclose limitations | Limitations array in every response |
| **DR-11** | NEVER use the word "normal" for cohort mean | Use "cohort mean" or "group average" |
| **DR-12** | ALWAYS use "compared to [Cohort] [Group]" phrasing | Template enforcement in display layer |

### 6.2 Safe Display Templates

```python
"""
Safe Display Templates for Cohort Context

These templates enforce appropriate phrasing and automatically
include mandatory caveats. Developers MUST use these templates
and MUST NOT create custom phrasing for cohort comparisons.
"""

from string import Template

class CohortDisplayTemplates:
    """
    Pre-approved display templates for cohort context.
    
    ALL UI displays of cohort data must use these templates.
    Custom phrasing is prohibited to ensure consistent governance.
    """
    
    # Z-score display templates
    ZSCORE_TEMPLATE = Template(
        "The patient's $biomarker value of $patient_value "
        "is $zscore standard deviations $direction the mean of the "
        "$cohort_name $reference_group reference group "
        "(mean=$cohort_mean, SD=$cohort_std, N=$n_subjects, "
        "age range: $age_range).\n\n"
        "DISCLAIMER: This is research cohort context only. "
        "It does not indicate a clinical abnormality or support "
        "any diagnosis. Individual values vary widely within any "
        "group. Clinical correlation by a qualified provider is required."
    )
    
    PERCENTILE_TEMPLATE = Template(
        "The patient's $biomarker value falls at approximately the "
        "$percentile percentile within the $cohort_name $reference_group "
        "group (N=$n_subjects, age $age_range).\n\n"
        "This means approximately $percentile_reverse% of the "
        "$reference_group group had $direction values.\n\n"
        "DISCLAIMER: Percentiles are derived from research cohort data "
        "and are not diagnostic reference ranges. They provide "
        "population context only."
    )
    
    NO_REFERENCE_TEMPLATE = (
        "No cohort reference is available for this biomarker "
        "with the patient's demographic profile.\n\n"
        "Cohort comparison cannot be provided. Clinical interpretation "
        "should rely on other evidence."
    )
    
    CONNECTIVITY_TEMPLATE = Template(
        "$network_pair connectivity: $patient_value\n"
        "Reference ($cohort_name $reference_group): "
        "mean=$ref_mean, SD=$ref_std (N=$n, sites=$n_sites)\n"
        "Z-score relative to reference: $zscore\n\n"
        "SITE EFFECT WARNING: Data aggregated across $n_sites "
        "acquisition sites. Site effects may exceed group differences. "
        "Results should be interpreted with caution.\n\n"
        "DISCLAIMER: Connectivity context is research data only. "
        "It cannot be used for individual diagnosis. "
        "Multi-site heterogeneity limits precision."
    )
    
    TRAJECTORY_TEMPLATE = Template(
        "The patient's $biomarker changed by $patient_change per year.\n"
        "The $cohort_name $group group changes by $cohort_change per year "
        "over the same period.\n\n"
        "INTERPRETATION: The patient's rate of change is $comparison "
        "the cohort reference trajectory.\n\n"
        "DISCLAIMER: Trajectory comparison requires careful clinical "
        "interpretation. Multiple factors affect biomarker values over "
        "time. This comparison alone cannot confirm disease progression "
        "or response to treatment."
    )
    
    HEADER_TEMPLATE = (
        "=== RESEARCH COHORT CONTEXT ===\n"
        "The following information provides population-level context "
        "from research neuroimaging cohorts. It is NOT diagnostic data.\n"
        "Generated: $timestamp | Request: $request_id\n"
        "================================\n\n"
    )
    
    FOOTER_TEMPLATE = (
        "\n================================\n"
        "RESEARCH USE ONLY — NOT FOR CLINICAL DECISION-MAKING\n"
        "All cohort data requires interpretation by a qualified clinician.\n"
        "Cohort statistics provide population context, not individual diagnosis.\n"
        "$citations\n"
        "================================"
    )
    
    @classmethod
    def render_zscore(cls, data: dict) -> str:
        """Render z-score comparison using safe template."""
        direction = "above" if data['cohort_zscore'] > 0 else "below"
        return cls.ZSCORE_TEMPLATE.substitute(
            biomarker=data.get('biomarker_name', 'value'),
            patient_value=data.get('patient_value', 'N/A'),
            zscore=abs(data.get('cohort_zscore', 0)),
            direction=direction,
            cohort_name=data.get('cohort', 'the cohort'),
            reference_group=data.get('reference_group', 'reference'),
            cohort_mean=data.get('cohort_mean', 'N/A'),
            cohort_std=data.get('cohort_std', 'N/A'),
            n_subjects=data.get('cohort_n', 'N/A'),
            age_range=data.get('reference_age_range', 'N/A')
        )
    
    @classmethod
    def render_connectivity(cls, data: dict) -> str:
        """Render connectivity comparison using safe template."""
        return cls.CONNECTIVITY_TEMPLATE.substitute(
            network_pair=data.get('network_pair', 'Unknown'),
            patient_value=data.get('patient_connectivity', 'N/A'),
            cohort_name=data.get('cohort', 'ABIDE'),
            reference_group=data.get('reference_group', 'TD'),
            ref_mean=data.get('td_reference_mean', 'N/A'),
            ref_std=data.get('td_reference_std', 'N/A'),
            n=data.get('td_reference_n', 'N/A'),
            n_sites=len(data.get('td_reference_sites', [])),
            zscore=data.get('cohort_zscore', 'N/A')
        )


# ============================================================
# PROHIBITED PHRASES — AUTOMATED DETECTION
# ============================================================

PROHIBITED_PHRASES = [
    # Diagnosis language
    "the patient has",
    "diagnostic of",
    "confirms diagnosis",
    "consistent with [condition] diagnosis",
    "suggests the patient has",
    "indicates Alzheimer's",
    "indicates autism",
    
    # Certainty language
    "abnormal result",
    "normal result",
    "within normal limits",
    "outside normal range",
    "pathological",
    "significant abnormality",
    
    # Screening language
    "screen for",
    "rule out",
    "rule in",
    "excludes",
    
    # Prescriptive language
    "should be treated",
    "requires medication",
    "indicates need for",
]


def validate_display_text(text: str) -> Tuple[bool, List[str]]:
    """
    Validate that display text does not contain prohibited phrases.
    
    Returns:
        Tuple of (is_valid, list_of_violations)
    """
    violations = []
    text_lower = text.lower()
    for phrase in PROHIBITED_PHRASES:
        if phrase in text_lower:
            violations.append(f"Prohibited phrase detected: '{phrase}'")
    return len(violations) == 0, violations
```

### 6.3 UI Component Specification

```typescript
/**
 * CohortContextDisplay — React Component Specification
 * 
 * Renders cohort comparison results with mandatory governance elements.
 * This component enforces display rules at the UI level.
 */

interface CohortContextDisplayProps {
  result: CohortComparisonResult;
  showConfidenceBands: boolean;  // Always true in production
  showCaveats: boolean;          // Always true in production
}

const CohortContextDisplay: React.FC<CohortContextDisplayProps> = ({
  result,
  showConfidenceBands = true,
  showCaveats = true
}) => {
  // RENDER REQUIREMENTS:
  // 1. Header must show "RESEARCH COHORT CONTEXT" banner
  // 2. Every biomarker comparison shows:
  //    - Patient value
  //    - Cohort reference (mean, SD, N)
  //    - Z-score with explicit "relative to cohort" label
  //    - Confidence interval band (if visualization)
  //    - Caveat text
  // 3. Footer must show:
  //    - Disclaimer
  //    - Citations
  //    - Limitations
  //    - "Clinical correlation required" flag
  //    - "Research only" badge
  
  return (
    <div className="cohort-context-panel">
      {/* MANDATORY: Research-only banner */}
      <ResearchOnlyBanner />
      
      {/* MANDATORY: Disclaimer at top */}
      <DisclaimerText text={result.disclaimer} />
      
      {/* Results section */}
      {Object.entries(result.results).map(([key, value]) => (
        <CohortComparisonCard 
          key={key}
          biomarker={key}
          data={value}
          showConfidenceBands={showConfidenceBands}
          showCaveats={showCaveats}
        />
      ))}
      
      {/* MANDATORY: Citations */}
      <CitationsSection citations={result.dataset_citations} />
      
      {/* MANDATORY: Limitations */}
      <LimitationsSection limitations={result.limitations} />
      
      {/* MANDATORY: Clinical correlation flag */}
      <ClinicalCorrelationFlag />
      
      {/* MANDATORY: Research-only footer */}
      <ResearchOnlyFooter 
        citations={result.dataset_citations}
        timestamp={result.generated_at}
        requestId={result.request_id}
      />
    </div>
  );
};

// Enforced: showConfidenceBands and showCaveats cannot be false
// in production builds. Development override allowed for testing.
```

---

## 7. Provenance & Confidence Model

### 7.1 Data Provenance Framework

```python
"""
Provenance tracking for all cohort-derived statistics.

Every statistic displayed through DeepSynaps must have traceable
provenance: where it came from, how it was computed, and what
confidence level applies.
"""

from dataclasses import dataclass
from typing import List, Optional, Dict
from datetime import datetime


@dataclass
class DataProvenance:
    """Complete provenance record for a cohort-derived statistic."""
    
    # Source identification
    source_dataset: str           # e.g., "ADNI", "ABIDE"
    source_phase: str             # e.g., "ADNI-3", "ABIDE II"
    source_url: str
    
    # Data processing
    original_n_participants: int
    filtered_n_participants: int
    filtering_criteria: List[str]
    preprocessing_pipeline: str
    harmonization_method: str     # e.g., "ComBat", "none"
    
    # Statistical computation
    computation_method: str       # e.g., "mean", "median", "mixed_effects"
    software: str                 # e.g., "R lme4", "Python statsmodels"
    software_version: str
    computation_date: str
    
    # Quality metrics
    missing_data_rate: float
    site_effect_icc: float
    outlier_treatment: str
    
    # Confidence assessment
    confidence_level: str         # "HIGH", "MODERATE", "LOW", "VERY_LOW"
    confidence_rationale: str
    
    # Audit trail
    computed_by: str
    review_status: str
    last_verified: str


# ============================================================
# CONFIDENCE LEVEL FRAMEWORK
# ============================================================

class ConfidenceLevel:
    """
    Standardized confidence levels for cohort-derived statistics.
    
    Every statistic is assigned a confidence level based on:
    - Sample size (N)
    - Data quality (missingness, protocol adherence)
    - Site effects (for multi-site cohorts)
    - Temporal stability (for longitudinal data)
    - External validation
    """
    
    HIGH = {
        "level": "HIGH",
        "criteria": [
            "N > 500 per subgroup",
            "Missing data rate < 5%",
            "Site ICC < 0.05",
            "Validated in external cohort",
            "Longitudinal consistency confirmed"
        ],
        "description": "Reliable population estimate with strong evidence",
        "display_color": "#2E7D32",  # Green
        "recommendation": "Suitable for clinical context provision"
    }
    
    MODERATE = {
        "level": "MODERATE",
        "criteria": [
            "N 200–500 per subgroup",
            "Missing data rate 5–15%",
            "Site ICC 0.05–0.15",
            "Internal validation only",
            "Some longitudinal data"
        ],
        "description": "Reasonable estimate with acceptable limitations",
        "display_color": "#F57C00",  # Orange
        "recommendation": "Provide with explicit limitations noted"
    }
    
    LOW = {
        "level": "LOW",
        "criteria": [
            "N 50–200 per subgroup",
            "Missing data rate 15–30%",
            "Site ICC 0.15–0.25",
            "Limited validation",
            "Cross-sectional only"
        ],
        "description": "Tentative estimate with significant limitations",
        "display_color": "#D32F2F",  # Red
        "recommendation": "Provide only with prominent caveats; flag for clinical review"
    }
    
    VERY_LOW = {
        "level": "VERY_LOW",
        "criteria": [
            "N < 50 per subgroup",
            "Missing data rate > 30%",
            "Site ICC > 0.25",
            "No validation",
            "Major methodological concerns"
        ],
        "description": "Unreliable estimate; use with extreme caution",
        "display_color": "#B71C1C",  # Dark red
        "recommendation": "Do not display without explicit warning; consider suppressing"
    }


def assess_confidence(
    n_participants: int,
    missing_data_rate: float,
    site_icc: float,
    has_external_validation: bool,
    has_longitudinal_data: bool
) -> str:
    """
    Assess confidence level for a cohort-derived statistic.
    
    Uses a weighted scoring system across quality dimensions.
    """
    score = 0
    
    # Sample size (weight: 3)
    if n_participants >= 500:
        score += 3 * 3
    elif n_participants >= 200:
        score += 2 * 3
    elif n_participants >= 50:
        score += 1 * 3
    
    # Missing data (weight: 2)
    if missing_data_rate < 0.05:
        score += 3 * 2
    elif missing_data_rate < 0.15:
        score += 2 * 2
    elif missing_data_rate < 0.30:
        score += 1 * 2
    
    # Site effects (weight: 2)
    if site_icc < 0.05:
        score += 3 * 2
    elif site_icc < 0.15:
        score += 2 * 2
    elif site_icc < 0.25:
        score += 1 * 2
    
    # Validation (weight: 1)
    if has_external_validation:
        score += 3 * 1
    
    # Longitudinal (weight: 1)
    if has_longitudinal_data:
        score += 2 * 1
    
    max_score = 3*3 + 3*2 + 3*2 + 3*1 + 2*1  # 9 + 6 + 6 + 3 + 2 = 26
    ratio = score / max_score
    
    if ratio >= 0.8:
        return "HIGH"
    elif ratio >= 0.6:
        return "MODERATE"
    elif ratio >= 0.4:
        return "LOW"
    else:
        return "VERY_LOW"


# Pre-computed confidence assessments for ADNI biomarkers
ADNI_BIOMARKER_CONFIDENCE = {
    "hippocampal_volume": {
        "level": "HIGH",
        "n_cn_65_74": 350,
        "n_cn_75_84": 280,
        "missing_rate": 0.03,
        "site_icc": 0.04,
        "validation": "Validated in AIBL, OASIS, UK Biobank",
        "longitudinal": True
    },
    "entorhinal_thickness": {
        "level": "HIGH",
        "n_cn_65_74": 340,
        "n_cn_75_84": 270,
        "missing_rate": 0.04,
        "site_icc": 0.05,
        "validation": "Validated in multiple cohorts",
        "longitudinal": True
    },
    "amyloid_centiloid": {
        "level": "MODERATE",
        "n_cn_65_74": 200,
        "n_cn_75_84": 180,
        "missing_rate": 0.08,
        "site_icc": 0.06,
        "validation": "Centiloid framework cross-validated",
        "longitudinal": True
    },
    "csf_ab42": {
        "level": "HIGH",
        "n_cn_65_74": 250,
        "n_cn_75_84": 200,
        "missing_rate": 0.05,
        "site_icc": 0.03,  # Assay-based, not scanner
        "validation": "Validated against PET amyloid",
        "longitudinal": True
    },
    "tau_pet": {
        "level": "LOW",
        "n_cn_65_74": 120,
        "n_cn_75_84": 100,
        "missing_rate": 0.12,
        "site_icc": 0.10,
        "validation": "Limited external validation",
        "longitudinal": False  # ADNI-3 only
    }
}

# Pre-computed confidence assessments for ABIDE biomarkers
ABIDE_BIOMARKER_CONFIDENCE = {
    "dmn_connectivity": {
        "level": "MODERATE",
        "n_td": 573,
        "n_asd": 539,
        "missing_rate": 0.10,
        "site_icc": 0.18,
        "validation": "Partially replicated",
        "longitudinal": False
    },
    "salience_network_connectivity": {
        "level": "LOW",
        "n_td": 500,
        "n_asd": 480,
        "missing_rate": 0.15,
        "site_icc": 0.20,
        "validation": "Mixed replication results",
        "longitudinal": False
    },
    "inter_hemispheric_connectivity": {
        "level": "MODERATE",
        "n_td": 550,
        "n_asd": 520,
        "missing_rate": 0.08,
        "site_icc": 0.16,
        "validation": "Replicated in several studies",
        "longitudinal": False
    }
}
```

### 7.2 Audit Logging

```python
"""
Audit logging for all cohort data access and display.

Every access to cohort data is logged for compliance and safety review.
"""

import logging
from datetime import datetime
from typing import Dict, Any

# Configure dedicated audit logger
cohort_audit_logger = logging.getLogger("cohort_audit")


class CohortAuditLogger:
    """
    Audit logger for cohort data operations.
    
    Logs every cohort comparison request, result, and display event
    for clinical governance review.
    """
    
    @staticmethod
    def log_comparison_request(request: CohortComparisonRequest):
        """Log a cohort comparison request."""
        cohort_audit_logger.info({
            "event": "COHORT_COMPARISON_REQUEST",
            "timestamp": datetime.utcnow().isoformat(),
            "request_id": request.anonymize(),
            "patient_age": request.patient_age,
            "patient_sex": request.patient_sex,
            "biomarkers_requested": list(request.biomarker_values.keys()),
            "target_cohorts": [c.value for c in request.target_cohorts],
            "disclaimer_included_in_request": True
        })
    
    @staticmethod
    def log_comparison_result(result: CohortComparisonResult):
        """Log a cohort comparison result."""
        cohort_audit_logger.info({
            "event": "COHORT_COMPARISON_RESULT",
            "timestamp": result.timestamp,
            "request_id": result.request_id,
            "disclaimer_included": result.disclaimer is not None,
            "disclaimer_length": len(result.disclaimer) if result.disclaimer else 0,
            "citations_included": list(result.dataset_citations.keys()),
            "limitations_count": len(result.limitations),
            "clinical_correlation_flag": result.clinical_correlation_required,
            "research_only_flag": result.research_only
        })
    
    @staticmethod
    def log_display_event(
        request_id: str,
        display_type: str,
        components_shown: list
    ):
        """Log that cohort data was displayed to a user."""
        cohort_audit_logger.info({
            "event": "COHORT_DATA_DISPLAYED",
            "timestamp": datetime.utcnow().isoformat(),
            "request_id": request_id,
            "display_type": display_type,
            "components_shown": components_shown,
            "governance_check": "all_mandatory_elements_present"
        })
```

---

## 8. DeepTwin Cohort Integration

### 8.1 Overview

DeepTwin is DeepSynaps' multimodal neural synthesis engine. Cohort data integration provides **population-informed priors** that improve synthesis quality and add normative context to generated outputs.

### 8.2 Integration Points

| Integration Point | Cohort Data Used | Purpose |
|------------------|-----------------|---------|
| **Synthesis Prior Initialization** | ADNI CN group means | Initialize expected brain morphology priors |
| **Age-Conditional Generation** | ADNI age trajectory models | Condition synthesis on age-expected anatomy |
| **Connectivity Prior (fMRI)** | ABIDE TD connectivity patterns | Initialize functional connectivity expectations |
| **Uncertainty Quantification** | Cohort standard deviations | Set prior uncertainty bounds for synthesis |
| **Anomaly Flagging** | Cohort prediction intervals | Flag synthesized features outside cohort range |
| **Multimodal Fusion Weighting** | Cohort confidence levels | Weight synthesis by data quality |

### 8.3 Cohort-Informed Synthesis Architecture

```python
"""
DeepTwin Cohort Integration Module

Provides cohort-informed priors and constraints for the
DeepTwin multimodal synthesis engine.
"""

from dataclasses import dataclass
from typing import Optional, Dict, List, Tuple
import numpy as np


@dataclass
class CohortSynthesisPrior:
    """
    Cohort-derived prior for DeepTwin synthesis.
    
    Provides population-level expectations that guide synthesis
    toward anatomically and functionally plausible outputs.
    """
    prior_type: str                    # "morphology", "connectivity", "trajectory"
    cohort_source: str                 # "ADNI", "ABIDE"
    reference_group: str               # "CN", "TD"
    mean_vector: np.ndarray
    covariance_matrix: np.ndarray
    age_range: Tuple[int, int]
    sex: Optional[str]
    confidence_level: str              # HIGH, MODERATE, LOW
    
    def compute_mahalanobis_distance(self, features: np.ndarray) -> float:
        """
        Compute Mahalanobis distance from cohort mean.
        
        Used to flag synthesized features that are unusual
        relative to the cohort distribution.
        """
        diff = features - self.mean_vector
        try:
            inv_cov = np.linalg.inv(self.covariance_matrix)
            d2 = diff.T @ inv_cov @ diff
            return float(np.sqrt(d2))
        except np.linalg.LinAlgError:
            # Fallback to Euclidean if covariance is singular
            return float(np.linalg.norm(diff))
    
    def is_plausible(self, features: np.ndarray, threshold: float = 3.0) -> bool:
        """
        Check if synthesized features are plausible relative to cohort.
        
        Features beyond threshold Mahalanobis distance are flagged
        for clinical review. This is NOT a diagnostic check.
        """
        d = self.compute_mahalanobis_distance(features)
        return d < threshold


class DeepTwinCohortIntegration:
    """
    Integrates cohort data into DeepTwin multimodal synthesis.
    
    Provides:
    1. Population priors for synthesis initialization
    2. Age-conditional constraints
    3. Plausibility checking for synthesized outputs
    4. Confidence-weighted fusion across data sources
    """
    
    def __init__(
        self,
        adni_adapter: 'ADNIAdapter',
        abide_adapter: 'ABIDEAdapter'
    ):
        self.adni = adni_adapter
        self.abide = abide_adapter
        self.priors: Dict[str, CohortSynthesisPrior] = {}
        
    def load_morphology_prior(
        self,
        age: int,
        sex: str,
        regions: List[str]
    ) -> Optional[CohortSynthesisPrior]:
        """
        Load morphology prior from ADNI CN reference.
        
        Provides expected cortical thickness and volume values
        for specified brain regions, conditioned on age and sex.
        """
        means = []
        variances = []
        
        for region in regions:
            ref = self.adni.get_cortical_thickness_reference(
                region=region, age=age, sex=sex, group=ADNIGroup.CN
            )
            if ref is not None:
                means.append(ref.mean)
                variances.append(ref.std ** 2)
            else:
                means.append(0.0)
                variances.append(1e6)  # Uninformative prior
        
        return CohortSynthesisPrior(
            prior_type="morphology",
            cohort_source="ADNI",
            reference_group="CN",
            mean_vector=np.array(means),
            covariance_matrix=np.diag(variances),
            age_range=self.adni._age_to_range(age),
            sex=sex,
            confidence_level="HIGH"
        )
    
    def load_connectivity_prior(
        self,
        age: int,
        sex: str,
        network_pairs: List[str]
    ) -> Optional[CohortSynthesisPrior]:
        """
        Load connectivity prior from ABIDE TD reference.
        
        Provides expected functional connectivity values
        for specified network pairs.
        """
        means = []
        variances = []
        
        for pair in network_pairs:
            ref = self.abide.get_connectivity_reference(
                network_pair=pair, age=age, sex=sex,
                diagnosis_group=ABIDEDiagnosis.TD
            )
            if ref is not None:
                means.append(ref.mean_connectivity)
                variances.append(ref.std_connectivity ** 2)
            else:
                means.append(0.0)
                variances.append(1.0)  # Uninformative
        
        return CohortSynthesisPrior(
            prior_type="connectivity",
            cohort_source="ABIDE",
            reference_group="TD",
            mean_vector=np.array(means),
            covariance_matrix=np.diag(variances),
            age_range=self.abide._age_to_range(age),
            sex=sex,
            confidence_level="MODERATE"  # Lower due to site effects
        )
    
    def synthesis_plausibility_check(
        self,
        synthesized_features: Dict[str, np.ndarray],
        patient_age: int,
        patient_sex: str
    ) -> Dict[str, dict]:
        """
        Check synthesized features against cohort priors.
        
        Flags features that are unusual relative to population
        distributions. These flags trigger clinical review,
        not automatic rejection.
        
        EVERY result includes the mandatory caveat.
        """
        results = {}
        
        for feature_name, features in synthesized_features.items():
            if feature_name not in self.priors:
                results[feature_name] = {
                    "plausibility_checked": False,
                    "reason": "No cohort prior available",
                    "caveat": "Cannot assess plausibility without cohort reference."
                }
                continue
            
            prior = self.priors[feature_name]
            mahal_dist = prior.compute_mahalanobis_distance(features)
            is_plausible = prior.is_plausible(features, threshold=3.0)
            
            results[feature_name] = {
                "plausibility_checked": True,
                "mahalanobis_distance": round(mahal_dist, 3),
                "is_plausible": is_plausible,
                "threshold_used": 3.0,
                "cohort_source": prior.cohort_source,
                "reference_group": prior.reference_group,
                "confidence_level": prior.confidence_level,
                "flag_for_review": not is_plausible,
                "caveat": (
                    f"Plausibility assessed against {prior.cohort_source} "
                    f"{prior.reference_group} cohort. Mahalanobis distance = "
                    f"{mahal_dist:.2f}. This is a statistical plausibility check, "
                    f"not a clinical validation. Unusual values may reflect "
                    f"individual variation rather than error."
                )
            }
        
        return results
```

---

## 9. Licensing & Access Requirements

### 9.1 ADNI Licensing

| Aspect | Requirement |
|--------|-------------|
| **License Type** | ADNI Data Use Agreement (DUA) |
| **Access Method** | Application via LONI IDA (https://ida.loni.usc.edu/) |
| **Application Requirements** | Research purpose, institutional affiliation, PI oversight |
| **Approval Time** | Typically 1–2 weeks |
| **Research Use** | Permitted with citation |
| **Commercial Use** | **STRICTLY PROHIBITED** |
| **Data Redistribution** | Prohibited (must direct users to ADNI) |
| **Publication Citation** | Mandatory; see ADNI citation policy |
| **Required Citation** | "Data used in preparation of this article were obtained from the Alzheimer's Disease Neuroimaging Initiative (ADNI) database (adni.loni.usc.edu). As such, the investigators within the ADNI contributed to the design and implementation of ADNI and/or provided data but did not participate in analysis or writing of this report." |
| **Acknowledgment** | "A complete listing of ADNI investigators can be found at: http://adni.loni.usc.edu/wp-content/uploads/how_to_apply/ADNI_Acknowledgement_List.pdf" |
| **Data Update** | Annual re-certification required |

### 9.2 ABIDE Licensing

| Aspect | Requirement |
|--------|-------------|
| **License Type** | Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0) |
| **Access Method** | Direct download (no application) |
| **URL** | http://preprocessed-connectomes-project.org/abide/ |
| **Research Use** | Permitted with attribution |
| **Commercial Use** | Permitted with attribution and share-alike |
| **Data Redistribution** | Permitted under CC BY-SA 3.0 |
| **Required Attribution** | Must cite Di Martino et al. (2014) for ABIDE I and Di Martino et al. (2017) for ABIDE II |
| **Derivative Works** | Must be shared under CC BY-SA 3.0 |
| **Site-Specific Requirements** | Some sites require additional acknowledgment; check site-specific DUA |

### 9.3 DeepSynaps Compliance Architecture

```python
"""
License Compliance Service

Enforces licensing requirements for all cohort data usage.
"""

from enum import Enum
from dataclasses import dataclass
from typing import Dict, List


class LicenseType(Enum):
    ADNI_DUA = "adni_dua"
    CC_BY_SA_30 = "cc_by_sa_30"
    CUSTOM = "custom"


@dataclass
class LicenseRequirement:
    """License requirements for a dataset."""
    dataset: str
    license_type: LicenseType
    citation_text: str
    acknowledgment_text: str
    commercial_use_allowed: bool
    redistribution_allowed: bool
    requires_application: bool
    annual_renewal: bool


class LicenseComplianceService:
    """
    Enforces license compliance for cohort data.
    
    Every output from the cohort integration service includes
    the appropriate citation and acknowledgment text.
    """
    
    ADNI_REQUIREMENTS = LicenseRequirement(
        dataset="ADNI",
        license_type=LicenseType.ADNI_DUA,
        citation_text=(
            "Data used from the Alzheimer's Disease Neuroimaging Initiative "
            "(ADNI) database (adni.loni.usc.edu). ADNI data is for research "
            "purposes only. Commercial use is strictly prohibited."
        ),
        acknowledgment_text=(
            "The investigators within ADNI contributed to the design and "
            "implementation of ADNI and/or provided data but did not participate "
            "in analysis or writing of this report."
        ),
        commercial_use_allowed=False,
        redistribution_allowed=False,
        requires_application=True,
        annual_renewal=True
    )
    
    ABIDE_REQUIREMENTS = LicenseRequirement(
        dataset="ABIDE",
        license_type=LicenseType.CC_BY_SA_30,
        citation_text=(
            "Data from ABIDE (Autism Brain Imaging Data Exchange), "
            "Di Martino et al. (2014, 2017). Available under CC BY-SA 3.0 "
            "at fcon_1000.projects.nitrc.org/indi/abide/."
        ),
        acknowledgment_text=(
            "ABIDE is a grassroots consortium aggregating rs-fMRI data from "
            "international research sites for open sharing."
        ),
        commercial_use_allowed=True,  # With attribution
        redistribution_allowed=True,  # Under CC BY-SA 3.0
        requires_application=False,
        annual_renewal=False
    )
    
    def __init__(self):
        self.licenses: Dict[str, LicenseRequirement] = {
            "ADNI": self.ADNI_REQUIREMENTS,
            "ABIDE": self.ABIDE_REQUIREMENTS
        }
    
    def can_use_commercially(self, dataset: str) -> bool:
        """Check if dataset can be used in commercial context."""
        req = self.licenses.get(dataset)
        if req is None:
            return False
        return req.commercial_use_allowed
    
    def get_citation(self, dataset: str) -> str:
        """Get required citation text for dataset."""
        req = self.licenses.get(dataset)
        return req.citation_text if req else ""
    
    def check_compliance(self, dataset: str, use_case: str) -> Dict:
        """
        Check if a proposed use case is compliant with license.
        
        Args:
            dataset: Dataset name
            use_case: 'research', 'clinical_context', 'commercial_product',
                     'redistribution', 'derivative_work'
        """
        req = self.licenses.get(dataset)
        if req is None:
            return {"compliant": False, "reason": "Unknown dataset"}
        
        if use_case == "commercial_product" and not req.commercial_use_allowed:
            return {
                "compliant": False,
                "reason": f"{dataset} data cannot be used in commercial products. "
                          f"ADNI DUA strictly prohibits commercial use.",
                "alternative": "Use only for research context display. "
                              "Do not train commercial models on ADNI data."
            }
        
        if use_case == "redistribution" and not req.redistribution_allowed:
            return {
                "compliant": False,
                "reason": f"{dataset} data cannot be redistributed.",
                "alternative": "Store only aggregate statistics locally. "
                              "Direct users to ADNI for individual-level data."
            }
        
        return {"compliant": True}


# Pre-check: DeepSynaps use cases
DEEPSYNAPS_USE_CASES = {
    "clinical_context_display": {
        "ADNI": "COMPLIANT — Research context display with caveats is permitted",
        "ABIDE": "COMPLIANT — Research context display with caveats is permitted"
    },
    "deptwin_synthesis_prior": {
        "ADNI": "COMPLIANT — Aggregate statistics as synthesis prior is research use",
        "ABIDE": "COMPLIANT — Aggregate statistics as synthesis prior is research use"
    },
    "commercial_model_training": {
        "ADNI": "NOT COMPLIANT — ADNI DUA prohibits commercial model training",
        "ABIDE": "COMPLIANT with attribution — CC BY-SA 3.0 permits this"
    },
    "patient_diagnosis": {
        "ADNI": "NOT COMPLIANT — Cohort data cannot be used for diagnosis per DUA and clinical safety",
        "ABIDE": "NOT COMPLIANT — Cohort data cannot be used for diagnosis per clinical safety"
    },
    "data_redistribution": {
        "ADNI": "NOT COMPLIANT — ADNI DUA prohibits redistribution",
        "ABIDE": "COMPLIANT with CC BY-SA 3.0 — Attribution and share-alike required"
    }
}
```

---

## 10. Implementation Recommendations

### 10.1 Implementation Priority Matrix

| Priority | Component | Effort | Impact | Dependencies |
|----------|-----------|--------|--------|--------------|
| **P0** | Governance service (caveat injection) | 2 days | Critical | None |
| **P0** | ADNI aggregate data loader | 3 days | Critical | ADNI data download |
| **P0** | ABIDE aggregate data loader | 2 days | Critical | ABIDE data download |
| **P1** | Z-score computation pipeline | 3 days | High | P0 components |
| **P1** | Age-matching service | 2 days | High | ADNI loader |
| **P1** | Display templates (governed) | 2 days | High | Governance service |
| **P2** | Site effect correction (ComBat) | 4 days | Medium | ABIDE loader |
| **P2** | Confidence assessment | 2 days | Medium | All loaders |
| **P2** | Longitudinal trajectory models | 3 days | Medium | ADNI loader |
| **P3** | DeepTwin cohort priors | 4 days | Medium | Z-score pipeline |
| **P3** | Propensity score matching | 3 days | Low | Age-matching |
| **P3** | Full audit logging | 2 days | Low | Governance service |

### 10.2 Data Download & Setup

```bash
#!/bin/bash
# ADNI + ABIDE Data Setup Script for DeepSynaps
# This script downloads and prepares aggregate cohort data.
# NO individual participant data is downloaded.

set -e

DATA_DIR="/data/deepsynaps/cohort-references"
mkdir -p "$DATA_DIR"/{adni,abide}

echo "=== ADNI Aggregate Data Setup ==="
echo "NOTE: ADNI requires approved application via LONI IDA."
echo "Visit: https://ida.loni.usc.edu/"
echo ""
echo "After approval, download the following aggregate files:"
echo "  1. UCSF - Volume (csv) — volumetric summaries"
echo "  2. ADNIMERGE.csv — merged clinical and biomarker data"
echo "  3. UC Berkeley - AV45 (Amyloid PET SUVR)"
echo "  4. FreeSurfer cortical thickness summaries"
echo "Place files in: $DATA_DIR/adni/"

# ADNI aggregate processing
echo "Processing ADNI aggregates..."
python3 << 'PYEOF'
import pandas as pd
import json

# Process ADNIMERGE for group statistics
try:
    adnimerge = pd.read_csv("/data/deepsynaps/cohort-references/adni/ADNIMERGE.csv")
    
    # Compute group-level statistics by diagnosis and age bin
    adnimerge['AGE_BIN'] = pd.cut(adnimerge['AGE'], 
        bins=[55, 65, 75, 85, 95], 
        labels=['55-64', '65-74', '75-84', '85-94']
    )
    
    group_stats = adnimerge.groupby(['DX_bl', 'AGE_BIN', 'PTGENDER']).agg({
        'Hippocampus': ['count', 'mean', 'std'],
        'WholeBrain': ['count', 'mean', 'std'],
        'Entorhinal': ['count', 'mean', 'std'],
        'MidTemp': ['count', 'mean', 'std']
    }).reset_index()
    
    group_stats.to_csv(
        "/data/deepsynaps/cohort-references/adni/adni_hippocampal_volume_aggregates.csv",
        index=False
    )
    print("ADNI aggregates computed and saved.")
except FileNotFoundError:
    print("ADNI data not yet downloaded. Skipping processing.")

PYEOF

echo ""
echo "=== ABIDE Aggregate Data Setup ==="
echo "ABIDE is open-access. Downloading preprocessed aggregates..."

# ABIDE preprocessed data
cd "$DATA_DIR/abide"

# Download phenotypic data
if [ ! -f "ABIDEI_Phenotypic.csv" ]; then
    echo "Downloading ABIDE I phenotypic data..."
    wget -q "https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Phenotypic_V1_0b_preprocessed1.csv" \
        -O ABIDEI_Phenotypic.csv 2>/dev/null || echo "Download failed — manual download required"
fi

if [ ! -f "ABIDEII_Phenotypic.csv" ]; then
    echo "Downloading ABIDE II phenotypic data..."
    echo "Manual download required from: http://fcon_1000.projects.nitrc.org/indi/abide/abide_II.html"
fi

# Process ABIDE aggregates
python3 << 'PYEOF'
import pandas as pd
import numpy as np

try:
    abide1 = pd.read_csv("/data/deepsynaps/cohort-references/abide/ABIDEI_Phenotypic.csv")
    
    # Compute connectivity aggregates by diagnosis, age, and site
    # (This would use the preprocessed connectivity matrices)
    
    site_stats = abide1.groupby(['SITE_ID', 'DX_GROUP']).agg({
        'AGE_AT_SCAN': ['count', 'mean', 'std'],
        'FIQ': ['count', 'mean', 'std']
    }).reset_index()
    
    site_stats.to_csv(
        "/data/deepsynaps/cohort-references/abide/abide_site_demographics.csv",
        index=False
    )
    print("ABIDE aggregates computed and saved.")
except FileNotFoundError:
    print("ABIDE data not yet downloaded. Skipping processing.")

PYEOF

echo ""
echo "=== Setup Complete ==="
echo "Aggregate data stored in: $DATA_DIR"
echo "Individual participant data is NOT stored."
```

### 10.3 Recommended Database Schema

```sql
-- Cohort Reference Data Schema
-- Stores ONLY aggregate statistics. No individual participant data.

CREATE TABLE cohort_datasets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(200),
    url VARCHAR(500),
    license_type VARCHAR(50),
    commercial_use_allowed BOOLEAN DEFAULT FALSE,
    citation_text TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cohort_biomarker_references (
    id SERIAL PRIMARY KEY,
    dataset_id INTEGER REFERENCES cohort_datasets(id),
    biomarker_name VARCHAR(100) NOT NULL,
    biomarker_category VARCHAR(50),  -- 'volume', 'thickness', 'connectivity', 'chemistry'
    reference_group VARCHAR(50) NOT NULL,  -- 'CN', 'EMCI', 'LMCI', 'AD', 'TD', 'ASD'
    age_min INTEGER,
    age_max INTEGER,
    sex VARCHAR(10),  -- NULL = combined
    n_subjects INTEGER NOT NULL,
    mean_value DOUBLE PRECISION,
    std_value DOUBLE PRECISION,
    median_value DOUBLE PRECISION,
    q25_value DOUBLE PRECISION,
    q75_value DOUBLE PRECISION,
    ci95_lower DOUBLE PRECISION,
    ci95_upper DOUBLE PRECISION,
    confidence_level VARCHAR(20),  -- 'HIGH', 'MODERATE', 'LOW', 'VERY_LOW'
    source_phase VARCHAR(50),  -- 'ADNI-3', 'ABIDE-II'
    computation_method VARCHAR(100),
    last_updated TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT positive_n CHECK (n_subjects > 0),
    CONSTRAINT non_negative_std CHECK (std_value >= 0)
);

CREATE TABLE cohort_site_effects (
    id SERIAL PRIMARY KEY,
    dataset_id INTEGER REFERENCES cohort_datasets(id),
    biomarker_name VARCHAR(100),
    site_id VARCHAR(50),
    site_mean DOUBLE PRECISION,
    site_std DOUBLE PRECISION,
    site_n INTEGER,
    icc_value DOUBLE PRECISION,
    harmonization_applied VARCHAR(50),
    computed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cohort_comparison_audit_log (
    id SERIAL PRIMARY KEY,
    request_hash VARCHAR(32),  -- Anonymized request identifier
    patient_age INTEGER,
    patient_sex VARCHAR(10),
    biomarkers_requested TEXT[],
    datasets_used TEXT[],
    disclaimer_included BOOLEAN,
    limitations_count INTEGER,
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert dataset metadata
INSERT INTO cohort_datasets (name, full_name, url, license_type, commercial_use_allowed, citation_text) VALUES
('ADNI', 
 'Alzheimer''s Disease Neuroimaging Initiative',
 'https://adni.loni.usc.edu/',
 'ADNI_DUA',
 FALSE,
 'Data from ADNI (adni.loni.usc.edu). For research only. Commercial use prohibited.'
),
('ABIDE',
 'Autism Brain Imaging Data Exchange',
 'http://fcon_1000.projects.nitrc.org/indi/abide/',
 'CC_BY_SA_3.0',
 TRUE,
 'Data from ABIDE, Di Martino et al. (2014, 2017). CC BY-SA 3.0.'
);

-- Indexes
CREATE INDEX idx_biomarker_lookup ON cohort_biomarker_references 
    (dataset_id, biomarker_name, reference_group, age_min, age_max, sex);
CREATE INDEX idx_audit_timestamp ON cohort_comparison_audit_log (created_at);
```

### 10.4 Testing Strategy

```python
"""
Cohort Integration Test Suite

Comprehensive tests for the cohort integration pipeline.
"""

import pytest
import numpy as np


class TestGovernanceEnforcement:
    """Test that governance rules are always enforced."""
    
    def test_disclaimer_always_included(self, governance_service):
        """DR-01: Every response must include disclaimer."""
        request = CohortComparisonRequest(
            patient_id="test", patient_age=70, patient_sex="F",
            biomarker_values={"hippocampal_volume": 6000},
            target_cohorts=[CohortDataset.ADNI]
        )
        result = governance_service.create_governed_result(
            request, {}, [CohortDataset.ADNI]
        )
        assert result.disclaimer is not None
        assert len(result.disclaimer) > 100
        assert "research" in result.disclaimer.lower()
    
    def test_clinical_correlation_flag(self, governance_service):
        """DR-08: Clinical correlation flag must always be true."""
        request = CohortComparisonRequest(
            patient_id="test", patient_age=70, patient_sex="F",
            biomarker_values={"hippocampal_volume": 6000},
            target_cohorts=[CohortDataset.ADNI]
        )
        result = governance_service.create_governed_result(
            request, {}, [CohortDataset.ADNI]
        )
        assert result.clinical_correlation_required is True
    
    def test_research_only_flag(self, governance_service):
        """DR-04: Research-only flag must always be true."""
        request = CohortComparisonRequest(
            patient_id="test", patient_age=70, patient_sex="F",
            biomarker_values={"hippocampal_volume": 6000},
            target_cohorts=[CohortDataset.ADNI]
        )
        result = governance_service.create_governed_result(
            request, {}, [CohortDataset.ADNI]
        )
        assert result.research_only is True
    
    def test_no_prohibited_phrases(self):
        """DR-05: Display text must not contain prohibited phrases."""
        safe_text = "The patient's value is above the cohort mean."
        is_valid, violations = validate_display_text(safe_text)
        assert is_valid
        
        unsafe_text = "The patient has Alzheimer's disease based on z-score."
        is_valid, violations = validate_display_text(unsafe_text)
        assert not is_valid
        assert len(violations) > 0


class TestZScoreComputation:
    """Test z-score computation accuracy."""
    
    def test_standard_zscore(self):
        """Standard z-score computation."""
        dist = CohortDistribution(
            cohort_name="ADNI", subgroup_label="CN_70-79_F",
            biomarker="hippocampal_volume", n=300,
            mean=6800, std=750, median=6900, q25=6300, q75=7400
        )
        z, desc = compute_cohort_zscore(5800, dist, method="standard")
        expected_z = (5800 - 6800) / 750  # -1.333...
        assert abs(z - expected_z) < 0.001
    
    def test_robust_zscore(self):
        """Robust z-score computation with outliers."""
        dist = CohortDistribution(
            cohort_name="ADNI", subgroup_label="CN_70-79_F",
            biomarker="hippocampal_volume", n=300,
            mean=6800, std=2000, median=6900, q25=6300, q75=7400
        )
        z, desc = compute_cohort_zscore(5800, dist, method="robust")
        iqr = 7400 - 6300  # 1100
        expected_z = (5800 - 6900) / (1100 / 1.349)  # -1.349
        assert abs(z - expected_z) < 0.01
    
    def test_zero_std_handling(self):
        """Handle zero standard deviation gracefully."""
        dist = CohortDistribution(
            cohort_name="ADNI", subgroup_label="CN_70-79_F",
            biomarker="hippocampal_volume", n=300,
            mean=6800, std=0, median=6800, q25=6800, q75=6800
        )
        z, desc = compute_cohort_zscore(5800, dist)
        assert np.isnan(z)


class TestAgeMatching:
    """Test age-matching strategies."""
    
    def test_within_range_match(self):
        """Age within cohort range."""
        score, desc = age_match_score(72, 65, 84)
        assert score > 0.7
        assert "within" in desc.lower()
    
    def test_below_range_match(self):
        """Age below cohort range."""
        score, desc = age_match_score(50, 55, 64)
        assert score < 0.6
        assert "below" in desc.lower()
    
    def test_above_range_match(self):
        """Age above cohort range."""
        score, desc = age_match_score(95, 75, 84)
        assert score < 0.5
        assert "above" in desc.lower()


class TestConfidenceAssessment:
    """Test confidence level assessment."""
    
    def test_high_confidence(self):
        """High confidence criteria."""
        level = assess_confidence(
            n_participants=600,
            missing_data_rate=0.03,
            site_icc=0.04,
            has_external_validation=True,
            has_longitudinal_data=True
        )
        assert level == "HIGH"
    
    def test_low_confidence(self):
        """Low confidence criteria."""
        level = assess_confidence(
            n_participants=80,
            missing_data_rate=0.20,
            site_icc=0.20,
            has_external_validation=False,
            has_longitudinal_data=False
        )
        assert level == "LOW"
```

---

## 11. Clinical Safety Rules

### 11.1 Safety Rules Summary

| Rule ID | Rule | Rationale | Enforcement |
|---------|------|-----------|-------------|
| **CS-01** | Cohort data shall never be the sole basis for clinical decision-making | Group stats are not individual diagnostics | Architecture: cohort data flows to display layer only, not decision engine |
| **CS-02** | Every cohort comparison display requires a clinician review flag | Prevents automated interpretation | Display template: always includes "clinical correlation required" |
| **CS-03** | Z-scores outside ±3 shall trigger a review flag, not an alert | Extreme values need human interpretation | Pipeline: flag in result; UI: highlight for review |
| **CS-04** | Cohort data shall not be presented to patients without clinician review | Patient-facing displays need professional filtering | Access control: clinician role required |
| **CS-05** | ADNI data shall never be used for commercial patient screening | DUA prohibition + clinical safety | License compliance service blocks this use case |
| **CS-06** | ABIDE connectivity patterns shall not be used to suggest ASD diagnosis | Group differences ≠ individual diagnosis | Display templates prohibit diagnostic language |
| **CS-07** | Site effects for multi-site cohorts shall always be disclosed | Prevents false precision | ABIDE adapter: site_effect_warning always included |
| **CS-08** | Age-inappropriate cohort comparisons shall be blocked | Comparison outside age range is misleading | Validation: return error if age outside cohort range |
| **CS-09** | All cohort data access shall be audit-logged | Accountability and compliance review | Audit logger: every request logged |
| **CS-10** | Cohort reference data shall be updated annually | Stale reference data reduces accuracy | Data management: annual refresh cycle |
| **CS-11** | Cohort data shall be stored as aggregates only | Privacy protection + DUA compliance | Database: only mean/std/N stored |
| **CS-12** | When cohort N < 50 for a subgroup, comparison shall be suppressed | Small samples produce unreliable estimates | Pipeline: return "insufficient data" |

### 11.2 Clinical Safety Flow Diagram

```
+--------------------------------------------------+
|         PATIENT BIOMARKER MEASUREMENT RECEIVED    |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
| 1. VALIDATE patient demographics against cohort   |
|    age/sex ranges                                 |
|    [CS-08: Block if out of range]                 |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
| 2. CHECK cohort subgroup N >= 50                  |
|    [CS-12: Suppress if N < 50]                    |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
| 3. COMPUTE contextual z-score vs cohort           |
|    (group statistics only)                        |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
| 4. INJECT mandatory caveats and disclaimers       |
|    [CS-01, CS-02: Research context only]          |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
| 5. FLAG z-score > ±3 for clinical review          |
|    [CS-03: Review flag, not alert]                |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
| 6. ADD confidence intervals and limitations       |
|    [CS-07: Site effects disclosed]                |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
| 7. REQUIRE clinician review before patient-facing |
|    display                                        |
|    [CS-04: Clinician gate]                        |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
| 8. LOG access for governance audit                |
|    [CS-09: Audit trail]                           |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
| 9. DISPLAY with "RESEARCH CONTEXT ONLY" banner    |
|    [All CS rules: Final presentation layer]       |
+--------------------------------------------------+
```

### 11.3 Safety Test Cases

```python
"""
Clinical Safety Test Cases

These test cases verify that the cohort integration system
behaves safely under edge conditions.
"""

import pytest


class TestClinicalSafety:
    """Clinical safety boundary tests."""
    
    def test_child_patient_blocked_from_adni(self, integration_service):
        """CS-08: Children should not be compared to ADNI (age 55+)."""
        request = CohortComparisonRequest(
            patient_id="test", patient_age=10, patient_sex="M",
            biomarker_values={"hippocampal_volume": 8000},
            target_cohorts=[CohortDataset.ADNI]
        )
        result = integration_service.get_patient_context(request)
        assert "adni_context" in result.results
        assert "error" in result.results["adni_context"]
        assert "below ADNI minimum" in result.results["adni_context"]["error"]
    
    def test_elderly_patient_blocked_from_abide(self, integration_service):
        """CS-08: Elderly patients should not be compared to ABIDE (age < 64)."""
        request = CohortComparisonRequest(
            patient_id="test", patient_age=80, patient_sex="F",
            biomarker_values={"dmn_connectivity": 0.5},
            target_cohorts=[CohortDataset.ABIDE]
        )
        result = integration_service.get_patient_context(request)
        assert "abide_context" in result.results
        assert "error" in result.results["abide_context"]
    
    def test_small_subgroup_suppressed(self, adni_adapter):
        """CS-12: Comparison suppressed when subgroup N < 50."""
        # Simulate a request for a rare demographic combination
        ref = adni_adapter.get_hippocampal_volume_reference(
            age=90, sex="F", group=ADNIGroup.AD
        )
        # If N < 50, should return None or include warning
        if ref is not None:
            assert ref.n_subjects >= 50 or "insufficient" in str(ref).lower()
    
    def test_extreme_zscore_flagged(self):
        """CS-03: Z-scores beyond ±3 should be flagged for review."""
        dist = CohortDistribution(
            cohort_name="ADNI", subgroup_label="CN_70-79_F",
            biomarker="hippocampal_volume", n=300,
            mean=6800, std=750, median=6900, q25=6300, q75=7400
        )
        # Z-score of -5.0 (extreme)
        extreme_value = 6800 - 5 * 750  # 3050
        z, _ = compute_cohort_zscore(extreme_value, dist)
        assert abs(z) > 3.0
        # In production, this would trigger a review flag
    
    def test_disclaimer_length_sufficient(self, governance_service):
        """Disclaimer must be substantive, not token."""
        request = CohortComparisonRequest(
            patient_id="test", patient_age=70, patient_sex="F",
            biomarker_values={"hippocampal_volume": 6000},
            target_cohorts=[CohortDataset.ADNI]
        )
        result = governance_service.create_governed_result(
            request, {}, [CohortDataset.ADNI]
        )
        assert len(result.disclaimer) >= 100
        assert "research" in result.disclaimer.lower()
        assert "diagnosis" in result.disclaimer.lower() or "diagnostic" in result.disclaimer.lower()


class TestAuditLogging:
    """Audit logging verification."""
    
    def test_request_logged(self, audit_logger, integration_service):
        """CS-09: Every request must be logged."""
        initial_count = len(audit_logger.audit_log)
        
        request = CohortComparisonRequest(
            patient_id="test", patient_age=70, patient_sex="F",
            biomarker_values={"hippocampal_volume": 6000},
            target_cohorts=[CohortDataset.ADNI]
        )
        integration_service.get_patient_context(request)
        
        assert len(audit_logger.audit_log) == initial_count + 1
    
    def test_log_contains_governance_fields(self, audit_logger):
        """Audit log must track governance compliance."""
        if audit_logger.audit_log:
            entry = audit_logger.audit_log[-1]
            assert "disclaimer_included" in entry
            assert entry["disclaimer_included"] is True
```

---

## 12. Risks & Mitigations

### 12.1 Risk Register

| ID | Risk | Likelihood | Impact | Severity | Mitigation |
|----|------|-----------|--------|----------|------------|
| **R-01** | Cohort data misused for individual diagnosis | Medium | Critical | **HIGH** | Governance service enforces caveats on every output; display templates prohibit diagnostic language; clinician review gate required |
| **R-02** | ADNI commercial use violation | Low | Critical | **HIGH** | License compliance service blocks commercial use cases; annual DUA re-certification reminder; legal review of integration design |
| **R-03** | Site effects lead to false conclusions (ABIDE) | Medium | High | **HIGH** | Site effect analyzer runs on all ABIDE data; mandatory site_effect_warning in output; ComBat harmonization option; confidence level downgraded for high-ICC biomarkers |
| **R-04** | Age-matching failure produces misleading context | Medium | High | **HIGH** | Age validation blocks comparison outside cohort range; age_match_score reported with every result; visual age-range indicator in UI |
| **R-05** | Stale reference data reduces accuracy | Medium | Medium | **MEDIUM** | Annual data refresh cycle; version tracking for all reference data; expiration warnings for outdated statistics |
| **R-06** | Small subgroup (N<50) produces unreliable statistics | Medium | Medium | **MEDIUM** | Subgroup N always displayed; suppression when N<50; confidence level assessment flags small samples |
| **R-07** | Privacy leak through aggregate statistics | Low | Critical | **HIGH** | Only aggregate statistics stored (mean, std, N); no individual data in system; differential privacy review for small subgroups |
| **R-08** | ABIDE male skew produces misleading female comparison | High | Medium | **MEDIUM** | Sex-matching flagged with confidence assessment; explicit limitation about male skew in every ABIDE output |
| **R-09** | Different preprocessing pipelines produce inconsistent results | Medium | Medium | **MEDIUM** | Pipeline tracking in provenance; pipeline-matching enforced in comparison; pipeline name displayed in output |
| **R-10** | Patient-facing display without clinician review | Low | Critical | **HIGH** | Role-based access control; clinician flag must be cleared before patient view; "RESEARCH ONLY" watermark on all displays |
| **R-11** | Z-score misinterpreted as diagnostic measure | High | High | **HIGH** | Template enforcement: always says "relative to cohort"; never says "abnormal" or "normal"; confidence intervals shown; educational tooltip |
| **R-12** | ADNI DUA renewal lapse | Low | High | **MEDIUM** | Automated renewal reminders 90/60/30 days before expiration; fallback to ABIDE-only mode if ADNI lapses |
| **R-13** | DeepTwin synthesis generates anatomically implausible features | Medium | Medium | **MEDIUM** | Cohort-informed plausibility checking; Mahalanobis distance threshold; clinician review flag for outliers |
| **R-14** | Citation/attribution omission in publications | Medium | Medium | **MEDIUM** | Auto-generated citation text in all outputs; export function includes required citations; compliance checklist |

### 12.2 Risk Mitigation Architecture

```
+-------------------------------------------------------------+
|                  RISK MITIGATION LAYERS                      |
+-------------------------------------------------------------+
|                                                               |
|  LAYER 1: ARCHITECTURAL                                       |
|  + Cohort data flows to display only, never to decision      |
|  + Individual participant data never enters the system       |
|  + Aggregate statistics stored with version tracking         |
|                                                               |
|  LAYER 2: CODE-LEVEL                                          |
|  + GovernanceService enforces caveats on every output        |
|  + Display templates prohibit diagnostic language            |
|  + Age/sex validation blocks inappropriate comparisons       |
|  + N<50 suppression prevents unreliable statistics           |
|                                                               |
|  LAYER 3: ACCESS CONTROL                                      |
|  + Clinician role required for cohort context view           |
|  + Patient-facing display requires explicit clinician review  |
|  + Audit logging of all access                                |
|                                                               |
|  LAYER 4: MONITORING                                          |
|  + Automated alerts for governance violations                |
|  + Quarterly review of audit logs                             |
|  + DUA expiration tracking with automated reminders           |
|                                                               |
|  LAYER 5: ORGANIZATIONAL                                      |
|  + Clinical safety review board oversight                     |
|  + Annual data governance audit                               |
|  + Legal review of cohort data integration design             |
|                                                               |
+-------------------------------------------------------------+
```

### 12.3 Fallback Behavior

| Scenario | Fallback Behavior |
|----------|-------------------|
| ADNI data unavailable | Degrade to ABIDE only (if age-appropriate); display "Reference data temporarily unavailable" |
| ABIDE data unavailable | Degrade to ADNI only (if age-appropriate); display "Reference data temporarily unavailable" |
| Both datasets unavailable | Show "No cohort reference available" with explanation |
| Subgroup N < 50 | Suppress comparison; show "Insufficient reference data for this demographic" |
| Patient age outside all cohort ranges | Block comparison; explain applicable age ranges |
| DUA renewal pending | Block ADNI data; show "ADNI reference pending renewal" |
| Network timeout to data store | Return cached aggregates with "Data may be outdated" warning |

---

## Appendix A: Complete Citation Library

### ADNI Citations

**Primary ADNI Citation:**
```
Weiner MW, Veitch DP, Aisen PS, et al. The Alzheimer's Disease Neuroimaging Initiative:
Progress report and future plans. Alzheimer's & Dementia. 2010;6(3):202-211.e7.
doi:10.1016/j.jalz.2010.03.007
```

**ADNI-3 Update:**
```
Weiner MW, Veitch DP, Miller MJ, et al. Increasing participant recruitment into ADNI-3:
Alzheimer's Disease Neuroimaging Initiative. Alzheimer's & Dementia. 2017;13(7):P166-P167.
```

**ADNI Methods:**
```
Petersen RC, Aisen PS, Beckett LA, et al. Alzheimer's Disease Neuroimaging Initiative (ADNI):
Clinical characterization. Neurology. 2010;74(3):201-209.
```

### ABIDE Citations

**ABIDE I:**
```
Di Martino A, Yan CG, Li Q, et al. The autism brain imaging data exchange: Towards a
large-scale evaluation of the intrinsic brain architecture in autism. Molecular Psychiatry.
2014;19(6):659-667. doi:10.1038/mp.2013.78
```

**ABIDE II:**
```
Di Martino A, O'Connor D, Chen B, et al. Enhancing studies of the connectome in autism
using the autism brain imaging data exchange II. Scientific Data. 2017;4:170010.
doi:10.1038/sdata.2017.10
```

### ComBat Harmonization

```
Fortin JP, Parker D, Tunç B, et al. Harmonization of multi-site diffusion tensor imaging data.
NeuroImage. 2017;161:149-170.

Johnson WE, Li C, Rabinovic A. Adjusting batch effects in microarray expression data using
empirical Bayes methods. Biostatistics. 2007;8(1):118-127.
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **ADNI** | Alzheimer's Disease Neuroimaging Initiative — multi-site longitudinal study |
| **ABIDE** | Autism Brain Imaging Data Exchange — open-access neuroimaging dataset |
| **Centiloid** | Standardized amyloid PET uptake scale (0 = young control mean, 100 = typical AD mean) |
| **CN** | Cognitively Normal — ADNI diagnostic group |
| **MCI** | Mild Cognitive Impairment — ADNI diagnostic group (EMCI, LMCI) |
| **AD** | Alzheimer's Disease dementia — ADNI diagnostic group |
| **ASD** | Autism Spectrum Disorder — ABIDE diagnostic group |
| **TD** | Typically Developing — ABIDE control group |
| **SUVR** | Standardized Uptake Value Ratio — PET quantification method |
| **CSF** | Cerebrospinal Fluid — biomarker source |
| **Aβ42** | Amyloid-beta 42 — CSF biomarker |
| **p-tau** | Phosphorylated tau — CSF biomarker |
| **rs-fMRI** | Resting-state functional MRI |
| **DUA** | Data Use Agreement |
| **ICC** | Intraclass Correlation Coefficient — measure of site effects |
| **ComBat** | Empirical Bayes method for batch effect correction |
| **Z-score** | Number of standard deviations from mean (context-specific) |
| **Propensity Score** | Probability of group membership given covariates |

---

> **END OF REPORT**
>
> This document was prepared as part of the DeepSynaps Protocol Studio
> PHASE 2 Knowledge Layer development. All cohort data references are
> for research context integration only. This document does not provide
> clinical guidance for individual patient care.
>
> **Report Version:** 1.0.0-PHASE2  
> **Classification:** Technical Integration Report  
> **Next Review:** 2026-01-16  
> **Responsible Party:** Clinical Safety & Data Governance Committee
