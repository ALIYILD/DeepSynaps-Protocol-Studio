# DeepSynaps Protocol Studio: World-Class Clinical Research Intelligence Roadmap

> **Research Date**: July 2025
> **Researcher**: Clinical Research Intelligence Analyst
> **Purpose**: Benchmark analysis, evidence synthesis, open-source opportunity mapping, and UX pattern recommendations for the DeepSynaps Protocol Studio -- a clinical operating system for neuromodulation protocols, assessment batteries, and evidence-based treatment workflows.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Benchmark Analysis: Clinical Protocol/Assessment Platforms](#2-benchmark-analysis)
   - 2.1 [Creyos (Cognitive Testing)](#21-creyos)
   - 2.2 [Mentalyc (AI Clinical Documentation)](#22-mentalyc)
   - 2.3 [NeuroFlow (Behavioral Health Platform)](#23-neuroflow)
   - 2.4 [Maven Clinic (Women's Health Platform)](#24-maven-clinic)
   - 2.5 [Neurotech Startup Landscape 2024-2025](#25-neurotech-landscape)
   - 2.6 [FDA-Cleared Digital Assessment/Neuromodulation Tools](#26-fda-cleared-tools)
3. [Evidence-Based Neuromodulation Protocols](#3-evidence-based-neuromodulation-protocols)
   - 3.1 [tDCS Clinical Protocols & Evidence](#31-tdcs-protocols)
   - 3.2 [TMS Treatment Protocols & Guidelines](#32-tms-protocols)
   - 3.3 [Safety Parameters & Contraindications](#33-safety-parameters)
   - 3.4 [Emerging Personalized Approaches (qEEG-guided)](#34-personalized-approaches)
4. [Open-Source Integration Opportunities](#4-open-source-integration-opportunities)
5. [UX Pattern Recommendations](#5-ux-pattern-recommendations)
6. [Implementation Roadmap](#6-implementation-roadmap)
7. [Research Sources & Citations](#7-research-sources)

---

## 1. Executive Summary

This research intelligence report provides a comprehensive analysis of the clinical protocol/assessment platform landscape to inform the development of the **DeepSynaps Protocol Studio** -- a world-class clinical OS for neuromodulation, neuropsychology, and digital health.

### Key Findings

**Market Context**: The digital brain health market is valued at $248.62B (2025) and projected to reach $478.53B by 2034 (CAGR 7.55%). Neuromodulation funding reached ~$1.4B in 2023-2025, making it the fastest-growing pillar of braintech after digital interfaces. Capital is shifting from pure-software platforms toward multimodal solutions combining AI, neuromodulation, imaging, and advanced neurodevices.

**Evidence Status for Neuromodulation (2024-2025)**:
- **tDCS for Depression**: Home-based tDCS (10 weeks, 2 mA, 30 min) demonstrated significant superiority vs. sham in a fully remote Phase 2 RCT (Nature Medicine, 2024) with response rates 2-3x greater than sham. Meta-analysis of 88 RCTs (n=5,522) confirms tES reduces depressive symptoms (SMD = -0.59) with low quality of evidence.
- **HD-tDCS**: Personalized neuronavigated HD-tDCS (12 days, 20 min) showed moderate effect size (Cohen's d = -0.50) for MDD in JAMA Network Open (2025), with faster onset than conventional approaches.
- **Combined rTMS + tDCS**: RCT of 240 patients showed combined therapy superior to monotherapy for MDD with anxiety (82.83% anxiety response rate vs. sham) (BMJ Mental Health, 2026).
- **TMS/iTBS**: FDA-cleared theta burst protocols (3-minute sessions) are now considered equivalent to standard 10 Hz rTMS. Accelerated deep iTBS (5 sessions/day x 6 days) was FDA-cleared in 2025. SAINT protocol (10 sessions/day x 5 days with fMRI-guided targeting) cleared in 2022.
- **Maintenance TMS**: Low-frequency rTMS to right DLPFC showed comparable relapse prevention to lithium pharmacotherapy (MAINT-R trial, JAMA Network Open, 2025).

**Platform Benchmarking Insights**:
- **Creyos** excels at customizable assessment batteries, automated scoring, EHR integration (Redox/athenahealth), and multilingual patient experience with WCAG accessibility.
- **Mentalyc** demonstrates how AI can transform clinical documentation with cross-session analytics, treatment plan continuity ("golden thread"), and modality-aware note generation (SOAP/DAP/BIRP).
- **NeuroFlow** prioritizes UX through heuristic evaluation (6 criteria: understandable, effective, efficient, forgiving, engaging, accessible) and measurement-based care at scale.
- **Maven Clinic** operates a protocol-driven virtual care model with MPractice EMR, evidence-based care pathways, and multidisciplinary team coordination across 30+ specialties.

**Open-Source Opportunities**: Several MIT/Apache-licensed tools were identified for integration including cognitive test batteries (p5.js-based and Python-based), FHIR interoperability frameworks (Microsoft FHIR Server, FHIR-Former, FHIRBoard), clinical decision support systems, and the OpenStudyBuilder for clinical study specifications.

---

## 2. Benchmark Analysis

### 2.1 Creyos (Cognitive Testing Platform)

**What it is**: A digital cognitive and behavioral health assessment platform that enables remote or in-person administration of validated cognitive tasks and questionnaires.

#### Key UX Patterns That Make It Doctor-Friendly

| Pattern | Implementation | What DeepSynaps Can Learn |
|---------|---------------|--------------------------|
| **Custom Protocol Builder** | Drag-and-drop task/questionnaire selection; save reusable protocols; reorder via click-and-drag | Build protocol templates for different neuromodulation indications (depression, anxiety, OCD, ADHD) |
| **One-Time vs. Saved Protocols** | Two workflows: quick ad-hoc assessment vs. standardized reusable battery | Allow clinicians to create "Quick Assess" for follow-ups and "Deep Battery" for intake |
| **Automated Scoring & Reporting** | Instantaneous auto-scoring; norm-referenced results; visual summaries; PDF export | Integrate automated scoring for depression scales (PHQ-9, MADRS, HDRS) and cognitive tests |
| **EHR Integration** | Redox middleware + direct athenahealth/AdvancedMD integrations | Implement FHIR-based EHR connectivity from day one |
| **Remote Administration** | Send via email, generate link, or administer on-device | Enable telehealth-compatible remote assessment delivery |
| **Progress Tracking** | Longitudinal score comparison over time | Build session-by-session progress visualization for neuromodulation outcomes |

#### Assessment Battery Approaches
- **12+ cognitive tasks** covering: reasoning, verbal ability, memory, attention, executive function
- **Digitized validated questionnaires**: PHQ-9, PSQI, AUDIT, GAD-7, plus condition-specific instruments
- **Condition-based research guide**: Maps tasks/questionnaires to specific conditions (ADHD, depression, dementia, substance use)
- **Custom assessment builder**: Providers select tasks by cognitive domain or individual task
- **Gamified patient interface**: Virtual character guides, adaptive difficulty, short sessions (2-3 min/task)

#### Evidence Integration Methods
- Norm-referenced scoring with percentile comparisons
- Automated interpretation reports
- Visual summaries with red/yellow/green indicators
- PDF export for clinical records
- Integration with EHR for decision support context

#### What DeepSynaps Can Learn
1. **Protocol templating**: Allow clinicians to build condition-specific assessment batteries (e.g., "Pre-tDCS Depression Battery" = PHQ-9 + MADRS + cognitive tasks + sleep questionnaire)
2. **Automated scheduling**: Send assessments on automated schedules (pre-treatment, week 2, week 4, post-treatment)
3. **Accessibility-first patient UX**: WCAG-compliant colors, multilingual audio guidance, simplified instructions, dark mode for light-sensitive patients
4. **EHR integration via Redox or FHIR**: Don't build EHR integration from scratch; use established middleware
5. **Longitudinal data visualization**: Show patient progress across sessions with trend lines and change indicators

---

### 2.2 Mentalyc (AI Clinical Documentation)

**What it is**: An AI-powered clinical documentation platform for behavioral health that generates structured notes (SOAP, DAP, BIRP), treatment plans, progress tracking, and therapeutic alliance insights from session recordings.

#### Key UX Patterns That Make It Doctor-Friendly

| Pattern | Implementation | What DeepSynaps Can Learn |
|---------|---------------|--------------------------|
| **Multi-Input Capture** | Live listening, audio upload, dictation, or typed summary | Allow clinicians to capture session data via multiple modalities |
| **Structured Cross-Session Continuity** | Goals from Session 1 visible in Session 20; longitudinal trending | Build "golden thread" connecting treatment goals, symptoms, and interventions across neuromodulation sessions |
| **AI-Flagged Risk Detection** | Safety planning built into every note; nothing critical missed | Integrate automated contraindication checking and risk flagging into protocol workflow |
| **SMART Goal Extraction** | Auto-drafts SMART goals from session content | Extract patient goals from intake and track attainment across sessions |
| **One-Click EHR Sync** | Export to SimplePractice, TherapyNotes in one click | Build one-click protocol export to EHR |
| **5-Minute Setup** | No credit card, no software install, no data migration | Prioritize zero-friction onboarding for busy clinicians |

#### Assessment Battery Approaches
- **Note formats**: SOAP, DAP, BIRP, GIRP, PIE, SIRP, Intake, MSE, Biopsychosocial
- **Modality coverage**: CBT, DBT, EMDR, IFS, ACT, Play Therapy, Psychodynamic, 20+ more
- **Client types**: Individual, couples, child, family, group
- **Progress tracking**: Symptoms, goals, behaviors tracked automatically from sessions without separate questionnaires
- **Alliance Genie**: Therapeutic alliance scores derived from session content (not questionnaires)

#### Evidence Integration Methods
- Cross-session analytics computing patterns and treatment response
- CPT code recommendations based on session content
- Risk assessment and safety planning built into every note
- Supervision notes linked to session data

#### What DeepSynaps Can Learn
1. **"Golden Thread" architecture**: Every neuromodulation session should link back to the original treatment goals and baseline assessment
2. **Cross-session analytics**: Track symptom trajectory, treatment response patterns, and alliance shifts across neuromodulation course
3. **AI-assisted documentation**: Generate structured neuromodulation session notes (stimulation parameters, patient response, side effects, next-session plan)
4. **Risk detection automation**: Flag contraindications, adverse events, and clinical deterioration automatically
5. **Template builder**: Allow practices to customize note formats and protocol templates

---

### 2.3 NeuroFlow (Behavioral Health Platform)

**What it is**: A comprehensive behavioral health platform focused on measurement-based care, clinical decision support, and consumer engagement through integrated care team dashboards.

#### Key UX Patterns That Make It Doctor-Friendly

| Pattern | Implementation | What DeepSynaps Can Learn |
|---------|---------------|--------------------------|
| **6-Quality Heuristic Framework** | Understandable, Effective, Efficient, Forgiving, Engaging, Accessible | Adopt these as core design principles |
| **Care Team Dashboards** | Performance management for at-risk populations; monitoring clinical intervention impact | Build "Protocol Command Center" showing all active patients, risk flags, protocol adherence |
| **Evidence-Based MBC at Scale** | Patient-reported outcome measures integrated for ongoing treatment intelligence | Integrate PHQ-9, GAD-7, sleep scales into neuromodulation workflow |
| **Gamified Consumer Engagement** | Personalized experience encouraging continuous monitoring via behavioral economics | Use progress visualization and session milestones to maintain patient engagement |
| **Interoperability-First Design** | EHR/system integrations that minimize administrative burden | Build FHIR-native from the ground up |

#### Assessment Battery Approaches
- Evidence-based screening and outcome measures
- Automated triage and intake workflows
- Consumer self-management tools
- Care team coordination features

#### What DeepSynaps Can Learn
1. **Heuristic-driven UX design**: Systematically evaluate the interface against the 6 qualities (understandable, effective, efficient, forgiving, engaging, accessible)
2. **Dashboard-first design**: Create a "command center" view for clinicians managing multiple neuromodulation patients
3. **Measurement-based care**: Integrate standardized assessments at every treatment milestone
4. **Progressive disclosure**: Show status at a glance; allow drill-down to detail

---

### 2.4 Maven Clinic (Women's Health Platform)

**What it is**: The world's largest virtual clinic for women and families, providing clinical, emotional, and financial support across fertility, maternity, parenting, pediatrics, and menopause.

#### Key UX Patterns That Make It Doctor-Friendly

| Pattern | Implementation | What DeepSynaps Can Learn |
|---------|---------------|--------------------------|
| **Protocol-Driven Care Model** | Evidence-based protocols for metabolic health, hormonal therapy, contraception | Build protocol library for neuromodulation indications with step-by-step guidance |
| **MPractice EMR** | Purpose-built electronic medical record for virtual care | Consider a purpose-built, lightweight EMR rather than full EHR replacement |
| **Multidisciplinary Team Coordination** | 30+ specialty types, 350+ subspecialties with seamless handoffs | Enable collaboration between psychiatrists, neurologists, neuropsychologists, and technicians |
| **Async + Sync Care Mix** | Video consultations + asynchronous messaging | Combine in-person neuromodulation sessions with async check-ins |
| **Clinical Protocol Development** | Clinicians contribute to workflow optimization, safety criteria, escalation frameworks | Create feedback loops where clinicians refine protocols over time |

#### Assessment Battery Approaches
- Condition-specific assessment pathways
- Virtual care with structured encounter documentation
- Care advocate team for referrals and follow-ups
- Quality assurance audits and clinician learning sessions

#### What DeepSynaps Can Learn
1. **Protocol-as-product**: Make clinical protocols a first-class feature, not an afterthought
2. **Multidisciplinary coordination**: Enable care teams to collaborate across specialties
3. **Quality assurance loops**: Build QA audit workflows and clinician learning sessions into the platform
4. **Scalable virtual care model**: Support both in-person and virtual neuromodulation delivery

---

### 2.5 Neurotech Startup Landscape 2024-2025

**Market Size**: $248.62B (2025) -> $478.53B (2034), CAGR 7.55% [^178^]

**Key Trends**:
1. **Neuromodulation is the fastest-growing technology pillar**: $1.4B in funding (2023-2025), expanding across pain, migraine, neurodegeneration, and mental health [^182^]
2. **Shift from software-only to multimodal**: Capital increasingly backs solutions combining AI + neuromodulation + imaging + wearable devices
3. **Women's brain health emerging**: New funding in 2025 for female-specific neurotechnology (e.g., Samphire Neuroscience's Nettle device for menstruation-related symptoms)
4. **FDA accelerating clearances**: Multiple new FDA clearances in 2024-2025 for accelerated TMS protocols and adolescent indications
5. **AI integration across all modalities**: From diagnostics and imaging to neuromodulation personalization and digital interfaces

**Top Players**:
- **Digital Therapeutics**: Akili Interactive, Pear Therapeutics, Happify Health
- **Cognitive Assessment**: Cogstate, Lumos Labs (Lumosity), BrainCheck, Altoida
- **Neuromodulation**: BrainsWay, Neurostar, Magnus Medical, Magstim, MagVenture
- **Digital Mental Health**: Headspace, Calm, Woebot Health, NeuroFlow
- **BCI/Neurodevices**: MindMaze, Emotiv, NeuroSky, Paradromics

#### What DeepSynaps Can Learn
1. **Position at the intersection**: DeepSynaps should sit at the convergence of neuromodulation + AI + assessment + protocol management
2. **Focus on personalization**: The market is moving from one-size-fits-all to individualized treatment based on brain mapping and functional connectivity
3. **Build for clinicians, not consumers**: B2B clinician-facing tools command higher value and have clearer regulatory pathways
4. **Plan for FDA landscape**: Understand FDA clearance pathways for digital tools that support neuromodulation

---

### 2.6 FDA-Cleared Digital Assessment & Neuromodulation Tools

#### FDA-Cleared TMS Devices (as of 2025)

| Device | Manufacturer | Clearance | Key Features |
|--------|-------------|-----------|--------------|
| **BrainsWay Deep TMS + accelerated iTBS** | BrainsWay | Sep 2025 | 5 sessions/day x 6 days; no fMRI needed |
| **BrainsWay Deep TMS** | BrainsWay | May 2025 | H-coil for deeper stimulation |
| **NeuroStar Advanced Therapy** | Neuronetics | Mar 2024 | Expanded to ages 15-21 |
| **Horizon 3.0 TMS** | Magstim | Jan 2023 | Standard + iTBS protocols |
| **Magnus SAINT Neuromodulation** | Magnus Medical | Sep 2022 | fMRI-guided, neuronavigated, 10 sessions/day |
| **Apollo TMS** | Magstim | Sep 2025 | Age 15+ expanded clearance |
| Various others | Multiple | 2016-2022 | Standard 10 Hz and iTBS protocols |

#### FDA-Cleared Digital Cognitive/Assessment Tools

| Tool | Developer | Status | Application |
|------|-----------|--------|-------------|
| **BalanSens** | BioSensics | FDA Registered | Balance/cognitive monitoring |
| **LEGSys** | BioSensics | FDA Registered | Early detection/screening |
| Various digital biomarker platforms | Multiple | In development | Cognitive assessment, remote monitoring |

#### What DeepSynaps Can Learn
1. **FDA clearance is achievable**: The regulatory pathway for neuromodulation support tools exists; plan for 510(k) or De Novo submission if making therapeutic claims
2. **Accelerated protocols are the future**: FDA is clearing condensed treatment schedules (SAINT: 5 days; BrainsWay accelerated: 6 days)
3. **Age expansion matters**: NeuroStar cleared for ages 15-21 in 2024; adolescent TMS is a growth area
4. **Personalized targeting is differentiating**: SAINT's fMRI-guided approach is its key competitive advantage

---

## 3. Evidence-Based Neuromodulation Protocols

### 3.1 tDCS Clinical Protocols & Evidence (2024-2025)

#### Depression Protocols

| Protocol | Parameters | Evidence Level | Key Study |
|----------|-----------|----------------|-----------|
| **Home-based tDCS (Flow/standard)** | 2 mA, 30 min, daily, 10 weeks | High (Phase 2 RCT, n=185) | Nature Medicine 2024 [^195^] |
| **HD-tDCS (neuronavigated)** | 1.5-2 mA, 20 min, 12 sessions | Moderate (RCT, n=71) | JAMA Network Open 2025 [^190^] |
| **Combined rTMS + tDCS** | rTMS (left DLPFC) + cathodal tDCS (right DLPFC), 10 sessions/2 weeks | High (RCT, n=240) | BMJ Mental Health 2026 [^189^] |
| **Home-based 3-week vs 6-week** | 2 mA, variable duration, 3-6 weeks | Moderate (RCT) | PMC 2025 [^193^] |

#### Key Findings from Recent Meta-Analyses
- **Meta-analysis of 88 RCTs (n=5,522)** [^194^]:
  - tES overall: SMD = -0.59 for depressive symptoms (low QOE)
  - tACS for MDD: SMD = -0.58 (HIGH QOE) -- tACS may be more effective than tDCS for MDD
  - tDCS + medication: SMD = -0.51 (moderate QOE), OR response = 2.25
  - Anodal left DLPFC placement associated with improved outcomes
  - Mild-moderate adverse events more frequent in tES groups

#### Anxiety Protocols
- HD-tDCS to left DLPFC showed significant anxiety improvement (exploratory analysis, P=.049, Cohen's d=-0.48) [^190^]
- Combined rTMS + tDCS: 82.83% anxiety response rate at week 2, 96.08% at week 4 [^189^]
- Right DLPFC cathodal tDCS may help anxiety through interhemispheric connectivity modulation

#### Cognitive Enhancement
- Home-based tDCS improved DSST scores (+6.62 points over 12 weeks) [^193^]
- tDCS added to cognitive training shows potential benefits on cognition in late-life depression

### 3.2 TMS Treatment Protocols & Evidence (2024-2025)

#### Standard Protocols

| Protocol | Parameters | Sessions | Duration | FDA Status |
|----------|-----------|----------|----------|------------|
| **Standard 10 Hz rTMS** | 10 Hz, left DLPFC, 120% MT | 30 + 6 taper | 20-40 min/session | Cleared |
| **Standard iTBS** | 50 Hz bursts at 5 Hz, left DLPFC | 36 sessions | ~3 min/session | Cleared |
| **Deep TMS (H-coil)** | 18 Hz or iTBS, bilateral DLPFC | 30 sessions | 20 min/session | Cleared |
| **Low-frequency rTMS** | 1 Hz, right DLPFC | Variable | 20-30 min | Maintenance |

#### Accelerated Protocols (2024-2025 FDA Clearances)

| Protocol | Parameters | Schedule | Duration | FDA Status |
|----------|-----------|----------|----------|------------|
| **SAINT (Magnus)** | iTBS, 1800 pulses, fcMRI-guided | 10/day x 5 days | ~3 min/session | Cleared 2022 |
| **Accelerated Deep iTBS** | iTBS, ~1980 pulses, H-coil | 5/day x 6 days, then 2/day weekly x 4 | <10 min/session | Cleared Sep 2025 |
| **Accelerated iTBS (adolescent)** | iTBS, 5/day x 2 days | 5/day x 2 days | ~3 min/session | Research 2025 |

#### Evidence Summary
- iTBS is non-inferior to 10 Hz rTMS for MDD (THREE-D trial; Clinical TMS Society endorsement 2023-2025) [^215^]
- Maintenance TMS is comparable to lithium for relapse prevention (MAINT-R trial, 2025) [^196^]
- Combining psychotherapy with rTMS may have additive benefits (needs more research)
- VA/DoD guidelines (2022): weak recommendation for rTMS after 2+ failed medication trials
- Clinical TMS Society (2025): rTMS should be offered after ONE failed antidepressant trial

### 3.3 Safety Parameters & Contraindications

#### tDCS Safety Parameters [^191^] [^216^]

| Parameter | Standard Limit | Typical Clinical Range |
|-----------|---------------|----------------------|
| Current intensity | Max 2 mA (consensus) | 1-2 mA |
| Current density | Max 0.08 mA/cm2 | 0.028-0.06 mA/cm2 |
| Session duration | Max 40 min | 20-30 min |
| Electrode size | Min 25 cm2 | 25-35 cm2 |
| Total sessions | No absolute limit | 10-30 sessions typical |
| Frequency | Daily or bid | Daily most common |

#### tDCS Precautions (No Absolute Contraindications) [^216^]

| Precaution | Management |
|------------|-----------|
| History of epilepsy/seizures | Risk-benefit assessment; avoid anode over seizurogenic focus |
| Structural head injury | Evaluate with imaging; may affect current distribution |
| Scalp injury/skin lesions | Avoid stimulation over affected area |
| Implanted medical devices | Consider distance from device; consult manufacturer |
| Pregnancy | Limited data; use caution |
| Concurrent medications | Document all; tianeptine associated with more AEs |
| Metal in head/eyes | Avoid if ferromagnetic near electrodes |
| Frequent/severe headaches | Monitor closely |
| Past adverse reaction to tDCS/TMS | Consider modified parameters or alternative |
| Family history of epilepsy | Lower threshold for caution |

#### TMS Contraindications [^213^]

| Contraindication Level | Condition |
|----------------------|-----------|
| **Absolute** | Ferromagnetic hardware in close contact with coil (cochlear implants) |
| **Relative** | Personal history of epilepsy/seizure disorder |
| **Relative** | Traumatic, vascular, tumoral, or infectious brain lesion |
| **Relative** | Intracranial ferromagnetic metal implants |
| **Relative** | Unstable neurological conditions |

#### Adverse Effects Profile

| Modality | Common AEs | Rare/Serious AEs |
|----------|-----------|-----------------|
| tDCS | Itching, tingling, burning sensation, mild headache, skin redness | Seizure (extremely rare), skin burn |
| TMS | Headache, scalp discomfort, facial twitching, jaw pain | Seizure (<0.01%), syncope, hearing loss |
| Combined | As above, no additive risk demonstrated | No SAEs in major RCTs |

### 3.4 Emerging Personalized Approaches (qEEG-Guided)

#### LORETA-Style qEEG for Protocol Personalization [^207^] [^209^]

1. **Brainwave Recording**: 19+ channel EEG recording in resting state and during task conditions
2. **Source Localization**: LORETA algorithms convert surface EEG into 3D brain activity maps
3. **Deviation Analysis**: Compare patient brain activity to normative databases to identify over/under-active regions
4. **Customized Targeting**: Select neuromodulation targets based on individual functional abnormalities
5. **Protocol Validation**: Use imaging (fMRI, qEEG) to confirm target engagement

#### qpTMS (qEEG-personalized TMS) [^209^]
- Uses functional qEEG brain mapping to identify root causes of symptoms
- Develops personalized treatment plan employing targeted TMS (qpTMS)
- Combined with neurofeedback and cognitive training for sustained results
- Claims medication-free approaches with long-term sustained results

#### Key Emerging Trends
- **Functional connectivity targeting**: SAINT protocol uses resting-state fMRI to identify individualized DLPFC targets based on functional connectivity to sgACC
- **Neuronavigation**: Frameless stereotactic neuronavigation for precise coil/electrode placement
- **AI-assisted analysis**: Machine learning models predicting treatment response from baseline EEG/fMRI
- **Real-time EEG monitoring**: Closed-loop systems adjusting stimulation parameters based on brain state

#### What DeepSynaps Should Include
1. **Safety screening module**: Automated contraindication checklist for both tDCS and TMS
2. **Protocol parameter database**: Evidence-based parameters for each indication (depression, anxiety, OCD, pain, cognitive enhancement)
3. **Personalization engine**: Interface for incorporating qEEG/fMRI data to customize targets
4. **Session-by-session tracking**: Stimulation parameters, patient response, adverse events, outcome measures
5. **Alert system**: Automatic flagging of safety concerns, protocol deviations, or insufficient progress
6. **Maintenance planning**: Tools for designing taper and maintenance schedules

---

## 4. Open-Source Integration Opportunities

### 4.1 MIT/Apache/BSD Licensed Tools

| Tool | License | Language | Use Case for DeepSynaps |
|------|---------|----------|------------------------|
| **cognitive-testbattery** (flowersteam) | Open source | JavaScript (p5.js) | Web-based cognitive assessment tasks (attention, memory, executive function) |
| **Charlie2** | MIT | Python | Cross-platform neurocognitive test battery with 9 tests (~30 min) |
| **masters-battery** | Open source | JavaScript (jsPsych) | Browser-based cognitive tasks for online assessment |
| **FHIR-Former** | MIT | Python | Transformer-based FHIR data processing for clinical decision support |
| **FHIRBoard** | MIT | Ruby/Rails | FHIR analytics and visualization dashboards |
| **FHIR Power** | MIT | Python | FHIR data flattening for NLP and ML pipelines |
| **FHIR Server for Azure** | MIT | C# | Production-grade FHIR server for interoperability |
| **OpenStudyBuilder** | MIT/GPLv3 | Python/Vue.js | Clinical study specification and protocol management |
| **healthcare-cdss** | Open source | Python/Streamlit | Clinical decision support dashboard (risk assessment, drug interactions) |
| **Nuts Demo EHR** | Open source | Go/Vue.js | FHIR-based EHR demo with care collaboration |

### 4.2 Assessment Engines That Could Integrate

1. **flowersteam/cognitive-testbattery** (GitHub)
   - 7 cognitive tasks: multiple-object tracking, enumeration, go/no-go, load-induced blindness, task-switching, working memory, memorability
   - Runs in browser via p5.js; can be deployed locally or on server
   - Gamified interface with virtual character guidance
   - Cross-day reliability demonstrated
   - **Integration path**: Embed tasks as iframe components; capture scores via API

2. **Charlie2** (GitHub - sammosummo)
   - 9 neurocognitive tests in Python; ~30 minutes
   - Cross-platform (Windows, tablet, Raspberry Pi)
   - Touchscreen-optimized
   - Trial-level data recording; resumable sessions
   - Automatic summary statistics
   - **Integration path**: Python backend integration; custom test modules for neuromodulation-specific assessments

3. **jsPsych-based batteries** (masters-battery, etc.)
   - JavaScript-based psychological experiments
   - Wide ecosystem of plugins
   - MySQL/Node.js backend
   - **Integration path**: Full-stack JavaScript integration for web-based assessment delivery

### 4.3 Report Generation Libraries

| Library | Language | Application |
|---------|----------|-------------|
| **FHIR-Former** | Python | FHIR data analysis, ICD coding, clinical prediction |
| **FHIRBoard** | Ruby | FHIR analytics dashboards with Apache Superset |
| **Streamlit** | Python | Rapid clinical dashboard prototyping (used by healthcare-cdss) |
| **OpenStudyBuilder** | Python/Vue | Study protocol generation, CRF design, dataset creation |

### 4.4 Clinical Workflow Frameworks

| Framework | Features | Integration Path |
|-----------|----------|-----------------|
| **OpenStudyBuilder** | Protocol development, CDISC standards (SDTM, ADaM), CRF design | Adapt for neuromodulation protocol specification |
| **Microsoft FHIR Server** | Full FHIR R4 support, RBAC, audit logs | Core interoperability infrastructure |
| **Nuts Demo EHR** | Care team collaboration, task management, FHIR-based | Reference architecture for care coordination |
| **healthcare-cdss** | Risk scoring, drug interactions, clinical text analysis, patient cohort analysis | Decision support module integration |

### 4.5 Open-Source Neurofeedback/EEG Tools

| Tool | License | Application |
|------|---------|-------------|
| **Neurosity SDK** | Open | JavaScript/Python SDK for Crown EEG device; real-time neurofeedback protocol building |
| **BrainFlow** | Open | Universal EEG/BCI signal processing library |
| **EEG-LLAMAS** | Open | Low-latency artifact removal for EEG-neurofeedback |
| **OpenBCI** | Open | Open-source brain-computer interface hardware/software |

### 4.6 Recommended Open-Source Architecture for DeepSynaps

```
DeepSynaps Protocol Studio Architecture

Frontend:
  - Vue.js 3 or React with TypeScript
  - Tailwind CSS + Headless UI components
  - Chart.js or D3.js for data visualization
  - p5.js (embedded) for cognitive tasks

Backend:
  - Python (FastAPI) for clinical logic
  - FHIR Server (Microsoft, MIT-licensed) for interoperability
  - PostgreSQL for structured data
  - Neo4j (optional) for protocol relationships

Assessment Engine:
  - Charlie2 (MIT) for desktop/tablet cognitive testing
  - cognitive-testbattery (p5.js) for web-based tasks
  - jsPsych plugins for experimental paradigms

Decision Support:
  - FHIR-Former (MIT) for clinical data analysis
  - healthcare-cdss (Open) for risk assessment
  - OpenStudyBuilder (MIT) for protocol management

EEG Integration:
  - BrainFlow for signal processing
  - Neurosity SDK for consumer EEG
  - Custom LORETA integration for qEEG analysis
```

---

## 5. UX Pattern Recommendations

### 5.1 Layout Patterns for Clinical Dashboards

Based on analysis of leading platforms (Creyos, Mentalyc, NeuroFlow, Maven) and healthcare UX research [^199^] [^202^] [^208^]:

#### Primary Layout: "Clinical Command Center"

```
+---------------------------------------------------+
|  [Logo]  [Patient Search]  [Alerts]  [Profile]    |  <- Top Bar
+---------------------------------------------------+
| Nav    |                                          |
|        |  STATUS CARDS (4-6 key metrics)          |
|  -     |  [Active Protocols] [Risk Flags]         |
| Dash-  |  [Pending Assess] [Today's Sessions]     |
| board  |                                          |
|        +------------------------------------------+
|  -     |                                          |
|  Pro-  |  PATIENT TIMELINE / SESSION LIST         |
|  tocols|  [Session 1] [Session 2] [Session 3]...  |
|        |  with progress indicators                |
|  -     |                                          |
|  As-   +------------------------------------------+
|  sess- |                                          |
|  ments|  DETAIL PANEL (contextual, right side)   |
|        |  [Patient Summary] [Latest Scores]       |
|  -     |  [Protocol Status] [Alerts]              |
|  Re-   |                                          |
|  ports |                                          |
|        |                                          |
+---------------------------------------------------+
```

#### Sidebar Navigation Pattern

| Section | Icon | Content |
|---------|------|---------|
| **Dashboard** | Activity/Grid | Status cards, alerts, today's schedule |
| **Patients** | Users | Patient list with risk indicators |
| **Protocols** | FileText | Protocol library, active protocols, protocol builder |
| **Assessments** | Clipboard | Assessment batteries, results, scoring |
| **Sessions** | Calendar | Session schedule, history, notes |
| **Evidence** | BookOpen | Protocol evidence, citations, guidelines |
| **Analytics** | BarChart | Population-level outcomes, quality metrics |
| **Settings** | Settings | User preferences, organization settings |

### 5.2 Information Hierarchy for Clinicians

**3-Layer Information Architecture** [^231^]:

1. **Status Layer** (glanceable, always visible):
   - Patient risk level (color-coded: green/yellow/red)
   - Protocol adherence percentage
   - Sessions completed / total
   - Latest outcome score trend (up/down/stable)

2. **Context Layer** (one click away):
   - Full assessment history with trend charts
   - Session notes with structured data
   - Protocol parameters and deviations
   - Safety alerts and contraindications

3. **Detail Layer** (drill-down):
   - Individual item-level responses
   - Raw EEG/fMRI data (if applicable)
   - Evidence citations for protocol choices
   - Audit trail of all changes

### 5.3 Showing Evidence Without Overwhelming

**Progressive Evidence Disclosure**:

```
[Protocol Card - Compact View]
+------------------------------------------------+
| tDCS Depression Protocol (Left DLPFC)    [ON]  |
| Evidence: Grade B | 12 RCTs | n=1,247         |
| Last updated: Clinical TMS Society 2025        |
+------------------------------------------------+
        | Click to expand
        v
[Protocol Card - Expanded View]
+------------------------------------------------+
| Key Evidence:                                  |
| - Nature Medicine 2024 (n=185): Home tDCS      |
|   showed 2-3x response vs sham               |
| - Meta-analysis 2025 (88 RCTs): SMD=-0.59    |
| Parameters: 2mA, 30min, daily, 10 weeks      |
| Contraindications: [Check]                     |
+------------------------------------------------+
        | Click for full evidence
        v
[Full Evidence Modal]
+------------------------------------------------+
| Complete citation list, risk of bias,          |
| forest plots, protocol deviations,             |
| regulatory status                              |
+------------------------------------------------+
```

**Evidence Badge System**:
- Grade A (High QOE): Green shield icon + "Strong Evidence"
- Grade B (Moderate QOE): Blue shield + "Moderate Evidence"
- Grade C (Low QOE): Yellow shield + "Limited Evidence"
- Grade D (Very Low QOE): Orange shield + "Emerging Evidence"
- Expert Consensus: Purple badge + "Clinical Consensus"

### 5.4 Alert/Red Flag Patterns (Non-Alarmist)

**Design Principles**:
1. **Signal-to-noise ratio**: Only alert on clinically significant events
2. **Contextual severity**: Use color + icon + text, not just red
3. **Actionable guidance**: Every alert should suggest next steps
4. **Non-blocking**: Alerts should inform, not interrupt workflow

| Alert Type | Visual Pattern | Sound | Action Required |
|------------|--------------|-------|-----------------|
| **Critical Safety** | Red pulse + icon + banner | Optional | Yes - immediate |
| **Protocol Deviation** | Orange card + icon | No | Review recommended |
| **Missing Assessment** | Yellow subtle badge | No | Schedule when ready |
| **Positive Milestone** | Green check + subtle animation | No | None - informational |
| **Evidence Update** | Blue info dot | No | Review at convenience |

**Alert Examples**:

```
[CRITICAL - Safety]
+---------------------------------------------+
| Patient reports new onset seizures.          |
| tDCS CONTRAINDICATED until evaluated.        |
| [View Details] [Contact Provider] [Dismiss]  |
+---------------------------------------------+

[WARNING - Protocol]
+---------------------------------------------+
| Session 8: Current density (0.09 mA/cm2)    |
| exceeds recommended maximum (0.08).          |
| [Adjust Parameters] [Override with Note]     |
+---------------------------------------------+

[INFO - Milestone]
+---------------------------------------------+
| Patient achieved >50% symptom reduction.     |
| Consider maintenance protocol planning.      |
| [View Protocol Options] [Schedule Review]    |
+---------------------------------------------+
```

### 5.5 Healthcare UX Best Practices Summary

Based on comprehensive research [^199^] [^202^] [^208^] [^231^]:

| Principle | Implementation |
|-----------|---------------|
| **Progressive Onboarding** | Role-specific guided tours; start with high-frequency tasks |
| **Contextual Help** | Tooltips for complex features; in-app guidance without clutter |
| **Mobile Responsiveness** | Key features accessible on tablet (clinicians use tablets) |
| **Fast Load Times** | Optimize for <2 second load; clinicians won't wait |
| **Keyboard Shortcuts** | Power-user shortcuts for common actions |
| **Accessibility (WCAG 2.1 AA)** | Required by HHS rule (May 2026); 4.5:1 contrast, screen reader support |
| **Dark Mode** | Essential for low-light clinical environments |
| **Consistent Color Language** | Same colors for same meanings across all screens |
| **Minimize Clicks** | Key actions within 2 clicks from dashboard |
| **Auto-Save** | Never lose clinical data due to session timeout |

---

## 6. Implementation Roadmap

### P0: Foundation (Months 1-3)

**Goal**: Core protocol management with evidence integration

| Feature | Description | Rationale |
|---------|-------------|-----------|
| **Safety Screening Module** | Automated contraindication checklist for tDCS/TMS | Patient safety is non-negotiable; required before any protocol can be generated |
| **Protocol Database** | Evidence-based protocol library (tDCS, TMS, iTBS for depression, anxiety, OCD) | Core value proposition; differentiation through evidence quality |
| **Session Documentation** | Structured session notes with stimulation parameters, patient response, AEs | Clinical workflow essential; replaces paper/electronic notes |
| **Outcome Tracking** | PHQ-9, GAD-7, MADRS, HDRS integration with longitudinal visualization | Measurement-based care is standard of care |
| **Evidence Badging** | Grade A/B/C/D evidence labels on all protocols | Transparency builds trust; differentiates from non-evidence-based tools |

### P1: Intelligence (Months 4-6)

**Goal**: AI-assisted protocol personalization and decision support

| Feature | Description | Rationale |
|---------|-------------|-----------|
| **Protocol Builder** | Custom protocol creation with drag-and-drop; save and share templates | Creyos-style customization for neuromodulation |
| **Cross-Session Analytics** | "Golden thread" linking goals, symptoms, interventions across sessions | Mentalyc-style clinical continuity |
| **Assessment Battery** | Integrated cognitive and symptom assessment (open-source tasks) | Pre/post assessment for treatment monitoring |
| **Alert Engine** | Safety alerts, protocol deviation warnings, milestone notifications | Non-alarmist alerting based on clinical significance |
| **FHIR Integration** | Connect to EHR via FHIR APIs | Interoperability is table stakes for clinical tools |

### P2: Scale (Months 7-12)

**Goal**: Advanced personalization, quality assurance, and research

| Feature | Description | Rationale |
|---------|-------------|-----------|
| **qEEG Integration** | Import and visualize qEEG/LORETA data for personalized targeting | Emerging standard for protocol personalization |
| **AI Protocol Recommendations** | ML-based protocol suggestions based on patient characteristics and response | Competitive differentiation; evidence-based personalization |
| **Multi-Site Dashboard** | Organization-level analytics, quality metrics, protocol adherence | Scale to group practices and health systems |
| **Research Module** | De-identified data export, study protocol alignment (CDISC), outcome reporting | Enable clinical research and publications |
| **Mobile App** | Patient-facing app for self-reported outcomes, session scheduling, progress view | Patient engagement drives outcomes |

---

## 7. Research Sources & Citations

### Peer-Reviewed Publications

1. **Jog MA et al.** (2025). "Personalized High-Definition Transcranial Direct Current Stimulation for the Treatment of Depression: A Randomized Clinical Trial." *JAMA Network Open*. 2025;8(9):e2531189. doi:10.1001/jamanetworkopen.2025.31189 [^190^]

2. **Nature Medicine** (2024). "Home-based transcranial direct current stimulation treatment for major depressive disorder: a fully remote phase 2 randomized sham-controlled trial." *Nature Medicine*. 2024;30:3061-3070. doi:10.1038/s41591-024-03305-y [^195^]

3. **BMJ Mental Health** (2026). "Efficacy of rTMS combined with tDCS in patients with major depressive disorder with anxiety: a randomised, double-blind, sham-controlled study." *BMJ Mental Health* 2026;29:e301952. [^189^]

4. **JAMA Network Open** (2025). "Repetitive Transcranial Magnetic Stimulation as Maintenance Treatment of Depression: The MAINT-R Randomized Clinical Trial." *JAMA Network Open*. 2025. [^196^]

5. **PMC Meta-Analysis** (2025). "Transcranial Electrical Stimulation in Treatment of Depression: Systematic Review and Meta-Analysis of Randomized Sham-Controlled Trials." *PMC*. Included 88 RCTs, n=5,522. [^194^]

6. **PMC** (2025). "Real-World Effects of Home-Based Transcranial Direct Current Stimulation in Major Depressive Disorder." Randomized controlled trial comparing 3-week vs 6-week protocols. ClinicalTrials.gov: NCT05539131 [^193^]

7. **Clinical TMS Society** (2025). Updated consensus review endorsed by National Network of Depression Centers and International Federation of Clinical Neurophysiology. [^210^]

8. **Clinical TMS Society** (2024). "Updated Theta Burst Statement from the Clinical TMS Society." Confirmed iTBS equivalence to 10 Hz for MDD. [^215^]

9. **Nature** (2026). "TMS in adolescent depression: A milestone FDA clearance." *Translational Psychiatry*. [^214^]

10. **PMC** (2023). "Clinical Practice Guidelines for the Use of Transcranial Direct Current Stimulation in Psychiatry." Standard operating procedures and contraindications. [^216^]

11. **PMC** (2017). "Safety Review of transcranial Direct Current Stimulation in Stroke." Comprehensive adverse effects analysis. [^191^]

12. **Psychiatric Times** (2018). "FDA Clears 3-Minute TMS Protocol for Depression." Theta burst stimulation clearance. [^218^]

13. **Psychiatrist.com** (2024). "Transcranial Magnetic Stimulation in Primary Care: Indications, Risks, and Outcomes." [^213^]

14. **PMC** (2022). "An Open-Source Cognitive Test Battery to Assess Human Attention and Memory." *Frontiers in Psychology*. [^192^]

15. **Towards Healthcare** (2025). "Digital Brain Health Market Surges in 2025 with Wearables." Market sizing and trends. [^178^]

16. **Newfund Capital** (2025). "Global Braintech Funding: Key Trends and Insights, 2023-2025." [^182^]

### Platform Sources

17. **Creyos** (2025). "2024 Feature Round-up: Advancing Cognitive Testing and Patient Care with Creyos." [^188^]

18. **Creyos** (2025). "Building Your Own Custom Cognitive Assessments with Creyos." [^226^]

19. **Mentalyc** (2025). Official website and product documentation. [^177^]

20. **Mentalyc** (2025). "AI Notes for Behavioral Health & Group Practices." [^179^]

21. **NeuroFlow** (2023). "NeuroFlow Prioritizes UX Using Heuristic Evaluation." [^185^]

22. **NeuroFlow** (2021). "Digital Behavioral Health Platform Overview." [^187^]

23. **Maven Clinic** (2025). Provider job postings and care model documentation. [^197^] [^198^]

### Open-Source Sources

24. **flowersteam/cognitive-testbattery** (GitHub). Open-source cognitive test battery. [^220^]

25. **sammosummo/Charlie2** (GitHub). MIT-licensed neurocognitive test battery in Python. [^221^]

26. **UMEssen/fhir-former** (GitHub). MIT-licensed transformer-based FHIR processing. [^200^]

27. **FHIRBoard** (Momentum). MIT-licensed FHIR analytics dashboard. [^201^]

28. **Microsoft/fhir-server** (GitHub). MIT-licensed production FHIR server. [^206^]

29. **OpenStudyBuilder** (Novo Nordisk). MIT/GPLv3 clinical study specification tool. [^232^]

30. **Neurosity** (2026). "Neurofeedback Software Compared: Top Platforms 2026." [^224^]

### UX/Design Sources

31. **MindK** (2026). "Healthcare UX Design: 7 Best Remedies for User Pains." [^199^]

32. **Intuition Labs** (2025). "UX Best Practices for HCP Engagement Platforms." [^202^]

33. **FuseLab Creative** (2026). "Healthcare UX Design Guide: Best Practices for Clinical Products 2026." [^208^]

34. **Sanjay Dey** (2026). "SaaS Dashboard Design: Build Dashboards Users Love." [^231^]

### Regulatory/Clinical Guideline Sources

35. **Univera Healthcare** (2026). "Transcranial Magnetic Stimulation and Cranial Electrotherapy Stimulation Medical Policy." Comprehensive TMS policy with FDA device list. [^210^]

36. **Psychiatric Times** (2025). "FDA Clears Accelerated Protocol for Deep TMS to Treat Major Depressive Disorder." [^211^]

37. **FDA BEST Framework** (2024). Digital biomarker validation context for cognitive assessments. [^186^]

38. **VA/DoD** (2022). Clinical Practice Guideline for Management of Major Depressive Disorder. [^210^]

39. **Roots Analysis** (2024). "Top 5 Digital Biomarker Companies." [^183^]

---

*End of Report*

*This research intelligence report was compiled through systematic web search across peer-reviewed literature, industry platforms, open-source repositories, and regulatory databases. All sources are cited with inline references. Recommendations are evidence-based and prioritize clinical safety.*
