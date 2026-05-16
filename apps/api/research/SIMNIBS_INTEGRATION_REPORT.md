# DeepSynaps Protocol Studio: SimNIBS Integration Report
## Computational Neuromodulation Simulation & MRI-Guided Stimulation Planning

**Document ID**: DSPS-SIMNIBS-REPORT-001  
**Version**: 1.0.0  
**Date**: 2025-07-22  
**Status**: PHASE 1 - Knowledge Layer Research  
**Classification**: Internal Technical Document  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [SimNIBS Architecture](#2-simnibs-architecture)
3. [Simulation Pipeline](#3-simulation-pipeline)
4. [TMS Modeling](#4-tms-modeling)
5. [tDCS/tACS/tRNS Modeling](#5-tdcsacstrns-modeling)
6. [Alternative Tools (ROAST, etc.)](#6-alternative-tools-roast-etc)
7. [DeepSynaps Integration Architecture](#7-deepsynaps-integration-architecture)
8. [Async Pipeline Design](#8-async-pipeline-design)
9. [Provenance & Confidence Model](#9-provenance--confidence-model)
10. [Clinical Safety Rules](#10-clinical-safety-rules)
11. [Implementation Recommendations](#11-implementation-recommendations)
12. [Risks & Mitigations](#12-risks--mitigations)

---

## 1. Executive Summary

SimNIBS (Simulation of Non-Invasive Brain Stimulation) is the industry-standard open-source software package for realistic electric field modeling of transcranial brain stimulation. Version 4.6.0 represents the current stable release, licensed under GPL v3, and developed by an international consortium led by the Danish Research Centre for Magnetic Resonance.

This report provides comprehensive technical guidance for integrating SimNIBS into the DeepSynaps Protocol Studio as the primary computational backend for electric field simulation across all supported neuromodulation modalities: **tDCS (transcranial Direct Current Stimulation), tACS (transcranial Alternating Current Stimulation), tRNS (transcranial Random Noise Stimulation), and TMS (Transcranial Magnetic Stimulation).**

### Key Findings

| Dimension | Finding |
|-----------|---------|
| **Core Technology** | Finite Element Method (FEM) with tetrahedral meshes, first-order linear basis functions |
| **Segmentation** | CHARM pipeline (v4.0+) using probabilistic atlas with deep learning surface reconstruction |
| **Solvers** | PETSc (default iterative), PARDISO (direct, faster but memory-intensive), MUMPS (Apple Silicon) |
| **API** | Python 3.11 + MATLAB interfaces; GUI (simnibs_gui) for interactive use |
| **Mesh Format** | Binary Gmsh v2 (.msh) with first-order triangles and tetrahedra |
| **Optimization** | ADM for TMS coil placement; leadfield-based and leadfield-free for TES electrode optimization |
| **Performance** | Head meshing: ~1-2 hours; Single simulation: 15-35 seconds; ADM optimization: <15 minutes |
| **Licensing** | GPL v3 - compatible with internal clinical platform use with proper attribution |
| **Clinical Status** | Research tool - not validated for pathological conditions; results require clinical interpretation |

### Recommendation for DeepSynaps

**Deploy SimNIBS as a containerized external compute service** with async job queue integration. Treat all simulation results as **evidence-grade inputs** with explicit confidence scoring, provenance tracking, and research-only disclaimers. Implement a two-tier architecture: (1) leadfield precomputation for rapid optimization queries, and (2) full FEM simulation for final protocol validation.

---

## 2. SimNIBS Architecture

### 2.1 Software Overview

SimNIBS is a comprehensive end-to-end pipeline for individualized electric field modeling. The software encompasses three primary functional layers:

```
+---------------------------------------------------------------+
|                    SIMNIBS ARCHITECTURE                        |
+---------------------------------------------------------------+
|                                                                |
|  [LAYER 1: HEAD MODELING]                                      |
|  +------------------+  +------------------+  +-------------+  |
|  |   CHARM Pipeline |  |  Headreco (3.x)  |  | mri2mesh    |  |
|  |   (Recommended)  |  |  (Deprecated)    |  | (Deprecated)|  |
|  +------------------+  +------------------+  +-------------+  |
|  MRI Input -> Segmentation -> Surface Recon -> Tetrahedral    |
|                                                                |
|  [LAYER 2: SIMULATION]                                         |
|  +------------------+  +------------------+  +-------------+  |
|  |  tDCS/tACS/tRNS  |  |  TMS Simulation  |  |  Leadfield  |  |
|  |  Electrode Model |  |  Coil Model      |  |  Precompute |  |
|  +------------------+  +------------------+  +-------------+  |
|  FEM Solver (PETSc/PARDISO/GetDP) -> E-field Output           |
|                                                                |
|  [LAYER 3: OPTIMIZATION & OUTPUT]                              |
|  +------------------+  +------------------+  +-------------+  |
|  |  TMS ADM Opt     |  |  TES Leadfield   |  |  Field Viz  |  |
|  |  TES Flex Opt    |  |  TES Flex Opt    |  |  MNI/FsAvg  |  |
|  +------------------+  +------------------+  +-------------+  |
|                                                                |
+---------------------------------------------------------------+
```

### 2.2 Version History & Migration Path

| Version | Release Period | Key Changes | Status |
|---------|---------------|-------------|--------|
| **2.1** | 2017-2019 | Initial Python/MATLAB APIs, headreco/mri2mesh pipelines | Legacy |
| **3.0** | 2019-2020 | ADM for TMS optimization, improved leadfield calculations | Legacy |
| **3.2** | 2020-2021 | ADM coil optimization, uncertainty quantification | Legacy |
| **4.0** | 2021 | New CHARM pipeline, new tissue types (spongy bone, blood), .tcd coil format | Deprecated |
| **4.1** | 2022 | Improved tetrahedral mesh quality, FreeSurfer integration option | Deprecated |
| **4.5** | 2023 | New TES flex optimization, TMS flexible coil optimization, JupyterLab | Deprecated |
| **4.6** | 2024-2025 | Improved CHARM segmentation (new probabilistic atlas), TopoFit DL surfaces | **Current** |

**Critical Note**: SimNIBS 4.x is **NOT backwards compatible** with 3.x head models. Models created with `charm` cannot be used in older versions. Use the `convert_3_to_4` CLI tool for migration.

### 2.3 System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Windows 7/10, Ubuntu 16.04, macOS 10.13 | Windows 10/11, Ubuntu 22.04, macOS 13+ |
| **CPU** | 64-bit x86 processor | Intel Xeon / AMD EPYC / Apple M2+ |
| **RAM** | 8 GB | 32-64 GB (PARDISO solver) |
| **Storage** | 10 GB free | 100+ GB (head models, segmentations) |
| **GPU** | Not required | Apple Silicon / NVIDIA (for solvers) |

**Known Platform Issues**:
- PARDISO solver does not work on Apple Silicon (use MUMPS instead)
- Intel Mac support discontinued as of v4.5.0
- Installation fails on paths with non-standard characters (backslash, Unicode)
- `simnibs_gui` may fail on Wayland Linux (workaround: `LD_PRELOAD` libstdc++)

### 2.4 Python API (simnibs Package)

The Python API is the primary programmatic interface. SimNIBS v4.6 uses **Python 3.11**.

#### Core Module Structure

```python
# SimNIBS Python API - Core Modules
# ==================================

import simnibs
from simnibs import sim_struct      # Simulation structures
from simnibs import opt_struct       # Optimization structures
from simnibs import read_msh, write_msh  # Mesh I/O
from simnibs import mesh_save  # Mesh export utilities
from simnibs import msh  # Mesh data structures

# Key simulation structures:
# - sim_struct.SESSION()          # Top-level session container
# - sim_struct.TDCSLIST()         # tDCS simulation parameters
# - sim_struct.TMSLIST()          # TMS simulation parameters
# - sim_struct.TDCSLEADFIELD()    # Leadfield computation setup
# - sim_struct.ELECTRODE()        # Electrode definition
# - sim_struct.TMSLIST()          # TMS coil position setup
# - opt_struct.TDCSoptimize()     # tDCS optimization
# - opt_struct.TDCSFlexOptimize() # Leadfield-free tDCS optimization
# - opt_struct.TMSoptimize()      # TMS coil placement optimization
```

#### Basic tDCS Simulation Script

```python
"""
DeepSynaps: Example SimNIBS tDCS Simulation
Runs a bilateral motor cortex stimulation simulation.
"""
from simnibs import sim_struct, run_simnibs

# Initialize session
S = sim_struct.SESSION()
S.subpath = "m2m_subject01"      # Head model directory (from CHARM)
S.pathfem = "output/simulation_01"  # Output directory

# Define tDCS protocol
tdcs = S.add_tdcslist()
tdcs.currents = [1e-3, -1e-3]   # 1 mA anode, -1 mA cathode (A)

# Anode: C3 position (left motor cortex)
anode = tdcs.add_electrode()
anode.channelnr = 1
anode.centre = "C3"              # 10-10 EEG position
anode.shape = "rect"             # Rectangular electrode
anode.dimensions = [50, 50]      # 5x5 cm (mm)
anode.thickness = 4              # 4 mm thickness

# Cathode: Right supraorbital
cathode = tdcs.add_electrode()
cathode.channelnr = 2
cathode.centre = "AF4"
cathode.shape = "rect"
cathode.dimensions = [70, 50]    # 7x5 cm (mm)
cathode.thickness = 4

# Optional: Use anisotropic conductivities (requires DTI processing)
# tdcs.anisotropy_type = 'vn'    # Volume-normalized anisotropy

# Run simulation
run_simnibs(S)

# Output files:
# - subject01.msh      : Gmsh mesh with E-field results
# - subject01_{field}.nii.gz : NIfTI volume outputs (norm E, etc.)
# - subject01_*.geo    : Visualization geometry files
```

#### Basic TMS Simulation Script

```python
"""
DeepSynaps: Example SimNIBS TMS Simulation
Simulates single-pulse TMS over left motor cortex.
"""
import os
from simnibs import sim_struct, run_simnibs, SubjectFiles

S = sim_struct.SESSION()
S.subpath = "m2m_subject01"
S.pathfem = "output/tms_sim_01"

# Define TMS protocol
tms = S.add_tmslist()

# Coil model selection
tms.fnamecoil = os.path.join(
    os.environ.get('SIMNIBS_DIR', ''),
    'resources/coil_models/Magstim_70mm_Fig8.ccd'
)

# Subject files for EEG cap positions
sub_files = SubjectFiles(subpath="m2m_subject01")
tms.eeg_cap = sub_files.eeg_cap_1010

# Coil position over motor cortex
pos = tms.add_position()
pos.centre = "C3"           # Center position
pos.pos_ydir = "CP3"        # Y-direction (determines orientation)
pos.distance = 4             # 4 mm distance from scalp

# Run simulation
run_simnibs(S)

# Output: E-field norm and vector components on cortical surface
```

### 2.5 CLI Tools

| Command | Purpose | Phase |
|---------|---------|-------|
| `charm <subID> <T1.nii.gz> [<T2.nii.gz>]` | Segmentation & meshing | Preprocessing |
| `run_simnibs <simulation_script.py>` | Execute simulation | Compute |
| `simnibs_gui` | Interactive GUI for setup/visualization | Interactive |
| `prepare_tdcs_leadfield` | Pre-compute leadfield matrix | Precompute |
| `meshmesh` | Custom geometry meshing | Preprocessing |
| `add_tissues_to_upsampled` | Add custom tissue masks (lesions) | Preprocessing |
| `convert_3_to_4` | Migrate head models v3 -> v4 | Migration |
| `simnibs_jupyter` | Launch JupyterLab environment | Development |

### 2.6 Licensing (GPL v3)

SimNIBS is licensed under the **GNU General Public License v3**. For DeepSynaps:

- **Permitted**: Internal clinical platform integration, modification for institutional use, distribution within the organization
- **Required**: Source code availability if SimNIBS is distributed externally, attribution to SimNIBS developers, GPL v3 notice preservation
- **Not Required**: No licensing fees, no commercial use restrictions for the platform itself
- **DeepSynaps Implication**: SimNIBS runs as a separate service; the GPL applies to the SimNIBS service container, not to the DeepSynaps platform code that communicates with it via API

---

## 3. Simulation Pipeline

### 3.1 MRI Preprocessing Requirements

#### Required Inputs

| Input | Modality | Resolution | Purpose | Required? |
|-------|----------|------------|---------|-----------|
| T1-weighted (T1w) | MPRAGE/SPGR | 1 mm isotropic | Primary segmentation | **Yes** |
| T2-FLAIR | FLAIR | 1 mm isotropic | Enhanced skull/lesion segmentation | Recommended |
| DWI/DTI | Diffusion | 2 mm isotropic | Anisotropic conductivity | Optional |
| fMRI | BOLD | 3 mm isotropic | Functional target definition | Optional |

#### MRI Quality Standards

```
DeepSynaps MRI Quality Gate
============================
Input: NIfTI format (.nii or .nii.gz)
Coordinate system: RAS (Right-Anterior-Superior)
Minimal preprocessing: 
  - Bias field correction (N4 or SPM)
  - Reorientation to standard space
  - Intensity normalization (optional but recommended)

Quality Thresholds:
  - T1w: SNR > 15, CNR > 5
  - No motion artifacts > 1 mm
  - Full head coverage (cortex to C1 vertebra)
  - No metal artifacts (unless explicitly handled)
```

### 3.2 Segmentation & Meshing Pipeline

```
CHARM PIPELINE (SimNIBS 4.x) - RECOMMENDED
===========================================

  T1w MRI (+ optional T2-FLAIR)
       |
       v
  [Affine Registration]  -----> Atlas Space
       |
       v
  [Probabilistic Segmentation]  -----> 9 tissue classes
       |
       v
  [TopoFit Deep Learning]  -----> Pial & WM surface reconstruction
       |
       v
  [Surface Meshing]  -----> Triangular surface meshes
       |
       v
  [Volume Meshing]  -----> Tetrahedral FEM mesh (.msh)
       |
       v
  [Quality Control]  -----> charm_report.html

Output: m2m_<subID>/
  - <subID>.msh           # Head mesh
  - charm_report.html     # QC report
  - masks/                # Tissue segmentation masks
  - surfaces/             # Surface reconstructions
  - T1fs_conform.nii.gz   # Conformed T1
```

#### CHARM Tissue Classes (SimNIBS 4.x)

| Tissue ID | Tissue Name | Standard Conductivity (S/m) | Source |
|-----------|-------------|----------------------------|--------|
| 1 | White Matter | 0.126 | Wagner et al., 2004 |
| 2 | Gray Matter | 0.275 | Wagner et al., 2004 |
| 3 | CSF | 1.654 | Wagner et al., 2004 |
| 4 | Compact Bone | 0.008 | Opitz et al., 2015 |
| 5 | Spongy Bone | 0.025 | Opitz et al., 2015 |
| 6 | Eye Balls | 0.500 | Opitz et al., 2015 |
| 7 | Blood | 0.600 | Gabriel et al., 2009 |
| 8 | Muscle | 0.160 | Gabriel et al., 2009 |
| 9 | Skin/Scalp | 0.465 | Wagner et al., 2004 |
| 100 | Silicone Rubber (Electrode) | 29.4 | Saturnino et al., 2015 |
| 500 | Saline (Gel) | 1.0 | Saturnino et al., 2015 |

**Note**: SimNIBS 4.x added spongy bone and large blood vessels as distinct tissue types, improving accuracy over 3.x which used a single bone compartment.

#### CHARM Configuration (charm.ini)

```ini
# Key CHARM configuration sections
# surfaces section (SimNIBS 4.6+)
[topofit]
contrast = "T1w"           # "T1w" or "random" (contrast-agnostic)
resolution = "1mm"         # "1mm" or "random"

[central_surface]
fraction = 0.5             # 0.5 = middle of cortical ribbon
method = "equivolume"      # "equivolume" or "equidistance"

# Can use FreeSurfer recon-all surfaces instead:
# charm --fs-dir <reconall_results_dir> <subID> <T1.nii.gz>
```

### 3.3 Mesh Quality & Resolution

| Parameter | Default | Range | Impact |
|-----------|---------|-------|--------|
| Tetrahedral count | ~2-5 million | 1M - 10M | Accuracy vs. computation time |
| Surface triangles | ~800K - 1M | 200K - 2M | Cortical detail representation |
| Vertex density | 0.5 nodes/mm^2 | 0.1 - 2.0 | Mesh refinement control |
| Element quality | > 0.1 (gamma) | 0.0 - 1.0 | FEM numerical stability |

**Quality Metrics**:
- **Gamma quality measure**: ratio of inscribed to circumscribed sphere radius
- SimNIBS 4.1+ substantially improved tetrahedral quality to remove E-field outliers
- Minimum acceptable quality: gamma > 0.1 for all elements

### 3.4 Conductivity Values

#### Isotropic (Default)

Uses scalar conductivity values per tissue type (see table in 3.2). This is the fastest and most common approach.

#### Anisotropic (Optional, requires DTI)

```python
# Anisotropic conductivity setup
tdcs.anisotropy_type = 'vn'  # Volume-normalized (recommended)
tdcs.anisotropy_type = 'dir' # Direct anisotropic
tdcs.anisotropy_type = 'mc'  # Monte Carlo isotropic varying
tdcs.aniso_maxratio = 10     # Max eigenvalue ratio
tdcs.aniso_maxcond = 2.0     # Max mean conductivity (S/m)
```

Anisotropic modeling accounts for white matter fiber direction from diffusion tensor imaging, providing more accurate E-field predictions in fiber tracts. Processing requires `dwi2cond` pipeline.

### 3.5 Solvers

| Solver | Type | Memory | Speed | Best For |
|--------|------|--------|-------|----------|
| **PETSc** | Iterative (PCG) | Low (~6 GB) | Moderate | Default, most simulations |
| **PARDISO** | Direct | High (~16+ GB) | Fast (2-3x) | Multi-electrode, optimization |
| **MUMPS** | Direct | Medium | Fast | Apple Silicon systems |

The solver is selected via:
```python
S.solver_options = 'petsc'    # Default
S.solver_options = 'pardiso'  # Direct solver
# Or command line:
# run_simnibs --pardiso script.py
```

**Linear System**: The FEM solves **Mu = b** where:
- **M**: Stiffness matrix (~10^6 x 10^6, sparse)
- **u**: Electric potentials at nodes
- **b**: Boundary conditions (electrode potentials for tDCS; dA/dt field for TMS)

### 3.6 Output Formats

| Format | Extension | Content | Use Case |
|--------|-----------|---------|----------|
| Gmsh Mesh | `.msh` | Full tetrahedral mesh + E-field | Detailed analysis, visualization |
| NIfTI Volume | `.nii.gz` | Volumetric E-field maps | Overlay on MRI, group analysis |
| FreeSurfer Surface | `.curv`, `.sulc` | Cortical surface fields | Surface-based analysis |
| MNI Space | `_mni_*.nii.gz` | MNI-registered volumes | Cross-subject comparison |
| FsAverage | `fsavg_*.mgh` | Standard surface space | Group surface analysis |
| HDF5 | `.hdf5` | Leadfield matrices | Optimization inputs |

---

## 4. TMS Modeling

### 4.1 Coil Models

SimNIBS provides pre-calculated coil models for major commercial TMS devices:

| Manufacturer | Coil Model | File Format | Description |
|-------------|------------|-------------|-------------|
| **Magstim** | 70mm Figure-8 | `.ccd` / `.nii` | Standard round figure-8 |
| **Magstim** | 25mm Figure-8 | `.ccd` | Focal pediatric coil |
| **MagVenture** | Cool-B65 | `.ccd` | Angled figure-8 |
| **MagVenture** | Cool-D80 | `.ccd` | Deep stimulation |
| **MagVenture** | MST Twin | `.tcd` | (v4.5+) Twin coil |
| **Brainsway** | H1 | `.tcd` | (v4.5+) H-coil for depression |
| **Brainsway** | H4 | `.tcd` | (v4.5+) H-coil for OCD |
| **Brainsway** | H7 | `.tcd` | (v4.5+) H-coil for smoking |
| **Magstim** | DCC (biphasic) | `.ccd` | Double cone coil |

#### Coil Model Formats

1. **.ccd files**: Magnetic dipole representations. Coil modeled as ~2700 dipoles. E-field calculated via analytical formula. Most flexible for custom coils.

2. **.nii files**: Pre-calculated dA/dt field on a regular grid. Faster setup via interpolation. Best for standard coils.

3. **.tcd files** (v4.5+): New format supporting flexible/multi-element coils. Defines winding geometry; A-field computed via numerical line integration.

### 4.2 Coil Positioning & Orientation

```python
# TMS coil positioning parameters
pos = tms.add_position()
pos.centre = "C3"          # Center of coil on scalp
pos.pos_ydir = "CP3"       # Direction determining coil Y-axis
pos.distance = 4           # Coil-to-scalp distance (mm)
                           # Accounts for hair/standoff

# Alternative: MNI coordinates
pos.centre_mni = [-35, 15, 60]  # MNI space coordinates

# Neuronavigation import/export
# SimNIBS supports Brainsight (v2.5.3+) NIfTI:Aligned format
```

The coil orientation is defined by:
- **centre**: Scalp position directly under coil center
- **pos_ydir**: Second scalp point defining the Y-axis direction
- **distance**: Perpendicular offset from scalp (accounts for hair thickness)

The coil handle direction is determined by the cross product of the scalp normal and the Y-axis vector, giving the X-axis. This fully defines the 3D coil pose.

### 4.3 E-field Hotspot Calculation

The TMS E-field hotspot is defined as:

```
Hotspot = max(||E_TMS||) over all gray matter elements

Where:
  E_TMS = -dA/dt - grad(V)  # Total E-field
  A = magnetic vector potential (from coil)
  V = induced electric potential (from FEM solver)

Key metrics:
  - Peak field: 99.9th percentile of ||E|| in GM
  - Focality: GM volume with ||E|| >= 75% of peak
  - Depth profile: E-field along normal from cortical surface
```

Typical peak E-field values for TMS:
- Single pulse at 1 A/us: ~50-200 V/m in gray matter
- Paired-pulse at 10 A/us: ~500-2000 V/m
- The relationship between dI/dt and E-field is **linear**

### 4.4 Motor Threshold Estimation

SimNIBS E-field values can be used to estimate motor thresholds:

```python
# Convert simulated E-field to stimulation intensity
# The relationship is: E_threshold = MT% * E_peak_at_100%

# Example: If MT is 50% of MSO and E at 100% is 100 V/m:
# Threshold E-field = 50% * 100 V/m = 50 V/m

# This provides an individualized estimate accounting for:
# - Cortical folding geometry at M1
# - Skull thickness variations
# - CSF layer thickness
# - Distance from coil to cortex
```

### 4.5 E-field Depth Profiles

```python
# Extract depth profile along cortical normal
def extract_depth_profile(mesh_file, roi_center, max_depth=20):
    """
    Extract E-field magnitude as function of depth from cortex.
    
    Parameters:
    - mesh_file: SimNIBS output mesh
    - roi_center: [x, y, z] in subject space
    - max_depth: maximum depth in mm
    
    Returns:
    - depths: array of depth values (mm)
    - e_fields: array of E-field magnitudes (V/m)
    """
    mesh = simnibs.read_msh(mesh_file)
    # ... depth profile extraction logic
    return depths, e_fields

# Depth profiles are crucial for:
# - Comparing stimulation depth across subjects
# - Evaluating coil selection (figure-8 vs H-coil)
# - Determining if subcortical targets are reachable
```

### 4.6 ROI Targeting Accuracy

TMS targeting accuracy depends on:
1. **Neuronavigation precision**: < 2 mm typical
2. **Coil placement repeatability**: < 5 mm session-to-session
3. **Head model quality**: CHARM segmentation accuracy
4. **Coil model fidelity**: .tcd vs .ccd representation

SimNIBS can compute the **optimal coil placement** for a target ROI using ADM (see Section 4.7).

### 4.7 TMS Optimization (ADM - Auxiliary Dipole Method)

The ADM method (available since SimNIBS 3.2, enhanced in 4.5) enables rapid optimization of coil placement:

```python
"""
DeepSynaps: TMS Coil Optimization using ADM
Finds optimal coil position and orientation for target ROI.
"""
from simnibs import opt_struct, SubjectFiles
import simnibs

# Initialize optimization
opt = opt_struct.TMSoptimize()
opt.fnamehead = "m2m_subject01/subject01.msh"
opt.fnamecoil = "Magstim_70mm_Fig8.ccd"
opt.target = [-40, 10, 50]    # Target coordinate (subject space)
opt.target_radius = 10         # ROI radius (mm)
opt.centre = [-40, 10, 75]   # Starting scalp position
opt.pos_ydir = [-50, 10, 75] # Y-direction reference
opt.distance = 4               # Coil distance (mm)
opt.didt = 1e6                 # dI/dt (A/s)
opt.method = "ADM"             # Use ADM (fast)
opt.open_in_gmsh = False

# Run optimization
simnibs.run_simnibs(opt)

# Output: Optimal coil position + orientation
# E-field magnitude at target for each candidate position
# Uncertainty quantification for placement errors
```

**ADM Performance**:
- Evaluates 2.1 million configurations (5900 positions x 360 orientations) in **< 15 minutes** on a laptop
- **165x faster** than direct FEM evaluation (which takes ~20 hours)
- Memory: ~6.5 GB (vs. 11+ GB for direct method)
- Error: < 0.5% compared to full FEM solution

**v4.5 Enhancement - Flexible Coils**:
- New `tms_flex_opt` supports bent/flexible coils
- Systematically avoids coil-head intersections
- Accounts for coil casing geometry

---

## 5. tDCS/tACS/tRNS Modeling

### 5.1 Electrode Shapes & Sizes

| Shape | Dimensions | Typical Use | Focality |
|-------|-----------|-------------|----------|
| **Rectangular** | 5x5 cm, 5x7 cm, 7x5 cm | Standard tDCS | Low |
| **Circular** | Diameter 5-7 cm | Alternative montages | Low |
| **Round (small)** | Diameter 5-12 mm | HD-tDCS | High |
| **Ring (Nx1)** | Center 5mm + 4 surrounds 5mm at 75mm radius | Focal stimulation | High |
| **Custom** | Arbitrary polygons | Research | Variable |

```python
# Electrode configuration examples

# Standard rectangular electrode
rect_elec = tdcs.add_electrode()
rect_elec.shape = "rect"
rect_elec.dimensions = [50, 50]    # mm
rect_elec.thickness = 4            # mm
rect_elec.centre = "C3"

# Circular electrode
circ_elec = tdcs.add_electrode()
circ_elec.shape = "ellipse"
circ_elec.dimensions = [50, 50]    # Diameter 50mm
circ_elec.thickness = 4
circ_elec.centre = "F3"

# HD-tDCS center-surround (4x1) configuration
# Central anode
anode = tdcs.add_electrode()
anode.channelnr = 1
anode.shape = "rect"
anode.dimensions = [10, 10]
anode.centre = "C3"

# Four surrounding cathodes
cathode_positions = ["FC3", "CP3", "C1", "C5"]
for pos in cathode_positions:
    cath = tdcs.add_electrode()
    cath.channelnr = 2
    cath.shape = "rect"
    cath.dimensions = [10, 10]
    cath.centre = pos
```

### 5.2 Electrode Positioning

Electrodes are placed using:
- **10-10/10-05 EEG system positions** (e.g., "C3", "F3", "AF4")
- **MNI coordinates** for precise anatomical targeting
- **Subject-space coordinates** for individualized placement

```python
# Positioning options
anode.centre = "C3"                    # EEG 10-10 position
anode.centre_mni = [-35, 15, 60]       # MNI coordinates
anode.centre = [-45.2, 22.1, 58.3]     # Subject RAS coordinates

# Rotation control (rectangular electrodes)
anode.pos_ydir = "CP3"                 # Y-axis points toward CP3
```

### 5.3 Current Intensity Parameters

| Parameter | Typical Range | Clinical Standard | Notes |
|-----------|-------------|-------------------|-------|
| **tDCS** | 0.5 - 4 mA | 1-2 mA | DC current, constant polarity |
| **tACS** | 0.5 - 2 mA | 1 mA | Sinusoidal, 0.5-140 Hz typical |
| **tRNS** | 0.5 - 2 mA | 1 mA | Random frequency, 0.1-640 Hz |
| **HD-tDCS** | 1.5 - 3 mA center; 0.375-0.75 mA surround | 2 mA center | Nx1 ring configuration |

```python
# tDCS: DC current
tdcs.currents = [1e-3, -1e-3]        # 1 mA anode, -1 mA cathode

# tACS: Simulated at peak current (quasi-static approximation)
# Run simulation at 1 mA, then scale sinusoidally:
# E(t) = E(1mA) * I0 * sin(2*pi*f*t + phi)
# where I0 = peak amplitude = half peak-to-peak

# tRNS: Same approach as tACS (quasi-static holds)
# E(t) = E(1mA) * I0 * noise(t)
```

**Quasi-static approximation**: Valid for frequencies < 1 kHz, where the wavelength in tissue is much larger than the head dimensions. At tDCS/tACS/tRNS frequencies, the relationship between current and E-field is linear and time-independent.

### 5.4 E-field Distribution Patterns

Typical E-field characteristics for common montages:

| Montage | Peak E-field (V/m) | Focality (75% peak GM vol) | Primary Target |
|---------|-------------------|---------------------------|----------------|
| C3-SO (M1) | 0.15-0.25 | ~15-25 cm^3 | Left motor cortex |
| F3-F4 (DLPFC) | 0.10-0.18 | ~20-35 cm^3 | Prefrontal cortex |
| O1-Oz (V1) | 0.12-0.20 | ~15-25 cm^3 | Visual cortex |
| Cz-Oz (SMA) | 0.15-0.22 | ~18-28 cm^3 | Supplementary motor |
| HD 4x1 (C3) | 0.30-0.50 | ~2-5 cm^3 | Highly focal M1 |

### 5.5 Focality vs. Intensity Trade-offs

```
Trade-off Curve: Focality vs. Intensity
========================================

Intensity (V/m)
     |
 0.5 |                    * HD 4x1 (3mA)
     |                  /
 0.4 |                /
     |              /
 0.3 |            * HD 4x1 (2mA)
     |          /     \
 0.2 |        /         * Large rect (2mA)
     |      /         /
 0.1 |    * Large rect (1mA)
     |  /
 0.0 +-------------------------------
     0   5   10  15  20  25  30  35
              Focality (cm^3)

Key insight: Smaller electrodes provide higher focality but require
higher current to achieve comparable intensity at depth.
```

### 5.6 HD-tDCS Optimization

SimNIBS supports leadfield-based and leadfield-free optimization for HD-tDCS:

```python
"""
DeepSynaps: HD-tDCS Optimization
Optimizes electrode placement for focal targeting.
"""
from simnibs import opt_struct

# Leadfield-based approach (requires pre-computed leadfield)
opt = opt_struct.TDCSoptimize()
opt.leadfield_hdf = 'tdcs_leadfield/ernie_leadfield_EEG10-10_UI_Jurak_2007.hdf5'
opt.name = 'optimization/hd_motor_cortex'

# Define target
target = opt_struct.TDCStarget()
target.positions = [-40, 10, 50]  # Target coordinate
target.radius = 10                 # ROI radius (mm)
target.directions = [0, 0, 1]     # Target direction (normal to cortex)
target.intensity = 0.2             # Target E-field (V/m)
opt.target = [target]

# Constraints
opt.max_total_current = 2e-3       # Max 2 mA total
opt.max_individual_current = 1e-3  # Max 1 mA per electrode
opt.max_active_electrodes = 8      # Max 8 electrodes

# Run optimization
import simnibssimnibs.run_simnibs(opt)
```

### 5.7 Leadfield-Based vs. Leadfield-Free Optimization

| Feature | Leadfield-Based | Leadfield-Free (v4.5+) |
|---------|----------------|----------------------|
| **Precomputation** | Leadfield matrix required | None needed |
| **Electrode size** | Small, discrete positions | Arbitrary shapes |
| **Optimization speed** | Very fast (seconds) | Moderate (minutes) |
| **Supported montages** | Multi-electrode arrays | Standard TES, 4x1, TIS, TTFields |
| **Electrode overlap** | Not applicable | Systematically prevented |
| **Memory** | High (leadfield storage) | Moderate |

### 5.8 Nx1 Ring Electrode Configurations

The 4x1 (center-surround) configuration is the standard HD-tDCS montage:

```
    [Cathode]          [Cathode]
         \              /
          \    [Anode] /
           \     |    /
            \    |   /
             \   |  /
              \  | /
               \|/
            [Target]
         (focal stimulation)

    [Cathode]          [Cathode]

Current: I_center = +2.0 mA
         I_surround = -0.5 mA each (4 cathodes)
         Total = 0 (charge balance)
```

SimNIBS v4.0+ added native support for Nx1 center-surround montages in both Python and MATLAB APIs.

---

## 6. Alternative Tools (ROAST, etc.)

### 6.1 ROAST (Realistic vOlumetric-Approach to Simulate TES)

ROAST is the primary alternative to SimNIBS for TES electric field modeling.

| Dimension | SimNIBS | ROAST |
|-----------|---------|-------|
| **Language** | Python/C++ | MATLAB |
| **Segmentation** | SPM12 + CHARM (proprietary) | SPM12 (standard) |
| **Meshing** | Gmsh (tetrahedral surfaces) | iso2mesh (volumetric) |
| **Solver** | GetDP/PETSc/PARDISO | getDP |
| **TES Support** | tDCS, tACS, tRNS, HD-tDCS | tDCS, tACS |
| **TMS Support** | Full coil modeling | No |
| **Optimization** | ADM, leadfield, flex-opt | Limited |
| **Processing time** | 1-2 hours (CHARM) | < 30 minutes (end-to-end) |
| **Output format** | .msh, .nii, FreeSurfer | .nii (volumetric only) |
| **Mesh approach** | Surface-based | Volume-based |
| **Citations** | ~800+ (April 2022) | ~225+ (April 2022) |
| **License** | GPL v3 | Open source |

### 6.2 ROAST Pipeline

```
ROAST Pipeline
==============

T1 MRI (+ optional T2)
    |
    v
[SPM12 Segmentation]  -----> 6 tissue classes (WM, GM, CSF, skull, scalp, air)
    |
    v
[Post-processing]  -----> CSF continuity, skull integrity
    |
    v
[Auto Electrode Placement]  -----> 10-05 or BioSemi-256 positions
    |
    v
[Volumetric Meshing]  -----> iso2mesh (tetrahedral)
    |
    v
[FEM Solving]  -----> getDP
    |
    v
[Volumetric Output]  -----> .nii E-field volumes
```

### 6.3 SimNIBS vs. ROAST: Detailed Comparison

**Segmentation Differences**:
- ROAST operates entirely in **volumetric** space; SimNIBS converts volumes to **surfaces** before meshing
- ROAST preserves small anatomical details (optic foramen, foramen magnum) better
- SimNIBS surface conversion can close openings that exist in real anatomy
- ROAST segmentation is generally more detailed for non-brain tissues

**E-field Accuracy**:
- Validation against intracranial recordings shows **no significant difference** in spatial distribution prediction between ROAST and SimNIBS
- ROAST predicts **field magnitude significantly better** than SimNIBS-hr (p=0.0003) but not significantly different from SimNIBS-hrE
- Both overestimate field magnitudes compared to ground truth (all models need conductivity calibration)

**When to Use ROAST vs. SimNIBS**:

| Use Case | Recommendation |
|----------|---------------|
| TMS simulation | **SimNIBS** (ROAST doesn't support TMS) |
| Rapid TES screening | **ROAST** (30 min vs. 1-2 hours) |
| Complex lesions/implants | **ROAST** (volumetric flexibility) |
| HD-tDCS optimization | **SimNIBS** (advanced optimization) |
| Multi-modal analysis | **SimNIBS** (MNI/FsAverage output, surface maps) |
| Clinical deployment | **SimNIBS** (more active development, broader ecosystem) |

### 6.4 Other Tools

| Tool | Type | Strengths | Limitations |
|------|------|-----------|-------------|
| **COMET** | Free (MATLAB) | Automated T1/T2 segmentation | Windows only |
| **BONSAI** | Web-based | Easy visualization | No MRI-based E-field analysis |
| **SPHEARES** | Web-based | Quick prototyping | No automatic segmentation |
| **SCIRun** | Free (C++) | Modular, flexible | Complex interface |
| **COMSOL** | Commercial | Gold-standard accuracy | Expensive, steep learning curve |
| **ANSYS Maxwell** | Commercial | High-end FEM | Very expensive, specialized |

### 6.5 Recommendation for DeepSynaps

**Primary**: SimNIBS 4.6 (full-featured, actively maintained, GPL v3)  
**Secondary**: ROAST for rapid screening and validation (MATLAB dependency is a constraint)  
**Validation**: Cross-reference critical results between both tools where possible.

---

## 7. DeepSynaps Integration Architecture

### 7.1 High-Level Architecture

```
+================================================================+
|                   DEEPSYNAPS PROTOCOL STUDIO                     |
|                       (Platform Layer)                           |
+================================================================+
|                                                                  |
|  +------------------+  +------------------+  +----------------+ |
|  |  Brain Map       |  |  Protocol        |  |  MRI Analyzer  | |
|  |  Planner         |  |  Designer        |  |  (Segmentation)| |
|  +--------+---------+  +--------+---------+  +-------+--------+ |
|           |                     |                    |          |
|           +----------+----------+--------------------+          |
|                      |                                         |
|            +---------v---------+                               |
|            |  API Gateway      |                               |
|            |  (REST/WebSocket) |                               |
|            +---------+---------+                               |
|                      |                                         |
+================================================================+
                      | Platform-to-Service Boundary
+================================================================+
|                      |                                         |
|            +---------v---------+                               |
|            |  Async Job Queue  |  (Redis/RabbitMQ)             |
|            |  +-------------+  |                               |
|            |  | Job State   |  |  (PostgreSQL/MongoDB)         |
|            |  | Store       |  |                               |
|            |  +-------------+  |                               |
|            +---------+---------+                               |
|                      |                                         |
|  +-------------------+-------------------+                   |
|  |                   |                   |                     |
|  v                   v                   v                     |
| +----------+  +----------+  +----------+                     |
| | SimNIBS  |  | SimNIBS  |  | SimNIBS  |                     |
| | Worker 1 |  | Worker 2 |  | Worker N |                     |
| | (Docker) |  | (Docker) |  | (Docker) |                     |
| +----------+  +----------+  +----------+                     |
|  Segment       Simulate      Optimize                        |
|  Pipeline      Pipeline      Pipeline                        |
+================================================================+
|                  (SimNIBS Compute Layer)                       |
+================================================================+

Storage:
  +----------+  +----------+  +----------+  +----------+
  |  S3/NAS  |  |  Results |  |  Head    |  |  Lead-   |
  |  (MRI)   |  |  Store   |  |  Models  |  |  fields  |
  +----------+  +----------+  +----------+  +----------+
```

### 7.2 Service Components

#### Component 1: Segmentation Service

```yaml
# DeepSynaps: SimNIBS Segmentation Service
service: simnibs-segmentation
image: deepsynaps/simnibs-charm:4.6.0
resources:
  cpu: 8 cores
  memory: 32 GB
  storage: 50 GB temp
  gpu: optional (for TopoFit DL)
input:
  - t1_nifti: s3://mri-bucket/{subject}/t1.nii.gz
  - t2_nifti: optional s3://mri-bucket/{subject}/t2.nii.gz
  - subject_id: string
output:
  - head_mesh: s3://models-bucket/{subject}/head.msh
  - segmentation: s3://models-bucket/{subject}/masks/
  - report: s3://models-bucket/{subject}/charm_report.html
timeout: 4 hours
retry: 2
```

#### Component 2: Simulation Service

```yaml
# DeepSynaps: SimNIBS Simulation Service
service: simnibs-simulation
image: deepsynaps/simnibs-sim:4.6.0
resources:
  cpu: 8 cores
  memory: 32 GB
  storage: 10 GB temp
input:
  - head_mesh: s3://models-bucket/{subject}/head.msh
  - protocol: JSON (stimulation parameters)
  - solver: "petsc" | "pardiso" | "mumps"
output:
  - efield_mesh: s3://results-bucket/{sim_id}/efield.msh
  - efield_nifti: s3://results-bucket/{sim_id}/efield.nii.gz
  - cortical_maps: s3://results-bucket/{sim_id}/cortex/
timeout: 1 hour
retry: 1
```

#### Component 3: Optimization Service

```yaml
# DeepSynaps: SimNIBS Optimization Service
service: simnibs-optimization
image: deepsynaps/simnibs-opt:4.6.0
resources:
  cpu: 16 cores
  memory: 64 GB
  storage: 20 GB temp
input:
  - head_mesh: s3://models-bucket/{subject}/head.msh
  - leadfield: optional s3://models-bucket/{subject}/leadfield.hdf5
  - target_roi: JSON (coordinates + radius)
  - optimization_type: "tms_adm" | "tes_leadfield" | "tes_flex"
  - constraints: JSON (max_current, max_electrodes)
output:
  - optimal_placement: JSON (coil/electrode positions)
  - efield_prediction: s3://results-bucket/{opt_id}/
  - confidence_map: s3://results-bucket/{opt_id}/confidence.nii.gz
timeout: 2 hours
retry: 1
```

### 7.3 MRI -> Segmentation -> Mesh -> Simulation Pipeline

```python
"""
DeepSynaps: Complete Simulation Pipeline
End-to-end flow from MRI to E-field results.
"""

class SimNIBSPipeline:
    """Orchestrates the complete SimNIBS simulation pipeline."""
    
    PHASES = {
        'MRI_UPLOAD': 0,
        'SEGMENTATION': 1,
        'QUALITY_CHECK': 2,
        'MESH_GENERATION': 3,
        'PROTOCOL_DESIGN': 4,
        'SIMULATION': 5,
        'OPTIMIZATION': 6,
        'VISUALIZATION': 7,
        'REPORTING': 8
    }
    
    def __init__(self, subject_id, job_queue, result_store):
        self.subject_id = subject_id
        self.job_queue = job_queue
        self.result_store = result_store
        self.state = self.PHASES['MRI_UPLOAD']
    
    async def run_segmentation(self, t1_path, t2_path=None):
        """Phase 1-3: CHARM segmentation and meshing."""
        job = {
            'type': 'charm_segmentation',
            'subject_id': self.subject_id,
            'inputs': {'t1': t1_path, 't2': t2_path},
            'priority': 'high',
            'timeout': 14400  # 4 hours
        }
        job_id = await self.job_queue.submit(job)
        result = await self.job_queue.wait_for_completion(job_id)
        
        if result['status'] == 'success':
            self.state = self.PHASES['QUALITY_CHECK']
            return {
                'head_mesh': result['outputs']['head_mesh'],
                'report': result['outputs']['report'],
                'segmentation_quality': result['quality_score']
            }
        else:
            raise SegmentationError(result['error'])
    
    async def run_simulation(self, protocol):
        """Phase 4-5: Stimulation simulation."""
        job = {
            'type': 'simulation',
            'subject_id': self.subject_id,
            'inputs': {
                'head_mesh': self.head_mesh,
                'protocol': protocol.to_dict()
            },
            'solver': protocol.solver or 'petsc',
            'timeout': 3600
        }
        job_id = await self.job_queue.submit(job)
        result = await self.job_queue.wait_for_completion(job_id)
        
        if result['status'] == 'success':
            self.state = self.PHASES['SIMULATION']
            return SimulationResult(
                efield_mesh=result['outputs']['efield_mesh'],
                efield_nifti=result['outputs']['efield_nifti'],
                peak_field=result['metrics']['peak_field'],
                focality=result['metrics']['focality']
            )
        else:
            raise SimulationError(result['error'])
    
    async def run_optimization(self, target_roi, constraints):
        """Phase 6: Find optimal stimulation parameters."""
        job = {
            'type': 'optimization',
            'subject_id': self.subject_id,
            'inputs': {
                'head_mesh': self.head_mesh,
                'leadfield': self.leadfield,  # if available
                'target': target_roi.to_dict(),
                'constraints': constraints.to_dict()
            },
            'timeout': 7200
        }
        job_id = await self.job_queue.submit(job)
        result = await self.job_queue.wait_for_completion(job_id)
        
        return OptimizationResult(
            optimal_placement=result['placement'],
            predicted_efield=result['efield'],
            confidence_score=result['confidence']
        )
```

### 7.4 Integration with MRI Analyzer

```
MRI Analyzer -> SimNIBS Integration
====================================

MRI Analyzer Output:
  - Segmentation quality score (Dice coefficient per tissue)
  - Skull integrity check
  - CSF continuity verification
  - Lesion/tumor mask (if applicable)
  - Quality flags: [PASS, WARNING, FAIL]

SimNIBS Input Gate:
  IF quality_score < 0.85:
     -> Trigger manual review workflow
  IF skull_integrity == BREACH:
     -> Add skull_patch mask to CHARM
  IF csf_continuity == BROKEN:
     -> Use post-processing fix in CHARM
  IF lesion_detected:
     -> Add custom tissue mask via add_tissues_to_upsampled
  IF quality == PASS:
     -> Proceed to mesh generation

Feedback Loop:
  SimNIBS mesh quality -> back to MRI Analyzer
  -> Update segmentation quality database
  -> Refine quality thresholds over time
```

### 7.5 Integration with Brain Map Planner

```
Brain Map Planner -> SimNIBS Integration
=========================================

Brain Map Planner Output:
  - Target ROI (MNI coordinates + radius)
  - Target network (functional connectivity map)
  - Stimulation modality (tDCS/tACS/TMS)
  - Constraints (avoid regions, safety limits)

SimNIBS Optimization Input:
  IF modality == TMS:
     -> Run TMS ADM optimization
     -> Find optimal coil position + orientation
     -> Return: coil_pose, predicted_efield, uncertainty
  
  IF modality == tDCS/tACS:
     -> Check if leadfield exists
     IF yes: Run leadfield-based optimization (fast)
     IF no: Run leadfield-free optimization (flexible)
     -> Return: electrode_montage, predicted_efield, focality
  
  IF optimization_needed == FALSE:
     -> Run single simulation with given parameters
     -> Return: efield distribution, safety metrics

Results Back to Brain Map Planner:
  - E-field overlay on anatomical/functional maps
  - Coverage score (% of target ROI above threshold)
  - Off-target stimulation assessment
  - Safety compliance verification
```

---

## 8. Async Pipeline Design

### 8.1 Job Queue Architecture

```
Job State Machine
=================

[PENDING] --submit--> [QUEUED] --start--> [RUNNING]
                                              |
                    +-------------------------+-------------------------+
                    |                         |                         |
                    v                         v                         v
              [COMPLETED]             [FAILED_RETRY]            [FAILED_FATAL]
                    |                  (auto-retry up to N)       (manual review)
                    |                         |
                    |                         v
                    |                   [COMPLETED]
                    |                   (after retry)
                    |
                    v
            [RESULTS_AVAILABLE]
                    |
                    v
            [NOTIFIED_CLIENT]

States:
- PENDING: Job received, validation in progress
- QUEUED: Validated, waiting for worker
- RUNNING: Worker executing
- COMPLETED: Success, results available
- FAILED_RETRY: Transient failure, retry scheduled
- FAILED_FATAL: Permanent failure, requires manual intervention
- CANCELLED: User cancelled before completion
- TIMEOUT: Exceeded time limit
```

### 8.2 Job Types & Priorities

| Job Type | Priority | Typical Duration | Max Retries |
|----------|----------|-----------------|-------------|
| `charm_segmentation` | HIGH | 1-4 hours | 2 |
| `tms_simulation` | MEDIUM | 15-60 seconds | 1 |
| `tdcs_simulation` | MEDIUM | 15-60 seconds | 1 |
| `leadfield_precompute` | HIGH | 10-30 minutes | 2 |
| `tms_adm_optimize` | LOW | 10-30 minutes | 1 |
| `tes_leadfield_opt` | LOW | 1-10 minutes | 1 |
| `tes_flex_optimize` | LOW | 30-120 minutes | 1 |
| `uncertainty_quantify` | LOW | 1-4 hours | 1 |

### 8.3 Result Storage & Caching

```python
"""
DeepSynaps: Result Storage and Caching Strategy
"""

class SimulationCache:
    """Multi-tier caching for simulation results."""
    
    # Tier 1: In-memory (Redis) - Fast, volatile
    # Tier 2: Object storage (S3/MinIO) - Persistent
    # Tier 3: Cold storage (Glacier) - Archive
    
    CACHE_KEYS = {
        'head_mesh': 'simnibs:mesh:{subject_id}',
        'leadfield': 'simnibs:lf:{subject_id}:{electrode_set}',
        'simulation': 'simnibs:sim:{subject_id}:{protocol_hash}',
        'optimization': 'simnibs:opt:{subject_id}:{target_hash}'
    }
    
    def get_cache_key(self, result_type, **params):
        """Generate deterministic cache key."""
        key_template = self.CACHE_KEYS[result_type]
        return key_template.format(**params)
    
    async def cache_simulation_result(self, protocol, result):
        """Cache result with TTL based on computation cost."""
        protocol_hash = hashlib.sha256(
            json.dumps(protocol, sort_keys=True).encode()
        ).hexdigest()[:16]
        
        key = self.get_cache_key(
            'simulation',
            subject_id=protocol['subject_id'],
            protocol_hash=protocol_hash
        )
        
        # Store in Redis (hot cache, 24h TTL)
        await self.redis.setex(key, 86400, result.summary_json())
        
        # Store full result in S3 (persistent)
        await self.s3.put_object(
            Bucket='simnibs-results',
            Key=f'{key}/result.json',
            Body=result.to_json()
        )
        
        return key
    
    async def get_cached_result(self, protocol):
        """Check cache for existing result."""
        protocol_hash = self._hash_protocol(protocol)
        key = self.get_cache_key(
            'simulation',
            subject_id=protocol['subject_id'],
            protocol_hash=protocol_hash
        )
        
        # Check Redis first
        cached = await self.redis.get(key)
        if cached:
            return json.loads(cached)
        
        # Check S3
        try:
            obj = await self.s3.get_object(
                Bucket='simnibs-results',
                Key=f'{key}/result.json'
            )
            return json.loads(await obj['Body'].read())
        except self.s3.exceptions.NoSuchKey:
            return None
```

### 8.4 Visualization Pipeline

```python
"""
DeepSynaps: E-field Visualization Pipeline
"""

class EFieldVisualizer:
    """Generate interactive visualizations of SimNIBS E-field results."""
    
    async def generate_visualization(self, sim_result, template='mni152'):
        """
        Generate multi-view E-field visualization.
        
        Returns:
        - 3D cortical surface overlay (WebGL-compatible)
        - 2D slice views (axial, sagittal, coronal)
        - Depth profile plots
        - ROI coverage heatmap
        """
        
        # 1. Transform to template space if needed
        if template == 'mni152':
            efield_vol = sim_result.mni_volume
        elif template == 'fsavg':
            efield_surf = sim_result.fsavg_surface
        else:
            efield_vol = sim_result.native_volume
        
        # 2. Generate 3D cortical surface mesh with E-field colors
        surface_mesh = await self._generate_surface_mesh(
            efield_surf,
            colormap='viridis',
            clim=(0, sim_result.peak_field * 0.95)
        )
        
        # 3. Generate 2D slice overlays
        slice_overlays = await self._generate_slice_views(
            efield_vol,
            slices=['axial', 'sagittal', 'coronal'],
            overlay_alpha=0.6
        )
        
        # 4. Generate depth profile
        depth_profile = await self._generate_depth_profile(
            sim_result,
            roi_center=sim_result.target_center
        )
        
        return VisualizationResult(
            surface_3d=surface_mesh,
            slices=slice_overlays,
            depth_profile=depth_profile,
            coverage_stats=sim_result.roi_coverage
        )
    
    async def _generate_surface_mesh(self, efield_surf, colormap, clim):
        """Convert FreeSurfer surface to WebGL-compatible mesh."""
        # Use nibabel to read surface + SimNIBS field overlay
        # Convert to glTF/Three.js format
        pass
    
    async def _generate_slice_views(self, efield_vol, slices, overlay_alpha):
        """Generate 2D slice images with E-field overlay."""
        # Use nilearn plotting utilities
        pass
```

---

## 9. Provenance & Confidence Model

### 9.1 Evidence Classification

```
Simulation Result Confidence Levels
====================================

Level 5: VALIDATED
  - Cross-validated with multiple tools (SimNIBS + ROAST)
  - Compared against intracranial recordings (where available)
  - Conductivity values calibrated to subject
  - Anisotropic modeling used
  - Mesh quality: gamma > 0.3 for all elements
  - Segmentations manually verified

Level 4: HIGH_CONFIDENCE
  - Standard SimNIBS pipeline with CHARM
  - Both T1 + T2 inputs used
  - Mesh quality: gamma > 0.1 for all elements
  - Quality control report reviewed
  - Standard (validated) conductivity values

Level 3: MODERATE_CONFIDENCE
  - Standard SimNIBS pipeline
  - T1 only (no T2)
  - Isotropic conductivity
  - Automated QC passed
  - Minor segmentation issues resolved

Level 2: LOW_CONFIDENCE
  - Suboptimal MRI quality (motion, artifacts)
  - T1 only, low resolution (> 1.5 mm)
  - Mesh quality warnings present
  - Potential segmentation errors
  - Requires expert review

Level 1: PRELIMINARY
  - Template/atlas-based head model
  - No individual MRI available
  - Group-average conductivity values
  - For screening/planning only
  - NOT for clinical decision-making
```

### 9.2 Provenance Tracking

```json
{
  "provenance": {
    "simulation_id": "sim_20250722_001",
    "version": "1.0.0",
    "created_at": "2025-07-22T10:30:00Z",
    "software": {
      "name": "SimNIBS",
      "version": "4.6.0",
      "solver": "PETSc",
      "license": "GPL-3.0"
    },
    "input_data": {
      "t1_mri": {
        "path": "s3://mri/sub01/t1.nii.gz",
        "acquisition_date": "2025-07-15",
        "scanner": "Siemens Prisma 3T",
        "resolution_mm": [1.0, 1.0, 1.0],
        "quality_score": 0.92
      },
      "t2_mri": {
        "path": "s3://mri/sub01/t2.nii.gz",
        "acquisition_date": "2025-07-15",
        "quality_score": 0.88
      }
    },
    "segmentation": {
      "pipeline": "charm",
      "tissues_segmented": 9,
      "mesh_elements": 3456789,
      "mesh_quality_gamma_min": 0.15,
      "processing_time_seconds": 4823
    },
    "simulation_parameters": {
      "modality": "tDCS",
      "currents_mA": [1.0, -1.0],
      "electrodes": [
        {"center": "C3", "shape": "rect", "dims_mm": [50, 50]},
        {"center": "AF4", "shape": "rect", "dims_mm": [70, 50]}
      ],
      "conductivity_type": "isotropic",
      "solver": "PETSc",
      "solver_time_seconds": 47
    },
    "validation": {
      "mesh_quality_check": "PASSED",
      "conductivity_range_check": "PASSED",
      "current_conservation_check": "PASSED",
      "visual_inspection": "PASSED"
    },
    "confidence_level": 4,
    "disclaimer": "RESEARCH_TOOL: This simulation was produced by SimNIBS, a research software. Results require clinical interpretation and should not be used as sole basis for treatment decisions."
  }
}
```

### 9.3 Uncertainty Quantification

SimNIBS supports uncertainty quantification (UQ) for conductivity parameters:

```python
# Uncertainty quantification setup
tdcs.cond[0].distribution_type = "beta"      # White matter
tdcs.cond[0].distribution_parameters = [3, 3, 0.1, 0.4]  # [alpha, beta, min, max]

tdcs.cond[1].distribution_type = "beta"      # Gray matter
tdcs.cond[1].distribution_parameters = [3, 3, 0.1, 0.6]

tdcs.cond[6].distribution_type = "beta"      # Compact bone
tdcs.cond[6].distribution_parameters = [3, 3, 0.001, 0.012]

# Uses generalized Polynomial Chaos (gPC) expansion
# Provides mean E-field + standard deviation per element
# Computationally expensive: ~10-50x longer than single simulation
```

---

## 10. Clinical Safety Rules

### 10.1 Current Density Limits

| Metric | Safety Limit | Source | SimNIBS Check |
|--------|-------------|--------|---------------|
| **Skin current density** | < 0.14 A/m^2 (average) | Liebetanz et al., 2009 | Auto-compute from simulation |
| **Brain current density** | < 0.32 A/m^2 (peak) | Computational models | Flag if exceeded |
| **Charge density** | < 52,400 C/m^2 | Liebetanz et al., 2009 | Compute I * t / area |
| **Electrode current** | <= 4 mA total | Consensus safety guideline | Input validation |
| **Session duration** | <= 40 minutes | Meta-analysis (Bikson et al.) | Protocol validation |

**Critical Safety Calculations**:

```python
"""
DeepSynaps: Safety Validation for tDCS Simulations
"""

class SafetyValidator:
    """Validate stimulation protocols against safety thresholds."""
    
    # Safety constants
    MAX_SKIN_CURRENT_DENSITY = 0.14  # A/m^2
    MAX_BRAIN_CURRENT_DENSITY = 0.32  # A/m^2  
    MAX_TOTAL_CURRENT_MA = 4.0
    MAX_SESSION_DURATION_MIN = 40
    MAX_CHARGE_DENSITY = 52400  # C/m^2
    
    def validate_protocol(self, protocol, sim_result):
        """
        Full safety validation of a stimulation protocol.
        
        Returns:
            SafetyReport with PASS/WARN/FAIL status per metric
        """
        checks = {
            'total_current': self._check_total_current(protocol),
            'skin_current_density': self._check_skin_density(protocol, sim_result),
            'brain_current_density': self._check_brain_density(sim_result),
            'charge_density': self._check_charge_density(protocol),
            'duration': self._check_duration(protocol),
            'electrode_size': self._check_electrode_size(protocol)
        }
        
        overall = 'PASS' if all(c['status'] == 'PASS' for c in checks.values()) else \
                  'WARN' if any(c['status'] == 'WARN' for c in checks.values()) else 'FAIL'
        
        return SafetyReport(
            overall_status=overall,
            checks=checks,
            recommendations=self._generate_recommendations(checks)
        )
    
    def _check_skin_density(self, protocol, sim_result):
        """Check skin current density against 0.14 A/m^2 limit."""
        # Skin current density = electrode current / electrode area
        # Peak density is at electrode edges (can be 2-3x average)
        # SimNIBS computes actual distribution
        
        peak_skin_density = sim_result.peak_skin_current_density
        
        if peak_skin_density > self.MAX_SKIN_CURRENT_DENSITY:
            return {
                'status': 'FAIL',
                'value': peak_skin_density,
                'limit': self.MAX_SKIN_CURRENT_DENSITY,
                'message': f'Peak skin current density ({peak_skin_density:.3f} A/m^2) exceeds safety limit'
            }
        elif peak_skin_density > self.MAX_SKIN_CURRENT_DENSITY * 0.75:
            return {
                'status': 'WARN',
                'value': peak_skin_density,
                'limit': self.MAX_SKIN_CURRENT_DENSITY,
                'message': 'Skin current density approaching safety limit'
            }
        else:
            return {
                'status': 'PASS',
                'value': peak_skin_density,
                'limit': self.MAX_SKIN_CURRENT_DENSITY
            }
    
    def _check_brain_density(self, sim_result):
        """Check brain current density against computed limits."""
        peak_brain_density = sim_result.peak_brain_current_density
        
        if peak_brain_density > self.MAX_BRAIN_CURRENT_DENSITY:
            return {
                'status': 'WARN',
                'value': peak_brain_density,
                'limit': self.MAX_BRAIN_CURRENT_DENSITY,
                'message': 'Brain current density elevated - monitor subject closely'
            }
        return {'status': 'PASS', 'value': peak_brain_density}
    
    def _check_charge_density(self, protocol):
        """Check charge density = I * t / A against lesion threshold."""
        max_charge_density = 0
        for electrode in protocol.electrodes:
            current = abs(electrode.current_A)
            area_m2 = electrode.area_mm2 * 1e-6
            duration_s = protocol.duration_min * 60
            charge_density = (current * duration_s) / area_m2
            max_charge_density = max(max_charge_density, charge_density)
        
        if max_charge_density > self.MAX_CHARGE_DENSITY:
            return {
                'status': 'FAIL',
                'value': max_charge_density,
                'limit': self.MAX_CHARGE_DENSITY,
                'message': 'Charge density exceeds histological lesion threshold'
            }
        return {'status': 'PASS', 'value': max_charge_density}
```

### 10.2 Individual Anatomical Variation Impact

Anatomical factors that affect E-field distribution:

| Factor | Variability | E-field Impact | Mitigation |
|--------|------------|----------------|------------|
| **Skull thickness** | 3-12 mm | Up to 40% variation in cortical E-field | Individual MRI-based modeling |
| **CSF layer thickness** | 1-5 mm | Shunting current away from cortex | T2-FLAIR for enhanced CSF segmentation |
| **Cortical folding** | Individual gyral patterns | Focality differences up to 30% | High-resolution T1, TopoFit surfaces |
| **Lesions/cavities** | Pathology-dependent | Can significantly redirect current | Manual lesion mask inclusion |
| **Scalp-to-cortex distance** | 10-25 mm | Inverse relationship with E-field | Individual head models |
| **Spongy bone fraction** | 20-60% | Affects current penetration | CHARM dual-bone segmentation |

### 10.3 Mesh Quality Validation

```python
MESH_QUALITY_THRESHOLDS = {
    'gamma_min': 0.1,           # Minimum element quality
    'gamma_mean': 0.5,          # Mean element quality
    'max_aspect_ratio': 10.0,   # Maximum aspect ratio
    'min_dihedral_angle': 5.0,  # Degrees
    'max_dihedral_angle': 160.0, # Degrees
    'element_count_min': 1_000_000,
    'element_count_max': 10_000_000,
    'surface_self_intersections': 0,  # Must be zero
    'volume_negative_elements': 0     # Must be zero
}

def validate_mesh_quality(mesh_file):
    """Validate head mesh quality for FEM simulation."""
    mesh = simnibs.read_msh(mesh_file)
    
    quality_report = {
        'element_count': len(mesh.elm),
        'gamma_stats': compute_gamma_statistics(mesh),
        'intersection_count': check_self_intersections(mesh),
        'negative_volume_count': check_negative_volumes(mesh),
        'passes_thresholds': True
    }
    
    for metric, threshold in MESH_QUALITY_THRESHOLDS.items():
        if quality_report.get(metric, 0) < threshold:
            quality_report['passes_thresholds'] = False
            quality_report['failure_reason'] = f'{metric} below threshold'
    
    return quality_report
```

### 10.4 Research-Only Flagging

All SimNIBS simulation results must carry explicit disclaimers:

```python
RESEARCH_DISCLAIMER = """
=====================================================================
SIMULATION RESULT DISCLAIMER
=====================================================================

This electric field simulation was generated by SimNIBS, an open-source
research software for modeling non-invasive brain stimulation.

IMPORTANT LIMITATIONS:
1. This is a COMPUTATIONAL MODEL, not a direct measurement.
2. Results are based on simplified anatomical and biophysical assumptions.
3. Tissue conductivity values are population averages, not individual measurements.
4. The model does not account for all individual anatomical variations.
5. SimNIBS was NOT tested for accuracy in pathological conditions.

CLINICAL STATUS:
- This simulation is intended for RESEARCH and PROTOCOL PLANNING only.
- It should NOT be used as the sole basis for clinical treatment decisions.
- Actual stimulation effects may differ from predicted E-field distributions.
- Clinical validation by qualified healthcare professionals is required.

CONFIDENCE LEVEL: {confidence_level}/5
MESH QUALITY: {mesh_quality}
VALIDATION STATUS: {validation_status}

Generated: {timestamp}
Software: SimNIBS {version}
=====================================================================
"""
```

---

## 11. Implementation Recommendations

### 11.1 Phase 1 Implementation (Immediate)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|-------------|
| SimNIBS Docker container build | CRITICAL | 1 week | Dockerfile, base image |
| Basic simulation API endpoint | CRITICAL | 1 week | Container, API framework |
| Async job queue integration | CRITICAL | 1 week | Redis/RabbitMQ setup |
| Result storage (S3) + caching | HIGH | 3 days | Object storage |
| Safety validation middleware | HIGH | 3 days | Safety rules engine |
| Basic visualization endpoint | HIGH | 1 week | Three.js/nilearn |
| Provenance tracking | MEDIUM | 3 days | Database schema |

### 11.2 Phase 2 Implementation (Short-term)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|-------------|
| CHARM pipeline automation | HIGH | 2 weeks | Container, MRI QC |
| Leadfield precomputation | HIGH | 1 week | CHARM output |
| TMS ADM optimization | HIGH | 1 week | SimNIBS 4.5+ |
| TES leadfield optimization | HIGH | 1 week | Leadfield storage |
| TES flex optimization (v4.5+) | MEDIUM | 2 weeks | Optimization API |
| Uncertainty quantification | MEDIUM | 1 week | Extended simulation |
| Multi-subject group analysis | MEDIUM | 1 week | MNI transformation |

### 11.3 Phase 3 Implementation (Long-term)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|-------------|
| Real-time E-field approximation | MEDIUM | 4 weeks | ML model training |
| Anisotropic conductivity (DTI) | MEDIUM | 2 weeks | DTI preprocessing |
| Custom lesion/tumor handling | MEDIUM | 2 weeks | add_tissues_to_upsampled |
| Patient-specific conductivity calibration | LOW | 4 weeks | Experimental validation |
| Multi-coil TMS optimization | LOW | 3 weeks | Advanced optimization |
| Integration with neuronavigation systems | LOW | 4 weeks | Brainsight export |

### 11.4 Technology Stack Recommendation

```
DeepSynaps SimNIBS Integration Stack
=====================================

Compute:
  - SimNIBS 4.6.0 (Docker)
  - Ubuntu 22.04 base
  - Python 3.11
  - PETSc (default) + PARDISO (optimization)

Orchestration:
  - Celery (async task queue)
  - Redis (broker + result backend)
  - Flower (Celery monitoring)
  - PostgreSQL (job state persistence)

Storage:
  - MinIO/S3 (MRI volumes, head models, results)
  - PostgreSQL (metadata, provenance)
  - Redis (hot cache)

API:
  - FastAPI (REST endpoints)
  - WebSocket (progress streaming)
  - Pydantic (data validation)

Visualization:
  - nilearn (2D slice plots)
  - Three.js (3D web viewer)
  - plotly (interactive charts)
  - vtk.js (medical volume rendering)

Monitoring:
  - Prometheus (metrics)
  - Grafana (dashboards)
  - ELK stack (logs)
```

### 11.5 Docker Container Specification

```dockerfile
# DeepSynaps SimNIBS Service Container
# Based on SimNIBS 4.6.0
FROM ubuntu:22.04

LABEL maintainer="DeepSynaps Engineering"
LABEL version="4.6.0-ds.1"

# System dependencies
RUN apt-get update && apt-get install -y \
    python3.11 python3-pip \
    libopenblas-dev liblapack-dev \
    libhdf5-dev libxml2-dev \
    wget curl git \
    && rm -rf /var/lib/apt/lists/*

# Install SimNIBS 4.6.0
RUN wget https://github.com/simnibs/simnibs/releases/download/v4.6.0/simnibs-4.6.0-Linux.tar.gz \
    && tar -xzf simnibs-4.6.0-Linux.tar.gz -C /opt \
    && rm simnibs-4.6.0-Linux.tar.gz

ENV SIMNIBS_DIR=/opt/simnibs-4.6.0
ENV PATH="${SIMNIBS_DIR}/bin:${PATH}"
ENV PYTHONPATH="${SIMNIBS_DIR}/python:${PYTHONPATH}"

# Install DeepSynaps service wrapper
COPY requirements.txt /app/
RUN pip3 install -r /app/requirements.txt

COPY service/ /app/service/
WORKDIR /app

# Expose API port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["python3", "-m", "service.main"]
```

---

## 12. Risks & Mitigations

### 12.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **SimNIBS GPL v3 incompatibility** | LOW | HIGH | Containerize as separate service; no linking with proprietary code |
| **Long computation times** | HIGH | MEDIUM | Async pipeline; leadfield precomputation; caching; horizontal scaling |
| **Memory exhaustion (PARDISO)** | MEDIUM | HIGH | Use PETSc by default; resource monitoring; swap to disk |
| **Segmentation failures** | MEDIUM | HIGH | MRI quality gates; retry with different parameters; manual fallback |
| **Mesh quality issues** | MEDIUM | MEDIUM | Automated QC; re-meshing strategies; manual intervention workflow |
| **Version incompatibility** | LOW | HIGH | Pin SimNIBS version; regression testing; migration scripts |
| **Platform-specific bugs** | LOW | MEDIUM | Linux-first deployment; CI/CD multi-platform testing |

### 12.2 Clinical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Over-reliance on simulations** | HIGH | CRITICAL | Clear disclaimers; require clinical oversight; education |
| **Safety threshold violations** | LOW | CRITICAL | Automated safety validation; hard limits; approval workflows |
| **Individual anatomy not captured** | MEDIUM | HIGH | MRI quality standards; lesion handling; patient-specific modeling |
| **Conductivity value errors** | LOW | MEDIUM | Population-standard values; UQ where feasible; validation studies |
| **Research-only tool for clinical use** | MEDIUM | HIGH | Explicit disclaimers; clinical governance; regulatory awareness |

### 12.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Worker node failures** | MEDIUM | MEDIUM | Auto-restart; job persistence; checkpointing |
| **Storage capacity limits** | MEDIUM | MEDIUM | TTL policies; compression; tiered storage |
| **Concurrent job overload** | MEDIUM | MEDIUM | Rate limiting; priority queues; auto-scaling |
| **Data privacy (MRI data)** | LOW | CRITICAL | Encryption at rest/in transit; access controls; audit logging |
| **Vendor lock-in to SimNIBS** | LOW | LOW | ROAST as fallback; modular architecture; standard formats |

### 12.4 Regulatory Considerations

SimNIBS is classified as a **research tool**, not a medical device. For DeepSynaps clinical integration:

- All simulation results must include research-only disclaimers
- The platform should clearly distinguish simulated vs. measured data
- Clinical decision-making should not rely solely on simulation outputs
- Consider FDA/CE marking implications if simulations are embedded in treatment workflows
- Maintain documentation of SimNIBS validation studies for regulatory submissions
- Implement audit trails for all simulation-based protocol recommendations

---

## Appendices

### Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **FEM** | Finite Element Method - numerical technique for solving partial differential equations |
| **CHARM** | Combined Human Antomical Reconstruction Method - SimNIBS 4.x segmentation pipeline |
| **ADM** | Auxiliary Dipole Method - fast TMS optimization technique |
| **Leadfield** | Linear operator mapping electrode currents to E-field at all mesh points |
| **E-field** | Electric field vector (V/m) - the physical quantity inducing neural modulation |
| **ROI** | Region of Interest - target brain area for stimulation |
| **Mesh** | Tetrahedral discretization of head volume for FEM calculations |
| **Segmentation** | Classification of MRI voxels into tissue types |
| **Quasi-static** | Approximation valid when electromagnetic wavelength >> head dimensions |
| **tDCS** | transcranial Direct Current Stimulation |
| **tACS** | transcranial Alternating Current Stimulation |
| **tRNS** | transcranial Random Noise Stimulation |
| **TMS** | Transcranial Magnetic Stimulation |
| **HD-tDCS** | High-Definition tDCS - multi-electrode focal stimulation |
| **ROI** | Region of Interest |

### Appendix B: File Format Reference

| Format | Extension | Description | Tool |
|--------|-----------|-------------|------|
| Gmsh Mesh | `.msh` | Binary v2, triangles + tetrahedra | SimNIBS, Gmsh |
| NIfTI | `.nii.gz` | Volumetric images, E-field maps | FSL, SPM, ANTs |
| FreeSurfer Surface | `.central`, `.pial` | Cortical surface meshes | FreeSurfer |
| HDF5 | `.hdf5` | Leadfield matrices, optimization data | h5py |
| CCD | `.ccd` | TMS coil dipole models | SimNIBS |
| TCD | `.tcd` | TMS coil geometry (v4.5+) | SimNIBS |
| NII Coil | `.nii.gz` | TMS coil magnetic field grid | SimNIBS |

### Appendix C: Performance Benchmarks

| Operation | Hardware | Duration | Memory |
|-----------|----------|----------|--------|
| CHARM segmentation (T1+T2) | 8-core Xeon | 1-2 hours | 16 GB |
| CHARM segmentation (T1 only) | 8-core Xeon | 1-1.5 hours | 12 GB |
| Single tDCS simulation | 8-core Xeon | 15-60 seconds | 6-32 GB |
| Single TMS simulation | 8-core Xeon | 15-35 seconds | 6-32 GB |
| Leadfield computation (10-10) | 8-core Xeon | 10-30 minutes | 32 GB |
| TMS ADM optimization | 8-core Xeon | 5-15 minutes | 6.5 GB |
| TES leadfield optimization | 8-core Xeon | 1-10 minutes | 16 GB |
| TES flex optimization | 16-core Xeon | 30-120 minutes | 32 GB |
| UQ simulation (gPC) | 8-core Xeon | 1-4 hours | 32 GB |

### Appendix D: References

1. Thielscher, A., et al. (2015). Field modeling for transcranial magnetic stimulation: A useful tool to understand the physiological effects of TMS? *IEEE EMBS*, 222-225.

2. Windhoff, M., Opitz, A., & Thielscher, A. (2013). Electric field calculations in brain stimulation based on finite elements. *NeuroImage*, 117, 18-35.

3. Nielsen, J. D., et al. (2018). Automatic skull segmentation from MR images for realistic volume conductor modeling of the head using a neural network. *NeuroImage*, 174, 585-592.

4. Saturnino, G. B., et al. (2019). SimNIBS 2.1: A comprehensive pipeline for individualized electric field modelling. *Springer Protocols*.

5. Puonti, O., et al. (2020). The importance of skull modeling in EEG source imaging. *NeuroImage*, 223, 117299.

6. Gomez, L. J., et al. (2021). Fast computational optimization of TMS coil placement for individualized electric field targeting. *NeuroImage*, 228, 117696.

7. Huang, Y., et al. (2019). Realistic volumetric-approach to simulate transcranial electric stimulation - ROAST. *J Neural Eng*, 16(5), 056006.

8. Huang, Y., et al. (2013). Measurements and models of electric fields in the in vivo human brain during transcranial electric stimulation. *eLife*.

9. Liebetanz, D., et al. (2009). Safety limits of cathodal transcranial direct current stimulation in rats. *Clinical Neurophysiology*, 120(6), 1161-1167.

10. Bikson, M., et al. (2016). Safety of transcranial Direct Current Stimulation. *Brain Stimulation*, 9(5), 641-661.

11. Opitz, A., et al. (2015). How the brain tissue shapes the electric field induced by transcranial magnetic stimulation. *PNAS*, 112(11), 17802-17811.

12. Wagner, S., et al. (2004). Automatic segmentation of head tissues from MRI for realistic volume conductor modeling. *Proc Intl Soc Mag Reson Med*.

13. Cao, M., Madsen, K. H., et al. (2024). A leadfield-free optimization framework for transcranially applied electric currents. *Brain Stimulation*.

14. SimNIBS Documentation (v4.6.0). https://simnibs.github.io/simnibs/

15. SimNIBS GitHub Repository. https://github.com/simnibs/simnibs

---

*Document generated for DeepSynaps Protocol Studio - PHASE 1 Knowledge Layer*
*All simulation results from SimNIBS must include research-only disclaimers*
*Clinical usage of SimNIBS is not supported or advised by the SimNIBS developers*

---

**END OF REPORT**
