# MEDICATION-BIOMARKER CONFOUNDER MATRIX FOR NEUROMODULATION RESEARCH

## Evidence-Based Guide to Psychiatric Medication Effects on Clinical Assessment Biomarkers

**Version**: 1.0  
**Date**: 2025  
**Purpose**: Document medication effects on biomarkers used in neuromodulation clinical assessment to prevent misinterpretation of neuromodulation outcomes  
**Evidence Grading**: A (meta-analysis/systematic review), B (controlled trial), C (cohort/case-control), D (expert opinion/preclinical)

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Medication Classes Covered](#medication-classes-covered)
3. [qEEG Biomarkers](#qeeg-biomarkers)
4. [MRI/fMRI Biomarkers](#mrifmri-biomarkers)
5. [Blood Biomarkers](#blood-biomarkers)
6. [Physiological Biomarkers](#physiological-biomarkers)
7. [High-Priority Confounders](#high-priority-confounders)
8. [Clinical Recommendations](#clinical-recommendations)
9. [References](#references)

---

## EXECUTIVE SUMMARY

Psychiatric medications significantly alter biomarkers commonly used in neuromodulation clinical assessments. These medication effects represent **major confounders** that can be mistaken for neuromodulation treatment effects if not properly controlled. This matrix synthesizes evidence from meta-analyses, controlled trials, and systematic reviews across four biomarker domains to guide:

- **Study design** (medication washout protocols)
- **Data interpretation** (distinguishing medication vs. neuromodulation effects)
- **Patient selection** (inclusion/exclusion criteria)
- **Covariate control** (statistical adjustment strategies)

### Most Critical Confounders (Top 10)

| Rank | Medication-Biomarker Pair | Impact | Evidence |
|------|--------------------------|--------|----------|
| 1 | Antipsychotics → qEEG theta/delta power | Large increase | A |
| 2 | TCAs/SNRIs → Heart rate variability | Large decrease | A |
| 3 | Lithium → Hippocampal volume / BDNF | Increase | A |
| 4 | SSRIs → BDNF levels | Moderate increase | A |
| 5 | SSRIs → DMN functional connectivity | Decrease (stabilize) | B |
| 6 | SSRIs → Inflammatory markers (IL-6, TNF-α) | Decrease | A |
| 7 | Benzodiazepines → qEEG beta power | Large increase | A |
| 8 | Antipsychotics → Prolactin | Large increase | A |
| 9 | Stimulants → qEEG beta / theta-beta ratio | Large shift | B |
| 10 | Lithium → Thyroid function (TSH) | Increase (hypothyroid) | A |

---

## MEDICATION CLASSES COVERED

| Code | Class | Examples |
|------|-------|----------|
| SSRI | Selective serotonin reuptake inhibitors | Fluoxetine, sertraline, escitalopram, paroxetine, citalopram, fluvoxamine |
| SNRI | Serotonin-norepinephrine reuptake inhibitors | Venlafaxine, duloxetine, desvenlafaxine, milnacipran |
| TCA | Tricyclic antidepressants | Amitriptyline, imipramine, clomipramine, nortriptyline |
| AP-SGA | Second-generation antipsychotics | Clozapine, olanzapine, risperidone, aripiprazole, quetiapine |
| AP-FGA | First-generation antipsychotics | Haloperidol, chlorpromazine, fluphenazine |
| Li | Mood stabilizers | Lithium carbonate |
| STIM | Psychostimulants | Methylphenidate, amphetamine, lisdexamfetamine |
| BZD | Benzodiazepines | Diazepam, lorazepam, alprazolam, clonazepam |
| BZRA | Non-benzodiazepine hypnotics | Zolpidem, eszopiclone, zaleplon |
| NDRI | Norepinephrine-dopamine reuptake inhibitors | Bupropion |
| NaSSA | Noradrenergic-specific serotonergic antidepressants | Mirtazapine |
| MAOI | Monoamine oxidase inhibitors | Phenelzine, tranylcypromine |

---

## qEEG BIOMARKERS

### 1. Alpha Power (8-12 Hz)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | Increase (responders) / Decrease (non-responders) | Moderate | Subchronic | Partial | B | Knott et al.; Deldin & Chiu; fluoxetine responders show greater occipital alpha |
| **Antipsychotics** | Increase | Moderate | Subchronic | Yes | B | Risassan et al. 2020; risperidone increases alpha at C3/C4 |
| **Benzodiazepines** | Decrease | Moderate | Acute | Yes | A | Diazepam suppresses alpha; frontocentral effects most pronounced |
| **Methylphenidate** | Increase (during tasks) | Moderate | Acute | Yes | B | Choi et al. 2011; increased frontal and occipital alpha during CPT |
| **Clozapine** | Mixed (increase in fast alpha) | Moderate | Subchronic | Yes | C | Faster alpha may predict therapeutic response |
| **Mirtazapine** | No significant change | Small | Chronic | Yes | C | Limited data |

**Confounder Risk**: HIGH. SSRI effects on alpha are paradoxically greater in responders, suggesting a stable trait rather than state effect. Alpha power differences between medicated and unmedicated depressed patients can be mistaken for neuromodulation effects.

**Recommendations**:
- Document SSRI response status as covariate
- Minimum washout: 5 half-lives (fluoxetine: 4-6 weeks; others: 1-2 weeks)
- Baseline qEEG should be compared to medication-free normative databases with caution

---

### 2. Theta Power (4-8 Hz)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | Decrease (some studies) / No change (others) | Small-Moderate | Subchronic | Yes | B | Mixed findings; Knott et al. reported frontal theta increase in responders to imipramine |
| **Antipsychotics** | Increase (dose-dependent) | Large | Subchronic | Yes | B | Chlorpromazine equivalent dose positively correlated with theta power; clozapine/olanzapine most pronounced |
| **Benzodiazepines** | Decrease | Moderate | Acute | Yes | A | Triazolam, zolpidem decrease theta; L-838,417 (α1-sparing) also decreases theta |
| **Methylphenidate** | Decrease (occipital, right temporo-parietal) | Moderate | Acute | Yes | B | Task-dependent; greatest during CPT state |
| **Lithium** | No direct data | Unknown | Unknown | Unknown | D | Preclinical evidence only |

**Confounder Risk**: VERY HIGH. Antipsychotics produce dose-dependent increases in theta power that can be mistaken for neuromodulation-induced slowing or cognitive impairment. The theta increase is most pronounced with clozapine and olanzapine.

**Recommendations**:
- Antipsychotic washout critical: minimum 2-4 weeks
- Document chlorpromazine equivalent dose as covariate
- Theta elevation >30% above expected warrants medication review

---

### 3. Beta Power (13-30 Hz)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | No significant change / Mixed | Small | Subchronic | Yes | C | Less studied; some evidence of total power decrease |
| **Antipsychotics** | Increase (risperidone) / Decrease (clozapine) | Moderate | Subchronic | Yes | B | Drug-specific: risperidone increases beta at C3/C4, P3/P4; clozapine may decrease |
| **Benzodiazepines** | Increase | Large | Acute | Yes | A | Universal signature of GABA-A modulation; selective beta increase with α1-sparing compounds |
| **Methylphenidate** | Increase (almost all regions) | Large | Acute | Yes | B | Most consistent qEEG finding with stimulants |
| **Bupropion** | No direct data | Unknown | Unknown | Unknown | D | Theoretically may increase via dopamine/norepinephrine |

**Confounder Risk**: VERY HIGH. Benzodiazepines produce the largest, most consistent increases in beta power of any medication class. This "anxiolytic signature" can completely mask or mimic neuromodulation effects targeting beta bands.

**Recommendations**:
- Benzodiazepine washout minimum 2 weeks (longer for long-acting like diazepam)
- Beta elevation with normal cognition suggests medication effect
- Document BZD use explicitly in all qEEG studies

---

### 4. Delta Power (0.5-4 Hz)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | No significant change | Small | Chronic | Yes | C | Minimal evidence of direct effects |
| **Antipsychotics** | Increase (clozapine, olanzapine) | Large | Subchronic | Yes | B | Most pronounced with multi-receptor antipsychotics; fronto-temporal regions |
| **Benzodiazepines** | Increase (sedating doses) / Decrease (low doses) | Moderate | Acute | Yes | A | Dose-dependent; increases during active phase, decreases during inactive phase |
| **Methylphenidate** | Mild decrease (occipito-parietal) | Small | Acute | Yes | B | Task-dependent |

**Confounder Risk**: HIGH. Clozapine and olanzapine produce marked delta increases that can be mistaken for encephalopathy, organic pathology, or neuromodulation side effects.

---

### 5. Theta/Beta Ratio (TBR)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Stimulants** | Decrease (global) / Increase (localized) | Moderate | Acute | Yes | B | Complex topographic pattern; global TBR decreases but localized increases in right frontal during tasks |
| **SSRIs** | No significant change | Small | Chronic | Yes | C | Limited evidence |
| **Antipsychotics** | Increase (clozapine, olanzapine) | Moderate | Subchronic | Yes | B | Driven by theta elevation |
| **Benzodiazepines** | Decrease | Small-Moderate | Acute | Yes | B | Beta increase dominates |

**Confounder Risk**: HIGH. TBR is a primary neuromodulation outcome metric (especially in ADHD). Stimulant medication dramatically alters TBR in task-dependent ways. Antipsychotics also significantly elevate TBR.

**Recommendations**:
- TBR-based neuromodulation protocols require stimulant washout
- Document medication timing relative to assessment
- Consider task-state vs. resting-state differentially affected

---

### 6. Frontal Alpha Asymmetry (FAA)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | No change after 12 weeks (trait marker) | Small | Chronic | No | B | Bruder et al.; fluoxetine responders show R>L asymmetry that persists |
| **Antipsychotics** | No direct data | Unknown | Unknown | Unknown | D | - |
| **Benzodiazepines** | No direct data | Unknown | Unknown | Unknown | D | May alter through generalized alpha suppression |

**Confounder Risk**: MODERATE. Alpha asymmetry appears to be a stable trait marker rather than state-dependent. SSRI treatment does not normalize baseline asymmetry differences between responders and non-responders.

**Recommendations**:
- FAA can be assessed regardless of medication status (trait)
- Interpret FAA as vulnerability marker, not treatment response marker

---

### 7. P300 Amplitude/Latency

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Antipsychotics** | Amplitude increase / Latency no change | Moderate | Subchronic | Yes | B | Both clozapine and olanzapine improve P300 amplitude in schizophrenia |
| **SSRIs** | No direct data | Unknown | Unknown | Unknown | D | - |
| **Stimulants** | Amplitude increase / Latency decrease | Moderate | Acute | Yes | B | Improved attentional resource allocation |

**Confounder Risk**: MODERATE. Antipsychotic-induced P300 improvement reflects cognitive enhancement, which may confound neuromodulation cognitive outcome measures.

---

### 8. EEG Coherence

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Benzodiazepines** | Decrease (interhemispheric) | Moderate | Acute | Yes | B | Reduced temporal and parietal interhemispheric coherence |
| **Antipsychotics** | No direct data | Unknown | Unknown | Unknown | D | - |
| **SSRIs** | No direct data | Unknown | Unknown | Unknown | D | - |

**Confounder Risk**: LOW-MODERATE. Limited data but benzodiazepine effects on coherence are significant enough to confound connectivity-based neuromodulation outcomes.

---

## MRI/fMRI BIOMARKERS

### 1. Default Mode Network (DMN) Connectivity

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | Decrease connectivity (stabilize) | Moderate | Subchronic | Yes | B | Acute citalopram increases static MPFC-PCC connectivity; chronic SSRI reduces DMN connectivity toward normalization |
| **Methylphenidate** | Decrease DMN efficiency (acute) / Increase (chronic) | Moderate | Acute→Chronic | Yes | B | Acute: decreases DMN efficiency; 4-month treatment: increases DMN-whole-brain connectivity in adults |
| **Antipsychotics** | Normalize toward controls | Moderate | Subchronic | Partial | C | Mood stabilizers normalize PFC activation during emotional tasks |
| **Lithium** | Normalize activation patterns | Moderate | Chronic | Partial | B | Normalizes neural responses to emotional stimuli in globus pallidus/thalamus and dorsal PFC |

**Confounder Risk**: HIGH. SSRIs have well-documented effects on DMN connectivity that mirror neuromodulation targets. Acute citalopram increases MPFC-DLPFC and MPFC-PCC static connectivity while reducing connectivity variability.

**Recommendations**:
- SSRI washout minimum 2 weeks (4-6 for fluoxetine) before rs-fMRI
- Document medication status as primary covariate in all DMN studies
- Longitudinal designs should account for medication changes

---

### 2. Hippocampal Volume

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Lithium** | Increase | Moderate | Chronic | Partial | A | Meta-analysis: increases hippocampal volume in BD patients; 25% increase in DG neuron number in mice |
| **Antipsychotics** | Mixed / Protective | Small | Chronic | Partial | B | Right pallidum GMV increase with minimal effective dose; illness-related volume loss may be prevented |
| **SSRIs** | Increase (neurogenesis) | Small | Chronic | Partial | C | Animal evidence; human data less consistent |
| **Cortisol-elevating meds** | Decrease | Small | Chronic | Partial | C | Secondary effect via HPA axis |

**Confounder Risk**: HIGH. Lithium is the strongest medication confounder for hippocampal volume, with well-documented volume increases that can be mistaken for neuromodulation-induced neuroplasticity.

**Recommendations**:
- Lithium washout minimum 2 weeks (longer for volume studies)
- Document duration of lithium use as covariate
- Baseline MRI should capture medication history

---

### 3. Prefrontal Cortex Thickness / Volume

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Lithium** | Increase in gray matter density | Moderate | 4 weeks | Partial | A | Increases subgenual PFC, ACC volume; GMV correlates with treatment response |
| **Antipsychotics** | No significant change (total GMV) | Small | Chronic | Partial | B | First-episode psychosis: no significant GMV change at 3 months; pallidal GMV changes drug-specific |
| **SSRIs** | No direct data | Small | Chronic | Unknown | C | Limited structural MRI data |

**Confounder Risk**: MODERATE-HIGH. Lithium's effects on PFC are robust and well-replicated. This is the most replicated structural brain change associated with psychiatric medication.

---

### 4. Functional Connectivity (General)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Methylphenidate** | Increase whole-brain efficiency | Moderate | Chronic | Partial | B | 4-month MPH increases whole-brain efficiency and DMN connectivity strength in adults |
| **SSRIs** | Reduce subcortical-cortical connectivity | Moderate | Chronic | Yes | B | Reduce DMN-subcortical (hippocampus, amygdala) connectivity in healthy volunteers |
| **Antipsychotics** | Normalize prefrontal activation | Moderate | Chronic | Partial | B | Normalize PFC activation during emotional and cognitive tasks |

---

### 5. Perfusion Changes

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **All psychotropics** | Variable | Unknown | Acute-Subchronic | Yes | D | Limited direct ASL/MRI perfusion data; most evidence from PET/SPECT studies |

**Confounder Risk**: UNKNOWN. Insufficient data to grade. Perfusion-based neuromodulation assessment should document medication status.

---

## BLOOD BIOMARKERS

### 1. BDNF (Brain-Derived Neurotrophic Factor)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | Increase (serum) | Moderate (SMD 0.5-1.0) | Chronic (4-8 weeks) | Yes | A | Meta-analyses confirm increase; dose and duration dependent |
| **Lithium** | Increase (intracellular, neuronal) | Large (3.39x in vitro) | Chronic (7+ days) | Partial | B | Cell-type specific; increases neuronal BDNF, astrocyte GDNF |
| **Antipsychotics** | Mixed | Small-Moderate | Chronic | Partial | B | Quetiapine: increases BDNF in depression; variable by drug and diagnosis |
| **Antidepressants (other)** | Increase | Moderate | Chronic | Yes | A | Effect consistent across classes; BDNF may predict treatment response |
| **ECT** | Large increase | Large | Acute-Subchronic | Partial | A | Strongest BDNF elevation of any psychiatric treatment |

**Confounder Risk**: HIGH. BDNF is one of the most widely cited neuromodulation biomarkers. Antidepressant-induced BDNF increases can be mistaken for neuromodulation-induced neuroplasticity.

**Recommendations**:
- Minimum washout: 4 weeks for BDNF studies
- Baseline BDNF should be measured with medication history
- BDNF increases of 20-50% likely medication-related

---

### 2. CRP / hs-CRP

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | No significant change | None | Chronic | N/A | A | Multiple meta-analyses: no significant effect on CRP (SMD 0.40, p=0.23) |
| **Antidepressants (mixed)** | Decrease (some studies) | Small | Chronic | Yes | B | Some individual studies show CRP reduction; others no effect |
| **Lithium** | No direct data | Unknown | Unknown | Unknown | D | - |

**Confounder Risk**: LOW. SSRIs do not significantly affect CRP levels despite well-documented anti-inflammatory effects on cytokines.

---

### 3. IL-6 and TNF-α

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | Decrease | Large (IL-6: SMD 1.32; TNF-α: SMD 1.29) | Chronic (3-10 weeks) | Yes | A | Highly significant reduction; may mediate antidepressant response |
| **SNRIs** | Decrease | Moderate | Chronic | Yes | A | Venlafaxine, duloxetine show similar effects |
| **Antipsychotics** | Variable | Small | Chronic | Partial | C | Some evidence of anti-inflammatory effects |
| **Lithium** | Variable | Small | Chronic | Partial | C | Complex immunomodulatory effects |

**Confounder Risk**: HIGH. SSRIs produce large reductions in pro-inflammatory cytokines that can confound neuromodulation studies targeting neuroinflammation. The effect is larger for IL-6 and TNF-α than for CRP.

**Recommendations**:
- Document SSRI use as primary covariate in inflammatory neuromodulation studies
- Washout minimum 2-4 weeks for inflammatory markers
- IL-6 decreases >50% likely medication-related

---

### 4. Cortisol / Cortisol Awakening Response (CAR)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs (escitalopram)** | Steeper diurnal slope; higher waking cortisol | Moderate | Acute (6 days) | Yes | B | Women: significantly steeper cortisol slopes; driven by increased waking cortisol |
| **Antidepressants (mixed)** | Normalize HPA axis | Moderate | Chronic | Yes | A | Reduce elevated cortisol in depression toward normal |
| **Benzodiazepines** | Decrease cortisol | Small | Acute | Yes | B | Acute anxiolytic effects reduce cortisol |

**Confounder Risk**: HIGH. The cortisol awakening response is frequently used as a neuromodulation outcome. Escitalopram alters CAR within 6 days, primarily by increasing waking cortisol in women.

**Recommendations**:
- SSRI washout minimum 1-2 weeks for CAR assessment
- Escitalopram effects on cortisol appear gender-specific
- Measure diurnal slope, not just single timepoint

---

### 5. Prolactin

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Risperidone** | Large increase | Large | Subchronic (days) | Yes | A | D2 blockade in tuberoinfundibular pathway; 55.9% develop hyperprolactinemia |
| **Amisulpride** | Large increase | Large | Subchronic | Yes | A | High risk of hyperprolactinemia |
| **Paliperidone** | Large increase | Large | Subchronic | Yes | A | Active metabolite of risperidone |
| **Clozapine** | Minimal change | Small | Chronic | N/A | A | Low D2 affinity; minimal prolactin elevation |
| **Olanzapine** | Minimal-moderate increase | Small-Moderate | Chronic | Yes | A | Less than risperidone |
| **Aripiprazole** | No increase / May decrease | Small | Chronic | Yes | A | D2 partial agonist; prolactin-sparing |
| **Quetiapine** | Minimal increase | Small | Chronic | Yes | A | Low risk of hyperprolactinemia |

**Confounder Risk**: MODERATE-HIGH. Prolactin is increasingly studied as a stress/neuroendocrine biomarker. Antipsychotic-induced hyperprolactinemia can confound HPA axis assessments and is associated with sexual dysfunction and metabolic effects.

**Recommendations**:
- Measure prolactin in all antipsychotic-treated patients
- Aripiprazole or clozapine if prolactin-sensitive outcomes measured
- Prolactin levels >2x upper limit of normal indicate medication effect

---

### 6. TSH, T3, T4

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Lithium** | TSH increase (subclinical hypothyroidism) | Moderate | Chronic (weeks-months) | Often requires treatment | A | 10-47% develop clinical hypothyroidism; subclinical more common; female predominance |
| **Antipsychotics** | TSH increase (subclinical) | Small | Chronic | Partial | B | Associated with sexual dysfunction; more common in women |
| **SSRIs** | Minimal change | Small | Chronic | N/A | B | Generally minimal thyroid effects |
| **Clozapine** | No significant change | Small | Chronic | N/A | C | Minimal thyroid effects |

**Confounder Risk**: MODERATE. Lithium is the primary thyroid confounder. Subclinical hypothyroidism affects cognition and may confound neuromodulation cognitive outcomes.

**Recommendations**:
- Baseline TSH required for all lithium-treated patients
- TSH monitoring every 6-12 months on lithium
- TSH >4.0 mIU/L should prompt treatment consideration
- Subclinical hypothyroidism may affect cognitive outcomes

---

### 7. Vitamin D, B12, Folate

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Antipsychotics (general)** | Vitamin D decrease (lifestyle) | Moderate | Chronic | Yes | C | Lifestyle factors; metabolic effects; 31.4% B12 deficiency in OCD patients on medications |
| **Metformin (adjunct)** | Vitamin B12 decrease | Moderate | Chronic | Yes | A | Well-documented B12 malabsorption |
| **Anticonvulsants** | Vitamin D decrease | Moderate | Chronic | Yes | B | Accelerated vitamin D metabolism |
| **Psychiatric illness (baseline)** | Lower than controls | Moderate | Chronic | Partial | A | Depression, schizophrenia consistently show lower levels |

**Confounder Risk**: MODERATE. Lower vitamin levels are common in psychiatric populations. These may represent confounders rather than medication effects per se, but medication can exacerbate deficiencies.

**Recommendations**:
- Baseline vitamin assessment recommended
- Screen for B12 deficiency in patients on metformin or anticonvulsants
- Vitamin D levels affect mood and cognition

---

### 8. Homocysteine

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Psychiatric illness (untreated)** | Increase | Moderate | Chronic | Partial | B | Elevated in depression, OCD, schizophrenia |
| **Medications (indirect)** | Increase via B12/folate depletion | Small-Moderate | Chronic | Yes | C | Metformin, anticonvulsants may elevate homocysteine |
| **L-methylfolate adjunct** | Decrease | Moderate | Chronic | Yes | B | Direct effect on homocysteine metabolism |

**Confounder Risk**: LOW-MODERATE. Homocysteine elevations more likely represent illness state than medication effect, but medication-induced B12/folate depletion can contribute.

---

### 9. Omega-3 Index

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **Psychiatric medications (general)** | No direct pharmacological effect | None | N/A | N/A | D | No evidence that psychiatric medications alter omega-3 metabolism |
| **Omega-3 supplementation** | Increase | Large | Chronic | Yes | A | EPA/DHA supplementation increases omega-3 index |

**Confounder Risk**: LOW. Omega-3 index is primarily influenced by dietary intake and supplementation, not psychiatric medications. However, many patients may be taking omega-3 supplements adjunctively.

---

## PHYSIOLOGICAL BIOMARKERS

### 1. Heart Rate Variability (HRV)

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **TCAs** | Large decrease in all HRV measures | Large | Chronic | Yes | A | Greatest HRV reduction of any antidepressant; anticholinergic effects |
| **SNRIs (venlafaxine)** | Large decrease in HRV | Large | Chronic | Yes | A | Venlafaxine: lowest HRV measures among antidepressants |
| **SSRIs** | Moderate decrease in HRV | Moderate | Chronic | Yes | A | SDNN, LF, HF all decreased vs. controls; less impact than TCAs/SNRIs |
| **Methylphenidate** | Decrease in HF, RMSSD (parasympathetic) | Moderate | Acute→Chronic | Yes | B | Decreases HF and RMSSD after 12 weeks; shifts autonomic balance |
| **Benzodiazepines** | Minimal effect on resting HRV | Small | Acute | Yes | C | No significant HRV changes in TILDA study |
| **Antipsychotics** | Mixed / Clozapine may decrease | Moderate | Chronic | Partial | B | Some evidence of autonomic normalization |
| **Mirtazapine** | Minimal effect | Small | Chronic | Yes | C | Generally HRV-neutral |

**Confounder Risk**: VERY HIGH. HRV is one of the most commonly used physiological biomarkers in neuromodulation research. Antidepressants dramatically reduce HRV, and this effect is often mistaken for depression-related autonomic dysfunction.

**Critical Finding**: The NESDA study (Licht et al., 2008; n=2373) found that most HRV differences between depressed patients and controls were explained by antidepressant medication use. Depressed participants NOT taking antidepressants did not differ from controls on HRV measures.

**Recommendations**:
- TCA washout: minimum 2 weeks (nortriptyline: up to 4 weeks)
- SNRI washout: minimum 1 week (venlafaxine: 2-3 days; duloxetine: ~5 days)
- SSRI washout: 1-2 weeks (fluoxetine: 4-6 weeks)
- HRV should be measured medication-free for valid baseline
- If medication cannot be discontinued, document as primary covariate

---

### 2. Blood Pressure

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SNRIs (venlafaxine)** | Increase (dose-dependent) | Large | Chronic | Yes | A | Diastolic BP increase up to 15 mmHg; hypertensive crisis risk at high doses |
| **SNRIs (duloxetine)** | Increase | Small-Moderate | Chronic | Yes | A | +1.89 mmHg diastolic; supratherapeutic: +12/+7 mmHg |
| **SSRIs** | Neutral / Small decrease | Small | Chronic | N/A | A | Generally safe; no significant BP changes in meta-analyses |
| **Bupropion** | Increase at high doses | Moderate | Chronic | Yes | B | +7 mmHg diastolic at 300-400 mg/day |
| **TCAs** | Orthostatic hypotension | Large | Acute | Yes | A | Imipramine: -26 mmHg systolic standing; major fall risk |
| **MAOIs** | Hypertensive crisis (tyramine) / Orthostatic hypotension | Large | Acute | Yes | A | Potentially life-threatening |
| **Mirtazapine** | Minimal / Orthostatic hypotension | Small | Chronic | Yes | B | 7% orthostatic hypotension |
| **Trazodone** | Orthostatic hypotension | Moderate | Acute | Yes | B | α1-adrenergic antagonism |

**Confounder Risk**: MODERATE-HIGH. Blood pressure changes can confound autonomic-based neuromodulation outcomes and must be monitored for safety with neuromodulation procedures.

---

### 3. Skin Conductance

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | Increase | Moderate | Acute | Yes | B | 50% of studies show increase; inverted dose-response |
| **Benzodiazepines** | Decrease | Moderate | Acute | Yes | B | Reduced sympathetic arousal |
| **Stimulants** | Increase | Moderate | Acute | Yes | B | Sympathetic activation |

**Confounder Risk**: MODERATE. Skin conductance is used in psychophysiology research. SSRI effects are dose-dependent and can confound sympathetic arousal measures.

---

### 4. Pupil Diameter

| Medication | Direction | Magnitude | Onset | Reversible | Evidence | Key References |
|-----------|-----------|-----------|-------|------------|----------|----------------|
| **SSRIs** | Increase (mydriasis) | Small-Moderate | Acute | Yes | B | Consistent across dose ranges; serotonin-mediated |
| **Stimulants** | Increase | Moderate | Acute | Yes | B | Sympathetic activation |
| **Antipsychotics** | Minimal change | Small | Chronic | N/A | C | Generally minimal ocular effects |

**Confounder Risk**: LOW-MODERATE. Pupil diameter is less commonly used in neuromodulation but important for pupillometry-based cognitive assessments.

---

## HIGH-PRIORITY CONFOUNDERS

### Critical Medication-Biomarker Interactions for Neuromodulation Research

The following combinations represent the highest risk for misinterpreting medication effects as neuromodulation outcomes:

#### Category 1: Very High Risk (Always control for)

| # | Interaction | Mechanism | Mitigation Strategy |
|---|------------|-----------|-------------------|
| 1 | **Antipsychotics → qEEG slowing** (theta/delta increase) | Multi-receptor antagonism; anticholinergic effects | 4-week washout; document CPZ equivalents |
| 2 | **TCAs/SNRIs → HRV reduction** | Anticholinergic; NE reuptake inhibition | 2-week washout; medication-free baseline |
| 3 | **Lithium → Brain volume increases** | Neurogenesis; anti-apoptotic effects | 2-week washout; lithium duration as covariate |
| 4 | **SSRIs → DMN connectivity changes** | 5-HT receptor modulation of resting networks | 2-4 week washout (fluoxetine: 4-6 weeks) |

#### Category 2: High Risk (Control when feasible)

| # | Interaction | Mechanism | Mitigation Strategy |
|---|------------|-----------|-------------------|
| 5 | **Benzodiazepines → Beta power increase** | GABA-A receptor enhancement | 2-week washout (longer for long-acting) |
| 6 | **Stimulants → qEEG beta/theta-beta ratio** | Dopamine/norepinephrine enhancement | 24-48 hour washout; acute effects measurable |
| 7 | **SSRIs → BDNF elevation** | TrkB signaling; neuroplasticity | 4-week washout for BDNF studies |
| 8 | **SSRIs → Inflammatory marker reduction** | Cytokine modulation | 2-4 week washout for inflammatory outcomes |
| 9 | **Antipsychotics → Prolactin elevation** | D2 blockade in pituitary | Screen prolactin; use atypical agents |
| 10 | **Lithium → Thyroid suppression** | Inhibition of thyroid hormone synthesis | Baseline and serial TSH monitoring |

#### Category 3: Moderate Risk (Document and covary)

| # | Interaction | Mechanism | Mitigation Strategy |
|---|------------|-----------|-------------------|
| 11 | **SSRIs → Cortisol slope steepening** | HPA axis modulation | 1-week washout for CAR studies |
| 12 | **Antidepressants → Blood pressure changes** | Variable by class (SNRI > SSRI) | Monitor BP; document medication class |
| 13 | **Methylphenidate → DMN connectivity changes** | Dopamine/norepinephrine modulation | Document timing relative to assessment |
| 14 | **Antipsychotics → P300 improvement** | Cognitive enhancement | Document as cognitive confounder |
| 15 | **Antipsychotics → Structural brain changes** | GMV changes (pallidum) | Longitudinal designs; illness vs. medication disambiguation |

---

## CLINICAL RECOMMENDATIONS

### 1. Study Design Recommendations

| Design Element | Recommendation | Rationale |
|--------------|---------------|-----------|
| **Washout periods** | Minimum 5 half-lives for primary medication | Ensures 97% clearance; longer for active metabolites |
| **Stable medication design** | Accept stable medication as alternative to washout | More ethical; medication as covariate |
| **Baseline assessment** | Always collect medication history at baseline | Essential for covariate adjustment |
| **Chlorpromazine equivalents** | Calculate and document for all antipsychotics | Enables dose-effect modeling |
| **Medication-free controls** | Include unmedicated comparison group when possible | Gold standard for confounder detection |

### 2. Washout Period Guidelines

| Medication | Minimum Washout | Extended Washout (for brain imaging) | Active Metabolite Considerations |
|-----------|-----------------|-------------------------------------|----------------------------------|
| Fluoxetine | 4-6 weeks | 6-8 weeks | Norfluoxetine: 4-16 day half-life |
| Other SSRIs | 1-2 weeks | 2-3 weeks | Minimal active metabolites |
| SNRIs | 1 week | 2 weeks | O-desmethylvenlafaxine |
| TCAs | 2 weeks | 3-4 weeks | Nortriptyline (from amitriptyline) |
| Lithium | 1-2 weeks | 2-4 weeks | Renal excretion only |
| Methylphenidate | 24-48 hours | 3-7 days | Rapid elimination |
| Amphetamine | 2-3 days | 5-7 days | Multiple metabolites |
| Benzodiazepines (short) | 1 week | 2 weeks | - |
| Benzodiazepines (long) | 2-4 weeks | 4-6 weeks | Active metabolites accumulate |
| Atypical antipsychotics | 2-4 weeks | 4-6 weeks | Variable; clozapine: 1-2 weeks |
| Clozapine | 2 weeks | 3-4 weeks | Desmethylclozapine active |

### 3. Statistical Control Strategies

| Strategy | When to Use | Method |
|---------|------------|--------|
| **Medication status as covariate** | When washout not possible | Binary (on/off) or continuous (dose) |
| **Stratified analysis** | Large medication subgroups | Separate analyses by medication class |
| **Propensity scoring** | Observational designs | Match on medication characteristics |
| **Mediation analysis** | Testing medication as mechanism | Path analysis with medication as mediator |
| **Sensitivity analysis** | Robustness checking | Exclude medicated participants; compare |

### 4. Minimum Documentation Requirements

For any neuromodulation clinical assessment, the following medication data should be collected:

1. **Current medications** (name, dose, duration, adherence)
2. **Recent changes** (dose adjustments within past 4 weeks)
3. **Lifetime exposure** (cumulative duration of each class)
4. **Chlorpromazine equivalents** (for antipsychotics)
5. **Defined daily doses (DDD)** (for cross-study comparison)
6. **Washout status** (date of last dose if applicable)
7. **Reason for medication** (primary diagnosis, adjunctive use)

---

## REFERENCES

### qEEG References

1. **Knott et al.** (2002) - qEEG predictors of antidepressant response. *Psychiatry Research*, 113(1-2), 131-143.
2. **Deldin & Chiu** (2005) - Cognitive restructuring and alpha asymmetry. *Journal of Abnormal Psychology*, 114(2), 373-382.
3. **Bruder et al.** (2008) - EEG alpha measures predict SSRI response. *Neuropsychopharmacology*, 33(7), 1701-1710.
4. **Risassan et al.** (2020) - qEEG in schizophrenia with atypical antipsychotic monotherapy. *Psychiatry and Clinical Neurosciences*, 74(8), 408-415.
5. **Choi et al.** (2011) - Methylphenidate effects on QEEG in ADHD boys during CPT. *Clinical Neurophysiology*, 122(6), 1145-1151.
6. **Christian et al.** (2015) - GABA-A subtype-selective compound effects on EEG beta. *Psychopharmacology*, 232(21), 3905-3918.
7. **Saletu et al.** (2006) - Pharmaco-EEG of benzodiazepines. *Pharmacopsychiatry*, 39(4), 141-154.
8. **Iwanami et al.** (2020) - Antipsychotic effects on gamma and theta EEG in schizophrenia. *Schizophrenia Research*, 226, 90-97.
9. **Boutros et al.** (2020) - Antipsychotic effects on qEEG: Strict monotherapy analysis. *Journal of Psychiatric Research*, 130, 47-55.

### MRI/fMRI References

10. **McCabe & Mishor** (2011) - SSRI effects on subcortical-cortical rsFC. *NeuroImage*, 57(4), 1317-1323.
11. **Wang et al.** (2015) - Escitalopram effects on DMN connectivity in MDD. *Translational Psychiatry*, 11, e396.
12. **Kaiser et al.** (2016) - Dynamic functional connectivity variability in depression. *Brain*, 139(7), 1852-1863.
13. **Wise et al.** (2017) - Acute citalopram effects on dynamic rsFC. *Progress in Neuro-Psychopharmacology and Biological Psychiatry*, 84(Pt A), 152-159.
14. **Hafeman et al.** (2012) - Lithium and gray matter volume: Meta-analysis. *Bipolar Disorders*, 14(5), 515-525.
15. **Yucel et al.** (2007) - Lithium increases PFC gray matter density. *Biological Psychiatry*, 62(1), 7-16.
16. **Machado-Vieira et al.** (2009) - Lithium neurotrophic effects: Unifying hypothesis. *Bipolar Disorders*, 11(Suppl 2), 92-109.
17. **Hajek et al.** (2012) - Lithium and hippocampal volume: Meta-analysis. *Psychological Medicine*, 42(1), 1-10.
18. **Picon et al.** (2020) - Methylphenidate alters DMN connectivity in ADHD. *Journal of Attention Disorders*, 24(3), 447-455.
19. **ePOD-MPH RCT** (2025) - 4-month methylphenidate effects on functional connectivity. *Journal of Child Psychology and Psychiatry* (in press).
20. **Lett et al.** (2021) - Antipsychotic medication vs. illness effects on brain volume. *Neuropsychopharmacology*, 46, 1484-1492.

### Blood Biomarker References

21. **Zhou et al.** (2017) - Meta-analysis: Antidepressants and peripheral BDNF. *PLoS ONE*, 12(2), e0172270.
22. **Polyakova et al.** (2015) - BDNF as biomarker for mood disorder treatment. *Journal of Affective Disorders*, 174, 432-440.
23. **Huang et al.** (2008) - BDNF in depression: Effects of antidepressants. *Journal of Psychiatric Research*, 42(7), 521-525.
24. **de Sousa et al.** (2011) - Lithium increases plasma BDNF in acute mania. *Neuroscience Letters*, 494(1), 54-56.
25. **Hashimoto et al.** (2015) - Lithium and BDNF: Post-translational regulation. *Progress in Neuro-Psychopharmacology*, 56, 241-246.
26. **Patel et al.** (2024) - Meta-analysis: SSRI immunomodulatory effects on IL-6, TNF-α, CRP. *Cureus*, 16(7), e63852.
27. **Hannestad et al.** (2011) - Meta-analysis: Antidepressants and inflammatory cytokines. *Neuropsychopharmacology*, 36(12), 2452-2459.
28. **Köhler et al.** (2017) - Meta-analysis: Antidepressants and peripheral biomarkers. *Acta Psychiatrica Scandinavica*, 136(6), 556-567.
29. **Bhagwagar et al.** (2004) - Acute SSRI effects on cortisol in healthy volunteers. *Psychopharmacology*, 171(4), 425-430.
30. **Cowen et al.** (2018) - 6-day escitalopram effects on cortisol in healthy volunteers. *Psychoneuroendocrinology*, 88, 120-128.
31. **Hage & Azar** (2012) - Antipsychotics and prolactin: Systematic review. *Journal of Clinical Psychopharmacology*, 32(6), 741-749.
32. **Bai et al.** (2015) - Prolactin and thyroid dysfunction with antipsychotics. *Psychoneuroendocrinology*, 60, 40-46.
33. **UpToDate** (2024) - Lithium and the thyroid. *Wolters Kluwer* (updated 2024).
34. **Bocchetta & Loviselli** (2006) - Lithium and thyroid: Review. *Lithium*, 17(1), 39-45.
35. **Atkinson et al.** (2015) - Vitamin D and psychiatric illness. *Journal of Clinical Endocrinology & Metabolism*, 100(10), 1-9.

### Physiological References

36. **Licht et al.** (2008) - Depression, antidepressants, and HRV (NESDA). *Psychological Medicine*, 38(8), 1129-1136.
37. **Licht et al.** (2010) - Longitudinal HRV changes with antidepressants. *Psychological Medicine*, 40(11), 1843-1855.
38. **Kemp et al.** (2010) - Meta-analysis: Depression and HRV. *Biological Psychiatry*, 67(11), 1067-1074.
39. **Kemp et al.** (2012) - HRV in depression: Import of antidepressants. *Depression and Anxiety*, 29(4), 321-330.
40. **Brunoni et al.** (2013) - HRV in depression: Trait or state marker? *Psychological Medicine*, 43(12), 2595-2605.
41. **TILDA Study** (2015) - Antidepressants and HRV in older adults. *International Journal of Geriatric Psychiatry*, 30(3), 229-236.
42. **Kollada et al.** (2019) - 12-week methylphenidate effects on HRV in ADHD. *Korean Journal of Pediatrics*, 62(4), 139-145.
43. **Negrao et al.** (2014) - HRV and autonomic function in ADHD. *Frontiers in Psychiatry*, 5, 120.
44. **Ning & Gagnon** (2020) - Stimulant effects on exercise hemodynamics. *Pediatrics*, 145(3), e20191897.
45. **Calvi et al.** (2021) - Antidepressant drugs effects on blood pressure. *Frontiers in Neuroscience*, 15, 703381.
46. **Licht et al.** (2009) - Depression, BP, and antidepressant use. *Hypertension*, 53(4), 631-638.
47. **Walsh et al.** (2005) - SSRIs and SNRIs: A structural review of HRV effects. *Psychosomatic Medicine*, 67(4), 653-657.
48. **Uhr et al.** (2003) - Pituitary-adrenal response to SSRIs: Dose-response. *Psychopharmacology*, 166(3), 262-266.

### General/Methodological References

49. **Saleh et al.** (2017) - Biomarkers for SSRI effects in healthy subjects. *Psychopharmacology*, 191(1), 1-15.
50. **Bramon et al.** (2005) - Meta-analysis: P300 in schizophrenia. *Schizophrenia Research*, 78(2-3), 241-245.
51. **Jeon & Polich** (2003) - Meta-analysis: P300 in medicated vs. unmedicated schizophrenia. *Biological Psychiatry*, 53(2), 117-128.
52. **Hassan & Bourgeois** (2010) - P300 in schizophrenia: Medication effects. *Schizophrenia Research*, 118(1-3), 221-229.
53. **Papageorgiou et al.** (2004) - P300 and auditory hallucinations: Clozapine vs. olanzapine. *European Neuropsychopharmacology*, 14(3), 233-240.

---

## APPENDIX A: Quick Reference Card

### Medication Effects by Biomarker Domain

| Biomarker Domain | Most Affected By | Direction | Risk Level |
|-----------------|-----------------|-----------|------------|
| **qEEG Power** | Antipsychotics, BZD, Stimulants | Variable by drug/band | VERY HIGH |
| **qEEG Connectivity** | Benzodiazepines | Decreased coherence | MODERATE |
| **DMN Connectivity** | SSRIs, Stimulants | Decreased/normalized | HIGH |
| **Hippocampal Volume** | Lithium | Increased | HIGH |
| **PFC Volume** | Lithium | Increased | MODERATE |
| **BDNF** | SSRIs, Lithium, ECT | Increased | HIGH |
| **IL-6 / TNF-α** | SSRIs, SNRIs | Decreased | HIGH |
| **CRP** | SSRIs | No significant effect | LOW |
| **Cortisol/CAR** | SSRIs, BZD | Altered slope | MODERATE |
| **Prolactin** | Antipsychotics (D2 blockers) | Increased | MODERATE |
| **TSH** | Lithium | Increased | MODERATE |
| **HRV** | TCAs, SNRIs, SSRIs | Decreased | VERY HIGH |
| **Blood Pressure** | SNRIs, TCAs, MAOIs | Increased/decreased | MODERATE |
| **Skin Conductance** | SSRIs, Stimulants | Increased | LOW-MOD |
| **Pupil Diameter** | SSRIs, Stimulants | Increased | LOW |

### Washout Priority Ranking

1. **Benzodiazepines** → qEEG beta confounder (2-4 weeks)
2. **Fluoxetine** → DMN connectivity, BDNF (4-6 weeks)
3. **TCAs** → HRV, blood pressure (2-3 weeks)
4. **Lithium** → Brain volume, thyroid, BDNF (2-4 weeks)
5. **Antipsychotics** → qEEG slowing, prolactin (2-4 weeks)
6. **Other SSRIs** → Inflammation, HRV, cortisol (1-2 weeks)
7. **Stimulants** → qEEG, HRV, autonomic (24-48 hours)

---

*This matrix was compiled from published peer-reviewed literature as of 2025. Evidence grades reflect the quality of available research for each medication-biomarker pair. Clinical decisions should always be made in consultation with qualified healthcare providers.*
