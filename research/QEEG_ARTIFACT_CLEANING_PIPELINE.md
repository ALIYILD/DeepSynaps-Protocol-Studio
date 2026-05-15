# QEEG Artifact Cleaning Pipeline -- Comprehensive Technical Reference

> **Research compilation covering ICA, ASR, SSP, bad-channel detection, blink/muscle/line-noise removal, motion artifacts, automated epoch rejection, and QC metrics for clinical EEG.**
> 
> *Last updated: 2025*

---

## Table of Contents

1. [Overview](#1-overview)
2. [ICA -- Independent Component Analysis](#2-ica-independent-component-analysis)
3. [ASR -- Artifact Subspace Reconstruction](#3-asr-artifact-subspace-reconstruction)
4. [SSP -- Signal Space Projection](#4-ssp-signal-space-projection)
5. [Bad Channel Detection](#5-bad-channel-detection)
6. [Blink Removal (EOG Regression)](#6-blink-removal-eog-regression)
7. [Muscle Artifact Detection](#7-muscle-artifact-detection)
8. [Line-Noise Removal](#8-line-noise-removal)
9. [Motion Artifact Detection & Removal](#9-motion-artifact-detection--removal)
10. [Automated Epoch Rejection](#10-automated-epoch-rejection)
11. [QC Metrics](#11-qc-metrics)
12. [Recommended Pipeline](#12-recommended-pipeline)
13. [References](#13-references)

---

## 1. Overview

EEG signals are extremely small (order of microvolts) and easily contaminated by a wide variety of artifacts. A systematic artifact-cleaning pipeline is essential for clinical and research applications. This document surveys the state-of-the-art methods for artifact detection and removal, providing evidence-based recommendations for building a robust preprocessing pipeline.

### Artifact Taxonomy

| Category | Source | Frequency Range | Typical Amplitude |
|----------|--------|----------------|-------------------|
| **Ocular (blink)** | Eyelid movement, eye rotation | 0-10 Hz (slow transient) | 50-200 uV |
| **Ocular (saccade)** | Eye movement | 0-10 Hz | 20-150 uV |
| **Cardiac** | ECG signal | Broad, 1-40 Hz | 5-50 uV |
| **Muscle (EMG)** | Facial/jaw/neck muscles | 20-200 Hz (broadband) | 10-100 uV |
| **Line noise** | Power line interference | 50/60 Hz (+harmonics) | Variable |
| **Motion** | Electrode movement, cable sway | Broad, low-frequency | Up to several mV |
| **Channel noise** | Bad electrode, high impedance | Broad/burst | Variable |

### Key Design Principles

1. **Preserve brain signal**: Every cleaning step risks removing neural activity of interest.
2. **Order matters**: The sequence of preprocessing steps can interact (e.g., filtering before referencing).
3. **Validate outputs**: Always quantify signal quality before and after cleaning.
4. **Document everything**: Preprocessing pipelines must be fully reproducible.

---

## 2. ICA -- Independent Component Analysis

### 2.1 Principle

ICA decomposes multi-channel EEG data into a set of statistically independent source components. Each component represents either a brain source or an artifact source. Artifact components are identified by their spatial topography, temporal profile, and spectral characteristics, then zeroed out, and the signal is reconstructed from the remaining components.

### 2.2 Algorithms

#### Infomax ICA
- **Description**: Maximizes the mutual information between component outputs; standard algorithm in EEGLAB.
- **Strengths**: Well-validated, widely used, implemented in EEGLAB and MNE.
- **Limitations**: May fail to converge on datasets with severe artifacts; assumes super-Gaussian distributions.
- **Reference**: Makeig et al. (1996); Bell & Sejnowski (1995)

#### FastICA
- **Description**: Uses a fixed-point iteration scheme to maximize non-Gaussianity (kurtosis or negentropy).
- **Strengths**: Faster than Infomax for many datasets; deterministic results.
- **Limitations**: Sensitive to initialization; may converge to local optima; less robust with low-density (< 32 channel) recordings.
- **Reference**: Hyvarinen & Oja (2000)

#### AMICA (Adaptive Mixture ICA)
- **Description**: Uses a mixture of ICA models, allowing for different data modes (e.g., rest vs. task).
- **Strengths**: Outperforms InfoMax for muscle artifact removal; converges more reliably; models non-stationarity via mixture components.
- **Limitations**: Computationally expensive; requires more data; parameter tuning (number of mixture components, learning rates).
- **Evidence**: In a study of 29 datasets, AMICA converged in all cases while InfoMax converged in only 23. AMICA showed superior improvement rates across 5 of 7 exercises tested (Leutheuser et al., 2013).
- **Recommended settings**: 1 ICA model, 3 mixture components, initial learning rate 1.0 (Newton), 0.1 (natural gradient), log-likelihood-based time point rejection.
- **Reference**: Palmer et al. (2008); Leutheuser et al. (2013)

#### Extended-Infomax / Picard
- **Description**: Extended Infomax uses a sub-Gaussian/super-Gaussian switching mechanism. Picard is a fast quasi-Newton algorithm.
- **Strengths**: Picard has been shown equivalent to extended-Infomax but is computationally much faster, making it suitable for automated pipelines.
- **Reference**: Ablin, Cardoso & Gramfort (2018)

### 2.3 Component Classification

Automated classifiers for identifying artifact ICs:

| Classifier | Type | Detects | Implementation |
|------------|------|---------|----------------|
| **ADJUST** | Rule-based | Blinks, saccades, generic discontinuities | EEGLAB plugin |
| **MARA** | Machine learning | Blinks, muscle, heart, line noise | EEGLAB plugin |
| **ICLabel** | Deep learning | Brain, muscle, eye, heart, line noise, channel noise, other | EEGLAB plugin |
| **FASTER** | Statistical | Blinks, muscle, bad channels, trends | EEGLAB/MATLAB |

**ICLabel** (Pion-Tonachini et al., 2019) is currently the most widely used, classifying ICs into 7 categories with deep convolutional networks trained on a large corpus of manually labeled components.

### 2.4 ICA-Based Pipeline Considerations

- **Minimum channels**: At least 20-32 channels recommended for reliable decomposition.
- **Data length**: Minimum 1-2 minutes for stable decomposition; more is better.
- **High-pass filter**: Apply 1-2 Hz high-pass before ICA to remove slow drifts that can dominate components.
- **After ICA**: Optionally apply low-pass filter after reconstruction if high-frequency noise remains.

### 2.5 Pros and Cons

| Strengths | Limitations |
|-----------|-------------|
| Preserves overlapping brain/artifact frequencies | Requires sufficient channels and data |
| Removes artifacts without a reference signal | Component identification can be subjective |
| Handles stereotyped artifacts well (blinks, cardiac) | Computationally demanding for online use |
| Well-validated with decades of use | May miss non-stereotyped/non-stationary artifacts |
| Multiple automated classifiers available | Struggles with continuous low-level muscle tension |

---

## 3. ASR -- Artifact Subspace Reconstruction

### 3.1 Principle

ASR is an adaptive, online-capable method that removes high-amplitude artifacts from EEG by reconstructing the underlying brain signal. It works by:

1. **Calibration**: Learning statistics (robust covariance, mixing matrix, direction-dependent thresholds) from a clean calibration window (typically 30s-2min of clean data).
2. **Processing**: Sliding a short window across the data, performing PCA within each window, detecting artifact components that exceed calibrated thresholds, and reconstructing them using the clean calibration statistics.

**Key insight**: Any two EEG channels are almost always correlated. Therefore, artifact subspace components can be estimated from the non-artifact subspace using the correlation structure learned from clean data.

### 3.2 Mathematical Foundation

- **Robust covariance**: Estimated using the geometric (L1) median of sample covariance matrices.
- **Mixing matrix M**: Computed from the robust covariance such that M*M^T = U.
- **Threshold operator**: T = mu + k*sigma, where k is the cutoff parameter (typically 5-20).
- **Artifact detection**: A short-window PCA component is rejected if its standard deviation exceeds the threshold along its direction.
- **Reconstruction**: Rejected components are replaced using the clean mixing matrix and the non-artifact eigenvectors.

### 3.3 Parameters

| Parameter | Description | Typical Range | Notes |
|-----------|-------------|---------------|-------|
| **cutoff** | Threshold multiplier (k) | 5-30 | Lower = more aggressive cleaning. Optimal range: 20-30 for balancing artifact removal and signal preservation (Chang et al., 2020). |
| **window length** | PCA window size | 0.3-0.5 s | Default 0.5s (500ms). Shorter handles non-stationary artifacts better. |
| **stepsize** | Window advance step | 16-32 samples | Smaller = smoother reconstruction but slower. |
| **calibration data** | Clean reference data | 30s-2min | Can use clean_windows to auto-select from recording. |

### 3.4 Variants

#### Riemannian ASR (rASR)
- Uses Riemannian geometry for covariance matrix processing instead of Euclidean geometry.
- SPD matrices processed using geodesic distances and Principal Geodesic Analysis (PGA) instead of PCA.
- Shows favorable results on sensitivity (eye-blink reduction), specificity (VEP preservation), and efficiency (Blum et al., 2019).
- Recommended for offline and online correction, especially for mobile/walking EEG.

#### ASR-DBSCAN / ASR-GEV (2025)
- Uses density-based clustering (DBSCAN) or Generalized Extreme Value distribution for calibration data identification.
- Addresses the problem of low-quality or no calibration data in original ASR.
- Found 42% (DBSCAN) and 24% (GEV) usable calibration data vs. 9% for original ASR on juggling task data.
- Subsequent ICA showed brain ICs accounting for 30% (DBSCAN) and 29% (GEV) vs. 26% (original) of original data variance (Kirsh et al., 2025).

### 3.5 Pros and Cons

| Strengths | Limitations |
|-----------|-------------|
| Fully automatic, no manual IC inspection | Requires clean calibration data |
| Online-capable, low latency | May remove some brain signal if threshold too aggressive |
| Handles non-stereotyped, non-stationary artifacts | Assumes data is already high-pass filtered |
| Very short processing delay (~500ms) | Requires full-rank data (no CAR before ASR) |
| Removes more eye and muscle than brain components | Less effective on continuous EMG |
| Improves quality of subsequent ICA decomposition | Parameter choice is data-dependent |

### 3.6 Implementation

- **EEGLAB**: `clean_rawdata` plugin (`clean_asr`)
- **Python (MNE)**: `mne.preprocessing.clean_asr` or `asrpy` package
- **MATLAB**: EEGLAB `clean_rawdata` plugin

---

## 4. SSP -- Signal Space Projection

### 4.1 Principle

SSP removes noise from EEG/MEG signals by projecting the data onto a lower-dimensional subspace orthogonal to the noise direction. It calculates the average spatial pattern of the artifact across sensors and constructs a projector that removes this pattern from the data.

### 4.2 Process

1. **Identify artifact epochs**: Extract data segments containing the artifact (e.g., ECG R-peaks, EOG blinks).
2. **Compute spatial pattern**: Average the signal across all artifact epochs to get the artifact topography.
3. **Compute projector**: Perform SVD on the artifact covariance matrix to get the projection vectors.
4. **Apply projection**: Subtract the artifact subspace from the continuous data.

### 4.3 Common Applications

| Artifact Type | Method | Projectors |
|---------------|--------|------------|
| **ECG (heartbeat)** | `compute_proj_ecg` | 2-3 projectors |
| **EOG (eye)** | `compute_proj_eog` | 2-3 projectors |
| **Environmental noise** | `compute_proj_raw` | Variable |

### 4.4 Pros and Cons

| Strengths | Limitations |
|-----------|-------------|
| Computationally efficient | Requires identification of artifact events |
| No manual IC classification needed | Removes a fixed subspace -- may remove brain activity |
| Good for stationary noise | Less effective for non-stationary artifacts |
| Well-integrated in MNE-Python | Number of projectors must be chosen carefully |
| Excellent for environmental noise in MEG | Not ideal for blink removal in low-density EEG |

### 4.5 SSP vs. ICA

| Feature | SSP | ICA |
|---------|-----|-----|
| Artifact model | Fixed spatial projector | Time-varying independent components |
| Computational cost | Low | High |
| Manual inspection | Usually not needed | Often recommended |
| Handles non-stationary artifacts | No | Partially |
| Online capability | Yes (pre-computed projectors) | Limited |
| Best for | ECG, environmental noise | Blinks, muscle, complex artifacts |

### 4.6 Implementation

- **MNE-Python**: `mne.preprocessing.compute_proj_ecg`, `mne.preprocessing.compute_proj_eog`

---

## 5. Bad Channel Detection

### 5.1 Methods Overview

Bad channels are electrodes with poor signal quality due to high impedance, electrode displacement, or hardware issues. They must be identified and either repaired or excluded before referencing and analysis.

### 5.2 Detection Criteria

#### 5.2.1 Flatline Detection
- **Criterion**: Channel has near-zero variance over a time window.
- **Threshold**: Standard deviation below a threshold (e.g., 1e-15) for a minimum duration.
- **Implementation**: `clean_flatlines` in EEGLAB clean_rawdata.

#### 5.2.2 Correlation-Based Detection
- **Criterion**: Channel has abnormally low correlation with other channels.
- **Process**: Compute channel-by-channel correlation matrix; flag channels whose median correlation with neighbors falls below a threshold.
- **Rationale**: EEG channels should be highly correlated with nearby channels due to volume conduction.
- **Threshold**: Typically flag channels with correlation < 0.4-0.8 (data-dependent).

#### 5.2.3 Variance-Based Detection
- **Criterion**: Channel has abnormally high or low variance compared to other channels.
- **Process**: Compute the standard deviation for each channel; flag channels exceeding a z-score threshold (e.g., |z| > 3-5).
- **Handles**: High-impedance channels (high noise = high variance) and flat channels (zero variance).

#### 5.2.4 High-Frequency Noise Detection
- **Criterion**: Channel has excessive high-frequency (> 50 Hz) power relative to lower frequencies.
- **Process**: Compute the ratio of HF power (> 50 Hz) to LF power (1-50 Hz); flag channels with z-scores > threshold.
- **Rationale**: High-impedance channels and disconnected electrodes show increased high-frequency noise.

#### 5.2.5 RANSAC (Random Sample Consensus)
- **Description**: Predicts each channel's signal from a random subset of other channels using interpolation; compares prediction to actual signal.
- **Process**:
  1. Randomly select subsets of clean channels as predictors.
  2. Use spherical spline interpolation to predict the target channel's signal.
  3. Compute correlation between predicted and actual signal.
  4. Repeat many times; flag channels with consistently low prediction correlation.
- **Strengths**: Can detect bad channels that other methods miss; robust to outliers.
- **Limitations**: Computationally expensive; requires sufficient good channels.
- **Threshold**: Flag channels with median RANSAC correlation < 0.75-0.85.

### 5.3 PREP Pipeline Bad Channel Detection

The PREP pipeline (Bigdely-Shamlo et al., 2015) implements a comprehensive multi-criterion approach:

1. **Line noise removal** (Spectrum interpolation, not notch filtering)
2. **Robust average referencing** using only good channels
3. **Iterative bad channel detection** using:
   - Bad-by-correlation (low correlation with neighbors)
   - Bad-by-RANSAC (poor interpolation predictability)
   - Bad-by-HF-noise (excessive high-frequency content)
4. **Interpolation** of bad channels using spherical spline
5. **Re-referencing** to robust average reference

### 5.4 Summary Table

| Method | Detects | Sensitivity | Speed |
|--------|---------|-------------|-------|
| Flatline | Disconnected electrodes | High | Fast |
| Correlation | Drifted, uncorrelated channels | Medium | Fast |
| Variance | Noisy/quiet channels | Medium | Fast |
| HF noise | High-impedance channels | High | Fast |
| RANSAC | Subtle bad channels | High | Slow |

### 5.5 Implementation

- **Python (PyPREP)**: `pyprep.NoisyChannels` class (implements all PREP methods)
- **EEGLAB**: `clean_rawdata` plugin (`clean_channels`)
- **MNE-Python**: Custom combination of functions or `autoreject` package

---

## 6. Blink Removal (EOG Regression)

### 6.1 Methods

#### 6.1.1 EOG Regression (Linear)
- **Principle**: Model the EOG artifact in EEG channels as a linear combination of vertical (VEOG) and horizontal (HEOG) EOG signals.
- **Equation**: `Contaminated_EEG_j = Pure_EEG_j + a_j * VEOG + b_j * HEOG`
- **Process**: Compute regression coefficients between EEG and EOG channels for blink periods; subtract the fitted EOG signal from EEG.
- **Strengths**: Simple, fast, preserves brain signal in non-EOG frequency bands.
- **Limitations**: Requires dedicated EOG channels; assumes linear artifact propagation; may under/over-correct.
- **Reference**: Gratton et al. (1983)

#### 6.1.2 ICA-Based Blink Removal
- **Principle**: Decompose EEG with ICA; identify blink components by their frontal topography and step-like temporal profile; remove and reconstruct.
- **Identification criteria**:
  - Topography: Frontal pole concentration (Fp1/Fp2/Fpz)
  - Time course: Large, slow deflections matching blink timing
  - Spectrum: Dominant power below 5 Hz
  - EOG correlation: High correlation with VEOG channel
- **Strengths**: Handles non-linear propagation; works without dedicated EOG channels.
- **Limitations**: Requires sufficient channels; manual or semi-automated IC labeling.

#### 6.1.3 SSP-Based Blink Removal
- **Principle**: Compute spatial projector from blink-locked epochs and remove the blink subspace.
- **Strengths**: Fast, automatic event detection.
- **Limitations**: Removes a fixed spatial pattern; may affect frontal brain activity.

#### 6.1.4 Comparison

| Method | Need EOG channels | Speed | Brain preservation | Online? |
|--------|-------------------|-------|-------------------|---------|
| EOG Regression | Yes | Fast | Good | Yes |
| ICA | No | Slow | Excellent | No |
| SSP | No | Medium | Fair | With pre-computed projectors |

### 6.2 Recommendation

For research/clinical pipelines with sufficient channels, **ICA with automated blink component detection** (ICLabel or ADJUST) is preferred. For simple setups with dedicated EOG channels, **EOG regression** is fast and effective. **SSP** is a good middle ground for MEG or when ICA is too computationally expensive.

---

## 7. Muscle Artifact Detection

### 7.1 Characteristics of EMG Artifacts

Muscle artifacts in EEG have distinctive signatures:

| Feature | EMG Signature |
|---------|--------------|
| **Scalp topography** | Concentrated at temporal/frontal edges (near muscles) |
| **Frequency spectrum** | Broadband high-frequency power (20-200 Hz) without clear oscillatory peaks |
| **Time course** | Brief, irregular bursts rather than sustained rhythmic activity |
| **Source localization** | Superficial sources outside the brain |

### 7.2 Detection Methods

#### 7.2.1 High-Frequency Power Threshold
- **Method**: Compute power in high-frequency bands (e.g., 40-80 Hz, 80-120 Hz); flag segments/windows where power exceeds a threshold.
- **Threshold**: z-score > 3-5 relative to the clean reference, or fixed power threshold.
- **Limitations**: High-frequency brain activity (gamma) may be conflated with EMG.

#### 7.2.2 ICA-Based Muscle Detection
- **Method**: After ICA decomposition, identify muscle components by:
  - Broadband high-frequency spectrum (> 20 Hz)
  - Peripheral scalp topography (temporal/frontal)
  - Brief burst-like temporal profile
- **Classifiers**: ICLabel, MARA, ADJUST all include muscle component categories.

#### 7.2.3 CCA (Canonical Correlation Analysis)
- **Principle**: EMG has lower autocorrelation than brain oscillations. CCA separates signals based on this difference.
- **Strengths**: Good for tonic (continuous) muscle tension; more automatic than ICA.
- **Limitations**: Less established; may remove some brain signal.

#### 7.2.4 FASTER Muscle Detection
- **Method**: Identifies EMG components in ICA using statistical thresholds on kurtosis, spectrum, and topography.
- **Performance**: > 90% sensitivity and specificity for EMG artifact detection (Nolan et al., 2010).

### 7.3 Removal Methods

| Method | Best For | Trade-off |
|--------|----------|-----------|
| Band-pass filtering (low-pass) | Quick first-pass removal | Removes all high-frequency brain activity too |
| ICA component removal | Intermittent EMG bursts | Preserves overlapping frequencies; needs channels |
| CCA | Continuous low-level EMG | May remove some brain signal |
| ASR preprocessing | General artifact removal | Non-specific; may reduce EMG power |
| Adaptive filtering | Real-time with EMG reference | Requires additional sensors |

### 7.4 AMICA for Muscle Artifact Removal

AMICA has been specifically recommended for muscle artifact reduction:
- Converged reliably where InfoMax failed (29/29 vs. 23/29 datasets)
- Showed superior improvement rates across exercises
- Recommended settings: 1 ICA model, 3 mixture components (Leutheuser et al., 2013)

---

## 8. Line-Noise Removal

### 8.1 Methods Comparison

#### 8.1.1 Notch Filter (Butterworth)
- **Description**: Band-stop filter centered at 50/60 Hz with narrow stopband.
- **Strengths**: Effectively attenuates line noise; widely available.
- **Limitations**: 
  - Severe time-domain distortions (ringing, Gibbs effect)
  - Artificial oscillations near notch frequency
  - Can corrupt ERP/phase/connectivity measures
  - Sharp frequency response = poor temporal precision
- **Verdict**: **Not recommended** for ERP research. Use only as last resort.

#### 8.1.2 DFT (Discrete Fourier Transform) Filter
- **Description**: Removes specific frequency bins in the Fourier domain.
- **Strengths**: Precise frequency targeting; less distortion than notch.
- **Limitations**: Still introduces ringing; struggles with non-stationary line noise; single frequency removal may be insufficient.

#### 8.1.3 CleanLine
- **Description**: EEGLAB plugin that uses multi-taper spectrum estimation to fit and subtract sinusoidal line noise components.
- **Strengths**: Less distortion than notch for stationary line noise.
- **Limitations**: **Fails** with large, non-stationary line noise; poor performance with abrupt on/offsets.

#### 8.1.4 Spectrum Interpolation (Recommended)
- **Description**: Replaces Fourier coefficients in the line noise band with interpolated values from neighboring frequencies.
- **Process**: 
  1. Compute FFT of the signal
  2. Replace amplitudes at line noise frequencies +/- bandwidth with interpolated values
  3. Reconstruct time-domain signal via inverse FFT
- **Strengths**:
  - **Smoothest frequency spectrum** -- minimizes Gibbs phenomenon
  - Minimal time-domain distortion (RMSE nearly zero for impulse signals)
  - Handles non-stationary line noise well
  - Outperforms DFT and CleanLine on non-stationary noise
  - Comparable to notch in attenuation but with far less distortion
- **Limitations**: Slightly more complex implementation.
- **Recommended bandwidth**: Replace 47-53 Hz for 50 Hz line noise (or 57-63 Hz for 60 Hz).
- **Reference**: Mewett et al. (2004); applied to EEG by (Hassan et al., see PMC6456018)

### 8.2 Comparison Summary

| Method | Line Noise Removal | Time-Domain Distortion | Non-Stationary Noise | Recommendation |
|--------|-------------------|----------------------|---------------------|----------------|
| Notch (Butterworth) | Good | **Severe** (ringing) | Fair | Avoid for ERP |
| DFT Filter | Good | Moderate | Poor | Not preferred |
| CleanLine | Fair (stationary) | Low | **Poor** (fails) | Not preferred |
| Spectrum Interpolation | Good | **Minimal** | Good | **Recommended** |

### 8.3 Implementation

- **Python (MNE)**: `mne.filter.notch_filter` (specify method) or `spectrum_interpolation` custom
- **EEGLAB**: PREP plugin (uses spectrum interpolation by default)
- **MATLAB**: PREP pipeline, `cleanLineNoise` function

---

## 9. Motion Artifact Detection & Removal

### 9.1 Sources of Motion Artifacts

Motion artifacts in EEG arise from:
1. **Electrode-skin movement**: Micro-movements changing the electrode impedance
2. **Cable movement**: Wire deformation generating electromagnetic artifacts
3. **Cap slippage**: Movement of the cap relative to the scalp
4. **Body movement**: Jaw, neck, shoulder movements generating EMG

Motion artifact amplitudes can be **orders of magnitude larger** than neural signals (up to mV range).

### 9.2 Detection Methods

#### 9.2.1 Accelerometer/Gyroscope-Based Detection
- **Hardware**: Inertial Measurement Units (IMUs) on each electrode or the cap.
- **Process**: Record motion data alongside EEG; correlate with EEG signal.
- **Findings**: 
  - Gyroscope is more sensitive to sudden motion artifacts.
  - Accelerometer (integrated to velocity) better captures slow movements.
  - Both can be used as reference signals for adaptive filtering.
- **Reference**: Mijovic et al. (2010); Chowdhury et al. (2014)

#### 9.2.2 High-Amplitude Detection
- Flag segments where signal amplitude exceeds a threshold (e.g., > 100-200 uV).
- Simple but effective for large-motion segments.

#### 9.2.3 ASR for Motion Artifacts
- ASR handles motion-related artifacts well, especially high-amplitude transients.
- ASR-DBSCAN and ASR-GEV variants specifically designed for high-frequency motion artifacts during intense motor tasks (Kirsh et al., 2025).

### 9.3 Removal Methods

#### 9.3.1 Adaptive Filtering (with IMU reference)
- **Two-stage NLMS filter**:
  1. First stage: Remove motion artifact from signal electrode using its IMU.
  2. Second stage: Remove remaining artifact from reference electrode IMU.
- **Performance**: Effective when SNR is moderate; can degrade high-SNR signals.
- **Trade-off**: Doubles power consumption; increases data rate by ~10x.

#### 9.3.2 ICA-Based Removal
- ICA can separate motion artifacts when they are spatially distinct.
- Less effective for cable movement artifacts that affect all channels.

#### 9.3.3 ASR Preprocessing
- ASR is particularly well-suited for motion artifacts due to its non-stationary artifact handling.
- ASR-DBSCAN found 42% usable data for calibration vs. 9% for original ASR on juggling data.

#### 9.3.4 Reference Layer Adaptive Subtraction (RLAS)
- Uses a reference electrode layer under an insulating layer.
- Measures the motion artifact at a non-scalp location.
- Subtraction of the reference signal attenuates motion artifacts.
- Attenuation of ~7-30 dB depending on cap configuration.

---

## 10. Automated Epoch Rejection

### 10.1 FASTER (Fully Automated Statistical Thresholding for EEG artifact Rejection)

FASTER (Nolan et al., 2010) is a comprehensive automated pipeline that:
1. Detects bad channels
2. Extracts epochs
3. Detects and removes artifacts using ICA
4. Aggregates subject data
5. Removes subjects with unacceptably contaminated data

#### 10.1.1 Artifact Detection Criteria

| Criterion | Target Artifact | Method |
|-----------|----------------|--------|
| **Amplitude threshold** | Large transients, pops | Peak-to-peak amplitude z-score |
| **Kurtosis** | Impulsive/bursty outliers | Normalized 4th central moment |
| **Joint probability** | Unlikely data points | Multi-channel probability |
| **Spectral thresholding** | Frequency-specific artifacts | Power in artifact frequency bands |
| **Trend detection** | Linear drifts | Slope of linear fit |

#### 10.1.2 Performance

- > 90% sensitivity and specificity for: contaminated channels, eye movement, EMG artifacts, linear trends, white noise
- > 60% sensitivity and specificity for contaminated epochs (vs. 0.15% for SCADS)
- P3 ERP amplitude did not differ significantly from supervised processing
- Works effectively on 128-, 64-, and 32-channel arrays

#### 10.1.3 Epoch Rejection Metrics

| Metric | Formula | Threshold | Purpose |
|--------|---------|-----------|---------|
| Amplitude | Peak-to-peak per epoch | z > 3-5 | Catch large transients |
| Variance | Epoch variance | z > 3-5 | Catch noisy epochs |
| Kurtosis | 4th moment | |z| > threshold | Catch impulsive artifacts |
| Joint probability | Multi-channel probability | p < threshold | Catch unlikely data patterns |

### 10.2 Other Epoch Rejection Methods

#### 10.2.1 Autoreject (Jas et al., 2017)
- Automatically finds optimal peak-to-peak thresholds per channel.
- Uses Bayesian optimization to balance rejection rate and data retention.
- Available in Python as `autoreject` package.

#### 10.2.2 FAAR (Fast Automatic Artifact Rejection)
- Computes an epoch-level Signal Quality Index (SQI) from five features:
  1. Band-limited spectral magnitude (8-32 Hz)
  2. RMS amplitude
  3. Maximum temporal gradient
  4. Zero-crossing rate
  5. Kurtosis
- Uses adaptive thresholding from SQI distribution.
- Designed for real-time BCI applications.

### 10.3 Channel-Level vs. Epoch-Level Rejection

- **Channel-level rejection**: Mark bad channels for interpolation (preferred -- preserves trials).
- **Epoch-level rejection**: Remove entire epochs with too many bad channels.
- **Hybrid approach**: Interpolate bad channels when possible; reject epochs with too many bad channels to interpolate.

---

## 11. QC Metrics

### 11.1 Signal Quality Index (SQI) Framework

A comprehensive SQI system for EEG should include:

#### 11.1.1 Statistical SQIs
| Metric | Description | Target Range |
|--------|-------------|--------------|
| **Kurtosis** | 4th central moment; detects impulsive noise | Near 3 (Gaussian) |
| **Skewness** | 3rd central moment; detects asymmetry | Near 0 (symmetric) |
| **Entropy** | Spectral entropy; randomness measure | Application-dependent |
| **Variance** | Signal power; detects flat/noisy channels | Consistent across channels |

#### 11.1.2 Spectral SQIs
| Metric | Description | Application |
|--------|-------------|-------------|
| **Alpha-to-Theta ratio** | Power(8-12 Hz) / Power(4-8 Hz) | Drowsiness, sedation |
| **HF/LF noise ratio** | Power(>50 Hz) / Power(1-50 Hz) | Channel quality (PREP) |
| **Spectral flatness** | Ratio of geometric/arithmetic mean of spectrum | Detects broadband noise |
| **Spectral entropy** | Shannon entropy of power spectrum | Signal complexity |

#### 11.1.3 Channel-Quality SQIs
| Metric | Description |
|--------|-------------|
| **Inter-channel correlation** | Median correlation with neighbors |
| **RANSAC correlation** | Interpolation prediction accuracy |
| **HF noise z-score** | Relative high-frequency power |
| **Amplitude range** | Peak-to-peak amplitude |

#### 11.1.4 Pipeline-Level QC Metrics
| Metric | Description |
|--------|-------------|
| **Channels retained** | Percentage of channels kept after cleaning |
| **Epochs retained** | Percentage of epochs kept after rejection |
| **ICA components removed** | Number/type of rejected ICs |
| **ASR calibration data** | Percentage of data used for ASR calibration |
| **SNR improvement** | Ratio of signal power to noise power before/after |
| **ERP variance** | Baseline variance (lower = cleaner data) |

### 11.2 SER and ARR Metrics (for Pipeline Comparison)

- **SER (Signal-to-Error Ratio)**: Measures preservation of clean EEG signal.
  - Higher SER = less distortion of clean signal.
- **ARR (Artifact-to-Residue Ratio)**: Measures artifact suppression.
  - Higher ARR = more effective artifact removal.
- **Optimal pipeline**: Balances high SER and high ARR simultaneously.
- **Reference**: Used in RELAX pipeline evaluation (Bailey et al., 2023)

### 11.3 PREP Reporting

The PREP pipeline generates:
- Per-dataset PDF report with channel quality maps
- Visualizations of bad channel windows
- Correlation, RANSAC, and HF-noise criterion plots
- Time course of reference signal differences
- Collection-level summary statistics

### 11.4 Practical QC Checklist

```
Before Preprocessing:
 [ ] Check sampling rate and channel labels
 [ ] Verify electrode positions/montage
 [ ] Check impedance values if available
 [ ] Inspect raw signal for gross artifacts
 [ ] Verify event markers

After Each Step:
 [ ] After bad channel detection: Review channel quality maps
 [ ] After referencing: Check reference signal stability
 [ ] After line noise removal: Inspect 50/60 Hz residual
 [ ] After ICA: Review component classifications
 [ ] After ASR: Check calibration data percentage
 [ ] After epoching: Review rejection rate per condition

Final QC:
 [ ] Total data retention rate (epochs/channels)
 [ ] Signal-to-noise ratio improvement
 [ ] ERP baseline variance
 [ ] Alpha peak detection rate
 [ ] Cross-subject consistency
```

---

## 12. Recommended Pipeline

### 12.1 Standard Clinical/Research Pipeline

This pipeline is recommended for multi-channel EEG (32+ channels) in clinical or research settings.

```
STEP 1: Initial Quality Check
  - Verify sampling rate, channel labels, event markers
  - Visually inspect raw data
  - Check impedance values (if available)

STEP 2: High-Pass Filter
  - Cutoff: 0.5-1.0 Hz (FIR, zero-phase)
  - Purpose: Remove slow drifts
  - Note: Filter BEFORE re-referencing

STEP 3: Line Noise Removal
  - Method: Spectrum interpolation
  - Band: 47-53 Hz (50 Hz) or 57-63 Hz (60 Hz)
  - Include harmonics if needed (e.g., 97-103 Hz)
  - NOTE: Do NOT use notch filter for ERP data

STEP 4: Bad Channel Detection
  - Methods: Flatline + Correlation + Variance + HF noise + RANSAC
  - Tools: PyPREP NoisyChannels class
  - Output: List of bad channels + quality scores

STEP 5: Re-referencing
  - Method: Robust average reference (excluding bad channels)
  - Alternative: Linked mastoids for clinical reading
  - Tools: PREP pipeline or MNE set_eeg_reference

STEP 6: Bad Channel Interpolation
  - Method: Spherical spline interpolation
  - Only interpolate if < 10-15% channels are bad

STEP 7: ASR (Artifact Subspace Reconstruction)
  - Cutoff: 20-30 (optimal range per Chang et al., 2020)
  - Window: 0.5 s
  - Stepsize: 32 samples
  - Calibration: Use clean_windows to auto-select
  - Purpose: Remove transient/non-stationary artifacts

STEP 8: ICA Decomposition
  - Algorithm: Extended Infomax or Picard (faster)
  - Alternative: AMICA for challenging muscle artifacts
  - High-pass: Already done in Step 2 (1 Hz)
  - Components: Rank of data minus 1

STEP 9: ICA Component Classification
  - Classifier: ICLabel (recommended) or MARA
  - Review: Brain, Muscle, Eye, Heart, Line noise, Channel noise
  - Remove: Confirmed artifact components
  - Document: Which components and classifications

STEP 10: Low-Pass Filter (Optional)
  - Cutoff: 40-80 Hz depending on analysis
  - Purpose: Remove residual high-frequency noise

STEP 11: Epoching
  - Define epochs around events of interest
  - Baseline correction: Pre-stimulus window

STEP 12: Automated Epoch Rejection
  - Methods: Amplitude threshold + Kurtosis + Autoreject
  - Threshold: z > 3-5 for amplitude
  - Reject if > 10-20% channels bad in an epoch

STEP 13: Final QC
  - Compute SER and ARR
  - Check data retention rate
  - Verify alpha peak in eyes-closed conditions
  - Review ERP baseline variance
  - Generate QC report
```

### 12.2 Simplified Pipeline (Low-Density, < 32 channels)

For lower-density recordings where ICA may be less reliable:

```
STEP 1: High-pass filter (1 Hz)
STEP 2: Line noise removal (spectrum interpolation)
STEP 3: Bad channel detection (correlation + variance)
STEP 4: ASR cleaning (cutoff: 20)
STEP 5: EOG regression (if EOG channels available)
STEP 6: Low-pass filter (optional, 40 Hz)
STEP 7: Epoching + amplitude-based rejection
```

### 12.3 Mobile/Walking EEG Pipeline

For mobile brain-body imaging (MoBI) with high motion artifacts:

```
STEP 1: High-pass filter (0.5-1 Hz)
STEP 2: Bad channel detection (robust methods for motion)
STEP 3: ASR-DBSCAN or rASR (handles non-stationarity better)
STEP 4: ICA (if sufficient channels)
STEP 5: Component classification (focus on motion/muscle)
STEP 6: Epoch rejection (more lenient thresholds)
```

### 12.4 Key Parameter Reference Table

| Parameter | Standard Value | Range | Notes |
|-----------|---------------|-------|-------|
| High-pass filter | 1 Hz | 0.5-2 Hz | FIR, zero-phase |
| Low-pass filter | 40 Hz | 30-100 Hz | Task-dependent |
| Line noise bandwidth | 47-53 Hz | 45-55 Hz | Spectrum interpolation |
| ASR cutoff | 20-30 | 5-50 | 20-30 optimal per Chang et al. |
| ASR window | 0.5 s | 0.3-1.0 s | Shorter for non-stationary |
| Bad channel correlation threshold | 0.4-0.8 | 0.3-0.9 | Lower = more aggressive |
| RANSAC correlation threshold | 0.75-0.85 | 0.6-0.9 | Lower = more channels flagged |
| Epoch amplitude threshold | 100-200 uV | 50-500 uV | Or z > 3-5 |
| ICA minimum channels | 20-32 | | Below 20, ICA less reliable |
| ICA minimum data | 1-2 min | | More data = better decomposition |

### 12.5 Pipeline Selection Decision Tree

```
How many channels?
  < 20 channels:
    -> Simplified pipeline (ASR + EOG regression)
  20-64 channels:
    -> Standard pipeline (without or with ICA)
  > 64 channels:
    -> Full standard pipeline with ICA

Is the recording mobile/walking?
  Yes:
    -> Use rASR or ASR-DBSCAN
    -> Consider IMU-based adaptive filtering
    -> More lenient epoch rejection
  No (lab setting):
    -> Standard ASR is sufficient

Is the data for ERP analysis?
  Yes:
    -> Do NOT use notch filters
    -> Use spectrum interpolation for line noise
    -> Careful with high-pass (0.5-1 Hz max)
  No (power/connectivity):
    -> More flexible with filtering choices

Is there severe muscle artifact?
  Yes:
    -> Use AMICA instead of Infomax
    -> Consider CCA for tonic EMG
    -> May need high-frequency filtering
  No:
    -> Standard Infomax or Picard sufficient
```

---

## 13. References

### ICA Methods
1. Bell, A.J. & Sejnowski, T.J. (1995). An information-maximization approach to blind separation and blind deconvolution. *Neural Computation*, 7(6), 1129-1159.
2. Hyvarinen, A. & Oja, E. (2000). Independent component analysis: algorithms and applications. *Neural Networks*, 13(4-5), 411-430.
3. Palmer, J.A. et al. (2008). AMICA: Adaptive Mixture ICA. *SCCN Technical Report*.
4. Leutheuser, H. et al. (2013). Comparison of the AMICA and the InfoMax Algorithm for Muscle Artifact Rejection. *COT*.
5. Ablin, P., Cardoso, J.F. & Gramfort, A. (2018). Faster Independent Component Analysis by Preconditioning with Hessian Approximations. *IEEE TSP*.

### ASR Methods
6. Mullen, T. et al. (2015). Artifact Subspace Reconstruction (ASR). *SCCN Technical Report*.
7. Chang, C.Y. et al. (2020). Evaluation of ASR for Automatic Artifact Components Removal. *IEEE TBME*, 67(4).
8. Blum, S. et al. (2019). A Riemannian Modification of Artifact Subspace Reconstruction for EEG Artifact Handling. *Frontiers in Human Neuroscience*, 13, 141.
9. Kirsh et al. (2025). Juggler's ASR: Unpacking the principles of artifact subspace reconstruction for revision toward extreme MoBI. *Journal of Neuroscience Methods*.

### SSP Methods
10. MNE-Python documentation: Repairing artifacts with SSP. https://mne.tools/stable/auto_tutorials/preprocessing/50_artifact_correction_ssp.html

### Bad Channel Detection
11. Bigdely-Shamlo, N. et al. (2015). The PREP pipeline: standardized preprocessing for large-scale EEG analysis. *Frontiers in Neuroinformatics*, 9, 16.
12. PyPREP documentation: https://pyprep.readthedocs.io/

### Blink Removal
13. Gratton, G., Coles, M.G. & Donchin, E. (1983). A new method for off-line removal of ocular artifact. *Electroencephalography and Clinical Neurophysiology*, 55(4), 468-484.
14. Pion-Tonachini, L. et al. (2019). ICLabel: An automated electroencephalographic independent component classifier, dataset, and website. *NeuroImage*, 198, 181-197.

### Muscle Artifact
15. Mijovic, B. et al. (2010). Sources of EEG artifacts. *Journal of Neuroscience Methods*.
16. Neurosity guide: Muscle Artifact in EEG: Why It Happens, How to Fix It. https://neurosity.co/guides/muscle-artifact-eeg-why-how-fix

### Line Noise Removal
17. Mewett, D.T. et al. (2004). Removal of power line noise. *Methods of Information in Medicine*, 43.
18. (PMC6456018). Reducing power line noise in EEG and MEG data via spectrum interpolation. *Journal of Neuroscience Methods*.

### Motion Artifacts
19. Chowdhury, M.E.H. et al. (2014). Motion artifact removal in EEG using reference layer adaptive subtraction. *Physiological Measurement*.
20. (PMC8450177). Motion artefact removal in electroencephalography and related techniques. *Physiological Measurement*.
21. (PMC5929889). Exploring the origins of EEG motion artefacts during walking. *Physiological Measurement*.

### Epoch Rejection & Automated Pipelines
22. Nolan, H., Whelan, R. & Reilly, R.B. (2010). FASTER: Fully Automated Statistical Thresholding for EEG artifact Rejection. *Journal of Neuroscience Methods*, 192(1), 152-162.
23. Jas, M. et al. (2017). Autoreject: Automated artifact rejection for MEG and EEG data. *NeuroImage*, 159, 417-429.
24. Bailey, N.W. et al. (2023). RELAX: An open-source fully automated method for cleaning EEG/MEG data. *NeuroImage*.

### Pipeline Comparisons
25. (PMC12664388). EEG-cleanse: an automated pipeline for cleaning EEG during full-body interaction. *Frontiers in Neuroscience*.
26. RELAX-Jr: An Automated Pre-Processing Pipeline for Developmental EEG Recordings. *Human Brain Mapping*.
27. (PMC8962770). Independent Evaluation of HAPPE using Multi-Site EEG Data. *Frontiers in Integrative Neuroscience*.

### Quality Control
28. (PMC9692103). vital_sqi: A Python package for physiological signal quality control. *Physiological Measurement*.
29. (PMC12473706). Systematic Review of Techniques for Artifact Detection in EEG from Wearable Devices. *Sensors*.
30. Zhao, Z. & Zhang, Y. (2018). SQI quality evaluation mechanism of single-lead ECG signal based on simple heuristic fusion and fuzzy comprehensive evaluation. *Frontiers in Physiology*, 9, 727.

---

## Appendix A: Tool Implementations

| Tool | Language | Methods | URL |
|------|----------|---------|-----|
| **EEGLAB** | MATLAB | ICA, ASR, ADJUST, MARA, ICLabel, CleanLine | sccn.ucsd.edu/eeglab |
| **MNE-Python** | Python | ICA, SSP, ASR, filtering, epoching | mne.tools |
| **PyPREP** | Python | Bad channel detection, PREP pipeline | pyprep.readthedocs.io |
| **autoreject** | Python | Automated epoch rejection | autoreject.github.io |
| **asrpy** | Python | ASR implementation | github.com/DiGyt/asrpy |
| **RELAX** | MATLAB | Automated cleaning pipeline | github.com/nicole-bailey/RELAX |
| **HAPPE** | MATLAB | Automated cleaning (W-ICA based) | github.com/PINE-Lab/HAPPE |
| **Picard** | Python/C | Fast ICA algorithm | pierreablin.github.io/picard |
| **ICLabel** | MATLAB/EEGLAB | IC classification | github.com/sccn/ICLabel |
| **vital_sqi** | Python | Signal quality indices | github.com/meta00/vital_sqi |
| **FASTER** | MATLAB/EEGLAB | Automated epoch rejection | |

---

## Appendix B: Common Pitfalls

1. **Notch filter for ERP data**: Notch filters cause severe time-domain distortions. Always use spectrum interpolation instead.
2. **Filtering before referencing**: High-pass filtering before re-referencing can interact with referencing. Filter first, then reference.
3. **ASR before ICA**: Running ASR before ICA can improve ICA decomposition quality by reducing large-amplitude artifacts.
4. **Over-cleaning with HAPPE**: HAPPE's W-ICA step may remove substantial neural signal along with artifacts. Monitor SER metrics.
5. **Insufficient calibration data for ASR**: If ASR finds < 10% usable calibration data, results may be poor. Consider ASR-DBSCAN for noisy recordings.
6. **ICA with < 20 channels**: ICA becomes unreliable with very few channels. Use ASR + EOG regression instead.
7. **Ignoring harmonics**: Line noise has harmonics at 100, 150, 200 Hz (for 50 Hz). Remove them too.
8. **Over-aggressive ASR**: Cutoff < 5 can remove brain activity. Optimal range is 20-30.
9. **Bad channels in reference**: Including bad channels in the average reference corrupts all channels. Detect and exclude bad channels first.
10. **Not documenting preprocessing**: Every step must be documented for reproducibility. Generate QC reports.

---

*End of Document*
