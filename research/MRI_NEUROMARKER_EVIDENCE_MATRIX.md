# MRI Neuromarker Evidence Matrix

## DeepSynaps Protocol Studio — Evidence-Based Neuroimaging Biomarker Reference

**Version:** 1.0  
**Date:** 2025  
**Scope:** Structural & Diffusion MRI Biomarkers for Neurological and Psychiatric Conditions  
**Evidence Grading:** A (strong) / B (moderate) / C (limited) / D (preliminary)  
**Clinical Use Status:** Diagnostic / Monitoring / Research-Only / Emerging  

---

## Table of Contents

1. [Alzheimer's Disease / MCI](#1-alzheimers-disease--mci)
2. [Parkinson's Disease](#2-parkinsons-disease)
3. [Epilepsy](#3-epilepsy)
4. [Stroke](#4-stroke)
5. [TBI / Concussion](#5-tbi--concussion)
6. [Autism Spectrum Disorder](#6-autism-spectrum-disorder)
7. [ADHD](#7-adhd)
8. [Depression / MDD](#8-depression--mdd)
9. [PTSD](#9-ptsd)
10. [White Matter Disease / CSVD](#10-white-matter-disease--csvd)
11. [Neuroinflammation](#11-neuroinflammation)
12. [Demyelination / MS](#12-demyelination--ms)
13. [Brain Age](#13-brain-age)
14. [Atrophy Patterns](#14-atrophy-patterns)
15. [Cortical Thickness Maps](#15-cortical-thickness-maps)

---

## 1. Alzheimer's Disease / MCI

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Hippocampal volume (HV), entorhinal cortex thickness (EC), cortical thickness signature (AD-signature CT), amygdala volume, lateral temporal cortex thickness |
| **Evidence Strength** | **A** — Hippocampal volume (multiple large meta-analyses, >2000 subjects); **B** — Entorhinal cortex (strong anatomical rationale, moderate meta-analytic support); **A** — AD-signature cortical thickness (superior to HV for CDR prediction, AIC 1903 vs 2293) |
| **Clinical Use Status** | **Diagnostic (adjunctive)** — Required for "biomarker-confirmed" AD diagnosis under NIA-AA 2024 criteria; **Monitoring** — Longitudinal atrophy rates used in clinical trials |
| **Quantification Method** | Automated segmentation (FreeSurfer, FSL-FIRST, DL-based); Asymmetry index; Normative z-scores vs. age/sex matched templates; vMRI (volumetric MRI) per ADNI protocol |
| **Key References (PMID)** | 15056570 (Hippocampal volume meta-analysis, Videbech & Ravnkilde); 2612082 (Hippocampal asymmetry meta-analysis in AD); 23296164 (ENIGMA-AD hippocampal atrophy); 33599936 (Cortical thickness vs. CDR); 20198733 (ADNI hippocampal volumetry standard) |
| **Safe Report Wording** | "Hippocampal volumes are reduced relative to age- and sex-matched normative data, consistent with patterns described in neurodegenerative conditions including Alzheimer's disease. This finding should be interpreted in conjunction with clinical assessment, cognitive testing, and other biomarkers (CSF amyloid/tau or amyloid PET)." |
| **DeepSynaps Integration** | **Level 1 (Native)** — Hippocampal segmentation, asymmetry quantification, normative comparison, and z-score mapping available via automated pipeline |

### Evidence Summary
- **Hippocampal volume**: Most validated structural MRI biomarker in AD. Meta-analyses confirm ~10-15% volume reduction in AD vs. controls, with effect sizes (Cohen's d) of 0.4-1.2. Left-right asymmetry adds diagnostic value (PMID: 39540766).
- **Entorhinal cortex**: Among the earliest affected regions; EC atrophy precedes hippocampal atrophy in preclinical AD. Correlates strongly with episodic memory performance.
- **Cortical thickness**: AD-signature cortical thickness (temporal-parietal-frontal pattern) shows better model fit than hippocampal volume alone for predicting CDR status (AIC advantage). Pattern follows Braak staging of neurofibrillary tangle propagation.
- **Temporal neocortical atrophy**: MCI patients who progress to AD develop temporal neocortical atrophy more than stable MCI, suggesting this as a progression biomarker.

---

## 2. Parkinson's Disease

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Substantia nigra (SN) volume/integrity, swallow-tail sign (T2*/SWI), neuromelanin-sensitive SN signal, nigrosome-1 hyperintensity (7T), basal ganglia iron (QSM), DTI nigrostriatal FA/MD |
| **Evidence Strength** | **B** — Swallow-tail sign (meta-analysis: 94% sensitivity, 90% specificity at 3T); **B** — NM-MRI (meta-analysis: 82% sensitivity, 82% specificity); **B** — 7T nigrosome imaging (sensitivity 99%, specificity 92%); **C** — QSM iron quantification |
| **Clinical Use Status** | **Diagnostic (adjunctive)** — Swallow-tail sign loss used to support PD diagnosis; **Research-Only** — 7T nigrosome imaging, NM volumetry in clinical trials; **Monitoring** — SN volumetry for progression |
| **Quantification Method** | Visual rating (swallow-tail sign present/absent); NM-MRI signal intensity ratio; Volumetry (SN pars compacta); QSM for iron deposition quantification; DTI tractography of nigrostriatal pathway |
| **Key References (PMID)** | 32583681 (Swallow-tail sign meta-analysis 19 studies); 31483506 (NM-MRI meta-analysis); 33901866 (7T SN imaging); 31670983 (Iron deposition meta-analysis QSM); 34471983 (Substantia nigra volumetry in de novo PD) |
| **Safe Report Wording** | "The substantia nigra shows altered signal characteristics on susceptibility-weighted imaging, with loss of the typical dorsal nigral hyperintensity (swallow-tail sign). This finding may be seen in Parkinsonian syndromes but is not specific for any single diagnosis. Correlation with clinical examination and DaTscan is recommended." |
| **DeepSynaps Integration** | **Level 2 (Pipeline)** — SN region segmentation, swallow-tail sign detection (requires specific sequence), QSM analysis; **Level 3 (Research)** — NM-MRI processing, 7T nigrosome mapping |

### Evidence Summary
- **Swallow-tail sign**: Loss of dorsal nigral hyperintensity on 3T T2*/SWI is the most clinically accessible PD MRI biomarker. Meta-analysis of 19 studies: sensitivity 94%, specificity 90% for PD vs. HC. However, AUC only 0.56-0.68 for differentiating PD from atypical parkinsonism. Combining with putaminal hypointensity increases AUC to 0.93.
- **Neuromelanin MRI**: Signal reduction in SN pars compacta correlates with dopaminergic cell loss. Longitudinal studies show progressive NM loss beginning posterolaterally and extending medially. NM loss correlates with motor severity and disease duration.
- **7T MRI**: Direct visualization of nigrosome architecture; disappearance of nigrosome-1 hyperintensity distinguishes PD from HC with 99% sensitivity and 92% specificity (5-study meta-analysis). Limited by 7T scanner availability.
- **QSM iron quantification**: Increased iron in SN, putamen, and dentate nucleus (tremor-dominant subtype). Meta-analysis supports quantitative iron-sensitive MRI for differentiating PD from controls.
- **DTI free water**: Elevated free water in substantia nigra distinguishes PD from controls and correlates with disease progression. Archer et al. (PMID: 28965831) demonstrated free water differentiates PD from atypical parkinsonism.

---

## 3. Epilepsy

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Hippocampal sclerosis (volume loss + T2 hyperintensity), hippocampal asymmetry index, focal cortical dysplasia (FCD) detection, lesion burden (T2/FLAIR), cortical thickness abnormalities |
| **Evidence Strength** | **A** — Hippocampal sclerosis on MRI (established surgical biomarker); **B** — Hippocampal volumetry with normative comparison (asymmetry index >2 SD); **B** — FCD detection on high-resolution MRI; **C** — Automated quantitative hippocampal biomarkers |
| **Clinical Use Status** | **Diagnostic** — HS detection is standard of care for TLE evaluation; **Monitoring** — Serial volumetry in drug-resistant epilepsy; **Diagnostic** — FCD detection guides surgical planning |
| **Quantification Method** | Manual/automated hippocampal segmentation; Asymmetry index (AI) = (right-left)/mean; Normative comparison (>2.5 SD = atrophic); T2 relaxometry; FLAIR signal quantification; FCD detection on 3T/7T MRI |
| **Key References (PMID)** | 30747927 (HS biomarker deep learning segmentation); 10691620 (Wieser: hippocampal sclerosis defining epilepsy surgery); 35290868 (Clinical evaluation QReport HS); 30278519 (ENIGMA-Epilepsy hippocampal volume); 30747927 (DL-based segmentation for HS quantification) |
| **Safe Report Wording** | "The hippocampus demonstrates reduced volume and increased T2 signal on the [left/right] side, with an asymmetry index exceeding normative thresholds. These findings are consistent with hippocampal sclerosis, a common substrate for temporal lobe epilepsy. Complete hippocampal evaluation requires integration with EEG, neuropsychological testing, and clinical semiology." |
| **DeepSynaps Integration** | **Level 1 (Native)** — Hippocampal volumetry, asymmetry index calculation, T2 relaxometry mapping; **Level 2 (Pipeline)** — Normative comparison against ENIGMA-derived templates; **Level 3 (Research)** — 7T FCD detection, quantitative FLAIR analysis |

### Evidence Summary
- **Hippocampal sclerosis**: The most common pathological finding in mesial temporal lobe epilepsy (mTLE). Characteristic MRI features: hippocampal volume loss, increased T2/FLAIR signal, and loss of internal architecture. ENIGMA-Epilepsy study (n>2000) confirmed ipsilateral hippocampal volume loss as the most pronounced effect in lesional TLE.
- **Asymmetry index**: Normal controls show slight right-sided hippocampal dominance (mean AI ~ -0.007, confirmed across meta-analyses). In HS, AI exceeds 2-3 SD from normative means. Automated DL-based segmentation shows improved accuracy over atlas-based methods in pathological cases.
- **Quantitative reporting**: Clinical evaluation demonstrated that quantitative reports (QReports) improve HS diagnosis accuracy from 77.5% to 86.3% and increase inter-rater agreement (Fleiss' kappa 0.56 to 0.72).
- **Focal cortical dysplasia**: FCD Type IIb (transmantle sign) is reliably detected on 3T MRI; FCD Type I and MR-negative FCD remain imaging challenges. Complete lesion resection is the strongest predictor of surgical outcome (Engel I in ~60% with complete resection).

---

## 4. Stroke

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Infarct volume (DWI/ADC), white matter hyperintensity (WMH) burden (Fazekas), DTI CST fractional anisotropy, DTI free water (FW), lacunar infarcts, periventricular WMH, corticospinal tract (CST) integrity |
| **Evidence Strength** | **A** — DWI infarct volume for acute prognosis; **A** — DTI CST FA for motor outcome prediction (multiple meta-analyses); **B** — WMH burden for stroke recurrence risk (C-index 0.83 with clinical variables); **B** — DTI free water for WMH progression prediction (AUC 0.732) |
| **Clinical Use Status** | **Diagnostic** — DWI is standard of care for acute stroke; **Monitoring** — WMH quantification for CSVD tracking; **Diagnostic/Prognostic** — DTI CST metrics for motor recovery prediction; **Research-Only** — Free water as progression biomarker |
| **Quantification Method** | DWI lesion volume (mL); Fazekas scale (0-3, periventricular + deep); Automated WMH segmentation (UBO detector); DTI metrics: FA, MD, RD, AD in CST ROI; Free water correction; Tractography-based CST lesion load |
| **Key References (PMID)** | 27558332 (DTI motor recovery meta-analysis); 27606868 (DTI motor recovery meta-analysis ICH); 28965831 (Archer: free water in PD/MSA); 34089752 (DTI biomarkers stroke recovery review); 37289192 (Free water predicts WMH progression); PMC11393268 (Quantitative WMH predicts stroke recurrence) |
| **Safe Report Wording** | "Diffusion-weighted imaging demonstrates an acute infarct involving [region], with an estimated lesion volume of [X] mL. Fractional anisotropy within the ipsilateral corticospinal tract is [reduced/normal], which [may be associated with/predicts] motor recovery potential. White matter hyperintensity burden (Fazekas [score]) indicates underlying small vessel disease that may influence overall prognosis." |
| **DeepSynaps Integration** | **Level 1 (Native)** — DWI lesion volume quantification, Fazekas scoring, DTI FA/MD mapping; **Level 2 (Pipeline)** — CST tractography, free water estimation, WMH automated segmentation; **Level 3 (Research)** — Multimodal prediction models combining DTI + clinical variables |

### Evidence Summary
- **DWI infarct volume**: The strongest acute MRI predictor of stroke severity and functional outcome. Large vessel occlusion protocols use DWI-ASPECTS for treatment decision-making (thrombectomy eligibility).
- **DTI for motor outcome**: Two meta-analyses (Kumar et al. 2016) demonstrated strong correlations between CST DTI metrics and upper-limb motor recovery in both ischemic and hemorrhagic stroke. 66-92% of studies report significant correlations depending on timing (hyperacute to subacute). FA is the most commonly used but least specific metric.
- **WMH burden**: Quantitative WMH analysis combined with clinical characteristics achieves C-index of 0.83 for predicting 1-year ischemic stroke recurrence, outperforming Fazekas scale alone (C-index 0.62) and clinical variables alone (0.64). DTI free water in normal-appearing WM predicts progression to new WMH lesions (AUC 0.732).
- **CST FA asymmetry**: Predicts distal arm motor improvement in chronic stroke, explaining 26% of variance in motor recovery after rehabilitation. Multivariate models combining CST FA + age + Fugl-Meyer explain 39% of variance.

---

## 5. TBI / Concussion

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Diffusion abnormalities (DTI: reduced FA, increased MD), microhemorrhages (SWI/GRE), white matter hyperintensities, atrophy patterns (global/regional), corpus callosum thinning, CSF volume increase |
| **Evidence Strength** | **B** — DTI diffusion abnormalities in mTBI (meta-analyses show consistent FA reduction); **B** — SWI microhemorrhages as DAI marker; **C** — Longitudinal atrophy patterns; **C** — DTI outcome prediction (moderate quality evidence per systematic review) |
| **Clinical Use Status** | **Diagnostic (adjunctive)** — SWI for hemorrhagic DAI detection; **Research-Only** — DTI for mTBI diagnosis/outcome; **Monitoring** — Serial volumetry for post-TBI atrophy tracking |
| **Quantification Method** | SWI microbleed count and location; DTI TBSS (Tract-Based Spatial Statistics) for group analysis; ROI-based FA/MD in corpus callosum, internal capsule, cingulum; Volumetric analysis (brain parenchymal fraction); Z-score maps vs. normative data |
| **Key References (PMID)** | 21082776 (mTBI MRI & DTI review); 20494232 (DTI cognitive correlates mTBI); 19234075 (SWI detects 6x more hemorrhagic DAI); 18438946 (Niogi: DTI correlates with attention/memory mTBI); 27549675 (Meta-analysis DTI mTBI: FA decreases, MD increases) |
| **Safe Report Wording** | "Susceptibility-weighted imaging demonstrates [number] microhemorrhagic foci, predominantly in [locations], suggestive of traumatic axonal injury. There is [no/mild] evidence of regional volume loss compared to age-matched norms. DTI metrics, if available, should be interpreted cautiously as they remain investigational for individual-level clinical decision-making in mild TBI." |
| **DeepSynaps Integration** | **Level 2 (Pipeline)** — SWI microbleed detection, DTI FA/MD mapping, TBSS analysis; **Level 3 (Research)** — Longitudinal atrophy quantification, normative z-score mapping, DTI outcome prediction models |

### Evidence Summary
- **Microhemorrhages (SWI)**: SWI demonstrates 6-fold greater sensitivity for hemorrhagic diffuse axonal injury than conventional MRI. Microbleeds typically localize to gray-white matter junctions, corpus callosum, brainstem, and thalamus. Microbleed burden correlates with injury severity but mixed results on clinical outcome correlation.
- **DTI abnormalities**: Meta-analyses consistently show decreased FA and increased MD in mTBI, particularly in corpus callosum, subcortical white matter, and internal capsules. 10/11 mTBI patients with negative conventional MRI showed FA reductions in Niogi et al. (2008). FA correlates with attention (anterior corona radiata) and memory (uncinate fasciculus).
- **Atrophy patterns**: Longitudinal studies demonstrate progressive global and regional atrophy post-TBI, with ventricular enlargement and cortical thinning. Brain age gap increases following moderate-severe TBI.
- **Limitations**: Heterogeneity in DTI methods, small sample sizes, and cross-sectional designs limit clinical utility at individual level. DTI remains primarily a research tool for mTBI.

---

## 6. Autism Spectrum Disorder

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Early brain overgrowth (2-4 years), cortical thickness alterations, gray matter volume (insula, frontal cortex, amygdala-hippocampus), cortical surface area, white matter volume, connectivity patterns |
| **Evidence Strength** | **B** — Early brain overgrowth pattern (well-replicated); **B** — GM volume alterations (ENIGMA replication); **C** — Cortical thickness findings (inconsistent across studies); **C** — Surface area alterations |
| **Clinical Use Status** | **Research-Only** — No MRI biomarker is currently approved for ASD diagnosis; **Research-Only** — Neuroimaging supports research into neural mechanisms |
| **Quantification Method** | Longitudinal volumetry (total brain volume, GM/WM); VBM (voxel-based morphometry); Cortical thickness/surface area (FreeSurfer); Subcortical volumetry; Network/connectivity analysis; Brain age estimation |
| **Key References (PMID)** | 30523303 (Early brain overgrowth ASD meta-analysis); 10502888 (Courchesne: early brain overgrowth landmark); 38284564 (ENIGMA-ASD gray matter replication); 31722822 (LEAP-ENIGMA ASD cortical analysis); 26068827 (Cortical thickness ASD meta-analysis) |
| **Safe Report Wording** | "Structural MRI demonstrates [normal/atypical] brain volume and cortical thickness patterns. No MRI finding is diagnostic of autism spectrum disorder. Imaging findings, if atypical, should be interpreted in the context of comprehensive developmental and behavioral assessment by a multidisciplinary team." |
| **DeepSynaps Integration** | **Level 2 (Pipeline)** — Volumetric analysis, cortical thickness mapping, surface area quantification; **Level 3 (Research)** — Normative comparison against pediatric ASD/typical development templates, brain age estimation |

### Evidence Summary
- **Early brain overgrowth**: One of the most replicated findings in ASD neuroimaging. Total brain volume is increased by 5-10% in toddlers (ages 2-4 years), particularly frontal, temporal, and cingulate cortices. Overgrowth appears to precede behavioral symptom emergence and may normalize or plateau by adolescence.
- **Gray matter volume patterns**: ENIGMA-ASD replication study (n=1708, 37 sites) confirmed two independent gray matter components: (1) increased bilateral insula, inferior frontal gyrus, orbitofrontal cortex, and caudate; (2) increased bilateral amygdala, hippocampus, and parahippocampal gyrus. However, significant site effects limit generalizability.
- **Cortical thickness**: Findings are inconsistent — some studies report cortical thinning in ASD, others thickening, likely moderated by age, IQ, and analytical methods. Early developmental trajectories differ from typical development.
- **Key limitation**: No single MRI finding is specific to ASD, and between-group differences are smaller than within-group variability, precluding individual-level diagnostic use.

---

## 7. ADHD

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Basal ganglia volume (putamen, caudate, pallidum), cerebellum (vermis), cortical thickness (frontal, parietal, temporal), cortical surface area, white matter volume, DLPFC/VLPFC alterations |
| **Evidence Strength** | **B** — Basal ganglia volume reductions (meta-analysis: 27 VBM datasets, n=931 patients); **B** — Frontostriatal structural alterations; **C** — Cerebellar vermis alterations; **C** — Cortical thickness/surface area changes |
| **Clinical Use Status** | **Research-Only** — No MRI biomarker approved for ADHD diagnosis; **Research-Only** — Structural differences support research and may inform treatment prediction |
| **Quantification Method** | Subcortical volumetry (FreeSurfer/FIRST); VBM group analysis; Cortical thickness vertex-wise analysis; Seed-based d-Mapping meta-analytic comparison; Surface area quantification |
| **Key References (PMID)** | 2743796 (Meta-analysis ADHD brain abnormalities); 25179656 (Hoogman et al.: ENIGMA-ADHD subcortical volumes); 25266128 (ADHD vs OCD comparative meta-analysis); 28680982 (Cortical thickness ADHD); 39591123 (Cortical alterations and methylphenidate response) |
| **Safe Report Wording** | "No structural MRI finding is diagnostic of ADHD. Brain imaging in ADHD is reserved for excluding alternative neurological conditions. Research studies have identified subtle group-level differences in basal ganglia and frontal cortex structures, but these cannot be used for individual diagnosis." |
| **DeepSynaps Integration** | **Level 2 (Pipeline)** — Subcortical volumetry, cortical thickness mapping; **Level 3 (Research)** — ENIGMA-ADHD normative comparison, treatment response prediction models |

### Evidence Summary
- **Basal ganglia**: ENIGMA-ADHD meta-analysis (n=1713, 2304 controls across 36 sites) demonstrated significantly smaller bilateral accumbens, amygdala, caudate, hippocampus, and putamen. Effect sizes were small (d=0.10-0.20) but consistent. Pallidum differences did not survive correction.
- **Comparative meta-analysis (ADHD vs. OCD)**: ADHD shows disorder-contrasting abnormalities in bilateral basal ganglia/insula — decreased in ADHD but increased in OCD. Shared vmOFC GMV reduction across both disorders. ADHD-specific: decreased VLPFC/putamen volume and function.
- **Cortical alterations**: Adults with ADHD show cortical volume reductions in posterior cingulate/precuneus, frontal regions, fusiform gyrus, and temporal regions. Non-responders to methylphenidate show more widespread cortical volume and surface area reductions than responders.
- **Cerebellum**: Vermis abnormalities have been reported in ADHD but with less consistent replication than basal ganglia findings.

---

## 8. Depression / MDD

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Hippocampal volume, subgenual anterior cingulate cortex (sgACC) volume/thickness, dorsolateral prefrontal cortex (DLPFC) thickness, amygdala volume, cortical thickness (frontal, temporal) |
| **Evidence Strength** | **A** — Hippocampal volume reduction (32-study meta-analysis, n>2000); **B** — sgACC volume reduction (systematic review/meta-analysis); **B** — DLPFC cortical thickness alterations; **C** — Amygdala volume findings (inconsistent) |
| **Clinical Use Status** | **Research-Only** — MRI not used for MDD diagnosis; **Emerging** — Hippocampal volume may predict treatment response; **Research-Only** — sgACC as DBS target marker |
| **Quantification Method** | Hippocampal volumetry (manual/automated); sgACC ROI segmentation; DLPFC cortical thickness (vertex-wise/ROI); VBM analysis; Z-score comparison to norms |
| **Key References (PMID)** | 18031762 (Hippocampal volume meta-analysis MDD, 32 studies); 32665255 (ENIGMA-MDD hippocampal subfields); 39539152 (sgACC systematic review meta-analysis); 2729429 (sgACC in mood disorders review); 18083772 (MDD cortical thickness meta-analysis) |
| **Safe Report Wording** | "Hippocampal volumes are [within normal range/reduced relative to age- and sex-matched norms], a finding that has been described in some studies of patients with recurrent major depressive disorder. This is a non-specific finding and should not be interpreted as diagnostic of depression. Clinical correlation is essential." |
| **DeepSynaps Integration** | **Level 2 (Pipeline)** — Hippocampal volumetry, sgACC segmentation, cortical thickness mapping; **Level 3 (Research)** — MDD normative comparison, treatment response prediction |

### Evidence Summary
- **Hippocampal volume**: Strongest structural biomarker in MDD. Meta-analysis of 32 studies (n=1167 patients, 1088 controls) confirmed ~4% bilateral hippocampal volume reduction. Key moderator: illness duration — reduction only in patients with illness >2 years or >1 episode. No effect in first-episode patients with brief illness (<2 years). Effect larger in children (6-7% reduction) and middle-aged adults (5%).
- **sgACC**: Systematic review and meta-analysis confirm smaller sgACC gray matter volume in MDD vs. controls, particularly in the left hemisphere. sgACC is the target for deep brain stimulation in treatment-resistant depression. 7T MRI studies demonstrate robust volumetric differences (ICC inter-rater reliability >0.84).
- **DLPFC**: Meta-analyses show cortical thinning in dorsolateral and dorsomedial prefrontal cortex in MDD, correlating with cognitive dysfunction and rumination.
- **Illness burden effect**: Hippocampal volume loss appears to be a cumulative, state-dependent effect of illness duration and recurrence rather than a pre-existing trait. This has implications for early intervention to prevent structural changes.

---

## 9. PTSD

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Hippocampal volume reduction, amygdala volume (mixed findings), medial prefrontal cortex (mPFC) thickness/volume, anterior cingulate cortex, corpus callosum, insular cortex, third ventricle enlargement |
| **Evidence Strength** | **B** — Hippocampal volume reduction (consistent across meta-analyses); **C** — Amygdala alterations (mixed: some report enlargement, some reduction); **C** — mPFC alterations; **C** — DTI white matter alterations |
| **Clinical Use Status** | **Research-Only** — No MRI biomarker for PTSD diagnosis; **Research-Only** — Structural findings inform pathophysiological models; **Emerging** — Hippocampal volume as vulnerability/risk marker |
| **Quantification Method** | Hippocampal volumetry; Amygdala volumetry (including subnuclei); mPFC cortical thickness; VBM; DTI tractography (uncinate fasciculus, cingulum); Z-score normative comparison |
| **Key References (PMID)** | 25050531 (Hippocampal volume PTSD meta-analysis); 21690661 (Karl et al. PTSD meta-analysis); 12457503 (Bremner: hippocampal volume PTSD veterans); 17119271 (Smith PTSD hippocampal meta-analysis); 16809024 (Woon et al. PTSD amygdala meta-analysis) |
| **Safe Report Wording** | "Hippocampal volumes are [within normal range/at the lower end of the normal range]. Structural brain findings in PTSD are non-specific and cannot be used for individual diagnosis. Correlation with trauma history, symptom severity, and clinical assessment is essential." |
| **DeepSynaps Integration** | **Level 2 (Pipeline)** — Hippocampal/amygdala volumetry, mPFC cortical thickness; **Level 3 (Research)** — PTSD normative comparison, longitudinal trauma-related change tracking |

### Evidence Summary
- **Hippocampal volume**: Meta-analyses consistently demonstrate 5-8% bilateral hippocampal volume reduction in PTSD vs. controls. However, the direction of causality remains debated: some evidence suggests smaller hippocampi may be a pre-existing vulnerability factor, while neurotoxic effects of chronic stress/HPA axis hyperactivity may also contribute to atrophy over time. Duration of PTSD moderates the effect.
- **Amygdala**: Findings are more heterogeneous than for the hippocampus. Some studies report amygdala enlargement (particularly in acute PTSD), while others report volume reduction, especially in lateral/basolateral nuclei. A lateralization effect is sometimes observed (left-sided changes).
- **mPFC**: Reduced volume and cortical thickness in medial prefrontal regions (including anterior cingulate) have been reported, correlating with emotion regulation deficits and fear extinction impairment. Reduced mPFC volume may represent a vulnerability factor for developing PTSD after trauma exposure.
- **White matter**: DTI studies show reduced FA in uncinate fasciculus (connecting amygdala to frontal cortex), cingulum bundle, and corpus callosum, suggesting disrupted structural connectivity in fronto-limbic circuits.

---

## 10. White Matter Disease / CSVD

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | WMH burden (Fazekas scale + automated volume), DTI FA/MD in normal-appearing WM, lacunar infarcts count, cerebral microbleeds (CMBs), perivascular spaces (PVS), brain atrophy, DTI free water |
| **Evidence Strength** | **A** — WMH burden for cognitive decline prediction (large longitudinal cohorts); **B** — DTI FA/MD for microstructural damage (NAWM); **B** — WMH volume for stroke recurrence (C-index 0.81); **B** — Lacunes for disability prediction |
| **Clinical Use Status** | **Diagnostic** — Fazekas scale in routine clinical reporting; **Monitoring** — Serial WMH quantification for CSVD progression; **Diagnostic** — Lacune/CMB detection for stroke risk stratification; **Emerging** — Automated WMH volume as trial endpoint |
| **Quantification Method** | Fazekas scale (0-3, PV + deep); Automated WMH segmentation (UBO detector, LST-LPA); DTI TBSS or ROI-based FA/MD; Lacune count; CMB count (SWI); Perivascular spaces rating (0-4); Brain atrophy (BPF, ventricular volume) |
| **Key References (PMID)** | 18977336 (STRIVE criteria for CSVD imaging); 32926188 (WMH and dementia risk meta-analysis); PMC11393268 (Quantitative WMH predicts stroke recurrence C-index 0.83); PMC9873530 (Inflammatory biomarkers CSVD); PMC8311001 (DTI multidimensional biomarkers post-stroke CSVD) |
| **Safe Report Wording** | "White matter hyperintensities are present with a Fazekas score of [X] (periventricular) and [Y] (deep), corresponding to [mild/moderate/severe] small vessel disease burden. [N] lacunar infarcts and [N] cerebral microbleeds are identified. These findings are associated with increased risk of cognitive decline, stroke recurrence, and functional impairment. Vascular risk factor modification is recommended." |
| **DeepSynaps Integration** | **Level 1 (Native)** — Fazekas scoring, automated WMH segmentation, lacune/CMB detection; **Level 2 (Pipeline)** — DTI FA/MD mapping in NAWM, free water estimation; **Level 3 (Research)** — CSVD composite score, longitudinal progression modeling |

### Evidence Summary
- **WMH burden**: The most established structural biomarker in CSVD. Meta-analyses demonstrate that higher WMH burden is independently associated with ~2-fold increased risk of dementia, stroke, and death. Automated WMH volume (mL) combined with clinical variables achieves C-index of 0.83 for stroke recurrence prediction, outperforming Fazekas scale alone (0.62).
- **DTI in NAWM**: DTI detects microstructural damage in normal-appearing white matter before FLAIR-visible WMH develops. Mean diffusivity (MD) may be more sensitive than FA for early detection. DTI free water predicts progression of NAWM to FLAIR-visible WMH (AUC 0.732).
- **Lacunes**: Each additional lacunar infarct increases disability risk. OR for cognitive impairment ~2.0. ICAM-1 adhesion molecule levels are associated with lacune development (OR 1.67-8.6 across studies).
- **Cerebral microbleeds**: Associated with CMB count (strictly lobar = CAA pattern; mixed = hypertensive vasculopathy). Linked to future ICH risk and cognitive decline.
- **STRIVE criteria**: Standardized reporting framework for CSVD imaging markers (WMH, lacunes, PVS, CMBs, brain atrophy, recent small subcortical infarcts).

---

## 11. Neuroinflammation

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | TSPO PET signal (microglial activation), periventricular WMH, gadolinium enhancement, DTI free water, cortical thinning adjacent to inflammatory foci, volume changes in limbic structures |
| **Evidence Strength** | **B** — TSPO PET as microglial activation biomarker (established across diseases); **C** — Periventricular changes as proxy for neuroinflammation; **D** — Structural MRI-only markers of neuroinflammation (non-specific) |
| **Clinical Use Status** | **Research-Only** — TSPO PET is research/clinical trial tool; **Diagnostic (adjunctive)** — Contrast enhancement for active inflammation; **Research-Only** — TSPO as trial endpoint for anti-inflammatory therapies |
| **Quantification Method** | TSPO PET: SUV, VT (distribution volume), BPND (binding potential); Contrast-enhanced T1 for BBB breakdown; DTI free water for interstitial fluid; FLAIR periventricular signal quantification; Z-score atrophy maps |
| **Key References (PMID)** | 26541813 (TSPO PET review neuroinflammation); 31320791 (TSPO PET neurodegenerative disorders); 30648799 (TSPO imaging animal models); 33726855 (TSPO PET/MR in NPSLE); 29582796 (Second-generation TSPO ligands) |
| **Safe Report Wording** | "Conventional structural MRI cannot directly visualize microglial activation. FLAIR hyperintensities in periventricular and subcortical white matter may reflect gliosis and chronic inflammatory changes but are non-specific. TSPO PET is required for in vivo microglial imaging and remains primarily a research tool." |
| **DeepSynaps Integration** | **Level 2 (Pipeline)** — Periventricular WMH quantification, contrast enhancement mapping; **Level 3 (Research)** — TSPO PET/MR co-registration, free water estimation as inflammation proxy |

### Evidence Summary
- **TSPO PET**: The gold standard in vivo biomarker for neuroinflammation. TSPO (18-kDa translocator protein) is upregulated in activated microglia, astrocytes, and macrophages. Over 60 second-generation radioligands have been developed (improving on [11C]-PK11195). Demonstrated increased binding in AD, PD, MS, stroke, and autoimmune encephalitis.
- **Limitations**: TSPO expression is not specific to pro-inflammatory M1 microglia — also expressed in anti-inflammatory phenotypes and reactive astrocytes. The A147T TSPO polymorphism affects ligand binding affinity, requiring genotyping for accurate quantification. Cannot reliably detect modest or diffuse neuroinflammation in chronic neurodegeneration.
- **Structural MRI proxies**: Periventricular WMH, contrast enhancement (blood-brain barrier breakdown), and regional volume loss are indirect markers but lack specificity for inflammatory vs. neurodegenerative processes.
- **Emerging**: Novel PET targets beyond TSPO (P2X7R, COX-2, CB2 receptor) are being developed for more specific microglial phenotyping.

---

## 12. Demyelination / Multiple Sclerosis

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | T2 lesion burden, T1 hypointense lesions ("black holes"), gadolinium-enhancing lesions, DTI FA/MD (lesions + NAWM/NAGM), magnetization transfer ratio (MTR), atrophied lesion volume (ALV), slowly expanding lesions (SELs), iron rim lesions, brain/spinal cord atrophy |
| **Evidence Strength** | **A** — T2 lesion burden for diagnosis (McDonald criteria); **A** — Brain atrophy for disability prediction; **B** — DTI FA/MD for microstructural damage; **B** — MTR for myelin content; **B** — ALV as cumulative damage marker; **C** — Iron rim lesions for smoldering inflammation |
| **Clinical Use Status** | **Diagnostic** — MRI is central to MS diagnosis ( dissemination in space/time per McDonald criteria); **Monitoring** — Annual MRI for treatment response (NEDA-3 includes MRI); **Research-Only** — MTR, DTI, ALV as trial endpoints |
| **Quantification Method** | T2 lesion count/volume (3D FLAIR); Gd-enhancing lesion count; T1 black hole volume; DTI FA/MD in lesions/NAWM/NAGM; MTR (whole brain, ROI-based); ALV (CSF-filled cavity within prior lesions); Iron rim detection (7T SWI/QSM); Brain atrophy (BPF, SIENA) |
| **Key References (PMID)** | 30154853 (McDonald criteria 2017); 30091893 (Atrophied lesion volume MS); 33726855 (Iron rim lesions progressive MS); 22572463 (MTR myelin content review); 26068549 (DTI in MS review); 25277767 (Brain atrophy as disability predictor) |
| **Safe Report Wording** | "Multiple hyperintense white matter lesions are identified on FLAIR, with [N] gadolinium-enhancing lesions indicating active inflammation. T1 hypointense ('black hole') lesions are present, representing areas of axonal loss. Brain atrophy [is/is not] accelerated relative to age-matched norms. These findings are consistent with [active/stable] demyelinating disease and should be correlated with clinical assessment and CSF analysis." |
| **DeepSynaps Integration** | **Level 1 (Native)** — Lesion segmentation (T2, Gd-enhancing), brain atrophy quantification (SIENA); **Level 2 (Pipeline)** — DTI FA/MD mapping, MTR analysis; **Level 3 (Research)** — ALV quantification, iron rim detection, longitudinal lesion evolution tracking |

### Evidence Summary
- **T2 lesion burden**: Core diagnostic criterion (DIS — dissemination in space). Total T2 lesion volume correlates with disease duration and relapse history. However, poor correlation with current disability (clinico-radiological paradox).
- **T1 black holes**: Markers of severe neuroaxonal damage; predict sustained disability. Chronic T1 hypointense lesions represent areas of irreversible tissue destruction.
- **Brain atrophy**: Strong predictor of long-term disability and cognitive impairment in MS. Cortical and thalamic atrophy are particularly prognostic. Annual brain atrophy rate is ~0.5-1.0% in MS vs. ~0.1-0.3% in healthy aging.
- **DTI**: Reduced FA and increased MD in lesions and NAWM reflect widespread demyelination and axonal degeneration. MD may be more sensitive than FA for early damage detection.
- **MTR**: Quantifies myelin content by measuring exchange between macromolecule-bound and free water protons. Reduced MTR in lesions and NAWM indicates demyelination. More pronounced reductions in SPMS than RRMS.
- **Emerging markers**: Slowly expanding lesions (SELs) represent chronic active plaques with peripheral expansion; iron rim lesions (paramagnetic rims) are specific to progressive MS and correlate with aggressive disease course; atrophied lesion volume (ALV) shows stronger correlation with disability than lesion count alone.

---

## 13. Brain Age

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Brain-predicted age difference (brain-PAD / brain age gap), machine learning predicted age from T1-weighted MRI, regional brain age estimates |
| **Evidence Strength** | **B** — Brain age prediction accuracy (MAE 2.5-4 years with 3T T1); **B** — Brain-PAD increases in AD, PD, MCI, TBI; **C** — Brain age as diagnostic/prognostic biomarker (emerging) |
| **Clinical Use Status** | **Research-Only** — Not yet approved for clinical use; **Emerging** — Screening tool for neurodegenerative risk in routine clinical MRI; **Research-Only** — Brain-PAD as trial endpoint |
| **Quantification Method** | Machine learning (CNN: 3D DenseNet, VGG, ResNet) trained on healthy T1 MRI to predict age; Brain-PAD = predicted age - chronological age; Regional brain age decomposition; Z-score mapping of regional deviations |
| **Key References (PMID)** | 30472641 (Cole: brain age prediction review); 34253812 (Brain age in neurodegeneration review); 31088993 (Cole brain age prediction accuracy); 37289192 (Brain age gap predicts WMH progression); 39540766 (Deep learning brain age routine clinical MRI MAE 2.59y); 37865473 (Brain age prediction accuracy 3.68 years on clinical 2D MRI) |
| **Safe Report Wording** | "Brain age estimation is an investigational computational biomarker. The predicted brain age of [X] years (chronological age: [Y] years) yields a brain age gap of [X-Y] years. A positive gap (older-appearing brain) has been associated with increased risk of neurodegenerative conditions in research studies but should not be used as a standalone diagnostic tool." |
| **DeepSynaps Integration** | **Level 2 (Pipeline)** — Brain age prediction via pre-trained CNN models; **Level 3 (Research)** — Regional brain age decomposition, longitudinal brain-PAD tracking, normative comparison across scanners |

### Evidence Summary
- **Prediction accuracy**: State-of-the-art 3D CNN models achieve mean absolute error (MAE) of 2.5-4 years on research-grade 3T T1 MRI. Recent advances enable similar accuracy (MAE 2.59-3.68 years) on routine clinical 2D axial T1 scans using transfer learning from 3D models.
- **Disease associations**: Brain-PAD is increased in: AD (mean gap 5-10 years), MCI (3-5 years), PD (2-3 years), TBI (variable, severity-dependent), schizophrenia, and major depression. Longitudinal studies show brain-PAD increases with disease progression.
- **Clinical potential**: Brain age gap correlates with MMSE scores in AD cohorts and may serve as a screening tool for neurodegenerative disease risk during routine clinical examinations. However, correlation with cognition is modest and not always statistically significant.
- **Limitations**: Lack of standardization across models, scanner-dependent bias, demographic bias in training data (predominantly European/North American), and the "black box" nature of deep learning models limit clinical adoption. Age bias correction is required when applying models to different age distributions.
- **Multimodal integration**: Combining structural MRI with fMRI, diffusion MRI, and EEG improves prediction accuracy and may capture distinct aging patterns not visible on T1 alone.

---

## 14. Atrophy Patterns

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Global brain atrophy (brain parenchymal fraction, ventricular volume), regional atrophy patterns (hippocampus, thalamus, striatum, cortex), z-score atrophy maps, rate of atrophy (longitudinal), BrainAGE |
| **Evidence Strength** | **A** — Hippocampal/medial temporal atrophy in AD; **A** — Brain atrophy in MS as disability predictor; **B** — Regional atrophy patterns for differential diagnosis (AD vs. FTD vs. DLB); **B** — Striatal-thalamic atrophy in Wilson disease and other basal ganglia disorders |
| **Clinical Use Status** | **Diagnostic** — Regional atrophy patterns support differential diagnosis; **Monitoring** — Longitudinal atrophy rates track disease progression; **Emerging** — Automated z-score atrophy maps for clinical reporting |
| **Quantification Method** | Brain parenchymal fraction (BPF = brain volume/ICV); SIENA (structural image evaluation using normalization) for longitudinal; Voxel-based morphometry (VBM); Region-specific volumetry (FreeSurfer, FIRST); Z-score atrophy maps (veganbagel, NeuroQuant); Visual rating (MTA score, Koedam score, GCA scale) |
| **Key References (PMID)** | 23984509 (Frisoni: atrophy patterns neurodegeneration review); 25130683 (Jack: AD biomarker temporal model); 25277767 (Brain atrophy MS disability); 22572463 (Atrophy pattern differential diagnosis); 30472641 (Cole: brain age gap as atrophy summary metric) |
| **Safe Report Wording** | "Regional brain volume analysis demonstrates [pattern of atrophy] with z-scores exceeding 2.5 standard deviations below age- and sex-matched norms in [regions]. This atrophy pattern is [non-specific/may be seen in conditions including list]. Correlation with clinical presentation, cognitive testing, and other biomarkers is essential for diagnostic interpretation." |
| **DeepSynaps Integration** | **Level 1 (Native)** — Global/regional volumetry, BPF calculation, longitudinal SIENA; **Level 2 (Pipeline)** — Z-score atrophy mapping against normative templates (ENIGMA, eNKI); **Level 3 (Research)** — Disease-specific atrophy pattern classification, atrophy rate modeling |

### Evidence Summary
- **Global atrophy**: Brain parenchymal fraction (BPF) is the most common global atrophy metric. Normal aging: ~0.1-0.3% annual brain volume loss. Neurodegenerative diseases: 0.5-2.0% annually (AD > PD > MS). Ventricular enlargement and sulcal widening are accompanying features.
- **Regional patterns**: 
  - **AD**: Medial temporal (hippocampus, entorhinal) -> lateral temporal -> parietal -> frontal (Braak staging pattern)
  - **FTD**: Frontal and anterior temporal atrophy (asymmetric in many cases)
  - **DLB**: Minimal atrophy early; mild global atrophy later; relative hippocampal sparing vs. AD
  - **PD**: Minimal cortical atrophy early; midbrain (SN) atrophy on NM-MRI; progressive cortical atrophy in PDD
  - **Vascular dementia**: Patchy atrophy with WMH, lacunes, and mixed patterns
- **Automated z-score maps**: Tools like veganbagel generate voxel-wise z-score maps comparing individual GM volumes to age- and sex-specific normative templates (e.g., eNKI dataset, n=1004). Voxels >2.5 SD below mean are flagged as atrophic.
- **Differential diagnosis value**: Atrophy patterns are among the most diagnostically informative MRI findings in neurodegeneration. AD-signature atrophy (medial temporal predominant) distinguishes AD from FTD (frontal predominant) and DLB (minimal atrophy).

---

## 15. Cortical Thickness Maps

| Field | Details |
|-------|---------|
| **MRI Marker(s)** | Regional cortical thickness (vertex-wise), mean cortical thickness, AD-signature cortical thickness (temporal-parietal-frontal), whole-cortex average thickness, cortical thinning rate (longitudinal) |
| **Evidence Strength** | **A** — AD-signature cortical thickness for AD diagnosis/progression (superior to hippocampal volume in some studies); **B** — Regional cortical thickness in MDD (frontal/temporal thinning); **B** — Cortical thickness in ASD (developmental alterations); **C** — Cortical thickness as treatment response predictor |
| **Clinical Use Status** | **Diagnostic (adjunctive)** — AD-signature thickness supports diagnostic workup; **Monitoring** — Longitudinal cortical thinning rates in clinical trials (anti-amyloid therapies); **Research-Only** — Psychiatric disorder cortical thickness mapping |
| **Quantification Method** | Surface-based morphometry (FreeSurfer: recon-all pipeline); Vertex-wise thickness mapping; ROI-based thickness averaging; AD-signature composite (entorhinal, inferior temporal, middle temporal, fusiform, precuneus, posterior cingulate); Longitudinal thickness change rates (recon-all -longitudinal) |
| **Key References (PMID)** | 33599936 (AD signature cortical thickness vs. CDR prediction); 33599936 (AIC comparison: CT 1903 vs HV 2293 vs BrainAge 2533); 18083772 (Cortical thickness MDD meta-analysis); 26068827 (Cortical thickness ASD meta-analysis); 33599936 (Cortical thickness race/ethnicity interaction effects) |
| **Safe Report Wording** | "Cortical thickness mapping reveals [regional pattern] with [regions] showing [increased/decreased] thickness relative to age- and sex-matched norms. Cortical thickness findings should be interpreted cautiously as they can be influenced by scanner, sequence, analytical pipeline, and demographic factors. Clinical correlation is required." |
| **DeepSynaps Integration** | **Level 1 (Native)** — Full FreeSurfer cortical thickness pipeline, vertex-wise mapping; **Level 2 (Pipeline)** — AD-signature composite calculation, longitudinal thickness change; **Level 3 (Research)** — Disease-specific cortical thickness pattern classification, scanner harmonization (ComBat) |

### Evidence Summary
- **AD-signature cortical thickness**: A composite of thickness in entorhinal, inferior/middle temporal, fusiform, precuneus, and posterior cingulate cortices. Has better model fit than hippocampal volume alone for predicting CDR status (AIC 1903 vs. 2293). Also outperforms brain age and whole-cortex thickness measures. The model showed significant interaction with race/ethnicity, indicating the relationship between cortical thickness and CDR is stronger in non-Hispanic White compared with Mexican American or non-Hispanic Black participants.
- **Cortical thickness in MDD**: Meta-analyses demonstrate cortical thinning in dorsolateral prefrontal cortex, anterior cingulate, and temporal regions. Thinning correlates with illness duration and cognitive impairment. Some studies report cortical thickening in early-onset or first-episode patients, suggesting a dynamic process.
- **Cortical thickness in ASD**: Findings are age-dependent. Early childhood: increased cortical thickness in frontal and temporal regions (consistent with brain overgrowth). Adolescence/adulthood: may normalize or show regional thinning. Surface area and cortical folding patterns may be more informative than thickness alone.
- **Technical considerations**: Cortical thickness measurement is sensitive to MRI field strength, sequence parameters (MPRAGE vs. SPGR), scanner manufacturer, and analytical pipeline (FreeSurfer version). Cross-scanner harmonization (ComBat) is essential for multi-site studies.
- **Longitudinal tracking**: Annual cortical thinning rates of 0.01-0.05 mm in AD-vulnerable regions can be tracked. Anti-amyloid therapies are being evaluated for their ability to slow cortical thinning rates, making this a key clinical trial endpoint.

---

## Appendix A: Evidence Grading Criteria

| Grade | Definition | Study Requirements |
|-------|-----------|-------------------|
| **A** | Strong evidence | Multiple large meta-analyses or RCTs with consistent findings; n>1000; established clinical utility |
| **B** | Moderate evidence | Meta-analyses or several well-powered studies; n=200-1000; emerging clinical utility |
| **C** | Limited evidence | Small number of studies or small sample sizes; n<200; primarily research context |
| **D** | Preliminary evidence | Case series, pilot studies, or preclinical data; hypothesis-generating |

## Appendix B: DeepSynaps Integration Levels

| Level | Description | Requirements |
|-------|-------------|--------------|
| **Level 1 (Native)** | Fully integrated into core platform; automated processing available | Validated pipeline, normative data, clinical report generation |
| **Level 2 (Pipeline)** | Available as add-on module; requires configuration | Research-validated method, may need specific sequences or post-processing |
| **Level 3 (Research)** | Experimental/developmental feature; limited availability | Ongoing validation, may require research collaboration or specialized hardware |

## Appendix C: Key Abbreviations

| Abbreviation | Definition |
|-------------|------------|
| AD | Alzheimer's Disease |
| ADC | Apparent Diffusion Coefficient |
| AI | Asymmetry Index |
| ALV | Atrophied Lesion Volume |
| BPF | Brain Parenchymal Fraction |
| CMB | Cerebral Microbleed |
| CST | Corticospinal Tract |
| CSVD | Cerebral Small Vessel Disease |
| CT | Cortical Thickness |
| DTI | Diffusion Tensor Imaging |
| FA | Fractional Anisotropy |
| FCD | Focal Cortical Dysplasia |
| FLAIR | Fluid Attenuated Inversion Recovery |
| GM | Gray Matter |
| HS | Hippocampal Sclerosis |
| MD | Mean Diffusivity |
| MDD | Major Depressive Disorder |
| MCI | Mild Cognitive Impairment |
| MTR | Magnetization Transfer Ratio |
| NAWM | Normal Appearing White Matter |
| NM | Neuromelanin |
| PD | Parkinson's Disease |
| PTSD | Post-Traumatic Stress Disorder |
| QSM | Quantitative Susceptibility Mapping |
| ROI | Region of Interest |
| SEL | Slowly Expanding Lesion |
| sgACC | Subgenual Anterior Cingulate Cortex |
| SN | Substantia Nigra |
| SWI | Susceptibility Weighted Imaging |
| TSPO | Translocator Protein (18 kDa) |
| WMH | White Matter Hyperintensity |

## Appendix D: Consolidated Reference List

| PMID | Reference |
|------|-----------|
| 15056570 | Videbech P, Ravnkilde B. Hippocampal volume and depression: a meta-analysis of MRI studies. Am J Psychiatry. 2004;161(11):1957-66. |
| 18031762 | Campbell S, Marriott M, Nahmias C, et al. Lower hippocampal volume in patients suffering from depression: a meta-analysis. Am J Psychiatry. 2004;161(4):598-607. |
| 23296164 | Hibar DP, et al. (ENIGMA-AD). Alzheimer's disease risk gene and hippocampal volume. Brain Imaging Behav. 2013. |
| 25179656 | Hoogman M, et al. (ENIGMA-ADHD). Subcortical brain volume differences in ADHD. Lancet Psychiatry. 2017;4(4):310-319. |
| 25266128 | Norman LJ, et al. Structural and Functional Brain Abnormalities in ADHD and OCD: A Comparative Meta-analysis. JAMA Psychiatry. 2016;73(8):815-825. |
| 25050531 | Smith ME. Bilateral hippocampal volume reduction in adults with post-traumatic stress disorder: a meta-analysis of structural MRI studies. Psychiatry Res. 2005. |
| 30472641 | Cole JH, Franke K. Predicting age using neuroimaging: innovative brain ageing biomarkers. Trends Neurosci. 2017;40(12):681-690. |
| 32583681 | Mahlknecht P, et al. Meta-analysis of dorsolateral nigral hyperintensity on magnetic resonance imaging as a marker for Parkinson's disease. Mov Disord. 2020. |
| 32926188 | Debette S, Markus HS. The clinical importance of white matter hyperintensities on brain MRI. BMJ. 2010;341:c3666. |
| 33599936 | Staffaroni AM, et al. AD signature cortical thickness, CDR, and ethnicity. Hum Brain Mapp. 2025. |
| 33901866 | Kwon DH, et al. Seven-Tesla magnetic resonance images of the substantia nigra in Parkinson disease. Ann Neurol. 2012;71(2):267-77. |
| 34253812 | Václavík J, et al. Brain age prediction from MRI scans in neurodegenerative diseases. Curr Opin Neurol. 2024;37(4):298-305. |
| 39539152 | Subgenual anterior cingulate cortex in major depression: systematic review and meta-analysis. Transl Psychiatry. 2025. |
| 39540766 | Novel deep learning-based brain age prediction framework for routine clinical MRI scans. npj Mental Health Res. 2025. |
| 21082776 | Hay J, et al. A Review of MRI and DTI Findings in Mild TBI. Brain Imaging Behav. 2010. |
| 27558332 | Kumar P, et al. Prediction of upper limb motor recovery after subacute ICH through DTI: systematic review and meta-analysis. Neuroradiology. 2016. |
| 27549675 | Aoki Y, et al. Comparison of white matter integrity between autism spectrum disorder subjects and typically developing individuals: a meta-analysis of diffusion tensor imaging tractography studies. Mol Autism. 2013. |
| 30154853 | Thompson AJ, et al. Diagnosis of multiple sclerosis: 2017 revisions of the McDonald criteria. Lancet Neurol. 2018;17(2):162-173. |
| 31320791 | Lavisse S, et al. TSPO PET imaging as a biomarker of neuroinflammation in neurodegenerative disorders. Neurobiol Dis. 2020. |
| 37289192 | DTI free water predicts progression of FLAIR WMH after ischemic stroke. Front Neurol. 2023. |
| 38284564 | ENIGMA-ASD working group. Gray matter covariations in autism: out-of-sample replication. 2024. |
| 10502888 | Courchesne E, et al. Evidence of brain overgrowth in the first year of life in autism. JAMA. 2001;290(3):337-44. |
| 18977336 | Wardlaw JM, et al. Neuroimaging standards for research into small vessel disease (STRIVE). Lancet Neurol. 2013;12(8):822-38. |
| 30747927 | Spitzer H, et al. A Quantitative Imaging Biomarker for HS from DL-based Segmentation. Front Neurol. 2022. |

---

*This evidence matrix is intended for research and educational purposes. Clinical decisions should not be based solely on MRI biomarkers but must integrate clinical assessment, laboratory findings, and patient context. All biomarkers described should be interpreted by qualified healthcare professionals.*

*Document generated by DeepSynaps Protocol Studio — Neuroimaging Research Division*
