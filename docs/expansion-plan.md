# DeepSynaps Studio Master Clinical Database — Expansion Plan

**Document version:** 1.0  
**Baseline date:** 2025  
**Baseline record count:** 201 records across 9 tables  
**Target record count:** ~415 records across 9 tables  
**Target completion:** 6-month phased rollout + ongoing maintenance

---

## Executive Summary

The DeepSynaps Studio Master Clinical Database currently holds 201 records spanning 9 tables: Evidence Levels (4), Governance Rules (12), Modalities (12), Devices (19), Conditions (20), Symptoms/Phenotypes (30), Assessments (42), Protocols (32), and Sources (30). This plan defines a structured, evidence-governed expansion to the following targets:

| Table | Current | Target | Net New |
|-------|---------|--------|---------|
| Evidence_Levels | 4 | 4 | 0 (stable) |
| Governance_Rules | 12 | 12 | 0 (maintained) |
| Modalities | 12 | 12 | 0 (stable) |
| Devices | 19 | 75 | +56 |
| Conditions | 20 | 50 | +30 |
| Protocols | 32 | 100 | +68 |
| Assessments | 42 | 60 | +18 |
| Sources | 30 | 50 | +20 |
| Symptoms_Phenotypes | 30 | ~40 | +10 (secondary) |
| **TOTAL** | **201** | **~415** | **~214** |

> **Key Invariants (never to be altered during expansion):**
> - Flow FL-100 is the only PMA-approved tDCS device (PMA approval December 2025)
> - BrainsWay H-coil system holds the broadest TMS indications (MDD, OCD, smoking cessation)
> - Neurofeedback for ADHD is graded **EV-D** per Cortese et al. (2024)
> - FDA cleared ≠ FDA approved; 510(k) clearance ≠ PMA approval; device listing ≠ either

---

## Phase 1: Core Gaps (Months 1–2)

### Overview

Phase 1 closes the most significant gaps in clinical coverage: missing device categories (tACS is entirely absent), high-priority conditions under-represented in the current dataset, and foundational protocols for new device-condition pairs.

**Phase 1 Record Targets:**

| Table | End-of-Phase Count | Net Added |
|-------|--------------------|-----------|
| Devices | 39 | +20 |
| Conditions | 30 | +10 |
| Protocols | 57 | +25 |
| Assessments | 52 | +10 |
| Sources | 40 | +10 |

---

### 1.1 Devices — Add 20 New Records

#### Priority Categories

**TMS / Additional Coil Systems (Target: +5)**

| Device | Manufacturer | Regulatory Basis | Notes |
|--------|-------------|-----------------|-------|
| Magstim Horizon 3.0 | Magstim | FDA 510(k) K213023 | Standard figure-8 coil; MDD indication |
| Magstim D-B80 double cone | Magstim | FDA 510(k) | Deeper penetration; research standard |
| MagVenture MagPro R30 | MagVenture | FDA 510(k) K152607 | Compact clinical system |
| MagVenture MagPro X100 + MST Coil | MagVenture | FDA 510(k) | MST (Magnetic Seizure Therapy) research use |
| Nexstim NBT | Nexstim | FDA 510(k) K182765 | Navigated TMS; motor cortex mapping |

> **Verification required:** Confirm exact 510(k) numbers from FDA 510(k) database. Verify cleared indications versus marketed indications. Do not derive indications from manufacturer marketing copy alone.

**tDCS Devices (Target: +3)**

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Neuroelectrics STARSTIM 8 | Neuroelectrics | CE Mark (EU); research-use in US | HD-tDCS multi-electrode |
| Neuroelectrics STARSTIM 32 | Neuroelectrics | CE Mark (EU); research-use in US | High-density research platform |
| Soterix Medical 1×1 tDCS | Soterix | FDA 510(k) (research device) | Verify cleared vs. approved status |

> **Verification required:** Confirm FDA status for US market. Neuroelectrics devices sold in the US as research instruments — do not list as FDA-cleared without explicit verification of a 510(k) submission. Flow FL-100 remains the only PMA-approved tDCS device.

**tACS Devices — NEW MODALITY CATEGORY (Target: +4)**

tACS is currently absent from the device table entirely. This is the highest-priority gap.

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| NeuroConn DC-Stimulator MC | NeuroConn (Germany) | CE Mark; research use in US | Multi-channel; supports tACS, tRNS |
| Soterix Medical tACS System | Soterix | Research-grade; verify FDA status | AC stimulation capability |
| Neuroelectrics Starstim (AC mode) | Neuroelectrics | CE Mark; verify US status | Configurable AC waveform |
| BrainStimulator tACS (v4) | The Brain Stimulator | CE Mark; US research use | Consumer/research hybrid |

> **Risk note:** tACS devices have limited regulatory clearance globally. No FDA-cleared tACS device exists as of the database baseline. All tACS records must clearly document this regulatory gap. EV-D or EV-C only until multi-site RCT evidence matures. A dedicated governance note (suggested: GOV-013) should be created for tACS regulatory warnings.

**CES Devices (Target: +2)**

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Neuromed CES Ultra | Neuromed | FDA 510(k) cleared | Verify current 510(k) status |
| Alpha-Stim M | Electromedical Products | FDA 510(k) cleared for anxiety, depression, insomnia | Established CE |

**Neurofeedback Systems (Target: +3)**

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Muse S Headband (clinical mode) | InteraXon | Consumer; CE Mark; limited FDA pathway | EEG-based guided meditation/NFB |
| NeurOptimal v3 | Zengar Institute | Health Canada; CE Mark; US wellness | Dynamical NFB; non-medical claims |
| BrainMaster Atlantis II+ | BrainMaster | FDA 510(k) K083572 | Biofeedback device; clinical platform |

> **Risk note:** Neurofeedback evidence grading must remain consistent with the ADHD = EV-D ruling (Cortese 2024). Device listing does not imply clinical efficacy. All NFB devices require explicit evidence grade documentation per condition.

**International VNS/DBS Systems (Target: +3)**

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| LivaNova SenTiva VNS | LivaNova | FDA PMA P970003 (numerous supplements); CE Mark | Closed-loop VNS; detect ictal activity |
| Abbott Infinity DBS | Abbott | FDA PMA P150031; CE Mark | Directional DBS; Parkinson's |
| Boston Scientific Vercise Genus | Boston Scientific | FDA PMA P140009; CE Mark | DBS; Parkinson's and essential tremor |

---

### 1.2 Conditions — Add 10 New Records

| Condition | Category | Priority Justification | Expected Evidence Grade |
|-----------|----------|----------------------|------------------------|
| PTSD | Anxiety/Trauma | High clinical need; TMS evidence growing; dedicated protocols exist | EV-B (for TMS) |
| Autism Spectrum Disorder (ASD) | Neurodevelopmental | Significant clinical interest; limited modality evidence | EV-C/D; requires careful grading |
| Tinnitus | Sensory/ENT | Strong TMS and tDCS evidence base; NICE awareness | EV-B/C |
| Stroke Rehabilitation | Rehabilitation | Extensive TMS/tDCS RCT literature; NICE guidelines available | EV-B |
| Traumatic Brain Injury (TBI) | Neurotrauma | Growing tDCS evidence; specialist assessment tools needed | EV-C |
| Chronic Fatigue Syndrome (CFS/ME) | Fatigue | Limited device evidence; HRV biofeedback data exists | EV-C/D |
| Insomnia (primary) | Sleep | CES and neurofeedback evidence; standalone from comorbid | EV-B (for CES) |
| Bipolar Depression | Mood | TMS evidence exists but complex (cycling risk); guidelines vary | EV-B with GOV flags |
| Post-Concussion Syndrome | Neurotrauma | Emerging tDCS/neurofeedback evidence | EV-D |
| Restless Legs Syndrome (RLS) | Movement | TMS evidence; European guidelines | EV-C |

> **Risk areas:**
> - ASD protocols are mostly EV-C/D and must not be elevated without systematic review evidence
> - Bipolar Depression requires GOV-012 dual review flag and explicit cycling-risk contraindication documentation
> - TBI and Post-Concussion Syndrome overlap — define clear differential criteria before entry

---

### 1.3 Protocols — Add 25 New Records

Priority protocol additions for Phase 1 fill gaps between new devices and new conditions, and introduce tACS protocols for the first time.

#### PTSD Protocols (+4)
- High-frequency rTMS left DLPFC — PTSD (10 Hz, 110% MT, 3000 pulses/session)
- Low-frequency rTMS right DLPFC — PTSD (1 Hz, anxiety symptom focus)
- iTBS DLPFC — PTSD (per FDA-cleared iTBS parameters with PTSD evidence mapping)
- tDCS F3/F4 bilateral — PTSD (2 mA, 20 min; reference Kozel 2022 + ongoing RCTs)

#### Tinnitus Protocols (+3)
- rTMS left temporoparietal junction — Tinnitus (1 Hz, 110% MT, 1000 pulses/session)
- rTMS left DLPFC + temporoparietal junction combined — Tinnitus
- tDCS temporoparietal — Tinnitus (1 mA, 20 min; sham-controlled study basis)

#### Stroke Rehabilitation Protocols (+4)
- High-frequency rTMS ipsilesional M1 — Motor stroke (10 Hz, facilitate affected hemisphere)
- Low-frequency rTMS contralesional M1 — Motor stroke (1 Hz, inhibit unaffected hemisphere)
- tDCS ipsilesional M1 anodal — Motor stroke (2 mA, 20 min)
- tDCS bilateral M1 (HD-tDCS) — Motor stroke (Neuroelectrics multi-electrode protocol)

#### TBI Protocols (+2)
- tDCS prefrontal anodal — TBI cognitive fatigue (1.5 mA, 20 min; Boggio et al. basis)
- Neurofeedback theta/beta — TBI attention (NeurOptimal/BrainMaster platform)

#### tACS Protocols — New Category (+5)
> All tACS protocols are EV-C or EV-D. Research use only. No FDA-cleared tACS protocol exists.

- tACS gamma (40 Hz) — MCI/Alzheimer's prevention (Iaccarino paradigm basis)
- tACS alpha (10 Hz) — Working memory (Frohlich et al. basis)
- tACS theta (6 Hz) — Episodic memory consolidation
- tACS beta (20 Hz) — Motor learning (M1 target)
- tACS delta (1 Hz) — Slow-wave sleep enhancement (sleep-phase synchronized)

#### Insomnia Protocols (+3)
- CES alpha protocol — Primary insomnia (Alpha-Stim M; 0.5 Hz, 100 μA, 60 min)
- CES sub-delta — Insomnia with anxiety (Neuromed protocol basis)
- Neurofeedback SMR/theta — Insomnia (BrainMaster; sensorimotor rhythm training)

#### ASD Protocols (+2)
- Low-frequency rTMS supplementary motor area — ASD (repetitive behavior target; EV-D)
- Neurofeedback slow cortical potentials — ASD (Strehl paradigm; EV-D)

#### RLS Protocol (+1)
- rTMS primary motor cortex bilateral — RLS (research protocol; EV-C)

#### Combination Protocols — TMS + Psychotherapy (+1)
- Accelerated TMS + CBT — MDD (co-administration protocol; document timing and sequencing requirements)

---

### 1.4 Assessments — Add 10 New Records

| Assessment | Type | Target Condition(s) | Notes |
|------------|------|--------------------|----|
| PCL-5 (PTSD Checklist for DSM-5) | Self-report | PTSD | 20-item; validated cutoff ≥ 33 |
| CAPS-5 (Clinician-Administered PTSD Scale) | Clinician-rated | PTSD | Gold-standard PTSD diagnostic |
| NIHSS (National Institutes of Health Stroke Scale) | Clinician-rated | Stroke Rehabilitation | 15-item acute stroke severity |
| Barthel Index | Clinician-rated | Stroke Rehabilitation, TBI | ADL functional outcome |
| GOSE (Glasgow Outcome Scale — Extended) | Clinician-rated | TBI | 8-point functional outcome |
| Tinnitus Handicap Inventory (THI) | Self-report | Tinnitus | 25-item; validated tinnitus impact |
| Tinnitus Functional Index (TFI) | Self-report | Tinnitus | 25-item; sensitive to change |
| Y-BOCS (Yale-Brown OCD Scale) | Clinician-rated | OCD | Already adjacent; verify if present |
| Chalder Fatigue Scale | Self-report | CFS/ME | 11-item bimodal and Likert versions |
| Insomnia Severity Index (ISI) | Self-report | Insomnia | 7-item; widely validated |

---

### 1.5 Sources — Add 10 New Records

| Source | Type | Relevance |
|--------|------|-----------|
| VA/DoD Clinical Practice Guideline for PTSD (2023) | Guideline | PTSD protocols; TMS recommendation |
| NICE NG116 — Tinnitus (2020) | Guideline | Tinnitus; TMS/CBT evidence framing |
| NICE NG236 — Stroke Rehabilitation (2023) | Guideline | Stroke protocols |
| Leung et al. (2023) — rTMS for PTSD meta-analysis | Meta-analysis | PTSD evidence grading |
| Bolognini et al. (2022) — tDCS for stroke rehab: Cochrane | Meta-analysis | Stroke tDCS evidence |
| Iaccarino et al. (2016) — gamma tACS Alzheimer's | RCT | tACS gamma foundational study |
| Frohlich & McCormick (2010) — tACS alpha endogenous oscillations | Review | tACS evidence basis |
| FDA 510(k) Database — Neuromodulation product codes QNO, QEB | Regulatory | Device clearance verification |
| FDA PMA Database — P150031, P140009, P970003 supplements | Regulatory | DBS/VNS PMA verification |
| Cortese et al. (2024) — Neurofeedback ADHD systematic review | Meta-analysis | Confirms EV-D for NFB/ADHD |

---

### 1.6 Phase 1 Risk Areas

| Risk | Affected Records | Mitigation |
|------|-----------------|------------|
| tACS has no FDA clearance | All tACS devices and protocols | Tag all tACS entries with mandatory regulatory caveat; create GOV-013 |
| ASD evidence is EV-C/D | ASD protocols | Document evidence grade before entry; flag for specialist review |
| Bipolar depression cycling risk | Bipolar depression protocols | GOV-012 dual review; contraindication for rapid cycling active phase |
| NFB ADHD grade must remain EV-D | Any NFB/ADHD protocol edits | Lock evidence grade; reference Cortese 2024; require senior review to change |
| tDCS device approval confusion | All tDCS device records | Mandatory distinction: 510(k) clearance vs. PMA approval; Flow FL-100 is sole PMA device |
| Combination protocol complexity | TMS+CBT protocols | Require sequential evidence sourcing for each component |

### 1.7 Phase 1 QA Checkpoints

- [ ] All 20 new device records have verified regulatory pathway (510(k) number, PMA number, or explicit CE-only notation)
- [ ] No device record uses "approved" for a 510(k)-only clearance
- [ ] All tACS protocols carry research-only designation
- [ ] ASD evidence grades reviewed by at least two team members
- [ ] All 10 new source records have verified DOI or official URL
- [ ] New protocol parameters (pulse count, intensity, frequency, sessions) verified against source document — not manufacturer website
- [ ] Governance rules 1–12 reviewed for applicability to all new records

---

## Phase 2: International Expansion (Months 3–4)

### Overview

Phase 2 broadens geographic coverage, incorporating EU-certified devices, devices cleared in Japan, Korea, and Australia, and expanding into pediatric and emerging clinical populations where the evidence base is beginning to develop.

**Phase 2 Record Targets:**

| Table | End-of-Phase Count | Net Added |
|-------|--------------------|-----------|
| Devices | 59 | +20 |
| Conditions | 40 | +10 |
| Protocols | 82 | +25 |
| Assessments | 57 | +5 |
| Sources | 47 | +7 |

---

### 2.1 Devices — Add 20 New Records

#### EU-Specific TMS Systems (+5)

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Deymed TruScan | Deymed (Czech) | CE Mark | Research/clinical; EU standard |
| MAG&MORE PowerMAG | MAG&MORE (Germany) | CE Mark | TMS + TMS-EEG combo |
| Rogue Research Brainsight | Rogue Research (Canada) | Health Canada; CE Mark | Navigated TMS; neuronavigation |
| Axilum Robotics TMS-Robot | Axilum (France) | CE Mark | Robotic TMS positioning |
| Emoducs MDUCS | Emoducs | CE Mark (MDR) | EMG-guided TMS |

#### Japanese/Korean Cleared Devices (+4)

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Nippon Medtronic Activa DBS | Medtronic Japan | PMDA approved | Japanese variant of Activa platform |
| Teijin Pharma TMS System | Teijin (Japan) | PMDA 510(k)-equivalent | MDD indication in Japan |
| Ceragem TENS/CES | Ceragem (Korea) | KFDA cleared | Korean CES/TENS hybrid |
| NeuroNetics Stellate (APAC variant) | NeuroNetics | TGA (Australia) | Note: verify against US cleared version |

#### Australian TGA-Approved Devices (+3)

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| NeuroNetics Stellate (TGA) | NeuroNetics | TGA ARTG entry | Cross-reference US 510(k) |
| Electrocore GammaCore Sapphire | Electrocore | TGA; FDA 510(k); CE Mark | taVNS; migraine and cluster headache |
| BrainsWay H7 Coil (TGA) | BrainsWay | TGA ARTG + FDA 510(k) | OCD coil; verify TGA-specific labeling |

#### EUDAMED-Registered Neuromodulation Devices (+5)

> Note: EUDAMED full implementation is phased under EU MDR 2017/745. Some entries may be incomplete. Verify current registration status at ec.europa.eu/tools/eudamed before entry.

| Device | Manufacturer | EU Status | Notes |
|--------|-------------|----------|-------|
| Cerbomed Nemos | Cerbomed (Germany) | CE Mark MDR | taVNS; epilepsy indication |
| ElectroCore LivaNova VNS (EU) | LivaNova | CE Mark; EUDAMED | Cross-reference FDA PMA |
| Boston Scientific Vercise Genus (EU) | Boston Scientific | CE Mark MDR | DBS; EU labeling differences from US |
| Synergia Medical | Synergia | CE Mark; EUDAMED | Closed-loop VNS research |
| Nalu Medical | Nalu | CE Mark | Neuromodulation SCS adjacent |

#### Additional Neurofeedback & HRV Platforms (+3)

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Emotiv EPOC X (clinical mode) | Emotiv | CE Mark; US research | 14-channel EEG NFB platform |
| HeartMath Inner Balance Pro | HeartMath | CE Mark; FDA wellness exempt | HRV biofeedback; validated clinical use |
| Thought Technology ProComp Infiniti | Thought Technology | Health Canada; CE Mark | Multi-modal biofeedback |

---

### 2.2 Conditions — Add 10 New Records

| Condition | Category | Priority Justification | Expected Evidence Grade |
|-----------|----------|----------------------|------------------------|
| ADHD (pediatric, expanded) | Neurodevelopmental | Separate from adult; distinct protocols | EV-C (pharmacotherapy adjunct); EV-D (NFB per Cortese 2024) |
| Developmental Delay | Neurodevelopmental | tDCS exploratory evidence in pediatric populations | EV-D; GOV-012 mandatory |
| Obstructive Sleep Apnea — related fatigue | Sleep | HRV biofeedback evidence; distinct from insomnia | EV-C |
| Narcolepsy | Sleep | Limited TMS evidence; HRV data | EV-D |
| Vestibular Disorders | Neurological | tDCS galvanic vestibular stimulation evidence | EV-C |
| Post-COVID Neurological Syndrome | Neurological | Emerging TMS/tDCS evidence; high clinical need | EV-C/D |
| Dystonia | Movement | DBS strong evidence; rTMS adjacent | EV-A (DBS); EV-C (TMS) |
| Essential Tremor (expanded) | Movement | DBS and TPS evidence; expand from existing entry | EV-A (DBS); EV-B (TPS) |
| Spasticity (post-stroke) | Rehabilitation | rTMS M1 inhibitory protocols | EV-B |
| Chemotherapy-Induced Peripheral Neuropathy | Pain | tDCS and rTMS pain protocols; oncology context | EV-C |

> **Risk areas:**
> - Pediatric conditions require GOV-012 dual review for all associated protocols
> - Post-COVID is a rapidly evolving evidence domain — source dates are critical; flag for 6-month review cycle
> - Developmental Delay protocols must include explicit age range and diagnosis specificity requirements

---

### 2.3 Protocols — Add 25 New Records

#### International Device Protocols (+5)
- rTMS (MagPro R30) — MDD: Replicate established parameters on MagVenture platform with device-specific calibration notes
- taVNS (GammaCore Sapphire) — Migraine prophylaxis (non-invasive vagus nerve stimulation, external)
- taVNS (Cerbomed Nemos) — Epilepsy seizure reduction (EU protocol basis)
- DBS (Abbott Infinity) — Parkinson's directional stimulation protocol
- DBS (Boston Scientific Vercise Genus) — Essential Tremor (Vim DBS with EU labeling)

#### Pediatric Protocols (+5, all GOV-012 flagged)
- rTMS (child-adapted coil positioning) — Pediatric ADHD (10 Hz DLPFC; EV-C; age ≥ 12)
- Neurofeedback theta/beta — Pediatric ADHD (Atlantis II+; EV-D per Cortese 2024; age ≥ 6)
- tDCS anodal M1 — Cerebral palsy motor (HD-tDCS; EV-D; age ≥ 8; informed consent requirements)
- Neurofeedback SCP — Developmental Delay (slow cortical potential training; EV-D)
- HRV Biofeedback (Thought Technology) — Pediatric anxiety (EV-C; age ≥ 8)

#### Post-COVID / Fatigue Protocols (+3)
- tDCS DLPFC anodal — Post-COVID cognitive fatigue (Brem et al. basis; EV-C)
- rTMS 10 Hz DLPFC — Post-COVID depression/fatigue (EV-C; flag for ongoing RCT updates)
- HRV Biofeedback — Post-COVID autonomic dysregulation (HeartMath ProComp basis; EV-C)

#### Spasticity / Rehabilitation Protocols (+4)
- Low-frequency rTMS contralesional M1 — Spasticity (1 Hz; inhibit overactive hemisphere)
- tDCS cathodal contralesional M1 — Spasticity (2 mA; 20 min)
- rTMS SMA — Dystonia (1 Hz; supplementary motor area; EV-C)
- DBS GPi — Dystonia (Globus pallidus internus target; EV-A; Abbott Infinity or Vercise Genus)

#### Sleep / Fatigue Protocols (+4)
- tACS delta — OSA-related fatigue (slow oscillation entrainment; EV-D; research only)
- Neurofeedback SMR — Narcolepsy daytime sleepiness (EV-D)
- HRV Biofeedback — Sleep quality improvement (HeartMath protocol; EV-C)
- CES — OSA fatigue adjunct (Alpha-Stim M; 0.5 Hz; EV-C)

#### Pain Protocols (+4)
- tDCS M1 anodal — Chemotherapy neuropathy (2 mA; 20 min; Fregni basis)
- rTMS M1 high-frequency — Neuropathic pain (10 Hz; motor cortex; Lefaucheur 2020 meta-analysis)
- rTMS DLPFC — Chronic pain with comorbid depression (sequential or combined)
- DBS PAG/PVG — Refractory pain (Periaqueductal gray; EV-A; older literature base)

---

### 2.4 Assessments — Add 5 New Records

| Assessment | Type | Target Condition(s) |
|------------|------|---------------------|
| Conners' Rating Scales–3rd Ed. (Conners-3) | Clinician-rated | Pediatric ADHD |
| Pediatric Quality of Life Inventory (PedsQL) | Self-report | Pediatric conditions |
| Dystonia Rating Scale (UMDRS) | Clinician-rated | Dystonia |
| Post-COVID Functional Status Scale (PCFS) | Self-report | Post-COVID neurological |
| Brief Fatigue Inventory (BFI) | Self-report | CFS/ME, Post-COVID, Chemo neuropathy |

---

### 2.5 Sources — Add 7 New Records

| Source | Type | Relevance |
|--------|------|-----------|
| EUDAMED device registry (ec.europa.eu/tools/eudamed) | Regulatory | EU device verification |
| PMDA Japan — Medical Device Approval Database | Regulatory | Japanese regulatory basis |
| TGA ARTG (Australia) | Regulatory | Australian regulatory basis |
| Lefaucheur et al. (2020) — EAN TMS guidelines update (Clinical Neurophysiology) | Guideline | Comprehensive TMS indications |
| Mori et al. (2022) — tDCS post-COVID meta-analysis | Meta-analysis | Post-COVID protocols |
| NICE NG208 — Chronic pain (2021) | Guideline | Pain condition protocols |
| Krauss et al. (2021) — DBS for movement disorders review | Review | Dystonia/movement DBS evidence |

---

### 2.6 Phase 2 Risk Areas

| Risk | Affected Records | Mitigation |
|------|-----------------|------------|
| EUDAMED data availability varies | EU device records | Document EUDAMED status as of date; flag incomplete entries |
| Regulatory terminology differs by region | International devices | Record country-specific approval pathway explicitly; do not conflate FDA/CE/TGA |
| Pediatric protocols require extra governance | All pediatric records | GOV-012 flag mandatory; require institutional review documentation |
| Post-COVID evidence evolves rapidly | Post-COVID protocols | 6-month mandatory review cycle; source dates visible in record |
| Device variant naming conflicts | EU/US same-brand variants | Use manufacturer part number as secondary ID to disambiguate |

### 2.7 Phase 2 QA Checkpoints

- [ ] All EU devices verified against EUDAMED or CE certificate; date of verification recorded
- [ ] All pediatric protocols carry GOV-012 dual review flag
- [ ] Post-COVID condition records tagged for 6-month evidence review cycle
- [ ] Dystonia protocols split correctly between EV-A (DBS) and EV-C (TMS)
- [ ] No pediatric protocol references adult dosimetry without adaptation note
- [ ] International regulatory status strings use region prefix (e.g., "EU CE", "JP PMDA", "AU TGA")

---

## Phase 3: Advanced & Emerging (Months 5–6)

### Overview

Phase 3 covers frontier modalities and rare conditions where evidence is predominantly EV-C or EV-D. The goal is comprehensive coverage, not implied efficacy. All Phase 3 entries must carry explicit evidence grade documentation and, where applicable, research-only designations.

**Phase 3 Record Targets:**

| Table | End-of-Phase Count | Net Added |
|-------|--------------------|-----------|
| Devices | 75 | +16 |
| Conditions | 50 | +10 |
| Protocols | 100 | +18 |
| Assessments | 60 | +3 |
| Sources | 50 | +3 |

---

### 3.1 Devices — Add 16 New Records

#### Focused Ultrasound Devices (+4)

> Note: Low-intensity focused ultrasound (LIFU) and high-intensity MRgFUS are distinct pathways. DBS-equivalent MRgFUS (thalamotomy) has FDA approval; therapeutic neuromodulation LIFU does not.

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Insightec Exablate Neuro | Insightec | FDA PMA P150038 (essential tremor thalamotomy) | NOT neuromodulation; ablative procedure |
| Sonic Concepts LIFU system | Sonic Concepts | Research only; IRB required | Low-intensity TUS; EV-D |
| Brainsonix NeuroFUS | Brainsonix | Research only | Transcranial focused ultrasound |
| Transoral ultrasound (iTUS) exploratory | Various | No regulatory clearance | Document as emerging; EV-D |

#### Closed-Loop Neurostimulation Devices (+4)

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Medtronic Percept PC DBS | Medtronic | FDA PMA P200021 | Adaptive/sensing DBS; LFP biomarker |
| Abbott Infinity with BrainSense | Abbott | FDA PMA supplement | Next-gen adaptive DBS |
| NeuroPace RNS System | NeuroPace | FDA PMA P100026 | Responsive neurostimulation; epilepsy |
| Nalu Medical MSP | Nalu | FDA 510(k) | SCS adjacent; micro-implant |

#### Next-Gen Neurofeedback (Real-Time fMRI) (+3)

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Siemens Prisma (rtfMRI-NF) | Siemens | Research use only (scanner + protocol) | Real-time fMRI neurofeedback platform |
| Trimble rtfMRI-NF system | Trimble/Turbo-BrainVoyager | Research only | Software + scanner combination |
| EEG-fMRI hybrid NFB | Multisite research | IRB protocols only | Combined modality; no commercial device |

#### Combination Devices (+3)

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| TMS + EEG integrated (Nexstim eXimia) | Nexstim | CE Mark; research | TMS-EEG concurrent recording |
| tDCS + EEG (Neuroelectrics Enobio) | Neuroelectrics | CE Mark; research | Stimulation + recording |
| PBM + NFB combination platform | Multiple | No single FDA-cleared combo device | Document separately; EV-D |

#### Additional PBM Devices (+2)

| Device | Manufacturer | Regulatory Status | Notes |
|--------|-------------|-----------------|-------|
| Vielight Neuro Gamma | Vielight | Health Canada; CE Mark; US wellness | Photobiomodulation; 40 Hz intranasal |
| MedX Health Transcranial PBM | MedX | CE Mark; research | Transcranial photobiomodulation |

---

### 3.2 Conditions — Add 10 New Records

| Condition | Category | Priority Justification | Expected Evidence Grade |
|-----------|----------|----------------------|------------------------|
| Tourette Syndrome | Movement/Tic | DBS and rTMS emerging evidence | EV-C (TMS); EV-C/D (DBS for severe) |
| Huntington's Disease | Neurodegeneration | TMS palliative; DBS investigational | EV-D |
| Atypical Parkinsonism (PSP, MSA) | Movement | DBS limited efficacy; rTMS symptomatic | EV-D |
| Disorders of Consciousness (DOC) | Consciousness | tDCS/TMS recovery evidence; high ethical sensitivity | EV-D; special ethics flag |
| Coma Recovery | Consciousness | Emerging evidence; high stakes; tDCS research | EV-D; IRB/ethics mandatory |
| Cervical Dystonia | Movement | DBS GPi; rTMS SMA; botulinumtoxin comparison needed | EV-B (DBS); EV-C (TMS) |
| Spinal Cord Injury — neuropathic pain | Neurotrauma | rTMS M1; tDCS; significant unmet need | EV-C |
| Addiction — Alcohol Use Disorder | Addiction | TMS DLPFC evidence; expand from Addiction (general) | EV-B (rTMS DLPFC) |
| Gambling Disorder | Addiction | rTMS evidence emerging; DLPFC target | EV-D |
| Eating Disorders (Anorexia/Bulimia) | Psychiatric | rTMS; tDCS evidence; growing interest | EV-C |

> **Risk areas:**
> - DOC and Coma Recovery require ethics committee consultation before protocol activation; flag GOV-012 + new ethics flag
> - Huntington's and atypical Parkinsonism: distinguish from typical PD DBS evidence
> - Addiction subtypes: evidence is condition-specific; do not generalize across substances or behaviors

---

### 3.3 Protocols — Add 18 New Records

#### Consciousness Disorders Protocols (+3)
- tDCS DLPFC anodal — Minimally Conscious State (Thibaut et al. basis; EV-D; ethics flag mandatory)
- rTMS M1 20 Hz — DOC motor facilitation (research only; EV-D)
- Median nerve stimulation (peripheral) — Coma recovery adjunct (EV-D; documented IRB required)

#### Tourette / Tic Disorder Protocols (+2)
- Low-frequency rTMS SMA — Tourette's (1 Hz; suppress tic circuits; EV-C)
- DBS GPi/CM-Pf thalamus — Severe Tourette's (EV-C; specialist DBS team required)

#### Closed-Loop DBS Protocols (+3)
- Adaptive DBS (Medtronic Percept PC) — Parkinson's (LFP-triggered stimulation; EV-B)
- Adaptive DBS (Abbott Infinity BrainSense) — Parkinson's (personalized amplitude; EV-B)
- RNS Protocol — Epilepsy (NeuroPace; closed-loop seizure detection + stimulation; EV-A)

#### Focused Ultrasound Protocols (+2)
- LIFU M1 — Motor learning enhancement (Deffieux basis; EV-D; research only)
- LIFU PFC — Mood modulation (preclinical evidence; EV-D; research only)

#### Addiction Protocols (+3)
- rTMS DLPFC — Alcohol Use Disorder (10 Hz; Addolorato et al.; EV-B)
- rTMS DLPFC — Cocaine Use Disorder (10 Hz; Bolloni basis; EV-C)
- rTMS DLPFC — Gambling Disorder (10 Hz; emerging evidence; EV-D)

#### Eating Disorder Protocols (+2)
- rTMS DLPFC left — Bulimia Nervosa (10 Hz; Van den Eynde basis; EV-C)
- tDCS DLPFC — Anorexia Nervosa (2 mA; Khedr basis; EV-C)

#### Spinal Cord Injury Protocols (+2)
- rTMS M1 contralateral — SCI neuropathic pain (10 Hz; Lefaucheur meta-analysis; EV-C)
- tDCS M1 anodal — SCI pain and motor (2 mA; Kumru basis; EV-C)

#### PBM Protocols (+1)
- Transcranial PBM (Vielight Neuro Gamma) — MCI/Alzheimer's (40 Hz; Saltmarche 2017 basis; EV-D)

---

### 3.4 Assessments — Add 3 New Records

| Assessment | Type | Target Condition(s) |
|------------|------|---------------------|
| Coma Recovery Scale–Revised (CRS-R) | Clinician-rated | DOC, Coma Recovery |
| Yale Global Tic Severity Scale (YGTSS) | Clinician-rated | Tourette Syndrome |
| Eating Disorder Examination Questionnaire (EDE-Q) | Self-report | Eating Disorders |

---

### 3.5 Sources — Add 3 New Records

| Source | Type | Relevance |
|--------|------|-----------|
| Thibaut et al. (2023) — tDCS for DOC: updated meta-analysis | Meta-analysis | Consciousness disorder protocols |
| Addolorato et al. (2017) — rTMS for AUD (JAMA Psychiatry) | RCT | Alcohol use disorder protocol |
| FDA PMA P100026 (NeuroPace RNS) | Regulatory | Closed-loop RNS device verification |

---

### 3.6 Phase 3 Risk Areas

| Risk | Affected Records | Mitigation |
|------|-----------------|------------|
| Most Phase 3 entries are EV-C/D | All Phase 3 protocols | Do not allow evidence grade inflation; document grade justification explicitly |
| Regulatory status for novel devices often unclear | LIFU, rtfMRI-NFB, combo devices | Mark as "Research Use Only" with IRB requirement; no clinical indication claims |
| Closed-loop devices may have novel risk profiles | Adaptive DBS, RNS | Reference original PMA safety data; document stimulation parameter constraints |
| DOC/Coma protocols carry ethical complexity | DOC protocols | Mandatory ethics flag; GOV-012 + new GOV-014 (ethics consult required) |
| Huntington's/atypical PD has weak or absent DBS evidence | Movement neurodegen. conditions | EV-D mandatory; clearly differentiate from typical PD evidence base |

### 3.7 Phase 3 QA Checkpoints

- [ ] All LIFU and rtfMRI-NFB devices explicitly designated "Research Use Only" with no cleared indications
- [ ] Closed-loop DBS protocols reference specific PMA document for safety parameters
- [ ] DOC and Coma protocols carry mandatory ethics consultation flag in governance field
- [ ] No Phase 3 protocol assigned EV-A or EV-B without explicit meta-analysis/guideline source
- [ ] Addiction subtypes (alcohol, cocaine, gambling) have separate condition records — not merged
- [ ] RNS protocol (NeuroPace) references PMA P100026 specifically

---

## Phase 4: Maintenance and Quality (Ongoing)

### 4.1 Quarterly Evidence Review Cycle

Every 3 months, the following systematic review should be conducted:

| Task | Scope | Responsible | Output |
|------|-------|-------------|--------|
| Evidence grade audit | All EV-C and EV-D records | Research team | Upgrade/downgrade log |
| New meta-analysis check | PubMed, Cochrane | Source Discovery Agent | New source records |
| Neurofeedback ADHD grade lock | NFB/ADHD records | Senior reviewer | Confirmation memo |
| tACS regulatory status check | All tACS devices | Regulatory agent | Status update |
| Post-COVID protocol review | All Post-COVID records | Research team | Evidence grade updates |

**Neurofeedback ADHD grade stability rule:** The EV-D grade for neurofeedback in ADHD (Cortese 2024) should not be changed without a systematic review from a recognized body (APA, NICE, CANMAT, AAP) explicitly superseding Cortese 2024. A new meta-analysis alone is insufficient — it must achieve guideline endorsement.

---

### 4.2 Monthly Regulatory Monitoring

#### FDA Monitoring

| Database | URL | What to Check |
|----------|-----|--------------|
| 510(k) Premarket Notifications | https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm | New neuromodulation clearances; product codes QNO, QEB, GWC, OLY, LGX, IYO |
| PMA Approvals | https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm | New PMA approvals and supplements for neuromodulation devices |
| Device Classification Database | https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPCD/classification.cfm | Product code changes; new classification codes for neuromodulation |
| MAUDE Adverse Events | https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfmaude/search.cfm | Adverse event signals for existing devices |
| De Novo Requests | https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/denovo.cfm | Novel device authorizations without predicate |

**Key neuromodulation product codes to monitor:**
- `QNO` — Transcranial magnetic stimulator
- `QEB` — tDCS/electrical brain stimulation
- `GWC` — Vagus nerve stimulator
- `OLY` — Deep brain stimulator
- `LGX` — Electroencephalograph (neurofeedback-related)
- `IYO` — Photobiomodulation

---

### 4.3 Monthly EUDAMED Check

- URL: https://ec.europa.eu/tools/eudamed
- Search terms: "neuromodulation", "neurostimulation", "transcranial magnetic", "deep brain stimulator", "vagus nerve", "transcranial direct current"
- Focus: New MDR-registered devices; devices transitioning from MDD to MDR; devices with changes to intended purpose
- Note: EUDAMED implementation is phased; not all devices are fully registered. Cross-check CE certificates with manufacturer documentation when EUDAMED entry is absent or incomplete.

---

### 4.4 Monthly PubMed Search

**Recommended search string:**
```
(systematic review[pt] OR meta-analysis[pt]) AND (TMS[tiab] OR rTMS[tiab] OR tDCS[tiab] OR neurostimulation[tiab] OR neurofeedback[tiab] OR "vagus nerve stimulation"[tiab] OR "deep brain stimulation"[tiab] OR TPS[tiab] OR "photobiomodulation"[tiab] OR "focused ultrasound"[tiab] OR CES[tiab] OR taVNS[tiab]) AND ("last 30 days"[dp])
```

**Alert triggers:**
- Any meta-analysis challenging a currently-held EV-A or EV-B grade → immediate review
- Any meta-analysis for a currently EV-D condition showing positive results from ≥2 RCTs → upgrade review
- Any guideline publication from APA, CANMAT, NICE, EAN, RANZCP, WFSBP → immediate guideline intake

---

### 4.5 Quarterly Guideline Check

| Organization | Database/URL | What to Check |
|-------------|-------------|--------------|
| American Psychiatric Association (APA) | https://www.psychiatry.org/psychiatrists/practice/clinical-practice-guidelines | TMS, DBS, ECT; all psychiatric conditions |
| CANMAT (Canadian Network for Mood and Anxiety Treatments) | https://www.canmat.org/publications/ | TMS, MDD, bipolar, anxiety; annual updates |
| NICE (National Institute for Health and Care Excellence) | https://www.nice.org.uk/guidance | All conditions; technology appraisals for devices |
| EAN (European Academy of Neurology) | https://www.ean.org/science-research/guidelines | TMS, DBS, VNS; neurological conditions |
| RANZCP (Royal Australian and NZ College of Psychiatrists) | https://www.ranzcp.org/clinical-guidelines-publications | TMS; Australasian evidence grading |
| WFSBP (World Federation of Societies of Biological Psychiatry) | https://www.wfsbp.org/guidelines/ | International TMS/neuromodulation guidelines |
| AAN (American Academy of Neurology) | https://www.aan.com/Guidelines/ | DBS, VNS, neurostimulation in neurology |

---

### 4.6 Source URL Verification

All 50 source records should have active URLs verified quarterly using an automated URL checker. Records where the URL returns 404 or redirect should be flagged immediately. DOI-based sources should be verified via https://doi.org resolution. Where a guideline has been superseded by a newer version, the record should be updated to reference the current version with an archived note for the prior version.

---

### 4.7 Protocol Parameter Verification

Protocol parameter fields (pulse count, intensity in mA or % MT, frequency in Hz, session count, inter-session interval) should be verified against the primary source document annually. Parameters should never be left as "per manufacturer recommendation" without a specific citation. Where a source document has been updated or superseded, parameters must be re-verified.

**Critical parameters that must always have explicit source citations:**
- rTMS: frequency, intensity (% MT), pulses per session, total sessions
- tDCS: current (mA), electrode size (cm²), session duration (min), total sessions
- DBS: electrode target, programming parameters (note: these are clinician-adjusted; document target and initial range only)
- VNS: pulse width, frequency, current (for implanted); duty cycle settings

---

## Appendix A: Table-Level Expansion Summary

| Phase | Period | +Devices | +Conditions | +Protocols | +Assessments | +Sources | Cumulative Total |
|-------|--------|---------|------------|-----------|-------------|---------|-----------------|
| Baseline | — | 19 | 20 | 32 | 42 | 30 | 201 |
| Phase 1 | M1–2 | +20 | +10 | +25 | +10 | +10 | 277 |
| Phase 2 | M3–4 | +20 | +10 | +25 | +5 | +7 | 344 |
| Phase 3 | M5–6 | +16 | +10 | +18 | +3 | +3 | 394 |
| Secondary (Symptoms, etc.) | M1–6 | — | — | — | — | — | ~415 |

---

## Appendix B: Regulatory Reference Quick Guide

| Regulatory Pathway | Meaning | Database |
|-------------------|---------|---------|
| FDA 510(k) — Cleared | Substantially equivalent to a predicate device; cleared for marketing | FDA PMDN |
| FDA PMA — Approved | Highest FDA standard; demonstrated safety AND effectiveness | FDA PMA |
| FDA De Novo — Authorized | Novel device without predicate; authorized after independent review | FDA De Novo |
| FDA Breakthrough Device | Designation only; does not confer clearance or approval | FDA BDDP |
| CE Mark (EU MDD/MDR) | European conformity; access to EU market | EUDAMED |
| TGA ARTG (Australia) | Australian Register of Therapeutic Goods entry | TGA ARTG |
| PMDA (Japan) | Pharmaceuticals and Medical Devices Agency approval | PMDA |
| Health Canada | Canadian medical device license | Health Canada |

> **Mandatory rule (GOV-008):** The terms "FDA approved," "FDA cleared," "CE marked," and "TGA approved" must never be used interchangeably in any database record. Each record must state the precise regulatory pathway.

---

*Document prepared for DeepSynaps Studio internal use. All device regulatory status information must be independently verified against primary regulatory databases before publication. This plan reflects expansion targets as of the database baseline and does not constitute clinical guidance.*
