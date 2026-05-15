# QEEG / Clinical EEG Analyzer UX Benchmark

## A Comprehensive Analysis of 9 Major EEG Software Platforms

**Date:** 2025-07-02
**Scope:** Trace viewers, topographic displays, report layouts, safety features, workflow patterns
**Systems Analyzed:** BrainVision Analyzer 2, NeuroGuide, BrainDx, EEGLAB, MNE-Python, FieldTrip, Brainstorm, Nihon Kohden Neurofax, Natus NeuroWorks

---

## Executive Summary

The EEG software landscape splits into two distinct UX paradigms: **clinical commercial systems** (Natus, Nihon Kohden, Persyst) optimized for rapid trace review and diagnostic reporting, and **research open-source platforms** (EEGLAB, MNE, Brainstorm, FieldTrip) designed for experimental flexibility and reproducibility. qEEG-specific tools (NeuroGuide, BrainDx) occupy a middle ground with normative database comparisons and automated report generation. This benchmark extracts actionable design patterns from each domain to inform next-generation qEEG interface design.

---

## 1. BrainVision Analyzer 2 (Brain Products)

### Overview
BrainVision Analyzer 2 is a commercial research-grade EEG analysis platform built on .NET technology. It is widely used in cognitive neuroscience research and education, known for its visual workflow approach.

### Key UI Patterns
| Pattern | Implementation |
|---------|---------------|
| **History Tree** | Editable tree structure showing full data provenance; each processing step is a node with stored parameters |
| **Drag-and-Drop Processing** | Templates can be created from history trees and applied to multiple datasets automatically |
| **Multi-View System** | Grid view (channel x time), 2D/3D topographic head view, mapping view with connectivity overlays |
| **MATLAB Bridge** | Bidirectional COM connection allowing seamless transfer of data between Analyzer and MATLAB |
| **Color Map Evolution** | Perceptually uniform, colorblind-friendly color maps (Paruly, Plasma) replacing legacy Jet-style scales |

### Trace Viewer Design
- Horizontal scrolling trace display with configurable channel grouping
- On-demand calculation: processing steps are stored and can be reprocessed without recomputation
- Fast data overlays for comparing conditions or subjects
- Supports 25+ EEG data formats automatically
- View Settings panel provides centralized control with preview of selected color maps

### Topomap Display
- 2D circular scalp interpolations with multiple color maps
- 3D head views with four head models (Adam, Anna, Liza, Baby) at 4x mesh density
- Real-time connectivity graph overlays for coherence/PLV in time-frequency domain
- Maretierra and Brainbow color maps for improved perceptual uniformity

### Report Layout
- Export to multiple formats (ASCII, EDF, EDF+, BESA Statistics)
- Operation Infos: detailed text reports of analysis parameters for each history node
- Screenshots with customizable view settings
- Generic Data Export with sample-by-sample precision

### Safety Features
- Full provenance tracking via History Tree (every parameter stored)
- History templates for reproducible batch processing
- Standard GUI validations for parameter integrity
- Stricter validation in newer versions to guarantee output validity

### Strengths
- Excellent for teaching: no programming knowledge required
- Visual workflow makes analysis steps transparent and self-documenting
- Fast automated analysis via drag-and-drop templates
- Strong backwards compatibility across versions
- Free scientific support from Brain Products

### Weaknesses
- Windows-only (.NET dependency)
- One-time purchase with limited extensibility compared to open-source
- Less suitable for high-density (256+) channel clinical review
- No real-time streaming or neurofeedback capabilities

---

## 2. NeuroGuide (Applied Neuroscience, Inc.)

### Overview
NeuroGuide is the premier qEEG analysis and neurofeedback platform, built around the Thatcher Lifespan Normative EEG Database (LSNDB). It provides comprehensive QEEG analysis, z-score training, and LORETA neurofeedback.

### Key UI Patterns
| Pattern | Implementation |
|---------|---------------|
| **Symptom-to-EEG Linkage** | Symptom checklist prior to recording guides hypothesis formation |
| **Multi-Montage System** | Longitudinal Bipolar (LB), Transverse Bipolar (TB), Circular Bipolar (CircBP), Common Reference, Laplacian |
| **Normative Comparison Pipeline** | Automated artifact-free selection > FFT > Z-score computation against age-matched norms |
| **Dual-Mode Interface** | Conventional EEG time-domain viewer + qEEG frequency-domain analysis in one platform |
| **Report Wizard** | Structured 10-step qEEG tutorial workflow from import to final report |

### Trace Viewer Design
- Conventional EEG with amplitude-time display and event markers
- Supports 45+ EEG amplifier import formats
- Auto artifact rejection without phase distortion
- Digital filtering with real-time preview
- Linked-ears, average reference, Laplacian, and bipolar montages
- Display settings: configurable time window (3s, 6s, 10s per page) and voltage scale (30-200 uV)

### Topomap Display
- Dynamic FFT normative database Z-score maps
- LORETA time-domain source analysis for gross pathologies
- JTFA (Joint Time-Frequency Analysis) feature detection
- Color-coded Z-score deviations (typically blue=low/red=high)
- 3-D LORETA Z-score biofeedback displays

### Report Layout
- Structured qEEG reports with annotated figures
- Symptom-to-EEG hypothesis linkage documentation
- Statistical comparison tables (Z-scores per frequency band per electrode)
- Brain Surfer Brain-Computer-Interface (BCI) integration
- Discriminant function analysis for clinical conditions

### Safety Features
- Test-retest reliability > 0.95 for normative comparisons
- FDA 510(k) clearance (K974748)
- EEG auto artifact rejection preserves phase integrity
- Structured tutorials guide clinical workflow
- Demo mode for training without license

### Strengths
- Gold-standard normative database (678 subjects, 2mo-82yr)
- Seamless integration of QEEG assessment and neurofeedback training
- Real-time Z-score neurofeedback with 1-19 channels
- Comprehensive frequency metrics (power, coherence, phase)
- LORETA Z-score source localization for training

### Weaknesses
- Steep learning curve (rated as most difficult among major platforms)
- Interface design from early 2000s era
- High cost ($3,500-$6,000+ with annual renewal)
- Limited customization of analysis pipelines
- Windows-only with hardware key licensing

---

## 3. BrainDx

### Overview
BrainDx is a web/cloud-based qEEG analysis platform derived from the NYU Brain Research Laboratories Neurometrics database tradition. It provides automated clinical report generation with discriminant function analysis.

### Key UI Patterns
| Pattern | Implementation |
|---------|---------------|
| **Cloud-Based Report Generation** | Web interface for uploading EEG and generating reports in seconds |
| **Multi-Level Analysis** | Surface EEG + LORETA source analysis + discriminant classification |
| **Normative Comparison** | Age-matched Z-scores for absolute/relative power, coherence, symmetry |
| **Condition Matching** | Statistical comparison against clinical databases (ADHD, ASD, depression, dementia) |

### Trace Viewer Design
- Minimal trace viewing; focus is on quantitative analysis
- Automated artifact detection and epoch selection
- Import from most commercial EEG equipment formats
- Translated transfer functions compensate for amplifier differences

### Topomap Display
- sLORETA statistical color-coded images overlaid on probabilistic MRI atlas
- Voxel-by-voxel Z-score computation
- Age regression equations standardize across lifespan
- Grayscale-compatible for print-friendly reports

### Report Layout
- Structured clinical reports with annotated figures
- Discriminant function similarity scores to known clinical populations
- Treatment guideline suggestions based on profile matching
- Document insertion capability for clinical observations

### Safety Features
- FDA-recognized normative database foundation
- Automated quality checks for impedance and signal quality
- Cross-validation of normative equations on independent samples
- Clinical disclaimer: reports are guidelines, not sole diagnostic tools

### Strengths
- Rapid report generation (seconds)
- Cloud accessibility from any computer
- Strong discriminant analysis for condition matching
- LORETA normative analysis included
- More affordable than NeuroGuide

### Weaknesses
- Limited interactive trace review
- Less comprehensive than NeuroGuide for neurofeedback
- Web dependency for report generation
- Less transparent analysis pipeline than open-source alternatives
- Fewer customization options for power users

---

## 4. EEGLAB (Swartz Center, UCSD)

### Overview
EEGLAB is the most widely used open-source EEG analysis platform, running in MATLAB. It combines a GUI for data exploration with command-line scripting for custom analysis.

### Key UI Patterns
| Pattern | Implementation |
|---------|---------------|
| **Three-Layer Architecture** | GUI (top) > Command history (middle) > Custom scripting (bottom) |
| **Plugin Ecosystem** | 120+ plugins auto-detected and integrated into main menu |
| **Single Dataset Structure** | One MATLAB `EEG` structure holds all data, always accessible at command line |
| **Scrollable Trace Viewer** | `eegplot()` with horizontal scrolling, rejection marking, and amplitude controls |
| **Study/Design Framework** | Group-level analysis across multiple datasets with statistical testing |

### Trace Viewer Design
- `eegplot()` function: horizontal scrolling display with GUI controls
- Channel-specific amplitude scaling and zoom
- Interactive artifact rejection by clicking on epochs
- Butterfly plots and channel grouping
- Event marker overlay with color coding
- Configurable page duration and channel labels

### Topomap Display
- `topoplot()`: 2D spherical spline scalp interpolation
- 3-D head plots on semi-realistic models (`headplot()`)
- ERP image plots: multi-trial visualization sorted by variables
- Topographical subplots for sensor-level comparisons
- Interactive click-to-explore on scalp maps

### Report Layout
- HTML/PDF export via `pop_saveh()`
- Component property figures (scalp maps, spectra, ERPs)
- STUDY-level group statistics with multiple comparison correction
- History field captures all GUI operations as scriptable commands

### Safety Features
- Full command history stored in `EEG.history` field
- Reproducible workflows via saved processing pipelines
- ICLabel automatic component classification (brain, eye, muscle, heart, line noise)
- Open-source allows peer review of algorithms
- BIDS compatibility for standardized data organization

### Strengths
- Most widely used EEG platform in cognitive neuroscience
- Seamless GUI-to-scripting transition
- Extensive plugin ecosystem (120+ extensions)
- Strong ICA decomposition and visualization tools
- Free and open-source

### Weaknesses
- MATLAB dependency (commercial license required)
- Single-dataset architecture limits multi-file workflows
- Memory-intensive for large datasets
- No built-in normative database for clinical comparison
- GUI design is functional but dated

---

## 5. MNE-Python

### Overview
MNE-Python is the leading Python-based neuroimaging analysis package, providing comprehensive tools for EEG/MEG processing, visualization, and statistical analysis.

### Key UI Patterns
| Pattern | Implementation |
|---------|---------------|
| **Code-First Design** | Pure Python API with object-oriented data structures (`Raw`, `Epochs`, `Evoked`) |
| **Interactive Matplotlib Plots** | Click-drag selection on plots opens linked views |
| **Jupyter Notebook Integration** | Native support for literate programming and reproducible analysis |
| **ICALabel Integration** | Automatic IC classification with confidence percentages |
| **BIDS-Native** | Built-in Brain Imaging Data Structure support |

### Trace Viewer Design
- `raw.plot()`: scrollable butterfly and channel-group views
- Interactive bad-channel marking directly in plots
- Time annotation with draggable region selectors
- Spatial color coding of traces by channel location
- Configurable duration, n_channels, clipping, and scaling
- LSL real-time streaming support via `mne_realtime`

### Topomap Display
- `plot_topomap()`: scalp topography at specified time points
- `plot_evoked_topo()`: topographical grid of all sensor responses
- `plot_arrowmap()`: vector field plots showing magnitude and direction
- `plot_brain()`: cortical surface projection with FreeSurfer integration
- Interactive sensor clicking to open detailed single-channel plots

### Report Layout
- `mne.Report`: automated HTML report generation
- Figure embedding with thumbnails and full-size views
- TOC navigation across report sections
- Programmatic report building for batch pipelines

### Safety Features
- Immutable data objects prevent accidental modification
- Provenance logging through scripting
- ICLabel for automatic artifact component detection
- Extensive validation of analysis parameters
- Active open-source community review

### Strengths
- Modern Python ecosystem (NumPy, SciPy, scikit-learn integration)
- Excellent source estimation capabilities (MNE, dSPM, sLORETA, eLORETA)
- Strong time-frequency analysis (Morlet wavelets, multitaper, Hilbert)
- Connectivity analysis tools (coherence, PLV, PLI, Granger)
- Active development with regular releases

### Weaknesses
- Steep learning curve for non-programmers
- No GUI for users without coding experience
- Documentation can be fragmented
- Visualization defaults require tuning for publication quality
- Memory management for large datasets requires expertise

---

## 6. FieldTrip

### Overview
FieldTrip is a MATLAB toolbox for MEG/EEG analysis developed at the Donders Institute, Netherlands. It is a script-based platform with no GUI, designed for advanced analysis pipelines.

### Key UI Patterns
| Pattern | Implementation |
|---------|---------------|
| **Script-Only Philosophy** | No GUI; all interaction through MATLAB scripts |
| **Configuration Structure Pattern** | All functions use `cfg` struct with explicit parameter specification |
| **Pipeline Architecture** | cfg → `ft_definetrial` → `ft_preprocessing` → `ft_timelockanalysis` → `ft_topoplot` |
| **Interactive Figure Selection** | Click-drag on multiplots to select channel/time subsets |

### Trace Viewer Design
- `ft_databrowser`: scrollable data inspection with artifact marking
- `ft_multiplotER`: multi-channel event-related response viewer
- `ft_singleplotER`: single-channel or averaged response plots
- Interactive selections propagate across linked figures

### Topomap Display
- `ft_topoplotER`: topographic maps at specified time windows
- `ft_multiplotTFR`: time-frequency multi-channel plots
- Custom electrode layout definitions for any montage
- Generic 2D projection of electrode positions

### Report Layout
- Script-as-documentation: the analysis script IS the report
- Automated figure generation at each pipeline stage
- Export to standard image formats for publication

### Safety Features
- Explicit configuration prevents hidden defaults
- Full reproducibility through shared scripts
- Peer-reviewed open-source code
- No black-box algorithms

### Strengths
- Most comprehensive source reconstruction capabilities
- Advanced statistical testing (cluster-based permutation)
- Excellent time-frequency and connectivity analysis
- Highly reproducible (scripts document everything)
- Strong MEG analysis support

### Weaknesses
- No GUI at all; requires MATLAB programming proficiency
- Steep learning curve for beginners
- Requires explicit knowledge of analysis parameters
- No built-in normative database
- Visualization requires more coding than competitors

---

## 7. Brainstorm

### Overview
Brainstorm is an open-source, collaborative application for MEG/EEG analysis with a strong emphasis on user-friendly GUI and 3D visualization. It is developed jointly by USC, CNRS, and collaborators.

### Key UI Patterns
| Pattern | Implementation |
|---------|---------------|
| **Contextual Interface** | Features accessible via right-click popup menus, not long static menus |
| **Database Explorer** | Three-level hierarchy: Protocol > Subject > Condition/Experiment |
| **Drag-and-Drop Processing** | Files dragged from database to processing pipeline |
| **Tabbed Figure System** | Multiple linked figure types (time series, topographic, 3D source) |
| **Batch Pipeline Builder** | Visual pipeline construction with automatic MATLAB script export |

### Trace Viewer Design
- Time series figures with configurable montages and amplitude scaling
- "Flip Y Axis" option for neurologist convention (negative up)
- Raw recording reviewer with event marking
- Simultaneous display of EEG + ECG + EOG traces
- Adjustable default review duration (e.g., 10s windows)
- Column vs. overlay display modes

### Topomap Display
- 2D sensor cap maps with real-time scalp interpolation
- 3D cortical surface rendering with source overlay
- MRI volume slicing with orthogonal plane views
- Time-frequency cortical maps
- Movie generation from sequential snapshots
- Transparency, smoothing, and downsampling controls

### Report Layout
- Contact sheets: grids of figures at sequential time points
- Movie exports for temporal dynamics
- Image export in multiple formats
- Scout (ROI) time course extraction and plotting

### Safety Features
- Database structure prevents data loss
- Automatic figure positioning and layout management
- Protocol-based organization prevents analysis errors
- Plugin structure for validated extensions

### Strengths
- Exceptionally intuitive GUI (no programming required)
- Powerful 3D visualization and source imaging
- Batch processing with automatic script generation
- Standalone executable available (no MATLAB license needed)
- Excellent documentation and tutorials
- Free and open-source

### Weaknesses
- Fewer analysis methods than FieldTrip
- MATLAB-based (though standalone available)
- Less flexible for custom analysis than script-based tools
- Clinical features (normative databases, report templates) absent
- Java/Swing interface limits modern UI capabilities

---

## 8. Nihon Kohden Neurofax (EEG-1200)

### Overview
Nihon Kohden Neurofax is a clinical-grade EEG system used worldwide in hospital and clinical settings. It emphasizes real-time acquisition, trend analysis, and customizable reporting.

### Key UI Patterns
| Pattern | Implementation |
|---------|---------------|
| **Customizable Main Menu** | User-defined examination protocol buttons for different conditions |
| **Live View Panel** | Centralized real-time neuromonitoring dashboard |
| **EEG Scope** | Multi-EEG reviewer: review previous EEGs while monitoring; open up to 4 EEGs simultaneously |
| **Note Window** | Drag-and-drop waveform snippet saving (up to 1,000 sections) |
| **Modular Design** | Amplifier, mapping, trend, and report modules work independently |

### Trace Viewer Design
- Real-time and retrospective scrolling trace display
- Customizable montages with prominent channel labels
- High-density support: up to 256 channels on single 4K screen
- Multi-EEG scope: compare up to 4 recordings simultaneously
- 10-20 and 10-10 electrode system support
- Configurable page speed and voltage sensitivity

### Topomap Display
- 3D voltage mapping: whole-head topographic overview
- Brain function mapping with cortical stimulation integration
- Trend conversion: aEEG, DSA (Density Spectral Array), CSA (Compressed Spectral Array)
- Power FFT trends for frequency analysis

### Report Layout
- NeuroReport: integrated report templates with adaptive auto-text
- Individually configured templates for fast reporting
- Brain function mapping reports combining stimulation and recording
- Flexible export formats

### Safety Features
- Secure data encryption
- Continuous cybersecurity evaluation
- SQL database access control
- Windows-based security with domain integration
- Built on up-to-date technology platforms

### Strengths
- Clinical-hardened for high-volume diagnostic use
- Excellent real-time trending (aEEG, DSA, CSA)
- Vital Signs Interface for multimodality assessment
- Customizable workflow for different examination types
- 38-256 channel wide-band recording capability
- Strong data security and encryption

### Weaknesses
- Primarily focused on acquisition rather than advanced analysis
- Limited qEEG and normative comparison features
- Less flexible for research applications
- Interface design reflects medical device constraints
- Customization requires administrative configuration

---

## 9. Natus NeuroWorks

### Overview
Natus NeuroWorks is an industry-leading clinical EEG platform that unifies EEG and sleep diagnostics. Version 10 introduces AI-assisted review with autoSCORE.

### Key UI Patterns
| Pattern | Implementation |
|---------|---------------|
| **Unified EEG/Sleep Platform** | Toggle between EEG and sleep modes without separate software |
| **4K Display Support** | All 256 channels visible on single ultra-HD monitor |
| **Panel-Based Layout** | Display panels with prominent iEEG channel group labels |
| **Study List Dashboard** | Visual indicators for abnormality probability at study level |
| **AI-Assisted Review** | autoSCORE markers highlight segments requiring attention |

### Trace Viewer Design
- Scrolling trace viewer optimized for high-channel-count review
- iEEG channel grouping with prominent labels
- High-density display: all 256 channels on single 4K screen
- Prominent channel labels for easy group identification
- Configurable time base and sensitivity

### Topomap Display
- 3D voltage mapping for spatial interpretation
- Color-coded topographic maps
- Support for extended 10-10 and 10-05 montages

### Report Layout
- Integrated reporting with customizable templates
- autoSCORE-assisted report generation
- Study-level probability summary (Normal/Probable Normal/Probable Abnormal/Abnormal)
- Abnormality subclassification: Focal Epileptiform, Generalized Epileptiform, Focal Non-epileptiform, Diffuse Non-epileptiform

### Safety Features
- autoSCORE: AI-based differentiation of normal vs. abnormal (99% confidence)
- Secure SQL database access with Windows authentication
- Data encryption in transit and at rest
- Cybersecurity program with continuous threat evaluation
- HIPAA-compliant architecture

### Strengths
- First-of-its-kind AI-assisted EEG review (autoSCORE)
- Unified platform for EEG and sleep diagnostics
- Excellent high-density channel support
- Strong security and regulatory compliance
- Workflow efficiency: faster time to diagnosis
- Reduces inter-scorer variability

### Weaknesses
- Primarily clinical-focused; limited research analysis tools
- AI features require validation and user training
- Subscription/licensing model
- Less flexible for custom analysis pipelines
- qEEG features less comprehensive than dedicated platforms

---

## Cross-Platform Comparison Matrix

| Feature | BrainVision | NeuroGuide | BrainDx | EEGLAB | MNE | FieldTrip | Brainstorm | Nihon Kohden | Natus |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **GUI Interface** | Full | Full | Web | Full | Code | Script | Full | Full | Full |
| **Trace Scrolling** | Horizontal | Horizontal | Limited | Horizontal | Horizontal | Horizontal | Horizontal | Horizontal | Horizontal |
| **Topographic Maps** | 2D/3D | 2D/LORETA | 3D/sLORETA | 2D/3D | 2D/3D/Brain | 2D | 2D/3D/Volume | 3D | 3D |
| **Normative Database** | No | Yes (Thatcher) | Yes (NYU) | No | No | No | No | No | No |
| **Report Generation** | Export | Full reports | Full reports | HTML/Export | HTML | Script | Export | Integrated | Integrated |
| **ICA Support** | Yes | Limited | No | Yes (gold standard) | Yes | Yes | Yes | No | No |
| **Source Localization** | LORETA | LORETA/sLORETA | LORETA | DIPFIT | MNE/dSPM/sLORETA | Full | Full | No | No |
| **Time-Frequency** | ERS/ERD/Wavelets | JTFA | No | Yes | Yes | Yes | Yes | Trends | Trends |
| **Connectivity** | Coherence/PLV | Coherence/Phase | No | Coherence | Full | Full | Yes | No | No |
| **Batch Processing** | Templates | Limited | No | STUDY | Script | Script | Visual Pipeline | No | No |
| **Programming Required** | No | No | No | Optional | Yes | Yes | No | No | No |
| **Open Source** | No | No | No | Yes (GPL) | Yes (BSD) | Yes (GPL) | Yes (GPL) | No | No |
| **FDA Clearance** | Research | 510(k) | Recognized | No | No | No | No | Medical Device | Medical Device |
| **Learning Curve** | Low | Steep | Low | Moderate | Steep | Steepest | Low | Low | Low |
| **Target User** | Researcher | qEEG Clinician | Clinician | Researcher | Researcher | Researcher | Researcher/Clinician | Clinical Tech | Clinical Neurologist |

---

## Top 15 UX Patterns for qEEG/EEG Interface Design

### P1: Provenance-Tracking Workflow Tree
**Origin:** BrainVision Analyzer 2 (History Tree)
**Pattern:** Every processing step is a node in a visual tree with stored parameters. Users can reprocess from any point, branch the analysis, or apply templates.
**UX Benefit:** Complete analysis transparency, reproducibility without scripting, and error recovery.
**Implementation:** Right-click context menus for "Edit Parameters/Reprocess" vs "Edit Parameters/Copy" to branch vs. replace nodes.

### P2: Montage Quick-Switch System
**Origin:** NeuroGuide, Persyst, Nihon Kohden
**Pattern:** One-click switching between Longitudinal Bipolar (LB), Transverse Bipolar (TB), Circular Bipolar (CircBP), Average Reference, and Laplacian montages with keyboard shortcuts.
**UX Benefit:** Rapid exploration of spatial relationships; phase reversal identification in bipolar; amplitude comparison in referential.
**Implementation:** Dropdown or toolbar buttons with mnemonic shortcuts (F1-F5). Current montage name displayed prominently.

### P3: Scrollbar Review Progress Indicator
**Origin:** Persyst 14+
**Pattern:** The horizontal scrollbar shows a secondary visual track indicating which portions of the recording have already been reviewed.
**UX Benefit:** Prevents redundant review in long-term monitoring; supports shift handoffs; gives sense of completeness.
**Implementation:** Subtle color overlay on scrollbar track (e.g., green = reviewed, gray = unreviewed).

### P4: Contextual Right-Click Menus
**Origin:** Brainstorm
**Pattern:** Features are not listed in long static menus but appear contextually based on the selected data type (raw, averaged, time-frequency, source).
**UX Benefit:** Reduced cognitive load; only relevant actions visible; faster access to commonly used functions.
**Implementation:** Dynamic menu generation based on data type of clicked node/figure.

### P5: Drag-and-Drop Pipeline Builder
**Origin:** BrainVision Analyzer (Templates), Brainstorm (Batch Tool)
**Pattern:** Users drag data files into a processing pipeline, configure parameters visually, and execute batch jobs.
**UX Benefit:** No coding required for reproducible batch processing; visual pipeline documentation; easy parameter modification.
**Implementation:** Visual canvas with connected processing nodes; auto-generated script export for power users.

### P6: Study-Level Abnormality Dashboard
**Origin:** Natus NeuroWorks (autoSCORE)
**Pattern:** Before reviewing traces, users see a dashboard showing the probability of normality/abnormality with subclassification (focal/generalized, epileptiform/non-epileptiform).
**UX Benefit:** Workflow triage: abnormal studies get attention first; reduces oversight; supports less experienced readers.
**Implementation:** Color-coded indicators (green/yellow/orange/red) with percentage confidence; sortable study list.

### P7: Linked Multi-Window Coordinated Views
**Origin:** Brainstorm, EEGLAB, Persyst
**Pattern:** Multiple figure windows (trace, topographic, source, video) are time-synchronized; clicking a time point in one updates all others.
**UX Benefit:** Holistic data interpretation; spatial-temporal relationships become apparent; supports multimodal review.
**Implementation:** Shared time cursor across all open figures; click-to-time synchronization.

### P8: Progressive Disclosure in Trace Viewers
**Origin:** EEGLAB (`eegplot`), MNE (`raw.plot()`)
**Pattern:** Traces displayed at reduced resolution by default; detail revealed through zooming; channel labels appear on hover.
**UX Benefit:** Manages information density for high-channel recordings; prevents visual overwhelm.
**Implementation:** Initial view shows 20-30 channels; scroll to reveal; hover tooltips for metadata.

### P9: Z-Score Color Divergence Scale
**Origin:** NeuroGuide, BrainDx, qEEG-Pro
**Pattern:** Topographic maps use a diverging color scale centered at zero (Z=0), with blue/cool for below-normal and red/warm for above-normal deviations.
**UX Benefit:** Intuitive interpretation of normative comparisons; colorblind-safe diverging scales; immediate anomaly identification.
**Implementation:** Perceptually uniform color maps (Viridis, Plasma variants); fixed scale range (e.g., -3 to +3 Z); grayscale compatibility.

### P10: Auto-Artifact Component Classification
**Origin:** EEGLAB (ICLabel), MNE-Python
**Pattern:** ICA components automatically classified with confidence percentages (brain, eye, muscle, heart, line noise, channel noise).
**UX Benefit:** Reduces manual review burden; guides artifact rejection decisions; speeds preprocessing.
**Implementation:** Component label overlay on topographic and time series plots; sortable component table with confidence scores.

### P11: Real-Time Trend Conversion Panel
**Origin:** Nihon Kohden (aEEG/DSA/CSA), Persyst
**Pattern:** Raw EEG traces accompanied by compressed trend panels showing amplitude envelope, spectral array, or suppression ratio over time.
**UX Benefit:** Pattern recognition over hours/days at a glance; detects seizures, sleep-wake cycles, and burst suppression.
**Implementation:** Scrollable trend panels above or beside raw traces; configurable time compression; color-coded values.

### P12: Command History Auto-Documentation
**Origin:** EEGLAB (`EEG.history`), Brainstorm (auto-script)
**Pattern:** Every GUI action automatically generates equivalent script code stored in a history field or exportable as a script.
**UX Benefit:** Seamless transition from exploration to reproducible pipeline; self-documenting analysis; training aid.
**Implementation:** History panel showing executed commands; one-click "Export as Script" button.

### P13: Symptom-Guided Analysis Wizard
**Origin:** NeuroGuide
**Pattern:** Before analysis, users enter a symptom checklist that guides which qEEG metrics and comparisons to compute.
**UX Benefit:** Reduces information overload by focusing on clinically relevant metrics; supports hypothesis-driven analysis.
**Implementation:** Structured symptom form > automated metric selection > targeted report generation.

### P14: Multi-Record Unified Timeline
**Origin:** Persyst (multi-record capability)
**Pattern:** Multiple physical recordings (e.g., daily segments of a long-term monitoring session) presented as a single continuous timeline.
**UX Benefit:** Eliminates manual file switching; maintains temporal context across days; supports long-term trend analysis.
**Implementation:** Seamless concatenation with visual day markers; continuous trend display; unified comment/annotation list.

### P15: Interactive Topography-to-Trace Cross-Linking
**Origin:** MNE-Python, Brainstorm
**Pattern:** Clicking a channel or region on a scalp topographic map opens or highlights the corresponding trace in the trace viewer.
**UX Benefit:** Rapid spatial-to-temporal navigation; intuitive channel identification; supports exploratory analysis.
**Implementation:** Bidirectional selection: trace click highlights topomap position; topomap click scrolls trace viewer to channel.

---

## Design Recommendations for Next-Gen qEEG Interfaces

### For Clinical Settings
1. **Prioritize rapid trace review**: Clinical users spend 80%+ of time scrolling traces. Optimize scrolling performance, montage switching, and annotation speed.
2. **AI-assisted triage**: Implement study-level abnormality scoring (like Natus autoSCORE) to prioritize urgent cases.
3. **Trend panels for LTM**: Always provide compressed trend views (aEEG, DSA) alongside raw traces for long-term monitoring.
4. **Standardized reports**: One-click report generation with normative comparisons and clinical interpretive text.

### For Research Settings
1. **Provenance tracking**: Implement visual workflow trees (BrainVision pattern) for full analysis transparency.
2. **GUI-to-script bridge**: Every GUI action should generate script code (EEGLAB pattern) for reproducibility.
3. **Plugin architecture**: Support community extensions that integrate seamlessly into the main interface.
4. **Batch pipeline builder**: Visual pipeline construction (Brainstorm pattern) for group analysis without coding.

### For qEEG / Neurofeedback
1. **Normative comparison at a glance**: Z-score topographic maps with diverging color scales should be the primary display.
2. **Sympt-to-EEG linkage**: Guided workflow from symptom checklist to relevant metrics to targeted protocols.
3. **Dual client/practitioner views**: Separate displays for practitioner (detailed metrics) and client (engaging feedback).
4. **Real-time feedback integration**: Smooth, artifact-robust real-time metrics with adjustable thresholds.

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **aEEG** | Amplitude-integrated EEG; compressed envelope trend for monitoring |
| **CircBP** | Circular Bipolar Montage; coronal electrode chain arrangement |
| **DSA** | Density Spectral Array; compressed frequency trend over time |
| **ERS/ERD** | Event-Related Synchronization/Desynchronization |
| **ICA** | Independent Component Analysis; blind source separation for artifact removal |
| **JTFA** | Joint Time-Frequency Analysis |
| **LB** | Longitudinal Bipolar Montage; anterior-to-posterior chains |
| **LORETA** | Low Resolution Electromagnetic Tomography; source localization method |
| **PLV** | Phase Locking Value; connectivity metric |
| **qEEG** | Quantitative EEG; numerical analysis of EEG features |
| **sLORETA** | Standardized LORETA; improved spatial resolution source localization |
| **TB** | Transverse Bipolar Montage; left-to-right chains |
| **Z-Score** | Standard deviation from normative database mean |

---

*Document generated from systematic review of peer-reviewed literature, product documentation, and clinical guidelines. Last updated: 2025-07-02.*
