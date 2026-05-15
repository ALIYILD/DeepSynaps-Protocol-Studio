# QEEG Source Localization: Methods, Comparison & Clinical Caveats

> **Research Domain**: EEG Inverse Problem Solutions | Brain Source Imaging | qEEG Source Localization  
> **Focus**: Comparative analysis of LORETA-family methods, beamforming, minimum norm estimates, dipole fitting, and head model considerations for clinical and research applications.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The EEG Inverse Problem](#2-the-eeg-inverse-problem)
3. [Method 1: LORETA / sLORETA / eLORETA Family](#3-method-1-loreta-sloreta-eloreta-family)
4. [Method 2: Beamforming (LCMV / DICS)](#4-method-2-beamforming-lcmv--dics)
5. [Method 3: Minimum Norm Estimates (MNE / dSPM)](#5-method-3-minimum-norm-estimates-mne--dspm)
6. [Method 4: Dipole Fitting (Equivalent Current Dipole)](#6-method-4-dipole-fitting-equivalent-current-dipole)
7. [Method 5: MRI-Informed vs. Template Head Models](#7-method-5-mri-informed-vs-template-head-models)
8. [Head Model Architecture: Boundary Element Models (BEM)](#8-head-model-architecture-boundary-element-models-bem)
9. [Comparative Summary: Top 5 Methods](#9-comparative-summary-top-5-methods)
10. [Critical Caveats for Clinical Practice](#10-critical-caveats-for-clinical-practice)
11. [Recommendations by Use Case](#11-recommendations-by-use-case)
12. [References](#12-references)

---

## 1. Executive Summary

EEG source localization solves the **inverse problem**: estimating the intracranial neural generators responsible for scalp-recorded electrical potentials. No unique solution exists -- the problem is mathematically ill-posed -- so all methods rely on constraints, assumptions, and regularization. This report surveys the five dominant methodological families used in clinical QEEG and research, documenting their theoretical foundations, practical strengths, and critical limitations.

### Top 5 Methods at a Glance

| Rank | Method | Category | Key Strength | Primary Caveat |
|------|--------|----------|-------------|----------------|
| 1 | **sLORETA / eLORETA** | Distributed (current density) | Zero theoretical localization error; standardized output; well-validated | Low spatial resolution; underestimates deep source amplitude |
| 2 | **LCMV Beamforming** | Spatial filter | High spatial resolution; good for correlated sources | Fails with correlated sources; requires careful regularization |
| 3 | **MNE / dSPM** | Distributed (minimum norm) | Good time-series output; stable; widely implemented | Bias toward superficial sources; spatial smearing |
| 4 | **Dipole Fitting (ECD)** | Parametric | Intuitive; clinically approved for epilepsy; fast | Single-source assumption; misses distributed activity |
| 5 | **DICS Beamforming** | Spatial filter (freq.) | Optimal for coherent source localization | Narrow frequency assumption; baseline comparison required |

---

## 2. The EEG Inverse Problem

### Forward vs. Inverse Problem

- **Forward Problem**: Given known sources (dipoles) inside the brain, compute the expected scalp potential distribution. This is well-posed and solvable using volume conduction models.
- **Inverse Problem**: Given measured scalp potentials, estimate the underlying source distribution. This is **ill-posed** -- infinitely many source configurations can produce the same scalp map.

### Why Regularization is Required

Because the inverse problem has no unique solution, all methods impose constraints:
- **Spatial constraints** (e.g., sources on cortical surface)
- **Mathematical regularization** (e.g., Tikhonov, minimum norm)
- **Physical priors** (e.g., smoothness, current density minimization)
- **Statistical normalization** (e.g., noise covariance weighting)

### Key Factors Affecting All Methods

1. **Head model accuracy** (geometry, tissue conductivities)
2. **Electrode count and placement** (19 vs. 64 vs. 256 channels)
3. **Signal-to-noise ratio** (artifact contamination)
4. **Source depth** (deep sources produce weaker, more blurred scalp fields)
5. **Temporal correlation between sources** (affects beamformers)

---

## 3. Method 1: LORETA / sLORETA / eLORETA Family

### 3.1 LORETA (Low Resolution Brain Electromagnetic Tomography)

**Origin**: Pascual-Marqui et al. (1994)  
**Principle**: Finds the 3D current density distribution with minimum Laplacian (maximum smoothness) that explains the scalp data.

**Mathematical Formulation**:
- Minimizes: F = ||Phi - K*J||^2 + alpha * ||Laplacian(J)||^2
- Enforces maximum smoothness via the Laplacian operator
- Sources restricted to cortical gray matter
- Uses standardized head model (MNI space) and electrode positions

**Limitations**:
- Low spatial resolution (hence "Low Resolution" in the name)
- Systematic localization bias (non-zero error)
- Tendency to smear deep sources toward superficial cortex
- Ratio of estimated source activity (max/min): ~850 (highly biased)

### 3.2 sLORETA (Standardized LORETA)

**Origin**: Pascual-Marqui (2002)  
**Principle**: Standardizes current density estimates by their estimated standard deviation, computed from the resolution matrix.

**Key Innovation**:
- Standardization uses the diagonal of the MNE resolution matrix: W_sLOR^2 = diag(R_MNE)
- Guarantees **zero localization error** for point sources in noise-free conditions
- Normalization cancels the depth bias inherent in minimum-norm solutions

**Performance**:
- Only sLORETA achieves exact, zero-error localization in noise-free simulations
- In noisy conditions, sLORETA has the lowest localization errors of all tested linear methods
- Estimated source activity ratio (max/min): ~30 (far more balanced than MNE's 850)
- Spatial spread ("blurring") is smaller than Dale's method

**Caveats**:
- Some sources (especially deep ones) are **underestimated** in amplitude
- Spatial resolution remains fundamentally limited
- Standardization changes units -- cannot compare raw amplitudes across methods
- At ~70 electrodes, approaches fMRI-level spatial accuracy for small localized sources

### 3.3 eLORETA (Exact LORETA)

**Origin**: Pascual-Marqui (2007)  
**Principle**: Iterative regularization method that extends sLORETA by simultaneously optimizing the lead field transformation and source amplitude.

**Key Innovation**:
- Genuine solution with **zero localization error** for single-dipole sources when the lead field is accurate
- Uses iterative optimization to handle inaccuracies in the forward model
- More robust to lead field errors than sLORETA

**Performance Comparison (sLORETA vs. eLORETA)**:
- Jatoi et al. (2014) compared both methods using ERP visual stimulus data
- Both methods localize primary visual cortex activation consistently
- eLORETA shows slightly tighter spatial concentration
- sLORETA has broader spatial spread but comparable peak localization

**Caveats**:
- Requires accurate lead field matrix for convergence
- If lead field is inaccurate, the objective function may not converge properly
- Computational cost higher than sLORETA due to iterative nature
- ReLORETA (Robust eLORETA) was developed to handle lead field inaccuracies via transformation matrix estimation

### Comparison of LORETA Variants

| Feature | LORETA | sLORETA | eLORETA |
|---------|--------|---------|---------|
| Localization Error | Systematic bias | Zero (noise-free) | Zero (lead field accurate) |
| Amplitude Estimation | Highly biased | Moderately underestimated | Better amplitude recovery |
| Spatial Spread | Very high | Medium | Medium-low |
| Deep Source Recovery | Poor | Improved | Improved |
| Computational Cost | Low | Low | Moderate |
| Clinical Usage | Historical | Current standard | Emerging standard |

---

## 4. Method 2: Beamforming (LCMV / DICS)

### 4.1 LCMV (Linearly Constrained Minimum Variance)

**Origin**: Van Veen et al. (1997)  
**Domain**: Time-domain  
**Principle**: Spatially adaptive filter that minimizes source variance at a given location subject to a unit-gain constraint.

**How it Works**:
1. The brain is divided into a 3D grid
2. At each grid point, an inverse filter is constructed
3. The filter **minimizes variance** (or source power) at that location
4. Subject to a **unit-gain constraint**: if a source has amplitude 1, the filter reconstructs amplitude 1
5. The filter suppresses signals from all other locations

**Key Assumption**: Sources in different brain regions are **NOT temporally correlated**. When this assumption is violated (e.g., bilateral auditory cortex), beamformer performance degrades.

**Strengths**:
- High spatial resolution compared to distributed methods
- Good signal-to-noise ratio
- Can reconstruct time courses at each source location
- Works well for focal sources with uncorrelated activity
- 66% computational reduction possible with accelerated algorithms (ALCMV) while maintaining accuracy

**Caveats**:
- **FAILS** when sources are temporally correlated (e.g., bilateral auditory responses)
- Requires careful regularization of the covariance matrix
- Can produce spurious sources if regularization is inadequate
- Spatial normalization needed for group analysis
- Channel count matters: more channels improve resolution

### 4.2 DICS (Dynamic Imaging of Coherent Sources)

**Origin**: Gross et al. (2001)  
**Domain**: Frequency-domain  
**Principle**: Optimal beamformer for localizing coherence between brain regions at specific frequencies.

**How it Works**:
1. Compute cross-spectral density (CSD) matrix in frequency bands of interest
2. Construct spatial filters that maximize coherence at each voxel
3. Uses multitaper spectral estimation for optimal frequency averaging

**Strengths**:
- Optimal for coherence and connectivity analysis
- Natural pairing with spectral EEG analysis (delta, theta, alpha, beta, gamma)
- Excellent for identifying networks oscillating at specific frequencies
- Produces 3D spatial maps of source power/coherence

**Caveats**:
- Narrow frequency assumption -- suboptimal for broadband signals
- Requires a **control/baseline condition** for contrast (critical for experimental design)
- Same correlated-source limitation as LCMV
- DICS filters computed for narrow frequency ranges are sub-optimal for extracting virtual electrode time-series (use LCMV for time-series)

### Beamformer Summary

| Aspect | LCMV | DICS |
|--------|------|------|
| Domain | Time | Frequency |
| Best For | Evoked responses, time-series | Oscillatory power, coherence |
| Unit-Gain Constraint | Yes | Yes |
| Correlated Source Handling | Fails | Fails |
| Virtual Electrode Output | Excellent | Sub-optimal |
| Multitaper Support | No | Yes |

---

## 5. Method 3: Minimum Norm Estimates (MNE / dSPM)

### 5.1 MNE (Minimum Norm Estimate)

**Origin**: Hamalainen & Ilmoniemi (1994)  
**Principle**: Among all possible source distributions explaining the data, select the one with minimum total current (L2 norm).

**Mathematical Formulation**:
- J_MNE = K^T * (K*K^T + lambda*C)^-1 * Phi
- Where K = lead field matrix, C = noise covariance, lambda = regularization parameter

**Characteristics**:
- **Favored for**: Evoked response analysis, tracking widespread activation over time
- Produces smooth, distributed source maps
- Resolution matrix is symmetric

**Critical Bias**: MNE is notorious for **misplacing deep sources onto the outermost cortex**. The minimum-norm constraint inherently favors superficial sources because they require less current to produce the same scalp potential.

### 5.2 dSPM (Dynamic Statistical Parametric Mapping)

**Origin**: Dale et al. (2000)  
**Principle**: Normalizes MNE current density estimates by the estimated noise at each source location.

**Mathematical Formulation**:
- W_dSPM^2 = diag(G_MNE * C * G_MNE^T)
- Normalizes by noise covariance propagated through the inverse operator
- Produces statistical parametric maps (z-score-like values)

**Improvements over MNE**:
- Better localization of deeper sources than standard MNE
- Statistical interpretation (noise-normalized)
- Can localize deeper sources more accurately than standard minimum norm

**Caveats**:
- Spatial resolution remains **low**
- Produces systematic **non-zero localization errors** even with negligible noise
- Normalization changes the point-spread function (PSF) shape
- Cross-talk functions (CTFs) are unchanged from MNE

### 5.3 sLORETA as an MNE Derivative

Both dSPM and sLORETA are derived from MNE by row normalization:
- dSPM normalizes by propagated noise covariance
- sLORETA normalizes by the resolution matrix diagonal
- sLORETA's normalization guarantees zero dipole localization error; dSPM does not

### MNE Family Comparison

| Feature | MNE | dSPM | sLORETA |
|---------|-----|------|---------|
| Depth Bias | Severe | Moderate | Corrected |
| Localization Error | High | Systematic | Zero (noise-free) |
| Output Units | Current density | t-statistic | Standardized current |
| Deep Source Recovery | Poor | Better | Best |
| Time Series Quality | Good | Good | Good |
| Group Analysis | Needs normalization | Natural | Natural |

---

## 6. Method 4: Dipole Fitting (Equivalent Current Dipole)

### 6.1 Principle

**ECD (Equivalent Current Dipole)** models brain activity as one or a small number of point current dipoles, each with a 3D location and orientation. This is the **only inverse solution approved by clinical guidelines** (e.g., epilepsy presurgical workup).

**How it Works**:
1. Define a head model (spherical or realistic BEM)
2. Place an initial guess for dipole location(s)
3. Iteratively adjust location, orientation, and amplitude to minimize residual variance between predicted and measured scalp maps
4. Non-linear optimization (gradient descent, Levenberg-Marquardt)

### 6.2 Strengths

- **Intuitive interpretation**: Direct mapping to specific brain locations
- **Computationally efficient**: Fast fitting for single dipoles
- **Clinically validated**: Only method with clinical guideline approval
- **Good for focal sources**: Excellent when the source is compact and synchronous (e.g., interictal epileptic discharges)
- Forms the foundation for Independent Component Analysis (ICA) + dipole fitting pipelines

### 6.3 Critical Caveats

- **Single-source assumption**: Cannot capture distributed or extended generators
- **Initialization sensitivity**: Results depend on starting location guess
- **Wrongly localizes deep brain regions**: ECD dipoles are often incorrectly placed in deep structures (Chowdhury et al., 2018)
- **Misses distributed activity**: Only captures the dominant source
- **Number of dipoles must be pre-specified**: Model selection is non-trivial
- ECD accuracy: median distance from true focus ~4.88 mm; distributed methods can achieve 3.44 mm
- Sublobar concordance: ECD 69% vs. distributed cMEM 81% (P < 0.001)

### 6.4 Multiple Dipole Extensions

Particle filter approaches and multi-dipole fitting algorithms allow dynamic estimation of dipole number and position over time, treating source positions as a hidden state in a Bayesian framework. However, these remain computationally intensive and less commonly used.

---

## 7. Method 5: MRI-Informed vs. Template Head Models

### 7.1 Individual MRI-Based Head Models

**Pipeline**:
1. Acquire T1-weighted (and ideally T2-weighted) MRI for each subject
2. Segment tissues: brain, CSF, skull, scalp (and optionally white matter, blood vessels)
3. Construct realistic boundary element or finite element model
4. Co-register EEG electrodes to individual MRI
5. Compute individual lead field matrix

**Accuracy**: This is the **gold standard** for source localization accuracy.

### 7.2 Template Head Models (MNI, Colin27, ICBM152)

**Common Templates**:
| Template | Description | Resolution |
|----------|-------------|------------|
| MNI305 | Montreal Neurological Institute average of 305 brains | 1 mm |
| Colin27 | Colin Holmes scanned 27 times, averaged | 1-2 mm |
| ICBM152 | International Consortium for Brain Mapping | 1 mm |
| MNI152 | 152-subject average, non-linear registration | 1 mm |

**Standard BEM Model**:
- Three-layer (brain, skull, scalp) or four-layer (+CSF) boundary element model
- Based on Colin27 template
- Conductivities: brain=0.33 S/m, skull=0.0041 S/m, scalp=0.33 S/m
- Expressed in MNI coordinates (mm)
- Available in FieldTrip, MNE-Python, EEGLAB

### 7.3 Individual vs. Template: Quantified Errors

**Key Finding**: Using generic template head models leads to source localization discrepancies of **up to 2 cm** compared to individual MRI-based models (Truong et al., 2023).

**Error Breakdown by Pipeline**:

| Pipeline | Description | Median Error | Max Error |
|----------|-------------|-------------|-----------|
| 1: Generic template + template electrodes | ~19 mm | ~32 mm |
| 2: Generic template + digitized electrodes | ~13 mm | ~24 mm |
| 3: Individual MRI + simplified segmentation | ~6 mm | ~17 mm |
| 4: Individual MRI + accurate segmentation | Reference | Reference |

**Critical Factors**:

1. **Electrode co-registration**: Using digitized electrode positions instead of template positions reduces errors by ~6 mm
2. **Tissue segmentation accuracy**: Simplified skull (constant thickness) adds ~6 mm error
3. **Skull conductivity**: Misestimation (e.g., 80:1 vs. 25:1 brain-to-skull ratio) causes ~12.4 mm median outward displacement
4. **Head shape warping**: Warping template to measured electrode positions reduces median error to ~5 mm
5. **Brain regions**: Largest errors occur at basal/inferior brain locations

### 7.4 Age-Related Considerations

- Older adults show brain atrophy, CSF expansion, ventricle enlargement
- However, template-model localization discrepancies are **similar** between younger and older adults (~13-19 mm)
- Increased CSF in older adults shunts more current, attenuating scalp potentials
- Individual MRI remains preferable when available, but template models are similarly inaccurate across age groups

### 7.5 Recommendations When Individual MRI is Unavailable

To achieve sub-centimeter accuracy with template models:
1. Use a **4-layer BEM** template head model (not spherical)
2. **Warp** the template to accurately measured 3D electrode positions (64+ channels)
3. Use **accurate skull conductivity** estimates (estimate from data if possible)
4. Extend head model below the brain (whole-head model)
5. Consider photogrammetric head shape estimation for warping

---

## 8. Head Model Architecture: Boundary Element Models (BEM)

### 8.1 What is BEM?

Boundary Element Method (BEM) models the head as a set of nested compartments with different electrical conductivities, defined by their bounding surfaces. It is the most widely used realistic head model approach for EEG source localization.

### 8.2 Compartment Configurations

| Model | Layers | Components | Use Case |
|-------|--------|------------|----------|
| 3-layer BEM | 3 | Brain (CSF combined), skull, scalp | Standard qEEG |
| 4-layer BEM | 4 | Brain, CSF, skull, scalp | Research standard |
| 5-layer BEM | 5 | + White matter anisotropy | Advanced research |
| Spherical | 1-4 | Concentric spheres | Quick screening |

### 8.3 Tissue Conductivity Values

| Tissue | Conductivity (S/m) | Notes |
|--------|-------------------|-------|
| Brain (gray matter) | 0.33 | Well-established |
| CSF | 0.33-1.79 | Highly conductive; critical for accuracy |
| Skull | 0.004-0.02 | Most variable; major source of error |
| Scalp | 0.33 | Similar to brain |
| White matter | 0.14 (anisotropic) | Directionally dependent |

### 8.4 BEM Computational Characteristics

| Operation | Time | Memory |
|-----------|------|--------|
| BEM matrix generation | ~107 min | ~7.5 GB |
| Transfer matrix calculation | ~9 min | ~124 MB |
| Lead field computation | ~47 min | ~14 MB |

Parallelization can significantly reduce computation times. FEM (Finite Element Method) with anisotropic white matter may offer further accuracy but at substantially higher computational cost.

---

## 9. Comparative Summary: Top 5 Methods

### Ranked by Clinical Utility for QEEG

| Rank | Method | Best For | Spatial Res. | Deep Sources | Temporal Res. | Ease of Use |
|------|--------|----------|-------------|--------------|---------------|-------------|
| 1 | **sLORETA/eLORETA** | QEEG database analysis, 3D visualization, frequency analysis | Low | Moderate | Good | Very High |
| 2 | **LCMV Beamformer** | Evoked responses, focal source time-series, high-res imaging | High | Moderate | Excellent | Moderate |
| 3 | **MNE/dSPM** | Evoked response tracking, group studies, cortical mapping | Low | Poor (MNE); Better (dSPM) | Excellent | High |
| 4 | **ECD Dipole Fitting** | Epilepsy presurgical, ICA components, single focal sources | Variable | Often misplaced | Good | High |
| 5 | **DICS Beamformer** | Oscillatory networks, coherence analysis, frequency mapping | High | Moderate | N/A (freq.) | Moderate |

### Performance on Key Metrics

| Metric | sLORETA | LCMV | MNE | ECD | DICS |
|--------|---------|------|-----|-----|------|
| Localization Accuracy | Excellent | Excellent | Poor | Moderate | Excellent |
| Amplitude Fidelity | Moderate | Good | Poor | Good | Good |
| Distributed Sources | Excellent | Poor | Excellent | Poor | Poor |
| Temporal Correlation Robust | Yes | No | Yes | N/A | No |
| Real-Time Feasibility | Yes | Yes (accelerated) | Yes | Yes | Limited |
| Group Analysis | Natural | Needs normalization | Natural | Difficult | Needs normalization |
| Clinical Validation | High | Moderate | Moderate | High (epilepsy) | Low |

---

## 10. Critical Caveats for Clinical Practice

### Caveat 1: Head Model Error Can Exceed Method Error

A sophisticated inverse method (eLORETA, beamformer) with a poor head model may produce **worse** results than a simpler method with an accurate model. Template head models can introduce 2 cm of error -- far exceeding the theoretical precision of any inverse algorithm.

> **Mitigation**: Always warp template models to digitized electrode positions; use 4-layer BEM minimum; estimate skull conductivity from data when possible.

### Caveat 2: Electrode Count Determines Resolution Floor

- 19 electrodes (10-20 system): Very limited spatial resolution; deep sources poorly resolved
- 64 electrodes: Acceptable for most cortical sources
- 128-256 electrodes: Needed for sublobar accuracy; deep source recovery improves substantially
- At ~70 electrodes, sLORETA approaches fMRI-level spatial accuracy (Pascual-Marqui)

### Caveat 3: Correlated Sources Break Beamformers

LCMV and DICS beamformers **fundamentally assume** that sources are uncorrelated. When this is violated:
- Signal cancellation occurs
- Spurious source locations may appear
- Focal sources may be completely missed

> **Mitigation**: Use distributed methods (LORETA, MNE) for bilaterally synchronous activity, network-level analysis, or when source correlation is suspected.

### Caveat 4: Artifact Contamination Creates False Sources

LORETA and all inverse methods will "solve" artifact into brain sources:
- Eye blink artifact localizes to orbitofrontal cortex
- EMG artifact localizes near muscle sources
- Cardiac artifact creates spurious temporal sources

> **Mitigation**: Thorough artifact rejection or ICA-based cleaning BEFORE source localization is mandatory. Raw data quality assessment is prerequisite.

### Caveat 5: Deep Sources Are Fundamentally Challenging

All methods struggle with deep brain sources (basal ganglia, thalamus, brainstem):
- Scalp field strength falls off with the square of distance
- Deep sources produce broad, low-amplitude scalp patterns
- Spatial resolution degrades for subcortical structures
- MNE particularly misplaces deep sources to superficial cortex

> **Mitigation**: Use sLORETA/eLORETA (zero-error property); use high electrode density (>128); interpret deep source results with caution; consider MEG complement for deep sources.

### Caveat 6: Template Models Assume "Average" Anatomy

Individual brains differ from template anatomy in:
- Head shape and size
- Cortical folding patterns
- Skull thickness variation (especially with age)
- CSF volume (age-dependent)
- Brain-to-skull conductivity ratio

> **Mitigation**: Use individual MRI when possible; digitize electrode positions; warp template to subject anatomy; report localization uncertainty estimates.

### Caveat 7: Regularization is Always a Trade-off

All inverse methods require a regularization parameter (lambda/alpha):
- Too little: Noisy, unstable solutions
- Too much: Excessive spatial smearing, missed sources
- Cross-validation can estimate optimal values
- SNR determines the practical range

> **Mitigation**: Report regularization parameters; perform sensitivity analysis; use SNR-dependent regularization when available.

### Caveat 8: Beamformer Output Requires Baseline Contrast

Beamformer power estimates are inherently relative:
- DICS requires a control/baseline condition for meaningful interpretation
- LCMV output should be contrasted against baseline or another condition
- Raw beamformer power has arbitrary units

> **Mitigation**: Design experiments with baseline periods or control conditions; always use relative/contrast maps for beamformer output.

---

## 11. Recommendations by Use Case

### Clinical QEEG / Neurofeedback
- **Primary**: sLORETA (built into Neuroguide, LORETA-KEY)
- **Why**: Standardized, validated, zero localization error property, frequency-domain output
- **Head model**: 3- or 4-layer BEM (template acceptable with caveats)

### Epilepsy Presurgical Evaluation
- **Primary**: Equivalent Current Dipole (ECD) -- only clinically approved method
- **Secondary**: cMEM or sLORETA for distributed generator mapping
- **Head model**: Individual MRI-based 4-layer BEM strongly preferred

### Cognitive Neuroscience / ERP Research
- **Primary**: dSPM or MNE (time-series tracking) + LCMV beamformer (focal sources)
- **Why**: Good time resolution, group analysis friendly, statistically normalized
- **Head model**: Individual MRI or warped template with digitized electrodes

### Oscillatory / Frequency Analysis
- **Primary**: DICS beamformer or sLORETA
- **Why**: Natural frequency-domain output, coherence analysis capability
- **Head model**: 4-layer BEM minimum

### Brain-Computer Interfaces / Real-Time
- **Primary**: Accelerated LCMV (ALCMV) or eLORETA
- **Why**: 66% computational reduction with maintained accuracy
- **Head model**: Pre-computed template with online warping

### Group Studies / Cross-Subject Comparison
- **Primary**: dSPM, sLORETA, or MNE with morphing to standard space
- **Why**: Statistical parametric output, MNI space registration
- **Head model**: Standard template (MNI/Colin27) acceptable

---

## 12. References

1. Pascual-Marqui, R.D. (2002). Standardized low resolution brain electromagnetic tomography (sLORETA): technical details. *Methods & Findings in Experimental & Clinical Pharmacology*, 24D, 5-12.

2. Pascual-Marqui, R.D. et al. (1994). Low resolution electromagnetic tomography: a new method for localizing electrical activity in the brain. *International Journal of Psychophysiology*, 18(1), 49-65.

3. Pascual-Marqui, R.D. (2007). Discrete, 3D distributed, linear imaging methods of electric neuronal activity. Part 1: exact, zero error localization. *arXiv:0710.3341*.

4. Hamalainen, M.S. & Ilmoniemi, R.J. (1994). Interpreting magnetic fields of the brain: minimum norm estimates. *Medical & Biological Engineering & Computing*, 32(1), 35-42.

5. Dale, A.M. et al. (2000). Dynamic statistical parametric mapping: combining fMRI and MEG for high-resolution imaging of cortical activity. *Neuron*, 26(1), 55-67.

6. Van Veen, B.D. et al. (1997). Localization of brain electrical activity via linearly constrained minimum variance spatial filtering. *IEEE Trans Biomed Eng*, 44(9), 867-880.

7. Gross, J. et al. (2001). Dynamic imaging of coherent sources: studying neural interactions in the human brain. *PNAS*, 98(2), 694-699.

8. Jatoi, M.A. et al. (2014). EEG based brain source localization comparison of sLORETA and eLORETA. *Australasian Physical & Engineering Sciences in Medicine*, 37(4), 713-721.

9. Akalin Acar, Z. & Makeig, S. (2013). Effects of forward model errors on EEG source localization. *Brain Topography*, 26(3), 378-396.

10. Truong, D.Q. et al. (2023). Comparison of EEG source localization using simplified and anatomically accurate head models in younger and older adults. *IEEE Trans Neural Syst Rehabil Eng*, 31, 2591-2602.

11. Chowdhury, R.A. et al. (2018). A comparison with equivalent current dipole method and magnetic source imaging using coherent maximum entropy on the mean. *Human Brain Mapping*, 39, 218-231.

12. MNE-Python Documentation. (2025). Source localization with MNE, dSPM, sLORETA, and eLORETA. https://mne.tools/

13. FieldTrip Toolbox Documentation. (2025). Template head models for EEG volume conduction modeling. https://www.fieldtriptoolbox.org/

14. Lanfer, B. et al. (2012). Influences of skull segmentation inaccuracies on EEG source analysis. *NeuroImage*, 62(1), 418-431.

15. Oostenveld, R. & Oostendorp, T.F. (2002). Validating the boundary element method for forward and inverse EEG computations in the presence of a hole in the skull. *Human Brain Mapping*, 17(3), 179-192.

---

> *Report generated for QEEG source localization methodology review. All localization accuracies cited reflect ideal conditions; real-world performance depends on data quality, electrode count, head model accuracy, and signal-to-noise ratio.*
