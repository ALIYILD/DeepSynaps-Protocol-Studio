# MRI Brain Age Prediction & Biomarker Extraction Stack

## The Definitive Guide to Neuroimaging Biomarkers for Brain Age Estimation and Clinical Validation

---

**Version:** 1.0  
**Last Updated:** 2025  
**Domain:** Computational Neuroimaging, MRI Biomarkers, Brain Age Prediction  
**Target Audience:** Neuroimaging researchers, clinical radiologists, computational neuroscience practitioners  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Brain Age Prediction Methods](#2-brain-age-prediction-methods)
   - 2.1 [brainageR](#21-brainager)
   - 2.2 [pyment](#22-pyment)
   - 2.3 [DeepBrainNet](#23-deepbrainnet)
   - 2.4 [ENIGMA-BrainAge](#24-enigma-brainage)
3. [Biomarker Extraction Pipelines](#3-biomarker-extraction-pipelines)
   - 3.1 [FSL-VBM](#31-fsl-vbm)
   - 3.2 [ANTs Cortical Thickness](#32-ants-cortical-thickness)
   - 3.3 [FreeSurfer recon-all](#33-freesurfer-recon-all)
   - 3.4 [Hippocampal Volume Measurement](#34-hippocampal-volume-measurement)
   - 3.5 [WMH Quantification (Fazekas)](#35-wmh-quantification-fazekas)
4. [White Matter Analysis](#4-white-matter-analysis)
   - 4.1 [TBSS](#41-tbss)
   - 4.2 [DIPY](#42-dipy)
   - 4.3 [Camino](#43-camino)
5. [Normative Comparison Frameworks](#5-normative-comparison-frameworks)
6. [Evidence Summary Table](#6-evidence-summary-table)
7. [Clinical Integration Pathway](#7-clinical-integration-pathway)
8. [References](#8-references)

---

## 1. Executive Summary

This guide provides a comprehensive, evidence-based reference for the entire neuroimaging biomarker pipeline -- from brain age prediction to structural and white matter biomarker extraction. It covers 12 major open-source tools across three categories:

| Category | Tools | Purpose |
|----------|-------|---------|
| Brain Age Prediction | brainageR, pyment, DeepBrainNet, ENIGMA-BrainAge | Estimate biological brain age from T1-weighted MRI |
| Biomarker Extraction | FSL-VBM, ANTs, FreeSurfer, FSL-FIRST, Fazekas/Automated WMH | Quantify structural brain changes |
| White Matter Analysis | TBSS, DIPY, Camino | Analyze diffusion MRI and white matter integrity |

**Key Definitions:**
- **Brain Age Gap (BAG)** / **Predicted Age Deviation (PAD):** The difference between brain-predicted age and chronological age. Positive values suggest accelerated aging.
- **Mean Absolute Error (MAE):** Average absolute difference between predicted and chronological age -- primary accuracy metric for brain age models.
- **Evidence Grades:** A = Systematic review/meta-analysis validation; B = Multiple independent cohorts; C = Single cohort/limited validation; D = Proof of concept only.

---

## 2. Brain Age Prediction Methods

### 2.1 brainageR

**Description:** An R-based brain age prediction tool using Gaussian Process Regression (GPR) with voxel-based features derived from SPM12 segmentation. This is one of the most widely cited and validated brain age packages in the literature.

| Attribute | Detail |
|-----------|--------|
| **Algorithm** | Gaussian Process Regression (GPR) with RBF kernel |
| **Input Features** | Voxel-based GM, WM, CSF probability maps from SPM12 |
| **Preprocessing** | SPM12 segmentation + normalization, PCA (435 components) |
| **Training N** | 3,377 healthy subjects, age 16-92 years |
| **Reported Accuracy** | MAE = 4.9 years, r = 0.947 |
| **Implementation** | R (kernlab package) + shell scripts |

**GitHub:** https://github.com/james-cole/brainageR  
**Paper(s):** Cole et al. (multiple -- see citations on GitHub)  
**Docker Alternative:** https://github.com/fprados/brainageR_dockerfile (uses Octave instead of MATLAB)

#### Installation

```bash
# Create working directory
mkdir brainageR && cd brainageR

# Clone repository
git clone https://github.com/james-cole/brainageR.git software

# Download PCA files (too large for GitHub LFS)
# Get pca_center.rds, pca_rotation.rds, pca_scale.rds from:
# - v2.1 Releases page on GitHub, OR
# - Zenodo / OSF (see README)

# Place the three .rds files in the software/ directory
```

**Prerequisites:**
- SPM12 (version r7219 recommended; issues with r7771/r7593+)
- MATLAB
- R (v3.4+ tested)
- R packages: `kernlab`, `RNifti`, `stringr`
- FSL (optional, for slicesdir quality control)

**Configuration:**
Edit `brainageR/software/brainageR` to set paths:
```bash
brainageR_dir=/home/user/brainageR/
spm_dir=/apps/matlab_toolboxes/spm12/
matlab_path=/Applications/MATLAB_R2017b.app/bin/matlab
FSLDIR=/usr/local/fsl/
```

#### Usage Example

```bash
# Add to PATH
export PATH=$PATH:/home/user/brainageR/software

# Run brain age prediction
brainageR -i subject_t1.nii.gz -o output_directory

# Output: predicted brain age, brain age gap (PAD)
```

#### Python Integration

```python
import subprocess
import pandas as pd

def run_brainager(t1_path, output_dir):
    """
    Run brainageR on a T1-weighted MRI scan.
    
    Parameters:
    -----------
    t1_path : str
        Path to T1-weighted NIfTI file
    output_dir : str
        Output directory for results
    
    Returns:
    --------
    dict : predicted_age, pad (predicted age deviation)
    """
    cmd = [
        "brainageR",
        "-i", t1_path,
        "-o", output_dir
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    # Parse output
    # Output typically contains predicted age values
    return {
        "predicted_age": None,  # Parse from output
        "pad": None,            # predicted_age - chronological_age
        "command_output": result.stdout
    }

# Batch processing
subjects = pd.read_csv("subject_list.csv")
results = []
for _, row in subjects.iterrows():
    result = run_brainager(row["t1_path"], f"output/{row['id']}")
    results.append(result)
```

#### Normative Comparison Approach
- Compare individual PAD against distribution from healthy controls
- Cole et al. (2022): Brain-age associated with progression to dementia in memory clinic patients
- Typical cutoff: PAD > 2-3 SD above mean indicates accelerated aging

#### Evidence Grade: **B**
- Multiple independent validation studies (ENIGMA consortium)
- Test-retest reliability ICC = 0.98 (0.96-0.99)
- Cross-sectional validation in depression, PTSD, dementia cohorts
- **Clinical Validation Status:** Validated in memory clinic settings; associated with dementia progression (NeuroImage: Clinical, 2022)

---

### 2.2 pyment

**Description:** A Python-based brain age prediction tool using a 3D Simple Fully Convolutional Network (SFCN). One of the highest-performing publicly available brain age packages with excellent test-retest reliability.

| Attribute | Detail |
|-----------|--------|
| **Algorithm** | 3D Simple Fully Convolutional Network (SFCN) |
| **Input Features** | Skull-stripped, MNI152-registered T1-weighted images |
| **Preprocessing** | FreeSurfer (skull stripping) + FSL (reorientation + MNI registration) |
| **Training N** | 53,542 subjects, age 3-85 years |
| **Reported Accuracy** | MAE = 3.9 years, r = 0.975 |
| **Implementation** | Python (PyTorch), CLI/Docker/API |

**GitHub:** https://github.com/estenhl/pyment-public  
**Paper:** Peng et al. (2021) "Accurate brain age prediction with lightweight deep learning"; Dartora et al. (2024) Frontiers in Aging Neuroscience

#### Installation

```bash
# Clone repository
git clone https://github.com/estenhl/pyment-public.git
cd pyment-public

# Install dependencies
pip install -r requirements.txt

# Install PyTorch (CUDA version recommended for training)
# Follow instructions at https://pytorch.org/

# Prerequisites:
# - Python 3.5+
# - FSL v6.0 (for registration)
# - FreeSurfer (for skull stripping)
```

**Dependencies:** numpy, matplotlib, argparse, glob3, nibabel, h5py, nipype, tensorboard, monai, PyTorch 1.2+

#### Usage Example

```bash
# Using command line interface
python brain_age.py -i subject_t1.nii.gz -o output_dir

# Using Docker
docker run -v /data:/data pyment -i /data/subject_t1.nii.gz -o /data/output
```

#### Python API Example

```python
"""
pyment Python API for brain age prediction
Requires: pyment-public repository cloned and dependencies installed
"""

import nibabel as nib
import numpy as np
from pathlib import Path

# Note: pyment uses a 3D CNN model
# Preprocessing steps required:
# 1. Skull stripping (FreeSurfer mri_watershed or SAMSEG)
# 2. Reorientation to standard space (FSL fslreorient2std)
# 3. Linear registration to MNI152 (FSL flirt)

def preprocess_for_pyment(t1_path, output_dir):
    """
    Preprocess T1 for pyment brain age prediction.
    
    Steps:
    1. Skull strip with FreeSurfer
    2. Reorient with FSL
    3. Register to MNI152
    """
    import subprocess
    
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)
    
    subject_id = Path(t1_path).stem.replace('.nii', '')
    
    # Step 1: Skull stripping with FreeSurfer
    skullstrip_cmd = [
        "mri_watershed",
        t1_path,
        str(output_dir / f"{subject_id}_brain.nii.gz")
    ]
    subprocess.run(skullstrip_cmd, check=True)
    
    # Step 2: Reorient to standard space
    reorient_cmd = [
        "fslreorient2std",
        str(output_dir / f"{subject_id}_brain.nii.gz"),
        str(output_dir / f"{subject_id}_reorient.nii.gz")
    ]
    subprocess.run(reorient_cmd, check=True)
    
    # Step 3: Register to MNI152
    reg_cmd = [
        "flirt",
        "-in", str(output_dir / f"{subject_id}_reorient.nii.gz"),
        "-ref", os.environ["FSLDIR"] + "/data/standard/MNI152_T1_1mm_brain.nii.gz",
        "-out", str(output_dir / f"{subject_id}_mni.nii.gz"),
        "-omat", str(output_dir / f"{subject_id}_to_mni.mat"),
        "-dof", "12"
    ]
    subprocess.run(reg_cmd, check=True)
    
    return str(output_dir / f"{subject_id}_mni.nii.gz")

def predict_brain_age_pyment(preprocessed_t1, model_path=None):
    """
    Predict brain age using pyment SFCN model.
    
    Parameters:
    -----------
    preprocessed_t1 : str
        Path to skull-stripped, MNI-registered T1
    model_path : str, optional
        Path to pre-trained model weights
    
    Returns:
    --------
    dict : predicted_age, confidence_interval
    """
    # Load preprocessed image
    img = nib.load(preprocessed_t1)
    data = img.get_fdata()
    
    # Normalize intensity
    data = (data - data.mean()) / data.std()
    
    # Add batch and channel dimensions: (batch, channel, x, y, z)
    input_tensor = torch.FloatTensor(data).unsqueeze(0).unsqueeze(0)
    
    # Load model (requires pyment model architecture)
    # model = SFCN()  # pyment model class
    # model.load_state_dict(torch.load(model_path))
    # model.eval()
    
    # Predict
    # with torch.no_grad():
    #     prediction = model(input_tensor)
    
    # For actual implementation, see pyment-public repository
    return {
        "predicted_age": None,  # From model output
        "chronological_age": None,  # From subject metadata
        "pad": None  # predicted_age - chronological_age
    }

# Batch processing example
import pandas as pd

def batch_predict(subjects_csv, output_csv):
    """Process multiple subjects and save results."""
    subjects = pd.read_csv(subjects_csv)
    results = []
    
    for _, subject in subjects.iterrows():
        try:
            preproc = preprocess_for_pyment(
                subject["t1_path"], 
                f"preproc/{subject['id']}"
            )
            prediction = predict_brain_age_pyment(preproc)
            prediction["subject_id"] = subject["id"]
            prediction["chronological_age"] = subject["age"]
            prediction["pad"] = (
                prediction["predicted_age"] - subject["age"]
            )
            results.append(prediction)
        except Exception as e:
            print(f"Error processing {subject['id']}: {e}")
    
    results_df = pd.DataFrame(results)
    results_df.to_csv(output_csv, index=False)
    return results_df
```

#### Normative Comparison Approach
- pyment provides age-specific normative data from training set
- PAD compared against age- and sex-matched controls
- Longitudinal tracking: slope of PAD over time indicates acceleration/deceleration

#### Evidence Grade: **A**
- Highest test-retest reliability (ICC = 0.98) among all compared packages
- Lowest adjusted MAD (1.17 years) in head-to-head comparison
- Strong longitudinal consistency
- **Clinical Validation Status:** Extensively validated; distinguishes CN vs MCI vs AD (p < 0.001); predicts cognitive decline progression

---

### 2.3 DeepBrainNet

**Description:** A deep learning brain age prediction tool using a 2D Convolutional Neural Network (CNN) with transfer learning from ImageNet. Built on ANTs preprocessing for fully automated processing.

| Attribute | Detail |
|-----------|--------|
| **Algorithm** | 2D CNN (transfer learning from ImageNet) |
| **Input Features** | T1-weighted MRI slices (2D) |
| **Preprocessing** | ANTs: N4 bias correction, skull-stripping, affine registration to MNI |
| **Training N** | 11,729 subjects, age 3-95 years |
| **Reported Accuracy** | MAE = 2.94 years, r = 0.975 |
| **Implementation** | Python, integrated in ANTsPyNet |

**GitHub:** https://github.com/vishnubashyam/DeepBrainNet  
**Paper:** Bashyal et al.  
**Alternative Access:** https://antsx.github.io/ANTsPyNet/docs/build/html/utilities.html

#### Installation

```bash
# Method 1: Standalone DeepBrainNet
git clone https://github.com/vishnubashyam/DeepBrainNet.git
cd DeepBrainNet

# Install ANTsPy (required for preprocessing)
pip install antspyx

# Install ANTsPyNet (contains DeepBrainNet integration)
pip install antspynet

# Method 2: Through ANTsPyNet (recommended)
pip install antspyx antspynet
```

#### Python Example

```python
"""
DeepBrainNet brain age prediction via ANTsPyNet
"""

import ants
import antspynet
import numpy as np

def predict_brain_age_deepbrainnet(t1_path, chronological_age=None):
    """
    Predict brain age using DeepBrainNet via ANTsPyNet.
    
    Parameters:
    -----------
    t1_path : str
        Path to T1-weighted MRI
    chronological_age : float, optional
        Subject's chronological age for PAD calculation
    
    Returns:
    --------
    dict : predicted_age, pad, preprocessing_info
    """
    # Read T1 image
    t1 = ants.image_read(t1_path)
    
    # Preprocessing is handled internally by ANTsPyNet:
    # 1. N4 bias correction
    # 2. Brain extraction
    # 3. Affine registration to MNI space
    
    # DeepBrainNet prediction via ANTsPyNet
    # The deep_brain_age function may be available in newer ANTsPyNet versions
    
    # Alternative: manual preprocessing + prediction
    # Step 1: N4 bias correction
    t1_n4 = ants.n4_bias_field_correction(t1)
    
    # Step 2: Brain extraction
    brain_mask = antspynet.brain_extraction(t1_n4, modality="t1")
    t1_brain = t1_n4 * brain_mask
    
    # Step 3: Registration to MNI (if needed)
    # mni = ants.image_read("MNI152_T1_1mm.nii.gz")
    # reg = ants.registration(mni, t1_brain, type_of_transform="Affine")
    
    # Note: For actual prediction, use pre-trained DeepBrainNet weights
    # from the official repository or ANTsPyNet
    
    predicted_age = None  # From model inference
    
    return {
        "predicted_age": predicted_age,
        "pad": predicted_age - chronological_age if chronological_age else None,
        "preprocessing": "N4 + brain extraction + MNI registration"
    }

# Direct ANTsPyNet cortical thickness + brain age pipeline
def full_ants_pipeline(t1_path):
    """
    Full ANTs pipeline including cortical thickness and brain metrics.
    """
    t1 = ants.image_read(t1_path)
    
    # Deep Atropos segmentation (6-tissue)
    atropos = antspynet.deep_atropos(t1, do_preprocessing=True)
    
    # Cortical thickness via DiReCT
    thickness = ants.kelly_kapowski(
        s=atropos['segmentation'],
        g=atropos['probabilityimages'][1],  # GM probability
        w=atropos['probabilityimages'][2],  # WM probability
        its=45,
        r=0.5,
        m=1.0
    )
    
    # DKT parcellation
    dkt = antspynet.desikan_killiany_tourville_labeling(t1)
    
    return {
        "segmentation": atropos,
        "thickness": thickness,
        "dkt_parcellation": dkt
    }
```

#### Normative Comparison Approach
- Compare predicted age against chronological age in healthy controls
- DeepBrainNet tends to show systematic bias (negative PAD in some cohorts)
- Requires cohort-specific calibration for clinical interpretation

#### Evidence Grade: **B**
- Good accuracy (MAE = 6.13 years in independent testing)
- Lower test-retest reliability (ICC = 0.67) compared to pyment/brainageR
- Large training dataset covering wide age range
- **Clinical Validation Status:** Differentiates clinical groups; less reliable for longitudinal tracking

---

### 2.4 ENIGMA-BrainAge

**Description:** The ENIGMA consortium's brain age prediction tool using ridge regression on FreeSurfer-derived morphometric features. Provides separate models for males and females. Available as a web application.

| Attribute | Detail |
|-----------|--------|
| **Algorithm** | Ridge Regression (RR) |
| **Input Features** | 77 FreeSurfer ROI features (34 cortical thickness, 34 surface area, 7 subcortical volumes, ventricles, ICV) |
| **Preprocessing** | FreeSurfer recon-all pipeline |
| **Training N** | 9,526 controls (5-90 years, discovery); 2,101 independent test |
| **Reported Accuracy** | MAE = 2.94 years |
| **Implementation** | Web application + Python backend |

**Web Application:** https://centilebrain.org/#/brainAGE2  
**Legacy Web App:** https://photon-ai.com/enigma_brainage  
**Paper:** Ge et al. (2024) Human Brain Mapping; Han et al. (2021)  
**Working Group:** https://enigma.ini.usc.edu/ongoing/enigma-brainage/

#### Installation

ENIGMA-BrainAge is primarily available as a **web application** -- no local installation required. The ENIGMA Lifespan model is now integrated into CentileBrain.

```bash
# For local implementation, replicate the pipeline:
# 1. Run FreeSurfer recon-all to extract features
# 2. Apply ridge regression models (available from ENIGMA)

# FreeSurfer installation required
export FREESURFER_HOME=/usr/local/freesurfer
source $FREESURFER_HOME/SetUpFreeSurfer.sh
```

#### Python Example

```python
"""
ENIGMA-BrainAge prediction using FreeSurfer outputs
"""

import pandas as pd
import numpy as np
from sklearn.linear_model import Ridge
import subprocess
import os

def extract_freesurfer_features(subject_id, subjects_dir):
    """
    Extract ENIGMA-compatible features from FreeSurfer output.
    
    Features needed (77 total):
    - 34 cortical thickness values (Desikan-Killiany, both hemispheres averaged)
    - 34 cortical surface area values
    - 7 subcortical volumes (hippocampus, amygdala, caudate, 
                             putamen, pallidum, thalamus, accumbens)
    - Lateral ventricle volume
    - Intracranial volume (ICV)
    
    Parameters:
    -----------
    subject_id : str
        FreeSurfer subject ID
    subjects_dir : str
        FREESURFER_SUBJECTS_DIR
    
    Returns:
    --------
    pd.Series : 77 features for brain age prediction
    """
    stats_dir = os.path.join(subjects_dir, subject_id, "stats")
    
    # Read cortical parcellation stats
    lh_aparc = pd.read_csv(
        os.path.join(stats_dir, "lh.aparc.stats"),
        comment="#", sep="\s+", header=None
    )
    rh_aparc = pd.read_csv(
        os.path.join(stats_dir, "rh.aparc.stats"),
        comment="#", sep="\s+", header=None
    )
    
    # Read aseg (subcortical) stats
    aseg_stats = {}
    with open(os.path.join(stats_dir, "aseg.stats")) as f:
        for line in f:
            if line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) >= 4:
                aseg_stats[parts[4]] = float(parts[3])  # volume in mm^3
    
    # Extract and average hemispheres
    features = {}
    
    # Cortical thickness (34 regions)
    ct_regions = [
        "bankssts", "caudalanteriorcingulate", "caudalmiddlefrontal",
        "cuneus", "entorhinal", "fusiform", "inferiorparietal",
        "inferiortemporal", "isthmuscingulate", "lateraloccipital",
        "lateralorbitofrontal", "lingual", "medialorbitofrontal",
        "middletemporal", "parahippocampal", "paracentral",
        "parsopercularis", "parsorbitalis", "parstriangularis",
        "pericalcarine", "postcentral", "posteriorcingulate",
        "precentral", "precuneus", "rostralanteriorcingulate",
        "rostralmiddlefrontal", "superiorfrontal", "superiorparietal",
        "superiortemporal", "supramarginal", "frontalpole",
        "temporalpole", "transversetemporal", "insula"
    ]
    
    for region in ct_regions:
        lh_val = lh_aparc[lh_aparc[0] == region][4].values[0] if region in lh_aparc[0].values else 0
        rh_val = rh_aparc[rh_aparc[0] == region][4].values[0] if region in rh_aparc[0].values else 0
        features[f"thickness_{region}"] = (lh_val + rh_val) / 2
    
    # Subcortical volumes
    subcortical = ["Hippocampus", "Amygdala", "Caudate", "Putamen", 
                   "Pallidum", "Thalamus", "Accumbens-area"]
    for struct in subcortical:
        lh_key = f"Left-{struct}"
        rh_key = f"Right-{struct}"
        features[f"vol_{struct.lower()}"] = (
            aseg_stats.get(lh_key, 0) + aseg_stats.get(rh_key, 0)
        ) / 2
    
    # Ventricles and ICV
    features["ventricles"] = (
        aseg_stats.get("Left-Lateral-Ventricle", 0) +
        aseg_stats.get("Right-Lateral-Ventricle", 0)
    )
    features["icv"] = aseg_stats.get("EstimatedTotalIntraCranialVol", 0)
    
    return pd.Series(features)

def predict_enigma_brainage(features_df, sex, model_path=None):
    """
    Predict brain age using ENIGMA ridge regression model.
    
    Parameters:
    -----------
    features_df : pd.DataFrame
        77 FreeSurfer features
    sex : str or array
        'M' or 'F' -- ENIGMA uses sex-specific models
    model_path : str, optional
        Path to pre-trained ridge regression models
    
    Returns:
    --------
    dict : predicted_age, pad, sex_specific_model
    """
    # ENIGMA provides separate models for males and females
    # These are ridge regression models with pre-trained coefficients
    
    if model_path:
        # Load pre-trained model
        model_male = Ridge()
        model_female = Ridge()
        # model_male.coef_ = ...  # Load from ENIGMA
        # model_female.coef_ = ...
    else:
        # Use ENIGMA web application for prediction
        # Or CentileBrain API
        raise ValueError("Pre-trained ENIGMA model required. Use web app or download model.")
    
    predictions = []
    for i, (features, s) in enumerate(zip(features_df.values, sex)):
        if s == 'M':
            pred = model_male.predict(features.reshape(1, -1))[0]
        else:
            pred = model_female.predict(features.reshape(1, -1))[0]
        predictions.append(pred)
    
    return {
        "predicted_age": np.array(predictions),
        "pad": predictions - features_df.index,  # if age is index
        "model_type": "Ridge Regression (ENIGMA)"
    }

# Full pipeline
def enigma_full_pipeline(subject_id, subjects_dir, chronological_age, sex):
    """Complete ENIGMA brain age pipeline."""
    
    # Step 1: Run FreeSurfer (if not already done)
    # recon-all -i t1.nii.gz -s subject_id -all
    
    # Step 2: Extract features
    features = extract_freesurfer_features(subject_id, subjects_dir)
    
    # Step 3: Predict brain age (use web app or local model)
    # For web app, upload features to CentileBrain
    # https://centilebrain.org/#/brainAGE2
    
    # Step 4: Calculate PAD
    pad = None  # From prediction
    
    return {
        "features": features,
        "predicted_age": None,  # From ENIGMA model
        "chronological_age": chronological_age,
        "pad": pad,
        "sex": sex
    }
```

#### CentileBrain Web Platform

The ENIGMA Lifespan working group's model is now available through **CentileBrain**:
- URL: https://centilebrain.org/#/brainAGE2
- Upload FreeSurfer stats files directly
- Age range: 5-90 years
- Provides: brain age, PAD, percentile ranking

#### Normative Comparison Approach
- Age- and sex-specific normative models
- Models divided into two age bins (5-40 and 40-90 years) for optimal accuracy
- CentileBrain provides percentile-based normative comparison
- Site harmonization strategies evaluated; no harmonization showed best accuracy

#### Evidence Grade: **A**
- Largest-scale brain age study (N = 35,683 discovery + 2,101 independent test)
- ENIGMA consortium multi-site replication in depression (N = 1,517)
- Cross-dataset generalizability validated
- Longitudinal consistency confirmed (N = 377, age 9-25)
- **Clinical Validation Status:** Large-scale depression study replicated brain-PAD findings; validated across 13 new cohorts

---

## 3. Biomarker Extraction Pipelines

### 3.1 FSL-VBM

**Description:** FSL's Voxel-Based Morphometry pipeline for automated gray matter volume analysis. A streamlined tool for voxelwise analysis of structural MRI data in a standard space.

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Voxelwise gray/white matter volume analysis |
| **Input** | T1-weighted MRI images |
| **Output** | Modulated, smoothed GM/WM maps in standard space |
| **Analysis** | GLM + permutation testing (randomise) |
| **Software** | FSL (fslvbm scripts) |

**Documentation:** https://fsl.fmrib.ox.ac.uk/fsl/docs/structural/fslvbm.html  
**Paper:** Ashburner & Friston (2000); Good et al. (2001)

#### Installation

FSL-VBM is included with FSL installation:
```bash
# Install FSL (includes VBM scripts)
# Download from https://fsl.fmrib.ox.ac.uk/fsl/fslwiki/FslInstallation

# Verify installation
which fslvbm_1_bet
# Should return path to fslvbm script

# Required FSL tools:
# - BET (brain extraction)
# - FAST (segmentation)
# - FLIRT/FNIRT (registration)
# - randomise (permutation testing)
```

#### Pipeline Steps

```bash
# ============================================
# FSL-VBM Complete Pipeline
# ============================================

# Step 0: Prepare directory structure
mkdir my_vbm_analysis && cd my_vbm_analysis
# Copy all T1 images to this directory
# Naming: sub-001_T1w.nii.gz, sub-002_T1w.nii.gz, etc.

# Step 1: Brain extraction
fslvbm_1_bet -b  # -b flag if images already brain-extracted
# Output: brain-extracted images in struc/ directory

# Step 2: Create study-specific template and register
fslvbm_2_template
# Creates study-specific GM template
# Registers all GM images to template
# Output: template/ directory with registration files

# Step 3: Modulation, smoothing, initial GLM
fslvbm_3_proc
# Applies modulation (preserve volume)
# Smooths with multiple kernels (e.g., 2mm, 3mm, 4mm)
# Runs initial GLM for quality assessment

# Step 4: Statistical analysis with randomise
# Design matrix must be created using FSL's GLM GUI
randomise -i GM_mod_merg_s3.nii.gz \
          -o vbm_results \
          -d design.mat \
          -t design.con \
          -m GM_template_mask.nii.gz \
          -T -n 5000
```

#### Python Integration

```python
"""
FSL-VBM pipeline automation with Python/Nipype
"""

import nipype.interfaces.fsl as fsl
from nipype import Node, Workflow
import os

def create_vbm_workflow(subject_list, output_dir):
    """
    Create Nipype workflow for VBM analysis.
    
    Parameters:
    -----------
    subject_list : list
        List of T1 image paths
    output_dir : str
        Output directory
    """
    wf = Workflow(name="vbm_analysis", base_dir=output_dir)
    
    # Brain extraction
    bet_nodes = []
    for i, t1 in enumerate(subject_list):
        bet = Node(fsl.BET(
            in_file=t1,
            frac=0.3,
            robust=True,
            mask=True,
            out_file=f"sub-{i:03d}_brain.nii.gz"
        ), name=f"bet_{i}")
        bet_nodes.append(bet)
    
    # Segmentation with FAST
    fast_nodes = []
    for i in range(len(subject_list)):
        fast = Node(fsl.FAST(
            segments=True,
            out_basename=f"sub-{i:03d}_",
            number_classes=3
        ), name=f"fast_{i}")
        fast_nodes.append(fast)
    
    # Registration to MNI (would be done after template creation)
    flirt = Node(fsl.FLIRT(
        reference="$FSLDIR/data/standard/MNI152_T1_1mm.nii.gz",
        cost="corratio",
        dof=12
    ), name="flirt_to_mni")
    
    return wf

# Using Python to parse VBM results
import nibabel as nib
import numpy as np

def extract_vbm_roi_values(vbm_map, atlas, region_labels):
    """
    Extract mean GM volume from ROIs.
    
    Parameters:
    -----------
    vbm_map : str
        Path to modulated GM map
    atlas : str
        Path to atlas (e.g., Harvard-Oxford)
    region_labels : dict
        Region names to label values
    
    Returns:
    --------
    dict : Mean GM volume per ROI
    """
    gm_img = nib.load(vbm_map)
    gm_data = gm_img.get_fdata()
    
    atlas_img = nib.load(atlas)
    atlas_data = atlas_img.get_fdata().astype(int)
    
    roi_values = {}
    for region, label in region_labels.items():
        mask = atlas_data == label
        if mask.sum() > 0:
            roi_values[region] = np.mean(gm_data[mask])
        else:
            roi_values[region] = np.nan
    
    return roi_values
```

#### Normative Comparison Approach
- Compare voxelwise GM volumes against age-matched control distribution
- Z-score maps: (individual - control_mean) / control_SD
- ROI-based: extract mean GM volume per region, compare to normative database

#### Evidence Grade: **A**
- Gold-standard method for GM volumetry
- Thousands of publications across neurological and psychiatric conditions
- Standard in ADNI, UK Biobank, and ENIGMA studies
- **Clinical Validation Status:** Established clinical biomarker for neurodegeneration; validated in Alzheimer's disease, Parkinson's, multiple sclerosis

---

### 3.2 ANTs Cortical Thickness

**Description:** The ANTs cortical thickness pipeline uses diffeomorphic registration-based cortical thickness (DiReCT/KellyKapowski) to estimate cortical thickness from probabilistic tissue segmentations. Now accelerated with deep learning via ANTsPyNet.

| Attribute | Detail |
|-----------|--------|
| **Algorithm** | DiReCT (Diffeomorphic Registration-based Cortical Thickness) |
| **Input** | T1-weighted MRI |
| **Output** | Cortical thickness maps, DKT parcellation (62 cortical regions) |
| **Processing Time** | ~1 hour (deep learning version) vs 4-15 hours (traditional) |
| **Implementation** | ANTsPy, ANTsPyNet (Python); ANTsR, ANTsRNet (R) |

**GitHub:** https://github.com/ANTsX/ANTs  
**ANTsPy:** https://github.com/ANTsX/ANTsPy  
**ANTsPyNet:** https://github.com/ANTsX/ANTsPyNet  
**Paper:** Tustison et al. (2014) NeuroImage; Avants et al. (2019) Nature Scientific Reports

#### Installation

```bash
# Install ANTsPy
pip install antspyx

# Install ANTsPyNet (for deep learning components)
pip install antspynet

# Verify installation
python -c "import ants; print(ants.__version__)"
python -c "import antspynet; print('ANTsPyNet OK')"
```

#### Python Example: Cortical Thickness

```python
"""
ANTs Cortical Thickness Pipeline with ANTsPy/ANTsPyNet
Complete single-subject processing example.
"""

import ants
import antspynet
import numpy as np
import pandas as pd

def ants_cortical_thickness_pipeline(t1_path, subject_id, output_dir):
    """
    Complete ANTs cortical thickness pipeline.
    
    Steps:
    1. Read T1 image
    2. Deep Atropos 6-tissue segmentation
    3. Cortical thickness via DiReCT (KellyKapowski)
    4. DKT parcellation
    5. Regional thickness extraction
    
    Parameters:
    -----------
    t1_path : str
        Path to T1-weighted MRI
    subject_id : str
        Subject identifier
    output_dir : str
        Output directory
    
    Returns:
    --------
    dict : thickness_map, regions, statistics
    """
    from pathlib import Path
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Step 1: Read T1
    print(f"[{subject_id}] Reading T1 image...")
    t1 = ants.image_read(t1_path)
    
    # Step 2: Deep Atropos segmentation (6-tissue)
    print(f"[{subject_id}] Running deep Atropos segmentation...")
    atropos = antspynet.deep_atropos(t1, do_preprocessing=True, verbose=True)
    
    # Extract tissue probability images
    segmentation = atropos['segmentation']
    prob_images = atropos['probabilityimages']
    # prob_images[0] = background/CSF
    # prob_images[1] = cortical GM
    # prob_images[2] = WM
    # prob_images[3] = deep GM
    # prob_images[4] = brain stem
    # prob_images[5] = cerebellum
    
    # Save segmentation
    ants.image_write(segmentation, str(output_dir / f"{subject_id}_seg.nii.gz"))
    
    # Step 3: Cortical thickness via KellyKapowski (DiReCT)
    print(f"[{subject_id}] Computing cortical thickness...")
    thickness = ants.kelly_kapowski(
        s=segmentation,
        g=prob_images[1],      # GM probability
        w=prob_images[2],      # WM probability
        its=45,                # iterations
        r=0.025,               # gradient descent step
        m=1.5,                 # smoothing parameter
        gm_label=2,            # GM label in segmentation
        wm_label=3             # WM label in segmentation
    )
    
    # Save thickness map
    ants.image_write(thickness, str(output_dir / f"{subject_id}_thickness.nii.gz"))
    
    # Step 4: DKT parcellation
    print(f"[{subject_id}] Running DKT parcellation...")
    dkt = antspynet.desikan_killiany_tourville_labeling(t1, do_preprocessing=True)
    ants.image_write(dkt, str(output_dir / f"{subject_id}_dkt.nii.gz"))
    
    # Step 5: Extract regional thickness values
    print(f"[{subject_id}] Extracting regional thickness...")
    regions = extract_regional_thickness(thickness, dkt)
    
    # Save results
    regions_df = pd.DataFrame([regions])
    regions_df.to_csv(output_dir / f"{subject_id}_thickness_regions.csv", index=False)
    
    return {
        "subject_id": subject_id,
        "thickness_map": thickness,
        "segmentation": segmentation,
        "dkt": dkt,
        "regional_thickness": regions,
        "mean_thickness": np.mean(regions.values()),
        "output_dir": output_dir
    }

def extract_regional_thickness(thickness_map, dkt_parcellation):
    """
    Extract mean cortical thickness per DKT region.
    
    DKT labels (62 cortical regions, 31 per hemisphere):
    - 1002-1035: Left hemisphere
    - 2002-2035: Right hemisphere
    """
    dkt_data = dkt_parcellation.numpy()
    thick_data = thickness_map.numpy()
    
    # DKT region names and label numbers
    dkt_regions = {
        "caudalanteriorcingulate": [1002, 2002],
        "caudalmiddlefrontal": [1003, 2003],
        "cuneus": [1005, 2005],
        "entorhinal": [1006, 2006],
        "fusiform": [1007, 2007],
        "inferiorparietal": [1008, 2008],
        "inferiortemporal": [1009, 2009],
        "isthmuscingulate": [1010, 2010],
        "lateraloccipital": [1011, 2011],
        "lateralorbitofrontal": [1012, 2012],
        "lingual": [1013, 2013],
        "medialorbitofrontal": [1014, 2014],
        "middletemporal": [1015, 2015],
        "parahippocampal": [1016, 2016],
        "paracentral": [1017, 2017],
        "parsopercularis": [1018, 2018],
        "parsorbitalis": [1019, 2019],
        "parstriangularis": [1020, 2020],
        "pericalcarine": [1021, 2021],
        "postcentral": [1022, 2022],
        "posteriorcingulate": [1023, 2023],
        "precentral": [1024, 2024],
        "precuneus": [1025, 2025],
        "rostralanteriorcingulate": [1026, 2026],
        "rostralmiddlefrontal": [1027, 2027],
        "superiorfrontal": [1028, 2028],
        "superiorparietal": [1029, 2029],
        "superiortemporal": [1030, 2030],
        "supramarginal": [1031, 2031],
        "frontalpole": [1032, 2032],
        "temporalpole": [1033, 2033],
        "transversetemporal": [1034, 2034],
        "insula": [1035, 2035]
    }
    
    region_thickness = {}
    for region, labels in dkt_regions.items():
        mask = np.isin(dkt_data, labels)
        if mask.sum() > 0:
            region_thickness[f"thickness_{region}"] = np.mean(thick_data[mask])
        else:
            region_thickness[f"thickness_{region}"] = 0.0
    
    return region_thickness

# Batch processing
def batch_process_cortical_thickness(subject_list_csv, output_base_dir):
    """
    Process multiple subjects for cortical thickness.
    
    CSV format: subject_id,t1_path,age,sex
    """
    subjects = pd.read_csv(subject_list_csv)
    results = []
    
    for _, subject in subjects.iterrows():
        try:
            result = ants_cortical_thickness_pipeline(
                t1_path=subject["t1_path"],
                subject_id=subject["subject_id"],
                output_dir=f"{output_base_dir}/{subject['subject_id']}"
            )
            result["age"] = subject["age"]
            result["sex"] = subject["sex"]
            results.append(result)
        except Exception as e:
            print(f"Error processing {subject['subject_id']}: {e}")
    
    # Compile regional thickness table
    thickness_df = pd.DataFrame([r["regional_thickness"] for r in results])
    thickness_df["subject_id"] = [r["subject_id"] for r in results]
    thickness_df["mean_thickness"] = [r["mean_thickness"] for r in results]
    thickness_df["age"] = [r["age"] for r in results]
    thickness_df["sex"] = [r["sex"] for r in results]
    
    thickness_df.to_csv(f"{output_base_dir}/all_subjects_thickness.csv", index=False)
    return thickness_df
```

#### Longitudinal Processing

```python
def ants_longitudinal_thickness(subject_timepoints, subject_id, output_dir):
    """
    Longitudinal cortical thickness with single-subject template (SST).
    
    Parameters:
    -----------
    subject_timepoints : list
        List of (timepoint_label, t1_path) tuples
    """
    # Use ANTsPyNet longitudinal cortical thickness
    # Builds SST, then processes each timepoint
    
    # Alternative: manual SST construction
    t1_images = [ants.image_read(tp[1]) for tp in subject_timepoints]
    
    # Build single-subject template
    sst = ants.build_template(
        image_list=t1_images,
        iterations=4
    )
    
    # Process each timepoint
    results = []
    for tp_label, tp_path in subject_timepoints:
        result = ants_cortical_thickness_pipeline(
            tp_path, f"{subject_id}_{tp_label}", output_dir
        )
        results.append(result)
    
    return results
```

#### Normative Comparison Approach
- Compare mean/regional cortical thickness to age- and sex-normative data
- Use centile-based scoring (e.g., CentileBrain)
- Z-scores: (individual thickness - normative mean) / normative SD
- AD cortical signature: weighted composite of regions typically affected in AD

#### Evidence Grade: **A**
- Validated against histological measures
- Cross-method validation with FreeSurfer (r > 0.9)
- Extensive use in ADNI, OASIS, UK Biobank
- Deep learning version validated in same-subject test-retest
- **Clinical Validation Status:** FDA-cleared components available; used in clinical trials for AD, FTD, ALS

---

### 3.3 FreeSurfer recon-all

**Description:** The gold-standard comprehensive cortical reconstruction and analysis pipeline. Generates complete surface-based morphometric measures including cortical thickness, surface area, gray matter volume, curvature, and subcortical volumes.

| Attribute | Detail |
|-----------|--------|
| **Pipeline** | 31+ stages across 3 autorecon stages |
| **Output** | 3D surfaces, cortical thickness, parcellations (aparc), subcortical volumes (aseg) |
| **Atlases** | Desikan-Killiany, Destrieux, DKT |
| **Processing Time** | 4-30 hours per subject (CPU) |
| **Implementation** | C/C++ with shell scripts |

**Website:** https://surfer.nmr.mgh.harvard.edu  
**Documentation:** https://surfer.nmr.mgh.harvard.edu/fswiki  
**Paper:** Fischl (2012); Dale et al. (1999); Fischl et al. (1999, 2002, 2004)

#### Installation

```bash
# Download FreeSurfer from https://surfer.nmr.mgh.harvard.edu/fswiki/Download
# Current version: 7.4.1

# Set environment
export FREESURFER_HOME=/usr/local/freesurfer/7.4.1
source $FREESURFER_HOME/SetUpFreeSurfer.sh

# Verify
recon-all --help
# Should show usage information

# License required (free for research)
# Obtain from https://surfer.nmr.mgh.harvard.edu/registration.html
```

#### Pipeline Execution

```bash
# ============================================
# FreeSurfer recon-all Pipeline
# ============================================

# Full pipeline (all 3 stages)
recon-all -i sub-001_T1w.nii.gz -s sub-001 -all

# Individual stages (for resuming/interruption)
recon-all -s sub-001 -autorecon1   # Motion correction, NU, Talairach, skull strip
recon-all -s sub-001 -autorecon2   # Segmentation, white matter, pial surfaces
recon-all -s sub-001 -autorecon3   # Parcellation, thickness, curvature stats

# With T2/FLAIR for improved pial surface
recon-all -i sub-001_T1w.nii.gz -T2 sub-001_T2w.nii.gz \
          -s sub-001 -all -T2pial

# Longitudinal processing
# Step 1: Cross-sectional for all timepoints
recon-all -i tp1.nii.gz -s sub-001_tp1 -all
recon-all -i tp2.nii.gz -s sub-001_tp2 -all

# Step 2: Create base/template
recon-all -base sub-001_base -tp sub-001_tp1 -tp sub-001_tp2 -all

# Step 3: Longitudinal processing
recon-all -long sub-001_tp1 sub-001_base -all
recon-all -long sub-001_tp2 sub-001_base -all
```

#### Python Integration

```python
"""
FreeSurfer output parsing and analysis with Python
"""

import nibabel as nib
import numpy as np
import pandas as pd
import subprocess
import os

class FreeSurferSubject:
    """
    Class to load and analyze FreeSurfer recon-all output.
    """
    
    def __init__(self, subject_id, subjects_dir):
        self.subject_id = subject_id
        self.subjects_dir = subjects_dir
        self.subject_path = os.path.join(subjects_dir, subject_id)
        self._load_data()
    
    def _load_data(self):
        """Load available data files."""
        self.mri_dir = os.path.join(self.subject_path, "mri")
        self.surf_dir = os.path.join(self.subject_path, "surf")
        self.stats_dir = os.path.join(self.subject_path, "stats")
        self.label_dir = os.path.join(self.subject_path, "label")
        
        # Check if recon-all completed
        self.is_complete = os.path.exists(
            os.path.join(self.subject_path, "scripts", "recon-all.done")
        )
    
    def get_aseg_stats(self):
        """Parse aseg.stats for subcortical volumes."""
        stats_file = os.path.join(self.stats_dir, "aseg.stats")
        
        volumes = {}
        with open(stats_file, 'r') as f:
            for line in f:
                if line.startswith('#'):
                    continue
                parts = line.split()
                if len(parts) >= 5:
                    struct_name = parts[4]
                    volume_mm3 = float(parts[3])
                    volumes[struct_name] = volume_mm3
        
        return volumes
    
    def get_cortical_thickness(self, atlas='aparc'):
        """
        Get cortical thickness per region.
        
        Atlases: 'aparc' (Desikan-Killiany), 'aparc.a2009s' (Destrieux), 'aparc.DKTatlas'
        """
        thickness = {}
        
        for hemi in ['lh', 'rh']:
            stats_file = os.path.join(self.stats_dir, f"{hemi}.{atlas}.stats")
            
            with open(stats_file, 'r') as f:
                for line in f:
                    if line.startswith('#'):
                        continue
                    parts = line.split()
                    if len(parts) >= 6:
                        region = parts[0]
                        thick_mean = float(parts[4])  # thickness mean
                        thick_std = float(parts[5])   # thickness std
                        
                        key = f"{hemi}_{region}"
                        thickness[f"{key}_mean"] = thick_mean
                        thickness[f"{key}_std"] = thick_std
        
        return thickness
    
    def get_surface_area(self, atlas='aparc'):
        """Get surface area per region."""
        areas = {}
        
        for hemi in ['lh', 'rh']:
            stats_file = os.path.join(self.stats_dir, f"{hemi}.{atlas}.stats")
            
            with open(stats_file, 'r') as f:
                for line in f:
                    if line.startswith('#'):
                        continue
                    parts = line.split()
                    if len(parts) >= 4:
                        region = parts[0]
                        surf_area = float(parts[2])  # surface area (vertex area * num vertices)
                        areas[f"{hemi}_{region}_area"] = surf_area
        
        return areas
    
    def get_gray_matter_volume(self, atlas='aparc'):
        """Get gray matter volume per region (thickness * area)."""
        gmv = {}
        
        for hemi in ['lh', 'rh']:
            stats_file = os.path.join(self.stats_dir, f"{hemi}.{atlas}.stats")
            
            with open(stats_file, 'r') as f:
                for line in f:
                    if line.startswith('#'):
                        continue
                    parts = line.split()
                    if len(parts) >= 4:
                        region = parts[0]
                        volume = float(parts[3])  # gray matter volume
                        gmv[f"{hemi}_{region}_gmv"] = volume
        
        return gmv
    
    def get_icv(self):
        """Get estimated intracranial volume."""
        aseg = self.get_aseg_stats()
        return aseg.get('EstimatedTotalIntraCranialVol', None)
    
    def get_mean_thickness(self):
        """Get whole-brain mean cortical thickness."""
        ct = self.get_cortical_thickness()
        mean_values = [v for k, v in ct.items() if '_mean' in k]
        return np.mean(mean_values) if mean_values else None
    
    def get_hippocampal_volume(self):
        """Get hippocampal volume (left + right)."""
        aseg = self.get_aseg_stats()
        lh = aseg.get('Left-Hippocampus', 0)
        rh = aseg.get('Right-Hippocampus', 0)
        return {'left': lh, 'right': rh, 'total': lh + rh}
    
    def get_all_features(self):
        """Get complete feature set for brain age or analysis."""
        features = {}
        features.update(self.get_aseg_stats())
        features.update(self.get_cortical_thickness())
        features.update(self.get_surface_area())
        features.update(self.get_gray_matter_volume())
        features['mean_cortical_thickness'] = self.get_mean_thickness()
        features['icv'] = self.get_icv()
        return features


def batch_freesurfer_analysis(subjects_csv, subjects_dir, output_csv):
    """
    Extract features from multiple FreeSurfer subjects.
    
    CSV format: subject_id,age,sex,diagnosis
    """
    subjects = pd.read_csv(subjects_csv)
    all_features = []
    
    for _, row in subjects.iterrows():
        try:
            subj = FreeSurferSubject(row['subject_id'], subjects_dir)
            
            if not subj.is_complete:
                print(f"Warning: {row['subject_id']} recon-all not complete")
                continue
            
            features = subj.get_all_features()
            features['subject_id'] = row['subject_id']
            features['age'] = row['age']
            features['sex'] = row['sex']
            features['diagnosis'] = row.get('diagnosis', '')
            
            all_features.append(features)
            
        except Exception as e:
            print(f"Error processing {row['subject_id']}: {e}")
    
    df = pd.DataFrame(all_features)
    df.to_csv(output_csv, index=False)
    return df

# Quality Control

def check_freesurfer_quality(subject_id, subjects_dir):
    """
    Basic quality check for FreeSurfer output.
    
    Returns quality metrics and flags for visual inspection.
    """
    subj = FreeSurferSubject(subject_id, subjects_dir)
    
    aseg = subj.get_aseg_stats()
    icv = aseg.get('EstimatedTotalIntraCranialVol', 0)
    
    # Basic sanity checks
    flags = []
    if icv < 1000000 or icv > 2000000:
        flags.append(f"Unusual ICV: {icv:.0f} mm^3")
    
    lh_hippo = aseg.get('Left-Hippocampus', 0)
    rh_hippo = aseg.get('Right-Hippocampus', 0)
    if lh_hippo < 2000 or rh_hippo < 2000:
        flags.append("Very small hippocampus -- check segmentation")
    
    mean_ct = subj.get_mean_thickness()
    if mean_ct and (mean_ct < 2.0 or mean_ct > 4.0):
        flags.append(f"Unusual mean cortical thickness: {mean_ct:.2f} mm")
    
    return {
        "subject_id": subject_id,
        "icv_mm3": icv,
        "mean_thickness_mm": mean_ct,
        "hippocampal_volume_mm3": lh_hippo + rh_hippo,
        "flags": flags,
        "needs_qc": len(flags) > 0
    }
```

#### Normative Comparison Approach
- FreeSurfer outputs can be directly uploaded to **CentileBrain** for normative comparison
- Regional Z-scores against age- and sex-matched norms
- ENIGMA protocols provide standardized quality control procedures
- Visual QC with FreeView: inspect surfaces, parcellations, segmentations

#### Evidence Grade: **A**
- Most widely used neuroimaging analysis package (>50,000 citations)
- Validated against histology
- ENIGMA consortium standard
- **Clinical Validation Status:** FDA 510(k) cleared for clinical use; standard in epilepsy surgical planning; used in AD clinical trials

---

### 3.4 Hippocampal Volume Measurement

**Description:** Automated hippocampal volume measurement via FSL-FIRST or FreeSurfer aseg. The hippocampus is the most clinically important subcortical structure for neurodegeneration assessment.

| Attribute | FSL-FIRST | FreeSurfer aseg |
|-----------|-----------|-----------------|
| **Method** | Deformable mesh model | Atlas-based probabilistic |
| **Output** | Mesh + volumetric mask + bvars | Volumetric mask (aseg.mgz) |
| **Processing Time** | ~5 min per structure | Part of recon-all (~4-30h) |
| **Overestimation vs Manual** | ~28% | ~52% |

**FSL-FIRST Documentation:** https://fsl.fmrib.ox.ac.uk/fsl/docs/structural/first.html  
**FreeSurfer:** https://surfer.nmr.mgh.harvard.edu

#### FSL-FIRST Installation

Included with FSL installation. No additional setup required.

```bash
# Verify FIRST is available
which run_first_all
# Should return: /usr/local/fsl/bin/run_first_all
```

#### FSL-FIRST Usage

```bash
# Segment all subcortical structures
run_first_all -i t1_brain.nii.gz -o subject_001

# Segment specific structures (e.g., hippocampus and amygdala)
run_first_all -i t1_brain.nii.gz -b -s L_Hipp,R_Hipp,L_Amyg,R_Amyg -o subject_001

# Output files:
# subject_001_all_fast_firstseg.nii.gz -- segmentation image
# subject_001-L_Hipp_first.vtk -- surface mesh
# subject_001-L_Hipp_first.bvars -- shape parameters (for vertex analysis)
```

#### Python: FSL-FIRST Hippocampal Volume

```python
"""
Hippocampal volume measurement with FSL-FIRST and FreeSurfer
"""

import subprocess
import nibabel as nib
import numpy as np
import pandas as pd

def measure_hippocampus_first(t1_path, output_dir, subject_id):
    """
    Measure hippocampal volume using FSL-FIRST.
    
    Parameters:
    -----------
    t1_path : str
        Path to T1-weighted MRI (brain-extracted)
    output_dir : str
        Output directory
    subject_id : str
        Subject identifier
    
    Returns:
    --------
    dict : left_hippo_vol, right_hippo_vol, total_hippo_vol
    """
    from pathlib import Path
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_prefix = output_dir / subject_id
    
    # Run FIRST for hippocampus only
    cmd = [
        "run_first_all",
        "-i", t1_path,
        "-b",  # brain extracted
        "-s", "L_Hipp,R_Hipp",
        "-o", str(output_prefix)
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"FIRST error: {result.stderr}")
        return None
    
    # Read segmentation and calculate volumes
    seg_file = str(output_prefix) + "_all_fast_firstseg.nii.gz"
    seg = nib.load(seg_file)
    seg_data = seg.get_fdata()
    
    # FIRST label values:
    # L_Hipp = 17, R_Hipp = 53 (following FSL conventions)
    # Check actual labels in output
    voxel_volume = np.prod(seg.header.get_zooms())  # mm^3 per voxel
    
    left_hippo_vol = np.sum(seg_data == 17) * voxel_volume
    right_hippo_vol = np.sum(seg_data == 53) * voxel_volume
    
    # Alternative: use fslstats
    left_cmd = ["fslstats", seg_file, "-l", "16.5", "-u", "17.5", "-V"]
    right_cmd = ["fslstats", seg_file, "-l", "52.5", "-u", "53.5", "-V"]
    
    left_result = subprocess.run(left_cmd, capture_output=True, text=True)
    right_result = subprocess.run(right_cmd, capture_output=True, text=True)
    
    left_vol = float(left_result.stdout.split()[0]) if left_result.returncode == 0 else left_hippo_vol
    right_vol = float(right_result.stdout.split()[0]) if right_result.returncode == 0 else right_hippo_vol
    
    return {
        "subject_id": subject_id,
        "left_hippocampus_mm3": left_vol,
        "right_hippocampus_mm3": right_vol,
        "total_hippocampus_mm3": left_vol + right_vol,
        "hippocampal_asymmetry": abs(left_vol - right_vol) / (left_vol + right_vol),
        "method": "FSL-FIRST"
    }

def measure_hippocampus_freesurfer(aseg_file):
    """
    Measure hippocampal volume from FreeSurfer aseg.
    
    Parameters:
    -----------
    aseg_file : str
        Path to aseg.mgz or aseg.auto.mgz
    
    Returns:
    --------
    dict : Volumes and derived metrics
    """
    aseg = nib.load(aseg_file)
    aseg_data = aseg.get_fdata()
    
    # FreeSurfer labels:
    # Left-Hippocampus = 17
    # Right-Hippocampus = 53
    voxel_volume = np.prod(aseg.header.get_zooms())
    
    left_vol = np.sum(aseg_data == 17) * voxel_volume
    right_vol = np.sum(aseg_data == 53) * voxel_volume
    
    # Intracranial volume for normalization
    # Read from aseg.stats or estimate
    
    return {
        "left_hippocampus_mm3": left_vol,
        "right_hippocampus_mm3": right_vol,
        "total_hippocampus_mm3": left_vol + right_vol,
        "left_hippocampus_normalized": None,  # / ICV
        "right_hippocampus_normalized": None,
        "method": "FreeSurfer aseg"
    }

def icv_correct_hippocampal_volume(hippo_vol, icv, ref_icv_mean=1500000):
    """
    ICV-correct hippocampal volume.
    
    Formula: corrected_vol = raw_vol * (ref_icv_mean / individual_icv)
    
    This adjusts for head size differences.
    """
    return hippo_vol * (ref_icv_mean / icv)

# Batch hippocampal analysis
def batch_hippocampal_volumes(subject_list, t1_dir, output_csv, method='first'):
    """
    Measure hippocampal volumes for multiple subjects.
    
    Parameters:
    -----------
    subject_list : pd.DataFrame
        Columns: subject_id, age, sex, diagnosis
    method : str
        'first' or 'freesurfer'
    """
    results = []
    
    for _, subject in subject_list.iterrows():
        try:
            if method == 'first':
                t1_path = f"{t1_dir}/{subject['subject_id']}_brain.nii.gz"
                result = measure_hippocampus_first(
                    t1_path, 
                    "hippo_output", 
                    subject['subject_id']
                )
            elif method == 'freesurfer':
                aseg_path = f"{t1_dir}/{subject['subject_id']}/mri/aseg.mgz"
                result = measure_hippocampus_freesurfer(aseg_path)
                result['subject_id'] = subject['subject_id']
            
            if result:
                result['age'] = subject['age']
                result['sex'] = subject['sex']
                result['diagnosis'] = subject.get('diagnosis', '')
                results.append(result)
                
        except Exception as e:
            print(f"Error: {subject['subject_id']}: {e}")
    
    df = pd.DataFrame(results)
    df.to_csv(output_csv, index=False)
    return df
```

#### Normative Comparison Approach
- **ICV-correction:** Normalize hippocampal volume by intracranial volume
- **Normative databases:** Compare to age- and sex-matched healthy controls
- **Z-score:** (individual - control_mean) / control_SD
- **W-score:** Adjusted for total intracranial volume
- **CentileBrain** provides automated normative comparison for hippocampal volume
- **Clinical cutoff:** Bilateral hippocampal volume < 2.5 SD below mean suggests significant atrophy (AD indicator)

#### Evidence Grade: **A**
- Core AD biomarker (NIA-AA research framework)
- Validated against post-mortem histology
- Meta-analytic support for AD vs control discrimination (Cohen's d > 1.0)
- **Clinical Validation Status:** FDA-cleared as supplementary diagnostic for AD; required by NIA-AA criteria; used in clinical trials worldwide

---

### 3.5 WMH Quantification (Fazekas)

**Description:** White matter hyperintensity (WMH) quantification for assessing small vessel disease burden. Available as visual rating (Fazekas scale) or automated volumetric methods.

| Attribute | Visual (Fazekas) | Automated Volumetric |
|-----------|-----------------|---------------------|
| **Method** | Visual rating by trained rater | Automated segmentation |
| **Scales** | PVWMH: 0-3, DWMH: 0-3 | Continuous volume (mm^3) |
| **Reliability** | Moderate (inter-rater kappa ~0.6) | High (automated) |
| **Sensitivity** | Low (coarse categories) | High (continuous measure) |

**Tools:** Fazekas visual rating, UBO Detector, BIANCA (FSL), Icometrix  
**Paper:** Fazekas et al. (1987); Wardlaw et al. (2013) STandards for ReportIng Vascular changes on nEuroimaging (STRIVE)

#### Fazekas Scale Rating

```
Periventricular WMH (PVWMH):
  0 = No lesions
  1 = Caps or pencil-thin lining
  2 = Smooth halo
  3 = Irregular, extending into deep white matter

Deep WMH (DWMH):
  0 = No lesions
  1 = Punctate foci
  2 = Beginning confluence
  3 = Large confluent areas

Combined score = max(PVWMH, DWMH)
```

#### BIANCA (FSL) Installation

```bash
# BIANCA is included with FSL
which bianca
# Should return path to BIANCA executable

# Requires:
# - FSL (includes BIANCA)
# - Training data: manually segmented WMH examples
# - Structural images: T1, T2, FLAIR
```

#### Python: Automated WMH Quantification

```python
"""
WMH quantification with BIANCA (FSL) and Python analysis
"""

import subprocess
import nibabel as nib
import numpy as np
import pandas as pd
from pathlib import Path

def run_bianca(flair_path, t1_path, output_mask, training_data=None):
    """
    Run BIANCA for automated WMH segmentation.
    
    Parameters:
    -----------
    flair_path : str
        Path to FLAIR image
    t1_path : str
        Path to T1 image
    output_mask : str
        Output WMH mask path
    training_data : str, optional
        Path to BIANCA training file (points to manual segmentations)
    
    Returns:
    --------
    str : Path to WMH probability map
    """
    # Step 1: Register FLAIR to T1 (if needed)
    # BIANCA expects co-registered multi-modal images
    
    # Step 2: Create master file for BIANCA
    # Format: FLAIR_path T1_path mask_path manual_segmentation_path
    
    master_file = "bianca_master.txt"
    with open(master_file, 'w') as f:
        f.write(f"{flair_path} {t1_path} {output_mask}\n")
    
    # Step 3: Run BIANCA
    if training_data:
        # Training mode
        cmd = [
            "bianca",
            "--training", training_data,
            "--masterfile", master_file,
            "--querysubjectlist", "1",  # subject index to classify
            "--featuresubset", "1,2",    # FLAIR + T1 features
            "--labelfeaturenum", "3",    # manual segmentation column
            "--brainmaskfeaturenum", "2", # brain mask column
            "--classifier", "0",         # LDA
            "--output", output_mask
        ]
    else:
        # Classification with pre-trained model
        cmd = [
            "bianca",
            "--loadclassifierdata", "bianca_classifier.mat",
            "--masterfile", master_file,
            "--querysubjectlist", "1",
            "--featuresubset", "1,2",
            "--brainmaskfeaturenum", "2",
            "--output", output_mask
        ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"BIANCA error: {result.stderr}")
    
    return output_mask

def quantify_wmh(wmh_mask, flair_path, template_space=False):
    """
    Quantify WMH from BIANCA output mask.
    
    Parameters:
    -----------
    wmh_mask : str
        Path to BIANCA WMH probability map
    flair_path : str
        Path to FLAIR for voxel size info
    template_space : bool
        Whether mask is in template space
    
    Returns:
    --------
    dict : WMH volume metrics
    """
    wmh_img = nib.load(wmh_mask)
    wmh_data = wmh_img.get_fdata()
    
    flair_img = nib.load(flair_path)
    voxel_vol = np.prod(flair_img.header.get_zooms())
    
    # Threshold probability map (default 0.9)
    wmh_binary = (wmh_data > 0.9).astype(int)
    
    # Total WMH volume
    total_wmh_vol = np.sum(wmh_binary) * voxel_vol
    
    # Count lesions (connected components)
    from scipy import ndimage
    labeled, num_features = ndimage.label(wmh_binary)
    
    # Periventricular vs deep WMH
    # This requires ventricle mask or distance-based classification
    # Simplified: use distance from ventricles (would need ventricle mask)
    
    return {
        "total_wmh_volume_mm3": total_wmh_vol,
        "total_wmh_volume_ml": total_wmh_vol / 1000,
        "num_lesions": num_features,
        "mean_lesion_size_mm3": total_wmh_vol / num_features if num_features > 0 else 0,
        "max_lesion_size_mm3": np.max([np.sum(labeled == i) * voxel_vol 
                                        for i in range(1, num_features + 1)]) if num_features > 0 else 0,
        "wmh_percentage_brain": None  # Requires brain volume
    }

def fazekas_from_volume(wmh_volume_mm3, brain_volume_mm3):
    """
    Estimate Fazekas grade from volumetric WMH burden.
    
    This is an approximation; visual rating remains gold standard.
    """
    wmh_percent = (wmh_volume_mm3 / brain_volume_mm3) * 100
    
    if wmh_percent < 0.1:
        return 0
    elif wmh_percent < 0.5:
        return 1
    elif wmh_percent < 2.0:
        return 2
    else:
        return 3

# Advanced: Deep learning WMH segmentation
def wmh_segmentation_deep_learning(flair_path, t1_path=None, model='unet'):
    """
    WMH segmentation using deep learning models.
    
    Models available:
    - UBO Detector (https://github.com/hongweilibr/ubodetector)
    - WMH Segmentation Challenge winning methods
    - nnU-Net (trained on WMH challenge data)
    """
    # This requires pre-trained models
    # See: https://wmh.isi.uu.nl/
    
    import torch
    
    # Load pre-trained model
    # model = torch.load('wmh_unet.pth')
    # model.eval()
    
    # Preprocess
    flair = nib.load(flair_path).get_fdata()
    # Normalize, create tensor, predict
    
    return {
        "segmentation": None,  # predicted mask
        "volume_mm3": None,
        "model": model
    }

# Batch WMH processing
def batch_wmh_quantification(subject_list, output_csv):
    """
    Process WMH for multiple subjects.
    
    subject_list columns: subject_id, flair_path, t1_path, age, sex
    """
    results = []
    
    for _, subject in subject_list.iterrows():
        try:
            # Run BIANCA
            wmh_mask = f"wmh_output/{subject['subject_id']}_wmh.nii.gz"
            Path("wmh_output").mkdir(exist_ok=True)
            
            run_bianca(
                subject['flair_path'],
                subject['t1_path'],
                wmh_mask
            )
            
            # Quantify
            metrics = quantify_wmh(wmh_mask, subject['flair_path'])
            metrics['subject_id'] = subject['subject_id']
            metrics['age'] = subject['age']
            metrics['sex'] = subject['sex']
            
            results.append(metrics)
            
        except Exception as e:
            print(f"Error: {subject['subject_id']}: {e}")
    
    df = pd.DataFrame(results)
    df.to_csv(output_csv, index=False)
    return df
```

#### Normative Comparison Approach
- **Fazekas grade:** Compare to age-normative Fazekas distribution
- **Volume-based:** Compare total WMH volume to age- and sex-matched controls
- **ICV-normalization:** WMH volume / ICV * 100 (% of brain volume)
- **Longitudinal tracking:** Rate of WMH accumulation per year
- **Clinical thresholds:**
  - Fazekas 0-1: Normal/Minimal
  - Fazekas 2: Moderate (increased stroke risk)
  - Fazekas 3: Severe (high stroke/dementia risk)

#### Evidence Grade: **A** (visual), **B** (automated)
- Fazekas: Gold standard clinical rating, decades of validation
- Automated: Convergent validity with Fazekas established; better correlation with cognition
- STRIVE guidelines provide standardized reporting
- **Clinical Validation Status:** Visual Fazekas is standard clinical practice; automated tools (Icometrix) have FDA/CE mark; used in stroke risk prediction models

---

## 4. White Matter Analysis

### 4.1 TBSS (Tract-Based Spatial Statistics)

**Description:** FSL's TBSS pipeline for voxelwise analysis of diffusion MRI data. Projects all subjects' FA data onto a mean FA tract skeleton for group comparisons.

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Voxelwise white matter group analysis |
| **Input** | DTI-derived FA, MD, AD, RD maps |
| **Output** | Skeletonized statistical maps, cluster-corrected results |
| **Analysis** | Non-parametric permutation testing (randomise) |
| **Software** | FSL (tbss_* scripts) |

**Documentation:** https://fsl.fmrib.ox.ac.uk/fsl/fslwiki/TBSS  
**Paper:** Smith et al. (2006) NeuroImage 31:1487-1505

#### Installation

TBSS is included with FSL. No additional installation required.

```bash
# Verify TBSS is available
which tbss_1_preproc
which tbss_2_reg
which tbss_3_postreg
which tbss_4_prestats
which tbss_non_FA

# Required FSL components:
# - FDT toolbox (dtifit, eddy, topup)
# - FLIRT/FNIRT (registration)
# - fslmaths
# - randomise (permutation testing)
```

#### Complete TBSS Pipeline

```bash
# ============================================
# TBSS Complete Pipeline
# ============================================

# Step 0: Prepare FA images
# Create a directory with all subjects' FA maps
mkdir tbss_analysis && cd tbss_analysis
# Copy FA maps: cp */dti_FA.nii.gz .

# Step 1: Preprocessing (erosion, brain extraction)
tbss_1_preproc *.nii.gz
# Creates: FA/ directory with preprocessed FA maps

# Step 2: Register all FA images to standard space
tbss_2_reg -T
# -T uses FMRIB58_FA template
# -t uses study-specific template (if created)

# Step 3: Post-registration processing
tbss_3_postreg -S
# Creates mean FA skeleton and projects all data onto it
# -S uses mean FA skeleton

# Step 4: Pre-stats (threshold skeleton)
tbss_4_prestats 0.2
# 0.2 = FA threshold (only voxels with mean FA > 0.2)

# For non-FA data (MD, AD, RD):
tbss_non_FA MD
# Projects MD data using same warp fields and skeleton

# Step 5: Statistical analysis with randomise
# Requires design.mat and design.con files
randomise -i all_FA_skeletonised.nii.gz \
          -o tbss_results \
          -m mean_FA_skeleton_mask.nii.gz \
          -d design.mat \
          -t design.con \
          -n 5000 \
          --T2

# View results
fsleyes $FSLDIR/data/standard/MNI152_T1_1mm.nii.gz \
        tbss_results_tfce_corrp_tstat1.nii.gz \
        -dr 0.95 1
```

#### Python Integration

```python
"""
TBSS analysis with Python integration
Preprocessing DTI and running TBSS pipeline
"""

import subprocess
import nibabel as nib
import numpy as np
import pandas as pd
from pathlib import Path

def run_dtifit(dwi_path, bvec_path, bval_path, output_prefix, mask_path=None):
    """
    Run FSL dtifit to fit diffusion tensor model.
    
    Parameters:
    -----------
    dwi_path : str
        Path to preprocessed DWI (eddy-corrected)
    bvec_path : str
        Path to bvecs file
    bval_path : str
        Path to bvals file
    output_prefix : str
        Output file prefix
    mask_path : str, optional
        Brain mask
    
    Returns:
    --------
    dict : Paths to FA, MD, AD, RD, V1, L2, L3 maps
    """
    if mask_path is None:
        # Create mask from b0
        mask_path = f"{output_prefix}_mask.nii.gz"
        b0_extract = f"fslroi {dwi_path} {output_prefix}_b0 0 1"
        subprocess.run(b0_extract, shell=True)
        
        bet_cmd = f"bet {output_prefix}_b0 {output_prefix}_brain -m -f 0.3"
        subprocess.run(bet_cmd, shell=True)
        mask_path = f"{output_prefix}_brain_mask.nii.gz"
    
    # Run dtifit
    cmd = [
        "dtifit",
        "-k", dwi_path,
        "-o", output_prefix,
        "-r", bvec_path,
        "-b", bval_path,
        "-m", mask_path,
        "--save_tensor"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"dtifit error: {result.stderr}")
    
    return {
        "fa": f"{output_prefix}_FA.nii.gz",
        "md": f"{output_prefix}_MD.nii.gz",
        "ad": f"{output_prefix}_AD.nii.gz",
        "rd": f"{output_prefix}_RD.nii.gz",
        "l1": f"{output_prefix}_L1.nii.gz",
        "l2": f"{output_prefix}_L2.nii.gz",
        "l3": f"{output_prefix}_L3.nii.gz",
        "v1": f"{output_prefix}_V1.nii.gz",
        "tensor": f"{output_prefix}_tensor.nii.gz"
    }

def extract_tbss_roi_values(tbss_skeleton, roi_mask, subject_list):
    """
    Extract mean FA values from TBSS skeleton within ROIs.
    
    Parameters:
    -----------
    tbss_skeleton : str
        Path to 4D skeletonized data (subjects x x x y x z)
    roi_mask : str
        Path to ROI mask in MNI space (e.g., JHU atlas)
    subject_list : list
        List of subject IDs
    
    Returns:
    --------
    pd.DataFrame : Mean FA per ROI per subject
    """
    skeleton = nib.load(tbss_skeleton).get_fdata()
    roi = nib.load(roi_mask).get_fdata().astype(int)
    
    # JHU-ICBM-DTI-81 white matter labels
    jhu_labels = {
        1: "Middle_cerebellar_peduncle",
        2: "Pontine_crossing_tract",
        3: "Genu_of_corpus_callosum",
        4: "Body_of_corpus_callosum",
        5: "Splenium_of_corpus_callosum",
        # ... (all 48 JHU regions)
    }
    
    results = []
    for subj_idx, subject_id in enumerate(subject_list):
        subject_data = skeleton[subj_idx]
        
        roi_values = {"subject_id": subject_id}
        for label, name in jhu_labels.items():
            mask = roi == label
            if mask.sum() > 0:
                values = subject_data[mask]
                roi_values[f"FA_{name}"] = np.mean(values[values > 0])
        
        results.append(roi_values)
    
    return pd.DataFrame(results)

# Advanced: Skeleton-based analysis with Python
def skeleton_analysis(fa_maps, skeleton_mask, threshold=0.2):
    """
    Project FA maps onto mean skeleton and extract values.
    """
    skeleton = nib.load(skeleton_mask).get_fdata()
    valid_mask = skeleton > threshold
    
    all_values = []
    for fa_path in fa_maps:
        fa = nib.load(fa_path).get_fdata()
        projected = fa * valid_mask
        values = projected[valid_mask]
        all_values.append(values)
    
    return np.array(all_values)  # (n_subjects, n_skeleton_voxels)
```

#### Normative Comparison Approach
- Compare FA/MD values to age-matched control distribution
- Generate Z-score maps: (individual FA - control mean) / control SD
- ROI-based: extract mean values per tract, compare to normative database
- Track longitudinal changes in tract integrity

#### Evidence Grade: **A**
- Gold standard for voxelwise DTI group analysis
- Thousands of publications across neurological conditions
- White matter integrity strongly correlated with cognitive function
- **Clinical Validation Status:** Used in MS (Nawm analysis), TBI, stroke, dementia; validated as surrogate marker for white matter disease burden

---

### 4.2 DIPY

**Description:** A comprehensive Python library for diffusion MRI analysis. Provides tools from preprocessing to advanced reconstruction, tractography, and statistical analysis.

| Attribute | Detail |
|-----------|--------|
| **Language** | Python |
| **Reconstruction Models** | DTI, DKI, CSD, MAP-MRI, Q-Ball, SHORE, etc. |
| **Tractography** | Deterministic, probabilistic, PFT |
| **Analysis** | BUAN, AFQ, K-fold cross-validation |
| **Visualization** | Interactive tractogram, ODF visualization |

**GitHub:** https://github.com/dipy/dipy  
**Documentation:** https://dipy.org  
**Paper:** Garyfallidis et al. (2014) Frontiers in Neuroinformatics 8:8

#### Installation

```bash
# Via pip
pip install dipy

# Via conda (recommended)
conda install -c conda-forge dipy

# With all optional dependencies
pip install dipy[fury,ml]  # visualization + machine learning

# Verify
python -c "import dipy; print(dipy.__version__)"
```

#### Python Examples

```python
"""
DIPY comprehensive diffusion MRI analysis
"""

import numpy as np
import nibabel as nib
from dipy.io.gradients import read_bvals_bvecs
from dipy.core.gradients import gradient_table
from dipy.reconst import dti, dki, csdeconv as csd
from dipy.segment.mask import median_otsu
from dipy.tracking.stopping_criterion import ThresholdStoppingCriterion
from dipy.tracking import utils
from dipy.direction import peaks_from_model
from dipy.io.stateful_tractogram import Space, StatefulTractogram
from dipy.io.streamline import save_tractogram
import matplotlib.pyplot as plt

# ============================================
# 1. Load and Preprocess Data
# ============================================

def load_dwi(dwi_path, bval_path, bvec_path):
    """Load DWI data and create gradient table."""
    dwi_img = nib.load(dwi_path)
    dwi_data = dwi_img.get_fdata()
    
    bvals, bvecs = read_bvals_bvecs(bval_path, bvec_path)
    gtab = gradient_table(bvals, bvecs)
    
    return dwi_data, gtab, dwi_img.affine, dwi_img.header

def preprocess_dwi(dwi_data, gtab, vol_idx=[0]):
    """
    Preprocess DWI: brain extraction and masking.
    """
    # Brain extraction with median_otsu
    dwi_masked, mask = median_otsu(
        dwi_data, 
        vol_idx=vol_idx,  # Use b=0 volumes
        numpass=1
    )
    
    return dwi_masked, mask

# ============================================
# 2. DTI Analysis
# ============================================

def fit_dti(dwi_data, gtab, mask):
    """
    Fit diffusion tensor model and extract metrics.
    
    Returns FA, MD, AD, RD maps.
    """
    tenmodel = dti.TensorModel(gtab, fit_method='WLS')
    tenfit = tenmodel.fit(dwi_data, mask=mask)
    
    # Extract scalar metrics
    fa = tenfit.fa       # Fractional Anisotropy
    md = tenfit.md       # Mean Diffusivity
    ad = tenfit.ad       # Axial Diffusivity
    rd = tenfit.rd       # Radial Diffusivity
    
    # Handle NaN/Inf values
    fa = np.nan_to_num(fa, nan=0.0, posinf=0.0, neginf=0.0)
    md = np.nan_to_num(md, nan=0.0)
    
    return {
        'tensor_fit': tenfit,
        'fa': fa,
        'md': md,
        'ad': ad,
        'rd': rd,
        'eigenvalues': tenfit.evals,
        'eigenvectors': tenfit.evecs
    }

def save_dti_maps(dti_results, affine, output_prefix):
    """Save DTI metric maps as NIfTI files."""
    maps = {
        'FA': dti_results['fa'],
        'MD': dti_results['md'],
        'AD': dti_results['ad'],
        'RD': dti_results['rd']
    }
    
    saved_paths = {}
    for name, data in maps.items():
        img = nib.Nifti1Image(data.astype(np.float32), affine)
        path = f"{output_prefix}_{name}.nii.gz"
        nib.save(img, path)
        saved_paths[name] = path
    
    return saved_paths

# ============================================
# 3. DKI Analysis (Multi-shell)
# ============================================

def fit_dki(dwi_data, gtab, mask):
    """
    Fit diffusion kurtosis tensor model.
    
    Requires multi-shell data (multiple b-values).
    Provides more accurate diffusion measures and kurtosis metrics.
    """
    from dipy.reconst.dki import DiffusionKurtosisModel
    
    dkimodel = DiffusionKurtosisModel(gtab, fit_method='WLS')
    dkifit = dkimodel.fit(dwi_data, mask=mask)
    
    # Standard diffusion measures (more accurate than DTI)
    fa = dkifit.fa
    md = dkifit.md
    
    # Kurtosis measures
    mk = dkifit.mk(0, 3)   # Mean Kurtosis
    ak = dkifit.ak         # Axial Kurtosis
    rk = dkifit.rk         # Radial Kurtosis
    
    return {
        'dki_fit': dkifit,
        'fa': fa,
        'md': md,
        'mk': mk,
        'ak': ak,
        'rk': rk
    }

# ============================================
# 4. CSD and Tractography
# ============================================

def fit_csd(dwi_data, gtab, mask, response=None):
    """
    Fit Constrained Spherical Deconvolution for fiber orientation distributions.
    """
    from dipy.reconst.csdeconv import auto_response_ssst, ConstrainedSphericalDeconvModel
    from dipy.data import default_sphere
    
    # Estimate response function
    if response is None:
        response, ratio = auto_response_ssst(
            gtab, dwi_data, roi_radii=10, fa_thr=0.7
        )
    
    # Fit CSD
    csd_model = ConstrainedSphericalDeconvModel(gtab, response)
    csd_fit = csd_model.fit(dwi_data, mask=mask)
    
    # Extract peaks (fiber orientations)
    peaks = peaks_from_model(
        csd_model, dwi_data, default_sphere,
        mask=mask, threshold=0.25, parallel=True
    )
    
    return {
        'csd_fit': csd_fit,
        'peaks': peaks,
        'response': response
    }

def run_tractography(peaks, fa, mask, affine, output_path, 
                     fa_threshold=0.25, max_angle=30):
    """
    Run probabilistic tractography.
    """
    # Create stopping criterion
    classifier = ThresholdStoppingCriterion(fa, fa_threshold)
    
    # Generate seeds
    seeds = utils.seeds_from_mask(mask, affine, density=2)
    
    # Run tracking
    from dipy.tracking.local_tracking import LocalTracking
    
    streamlines = LocalTracking(
        peaks, classifier, seeds, affine,
        step_size=0.5, max_cross=1
    )
    
    # Save as tractogram
    sft = StatefulTractogram(streamlines, nib.Nifti1Image(mask, affine), Space.RASMM)
    save_tractogram(sft, output_path)
    
    return output_path

# ============================================
# 5. Complete Pipeline
# ============================================

def run_complete_dipy_pipeline(dwi_path, bval_path, bvec_path, 
                                output_dir, subject_id):
    """
    Complete DIPY processing pipeline for a single subject.
    """
    from pathlib import Path
    output_dir = Path(output_dir) / subject_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"[{subject_id}] Loading data...")
    dwi_data, gtab, affine, header = load_dwi(dwi_path, bval_path, bvec_path)
    
    print(f"[{subject_id}] Preprocessing...")
    dwi_preproc, mask = preprocess_dwi(dwi_data, gtab)
    
    # Save mask
    mask_img = nib.Nifti1Image(mask.astype(np.uint8), affine)
    nib.save(mask_img, output_dir / f"{subject_id}_brain_mask.nii.gz")
    
    print(f"[{subject_id}] Fitting DTI...")
    dti_results = fit_dti(dwi_preproc, gtab, mask)
    dti_maps = save_dti_maps(dti_results, affine, output_dir / f"{subject_id}_dti")
    
    print(f"[{subject_id}] Fitting CSD...")
    csd_results = fit_csd(dwi_preproc, gtab, mask)
    
    print(f"[{subject_id}] Running tractography...")
    tractogram_path = run_tractography(
        csd_results['peaks'],
        dti_results['fa'],
        mask,
        affine,
        str(output_dir / f"{subject_id}_tractogram.trk")
    )
    
    # Calculate summary statistics
    mean_fa = np.mean(dti_results['fa'][mask > 0])
    mean_md = np.mean(dti_results['md'][mask > 0])
    
    return {
        'subject_id': subject_id,
        'dti_maps': dti_maps,
        'mean_fa': mean_fa,
        'mean_md': mean_md,
        'tractogram': tractogram_path,
        'output_dir': output_dir
    }
```

#### BUAN (Bundle Analytics)

```python
from dipy.stats.bundle_stats import bundle_analysis

def run_buan(bundle_files, group_labels, output_dir):
    """
    Bundle Analysis using DIPY's BUAN framework.
    
    Compares white matter bundle properties between groups.
    """
    # BUAN performs statistical analysis on bundle profiles
    # (FA/MD along the length of each bundle)
    
    results = bundle_analysis(
        bundle_files=bundle_files,
        groups=group_labels,
        out_dir=output_dir
    )
    return results
```

#### Normative Comparison Approach
- Compare FA/MD values to age-matched normative database
- Generate Z-score maps for individual subjects
- Bundle-specific: compare each white matter tract to norms
- Longitudinal: track within-subject changes over time

#### Evidence Grade: **A**
- Comprehensive, validated toolkit
- Used in thousands of neuroimaging studies
- Community-driven with extensive testing
- **Clinical Validation Status:** Used in clinical research for MS, stroke, TBI; AFQ validated for pediatric development

---

### 4.3 Camino

**Description:** A Java-based diffusion MRI toolkit from UCL providing comprehensive diffusion modeling and analysis tools. One of the oldest and most established diffusion MRI analysis platforms.

| Attribute | Detail |
|-----------|--------|
| **Language** | Java (command-line tools) |
| **Models** | DTI, multi-compartment, PAS-MRI, Q-Ball |
| **Features** | Model fitting, simulation, tractography, statistics |
| **Platform** | Linux, macOS (with Cygwin on Windows) |
| **License** | Academic Free License |

**GitHub (mirror):** https://github.com/ozermetin/camino  
**Website:** http://cmic.cs.ucl.ac.uk/camino/  
**Paper:** Cook et al. (2006) NeuroImage; Hall & Alexander (2009)

#### Installation

```bash
# Download Camino
git clone https://github.com/ozermetin/camino.git
cd camino

# Compile (requires Java SDK 1.4+)
make

# Set environment variables
export CAMINO_DIR=/path/to/camino
export PATH=$PATH:$CAMINO_DIR/bin
export MANPATH=$MANPATH:$CAMINO_DIR/man

# Verify
which dtfit
# Should return path to Camino binaries
```

#### Usage Examples

```bash
# ============================================
# Camino Diffusion Analysis Pipeline
# ============================================

# 1. Convert data to Camino format
# Convert from NIfTI to Camino's raw data format
image2voxel -4dinput dwi.nii.gz -outputfile dwi.Bfloat

# 2. Fit diffusion tensor
dtfit dwi.Bfloat schemefile.scheme -bgmask brain_mask.nii.gz \
      > dt.Bdouble

# schemefile.scheme contains b-values and gradient directions
# Format: VERSION, b-vector components, b-value

# 3. Extract DTI metrics
# Fractional Anisotropy
fa < dt.Bdouble > fa.nii.gz

# Mean Diffusivity
md < dt.Bdouble > md.nii.gz

# Eigenvalues
dteig < dt.Bdouble > eigenvalues.Bdouble

# 4. Multi-compartment modeling (optional)
# Ball-and-stick model
modelfit -inputfile dwi.Bfloat -schemefile schemefile.scheme \
         -model ballstick -bgmask brain_mask.nii.gz \
         > ballstick.Bdouble

# 5. Tractography
# Determineinistic tracking
track -inputfile dt.Bdouble -schemefile schemefile.scheme \
      -seedfile seeds.nii.gz -anistop -iterations 1000 \
      > tracts.Bfloat

# Convert tracts to visualization format
camino_to_trk tracts.Bfloat dt.nii.gz tracts.trk

# 6. Track statistics
# Mean FA along tracts
trkstats -inputfile tracts.Bfloat -scalarfile fa.nii.gz \
         -stat mean > tract_mean_fa.txt
```

#### Python Integration

```python
"""
Camino integration with Python
Running Camino commands from Python and parsing outputs
"""

import subprocess
import numpy as np
import nibabel as nib
from pathlib import Path

class CaminoPipeline:
    """
    Python wrapper for Camino diffusion analysis pipeline.
    """
    
    def __init__(self, camino_dir=None):
        self.camino_dir = camino_dir or "/usr/local/camino"
        self.bin_dir = f"{self.camino_dir}/bin"
        
    def nifti_to_camino(self, nifti_path, output_path):
        """Convert NIfTI to Camino format."""
        cmd = f"{self.bin_dir}/image2voxel -4dinput {nifti_path} -outputfile {output_path}"
        subprocess.run(cmd, shell=True, check=True)
        return output_path
    
    def fit_tensor(self, camino_data, scheme_file, mask=None):
        """Fit diffusion tensor model."""
        mask_arg = f"-bgmask {mask}" if mask else ""
        output = f"{camino_data}.dt.Bdouble"
        
        cmd = f"{self.bin_dir}/dtfit {camino_data} {scheme_file} {mask_arg} > {output}"
        subprocess.run(cmd, shell=True, check=True)
        return output
    
    def extract_fa(self, dt_file, output_nifti):
        """Extract FA map from tensor fit."""
        cmd = f"{self.bin_dir}/fa < {dt_file} > {output_nifti}"
        subprocess.run(cmd, shell=True, check=True)
        return output_nifti
    
    def extract_md(self, dt_file, output_nifti):
        """Extract MD map from tensor fit."""
        cmd = f"{self.bin_dir}/md < {dt_file} > {output_nifti}"
        subprocess.run(cmd, shell=True, check=True)
        return output_nifti
    
    def create_scheme_file(self, bvals_path, bvecs_path, output_scheme):
        """
        Create Camino scheme file from bvals/bvecs.
        
        Camino scheme format:
        VERSION: BVECTOR
        [gx gy gz b]
        ...
        """
        bvals = np.loadtxt(bvals_path)
        bvecs = np.loadtxt(bvecs_path)
        
        with open(output_scheme, 'w') as f:
            f.write("VERSION: BVECTOR\n")
            for i in range(len(bvals)):
                f.write(f"{bvecs[0,i]:.6f} {bvecs[1,i]:.6f} {bvecs[2,i]:.6f} {bvals[i]:.1f}\n")
        
        return output_scheme
    
    def run_pipeline(self, dwi_nifti, bvals, bvecs, mask, output_dir):
        """
        Run complete Camino DTI pipeline.
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        subject = Path(dwi_nifti).stem.replace('.nii', '')
        
        # Create scheme file
        scheme = output_dir / f"{subject}.scheme"
        self.create_scheme_file(bvals, bvecs, scheme)
        
        # Convert to Camino format
        camino_data = output_dir / f"{subject}.Bfloat"
        self.nifti_to_camino(dwi_nifti, camino_data)
        
        # Fit tensor
        dt_file = self.fit_tensor(camino_data, scheme, mask)
        
        # Extract metrics
        fa_map = output_dir / f"{subject}_FA.nii.gz"
        md_map = output_dir / f"{subject}_MD.nii.gz"
        
        self.extract_fa(dt_file, fa_map)
        self.extract_md(dt_file, md_map)
        
        return {
            'dt_file': dt_file,
            'fa_map': fa_map,
            'md_map': md_map
        }

# Example: NODDI with AMICO (uses Camino)
def run_noddi_amico(dwi_path, bvals, bvecs, mask_path, output_dir):
    """
    Run NODDI analysis using AMICO (which uses Camino internally).
    
    AMICO: Accelerated Microstructure Imaging via Convex Optimization
    Provides: NDI (neurite density), ODI (orientation dispersion), FISO (free water)
    """
    import AMICO
    
    # Initialize AMICO
    AMICO.core.setup()
    
    # Load data
    ae = AMICO.Evaluation(output_dir, 'NODDI')
    ae.load_data(dwi_path, bvals, bvecs, mask_path)
    
    # Set model
    ae.set_model('NODDI')
    ae.generate_kernels()
    ae.load_kernels()
    
    # Fit
    ae.fit()
    ae.save_results()
    
    return {
        'ndi': f"{output_dir}/AMICO/NODDI/FIT_NDI.nii.gz",
        'odi': f"{output_dir}/AMICO/NODDI/FIT_ODI.nii.gz",
        'fiso': f"{output_dir}/AMICO/NODDI/FIT_FISO.nii.gz"
    }
```

#### Normative Comparison Approach
- Compare DTI metrics to age-matched control distribution
- Multi-compartment models (NODDI) provide more specific tissue microstructure indices
- Normative databases available for NODDI metrics
- Track changes in white matter integrity longitudinally

#### Evidence Grade: **B**
- Established toolkit with extensive documentation
- Less actively developed than DIPY
- Strong foundation for diffusion modeling research
- **Clinical Validation Status:** Used in research settings for MS, stroke; NODDI validated as more specific marker for axonal integrity than DTI

---

## 5. Normative Comparison Frameworks

### 5.1 CentileBrain

**Platform:** https://centilebrain.org  
**Description:** Web-based platform for individualized neuroimaging metrics with normative comparison.

**Features:**
- Upload FreeSurfer outputs (aseg.stats, ?h.aparc.stats)
- Automated brain age estimation (ENIGMA models)
- Centile-based normative comparison (percentile rankings)
- Sex-specific normative models
- Age range: 5-90 years

**Usage:**
1. Run FreeSurfer recon-all on T1 images
2. Upload stats files to CentileBrain
3. Receive: brain age, PAD, percentile scores for all regions

### 5.2 ENIGMA Normative Protocols

The ENIGMA consortium provides standardized protocols for:
- Quality control procedures
- Harmonized processing pipelines
- Normative model construction
- Cross-site validation

**Resources:**
- ENIGMA Brain Age: https://enigma.ini.usc.edu/ongoing/enigma-brainage/
- CentileBrain: https://centilebrain.org

### 5.3 Normative Modeling with Python

```python
"""
Normative modeling for neuroimaging biomarkers
"""

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression, Ridge
import matplotlib.pyplot as plt

def build_normative_model(controls_df, biomarker, covariates=['age', 'sex']):
    """
    Build normative model from healthy control data.
    
    Parameters:
    -----------
    controls_df : pd.DataFrame
        Control subject data with biomarker and covariates
    biomarker : str
        Column name of biomarker to model
    covariates : list
        Covariate column names
    
    Returns:
    --------
    dict : model, predictions, residuals, Z-scores
    """
    # Prepare data
    X = controls_df[covariates].copy()
    y = controls_df[biomarker].values
    
    # Encode sex if categorical
    if 'sex' in X.columns and X['sex'].dtype == 'object':
        X['sex'] = X['sex'].map({'M': 1, 'F': 0})
    
    # Fit model
    model = Ridge(alpha=1.0)
    model.fit(X, y)
    
    # Predictions and residuals
    predictions = model.predict(X)
    residuals = y - predictions
    
    # Calculate standard deviation of residuals
    sd_resid = np.std(residuals)
    
    # Z-scores for controls (should be ~N(0,1))
    z_scores = residuals / sd_resid
    
    return {
        'model': model,
        'covariates': covariates,
        'sd_residuals': sd_resid,
        'control_predictions': predictions,
        'control_z_scores': z_scores,
        'r_squared': model.score(X, y)
    }

def apply_normative_model(new_subject, normative_model):
    """
    Apply normative model to new subject.
    
    Parameters:
    -----------
    new_subject : pd.Series or dict
        Subject data with same covariates
    normative_model : dict
        Output from build_normative_model
    
    Returns:
    --------
    dict : predicted_value, Z-score, percentile
    """
    model = normative_model['model']
    covariates = normative_model['covariates']
    sd_resid = normative_model['sd_residuals']
    
    # Prepare input
    X_new = pd.DataFrame([new_subject])[covariates]
    if 'sex' in X_new.columns and X_new['sex'].dtype == 'object':
        X_new['sex'] = X_new['sex'].map({'M': 1, 'F': 0})
    
    predicted = model.predict(X_new)[0]
    actual = new_subject[biomarker]
    
    residual = actual - predicted
    z_score = residual / sd_resid
    percentile = stats.norm.cdf(z_score) * 100
    
    return {
        'predicted': predicted,
        'actual': actual,
        'residual': residual,
        'z_score': z_score,
        'percentile': percentile,
        'is_abnormal': abs(z_score) > 2  # > 2 SD from expected
    }

# Visualization
def plot_normative_trajectory(controls_df, biomarker, x_var='age', 
                               hue_var='sex', model=None):
    """
    Plot normative trajectory with confidence intervals.
    """
    fig, ax = plt.subplots(figsize=(10, 6))
    
    for sex, group in controls_df.groupby(hue_var):
        ax.scatter(group[x_var], group[biomarker], 
                  alpha=0.5, label=f'Controls ({sex})')
        
        if model:
            # Plot fitted line
            x_range = np.linspace(group[x_var].min(), group[x_var].max(), 100)
            X_pred = pd.DataFrame({x_var: x_range, hue_var: [sex]*100})
            if hue_var == 'sex' and X_pred[hue_var].dtype == 'object':
                X_pred[hue_var] = X_pred[hue_var].map({'M': 1, 'F': 0})
            y_pred = model.predict(X_pred)
            ax.plot(x_range, y_pred, label=f'Fit ({sex})')
    
    ax.set_xlabel(x_var)
    ax.set_ylabel(biomarker)
    ax.set_title(f'Normative Trajectory: {biomarker}')
    ax.legend()
    
    return fig
```

---

## 6. Evidence Summary Table

| Tool/Method | Algorithm | Evidence Grade | Clinical Validation | MAE (years) | Test-Retest ICC |
|-------------|-----------|---------------|---------------------|-------------|-----------------|
| **brainageR** | Gaussian Process Regression | B | Validated in dementia, depression, PTSD | 4.04-4.9 | 0.98 (0.96-0.99) |
| **pyment** | 3D SFCN (CNN) | A | Distinguishes CN/MCI/AD; predicts decline | 3.56-3.9 | 0.98 (0.96-0.99) |
| **DeepBrainNet** | 2D CNN (transfer learning) | B | Differentiates clinical groups | 6.13 | 0.67 (0.44-0.68) |
| **ENIGMA-BrainAge** | Ridge Regression | A | Multi-site depression replication | 2.94 | N/A (region-based) |
| **FSL-VBM** | Voxel-based morphometry | A | AD, PD, MS biomarker standard | N/A | N/A |
| **ANTs Cortical Thickness** | DiReCT | A | FDA components; clinical trials | N/A | >0.95 |
| **FreeSurfer recon-all** | Surface-based analysis | A | FDA 510(k); epilepsy, AD trials | N/A | >0.95 |
| **FSL-FIRST** | Deformable mesh | A | Hippocampal atrophy (NIA-AA) | N/A | 0.85-0.95 |
| **Fazekas/WMH** | Visual + Automated | A/B | Stroke risk, SVD assessment | N/A | 0.6 (visual), >0.9 (auto) |
| **TBSS** | Tract-based statistics | A | MS, stroke, TBI standard | N/A | >0.95 |
| **DIPY** | Multi-model dMRI | A | Development, MS research | N/A | >0.95 |
| **Camino** | Multi-compartment dMRI | B | NODDI microstructure | N/A | >0.90 |

---

## 7. Clinical Integration Pathway

### Recommended Clinical Workflow

```
Step 1: Data Acquisition
  T1-weighted MRI (1mm isotropic, 3T preferred)
  Optional: FLAIR (for WMH), DWI (for white matter)

Step 2: Quality Control
  - Visual inspection of raw scans
  - Check for motion artifacts, intensity inhomogeneity
  - Use MRIQC for automated quality assessment

Step 3: Preprocessing
  - FreeSurfer recon-all (complete cortical analysis)
  - OR ANTs cortical thickness (faster alternative)

Step 4: Brain Age Estimation
  - Option A: Upload FreeSurfer stats to CentileBrain/ENIGMA
  - Option B: Run pyment on preprocessed T1
  - Option C: Run brainageR (if SPM/MATLAB available)

Step 5: Biomarker Extraction
  - Cortical thickness (regional + global mean)
  - Hippocampal volume (aseg or FIRST)
  - Subcortical volumes
  - WMH burden (Fazekas or automated)

Step 6: Normative Comparison
  - Compare to age- and sex-matched norms
  - Calculate Z-scores for all measures
  - Identify regions with abnormal values (>2 SD)

Step 7: Clinical Interpretation
  - Brain Age Gap > 5 years: Accelerated aging
  - Hippocampal volume < 2.5 SD: Significant atrophy
  - Fazekas 2-3: High cerebrovascular burden
  - Composite score for overall brain health

Step 8: Reporting
  - Automated report with all biomarkers
  - Centile scores and Z-scores
  - Comparison to diagnostic groups (if available)
  - Recommendations for follow-up
```

### Key Clinical Thresholds

| Biomarker | Normal Range | Mildly Abnormal | Significantly Abnormal |
|-----------|-------------|----------------|----------------------|
| Brain Age Gap (PAD) | 0 +/- 3 years | 3-5 years | > 5 years |
| Mean Cortical Thickness | > 2.5 mm | 2.3-2.5 mm | < 2.3 mm |
| Hippocampal Volume (total) | > 2.5 SD below mean | 2-2.5 SD below | > 2.5 SD below |
| Fazekas Score | 0-1 | 2 | 3 |
| Mean FA (whole brain) | Age-normative | 1-2 SD below | > 2 SD below |

---

## 8. References

### Brain Age Prediction

1. Cole JH, et al. (2017) Predicting brain age with deep learning from raw imaging data. *CVPR.*
2. Cole JH, et al. (2018) Brain age and other bodily 'ages': implications for neuropsychiatry. *Mol Psychiatry.*
3. Peng H, et al. (2021) Accurate brain age prediction with lightweight deep learning. *IEEE ISBI.*
4. Bashyal V, et al. DeepBrainNet: Pre-trained deep neural network model for brain age prediction. *GitHub/Preprint.*
5. Han LK, et al. (2021) Brain aging in major depressive disorder: results from the ENIGMA MDD major depressive disorder working group. *Mol Psychiatry.*
6. Ge R, et al. (2024) Brain-age prediction: Systematic evaluation of site effects, and sample age range and size. *Human Brain Mapping.*
7. Clausen AN, et al. (2022) Assessment of brain age in PTSD. *Brain and Behavior.*
8. Biondo F, et al. (2022) Brain-age is associated with progression to dementia in memory clinic patients. *NeuroImage: Clinical.*
9. Dartora C, et al. (2024) A deep learning model for brain age prediction using minimally preprocessed T1w images. *Front Aging Neurosci.*
10. Li Z, et al. (2025) Development and validation of a brain aging biomarker: deep learning approach. *JMIR Aging.*

### Biomarker Extraction

11. Ashburner J, Friston KJ. (2000) Voxel-based morphometry -- the methods. *NeuroImage.*
12. Good CD, et al. (2001) A voxel-based morphometric study of ageing in 465 normal adult human brains. *NeuroImage.*
13. Tustison NJ, et al. (2014) Large-scale evaluation of ANTs and FreeSurfer cortical thickness measurements. *NeuroImage.*
14. Avants BB, et al. (2019) The ANTsX ecosystem for quantitative biological and medical imaging. *Sci Rep.*
15. Fischl B. (2012) FreeSurfer. *NeuroImage.*
16. Dale AM, et al. (1999) Cortical surface-based analysis. *NeuroImage.*
17. Patenaude B, et al. (2011) A Bayesian model of shape and appearance for subcortical brain segmentation. *NeuroImage.*
18. Fazekas F, et al. (1987) MR signal abnormalities at 1.5 T in Alzheimer's dementia and normal aging. *AJR.*
19. Wardlaw JM, et al. (2013) Neuroimaging standards for research into small vessel disease and its contribution to ageing and neurodegeneration. *Lancet Neurol.*

### White Matter Analysis

20. Smith SM, et al. (2006) Tract-based spatial statistics: voxelwise analysis of multi-subject diffusion data. *NeuroImage.*
21. Garyfallidis E, et al. (2014) DIPY, a library for the analysis of diffusion MRI data. *Front Neuroinform.*
22. Cook PA, et al. (2006) Camino: Open-source diffusion-MRI reconstruction and processing. *ISMRM.*
23. Hall MG, Alexander DC. (2009) Convergence and parameter choice for Monte-Carlo simulations of diffusion MRI. *IEEE.*
24. Daducci A, et al. (2015) Accelerated Microstructure Imaging via Convex Optimization (AMICO). *NeuroImage.*

### Clinical Validation

25. Jack CR Jr, et al. (2018) NIA-AA Research Framework: Toward a biological definition of Alzheimer's disease. *Alzheimers Dement.*
26. Franzmeier N, et al. (2022) Brain age as a biomarker in Alzheimer's disease. *Curr Opin Neurol.*
27. Dular M, Špiclin Ž. Brain Age Standardized Evaluation (BASE) framework. *NeuroImage.*

---

*This guide was compiled as a comprehensive reference for computational neuroimaging research. All tools listed are open-source and freely available for academic research. Always cite the original papers when using these tools in published work.*

**License:** This guide is provided for educational and research purposes. Individual tools have their own licenses (FSL: non-commercial; ANTs: Apache 2.0; FreeSurfer: free for research; DIPY: BSD; Camino: Academic Free License; pyment/brainageR: see respective repositories).
