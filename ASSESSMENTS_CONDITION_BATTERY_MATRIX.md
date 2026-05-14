# Evidence-Based Assessment Battery Matrix
## DeepSynaps Protocol Studio — Comprehensive Instrument Validation Report

**Report Date:** 2025-01-24
**Version:** 1.0
**Conditions Assessed:** 53 (CON-001 through CON-053)
**Unique Instruments Evaluated:** 36

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Instrument Master Matrix](#instrument-master-matrix)
3. [Condition-Specific Battery Matrices](#condition-specific-battery-matrices)
4. [Evidence Grades Explained](#evidence-grades-explained)
5. [Licensing Summary](#licensing-summary)
6. [Recommendations](#recommendations)
7. [Gaps and Limitations](#gaps-and-limitations)
8. [Appendix: Alternative Open-Source Instruments](#appendix-alternative-open-source-instruments)

---

## Executive Summary

### Key Findings

- **36 unique instruments** are referenced across the 53 condition batteries
- **18 instruments (50%)** are public domain / free to embed
- **9 instruments (25%)** are academic-free with conditions (may require certification, permission, or non-commercial restriction)
- **7 instruments (19%)** are proprietary and cannot be embedded without licensing
- **2 instruments (6%)** have unknown licensing and lack peer-reviewed validation (TMS-SE, tDCS-CS)
- **34 instruments (94%)** have Evidence Grade A (systematic reviews/meta-analyses/RCTs)
- **2 instruments (6%)** have Evidence Grade B (observational studies)
- **0 instruments** have Evidence Grade C or D among validated tools
- **22 instruments (61%)** are suitable for self-report digital administration
- **2 critical redundancies** found: ESS/EPWORTH are the same instrument
- **11 conditions (21%)** have only PHQ-9 as their assessment battery (insufficient)

### Conditions with Weakest Evidence Coverage

| Condition | Code | Issue |
|---|---|---|
| ADHD | CON-016 | Only PHQ-9; needs ASRS-v1.1 |
| Antisocial Personality | CON-021 | Only PHQ-9; needs personality assessment |
| Dependent Personality | CON-029 | Only PHQ-9 + GAD-7; insufficient |
| Depersonalization/Derealization | CON-030 | Only PHQ-9; needs CDS |
| Excoriation Disorder | CON-032 | Only PHQ-9 + GAD-7; needs SPIS |
| Gambling Disorder | CON-033 | Only PHQ-9; needs G-SAS |
| Hoarding Disorder | CON-034 | Only PHQ-9; needs SI-R |
| Intermittent Explosive Disorder | CON-038 | Only PHQ-9; needs CAI |
| Kleptomania | CON-039 | Only PHQ-9; needs validated theft-specific scale |
| Narcissistic Personality | CON-042 | Only PHQ-9; needs PNI |
| Oppositional Defiant Disorder | CON-045 | Only PHQ-9; needs SNAP or similar |
| Neuromodulation Screening | CON-014 | TMS-SE and tDCS-CS not validated |

### Highest Priority Concerns

1. **TMS-SE and tDCS-CS** — No peer-reviewed validation exists; should not be used as clinical outcome measures
2. **ESS and EPWORTH** — Duplicate of same scale; consolidate into one entry
3. **MADRS, Y-BOCS, PANSS** — Gold-standard instruments but proprietary; open alternatives available
4. **MMSE** — Expensive per-test copyright; MoCA or SLUMS are preferred alternatives
5. **MoCA** — Free but mandatory certification ($125/2yr) prohibits electronic distribution
6. **PSQI** — Commercial licensing costs $5,000-$20,000 per study

---

## Instrument Master Matrix

| Assessment | Full Name | Domain | Items | Age Range | Evidence Grade | License | Embeddable | Copyright Holder | Validation Reference |
|---|---|---|---|---|---|---|---|---|---|
| PHQ-9 | Patient Health Questionnaire-9 | Depression severity | 9 | 13+ | A | public_domain | Yes | None (Pfizer released) | Kroenke et al., 2001 |
| GAD-7 | Generalized Anxiety Disorder-7 | Anxiety severity | 7 | 12+ | A | public_domain | Yes | None (Pfizer released) | Spitzer et al., 2006 |
| MADRS | Montgomery-Asberg Depression Rating Scale | Depression severity | 10 | 18+ | A | proprietary_restricted | No | Cambridge Univ. Press/SIGMA | Montgomery & Asberg, 1979 |
| HAM-D | Hamilton Depression Rating Scale (HDRS-17) | Depression severity | 17 | 18+ | A | public_domain | Yes | None (public domain) | Hamilton, 1960 |
| HAM-A | Hamilton Anxiety Rating Scale | Anxiety severity | 14 | 18+ | A | public_domain | Yes | None (public domain) | Hamilton, 1959 |
| QIDS-SR | Quick Inventory Depressive Symptomatology-SR | Depression severity | 16 | 18+ | A | public_domain | Yes | None (free use) | Rush et al., 2003 |
| C-SSRS | Columbia Suicide Severity Rating Scale | Suicide risk | 6 | All ages | A | public_domain | Yes | Columbia Lighthouse Project | Posner et al., 2011 |
| ISI | Insomnia Severity Index | Insomnia severity | 7 | 18+ | A | proprietary_restricted | No | Charles M. Morin, PhD | Bastien et al., 2001 |
| PSQI | Pittsburgh Sleep Quality Index | Sleep quality | 19 | 18+ | A | proprietary_restricted | No | University of Pittsburgh | Buysse et al., 1989 |
| ESS | Epworth Sleepiness Scale | Daytime sleepiness | 8 | 18+ | A | academic_free | Conditional | Murray W. Johns | Johns, 1991 |
| EPWORTH | Epworth Sleepiness Scale (same as ESS) | Daytime sleepiness | 8 | 18+ | A | academic_free | Conditional | Murray W. Johns | Johns, 1991 |
| PSS | Perceived Stress Scale-10 | Perceived stress | 10 | 12+ | A | academic_free | Conditional | Mapi Research Trust | Cohen et al., 1983 |
| WHODAS | WHO Disability Assessment Schedule 2.0 | Functional disability | 36 | 18+ | A | public_domain | Yes | WHO (repro. granted) | Ustun et al., 2010 |
| SF-36 | 36-Item Short Form Health Survey | Health-related QoL | 36 | 14+ | A | academic_free | Conditional | Optum (v2.0); RAND (v1.0) | Ware & Sherbourne, 1992 |
| TMS-SE | TMS Side Effects Scale | TMS treatment side effects | Unknown | 18+ | D | unknown | Unknown | Unknown | Not found in literature |
| tDCS-CS | tDCS Comfort Scale | tDCS tolerability | Unknown | 18+ | D | unknown | Unknown | Unknown | Not found in literature |
| MDQ | Mood Disorder Questionnaire | Bipolar disorder screening | 15 | 18+ | A | public_domain | Yes | None (public domain) | Hirschfeld et al., 2000 |
| YMRS | Young Mania Rating Scale | Mania/hypomania severity | 11 | 18+ | A | public_domain | Yes | None (public domain) | Young et al., 1978 |
| PCL-5 | PTSD Checklist for DSM-5 | PTSD symptom severity | 20 | 18+ | A | public_domain | Yes | VA National Center PTSD | Weathers et al., 2013 |
| CAPS-5 | Clinician-Administered PTSD Scale-5 | PTSD diagnosis (interview) | 30 | 18+ | A | public_domain | Yes | VA National Center PTSD | Weathers et al., 2018 |
| DERS | Difficulties in Emotion Regulation Scale | Emotion dysregulation | 36 | 18+ | A | public_domain | Yes | None (free, non-copyrighted) | Gratz & Roemer, 2004 |
| Y-BOCS | Yale-Brown Obsessive Compulsive Scale | OCD severity | 10 | 18+ | A | proprietary_restricted | No | Wayne K. Goodman/Mount Sinai | Goodman et al., 1989 |
| OCI-R | Obsessive-Compulsive Inventory-Revised | OCD symptoms screening | 18 | 18+ | A | public_domain | Yes | None (public domain) | Foa et al., 2002 |
| PANSS | Positive and Negative Syndrome Scale | Psychotic symptoms | 30 | 18+ | A | proprietary_restricted | No | Authors' estates; Mapi Trust | Kay et al., 1987 |
| BPRS | Brief Psychiatric Rating Scale | General psychiatric symptoms | 18 | 18+ | A | public_domain | Yes | None (free, non-commercial) | Overall & Gorham, 1962 |
| CGI | Clinical Global Impressions Scale | Global severity/improvement | 2 | All ages | A | public_domain | Yes | None (NIMH, public domain) | Guy, 1976 |
| MMSE | Mini-Mental State Examination | Cognitive impairment | 30 | 20+ | A | proprietary_restricted | No | MiniMental LLC / PAR | Folstein et al., 1975 |
| MoCA | Montreal Cognitive Assessment | Cognitive impairment | 30 | 18+ | A | academic_free | Conditional | Ziad Nasreddine, MD | Nasreddine et al., 2005 |
| BPI | Brief Pain Inventory-Short Form | Pain severity/interference | 9 | 18+ | A | academic_free | Conditional | Charles S. Cleeland, PhD | Cleeland & Ryan, 1994 |
| PCS | Pain Catastrophizing Scale | Pain catastrophizing | 13 | 18+ | A | proprietary_restricted | No | M.J.L. Sullivan/Mapi Trust | Sullivan et al., 1995 |
| SPIN | Social Phobia Inventory | Social anxiety severity | 17 | 18+ | A | academic_free | Conditional | Jonathan Davidson, MD | Connor et al., 2000 |
| PSWQ | Penn State Worry Questionnaire | Trait worry severity | 16 | 18+ | A | public_domain | Yes | None (public domain) | Meyer et al., 1990 |
| PDSS | Panic Disorder Severity Scale-SR | Panic disorder severity | 7 | 13+ | A | public_domain | Yes | None (free for clinical use) | Shear et al., 1997 |
| AUDIT | Alcohol Use Disorders Identification Test | Alcohol misuse screening | 10 | 18+ | A | public_domain | Yes | None (WHO instrument) | Saunders et al., 1993 |
| DAST-10 | Drug Abuse Screening Test-10 | Drug use screening | 10 | 18+ | A | academic_free | Conditional | Harvey A. Skinner, PhD | Skinner, 1982 |
| EDE-Q | Eating Disorder Examination Q'aire (v6.0) | Eating disorder psychopathology | 28 | 18+ | A | academic_free | Conditional | C.G. Fairburn/Oxford | Fairburn & Beglin, 2008 |
| BINGE | Binge Eating Scale | Binge eating severity | 16 | 18+ | B | public_domain | Yes | None (public domain) | Gormally et al., 1982 |

---

## Condition-Specific Battery Matrices

### CON-001: Major Depressive Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| MADRS | Depression severity | 10 | A | proprietary_restricted | No | Montgomery & Asberg, 1979 |
| HAM-D | Depression severity | 17 | A | public_domain | Yes | Hamilton, 1960 |
| QIDS-SR | Depression severity | 16 | A | public_domain | Yes | Rush et al., 2003 |

- **Baseline:** 4 instruments | **Weekly:** 2 instruments
- **PROPRIETARY:** MADRS cannot be embedded without license. QIDS-SR and PHQ-9 are validated, free alternatives with equivalent psychometric properties.
- **RECOMMENDATION:** Replace MADRS with QIDS-SR as the primary self-report depression measure. Retain HAM-D for clinician-rated batteries.

---

### CON-002: Generalized Anxiety Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| HAM-A | Anxiety severity | 14 | A | public_domain | Yes | Hamilton, 1959 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** PHQ-9 included for comorbid depression screening — appropriate for anxiety disorders where comorbidity is high (>50%).

---

### CON-003: Bipolar Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| MDQ | Bipolar disorder screening | 15 | A | public_domain | Yes | Hirschfeld et al., 2000 |
| YMRS | Mania/hypomania severity | 11 | A | public_domain | Yes | Young et al., 1978 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** YMRS is clinician-administered and requires training for reliable use. Self-report alternatives exist (Altman Self-Rating Mania Scale, ASRM) but are less validated.
- **NOTE:** MDQ is a screening tool, not a severity monitor. The Bipolar Depression Rating Scale (BDRS) may be a better option for tracking depressive episodes in bipolar disorder.

---

### CON-004: PTSD

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PCL-5 | PTSD symptom severity | 20 | A | public_domain | Yes | Weathers et al., 2013 |
| CAPS-5 | PTSD diagnosis (interview) | 30 | A | public_domain | Yes | Weathers et al., 2018 |
| C-SSRS | Suicide risk | 6 | A | public_domain | Yes | Posner et al., 2011 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 4 instruments | **Weekly:** 2 instruments
- **NOTE:** CAPS-5 requires clinician training (45-60 min administration). PCL-5 is the standard self-report alternative. C-SSRS is essential given elevated suicide risk in PTSD populations.

---

### CON-005: Panic Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| PDSS | Panic disorder severity | 7 | A | public_domain | Yes | Shear et al., 1997 |
| PSWQ | Trait worry severity | 16 | A | public_domain | Yes | Meyer et al., 1990 |

- **Baseline:** 3 instruments | **Weekly:** 1 instrument
- **NOTE:** PDSS is the gold standard panic-specific severity measure. PSWQ assesses trait worry, which is elevated in panic disorder. Consider adding Acute Panic Inventory (API) or Body Sensations Questionnaire (BSQ) for interoceptive assessment.

---

### CON-006: Social Anxiety Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| SPIN | Social anxiety severity | 17 | A | academic_free | Conditional | Connor et al., 2000 |
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| PSWQ | Trait worry severity | 16 | A | public_domain | Yes | Meyer et al., 1990 |

- **Baseline:** 3 instruments | **Weekly:** 1 instrument
- **NOTE:** SPIN requires permission from copyright holder (mail@cd-risc.com). Free alternatives: Social Phobia Scale (SPS) or Liebowitz Social Anxiety Scale-SR (LSAS-SR) are also well-validated.

---

### CON-007: OCD

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| Y-BOCS | OCD severity | 10 | A | proprietary_restricted | No | Goodman et al., 1989 |
| OCI-R | OCD symptoms screening | 18 | A | public_domain | Yes | Foa et al., 2002 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **PROPRIETARY:** Y-BOCS cannot be embedded without authorization. Clinician-administered only.
- **RECOMMENDATION:** Use OCI-R as the primary self-report OCD measure (free, validated, cutoff >=21). Reserve Y-BOCS for clinician-administered batteries only.

---

### CON-008: Insomnia

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| ISI | Insomnia severity | 7 | A | proprietary_restricted | No | Bastien et al., 2001 |
| PSQI | Sleep quality | 19 | A | proprietary_restricted | No | Buysse et al., 1989 |
| ESS | Daytime sleepiness | 8 | A | academic_free | Conditional | Johns, 1991 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **PROPRIETARY:** Both ISI and PSQI require licensing.
- **RECOMMENDATION:** Replace ISI with Athens Insomnia Scale (AIS-8, free) and PSQI with PROMIS Sleep Disturbance (public domain, NIH). Keep ESS for daytime sleepiness assessment.

---

### CON-009: Substance Use Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| AUDIT | Alcohol misuse screening | 10 | A | public_domain | Yes | Saunders et al., 1993 |
| DAST-10 | Drug use screening | 10 | A | academic_free | Conditional | Skinner, 1982 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** DAST-10 does NOT assess alcohol use. AUDIT does not assess illicit drug use. Consider adding the Tobacco, Alcohol, Prescription medication, and other Substance use (TAPS) tool for comprehensive screening.

---

### CON-010: Eating Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| EDE-Q | Eating disorder psychopathology | 28 | A | academic_free | Conditional | Fairburn & Beglin, 2008 |
| BINGE | Binge eating severity | 16 | B | public_domain | Yes | Gormally et al., 1982 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** EDE-Q free for non-commercial use only. Must replicate exactly without modification. BINGE (BES) has lower specificity for BED diagnosis; EDE-Q is preferred.

---

### CON-011: Neurocognitive Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| MMSE | Cognitive impairment | 30 | A | proprietary_restricted | No | Folstein et al., 1975 |
| MoCA | Cognitive impairment | 30 | A | academic_free | Conditional | Nasreddine et al., 2005 |

- **Baseline:** 2 instruments | **Weekly:** 2 instruments
- **PROPRIETARY:** MMSE is copyrighted (~$1.23/test). MoCA requires mandatory certification ($125/2yr) and prohibits electronic distribution.
- **RECOMMENDATION:** Replace MMSE with SLUMS (Saint Louis University Mental Status, free, public domain, equivalent psychometrics). Use MoCA only with certification. Consider adding WHODAS for functional assessment.

---

### CON-012: Chronic Pain

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| BPI | Pain severity/interference | 9 | A | academic_free | Conditional | Cleeland & Ryan, 1994 |
| PCS | Pain catastrophizing | 13 | A | proprietary_restricted | No | Sullivan et al., 1995 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** BPI-SF free for non-commercial use. PCS is licensed by Mapi Research Trust.
- **RECOMMENDATION:** For PCS, consider Pain Catastrophizing Scale-Child (PCS-C) for younger populations or use Pain Self-Efficacy Questionnaire (PSEQ, free) as complementary measure.

---

### CON-013: Schizophrenia Spectrum

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PANSS | Psychotic symptoms | 30 | A | proprietary_restricted | No | Kay et al., 1987 |
| BPRS | General psychiatric symptoms | 18 | A | public_domain | Yes | Overall & Gorham, 1962 |
| CGI | Global severity/improvement | 2 | A | public_domain | Yes | Guy, 1976 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **PROPRIETARY:** PANSS requires training and license via Mapi Research Trust (2025). BPRS is a free alternative but less comprehensive.
- **NOTE:** BPRS is an adequate open alternative for many clinical settings. CGI provides the global outcome measure required by most regulatory trials.

---

### CON-014: Neuromodulation Screening

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| TMS-SE | TMS treatment side effects | Unknown | D | unknown | Unknown | Unknown | Not found in literature |
| tDCS-CS | tDCS tolerability | Unknown | D | unknown | Unknown | Unknown | Not found in literature |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **CRITICAL:** TMS-SE and tDCS-CS lack peer-reviewed validation. Not recommended for clinical use.
- **RECOMMENDATION:**
  - Replace TMS-SE with Treatment Emergent Symptom Scale (TESS) or develop/adapt a validated side effects checklist. Common TMS side effects to assess: headache, scalp pain, jaw pain, dizziness, cognitive changes, seizure.
  - Replace tDCS-CS with a standard Visual Analog Scale (VAS) for comfort rating (reference Palm et al., 2014 methodology). Common tDCS side effects: scalp tingling, itching, burning, headache, skin redness.

---

### CON-015: Adjustment Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| PSS | Perceived stress | 10 | A | academic_free | Conditional | Cohen et al., 1983 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** PSS-10 is now distributed by Mapi Research Trust with potential fees for some users. PSS-4 (ultra-brief, 4 items) is in the public domain and may be sufficient for stress screening.

---

### CON-016: ADHD

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 1 instrument | **Weekly:** 1 instrument
- **GAP:** Battery only includes PHQ-9. This is grossly insufficient for ADHD assessment.
- **RECOMMENDATION:** Add ASRS-v1.1 (WHO Adult ADHD Self-Report Scale, 18 items, public domain) as the primary ADHD instrument. Add WHODAS for functional impairment assessment. Consider Vanderbilt ADHD Diagnostic Rating Scale or BAARS-IV for clinician-rated assessment.

---

### CON-017: Acute Stress Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PCL-5 | PTSD symptom severity | 20 | A | public_domain | Yes | Weathers et al., 2013 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 2 instruments | **Weekly:** 1 instrument
- **NOTE:** PCL-5 is appropriate for acute stress disorder (symptoms <1 month). Add LEC-5 (Life Events Checklist, free) for trauma history screening.

---

### CON-018: Agoraphobia

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| PDSS | Panic disorder severity | 7 | A | public_domain | Yes | Shear et al., 1997 |

- **Baseline:** 2 instruments | **Weekly:** 1 instrument
- **NOTE:** Consider adding Mobility Inventory for Agoraphobia (MIA) as an agoraphobia-specific severity measure. PDSS captures panic symptoms which commonly co-occur.

---

### CON-019: Alcohol Use Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| AUDIT | Alcohol misuse screening | 10 | A | public_domain | Yes | Saunders et al., 1993 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 2 instruments | **Weekly:** 1 instrument
- **NOTE:** AUDIT is the gold standard alcohol screening tool. Consider adding Timeline Follow-Back (TLFB) for quantifying daily drinking patterns.

---

### CON-020: Anorexia Nervosa

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| EDE-Q | Eating disorder psychopathology | 28 | A | academic_free | Conditional | Fairburn & Beglin, 2008 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 2 instruments | **Weekly:** 1 instrument
- **NOTE:** EDE-Q is the gold standard for eating disorder psychopathology. Free for non-commercial use. Must not modify items. Consider adding weight/BMI tracking.

---

### CON-021: Antisocial Personality

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 1 instrument | **Weekly:** 1 instrument
- **GAP:** Battery only includes PHQ-9. Insufficient for personality disorder assessment.
- **RECOMMENDATION:** Add PID-5 (Personality Inventory for DSM-5, 220 items, public domain) for personality trait assessment. Add DERS for emotion regulation deficits common in antisocial personality.

---

### CON-022: Avoidant Personality

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| SPIN | Social anxiety severity | 17 | A | academic_free | Conditional | Connor et al., 2000 |
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |

- **Baseline:** 2 instruments | **Weekly:** 1 instrument
- **NOTE:** SPIN captures social anxiety which is central to avoidant personality. Consider adding PID-5 Avoidance facet scales for personality-level assessment.

---

### CON-023: Binge Eating Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| BINGE | Binge eating severity | 16 | B | public_domain | Yes | Gormally et al., 1982 |
| EDE-Q | Eating disorder psychopathology | 28 | A | academic_free | Conditional | Fairburn & Beglin, 2008 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** EDE-Q captures the full range of eating psychopathology. BINGE (BES) is specific to binge eating severity but has lower diagnostic specificity. The combination is appropriate.

---

### CON-024: Borderline Personality Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| DERS | Emotion dysregulation | 36 | A | public_domain | Yes | Gratz & Roemer, 2004 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |

- **Baseline:** 3 instruments | **Weekly:** 1 instrument
- **NOTE:** DERS is free and non-copyrighted. DERS-16 (brief version) is available. Consider adding a self-harm assessment (C-SSRS or DSHI) for this high-risk population.

---

### CON-025: Brief Psychotic Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PANSS | Psychotic symptoms | 30 | A | proprietary_restricted | No | Kay et al., 1987 |
| CGI | Global severity/improvement | 2 | A | public_domain | Yes | Guy, 1976 |
| BPRS | General psychiatric symptoms | 18 | A | public_domain | Yes | Overall & Gorham, 1962 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** PANSS requires training and license. For brief psychotic disorder, BPRS + CGI may be sufficient given the short duration.

---

### CON-026: Bulimia Nervosa

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| EDE-Q | Eating disorder psychopathology | 28 | A | academic_free | Conditional | Fairburn & Beglin, 2008 |
| BINGE | Binge eating severity | 16 | B | public_domain | Yes | Gormally et al., 1982 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 1 instrument
- **NOTE:** EDE-Q is preferred over BINGE for BN as it captures compensatory behaviors (vomiting, laxatives, exercise).

---

### CON-027: Conversion Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |

- **Baseline:** 2 instruments | **Weekly:** 2 instruments
- **NOTE:** Consider adding BPI for associated pain symptoms, and WHODAS for functional impairment assessment.

---

### CON-028: Delusional Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PANSS | Psychotic symptoms | 30 | A | proprietary_restricted | No | Kay et al., 1987 |
| CGI | Global severity/improvement | 2 | A | public_domain | Yes | Guy, 1976 |

- **Baseline:** 2 instruments | **Weekly:** 1 instrument
- **NOTE:** PANSS P1 (Delusions) subscale is particularly relevant. BPRS is a free alternative for delusion severity assessment.

---

### CON-029: Dependent Personality

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |

- **Baseline:** 2 instruments | **Weekly:** 2 instruments
- **GAP:** Only PHQ-9 + GAD-7; insufficient for personality disorder assessment.
- **RECOMMENDATION:** Add PID-5 (Personality Inventory for DSM-5, public domain) for personality trait assessment.

---

### CON-030: Depersonalization/Derealization Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 1 instrument | **Weekly:** 1 instrument
- **GAP:** Battery only includes PHQ-9. Grossly insufficient.
- **RECOMMENDATION:** Add Cambridge Depersonalization Scale (CDS, 29 items, free for research) as the primary depersonalization-specific instrument. Add C-SSRS for suicide risk assessment (depersonalization is associated with suicidal ideation).

---

### CON-031: Dissociative Identity Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| DERS | Emotion dysregulation | 36 | A | public_domain | Yes | Gratz & Roemer, 2004 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 2 instruments | **Weekly:** 1 instrument
- **NOTE:** Consider adding Dissociative Experiences Scale (DES-II, free for research) for dissociative symptom assessment. DERS captures the emotion regulation deficits common in DID.

---

### CON-032: Excoriation Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |

- **Baseline:** 2 instruments | **Weekly:** 2 instruments
- **GAP:** No skin-picking specific assessment.
- **RECOMMENDATION:** Add Skin Picking Impact Scale (SPIS, 10 items, free) or Skin Picking Scale-Revised (SPS-R) as the primary excoriation-specific instrument.

---

### CON-033: Gambling Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 1 instrument | **Weekly:** 1 instrument
- **GAP:** Battery only includes PHQ-9. No gambling-specific assessment.
- **RECOMMENDATION:** Add G-SAS (Gambling Symptom Assessment Scale, free) or NODS-PERC (National Opinion Research Center DSM-IV Screen for Gambling Problems) as the primary gambling-specific instrument.

---

### CON-034: Hoarding Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 1 instrument | **Weekly:** 1 instrument
- **GAP:** Battery only includes PHQ-9. No hoarding-specific assessment.
- **RECOMMENDATION:** Add SI-R (Saving Inventory-Revised, 23 items, well-validated) or UCLA Hoarding Severity Scale (3 items, brief screening) as the primary hoarding-specific instrument.

---

### CON-035: Hypersomnolence Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| ESS | Daytime sleepiness | 8 | A | academic_free | Conditional | Johns, 1991 |
| PSQI | Sleep quality | 19 | A | proprietary_restricted | No | Buysse et al., 1989 |

- **Baseline:** 2 instruments | **Weekly:** 2 instruments
- **NOTE:** ESS is appropriate for hypersomnolence. PSQI is proprietary. Consider adding Epworth (already included as ESS) and a sleep diary.

---

### CON-036: Hypochondriasis

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 2 instruments | **Weekly:** 2 instruments
- **NOTE:** Consider adding the Short Health Anxiety Inventory (SHAI, 18 items, free) as a hypochondriasis-specific severity measure.

---

### CON-037: Illness Anxiety Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 2 instruments | **Weekly:** 2 instruments
- **NOTE:** SHAI (Short Health Anxiety Inventory) is the preferred illness anxiety-specific instrument. PHQ-15 is also useful for somatic symptom assessment.

---

### CON-038: Intermittent Explosive Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 1 instrument | **Weekly:** 1 instrument
- **GAP:** Battery only includes PHQ-9. No anger/aggression assessment.
- **RECOMMENDATION:** Add Clinical Anger Inventory (CAI) or State-Trait Anger Expression Inventory-2 (STAXI-2) for anger-specific assessment. Add DERS for emotion regulation.

---

### CON-039: Kleptomania

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 1 instrument | **Weekly:** 1 instrument
- **GAP:** Battery only includes PHQ-9. No kleptomania-specific assessment.
- **RECOMMENDATION:** Kleptomania is rare. The Kleptomania Symptom Assessment Scale (K-SAS) may be used but is not widely validated. Consider using OCI-R with focus on hoarding/impulse control items as proxy.

---

### CON-040: Major Neurocognitive Disorder (Dementia)

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| MMSE | Cognitive impairment | 30 | A | proprietary_restricted | No | Folstein et al., 1975 |
| MoCA | Cognitive impairment | 30 | A | academic_free | Conditional | Nasreddine et al., 2005 |

- **Baseline:** 2 instruments | **Weekly:** 2 instruments
- **PROPRIETARY:** MMSE is copyrighted (~$1.23/test). MoCA requires mandatory certification and prohibits electronic distribution.
- **RECOMMENDATION:** Replace MMSE with SLUMS (free, public domain). Use MoCA only with certification. Add WHODAS for functional assessment (dementia severity depends heavily on functional impairment).

---

### CON-041: Mild Neurocognitive Disorder (MCI)

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| MoCA | Cognitive impairment | 30 | A | academic_free | Conditional | Nasreddine et al., 2005 |
| MMSE | Cognitive impairment | 30 | A | proprietary_restricted | No | Folstein et al., 1975 |

- **Baseline:** 2 instruments | **Weekly:** 2 instruments
- **NOTE:** MoCA has superior sensitivity for MCI (90% vs 18% for MMSE). MoCA-B (Basic) is designed for lower-education populations.
- **RECOMMENDATION:** Replace MMSE with SLUMS (free). MoCA should be primary for MCI detection. Add cognitive functional informant scales (e.g., IQCODE) for corroboration.

---

### CON-042: Narcissistic Personality

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 1 instrument | **Weekly:** 1 instrument
- **GAP:** Battery only includes PHQ-9. No personality-specific assessment.
- **RECOMMENDATION:** Add PNI (Pathological Narcissism Inventory, 52 items, free for research) or NPI (Narcissistic Personality Inventory, 40 items, public domain). Add PID-5 for DSM-5 personality trait assessment.

---

### CON-043: Nightmare Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| ISI | Insomnia severity | 7 | A | proprietary_restricted | No | Bastien et al., 2001 |
| PSQI | Sleep quality | 19 | A | proprietary_restricted | No | Buysse et al., 1989 |
| PCL-5 | PTSD symptom severity | 20 | A | public_domain | Yes | Weathers et al., 2013 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** Nightmare disorder often co-occurs with PTSD. PCL-5 screens for comorbid trauma symptoms. Add Disturbing Dream and Nightmare Severity Index (DDNSI, free) as a nightmare-specific severity measure.

---

### CON-044: Obstructive Sleep Apnea

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| ESS | Daytime sleepiness | 8 | A | academic_free | Conditional | Johns, 1991 |
| PSQI | Sleep quality | 19 | A | proprietary_restricted | No | Buysse et al., 1989 |
| ISI | Insomnia severity | 7 | A | proprietary_restricted | No | Bastien et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** ESS is the primary screening tool for OSA-related daytime sleepiness. STOP-BANG questionnaire (8 items, free) is a validated OSA-specific screening tool that should be added. ISI and PSQI are both proprietary — consider replacing with PROMIS Sleep (free).

---

### CON-045: Oppositional Defiant Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 1 instrument | **Weekly:** 1 instrument
- **GAP:** Battery only includes PHQ-9. ODD is a childhood/adolescent condition; PHQ-9 is not validated for children under 13.
- **RECOMMENDATION:** Add SNAP-IV (Swanson, Nolan, and Pelham Rating Scale, free for research) for child behavior assessment. Add ASEBA (Achenbach System) or CBCL if budget allows. All current instruments are adult-only and inappropriate for ODD.

---

### CON-046: Other Specified Anxiety Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| PSWQ | Trait worry severity | 16 | A | public_domain | Yes | Meyer et al., 1990 |

- **Baseline:** 3 instruments | **Weekly:** 1 instrument
- **NOTE:** PSWQ is useful as it captures transdiagnostic worry that cuts across anxiety disorders. Appropriate for the "unspecified" category.

---

### CON-047: Other Specified Personality Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| DERS | Emotion dysregulation | 36 | A | public_domain | Yes | Gratz & Roemer, 2004 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 2 instruments | **Weekly:** 1 instrument
- **NOTE:** DERS captures the emotion dysregulation that is transdiagnostic across personality disorders. Add PID-5 (free) for comprehensive personality trait assessment.

---

### CON-048: Other Specified Eating Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| EDE-Q | Eating disorder psychopathology | 28 | A | academic_free | Conditional | Fairburn & Beglin, 2008 |
| BINGE | Binge eating severity | 16 | B | public_domain | Yes | Gormally et al., 1982 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** EDE-Q captures the broad spectrum of eating psychopathology, making it ideal for "other specified" presentations. BINGE (BES) provides binge-eating severity. Combination is appropriate.

---

### CON-049: Premenstrual Dysphoric Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| PSS | Perceived stress | 10 | A | academic_free | Conditional | Cohen et al., 1983 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** PSS-10 is appropriate for PMDD as stress is a known exacerbating factor. Add Daily Record of Severity of Problems (DRSP, 24 items, free) for prospective daily symptom tracking — the gold standard for PMDD diagnosis per DSM-5.

---

### CON-050: Psychotic Disorder NOS

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PANSS | Psychotic symptoms | 30 | A | proprietary_restricted | No | Kay et al., 1987 |
| BPRS | General psychiatric symptoms | 18 | A | public_domain | Yes | Overall & Gorham, 1962 |
| CGI | Global severity/improvement | 2 | A | public_domain | Yes | Guy, 1976 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** BPRS + CGI provides a sufficient free alternative for cases where PANSS licensing is unavailable.

---

### CON-051: Restless Legs Syndrome

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| ISI | Insomnia severity | 7 | A | proprietary_restricted | No | Bastien et al., 2001 |
| PSQI | Sleep quality | 19 | A | proprietary_restricted | No | Buysse et al., 1989 |
| ESS | Daytime sleepiness | 8 | A | academic_free | Conditional | Johns, 1991 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** Add IRLSSG Rating Scale (International Restless Legs Syndrome Study Group, 10 items, free) as the primary RLS-specific severity measure. Replace ISI and PSQI with PROMIS Sleep (free) where possible.

---

### CON-052: Seasonal Affective Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |
| QIDS-SR | Depression severity | 16 | A | public_domain | Yes | Rush et al., 2003 |
| HAM-D | Depression severity | 17 | A | public_domain | Yes | Hamilton, 1960 |

- **Baseline:** 3 instruments | **Weekly:** 2 instruments
- **NOTE:** Seasonal Pattern Assessment Questionnaire (SPAQ, free) can be added for seasonal pattern-specific assessment. QIDS-SR includes atypical symptom items (overeating, hypersomnia) that are relevant to SAD.

---

### CON-053: Unspecified Anxiety Disorder

| Assessment | Domain | Items | Evidence Grade | License | Embeddable | Validation Reference |
|---|---|---|---|---|---|---|
| GAD-7 | Anxiety severity | 7 | A | public_domain | Yes | Spitzer et al., 2006 |
| PHQ-9 | Depression severity | 9 | A | public_domain | Yes | Kroenke et al., 2001 |

- **Baseline:** 2 instruments | **Weekly:** 1 instrument
- **NOTE:** Appropriate transdiagnostic anxiety screeners for the "unspecified" category. Consider adding Beck Anxiety Inventory (BAI) for somatic anxiety symptoms.

---

## Evidence Grades Explained

| Grade | Definition | Methodological Standard |
|---|---|---|
| **A** | Systematic review, meta-analysis, or multiple well-designed RCTs | >500 citations; validated in multiple populations; established psychometric properties |
| **B** | Single RCT or multiple well-controlled observational studies | Moderate evidence base; validated in at least one population |
| **C** | Observational studies, cohort studies, case-control studies | Limited evidence; preliminary validation |
| **D** | Expert opinion, case reports, or no published validation | No independent validation; theoretical basis only |

---

## Licensing Summary

### Summary Statistics

| Category | Count | Percentage |
|---|---|---|
| **Public Domain** | 18 | 50% |
| **Academic Free (with conditions)** | 9 | 25% |
| **Proprietary/Restricted** | 7 | 19% |
| **Unknown** | 2 | 6% |
| **TOTAL** | **36** | **100%** |

### Public Domain Instruments (Free to Embed)

These instruments can be freely embedded in the DeepSynaps platform without licensing concerns:

1. **PHQ-9** — Depression (Kroenke et al., 2001)
2. **GAD-7** — Anxiety (Spitzer et al., 2006)
3. **HAM-D** — Depression severity (Hamilton, 1960)
4. **HAM-A** — Anxiety severity (Hamilton, 1959)
5. **QIDS-SR** — Depression severity (Rush et al., 2003)
6. **C-SSRS** — Suicide risk (Posner et al., 2011)
7. **WHODAS** — Functional disability (Ustun et al., 2010)
8. **PCL-5** — PTSD symptoms (Weathers et al., 2013)
9. **CAPS-5** — PTSD diagnosis (Weathers et al., 2018)
10. **DERS** — Emotion dysregulation (Gratz & Roemer, 2004)
11. **OCI-R** — OCD screening (Foa et al., 2002)
12. **BPRS** — Psychiatric symptoms (Overall & Gorham, 1962)
13. **CGI** — Global severity (Guy, 1976)
14. **PSWQ** — Trait worry (Meyer et al., 1990)
15. **PDSS** — Panic disorder (Shear et al., 1997)
16. **AUDIT** — Alcohol misuse (Saunders et al., 1993)
17. **BINGE** (BES) — Binge eating (Gormally et al., 1982)
18. **MDQ** — Bipolar screening (Hirschfeld et al., 2000)

### Academic Free (Conditions Apply)

These instruments are free for non-commercial use but have restrictions:

| Instrument | Condition | Restriction |
|---|---|---|
| **MoCA** | Mandatory certification | $125/person, recertify every 2 years; no electronic distribution |
| **ESS/EPWORTH** | Organizational license | Free for individual use; organizations require paid license |
| **SF-36** | Version dependent | v1.0 (RAND) free; v2.0 (Optum) requires paid license |
| **DAST-10** | Non-commercial only | Free for clinical/research/training; not for commercial use |
| **SPIN** | Permission required | Must contact copyright holder (mail@cd-risc.com) |
| **EDE-Q** | Non-commercial only | Must replicate exactly; cannot modify items |
| **BPI** | Non-commercial only | Free for research/clinical; commercial requires permission |
| **PSS-10** | Potential fees | Now exclusively distributed by Mapi Research Trust |
| **YMRS** | Training recommended | Public domain but clinician-administered; training required for reliability |

### Proprietary/Restricted (Cannot Embed Without License)

| Instrument | Copyright Holder | Estimated Cost | Open Alternative |
|---|---|---|---|
| **MADRS** | Cambridge Univ. Press / SIGMA | $500-2,000/site | QIDS-SR, PHQ-9 (both free) |
| **Y-BOCS** | Wayne K. Goodman / Mount Sinai | Contact for license | OCI-R (free, public domain) |
| **PANSS** | Authors' estates / Mapi Research Trust | $500-3,000 (est.) | BPRS (free); SANS/SAPS (free) |
| **MMSE** | MiniMental LLC / PAR | ~$1.23 per test | MoCA ($125 cert.) or SLUMS (free) |
| **PSQI** | University of Pittsburgh | $5,000-$20,000 commercial | PROMIS Sleep (free); AIS (free) |
| **ISI** | Charles M. Morin, PhD | Permission required | AIS (free); PROMIS Sleep (free) |
| **PCS** | M.J.L. Sullivan / Mapi Trust | License fee required | BPI (free for non-commercial) |

### Unknown Status (Require Investigation)

| Instrument | Issue | Recommendation |
|---|---|---|
| **TMS-SE** | No peer-reviewed validation found | Use Treatment Emergent Symptom Scale (TESS) or develop validated instrument |
| **tDCS-CS** | No peer-reviewed validation found | Use standard VAS; reference Palm et al. (2014) methodology |

---

## Recommendations

### Priority 1: Critical Actions (Immediate)

1. **Remove or replace TMS-SE and tDCS-CS**
   - Neither instrument has published validation evidence
   - TMS-SE: Use the Treatment Emergent Symptom Scale (TESS) or develop a validated side-effects checklist
   - tDCS-CS: Use a standard Visual Analog Scale (VAS) for comfort ratings; reference Palm et al. (2014) methodology

2. **Consolidate ESS and EPWORTH**
   - These are the same instrument (Epworth Sleepiness Scale)
   - Remove the duplicate entry and use only "ESS" consistently

3. **Flag all proprietary instruments in the UI**
   - Display a licensing notice when proprietary instruments are selected
   - Link to licensing authority for users to obtain permission

### Priority 2: License Optimization (Short-term)

4. **Replace MADRS with QIDS-SR in all batteries**
   - QIDS-SR has equivalent psychometric properties (r=0.86 with HAM-D)
   - QIDS-SR is public domain and self-administered
   - MADRS requires clinician administration AND licensing

5. **Replace Y-BOCS with OCI-R for self-report batteries**
   - OCI-R is validated, public domain, and self-administered
   - Y-BOCS requires clinician training and is proprietary
   - Reserve Y-BOCS for clinician-administered batteries only

6. **Replace MMSE with MoCA**
   - MoCA has superior sensitivity for MCI (90% vs 18%)
   - MoCA certification ($125) is cheaper than MMSE per-test fees
   - Consider SLUMS as a fully free alternative (public domain)

7. **Add licensing metadata to the instrument database**
   - Track license type, cost, certification requirements
   - Alert users when a selected instrument requires licensing

### Priority 3: Evidence Strengthening (Medium-term)

8. **Develop condition-specific batteries for placeholder conditions**
   - 11 conditions have only PHQ-9 as their sole instrument
   - Add validated condition-specific instruments for these:
     - **ADHD (CON-016):** ASRS-v1.1 (public domain, 18 items)
     - **Hoarding (CON-034):** SI-R (23 items) or UCLA Hoarding Scale (3 items)
     - **Gambling (CON-033):** G-SAS or NODS-PERC
     - **Skin Picking (CON-032):** SPIS (10 items)
     - **Depersonalization (CON-030):** CDS (29 items)
     - **Intermittent Explosive (CON-038):** STAXI-2 or CAI
     - **Personality disorders (CON-021, CON-029, CON-042):** PID-5 (220 items, public domain)
     - **ODD (CON-045):** SNAP-IV (free for research)

9. **Add pediatric-validated instruments**
   - All current instruments are adult-validated
   - Consider: PHQ-A (adolescent), RCADS (anxiety/depression for children), ASEBA/CBCL

10. **Include functional outcome measures across all conditions**
    - Add WHODAS or SF-36 v1.0 to all condition batteries
    - These capture functional impairment beyond symptoms

### Priority 4: Quality Assurance

11. **Implement automated licensing checks**
    - Before deploying any assessment, verify licensing status
    - Maintain a central registry of license expiration dates

12. **Provide evidence summaries to users**
    - Display psychometric properties (sensitivity, specificity, internal consistency)
    - Cite validation references within the platform

---

## Gaps and Limitations

### Instrument-Level Gaps

| Gap | Affected Conditions | Recommended Action |
|---|---|---|
| No validated pediatric instruments | CON-004, CON-005, CON-013, CON-045 | Add PHQ-A, RCADS, or condition-specific youth measures |
| No functional impairment measures | CON-016, CON-021, CON-029, CON-030, CON-032-042 | Add WHODAS-12 or Sheehan Disability Scale |
| No validated neuromodulation scales | CON-014 | Validate TMS-SE/tDCS-CS or replace with TESS/VAS |
| No quality-of-life measures | Most conditions | Add SF-36 v1.0 (RAND, free) or EQ-5D-5L |
| No trauma history screen | PTSD, Adjustment, Dissociative | Add Life Events Checklist (LEC-5, free) |
| No substance use screen | Most conditions | Add AUDIT universally for dual-diagnosis screening |

### Condition-Level Gaps

| Condition Code | Condition | Issue | Recommended Instruments |
|---|---|---|---|
| CON-016 | ADHD | Only PHQ-9 | Add ASRS-v1.1 (public domain), WHODAS |
| CON-021 | Antisocial Personality | Only PHQ-9 | Add PID-5, DERS |
| CON-029 | Dependent Personality | PHQ-9 + GAD-7 | Add PID-5 (public domain) |
| CON-030 | Depersonalization/Derealization | Only PHQ-9 | Add CDS (29 items, free), C-SSRS |
| CON-032 | Excoriation Disorder | PHQ-9 + GAD-7 | Add SPIS (10 items, free) |
| CON-033 | Gambling Disorder | Only PHQ-9 | Add G-SAS or NODS-PERC |
| CON-034 | Hoarding Disorder | Only PHQ-9 | Add SI-R (23 items) or UCLA Hoarding Scale |
| CON-038 | Intermittent Explosive Disorder | Only PHQ-9 | Add STAXI-2 or CAI, DERS |
| CON-039 | Kleptomania | Only PHQ-9 | No validated instrument widely available |
| CON-042 | Narcissistic Personality | Only PHQ-9 | Add PNI (52 items) or NPI (public domain) |
| CON-045 | Oppositional Defiant Disorder | Only PHQ-9 | Add SNAP-IV (free for research); all instruments adult-only |

---

## Appendix: Alternative Open-Source Instruments

### Recommended Open Alternatives for Proprietary Tools

| Proprietary Tool | Open Alternative | Items | Evidence | License |
|---|---|---|---|---|
| **MADRS** | QIDS-SR | 16 | A (r=0.81 with MADRS) | Public domain |
| **MADRS** | PHQ-9 | 9 | A | Public domain |
| **Y-BOCS** | OCI-R | 18 | A (cutoff >=21) | Public domain |
| **Y-BOCS** | Padua Inventory-Revised | 41 | A | Public domain |
| **PANSS** | BPRS | 18-24 | A | Public domain |
| **PANSS** | CAINS (negative symptoms) | 13 | A | Public domain |
| **PANSS** | BNSS (negative symptoms) | 13 | A | Public domain |
| **MMSE** | MoCA | 30 | A (90% MCI sensitivity) | Free ($125 cert) |
| **MMSE** | SLUMS | 11 | A (90% MCI sensitivity) | Public domain |
| **MMSE** | Mini-Cog | 3 | B | Public domain |
| **PSQI** | AIS (Athens Insomnia Scale) | 8 | A | Free (copyright but free use) |
| **PSQI** | PROMIS Sleep Disturbance | 4-27 | A | Public domain (NIH) |
| **PSQI** | ISI | 7 | A | Proprietary (permission) |
| **ISI** | AIS (Athens Insomnia Scale) | 8 | A | Free use |
| **ISI** | PROMIS Sleep | 4-8 (short) | A | Public domain |
| **PCS** | BPI-SF | 9 | A | Free (non-commercial) |
| **PSS-10** | PSS-4 | 4 | B | Public domain |
| **PSS-10** | DASS-21 Stress | 7 | A | Public domain |
| **SF-36 v2** | SF-36 v1.0 (RAND) | 36 | A | Free |
| **SF-36** | EQ-5D-5L | 5 (+ VAS) | A | Free for academic use |

### Recommended Additional Instruments for Gaps

| Condition Area | Instrument | Items | Evidence | License |
|---|---|---|---|---|
| **ADHD** | ASRS-v1.1 (WHO) | 18 | A | Public domain |
| **Anger** | STAXI-2 or DAR | 10-57 | A | Copyrighted / Free |
| **BPD** | DERS-16 (brief) | 16 | A | Public domain |
| **Cognitive (free)** | SLUMS | 11 | A | Public domain |
| **Cognitive (free)** | Mini-Cog | 3 | B | Public domain |
| **Dissociation** | CDS (Cambridge) | 29 | A | Free for research |
| **Gambling** | G-SAS or NODS-PERC | 10-12 | A | Free |
| **Hoarding** | SI-R (Saving Inventory-Revised) | 23 | A | Copyrighted |
| **Hoarding** | UCLA Hoarding Severity Scale | 3 | B | Free |
| **Skin Picking** | SPIS (Skin Picking Impact Scale) | 10 | A | Free |
| **Narcissism** | PNI (Pathological Narcissism Inventory) | 52 | A | Free |
| **Personality** | PID-5 (DSM-5) | 220 | A | Public domain |
| **Psychosis early** | PQ-B (Prodromal Questionnaire) | 21 | A | Free |
| **Sleep (free)** | PROMIS Sleep Disturbance | 8a (short) | A | Public domain (NIH) |
| **Substance use** | DAST-10 | 10 | A | Free (non-commercial) |
| **Suicide (brief)** | Ask Suicide-Screening Q's (ASQ) | 4 | A | Public domain (NIMH) |
| **Trauma history** | LEC-5 (Life Events Checklist) | 17 | A | Public domain |
| **Trauma (youth)** | CRIES-8 | 8 | A | Free |
| **RLS** | IRLSSG Rating Scale | 10 | A | Free |
| **Nightmares** | DDNSI | 7 | B | Free |

---

## References

1. Kroenke K, Spitzer RL, Williams JB. The PHQ-9: validity of a brief depression severity measure. *J Gen Intern Med.* 2001;16(9):606-613.
2. Spitzer RL, Kroenke K, Williams JB, Lowe B. A brief measure for assessing generalized anxiety disorder: the GAD-7. *Arch Intern Med.* 2006;166(10):1092-1097.
3. Montgomery SA, Asberg M. A new depression scale designed to be sensitive to change. *Br J Psychiatry.* 1979;134:382-389.
4. Hamilton M. A rating scale for depression. *J Neurol Neurosurg Psychiatry.* 1960;23:56-62.
5. Rush AJ, et al. The 16-Item Quick Inventory of Depressive Symptomatology (QIDS), clinician rating (QIDS-C), and self-report (QIDS-SR). *Biol Psychiatry.* 2003;54(5):573-583.
6. Posner K, et al. The Columbia-Suicide Severity Rating Scale: initial validity and internal consistency findings from three multisite studies with adolescents and adults. *Am J Psychiatry.* 2011;168(12):1266-1277.
7. Bastien CH, Vallieres A, Morin CM. Validation of the Insomnia Severity Index as an outcome measure for insomnia research. *Sleep Med.* 2001;2(4):297-307.
8. Buysse DJ, Reynolds CF 3rd, Monk TH, Berman SR, Kupfer DJ. The Pittsburgh Sleep Quality Index: a new instrument for psychiatric practice and research. *Psychiatry Res.* 1989;28(2):193-213.
9. Johns MW. A new method for measuring daytime sleepiness: the Epworth Sleepiness Scale. *Sleep.* 1991;14(6):540-545.
10. Cohen S, Kamarck T, Mermelstein R. A global measure of perceived stress. *J Health Soc Behav.* 1983;24(4):385-396.
11. Ustun TB, et al. Developing the World Health Organization Disability Assessment Schedule 2.0. *Bull World Health Organ.* 2010;88(11):815-823.
12. Ware JE Jr, Sherbourne CD. The MOS 36-item short-form health survey (SF-36). I. Conceptual framework and item selection. *Med Care.* 1992;30(6):473-483.
13. Hirschfeld RM, et al. Development and validation of a screening instrument for bipolar spectrum disorder: the Mood Disorder Questionnaire. *Am J Psychiatry.* 2000;157(11):1873-1875.
14. Young RC, Biggs JT, Ziegler VE, Meyer DA. A rating scale for mania: reliability, validity and sensitivity. *Br J Psychiatry.* 1978;133:429-435.
15. Weathers FW, et al. The PTSD Checklist for DSM-5 (PCL-5). 2013. National Center for PTSD.
16. Weathers FW, et al. The Clinician-Administered PTSD Scale for DSM-5 (CAPS-5): Development and initial psychometric evaluation in military veterans. *Psychol Assess.* 2018;30(3):383-395.
17. Gratz KL, Roemer L. Multidimensional assessment of emotion regulation and dysregulation: Development, factor structure, and initial validation of the Difficulties in Emotion Regulation Scale. *J Psychopathol Behav Assess.* 2004;26(1):41-54.
18. Goodman WK, et al. The Yale-Brown Obsessive Compulsive Scale. I. Development, use, and reliability. *Arch Gen Psychiatry.* 1989;46(11):1006-1011.
19. Foa EB, et al. The Obsessive-Compulsive Inventory: development and validation of a short version. *Psychol Assess.* 2002;14(4):485-496.
20. Kay SR, Fiszbein A, Opler LA. The Positive and Negative Syndrome Scale (PANSS) for schizophrenia. *Schizophr Bull.* 1987;13(2):261-276.
21. Overall JE, Gorham DR. The brief psychiatric rating scale. *Psychol Rep.* 1962;10:799-812.
22. Guy W. ECDEU Assessment Manual for Psychopharmacology. 1976. NIMH Psychopharmacology Series.
23. Folstein MF, Folstein SE, McHugh PR. "Mini-mental state". A practical method for grading the cognitive state of patients for the clinician. *J Psychiatr Res.* 1975;12(3):189-198.
24. Nasreddine ZS, et al. The Montreal Cognitive Assessment, MoCA: a brief screening tool for mild cognitive impairment. *J Am Geriatr Soc.* 2005;53(4):695-699.
25. Cleeland CS, Ryan KM. Pain assessment: global use of the Brief Pain Inventory. *Ann Acad Med Singap.* 1994;23(2):129-138.
26. Sullivan MJ, Bishop SR, Pivik J. The Pain Catastrophizing Scale: development and validation. *Psychol Assess.* 1995;7(4):524-532.
27. Connor KM, et al. Psychometric properties of the Social Phobia Inventory (SPIN). *Br J Psychiatry.* 2000;176:379-386.
28. Meyer TJ, Miller ML, Metzger RL, Borkovec TD. Development and validation of the Penn State Worry Questionnaire. *Behav Res Ther.* 1990;28(6):487-495.
29. Shear MK, et al. Multicenter collaborative Panic Disorder Severity Scale. *Am J Psychiatry.* 1997;154(11):1571-1575.
30. Saunders JB, Aasland OG, Babor TF, et al. Development of the Alcohol Use Disorders Identification Test (AUDIT). *Addiction.* 1993;88(6):791-804.
31. Skinner HA. The Drug Abuse Screening Test. *Addict Behav.* 1982;7(4):363-371.
32. Fairburn CG, Beglin SJ. Eating Disorder Examination Questionnaire (EDE-Q 6.0). In: *Cognitive Behavior Therapy and Eating Disorders.* 2008. Guilford Press.
33. Gormally J, Black S, Daston S, Rardin D. The assessment of binge eating severity among obese persons. *Addict Behav.* 1982;7(1):47-55.
34. Hamilton M. The assessment of anxiety states by rating. *Br J Med Psychol.* 1959;32:50-55.

---

*Report generated: 2025-01-24*
*This matrix is a living document and should be updated as new evidence emerges and licensing terms change.*
