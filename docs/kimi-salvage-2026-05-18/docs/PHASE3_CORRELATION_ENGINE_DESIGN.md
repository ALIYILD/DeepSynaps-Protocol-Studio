# Phase 3: Clinical Correlation Engine Design

**DeepSynaps Protocol Studio — Technical Design Document**

**Version:** 1.0  
**Status:** Draft for Review  
**Date:** 2025-06-30  
**Classification:** Research & Architecture

---

## Executive Summary

This document presents the architectural and methodological design for the **Clinical Correlation Engine** (CCE), a core component of the DeepSynaps Protocol Studio responsible for detecting, quantifying, and visualizing temporal associations across heterogeneous clinical data streams. The CCE operates under a foundational constraint: **it detects temporal association only, never causal proof**. This epistemic boundary is not merely a disclaimer—it shapes every algorithmic choice, visualization pattern, and safety safeguard described herein.

The engine addresses five interrelated clinical analysis domains: (1) temporal association methods for multimodal time-series, including cross-correlation with lag analysis, dynamic time warping, and point process models; (2) longitudinal clinical dashboards that support trajectory analysis through mixed-effects modeling frameworks; (3) before/after intervention analysis incorporating the minimal clinically important difference (MCID) concept; (4) intervention response tracking via N-of-1 trial design patterns and single-case experimental design (SCED) methodology; and (5) a comprehensive safety and limitations framework addressing ecological fallacy, confounding, the multiple comparisons problem, and regression to the mean.

**Key Design Principles:**
- **Association, not causation**: All output is explicitly labeled with confidence levels and epistemic status
- **Personalization-first**: N-of-1 design patterns are first-class citizens, not afterthoughts
- **Clinical relevance over statistical significance**: MCID-based thresholds supersede p-value thresholds where appropriate
- **Transparency**: All correlation outputs include methodological limitations and alternative explanations

---

## Clinical Correlation Context

Clinical data presents unique challenges for temporal analysis. Unlike engineered systems with clean sampling rates and controlled inputs, clinical multimodal data exhibits irregular sampling, missing observations, varying time granularities (seconds for ICU monitors to months for outpatient follow-up), and complex confounding structures. A patient's blood pressure trajectory may correlate with medication timing, but it also co-varies with sleep quality, stress, dietary sodium, measurement device calibration, and countless unmeasured factors.

The CCE is designed to operate in this messy reality. It accepts data from wearable sensors, electronic health records (EHR), patient-reported outcome measures (PROMs), laboratory values, imaging biomarkers, and genomic profiles—each with distinct temporal characteristics. The engine's role is to surface candidate associations worthy of clinical attention, while aggressively preventing overinterpretation.

**Critical Distinction**: Temporal association identifies that two variables co-vary in time. Causal inference requires additional conditions: temporal precedence (the cause precedes the effect), covariate adjustment for confounders, and ideally, experimental manipulation (Holland, 1986; Rubin, 1974). The CCE satisfies itself with association and explicitly warns users when causal language is detected in their queries or interpretations.

---

## Temporal Association Methods

### Cross-Modality Correlation

The foundation of the CCE is cross-correlation analysis between pairs of clinical time-series. Given two series $X = \{x_1, x_2, ..., x_n\}$ and $Y = \{y_1, y_2, ..., y_n\}$ sampled at times $t = \{t_1, t_2, ..., t_n\}$, the Pearson cross-correlation coefficient at lag $k$ is defined as:

$$r_{XY}(k) = \frac{\sum_{i=1}^{n-k} (x_i - \bar{x})(y_{i+k} - \bar{y})}{\sqrt{\sum_{i=1}^{n} (x_i - \bar{x})^2 \sum_{i=1}^{n} (y_i - \bar{y})^2}}$$

For clinical applications, the CCE implements several extensions to standard cross-correlation:

1. **Irregular sampling handling**: Clinical data rarely arrives at regular intervals. The engine uses Gaussian process regression to impute and resample to a common temporal grid before correlation computation, with uncertainty propagation through the correlation estimate (Diggle et al., 2002).

2. **Robust correlation**: Pearson correlation assumes linear relationships and is sensitive to outliers. The CCE computes Spearman rank correlation and Kendall's tau as standard alternatives, flagging discrepancies between parametric and non-parametric estimates as potential non-linearity indicators.

3. **Windowed correlation**: Static correlation over an entire time-series may mask important dynamics. The engine supports sliding-window correlation with configurable window sizes, producing correlation trajectories that reveal periods of strong versus weak association. This is particularly valuable for detecting habituation effects or seasonal variation in clinical relationships.

### Lag Analysis

The temporal order of clinical events matters profoundly. A medication taken at 8 AM may affect blood glucose at 10 AM; a stressful event on Monday may influence sleep quality on Tuesday. Lag analysis systematically searches for time-shifted associations.

The CCE implements **cross-correlation lag analysis** across a user-configurable lag range (typically -7 to +7 days for outpatient data, -24 to +24 hours for inpatient monitoring). For each lag $k$, the engine computes the correlation coefficient and returns a lag-correlogram showing association strength as a function of time shift.

**Directionality convention**: Positive lags indicate that changes in series $X$ precede changes in series $Y$. The CCE explicitly marks the directionality in all outputs but accompanies it with a warning: "Temporal precedence is necessary but not sufficient for causal inference. Unmeasured confounders may produce spurious lead-lag relationships."

**Key limitations of lag analysis** that the engine surfaces to users:
- **Aliasing**: If the true lag exceeds the sampling interval (e.g., a weekly effect measured with monthly data), the analysis will miss it or detect a spurious harmonic
- **Variable lags**: Some clinical relationships have variable rather than fixed delays (e.g., medication onset varies by patient metabolism)
- **Feedback loops**: Bidirectional causation produces complex lag structures that simple cross-correlation cannot disentangle

### Event-Based Association

Not all clinical data arrives as regular time-series. Many critical clinical events—emergency department visits, medication changes, symptom flare-ups, adverse events—are best modeled as **temporal point processes**: random collections of points on the time line (Daley & Vere-Jones, 2003).

The CCE implements **Hawkes process models** for event-based association detection. A Hawkes process is a self-exciting point process where past events can trigger future events, characterized by the conditional intensity function:

$$\lambda(t | \mathcal{H}_t) = \mu + \sum_{t_i < t} \alpha \exp(-\beta(t - t_i))$$

where $\mu$ is the baseline intensity, $\alpha$ is the excitation magnitude, and $\beta$ controls the decay rate of excitation. In clinical terms: does one type of event (e.g., missed medication doses) transiently increase the probability of another (e.g., symptom exacerbations)?

For cross-modal event association, the CCE implements **mutually exciting Hawkes processes** that model excitation across event types. The engine estimates parameters via maximum likelihood and reports:
- Baseline intensities for each event type
- Excitation kernels (direction, magnitude, and temporal decay of cross-event excitation)
- Goodness-of-fit via Kolmogorov-Smirnov tests on transformed residuals

**Important safety note**: Hawkes processes model excitation patterns, not causal mechanisms. A patient may experience both symptom exacerbations and medication non-adherence because a third factor (e.g., depression) affects both. The model captures the association; clinical judgment is required to assess causality.

### Dynamic Time Warping for Misaligned Series

When clinical time-series have similar shape but different timing—common when comparing patients with different disease progression rates or treatment response speeds—**Dynamic Time Warping (DTW)** provides a distance measure that is invariant to temporal distortion (Berndt & Clifford, 1994).

DTW finds an optimal alignment between two time-series by constructing a cost matrix $C$ where each cell $C(i,j)$ represents the distance between points $x_i$ and $y_j$, then finding the warping path $P$ through this matrix that minimizes cumulative cost:

$$DTW(X, Y) = \min_P \sum_{(i,j) \in P} d(x_i, y_j)$$

The CCE uses DTW in two modes:
1. **Within-patient trajectory comparison**: Comparing a patient's current episode to their historical episodes to detect changes in disease dynamics
2. **Across-patient similarity**: Grouping patients by similar temporal patterns despite different absolute timing

Recent advances in DTW for clinical applications include **directed DTW** that constrains warping paths to enforce temporal precedence, providing a bridge to lag analysis (Kopland et al., 2024). The CCE incorporates directed DTW with Sakoe-Chiba band constraints to prevent pathological warpings that violate causality's temporal ordering requirement.

---

## Longitudinal Dashboard Design

### Visualizing Change Over Time

The longitudinal dashboard serves as the primary interface between the correlation engine and clinical users. Its design follows Cleveland's principles of graphical perception (Cleveland & McGill, 1984) with clinical-specific adaptations:

1. **Individual trajectories first**: Following the personalized medicine paradigm, dashboards display individual patient trajectories as the primary visual element, with population averages as secondary reference lines. This prevents the ecological fallacy of assuming group-level trends apply to individuals (see Safety & Limitations).

2. **Multimodal faceting**: Different data modalities (vitals, labs, symptoms, medications) are displayed in vertically stacked panels with synchronized time axes, enabling visual cross-correlation inspection.

3. **Uncertainty representation**: All trajectory estimates display confidence intervals or prediction bands. Missing data periods are explicitly marked rather than interpolated without indication.

4. **Event annotations**: Intervention times, medication changes, adverse events, and clinical encounters are overlaid as annotated markers on all relevant panels, providing temporal context for observed changes.

### Trajectory Analysis with Mixed-Effects Models

The statistical backbone of longitudinal visualization is the **linear mixed-effects model (LMM)**, which handles the hierarchical structure of clinical data (repeated measurements nested within patients) (Laird & Ware, 1982; Fitzmaurice et al., 2011).

The basic LMM for a clinical outcome $Y_{ij}$ (measurement $j$ for patient $i$) is:

$$Y_{ij} = \beta_0 + \beta_1 t_{ij} + \beta_2 X_i + u_{0i} + u_{1i} t_{ij} + \epsilon_{ij}$$

where $\beta$ are fixed effects (population-average parameters), $u_i$ are random effects (patient-specific deviations), and $\epsilon_{ij}$ is residual error. The random effects $u_{0i}$ (random intercept) and $u_{1i}$ (random slope) capture individual variation in baseline and rate of change.

**Why mixed-effects models for clinical dashboards?**
- They handle **unbalanced data**: Patients have different numbers of observations at different times
- They handle **missing data**: Valid inference under missing-at-random assumptions via full-information maximum likelihood
- They provide **individual predictions**: Empirical Bayes estimates of random effects enable personalized trajectory forecasting
- They separate **within-patient** from **between-patient** variation, preventing confounding at the ecological level

The CCE uses LMMs to generate smoothed trajectories, predict future values with prediction intervals, and estimate growth curves for developmental or disease progression modeling. Model selection (covariance structure, random effects structure) uses information criteria (AIC, BIC) with restricted maximum likelihood (REML) estimation.

### Growth Curve Models

For non-linear trajectories common in clinical data (e.g., recovery curves, disease progression), the CCE supports **growth curve models** with polynomial time or spline bases. The general form:

$$Y_{ij} = \sum_{k=0}^{K} \beta_k t_{ij}^k + \sum_{k=0}^{K} u_{ki} t_{ij}^k + \epsilon_{ij}$$

allows flexible modeling of within-patient change while maintaining the mixed-effects framework for population-level inference. The engine automatically selects polynomial degree via model comparison or uses restricted cubic splines for semi-parametric flexibility.

---

## Before/After Analysis Framework

### Defining Intervention Windows

Before/after analysis compares clinical measurements during a baseline period (pre-intervention) to measurements during a follow-up period (post-intervention). The validity of such comparisons depends critically on **window definition**:

1. **Baseline window**: Must be long enough to characterize stable pre-intervention status but short enough to avoid secular trends or anticipatory effects. The CCE defaults to 7-14 days for acute interventions and 30 days for chronic disease management, with user override.

2. **Washout periods**: For pharmacological interventions, a washout period may be needed to clear previous treatments. The engine supports configurable washout windows where data is excluded from analysis.

3. **Follow-up window**: Should align with the expected time course of intervention effect. Too short misses delayed effects; too long risks confounding by other interventions or natural history changes.

4. **Staggered adoption support**: The CCE handles interventions started at different times for different patients—a common observational pattern—using **difference-in-differences** or **synthetic control** approaches.

### Baseline vs. Follow-Up Comparison

The standard analytical approach compares summary statistics (mean, median, variability) between baseline and follow-up periods. The CCE implements:

- **Paired t-tests** or **Wilcoxon signed-rank tests** for within-patient comparison
- **Standardized mean difference** (Cohen's d) for effect size quantification
- **Percentage change** from baseline with confidence intervals

However, the engine prominently displays a warning: "Before/after comparisons without concurrent controls are vulnerable to regression to the mean, natural history effects, and confounding by indication. Interpret with caution."

### Minimal Clinically Important Difference (MCID)

Statistical significance does not imply clinical importance. A reduction in blood pressure from 140 to 138 mmHg may be statistically significant with large N but clinically meaningless. The **Minimal Clinically Important Difference (MCID)** addresses this by defining the smallest change in an outcome that patients perceive as beneficial (Jaeschke et al., 1989; Guyatt et al., 1987).

The CCE incorporates MCID through two methodological families (Copay et al., 2007; Angst et al., 2017):

**Anchor-based methods**: Compare score changes to an external patient-reported anchor (e.g., "How much better do you feel? Much better / A little better / Same / Worse"). The MCID is the mean score change for patients reporting "a little better."

**Distribution-based methods**: Define MCID relative to measurement precision:
- **Standard Error of Measurement (SEM)**: $MCID = \sigma_1 \sqrt{1 - r}$, where $\sigma_1$ is baseline standard deviation and $r$ is test-retest reliability
- **Effect size approach**: $MCID = 0.2 \times \sigma_{baseline}$ (small effect size threshold)
- **Standardized Response Mean**: Ratio of mean change to standard deviation of change

**Critical implementation note**: MCID values are context-specific, varying by disease, population, baseline severity, and treatment modality (Wang et al., 2022). The CCE requires users to specify MCID sources (literature values, anchor studies, or distribution-based calculations) and flags when applied MCIDs come from different populations than the current patient.

### Statistical Process Control for Clinical Monitoring

For continuous monitoring of clinical metrics (e.g., ICU vital signs, chronic disease biomarkers), the CCE integrates **Statistical Process Control (SPC)** methods originally developed for industrial quality control and adapted for healthcare (Mohammed et al., 2001; Thor et al., 2007).

**Control charts** plot measurements over time against statistically derived control limits (typically $\pm 3$ standard deviations from the process mean). The CCE implements:

- **Shewhart charts**: For detecting large, sudden shifts in process mean
- **Cumulative sum (CUSUM) charts**: For detecting small, persistent shifts
- **Exponentially weighted moving average (EWMA) charts**: For smoothing noisy clinical data while detecting gradual trends

**Western Electric rules** flag "special cause variation" (potential clinical concern): single point beyond 3$\sigma$, two of three points beyond 2$\sigma$, eight consecutive points on one side of the centerline, and other pattern-based rules.

**SPC limitations**: Control limits represent statistical stability, not clinical targets. A process can be "in statistical control" yet clinically unacceptable (e.g., blood pressure consistently at 160/100 with low variability). The engine displays both statistical control limits and clinical target ranges, distinguishing between statistical and clinical significance.

---

## Intervention Response Tracking

### N-of-1 Designs

N-of-1 trials are single-patient, multiple-crossover experiments where a patient receives alternating periods of treatment and placebo (or treatments A and B), with randomization of treatment order (Guyatt et al., 1986; Zucker et al., 1997). They represent the pinnacle of personalized evidence generation, providing causal inference about treatment effectiveness for an individual patient.

The CCE implements N-of-1 analysis patterns:

**Design patterns**:
- **A-B-A-B withdrawal design**: Treatment and control periods alternate, with randomization of period order
- **Multiple crossover**: More than two treatment periods to improve precision and assess carryover effects
- **Adaptive N-of-1**: Treatment assignment adapts based on accumulating response data

**Analysis methods**:
- **Randomization tests**: The gold standard for N-of-1 inference. Under the null hypothesis of no treatment effect, the observed outcome pattern is equally likely under any treatment permutation. The p-value is the proportion of permutations yielding a test statistic as extreme as observed (Edgington & Onghena, 2007).
- **Mixed-effects meta-analysis of N-of-1 trials**: When multiple patients complete N-of-1 protocols, their results can be pooled via mixed-effects models, combining personalized precision with population-level generalization (Zucker et al., 1997).

**The CCE's role**: The engine supports N-of-1 design by (1) tracking treatment periods and randomization, (2) computing within-period summary statistics, (3) executing randomization tests, and (4) generating visualizations comparing treatment versus control periods with confidence intervals.

### SCED Methodology

Single-Case Experimental Designs (SCEDs) extend N-of-1 concepts with more rigorous methodological controls (Kazdin, 2011; Tate et al., 2008). They are increasingly recognized in evidence hierarchies for rehabilitation, behavioral health, and rare diseases where traditional RCTs are infeasible (Yang et al., 2024).

**Core SCED features implemented in the CCE**:

1. **Repeated systematic assessment**: Frequent, standardized measurement of outcomes during all phases. The engine supports customizable assessment schedules with automated reminders and data quality checks.

2. **Phase-based analysis**: SCEDs typically involve baseline (A) and intervention (B) phases, with extensions to multiple interventions (A-B-A-B, A-B-C-B) and parametric dosing designs. The CCE provides:
   - Phase-stratified descriptive statistics
   - **Percentage of non-overlapping data (PND)**: Simple effect size metric for SCEDs
   - **Tau-U**: Non-overlap effect size with baseline trend control (Parker et al., 2011)
   - **Between-phase randomization tests**: Statistical inference for phase transitions

3. **Visual analysis**: SCED tradition emphasizes visual inspection of graphed data as primary analysis. The CCE generates publication-standard SCED graphs with:
   - Phase separation lines clearly marked
   - Trend lines within phases
   - Variability bands (mean $\pm$ 1 SD per phase)
   - Data paths with individual data points visible

4. **Internal validity enhancements**:
   - **Masked visual analysis**: Blinding analysts to phase transition points to reduce bias
   - **Randomization of phase start points**: Statistical rigor through design rather than large sample size
   - **Replication**: Within-patient (multiple phase transitions) and across-patient replication

**Responder vs. Non-Responder Identification**:

The CCE implements **personalized response profiling** by comparing a patient's response trajectory to their own baseline and, where available, to population distributions of placebo responses. A "responder" is defined not by arbitrary dichotomization but by:
- Achieving change exceeding the MCID
- Demonstrating separation from the patient's own baseline variability (signal > noise)
- Showing temporal association with intervention onset (within-patient causal criterion)

Machine learning clustering (e.g., Partition Around Medoids) can identify distinct response phenotype subgroups when multiple patients' response trajectories are available, moving beyond binary responder/non-responder classification to continuous response profiling (Agapow et al., 2020).

---

## Safety & Limitations

### Ecological Fallacy in Temporal Data

The **ecological fallacy** is the error of inferring individual-level relationships from group-level data (Robinson, 1950). In longitudinal clinical analysis, this manifests when population-average trajectories (e.g., "depression scores decrease linearly over 12 weeks of therapy") are assumed to apply to individual patients, who may show highly non-linear, heterogeneous, or even opposite patterns (Molenaar & Campbell, 2009).

**CCE safeguards**:
- Mixed-effects models with random slopes explicitly model individual deviation from population trends
- Dashboards display individual trajectories as primary visual elements
- Subgroup analysis flags when within-group relationships differ from between-group relationships (Simpson's paradox detection)
- All population-level summaries include measures of between-individual heterogeneity (random effects variance, 95% prediction intervals)

### Confounding in Observational Designs

Confounding occurs when a third variable causally influences both the exposure and outcome, creating a spurious association. In temporal clinical data, confounding is pervasive: patients who exercise more may also eat healthier, have higher socioeconomic status, and adhere better to medication regimens.

**The CCE addresses confounding through**:

1. **Explicit covariate adjustment**: Mixed-effects models include measured confounders as fixed effects
2. **Sensitivity analysis**: The engine reports how association estimates change under different sets of adjusted covariates
3. **E-value calculation**: For each reported association, the engine computes the minimum strength of association (risk ratio scale) that an unmeasured confounder would need with both exposure and outcome to fully explain away the observed association, conditional on measured covariates (VanderWeele & Ding, 2017)
4. **Propensity score methods**: For treatment comparisons in observational data, the engine supports propensity score matching, weighting, and stratification

**Critical limitation**: No amount of statistical adjustment can guarantee elimination of confounding from unmeasured variables. The CCE prominently displays: "This analysis adjusts for measured confounders. Unmeasured confounding may remain."

### Multiple Comparisons Problem

When many temporal associations are tested simultaneously (e.g., correlating a single outcome with 100 potential predictors across 20 lag values), the probability of false positives becomes substantial. With 2000 tests at $\alpha = 0.05$, approximately 100 significant results are expected by chance alone (Bland & Altman, 2011).

**CCE multiple comparison controls**:

1. **Family-wise error rate (FWER) control**: Bonferroni correction ($\alpha_{adj} = \alpha / m$) for small, defined families of tests. Conservative but straightforward.

2. **False discovery rate (FDR) control**: Benjamini-Hochberg procedure controls the expected proportion of false discoveries among rejected hypotheses. More powerful than FWER control when many true associations exist, appropriate for exploratory screening.

3. **Pre-registration**: The engine supports pre-registration of primary hypotheses with designated primary endpoints, separating confirmatory from exploratory analyses.

4. **Replication requirements**: Candidate associations flagged in discovery analyses require replication in independent time periods or patient cohorts before clinical action is suggested.

### Regression to the Mean

**Regression to the mean** (RTM) is the statistical phenomenon where extreme measurements tend to be followed by less extreme measurements, purely due to measurement error and chance (Barnett et al., 2005). It is one of the most common sources of spurious before/after improvement in clinical data.

**Clinical scenario**: A patient with exceptionally high blood pressure (measured on a day they were stressed) starts a new medication. At follow-up, their blood pressure is lower—partly due to the medication, partly because the extreme initial value was partly a chance fluctuation.

**CCE RTM safeguards**:
- **Comparison to control groups**: RTM affects both treatment and control groups; randomized designs are the best protection
- **Quantitative RTM adjustment**: The engine can apply RTM adjustments when the test-retest reliability of a measure is known (using the formula: $RTM = (1 - r)(X_{extreme} - \bar{X})$, where $r$ is reliability)
- **Multiple baseline measurements**: Encourages using average of multiple pre-intervention measurements rather than single extreme values
- **Explicit RTM warnings**: Before/after analyses include automated RTM risk assessment based on baseline measurement extremity and measurement reliability

### Why Temporal Association Does Not Equal Causation

The CCE enforces a strict epistemic boundary between association and causation. Temporal association satisfies only one of Bradford Hill's causal criteria (temporal precedence) and is vulnerable to numerous alternative explanations:

| Alternative Explanation | Example |
|------------------------|---------|
| **Confounding** | Both medication adherence and outcomes correlate with health literacy |
| **Reverse causation** | Disease severity affects treatment intensity, not vice versa |
| **Selection bias** | Patients with better prognosis are channeled to particular treatments |
| **Regression to the mean** | Extreme values naturally followed by less extreme values |
| **Measurement bias** | Same device measures both exposure and outcome with correlated error |
| **Complex feedback** | A affects B, but B also affects A, with time delays in both directions |

**The engine's response**: All correlation outputs include an "Alternative Explanations" section listing plausible non-causal explanations for the observed association. Users must acknowledge these limitations before exporting results for clinical decision-making.

---

## Recommended Implementation

### Architecture Overview

```
Clinical Correlation Engine (CCE)
├── Data Ingestion Layer
│   ├── Time-series normalizer (irregular sampling handler)
│   ├── Event extractor (point process conversion)
│   └── Missing data imputer (Gaussian process / multiple imputation)
├── Analysis Core
│   ├── Cross-correlation module (with lag analysis)
│   ├── DTW alignment module
│   ├── Point process / Hawkes process module
│   ├── Mixed-effects modeling module
│   └── N-of-1 / SCED analysis module
├── Safety Layer
│   ├── Multiple comparison controller (FWER / FDR)
│   ├── Confounding assessor (E-value calculator)
│   ├── RTM risk evaluator
│   └── Epistemic boundary enforcer (association vs. causation)
└── Visualization Layer
    ├── Longitudinal dashboard (individual trajectories)
    ├── Lag-correlogram display
    ├── Control chart panel
    └── SCED phase-transition graphs
```

### Implementation Priorities

| Priority | Component | Rationale |
|----------|-----------|-----------|
| P0 | Cross-correlation with lag analysis | Core functionality, most requested |
| P0 | Mixed-effects trajectory modeling | Required for valid longitudinal inference |
| P0 | Multiple comparison correction | Safety-critical for exploratory analysis |
| P1 | DTW alignment | Enables patient similarity grouping |
| P1 | N-of-1 / SCED analysis | Key differentiator for personalized medicine |
| P1 | MCID integration | Clinical relevance over statistical significance |
| P2 | Hawkes process modeling | Advanced event-based association |
| P2 | SPC control charts | Quality improvement and monitoring workflows |
| P3 | Causal sensitivity analysis | E-values, bounds for unmeasured confounding |

### Technology Stack Recommendations

- **Computation**: Python (statsmodels, scipy, scikit-learn) with R integration (lme4, survjam) for mixed-effects modeling
- **Time-series**: tsfresh, STUMPY for feature extraction and matrix profile computation
- **Point processes**: tick library (Hawkes process estimation)
- **DTW**: dtaidistance (optimized C implementation)
- **Visualization**: Plotly/Dash for interactive dashboards, matplotlib for publication-ready SCED graphs

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Users misinterpret association as causation | High | Critical | Epistemic boundary enforcer, mandatory warnings, association labels |
| Multiple comparisons produce false discoveries | High | High | FDR control, pre-registration support, replication requirements |
| Ecological fallacy in group-level summaries | Medium | High | Individual trajectories as primary display, random effects modeling |
| Regression to the mean drives false improvement signals | Medium | High | RTM adjustment, multiple baseline measurements, control groups |
| MCID misapplication across populations | Medium | Medium | Context-specific MCID libraries, population mismatch warnings |
| Algorithmic complexity obscures clinical interpretability | Medium | Medium | Visual-first design, plain-language summaries, confidence annotations |

---

## References

Agapow, P., et al. (2020). Using machine-learning techniques to identify responders vs. non-responders in randomized clinical trials. *medRxiv*, 2020.11.21.20232041.

Angst, F., et al. (2017). The minimal clinically important difference (MCID) changes greatly based on the different calculation methods. *International Journal of Statistics in Medical Research*, 6(2), 85-93.

Barnett, A. G., van der Pols, J. C., & Dobson, A. J. (2005). Regression to the mean: what it is and how to deal with it. *International Journal of Epidemiology*, 34(1), 215-220.

Berndt, D. J., & Clifford, J. (1994). Using dynamic time warping to find patterns in time series. *KDD Workshop*, 10(16), 359-370.

Bland, J. M., & Altman, D. G. (2011). The half-width of a confidence interval. *BMJ*, 343, d3690.

Cleveland, W. S., & McGill, R. (1984). Graphical perception: Theory, experimentation, and application to the development of graphical methods. *Journal of the American Statistical Association*, 79(387), 531-554.

Copay, A. G., et al. (2007). Understanding the minimum clinically important difference: a review of concepts and methods. *Spine Journal*, 7(5), 541-546.

Daley, D. J., & Vere-Jones, D. (2003). *An Introduction to the Theory of Point Processes* (2nd ed.). Springer.

Diggle, P. J., et al. (2002). *Analysis of Longitudinal Data* (2nd ed.). Oxford University Press.

Edgington, E. S., & Onghena, P. (2007). *Randomization Tests* (4th ed.). Chapman & Hall/CRC.

Fitzmaurice, G. M., Laird, N. M., & Ware, J. H. (2011). *Applied Longitudinal Analysis* (2nd ed.). Wiley.

Guyatt, G. H., et al. (1986). Determining optimal therapy—randomized trials in individual patients. *New England Journal of Medicine*, 314(14), 889-892.

Guyatt, G. H., et al. (1987). Measuring change over time: assessing the usefulness of evaluative instruments. *Journal of Chronic Diseases*, 40(2), 171-178.

Holland, P. W. (1986). Statistics and causal inference. *Journal of the American Statistical Association*, 81(396), 945-960.

Jaeschke, R., Singer, J., & Guyatt, G. H. (1989). Measurement of health status: ascertaining the minimal clinically important difference. *Controlled Clinical Trials*, 10(4), 407-415.

Kazdin, A. E. (2011). *Single-Case Research Designs: Methods for Clinical and Applied Settings* (2nd ed.). Oxford University Press.

Kopland, A., et al. (2024). Dynamic Time Warp (DTW) as a scalable, data-efficient, and clinically relevant analysis of dynamic processes in patients with psychiatric disorders: a tutorial. *Journal of Eating Disorders*, 12, Article 1414.

Laird, N. M., & Ware, J. H. (1982). Random-effects models for longitudinal data. *Biometrics*, 38(4), 963-974.

Mohammed, M. A., et al. (2001). The use of multivariate control charts to improve the quality of clinical care. *Journal of Quality in Clinical Practice*, 21(s1), S4-S8.

Molenaar, P. C. M., & Campbell, C. G. (2009). The new person-specific paradigm in psychology. *Current Directions in Psychological Science*, 18(2), 112-117.

Parker, R. I., et al. (2011). Baseline corrected Tau (Tau-U) for single-case data. *Behavioral Disorders*, 37(1), 1-12.

Robinson, W. S. (1950). Ecological correlations and the behavior of individuals. *American Sociological Review*, 15(3), 351-357.

Rubin, D. B. (1974). Estimating causal effects of treatments in randomized and nonrandomized studies. *Journal of Educational Psychology*, 66(5), 688-701.

Tate, R. L., et al. (2008). Rating the methodological quality of single-subject designs and N-of-1 trials: Introducing the Single-Case Experimental Design (SCED) Scale. *Neuropsychological Rehabilitation*, 18(4), 385-401.

Thor, J., et al. (2007). Application of statistical process control in healthcare improvement: systematic review. *Quality and Safety in Health Care*, 16(5), 387-399.

VanderWeele, T. J., & Ding, P. (2017). Sensitivity analysis in observational research: introducing the E-value. *Annals of Internal Medicine*, 167(4), 268-274.

Wang, D., et al. (2022). Minimal clinically important difference: a review and replication study. *Patient Related Outcome Measures*, 13, 15-25.

Yang, L., Armijo-Olivo, S., & Gross, D. P. (2024). The role of single case experimental designs in evidence creation in rehabilitation. *Archives of Physical Medicine and Rehabilitation*, 105(3), 612-620.

Zucker, D. R., et al. (1997). Combining single patient (N-of-1) trials to estimate population treatment effects and to evaluate individual patient responses to treatment. *Journal of Clinical Epidemiology*, 50(4), 401-410.

---

*Document generated for DeepSynaps Protocol Studio. This is a research design document intended to guide implementation of the Clinical Correlation Engine. All methods described emphasize temporal association detection; causal inference requires additional experimental or quasi-experimental designs not covered by this engine alone.*
