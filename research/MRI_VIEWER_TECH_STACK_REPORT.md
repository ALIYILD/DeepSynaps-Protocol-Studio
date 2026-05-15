# MRI/Neuroimaging Viewer Technology Stack Report

## Browser-Based Clinical Neuroimaging Viewers -- Comprehensive Technical Evaluation

**Date:** 2025-07  
**Scope:** Evaluation of 10 leading MRI/neuroimaging viewer technologies for browser-based clinical use  
**Classification:** Technical recommendation report

---

## Executive Summary

This report evaluates 10 prominent MRI and neuroimaging viewer technologies suitable for browser-based clinical and research applications. The evaluation spans lightweight embeddable libraries to full PACS-integrated viewer platforms, assessing each across 15 critical dimensions including license compatibility, browser support, DICOM/NIfTI support, multi-planar reconstruction, overlays, annotations, bundle size, integration complexity, and clinical suitability.

### Top 5 Recommended Viewers (Ranked)

| Rank | Viewer | Best For | License | Key Strength |
|------|--------|----------|---------|--------------|
| 1 | **NiiVue** | Neuroimaging embeddable viewer | BSD-2 | Lightweight, 30+ formats, active NIH-funded development |
| 2 | **OHIF Viewer** | Full PACS-integrated clinical viewer | MIT | Most feature-complete DICOMweb viewer, extensive toolset |
| 3 | **Cornerstone3D** | Custom radiology applications | MIT | Foundation of OHIF, excellent 3D/MPR, modern architecture |
| 4 | **VTK.js** | Advanced 3D/volume rendering | BSD-3 | Cinematic volume rendering, WebXR, scientific visualization |
| 5 | **DWV** | Lightweight embeddable viewer | GPL-3 | Minimal footprint, pure JS/HTML5, easy integration |

---

## Table of Contents

1. [Detailed Viewer Evaluations](#1-detailed-viewer-evaluations)
   - [1.1 NiiVue](#11-niivue)
   - [1.2 Cornerstone3D](#12-cornerstone3d)
   - [1.3 OHIF Viewer](#13-ohif-viewer)
   - [1.4 VTK.js](#14-vtkjs)
   - [1.5 DWV (DICOM Web Viewer)](#15-dwv-dicom-web-viewer)
   - [1.6 Papaya](#16-papaya)
   - [1.7 AMI Medical Imaging](#17-ami-medical-imaging)
   - [1.8 BrainBrowser](#18-brainbrowser)
   - [1.9 MRIcroGL](#19-mricrogl)
   - [1.10 3D Slicer](#110-3d-slicer)
   - [1.11 ITK-Wasm](#111-itk-wasm)
   - [1.12 Med3Web](#112-med3web)
2. [Comparative Matrix](#2-comparative-matrix)
3. [Clinical Suitability Analysis](#3-clinical-suitability-analysis)
4. [Integration Recommendations](#4-integration-recommendations)
5. [Final Rankings](#5-final-rankings)
6. [References](#6-references)

---

## 1. Detailed Viewer Evaluations

### 1.1 NiiVue

**GitHub:** https://github.com/niivue/niivue  
**NPM:** `@niivue/niivue`  
**License:** BSD-2-Clause  
**Maintained by:** NiiVue org (Chris Rorden, Taylor Hanayik et al.)  
**Funding:** NIH RF1MH121885  
**Stars:** ~1.5k+  
**Active development:** Very high (2025-2026)

#### Overview
NiiVue is a WebGL 2.0-based medical image viewer designed as the web equivalent of the widely-used MRIcroGL desktop application. It is purpose-built for neuroimaging with support for over 30 volume and mesh formats. NiiVue is moving to a monorepo (`niivue/mono`) with WebGPU and WebGL2 dual support, smaller bundles, and a more extensible architecture planned for v1.0.0.

#### Format Support
- **NIfTI:** Native (.nii, .nii.gz) -- primary format
- **DICOM:** Via plugin (ITK-Wasm loader available, dcm2niix WASM for in-browser DICOM to NIfTI conversion)
- **Other formats:** NRRD, MRtrix MIF, AFNI HEAD/BRIK, MGH/MGZ, ITK MHD, ECAT7, CIFTI, GIFTI, FreeSurfer, VTK, MINC, TIFF, and more (30+ total)

#### Browser Support
- Chrome, Firefox, Safari (WebGL 2.0 required)
- macOS/iOS Safari may need WebGL 2.0 enabled in settings
- Mobile browsers supported (phones, tablets)
- Desktop + mobile cross-platform

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-planar reconstruction | Yes | Axial, coronal, sagittal with crosshairs |
| Overlays | Yes | Multiple layer overlays with independent opacity control |
| Annotation/measurement | Yes | Drawing tools, pen, flood fill, undo/redo |
| Zoom/pan/window-level | Yes | Mouse + keyboard interactions |
| Sequence selector | Via API | Can switch between loaded volumes |
| Slice scrubber | Yes | Mouse wheel, keyboard, slider widgets |
| Key image capture | Yes | `saveScene()` exports WebGL canvas as PNG |
| Side-by-side comparison | Yes | Multiple viewports supported |
| Volume rendering | Yes | 3D volume rendering (WebGL 2.0 3D textures) |
| Mesh/surface support | Yes | GIFTI, FreeSurfer, VTK, STL, OBJ |
| Drawing/segmentation | Yes | Binary drawing with customizable colormaps |
| Document save | Yes | `.nvd` format saves full scene (images, drawings, contrast, crosshairs, annotations) |
| Save as HTML | Yes | `saveHTML()` creates standalone HTML file |

#### Bundle Size
- Core library: ~150-300 KB (estimated, optimized WebGL)
- With meshes/volume rendering: ~500 KB
- Very lightweight compared to Three.js-based alternatives

#### Integration Complexity
- **Low-Medium.** Simple canvas element that can be embedded in any web page.
- Available as: plain JS, React component, Vue component, Jupyter widget (ipyniivue)
- NPM install: `npm install @niivue/niivue`
- No heavy framework dependencies (not built on Three.js -- direct WebGL2 calls)
- API-driven; UI widgets must be built by developer around the canvas

#### Clinical Suitability
- **Research: Excellent** -- adopted by AFNI, brainlife, FreeSurfer, FSL, OpenNeuro
- **Clinical: Good** -- not FDA-cleared; suitable for clinical research and viewing workflows
- Drawing tools allow editing segmentations; scene sharing supports collaboration
- NIH-funded sustained development ensures long-term viability

#### Strengths
- Purpose-built for neuroimaging (not general radiology)
- Direct WebGL2 (not Three.js wrapper) = optimized, battery-efficient rendering
- Smallest bundle among feature-rich viewers
- 30+ format support including mesh visualization
- Active development with NIH funding
- Document save/share (.nvd) enables reproducible scenes

#### Weaknesses
- No built-in DICOMweb/PACS connectivity (must build separately)
- DICOM support requires plugin/WASM layer
- UI components not included (canvas only; build your own buttons/widgets)
- Pre-v1.0 (beta); API may change

---

### 1.2 Cornerstone3D

**GitHub:** https://github.com/cornerstonejs/cornerstone3D  
**Website:** https://cornerstonejs.org  
**License:** MIT  
**Maintained by:** Cornerstone.js community (OHIF ecosystem)  
**Active development:** Very high (2024-2025)

#### Overview
Cornerstone3D is the next-generation rendering engine that powers OHIF v3. It was rebuilt from the ground up to address limitations of the original Cornerstone (2D only) and the vtk.js-based react-vtkjs-viewport approach. Uses a single WebGL canvas for offscreen processing with efficient GPU texture sharing across viewports.

#### Format Support
- **DICOM:** Full native support via cornerstoneWADOImageLoader
- **NIfTI:** Via ITK-Wasm image loader plugin
- **Other formats:** Supports any format via pluggable image loaders

#### Browser Support
- Chrome, Firefox, Safari, Edge (WebGL required)
- Modern browsers only
- Mobile support via responsive design

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-planar reconstruction | Yes | Full MPR with crosshairs, axial/coronal/sagittal |
| Overlays | Yes | PET/CT fusion, multiple layers |
| Annotation/measurement | Yes | Length, angle, ellipse, rectangle ROI, probe |
| Zoom/pan/window-level | Yes | Full toolset |
| Sequence selector | Yes | Series thumbnail browser |
| Slice scrubber | Yes | Scroll, cine playback |
| Key image capture | Yes | Screenshot/export tools |
| Side-by-side comparison | Yes | Hanging protocols for multi-study comparison |
| Segmentation (2D/3D) | Yes | Labelmap editing, contour rendering, surface in 3D viewport |
| Volume rendering | Yes | 3D volume rendering with transfer functions |
| Video viewport | Yes | Video with annotation support |
| Slide microscopy | Yes | WSI viewport via DICOM Microscopy Viewer |
| Structured reporting | Via DICOM SR | SR rendering support |

#### Bundle Size
- Core + tools: ~1-2 MB
- With all rendering modules: ~3-5 MB
- VoxelManager in v2.0 cut memory usage ~50%

#### Integration Complexity
- **Medium.** Modern ES module architecture with TypeScript support.
- Framework-agnostic: works with React, Vue, Angular, Vite
- Requires setup of image loaders, tool configuration, tool groups
- Cornerstone3D 2.0 introduced breaking API changes (migration required from v1)
- Extensive documentation and migration guides available

#### Clinical Suitability
- **Clinical: Excellent** -- foundation of OHIF, used in clinical research worldwide
- NCI-funded development (U24 CA199460)
- Not FDA-cleared itself but powers cleared applications
- Full segmentation support for radiotherapy planning workflows

#### Strengths
- Single WebGL context = efficient GPU memory sharing (solves WebGL context limit)
- Modern TypeScript/ES module architecture
- Viewport-centric segmentation model (v2.0)
- Integrates seamlessly with OHIF
- Excellent DICOMweb support
- Strong community and documentation

#### Weaknesses
- API breaking changes between v1 and v2.0
- Heavier than NiiVue for neuroimaging-specific use
- Requires more boilerplate to set up than NiiVue
- Primarily radiology-focused, not neuroimaging-specialized

---

### 1.3 OHIF Viewer

**GitHub:** https://github.com/OHIF/Viewers  
**Website:** https://ohif.org  
**License:** MIT  
**Maintained by:** Open Health Imaging Foundation  
**Stars:** ~4.2k+  
**Active development:** Very high (10+ year project)

#### Overview
OHIF is a full-featured, zero-footprint DICOMweb viewer built on React and Cornerstone3D. It provides a complete clinical imaging workstation in the browser with PACS integration via DICOMweb protocols (QIDO-RS, WADO-RS, STOW-RS). OHIF v3.9 (Nov 2024) integrates Cornerstone3D 2.0 with advanced segmentation, video annotation, and slide microscopy.

#### Format Support
- **DICOM:** Full native support via DICOMweb and local file loading
- **NIfTI:** Via ITK-Wasm converter (DICOM to NIfTI conversion supported)
- **Other:** Supports all formats Cornerstone3D supports via plugins

#### Browser Support
- Chrome, Firefox, Safari, Edge (modern browsers)
- Zero-footprint (no installation required)
- Desktop optimized; tablet support available

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-planar reconstruction | Yes | Full MPR with crosshairs |
| Overlays | Yes | Full overlay support, fusion |
| Annotation/measurement | Yes | Comprehensive toolset |
| Zoom/pan/window-level | Yes | Complete |
| Sequence selector | Yes | Study browser with series thumbnails |
| Slice scrubber | Yes | Smooth scroll, cine |
| Key image capture | Yes | Export/snapshot tools |
| Side-by-side comparison | Yes | Hanging protocols for multi-study |
| 3D volume rendering | Yes (cloud) | Available with demo cases; local 3D still developing |
| Segmentation | Yes | 2D/3D labelmap editing, surface rendering |
| DICOMweb integration | Yes | Full QIDO/WADO/STOW support |
| PACS connectivity | Yes | Direct DICOMweb PACS integration |
| Worklist | Yes | Study list with filtering |
| Extensions/plugins | Yes | Modular extension system |
| User authentication | Yes | OpenID Connect support |

#### Bundle Size
- App bundle: ~6.2 MB (main JS bundle ~6 MB + WASM modules)
- DICOM microscopy viewer: ~2.3 MB
- Not lightweight; full application viewer

#### Integration Complexity
- **High.** Full application with its own React-based UI.
- Can be embedded as `<script>` tag or integrated as React component
- Requires DICOMweb server (e.g., Orthanc) for full functionality
- Extension system allows custom workflows and UI modifications
- Configuration-driven deployment
- Yarn workspaces for development

#### Clinical Suitability
- **Clinical: Excellent** -- most feature-complete open source web viewer
- Used by Dana Farber Cancer Institute, NCI Imaging Data Commons
- MIT license allows commercial use and modification
- Not FDA-cleared; must seek clearance for clinical diagnostic use
- MONAI Label integration for AI-assisted annotation

#### Strengths
- Most comprehensive feature set among evaluated viewers
- Active 10-year development history
- Strong funding (NCI ITCR, Chan Zuckerberg Initiative)
- DICOMweb-native architecture
- Extensible plugin framework
- Full PACS integration capability
- Hanging protocols for comparison workflows

#### Weaknesses
- Large bundle size (~6 MB)
- Requires DICOMweb backend for full functionality
- React-specific (harder to embed in non-React apps)
- 3D rendering features limited with local DICOM files (needs cloud)
- Complex setup and configuration

---

### 1.4 VTK.js

**GitHub:** https://github.com/Kitware/vtk-js  
**Website:** https://kitware.github.io/vtk-js  
**License:** BSD-3-Clause  
**Maintained by:** Kitware Inc.  
**Active development:** High (WebGPU migration underway)

#### Overview
VTK.js is the JavaScript implementation of the Visualization Toolkit (VTK), a premier open-source system for 3D computer graphics, image processing, and visualization. It provides scientific-quality volume rendering with cinematic rendering capabilities, WebXR support, and a wide variety of visualization algorithms.

#### Format Support
- **DICOM:** Via ITK-Wasm integration
- **NIfTI:** Via NIFTI-Reader-JS
- **Other formats:** VTI, VTP, STL, OBJ, PLY, and VTK native formats
- Full ITK format support via WASM bridge

#### Browser Support
- Chrome, Firefox, Safari, Edge (WebGL 2.0)
- WebGPU support in development (future-proof)
- WebXR for VR/AR headsets

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-planar reconstruction | Yes | MPR with arbitrary reslicing |
| Volume rendering | Excellent | Cinematic volume rendering with gradient shading |
| Overlays | Yes | Multiple overlays supported |
| Annotation/measurement | Limited | Via Cornerstone integration or custom tools |
| Zoom/pan/window-level | Yes | Full navigation |
| 3D rendering | Excellent | Best-in-class for scientific/medical 3D |
| WebXR/VR/AR | Yes | Direct VR headset support |
| Cinematic rendering | Yes | Gradient-based shading, ambient occlusion |
| GPU acceleration | Yes | WebGL2 + WebGPU coming |

#### Bundle Size
- Core: ~500 KB - 1 MB
- With volume rendering: ~1-2 MB
- Full feature set: ~3-5 MB

#### Integration Complexity
- **Medium-High.** Scientific visualization library requiring domain knowledge.
- ES6 class library; framework-agnostic
- Often used via higher-level wrappers (e.g., Cornerstone3D, OHIF)
- Requires understanding of VTK pipeline architecture
- Excellent documentation and examples

#### Clinical Suitability
- **Clinical: Good (as rendering backend)**
- Not a standalone clinical viewer
- Best used as rendering engine within a larger application
- Kitware provides commercial support
- Powers cinematic rendering in major platforms

#### Strengths
- Best-in-class 3D/cinematic volume rendering
- WebXR support for VR/AR clinical applications
- Scientific computing heritage (30+ years)
- WebGPU migration ahead of curve
- Local ambient occlusion, gradient shading
- Commercial support available from Kitware

#### Weaknesses
- Not a complete viewer (rendering engine only)
- No built-in DICOMweb, annotations, or clinical tools
- WebGL context limit (max 16 per tab) can be problematic
- Steep learning curve for VTK pipeline model
- Requires integration with tool libraries for full viewer functionality

---

### 1.5 DWV (DICOM Web Viewer)

**GitHub:** https://github.com/ivmartel/dwv  
**Website:** https://ivmartel.github.io/dwv  
**License:** GNU GPL-3.0  
**Maintained by:** ivmartel (open source)  
**Stars:** ~1.3k+  
**Active development:** Moderate

#### Overview
DWV is a lightweight, zero-footprint medical image viewer written in pure JavaScript and HTML5. It runs entirely in the browser without plugins and supports loading local or remote DICOM data. DWV provides essential viewing tools including window/level, zoom, pan, scroll, measurements, and annotations.

#### Format Support
- **DICOM:** Native primary support (.dcm, DICOMDIR)
- **NIfTI:** Via extension/plugins
- **Other formats:** Limited (primarily DICOM-focused)

#### Browser Support
- All modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers supported
- Responsive design
- Tablet and phone compatible

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-planar reconstruction | No | 2D viewing primarily |
| Overlays | Basic | Patient info, DICOM tag overlay |
| Annotation/measurement | Yes | Distance, angle, ellipse, rectangle, arrow |
| Zoom/pan/window-level | Yes | Full support |
| Sequence selector | Yes | Series browsing |
| Slice scrubber | Yes | Scroll through slices |
| Key image capture | Yes | Screenshot capability |
| Side-by-side comparison | Limited | Basic layout options |
| DICOM tag browser | Yes | Full metadata inspection |
| Drawing tools | Yes | Region drawing, freehand |
| Image filters | Yes | Threshold, sharpening, sobel |

#### Bundle Size
- Core: ~200-500 KB
- Very lightweight for DICOM viewing

#### Integration Complexity
- **Low.** Embeddable web component.
- Available as: vanilla JS, Angular, React, Vue integrations
- Simple `<script>` tag embed possible
- Web workers for DICOM parsing (separate files needed)
- Simple API for tool activation

#### Clinical Suitability
- **Research: Good** -- suitable for basic clinical viewing
- **Clinical: Limited** -- not FDA-cleared; lacks MPR, 3D
- Best for: Teaching, QA/debugging (excellent DICOM tag browser), lightweight portals
- GPL-3.0 license may limit commercial integration

#### Strengths
- Extremely lightweight
- Pure JavaScript/HTML5 (no WebGL dependencies)
- Excellent DICOM parsing and tag inspection
- Multiple framework integrations available
- Easy to embed in existing web apps
- Responsive/mobile-friendly

#### Weaknesses
- No MPR or 3D rendering (2D only)
- No volume rendering
- Limited format support (primarily DICOM)
- GPL-3.0 license (copyleft -- may restrict commercial use)
- Less active development than NiiVue/OHIF
- No PACS/DICOMweb integration (local files or URLs only)

---

### 1.6 Papaya

**GitHub:** https://github.com/rii-mango/Papaya  
**Website:** http://rii-mango.github.io/Papaya  
**License:** MIT/BSD (varies by component)  
**Maintained by:** UTHSCSA (rii-mango)  
**Funding:** NIH (P01-EB01955, R01-MH074457, R01-EB015314)  
**Active development:** Stalled/suspended

#### Overview
Papaya is a pure JavaScript medical research image viewer originally developed for neuroimaging. It supports DICOM and NIfTI formats with multi-planar views, overlays, atlases, GIFTI surface data, and DTI data. Note: Development has been suspended. WebGL1-based architecture lacks 3D texture support.

#### Format Support
- **NIfTI:** Native primary support (.nii, .nii.gz)
- **DICOM:** Via conversion (not native)
- **Other formats:** GIFTI surfaces, DTI, atlas volumes, CIFTI

#### Browser Support
- Chrome, Firefox, Safari, Edge (WebGL 1.0)
- Broad compatibility (older WebGL support)

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-planar reconstruction | Yes | Axial, coronal, sagittal |
| Overlays | Yes | Atlas overlays, statistical maps |
| Annotation/measurement | Limited | Basic tools |
| Zoom/pan/window-level | Yes | Full support |
| Sequence selector | Yes | Volume switching |
| Slice scrubber | Yes | Keyboard + mouse scroll |
| Surface/GIFTI viewing | Yes | Surface data support |
| Atlas integration | Yes | Built-in atlas support |

#### Bundle Size
- ~500 KB - 1 MB (pure JS, no external framework deps)

#### Integration Complexity
- **Low-Medium.** Configurable JavaScript embed.
- Run on web server or as local file
- Highly configurable UI (display, menu, control options)
- Plugin system for extensions

#### Clinical Suitability
- **Research: Good (legacy)** -- many published studies
- **Clinical: Not recommended** -- development suspended
- Succeeded by NiiVue (same team, Chris Rorden)

#### Strengths
- Pure JavaScript (no framework dependencies)
- Good neuroimaging feature set for its era
- Surface and atlas support
- Configurable UI
- Long track record in published research

#### Weaknesses
- **Development suspended** (superseded by NiiVue)
- WebGL1 only (no 3D textures, inferior volume rendering)
- DICOM support limited (requires conversion)
- No active maintenance or updates
- Not recommended for new projects

---

### 1.7 AMI Medical Imaging

**GitHub:** https://github.com/FNNDSC/ami  
**License:** MIT  
**Maintained by:** FNNDSC (Boston Children's Hospital)  
**Active development:** Low (stalled ~2020)

#### Overview
AMI (Advanced Medical Imaging) is a JavaScript toolkit for medical imaging built on top of Three.js. It provides 2D/3D visualization, volume rendering, and support for DICOM, NRRD, and NIfTI formats.

#### Format Support
- **DICOM:** Via dicomParser
- **NIfTI:** Via NIFTI-Reader-JS
- **NRRD:** Via NRRD-JS
- **Meshes:** VTK, STL, FSM, TRK (tractography)

#### Browser Support
- Chrome, Firefox, Safari, Edge (WebGL via Three.js)
- Desktop browsers primarily

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| 2D visualization | Yes | Stack-based viewing |
| 3D visualization | Yes | Three.js based |
| Volume rendering | Yes | Via Three.js |
| Label maps | Yes | Segmentation overlay |
| Mesh rendering | Yes | VTK, STL, TRK |
| Lookup tables | Limited | Planned features |
| Widgets | Partial | Handle, probe, ruler (2D/3D) |

#### Bundle Size
- With Three.js dependency: ~2-3 MB total

#### Integration Complexity
- **Medium.** Requires Three.js knowledge.
- Must load Three.js before AMI
- ES2015 promises required
- Babel transforms may be needed

#### Clinical Suitability
- **Research: Limited** -- stalled development
- Not recommended for clinical use
- No active maintenance
- Many planned features incomplete

#### Strengths
- Built on Three.js ecosystem
- Multiple format support
- TRK tractography support

#### Weaknesses
- **Development essentially stalled**
- Many features marked "in progress" or "on roadmap" never completed
- Three.js dependency adds weight
- No DICOMweb support
- Not recommended for new projects

---

### 1.8 BrainBrowser

**GitHub:** https://github.com/aces/brainbrowser  
**Website:** https://brainbrowser.cbrain.mcgill.ca  
**Maintained by:** McGill Centre for Integrative Neuroscience  
**License:** Not prominently stated (assumed open source)  
**Active development:** Low

#### Overview
BrainBrowser is a set of web-based 3D visualization tools primarily for neuroimaging, developed at McGill University. It has two main components: the Surface Viewer (WebGL-based 3D surface display) and the Volume Viewer (HTML5 canvas-based slice navigation).

#### Format Support
- **NIfTI:** Via NIFTI-Reader-JS (volume viewer)
- **MGH/MGZ:** FreeSurfer formats
- **MINC:** Native volume format
- **Surfaces:** MNI OBJ, FreeSurfer binary/ASC, Wavefront OBJ

#### Browser Support
- Chrome, Firefox, Safari, Edge
- WebGL for Surface Viewer
- HTML5 Canvas for Volume Viewer

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-planar reconstruction | Yes | Sagittal, transverse, coronal |
| Surface rendering | Yes | WebGL-based real-time surfaces |
| Overlay mapping | Yes | Color data on surfaces |
| 4D data support | Yes | Time dimension for fMRI |
| Color maps | Yes | Multiple colormaps |
| Mouse/touch controls | Yes | Rotate, pan, zoom |

#### Bundle Size
- ~300-800 KB estimated

#### Integration Complexity
- **Low-Medium.** JavaScript library embed.
- Used in CBRAIN and LORIS platforms
- Can load local or remote data

#### Clinical Suitability
- **Research: Good** -- used in major neuroimaging platforms (CBRAIN, LORIS)
- **Clinical: Limited** -- no DICOM, no clinical tools
- MINC-focused (neuroimaging research format)

#### Strengths
- Purpose-built for neuroimaging research
- Surface + volume viewers
- Used in production neuroimaging platforms
- Educational/research proven

#### Weaknesses
- No DICOM support
- Limited format support (neuroimaging-specific)
- Low active development
- No clinical annotation/measurement tools
- No volume rendering (canvas-based 2D only)

---

### 1.9 MRIcroGL

**Website:** https://www.nitrc.org/projects/mricrogl  
**Maintained by:** Chris Rorden  
**License:** BSD  
**Platform:** Desktop application (not primarily browser-based)

#### Overview
MRIcroGL is a desktop application for viewing medical images (not just MRI -- also CT, etc.). It includes a graphical interface for dcm2niix to convert DICOM to NIfTI. While primarily a desktop tool, it can export web-compatible visualizations. It is the desktop predecessor to NiiVue.

#### Format Support
- **NIfTI:** Native primary format
- **DICOM:** Via dcm2niix conversion tool included
- **Other:** VTK, AFNI, CIFTI, GIFTI, and more

#### Browser Support
- Desktop: Windows, macOS, Linux
- Web export capability for sharing scenes

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-planar reconstruction | Yes | Full MPR |
| Volume rendering | Yes | Desktop GPU-accelerated |
| Overlays | Yes | Statistical map overlays |
| Mesh viewing | Yes | Surface rendering |
| DICOM conversion | Yes | dcm2niix GUI included |
| Scene export | Yes | Can export for web viewing |

#### Clinical Suitability
- **Research: Excellent** -- one of the most widely used neuroimaging viewers
- **Clinical: N/A** (desktop tool, not browser-based)
- Referenced for its web export capability

#### Note
MRIcroGL is included for completeness as it is the desktop ancestor of NiiVue and remains widely used. For browser-based deployment, **NiiVue** is its direct web equivalent.

---

### 1.10 3D Slicer

**Website:** https://www.slicer.org  
**GitHub:** https://github.com/Slicer/Slicer  
**License:** BSD (with some Apache/MIT components)  
**Maintained by:** 3D Slicer community  
**Active development:** Very high (extensive extension ecosystem)

#### Overview
3D Slicer is an open-source, desktop-based medical image computing platform for advanced visualization, segmentation, registration, and quantitative analysis. While primarily a desktop application, it can be integrated into web workflows via server-side rendering, XNAT-OHIF integration, and MONAI Label plugins.

#### Format Support
- **DICOM:** Full native support (import, query, retrieve, store)
- **NIfTI:** Full native support
- **Other:** Nearly all medical imaging formats (100+ extensions)

#### Browser Support
- Desktop application: Windows, macOS, Linux
- Web integration via: SlicerWeb (experimental), XNAT, MONAI Label OHIF plugin

#### Feature Assessment (Desktop)

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-planar reconstruction | Yes | Full MPR with crosshairs |
| 3D volume rendering | Yes | GPU-accelerated volume rendering |
| Segmentation | Excellent | Editor, Grow from seeds, AI-assisted |
| Registration | Yes | Rigid, deformable, landmark-based |
| Quantitative analysis | Yes | Measurement, statistics, modeling |
| DICOM networking | Yes | Query/retrieve from PACS |
| Extensions | 100+ | Radiomics, AI, surgical navigation |

#### Integration Complexity
- **High (for web).** Desktop application primarily.
- Web integration paths:
  - XNAT-OHIF: View Slicer-processed data in OHIF
  - MONAI Label: AI annotation via 3D Slicer + OHIF
  - SlicerWeb: Experimental web interface
  - DICOM export: Process in Slicer, view results in web viewer

#### Clinical Suitability
- **Clinical: Excellent** -- used in clinical research, surgical planning, radiotherapy
- **For web:** Integration-only, not a standalone web viewer
- Extensive clinical validation in published literature

#### Note
3D Slicer is included as an integration option rather than a standalone browser viewer. It is best used as a backend processing/analytics engine paired with a web viewer (OHIF, NiiVue) for display.

---

### 1.11 ITK-Wasm

**GitHub:** https://github.com/InsightSoftwareConsortium/itk-wasm  
**NPM:** `itk-wasm`, `@itk-wasm/dicom`, `@itk-wasm/image-io`  
**License:** Apache 2.0  
**Maintained by:** Insight Software Consortium / Kitware  
**Active development:** High

#### Overview
ITK-Wasm brings the Insight Toolkit (ITK) to the browser via WebAssembly. It provides DICOM reading, image processing, and format conversion capabilities. ITK-Wasm is not a viewer itself but a critical infrastructure component that enables DICOM support in viewers like NiiVue.

#### Format Support
- **DICOM:** Comprehensive via @itk-wasm/dicom (DCMTK-based)
- **NIfTI:** Via @itk-wasm/image-io
- **Other:** 50+ image formats supported

#### Functionality
- DICOM image reading (CT, MR, PET, US, etc.)
- DICOM structured reports (SR)
- Presentation state processing
- Image format conversion
- Anti-aliasing, filtering, downsampling

#### Integration Complexity
- **Medium.** WASM-based; requires proper asset loading.
- IO modules split into separate npm packages to limit size
- Node.js and browser APIs available
- Used as plugin/loader for viewers (not standalone viewer)

#### Clinical Suitability
- **Infrastructure component** -- enables clinical viewers
- Powers DICOM support in NiiVue, OHIF ecosystem
- Commercial support available from Kitware

---

### 1.12 Med3Web

**GitHub:** https://github.com/epam/med3web  
**License:** Apache 2.0  
**Maintained by:** EPAM Systems  
**Stars:** ~200+  
**Active development:** Low (last major update ~2021)

#### Overview
Med3Web is a high-performance web tool for 2D and 3D medical visualization using Three.js, XTK, and DICOM parser libraries. Supports DICOM, NIfTI, KTX, and HDR formats.

#### Format Support
- **DICOM:** Via dicomParser and Daikon
- **NIfTI:** Native support
- **Other:** KTX, HDR

#### Feature Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| 2D viewing | Yes | Basic MPR |
| 3D rendering | Yes | Isosurface, volume, MIP |
| Measurements | Yes | Distance, angle, area |
| DICOM tag browser | Yes | |
| Volume clipping | Yes | Real-time clip planes |
| Transfer function | Yes | Real-time adjustment |

#### Bundle Size
- ~2-3 MB (with Three.js)

#### Clinical Suitability
- **Research: Limited** -- low active development
- Apache 2.0 license
- Built on older Three.js patterns (3D texture workaround)
- Not recommended for new projects (better alternatives: NiiVue, OHIF)

---

## 2. Comparative Matrix

### Feature Comparison

| Feature | NiiVue | Cornerstone3D | OHIF | VTK.js | DWV | Papaya | AMI | BrainBrowser |
|---------|--------|--------------|------|--------|-----|--------|-----|--------------|
| **License** | BSD-2 | MIT | MIT | BSD-3 | GPL-3 | MIT/BSD | MIT | ~Open |
| **DICOM** | Via plugin | Native | Native | Via ITK | Native | Via conv | Via parser | No |
| **NIfTI** | Native | Via plugin | Via conv | Via reader | No | Native | Native | Native |
| **MPR (ax/cor/sag)** | Yes | Yes | Yes | Yes | No | Yes | Yes | Yes |
| **Overlays** | Yes | Yes | Yes | Yes | Basic | Yes | Yes | Yes |
| **Annotations** | Yes | Yes | Yes | Limited | Yes | Limited | Partial | No |
| **Measurements** | Drawing | Yes | Yes | Limited | Yes | Basic | Partial | No |
| **Zoom/Pan/WL** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Slice scrubber** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Key image capture** | Yes | Yes | Yes | Yes | Yes | No | No | No |
| **Side-by-side compare** | Yes | Yes | Yes | No | Limited | No | No | No |
| **Volume rendering** | Yes | Yes | Yes | Yes | No | No | Yes | No |
| **Segmentation** | Yes | Yes | Yes | No | No | No | Partial | No |
| **DICOMweb/PACS** | No | Native | Native | No | No | No | No | No |
| **Mesh viewing** | Yes | Limited | Limited | Yes | No | Yes | Yes | Yes |
| **WebXR/VR** | No | No | No | Yes | No | No | No | No |
| **Bundle size** | ~300KB | ~1-3MB | ~6MB | ~1-3MB | ~300KB | ~500KB | ~2-3MB | ~500KB |
| **Active dev** | High | High | High | High | Moderate | Stalled | Stalled | Low |

### Integration Complexity Ranking

| Viewer | Complexity | Time to Integrate | Framework Dependencies |
|--------|-----------|-------------------|----------------------|
| DWV | Low | Hours | None (vanilla JS) |
| NiiVue | Low-Medium | 1-2 days | None (React/Vue components available) |
| Papaya | Low-Medium | 1-2 days | None |
| BrainBrowser | Low-Medium | 1-2 days | None |
| VTK.js | Medium | 2-5 days | None (rendering engine) |
| AMI | Medium | 2-5 days | Three.js |
| Med3Web | Medium | 2-5 days | Three.js |
| Cornerstone3D | Medium | 3-7 days | ES modules, TypeScript |
| OHIF | High | 1-3 weeks | React, DICOMweb backend |
| 3D Slicer | High | Weeks | Desktop + web bridge |

### Clinical Suitability Score

| Viewer | Clinical Research | Clinical Practice | FDA Pathway | Overall |
|--------|------------------|-------------------|-------------|---------|
| OHIF | 10/10 | 7/10 | MIT license | **9/10** |
| Cornerstone3D | 9/10 | 7/10 | MIT license | **8.5/10** |
| NiiVue | 9/10 | 6/10 | BSD-2 license | **8/10** |
| VTK.js | 7/10 | 5/10 | BSD-3 license | **6.5/10** |
| DWV | 5/10 | 4/10 | GPL-3 license | **5/10** |
| 3D Slicer | 9/10 | 8/10 | BSD license | **8.5/10** (desktop) |
| Papaya | 5/10 | 2/10 | MIT/BSD | **4/10** (legacy) |
| AMI | 3/10 | 2/10 | MIT | **3/10** (stalled) |
| BrainBrowser | 5/10 | 2/10 | Open | **4/10** |
| Med3Web | 4/10 | 3/10 | Apache 2.0 | **4/10** |

---

## 3. Clinical Suitability Analysis

### For Clinical Research / Academic Use

**Best options:**
1. **OHIF Viewer** -- Most comprehensive, DICOMweb-native, strong for multi-site clinical trials
2. **NiiVue** -- Excellent for neuroimaging-specific research, lightweight, format-rich
3. **Cornerstone3D** -- Best for custom research applications requiring full 3D/segmentation
4. **3D Slicer + OHIF integration** -- For advanced analysis with web-based viewing

### For Clinical Practice / Diagnostic Use

**Best options:**
1. **OHIF Viewer** -- Full clinical workstation feature set, PACS integration
2. **Cornerstone3D** -- For building custom clinical applications
3. **NiiVue** -- For neuroimaging-focused viewing (supplemental viewer)

**Important:** None of these open-source viewers are FDA-cleared for diagnostic use. Commercial clearance or 510(k) submission would be required for primary diagnostic use in the United States.

### For Teaching / Education

**Best options:**
1. **NiiVue** -- Easy to embed in educational web pages, scene sharing
2. **DWV** -- Zero-footprint, works on any device, simple
3. **BrainBrowser** -- Purpose-built for educational neuroimaging platforms

### For AI/ML Integration

**Best options:**
1. **OHIF + MONAI Label** -- Full AI annotation and model deployment pipeline
2. **NiiVue** -- Drawing tools for editing AI segmentations, scene documentation
3. **Cornerstone3D** -- Segmentation rendering and editing for AI workflows

---

## 4. Integration Recommendations

### Architecture Patterns

#### Pattern A: Lightweight Neuroimaging Viewer (Recommended for most projects)
```
NiiVue (viewer) + ITK-Wasm (DICOM I/O) + Custom UI
- Bundle: ~500KB-1MB
- License: BSD-2 + Apache 2.0
- Best for: Neuroimaging research, embedded viewers
```

#### Pattern B: Full Clinical Workstation
```
OHIF Viewer (full app) + Cornerstone3D (rendering) + Orthanc (DICOMweb server)
- Bundle: ~6MB+
- License: MIT
- Best for: Clinical practice, PACS integration, clinical trials
```

#### Pattern C: Custom Radiology Application
```
Cornerstone3D (rendering engine) + Custom React/Vue UI + DICOMweb backend
- Bundle: ~2-3MB
- License: MIT
- Best for: Custom clinical workflows, AI integration
```

#### Pattern D: Advanced 3D Visualization
```
VTK.js (rendering) + Cornerstone3D (tools/annotations) + OHIF (UI framework)
- Bundle: ~4-6MB
- License: BSD-3 + MIT
- Best for: Surgical planning, 3D printing, VR/AR applications
```

### Recommended Stack by Use Case

| Use Case | Primary Viewer | Supporting Libraries | Backend |
|----------|---------------|---------------------|---------|
| Neuroimaging research portal | NiiVue | ITK-Wasm (DICOM) | Node.js/Python |
| Clinical PACS viewer | OHIF | Cornerstone3D | Orthanc/DICOMweb PACS |
| Custom radiology app | Cornerstone3D | dcmjs, dicomParser | DICOMweb server |
| AI-assisted annotation | OHIF + MONAI | N/A | MONAI Label server |
| 3D surgical planning | VTK.js + OHIF | Cornerstone3D | DICOMweb + 3D Slicer |
| Teaching platform | NiiVue | Custom UI | Static hosting |
| Embedded image viewer | DWV | None needed | Static hosting |
| VR/AR medical imaging | VTK.js | WebXR | DICOMweb server |

---

## 5. Final Rankings

### Top 5 Recommended Viewers

#### #1: NiiVue
**Best for:** Neuroimaging research, embeddable viewers, multi-format support  
**Why:** Purpose-built for neuroimaging, smallest bundle, 30+ formats, NIH-funded, active development, BSD-2 license (most permissive), document sharing capability  
**When to choose:** You need a lightweight, neuroimaging-focused viewer that supports NIfTI natively and can be embedded in any web application  
**Caution:** DICOM requires plugin; no built-in PACS connectivity; UI components must be built separately

#### #2: OHIF Viewer
**Best for:** Full clinical workstation, PACS integration, clinical trials  
**Why:** Most feature-complete open-source web viewer, DICOMweb-native, extensive toolset, strong community, MIT license, 10-year track record  
**When to choose:** You need a complete clinical imaging workstation with PACS integration  
**Caution:** Large bundle (~6MB); requires DICOMweb backend; React-specific; complex setup

#### #3: Cornerstone3D
**Best for:** Custom radiology applications, 3D visualization, segmentation workflows  
**Why:** Modern architecture, efficient GPU memory, excellent MPR/segmentation, powers OHIF, MIT license  
**When to choose:** You're building a custom viewer and need full control over the rendering pipeline  
**Caution:** Requires significant development effort; API changes between versions

#### #4: VTK.js
**Best for:** Advanced 3D rendering, cinematic volume rendering, VR/AR applications  
**Why:** Best-in-class 3D rendering, WebXR support, scientific computing heritage, WebGPU migration  
**When to choose:** You need cinematic-quality 3D rendering or VR/AR clinical visualization  
**Caution:** Rendering engine only; needs integration with tools/UI; learning curve

#### #5: DWV
**Best for:** Lightweight DICOM viewing, teaching, basic embeddable viewer  
**Why:** Minimal footprint, pure JS/HTML5, easy to embed, responsive design  
**When to choose:** You need the simplest possible DICOM viewer for basic viewing tasks  
**Caution:** No 3D/MPR; GPL-3 license; limited active development

---

## 6. Decision Framework

```
Is your use case neuroimaging-focused?
  YES -> Do you need PACS integration?
    YES -> OHIF Viewer (#2)
    NO  -> NiiVue (#1)
  NO  -> Do you need full clinical workstation?
    YES -> OHIF Viewer (#2)
    NO  -> Do you need advanced 3D/VR?
      YES -> VTK.js (#4)
      NO  -> Do you need custom app?
        YES -> Cornerstone3D (#3)
        NO  -> DWV (#5)
```

---

## 7. References

1. NiiVue GitHub Repository: https://github.com/niivue/niivue
2. NiiVue Documentation: https://niivue.com/docs
3. Cornerstone3D Documentation: https://cornerstonejs.org
4. OHIF Viewer: https://github.com/OHIF/Viewers
5. OHIF Website: https://ohif.org
6. VTK.js Documentation: https://kitware.github.io/vtk-js/docs/
7. DWV GitHub: https://github.com/ivmartel/dwv
8. Papaya: https://github.com/rii-mango/Papaya
9. AMI Medical Imaging: https://github.com/FNNDSC/ami
10. BrainBrowser: https://github.com/aces/brainbrowser
11. MRIcroGL: https://www.nitrc.org/projects/mricrogl
12. 3D Slicer: https://www.slicer.org
13. ITK-Wasm: https://wasm.itk.org
14. Med3Web: https://github.com/epam/med3web
15. OHIF v3.9 Release Notes: https://ohif.org/release-notes/3p9/
16. Web-Based DICOM Viewers Survey (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC12092310/
17. Brainchop Paper (Aperture Neuro): https://apertureneuro.org/article/123059
18. Kitware VTK.js Medical Visualization: https://www.kitware.com/delivering-innovation-in-medical-image-visualization/
19. ITK-Wasm DICOM Support: https://www.kitware.com/reading-dicom-images-and-non-image-sop-classes-in-javascript-and-python/
20. NiiVue Drawing Documentation: https://niivue.com/docs/drawing/

---

*Report generated July 2025. All information based on publicly available documentation and source code repositories. License terms and features subject to change. Verify current status before making architectural decisions.*
