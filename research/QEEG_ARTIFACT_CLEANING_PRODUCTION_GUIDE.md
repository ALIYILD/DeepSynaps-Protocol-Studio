# QEEG Artifact Cleaning: Production Guide

> **Version:** 1.0.0  
> **Scope:** Production-ready EEG artifact cleaning pipelines using Python  
> **Tools Covered:** PyPREP, autoreject, MNE bad channel detection, ICA (Infomax/FastICA/AMICA), mne-icalabel, FASTER, ASR, ZapLine, SSD, FIR filtering  
> **Target:** 64-128 channel EEG, continuous and epoched data, automated QC

---

## Table of Contents

1. [Environment Setup](#1-environment-setup)
2. [Executive Summary: Recommended Pipeline](#2-executive-summary-recommended-pipeline)
3. [Bad Channel Detection](#3-bad-channel-detection)
   - 3.1 PyPREP / PREP Pipeline
   - 3.2 autoreject (local/global)
   - 3.3 MNE `find_bad_channels_maxwell`
   - 3.4 `pyprep.NoisyChannels` Standalone
4. [ICA-Based Artifact Removal](#4-ica-based-artifact-removal)
   - 4.1 MNE `ICA` (Infomax / FastICA / AMICA)
   - 4.2 mne-icalabel (Automated IC Labeling)
   - 4.3 FASTER (Fully Automated Statistical Thresholding)
5. [ASR (Artifact Subspace Reconstruction)](#5-asr-artifact-subspace-reconstruction)
   - 5.1 `clean_rawdata` ASR (EEGLAB)
   - 5.2 `meegkit.ASR` (Python)
   - 5.3 `asrpy` (Alternative Python)
   - 5.4 ASR Calibration Window Selection
6. [Line Noise & Spectral Cleaning](#6-line-noise--spectral-cleaning)
   - 6.1 ZapLine / ZapLine-plus
   - 6.2 SSD (Source Separation Denoising)
   - 6.3 FIR Filtering (`mne.filter`)
7. [Quality Control Framework](#7-quality-control-framework)
8. [Complete Production Pipeline](#8-complete-production-pipeline)
9. [References](#9-references)

---

## 1. Environment Setup

### 1.1 Core Dependencies

```bash
# Base scientific stack
pip install numpy scipy pandas matplotlib seaborn scikit-learn

# MNE-Python (core EEG/MEG processing)
pip install mne

# PyPREP (PREP pipeline - bad channel detection, robust referencing)
pip install pyprep

# autoreject (automated epoch rejection)
pip install autoreject

# MNE-ICALabel (automated ICA component labeling)
pip install mne-icalabel

# meegkit (ASR, ZapLine, DSS)
pip install meegkit

# Alternative ASR implementation
pip install git+https://github.com/DiGyt/asrpy.git

# MNE-Denoise (ZapLine, DSS - advanced denoising)
pip install mne-denoise

# For ICA with AMICA (optional, requires compiled binary)
# AMICA is available via EEGLAB plugin or mne-amica
pip install mne-amica  # experimental wrapper

# For batch processing / parallelization
pip install joblib tqdm

# For BIDS support (optional)
pip install mne-bids
```

### 1.2 Full requirements.txt

```
numpy>=1.21.0
scipy>=1.7.0
pandas>=1.3.0
matplotlib>=3.4.0
seaborn>=0.11.0
scikit-learn>=1.0.0
mne>=1.4.0
pyprep>=0.4.0
autoreject>=0.4.0
mne-icalabel>=0.5.0
meegkit>=0.1.0
joblib>=1.0.0
tqdm>=4.62.0
```

### 1.3 Verify Installation

```python
import mne
import pyprep
import autoreject
import mne_icalabel
import meegkit
print(f"MNE: {mne.__version__}")
print(f"PyPREP: {pyprep.__version__}")
print(f"autoreject: {autoreject.__version__}")
print(f"mne-icalabel: {mne_icalabel.__version__}")
print(f"meegkit: available")
```

---

## 2. Executive Summary: Recommended Pipeline

### 2.1 Standard Cleaning Pipeline (Recommended for Most EEG Data)

```
Raw EEG
    |
    v
[1] Load + High-pass filter (>= 0.5 Hz)   <-- Removes slow drifts for ICA/ASR
    |
    v
[2] Line noise removal (ZapLine or notch) <-- Clean 50/60 Hz + harmonics
    |
    v
[3] Bad channel detection (PyPREP)        <-- RANSAC + correlation + deviation
    |                                         Mark and interpolate bads
    v
[4] Re-reference (average)                <-- Required for ICLabel
    |
    v
[5] ICA decomposition (Extended Infomax)  <-- For ocular/cardiac artifacts
    |
    v
[6] Automated IC labeling (mne-icalabel)  <-- Classify: brain/eye/muscle/...
    |                                         Exclude non-brain components
    v
[7] ASR (optional, for remaining bursts)  <-- Remove transient artifacts
    |
    v
[8] Epoching + autoreject                 <-- Automated epoch rejection
    |
    v
[9] Quality Control metrics               <-- Validate cleaning results
    |
    v
Clean Epochs
```

### 2.2 Alternative Pipeline (ASR-First for High-Artifact Data)

```
Raw EEG
    |
    v
[1] High-pass filter (>= 1.0 Hz)
    |
    v
[2] ASR calibration + transform           <-- Remove large artifacts first
    |
    v
[3] Bad channel detection (PyPREP)
    |
    v
[4] ICA + ICLabel                         <-- On ASR-cleaned data
    |
    v
[5] Epoching + autoreject
    |
    v
Clean Epochs
```

### 2.3 Pipeline Selection Guide

| Scenario | Recommended Pipeline |
|----------|---------------------|
| Standard research EEG (resting/task) | Standard pipeline (Sec 2.1) |
| High-artifact data (children, patients) | ASR-first pipeline (Sec 2.2) |
| Mobile/wearable EEG | ASR-first + reduced ASR cutoff (2.5-3.0) |
| High-density (128+ channels) | Standard + channel-wise RANSAC |
| Low-density (32 channels) | FASTER + manual review |
| MEG data | Maxwell filter + autoreject |
| Real-time / BCI | ASR online + minimal processing |

---

## 3. Bad Channel Detection

### 3.1 PyPREP / PREP Pipeline

**Description:** PyPREP implements the PREP (Preprocessing Pipeline) for EEG data, providing robust bad channel detection via multiple complementary methods: correlation, deviation, noise, and RANSAC. It also performs robust average referencing and line noise removal.

**When to Use:**
- Standard preprocessing for 32-128 channel EEG
- When you need robust referencing + bad channel detection in one step
- Before ICA decomposition (channels must be clean)

**Limitations:**
- Only supports EEG channels
- RANSAC is computationally expensive
- Requires electrode positions (montage)

#### Installation

```bash
pip install pyprep
```

#### Production Pipeline Code

```python
"""
PyPREP PREP Pipeline - Production Code
Detects bad channels using correlation, deviation, noise, and RANSAC methods.
"""
import mne
import numpy as np
from pyprep.prep_pipeline import PrepPipeline
from pyprep.find_noisy_channels import NoisyChannels

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
SAMPLE_RATE = 500  # Hz
LINE_FREQ = 50     # 50 for Europe/Asia, 60 for Americas
RANSAC = True      # Enable RANSAC (slower but more accurate)
RANDOM_STATE = 42  # For reproducibility

# -------------------------------------------------------------------------
# Load Raw Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_brainvision('subject_01.vhdr', preload=True)
# or: raw = mne.io.read_raw_fif('subject_01_raw.fif', preload=True)
# or: raw = mne.io.read_raw_edf('subject_01.edf', preload=True)

# Ensure montage is set (required for RANSAC interpolation)
if raw.get_montage() is None:
    montage = mne.channels.make_standard_montage('standard_1020')
    raw.set_montage(montage, match_case=False)

# -------------------------------------------------------------------------
# Method 1: Full PREP Pipeline (recommended)
# -------------------------------------------------------------------------
prep_params = {
    "ref_chs": "eeg",
    "reref_chs": "eeg",
    "line_freqs": [LINE_FREQ],
}

prep = PrepPipeline(
    raw,
    prep_params,
    raw.get_montage(),
    ransac=RANSAC,
    random_state=RANDOM_STATE,
)

# Fit the pipeline (this runs all steps)
prep.fit()

# Access cleaned raw data
raw_clean = prep.raw

# Access bad channel information
bad_channels_original = prep.noisy_channels_original  # Bad before interpolation
bad_channels_after = prep.still_noisy_channels         # Still bad after PREP

print(f"Bad channels (original): {bad_channels_original}")
print(f"Bad channels (still noisy after PREP): {bad_channels_after}")

# The cleaned raw has bad channels already interpolated by PREP
# -------------------------------------------------------------------------
# Method 2: Standalone NoisyChannels (more control)
# -------------------------------------------------------------------------
raw_for_detection = raw.copy()
raw_for_detection.load_data()

# Create NoisyChannels instance
nc = NoisyChannels(
    raw_for_detection,
    do_detrend=True,        # Remove <1 Hz trends before detection
    random_state=RANDOM_STATE,
    ransac=True,
    correlation=True,
)

# Run all detection methods
nc.find_all_bads(
    ransac=True,
    channel_wise=False,     # Window-wise RANSAC (memory efficient)
    max_chunk_size=None,    # Auto-determine chunk size
)

# Get results as dictionary (per method)
bads_dict = nc.get_bads(verbose=True, as_dict=True)
# Returns: {
#     'bad_by_correlation': [...],
#     'bad_by_deviation': [...],
#     'bad_by_noise': [...],
#     'bad_by_ransac': [...],
#     'bad_by_hf_noise': [...],
#     'bad_by_SNR': [...],
#     'bad_by_dropout': [...],
#     'bad_by_flat': [...],
# }

# Get combined list
all_bads = nc.get_bads(verbose=False, as_dict=False)
print(f"All bad channels: {all_bads}")

# Mark and interpolate
raw_clean = raw.copy()
raw_clean.info['bads'] = all_bads
raw_clean.interpolate_bads(reset_bads=True)

# -------------------------------------------------------------------------
# Method 3: Individual Detection Methods (maximum control)
# -------------------------------------------------------------------------
nc2 = NoisyChannels(raw.copy(), random_state=RANDOM_STATE)

# Find flat channels (no signal)
nc2.find_bad_by_flat(flat_threshold=1e-15)

# Find channels with abnormal correlation to neighbors
nc2.find_bad_by_correlation(
    correlation_secs=1.0,       # Window size for correlation
    correlation_threshold=0.4,  # Min correlation to be "good"
    frac_bad=0.01,              # Fraction of bad windows to flag channel
)

# Find channels with abnormal deviation
nc2.find_bad_by_deviation(deviation_threshold=5.0)

# Find channels with high-frequency noise
nc2.find_bad_by_hf_noise(hf_noise_threshold=5.0)

# Find channels with abnormal power spectral density
nc2.find_bad_by_PSD(
    zscore_threshold=3.0,
    fmin=1.0,
    fmax=45.0,
)

# RANSAC (run last, after other methods have identified bads)
nc2.find_bad_by_ransac(
    n_samples=50,               # Number of random samples
    sample_prop=0.25,           # Proportion of channels per sample
    corr_thresh=0.75,           # Correlation threshold for "good" window
    frac_bad=0.4,               # Fraction of bad windows to flag channel
    corr_window_secs=5.0,       # Window length for correlation
    channel_wise=False,         # Window-wise mode
)

all_bads_v2 = nc2.get_bads()
```

#### Parameter Recommendations

| Parameter | Default | Conservative | Aggressive | When to Adjust |
|-----------|---------|-------------|------------|----------------|
| `corr_thresh` (RANSAC) | 0.75 | 0.80 | 0.65 | Lower = more sensitive |
| `frac_bad` (RANSAC) | 0.4 | 0.3 | 0.5 | Lower = stricter flagging |
| `n_samples` (RANSAC) | 50 | 100 | 25 | Higher = more robust |
| `correlation_threshold` | 0.4 | 0.5 | 0.3 | Higher = more channels flagged |
| `deviation_threshold` | 5.0 | 3.5 | 6.0 | Z-score for deviation |
| `flat_threshold` | 1e-15 | 1e-15 | 1e-15 | Usually keep default |

#### QC Metrics

```python
def qc_bad_channel_detection(raw_original, raw_clean, bads_dict):
    """Quality control metrics for bad channel detection."""
    metrics = {}
    
    # Fraction of channels flagged as bad
    n_eeg = len(mne.pick_types(raw_original.info, eeg=True))
    total_bads = len(set().union(*[
        set(v) for v in bads_dict.values() if isinstance(v, list)
    ]))
    metrics['fraction_bad_channels'] = total_bads / n_eeg
    
    # Per-method breakdown
    for method, channels in bads_dict.items():
        if isinstance(channels, list):
            metrics[f'{method}_count'] = len(channels)
    
    # Channel variance before/after
    data_orig = raw_original.get_data(picks='eeg')
    data_clean = raw_clean.get_data(picks='eeg')
    metrics['variance_reduction_db'] = 10 * np.log10(
        np.var(data_clean) / np.var(data_orig)
    )
    
    # Check no NaN values after interpolation
    metrics['has_nan'] = np.any(np.isnan(data_clean))
    
    # Warnings
    if metrics['fraction_bad_channels'] > 0.3:
        print("WARNING: >30% channels flagged as bad - check montage/settings")
    if metrics['fraction_bad_channels'] > 0.5:
        print("CRITICAL: >50% channels bad - data quality may be unusable")
    
    return metrics
```

---

### 3.2 autoreject

**Description:** autoreject provides automated rejection of bad epochs and (optionally) interpolation of bad channels within epochs. It uses a cross-validation approach to find optimal peak-to-peak amplitude thresholds.

**When to Use:**
- After epoching, before averaging
- To automatically find rejection thresholds per channel type
- For local rejection (interpolate bad channels within epochs instead of dropping)

**Limitations:**
- Requires epoched data (not continuous)
- Can be slow on large datasets
- May over-reject if artifacts are very common

#### Installation

```bash
pip install autoreject
```

#### Production Pipeline Code

```python
"""
autoreject - Automated Epoch Rejection
Global and local rejection with cross-validated thresholds.
"""
import mne
import numpy as np
from autoreject import (
    get_rejection_threshold, Ransac, AutoReject,
    compute_thresholds
)

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
RANDOM_STATE = 42
N_INTERPOLATE = [4, 8, 16]  # Channels to interpolate (local mode)
N_JOBS = -1  # Use all CPU cores

# -------------------------------------------------------------------------
# Load and Epoch Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_fif('cleaned_raw.fif', preload=True)
events, event_id = mne.events_from_annotations(raw)

# Create epochs
epochs = mne.Epochs(
    raw,
    events,
    event_id=event_id,
    tmin=-0.2,
    tmax=1.0,
    baseline=(-0.2, 0),
    preload=True,
    reject=None,  # Let autoreject handle this
)

# -------------------------------------------------------------------------
# Method 1: Global Rejection Threshold (fast, drops epochs)
# -------------------------------------------------------------------------
# Compute optimal rejection thresholds per channel type
reject_threshold = get_rejection_threshold(
    epochs,
    random_state=RANDOM_STATE,
    decim=2,  # Use every 2nd sample for speed
)
print(f"Auto-detected rejection thresholds: {reject_threshold}")
# Example output: {'eeg': 150e-6, 'eog': 250e-6}

# Apply rejection manually if needed
epochs_rejected = epochs.copy()
epochs_rejected.drop_bad(reject=reject_threshold)
print(f"Kept {len(epochs_rejected)}/{len(epochs)} epochs")

# -------------------------------------------------------------------------
# Method 2: Local AutoReject (interpolate bad channels, keep epochs)
# -------------------------------------------------------------------------
# This is the gold standard - repairs instead of rejects
ar = AutoReject(
    n_interpolate=N_INTERPOLATE,
    consensus=np.linspace(0.0, 1.0, 20),  # Consensus range
    thresh_method='bayesian_optimization',
    random_state=RANDOM_STATE,
    n_jobs=N_JOBS,
    verbose=True,
)

# Fit and transform
epochs_clean, log = ar.fit_transform(epochs, return_log=True)

# Access interpolation log
print(f"Bad epochs detected: {np.sum(log.bad_epochs)}")
print(f"Channels interpolated per epoch: {log.labels}")

# -------------------------------------------------------------------------
# Method 3: RANSAC for Bad Channel Detection (within epochs)
# -------------------------------------------------------------------------
ransac = Ransac(
    n_resample=50,          # Number of resampling runs
    min_channels=0.25,      # Min fraction of channels for prediction
    min_corr=0.75,          # Minimum correlation threshold
    unbroken_time=0.4,      # Min unbroken time (fraction)
    n_jobs=N_JOBS,
    random_state=RANDOM_STATE,
    verbose=True,
)

# Fit RANSAC on epochs (use a subset for speed)
ransac.fit(epochs[:50])  # Fit on first 50 epochs

# Get bad channel predictions per epoch
epochs_ransac = ransac.transform(epochs)

# -------------------------------------------------------------------------
# Method 4: MNE-BIDS Pipeline Integration
# -------------------------------------------------------------------------
# For MNE-BIDS Pipeline users, use these settings:
# reject = "autoreject_global"  # Find global thresholds
# reject = "autoreject_local"   # Local rejection with interpolation
# autoreject_n_interpolate = 4  # Max channels to interpolate
```

#### Parameter Recommendations

| Parameter | Default | Conservative | Aggressive | Notes |
|-----------|---------|-------------|------------|-------|
| `n_interpolate` | [4, 8, 16] | [2, 4, 8] | [8, 16, 32] | Higher = more repair, more risk |
| `consensus` | 0.1-1.0 | 0.5-1.0 | 0.0-0.3 | Min fraction of channels agreeing |
| `thresh_method` | 'bayesian' | 'random_search' | 'bayesian' | Bayesian is generally better |
| `decim` (global) | 1 | 2-4 | 1 | Higher decim = faster, less precise |

#### QC Metrics

```python
def qc_autoreject(epochs_original, epochs_clean, log=None):
    """Quality control metrics for autoreject."""
    metrics = {}
    
    n_original = len(epochs_original)
    n_clean = len(epochs_clean)
    
    # Rejection rate
    metrics['rejection_rate'] = 1 - (n_clean / n_original)
    
    # Per-epoch bad channel counts (local mode)
    if log is not None:
        bad_counts = [np.sum(labels > 0) for labels in log.labels]
        metrics['mean_bad_channels_per_epoch'] = np.mean(bad_counts)
        metrics['max_bad_channels_per_epoch'] = np.max(bad_counts)
    
    # Peak-to-peak amplitude reduction
    ptp_orig = np.ptp(epochs_original.get_data(), axis=2).mean()
    ptp_clean = np.ptp(epochs_clean.get_data(), axis=2).mean()
    metrics['ptp_reduction_pct'] = (1 - ptp_clean / ptp_orig) * 100
    
    # Warnings
    if metrics['rejection_rate'] > 0.5:
        print("WARNING: >50% epochs rejected - check data quality")
    if metrics['rejection_rate'] < 0.05:
        print("WARNING: <5% epochs rejected - thresholds may be too lenient")
    
    return metrics
```

---

### 3.3 MNE `find_bad_channels_maxwell`

**Description:** Uses Maxwell filtering (signal-space separation) to detect bad MEG channels by comparing original data against SSS-reconstructed data. Also detects flat channels.

**When to Use:**
- MEG data only (not for EEG)
- Before applying `maxwell_filter()`
- For detecting noisy or flat MEG sensors

**Note:** This is MEG-specific. For EEG, use PyPREP or NoisyChannels.

#### Installation

```bash
# Included with mne
pip install mne
```

#### Production Pipeline Code

```python
"""
MNE find_bad_channels_maxwell - MEG Bad Channel Detection
Uses signal-space separation to identify noisy/flat MEG channels.
"""
import mne
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import pandas as pd

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
LIMIT = 7.0        # Detection threshold (smaller = more sensitive)
DURATION = 5.0     # Segment duration in seconds
MIN_COUNT = 5      # Min times channel must appear bad
H_FREQ = 40.0      # Low-pass filter for detection

# -------------------------------------------------------------------------
# Load MEG Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_fif('meg_recording_raw.fif', preload=True)

# Set calibration and cross-talk files (site-specific)
# calibration_file = 'sss_cal_mgh.dat'
# cross_talk_file = 'ct_sparse.fif'

# -------------------------------------------------------------------------
# Detect Bad Channels
# -------------------------------------------------------------------------
auto_noisy_chs, auto_flat_chs, auto_scores = mne.preprocessing.find_bad_channels_maxwell(
    raw,
    limit=LIMIT,
    duration=DURATION,
    min_count=MIN_COUNT,
    return_scores=True,
    # calibration=calibration_file,
    # cross_talk=cross_talk_file,
    h_freq=H_FREQ,
    verbose=True,
)

print(f"Noisy channels: {auto_noisy_chs}")
print(f"Flat channels: {auto_flat_chs}")

# Update raw info
raw.info["bads"].extend(auto_noisy_chs + auto_flat_chs)
raw.info["bads"] = list(set(raw.info["bads"]))  # Remove duplicates

# -------------------------------------------------------------------------
# Visualize Scores (Diagnostic)
# -------------------------------------------------------------------------
def plot_maxwell_scores(auto_scores, ch_type='grad'):
    """Plot Maxwell filtering bad channel scores."""
    ch_subset = auto_scores["ch_types"] == ch_type
    ch_names = auto_scores["ch_names"][ch_subset]
    scores = auto_scores["scores_noisy"][ch_subset]
    limits = auto_scores["limits_noisy"][ch_subset]
    bins = auto_scores["bins"]
    
    bin_labels = [f"{start:.3f} - {stop:.3f}" for start, stop in bins]
    
    data_to_plot = pd.DataFrame(
        data=scores,
        columns=pd.Index(bin_labels, name="Time (s)"),
        index=pd.Index(ch_names, name="Channel"),
    )
    
    fig, axes = plt.subplots(1, 2, figsize=(14, 8))
    
    # All scores
    sns.heatmap(data_to_plot, cmap="YlOrRd", ax=axes[0],
                cbar_kws=dict(label="Score"))
    axes[0].set_title(f"All Scores ({ch_type})")
    
    # Highlight scores above limit
    sns.heatmap(data_to_plot, cmap="YlOrRd", vmin=np.nanmin(limits),
                ax=axes[1], cbar_kws=dict(label="Score"))
    axes[1].set_title(f"Scores > Limit ({ch_type})")
    
    plt.tight_layout()
    plt.savefig('maxwell_scores.png', dpi=150)
    plt.show()

# Plot scores for gradiometers
plot_maxwell_scores(auto_scores, ch_type='grad')

# -------------------------------------------------------------------------
# Apply Maxwell Filter (after marking bads)
# -------------------------------------------------------------------------
raw_sss = mne.preprocessing.maxwell_filter(
    raw,
    # calibration=calibration_file,
    # cross_talk=cross_talk_file,
    st_duration=10,        # Spatiotemporal SSS window
    st_correlation=0.98,   # ST correlation limit
    origin='auto',
    verbose=True,
)

# Save
raw_sss.save('meg_recording_sss.fif', overwrite=True)
```

#### QC Metrics

```python
def qc_maxwell_detection(raw, auto_noisy_chs, auto_flat_chs, auto_scores):
    """Quality control for Maxwell bad channel detection."""
    metrics = {}
    
    n_meg = len(mne.pick_types(raw.info, meg=True))
    metrics['n_noisy'] = len(auto_noisy_chs)
    metrics['n_flat'] = len(auto_flat_chs)
    metrics['fraction_bad'] = (len(auto_noisy_chs) + len(auto_flat_chs)) / n_meg
    
    # Score statistics
    for ch_type in ['grad', 'mag']:
        subset = auto_scores["ch_types"] == ch_type
        scores = auto_scores["scores_noisy"][subset]
        metrics[f'{ch_type}_mean_score'] = np.nanmean(scores)
        metrics[f'{ch_type}_max_score'] = np.nanmax(scores)
    
    if metrics['fraction_bad'] > 0.2:
        print("WARNING: >20% MEG channels flagged")
    
    return metrics
```

---

### 3.4 `pyprep.NoisyChannels` Standalone

**Description:** The `NoisyChannels` class from PyPREP provides granular control over bad channel detection, allowing you to run individual detection methods and customize parameters.

#### Production Pipeline Code

```python
"""
pyprep.NoisyChannels - Standalone Bad Channel Detection
Maximum control over individual detection methods.
"""
import mne
import numpy as np
from pyprep.find_noisy_channels import NoisyChannels

# -------------------------------------------------------------------------
# Load Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_fif('recording_raw.fif', preload=True)

# Ensure montage
if raw.get_montage() is None:
    montage = mne.channels.make_standard_montage('standard_1020')
    raw.set_montage(montage, match_case=False)

# -------------------------------------------------------------------------
# Step-by-step detection with full control
# -------------------------------------------------------------------------
nc = NoisyChannels(raw, random_state=42, do_detrend=True)

# Step 1: Find bad-by-flat (no signal)
nc.find_bad_by_flat(flat_threshold=1e-15)
print(f"Bad by flat: {nc.bad_by_flat}")

# Step 2: Find bad-by-NaN
nc.find_bad_by_nan()
print(f"Bad by NaN: {nc.bad_by_nan}")

# Step 3: Find bad-by-deviation (abnormal variance)
nc.find_bad_by_deviation(deviation_threshold=5.0)
print(f"Bad by deviation: {nc.bad_by_deviation}")

# Step 4: Find bad-by-correlation (poor correlation with neighbors)
nc.find_bad_by_correlation(
    correlation_secs=1.0,
    correlation_threshold=0.4,
    frac_bad=0.01,
)
print(f"Bad by correlation: {nc.bad_by_correlation}")

# Step 5: Find bad-by-HF-noise (high frequency noise)
nc.find_bad_by_hf_noise(hf_noise_threshold=5.0)
print(f"Bad by HF noise: {nc.bad_by_hf_noise}")

# Step 6: Find bad-by-SNR (signal-to-noise ratio)
nc.find_bad_by_SNR()
print(f"Bad by SNR: {nc.bad_by_SNR}")

# Step 7: Find bad-by-PSD (power spectral density)
nc.find_bad_by_PSD(
    zscore_threshold=3.0,
    fmin=1.0,
    fmax=45.0,
)
print(f"Bad by PSD: {nc.bad_by_PSD}")

# Step 8: RANSAC (run last, excludes channels found by other methods)
nc.find_bad_by_ransac(
    n_samples=50,
    sample_prop=0.25,
    corr_thresh=0.75,
    frac_bad=0.4,
    corr_window_secs=5.0,
    channel_wise=False,
)
print(f"Bad by RANSAC: {nc.bad_by_ransac}")

# Get comprehensive report
all_bads = nc.get_bads(verbose=True, as_dict=True)
print(f"\n=== SUMMARY ===")
print(f"Total unique bad channels: {len(nc.get_bads())}")

# Mark and interpolate
raw_interp = raw.copy()
raw_interp.info['bads'] = nc.get_bads()
raw_interp.interpolate_bads(reset_bads=True)
```

---

## 4. ICA-Based Artifact Removal

### 4.1 MNE `ICA` (Infomax / FastICA / AMICA)

**Description:** Independent Component Analysis decomposes EEG into maximally independent sources. Artifactual components (eye blinks, heartbeat, muscle) can be identified and removed.

**When to Use:**
- After bad channel detection/interpolation
- After average referencing (required for ICLabel)
- For removing ocular and cardiac artifacts
- Before epoching (apply to continuous data)

#### Installation

```bash
pip install mne scikit-learn  # scikit-learn required for ICA
```

#### Production Pipeline Code

```python
"""
MNE ICA - Complete Production Pipeline
Extended Infomax (default), FastICA, and AMICA support.
"""
import mne
import numpy as np
from mne.preprocessing import ICA, create_eog_epochs, create_ecg_epochs

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
N_COMPONENTS = None    # None = all channels (rank-deficiency aware)
METHOD = 'infomax'     # 'infomax', 'fastica', 'picard', 'amica'
RANDOM_STATE = 42
MAX_ITER = 'auto'      # Auto-determine iterations
FIT_PARAMS = dict(extended=True)  # Extended Infomax for subgaussians

# -------------------------------------------------------------------------
# Load and Prepare Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_fif('cleaned_raw.fif', preload=True)

# Step 1: High-pass filter at 1 Hz (CRITICAL for ICA)
raw_ica = raw.copy().filter(l_freq=1.0, h_freq=None)

# Step 2: Set average reference (REQUIRED for ICLabel compatibility)
mne.set_eeg_reference(raw_ica, ref_channels='average', copy=False)

# -------------------------------------------------------------------------
# Fit ICA
# -------------------------------------------------------------------------
ica = ICA(
    n_components=N_COMPONENTS,
    max_iter=MAX_ITER,
    method=METHOD,
    random_state=RANDOM_STATE,
    fit_params=FIT_PARAMS,
    verbose=True,
)

# Fit on filtered data (but will apply to unfiltered)
ica.fit(raw_ica)

print(f"Fitted {ica.n_components_} components")

# -------------------------------------------------------------------------
# Method A: Manual Artifact Detection (EOG/ECG correlation)
# -------------------------------------------------------------------------
# Find EOG/ECG channels
eog_chs = mne.pick_types(raw.info, eog=True)
ecg_chs = mne.pick_types(raw.info, ecg=True)

# Detect EOG components (eye blinks)
if len(eog_chs) > 0:
    eog_epochs = create_eog_epochs(raw, ch_name=raw.ch_names[eog_chs[0]])
    eog_indices, eog_scores = ica.find_bads_eog(
        raw,
        ch_name=raw.ch_names[eog_chs[0]],
        threshold=3.0,      # Z-score threshold
        l_freq=1, h_freq=10,
    )
    print(f"EOG components: {eog_indices}")
    ica.exclude.extend(eog_indices)

# Detect ECG components (heartbeat)
if len(ecg_chs) > 0:
    ecg_indices, ecg_scores = ica.find_bads_ecg(
        raw,
        method='ctps',      # Cross-trial phase statistics
        threshold='auto',
    )
    print(f"ECG components: {ecg_indices}")
    ica.exclude.extend(ecg_indices)

# -------------------------------------------------------------------------
# Method B: Automated IC Classification (see Section 4.2)
# -------------------------------------------------------------------------
# from mne_icalabel import label_components
# labels = label_components(raw_ica, ica, method='iclabel')
# ica.exclude = [i for i, label in enumerate(labels['labels']) 
#                if label not in ['brain', 'other']]

# -------------------------------------------------------------------------
# Apply ICA
# -------------------------------------------------------------------------
# Apply to the ORIGINAL (unfiltered) data
raw_ica_clean = ica.apply(raw.copy())

# Save
raw_ica_clean.save('ica_cleaned_raw.fif', overwrite=True)

# -------------------------------------------------------------------------
# Visual Inspection Helpers
# -------------------------------------------------------------------------
# Plot ICA components (topographies)
ica.plot_components(picks=range(20))

# Plot component time series
ica.plot_sources(raw, show=True)

# Plot component properties (spectrum, epochs, etc.)
ica.plot_properties(raw, picks=range(10))

# -------------------------------------------------------------------------
# AMICA (Advanced) - via EEGLAB or mne-amica
# -------------------------------------------------------------------------
# AMICA is more robust than Infomax but much slower.
# Requires EEGLAB plugin or mne-amica package.
# 
# from mne_amica import Amica
# amica = Amica(n_models=1, max_iter=2000)
# amica.fit(raw_ica)
# unmixing = amica.unmixing_matrix_
```

#### Parameter Recommendations

| Parameter | Infomax | FastICA | AMICA | Notes |
|-----------|---------|---------|-------|-------|
| `n_components` | 0.99 rank | 0.99 rank | Full | Reduce for speed |
| `max_iter` | 'auto' | 200 | 2000 | AMICA needs more |
| `extended` | True | N/A | N/A | Needed for subgaussian |
| `l_freq` pre-filter | 1 Hz | 1 Hz | 0.5 Hz | High-pass before ICA |
| Decimation | None | 3-5 | None | Decimate for speed |

#### Before/After Comparison

```python
def compare_ica_before_after(raw_before, raw_after, ica, window_secs=10):
    """Compare EEG before and after ICA cleaning."""
    import matplotlib.pyplot as plt
    
    picks = mne.pick_types(raw_before.info, eeg=True)[:10]
    start = 100  # Start time in seconds
    stop = start + window_secs
    
    fig, axes = plt.subplots(2, 1, figsize=(15, 8))
    
    # Before
    data_before = raw_before.get_data(picks=picks, tmin=start, tmax=stop)
    times = np.linspace(0, window_secs, data_before.shape[1])
    for i, ch_idx in enumerate(picks):
        axes[0].plot(times, data_before[i] * 1e6 + i * 50, 
                     label=raw_before.ch_names[ch_idx], linewidth=0.5)
    axes[0].set_title('Before ICA')
    axes[0].set_ylabel('Amplitude (uV)')
    
    # After
    data_after = raw_after.get_data(picks=picks, tmin=start, tmax=stop)
    for i, ch_idx in enumerate(picks):
        axes[1].plot(times, data_after[i] * 1e6 + i * 50,
                     label=raw_after.ch_names[ch_idx], linewidth=0.5)
    axes[1].set_title('After ICA')
    axes[1].set_ylabel('Amplitude (uV)')
    axes[1].set_xlabel('Time (s)')
    
    plt.tight_layout()
    plt.savefig('ica_before_after.png', dpi=150)
    plt.show()

# Usage
compare_ica_before_after(raw, raw_ica_clean, ica)
```

---

### 4.2 mne-icalabel (Automated IC Labeling)

**Description:** mne-icalabel implements the ICLabel model, a neural network trained on crowd-sourced ICA component labels. It automatically classifies components into 7 categories: brain, muscle, eye, heart, line noise, channel noise, other.

**When to Use:**
- After ICA fitting (Infomax extended required)
- When manual IC review is impractical (large datasets)
- For standardized, reproducible artifact rejection

**Requirements:**
- Extended Infomax ICA
- Average reference
- 1-100 Hz filtering preferred

#### Installation

```bash
pip install mne-icalabel
```

#### Production Pipeline Code

```python
"""
mne-icalabel - Automated ICA Component Classification
Classifies ICA components into: brain, muscle, eye, heart, line, channel, other.
"""
import mne
from mne.preprocessing import ICA
from mne_icalabel import label_components

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
RANDOM_STATE = 42
KEEP_LABELS = ['brain', 'other']  # Components to KEEP (remove the rest)

# -------------------------------------------------------------------------
# Load and Prepare Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_fif('preprocessed_raw.fif', preload=True)

# Filter for ICA (1-100 Hz as per ICLabel recommendations)
raw_ica = raw.copy().filter(l_freq=1.0, h_freq=100.0)

# Apply average reference (REQUIRED)
mne.set_eeg_reference(raw_ica, ref_channels='average', copy=False)

# -------------------------------------------------------------------------
# Fit ICA with Extended Infomax (REQUIRED for ICLabel)
# -------------------------------------------------------------------------
ica = ICA(
    n_components=None,      # Use all channels
    max_iter='auto',
    method='infomax',
    random_state=RANDOM_STATE,
    fit_params=dict(extended=True),
)
ica.fit(raw_ica)

# -------------------------------------------------------------------------
# Automated Labeling
# -------------------------------------------------------------------------
# Label components
labels = label_components(raw_ica, ica, method='iclabel')

# labels['labels']: list of predicted labels
# labels['y_pred_proba']: (n_components, 7) probability array
#   columns: ['brain', 'muscle', 'eye', 'heart', 'line_noise', 'channel_noise', 'other']

print("\n=== IC Labeling Results ===")
for i, (label, probs) in enumerate(zip(labels['labels'], labels['y_pred_proba'])):
    confidence = max(probs)
    print(f"IC{i:02d}: {label:15s} (confidence: {confidence:.3f})")

# -------------------------------------------------------------------------
# Select Components to Exclude
# -------------------------------------------------------------------------
# Strategy 1: Exclude everything except 'brain' and 'other'
ica.exclude = [i for i, label in enumerate(labels['labels'])
               if label not in KEEP_LABELS]
print(f"\nExcluding components: {ica.exclude}")

# Strategy 2: Probability threshold (more conservative)
# Only exclude if confidence > 0.7 for non-brain labels
# ica.exclude = []
# for i, (label, probs) in enumerate(zip(labels['labels'], labels['y_pred_proba'])):
#     if label not in KEEP_LABELS and max(probs) > 0.7:
#         ica.exclude.append(i)

# Strategy 3: Custom rules
# Always exclude eye and heart, be more lenient with muscle
# exclude_labels = ['eye', 'heart', 'line_noise', 'channel_noise']
# ica.exclude = [i for i, l in enumerate(labels['labels']) if l in exclude_labels]

# -------------------------------------------------------------------------
# Apply ICA
# -------------------------------------------------------------------------
# Apply to original unfiltered data
raw_clean = ica.apply(raw.copy())
raw_clean.save('icalabel_cleaned_raw.fif', overwrite=True)

# -------------------------------------------------------------------------
# Visual Verification
# -------------------------------------------------------------------------
# Plot labels with probabilities
ica.plot_components()

# Plot excluded component properties
if len(ica.exclude) > 0:
    ica.plot_properties(raw, picks=ica.exclude)

# -------------------------------------------------------------------------
# Summary Statistics
# -------------------------------------------------------------------------
label_counts = {label: 0 for label in 
                ['brain', 'muscle', 'eye', 'heart', 'line_noise', 'channel_noise', 'other']}
for label in labels['labels']:
    label_counts[label] += 1

print("\n=== Component Summary ===")
for label, count in label_counts.items():
    print(f"  {label:15s}: {count}")
print(f"  {'Excluded':15s}: {len(ica.exclude)}")
print(f"  {'Kept':15s}: {ica.n_components_ - len(ica.exclude)}")
```

#### Parameter Recommendations

| Parameter | Default | Conservative | Notes |
|-----------|---------|-------------|-------|
| `method` | `'iclabel'` | `'iclabel'` | Only ICLabel available |
| `KEEP_LABELS` | `['brain','other']` | `['brain']` | 'other' may include artifacts |
| Confidence threshold | 0.0 (all) | 0.7 | Higher = more conservative |
| Pre-filtering | 1-100 Hz | 1-100 Hz | As per ICLabel paper |

#### QC Metrics

```python
def qc_icalabel(labels, ica_exclude):
    """Quality control for ICLabel classification."""
    metrics = {}
    
    n_components = len(labels['labels'])
    n_excluded = len(ica_exclude)
    
    metrics['exclusion_rate'] = n_excluded / n_components
    metrics['n_brain_components'] = labels['labels'].count('brain')
    metrics['n_eye_components'] = labels['labels'].count('eye')
    metrics['n_heart_components'] = labels['labels'].count('heart')
    metrics['n_muscle_components'] = labels['labels'].count('muscle')
    
    # Mean confidence of excluded components
    excluded_confidences = []
    for i in ica_exclude:
        excluded_confidences.append(max(labels['y_pred_proba'][i]))
    metrics['mean_exclusion_confidence'] = np.mean(excluded_confidences) if excluded_confidences else 0
    
    # Warnings
    if metrics['n_brain_components'] == 0:
        print("CRITICAL: No brain components detected!")
    if metrics['exclusion_rate'] > 0.8:
        print("WARNING: >80% components excluded - check data quality")
    if metrics['exclusion_rate'] < 0.1:
        print("WARNING: <10% components excluded - may be too lenient")
    
    return metrics
```

---

### 4.3 FASTER (Fully Automated Statistical Thresholding)

**Description:** FASTER applies statistical z-score thresholding at multiple levels: channels, epochs, independent components, and single channels within epochs. It uses z > 3 as the outlier criterion.

**When to Use:**
- Fully automated pipeline (no manual intervention)
- When you need outlier detection at multiple levels
- Good for batch processing many subjects

**Limitations:**
- Assumes approximately normal distributions
- Less effective with < 32 channels
- May need parameter tuning for specific populations

#### Installation

```bash
# FASTER is available via MNE-Python community implementations
# Install dependencies:
pip install mne numpy scipy
# FASTER logic must be implemented manually (see below)
```

#### Production Pipeline Code

```python
"""
FASTER - Fully Automated Statistical Thresholding for EEG artifact Rejection
Implements the FASTER pipeline with z-score thresholding at multiple levels.
"""
import mne
import numpy as np
from scipy import stats
from mne.preprocessing import ICA

def faster_bad_channels(epochs, z_threshold=3.0):
    """Step 1: Detect bad channels using FASTER metrics.
    
    Metrics per channel:
    - Variance of the signal
    - Correlation with other channels (median correlation)
    - Hurst exponent (predictability)
    """
    data = epochs.get_data()  # (n_epochs, n_channels, n_times)
    n_channels = data.shape[1]
    ch_names = epochs.ch_names
    
    bads = []
    
    # Metric 1: Channel variance (mean across epochs)
    channel_var = np.var(data, axis=2).mean(axis=0)
    z_var = np.abs(stats.zscore(channel_var))
    
    # Metric 2: Median correlation with other channels
    correlations = np.zeros(n_channels)
    for ch in range(n_channels):
        corrs = []
        for other_ch in range(n_channels):
            if ch != other_ch:
                # Correlation across all epochs and times
                ch_data = data[:, ch, :].flatten()
                other_data = data[:, other_ch, :].flatten()
                corrs.append(np.corrcoef(ch_data, other_data)[0, 1])
        correlations[ch] = np.median(corrs)
    z_corr = np.abs(stats.zscore(correlations))
    
    # Metric 3: Hurst exponent (simplified)
    hurst = np.zeros(n_channels)
    for ch in range(n_channels):
        ts = data[:, ch, :].mean(axis=0)  # Average across epochs
        hurst[ch] = compute_hurst(ts)
    z_hurst = np.abs(stats.zscore(hurst))
    
    # Flag channels exceeding threshold on any metric
    for ch in range(n_channels):
        if z_var[ch] > z_threshold or z_corr[ch] > z_threshold or z_hurst[ch] > z_threshold:
            bads.append(ch_names[ch])
    
    return list(set(bads))

def faster_bad_epochs(epochs, z_threshold=3.0):
    """Step 2: Detect bad epochs using channel-wise deviations."""
    data = epochs.get_data()
    n_epochs = data.shape[0]
    
    bad_epochs = []
    for ep in range(n_epochs):
        # Compute mean channel deviation for this epoch
        epoch_data = data[ep]  # (n_channels, n_times)
        channel_means = np.mean(np.abs(epoch_data), axis=1)
        z_scores = np.abs(stats.zscore(channel_means))
        
        if np.max(z_scores) > z_threshold:
            bad_epochs.append(ep)
    
    return bad_epochs

def faster_bad_ics(ica, epochs, raw, z_threshold=3.0):
    """Step 3: Detect bad ICs using FASTER metrics.
    
    Metrics:
    - EOG correlation (max absolute correlation with EOG channels)
    - Spatial kurtosis (single-channel offset detection)
    - Spectral slope (white noise detection)
    - Hurst exponent
    """
    # Get IC time courses
    ic_sources = ica.get_sources(raw).get_data()
    n_components = ic_sources.shape[0]
    
    bad_ics = []
    
    for ic in range(n_components):
        scores = []
        
        # Metric 1: EOG correlation
        eog_picks = mne.pick_types(raw.info, eog=True)
        if len(eog_picks) > 0:
            eog_data = raw.get_data(picks=eog_picks)
            corrs = [np.corrcoef(ic_sources[ic], eog_data[e])[0, 1] 
                     for e in range(len(eog_picks))]
            scores.append(np.max(np.abs(corrs)))
        
        # Metric 2: Spatial kurtosis (from mixing matrix)
        mixing = ica.get_components()[:, ic]
        kurt = stats.kurtosis(mixing)
        scores.append(np.abs(kurt))
        
        # Metric 3: Hurst exponent of time course
        h = compute_hurst(ic_sources[ic])
        scores.append(np.abs(h - 0.5))  # Deviation from random walk
        
        # Z-score and threshold
        z_scores = np.abs(stats.zscore(scores)) if len(scores) > 1 else [0]
        if np.max(z_scores) > z_threshold:
            bad_ics.append(ic)
    
    return bad_ics

def compute_hurst(ts, max_lag=100):
    """Compute Hurst exponent using rescaled range analysis."""
    lags = range(2, min(max_lag, len(ts) // 4))
    rs_values = []
    
    for lag in lags:
        # Reshape into chunks
        n_chunks = len(ts) // lag
        chunks = ts[:n_chunks * lag].reshape(n_chunks, lag)
        
        # R/S for each chunk
        rs_chunks = []
        for chunk in chunks:
            mean_chunk = np.mean(chunk)
            dev = np.cumsum(chunk - mean_chunk)
            r = np.max(dev) - np.min(dev)
            s = np.std(chunk)
            if s > 0:
                rs_chunks.append(r / s)
        
        if rs_chunks:
            rs_values.append(np.mean(rs_chunks))
    
    if len(rs_values) > 1:
        log_lags = np.log(list(lags)[:len(rs_values)])
        log_rs = np.log(rs_values)
        slope, _, _, _, _ = stats.linregress(log_lags, log_rs)
        return slope
    return 0.5

# -------------------------------------------------------------------------
# Full FASTER Pipeline
# -------------------------------------------------------------------------
def run_faster_pipeline(raw, event_id, tmin=-0.5, tmax=1.0, 
                        baseline=(-0.2, 0), z_threshold=3.0):
    """Run complete FASTER pipeline."""
    
    print("=== FASTER Pipeline ===")
    
    # Create epochs
    events, _ = mne.events_from_annotations(raw)
    epochs = mne.Epochs(raw, events, event_id=event_id,
                        tmin=tmin, tmax=tmax, baseline=baseline,
                        preload=True, reject=None)
    print(f"Created {len(epochs)} epochs")
    
    # Step 1: Bad channel detection
    bad_chs = faster_bad_channels(epochs, z_threshold)
    print(f"Bad channels: {bad_chs}")
    epochs.info['bads'] = bad_chs
    epochs.interpolate_bads(reset_bads=True)
    
    # Step 2: Bad epoch detection
    bad_eps = faster_bad_epochs(epochs, z_threshold)
    print(f"Bad epochs: {len(bad_eps)}")
    epochs.drop(bad_eps)
    
    # Step 3: ICA
    raw_copy = raw.copy().filter(1, None)
    ica = ICA(n_components=0.99, method='infomax', 
              fit_params=dict(extended=True), random_state=42)
    ica.fit(raw_copy)
    
    # Step 4: Bad IC detection
    bad_ics = faster_bad_ics(ica, epochs, raw_copy, z_threshold)
    print(f"Bad ICs: {bad_ics}")
    ica.exclude = bad_ics
    
    # Apply ICA to original data
    raw_clean = ica.apply(raw.copy())
    
    # Recreate epochs from cleaned data
    epochs_clean = mne.Epochs(raw_clean, events, event_id=event_id,
                               tmin=tmin, tmax=tmax, baseline=baseline,
                               preload=True, reject=None)
    
    return epochs_clean, ica, {'bad_channels': bad_chs,
                                'bad_epochs': bad_eps,
                                'bad_ics': bad_ics}

# Usage
# epochs_clean, ica, report = run_faster_pipeline(raw, event_id={'target': 1})
```

---

## 5. ASR (Artifact Subspace Reconstruction)

### 5.1 Overview

**Description:** ASR is an online, component-based artifact removal method that identifies and reconstructs periods of high-variance activity using a calibration-derived covariance structure. It is particularly effective for transient artifacts (movement, muscle bursts).

**Key Parameters:**
- `cutoff`: Standard deviation threshold (2.5 = aggressive, 5 = conservative, 20 = very conservative)
- Calibration data: Clean, representative EEG (ideally 30+ seconds)

**When to Use:**
- Removing transient, high-amplitude artifacts
- Mobile/wearable EEG with movement artifacts
- Real-time or online processing
- After ICA for remaining burst artifacts

### 5.2 `meegkit.ASR` (Python)

#### Installation

```bash
pip install meegkit
```

#### Production Pipeline Code

```python
"""
meegkit.ASR - Artifact Subspace Reconstruction (Python)
Online component-based artifact removal.
"""
import mne
import numpy as np
from meegkit.asr import ASR
from meegkit.utils.matrix import sliding_window

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
SFREQ = 500
CUTOFF = 5              # SD cutoff: 2.5=aggressive, 5=default, 20=conservative
BLOCKSIZE = 100
WIN_LEN = 0.5           # Window length in seconds
WIN_OVERLAP = 0.66      # Window overlap fraction
METHOD = 'euclid'       # 'euclid' or 'riemann'
CALIBRATION_DURATION = 60  # Seconds of clean data for calibration

# -------------------------------------------------------------------------
# Load Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_fif('recording_raw.fif', preload=True)
data = raw.get_data(picks='eeg')  # (n_channels, n_times)
sfreq = raw.info['sfreq']

# -------------------------------------------------------------------------
# Pre-filter (REQUIRED: high-pass before ASR)
# -------------------------------------------------------------------------
raw_hp = raw.copy().filter(l_freq=0.5, h_freq=None, picks='eeg')
data_hp = raw_hp.get_data(picks='eeg')

# -------------------------------------------------------------------------
# Method 1: ASR with Clean Calibration Window
# -------------------------------------------------------------------------
asr = ASR(
    sfreq=sfreq,
    cutoff=CUTOFF,
    blocksize=BLOCKSIZE,
    win_len=WIN_LEN,
    win_overlap=WIN_OVERLAP,
    method=METHOD,
)

# Use first N seconds as calibration (assuming they are clean)
train_idx = np.arange(0, int(CALIBRATION_DURATION * sfreq))
_, sample_mask = asr.fit(data_hp[:, train_idx])

print(f"Calibration used {np.sum(sample_mask)}/{len(sample_mask)} samples")

# Apply using sliding windows
window_size = int(sfreq)  # 1-second windows
step_size = int(sfreq * 0.5)  # 50% overlap

X = sliding_window(data_hp, window=window_size, step=step_size)
Y = np.zeros_like(X)

for i in range(X.shape[1]):
    Y[:, i, :] = asr.transform(X[:, i, :])

# Reshape back
clean_data = Y.reshape(data_hp.shape[0], -1)

# Trim to original length
if clean_data.shape[1] > data_hp.shape[1]:
    clean_data = clean_data[:, :data_hp.shape[1]]

# Create cleaned Raw object
raw_asr = raw.copy()
raw_asr._data[mne.pick_types(raw.info, eeg=True)] = clean_data

raw_asr.save('asr_cleaned_raw.fif', overwrite=True)

# -------------------------------------------------------------------------
# Method 2: ASR with Automatic Clean Window Selection
# -------------------------------------------------------------------------
from meegkit.asr import clean_windows

def select_clean_window(data, sfreq, win_len=5.0):
    """Automatically select cleanest window for ASR calibration.
    
    Uses clean_windows to find low-variance periods.
    """
    # clean_windows returns data with bad periods removed
    clean_data, sample_mask = clean_windows(
        data,
        sfreq,
        max_bad_chans=0.2,
        zthresholds=[-3.5, 5],
        win_len=win_len,
        win_overlap=0.66,
        min_clean_fraction=0.25,
        max_dropout_fraction=0.1,
    )
    
    # Find longest contiguous clean segment
    clean_segments = []
    in_segment = False
    start = 0
    
    for i, is_clean in enumerate(sample_mask[0]):
        if is_clean and not in_segment:
            start = i
            in_segment = True
        elif not is_clean and in_segment:
            clean_segments.append((start, i))
            in_segment = False
    
    if in_segment:
        clean_segments.append((start, len(sample_mask[0])))
    
    # Select longest segment for calibration
    longest = max(clean_segments, key=lambda x: x[1] - x[0])
    calib_start, calib_end = longest
    
    print(f"Clean window: {calib_start/sfreq:.1f}s - {calib_end/sfreq:.1f}s "
          f"(duration: {(calib_end-calib_start)/sfreq:.1f}s)")
    
    return data[:, calib_start:calib_end], sample_mask

# Select clean window automatically
calib_data, mask = select_clean_window(data_hp, sfreq, win_len=5.0)

# Calibrate ASR on clean window
asr2 = ASR(sfreq=sfreq, cutoff=CUTOFF, method=METHOD)
asr2.fit(calib_data)

# Process entire recording
clean_data2 = asr2.transform(data_hp)

# -------------------------------------------------------------------------
# Method 3: Riemannian ASR (meegkit)
# -------------------------------------------------------------------------
# Riemannian ASR is more robust but requires pyriemann
asr_rie = ASR(sfreq=sfreq, cutoff=CUTOFF, method='riemann')
asr_rie.fit(data_hp[:, train_idx])
clean_data_rie = asr_rie.transform(data_hp)

# -------------------------------------------------------------------------
# ASR Parameter Sweep for Optimal Cutoff
# -------------------------------------------------------------------------
def optimize_asr_cutoff(data, sfreq, cutoffs=[2.5, 3.0, 4.0, 5.0, 10.0, 20.0]):
    """Evaluate ASR with different cutoff values."""
    results = {}
    
    calib = data[:, :int(30 * sfreq)]
    
    for cutoff in cutoffs:
        asr_test = ASR(sfreq=sfreq, cutoff=cutoff, method='euclid')
        asr_test.fit(calib)
        cleaned = asr_test.transform(data)
        
        # Metric: variance reduction
        var_ratio = np.var(cleaned) / np.var(data)
        n_changed = np.sum(np.abs(cleaned - data) > 1e-10)
        
        results[cutoff] = {
            'variance_ratio': var_ratio,
            'fraction_modified': n_changed / data.size,
        }
        print(f"Cutoff={cutoff}: var_ratio={var_ratio:.4f}, "
              f"modified={results[cutoff]['fraction_modified']:.4f}")
    
    return results

# results = optimize_asr_cutoff(data_hp, sfreq)
```

#### Parameter Recommendations

| Parameter | Value | When to Use |
|-----------|-------|-------------|
| `cutoff` | 5.0 | Default, conservative |
| `cutoff` | 2.5 | Aggressive, high-artifact data |
| `cutoff` | 3.0 | Moderate, mobile/wearable EEG |
| `cutoff` | 20.0 | Very conservative, preserve all EEG |
| `win_len` | 0.5 | Default window |
| `win_len` | 1.0 | Longer artifacts |
| `method` | `'euclid'` | Standard, faster |
| `method` | `'riemann'` | More robust, needs pyriemann |

#### QC Metrics

```python
def qc_asr(data_original, data_cleaned, sample_mask=None):
    """Quality control for ASR cleaning."""
    metrics = {}
    
    # Variance reduction
    var_orig = np.var(data_original)
    var_clean = np.var(data_cleaned)
    metrics['variance_reduction_db'] = 10 * np.log10(var_clean / var_orig)
    
    # Fraction of samples modified
    metrics['fraction_modified'] = np.mean(
        np.any(np.abs(data_cleaned - data_original) > 1e-10, axis=0)
    )
    
    # Mean absolute difference
    metrics['mean_abs_diff'] = np.mean(np.abs(data_cleaned - data_original))
    
    # Check for signal distortion
    correlations = []
    for ch in range(data_original.shape[0]):
        c = np.corrcoef(data_original[ch], data_cleaned[ch])[0, 1]
        correlations.append(c)
    metrics['mean_channel_correlation'] = np.mean(correlations)
    
    # Warnings
    if metrics['fraction_modified'] > 0.8:
        print("WARNING: >80% samples modified - cutoff may be too aggressive")
    if metrics['mean_channel_correlation'] < 0.5:
        print("WARNING: High signal distortion - increase cutoff")
    
    return metrics
```

---

### 5.3 `asrpy` (Alternative Python ASR)

#### Installation

```bash
pip install git+https://github.com/DiGyt/asrpy.git
```

#### Production Pipeline Code

```python
"""
asrpy - Alternative Python ASR Implementation
Closer to the original EEGLAB clean_rawdata implementation.
"""
from asrpy import ASR
import mne
import numpy as np

# -------------------------------------------------------------------------
# Load Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_fif('recording_raw.fif', preload=True)
data = raw.get_data(picks='eeg')
sfreq = raw.info['sfreq']

# High-pass filter
raw_hp = raw.copy().filter(l_freq=0.5, h_freq=None, picks='eeg')
data_hp = raw_hp.get_data(picks='eeg')

# -------------------------------------------------------------------------
# ASRpy Processing
# -------------------------------------------------------------------------
asr = ASR(sfreq=sfreq, cutoff=5)

# Fit on calibration data (first 30 seconds)
train_data = data_hp[:, :int(30 * sfreq)]
asr.fit(train_data)

# Transform
cleaned = asr.transform(data_hp)

# Create output
raw_clean = raw.copy()
eeg_picks = mne.pick_types(raw.info, eeg=True)
raw_clean._data[eeg_picks] = cleaned[:, :raw_clean.n_times]
```

---

### 5.4 ASR Calibration Window Selection Guide

Selecting the right calibration window is critical for ASR performance:

| Strategy | Method | When to Use |
|----------|--------|-------------|
| Fixed start | First N seconds | Eyes-open resting, known clean start |
| Eyes-closed segment | Manual selection | Resting-state EEG |
| Automatic clean | `clean_windows()` | Unknown data quality |
| Pre-task baseline | Before experiment | Task-based recordings |
| Subject-specific | Previous session | Repeated recordings |

```python
def select_asr_calibration(raw, method='auto', duration=30, sfreq=None):
    """Intelligent ASR calibration window selection.
    
    Parameters
    ----------
    raw : mne.io.Raw
        The raw EEG data
    method : str
        'auto' - Use clean_windows to find clean segment
        'start' - Use beginning of recording
        'middle' - Use middle portion
    duration : int
        Duration in seconds for calibration window
    """
    data = raw.get_data(picks='eeg')
    sfreq = sfreq or raw.info['sfreq']
    n_samples = int(duration * sfreq)
    
    if method == 'start':
        calib = data[:, :n_samples]
        
    elif method == 'middle':
        mid = data.shape[1] // 2
        calib = data[:, mid:mid + n_samples]
        
    elif method == 'auto':
        from meegkit.asr import clean_windows
        _, mask = clean_windows(data, sfreq)
        
        # Find longest clean segment
        clean_runs = []
        in_clean = False
        start = 0
        
        for i, m in enumerate(mask[0]):
            if m and not in_clean:
                start = i
                in_clean = True
            elif not m and in_clean:
                clean_runs.append((start, i))
                in_clean = False
        
        if in_clean:
            clean_runs.append((start, len(mask[0])))
        
        longest = max(clean_runs, key=lambda x: x[1] - x[0])
        calib = data[:, longest[0]:longest[0] + n_samples]
    
    print(f"Calibration shape: {calib.shape} ({calib.shape[1]/sfreq:.1f}s)")
    return calib
```

---

## 6. Line Noise & Spectral Cleaning

### 6.1 ZapLine

**Description:** ZapLine uses Denoising Source Separation (DSS) to remove power line noise (50/60 Hz) and its harmonics. Unlike notch filters, it preserves the data rank and avoids ringing artifacts.

**When to Use:**
- When standard notch filtering is insufficient
- For removing line noise harmonics
- When data rank preservation is important (before ICA)

#### Installation

```bash
# Option 1: meegkit (includes dss_line)
pip install meegkit

# Option 2: mne-denoise (includes ZapLine class)
pip install mne-denoise
```

#### Production Pipeline Code

```python
"""
ZapLine - Line Noise Removal via Denoising Source Separation
Removes 50/60 Hz and harmonics while preserving data rank.
"""
import mne
import numpy as np
from meegkit import dss
from meegkit.utils import unfold

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
LINE_FREQ = 50      # 50 Hz (Europe/Asia) or 60 Hz (Americas)
SFREQ = 500
N_REMOVE = 1        # Number of line-noise components to remove

# -------------------------------------------------------------------------
# Load Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_fif('recording_raw.fif', preload=True)
data = raw.get_data(picks='eeg').T  # meegkit expects (samples, channels)
sfreq = raw.info['sfreq']

# -------------------------------------------------------------------------
# Method 1: Single ZapLine (meegkit)
# -------------------------------------------------------------------------
out, _ = dss.dss_line(data, fline=LINE_FREQ, sfreq=sfreq, nkeep=N_REMOVE)

# out is (samples, channels) - same shape as input data.T
raw_zapline = raw.copy()
raw_zapline._data[mne.pick_types(raw.info, eeg=True)] = out.T

# -------------------------------------------------------------------------
# Method 2: Iterative ZapLine (for stubborn line noise)
# -------------------------------------------------------------------------
data_multi = np.load('epoched_data.npy')  # (samples, channels, trials)
out_iter, n_iterations = dss.dss_line_iter(
    data_multi, fline=LINE_FREQ, sfreq=sfreq, nfft=400, show=True
)
print(f"Removed {n_iterations} line-noise components")

# -------------------------------------------------------------------------
# Method 3: ZapLine with mne-denoise
# -------------------------------------------------------------------------
from mne_denoise.zapline import ZapLine

# Standard mode
zapline = ZapLine(sfreq=raw.info['sfreq'], line_freq=LINE_FREQ)
cleaned = zapline.fit_transform(raw)

# Adaptive mode (auto-detects line frequency)
zapline_plus = ZapLine(
    sfreq=raw.info['sfreq'],
    line_freq=None,  # Auto-detect
    adaptive=True,
)
cleaned_adaptive = zapline_plus.fit_transform(raw)
print(f"Detected line frequency: {zapline_plus.detected_freq_} Hz")

# -------------------------------------------------------------------------
# Method 4: Remove Multiple Harmonics
# -------------------------------------------------------------------------
def remove_line_harmonics(raw, line_freq=50, max_harmonic=5, sfreq=None):
    """Remove line noise and its harmonics using ZapLine."""
    data = raw.get_data(picks='eeg').T
    sfreq = sfreq or raw.info['sfreq']
    
    harmonics = [line_freq * h for h in range(1, max_harmonic + 1)
                 if line_freq * h < sfreq / 2]
    
    for freq in harmonics:
        data, _ = dss.dss_line(data, fline=freq, sfreq=sfreq, nkeep=1)
        print(f"Removed {freq} Hz component")
    
    raw_clean = raw.copy()
    raw_clean._data[mne.pick_types(raw.info, eeg=True)] = data.T
    return raw_clean

# raw_clean = remove_line_harmonics(raw, line_freq=50, max_harmonic=5)

# -------------------------------------------------------------------------
# Before/After Comparison
# -------------------------------------------------------------------------
import matplotlib.pyplot as plt
from scipy import signal

def plot_zapline_comparison(raw_before, raw_after, ch_name='EEG001'):
    """Plot PSD before and after ZapLine."""
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    
    for ax, r, title in [(axes[0], raw_before, 'Before'),
                          (axes[1], raw_after, 'After')]:
        psd = r.compute_psd(picks=ch_name, fmin=1, fmax=100)
        freqs = psd.freqs
        spectrum = psd.get_data().mean(axis=0)
        ax.semilogy(freqs, spectrum)
        ax.axvline(LINE_FREQ, color='r', linestyle='--', label=f'{LINE_FREQ} Hz')
        ax.axvline(2*LINE_FREQ, color='r', linestyle=':', label=f'{2*LINE_FREQ} Hz')
        ax.set_xlabel('Frequency (Hz)')
        ax.set_ylabel('Power (uV^2/Hz)')
        ax.set_title(title)
        ax.legend()
    
    plt.tight_layout()
    plt.savefig('zapline_comparison.png', dpi=150)
    plt.show()
```

#### QC Metrics

```python
def qc_zapline(raw_before, raw_after, line_freq=50):
    """Quality control for ZapLine line noise removal."""
    from scipy import signal as sp_signal
    
    metrics = {}
    picks = mne.pick_types(raw_before.info, eeg=True)[:5]
    
    for ch_idx in picks:
        ch_name = raw_before.ch_names[ch_idx]
        
        # Compute PSD
        f0, p0 = sp_signal.welch(raw_before.get_data(picks=ch_idx).flatten(),
                                  raw_before.info['sfreq'])
        f1, p1 = sp_signal.welch(raw_after.get_data(picks=ch_idx).flatten(),
                                  raw_after.info['sfreq'])
        
        # Line noise power
        line_bin = np.argmin(np.abs(f0 - line_freq))
        metrics[f'{ch_name}_line_reduction_db'] = (
            10 * np.log10(p1[line_bin] / p0[line_bin])
        )
        
        # Broadband power preservation
        bb_mask = (f0 >= 1) & (f0 <= 40) & ~(np.abs(f0 - line_freq) < 2)
        bb_before = np.mean(p0[bb_mask])
        bb_after = np.mean(p1[bb_mask])
        metrics[f'{ch_name}_broadband_change_pct'] = (
            (bb_after - bb_before) / bb_before * 100
        )
    
    return metrics
```

---

### 6.2 SSD (Source Separation Denoising)

**Description:** Denoising Source Separation (DSS) finds spatial filters that maximize the ratio of "signal of interest" to total power. Unlike ICA, it uses a bias function to guide separation (e.g., trial reproducibility, frequency band).

**When to Use:**
- Enhancing evoked responses (trial-locked activity)
- Extracting specific frequency bands (e.g., alpha)
- When you have a clear signal model

#### Installation

```bash
pip install mne-denoise
```

#### Production Pipeline Code

```python
"""
SSD / DSS - Source Separation Denoising
Enhances signals of interest using biased source separation.
"""
import mne
from mne_denoise.dss import DSS, AverageBias, BandpassBias

# -------------------------------------------------------------------------
# Load Epoched Data
# -------------------------------------------------------------------------
epochs = mne.read_epochs('epochs-epo.fif', preload=True)

# -------------------------------------------------------------------------
# Method 1: DSS for Evoked Response Enhancement
# -------------------------------------------------------------------------
# Finds components maximally reproducible across trials
dss = DSS(bias=AverageBias(), n_components=5)
dss.fit(epochs)

# Extract source time courses
sources = dss.transform(epochs)

# Reconstruct denoised sensor data
denoised_epochs = dss.transform(epochs, return_type="epochs")

# -------------------------------------------------------------------------
# Method 2: DSS for Frequency Band Extraction (e.g., Alpha)
# -------------------------------------------------------------------------
bias = BandpassBias(
    sfreq=epochs.info['sfreq'],
    freq=10,           # Center frequency
    bandwidth=4,       # +/- 4 Hz = 6-14 Hz band
)

dss_alpha = DSS(bias=bias, n_components=3)
alpha_sources = dss_alpha.fit_transform(epochs)

# -------------------------------------------------------------------------
# Method 3: SSD with Custom Bias
# -------------------------------------------------------------------------
from mne_denoise.dss import EpochBias

# Bias towards a specific time window (e.g., P300)
bias_window = EpochBias(
    tmin=0.3, tmax=0.6,
    sfreq=epochs.info['sfreq'],
)

dss_p300 = DSS(bias=bias_window, n_components=2)
dss_p300.fit(epochs)
p300_sources = dss_p300.transform(epochs)
```

---

### 6.3 FIR Filtering (`mne.filter`)

**Description:** MNE-Python provides high-quality FIR filtering with automatic filter design. Essential preprocessing step before most artifact cleaning methods.

#### Production Pipeline Code

```python
"""
FIR Filtering - Production Best Practices
MNE-Python's automatic filter design with sanity checks.
"""
import mne
import numpy as np
import matplotlib.pyplot as plt

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
SFREQ = 500
HP_FREQ = 0.5       # High-pass cutoff (Hz) - remove slow drifts
LP_FREQ = 100       # Low-pass cutoff (Hz) - remove high-freq noise
NOTCH_FREQ = 50     # Line noise frequency
FILTER_LENGTH = 'auto'

# -------------------------------------------------------------------------
# Load Data
# -------------------------------------------------------------------------
raw = mne.io.read_raw_fif('recording_raw.fif', preload=True)

# -------------------------------------------------------------------------
# Method 1: Standard Bandpass Filter (most common)
# -------------------------------------------------------------------------
raw_bp = raw.copy().filter(
    l_freq=HP_FREQ,
    h_freq=LP_FREQ,
    picks='eeg',
    filter_length=FILTER_LENGTH,
    l_trans_bandwidth='auto',
    h_trans_bandwidth='auto',
    phase='zero',          # Zero-phase (non-causal) filtering
    fir_window='hamming',
    fir_design='firwin',
    verbose=True,
)

# -------------------------------------------------------------------------
# Method 2: High-pass Only (before ICA - CRITICAL)
# -------------------------------------------------------------------------
# ICA requires high-pass at >= 1 Hz to avoid capturing slow drifts as ICs
raw_hp = raw.copy().filter(
    l_freq=1.0,            # 1 Hz for ICA (0.5 Hz minimum)
    h_freq=None,
    picks='eeg',
    filter_length='auto',
    l_trans_bandwidth='auto',
    phase='zero',
    fir_design='firwin',
)

# -------------------------------------------------------------------------
# Method 3: Notch Filter (for line noise)
# -------------------------------------------------------------------------
raw_notch = raw.copy().notch_filter(
    freqs=[50, 100, 150],  # Line freq + harmonics
    picks='eeg',
    filter_length='auto',
    phase='zero',
    verbose=True,
)

# -------------------------------------------------------------------------
# Method 4: Complete Filter Chain
# -------------------------------------------------------------------------
def apply_filter_chain(raw, hp=0.5, lp=100, notch=50, notch_harmonics=3):
    """Apply complete filter chain with proper ordering.
    
    Order: notch -> high-pass -> low-pass
    """
    raw_filt = raw.copy()
    
    # Step 1: Notch filter line noise
    freqs = [notch * h for h in range(1, notch_harmonics + 1)
             if notch * h < raw.info['sfreq'] / 2]
    raw_filt.notch_filter(freqs=freqs, picks='eeg', phase='zero')
    
    # Step 2: Bandpass
    raw_filt.filter(l_freq=hp, h_freq=lp, picks='eeg', phase='zero')
    
    return raw_filt

# -------------------------------------------------------------------------
# Filter Visualization and Validation
# -------------------------------------------------------------------------
def visualize_filter(raw_orig, raw_filt, duration=10, picks=None):
    """Visualize filter effects on selected channels."""
    if picks is None:
        picks = mne.pick_types(raw_orig.info, eeg=True)[:5]
    
    fig, axes = plt.subplots(len(picks), 2, figsize=(14, 3*len(picks)))
    
    for i, ch_idx in enumerate(picks):
        ch_name = raw_orig.ch_names[ch_idx]
        
        # Time series
        orig_data = raw_orig.get_data(picks=ch_idx, tmin=100, tmax=100+duration)[0]
        filt_data = raw_filt.get_data(picks=ch_idx, tmin=100, tmax=100+duration)[0]
        times = np.linspace(0, duration, len(orig_data))
        
        axes[i, 0].plot(times, orig_data * 1e6, label='Original', alpha=0.7)
        axes[i, 0].plot(times, filt_data * 1e6, label='Filtered', alpha=0.7)
        axes[i, 0].set_ylabel(f'{ch_name} (uV)')
        axes[i, 0].legend()
        if i == 0:
            axes[i, 0].set_title('Time Domain')
        
        # Frequency domain
        psd_orig = raw_orig.compute_psd(picks=ch_idx, fmin=0.1, fmax=150)
        psd_filt = raw_filt.compute_psd(picks=ch_idx, fmin=0.1, fmax=150)
        
        axes[i, 1].semilogy(psd_orig.freqs, psd_orig.get_data()[0], 
                            label='Original', alpha=0.7)
        axes[i, 1].semilogy(psd_filt.freqs, psd_filt.get_data()[0],
                            label='Filtered', alpha=0.7)
        axes[i, 1].set_xlabel('Frequency (Hz)')
        if i == 0:
            axes[i, 1].set_title('Frequency Domain')
        axes[i, 1].legend()
    
    plt.tight_layout()
    plt.savefig('filter_comparison.png', dpi=150)
    plt.show()

# Usage
# visualize_filter(raw, raw_bp)

# -------------------------------------------------------------------------
# Filter Parameter Guide
# -------------------------------------------------------------------------
FILTER_PRESETS = {
    'ica_preprocessing': {'hp': 1.0, 'lp': None, 'notch': 50},
    'standard_analysis': {'hp': 0.1, 'lp': 100, 'notch': 50},
    'erp_analysis': {'hp': 0.1, 'lp': 30, 'notch': 50},
    'time_frequency': {'hp': 0.5, 'lp': None, 'notch': 50},
    'sleep_eeg': {'hp': 0.3, 'lp': 30, 'notch': 50},
    'bci_rt': {'hp': 1.0, 'lp': 40, 'notch': 50},
}
```

---

## 7. Quality Control Framework

### 7.1 Comprehensive QC Pipeline

```python
"""
Comprehensive QC Pipeline for EEG Artifact Cleaning
Validates every step of the cleaning process.
"""
import mne
import numpy as np
from scipy import stats, signal as sp_signal
import json

class EEGCleaningQC:
    """Quality control framework for EEG artifact cleaning pipelines."""
    
    def __init__(self, raw_original, subject_id='unknown'):
        self.raw_orig = raw_original.copy()
        self.subject_id = subject_id
        self.metrics = {'subject_id': subject_id}
        self.steps = []
        
    def record_step(self, name, raw_after):
        """Record metrics after a processing step."""
        step_metrics = self.compute_basic_metrics(raw_after)
        step_metrics['step_name'] = name
        step_metrics['n_times'] = raw_after.n_times
        self.steps.append(step_metrics)
        self.metrics[f'step_{name}'] = step_metrics
        
    def compute_basic_metrics(self, raw):
        """Compute basic signal quality metrics."""
        picks = mne.pick_types(raw.info, eeg=True)
        data = raw.get_data(picks=picks)
        
        return {
            'mean_amplitude_uv': float(np.mean(np.abs(data)) * 1e6),
            'std_amplitude_uv': float(np.std(data) * 1e6),
            'max_amplitude_uv': float(np.max(np.abs(data)) * 1e6),
            'variance': float(np.var(data)),
            'kurtosis': float(stats.kurtosis(data.flatten())),
            'n_channels': len(picks),
            'n_bads': len(raw.info['bads']),
        }
    
    def compute_snr(self, raw, signal_band=(8, 13), noise_band=(20, 40)):
        """Compute signal-to-noise ratio in frequency domain."""
        picks = mne.pick_types(raw.info, eeg=True)
        data = raw.get_data(picks=picks)
        sfreq = raw.info['sfreq']
        
        snrs = []
        for ch_data in data:
            f, psd = sp_signal.welch(ch_data, sfreq)
            
            sig_mask = (f >= signal_band[0]) & (f <= signal_band[1])
            noise_mask = (f >= noise_band[0]) & (f <= noise_band[1])
            
            signal_power = np.mean(psd[sig_mask])
            noise_power = np.mean(psd[noise_mask])
            
            if noise_power > 0:
                snrs.append(10 * np.log10(signal_power / noise_power))
        
        return {
            'mean_snr_db': float(np.mean(snrs)),
            'min_snr_db': float(np.min(snrs)),
            'max_snr_db': float(np.max(snrs)),
        }
    
    def compute_line_noise(self, raw, line_freq=50):
        """Measure residual line noise power."""
        picks = mne.pick_types(raw.info, eeg=True)
        data = raw.get_data(picks=picks)
        sfreq = raw.info['sfreq']
        
        line_powers = []
        for ch_data in data:
            f, psd = sp_signal.welch(ch_data, sfreq, nperseg=min(4096, len(ch_data)))
            
            # Find line frequency bin
            line_idx = np.argmin(np.abs(f - line_freq))
            # Broadband nearby
            bb_mask = (f >= line_freq - 5) & (f <= line_freq + 5) & (np.abs(f - line_freq) > 1)
            
            line_power = psd[line_idx]
            bb_power = np.mean(psd[bb_mask]) if np.any(bb_mask) else 1e-10
            
            line_powers.append(10 * np.log10(line_power / bb_power))
        
        return {
            f'line_noise_{line_freq}hz_db': float(np.mean(line_powers)),
            'max_line_noise_db': float(np.max(line_powers)),
        }
    
    def compute_ica_metrics(self, ica, labels=None):
        """Compute ICA-specific quality metrics."""
        metrics = {
            'n_components': ica.n_components_,
            'n_excluded': len(ica.exclude),
            'exclusion_rate': len(ica.exclude) / ica.n_components_ if ica.n_components_ > 0 else 0,
        }
        
        if labels is not None:
            label_counts = {}
            for label in labels['labels']:
                label_counts[label] = label_counts.get(label, 0) + 1
            metrics['component_labels'] = label_counts
        
        return metrics
    
    def compare_before_after(self, raw_after):
        """Compare original vs cleaned data."""
        picks = mne.pick_types(self.raw_orig.info, eeg=True)
        orig_data = self.raw_orig.get_data(picks=picks)
        after_data = raw_after.get_data(picks=picks)
        
        return {
            'variance_reduction_db': float(
                10 * np.log10(np.var(after_data) / np.var(orig_data))
            ),
            'mean_correlation': float(
                np.mean([np.corrcoef(orig_data[ch], after_data[ch])[0, 1]
                         for ch in range(len(picks))])
            ),
            'max_abs_change_uv': float(
                np.max(np.abs(after_data - orig_data)) * 1e6
            ),
        }
    
    def generate_report(self, output_file='qc_report.json'):
        """Generate JSON QC report."""
        report = {
            'subject_id': self.subject_id,
            'processing_steps': self.steps,
            'overall_metrics': self.metrics,
            'recommendations': self._generate_recommendations(),
        }
        
        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"QC report saved to {output_file}")
        return report
    
    def _generate_recommendations(self):
        """Generate data quality recommendations."""
        recs = []
        
        for step in self.steps:
            if step.get('n_bads', 0) / step.get('n_channels', 1) > 0.3:
                recs.append(f"{step['step_name']}: High bad channel rate")
            
            if step.get('std_amplitude_uv', 0) > 100:
                recs.append(f"{step['step_name']}: High amplitude variability")
        
        return recs if recs else ['No issues detected']


# -------------------------------------------------------------------------
# Usage Example
# -------------------------------------------------------------------------
def run_full_qc(raw_original, raw_cleaned, ica=None, labels=None,
                subject_id='subject_01'):
    """Run complete QC on cleaned data."""
    qc = EEGCleaningQC(raw_original, subject_id)
    
    # Record original
    qc.record_step('original', raw_original)
    
    # Record cleaned
    qc.record_step('cleaned', raw_cleaned)
    
    # SNR
    qc.metrics['snr'] = qc.compute_snr(raw_cleaned)
    
    # Line noise
    qc.metrics['line_noise'] = qc.compute_line_noise(raw_cleaned)
    
    # ICA metrics
    if ica is not None:
        qc.metrics['ica'] = qc.compute_ica_metrics(ica, labels)
    
    # Before/after comparison
    qc.metrics['comparison'] = qc.compare_before_after(raw_cleaned)
    
    # Report
    report = qc.generate_report(f'{subject_id}_qc_report.json')
    return report
```

---

## 8. Complete Production Pipeline

### 8.1 Master Pipeline (All-in-One)

```python
"""
Complete EEG Artifact Cleaning Production Pipeline
Integrates all methods: PyPREP, ICA+ICLabel, ASR, autoreject
"""
import mne
import numpy as np
import json
from pathlib import Path

from pyprep.prep_pipeline import PrepPipeline
from pyprep.find_noisy_channels import NoisyChannels
from mne.preprocessing import ICA
from mne_icalabel import label_components
from meegkit.asr import ASR
from autoreject import AutoReject, get_rejection_threshold


class EEGArtifactCleaner:
    """Production-grade EEG artifact cleaning pipeline."""
    
    def __init__(self, config=None):
        """Initialize with configuration.
        
        Parameters
        ----------
        config : dict
            Pipeline configuration parameters
        """
        self.config = config or self._default_config()
        self.qc_log = {}
        
    def _default_config(self):
        return {
            # Filtering
            'highpass': 0.5,
            'lowpass': 100,
            'notch_freq': 50,
            
            # PyPREP
            'prep_ransac': True,
            'prep_random_state': 42,
            
            # ICA
            'ica_method': 'infomax',
            'ica_n_components': None,
            'ica_random_state': 42,
            
            # ICLabel
            'iclabel_keep': ['brain', 'other'],
            
            # ASR
            'asr_cutoff': 5,
            'asr_calibration': 'auto',
            'asr_calibration_duration': 30,
            
            # autoreject
            'autoreject_method': 'local',
            'autoreject_n_interpolate': [4, 8, 16],
            
            # Epoching
            'epoch_tmin': -0.2,
            'epoch_tmax': 1.0,
            'epoch_baseline': (-0.2, 0),
        }
    
    def run(self, raw, events=None, event_id=None, output_dir='./output'):
        """Run complete cleaning pipeline.
        
        Parameters
        ----------
        raw : mne.io.Raw
            Raw EEG data
        events : np.ndarray
            Events array (optional)
        event_id : dict
            Event ID mapping (optional)
        output_dir : str
            Output directory
        
        Returns
        -------
        dict : Processing results and QC metrics
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        cfg = self.config
        results = {'steps': []}
        
        # =====================================================================
        # Step 0: Load and validate
        # =====================================================================
        raw.load_data()
        
        # Set montage if missing
        if raw.get_montage() is None:
            montage = mne.channels.make_standard_montage('standard_1020')
            raw.set_montage(montage, match_case=False)
        
        n_channels = len(mne.pick_types(raw.info, eeg=True))
        print(f"Loaded: {n_channels} channels, {raw.n_times} samples")
        
        # =====================================================================
        # Step 1: Notch filter line noise
        # =====================================================================
        print("\n[Step 1] Notch filtering...")
        raw_notch = raw.copy().notch_filter(
            freqs=[cfg['notch_freq'], cfg['notch_freq']*2],
            picks='eeg',
            phase='zero',
        )
        results['steps'].append('notch_filter')
        
        # =====================================================================
        # Step 2: Bad channel detection with PyPREP
        # =====================================================================
        print("\n[Step 2] Bad channel detection (PyPREP)...")
        
        prep_params = {
            "ref_chs": "eeg",
            "reref_chs": "eeg", 
            "line_freqs": [cfg['notch_freq']],
        }
        
        prep = PrepPipeline(
            raw_notch,
            prep_params,
            raw_notch.get_montage(),
            ransac=cfg['prep_ransac'],
            random_state=cfg['prep_random_state'],
        )
        prep.fit()
        
        raw_prep = prep.raw
        bad_channels = prep.noisy_channels_original
        still_noisy = prep.still_noisy_channels
        
        self.qc_log['bad_channels'] = {
            'n_detected': len(bad_channels),
            'channels': bad_channels,
            'still_noisy_after_prep': still_noisy,
        }
        print(f"  Detected {len(bad_channels)} bad channels")
        results['steps'].append('pyprep')
        
        # =====================================================================
        # Step 3: High-pass filter (for ICA)
        # =====================================================================
        print("\n[Step 3] High-pass filtering...")
        raw_hp = raw_prep.copy().filter(
            l_freq=cfg['highpass'],
            h_freq=None,
            picks='eeg',
            phase='zero',
        )
        results['steps'].append('highpass_filter')
        
        # =====================================================================
        # Step 4: Average reference (required for ICLabel)
        # =====================================================================
        print("\n[Step 4] Average reference...")
        raw_ref, _ = mne.set_eeg_reference(raw_hp, ref_channels='average', copy=True)
        results['steps'].append('average_reference')
        
        # =====================================================================
        # Step 5: ICA decomposition
        # =====================================================================
        print("\n[Step 5] ICA decomposition...")
        ica = ICA(
            n_components=cfg['ica_n_components'],
            method=cfg['ica_method'],
            random_state=cfg['ica_random_state'],
            fit_params=dict(extended=True),
            max_iter='auto',
        )
        ica.fit(raw_ref)
        print(f"  Fitted {ica.n_components_} components")
        results['steps'].append('ica')
        
        # =====================================================================
        # Step 6: Automated IC labeling with ICLabel
        # =====================================================================
        print("\n[Step 6] IC labeling (ICLabel)...")
        labels = label_components(raw_ref, ica, method='iclabel')
        
        ica.exclude = [i for i, label in enumerate(labels['labels'])
                       if label not in cfg['iclabel_keep']]
        
        self.qc_log['ica'] = {
            'n_components': ica.n_components_,
            'n_excluded': len(ica.exclude),
            'excluded_labels': [labels['labels'][i] for i in ica.exclude],
            'exclusion_rate': len(ica.exclude) / ica.n_components_,
        }
        print(f"  Excluded {len(ica.exclude)} components: "
              f"{self.qc_log['ica']['excluded_labels']}")
        results['steps'].append('icalabel')
        
        # Apply ICA to reference data
        raw_ica = ica.apply(raw_ref.copy())
        
        # =====================================================================
        # Step 7: ASR for remaining transient artifacts
        # =====================================================================
        print("\n[Step 7] ASR...")
        asr = ASR(
            sfreq=raw_ica.info['sfreq'],
            cutoff=cfg['asr_cutoff'],
            method='euclid',
        )
        
        # Calibration
        if cfg['asr_calibration'] == 'auto':
            from meegkit.asr import clean_windows
            _, mask = clean_windows(
                raw_ica.get_data(picks='eeg'),
                raw_ica.info['sfreq'],
            )
            clean_idx = np.where(mask[0])[0]
            calib_data = raw_ica.get_data(picks='eeg')[:, clean_idx[:int(cfg['asr_calibration_duration'] * raw_ica.info['sfreq'])]]
        else:
            calib_samples = int(cfg['asr_calibration_duration'] * raw_ica.info['sfreq'])
            calib_data = raw_ica.get_data(picks='eeg')[:, :calib_samples]
        
        asr.fit(calib_data)
        asr_cleaned = asr.transform(raw_ica.get_data(picks='eeg'))
        
        raw_asr = raw_ica.copy()
        raw_asr._data[mne.pick_types(raw_ica.info, eeg=True)] = asr_cleaned
        
        self.qc_log['asr'] = {
            'cutoff': cfg['asr_cutoff'],
            'calibration_samples': calib_data.shape[1],
        }
        print(f"  ASR applied with cutoff={cfg['asr_cutoff']}")
        results['steps'].append('asr')
        
        # =====================================================================
        # Step 8: Low-pass filter
        # =====================================================================
        print("\n[Step 8] Low-pass filtering...")
        raw_lp = raw_asr.copy().filter(
            l_freq=None,
            h_freq=cfg['lowpass'],
            picks='eeg',
            phase='zero',
        )
        results['steps'].append('lowpass_filter')
        
        # =====================================================================
        # Step 9: Epoch and autoreject
        # =====================================================================
        epochs_clean = None
        if events is not None and event_id is not None:
            print("\n[Step 9] Epoching and autoreject...")
            
            epochs = mne.Epochs(
                raw_lp,
                events,
                event_id=event_id,
                tmin=cfg['epoch_tmin'],
                tmax=cfg['epoch_tmax'],
                baseline=cfg['epoch_baseline'],
                preload=True,
                reject=None,
            )
            
            if cfg['autoreject_method'] == 'local':
                ar = AutoReject(
                    n_interpolate=cfg['autoreject_n_interpolate'],
                    random_state=42,
                    n_jobs=-1,
                )
                epochs_clean, log = ar.fit_transform(epochs, return_log=True)
                
                self.qc_log['autoreject'] = {
                    'n_epochs_original': len(epochs),
                    'n_epochs_clean': len(epochs_clean),
                    'rejection_rate': 1 - len(epochs_clean) / len(epochs),
                    'method': 'local',
                }
            else:
                reject_thresh = get_rejection_threshold(epochs, random_state=42)
                epochs_clean = epochs.drop_bad(reject=reject_thresh)
                
                self.qc_log['autoreject'] = {
                    'n_epochs_original': len(epochs),
                    'n_epochs_clean': len(epochs_clean),
                    'rejection_rate': 1 - len(epochs_clean) / len(epochs),
                    'method': 'global',
                    'threshold': {k: float(v) for k, v in reject_thresh.items()},
                }
            
            print(f"  Kept {len(epochs_clean)}/{len(epochs)} epochs")
            results['steps'].append('autoreject')
        
        # =====================================================================
        # Step 10: Save outputs
        # =====================================================================
        print("\n[Step 10] Saving outputs...")
        
        raw_lp.save(output_dir / 'cleaned_raw.fif', overwrite=True)
        ica.save(output_dir / 'ica.fif', overwrite=True)
        
        if epochs_clean is not None:
            epochs_clean.save(output_dir / 'cleaned_epochs-epo.fif', overwrite=True)
        
        with open(output_dir / 'qc_log.json', 'w') as f:
            json.dump(self.qc_log, f, indent=2)
        
        results['output_dir'] = str(output_dir)
        results['qc'] = self.qc_log
        
        print("\n=== Pipeline Complete ===")
        print(f"Output: {output_dir}")
        print(f"QC: {json.dumps(self.qc_log, indent=2)}")
        
        return {
            'raw_clean': raw_lp,
            'epochs_clean': epochs_clean,
            'ica': ica,
            'results': results,
        }


# -------------------------------------------------------------------------
# Run Pipeline
# -------------------------------------------------------------------------
if __name__ == '__main__':
    # Example usage
    # raw = mne.io.read_raw_fif('subject_01_raw.fif', preload=True)
    # events, event_id = mne.events_from_annotations(raw)
    # 
    # cleaner = EEGArtifactCleaner()
    # output = cleaner.run(raw, events, event_id, output_dir='./cleaned')
    pass
```

---

### 8.2 Before/After Comparison Code

```python
"""
Before/After Comparison Utilities for EEG Cleaning
"""
import mne
import numpy as np
import matplotlib.pyplot as plt
from scipy import signal as sp_signal


def compare_psd(raw_before, raw_after, fmin=1, fmax=100, 
                picks='eeg', save_path=None):
    """Compare power spectral density before and after cleaning."""
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    for ax, raw, title in [(axes[0], raw_before, 'Before'),
                            (axes[1], raw_after, 'After')]:
        psd = raw.compute_psd(picks=picks, fmin=fmin, fmax=fmax)
        psd.plot(axes=ax, show=False, average=True)
        ax.set_title(f'{title} Cleaning')
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150)
    plt.show()
    return fig


def compare_time_series(raw_before, raw_after, duration=10, 
                        start=100, n_channels=5, save_path=None):
    """Compare time series before and after cleaning."""
    picks = mne.pick_types(raw_before.info, eeg=True)[:n_channels]
    
    fig, axes = plt.subplots(n_channels, 2, figsize=(14, 2*n_channels))
    if n_channels == 1:
        axes = axes.reshape(1, -1)
    
    for i, ch_idx in enumerate(picks):
        ch_name = raw_before.ch_names[ch_idx]
        
        for j, (raw, title) in enumerate([(raw_before, 'Before'),
                                           (raw_after, 'After')]):
            data = raw.get_data(picks=ch_idx, tmin=start, tmax=start+duration)[0]
            times = np.linspace(0, duration, len(data))
            
            axes[i, j].plot(times, data * 1e6, linewidth=0.5)
            axes[i, j].set_ylabel(f'{ch_name} (uV)')
            if i == 0:
                axes[i, j].set_title(title)
            if i == n_channels - 1:
                axes[i, j].set_xlabel('Time (s)')
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150)
    plt.show()
    return fig


def compare_erp(epochs_before, epochs_after, picks=None, 
                event_name='target', save_path=None):
    """Compare event-related potentials before and after cleaning."""
    if picks is None:
        picks = mne.pick_types(epochs_before.info, eeg=True)[:5]
    
    evoked_before = epochs_before[event_name].average(picks=picks)
    evoked_after = epochs_after[event_name].average(picks=picks)
    
    fig, axes = plt.subplots(len(picks), 1, figsize=(10, 2*len(picks)))
    if len(picks) == 1:
        axes = [axes]
    
    for i, ch_name in enumerate([evoked_before.ch_names[p] for p in range(len(picks))]):
        times = evoked_before.times
        axes[i].plot(times, evoked_before.data[i] * 1e6, 
                     label='Before', alpha=0.7)
        axes[i].plot(times, evoked_after.data[i] * 1e6,
                     label='After', alpha=0.7)
        axes[i].set_ylabel(f'{ch_name} (uV)')
        axes[i].legend()
        axes[i].axvline(0, color='k', linestyle='--', alpha=0.3)
    
    axes[-1].set_xlabel('Time (s)')
    plt.suptitle(f'ERP Comparison - {event_name}', y=1.02)
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150)
    plt.show()
    return fig


def compute_cleaning_metrics(raw_before, raw_after, epochs_before=None, 
                              epochs_after=None):
    """Compute comprehensive cleaning metrics."""
    metrics = {}
    
    picks = mne.pick_types(raw_before.info, eeg=True)
    data_before = raw_before.get_data(picks=picks)
    data_after = raw_after.get_data(picks=picks)
    
    # Amplitude metrics
    metrics['amplitude'] = {
        'before_mean_uv': float(np.mean(np.abs(data_before)) * 1e6),
        'after_mean_uv': float(np.mean(np.abs(data_after)) * 1e6),
        'before_max_uv': float(np.max(np.abs(data_before)) * 1e6),
        'after_max_uv': float(np.max(np.abs(data_after)) * 1e6),
    }
    
    # Variance
    metrics['variance'] = {
        'before': float(np.var(data_before)),
        'after': float(np.var(data_after)),
        'reduction_db': float(10 * np.log10(np.var(data_after) / np.var(data_before))),
    }
    
    # Correlation (signal preservation)
    correlations = []
    for ch in range(len(picks)):
        c = np.corrcoef(data_before[ch], data_after[ch])[0, 1]
        correlations.append(c)
    metrics['signal_preservation'] = {
        'mean_correlation': float(np.mean(correlations)),
        'min_correlation': float(np.min(correlations)),
    }
    
    # Frequency metrics
    sfreq = raw_before.info['sfreq']
    f, psd_before = sp_signal.welch(data_before.mean(axis=0), sfreq)
    f, psd_after = sp_signal.welch(data_after.mean(axis=0), sfreq)
    
    # Alpha power (8-13 Hz)
    alpha_mask = (f >= 8) & (f <= 13)
    metrics['alpha_power'] = {
        'before': float(np.mean(psd_before[alpha_mask])),
        'after': float(np.mean(psd_after[alpha_mask])),
    }
    
    # Epoch-level metrics
    if epochs_before is not None and epochs_after is not None:
        metrics['epochs'] = {
            'before_count': len(epochs_before),
            'after_count': len(epochs_after),
            'retention_rate': len(epochs_after) / len(epochs_before),
        }
    
    return metrics


def generate_comparison_report(raw_before, raw_after, output_dir,
                                epochs_before=None, epochs_after=None,
                                event_name='target'):
    """Generate a full before/after comparison report."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # PSD comparison
    compare_psd(raw_before, raw_after, 
                save_path=output_dir / 'psd_comparison.png')
    
    # Time series comparison
    compare_time_series(raw_before, raw_after,
                        save_path=output_dir / 'timeseries_comparison.png')
    
    # ERP comparison
    if epochs_before is not None and epochs_after is not None:
        compare_erp(epochs_before, epochs_after, event_name=event_name,
                    save_path=output_dir / 'erp_comparison.png')
    
    # Metrics
    metrics = compute_cleaning_metrics(
        raw_before, raw_after, epochs_before, epochs_after
    )
    
    with open(output_dir / 'cleaning_metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)
    
    print(f"Comparison report saved to {output_dir}")
    return metrics
```

---

## 9. References

### Key Papers

1. **PyPREP / PREP Pipeline:**
   - Bigdely-Shamlo, N., Mullen, T., Kothe, C., Su, K. M., & Robbins, K. A. (2015). The PREP pipeline: standardized preprocessing for large-scale EEG analysis. *Frontiers in Neuroinformatics*, 9, 16.

2. **autoreject:**
   - Jas, M., Engemann, D. A., Bekhti, Y., Raimondo, F., & Gramfort, A. (2017). Autoreject: Automated artifact rejection for MEG and EEG data. *NeuroImage*, 159, 417-429.

3. **ICA / ICLabel:**
   - Makeig, S., Bell, A. J., Jung, T. P., & Sejnowski, T. J. (1996). Independent component analysis of electroencephalographic data. *Advances in Neural Information Processing Systems*, 145-151.
   - Pion-Tonachini, L., Kreutz-Delgado, K., & Makeig, S. (2019). ICLabel: An automated electroencephalographic independent component classifier, dataset, and website. *NeuroImage*, 198, 181-197.

4. **ASR:**
   - Mullen, T. R., Kothe, C. A. E., Chi, Y. M., Ojeda, A., Kerth, T., Makeig, S., ... & Cauwenberghs, G. (2015). Real-time neuroimaging using wearable EEG. *IEEE Transactions on Biomedical Engineering*, 62(11), 2553-2567.
   - Blum, S., Jacobsen, N., Bleichner, M. G., & Debener, S. (2019). A Riemannian modification of artifact subspace reconstruction for EEG artifact handling. *Frontiers in Human Neuroscience*, 13, 141.

5. **FASTER:**
   - Nolan, H., Whelan, R., & Reilly, R. B. (2010). FASTER: Fully automated statistical thresholding for EEG artifact rejection. *Journal of Neuroscience Methods*, 192(1), 152-162.

6. **ZapLine:**
   - de Cheveigne, A. (2020). ZapLine: a simple and effective method to remove power line artifacts. *NeuroImage*, 1, 1-13.
   - Klug, M., & Kloosterman, N. A. (2022). Zapline-plus: A Zapline extension for automatic and adaptive removal of frequency-specific noise artifacts in M/EEG. *Human Brain Mapping*, 1-16.

7. **Maxwell Filtering:**
   - Taulu, S., & Kajola, M. (2005). Presentation of electromagnetic multichannel data: The signal space separation method. *Journal of Applied Physics*, 97(12), 124905.

8. **DSS:**
   - de Cheveigne, A., & Parra, L. C. (2014). Joint decorrelation, a versatile tool for multichannel data analysis. *NeuroImage*, 98, 487-505.

### Software Documentation

- [MNE-Python Documentation](https://mne.tools/stable/index.html)
- [PyPREP Documentation](https://pyprep.readthedocs.io/)
- [autoreject Documentation](https://autoreject.github.io/)
- [mne-icalabel Documentation](https://mne.tools/mne-icalabel/)
- [meegkit Documentation](https://nbara.github.io/python-meegkit/)
- [mne-denoise Documentation](https://github.com/mne-tools/mne-denoise)

---

> **End of Guide**  
> For questions or contributions, refer to the individual package documentation.
