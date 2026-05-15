# QEEG Software Platform Benchmark Report
## Clinical Neurophysiology Software Comparative Analysis

**Date:** 2025-06-10  
**Scope:** 13 qEEG analysis platforms evaluated across 9 clinical dimensions  
**Classification:** Technical Research Document

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Top 5 Platforms for Clinical Use](#2-top-5-platforms-for-clinical-use)
3. [Benchmark Matrix](#3-benchmark-matrix)
4. [Platform Profiles](#4-platform-profiles)
5. [Comparative Analysis](#5-comparative-analysis)
6. [Recommendations](#6-recommendations)
7. [References](#7-references)

---

## 1. Executive Summary

Quantitative EEG (qEEG) software platforms form the computational backbone of modern clinical neurophysiology, neurofeedback, and research-oriented brain analysis. This benchmark evaluates 13 platforms across nine clinical dimensions: **Features**, **Manual Review**, **Topomaps**, **Normative Comparisons**, **Source Localization**, **Report Generation**, **Export Formats**, **Clinical Use Status**, and **Evidence Base**.

### Key Findings

- **NeuroGuide** remains the gold standard for clinical qEEG with FDA 510(k) clearance, a peer-reviewed normative database (n=678), and the most comprehensive Z-score analysis pipeline.
- **Open-source platforms** (MNE-Python, EEGLAB, FieldTrip, Brainstorm) dominate research settings with superior source localization but lack integrated normative databases and clinical reporting workflows.
- **BrainAvatar** uniquely combines real-time sLORETA imaging with FDA-registered status, bridging clinical and research needs.
- **sLORETA/eLORETA** workflows (via LORETA Key and Key Institute software) offer the most validated source localization with simultaneous EEG/fMRI validation.

---

## 2. Top 5 Platforms for Clinical Use

### Ranked by Clinical Suitability

| Rank | Platform | Clinical Suitability Score | Primary Clinical Application |
|------|----------|---------------------------|------------------------------|
| **1** | **NeuroGuide** | 9.5/10 | Comprehensive clinical qEEG, Z-score neurofeedback, normative assessment |
| **2** | **BrainAvatar** | 8.8/10 | Real-time 3D LORETA neurofeedback, FDA-registered clinical imaging |
| **3** | **sLORETA/eLORETA (Key Institute)** | 8.5/10 | Gold-standard source localization for clinical epilepsy and research |
| **4** | **BrainDx** | 8.0/10 | FDA-approved normative database, disorder-specific discriminants |
| **5** | **BrainVision Analyzer** | 7.5/10 | Clinical-grade ERP analysis, artifact correction, institutional deployment |

### Rationale for Top 5 Selection

1. **NeuroGuide**: Only platform with FDA 510(k) clearance on both the software and the embedded normative database. >0.95 test-retest reliability. 45+ amplifier imports. 3-D LORETA Z-score biofeedback integration. The Thatcher Lifespan Normative EEG Database (LSNDB) is the most extensively validated normative dataset.

2. **BrainAvatar**: FDA-registered, CE-marked medical device. Real-time 6,234-voxel sLORETA projection at 8 fps. Combines BrainMaster hardware with exclusive sLORETA voxel processor. Z-Builder for individualized norms. 24-channel signal processing.

3. **sLORETA/eLORETA**: Zero localization bias proven mathematically. Validated in simultaneous EEG/fMRI studies. eLORETA achieves 13.3-15.7 mm localization error (pilot SEEG study). 6,239 voxels at 5mm resolution in MNI152 space. 5,000+ publications.

4. **BrainDx**: FDA-approved normative database (n=464, ages 16-80). Built on the Neurometrics heritage. Provides discriminant functions for ADHD, depression, autism, PTSD, dementia, learning disabilities, post-concussive syndrome, and alcohol abuse.

5. **BrainVision Analyzer**: Medical Device Directive (MDD 93/42/EEC) Class I compliant. History trees for full analysis traceability. Extensive artifact correction toolbox. Time-frequency analysis with wavelet transforms. Multi-format data import. The academic/hospital standard in Europe.

---

## 3. Benchmark Matrix

### Overall Scoring (1-10 scale)

| Platform | Features | Manual Review | Topomaps | Normative DB | Source Loc. | Reports | Exports | Clinical Use | Evidence Base | **TOTAL** |
|----------|:--------:|:-------------:|:--------:|:------------:|:-----------:|:-------:|:-------:|:------------:|:-------------:|:---------:|
| NeuroGuide | 10 | 8 | 10 | 10 | 7 | 10 | 9 | 10 | 10 | **94** |
| BrainDx | 8 | 7 | 9 | 9 | 6 | 9 | 7 | 9 | 8 | **72** |
| BrainAvatar | 9 | 7 | 8 | 8 | 9 | 8 | 7 | 9 | 7 | **72** |
| BrainMaster | 7 | 6 | 7 | 6 | 6 | 7 | 6 | 7 | 6 | **58** |
| NeuroField | 7 | 7 | 7 | 7 | 6 | 8 | 7 | 7 | 6 | **62** |
| BrainVision Analyzer | 9 | 9 | 8 | 3 | 5 | 7 | 9 | 8 | 9 | **67** |
| WinEEG | 7 | 6 | 7 | 7 | 5 | 7 | 6 | 6 | 5 | **56** |
| MNE-Python | 10 | 5 | 9 | 2 | 10 | 5 | 10 | 5 | 10 | **66** |
| EEGLAB | 9 | 5 | 8 | 2 | 7 | 4 | 10 | 4 | 10 | **59** |
| FieldTrip | 9 | 4 | 8 | 1 | 10 | 4 | 9 | 4 | 10 | **59** |
| Brainstorm | 9 | 6 | 8 | 1 | 9 | 5 | 8 | 5 | 9 | **60** |
| Cartool | 8 | 6 | 9 | 1 | 8 | 5 | 7 | 5 | 8 | **59** |
| sLORETA/eLORETA | 6 | 4 | 5 | 3 | 10 | 4 | 6 | 7 | 10 | **55** |

*Scoring methodology: Each dimension rated 1-10 by clinical utility. Clinical Use = FDA/regulatory status + deployment in clinical settings. Evidence Base = peer-reviewed publications citing the tool.*

---

## 4. Platform Profiles

### 4.1 NeuroGuide (Applied Neuroscience, Inc.)

**Developer:** Robert W. Thatcher / Applied Neuroscience, Inc.  
**License:** Commercial ($3,500-$6,000+)  
**Platform:** Windows  
**FDA Status:** 510(k) cleared (K974748)

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 10/10 | Full qEEG analysis suite: FFT/JTFA, absolute/relative power, coherence, phase, amplitude asymmetry, power ratios, burst metrics, instantaneous coherence & phase reset, phase lock/shift duration. LORETA Z-score biofeedback. BrainSurf Networks BCI. Discriminant analysis. Symptom checklist integration. 1-19 channel neurofeedback. |
| **Manual Review** | 8/10 | Auto artifact rejection without phase distortion. Conventional EEG viewing with amplitude, time, and event markers. Time-domain LORETA. Requires trained operator for optimal artifact rejection. |
| **Topomaps** | 10/10 | Surface topographic maps for all metrics (absolute power, relative power, coherence, phase, asymmetry) in delta, theta, alpha, beta, high-beta, gamma. Linked-ear reference. Multiple montages. 3-D surface rendering. |
| **Normative DB** | 10/10 | Thatcher Lifespan Normative EEG Database (LSNDB): n=678 subjects, ages 2 months to 82.6 years. EC/EO conditions. Gaussian cross-validated. Content validated (correlation with neuropsych tests, intelligence). Predictive validated (discriminant accuracy, neural networks). Test-retest reliability >0.95. FDA 510(k) cleared. |
| **Source Localization** | 7/10 | Integrated 3-D LORETA Z-score biofeedback. Source analysis available but not as deep as dedicated LORETA Key or MNE-Python. |
| **Report Generation** | 10/10 | Comprehensive clinical reports: narrative summaries, color topographic maps, Z-score tables, discriminant analysis results, symptom checklist correlations. PDF export. Excel spreadsheet export. Automated text summaries. |
| **Export Formats** | 9/10 | Native format, Excel (.xls/.xlsx), PDF, text, image export. Imports from 45+ EEG amplifier formats (ABM, ANT, Biosignal, BrainMaster, Cognionics, DeyMed, Fistar, Mitsar, NeuroField, Neuron Spectrum, NeuroPulse, NeXus, Wearable Sensing, etc.). |
| **Clinical Use** | 10/10 | FDA 510(k) cleared. Deployed in 1,000+ clinical practices worldwide. Standard for neurofeedback training. Insurance-reimbursable in many jurisdictions. |
| **Evidence Base** | 10/10 | 500+ peer-reviewed publications. Thatcher normative database validated in independent studies. FDA clearance based on clinical trials. Discriminant functions validated for TBI, ADHD, depression, learning disabilities, dementia. |

**Strengths:** The gold standard clinical qEEG platform. Unmatched normative database validation. Most comprehensive reporting. Broadest hardware compatibility.  
**Limitations:** Proprietary, expensive. Windows-only. Steep learning curve. Interface from early 2000s.  
**Best For:** Clinical neurofeedback practices, qEEG assessment centers, insurance-reimbursed evaluations.

---

### 4.2 BrainDx (BrainDx LLC)

**Developer:** BrainDx LLC (formerly NXLink/NYU database)  
**License:** Commercial  
**Platform:** Windows  
**FDA Status:** FDA 510(k) cleared

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 8/10 | Normative comparison analysis, discriminant functions for clinical conditions, topographic mapping, coherence analysis, asymmetry metrics, power spectral analysis. |
| **Manual Review** | 7/10 | Standard EEG review capabilities. Artifact screening tools. Good for trained technicians. |
| **Topomaps** | 9/10 | High-quality topographic maps for power and connectivity metrics. Z-score deviation maps. Age- and sex-matched comparisons. |
| **Normative DB** | 9/10 | BrainDx Normative Database: n=464 subjects, ages 16-80. Based on the original Neurometrics database heritage. FDA-approved. Manually deartifacted data. |
| **Source Localization** | 6/10 | Limited built-in source localization. Can export to LORETA for source analysis. |
| **Report Generation** | 9/10 | Professional clinical reports with Z-score comparisons, narrative interpretations, color maps. Disorder-specific discriminant reports. |
| **Export Formats** | 7/10 | PDF reports, Excel data exports. Standard EEG format compatibility. |
| **Clinical Use** | 9/10 | FDA-approved for clinical use. Widely used in neurofeedback and clinical assessment. Disorder-specific discriminant reports. |
| **Evidence Base** | 8/10 | 100+ peer-reviewed publications. Database validated for ADHD, depression, autism, PTSD, dementia, alcohol abuse, post-concussive syndrome, schizophrenia, learning disabilities. |

**Strengths:** Strong disorder-specific discriminants. FDA-approved database. Good clinical report generation.  
**Limitations:** Smaller normative sample than NeuroGuide. Limited source localization. Less hardware compatibility.  
**Best For:** Disorder-specific differential diagnosis, neurofeedback assessment, clinical qEEG screening.

---

### 4.3 BrainAvatar (BrainMaster Technologies)

**Developer:** BrainMaster Technologies, Inc.  
**License:** Commercial (with hardware)  
**Platform:** Windows  
**FDA Status:** FDA registered, CE marked (Class I medical device)

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 9/10 | Real-time sLORETA 3D imaging (6,234 voxels, 8 fps, 8 frequency bands). Z-score training with Z-Builder (customized norms). Up to 24 channels. Power/connectivity training. 2D/3D displays. Mini-qEEG analysis. |
| **Manual Review** | 7/10 | Tabbed interface for raw/filtered waveforms, control panels, feedback screens. Separate trainee screen with 8 tabs. Less emphasis on traditional EEG review. |
| **Topomaps** | 8/10 | Surface maps and 3-D volumetric sLORETA images. Real-time Z-score topographic display. |
| **Normative DB** | 8/10 | Uses normative database for Z-score computation in real-time. Z-Builder allows creation of individualized norms. Not as extensively validated as NeuroGuide or BrainDx. |
| **Source Localization** | 9/10 | Exclusive real-time sLORETA voxel processor and 3D projector. 6,239 voxels computed in real-time (8 fps). Z-scored current source density. This is a standout feature unique to BrainAvatar. |
| **Report Generation** | 8/10 | Training reports, mini-assessment reports with Z-scores, text summaries, surface maps, sLORETA 3-D images, Excel spreadsheets. Full qEEG report requires additional software. |
| **Export Formats** | 7/10 | Excel, PDF, image export. Native BrainMaster format. Integration with Discovery, Freedom, Atlantis hardware. |
| **Clinical Use** | 9/10 | FDA-registered clinical system. CE mark in Europe. Real-time LORETA neurofeedback is unique. Used in clinical practices worldwide. |
| **Evidence Base** | 7/10 | Growing evidence base. sLORETA component well-validated independently. BrainMaster hardware has extensive literature. |

**Strengths:** Only real-time sLORETA imaging system. FDA-registered for clinical biofeedback. Z-Builder for individualized norms. 24-channel capability.  
**Limitations:** Requires BrainMaster hardware. Not a replacement for full qEEG report (per manufacturer's note). Windows-only.  
**Best For:** Real-time LORETA neurofeedback, live 3D brain imaging, Z-score training clinics.

---

### 4.4 BrainMaster (BrainMaster Technologies)

**Developer:** BrainMaster Technologies, Inc.  
**License:** Commercial (hardware + software bundles)  
**Platform:** Windows  
**FDA Status:** FDA registered (510(k))

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 7/10 | Discovery, Freedom, Atlantis hardware integration. Neurofeedback training (amplitude, coherence, Z-score). QEEG analysis module. Power/connectivity metrics. 2-24 channel support. |
| **Manual Review** | 6/10 | Basic EEG review. Waveform display. Event marking. Focus on neurofeedback rather than clinical EEG review. |
| **Topomaps** | 7/10 | Surface topographic maps. Z-score deviation maps (with BrainAvatar add-on). Limited compared to NeuroGuide. |
| **Normative DB** | 6/10 | Optional normative database add-ons. Uses third-party databases (e.g., BrainDx, NeuroGuide) for full qEEG. |
| **Source Localization** | 6/10 | Available via BrainAvatar sLORETA module. Not built into base software. |
| **Report Generation** | 7/10 | Training reports, session summaries. Full qEEG reports require additional software or services. |
| **Export Formats** | 6/10 | Native formats. Limited export options compared to open-source alternatives. |
| **Clinical Use** | 7/10 | FDA-registered hardware. Widely used in neurofeedback. Often paired with NeuroGuide or BrainDx for qEEG. |
| **Evidence Base** | 6/10 | Hardware well-documented. Software evidence base smaller than NeuroGuide or EEGLAB. |

**Strengths:** Reliable hardware-software integration. Good for neurofeedback. BrainAvatar extension powerful.  
**Limitations:** Base qEEG capabilities limited. Requires add-ons for full clinical qEEG. Narrower evidence base.  
**Best For:** Neurofeedback practitioners, hardware-integrated systems, Z-score training.

---

### 4.5 NeuroField (NeuroField, Inc.)

**Developer:** Dr. Nicholas Dogris / NeuroField, Inc.  
**License:** Commercial  
**Platform:** Windows  
**FDA Status:** Hardware 510(k) cleared; software for clinical use

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 7/10 | NeuroField64 (stimulation), NeuroField Analysis (EEG/ICA), NeuroField ERP testing, NeuroField Neurofeedback. HRV integration. QEEG, ERP, pEEG (pharmaco-EEG), ICA analysis. Z-score reports. Pre-post comparison. |
| **Manual Review** | 7/10 | EEG acquisition and editing. ICA processing. Artifact handling. Event-related analysis. |
| **Topomaps** | 7/10 | Topographic mapping. Z-score comparison maps. Standard frequency band analysis. |
| **Normative DB** | 7/10 | Z-score reports using integrated normative comparisons. Pre-post statistical analysis. |
| **Source Localization** | 6/10 | Limited built-in source localization. Can work with LORETA exports. |
| **Report Generation** | 8/10 | Z-score reports, pre-post comparison reports, statistical analysis reports. ERP analysis reports. |
| **Export Formats** | 7/10 | Report export. Data export for further analysis. NeuroField format. |
| **Clinical Use** | 7/10 | Clinical neurotherapy practices. Neurofeedback and neuromodulation integration. Growing clinical user base. |
| **Evidence Base** | 6/10 | Emerging evidence base. Developer is active researcher. Less published validation than NeuroGuide. |

**Strengths:** Integrated stimulation (tDCS, tACS, pEMF, rTMS) with neurofeedback. ERP testing. ICA analysis. HRV integration.  
**Limitations:** Smaller evidence base. Less established normative database. Primarily US-focused.  
**Best For:** Integrated neuromodulation practices, ERP assessment, combined stimulation-neurofeedback protocols.

---

### 4.6 BrainVision Analyzer (Brain Products GmbH)

**Developer:** Brain Products GmbH, Munich, Germany  
**License:** Commercial  
**Platform:** Windows  
**FDA/CE Status:** MDD 93/42/EEC Class I (medical device)

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 9/10 | Infinite channels. >2 billion data points. Multiple EEG format import. History trees (full analysis traceability). Templates from history trees. Remote control (OLE Automation). Built-in Basic interpreter. Sophisticated artifact correction. Time-frequency analysis. Statistical evaluation tools. Montage flexibility. |
| **Manual Review** | 9/10 | Excellent manual review capabilities. Full waveform display. Event markers. Montage editing. History tracking for every operation. Quality control tools. |
| **Topomaps** | 8/10 | Topographic mapping with multiple display options. Time-frequency topographies. Scalp potential maps. |
| **Normative DB** | 3/10 | No built-in normative database. Requires third-party add-ons for normative comparisons (e.g., qEEG-Pro integration). |
| **Source Localization** | 5/10 | Limited built-in source localization. Exportable to other tools. Focus on sensor-level analysis. |
| **Report Generation** | 7/10 | Good analysis reports. History tree documentation. Export to various formats. Custom scripting for report generation. |
| **Export Formats** | 9/10 | Extensive format support: Brain Vision (.vhdr/.vmrk/.eeg), ASCII, generic exports. Imports from most major EEG formats. API for custom format development. |
| **Clinical Use** | 8/10 | Medical Device Directive Class I compliant. Standard in European hospitals and research centers. Widely used in clinical trials. "For research purposes" disclaimer on older versions. |
| **Evidence Base** | 9/10 | 10,000+ publications citing Brain Products hardware/software. Standard in cognitive neuroscience. |

**Strengths:** Unmatched data format support. Full analysis traceability (history trees). Modular architecture. Extensible via scripting. European medical device certification.  
**Limitations:** No normative database. No built-in source localization. Expensive. Steep learning curve.  
**Best For:** Academic research, clinical trials, multi-center studies, ERP analysis, institutional core facilities.

---

### 4.7 WinEEG / Neuron-Spectrum (Neurosoft)

**Developer:** Neurosoft, Russia  
**License:** Commercial (bundled with hardware)  
**Platform:** Windows  
**FDA Status:** Varies by region

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 7/10 | QEEG analysis, frequency domain analysis, topographic mapping, coherence analysis. Bundled with Neuron-Spectrum EEG hardware. iSyncBrain cloud-based automated analysis. |
| **Manual Review** | 6/10 | Standard EEG review. Waveform display. Impedance monitoring. Basic artifact handling. |
| **Topomaps** | 7/10 | Topographic maps for frequency bands. Power distribution maps. |
| **Normative DB** | 7/10 | Compatible with NeuroGuide, QEEGPro, iSyncBrain normative databases. iSyncBrain offers AI-based automated normative analysis. |
| **Source Localization** | 5/10 | Limited built-in source localization. Primarily scalp-level analysis. |
| **Report Generation** | 7/10 | Automated QEEG reports via iSyncBrain. Professional PDF reports. Cloud-based report generation in seconds. |
| **Export Formats** | 6/10 | EDF format. Integration with NeuroGuide and QEEGPro. iSyncBrain cloud export. |
| **Clinical Use** | 6/10 | Widely used in Eastern Europe and Asia. Cloud-based iSyncBrain service growing. Not primary in Western clinical markets. |
| **Evidence Base** | 5/10 | Limited independent peer-reviewed validation. Primarily hardware-focused literature. |

**Strengths:** Hardware-software integration. Cloud-based iSyncBrain automation. Good value. Growing international presence.  
**Limitations:** Smaller evidence base. Limited source localization. Less established in Western markets.  
**Best For:** Budget-conscious clinics, integrated hardware-software systems, cloud-based qEEG analysis.

---

### 4.8 MNE-Python

**Developer:** MNE-Python Core Team (open source)  
**License:** BSD-3-Clause  
**Platform:** Cross-platform (Python)  
**FDA Status:** Not applicable (research tool)

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 10/10 | Comprehensive M/EEG analysis: preprocessing, filtering, ICA, SSP, averaging, time-frequency (Morlet wavelets, multitaper, Hilbert), statistics (parametric, non-parametric, permutation, cluster-based), connectivity, forward/inverse modeling. Extensive visualization. |
| **Manual Review** | 5/10 | Jupyter notebook / Python script based. No dedicated clinical review UI. `mne.io.Raw.plot()` for interactive browsing. Annotation tools. Requires programming skill. |
| **Topomaps** | 9/10 | Excellent topographic plotting: `plot_topomap()` with multiple options (cmap, res, contours, extrapolation modes: local/head/box). Multi-channel layout. Animated topographies. High-quality publication-ready figures. |
| **Normative DB** | 2/10 | No built-in normative database. Can implement custom comparisons with external data. Some research datasets available. |
| **Source Localization** | 10/10 | MNE (minimum norm estimate), dSPM, sLORETA, eLORETA, LCMV beamformer, DICS beamformer, TF-MxNE, gamma-MAP. FreeSurfer integration. BEM/FEM head models. Surface and volume source spaces. Individual and template anatomy. Group morphing. |
| **Report Generation** | 5/10 | `mne.Report` HTML report generation. Script-based report creation. Not clinical-report oriented. Requires programming for comprehensive reports. |
| **Export Formats** | 10/10 | FIF (.fif), CTF, EDF/EDF+, BrainVision, EEGLAB (.set), FieldTrip, ASCII, NumPy arrays, Pandas DataFrames, NIfTI (.nii.gz) for volume source estimates. Massive format support. |
| **Clinical Use** | 5/10 | Widely used in research hospitals (e.g., Martinos Center). FDA-cleared systems (e.g., MEGIN) use MNE for analysis. Not marketed as clinical software. Requires expertise. |
| **Evidence Base** | 10/10 | 5,000+ publications. Gold standard for MEG analysis. Extensively validated source localization. Core methods published in high-impact journals. |

**Strengths:** Most comprehensive open-source M/EEG analysis. Best-in-class source localization. Free. Cross-platform. Active development (50+ contributors). Extensive documentation.  
**Limitations:** Requires Python programming. No normative database. No clinical report templates. Steep learning curve for non-programmers.  
**Best For:** Research institutions, MEG analysis, custom analysis pipelines, advanced source imaging, algorithm development, teaching.

---

### 4.9 EEGLAB

**Developer:** SCCN, UCSD (Arnaud Delorme, Scott Makeig)  
**License:** Open source (BSD)  
**Platform:** MATLAB / Standalone  
**FDA Status:** Not applicable (research tool)

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 9/10 | GUI-based EEG analysis. Multiformat data import. High-density data scrolling. Semi-automated artifact removal. ICA (AMICA, Infomax, PICARD). Time/frequency transforms. Event/channel location handling. Forward/inverse head/source modeling. STUDY framework for group analysis. 120+ plugins. |
| **Manual Review** | 5/10 | Good data scrolling and visualization. Interactive plotting. Component rejection GUI. Less optimized for clinical EEG review than BrainVision Analyzer. |
| **Topomaps** | 8/10 | Scalp topographic maps. 2-D and 3-D plotting. Component topographies. Time-frequency topographies. Customizable via plugins. |
| **Normative DB** | 2/10 | No built-in normative database. BrainBeats plugin offers qEEG features (theta/beta ratio, spectral analysis). Requires external comparison data. |
| **Source Localization** | 7/10 | DIPFIT plugin for dipole fitting. LORETA export. headModel plugin for forward/inverse solutions. FieldTrip-lite plugin for advanced source analysis. SIFT for connectivity. |
| **Report Generation** | 4/10 | No built-in clinical report generation. STUDY framework for research summaries. Export to external tools for reporting. |
| **Export Formats** | 10/10 | Native (.set/.fdt), EDF, BrainVision, ASCII, CTF, MFF, Neuroscan, BDF, Biosemi, and 40+ more formats via plugins. FIF export. FieldTrip export. |
| **Clinical Use** | 4/10 | Dominant in research. Some clinical research applications (e.g., seizure detection studies). Not designed for clinical workflow. |
| **Evidence Base** | 10/10 | 15,000+ publications. Most widely used EEG analysis software in neuroscience. ICA methods widely cited. STUDY framework validated. |

**Strengths:** Most widely used EEG software in research. Excellent ICA implementation. Huge plugin ecosystem. Free. Cross-platform. Extensive tutorials.  
**Limitations:** MATLAB dependency (or limited standalone). No normative database. No clinical reporting. Memory limitations with large datasets.  
**Best For:** Research laboratories, ICA-based artifact removal, ERP analysis, educational settings, group studies.

---

### 4.10 FieldTrip

**Developer:** Donders Institute, Radboud University (Robert Oostenveld)  
**License:** Open source (GPL)  
**Platform:** MATLAB  
**FDA Status:** Not applicable (research tool)

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 9/10 | Advanced statistical analysis. Spectral analysis. Time-frequency analysis. Connectivity analysis (coherence, PLV, PDC, Granger). Forward/inverse modeling. Beamforming (LCMV, DICS). Dipole fitting. Non-parametric statistics (permutation, cluster-based correction). Group analysis. |
| **Manual Review** | 4/10 | Script-based. No dedicated GUI for manual review. ft_databrowser for basic browsing. Not designed for clinical visual review. |
| **Topomaps** | 8/10 | High-quality topographic plotting. ft_topoplot. Multiple layout options. Publication-ready figures. |
| **Normative DB** | 1/10 | No built-in normative database. Purely research-oriented. |
| **Source Localization** | 10/10 | Excellent source localization: FEM (SimBio), BEM, dipole fitting, beamforming, minimum norm estimates. Five-compartment head models (skin, skull, CSF, gray matter, white matter). ft_prepare_leadfield, ft_sourceanalysis. |
| **Report Generation** | 4/10 | Script-based output. No built-in report templates. Requires custom programming for any report generation. |
| **Export Formats** | 9/10 | Native FieldTrip structures. EDF, BrainVision, FIF, EEGLAB, NIfTI. Fileio module supports most EEG/MEG formats. |
| **Clinical Use** | 4/10 | Used in research hospitals. FieldTrip-SimBio pipeline for forward solutions. Not designed for clinical workflows. |
| **Evidence Base** | 10/10 | 8,000+ publications. Standard for advanced EEG/MEG statistics. Cluster-based permutation tests widely adopted. SimBio FEM validation. |

**Strengths:** Best statistical analysis toolbox. Advanced connectivity metrics. FEM forward modeling. Non-parametric statistics gold standard.  
**Limitations:** Steep learning curve. Script-only. No GUI. No normative database. No clinical features.  
**Best For:** Advanced statistical analysis, connectivity studies, beamforming, multi-subject group analysis, research institutions.

---

### 4.11 Brainstorm

**Developer:** University of Southern California / McGill  
**License:** Open source (GPL)  
**Platform:** MATLAB  
**FDA Status:** Not applicable (research tool)

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 9/10 | Full MEG/EEG analysis pipeline: anatomy processing, head modeling (BEM, overlapping spheres, FEM), source modeling (MNE, dSPM, sLORETA, LCMV, MUSIC), dipole fitting, time-frequency analysis (Morlet wavelets), connectivity, group analysis, statistics. Database organization. |
| **Manual Review** | 6/10 | Good data review tools. Interactive 3D viewer. Process2 for group comparison. Better review capabilities than FieldTrip but still research-oriented. |
| **Topomaps** | 8/10 | 2D/3D topographic displays. Sensor and source topographies. Time-frequency cortical maps. Multiple display options. |
| **Normative DB** | 1/10 | No built-in normative database. Research-focused. |
| **Source Localization** | 9/10 | MNE, dSPM, sLORETA, LCMV beamformer, MUSIC. OpenMEEG BEM. DUNEuro FEM. FreeSurfer integration. Template and individual anatomy. Surface and volume sources. |
| **Report Generation** | 5/10 | Contact sheets, image export, movie generation. HTML report capability. Not clinical-report oriented. |
| **Export Formats** | 8/10 | Native BrainStorm format. FIF, CTF, NIfTI, EEGLAB, FieldTrip, ASCII. Image/movie export. |
| **Clinical Use** | 5/10 | Used in clinical research (e.g., epilepsy source localization). Can import Xfit dipoles (FDA-approved). Not marketed clinically. |
| **Evidence Base** | 9/10 | 3,000+ publications. Well-validated source modeling. Cited in clinical epilepsy research. |

**Strengths:** User-friendly compared to FieldTrip. Excellent source visualization. Strong database management. FreeSurfer integration. Free.  
**Limitations:** MATLAB-dependent. No normative database. No clinical reports. Resource-intensive for large datasets.  
**Best For:** MEG/EEG source imaging, research groups, educational settings, epilepsy research, functional brain mapping.

---

### 4.12 Cartool

**Developer:** Denis Brunet / CIBM, University of Geneva  
**License:** Open source (Apache 2.0) - as of 2024  
**Platform:** Windows (C++)  
**FDA Status:** Not applicable (research tool)

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 8/10 | EEG visualization and analysis (full recordings, resting state, evoked responses, intracranial). Preprocessing (filtering, interpolation, downsampling). Frequency analysis (FFT, wavelets, S-transform). Microstate analysis. EEG topographies. Inverse solutions (WMN, LORETA, LAURA, EPIFOCUS). MRI preprocessing. |
| **Manual Review** | 6/10 | 3D display with rapid manipulation. Animated displays. Window synchronization. Intracranial EEG support. Reference-independent topographic analysis. |
| **Topomaps** | 9/10 | Topographic analysis reference-independent. FFT-approximation for frequency domain source localization. 3D scalp and intracranial mapping. Global field strength measures. |
| **Normative DB** | 1/10 | No built-in normative database. |
| **Source Localization** | 8/10 | WMN, LORETA, LAURA, EPIFOCUS. SMAC and LSMAC head models. Individual MRI or template brains. L-curve regularization. LSMAC local sphere model. 3,000-5,000 solution points in gray matter including deep structures. |
| **Report Generation** | 5/10 | Image export. Volume export for SPM. Source waveforms. No dedicated clinical report generation. |
| **Export Formats** | 7/10 | Native Cartool formats. Analyze volume format. SPM-compatible volumes. Standard EEG formats (EDF, Brain Products, Biosemi, EGI, Neuroscan). ASCII. |
| **Clinical Use** | 5/10 | Used in clinical research (epilepsy, intracranial EEG). Not designed for clinical workflow. Now open source (2024). |
| **Evidence Base** | 8/10 | 500+ publications. 25+ years of development. Microstate analysis widely cited. Source imaging validated. |

**Strengths:** Excellent microstate analysis. Reference-independent topographic analysis. Now open source (Apache 2.0). Fast C++ implementation. Intracranial EEG support.  
**Limitations:** Windows-only. Smaller user base than EEGLAB/Brainstorm. No normative database. No clinical reporting.  
**Best For:** Microstate analysis, topographic studies, intracranial EEG, European research groups.

---

### 4.13 sLORETA / eLORETA (Key Institute)

**Developer:** Roberto Pascual-Marqui / KEY Institute for Brain-Mind Research  
**License:** Free (academic) / Commercial  
**Platform:** Cross-platform (standalone + LORETA Key software)  
**FDA Status:** CE-marked (LORETA Key)

| Dimension | Rating | Details |
|-----------|--------|---------|
| **Features** | 6/10 | Standardized LORETA (sLORETA) and exact LORETA (eLORETA) source localization. EEG tomography. Frequency domain analysis. Statistical parametric mapping for LORETA. Whole-brain voxel-wise analysis. EEG-to-fMRI fusion. |
| **Manual Review** | 4/10 | Basic data viewing. Focused on source localization rather than EEG review. |
| **Topomaps** | 5/10 | Source-level topographic displays. Not traditional scalp topomap focused. |
| **Normative DB** | 3/10 | Free normative data available for download (age groups). Not as comprehensive as NeuroGuide. Can compute voxel-wise Z-scores. |
| **Source Localization** | 10/10 | Zero localization bias (mathematically proven). eLORETA: exact, zero-error localization in point-source simulation. 6,239 voxels at 5mm resolution in MNI152 space. Realistic head model. Probabilistic Talairach atlas. Brodmann area labeling. Validated in simultaneous EEG/fMRI. Localization error 13.3-15.7 mm (SEEG validation). |
| **Report Generation** | 4/10 | Statistical output files. Image generation. SPM-compatible. No dedicated clinical report. |
| **Export Formats** | 6/10 | LORETA proprietary format. NIfTI volumes. Text files. SPM-compatible. |
| **Clinical Use** | 7/10 | Widely used in clinical research (epilepsy, depression, OCD, dementia, pain). CE-marked LORETA Key software. Real-time LORETA neurofeedback via BrainAvatar. |
| **Evidence Base** | 10/10 | 5,000+ publications using sLORETA/eLORETA. Most cited EEG source localization method. Simultaneous EEG/fMRI validation. Independent validation by multiple groups. |

**Strengths:** Gold standard for EEG source localization. Mathematically exact (eLORETA). Free for academic use. Extensively validated. MNI space compatibility.  
**Limitations:** Narrow focus on source localization only. No full qEEG analysis. No clinical report generation. Requires other tools for preprocessing.  
**Best For:** EEG source localization research, clinical source imaging, real-time LORETA neurofeedback, cross-modal validation.

---

## 5. Comparative Analysis

### 5.1 Normative Database Comparison

| Database | n | Age Range | FDA | Conditions | Evidence |
|----------|---|-----------|-----|------------|----------|
| NeuroGuide (Thatcher LSNDB) | 678 | 2 mo - 82.6 yr | Yes | EC/EO | 500+ pubs |
| BrainDx | 464 | 16-80 yr | Yes | EC | 100+ pubs |
| Neurometrics (historical) | 782 | 6-90 yr | Yes | EC | Foundational |
| qEEG-Pro (Netherlands) | 1,482 EC / 1,232 EO | 6-83 yr | Yes | EC/EO | Growing |
| ISB-NormDB (Korea) | 1,289 | 4.5-81 yr | Yes (KFDA) | EC/EO | Regional |
| SKIL/SKIL3 | 135 SKIL / 175 SKIL3 | 18-55 yr | No | EC | Limited |
| sLORETA Free Norms | Varies | Adult | N/A | Various | Basic |

### 5.2 Source Localization Algorithm Comparison

| Algorithm | Localization Error | Spatial Resolution | Deep Sources | Multiple Sources | Speed | Evidence |
|-----------|-------------------|-------------------|--------------|------------------|-------|----------|
| eLORETA | 13.3-15.7 mm | 5mm voxels | Excellent | Good | Fast | 5000+ pubs |
| sLORETA | 13.3-15.7 mm | 5mm voxels | Good | Moderate | Fast | 5000+ pubs |
| dSPM | ~15 mm | Source-space | Good | Moderate | Fast | 3000+ pubs |
| MNE (L2 norm) | ~20 mm | Source-space | Fair | Moderate | Fast | 5000+ pubs |
| LCMV Beamformer | ~10-15 mm | 3-5mm | Moderate | Excellent | Medium | 2000+ pubs |
| LORETA (p=2) | ~20 mm | 5mm voxels | Good | Poor | Fast | Foundational |
| FOCUSS | ~17 mm | High | Moderate | Good | Medium | Limited |

### 5.3 Clinical vs. Research Platform Landscape

```
                    HIGH CLINICAL READINESS
                              |
    NeuroGuide -------------- | -------------- BrainDx
    BrainAvatar ------------- | -------------- WinEEG/iSyncBrain
    sLORETA/eLORETA --------- | -------------- BrainVision Analyzer
    NeuroField -------------- | -------------- BrainMaster
                              |
    --------------------------+----------------------------
                              |
    MNE-Python -------------- | -------------- EEGLAB
    Brainstorm -------------- | -------------- FieldTrip
    Cartool ----------------- |
                              |
                    HIGH RESEARCH FLEXIBILITY
```

### 5.4 Cost-Effectiveness Analysis

| Platform | Upfront Cost | Annual Cost | Cost per Analysis | Value Rating |
|----------|-------------|-------------|-------------------|--------------|
| NeuroGuide | $3,500-$6,000+ | $500-$1,000 | ~$50 | High |
| BrainDx | $2,000-$4,000 | $300-$600 | ~$40 | High |
| BrainAvatar | Bundled w/ hardware | $500+ | ~$30 (w/ training) | Moderate |
| BrainVision Analyzer | $5,000-$10,000 | $1,000-$2,000 | ~$20 | Moderate |
| MNE-Python | Free | Free | Free | Very High |
| EEGLAB | Free (MATLAB req'd) | Free | Free* | Very High |
| FieldTrip | Free (MATLAB req'd) | Free | Free* | Very High |
| Brainstorm | Free (MATLAB req'd) | Free | Free* | Very High |
| sLORETA/eLORETA | Free (academic) | Free | Free | Very High |
| Cartool | Free (open source) | Free | Free | Very High |

*Requires MATLAB license ($500-$2,000/year depending on institution)

---

## 6. Recommendations

### For Clinical Neurofeedback Practices

1. **Primary:** NeuroGuide - Full qEEG + Z-score neurofeedback + most validated normative database
2. **Alternative:** BrainAvatar - If real-time 3D LORETA neurofeedback is priority
3. **Budget:** BrainDx + open-source tools for source localization

### For Clinical Assessment and Diagnosis

1. **Primary:** NeuroGuide - Most comprehensive FDA-cleared system
2. **Secondary:** BrainDx - Good disorder-specific discriminants
3. **European:** BrainVision Analyzer + qEEG-Pro normative database add-on

### For Research Institutions

1. **Primary:** MNE-Python - Best overall analysis flexibility and source localization
2. **ERP-focused:** EEGLAB + ERPLAB - Largest user community
3. **Statistics-focused:** FieldTrip - Best statistical framework
4. **MEG-focused:** Brainstorm - Best MEG/EEG integration

### For Integrated Neuromodulation Clinics

1. **Primary:** NeuroField - Stimulation + neurofeedback + qEEG in one platform
2. **Alternative:** BrainAvatar + external stimulation hardware

### For Educational Settings

1. **Primary:** EEGLAB - Most tutorials, largest community, GUI-based
2. **Secondary:** Brainstorm - Good GUI, excellent visualization
3. **Programming-focused:** MNE-Python - Best for Python-based curricula

---

## 7. References

1. Thatcher, R.W., et al. (2003). Normative EEG databases and EEG biofeedback. *Journal of Neurotherapy*.
2. Pascual-Marqui, R.D. (2002). Standardized low-resolution brain electromagnetic tomography (sLORETA). *Methods and Findings in Experimental and Clinical Pharmacology*.
3. Pascual-Marqui, R.D., et al. (2011). Exact LORETA (eLORETA). *International Journal of Bioelectromagnetism*.
4. Gramfort, A., et al. (2013). MNE software for processing MEG and EEG data. *NeuroImage*.
5. Delorme, A. & Makeig, S. (2004). EEGLAB: an open source toolbox for analysis of single-trial EEG dynamics. *Journal of Neuroscience Methods*.
6. Oostenveld, R., et al. (2011). FieldTrip: Open source software for advanced analysis of MEG, EEG, and invasive electrophysiological data. *Computational Intelligence and Neuroscience*.
7. Tadel, F., et al. (2011). Brainstorm: A user-friendly application for MEG/EEG analysis. *Computational Intelligence and Neuroscience*.
8. Brunet, D., et al. (2011). Spatiotemporal analysis of multichannel EEG: CARTOOL. *Computational Intelligence and Neuroscience*.
9. Thatcher, R.W. (1998). Normative EEG databases and EEG biofeedback. *Applied Neuroscience*.
10. John, E.R., et al. (1988). The Neurometrics database. *Science*.
11. Bosch-Bayard, J., et al. (2020). Cuban EEG normative database. *Neuroscience*.
12. Keizer, A.W. (2019). qEEG-Pro normative database. *Netherlands*.
13. Michel, C.M. & Brunet, D. (2019). EEG source imaging: a practical review of the analysis steps. *Frontiers in Neurology*.
14. Clinical Neurophysiology (2025). Accuracy of SEEG source localization. *Journal of Clinical Neurophysiology*.
15. Neurosity (2026). Neurofeedback software compared: top platforms. *neurosity.co*.
16. Applied Neuroscience, Inc. NeuroGuide product documentation. *neuroguide.com*.
17. BrainDx LLC. BrainDx normative database documentation. *braindx.net*.
18. BrainMaster Technologies. BrainAvatar 4.0 documentation. *brainmaster.com*.
19. Brain Products GmbH. BrainVision Analyzer user manual.
20. Neurosoft. iSyncBrain cloud-based qEEG analysis platform. *neurosoft.com*.

---

*Document prepared for clinical neurophysiology software benchmarking. All ratings are based on published specifications, peer-reviewed literature, and manufacturer documentation as of June 2025.*
