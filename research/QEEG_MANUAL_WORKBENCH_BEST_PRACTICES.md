# QEEG Manual Workbench Best Practices: The Definitive Guide

## Building the Best Manual EEG Review Workbench

**Version:** 1.0
**Scope:** Clinical and research EEG trace review, annotation, and sign-off workflows
**Based on analysis of:** BrainVision Analyzer, NeuroScan SCAN/CURRY, Nihon Kohden Neurofax, Persyst 15, XLTEK/Natus, MNE-Python, EEGLAB, visbrain, wonambi, and related clinical tooling

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Commercial Trace Viewers: Deep Dive](#2-commercial-trace-viewers-deep-dive)
3. [Open-Source Trace Viewers: Deep Dive](#3-open-source-trace-viewers-deep-dive)
4. [The 15 Most Critical Workbench Features](#4-the-15-most-critical-workbench-features)
5. [Montage Systems and Quick-Switch Design](#5-montage-systems-and-quick-switch-design)
6. [Epoch Marking and Data Quality Systems](#6-epoch-marking-and-data-quality-systems)
7. [Annotation Tools and Taxonomy](#7-annotation-tools-and-taxonomy)
8. [Measurement Cursors and Quantitative Tools](#8-measurement-cursors-and-quantitative-tools)
9. [Split-Screen and Multi-View Comparison](#9-split-screen-and-multi-view-comparison)
10. [Time-Frequency Decomposition Views](#10-time-frequency-decomposition-views)
11. [Event Marker and Event Management](#11-event-marker-and-event-management)
12. [Keyboard Shortcuts and Input Optimization](#12-keyboard-shortcuts-and-input-optimization)
13. [Display and Visualization Standards](#13-display-and-visualization-standards)
14. [Workflow Patterns: First-Pass Artifact Scan](#14-workflow-pattern-first-pass-artifact-scan)
15. [Workflow Patterns: Spike and IED Review](#15-workflow-pattern-spike-and-ied-review)
16. [Workflow Patterns: Sleep Scoring](#16-workflow-pattern-sleep-scoring)
17. [Workflow Patterns: Seizure Detection Review](#17-workflow-pattern-seizure-detection-review)
18. [Workflow Patterns: Sign-Off and Reporting](#18-workflow-pattern-sign-off-and-reporting)
19. [Workbench Architecture Recommendations](#19-workbench-architecture-recommendations)
20. [Appendix: Keyboard Shortcut Reference](#20-appendix-keyboard-shortcut-reference)

---

## 1. Executive Summary

Manual EEG review remains the gold standard for clinical neurophysiology diagnosis. Despite decades of automated detection algorithms, the human expert's eye is still required for final interpretation. This guide distills best practices from nine major EEG platforms -- five commercial and four open-source -- to define the optimal manual EEG review workbench.

### Key Principles

1. **Speed through familiarity**: The workbench must become an extension of the reader's cognitive process
2. **Non-destructive workflow**: All marks, annotations, and quality assessments must be stored as metadata layers, never altering raw data
3. **Context preservation**: Every annotation must be viewable in full context -- never isolate a finding from its surrounding EEG
4. **Keyboard-driven operation**: Mouse-based workflows slow expert readers by 3-5x; keyboard shortcuts are non-negotiable
5. **Progressive disclosure**: Simple views for screening, rich views for deep analysis

### The Universal Review Stages

Every EEG workbench must support five stages of review:

| Stage | Purpose | Typical Duration |
|-------|---------|-----------------|
| Stage 0: Technical Setup | Montage selection, sensitivity, filter verification | 1-2 min |
| Stage 1: First-Pass Scan | Global quality assessment, artifact identification | 5-15 min |
| Stage 2: Targeted Review | Spike/IED hunting, seizure assessment, sleep staging | 15-60 min |
| Stage 3: Deep Analysis | Measurement, comparison, source localization prep | 10-30 min |
| Stage 4: Sign-Off | Report generation, annotation finalization, archival | 5-10 min |

---

## 2. Commercial Trace Viewers: Deep Dive

### 2.1 BrainVision Analyzer 2 (Brain Products)

**Type:** Desktop research/clinical analysis suite
**Primary Use:** Research EEG/ERP analysis with clinical extensions
**Strengths:** History Tree workflow, MATLAB integration, multi-format support

**Trace Display Features:**

- **History Tree system**: Every processing step is a visual node in a tree structure, providing full provenance tracking. Nodes can be revisited, reparameterized, and reapplied without re-running the entire pipeline.
- **Fast data overlays**: Multiple datasets can be overlaid for comparison with on-demand calculation.
- **Interactive ICA**: Ocular correction and component analysis with real-time visual feedback.
- **Time-frequency analysis**: Built-in FFT, wavelet transforms, and connectivity measures.
- **Video integration**: Frame-by-frame synchronized video monitoring.
- **Format support**: Reads 50+ data formats including EDF, BDF, CNT, SET, and proprietary manufacturer formats.
- **3D Head View**: Realistic scalp topography with customizable head models.

**Best UX Patterns from BrainVision:**

1. **Non-destructive processing**: The History Tree concept ensures raw data is never modified -- all processing steps are applied as a view transformation. This should be the default model for any workbench.
2. **Visual provenance**: Each processing node's parameters are stored and displayed, making any analysis fully reproducible.
3. **Template application**: History Trees can be saved as templates and batch-applied to multiple datasets -- critical for standardized clinical workflows.

**Weaknesses:**
- Steeper learning curve than clinical review tools
- Research-oriented rather than optimized for high-volume clinical screening
- No native spike detection comparable to Persyst

---

### 2.2 NeuroScan SCAN / CURRY 9 (Compumedics)

**Type:** Desktop recording and analysis suite
**Primary Use:** EEG/MEG/ERP recording, review, multi-modal integration
**Strengths:** Multi-modal integration, 3D visualization, clinical epilepsy tools

**Trace Display Features:**

- **Adaptive UI**: Control panels are context-sensitive, showing only relevant tools for the current task.
- **Flexible data display**: Supports single or combined views -- raw waveform, spectrogram, time-frequency, topographic map, trace shift cross-section, and software ratings simultaneously.
- **Task manager**: Shows open tasks and recent UIs for rapid workflow navigation.
- **Multi-study comparison**: Multiple studies can be opened in parallel, synchronized, and compared side-by-side.
- **3D environment**: Integrated visualization of EEG/MEG data with MRI, CT, PET, SPECT, and DTI overlays.
- **Macro recorder**: Captures and replays processing sequences without programming.
- **Reporting tool**: Captures maps and tool outputs for report generation.

**Best UX Patterns from CURRY:**

1. **Adaptive interface**: Hiding irrelevant controls reduces cognitive load -- the workbench should always show only what's needed for the current review mode.
2. **Multi-modal correlation**: The ability to overlay neuroimaging with EEG data in a unified 3D view is essential for surgical planning and source localization.
3. **Workflow manager**: Explicit task management with state persistence helps readers track progress across long recordings.

**Weaknesses:**
- High system requirements for 3D features
- Complex licensing structure
- Less optimized for rapid clinical screening than dedicated review tools

---

### 2.3 Nihon Kohden Neurofax EEG-1200

**Type:** Clinical recording and review system
**Primary Use:** Wide-band EEG recording, review, brain function mapping
**Strengths:** Customizable workflows, note window, EEG scope, wide-band recording

**Trace Display Features:**

- **EEG Trend Program**: Converts EEG signals into trend graphs (aEEG, DSA, CSA, Power FFT) for easy interpretation.
- **Live View Panel**: Real-time centralized management of neuromonitoring data.
- **EEG scope**: Data reviewer that allows review of previous EEG while simultaneously monitoring new acquisitions. Can open up to 4 EEGs simultaneously.
- **3D voltage mapping**: Whole-head topographic maps for spatial interpretation of abnormalities.
- **Note Window**: Save up to 1,000 waveform sections for comparison by drag-and-drop. Up to 100 copied waveforms can be registered as sample data.
- **Customizable Main Menu**: Registration of examination protocol buttons with user-defined settings.
- **NeuroReport**: Integrated report templates with adaptive auto-text functions.
- **Brain function mapping**: Integrated cortical stimulation, recording switching, and mapping reports.

**Best UX Patterns from Nihon Kohden:**

1. **The Note Window**: The ability to collect, save, and compare waveform sections during review is a critical pattern. Any serious workbench needs a "clipboard" for waveform segments.
2. **Simultaneous multi-EEG review**: Opening up to 4 EEGs simultaneously (e.g., prior study + current study) is essential for longitudinal comparison.
3. **Customizable protocol buttons**: One-click access to preferred montage, sensitivity, and filter combinations for different examination types.

**Weaknesses:**
- Primarily optimized for Nihon Kohden hardware
- Less flexible for research applications
- Trend analysis less sophisticated than Persyst

---

### 2.4 Persyst 15 (Persyst Development Corporation)

**Type:** Clinical EEG review and analysis software (sold by all major EEG manufacturers)
**Primary Use:** Computer Assisted Review of EEG (C.A.R.E.)
**Strengths:** Industry-standard spike/seizure detection, trending, artifact reduction, multi-record capability

**Trace Display Features:**

- **Seizure Detection**: AI-based seizure detection statistically non-inferior to human experts. Supports adults and neonates (36-44 weeks conceptional age).
- **Spike Detection**: Non-inferior to skilled human reviewers. Clusters spikes by electrode, generates 1-second epochs centered on events, and supports sensitivity adjustment (low/medium/high).
- **Spike Review**: Interactive assessment of spikes within clusters. Supports sorting by similarity, amplitude, or perception. Waveform overlays and propagation maps for morphology assessment. Handles 6,000+ spikes efficiently.
- **Trending**: Comprehensive EEG trends including FFT, Rhythmicity, Peak Envelope, Artifact Intensity, Amplitude, Relative Symmetry, and Suppression Ratio.
- **Artifact Reduction (AR)**: Real-time selective reduction of eye, muscle, and electrode artifact.
- **Multi-record capability**: Combines multiple recordings into continuous 24-hour or full patient-stay views.
- **iEEG trending**: Functional groups, mixed recordings (scalp + intracranial), automatic and manual baseline management.
- **Dual video support**: Synchronized video playback with high-speed capability.
- **Montage management**: Montages organized into groups; montage formatting saved; favorites system.
- **Comment list**: Searchable, filterable annotation list with fractional event times.

**Best UX Patterns from Persyst:**

1. **Spike Review workflow**: The ability to sort, select, confirm, and reject spikes within clusters, with waveform overlays and voltage maps, represents the gold standard for spike review. The distinction between "Selected" (candidate) and "Confirmed" (reportable) spikes is critical.
2. **Multi-record continuity**: The ability to seamlessly page through multiple physical recordings as if they were one continuous study eliminates the cognitive disruption of file-switching.
3. **Ratcheting notifications**: Trend notification thresholds that dynamically adjust to progressive changes, alerting for evolving patient conditions.
4. **High-speed audio review**: Audio playback up to 500x for rapid screening of seizure audio signatures.
5. **Pan by click-and-drag**: Direct waveform panning for intuitive navigation.

**Weaknesses:**
- Expensive -- typically site-licensed
- Detection algorithms, while excellent, generate false positives requiring human verification
- Primarily Windows-focused

---

### 2.5 XLTEK / Natus EEG Review

**Type:** Hospital-integrated clinical EEG system
**Primary Use:** Inpatient and outpatient EEG recording and review
**Strengths:** EMU integration, bedside review, hospital workflow

**Trace Display Features:**

- **Live review during acquisition**: Studies can be reviewed in "review mode" while recording continues.
- **Multi-location access**: Review stations in EEG lab, EMU control room, and at bedside.
- **Patient search**: Tab-based organization by study type (e.g., "UMMC Continuous", "UMMC Routines").
- **Study status indicators**: Red folder icon indicates actively recording files.
- **Bedside review**: Direct access to currently recording studies with dedicated workstation login.

**Best UX Patterns from Natus:**

1. **Live concurrent review**: The ability to review data while acquisition continues is essential for EMU workflows where seizures must be identified in real-time.
2. **Contextual tab organization**: Organizing studies by type (routine vs. continuous) mirrors clinical workflow.
3. **Clear status indicators**: Visual differentiation of active vs. completed recordings prevents workflow errors.

**Weaknesses:**
- Less sophisticated analysis tools than Persyst or BrainVision
- Primarily designed for Natus/XLTEK hardware ecosystem
- Limited advanced quantitative EEG features

---

## 3. Open-Source Trace Viewers: Deep Dive

### 3.1 MNE-Python `raw.plot()`

**Type:** Python library with interactive plotting
**Primary Use:** Research EEG/MEG analysis, preprocessing, visualization
**Strengths:** Highly customizable, extensive keyboard shortcuts, annotation support, multiple backends

**Trace Display Features:**

- **Dual backends**: Matplotlib backend (universal) and PyQtGraph backend (GPU-accelerated, higher performance).
- **Interactive navigation**: Arrow keys scroll channels and time; Shift+arrow scrolls full page; Page Up/Down adjusts visible channels; Home/End adjusts time window.
- **Bad channel marking**: Click on channel label or trace to mark/unmark as bad. Updates `raw.info['bads']` automatically.
- **Annotation mode**: Press `a` to enter annotation mode. Mark time spans with descriptions. Colored patches show annotation regions.
- **Butterfly mode**: Press `b` to superimpose all channels of same type for detecting abnormal activity.
- **Zen mode**: Press `z` to hide scrollbars and UI chrome.
- **DC removal**: Press `d` to toggle slow-drift removal.
- **Overview bar**: Horizontal bar showing full time range with current position highlighted and annotations visible.
- **Scale bars**: Toggle with `s` key. Purple bar indicates current scale.
- **Filtering**: Optional highpass/lowpass display filtering with configurable filter order.
- **Event display**: Events shown as colored markers with configurable event colors.
- **Draggable annotations**: Press `p` to enable position adjustment of existing annotations.
- **Clipping modes**: None, clamp, transparent, or threshold-based clipping for values exceeding display range.

**Best UX Patterns from MNE:**

1. **Keyboard-first design**: The comprehensive keyboard shortcut system (documented with `?` key) enables review without mouse movement.
2. **Butterfly mode**: Superimposing all channels is the fastest way to spot focal abnormalities -- any workbench must support this.
3. **Annotation as first-class citizen**: Annotations are stored in `raw.annotations`, colored by type, and visible in the overview bar.
4. **Bad channel as metadata**: Marking channels as bad updates the underlying data structure, ensuring consistency across all subsequent operations.

**Weaknesses:**
- Requires Python programming knowledge for advanced use
- Less optimized for clinical high-volume review
- No native spike detection
- No time-frequency display in the main browser

---

### 3.2 EEGLAB `eegplot()`

**Type:** MATLAB toolbox with GUI
**Primary Use:** Research EEG/ERP preprocessing, artifact rejection, ICA
**Strengths:** Mature, extensive documentation, scrolling data review, epoch rejection

**Trace Display Features:**

- **Scrolling data review**: Continuous data display with vertical slider for channel navigation and arrow buttons for horizontal scrolling.
- **Epoch visualization**: Epochs delimited by dashed lines with click-to-reject functionality.
- **Multi-epoch display**: Five epochs shown simultaneously at configurable electrode sites.
- **Cursor value display**: Continuous display of data value at cursor position in status bar.
- **Zoom functionality**: Zoom into selected time ranges and electrode groups.
- **Rejection marking**: Click epochs to mark/unmark for rejection. Multiple rejection passes supported.
- **Boundary events**: Inserted at rejected data locations, preventing epoch selections from crossing gaps.
- **Channel data scrolling**: Both continuous and epoched data review modes.
- **ICA component scrolling**: Review independent component activations with same interface.
- **Menu-driven parameter changes**: Plotting parameters adjustable via upper-left menu.

**Best UX Patterns from EEGLAB:**

1. **Visual epoch rejection**: The ability to see multiple epochs simultaneously and click-to-mark for rejection is the gold standard for research artifact rejection.
2. **Boundary event system**: Automatically marking data gaps prevents analysis errors from crossing rejected segments.
3. **Multi-pass rejection**: Support for multiple rounds of rejection with accumulated markings enables iterative quality improvement.
4. **Channel highlighting**: Highlighting artifact-contributing channels in red directly on the trace makes artifact source identification immediate.

**Weaknesses:**
- MATLAB dependency and licensing cost
- Dated UI compared to modern tools
- Slower than GPU-accelerated alternatives for large datasets
- Primarily research-focused

---

### 3.3 visbrain (Sleep module)

**Type:** Python open-source visualization package
**Primary Use:** Sleep data visualization, scoring, analysis
**Strengths:** GPU-based fast visualization, sleep-specific tools, modular GUI

**Trace Display Features:**

- **Polysomnographic display**: EEG, EOG, EMG channels with customizable montages.
- **Time-frequency (spectrogram)**: Real-time spectrogram computation and display.
- **Hypnogram**: Synchronized hypnogram display with editing capability.
- **Topographic maps**: Scalp topography with customizable parameters.
- **Semi-automatic detection**: Spindles, K-complexes, slow waves, REMs, muscle twitches with controllable parameters.
- **Signal processing tools**: De-meaning, de-trending, filtering, re-referencing, bipolarization.
- **Sleep statistics**: Real-time computation and export of sleep statistics.
- **GUI state saving**: Save and restore complete GUI configuration.
- **Screenshot capture**: High-DPI controllable screenshots.
- **File format support**: EDF, BrainVision, Micromed, Elan formats supported natively; MNE-Python for extended formats.

**Best UX Patterns from visbrain:**

1. **Synchronized multi-panel view**: Polysomnogram + spectrogram + hypnogram + topography in one synchronized view is the ideal sleep review layout.
2. **Semi-automatic event detection**: Detected events (spindles, K-complexes) reported both on the hypnogram and in a table for easy navigation.
3. **GUI state persistence**: Saving complete display configuration (channels, amplitude, panels, checkboxes) enables standardized review environments.

**Weaknesses:**
- Sleep-focused rather than general EEG
- Less suitable for clinical epilepsy review
- Smaller user community than MNE/EEGLAB

---

### 3.4 wonambi

**Type:** Python package for EEG/ECoG/electrophysiology analysis
**Primary Use:** Sleep scoring, frequency analysis, spindle/slow wave detection
**Strengths:** Format flexibility, sleep scoring interface, time-frequency analysis

**Trace Display Features:**

- **Multi-format reading**: Axon (.abf), BrainVision (.vhdr/.vmrk/.eeg), EEGLAB (.set/.fdt), EDF, and more.
- **Sleep scoring interface**: Dedicated interface for visual sleep staging.
- **Frequency analysis**: Spectrogram and time-frequency analysis (short-time spectrogram, Morlet wavelet).
- **Event detection**: Spindle and slow wave detection algorithms.
- **Channel management**: Flexible channel selection and organization.

**Best UX Patterns from wonambi:**

1. **Format-agnostic reading**: The ability to read multiple proprietary formats is essential for a universal workbench.
2. **Integrated detection**: Built-in spindle and slow wave detection with results overlaid on the trace.

**Weaknesses:**
- Less comprehensive than visbrain for sleep
- Smaller feature set than MNE
- Limited community support

---

## 4. The 15 Most Critical Workbench Features

Based on analysis of all nine platforms and five clinical workflow patterns, the following 15 features are ranked by criticality for a manual EEG review workbench:

### 4.1 Ranked Feature List

| Rank | Feature | Justification | Primary Inspiration |
|------|---------|---------------|-------------------|
| **1** | **Keyboard-first navigation** | Every platform's most efficient users rely on keyboard shortcuts. Mouse-based review is 3-5x slower for experienced readers. | MNE, Persyst, Brainstorm |
| **2** | **Non-destructive annotation layer** | Raw data must never be modified. All marks, annotations, quality assessments stored as metadata overlays. | BrainVision History Tree, Persyst |
| **3** | **Montage quick-switch system** | Readers must switch between 5-10 montages dozens of times per study. Sub-second switching is required. | Brainstorm (Shift+A-Z), Persyst |
| **4** | **Good/Bad/Uncertain epoch marking** | Three-state quality system enables progressive review. "Uncertain" prevents false confidence. | EEGLAB, Persyst, MNE |
| **5** | **Spike/IED annotation with cluster review** | The most common specialized review task. Cluster-based review with sorting, selection, and confirmation. | Persyst Spike Review |
| **6** | **Measurement cursors (time/voltage/amplitude)** | Essential for quantifying findings: amplitude measurement, duration calculation, interval timing. | Nihon Kohden, Persyst |
| **7** | **Split-screen comparison (same patient, different times)** | Longitudinal comparison and pre/post analysis are standard clinical requirements. | Persyst Multi-record, Nihon Kohden |
| **8** | **Time-frequency decomposition view** | Spectrograms and time-frequency maps reveal patterns invisible in raw traces (e.g., evolving seizure rhythms). | visbrain, BrainVision, Persyst trends |
| **9** | **Event marker display and management** | Visual event markers with color-coding, search, and filtering. Events must be visible in both trace and overview. | MNE, Persyst Comment List |
| **10** | **Butterfly/superimposed channel view** | All channels overlaid -- the fastest way to identify focal abnormalities and spatial distribution. | MNE, Persyst |
| **11** | **Auto-scale with manual override** | Automatic sensitivity adjustment prevents time wasted on manual scaling, but expert override must always be available. | MNE (scalings='auto'), Persyst |
| **12** | **Grid display options (time/voltage)** | Configurable time and voltage grid lines for standardized measurement and interpretation. | Nihon Kohden, BrainVision |
| **13** | **Artifact annotation taxonomy** | Structured artifact labeling (movement, electrode, muscle, eye, cardiac) enables quality tracking and automated rejection. | Persyst, clinical workflow notes |
| **14** | **Sleep stage annotation interface** | For continuous monitoring, integrated sleep staging with hypnogram and epoch-by-epoch assignment. | visbrain, Persyst Sleep State |
| **15** | **Sign-off workflow with audit trail** | Progressive sign-off (technologist preliminary -> physician final) with timestamps, versioning, and rollback. | Natus, clinical EMU workflows |

### 4.2 Feature Dependency Graph

```
Keyboard Navigation (1)
    |
    +---> Montage Quick-Switch (3)
    +---> Epoch Marking (4)
    +---> Annotation Tools (5, 13)
    +---> Measurement Cursors (6)
    +---> Event Management (9)
    |
Non-destructive Layer (2)
    |
    +---> All annotations (4, 5, 9, 13, 14)
    +---> Sign-off workflow (15)
    +---> Split-screen comparison (7)
    |
Display Views
    |
    +---> Time-frequency (8) <----> Raw trace view
    +---> Butterfly view (10)
    +---> Grid options (12)
    +---> Auto-scale (11)
```

---

## 5. Montage Systems and Quick-Switch Design

### 5.1 The Montage Problem

EEG is always recorded with a reference, but clinical interpretation requires viewing data in multiple reference configurations. A single 21-channel EEG recording can be viewed in 50+ different montage configurations. The average clinical reader switches montages 20-50 times per study.

### 5.2 Standard Montage Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **Referential** | View each channel against a common reference | Avg Reference, Cz Reference, Linked Ears |
| **Bipolar (longitudinal)** | Anterior-posterior chain for detecting focal abnormalities | Double Banana, Circumferential |
| **Bipolar (transverse)** | Left-right comparison for lateralization | Transverse, Temporal chain |
| **Laplacian/SCD** | Sharpen focal activity, reduce volume conduction | Hjorth Laplacian, SCD |
| **Specialized** | Specific clinical or research needs | Intracranial bipolar, EKG-only, Average ref + EOG |

### 5.3 Quick-Switch Design Patterns

#### Pattern A: Keyboard Shortcuts (Brainstorm-style)
- Assign Shift+A through Shift+Z to favorite montages
- Shift+A reserved for "All channels"
- Shortcuts saved per-user, per-equipment-type
- Visual indicator of current shortcut assignment

#### Pattern B: Function Key Row (Clinical standard)
- F1: Double Banana (longitudinal bipolar)
- F2: Transverse bipolar
- F3: Average reference
- F4: Laplacian
- F5: Circumferential
- F6-F12: User-defined or specialized montages

#### Pattern C: Dropdown with Recent (Persyst-style)
- Montages organized into groups (10-20, 10-10, iEEG, Custom)
- Recently used montages pinned to top
- Search/filter for finding montages by name
- Formatting saved with montage (sensitivity, colors, channel order)

### 5.4 Best Practice: The "Three-Montage Rule"

Expert EEG readers typically have a "home montage" they use for 70% of review, with 2-3 secondary montages for specific tasks:

1. **Screening montage** (usually longitudinal bipolar) -- for first-pass artifact and abnormality detection
2. **Localization montage** (usually average reference or Laplacian) -- for determining field distribution
3. **Lateralization montage** (usually transverse bipolar) -- for left-right comparison

The workbench should support one-key switching between these three core montages.

### 5.5 Montage Editor Requirements

A complete montage editor must support:

- Drag-and-drop channel reordering
- Reference channel selection (single, average, custom group)
- Bipolar pair creation with automatic chain generation
- Laplacian/SCD configuration (neighbor radius, weighting)
- Import/export of montage definitions
- Per-user favorites and defaults
- Preview before applying

---

## 6. Epoch Marking and Data Quality Systems

### 6.1 The Three-State Quality Model

Every epoch of EEG data should have a quality state:

| State | Color | Meaning | Action |
|-------|-------|---------|--------|
| **Good** | Green | Clean, interpretable data | Include in all analyses |
| **Uncertain** | Yellow | Possible artifact, requires review | Flag for second opinion |
| **Bad** | Red | Uninterpretable due to artifact | Exclude from quantitative analysis |

### 6.2 Epoch Marking Patterns from Platforms

#### MNE-Python Pattern
- Click channel label or trace to mark/unmark as bad
- Updates `raw.info['bads']` in real-time
- Bad channels shown in distinct color (gray)
- Persisted across save/load operations

#### EEGLAB Pattern
- Click on epoch to toggle rejection mark
- Visual highlighting of rejected epochs
- Multiple rejection rounds accumulate marks
- Boundary events inserted at rejected segments

#### Persyst Pattern
- Spike confirmation/rejection states (Selected vs. Confirmed vs. Rejected)
- Rejected spikes hidden from Comment List but restorable
- Confirmed spikes included in Final Report

### 6.3 Quality Metadata Model

```
Epoch Quality Record:
  - epoch_id: unique identifier
  - start_time: epoch start in seconds
  - end_time: epoch end in seconds
  - quality_state: good | uncertain | bad
  - quality_reason: artifact_type | user_assessment | auto_detection
  - marked_by: user_id | system_name
  - marked_at: timestamp
  - confidence: 0.0-1.0 (for automated marks)
  - review_status: pending | reviewed | overridden
  - override_by: user_id (if manually overridden)
  - notes: free-text annotation
```

### 6.4 First-Pass Quality Checklist

For each recording, the first-pass reviewer should verify:

1. [ ] All expected channels present and recording
2. [ ] No flat-line channels (electrode off or broken)
3. [ ] No channels with excessive noise
4. [ ] EKG channel visible and usable
5. [ ] Calibration pulse present and correct at recording start
6. [ ] Time synchronization correct (if video-linked)
7. [ ] Impedances within acceptable range at recording start
8. [ ] No significant drift in more than 2 channels
9. [ ] Notation of patient state (awake, drowsy, asleep) at start

---

## 7. Annotation Tools and Taxonomy

### 7.1 Annotation Categories

A comprehensive EEG annotation system must support these categories:

#### Abnormality Annotations
| Annotation | Description | Priority |
|------------|-------------|----------|
| `spike` | Single epileptiform spike | High |
| `spike_and_wave` | Spike-and-wave complex | High |
| `polyspike` | Multiple spikes | High |
| `polyspike_and_wave` | Polyspike-and-wave complex | High |
| `sharp_wave` | Sharp wave (non-spike) | High |
| `seizure_onset` | Beginning of electrographic seizure | Critical |
| `seizure_offset` | End of electrographic seizure | Critical |
| `slowing_focal` | Focal slow activity | Medium |
| `slowing_generalized` | Generalized slow activity | Medium |
| `burst_suppression` | Burst-suppression pattern | Critical |
| `electrocerebral_silence` | Absence of cerebral activity | Critical |

#### Artifact Annotations
| Annotation | Description |
|------------|-------------|
| `artifact_movement` | Patient movement |
| `artifact_electrode` | Electrode pop/loose electrode |
| `artifact_muscle` | Muscle/EMG artifact |
| `artifact_eye_blink` | Eye blink |
| `artifact_eye_movement` | Eye movement (lateral/vertical) |
| `artifact_cardiac` | EKG/heartbeat artifact |
| `artifact_sweat` | Sweat artifact (slow drift) |
| `artifact_interference` | Electrical interference |

#### Sleep Stage Annotations
| Annotation | Standard Code |
|------------|--------------|
| `sleep_wake` | W |
| `sleep_n1` | N1 |
| `sleep_n2` | N2 |
| `sleep_n3` | N3 |
| `sleep_rem` | R |
| `sleep_unscored` | ? |

#### Event Annotations
| Annotation | Description |
|------------|-------------|
| `stimulation_photic` | Photic stimulation |
| `stimulation_hyperventilation` | Hyperventilation |
| `medication_given` | Medication administration |
| `patient_event` | Reported clinical event |
| `pruning_artifact` | Data excluded from analysis |

### 7.2 Annotation UX Patterns

#### Pattern A: Keyboard-Driven (MNE-style)
- Press `a` to enter annotation mode
- Click and drag to define time range
- Type description (with autocomplete from taxonomy)
- Annotation appears as colored patch on trace and in overview bar
- Press `p` to enable dragging of existing annotations

#### Pattern B: Point-and-Click (Persyst-style)
- Right-click on waveform for context menu
- Select "Add comment/annotation"
- Define start time and duration
- Select from structured taxonomy or free-text
- Annotations appear in synchronized Comment List

#### Pattern C: Drag-and-Drop (Nihon Kohden-style)
- Drag cursor to select waveform segment
- Copy to Note Window for comparison
- Up to 1,000 sections saved per study
- Sections can be registered as sample data

### 7.3 Annotation Display Requirements

1. **In-trace visibility**: Annotations must be visible as colored regions directly on the waveform trace
2. **Overview bar visibility**: All annotations must appear on the global overview/timeline bar
3. **Type-based color coding**: Each annotation type has a distinct, configurable color
4. **Label display**: Annotation descriptions must be visible at zoom levels where space permits
5. **Hover details**: Hovering over an annotation shows full details (time, duration, author, confidence)
6. **Search and filter**: Annotations must be searchable by text and filterable by type
7. **Navigation**: Clicking an annotation in a list jumps the trace view to that time point

---

## 8. Measurement Cursors and Quantitative Tools

### 8.1 Essential Measurements

The workbench must support these measurements directly on the trace:

| Measurement | Method | Units |
|-------------|--------|-------|
| **Amplitude** | Voltage cursor (peak-to-peak or baseline-to-peak) | microvolts (uV) |
| **Duration** | Time cursor span | milliseconds (ms) or seconds |
| **Frequency** | Count cycles over measured interval | Hertz (Hz) |
| **Interval** | Time between two marked points | seconds |
| **Slope** | Rise/fall rate over selected segment | uV/ms |

### 8.2 Cursor Design Patterns

#### Dual Cursor System (Persyst/Nihon Kohden)
- Cursor 1 (primary): Thin vertical line, default color red
- Cursor 2 (secondary): Thin vertical line, default color blue
- Both cursors movable by click-drag or keyboard arrow keys
- Measurement panel shows: time difference, amplitude at each cursor, amplitude difference
- When creating a range, a flag on cursor 2 shows duration and dynamically updates

#### Single Cursor + Measurement Mode
- One primary cursor always follows mouse when in measurement mode
- Click to place anchor point
- Second click completes measurement
- Real-time readout of current measurement as cursor moves
- Results logged to measurement history

### 8.3 Auto-Measurement Features

| Feature | Description |
|---------|-------------|
| Auto-peak detect | Find highest amplitude point within marked range |
| Auto-trough detect | Find lowest amplitude point within marked range |
| Frequency count | Count zero-crossings or peaks in marked range |
| RMS calculation | Root-mean-square amplitude over interval |
| Area under curve | Integral of signal over marked range |

### 8.4 Calibration Verification

Before each review session, the workbench should verify:
- Calibration pulse amplitude matches expected value (typically 50 uV)
- Calibration pulse duration is correct
- All channels show equal calibration deflection
- Recording sensitivity matches standard (typically 7 uV/mm or 10 mm/50 uV)

---

## 9. Split-Screen and Multi-View Comparison

### 9.1 Comparison Modes

#### Mode A: Temporal Comparison (Same Recording, Different Times)
- Left panel: Earlier time point
- Right panel: Later time point
- Both panels use identical montage, sensitivity, and filters
- Synchronized scrolling option (page both panels simultaneously)
- Essential for: tracking evolution of abnormalities, pre-ictal vs ictal comparison

#### Mode B: Montage Comparison (Same Time, Different Montages)
- Left panel: Montage A (e.g., longitudinal bipolar)
- Right panel: Montage B (e.g., average reference)
- Red vertical line marks identical time point in both panels
- Essential for: confirming findings across reference schemes, localizing abnormalities

#### Mode C: Recording Comparison (Different Recordings, Same Patient)
- Left panel: Prior EEG recording
- Right panel: Current EEG recording
- Both at matched time-of-day if relevant
- Essential for: longitudinal assessment, pre/post medication, pre/post surgery

#### Mode D: Event Comparison (Multiple Events, Same Type)
- Display multiple similar events (e.g., spikes) in a grid
- Each event centered on the trigger point
- Essential for: assessing spike morphology consistency, propagation pattern analysis

### 9.2 Multi-View Implementation Requirements

1. **Independent zoom/scroll per panel**: Each panel must have independent time and amplitude scaling
2. **Synchronize toggle**: Optional linking of time position across panels
3. **Montage independence**: Each panel can display a different montage
4. **Annotation visibility**: Annotations from all panels visible in a unified timeline
5. **Copy annotations**: Ability to copy annotation from one panel to another

---

## 10. Time-Frequency Decomposition Views

### 10.1 The Need for Time-Frequency

Raw EEG traces show amplitude over time but obscure frequency content. Time-frequency decomposition reveals:
- Evolution of seizure rhythms (decremental frequency evolution)
- Sleep architecture (delta power changes)
- Background rhythm assessment (alpha, theta, beta power)
- Artifact identification (broadband EMG, line noise)

### 10.2 Decomposition Methods

| Method | Best For | Computational Cost | Resolution |
|--------|----------|-------------------|------------|
| **Short-time FFT (Spectrogram)** | General overview, sleep analysis | Low | Moderate |
| **Morlet Wavelet** | Seizure analysis, transient events | Medium | Good time-frequency balance |
| **Hilbert Transform** | Envelope extraction, phase analysis | Medium | Good |
| **Multitaper** | Statistical spectral estimation | High | High |

### 10.3 Spectrogram Display Standards

- **Frequency range**: 0-50 Hz default; 0-100 Hz for high-frequency oscillations
- **Color scale**: Configurable (default: warm colors for high power, cool for low)
- **Time alignment**: Spectrogram time axis must align precisely with raw trace time axis
- **Cursor synchronization**: Time cursors on raw trace show corresponding position on spectrogram
- **Channel selection**: Click channel to show its spectrogram in side panel

### 10.4 Trend Displays (Persyst-style)

For long-term monitoring, compressed trend displays are essential:

| Trend Type | What It Shows | Clinical Use |
|------------|--------------|-------------|
| **Amplitude** | Overall signal amplitude over time | Detecting attenuation, burst suppression |
| **FFT Power** | Power in standard bands (delta, theta, alpha, beta) | Background assessment, sleep staging |
| **Rhythmicity** | Degree of rhythmic activity | Seizure detection, burst detection |
| **aEEG** | Amplitude-integrated EEG (compressed amplitude envelope) | Neonatal monitoring, trend overview |
| **Suppression Ratio** | Percentage of time below amplitude threshold | Burst suppression quantification |
| **Relative Symmetry** | Left-right power symmetry | Focal abnormality detection |
| **Artifact Intensity** | Degree of artifact contamination | Quality monitoring |

### 10.5 Layout Recommendations

**Research/Detailed Review Layout:**
```
+----------------------------+----------------------------+
| Raw EEG Trace              | Spectrogram (selected ch)   |
| (main viewing area)        | (time-frequency)            |
|                            |                             |
|                            |                             |
+----------------------------+----------------------------+
| Overview bar (full recording with annotations)           |
+----------------------------+----------------------------+
| Event list / Annotation list / Measurement panel          |
+----------------------------+----------------------------+
```

**Clinical Screening Layout:**
```
+----------------------------+----------------------------+
| Raw EEG Trace              | Trend panels (aEEG, FFT)    |
|                            |                             |
+----------------------------+----------------------------+
| Overview bar                                             |
+----------------------------+----------------------------+
```

---

## 11. Event Marker and Event Management

### 11.1 Event Types

| Category | Examples | Display Style |
|----------|----------|--------------|
| **Acquisition events** | Triggers, protocol markers | Small tick marks at top |
| **System events** | Impedance checks, calibration | Diamond markers |
| **User annotations** | Spikes, seizures, artifacts | Colored spans or flags |
| **Automated detections** | Algorithm output | Outlined flags with confidence |
| **Video events** | Patient movement, button press | Triangle markers |
| **Physiological** | EKG R-waves, respiratory | Small dots on relevant channel |

### 11.2 Event Display Requirements

1. **Color-coded by type**: Each event category has a distinct, configurable color
2. **Layered visibility**: Toggle visibility of event categories independently
3. **Overview integration**: All events visible on the global overview bar
4. **Event list panel**: Scrollable, sortable, filterable list of all events
5. **Search**: Text search across event descriptions
6. **Navigation**: Click event in list to jump to that time point
7. **Bulk operations**: Select multiple events for batch operations

### 11.3 Event Confidence System

For automated detections, a confidence tier system should be used:

| Tier | Color | Action |
|------|-------|--------|
| High confidence | Green | Likely correct, quick verify |
| Medium confidence | Yellow | Review carefully |
| Low confidence | Red | Likely false positive, review with full context |

---

## 12. Keyboard Shortcuts and Input Optimization

### 12.1 Universal Shortcut Philosophy

The workbench must be fully operable without a mouse. All common actions must have keyboard shortcuts. Shortcuts should follow conventions from existing platforms to minimize learning curve.

### 12.2 Core Navigation Shortcuts

| Action | MNE | EEGLAB | Persyst | **Recommended** |
|--------|-----|--------|---------|----------------|
| Scroll channels up | Up arrow | Slider | (mouse) | **Up arrow** |
| Scroll channels down | Down arrow | Slider | (mouse) | **Down arrow** |
| Scroll time left (1/4 page) | Left arrow | Arrow btn | Left arrow | **Left arrow** |
| Scroll time right (1/4 page) | Right arrow | Arrow btn | Right arrow | **Right arrow** |
| Scroll time left (full page) | Shift+Left | (menu) | (mouse) | **Shift+Left** |
| Scroll time right (full page) | Shift+Right | (menu) | (mouse) | **Shift+Right** |
| Increase visible channels | Page Up | (menu) | (menu) | **Page Up** |
| Decrease visible channels | Page Down | (menu) | (menu) | **Page Down** |
| Increase time window | End | (menu) | (menu) | **End** |
| Decrease time window | Home | (menu) | (menu) | **Home** |

### 12.3 Display Control Shortcuts

| Action | MNE | **Recommended** |
|--------|-----|----------------|
| Scale up (increase gain) | `+` or `=` | **`+`** |
| Scale down (decrease gain) | `-` | **`-`** |
| Toggle scale bars | `s` | **`s`** |
| Toggle DC removal | `d` | **`d`** |
| Toggle butterfly mode | `b` | **`b`** |
| Toggle annotation mode | `a` | **`a`** |
| Toggle zen mode (hide UI) | `z` | **`z`** |
| Full screen | F11 | **F11** |
| Help | `?` | **`?`** |

### 12.4 Montage Shortcuts

| Key | Recommended Montage |
|-----|-------------------|
| F1 | Double Banana (longitudinal bipolar) |
| F2 | Transverse bipolar |
| F3 | Average reference |
| F4 | Laplacian (Hjorth) |
| F5 | Circumferential |
| F6 | EKG / Respiratory only |
| F7 | Custom user montage 1 |
| F8 | Custom user montage 2 |
| F9 | Custom user montage 3 |

### 12.5 Annotation Shortcuts

| Key | Action |
|-----|--------|
| `a` | Enter/exit annotation mode |
| `1` | Mark spike |
| `2` | Mark seizure onset |
| `3` | Mark artifact |
| `4` | Mark good epoch |
| `5` | Mark bad epoch |
| `6` | Mark uncertain epoch |
| `Esc` | Cancel current annotation |
| `Enter` | Confirm current annotation |
| `Del` | Delete selected annotation |

### 12.6 Measurement Shortcuts

| Key | Action |
|-----|--------|
| `m` | Enter measurement mode |
| `c` | Place cursor 1 |
| `v` | Place cursor 2 |
| `x` | Clear all cursors |
| `Space` | Toggle cursor 1 / cursor 2 placement |

### 12.7 Playback Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Start/stop playback |
| `]` | Increase playback speed |
| `[` | Decrease playback speed |
| `.` | Step forward 1 second |
| `,` | Step backward 1 second |
| `f` | Fast forward (10x) |
| `r` | Rewind (10x) |

---

## 13. Display and Visualization Standards

### 13.1 Sensitivity Standards

| Context | Standard Sensitivity | Display Equivalent |
|---------|---------------------|-------------------|
| Adult EEG (routine) | 7 uV/mm or 50 uV/7mm | ~7 uV/mm |
| Pediatric EEG | 10-15 uV/mm (higher) | ~10 uV/mm |
| Neonatal EEG | 10-20 uV/mm | ~15 uV/mm |
| ICU/continuous | 5-7 uV/mm | ~7 uV/mm |
| High-amplitude events | Adjustable down to 50 uV/mm | ~50 uV/mm |

### 13.2 Time Window Standards

| Context | Standard Window | Channels Visible |
|---------|----------------|-----------------|
| Routine review | 10 seconds/page | 16-21 |
| Screening/overview | 15-20 seconds/page | All |
| Spike hunting | 5-10 seconds/page | 16-21 |
| Seizure review | 15-30 seconds/page | 16-21 |
| Sleep scoring | 20-30 seconds/epoch | 6-8 (PSG) |
| Long-term trend | 1-24 hours | Trends only |

### 13.3 Filter Standards

| Filter | Setting | Purpose |
|--------|---------|---------|
| High-pass | 0.5-1 Hz | Remove slow drift |
| Low-pass | 70 Hz | Remove high-frequency noise |
| Notch | 50/60 Hz | Remove line frequency |
| Display only | 1-30 Hz | Routine viewing |
| Display only | 1-70 Hz | Full bandwidth |
| Display only | 0.1-1 Hz | Very slow activity |

**Critical principle**: Filters applied for display must never alter stored data. The workbench must clearly indicate when display filters are active.

### 13.4 Grid Display Options

| Grid Type | Description | Standard |
|-----------|-------------|----------|
| Time grid | Vertical lines at regular intervals | 1-second intervals |
| Voltage grid | Horizontal lines at regular intervals | 50 uV or 100 uV divisions |
| Epoch grid | Vertical lines delimiting epochs | Per sleep epoch or analysis window |
| Combined | All grid types simultaneously | Clinical standard |

Grid options should include:
- Toggle grid on/off
- Grid color (light gray recommended)
- Grid line style (solid or dashed)
- Grid density (adjustable interval)
- Major/minor grid distinction

### 13.5 Color Standards

| Element | Recommended Color | Rationale |
|---------|------------------|-----------|
| EEG traces | Black or dark blue | Maximum contrast |
| EOG traces | Red | Distinct from EEG |
| ECG trace | Green | Medical convention |
| EMG trace | Brown | Distinct from other channels |
| Bad channels | Gray | Clearly indicates exclusion |
| Selected channels | Highlighted (yellow background) | Visual attention |
| Annotation: spike | Red | High priority |
| Annotation: seizure | Orange | Critical priority |
| Annotation: artifact | Purple | Informational |
| Annotation: sleep stage | Cyan | Distinct from abnormalities |
| Measurement cursors | Red (primary), Blue (secondary) | Standard pair |
| Grid lines | Light gray (#E0E0E0) | Non-distracting |
| Background | White or off-white | Maximum readability |

---

## 14. Workflow Pattern: First-Pass Artifact Scan

### 14.1 Purpose

The first-pass artifact scan is a rapid quality assessment of the entire recording. It identifies technical problems, significant artifacts, and determines whether the recording is of sufficient quality for clinical interpretation.

### 14.2 Step-by-Step Procedure

**Step 1: Technical Verification (1-2 minutes)**
1. Verify calibration pulse at recording start
2. Check impedance values
3. Confirm all expected channels present
4. Verify time synchronization (if video-linked)

**Step 2: Global Overview (3-5 minutes)**
1. Set sensitivity to standard (7 uV/mm)
2. Set time window to 15-20 seconds/page
3. Use average reference montage for initial scan
4. Page through entire recording at 2-3x normal speed
5. Mark any flat-line channels as "bad"
6. Note any sections of sustained artifact

**Step 3: Channel Quality Assessment (3-5 minutes)**
1. Switch to longitudinal bipolar montage
2. Review each channel pair systematically
3. Mark channels with persistent artifact as "bad"
4. Note any intermittent artifact patterns
5. Verify EKG channel is clean and usable

**Step 4: Artifact Documentation (2-3 minutes)**
1. Navigate to major artifact sections
2. Annotate artifact type and duration
3. Mark epochs as "bad" if uninterpretable
4. Note any artifact-free sections for priority review

**Step 5: Quality Summary**
1. Generate quality summary report
2. Calculate percentage of "good" vs "bad" data
3. If >30% bad data, flag for technical repeat
4. Document all quality decisions

### 14.3 First-Pass Keyboard Workflow

```
[Start] -> F3 (avg reference) -> Home (10s window)
  -> Right arrow (page through recording)
  -> Click bad channel labels
  -> a (annotation mode) -> mark artifacts
  -> F1 (longitudinal bipolar) -> review channels
  -> Generate quality report
```

### 14.4 Quality Thresholds

| Parameter | Acceptable | Marginal | Unacceptable |
|-----------|-----------|----------|-------------|
| Bad channel percentage | <10% | 10-20% | >20% |
| Bad epoch percentage | <20% | 20-40% | >40% |
| Calibration accuracy | +/- 2% | +/- 5% | >+/- 5% |
| Impedance (pre-record) | <5 kOhm | 5-10 kOhm | >10 kOhm |

---

## 15. Workflow Pattern: Spike and IED Review

### 15.1 Purpose

Spike and interictal epileptiform discharge (IED) review identifies epileptiform abnormalities that support epilepsy diagnosis and localization.

### 15.2 Preparation

1. Set sensitivity to 7 uV/mm (standard) or 10 uV/mm (if background is low amplitude)
2. Set time window to 10 seconds/page
3. Use longitudinal bipolar montage (F1)
4. Ensure all artifact annotations are visible

### 15.3 Review Procedure

**Phase 1: Systematic Page-by-Page Review**
1. Start at beginning of recording
2. Advance page by page (Shift+Right arrow)
3. Scan all channels for sharp transients
4. For each suspected spike:
   - Measure amplitude (must be >2x background)
   - Measure duration (spikes <70 ms, sharp waves 70-200 ms)
   - Assess field (distribution across channels)
   - Check for after-going slow wave
   - Confirm against artifact annotations
5. If confirmed as IED, annotate with type and location

**Phase 2: Targeted Review**
1. Review all spike annotations
2. Switch to average reference (F3) for field assessment
3. Switch to transverse bipolar (F2) for lateralization
4. Switch to Laplacian (F4) for focal sharpening
5. Document spike frequency (spikes per minute)

**Phase 3: Cluster Analysis (Persyst-style)**
1. Review spikes grouped by electrode of maximum amplitude
2. Sort by similarity, amplitude, or perception
3. Compare individual spikes against cluster average
4. Confirm or reject each spike
5. Generate spike summary report

### 15.4 Spike Annotation Schema

```
Spike Annotation:
  - type: spike | sharp_wave | spike_and_wave | polyspike | polyspike_and_wave
  - location: electrode_of_maximum_amplitude
  - field: focal | regional | hemispheric | generalized
  - amplitude: peak-to-peak in uV
  - duration: in ms
  - after_going_slow_wave: present | absent
  - phase_reversal: channel_pair
  - confidence: high | medium | low
  - clinical_significance: definite_ied | probable_ied | possible_ied | artifact
```

### 15.5 Keyboard Workflow for Spike Review

```
F1 (longitudinal bipolar) -> Home (10s window)
  -> Shift+Right (page forward)
  -> m (measurement mode) -> measure suspected spike
  -> a (annotation mode) -> mark confirmed spike
  -> F3 (avg reference) -> assess field
  -> F2 (transverse) -> check lateralization
  -> F4 (Laplacian) -> confirm focality
  -> Continue to next page
```

---

## 16. Workflow Pattern: Sleep Scoring

### 16.1 Purpose

Sleep scoring assigns a sleep stage to each epoch of a polysomnographic recording, typically for sleep disorder diagnosis or sleep research.

### 16.2 Standard Scoring Parameters

| Parameter | AASM Standard |
|-----------|--------------|
| Epoch duration | 30 seconds |
| Channels required | EEG (C4-A1 or C3-A2), EOG (E1, E2), EMG (chin) |
| Scoring stages | W, N1, N2, N3, R |
| Alternative epochs | 20 seconds (pediatric) |

### 16.3 Sleep Scoring Layout

```
+----------------------------------------------------------+
| EEG (C3-A2, C4-A1, O1-A2) - primary scoring channels     |
|                                                           |
+----------------------------------------------------------+
| EOG (E1, E2) - eye movement detection                     |
+----------------------------------------------------------+
| EMG (submentalis) - muscle tone assessment                |
+----------------------------------------------------------+
| [Optional: EKG, respiratory, limb movement channels]      |
+----------------------------------------------------------+
| Hypnogram (scored stages so far)                          |
+----------------------------------------------------------+
| Spectrogram (C3-A2 or C4-A1)                             |
+----------------------------------------------------------+
```

### 16.4 Sleep Scoring Procedure

**Step 1: Set up display**
1. Load polysomnographic recording
2. Set epoch duration to 30 seconds
3. Arrange channels: EEG (central, occipital), EOG, EMG
4. Set sensitivity: EEG 7 uV/mm, EOG 50 uV/cm, EMG 20 uV/mm
5. Enable hypnogram panel and spectrogram

**Step 2: Score epoch by epoch**
1. For each 30-second epoch:
   - Assess EEG dominant frequency
   - Look for sleep spindles (N2 marker)
   - Look for K-complexes (N2 marker)
   - Assess slow wave activity (N3: >20% delta)
   - Check EOG for eye movements (REM: rapid eye movements)
   - Check EMG for muscle atonia (REM: low tone)
2. Assign stage: W, N1, N2, N3, or R
3. Mark artifact epochs as " unscored" or "movement time"

**Step 3: Quality check**
1. Review hypnogram for continuity
2. Check for impossible transitions (e.g., N3 -> R without N1/N2)
3. Verify sleep onset latency calculation
4. Calculate sleep statistics (sleep efficiency, WASO, etc.)

### 16.5 Sleep Scoring Keyboard Shortcuts

| Key | Stage |
|-----|-------|
| `w` | Wake |
| `1` | N1 |
| `2` | N2 |
| `3` | N3 |
| `r` | REM |
| `x` | Artifact / Unscored |
| `0` | Movement time |
| Right arrow | Next epoch |
| Left arrow | Previous epoch |
| Up arrow | Jump to next unscored epoch |

### 16.6 Automated Assistance

Modern workbenches should integrate:
- **Spindle detection**: Semi-automatic marking of sleep spindles
- **K-complex detection**: Automatic identification of K-complexes
- **Slow wave detection**: Delta wave counting for N3 criteria
- **REM event detection**: Rapid eye movement identification
- **Pre-scoring**: Machine learning-assisted initial scoring (to be reviewed)

---

## 17. Workflow Pattern: Seizure Detection Review

### 17.1 Purpose

Review automated seizure detections and identify seizures that may have been missed by automated systems.

### 17.2 Automated Detection Review

**Step 1: Review high-confidence detections**
1. Sort detections by confidence (highest first)
2. For each detection:
   - Navigate to pre-ictal period (10-30 seconds before)
   - Review evolution: onset pattern, frequency change, spread
   - Check for clinical correlate (if video available)
   - Classify: electrographic only | electroclinical | false positive
3. Confirm or reject each detection

**Step 2: Review medium-confidence detections**
1. Same procedure as high-confidence
2. Pay extra attention to:
   - Subtle rhythmic evolving patterns
   - Seizures with gradual onset
   - Seizures in sleep
3. Use time-frequency view to assess rhythmic evolution

**Step 3: Review low-confidence / potential false negatives**
1. Check for seizures missed by detector:
   - Very brief seizures (<10 seconds)
   - Seizures with minimal EEG change
   - Seizures obscured by artifact
   - Status epilepticus with evolving pattern
2. Use butterfly view to spot subtle generalized changes

### 17.3 Seizure Classification

| Classification | EEG Pattern | Clinical Correlate |
|---------------|------------|-------------------|
| Electrographic only | Clear ictal pattern | No clinical signs |
| Electroclinical | Clear ictal pattern | Clinical seizure observed |
| Subclinical | Subtle ictal pattern | No obvious clinical signs |
| Possible seizure | Possible ictal pattern | Equivocal |
| False positive | No ictal pattern | Detector error |

### 17.4 Seizure Annotation Schema

```
Seizure Annotation:
  - onset_time: start in seconds
  - offset_time: end in seconds (if determinable)
  - duration: calculated
  - type: focal_onset_aware | focal_onset_impaired | generalized | unknown
  - onset_location: electrode(s) of first change
  - evolution: pattern of frequency/spatial change
  - classification: electrographic_only | electroclinical | subclinical
  - clinical_signs: [list of observed signs]
  - confidence: high | medium | low
  - reviewer: user_id
  - detection_source: automated | manual | both
```

---

## 18. Workflow Pattern: Sign-Off and Reporting

### 18.1 The Progressive Review Model

Clinical EEG review typically follows a two-tier model:

| Tier | Role | Actions | Authority |
|------|------|---------|-----------|
| **Level 1: Preliminary** | EEG Technologist / Trainee | First-pass scan, artifact marking, event flagging, quality assessment | Can create annotations, cannot finalize |
| **Level 2: Final** | Board-Certified Physician | Review preliminary findings, add annotations, generate report, sign off | Full authority, final signature |

### 18.2 Review State Machine

```
[Acquired] -> [Preliminary Review] -> [Physician Review] -> [Signed Off]
                                                  |
                                            [Amended] <- [Revision Requested]
```

### 18.3 Audit Trail Requirements

Every action in the workbench must be logged:

```
Audit Record:
  - timestamp: ISO 8601 timestamp
  - user_id: authenticated user
  - action: view | annotate | mark_quality | sign_off | amend | export
  - target: recording_id | annotation_id | epoch_id
  - details: JSON of action parameters
  - previous_state: (for amendments)
  - new_state: (for amendments)
```

### 18.4 Report Generation

The workbench must support:

1. **Template-based reports**: Pre-defined report templates for different study types
2. **Auto-population**: Demographics, study parameters, and detected events auto-filled
3. **Annotation inclusion**: Confirmed annotations embedded in report with waveform excerpts
4. **Measurement inclusion**: Cursor measurements auto-inserted
5. **Comparison summary**: For follow-up studies, prior findings referenced
6. **Export formats**: PDF, HTML, structured data (JSON/XML)

### 18.5 Amendment Workflow

When a signed report needs modification:

1. Original report marked as "amended"
2. Amendment reason documented
3. New report version created with changes highlighted
4. Original findings preserved for audit
5. New sign-off required on amended report
6. Both versions retained in permanent record

---

## 19. Workbench Architecture Recommendations

### 19.1 Core Architecture

```
+-----------------------------------------------------------+
|                     PRESENTATION LAYER                      |
|  +----------------+  +----------------+  +---------------+ |
|  | Trace Viewer   |  | Trend Panel    |  | Event List    | |
|  | (main canvas)  |  | (spectrogram)  |  | (annotations) | |
|  +----------------+  +----------------+  +---------------+ |
|  +----------------+  +----------------+  +---------------+ |
|  | Overview Bar   |  | Measurement    |  | Control Panel | |
|  | (timeline)     |  | Panel          |  | (filters, etc)| |
|  +----------------+  +----------------+  +---------------+ |
+-----------------------------------------------------------+
|                      APPLICATION LAYER                      |
|  +----------------+  +----------------+  +---------------+ |
|  | View Controller|  | Annotation     |  | Montage       | |
|  | (zoom, scroll) |  | Manager        |  | Engine        | |
|  +----------------+  +----------------+  +---------------+ |
|  +----------------+  +----------------+  +---------------+ |
|  | Measurement    |  | Event Manager  |  | Playback      | |
|  | Engine         |  |                |  | Controller    | |
|  +----------------+  +----------------+  +---------------+ |
+-----------------------------------------------------------+
|                       DATA LAYER                            |
|  +----------------+  +----------------+  +---------------+ |
|  | Raw Data Store |  | Annotation     |  | User/Auth     | |
|  | (read-only)    |  | Database       |  | Service       | |
|  +----------------+  +----------------+  +---------------+ |
|  +----------------+  +----------------+  +---------------+ |
|  | Montage Config |  | Audit Log      |  | Report Gen    | |
|  | Store          |  |                |  |               | |
|  +----------------+  +----------------+  +---------------+ |
+-----------------------------------------------------------+
```

### 19.2 Non-Negotiable Design Decisions

1. **Raw data is immutable**: All views, annotations, and marks are overlays
2. **Keyboard-first**: All actions have keyboard shortcuts; mouse is secondary
3. **Lazy loading**: Large recordings loaded on-demand as user pages through
4. **Progressive enhancement**: Basic view works immediately; advanced features load asynchronously
5. **State persistence**: All display settings saved per-user, per-study-type
6. **Offline capability**: Core review functions work without network connectivity
7. **Cross-platform**: Runs on Windows, macOS, and Linux

### 19.3 Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Initial load time | <3 seconds | For standard 1-hour, 32-channel recording |
| Page navigation | <100 ms | No perceptible delay when paging |
| Montage switch | <200 ms | Including channel reorganization |
| Annotation creation | <50 ms | From keypress to visual feedback |
| Time-frequency update | <500 ms | Spectrogram recalculation for visible window |
| Multi-record open | <5 seconds | For 24-hour combined view |

### 19.4 Recommended Technology Stack

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| UI Framework | Qt (PyQt/PySide) or Electron | Cross-platform, high performance |
| Plotting | PyQtGraph or WebGL | GPU-accelerated, handles large datasets |
| Signal Processing | MNE-Python backend | Battle-tested, comprehensive |
| File I/O | MNE-Python readers | 50+ format support |
| Storage | SQLite (local) + PostgreSQL (server) | Flexible deployment |
| Annotation Format | BIDS-compatible | Standardized, interoperable |
| Reporting | Jinja2 templates | Flexible, template-driven |

---

## 20. Appendix: Keyboard Shortcut Reference

### Global Shortcuts

| Key | Action |
|-----|--------|
| `?` | Show help |
| `Ctrl+O` | Open recording |
| `Ctrl+S` | Save annotations |
| `Ctrl+E` | Export report |
| `Ctrl+F` | Find / search |
| `Ctrl+Q` | Quit |

### Navigation

| Key | Action |
|-----|--------|
| `Up` / `Down` | Scroll channels |
| `Left` / `Right` | Scroll time (1/4 page) |
| `Shift+Left` / `Shift+Right` | Scroll time (full page) |
| `Page Up` / `Page Down` | Change visible channel count |
| `Home` / `End` | Change time window duration |
| `Ctrl+Home` | Go to recording start |
| `Ctrl+End` | Go to recording end |

### Display

| Key | Action |
|-----|--------|
| `+` / `-` | Scale up / down |
| `b` | Toggle butterfly mode |
| `d` | Toggle DC removal |
| `s` | Toggle scale bars |
| `z` | Toggle zen mode |
| `g` | Toggle grid |
| F11 | Full screen |

### Montage

| Key | Action |
|-----|--------|
| F1 | Longitudinal bipolar |
| F2 | Transverse bipolar |
| F3 | Average reference |
| F4 | Laplacian |
| F5 | Circumferential |
| F6 | EKG/Respiratory |
| F7-F9 | User-defined |

### Annotation

| Key | Action |
|-----|--------|
| `a` | Toggle annotation mode |
| `1` | Quick-mark: spike |
| `2` | Quick-mark: sharp wave |
| `3` | Quick-mark: seizure |
| `4` | Quick-mark: artifact |
| `5` | Quick-mark: good epoch |
| `6` | Quick-mark: bad epoch |
| `7` | Quick-mark: uncertain epoch |
| `Esc` | Cancel current operation |
| `Del` | Delete selected annotation |

### Measurement

| Key | Action |
|-----|--------|
| `m` | Toggle measurement mode |
| `c` | Place primary cursor |
| `v` | Place secondary cursor |
| `x` | Clear cursors |

### Playback

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `]` / `[` | Speed up / slow down |
| `.` / `,` | Step forward / back (1 sec) |
| `f` / `r` | Fast forward / rewind |

### Sleep Scoring

| Key | Stage |
|-----|-------|
| `w` | Wake |
| `1` | N1 |
| `2` | N2 |
| `3` | N3 |
| `r` | REM |
| `x` | Artifact |

---

## References and Sources

### Commercial Platforms
- Brain Products. BrainVision Analyzer 2 Documentation. https://www.brainproducts.com/solutions/analyzer/
- Compumedics Neuroscan. CURRY 9 Brochure. https://compumedicsneuroscan.com/
- Nihon Kohden. Neurofax EEG-1200 Product Documentation. https://eu.nihonkohden.com/products/neurology/neurofax
- Persyst Development Corporation. Persyst 15 Release Notes. https://www.persyst.com/persyst-release-notes-2/
- Natus/XLTEK. EEG Review - Resident Handbook. https://marylandneurology.squarespace.com/natus-eeg-review

### Open-Source Platforms
- Gramfort A, et al. MNE-Python. https://mne.tools/stable/
- Delorme A, Makeig S. EEGLAB. https://eeglab.org/
- Combrisson E, et al. Visbrain. https://visbrain.org/
- wonambi-python. https://wonambi-python.github.io/

### Standards and Guidelines
- American Academy of Sleep Medicine (AASM). Manual for the Scoring of Sleep and Associated Events.
- American Clinical Neurophysiology Society (ACNS). EEG Guidelines.
- National Association of Epilepsy Centers (NAEC). Guidelines for Epilepsy Monitoring Units.

### Research Sources
- Reus EEM. Automated spike and seizure detection: Can we use it? Doctoral thesis, Leiden University, 2024.
- Saab ME, et al. Scaling clinical EEG data for seizure onset detection. Nature Partner Journals, 2023.
- Halford JJ, et al. Clinical utility of EEG trending. Journal of Clinical Neurophysiology, 2020.

---

*This guide represents a synthesis of best practices from clinical and research EEG platforms. Implementation should be adapted to specific clinical contexts, regulatory requirements, and user needs. All recommendations are based on published documentation and peer-reviewed research as of the date of compilation.*

---

**Document Statistics:**
- Total sections: 20
- Commercial platforms analyzed: 5
- Open-source platforms analyzed: 4
- Workflow patterns documented: 5
- Keyboard shortcuts defined: 80+
- Annotation types defined: 30+
- Lines: 800+
