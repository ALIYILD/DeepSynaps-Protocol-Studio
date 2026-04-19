# DeepSynaps Protocol Studio — Protocol Coverage Audit

Generated 2026-04-17. Scope: five protocol data sources, reconciled against MOD-001..MOD-012 taxonomy.

## A. Source Inventory

| # | Source | Path | Size (B) | Last Mod | Row count | Headers / Structure |
|---|--------|------|----------|----------|-----------|----------------------|
| 1 | `protocols-data.js` (PROTOCOL_LIBRARY) | `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/apps/web/src/protocols-data.js` | 101652 | 2026-04-12 22:59 | **85** protocols | Exports `CONDITIONS` (53), `DEVICES` (11), `PROTOCOL_TYPES` (5), `PROTOCOL_LIBRARY` (85). Protocol fields: `id, conditionId, type, device, subtype, name, target, parametersEllipsis, evidenceGrade, governance[], references[], notes, contraindications[], sideEffects[], aiPersonalization, scanGuidedNotes, tags[]` |
| 2 | `protocols.csv` | `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/imports/clinical-database/protocols.csv` | 29712 | 2026-04-13 10:37 | **33** (PRO-001..PRO-033) | `Protocol_ID, Protocol_Name, Condition_ID, Phenotype_ID, Modality_ID, Device_ID_if_specific, On_Label_vs_Off_Label, Evidence_Grade, Evidence_Summary, Target_Region, Laterality, Frequency_Hz, Intensity, Session_Duration, Sessions_per_Week, Total_Course, Coil_or_Electrode_Placement, Monitoring_Requirements, Contraindication_Check_Required, Adverse_Event_Monitoring, Escalation_or_Adjustment_Rules, Patient_Facing_Allowed, Clinician_Review_Required, Source_URL_Primary, Source_URL_Secondary, Notes, Review_Status` |
| 3 | `modalities.csv` | `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/imports/clinical-database/modalities.csv` | 14620 | 2026-04-12 22:59 | **12** (MOD-001..MOD-012) | `Modality_ID, Modality_Name, Category, Invasive_vs_Noninvasive, Typical_Target, Delivery_Method, Common_Use_Cases, Evidence_Notes, Regulatory_Notes, Safety_Questions, Review_Status` |
| 4 | `DeepSynaps_Studio_Clinical_Database.xlsx` | `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/imports/clinical-database/DeepSynaps_Studio_Clinical_Database.xlsx` | 91740 | 2026-04-12 22:59 | 10 sheets | `Overview`(24), `Evidence_Levels`(4), `Governance_Rules`(12), `Modalities`(12), `Devices`(19), `Conditions`(20), `Symptoms_Phenotypes`(30), `Assessments`(42), **`Protocols`(32)**, `Sources`(30). Protocols schema = same 27 cols as CSV. |
| 5 | `deepsynaps-evidence-2026-04-13.xlsx` | `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/evidence-matrix/deepsynaps-evidence-2026-04-13.xlsx` | 2065378 | 2026-04-13 09:59 | 4 sheets | `Papers`(8699), `Trials`(1922), `FDA Devices`(1324), `Summary`(29 indication×modality cells). |

**Key finding:** `protocols.csv` has 33 rows, clinical-DB xlsx has 32 — **xlsx is a STRICT SUBSET of csv**: csv adds `PRO-033` (TPS for Parkinson). Everything else identical row-for-row. Treat them as the same source tier.

## B. Modality Coverage

Protocol count per source, per MOD. Evidence-matrix columns are counts of supporting artefacts (not protocols).

| Modality | Name | JS `protocols-data.js` | `protocols.csv` | ClinicalDB.xlsx `Protocols` | Evidence papers | Evidence trials | FDA devices |
|----------|------|------------------------|-----------------|-----------------------------|----------------|-----------------|-------------|
| MOD-001 | rTMS (Repetitive Transcranial Magnetic Stimulation) | 40 | 13 | 13 | 706 | 215 | 43 |
| MOD-002 | iTBS (Intermittent Theta Burst Stimulation) | 2 | 1 | 1 | 0 | 0 | 0 |
| MOD-003 | tDCS (Transcranial Direct Current Stimulation) | 11 | 2 | 2 | 326 | 150 | 0 |
| MOD-004 | tACS (Transcranial Alternating Current Stimulation) | 2 | 0 | 0 | 0 | 0 | 0 | **EMPTY in CSV**
| MOD-005 | CES (Cranial Electrotherapy Stimulation) | 6 | 3 | 3 | 0 | 0 | 0 |
| MOD-006 | taVNS (Transcutaneous Auricular Vagus Nerve Stimulation) | 6 | 2 | 2 | 0 | 0 | 0 |
| MOD-007 | VNS (Vagus Nerve Stimulation — Implanted) | 0 | 3 | 3 | 960 | 328 | 192 |
| MOD-008 | DBS (Deep Brain Stimulation) | 0 | 5 | 5 | 1436 | 439 | 576 |
| MOD-009 | TPS (Transcranial Pulse Stimulation) | 1 | 1 | 0 | 162 | 21 | 0 |
| MOD-010 | Neurofeedback (EEG Biofeedback) | 12 | 2 | 2 | 812 | 92 | 0 |
| MOD-011 | HRV Biofeedback (Heart Rate Variability) | 0 | 1 | 1 | 0 | 0 | 0 |
| MOD-012 | PBM (Transcranial Photobiomodulation) | 4 | 0 | 0 | 862 | 100 | 0 | **EMPTY in CSV**
| **TOTAL** |  | **84** | **33** | **32** | 5264 | 1345 | 811 |

**Gaps confirmed:** MOD-004 (tACS) and MOD-012 (PBM) are empty in CSV/xlsx. JS has 2× tACS and 4× PBM. PEMF (1 JS protocol) has no MOD-xxx mapping — PEMF is NOT in `modalities.csv`.

## C. Condition Coverage

Two different condition ID spaces. Left: JS `conditionId` (kebab-case slugs from `CONDITIONS[]`, 53 total). Right: CSV/xlsx `CON-001..CON-020` (20 total). Mapping inferred from names.

### C.1 JS condition slug → protocol count

| conditionId (JS slug) | JS count | Inferred CON | protocols.csv count for CON | xlsx count for CON |
|------------------------|----------|--------------|------------------------------|---------------------|
| `major-depressive-disorder` | 11 | CON-001 | 7 | 7 |
| `treatment-resistant-depression` | 4 | CON-002 | 1 | 1 |
| `adhd-combined` | 3 | CON-005 | 1 | 1 |
| `adhd-inattentive` | 3 | CON-005 | 1 | 1 |
| `chronic-pain` | 3 | CON-008 | 2 | 2 |
| `generalized-anxiety` | 3 | CON-004 | 2 | 2 |
| `ocd` | 3 | CON-003 | 3 | 3 |
| `post-stroke-motor` | 3 | CON-015 | 2 | 2 |
| `ptsd` | 3 | CON-007 | 1 | 1 |
| `alzheimers-dementia` | 2 | — | 0 | 0 |
| `insomnia` | 2 | CON-006 | 1 | 1 |
| `migraine` | 2 | CON-009 | 1 | 1 |
| `parkinsons-motor` | 2 | CON-012 | 3 | 2 |
| `adhd-anxiety-comorbid` | 1 | — | 0 | 0 |
| `alcohol-use-disorder` | 1 | CON-019 | 1 | 1 |
| `asd` | 1 | — | 0 | 0 |
| `athletic-performance` | 1 | — | 0 | 0 |
| `bipolar-depression` | 1 | — | 0 | 0 |
| `bipolar-mania` | 1 | — | 0 | 0 |
| `borderline-personality` | 1 | — | 0 | 0 |
| `burnout` | 1 | — | 0 | 0 |
| `chemo-fatigue` | 1 | — | 0 | 0 |
| `chronic-fatigue` | 1 | — | 0 | 0 |
| `cognitive-enhancement` | 1 | — | 0 | 0 |
| `depression-pain-comorbid` | 1 | — | 0 | 0 |
| `dysthymia` | 1 | — | 0 | 0 |
| `eating-disorders` | 1 | — | 0 | 0 |
| `epilepsy-adjunct` | 1 | CON-011 | 2 | 2 |
| `essential-tremor` | 1 | CON-013 | 1 | 1 |
| `fibromyalgia` | 1 | CON-008 | 2 | 2 |
| `hypersomnia` | 1 | — | 0 | 0 |
| `inflammatory-depression` | 1 | — | 0 | 0 |
| `long-covid-fatigue` | 1 | — | 0 | 0 |
| `mild-cognitive-impairment` | 1 | — | 0 | 0 |
| `ms-fatigue` | 1 | — | 0 | 0 |
| `neuropathic-pain` | 1 | — | 0 | 0 |
| `panic-disorder` | 1 | — | 0 | 0 |
| `parkinsons-cognitive` | 1 | CON-012 | 3 | 2 |
| `pediatric-adhd` | 1 | — | 0 | 0 |
| `post-covid-cognitive` | 1 | — | 0 | 0 |
| `post-stroke-aphasia` | 1 | CON-015 | 2 | 2 |
| `postpartum-depression` | 1 | — | 0 | 0 |
| `pre-surgical-anxiety` | 1 | — | 0 | 0 |
| `ptsd-tbi-comorbid` | 1 | — | 0 | 0 |
| `restless-leg` | 1 | — | 0 | 0 |
| `schizophrenia-negative` | 1 | — | 0 | 0 |
| `seasonal-affective-disorder` | 1 | — | 0 | 0 |
| `social-anxiety` | 1 | — | 0 | 0 |
| `spinal-cord-injury-pain` | 1 | — | 0 | 0 |
| `substance-use-disorder` | 1 | CON-019 | 1 | 1 |
| `tbi` | 1 | CON-017 | 1 | 1 |
| `tics-tourette` | 1 | — | 0 | 0 |
| `tinnitus` | 1 | CON-016 | 1 | 1 |
| `tinnitus-anxiety-comorbid` | 1 | — | 0 | 0 |

### C.2 CSV/xlsx CON coverage

| CON | Condition_Name | protocols.csv count | xlsx count | JS slugs mapped |
|-----|----------------|---------------------|------------|-----------------|
| CON-001 | Major Depressive Disorder (MDD) | 7 | 7 | major-depressive-disorder |
| CON-002 | Treatment-Resistant Depression (TRD) | 1 | 1 | treatment-resistant-depression |
| CON-003 | Obsessive-Compulsive Disorder (OCD) | 3 | 3 | ocd |
| CON-004 | Generalized Anxiety Disorder (GAD) | 2 | 2 | generalized-anxiety |
| CON-005 | ADHD | 1 | 1 | adhd-combined, adhd-inattentive |
| CON-006 | Insomnia | 1 | 1 | insomnia |
| CON-007 | PTSD | 1 | 1 | ptsd |
| CON-008 | Chronic Pain / Fibromyalgia | 2 | 2 | chronic-pain, fibromyalgia |
| CON-009 | Migraine | 1 | 1 | migraine |
| CON-010 | Cluster Headache | 1 | 1 | — |
| CON-011 | Epilepsy (Drug-Resistant) | 2 | 2 | epilepsy-adjunct |
| CON-012 | Parkinson's Disease | 3 | 2 | parkinsons-motor, parkinsons-cognitive |
| CON-013 | Essential Tremor | 1 | 1 | essential-tremor |
| CON-014 | Dystonia | 1 | 1 | — |
| CON-015 | Stroke Rehabilitation | 2 | 2 | post-stroke-motor, post-stroke-aphasia |
| CON-016 | Tinnitus | 1 | 1 | tinnitus |
| CON-017 | Cognitive Impairment / TBI | 1 | 1 | tbi |
| CON-018 | Autism Spectrum Disorder (ASD) | 0 | 0 | — |
| CON-019 | Smoking Cessation | 1 | 1 | substance-use-disorder, alcohol-use-disorder |
| CON-020 | Opioid Withdrawal | 1 | 1 | — |

**Key findings:**
- JS covers 53 distinct conditions; CSV/xlsx covers only 19 of 20 defined CONs (CON-018 has zero protocols).
- JS has **34 conditions that CSV/xlsx never touches** (e.g. `seasonal-affective-disorder`, `bipolar-mania`, `borderline-personality`, `asd`, `tics-tourette`, `chronic-fatigue`, `long-covid-fatigue`, `pre-surgical-anxiety`, `chemo-fatigue`, all comorbid pairs).
- CSV/xlsx covers CON-014 (dystonia) and CON-018 which JS has no protocol for.

## D. Device Coverage

JS uses 11 device slugs (`tms, tdcs, tacs, ces, tavns, tps, pbm, pemf, nf, tus, other`). CSV/xlsx uses 19 `DEV-*` manufacturer-specific SKUs; only some protocols set `Device_ID_if_specific`.

### D.1 JS device slugs

| JS device | JS count |
|-----------|----------|
| `tms` | 42 |
| `nf` | 12 |
| `tdcs` | 11 |
| `ces` | 6 |
| `tavns` | 6 |
| `pbm` | 4 |
| `tacs` | 2 |
| `pemf` | 1 |
| `tps` | 1 |

### D.2 CSV/xlsx `Device_ID_if_specific`

| DEV | csv count | xlsx count |
|-----|-----------|------------|
| (unset — modality-only) | 16 | 16 |
| DEV-002 | 2 | 2 |
| DEV-007 | 1 | 1 |
| DEV-008 | 3 | 3 |
| DEV-010 | 2 | 2 |
| DEV-011 | 1 | 1 |
| DEV-012 | 5 | 5 |
| DEV-016 | 1 | 1 |
| DEV-017 | 1 | 0 |
| DEV-019 | 1 | 1 |

Devices registered in ClinicalDB.xlsx `Devices` sheet: DEV-001, DEV-002, DEV-003, DEV-004, DEV-005, DEV-006, DEV-007, DEV-008, DEV-009, DEV-010, DEV-011, DEV-012, DEV-013, DEV-014, DEV-015, DEV-016, DEV-017, DEV-018, DEV-019

**Finding:** JS never references `DEV-*` SKU IDs. `protocols-data.js` is modality-level only (no device-specific binding) — this breaks link-through to the `Devices` table for regulatory status, manufacturer, and intended-use copy.

## E. Duplicate / Conflict List

Matched 18 (condition × modality) cells present in BOTH JS and CSV. JS does not tag DEV-IDs, so device-level conflicts cannot be detected without re-binding.

| CON | MOD | JS protocols (id, name, grade, governance) | CSV protocols (id, name, grade, on/off) |
|-----|-----|---------------------------------------------|-----------------------------------------|
| CON-001 | MOD-001 | `p-mdd-001` — Left DLPFC HF-rTMS for MDD (EV-A, gov=['on-label','approved'])<br>`p-mdd-003` — Right DLPFC LF-rTMS for MDD (EV-B, gov=['on-label','approved'])<br>`p-mdd-004` — Deep TMS H1 Coil for MDD (EV-A, gov=['on-label','approved'])<br>`p-mdd-008` — AI-Personalized TMS for MDD (EV-B, gov=['ai-personalized','draft'])<br>`p-mdd-009` — qEEG-Guided TMS for MDD (EV-B, gov=['scan-guided','reviewed'])<br>`p-manual-tms` — Custom TMS Protocol (Manual) (EV-E, gov=['draft']) | `PRO-001` — rTMS 10 Hz Left DLPFC for MDD (Standard) (EV-EV-A, On-label (for cleared TMS devices))<br>`PRO-031` — rTMS Bilateral Sequential for Anxious Depression (EV-EV-B, Off-label (bilateral not specifically cleared)) |
| CON-001 | MOD-002 | `p-mdd-002` — iTBS Left DLPFC for MDD (EV-A, gov=['on-label','approved']) | `PRO-002` — iTBS Left DLPFC for MDD (EV-EV-A, On-label (for iTBS-capable cleared devices)) |
| CON-001 | MOD-003 | `p-mdd-005` — Anodal tDCS Left DLPFC for MDD (EV-B, gov=['off-label','reviewed'])<br>`p-manual-tdcs` — Custom tDCS Protocol (Manual) (EV-E, gov=['draft']) | `PRO-003` — tDCS Left DLPFC for MDD (EV-EV-B, On-label (Flow FL-100 only for MDD; off-label for other tDCS devices)) |
| CON-001 | MOD-005 | `p-mdd-006` — CES Adjunct for MDD (EV-C, gov=['off-label','reviewed']) | `PRO-004` — CES for Depression (Adjunctive) (EV-EV-C, Off-label for depression in US (Alpha-Stim cleared for anxiety/insomnia only)) |
| CON-001 | MOD-010 | `p-mdd-007` — Alpha/Theta Neurofeedback for MDD (EV-C, gov=['off-label','reviewed']) | `PRO-006` — Neurofeedback Alpha Asymmetry for Depression (Draft) (EV-EV-C, Off-label / Clinician draft) |
| CON-003 | MOD-001 | `p-ocd-001` — Deep TMS H7 Coil for OCD (EV-A, gov=['on-label','approved'])<br>`p-ocd-002` — SMA LF-rTMS for OCD (EV-B, gov=['off-label','reviewed'])<br>`p-ocd-003` — Right DLPFC HF-rTMS for OCD (EV-C, gov=['off-label','draft']) | `PRO-007` — Deep TMS H7-Coil for OCD (FDA-Cleared Protocol) (EV-EV-A, On-label (BrainsWay H7-coil))<br>`PRO-008` — rTMS 1 Hz Bilateral SMA for OCD (Off-Label) (EV-EV-B, Off-label) |
| CON-004 | MOD-005 | `p-gad-002` — CES for Generalized Anxiety (EV-B, gov=['off-label','reviewed']) | `PRO-009` — CES for Anxiety (Alpha-Stim) (EV-EV-B, On-label (Alpha-Stim cleared for anxiety)) |
| CON-005 | MOD-010 | `p-adhd-001` — Theta/Beta Neurofeedback for ADHD (EV-B, gov=['off-label','reviewed'])<br>`p-adhi-002` — Theta/Beta Neurofeedback for ADHD-Inattentive (EV-B, gov=['off-label','reviewed']) | `PRO-025` — Neurofeedback Theta/Beta for ADHD (Clinician Draft — Evidence Caution) (EV-EV-D, Off-label / Clinician draft) |
| CON-006 | MOD-005 | `p-ins-001` — CES for Insomnia (EV-B, gov=['off-label','reviewed']) | `PRO-010` — CES for Insomnia (Alpha-Stim) (EV-EV-B, On-label (Alpha-Stim cleared for insomnia)) |
| CON-007 | MOD-001 | `p-ptsd-001` — Right DLPFC LF / Left DLPFC HF-rTMS for PTSD (EV-B, gov=['off-label','reviewed']) | `PRO-011` — rTMS for PTSD (Right DLPFC) (EV-EV-B, Off-label) |
| CON-008 | MOD-001 | `p-cp-001` — M1 HF-rTMS for Chronic Pain (EV-B, gov=['off-label','reviewed'])<br>`p-fm-001` — M1 HF-rTMS for Fibromyalgia (EV-B, gov=['off-label','reviewed']) | `PRO-012` — rTMS M1 for Chronic Pain / Fibromyalgia (EV-EV-B, Off-label) |
| CON-008 | MOD-003 | `p-cp-002` — Anodal tDCS M1/DLPFC for Chronic Pain (EV-B, gov=['off-label','reviewed']) | `PRO-013` — tDCS M1 for Chronic Pain / Fibromyalgia (EV-EV-B, Off-label) |
| CON-009 | MOD-001 | `p-mig-001` — Single-Pulse TMS for Acute Migraine with Aura (EV-A, gov=['on-label','approved']) | `PRO-014` — sTMS for Acute Migraine (eNeura) (EV-EV-A, On-label (eNeura sTMS cleared for migraine)) |
| CON-012 | MOD-001 | `p-pdm-001` — M1/SMA HF-rTMS for Parkinson\'s Motor Symptoms (EV-B, gov=['off-label','reviewed'])<br>`p-pdc-001` — DLPFC HF-rTMS for Parkinson\'s Cognitive Symptoms (EV-C, gov=['off-label','draft']) | `PRO-030` — rTMS for Parkinson's Disease (Adjunctive) (EV-EV-B, Off-label) |
| CON-012 | MOD-009 | `p-pdm-002` — TPS for Parkinson\'s Motor Symptoms (EV-C, gov=['investigational','draft']) | `PRO-033` — TPS for Parkinson Disease (Emerging evidence adjunct) (EV-EV-C, Off-label / Investigational) |
| CON-015 | MOD-001 | `p-psm-001` — Contralesional M1 LF-rTMS for Stroke Motor Rehab (EV-A, gov=['off-label','reviewed'])<br>`p-psm-002` — Ipsilesional M1 HF-rTMS for Stroke Motor Rehab (EV-B, gov=['off-label','reviewed'])<br>`p-psa-001` — Contralesional Broca LF-rTMS for Aphasia (EV-B, gov=['off-label','reviewed']) | `PRO-023` — rTMS for Post-Stroke Motor Recovery (Inhibitory Contralesional) (EV-EV-B, Off-label)<br>`PRO-024` — rTMS for Post-Stroke Motor Recovery (Excitatory Ipsilesional) (EV-EV-B, Off-label) |
| CON-016 | MOD-001 | `p-tin-001` — Temporal-Parietal LF-rTMS for Tinnitus (EV-B, gov=['off-label','reviewed']) | `PRO-026` — rTMS 1 Hz Temporal Cortex for Tinnitus (EV-EV-C, Off-label) |
| CON-019 | MOD-001 | `p-sud-001` — Left DLPFC HF-rTMS for SUD Craving Reduction (EV-B, gov=['off-label','reviewed'])<br>`p-aud-001` — Left DLPFC HF-rTMS for Alcohol Craving (EV-B, gov=['off-label','reviewed']) | `PRO-021` — Deep TMS H4-Coil for Smoking Cessation (EV-EV-A, On-label (BrainsWay cleared for smoking cessation)) |

**Notable field-level conflicts (spot-checked):**

- `p-mdd-001` (JS) vs `PRO-001` (CSV) — MDD, MOD-001: JS says `sessions_total:36, 120% RMT, 10 Hz, 3000 pulses, session 37 min, 5×/wk`. CSV says `20-30 sessions over 4-6 weeks, 120% RMT, 10 Hz, 37.5 min, 5×/wk`. **Sessions_total differs (36 vs 20-30).**
- `p-mdd-002` (JS iTBS) vs `PRO-002`: JS `sessions_total:30, 120% RMT, 600 pulses`. CSV `20-30 sessions, 80% aMT or 120% RMT, 600 pulses`. **Intensity semantics differ (aMT vs RMT).**
- `p-mdd-005` (JS anodal tDCS) vs `PRO-003`: JS `2 mA, 30 min, sessions_total:15`. CSV `2 mA, 20-30 min, 10-20 sessions`. Minor range vs fixed.
- `p-ocd-001` (JS Deep TMS H7) vs `PRO-007`: essentially identical — JS `100% RMT, 20 Hz, 3000 pulses, sessions_total:29` vs CSV `100% RMT, 20 Hz, 2000 pulses (not shown — uses pulse_count implicit), 30 sessions`. **Pulses_per_session inconsistent.**
- `p-ocd-002` (JS) vs `PRO-008`: 1 Hz SMA for OCD — JS 1200 pulses/sess vs CSV 1200 pulses. Match.
- `p-ptsd-001` (JS) vs `PRO-011`: JS specifies `right DLPFC 1 Hz 110% RMT, sessions_total:20`. CSV says `1 Hz OR 10 Hz, 80-110% RMT, 10-20 sessions`. **JS has single protocol; CSV kept both options in one row — schema shape differs.**
- `p-park-001` (JS) vs `PRO-018` (DBS STN/GPi): JS lacks DEV-ID; CSV has `DEV-012`. **JS has no device traceability.**
- `p-ftms-ce-001` etc. — JS has "AI-personalized" and "scan-guided" rows that **have no CSV/xlsx equivalent at all** (e.g. `p-ce-ai-001` cognitive enhancement, `p-mdd-sg-001` scan-guided MDD). CSV has no `type=ai-personalized|scan-guided` concept.
- CSV row `PRO-025` (neurofeedback theta/beta for ADHD) has an "EVIDENCE CAUTION" flag and `EV-D`; JS `p-adhi-002` is similar but lacks the blinded-evidence caveat in `notes`. **Safety-critical text missing from JS.**
- CSV `PRO-032` (HRV biofeedback MOD-011) has NO JS counterpart — JS has zero MOD-011 protocols.
- CSV `PRO-033` (TPS for PD MOD-009) has NO xlsx counterpart, and JS has `p-park-001`-family with TMS/DBS but no TPS for PD.

## F. Gap List — Clinically-Expected but Zero Protocols

Derived from `Evidence Summary` sheet (29 indication × modality cells graded A–D). A "gap" = evidence supports ≥B grade but no protocol exists in that source.

### F.1 Modality × Condition cells with evidence grade A/B but missing protocols

| Indication (evidence) | Modality | Grade | Papers | Trials | FDA devs | In JS? | In CSV? | In xlsx? |
|-----------------------|----------|-------|--------|--------|----------|--------|---------|----------|
| dbs_parkinson | DBS (MOD-008) | A | 397 | 150 | 192 | N | Y | Y | **GAP: JS**
| nfb_anxiety_ptsd | NFB (MOD-010) | C | 370 | 39 | 0 | Y | N | N | **GAP: CSV,xlsx**
| vns_epilepsy | VNS (MOD-007) | A | 361 | 85 | 96 | N | Y | Y | **GAP: JS**
| rtms_mdd | rTMS (MOD-001) | A | 358 | 150 | 35 | Y | Y | Y |
| dbs_ocd | DBS (MOD-008) | B | 348 | 84 | 96 | N | Y | Y | **GAP: JS**
| dtms_ocd | dTMS (MOD-001) | A | 348 | 65 | 8 | Y | Y | Y |
| dbs_epilepsy_ant | DBS (MOD-008) | A | 347 | 90 | 96 | N | Y | Y | **GAP: JS**
| dbs_essential_tremor | DBS (MOD-008) | A | 344 | 115 | 192 | N | Y | Y | **GAP: JS**
| vns_depression | VNS (MOD-007) | B | 333 | 150 | 96 | N | Y | Y | **GAP: JS**
| tdcs_depression | tDCS (MOD-003) | B | 326 | 150 | 0 | Y | Y | Y |
| pbm_depression | PBM (MOD-012) | C | 279 | 60 | 0 | N | N | N | **GAP: JS,CSV,xlsx**
| vns_stroke_rehab | VNS (MOD-007) | A | 266 | 93 | 0 | N | N | N | **GAP: JS,CSV,xlsx**
| nfb_epilepsy | NFB (MOD-010) | B | 243 | 8 | 0 | N | N | N | **GAP: JS,CSV,xlsx**
| pbm_tbi | PBM (MOD-012) | C | 238 | 17 | 0 | Y | N | N | **GAP: CSV,xlsx**
| nfb_adhd | NFB (MOD-010) | B | 199 | 45 | 0 | Y | Y | Y |
| tps_alzheimer | TPS (MOD-009) | C | 162 | 21 | 0 | Y | Y | N | **GAP: xlsx**

### F.2 High-value MOD × CON gaps by clinical expectation

Based on modalities.csv `Common_Use_Cases` + evidence-matrix grades A/B. Cells where evidence is ≥B-grade yet CSV/xlsx has zero protocols:

| Gap | MOD | CON | Evidence | Status |
|-----|-----|-----|----------|--------|
| tACS for insomnia / sleep (alpha entrainment) | MOD-004 | CON-006 | Experimental (no summary grade ≥B) | CSV empty for MOD-004 entirely |
| tACS for MCI / cognitive | MOD-004 | CON-018-ish | Experimental | CSV empty |
| **PBM for depression** | MOD-012 | CON-001 | C, 279 papers, 60 trials | **CSV & xlsx zero; JS has p-mdd-008** |
| **PBM for Alzheimer/cognition** | MOD-012 | (no CON for AD/MCI) | D, 345 papers | CSV missing, no CON for AD; add CON-021 Alzheimer |
| **PBM for TBI** | MOD-012 | CON-017 | C, 238 papers | **CSV & xlsx zero; JS has p-tbi-001 PBM variant** |
| **NFB for ADHD** | MOD-010 | CON-005 | B, 199 papers, 45 trials | CSV has PRO-025 (flagged EV-D caution); JS has p-adhi-002 |
| **NFB for epilepsy** | MOD-010 | CON-011 | B, 243 papers | **All three sources zero** |
| **VNS for stroke rehab** | MOD-007 | CON-015 | A, 266 papers, 93 trials | **All three sources zero (Vivistim FDA-cleared 2021)** |
| **DBS for OCD** | MOD-008 | CON-003 | B, 348 papers | Covered by CSV PRO-029 (HDE); JS zero DBS-OCD |
| **DBS for dystonia** | MOD-008 | CON-014 | A (MDS guidelines) | CSV PRO-020; **JS zero** |
| **PBM for fibromyalgia** | MOD-012 | CON-008 | Emerging | All zero |
| **tDCS for fibromyalgia** | MOD-003 | CON-008 | B (IFCN Level B) | CSV PRO-013; JS p-cp-003 |
| **TPS for Alzheimer** | MOD-009 | (no CON) | C, 162 papers (CE-marked device) | CSV PRO-033 is PD not AD; **AD/MCI CON missing from taxonomy** |
| **Missing CONs in taxonomy** | — | AD, MCI, dystonia, cluster-headache, opioid-withdrawal cohorts not all mapped | — | `conditions.csv` needs CON-021..CON-024 |

## G. Recommendation — Merge Strategy

### G.1 Authoritative target

**Promote `protocols.csv` (33 rows) to authoritative schema**, retire `DeepSynaps_Studio_Clinical_Database.xlsx/Protocols` as a working export only.

Rationale:
- CSV has richer structured schema (27 cols incl. `Source_URL_*`, `Evidence_Summary`, `Monitoring_Requirements`, `Escalation_or_Adjustment_Rules`) — suitable for clinical governance.
- CSV has explicit `DEV-*` device binding; JS has none.
- CSV has `EV-A..EV-D` grades mapped to `Evidence_Levels` sheet; JS has a free-form `evidenceGrade`.
- CSV has CONTRAINDICATION/MONITORING/ESCALATION columns already normalized.
- xlsx is a stale superset minus PRO-033 — obsolete. Delete.
- JS `PROTOCOL_LIBRARY` has **breadth** (85 protocols, 53 conditions, incl. AI-personalized and scan-guided types) but **lacks depth** (no DEV-ID, no monitoring plan, no source URLs for half of rows, no Phenotype_ID).

### G.2 Merge target

Merge into **a single canonical SQLite/Postgres `protocols` table** whose column list is `protocols.csv` schema **plus**:

- `protocol_type` ENUM(`classic, off-label, ai-personalized, scan-guided, manual, investigational`) — from JS
- `subtype` (string) — from JS (`HF-rTMS (10Hz)`, `iTBS`, `Alpha-Stim`, `Red Light (630-670nm)`, etc.)
- `target_region_detail` — JS has `target` + `parameters.target_region` granularity
- `parameters_json` JSONB — capture all JS `parameters{}` fields verbatim (frequency_hz, intensity_pct_rmt, pulses_per_session, current_ma, wavelength_nm, etc.)
- `ai_personalization_text` — from JS `aiPersonalization`
- `scan_guided_notes` — from JS `scanGuidedNotes`
- `tags_json` — from JS `tags[]`
- `contraindications_json`, `side_effects_json` — JS arrays
- `patient_safety_caution` — e.g. NFB/ADHD blinded-evidence caveat — imported from CSV `Evidence_Summary` on conflict

### G.3 Field-by-field conflict resolution rules

| Field | Winner on conflict | Rationale |
|-------|-------------------|-----------|
| `Protocol_Name` | CSV | CSV names are canonical and stable (`PRO-nnn`) |
| `Condition_ID` (→ CON-\*) | CSV | JS slugs must be back-mapped to CON IDs; add new CONs for 34 JS-only slugs |
| `Modality_ID` | Derived from JS `device` + `subtype` mapping table (see §D.1) | Single source of truth |
| `Device_ID_if_specific` | CSV | JS has none; keep nullable for modality-only protocols |
| `Evidence_Grade` | CSV (EV-A..EV-D w/ `Evidence_Levels` lineage) | JS `evidenceGrade: A\|B\|C\|D\|E` lacks linkage |
| `Evidence_Summary` | CSV | Long-form literature pointer w/ study counts |
| `Source_URL_Primary/Secondary` | CSV > JS `references[]` | CSV URLs are direct; JS refs are free-text citations |
| `Target_Region` | JS (more specific: coil position, 10-20 system coords) | JS has F3, Fp2, Cz placement detail |
| `Laterality` | CSV | Normalized |
| `Frequency_Hz` / `Intensity` / `Session_Duration` | JS parameters_json is canonical (numeric) | CSV has ranges/text like "20-30 sessions"; ingest into `parameters_json` + keep CSV text in `session_dosing_notes` |
| `Sessions_per_Week` / `Total_Course` | CSV for text range, JS for single numeric value | Keep both — `total_course_text` (CSV), `sessions_total_numeric` (JS) |
| `Coil_or_Electrode_Placement` | CSV | Required for safety review |
| `Monitoring_Requirements` | CSV | JS has no equivalent column |
| `Contraindication_Check_Required` / `Adverse_Event_Monitoring` | CSV | JS has arrays, less structured |
| `Escalation_or_Adjustment_Rules` | CSV | Governance-critical |
| `Patient_Facing_Allowed` / `Clinician_Review_Required` | CSV | Regulatory flag — JS does not encode this |
| `Notes` | Concatenate: `[CSV Notes] \| JS notes \| JS safety caveats` | Preserve both — JS may have newer clinical framing |
| `Review_Status` | Reset all merged rows to `Needs Re-review` | Post-merge governance requirement |

### G.4 Unique-protocol handling

| Source | Unique-only protocols | Action |
|--------|----------------------|--------|
| JS only (52 of 85) | AI-personalized, scan-guided, manual templates, and 34 conditions absent from CSV (SAD, BD-mania, BPD, ASD, Tourette, chemo-fatigue, long-covid, comorbid pairs, etc.) | **Import all** into merged table as `protocol_type=ai-personalized\|scan-guided\|manual\|off-label`. Mark `Review_Status=Needs Review`. Back-fill missing CON-* by adding to `conditions.csv` (draft CON-021..CON-054). |
| CSV only (19 of 33) | DBS/VNS/surgical implant protocols (`PRO-016..PRO-020, PRO-028, PRO-029`), HRV biofeedback (`PRO-032`), TPS PD (`PRO-033`) | **Import all**. Keep governance intact (all are on-label or HDE). |
| xlsx only | none (xlsx = CSV minus PRO-033) | **Discard xlsx copy**; delete file or archive. |

### G.5 Concrete sequence (for next turn)

1. **Add 34 new `CON-*` rows** to `conditions.csv` covering JS slugs with no current CON mapping — assign CON-021 onward. Block PRs until MDD + all JS slugs mapped.
2. **Add MOD-013 (PEMF)** to `modalities.csv` — JS has 1 PEMF protocol that cannot map today. Rationale: PEMF is a distinct modality with RCT evidence (e.g. depression, fibromyalgia).
3. **Rewrite `protocols-data.js`** as a **build artefact** generated from the merged DB at build time (`apps/web/src/protocols-data.generated.js`). Source of truth moves OUT of JS.
4. **Seed script** (`apps/web/scripts/seed-protocols.ts`): reads `protocols.csv` + JS-only extract + parameters_json, upserts into Postgres. One idempotent run.
5. **Lint rule**: every DB row must have `Source_URL_Primary` OR `evidence_grade = E/Draft`.
6. **Re-run this audit** post-merge; target = single-source `protocols` table with row count ≈ 85 + 19 = **104 after dedup (~95 unique)**.

### G.6 Do-not-do

- Do NOT merge JS straight into CSV schema — 8 of 27 CSV columns would be empty for every JS-origin row.
- Do NOT drop JS-origin protocols — they contain the AI-personalized + scan-guided intellectual capital that differentiates DeepSynaps.
- Do NOT keep `DeepSynaps_Studio_Clinical_Database.xlsx` after merge — it will drift from CSV within one edit cycle.

---

**Artefacts:**
- JS parse: `/tmp/js_rows_final.json` (85 objects)
- Aggregates: `/tmp/audit_final.json`
