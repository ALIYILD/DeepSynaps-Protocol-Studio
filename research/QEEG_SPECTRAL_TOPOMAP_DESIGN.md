# QEEG Spectral Analysis & Topomap Design: Comprehensive Research Document

> **Document Version**: 1.0
> **Scope**: EEG spectral analysis (delta/theta/alpha/beta/gamma), Individual Alpha Frequency (IAF), relative vs. absolute power, band ratios, asymmetry metrics, z-score topomaps, source-space mapping, animated topomaps, and microstate analysis
> **Purpose**: Inform the design of QEEG visualization and analysis components for the DeepSynaps Protocol Studio

---

## Table of Contents

1. [EEG Frequency Bands Overview](#1-eeg-frequency-bands-overview)
2. [Individual Alpha Frequency (IAF)](#2-individual-alpha-frequency-iaf)
3. [Relative vs. Absolute Power](#3-relative-vs-absolute-power)
4. [Band Ratios](#4-band-ratios)
5. [Asymmetry Analysis](#5-asymmetry-analysis)
6. [Z-Score Topographic Maps](#6-z-score-topographic-maps)
7. [Topographic Map Design](#7-topographic-map-design)
8. [Animated Topomaps](#8-animated-topomaps)
9. [Source-Space Mapping](#9-source-space-mapping)
10. [Band Ratio Maps](#10-band-ratio-maps)
11. [Microstate Analysis](#11-microstate-analysis)
12. [Key Design Recommendations](#12-key-design-recommendations)

---

## 1. EEG Frequency Bands Overview

### Standard Frequency Bands

| Band     | Frequency Range | Primary Associations                                           | Typical Scalp Distribution |
|----------|----------------|----------------------------------------------------------------|----------------------------|
| **Delta**    | 0.5 - 4 Hz     | Deep sleep, unconsciousness, slow-wave activity; increased in dementia/encephalopathy | Frontal (adults), diffuse (children) |
| **Theta**    | 4 - 8 Hz       | Drowsiness, light sleep, memory encoding (hippocampal theta); increased in ADHD, anxiety | Frontal-midline (Fz, Cz); temporal |
| **Alpha**    | 8 - 13 Hz      | Relaxed wakefulness, eyes-closed; reduced alpha = cortical activation | Occipital, parietal |
| **Beta**     | 13 - 30 Hz     | Active thinking, alertness, motor activity; divided into beta1 (13-20 Hz) and beta2 (20-30 Hz) | Frontal, central, symmetric |
| **Gamma**    | 30 - 100 Hz    | Higher cognitive functions, binding, conscious perception | Distributed; difficult to measure non-invasively |

### Extended Alpha Sub-bands

Alpha is frequently subdivided for finer-grained analysis:

| Sub-band     | Frequency Range | Associations                                      |
|--------------|----------------|---------------------------------------------------|
| **Alpha-1 / Low Alpha**   | 8 - 10 Hz      | Subcortical-cortical mechanisms; sensitive to vascular damage |
| **Alpha-2 / High Alpha**  | 10 - 13 Hz     | Cortico-cortical interactions; linked to degenerative processes |
| **Alpha-3**               | 10 - 12 Hz     | Used in specific theta/alpha ratio calculations for dementia markers |

### Clinical Relevance by Band

- **Delta**: Elevated delta power is a hallmark of dementia and encephalopathy. Delta coherence increases between frontal and posterior regions in AD, suggesting loss of subcortical cholinergic influence.
- **Theta**: Frontal-midline theta (FMT) at 4-6 Hz is linked to attention and memory processes. Elevated theta is consistently reported in ADHD and may reflect cortical-subcortical interaction deficits in inhibitory functioning.
- **Alpha**: Posterior dominant rhythm (PDR) slows with age and cognitive decline. The individual alpha frequency (IAF) is a key biomarker -- see Section 2.
- **Beta**: Frontal beta is involved in executive control. Beta power correlates with GABAergic interneuron activity.
- **Gamma**: Gamma oscillations are implicated in feature binding and conscious awareness but are heavily contaminated by muscle artifact in scalp EEG.

---

## 2. Individual Alpha Frequency (IAF)

### Definition and Measurement

**Individual Alpha Frequency (IAF)** -- also called **Peak Alpha Frequency (PAF)** or **Individual Alpha Peak Frequency** -- is defined as the frequency within the alpha band (typically 7-13 Hz) that exhibits the maximum power in the EEG power spectrum. IAF serves as an anchor for defining individualized frequency bands.

### Key Properties

- **Typical Range**: 8-13 Hz in adults
- **Peak in Adults**: Approximately 10 Hz
- **Development**: IAF increases from childhood through adolescence, peaks in young adulthood, then declines with age
- **Heritability**: High heritability (~80%), making it a stable trait-like biomarker
- **Gender**: Slight differences reported, with males typically showing slightly lower IAF

### Measurement Methods

#### 2.1 Peak Alpha Frequency (PAF)
- Identifies the single frequency bin with the highest power in the alpha band
- Computed from the power spectral density (PSD) at posterior electrodes (P3, Pz, P4, O1, Oz, O2)
- Fast but sensitive to noise and spectral artifacts

#### 2.2 Center of Gravity (CoG) / Center of Frequency
- Computes the weighted mean frequency of the alpha band
- Formula: `CoG = sum(f * P(f)) / sum(P(f))` where f is frequency and P(f) is power
- More robust to noise than PAF
- Recommended for automated analysis pipelines

#### 2.3 Savitzky-Golay Filter (SGF) Method
- Smooths the power spectrum before peak detection
- Significantly improves reliability and consistency of IAF estimates
- Available in MATLAB and Python; integrates with EEGLAB, FieldTrip, MNE-Python
- Outperforms simple automated peak detection without smoothing
- Recommended for production systems

#### 2.4 FOOOF (Fitting Oscillations & One Over F) Method
- Separates aperiodic (1/f) components from oscillatory (periodic) components
- Provides cleaner alpha peak detection by removing background spectral slope
- Used in modern EEG analysis pipelines
- Extracts both IAF and aperiodic exponent (1/f offset) simultaneously

### Clinical Significance of IAF

| Application | Finding |
|-------------|---------|
| **Cognitive Performance** | Positive correlation with working memory, attention, general intelligence |
| **Age-Related Decline** | Strong inverse correlation with age after adulthood (slower alpha = older) |
| **MCI / Dementia** | Shift to lower frequencies; reduced IAF predicts conversion from MCI to AD |
| **ADHD** | Lower IAF associated with inattention symptoms |
| **Neurofeedback** | Training to increase IAF shows cognitive enhancement in elderly and young adults |
| **Individualized Bands** | Used to define subject-specific frequency bands: IAF +/- 2 Hz for alpha, etc. |

### IAF-Based Individualized Band Definitions

```
Delta:   IAF - 6  to IAF - 2  Hz
Theta:   IAF - 4  to IAF - 2  Hz
Alpha:   IAF - 2  to IAF + 2  Hz
Low Beta: IAF + 2  to IAF + 8  Hz
High Beta: IAF + 8  to IAF + 16 Hz
```

### Design Implications

- **UI**: Display IAF as a prominent metric alongside standard band powers
- **Calculation**: Use SGF-smoothed CoG or FOOOF-derived peak for robustness
- **Electrodes**: Compute from occipital-parietal cluster (P3, Pz, P4, O1, Oz, O2) in eyes-closed condition
- **Update Rate**: For neurofeedback, update IAF every 100-500 ms using sliding FFT
- **Visualization**: Show alpha peak on PSD plot with IAF marker line

---

## 3. Relative vs. Absolute Power

### Definitions

| Metric | Definition | Units | Interpretation |
|--------|-----------|-------|----------------|
| **Absolute Power** | Raw power within a frequency band | uV^2 / Hz (or dB) | Total energy in the band; reflects overall oscillatory amplitude |
| **Relative Power** | Band power / Total power across all bands | Percentage (%) | Proportional contribution of the band to the total signal |

### Key Differences and Trade-offs

**Absolute Power**:
- Indexes raw amplitude of oscillatory activity
- Sensitive to non-neural variability: skull thickness, scalp-electrode impedance, hair texture, amplifier characteristics
- State-dependent: affected by fatigue, medication, arousal level
- Better for tracking changes within the same individual over time (pre/post comparisons)
- Essential for source localization and biophysical modeling

**Relative Power**:
- Expresses each band as a proportion of the total signal
- Often assumed to control for non-neural variability (e.g., hair texture, impedance)
- However, this assumption is NOT fully supported by empirical evidence
- Relative power dampens some amplitude-related effects (e.g., fatigue) but remains influenced by hair texture, affect, and time of day
- Provides complementary information about spectral composition

### Convergence and Divergence

Research shows that absolute and relative measures demonstrate:
- **Convergence** for higher-frequency activity (e.g., gamma, beta) -- similar patterns across indices
- **Divergence** for lower-frequency activity (e.g., theta, delta) -- distinct neurophysiological properties

### Best Practice Recommendations

1. **Report BOTH absolute and relative power** whenever possible
2. **Justify the analytic choice** based on research question
3. **Account for covariates**: age, biological factors, contextual variables
4. **For normative comparisons**: Use z-scores derived from age-matched normative databases
5. **For longitudinal tracking**: Absolute power may be preferred (if conditions are controlled)
6. **For spectral composition**: Relative power provides the proportional view

### Design Implications

- Provide toggle between absolute and relative power displays
- Use different color scales or normalization schemes for each
- When showing relative power, clarify that values are percentages of total power
- Include clear labels and units on all visualizations

---

## 4. Band Ratios

### Commonly Used Band Ratios

| Ratio | Formula | Clinical Application |
|-------|---------|---------------------|
| **Theta/Beta Ratio (TBR)** | Theta power / Beta power | ADHD diagnosis (FDA-approved NEBA device); elevated in ADHD |
| **Theta/Alpha Ratio (TAR)** | Theta power / Alpha power | Cognitive decline; dementia; Lewy body disease |
| **Delta/Alpha Ratio (DAR)** | Delta power / Alpha power | Dementia severity; encephalopathy; vascular damage |
| **Alpha3/Alpha2 Ratio** | High-alpha power / Low-alpha power | Amygdalo-hippocampal atrophy; conversion MCI to AD |
| **Theta/Gamma Ratio** | Theta power / Gamma power | Cognitive decline; memory impairment |
| **Alpha/Theta Ratio** | Alpha power / Theta power | Relaxation index; meditation; sometimes inverse of TAR |

### Theta/Beta Ratio (TBR) in Detail

#### Clinical Context: ADHD

- FDA approved the **NEBA (Neuropsychiatric EEG-Based ADHD Assessment Aid)** device using TBR at electrode Cz for ages 6-17
- TBR reflects the balance between theta (associated with drowsiness/underarousal) and beta (associated with active processing)
- Elevated TBR in ADHD may reflect:
  - Difficulty in cortical response during mental tasks
  - Impaired voluntary top-down attention control via dorsolateral prefrontal cortex
  - Cortical-subcortical interaction deficits in inhibitory functioning

#### Measurement Specifications

| Parameter | Typical Value |
|-----------|--------------|
| **Electrode** | Cz (primary); Fz, frontal electrodes |
| **Theta band** | 4-8 Hz (or 4-7.5 Hz) |
| **Beta band** | 13-21 Hz (or 13-20.5 Hz) |
| **Diagnostic cutoff** | 1.5 SD above mean |
| **Recording condition** | Eyes-open resting state |

#### Important Caveats

- TBR is **NOT a standalone diagnostic tool** -- must be used alongside clinical evaluation
- False-positive rate exceeds 5% (considered unacceptably high by AAN)
- TBR is age-dependent (higher in younger children); must use age-normed values
- Theta power is highly nonspecific -- increased by drowsiness, medication, many neurological disorders
- Comorbid conditions (depression, anxiety, learning disabilities) can confound TBR values
- **Recommendation**: Use for screening support only, not diagnosis confirmation

### Delta/Alpha Ratio (DAR) in Detail

#### Clinical Context: Dementia / Cognitive Decline

- DAR rises significantly with cognitive deterioration (correlation r ~ -0.58 to -0.61)
- Increased delta power + decreased alpha power = "EEG slowing"
- In AD: delta coherence increases between frontal and posterior regions (loss of cholinergic modulation)
- Alpha coherence decreases in temporal-parietal-occipital areas (damage to cortico-cortical connections)
- DAR is more sensitive than individual band powers alone for detecting cognitive decline

### Theta/Alpha Ratio (TAR) in Detail

- TAR increases in moderate and severe cerebrovascular (CV) damage
- More sensitive marker of subcortical vascular damage than individual theta or alpha power
- Elevated TAR associated with language, memory, and visuospatial dysfunction
- In Lewy body disease: temporal TAR associated with hallucinations

### Design Implications for Band Ratio Maps

- Display ratio maps alongside individual band maps for context
- Use log-transformed ratios (ln(ratio)) for better distributional properties
- For z-score maps: compare ratio to age-matched normative database
- Provide threshold indicators for clinical significance (e.g., >2 SD from norm)
- Color scales: diverging colormaps (blue-white-red) work well for ratio deviations

---

## 5. Asymmetry Analysis

### Frontal Alpha Asymmetry (FAA)

Frontal alpha asymmetry is one of the most studied EEG asymmetry metrics, reflecting the balance of activity between left and right frontal hemispheres. Since alpha power is inversely related to cortical activation, asymmetry patterns reveal hemispheric dominance.

#### Calculation Formula

```
FAA (F4 - F3) = ln(F4_alpha_power) - ln(F3_alpha_power)
```

Where:
- **Positive FAA** = Higher right alpha = Greater relative LEFT frontal activation
- **Negative FAA** = Higher left alpha = Greater relative RIGHT frontal activation
- **FAA = 0** = Symmetrical activity

Natural log transformation is standard because EEG power is positively skewed.

#### Key Electrode Pairs

| Pair | Location | Interpretation |
|------|----------|----------------|
| **F3/F4** | Mid-frontal | Approach/withdrawal motivation; emotion regulation |
| **F7/F8** | Lateral frontal | Broader affective processing |
| **Fp1/Fp2** | Frontopolar | Executive function; prefrontal asymmetry |

#### Clinical Associations

| Finding | Association |
|---------|-------------|
| Reduced FAA (more negative) | Depression; behavioral withdrawal; behavioral inhibition |
| Increased left frontal activation | Approach motivation; positive affect |
| Increased right frontal activation | Withdrawal motivation; negative affect; anxiety |
| FAA changes with treatment | CBT for PTSD showed reduction in right anterior activation |

#### Meta-Analysis Findings (2025)

- Significant effect at F3/F4 site for distinguishing MDD from controls
- Mean weighted effect size: r = 0.29 (moderate)
- Three-way interaction of gender x age x depression severity affects FAA
- Heterogeneity across studies is considerable
- F3/F4 is more reliable than F7/F8 or Fp1/Fp2

### Discriminant Validity

- **Mid-frontal (F3/F4) sites**: Larger effect sizes than lateral frontal (F7/F8)
- **Low alpha (8-10 Hz)**: More sensitive to depression-related differences than high alpha
- **Cz reference**: Preferred reference scheme for asymmetry calculations
- **Current Source Density (CSD) transformation**: Reduces reference contamination; improves spatial specificity

### Design Implications

- Display asymmetry as a differential topomap (right hemisphere minus left hemisphere)
- Use diverging colormap (e.g., RdBu_r) centered at zero
- Provide both absolute asymmetry and log-transformed asymmetry
- Show electrode pairs explicitly labeled (F3/F4, F7/F8)
- Include normative reference lines (mean +/- 1 SD, mean +/- 2 SD)
- Consider showing asymmetry index as a bar chart alongside topomaps

---

## 6. Z-Score Topographic Maps

### Concept

Z-score topographic maps compare an individual's EEG metrics against a **normative database** to identify statistically significant deviations. Each electrode value is expressed as a z-score:

```
z-score = (Individual_Value - Normative_Mean) / Normative_Standard_Deviation
```

### Normative Database Construction

Key requirements for robust normative databases (per Thatcher, 2003):

1. **Representative Sampling**: Balanced across age, gender, ethnicity, socioeconomic status
2. **Exclusion Criteria**: History of neurological problems, psychiatric disorders, substance abuse
3. **Amplifier Matching**: Adjust metrics for amplifier frequency characteristics
4. **Gaussian Approximation**: Apply transformations to approximate normal distribution
5. **Age Stratification**: Typically 1-5 year age bins for children, 5-10 year bins for adults
6. **Recording Conditions**: Both eyes-closed (EC) and eyes-open (EO) resting states

### Z-Score Interpretation

| Z-Score Range | Interpretation | Color Coding (Typical) |
|--------------|----------------|----------------------|
| > +2.0 | Significantly elevated | Red |
| +1.0 to +2.0 | Mildly elevated | Light red / Orange |
| -1.0 to +1.0 | Within normal range | Green / White |
| -2.0 to -1.0 | Mildly reduced | Light blue |
| < -2.0 | Significantly reduced | Dark blue |

### Common QEEG Metrics for Z-Score Mapping

- Absolute power (per band)
- Relative power (per band)
- Power ratios (theta/beta, theta/alpha, delta/alpha)
- Mean frequency / center frequency
- Coherence (intra-hemispheric, inter-hemispheric)
- Phase lag / phase shift
- Asymmetry indices
- Individual alpha frequency (IAF)
- Amplitude asymmetry

### Design Implications

- Use **diverging colormaps** (RdBu_r, coolwarm) centered at z=0
- Provide z-score color bar with clear threshold markers at +/- 1, +/- 2, +/- 3
- Overlay electrode positions as dots with labels
- Include head outline (nose at top, ears at sides)
- Show interpolated surface between electrodes
- Provide option to display values at each electrode
- Include statistical significance indicators (p < 0.05, p < 0.01)
- Support both 2D circular top-down view and 3D head surface projection
- Show nose direction indicator
- Include masked interpolation option (only show within convex hull of electrodes)

---

## 7. Topographic Map Design

### Core Design Principles

#### 7.1 Color Mapping

| Recommendation | Rationale |
|----------------|-----------|
| **Use perceptually uniform colormaps** | Viridis, Plasma, Inferno -- avoid misleading perception of value differences |
| **Use diverging colormaps for signed data** | RdBu_r, coolwarm, PiYG -- clearly show positive/negative deviations |
| **Avoid Jet/Rainbow** | Non-uniform perceptual spacing; creates artificial boundaries |
| **Consistent color scaling per metric** | All theta maps use same color range for comparability |
| **Clip at physiologically reasonable limits** | Prevents extreme values from compressing visible range |

#### 7.2 Interpolation Methods

| Method | Quality | Speed | Use Case |
|--------|---------|-------|----------|
| **Cubic** (default) | Best smoothness | Moderate | Publications; final output |
| **Linear** | Good | Fast | Preliminary analysis; debugging |
| **Nearest (Voronoi)** | None | Fastest | Debugging; seeing raw values |
| **Spherical Spline** | Excellent | Slower | Gold standard; source estimation |
| **Thin Plate Spline** | Very good | Moderate | Alternative to spherical spline |

**Recommendation**: Use spherical spline interpolation (degree 4) for final maps; cubic for interactive displays.

#### 7.3 Map Layout Standards

```
Standard Topomap Layout:
- Nose at top (12 o'clock position)
- Left ear at 9 o'clock
- Right ear at 3 o'clock
- Head outline as circle or 3D head shape
- Electrodes shown as colored dots with optional labels
- Color bar on the right side
- Title indicating: metric, band, condition (EO/EC), time window
```

#### 7.4 Multi-Panel Display Patterns

**Standard Band Array**:
```
[Delta] [Theta] [Alpha] [Beta] [Gamma]
All same scale, same condition, for quick comparison
```

**Absolute + Relative Pair**:
```
Absolute Power    |    Relative Power
[Delta] [Theta]   |    [Delta] [Theta]
[Alpha] [Beta]    |    [Alpha] [Beta]
```

**Eyes-Open vs Eyes-Closed**:
```
          EO Condition       |       EC Condition
Delta    [map]               |       [map]
Theta    [map]               |       [map]
Alpha    [map]               |       [map]
Beta     [map]               |       [map]
```

#### 7.5 Technical Specifications

| Parameter | Recommendation |
|-----------|---------------|
| **Resolution** | 64x64 pixels minimum; 128x128 preferred |
| **Extrapolation** | Limit to convex hull of electrodes (no extrapolation beyond) |
| **Masking** | Circular mask within head outline; no values outside head |
| **Electrode markers** | Show as dots; highlight if significant |
| **Contour lines** | Optional; show at regular intervals for precise reading |
| **Head shape** | Use standard 10-20/10-10 system head template |
| **Text labels** | Band name, units (uV^2, %, z-score), condition |

---

## 8. Animated Topomaps

### Purpose

Animated topomaps show the temporal evolution of scalp potential distribution over time, useful for:
- Visualizing event-related dynamics (ERP/ERF)
- Showing time-frequency representations across the scalp
- Tracking microstate sequences
- Displaying propagation of epileptiform discharges
- Neurofeedback training feedback

### Implementation Approaches

#### 8.1 Time-Series Animation

```python
# Pseudocode for animated topomap
for t in time_points:
    plot_topomap(data[:, t], positions, axes=ax)
    ax.set_title(f"Time: {t*1000:.0f} ms")
    plt.pause(0.1)  # or save frame for video
```

**Parameters**:
- Frame rate: 10-30 fps for smooth visualization
- Time resolution: Can downsample (e.g., every 10 ms) for efficiency
- Baseline correction: Apply before animation if needed

#### 8.2 Frequency-Resolved Animation

Show topomap for a sliding frequency window:
- Window: 2-4 Hz wide
- Step: 0.5-1 Hz
- Overlay peak frequency as it changes across conditions

#### 8.3 Time-Frequency Combined Animation

Display topomap at specific (time, frequency) points from TFR analysis:
```
For each time window:
    For each frequency band:
        Plot topomap of power at (t, f)
```

### Design Recommendations

1. **Use consistent color scale across all frames** to prevent misleading comparisons
2. **Include time/frequency indicator** (progress bar, timestamp, frequency label)
3. **Allow pause/play/scrub** for interactive exploration
4. **Support export to video** (MP4, GIF) for reports and presentations
5. **Frame rate**: 10-15 fps for EEG dynamics; higher for smooth playback
6. **Loop behavior**: Consider whether animation should loop or play once
7. **Color bar**: Keep static; update only if auto-scaling per frame

---

## 9. Source-Space Mapping

### Overview

Source-space mapping solves the **EEG inverse problem**: given scalp EEG measurements, estimate the 3D distribution of neuronal generators within the brain. This provides superior spatial resolution compared to scalp topomaps.

### Major Source Localization Methods

#### 9.1 LORETA (Low Resolution Electromagnetic Tomography)
- **Introduced**: 1993-1994
- **Approach**: Weighted minimum norm with Laplacian smoothness constraint
- **Resolution**: Low (blurred)
- **Localization**: Has small localization bias
- **Use**: Early method; largely superseded by sLORETA/eLORETA

#### 9.2 sLORETA (Standardized LORETA)
- **Introduced**: 2002
- **Approach**: Standardizes current density estimates by their variance
- **Key advantage**: Zero localization error for point sources
- **Resolution**: Improved over LORETA
- **False positives**: Larger false positive brain volume than eLORETA
- **Use**: Widely used for group studies; source-level connectivity

#### 9.3 eLORETA (Exact LORETA)
- **Introduced**: 2007-2011
- **Approach**: Exact low resolution electromagnetic tomography with exact localization
- **Key advantage**: Zero localization error AND minimal false positive connectivity
- **Resolution**: Best among LORETA family
- **Performance**: Superior to sLORETA in simulation studies
- **Use**: Gold standard for LORETA-based source imaging

#### 9.4 MNE (Minimum Norm Estimate)
- **Approach**: Minimum L2 norm solution
- **Bias**: Toward superficial sources
- **Use**: Good for distributed sources; common in MNE-Python

#### 9.5 dSPM (Dynamic Statistical Parametric Mapping)
- **Approach**: Noise-normalized MNE
- **Use**: Statistical mapping of source activity

#### 9.6 Beamformers (LCMV)
- **Approach**: Spatial filtering; suppresses noise from other sources
- **Use**: Best for few focal sources
- **Limitation**: Poor for widely distributed sources

### Comparative Performance (Simulations)

| Method | Localization Error | False Positive Activity | False Positive Connectivity |
|--------|-------------------|------------------------|---------------------------|
| **eLORETA** | Zero | Minimal | Minimal |
| **sLORETA** | Zero | Minimal | Moderate |
| **MNE** | Significant | Large | Large |
| **dSPM** | Significant | Large | Large |
| **LCMV Beamformer** | Significant | Large | Large |

### Design Implications for Source-Space Visualization

1. **3D brain rendering**: Show sources on inflated cortical surface or pial surface
2. **Multiple views**: Lateral, medial, dorsal, ventral, anterior, posterior
3. **Color scale**: Use heatmap on cortical surface; threshold at statistical significance
4. **Glass brain**: Axial, sagittal, coronal slices for reference
5. **Time series**: Overlay source time course alongside topomap
6. **ROI labels**: Display anatomical labels (e.g., from AAL or Desikan-Killiany atlases)
7. **Method indicator**: Always label which inverse method was used
8. **Orientation**: Show current source arrows or vector fields if available

---

## 10. Band Ratio Maps

### Concept

Band ratio maps display the spatial distribution of the ratio between two frequency bands across all electrodes. Unlike single-band power maps, ratio maps capture the balance between different neural oscillatory processes.

### Common Ratio Maps

| Ratio Map | Clinical Interpretation |
|-----------|------------------------|
| **Theta/Beta** | Cortical hypoarousal; ADHD risk; attentional capacity |
| **Theta/Alpha** | Cognitive slowing; subcortical vascular damage |
| **Delta/Alpha** | EEG slowing; dementia severity; encephalopathy |
| **Alpha3/Alpha2** | Degenerative vs. vascular cognitive impairment |
| **Theta/Gamma** | Memory encoding deficit; amygdalo-hippocampal dysfunction |

### Calculation

```python
# Pseudocode for band ratio map
ratio_map = band1_power_map / band2_power_map
# Optionally log-transform:
log_ratio_map = log(band1_power_map / band2_power_map) = log(band1) - log(band2)
```

### Visualization Design

1. **Color scheme**: Diverging colormap centered at ratio = 1.0 (or log-ratio = 0)
2. **Log transformation**: Recommended for better distributional properties
3. **Thresholding**: Mask values below statistical significance
4. **Reference**: Overlay normative mean ratio contours
5. **Comparison view**: Side-by-side with individual band maps for context
6. **Z-score conversion**: Convert ratio to z-score against normative database

---

## 11. Microstate Analysis

### Concept

EEG microstates are brief (~60-120 ms), quasi-stable topographic configurations of the ongoing EEG scalp potential field. They represent "atoms of thought" -- discrete mental states that transition between each other. Four canonical microstate classes (A-D) have been identified across studies.

### Canonical Microstate Classes

| Class | Topography | Association |
|-------|-----------|-------------|
| **Class A** | Right-frontal to left-posterior | Visual processing; ventral stream |
| **Class B** | Left-frontal to right-posterior | Auditory processing; verbal cognition |
| **Class C** | Frontal-central | Salience/interoception; self-referential processing |
| **Class D** | Frontal to occipital | Attention reorientation; executive control |

### Analysis Pipeline

```
1. Preprocessing
   -> Bandpass filter (typically 2-20 Hz or 1-40 Hz)
   -> Artifact rejection

2. GFP Peak Detection
   -> Calculate Global Field Power: GFP(t) = sqrt(mean(V_i(t)^2))
   -> Identify local maxima of GFP (most stable topographies)

3. Clustering
   -> Modified K-means on GFP peak topographies
   -> Determine optimal number of clusters (typically 3-7)
   -> Polarity-invariant (sign-flip allowed)

4. Backfitting
   -> Assign every time point to the most similar microstate prototype
   -> Calculate temporal parameters

5. Parameter Extraction
   -> Duration, occurrence, coverage per microstate
   -> Transition probabilities
   -> Global Explained Variance (GEV)
```

### Key Metrics

| Metric | Definition |
|--------|-----------|
| **Duration** | Mean time spent in a microstate before transitioning (ms) |
| **Occurrence** | Number of microstate appearances per second |
| **Coverage** | Percentage of total time spent in each microstate class |
| **GEV** | Global Explained Variance -- how well templates explain the data |
| **Transition Probability** | Likelihood of transitioning from one class to another |

### Clinical Applications

| Condition | Microstate Findings |
|-----------|-------------------|
| **Schizophrenia** | Altered duration and transition patterns of classes C and D |
| **Depression** | Class C abnormalities; reduced class D duration |
| **ADHD** | Altered microstate sequences; reduced class C stability |
| **Dementia/AD** | Anteriorization of microstate fields; reduced microstate duration |
| **Sleep** | Characteristic microstate sequences by sleep stage |
| **Meditation** | Increased class D duration; altered transition patterns |

### Design Implications

1. **Display canonical templates**: Show class A-D maps as reference
2. **Individual maps**: Compare individual's microstate maps to canonical templates
3. **Temporal dynamics**: Show microstate sequence as colored bar (chronogram)
4. **GFP overlay**: Plot GFP curve with microstate assignments colored underneath
5. **Statistics**: Duration, occurrence, coverage bar charts with group comparisons
6. **Transition matrix**: Heatmap of transition probabilities between classes

---

## 12. Key Design Recommendations

### 12.1 Visualization Architecture

```
RECOMMENDED PANEL LAYOUT (per subject/condition):

Row 1: Raw PSD
  [Power Spectral Density Plot] - log scale, all bands shaded
  - Mark IAF with vertical line and value label
  - Show band boundaries (delta/theta/alpha/beta/gamma)

Row 2: Absolute Power Topomaps
  [Delta] [Theta] [Alpha] [Beta] [Gamma]
  - Shared color scale within each band across conditions
  - Spherical spline interpolation
  - Perceptually uniform colormap (Viridis/Plasma)

Row 3: Relative Power Topomaps
  [Delta] [Theta] [Alpha] [Beta] [Gamma]
  - Same layout as Row 2
  - Percentage units (0-100%)

Row 4: Z-Score Maps
  [Delta] [Theta] [Alpha] [Beta] [Gamma]
  - Diverging colormap (RdBu_r)
  - Threshold lines at +/- 1, 2, 3 SD
  - Mask non-significant areas (p > 0.05)

Row 5: Band Ratio Maps
  [Theta/Beta] [Theta/Alpha] [Delta/Alpha]
  - Diverging colormap centered at 1.0 (or 0 for log)
  - Overlay normative contours

Row 6: Asymmetry
  [F3/F4 Alpha Asymmetry] - left-right differential map
  - Diverging colormap (RdBu_r) centered at zero
  - Show positive (left activation) and negative (right activation)

Row 7: Source Space (optional)
  [eLORETA activation map] - 3D cortical surface
  - Multiple views (lateral, dorsal, medial)
  - Threshold at statistical significance
```

### 12.2 Color Scheme Standards

| Data Type | Recommended Colormap | Python (matplotlib) | JavaScript (d3) |
|-----------|---------------------|-------------------|-----------------|
| Absolute/Relative Power | Sequential | `viridis`, `plasma` | `interpolateViridis` |
| Z-Score (bipolar) | Diverging | `RdBu_r`, `coolwarm` | `interpolateRdBu` |
| Asymmetry | Diverging | `RdBu_r` | `interpolateRdBu` |
| Band Ratios | Diverging | `RdBu_r` | `interpolateRdBu` |
| Connectivity | Sequential (for strength) | `hot`, `YlOrRd` | `interpolateYlOrRd` |
| Phase | Cyclic | `hsv` | `interpolateHcl` |
| Source Space | Sequential | `hot`, `inferno` | `interpolateInferno` |

### 12.3 Interactive Features

1. **Click-to-zoom**: Click any topomap to expand to full detail
2. **Time slider**: For animated topomaps, draggable time indicator
3. **Band toggles**: Show/hide individual band panels
4. **Condition switcher**: Toggle between EO/EC/task conditions
5. **Normalization toggle**: Switch between absolute, relative, and z-score
6. **Electrode info**: Hover to show exact value at electrode position
7. **Export**: PNG/SVG export for each panel; video export for animations
8. **Split view**: Side-by-side comparison of two subjects or conditions
9. **Difference map**: Subtract two conditions and show as z-score deviation

### 12.4 Data Processing Pipeline

```
Input: Raw EEG (EDF/BDF/SET format)
  |
  v
[1] Preprocessing
    - Bandpass filter: 0.5 - 50 Hz (or 0.1 - 100 Hz)
    - Notch filter: 50/60 Hz line noise
    - Artifact rejection: ICA for ocular/cardiac artifacts
    - Bad channel interpolation
    |
    v
[2] Spectral Decomposition
    - Welch's method: 2-4s Hamming windows, 50% overlap
    - FFT with zero-padding for frequency resolution
    - OR: Multitaper method for smoother estimates
    |
    v
[3] Band Power Extraction
    - Fixed bands: delta(0.5-4), theta(4-8), alpha(8-13), beta(13-30), gamma(30-100)
    - OR: IAF-based individualized bands
    - Compute absolute and relative power per channel
    |
    v
[4] IAF Extraction
    - SGF-smoothed peak detection at posterior electrodes
    - OR: FOOOF-based alpha peak detection
    - Report IAF value and confidence
    |
    v
[5] Normative Comparison
    - Load age-matched normative database
    - Compute z-scores for all metrics
    - Flag significant deviations (>2 SD)
    |
    v
[6] Asymmetry Calculation
    - Compute ln(F4)-ln(F3) for alpha band
    - Calculate z-score against normative asymmetry values
    |
    v
[7] Band Ratio Calculation
    - Compute theta/beta, theta/alpha, delta/alpha ratios
    - Log-transform for normality
    - Compare to normative database
    |
    v
[8] Topomap Generation
    - Spherical spline interpolation
    - Apply appropriate colormap
    - Add electrode labels and head outline
    |
    v
[9] Source Localization (optional)
    - Compute forward model (BEM or FEM)
    - Apply eLORETA or sLORETA inverse solution
    - Project to cortical surface
    |
    v
[10] Microstate Analysis (optional)
    - Filter 2-20 Hz
    - GFP peak detection
    - Modified K-means clustering
    - Backfitting and parameter extraction
    |
    v
Output: Comprehensive QEEG report with topomaps, z-scores, ratios, asymmetry, source maps, microstates
```

### 12.5 Recommended Electrode Configurations

| Application | Minimum Electrodes | Preferred |
|-------------|-------------------|-----------|
| Basic QEEG (5 bands) | 19 (10-20 system) | 32-64 |
| IAF measurement | 6 (P3, Pz, P4, O1, Oz, O2) | 19+ |
| Asymmetry (F3/F4) | 4 (F3, F4, F7, F8) | 19+ |
| Theta/Beta ratio (ADHD) | 1 (Cz) + context | 19-32 |
| Source localization | 32 | 64-128 |
| Microstate analysis | 19 | 30-64 |

### 12.6 Units and Scaling

| Metric | Unit | Display Format |
|--------|------|----------------|
| Absolute Power | uV^2/Hz or dB | Log scale for display |
| Relative Power | % (0-100) | Linear scale |
| Power Ratio | Unitless | Log-transform for display |
| Z-Score | Standard deviations | Diverging scale, centered at 0 |
| Asymmetry | Unitless (log difference) | Diverging scale, centered at 0 |
| IAF | Hz | Decimal (e.g., 10.25 Hz) |
| Coherence | 0-1 | Linear scale |
| Phase | Degrees or radians | Circular scale |

### 12.7 Accessibility and Reporting Standards

1. **Always label axes** with units and frequency ranges
2. **Include recording condition**: eyes-open, eyes-closed, or task
3. **Specify electrode system**: 10-20, 10-10, or 10-05
4. **Reference scheme**: Average reference, Cz reference, or CSD
5. **Color bar**: Always include with clear numerical labels
6. **Nose indicator**: Clearly mark nose direction
7. **Statistical notation**: Mark significant values (*, **, ***) on maps
8. **Time windows**: Specify epoch length and overlap
9. **Filter settings**: Document all filter parameters (high-pass, low-pass, notch)
10. **Interpolation method**: State whether spherical spline, cubic, or linear

### 12.8 Performance Considerations

| Consideration | Recommendation |
|--------------|----------------|
| **Map resolution** | 64x64 for interactive; 128x128 for export |
| **Interpolation caching** | Pre-compute interpolation weights for repeated maps |
| **Animation optimization** | Decimate time points; use blitting for matplotlib |
| **Data loading** | Lazy loading for large datasets; show loading indicators |
| **Real-time updates** | WebSocket for live neurofeedback; 10 Hz update rate |
| **Export quality** | SVG for vector quality; PNG at 300 DPI for print |
| **Mobile responsiveness** | Stacked layout; touch-friendly controls; swipe for conditions |

---

## References and Key Sources

1. Corcoran, A.W. et al. (2018). Toward a reliable, automated method of individual alpha frequency (IAF) quantification. *Psychophysiology*, 55(7), e13064.
2. Busch, N.A. et al. (2024). Individual peak alpha frequency does not index individual differences in inhibitory control. *Psychophysiology*.
3. Moretti, D.V. et al. (2007). Quantitative EEG Markers in Mild Cognitive Impairment. *Clinical Neurophysiology*.
4. Arns, M. et al. (2016). The utility of EEG theta/beta power ratio in ADHD diagnosis. *Neurology* (AAN Practice Advisory).
5. Li, Y. et al. (2024). Theta/beta ratio in EEG correlated with attentional capacity in children with ADHD. *PMC*.
6. Wei, Y. et al. (2025). Meta-analysis of resting frontal alpha asymmetry as a biomarker of depression. *Nature npj Mental Health Research*.
7. Cavanagh, J.F. et al. (2022). The Novel Frontal Alpha Asymmetry Factor. *Psychophysiology*, 59(11), e14109.
8. Jatoi, M.A. et al. (2014). EEG based brain source localization comparison of sLORETA and eLORETA. *Australasian Physical & Engineering Sciences in Medicine*.
9. Pascual-Marqui, R.D. (2007). Discrete, 3D distributed, linear imaging methods of electric neuronal activity. *arXiv preprint*.
10. Michel, C.M. & Koenig, T. (2018). EEG microstates as a tool for studying the temporal dynamics of whole-brain neuronal networks. *NeuroImage*.
11. Thatcher, R.W. (2003). *Neurofeedback and the Neural Spectrum*. QEEG normative database methodology.
12. Angelakis, E. et al. (2007). EEG neurofeedback: peak alpha frequency training for cognitive enhancement in the elderly. *The Clinical Neuropsychologist*.
13. Power Struggles: Absolute vs. Relative EEG Power in Developmental Neuroscience (2025). *SSRN*.
14. Trends in Neurosciences (2026). EEG microstates: from methodological foundations to clinical applications.
15. BitBrain. (2025). What is QEEG Brain Mapping & how to interpret it.
16. MNE-Python. (2026). Frequency and time-frequency sensor analysis; Plotting topographic maps of evoked data.

---

*Document compiled for DeepSynaps Protocol Studio research pipeline. Last updated based on literature through 2025-2026.*
