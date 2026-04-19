# GAP Seed: MOD-004 (tACS) and MOD-012 (PBM) Protocol Candidates

Generated: 2026-04-17
Source: evidence.db (local only — no external fetch)
Scope: Papers, trials, and indications tables only. No tACS entries exist in the `indications` table (DB gap confirmed). PBM has 3 indications (IDs 27–29, Grade C–D).

---

## MODALITY: tACS (MOD-004) — Transcranial Alternating Current Stimulation

### Evidence Summary

The DB contains no tACS rows in the `indications` table. Evidence comes entirely from papers (FTS) and trials (FTS). Key evidence nodes:

- **Mechanistic backbone**: tACS entrains endogenous neural oscillations by delivering sinusoidal current at a target frequency; alpha (10 Hz) and gamma (40 Hz) are the best-characterised therapeutic bands. (PMID: 21072168, PMID: 33211157)
- **Safety overview**: No persistent adverse events in published tACS literature as of 2017 review; transient skin tingling and phosphenes are the predominant AEs. Review explicitly notes fewer safety data exist for tACS than tDCS. (PMID: 30214966, DOI: 10.1016/j.cnp.2016.12.003)
- **Psychiatric feasibility**: 2020 systematic review confirms feasibility across six major psychiatric disorders; no serious AEs reported in clinical trials to date. (PMID: 33211157, DOI: 10.1007/s00406-020-01209-9)
- **FDA status**: No tACS device holds FDA PMA or De Novo clearance for any neuropsychiatric indication. All uses are off-label / investigational. DB devices table: no tACS-specific entries found.

### Top Indications by Evidence Weight

| Rank | Condition | ICD-10 | Evidence Weight | Source Basis |
|------|-----------|--------|-----------------|--------------|
| 1 | Major Depressive Disorder | F33 | Grade C (emerging RCTs) | PMID: 39261427; NCT06812923; PMID: 33211157 |
| 2 | Alzheimer's Disease / MCI (gamma entrainment) | G30 / F06.7 | Grade C (pilot RCTs, Phase 2 trials) | NCT06826261; NCT06547021; PMID: 40142358 |
| 3 | Schizophrenia — auditory hallucinations | F20 | Grade C (completed small RCTs) | NCT05282329; NCT04545294; PMID: 38097566 |
| 4 | Mild Cognitive Impairment (theta band) | F06.7 | Grade C (ongoing RCT N=195) | NCT04135742 |

---

### tACS Protocol Candidate Rows

> Verbatim trial `interventions_json` parameters are used where available. Do NOT extrapolate beyond what is stated.

| Field | PRO-tACS-001 | PRO-tACS-002 | PRO-tACS-003 | PRO-tACS-004 |
|-------|-------------|-------------|-------------|-------------|
| **Protocol_ID** | PRO-tACS-001 | PRO-tACS-002 | PRO-tACS-003 | PRO-tACS-004 |
| **Protocol_Name** | tACS 10 Hz Left DLPFC for Treatment-Resistant Depression | tACS 40 Hz (Gamma) DLPFC/PFC for Alzheimer's Disease | tACS 40 Hz Temporal Lobe for Schizophrenia Auditory Hallucinations | tACS Theta (6 Hz) Frontoparietal for MCI Working Memory |
| **Condition_ID** | CON-MDD (F33) | CON-AD (G30) | CON-SCZ (F20) | CON-MCI (F06.7) |
| **Phenotype_ID** | PHE-TRD (high-inflammatory / treatment-resistant) | PHE-mild-to-moderate-AD | PHE-refractory-auditory-hallucinations | PHE-amnestic-MCI |
| **Modality_ID** | MOD-004 | MOD-004 | MOD-004 | MOD-004 |
| **Device_ID_if_specific** | Starstim (Neuroelectrics) referenced in NCT06826261; no specific device required | Starstim-home (NCT06826261) | Not specified in NCT05282329 | Not specified in NCT04545294 |
| **On_Label_vs_Off_Label** | Off-label (investigational; no FDA clearance for tACS) | Off-label (investigational) | Off-label (investigational) | Off-label (investigational) |
| **Evidence_Grade** | EV-C | EV-C | EV-C | EV-C |
| **Evidence_Summary** | RCT underway (NCT06812923, N=52, 4-wk course, 77.5 Hz variant also tested); 2024 review covers tACS in MDD; mechanistic review supports alpha/beta modulation. Larger RCTs needed. | Phase 2 pilot (NCT06826261, N=30, 40 Hz, 8 wks, home-based); 2025 narrative review supports gamma entrainment for AD. No powered RCT completed yet. | Completed RCT NCT05282329 (N=50, gamma, 5 d/wk x 4 wks, 2 mA, 20 min); completed pilot NCT04545294 (N=36, 6 Hz theta, negative symptoms). | Ongoing RCT NCT04135742 (N=195, combined tACS+CCT); largest tACS trial in MCI to date. |
| **Target_Region** | Left DLPFC (F3 — 10-20 system) | Prefrontal cortex (bilateral) | Bilateral temporal lobe (T3/T4) | Left frontoparietal (F3/P3) |
| **Laterality** | Left | Bilateral | Bilateral | Left |
| **Frequency_Hz** | 10 Hz (alpha) per NCT06812923 arm; note: 77.5 Hz arm also in that trial | 40 Hz (gamma) per NCT06826261 interventions_json | 40 Hz (gamma) per NCT05282329 interventions_json | 6 Hz (theta) per NCT04545294 interventions_json |
| **Intensity** | 2 mA peak-to-peak (NCT06812923: 15 mA variant tested — that is the 77.5 Hz arm; standard 10 Hz = 2 mA) | 2 mA (standard; NCT06826261 does not specify — use with caution) | 2 mA (NCT05282329 interventions_json) | Not specified in NCT04545294 — DB gap |
| **Session_Duration** | 20 min (NCT06812923) | 60 min (NCT06826261 interventions_json: "one-hour tACS sessions") | 20 min (NCT05282329 interventions_json) | Not stated — DB gap |
| **Sessions_per_Week** | 5 (NCT06812923: "5 times a week") | 5 (NCT06826261: "5 days per week") | 5 (NCT05282329: "daily sessions in 5-day sequence") | Not stated — DB gap |
| **Total_Course** | 20 sessions over 4 weeks (NCT06812923) | 40 sessions over 8 weeks (NCT06826261) | 20 sessions over 4 weeks (NCT05282329) | Not stated — DB gap |
| **Coil_or_Electrode_Placement** | 4x1-ring HD montage centred F3 (NCT07486804 reference arm); or standard 2-electrode F3-contralateral | Multichannel montage (Starstim-home, NCT06826261); model-optimised placement | Standard 2-electrode bilateral temporal (T3/T4 or equivalent) | Multi-electrode online montage (NCT04545294) |
| **Monitoring_Requirements** | EEG at baseline recommended; scalp inspection each session; phosphene threshold check | Remote digital monitoring portal (per NCT06826261); caregiver-administered; weekly video check | PANSS / AHRS weekly; EEG monitoring at baseline | EEG at baseline; cognitive testing at 0/post |
| **Contraindication_Check_Required** | Yes — epilepsy history, implanted metallic/electronic devices, scalp lesions, pregnancy | Yes — same as PRO-tACS-001; also exclude moderate-severe dementia requiring supervision (caregiver required) | Yes — active seizure disorder; medication review for pro-convulsant drugs | Yes — same standard exclusions |
| **Adverse_Event_Monitoring** | Skin redness/tingling log; phosphene diary; no persistent AEs in review (PMID: 30214966) | Scalp warmth/tingling log; pediatric AE monitoring protocol referenced (PMID: 38761518) | Scalp tingling; phosphenes; extrapyramidal symptom check given antipsychotic co-use | Tingling/phosphene diary |
| **Escalation_or_Adjustment_Rules** | If no response at 10 sessions: clinician review of frequency and electrode placement; consider EEG-guided personalisation | If cognitive decline accelerates: pause and clinician review; cross-over to sham arm only in trial context | If hallucinations worsen or new neurological symptoms: stop and refer | Adjust if EEG shows no theta entrainment at session 5 |
| **Patient_Facing_Allowed** | No — investigational only; clinician/researcher supervised | Limited: home-based arm in NCT06826261 requires caregiver + remote monitoring portal | No — inpatient/outpatient clinic only | No — research setting only |
| **Clinician_Review_Required** | Yes | Yes | Yes | Yes |
| **Source_URL_Primary** | https://clinicaltrials.gov/study/NCT06812923 | https://clinicaltrials.gov/study/NCT06826261 | https://clinicaltrials.gov/study/NCT05282329 | https://clinicaltrials.gov/study/NCT04135742 |
| **Source_URL_Secondary** | https://pubmed.ncbi.nlm.nih.gov/39261427/ | https://pubmed.ncbi.nlm.nih.gov/40142358/ | https://pubmed.ncbi.nlm.nih.gov/38097566/ | https://pubmed.ncbi.nlm.nih.gov/33211157/ |
| **Notes** | Two frequency arms in NCT06812923 (10 Hz vs 77.5 Hz); 77.5 Hz is non-standard — use only in research context. PMID 30214966 AE review applies to both arms. | Intensity not explicitly stated in interventions_json for NCT06826261 — do NOT fill protocols.csv intensity column until confirmed. Gamma tACS for AD: 2025 review (PMID 40142358) supports rationale but no powered RCT completed. | COMPLETED trial (NCT05282329, N=50); best-controlled tACS dataset in the DB for schizophrenia. Gamma over temporal cortex targets 40 Hz dysregulation in auditory processing. | NCT04545294 interventions_json omits duration and intensity — DB gap; needs external fetch. |
| **Review_Status** | Draft — pending clinician sign-off | Draft — pending clinician sign-off | Draft — pending clinician sign-off | Draft — incomplete parameters; external fetch required |

---

### tACS Safety Flags

- Transient AEs (tingling, phosphenes, skin redness): reported in majority of subjects; resolve immediately post-stimulation. (PMID: 30214966, DOI: 10.1016/j.cnp.2016.12.003)
- No persistent AEs in published literature as of 2017 review; tACS has substantially fewer safety data than tDCS.
- Pediatric populations: specific AE monitoring protocol required; general NIBS pediatric AE review (PMID: 38761518) should be consulted.
- NCT06812923 tests 15 mA at 77.5 Hz — this is a non-standard high-intensity arm; intensity escalation monitoring required.
- Seizure risk: theoretically possible given electrical stimulation; exclude epilepsy history unless in supervised research context.
- DB adverse_events table: zero entries for any tACS device. Insufficient signal — absence of data does not confirm safety; refer to PMID: 30214966.

---

## MODALITY: PBM (MOD-012) — Transcranial Photobiomodulation

### Evidence Summary

The DB `indications` table has 3 PBM rows (IDs 27–29), all Grade C–D, all marked investigational. Key evidence nodes:

- **Mechanism**: NIR light (600–1100 nm) absorbed by cytochrome c oxidase in mitochondria; downstream effects include increased ATP, reduced oxidative stress, anti-inflammation, neurogenesis upregulation. (PMID: 22045511, PMID: 32503238)
- **Transcranial delivery**: transcranial and intranasal routes proven feasible; NIR penetrates 2–3 cm into cortex. (PMID: 27752476, PMID: 31812948)
- **FDA status**: Class II LLLT devices are FDA-cleared for musculoskeletal pain (510k pathway) but NOT for any transcranial/neuropsychiatric indication. NCT04784416 (TRAP-AD) is Phase 2 active — no PMA exists for tPBM brain use. DB devices table: no tPBM-specific 510k/PMA entries found.
- **Key AE signal**: DB adverse_events table has no tPBM entries. Published literature: no serious AEs reported in transcranial PBM trials. Theoretical risk: thermal injury if irradiance >300 mW/cm² prolonged; retinal injury if applied near eyes without protection.

### Top Indications by Evidence Weight

| Rank | Condition | ICD-10 | DB Indication ID | Evidence Grade |
|------|-----------|--------|-----------------|---------------|
| 1 | Major Depressive Disorder | F33 | 28 (pbm_depression) | C |
| 2 | Traumatic Brain Injury (chronic) | S09.90 / S06 | 27 (pbm_tbi) | C |
| 3 | Alzheimer's Disease / MCI | G30 / F06.7 | 29 (pbm_cognition_alzheimer) | D — upgradeable if NCT04784416 reports positive |
| 4 | Anxiety Disorders | F41 | DB gap — not in indications table | — |
| 5 | Parkinson's Disease (motor/non-motor) | G20 | DB gap — not in indications table | — |

---

### PBM Protocol Candidate Rows

| Field | PRO-PBM-001 | PRO-PBM-002 | PRO-PBM-003 | PRO-PBM-004 |
|-------|------------|------------|------------|------------|
| **Protocol_ID** | PRO-PBM-001 | PRO-PBM-002 | PRO-PBM-003 | PRO-PBM-004 |
| **Protocol_Name** | tPBM 823 nm Bilateral DLPFC for MDD (ELATED-2 Protocol) | tPBM 808 nm Forehead for Chronic TBI Cognitive Rehabilitation | tPBM 810 nm + Intranasal for Alzheimer's / MCI (TRAP-AD Protocol) | tPBM 1064 nm Right Forehead for Anxiety Disorders |
| **Condition_ID** | CON-MDD (F33) | CON-TBI (S09.90) | CON-AD (G30) / CON-MCI (F06.7) | CON-ANX (F41) |
| **Phenotype_ID** | PHE-MDD-unipolar | PHE-chronic-TBI | PHE-mild-to-moderate-AD | PHE-generalised-anxiety |
| **Modality_ID** | MOD-012 | MOD-012 | MOD-012 | MOD-012 |
| **Device_ID_if_specific** | LightForce EXPi tPBM-2.0 (NCT05573074) | tPBM-2.0 (808 nm; NCT06956404) | tPBM-2.0 (NCT04784416); Vielight 810 + 655 intranasal (NCT04018092) | Not device-specific (NCT07133893 uses 1064 nm NIR laser) |
| **On_Label_vs_Off_Label** | Off-label (investigational for MDD; Class II 510k cleared for MSK pain only) | Off-label (investigational for TBI) | Off-label (investigational; Phase 2 trial NCT04784416 active) | Off-label (investigational) |
| **Evidence_Grade** | EV-C | EV-C | EV-D (upgradeable on NCT04784416 readout) | EV-D |
| **Evidence_Summary** | ELATED-2 pilot RCT (N=21, double-blind sham-controlled, effect size d=0.90–1.5; PMID 30346890); 2016 narrative review (PMID 26989758); Phase 2 NCT05573074 recruiting N=120. No powered confirmatory RCT published. | NIH-funded review (PMID 29131369) covers TBI/stroke; NCT06956404 recruiting N=70 (808 nm, 18 sessions); 2016 LED review (PMID 28001756). No large RCT completed. | Phase 2 RCT NCT04784416 (N=196, 300 mW/cm2, 11 min); open-label case series PMID 28186867 (N=5, MMSE improvement p<0.003); Revitalize Phase 2 NCT04018092 (N=168, 870 nm). Larger trials ongoing. | NCT07133893 (N=280, not yet recruiting, 1064 nm, 8 min); pilot PMID 19995444 (N=10, HAM-D remission in 6/10 at 2 wks). Weakest evidence tier. |
| **Target_Region** | Bilateral DLPFC (forehead, F3 and F4) | Bilateral frontal cortex (forehead, ~F3/F4/Fz) | Bilateral frontal + parietal + temporal (transcranial); nasal mucosa (intranasal) | Right prefrontal cortex (right forehead, F4) |
| **Laterality** | Bilateral | Bilateral | Bilateral | Right |
| **Frequency_Hz** | N/A — continuous wave (CW) | N/A — continuous wave (CW) 808 nm | 10 Hz pulsed (PMID 28186867 protocol: 810 nm, 10 Hz pulsed) | N/A — continuous wave |
| **Intensity** | 36.2 mW/cm² (ELATED-2 protocol per PMID 30346890); NCT05573074 uses 291.7 mW/cm² (different device) | ~300 mW/cm² continuous (NCT06956404 references tPBM-2.0 standard) | 300 mW/cm² (NCT04784416 interventions_json: "average irradiance = 300 mW/cm2"); 22.2 mW/cm² (NCT04018092, 870 nm LED) | Not stated in NCT07133893 interventions_json — DB gap |
| **Session_Duration** | 20–30 min (ELATED-2: "20-30 min/session") | ~12 min (NCT06956404: "~12 minutes per day") | ~11 min transcranial (NCT04784416: "666 seconds"); 40 min total for NCT04018092 (2 × 20 min array configurations) | 8 min (NCT07133893 interventions_json) |
| **Sessions_per_Week** | 2 (ELATED-2: "twice a week") | 3 (NCT06956404: "3 days per week") | 5 (NCT04784416: implied by 40-session 8-week design) | Not stated — DB gap |
| **Total_Course** | 16 sessions over 8 weeks (ELATED-2) | 18 sessions over 6 weeks (NCT06956404) | 40 sessions over 8 weeks (NCT04784416) | Not stated — DB gap |
| **Coil_or_Electrode_Placement** | Bilateral DLPFC simultaneous; probe dimensions 28.7 × 2 cm² (ELATED-2) | Forehead (F3/F4/Fz scalp surface) via flexible optical fiber + custom cap (NCT06956404) | Transcranial: 12-site scalp array (10-20 system guided, NCT04018092); Intranasal: nostril-inserted LED probe (Vielight 655 red) | Right forehead (F4 / right prefrontal) with handheld NIR device |
| **Monitoring_Requirements** | HAM-D17 baseline + biweekly; skin temperature check; eye protection for operators | MoCA/neuropsychological testing pre/post; scalp temperature; skin inspection | MMSE + ADAS-cog at 0/4/8/12 wks; caregiver-reported behavioural log; skin check | GAD-7 / HAM-A baseline + post; no EEG required |
| **Contraindication_Check_Required** | Yes — photosensitising medications (amiodarone, tetracyclines, retinoids); active malignancy at treatment site; implanted light-sensitive devices; pregnancy | Yes — same photosensitiser review; exclude open scalp wounds; check for light-sensitive implants | Yes — same as PRO-PBM-001/002; cognitive capacity for consent (caregiver co-consent for moderate AD) | Yes — photosensitiser review; exclude use of photosensitising SSRIs/MAOIs if contraindicated |
| **Adverse_Event_Monitoring** | Skin warmth/erythema at probe site; report any burns or visual symptoms immediately; DB AE table: no PBM entries (absence-of-evidence caveat applies) | Scalp warmth log; headache diary; no serious AEs in published tPBM trials | Scalp warmth; sunburn-like erythema; report cognitive worsening (potential nocebo or deterioration) | Scalp warmth; mild headache; eye protection mandatory if device near orbital region |
| **Escalation_or_Adjustment_Rules** | If <25% HAM-D improvement at 8 sessions: clinician review; do not increase irradiance without protocol amendment | If cognitive performance declines from baseline at mid-point: pause and refer; TBI patients may show paradoxical response initially | If MMSE declines >3 pts from baseline at 4 wks: clinician review; do not combine with active photosensitisers | If anxiety scores worsen at 2 wks: stop and review; limited evidence base warrants conservative threshold |
| **Patient_Facing_Allowed** | No (ELATED-2 was clinic-based); some home devices exist but not validated for this protocol | No — clinic/supervised only | Limited: intranasal component (Vielight type) may be home-based but only as adjunct under supervision | No — not yet validated for self-administration |
| **Clinician_Review_Required** | Yes | Yes | Yes | Yes |
| **Source_URL_Primary** | https://pubmed.ncbi.nlm.nih.gov/30346890/ | https://clinicaltrials.gov/study/NCT06956404 | https://clinicaltrials.gov/study/NCT04784416 | https://clinicaltrials.gov/study/NCT07133893 |
| **Source_URL_Secondary** | https://clinicaltrials.gov/study/NCT05573074 | https://pubmed.ncbi.nlm.nih.gov/29131369/ | https://pubmed.ncbi.nlm.nih.gov/28186867/ | https://pubmed.ncbi.nlm.nih.gov/19995444/ |
| **Notes** | ELATED-2 (PMID 30346890): 823 nm, CW, 36.2 mW/cm², bilateral DLPFC, 2x/wk, 8 wks — this is verbatim from the published trial. NCT05573074 uses different device (tPBM-2.0, 291.7 mW/cm²) — parameters are NOT interchangeable; flag for clinician before populating protocols.csv intensity column. | 808 nm, CW, ~300 mW/cm², ~12 min, 3x/wk, 18 sessions per NCT06956404 interventions_json. Trial recruiting 2024–2026; parameters are trial-arm values only. | NCT04784416 (TRAP-AD, Phase 2, N=196): 300 mW/cm², 666 s (~11 min), CW — largest brain PBM RCT in DB. NCT04018092 (870 nm LED, 22.2 mW/cm²) uses different wavelength/irradiance — treat as separate protocol if needed. | Evidence grade D — weakest in this set. NCT07133893 not yet recruiting. PMID 19995444 is a 2009 pilot (N=10). DB gap on intensity and session count: external fetch (ClinicalTrials.gov full record) recommended before populating protocols.csv. |
| **Review_Status** | Draft — pending clinician sign-off | Draft — pending clinician sign-off | Draft — pending clinician sign-off | Draft — incomplete parameters; external fetch required |

---

### PBM Safety Flags

- Photosensitising drugs (amiodarone, porphyrins, tetracyclines, retinoids, some antipsychotics): contraindicated or require dose-adjusted irradiance — check medications before each course. (PMID: 22045511, DOI: 10.1007/s10439-011-0454-7)
- Thermal injury: theoretical risk if irradiance >300 mW/cm² sustained contact; TRAP-AD uses 300 mW/cm² as upper bound.
- Eye/retinal safety: never direct beam toward orbit; operator eye protection required for laser-class devices.
- Active malignancy at treatment site: contraindicated (PBM may stimulate cellular proliferation).
- DB adverse_events table: zero PBM-specific entries. Published literature reports no serious AEs in transcranial PBM trials. However, all trials to date are small-to-medium sample size — absence of AE data is not confirmed safety.
- Pediatric AE monitoring: PMID 38761518 (systematic review) provides the reference framework for neuromodulation AE reporting in pediatric studies — apply if age <18.

---

## DB Gap Summary — Needs External Fetch

| Gap | Modality | Indication | What is Missing | Recommended Source |
|-----|----------|-----------|----------------|-------------------|
| tACS indications absent from `indications` table | tACS | All | No tACS rows in indications table — no evidence_grade, regulatory, or notes assigned | Add rows manually or via ingest.py after external search |
| tACS MCI protocol parameters (NCT04545294) | tACS | MCI | Intensity, session duration, sessions/wk not in interventions_json | Fetch full NCT04545294 record from ClinicalTrials.gov API |
| tACS schizophrenia — negative symptoms arm (NCT04545294) | tACS | Schizophrenia neg. symptoms | Same record — partial parameter set | Fetch NCT04545294 |
| tACS sleep / insomnia | tACS | Insomnia / sleep disorders (F51) | Zero papers or trials for tACS × sleep in DB (FTS match returned empty) | Apify/WebSearch: PubMed "tACS sleep" |
| tACS Parkinson / tremor | tACS | Parkinson's disease (G20) | One DB hit (PMID 38002552, TBI review only); no tACS Parkinson RCT in DB | Apify/WebSearch: PubMed "tACS Parkinson beta oscillations" |
| PBM intensity for anxiety trial | PBM | Anxiety (F41) | NCT07133893 interventions_json omits irradiance (mW/cm²) | Fetch NCT07133893 full record; also PMID 19995444 has forehead NIR but no irradiance stated |
| PBM Parkinson's disease | PBM | Parkinson's (G20) | NCT06036433 is in DB (Symbyx 904 nm, motor/non-motor) but not in indications table | Add PBM/Parkinson indication row; fetch NCT06036433 full parameters |
| PBM depression — powered RCT | PBM | MDD (F33) | ELATED-2 is the best DB hit but N=21 only; Phase 2 NCT05573074 (N=120) ongoing; no results yet | Monitor NCT05573074 results posting; external PubMed search for ELATED-3 |
| FDA 510k for tPBM brain use | PBM | All transcranial | DB devices table has no tPBM 510k for brain indication; MSK-cleared devices are not labelled for transcranial use | FDA 510k search: product code IYO / GZE; or FDA CDRH database |
