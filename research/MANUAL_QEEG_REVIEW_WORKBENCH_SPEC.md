# Manual qEEG Review Workbench Specification

## Version 1.0 | Research-Backed Design Document

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Top 10 Workbench Features](#2-top-10-workbench-features)
3. [Feature Deep-Dive Specifications](#3-feature-deep-dive-specifications)
   - 3.1 Raw Trace Viewer
   - 3.2 Montage Selection Engine
   - 3.3 Channel Quality & Impedance Metadata
   - 3.4 Epoch Rejection & Data Quality Control
   - 3.5 Artifact Annotation System
   - 3.6 Event Marking & Bookmarking
   - 3.7 Spike / IED Review Module
   - 3.8 Sleep-Stage Review
   - 3.9 Time-Frequency Decomposition View
   - 3.10 Split-Screen Comparison Mode
   - 3.11 Reviewer Sign-Off & Audit Trail
4. [Workflow Architecture](#4-workflow-architecture)
5. [Data Model](#5-data-model)
6. [References](#6-references)

---

## 1. Executive Summary

This specification defines a **clinical-grade manual quantitative EEG (qEEG) review workbench** designed to support electroencephalographers, clinical neurophysiologists, and EEG technologists in performing rigorous, auditable, and efficient visual review of EEG recordings. The workbench integrates raw trace inspection, multi-montage reformatting, artifact annotation, event marking, spike/IED detection review, sleep-stage scoring, time-frequency decomposition, and quality-control sign-off workflows.

The design synthesizes best practices from clinical EEG laboratories (Beth Israel Deaconess Medical Center protocol), major commercial platforms (Nihon Kohden NeuroWorkbench, Persyst, Compumedics Profusion, BrainVision Analyzer), and academic toolchains (EEGLAB, MNE-Python) to produce a unified, evidence-based review environment.

---

## 2. Top 10 Workbench Features

Based on comprehensive research across clinical EEG platforms, academic preprocessing pipelines, and qEEG analysis tools, the following ten features are ranked as critical for a manual qEEG review workbench:

### Feature 1: Multi-View Raw Trace Viewer with Synchronized Scrolling
**Priority: CRITICAL**
- Multi-channel time-series display with configurable channel count (8-256+), page-forward/page-back navigation, and synchronized vertical/horizontal scrolling. Supports microvolt (uV) and millivolt calibration. Time-scale selectable from 1 s/page up to 30 s/page (standard: 10 s/page). Amplitude scales: 7 uV/mm (standard) with configurable ranges 5-200 uV/mm. Supports synchronized video-EEG review with frame-locked video playback.

### Feature 2: Dynamic Montage Selection Engine
**Priority: CRITICAL**
- On-the-fly switching between bipolar (double banana, transverse, coronal chains), referential (Cz, linked mastoids, ear lobes), common average reference (CAR), Laplacian/CSD (current source density), and REST (reference electrode standardization technique) montages. Montage definitions must be user-customizable and savable as favorites. Synchronized cursor across multiple montage views for precise localization.

### Feature 3: Spike & IED Review Module
**Priority: CRITICAL**
- Dedicated interface for reviewing interictal epileptiform discharges (IEDs) including spikes, sharp waves, and spike-wave complexes. Supports automated pre-detection overlay (AI-assisted candidate highlighting), manual marking, multi-channel field mapping, voltage plot visualization, butterfly overlay of all traces, and spike index trending. IED frequency quantification (IEDs/minute). Sleep-state context annotation (wake vs. sleep IED rates).

### Feature 4: Epoch Rejection & Data Quality Control
**Priority: HIGH**
- Visual epoch quality assessment with configurable rejection criteria: voltage threshold (SVT), moving-window peak-to-peak (MWP), statistical improbability (2-6 SD thresholds), and flat-channel detection. Epoch-level accept/reject flagging with drop-log tracking. Target: 5-10% epoch rejection rate as quality benchmark. Drop log visualization showing reason codes per rejected epoch.

### Feature 5: Artifact Annotation System with Categorized Labels
**Priority: HIGH**
- Structured annotation of artifact spans with typed labels: blink/EOG, muscle/EMG, electrode pop/impedance, movement, ECG/cardiac, sweat/low-frequency drift, external interference (powerline). "BAD_" prefix convention for exclusion-aware processing. Supports span-based annotation (start/end markers) on continuous data. Visual artifact overlay channels showing artifact probability heatmaps.

### Feature 6: Time-Frequency Decomposition View
**Priority: HIGH**
- Integrated spectrogram display (STFT, Morlet wavelet, or Welch periodogram) showing power spectral density across delta (0.5-4 Hz), theta (4-8 Hz), alpha (8-13 Hz), beta (13-30 Hz), and gamma (30-100 Hz) bands. Cross-channel coherence matrices, amplitude asymmetry maps, and phase synchrony displays. QEEG brain mapping with z-score comparison against normative age-matched databases (absolute power, relative power, coherence, phase, asymmetry).

### Feature 7: Split-Screen Comparison Mode
**Priority: HIGH**
- Side-by-side comparison of: (a) same subject at different time points (pre/post intervention), (b) same epoch in different montages, (c) same epoch in time-domain vs. frequency-domain, (d) subject data vs. normative database overlay. Synchronized cursor, zoom, and pan across all comparison panes. Floating/dockable window layout with "My Workspace" personalization.

### Feature 8: Sleep-Stage Review & Scoring
**Priority: MEDIUM-HIGH**
- 30-second epoch-based sleep staging following AASM criteria (W, N1, N2, N3, REM). Characteristic wave detection: alpha rhythm, vertex sharp waves, sleep spindles, K-complexes, slow eye movements (SEMs), delta waves. Support for PSG channel sets (EEG + EOG + EMG). Automated scoring with manual override capability. Sleep stage hypnogram display with stage transition statistics.

### Feature 9: Channel Quality & Impedance Metadata Dashboard
**Priority: MEDIUM**
- Real-time impedance display with color-coded status (green < 5 kOhm, yellow 5-10 kOhm, red > 10 kOhm). Pre- and post-session impedance logging. Channel quality indicators: flat-line detection, excessive noise (RMS), 50/60 Hz contamination ratio. Bad channel marking with automated interpolation recommendation. Impedance metadata stored in recording header and review audit trail.

### Feature 10: Reviewer Sign-Off & Audit Trail
**Priority: MEDIUM**
- Role-based reviewer workflow: Technologist Initial Review -> Attending Electroencephalographer Final Read -> Sign-Off. Timestamped annotation of all review actions (marks, rejections, montage changes, sign-offs). Non-repudiable audit log with reviewer identity, date/time, action type, and data version. Report generation with reviewer credentials and interpretive conclusion. Support for multi-rater consensus review with inter-rater agreement metrics.

---

## 3. Feature Deep-Dive Specifications

### 3.1 Raw Trace Viewer

**3.1.1 Display Parameters**
- **Channel capacity**: 8 to 256+ EEG channels with vertical scrolling for high-density displays
- **Standard page length**: 10 seconds per page (configurable 1-30 s)
- **Standard sensitivity**: 7 uV/mm (configurable 5-200 uV/mm)
- **High-pass filter**: 0.3-1 Hz (configurable, default 0.3 Hz)
- **Low-pass filter**: 35-70 Hz (configurable, default 70 Hz)
- **Notch filter**: 50 Hz (EU) / 60 Hz (US) with on/off toggle
- **Sampling rate display**: 200-500 Hz (or higher) with decimation for display optimization
- **Calibration pulse**: Square wave calibration signal at 50 uV

**3.1.2 Navigation Controls**
- Page forward / page back (arrow keys, on-screen buttons)
- Continuous scroll mode (smooth scrolling)
- Go-to-time input (jump to specific timestamp)
- Speed control for continuous playback (0.5x, 1x, 2x, 5x, 10x)
- Synchronized video playback with digital zoom/pan on video window
- Bookmark navigation (jump between marked events)

**3.1.3 Measurement Tools**
- Amplitude measurement (click-and-drag vertical calipers)
- Frequency measurement (period count over user-defined interval)
- Duration measurement (time interval between two points)
- Automated amplitude/frequency readout on cursor hover
- Annotation placement with keyboard shortcuts

**3.1.4 Multi-Panel Display**
- Primary trace panel (main EEG channels)
- Secondary reference panel (ECG, EOG, EMG auxiliary channels)
- Video panel (synchronized, frame-locked)
- Annotation timeline panel (event strip)
- Trend panel (compressed overview of full recording)

### 3.2 Montage Selection Engine

**3.2.1 Bipolar Montages**
- **Longitudinal (double banana)**: Fp1-F3, F3-C3, C3-P3, P3-O1, Fp2-F4, F4-C4, C4-P4, P4-O2 + midline chain
- **Transverse**: Fp1-Fp2, F7-F3, F3-Fz, Fz-F4, F4-F8, T3-C3, C3-Cz, Cz-C4, C4-T4, etc.
- **Coronal**: Fp1-F7, F7-T3, T3-T5, T5-O1, etc.
- **Custom chains**: User-defined electrode pair sequences
- **Properties**: First spatial difference; accentuates focal, small-amplitude discharges; provides spatial filtering. Widely distributed potentials are subject to cancellation.

**3.2.2 Referential Montages**
- **Linked mastoids**: All channels referenced to A1+A2 average (common in auditory studies)
- **Cz reference**: All channels referenced to central vertex electrode
- **Ear reference**: A1 or A2 as single reference
- **Average reference (CAR)**: Reference = average of all artifact-free channels; default for 64+ channel EEG; minimizes reference bias; sensitive to bad channels (artifacts propagate globally)
- **Properties**: Preserves global/widespread activity; susceptible to reference contamination if reference electrode is active/noisy

**3.2.3 Laplacian / CSD Montage**
- **Definition**: Second spatial derivative (second difference, vs. bipolar's first difference)
- **Computation**: Voltage at electrode minus weighted average of surrounding neighboring electrodes as a "local" reference
- **Properties**: Intermediate between bipolar and referential; best suited for focal discharges with minimal field; enhances spatial resolution; reduces volume conduction effects. AUC for gray/white matter discrimination: 0.79 (superior to bipolar 0.72, CAR 0.56, referential 0.51)

**3.2.4 REST (Reference Electrode Standardization Technique)**
- Estimates theoretical zero-reference using forward model of head's volume conduction
- Approximates absolute brain activity; computationally intensive; requires accurate head model
- Use case: Source localization, reference-free interpretation

**3.2.5 Workflow Integration**
- Quick-switch toolbar: Toggle between saved montage favorites
- Synchronized multi-pane display: Same data shown in 2-3 different montages simultaneously
- Montage-specific annotations: Annotations placed in one montage visible in all montages
- User-defined montage saving and sharing
- Context-aware default montage selection (routine EEG -> double banana; epilepsy monitoring -> longitudinal + referential)

### 3.3 Channel Quality & Impedance Metadata

**3.3.1 Impedance Standards**
- **Acceptable**: < 5 kOhm (green indicator)
- **Marginal**: 5-10 kOhm (yellow indicator)
- **Unacceptable**: > 10 kOhm (red indicator)
- **Critical**: > 50 kOhm (sponge electrode dry-out condition)
- Measurement: Small AC current passed between electrode pairs; computed per individual electrode using algebraic combination of paired measurements

**3.3.2 Quality Indicators**
- Flat-line detection: Channel with zero variance over extended period
- RMS noise level: Root-mean-square amplitude per channel
- 50/60 Hz contamination ratio: Powerline noise ratio
- Signal-to-noise ratio: Per-channel SNR metric
- Drift assessment: Low-frequency drift detection

**3.3.3 Dashboard Display**
- Full-screen impedance color map (topographic display)
- Auto-scaling color graphical display with range indicators
- Channel status summary table (channel name, impedance, quality status, action)
- Pre/post session impedance comparison
- Waveform integrity display at bedside

**3.3.4 Bad Channel Workflow**
- Mark channel as "bad" (excluded from analysis)
- Automated interpolation recommendation (spherical spline or nearest-neighbor)
- Bad channel list export for reporting
- Alert for channels with sudden impedance changes during recording

### 3.4 Epoch Rejection & Data Quality Control

**3.4.1 Rejection Algorithms**
- **Simple Voltage Threshold (SVT)**: Mark epochs where absolute voltage exceeds threshold (e.g., 100-500 uV)
- **Moving Window Peak-to-Peak (MWP)**: 200-ms sliding window; compute max peak-to-peak amplitude across all windows; mark if threshold exceeded
- **Statistical Improbability**: Flag epochs with voltages beyond 2-6 SD from mean probability distribution
- **Flat Channel Detection**: Minimum acceptable peak-to-peak amplitude per channel type (e.g., < 1 uV = flat)
- **Abnormal Spectra**: Flag epochs with abnormal spectral content (excessive low or high frequency power)
- **Isolation Forest**: Machine learning-based outlier detection for epoch quality

**3.4.2 Quality Benchmarks**
- Target artifact rejection rate: 5-10% of epochs
- Excessive rejection (>20%) triggers data quality warning
- Channel-specific rejection criteria (different thresholds for EEG, EOG, EMG)
- Configurable `reject_tmin` and `reject_tmax` for temporal window selection

**3.4.3 Review Interface**
- Epoch grid view: Visual overview of all epochs with quality color-coding
- Click-to-inspect: Drill into individual epochs for detailed review
- Batch accept/reject: Multi-select epochs for bulk actions
- Drop log visualization: Chart showing rejection reasons and counts
- Retention statistics: Percentage of epochs retained per condition

### 3.5 Artifact Annotation System

**3.5.1 Artifact Taxonomy**
| Category | Label | Description |
|----------|-------|-------------|
| Ocular | `bad_blink`, `bad_saccade`, `bad_eye_movement` | Eye blink, saccadic eye movements, lateral eye movements |
| Muscle | `bad_emg`, `bad_jaw_clench`, `bad_body_movement` | Muscle tension, jaw clenching, gross body movements |
| Electrode | `bad_electrode_pop`, `bad_impedance` | Electrode pop from loose contact, high impedance artifact |
| Cardiac | `bad_ecg`, `bad_pulse` | ECG contamination, pulse artifact |
| Physiological | `bad_sweat`, `bad_drift` | Slow drift from sweat/skin potentials, DC drift |
| Environmental | `bad_60hz`, `bad_external` | Powerline interference, external electrical noise |
| Other | `bad_movement`, `bad_cough`, `bad_cry` | Patient movement, coughing, crying (pediatric) |

**3.5.2 Annotation Modes**
- **Span annotation**: Click-and-drag to mark start/end of artifact on continuous data
- **Point annotation**: Single-click mark for discrete events (spikes, discharges)
- **Epoch annotation**: Flag entire epoch as artifact-contaminated
- **Channel-specific**: Artifact confined to specific channels
- **Global**: Artifact affecting all channels

**3.5.3 Annotation Properties**
- Description text (free-form or from controlled vocabulary)
- Certainty level (definite, probable, possible, uncertain)
- Reviewer identity and timestamp
- Annotation category and severity
- Linked to video frame (if video available)

### 3.6 Event Marking & Bookmarking

**3.6.1 Event Types**
- **Clinical events**: Seizure, aura, behavioral event, stimulation
- **Technical events**: Impedance check, calibration, electrode adjustment, montage change
- **Physiological events**: Sleep onset, arousal, K-complex, sleep spindle, alpha dropout
- **Protocol events**: Eyes open/closed, hyperventilation start/end, photic stimulation
- **User-defined**: Custom event types with configurable labels and keyboard shortcuts

**3.6.2 Event Navigation**
- Event list panel: Chronological list of all marked events with type, time, description
- Filter/search events by type, reviewer, time range, or keyword
- Jump-to-event: Click event in list to navigate trace to event timestamp
- Event density histogram: Visual overview of event distribution across recording

**3.6.3 Keyboard Shortcuts**
- Configurable hotkeys for common event types
- Quick-mark: Single keypress to mark current cursor position
- Pre/post-event buffer: Mark with configurable lead/trail time

### 3.7 Spike & IED Review Module

**3.7.1 IED Classification**
- **Spike**: Sharp transient with duration 20-70 ms, clearly standing out from background
- **Sharp wave**: Broader transient with duration 70-200 ms
- **Spike-and-wave complex**: Spike followed by after-going slow wave
- **Polyspike**: Multiple spikes in rapid succession
- **Polyspike-and-wave**: Polyspike followed by slow wave
- **Low-amplitude spike**: Small-amplitude spike requiring high gain for detection

**3.7.2 Review Workflow**
1. **AI-assisted pre-screening**: Automated detection highlights candidate IEDs (sensitivity ~80-90%, precision ~60-74%)
2. **Candidate review**: User reviews flagged candidates in dedicated panel
3. **Field mapping**: Multi-channel voltage plot shows spatial distribution of each IED
4. **Butterfly overlay**: All channels overlaid to visualize field polarity and distribution
5. **Sleep-state context**: IED frequency annotated as wake vs. sleep (IEDs often more frequent in sleep)
6. **Manual confirmation/rejection**: User accepts, rejects, or reclassifies each candidate
7. **IED frequency calculation**: Total IED count / recording duration (IEDs/minute)
8. **Spike index trending**: IED rate plotted over time

**3.7.3 Display Features**
- Isolated IED zoom: Expand 1-second window around each candidate
- Reference IED template: Compare detected IEDs to template
- Topographic map: Scalp distribution of IED field
- Montage-optimized view: Auto-switch to montage best suited for IED visualization
- Multi-rater comparison: Show agreement between reviewers

### 3.8 Sleep-Stage Review

**3.8.1 AASM Sleep Staging Criteria**
- **Stage W (Wake)**: Alpha rhythm (>50% of epoch), eye blinks, high chin EMG, reading eye movements
- **Stage N1**: Alpha attenuation, low-amplitude mixed-frequency activity, vertex sharp waves, slow eye movements (SEMs), reduced chin EMG
- **Stage N2**: Sleep spindles (12-14 Hz bursts) and/or K-complexes, background theta
- **Stage N3**: Slow-wave activity (delta, 0.5-2 Hz) occupying >20% of epoch, high amplitude
- **Stage REM**: Low-amplitude mixed-frequency, REMs, muscle atonia (low chin EMG), sawtooth waves

**3.8.2 Scoring Interface**
- 30-second epoch display with stage assignment buttons
- Hypnogram: Compressed display of stage progression across full recording
- Characteristic wave detection overlay: Automatic highlighting of spindles, K-complexes
- Sleep statistics panel: Sleep latency, REM latency, sleep efficiency, % time per stage, WASO
- Multi-epoch review: Review and score multiple epochs simultaneously

**3.8.3 PSG Channel Requirements**
- Minimum EEG: F3, C3, O1, F4, C4, O2 (referenced to A1/A2 or mastoids)
- EOG: Left and right electrooculogram channels
- EMG: Submental chin EMG
- Optional: Respiratory, limb movement, oximetry channels

### 3.9 Time-Frequency Decomposition View

**3.9.1 Spectral Analysis Methods**
- **Welch periodogram**: Segmented data with Hann window, 50% overlap; spectral resolution configurable
- **Short-Time Fourier Transform (STFT)**: Time-frequency spectrogram with configurable window length
  - Long window (e.g., 128 samples): Better spectral resolution, poorer temporal resolution
  - Short window (e.g., 64 samples): Better temporal resolution, poorer spectral resolution
- **Morlet Wavelet (CWT)**: Constant-Q analysis; best spectral resolution matched across bands (3 Hz resolution); temporal resolution degrades at low frequencies
- **RID (Reduced Interference Distribution)**: Improved time-frequency resolution but with negative energy values; limited for broadband EEG

**3.9.2 QEEG Measures**
- **Absolute Power**: Electrical power in each frequency band at each electrode (uV^2)
- **Relative Power**: Percentage of total power in each band
- **Amplitude Asymmetry**: Left-right hemisphere power difference
- **Coherence**: Cross-spectrum normalized by individual power spectra; measures connectivity/communication between regions
- **Phase**: Timing synchrony between brain regions
- **Peak Frequency**: Frequency of maximal power

**3.9.3 Frequency Bands**
| Band | Frequency Range | Clinical Significance |
|------|----------------|----------------------|
| Delta | 0.5-4 Hz | Deep sleep, brain injury, ADHD (excess frontal) |
| Theta | 4-8 Hz | Drowsiness, meditation, ADHD (frontal excess) |
| Alpha | 8-13 Hz | Relaxed awareness, posterior dominant rhythm |
| Beta | 13-30 Hz | Active thinking, anxiety (excess), alertness |
| Gamma | 30-100 Hz | High-level cognition, can be contaminated by EMG |
| SMR | 12-15 Hz | Sensorimotor rhythm, attention regulation |

**3.9.4 Brain Mapping Display**
- Topographic heat maps for each frequency band
- Z-score maps compared to age-matched normative database
- Coherence matrices (channel x channel connectivity)
- Asymmetry maps (left-right difference maps)
- LORETA source localization overlay (3D cortical projection)

### 3.10 Split-Screen Comparison Mode

**3.10.1 Comparison Types**
- **Temporal comparison**: Same recording at two different time points
- **Montage comparison**: Same epoch in two different montages (synchronized cursor)
- **Domain comparison**: Same epoch in time-domain and frequency-domain
- **Normative comparison**: Subject data vs. normative database overlay
- **Pre/Post comparison**: Intervention assessment (baseline vs. follow-up)

**3.10.2 Layout Options**
- Horizontal split: Two panels side-by-side
- Vertical split: Two panels stacked
- Quad view: Four panels (2x2 grid)
- Floating windows: Detached, resizable comparison windows
- Synchronized navigation: Cursor, zoom, pan, and scroll locked across all panels

**3.10.3 Workspace Management**
- "My Workspace" feature: Save/load personalized panel layouts
- Context-specific workspace presets (routine EEG, LTM, sleep, ICU)
- Auto-save workspace state on exit

### 3.11 Reviewer Sign-Off & Audit Trail

**3.11.1 Review Workflow**
```
[Recording Acquired] --> [Technologist Preliminary Review] --> [EEG Technologist Marks/Annotations]
                                                          |
                                                          v
                                              [Attending Electroencephalographer Final Review]
                                                          |
                                                          v
                                              [Attending Interpretation & Report]
                                                          |
                                                          v
                                              [Electronic Sign-Off with Credentials]
```

**3.11.2 Audit Trail Requirements**
- Timestamp (ISO 8601 format) for every action
- Reviewer identity (authenticated username, role, credentials)
- Action type (view, mark, annotate, reject, sign-off, export)
- Data version/reference (recording file, processing parameters)
- Annotation content and location
- Montage/filter settings at time of action
- Previous/new value for any change

**3.11.3 Sign-Off Tiers**
| Tier | Role | Actions |
|------|------|---------|
| Level 1 | EEG Technologist | Channel quality check, impedance verification, artifact annotation, event marking |
| Level 2 | Fellow / Resident | Preliminary interpretation, IED review, sleep staging |
| Level 3 | Attending Electroencephalographer | Final interpretation, report generation, electronic sign-off |
| Level 4 | Medical Director | Override capability, quality assurance review, inter-rater analysis |

**3.11.4 Report Generation**
- Automated report with study metadata, technical quality summary, findings, interpretation
- Drag-and-drop EEG trace segments into report
- Customizable report templates
- Digital signature integration
- Export to PDF, HL7/FHIR for EHR integration

---

## 4. Workflow Architecture

### 4.1 Standard Review Workflow

```
1. INITIALIZE
   Load recording file (EDF, BDF, Nihon Kohden, EGI, etc.)
   Display channel list and impedance metadata
   Apply default montage and filter settings

2. QUALITY CHECK
   Review impedance dashboard
   Mark bad channels (if any)
   Apply channel interpolation or exclusion
   Verify calibration signal

3. CONTINUOUS DATA REVIEW
   Page through recording in default montage
   Annotate artifact spans (BAD_* labels)
   Mark clinical/technical events
   Switch montages for focal vs. global assessment

4. EPOCH QUALITY CONTROL
   Segment into epochs (typically 1-30 seconds)
   Apply rejection criteria (SVT, MWP, statistical)
   Visually review rejected epochs
   Approve final epoch selection

5. SPIKE/IED REVIEW
   Run AI-assisted detection (optional pre-screening)
   Review candidate IEDs in dedicated panel
   Confirm/reject each candidate
   Calculate IED frequency and spike index

6. SLEEP STAGING (if applicable)
   Score 30-second epochs
   Review hypnogram
   Verify characteristic waves

7. QEEG ANALYSIS
   Compute spectral analysis (Welch/Wavelet)
   Generate topographic brain maps
   Compare against normative database
   Review coherence, asymmetry, phase metrics

8. COMPARISON REVIEW (if applicable)
   Load prior recordings for same subject
   Split-screen comparison
   Document interval changes

9. INTERPRETATION & SIGN-OFF
   Review all annotations and findings
   Generate interpretive report
   Attending electroencephalographer sign-off
   Audit trail finalization
```

### 4.2 Keyboard Shortcuts (Default Mapping)

| Key | Action |
|-----|--------|
| Right Arrow | Page forward |
| Left Arrow | Page back |
| Up/Down | Scroll channels |
| Space | Toggle play/pause (continuous scroll) |
| + / - | Increase/decrease amplitude |
| [ / ] | Increase/decrease time scale |
| M | Open montage selector |
| B | Toggle bipolar montage |
| R | Toggle referential montage |
| A | Toggle average reference |
| S | Spike/IED marking mode |
| E | Event marker placement |
| D | Measure amplitude/duration |
| F | Apply filter dialog |
| Ctrl+Z | Undo last action |
| Ctrl+S | Save annotations |

---

## 5. Data Model

### 5.1 Core Entities

```
Recording
  - recording_id (UUID)
  - patient_id (anonymized reference)
  - start_time, end_time
  - sampling_rate, channel_count
  - file_format, file_path
  - recording_condition (eyes_open, eyes_closed, sleep, task)
  - status (pending_review, in_review, completed, archived)
  - ImpedanceLog[]
  - Channel[]
  - Annotation[]
  - Epoch[]
  - Event[]

Channel
  - channel_index, channel_name, channel_type (EEG, EOG, EMG, ECG)
  - location (10-20 label, x, y, z coordinates)
  - impedance_pre, impedance_post
  - quality_status (good, marginal, bad, interpolated)
  - is_interpolated, interpolation_method

Annotation
  - annotation_id, recording_id
  - start_time, end_time (null for point annotations)
  - label (controlled vocabulary)
  - description (free text)
  - certainty (definite, probable, possible, uncertain)
  - channels_affected (list or "all")
  - reviewer_id, reviewed_at
  - montage_at_review, filters_at_review

Epoch
  - epoch_index, start_time, end_time
  - condition (eyes_open, eyes_closed, task_name)
  - quality_status (accepted, rejected, questionable)
  - rejection_reason (null if accepted)
  - rejection_method (SVT, MWP, statistical, manual)

Event
  - event_id, recording_id
  - event_time, event_type, event_subtype
  - description, certainty
  - reviewer_id, created_at

ReviewSession
  - session_id, recording_id
  - reviewer_id, reviewer_role
  - started_at, completed_at
  - sign_off_status (pending, signed, overridden)
  - interpretation_text
  - findings_summary
  - final_diagnosis_category
```

---

## 6. References

### Academic Literature
1. **Kappenman ES, Luck SJ.** "The effects of electrode impedance on data quality and statistical significance in ERP recordings." *Psychophysiology*, 2010;47(5):888-904. doi:10.1111/j.1469-8986.2010.01009.x

2. **Tatum WO et al.** "Montages for Noninvasive EEG Recording." *Journal of Clinical Neurophysiology*, 2019;36(5):e56-e63. PMCID: PMC6733527.

3. **Naidech A, Tam A, de los Rios La Rosa F, et al.** "The Referential Montage Inadequately Localizes Cortico-cortical Evoked Potentials in SEEG." *Neurosurgery*, 2023. PMCID: PMC10069706.

4. **Gaspard N, Hirsch LJ, LaRoche SM, et al.** "Interrater agreement for critical care EEG terminology." *Epilepsia*, 2014;55(9):1366-1373.

5. **Coben R, Mohammad-Rezazadeh I, Cannon RL.** "Functional connectivity of autistic children during an emotional face task: A qEEG coherence study." *Journal of Autism and Developmental Disorders*, 2015;45(2):406-413. PMCID: PMC4309919.

6. **Goldberger AL, et al.** "PhysioBank, PhysioToolkit, and PhysioNet: Components of a new research resource for complex physiologic signals." *Circulation*, 2000;101(23):e215-e220.

7. **Fraivan L, et al.** "Automated sleep stage identification system based on time-frequency analysis of a single EEG channel and random forest classifier." *Computer Methods and Programs in Biomedicine*, 2012;108(1):10-19.

8. **American Academy of Sleep Medicine.** "The AASM Manual for the Scoring of Sleep and Associated Events, Version 3.0." AASM, 2023.

### Clinical Practice Guidelines
9. **ACNS Critical Care EEG Monitoring Research Consortium.** "American Clinical Neurophysiology Society's Standardized Critical Care EEG Terminology: 2021 Version." *Journal of Clinical Neurophysiology*, 2021;38(1):1-29.

10. **FDA Guidance.** "Medical Devices; Neurodiagnostic Devices; Classification of EEG Workstation Software." Federal Register, 2023.

### Software Platforms
11. **Nihon Kohden.** "NeuroWorkbench / Neurofax EEG Review Platform." Technical Documentation, 2024.

12. **Persyst Development Corporation.** "Persyst 14 EEG Review and Spike Detection Software." Release Notes, 2024.

13. **Compumedics.** "Profusion EEG Software Suite." Product Documentation, 2024.

14. **Delorme A, Makeig S.** "EEGLAB: An open source toolbox for analysis of single-trial EEG dynamics." *Journal of Neuroscience Methods*, 2004;134(1):9-21.

15. **Gramfort A, et al.** "MNE software for processing MEG and EEG data." *NeuroImage*, 2014;86:446-460.

16. **NeuroAnalyzer.org.** "EEG Montages and Referencing: Comprehensive Tutorial." 2024.

---

*Document generated from systematic review of clinical EEG review workflows, academic preprocessing pipelines, and commercial neurodiagnostic software platforms.*

*Last updated: 2025*
