# QEEG Connectivity Analysis: Design Document

> **Version**: 1.0 | **Scope**: DeepSynaps Protocol Studio connectivity module
> **Coverage**: Coherence, PLI, imaginary coherence, wPLI, phase-amplitude coupling, graph metrics, network hubs, DMN/salience/executive proxies, volume conduction caveats, source-space connectivity

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Foundations of EEG Connectivity](#2-foundations-of-eeg-connectivity)
3. [Method 1: Coherence & Magnitude-Squared Coherence](#3-method-1-coherence)
4. [Method 2: Phase Lag Index (PLI) & Weighted PLI (wPLI)](#4-method-2-pli--wpli)
5. [Method 3: Imaginary Coherence](#5-method-3-imaginary-coherence)
6. [Method 4: Phase-Amplitude Coupling (PAC)](#6-method-4-phase-amplitude-coupling)
7. [Method 5: Graph-Theoretic Network Metrics](#7-method-5-graph-theoretic-network-metrics)
8. [Network Hubs & Hub Identification](#8-network-hubs--hub-identification)
9. [Large-Scale Network EEG Proxies](#9-large-scale-network-eeg-proxies)
10. [Volume Conduction Caveats](#10-volume-conduction-caveats)
11. [Source-Space Connectivity](#11-source-space-connectivity)
12. [Implementation Recommendations](#12-implementation-recommendations)
13. [References](#13-references)

---

## 1. Executive Summary

This document provides a comprehensive technical design for quantitative EEG (qEEG) connectivity analysis within the DeepSynaps Protocol Studio. It covers the five most essential connectivity methods, their mathematical foundations, practical implementation considerations, and the critical interpretational caveats that must guide their use.

### Top 5 Connectivity Methods (Ranked by Utility)

| Rank | Method | Key Strength | Primary Limitation |
|------|--------|-------------|-------------------|
| 1 | **Weighted Phase Lag Index (wPLI)** | Robust to volume conduction and noise; optimal sensitivity/specificity tradeoff | Cannot detect zero-phase-lag interactions; may miss indirect connectivity |
| 2 | **Coherence / Magnitude-Squared Coherence** | Intuitive, frequency-specific, widely validated | Severely confounded by volume conduction and common reference |
| 3 | **Imaginary Coherence** | Eliminates zero-phase-lag (volume conduction) effects entirely | Discards potentially real instantaneous interactions |
| 4 | **Phase-Amplitude Coupling (PAC)** | Captures cross-frequency coupling invisible to same-frequency measures | Sensitive to sharp transients and filtering artifacts; requires surrogate testing |
| 5 | **Graph-Theoretic Metrics (clustering, path length, betweenness)** | Characterizes network topology and identifies functional hubs | Threshold-dependent; requires careful multiple comparison correction |

These methods form a tiered toolkit: wPLI as the default phase-based measure, coherence for exploratory work with appropriate preprocessing, imaginary coherence when volume conduction is severe, PAC for cross-frequency questions, and graph metrics for characterizing network-level organization.

---

## 2. Foundations of EEG Connectivity

### 2.1 Functional vs. Effective Connectivity

**Functional Connectivity (FC)** quantifies statistical dependencies between neural signals without implying directionality or causality. FC metrics include coherence, phase synchronization, correlation, and mutual information.

**Effective Connectivity (EC)** assesses the directional influence one neural unit exerts over another, requiring a mechanistic model of cause-effect relationships. EC methods include Granger causality, transfer entropy, partial directed coherence (PDC), and directed transfer function (DTF).

### 2.2 Bivariate vs. Multivariate Analysis

- **Bivariate**: Pairwise electrode-to-electrode or source-to-source connectivity. Most commonly used; provides interpretable maps.
- **Multivariate**: Characterizes interactions across the entire network simultaneously using graph theory or multivariate autoregressive (MVAR) models.

### 2.3 Time-Domain vs. Frequency-Domain

- **Time-domain**: Correlation, mutual information, Granger causarity, transfer entropy
- **Frequency-domain**: Coherence, DTF, PDC, PLI, wPLI, imaginary coherence
- **Time-frequency**: Wavelet coherence, time-varying MVAR with Kalman filtering

### 2.4 Critical Preprocessing for Connectivity

1. **Re-referencing**: Common Average Reference (CAR) or REST (Reference Electrode Standardization Technique) are optimal. REST reconstructs data against an ideal point-at-infinity reference and is especially robust with >=32 channels. Avoid Cz and mastoid referencing for connectivity analysis.

2. **Artifact removal**: Wavelet-enhanced ICA (wICA) is recommended over standard ICA subtraction, as the latter can distort phase and produce spurious hyper-connectivity. Multiple Wiener filtering is an emerging alternative.

3. **Epoch length**: Minimum 4 seconds for accurate connectivity; optimal at >=6 seconds. Use 100+ sample epochs equal in number across conditions.

4. **Surface Laplacian**: Recommended as an additional volume conduction mitigation step for scalp-space analysis; isolates activity under each electrode relative to immediate neighbors.

---

## 3. Method 1: Coherence & Magnitude-Squared Coherence

### 3.1 Mathematical Definition

Coherence measures the linear correlation between two signals in the frequency domain. For two signals x(t) and y(t), the (complex) coherency is:

```
Cxy(f) = Sxy(f) / sqrt(Sxx(f) * Syy(f))
```

Where Sxy(f) is the cross-spectral density and Sxx(f), Syy(f) are the auto-spectral densities. The **magnitude-squared coherence** (MSC) is:

```
MSCxy(f) = |Sxy(f)|^2 / (Sxx(f) * Syy(f))
```

MSC ranges from 0 (no linear relationship) to 1 (perfect linear relationship at frequency f).

### 3.2 Implementation Pipeline

```
Raw EEG --> Segment into epochs --> Compute FFT per epoch --> 
Cross-spectral density (CSD) --> Average CSD across epochs --> 
Coherence = |CSD|^2 / (PSD_x * PSD_y)
```

### 3.3 Strengths

- Intuitive interpretation: bounded [0, 1]
- Frequency-specific: reveals which rhythms couple
- Computationally efficient
- Extensive literature for comparison

### 3.4 Critical Limitations

- **Volume conduction**: The primary confound. A single source visible at multiple electrodes creates spurious high coherence at zero phase lag.
- **Common reference**: Shared reference electrode inflates all pairwise measures.
- **Signal-to-noise ratio**: Low SNR artificially reduces coherence estimates.
- **Common input**: Two regions receiving input from a third appear coherent.
- **Sample size bias**: Fewer epochs produce systematically lower coherence.

### 3.5 Mitigation Strategies

- Apply surface Laplacian transform before computing coherence
- Use re-referencing (CAR or REST)
- Threshold or weight against zero-phase components
- Prefer source-space analysis for precise anatomical interpretation

### 3.6 When to Use

Coherence is best used as an exploratory measure after Laplacian transformation and CAR/REST re-referencing, or in source space where volume conduction effects are minimized. It remains valuable for its frequency specificity and extensive normative databases.

---

## 4. Method 2: Phase Lag Index (PLI) & Weighted PLI (wPLI)

### 4.1 Phase Lag Index (PLI)

The PLI quantifies the asymmetry of the distribution of phase differences between two signals. It was introduced by Stam et al. (2007) to address volume conduction.

**Core principle**: Volume conduction from a common source produces signals with zero (or pi) phase difference. True neural communication involves non-zero phase lag due to axonal transmission delays.

```
PLI = |<sign(dPhi)>|
```

Where dPhi is the phase difference and <> denotes the expected value. PLI ranges from 0 (no coupling or symmetric phase distribution around zero) to 1 (perfect phase locking at non-zero phase lag).

**Limitations of PLI**:
- Discontinuity at the transition between positive and negative phase lags
- Sensitivity to noise and volume conduction artifacts near zero phase
- Reduced statistical power due to binarization (sign function discards magnitude)

### 4.2 Weighted Phase Lag Index (wPLI)

The wPLI was introduced by Vinck et al. (2011) to address PLI's limitations. It weights phase leads/lags by the magnitude of the imaginary component of the cross-spectrum:

```
wPLI = |<Im(Sxy)>| / <|Im(Sxy)|>
```

Where Im(Sxy) is the imaginary part of the cross-spectral density. The imaginary component is maximal when the phase difference is +/- pi/2 and zero when the phase difference is 0 or pi.

### 4.3 Key Advantages of wPLI over PLI

1. **Robustness to noise**: Small but non-zero phase differences (potentially from volume conduction) contribute less than large phase differences near +/- pi/2
2. **Statistical power**: Continuous weighting preserves more information than PLI's sign-based binarization
3. **Reduced sensitivity to outliers**: Phase differences near the zero crossing are down-weighted
4. **Real-world applicability**: Performs well even with movement artifacts typical of non-laboratory settings

### 4.4 Implementation Pipeline

```
Raw EEG --> Preprocessing (CAR/REST + optional Laplacian) --> 
Bandpass filter (frequency bands of interest) --> Hilbert transform --> 
Extract instantaneous phase --> Compute cross-spectrum --> 
wPLI = mean(|Im(Sxy)|) / mean(abs(Im(Sxy)))
```

### 4.5 Interpretation Notes

- wPLI topographies differ fundamentally from coherence topographies
- wPLI is inherently nonlinear with a steep transition from negligible to significant values
- The distribution of wPLI values has many near-zero values, indicating high specificity
- wPLI reveals connections that power and coherence analyses miss entirely
- In the alpha band, wPLI shows a specific connectivity pattern consistent with default mode network posterior hub regions

### 4.6 When to Use

**wPLI is the recommended default connectivity measure** for most qEEG applications due to its optimal balance of volume conduction robustness, statistical power, and computational tractability. It is particularly valuable for:
- Resting-state connectivity analysis
- Task-related functional network identification
- Clinical settings with noisy data
- Longitudinal and intervention studies

---

## 5. Method 3: Imaginary Coherence

### 5.1 Mathematical Definition

Imaginary coherence takes only the imaginary part of the coherency:

```
IC(f) = Im(Cxy(f)) = Im(Sxy(f)) / sqrt(Sxx(f) * Syy(f))
```

Since volume conduction produces signals with zero phase lag (real-valued coherency), the imaginary component is insensitive to these spurious interactions.

### 5.2 Relationship to wPLI

wPLI is essentially a normalized, robust extension of imaginary coherence. While imaginary coherence uses the raw imaginary component, wPLI weights and normalizes it to improve statistical properties:

- Imaginary coherence: `Im(Sxy) / sqrt(Sxx * Syy)`
- wPLI: `|mean(Im(Sxy))| / mean(|Im(Sxy)|)`

### 5.3 Strengths

- Completely eliminates zero-phase-lag interactions (volume conduction)
- Computationally simple
- Physiologically grounded: true neural transmission involves time delays

### 5.4 Limitations

- Cannot detect any zero-phase-lag interactions, even if they represent true neural coupling (e.g., indirect connectivity via a common third region)
- Not normalized (unlike wPLI), making cross-frequency and cross-subject comparisons more difficult
- Less statistical power than wPLI

### 5.5 When to Use

Imaginary coherence is appropriate when:
- Volume conduction effects are severe and cannot be mitigated by other means
- Comparing with legacy studies that used this measure
- As a complementary measure alongside wPLI to confirm robustness of findings

---

## 6. Method 4: Phase-Amplitude Coupling (PAC)

### 6.1 Conceptual Foundation

Phase-amplitude coupling (also called cross-frequency coupling) measures the relationship between the phase of a slow oscillation (e.g., theta, 4-8 Hz) and the amplitude of a fast oscillation (e.g., gamma, 30-80 Hz). It captures a fundamental neural coding mechanism where slow rhythms "nest" or modulate fast rhythmic activity.

### 6.2 Measurement Methods

| Method | Computation | Strengths | Limitations |
|--------|------------|-----------|-------------|
| **Modulation Index (MI)** | KL divergence of amplitude distribution across phase bins from uniform | Most widely used; robust to noise; works with short segments | Sensitive to bin count; detects spurious coupling from sharp transients |
| **Mean Vector Length (MVL)** | Modulus of amplitude-weighted phase vector average | Intuitive; computationally efficient; good for real-time | Biased by amplitude outliers |
| **Phase-Locking Value (PLV)** | Consistency of phase-amplitude phase relationship | Normalizes for amplitude; good for cross-condition comparison | Requires longer data segments |
| **General Linear Model (GLM)** | Sinusoidal fit to amplitude-as-function-of-phase | Direct significance testing; handles confounds | Computationally heavier; assumes sinusoidal modulation |
| **Envelope-to-Signal Correlation (ESC)** | Correlation between LF signal and HF amplitude | Simple and intuitive | Sensitive to LF amplitude confounds |

### 6.3 Standard PAC Pipeline

```
Step 1: Bandpass filter into LF phase band (e.g., theta 4-8 Hz) and 
        HF amplitude band (e.g., gamma 30-80 Hz)
Step 2: Hilbert transform to extract LF instantaneous phase and 
        HF amplitude envelope
Step 3: Bin HF amplitude by LF phase (typically 18 bins)
Step 4: Compute modulation index as KL divergence from uniform distribution
Step 5: Surrogate testing (200+ permutations with random time shifts)
Step 6: Statistical significance against surrogate null distribution
```

### 6.4 Critical Artifacts and Controls

- **Sharp transients**: Spikes and muscle artifacts contain broadband energy that mimics PAC. Always validate with surrogate testing.
- **Edge artifacts**: Filtering introduces spurious coupling at segment boundaries. Use adequate padding.
- **Non-stationarity**: PAC is time-varying. Consider time-resolved (sliding window) analysis.
- **Multiple comparisons**: PAC analysis across all channel-frequency-frequency combinations requires correction (FDR, Bonferroni, or permutation testing).

### 6.5 Clinical and Cognitive Relevance

- Theta-gamma PAC in the hippocampus is linked to memory encoding
- Alpha-gamma PAC in visual cortex relates to attention and perception
- Slow oscillation-alpha PAC is a robust marker of anesthetic depth (In-Phase and Anti-Phase modes)
- Altered PAC is reported in Alzheimer's disease, Parkinson's disease, schizophrenia, and epilepsy

### 6.6 When to Use

PAC is the method of choice when:
- Investigating cross-frequency interactions
- Studying neural mechanisms of memory, attention, or consciousness
- Monitoring anesthetic depth
- Characterizing pathological oscillatory coupling in neurological disorders

---

## 7. Method 5: Graph-Theoretic Network Metrics

### 7.1 From Connectivity Matrix to Graph

A connectivity matrix (channels x channels) can be thresholded to create a binary or weighted graph where:
- **Nodes** = EEG channels (or source regions)
- **Edges** = Significant connections above threshold

### 7.2 Core Graph Metrics

#### Clustering Coefficient (C)
Measures local segregation: how interconnected a node's neighbors are.

```
C_i = (number of triangles connected to node i) / (number of possible triangles)
```

- High C indicates local specialization (neighboring regions form a functional unit)
- **Global clustering coefficient**: Average C across all nodes
- Healthy brains show high global clustering, indicating natural organization into specialized communities

#### Characteristic Path Length (L)
Measures global integration: the average minimum number of steps between any two nodes.

```
L = average(shortest_path_length(i,j)) for all node pairs (i,j)
```

- Short L means information can travel between any two regions efficiently
- In Alzheimer's disease, L increases as long-distance connections degrade
- The balance between high C and short L defines **small-world topology**

#### Betweenness Centrality (BC)
Identifies connector hubs: nodes that lie on the most shortest paths between other nodes.

```
BC_i = sum( number_of_shortest_paths_through_i / total_shortest_paths )
```

- High BC nodes act as information bridges; their failure disrupts network communication
- BC peaks often occur at the borders between network modules
- In the occipital alpha network, BC peaks correspond to default mode network hub regions

#### Additional Metrics

| Metric | Definition | Clinical Relevance |
|--------|-----------|-------------------|
| **Degree** | Number of edges per node | Identifies highly connected hub electrodes |
| **Strength** | Sum of edge weights per node | Quantifies total connectivity strength |
| **Modularity (Q)** | Degree to which network subdivides into communities | Higher Q = more segregated network architecture |
| **Eigenvector Centrality** | Importance weighted by importance of neighbors | Identifies influential core nodes |
| **Global Efficiency** | Inverse of average shortest path length | Overall network communication efficiency |
| **Local Efficiency** | Efficiency of subgraph around each node | Fault tolerance of local networks |

### 7.3 Thresholding Strategies

Graph metrics are sensitive to threshold choice. Common approaches:

1. **Proportional threshold**: Keep top X% of connections (e.g., 30%). Most common for between-group comparisons.
2. **Cost threshold**: Fix the number of edges as a fraction of possible edges.
3. **Statistical threshold**: Keep only statistically significant connections (with multiple comparison correction).
4. **Minimum spanning tree (MST)**: Use the backbone of the network; guarantees connectedness.

**Recommendation**: Use proportional thresholding with a range (e.g., 10-40%) and test whether results are stable across the range. Report the threshold explicitly.

### 7.4 Network-Based Statistics (NBS)

For group-level statistical inference on connectivity matrices, the Network-Based Statistic (Zalesky et al., 2010) controls family-wise error rate while detecting interconnected subnetworks. NBS has greater power than independent connection-by-connection correction when effects cluster in connected components.

### 7.5 When to Use

Graph metrics are essential when:
- Characterizing global brain network organization
- Identifying hub regions and connector nodes
- Comparing network topology between groups or conditions
- Tracking network changes over time or in response to interventions
- Diagnosing network-level disruptions in neurological and psychiatric disorders

---

## 8. Network Hubs & Hub Identification

### 8.1 Defining Network Hubs

Hubs are nodes with disproportionately high connectivity that play critical roles in network communication. In EEG connectivity networks, hubs are identified by combining multiple centrality measures.

### 8.2 Hub Classification Framework

| Hub Type | Criteria | Functional Role |
|----------|----------|----------------|
| **Provincial Hub** | High degree + high local clustering | Coordinates local module activity |
| **Connector Hub** | High betweenness centrality | Bridges between modules |
| **Kinless Hub** | High degree but low clustering | Connects across multiple communities |

### 8.3 Hub Identification Pipeline

```
Connectivity Matrix --> Threshold --> Graph --> 
Compute centrality measures (degree, betweenness, eigenvector) --> 
Normalize each measure to z-scores --> 
Identify hubs: nodes with z-score > 1.5 in at least 2 metrics
```

### 8.4 EEG-Specific Hub Considerations

- Hub locations at the sensor level reflect scalp projection patterns; source-level analysis provides anatomical precision
- In occipital alpha networks, hubs align with posterior default mode network regions
- Hub distribution changes with cognitive state: task engagement shifts hubs from default mode to executive/salience regions
- Hub disruption is a consistent finding in Alzheimer's disease, traumatic brain injury, and schizophrenia

---

## 9. Large-Scale Network EEG Proxies

### 9.1 Default Mode Network (DMN)

**Core regions**: Posterior cingulate cortex (PCC), medial prefrontal cortex (mPFC), angular gyrus, lateral temporal cortex

**EEG proxy markers**:
- Alpha band (8-13 Hz) connectivity in posterior regions (PCC hub)
- Increased alpha coherence/wPLI between posterior midline and lateral parietal electrodes
- DMN is most prominent during rest and internally-directed cognition
- DMN suppression during task engagement is a hallmark of normal function

**EEG electrode proxies**: Pz, POz, O1, O2, P3, P4 (posterior alpha hub)

### 9.2 Salience Network (SN)

**Core regions**: Anterior insula (AI), dorsal anterior cingulate cortex (dACC)

**EEG proxy markers**:
- Theta band (4-8 Hz) connectivity in fronto-central regions
- Theta coherence between Fz/Cz and fronto-lateral electrodes (F7, F8)
- SN activates in response to behaviorally relevant stimuli
- Right anterior insula is the key hub that initiates switching between DMN and ECN

**EEG electrode proxies**: Fz, Cz, F7, F8 (fronto-central theta)

### 9.3 Executive Control Network (ECN) / Central Executive Network

**Core regions**: Dorsolateral prefrontal cortex (DLPFC), posterior parietal cortex (PPC)

**EEG proxy markers**:
- Beta band (13-30 Hz) connectivity in fronto-parietal regions
- Gamma band (30-80 Hz) connectivity during high-demand cognitive tasks
- Increased beta/gamma coherence between frontal and parietal electrodes
- ECN is engaged during externally-directed, goal-oriented cognition

**EEG electrode proxies**: F3, F4, P3, P4 (fronto-parietal beta)

### 9.4 Triple-Network Dynamics

The interaction between DMN, SN, and ECN follows a characteristic pattern:

1. **Rest/DMN-dominant**: High posterior alpha connectivity; DMN internally active
2. **Salience detection**: SN (anterior insula) detects relevant stimuli
3. **Network switching**: SN disengages DMN and engages ECN
4. **Task/ECN-dominant**: High fronto-parietal beta/gamma connectivity

**Flow state signature**: During optimal engagement (flow), the right anterior insula shows increased coupling with DLPFC (ECN engagement) and decreased coupling with the ventral striatum (reduced reward-checking).

---

## 10. Volume Conduction Caveats

### 10.1 The Problem

Volume conduction is the passive propagation of electrical signals through biological tissue (brain, CSF, skull, scalp). A single neural source is visible at multiple EEG electrodes simultaneously. This creates:

- **Spurious zero-phase-lag coherence** between nearby electrodes
- **Inflated local connectivity** estimates
- **Artificially high clustering coefficients** for adjacent nodes
- **Misleading topographies** that reflect physical proximity rather than true functional coupling

### 10.2 Strategies to Mitigate Volume Conduction

| Strategy | Method | Effectiveness |
|----------|--------|--------------|
| **Phase-lagged measures** | wPLI, PLI, imaginary coherence, phase slope index | High; discards zero-phase interactions |
| **Spatial filtering** | Surface Laplacian, current source density | High; isolates local activity |
| **Source reconstruction** | Inverse solutions (sLORETA, MNE, WMN) | Very high; estimates underlying sources |
| **Bipolar derivations** | Local re-referencing schemes | Moderate; reduces but doesn't eliminate |
| **Experimental contrasts** | Condition subtraction | Moderate; assumes equal VC in both conditions |

### 10.3 Key Principles

1. **No method fully eliminates volume conduction** - each approach has trade-offs
2. **Lagged measures** (wPLI, imaginary coherence) are the most practical solution for scalp EEG
3. **Source-space analysis** is the gold standard when anatomical precision is required
4. **Combining strategies** (e.g., Laplacian + wPLI) provides the most robust estimates
5. **Interpretation caution**: Connectivity between adjacent electrodes should always be treated with skepticism

### 10.4 Practical Recommendations

- For scalp-space analysis: Use CAR/REST re-referencing + surface Laplacian + wPLI
- For source-space analysis: Use hdEEG (64+ channels) with sLORETA or MNE inverse solutions
- Report which VC mitigation strategies were employed
- Be cautious interpreting connectivity between electrodes < 4 cm apart

---

## 11. Source-Space Connectivity

### 11.1 Why Source Space?

Scalp EEG connectivity is confounded by volume conduction and limited spatial resolution. Source-space connectivity localizes signals to cortical regions before computing connectivity, providing:

- Anatomically interpretable connectivity
- Elimination of most volume conduction effects
- Integration with MRI-based parcellation atlases
- More accurate graph-theoretic analysis

### 11.2 Two Main Approaches

#### Inverse-Based Source FC (ISFC)
```
EEG --> Inverse solution (MNE, sLORETA, WMN) --> Source time series --> 
Functional connectivity estimation
```
- Best performance with **high-density EEG (hdEEG, 64+ channels)**
- ISFC outperforms sensor-space methods for hdEEG
- Accuracy depends on source localization quality

#### Cortical Partial Coherence (CPC)
```
EEG --> Lead-field matrix --> Partial coherence directly in source space
```
- Does not require individual source time series estimation
- Best performance with **low-density EEG (ldEEG, <32 channels)**
- More robust to SNR variations than ISFC

### 11.3 Critical Factors Affecting Source-Space FC Accuracy

| Factor | Effect on FC Accuracy |
|--------|----------------------|
| **Source depth** | Deep sources have high localization error; FC for deep sources is unreliable |
| **Sensor density** | hdEEG (>64 ch) produces best ISFC; ldEEG favors CPC |
| **SNR** | Higher SNR improves both methods; CPC more robust at low SNR |
| **Source distance** | Closer sources (< 90 mm) have higher FC estimation error |
| **Inverse method** | WMN, LORETA, LAURA show similar performance patterns |

### 11.4 Source-Space FC Pipeline

```
1. Preprocess EEG (re-reference, artifact removal)
2. Coregister electrode positions with individual MRI (or template)
3. Compute lead-field matrix using boundary element model (BEM)
4. Apply inverse solution to estimate source time series
5. Parcellate sources into ROIs using anatomical atlas (e.g., AAL, Desikan-Killiany)
6. Compute ROI-to-ROI connectivity using wPLI, coherence, or other measure
7. Apply graph metrics and network analysis
```

### 11.5 Recommendations by EEG System

| System Type | Recommended Method | Notes |
|-------------|-------------------|-------|
| hdEEG (64-256 ch) | ISFC with wPLI | Optimal spatial resolution; best ISFC performance |
| mdEEG (32-64 ch) | ISFC or CPC | Both viable; ISFC slightly preferred |
| ldEEG (8-32 ch) | CPC | ISFC localization errors too large |

---

## 12. Implementation Recommendations

### 12.1 Recommended Default Pipeline

For a general-purpose qEEG connectivity module, the recommended pipeline is:

```
1. Preprocessing
   - Re-reference to CAR or REST
   - Artifact removal (wICA or manual ICA)
   - Notch filter (50/60 Hz)
   - Surface Laplacian (optional, recommended)

2. Connectivity Estimation
   - Primary: wPLI (all frequency bands)
   - Secondary: Coherence (with caveats noted)
   - Cross-frequency: PAC (theta-gamma, alpha-gamma)

3. Network Analysis
   - Threshold connectivity matrix (proportional, 10-40% range)
   - Compute graph metrics (clustering, path length, betweenness, modularity)
   - Identify network hubs
   - Compare to normative templates

4. Statistical Inference
   - Non-parametric permutation testing
   - Network-based statistics (NBS) for group comparisons
   - Multiple comparison correction (FDR or cluster-based)

5. Reporting
   - Connectivity matrices (band-specific)
   - Graph metric summaries (global and nodal)
   - Hub identification maps
   - Network visualization (circular plots, adjacency matrices)
```

### 12.2 Frequency Band Definitions

| Band | Frequency | Primary Network Associations |
|------|-----------|------------------------------|
| Delta | 0.5-4 Hz | Deep sleep, unconsciousness |
| Theta | 4-8 Hz | Salience network, memory, emotional processing |
| Alpha | 8-13 Hz | Default mode network, visual cortex, inhibition |
| Beta | 13-30 Hz | Executive network, motor cortex, active cognition |
| Gamma | 30-80 Hz | Local processing, feature binding, consciousness |

### 12.3 Quality Checklist

Before reporting connectivity results, verify:

- [ ] Re-referencing method (CAR or REST) documented
- [ ] Artifact removal method and criteria specified
- [ ] Epoch length >= 4 seconds (>=6 optimal)
- [ ] VC mitigation strategy employed (wPLI + Laplacian or source-space)
- [ ] Multiple comparison correction applied
- [ ] Threshold choice justified and reported
- [ ] Results replicated with at least 2 metrics (if possible)
- [ ] Adjacent electrode pairs interpreted with caution

---

## 13. References

1. **Stam, C.J., Nolte, G., & Daffertshofer, A.** (2007). Phase Lag Index: Assessment of functional connectivity from multi channel EEG and MEG with diminished bias from common sources. *Human Brain Mapping*, 28(11), 1178-1193.

2. **Vinck, M., Oostenveld, R., van Wingerden, M., Battaglia, F., & Pennartz, C.M.A.** (2011). An improved index of phase-synchronization for electrophysiological data in the presence of volume-conduction, noise and sample-size bias. *NeuroImage*, 55(4), 1548-1565.

3. **Nolte, G., et al.** (2004). Identifying true brain interaction from EEG data using the imaginary part of coherency. *Clinical Neurophysiology*, 115(10), 2292-2307.

4. **Tort, A.B., Komorowski, R., Eichenbaum, H., & Kopell, N.** (2010). Measuring phase-amplitude coupling between neuronal oscillations of different frequencies. *Journal of Neurophysiology*, 104(2), 1195-1210.

5. **Bullmore, E. & Sporns, O.** (2009). Complex brain networks: graph theoretical analysis of structural and functional systems. *Nature Reviews Neuroscience*, 10(3), 186-198.

6. **Zalesky, A., Fornito, A., & Bullmore, E.T.** (2010). Network-based statistic: identifying differences in brain networks. *NeuroImage*, 53(4), 1197-1207.

7. **Cohen, M.X.** (2014). Analyzing Neural Time Series Data: Theory and Practice. *MIT Press*.

8. **Cohen, M.X.** (2015). Comparison of different spatial transformations applied to EEG data: A case study of error processing. *International Journal of Psychophysiology*, 97(3), 245-257.

9. **Srinivasan, R., Winter, W.R., Ding, J., & Nunez, P.L.** (2007). EEG and MEG coherence: measures of functional connectivity at distinct spatial scales of neocortical dynamics. *Journal of Neuroscience Methods*, 166(1), 41-52.

10. **Bastos, A.M. & Schoffelen, J.M.** (2016). A tutorial review of functional connectivity analysis methods and their interpretational pitfalls. *Frontiers in Systems Neuroscience*, 9, 175.

11. **Hillebrand, A., et al.** (2012). Direction of information flow in large-scale resting-state networks is frequency-dependent. *PNAS*, 109(30), E3037.

12. **Coito, A., et al.** (2016). Dynamic directed interictal connectivity in left and right temporal lobe epilepsy. *Epilepsia*, 57(2), e53-e57.

13. **Mahjoory, K., et al.** (2017). Consistency of EEG source localization and connectivity estimates. *NeuroImage*, 152, 590-601.

14. **Canuet, L., et al.** (2012). Resting-state network disruption and APOE genotype in Alzheimer's disease: a lagged functional connectivity study. *PLOS ONE*, 7(9), e46289.

15. **Menon, V. & Uddin, L.Q.** (2010). Saliency, switching, attention and control: a network model of insula function. *Brain Structure and Function*, 214(5-6), 655-667.

16. **Fraschini, M., et al.** (2016). The effect of epoch length on estimated EEG functional connectivity and network pattern. *Frontiers in Computational Neuroscience*, 10, 234.

17. **Chella, F., et al.** (2016). Functional source separation and hand cortical representation for a brain-computer interface feature extraction. *Journal of Neural Engineering*, 13(2), 026019.

18. **Bakhshayesh, H., et al.** (2019). The impact of noise and data length on 26 connectivity estimators. *Journal of Neural Engineering*, 16(6), 066024.

---

*Document generated for DeepSynaps Protocol Studio -- Connectivity Analysis Module*
