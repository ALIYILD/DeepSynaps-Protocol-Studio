# DeepSynaps Protocol Studio - Neuroimaging & Neuromodulation Database Requirements

> **Report Date**: 2025-06-20
> **Researcher**: Neuroimaging Database Research Agent
> **Total Databases Found**: 45+
> **Platform Context**: DeepSynaps Protocol Studio (EEG/qEEG/fNIRS/TMS/tDCS/MRI pipeline)

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Normative EEG Databases](#2-normative-eeg-databases)
3. [MRI Brain Atlases](#3-mri-brain-atlases)
4. [Neuroimaging Repositories](#4-neuroimaging-repositories)
5. [Brain Stimulation Targets](#5-brain-stimulation-targets)
6. [fNIRS Databases](#6-fnirs-databases)
7. [Gene Expression & Electrophysiology Atlases](#7-gene-expression--electrophysiology-atlases)
8. [Top 10 Priority Integration List](#8-top-10-priority-integration-list)
9. [Integration Matrix: Database -> Service Mapping](#9-integration-matrix-database---service-mapping)
10. [Appendix: URLs & Access Information](#10-appendix-urls--access-information)

---

## 1. EXECUTIVE SUMMARY

### Platform Existing Services
| Service File | Lines | Purpose |
|-------------|-------|---------|
| `mri_atlas_service.py` | 401 | MRI atlas service |
| `brain_regions.py` | 7 | Brain regions definitions |
| `brain_targets.py` | 366 | Brain stimulation targets |
| `qeeg_protocol_fit.py` | 472 | qEEG protocol fitting |
| `eeg_signal_service.py` | 1,466 | EEG signal processing |

### Databases Found by Category
| Category | Count | Open Access | Commercial | Restricted |
|----------|-------|-------------|------------|------------|
| Normative EEG Databases | 10 | 3 | 5 | 2 |
| MRI Brain Atlases | 12 | 11 | 1 | 0 |
| Neuroimaging Repositories | 10 | 7 | 0 | 3 |
| Brain Stimulation Targets | 8 | 7 | 0 | 1 |
| fNIRS Databases | 3 | 3 | 0 | 0 |
| Gene Expression & Electrophysiology | 4 | 4 | 0 | 0 |
| **TOTAL** | **47** | **35** | **6** | **6** |

---

## 2. NORMATIVE EEG DATABASES

### 2.1 Thatcher Lifespan Normative EEG Database (NeuroGuide)

| Field | Detail |
|-------|--------|
| **Full Name** | Thatcher Lifespan Normative EEG Database |
| **Alias** | NeuroGuide Normative Database |
| **Developer** | Applied Neuroscience, Inc. (Robert Thatcher, PhD) |
| **Subjects** | 678 carefully screened individuals |
| **Age Range** | 2 months to 82 years |
| **Demographics** | 625 (1979-2000) + 53 additional adults (2008) |
| **Metrics** | 300,000+ means and standard deviations |
| **Measures** | Absolute/relative power, coherence, phase, amplitude asymmetry |
| **Amp. Matching** | Required - within 3% calibration match |
| **FDA Status** | 510(k) clearance |
| **License** | Commercial (purchased with NeuroGuide software) |
| **URL** | https://appliedneuroscience.com |
| **Download** | Bundled with NeuroGuide software |
| **Integration** | `qeeg_protocol_fit.py` - primary qEEG normative reference |
| **Citations** | Thatcher et al. 2003, 2005, 2008; Science 236:1110-1113, 1987 |

**Relevance**: PRIMARY - This is the gold standard lifespan EEG normative database. Essential for `qeeg_protocol_fit.py` and `eeg_signal_service.py`.

---

### 2.2 qEEG-Pro Database

| Field | Detail |
|-------|--------|
| **Developer** | qEEG-Pro B.V. |
| **Subjects** | 1,482 (EC), 1,232 (EO) |
| **Age Range** | 6-82 years |
| **Approach** | Client-side progressive database with auto artifact filtering |
| **Reference** | Linked ear reference |
| **FDA Status** | FDA registered |
| **License** | Commercial |
| **URL** | https://www.qeeg-pro.com |

---

### 2.3 HBI (HBImed) Normative Database

| Field | Detail |
|-------|--------|
| **Developer** | HBImed AG |
| **Subjects** | 1,000 total (300 children 7-17, 500 adults 18-60, 200 seniors 61+) |
| **Data Collection** | 1990s |
| **Conditions** | 5 active tasks + EC + EO resting-state |
| **Deartifacting** | Automatic |
| **License** | Commercial |
| **URL** | https://www.hbimed.com |

---

### 2.4 Cuban Human Brain Mapping Project (CHBMP) - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Cuban Human Brain Mapping Project Normative EEG Database |
| **Subjects** | 282 healthy participants |
| **Age Range** | 18-68 years |
| **EEG Channels** | 64-120 channels high-density |
| **Conditions** | EC, EO, hyperventilation, go-no-go visual attention task |
| **Companion Data** | MRI, psychological tests (MMSE, WAIS-III) |
| **License** | Open Access / Free |
| **Access** | https://github.com/oldgandalf/FirstWaveCubanHumanNormativeEEGProject |
| **Zenodo DOI** | 10.5281/zenodo.4244765 |
| **Integration** | Open-source alternative for `qeeg_protocol_fit.py` |

---

### 2.5 ISB-NormDB - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | ISB-NormDB (Incheon National University) |
| **Subjects** | 1,289 (EC), 1,290 (EO) |
| **Age Range** | 4.5-81 years |
| **Method** | Nonlinear regression (GAM) age regression |
| **License** | Open Access |
| **Citation** | PMCID: PMC8718919 |

---

### 2.6 BrainDX (NXLink-NYU) Database

| Field | Detail |
|-------|--------|
| **Former Name** | NXLink - NYU Database |
| **Subjects** | 464 subjects |
| **Deartifacting** | Manual |
| **License** | Commercial |

---

### 2.7 Neurometrics Database

| Field | Detail |
|-------|--------|
| **Developer** | E.R. John / Neurometrics Inc. |
| **Subjects** | 782 (356 aged 6-16, 426 aged 16-90) |
| **FDA Status** | 510(k) clearance (July 1998, #K974748) |
| **License** | Commercial |

---

### 2.8 SKIL (Sterman-Kaiser) Database

| Field | Detail |
|-------|--------|
| **Full Name** | Sterman-Kaiser Imaging Laboratories Database |
| **Subjects** | 135 adults (18-55 years) |
| **Composition** | Students/lab personnel (50%), community volunteers (25%), USAF (25%) |
| **License** | Commercial |

---

### 2.9 NovaTechEEG / LORETA Normative Database

| Field | Detail |
|-------|--------|
| **Full Name** | LORETA Source Correlation Normative Database |
| **Subjects** | 84 cases |
| **Method** | LORETA source localization |
| **License** | Commercial (add-on to NeuroGuide) |
| **URL** | http://anineuroguide.com/AddonDatabases.htm |

---

### 2.10 MEGaNorm - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | MEGaNorm: MEG Lifespan Normative Modeling Framework |
| **Subjects** | 1,846 healthy individuals (age 6-88) |
| **Clinical Cohort** | 160 Parkinson's patients |
| **Datasets** | 6 independent datasets |
| **Method** | Hierarchical Bayesian Regression (HBR) |
| **License** | Open Access |
| **Citation** | Nature Communications Biology 2026; doi:10.1038/s42003-026-09825-2 |

---

## 3. MRI BRAIN ATLASES

### 3.1 MNI152 Template - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | MNI ICBM 152 Nonlinear Atlases |
| **Versions** | 2006 symmetric, 2009a symmetric/asymmetric, 2009c (fMRIPrep default) |
| **Resolutions** | 0.5mm, 1mm, 2mm |
| **Space** | MNI standard stereotactic space |
| **License** | Public domain / Open Access |
| **Download** | https://zenodo.org/records/15470657 (skull-stripped versions) |
| **Python Access** | `nilearn.datasets.load_mni152_template()` |
| **FSL Access** | Included in FSL distribution |
| **Integration** | `mri_atlas_service.py` - base reference template |
| **Citation** | Fonov et al., NeuroImage 2009, 2011 |

---

### 3.2 AAL (Automated Anatomical Labeling) Atlas - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Automated Anatomical Labeling Atlas |
| **Regions** | 116 regions (90 cortical, 26 subcortical) |
| **Space** | MNI152 |
| **License** | Open Access |
| **Download** | SPM WFU-PickAtlas, NITRC, FieldTrip template |
| **Python Access** | `nilearn.datasets.fetch_atlas_aal()` |
| **Integration** | `mri_atlas_service.py`, `brain_regions.py` |
| **Citation** | Tzourio-Mazoyer et al., NeuroImage 2002, 15:273-289 |

---

### 3.3 Harvard-Oxford Atlas - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Harvard-Oxford Cortical and Subcortical Structural Atlases |
| **Cortical Regions** | 48 cortical regions per hemisphere (maxprob thresholded) |
| **Subcortical Regions** | 21 subcortical regions |
| **Space** | MNI152 (FSL) |
| **Probabilistic** | Yes - thresholded at 25%, 50% |
| **License** | Open Access (included with FSL) |
| **Download** | Part of FSL (`$FSLDIR/data/atlases/HarvardOxford/`) |
| **Python Access** | `nilearn.datasets.fetch_atlas_harvard_oxford()` |
| **Integration** | `mri_atlas_service.py`, `brain_regions.py` |

---

### 3.4 JuBrain (SPM Anatomy Toolbox) - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | JuBrain Anatomy Toolbox / SPM Anatomy Toolbox |
| **Regions** | 148+ probabilistic cytoarchitectonic maps (v2.9) |
| **Space** | MNI152 |
| **Type** | Probabilistic cytoarchitectonic |
| **License** | Academic use (Forschungszentrum Julich) |
| **Download** | https://www.fz-juelich.de/en/inm/inm-7/resources/tools/jubrain-anatomy-toolbox |
| **GitHub** | Available |
| **Python Access** | `nilearn.datasets.fetch_atlas_juelich()` |
| **Integration** | `mri_atlas_service.py` |
| **Citation** | Eickhoff et al., NeuroImage 2005; Amunts et al., Science 2020 |

---

### 3.5 FreeSurfer Desikan-Killiany (aparc) - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Desikan-Killiany Cortical Parcellation Atlas |
| **Regions** | 68 cortical regions (34 per hemisphere) |
| **Type** | Surface-based (gyral) |
| **Subject** | fsaverage |
| **License** | FreeSurfer License (academic/commercial) |
| **Download** | Bundled with FreeSurfer |
| **Python Access** | MNE-Python `mne.read_labels_from_annot()` |
| **Integration** | `mri_atlas_service.py`, `brain_regions.py` |
| **Citation** | Desikan et al., NeuroImage 2006, 31:968-80 |

---

### 3.6 FreeSurfer Destrieux (aparc.a2009s) - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Destrieux 2009 Cortical Parcellation Atlas |
| **Regions** | 148 cortical regions (74 per hemisphere) |
| **Type** | Surface-based (gyral + sulcal) |
| **Subject** | fsaverage |
| **License** | FreeSurfer License |
| **Download** | Bundled with FreeSurfer |
| **Python Access** | MNE-Python |
| **Citation** | Destrieux et al., NeuroImage 2010, 53(1):1-15 |

---

### 3.7 Schaefer 2018 Parcellation - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Schaefer 2018 Local-Global Parcellation |
| **Resolutions** | 100-1000 regions (in steps of 100) |
| **Networks** | 7 or 17 Yeo network annotations |
| **Resolution** | 1mm or 2mm |
| **Space** | MNI152 |
| **Type** | Data-driven functional |
| **License** | MIT |
| **Download** | https://github.com/ThomasYeoLab/CBIG/tree/master/stable_projects/brain_parcellation/Schaefer2018_LocalGlobal |
| **Python Access** | `nilearn.datasets.fetch_atlas_schaefer_2018()` |
| **Integration** | `mri_atlas_service.py` - functional connectivity analysis |
| **Citation** | Schaefer et al., Cerebral Cortex 2018 |

---

### 3.8 HCP-MMP1.0 (Glasser) Atlas - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Human Connectome Project Multi-Modal Parcellation 1.0 |
| **Regions** | 360 cortical regions (180 per hemisphere) |
| **Type** | Multi-modal (myelin, function, cortical thickness) |
| **Space** | Conte69 (surface) / MNI152 (volumetric) |
| **License** | Open Access |
| **Download** | https://balsa.wustl.edu/file/3VLx |
| **Volumetric MNI** | https://figshare.com/articles/dataset/2016_Glasser_MMP1_0_Cortical_Atlases/24431146 |
| **FSL Version** | https://github.com/mbedini/The-HCP-MMP1.0-atlas-in-FSL |
| **Integration** | `mri_atlas_service.py` - most detailed cortical parcellation |
| **Citation** | Glasser et al., Nature 2016, 536:171-178 |

---

### 3.9 Brainnetome Atlas - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Brainnetome Atlas (BNA) |
| **Regions** | 210 cortical + 36 subcortical + 28 cerebellar |
| **Total** | 274 regions |
| **Type** | Connectivity-based parcellation (DTI + rs-fMRI) |
| **Space** | MNI152, FreeSurfer, Caret |
| **License** | Free academic use |
| **Download** | http://atlas.brainnetome.org/download.html |
| **GitHub** | https://github.com/brainnetome |
| **Integration** | `mri_atlas_service.py`, `brain_regions.py` |
| **Citation** | Fan et al., Cerebral Cortex 2016; PMID: 27230218 |

---

### 3.10 Brodmann Area Atlas - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Brodmann Area Cytoarchitectonic Atlas |
| **Regions** | ~52 Brodmann areas |
| **Type** | Cytoarchitectonic (historical) |
| **Space** | Talairach (convert to MNI via SPM/FSL) |
| **License** | Public domain |
| **Download** | SPM Anatomy Toolbox, MRIcron, various sources |
| **Integration** | `mri_atlas_service.py` - historical reference |
| **Citation** | Brodmann 1909; multiple modern implementations |

---

### 3.11 Yeo 2011 Functional Networks - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Yeo-Krienen 2011 Functional Parcellation |
| **Networks** | 7 or 17 intrinsic functional networks |
| **Subjects** | 1,000 (rs-fMRI) |
| **Type** | Functional connectivity |
| **License** | Open Access |
| **Download** | Included with FreeSurfer, Lead-DBS |
| **Python Access** | `nilearn.datasets.fetch_atlas_yeo_2011()` |
| **Integration** | `mri_atlas_service.py` - network-level analysis |
| **Citation** | Yeo et al., J Neurophysiol 2011, 106(3):1125-65 |

---

### 3.12 Craddock 2011 Functional Parcellation - FREE

| Field | Detail |
|-------|--------|
| **Full Name** | Craddock Functional Atlas (random parcellations) |
| **Type** | rs-fMRI informed spectral clustering |
| **Space** | MNI152 |
| **License** | Open Access |
| **Download** | Lead-DBS preinstalled |
| **Citation** | Craddock et al., Human Brain Mapping 2012, 33(8):1914-28 |

---

## 4. NEUROIMAGING REPOSITORIES

### 4.1 OpenNeuro - FREE

| Field | Detail |
|-------|--------|
| **Type** | Open-access neuroimaging data archive |
| **Datasets** | 1,000+ datasets |
| **Participants** | 50,000+ |
| **Modalities** | MRI (structural/fMRI/DTI), EEG, MEG, iEEG, PET |
| **Format** | BIDS (Brain Imaging Data Structure) |
| **License** | CC0 / CC-BY |
| **Funding** | NIH/NIMH |
| **Access** | https://openneuro.org |
| **API** | GraphQL + REST |
| **Download** | Web, DataLad, AWS S3 |
| **Integration** | `eeg_signal_service.py` (EEG datasets), `mri_atlas_service.py` (MRI) |
| **Citation** | Markiewicz et al., 2021; RRID:SCR_005031 |

---

### 4.2 Human Connectome Project (HCP) - FREE

| Field | Detail |
|-------|--------|
| **Type** | Large-scale brain connectivity mapping project |
| **Subjects** | 1,206 young adults (Q1-Q6) |
| **Modalities** | T1w, T2w, rfMRI, tfMRI, dMRI, MEG, 7T (subset) |
| **Access Model** | Free with registration |
| **Data Portal** | https://db.humanconnectome.org |
| **Download** | ConnectomeDB, Amazon S3, Aspera |
| **Related Projects** | HCP Lifespan, HCP Aging, HCP Development |
| **Integration** | `mri_atlas_service.py` - connectivity reference, `brain_regions.py` |
| **Citation** | Van Essen et al., NeuroImage 2013; Glasser et al., Nature 2016 |

---

### 4.3 ABIDE (Autism Brain Imaging Data Exchange) - FREE

| Field | Detail |
|-------|--------|
| **Type** | Autism rs-fMRI consortium dataset |
| **Subjects** | 1,112 datasets (539 ASD, 573 TC) |
| **Age Range** | 7-64 years |
| **Modalities** | Resting-state fMRI, structural MRI, phenotypic |
| **License** | Open Access |
| **Access** | http://fcon_1000.projects.nitrc.org/indi/abide/ |
| **Integration** | `eeg_signal_service.py` - clinical EEG comparison patterns |
| **Citation** | Di Martino et al., Molecular Psychiatry 2014, 19(6):659-667 |

---

### 4.4 ADNI (Alzheimer's Disease Neuroimaging Initiative) - FREE

| Field | Detail |
|-------|--------|
| **Type** | Alzheimer's disease longitudinal neuroimaging study |
| **Modalities** | MRI (structural), PET (amyloid, tau, FDG), CSF, genetics, clinical |
| **Phases** | ADNI-1, ADNI-GO, ADNI-2, ADNI-3, ADNI-4 |
| **License** | Data Use Agreement required |
| **Access** | https://adni.loni.usc.edu |
| **Application** | Required (1-2 week approval) |
| **Integration** | `mri_atlas_service.py` - neurodegeneration reference |
| **Citation** | Mueller et al., Alzheimer's & Dementia 2005; Jack et al., 2008 |

---

### 4.5 UK Biobank Brain Imaging - FREE (Application)

| Field | Detail |
|-------|--------|
| **Type** | Population-scale multimodal brain imaging |
| **Target** | 100,000 subjects |
| **Modalities** | T1, T2, SWI, dMRI (100 directions), rfMRI, tfMRI |
| **Current** | 45,000+ scanned |
| **License** | Application required |
| **Access** | https://www.ukbiobank.ac.uk |
| **Integration** | `mri_atlas_service.py` - population-level normative reference |
| **Citation** | Miller et al., NeuroImage 2016; Littlejohns et al., 2020 |

---

### 4.6 NeuroVault - FREE

| Field | Detail |
|-------|--------|
| **Type** | Repository for unthresholded statistical brain maps |
| **Maps** | 1,356+ images, 201+ collections |
| **Data Types** | T/F/Z maps, parcellations, atlases, MEG/EEG maps |
| **Space** | MNI152 |
| **License** | CC0 (public domain) |
| **API** | RESTful JSON API |
| **Access** | https://neurovault.org |
| **Python Access** | `nilearn.datasets.fetch_neurovault_ids()` |
| **Integration** | `mri_atlas_service.py` - statistical map reference |
| **Citation** | Gorgolewski et al., Frontiers in Neuroinformatics 2015; RRID:SCR_00339 |

---

### 4.7 Neurosynth / Neurosynth Compose - FREE

| Field | Detail |
|-------|--------|
| **Type** | Neuroimaging meta-analysis database & platform |
| **Articles** | 37,648 studies, 1,345,780 activation coordinates |
| **Database** | NeuroStore (centralized backend) |
| **Analysis** | NiMARE Python library |
| **License** | Open Source (MIT/BSD) |
| **Access** | https://neurosynth.org, https://compose.neurosynth.org |
| **GitHub** | https://github.com/neurostuff |
| **Integration** | `brain_targets.py` - meta-analytic functional localization |
| **Citation** | Yarkoni et al., Nature Methods 2011; delavega et al., 2023 |

---

### 4.8 BrainMap - FREE

| Field | Detail |
|-------|--------|
| **Type** | Coordinate-based functional brain imaging database |
| **Studies** | 4,200+ peer-reviewed neuroimaging studies |
| **Tools** | Sleuth (search), Scribe (encoding), GingerALE (meta-analysis) |
| **License** | Free academic use |
| **Access** | https://www.brainmap.org |
| **Software** | Java-based cross-platform |
| **Integration** | `brain_targets.py` - functional mapping reference |
| **Citation** | Fox & Lancaster, 2002; Laird et al., 2005 |

---

### 4.9 1000 Functional Connectomes Project - FREE

| Field | Detail |
|-------|--------|
| **Type** | Resting-state fMRI data collection |
| **Subjects** | 1,000+ from 30+ international sites |
| **License** | Open Access |
| **Access** | http://fcon_1000.projects.nitrc.org |
| **Integration** | `eeg_signal_service.py` - rs-EEG normative comparison |
| **Citation** | Biswal et al., 2010; PNAS 2010 |

---

### 4.10 fMRIDC (Functional MRI Data Center) - FREE (Legacy)

| Field | Detail |
|-------|--------|
| **Type** | Historical fMRI raw data repository (pioneering effort) |
| **Established** | Autumn 1999 |
| **Status** | Legacy (superseded by OpenNeuro) |
| **License** | Open Access |
| **URL** | http://www.fmridc.org |
| **Citation** | Van Horn et al., 2001 |

---

## 5. BRAIN STIMULATION TARGETS

### 5.1 TMS Symptom-Network Atlas - FREE

| Field | Detail |
|-------|--------|
| **Type** | Evidence-based psychiatric TMS target atlas |
| **Disorders** | 12: addiction, aggression, anxiety, criminality, depression, emotional regulation, mania, OCD, pain, PTSD, psychosis, transdiagnostic |
| **Method** | Lesion network mapping + DBS/TMS network mapping |
| **Coordinates** | MNI + CPC (continuous proportional coordinate) + Tetra codes |
| **License** | Open Access |
| **Access** | https://www.medrxiv.org/content/10.1101/2025.02.25.25322842v1 |
| **Integration** | `brain_targets.py` - PRIMARY TMS target reference |
| **Citation** | Siddiqi et al., medRxiv 2025 |

---

### 5.2 DLPFC TMS Target Coordinates Database

| Field | Detail |
|-------|--------|
| **Targets** | Multiple validated DLPFC coordinates |
| **Fitzgerald Target** | MNI (-45, 45, 35) - BA9/46 junction |
| **Herbsman Target** | MNI (-47, 24, 48) |
| **Fox SGC-anticorrelated** | MNI (-42, 44, 26) |
| **Beam F3** | MNI (-37, 26, 49) - scalp-based approximation |
| **Rusjan F5** | MNI (~-50, 30, 36) |
| **License** | Published literature (open) |
| **Integration** | `brain_targets.py` - TMS depression/anxiety targeting |
| **Citation** | Fitzgerald et al., 2006; Fox et al., 2012; Herbsman et al., 2009 |

---

### 5.3 tDCS Montage Database / Guide

| Field | Detail |
|-------|--------|
| **Type** | Compilation of validated tDCS electrode montages |
| **Targets** | DLPFC, M1, occipital, temporal, Fpz/Pz, etc. |
| **Montages** | Anode/cathode placements with 10-20/10-10 coordinates |
| **Conditions** | Depression, pain, motor recovery, ADHD, tinnitus, etc. |
| **License** | Open Access (published literature) |
| **Resources** | https://thebraindriver.com/pages/tdcs-placement-montage-maps-studies |
| **Framework** | PMC4319395 categorization framework |
| **Integration** | `brain_targets.py` - tDCS montage reference |

---

### 5.4 DBS Target Coordinates Database

| Field | Detail |
|-------|--------|
| **Targets** | STN, GPi, VIM, NAc, ALIC, etc. |
| **Primary Use** | Parkinson's disease, dystonia, OCD, depression |
| **Method** | Direct (T2 visualization) + Indirect (atlas-based from MCP) |
| **Electrode Models** | Medtronic 3389/3387, Boston Scientific Vercise, Abbott |
| **License** | Published literature (open) |
| **Integration** | `brain_targets.py` - DBS surgical planning reference |
| **Citation** | BEjjani et al., 2000; Starr et al., 2002 |

---

### 5.5 SimNIBS (Simulation for Non-Invasive Brain Stimulation) - FREE

| Field | Detail |
|-------|--------|
| **Type** | tDCS/TMS electric field simulation software |
| **Function** | Model current flow, optimize montages, estimate E-field |
| **License** | GPL v3 (open source) |
| **Download** | https://simnibs.github.io/simnibs |
| **Integration** | `brain_targets.py` - montage optimization |
| **Citation** | Thielscher et al., NeuroImage 2015; Saturnino et al., 2019 |

---

### 5.6 LEAD-DBS (Deep Brain Stimulation) - FREE

| Field | Detail |
|-------|--------|
| **Type** | DBS electrode reconstruction and visualization |
| **Atlases** | 15+ integrated atlases (AAL, MNI, Schaefer, Yeo, etc.) |
| **Function** | Connectomic DBS, electrode localization, VAT modeling |
| **License** | Open Source |
| **Download** | https://www.lead-dbs.org |
| **Integration** | `brain_targets.py` - DBS target validation |
| **Citation** | Horn & Kuhn, NeuroImage 2015 |

---

### 5.7 OpenStim / BrainStimulation.org Resources

| Field | Detail |
|-------|--------|
| **Type** | Community brain stimulation resources |
| **License** | Open Access |
| **Integration** | `brain_targets.py` - community target validation |

---

### 5.8 TMS Lab Target Database

| Field | Detail |
|-------|--------|
| **Type** | TMS target coordinates from meta-analyses |
| **License** | Open Access |
| **URL** | http://www.tmslab.org |
| **Integration** | `brain_targets.py` - TMS target verification |

---

## 6. fNIRS DATABASES

### 6.1 fNIRS Normative Database (Montreal) - FREE

| Field | Detail |
|-------|--------|
| **Type** | fNIRS normative data for frontal lobe function |
| **Subjects** | 20 healthy participants |
| **Task** | Judgment of complexity task |
| **Method** | fNIRS + frameless stereotaxy + MRI coregistration |
| **Output** | Spherical coordinate group activation maps |
| **Space** | MNI atlas registration |
| **License** | Open Access |
| **Citation** | PMC3303953; Pouliot et al., 2013 |
| **Integration** | `eeg_signal_service.py` - fNIRS normative reference |

---

### 6.2 Open Access Multimodal fNIRS Resting State Dataset - FREE

| Field | Detail |
|-------|--------|
| **Type** | Multimodal fNIRS + EEG resting-state data |
| **Subjects** | 30 healthy participants |
| **Data** | fNIRS (oxy-Hb, deoxy-Hb), EEG (64 channels) |
| **License** | Open Access (CC-BY) |
| **Download** | https://doi.org/10.3389/fnins.2020.579353 |
| **Citation** | von Luhmann et al., Frontiers in Neuroscience 2020 |

---

### 6.3 Individual Finger Movement fNIRS Dataset - FREE

| Field | Detail |
|-------|--------|
| **Type** | fNIRS dataset for individual finger movements |
| **License** | Open Access (CC-BY) |
| **Citation** | Khan et al., Frontiers in Human Neuroscience 2026 |

---

### 6.4 fNIRS Cortical Mapping References

| Field | Detail |
|-------|--------|
| **Note** | No dedicated large-scale fNIRS normative database exists |
| **Alternatives** | Build from OpenNeuro fNIRS datasets, use fNIRS-EEG combined datasets |
| **Future** | Consider building custom normative database from aggregated open datasets |
| **Integration** | `eeg_signal_service.py` - custom fNIRS pipeline |

---

## 7. GENE EXPRESSION & ELECTROPHYSIOLOGY ATLASES

### 7.1 Allen Brain Atlas (Human) - FREE

| Field | Detail |
|-------|--------|
| **Type** | Genome-wide gene expression atlas of human brain |
| **Brains** | 6 adult human brains |
| **Samples** | ~400-1,000 sites per brain |
| **Genes** | 20,000+ genes (microarray) + RNA-Seq (2 brains, 240 samples) |
| **Structures** | ~300 brain structures |
| **MRI** | T1, T2, DTI per brain |
| **Space** | MNI152 (registered) |
| **License** | Open Access |
| **API** | RESTful API (http://api.brain-map.org) |
| **SDK** | Allen SDK (Python) |
| **Download** | https://human.brain-map.org/static/download |
| **Citation** | Hawrylycz et al., Nature 2012, 489:391-9 |

---

### 7.2 Allen Brain Atlas (Mouse) - FREE

| Field | Detail |
|-------|--------|
| **Type** | Genome-wide ISH gene expression atlas of mouse brain |
| **Genes** | ~20,000 genes |
| **Connectivity** | Mouse Brain Connectivity Atlas |
| **CCF** | Common Coordinate Framework v3 (1675 specimen average) |
| **License** | Open Access |
| **Access** | https://mouse.brain-map.org |

---

### 7.3 GENSAT (Gene Expression Nervous System Atlas) - FREE

| Field | Detail |
|-------|--------|
| **Type** | Gene expression atlas of developing and adult mouse CNS |
| **Genes** | ~3,500 genes with images |
| **Mouse Lines** | ~1,500 BAC transgenic lines (GFP/Cre) |
| **Sponsor** | NIH/NINDS |
| **License** | Open Access |
| **Note** | NCBI discontinued support; data available via NINDS |
| **Access** | https://www.ninds.nih.gov/current-research/scientific-resources/gene-expression |

---

### 7.4 NeuroElectro - FREE

| Field | Detail |
|-------|--------|
| **Type** | Neuron electrophysiology properties database |
| **Measurements** | 2,344 measurements, 98 neuron types, 335 publications |
| **Properties** | Input resistance, resting membrane potential, spike amplitude, etc. |
| **Method** | Semi-automated text mining + manual curation |
| **API** | RESTful JSON/XML API |
| **License** | Open Access |
| **Access** | http://neuroelectro.org |
| **GitHub** | https://github.com/neuroelectro/neuroelectro |
| **Citation** | Tripathy et al., Frontiers in Neuroinformatics 2014 |

---

### 7.5 Blue Brain Project - FREE

| Field | Detail |
|-------|--------|
| **Type** | Biologically detailed brain simulation project |
| **Achievement** | Rat neocortical column simulation (10,000 neurons) |
| **License** | Open Access |
| **Access** | https://www.epfl.ch/research/domains/bluebrain/ |
| **Citation** | Markram et al., Cell 2015; Ramaswamy et al., 2015 |

---

## 8. TOP 10 PRIORITY INTEGRATION LIST

### For DeepSynaps Protocol Studio (Ranked by Impact & Feasibility)

| Rank | Database | Category | Maps To Service | Effort | Impact |
|------|----------|----------|----------------|--------|--------|
| **1** | **NeuroGuide (Thatcher) Normative EEG DB** | EEG Normative | `qeeg_protocol_fit.py`, `eeg_signal_service.py` | Medium | CRITICAL |
| **2** | **MNI152 Template** | MRI Atlas | `mri_atlas_service.py` | Low | CRITICAL |
| **3** | **AAL Atlas** | MRI Atlas | `mri_atlas_service.py`, `brain_regions.py` | Low | HIGH |
| **4** | **TMS Symptom-Network Atlas** | Stimulation Target | `brain_targets.py` | Low | HIGH |
| **5** | **HCP-MMP1.0 (Glasser) Atlas** | MRI Atlas | `mri_atlas_service.py` | Medium | HIGH |
| **6** | **Schaefer 2018 Parcellation** | MRI Atlas | `mri_atlas_service.py` | Low | HIGH |
| **7** | **Allen Brain Atlas (Human)** | Gene Expression | New service potential | Medium | MEDIUM |
| **8** | **OpenNeuro** | Neuroimaging Repo | `eeg_signal_service.py` | Medium | MEDIUM |
| **9** | **CHBMP Cuban Normative EEG** | EEG Normative | `qeeg_protocol_fit.py` (open alt) | Low | MEDIUM |
| **10** | **Brainnetome Atlas** | MRI Atlas | `mri_atlas_service.py`, `brain_regions.py` | Low | MEDIUM |

---

## 9. INTEGRATION MATRIX: DATABASE -> SERVICE MAPPING

### `mri_atlas_service.py` (401 lines)

| Database | Integration Type | Priority |
|----------|-----------------|----------|
| MNI152 Template | Base template for all registrations | P0 |
| AAL Atlas | Region lookup, labeling | P1 |
| Harvard-Oxford Atlas | Cortical/subcortical segmentation | P1 |
| JuBrain/SPM Anatomy | Cytoarchitectonic regions | P2 |
| FreeSurfer aparc (DK) | Surface parcellation | P1 |
| Schaefer 2018 | Functional connectivity parcels | P1 |
| HCP-MMP1.0 | High-resolution cortical areas | P1 |
| Brainnetome Atlas | Connectivity-based regions | P2 |
| Yeo 2011 Networks | Functional network assignment | P2 |
| Brodmann Atlas | Historical area reference | P3 |

### `brain_targets.py` (366 lines)

| Database | Integration Type | Priority |
|----------|-----------------|----------|
| TMS Symptom-Network Atlas | Target coordinates for all disorders | P0 |
| DLPFC Coordinates Database | Depression/anxiety TMS targets | P0 |
| tDCS Montage Database | Electrode placement reference | P1 |
| DBS Target Database | Surgical target coordinates | P2 |
| Neurosynth | Meta-analytic functional localization | P1 |
| BrainMap | Functional imaging coordinates | P2 |
| LEAD-DBS Atlases | DBS connectomic targeting | P2 |
| Allen Brain Atlas | Gene-expression informed targeting | P3 |

### `qeeg_protocol_fit.py` (472 lines)

| Database | Integration Type | Priority |
|----------|-----------------|----------|
| NeuroGuide Normative DB | Primary Z-score comparison | P0 |
| CHBMP Cuban DB | Open-source alternative norms | P1 |
| ISB-NormDB | Open-source Asian population norms | P2 |
| qEEG-Pro | Commercial alternative | P2 |
| HBI DB | European normative reference | P2 |
| MEGaNorm | MEG normative modeling framework | P3 |

### `eeg_signal_service.py` (1,466 lines)

| Database | Integration Type | Priority |
|----------|-----------------|----------|
| OpenNeuro (EEG datasets) | Open EEG data for validation | P1 |
| Cuban CHBMP | Normative cross-spectral data | P2 |
| ABIDE | Autism EEG/qEEG patterns | P2 |
| 1000 Functional Connectomes | Resting-state comparison | P3 |
| fNIRS Normative DB | fNIRS reference data | P2 |

### `brain_regions.py` (7 lines)

| Database | Integration Type | Priority |
|----------|-----------------|----------|
| AAL Atlas | Region name standardization | P1 |
| Brainnetome Atlas | Fine-grained region definitions | P1 |
| HCP-MMP1.0 | Most detailed cortical areas | P2 |
| Harvard-Oxford | Cortical/subcortical labels | P1 |

---

## 10. APPENDIX: URLS & ACCESS INFORMATION

### Normative EEG Databases
| Database | URL | Access Type |
|----------|-----|-------------|
| NeuroGuide | https://appliedneuroscience.com | Commercial |
| CHBMP Cuban | https://github.com/oldgandalf/FirstWaveCubanHumanNormativeEEGProject | Free (Zenodo) |
| ISB-NormDB | Cited in PMC8718919 | Research paper |
| qEEG-Pro | https://www.qeeg-pro.com | Commercial |
| HBI | https://www.hbimed.com | Commercial |
| MEGaNorm | https://www.nature.com/articles/s42003-026-09825-2 | Open Access paper |
| Neurometrics | Historical | Commercial (legacy) |
| SKIL | Historical | Commercial |
| NovaTech/LORETA | http://anineuroguide.com/AddonDatabases.htm | Commercial add-on |
| BrainDX | Historical | Commercial |

### MRI Brain Atlases
| Atlas | URL | Access Type |
|-------|-----|-------------|
| MNI152 | https://zenodo.org/records/15470657 | Free |
| AAL | SPM WFU-PickAtlas / NITRC | Free |
| Harvard-Oxford | FSL distribution | Free (with FSL) |
| JuBrain | https://www.fz-juelich.de/en/inm/inm-7/resources/tools/jubrain-anatomy-toolbox | Free academic |
| FreeSurfer aparc | https://surfer.nmr.mgh.harvard.edu | Free (license req.) |
| Schaefer 2018 | https://github.com/ThomasYeoLab/CBIG | Free (MIT) |
| HCP-MMP1.0 | https://balsa.wustl.edu/file/3VLx | Free |
| Brainnetome | http://atlas.brainnetome.org/download.html | Free academic |
| Yeo 2011 | FreeSurfer / Lead-DBS | Free |
| Brodmann | Multiple sources | Public domain |

### Neuroimaging Repositories
| Repository | URL | Access Type |
|------------|-----|-------------|
| OpenNeuro | https://openneuro.org | Free (CC0) |
| HCP | https://db.humanconnectome.org | Free (registration) |
| ABIDE | http://fcon_1000.projects.nitrc.org/indi/abide/ | Free |
| ADNI | https://adni.loni.usc.edu | Free (application) |
| UK Biobank | https://www.ukbiobank.ac.uk | Application required |
| NeuroVault | https://neurovault.org | Free (CC0) |
| Neurosynth | https://neurosynth.org | Free (open source) |
| BrainMap | https://www.brainmap.org | Free academic |
| 1000 FCP | http://fcon_1000.projects.nitrc.org | Free |
| fMRIDC | http://www.fmridc.org | Legacy |

### Brain Stimulation Targets
| Resource | URL | Access Type |
|----------|-----|-------------|
| TMS Symptom-Network Atlas | https://www.medrxiv.org/content/10.1101/2025.02.25.25322842v1 | Open Access |
| tDCS Montage Guide | https://thebraindriver.com/pages/tdcs-placement-montage-maps-studies | Free |
| SimNIBS | https://simnibs.github.io/simnibs | Free (GPL) |
| LEAD-DBS | https://www.lead-dbs.org | Free (open source) |
| TMS Lab | http://www.tmslab.org | Free |

### fNIRS Databases
| Database | URL | Access Type |
|----------|-----|-------------|
| fNIRS Normative (Montreal) | Cited in PMC3303953 | Open Access |
| Multimodal fNIRS+EEG | https://doi.org/10.3389/fnins.2020.579353 | Free (CC-BY) |
| Finger Movement fNIRS | Frontiers in Human Neuroscience 2026 | Free (CC-BY) |

### Gene Expression & Electrophysiology
| Resource | URL | Access Type |
|----------|-----|-------------|
| Allen Brain Atlas (Human) | https://human.brain-map.org | Free |
| Allen Brain Atlas (Mouse) | https://mouse.brain-map.org | Free |
| GENSAT | https://www.ninds.nih.gov/current-research/scientific-resources/gene-expression | Free |
| NeuroElectro | http://neuroelectro.org | Free (API) |
| Blue Brain Project | https://www.epfl.ch/research/domains/bluebrain/ | Free |

---

## LICENSE SUMMARY

| License Type | Count | Notes |
|-------------|-------|-------|
| Free/Open Access (CC0/CC-BY) | 22 | Immediate integration possible |
| Free Academic / Research Use | 8 | Institutional agreement may be needed |
| Commercial / Proprietary | 6 | NeuroGuide, qEEG-Pro, HBI, etc. |
| Application Required | 4 | ADNI, UK Biobank, HCP (registration) |
| Open Source (GPL/MIT/BSD) | 7 | Neurosynth, SimNIBS, LEAD-DBS, etc. |

---

*Report generated for DeepSynaps Protocol Studio development team.*
*Next steps: Prioritize P0 and P1 integrations; evaluate commercial license costs for normative EEG databases; set up automated atlas download pipelines.*
