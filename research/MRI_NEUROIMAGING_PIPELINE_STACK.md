# MRI Neuroimaging Pipeline Stack — Technical Report

**Prepared by:** DeepSynaps Protocol Studio  
**Date:** 2025-07-18  
**Scope:** Comprehensive evaluation of neuroimaging processing tools for pipeline integration  
**Classification:** Technical Reference / Open Source Tooling Assessment

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Top 10 Pipeline Tools (Ranked)](#2-top-10-pipeline-tools-ranked)
3. [Detailed Tool Evaluations](#3-detailed-tool-evaluations)
   - 3.1 NiBabel
   - 3.2 Nilearn
   - 3.3 MNE-Python
   - 3.4 FSL
   - 3.5 FreeSurfer
   - 3.6 ANTs
   - 3.7 DIPY
   - 3.8 MONAI
   - 3.9 TotalSegmentator
   - 3.10 SynthSeg
   - 3.11 HD-BET
   - 3.12 nnU-Net
   - 3.13 BIDS / pyBIDS
   - 3.14 Nipype
4. [Pipeline Architecture Recommendations](#4-pipeline-architecture-recommendations)
5. [License Compatibility Matrix](#5-license-compatibility-matrix)
6. [GPU Requirements Summary](#6-gpu-requirements-summary)
7. [References](#7-references)

---

## 1. Executive Summary

This report evaluates 14 core tools that constitute the modern MRI neuroimaging processing ecosystem. These tools span the full pipeline from data I/O and organization, through preprocessing and registration, to segmentation, analysis, and AI-driven inference. The evaluation focuses on **license compatibility**, **clinical readiness**, **evidence base**, **integration complexity**, and **computational requirements**.

### Key Findings:

| Finding | Detail |
|---------|--------|
| **License Restrictions** | FSL (non-commercial) and FreeSurfer (open-source but with registration) pose the primary licensing constraints for commercial/clinical deployment. All other tools are permissively licensed (MIT, BSD, Apache 2.0). |
| **GPU Dependency** | 5 of 14 tools require GPU for practical use (MONAI, nnU-Net, TotalSegmentator, HD-BET, SynthSeg GPU mode). Inference-only GPU requirements are lighter (4GB+ VRAM). |
| **Clinical Readiness** | nnU-Net, SynthSeg, and HD-BET have the strongest clinical validation. TotalSegmentator and SuperSynth are emerging as clinical-grade tools. MONAI is enterprise-ready but requires custom model training. |
| **Integration Hub** | Nipype serves as the central orchestration layer, connecting Python-native tools (Nilearn, NiBabel, DIPY, ANTs) with external packages (FSL, FreeSurfer, SPM). |
| **Data Standard** | BIDS (Brain Imaging Data Structure) via pyBIDS is the de facto standard for data organization, enabling interoperability across all modern tools. |

---

## 2. Top 10 Pipeline Tools (Ranked)

Based on clinical relevance, ecosystem integration, evidence base, and deployment readiness:

| Rank | Tool | Category | License | Clinical Status | GPU Required |
|------|------|----------|---------|-----------------|--------------|
| 1 | **NiBabel** | I/O Foundation | MIT | Production-ready | No |
| 2 | **Nipype** | Orchestration | Apache 2.0 | Production-ready | No |
| 3 | **BIDS / pyBIDS** | Data Standard | MIT | Production-ready | No |
| 4 | **Nilearn** | fMRI Analysis | BSD-3-Clause | Production-ready | No |
| 5 | **nnU-Net** | Segmentation | Apache 2.0 | Clinically validated | Yes (train) |
| 6 | **MONAI** | Medical AI Framework | Apache 2.0 | Enterprise-ready | Yes (train) |
| 7 | **SynthSeg** | Auto Segmentation | FreeSurfer (OSS) | Clinically validated | Optional |
| 8 | **FreeSurfer** | Cortical Reconstruction | Open Source | Production-ready | No |
| 9 | **ANTS** | Registration | BSD | Production-ready | No |
| 10 | **HD-BET** | Brain Extraction | Apache 2.0 | Clinically validated | Optional |

**Honorable Mentions:** TotalSegmentator (whole-body CT/MR), DIPY (diffusion MRI), MNE-Python (EEG/MEG), FSL (comprehensive — license constrained)

---

## 3. Detailed Tool Evaluations

---

### 3.1 NiBabel

| Attribute | Detail |
|-----------|--------|
| **Description** | Python library for reading and writing neuroimaging file formats |
| **License** | MIT (plus some BSD-licensed code) |
| **Maintainer** | NiPy community (GitHub: nipy/nibabel) |
| **Clinical Use Status** | Production-ready — foundational infrastructure |
| **Evidence Base** | 2000+ citations; used by virtually all Python neuroimaging packages |
| **GPU Required** | No |
| **Computational Requirements** | Minimal; pure Python with NumPy dependency |

**Supported Formats:** NIfTI-1, NIfTI-2, CIFTI-2, ANALYZE, GIFTI, FreeSurfer (.mgh/.mgz), MINC1/2, AFNI BRIK/HEAD, DICOM (limited), TrackViz .trk

**Integration Path:** Install via `pip install nibabel`. Universal dependency — all Python-based tools in this stack depend on NiBabel for file I/O. Serves as the data interchange layer connecting Python code with outputs from FSL, FreeSurfer, ANTs, and other C/C++ tools.

**Clinical Notes:** Zero clinical risk — pure I/O library. No algorithmic decisions. Enables automated handling of DICOM-to-NIfTI conversion pipelines.

---

### 3.2 Nilearn

| Attribute | Detail |
|-----------|--------|
| **Description** | Python library for fast and easy statistical learning on neuroimaging data |
| **License** | BSD-3-Clause |
| **Maintainer** | INRIA Parietal team (nilearn.github.io) |
| **Clinical Use Status** | Production-ready; widely used in research |
| **Evidence Base** | 1000+ citations; peer-reviewed methods publications |
| **GPU Required** | No |
| **Computational Requirements** | Moderate; depends on scikit-learn, NumPy, SciPy |

**Capabilities:** fMRI decoding, connectivity analysis, connectome visualization, brain parcellations, voxel-based morphometry, multi-voxel pattern analysis (MVPA), GLM modeling, ICA, plotting

**Integration Path:** Install via `pip install nilearn`. Built on NiBabel + scikit-learn. Provides high-level API for fMRI analysis workflows. Integrates with Nipype for pipeline construction. Supports BIDS datasets through pyBIDS.

**Clinical Notes:** Used in clinical neuroimaging research for functional connectivity studies, biomarker discovery, and brain-behavior mapping. Not an FDA-cleared tool but methods are extensively validated.

---

### 3.3 MNE-Python

| Attribute | Detail |
|-----------|--------|
| **Description** | Open-source Python software for exploring, visualizing, and analyzing MEG/EEG data |
| **License** | BSD-3-Clause |
| **Maintainer** | MNE-Python Contributors (mne.tools) |
| **Clinical Use Status** | Production-ready; used in clinical MEG/EEG labs worldwide |
| **Evidence Base** | 500+ citations; Frontiers in Neuroscience 2013 publication; extensive tutorial documentation |
| **GPU Required** | No |
| **Computational Requirements** | Moderate; CPU-bound for most operations. Forward/inverse modeling can be memory-intensive |

**Capabilities:** MEG/EEG preprocessing, source localization (MNE/dSPM), time-frequency analysis, statistical testing, forward modeling, inverse operators, connectivity analysis, BIDS integration (MNE-BIDS)

**MRI Integration:** MNE-Python interfaces with FreeSurfer for cortical surface reconstruction (forward solution generation), reads structural MRI via NiBabel, and supports combined MEG+EEG+MRI analysis pipelines.

**Integration Path:** Install via `pip install mne`. Tight integration with NiBabel, SciPy, Matplotlib, Mayavi. MNE-BIDS package enables BIDS-compliant workflows. MNE-Python can generate source spaces from FreeSurfer output.

**Clinical Notes:** Widely used in epilepsy localization, pre-surgical mapping, and cognitive neuroscience. The MNE software suite (including C++ components) has decades of clinical use.

---

### 3.4 FSL (FMRIB Software Library)

| Attribute | Detail |
|-----------|--------|
| **Description** | Comprehensive library of analysis tools for fMRI, MRI, and DTI brain imaging |
| **License** | **Non-commercial** — FSL License; free for academic/research use |
| **Maintainer** | FMRIB Analysis Group, University of Oxford (fsl.fmrib.ox.ac.uk) |
| **Clinical Use Status** | Research standard; limited direct clinical deployment due to licensing |
| **Evidence Base** | 20,000+ citations; seminal publications (2004, 2009, 2012) |
| **GPU Required** | No (primarily CPU-based) |
| **Computational Requirements** | Moderate-to-high; multi-threading supported. Linux/macOS/WSL |

**Capabilities:** Motion correction (MCFLIRT), brain extraction (BET), registration (FLIRT/FNIRT), segmentation (FAST), ICA (MELODIC), GLM analysis (FEAT), DTI analysis (FDT), tractography, Bayesian modeling

**Integration Path:** Command-line tools with Python wrappers via Nipype (`nipype.interfaces.fsl`). FSL outputs NIfTI files readable by NiBabel. GUIs available for interactive use.

**License Considerations:** FSL is free for non-commercial use only. Commercial use requires a paid license from Oxford University Innovation. This is a critical constraint for commercial clinical deployment. BET, FAST, and FLIRT are among the most widely cited neuroimaging tools.

**Clinical Notes:** FSL is the de facto standard in academic neuroimaging research. However, the non-commercial license limits its integration into commercial clinical products. BET brain extraction has been largely superseded by HD-BET for clinical robustness.

---

### 3.5 FreeSurfer

| Attribute | Detail |
|-----------|--------|
| **Description** | Software suite for processing and analyzing structural and functional brain MRI |
| **License** | Open Source (custom license); free for research and clinical use |
| **Maintainer** | Laboratory for Computational Neuroimaging, Athinoula A. Martinos Center (surfer.nmr.mgh.harvard.edu) |
| **Clinical Use Status** | Production-ready; structural MRI analysis software of choice for Human Connectome Project |
| **Evidence Base** | 30,000+ citations; foundational neuroimaging methods |
| **GPU Required** | No (CPU-based; SynthSeg component supports GPU) |
| **Computational Requirements** | High; recon-all can take 8-24 hours per subject. Multi-threading supported. Linux/macOS |

**Capabilities:** Cortical surface reconstruction, subcortical segmentation, cortical parcellation (Desikan-Killiany, Destrieux), longitudinal analysis, group analysis, tractography integration, fMRI surface mapping, thickness measurement

**Integration Path:** FreeSurfer outputs are read via NiBabel (.mgh, .mgz, surface files). Nipype provides interfaces (`nipype.interfaces.freesurfer`). SynthSeg provides deep learning-based segmentation within FreeSurfer (v7.3.2+).

**License Considerations:** Free and open source for both research and clinical use. Registration required for download. No commercial licensing restrictions. Permissive enough for clinical deployment.

**Clinical Notes:** recon-all pipeline is the gold standard for cortical surface analysis. SynthSeg integration (since v7.3.2) adds deep learning segmentation without retraining. SuperSynth extends capabilities to ex vivo and low-field scans.

---

### 3.6 ANTs (Advanced Normalization Tools)

| Attribute | Detail |
|-----------|--------|
| **Description** | High-dimensional image registration and segmentation toolkit |
| **License** | BSD (permissive; allows commercial use) |
| **Maintainer** | Penn Image Computing and Science Lab (PICSL) (github.com/ANTsX/ANTs) |
| **Clinical Use Status** | Production-ready; top performer in registration benchmarks |
| **Evidence Base** | 10,000+ citations; top-ranked in independent registration evaluations (14-method comparison) |
| **GPU Required** | No |
| **Computational Requirements** | High for diffeomorphic registration; multi-threading supported. Linux/macOS/Windows |

**Capabilities:** Symmetric diffeomorphic normalization (SyN), affine/rigid registration, optimal template construction, multivariate similarity metrics, N4 bias correction, cortical thickness pipeline, multivariate image segmentation, diffusion tensor warping

**Integration Path:** Command-line tools with Python wrappers via ANTsPy (`pip install antspyx`) and Nipype (`nipype.interfaces.ants`). Outputs NIfTI files. ANTs registration is called from within many pipelines (fMRIPrep, Pypes).

**Clinical Notes:** ANTs is widely used for cross-subject registration, longitudinal analysis, and atlas-based segmentation. The SyN diffeomorphic registration is considered among the best available. N4 bias correction has replaced N3 in most clinical pipelines.

---

### 3.7 DIPY

| Attribute | Detail |
|-----------|--------|
| **Description** | Open-source software project for analysis of diffusion MRI data |
| **License** | BSD (part of NiPy ecosystem) |
| **Maintainer** | DIPY community (dipy.org) |
| **Clinical Use Status** | Production-ready; standard for dMRI analysis in Python |
| **Evidence Base** | 2000+ citations; Frontiers in Neuroinformatics 2014 publication |
| **GPU Required** | No |
| **Computational Requirements** | Moderate-to-high; parallel processing supported. Memory-intensive for large datasets |

**Capabilities:** Diffusion tensor imaging (DTI), constrained spherical deconvolution (CSD), diffusion spectrum imaging (DSI), probabilistic/deterministic tractography, fiber tracking, streamline clustering, connectivity matrices, denoising, motion correction

**Integration Path:** Install via `pip install dipy`. Built on NumPy, SciPy, Cython. Uses NiBabel for file I/O. Nipype interfaces available. Integrates with FreeSurfer for anatomically-constrained tractography.

**Clinical Notes:** DIPY is the standard toolkit for diffusion MRI analysis. Used in clinical studies of stroke, traumatic brain injury, neurodegeneration, and neurosurgical planning. Connectome Mapper integrates DIPY into full dMRI processing pipelines.

---

### 3.8 MONAI (Medical Open Network for AI)

| Attribute | Detail |
|-----------|--------|
| **Description** | PyTorch-based, open-source framework for deep learning in medical imaging |
| **License** | Apache 2.0 |
| **Maintainer** | Project MONAI (monai.io) — NVIDIA, KCL, and community |
| **Clinical Use Status** | Enterprise-ready; deployed on 15,000+ clinical devices globally |
| **Evidence Base** | Rapidly growing; backed by NVIDIA and major academic centers |
| **GPU Required** | **Yes** — training requires GPU; inference can use CPU |
| **Computational Requirements** | High for training; moderate for inference. PyTorch ecosystem |

**Capabilities:** Domain-specific data handling (DICOM, NIfTI), 3D/4D transforms, sliding window inference, pre-built networks (U-Net, VNet, UNETR), medical loss functions (Dice, Tversky, Focal), Auto3dseg, MONAI Bundles, MONAI Deploy, distributed training, C++/CUDA optimized modules

**Integration Path:** Install via `pip install monai`. Built on PyTorch. Integrates with NiBabel for NIfTI/DICOM I/O. MONAI Deploy enables containerized clinical deployment. Compatible with BIDS through Python wrappers.

**Clinical Notes:** MONAI is the leading framework for building clinical AI models. Auto3dseg automates 3D segmentation pipeline configuration. MONAI Deploy packages models as containerized applications for clinical integration. Deployed via Siemens Healthineers globally.

**GPU Specifications:**
| Mode | Minimum VRAM | Recommended |
|------|-------------|-------------|
| Training (3D U-Net) | 8-11 GB | 24+ GB (RTX 3090/A100) |
| Inference (sliding window) | 4 GB | 8+ GB |
| Auto3dseg | 16 GB | 40+ GB (A100) |

---

### 3.9 TotalSegmentator

| Attribute | Detail |
|-----------|--------|
| **Description** | Deep learning tool for robust segmentation of 104+ anatomic structures in CT and MR images |
| **License** | Apache 2.0 |
| **Maintainer** | University Hospital Basel (github.com/wasserth/TotalSegmentator) |
| **Clinical Use Status** | Research-validated; part of several FDA-approved products |
| **Evidence Base** | Radiology publication; trained on 1204 CT + 616 MR; Dice 0.943 on test set |
| **GPU Required** | **Optional** — GPU strongly recommended; CPU supported with `--fast` |
| **Computational Requirements** | RTX 3090 reference: ~20s (1.5mm) / ~5s (3mm fast). 12GB VRAM recommended |

**Capabilities:** Segmentation of 117 classes (organs, bones, muscles, vessels) from CT and MRI; supports whole-body imaging; DICOM and NIfTI input; statistics generation; radiomics features; Docker containerized deployment

**Integration Path:** Install via `pip install TotalSegmentator`. PyTorch-based (built on nnU-Net). Runs via command line or Python API. Docker images available. Integrates with 3D Slicer. Online processing available at totalsegmentator.com.

**Runtime (RTX 3090):**
| Mode | Resolution | Runtime | VRAM |
|------|-----------|---------|------|
| Normal | 1.5mm | ~20s | ~12GB |
| Fast | 3.0mm | ~5s | ~4GB |

**Clinical Notes:** Not a medical device itself but is integrated into FDA-approved products as a component. Performs robustly across different scanners, institutions, and protocols. Supports both CT and MRI (total_mr task). Web applications available for clinical metrics (Evans Index, aorta diameter, organ volumetry).

---

### 3.10 SynthSeg

| Attribute | Detail |
|-----------|--------|
| **Description** | CNN for segmentation of brain MRI scans of any contrast and resolution without retraining |
| **License** | FreeSurfer open source license |
| **Maintainer** | Billot, Iglesias et al., Harvard/MGH (FreeSurfer) |
| **Clinical Use Status** | Production-ready since FreeSurfer v7.3.2 |
| **Evidence Base** | Medical Image Analysis 2023; PNAS 2023 (robust mode); 5000+ scans validated |
| **GPU Required** | **Optional** — CPU: ~2 min/scan; GPU: ~6 sec/scan |
| **Computational Requirements** | Minimal; 4GB VRAM sufficient for GPU mode. Any modern CPU works |

**Capabilities:** Whole-brain segmentation, cortical parcellation, automated QC, intracranial volume estimation, robust mode for low-quality scans, WMH-SynthSeg for white matter lesions, SuperSynth for ex vivo/low-field

**Integration Path:** Included in FreeSurfer (v7.3.2+). Command: `mri_synthseg`. Standalone Python version available. Outputs segmentations at 1mm isotropic regardless of input resolution.

**Clinical Notes:** SynthSeg is the first segmentation tool that works across any contrast and resolution without retraining. Trained on synthetic data with domain randomization. Validated on 5000+ scans across 6 modalities and 10 resolutions. WMH-SynthSeg adds white matter hyperintensity segmentation. SuperSynth extends to ex vivo, single hemispheres, and low-field MRI.

---

### 3.11 HD-BET (High-Dimensional Brain Extraction Tool)

| Attribute | Detail |
|-----------|--------|
| **Description** | Deep learning brain extraction algorithm robust to pathology and multi-sequence MRI |
| **License** | Apache 2.0 |
| **Maintainer** | MIC-DKFZ Heidelberg (github.com/MIC-DKFZ/HD-BET) |
| **Clinical Use Status** | Clinically validated; outperforms 6 traditional methods |
| **Evidence Base** | Human Brain Mapping 2019; validated on multicenter neuro-oncology trial (EORTC-26101) |
| **GPU Required** | **Optional** — GPU: <5s; CPU: ~32s (with `--disable_tta`) |
| **Computational Requirements** | GPU: any CUDA-capable GPU with 4GB+ VRAM. CPU: significant RAM required |

**Capabilities:** Brain extraction (skull stripping) from T1w, cT1w, T2w, FLAIR MRI; robust to pathology (tumors, lesions, atrophy); works across MRI vendors and field strengths; ensemble of 5 models with test-time augmentation

**Integration Path:** Install via `pip install HD-BET` or from GitHub. PyTorch-based. Command-line tool and Python API. Input must be MNI152-oriented NIfTI.

**Performance (Median Dice on EORTC test set):**
| Sequence | Dice | HD95 (mm) |
|----------|------|-----------|
| T1w | 97.6 | 2.7 |
| cT1w | 96.9 | 3.2 |
| FLAIR | 96.4 | 4.2 |
| T2w | 96.1 | 4.4 |

**Clinical Notes:** HD-BET significantly outperforms FSL BET, ROBEX, BEaST, 3dSkullStrip, BSE, and MONSTR in the presence of pathology. Trained on 6,586 MRI sequences from 25 institutions. Essential preprocessing component for clinical neuro-oncology pipelines.

---

### 3.12 nnU-Net

| Attribute | Detail |
|-----------|--------|
| **Description** | Self-configuring deep learning framework for medical image segmentation |
| **License** | Apache 2.0 |
| **Maintainer** | MIC-DKFZ Heidelberg (Isensee et al.; github.com/MIC-DKFZ/nnUNet) |
| **Clinical Use Status** | De facto standard for medical segmentation; clinically validated |
| **Evidence Base** | Nature Methods 2021; 5000+ citations; dominates medical segmentation benchmarks |
| **GPU Required** | **Yes for training** (10GB+); inference needs 4GB+ |
| **Computational Requirements** | Training: strong GPU + CPU (6+ cores). Inference: GPU recommended, CPU manageable |

**Capabilities:** Automatic hyperparameter configuration, 2D/3D/cascade U-Net, 5-fold cross-validation, built-in preprocessing, post-processing, ensemble inference, transfer learning

**Integration Path:** Install via `pip install nnunetv2`. PyTorch-based. Command-line interface for training and inference. Python API available. Many tools build on nnU-Net (TotalSegmentator, HD-BET derivatives).

**GPU Specifications:**
| Mode | Minimum VRAM | Recommended |
|------|-------------|-------------|
| Training | 10-11 GB | 24+ GB (RTX 3090/4090) |
| Inference | 4 GB | 8+ GB |
| CPU Inference | N/A | 6+ cores, 32GB+ RAM |

**Clinical Notes:** nnU-Net is the most widely used medical image segmentation framework. Automatically adapts to dataset characteristics without manual hyperparameter tuning. Underlying architecture for TotalSegmentator, HD-BET variants, and numerous clinical segmentation models. Won 49/96 challenges at time of publication.

---

### 3.13 BIDS / pyBIDS

| Attribute | Detail |
|-----------|--------|
| **Description** | Brain Imaging Data Structure — standard for organizing neuroimaging data |
| **License** | MIT (pyBIDS) |
| **Maintainer** | BIDS Community (bids.neuroimaging.io) |
| **Clinical Use Status** | Production-ready; industry standard |
| **Evidence Base** | Scientific Data 2016 (Gorgolewski et al.); 1000+ citations; adopted by major initiatives |
| **GPU Required** | No |
| **Computational Requirements** | Minimal; pure Python |

**Capabilities:** Standardized file naming and directory structure, machine-readable metadata (JSON sidecars), query/validation tools, programmatic data access, compatibility with all major neuroimaging tools

**pyBIDS Features:** BIDSLayout for file querying, metadata retrieval, report generation, BIDS validation integration, StatsModel support, automatic Methods section generation

**Integration Path:** Install via `pip install pybids`. Core dependency of fMRIPrep, MRIQC, FitLins, MNE-BIDS, and dozens of other tools. All modern neuroimaging pipelines are designed around BIDS.

**Clinical Notes:** BIDS is the de facto data standard for neuroimaging. Enables reproducibility, data sharing (OpenNeuro), and automated pipeline processing. BIDS Apps provide containerized analysis pipelines that work on any BIDS dataset.

---

### 3.14 Nipype

| Attribute | Detail |
|-----------|--------|
| **Description** | Python framework for integration of neuroimaging software packages into pipelines |
| **License** | Apache 2.0 |
| **Maintainer** | NiPy community (nipype.readthedocs.io) |
| **Clinical Use Status** | Production-ready; foundation for fMRIPrep, MRIQC |
| **Evidence Base** | Frontiers in Neuroinformatics 2011; 2000+ citations |
| **GPU Required** | No |
| **Computational Requirements** | Moderate; Python-based with workflow engine |

**Capabilities:** Unified interfaces to FSL, SPM, ANTs, FreeSurfer, AFNI, DIPY, and more; workflow construction via directed acyclic graphs; parallel execution; provenance tracking; caching; DataSink output management

**Integration Path:** Install via `pip install nipype`. Python API for pipeline construction. Nodes encapsulate tools, Workflows connect nodes into DAGs. fMRIPrep and MRIQC are built on Nipype. Pydra (Nipype 2.0) provides next-generation engine.

**Supported Tool Interfaces:**
| Tool | Interface | Notes |
|------|-----------|-------|
| FSL | `nipype.interfaces.fsl` | Full coverage of FSL commands |
| FreeSurfer | `nipype.interfaces.freesurfer` | recon-all and more |
| ANTs | `nipype.interfaces.ants` | Registration and segmentation |
| SPM | `nipype.interfaces.spm` | MATLAB-based |
| AFNI | `nipype.interfaces.afni` | Analysis tools |
| DIPY | `nipype.interfaces.dipy` | dMRI workflows |
| Nilearn | Direct Python | Native integration |

**Clinical Notes:** Nipype is the backbone of modern reproducible neuroimaging pipelines. fMRIPrep (built on Nipype) is the most widely used preprocessing pipeline. Pydra provides containerized execution support essential for clinical deployment.

---

## 4. Pipeline Architecture Recommendations

### Recommended Pipeline Stack

```
Data Layer:
  BIDS (pyBIDS)         -- Data organization and querying
  NiBabel               -- NIfTI/ANALYZE/CIFTI I/O

Preprocessing:
  HD-BET                -- Brain extraction (replaces FSL BET)
  ANTs                  -- Registration (SyN) + N4 bias correction
  FreeSurfer            -- Cortical surface reconstruction (optional)
  SynthSeg              -- Automated segmentation (FreeSurfer-based)

Analysis:
  Nilearn               -- fMRI connectivity, GLM, decoding
  DIPY                  -- dMRI tractography, connectivity
  MNE-Python            -- EEG/MEG analysis (with MRI coregistration)

AI/Deep Learning:
  MONAI                 -- Custom model development, training
  nnU-Net               -- Segmentation model training
  TotalSegmentator      -- Whole-body CT/MR segmentation

Orchestration:
  Nipype / Pydra        -- Pipeline workflow management
```

### Clinical Deployment Notes

1. **License-Safe Pipeline:** For commercial deployment, exclude FSL (non-commercial license). Use HD-BET instead of BET, ANTs instead of FSL registration, and SynthSeg/nnU-Net for segmentation.

2. **GPU Strategy:** GPU inference needs are modest (4-8GB VRAM). Training requires 24GB+ VRAM. Consider cloud-based training with local inference deployment.

3. **Containerization:** All tools support Docker containerization. MONAI Deploy and BIDS Apps provide clinical-ready container packaging.

4. **Data Flow:** BIDS -> pyBIDS queries -> Nipype workflows -> NiBabel I/O -> Analysis/AI tools -> BIDS derivatives output

---

## 5. License Compatibility Matrix

| Tool | License | Commercial Use | Clinical Use | Redistribution | Notes |
|------|---------|---------------|--------------|----------------|-------|
| NiBabel | MIT | Yes | Yes | Yes | Permissive |
| Nilearn | BSD-3 | Yes | Yes | Yes | Permissive |
| MNE-Python | BSD-3 | Yes | Yes | Yes | Permissive |
| FSL | **Non-Commercial** | **No (paid)** | Limited | Restricted | Academic/research only |
| FreeSurfer | Open Source | Yes | Yes | Yes | Registration required |
| ANTs | BSD | Yes | Yes | Yes | Permissive |
| DIPY | BSD | Yes | Yes | Yes | Permissive |
| MONAI | Apache 2.0 | Yes | Yes | Yes | Patent grant included |
| TotalSegmentator | Apache 2.0 | Yes | Yes | Yes | Not a medical device |
| SynthSeg | FreeSurfer OSS | Yes | Yes | Yes | Via FreeSurfer |
| HD-BET | Apache 2.0 | Yes | Yes | Yes | Permissive |
| nnU-Net | Apache 2.0 | Yes | Yes | Yes | Permissive |
| BIDS/pyBIDS | MIT | Yes | Yes | Yes | Open standard |
| Nipype | Apache 2.0 | Yes | Yes | Yes | Permissive |

---

## 6. GPU Requirements Summary

| Tool | Training GPU | Inference GPU | Minimum VRAM | Notes |
|------|-------------|---------------|--------------|-------|
| NiBabel | N/A | N/A | None | CPU only |
| Nilearn | N/A | N/A | None | CPU only |
| MNE-Python | N/A | N/A | None | CPU only |
| FSL | N/A | N/A | None | CPU only |
| FreeSurfer | N/A | N/A | None | CPU only |
| ANTs | N/A | N/A | None | CPU only |
| DIPY | N/A | N/A | None | Optional parallel |
| MONAI | 16-40 GB | 4-8 GB | 4 GB (inf) | PyTorch |
| TotalSegmentator | N/A (pretrained) | 4-12 GB | 4 GB (fast) | PyTorch |
| SynthSeg | N/A (pretrained) | ~4 GB | Optional | CPU: ~2min |
| HD-BET | N/A (pretrained) | ~4 GB | Optional | CPU: ~32s |
| nnU-Net | 10-24 GB | 4-8 GB | 4 GB (inf) | PyTorch |
| BIDS/pyBIDS | N/A | N/A | None | CPU only |
| Nipype | N/A | N/A | None | Orchestration |

---

## 7. References

1. NiBabel: https://nipy.org/nibabel/ — MIT License
2. Nilearn: https://nilearn.github.io/ — Abraham et al., 2014
3. MNE-Python: https://mne.tools/ — Gramfort et al., 2013, Frontiers in Neuroscience
4. FSL: https://fsl.fmrib.ox.ac.uk/ — Smith et al., 2004; Jenkinson et al., 2012
5. FreeSurfer: https://surfer.nmr.mgh.harvard.edu/ — Fischl, 2012
6. ANTs: https://github.com/ANTsX/ANTs — Avants et al., 2011
7. DIPY: https://dipy.org/ — Garyfallidis et al., 2014, Frontiers in Neuroinformatics
8. MONAI: https://monai.io/ — Project MONAI, Apache 2.0
9. TotalSegmentator: https://github.com/wasserth/TotalSegmentator — Wasserthal et al., 2023, Radiology
10. SynthSeg: https://surfer.nmr.mgh.harvard.edu/fswiki/SynthSeg — Billot et al., 2023, Medical Image Analysis
11. HD-BET: https://github.com/MIC-DKFZ/HD-BET — Kleesiek et al., 2019, Human Brain Mapping
12. nnU-Net: https://github.com/MIC-DKFZ/nnUNet — Isensee et al., 2021, Nature Methods
13. BIDS: https://bids.neuroimaging.io/ — Gorgolewski et al., 2016, Scientific Data
14. pyBIDS: https://github.com/bids-standard/pybids — Yarkoni et al., 2019
15. Nipype: https://nipype.readthedocs.io/ — Gorgolewski et al., 2011
16. WMH-SynthSeg: https://surfer.nmr.mgh.harvard.edu/fswiki/WMH-SynthSeg — Laso et al., 2024, ISBI
17. SuperSynth: https://surfer.nmr.mgh.harvard.edu/fswiki/SuperSynth — Iglesias et al., 2025

---

*Report generated by DeepSynaps Protocol Studio — Neuroimaging Pipeline Research Division*
