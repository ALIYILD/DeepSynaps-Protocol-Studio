# MRI Atlas Registration Design Document
## Neuroimaging Atlases, Registration Methods, and Neuromodulation Target Planning

**Version:** 1.0  
**Date:** 2025-01-15  
**Status:** Research Design Document  
**Classification:** Technical Reference for DeepSynaps Protocol Studio

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Atlases Reference](#2-atlases-reference)
   - 2.1 [MNI Templates](#21-mni-templates)
   - 2.2 [AAL Atlas](#22-aal-atlas)
   - 2.3 [Harvard-Oxford Atlas](#23-harvard-oxford-atlas)
   - 2.4 [Desikan-Killiany Atlas](#24-desikan-killiany-atlas)
   - 2.5 [Schaefer Atlas](#25-schaefer-atlas)
   - 2.6 [Brodmann Areas](#26-brodmann-areas)
   - 2.7 [Talairach Space](#27-talairach-space)
   - 2.8 [JHU White Matter Atlas](#28-jhu-white-matter-atlas)
   - 2.9 [Brainnetome Atlas](#29-brainnetome-atlas)
   - 2.10 [Destrieux Atlas](#210-destrieux-atlas)
3. [Registration Methods](#3-registration-methods)
   - 3.1 [Linear (Affine) Registration](#31-linear-affine-registration)
   - 3.2 [Nonlinear (SyN/ANTS) Registration](#32-nonlinear-synants-registration)
   - 3.3 [Template-Based Registration](#33-template-based-registration)
   - 3.4 [Surface-Based Registration (FreeSurfer)](#34-surface-based-registration-freesurfer)
   - 3.5 [Quality Assurance Metrics](#35-quality-assurance-metrics)
   - 3.6 [Spatial Normalization Validation](#36-spatial-normalization-validation)
4. [Neuromodulation Target Planning](#4-neuromodulation-target-planning)
   - 4.1 [TMS Targets](#41-tms-targets)
   - 4.2 [tDCS Targets](#42-tdcs-targets)
   - 4.3 [tACS Targets](#43-tacs-targets)
   - 4.4 [taVNS Targets](#44-tavns-targets)
   - 4.5 [PBM Targets](#45-pbm-targets)
   - 4.6 [TPS Targets](#46-tps-targets)
5. [Cross-Reference Tables](#5-cross-reference-tables)
6. [Implementation Recommendations](#6-implementation-recommendations)
7. [References](#7-references)

---

## 1. Executive Summary

This document provides a comprehensive technical reference for neuroimaging atlas selection, image registration methods, and neuromodulation target planning. It serves as the design foundation for the DeepSynaps Protocol Studio's MRI processing pipeline, covering 10 major brain atlases, 6 registration methodologies, and targeting protocols for 6 neuromodulation modalities.

### Key Design Principles

1. **MNI152NLin2009cAsym** is the primary reference space for volumetric analyses
2. **fsaverage** is the primary reference surface for cortical surface analyses
3. **ANTs SyN** with low-variance preset is the recommended nonlinear registration method
4. **Multi-atlas consensus** should be used for target validation where possible
5. **Individual anatomical MRI** (T1-weighted) is required for all personalized targeting

---

## 2. Atlases Reference

### 2.1 MNI Templates

#### Overview

The Montreal Neurological Institute (MNI) templates are the most widely used standardized brain spaces in neuroimaging. They are group-average templates created from MRI scans of healthy subjects and serve as the standard reference coordinate system for reporting brain locations.

| Property | Value |
|----------|-------|
| **Template Name** | MNI-ICBM152 |
| **Latest Version** | MNI-ICBM152NLin2009c |
| **Resolution** | 0.5mm, 1mm, 2mm isotropic |
| **Dimensions (1mm)** | 193 x 229 x 193 voxels |
| **Coordinate Space** | Right-handed, RAS orientation |
| **Origin** | Approximate anterior commissure |

#### Generations

| Generation | Year | Description | Key Features |
|------------|------|-------------|--------------|
| MNI305 | 1994 | Single subject + 305 linear average | SPM96-99 default |
| ICBM152 Lin | 2001 | 152-subject linear average | Improved population representation |
| ICBM152NLin6thGen | 2006 | 152-subject nonlinear (ANIMAL) | Better cortical alignment |
| **ICBM152NLin2009c** | **2009** | **152-subject nonlinear symmetric/asymmetric** | **Sharpest contrast; current gold standard** |

#### Available Contrasts

- T1-weighted (primary structural)
- T2-weighted
- PD-weighted (proton density)
- Brain mask

#### Variants

| Variant | Description | Use Case |
|---------|-------------|----------|
| MNI152NLin2009cSym | Symmetric version | Studies requiring left-right comparison |
| MNI152NLin2009cAsym | Asymmetric version | General purpose; fMRI pipelines (SPM/FSL) |
| MNI152NLin6Asym | 6th generation asymmetric | Legacy compatibility (FSL default) |

#### Registration Accuracy

- **Linear registration** to individual: mean displacement ~5-8mm
- **Nonlinear registration** to individual: mean displacement ~1-2mm
- **Cortical alignment** in 2009c significantly improved over 6th gen due to group-wise nonlinear registration with diminishing step sizes

#### Clinical Use

- Standard reference space for all neuroimaging analyses
- fMRI group analysis normalization target
- Structural MRI volumetric comparison
- Coordinate reporting standard (MNI x, y, z)
- DTI tractography normalization
- PET/SPECT spatial normalization

#### Evidence Base

- **Fonov et al. (2009, 2011)** - Template construction methodology
- **Collins et al. (1994)** - Original MNI305 construction
- **Evans et al. (1993)** - ICBM project foundation
- Over 95% of neuroimaging studies report coordinates in MNI space

---

### 2.2 AAL Atlas

#### Overview

The Automated Anatomical Labeling (AAL) atlas provides anatomical parcellation of the brain into major cortical and subcortical regions. It is distributed as an SPM toolbox and is compatible with MRIcron.

| Property | Value |
|----------|-------|
| **Full Name** | Automated Anatomical Labeling |
| **Latest Version** | AAL3 (2020) |
| **Space** | MNI space |
| **Resolution** | 1mm isotropic |
| **Regions (AAL1)** | 116 regions (90 cortical, 26 subcortical/cerebellar) |
| **Regions (AAL2)** | ~120 regions (refined OFC parcellation) |
| **Regions (AAL3)** | ~166 regions (includes brainstem nuclei) |

#### Version History

| Version | Year | Key Changes |
|---------|------|-------------|
| AAL1 | 2002 | Original 116-region parcellation (Tzourio-Mazoyer et al.) |
| AAL2 | 2015 | Alternative orbitofrontal parcellation (Chiavaras/Petrides-based) |
| **AAL3** | **2020** | **26 new areas including ACC subdivisions, 15 thalamic nuclei, brainstem nuclei (VTA, SN, LC, RN, raphe)** |

#### AAL3 New Regions

- **Anterior Cingulate subdivisions**: subgenual, pregenual, supracallosal
- **Thalamus**: 15 subdivisions
- **Nucleus accumbens**
- **Substantia nigra**
- **Ventral tegmental area (VTA)**
- **Red nucleus**
- **Locus coeruleus**
- **Raphe nuclei**

#### Label Coverage

| Category | AAL1 | AAL3 |
|----------|------|------|
| Frontal lobe | 28 | 28 |
| Parietal lobe | 10 | 10 |
| Temporal lobe | 18 | 18 |
| Occipital lobe | 10 | 10 |
| Insula | 2 | 2 |
| Cingulate | 6 | 10 (subdivided) |
| Subcortical | 18 | 38+ (expanded) |
| Cerebellum | 16 | 16 |
| Brainstem | - | 8+ (new) |

#### Clinical Use

- Structural MRI region-of-interest (ROI) analysis
- Voxel-based morphometry (VBM) regional labeling
- fMRI activation localization and reporting
- DTI connectivity matrix node definition
- Neurodegeneration (atrophy) quantification per region

#### Evidence Base

- **Rolls et al. (2020)** - AAL3 publication
- **Rolls et al. (2015)** - AAL2 publication
- **Tzourio-Mazoyer et al. (2002)** - AAL1 original (cited >25,000 times)

---

### 2.3 Harvard-Oxford Atlas

#### Overview

The Harvard-Oxford atlas is a probabilistic atlas of human brain cortical and subcortical structures distributed with FSL (FMRIB Software Library). It combines structural data from Harvard Center for Morphometric Analysis with Oxford probabilistic mapping methods.

| Property | Value |
|----------|-------|
| **Type** | Probabilistic (0-100% probability per voxel) |
| **Space** | MNI152 (originally Lin6; now available in 2009c) |
| **Resolution** | 1mm and 2mm |
| **Cortical Regions** | 48 (bilateral, cortical) |
| **Subcortical Regions** | 21 (bilateral + midline) |

#### Atlas Components

| Component | Description | File Prefix |
|-----------|-------------|-------------|
| Cortical Probabilistic | 48 cortical regions, bilateral | HOCPA |
| Cortical Lateralized | 48 cortical regions, left/right separated | HOCPAL |
| Subcortical Probabilistic | 21 subcortical structures | HOSPA |

#### Threshold Options

| Threshold | Use Case |
|-----------|----------|
| 0% | Maximum probability label only |
| 25% | Liberal inclusion (larger regions) |
| 50% | Conservative inclusion (more reliable core regions) |

#### Construction Method

1. T1-weighted images from 21 healthy males + 16 healthy females (ages 18-50)
2. Individual semi-automated segmentation using CMA tools
3. Affine registration to MNI152 using FLIRT (FSL)
4. Transforms applied to individual labels
5. Population probability maps generated for each label

#### Registration Accuracy

- Based on linear FLIRT registration (affine only)
- Probabilistic nature accounts for inter-subject variability
- Maximum probability labels reflect consensus anatomy

#### Clinical Use

- FSL FEAT/fMRI first-level region labeling
- Probabilistic ROI analysis
- Structural labeling in group studies
- Subcortical structure identification (striatum, thalamus, etc.)

#### Evidence Base

- **Desikan et al. (2006)** - Related cortical parcellation
- **Makris et al. (2006)** - Harvard Center parcellation methodology
- **Mazziotta et al. (2001)** - ICBM probabilistic atlas framework

---

### 2.4 Desikan-Killiany Atlas

#### Overview

The Desikan-Killiany (DK) atlas is a gyral-based cortical parcellation system widely used in the FreeSurfer processing stream. It subdivides the cerebral cortex into anatomically defined regions based on sulcal and gyral landmarks.

| Property | Value |
|----------|-------|
| **Full Name** | Desikan-Killiany Atlas |
| **Type** | Surface-based cortical parcellation |
| **Space** | Individual native surface + fsaverage template |
| **Regions** | 68 cortical (34 per hemisphere) |
| **Method** | Probabilistic classifier on cortical surface |

#### Region Categories

| Lobe | Regions (per hemisphere) |
|------|--------------------------|
| Frontal | 12 (superior frontal, rostral middle frontal, caudal middle frontal, pars opercularis, pars triangularis, pars orbitalis, lateral orbitofrontal, medial orbitofrontal, precentral, paracentral, frontal pole, rostral anterior cingulate) |
| Parietal | 6 (superior parietal, inferior parietal, supramarginal, precuneus, postcentral, isthmus cingulate) |
| Temporal | 8 (superior temporal, middle temporal, inferior temporal, fusiform, entorhinal, parahippocampal, transverse temporal, temporal pole) |
| Occipital | 5 (lateral occipital, lingual, cuneus, pericalcarine) |
| Cingulate | 3 (caudal anterior cingulate, posterior cingulate, isthmus) |

#### FreeSurfer Implementation

- Training set: 40 manually labeled brains
- Classifier: First-order anisotropic non-stationary Markov random field on cortical curvature
- Output files: `?h.aparc.annot`
- Surface model: Spherical representation with folding-pattern alignment
- Compatible with: `?h.pial`, `?h.white`, `?h.inflated`, `?h.sphere`

#### Related Variants

| Variant | Description | Regions |
|---------|-------------|---------|
| DK (default) | Original Desikan-Killiany | 68 cortical |
| DKT | Desikan-Killiany-Tourville | 62 cortical (31 per hemisphere, with aggregated poles) |
| Ex vivo | Ultra-high resolution entorhinal/perirhinal | Enhanced medial temporal |

#### Registration Accuracy

- Surface-based registration achieves superior cortical alignment (~2mm) compared to volume-based methods
- Folding pattern alignment adapts to individual sulcal/gyral anatomy
- Dice Kappa with manual labeling: mean kappa ~0.73 +/- 0.18 across structures

#### Clinical Use

- Cortical thickness measurement
- Cortical surface area quantification
- Gray matter volume estimation
- Longitudinal atrophy tracking
- Neurodegeneration studies (Alzheimer's, Parkinson's)
- fMRI cortical ROI analysis on surface

#### Evidence Base

- **Desikan et al. (2006)** - Original publication (cited >10,000 times)
- **Fischl et al. (2004)** - Probabilistic labeling methodology
- **Potvin et al. (2017)** - Normative data for 2713 healthy adults

---

### 2.5 Schaefer Atlas

#### Overview

The Schaefer atlas is a functional parcellation of the human cerebral cortex based on resting-state functional connectivity gradients. It provides a data-driven alternative to anatomical parcellations by grouping cortical vertices into functionally homogeneous regions.

| Property | Value |
|----------|-------|
| **Full Name** | Schaefer-Yeo 2018 Functional Parcellation |
| **Method** | Gradient-weighted Markov Random Field (gwMRF) |
| **Space** | fsaverage (surface) + MNI152NLin2009cAsym (volume) |
| **Parcel Scales** | 100, 200, 300, 400, 500, 600, 800, 1000 regions |
| **Network Framework** | 7-network and 17-network Yeo solutions |

#### Network Parcellation (7-Network Solution)

| Network | Functional Role |
|---------|----------------|
| Visual | Primary and associative visual processing |
| Somatomotor | Sensorimotor integration |
| Dorsal Attention | Top-down attentional control |
| Ventral Attention | Bottom-up salience detection |
| Limbic | Emotional and memory processing |
| Frontoparietal (Control) | Executive function, cognitive control |
| Default Mode | Self-referential processing, mind-wandering |

#### Parcel Organization

| Scale | Parcels/Hemisphere | Typical Use Case |
|-------|-------------------|------------------|
| 100 | 50 | Large-scale network analysis |
| 200 | 100 | Default for connectivity studies |
| 400 | 200 | Higher resolution functional analysis |
| 1000 | 500 | Fine-grained parcellation |

#### Advantages Over Anatomical Atlases

1. **Functional homogeneity**: parcels have more uniform connectivity profiles
2. **Better decoding performance**: improved prediction of task activations
3. **Connectivity biomarkers**: more accurate for individual trait prediction
4. **Cross-modal alignment**: better correspondence with fMRI activation patterns

#### Volume Availability

- Available in MNI152NLin2009cAsym via TemplateFlow
- Can be projected from fsaverage surface to volumetric space
- Also available in MNI152NLin6Asym for FSL compatibility

#### Clinical Use

- Resting-state fMRI connectivity analysis
- Functional connectivity matrix generation
- Network neuroscience studies
- Individual functional fingerprinting
- Task fMRI ROI analysis (functional rather than anatomical ROIs)

#### Evidence Base

- **Schaefer et al. (2018)** - Original publication in Cerebral Cortex
- **Yeo et al. (2011)** - 7/17 network framework foundation
- **Thomas Yeo's lab** (https://github.com/ThomasYeoLab/CBIG/tree/master/stable_projects/brain_parcellation/Schaefer2018_LocalGlobal)

---

### 2.6 Brodmann Areas

#### Overview

Brodmann areas (BA) are cytoarchitectonically defined regions of the cerebral cortex originally described by Korbinian Brodmann based on histological staining patterns. They remain among the most widely referenced anatomical designations in neuroscience despite being over a century old.

| Property | Value |
|----------|-------|
| **Type** | Cytoarchitectonic parcellation |
| **Origin** | Histological cell-body staining (1903-1909) |
| **Number of Areas** | ~52 in human cortex (originally 43 in human) |
| **Modern Implementation** | 3D probabilistic maps (SPM Anatomy Toolbox) |

#### Key Brodmann Areas and Functions

| BA | Name | Primary Function | MNI Coordinates (approximate center) |
|----|------|-----------------|--------------------------------------|
| 1, 2, 3 | Primary somatosensory cortex | Tactile processing | +/-42, -24, 54 |
| 4 | Primary motor cortex | Movement execution | +/-38, -26, 56 |
| 5 | Somatosensory association | Tactile integration | +/-28, -46, 56 |
| 6 | Pre-motor/SMA | Movement planning | +/-22, -10, 56 |
| 7 | Somatosensory association | Visuo-motor integration | +/-22, -64, 50 |
| 8 | Frontal eye fields | Voluntary eye movements | +/-28, 8, 52 |
| 9 | Dorsolateral prefrontal | Working memory, cognitive control | +/-38, 30, 36 |
| 10 | Frontal pole | Executive function, planning | +/-18, 60, 16 |
| 11 | Orbitofrontal | Decision making, reward | +/-10, 44, -18 |
| 17 | Primary visual cortex (V1) | Basic visual processing | +/-8, -84, 4 |
| 18 | Secondary visual (V2) | Visual feature processing | +/-24, -88, 10 |
| 19 | Associative visual (V3/V4) | Higher visual processing | +/-32, -78, 16 |
| 20 | Inferior temporal | Visual object recognition | +/-48, -44, -20 |
| 21 | Middle temporal | Visual motion processing | +/-58, -30, -8 |
| 22 | Superior temporal (Wernicke's) | Auditory processing, language | +/-62, -24, 8 |
| 39 | Angular gyrus | Reading, semantic processing | +/-46, -62, 28 |
| 40 | Supramarginal gyrus | Phonological processing | +/-54, -40, 34 |
| 41 | Primary auditory cortex | Hearing | +/-48, -28, 10 |
| 44, 45 | Broca's area (pars opercularis/triangularis) | Speech production | +/-50, 16, 20 |
| 46 | Dorsolateral prefrontal | Working memory | +/-42, 40, 22 |
| 47 | Pars orbitalis | Language, semantic processing | +/-46, 30, -6 |

#### Modern Implementations

| Implementation | Description |
|----------------|-------------|
| **Talairach Daemon** | 3D mapping of Brodmann areas onto Talairach atlas |
| **SPM Anatomy Toolbox** | Probabilistic cytoarchitectonic maps in MNI space |
| **Juelich Histological Atlas** | Histology-based probability maps (FSL) |
| **Brodmann areas in MNI** | Approximate mappings from coordinate lookup tables |

#### Important Limitations

- **2D-to-3D mapping issues**: Original maps were 2D drawings; 3D transformations are approximate
- **Single-subject origin**: Based on one brain (Brodmann's specimens)
- **No sulcal boundary detail**: Intrasulcal area boundaries not precisely defined
- **Inter-subject variability**: Cytoarchitectonic areas vary across individuals
- **Not a registration target**: Cannot be used directly for spatial normalization

#### Clinical Use

- Coordinate-based anatomical reporting
- Functional activation localization
- Neurosurgical planning reference
- Neuromodulation targeting (TMS coil placement over specific BAs)
- Meta-analysis coordinate interpretation

#### Evidence Base

- **Brodmann (1909)** - Original monograph (cited >170,000 times)
- **Zilles and Amunts (2010)** - Modern cytoarchitectonic review
- **Eickhoff et al. (2005)** - SPM Anatomy Toolbox for probabilistic mapping

---

### 2.7 Talairach Space

#### Overview

Talairach space is the historically significant stereotactic coordinate system defined by the 1988 Talairach and Tournoux atlas. Though largely superseded by MNI space, it remains important for historical compatibility and neurosurgical applications.

| Property | Value |
|----------|-------|
| **Origin** | Anterior Commissure (AC) |
| **Y-axis** | Anterior Commissure - Posterior Commissure (AC-PC) line |
| **Dimensions** | 136mm (L-R) x 172mm (A-P) x 118mm (S-I) |
| **Template Type** | Single subject (elderly French female) |

#### MNI vs. Talairach Key Differences

| Feature | MNI152 | Talairach |
|---------|--------|-----------|
| **Source** | 152-subject average | Single subject |
| **Dimensions** | 144 x 180 x 144mm (larger) | 136 x 172 x 118mm |
| **Origin** | Approximate AC | Exact AC |
| **Y-axis** | Approximate AC-PC | Exact AC-PC |
| **Automation** | Fully automated registration | Originally manual landmarks |
| **Popularity** | ~48% of studies | ~44% of studies (historical) |

#### Coordinate Transformation Methods

| Transform | Method | Accuracy |
|-----------|--------|----------|
| **Lancaster (icbm2tal)** | Best-fit linear transform | 6.3mm average error |
| Brett (mni2tal) | Simple linear offset | 8.5mm average error |
| No transform | Direct comparison | 7.8mm average error |

**Recommendation**: Use Lancaster transform (icbm2tal) for MNI-to-Talairach conversion.

#### Clinical Use

- Legacy coordinate interpretation
- Neurosurgical stereotaxy systems
- Deep brain stimulation targeting
- Talairach Daemon anatomical labeling
- Historical meta-analyses

#### Evidence Base

- **Talairach and Tournoux (1988)** - Original atlas
- **Lancaster et al. (2007)** - MTT coordinate transformation
- **Brett et al. (2002)** - MNI-to-Talairach comparison

---

### 2.8 JHU White Matter Atlas

#### Overview

The Johns Hopkins University (JHU) white matter atlases provide standardized labeling of white matter tracts based on diffusion MRI data. They are distributed with FSL and are essential for DTI-based connectivity analysis.

| Property | Value |
|----------|-------|
| **Institution** | Johns Hopkins University (Dr. Susumu Mori) |
| **Type** | DTI-based white matter tract labels + probabilistic tractography |
| **Space** | ICBM-152 (MNI) |
| **Contrasts** | FA maps, tensor maps |

#### Atlas Components

| Component | Description | Tracts/Labels |
|-----------|-------------|---------------|
| **ICBM-DTI-81** | Hand-segmented white matter labels from 81-subject FA average | 48 white matter tract labels |
| **JHU Tractography** | Probabilistic tractography from 28 subjects | 20 major white matter tracts |

#### ICBM-DTI-81 Tract Labels (Selected)

| Tract Category | Included Tracts |
|----------------|-----------------|
| Commissural | Corpus callosum (genu, body, splenium), anterior commissure |
| Association | Superior longitudinal fasciculus (I, II, III), inferior longitudinal fasciculus, uncinate fasciculus, cingulum |
| Projection | Corticospinal tract, internal capsule (anterior, posterior, retrolenticular), corona radiata |
| Cerebellar | Middle cerebellar peduncle, cerebellar peduncles |

#### JHU Tractography Atlas Tracts (20)

1. Anterior thalamic radiation
2. Corticospinal tract
3. Cingulum (cingulate gyrus)
4. Cingulum (hippocampus)
5. Forceps major
6. Forceps minor
7. Superior longitudinal fasciculus
8. Inferior longitudinal fasciculus
9. Uncinate fasciculus
10. Superior fronto-occipital fasciculus
... (and 10 additional tracts)

#### Construction Method

- **ICBM-DTI-81**: Hand-segmented on 81-subject FA template (mean age 39, M:42, F:39)
- **Tractography atlas**: Deterministic tractography on 28 subjects (mean age 29, M:17, F:11), probabilistically averaged

#### Clinical Use

- DTI white matter quantification
- Tract-specific diffusion metrics (FA, MD, RD, AD)
- White matter lesion analysis
- Surgical planning (tractography for lesion avoidance)
- Neurodegeneration white matter studies
- Connectivity-based ROI analysis

#### Evidence Base

- **Mori et al. (2005)** - MRI Atlas of Human White Matter (book)
- **Hua et al. (2008)** - Tract probability maps in stereotaxic spaces
- **Wakana et al. (2007)** - Reproducibility of quantitative tractography

---

### 2.9 Brainnetome Atlas

#### Overview

The Brainnetome Atlas is a whole-brain parcellation based on connectional architecture derived from probabilistic tractography. It provides fine-grained cortical and subcortical parcellation with associated structural connectivity matrices.

| Property | Value |
|----------|-------|
| **Full Name** | Human Brainnetome Atlas |
| **Year** | 2016 |
| **Method** | Probabilistic tractography + connectivity-based parcellation |
| **Space** | MNI space |
| **Cortical Regions** | 210 (105 per hemisphere) |
| **Subcortical Regions** | 36 (18 per hemisphere) |
| **Total Regions** | 246 |

#### Parcellation Structure

| Lobe | Gyri/Structures | Subdivisions |
|------|----------------|--------------|
| Frontal | SFG (7), MFG (7), IFG (6), OrG (6), PrG (6), PCL (2) | 34 per hemisphere |
| Temporal | STG (6), MTG (4), ITG (6), FusG (4), PhG (6), pSTS (2) | 28 per hemisphere |
| Parietal | SPL (5), IPL (6), PCun (4), PoG (4) | 19 per hemisphere |
| Occipital | MVOcC (5), LOcC (6) | 11 per hemisphere |
| Insular | INS (6) | 6 per hemisphere |
| Cingulate | CG (7) | 7 per hemisphere |
| Subcortical | Amyg (2), Hipp (2), BG (6), Tha (8) | 18 per hemisphere |

#### Connectivity Matrix

- **246 x 246 structural connectivity matrix**
- Each entry represents structural connectivity probability between subregions
- Each row represents the connectivity "fingerprint" of a subregion

#### Key Features

| Feature | Description |
|---------|-------------|
| **Connectivity fingerprint** | Unique connectivity profile for each subregion |
| **Cramer's V** | Statistical measure of parcellation reproducibility |
| **Topological distance (TpD)** | Measure of inter-hemispheric consistency |
| **Cytoarchitectonic mapping** | Correspondence with known cytoarchitectonic areas |

#### MNI Coordinates (Selected Examples)

| Region | Modified Cytoarch. | Left MNI (X, Y, Z) | Right MNI (X, Y, Z) |
|--------|-------------------|-------------------|--------------------|
| SFG_7_1 | A8m (medial area 8) | -5, 15, 54 | 7, 16, 54 |
| MFG_7_1 | A9/46d | -27, 43, 31 | 30, 37, 36 |
| MFG_7_3 | A46 (area 46/DLPFC) | -28, 56, 12 | 28, 55, 17 |
| PrG_6_3 | A4ul (upper limb M1) | -26, -25, 63 | 34, -19, 59 |
| IFG_6_1 | A44d (dorsal area 44) | -46, 13, 24 | 45, 16, 25 |
| STG_6_2 | A41/42 (auditory) | -54, -32, 12 | 54, -24, 11 |
| IPL_6_1 | A39c (caudal area 39) | -34, -80, 29 | 45, -71, 20 |
| PhG_6_4 | A28/34 (entorhinal) | -19, -12, -30 | 19, -10, -30 |
| Hipp_2_1 | rHipp (rostral hippocampus) | -22, -14, -19 | 22, -12, -20 |
| Tha_8_8 | lPFtha (lateral prefrontal thalamus) | -11, -14, 2 | 13, -16, 7 |

#### Clinical Use

- Structural connectivity analysis
- Connectome-based ROI definition
- Network neuroscience studies
- Neurosurgical planning
- Brain stimulation targeting (connectivity-informed)
- Neurodegeneration network mapping

#### Evidence Base

- **Fan et al. (2016)** - Brainnetome Atlas publication in Cerebral Cortex
- **Jiang et al. (2021)** - Extended applications

---

### 2.10 Destrieux Atlas

#### Overview

The Destrieux atlas is a detailed cortical parcellation distributed with FreeSurfer that labels both gyral and sulcal regions, providing higher anatomical granularity than the Desikan-Killiany atlas.

| Property | Value |
|----------|-------|
| **Full Name** | Destrieux et al. (2009) Cortical Parcellation |
| **Type** | Surface-based cortical parcellation (gyral + sulcal) |
| **Space** | Individual native surface + fsaverage template |
| **Regions** | 148 cortical (74 per hemisphere) |
| **FreeSurfer File** | `?h.aparc.a2009s.annot` |

#### Construction Method

- **Training set**: 12 subjects with manual parcellation
- **Classifier**: Probabilistic surface-based labeling
- **Key feature**: Uses curvature to distinguish gyri (visible on pial surface) from sulci (hidden in folds)
- **Updated**: August 2009 (FreeSurfer v4.5+)

#### Parcellation Philosophy

| Feature | Desikan-Killiany | Destrieux |
|---------|-----------------|-----------|
| **Gyrus definition** | Includes visible gyrus + adjacent sulcal banks | Only visible cortex on pial view |
| **Sulcus labeling** | Not separately labeled | Sulci explicitly labeled |
| **Region count** | 68 | 148 |
| **Primary use** | Functional/structural ROI | Anatomical labeling |

#### Anatomical Coverage

The Destrieux atlas provides detailed labeling of:
- **Insula**: central sulcus, short/long insular gyri, circular sulcus subdivisions
- **Cingulate**: anterior, middle, posterior subdivisions
- **Perirolandic**: precentral, postcentral, subdivisions by functional somatotopy
- **Temporal**: planum polare, planum temporale, Heschl's gyrus
- **All major sulci**: explicitly labeled as separate regions

#### Clinical Use

- Fine-grained anatomical localization
- Research requiring precise sulcal/gyral identification
- fMRI studies requiring higher anatomical specificity
- Structural MRI studies of sulcal morphology

#### Evidence Base

- **Destrieux et al. (2010)** - Original publication in NeuroImage
- **Fischl et al. (2004)** - Surface-based labeling methodology

---

## 3. Registration Methods

### 3.1 Linear (Affine) Registration

#### Definition

Linear registration applies a global geometric transformation including translation, rotation, scaling, and shearing to align a source image to a target image.

#### Transformation Types

| Degrees of Freedom | Parameters | Use Case |
|-------------------|------------|----------|
| 6 DOF (Rigid) | 3 translation + 3 rotation | Within-subject longitudinal, motion correction |
| 9 DOF | 6 rigid + 3 scaling | Same-subject cross-modal (T1-to-T2) |
| 12 DOF (Affine) | 9 + 3 shearing | Cross-subject normalization |

#### Implementation Tools

| Tool | Algorithm | Cost Function | Strengths |
|------|-----------|---------------|-----------|
| **FLIRT (FSL)** | Optimized search | Correlation ratio | Fast, robust, widely validated |
| **SPM Coreg/Normalize** | Gauss-Newton | Mutual information | Integrated with SPM pipeline |
| **ANTS Affine** | Gradient descent | MI, CC, or MSQ | Precise, multiple metric options |
| **FreeSurfer mri_coreg** | Robust estimation | MI | Optimized for brain images |

#### Typical Workflow

```
1. Brain extraction (skull stripping)
2. Initial orientation alignment
3. Cost function optimization
4. Transformation matrix output (4x4 affine)
5. Application to resample source to target space
```

#### Performance

| Metric | Typical Value |
|--------|---------------|
| **Computation time** | 1-5 minutes |
| **Accuracy (cortex)** | Mean displacement ~5-8mm |
| **Accuracy (subcortex)** | Mean displacement ~3-5mm |
| **Suitable for** | Initial alignment, cross-modal registration |

---

### 3.2 Nonlinear (SyN/ANTS) Registration

#### Definition

Nonlinear registration applies local deformations to maximize image similarity, accounting for individual anatomical variation in brain shape and size.

#### ANTs SyN (Symmetric Normalization)

| Property | Value |
|----------|-------|
| **Full Name** | Symmetric Normalization |
| **Software** | ANTs (Advanced Normalization Tools) |
| **Type** | Symmetric diffeomorphic registration |
| **Optimization** | Greedy LDDMM approximation |
| **Symmetry** | Both images registered to mid-space |

#### Registration Variants

| Variant | Description | Best For |
|---------|-------------|----------|
| **SyN** | Original symmetric normalization | General purpose |
| **BSplineSyN** | B-spline parameterization | Cortical alignment |
| **SyN with subcortical refine** | Additional subcortical-focused warp | Deep brain structures |

#### Variance Presets (Lead-DBS Optimized)

| Preset | Description | Best For |
|--------|-------------|----------|
| **Low Variance** | Conservative deformation | Subcortical structures (STN, GPi) |
| Mid Variance | Moderate deformation | General whole-brain |
| High Variance | Aggressive deformation | Cases with large anatomical deviation |

#### Key Parameters

```
- Gradient step size: 0.1-0.25
- Smoothing sigma: 3x2x1 voxels (multi-resolution)
- Convergence: 100x70x50x20 iterations
- Number of scales: 3-4
- Shrink factors: 8x4x2x1
```

#### Comparative Performance (Subcortical)

| Method | Dice Coefficient (STN) | Dice Coefficient (GPi) |
|--------|----------------------|----------------------|
| **ANTs SyN (low variance + subcortical refine)** | **~0.82** | **~0.85** |
| ANTs SyN (mid variance) | ~0.78 | ~0.80 |
| SPM New Segment | ~0.75 | ~0.78 |
| SPM DARTEL | ~0.72 | ~0.74 |
| FSL FNIRT | ~0.68 | ~0.70 |
| Linear only | ~0.45 | ~0.48 |

#### Computational Demands

| Hardware | ANTs SyN Low Variance | + Subcortical Refine |
|----------|----------------------|---------------------|
| MacBook Pro (16GB, i5) | ~33 min | ~42 min |
| Desktop PC (64GB, i7-7700K) | ~9 min | ~13 min |

#### Performance Summary

| Metric | Typical Value |
|--------|---------------|
| **Computation time** | 9-45 minutes depending on preset |
| **Cortical displacement** | ~1-2mm residual |
| **Subcortical displacement** | ~0.5-1.5mm residual |
| **Gold standard for** | Structural normalization, atlas-based segmentation |

---

### 3.3 Template-Based Registration

#### Definition

Template-based registration uses a population-average brain template as the normalization target, enabling cross-subject comparison in a common coordinate space.

#### Available Templates

| Template | Space | Resolution | Best For |
|----------|-------|------------|----------|
| **MNI152NLin2009cAsym** | MNI | 0.5/1/2mm | General purpose, fMRI |
| **MNI152NLin2009cSym** | MNI | 1mm | Symmetry studies |
| **MNI152NLin6Asym** | MNI | 2mm | FSL legacy pipelines |
| MNI305 | MNI | 1mm | Historical compatibility |
| **fsaverage** | Surface | 163k vertices | FreeSurfer cortical analysis |
| **fsLR (HCP)** | Surface | 32/59/164k vertices | HCP-style surface analysis |
| **ICBM 452** | MNI | 1mm | Alternative population average |
| **NIHPD** | MNI | 1mm | Pediatric populations |

#### Template Selection Criteria

| Criterion | Recommendation |
|-----------|---------------|
| General neuroimaging | MNI152NLin2009cAsym |
| FSL pipelines | MNI152NLin2009cAsym or NLin6Asym |
| SPM pipelines | MNI152NLin2009cAsym |
| FreeSurfer cortical | fsaverage |
| HCP-style processing | fsLR (Conte69) |
| Pediatric studies | NIHPD or UNI-SPACE |
| Left-right symmetry | MNI152NLin2009cSym |

#### TemplateFlow Repository

Modern template access via TemplateFlow (https://github.com/templateflow):

```python
from templateflow import api
# Get MNI152NLin2009cAsym T1w at 1mm
t1w = api.get('MNI152NLin2009cAsym', desc=None, resolution=1, suffix='T1w')
# Get Harvard-Oxford atlas in 2009c space
ho_atlas = api.get('MNI152NLin2009cAsym', resolution=2, atlas='HOCPA')
```

---

### 3.4 Surface-Based Registration (FreeSurfer)

#### Definition

Surface-based registration aligns cortical surfaces by matching folding patterns on a spherical representation, providing superior cortical alignment compared to volume-based methods.

#### FreeSurfer Processing Pipeline

| Stage | Command | Output |
|-------|---------|--------|
| 1. Motion correction | `mri_motion_correct` | Aligned volumes |
| 2. Conform | `mri_convert` | 1mm isotropic, 256^3 |
| 3. NU correction | `mri_nu_correct.mni` | Bias-field corrected |
| 4. Skull strip | `mri_watershed` | Brain mask |
| 5. White matter segmentation | `mri_normalize` | WM/GM segmentation |
| 6. Tessellation | `mri_tessellate` | Initial surface mesh |
| 7. Smoothing | `mris_smooth` | Smoothed surface |
| 8. Inflation | `mris_inflate` | Inflated surface |
| 9. Spherical registration | `mris_sphere` | Spherical parameterization |
| 10. Atlas registration | `mris_register` | Folding pattern alignment to fsaverage |
| 11. Parcellation | `mris_ca_label` | DK or Destrieux labels |

#### Surface Types

| Surface | Description |
|---------|-------------|
| `white` | White matter / gray matter boundary |
| `pial` | Gray matter / pial (CSF) boundary |
| `inflated` | Inflated view for visualization |
| `sphere` | Spherical parameterization |
| `sphere.reg` | Registration target (fsaverage sphere) |

#### Surface Registration Method

1. **Spherical inflation**: Minimize metric distortion between cortical and spherical representations
2. **Folding pattern alignment**: Iterative gradient descent to align sulcal/gyral patterns
3. **Multi-scale energy minimization**: Full energy functional in multi-scale manner
4. **Probabilistic labeling**: Anisotropic Markov random field classifier

#### Advantages Over Volume Registration

| Advantage | Explanation |
|-----------|-------------|
| **Superior cortical alignment** | Folding patterns are more consistent than intensity |
| **Anatomical correspondence** | Vertices represent same anatomical locations across subjects |
| **No smoothing across sulci** | Cortical thickness measured accurately |
| **Multimodal integration** | fMRI, EEG, MEG can all be mapped to surface |

#### Clinical Use

- Cortical thickness analysis
- Surface-based fMRI group analysis
- Multimodal integration (EEG/MEG source localization)
- Longitudinal atrophy measurement
- Individual parcellation

---

### 3.5 Quality Assurance Metrics

#### Registration Quality Metrics

| Metric | Description | Good Value |
|--------|-------------|------------|
| **Dice Coefficient** | 2\|A∩B\|/(\|A\|+\|B\|) | >0.80 for major structures |
| **Jaccard Index** | \|A∩B\|/\|A∪B\| | >0.67 for major structures |
| **Mean Surface Distance** | Average distance between surfaces | <2mm |
| **Hausdorff Distance** | Maximum distance between surfaces | <5mm |
| **Correlation Ratio** | Intensity correlation | >0.90 |
| **Mutual Information** | Statistical dependence | >0.50 normalized |

#### Visual QC Checklist

```
- [ ] No brain edge leakage (skull strip quality)
- [ ] Ventricles aligned
- [ ] Major sulci aligned
- [ ] No folding artifacts in deformation field
- [ ] Subcortical structures visible and aligned
- [ ] No excessive stretching/compression in warp
- [ ] Jacobian determinant >0 (no folding)
```

#### Automated QC Tools

| Tool | Function |
|------|----------|
| **MRIQC** | Automated T1w/T2w/BOLD quality metrics |
| **Visual QC (FSL)** | Screenshot-based visual inspection |
| **QUANTSTORE** | Quantitative registration quality metrics |
| **ENIGMA QC** | Protocol for multi-site QC |

---

### 3.6 Spatial Normalization Validation

#### Validation Approaches

| Approach | Method | When to Use |
|----------|--------|-------------|
| **Manual expert labeling** | Expert-drawn ROIs as ground truth | Small studies, critical structures |
| **Inter-rater reliability** | Multiple raters on same data | Any manual/semi-automated method |
| **Cross-atlas agreement** | Compare multiple atlas labels | Robustness assessment |
| **Functional validation** | Task fMRI activation overlap | Functional studies |

#### Cross-Atlas Label Agreement

| Atlas Pair | Mean Dice Kappa |
|------------|----------------|
| CerebrA vs Mindboggle-101 (registered) | kappa = 0.73 +/- 0.18 |
| Harvard-Oxford vs AAL (major regions) | kappa ~0.65-0.75 |
| Brainnetome vs AAL3 | kappa ~0.60-0.70 |

#### Validation Recommendations

1. **Always inspect** registration results visually before analysis
2. **Report Dice coefficients** for atlas-based segmentations
3. **Use multiple atlases** for critical target regions
4. **Validate with manual labels** on a subset of data
5. **Monitor Jacobian determinants** to detect folding/collapse

---

## 4. Neuromodulation Target Planning

### 4.1 TMS Targets

#### Targeting Methods Comparison

| Method | Accuracy | Equipment | Cost | Clinical Standard |
|--------|----------|-----------|------|-------------------|
| **5-cm rule** | Poor (often hits BA 6/8, not BA 9/46) | None | Free | No longer recommended |
| **10-20 EEG (F3/F4)** | Moderate | EEG cap | Low | Common in research |
| **MRI-guided neuronavigation** | **High** | **MRI + neuronav system** | **High** | **Clinical gold standard** |
| **fMRI-guided targeting** | **Highest** | **MRI + fMRI + neuronav** | **Highest** | **Personalized targeting** |

#### DLPFC Target

| Property | Value |
|----------|-------|
| **Structure** | Dorsolateral Prefrontal Cortex |
| **Brodmann Areas** | BA 9/46 junction |
| **Function** | Working memory, executive function, mood regulation |
| **Clinical Use** | Major Depression (FDA-cleared), OCD, addiction |

**MNI Coordinates:**

| Study | Coordinates (x, y, z) | Description |
|-------|----------------------|-------------|
| Fitzgerald et al. (2006) | **-50, 30, 36** | **Meta-analysis working memory in MDD** |
| Fitzgerald et al. (2009) | -46, 45, 38 | Functional coordinates (MNI) |
| Herwig et al. (2003) | -37, 27, 44 | Talairach via F3 EEG |
| Herbsman et al. (2009) | -47, 24, 48 | More lateral/anterior = better response |
| **Consensus** | **-46 to -50, 24 to 45, 34 to 38** | Left DLPFC range |

**Atlas Labels for DLPFC:**
- AAL: `Middle Frontal Gyrus` (anterior portion)
- Brainnetome: `MFG_7_3` (A46), `MFG_7_1` (A9/46d)
- Harvard-Oxford: `Middle Frontal Gyrus`
- DK: `rostral middle frontal` + `caudal middle frontal`

#### M1 (Primary Motor Cortex) Target

| Property | Value |
|----------|-------|
| **Structure** | Primary Motor Cortex |
| **Brodmann Area** | BA 4 |
| **Function** | Motor execution |
| **Clinical Use** | Motor threshold determination, motor rehabilitation, pain |

**MNI Coordinates (hand area):**
- Left M1 (hand knob): approximately **-38, -26, 56**
- Right M1 (hand knob): approximately **+38, -26, 56**

**Targeting Method:**
1. Identify anatomical hand knob (omega sign) on T1w
2. Confirm with motor hotspot (largest MEP in APB/FDI)
3. Adjust coil to optimize MEP amplitude

**Atlas Labels for M1:**
- AAL: `Precentral gyrus`
- Brainnetome: `PrG_6_3` (A4ul - upper limb)
- Brodmann: BA 4
- DK: `precentral`

#### SMA (Supplementary Motor Area) Target

| Property | Value |
|----------|-------|
| **Structure** | Supplementary Motor Area |
| **Brodmann Areas** | BA 6 (medial) |
| **Function** | Motor planning, sequence learning, bimanual coordination |
| **Clinical Use** | Parkinson's disease, motor recovery post-stroke |

**MNI Coordinates:**
- Left SMA: approximately **-6, -10, 56**
- Right SMA: approximately **+6, -10, 56**

**Atlas Labels for SMA:**
- AAL: `Supplementary motor area`
- Brainnetome: `SFG_7_5` (A6m), `SFG_7_4` (A6dl)
- Brodmann: BA 6 (medial portion)

#### DMPFC (Dorsomedial Prefrontal Cortex) Target

| Property | Value |
|----------|-------|
| **Structure** | Dorsomedial Prefrontal Cortex |
| **Brodmann Areas** | BA 9 medial, BA 32 dorsal |
| **Function** | Self-referential processing, social cognition |
| **Clinical Use** | Depression, autism, schizophrenia |

**MNI Coordinates:**
- Left DMPFC: approximately **-8, 48, 38**
- Right DMPFC: approximately **+8, 48, 38**

#### OFC (Orbitofrontal Cortex) Target

| Property | Value |
|----------|-------|
| **Structure** | Orbitofrontal Cortex |
| **Brodmann Areas** | BA 11, 47/12 |
| **Function** | Reward processing, decision making, emotional regulation |
| **Clinical Use** | Addiction, OCD, depression, eating disorders |

**MNI Coordinates:**
- Left OFC: approximately **-36, 36, -14**
- Right OFC: approximately **+36, 36, -14**

**Atlas Labels:**
- AAL3: subdivided into lateral, medial, orbital portions
- Brainnetome: `OrG_6_2` (A12/47o), `OrG_6_6` (A12/47l)

#### Angular Gyrus Target

| Property | Value |
|----------|-------|
| **Structure** | Angular Gyrus |
| **Brodmann Area** | BA 39 |
| **Function** | Semantic processing, reading, numerical cognition |
| **Clinical Use** | Reading disorders, calculation deficits, neglect |

**MNI Coordinates:**
- Left angular gyrus: approximately **-46, -62, 28**
- Right angular gyrus: approximately **+46, -62, 28**

**Atlas Labels:**
- AAL: `Angular gyrus`
- Brainnetome: `IPL_6_1` (A39c), `IPL_6_2` (A39rd)
- DK: `inferior parietal` (includes angular + supramarginal)

---

### 4.2 tDCS Targets

#### General Principles

| Property | Value |
|----------|-------|
| **Mechanism** | Subthreshold membrane polarization |
| **Anode effect** | Depolarization (increased excitability) |
| **Cathode effect** | Hyperpolarization (decreased excitability) |
| **Typical current** | 1-2 mA |
| **Duration** | 10-20 minutes |

#### DLPFC Montage (Depression)

| Parameter | Setting |
|-----------|---------|
| **Anode** | F3 (left DLPFC) |
| **Cathode** | F4 (right DLPFC) or Fp2 (supraorbital) |
| **Electrode size** | 25-35 cm^2 |
| **Evidence** | Brunoni et al. (2013), meta-analyses support |

#### M1 Montage (Motor/Pain)

| Parameter | Setting |
|-----------|---------|
| **Anode** | C3 (left M1) |
| **Cathode** | C4 (right M1) or Fp2 (supraorbital) |
| **Application** | Chronic pain, motor learning, stroke rehabilitation |

#### Nonsuperficial Targeting

| Target | Optimal Montage | Evidence Source |
|--------|----------------|-----------------|
| **Foot motor cortex** | C4-C3 (cross-hemispheric) | Computational modeling (2024) |
| **dmPFC** | F4-F3 | Finite element modeling |
| **mOFC** | Fp2-F7 | Finite element modeling |
| **Primary visual cortex (V1)** | Oz-Cz | Computational optimization |

#### Validation Notes

- SimNIBS or ROAST should be used for **computational electric field modeling**
- Simple F3/F4 placement may **not reliably target DLPFC** in all individuals
- Individual MRI-guided modeling improves targeting accuracy by ~30-40%

---

### 4.3 tACS Targets

#### General Principles

| Property | Value |
|----------|-------|
| **Mechanism** | Entrainment of endogenous oscillations |
| **Waveform** | Sinusoidal AC, 0-100 Hz typical |
| **Phase-specific** | Yes - peak vs trough have opposite effects |
| **Amplitude** | 0.5-2 mA (peak-to-peak) |

#### Phase-Specific Targeting

| Phase | Degrees | Effect |
|-------|---------|--------|
| **Positive Peak** | 90 degrees | Facilitatory when combined with TMS |
| **Negative Peak (Trough)** | 270 degrees | Inhibitory when combined with TMS |
| **Zero-crossing** | 0/180 degrees | Minimal effect |

#### M1 Beta tACS (Motor Enhancement)

| Parameter | Setting |
|-----------|---------|
| **Target** | Left M1 |
| **Frequency** | 20 Hz (beta) |
| **Target electrode** | 5 x 7 cm over M1 hotspot |
| **Reference electrode** | Pz (midline parietal, 10-20) |
| **Intensity** | 1 mA peak-to-peak |
| **Duration** | 16 minutes |
| **Phase** | Positive peak for facilitatory, trough for inhibitory |

#### Depression Alpha tACS

| Parameter | Setting |
|-----------|---------|
| **Target** | Left and right DLPFC (frontal alpha asymmetry) |
| **Frequency** | 10 Hz (individual alpha) |
| **Anode/Cathode** | F3 and F4 (Cz reference) |
| **Amplitude** | 4 mA at Cz, 2 mA at F3/F4 |
| **Duration** | 40 minutes x 5 days |

#### Key Considerations

1. **Phase precision**: Timing of TMS pulses to specific tACS phase requires real-time monitoring
2. **Individual alpha frequency**: Should be determined individually for alpha protocols
3. **Impedance**: Keep below 5 kOhm
4. **SimNIBS modeling**: Recommended for predicting current distribution

---

### 4.4 taVNS Targets

#### General Principles

| Property | Value |
|----------|-------|
| **Full Name** | Transcutaneous Auricular Vagus Nerve Stimulation |
| **Mechanism** | Afferent vagal pathway via auricular branch |
| **Primary Target** | Tragus or cymba conchae |
| **Control Site** | Earlobe (no vagal innervation) |

#### Anatomical Targets

| Site | Innervation | Evidence |
|------|-------------|----------|
| **Tragus** | Auricular branch of vagus nerve (ABVN) | Highest ABVN density, fMRI activation |
| **Cymba conchae** | ABVN | High ABVN density, alternative target |
| **Cavum conchae** | ABVN + trigeminal | Less specific |
| **Earlobe** | Cervical plexus | Control/sham site |

#### fMRI-Verified Brain Activation

| Region | Activation Pattern |
|--------|-------------------|
| Nucleus tractus solitarius (NTS) | Primary vagal projection |
| Locus coeruleus (LC) | Noradrenergic activation |
| Caudate | Motor/cognitive modulation |
| Cerebellum | Coordination |
| Cingulate cortex | Autonomic/emotional regulation |
| Frontal cortex (MFG, SFG) | Cognitive effects |
| Angular gyrus | Notable consistent activation |

#### Stimulation Parameters

| Parameter | Value |
|-----------|-------|
| **Pulse width** | 250-500 microseconds |
| **Frequency** | 25 Hz |
| **Intensity** | 200% of perceptual threshold |
| **Duration** | 60s ON / 60s OFF (typical block design) |
| **Waveform** | Monophasic square waves |

#### Targeting Method

1. **No MRI targeting required** - peripheral stimulation
2. **fMRI monitoring** can verify central effects
3. **Perceptual threshold** determination at target site
4. **Earlobe control** for sham conditions

---

### 4.5 PBM Targets

#### General Principles

| Property | Value |
|----------|-------|
| **Full Name** | Photobiomodulation / Transcranial Low-Level Light Therapy |
| **Wavelength** | 808-1064 nm (near-infrared) |
| **Mechanism** | Cytochrome C oxidase activation, increased ATP |
| **Primary Effect** | Increased cerebral blood flow, enhanced metabolism |

#### Depression Targeting

| Parameter | Setting |
|-----------|---------|
| **Target** | Bilateral prefrontal cortex |
| **Scalp sites** | AF3/AF4 or F3/F4 |
| **Wavelength** | 808-810 nm (most common) |
| **Irradiance** | 250 mW/cm^2 |
| **Fluence** | 60 J/cm^2 per site |
| **Duration** | ~8 minutes per site |
| **Frequency** | Continuous or pulsed (10 Hz) |

#### Dementia/AD Targeting

| Parameter | Setting |
|-----------|---------|
| **Target** | Default mode network nodes |
| **Scalp sites** | Prefrontal + parietal |
| **Wavelength** | 1064 nm |
| **Fluence** | 60 J/cm^2 |
| **Additional** | Intranasal targeting for deeper structures |

#### Target Regions by Condition

| Condition | Primary Target | Secondary Targets |
|-----------|---------------|-------------------|
| Major Depression | Prefrontal cortex (F3/F4) | Temporal regions |
| Alzheimer's Disease | Precuneus, posterior cingulate | Parietal, lateral temporal |
| TBI | Frontal + temporal regions | Bilateral |
| Parkinson's Disease | Motor cortex, striatum | Limited evidence |

#### Penetration Considerations

| Tissue | Approximate Attenuation |
|--------|------------------------|
| Scalp/skin | Moderate |
| Skull | Major limiting factor |
| CSF | Low |
| Gray matter | Target depth ~1-3 cm |
| White matter | Limited penetration |

**Note**: Hair significantly attenuates light delivery. Targeting limited primarily to prefrontal cortex (patients unlikely to shave hair for temporal/parietal access).

---

### 4.6 TPS Targets

#### General Principles

| Property | Value |
|----------|-------|
| **Full Name** | Transcranial Pulse Stimulation |
| **Mechanism** | Low-intensity ultrasound/acoustic stimulation |
| **Penetration** | Up to 8 cm depth (deeper than TMS/tDCS) |
| **Focality** | High (can target deep structures) |

#### Hippocampus Targeting

| Parameter | Value |
|-----------|---------|
| **Structure** | Hippocampus (anterior/posterior) |
| **MNI Coordinates (anterior)** | +/-22, -14, -19 |
| **MNI Coordinates (posterior)** | +/-28, -30, -10 |
| **Clinical Use** | Alzheimer's disease, MCI, memory enhancement |
| **Atlas Labels** | Brainnetome `Hipp_2_1` (rostral), `Hipp_2_2` (caudal) |

#### Entorhinal Cortex Targeting

| Parameter | Value |
|-----------|---------|
| **Structure** | Entorhinal Cortex |
| **MNI Coordinates** | +/-19, -12, -30 |
| **Brodmann Area** | BA 28/34 |
| **Clinical Use** | Alzheimer's disease (early affected region) |
| **Atlas Labels** | Brainnetome `PhG_6_4` (A28/34), DK `entorhinal` |

#### Precuneus Targeting

| Parameter | Value |
|-----------|---------|
| **Structure** | Precuneus |
| **MNI Coordinates** | +/-6, -63, 51 |
| **Function** | Default mode network hub |
| **Clinical Use** | AD, MCI (DMN restoration) |

#### Other TPS Targets

| Target | MNI Coordinates | Clinical Application |
|--------|----------------|---------------------|
| dlPFC | -42, 28, 26 | Depression, ASD, ADHD |
| rTPJ | +50, -50, 24 | Social cognition, attention |
| Supplementary motor area | -6, -10, 56 | Parkinson's disease |
| Primary motor cortex | -38, -26, 56 | Motor function |

#### Evidence Summary

| Population | Target | Outcomes |
|------------|--------|----------|
| AD/MCI | Precuneus + hippocampus | Improved memory, attention (up to 3 months) |
| MDD | dlPFC | Improved mood symptoms |
| Parkinson's | SMA + M1 | Improved motor function |
| ASD/ADHD (adolescents) | dlPFC + rTPJ | Improved social cognition, attention |

---

## 5. Cross-Reference Tables

### Atlas Coordinate Quick Reference

| Structure | MNI (approx) | AAL3 | Brainnetome | DK | BA |
|-----------|-------------|------|-------------|----|----|
| Left DLPFC | -46, 30, 36 | Mid frontal (ant) | MFG_7_3 (A46) | Rostral mid-frontal | 9/46 |
| Right DLPFC | 46, 30, 36 | Mid frontal (ant) | MFG_R_7_3 | Rostral mid-frontal | 9/46 |
| Left M1 (hand) | -38, -26, 56 | Precentral | PrG_6_3 (A4ul) | Precentral | 4 |
| Left SMA | -6, -10, 56 | Supp motor area | SFG_7_5 (A6m) | Caudal mid-frontal | 6 |
| Left DMPFC | -8, 48, 38 | SFG (medial) | SFG_7_7 (A10m) | Rostral mid-frontal | 10 |
| Left OFC | -36, 36, -14 | Orbital regions | OrG_6_2 (A12/47o) | Lateral orbital | 11/47 |
| Left angular gyrus | -46, -62, 28 | Angular | IPL_6_1 (A39c) | Inferior parietal | 39 |
| Left hippocampus | -22, -14, -19 | Hippocampus | Hipp_2_1 (rHipp) | Hippocampus | - |
| Left entorhinal | -19, -12, -30 | Parahippocampal | PhG_6_4 (A28/34) | Entorhinal | 28/34 |
| Left amygdala | -19, -2, -20 | Amygdala | Amyg_2_1 (mAmyg) | N/A (subcortical) | 34 |
| Left thalamus | -8, -18, 6 | Thalamus | Tha_8_x | N/A (subcortical) | - |
| Precuneus | -6, -63, 51 | Precuneus | PCun_4_1 (A7m) | Precuneus | 7 |
| Left insula | -36, -4, 2 | Insula | INS_6_4 (vId/vIg) | Insula | 13 |
| Left auditory cortex | -54, -32, 12 | STG | STG_6_2 (A41/42) | Transverse temporal | 41/42 |

### Neuromodulation Target Summary

| Modality | Primary Targets | Depth | MRI Required | Neuronavigation |
|----------|----------------|-------|-------------|----------------|
| **TMS** | DLPFC, M1, SMA, OFC | Superficial (~1-2cm) | Recommended | Gold standard |
| **tDCS** | DLPFC, M1 (via scalp EEG) | Superficial (~1-2cm) | Not required | Not applicable |
| **tACS** | M1, DLPFC (oscillatory) | Superficial (~1-2cm) | Not required | Not applicable |
| **taVNS** | Tragus/cymba (peripheral) | N/A (peripheral) | Not required | Not applicable |
| **PBM** | Prefrontal cortex | Superficial (~1-3cm) | Not required | Not applicable |
| **TPS** | Hippocampus, entorhinal, precuneus | Deep (up to 8cm) | Recommended | Recommended |

---

## 6. Implementation Recommendations

### Recommended Atlas Stack

| Priority | Atlas | Use Case |
|----------|-------|----------|
| 1 | **MNI152NLin2009cAsym** | Standard reference space |
| 2 | **AAL3** | Structural ROI labeling |
| 3 | **Brainnetome** | Connectivity-informed targeting |
| 4 | **Schaefer 400 (7-network)** | Functional connectivity analysis |
| 5 | **Harvard-Oxford** | Probabilistic subcortical labeling |
| 6 | **JHU-DTI** | White matter tractography |
| 7 | **fsaverage + DK** | Surface-based cortical analysis |

### Recommended Registration Pipeline

```
Input: Individual T1-weighted MRI

Step 1: Preprocessing
  - Brain extraction (ANTs BrainExtraction or HD-BET)
  - N4 bias field correction
  - Intensity normalization

Step 2: Linear Registration
  - ANTs antsRegistrationSyNQuick.sh (rigid + affine)
  - Target: MNI152NLin2009cAsym
  - Output: Affine transform matrix

Step 3: Nonlinear Registration
  - ANTs SyN (low variance preset)
  - Multi-resolution: 8x4x2x1 shrink factors
  - Convergence: 100x70x50x20 iterations
  - Output: Warp field

Step 4: Atlas Application
  - Apply transforms to all atlases
  - Generate subject-specific labels in native space

Step 5: Quality Assurance
  - Visual inspection of alignment
  - Dice coefficient calculation (if manual labels available)
  - Jacobian determinant check

Step 6: Target Extraction
  - Extract neuromodulation target coordinates
  - Transform MNI targets to native space
  - Generate target masks for stimulation planning
```

### Software Stack

| Function | Recommended Tool | Alternative |
|----------|-----------------|-------------|
| Linear registration | ANTs/FLIRT | SPM Normalize |
| Nonlinear registration | ANTs SyN | SPM DARTEL/SHOOT |
| Surface processing | FreeSurfer 7.x | CAT12 |
| Atlas application | ANTs antsApplyTransforms | FSL applywarp |
| Quality control | MRIQC + visual | ENIGMA QC |
| TMS targeting | Localite/Brainsight/Rogue | MRIcron |
| Electric field modeling | SimNIBS 4.x | ROAST |
| DTI processing | FDT/FSL | MRtrix3 |

### Quality Control Checklist

- [ ] T1w image quality sufficient (no motion, good contrast)
- [ ] Brain extraction clean (no dura, full cerebellum/brainstem)
- [ ] Linear registration visually acceptable (AC, PC, midline aligned)
- [ ] Nonlinear warp has no folding (all Jacobian determinants > 0)
- [ ] Atlas labels overlay correctly on native brain
- [ ] Target coordinates in plausible anatomical location
- [ ] Cross-atlas agreement for critical targets
- [ ] Documentation complete (software versions, parameters, dates)

---

## 7. References

### Atlases

1. Fonov, V., Evans, A.C., et al. (2009, 2011). Unbiased average age-appropriate atlases for pediatric studies. *NeuroImage*.
2. Tzourio-Mazoyer, N., et al. (2002). Automated anatomical labeling of activations in SPM. *NeuroImage*, 15(1), 273-289.
3. Rolls, E.T., et al. (2020). Automated anatomical labelling atlas 3. *NeuroImage*, 206, 116189.
4. Desikan, R.S., et al. (2006). An automated labeling system for subdividing the human cerebral cortex. *NeuroImage*, 31(3), 968-980.
5. Schaefer, A., et al. (2018). Local-Global parcellation of the human cerebral cortex. *Cerebral Cortex*, 28(9), 3095-3114.
6. Fan, L., et al. (2016). The Human Brainnetome Atlas. *Cerebral Cortex*, 26(8), 3508-3528.
7. Destrieux, C., et al. (2010). Automatic parcellation of human cortical gyri and sulci. *NeuroImage*, 53(1), 1-15.
8. Mori, S., et al. (2005). MRI Atlas of Human White Matter. Elsevier.
9. Hua, K., et al. (2008). Tract probability maps in stereotaxic spaces. *NeuroImage*, 39(1), 336-347.

### Registration Methods

10. Avants, B.B., et al. (2011). The optimal template effect in hippocampus studies. *Frontiers in Neuroscience*.
11. Klein, A., et al. (2009). Evaluation of 14 nonlinear deformation algorithms. *NeuroImage*, 46(3), 786-802.
12. Fischl, B. (2004). Automatically parcellating the human cerebral cortex. *Cerebral Cortex*, 14, 11-22.
13. Lancaster, J.L., et al. (2007). Bias between MNI and Talairach coordinates. *Human Brain Mapping*, 28(11), 1194-1205.

### Neuromodulation Targeting

14. Fitzgerald, P.B., et al. (2009). A meta-analysis of TMS for working memory in depression. *J Psychiatry Neurosci*.
15. Herwig, U., et al. (2003). Transcranial magnetic stimulation in therapy studies. *Experimental Brain Research*.
16. Grossheinrich, N., et al. (2009). TMS for depression: coil placement. *European Journal of Neuroscience*.
17. Badran, B.W., et al. (2017). taVNS/fMRI study and review. *Brain Stimulation*.
18. Cassano, P., et al. (2019). Transcranial photobiomodulation for MDD: systematic review. *J Affective Disorders*.
19. Schiffer, F., et al. (2009). Psychological benefits of near-infrared light to the forehead. *Behavioral and Brain Functions*.
20. Neudorfer, C., et al. (2023). A systematic review of TPS. *Brain Stimulation*.
21. Yavari, F., et al. (2021). Phase-specific tACS effects on M1 plasticity. *Scientific Reports*.
22. Moliadze, V., et al. (2019). tACS in depression: RCT. *European Archives of Psychiatry*.

### Coordinate Systems

23. Talairach, J., & Tournoux, P. (1988). Co-planar stereotaxic atlas of the human brain. Thieme.
24. Brett, M., et al. (2002). The problem of functional localization in the brain. *Nature Reviews Neuroscience*.
25. Lancaster, J.L., et al. (2007). Bias between MNI and Talairach coordinates analyzed using the ICBM-152 brain template. *Human Brain Mapping*.

---

## Appendix A: MNI-Talairach Coordinate Conversion

### Lancaster Transform (Recommended)

```python
# Python implementation of icbm2tal
import numpy as np

def icbm2tal_mni2tal(x, y, z):
    """Convert MNI coordinates to Talairach using Lancaster transform."""
    # Linear component
    X = np.array([x, y, z, 1])
    
    # Affine transformation matrix
    M = np.array([
        [0.9254, 0.0020, -0.0118, -1.0207],
        [0.0046, 0.9310, -0.0871, -1.7667],
        [-0.0072, 0.0870,  0.9249,  4.0896],
        [0,      0,       0,       1     ]
    ])
    
    # Apply transformation
    tal = M @ X
    return tal[0], tal[1], tal[2]
```

### Brett Transform (Legacy)

```python
def brett_mni2tal(x, y, z):
    """Convert MNI to Talairach using Brett transform (legacy, less accurate)."""
    if z > 0:
        x = x * 0.99
        y = y * 0.9688 + 0.046
        z = z * 0.9249 + 4.302
    else:
        x = x * 0.99
        y = y * 0.9688 + 0.042
        z = z * 0.9351 + 2.419
    return x, y, z
```

**Note**: Lancaster transform reduces coordinate disparity to ~6.3mm on average vs ~8.5mm for Brett transform.

---

## Appendix B: Atlas Download Sources

| Atlas | Source | URL/Command |
|-------|--------|-------------|
| MNI152NLin2009c | TemplateFlow | `templateflow.api.get('MNI152NLin2009cAsym')` |
| AAL3 | GitHub/SPM | https://github.com/carlosmiguelguerre |  
| Harvard-Oxford | FSL/TemplateFlow | FSL `$FSLDIR/data/atlases` |
| FreeSurfer DK | FreeSurfer | `$FREESURFER_HOME/average/*.gcs` |
| Schaefer | GitHub/TemplateFlow | https://github.com/ThomasYeoLab |
| Brainnetome | Brainnetome Center | http://atlas.brainnetome.org |
| JHU DTI | FSL/TemplateFlow | FSL `$FSLDIR/data/atlases` |

---

*Document generated for DeepSynaps Protocol Studio. For research use only. Not for clinical diagnosis or treatment planning without appropriate clinical validation.*
