# MRI Segmentation AI Stack: The Definitive Clinical Neuroimaging Guide

> **Version**: 1.0.0  
> **Date**: July 2025  
> **Domain**: Clinical Neuroimaging, Deep Learning, Medical AI  
> **Target Audience**: Radiologists, Neuroradiologists, ML Engineers, Clinical AI Researchers  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Brain Extraction (Skull Stripping)](#2-brain-extraction-skull-stripping)
   - 2.1 [HD-BET](#21-hd-bet)
   - 2.2 [FSL BET](#22-fsl-bet)
   - 2.3 [ANTs Brain Extraction](#23-ants-brain-extraction)
   - 2.4 [SynthSeg (FreeSurfer)](#24-synthseg-freesurfer)
   - 2.5 [FastSurfer](#25-fastsurfer)
3. [Lesion Segmentation](#3-lesion-segmentation)
   - 3.1 [LST (Lesion Segmentation Toolbox)](#31-lst-lesion-segmentation-toolbox)
   - 3.2 [SAMRI (SAM for MRI)](#32-samri-sam-for-mri)
   - 3.3 [DeepMedic](#33-deepmedic)
4. [ROI / Atlas-Based Segmentation](#4-roi--atlas-based-segmentation)
   - 4.1 [TotalSegmentator](#41-totalsegmentator)
   - 4.2 [MONAI](#42-monai)
   - 4.3 [nnU-Net](#43-nnu-net)
5. [Comparative Analysis](#5-comparative-analysis)
6. [FastAPI Integration Patterns](#6-fastapi-integration-patterns)
7. [Clinical Deployment Guide](#7-clinical-deployment-guide)
8. [GPU Requirements & Benchmarks](#8-gpu-requirements--benchmarks)
9. [References](#9-references)

---

## 1. Executive Summary

This guide provides a comprehensive technical reference for **11 state-of-the-art MRI segmentation tools** used in clinical neuroimaging. Each tool is evaluated across eight dimensions:

| Dimension | Description |
|-----------|-------------|
| **GitHub/Source** | Official repository URL |
| **License** | Open-source license type |
| **Installation** | Exact pip/conda/docker commands |
| **Python Usage** | Minimal working code example |
| **Accuracy Metrics** | Published Dice scores, clinical benchmarks |
| **GPU Requirements** | VRAM, CUDA version, CPU fallback |
| **Clinical Validation** | FDA status, CE marking, published trials |
| **FastAPI Integration** | REST API wrapper code |

### Top 10 Segmentation Tools at a Glance

| Rank | Tool | Category | License | GPU Required | Clinical Status |
|------|------|----------|---------|-------------|-----------------|
| 1 | **nnU-Net** | General/ROI | Apache 2.0 | Recommended | Research-only |
| 2 | **MONAI** | Framework | Apache 2.0 | Optional | Research + Deploy |
| 3 | **HD-BET** | Brain Extraction | MIT | Optional | Research-only |
| 4 | **TotalSegmentator** | Whole-Body | Apache 2.0 | Optional | FDA components |
| 5 | **SynthSeg** | Brain Seg | FreeSurfer | Optional | Research-only |
| 6 | **FastSurfer** | Cortical Recon | Apache 2.0 | Recommended | Research-only |
| 7 | **DeepMedic** | Lesion Seg | BSD | Required | Research-only |
| 8 | **SAMRI** | SAM for MRI | Apache 2.0 | Recommended | Research-only |
| 9 | **LST** | WMH Lesion | GPL | No | Research-only |
| 10 | **ANTs** | Registration | Apache 2.0 | No | Research + Clinical |

---

## 2. Brain Extraction (Skull Stripping)

Brain extraction (skull stripping) is the foundational preprocessing step that removes non-brain tissue (scalp, skull, eyes, meninges) from structural MRI scans. Accurate brain extraction is critical for downstream volumetric analysis, registration, and segmentation pipelines.

---

### 2.1 HD-BET

**HD-BET (High-Definition Brain Extraction Tool)** is a deep learning-based brain extraction method developed at the German Cancer Research Center (DKFZ). It outperforms traditional methods like FSL BET, especially on pathological brains with tumors, lesions, and atrophy.

| Attribute | Details |
|-----------|---------|
| **Full Name** | High-Definition Brain Extraction Tool |
| **Institution** | DKFZ (German Cancer Research Center) |
| **Authors** | Isensee et al. |
| **GitHub** | https://github.com/MIC-DKFZ/HD-BET |
| **License** | Apache 2.0 |
| **Paper** | "Automated brain extraction of multi-sequence MRI using artificial neural networks" (Human Brain Mapping, 2019) |
| **DOI** | 10.1002/hbm.24750 |

#### Installation

```bash
# Clone repository
git clone https://github.com/MIC-DKFZ/HD-BET
cd HD-BET

# Install (Python 3.6+)
pip install -e .

# Model weights auto-download to ~/hd-bet_params on first run
```

**Dependencies**: Python 3.6+, PyTorch, numpy, nibabel, SimpleITK, batchgenerators

#### Python Usage Example

```python
import os
from HD_BET.run import run_hd_bet
from HD_BET.utils import maybe_download_parameters

# Ensure model parameters are downloaded
maybe_download_parameters()

# Single file brain extraction
run_hd_bet(
    input_file="/path/to/t1_mri.nii.gz",
    output_file="/path/to/brain_extracted.nii.gz",
    mode="accurate",      # "fast" or "accurate"
    device="cuda",        # "cuda", "cuda:0", or "cpu"
    do_tta=True,          # test-time augmentation
    config_file=os.path.expanduser("~/hd-bet_params/config.cfg")
)

# Batch processing
import glob
input_files = sorted(glob.glob("/data/raw/*.nii.gz"))
output_files = [f.replace("/raw/", "/bet/") for f in input_files]

for inp, out in zip(input_files, output_files):
    run_hd_bet(
        input_file=inp,
        output_file=out,
        mode="fast",
        device="cuda"
    )
```

#### Command Line Interface

```bash
# Basic usage
hd-bet -i input.nii.gz -o output.nii.gz

# With options
hd-bet -i input.nii.gz -o output_folder \
       -device cuda \
       -mode accurate \
       -tta 1

# Batch processing
hd-bet -i /folder/with/niftis/ -o /output/folder/ -mode fast
```

#### Expected Accuracy Metrics

| Metric | HD-BET | FSL BET | ROBEX | 3D-SkullStrip |
|--------|--------|---------|-------|---------------|
| **Dice Score** | 0.984 +/- 0.012 | 0.971 +/- 0.025 | 0.978 +/- 0.018 | 0.976 +/- 0.020 |
| **Sensitivity** | 0.990 +/- 0.015 | 0.985 +/- 0.030 | 0.982 +/- 0.025 | 0.980 +/- 0.028 |
| **Specificity** | 0.998 +/- 0.003 | 0.995 +/- 0.008 | 0.997 +/- 0.005 | 0.996 +/- 0.006 |
| **HD95 (mm)** | 1.42 +/- 0.8 | 2.31 +/- 1.5 | 1.89 +/- 1.2 | 1.95 +/- 1.3 |

> HD-BET outperformed 5 publicly available brain extraction algorithms across 5,000+ MRI scans from 72 different MRI protocols including T1w, T2w, FLAIR, and contrast-enhanced sequences.

#### GPU Requirements

| Mode | GPU VRAM | Time per Scan |
|------|----------|---------------|
| CPU (fast) | N/A | ~45 seconds |
| CPU (accurate + TTA) | N/A | ~8 minutes |
| GPU (fast) | 4 GB | ~3 seconds |
| GPU (accurate + TTA) | 4 GB | ~20 seconds |

#### Clinical Validation Status

- **FDA Cleared**: No
- **CE Marked**: No
- **Clinical Trials**: Extensively validated on 5,000+ scans from multiple institutions
- **Robustness**: Handles pathology (tumors, stroke, atrophy), pediatric brains, and various MRI sequences
- **Recommendation**: **Production-ready for research pipelines; requires clinical validation for diagnostic use**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import tempfile
import os
from HD_BET.run import run_hd_bet

app = FastAPI(title="HD-BET Brain Extraction API")

@app.post("/extract-brain/")
async def extract_brain(
    file: UploadFile = File(...),
    mode: str = "fast",
    device: str = "cuda"
):
    """
    Perform HD-BET brain extraction on uploaded NIfTI file.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, "input.nii.gz")
        output_path = os.path.join(tmpdir, "brain.nii.gz")
        
        with open(input_path, "wb") as f:
            f.write(await file.read())
        
        run_hd_bet(
            input_file=input_path,
            output_file=output_path,
            mode=mode,
            device=device,
            do_tta=(mode == "accurate")
        )
        
        return FileResponse(
            output_path,
            media_type="application/gzip",
            filename="brain_extracted.nii.gz"
        )

# Health check
@app.get("/health")
async def health():
    return {"status": "healthy", "gpu_available": torch.cuda.is_available()}
```

---

### 2.2 FSL BET

**FSL BET (Brain Extraction Tool)** is the classic, widely-used brain extraction tool from the FMRIB Software Library. It is a surface deformation method that has been the gold standard for over two decades.

| Attribute | Details |
|-----------|---------|
| **Full Name** | Brain Extraction Tool (BET2) |
| **Institution** | FMRIB, University of Oxford |
| **Authors** | Smith et al. |
| **Website** | https://fsl.fmrib.ox.ac.uk/fsl/fslwiki/BET |
| **License** | Academic/Commercial (FSL License) |
| **Paper** | "Fast robust automated brain extraction" (Human Brain Mapping, 2002) |
| **DOI** | 10.1002/hbm.10062 |

#### Installation

```bash
# Method 1: Official FSL installer (Linux/macOS)
wget -O- https://fsl.fmrib.ox.ac.uk/fsldownloads/fslinstaller.py | python

# Method 2: Neurodebian (Ubuntu/Debian)
sudo apt-get install fsl-core

# Method 3: Conda
conda install -c conda-forge fsl-bet2

# Verify installation
bet2 -h
```

#### Python Usage Example (via subprocess)

```python
import subprocess
import os

def run_bet(input_path: str, output_path: str, 
            fractional_intensity: float = 0.5,
            gradient: float = 0.0,
            robust: bool = False,
            mask: bool = True) -> str:
    """
    Run FSL BET brain extraction.
    
    Parameters:
    -----------
    input_path : str
        Path to input NIfTI file
    output_path : str
        Path to output brain-extracted file
    fractional_intensity : float
        Threshold (0-1); smaller = larger brain estimate
    gradient : float
        Vertical gradient (-1 to 1); positive = larger bottom
    robust : bool
        Iterative robust estimation
    mask : bool
        Generate binary brain mask
    """
    cmd = [
        "bet2",
        input_path,
        output_path,
        "-f", str(fractional_intensity),
        "-g", str(gradient)
    ]
    
    if robust:
        cmd.append("-R")
    if mask:
        cmd.append("-m")
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        raise RuntimeError(f"BET failed: {result.stderr}")
    
    mask_path = output_path.replace(".nii.gz", "_mask.nii.gz")
    return output_path, mask_path

# Usage
brain, mask = run_bet(
    "subject_t1.nii.gz",
    "subject_brain.nii.gz",
    fractional_intensity=0.4,  # More inclusive for atrophic brains
    robust=True,
    mask=True
)
```

#### Python Usage (via nipype)

```python
from nipype.interfaces.fsl import BET

bet = BET()
bet.inputs.in_file = "t1_brain.nii.gz"
bet.inputs.out_file = "brain_extracted.nii.gz"
bet.inputs.frac = 0.5
bet.inputs.robust = True
bet.inputs.mask = True
bet.inputs.no_output = False

result = bet.run()
print(f"Brain mask: {result.outputs.mask_file}")
```

#### Expected Accuracy Metrics

| Dataset | Dice Score | Notes |
|---------|-----------|-------|
| Healthy T1w | 0.971 +/- 0.025 | Excellent on normal anatomy |
| Pathological | 0.92-0.96 | Struggles with tumors/atrophy |
| Pediatric | 0.94-0.97 | May require parameter tuning |
| Non-T1w | 0.88-0.95 | FLAIR/T2 requires -f adjustment |

#### GPU Requirements

| Mode | Requirements | Time per Scan |
|------|-------------|---------------|
| CPU | No GPU required | 1-5 seconds |

#### Clinical Validation Status

- **FDA Cleared**: No (but used in FDA-cleared pipelines)
- **CE Marked**: No
- **Citations**: 25,000+ in PubMed
- **Limitations**: Parameter-sensitive; may fail on brains with large lesions, tumors, or severe atrophy
- **Recommendation**: **Reliable for healthy brains; use HD-BET for pathological cases**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse
import tempfile
import subprocess
import os

app = FastAPI(title="FSL BET Brain Extraction API")

@app.post("/extract-brain/")
async def extract_brain(
    file: UploadFile = File(...),
    fractional_intensity: float = Form(0.5),
    robust: bool = Form(False)
):
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out = os.path.join(tmpdir, "brain")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        cmd = ["bet2", inp, out, "-f", str(fractional_intensity), "-m"]
        if robust:
            cmd.append("-R")
        
        subprocess.run(cmd, check=True)
        
        brain_path = out + ".nii.gz"
        mask_path = out + "_mask.nii.gz"
        
        return {
            "brain_file": brain_path,
            "mask_file": mask_path,
            "fractional_intensity": fractional_intensity
        }
```

---

### 2.3 ANTs Brain Extraction

**ANTs (Advanced Normalization Tools)** provides brain extraction via template-based registration using the SyN (Symmetric Normalization) algorithm. It offers both traditional template-based methods and modern deep learning approaches through ANTsPyNet.

| Attribute | Details |
|-----------|---------|
| **Full Name** | ANTs Brain Extraction (antsBrainExtraction.sh) |
| **Institution** | University of Virginia / UPenn |
| **Authors** | Tustison, Avants et al. |
| **GitHub** | https://github.com/ANTsX/ANTs |
| **ANTsPy** | https://github.com/ANTsX/ANTsPy |
| **License** | Apache 2.0 |
| **Paper** | "The ANTs cortical thickness pipeline" (2014) |

#### Installation

```bash
# Method 1: ANTsPy (Python bindings - RECOMMENDED)
pip install antspyx

# Method 2: ANTsRNet / ANTsPyNet (deep learning extensions)
pip install antspynet

# Method 3: System install (Linux)
# Download from GitHub releases
wget https://github.com/ANTsX/ANTs/releases/download/v2.5.0/ants-2.5.0-linux-binaries.zip
unzip ants-2.5.0-linux-binaries.zip
export PATH=$PWD/ants-binaries:$PATH
```

#### Python Usage Example (ANTsPy)

```python
import ants
import antspynet

# Load T1-weighted MRI
t1 = ants.image_read("subject_t1.nii.gz")

# Method 1: Deep learning brain extraction (recommended)
brain_mask = antspynet.brain_extraction(
    t1, 
    modality="t1",
    verbose=True
)
brain = t1 * brain_mask

# Method 2: Combined extraction (ensemble approach)
seg = antspynet.brain_extraction(
    t1,
    modality="t1combined",
    verbose=True
)

# Method 3: Three-tissue segmentation
bext = antspynet.brain_extraction(
    t1,
    modality="t1threetissue",
    verbose=True
)
segmentation = bext['segmentation_image']
# Labels: 1=CSF, 2=GM, 3=WM

# Method 4: Template-based extraction (traditional)
template = ants.image_read("mni_template.nii.gz")
template_mask = ants.image_read("mni_brain_mask.nii.gz")

brain_mask = ants.abp_brain_extraction(
    img=t1,
    tem=template,
    temmask=template_mask,
    regtype="SyN",
    verbose=True
)

# Save results
ants.image_write(brain, "brain_extracted.nii.gz")
ants.image_write(brain_mask, "brain_mask.nii.gz")
```

#### Expected Accuracy Metrics

| Method | Dice Score | Notes |
|--------|-----------|-------|
| antspynet (t1) | 0.978 +/- 0.015 | Deep learning |
| antspynet (combined) | 0.981 +/- 0.012 | Ensemble approach |
| Template-based SyN | 0.970 +/- 0.020 | Registration-based |
| Template-based SyNabp | 0.975 +/- 0.018 | Slower but more accurate |

#### GPU Requirements

| Mode | GPU VRAM | Time per Scan |
|------|----------|---------------|
| CPU (template) | N/A | 5-15 minutes |
| CPU (antspynet) | N/A | 2-5 minutes |
| GPU (antspynet) | 6 GB | 30-60 seconds |

#### Clinical Validation Status

- **FDA Cleared**: No (but widely used in FDA-cleared pipelines)
- **CE Marked**: No
- **Citations**: 10,000+ in PubMed
- **Robustness**: Excellent across ages and conditions; part of widely-used cortical thickness pipeline
- **Recommendation**: **Excellent for cortical thickness studies; use antspynet for speed**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import tempfile
import ants
import antspynet

app = FastAPI(title="ANTs Brain Extraction API")

@app.post("/extract-brain/")
async def extract_brain(file: UploadFile = File(...)):
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out_brain = os.path.join(tmpdir, "brain.nii.gz")
        out_mask = os.path.join(tmpdir, "mask.nii.gz")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        t1 = ants.image_read(inp)
        mask = antspynet.brain_extraction(t1, modality="t1", verbose=False)
        brain = t1 * mask
        
        ants.image_write(brain, out_brain)
        ants.image_write(mask, out_mask)
        
        return FileResponse(out_brain, filename="brain.nii.gz")
```

---

### 2.4 SynthSeg (FreeSurfer)

**SynthSeg** is the first CNN trained to segment brain MRI scans of **any contrast and resolution without retraining**. It uses domain randomization with synthetic data, making it extraordinarily robust across clinical scanners.

| Attribute | Details |
|-----------|---------|
| **Full Name** | SynthSeg 2.0 |
| **Institution** | MIT / FreeSurfer |
| **Authors** | Billot, Greve, Puonti, Iglesias et al. |
| **GitHub** | https://github.com/BBillot/SynthSeg |
| **License** | FreeSurfer License (academic) |
| **Paper** | "Segmentation of brain MRI scans of any contrast and resolution without retraining" (MedIA, 2023) |
| **DOI** | 10.1016/j.media.2023.102789 |

#### Installation

```bash
# Method 1: Via FreeSurfer (v7.3.2+) - RECOMMENDED
# Download FreeSurfer from https://surfer.nmr.mgh.harvard.edu/
export FREESURFER_HOME=/usr/local/freesurfer
source $FREESURFER_HOME/SetUpFreeSurfer.sh

# Method 2: Standalone (Python)
git clone https://github.com/BBillot/SynthSeg.git
cd SynthSeg
pip install -e .

# TensorFlow 2.x is required
pip install tensorflow>=2.0
```

#### Python Usage Example

```python
from SynthSeg.predict import predict
import nibabel as nib

# Basic whole-brain segmentation
predict(
    path_images="/path/to/input_t1.nii.gz",
    path_segmentations="/path/to/output_seg.nii.gz",
    path_model="/path/to/SynthSeg/models/synthseg_2.0.h5",
    robust=False,           # Set True for low-quality scans
    fast=True,              # Disable test-time augmentation
    v1=False                # Use SynthSeg 2.0
)

# With cortical parcellation and QC
predict(
    path_images="input.nii.gz",
    path_segmentations="seg.nii.gz",
    path_posteriors="posteriors.nii.gz",      # Posterior probabilities
    path_volumes="volumes.csv",               # Volume statistics
    path_qc="qc_score.csv",                   # Quality control scores
    robust=True,                              # Robust mode
    do_parcellation=True,                     # Cortical parcellation
    n_neutral_labels=18,                      # For fast processing
    sigma=0.5                                 # Smoothing
)

# Command line usage via FreeSurfer
# mri_synthseg --i input.nii.gz --o segmentation.nii.gz --robust --parc
```

#### Command Line (FreeSurfer)

```bash
# Basic segmentation
mri_synthseg --i input.nii.gz --o segmentation.nii.gz

# With robust mode and cortical parcellation
mri_synthseg --i input.nii.gz --o seg.nii.gz --robust --parc --vol vol.csv --qc qc.csv

# Batch processing
mri_synthseg --i input_dir/ --o output_dir/ --robust
```

#### Expected Accuracy Metrics

| Test Condition | SynthSeg Dice | FreeSurfer Dice |
|---------------|--------------|-----------------|
| T1w (1mm) | 0.870 +/- 0.028 | 0.875 +/- 0.025 |
| T2w (1mm) | 0.855 +/- 0.035 | N/A |
| FLAIR (1mm) | 0.843 +/- 0.038 | N/A |
| Low-res (3mm) | 0.820 +/- 0.045 | N/A |
| CT scans | 0.790 +/- 0.055 | N/A |

> **Key advantage**: FreeSurfer only works on T1w; SynthSeg works on T2, FLAIR, proton density, CT, and any resolution without retraining.

#### GPU Requirements

| Mode | GPU VRAM | Time per Scan |
|------|----------|---------------|
| CPU | N/A | ~2 minutes |
| GPU | 8 GB | ~6 seconds |

#### Clinical Validation Status

- **FDA Cleared**: No
- **CE Marked**: No
- **Published in**: Medical Image Analysis (2023), PNAS (2023)
- **Robustness**: Validated on 5,000+ scans across 6 MRI modalities and 10 resolutions
- **Recommendation**: **Best-in-class for heterogeneous clinical data with varying contrasts**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse
import tempfile
import subprocess
import os

app = FastAPI(title="SynthSeg Segmentation API")

@app.post("/segment/")
async def segment_brain(
    file: UploadFile = File(...),
    robust: bool = Form(False),
    parcellation: bool = Form(False)
):
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out_seg = os.path.join(tmpdir, "seg.nii.gz")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        cmd = [
            "mri_synthseg",
            "--i", inp,
            "--o", out_seg
        ]
        if robust:
            cmd.append("--robust")
        if parcellation:
            cmd.append("--parc")
        
        subprocess.run(cmd, check=True, env={
            **os.environ,
            "FREESURFER_HOME": os.environ.get("FREESURFER_HOME", "/usr/local/freesurfer")
        })
        
        return FileResponse(out_seg, filename="synthseg.nii.gz")
```

---

### 2.5 FastSurfer

**FastSurfer** is a fast and accurate deep learning-based neuroimaging pipeline that provides a fully FreeSurfer-compatible alternative. It performs whole-brain segmentation in minutes and surface reconstruction in ~1 hour.

| Attribute | Details |
|-----------|---------|
| **Full Name** | FastSurfer |
| **Institution** | Deep-MI Lab, DZNE / University of Bonn |
| **Authors** | Reuter et al. |
| **GitHub** | https://github.com/Deep-MI/FastSurfer |
| **License** | Apache 2.0 |
| **Paper** | "Fast cortical surface reconstruction from MRI using deep learning" (PMC8907118) |

#### Installation

```bash
# Method 1: Docker (RECOMMENDED)
docker pull deepmi/fastsurfer:latest

# Method 2: Local install
git clone https://github.com/Deep-MI/FastSurfer.git
cd FastSurfer
pip install -e .

# Download checkpoints
python fastsurfer/download_checkpoints.py --all

# Requires FreeSurfer license for surface module
export FS_LICENSE=/path/to/license.txt
```

#### Python Usage Example

```python
import subprocess
import os

def run_fastsurfer(
    t1_file: str,
    output_dir: str,
    subject_id: str,
    seg_only: bool = True,
    device: str = "cuda"
):
    """
    Run FastSurfer pipeline.
    
    Parameters:
    -----------
    t1_file : str
        Path to T1-weighted NIfTI or mgz
    output_dir : str
        Output directory path
    subject_id : str
        Subject identifier
    seg_only : bool
        Run only segmentation (5 min) vs full pipeline (1 hour)
    device : str
        cuda or cpu
    """
    cmd = [
        "python", "run_fastsurfer.py",
        "--t1", t1_file,
        "--sid", subject_id,
        "--sd", output_dir,
        "--device", device
    ]
    
    if seg_only:
        cmd.append("--seg_only")
    
    # Optional modules
    # cmd.append("--no_cereb")     # Skip cerebellum segmentation
    # cmd.append("--no_hypothal")  # Skip hypothalamus
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        raise RuntimeError(f"FastSurfer failed: {result.stderr}")
    
    # Output structure:
    # {output_dir}/{subject_id}/mri/
    #   - aparc.DKTatlas+aseg.deep.mgz  (segmentation)
    #   - brain.mgz                      (brain extracted)
    #   - norm.mgz                       (intensity normalized)
    
    return os.path.join(output_dir, subject_id)

# Quick segmentation only (5 minutes GPU)
output = run_fastsurfer(
    t1_file="subject_t1.nii.gz",
    output_dir="/output/fastsurfer",
    subject_id="sub-001",
    seg_only=True,
    device="cuda"
)
```

#### Expected Accuracy Metrics

| Structure | FastSurfer Dice | FreeSurfer Dice |
|-----------|----------------|-----------------|
| Whole-brain seg | 0.89 +/- 0.04 | 0.88 +/- 0.05 |
| Cortical DKT | 0.91 +/- 0.03 | 0.90 +/- 0.04 |
| Subcortical | 0.92 +/- 0.03 | 0.91 +/- 0.03 |
| Cerebellum | 0.88 +/- 0.05 | 0.87 +/- 0.05 |
| Hypothalamus | 0.85 +/- 0.06 | N/A |

#### GPU Requirements

| Pipeline Stage | GPU VRAM | Time (GPU) | Time (CPU) |
|---------------|----------|------------|------------|
| Segmentation only | 8 GB | ~5 min | ~30 min |
| Full pipeline | 8 GB | ~60 min | ~8 hours |

#### Clinical Validation Status

- **FDA Cleared**: No
- **CE Marked**: No
- **Robustness**: Fully compatible with FreeSurfer output formats
- **Recommendation**: **Best drop-in replacement for FreeSurfer; use seg_only for rapid volumetrics**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse
import tempfile
import subprocess
import shutil

app = FastAPI(title="FastSurfer Segmentation API")

@app.post("/segment/")
async def segment(
    file: UploadFile = File(...),
    subject_id: str = Form("subject"),
    seg_only: bool = Form(True)
):
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out_dir = os.path.join(tmpdir, "output")
        os.makedirs(out_dir, exist_ok=True)
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        cmd = [
            "python", "run_fastsurfer.py",
            "--t1", inp,
            "--sid", subject_id,
            "--sd", out_dir,
            "--device", "cuda"
        ]
        if seg_only:
            cmd.append("--seg_only")
        
        subprocess.run(cmd, check=True)
        
        # Return segmentation file
        seg_file = os.path.join(
            out_dir, subject_id, "mri", 
            "aparc.DKTatlas+aseg.deep.mgz"
        )
        return FileResponse(seg_file, filename="segmentation.mgz")
```

---

## 3. Lesion Segmentation

Lesion segmentation targets pathological structures: white matter hyperintensities (WMH), brain tumors, stroke lesions, and multiple sclerosis plaques.

---

### 3.1 LST (Lesion Segmentation Toolbox)

**LST** is an open-source toolbox for SPM that segments white matter hyperintensities (WMH) from T1 and FLAIR MRI. It implements two complementary algorithms: LGA (unsupervised) and LPA (supervised).

| Attribute | Details |
|-----------|---------|
| **Full Name** | Lesion Segmentation Toolbox |
| **Institution** | Ludwig-Maximilians-Universitat Munchen |
| **Authors** | Schmidt, Gaser et al. |
| **Website** | https://www.applied-statistics.de/lst.html |
| **License** | GNU General Public License (GPL) |
| **Paper** | "An automated tool for detection of FLAIR-hyperintense white-matter lesions in MS" (NeuroImage, 2012) |

#### Installation

```bash
# Prerequisites: MATLAB + SPM12
# 1. Download LST from https://www.applied-statistics.de/lst.html
# 2. Unzip into SPM12/toolbox folder:
#    spm12/toolbox/LST/

# 3. Start MATLAB and SPM12
# 4. Select LST from the toolbox dropdown menu

# For Python integration, use MATLAB Engine API:
pip install matlabengine
```

#### Python Usage Example (via MATLAB Engine)

```python
import matlab.engine
import os

def run_lst_lpa(flair_path: str, t1_path: str = None, 
                output_dir: str = "./lst_output") -> dict:
    """
    Run LST Lesion Prediction Algorithm (LPA).
    
    LPA requires only FLAIR; T1 is optional but improves accuracy.
    Uses logistic regression trained on 53 MS patients.
    
    Parameters:
    -----------
    flair_path : str
        Path to FLAIR NIfTI
    t1_path : str, optional
        Path to T1 NIfTI (improves accuracy)
    output_dir : str
        Output directory
    
    Returns:
    --------
    dict with paths to lesion probability map and binary mask
    """
    os.makedirs(output_dir, exist_ok=True)
    
    eng = matlab.engine.start_matlab()
    
    # Add SPM and LST to MATLAB path
    spm_path = "/usr/local/spm12"
    eng.addpath(spm_path, nargout=0)
    eng.addpath(os.path.join(spm_path, "toolbox", "LST"), nargout=0)
    
    # Configure LPA
    eng.workspace['flair'] = flair_path
    if t1_path:
        eng.workspace['t1'] = t1_path
    eng.workspace['outdir'] = output_dir
    
    # Run LPA
    eng.eval("lst_lpa(flair, t1, 'outDir', outdir)", nargout=0)
    
    eng.quit()
    
    # LPA outputs lesion probability map
    prob_map = os.path.join(output_dir, "ples_lpa.nii")
    
    # Binarize at threshold 0.5 (recommended)
    import nibabel as nib
    import numpy as np
    
    prob_img = nib.load(prob_map)
    binary_mask = (prob_img.get_fdata() > 0.5).astype(np.uint8)
    
    binary_path = os.path.join(output_dir, "lesion_mask_bin.nii.gz")
    nib.save(nib.Nifti1Image(binary_mask, prob_img.affine), binary_path)
    
    return {
        "probability_map": prob_map,
        "binary_mask": binary_path,
        "lesion_volume_ml": float(np.sum(binary_mask) * np.prod(prob_img.header.get_zooms()) / 1000)
    }


def run_lst_lga(t1_path: str, flair_path: str,
                kappa: float = 0.3,
                output_dir: str = "./lst_output") -> dict:
    """
    Run LST Lesion Growth Algorithm (LGA).
    
    LGA is unsupervised but requires kappa parameter tuning.
    kappa range: 0.1-0.5 (lower = more sensitive)
    
    Parameters:
    -----------
    t1_path : str
        Path to T1 NIfTI (required)
    flair_path : str
        Path to FLAIR NIfTI (required)
    kappa : float
        Initial threshold (default 0.3)
    """
    os.makedirs(output_dir, exist_ok=True)
    
    eng = matlab.engine.start_matlab()
    spm_path = "/usr/local/spm12"
    eng.addpath(spm_path, nargout=0)
    eng.addpath(os.path.join(spm_path, "toolbox", "LST"), nargout=0)
    
    eng.workspace['t1'] = t1_path
    eng.workspace['flair'] = flair_path
    eng.workspace['kappa'] = float(kappa)
    eng.workspace['outdir'] = output_dir
    
    eng.eval("lst_lga(t1, flair, kappa, 'outDir', outdir)", nargout=0)
    eng.quit()
    
    return {"probability_map": os.path.join(output_dir, "ples_lga.nii")}
```

#### Expected Accuracy Metrics

| Algorithm | Dice vs Manual | Sensitivity | Reproducibility Error |
|-----------|---------------|-------------|----------------------|
| **LGA-SPM8** | 0.29 [IQR 0.31] | High | 20% [IQR 41%] |
| **LGA-SPM12** | 0.33 [IQR 0.26] | High | 14% [IQR 31%] |
| **LPA** | 0.41 [IQR 0.23] | Medium-High | 10% [IQR 27%] |
| **LPA + Longitudinal** | 0.85+ | High | 0% [IQR 0-3%] |

> **Note**: LPA is recommended for most use cases as it requires no parameter tuning. LGA with optimized kappa may yield higher accuracy but requires calibration.

#### GPU Requirements

| Mode | GPU | Time per Scan |
|------|-----|---------------|
| CPU (MATLAB) | Not required | 5-15 minutes |

#### Clinical Validation Status

- **FDA Cleared**: No
- **CE Marked**: No
- **Validations**: Tested across 13 European sites; validated for MS, Alzheimer's, stroke
- **Citations**: 2,000+ in PubMed
- **Recommendation**: **Gold standard for WMH segmentation in research; LPA recommended for ease of use**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
import tempfile
import subprocess
import nibabel as nib
import numpy as np

app = FastAPI(title="LST WMH Segmentation API")

@app.post("/segment-wmh/")
async def segment_wmh(
    flair: UploadFile = File(...),
    t1: UploadFile = File(None),
    algorithm: str = Form("lpa"),  # "lpa" or "lga"
    kappa: float = Form(0.3)
):
    """
    Segment white matter hyperintensities using LST.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        flair_path = os.path.join(tmpdir, "flair.nii.gz")
        with open(flair_path, "wb") as f:
            f.write(await flair.read())
        
        t1_path = None
        if t1:
            t1_path = os.path.join(tmpdir, "t1.nii.gz")
            with open(t1_path, "wb") as f:
                f.write(await t1.read())
        
        # Run via MATLAB command line
        if algorithm == "lpa":
            cmd = f"""
            addpath('/usr/local/spm12');
            addpath('/usr/local/spm12/toolbox/LST');
            lst_lpa('{flair_path}'{', \''+t1_path+'\'' if t1_path else ''});
            exit;
            """
        else:
            cmd = f"""
            addpath('/usr/local/spm12');
            addpath('/usr/local/spm12/toolbox/LST');
            lst_lga('{t1_path}', '{flair_path}', {kappa});
            exit;
            """
        
        subprocess.run(["matlab", "-nodisplay", "-r", cmd], check=True)
        
        # Calculate volume
        prob_map = os.path.join(tmpdir, "ples_lpa.nii" if algorithm == "lpa" else "ples_lga.nii")
        img = nib.load(prob_map)
        binary = (img.get_fdata() > 0.5).astype(np.uint8)
        voxel_vol = np.prod(img.header.get_zooms())
        volume_ml = float(np.sum(binary) * voxel_vol / 1000)
        
        return JSONResponse({
            "algorithm": algorithm,
            "lesion_volume_ml": volume_ml,
            "voxel_count": int(np.sum(binary)),
            "probability_map": prob_map
        })
```

---

### 3.2 SAMRI (SAM for MRI)

**SAMRI** is an MRI-specialized adaptation of Meta's Segment Anything Model (SAM), trained and validated on 1.1 million labeled MR slices spanning whole-body organs and pathologies. It achieves state-of-the-art accuracy with 94% shorter training time versus full SAM retraining.

| Attribute | Details |
|-----------|---------|
| **Full Name** | Segment Anything Model for MRI |
| **Institution** | University of Queensland |
| **Authors** | Wang, Dai, Dao, Bollmann, Sun, Engstrom, Chandra |
| **GitHub** | https://github.com/wangzhaomxy/SAMRI |
| **License** | Apache 2.0 |
| **Paper** | "SAMRI: Segment Anything Model for MRI" (arXiv:2510.26635) |

#### Installation

```bash
# Clone repository
git clone https://github.com/wangzhaomxy/SAMRI.git
cd SAMRI

# Install dependencies
pip install torch torchvision torchaudio
pip install segment-anything  # SAM from Meta
pip install numpy nibabel matplotlib scipy Pillow

# Download pretrained checkpoints
mkdir -p user_data/pretrained_ckpt
# Download from: https://github.com/wangzhaomxy/SAMRI/releases
# Place in user_data/pretrained_ckpt/
```

#### Python Usage Example

```python
import torch
import nibabel as nib
import numpy as np
from segment_anything import sam_model_registry, SamPredictor
from SAMRI.modeling.samri import SAMRI

# Load SAMRI model
device = "cuda" if torch.cuda.is_available() else "cpu"

checkpoint_path = "user_data/pretrained_ckpt/samri_vitb_bp.pth"
model_type = "vit_b"

# Initialize SAM with SAMRI weights
sam = sam_model_registry[model_type](checkpoint=None)
sam.load_state_dict(torch.load(checkpoint_path, map_location=device))
sam.to(device)
predictor = SamPredictor(sam)

def segment_mri_slice(
    image_path: str,
    box_coords: tuple,      # (x1, y1, x2, y2)
    point_coords: list = None,  # [(x, y), ...]
    point_labels: list = None,  # [1, 0, ...] (1=foreground, 0=background)
    output_path: str = "output.nii.gz"
):
    """
    Segment a 2D MRI slice using SAMRI with box + point prompts.
    
    Parameters:
    -----------
    image_path : str
        Path to NIfTI file (2D: 1 x H x W or H x W)
    box_coords : tuple
        Bounding box (x1, y1, x2, y2)
    point_coords : list
        List of (x, y) point prompts
    point_labels : list
        1 for foreground, 0 for background
    """
    # Load image
    img_nii = nib.load(image_path)
    img_data = img_nii.get_fdata()
    
    # Normalize to 8-bit for SAM
    img_data = (img_data - img_data.min()) / (img_data.max() - img_data.min())
    img_data = (img_data * 255).astype(np.uint8)
    
    # Handle 3D NIfTI -> 2D slice
    if img_data.ndim == 3:
        if img_data.shape[0] == 1:
            img_data = img_data[0]
        elif img_data.shape[-1] == 1:
            img_data = img_data[..., 0]
    
    # Convert grayscale to RGB
    img_rgb = np.stack([img_data] * 3, axis=-1)
    
    # Set image
    predictor.set_image(img_rgb)
    
    # Prepare prompts
    input_box = np.array(box_coords)
    
    masks, scores, logits = predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        box=input_box,
        multimask_output=True,
    )
    
    # Select best mask
    best_idx = np.argmax(scores)
    best_mask = masks[best_idx].astype(np.uint8)
    
    # Save as NIfTI
    mask_nii = nib.Nifti1Image(best_mask[np.newaxis, ...], img_nii.affine)
    nib.save(mask_nii, output_path)
    
    return {
        "mask": output_path,
        "score": float(scores[best_idx]),
        "area_pixels": int(np.sum(best_mask))
    }

# Example: Brain tumor segmentation with box prompt
result = segment_mri_slice(
    image_path="flair.nii.gz",
    box_coords=(115, 130, 178, 179),
    point_coords=[[133, 172]],
    point_labels=[1],
    output_path="tumor_mask.nii.gz"
)
print(f"Segmentation score: {result['score']:.3f}")
```

#### Command Line Interface

```bash
# Basic inference with box prompt
python inference.py \
  --input ./data/flair.nii.gz \
  --output ./results/ \
  --checkpoint ./checkpoints/samri_vitb_bp.pth \
  --model-type samri \
  --device cuda \
  --box 115 130 178 179

# Box + point prompt for higher accuracy
python inference.py \
  --input ./data/t1.nii.gz \
  --output ./results/ \
  --checkpoint ./checkpoints/samri_vitb_bp.pth \
  --device cuda \
  --box 100 100 200 200 \
  --point 150 150

# Zero-shot enhanced model
python inference.py \
  --input ./data/lesion.nii.gz \
  --output ./results/ \
  --checkpoint ./checkpoints/samri_vitb_bp_zero.pth \
  --model-type samri \
  --device cuda \
  --box 50 50 150 150
```

#### Expected Accuracy Metrics

| Task | SAMRI Dice | SAM Dice | MedSAM Dice |
|------|-----------|----------|-------------|
| **Mean (all tasks)** | **0.87** | 0.78 | 0.82 |
| Prostate | 0.91 | 0.82 | 0.87 |
| Brain structures | 0.89 | 0.80 | 0.84 |
| Cartilage | 0.82 | 0.68 | 0.75 |
| Cardiac | 0.90 | 0.85 | 0.88 |
| Small lesions | 0.78 | 0.55 | 0.65 |

#### GPU Requirements

| Mode | GPU VRAM | Inference Time |
|------|----------|----------------|
| GPU (ViT-B) | 6 GB | ~0.5s per 2D slice |
| GPU (ViT-H) | 12 GB | ~1.2s per 2D slice |
| CPU | N/A | ~5-10s per 2D slice |

#### Clinical Validation Status

- **FDA Cleared**: No
- **CE Marked**: No
- **Training Data**: 1.1 million labeled MR slices from 36 datasets, 47 tasks, 10+ MRI protocols
- **Strength**: Superior on small and clinically important structures
- **Recommendation**: **Best for interactive/assisted segmentation workflows; requires bounding box input**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse
import tempfile
import torch
import nibabel as nib
import numpy as np
from segment_anything import sam_model_registry, SamPredictor

app = FastAPI(title="SAMRI MRI Segmentation API")

# Global model (load once)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CHECKPOINT = "user_data/pretrained_ckpt/samri_vitb_bp.pth"

sam = sam_model_registry["vit_b"](checkpoint=None)
sam.load_state_dict(torch.load(CHECKPOINT, map_location=DEVICE))
sam.to(DEVICE)
predictor = SamPredictor(sam)

@app.post("/segment/")
async def segment(
    file: UploadFile = File(...),
    x1: int = Form(...),
    y1: int = Form(...),
    x2: int = Form(...),
    y2: int = Form(...),
    px: int = Form(None),
    py: int = Form(None)
):
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out = os.path.join(tmpdir, "mask.nii.gz")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        # Load and preprocess
        img_nii = nib.load(inp)
        img_data = img_nii.get_fdata()
        img_data = (img_data - img_data.min()) / (img_data.max() - img_data.min() + 1e-8)
        img_data = (img_data * 255).astype(np.uint8)
        
        if img_data.ndim == 3 and img_data.shape[0] == 1:
            img_data = img_data[0]
        
        img_rgb = np.stack([img_data] * 3, axis=-1)
        
        predictor.set_image(img_rgb)
        
        point_coords = [[px, py]] if px is not None and py is not None else None
        point_labels = [1] if point_coords else None
        
        masks, scores, _ = predictor.predict(
            point_coords=point_coords,
            point_labels=point_labels,
            box=np.array([x1, y1, x2, y2]),
            multimask_output=True
        )
        
        best_mask = masks[np.argmax(scores)].astype(np.uint8)
        mask_nii = nib.Nifti1Image(best_mask[np.newaxis, ...], img_nii.affine)
        nib.save(mask_nii, out)
        
        return FileResponse(out, filename="samri_mask.nii.gz")

@app.get("/health")
async def health():
    return {"device": DEVICE, "gpu_available": torch.cuda.is_available()}
```

---

### 3.3 DeepMedic

**DeepMedic** is an efficient multi-scale 3D CNN with fully connected CRF for accurate brain lesion segmentation. It was one of the first deep learning methods to win major segmentation challenges.

| Attribute | Details |
|-----------|---------|
| **Full Name** | DeepMedic |
| **Institution** | Imperial College London / Microsoft Research |
| **Authors** | Kamnitsas, Ledig, Newcombe, Simpson, Rueckert, Glocker |
| **GitHub** | https://github.com/deepmedic/deepmedic |
| **License** | BSD 3-Clause |
| **Paper** | "Efficient Multi-Scale 3D CNN with Fully Connected CRF for Accurate Brain Lesion Segmentation" (Medical Image Analysis, 2017) |

#### Installation

```bash
# Clone repository
git clone https://github.com/deepmedic/deepmedic.git
cd deepmedic

# Install
pip install -e .

# Or direct pip
pip install deepmedic

# Requirements:
# - Python 3.6+
# - TensorFlow 1.x or Theano
# - numpy, nibabel, scipy
```

#### Python Usage Example

```python
import subprocess
import os

def train_deepmedic(
    train_config: str,
    model_config: str,
    output_folder: str,
    device: str = "cuda"
):
    """
    Train DeepMedic model for brain lesion segmentation.
    
    Configuration files define:
    - Model architecture (dual pathway: normal + low resolution)
    - Training parameters (learning rate, batch size, sampling)
    - Data paths (channels, labels, masks)
    """
    deepMedicRun = os.path.join(os.path.dirname(__file__), "deepMedicRun")
    
    cmd = [
        deepMedicRun,
        "-model", model_config,
        "-train", train_config,
        "-dev", device
    ]
    
    subprocess.run(cmd, check=True)
    
    return output_folder


def predict_deepmedic(
    model_config: str,
    test_config: str,
    saved_model: str,
    device: str = "cuda"
):
    """
    Run inference with trained DeepMedic model.
    """
    deepMedicRun = os.path.join(os.path.dirname(__file__), "deepMedicRun")
    
    cmd = [
        deepMedicRun,
        "-model", model_config,
        "-test", test_config,
        "-load", saved_model,
        "-dev", device
    ]
    
    subprocess.run(cmd, check=True)


# Example configuration structure:
# Model config (modelConfig.cfg):
# - numberOfLayers: 8
# - numberOfFiltersPerLayer: [30, 30, 40, 40, 40, 40, 50, 50]
# - kernelDimensions: [[3,3,3], ...]
# - useDualPathway: True
# - useFCcrf: True

# Training config (trainConfig.cfg):
# - channels: ["flair.nii.gz", "t1.nii.gz", "t1ce.nii.gz", "t2.nii.gz"]
# - labels: "ground_truth.nii.gz"
# - batchSize: 10
# - numberOfEpochs: 35
# - samplingType: "uniform"
```

#### Expected Accuracy Metrics

| Challenge | DeepMedic Performance | Rank |
|-----------|----------------------|------|
| **BRATS 2015** | Dice ET: 0.72, WT: 0.85, TC: 0.81 | Top 3 |
| **ISLES 2015 (Stroke)** | Dice: 0.68 | **1st Place** |
| **ISLES 2015 (TBI)** | Dice: 0.58 | **1st Place** |
| **MSSEG-1** | Lesion Dice: 0.45 | Competitive |

#### GPU Requirements

| Mode | GPU VRAM | Training Time | Inference Time |
|------|----------|---------------|----------------|
| GPU | 8 GB | 20-40 hours | 2-5 min per volume |
| CPU | N/A | 200+ hours | 30-60 min per volume |

#### Clinical Validation Status

- **FDA Cleared**: No
- **CE Marked**: No
- **Challenge Results**: Won ISLES 2015, top performer in BRATS
- **Recommendation**: **Strong baseline for brain lesion segmentation; training from scratch required**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import tempfile
import subprocess
import os

app = FastAPI(title="DeepMedic Brain Lesion Segmentation API")

# Pretrained model path (must be trained on your data first)
PRETRAINED_MODEL = "/models/deepmedic_brats.pth"

@app.post("/segment-lesion/")
async def segment_lesion(
    flair: UploadFile = File(...),
    t1: UploadFile = File(...),
    t1ce: UploadFile = File(...),
    t2: UploadFile = File(...)
):
    """
    Segment brain lesions using DeepMedic.
    Requires 4-modal input (FLAIR, T1, T1ce, T2) for brain tumors.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        # Save input files
        paths = {}
        for f in [flair, t1, t1ce, t2]:
            p = os.path.join(tmpdir, f.filename)
            with open(p, "wb") as fp:
                fp.write(await f.read())
            paths[f.filename.split('.')[0]] = p
        
        # Create temporary test config
        test_config = os.path.join(tmpdir, "test_config.cfg")
        with open(test_config, "w") as f:
            f.write(f"channels = {[paths[k] for k in paths]}\\n")
            f.write(f"outputFolder = {tmpdir}\\n")
        
        model_config = "/models/deepmedic_model.cfg"
        
        # Run inference
        subprocess.run([
            "deepMedicRun",
            "-model", model_config,
            "-test", test_config,
            "-load", PRETRAINED_MODEL,
            "-dev", "cuda"
        ], check=True)
        
        output_seg = os.path.join(tmpdir, "predictions", "segmentation.nii.gz")
        return FileResponse(output_seg, filename="lesion_segmentation.nii.gz")
```

---

## 4. ROI / Atlas-Based Segmentation

These tools provide comprehensive anatomical segmentation across multiple structures, suitable for volumetric quantification, radiomics, and surgical planning.

---

### 4.1 TotalSegmentator

**TotalSegmentator** is a tool for robust segmentation of 100+ important anatomical structures in both CT and MR images. It is built on top of nnU-Net and is one of the most comprehensive segmentation tools available.

| Attribute | Details |
|-----------|---------|
| **Full Name** | TotalSegmentator v2 |
| **Institution** | University Hospital Basel |
| **Authors** | Wasserthal et al. |
| **GitHub** | https://github.com/wasserth/TotalSegmentator |
| **License** | Apache 2.0 |
| **Paper** | "TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images" (Radiology: AI, 2023) |
| **MRI Paper** | "TotalSegmentator MRI: Head and neck segmentation in MRI" (Radiology: AI, 2024) |

#### Installation

```bash
# Prerequisites: Python >= 3.10, PyTorch >= 2.0.0

# Install from PyPI
pip install TotalSegmentator

# Or install latest master
pip install git+https://github.com/wasserth/TotalSegmentator.git

# Download weights (automatic on first run, or manual)
totalseg_download_weights -t total

# Optional: for --preview option
apt-get install xvfb
pip install fury
```

#### Python Usage Example

```python
import nibabel as nib
from totalsegmentator.python_api import totalsegmentator

def segment_body(
    input_path: str,
    output_path: str,
    task: str = "total",
    fast: bool = False,
    roi_subset: list = None,
    device: str = "cuda"
):
    """
    Run TotalSegmentator on CT or MRI.
    
    Parameters:
    -----------
    input_path : str
        Path to NIfTI file (.nii.gz) or DICOM folder
    output_path : str
        Output directory path
    task : str
        Segmentation task:
        - "total" (CT): 104 structures
        - "total_mr" (MRI): Major MR-visible structures
        - "lung_nodules": Lung nodule detection
        - "body": Body region only
        - "heartchambers": Cardiac chambers
        - "brain": Brain structures
    fast : bool
        Use 3mm model (faster, lower resolution)
    roi_subset : list
        Segment only specific structures (e.g., ["spleen", "liver"])
    device : str
        "cpu", "gpu", or "gpu:1"
    """
    result = totalsegmentator(
        input_path,
        output_path,
        task=task,
        fast=fast,
        roi_subset=roi_subset,
        device=device,
        statistics=True,        # Output volume statistics
        radiomics=False,        # Set True for radiomics features
        preview=True,           # Generate 3D preview
        ml=True                 # Single multi-label output
    )
    
    return result


# CT segmentation (104 structures)
segment_body(
    "ct_scan.nii.gz",
    "ct_segmentations/",
    task="total",
    fast=False,
    device="cuda"
)

# MRI segmentation
segment_body(
    "mri_brain.nii.gz",
    "mri_segmentations/",
    task="total_mr",
    device="cuda"
)

# ROI-only segmentation (much faster)
segment_body(
    "ct_abdomen.nii.gz",
    "abdomen_seg/",
    task="total",
    roi_subset=["liver", "spleen", "kidney_left", "kidney_right"],
    fast=True,
    device="cpu"
)

# Access Python API with nibabel objects
input_img = nib.load("brain.nii.gz")
output_img = totalsegmentator(input_img, None, task="brain", device="cuda")
nib.save(output_img, "brain_seg.nii.gz")

# Read multi-label output with class names
from totalsegmentator.nifti_ext_header import load_multilabel_nifti
seg_img, label_map = load_multilabel_nifti("brain_seg.nii.gz")
print(f"Segmented classes: {list(label_map.values())}")
```

#### Command Line Interface

```bash
# CT segmentation (full resolution)
TotalSegmentator -i ct.nii.gz -o segmentations/

# MRI segmentation
TotalSegmentator -i mri.nii.gz -o segmentations/ --task total_mr

# Fast mode (3mm resolution)
TotalSegmentator -i ct.nii.gz -o segmentations/ --fast

# ROI subset only
TotalSegmentator -i ct.nii.gz -o segmentations/ \
    --roi_subset spleen colon liver stomach

# With statistics
TotalSegmentator -i ct.nii.gz -o segmentations/ --statistics

# GPU device selection
TotalSegmentator -i ct.nii.gz -o segmentations/ --device gpu:0
```

#### Expected Accuracy Metrics

| Structure Type | CT Dice (1.5mm) | CT Dice (3mm fast) | MR Dice |
|---------------|----------------|-------------------|---------|
| Organs (liver, spleen) | 0.96-0.98 | 0.94-0.96 | 0.91-0.95 |
| Vertebrae | 0.93-0.96 | 0.90-0.93 | N/A |
| Brain structures | 0.85-0.92 | 0.80-0.88 | 0.82-0.90 |
| Vessels (aorta, PA) | 0.90-0.94 | 0.86-0.90 | 0.78-0.85 |
| Small structures | 0.75-0.85 | 0.70-0.80 | 0.68-0.78 |

#### GPU Requirements

| Mode | GPU VRAM | Time (GPU) | Time (CPU) |
|------|----------|------------|------------|
| 1.5mm (full) | 10 GB | 30-60s | 5-10 min |
| 3mm (fast) | 4 GB | 5-10s | 1-2 min |
| ROI subset | 4 GB | 3-8s | 30-60s |

#### Clinical Validation Status

- **FDA Cleared**: Yes - Component of several FDA-approved products
- **CE Marked**: Yes - as part of certified systems
- **Training Data**: 1,228 CT subjects + 616 MRI subjects
- **Citations**: 1,000+ since 2023
- **Recommendation**: **Best for whole-body CT/MR segmentation; FDA-cleared component status**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
import tempfile
import json
import nibabel as nib
from totalsegmentator.python_api import totalsegmentator

app = FastAPI(title="TotalSegmentator API")

@app.post("/segment/")
async def segment(
    file: UploadFile = File(...),
    task: str = Form("total"),
    fast: bool = Form(False),
    device: str = Form("cuda")
):
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out = os.path.join(tmpdir, "segmentations")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        totalsegmentator(
            inp, out,
            task=task,
            fast=fast,
            device=device,
            statistics=True,
            ml=True
        )
        
        # Read statistics
        stats_path = os.path.join(out, "statistics.json")
        if os.path.exists(stats_path):
            with open(stats_path) as f:
                stats = json.load(f)
        else:
            stats = {}
        
        return JSONResponse({
            "output_dir": out,
            "statistics": stats,
            "task": task
        })

@app.get("/tasks/")
async def list_tasks():
    """List available segmentation tasks."""
    return {
        "tasks": [
            "total", "total_mr", "lung_nodules", "body",
            "heartchambers", "brain", "vertebrae", "muscles"
        ]
    }
```

---

### 4.2 MONAI

**MONAI (Medical Open Network for AI)** is a PyTorch-based open-source framework for deep learning in healthcare imaging. It provides domain-optimized capabilities for medical image segmentation, including pre-trained models, Auto3DSeg, and deployment tools.

| Attribute | Details |
|-----------|---------|
| **Full Name** | Medical Open Network for Artificial Intelligence |
| **Institution** | NVIDIA, KCL, CLS, VMware + 20+ academic partners |
| **Authors** | MONAI Consortium |
| **GitHub** | https://github.com/Project-MONAI/MONAI |
| **License** | Apache 2.0 |
| **Paper** | "MONAI: An open-source framework for deep learning in healthcare" (2022) |

#### Installation

```bash
# Core framework
pip install monai

# With all dependencies
pip install "monai[all]"

# Specific extras
pip install "monai[nibabel,skimage,pillow,tensorboard,gdown,tqdm]"

# For deployment
pip install monai-deploy-app-sdk

# Verify installation
python -c "import monai; print(monai.__version__)"
```

#### Python Usage Example: Brain Tumor Segmentation (BraTS)

```python
import torch
import nibabel as nib
import numpy as np
from monai.transforms import (
    Compose, LoadImaged, EnsureChannelFirstd,
    ScaleIntensityd, RandRotated, RandZoomd,
    ToTensord
)
from monai.networks.nets import UNet
from monai.losses import DiceLoss
from monai.metrics import DiceMetric
from monai.data import Dataset, DataLoader
from monai.inferers import sliding_window_inference
from monai.utils import set_determinism

# ============================================================
# 1. Define Transforms Pipeline
# ============================================================
train_transforms = Compose([
    LoadImaged(keys=["flair", "t1", "t1ce", "t2", "label"]),
    EnsureChannelFirstd(keys=["flair", "t1", "t1ce", "t2", "label"]),
    ScaleIntensityd(keys=["flair", "t1", "t1ce", "t2"]),
    RandRotated(keys=["flair", "t1", "t1ce", "t2", "label"],
                range_x=np.pi/8, prob=0.5),
    RandZoomd(keys=["flair", "t1", "t1ce", "t2", "label"],
              min_zoom=0.9, max_zoom=1.1, prob=0.5),
    ToTensord(keys=["flair", "t1", "t1ce", "t2", "label"]),
])

# ============================================================
# 2. Define UNet Model
# ============================================================
model = UNet(
    spatial_dims=3,
    in_channels=4,      # FLAIR, T1, T1ce, T2
    out_channels=4,     # Background, ET, WT, TC
    channels=(16, 32, 64, 128, 256),
    strides=(2, 2, 2, 2),
    num_res_units=2,
    norm="batch"
)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)

# ============================================================
# 3. Training Setup
# ============================================================
loss_fn = DiceLoss(to_onehot_y=True, softmax=True)
optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)

# ============================================================
# 4. Inference with Sliding Window
# ============================================================
def predict_brain_tumor(
    model,
    flair_path: str,
    t1_path: str,
    t1ce_path: str,
    t2_path: str,
    device: str = "cuda",
    roi_size: tuple = (128, 128, 128),
    sw_batch_size: int = 1
):
    """
    Run brain tumor segmentation with sliding window inference.
    
    Returns:
    --------
    Segmentation array with labels:
    0 = Background, 1 = Necrotic core, 2 = Edema, 3 = Enhancing tumor
    """
    # Load and stack channels
    flair = nib.load(flair_path).get_fdata()
    t1 = nib.load(t1_path).get_fdata()
    t1ce = nib.load(t1ce_path).get_fdata()
    t2 = nib.load(t2_path).get_fdata()
    
    # Stack to [C, H, W, D]
    input_tensor = torch.tensor(
        np.stack([flair, t1, t1ce, t2]),
        dtype=torch.float32
    ).unsqueeze(0).to(device)
    
    # Normalize
    input_tensor = (input_tensor - input_tensor.mean()) / (input_tensor.std() + 1e-8)
    
    model.eval()
    with torch.no_grad():
        prediction = sliding_window_inference(
            inputs=input_tensor,
            roi_size=roi_size,
            sw_batch_size=sw_batch_size,
            predictor=model,
            overlap=0.5
        )
    
    # Argmax to get class labels
    segmentation = torch.argmax(prediction, dim=1).cpu().numpy()[0]
    
    return segmentation

# ============================================================
# 5. Using Pre-trained MONAI Auto3DSeg Models
# ============================================================
from monai.apps.auto3dseg import AutoRunner

def auto3dseg_pipeline(
    dataroot: str,
    work_dir: str,
    modalities: list = ["flair", "t1", "t1ce", "t2"]
):
    """
    Run MONAI Auto3DSeg pipeline - automatically configures
    and trains the best model for your dataset.
    """
    runner = AutoRunner(
        work_dir=work_dir,
        input={
            "name": "BraTS",
            "root_dir": dataroot,
            "data_list_file": f"{dataroot}/datalist.json",
            "modality": modalities
        }
    )
    
    # Run full pipeline
    runner.run()
    
    return runner
```

#### Using MONAI Bundles (Pre-trained Models)

```python
from monai.bundle import ConfigParser, download

# Download pre-trained model
model_dir = "./models"
download(
    name="spleen_ct_segmentation",
    bundle_dir=model_dir,
    source="github"
)

# Load and run inference
config = ConfigParser()
config.read_config(f"{model_dir}/spleen_ct_segmentation/configs/inference.json")

# Get model and inferer
model = config.get_parsed_content("network")
inferer = config.get_parsed_content("inferer")
preprocessing = config.get_parsed_content("preprocessing")
postprocessing = config.get_parsed_content("postprocessing")

# Run inference
model.eval()
with torch.no_grad():
    input_tensor = preprocessing(ct_image)
    output = inferer(input_tensor, model)
    segmentation = postprocessing(output)
```

#### Expected Accuracy Metrics

| Model | Task | Dice (Validation) |
|-------|------|-------------------|
| UNet (MONAI) | BraTS Tumor | 0.82-0.88 |
| SwinUNETR | BraTS Tumor | 0.85-0.90 |
| SegResNet | BraTS Tumor | 0.84-0.89 |
| UNETR | MSD Brain | 0.78-0.85 |
| Auto3DSeg | Varied | 0.80-0.92 (task-dependent) |

#### GPU Requirements

| Task | GPU VRAM | Training Time | Inference |
|------|----------|---------------|-----------|
| 3D UNet training | 16 GB | 12-24 hours | 2-5 min/vol |
| Inference only | 8 GB | N/A | 30-120s/vol |
| Auto3DSeg ensemble | 24 GB | 24-48 hours | 5-10 min/vol |
| 2D training | 8 GB | 2-4 hours | 10-30s/vol |

#### Clinical Validation Status

- **FDA Cleared**: No (framework itself); used in FDA-cleared products
- **CE Marked**: No
- **Adoption**: NVIDIA Clara, major hospitals, 100+ clinical deployments
- **Recommendation**: **Best framework for building clinical segmentation pipelines; strong ecosystem**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import tempfile
import torch
import nibabel as nib
import numpy as np
from monai.networks.nets import UNet
from monai.inferers import sliding_window_inference
from monai.transforms import Compose, LoadImaged, EnsureChannelFirstd, ScaleIntensityd

app = FastAPI(title="MONAI Brain Tumor Segmentation API")

# Load pre-trained model
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model = UNet(
    spatial_dims=3, in_channels=4, out_channels=4,
    channels=(16, 32, 64, 128, 256),
    strides=(2, 2, 2, 2), num_res_units=2
).to(DEVICE)

# Load weights
model.load_state_dict(torch.load("/models/brats_unet.pth", map_location=DEVICE))
model.eval()

@app.post("/segment-tumor/")
async def segment_tumor(
    flair: UploadFile = File(...),
    t1: UploadFile = File(...),
    t1ce: UploadFile = File(...),
    t2: UploadFile = File(...)
):
    with tempfile.TemporaryDirectory() as tmpdir:
        # Save files
        files = {}
        for f in [("flair", flair), ("t1", t1), ("t1ce", t1ce), ("t2", t2)]:
            p = os.path.join(tmpdir, f"{f[0]}.nii.gz")
            with open(p, "wb") as fp:
                fp.write(await f[1].read())
            files[f[0]] = p
        
        # Load and preprocess
        channels = []
        for mod in ["flair", "t1", "t1ce", "t2"]:
            data = nib.load(files[mod]).get_fdata()
            channels.append(data)
        
        input_tensor = torch.tensor(
            np.stack(channels), dtype=torch.float32
        ).unsqueeze(0).to(DEVICE)
        input_tensor = (input_tensor - input_tensor.mean()) / (input_tensor.std() + 1e-8)
        
        # Inference
        with torch.no_grad():
            pred = sliding_window_inference(
                input_tensor, roi_size=(128, 128, 128),
                sw_batch_size=1, predictor=model, overlap=0.5
            )
        
        seg = torch.argmax(pred, dim=1).cpu().numpy()[0].astype(np.uint8)
        
        # Save output
        ref = nib.load(files["flair"])
        out = os.path.join(tmpdir, "segmentation.nii.gz")
        nib.save(nib.Nifti1Image(seg, ref.affine), out)
        
        return FileResponse(out, filename="tumor_segmentation.nii.gz")

@app.get("/health")
async def health():
    return {"device": str(DEVICE), "gpu": torch.cuda.is_available()}
```

---

### 4.3 nnU-Net

**nnU-Net** is a self-configuring deep learning method for semantic segmentation. It automatically adapts its entire pipeline (preprocessing, network architecture, training) to any new dataset, achieving state-of-the-art results without manual hyperparameter tuning.

| Attribute | Details |
|-----------|---------|
| **Full Name** | nnU-Net v2 |
| **Institution** | DKFZ (German Cancer Research Center) |
| **Authors** | Isensee, Jaeger et al. |
| **GitHub** | https://github.com/MIC-DKFZ/nnUNet |
| **License** | Apache 2.0 |
| **Paper** | "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation" (Nature Methods, 2021) |

#### Installation

```bash
# Step 1: Install PyTorch FIRST (for your CUDA version)
# Visit https://pytorch.org/get-started/locally/
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Step 2: Install nnU-Net
pip install nnunetv2

# OR install from source for development
git clone https://github.com/MIC-DKFZ/nnUNet.git
cd nnUNet
pip install -e .

# Step 3: Set environment variables (add to ~/.bashrc)
export nnUNet_raw="/path/to/nnUNet_raw"
export nnUNet_preprocessed="/path/to/nnUNet_preprocessed"
export nnUNet_results="/path/to/nnUNet_results"

# Step 4: Verify
nnUNetv2_train -h
nnUNetv2_predict -h
```

#### Python Usage Example: Training Custom Brain Segmentation

```python
import os
import json
import subprocess
from pathlib import Path

# ============================================================
# 1. Prepare Dataset in nnU-Net Format
# ============================================================
def prepare_brain_dataset(
    raw_data_dir: str,
    dataset_id: int = 101,
    dataset_name: str = "BrainTumor"
):
    """
    Prepare dataset in nnU-Net format.
    
    Expected structure:
    nnUNet_raw/Dataset101_BrainTumor/
        imagesTr/
            BRATS_001_0000.nii.gz   # FLAIR
            BRATS_001_0001.nii.gz   # T1
            BRATS_001_0002.nii.gz   # T1ce
            BRATS_001_0003.nii.gz   # T2
            BRATS_002_0000.nii.gz
            ...
        labelsTr/
            BRATS_001.nii.gz         # Ground truth
            BRATS_002.nii.gz
            ...
        dataset.json
    """
    dataset_dir = os.path.join(
        os.environ["nnUNet_raw"],
        f"Dataset{dataset_id:03d}_{dataset_name}"
    )
    
    os.makedirs(f"{dataset_dir}/imagesTr", exist_ok=True)
    os.makedirs(f"{dataset_dir}/labelsTr", exist_ok=True)
    
    # Create dataset.json
    dataset_info = {
        "channel_names": {
            "0": "FLAIR",
            "1": "T1",
            "2": "T1CE",
            "3": "T2"
        },
        "labels": {
            "background": 0,
            "edema": 1,
            "non-enhancing_tumor": 2,
            "enhancing_tumor": 3
        },
        "numTraining": 369,
        "file_ending": ".nii.gz",
        "name": dataset_name,
        "description": "Brain tumor segmentation dataset"
    }
    
    with open(f"{dataset_dir}/dataset.json", "w") as f:
        json.dump(dataset_info, f, indent=2)
    
    return dataset_dir


# ============================================================
# 2. Run nnU-Net Pipeline
# ============================================================
def run_nnunet_pipeline(dataset_id: int = 101):
    """
    Run full nnU-Net pipeline:
    1. Planning and preprocessing
    2. Training (5-fold cross-validation)
    3. Finding best configuration
    4. Inference
    """
    dataset_name = f"Dataset{dataset_id:03d}"
    
    # Step 1: Preprocess
    subprocess.run([
        "nnUNetv2_plan_and_preprocess",
        "-d", str(dataset_id),
        "--verify_dataset_integrity"
    ], check=True)
    
    # Step 2: Train 2D UNet
    subprocess.run([
        "nnUNetv2_train",
        dataset_name, "2d", "0",
        "--npz"
    ], check=True)
    
    # Step 3: Train 3D full-resolution UNet
    subprocess.run([
        "nnUNetv2_train",
        dataset_name, "3d_fullres", "0",
        "--npz"
    ], check=True)
    
    # Step 4: Train 3D low-resolution UNet
    subprocess.run([
        "nnUNetv2_train",
        dataset_name, "3d_lowres", "0",
        "--npz"
    ], check=True)
    
    # Step 5: Find best ensemble configuration
    subprocess.run([
        "nnUNetv2_find_best_configuration",
        dataset_name
    ], check=True)
    
    print("Training complete. Best configuration saved.")


# ============================================================
# 3. Run Inference
# ============================================================
def predict_with_nnunet(
    input_folder: str,
    output_folder: str,
    dataset_id: int = 101,
    configuration: str = "3d_fullres",
    fold: str = "0"
):
    """
    Run inference with trained nnU-Net model.
    """
    dataset_name = f"Dataset{dataset_id:03d}"
    
    os.makedirs(output_folder, exist_ok=True)
    
    subprocess.run([
        "nnUNetv2_predict",
        "-i", input_folder,
        "-o", output_folder,
        "-d", dataset_name,
        "-c", configuration,
        "-f", fold,
        "--save_probabilities"
    ], check=True)
    
    return output_folder


# ============================================================
# 4. Python API for Pre-trained Models
# ============================================================
from nnunetv2.inference.predict_from_raw_data import nnUNetPredictor
from nnunetv2.imageio.simpleitk_reader_writer import SimpleITKIO

def predict_with_model(
    input_file: str,
    output_file: str,
    model_folder: str,
    folds: list = [0]
):
    """
    Predict using nnU-Net Python API.
    """
    predictor = nnUNetPredictor(
        tile_step_size=0.5,
        use_gaussian=True,
        use_mirroring=True,
        device=torch.device('cuda'),
        verbose=False,
        verbose_preprocessing=False,
        allow_tqdm=True
    )
    
    predictor.initialize_from_trained_model_folder(
        model_folder,
        use_folds=folds,
        checkpoint_name='checkpoint_final.pth'
    )
    
    predictor.predict_from_files(
        [[input_file]],
        [output_file],
        save_probabilities=False,
        overwrite=False,
        num_processes_preprocessing=2,
        num_processes_segmentation_export=2,
        folder_with_segs_from_prev_stage=None,
        num_parts=1,
        part_id=0
    )
    
    return output_file
```

#### Expected Accuracy Metrics

| Challenge/Task | nnU-Net Dice | Rank |
|---------------|-------------|------|
| **BraTS 2021** | ET: 0.83, WT: 0.91, TC: 0.87 | Top 3 |
| **KiTS 2021** | Kidney: 0.96, Tumor: 0.83 | **1st Place** |
| **LiTS** | Liver: 0.96, Lesion: 0.76 | **1st Place** |
| **AMOS 2022** | Mean: 0.86 | **1st Place** |
| **TotalSegmentator** | 104 classes: 0.83 mean | State-of-art |
| **MSD Brain** | 0.85 | SOTA at time |

#### GPU Requirements

| Stage | GPU VRAM | Time |
|-------|----------|------|
| Preprocessing | N/A | 10-30 min |
| 2D UNet training | 8 GB | 6-12 hours |
| 3D fullres training | 11 GB | 12-24 hours |
| 3D lowres training | 8 GB | 8-16 hours |
| Inference | 8 GB | 30s-2 min/volume |
| Ensemble inference | 11 GB | 2-5 min/volume |

#### Clinical Validation Status

- **FDA Cleared**: No (method); used in FDA-cleared products
- **CE Marked**: No
- **Challenge Results**: 1st place in 30+ international segmentation challenges
- **Citations**: 5,000+ since 2021
- **Recommendation**: **The gold standard for supervised biomedical segmentation; use as baseline for any new task**

#### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import tempfile
import torch
import os
from nnunetv2.inference.predict_from_raw_data import nnUNetPredictor

app = FastAPI(title="nnU-Net Segmentation API")

# Initialize predictor globally
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

predictor = nnUNetPredictor(
    tile_step_size=0.5,
    use_gaussian=True,
    use_mirroring=True,
    device=DEVICE,
    verbose=False
)

# Load pre-trained model
MODEL_FOLDER = os.path.join(
    os.environ.get("nnUNet_results", "/models"),
    "Dataset101_BrainTumor/nnUNetTrainer__nnUNetPlans__3d_fullres"
)

predictor.initialize_from_trained_model_folder(
    MODEL_FOLDER,
    use_folds=[0],
    checkpoint_name='checkpoint_final.pth'
)

@app.post("/segment/")
async def segment(file: UploadFile = File(...)):
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input_0000.nii.gz")
        out = os.path.join(tmpdir, "output.nii.gz")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        # nnU-Net expects list of lists for channels
        predictor.predict_from_files(
            [[inp]],
            [out],
            save_probabilities=False,
            overwrite=True
        )
        
        return FileResponse(out, filename="nnunet_segmentation.nii.gz")

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "device": str(DEVICE),
        "model_loaded": os.path.exists(MODEL_FOLDER)
    }
```

---

## 5. Comparative Analysis

### Tool Comparison Matrix

| Tool | Type | Dice (Brain) | Speed (GPU) | License | CPU Fallback | Ease of Use |
|------|------|-------------|-------------|---------|-------------|-------------|
| **HD-BET** | Brain Extraction | 0.984 | 3s | Apache 2.0 | Yes (45s) | Easy |
| **FSL BET** | Brain Extraction | 0.971 | 1-5s | FSL | N/A (CPU) | Easy |
| **ANTs** | Brain Extraction | 0.975 | 30-60s | Apache 2.0 | Yes (15min) | Moderate |
| **SynthSeg** | Brain Seg | 0.870 | 6s | Academic | Yes (2min) | Moderate |
| **FastSurfer** | Cortical Recon | 0.890 | 5min | Apache 2.0 | Yes (30min) | Moderate |
| **LST** | WMH Lesion | 0.41 (LPA) | 5-15min | GPL | N/A | Moderate |
| **SAMRI** | Interactive SAM | 0.870 | 0.5s/slice | Apache 2.0 | Yes (5s/slice) | Easy |
| **DeepMedic** | Lesion Seg | 0.72 (BRATS) | 2-5min | BSD | Yes (30min) | Hard |
| **TotalSegmentator** | Whole Body | 0.96 (organs) | 30-60s | Apache 2.0 | Yes (5min) | Easy |
| **MONAI** | Framework | Varies | Varies | Apache 2.0 | Yes | Moderate |
| **nnU-Net** | Self-config | 0.91 (BraTS) | 30s-2min | Apache 2.0 | Yes | Moderate |

### Clinical Readiness Ranking

| Rank | Tool | Clinical Maturity | Recommended Use Case |
|------|------|-------------------|---------------------|
| 1 | **nnU-Net** | Production (research) | Benchmark for any new segmentation task |
| 2 | **TotalSegmentator** | FDA component | Whole-body CT/MR segmentation |
| 3 | **HD-BET** | Production (research) | Brain extraction across pathologies |
| 4 | **MONAI** | Enterprise ready | Building custom clinical AI pipelines |
| 5 | **SynthSeg** | Well-validated | Multi-contrast brain segmentation |
| 6 | **ANTs** | Long-established | Cortical thickness, registration |
| 7 | **FastSurfer** | Emerging | Fast FreeSurfer-compatible analysis |
| 8 | **SAMRI** | Emerging | Interactive/assisted segmentation |
| 9 | **LST** | Established | White matter hyperintensity quantification |
| 10 | **DeepMedic** | Mature (legacy) | Custom lesion segmentation training |

---

## 6. FastAPI Integration Patterns

### Unified MRI Segmentation Service

```python
"""
Unified FastAPI service supporting multiple segmentation backends.
This pattern allows runtime selection of the best tool for each task.
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from enum import Enum
import tempfile
import os
import subprocess
import torch
import nibabel as nib
import numpy as np

app = FastAPI(
    title="MRI Segmentation AI Stack",
    description="Unified neuroimaging segmentation API",
    version="1.0.0"
)

class SegmentationTool(str, Enum):
    HD_BET = "hd-bet"
    FSL_BET = "fsl-bet"
    ANTS = "ants"
    SYNTHSEG = "synthseg"
    FASTSURFER = "fastsurfer"
    TOTALSEGMENTATOR = "totalsegmentator"
    NNUNET = "nnunet"
    SAMRI = "samri"

class TaskType(str, Enum):
    BRAIN_EXTRACTION = "brain_extraction"
    BRAIN_SEGMENTATION = "brain_segmentation"
    TUMOR_SEGMENTATION = "tumor_segmentation"
    LESION_SEGMENTATION = "lesion_segmentation"
    WHOLE_BODY = "whole_body"

# ============================================================
# Task-to-Tool Routing
# ============================================================
TASK_TOOL_MAP = {
    TaskType.BRAIN_EXTRACTION: [SegmentationTool.HD_BET, SegmentationTool.FSL_BET, SegmentationTool.ANTS],
    TaskType.BRAIN_SEGMENTATION: [SegmentationTool.SYNTHSEG, SegmentationTool.FASTSURFER],
    TaskType.TUMOR_SEGMENTATION: [SegmentationTool.NNUNET, SegmentationTool.SAMRI],
    TaskType.LESION_SEGMENTATION: [SegmentationTool.SAMRI],
    TaskType.WHOLE_BODY: [SegmentationTool.TOTALSEGMENTATOR],
}

@app.post("/segment/{task}/")
async def segment_with_task(
    task: TaskType,
    tool: SegmentationTool = Form(...),
    file: UploadFile = File(...),
    device: str = Form("cuda")
):
    """
    Unified segmentation endpoint that routes to the appropriate tool.
    """
    # Validate tool supports task
    if tool not in TASK_TOOL_MAP.get(task, []):
        raise HTTPException(
            status_code=400,
            detail=f"Tool '{tool}' does not support task '{task}'. "
                   f"Supported: {TASK_TOOL_MAP.get(task, [])}"
        )
    
    # Route to handler
    handlers = {
        SegmentationTool.HD_BET: handle_hd_bet,
        SegmentationTool.FSL_BET: handle_fsl_bet,
        SegmentationTool.ANTS: handle_ants,
        SegmentationTool.SYNTHSEG: handle_synthseg,
        SegmentationTool.TOTALSEGMENTATOR: handle_totalsegmentator,
        SegmentationTool.NNUNET: handle_nnunet,
        SegmentationTool.SAMRI: handle_samri,
    }
    
    handler = handlers.get(tool)
    if not handler:
        raise HTTPException(status_code=501, detail="Tool handler not implemented")
    
    return await handler(file, device)


async def handle_hd_bet(file: UploadFile, device: str):
    """HD-BET brain extraction handler."""
    from HD_BET.run import run_hd_bet
    
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out = os.path.join(tmpdir, "brain.nii.gz")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        run_hd_bet(inp, out, mode="fast", device=device, do_tta=False)
        return FileResponse(out, filename="brain_hd-bet.nii.gz")

async def handle_fsl_bet(file: UploadFile, device: str):
    """FSL BET handler."""
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out = os.path.join(tmpdir, "brain")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        subprocess.run(["bet2", inp, out, "-m"], check=True)
        return FileResponse(out + ".nii.gz", filename="brain_fsl-bet.nii.gz")

async def handle_ants(file: UploadFile, device: str):
    """ANTs brain extraction handler."""
    import ants
    import antspynet
    
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out = os.path.join(tmpdir, "brain.nii.gz")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        t1 = ants.image_read(inp)
        mask = antspynet.brain_extraction(t1, modality="t1", verbose=False)
        brain = t1 * mask
        ants.image_write(brain, out)
        
        return FileResponse(out, filename="brain_ants.nii.gz")

async def handle_synthseg(file: UploadFile, device: str):
    """SynthSeg handler."""
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out = os.path.join(tmpdir, "seg.nii.gz")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        subprocess.run([
            "mri_synthseg", "--i", inp, "--o", out, "--robust"
        ], check=True)
        
        return FileResponse(out, filename="synthseg.nii.gz")

async def handle_totalsegmentator(file: UploadFile, device: str):
    """TotalSegmentator handler."""
    from totalsegmentator.python_api import totalsegmentator
    
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input.nii.gz")
        out = os.path.join(tmpdir, "segmentations")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        totalsegmentator(inp, out, device=device, fast=True, ml=True)
        
        return FileResponse(
            os.path.join(out, "segmentation.nii.gz"),
            filename="totalsegmentator.nii.gz"
        )

async def handle_nnunet(file: UploadFile, device: str):
    """nnU-Net handler (requires pre-trained model)."""
    from nnunetv2.inference.predict_from_raw_data import nnUNetPredictor
    
    predictor = nnUNetPredictor(
        tile_step_size=0.5,
        use_gaussian=True,
        device=torch.device(device),
        verbose=False
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, "input_0000.nii.gz")
        out = os.path.join(tmpdir, "output.nii.gz")
        
        with open(inp, "wb") as f:
            f.write(await file.read())
        
        model_folder = os.environ.get("NNUNET_MODEL_FOLDER", "/models/nnunet")
        predictor.initialize_from_trained_model_folder(
            model_folder, use_folds=[0]
        )
        predictor.predict_from_files([[inp]], [out], overwrite=True)
        
        return FileResponse(out, filename="nnunet_segmentation.nii.gz")

async def handle_samri(file: UploadFile, device: str):
    """SAMRI handler (box prompt required via form data)."""
    raise HTTPException(
        status_code=400,
        detail="SAMRI requires bounding box prompt. Use /segment-samri/ endpoint."
    )


# ============================================================
# Health and Status
# ============================================================
@app.get("/health")
async def health():
    tools_available = {
        "hd-bet": os.system("which hd-bet") == 0,
        "fsl-bet": os.system("which bet2") == 0,
        "ants": os.system("python -c 'import ants'") == 0,
        "synthseg": os.system("which mri_synthseg") == 0,
        "totalsegmentator": os.system("which TotalSegmentator") == 0,
        "nnunet": os.system("nnUNetv2_train -h") == 0,
        "samri": os.path.exists("/models/samri_vitb_bp.pth"),
    }
    
    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "tools_available": tools_available
    }

@app.get("/tools/")
async def list_tools():
    """List all available tools and their supported tasks."""
    return {
        tool.value: [t.value for t in TASK_TOOL_MAP if tool in TASK_TOOL_MAP.get(t, [])]
        for tool in SegmentationTool
    }
```

---

## 7. Clinical Deployment Guide

### Docker Compose for Clinical Deployment

```yaml
# docker-compose.yml - MRI Segmentation AI Stack
version: '3.8'

services:
  # HD-BET Brain Extraction Service
  hd-bet:
    image: nvidia/cuda:12.1-runtime-ubuntu22.04
    build:
      context: ./hd-bet
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=0
    volumes:
      - ./models:/models
      - ./data:/data
    ports:
      - "8001:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # nnU-Net Inference Service
  nnunet:
    image: nnunet:latest
    runtime: nvidia
    environment:
      - nnUNet_raw=/data/nnUNet_raw
      - nnUNet_preprocessed=/data/nnUNet_preprocessed
      - nnUNet_results=/models/nnUNet_results
      - NVIDIA_VISIBLE_DEVICES=1
    volumes:
      - ./models/nnUNet:/models/nnUNet_results
      - ./data:/data
    ports:
      - "8002:8000"

  # TotalSegmentator Service
  totalsegmentator:
    image: wasserth/totalsegmentator:latest
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=2
    volumes:
      - ./data:/data
    ports:
      - "8003:8000"

  # API Gateway
  gateway:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - hd-bet
      - nnunet
      - totalsegmentator
```

### Quality Assurance Pipeline

```python
"""
Post-processing quality assurance for segmentation outputs.
"""
import nibabel as nib
import numpy as np
from scipy import ndimage

def validate_segmentation(
    segmentation: np.ndarray,
    expected_labels: list = None,
    min_volume_ml: float = 0.1,
    max_volume_ml: float = 5000.0,
    voxel_spacing: tuple = (1.0, 1.0, 1.0)
) -> dict:
    """
    Validate segmentation output for clinical quality.
    
    Returns QA report with pass/fail status.
    """
    qa_report = {
        "passed": True,
        "checks": {},
        "warnings": [],
        "errors": []
    }
    
    voxel_volume = np.prod(voxel_spacing) / 1000  # ml
    
    # Check 1: Non-empty segmentation
    if np.sum(segmentation > 0) == 0:
        qa_report["checks"]["non_empty"] = "FAIL"
        qa_report["errors"].append("Segmentation is empty")
        qa_report["passed"] = False
    else:
        qa_report["checks"]["non_empty"] = "PASS"
    
    # Check 2: Expected labels present
    if expected_labels:
        unique_labels = set(np.unique(segmentation))
        missing = set(expected_labels) - unique_labels
        if missing:
            qa_report["checks"]["expected_labels"] = "WARN"
            qa_report["warnings"].append(f"Missing labels: {missing}")
        else:
            qa_report["checks"]["expected_labels"] = "PASS"
    
    # Check 3: Volume constraints per label
    for label in np.unique(segmentation):
        if label == 0:
            continue
        volume = np.sum(segmentation == label) * voxel_volume
        if volume < min_volume_ml:
            qa_report["warnings"].append(
                f"Label {label}: volume {volume:.2f}ml below minimum"
            )
        if volume > max_volume_ml:
            qa_report["errors"].append(
                f"Label {label}: volume {volume:.2f}ml exceeds maximum"
            )
            qa_report["passed"] = False
    
    # Check 4: Connected component analysis
    for label in np.unique(segmentation):
        if label == 0:
            continue
        label_mask = (segmentation == label).astype(np.uint8)
        labeled, num_features = ndimage.label(label_mask)
        if num_features > 10:
            qa_report["warnings"].append(
                f"Label {label}: {num_features} disconnected components"
            )
    
    # Check 5: Spatial extent
    nonzero_coords = np.argwhere(segmentation > 0)
    if len(nonzero_coords) > 0:
        extent = nonzero_coords.max(axis=0) - nonzero_coords.min(axis=0)
        if np.any(extent < 2):
            qa_report["warnings"].append("Segmentation may be slice-thin")
    
    return qa_report
```

---

## 8. GPU Requirements & Benchmarks

### Hardware Recommendations by Workload

| Workload | Minimum GPU | Recommended GPU | VRAM | Notes |
|----------|------------|-----------------|------|-------|
| **Brain Extraction (HD-BET)** | GTX 1060 6GB | RTX 3060 12GB | 4 GB | CPU fallback available |
| **Brain Segmentation (SynthSeg)** | RTX 3060 12GB | RTX 3080 16GB | 8 GB | CPU ~2min acceptable |
| **Cortical Recon (FastSurfer)** | RTX 3080 16GB | RTX 4090 24GB | 8 GB | Seg-only: 5 min |
| **Tumor Seg (nnU-Net)** | RTX 3080 16GB | RTX 4090 24GB | 11 GB | For 3D fullres |
| **Whole Body (TotalSeg)** | RTX 3080 16GB | RTX 4090 24GB | 10 GB | Fast mode: 4GB |
| **Interactive (SAMRI)** | RTX 3060 12GB | RTX 3080 16GB | 6 GB | Per-slice inference |
| **Training nnU-Net** | RTX 4090 24GB | A100 40/80GB | 24 GB | For state-of-art |
| **Training MONAI** | RTX 4090 24GB | A100 40/80GB | 16 GB | Depends on model |

### Multi-GPU Scaling

| Tool | Multi-GPU Training | Multi-GPU Inference |
|------|-------------------|---------------------|
| HD-BET | N/A | N/A (single scan) |
| nnU-Net | Yes (DDP) | Yes (ensemble across folds) |
| MONAI | Yes (DDP, Horovod) | Yes (data parallel) |
| FastSurfer | No | Batch processing |
| TotalSegmentator | No | Batch processing |

---

## 9. References

### Key Papers

1. **HD-BET**: Isensee F, et al. "Automated brain extraction of multi-sequence MRI using artificial neural networks." *Human Brain Mapping*, 2019. DOI: 10.1002/hbm.24750

2. **SynthSeg**: Billot B, et al. "Segmentation of brain MRI scans of any contrast and resolution without retraining." *Medical Image Analysis*, 2023. DOI: 10.1016/j.media.2023.102789

3. **FastSurfer**: Reuter M, et al. "Fast cortical surface reconstruction from MRI using deep learning." *PMC8907118*, 2022.

4. **FSL BET**: Smith SM. "Fast robust automated brain extraction." *Human Brain Mapping*, 2002. DOI: 10.1002/hbm.10062

5. **ANTs**: Tustison NJ, Avants BB. "Explicit B-spline regularization in diffeomorphic image registration." *Frontiers in Neuroinformatics*, 2013.

6. **LST**: Schmidt P, et al. "An automated tool for detection of FLAIR-hyperintense white-matter lesions in MS." *NeuroImage*, 2012.

7. **SAMRI**: Wang Z, et al. "SAMRI: Segment Anything Model for MRI." *arXiv:2510.26635*, 2025.

8. **DeepMedic**: Kamnitsas K, et al. "Efficient Multi-Scale 3D CNN with Fully Connected CRF for Accurate Brain Lesion Segmentation." *Medical Image Analysis*, 2017.

9. **TotalSegmentator**: Wasserthal J, et al. "TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images." *Radiology: AI*, 2023.

10. **MONAI**: Cardoso MJ, et al. "MONAI: An open-source framework for deep learning in healthcare." *Nature Methods*, 2022.

11. **nnU-Net**: Isensee F, et al. "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation." *Nature Methods*, 2021.

### Additional Resources

- **SAM4MIS Survey**: https://github.com/YichiZhang98/SAM4MIS - Comprehensive survey of SAM for medical image segmentation
- **Brain-SAM**: https://github.com/DLbrainsam/Brain-SAM - SAM tailored for brain MRI lesion segmentation
- **FreeSurfer Wiki**: https://surfer.nmr.mgh.harvard.edu/fswiki/SynthSeg
- **MONAI Tutorials**: https://github.com/Project-MONAI/tutorials
- **nnU-Net Documentation**: https://github.com/MIC-DKFZ/nnUNet/blob/master/documentation

---

> **Disclaimer**: This guide is for research and educational purposes. None of the tools described are FDA-cleared medical devices unless explicitly stated. Clinical use requires appropriate regulatory approval, validation, and oversight by qualified medical professionals.

---

*Generated by DeepSynaps Protocol Studio - Medical AI Research Division*
*Last updated: July 2025*
