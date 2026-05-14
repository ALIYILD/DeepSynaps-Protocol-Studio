# DeepTwin Causal Hypothesis Framework
## Safe Causal Inference for Clinical Patient Analytics

**Version:** 1.0  
**Date:** 2025  
**Domain:** Clinical Causal Inference, Single-Patient Analytics, Digital Therapeutics  
**Framework:** DeepSynaps Protocol Studio

---

## Executive Summary

This framework provides a rigorous, safety-first approach to causal inference in clinical patient analytics, specifically designed for the DeepTwin platform's individual-level patient monitoring and digital therapeutic evaluation capabilities. Causal inference in clinical settings is uniquely challenging because:

1. **Each patient is an N-of-1 experiment** -- we cannot randomize the same patient to both treatment and control simultaneously
2. **Confounding is pervasive** -- concurrent medications, lifestyle changes, seasonality, and disease natural history all obscure true treatment effects
3. **Regression to the mean is inevitable** -- patients are typically enrolled when symptoms are at their worst
4. **Ethical stakes are high** -- incorrect causal conclusions can lead to harmful treatment decisions

This document outlines **eight methodological domains**, identifies **methods to avoid**, and provides **Python implementation guidance** with explicit assumption-checking procedures. The framework prioritizes methods that acknowledge uncertainty, test assumptions, and default to conservative interpretations.

---

## Table of Contents

1. [Interrupted Time Series (ITS)](#1-interrupted-time-series-its)
2. [N-of-1 Trials](#2-n-of-1-trials)
3. [Difference-in-Differences](#3-difference-in-differences)
4. [Propensity Score Methods](#4-propensity-score-methods)
5. [Bayesian Causal Graphs](#5-bayesian-causal-graphs)
6. [Counterfactual Reasoning](#6-counterfactual-reasoning)
7. [Safe Interpretation Framework](#7-safe-interpretation-framework)
8. [Methods to AVOID](#8-methods-to-avoid)
9. [Python Implementation Toolkit](#9-python-implementation-toolkit)
10. [Top 5 Recommended Methods for DeepTwin](#10-top-5-recommended-methods-for-deeptwin)

---

## 1. Interrupted Time Series (ITS)

### 1.1 When to Use

Interrupted Time Series is the **quasi-experimental method of choice** when:
- A clear intervention point exists (e.g., medication start date, TMS session, device activation)
- Pre-intervention data (minimum 12-20 observations) is available
- Outcome is measured repeatedly at regular intervals
- Randomization is impossible or unethical

### 1.2 Core Assumptions

| Assumption | Description | How to Test |
|------------|-------------|-------------|
| **Stable pre-trend** | The pre-intervention trend would have continued unchanged | Visual inspection, pre-trend sensitivity analysis |
| **No concurrent confounding intervention** | No other intervention occurred at the same time | Clinical timeline review, sensitivity analysis |
| **Appropriate time interval** | Measurement intervals match intervention dynamics | Domain knowledge, autocorrelation analysis |
| **Stationarity** (optional) | Mean/variance constant over time | Augmented Dickey-Fuller, KPSS test |

### 1.3 Segmented Regression Model

The standard ITS model estimates four parameters:

```
Y_t = beta_0 + beta_1 * time + beta_2 * intervention + beta_3 * time_after + epsilon_t
```

Where:
- `beta_0`: Baseline level (intercept)
- `beta_1`: Pre-intervention trend (slope)
- `beta_2`: **Immediate level change** (step change at intervention)
- `beta_3`: **Trend change** (difference in slope post-intervention)
- `time_after = max(0, time - intervention_time)`

The causal effect at time `t` post-intervention is: `beta_2 + beta_3 * time_after`.

### 1.4 Clinical Examples

**Example 1: TMS Response Monitoring**
- Patient receives rTMS for depression
- Daily mood scores (PHQ-9) collected for 4 weeks pre-TMS, 6 weeks during TMS
- Intervention point: First TMS session
- Key question: Did mood trajectory change (slope) AND level shift simultaneously?

**Example 2: Medication Switch**
- Patient switches from SSRI A to SSRI B
- Weekly anxiety scores (GAD-7) collected
- Intervention point: Medication switch date
- Key question: Was the effect immediate (level change) or gradual (slope change)?

### 1.5 Controlled vs. Single ITS

**Single ITS** uses only the patient's own pre-intervention trend as the counterfactual. It is vulnerable to:
- History effects (concurrent life events)
- Seasonality
- Maturation (natural disease course)

**Controlled ITS** adds a comparison group or control outcome. Per Bernal et al. (2018), controlled ITS is a stronger quasi-experimental design with two controls (baseline trend + control group), controlling for history, maturation, instrumentation, regression to mean, and attrition. Always add a control group or control outcome where possible.

### 1.6 Autocorrelation & Seasonality

ITS data almost always exhibits **autocorrelation** (serial dependence). Failure to account for it inflates Type I error rates dramatically. Key considerations:

- **Autocorrelation**: Use Newey-West standard errors, ARIMA errors, or generalized least squares
- **Seasonality**: If weekly/monthly patterns exist, include seasonal dummy variables or Fourier terms
- **Non-stationarity**: Consider differencing if trends are not stable

Per the methodological systematic review of ITS in healthcare (PMC7559052), only 55% of studies considered autocorrelation and only 20.8% considered seasonality -- these are critical oversights.

### 1.7 Python Implementation

```python
import pandas as pd
import numpy as np
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.diagnostic import acorr_ljungbox

# ------------------------------------------------------------------
# 1. Prepare data
# ------------------------------------------------------------------
# df must contain: 'time', 'outcome', 'intervention' (0/1), 'patient_id'
df['time_after'] = df['time'] - df['intervention_time']
df['time_after'] = df['time_after'].clip(lower=0) * df['intervention']

# ------------------------------------------------------------------
# 2. Fit segmented regression with robust standard errors
# ------------------------------------------------------------------
model = smf.ols(
    'outcome ~ time + intervention + time_after',
    data=df
).fit(cov_type='HAC', cov_kwds={'maxlags': 5})  # Newey-West SEs

print(model.summary())
# beta_2 = immediate level change
# beta_3 = trend change (slope difference)

# ------------------------------------------------------------------
# 3. Test for autocorrelation in residuals
# ------------------------------------------------------------------
lb_test = acorr_ljungbox(model.resid, lags=10, return_df=True)
print(f"Ljung-Box p-values:\n{lb_test}")
# If p < 0.05 for any lag, autocorrelation present -> use ARIMA errors

# ------------------------------------------------------------------
# 4. If autocorrelation detected: use ARIMA errors
# ------------------------------------------------------------------
from statsmodels.tsa.statespace.sarimax import SARIMAX

exog = sm.add_constant(df[['time', 'intervention', 'time_after']])
arima_model = SARIMAX(
    df['outcome'],
    exog=exog,
    order=(1, 0, 1),  # ARMA(1,1) errors -- adjust based on ACF/PACF
    trend='n'
).fit()
print(arima_model.summary())

# ------------------------------------------------------------------
# 5. Visualize counterfactual
# ------------------------------------------------------------------
import matplotlib.pyplot as plt

pre_data = df[df['intervention'] == 0]
post_data = df[df['intervention'] == 1]

# Predict counterfactual (what would have happened without intervention)
counterfactual = (model.params['Intercept'] + 
                  model.params['time'] * df['time'])

plt.figure(figsize=(12, 6))
plt.plot(pre_data['time'], pre_data['outcome'], 'bo-', label='Pre-intervention')
plt.plot(post_data['time'], post_data['outcome'], 'ro-', label='Post-intervention')
plt.plot(df['time'], counterfactual, 'g--', label='Counterfactual (no intervention)')
plt.axvline(x=intervention_time, color='black', linestyle=':', label='Intervention')
plt.xlabel('Time'); plt.ylabel('Outcome'); plt.legend()
plt.title('Interrupted Time Series with Counterfactual')
plt.show()

# ------------------------------------------------------------------
# 6. Effect size summary
# ------------------------------------------------------------------
immediate_effect = model.params['intervention']
trend_change = model.params['time_after']
cumulative_effect_at_t = immediate_effect + trend_change * t
print(f"Immediate level change: {immediate_effect:.3f} (p={model.pvalues['intervention']:.4f})")
print(f"Trend change: {trend_change:.5f} per period (p={model.pvalues['time_after']:.4f})")
```

### 1.8 ITS Design Checklist

- [ ] Minimum 12 pre-intervention and 12 post-intervention observations
- [ ] Intervention timing clearly defined and documented
- [ ] Autocorrelation assessed and accounted for
- [ ] Seasonality assessed (if applicable)
- [ ] Control group or control outcome included where possible
- [ ] Visual inspection of pre-trend performed
- [ ] Sensitivity analysis with varying intervention timing conducted
- [ ] Assumptions documented and limitations stated

---

## 2. N-of-1 Trials

### 2.1 Definition & Design Types

N-of-1 trials are **multi-crossover controlled trials where each patient serves as their own control**. They are the gold standard for individual treatment optimization.

| Design | Structure | Best For |
|--------|-----------|----------|
| **AB** | Two treatment periods, one crossover | Quick comparison, short washout expected |
| **ABA** | Baseline + treatment + withdrawal | Establishing reversibility of effect |
| **ABAB** | Treatment alternation | Robust evidence of treatment-specific effect |
| **BABA** | Reverse alternation | Controls for order effects |
| **Adaptive** | Variable period length based on response | Minimizing exposure to inferior treatment |

### 2.2 Randomization & Blinding

- **Randomization**: Treatment order must be randomly assigned for each cycle
- **Blinding**: Over-encapsulation or identical packaging prevents patient/assessor bias
- **Washout periods**: Duration must exceed the longest medication half-life
- **Run-in periods**: Baseline data collection before first treatment

Per the AHRQ User's Guide (2014), the standard commercial N-of-1 design uses 5 treatment cycles (AB or BA), with 5-7 days per period, depending on medication half-life.

### 2.3 Analysis Methods

#### 2.3.1 Mixed Effects Models

The preferred frequentist approach for aggregated N-of-1 trials:

```
Y_ijk = beta_0 + beta_1 * Treatment_ijk + u_0i + u_1i * Treatment_ijk + epsilon_ijk
```

Where:
- `i` = patient, `j` = period, `k` = time within period
- `u_0i` = random intercept (patient-specific baseline)
- `u_1i` = random slope (patient-specific treatment effect)
- This estimates both **population average** and **individual-specific** treatment effects

#### 2.3.2 Bayesian Analysis (Recommended)

Bayesian methods are **strongly preferred** for N-of-1 trials because:
- Posterior probabilities are more interpretable than p-values for clinical decisions
- They naturally handle the "what is the probability that THIS patient benefits?" question
- They allow borrowing strength across patients via hierarchical models
- They accommodate the patient-centered nature of the design

```python
import pymc as pm
import arviz as az

# N-of-1 Bayesian hierarchical model
with pm.Model() as n1_model:
    # Hyperpriors (population-level)
    mu_beta0 = pm.Normal('mu_beta0', mu=0, sigma=10)
    sigma_beta0 = pm.HalfNormal('sigma_beta0', sigma=5)
    mu_beta1 = pm.Normal('mu_beta1', mu=0, sigma=5)
    sigma_beta1 = pm.HalfNormal('sigma_beta1', sigma=3)
    
    # Patient-level random effects
    beta0_i = pm.Normal('beta0_i', mu=mu_beta0, sigma=sigma_beta0, 
                        shape=n_patients)  # Patient baselines
    beta1_i = pm.Normal('beta1_i', mu=mu_beta1, sigma=sigma_beta1, 
                        shape=n_patients)  # Patient treatment effects
    
    # Likelihood
    mu = (beta0_i[patient_idx] + 
          beta1_i[patient_idx] * treatment)
    sigma = pm.HalfNormal('sigma', sigma=5)
    
    y_obs = pm.Normal('y_obs', mu=mu, sigma=sigma, observed=outcome)
    
    # Sample
    trace = pm.sample(2000, tune=1000, target_accept=0.9)

# Posterior probability that treatment helps THIS patient
posterior = az.extract(trace)
for i in range(n_patients):
    prob_benefit = (posterior['beta1_i'][i] > 0).mean()
    print(f"Patient {i}: P(benefit) = {prob_benefit:.3f}")

# Population-level probability
pop_prob_benefit = (posterior['mu_beta1'] > 0).mean()
print(f"Population P(benefit) = {pop_prob_benefit:.3f}")
```

#### 2.3.3 Carry-over Effect Adjustment

Carry-over (residual effect from previous period) must be assessed:
- Include a "period" covariate to test for order effects
- Use autoregressive models to account for time dependencies
- Bayesian networks can model carry-over explicitly (per Scheetz et al., 2023)

```python
# Model with carry-over
with pm.Model() as n1_carryover:
    # ... previous model ...
    
    # Carry-over effect from previous period
    carryover = pm.Normal('carryover', mu=0, sigma=2)
    
    # Previous treatment indicator
    mu = (beta0_i[patient_idx] + 
          beta1_i[patient_idx] * treatment +
          carryover * prev_treatment)
    # ... rest of model ...
```

### 2.4 Digital Therapeutics Applications

N-of-1 trials are particularly well-suited for digital therapeutics (DTx) because:
- **Rapid on/off**: Digital interventions can be toggled instantly (no washout needed)
- **Passive monitoring**: Wearables provide continuous outcome data
- **A/B app versions**: Different DTx content/algorithms can be randomized
- **Micro-randomization**: Momentary interventions with immediate outcomes
- **Personalized dosing**: Finding the optimal engagement schedule for each patient

### 2.5 Key References

- AHRQ (2014): "Design and Implementation of N-of-1 Trials: A User's Guide"
- Zucker et al. (1997): Original N-of-1 trial statistical framework
- Daza (2018): Counterfactual framework for N-of-1 trials with time-dependent treatments
- Scheetz et al. (2023): Bayesian networks for N-of-1 with carry-over effects

---

## 3. Difference-in-Differences

### 3.1 Core Concept

Difference-in-Differences (DiD) estimates the causal effect of an intervention by comparing the change in outcomes over time between a **treatment group** and a **control group** that did not receive the intervention. The key identifying assumption is:

> **Parallel Trends Assumption**: In the absence of treatment, the treatment and control groups would have followed the same outcome trajectory.

### 3.2 Classical Two-Group DiD

```
Y_it = alpha + gamma * Treat_i + lambda * Post_t + delta * (Treat_i * Post_t) + epsilon_it
```

The coefficient `delta` is the DiD estimator -- the causal effect. It represents:
```
delta = [E(Y|T=1,Post=1) - E(Y|T=1,Post=0)] - [E(Y|T=0,Post=1) - E(Y|T=0,Post=0)]
```

### 3.3 Testing the Parallel Trends Assumption

**This assumption is untestable for the post-period but partially testable pre-intervention:**

1. **Event study specification**: Include leads and lags of treatment
```
Y_it = alpha_i + lambda_t + sum_k [beta_k * Treat_i * 1(t = k)] + epsilon_it
```
All pre-treatment `beta_k` should be statistically indistinguishable from zero.

2. **Placebo test**: Assign fake treatment dates and re-estimate

3. **Visual inspection**: Plot treatment and control trends pre-intervention

### 3.4 Staggered DiD Extensions

When different units (patients, clinics) receive treatment at different times, the classical two-way fixed effects (TWFE) estimator can be severely biased with heterogeneous treatment effects.

**Modern solutions:**

| Method | Approach | When to Use |
|--------|----------|-------------|
| **Callaway-Sant'Anna (2021)** | Group-time ATT, clean controls | Multiple treatment timing groups |
| **Sun-Abraham (2021)** | Interaction-weighted estimator | Heterogeneous effects across cohorts |
| **Gardner (2022)** | Two-stage DID | Large number of fixed effects |
| **Borusyak et al. (2024)** | Imputation-based | Any staggered adoption setting |

**Python implementation**:
```python
# Staggered DiD with Callaway-Sant'Anna
# pip install did
from did import att_gt

result = att_gt(
    df=df,
    yname="outcome",
    gname="first_treat_period",  # when unit first treated
    idname="patient_id",
    tname="time_period",
    xformla="~ age + sex + comorbidity"  # covariates
)
result.plot_group_att()   # Group-time ATT plot
result.plot_agg_att()     # Aggregate ATT plot
```

### 3.5 Synthetic Control Method

Synthetic Control Constructs a weighted combination of control units that best matches the pre-treatment trajectory of the treated unit. It is particularly valuable when:
- Only one (or a few) treated unit(s) exist
- No single control unit is a good match
- Pre-treatment data spans many periods

**Clinical application**: A single rare disease patient receives a novel therapy. Construct a synthetic control from historical registry patients with similar baseline characteristics.

```python
# Synthetic control with pysynthdid
# pip install pysynthdid
from pysynthdid import SynthDID

sdid = SynthDID(df, 'patient_id', 'time', 'treatment', 'outcome')
result = sdid.fit()
result.plot()  # Shows treated vs. synthetic control trajectory
print(f"ATT: {result.att:.3f} (SE: {result.se:.3f})")
```

### 3.6 Clinical Example: Treatment vs. Control Groups

**Scenario**: A new digital therapeutic for migraine is rolled out to patients in Clinic A but not Clinic B.
- Treatment group: Patients in Clinic A using the DTx
- Control group: Matched patients in Clinic B
- Outcome: Monthly migraine days
- Pre-period: 6 months of baseline data
- Post-period: 6 months post-DTx launch

**Critical checks**:
1. Are the clinics comparable in patient demographics?
2. Did any other policy change at Clinic A at the same time?
3. Is there evidence of parallel pre-trends?
4. Were there anticipation effects?

---

## 4. Propensity Score Methods

### 4.1 Core Principle

Propensity scores estimate the probability of receiving treatment conditional on observed covariates. They address the fundamental challenge of observational studies: treatment groups differ systematically.

```
e(X) = P(Treatment = 1 | X)
```

If all confounders are measured and the propensity score model is correctly specified, conditioning on `e(X)` removes confounding bias.

### 4.2 Three Primary Approaches

#### 4.2.1 Propensity Score Matching

Match each treated patient to one or more control patients with similar propensity scores.

```python
from sklearn.neighbors import NearestNeighbors
from sklearn.linear_model import LogisticRegression

# 1. Estimate propensity scores
ps_model = LogisticRegression(max_iter=1000)
ps_model.fit(X_covariates, treatment)
propensity_scores = ps_model.predict_proba(X_covariates)[:, 1]

# 2. Match (1:1 nearest neighbor with caliper)
treated_idx = np.where(treatment == 1)[0]
control_idx = np.where(treatment == 0)[0]

nbrs = NearestNeighbors(n_neighbors=1).fit(
    propensity_scores[control_idx].reshape(-1, 1)
)
distances, matches = nbrs.kneighbors(
    propensity_scores[treated_idx].reshape(-1, 1)
)

# 3. Assess balance (Standardized Mean Differences)
def standardized_mean_diff(x, treat):
    sdiff = (x[treat==1].mean() - x[treat==0].mean()) / \
            np.sqrt((x[treat==1].var() + x[treat==0].var()) / 2)
    return sdiff

# Before and after matching balance
covariates = ['age', 'sex', 'comorbidity', 'baseline_severity']
for cov in covariates:
    sdiff_before = standardized_mean_diff(df[cov], treatment)
    matched_treat = treated_idx
    matched_control = control_idx[matches.flatten()]
    matched = np.concatenate([matched_treat, matched_control])
    sdiff_after = standardized_mean_diff(df.loc[matched, cov], 
                                         treatment[matched])
    print(f"{cov}: SMD before={sdiff_before:.3f}, after={sdiff_after:.3f}")
# Target: all |SMD| < 0.1 after matching
```

#### 4.2.2 Inverse Probability Weighting (IPW)

Weight each observation by the inverse of their probability of receiving their actual treatment:

```python
# IPW weights
weights = np.where(
    treatment == 1,
    1 / propensity_scores,           # Treated: 1/e(X)
    1 / (1 - propensity_scores)       # Control: 1/(1-e(X))
)

# Stabilized IPW (preferred -- reduces variance)
p_treat = treatment.mean()
weights_stab = np.where(
    treatment == 1,
    p_treat / propensity_scores,
    (1 - p_treat) / (1 - propensity_scores)
)

# Weighted regression for outcome
from statsmodels.api import WLS
model = WLS(outcome, sm.add_constant(treatment), weights=weights_stab).fit()
print(model.summary())
```

#### 4.2.3 Propensity Score Stratification

Divide patients into quintiles based on propensity scores and estimate treatment effect within each:

```python
df['ps_quintile'] = pd.qcut(df['propensity_score'], 5, labels=False)

stratum_effects = []
for q in range(5):
    sub = df[df['ps_quintile'] == q]
    effect = sub[outcome][sub[treatment]==1].mean() - \
             sub[outcome][sub[treatment]==0].mean()
    stratum_effects.append(effect)

# Overall effect = weighted average across strata
overall_effect = np.mean(stratum_effects)
```

### 4.3 Overlap Weighting (Preferred for Clinical Data)

Overlap weights (Li et al., 2018) weight each patient proportional to their probability of receiving the *opposite* treatment. This prioritizes patients in the clinical equipoise region and minimizes variance:

```python
# Overlap weights
overlap_weights = np.where(
    treatment == 1,
    1 - propensity_scores,    # Treated: 1 - e(X)
    propensity_scores          # Control: e(X)
)

model = WLS(outcome, sm.add_constant(treatment), weights=overlap_weights).fit()
```

### 4.4 E-Values for Sensitivity Analysis

**The E-value** (VanderWeele & Ding, 2017) quantifies the robustness of an observational finding to unmeasured confounding. It answers:

> "How strong would an unmeasured confounder have to be, both in its association with treatment AND outcome, to fully explain away the observed effect?"

**Calculation**:
```
E-value = RR + sqrt(RR * (RR - 1))
```
Where RR is the risk ratio (or odds ratio for rare outcomes).

**Interpretation guidelines:**
| E-Value | Interpretation |
|---------|---------------|
| < 1.5 | Finding is fragile -- modest unmeasured confounding could explain it |
| 1.5 - 3.0 | Moderately robust |
| > 3.0 | Relatively robust -- requires strong confounding to explain away |

```python
def e_value(rr):
    """Calculate E-value from risk ratio"""
    if rr < 1:
        rr = 1 / rr
    return rr + np.sqrt(rr * (rr - 1))

# Example
observed_rr = 2.5
ev = e_value(observed_rr)
print(f"Observed RR: {observed_rr}")
print(f"E-value: {ev:.2f}")
print(f"An unmeasured confounder would need RR={ev:.2f} with both")
print(f"treatment AND outcome to fully explain this association.")
```

### 4.5 Contextualized E-Value Analysis

The "Observed Covariate E-value" approach compares the E-value against the strength of associations of *measured* confounders. If the strongest measured confounder has an association of RR=1.8, and the E-value is 2.5, then an unmeasured confounder stronger than any observed confounder would be needed to explain away the result.

```python
# Calculate observed covariate E-values
for cov in covariates:
    # Association of covariate with treatment
    ps_cov = LogisticRegression().fit(
        X[[cov]], treatment
    ).predict_proba(X[[cov]])[:, 1]
    rr_treat = np.exp(LogisticRegression().fit(
        X[[cov]], treatment
    ).coef_[0][0])
    
    # Association of covariate with outcome
    rr_outcome = np.exp(
        sm.Logit(outcome, sm.add_constant(X[cov])).fit(disp=0).params[cov]
    )
    
    cov_evalue = max(rr_treat, 1/rr_treat) * max(rr_outcome, 1/rr_outcome)
    print(f"{cov}: E-value contribution = {cov_evalue:.2f}")
```

---

## 5. Bayesian Causal Graphs

### 5.1 Directed Acyclic Graphs (DAGs)

DAGs provide a formal language for encoding causal assumptions. They specify:
- **Nodes**: Variables (treatments, outcomes, confounders, mediators, colliders)
- **Directed edges**: Hypothesized causal relationships
- **D-separation**: Statistical independencies implied by the graph structure

### 5.2 DoWhy Framework

DoWhy (Microsoft Research) provides an end-to-end causal inference workflow:

1. **Model**: Build causal graph from domain knowledge
2. **Identify**: Use do-calculus to identify estimable quantities
3. **Estimate**: Compute causal effects using statistical methods
4. **Refute**: Run robustness checks

```python
from dowhy import CausalModel
import dowhy.datasets

# Load clinical data
# df columns: treatment, outcome, age, sex, comorbidity, 
#             baseline_severity, concurrent_meds, season

causal_graph = """
digraph {
    age -> treatment;
    age -> outcome;
    sex -> treatment;
    sex -> outcome;
    comorbidity -> treatment;
    comorbidity -> outcome;
    baseline_severity -> treatment;
    baseline_severity -> outcome;
    concurrent_meds -> treatment;
    concurrent_meds -> outcome;
    season -> outcome;
    treatment -> outcome;
}
"""

model = CausalModel(
    data=df,
    treatment='treatment',
    outcome='outcome',
    graph=causal_graph
)

# Identify causal effect
identified_estimand = model.identify_effect()
print(identified_estimand)

# Estimate using multiple methods
methods = [
    'backdoor.propensity_score_matching',
    'backdoor.propensity_score_weighting',
    'backdoor.linear_regression'
]

for method in methods:
    estimate = model.estimate_effect(identified_estimand, method_name=method)
    print(f"\n{method}: Effect = {estimate.value:.3f}")

# Refute -- critical robustness checks
refutations = [
    ('random_common_cause', 'Add random confounder'),
    ('placebo_treatment_refuter', 'Placebo treatment'),
    ('data_subset_refuter', 'Data subset')
]

for refuter, name in refutations:
    result = model.refute_estimate(identified_estimand, estimate, 
                                   method_name=refuter)
    print(f"{name}: {result}")
```

### 5.3 Graph-Based Discovery with Prior Knowledge

When the causal graph is not fully known, structure learning algorithms can discover it from data:

| Algorithm | Type | Best For |
|-----------|------|----------|
| **PC Algorithm** | Constraint-based (CI tests) | Moderate dimensions, good for clinical data |
| **GES** | Score-based (BIC/BDeu) | Larger graphs, needs more data |
| **NOTEARS** | Continuous optimization | High-dimensional data, fast |
| **Greedy Equivalence Search** | Hybrid | Alzheimer's, complex disease networks |

```python
from causallearn.search.ConstraintBased.PC import pc
from causallearn.utils.cit import fisherz

# PC algorithm with clinical data
# Add temporal ordering as prior knowledge (variables measured 
# earlier cannot be caused by variables measured later)

# Temporal tiers: baseline -> treatment -> outcome
temporal_order = {
    0: ['age', 'sex', 'comorbidity', 'baseline_severity'],  # Baseline
    1: ['treatment', 'concurrent_meds'],                      # Treatment
    2: ['outcome']                                             # Outcome
}

cg = pc(data_matrix, fisherz, alpha=0.05, 
        prior_knowledge=temporal_order)
cg.draw_pydot_graph(labels=column_names)
```

### 5.4 Prior Specification for Clinical Data

Bayesian causal inference requires specifying priors. For clinical applications:

**Informative priors are appropriate when:**
- Previous RCTs exist for the same drug/class
- Meta-analyses provide population-level effect estimates
- Biological mechanisms constrain plausible effect sizes

```python
# Informative prior from meta-analysis
# Suppose literature suggests treatment effect ~ N(2.0, 1.0^2)

with pm.Model() as clinical_causal:
    # Prior informed by external evidence
    treatment_effect = pm.Normal('treatment_effect', 
                                  mu=2.0, sigma=1.0)  # Informative
    
    # Weakly informative priors for confounders
    age_effect = pm.Normal('age_effect', mu=0, sigma=1)
    comorbidity_effect = pm.Normal('comorbidity_effect', mu=0, sigma=2)
    
    # Model
    mu = (baseline + 
          treatment_effect * treatment +
          age_effect * age +
          comorbidity_effect * comorbidity)
    
    y = pm.Normal('outcome', mu=mu, sigma=sigma, observed=outcome)
    trace = pm.sample(2000, tune=1000)
```

### 5.5 Counterfactual Estimation with Graphs

DoWhy's GCM (Graphical Causal Model) enables counterfactual reasoning:

```python
from dowhy.gcm import *

# Create causal model
causal_model = StructuralCausalModel(causal_graph)

# Fit the model
causal_model.fit(df)

# Counterfactual: "What if patient had NOT received treatment?"
patient_data = df.iloc[0:1]  # Single patient
counterfactual = counterfactual_samples(
    causal_model,
    {'treatment': lambda x: 0},  # Set treatment to 0
    observed_data=patient_data
)

print(f"Observed outcome: {patient_data['outcome'].values[0]:.2f}")
print(f"Counterfactual (no treatment): {counterfactual['outcome'].values[0]:.2f}")
print(f"Treatment effect for this patient: "
      f"{patient_data['outcome'].values[0] - counterfactual['outcome'].values[0]:.2f}")
```

---

## 6. Counterfactual Reasoning

### 6.1 The Fundamental Question

> "What would have happened to this patient if they had NOT received the intervention?"

This is the **counterfactual question** at the heart of causal inference. For each patient, we observe only one potential outcome (the factual). The challenge is to estimate the unobserved counterfactual.

### 6.2 Identification Assumptions

For counterfactuals to be identifiable from observational data:

1. **Consistency**: The potential outcome under the observed treatment equals the observed outcome
2. **Conditional Exchangeability**: Treatment assignment is independent of potential outcomes given observed covariates (no unmeasured confounding)
3. **Positivity**: Every patient has non-zero probability of receiving each treatment level
4. **SUTVA**: No interference between patients (often violated in infectious disease settings)

### 6.3 CausalImpact (Google)

CausalImpact uses **Bayesian Structural Time Series (BSTS)** to construct a counterfactual from control time series:

```python
from causalimpact import CausalImpact

# Data: pre_period and post_period indices
# df: DataFrame with 'response' column and control covariate columns
ci = CausalImpact(df, pre_period=[0, 99], post_period=[100, 150])

# Results
print(ci.summary())
print(ci.summary(output='report'))
ci.plot()
```

**Output interpretation**:
- **Absolute effect**: Mean difference between observed and predicted
- **Relative effect**: Percentage change
- **Posterior probability of effect**: Probability that the effect is non-zero
- **Cumulative effect**: Running total of the effect over time

**Clinical application example**:
- A patient starts a new antihypertensive medication
- Daily blood pressure readings are the response variable
- Control variables: Patient's heart rate, activity level, weather data
- Pre-period: 30 days of baseline readings
- Post-period: 30 days post-medication
- CausalImpact estimates what BP would have been without the medication

### 6.4 Bayesian Structural Time Series (BSTS)

BSTS decomposes a time series into components:

```
y_t = mu_t + tau_t + gamma_t + epsilon_t
```

Where:
- `mu_t`: Local linear trend (level + slope)
- `tau_t`: Seasonal component
- `gamma_t`: Regression component (control covariates)
- `epsilon_t`: Observation noise

```python
import tensorflow_probability as tfp
from tensorflow_probability import sts

# BSTS model components
trend = sts.LocalLinearTrend(observed_time_series=train_data)
seasonal = sts.Seasonal(num_seasons=7, observed_time_series=train_data)  # Weekly
regression = sts.LinearRegression(design_matrix=control_covariates)

model = sts.Sum([trend, seasonal, regression], 
                observed_time_series=train_data)

# Fit with variational inference
variational_posteriors = tfp.sts.build_factored_surrogate_posterior(
    model=model
)

# Forecast counterfactual
forecast_dist = tfp.sts.forecast(
    model=model,
    observed_time_series=train_data,
    parameter_samples=parameter_samples,
    num_steps_forecast=len(test_data)
)

# Effect = observed - forecast_mean
observed_post = test_data
forecast_mean = forecast_dist.mean().numpy()
causal_effect = observed_post - forecast_mean
```

### 6.5 G-Computation

G-computation estimates counterfactuals by modeling the full data-generating process:

```python
def g_computation(df, treatment_variable, outcome_variable, confounders):
    """
    G-computation for estimating counterfactual outcomes.
    
    Steps:
    1. Model E[Y | T, X] -- outcome regression
    2. Predict Y under T=1 for everyone
    3. Predict Y under T=0 for everyone
    4. Difference = causal effect
    """
    # Step 1: Fit outcome model
    formula = f"{outcome_variable} ~ {treatment_variable} + " + \
              " + ".join(confounders)
    model = smf.ols(formula, data=df).fit()
    
    # Step 2: Predict under T=1 for everyone
    df_t1 = df.copy()
    df_t1[treatment_variable] = 1
    y1_pred = model.predict(df_t1)
    
    # Step 3: Predict under T=0 for everyone
    df_t0 = df.copy()
    df_t0[treatment_variable] = 0
    y0_pred = model.predict(df_t0)
    
    # Step 4: Average treatment effect
    ate = (y1_pred - y0_pred).mean()
    
    # Individual treatment effects
    ite = y1_pred - y0_pred
    
    return ate, ite, model

# Usage
ate, ite, model = g_computation(
    df, 'medication', 'symptom_score', 
    ['age', 'sex', 'baseline_severity', 'comorbidity']
)
print(f"Average Treatment Effect: {ate:.3f}")
print(f"Individual treatment effects range: [{ite.min():.3f}, {ite.max():.3f}]")
```

### 6.6 Time-Aware G-Transformers for Irregular Clinical Data

For electronic health records with irregularly-spaced observations, recent advances use transformer architectures:

- **G-Transformers** model the joint distribution of clinical states over time
- They account for irregular measurement timing
- They enable counterfactual trajectory simulation via Monte Carlo
- Each patient's counterfactual is estimated by simulating "what if treatment were different" trajectories

This is an active research area and implementation is currently complex, but represents the frontier for irregular longitudinal clinical data.

---

## 7. Safe Interpretation Framework

### 7.1 Language Discipline: "Association" vs. "Causal Effect"

| Language | When to Use | When NOT to Use |
|----------|-------------|-----------------|
| **"Temporal association"** | Always the default language | Never claim causation from association alone |
| **"Conditional association"** | After adjusting for measured confounders | Implies you accounted for ALL confounders |
| **"Causal effect (under assumptions)"** | When identifying assumptions are stated and justified | Never without stating assumptions |
| **"Treatment response pattern"** | Describing observed changes in an individual | Never implies causation |

**Required disclaimer for all DeepTwin causal analyses**:

> "This analysis estimates the association between [intervention] and [outcome] under the assumptions of [list assumptions]. These findings are hypothesis-generating and should be interpreted in conjunction with clinical judgment. Unmeasured confounders may bias these estimates."

### 7.2 Confounding Disclosure Requirements

Every causal analysis report must include:

1. **Measured confounders**: Complete list of all variables adjusted for
2. **Unmeasured confounders**: Discussion of what was NOT measured and how it could bias results
3. **E-value**: Quantification of how strong unmeasured confounding would need to be
4. **Sensitivity analysis**: Results under different confounding scenarios
5. **Direction of bias**: Expected direction of bias from unmeasured confounders

### 7.3 Missing Data Impact

Missing data can introduce substantial bias in causal inference:

| Missing Mechanism | Description | Impact on Causal Estimates |
|-------------------|-------------|---------------------------|
| **MCAR** | Missing completely at random | No bias, reduced efficiency |
| **MAR** | Missing at random (depends on observed data) | Bias if ignored; handle with multiple imputation |
| **MNAR** | Missing not at random | Bias; requires sensitivity analysis |

**Best practices**:
- Report the proportion of missing data for each variable
- Use multiple imputation (Rubin's rules) with treatment-outcome interactions included
- Include missingness indicators as covariates
- Conduct sensitivity analysis with complete cases only
- Report Little's MCAR test

```python
from sklearn.impute import IterativeImputer

# Multiple imputation for causal analysis
# Include treatment-outcome interactions in imputation model
imputer = IterativeImputer(max_iter=10, random_state=42)
df_imputed = pd.DataFrame(
    imputer.fit_transform(df),
    columns=df.columns
)

# Pool estimates across imputations (MICE framework)
from statsmodels.imputation.mice import MICE

mice = MICE(formula, sm.OLS, df)
results = mice.fit(n_imputations=20)
print(results.summary())
```

### 7.4 Placebo and Regression to the Mean

**Regression to the Mean (RTM)** is the single biggest threat to causal interpretation in individual patient analytics. Key points:

1. **Definition**: Extreme measurements tend to be followed by less extreme measurements purely due to statistical variability
2. **Clinical manifestation**: Patients enrolled when symptoms are worst will appear to improve even without effective treatment
3. **Quantification**: RTM effect magnitude depends on:
   - Reliability of measurement (lower reliability = more RTM)
   - Pre-post correlation (lower correlation = more RTM)
   - Distance from the mean (more extreme = more RTM)

**Calculating RTM effect**:
```
RTM_effect = (cutoff - population_mean) * (1 - reliability)
```

**Mitigation strategies**:
- Always use a control group or control period
- Account for baseline severity in analysis (ANCOVA)
- Use multiple pre-intervention measurements to improve reliability
- Report RTM-adjusted estimates
- Include washout/run-in periods in trial design

**Placebo considerations**:
- Placebo responses are real clinical phenomena (neurobiological mechanisms)
- Placebo-controlled designs are the gold standard
- In single-patient analytics, historical controls or synthetic controls serve as proxy

### 7.5 Clinician Oversight Requirements

**No automated causal inference system should replace clinical judgment.** DeepTwin must implement:

1. **Mandatory review flag**: All causal estimates must be reviewed by a clinician
2. **Assumption transparency**: All assumptions must be displayed, not hidden
3. **Confidence bands**: Always report uncertainty intervals
4. **Action thresholds**: Pre-specify what level of evidence triggers a recommendation
5. **Override capability**: Clinicians must be able to override any automated conclusion

| Evidence Level | Interpretation | Action |
|---------------|----------------|--------|
| Strong (p < 0.05, E-value > 3, consistent across methods) | Suggestive of causal effect | Discuss with clinician; may inform shared decision-making |
| Moderate (p < 0.05, E-value 1.5-3, some consistency) | Possible effect; high uncertainty | Flag for clinical review; do not recommend changes |
| Weak (p > 0.05 or E-value < 1.5) | No reliable evidence of effect | No action; continue monitoring |

---

## 8. Methods to AVOID

### 8.1 Simple Pre-Post Without Controls

**Why avoid**: Pre-post designs without a control group cannot distinguish:
- Treatment effects from regression to the mean
- Treatment effects from natural disease course
- Treatment effects from concurrent interventions
- Treatment effects from seasonality

**The problem**: Per Vickers & Altman (2001), when pre-post correlation is 0.5, regression to the mean alone can explain 50% of observed change. Without a control, this is impossible to disentangle.

**If you must use pre-post**:
- Use ANCOVA (post-score ~ treatment + pre-score) rather than change scores
- Include as many pre-period measurements as possible
- Report RTM-adjusted estimates
- Clearly label as "exploratory" only

### 8.2 Cherry-Picking Time Windows

**Why avoid**: Selecting time windows after seeing the data introduces massive selection bias.

**Examples of cherry-picking**:
- Choosing the start date that maximizes the apparent effect
- Truncating the post-period when the effect diminishes
- Selecting only certain patients who "responded well"

**Prevention**:
- Pre-register analysis plans with fixed time windows
- Use all available data (intention-to-treat)
- Report results for multiple window specifications
- Apply multiple testing corrections

### 8.3 Ignoring Concurrent Medication Changes

**Why avoid**: Most patients are on multiple medications. If two medications change simultaneously, attributing the outcome change to only one is biased.

**Solutions**:
- Include all medication changes as time-varying covariates
- Use marginal structural models for time-varying treatments
- Perform sensitivity analysis excluding patients with concurrent changes
- Use negative control outcomes (outcomes that should NOT be affected)

### 8.4 Ignoring Seasonal and Life Events

**Why avoid**: Many health outcomes vary systematically with:
- Season (depression, asthma, vitamin D)
- Day of week (clinic visit effects)
- Holidays and stress periods
- Personal life events (divorce, job change, bereavement)

**Solutions**:
- Include season/holiday indicators in all models
- Collect data on significant life events
- Use year-over-year comparisons where possible
- Report seasonally-adjusted estimates

### 8.5 Additional Dangerous Practices

| Practice | Why Dangerous | Safer Alternative |
|----------|--------------|-------------------|
| **Post-hoc subgroup analysis** | Inflates Type I error; finds spurious patterns | Pre-specify subgroups; Bonferroni correction |
| **P-value hacking** | Running multiple tests until one is significant | Pre-register analysis; report all tests |
| **Ignoring multiple comparisons** | False positive rate inflates with each test | FDR control (Benjamini-Hochberg); familywise error |
| **Treating correlation as causation** | Fundamental logical error | Always state assumptions; use causal frameworks |
| **Omitting negative results** | Publication bias distorts evidence | Report all pre-specified outcomes |

---

## 9. Python Implementation Toolkit

### 9.1 Required Packages

```
pip install statsmodels pandas numpy matplotlib scipy
pip install pymc arviz              # Bayesian analysis
pip install dowhy                   # Causal graphs
pip install causalimpact            # Google CausalImpact
pip install pysynthdid              # Synthetic control
pip install sklearn                 # ML for propensity scores
pip install lifelines               # Survival analysis
pip install linearmodels            # Panel data / DiD
pip install tensorflow-probability  # BSTS
```

### 9.2 Complete Analysis Pipeline

```python
"""
DeepTwin Causal Analysis Pipeline
Complete workflow for individual-patient causal inference
"""

import pandas as pd
import numpy as np
import statsmodels.api as sm
import statsmodels.formula.api as smf
from scipy import stats
import matplotlib.pyplot as plt

class DeepTwinCausalAnalyzer:
    """
    Safe causal inference for individual patient analytics.
    
    Implements multiple methods with automatic assumption checking
    and conservative interpretation defaults.
    """
    
    def __init__(self, data, patient_id_col, time_col, 
                 treatment_col, outcome_col):
        self.data = data.copy()
        self.patient_id = patient_id_col
        self.time = time_col
        self.treatment = treatment_col
        self.outcome = outcome_col
        self.results = {}
        self.warnings = []
    
    def check_assumptions(self):
        """Run all assumption checks and store warnings."""
        # Check 1: Minimum sample size
        n = len(self.data)
        if n < 30:
            self.warnings.append(
                f"WARNING: Small sample size (n={n}). "
                "Results may be unreliable."
            )
        
        # Check 2: Treatment overlap
        treat_rate = self.data[self.treatment].mean()
        if treat_rate < 0.1 or treat_rate > 0.9:
            self.warnings.append(
                f"WARNING: Treatment imbalance (rate={treat_rate:.2f}). "
                "Positivity assumption may be violated."
            )
        
        # Check 3: Missing data
        missing_pct = self.data.isnull().mean().mean() * 100
        if missing_pct > 5:
            self.warnings.append(
                f"WARNING: {missing_pct:.1f}% missing data. "
                "Consider multiple imputation."
            )
        
        # Check 4: Autocorrelation
        if self.time in self.data.columns:
            residuals = smf.ols(
                f'{self.outcome} ~ {self.treatment}', 
                data=self.data
            ).fit().resid
            lb_test = sm.stats.acorr_ljungbox(residuals, lags=5)
            if lb_test['lb_pvalue'].min() < 0.05:
                self.warnings.append(
                    "WARNING: Autocorrelation detected. "
                    "Use time-series methods (ITS, ARIMA)."
                )
        
        return self.warnings
    
    def run_its_analysis(self, intervention_time):
        """Interrupted Time Series analysis."""
        df = self.data.copy()
        df['intervention'] = (df[self.time] >= intervention_time).astype(int)
        df['time_after'] = (df[self.time] - intervention_time).clip(lower=0)
        df['time_after'] = df['time_after'] * df['intervention']
        
        model = smf.ols(
            f'{self.outcome} ~ {self.time} + intervention + time_after',
            data=df
        ).fit(cov_type='HAC', cov_kwds={'maxlags': 5})
        
        self.results['ITS'] = {
            'immediate_effect': model.params['intervention'],
            'trend_change': model.params['time_after'],
            'p_immediate': model.pvalues['intervention'],
            'p_trend': model.pvalues['time_after'],
            'model': model
        }
        return self.results['ITS']
    
    def run_did_analysis(self, control_group_data):
        """Difference-in-Differences analysis."""
        combined = pd.concat([
            self.data.assign(group=1),
            control_group_data.assign(group=0)
        ])
        
        model = smf.ols(
            f'{self.outcome} ~ group * {self.treatment}',
            data=combined
        ).fit()
        
        did_coeff = model.params[f'group:{self.treatment}']
        did_pvalue = model.pvalues[f'group:{self.treatment}']
        
        self.results['DiD'] = {
            'effect': did_coeff,
            'p_value': did_pvalue,
            'model': model
        }
        return self.results['DiD']
    
    def calculate_e_value(self, risk_ratio):
        """Calculate E-value for sensitivity analysis."""
        if risk_ratio < 1:
            risk_ratio = 1 / risk_ratio
        e_val = risk_ratio + np.sqrt(risk_ratio * (risk_ratio - 1))
        self.results['e_value'] = e_val
        return e_val
    
    def generate_report(self):
        """Generate comprehensive safety report."""
        report = []
        report.append("=" * 60)
        report.append("DEEPTWIN CAUSAL ANALYSIS REPORT")
        report.append("=" * 60)
        
        # Warnings
        report.append("\n## ASSUMPTION CHECKS")
        if self.warnings:
            for w in self.warnings:
                report.append(f"  - {w}")
        else:
            report.append("  All checks passed.")
        
        # Results
        report.append("\n## ANALYSIS RESULTS")
        for method, result in self.results.items():
            report.append(f"\n### {method}")
            for key, value in result.items():
                if key != 'model':
                    if isinstance(value, float):
                        report.append(f"  {key}: {value:.4f}")
                    else:
                        report.append(f"  {key}: {value}")
        
        # Interpretation
        report.append("\n## INTERPRETATION")
        report.append("  [TEMPORAL ASSOCIATION ONLY -- NOT CAUSAL]")
        report.append("  This analysis identifies statistical patterns.")
        report.append("  Unmeasured confounders may explain observed associations.")
        report.append("  Clinical judgment required for all treatment decisions.")
        
        return "\n".join(report)


# Usage example
# analyzer = DeepTwinCausalAnalyzer(df, 'patient_id', 'week', 
#                                   'medication', 'symptom_score')
# analyzer.check_assumptions()
# analyzer.run_its_analysis(intervention_time=12)
# print(analyzer.generate_report())
```

---

## 10. Top 5 Recommended Methods for DeepTwin

### Ranked by Suitability for Individual-Patient Clinical Analytics

---

### #1: Bayesian N-of-1 Trial Analysis

**Priority: HIGHEST**

**Why #1**: DeepTwin's core value proposition is individual patient optimization. N-of-1 trials are literally designed for this. The Bayesian framework provides:
- Individual-level posterior probability of benefit
- Natural borrowing of strength across similar patients
- Direct answers to "what is the probability THIS patient benefits?"
- Handles the sparse, noisy, individualized data that characterizes digital therapeutics

**Implementation**: PyMC-based hierarchical models with adaptive designs
**When to use**: Comparing treatments for an individual patient, DTx optimization
**Clinical strength**: Gold standard for personalized medicine

---

### #2: Interrupted Time Series (ITS) with ARIMA Errors

**Priority: HIGH**

**Why #2**: Most DeepTwin interventions have clear start dates and continuous monitoring. ITS:
- Uses the patient's own pre-intervention trajectory as the counterfactual
- Handles autocorrelation (inevitable in clinical time series)
- Provides both immediate and gradual effect estimates
- Requires no control group (though adding one strengthens inference)

**Implementation**: `statsmodels` with `SARIMAX` for autocorrelated errors
**When to use**: Single-patient pre/post intervention with continuous monitoring
**Clinical strength**: Standard method for healthcare QI evaluation

---

### #3: Bayesian Causal Graphs (DoWhy + PyMC)

**Priority: HIGH**

**Why #3**: Clinical data is inherently multivariate with complex confounding structures. Bayesian causal graphs:
- Make all assumptions explicit and testable
- Support counterfactual reasoning ("what if patient had NOT received treatment?")
- Integrate domain knowledge through graph structure and priors
- Provide uncertainty quantification for all estimates

**Implementation**: DoWhy for identification + PyMC for estimation
**When to use**: Multi-variable causal questions, confounding analysis
**Clinical strength**: Combines statistical rigor with clinical knowledge

---

### #4: CausalImpact / Bayesian Structural Time Series

**Priority: MODERATE-HIGH**

**Why #4**: For patients with control time series available (e.g., other biomarkers, population data), CausalImpact:
- Constructs a data-driven counterfactual from correlated series
- Provides full posterior distributions of effects
- Handles seasonality and trend automatically
- Is well-validated and widely used (Google)

**Implementation**: `pycausalimpact` or TensorFlow Probability BSTS
**When to use**: When control time series exist (e.g., blood pressure with activity/heart rate controls)
**Clinical strength**: Elegant counterfactual estimation with uncertainty

---

### #5: Propensity Score Methods with E-Value Sensitivity Analysis

**Priority: MODERATE-HIGH**

**Why #5**: When comparing treated vs. untreated patients from observational data:
- Propensity scores balance observed confounders
- Multiple approaches (matching, weighting, stratification) allow triangulation
- **E-values** provide quantified sensitivity to unmeasured confounding
- Essential for real-world evidence generation

**Implementation**: `sklearn` for propensity scores + custom E-value calculation
**When to use**: Observational comparisons between treatment groups
**Clinical strength**: Most widely used causal method in clinical epidemiology

---

### Method Selection Decision Tree

```
Is this about comparing treatments for ONE patient?
  YES -> N-of-1 Trial (Bayesian hierarchical)
  NO  -> Is there a clear intervention date with pre/post data?
    YES -> Does the patient have >12 pre-intervention observations?
      YES -> Interrupted Time Series
      NO  -> Pre-post ANCOVA (label as exploratory)
    NO  -> Are you comparing treated vs. untreated groups?
      YES -> Do you have a comparable control group?
        YES -> Difference-in-Differences
        NO  -> Propensity Score Methods + E-value
      NO  -> Are there multiple variables with causal questions?
        YES -> Bayesian Causal Graphs (DoWhy)
        NO  -> CausalImpact (if control series available)
```

---

## References

### Methodological Foundations
1. Bernal JL, Cummins S, Gasparrini A. "Interrupted time series regression for the evaluation of public health interventions: a tutorial." *Int J Epidemiol*. 2017;46(1):348-355.
2. Wagenaar BH, et al. "Use of interrupted time series methods in the evaluation of health system quality improvement interventions." *BMC Med Res Methodol*. 2020;20:759.
3. AHRQ. "Design and Implementation of N-of-1 Trials: A User's Guide." 2014.
4. Zucker DR, et al. "Combining single patient (N-of-1) trials to estimate population treatment effects and to evaluate individual patient responses to treatment." *J Clin Epidemiol*. 1997;50(4):401-410.
5. Callaway B, Sant'Anna PHC. "Difference-in-Differences with Multiple Time Periods." *J Econometrics*. 2021;225(2):200-230.
6. Rosenbaum PR, Rubin DB. "The central role of the propensity score in observational studies for causal effects." *Biometrika*. 1983;70(1):41-55.
7. VanderWeele TJ, Ding P. "Sensitivity Analysis in Observational Research: Introducing the E-Value." *Ann Intern Med*. 2017;167(4):268-274.
8. Pearl J. "Causality: Models, Reasoning, and Inference." Cambridge University Press. 2009.
9. Brodersen KH, et al. "Inferring causal impact using Bayesian structural time-series models." *Ann Appl Stat*. 2015;9(1):247-274.
10. Sharma A, et al. "DoWhy: An End-to-End Library for Causal Inference." 2020.

### Clinical Applications
11. Daza EJ. "A Counterfactual Framework for Individual Treatment Effect Estimation in N-of-1 Trials." *Am J Epidemiol*. 2018;187(12):2682-2690.
12. Scheetz L, et al. "Comparison of Bayesian Networks, G-estimation and linear models to estimate causal treatment effects in aggregated N-of-1 trials with carry-over effects." *BMC Med Res Methodol*. 2023;23:2012.
13. Li F, et al. "Balancing Covariates via Propensity Score Weighting." *J Am Stat Assoc*. 2018;113(521):390-400.
14. Saeed S, et al. "Segmented generalized mixed effect models to evaluate health outcomes." *Int J Public Health*. 2018;63:547-551.
15. Hernan MA, Robins JM. "Causal Inference: What If." Chapman & Hall/CRC. 2020.
16. Li G, et al. "Assessing regression to the mean effects in health care initiatives." *BMC Med Res Methodol*. 2013;13:119.
17. Chung WT, et al. "The use of the E-value for sensitivity analysis." *J Clin Epidemiol*. 2023;164:111-116.
18. Abadie A, Diamond A, Hainmueller J. "Synthetic Control Methods for Comparative Case Studies." *J Am Stat Assoc*. 2010;105(490):493-505.
19. Cornfield J, et al. "Smoking and lung cancer: recent evidence and a discussion of some questions." *J Natl Cancer Inst*. 1959;22:173-203.
20. Vickers AJ, Altman DG. "Analysing controlled trials with baseline and follow up measurements." *BMJ*. 2001;323(7321):1123-1124.

### Software & Tools
21. Microsoft Research. "DoWhy: Python library for causal inference." [https://github.com/microsoft/dowhy](https://github.com/microsoft/dowhy)
22. Google. "CausalImpact R/Python packages." [https://github.com/google/CausalImpact](https://github.com/google/CausalImpact)
23. PyMC Developers. "PyMC: Probabilistic Programming in Python." [https://www.pymc.io](https://www.pymc.io)
24. Statsmodels. "Statistics in Python." [https://www.statsmodels.org](https://www.statsmodels.org)

---

*This framework is a living document. Causal inference methodology evolves rapidly, and DeepTwin should continuously integrate advances from the methodological literature while maintaining its conservative, safety-first interpretation framework.*

*All analyses conducted under this framework must include: (1) explicit assumption statements, (2) sensitivity analyses, (3) E-values where applicable, and (4) clear language distinguishing association from causation.*
