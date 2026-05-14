# DeepSynaps Voice Analyzer: Clinical Voice Biomarker Evidence Intelligence Report

> **Document Version:** 1.0
> **Date:** July 2025
> **Classification:** Research Evidence Synthesis for Clinical Voice Biomarker Platform
> **Evidence Grading:** A=Meta-analysis/Systematic Review, B=RCT/Controlled Trial, C=Observational/Cross-sectional, D=Case series/Expert opinion

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Voice Biomarker Evidence Matrix](#2-voice-biomarker-evidence-matrix)
3. [Task 1: Depression Voice Biomarkers](#3-task-1-depression-voice-biomarkers)
4. [Task 2: Parkinson's Voice/Dysphonia](#4-task-2-parkinsons-voicedysphonia)
5. [Task 3: Dementia/MCI Speech Markers](#5-task-3-dementiamci-speech-markers)
6. [Task 4: Anxiety/PTSD Voice](#6-task-4-anxietyptsd-voice)
7. [Task 5: Safety & Ethics in Voice AI](#7-task-5-safety--ethics-in-voice-ai)
8. [Task 6: Open Source Integration Stack](#8-task-6-open-source-integration-stack)
9. [Acoustic Feature Engineering Spec](#9-acoustic-feature-engineering-spec)
10. [UX Benchmark Findings](#10-ux-benchmark-findings)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Sources & Citations](#12-sources--citations)

---

## 1. Executive Summary

### Key Findings

This report synthesizes current clinical evidence for voice biomarkers across neuropsychiatric and neurological conditions based on systematic reviews, meta-analyses, and recent primary research (2023-2025).

**Strongest Evidence Bases:**

| Condition | Evidence Level | Key Features | Clinical Readiness |
|-----------|---------------|--------------|-------------------|
| **Alzheimer's Disease** | A (Meta-analysis) | Speech rate, articulation rate, voice breaks, nPVI | Screening support tool |
| **Depression** | A (Meta-analysis) | Pause duration, speech rate, CPP, pitch variability | Monitoring/screening adjunct |
| **Parkinson's Disease** | B (Longitudinal) | Vowel articulation (VSA/VAI), shimmer, NHR, speech rate | Disease progression tracking |
| **Schizophrenia Spectrum** | B (ML classifier) | Pause patterns, F2 bandwidth, spectral features, ACF | Diagnostic aid (research) |
| **Anxiety Disorders** | C (Observational) | F0 slope, pitch range, F1, MFCC1 variability | Early detection (research) |
| **PTSD** | C (ML classifier) | F0 envelope, MFCC, LSP, HNR (sex-specific) | Classification research |

**Critical Safety Conclusions:**
- **NO voice biomarker is FDA-approved or CE-marked for clinical diagnosis** as of 2025
- **Suicide prediction from voice is NOT clinically validated** - AUCs of 0.62-0.67, severe methodological limitations
- All voice biomarkers require **clinician oversight** and should serve as **adjuncts**, not replacements
- **Demographic bias** (gender, age, accent, language) is a major threat to generalizability

---

## 2. Voice Biomarker Evidence Matrix

### 2.1 Master Evidence Matrix: Condition x Feature x Grade

| Condition | Acoustic Feature | Direction in Disease | Evidence Grade | Key Source |
|-----------|-----------------|---------------------|----------------|------------|
| **Depression** | F0 (fundamental frequency) | Decreased (~1.82 Hz, NS in meta-analysis) | A (Meta-analysis, n=17 studies) | Cantor-Cutiva et al., 2026 |
| **Depression** | Speech rate | Decreased | A (Multiple studies) | Menne et al., 2024; Nature 2025 |
| **Depression** | Pause duration | Increased | A (RCT replication) | Mundt et al., PMC 2012; Greden 1980 |
| **Depression** | CPP (Cepstral Peak Prominence) | Decreased (highly significant) | B (Controlled study) | PMC10715859, 2023 |
| **Depression** | Jitter | Mixed/Increased (inconsistent) | C (Heterogeneous) | Multiple |
| **Depression** | Shimmer | Mixed (inconsistent across studies) | C (Heterogeneous) | Multiple |
| **Depression** | HNR | Decreased (trend, inconsistent) | C (Heterogeneous) | Multiple |
| **Depression** | MFCCs | Altered (MFCC3, MFCC5, MFCC7 decreased) | B | PMC6794822 |
| **Depression** | Switching pauses | Increased (3x vs controls, p<0.001) | B | PMC10715859 |
| **Parkinson's Disease** | Shimmer | Increased | B (Longitudinal) | Nature 2025, s41531 |
| **Parkinson's Disease** | NHR (Noise-to-Harmonics Ratio) | Increased | B (Longitudinal) | Nature 2025, s41531 |
| **Parkinson's Disease** | Vowel Articulation (VSA, VAI) | Decreased (progressive) | B (Longitudinal, ~33 mo) | Nature 2025, s41531 |
| **Parkinson's Disease** | Net speech rate | Decreased | B (Longitudinal) | Nature 2025, s41531 |
| **Parkinson's Disease** | Stop consonant articulation | Impaired | B (Longitudinal) | Nature 2025, s41531 |
| **Parkinson's Disease** | Pause ratio | Increased (correlates with disease stage) | B | Nature 2025, s41531 |
| **Alzheimer's Disease** | Speech rate | Decreased (MD=0.64, p=0.01) | A (Meta-analysis, n=11) | Saeedi et al., JPAD 2024 |
| **Alzheimer's Disease** | Articulation rate | Decreased (MD=0.30, p=0.0002) | A (Meta-analysis) | Saeedi et al., JPAD 2024 |
| **Alzheimer's Disease** | Voice breaks | Increased (MD=11.58%, p<0.0001) | A (Meta-analysis) | Saeedi et al., JPAD 2024 |
| **Alzheimer's Disease** | nPVI (rhythm variability) | Increased (MD=-5.83, p<0.0001) | A (Meta-analysis) | Saeedi et al., JPAD 2024 |
| **Alzheimer's Disease** | Mean speech segment duration | Decreased (MD=0.57s, p=0.0003) | A (Meta-analysis) | Saeedi et al., JPAD 2024 |
| **MCI** | Pause frequency/duration | Increased (predicts future dementia) | B (Longitudinal) | PMC12293195, 2024 |
| **MCI** | Formant frequencies (F1, F2) | Altered | B (Large-scale, n=8779) | Nagumo et al. |
| **Dementia (general)** | Lexical diversity | Decreased (type-token ratio) | B (ML + statistical) | arXiv 2602.11028, 2025 |
| **Dementia (general)** | Syntactic complexity | Reduced | B | arXiv 2602.11028, 2025 |
| **Dementia (general)** | Functional word usage | Altered | B | arXiv 2602.11028, 2025 |
| **Anxiety** | F0 slope | Reduced (males) | C (Observational, n=581) | Ciampelli et al., Psychol Med 2025 |
| **Anxiety** | Pitch range | Narrower (males) | C | Ciampelli et al., 2025 |
| **Anxiety** | F1 frequency | Lower (males) | C | Ciampelli et al., 2025 |
| **Anxiety** | MFCC1 variability | Greater (males) | C | Ciampelli et al., 2025 |
| **Anxiety** | Intensity | Decreased | C (Systematic review) | PMC12289014 |
| **Anxiety** | Pause duration | Increased | C (Systematic review) | PMC12289014 |
| **PTSD** | F0 envelope | Altered (top classifier feature) | C (ML, n=140) | ScienceDirect 2025 |
| **PTSD** | HNR | Lower in males vs females | C | Frontiers 2025 |
| **PTSD** | F2 frequency SD | Higher in males | C | Frontiers 2025 |
| **Schizophrenia** | Pause duration/number | Increased | A (Meta-analysis) | Parola et al.; Nature 2023 |
| **Schizophrenia** | Speech rate | Decreased | A (Meta-analysis) | Parola et al.; Nature 2023 |
| **Schizophrenia** | Proportion of spoken time | Decreased | A (Meta-analysis) | Parola et al. |
| **Schizophrenia** | F2 bandwidth | Altered | B (ML, n=284) | PMC10009369 |
| **Schizophrenia** | ACF (articulatory coordination) | Altered | B | Nature 2023, s41398 |

---

## 3. Task 1: Depression Voice Biomarkers

### 3.1 Evidence Synthesis

**Meta-Analysis Finding (Cantor-Cutiva et al., 2026 - Grade A):**
- 17 studies included; only 6 had sufficient data for meta-analysis of F0
- F0 decreased by 1.82 Hz in depression vs controls (NOT statistically significant, p=0.56)
- Substantial heterogeneity in methodologies across studies
- Only 1/17 studies achieved "strong" methodological rating; 8 "weak", 8 "moderate"
- Gender confounding could not be fully addressed due to incomplete sex-stratified reporting

**Key Depression Acoustic Features (Menne et al., 2024 - Grade B):**
| Feature | Finding | p-value | Notes |
|---------|---------|---------|-------|
| CPP | Decreased by ~50% in depression vs healthy | p<0.001 (strongly significant) | Best single predictor |
| Switching pauses | 3x longer in depressed patients | p<0.001 | Strong diagnostic signal |
| Speech rate | Decreased | p<0.05 | Psychomotor retardation marker |
| F0 SD | Reduced | p<0.05 | Reduced emotional prosody |
| Jitter | Increased (trend) | p<0.05 | Correlates with HRS-D |
| Shimmer | No significant difference | NS | Inconsistent in literature |
| HNR | No significant difference | NS | Inconsistent in literature |

**Established Temporal Markers (Nature 2025 - Grade A evidence synthesis):**
- Lower pitch consistently reported across studies [21-28]
- Less pitch variability [24,27]
- Slower speech rate [25,29-35]
- Longer pauses [25,34,36]
- Greater depression severity correlates with slower rate, longer pauses [29,37,39,41-43]

### 3.2 Depression Voice: Clinical Use Status

- **NOT FDA-approved** for depression diagnosis or monitoring
- **Research tool only** - requires clinician interpretation
- Most robust evidence for: **CPP, speech rate, pause duration, pitch variability**
- Jitter, shimmer, HNR show **inconsistent associations** across studies
- Recording conditions (lab vs. naturalistic) significantly affect results

### 3.3 Overclaim Risks

1. **F0 differences are NOT statistically significant** in meta-analysis - do not claim pitch reliably discriminates depression
2. **CPP shows the strongest and most consistent signal** but needs replication
3. **Methodological quality is poor** - 47% of studies rated "weak"
4. **Gender effects are substantial** but often unreported
5. **No longitudinal biomarker validation** exists for monitoring treatment response at scale

---

## 4. Task 2: Parkinson's Voice/Dysphonia

### 4.1 Evidence Synthesis

**Longitudinal Study (Nature npj Parkinson's Disease 2025 - Grade B):**
Speech and voice biomarkers show progressive decline over ~33 months:

| Feature | Finding | Clinical Correlation |
|---------|---------|---------------------|
| Vowel Articulation (tVSA, VAI) | Progressive impairment | Correlates with axial gait dysfunction (UPDRS) |
| Shimmer | Increased | Declines over disease course |
| NHR | Increased | Declines over disease course |
| Net speech rate | Decreased | Declines over disease course |
| Stop consonant articulation | Impaired | Declines over disease course |
| Pause ratio | Increased | Correlates with disease stage |
| % pauses in polysyllabic words | Increased | Correlates with disease stage |

**Key Finding:** Impaired voice and speech functions are present **even in mild PD** and continue to decline. Perceptual speech decline correlated with baseline Hoehn-Yahr stage and UPDRS motor scores.

**Digital Remote Monitoring (PMC 2025):**
- Roche-PD app: monotonicity and jitter correlated with clinical speech scores
- WATCH-PD study: pitch reduction noted even when MDS-UPDRS speech ratings were normal
- Smartphone-based reading and phonation tasks can differentiate early untreated PD from controls

### 4.2 Parkinson's Voice: Clinical Use Status

- **Research/Clinical trial use** - Roche-PD, WATCH-PD studies show promise
- **No FDA-approved voice biomarker** for PD diagnosis
- Smartphone-based tools are **most clinically ready** for remote monitoring
- Vowel articulation measures (VSA, VAI) are the **most sensitive progression markers**

---

## 5. Task 3: Dementia/MCI Speech Markers

### 5.1 Evidence Synthesis

**Meta-Analysis: Acoustic Speech Analysis in Alzheimer's Disease (Saeedi et al., JPAD 2024 - Grade A)**

11 studies, 1000 voice samples (386 AD, 614 HC), 7 acoustic parameters:

| Parameter | Mean Difference (HC vs AD) | 95% CI | p-value | Interpretation |
|-----------|---------------------------|--------|---------|----------------|
| Speech rate | 0.64 faster in HC | 0.13 to 1.15 | 0.0100 | Moderate evidence |
| Articulation rate | 0.30 faster in HC | 0.14 to 0.45 | 0.0002 | Strong evidence |
| Voice breaks | 11.58% less in HC | -14.77% to -8.38% | <0.0001 | Strongest evidence |
| nPVI | -5.83 in HC (less variable rhythm) | -7.50 to -4.15 | <0.0001 | Strongest evidence |
| Mean speech segment duration | 0.57s longer in HC | 0.26 to 0.88 | 0.0003 | Strong evidence |
| Mean pause duration | -0.30s (NS) | -0.71 to 0.10 | 0.1400 | No significant difference |
| Total duration | -24.83s (NS) | -67.98 to 18.32 | 0.2600 | No significant difference |

**Key categories by diagnostic potential:**
1. **Rate-related parameters** (speech rate, articulation rate): HIGHEST potential
2. **Interruption-related parameters** (voice breaks): HIGHEST potential  
3. **Temporal-related parameters** (mixed results): MODERATE potential

**MCI Longitudinal Evidence (PMC 2024):**
- Participants later diagnosed with dementia showed **increased hesitations and pause frequency** during spontaneous speech at preclinical stages
- Large-scale study (Nagumo et al., n=8779): ML model using formant frequencies, F0, pause features, syllable duration successfully differentiated MCI from controls

### 5.2 Linguistic Markers (DementiaBank Pitt Corpus Analysis, 2025)

| Feature Category | Finding in Dementia | Effect Size |
|-----------------|---------------------|-------------|
| Lexical diversity (type-token ratio) | Decreased | Large |
| Syntactic complexity | Reduced | Large |
| Auxiliary verb usage | Decreased | Strongest positive effect in controls |
| Pronoun usage | Increased | Large negative effect |
| Adverb usage | Increased | Large negative effect |
| Semantic coherence | Decreased | Moderate |
| Content word ratio | Decreased | Large |
| Mean sentence length | Shorter | Moderate |
| Interjections/punctuation | Increased (disfluency) | Moderate |

### 5.3 Dementia/MCI: Clinical Use Status

- **Most evidence-ready** biomarker category among all conditions reviewed
- Non-invasive, cost-effective screening approach
- **Rate-related and interruption-related features** have strongest meta-analytic support
- Integration with routine care requires **standardized speech tasks**
- Still **no FDA-approved** voice-based dementia screening tool

---

## 6. Task 4: Anxiety/PTSD Voice

### 6.1 Anxiety Evidence

**Systematic Review (PMC12289014 - Grade C):**

| Feature | Anxiety Finding | Studies Reporting |
|---------|----------------|-------------------|
| F0 | Mixed findings (correlated in some, NS in others) | Inconsistent |
| F1/F2 formants | Changes reported | 2 studies |
| Intensity | Decreased | 1 study |
| Pause duration | Increased | 1 study |
| Jitter | Associated | 2 studies |
| Shimmer | Associated | 2 studies |
| STE (short-term energy) | Increased | 1 study |

**Adolescent Anxiety Study (Ciampelli et al., Psychol Med 2025 - Grade C):**
- n=581 adolescents during Trier Social Stress Test
- Random Forest classifiers for Social Anxiety Disorder (SAD):
  - **Males: AUC-ROC 85%** (longitudinal prediction, 3 years ahead)
  - **Females: AUC-ROC 74%**
- Adding acoustic features increased variance explained by 5.4% (males) and 10.9% (females)
- **Sex-specific approaches are essential**

### 6.2 PTSD Evidence

**ML Classification Study (ScienceDirect 2025 - Grade C):**
- n=140 (77 PTSD, 63 healthy)
- Top features: F0 envelope, F0, MFCC, LSP, Probability of Voicing
- Binary classification model effectively distinguishes PTSD from healthy
- **Regression for severity (PCL-5 scores) has limited interpretability**

**Sex Differences in PTSD (Frontiers 2025 - Grade C):**
- DAIC-WOZ dataset (n=31 PTSD)
- **Males:** Lower HNR, higher F2 SD, lower F0 vs females with PTSD
- **Loudness SD** associated with PCL-C scores in males only
- Verb phrase usage, adposition rate, utterance duration show **opposite associations** by sex

### 6.3 Anxiety/PTSD: Clinical Use Status

- **Early research stage** - not ready for clinical deployment
- Sex differences are substantial and **must be accounted for** in any tool
- Social anxiety in adolescent males shows the **strongest predictive signal**
- PTSD severity prediction from voice remains **unreliable**

---

## 7. Task 5: Safety & Ethics in Voice AI

### 7.1 Suicide/Voice Research: CRITICAL SAFETY FINDINGS

**This section is of paramount importance. The evidence strongly cautions against using voice for suicide risk prediction.**

**Systematic Review (arXiv 2505.18195v1, 2025 - Grade A systematic review of limitations):**

| Limitation | Evidence |
|------------|----------|
| **Low AUC** | Between-person AUC only 0.62; within-person AUC 0.67 |
| **Small samples** | 81% of studies had <60 participants; 38% had <10 per group |
| **Lack of specificity** | Acoustic features (reduced F0, increased jitter) overlap with depression |
| **False positives** | 57% of "high-risk" cohorts defined by psychometric cutoffs with known low precision |
| **Methodological heterogeneity** | Different features, tasks, recording conditions across studies |
| **English-speaking bias** | Limited representation from other linguistic/cultural backgrounds |
| **Cross-sectional designs** | Cannot capture dynamic changes in suicidal risk over time |

**Key Studies with Critical Limitations:**

1. **PMC11041425 (Review, 2021):**
   - Only 43% (9/21) of studies used truly imminent suicide risk cohorts
   - 57% used psychometric test cutoffs (Beck Depression Inventory, HDRS) - scales with known low predictive validity
   - Small sample research = reduced power, low reproducibility

2. **PMC10131783 (Case-control, 2022):**
   - High accuracy claims but AUC only 0.62-0.67
   - "Low AUC values suggest results may not be generalizable to larger populations"
   - SMOTE and small sample size may contribute to overfitting

3. **PMC12356671 (ML Study, 2025):**
   - Acoustic features susceptible to environmental noise, recording equipment quality
   - Features vary by gender and age, complicating generalizability
   - Features may reflect fatigue or illness, not suicide risk specifically
   - Word frequency features fail to capture contextual word relationships

**CRITICAL SAFETY POSITION:**
- **Voice CANNOT predict suicide.** The evidence does not support this claim.
- AUCs of 0.62-0.67 are **barely above chance** for such a high-stakes prediction
- **False positives** could cause unnecessary psychiatric holds, trauma, and resource waste
- **False negatives** could lead to missed at-risk individuals
- Any suicide risk assessment **must remain with trained clinicians** using validated instruments (C-SSRS, Columbia Scale)

### 7.2 Voice AI Bias and Fairness

**Comprehensive Survey (arXiv 2605.01597v1, 2026):**

| Bias Source | Impact | Mitigation Strategy |
|-------------|--------|---------------------|
| **Accent/Non-native speech** | ASR WER increases 5-15% for non-native accents | Cross-lingual voice conversion, targeted fine-tuning |
| **Gender** | F0-based features confounded by biological sex | Sex-stratified analysis, gender-specific models |
| **Age** | Elderly and child speech underrepresented | Age-conditional adapters, data augmentation |
| **Language** | 99+ languages for Whisper but quality varies enormously | Language-specific validation before deployment |
| **Disordered speech** | Dysarthria, stuttering cause elevated false positives | StutterAug, disorder-specific training data |
| **Socioeconomic** | Dataset collection biases toward educated populations | Participatory collection, community engagement |

**Key Fairness Principles (ACL 2025):**
- Fairness must be treated as a **generalization problem**, not just in-domain optimization
- Methods that appear fair in-domain can become **least fair under distribution shift**
- Contrastive learning for gender-invariant representations shows promise
- **No single metric captures fairness** - must evaluate across multiple domains

### 7.3 Ethical, Legal, Social Implications (ELSIs)

**Scoping Review (PMC12930345, 2025):**

| Domain | Key Concerns |
|--------|-------------|
| **Privacy** | Voice is biometrically unique; breach risk includes doxing, misrepresentation |
| **Informed Consent** | Unique properties of voice require adapted consent frameworks |
| **Vulnerable Populations** | Exclusion of those with communication disorders, cognitive impairment, acute psychiatric conditions |
| **Discrimination** | Risk of predatory practices, especially for mental health conditions |
| **Regulatory Gaps** | Unclear frameworks, conflicting jurisdictional mandates |
| **Data Ownership** | Challenges in defining who owns voice data |
| **Dataset Bias** | Overrepresentation of "typical adult speakers" and men; underrepresentation of minorities |

**Regulatory Requirements (Multi-jurisdiction):**
- **EU:** GDPR requires explicit consent, data protection impact assessments for voice at scale
- **US FDA:** No voice biomarker currently approved; clinical trials and CE marking/FDA certification required
- **India DPDP Act 2023:** Free, informed, specific, unambiguous consent required for voice data
- **General:** "Intend-to-use" definition must be established early; clinical evaluation requirements vary

### 7.4 Governance Framework

Pre-deployment requirements:
1. **Adversarial testing** for hallucination triggers
2. **Consent workflow verification** across all applicable jurisdictions
3. **Accuracy testing** across diverse accent and speech profiles
4. **Bias testing results** and ongoing fairness metrics
5. **Real-time supervision** infrastructure for high-risk statements
6. **Escalation workflows** for critical issue detection
7. **Compliance documentation:** consent management, bias testing, fairness metrics, incident response

---

## 8. Task 6: Open Source Integration Stack

### 8.1 Core Feature Extraction Tools

#### openSMILE (Feature Extraction Engine)
- **License:** Open-source (academic/individual free; commercial requires license)
- **Language:** C++ core; Python wrappers available
- **Key Features:**
  - GeMAPS (Geneva Minimalistic Acoustic Parameter Set) - standardized 62 features
  - eGeMAPS (extended) - 88 features
  - MFCCs, pitch (F0), jitter, shimmer, HNR, formants, loudness
  - On-line incremental processing + off-line batch processing
  - Unit-tested numeric compatibility
- **Clinical Use:** Most widely used in clinical speech research
- **Evidence Base:** Used in schizophrenia (86.2% accuracy), depression, PTSD studies
- **Installation:** `pip opensmile` or compile from source

#### Praat (via Parselmouth)
- **License:** Praat (GPL); Parselmouth (MIT)
- **Language:** Python wrapper for Praat
- **Key Features:**
  - Gold-standard acoustic analysis in phonetics/linguistics
  - Pitch, formants, intensity, spectrograms, pulse detection
  - Voice report (jitter, shimmer, HNR, NHR, CPP)
  - Scripting automation
- **Clinical Use:** Used in Alzheimer's meta-analysis studies
- **Comparative Note:** Feature values may differ slightly from openSMILE due to different algorithms

#### Librosa
- **License:** ISC (permissive open source)
- **Language:** Python
- **Key Features:**
  - Music and audio analysis library
  - Spectral features, rhythm analysis, pitch detection
  - Good for MFCCs, spectral contrast, chroma features
  - Excellent for custom feature engineering
- **Clinical Use:** Good for spectrogram-based CNN approaches (87.8% accuracy in schizophrenia)

### 8.2 Speech Recognition & Transcription

#### OpenAI Whisper
- **License:** MIT (fully open source, commercial use permitted)
- **Sizes:** Tiny (39M) to Large-v3 (1.5B parameters)
- **Accuracy:** 2.7% WER (LibriSpeech clean); 8-12% (real-world)
- **Languages:** 99+ languages
- **Limitations:**
  - Hallucinates on silence
  - No native speaker diarization
  - No custom vocabulary boosting
  - Real-time streaming not native
- **Variants:** faster-whisper (4x speed), whisper.cpp (CPU-optimized), WhisperX (+diarization)

#### SpeechBrain
- **License:** Apache 2.0
- **Language:** Python (PyTorch-based)
- **Key Features:**
  - End-to-end speech processing (STT, NLP, TTS)
  - Pretrained models and recipes
  - Speaker recognition, emotion detection
  - Modular and extensible
- **Clinical Use:** Healthcare intake automation, call center analytics

### 8.3 Natural Language Processing

#### Stanza (Stanford NLP)
- **License:** Apache 2.0
- **Languages:** 66+ languages
- **Clinical Use:** POS tagging, sentiment analysis, dependency parsing for linguistic markers
- **Evidence:** Used in depression (Menne et al., 2024) and PTSD (Frontiers 2025) studies

### 8.4 Tool Comparison for Clinical Speech

| Tool | Best For | License | Clinical Validation | Speed |
|------|----------|---------|---------------------|-------|
| openSMILE | Standardized acoustic features | Academic/Commercial | Extensive | Fast |
| Praat/Parselmouth | Detailed phonetic analysis | MIT (wrapper) | Extensive | Moderate |
| Librosa | Custom spectral features | ISC | Moderate | Fast |
| Whisper | Transcription | MIT | Emerging | Model-dependent |
| SpeechBrain | End-to-end pipelines | Apache 2.0 | Emerging | Moderate |

### 8.5 Integration Architecture

```
Audio Input -> Preprocessing (VAD, noise reduction)
    |
    +---> openSMILE/Praat -> Acoustic Features (F0, jitter, shimmer, HNR, MFCCs, CPP)
    |                           |
    |                           +---> ML Classifier -> Biomarker Score
    |
    +---> Whisper -> Transcription -> Stanza NLP -> Linguistic Features
    |                                   (POS, sentiment, lexical diversity)
    |                                   |
    |                                   +---> ML Classifier -> Linguistic Score
    |
    +---> Combined Multimodal Score -> Clinical Dashboard
```

---

## 9. Acoustic Feature Engineering Spec

### 9.1 Recommended Feature Set (DeepSynaps Core)

Based on evidence synthesis, the following features are prioritized by clinical evidence strength:

#### Tier 1: Strongest Evidence (Implement First)

| Feature | Extraction Tool | Parameters | Evidence Grade |
|---------|----------------|------------|----------------|
| Speech rate (syllables/words per minute) | openSMILE/Praat | Standardized task required | A (AD, Depression) |
| Pause duration (total, mean, variability) | openSMILE GeMAPS | 200ms+ threshold | A (Depression, AD) |
| Pause rate (pauses per unit time) | openSMILE | Include/exclude filled pauses | A (Depression) |
| Articulation rate | Praat | Excluding pauses | A (AD) |
| CPP (Cepstral Peak Prominence) | Praat | Smoothed (CPPS) | B (Depression) |

#### Tier 2: Strong Evidence (Implement Second)

| Feature | Extraction Tool | Parameters | Evidence Grade |
|---------|----------------|------------|----------------|
| F0 (fundamental frequency) | openSMILE/Praat | Mean, SD, range, slope | A (NS in meta-analysis, but widely used) |
| F0 variability (SD, range) | openSMILE GeMAPS | Semitone scale | B (Depression, Anxiety) |
| Voice breaks (%) | Praat | Unvoiced segment detection | A (AD) |
| nPVI (normalized Pairwise Variability Index) | Custom/Praat | Rhythmic variability | A (AD) |
| Vowel Articulation (VSA, VAI) | Praat | /a/, /i/, /u/ formants | B (PD) |
| HNR (Harmonics-to-Noise Ratio) | openSMILE/Praat | Cepstral analysis | B (Mixed, PD) |

#### Tier 3: Moderate Evidence (Implement Third)

| Feature | Extraction Tool | Parameters | Evidence Grade |
|---------|----------------|------------|----------------|
| Jitter (local, ppq5, rap) | Praat | Cycle-to-cycle F0 variation | C (Inconsistent) |
| Shimmer (local, apq3, apq5, apq11) | Praat | Cycle-to-cycle amplitude variation | C (Inconsistent) |
| MFCCs (1-12) | openSMILE/Librosa | 26 Mel filters, 12 coefficients | B (Depression, PTSD) |
| Formants (F1, F2, F3) | Praat | Burg algorithm, max 5 formants | C (Anxiety, PTSD) |
| Spectral slope | openSMILE | 0-500Hz, 500-1500Hz | B (Schizophrenia) |
| Loudness (mean, SD, peaks) | openSMILE | Sone scale | B (Depression) |

#### Tier 4: Linguistic Features (Require Transcription)

| Feature | Extraction Method | Evidence Grade |
|---------|-------------------|----------------|
| Lexical diversity (type-token ratio, MTLD) | Stanza NLP | B (Dementia) |
| Syntactic complexity | Stanza POS parsing | B (Dementia) |
| Sentiment ratio | Stanza sentiment | C (Depression) |
| Word count/utterance duration | Whisper + counter | B (Depression, Dementia) |
| Proportion of filled pauses | Transcription analysis | B (Dementia) |
| Functional vs content word ratio | Stanza POS | B (Dementia) |

### 9.2 Standardized Speech Tasks

Evidence quality depends heavily on speech task standardization:

| Task | Conditions Measured | Evidence Strength |
|------|---------------------|---------------------|
| Sustained vowel phonation (/a/) | Voice quality (jitter, shimmer, NHR) | Strong (PD) |
| Standardized passage reading | Speech rate, articulation, pauses | Strong (AD, PD) |
| Picture description (Cookie Theft) | Lexical diversity, syntactic complexity | Strong (Dementia) |
| Spontaneous speech (interview) | Natural prosody, discourse coherence | Moderate |
| Emotion-elicited narrative | Emotional prosody, affective speech | Moderate (Depression) |
| Counting/serial speech | Motor speech, articulation precision | Moderate |

---

## 10. UX Benchmark Findings

### 10.1 Key UX Principles for Voice Biomarker Tools

Based on evidence synthesis and clinical workflow requirements:

| Principle | Rationale | Evidence Source |
|-----------|-----------|-----------------|
| **Task standardization is critical** | Results vary dramatically by speech task | Multiple meta-analyses |
| **Multiple recordings improve reliability** | Single-point assessment has high variance | Mundt et al. RCT |
| **Sex-stratified display** | Features differ significantly by biological sex | Ciampelli 2025; PTSD 2025 |
| **Age-normed percentiles** | Age effects confound disease-related changes | PMC12930345 |
| **No diagnostic claim** | All biomarkers are research-grade adjuncts | FDA status |
| **Trend visualization** | Longitudinal tracking more valuable than single point | Nature PD 2025; Mundt RCT |
| **Raw audio retention** | Required for clinical review, audit, transcription accuracy | Voice AI governance |
| **Recording quality feedback** | Noise, clipping, volume affect feature validity | PMC12356671 |
| **Multi-condition comparison** | Controls for baseline individual differences | WATCH-PD study |

### 10.2 Critical UX Safety Requirements

1. **NEVER display suicide risk score from voice data**
2. **Always include disclaimer:** "For research/support use only. Not a diagnostic tool."
3. **Require clinician login** for any clinical-facing features
4. **Show confidence intervals** not just point estimates
5. **Flag recording quality issues** before analysis
6. **Display population norm comparisons** with demographic matching
7. **Require minimum recording duration** (evidence-based thresholds)
8. **Provide audit trail** for all analyses

---

## 11. Implementation Roadmap

### P0: Foundation (Months 1-3)

| Feature | Rationale | Deliverable |
|---------|-----------|-------------|
| Audio capture pipeline with quality checks | Data quality is prerequisite | Recording module with SNR detection |
| openSMILE integration (GeMAPS) | Standardized, validated feature set | Core acoustic extraction engine |
| Praat/Parselmouth integration | Gold-standard phonetic analysis | Secondary validation pipeline |
| Whisper transcription | Linguistic feature prerequisite | Transcription engine |
| Basic pause/speech rate analysis | Strongest evidence (Grade A) | Depression/AD screening support |
| CPP extraction | Best single depression marker | Depression monitoring feature |
| User authentication & audit logging | Regulatory requirement | Security foundation |
| **CRITICAL: Safety framework** | Suicide/voice overclaim prevention | Policy document + code enforcement |

### P1: Core Biomarkers (Months 4-6)

| Feature | Rationale | Evidence Grade |
|---------|-----------|----------------|
| Full pause analysis (duration, rate, variability) | Grade A evidence | Depression, AD |
| Speech/articulation rate | Grade A evidence | AD, Depression, PD |
| Voice breaks detection | Grade A evidence (AD) | Dementia screening |
| nPVI (rhythmic variability) | Grade A evidence | Dementia screening |
| Vowel articulation (VSA, VAI) | Grade B evidence | Parkinson's monitoring |
| Jitter, shimmer, HNR | Grade B/C (inconsistent) | Voice quality screening |
| F0 analysis (mean, SD, range, slope) | Widely used | Multiple conditions |
| MFCC extraction | ML classifier input | Depression, PTSD |
| Lexical diversity (type-token ratio, MTLD) | Grade B evidence | Dementia screening |
| Sentiment analysis | Grade C | Depression support |
| **Demographic stratification** | Bias mitigation | All conditions |
| **Population norm database** | Interpretation support | All conditions |

### P2: Advanced Features (Months 7-12)

| Feature | Rationale | Status |
|---------|-----------|--------|
| Multimodal scoring (acoustic + linguistic) | Combined evidence | Research integration |
| Longitudinal trending | Treatment monitoring | Mundt RCT replicated |
| Machine learning classifiers | Automated screening support | Validate on holdout data |
| Parkinson's progression tracking | UPDRS correlation | Nature 2025 evidence |
| Dementia early detection panel | Multi-feature composite | Grade A evidence base |
| Sex-specific models | Essential for anxiety/PTSD | Ciampelli 2025 evidence |
| Multi-language support | Bias/fairness requirement | Whisper + Stanza |
| Formant analysis (F1, F2, F3) | Anxiety/PTSD markers | Grade C evidence |
| Spectral features (slope, contrast) | Schizophrenia markers | Grade B evidence |
| Clinical dashboard for providers | Workflow integration | UX evidence |
| FHIR/EHR integration | Clinical deployment | Regulatory requirement |

### P3: Scale & Validate (Months 13-18)

| Feature | Rationale |
|---------|-----------|
| Prospective clinical validation study | Required for credibility |
| Multi-site replication | Generalizability evidence |
| FDA pre-submission meeting | Regulatory pathway |
| CE marking process (EU) | European market |
| Real-world evidence collection | Post-market monitoring |
| Bias audit across demographics | Fairness validation |
| Clinician usability study | Workflow validation |
| Cost-effectiveness analysis | Payer reimbursement |

---

## 12. Sources & Citations

### Meta-Analyses & Systematic Reviews (Grade A)

1. Cantor-Cutiva LC, et al. "The Role of Voice Acoustics in Depression Assessment: Findings From Bibliometric Analysis, Literature Review, and Meta-Analysis." *Depression and Anxiety*, 2026;5592230. https://pmc.ncbi.nlm.nih.gov/articles/PMC13109622/

2. Saeedi S, et al. "Acoustic Speech Analysis in Alzheimer's Disease: A Systematic Review and Meta-Analysis." *J Prev Alzheimers Dis*, 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC11573841/

3. Parola A, et al. (Meta-analysis of acoustic features in SSD). Cited in: "Relative importance of speech and voice features in the classification of schizophrenia and depression." *Translational Psychiatry*, 2023. https://www.nature.com/articles/s41398-023-02594-0

4. "Acoustic and Machine Learning Methods for Speech-Based Suicide Risk Assessment: A Systematic Review." *arXiv:2505.18195v1*, 2025. https://arxiv.org/html/2505.18195v1

5. "Measuring negative emotions and stress through acoustic correlates in speech: A systematic review." *PMC12289014*, 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC12289014/

6. "Using voice and speech data in healthcare: a scoping review of the ethical, legal and social implications." *PMC12930345*, 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12930345/

7. "A Comprehensive Survey of Bias and Fairness in Speech AI." *arXiv:2605.01597v1*, 2026. https://arxiv.org/html/2605.01597v1

### Controlled Studies & Longitudinal Research (Grade B)

8. "Speech and language biomarkers for Parkinson's disease prediction, early diagnosis and progression." *npj Parkinson's Disease*, 2025. https://www.nature.com/articles/s41531-025-00913-4

9. Menne I, et al. "The voice of depression: speech features as biomarkers for major depressive disorder." *BMC Psychiatry*, 2024;24:794. https://pmc.ncbi.nlm.nih.gov/articles/PMC11559157/

10. "The Association between Depression Severity, Prosody, and Voice Acoustic Features in Women with Depression." *PMC10715859*, 2023. https://pmc.ncbi.nlm.nih.gov/articles/PMC10715859/

11. Mundt JC, et al. "Vocal Acoustic Biomarkers of Depression Severity and Treatment Response." *Biological Psychiatry*, 2012. https://pmc.ncbi.nlm.nih.gov/articles/PMC3409931/

12. "Listening to the Mind: Integrating Vocal Biomarkers into Digital Health." *PMC12293195*, 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC12293195/

13. "Linguistic Indicators of Early Cognitive Decline in the DementiaBank Pitt Corpus." *arXiv:2602.11028v1*, 2025. https://arxiv.org/html/2602.11028v1

14. "Acoustic speech markers for schizophrenia-spectrum disorders." *PMC10009369*. https://pmc.ncbi.nlm.nih.gov/articles/PMC10009369/

15. "Taking a look at your speech: identifying diagnostic status and negative symptoms of psychosis using CNNs." *PMC12237691*, 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12237691/

16. "Digital Technologies for Symptom Monitoring in Parkinson Disease." *PMC12960457*, 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12960457/

### Observational & ML Studies (Grade C)

17. "Acoustic differences between healthy and depressed people." *PMC6794822*. https://pmc.ncbi.nlm.nih.gov/articles/PMC6794822/

18. Ciampelli S, et al. "Cross-sectional and longitudinal associations between anxiety and acoustic-prosodic markers in adolescents." *Psychological Medicine*, 2025. https://pubmed.ncbi.nlm.nih.gov/41147220/

19. "Sex differences in PTSD speech biomarkers assessed by virtual agent-induced conversations." *Frontiers in Psychology*, 2025. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1509206/full

20. "Speech-based recognition and estimating severity of PTSD using machine learning." *ScienceDirect*, 2025. https://www.sciencedirect.com/science/article/abs/pii/S0165032724010735

21. "How Psychological Stress Affects Emotional Prosody." *PMC5089770*. https://pmc.ncbi.nlm.nih.gov/articles/PMC5089770/

22. "A Machine Learning-Based Case-Control Study on Suicide Risk Identification." *PMC12356671*, 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12356671/

23. "Acoustic Analysis of Speech for Screening for Suicide Risk." *PMC10131783*, 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC10131783/

24. "Detection of Suicide Risk Using Vocal Characteristics." *PMC11041425*, 2021. https://pmc.ncbi.nlm.nih.gov/articles/PMC11041425/

25. "Objective speech measures capture depressive symptoms and associated cognitive difficulties." *Nature Translational Psychiatry*, 2025. https://www.nature.com/articles/s41398-025-03728-2

### Tool Documentation & Technical References

26. Eyben F, et al. "openSMILE - The Munich Versatile and Fast Open-Source Audio Feature Extractor." *MM'10*, 2010. https://mediatum.ub.tum.de/doc/1082431/file.pdf

27. "Comparative Evaluation of Acoustic Feature Extraction Tools for Clinical Speech Analysis." *arXiv:2506.01129v1*, 2025. https://arxiv.org/html/2506.01129v1

28. "OpenAI Whisper Accuracy in 2026." *Novascribe*, 2026. https://novascribe.ai/how-accurate-is-whisper

29. "SpeechBrain: Open-Source AI Speech Toolkit." https://smallest.ai/voice-ai-apps/speechbrain

30. "Fairness in Automatic Speech Recognition Isn't a One-Size..." *ACL 2025*. https://aclanthology.org/2025.findings-emnlp.1044.pdf

### Regulatory & Governance

31. "Recommendations for Successful Implementation of the Use of Vocal Biomarkers." *J Med Internet Res*, 2022. https://www.i-jmr.org/2022/2/e40655/

32. "Voice AI Governance: Why Real-Time AI Agents Demand a Different Compliance Playbook." *Swept.ai*, 2026. https://www.swept.ai/post/voice-ai-governance-compliance-guide

33. "Your essential 2026 guide to voice AI compliance." *Speechmatics*, 2026. https://www.speechmatics.com/company/articles-and-news/your-essential-guide-to-voice-ai-compliance-in-todays-digital-landscape

34. "Voice Biomarkers predictive of Depression and Anxiety." *ClinicalTrials.gov*, NCT05455905. https://cdn.clinicaltrials.gov/large-docs/05/NCT05455905/Prot_000.pdf

---

## Appendix A: Evidence Quality Summary

| Condition | Highest Evidence Grade | Key Limitations | Clinical Readiness |
|-----------|----------------------|-----------------|-------------------|
| Depression | A (Meta-analysis) | Heterogeneous methods, NS F0 differences, weak study quality | Research adjunct |
| Parkinson's Disease | B (Longitudinal) | Limited progression tracking data | Monitoring support |
| Alzheimer's Disease | A (Meta-analysis) | Cross-sectional only, language-specific | Screening support |
| MCI | B (Longitudinal) | Limited longitudinal evidence | Early detection research |
| Schizophrenia | A (Meta-analysis) + B (ML) | Clinical implementation gaps | Diagnostic aid research |
| Anxiety | C (Observational) | Sex differences, limited replication | Research only |
| PTSD | C (ML classifiers) | Sex differences, small samples | Research only |
| Suicide Risk | C (Review) | **AUC 0.62-0.67, NOT clinically valid** | **NOT APPROPRIATE** |

## Appendix B: Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Suicide overclaim | CRITICAL | Explicit prohibition in code + policy |
| Diagnostic misrepresentation | HIGH | "Research use only" labels everywhere |
| Demographic bias | HIGH | Sex/age stratification, diverse validation |
| Recording quality artifacts | MEDIUM | Real-time quality feedback, exclusion criteria |
| Regulatory non-compliance | HIGH | Pre-submission consultation, documented governance |
| Data privacy breach | HIGH | Encryption, access controls, audit logging |
| False positive harm | HIGH | Confidence intervals, clinician review required |
| Generalization failure | MEDIUM | Multi-site validation, out-of-distribution testing |

---

> **Document End**
> 
> This report was compiled using evidence from PubMed/PMC, Nature Publishing Group, arXiv, Frontiers, and other peer-reviewed sources as of July 2025. All evidence grades reflect the quality of available research, not clinical endorsement. No voice biomarker is FDA-approved for clinical diagnosis as of the publication date.
