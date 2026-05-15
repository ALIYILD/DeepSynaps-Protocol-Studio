# qEEG Protocol Planning & Design Guide

## Comprehensive Research Document for Neurofeedback and Neuromodulation Protocol Selection

**Version:** 1.0  
**Date:** 2025  
**Scope:** qEEG-guided protocol selection, inhibitory/excitatory target logic, safety screening, training modalities (Alpha/Theta/Beta/SMR/SCP), qEEG-guided TMS/tDCS targeting, default mode network training, protocol rationale generation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [qEEG-Guided Protocol Selection Framework](#2-qeeg-guided-protocol-selection-framework)
3. [Inhibitory vs Excitatory Target Logic](#3-inhibitory-vs-excitatory-target-logic)
4. [Safety Screening & Spike/Epileptiform Exclusion](#4-safety-screening--spikeepileptiform-exclusion)
5. [Top 10 Protocol Approaches](#5-top-10-protocol-approaches)
6. [Alpha Training Protocols](#6-alpha-training-protocols)
7. [Theta Training Protocols](#7-theta-training-protocols)
8. [Beta Training Protocols](#8-beta-training-protocols)
9. [SMR Training Protocols](#9-smr-training-protocols)
10. [SCP Training Protocols](#10-scp-training-protocols)
11. [qEEG-Guided TMS/tDCS Targeting](#11-qeeg-guided-tmstdcs-targeting)
12. [Default Mode Network Training](#12-default-mode-network-training)
13. [Protocol Rationale Generation](#13-protocol-rationale-generation)
14. [References](#14-references)

---

## 1. Executive Summary

This document provides a comprehensive, evidence-based guide for neurofeedback and neuromodulation protocol planning based on quantitative EEG (qEEG) assessment. The integration of qEEG biomarkers with protocol selection enables individualized treatment targeting, improved response rates, and enhanced clinical outcomes across ADHD, anxiety, depression, PTSD, OCD, and other neuropsychiatric conditions.

**Key Finding:** QEEG-informed neurofeedback demonstrates superior response rates (76% achieving >=50% symptom reduction) compared to applying single protocols to entire populations. Individualized protocol assignment based on EEG subtypes directly improves treatment specificity and durability.

---

## 2. qEEG-Guided Protocol Selection Framework

### 2.1 Core Decision Architecture

qEEG-guided protocol selection operates through a structured decision pathway:

```
qEEG Assessment (EO + EC conditions)
    |
    v
EEG Subtype Classification
    |
    +---> Cortical Hypoarousal (excess theta, low beta, elevated TBR)
    |         |
    |         v
    |     Theta/Beta Protocol
    |
    +---> Delayed Maturation (excess slow-wave, decreased fast-wave)
    |         |
    |         v
    |     SMR Protocol
    |
    +---> Hyperarousal (elevated beta, decreased SCP amplitude)
    |         |
    |         v
    |     SCP Protocol
    |
    +---> Frontal Alpha Excess (mostly eyes-open)
    |         |
    |         v
    |     Frontal Alpha Protocol + Beta Reward
    |
    +---> Beta Spindles/Excess Beta
              |
              v
          Beta Downtraining Protocol
```

### 2.2 Arns QEEG-Informed Decision Model

The Arns model (Arns et al., 2012, 2014) provides an evidence-based framework:

| EEG Profile | Primary Protocol | Secondary Protocol | Target Sites |
|-------------|-----------------|-------------------|--------------|
| Excess fronto-central slowing (high theta, low beta) | Theta/Beta NF | Frontal alpha if excess alpha present | Fz, FCz, Cz |
| No clear QEEG deviations + sleep problems | SMR/SCP | Alpha uptraining at Pz (low-voltage EEG) | Cz, C3, C4, Pz |
| Excess fronto-central alpha (EO) | Frontal Alpha + Beta | Based on trainability | Fz, FCz, Cz |
| Beta spindles/excess beta | Beta Downtraining | EMG inhibit 55-100 Hz | Site of maximal beta |
| Hyperarousal profile | SCP NF | SMR if mu rhythm excess at C3/C4 | Cz |

### 2.3 Z-Score and LORETA-Guided Training

**Z-Score Neurofeedback (ZNFB):**
- Uses 19-channel real-time comparison with normative database
- Targets: amplitude, power ratios, coherence, phase
- Goal: Move dysregulated activity toward z=0 (normative range, typically +/- 1.5 SD)
- Training simultaneously addresses multiple variables across all channels

**LORETA Z-Score Neurofeedback (LNFB):**
- Provides 3D source localization using inverse solution
- Trains deep brain structures and entire networks
- Addresses: current source density, connectivity/coherence, processing speed (phase)
- Spatial resolution: cortical surface and deep structures simultaneously
- Typical session reduction: 1/3 to 1/2 fewer sessions than traditional surface NF

### 2.4 Signal-to-Noise Optimization

Individualized frequency bands improve training specificity:
- Theta band individualized: 4-6 Hz vs 5-8 Hz based on individual peak
- Beta reward only if beta not already elevated
- Midline sites (Fz, FCz, Cz) preferred for arousal protocols
- EMG inhibit (55-100 Hz) kept below 5-10 uV across all protocols

---

## 3. Inhibitory vs Excitatory Target Logic

### 3.1 Fundamental Principles

Neurofeedback operates on two complementary mechanisms:

| Mechanism | Direction | EEG Effect | Clinical Application |
|-----------|-----------|------------|---------------------|
| **Uptraining (Excitatory)** | Increase amplitude/power of target frequency | Enhance underactive rhythms | Hypoarousal, low alpha, low SMR |
| **Downtraining (Inhibitory)** | Decrease amplitude/power of target frequency | Reduce hyperactive rhythms | Hyperarousal, excess beta, high theta |
| **Ratio Training** | Shift balance between frequencies | Normalize proportional relationships | TBR normalization, alpha/theta balance |
| **Coherence Training** | Adjust connectivity between regions | Normalize inter-regional communication | Hyper/hypo-connectivity disorders |

### 3.2 Excitatory (Uptraining) Targets

**When to Uptrain:**
- qEEG shows statistically low amplitude (< -1.5 SD from normative mean)
- Clinical presentation matches hypoarousal (lethargy, inattention, depression)
- Frequency-specific deficits identified

**Primary Uptraining Targets:**
- **Alpha (8-12 Hz):** Relaxation, calm alertness, posterior dominance
- **SMR (12-15 Hz):** Calm focus, motor stillness, thalamic-cortical inhibitory circuit
- **Beta1 (15-20 Hz):** Sustained attention, working memory, executive function
- **Gamma (30-40 Hz):** Cognitive integration, peak performance (use cautiously)
- **SCP Negativity:** Increased cortical excitability, cognitive preparation

### 3.3 Inhibitory (Downtraining) Targets

**When to Downtrain:**
- qEEG shows statistically high amplitude (> +1.5 SD from normative mean)
- Clinical presentation matches hyperarousal (anxiety, hypervigilance, insomnia)
- Epileptiform activity or spike-wave discharge patterns present

**Primary Downtraining Targets:**
- **Delta (1-4 Hz):** Cognitive fogging, slow-wave excess, head injury
- **Theta (4-8 Hz):** Drowsiness, inattention, excessive slow-wave in frontal regions
- **High Beta (22-30 Hz):** Anxiety, muscle tension, racing thoughts, "spindling beta"
- **Beta3 (23-38 Hz):** Hyperarousal, anxiety-depression comorbidity
- **SCP Positivity:** Decreased cortical excitability, behavioral inhibition

### 3.4 Interhemispheric Inhibition Logic

Bilateral training addresses interhemispheric dynamics:
- **Left frontal underactivation** (depression marker): Uptrain beta/alpha on left, potentially downtrain on right
- **Right frontal overactivation** (anxiety marker): Downtrain beta on right, uptrain alpha/SMR
- **Thalamic-cortical circuit:** SMR enhancement strengthens thalamic inhibitory mechanisms, reducing sensory interference
- **Corpus callosum modulation:** Bidirectional regulation of sensorimotor cortex affects interhemispheric inhibition magnitude

### 3.5 Decision Matrix: Inhibitory vs Excitatory

| qEEG Finding | Z-Score | Interpretation | Action |
|-------------|---------|----------------|--------|
| High Delta | > +1.5 SD | Excess slow activity | Inhibit delta |
| High Theta (frontal) | > +1.5 SD | Frontal hypoarousal / inattention | Inhibit theta |
| Low Alpha (posterior) | < -1.5 SD | Relaxation deficit | Uptrain alpha |
| High Beta (frontal) | > +1.5 SD | Hyperarousal / anxiety | Inhibit high beta |
| Low SMR (central) | < -1.5 SD | Poor motor inhibition / sleep onset | Uptrain SMR |
| High TBR | > +1.5 SD | ADHD-type hypoarousal | Inhibit theta, uptrain beta |
| Frontal Alpha Asymmetry | F4 > F3 | Depression pattern | Uptrain alpha left / decrease right |
| Beta Spindles | > +2.0 SD | OCD/rumination marker | Downtrain specific beta frequency |

---

## 4. Safety Screening & Spike/Epileptiform Exclusion

### 4.1 Mandatory Safety Screening

**Pre-Assessment Exclusion Criteria:**

| Condition | Action | Rationale |
|-----------|--------|-----------|
| Active epilepsy / seizure disorder | Absolute exclusion from frequency NF | Risk of kindling/paradoxical excitation |
| History of seizures (no current meds) | High caution; SCP or ILF only | Historical seizure threshold sensitivity |
| Epileptiform spikes/sharp waves on qEEG | Exclude from reward protocols; inhibit-only possible | Spike activation risk with reinforcement |
| Bipolar I disorder (acute phase) | Defer or use ultra-cautious parameters | Mania induction risk with certain protocols |
| Active psychosis | Exclude from NF; stabilize first | Reality testing compromised |
| Pregnancy (first trimester) | Caution with neuromodulation | Limited safety data |
| Implanted electronic devices | Exclude from tDCS/TMS | Device interference risk |
| Acute brain injury (< 6 months) | Defer or use gentle protocols | Brain state instability |
| Substance withdrawal (acute) | Stabilize before NF | EEG confounds and seizure risk |

### 4.2 Spike and Epileptiform Detection Protocol

**Automated Detection Algorithm Requirements:**
1. **Spike Detection:** Identify sharp transients with duration < 200 ms
2. **Polyspike Detection:** Bursts of multiple spikes > 3 Hz
3. **Spike-and-Wave Detection:** Spike followed by slow wave
4. **Sharp Wave Detection:** Transients with duration 200-500 ms
5. **3 Hz Spike-and-Wave:** Classic absence epilepsy pattern

**Exclusion Thresholds (from qEEG-Pro normative database methodology):**
- Any client showing epileptiform activity per automated detection is excluded from normative database
- For clinical NF: epileptiform activity mandates protocol modification
- 88/1696 (5.2%) EC recordings and 21/1364 (1.5%) EO recordings showed epileptiform activity in qEEG-Pro database

### 4.3 Protocol Modifications for Borderline Cases

| Finding | Protocol Modification |
|---------|---------------------|
| Occasional sharp transients | No reward at temporal regions; add spike inhibit band |
| Excess theta with borderline spikes | Use SCP protocol instead of theta/beta |
| Photoparoxysmal response | Avoid visual feedback; use auditory only |
| Rolandic spikes | Avoid C3/C4 training; train at Pz or Fz instead |
| Breathing-induced spike activation | Train EO only; avoid hyperventilation |

### 4.4 EMG Inhibits Across All Protocols

- **Frequency range:** 55-100 Hz
- **Threshold:** 5-10 uV maximum
- **Purpose:** Prevent muscle artifact contamination and ensure true EEG feedback
- **Implementation:** Real-time suppression of feedback when EMG exceeds threshold

### 4.5 Session Monitoring Safeguards

- Pre-session: Screen for sleep deprivation, alcohol, medication changes
- During session: Monitor for drowsiness, agitation, headache onset
- Post-session: Document fatigue, mood changes, physical symptoms
- Protocol suspension criteria: Any report of seizure aura, severe headache, or significant symptom worsening

---

## 5. Top 10 Protocol Approaches

### Protocol #1: Theta/Beta Ratio (TBR) Training
**Primary Indication:** ADHD (cortical hypoarousal subtype), inattention  
**Sites:** Cz, Fz, FCz (midline)  
**Parameters:** Inhibit theta (4-8 Hz), reward beta (13-20 Hz)  
**Rationale:** Excess theta relative to beta correlates with underarousal and poor sustained attention. TBR > 1.5 SD above age norms predicts NF response (Arns et al., 2013).  
**Sessions:** 20-40 sessions, 2x/week  
**Evidence:** Monastra et al. (2005), Arns et al. (2014), Gevensleben et al. (2009)

### Protocol #2: Sensorimotor Rhythm (SMR) Enhancement
**Primary Indication:** ADHD (delayed maturation), hyperactivity/impulsivity, sleep-onset insomnia, epilepsy  
**Sites:** C4, Cz, C3 (sensorimotor strip)  
**Parameters:** Reward SMR (12-15 Hz), inhibit theta (4-8 Hz) and high beta (22-30 Hz)  
**Rationale:** SMR reflects thalamocortical inhibitory circuit. Enhancing SMR improves motor inhibition, sleep spindle generation, and calm focus. Thalamic inhibitory mechanism reduces sensory interference.  
**Sessions:** 30-40 sessions, 2-3x/week  
**Evidence:** Lubar & Shouse (1976), Gevensleben et al. (2014), Sterman et al. (1970)

### Protocol #3: Alpha/Theta (A/T) Deep State Training
**Primary Indication:** PTSD, addiction, anxiety, trauma processing  
**Sites:** Pz (posterior midline)  
**Parameters:** Reward theta (4-8 Hz) crossing above alpha (8-12 Hz) threshold; inhibit high beta (20-30 Hz)  
**Rationale:** The alpha/theta crossover state induces deep relaxation and access to preconscious material. Peniston-Kulkosky protocol showed 80% sustained sobriety at 30-month follow-up for alcoholism. Facilitates trauma processing without re-traumatization.  
**Sessions:** 15-30 sessions, 1-2x/week  
**Evidence:** Peniston & Kulkosky (1989, 1991), van der Kolk et al. (2016), Leem et al. (2021)

### Protocol #4: Alpha Uptraining (Posterior)
**Primary Indication:** Generalized anxiety disorder, hyperarousal, insomnia  
**Sites:** P3, P4, Pz, O1, O2 (posterior)  
**Parameters:** Reward alpha (8-12 Hz), inhibit delta (2-4 Hz) and high beta (22-40 Hz)  
**Rationale:** Alpha represents the brain's primary relaxation rhythm. Posterior alpha increase produces calming effect and reduces hypervigilance. GAD patients show suppressed posterior alpha.  
**Sessions:** 10-20 sessions, 2x/week  
**Evidence:** Hou et al. (2021), Rice et al. (1993), Banerjee et al. (2017)

### Protocol #5: Beta Downtraining (High-Beta Inhibit)
**Primary Indication:** Anxiety-depression comorbidity, OCD, rumination, hyperarousal  
**Sites:** Frontocentral site of maximal beta-spindle power (typically Fz, F3, F4)  
**Parameters:** Downtrain beta3 (23-38 Hz), maintain or uptrain beta1 (15-20 Hz)  
**Rationale:** Excess high-beta "spindling" correlates with worry, rumination, and compulsive thought patterns. Downtraining high-beta while preserving beta1 maintains executive function without anxiety amplification.  
**Sessions:** 20-30 sessions, 2x/week  
**Evidence:** Arns et al. (2015), Lin et al. (2019)

### Protocol #6: Slow Cortical Potential (SCP) Training
**Primary Indication:** ADHD (hyperarousal subtype), epilepsy, self-regulation deficits  
**Sites:** Cz (vertex)  
**Parameters:** Learn to produce negative SCP shifts (activation) and positive SCP shifts (relaxation) on cue  
**Rationale:** SCPs reflect cortical excitability thresholds. Negative shifts lower firing threshold for action preparation; positive shifts increase inhibition. SCP training teaches volitional state regulation.  
**Sessions:** 30+ sessions, 2-3x/week  
**Evidence:** Birbaumer et al. (1990), Strehl et al. (2006), Bink et al. (2016)

### Protocol #7: Frontal Alpha Asymmetry (FAA) Training
**Primary Indication:** Major depressive disorder, negative affect bias  
**Sites:** F3 (left frontal), F4 (right frontal)  
**Parameters:** Uptrain alpha on right (F4) or uptrain beta on left (F3) to normalize F4>F3 alpha ratio  
**Rationale:** Depression associated with left frontal hypoactivation (approach deficit) and right frontal hyperactivation (withdrawal). NF targeting FAA normalization has shown antidepressant effects.  
**Sessions:** 15-30 sessions, 2x/week  
**Evidence:** Allen & Reznik (2015), Choi et al. (2011), Peeters et al. (2014)

### Protocol #8: LORETA Z-Score Multivariate Training
**Primary Indication:** Complex presentations, network-level dysregulation, refractory cases  
**Sites:** 19-channel full montage  
**Parameters:** Train amplitude, power ratios, coherence, and phase toward z=0 using normative database  
**Rationale:** Network-level dysregulation requires simultaneous multi-parameter training. LORETA provides 3D source localization enabling deep structure training. Addresses connectivity abnormalities not accessible with surface protocols.  
**Sessions:** 15-30 sessions, 2x/week  
**Evidence:** Cannon et al. (2007), Congedo et al. (2004), Thatcher (2013)

### Protocol #9: Default Mode Network (DMN) Regulation
**Primary Indication:** PTSD with rumination, depression, trauma-related network dysregulation  
**Sites:** PCC (posterior cingulate cortex) via fMRI-NF or EEG surrogate markers  
**Parameters:** Downregulate PCC activity during trauma cue exposure; normalize DMN-SN connectivity  
**Rationale:** PTSD shows hyperconnectivity between DMN and trauma-processing regions. PCC-targeted NF engages DMN-mediated recalibration rather than CEN-driven regulation. Reduces rumination and trauma-related network hypercoupling.  
**Sessions:** 15-20 sessions, 2x/week (fMRI-NF)  
**Evidence:** Kluetsch et al. (2023), Nicholson et al. (2020), Gerin et al. (2016)

### Protocol #10: qEEG-Guided TMS/tDCS Targeting
**Primary Indication:** Treatment-resistant depression, OCD, PTSD  
**Sites:** Individualized based on qEEG findings (DLPFC, SMA, OCD circuit)  
**Parameters:** Low alpha -> high-frequency TMS (10 Hz); high beta -> low-frequency TMS (1 Hz); tDCS F3 anode/F4 cathode for depression  
**Rationale:** qEEG identifies individual dysregulation patterns that guide stimulation target, frequency, and laterality. Network controllability analysis identifies optimal driver nodes for minimal-energy network reconfiguration.  
**Sessions:** 20-30 sessions, 5x/week initial, then 2x/week  
**Evidence:** Arns et al. (2012), Cambridge case study (2026), Alexander et al. (2019)

---

## 6. Alpha Training Protocols

### 6.1 Alpha Uptraining (Posterior Sites)

**Target Population:** Generalized anxiety disorder, insomnia, hyperarousal, stress-related conditions  
**qEEG Entry Criteria:**
- Posterior alpha amplitude < -1.0 SD below normative mean
- Eyes-closed alpha peak frequency < 10 Hz
- Alpha blocking response impaired (excess alpha persists with eyes open)

**Protocol Specifications:**
| Parameter | Setting |
|-----------|---------|
| Reward band | 8-12 Hz (individualized: IAF +/- 2 Hz) |
| Inhibit bands | 2-9 Hz (delta/theta), 22-40 Hz (high beta) |
| Sites | Pz, O1, O2 (posterior) |
| Threshold | Mean + 0.85 SD above baseline |
| Session duration | 30-40 minutes |
| Trial structure | 7-minute trials x 3, with 2-minute breaks |

**Clinical Effects:**
- Increased relaxation and calm alertness
- Improved sleep quality and sleep-onset latency
- Reduced anxiety symptoms (Hou et al., 2021 showed significant STAI-S reduction)
- Enhanced HRV indicating increased parasympathetic tone

### 6.2 Individualized Alpha Peak Frequency (IAF) Training

**Principle:** Alpha peak frequency varies individually (typically 9-11 Hz). Training at individualized frequency improves specificity.

**Method:**
1. Identify IAF from eyes-closed resting qEEG
2. Set reward band: IAF - 2 Hz to IAF + 2 Hz
3. Upper alpha band (IAF to IAF+2 Hz) specifically for cognitive enhancement

### 6.3 Frontal Alpha Training

**Target Population:** Depression, frontal hypoarousal  
**Sites:** F3, F4, Fz  
**Logic:** Frontal alpha asymmetry (FAA) is a well-established depression biomarker. Training aims to normalize left-right alpha balance.

---

## 7. Theta Training Protocols

### 7.1 Theta Inhibition (Frontal)

**Target Population:** ADHD, cognitive fog, frontal hypoarousal  
**Sites:** Fz, Cz, FCz  
**Parameters:** Inhibit 4-8 Hz theta while rewarding 13-20 Hz beta  
**Rationale:** Excess frontal theta correlates with drowsiness, poor sustained attention, and behavioral disinhibition.

### 7.2 Theta Enhancement (Alpha/Theta Protocol)

**Target Population:** PTSD, addiction, trauma, performance optimization  
**Sites:** Pz  
**Parameters:** Reward theta (4-8 Hz) producing amplitude greater than alpha (8-12 Hz); the "crossover" state  
**Mechanism:**
- Theta dominance at posterior sites indicates deep meditative state
- Facilitates access to preconscious and emotional processing
- Allows safe trauma memory processing without full conscious re-experiencing
- Promotes brainwave synchrony across regions

**Peniston-Kulkosky Protocol (Modified):**
1. 30-minute temperature biofeedback (hand warming) for autonomic calming
2. 30-minute alpha/theta NF at Pz with eyes closed
3. Auditory feedback (tones) indicating theta crossing above alpha
4. Post-session positive visualization/imagery
5. Typically 20-40 sessions

### 7.3 Theta/Beta Ratio Training

**TBR Thresholds by Age (Arns et al.):**
- Adults: TBR > 4.5 suggests hypoarousal
- Adolescents: TBR > 5.0
- Children: TBR > 6.0

**Protocol:** Inhibit theta, reward beta when TBR exceeds age-adjusted threshold.

---

## 8. Beta Training Protocols

### 8.1 Beta Uptraining (Low Beta)

**Target Population:** ADHD-inattentive type, cognitive slowing, depression  
**Sites:** C3 (left hemisphere for verbal/attention), Cz, F3  
**Parameters:** Reward beta1 (15-20 Hz), inhibit theta (4-8 Hz)  
**Caution:** Do NOT uptrain beta if:
- Baseline beta already elevated (> +1.0 SD)
- Beta spindles present (22-30 Hz excess)
- Anxiety is comorbid condition

### 8.2 Beta Downtraining (High Beta)

**Target Population:** Anxiety, OCD, rumination, hypervigilance, beta spindle conditions  
**Sites:** Site of maximal beta-spindle power (identified from qEEG)  
**Parameters:**
- Inhibit beta2/beta3 (22-38 Hz)
- Maintain or uptrain beta1 (15-20 Hz) for executive function preservation
- Always include EMG inhibit (55-100 Hz < 5-10 uV)

**qEEG Indicators for Beta Downtraining:**
- Beta amplitude > +1.5 SD above normative mean
- Beta spindles (rhythmic bursts at 22-30 Hz)
- Excess beta at frontocentral sites
- Clinical OCD/rumination presentation

### 8.3 Summary: Beta Band Subdivisions

| Band | Frequency | Function | Training Direction |
|------|-----------|----------|-------------------|
| SMR/Low Beta | 12-15 Hz | Calm focus, motor inhibition | Uptrain |
| Beta1 | 15-20 Hz | Sustained attention, working memory | Uptrain (if low) |
| Beta2 | 20-25 Hz | Active problem solving | Context-dependent |
| Beta3/High Beta | 23-38 Hz | Hypervigilance, anxiety | Downtrain (if high) |

---

## 9. SMR Training Protocols

### 9.1 Core SMR Enhancement

**Target Population:** ADHD (all subtypes), anxiety, sleep-onset insomnia, epilepsy, motor hyperactivity  
**Sites:** C4 (right sensorimotor cortex), Cz, C3  
**Parameters:**
- Reward: 12-15 Hz SMR
- Inhibit: 4-8 Hz theta and 22-30 Hz high beta
- Threshold: Adaptive (typically 80% reward / 20% inhibit)

### 9.2 Neurobiological Mechanism

SMR is a thalamocortical rhythm generated when the motor system is at rest but the sensorimotor cortex remains alert. It reflects:
- Thalamic inhibitory circuit function
- Reduced sensory transmission to cortex
- State of "calm vigilance"
- Sleep spindle precursor (improved sleep architecture)

**Effects:**
- Improved sleep onset latency and sleep quality
- Reduced hyperactivity and impulsivity
- Enhanced focused attention without hypervigilance
- Increased motor inhibition
- Reduced seizure frequency (epilepsy adjunct)

### 9.3 SMR vs Theta/Beta Selection

| Feature | SMR Protocol | Theta/Beta Protocol |
|---------|-------------|-------------------|
| Primary symptom | Hyperactivity/impulsivity | Inattention |
| qEEG profile | Excess slow-wave, delayed maturation | Excess theta, low beta, elevated TBR |
| Site | C4, Cz, C3 | Cz, Fz, FCz |
| Frequency | 12-15 Hz (single band) | 4-8 Hz inhibit + 13-20 Hz reward |
| Sleep benefit | High | Moderate |
| Sessions needed | 30-40 | 20-40 |

---

## 10. SCP Training Protocols

### 10.1 Core SCP Self-Regulation

**Target Population:** ADHD (hyperarousal subtype), epilepsy, self-regulation deficits, impulsivity  
**Sites:** Cz  
**Parameters:**
- Bandwidth: 0.01-30 Hz (DC-coupled or very low frequency)
- Negative trials: Shift SCP negative (up on screen) = increased activation
- Positive trials: Shift SCP positive (down on screen) = decreased activation
- Trial structure: 8 seconds (2s baseline + 6s feedback)
- Transfer trials: 1/3 of trials without contingent feedback

### 10.2 Neurobiological Basis

SCPs are slow voltage shifts lasting hundreds of milliseconds to seconds:
- **Negative SCP shifts:** Reflect increased cortical excitability; associated with behavioral activation, cognitive preparation
- **Positive SCP shifts:** Reflect decreased cortical excitability; associated with behavioral inhibition
- **Vertex (Cz) recording:** Reflects global cortical state, not localized activity

### 10.3 Training Structure

1. **Negativity trials:** Participant directs ball upward (increased activation/attention state)
2. **Positivity trials:** Participant directs ball downward (decreased activation/relaxation state)
3. **Transfer trials:** No visual feedback; participant practices self-regulation independently
4. **Daily life transfer:** Strategy cards used for "dry runs" outside clinic

### 10.4 Clinical Outcomes

- Enhanced self-regulation ability (learned voluntary control over cortical excitability)
- Improved attention and behavioral control
- Reduced seizure frequency (epilepsy)
- Reduced impulsivity and hyperactivity (ADHD)
- Effect sizes comparable to methylphenidate for ADHD (Gevensleben et al., 2009)

---

## 11. qEEG-Guided TMS/tDCS Targeting

### 11.1 qEEG-to-TMS Translation Framework

qEEG biomarkers directly inform TMS protocol selection:

| qEEG Finding | TMS Protocol | Target |
|-------------|--------------|--------|
| Low alpha power (< -1.5 SD) | High-frequency rTMS (10 Hz) | Left DLPFC (F3) |
| High beta power (> +1.5 SD) | Low-frequency rTMS (1 Hz) | Right DLPFC (F4) |
| Frontal alpha asymmetry (F4>F3) | 10 Hz tACS bilateral F3/F4 | Balanced DLPFC activation |
| DMN dysregulation (posterior hyperactivity) | rTMS at individual OCD circuit site | FC1/FC2, SMA |
| Elevated theta/alpha ratio | Individualized frequency targeting | Based on peak abnormality |

### 11.2 Network Controllability Targeting

Advanced qEEG analysis enables network-based TMS targeting:
1. **Construct EEG connectivity graph** from resting-state qEEG
2. **Calculate controllability metrics** for each node (electrode)
3. **Identify driver nodes** with highest network influence
4. **Map to cortical targets** for TMS/tDCS placement
5. **Validate via Kuramoto simulation** of phase synchrony improvement

**Key Principle:** Stimulating high-controllability driver nodes facilitates widespread network reconfiguration with minimal energy, restoring pathological dynamics through functional integration rather than mere activation increase.

### 11.3 qEEG-Guided tDCS Montages

**Depression Protocol:**
- Anode: F3 (left DLPFC)
- Cathode: F4 (right DLPFC)
- Current: 2 mA
- Duration: 20-40 minutes
- Sessions: 20-30, 5x/week initial

**qEEG Refinement:**
- If FAA shows left hypoarousal: standard F3/F4 montage
- If theta/alpha ratio elevated at F4: extend to bilateral frontal targeting
- If posterior abnormalities present: add Pz electrode involvement

### 11.4 Case Example: qEEG-Guided rTMS for Depression + OCD

**Standard approach:** F3 excitatory + F4 inhibitory (standard depression targets)  
**qEEG-guided modification:**
- qEEG revealed: DMN dysregulation, spindling beta over posterior regions (rumination), hyperactivity in supplementary motor area
- Modified target: OCD circuit (FC1/FC2) instead of standard depression targets
- Outcome: PHQ-9 improved 102% (22 to 14), Y-BOCS reduced from 34 to 8
- Repeat qEEG showed previously hyperactive areas normalized to green

---

## 12. Default Mode Network Training

### 12.1 DMN Neurophysiology

The Default Mode Network comprises interconnected hubs:
- **Posterior Cingulate Cortex (PCC):** Primary hub; targeted for downregulation
- **Medial Prefrontal Cortex (mPFC):** Self-referential processing
- **Angular Gyrus:** Semantic processing
- **Hippocampus:** Episodic memory

**DMN Dysfunction Patterns:**
- PTSD: Hyperconnectivity between DMN and trauma/salience regions
- Depression: Hyperconnectivity between DMN and subgenual PFC (rumination)
- ADHD: Reduced DMN deactivation during tasks

### 12.2 PCC-Targeted fMRI Neurofeedback

**Protocol:**
- Target: BOLD signal in PCC (posterior cingulate cortex)
- Task: Downregulate PCC activity during trauma/distress cue presentation
- Feedback: Real-time fMRI signal displayed to participant
- Sessions: 15-20 training runs

**Mechanism:**
- PCC downregulation primarily engages intra-network DMN processes
- PTSD participants show greater DMN connectivity with trauma regions during regulation
- Progressive CEN connectivity reduction across training runs
- DMN connectivity exceeds CEN connectivity during PCC downregulation

### 12.3 EEG Surrogate Markers for DMN Training

When fMRI-NF is unavailable, EEG markers can approximate DMN activity:
- **Alpha power at posterior sites (Pz, O1, O2):** Inversely correlates with DMN activity
- **Theta/alpha ratio:** Elevated ratio suggests DMN hyperactivity
- **Low-frequency power (delta/theta) at midline:** Correlates with DMN engagement

### 12.4 Clinical Applications

| Condition | DMN Pattern | NF Target |
|-----------|-------------|-----------|
| PTSD | DMN-SN hypercoupling | Downregulate PCC |
| Depression | DMN-sgPFC hyperconnectivity | Downregulate mPFC/PCC |
| Anxiety | DMN hyperactivity at rest | Normalize posterior alpha |
| Rumination | Excess DMN self-referential activity | Reduce midline low-frequency power |

---

## 13. Protocol Rationale Generation

### 13.1 Structured Rationale Template

Every protocol should include a documented rationale with the following components:

```markdown
### Protocol Rationale

**Patient ID:** [Anonymized]
**Date:** [Date]
**Condition(s):** [Primary and comorbid]

#### 1. qEEG Findings Summary
- [Key deviation 1 with Z-score]
- [Key deviation 2 with Z-score]
- [Connectivity finding if applicable]

#### 2. EEG Subtype Classification
- [Hypoarousal / Hyperarousal / Mixed / Normal]

#### 3. Protocol Selection Logic
- Primary protocol: [Protocol name] - selected because [specific qEEG finding]
- Target sites: [Electrode locations] - chosen because [rationale]
- Reward frequency: [Hz range] - targets [physiological mechanism]
- Inhibit frequency: [Hz range] - addresses [specific abnormality]

#### 4. Inhibitory/Excitatory Logic
- [Frequency] is being [uptrained/downtrained] because qEEG shows
  [specific deviation] which correlates with [clinical symptom]
- Interhemispheric balance: [approach if applicable]

#### 5. Expected Outcomes
- Primary: [Symptom target]
- Secondary: [Additional benefit]
- Session estimate: [Number] based on [evidence base]

#### 6. Safety Considerations
- Spike/epileptiform screening: [Result]
- EMG inhibit threshold: [Value]
- Contraindications checked: [List]

#### 7. Progress Metrics
- Objective: [qEEG re-assessment at session X]
- Subjective: [Rating scales at intervals]
- Self-regulation: [Learning curve assessment]
```

### 13.2 Evidence-Based Protocol Selection Checklist

- [ ] qEEG completed (eyes open + eyes closed)
- [ ] Z-scores calculated against age-matched normative database
- [ ] Spike/epileptiform activity ruled out
- [ ] Primary EEG subtype identified
- [ ] Comorbid conditions considered
- [ ] Inhibitory/excitatory direction justified by qEEG deviation
- [ ] Target sites selected based on localization of abnormality
- [ ] Frequency bands individualized (IAF, specific peak frequencies)
- [ ] EMG inhibit threshold set
- [ ] Number of sessions estimated from evidence base
- [ ] Progress monitoring plan established
- [ ] Safety monitoring plan documented

### 13.3 Adaptive Protocol Modification

**When to Modify Protocols:**

| Trigger | Action |
|---------|--------|
| No clinical improvement after 10 sessions | Repeat qEEG; reassess subtype |
| Worsening of target symptoms | Review inhibit/reward bands; check EMG contamination |
| New symptoms emerge | Reassess with full qEEG; consider comorbidity |
| Self-regulation plateau | Adjust threshold difficulty; add transfer trials |
| Significant clinical improvement | Consider tapering frequency; plan maintenance |

---

## 14. References

### Primary Sources

1. Arns, M., et al. (2012). Neurofeedback for ADHD: Exploring the Role of Quantitative EEG and Brainwave Modulation. *PMC/NIH*.
2. Arns, M., et al. (2014). qEEG-informed neurofeedback effectiveness trial. *Multicenter effectiveness trial*.
3. Peniston, E.G. & Kulkosky, P.J. (1989, 1991). Alpha-theta neurofeedback for PTSD and alcoholism. *Original protocol studies*.
4. van der Kolk, B.A., et al. (2016). Neurofeedback for chronic PTSD: RCT comparing alpha-theta NF to group therapy. *Neurofeedback RCT*.
5. Lubar, J.F. & Shouse, M.N. (1976). EEG and behavioral changes in a hyperkinetic child concurrent with training of the sensorimotor rhythm (SMR). *Biofeedback and Self-Regulation*.
6. Birbaumer, N., et al. (1990). Slow cortical potentials and behavior. *International Journal of Psychophysiology*.
7. Strehl, U., et al. (2006). Self-regulation of slow cortical potentials in children with ADHD. *Neuroscience Letters*.
8. Hou, Z., et al. (2021). Neurofeedback training improves anxiety trait and depressive symptom in GAD. *PMC/NIH*.
9. Cannon, R.L., et al. (2007). LORETA neurofeedback: Clinical applications. *Journal of Neurotherapy*.
10. Allen, J.J.B. & Reznik, S.J. (2015). Frontal EEG asymmetry as a promising marker of depression. *Current Opinion in Psychology*.
11. Kluetsch, R.C., et al. (2023). PCC-targeted fMRI neurofeedback in PTSD. *PMC/NIH*.
12. Monastra, V.J., et al. (2005). The effects of theta/beta training on ADHD. *Clinical EEG and Neuroscience*.
13. Gevensleben, H., et al. (2009). Is neurofeedback an efficacious treatment for ADHD? *European Child & Adolescent Psychiatry*.
14. Alexander, M.L., et al. (2019). Double-blind RCT targeting alpha oscillations with tACS for MDD. *Nature Translational Psychiatry*.
15. Bink, M., et al. (2016). SCP neurofeedback in ADHD. *European Child & Adolescent Psychiatry*.
16. Heinrich, H., et al. (2007). Theta/beta and SCP training in adults. *Neuroscience*.
17. Lin, I.M., et al. (2019). Alpha asymmetry and high-beta down-training for depression with anxiety. *Journal of Affective Disorders*.
18. Thatcher, R.W. (2013). Latest developments in live z-score training. *Journal of Neurotherapy*.
19. Pascual-Marqui, R.D. (1994). LORETA: Low Resolution Electromagnetic Tomography. *Methods and Findings in Experimental and Clinical Pharmacology*.
20. Davidson, R.J. (2004). What does the prefrontal cortex "do" in affect? *Personality and Individual Differences*.

---

*Document compiled from peer-reviewed literature, clinical practice guidelines, and established neurofeedback protocols. All protocols should be implemented by qualified clinicians with appropriate training in qEEG interpretation and neurofeedback administration.*
