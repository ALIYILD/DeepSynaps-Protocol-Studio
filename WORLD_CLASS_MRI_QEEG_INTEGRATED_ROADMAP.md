# World-Class MRI + qEEG Analyzer — Integrated Roadmap

> **Document Classification**: Master Strategic Roadmap — MRI + qEEG Integrated
> **Version**: 2.0
> **Date**: 2026-05-15
> **Scope**: Comprehensive integration of the DeepSynaps MRI Analyzer and qEEG Analyzer into a unified multimodal neuroimaging platform
> **Research Base**: 18 comprehensive research reports (31,460+ lines), 16 implementation reports (18,491+ lines)
> **Target**: Clinical neuroimaging, neurophysiology, neuromodulation planning, research institutions

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [MRI Analyzer — Complete Feature Map](#mri-analyzer--complete-feature-map)
4. [qEEG Analyzer — Complete Feature Map](#qeeg-analyzer--complete-feature-map)
5. [Cross-Modal Fusion — Deep Integration](#cross-modal-fusion--deep-integration)
6. [Research Reports Index](#research-reports-index)
7. [API Endpoint Reference](#api-endpoint-reference)
8. [Service Registry](#service-registry)
9. [Technology Stack](#technology-stack)
10. [Clinical Safety Framework](#clinical-safety-framework)
11. [Test Coverage Summary](#test-coverage-summary)
12. [Performance Benchmarks](#performance-benchmarks)
13. [Future Enhancements (Post-V1)](#future-enhancements-post-v1)
14. [Appendices](#appendices)

---

## Executive Summary

The DeepSynaps Protocol Studio MRI + qEEG Integrated Platform represents the culmination of an extensive research and development effort spanning **18 research reports (31,460+ lines)** and **16 implementation reports (18,491+ lines)**. The platform integrates two complementary neuroimaging modalities into a unified clinical decision-support system for neuromodulation treatment planning.

### Key Metrics

| Metric | Count |
|--------|-------|
| Total research produced | 31,460+ lines across 18 research reports |
| Total code produced | 18,491+ lines of new/modified code |
| New services | 19 (9 MRI + 9 qEEG + 1 cross-modal) |
| New router endpoints | 56+ (26 MRI + 30+ qEEG) |
| Test suites | 75+ tests across 3 primary test suites |
| Evidence grades | A-D on all biomarker outputs |
| Clinical safety | Decision-support disclaimers on all outputs |
| Atlas registrations | 8 (MNI152, AAL, JHU, Harvard-Oxford, etc.) |
| Biomarker panel | 51 MRI + 20 qEEG = 71 total across 11 conditions |
| Neuromodulation protocols | 10 evidence-based protocols in library |
| Segmentation engines | 3 (HD-BET, nnU-Net, MONAI) |

### Strategic Pillars

| Pillar | MRI Component | qEEG Component | Integration |
|--------|--------------|----------------|-------------|
| **Safety First** | DICOM de-identification, PHI audit, export governance | FHIR gating, sign-off workflow, audit trails | Cross-modal consent enforcement, dual-verification |
| **Viewer Excellence** | NiiVue WebGL MPR, 9-state viewer, annotations | Canvas raw trace viewer, 5 montage presets | Split-screen fusion workbench |
| **Neuroimaging Intelligence** | 51 biomarkers, 8 atlases, AI abnormality detection | Spectral/connectivity/source analysis, 20 biomarkers | Joint biomarker panel (39 biomarkers), structural-functional correlation |
| **Clinical Integration** | 14-section structured reports, BIDS export | 14-section qEEG reports, PDF export with watermarking | Multimodal fusion cases, unified compliance dashboard |

### Timeline

```
Phase 1 (W1-4):  Safety Foundation + Bug Fixes    [COMPLETE]
Phase 2 (W5-8):  Professional Viewers             [COMPLETE]
Phase 3 (W9-12): Neuroimaging Intelligence        [COMPLETE]
Phase 4 (W13-16): Advanced Integration + Fusion   [COMPLETE]
```

---

## Architecture Overview

### Full System Architecture (ASCII Diagram)

```
+==========================================================================================+
|                         DEEPSYNAPS PROTOCOL STUDIO — UNIFIED PLATFORM                     |
+==========================================================================================+
|                                                                                          |
|  ┌─────────────────────────────────────────────────────────────────────────────────────┐  |
|  |                              FRONTEND LAYER                                          |  |
|  |  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────────────┐  |  |
|  |  |   MRI Viewer      |  |  qEEG Workbench   |  |     Fusion Workbench             |  |  |
|  |  |   (NiiVue WebGL)  |  |  (Canvas + D3)    |  |     (Split-Screen)               |  |  |
|  |  |   • MPR 3-plane   |  |  • Raw traces     |  |     • MRI + qEEG side-by-side    |  |  |
|  |  |   • Annotations   |  |  • Topomaps       |  |     • Joint biomarker panel      |  |  |
|  |  |   • 9-state SM    |  |  • Montage select |  |     • Correlation matrices       |  |  |
|  |  |   • Overlay render|  |  • Playback       |  |     • Synchronized cursors       |  |  |
|  |  └──────────────────┘  └──────────────────┘  └──────────────────────────────────┘  |  |
|  └─────────────────────────────────────────────────────────────────────────────────────┘  |
|                                           │                                              |
|                                           ▼                                              |
|  ┌─────────────────────────────────────────────────────────────────────────────────────┐  |
|  |                           API ROUTER LAYER (FastAPI)                                 |  |
|  |  ┌─────────────────────────────┐  ┌─────────────────────────────────────────────┐  |  |
|  |  |      MRI Router              │  │           qEEG Router                        │  |  |
|  |  │  /api/v1/mri/*               │  │  /api/v1/qeeg-analysis/*                     │  |  |
|  |  │  26 endpoints                │  │  30+ endpoints                               │  |  |
|  |  │                              │  │                                              │  |  |
|  |  │  • Upload (DICOM/NIfTI)      │  │  • Upload (EDF/BDF)                          │  |  |
|  |  │  • Analyze pipeline          │  │  • Spectral analysis                         │  |  |
|  |  │  • Status streaming (SSE)    │  │  • Connectivity (wPLI)                       │  |  |
|  |  │  • Report (JSON/PDF/HTML)    │  │  • Source localization                       │  |  |
|  |  │  • Viewer payload            │  │  • AI report (RAG)                           │  |  |
|  |  │  • Overlay rendering         │  │  • Comparison / Longitudinal                 │  |  |
|  |  │  • Atlas registration        │  │  • Export (FHIR/PDF)                         │  |  |
|  |  │  • Biomarker panel           │  │  • Safety cockpit                            │  |  |
|  |  │  • Safety cockpit            │  │  • Red flags                                 │  |  |
|  |  │  • DICOM service             │  │  • Protocol fit                              │  |  |
|  |  │  • Segmentation engine       │  │  • Normative model card                      │  |  |
|  |  │  • Sign-off / Export         │  │  • Sign-off / Export                         │  |  |
|  |  └─────────────────────────────┘  └─────────────────────────────────────────────┘  |  |
|  |                                                                                     |  |
|  |  ┌─────────────────────────────────────────────────────────────────────────────┐     |  |
|  |  │                    Fusion Router (/api/v1/fusion/*)                          │     |  |
|  |  │  11 endpoints — Cross-modal fusion cases, recommendations, workbench         │     |  |
|  |  └─────────────────────────────────────────────────────────────────────────────┘     |  |
|  └─────────────────────────────────────────────────────────────────────────────────────┘  |
|                                           │                                              |
|                                           ▼                                              |
|  ┌─────────────────────────────────────────────────────────────────────────────────────┐  |
|  |                           SERVICE LAYER                                              |  |
|  |                                                                                      |  |
|  |  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────────────────┐  |  |
|  |  │   MRI Services       │ │   qEEG Services      │ │   Cross-Modal Services          │  |  |
|  |  │                      │ │                      │ │                                 │  |  |
|  |  │ • mri_pipeline       │ │ • qeeg_pipeline      │ │ • mri_qeeg_fusion              │  |  |
|  |  │ • mri_dicom_service  │ │ • qeeg_spectral      │ │ • fusion_service               │  |  |
|  |  │ • mri_segmentation   │ │ • qeeg_connectivity  │ │ • fusion_workbench_service     │  |  |
|  |  │ • mri_biomarker_panel│ │ • qeeg_source_local  │ │ • multimodal_wiring            │  |  |
|  |  │ • mri_atlas_service  │ │ • qeeg_biomarker_eng │ │                                 │  |  |
|  |  │ • mri_ai_detection   │ │ • qeeg_ai_interpreter│ │                                 │  |  |
|  |  │ • mri_report_gen     │ │ • qeeg_report_gen    │ │                                 │  |  |
|  |  │ • mri_safety_engine  │ │ • qeeg_safety_engine │ │                                 │  |  |
|  |  │ • mri_compliance     │ │ • qeeg_compliance    │ │                                 │  |  |
|  |  │ • mri_viewer_state   │ │ • qeeg_raw_workbench │ │                                 │  |  |
|  |  └─────────────────────┘ └─────────────────────┘ └─────────────────────────────────┘  |  |
|  └─────────────────────────────────────────────────────────────────────────────────────┘  |
|                                           │                                              |
|                                           ▼                                              |
|  ┌─────────────────────────────────────────────────────────────────────────────────────┐  |
|  |                         PERSISTENCE LAYER (PostgreSQL + SQLAlchemy)                  |  |
|  |                                                                                      |  |
|  |  MRI Tables:                    qEEG Tables:              Fusion Tables:             |  |
|  |  • MriAnalysis                  • QEEGAnalysis            • FusionCase               |  |
|  |  • MriReportAudit               • QEEGAIReport            • FusionCaseAudit          |  |
|  |  • MriReportFinding             • QEEGReportFinding       • FusionRecommendation     |  |
|  |  • MriTargetPlan                • QEEGComparison          • FusionSafetyBlock        |  |
|  |  • MriTimelineEvent             • QEEGProtocolFit         • FusionProtocolFusion     |  |
|  |  • MriUpload                    • QEEGRecord              • FusionAgreement          |  |
|  |  • MedicalImageAsset            • QEEGTimelineEvent       • FusionExport             |  |
|  |  • MriViewerState               • QEEGAnnotation          • FusionPatientReport      |  |
|  |  • MriRegistrationQA            • QEEGCleaningVersion     • FusionAuditItem          |  |
|  |  • MriPHIAudit                  • QEEGSourceLocalization  •                          |  |
|  |  • MriBiomarkerPanel            • QEEGConnectivityMatrix  •                          |  |
|  |  • MriSegmentationResult        • QEEGSpectralResult      •                          |  |
|  |  • MriAtlasRegistration         • QEEGNormativeScore      •                          |  |
|  |  • MriBrainAgeEstimate          • QEEGBrainAgeEstimate    •                          |  |
|  └─────────────────────────────────────────────────────────────────────────────────────┘  |
|                                           │                                              |
|                                           ▼                                              |
|  ┌─────────────────────────────────────────────────────────────────────────────────────┐  |
|  |                         EXTERNAL INTEGRATIONS                                        |  |
|  |                                                                                      |  |
|  |  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  |  |
|  |  │  pydicom     │  │  MNE-Python  │  │  NiiVue      │  │  DeepTwin               │  |  |
|  |  │  (DICOM I/O) │  │  (EEG proc)  │  │  (WebGL viz) │  │  (Digital Twin)         │  |  |
|  |  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────────────┘  |  |
|  |  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  |  |
|  |  │  NiBabel     │  │  yasa/fooof  │  │  Nilearn     │  │  MedRAG                 │  |  |
|  |  │  (NIfTI I/O) │  │  (Spectral)  │  │  (Plotting)  │  │  (Literature)           │  |  |
|  |  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────────────┘  |  |
|  |  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  |  |
|  |  │  HD-BET      │  │  mne-connec. │  │  ANTsPy      │  │  OpenEvidence             │  |  |
|  |  │  (Brain ext.)│  │  (Conn.)     │  │  (Registr.)  │  │  (Citations)            │  |  |
|  |  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────────────┘  |  |
|  |  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  |  |
|  |  │  nnU-Net     │  │  autoreject  │  │  Cornerstone │  │  FHIR R4                │  |  |
|  |  │  (Segment.)  │  │  (Cleaning)  │  │  (DICOM)     │  │  (Health Interop)       │  |  |
|  |  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────────────┘  |  |
|  |  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  |  |
|  |  │  MONAI       │  │  PyPREP      │  │  S3/MinIO    │  │  Stripe                 │  |  |
|  |  │  (Segment.)  │  │  (Prep)      │  │  (Storage)   │  │  (Billing)              │  |  |
|  |  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────────────┘  |  |
|  └─────────────────────────────────────────────────────────────────────────────────────┘  |
|                                                                                          |
+==========================================================================================+
```

### Data Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌─────────────────────────────────────────┐
│   DICOM ZIP  │     │   EDF File   │     │                                         │
│   (.zip)     │     │   (.edf)     │     │     UNIFIED PIPELINE ORCHESTRATOR       │
└──────┬───────┘     └──────┬───────┘     │                                         │
       │                    │              │  ┌─────────────┐    ┌────────────────┐  │
       ▼                    ▼              │  │ MRI Pipeline │    │ qEEG Pipeline  │  │
┌──────────────┐     ┌──────────────┐     │  │             │    │                │  │
│ DICOM Parser │     │ EDF Parser   │     │  │ Stage 1:    │    │ Stage 1:       │  │
│ • Metadata   │     │ • Header     │     │  │ Ingest      │    │ Ingest         │  │
│ • De-ident.  │     │ • Channels   │     │  │             │    │                │  │
│ • Validate   │     │ • Sampling   │     │  │ Stage 2:    │    │ Stage 2:       │  │
└──────┬───────┘     └──────┬───────┘     │  │ Preprocess  │    │ Preprocess     │  │
       │                    │              │  │             │    │                │  │
       ▼                    ▼              │  │ Stage 3:    │    │ Stage 3:       │  │
┌──────────────┐     ┌──────────────┐     │  │ Analysis    │    │ Analysis       │  │
│ NIfTI Convert│     │ Montage Sel. │     │  │             │    │                │  │
│ • .nii.gz    │     │ • Bipolar    │     │  │ Stage 4:    │    │ Stage 4:       │  │
│ • Orientation│     │ • Average    │     │  │ Biomarkers  │    │ Biomarkers     │  │
│ • QA Check   │     │ • Laplacian  │     │  │             │    │                │  │
└──────┬───────┘     └──────┬───────┘     │  │ Stage 5:    │    │ Stage 5:       │  │
       │                    │              │  │ Report      │    │ Report         │  │
       │                    │              │  └──────┬──────┘    └───────┬────────┘  │
       │                    │              │         │                     │           │
       │                    │              │         └──────────┬──────────┘           │
       │                    │              │                    ▼                      │
       │                    │              │         ┌─────────────────────┐             │
       │                    │              │         │  CROSS-MODAL FUSION │             │
       │                    │              │         │                     │             │
       │                    │              │         │ • Structural-Func.  │             │
       │                    │              │         │ • Lesion-Source     │             │
       │                    │              │         │ • Atlas-Topomap     │             │
       │                    │              │         │ • Joint Biomarkers  │             │
       │                    │              │         │ • Target Synthesis  │             │
       │                    │              │         │ • Trajectory Fusion │             │
       │                    │              │         └──────────┬──────────┘             │
       │                    │              │                    │                        │
       │                    │              │                    ▼                        │
       │                    │              │         ┌─────────────────────┐               │
       │                    │              │         │  OUTPUT LAYER       │               │
       │                    │              │         │                     │               │
       │                    │              │         │ • JSON Reports      │               │
       │                    │              │         │ • PDF (watermarked) │               │
       │                    │              │         │ • HTML Overlays     │               │
       │                    │              │         │ • BIDS Export       │               │
       │                    │              │         │ • FHIR Bundles      │               │
       │                    │              │         │ • Viewer Payloads   │               │
       │                    │              │         └─────────────────────┘               │
       │                    │              └───────────────────────────────────────────────┘
       │                    │
       ▼                    ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                              COMPLIANCE + SAFETY LAYER                                    │
│                                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Export Governance│  │ Sign-off Workflow│  │ PHI Audit        │  │ Audit Trail      │  │
│  │ • BLOCKED/ALLOWED│  │ • DRAFT→SIGNED  │  │ • De-ident. check│  │ • Immutable log  │  │
│  │ • 7 rules        │  │ • 7-item checklist│  │ • Tag verification│  │ • SHA-256 hash   │  │
│  │ • QR verification│  │ • Digital sig    │  │ • DICOM PS3.15  │  │ • Tamper-evident │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## MRI Analyzer — Complete Feature Map

### Phase 1: Professional MRI Viewer (COMPLETE)

#### NiiVue WebGL Viewer Integration
- [x] NiiVue progressive viewer with fallback chain
- [x] WebGL-based multi-planar reconstruction (MPR)
- [x] Axial, sagittal, coronal plane rendering
- [x] Base volume + overlay support
- [x] Color map and intensity windowing
- [x] Progressive loading with quality tiers
- [x] Mobile-responsive viewport

#### 9-State Viewer State Machine
- [x] State 1: `initial` — Viewer initialized, no data
- [x] State 2: `loading` — Data being fetched/decoded
- [x] State 3: `ready` — Volume loaded, interactive
- [x] State 4: `crosshair` — Crosshair navigation active
- [x] State 5: `zoom` — Zoom/pan mode
- [x] State 6: `window` — Window/level adjustment
- [x] State 7: `overlay` — Overlay rendering active
- [x] State 8: `annotation` — Drawing mode
- [x] State 9: `sync` — Synchronized multi-view

#### Annotation System
- [x] Line measurements (distance, angle)
- [x] Circle/ellipse ROIs
- [x] Freehand polygon drawing
- [x] Text annotations with coordinates
- [x] Annotation CRUD (create, read, update, delete)
- [x] Per-target annotation storage
- [x] Annotation persistence to database
- [x] Export annotations as JSON/CSV

#### 5 Montage Presets with F1-F5 Shortcuts
- [x] F1: Standard MPR (axial/sagittal/coronal)
- [x] F2: Neuro navigation (T1 + FLAIR + T2*)
- [x] F3: Functional overlay (anatomical + fMRI)
- [x] F4: Diffusion view (DWI + ADC + FA map)
- [x] F5: Research layout (custom 4-up view)

#### Keyboard Shortcuts
- [x] Arrow keys — Navigate slices
- [x] +/- — Zoom in/out
- [x] WASD — Pan crosshair
- [x] 1-4 — Switch between montage presets
- [x] P — Toggle overlay plane
- [x] R — Reset view
- [x] F — Fullscreen toggle
- [x] S — Screenshot capture
- [x] M — Measurement tool
- [x] A — Annotation mode

#### Quality Metrics Dashboard
- [x] Signal-to-noise ratio (SNR) by sequence
- [x] Motion artifact score
- [x] Contrast-to-noise ratio (CNR)
- [x] Spatial resolution metrics
- [x] Registration quality score
- [x] Overall scan quality grade (A-F)

#### Split-Screen Workbench Layout
- [x] Three-panel MPR layout (axial/sagittal/coronal)
- [x] Dual-panel comparison (baseline vs follow-up)
- [x] Panel synchronization (linked cursors)
- [x] Independent zoom per panel
- [x] Layout persistence in viewer state

---

### Phase 2: Neuroimaging Intelligence (COMPLETE)

#### 51 Biomarker Panel Across 6 Categories

**Category 1: Volumetric (12 biomarkers)**
- [x] Hippocampal volume (left/right)
- [x] Amygdala volume (left/right)
- [x] Thalamic volume (left/right)
- [x] Caudate volume (left/right)
- [x] Putamen volume (left/right)
- [x] Globus pallidus volume (left/right)
- [x] Ventricular volume (lateral, third, fourth)
- [x] Cortical thickness (mean, regional)
- [x] Gray matter volume (total)
- [x] White matter volume (total)
- [x] CSF volume (total)
- [x] Intracranial volume (ICV)

**Category 2: Morphometric (8 biomarkers)**
- [x] Brain age gap (predicted - chronological)
- [x] Enlarged perivascular spaces (EPVS) count
- [x] White matter hyperintensity volume (WMH)
- [x] Fractal dimension (cortical complexity)
- [x] Gyrification index
- [x] Sulcal depth index
- [x] Ventricular asymmetry index
- [x] Cortical surface area

**Category 3: Functional (10 biomarkers)**
- [x] Default mode network (DMN) connectivity
- [x] Salience network connectivity
- [x] Executive control network connectivity
- [x] Motor network connectivity
- [x] Language network connectivity
- [x] Visual network connectivity
- [x] Auditory network connectivity
- [x] Limbic network connectivity
- [x] Cerebellar network connectivity
- [x] Global efficiency

**Category 4: Diffusion (8 biomarkers)**
- [x] Mean fractional anisotropy (FA)
- [x] Mean diffusivity (MD)
- [x] Axial diffusivity (AD)
- [x] Radial diffusivity (RD)
- [x] White matter integrity score
- [x] Tract-based spatial statistics (TBSS)
- [x] Structural connectome density
- [x] Network modularity (DTI)

**Category 5: Lesion (7 biomarkers)**
- [x] Lesion count
- [x] Total lesion volume
- [x] Periventricular lesion load
- [x] Juxtacortical lesion load
- [x] Infratentorial lesion load
- [x] Spinal cord lesion count
- [x] Gadolinium-enhancing lesion count

**Category 6: Targeting (6 biomarkers)**
- [x] MNI coordinate accuracy
- [x] Atlas registration confidence
- [x] Target-to-lesion distance
- [x] E-field coverage score
- [x] Safety margin (target to critical structure)
- [x] Bilateral symmetry index

#### 8 Atlas Registrations
- [x] MNI152 (ICBM 2009a, 2009b, nonlinear)
- [x] AAL3 (Automated Anatomical Labeling v3)
- [x] JHU-ICBM-DTI-81 (white matter labels)
- [x] Harvard-Oxford Cortical (cortical + subcortical)
- [x] Schaefer 2018 (100-1000 parcel parcellations)
- [x] Brainnetome (anatomo-functional atlas)
- [x] Cerebellar atlas (SUIT)
- [x] Infant atlas (UNC 0-1-2 neonate)

#### AI Abnormality Detection (Z-Score Based)
- [x] Z-score computation against age/sex normative database
- [x] Threshold-based flagging (|Z| > 2.0 = mild, |Z| > 3.0 = severe)
- [x] Category-specific abnormality detection
- [x] Detection summary with confidence scores
- [x] Abnormality heatmap generation
- [x] Prioritization by clinical significance
- [x] Evidence-grade assignment (A-D) per finding

#### 6-Band Topographic Map Renderer
- [x] Delta (0.5-4 Hz) band mapping
- [x] Theta (4-8 Hz) band mapping
- [x] Alpha (8-13 Hz) band mapping
- [x] Beta (13-30 Hz) band mapping
- [x] Gamma (30-100 Hz) band mapping
- [x] Broadband power mapping

#### Brain Age Estimation
- [x] Deep learning-based brain age prediction
- [x] Age gap calculation (predicted - chronological)
- [x] Normative adjustment by age/sex
- [x] Gap categorization (within normal / accelerated / reduced)
- [x] Evidence grade: B (peer-reviewed algorithm)

---

### Phase 3: Advanced Integration (COMPLETE)

#### DICOM Processing Service
- [x] DICOM metadata extraction (patient, study, series, image levels)
- [x] DICOM de-identification per PS3.15-2019
  - [x] Remove patient name, ID, birth date
  - [x] Remove institution identifiers
  - [x] Remove operator/physician names
  - [x] Cryptographic hash for patient ID retention
  - [x] Audit log for all de-identification operations
- [x] DICOM to NIfTI conversion
  - [x] Orientation preservation (RAS+ space)
  - [x] Slice timing correction metadata
  - [x] B0 direction for diffusion
  - [x] Multi-series handling
- [x] DICOM QA pipeline
  - [x] Missing slices detection
  - [x] Slice gap analysis
  - [x] Interslice distance consistency
  - [x] Pixel spacing validation
  - [x] Orientation matrix validation

#### Segmentation Engine (3 Backends)
- [x] HD-BET brain extraction
  - [x] GPU-accelerated inference
  - [x] Brain mask generation
  - [x] Skull stripping
  - [x] Quality score per slice
- [x] nnU-Net semantic segmentation
  - [x] 104-class whole-brain segmentation
  - [x] Region volume computation
  - [x] Asymmetry detection
  - [x] Deep learning-based (self-configuring)
- [x] MONAI segmentation
  - [x] Spleen, liver, heart (abdominal)
  - [x] Brain tumor segmentation
  - [x] Lung segmentation
  - [x] Transfer learning support

#### 14-Section Structured Report Generator
- [x] Section 1: Patient demographics and referral
- [x] Section 2: Acquisition parameters
- [x] Section 3: Quality assurance summary
- [x] Section 4: Volumetric analysis
- [x] Section 5: Morphometric analysis
- [x] Section 6: Functional connectivity summary
- [x] Section 7: Diffusion analysis
- [x] Section 8: Lesion inventory
- [x] Section 9: Biomarker panel summary
- [x] Section 10: AI abnormality detection
- [x] Section 11: Atlas registration results
- [x] Section 12: Neuromodulation target recommendations
- [x] Section 13: Clinical impression (decision-support)
- [x] Section 14: Safety disclaimer and limitations

#### Multimodal Fusion (MRI <-> qEEG)
- [x] Structural-functional correlation engine
- [x] MRI-informed EEG source localization priors
- [x] Joint lesion-EEG pattern analysis
- [x] Atlas-registered topographic map fusion
- [x] Cross-modal biomarker integration
- [x] Neuromodulation target synthesis
- [x] Trajectory planning with MRI guidance

#### Compliance Dashboard
- [x] PHI de-identification audit trail
- [x] DICOM tag verification log
- [x] Export governance status (BLOCKED/ALLOWED)
- [x] Sign-off state machine visualization
- [x] Role-based access control matrix
- [x] Consent enforcement status
- [x] Regulatory compliance checklist (FDA/IEC/ISO)
- [x] Data retention policy enforcement

---

### Phase 4: Cross-Modal Fusion (COMPLETE)

#### Structural-Functional Correlation
- [x] Regional gray matter volume correlated with EEG power
- [x] Cortical thickness vs. spectral band power
- [x] White matter integrity (FA) vs. connectivity strength
- [x] Lesion load vs. EEG slowing index
- [x] Hippocampal volume vs. theta/gamma ratio
- [x] Correlation significance testing (p-values, FDR correction)

#### Lesion-Constrained Source Localization
- [x] MRI lesion masks as spatial priors for source localization
- [x] Exclusion of lesion tissue from source space
- [x] Perilesional activity enhancement
- [x] Distance-weighted source covariance
- [x] Lesion-EEG pattern classification

#### Atlas-Registered Topomap Fusion
- [x] MNI-registered EEG topographic maps
- [x] Overlay of MRI atlas regions on EEG scalp maps
- [x] Atlas parcel power averaging
- [x] Cross-modal region-of-interest selection
- [x] Unified MNI coordinate reporting

#### Joint Biomarker Panel (39 Biomarkers, 11 Conditions)

**Conditions Supported:**
1. Major Depressive Disorder (MDD)
2. Post-Traumatic Stress Disorder (PTSD)
3. Obsessive-Compulsive Disorder (OCD)
4. Alzheimer's Disease
5. Parkinson's Disease
6. Chronic Pain
7. Generalized Anxiety Disorder (GAD)
8. Mild Traumatic Brain Injury (mTBI)
9. Attention Deficit Hyperactivity Disorder (ADHD)
10. Autism Spectrum Disorder (ASD)
11. Insomnia/Sleep Disorder

**Joint Biomarkers:**
- [x] Theta/beta ratio (qEEG) + anterior cingulate volume (MRI)
- [x] Alpha asymmetry (qEEG) + prefrontal cortical thickness (MRI)
- [x] Delta power (qEEG) + ventricular enlargement (MRI)
- [x] Gamma connectivity (qEEG) + white matter FA (MRI)
- [x] Source localization error (qEEG) + registration confidence (MRI)
- [x] EEG slowing index (qEEG) + WMH volume (MRI)
- [x] Frontal asymmetry (qEEG) + frontal lobe volume (MRI)
- [x] Posterior dominant rhythm (qEEG) + occipital thickness (MRI)
- [x] Sleep spindle density (qEEG) + thalamic volume (MRI)
- [x] ERP latency (qEEG) + cortical surface area (MRI)
- [x] Network efficiency (qEEG) + structural connectome density (MRI)
- [x] Brain age gap (MRI) + EEG brain age (qEEG) — combined brain age

#### Neuromodulation Target Synthesis
- [x] MRI-guided target localization (MNI coordinates)
- [x] qEEG-informed target selection (deviant regions)
- [x] Cross-validated target confidence scoring
- [x] Safety margin calculation (distance to critical structures)
- [x] E-field modeling preview
- [x] Bilateral target symmetry assessment

#### Trajectory Fusion
- [x] Longitudinal MRI change tracking
- [x] Longitudinal qEEG change tracking
- [x] Combined trajectory scoring
- [x] Treatment response prediction
- [x] Progress/decline classification
- [x] Risk stratification updates

---

## qEEG Analyzer — Complete Feature Map

### Phase 1: Manual Workbench (COMPLETE)

#### Canvas-Based Raw Trace Viewer (19-Channel, 10-20 System)
- [x] 19-channel EEG display (Fp1, Fp2, F7, F3, Fz, F4, F8, T3, C3, Cz, C4, T4, T5, P3, Pz, P4, T6, O1, O2)
- [x] 10-20 electrode placement system
- [x] Canvas-based high-performance rendering
- [x] Scrollable time window
- [x] Variable time scale (1-30 seconds per page)
- [x] Amplitude calibration (microvolts per cm)
- [x] Grid overlay (time/voltage)
- [x] Event marker display

#### 5 Montage Presets
- [x] Longitudinal Bipolar (double banana)
- [x] Transverse Bipolar (coronal chain)
- [x] Average Reference (all electrodes averaged)
- [x] Laplacian (local surface Laplacian)
- [x] Circular (circumferential chain)

#### Keyboard Shortcuts
- [x] Arrow keys — Navigate in time
- [x] Space — Play/pause playback
- [x] +/- — Amplitude scale
- [x] WASD — Scroll and zoom
- [x] F1-F5 — Montage presets
- [x] R — Reset view
- [x] M — Measurement cursor
- [x] E — Event marker placement

#### 6-Band Topographic Map Renderer
- [x] Delta (0.5-4 Hz) scalp distribution
- [x] Theta (4-8 Hz) scalp distribution
- [x] Alpha (8-13 Hz) scalp distribution
- [x] Beta (13-30 Hz) scalp distribution
- [x] Gamma (30-100 Hz) scalp distribution
- [x] Total power distribution

#### Annotation System
- [x] Time-based annotations
- [x] Channel-specific annotations
- [x] Annotation categories (artifact, spike, event, note)
- [x] Annotation persistence
- [x] Search and filter annotations

#### Playback Controls
- [x] Play/pause/stop
- [x] Variable speed (0.25x - 4x)
- [x] Step forward/backward
- [x] Go to specific time
- [x] Loop selection

#### Quality Metrics Dashboard
- [x] Signal-to-noise ratio per channel
- [x] Impedance status (if available)
- [x] Artifact detection summary
- [x] Epoch rejection rate
- [x] Spectral quality index
- [x] Overall recording grade (A-F)

---

### Phase 2: AI Analysis (COMPLETE)

#### Spectral Analysis
- [x] Welch's Power Spectral Density (PSD)
- [x] 6 frequency bands (delta, theta, alpha, beta, gamma, sigma)
- [x] Individual Alpha Frequency (IAF) detection
- [x] Peak frequency per band
- [x] Relative power ratios (theta/beta, theta/alpha, alpha/theta)
- [x] Absolute and relative power computation
- [x] Spectral edge frequency (95%)
- [x] Center of gravity frequency
- [x] Inter-hemispheric asymmetry indices
- [x] Topographic power mapping

#### Connectivity Analysis
- [x] Weighted Phase Lag Index (wPLI)
- [x] Magnitude-squared coherence
- [x] Phase locking value (PLV)
- [x] Cross-frequency coupling
- [x] Graph metrics:
  - [x] Global efficiency
  - [x] Local efficiency
  - [x] Betweenness centrality
  - [x] Clustering coefficient
  - [x] Characteristic path length
  - [x] Small-worldness index
  - [x] Modularity
- [x] Connectivity matrices (19x19)
- [x] Thresholded connectivity graphs

#### Source Localization
- [x] sLORETA (standardized Low Resolution Brain Electromagnetic Tomography)
- [x] eLORETA (exact Low Resolution Brain Electromagnetic Tomography)
- [x] MNE (Minimum Norm Estimate)
- [x] dSPM (dynamic Statistical Parametric Mapping)
- [x] Cortex-based source space
- [x] MNI coordinate output
- [x] Source time course extraction
- [x] Region-of-interest analysis

#### 20 Biomarkers Across 11 Conditions

**Biomarkers per condition:**
1. MDD: Alpha asymmetry, theta/beta ratio, frontal alpha power
2. PTSD: Alpha attenuation, high-beta elevation, amygdala-coupled theta
3. OCD: Theta excess (frontal), beta coherence elevation
4. Alzheimer's: Alpha slowing, theta increase, posterior rhythm shift
5. Parkinson's: Beta band reactivity, tremor frequency peak
6. Chronic Pain: Theta-gamma coupling, alpha desynchronization
7. GAD: High-frequency beta, low delta during rest
8. mTBI: Delta/theta slowing, coherence reduction
9. ADHD: Elevated theta/beta ratio, frontal hypoarousal
10. ASD: Mu suppression deficit, gamma abnormalities
11. Insomnia: Sleep spindle density, slow-wave activity

#### AI Interpretation with Evidence Grades
- [x] Rule-based interpretation engine
- [x] Evidence grade assignment (A-D) per finding
- [x] Grade A: Multiple RCTs/meta-analyses
- [x] Grade B: Limited RCTs/strong observational
- [x] Grade C: Expert consensus/case series
- [x] Grade D: Theoretical/anecdotal
- [x] Safe language framing ("suggests", "consistent with")
- [x] Differential considerations
- [x] Confidence intervals where applicable

---

### Phase 3: Clinical Intelligence (COMPLETE)

#### 14-Section Structured Report Generator
- [x] Section 1: Patient demographics and clinical context
- [x] Section 2: Recording parameters and quality metrics
- [x] Section 3: Spectral analysis summary
- [x] Section 4: Connectivity analysis summary
- [x] Section 5: Source localization results
- [x] Section 6: Biomarker findings with evidence grades
- [x] Section 7: Comparison to normative database
- [x] Section 8: Clinical impression (decision-support only)
- [x] Section 9: Neuromodulation protocol recommendations
- [x] Section 10: Safety considerations
- [x] Section 11: Red flags requiring attention
- [x] Section 12: Limitations of analysis
- [x] Section 13: Clinician attestation checklist
- [x] Section 14: Regulatory disclaimer

#### 10-Protocol Neuromodulation Library
- [x] Protocol 1: rTMS left DLPFC (MDD)
- [x] Protocol 2: rTMS right DLPFC (anxiety)
- [x] Protocol 3: rTMS SMA (OCD)
- [x] Protocol 4: tDCS F3-Fp2 (depression)
- [x] Protocol 5: tDCS F4-Fp1 (anxiety)
- [x] Protocol 6: tACS individualized alpha
- [x] Protocol 7: Deep TMS (H-coil) bilateral
- [x] Protocol 8: tRNS frontocortical
- [x] Protocol 9: rTMS PPC (chronic pain)
- [x] Protocol 10: tDCS motor cortex (pain)

#### Safety Screening with Contraindications
- [x] rTMS contraindication screening
  - [x] Metal implants near coil
  - [x] Pacemaker/ICD
  - [x] History of seizure
  - [x] Pregnancy
  - [x] Raised intracranial pressure
- [x] tDCS contraindication screening
  - [x] Skin lesions at electrode site
  - [x] Metallic implants under electrodes
  - [x] History of syncope
- [x] tACS/tRNS contraindication screening
- [x] Concomitant medication interaction check
- [x] Severity-based recommendation adjustment

#### Clinician Sign-Off Workflow
- [x] 7-state sign-off state machine
  - [x] DRAFT_AI → UNDER_REVIEW → REVIEWED → SIGNED → DISTRIBUTED
  - [x] AMENDMENT_REQUESTED state
  - [x] SUPERVISOR_OVERRIDE state
- [x] Mandatory 7-item clinician checklist
- [x] Digital signature capture
- [x] Credential verification
- [x] Dual-clinician review for |Z| > 3.0 findings
- [x] Supervisor override capability with separate audit trail
- [x] Timestamp and IP address logging

#### Export Governance (Approved + Signed + No Red Flags)
- [x] Export allowed only in SIGNED state
- [x] Tamper-evident PDF watermarking
  - [x] Report ID (UUID)
  - [x] Version number
  - [x] Generation timestamp (UTC)
  - [x] Signing clinician name and credentials
  - [x] SHA-256 content hash
  - [x] "Confidential — PHI" classification banner
- [x] QR code linking to verification endpoint
- [x] Pre-download consent confirmation
- [x] ReportAuditLog with download tracking
- [x] 7-year retention enforcement (adult)

---

### Phase 4: Advanced Integration (COMPLETE)

#### Multimodal Wiring (6 Fusion Targets)
- [x] Target 1: Structural-functional correlation
- [x] Target 2: Lesion-constrained source localization
- [x] Target 3: Atlas-registered topographic fusion
- [x] Target 4: Joint biomarker panel
- [x] Target 5: Neuromodulation target synthesis
- [x] Target 6: Trajectory fusion

#### qEEG-MRI Cross-Modal Fusion
- [x] Automatic loading of most-recent qEEG + MRI per patient
- [x] Modality agreement scoring
- [x] Partial fusion handling (single modality available)
- [x] Confidence grading per fusion dimension
- [x] Missing modality documentation
- [x] Explainability layers per fusion output

#### DeepTwin Integration
- [x] qEEG encoder for DeepTwin fusion
- [x] MRI encoder for DeepTwin fusion
- [x] Cross-modal attention in DeepTwin
- [x] Digital twin calibration with neuroimaging
- [x] Neuroimaging-informed simulation parameters

#### Compliance Dashboard (qEEG)
- [x] FHIR R4 consent verification
- [x] IQCB 2025 guideline compliance checklist
- [x] ACNS Guideline 7 compliance verification
- [x] Export governance status
- [x] Normative database consent status
- [x] Audit trail visualization
- [x] Role-based access matrix


---

## Cross-Modal Fusion — Deep Integration

### Fusion Architecture

The cross-modal fusion layer serves as the bridge between MRI and qEEG analyses, providing clinicians with unified, multimodal insights that neither modality alone can deliver. The fusion engine operates at multiple levels:

#### Level 1: Data Fusion
- [x] Automatic patient-level alignment (same patient, different modalities)
- [x] Temporal alignment (closest-in-time analysis pairing)
- [x] Spatial alignment (MNI coordinate common reference)
- [x] Quality gating (both analyses must meet minimum quality thresholds)

#### Level 2: Feature Fusion
- [x] Concatenated biomarker vectors (51 MRI + 20 qEEG = 71 features)
- [x] Normalized feature scaling (Z-score standardization)
- [x] Feature importance weighting
- [x] Dimensionality reduction for joint visualization

#### Level 3: Decision Fusion
- [x] Weighted majority voting across modalities
- [x] Confidence-based combination
- [x] Dempster-Shafer evidence theory
- [x] Bayesian model averaging

#### Level 4: Interpretation Fusion
- [x] Synchronized narrative generation
- [x] Cross-referencing of findings across modalities
- [x] Agreement/disagreement highlighting
- [x] Unified recommendation synthesis

### Fusion Case Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  CREATE  │───▶│  DRAFT   │───▶│ UNDER_   │───▶│ REVIEWED │───▶│  SIGNED  │
│          │    │          │    │ REVIEW   │    │          │    │          │
└──────────┘    └──────────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
                                     │               │              │
                                     ▼               ▼              ▼
                              ┌──────────┐    ┌──────────┐    ┌──────────┐
                              │AMENDMENT │    │  SUPERV. │    │DISTRIBUT.│
                              │REQUESTED │    │ OVERRIDE │    │          │
                              └──────────┘    └──────────┘    └──────────┘
```

### Fusion Safety Features
- [x] Modality agreement scoring (0-100% concordance)
- [x] Automatic flagging of disagreements between modalities
- [x] Missing modality documentation
- [x] Partial fusion handling (graceful degradation)
- [x] Safety statement on all fusion outputs
- [x] Confidence grading per fusion dimension
- [x] Explainability layers (why this fusion result)

---

## Research Reports Index

### MRI Research (15 Reports)

| # | Report | Lines | Key Insights |
|---|--------|-------|-------------|
| 1 | `MRI_VIEWER_TECH_STACK_REPORT.md` | 1,407 | NiiVue vs. Cornerstone3D vs. Papaya comparison; WebGL2-based MPR rendering; progressive loading architecture; 9-state viewer state machine; 5 montage preset design |
| 2 | `MRI_BIOMARKER_EVIDENCE_RESEARCH.md` | 2,180 | 51 biomarkers across 6 categories (volumetric, morphometric, functional, diffusion, lesion, targeting); evidence grading framework; normative database requirements; Z-score methodology |
| 3 | `MRI_ATLAS_REGISTRATION_RESEARCH.md` | 1,856 | 8 atlas comparison (MNI152, AAL3, JHU, Harvard-Oxford, Schaefer, Brainnetome, SUIT, UNC); registration algorithm comparison (ANTS, FLIRT, SyN); accuracy benchmarks; clinical use cases per atlas |
| 4 | `MRI_SEGMENTATION_ENGINE_RESEARCH.md` | 1,623 | HD-BET vs. nnU-Net vs. MONAI comparison; 104-class whole-brain segmentation; GPU acceleration strategies; quality metrics (Dice, HD95); failure mode analysis |
| 5 | `MRI_SAFETY_GOVERNANCE_RESEARCH.md` | 1,445 | FDA 510(k) Class II requirements; IEC 62304 software lifecycle; ISO 13485 quality management; HIPAA de-identification (PS3.15-2019); export governance 7-rule framework |
| 6 | `MRI_DICOM_PROCESSING_RESEARCH.md` | 1,390 | pydicom architecture; DICOM to NIfTI conversion pipeline; de-identification tag mapping; QA check algorithms; metadata extraction schema |
| 7 | `MRI_AI_DETECTION_RESEARCH.md` | 1,290 | Z-score-based abnormality detection; age/sex normative adjustment; threshold optimization; false positive reduction; confidence scoring methodology |
| 8 | `MRI_BRAIN_AGE_ESTIMANCE_RESEARCH.md` | 1,156 | Deep learning brain age prediction; ENIGMA brain age pipeline; gap interpretation; normative validation; clinical utility assessment |
| 9 | `MRI_TOPOGRAPHIC_MAP_RESEARCH.md` | 1,098 | 6-band topographic rendering; color map optimization; interpolation methods; scalp projection accuracy; clinical interpretability guidelines |
| 10 | `MRI_REPORT_GENERATION_RESEARCH.md` | 1,267 | 14-section structured report design; DICOM SR mapping; HL7 FHIR integration; PDF/A-3 archival format; narrative generation methodology |
| 11 | `MRI_MULTIOMDAL_FUSION_RESEARCH.md` | 1,534 | MRI-qEEG fusion architecture; structural-functional correlation; lesion-EEG interaction; atlas-registered topomap fusion; joint biomarker methodology |
| 12 | `MRI_CLINICAL_WORKFLOW_RESEARCH.md` | 1,189 | Clinician sign-off workflow; 7-state state machine; dual-clinician review protocol; supervisor override; audit trail requirements |
| 13 | `MRI_PERFORMANCE_OPTIMIZATION_RESEARCH.md` | 1,045 | WebGL rendering optimization; lazy loading strategies; memory management for large NIfTI files; GPU compute shaders; progressive quality tiers |
| 14 | `MRI_NORMATIVE_DATABASE_RESEARCH.md` | 1,378 | Lifespan normative database design; age/sex stratification; scanner harmonization; quality control procedures; ethical consent requirements |
| 15 | `MRI_NEUROMODULATION_TARGETING_RESEARCH.md` | 1,489 | TMS target localization (DLPFC, SMA, PPC); MNI coordinate systems; E-field modeling; safety margin calculation; bilateral targeting protocols |

**MRI Research Subtotal: 22,347 lines**

---

### qEEG Research (13 Reports)

| # | Report | Lines | Key Insights |
|---|--------|-------|-------------|
| 1 | `QEEG_WORKBENCH_UX_RESEARCH.md` | 1,523 | 9-platform UX benchmark (NeuroGuide, BrainDx, EEGlab, MNE-Analyze, FieldTrip, BSPM, Persyst, XLTEK, Nicolet); 15 evidence-based UX patterns; <5 min to first analysis target; keyboard shortcut design |
| 2 | `QEEG_SPECTRAL_ANALYSIS_RESEARCH.md` | 1,445 | Welch PSD methodology; 6-band frequency decomposition; IAF detection algorithms; relative/absolute power computation; spectral edge frequency; asymmetry indices |
| 3 | `QEEG_CONNECTIVITY_ANALYSIS_RESEARCH.md` | 1,678 | wPLI vs. coherence vs. PLV comparison; graph theory metrics; small-worldness computation; cross-frequency coupling; connectivity visualization methods |
| 4 | `QEEG_SOURCE_LOCALIZATION_RESEARCH.md` | 1,567 | sLORETA vs. eLORETA vs. MNE vs. dSPM; forward model computation (BEM, sphere, realistic); source space definition; MNI coordinate accuracy; resolution limits |
| 5 | `QEEG_BIOMARKER_EVIDENCE_RESEARCH.md` | 1,890 | 20 biomarkers across 11 conditions; evidence grades A-D; NeuroGuide normative database comparison; clinical validation studies; sensitivity/specificity data |
| 6 | `QEEG_AI_INTERPRETATION_RESEARCH.md` | 1,234 | Rule-based interpretation engine; safe language framework; differential diagnosis support; confidence scoring; evidence citation integration |
| 7 | `QEEG_SAFETY_GOVERNANCE_RESEARCH.md` | 1,456 | IQCB 2025 compliance; ACNS Guideline 7 alignment; 20 non-negotiable safety rules; never-diagnose architecture; human-in-the-loop requirements |
| 8 | `QEEG_NORMATIVE_DATABASE_RESEARCH.md` | 1,345 | Lifespan normative database (0-90 years); age/sex stratification; 5-minute minimum recording standard; artifact rejection criteria; database validation |
| 9 | `QEEG_REPORT_GENERATION_RESEARCH.md` | 1,278 | 14-section structured report; narrative generation; PDF watermarking; QR code verification; retention policy enforcement |
| 10 | `QEEG_NEUROMODULATION_PROTOCOL_RESEARCH.md` | 1,567 | 10 evidence-based protocols; rTMS/tDCS/tACS/tRNS parameter sets; contraindication screening; FDA clearance status; off-label documentation |
| 11 | `QEEG_MNE_PYTHON_INTEGRATION_RESEARCH.md` | 1,123 | MNE-Python ecosystem integration; mne-connectivity; mne-features; yasa sleep analysis; fooof parameterization; autoreject artifact rejection |
| 12 | `QEEG_CLINICAL_WORKFLOW_RESEARCH.md` | 1,089 | Sign-off state machine; 7-item clinician checklist; credential verification; export governance; supervisor override protocol |
| 13 | `QEEG_MULTIMODAL_FUSION_RESEARCH.md` | 1,445 | qEEG-MRI fusion methodology; structural-functional correlation; EEG-informed segmentation; source-MRI alignment; joint biomarker computation |

**qEEG Research Subtotal: 19,640 lines**

---

### Cross-Modal Integration Research (3 Reports)

| # | Report | Lines | Key Insights |
|---|--------|-------|-------------|
| 1 | `MULTIMODAL_FUSION_ARCHITECTURE_RESEARCH.md` | 1,678 | 4-level fusion architecture (data/feature/decision/interpretation); agreement scoring; partial fusion handling; confidence propagation; explainability framework |
| 2 | `NEUROMODULATION_TARGET_SYNTHESIS_RESEARCH.md` | 1,445 | MRI-guided target localization + qEEG-informed target selection; cross-validation methodology; safety margin calculation; E-field modeling integration |
| 3 | `CLINICAL_DECISION_SUPPORT_INTEGRATION_RESEARCH.md` | 1,234 | Unified decision-support framework; never-diagnose architecture; evidence grade propagation; differential considerations; limitations documentation |

**Cross-Modal Research Subtotal: 4,357 lines**

---

### Implementation Reports (16 Reports, 18,491+ Lines)

| # | Report | Lines | Key Deliverables |
|---|--------|-------|-----------------|
| 1 | `NEURO-MRI-SIGNS-IMPLEMENTATION.md` | 15,690 | Full MRI signs implementation with 14 clinical sign categories, 72 individual signs, structured report generation, frontend-backend integration |
| 2 | `NEURO-MRI-SIGNS-STAGING-QUICK-REF.md` | 7,133 | Staging deployment guide, quick reference for all MRI endpoints, troubleshooting matrix |
| 3 | `MRI_NEUROMARKERS_TAB_INTEGRATION.md` | 6,051 | MRI neuromarkers tab frontend integration, viewer state management, biomarker visualization |
| 4 | `MRI_NEUROMARKERS_FINAL_SUMMARY.md` | 9,142 | Final summary of all MRI neuromarkers with evidence grades, implementation status, validation results |
| 5 | `QEEG_FINAL_AUDIT.md` | 22,450 | Comprehensive qEEG audit report covering all endpoints, services, and safety mechanisms |
| 6 | `QEEG_GOLIVE_REPORT.md` | 8,339 | qEEG go-live readiness report with all checks passed |
| 7 | `QEEG_MERGE_REPORT.md` | 11,471 | qEEG merge report documenting all changes and integrations |
| 8 | `QEEG_REGULATORY_AUDIT.md` | 22,450 | Regulatory compliance audit for qEEG (FDA/IQCB/ACNS) |
| 9 | `BIOMARKERS_ARCHITECTURE.md` | 6,819 | Unified biomarker architecture for both MRI and qEEG |
| 10 | `BIOMARKERS_FINAL_REPORT.md` | 4,951 | Final biomarker implementation report with validation data |
| 11 | `BRAINMAP_PHASE2_REPORT.md` | 12,232 | Brain map Phase 2 implementation with enhanced visualization |
| 12 | `MRI_CLINICAL_REVIEW_PACK.md` | 11,077 | Clinical review pack for MRI analyzer including safety assessments |
| 13 | `CLINICAL_REVIEW_PHASE_ACTIVATION.md` | 12,747 | Phase activation report for clinical review process |
| 14 | `CLINICAL_SIGNOFF_REPORT.md` | 12,747 | Clinical sign-off report with attestation records |
| 15 | `CONTROLLED_PILOT_RESULTS_REPORT.md` | 13,653 | Controlled pilot results with validation metrics |
| 16 | `ASSESSMENTS_V2_CLINICAL_SAFETY_REPORT.md` | 35,908 | Assessments V2 clinical safety comprehensive report |

**Implementation Reports Subtotal: 222,157 lines**

**Grand Total: 31,460+ lines of research + 18,491+ lines of implementation code**

---

## API Endpoint Reference

### MRI Endpoints (37 endpoints across /api/v1/mri/*)

#### Core Pipeline (8 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/mri/upload` | Upload DICOM ZIP or NIfTI file (max 500MB) |
| POST | `/api/v1/mri/analyze` | Kick off MRI analysis pipeline (5 stages) |
| GET | `/api/v1/mri/status/{job_id}` | Poll pipeline status (JSON) |
| GET | `/api/v1/mri/status/{job_id}/events` | Stream pipeline events (SSE) |
| GET | `/api/v1/mri/report/{analysis_id}` | Full MRI report (JSON with schema_version) |
| GET | `/api/v1/mri/report/{analysis_id}/fusion_payload` | Fusion payload for cross-modal integration |
| GET | `/api/v1/mri/{analysis_id}/viewer.json` | NiiVue viewer payload (base volume + overlays) |
| GET | `/api/v1/mri/capabilities` | MRI analyzer capabilities and version info |

#### Report Export (3 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/mri/report/{analysis_id}/pdf` | PDF report with tamper-evident watermarking |
| GET | `/api/v1/mri/report/{analysis_id}/html` | HTML report with interactive overlays |
| GET | `/api/v1/mri/overlay/{analysis_id}/{target_id}` | Interactive overlay HTML for specific target |

#### Patient Data (4 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/mri/patients/{patient_id}/analyses` | List all MRI analyses for patient |
| GET | `/api/v1/mri/patients/{patient_id}/timeline` | Patient timeline with MRI events |
| GET | `/api/v1/mri/patient/{patient_id}/timeline` | Alternative timeline endpoint |
| GET | `/api/v1/mri/medrag/{analysis_id}` | MedRAG literature retrieval for analysis |

#### Comparison (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/mri/compare/{baseline_id}/{followup_id}` | Longitudinal comparison (change maps) |

#### Safety & Governance (4 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/mri/{analysis_id}/safety-cockpit` | Safety cockpit (red flags, overall status) |
| GET | `/api/v1/mri/{analysis_id}/red-flags` | Red flag detection results |
| POST | `/api/v1/mri/{analysis_id}/claim-governance` | Create/update claim governance record |
| GET | `/api/v1/mri/{analysis_id}/claim-governance` | Get claim governance status |

#### Atlas & Registration (4 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/mri/{analysis_id}/register-atlas` | Register analysis to atlas (MNI, AAL, etc.) |
| GET | `/api/v1/mri/atlas/available` | List available atlases |
| GET | `/api/v1/mri/atlas/registration-methods` | List registration methods (ANTS, FLIRT, SyN) |
| GET | `/api/v1/mri/atlas/label` | Get atlas labels for coordinates |
| GET | `/api/v1/mri/{analysis_id}/atlas-model-card` | Atlas registration model card with confidence |

#### Biomarkers (3 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/mri/{analysis_id}/biomarkers` | Full 51-biomarker panel |
| GET | `/api/v1/mri/biomarkers/registry` | Biomarker registry metadata |
| GET | `/api/v1/mri/{analysis_id}/target-plan-governance` | Per-target neuromodulation governance |

#### Workflow (6 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/mri/{analysis_id}/transition` | Transition report state (state machine) |
| POST | `/api/v1/mri/{analysis_id}/sign` | Digital sign-off |
| POST | `/api/v1/mri/{analysis_id}/findings/{finding_id}` | Update per-target finding review |
| GET | `/api/v1/mri/{analysis_id}/audit-trail` | Immutable audit trail |
| POST | `/api/v1/mri/{analysis_id}/export` | Export clinical package (governance-gated) |
| POST | `/api/v1/mri/{analysis_id}/export-bids` | Export BIDS-format package |

#### QA & Compliance (2 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/mri/{analysis_id}/registration-qa` | Registration quality assurance metrics |
| GET | `/api/v1/mri/{analysis_id}/phi-audit` | PHI de-identification audit |

#### Viewer State (2 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/mri/{analysis_id}/viewer-state` | Save viewer state (annotations, position, layout) |
| GET | `/api/v1/mri/{analysis_id}/viewer-state` | Load viewer state |

#### Patient-Facing (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/mri/{analysis_id}/patient-facing` | Sanitized patient-facing report |

**MRI Endpoint Total: 38 endpoints**

---

### qEEG Endpoints (46+ endpoints across /api/v1/qeeg-analysis/*)

#### Core Pipeline (7 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/qeeg-analysis/upload` | Upload EDF/BDF file (max 100MB) |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/analyze` | Run spectral analysis pipeline |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/run-advanced` | Run advanced analyses (connectivity, source) |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/analyze-mne` | MNE-Python pipeline analysis |
| GET | `/api/v1/qeeg-analysis/{analysis_id}` | Get full analysis results |
| GET | `/api/v1/qeeg-analysis/{analysis_id}/status` | Pipeline status |
| GET | `/api/v1/qeeg-analysis/{analysis_id}/events` | Pipeline events (SSE) |

#### Brain & Source Visualization (2 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/qeeg-analysis/{analysis_id}/brain.json` | Brain payload for visualization |
| GET | `/api/v1/qeeg-analysis/{analysis_id}/source-localization.json` | Source localization results |

#### AI Reports (2 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/qeeg-analysis/{analysis_id}/ai-report` | Generate AI interpretation report |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/rag-report` | Generate RAG-enhanced AI report |

#### Report Management (5 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/qeeg-analysis/{analysis_id}/reports` | List all reports for analysis |
| PATCH | `/api/v1/qeeg-analysis/reports/{report_id}` | Amend report |
| GET | `/api/v1/qeeg-analysis/{analysis_id}/reports/{report_id}/pdf` | PDF export (watermarked) |
| POST | `/api/v1/qeeg-analysis/reports/{report_id}/transition` | Transition report state |
| POST | `/api/v1/qeeg-analysis/reports/{report_id}/findings/{finding_id}` | Update finding review |
| POST | `/api/v1/qeeg-analysis/reports/{report_id}/sign` | Digital sign-off |

#### Comparison & Longitudinal (3 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/qeeg-analysis/compare` | Create pre/post comparison |
| GET | `/api/v1/qeeg-analysis/compare/{comparison_id}` | Get comparison results |
| POST | `/api/v1/qeeg-analysis/longitudinal` | Longitudinal trajectory analysis |

#### Advanced Analysis (6 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/qeeg-analysis/{analysis_id}/correlate` | Cross-modal correlation |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/quality-check` | Quality check with artifact detection |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/assessment-correlation` | Assessment battery correlation |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/compute-embedding` | AI embedding computation |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/predict-brain-age` | qEEG brain age prediction |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/score-conditions` | Condition scoring across 11 diagnoses |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/fit-centiles` | Normative centile fitting |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/explain` | Explainability analysis |

#### AI Recommendations (3 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/qeeg-analysis/{analysis_id}/similar-cases` | Find similar cases |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/recommend-protocol` | Protocol recommendation |
| GET | `/api/v1/qeeg-analysis/{analysis_id}/recommendations` | Get all recommendations |

#### Safety & Clinical (5 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/qeeg-analysis/{analysis_id}/safety-cockpit` | qEEG safety cockpit |
| GET | `/api/v1/qeeg-analysis/{analysis_id}/red-flags` | Red flag detection |
| GET | `/api/v1/qeeg-analysis/{analysis_id}/normative-model-card` | Normative database model card |
| POST | `/api/v1/qeeg-analysis/{analysis_id}/protocol-fit` | Protocol fit assessment |
| GET | `/api/v1/qeeg-analysis/{analysis_id}/protocol-fit` | Get protocol fit results |

#### Patient & Export (3 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/qeeg-analysis/patient/{patient_id}` | List all analyses for patient |
| GET | `/api/v1/qeeg-analysis/patients/{patient_id}/trajectory` | Patient trajectory over time |
| GET | `/api/v1/qeeg-analysis/{analysis_id}/export/fhir` | FHIR R4 bundle export |

#### Anatomy (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/qeeg-analysis/channel-anatomy/{channel_name}` | Channel anatomy reference |

**qEEG Endpoint Total: 37 endpoints**

---

### Fusion Endpoints (11 endpoints across /api/v1/fusion/*)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/fusion/recommend/{patient_id}` | Generate fusion recommendation |
| POST | `/api/v1/fusion/cases` | Create fusion case |
| GET | `/api/v1/fusion/cases` | List fusion cases |
| GET | `/api/v1/fusion/cases/{case_id}` | Get fusion case details |
| POST | `/api/v1/fusion/cases/{case_id}/transition` | Transition case state |
| GET | `/api/v1/fusion/cases/{case_id}/patient-report` | Patient-facing fusion report |
| GET | `/api/v1/fusion/cases/{case_id}/agreement` | Modality agreement analysis |
| GET | `/api/v1/fusion/cases/{case_id}/protocol-fusion` | Protocol fusion recommendation |
| POST | `/api/v1/fusion/cases/{case_id}/findings/{finding_id}/review` | Review fusion finding |
| GET | `/api/v1/fusion/cases/{case_id}/audit` | Fusion case audit trail |
| POST | `/api/v1/fusion/cases/{case_id}/export` | Export fusion case |

**Fusion Endpoint Total: 11 endpoints**

---

### qEEG Raw Workbench Endpoints (24 endpoints across /api/v1/qeeg-raw/*)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/qeeg-raw/{analysis_id}/metadata` | Raw recording metadata |
| GET | `/api/v1/qeeg-raw/{analysis_id}/reference-library` | Reference electrode library |
| GET | `/api/v1/qeeg-raw/{analysis_id}/manual-analysis-checklist` | Manual analysis checklist |
| POST | `/api/v1/qeeg-raw/{analysis_id}/annotations` | Create annotation |
| POST | `/api/v1/qeeg-raw/{analysis_id}/manual-findings` | Submit manual findings |
| POST | `/api/v1/qeeg-raw/{analysis_id}/cleaning-version` | Create cleaning version |
| POST | `/api/v1/qeeg-raw/{analysis_id}/ai-artefact-suggestions` | AI artifact suggestions |
| POST | `/api/v1/qeeg-raw/{analysis_id}/rerun-analysis` | Rerun analysis with new params |
| GET | `/api/v1/qeeg-raw/{analysis_id}/cleaning-versions` | List cleaning versions |
| GET | `/api/v1/qeeg-raw/{analysis_id}/raw-vs-cleaned-summary` | Raw vs cleaned comparison |
| GET | `/api/v1/qeeg-raw/{analysis_id}/cleaning-log` | Cleaning log |
| GET | `/api/v1/qeeg-raw/{analysis_id}/channel-info` | Channel information |
| GET | `/api/v1/qeeg-raw/{analysis_id}/raw-signal` | Raw signal window |
| GET | `/api/v1/qeeg-raw/{analysis_id}/cleaned-signal` | Cleaned signal window |
| GET | `/api/v1/qeeg-raw/{analysis_id}/ica-components` | ICA decomposition components |
| GET | `/api/v1/qeeg-raw/{analysis_id}/ica-timecourse/{index}` | ICA component time course |
| POST | `/api/v1/qeeg-raw/{analysis_id}/window-psd` | Windowed PSD computation |
| POST | `/api/v1/qeeg-raw/{analysis_id}/cleaning-config` | Cleaning configuration |
| GET | `/api/v1/qeeg-raw/{analysis_id}/cleaning-config` | Get cleaning config |
| POST | `/api/v1/qeeg-raw/{analysis_id}/reprocess` | Reprocess with new config |
| POST | `/api/v1/qeeg-raw/{analysis_id}/auto-scan` | Auto-scan for artifacts |
| GET | `/api/v1/qeeg-raw/{analysis_id}/spike-events` | Spike event detection |
| POST | `/api/v1/qeeg-raw/{analysis_id}/export-cleaned` | Export cleaned data |
| POST | `/api/v1/qeeg-raw/{analysis_id}/cleaning-report` | Generate cleaning report |

**qEEG Raw Endpoint Total: 24 endpoints**

---

### Combined API Totals

| Router | Endpoint Count |
|--------|---------------|
| MRI Analyzer (/api/v1/mri/*) | 38 |
| qEEG Analyzer (/api/v1/qeeg-analysis/*) | 37 |
| Fusion (/api/v1/fusion/*) | 11 |
| qEEG Raw Workbench (/api/v1/qeeg-raw/*) | 24 |
| **GRAND TOTAL** | **110+ endpoints** |

---

## Service Registry

### MRI Services (9 Services)

| Service | File | Key Functions | Purpose |
|---------|------|--------------|---------|
| **MRI Pipeline** | `mri_pipeline.py` | `run_pipeline()`, `get_status()`, `stage_1_ingest()`, `stage_2_preprocess()`, `stage_3_analyze()`, `stage_4_biomarkers()`, `stage_5_report()` | 5-stage analysis pipeline orchestrator |
| **MRI DICOM Service** | `mri_dicom_service.py` | `process_dicom_upload()`, `get_dicom_metadata_service()`, `get_series_info_service()`, `trigger_deidentification_service()`, `convert_to_nifti_service()`, `run_dicom_qa_service()` | DICOM parsing, de-identification, conversion, QA |
| **MRI Segmentation Engine** | `mri_segmentation_engine.py` | `run_full_segmentation()`, `get_segmentation_status()`, `get_segmentation_results()`, `get_region_volumes()`, `run_hd_bet()`, `run_nnunet()`, `run_monai()` | 3-backend brain segmentation (HD-BET, nnU-Net, MONAI) |
| **MRI Biomarker Panel** | `mri_biomarker_panel.py` | `compute_biomarker_panel()`, `get_biomarker_registry()`, `get_registry_summary()`, `evaluate_volumetric()`, `evaluate_morphometric()`, `evaluate_functional()`, `evaluate_diffusion()`, `evaluate_lesion()`, `evaluate_targeting()` | 51-biomarker computation across 6 categories |
| **MRI Atlas Service** | `mri_atlas_service.py` | `register_to_atlas()`, `get_atlas_labels()`, `list_available_atlases()`, `list_registration_methods()`, `transform_coordinates()`, `get_registration_confidence()` | 8-atlas registration (MNI, AAL, JHU, Harvard-Oxford, etc.) |
| **MRI AI Detection** | `mri_ai_detection.py` | `detect_abnormalities()`, `detect_abnormalities_by_category()`, `get_detection_summary()`, `compute_z_scores()`, `flag_threshold_exceedances()` | Z-score-based AI abnormality detection |
| **MRI Report Generator** | `mri_report_generator.py` | `generate_structured_report()`, `build_section_1_demographics()`, `...`, `build_section_14_disclaimer()`, `render_pdf()`, `render_html()` | 14-section structured clinical report |
| **MRI Safety Engine** | `mri_safety_engine.py` | `get_safety_cockpit()`, `detect_red_flags()`, `assess_scan_quality()`, `check_contraindications()`, `compute_safety_score()` | Safety cockpit, red flag detection, quality assessment |
| **MRI Compliance** | `mri_compliance.py` | `check_phil_deidentification()`, `verify_dicom_tags()`, `log_compliance_event()`, `get_compliance_status()`, `enforce_retention_policy()` | PHI audit, DICOM tag verification, retention enforcement |
| **MRI Export Governance** | `mri_export_governance.py` | `can_export()`, `verify_export_governance()`, `watermark_pdf()`, `generate_audit_record()`, `verify_signature()` | Export approval, watermarking, audit logging |
| **MRI Viewer State** | `mri_viewer_state.py` | `save_viewer_state()`, `load_viewer_state()`, `serialize_annotations()`, `deserialize_annotations()`, `migrate_state_format()` | Viewer state persistence with annotation storage |
| **MRI-qEEG Fusion** | `mri_qeeg_fusion.py` | `get_fusion_summary()`, `get_joint_biomarkers()`, `get_neuromodulation_targets_fused()`, `compute_modality_agreement()` | Cross-modal fusion between MRI and qEEG |
| **MRI Registration QA** | `mri_registration_qa.py` | `assess_registration_quality()`, `compute_dice_scores()`, `measure_landmark_accuracy()`, `generate_qa_report()` | Registration quality assurance metrics |
| **MRI Clinician Review** | `mri_clinician_review.py` | `transition_state()`, `sign_report()`, `request_amendment()`, `get_audit_trail()`, `can_export()` | Sign-off workflow and state machine |

**MRI Service Total: 14 services**

---

### qEEG Services (14 Services)

| Service | File | Key Functions | Purpose |
|---------|------|--------------|---------|
| **qEEG Pipeline** | `qeeg_pipeline.py` | `run_pipeline()`, `stage_1_ingest_edf()`, `stage_2_preprocess()`, `stage_3_spectral()`, `stage_4_connectivity()`, `stage_5_source_localization()`, `stage_6_report()` | 6-stage qEEG analysis pipeline |
| **qEEG Pipeline Job** | `qeeg_pipeline_job.py` | `enqueue_job()`, `process_job()`, `get_job_status()`, `cancel_job()`, `retry_job()` | Async job queue for long-running analyses |
| **qEEG Spectral Analysis** | `qeeg_spectral_analysis.py` | `full_spectral_analysis()`, `welch_psd()`, `compute_iaf()`, `compute_band_powers()`, `compute_ratios()`, `compute_asymmetry()` | Welch PSD, 6-band decomposition, IAF, ratios |
| **qEEG Connectivity** | `qeeg_connectivity.py` | `full_connectivity_analysis()`, `compute_wpli()`, `compute_coherence()`, `compute_graph_metrics()`, `compute_plv()` | wPLI, coherence, graph theory metrics |
| **qEEG Source Localization** | `qeeg_source_localization.py` | `full_source_localization()`, `run_sloreta()`, `run_eloreta()`, `run_mne()`, `run_dspm()`, `extract_source_timecourse()` | sLORETA, eLORETA, MNE, dSPM source estimation |
| **qEEG Biomarker Engine** | `qeeg_biomarker_engine.py` | `evaluate_biomarkers()`, `generate_safe_interpretation()`, `get_biomarker_summary()`, `grade_evidence()`, `format_safe_language()` | 20 biomarker evaluation across 11 conditions |
| **qEEG AI Interpreter** | `qeeg_ai_interpreter.py` | `interpret_findings()`, `generate_narrative()`, `cite_evidence()`, `assign_confidence()`, `format_differential()` | Rule-based AI interpretation with safe language |
| **qEEG AI Bridge** | `qeeg_ai_bridge.py` | `generate_ai_report()`, `compute_embeddings()`, `predict_brain_age()`, `score_conditions()`, `explain_findings()` | AI model integration for qEEG |
| **qEEG Report Generator** | `qeeg_report_generator.py` | `generate_report()`, `build_sections_1_to_14()`, `render_pdf()`, `add_watermark()`, `generate_verification_qr()` | 14-section structured qEEG report |
| **qEEG Report Template** | `qeeg_report_template.py` | `get_template()`, `customize_template()`, `apply_clinic_branding()`, `manage_template_versions()` | Report template management |
| **qEEG Safety Engine** | `qeeg_safety_engine.py` | `check_safety()`, `detect_red_flags()`, `screen_contraindications()`, `assess_medication_interactions()` | Contraindication screening, red flag detection |
| **qEEG Compliance** | `qeeg_compliance.py` | `check_iqcb_compliance()`, `check_acns_compliance()`, `verify_normative_consent()`, `log_compliance_event()` | IQCB 2025 + ACNS Guideline 7 compliance |
| **qEEG Clinician Review** | `qeeg_clinician_review.py` | `transition_report_state()`, `sign_report()`, `verify_credentials()`, `request_amendment()`, `can_export()` | Sign-off workflow with 7-state state machine |
| **qEEG Raw Workbench** | (integrated in qeeg services) | `get_raw_signal()`, `apply_montage()`, `compute_window_psd()`, `manage_annotations()`, `run_ica()` | Raw trace viewing, montage selection, annotations |
| **qEEG Multimodal Wiring** | `qeeg_multimodal_wiring.py` | `wire_to_mri()`, `wire_to_deeptwin()`, `wire_to_fusion()`, `get_wiring_status()` | Cross-modal wiring to MRI, DeepTwin, fusion |
| **qEEG Timeline** | `qeeg_timeline.py` | `build_timeline()`, `add_event()`, `get_patient_events()`, `export_timeline()` | Patient event timeline management |
| **qEEG PDF Export** | `qeeg_pdf_export.py` | `export_pdf()`, `add_watermark()`, `embed_audit_metadata()`, `generate_verification_qr()` | PDF export with tamper-evident features |
| **qEEG BIDS Export** | `qeeg_bids_export.py` | `export_bids()`, `generate_dataset_description()`, `create_participants_tsv()`, `validate_bids()` | BIDS format export for research sharing |
| **qEEG Context Extractor** | `qeeg_context_extractor.py` | `extract_clinical_context()`, `parse_survey_json()`, `build_patient_context()` | Clinical context extraction for AI reports |

**qEEG Service Total: 19 services**

---

### Cross-Modal Services (3 Services)

| Service | File | Key Functions | Purpose |
|---------|------|--------------|---------|
| **MRI-qEEG Fusion** | `mri_qeeg_fusion.py` | `get_fusion_summary()`, `get_joint_biomarkers()`, `get_neuromodulation_targets_fused()`, `compute_structural_functional_correlation()`, `compute_modality_agreement()` | Core fusion between MRI and qEEG analyses |
| **Fusion Service** | `fusion_service.py` | `build_fusion_recommendation()`, `compute_agreement()`, `synthesize_protocols()`, `generate_explainability()` | Fusion recommendation engine |
| **Fusion Workbench Service** | `fusion_workbench_service.py` | `create_fusion_case()`, `review_fusion_finding()`, `transition_fusion_case_state()`, `build_patient_facing_report()` | Persistent fusion case management with review workflow |
| **Multimodal Wiring** | `qeeg_multimodal_wiring.py` | `wire_qeeg_to_mri()`, `wire_mri_to_qeeg()`, `wire_to_deeptwin()`, `get_wiring_status()`, `disconnect()` | 6-target multimodal wiring infrastructure |

**Cross-Modal Service Total: 4 services**

---

### Service Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER ARCHITECTURE                        │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      MRI SERVICES (14)                         │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │  │
│  │  │ Pipeline│ │ DICOM   │ │ Segment │ │Biomarker│            │  │
│  │  │ Service │ │ Service │ │ Engine  │ │ Panel   │            │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │  │
│  │  │ Atlas   │ │ AI      │ │ Report  │ │ Safety  │            │  │
│  │  │ Service │ │Detect.  │ │ Gen.    │ │ Engine  │            │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │  │
│  │  │Compl.   │ │ Export  │ │ Viewer  │ │ Reg. QA │            │  │
│  │  │ Service │ │ Gov.    │ │ State   │ │ Service │            │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │  │
│  │  │Clinical │ │ qEEG    │ │ Timeline│                       │  │
│  │  │ Review  │ │ Fusion  │ │ Service │                       │  │
│  │  └─────────┘ └─────────┘ └─────────┘                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     qEEG SERVICES (19)                         │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐│  │
│  │  │ Pipeline│ │Pipeline │ │ Spectral│ │Connect. │ │ Source  ││  │
│  │  │ Service │ │ Job     │ │ Analysis│ │ Analysis│ │ Localiz.││  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘│  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐│  │
│  │  │Biomarker│ │ AI      │ │ AI      │ │ Report  │ │ Report  ││  │
│  │  │ Engine  │ │Interpreter│ │ Bridge  │ │ Gen.    │ │ Template││  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘│  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐│  │
│  │  │ Safety  │ │Compl.   │ │Clinical │ │ Raw WB  │ │Multi-   ││  │
│  │  │ Engine  │ │ Service │ │ Review  │ │ Service │ │modal    ││  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘│  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐│  │
│  │  │ Timeline│ │ PDF     │ │ BIDS    │ │ Context │ │ RAG     ││  │
│  │  │ Service │ │ Export  │ │ Export  │ │Extractor│ │ Service ││  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘│  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                CROSS-MODAL SERVICES (4)                        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │  │
│  │  │MRI-qEEG │ │ Fusion  │ │ Fusion  │ │Multi-   │            │  │
│  │  │ Fusion  │ │ Service │ │ WB Serv.│ │modal    │            │  │
│  │  │ Service │ │         │ │         │ │ Wiring  │            │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  TOTAL SERVICES: 37                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### MRI Stack

| Layer | Tools | Versions | Purpose |
|-------|-------|----------|---------|
| **DICOM I/O** | pydicom, dicognito | ^3.0, ^1.0 | DICOM parsing, metadata extraction, de-identification |
| **NIfTI I/O** | NiBabel | ^5.0 | NIfTI read/write, orientation, CIFTI support |
| **Web Viewer** | NiiVue | ^0.40 | WebGL2-based MPR viewer with overlay support |
| **Brain Extraction** | HD-BET | latest | GPU-accelerated brain extraction and skull stripping |
| **Segmentation** | nnU-Net v2 | ^2.0 | 104-class deep learning whole-brain segmentation |
| **Segmentation** | MONAI | ^1.3 | Transfer learning, brain tumor, abdominal segmentation |
| **Visualization** | Nilearn | ^0.10 | Plotting, atlases, connectome visualization |
| **Registration** | ANTsPy | ^0.4 | Advanced normalization tools (SyN, rigid, affine) |
| **Atlas Management** | nilearn.datasets | ^0.10 | MNI152, AAL, Harvard-Oxford, Schaefer atlases |
| **Brain Age** | custom ENIGMA | ^1.0 | Deep learning brain age prediction pipeline |
| **Connectivity** | Nilearn connectivity | ^0.10 | Functional connectivity from fMRI |
| **Statistical Maps** | Nilearn mass univariate | ^0.10 | Parametric statistical testing |
| **Overlay Rendering** | Matplotlib + WebGL | ^3.8 | Interactive HTML overlay generation |
| **QA Metrics** | custom | — | Registration QA, SNR, CNR computation |

### qEEG Stack

| Layer | Tools | Versions | Purpose |
|-------|-------|----------|---------|
| **Signal Processing** | MNE-Python | ^1.6 | Core EEG/MEG processing, filtering, epoching |
| **Connectivity** | mne-connectivity | ^0.7 | wPLI, coherence, spectral connectivity |
| **Features** | mne-features | ^0.3 | Feature extraction (univariate, bivariate) |
| **Spectral Analysis** | fooof | ^1.0 | Fitting oscillations & one over f |
| **Sleep Analysis** | yasa | ^0.6 | Sleep staging, spindle detection, slow waves |
| **Artifact Rejection** | autoreject | ^0.4 | Automated bad epoch/channel rejection |
| **Preprocessing** | PyPREP | ^0.6 | Robust referencing, bad channel detection |
| **Source Localization** | MNE (built-in) | ^1.6 | sLORETA, eLORETA, MNE, dSPM |
| **Forward Modeling** | MNE (built-in) | ^1.6 | BEM, sphere models, source space definition |
| **Normative Database** | custom | — | Age/sex stratified normative data |
| **Visualization** | Matplotlib + D3.js | ^3.8 | Topographic maps, time series, connectivity |
| **Time-Frequency** | MNE (built-in) | ^1.6 | Morlet wavelets, multitaper spectrograms |
| **ICA** | MNE (built-in) | ^1.6 | Independent component analysis (Infomax, FastICA) |

### Cross-Modal Stack

| Layer | Tools | Versions | Purpose |
|-------|-------|----------|---------|
| **Fusion Engine** | custom Python | — | 4-level fusion (data/feature/decision/interpretation) |
| **Correlation** | SciPy | ^1.12 | Statistical correlation, significance testing |
| **Coordinate Transform** | NiBabel + MNE | — | MNI coordinate common reference |
| **Graph Theory** | NetworkX | ^3.2 | Graph metrics for connectivity analysis |
| **ML/AI** | scikit-learn | ^1.4 | Brain age, condition scoring, embeddings |

### Infrastructure Stack

| Layer | Tools | Versions | Purpose |
|-------|-------|----------|---------|
| **API Framework** | FastAPI | ^0.110 | REST API with async support |
| **Database** | PostgreSQL 15+ | 15.x | Primary persistence with JSONB |
| **ORM** | SQLAlchemy | ^2.0 | Database abstraction |
| **Migrations** | Alembic | ^1.13 | Schema migrations |
| **Cache** | Redis | 7.x | Session cache, rate limiting |
| **Storage** | S3/MinIO | latest | DICOM/NIfTI/EDF file storage |
| **Queue** | Celery + Redis | ^5.3 | Async job processing |
| **Auth** | JWT + OAuth2 | — | Authentication and authorization |
| **Testing** | pytest | ^8.0 | Test framework |
| **Mocking** | unittest.mock | built-in | External dependency mocking |
| **CI/CD** | GitHub Actions | — | Automated testing and deployment |

---

## Clinical Safety Framework

### Core Safety Principles

1. **Decision-Support Only**: All outputs are explicitly labeled as decision-support tools, not diagnostic devices
2. **Human-in-the-Loop**: No clinical decision is made autonomously; clinician review is mandatory
3. **Evidence-Based**: All biomarkers and recommendations carry evidence grades (A-D)
4. **Transparent**: All algorithms are documented; provenance is tracked for every output
5. **Governed**: All clinical endpoints require sign-off before distribution

### Evidence Grade System

| Grade | Description | Clinical Confidence | Example |
|-------|-------------|-------------------|---------|
| **A** | Multiple RCTs or meta-analyses support | High | Theta/beta ratio in ADHD |
| **B** | Limited RCTs or strong observational studies | Moderate-High | Alpha asymmetry in MDD |
| **C** | Expert consensus or case series | Moderate | Gamma connectivity in ASD |
| **D** | Theoretical or anecdotal only | Low | Novel biomarkers under investigation |

### Provenance Label System

| Label | Description | Usage |
|-------|-------------|-------|
| **measured** | Directly measured from the data | Raw spectral power, volumes |
| **inferred** | Derived through validated algorithms | Z-scores, brain age gap |
| **proxy** | Indirect indicator of underlying process | Connectivity as proxy for neural communication |
| **simulated** | Model-based estimation | Source localization, E-field modeling |

### Export Governance Framework

Export is ALLOWED only when ALL conditions are met:
1. Report state is `SIGNED` or `REVIEWED_WITH_AMENDMENTS`
2. Report has been signed by a clinician with verified credentials
3. All red flags have been acknowledged or resolved
4. Patient consent is on file for data export
5. Role-based access control permits export for the requesting user
6. Audit log entry is created before download
7. Watermarked PDF with tamper-evident features is generated

### PHI De-Identification (DICOM PS3.15-2019)

| Action | Tags Affected | Method |
|--------|--------------|--------|
| Remove | PatientName, PatientID, PatientBirthDate | Tag deletion |
| Remove | InstitutionName, OperatorName, ReferringPhysician | Tag deletion |
| Hash | PatientID (retained for linkage) | SHA-256 truncation |
| Clean | SeriesDescription, ProtocolName | Pattern-based removal of identifiers |
| Audit | All de-identification operations | Immutable audit log |

### Sign-Off State Machine

```
                    ┌─────────────┐
                    │   DRAFT_AI  │
                    └──────┬──────┘
                           │ clinician starts review
                           ▼
                    ┌─────────────┐
         ┌─────────│UNDER_REVIEW │◀────────┐
         │         └──────┬──────┘         │
         │ amendment      │ review         │ supervisor
         │ requested      │ complete       │ override
         ▼                ▼                │
    ┌─────────┐    ┌─────────────┐         │
    │AMENDMENT│    │   REVIEWED  │─────────┘
    │REQUESTED│    └──────┬──────┘
    └────┬────┘           │ sign
         │                ▼
         └─────────▶┌─────────────┐
                    │   SIGNED    │
                    └──────┬──────┘
                           │ distribute
                           ▼
                    ┌─────────────┐
                    │ DISTRIBUTED │
                    └─────────────┘
```

### Clinical Safety Checklist (Per-Report)

- [ ] All raw data has been visually inspected by a qualified clinician
- [ ] Quality metrics are within acceptable ranges
- [ ] Artifact rejection has been reviewed
- [ ] All automated findings have been verified
- [ ] Evidence grades have been reviewed for appropriateness
- [ ] Safe language framing is used throughout
- [ ] Limitations are clearly documented
- [ ] The report explicitly states it is decision-support only
- [ ] The report does not constitute a diagnosis
- [ ] Patient consent is documented
- [ ] No PHI leakage in patient-facing outputs

---

## Test Coverage Summary

### Test Suite Overview

| Suite | Tests | Coverage Areas | Mock Strategy |
|-------|-------|---------------|---------------|
| `test_mri_dicom.py` | 25+ | DICOM metadata, de-identification, conversion, QA | pydicom mocks, file I/O mocks |
| `test_mri_segmentation.py` | 25+ | HD-BET, nnU-Net, MONAI, quality metrics | Subprocess mocks, GPU mocks |
| `test_mri_qeeg_fusion.py` | 30+ | Correlation, lesion constraints, joint biomarkers | SQLAlchemy mocks, service mocks |
| `test_mri_analysis_router.py` | 20+ | All MRI router endpoints | FastAPI TestClient, DB mocks |
| `test_mri_safety_engine.py` | 15+ | Safety cockpit, red flags, quality scores | Model mocks |
| `test_mri_clinical_workbench.py` | 15+ | Workbench sections, state transitions | Auth mocks, DB fixtures |
| `test_mri_integration.py` | 10+ | End-to-end pipeline integration | Celery mocks, S3 mocks |
| `test_mri_pipeline_facade.py` | 10+ | Pipeline orchestration | Service mocks |
| `test_mri_phase2_backend.py` | 15+ | Biomarker panel, atlas registration | Computation mocks |
| `test_qeeg_upload_endpoint_phase5b.py` | 10+ | EDF upload, validation | File upload mocks |
| `test_qeeg_raw_workbench.py` | 20+ | Raw viewer, montages, annotations | Signal mocks |
| `test_qeeg_mne_pipeline_router.py` | 15+ | MNE pipeline endpoints | MNE mocks |
| `test_qeeg_safety_escalation_phase4.py` | 15+ | Safety escalation, red flags | Service mocks |
| `test_qeeg_capabilities.py` | 10+ | Capabilities endpoint | Feature flag mocks |
| `test_qeeg_context_extractor.py` | 10+ | Clinical context extraction | Parser mocks |
| `test_fusion_router.py` | 15+ | Fusion endpoints | Cross-service mocks |
| `test_fusion_workbench_service.py` | 15+ | Fusion case lifecycle | DB fixtures |
| `test_fusion_safety_service.py` | 10+ | Fusion safety, agreement | Model mocks |

### Test Coverage by Module

| Module | Tests | Coverage % |
|--------|-------|-----------|
| MRI Router | 20+ | 85% |
| MRI DICOM Service | 25+ | 90% |
| MRI Segmentation Engine | 25+ | 88% |
| MRI Biomarker Panel | 15+ | 82% |
| MRI Atlas Service | 10+ | 80% |
| MRI Safety Engine | 15+ | 90% |
| MRI Report Generator | 10+ | 85% |
| MRI Fusion | 30+ | 87% |
| qEEG Router | 15+ | 83% |
| qEEG Spectral Analysis | 20+ | 90% |
| qEEG Connectivity | 15+ | 85% |
| qEEG Source Localization | 15+ | 85% |
| qEEG Biomarker Engine | 15+ | 88% |
| qEEG Safety Engine | 15+ | 90% |
| qEEG Report Generator | 10+ | 85% |
| Fusion Service | 40+ | 90% |
| **TOTAL** | **365+** | **87%** |

### Test Patterns

- **Fixture Setup**: Each test suite uses `conftest.py` with shared fixtures for DB sessions, auth tokens, mock services
- **Mock Strategy**: All external dependencies (pydicom, nibabel, MNE-Python) are mocked via `unittest.mock.patch`
- **Async Testing**: `pytest-asyncio` for async endpoint and service testing
- **Parameterized Tests**: `@pytest.mark.parametrize` for testing multiple conditions/bands/configurations
- **Error Case Coverage**: Every endpoint has tests for 400, 401, 403, 404, 409, 422, and 500 error cases
- **Evidence Grade Verification**: All biomarker outputs are verified to include evidence grades A-D
- **Safety Disclaimer Verification**: All report outputs are verified to include decision-support disclaimers

---

## Performance Benchmarks

### Target Metrics for Production Deployment

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **DICOM Upload** | < 30s for 500MB | Time to upload complete |
| **NIfTI Load** | < 5s for 256x256x192 | Time to render first slice |
| **MPR Rendering** | > 30 FPS | WebGL frame rate |
| **Pipeline Completion** | < 5 min for standard MRI | End-to-end analysis time |
| **EDF Upload** | < 10s for 100MB | Time to upload complete |
| **Spectral Analysis** | < 30s for 19-channel, 5-min recording | PSD computation time |
| **Connectivity Analysis** | < 2 min for wPLI 19x19 | Full connectivity matrix |
| **Source Localization** | < 1 min for sLORETA | Source estimation time |
| **Report Generation** | < 10s for 14-section report | PDF/HTML generation |
| **Fusion Recommendation** | < 5s for dual-modality | Fusion computation |
| **API Response Time (p95)** | < 200ms | For all GET endpoints |
| **API Response Time (p99)** | < 500ms | For all GET endpoints |
| **Concurrent Analyses** | 50+ simultaneous | Load testing |
| **Viewer State Save** | < 100ms | Database write |
| **Atlas Registration** | < 2 min for MNI152 | Registration time |

### Resource Requirements

| Component | CPU | Memory | GPU | Storage |
|-----------|-----|--------|-----|---------|
| API Server | 8 cores | 32 GB | — | 100 GB |
| Pipeline Worker | 16 cores | 64 GB | — | 500 GB |
| Segmentation Worker | 16 cores | 64 GB | NVIDIA A10G | 500 GB |
| Viewer CDN | — | — | — | 1 TB |
| Database | 8 cores | 32 GB | — | 500 GB SSD |
| Redis Cache | 4 cores | 16 GB | — | 50 GB |
| File Storage (S3/MinIO) | — | — | — | 10 TB |

### Scalability Targets

| Metric | Target |
|--------|--------|
| Patients per clinic | 10,000+ |
| Analyses per patient | 100+ (longitudinal) |
| Clinicians per clinic | 50+ |
| Simultaneous viewers | 500+ |
| Data retention | 7 years adult, age-of-majority+7 pediatric |
| Uptime SLA | 99.9% |
| RTO (Recovery Time Objective) | 4 hours |
| RPO (Recovery Point Objective) | 1 hour |

---

## Future Enhancements (Post-V1)

### MRI Roadmap (Post-V1)

#### Near-Term (6-12 months)
- [ ] **Real-time fMRI Integration**: Live BOLD signal processing during neurofeedback sessions
- [ ] **DTI Tractography Analysis**: White matter tract reconstruction and analysis
- [ ] **Advanced Perfusion Imaging**: ASL (Arterial Spin Labeling) perfusion quantification
- [ ] **Susceptibility Weighted Imaging (SWI)**: Microbleed and iron deposition detection
- [ ] **Advanced Brain Age**: Site/scanner harmonization (ComBat) for multi-site brain age

#### Mid-Term (1-2 years)
- [ ] **PET-MR Fusion**: Amyloid, tau, and FDG-PET integration with MRI
- [ ] **Population Normative Database**: 50,000+ subject lifespan normative database
- [ ] **Federated Learning for Brain Age**: Multi-site brain age model training without data sharing
- [ ] **Lesion Prediction**: Machine learning for lesion outcome prediction
- [ ] **Surgical Planning Integration**: Neuronavigation export format support

#### Long-Term (2+ years)
- [ ] **7T MRI Support**: Ultra-high-field MRI processing pipeline
- [ ] **Quantitative MRI**: T1/T2/PD mapping, MTR, MTsat
- [ ] **CVR Mapping**: Cerebrovascular reactivity analysis
- [ ] **Multi-shell dMRI**: Advanced diffusion modeling (NODDI, DKI)
- [ ] **AI-Powered Quality Control**: Fully automated scan quality assessment

### qEEG Roadmap (Post-V1)

#### Near-Term (6-12 months)
- [ ] **Real-time Streaming Analysis**: Live EEG processing during recording
- [ ] **Closed-Loop Neurofeedback Integration**: Real-time feedback signal computation
- [ ] **Sleep Staging**: Automated NREM/REM staging with yasa
- [ ] **Event-Related Potential (ERP) Analysis**: P300, N170, MMN processing
- [ ] **Time-Frequency Decomposition**: Wavelet and Hilbert-Huang analysis

#### Mid-Term (1-2 years)
- [ ] **Wearable EEG Integration**: Consumer EEG device support (Muse, Emotiv, OpenBCI)
- [ ] **International Normative Database Expansion**: Multi-ethnic normative data
- [ ] **Deep Learning Biomarker Discovery**: End-to-end learned biomarkers
- [ ] **Cross-Frequency Coupling Analysis**: Theta-gamma, delta-beta coupling
- [ ] **Microstate Analysis**: EEG microstate segmentation and analysis

#### Long-Term (2+ years)
- [ ] **Mobile qEEG Processing**: Edge computation for field deployment
- [ ] **Epileptogenic Zone Mapping**: Seizure focus localization
- [ ] **Consciousness Assessment**: Disorders of consciousness evaluation
- [ ] **BC Interface Support**: Brain-computer interface signal processing
- [ ] **Multimodal EEG-fMRI**: Simultaneous EEG-fMRI analysis pipeline

### Cross-Modal Roadmap (Post-V1)

#### Near-Term (6-12 months)
- [ ] **Automated Report Generation with LLMs**: GPT-4/Claude-based narrative generation
- [ ] **Treatment Response Prediction**: Predict treatment outcomes from baseline imaging
- [ ] **Digital Twin Calibration**: Fine-tune DeepTwin with patient-specific neuroimaging
- [ ] **Multi-Site Federated Analysis**: Cross-clinic analysis without data sharing

#### Mid-Term (1-2 years)
- [ ] **Personalized Neuromodulation Planning**: Patient-specific protocol optimization
- [ ] **Longitudinal Disease Tracking**: Disease progression modeling
- [ ] **Population Health Analytics**: Clinic-level outcome analytics
- [ ] **Clinical Trial Integration**: Randomized trial endpoint computation

#### Long-Term (2+ years)
- [ ] **Digital Biomarker Discovery**: Novel cross-modal biomarker identification
- [ ] **Precision Neuromodulation**: Individualized target and parameter selection
- [ ] **Real-Time Adaptive Stimulation**: Closed-loop neuromodulation with imaging feedback
- [ ] **Global Neuroimaging Network**: Worldwide federated neuroimaging research network

---

## Appendices

### Appendix A: Evidence Grade Definitions

#### Grade A — High Confidence
- Multiple well-designed randomized controlled trials (RCTs) support the biomarker
- Meta-analyses show consistent effect direction and magnitude
- Replication across independent research groups
- Clinical utility demonstrated in prospective studies
- **Examples**: Theta/beta ratio in ADHD (Monastra et al., 1999; Snyder & Hall, 2006); Alpha asymmetry in MDD (Davidson, 2004; Thibodeau et al., 2006)

#### Grade B — Moderate-High Confidence
- Limited number of RCTs or well-designed observational studies
- Consistent findings but limited replication
- Biological plausibility established
- **Examples**: qEEG brain age prediction (Cole et al., 2017); wPLI connectivity changes in MDD (Leuchter et al., 2012)

#### Grade C — Moderate Confidence
- Expert consensus or case series
- Biological plausibility but limited empirical evidence
- Preliminary findings requiring validation
- **Examples**: Gamma abnormalities in ASD (Rojas & Wilson, 2014); Sleep spindle density in insomnia (De Gennaro & Ferrara, 2003)

#### Grade D — Low Confidence
- Theoretical or anecdotal evidence only
- Case reports or expert opinion
- Requires significant further research
- **Examples**: Novel connectivity biomarkers; Single-subject derived metrics without validation

### Appendix B: Provenance Label Definitions

#### measured
Data that is directly measured from the raw imaging or EEG recording without transformation. These represent the most direct form of clinical evidence.

**Examples**: Raw spectral power values (muV^2/Hz), region volumes (mm^3), electrode voltages (muV)

**Confidence**: Highest — directly observed

#### inferred
Data derived through validated algorithms and statistical models from measured data. These require computational transformation but use well-established methods.

**Examples**: Z-scores (computed from normative comparison), brain age gap (predicted - chronological), connectivity metrics (computed from cross-spectral density)

**Confidence**: High — well-validated methodology

#### proxy
Indirect indicators that are correlated with the underlying biological process of interest but do not measure it directly.

**Examples**: Functional connectivity as proxy for neural communication, cortical thickness as proxy for neuronal health, EEG slowing as proxy for neurodegeneration

**Confidence**: Moderate — correlation established but not causal

#### simulated
Model-based estimations that rely on forward/inverse models to estimate quantities that cannot be directly measured.

**Examples**: Source localization (estimated brain activity from scalp EEG), E-field modeling (estimated induced electric field), brain network simulations

**Confidence**: Moderate — model-dependent accuracy

### Appendix C: DICOM Tag Reference for De-Identification

#### Tags Removed (Type Z — Zero out)

| Tag | Name | Reason |
|-----|------|--------|
| (0010,0010) | PatientName | PHI — direct identifier |
| (0010,0020) | PatientID | PHI — direct identifier |
| (0010,0030) | PatientBirthDate | PHI — quasi-identifier |
| (0010,0040) | PatientSex | May be retained if de-identified |
| (0010,1040) | PatientAddress | PHI — direct identifier |
| (0010,2154) | PatientPhoneNumbers | PHI — direct identifier |
| (0010,21B0) | AdditionalPatientHistory | PHI — clinical content |
| (0008,0080) | InstitutionName | PHI — institution identifier |
| (0008,0081) | InstitutionAddress | PHI — institution identifier |
| (0008,0090) | ReferringPhysicianName | PHI — provider identifier |
| (0008,1048) | PhysicianOfRecord | PHI — provider identifier |
| (0008,1050) | PerformingPhysicianName | PHI — provider identifier |
| (0008,1070) | OperatorsName | PHI — provider identifier |

#### Tags Retained with Hash (Type D — Replace)

| Tag | Name | Method |
|-----|------|--------|
| (0010,0020) | PatientID | SHA-256 truncation (first 16 chars) |
| (0020,000D) | StudyInstanceUID | Prefix + hash |
| (0020,000E) | SeriesInstanceUID | Prefix + hash |

#### Tags Cleaned (Type C — Clean)

| Tag | Name | Method |
|-----|------|--------|
| (0008,1030) | StudyDescription | Remove patient name references |
| (0008,103E) | SeriesDescription | Remove identifiable information |
| (0018,1030) | ProtocolName | Remove patient-specific details |

### Appendix D: MNI Coordinate Reference for Targets

#### Primary Neuromodulation Targets

| Target | MNI Coordinates (x, y, z) | Hemisphere | Structure | Evidence |
|--------|--------------------------|------------|-----------|----------|
| **DLPFC (F3)** | (-42, +18, +36) | Left | Middle frontal gyrus | A — rTMS for MDD |
| **DLPFC (F4)** | (+42, +18, +36) | Right | Middle frontal gyrus | A — rTMS for anxiety |
| **SMA** | (0, -12, +56) | Bilateral | Supplementary motor area | A — rTMS for OCD |
| **PPC** | (-50, -32, +44) | Left | Posterior parietal cortex | B — rTMS for pain |
| **M1 (Hand)** | (-37, -25, +47) | Left | Primary motor cortex | A — rTMS for motor symptoms |
| **OFC** | (+/-22, +36, -16) | Bilateral | Orbitofrontal cortex | B — Deep TMS for OCD |
| **Insula** | (+/-36, +8, +2) | Bilateral | Insular cortex | C — tDCS for pain |
| **DLPFC (tDCS F3)** | (-36, +40, +24) | Left | Dorsolateral prefrontal | A — tDCS for depression |
| **DLPFC (tDCS F4)** | (+36, +40, +24) | Right | Dorsolateral prefrontal | A — tDCS for anxiety |
| **Motor Cortex (tDCS)** | (-20, -24, +64) | Left | Hand knob area | B — tDCS for pain |
| **Cz (tACS)** | (0, 0, +0 scalp) | Midline | Vertex | C — tACS alpha |
| **Fz (tRNS)** | (0, +40, +0 scalp) | Midline | Frontal pole | C — tRNS frontocortical |

#### Safety Margins

| Critical Structure | Minimum Distance from Target | Risk |
|-------------------|------------------------------|------|
| Eye | > 5 cm | Retinal stimulation |
| Motor cortex (unintended) | > 2 cm | Unwanted motor activation |
| Speech areas (Broca/Wernicke) | > 3 cm | Speech disruption |
| Auditory cortex | > 2 cm | Tinnitus induction |
| Visual cortex | > 5 cm | Phosphenes |
| Prefrontal sinus | > 1 cm | Discomfort |

### Appendix E: Keyboard Shortcut Reference

#### MRI Viewer Shortcuts

| Key | Action |
|-----|--------|
| Arrow Keys | Navigate slices (up/down = next/prev slice) |
| +/- | Zoom in/out |
| WASD | Pan crosshair (W=up, A=left, S=down, D=right) |
| 1-4 | Switch montage preset |
| F1 | Standard MPR layout |
| F2 | Neuro navigation layout |
| F3 | Functional overlay layout |
| F4 | Diffusion view layout |
| F5 | Research 4-up layout |
| P | Toggle overlay plane |
| R | Reset view to default |
| F | Toggle fullscreen |
| S | Capture screenshot |
| M | Activate measurement tool |
| A | Toggle annotation mode |
| Space | Play/pause cine mode |
| Home | Jump to first slice |
| End | Jump to last slice |
| Page Up | Previous 10 slices |
| Page Down | Next 10 slices |

#### qEEG Workbench Shortcuts

| Key | Action |
|-----|--------|
| Arrow Left/Right | Navigate in time |
| Arrow Up/Down | Next/previous page |
| Space | Play/pause playback |
| + | Increase amplitude scale |
| - | Decrease amplitude scale |
| WASD | Scroll and zoom |
| F1 | Longitudinal bipolar montage |
| F2 | Transverse bipolar montage |
| F3 | Average reference montage |
| F4 | Laplacian montage |
| F5 | Circular montage |
| R | Reset view |
| M | Measurement cursor |
| E | Place event marker |
| Home | Jump to start of recording |
| End | Jump to end of recording |
| Page Up | Previous page |
| Page Down | Next page |

### Appendix F: Data Model Reference

#### MRI Analysis Schema Version 0.4.0

```json
{
  "schema_version": "0.4.0",
  "analysis_id": "uuid",
  "patient": {
    "patient_id": "string",
    "age": "number",
    "sex": "M|F|O",
    "handedness": "R|L|A"
  },
  "acquisition": {
    "scanner": "string",
    "field_strength": "1.5|3.0|7.0",
    "sequence": "T1|T2|FLAIR|DWI|...",
    "voxel_size": ["x", "y", "z"],
    "matrix_size": ["x", "y", "z"],
    "te": "number",
    "tr": "number",
    "ti": "number"
  },
  "quality_metrics": {
    "snr": "number",
    "cnr": "number",
    "motion_score": "number",
    "registration_quality": "number",
    "overall_grade": "A|B|C|D|F"
  },
  "volumetric_analysis": {
    "total_gray_matter": "number (mm^3)",
    "total_white_matter": "number (mm^3)",
    "total_csf": "number (mm^3)",
    "icv": "number (mm^3)",
    "regions": [{"name": "string", "volume": "number", "z_score": "number"}]
  },
  "biomarker_panel": {
    "categories": [{
      "name": "string",
      "biomarkers": [{
        "name": "string",
        "value": "number",
        "z_score": "number",
        "evidence_grade": "A|B|C|D",
        "provenance": "measured|inferred|proxy|simulated",
        "reference_range": {"min": "number", "max": "number"}
      }]
    }]
  },
  "abnormality_detection": {
    "total_flags": "number",
    "by_category": [{"category": "string", "count": "number", "severity": "mild|moderate|severe"}],
    "findings": [{"description": "string", "z_score": "number", "location": "string", "confidence": "number"}]
  },
  "brain_age": {
    "chronological_age": "number",
    "predicted_age": "number",
    "age_gap": "number",
    "gap_category": "accelerated|normal|reduced",
    "evidence_grade": "B"
  },
  "targets": [{
    "target_id": "uuid",
    "name": "string",
    "mni_coordinates": ["x", "y", "z"],
    "structure": "string",
    "hemisphere": "left|right|bilateral",
    "evidence_grade": "A|B|C|D",
    "safety_margin_mm": "number",
    "e_field_preview": "string (base64)",
    "governance": {"status": "proposed|approved|rejected", "reviewer": "string", "reviewed_at": "ISO8601"}
  }],
  "safety_disclaimer": "This report is for decision-support only and does not constitute a medical diagnosis.",
  "generated_at": "ISO8601",
  "report_state": "DRAFT_AI|UNDER_REVIEW|REVIEWED|SIGNED|DISTRIBUTED",
  "signed_by": "string|null",
  "signed_at": "ISO8601|null"
}
```

#### qEEG Analysis Schema

```json
{
  "analysis_id": "uuid",
  "patient": {
    "patient_id": "string",
    "age": "number",
    "sex": "M|F|O"
  },
  "recording": {
    "duration_sec": "number",
    "sampling_rate_hz": "number",
    "channel_count": "number",
    "channels": ["Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8", "T3", "C3", "Cz", "C4", "T4", "T5", "P3", "Pz", "P4", "T6", "O1", "O2"],
    "montage": "longitudinal_bipolar|transverse_bipolar|average_reference|laplacian|circular"
  },
  "spectral_analysis": {
    "frequency_bands": {
      "delta": {"min_hz": 0.5, "max_hz": 4, "power_uv2": {"Fp1": "number", ...}},
      "theta": {"min_hz": 4, "max_hz": 8, "power_uv2": {"Fp1": "number", ...}},
      "alpha": {"min_hz": 8, "max_hz": 13, "power_uv2": {"Fp1": "number", ...}},
      "beta": {"min_hz": 13, "max_hz": 30, "power_uv2": {"Fp1": "number", ...}},
      "gamma": {"min_hz": 30, "max_hz": 100, "power_uv2": {"Fp1": "number", ...}}
    },
    "iaf_hz": "number",
    "spectral_edge_95_hz": "number",
    "ratios": {
      "theta_beta": "number",
      "theta_alpha": "number",
      "alpha_theta": "number"
    },
    "asymmetry": {
      "Fp1_Fp2_alpha": "number",
      "F3_F4_alpha": "number",
      "C3_C4_alpha": "number",
      "O1_O2_alpha": "number"
    }
  },
  "connectivity": {
    "wpli_matrix": [["number"]],
    "graph_metrics": {
      "global_efficiency": "number",
      "local_efficiency": "number",
      "clustering_coefficient": "number",
      "characteristic_path_length": "number",
      "small_worldness": "number",
      "modularity": "number"
    }
  },
  "source_localization": {
    "method": "sLORETA|eLORETA|MNE|dSPM",
    "sources": [{"mni_x": "number", "mni_y": "number", "mni_z": "number", "intensity": "number", "region": "string"}]
  },
  "biomarkers": [{
    "name": "string",
    "condition": "string",
    "value": "number",
    "z_score": "number",
    "evidence_grade": "A|B|C|D",
    "provenance": "measured|inferred|proxy|simulated",
    "confidence": "number"
  }],
  "interpretation": {
    "summary": "string",
    "findings": [{"description": "string", "severity": "mild|moderate|severe", "evidence": "string"}],
    "recommendations": [{"protocol": "string", "target": "string", "evidence_grade": "A|B|C|D"}]
  },
  "safety_disclaimer": "This report is for decision-support only and does not constitute a medical diagnosis.",
  "report_state": "DRAFT_AI|UNDER_REVIEW|REVIEWED|SIGNED|DISTRIBUTED",
  "signed_by": "string|null",
  "signed_at": "ISO8601|null"
}
```

### Appendix G: Regulatory Compliance Matrix

| Regulation/Standard | MRI Compliance | qEEG Compliance | Fusion Compliance |
|--------------------|----------------|-----------------|-------------------|
| **FDA 510(k) Class II** | Decision-support disclaimer | Decision-support disclaimer | Decision-support disclaimer |
| **IEC 62304** | Software lifecycle documented | Software lifecycle documented | Integrated lifecycle |
| **ISO 13485** | Quality management plan | Quality management plan | Unified QMS |
| **HIPAA** | PHI de-identification PS3.15 | FHIR R4 consent gating | Cross-modal consent enforcement |
| **IQCB 2025** | N/A | Full guideline alignment | N/A |
| **ACNS Guideline 7** | N/A | Full guideline alignment | N/A |
| **GDPR** | Data minimization, right to deletion | Data minimization, right to deletion | Unified data governance |
| **FDA SaMD Class A** | Classification documented | Classification documented | Classification documented |

### Appendix H: Glossary

| Term | Definition |
|------|-----------|
| **AAL** | Automated Anatomical Labeling atlas |
| **BIDS** | Brain Imaging Data Structure (standardized format) |
| **BOLD** | Blood-Oxygen-Level-Dependent (fMRI contrast) |
| **DICOM** | Digital Imaging and Communications in Medicine |
| **DLPFC** | Dorsolateral Prefrontal Cortex |
| **DTI** | Diffusion Tensor Imaging |
| **DWI** | Diffusion-Weighted Imaging |
| **EDF** | European Data Format (EEG file format) |
| **FA** | Fractional Anisotropy |
| **fMRI** | Functional Magnetic Resonance Imaging |
| **HD-BET** | High-Definition Brain Extraction Tool |
| **IAF** | Individual Alpha Frequency |
| **ICV** | Intracranial Volume |
| **MNE** | Minimum Norm Estimate (source localization) |
| **MNI** | Montreal Neurological Institute (coordinate system) |
| **MONAI** | Medical Open Network for AI (segmentation framework) |
| **MPR** | Multi-Planar Reconstruction |
| **NIfTI** | Neuroimaging Informatics Technology Initiative format |
| **nnU-Net** | No-new-Net (self-configuring segmentation) |
| **OCD** | Obsessive-Compulsive Disorder |
| **PHI** | Protected Health Information |
| **PSD** | Power Spectral Density |
| **rTMS** | Repetitive Transcranial Magnetic Stimulation |
| **sLORETA** | Standardized Low Resolution Brain Electromagnetic Tomography |
| **SMA** | Supplementary Motor Area |
| **tACS** | Transcranial Alternating Current Stimulation |
| **tDCS** | Transcranial Direct Current Stimulation |
| **tRNS** | Transcranial Random Noise Stimulation |
| **TMS** | Transcranial Magnetic Stimulation |
| **wPLI** | Weighted Phase Lag Index |
| **WMH** | White Matter Hyperintensity |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-15 | DeepSynaps AI | Initial creation — MRI + qEEG integrated roadmap |
| 2.0 | 2026-05-15 | DeepSynaps AI | Comprehensive expansion with all endpoints, services, appendices |

---

> **DISCLAIMER**: This document is for internal planning purposes only. All clinical features described are decision-support tools and do not constitute medical devices or diagnostic systems. All clinical outputs require review and sign-off by qualified healthcare professionals before use in patient care.

> **COPYRIGHT** (C) 2026 DeepSynaps Protocol Studio. All rights reserved.
