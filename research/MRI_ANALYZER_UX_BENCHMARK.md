# MRI Analyzer UX Benchmark Report

> **Research Date:** 2025  
> **Focus:** Multi-planar reconstruction, overlay management, annotation tools, measurement tools, comparison views, key image workflow, report integration  
> **Target Audience:** DeepSynaps Protocol Studio UX team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Systems Analyzed](#2-systems-analyzed)
3. [Detailed Benchmarks](#3-detailed-benchmarks)
   - 3.1 [3D Slicer](#31-3d-slicer)
   - 3.2 [OHIF Viewer](#32-ohif-viewer)
   - 3.3 [Enterprise PACS Viewers](#33-enterprise-pacs-viewers)
   - 3.4 [Philips IntelliSpace PACS](#34-philips-intellispace-pacs)
   - 3.5 [GE Universal Viewer](#35-ge-universal-viewer)
   - 3.6 [Siemens Teamplay](#36-siemens-teamplay)
   - 3.7 [FSLeyes](#37-fsleyes)
   - 3.8 [MRIcroGL](#38-mricrogl)
   - 3.9 [Connectome Workbench](#39-connectome-workbench)
   - 3.10 [Neuromodulation Planning Software](#310-neuromodulation-planning-software)
4. [Cross-Cutting UX Patterns](#4-cross-cutting-ux-patterns)
5. [Top 15 UX Patterns for DeepSynaps](#5-top-15-ux-patterns-for-deepsynaps)
6. [Recommendations](#6-recommendations)

---

## 1. Executive Summary

This benchmark evaluates 10 major MRI and radiology viewing platforms across 8 UX dimensions. The analysis reveals a clear dichotomy: **research-oriented tools** (3D Slicer, FSLeyes, MRIcroGL, Connectome Workbench) prioritize flexibility, extensibility, and deep analytical capabilities with steeper learning curves. **Clinical enterprise viewers** (Philips IntelliSpace, GE Universal Viewer, Siemens Teamplay) prioritize workflow efficiency, safety, and rapid interpretation with more constrained but streamlined interfaces. **Web-native viewers** (OHIF) bridge these worlds with modern, extensible architectures that support both clinical and research workflows.

**Key findings:**
- **Multi-planar reconstruction (MPR)** is universally implemented but with varying degrees of interaction sophistication
- **Overlay management** differs dramatically: research tools use layer-based paradigms while clinical tools use protocol-driven display
- **Annotation workflows** range from free-form (research) to structured, DICOM SR-compliant (clinical)
- **Report integration** is the weakest area across all open-source tools but mature in enterprise PACS
- **Safety features** (validation, audit trails, confirmation dialogs) are heavily concentrated in enterprise/clinical tools

---

## 2. Systems Analyzed

| # | System | Category | License | Primary Use Case |
|---|--------|----------|---------|-----------------|
| 1 | 3D Slicer | Open-source research | BSD | Medical image computing, segmentation, surgical planning |
| 2 | OHIF Viewer | Open-source web viewer | MIT | DICOMweb viewing, research, clinical review |
| 3 | Enterprise PACS Viewers | Clinical enterprise | Proprietary | Primary diagnosis, clinical workflow |
| 4 | Philips IntelliSpace PACS | Enterprise PACS | Proprietary | Diagnostic reading, enterprise distribution |
| 5 | GE Universal Viewer | Enterprise PACS | Proprietary | Multi-modality reading, oncology/breast workflows |
| 6 | Siemens Teamplay | Enterprise PACS/Cloud | Proprietary | Team-based reading, collaborative workflow |
| 7 | FSLeyes | Neuroimaging research | Apache 2.0 | FSL analysis visualization, fMRI/MRI/DTI |
| 8 | MRIcroGL | Neuroimaging research | BSD | Compact viewing, rendering, NIfTI/DICOM |
| 9 | Connectome Workbench | Neuroimaging research | BSD | HCP surface/volume visualization |
| 10 | Brainsight/Localite | Neuromodulation planning | Proprietary | TMS targeting, neuronavigation |

---

## 3. Detailed Benchmarks

### 3.1 3D Slicer

**System Overview:** Open-source medical image computing platform with 20+ years of development. Used for visualization, segmentation, registration, and surgical planning. Not FDA-cleared; intended for clinical research.

#### Key UI Patterns
- **Module-based architecture:** Functionality organized into discrete modules (Segment Editor, DICOM, Volume Rendering, etc.) accessible via toolbar
- **MVC design pattern:** GUI, Logic, and MRML components follow Model-View-Controller separation
- **Extensible module system:** Loadable modules, CLI modules, and Python scripting for customization
- **Slicelets/Guidelets:** Simplified, task-specific interfaces for clinical or touch-based applications
- **Dark mode support:** Available via Edit > Application settings > Appearance

#### Viewer Layout
- **Default 4-up layout:** Three orthogonal 2D slice views (axial/red, sagittal/green, coronal/yellow) + one 3D rendering view
- **Anatomical color coding:** Red = axial (S/I), Green = sagittal (L/R), Yellow = coronal (A/P) — consistent with medical imaging conventions
- **Layout presets:** Multiple predefined layouts (3D only, conventional, four-up, side-by-side) with user-customizable favorites
- **Synchronized crosshairs:** Crosshairs in 2D views are bi-directionally linked; clicking one updates all others
- **Data Probe:** Bottom panel showing real-time voxel information, anatomical coordinates, and layer details at cursor position

#### Tool Placement
- **Module Panel (left):** Contextual tools and options for the active module
- **Module Selection Toolbar (top):** Dropdown to switch between 100+ modules
- **View Toolbar:** Layout controls, crosshair toggle, fiducial placement
- **Segment Editor:** Vertical tool palette with effects (Paint, Draw, Erase, Threshold, Scissors, etc.) + contextual inspector panel
- **Extensions Manager:** Built-in marketplace for installing additional functionality

#### Annotation Workflow
- **Segment Editor module:** Central hub for all segmentation tasks
  - Effects organized vertically: Paint, Draw, Erase, Level Tracing, Grow from Seeds, Fill Between Slices, Threshold, Margin, Smoothing, Scissors, Logical Operators, Watershed
  - Each effect has a contextual options panel
  - Segments listed with visibility toggle (eye icon), color picker, opacity control
- **Markups:** Support for fiducial points, lines, angles, curves, planes
- **NVIDIA AI Assisted Annotation (AIAA):** Optional AI-powered segmentation (Auto-segmentation, Boundary-points, DeepGrow)
- **Annotations exportable to:** DICOM SR, AIM, NIfTI, STL

#### Report Generation UX
- **Limited native reporting:** No built-in structured reporting module
- **DICOM SR support:** Via extensions; serialization of annotations into interoperable formats
- **Charting:** Built-in chart viewer for quantitative data (e.g., signal intensity curves)
- **Screenshot/secondary capture:** Save views as images for reports
- **Template system:** Customizable report templates via Python scripting

#### Safety Features
- **Not FDA-cleared:** Explicitly labeled for research use only
- **User confirmation dialogs:** For critical operations (deleting data, overwriting files)
- **Audit trail:** DICOM-compliant logging of operations
- **Data validation:** DICOM import validation; conformance checking
- **Undo/redo:** Multi-level undo for most operations

#### Strengths
- Unmatched extensibility and customization
- Powerful segmentation toolkit with 15+ effects
- Strong community and extensive documentation
- Free and open-source with no licensing restrictions
- Excellent for research prototyping and algorithm development
- Active development with regular releases

#### Weaknesses
- Steep learning curve; overwhelming for new users
- UI consistency varies across modules (different developers)
- Performance can degrade with large datasets
- No built-in structured reporting
- Requires significant training time
- Module proliferation creates discoverability issues

#### Applicable Patterns for DeepSynaps
- Modular panel system with contextual tool options
- Color-coded anatomical plane views
- Bi-directional crosshair synchronization
- Layer-based overlay management (background/foreground/label)
- Vertical tool palette with contextual inspector
- Extensible plugin architecture

---

### 3.2 OHIF Viewer

**System Overview:** Open-source, web-based DICOM viewer built on modern web technologies. Designed for extensibility via a modular extension system. Powers research platforms, clinical trials, and integrates with PACS via DICOMweb.

#### Key UI Patterns
- **Extension-based architecture:** Functionality added via pluggable extensions (cornerstone, vtk.js, segmentation, etc.)
- **Mode system (v3+):** Workflow-specific "mini-apps" within the viewer (e.g., AI Organ Segmentation, ECG viewer)
- **Panel system:** Left and right sidebar panels for tools, measurements, and study navigation
- **Viewport grid:** Flexible, resizable grid of image viewports
- **React-based UI:** Modern component-based interface with responsive design

#### Viewer Layout
- **Viewport grid system:** Configurable layouts (1x1, 1x2, 2x2, etc.) with drag-and-drop arrangement
- **Toolbar (top):** Primary tools (WW/WL, pan, zoom, measurement, etc.) with nested menu support
- **Left panel:** Study browser, series thumbnails, DICOM metadata
- **Right panel:** Measurements table, segmentation list, tool settings
- **Viewport overlays:** Patient info, study details, scale bar, orientation markers in each viewport corner
- **Responsive design:** Adapts to tablet and desktop; touch gesture support

#### Tool Placement
- **Top toolbar:** Icon-based tool row with nested dropdowns for related tools
  - Navigation: Pan, zoom, window/level, invert
  - Measurement: Length, angle, rectangle ROI, ellipse ROI
  - Annotation: Arrow, text, bidirectional measurement
  - Segmentation: Brush, scissors, threshold
  - CINE playback controls
- **Right panel:** Measurement list, segmentation list (uses Data Row component)
- **Context menus:** Right-click on viewport for quick access to common operations
- **Hotkey support:** Configurable keyboard shortcuts

#### Annotation Workflow
- **Cornerstone Tools framework:** Interactive measurement and annotation tools
  - Length, angle, rectangle/ellipse ROI measurements
  - Freehand and shape annotation tools
  - Interactive window/leveling
  - Brush and scissors segmentation tools
- **Measurement tracking:** All measurements listed in right panel with labels and values
- **DICOM SR creation:** Uses dcmjs for creating structured reports in the browser
- **Segmentation support:** DICOM Labelmap support; segment list with visibility toggle
- **Export:** DICOM SR, secondary captures downloadable or pushable to PACS

#### Report Generation UX
- **DICOM SR generation:** Create structured reports directly in the browser
- **Measurement tables:** Automatic tabulation of all measurements with labels
- **ProstateCancer.ai example:** Shows PI-RADS reporting with clickable prostate map in sidebar
- **Crowds Cure Cancer:** Demonstrates annotation aggregation and leaderboard features
- **Key image notes:** Support for DICOM Key Image Notes

#### Safety Features
- **DICOMweb compliance:** Standards-based communication
- **Audit trail:** Via integration with PACS/RIS
- **No local storage:** Images processed in browser memory; no persistent local cache
- **User authentication:** Integration with OAuth/OpenID Connect
- **IHE profile support:** Key Image Notes, Consistent Presentation of Images

#### Strengths
- Modern, clean web interface with no installation required
- Highly extensible via well-documented extension API
- Strong DICOMweb and DICOM SR support
- Multi-modality support (CT, MR, US, MG, XA, RF, etc.)
- Active open-source community with regular updates
- Mobile and tablet support
- VTK.js integration for advanced 3D visualization

#### Weaknesses
- Performance limited by browser capabilities for large datasets
- 3D/volume rendering less mature than desktop counterparts
- Requires DICOMweb backend (cannot read local files directly without Orthanc/similar)
- Extension quality varies
- Some advanced clinical features require custom development

#### Applicable Patterns for DeepSynaps
- Viewport grid system with drag-and-drop
- Top toolbar with nested tool menus
- Right-side measurement/annotation panel
- Mode-based workflow switching
- Viewport overlay information layout
- Touch gesture support for mobile/tablet
- Extension/plugin architecture

---

### 3.3 Enterprise PACS Viewers (General)

**System Overview:** Commercial PACS viewers used for primary diagnosis in clinical settings. Must be FDA-cleared (or equivalent) and comply with strict regulatory requirements. Focus on workflow efficiency, reliability, and safety.

#### Key UI Patterns
- **Hanging protocols:** Automated image arrangement based on modality, body part, and user preferences
- **Stage-based reading:** Multi-step interpretation workflow (current + prior, MPR, key images)
- **Worklist-driven UI:** Radiologist's reading list is the primary entry point
- **Dark theme by default:** Optimized for long reading sessions in dimly lit rooms
- **Keyboard-centric interaction:** Extensive hotkey support for rapid navigation
- **Contextual toolbars:** Tools appear based on selected modality and series type

#### Viewer Layout
- **Main viewport area:** 1-4 viewports (up to 8+ on large diagnostic monitors)
- **Thumbnail strip:** Series thumbnails along left or bottom edge
- **Patient timeline:** Chronological view of prior studies
- **Report pane:** Side-by-side or integrated report viewer
- **Hanging protocol selector:** Quick-switch between predefined layouts
- **Navigation strip:** Scout line showing current slice position

#### Tool Placement
- **Floating toolbars:** Contextual, collapsible toolbars near viewports
- **Right-click menus:** Extensive context menus for viewport operations
- **Measurement tools:** Caliper, angle, ellipse, trace (freehand) — typically on main toolbar
- **Window/level presets:** Organ-specific presets (brain, lung, bone, soft tissue, etc.)
- **CINE controls:** Playback speed control, forward/reverse, frame counter
- **Zoom/pan:** Mouse-driven with scroll wheel zoom

#### Annotation Workflow
- **Structured annotations:** All annotations captured as DICOM Presentation States or SR
- **Measurement tools:** Calibrated with DICOM pixel spacing; units displayed automatically
- **Arrow/text annotations:** For marking findings
- **ROI measurements:** Elliptical and freehand with statistics (mean, std, min, max, area)
- **Key image marking:** Findings flagged as key images linked to report

#### Report Generation UX
- **Integrated voice dictation:** Dragon/voice recognition integration
- **Structured reporting templates:** BI-RADS, PI-RADS, LI-RADS, etc.
- **AI-assisted pre-population:** Findings auto-filled from AI analysis
- **Report validation:** Mandatory fields, peer review flags
- **Critical findings notification:** Automated alerts to ordering physicians

#### Safety Features
- **FDA 510(k) clearance:** Required for primary diagnosis
- **DICOM conformance validation:** All operations validated against DICOM standard
- **Audit trails:** Complete logging of all viewing and manipulation activities
- **User authentication and role-based access:** Integration with hospital identity systems
- **Data integrity checks:** MD5/hash verification of transferred images
- **Failover and redundancy:** No single point of failure
- **HIPAA compliance:** Encryption in transit and at rest

#### Strengths
- Optimized for rapid, high-volume reading
- Deep EMR/HIS integration
- Mature, battle-tested workflows
- Comprehensive regulatory compliance
- Excellent priors comparison workflow
- 24/7 vendor support

#### Weaknesses
- Expensive licensing and maintenance
- Limited customization
- Slow to adopt new technologies
- Vendor lock-in
- Often require dedicated workstations
- Limited 3D/advanced visualization (often require separate applications)

#### Applicable Patterns for DeepSynaps
- Hanging protocol system for automated layout
- Keyboard-centric interaction design
- Dark theme optimization
- Integrated priors comparison
- Key image workflow linked to reports
- Structured reporting with modality-specific templates

---

### 3.4 Philips IntelliSpace PACS

**System Overview:** Enterprise PACS solution with diagnostic reading (Radiology 4.4) and zero-footprint clinical review (Anywhere). Features iSyntax compression for fast access and HTML5-based deployment.

#### Key UI Patterns
- **Unified UI:** Consistent interface across diagnostic and clinical review applications
- **Adaptive UI:** Automatically adapts to device (desktop, tablet, mobile) with responsive scaling
- **Patient timeline:** Graphical history timeline with links to relevant prior studies
- **Syntax technology:** Patented compression for fast data access over limited bandwidth
- **Configurable UI:** Dark/light color schemes; customizable backgrounds

#### Viewer Layout
- **Canvas Page:** Main viewing area with image manipulation tools
- **Control Strip:** Top bar with patient search, worklist, preferences, logoff
- **Timeline view:** Patient's radiological history with exam dates, modalities, reports
- **Federation icon:** Visual indicator for cross-site image availability
- **Collaboration viewer:** Multi-user synchronized viewing for consultations

#### Tool Placement
- **Image manipulation toolbar:** Window width/level, invert, zoom, pan, rotate
- **WW/WL presets:** Predefined settings for relevant modalities
- **CINE controls:** Playback with speed control; stack navigation
- **Measurement tools:** Distance, angle, elliptical region, rectangle (on non-touch devices)
- **Touch gestures:** Pinch-zoom (non-stack), two-finger pan, single-finger scroll

#### Annotation Workflow
- **Presentation states:** Load and save viewing state including measurements and annotations
- **Measurements:** Distance, angle, elliptical/rectangular ROI with automatic calculation
- **Exam notes:** Add, view, delete notes attached to exams
- **Critical findings interface:** Visibility on open findings; history display; documentation and closure

#### Report Generation UX
- **Integrated reporting:** View diagnostic reports within the viewer
- **Clinical info pane:** Signs, symptoms, history, allergies relevant to exam
- **Mail messaging:** Embedded exam links for communication between radiologists and clinicians
- **Workflow Layer 2.0:** Advanced workflow for productivity and collaboration

#### Safety Features
- **Audit trail:** Integration with IntelliSpace PACS audit system
- **Non-diagnostic disclaimer:** Anywhere explicitly labeled as "not intended for primary interpretation"
- **User authentication:** Login credentials shared with enterprise PACS
- **Remote access controls:** Multiple compression levels; full fidelity on demand
- **Reverse proxy support:** DMZ network support for external viewing

#### Strengths
- Excellent enterprise scalability
- Strong collaboration features (real-time multi-user)
- Adaptive UI for different devices
- Fast access via iSyntax compression
- Deep integration with Philips imaging modalities
- Mature workflow management

#### Weaknesses
- Anywhere version limited (no 3D, no clinical applications)
- 1024px max resolution on tablets
- Does not auto-populate when new images arrive (must close/reopen)
- Feature differentiation between diagnostic and review versions creates confusion

#### Applicable Patterns for DeepSynaps
- Adaptive/responsive UI for multi-device support
- Patient timeline with prior study linking
- Presentation state save/restore
- Touch gesture support for tablet use
- Contextual info panel (clinical history, allergies)

---

### 3.5 GE Universal Viewer

**System Overview:** Modern PACS viewer designed to unify diagnostic reading across Centricity PACS, PACS-IW, and Clinical Archive. Focus on intelligent productivity tools and AI integration.

#### Key UI Patterns
- **Smart Reading Protocols (SRP):** GEHC patented technology for automated study setup
- **Unified single-desktop experience:** All tools in one viewer, no separate workstations
- **Intelligent worklists:** AutoServe rules-based algorithm for workload balancing
- **Imaging Related Clinical Context (IRCC):** Relevant clinical content delivered in context
- **Auto Advance Workflow:** Automated progression through reading list

#### Viewer Layout
- **Main viewer:** Customizable, intuitive UI with optimized layout
- **Timeline and Navigator:** Patient imaging history in graphical format with Smart Relevancy
- **3D/MPR/Volume rendering:** Integrated advanced visualization (no separate app)
- **AI results panel:** Integrated display of 3rd party AI findings
- **Workflow Manager:** Organized, prioritized exam management

#### Tool Placement
- **Top toolbar:** Primary tools organized by function
- **Contextual toolbar:** Modality-specific tools appear automatically
- **Measurement tools:** Distance, angle, elliptical region, ellipse, freehand, rectangle, text
- **Cardiac tools:** Cardio Thoracic Ratio (CTR) calculations
- **Window/level:** Mouse-driven with organ-specific presets
- **Cross-reference synchronize:** Linked navigation across series

#### Annotation Workflow
- **DICOM annotations:** Distance, angle, freehand, elliptical/rectangular region
- **Key image notes:** Mark significant findings as key images
- **AI results visualization:** Overlay AI findings on images with confidence scores
- **Global stack:** Synchronized scrolling across linked series
- **Image export:** Save annotations and key images

#### Report Generation UX
- **Integrated reporting:** Links to reporting system
- **SRP-driven:** Smart Reading Protocols auto-configure views for efficient reporting
- **Ontology matching:** Rules-based matching for standardized terminology
- **AI results integration:** AI findings incorporated into report workflow

#### Safety Features
- **510(k) cleared:** FDA-cleared for diagnostic use
- **DICOM conformance:** Full DICOM support including Enhanced CT/MR, Breast Tomosynthesis
- **IHE profiles:** Consistent Presentation of Images, Key Image Notes, Radiology Information Access
- **Audit trail:** ATNA - Audit Trail and Node Authentication
- **Presentation states:** Save and restore exact viewing state
- **TLS encryption:** Secure data transmission

#### Strengths
- Strong AI integration ecosystem
- Intelligent workflow automation (SRP, Auto Advance)
- All-in-one viewer (2D, 3D, MPR, volume rendering)
- Excellent cross-platform support (desktop + iPad/Samsung tablet)
- Rules-based worklist management
- Unified UI across GE healthcare IT portfolio

#### Weaknesses
- GE ecosystem lock-in
- AI integration requires 3rd party partnerships
- Tablet version has reduced functionality (no 3D/MPR/Volume rendering)
- Customization requires professional services
- Limited annotation types compared to research tools

#### Applicable Patterns for DeepSynaps
- Smart Reading Protocols for automated view setup
- AI results overlay integration
- Intelligent worklist with workload balancing
- Clinical context panel (IRCC)
- Auto-advance workflow for batch processing
- Cross-reference synchronization

---

### 3.6 Siemens Teamplay

**System Overview:** Cloud-based imaging workflow platform from Siemens Healthineers. Emphasizes team-based reading, remote access, and integration with Siemens imaging modalities.

#### Key UI Patterns
- **Team-based workflow:** Designed for distributed radiology teams
- **Cloud-native architecture:** Browser-based with cloud storage
- **Mobile-first considerations:** Responsive design for tablet and phone access
- **Team collaboration:** Shared worklists, second opinion workflows

#### Viewer Layout
- **Dashboard:** Overview of pending studies, priorities, team assignments
- **Worklist:** Filterable, sortable list of studies with status indicators
- **Viewer:** Standard PACS layout with viewport grid and toolbars
- **Chat/communication:** Built-in messaging between team members

#### Tool Placement
- **Standard PACS toolbar:** Window/level, zoom, pan, measurement
- **Navigation:** Slice scrolling, series switching
- **Layout controls:** Viewport arrangement presets

#### Annotation Workflow
- **Standard measurement tools:** Caliper, angle, area
- **Annotations:** Linked to user and timestamp
- **Second opinion workflow:** Flag cases for colleague review

#### Report Generation UX
- **Structured reporting:** Templates for common exam types
- **Integration with syngo.via:** Advanced visualization and reporting
- **Voice dictation support:** Integration with speech recognition

#### Safety Features
- **Cloud security:** ISO 27001 certified, HIPAA compliant
- **Role-based access:** Team and role-based permissions
- **Audit trail:** Complete logging of all activities
- **Data encryption:** AES-256 encryption at rest and in transit

#### Strengths
- Strong cloud infrastructure
- Team collaboration features
- Good integration with Siemens modalities
- Scalable for large organizations
- Regular updates and feature additions

#### Weaknesses
- Less mature than on-premises PACS
- Dependent on internet connectivity
- Limited customization
- Smaller installed base than Philips/GE
- Some features require syngo.via integration

#### Applicable Patterns for DeepSynaps
- Team-based workflow with shared worklists
- Cloud-native architecture for accessibility
- Built-in communication/chat
- Second opinion flagging workflow
- Role-based access control

---

### 3.7 FSLeyes

**System Overview:** Image viewer for FSL (FMRIB Software Library), the most widely used neuroimaging analysis package. Replaces the older FSLView with expanded functionality for 3D/4D data visualization.

#### Key UI Patterns
- **Overlay paradigm:** All loaded files are "overlays" displayed in a common space
- **Reference space system:** First loaded image becomes reference; all others transformed into its space
- **Layer-based management:** Overlays stacked with independent controls for each
- **Plugin/script architecture:** Python scripting for automation; FSL integration via SCT plugin

#### Viewer Layout
- **Main view area:** Multi-planar (axial, sagittal, coronal) + optional 3D rendering
- **Overlay list (left):** All loaded overlays with visibility toggle, name, and quick controls
- **Display toolbar:** Overlay selection, display mode, color map, intensity range
- **Location panel:** Cursor position in voxel and world coordinates
- **Plot panel:** Time series plotting for 4D data

#### Tool Placement
- **Top menu bar:** File, Edit, View, Overlay, Settings, Tools, Help
- **Overlay toolbar:** Below menu; overlay selection dropdown, display controls
- **View settings panel:** Toggle controls for each view (orthographic, 3D, etc.)
- **Tools menu:** Atlas search, cluster analysis, movie maker, screenshot
- **Right-click context menus:** Overlay-specific operations

#### Annotation Workflow
- **Atlas integration:** Load standard atlases (Harvard-Oxford, Juelich, etc.) for ROI identification
- **Cluster analysis:** Generate cluster tables with voxel coordinates, volumes, p-values
- **ROI creation:** Tools for defining regions of interest
- **Image editing:** Basic editing capabilities for mask refinement
- **Standard space support:** MNI152 template space by default

#### Overlay Management
- **Overlay list:** Stacked list with drag-to-reorder; each overlay has:
  - Visibility toggle (eye icon)
  - Opacity slider
  - Color map (LUT) selection
  - Threshold controls (min/max)
  - Interpolation toggle
- **Display space options:** Can change reference overlay for display
- **Blending modes:** Different overlay compositing options

#### Report Generation UX
- **Screenshot tool:** Save views as publication-quality images
- **Movie maker:** Create animations of 3D renderings or slice traversals
- **Cluster table export:** Export statistical results as CSV/text
- **Scripting:** Python API for automated figure generation

#### Safety Features
- **Data validation:** Checks image orientation and space alignment
- **No patient data exposure:** Designed for research datasets (typically de-identified)
- **Session save/restore:** Save complete viewing state

#### Strengths
- Excellent for neuroimaging statistical maps
- Strong overlay management with independent controls
- Tight integration with FSL analysis pipeline
- Atlas support for anatomical labeling
- 4D data support with time series plotting
- Free and open-source

#### Weaknesses
- Designed specifically for brain imaging; less useful for general radiology
- No DICOM support (NIfTI-focused)
- No structured reporting capabilities
- Limited measurement tools compared to clinical viewers
- 3D rendering less sophisticated than 3D Slicer or MRIcroGL
- Steep learning curve for non-FSL users

#### Applicable Patterns for DeepSynaps
- Overlay list with independent visibility/opacity/LUT controls
- Reference space system for multi-image alignment
- Atlas integration for anatomical labeling
- Cluster analysis table with coordinate reporting
- 4D data support with time series plotting
- Plugin architecture for extensibility

---

### 3.8 MRIcroGL

**System Overview:** Compact, fast neuroimaging viewer focused on high-quality volume rendering and NIfTI/DICOM support. Successor to MRIcron with GLSL-based rendering. Designed by Chris Rorden.

#### Key UI Patterns
- **Minimalist interface:** Clean, focused UI with essential controls only
- **Display mode presets:** Quick switching between viewing modes (orthographic, rendering, multi-planar+render)
- **Layer panel:** Simple overlay list with checkboxes and basic controls
- **Scripting via Python:** Full automation via Python scripting language
- **Cross-platform:** Windows, Mac, Linux support

#### Viewer Layout
- **Main view:** Single viewport that switches between modes
- **Overlay panel (left):** List of loaded images with visibility toggle, color controls
- **Display controls:** Mode selection (2D, Multi-Planar, Render), orientation, zoom
- **Render panel (for 3D):** Clipping controls (depth, azimuth, elevation), shader options
- **Color bar:** Dynamic color bar panel with threshold adjustment buttons

#### Tool Placement
- **Menu bar:** File, Edit, View, Display, Adjust, Draw, Options, Help
- **Toolbar icons:** Quick access to common functions
- **Display menu:** Switch between viewing modes (2D, A+C+S, A+C+S+R, Render)
- **Adjust menu:** Window/level, contrast, color map, threshold
- **Draw menu:** Lesion drawing, ROI tools

#### Annotation Workflow
- **ROI drawing:** Tools for drawing regions of interest (lesion mapping)
- **Cluster table generation:** Automatic cluster detection with statistics
- **Crosshair navigation:** Click on cluster table to jump to location
- **3D rendering:** Volume and surface rendering for visualization
- **Clipping planes:** Interactive clipping for revealing internal structures

#### Overlay Management
- **Simple layer list:** Checkbox visibility, drag-to-reorder
- **Color map selection:** Extensive built-in LUTs
- **Threshold controls:** Min/max threshold sliders
- **Opacity blending:** Alpha blending for overlays
- **Color bar panel:** Interactive threshold adjustment with up/down buttons

#### Report Generation UX
- **Screenshot tool:** High-quality image capture for publications
- **Cluster table export:** CSV/text export of cluster statistics
- **Scripting:** Batch processing and figure generation via Python
- **Standard space coordinates:** MNI/Talairach coordinate reporting

#### Safety Features
- **Data validation:** Automatic orientation detection and correction
- **DICOM anonymization:** Built-in dcm2nii conversion with de-identification
- **No network connectivity required:** Standalone application

#### Strengths
- Extremely fast and lightweight
- Best-in-class volume rendering for neuroimaging
- Excellent for publication-quality figures
- Strong DICOM to NIfTI conversion with BIDS support
- Intuitive for basic viewing tasks
- Free and actively maintained

#### Weaknesses
- Limited toolset compared to 3D Slicer
- No segmentation editor
- No structured reporting
- Primarily designed for viewing, not analysis
- Limited annotation types
- No multi-viewport simultaneous display

#### Applicable Patterns for DeepSynaps
- Minimalist, focused interface design
- Quick mode switching (2D/3D/multi-planar)
- High-quality volume rendering with clipping planes
- Color bar panel with interactive threshold
- Lightweight, fast startup
- Scripting support for automation

---

### 3.9 Connectome Workbench

**System Overview:** Open-source visualization and discovery tool for the Human Connectome Project. Specialized for surface-based neuroimaging data (cifti/gifti formats) with both GUI (wb_view) and command-line (wb_command) interfaces.

#### Key UI Patterns
- **Scene-based workflow:** Save and restore complete viewing states as "scenes"
- **Layer system:** Multiple data maps overlaid on surfaces or volumes
- **Tabbed interface:** Multiple viewing modes in tabs (Surface, Volume, All, etc.)
- **Spec file system:** .spec files bundle related surfaces and data for easy loading
- **Montage views:** Dual-hemisphere display with opposing views (medial/lateral)

#### Viewer Layout
- **Toolbar (top):** File operations, view controls, scene management
- **Main view area:** Display of surface models, volume slices, or both
- **Overlay toolbox (left/overlay):** Layer controls, color palette, threshold settings
- **Information panel:** Data values at cursor position
- **Border/foci panel:** List of borders and foci with controls

#### Viewer Modes
- **Surface view:** Individual hemispheres or montage views
- **Volume view:** Individual slices, montage/lightbox, or 3 orthogonal planes
- **Whole Brain view:** Simultaneous surface models, volume slices, and 3D voxels
- **Surface contours:** Cortical surfaces displayed on volume slices

#### Tool Placement
- **Toolbar:** Load data, save scene, take screenshot, view options
- **Overlay controls:** Layer selection, color palette, threshold min/max
- **View settings:** Tab selection, layout options, surface/volume toggle
- **Borders/foci tools:** Create and edit borders and foci
- **wb_command:** CLI for batch operations and pipeline integration

#### Annotation Workflow
- **Borders:** Draw boundaries on cortical surfaces (e.g., ROI outlines)
- **Foci:** Place points on surface (e.g., cluster centers)
- **Scene saving:** Save complete viewing state for later restoration or sharing
- **BALSA database:** Upload and share scenes with the community

#### Overlay Management
- **Layer controls:** Multiple scalar maps and label maps as layers
  - Each layer has independent color palette and threshold
  - Layers can be turned on/off, reordered, opacity adjusted
- **Scalar maps:** Real-valued data mapped to color palettes (e.g., myelin maps)
- **Label maps:** Integer-valued data with specific colors and names (e.g., parcellations)
- **Palette editor:** Custom color map creation and modification

#### Report Generation UX
- **Scene export:** Save complete viewing states
- **Screenshot tool:** High-quality image capture
- **BALSA integration:** Share scenes and data with collaborators
- **wb_command:** Automated figure generation via scripting

#### Safety Features
- **Data integrity:** File format validation for gifti/cifti/nifti
- **Session recovery:** Automatic backup of scenes
- **No network requirement:** Can run fully offline

#### Strengths
- Best tool for surface-based neuroimaging data
- Excellent dual-hemisphere montage views
- Robust scene management system
- Strong HCP data compatibility
- Active development and community
- Free and open-source

#### Weaknesses
- Steep learning curve (acknowledged by community - "wb_sanity" wrapper exists)
- Primarily for surface data; volume visualization less sophisticated
- Limited annotation types (borders and foci only)
- No DICOM support
- No structured reporting
- Command-line tools required for many operations

#### Applicable Patterns for DeepSynaps
- Scene save/restore system for viewing states
- Layer-based overlay with independent palette/threshold per layer
- Montage view layout for dual-hemisphere display
- Spec file bundling for multi-file loading
- Integration of surface and volume views
- Tabbed interface for different viewing modes

---

### 3.10 Neuromodulation Planning Software (Brainsight / Localite)

**System Overview:** Neuronavigation systems for TMS (Transcranial Magnetic Stimulation) and tDCS planning. Enable accurate targeting based on individual MRI anatomy or MNI standard space.

#### Brainsight TMS (Rogue Research)

**Key UI Patterns:**
- **Workflow-based UI:** Steps laid out along top of main window (load images → register → target → stimulate)
- **Intuitive step progression:** Linear workflow from setup to stimulation
- **Multiple file format support:** NIfTI, DICOM, MINC, Analyze, PAR/REC, Siemens .ima
- **Customizable layouts:** User-configurable views and reconstructions

**Viewer Layout:**
- **Multi-panel display:** 4 equal-sized panels (3 orthogonal + 3D) by default
- **3D curvilinear reconstruction:** Automatic brain surface reconstruction
- **Overlay system:** Multiple overlays (fMRI, EEG, PET) with independent LUTs
- **Target panel:** List of targets with color coding, entry points

**Tool Placement:**
- **Top workflow bar:** Setup → Load Images → Register → Target → Stimulate
- **Left toolbar:** Target placement, trajectory planning, grid creation
- **Targeting controls:** MNI/Talairach coordinate entry, approach angle, coil orientation
- **Paint tool:** Region painting for 3D reconstruction and ROI highlighting

**Safety Features:**
- **Coil tracking verification:** Real-time optical tracking with visual confirmation
- **Stimulation logging:** Every pulse recorded with position, orientation, physiological output
- **Robot integration:** Automated coil placement with safety limits (optional)
- **MEP recording:** Motor evoked potential monitoring integration

#### Localite TMS Navigator TS

**Key UI Patterns:**
- **Five-area interface:** Control area, Display, Toolbar, Menu, Status bar
- **Control modes:** Planning Mode (setup) and Navigation Mode (stimulation)
- **MNI Planning:** Pre-defined target lists in standard space for quick loading
- **Device tracking:** Real-time indicator for pointer, coil, and reference detection

**Viewer Layout:**
- **Four-panel display:** Configurable layout with 3 orthogonal + 3D views
- **Control area (right):** Upper = Control Modes; Lower = control panels with expand/collapse
- **Status bar (bottom):** Foot pedal function indicators (color-coded: yellow, blue, green)
- **Stimulator panel:** Integration with MagPro stimulator for pulse train control

**Tool Placement:**
- **Left toolbar:** Session setup, patient registration, brain segmentation, camera check
- **Upper toolbar section:** Frequently used functions
- **Lower toolbar section:** Device detection indicators (Red=No, Green=Yes)
- **Entry/Target panel:** List of targets with color, visibility toggle, add/remove
- **Planning panel:** Rotation definition, entry calculation

**Annotation/Targeting Workflow:**
1. Load anatomical (T1-weighted, ~1mm isotropic)
2. Surface threshold adjustment (~50)
3. Patient registration (landmark-based)
4. Brain segmentation
5. Talairach definition (for MNI space)
6. Load MNI planning targets
7. Define rotation and calculate entry for each target
8. Hand knob verification

**Safety Features:**
- **FDA-cleared (Navigator TS):** Cleared for clinical TMS navigation
- **Patient registration verification:** Multi-point landmark registration
- **Coil calibration:** Required before each session
- **Foot pedal controls:** Color-coded safety controls
- **Automatic documentation:** Treatment protocol auto-documented
- **Stimulator integration:** Direct communication with MagPro for protocol enforcement

#### Applicable Patterns for DeepSynaps
- **Workflow-based linear UI:** Step-by-step guided interface
- **Top workflow progress bar:** Visual indication of current step
- **Multi-panel layout:** 3 orthogonal + 3D as default
- **Device tracking indicators:** Real-time status with color coding
- **MNI/standard space targeting:** Coordinate-based targeting with atlas integration
- **Entry/target list:** Structured target management with metadata
- **Safety confirmation gates:** Required checks before proceeding

---

## 4. Cross-Cutting UX Patterns

### 4.1 Multi-Planar Reconstruction (MPR) UX

| System | MPR Implementation | Interaction Model | Synchronization |
|--------|-------------------|-------------------|-----------------|
| 3D Slicer | 3 orthogonal + 3D | Crosshair-driven, linked | Bidirectional real-time |
| OHIF Viewer | MPR via VTK.js extension | Scroll/wheel per viewport | Cross-reference lines |
| Philips IntelliSpace | 2D/3D/4D review | Mouse-driven with presets | Series linking |
| GE Universal Viewer | Integrated MPR | Toolbar + mouse | Cross-reference synchronize |
| FSLeyes | Orthographic 3-view | Click + scroll per view | Cursor position linked |
| MRIcroGL | Multi-planar + render | Single viewport, mode switch | Crosshair linked |
| Connectome Workbench | 3 orthogonal or volume | Independent view control | Optional linking |
| Localite/Brainsight | 3 ortho + 3D | Crosshair + target entry | Full synchronization |

**Common pattern:** All systems use the standard 3 orthogonal planes (axial, sagittal, coronal) with linked crosshairs. Clinical systems add cross-reference lines showing the position of other planes. Research systems often add a 3D rendering view.

### 4.2 Overlay Management

| System | Paradigm | Layer Controls | Transparency |
|--------|----------|---------------|--------------|
| 3D Slicer | Background/Foreground/Label | Opacity sliders per layer | Yes, per layer |
| OHIF Viewer | Viewport-based | Segmentation list with toggles | Yes |
| FSLeyes | Stacked overlay list | Per-overlay opacity, LUT, threshold | Yes |
| MRIcroGL | Simple layer list | Checkbox + basic controls | Alpha blending |
| Connectome Workbench | Layer system | Per-layer palette, threshold, opacity | Yes |
| GE Universal Viewer | Presentation states | Modality-specific tools | Limited |

**Common pattern:** Layer-based overlay management with independent controls for visibility, opacity, color map, and threshold is the dominant paradigm in research tools. Clinical tools use presentation states for saved viewing configurations.

### 4.3 Annotation Tools

| System | Measurement Types | Annotation Export | Structured? |
|--------|------------------|-------------------|-------------|
| 3D Slicer | Length, angle, ROI, curves | DICOM SR, AIM, NIfTI | Via extensions |
| OHIF Viewer | Length, angle, ROI, arrow, text | DICOM SR, JSON | Yes (DICOM SR) |
| GE Universal Viewer | Distance, angle, ellipse, freehand | DICOM PS, SR | Yes |
| Philips IntelliSpace | Distance, angle, ellipse, rectangle | Presentation State | Partially |
| FSLeyes | Limited (crosshair position) | Cluster tables | No |
| MRIcroGL | Cluster statistics | CSV/text | No |
| Localite/Brainsight | Target coordinates | Session files | Structured |

### 4.4 Comparison Views

| System | Prior Study Loading | Hanging Protocols | Side-by-Side |
|--------|-------------------|-------------------|--------------|
| 3D Slicer | Manual | Layout presets | Yes, via layout |
| OHIF Viewer | Hanging protocol module | Configurable HP | Yes, 2-study URL |
| GE Universal Viewer | Timeline + Smart Relevancy | SRP automated | Yes, synchronized |
| Philips IntelliSpace | Timeline view | Automated | Yes, with linking |
| IntelliSpace Anywhere | Dashboard + timeline | Limited | Yes |

### 4.5 Report Integration

| System | Structured Reporting | Key Images | Voice Dictation |
|--------|---------------------|------------|-----------------|
| 3D Slicer | No native support | Screenshots | No |
| OHIF Viewer | DICOM SR support | DICOM Key Image Notes | No |
| GE Universal Viewer | Integrated | Yes | Yes |
| Philips IntelliSpace | Via Workflow Layer | Yes | Yes |
| Siemens Teamplay | Template-based | Yes | Yes |
| FSLeyes | No | Screenshots only | No |
| MRIcroGL | No | Screenshots only | No |

---

## 5. Top 15 UX Patterns for DeepSynaps

Based on the benchmark analysis, these are the highest-impact UX patterns to adopt for DeepSynaps:

### Pattern 1: Linked Multi-Planar Viewports with Color-Coded Planes
**Source:** 3D Slicer, FSLeyes, Localite  
**Pattern:** Three orthogonal slice views (axial/red, sagittal/green, coronal/yellow) with bidirectionally linked crosshairs. Clicking any view updates the other two. Color coding helps users immediately identify the anatomical plane.  
**Implementation:** Assign consistent colors to each plane. Crosshairs should update in real-time. Consider adding cross-reference lines in clinical mode.

### Pattern 2: Layer-Based Overlay Management Panel
**Source:** FSLeyes, 3D Slicer, Connectome Workbench  
**Pattern:** A dedicated panel listing all loaded overlays with per-layer controls: visibility toggle (eye icon), opacity slider, color map/LUT selector, min/max threshold, and drag-to-reorder. The selected layer highlights and shows expanded controls.  
**Implementation:** Left-side or right-side panel. Each layer row shows name, visibility toggle, and opacity. Expanded view shows color map, threshold, and blending controls.

### Pattern 3: Contextual Tool Palette with Inspector
**Source:** 3D Slicer Segment Editor, OHIF Toolbar  
**Pattern:** A vertical or horizontal tool palette where selecting a tool reveals contextual options in an adjacent inspector panel. This keeps the UI clean while providing deep control.  
**Implementation:** Tool icons in a sidebar; selecting a tool opens its specific options panel below or beside the tool list. Reduce cross-screen mouse movement.

### Pattern 4: Smart Reading Protocols / Automated Layout System
**Source:** GE Universal Viewer (SRP), OHIF Hanging Protocols  
**Pattern:** Automatically configure the viewport layout, series arrangement, and tool selection based on study metadata (modality, body part, exam type). Users can save and share custom protocols.  
**Implementation:** Rule-based system that matches study attributes to layout templates. Support user-defined overrides and favorites.

### Pattern 5: Mode-Based Workflow Switching
**Source:** OHIF Viewer v3, 3D Slicer (Slicelets)  
**Pattern:** Switch between workflow modes (e.g., "Viewing", "Segmentation", "Measurement", "Reporting") that reconfigure the entire UI — toolbar, panels, and available tools — for the specific task.  
**Implementation:** Mode selector in top bar or sidebar. Each mode defines its own toolset, panel layout, and default settings. Modes can be extended via plugins.

### Pattern 6: Interactive Color Bar with Threshold Adjustment
**Source:** MRIcroGL, BrainVoyager, FSLeyes  
**Pattern:** A floating or docked color bar that shows the current color map and value range. Users can click and drag to adjust min/max thresholds, or use arrow buttons for fine adjustment. Hover reveals controls; mouse-out hides for clean presentation.  
**Implementation:** Display color bar as a panel that auto-hides chrome. Show value labels at top and bottom. Support click-drag for threshold adjustment.

### Pattern 7: Patient Timeline with Prior Study Linking
**Source:** Philips IntelliSpace, GE Universal Viewer  
**Pattern:** A chronological timeline showing all prior studies for the patient, with modality icons, dates, and report availability indicators. Clicking a prior loads it for comparison.  
**Implementation:** Horizontal or vertical timeline with study cards. Color-code by modality. Show report icon if available. Support drag-to-compare in side-by-side view.

### Pattern 8: Measurement Table with Persistent Tracking
**Source:** OHIF Viewer, 3D Slicer, GE Universal Viewer  
**Pattern:** All measurements automatically collected in a persistent table showing label, type, value, unit, and location. Measurements remain editable and can be deleted individually or in bulk.  
**Implementation:** Right-side panel with measurement list. Each row shows measurement type icon, label, and value. Click to navigate to measurement location. Support export to report.

### Pattern 9: Key Image Workflow with Report Linkage
**Source:** Enterprise PACS (GE, Philips), OHIF  
**Pattern:** Users mark significant images as "key images" during review. Key images are automatically linked to the report, making it easy for referring physicians to see the most relevant findings.  
**Implementation:** Star or flag icon on viewport toolbar. Key images collected in a panel. Auto-linked to report generation. Support DICOM Key Image Notes.

### Pattern 10: Scene Save/Restore System
**Source:** Connectome Workbench, 3D Slicer  
**Pattern:** Save the complete viewing state (layout, visible layers, camera position, color settings, annotations) as a named scene that can be restored later or shared with collaborators.  
**Implementation:** Save Scene button with naming dialog. List of saved scenes in a panel. One-click restore. Support scene export/import for sharing.

### Pattern 11: Workflow Progress Bar for Guided Tasks
**Source:** Brainsight TMS, Localite TMS Navigator  
**Pattern:** A linear progress indicator at the top of the interface showing the steps in a multi-step workflow (e.g., Load → Register → Review → Annotate → Report). Current step is highlighted; completed steps are checked.  
**Implementation:** Horizontal bar with numbered steps. Clickable to navigate between completed steps. Validation checks prevent advancing until required steps are complete.

### Pattern 12: Atlas Integration for Anatomical Labeling
**Source:** FSLeyes, MRIcroGL, 3D Slicer  
**Pattern:** Integration of standard brain atlases (Harvard-Oxford, AAL, Juelich) that overlay anatomical labels on the current cursor position or selected region. Click to look up region name and metadata.  
**Implementation:** Atlas selector dropdown. Cursor-position label showing current region. Optional atlas overlay as a semi-transparent layer. Support multiple atlas sources.

### Pattern 13: Touch Gesture Support for Tablet/Mobile
**Source:** OHIF Viewer, Philips IntelliSpace Anywhere  
**Pattern:** Multi-touch gesture support for common operations: pinch-zoom, two-finger pan, single-finger scroll, tap to select. Optimized for touch-based devices used in clinical consultations.  
**Implementation:** Map gestures to viewport operations. Provide on-screen gesture help. Optimize button sizes for touch (min 44px). Support both touch and mouse/keyboard input.

### Pattern 14: Dark Theme with High-Contrast Elements
**Source:** All enterprise PACS, 3D Slicer  
**Pattern:** Dark background (near-black) for image viewing areas to reduce eye strain during long reading sessions. UI chrome in dark grays with high-contrast accent colors for interactive elements.  
**Implementation:** Default dark theme. Ensure text meets WCAG contrast ratios. Use accent colors sparingly for primary actions and active states. Support light theme toggle.

### Pattern 15: Safety Gates with Confirmation and Audit
**Source:** GE Universal Viewer, Localite, clinical PACS  
**Pattern:** Critical operations (finalizing reports, exporting data, applying AI results) require explicit confirmation. All actions logged with user, timestamp, and before/after state. Visual indicators for safety-critical states.  
**Implementation:** Confirmation dialogs with clear action descriptions. Undo capability where possible. Audit log panel showing recent actions. Visual status indicators (color-coded) for system state.

---

## 6. Recommendations

### For DeepSynaps Protocol Studio:

1. **Adopt the 3D Slicer viewport model** — 3 orthogonal views + optional 3D render as the default layout, with color-coded anatomical planes

2. **Implement FSLeyes-style overlay management** — Layer-based panel with per-overlay visibility, opacity, LUT, and threshold controls. This is the most proven pattern for multi-modal neuroimaging data

3. **Use OHIF's extension/mode architecture** — Design for extensibility from day one. Workflow modes (planning, review, stimulation) reconfigure the UI for the specific task

4. **Integrate clinical safety patterns from enterprise PACS** — Audit trails, confirmation dialogs, role-based access, and DICOM compliance are non-negotiable for clinical adoption

5. **Adopt Brainsight/Localite's linear workflow UI** — For neuromodulation planning, a step-by-step progress bar with validation gates matches the clinical mental model

6. **Support scene save/restore** — Connectome Workbench's scene system is invaluable for collaborative research and reproducibility

7. **Design for dark theme first** — Following radiology workstation conventions, default to dark theme with high-contrast elements

8. **Build in structured reporting** — DICOM SR integration from the start, with modality-specific templates (PI-RADS for prostate, etc.)

9. **Implement patient timeline and priors comparison** — Essential for longitudinal studies and clinical follow-up

10. **Support touch and desktop interaction equally** — Tablet use is increasingly common in clinical consultations and at the bedside

---

## Appendix: Comparison Matrix

| Feature | 3D Slicer | OHIF | Philips | GE | FSLeyes | MRIcroGL | Workbench | Brainsight/Localite |
|---------|-----------|------|---------|-----|---------|----------|-----------|---------------------|
| **MPR (3-plane)** | Excellent | Good | Good | Good | Good | Good | Fair | Excellent |
| **3D Rendering** | Excellent | Fair | Good | Good | Limited | Excellent | Fair | Good |
| **Overlay Mgmt** | Excellent | Good | Fair | Fair | Excellent | Good | Excellent | Good |
| **Segmentation** | Excellent | Good | Fair | Fair | Limited | None | None | None |
| **Measurements** | Good | Good | Good | Good | Limited | Limited | Limited | Coordinates only |
| **Annotations** | Good | Good | Good | Good | Limited | Limited | Borders/Foci | Targets only |
| **Key Images** | Screenshots | DICOM KIN | Yes | Yes | No | No | Scenes | Sessions |
| **Structured Reports** | Via ext. | DICOM SR | Via WL | Integrated | No | No | No | Limited |
| **Priors Compare** | Manual | Via HP | Timeline | Timeline | No | No | No | Bookmark |
| **Dark Theme** | Yes | Yes | Yes | Yes | No | No | No | No |
| **Touch Support** | Limited | Yes | Yes | Tablet | No | No | No | No |
| **Scripting/API** | Python | JS/Ext. | Limited | Limited | Python | Python | CLI | Limited |
| **FDA Cleared** | No | No | Yes | Yes | N/A | N/A | N/A | Yes (Localite) |
| **DICOM Support** | Full | Full (web) | Full | Full | No | Read | No | Read |
| **Extensibility** | Excellent | Excellent | Limited | Limited | Good | Good | Good | Limited |

---

*Document compiled from public documentation, academic publications, vendor datasheets, and user guides. All trademarks belong to their respective owners.*
