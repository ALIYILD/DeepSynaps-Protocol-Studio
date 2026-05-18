# PHASE3_CONFOUND_ENGINE_DESIGN.md

## Confound Detection Engine for Multimodal Clinical Data

**Document Version:** 1.0  
**Date:** 2025-01-15  
**Status:** Draft for Implementation  
**Classification:** Internal Design Document — DeepSynaps Protocol Studio

---

## Executive Summary

Multimodal clinical research — integrating cognitive assessments, biomarker panels, actigraphy, self-report instruments, and electronic health records — faces a uniquely complex confounding landscape. The Confound Detection Engine (CDE) described in this document provides an automated, rule-based framework for identifying, flagging, and quantifying confounding threats across six critical domains: medication exposures, sleep/circadian factors, biomarker/laboratory values, measurement quality, participant adherence, and structural study biases. By operationalizing directed acyclic graphs (DAGs), sensitivity analysis protocols, E-value computation, and negative control testing, the engine enables real-time quality assurance during data collection and supports rigorous causal inference during analysis. The system is designed for implementation in Python with modular, extensible architecture, targeting both observational studies and randomized controlled trials where automated confound screening can reduce analyst burden and improve reproducibility.

---

## Confound Detection Context

Confounding arises when an extraneous variable is associated with both the exposure and outcome of interest, distorting the estimated causal effect. In multimodal clinical studies, the risk is amplified because (1) data streams are temporally misaligned, (2) measurement modalities differ in reliability, (3) participant behaviors such as medication adherence create self-selection patterns, and (4) physiological systems — sleep, inflammation, endocrine function — simultaneously influence multiple endpoints. The CDE treats confound detection not as a single pre-analysis check but as a continuous process: automated rules screen incoming data, flagging violations that exceed domain-specific thresholds and generating DAG-based adjustment recommendations for the statistical analysis pipeline.

The engine operates under three foundational principles:

1. **Automated screening with human oversight** — Rules execute without manual intervention, but flagged cases require analyst review.
2. **Domain-specific thresholding** — A biomarker anomaly that confounds cognition may be benign for another endpoint; thresholds are context-dependent.
3. **Quantification of residual uncertainty** — Every analysis reports E-values so that the robustness of findings to unmeasured confounding is transparently communicated.

---

## Medication Confounds

### Drug-Drug Interactions

Drug-drug interactions (DDIs) can amplify or attenuate treatment effects, creating spurious associations between an intervention and outcome. The CDE maintains a structured interaction database (derived from DrugBank, ONC-High, and literature-curated sources) and cross-references participant medication lists at each assessment. For multimodal studies, DDIs are particularly problematic when a metabolic interaction alters the bioavailability of a study drug or when combined anticholinergic properties produce cognitive effects that masquerade as disease progression.

**Automated Rule (MED-001):**
```
IF participant_active_medications >= 2
AND DDI_severity in {major, contraindicated}
AND interaction_mechanism in {pharmacodynamic, pharmacokinetic_enzyme}
THEN flag_confound(severity="HIGH", category="drug_interaction",
     description="Major DDI detected; may affect exposure or outcome measurement",
     requires_analyst_review=TRUE)
```

Cross-references: Boustani et al. (2008) demonstrated that anticholinergic drug scales vary in concordance (κ = 0.26–0.63), necessitating multi-scale screening rather than reliance on a single instrument.

### Timing of Medication Changes vs. Outcomes

A medication change occurring within the analytical window can be mistaken for a treatment effect. The engine enforces temporal ordering checks: any prescription change, dosage adjustment, or discontinuation within 30 days of an outcome assessment triggers a proximity flag.

**Automated Rule (MED-002):**
```
IF medication_change_date within 30 days of outcome_assessment_date
AND medication_class in {cns_active, cardiovascular, psychotropic}
THEN flag_confound(severity="MEDIUM", category="temporal_proximity",
     description="Medication change within washout-incompatible window",
     days_overlap=datediff(medication_change_date, outcome_assessment_date))
```

### Anticholinergic Burden

The anticholinergic cognitive burden (ACB) scale scores medications by their propensity to cause cognitive impairment. The CDE computes both maximal score and summed score using the Durán list, ACB, ARS, and ADS scales. A participant with ACB >= 3 receives a high-priority flag for cognitive outcomes.

**Automated Rule (MED-003):**
```
FOR each scale IN {duran, acb, ars, ads}:
    anticholinergic_score = compute_acb_scale(participant_meds, scale)
    IF anticholinergic_score >= 3:
        flag_confound(severity="HIGH", category="anticholinergic_burden",
             scale=scale, score=anticholinergic_score)
```

Research from the MAPT study (n=1,396) found that 7.4–23.5% of older adults were exposed to anticholinergic agents depending on scale, with moderate concordance between instruments. The CDE's multi-scale approach mitigates scale-dependent misclassification.

### Polypharmacy Effects

Polypharmacy (>=5 concurrent medications) introduces nonlinear interaction risks and is associated with differential healthcare-seeking behavior. However, as recent longitudinal cohort studies show, polypharmacy in MCI populations can be associated with *lower* dementia progression risk (HR=0.49), likely because medication appropriateness matters more than count. The CDE flags polypharmacy but contextualizes it by medication class — cardioprotective medications may be protective confounders rather than risk factors.

**Automated Rule (MED-004):**
```
IF concurrent_prescription_count >= 5:
    protective_classes = count_cardioprotective_meds(participant_meds)
    total_classes = count_distinct_atc_classes(participant_meds)
    flag_confound(severity="MEDIUM", category="polypharmacy",
         medication_count=concurrent_prescription_count,
         protective_ratio=protective_classes/total_classes,
         interpretation="Contextualize by medication appropriateness, not count alone")
```

### Washout Periods

Time-based washout periods should be replaced with clinically relevant laboratory or functional parameters where possible. The CDE implements both approaches: a configurable washout duration (default 5 half-lives for small molecules, 30 days for biologics) and a "recovery-based" mode where eligibility requires normalization of safety labs or resolution of adverse events.

**Automated Rule (MED-005):**
```
IF washout_type == "time_based":
    required_washout = compute_washout_duration(last_medication_dose, half_life)
    IF days_since_last_dose < required_washout:
        flag_confound(severity="HIGH", category="insufficient_washout",
             required=required_washout, actual=days_since_last_dose)
ELIF washout_type == "recovery_based":
    IF NOT safety_parameters_normalized(latest_labs):
        flag_confound(severity="HIGH", category="recovery_not_achieved",
             abnormal_parameters=get_abnormal_parameters(latest_labs))
```

---

## Sleep/Circadian Confounds

### Sleep Quality Impact on Cognition

Poor sleep quality, measured by PSQI >5 or actigraphic sleep efficiency <85%, is associated with measurable cognitive decrements. A study of students across Tokyo and London found that PSQI scores predicted cognitive performance even after adjusting for demographic and lifestyle confounders, with structural equation modeling confirming both direct and indirect (via academic stress) pathways. The CDE flags any cognitive assessment where the participant reported poor sleep in the preceding 7 days.

**Automated Rule (SLE-001):**
```
IF psqi_global_score > 5 OR actigraphic_sleep_efficiency < 0.85
AND cognitive_assessment_scheduled_within_7_days:
    flag_confound(severity="MEDIUM", category="poor_sleep_quality",
         psqi=psqi_global_score,
         recommendation="Consider rescheduling cognitive assessment;
                        if not possible, include sleep_quality as covariate")
```

### Circadian Rhythm Effects on Biomarkers

Melatonin and cortisol exhibit opposing circadian rhythms critical for interpreting biomarker panels. Cortisol peaks 20–30 minutes after awakening (CAR), while melatonin onset marks the biological night. Critical confounders include: ambient light exposure during sampling, body posture, NSAID use (suppresses melatonin), and antidepressant use (elevates melatonin). Studies confirm that melatonin-based circadian phase determination has superior precision (SD 14–21 min) compared to cortisol (SD ~40 min), but both require standardized protocols.

**Automated Rule (SLE-002):**
```
IF biomarker_sample_time not in expected_circadian_window:
    flag_confound(severity="HIGH", category="circadian_timing_violation",
         analyte={cortisol, melatonin, crp},
         expected_window=get_circadian_window(analyte),
         actual_sample_time=biomarker_sample_time,
         recommendation="Use time-adjusted z-scores or exclude from circadian analyses")
```

### Sleep Medication Effects

Hypnotics and sedating antidepressants directly affect both sleep architecture (the outcome of interest) and next-day cognitive performance. The CDE maintains a sleep-medication index and flags assessments within the expected pharmacodynamic duration of each agent.

**Automated Rule (SLE-003):**
```
IF sleep_medication_active:
    impairment_window = get_cognitive_impairment_window(medication)
    IF assessment_date within impairment_window:
        flag_confound(severity="HIGH", category="sleep_medication_carryover",
             medication=sleep_medication_name,
             hours_since_last_dose=hours_elapsed)
```

### Actigraphy vs. Self-Report Discrepancies

Research in childhood cancer survivors demonstrated only slight-to-fair agreement between self-reported and actigraphic sleep (κw = 0.20 for duration, κw = 0.00 for sleep efficiency). Critically, memory impairment increased discrepancy by 44 minutes for sleep duration, and depression increased sleep-onset-latency discrepancy by 24.5 minutes. The CDE computes discrepancy metrics and flags cases where modalities disagree beyond population-derived thresholds.

**Automated Rule (SLE-004):**
```
self_report_duration = get_psqi_sleep_duration_minutes()
actigraphy_duration = get_actigraphy_tst_minutes()
discrepancy = abs(self_report_duration - actigraphy_duration)

IF discrepancy > 60_minutes:
    flag_confound(severity="MEDIUM", category="sleep_measurement_discrepancy",
         discrepancy_minutes=discrepancy,
         factors_to_check=["depression_status", "memory_impairment", "fatigue"],
         recommendation="Prioritize actigraphy for objective sleep;
                        investigate participant-specific reporting bias")
```

---

## Biomarker/Lab Confounds

### Inflammation Markers Affecting Cognition

Elevated IL-6 predicts accelerated cognitive decline. In the Whitehall II study (n=5,217), high IL-6 was associated with 1.81 times greater odds of MMSE decline ≥3 points over 10 years. A 2023 meta-analysis confirmed that high peripheral inflammation increased cognitive decline risk by 14% (OR=1.14, 95% CI 1.03–1.27), with IL-6 showing the strongest association. The CDE flags inflammation-confounded cognitive assessments and recommends IL-6 adjustment or stratification.

**Automated Rule (BIO-001):**
```
IF il6_level > upper_tertile_population_reference:
    flag_confound(severity="MEDIUM", category="elevated_inflammation",
         marker="IL-6", value=il6_level, reference_tertile="upper",
         recommendation="Include IL-6 as covariate in cognitive models;
                        consider exclusion if acute infection suspected")
```

### Thyroid Dysfunction Mimicking Depression

Both hypothyroidism and hyperthyroidism produce neuropsychiatric symptoms that overlap with depression and cognitive impairment. Hypothyroidism manifests as psychomotor slowing, impaired concentration, and depressed mood; hyperthyroidism presents as anxiety, irritability, and insomnia. Subclinical hypothyroidism (elevated TSH, normal free T4/T3) is particularly confounding because standard labs appear "normal." The concept of "brain hypothyroidism" — where local cerebral thyroid activity is reduced despite normal peripheral levels — further complicates detection.

**Automated Rule (BIO-002):**
```
IF tsh > 4.5_mIU_L OR tsh < 0.4_mIU_L
OR free_t4 outside_reference_range
OR thyroid_peroxidase_antibodies_positive:
    flag_confound(severity="HIGH", category="thyroid_dysfunction",
         tsh=tsh_value, free_t4=free_t4_value,
         antibodies=top_status,
         mimics=["depression", "anxiety", "cognitive_slowdown"],
         recommendation="Exclude or stratify by thyroid status;
                        consider subclinical threshold screening")
```

### B12/Folate Deficiency Effects

Vitamin B12 deficiency produces cognitive symptoms — confusion, memory loss, poor concentration, depression — that closely mimic dementia. Research shows that serum B12 <203 pg/mL is associated with significant cognitive dysfunction, and neurologic manifestations may appear at levels up to 350 pg/mL. Functional markers (methylmalonic acid, homocysteine) are more sensitive than direct B12 measurement. Notably, only early-stage B12-related cognitive impairment is reversible with supplementation.

**Automated Rule (BIO-003):**
```
IF b12 < 350_pg_mL OR methylmalonic_acid > 0.4_umol_L OR homocysteine > 15_umol_L:
    flag_confound(severity="HIGH", category="b12_folate_deficiency",
         b12=b12_value, mma=mma_value, homocysteine=hcy_value,
         reversibility_note="Early-stage impairment may be reversible;
                            chronic deficiency may cause permanent damage",
         recommendation="Require B12 supplementation and recheck before enrollment;
                        exclude if deficiency-induced impairment suspected")
```

### Acute Infection Effects on Assessments

Acute infection elevates inflammatory markers, disrupts sleep, and impairs cognition. The CDE flags assessments where CRP >10 mg/L or where participant-reported infection occurred within 14 days, as these may represent transient confounding rather than stable trait measures.

**Automated Rule (BIO-004):**
```
IF crp > 10_mg_L OR self_reported_infection_within_14_days
OR body_temperature > 37.8_C:
    flag_confound(severity="MEDIUM", category="acute_infection",
         marker_value=crp, fever=body_temperature,
         recommendation="Reschedule assessment >14 days post-recovery;
                        if unavoidable, flag for sensitivity analysis")
```

---

## Measurement Quality Confounds

### Test-Retest Reliability

Cognitive assessments exhibit substantial practice effects — mean retest effects of 0.60 standard deviations have been documented for general cognitive performance, with similar magnitudes for memory, executive function, and language. These effects are greatest for participants in the lowest quartile of baseline performance (regression to the mean), and they persist across multiple administrations with diminishing returns.

**Automated Rule (MEQ-001):**
```
IF assessment_number > 1:
    expected_practice_boost = 0.60 * (1/sqrt(assessment_number))
    IF observed_change < expected_practice_boost - 0.3_SD:
        flag_confound(severity="LOW", category="below_expected_practice_effect",
             note="Genuine decline may be masked by practice effect baseline;
                   use alternative test form if available")
    IF assessment_number > 3:
        flag_confound(severity="LOW", category="repeated_exposure",
             recommendation="Rotate test forms to minimize practice effects")
```

### Practice Effects on Cognitive Tests

Practice effects are not equivalent across treatment arms if the active intervention affects the cognitive processes underlying test-taking itself (e.g., improved attention increasing test engagement). Goldberg et al. argue that the assumption of equivalent practice effects in RCTs may not be justified, potentially biasing treatment effect estimates.

**Automated Rule (MEQ-002):**
```
IF study_design == "RCT" AND practice_effect_detected():
    compute_practice_effect_by_arm()
    IF practice_effect_differs_significantly_between_arms():
        flag_confound(severity="HIGH", category="differential_practice_effect",
             recommendation="Use latent growth models with practice effect parameters;
                              consider co-primary analysis with novel test forms")
```

### Rater Bias

Rater bias arises when assessors are unblinded to treatment assignment or participant characteristics. The CDE tracks rater-participant pairing, flags unblinding events, and monitors score distributions by rater for drift.

**Automated Rule (MEQ-003):**
```
IF blinding_status == "compromised" OR rater_kappa_vs_gold_standard < 0.6:
    flag_confound(severity="HIGH", category="rater_bias_risk",
         rater_id=assessor_id, kappa=rater_kappa,
         recommendation="Re-train rater or replace;
                        use video-recorded centralized rating if possible")
```

### Equipment Calibration Issues

Sensor drift in actigraphy devices, assay lot variation in biomarker platforms, and environmental conditions during cognitive testing (noise, temperature) can introduce systematic measurement error.

**Automated Rule (MEQ-004):**
```
IF device_calibration_date > 90_days_ago
OR assay_cv > 15_percent
OR environmental_noise_level > 50_dB:
    flag_confound(severity="MEDIUM", category="measurement_environment",
         parameter={calibration_overdue, high_cv, excessive_noise},
         recommendation="Recalibrate device, re-run QC, or relocate testing")
```

### Environmental Factors During Testing

Time of day, room temperature, and noise level affect cognitive performance. The CDE logs environmental parameters and flags out-of-range conditions.

**Automated Rule (MEQ-005):**
```
IF cognitive_assessment_time outside 09:00-16:00
OR room_temperature outside 20-24_C
OR noise_level > 45_dB:
    flag_confound(severity="LOW", category="suboptimal_testing_environment",
         parameter_values={time, temperature, noise},
         recommendation="Standardize testing conditions; include environmental covariates")
```

---

## Adherence Confounds

### Medication Adherence Measurement

Medication Event Monitoring System (MEMS) data are considered the adherence gold standard, but 81% of comparisons with self-report show significant disagreement. Self-report and pill count consistently overestimate adherence. The CDE implements a multi-method adherence index: MEMS (primary), pharmacy refill records (secondary), and self-report (tertiary), flagging discrepancies where sensitivity of alternative methods is <65% and specificity <55% relative to MEMS.

**Automated Rule (ADH-001):**
```
mems_adherence = compute_mems_adherence(pill_bottle_data)
self_report_adherence = get_morisky_score()
refill_adherence = compute_mpr(pharmacy_data)

IF abs(mems_adherence - self_report_adherence) > 20_percentage_points:
    flag_confound(severity="MEDIUM", category="adherence_measurement_discrepancy",
         mems=mems_adherence, self_report=self_report_adherence,
         mpr=refill_adherence,
         recommendation="Use MEMS as primary; model adherence as time-varying covariate")
```

### Session Attendance Patterns

Non-random missingness in longitudinal studies is a form of confounding by indication. Participants who miss sessions may be sicker, less adherent, or experiencing side effects. The CDE monitors attendance patterns and flags informative missingness.

**Automated Rule (ADH-002):**
```
attendance_pattern = classify_pattern(missed_sessions)
IF attendance_pattern in {"deteriorating", "intermittent_with_health_events"}:
    flag_confound(severity="HIGH", category="informative_missingness",
         pattern=attendance_pattern,
         recommendation="Use inverse probability weighting or multiple imputation;
                        do not assume missing at random")
```

### Digital Engagement as Proxy for Adherence

In digital health studies, app engagement (logins, module completion) correlates with but does not equal treatment adherence. The CDE validates digital engagement against objective adherence measures before using engagement as a proxy.

**Automated Rule (ADH-003):**
```
IF digital_engagement_proxy_used AND NOT validated_against_objective_measure:
    flag_confound(severity="MEDIUM", category="unvalidated_proxy",
         recommendation="Validate engagement-adherence correlation >0.5 before use;
                        otherwise, treat as distinct construct")
```

### Selection Bias in Adherent Populations

The "healthy adherer effect" describes that patients who adhere to preventive therapy also engage in other healthy behaviors. Studies show that statin adherents are more likely to receive cancer screening (HR 1.22–1.57) and vaccinations, and even placebo-adherent participants in RCTs have lower mortality. This creates a form of confounding where adherence itself is a marker of unmeasured health consciousness.

**Automated Rule (ADH-004):**
```
IF adherence_stratification_planned:
    flag_confound(severity="MEDIUM", category="healthy_adherer_effect",
         description="Adherent participants likely differ on unmeasured health behaviors",
         recommendation="Use new-user designs with active comparators;
                        conduct IV analysis with distance-to-site as instrument;
                        report E-value for unmeasured healthy-behavior confounding")
```

---

## Detection Methods

### DAGs

Directed acyclic graphs provide a formal framework for identifying confounders, colliders, and mediators. The CDE uses DAGs to determine minimal sufficient adjustment sets, preventing both under-adjustment (residual confounding) and over-adjustment (M-bias, collider stratification).

**Six-Step DAG Protocol (adapted from Fleischer & Diehr, 2008):**

1. Draw all variables suspected to affect the exposure-outcome relationship.
2. Replace bidirectional arrows with unidirectional arrows (acknowledging temporal ordering).
3. Identify all paths between exposure and outcome (causal and non-causal).
4. Classify each path as open or blocked given the conditioning set.
5. Determine the minimal sufficient adjustment set using the back-door criterion.
6. Validate that no colliders are conditioned upon unless necessary for valid inference.

**Example DAG: Cognitive Decline Study**

```
Age ────> Cognitive Decline <──── Anticholinergic Burden
 │                   ^                  │
 │                   │                  │
 └──> Sleep Quality ─┘                  v
      (mediator)                  Polypharmacy
                                       ^
                                       │
Depression ────────────────────────────┘
      │
      └──> Inflammation (IL-6) ────────┘
```

In this DAG:
- **Confounders requiring adjustment:** Age, Depression (back-door paths)
- **Mediator (do NOT adjust):** Sleep Quality (adjusting blocks indirect effect)
- **Collider (do NOT adjust):** Polypharmacy (conditioning opens M-bias path)

### Sensitivity Analysis

The CDE implements automated sensitivity analysis for each primary endpoint. When a confound is flagged, the system runs the primary model under three scenarios: (1) excluding flagged participants, (2) including the confound as a covariate, and (3) using inverse probability weighting for the confound. Divergence across scenarios indicates sensitivity to the confound.

### E-values

The E-value, introduced by VanderWeele & Ding (2017), quantifies the minimum strength of association (on the risk ratio scale) that an unmeasured confounder would need with both exposure and outcome to fully explain away the observed association.

**Formula:**
For observed risk ratio RR_obs:
```
E-value = RR_obs + sqrt(RR_obs * (RR_obs - 1))
```

**Example Calculation:**
If the observed hazard ratio for cognitive decline with IL-6 elevation is 1.81:
```
E-value = 1.81 + sqrt(1.81 * 0.81) = 1.81 + 1.21 = 3.02
```
An unmeasured confounder would need to be associated with both elevated IL-6 and cognitive decline by a risk ratio of 3.02-fold each, above and beyond measured covariates, to explain away the association.

**Automated Rule (EVL-001):**
```
FOR each_primary_endpoint:
    e_value = compute_evalue(point_estimate, ci_lower)
    IF e_value < 2.0:
        flag_confound(severity="HIGH", category="low_e_value",
             e_value=e_value,
             interpretation="Weak unmeasured confounding could explain association;
                            findings are fragile",
             recommendation="Strengthen measurement of suspected confounders;
                            collect negative control variables")
    ELIF e_value >= 2.0 AND e_value < 3.0:
        flag_confound(severity="MEDIUM", category="moderate_e_value",
             interpretation="Moderate confounding resistance; interpret with caution")
    ELSE:
        flag_confound(severity="LOW", category="robust_e_value",
             interpretation="Substantial unmeasured confounding would be needed to explain away")
```

### Negative Control Outcomes

A negative control outcome (NCO) is an outcome that is not causally affected by the exposure but shares the same confounding structure. If the exposure-NCO association is null, confounding is adequately controlled; if significant, residual confounding is present.

**Example Implementation:**
When studying an intervention's effect on episodic memory, use visual acuity as an NCO — visual acuity should not be causally affected by a cognitive intervention but is subject to the same healthcare-seeking and socioeconomic confounding.

**Automated Rule (NCO-001):**
```
FOR each_primary_endpoint:
    nco_list = get_negative_control_outcomes(endpoint)
    FOR nco IN nco_list:
        nco_association = test_exposure_outcome_association(exposure, nco)
        IF nco_association.p_value < 0.05:
            flag_confound(severity="HIGH", category="negative_control_violation",
                 nco=nco_name, association=nco_association,
                 interpretation="Residual confounding detected; primary results may be biased",
                 recommendation="Re-assess adjustment set using DAG; collect additional confounders")
```

### Falsification Tests

Falsification tests predict null associations where none should exist. The CDE implements automated falsification by testing the exposure against multiple NCOs and checking that >95% produce null results. Systematic rejection suggests model misspecification or uncontrolled confounding.

---

## Automated Detection Rules Summary

| Rule ID | Domain | Trigger | Severity | Action |
|---------|--------|---------|----------|--------|
| MED-001 | Medication | Major DDI detected | HIGH | Analyst review required |
| MED-002 | Medication | Med change within 30 days | MEDIUM | Flag for covariate adjustment |
| MED-003 | Medication | ACB score >= 3 | HIGH | Exclude or stratify |
| MED-004 | Medication | >=5 concurrent meds | MEDIUM | Contextualize by class |
| MED-005 | Medication | Insufficient washout | HIGH | Exclude from analysis |
| SLE-001 | Sleep | PSQI > 5 or SE < 85% | MEDIUM | Reschedule or covariate-adjust |
| SLE-002 | Sleep | Off-time biomarker sample | HIGH | Time-adjust or exclude |
| SLE-003 | Sleep | Sleep med carryover | HIGH | Delay assessment |
| SLE-004 | Sleep | >60min actigraphy discrepancy | MEDIUM | Prioritize objective measure |
| BIO-001 | Biomarker | IL-6 in upper tertile | MEDIUM | Covariate adjustment |
| BIO-002 | Biomarker | Thyroid dysfunction | HIGH | Exclude or stratify |
| BIO-003 | Biomarker | B12 < 350 or MMA elevated | HIGH | Treat and recheck |
| BIO-004 | Biomarker | Acute infection (CRP >10) | MEDIUM | Reschedule |
| MEQ-001 | Measurement | Repeated cognitive testing | LOW | Rotate forms |
| MEQ-002 | Measurement | Differential practice effects | HIGH | Latent growth model |
| MEQ-003 | Measurement | Rater kappa < 0.6 | HIGH | Re-train or replace |
| MEQ-004 | Measurement | Calibration >90 days | MEDIUM | Recalibrate |
| ADH-001 | Adherence | MEMS-self-report discrepancy | MEDIUM | Use MEMS primary |
| ADH-002 | Adherence | Informative missingness | HIGH | IPW or MI required |
| ADH-004 | Adherence | Adherence stratification | MEDIUM | Report healthy-adherer E-value |
| EVL-001 | Sensitivity | E-value < 2.0 | HIGH | Collect more confounders |
| NCO-001 | Validation | NCO association significant | HIGH | Re-assess DAG |

---

## Safety & Limitations

1. **Unknown confounders remain a threat** — The CDE can only flag confounders anticipated by domain experts. Novel drug interactions, unmeasured genetic variants, or emerging environmental exposures may evade detection.
2. **Rule thresholds require population calibration** — Default thresholds are derived from general populations and may require study-specific adjustment.
3. **Automation does not replace clinical judgment** — Flagged cases require analyst review; the engine is a decision-support tool, not an autonomous filter.
4. **E-values quantify but do not eliminate unmeasured confounding** — A high E-value provides reassurance but does not prove causality.
5. **Multi-scale approaches increase sensitivity at the cost of specificity** — Using multiple anticholinergic scales or adherence methods increases detection but also false-positive flags.

---

## Recommended Implementation

### Architecture

The CDE is implemented as a modular Python package with the following structure:

```
confound_detection_engine/
├── __init__.py
├── dag_manager.py          # DAG construction and adjustment set identification
├── rules_engine.py         # Rule evaluation and flag generation
├── evalue_calculator.py    # E-value and sensitivity analysis computation
├── nco_validator.py        # Negative control outcome testing
├── medication_scorer.py    # ACB, DDI, polypharmacy calculations
├── sleep_analyzer.py       # Sleep quality and circadian validation
├── biomarker_screener.py   # Lab value threshold checking
├── measurement_qc.py       # Test-retest and rater quality checks
├── adherence_monitor.py    # Multi-method adherence discrepancy detection
└── report_generator.py     # HTML/Markdown report output
```

### Dependencies

- `networkx` — DAG construction and path analysis
- `pandas`, `numpy` — Data manipulation
- `statsmodels` — Statistical modeling and E-value computation
- `dagitty` — R integration for DAG validation (optional)
- `sqlalchemy` — Database connectivity for EHR integration

### Integration Workflow

1. **Ingest** — Data from EHR, actigraphy, cognitive testing platforms, and self-report APIs are loaded.
2. **Screen** — All 22 detection rules execute in parallel; flags are stored with severity and action recommendations.
3. **Review** — Analysts review HIGH-severity flags via a dashboard; MEDIUM and LOW flags are logged for automated covariate inclusion.
4. **Adjust** — The DAG manager outputs the minimal sufficient adjustment set based on study-specific confound structures.
5. **Validate** — Negative control outcomes are tested; E-values are computed for all primary endpoints.
6. **Report** — A comprehensive confound profile is appended to all statistical outputs.

### Configuration

Study-specific parameters are defined in `cde_config.yaml`:

```yaml
study:
  name: "COGNITION-2025"
  design: "RCT"  # or "cohort", "case_control"
  primary_endpoints: ["mmse_change", " episodic_memory_z"]

thresholds:
  anticholinergic_score_high: 3
  polypharmacy_min_meds: 5
  psqi_poor_sleep: 5
  sleep_efficiency_low: 0.85
  b12_confound_threshold: 350
  il6_upper_tertile: 2.5  # pg/mL, study-specific
  crp_acute_infection: 10
  washout_half_life_multiplier: 5
  rater_kappa_minimum: 0.6
  adherence_discrepancy_max: 20

dag:
  include_unobserved_nodes: true
  max_nodes: 28
  backdoor_criterion: true
  frontdoor_criterion: false

evalue:
  compute_for_all_endpoints: true
  report_ci_lower: true
  fragility_threshold: 2.0

negative_controls:
  enabled: true
  required_falsification_rate: 0.95
  nco_list:
    mmse_change: ["visual_acuity", "grip_strength"]
    episodic_memory_z: ["color_naming_speed", "simple_reaction_time"]
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| False-positive flags overwhelming analysts | High | Medium | Tiered severity system; auto-clear LOW flags after 48h |
| Unknown confounder evades all rules | Medium | High | Mandatory E-value reporting; collect broad NCO battery |
| Study-specific thresholds miscalibrated | Medium | High | Bootstrap calibration from pilot data; expert review |
| Over-adjustment (M-bias) from DAG errors | Low | High | DAG review by second epidemiologist; sensitivity analyses |
| Integration latency with EHR systems | Medium | Low | Batch processing with overnight updates; API caching |

---

## References

1. Boustani M, Campbell N, Munger S, et al. Impact of anticholinergics on the aging brain: a review and practical application. *Aging Health*. 2008;4(3):311-320.

2. de Souto Barreto P, et al. Anticholinergic exposure and cognitive decline in older adults: Three-year results of the MAPT trial. *J Am Geriatr Soc*. 2019;67(suppl):S1-S10.

3. Durán CE, Azermai M, Vander Stichele RH. Systematic review of anticholinergic risk scales in older adults. *Eur J Clin Pharmacol*. 2013;69:1485-1496.

4. Chang CH, et al. Polypharmacy and risk of dementia progression in older adults with mild cognitive impairment: A longitudinal cohort study. *J Am Geriatr Soc*. 2025;73(6):e1-e12.

5. Modernizing Clinical Trial Eligibility Criteria: Recommendations from the American Society of Clinical Oncology–Friends of Cancer Research Eligibility Criteria Working Groups. *J Clin Oncol*. 2021;39:2530-2539.

6. National Academies of Sciences, Engineering, and Medicine. *Modernizing the Federal Clinical Trials Enterprise*. Washington, DC: National Academies Press; 2022.

7. Chellappa SL, et al. Circadian Biomarkers in Humans: Methodological Insights into the Detection of Melatonin and Cortisol. *J Clin Med*. 2023;12(11):3704.

8. Bracken CL, et al. Concordance between self-reported sleep and actigraphy-assessed sleep in adult survivors of childhood cancer. *Support Care Cancer*. 2022;30:1159-1168.

9. Gündoğan MC, et al. Investigating the impact of sleep quality on cognitive functions among students in Tokyo, Japan, and London, UK. *BMC Psychol*. 2024;12:456.

10. Singh-Manoux A, et al. Interleukin-6 and C-reactive protein as predictors of cognitive decline in late midlife. *Neurology*. 2014;83(6):486-493.

11. Zhang Y, et al. Predictors of cognitive decline in older individuals without dementia: An updated meta-analysis. *Alzheimers Dement*. 2023;19(5):2165-2178.

12. Tangney CC, et al. Biochemical indicators of vitamin B12 and folate insufficiency and cognitive decline. *Neurology*. 2009;72(4):361-367.

13. Jatoi S, et al. Low Vitamin B12 Levels: An Underestimated Cause of Minimal Cognitive Impairment and Dementia. *Cureus*. 2020;12(2):e6976.

14. Vogiatzoglou A, et al. Vitamin B12 status and rate of brain volume loss in community-dwelling elderly. *Neurology*. 2008;71(11):826-832.

15. Jefferson AL, et al. Lower cardiac index levels relate to lower cerebral blood flow in older adults. *Neurology*. 2017;89(23):2327-2334.

16. Atti AR, et al. Low Vitamin B12 and folate levels in cognitively healthy older adults: longitudinal changes and associations with cognitive and MRI outcomes. *Am J Clin Nutr*. 2020;112(5):1278-1289.

17. Grodstein F, et al. Predictors of retest effects in a longitudinal study of cognitive aging in a diverse community-based sample. *J Int Neuropsychol Soc*. 2015;21(7):506-518.

18. Goldberg TE, et al. Practice and retest effects in longitudinal studies of cognitive functioning — implications for preclinical Alzheimer's trials. *Alzheimers Dement*. 2015;11(9):1032-1039.

19. Salthouse TA. When does age-related cognitive decline begin? *Neurobiol Aging*. 2009;30(4):507-514.

20. El Alili M, et al. A scoping review of studies comparing the medication event monitoring system (MEMS) with alternative methods for measuring medication adherence. *Br J Clin Pharmacol*. 2016;81(1):77-88.

21. Shoblock JR, et al. Statistical methods for assessing drug interactions using observational data. *Pharmacoepidemiol Drug Saf*. 2019;28(3):289-299.

22. Fleischer NL, Diehr P. Reducing bias through directed acyclic graphs. *BMC Med Res Methodol*. 2008;8:70.

23. Tennant PWG, et al. Use of directed acyclic graphs (DAGs) to identify confounders in applied health research: review and recommendations. *Int J Epidemiol*. 2021;50(2):620-632.

24. VanderWeele TJ, Ding P. Sensitivity Analysis in Observational Research: Introducing the E-Value. *Ann Intern Med*. 2017;167(4):268-274.

25. Linden A. Conducting sensitivity analysis for unmeasured confounding using the E-value. *Stata J*. 2023;23(1):e1-e15.

26. Shi X, et al. A Selective Review of Negative Control Methods in Epidemiology. *Curr Epidemiol Rep*. 2021;8(4):286-294.

27. Lipsitch M, Tchetgen Tchetgen E, Cohen T. Negative controls: a tool for detecting confounding and bias in observational studies. *Epidemiology*. 2010;21(3):383-388.

28. Frisell T, et al. Multiple negative control analyses of antidepressants and hip fractures: a replication study with extensions. *Eur J Epidemiol*. 2023;38(3):291-303.

29. Brookhart MA, et al. Healthy User and Related Biases in Observational Studies of Preventive Interventions: A Primer for Physicians. *Clin Epidemiol*. 2010;2:177-188.

30. Simpson SH, et al. A meta-analysis of the association between adherence to drug therapy and mortality. *BMJ*. 2006;333(7557):15.

---

*Document generated by DeepSynaps Protocol Studio — Confound Detection Engine Design Phase*
