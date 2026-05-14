# Analyzer Cross-Page Matrix
**Status:** ACTIVE  
**Purpose:** Map which pages consume/send data to each analyzer

---

## MATRIX: ANALYZER DATA FLOW

| Analyzer | Dashboard | Patient Profile | Interventions | Assessments | Reports | Risk Triage | Virtual Care | DeepTwin |
|----------|-----------|-----------------|----------------|-------------|---------|------------|--------------|----------|
| **Risk Triage** | ✓ alerts | ✓ risk card | ✓ protocol cautions | ✓ flags | ✓ pop analysis | — | ✓ session risk | ✓ input |
| **Biomarkers** | ✓ summary | ✓ full display | ✓ matching | ✓ findings | ✓ research data | ✓ signals | — | ✓ input |
| **Labs** | ✓ new results | ✓ timeline | ✓ protocol safety | — | ✓ de-id analysis | ✓ flags | — | ✓ input |
| **qEEG** | ✓ abnormal | ✓ waveforms | ✓ brain map planning | — | ✓ research-grade | ✓ red flags | — | ✓ input |
| **MRI** | ✓ new scans | ✓ viewer + report | ✓ lesion context | — | ✓ imaging archive | ✓ abnormality | — | ✓ input |
| **Biometrics** | ✓ trend | ✓ wearables tab | — | — | ✓ benchmarks | ✓ anomaly | ✓ wearable sync | ✓ input |
| **Nutrition** | — | ✓ nutrition summary | ✓ diet plan | — | ✓ deficiency trends | — | — | ✓ input |
| **Digital Phenotype** | ✓ behavior summary | ✓ behavioral card | — | — | ✓ de-id phenotype | ✓ behavior risk | — | ✓ input |
| **Voice** | — | ✓ recordings | — | ✓ transcripts | ✓ voice samples | ✓ speech markers | ✓ session recordings | ✓ input |
| **Text** | — | ✓ note summaries | ✓ protocol relevance | — | ✓ cohort analysis | ✓ symptom keywords | ✓ notes | ✓ input |
| **Video** | — | ✓ video clips | — | ✓ assessments | ✓ video archive | ✓ movement flags | — | ✓ input |
| **Movement** | ✓ gait trend | ✓ motor tab | ✓ rehab plan | — | ✓ gait data | ✓ fall risk | — | ✓ input |
| **Sessions** | ✓ adherence | ✓ progress | ✓ response insights | — | ✓ effectiveness | ✓ non-adherence | ✓ session status | ✓ input |
| **DeepTwin** | ✓ twin card | ✓ full twin UI | ✓ recommendations | — | ✓ twin export | ✓ twin risk | — | — |

---

## DATA FLOW: WHO SENDS WHERE

### DASHBOARD
**Sends to:** None (reads-only aggregator)  
**Receives from:** Risk Triage, Biomarkers, Biometrics, Sessions, Movement, DeepTwin, Voice, Text

**Display:** 
- Risk alerts (top)
- Patient queue (count)
- Today's pending actions
- New biomarker findings
- Treatment response trends
- Twin insights card

---

### PATIENT PROFILE
**Sends to:** None (reads-only detailed view)  
**Receives from:** ALL analyzers

**Display:**
- Risk card (top right)
- Biomarker timeline (central)
- Labs + trend (tab)
- qEEG waveforms (tab)
- MRI viewer + report (tab)
- Wearables/biometrics (tab)
- Nutrition summary (tab)
- Voice recordings (tab)
- Video library (tab)
- Movement/gait (tab)
- Behavioral observations (tab)
- Digital twin (tab)
- Full assessment history (tab)

---

### INTERVENTIONS (Protocol/Rehab/Med Studio)
**Sends to:** Sessions Analyzer (treatment logs)  
**Receives from:** Risk Triage (protocol cautions), Biomarkers (patient phenotype for matching), Labs (safety flags), qEEG (brain targets), Nutrition (diet integration), Movement (rehab baseline)

**Flow:**
1. Clinician selects intervention type (neuromod/rehab/nutrition/med)
2. System checks Risk Triage → if HIGH RISK, show safety override form
3. System checks Biomarkers → suggest matching protocols
4. Clinician prescribes intervention
5. Sessions Analyzer begins tracking adherence + response

---

### ASSESSMENTS HUB
**Sends to:** Risk Triage (assessment scores), Biomarkers (clinical data), Text Analyzer (transcripts)  
**Receives from:** Risk Triage (relevant risk context), Biomarkers (baseline for change detection)

**Flow:**
1. Display assessment queue (pending)
2. Show relevant biomarkers for context
3. Clinician administers
4. Results feed Risk Triage + Biomarkers
5. Auto-generate follow-up recommendations

---

### REPORTS
**Sends to:** None (reads-only data export)  
**Receives from:** ALL analyzers (de-identified research data)

**Report types:**
- Population risk stratification (Risk Triage)
- Biomarker epidemiology (Biomarkers)
- Treatment effectiveness (Sessions)
- Lab/imaging research data (Labs, qEEG, MRI)
- Behavioral patterns (Digital Phenotype)
- De-identified patient twins (DeepTwin)

---

### RISK TRIAGE
**Sends to:** Dashboard, Patient Profile, Interventions, Sessions  
**Receives from:** Assessments, Biomarkers, Labs, Sessions, Digital Phenotype, Clinician notes

**Safety gates:**
- HIGH RISK → protocol escalation required
- MEDIUM RISK → supervision recommendation
- LOW RISK → standard workflow
- UNKNOWN RISK → data insufficient → assessment required

---

### VIRTUAL CARE
**Sends to:** Sessions Analyzer (session logs), Voice Analyzer (session recording), Text Analyzer (notes)  
**Receives from:** Biometrics (live sync during call), Biomarkers (patient context), Assessments (relevant measures)

**Real-time flow:**
- Show patient biomaretics during session
- Log session type + duration + notes
- Auto-transcribe audio
- Extract clinical entities from transcript
- Post-session: feedback to Risk Triage + Sessions

---

### DEEPTWIN INSIGHTS
**Sends to:** Dashboard, Patient Profile, Interventions (recommendations), Reports  
**Receives from:** Risk Triage, Biomarkers, Labs, qEEG, MRI, Biometrics, Nutrition, Digital Phenotype, Voice, Text, Video, Movement, Sessions

**Integration:**
- Unified patient state representation
- What-if intervention simulation
- Longitudinal trend synthesis
- Outcome prediction
- Research-grade twin export

---

## CURRENT GAPS & BLOCKERS

| Gap | Impact | Priority | Owner |
|-----|--------|----------|-------|
| Nutrition Analyzer not in Patient Profile | Clinicians miss deficiency context | MEDIUM | @team |
| Video Assessments → Movement Analyzer handoff broken | Movement biomarkers incomplete | MEDIUM | @team |
| Sessions Analyzer doesn't sync with Risk Triage | Non-adherence not escalated | HIGH | @team |
| DeepTwin simulation not integrated with Intervention studio | Clinicians can't preview outcomes | HIGH | @team |
| Text Analyzer NLP on assessment transcripts unreliable | False positives in risk detection | MEDIUM | @team |
| Digital Phenotype data retention policy undefined | Privacy compliance risk | HIGH | @security |
| Voice recording consent enforcement weak | HIPAA audit finding | CRITICAL | @security |

---

## FUTURE INTEGRATIONS (Q3 2026)

1. **Medication Analyzer** → Labs (drug level monitoring) + Risk Triage (interaction checking)
2. **Behavior Workspace** → Sessions (behavioral tracking) + Digital Phenotype (pattern synthesis)
3. **Bio Database** → Labs + Nutrition + Biomarkers (unified lab interface)
4. **Evidence Intelligence** → Interventions (EBM linking) + Risk Triage (treatment guidelines)

