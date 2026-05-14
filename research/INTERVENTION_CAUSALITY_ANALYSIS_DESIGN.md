# Safe Causal Inference Methods for Clinical Longitudinal Intervention Data

## A Comprehensive Research Report

**Document Version:** 1.0  
**Scope:** Causal inference methodology for observational clinical data where RCTs are unavailable  
**Target Audience:** Biostatisticians, clinical researchers, digital therapeutics developers, data scientists in healthcare  
**Evidence Framework:** Methods are graded (A-D) based on methodological rigor and healthcare evidence base

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Interrupted Time Series (ITS)](#2-interrupted-time-series-its)
3. [Difference-in-Differences](#3-difference-in-differences)
4. [Propensity Score Methods](#4-propensity-score-methods)
5. [N-of-1 Trials](#5-n-of-1-trials)
6. [Bayesian Causal Models](#6-bayesian-causal-models)
7. [Causal Impact (Google)](#7-causal-impact-google)
8. [Safe Interpretation Framework](#8-safe-interpretation-framework)
9. [Methods to AVOID](#9-methods-to-avoid-in-observational-clinical-data)
10. [Key Methodology Recommendations](#10-key-methodology-recommendations)
11. [References](#11-references)

---

## 1. Executive Summary

Clinical longitudinal intervention data -- routinely collected from electronic health records, wearable devices, patient-reported outcome measures, and digital therapeutic platforms -- presents unique challenges for causal inference. Unlike randomized controlled trials (RCTs), observational clinical data lacks randomized treatment assignment, making it vulnerable to confounding, selection bias, and temporal confounding. This report provides a comprehensive review of **safe causal inference methods** specifically suited for clinical longitudinal data, with emphasis on methods that protect against common pitfalls.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Temporal precedence** | The intervention must precede the outcome in time |
| **Confounding control** | All major confounders must be measured and adjusted for |
| **Sensitivity analysis** | Report E-values or equivalent to assess unmeasured confounding |
| **Appropriate language** | Use "temporal association" or "estimated effect" rather than "caused" |
| **Clinical oversight** | All causal claims require clinical expert review |

### Method Selection Decision Tree

```
Data available?
|
+-- Single patient, repeated measures over time?
|   +-- Can randomize treatment periods? --> N-of-1 Trial (Grade B)
|   +-- No randomization? --> ITS or Bayesian Structural Time Series (Grade B)
|
+-- Multiple patients with treatment and control groups?
|   +-- Parallel trends plausible? --> Difference-in-Differences (Grade B)
|   +-- Many covariates available? --> Propensity Score Methods (Grade B)
|
+-- Multiple patients, multiple time points?
|   +-- Sufficient pre-intervention data? --> ITS with control series (Grade B)
|   +-- Complex time-varying confounding? --> Marginal Structural Models (Grade B)
|
+-- Need counterfactual from control time series?
|   --> Causal Impact / Bayesian Structural Time Series (Grade B)
```

---

## 2. Interrupted Time Series (ITS)

### 2.1 Overview

Interrupted Time Series (ITS) is considered **the strongest quasi-experimental design** available for evaluating the impact of interventions implemented in healthcare settings. With this design, outcomes are measured at multiple time points before and after implementing an intervention, allowing the change in **level** and **trend** of outcomes to be compared.

**Evidence grade for healthcare: B** -- Well-established with thousands of applications, though subject to key assumptions.

### 2.2 When to Use

- Single patient or single group with a **clear intervention start date**
- At least **8-12 pre-intervention observations** and 8-12 post-intervention observations (minimum 16 total; >=50 preferred)
- Outcome measured at regular intervals (e.g., weekly depression scores, monthly hospitalization rates)
- No concurrent control group available

### 2.3 Core Assumptions

| Assumption | Description | How to Validate |
|------------|-------------|-----------------|
| **Stable pre-intervention trend** | The outcome follows a predictable pattern before the intervention | Visual inspection; statistical tests for trend stationarity (ADF test) |
| **No concurrent confounding events** | No other major changes occur at the same time as the intervention | Document all concurrent events; use nonequivalent dependent variable or control series |
| **Autocorrelation accounted for** | Observations close in time are correlated | Durbin-Watson test; ACF/PACF plots; include autoregressive terms |
| **Correct model specification** | The functional form (linear, step, change in slope) matches reality | Residual analysis; compare AIC/BIC across model specifications |

### 2.4 The Segmented Regression Model

The standard ITS model (Wagner et al., 2002; Bernal et al., 2017):

```
Y_t = beta_0 + beta_1 * time_t + beta_2 * intervention_t + beta_3 * (time_t - T_intervention) * intervention_t + epsilon_t
```

Where:
- `beta_0`: Baseline level at time 0
- `beta_1`: Pre-intervention slope (trend)
- `beta_2`: Immediate level change at intervention
- `beta_3`: Change in slope after intervention
- `T_intervention`: Time point of intervention

**Key parameters:**
- `beta_2` = **Level change**: The immediate jump/drop in the outcome
- `beta_3` = **Slope change**: The difference in trend after intervention vs. before

### 2.5 Implementation in Python (statsmodels)

```python
import pandas as pd
import numpy as np
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.diagnostic import acorr_ljungbox
from statsmodels.tsa.stattools import adfuller, acf, pacf

# --- 1. Prepare data ---
# df must have: 'time' (integer), 'outcome', 'intervention' (0/1)
# 'time_after' = number of time periods since intervention (0 before)
df['time_after'] = np.where(df['intervention'] == 1, 
                             df['time'] - T_intervention, 0)

# --- 2. Fit segmented regression ---
model = smf.ols(
    formula='outcome ~ time + intervention + time_after:intervention + C(season)',
    data=df
).fit(cov_type='HAC', cov_kwds={'maxlags': 4})  # HAC for autocorrelation

print(model.summary())

# --- 3. Check residuals for autocorrelation ---
ljung_box = acorr_ljungbox(model.resid, lags=10)
print(ljung_box)

# --- 4. Test for stationarity (pre-period) ---
pre_data = df[df['intervention'] == 0]['outcome']
adf_result = adfuller(pre_data)
print(f'ADF p-value: {adf_result[1]}')

# --- 5. Extract key estimates ---
level_change = model.params['intervention']
slope_change = model.params['time_after:intervention']
print(f"Immediate level change: {level_change:.3f} (p={model.pvalues['intervention']:.4f})")
print(f"Slope change: {slope_change:.4f} (p={model.pvalues['time_after:intervention']:.4f})")
```

### 2.6 ARIMA-Based ITS

For count data or when autocorrelation structure is complex:

```python
from statsmodels.tsa.arima.model import ARIMA

# ARIMA with intervention components
# Order: (p,d,q) for ARIMA + seasonal (P,D,Q,s)
model_arima = ARIMA(
    df['outcome'], 
    order=(1, 0, 1),
    seasonal_order=(1, 0, 0, 12),  # e.g., monthly seasonality
    exog=df[['intervention', 'time_after']]
)
result = model_arima.fit()
print(result.summary())
```

### 2.7 Limitations and Mitigations

| Limitation | Mitigation Strategy |
|------------|-------------------|
| Confounding events at intervention time | Add control series (nonequivalent dependent variable) |
| Seasonal effects | Include seasonal dummy variables or seasonal ARIMA |
| Non-stationarity | Differencing; test with ADF; use ARIMA instead of OLS |
| Heteroskedasticity | Robust standard errors; weighted least squares |
| Short time series | Bayesian approaches; latent growth curve models |
| Regression to the mean | Longer pre-period; confirm with alternative model specifications |

### 2.8 Healthcare Applications

ITS designs have been used in **1,389+ published studies** across healthcare domains:
- **Quality improvement** (40% of clinical applications): antimicrobial stewardship, mobilization programs
- **Drug utilization research** (17%): evaluating drug dose changes, regulatory approvals
- **Guideline implementation** (5%): assessing impact of clinical practice guidelines
- **Public health policy** (32%): smoking bans, traffic laws, mass media campaigns
- **Pharmaceutical research**: evaluating drug dose evaluation and regulatory approval effects

Key examples:
- De-adoption of tight glycemic control across 113 ICUs following publication of negative RCT
- Impact of ENT guidelines on perioperative care in pediatric tonsillectomy
- Opioid prescribing changes after state policy interventions

### 2.9 Methodological Strengths

ITS designs can statistically test for:
- Autocorrelation
- Seasonality
- Non-stationarity
- Heteroskedasticity
- History and maturation effects
- Random fluctuations

**Internal validity enhancement options:**
- Nonequivalent dependent variable (outcome affected by concurrent events but not intervention)
- Control series (units not exposed to intervention)
- Multiple baseline design (staggered intervention across sites)

---

## 3. Difference-in-Differences

### 3.1 Overview

Difference-in-Differences (DiD) estimates the causal effect of an intervention by comparing the **change in outcomes over time** between a treatment group and a control group. The key insight is that the control group provides a counterfactual -- what would have happened to the treated group in the absence of treatment.

**Evidence grade for healthcare: B** -- Widely used in health policy evaluation; recent methodological advances address many limitations.

### 3.2 When to Use

- Have both a **treatment group** and a **control/comparison group**
- Both groups have **pre- and post-intervention measurements**
- Can reasonably assume **parallel trends** (in the absence of intervention, both groups would have followed similar trajectories)
- Intervention is implemented at a specific point in time

### 3.3 The Parallel Trends Assumption

**The critical identifying assumption**: In the absence of the intervention, the difference in outcomes between the treatment and control groups would have remained constant over time.

```
Counterfactual for treated = Y_treated_pre + (Y_control_post - Y_control_pre)
Treatment Effect = Y_treated_post - Counterfactual
```

**How to validate:**
1. **Plot trends**: Visually inspect pre-intervention trends for both groups
2. **Pre-trend tests**: Run the DiD model using only pre-intervention periods as "placebo" interventions
3. **Event study**: Estimate dynamic effects period-by-period; pre-intervention coefficients should be near zero

### 3.4 Basic DiD Model

```python
import statsmodels.formula.api as smf

# Data: 'outcome', 'treated' (0/1), 'post' (0/1), individual/cohort identifiers
# Two-way fixed effects (TWFE) - classic approach
model = smf.ols(
    formula='outcome ~ treated:post + C(entity_id) + C(time_period)',
    data=df
).fit(cov_type='cluster', cov_kwds={'groups': df['entity_id']})

# The coefficient on 'treated:post' is the DiD estimate
print(model.summary())
```

### 3.5 Event Study (Dynamic DiD)

```python
import matplotlib.pyplot as plt

# Create relative time indicators
for t in range(-k_pre, k_post+1):
    if t != -1:  # omit baseline period
        df[f'rel_time_{t}'] = ((df['time'] - df['intervention_time']) == t).astype(int)

# Event study regression
formula = 'outcome ~ ' + ' + '.join([f'rel_time_{t}' for t in range(-k_pre, k_post+1) if t != -1])
formula += ' + C(entity_id) + C(time_period)'
model_es = smf.ols(formula=formula, data=df).fit()

# Plot event study coefficients
coefs = [model_es.params[f'rel_time_{t}'] for t in range(-k_pre, k_post+1) if t != -1]
cis = [model_es.conf_int().loc[f'rel_time_{t}'] for t in range(-k_pre, k_post+1) if t != -1]
periods = [t for t in range(-k_pre, k_post+1) if t != -1]

plt.errorbar(periods, coefs, yerr=[(c[1]-c[0])/2 for c in cis], fmt='o')
plt.axvline(x=-0.5, color='red', linestyle='--', label='Intervention')
plt.axhline(y=0, color='black', linestyle='-')
plt.xlabel('Periods Relative to Intervention')
plt.ylabel('Estimated Effect')
plt.legend()
```

### 3.6 Staggered DiD (Heterogeneous Treatment Timing)

When different units receive treatment at different times, classic TWFE can be biased. Modern estimators:

| Estimator | Approach | Key Advantage |
|-----------|----------|---------------|
| **Callaway & Sant'Anna (2021)** | Uses never-treated or not-yet-treated as comparator; doubly-robust | Weaker parallel trends; handles heterogeneous effects |
| **Borusyak et al. (2021)** | Imputes counterfactual outcomes using never-treated | More efficient; computationally fast |
| **Sun & Abraham (2021)** | Estimates cohort-specific dynamic effects separately | Handles cohort heterogeneity explicitly |

```python
# Using the did package (R) or didimputation (Python emerging)
# Callaway-Sant'Anna requires:
# 1. First/last treated periods per unit
# 2. Group-time ATT estimation
# 3. Aggregation to overall ATT or event-study
```

### 3.7 Synthetic Control

When only one or a few units are treated, construct a **weighted combination of control units** that closely matches the pre-treatment trajectory of the treated unit.

```python
from scipy.optimize import minimize

# Pre-treatment outcomes for treated unit (Y1) and control pool (Y0)
def objective(weights):
    synthetic = Y0_pre @ weights
    return np.sum((Y1_pre - synthetic) ** 2)

constraints = [{'type': 'eq', 'fun': lambda w: np.sum(w) - 1}]
bounds = [(0, 1) for _ in range(n_controls)]

result = minimize(objective, x0=np.ones(n_controls)/n_controls,
                  method='SLSQP', bounds=bounds, constraints=constraints)
optimal_weights = result.x

# Post-treatment gap = Treatment Effect
gap = Y1_post - (Y0_post @ optimal_weights)
```

### 3.8 Healthcare Applications

- Hospital-level interventions (one hospital implements program; others serve as controls)
- State-level policy changes (Medicaid expansion, prescription drug monitoring programs)
- Quality improvement initiatives across multiple clinics
- Digital health intervention rollout across patient subgroups

### 3.9 Key Considerations for Healthcare

| Issue | Guidance |
|-------|----------|
| **Selection into treatment** | If treatment assignment is correlated with patient characteristics, DiD alone is insufficient; combine with propensity score approaches |
| **Spillover effects** | Treatment at one hospital may affect nearby hospitals (SUTVA violation); use spatial buffers |
| **Non-parallel trends** | If pre-trends diverge, consider synthetic control, matching on pre-trends, or adding group-specific linear trends |
| **Small number of clusters** | Use wild cluster bootstrap instead of conventional standard errors |
| **Time-varying confounders** | Add covariates interacted with time period dummies |

---

## 4. Propensity Score Methods

### 4.1 Overview

Propensity score methods aim to **mimic key characteristics of an RCT** by creating comparable treatment and control groups based on observed baseline characteristics. The propensity score is the probability of receiving treatment conditional on observed covariates.

**Evidence grade for healthcare: B** -- Well-established; critical limitation is unmeasured confounding.

### 4.2 Core Methods

| Method | Description | Best For |
|--------|-------------|----------|
| **Propensity Score Matching (PSM)** | Match treated and control subjects with similar propensity scores | Moderate sample sizes; clear treatment/control distinction |
| **Inverse Probability Weighting (IPW)** | Weight observations by inverse of propensity score | Large samples; time-varying treatments |
| **Propensity Score Stratification** | Divide into quintiles based on propensity score; compare within strata | Quick implementation; diagnostic purposes |
| **Covariate Adjustment** | Include propensity score as covariate in outcome model | Simplicity; when matching fails |

### 4.3 Propensity Score Matching Implementation

```python
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import NearestNeighbors
import pandas as pd

# --- 1. Estimate propensity scores ---
X = df[['age', 'sex', 'baseline_severity', 'comorbidities', 'duration']]
treatment = df['treatment']

ps_model = LogisticRegression(max_iter=1000)
ps_model.fit(X, treatment)
df['propensity_score'] = ps_model.predict_proba(X)[:, 1]

# --- 2. Check overlap (positivity) ---
import matplotlib.pyplot as plt
plt.hist(df[df['treatment']==1]['propensity_score'], bins=30, alpha=0.5, label='Treated')
plt.hist(df[df['treatment']==0]['propensity_score'], bins=30, alpha=0.5, label='Control')
plt.xlabel('Propensity Score')
plt.legend()
plt.title('Propensity Score Overlap')

# --- 3. 1:1 Nearest neighbor matching ---
treated = df[df['treatment'] == 1]
control = df[df['treatment'] == 0]

nn = NearestNeighbors(n_neighbors=1)
nn.fit(control[['propensity_score']])
distances, indices = nn.kneighbors(treated[['propensity_score']])

matched_control = control.iloc[indices.flatten()].copy()
matched_treated = treated.copy()
matched_data = pd.concat([matched_treated, matched_control], ignore_index=True)

# --- 4. Check balance ---
from scipy import stats
for var in ['age', 'baseline_severity']:
    t_stat, p_val = stats.ttest_ind(
        matched_treated[var], matched_control[var]
    )
    print(f"{var}: treated mean={matched_treated[var].mean():.2f}, "
          f"control mean={matched_control[var].mean():.2f}, p={p_val:.3f}")

# --- 5. Estimate treatment effect on matched sample ---
model = smf.ols('outcome ~ treatment', data=matched_data).fit()
print(model.summary())
```

### 4.4 Inverse Probability Weighting (IPW) for Longitudinal Data

For time-varying treatments, IPW is the **preferred method** over baseline-only PSM. Marginal Structural Models (MSMs) use IPW to adjust for time-varying confounding.

```python
def estimate_ipw_weights(df, id_col, time_col, treatment_col, covariates):
    """
    Estimate stabilized IPW weights for time-varying treatment.
    Creates pseudo-population where treatment assignment is independent
    of observed confounders at each time point.
    """
    df = df.sort_values([id_col, time_col])
    df['numerator'] = 1.0
    df['denominator'] = 1.0
    
    for t in df[time_col].unique():
        mask_t = df[time_col] == t
        X = df.loc[mask_t, covariates]
        A = df.loc[mask_t, treatment_col]
        
        # P(A_t | A_{t-1}, baseline)
        model_num = LogisticRegression(max_iter=1000)
        model_num.fit(X[['baseline_treatment']], A)
        p_num = model_num.predict_proba(X[['baseline_treatment']])[:, 1]
        
        # P(A_t | L_t, A_{t-1})
        model_den = LogisticRegression(max_iter=1000)
        model_den.fit(X, A)
        p_den = model_den.predict_proba(X)[:, 1]
        
        df.loc[mask_t, 'numerator'] *= np.where(A == 1, p_num, 1 - p_num)
        df.loc[mask_t, 'denominator'] *= np.where(A == 1, p_den, 1 - p_den)
    
    df['ipw_weight'] = df['numerator'] / df['denominator']
    # Truncate extreme weights
    df['ipw_weight'] = df['ipw_weight'].clip(upper=df['ipw_weight'].quantile(0.99))
    
    return df

# --- 6. Fit MSM with IPW weights ---
msm = smf.gee(
    formula='outcome ~ treatment',
    groups='patient_id',
    data=df,
    weights=df['ipw_weight']
).fit()
print(msm.summary())
```

### 4.5 Critical: Unmeasured Confounding Sensitivity Analysis

Propensity score methods only control for **observed** confounders. **ALWAYS** assess sensitivity to unmeasured confounding using the **E-value** (VanderWeele & Ding, 2017).

**The E-value** is defined as the minimum strength of association, on the risk ratio scale, that an unmeasured confounder would need to have with both the treatment and the outcome to fully explain away the observed treatment-outcome association.

```python
import numpy as np

def e_value_rr(rr):
    """
    Calculate E-value for a risk ratio.
    E-value = RR + sqrt(RR * (RR - 1))
    """
    if rr < 1:
        rr = 1 / rr
    return rr + np.sqrt(rr * (rr - 1))

# Example: Treatment HR = 0.60 (40% reduction)
observed_hr = 0.60
e_val_point = e_value_rr(1 / observed_hr)  # Invert for protective effect
print(f"Observed HR: {observed_hr}")
print(f"E-value (point estimate): {e_val_point:.2f}")
print(f"Interpretation: An unmeasured confounder would need to be associated")
print(f"with BOTH treatment and outcome by a RR of {e_val_point:.2f} to fully explain away the effect.")

# Also calculate for lower CI bound
hr_lower_ci = 0.42
e_val_ci = e_value_rr(1 / hr_lower_ci)
print(f"E-value (lower CI): {e_val_ci:.2f}")

# Using EValue R package (recommended):
# library(EValue)
# evalues.HR(est=0.60, lo=0.42, hi=0.86, rare=FALSE)
```

**Interpretation guidelines for E-values in healthcare:**

| E-value magnitude | Interpretation |
|-------------------|---------------|
| > 3.0 | Large -- would require very strong unmeasured confounding to explain away |
| 1.5 - 3.0 | Moderate -- plausible unmeasured confounders could partly explain |
| 1.2 - 1.5 | Small -- weak unmeasured confounding could easily explain |
| < 1.2 | Very small -- findings are highly vulnerable to unmeasured confounding |

### 4.6 Healthcare Applications

- Comparing treatments when RCT is not feasible (e.g., surgical vs. medical management)
- Evaluating off-label medication use using electronic health records
- Comparative effectiveness research with observational data
- Longitudinal studies with time-varying treatments (use IPW/MSM, NOT baseline-only PSM)

### 4.7 Critical Warnings

> **Warning**: In longitudinal studies with time-varying treatments, using **baseline-only propensity score matching is inappropriate** in ~25% of published studies. Always use time-dependent methods (IPW, g-formula, or time-dependent PSM) when treatment changes during follow-up.

| Mistake | Consequence | Correct Approach |
|---------|-------------|------------------|
| PSM with baseline covariates for time-varying treatment | Misses changes in confounders over time; biased estimates | IPW, g-formula, or time-dependent PSM |
| Ignoring positivity violations | Extrapolation to unsupported covariate regions | Trim extreme propensity scores; report overlap |
| No balance assessment after matching | Cannot verify matching achieved its goal | Standardized mean differences < 0.1 for all covariates |
| No sensitivity analysis | No sense of robustness to unmeasured confounding | Always report E-values |

---

## 5. N-of-1 Trials

### 5.1 Overview

N-of-1 trials are **individualized randomized crossover experiments** conducted within a single patient. Each patient serves as their own control through repeated randomization between treatment and control periods. They represent the gold standard for **personalized medicine** when traditional RCTs are impractical.

**Evidence grade: B** -- Validated by CENT 2015 guidelines; particularly strong in chronic conditions, pain management, and digital therapeutics.

### 5.2 When to Use

- **Chronic, stable conditions** with recurrent symptoms (depression, anxiety, chronic pain, asthma)
- Need to determine **optimal treatment for a specific individual**
- Treatments have **rapid onset and offset** (no long carryover effects)
- Patient is willing to undergo multiple crossover periods
- **Digital therapeutics** where outcomes can be measured passively (sleep, activity, mood)

### 5.3 Design Types

| Design | Structure | Use Case |
|--------|-----------|----------|
| **AB** | Treatment A, then Treatment B | Simplest; when carryover is minimal |
| **ABA (Reversal)** | A-B-A | Can verify reversibility of effect |
| **ABAB** | A-B-A-B | Most robust; confirms consistency |
| **Counterbalanced AB** | Randomize AB vs BA order | Controls for time trends |
| **AB with placebo** | A/B/P crossover | Demonstrates assay sensitivity |
| **Multiple treatments** | A/B/C/D Latin square | Comparing several active treatments |

**Optimal designs for N-of-1 trials** (based on Carriere & Li, Li et al.):
- 2 treatments, 2 comparisons: ABBA or ABAB
- 2 treatments, 3 comparisons: ABBABA or its dual
- 2 treatments, 4 comparisons: ABBABAAB or ABABBABA
- All 8 possible sequences for 3 AB pairs across 6 periods

### 5.4 Sample Size Considerations

For cross-over phase comparing Drug A to B:

```
n_A = n_B = 2 * sigma_c^2 * (Z_alpha/2 + Z_beta)^2 * k / (delta_c^2 * (1 - rho))
```

Where:
- `k`: number of crossover periods
- `sigma_c`: standard deviation
- `delta_c`: clinically meaningful treatment difference
- `rho`: within-subject correlation

**Key insight**: More crossovers (`k`) reduce required sample size. Higher within-subject correlation (`rho`) also reduces required sample size.

### 5.5 Analysis Methods

#### 5.5.1 Mixed Effects Model (Frequentist)

```python
import statsmodels.formula.api as smf

# Data: long format with patient_id, period, treatment (0/1), outcome
# Period is the crossover period; treatment alternates

model = smf.mixedlm(
    formula='outcome ~ treatment + period',
    data=nof1_data,
    groups=nof1_data['patient_id'],
    re_formula='~treatment'  # Random slope for treatment effect
).fit()

print(model.summary())
# Fixed effect of 'treatment' = average treatment effect
# Random effect variance = between-patient heterogeneity in treatment response
```

#### 5.5.2 Bayesian Hierarchical Model (Recommended)

```python
import pymc as pm
import numpy as np
import arviz as az

# N-of-1 data: outcomes across periods for multiple patients
n_patients = nof1_data['patient_id'].nunique()
n_periods = nof1_data.groupby('patient_id').size().values

with pm.Model() as nof1_bayesian:
    # Hyperpriors (population-level)
    mu_beta = pm.Normal('mu_beta', mu=0, sigma=5)  # Average treatment effect
    sigma_beta = pm.HalfNormal('sigma_beta', sigma=5)  # Heterogeneity
    
    # Individual treatment effects (partial pooling)
    beta_i = pm.Normal('beta_i', mu=mu_beta, sigma=sigma_beta, 
                       shape=n_patients)
    
    # Individual baselines
    alpha_i = pm.Normal('alpha_i', mu=50, sigma=10, shape=n_patients)
    
    # Residual
    sigma = pm.HalfNormal('sigma', sigma=10)
    
    # Likelihood
    patient_idx = nof1_data['patient_id'].values
    treatment = nof1_data['treatment'].values
    
    outcome_hat = alpha_i[patient_idx] + beta_i[patient_idx] * treatment
    
    outcome_obs = pm.Normal('outcome', mu=outcome_hat, sigma=sigma,
                            observed=nof1_data['outcome'])
    
    # Sample
    trace = pm.sample(2000, tune=1000, target_accept=0.95, 
                      cores=4, chains=4)

# --- Key outputs ---
summary = az.summary(trace, var_names=['mu_beta', 'sigma_beta', 'beta_i'])
print(summary)

# Probability that treatment is beneficial for each patient
for i in range(n_patients):
    prob_benefit = np.mean(trace.posterior['beta_i'].values[:, :, i] > 0)
    print(f"Patient {i}: P(benefit) = {prob_benefit:.2%}")

# Probability that treatment is beneficial on average
prob_avg_benefit = np.mean(trace.posterior['mu_beta'].values > 0)
print(f"P(average benefit) = {prob_avg_benefit:.2%}")
```

#### 5.5.3 Aggregating N-of-1 Trials

When multiple patients complete N-of-1 trials, results can be aggregated:

```python
# Aggregated N-of-1: combining individual treatment effects
# Using the Bayesian model above, mu_beta gives the population-level estimate
# while beta_i gives individual patient effects

# Key question: Is there meaningful heterogeneity?
sigma_beta_samples = trace.posterior['sigma_beta'].values.flatten()
prob_heterogeneity = np.mean(sigma_beta_samples > 1.0)  # clinical threshold
print(f"P(meaningful heterogeneity) = {prob_heterogeneity:.2%}")

# If no heterogeneity, all patients respond similarly
# If high heterogeneity, personalized treatment assignment is justified
```

### 5.6 Carryover Effect Testing

```python
# Test for carryover by including lagged treatment
nof1_data['treatment_lag1'] = nof1_data.groupby('patient_id')['treatment'].shift(1)

model_carryover = smf.mixedlm(
    formula='outcome ~ treatment + treatment_lag1 + period',
    data=nof1_data,
    groups=nof1_data['patient_id']
).fit()

# Significant treatment_lag1 suggests carryover effects
print(model_carryover.summary())
```

### 5.7 Reporting Standards: CENT 2015

The **CONSORT Extension for N-of-1 trials (CENT 2015)** provides reporting guidance for 14 of 25 CONSORT items:

**Key reporting elements:**
- Sequence generation for randomization of treatment periods
- Washout period specification (if used)
- Blinding procedures for each period
- Outcome measurement procedures per period
- Carryover effect assessment
- Diagram depicting the individual N-of-1 trial structure
- Individual patient results alongside aggregate estimates

### 5.8 Digital Therapeutics Applications

N-of-1 trials are particularly powerful for **digital health interventions**:

| Application | Measurement | Design |
|-------------|-------------|--------|
| Sleep hygiene app | Wearable sleep data | ABAB weekly |
| Mindfulness intervention | Daily mood ratings | Counterbalanced A-B |
| Activity coaching | Step count, HRV | ABA monthly |
| Medication timing | Symptom severity + passive data | AB with washout |
| CBT module | PHQ-9 at period boundaries | ABAB biweekly |

**Advantages in digital context:**
- Passive data collection reduces measurement burden
- Rapid randomization through app interface
- Automatic blinding possible via placebo content
- Large number of periods feasible with continuous monitoring
- Bayesian adaptive randomization can optimize period allocation

### 5.9 Limitations

| Limitation | Mitigation |
|------------|------------|
| Carryover effects | Include adequate washout periods; test for lag effects |
| Period effects (time trends) | Counterbalanced designs; include period as covariate |
| Attrition across periods | Keep periods short; minimize patient burden |
| Generalizability | Aggregate multiple N-of-1 trials; Bayesian hierarchical models |
| Blinding challenges | Use matched placebo controls when possible |

---

## 6. Bayesian Causal Models

### 6.1 Overview

Bayesian causal models offer several advantages for clinical longitudinal data: natural uncertainty quantification through credible intervals, incorporation of clinical prior knowledge, flexible hierarchical structures for multiple patients, and principled handling of missing data through multiple imputation.

**Evidence grade: B** -- Methodologically rigorous; increasingly practical with PyMC, Stan, and Turing.jl.

### 6.2 PyMC-Based Approaches

#### 6.2.1 Hierarchical Model for Multiple Patients

```python
import pymc as pm
import arviz as az
import numpy as np

with pm.Model() as clinical_hierarchical:
    # --- Hyperpriors (population level) ---
    mu_intercept = pm.Normal('mu_intercept', mu=50, sigma=15)
    sigma_intercept = pm.HalfNormal('sigma_intercept', sigma=10)
    
    mu_trend = pm.Normal('mu_trend', mu=0, sigma=2)
    sigma_trend = pm.HalfNormal('sigma_trend', sigma=2)
    
    mu_effect = pm.Normal('mu_effect', mu=0, sigma=5)
    sigma_effect = pm.HalfNormal('sigma_effect', sigma=5)
    
    # --- Patient-level parameters (partial pooling) ---
    n_patients = len(df['patient_id'].unique())
    
    alpha = pm.Normal('alpha', mu=mu_intercept, sigma=sigma_intercept, 
                      shape=n_patients)
    beta_trend = pm.Normal('beta_trend', mu=mu_trend, sigma=sigma_trend, 
                           shape=n_patients)
    beta_effect = pm.Normal('beta_effect', mu=mu_effect, sigma=sigma_effect, 
                            shape=n_patients)
    
    # --- Observation noise ---
    sigma_obs = pm.HalfNormal('sigma_obs', sigma=10)
    
    # --- Likelihood ---
    patient_idx = df['patient_id'].values
    mu = (alpha[patient_idx] + 
          beta_trend[patient_idx] * df['time'].values +
          beta_effect[patient_idx] * df['treatment'].values)
    
    y = pm.Normal('y', mu=mu, sigma=sigma_obs, observed=df['outcome'])
    
    # --- Sample ---
    trace = pm.sample(2000, tune=1000, cores=4, chains=4,
                      target_accept=0.95)
```

#### 6.2.2 Prior Specification for Clinical Data

| Parameter | Informative Prior | Rationale |
|-----------|-------------------|-----------|
| Baseline (intercept) | `N(mean_baseline, 10)` | Use historical population mean |
| Treatment effect | `N(0, 5)` | Centered at null; moderate skepticism |
| Trend (slope) | `N(0, 2)` | Most conditions don't change dramatically week-to-week |
| Heterogeneity | `HN(5)` | Expect some between-patient variation |
| Observation noise | `HN(10)` | Based on known measurement error |

**Principles for prior selection:**
1. Use **weakly informative priors** that regularize without dominating the data
2. Center treatment effects at zero (skeptical prior) to guard against false positives
3. Use historical data or meta-analyses to inform hyperpriors
4. Always conduct **prior sensitivity analysis** (check robustness across prior specifications)
5. Document all prior choices transparently

```python
# Prior sensitivity analysis: compare results across prior specifications
priors_to_test = [
    {'mu_effect': 0, 'sigma_effect': 2.5},   # Skeptical
    {'mu_effect': 0, 'sigma_effect': 5.0},   # Moderate (default)
    {'mu_effect': 0, 'sigma_effect': 10.0},  # Enthusiastic
    {'mu_effect': 2, 'sigma_effect': 5.0},   # Optimistic
]

results_comparison = []
for p in priors_to_test:
    with pm.Model() as model:
        mu_effect = pm.Normal('mu_effect', mu=p['mu_effect'], sigma=p['sigma_effect'])
        # ... rest of model ...
        trace = pm.sample(1000, tune=500)
        results_comparison.append({
            'prior': p,
            'posterior_mean': np.mean(trace.posterior['mu_effect']),
            'ci_lower': np.percentile(trace.posterior['mu_effect'], 2.5),
            'ci_upper': np.percentile(trace.posterior['mu_effect'], 97.5)
        })
```

#### 6.2.3 Uncertainty Quantification

```python
# Posterior probability that treatment is beneficial
prob_benefit = np.mean(trace.posterior['mu_effect'].values > 0)
print(f"P(treatment benefit > 0) = {prob_benefit:.1%}")

# Posterior probability of clinically meaningful effect (e.g., >3 point improvement)
prob_meaningful = np.mean(trace.posterior['mu_effect'].values > 3)
print(f"P(treatment benefit > 3 points) = {prob_meaningful:.1%}")

# Probability that treatment is best among alternatives
# (for comparing multiple interventions)
# Model each intervention's effect; compute P(beta_A > beta_B)

# Region of Practical Equivalence (ROPE)
rope = [-2, 2]  # Clinically trivial range
prob_rope = np.mean(
    (trace.posterior['mu_effect'].values >= rope[0]) & 
    (trace.posterior['mu_effect'].values <= rope[1])
)
print(f"P(effect is clinically trivial) = {prob_rope:.1%}")
```

### 6.3 Missing Data Handling

Bayesian models handle missing data naturally through **multiple imputation by chained equations** or directly in the model:

```python
# Option 1: Model missing outcomes directly
with pm.Model() as model_missing:
    # ... model specification ...
    
    # For missing outcomes, PyMC automatically samples from posterior predictive
    y_observed = pm.Normal('y_obs', mu=mu, sigma=sigma,
                           observed=df['outcome'])  # NaN values handled automatically

# Option 2: Explicit imputation model
with pm.Model() as explicit_impute:
    # Imputation model for a missing covariate
    covariate_mean = pm.Normal('cov_mean', mu=0, sigma=10)
    covariate_sd = pm.HalfNormal('cov_sd', sigma=5)
    
    # For observed values: likelihood contribution
    # For missing values: draws from the distribution
    covariate = pm.Normal('covariate', mu=covariate_mean, sigma=covariate_sd,
                          observed=df['covariate_with_missing'])
```

### 6.4 Bayesian Model Averaging for Model Uncertainty

When multiple causal models are plausible, average over them:

```python
# Compare models using WAIC or LOO
comparison = az.compare({
    'linear_its': trace_linear,
    'arima_its': trace_arima,
    'hierarchical': trace_hierarchical
})
print(comparison)

# Use model averaging weights to compute weighted treatment effect estimates
weights = comparison['weight']
```

---

## 7. Causal Impact (Google)

### 7.1 Overview

Google's Causal Impact uses **Bayesian Structural Time Series (BSTS)** to estimate the counterfactual -- what would have happened to the treated unit in the absence of intervention. It predicts the post-intervention trajectory using a model trained on pre-intervention data and control time series, then compares predictions to observed outcomes.

**Evidence grade: B** -- Strong methodological foundation; particularly useful when a randomized experiment is unavailable.

### 7.2 Core Methodology

The BSTS model decomposes the time series into:

```
y_t = mu_t + tau_t + gamma_t + epsilon_t
```

Where:
- `mu_t`: Local level (random walk)
- `tau_t`: Local linear trend
- `gamma_t`: Seasonal component
- `epsilon_t`: Observation noise

Control time series (`X_t`) are included as contemporaneous covariates with time-varying coefficients (`beta_t`):

```
y_t = mu_t + tau_t + gamma_t + beta_t' * X_t + epsilon_t
```

### 7.3 Key Advantages Over Classical DiD

| Feature | Causal Impact (BSTS) | Classical DiD |
|---------|---------------------|---------------|
| Temporal evolution of effect | Yes -- period-by-period estimates | Single point estimate |
| Empirical priors | Yes -- Bayesian treatment | No |
| Multiple covariate sources | Yes -- flexible accommodation | Limited |
| Local trends | Yes -- dynamic | Assumed parallel |
| Seasonality | Yes -- built-in | Must add manually |
| Uncertainty quantification | Full posterior distribution | Standard errors only |

### 7.4 Python Implementation (pycausalimpact)

```python
from causalimpact import CausalImpact
import pandas as pd
import numpy as np

# --- Prepare data ---
# y: response time series (the unit that received intervention)
# X: control time series (related but unaffected by intervention)
# Pre-period: data before intervention
# Post-period: data after intervention

# Example structure:
# df.index = date_range
# df['y'] = target outcome (e.g., daily PHQ-9 for one patient)
# df['control1'] = control series 1 (e.g., sleep quality)
# df['control2'] = control series 2 (e.g., activity level)
# df['control3'] = control series 3 (e.g., another patient's data)

pre_period = [0, T_intervention - 1]
post_period = [T_intervention, len(df) - 1]

# --- Run Causal Impact ---
impact = CausalImpact(
    data=df[['y', 'control1', 'control2', 'control3']],
    pre_period=pre_period,
    post_period=post_period
)

# --- Results ---
print(impact.summary())
print(impact.summary(output='report'))

# --- Key outputs ---
# Absolute effect: difference between observed and predicted
# Relative effect: percentage change
# Posterior tail-area probability (p-value)
# Posterior probability of causal effect

# --- Visualization ---
impact.plot()

# --- Access posterior samples ---
# impact.inferences contains full posterior distribution
posterior_effect = impact.inferences['point_effects_post_cumul']
ci_lower = impact.inferences['post_cumul_y_lower']
ci_upper = impact.inferences['post_cumul_y_upper']
```

### 7.5 Custom BSTS Model Specification

```python
from causalimpact import CausalImpact
import tensorflow_probability as tfp

# Custom model with specific components
custom_model = {
    'level': True,           # Local level (random walk)
    'trend': True,           # Local linear trend
    'seasonal_periods': [7, 30],  # Weekly and monthly seasonality
}

impact = CausalImpact(
    data=df,
    pre_period=pre_period,
    post_period=post_period,
    model_args=custom_model
)
```

### 7.6 Control Time Series Selection

**Best practices for selecting control series:**

1. **Correlated with outcome**: Control series should be strongly correlated with the target series in the pre-period (R^2 > 0.5 ideally)
2. **Not affected by intervention**: Controls must not themselves be affected by the intervention
3. **Multiple controls**: Include 3-10 relevant controls to improve prediction
4. **Structural similarity**: Controls from similar contexts (other patients, other clinics)
5. **Avoid overfitting**: Use spike-and-slab priors for variable selection in high-dimensional settings

**Healthcare-specific control series:**
- For individual patient: other patients with similar baseline characteristics
- For clinic: other clinics in same health system
- For drug outcome: disease prevalence in untreated population
- For mental health: economic indicators, seasonal patterns, general population trends

### 7.7 Limitations

| Limitation | Mitigation |
|------------|------------|
| Requires adequate pre-intervention data | Minimum 8-12 pre-period observations |
| Control series must be unaffected by intervention | Careful selection; document rationale |
| Assumes model structure is stable | Check model fit in pre-period; residual analysis |
| Can be sensitive to prior choices | Prior sensitivity analysis; report prior hyperparameters |
| Single treated unit | Consider hierarchical extension or synthetic control |

---

## 8. Safe Interpretation Framework

### 8.1 Language Standards

**Use appropriate causal language based on evidence strength:**

| Design Strength | Appropriate Language | Inappropriate Language |
|-----------------|---------------------|----------------------|
| RCT | "caused," "treatment effect" | -- |
| N-of-1 + multiple periods | "estimated individual effect," "strong evidence for" | "proved," "definitively caused" |
| ITS with controls | "temporal association," "estimated effect" | "causal effect" (without caveats) |
| DiD (parallel trends met) | "difference-in-differences estimate," "estimated impact" | "causal effect" (unqualified) |
| Propensity score + sensitivity | "adjusted association," "estimated effect, conditional on measured confounders" | "causal effect" |
| Simple pre-post | "observed change" | "treatment effect," "causal effect" |

### 8.2 Confounding Disclosure Checklist

Every causal inference report must include:

- [ ] **Measured confounders** listed and their adjustment method specified
- [ ] **E-value reported** for primary outcomes (VanderWeele & Ding, 2017)
- [ ] **Sensitivity analyses** conducted (unmeasured confounding, measurement error)
- [ ] **Known unmeasured confounders** discussed and their likely direction of bias stated
- [ ] **Concurrent events** during intervention period documented
- [ ] **Selection bias** assessment (who was included/excluded and why)

### 8.3 Regression to the Mean

**Regression to the mean** is the phenomenon where extreme measurements tend to be followed by less extreme measurements, purely due to statistical variation.

```python
def rtm_adjustment(observed_pre, observed_post, reliability, population_mean):
    """
    Adjust for regression to the mean.
    
    Parameters:
    - observed_pre: baseline measurement
    - observed_post: follow-up measurement
    - reliability: test-retest reliability of the measure (0-1)
    - population_mean: population mean for the measure
    
    Returns RTM-adjusted change score.
    """
    # Expected post score due to RTM alone
    expected_post_rtm = population_mean + reliability * (observed_pre - population_mean)
    
    # Raw change
    raw_change = observed_post - observed_pre
    
    # RTM component
    rtm_component = expected_post_rtm - observed_pre
    
    # Adjusted change
    adjusted_change = raw_change - rtm_component
    
    return {
        'raw_change': raw_change,
        'rtm_component': rtm_component,
        'rtm_adjusted_change': adjusted_change,
        'percent_rtm': abs(rtm_component / raw_change * 100) if raw_change != 0 else 0
    }
```

**Mitigation strategies:**
- Use multiple baseline measurements (not single extreme value)
- Include control group or control period
- Report reliability of measurement instruments
- Use long baseline periods to establish true baseline level

### 8.4 Placebo Effect Handling

| Strategy | Application |
|----------|-------------|
| Blinding | N-of-1 trials with placebo periods |
| Control group | Active or placebo comparator |
| Historical controls | Causal Impact / synthetic control |
| Placebo washout | Initial placebo run-in period |
| Sham intervention | When feasible (e.g., sham app for digital intervention) |

### 8.5 Missing Data Protocol

```
1. Report missing data pattern (MCAR, MAR, MNAR assessment)
2. Report missingness rate for each variable
3. Use multiple imputation or full Bayesian imputation
4. Sensitivity analysis: complete case analysis vs. imputed
5. Report if missingness differs by treatment group
```

### 8.6 Clinician Oversight Requirements

**All causal inference analyses of clinical data require:**

1. **Clinical expert review** of confounder set
2. **Independent validation** of outcome measurements
3. **Clinical significance assessment** alongside statistical significance
4. **Safety monitoring** for adverse outcomes
5. **Regulatory compliance** (HIPAA, 21 CFR Part 11 if applicable)
6. **Peer review** before any clinical decisions
7. **Transparent reporting** of all methods, limitations, and assumptions

### 8.7 Measurement-Based Care Integration

Measurement-Based Care (MBC) is "the systematic administration of symptom rating scales and use of the results to drive clinical decision making at the level of the individual patient" (APA, 2023).

**How MBC enables causal inference:**

| MBC Component | Causal Inference Benefit |
|---------------|-------------------------|
| Standardized repeated measures | Longitudinal data for ITS/N-of-1 |
| Regular assessment intervals | Regular time series structure |
| Symptom + side effect tracking | Multiple outcome domains |
| Treatment decision documentation | Clear intervention timing |
| Patient-reported outcomes | Patient-centered causal evidence |

The APA Position Statement (December 2023) affirms that MBC is effective in promoting evidence-based treatment of mental health conditions and should be streamlined and efficient.

**MBC causal inference workflow:**
1. Patient completes standardized measure (PHQ-9, GAD-7) at regular intervals
2. Clinician makes treatment decision based on scores
3. System records intervention timing and type
4. Outcomes continue to be measured post-intervention
5. Causal method (ITS, N-of-1, or Bayesian) estimates effect
6. Results inform next treatment decision

---

## 9. Methods to AVOID in Observational Clinical Data

### 9.1 Simple Pre-Post Without Controls

**The problem**: Without a control condition, you cannot distinguish:
- True treatment effect
- Natural disease course (many conditions improve spontaneously)
- Regression to the mean
- Seasonal effects
- Concurrent life events
- Placebo effect

**Example**: Patient scores PHQ-9 = 22 at baseline, starts medication, scores 14 at week 4. Was it the medication? Or would they have improved anyway?

**If you must use pre-post**: 
- Acknowledge as "observed change" not "treatment effect"
- Report measurement reliability
- Consider historical control rates of spontaneous remission
- Use only as exploratory/hypothesis-generating

### 9.2 Cherry-Picking Time Windows

**The problem**: Selecting time periods that show the most favorable effect introduces massive selection bias.

**Examples to avoid:**
- Choosing the "best" 2-week window post-intervention
- Excluding periods with poor adherence
- Starting analysis only after "response" begins
- Removing "outlier" periods without prespecified criteria

**Solution**: 
- Prespecify analysis window in protocol before data collection
- Use all available data
- Report sensitivity analyses across different window definitions

### 9.3 Ignoring Concurrent Medication Changes

**The problem**: Patients often change multiple medications simultaneously. Attributing effects to only one intervention ignores confounding by co-intervention.

**Examples:**
- Starting psychotherapy AND antidepressant simultaneously
- Adding sleep medication alongside primary intervention
- Dose changes in background medication at intervention start

**Solution:**
- Document ALL medication changes
- Adjust for concurrent changes in analysis
- Consider washout periods
- Use nonequivalent dependent variables

### 9.4 Ignoring Seasonal and Life Events

**Common confounders in clinical data:**

| Confounder | Direction | How to Handle |
|------------|-----------|---------------|
| Academic calendar (exams) | Worsens anxiety/depression | Include semester indicators |
| Holiday periods | Variable (improves mood for some, worsens for others) | Seasonal terms in model |
| Weather/season | Affects mood disorders | Include month/season dummies |
| Major life events | Variable | Document and include as covariates |
| Provider changes | Variable (Hawthorne effect) | Include provider fixed effects |
| Billing/policy changes | Can affect measured outcomes | Include policy change indicators |

### 9.5 Additional Pitfalls

| Pitfall | Why It's Dangerous | Better Alternative |
|---------|-------------------|-------------------|
| Post-hoc subgroup analysis | Multiple testing; false positives | Prespecify subgroups; Bonferroni correction |
| Treating correlation as causation | Fundamental error in inference | Use methods from this report |
| Ignoring clustering | Inflated Type I error | Mixed effects models; cluster-robust SEs |
| No sensitivity analysis | Unknown robustness | Always report E-values, alternative specifications |
| Overfitting | False confidence in model | Cross-validation; information criteria; Bayesian regularization |

---

## 10. Key Methodology Recommendations

### 10.1 Method Selection by Scenario

| Scenario | Recommended Method | Evidence Grade | Minimum Data |
|----------|-------------------|----------------|--------------|
| Single patient, no randomization, 20+ time points | ITS with ARIMA + seasonal adjustment | B | 10 pre, 10 post |
| Single patient, treatment periods can be randomized | N-of-1 (ABAB or more periods) | B | 4+ periods |
| Single patient, 50+ time points, control series available | Causal Impact (BSTS) | B | 20 pre, 20+ controls |
| Multiple patients, treatment vs control groups | DiD with event study + robust SEs | B | 2 groups, 8+ time points each |
| Multiple patients, many baseline covariates | Propensity score + IPW + E-value | B | 50+ per group |
| Multiple patients, time-varying treatment | Marginal Structural Model (IPW) | B | Longitudinal data with treatment changes |
| Multiple patients, repeated measures, individual effects | Bayesian hierarchical model | B | 20+ patients, 5+ time points |
| Chronic condition, personalized treatment | Aggregated N-of-1 trials | B | 5+ patients, 4+ periods each |

### 10.2 Universal Best Practices

1. **Always report E-values** or equivalent sensitivity analyses for unmeasured confounding
2. **Always include confidence/credible intervals** -- never report point estimates alone
3. **Always check model assumptions** (autocorrelation, stationarity, normality of residuals)
4. **Always consider seasonality** -- include seasonal terms unless there's strong reason not to
5. **Always document concurrent events** -- medication changes, life events, policy changes
6. **Always use appropriate language** -- "estimated effect," "temporal association" not "causal effect"
7. **Always seek clinical oversight** -- statistical analysis does not replace clinical judgment
8. **Always prespecify analyses** where possible -- prevent cherry-picking and data dredging
9. **Always assess clinical significance** -- a statistically significant 0.1 point change may be clinically meaningless
10. **Always consider Bayesian approaches** when sample sizes are small -- they provide principled regularization and uncertainty quantification

### 10.3 Implementation Priority

**Phase 1 (Immediate):**
- Segmented regression ITS for single-patient monitoring
- E-value calculation for all observational analyses
- Proper language standards for reporting

**Phase 2 (Short-term):**
- N-of-1 trial infrastructure for digital therapeutics
- Bayesian hierarchical models for multi-patient data
- Causal Impact for intervention evaluation

**Phase 3 (Advanced):**
- Staggered DiD with modern estimators for multi-site rollouts
- Marginal structural models for complex treatment regimes
- Synthetic control methods for policy evaluation

### 10.4 Quality Assurance Checklist

Before finalizing any causal inference analysis:

- [ ] Intervention timing is clearly documented
- [ ] All measured confounders are identified and adjusted for
- [ ] E-value calculated and reported for primary outcomes
- [ ] Autocorrelation assessed and addressed
- [ ] Seasonality tested and adjusted for if present
- [ ] Concurrent events documented
- [ ] Missing data pattern reported and handled appropriately
- [ ] Model assumptions verified (residual analysis, QQ plots)
- [ ] Sensitivity analyses conducted (specification, window, method)
- [ ] Clinical significance assessed alongside statistical significance
- [ ] Results reviewed by clinical expert
- [ ] Language is appropriate for evidence strength
- [ ] All code and data processing steps documented

---

## 11. References

### Core Methodology

1. Bernal JL, Cummins S, Gasparrini A. Interrupted time series regression for the evaluation of public health interventions: a tutorial. *Int J Epidemiol*. 2017;46(1):348-355. doi:10.1093/ije/dyw098

2. Wagner AK, Soumerai SB, Zhang F, Ross-Degnan D. Segmented regression analysis of interrupted time series studies in medication use research. *J Clin Pharm Ther*. 2002;27(4):299-309. doi:10.1046/j.1365-2710.2002.00430.x

3. Penfold RB, Zhang F. Use of interrupted time series analysis in evaluating health care quality improvements. *Acad Pediatr*. 2013;13(6 Suppl):S38-S44.

4. Callaway B, Sant'Anna PHC. Difference-in-differences with multiple time periods. *J Econometrics*. 2021;225(2):200-230.

5. Borusyak K, Jaravel X, Spiess J. Revisiting event study designs: Robust and efficient estimation. *Review of Economic Studies*. 2024.

6. Sun L, Abraham S. Estimating dynamic treatment effects in event studies with heterogeneous treatment effects. *J Econometrics*. 2021;225(2):175-199.

### N-of-1 Trials

7. Vohra S, Shamseer L, Sampson M, et al. CONSORT extension for reporting N-of-1 trials (CENT) 2015 Statement. *BMJ*. 2015;350:h1738. doi:10.1136/bmj.h1738

8. Shamseer L, Sampson M, Bukutu C, et al. CONSORT extension for reporting N-of-1 trials (CENT) 2015: explanation and elaboration. *J Clin Epidemiol*. 2016;76:47-56.

9. Porcino AJ, Vohra S, et al. SPENT: The SPIRIT Extension for N-of-1 Trials. *J Clin Epidemiol*. 2020;127:135-141.

10. Zucker DR, Ruthazer R, Schmid CH. Individual (N-of-1) trials can be combined to give population comparative treatment effect estimates: methodologic considerations. *J Clin Epidemiol*. 2010;63(12):1312-1323.

11. Li G, et al. N-of-1 Design and Its Applications to Personalized Treatment Studies. *JABES*. 2017;25:155-169.

### Propensity Score Methods

12. Rosenbaum PR, Rubin DB. The central role of the propensity score in observational studies for causal effects. *Biometrika*. 1983;70(1):41-55.

13. Robins JM, Hernan MA, Brumback B. Marginal structural models and causal inference in epidemiology. *Epidemiology*. 2000;11(5):550-560.

14. van der Wal WM, Geskus RB. IPW: an R package for inverse probability weighting. *J Stat Softw*. 2011;43(13):1-23.

15. Confounding adjustment methods in longitudinal observational studies: a mapping review. *PMC*. 2022. PMC8935170.

### Unmeasured Confounding

16. VanderWeele TJ, Ding P. Sensitivity analysis in observational research: introducing the E-value. *Ann Intern Med*. 2017;167(4):268-274. doi:10.7326/M16-2607

17. VanderWeele TJ. *Explanation in Causal Inference: Methods for Mediation and Interaction*. Oxford University Press; 2015.

18. Ding P, VanderWeele TJ. Sensitivity analysis without assumptions. *Epidemiology*. 2016;27(3):368-377.

### Causal Impact / BSTS

19. Brodersen KH, Gallusser F, Koehler J, Remy N, Scott SL. Inferring causal impact using Bayesian structural time-series models. *Annals of Applied Statistics*. 2015;9(1):247-274.

20. Brodersen KH, et al. CausalImpact R package documentation. Google Inc. http://google.github.io/CausalImpact/

### Causal Inference in Mental Health

21. Smith GD. Applying causal inference methods in psychiatric epidemiology. *BJPsych Advances*. 2020;26(4):214-224. PMC7286775.

22. Fortney JC, et al. Practice-based versus referral care for depression. *Arch Gen Psychiatry*. 2007;64(6):679-688.

### Measurement-Based Care

23. American Psychiatric Association. Position Statement on Utilization of Measurement Based Care. Approved December 2023.

24. Valentine T. Measurement-Based Care in Behavioral Health: Let's Keep Moving Forward. NCQA Blog. March 2025.

25. DeSimone J, et al. The Impact of Measurement-Based Care in Psychiatry: An Integrative Review. *J Am Psychiatr Nurses Assoc*. 2024;30(2):279-287.

### General Causal Inference

26. Pearl J. *Causality: Models, Reasoning, and Inference*. 2nd ed. Cambridge University Press; 2009.

27. Hernan MA, Robins JM. *Causal Inference: What If*. Chapman & Hall/CRC; 2020.

28. Imbens GW, Rubin DB. *Causal Inference for Statistics, Social, and Biomedical Sciences*. Cambridge University Press; 2015.

### CONSORT Guidelines

29. Hopewell S, et al. CONSORT 2025 Statement: Updated Guideline for Reporting Randomised Trials. *BMJ*. 2025;388:e081123.

30. Moher D, et al. CONSORT 2010 Explanation and Elaboration. *BMJ*. 2010;340:c869.

---

## Appendix A: Quick Reference Python Environment

```bash
# Required packages
pip install statsmodels scikit-learn pymc arviz causalimpact pandas numpy scipy matplotlib lifelines
```

```python
# Standard imports for causal inference analyses
import pandas as pd
import numpy as np
import pymc as pm
import arviz as az
import statsmodels.api as sm
import statsmodels.formula.api as smf
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import NearestNeighbors
from causalimpact import CausalImpact
```

## Appendix B: E-value Quick Calculator

```python
def e_value_calculator(estimate, ci_lower, ci_upper, measure_type='RR'):
    """
    Universal E-value calculator.
    
    Parameters:
    - estimate: point estimate (RR, OR, HR)
    - ci_lower: lower bound of 95% CI
    - ci_upper: upper bound of 95% CI
    - measure_type: 'RR', 'OR', 'HR'
    
    Returns E-values for point estimate and CI bound closest to null.
    """
    import numpy as np
    
    # Convert OR to RR approximation (if rare outcome)
    if measure_type == 'OR':
        estimate = np.sqrt(estimate) if estimate >= 1 else 1/np.sqrt(1/estimate)
        ci_lower = np.sqrt(ci_lower) if ci_lower >= 1 else 1/np.sqrt(1/ci_lower)
        ci_upper = np.sqrt(ci_upper) if ci_upper >= 1 else 1/np.sqrt(1/ci_upper)
    
    # Ensure RR scale (>1 for both protective and harmful)
    rr_est = estimate if estimate >= 1 else 1/estimate
    rr_lo = ci_lower if ci_lower >= 1 else 1/ci_lower
    rr_hi = ci_upper if ci_upper >= 1 else 1/ci_upper
    
    # E-value formula: RR + sqrt(RR * (RR - 1))
    e_val_est = rr_est + np.sqrt(rr_est * (rr_est - 1))
    
    # CI closest to null
    rr_ci_closest = min(rr_lo, rr_hi, key=lambda x: abs(x - 1))
    rr_ci_closest = max(rr_ci_closest, 1.0)  # boundary
    e_val_ci = rr_ci_closest + np.sqrt(rr_ci_closest * (rr_ci_closest - 1))
    
    print(f"Measure: {measure_type}")
    print(f"Estimate: {estimate:.3f} (95% CI: {ci_lower:.3f}-{ci_upper:.3f})")
    print(f"E-value (point estimate): {e_val_est:.2f}")
    print(f"E-value (CI closest to null): {e_val_ci:.2f}")
    print()
    print("Interpretation:")
    print(f"An unmeasured confounder would need RR={e_val_ci:.2f} association")
    print("with BOTH treatment AND outcome to shift the CI to include the null.")
    
    return {'e_value_point': e_val_est, 'e_value_ci': e_val_ci}
```

## Appendix C: Method Selection Flowchart (Text)

```
START: What is your data structure?
|
|-- Single patient, single time series?
|   |-- Can randomize treatment periods? --> N-of-1 Trial
|   |-- Cannot randomize?
|       |-- Have control series? --> Causal Impact (BSTS)
|       |-- No control series?
|           |-- 20+ time points? --> ITS (segmented regression)
|           |-- <20 time points? --> Descriptive only; collect more data
|
|-- Multiple patients, single time point (cross-sectional)?
|   |-- Treatment/control groups? --> Propensity Score Methods
|   |-- Natural experiment (as-if random)? --> Instrumental Variables
|
|-- Multiple patients, multiple time points?
|   |-- Treatment at specific time for all? --> DiD or ITS with controls
|   |-- Staggered treatment timing? --> Modern DiD (Callaway-Sant'Anna)
|   |-- Time-varying treatment? --> Marginal Structural Model (IPW)
|   |-- Want individual + population effects? --> Bayesian Hierarchical
|
|-- Digital therapeutic with repeated measures?
|   --> N-of-1 (if randomizable) or ITS (if not) + Bayesian Hierarchical

ALL PATHS: Report E-values, sensitivity analyses, and appropriate language.
```

---

*This report was compiled from systematic review of published methodology literature, including scoping reviews of 1,389+ ITS studies, CENT 2015 guidelines, CONSORT 2025 updates, and contemporary causal inference methodology. All methods are intended for research purposes and should not replace clinical judgment or RCT evidence when available.*

*Last updated: 2025*
