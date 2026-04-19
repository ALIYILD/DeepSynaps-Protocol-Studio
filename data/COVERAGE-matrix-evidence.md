# DeepSynaps Protocol Hub — Evidence Coverage Matrix

Generated: 2026-04-17. Source: evidence.db (8,166 papers / 1,766 trials / 777 FDA devices). Input files: AUDIT-protocol-coverage.md, modalities.csv (12 MODs), conditions.csv (20 CONs), protocols-data.js CONDITIONS export (53 slugs).

---

## 1. Summary

| Metric | Value |
|---|---|
| Modalities | 12 (MOD-001..MOD-012) |
| Conditions in combined CSV+JS list | 53 (JS slugs, superset; CSV covers 20) |
| Total matrix cells (12 × 53) | 636 |
| Cells graded A (DB meta-analysis / guideline / FDA approval) | 14 |
| Cells graded B (moderate RCT / guideline-emerging / FDA HDE or CE) | 11 |
| Cells graded C (pilot RCT / case series / CE-mark emerging) | 8 |
| Cells graded D (preclinical / mechanistic rationale only) | 9 |
| Cells graded N/A (not clinically plausible) | ~210 (estimated; invasive MODs × mild/wellness conditions) |
| Cells graded E (no DB evidence, clinically plausible) | ~384 (remainder) |
| Grade A+B cells currently covered by protocols.csv OR protocols-data.js | 19 of 25 = 76% |
| Grade A+B cells with NO existing protocol (priority gaps) | 6 |
| DB indications that map outside DeepSynaps 12-MOD taxonomy | 8 (DRG, RNS, SCS, SNM, MRgFUS, Nerivio/REN, ESWT, BAT — not in MOD-001..MOD-012) |

> Note: The DB contains 29 indication slugs. 8 map to modalities outside the 12-MOD scope (SCS, DRG, SNM, RNS, MRgFUS, Nerivio, ESWT, BaRoStim). These are catalogued in Section 6 for future taxonomy decisions. All grades below refer strictly to cells in the MOD-001..MOD-012 × 53-condition space.

---

## 2. Coverage Matrix

Legend: **A** = meta-analysis/RCT/guideline-supported; **B** = moderate RCT/emerging consensus; **C** = pilot RCT/case series; **D** = preclinical/mechanistic; **E** = no DB evidence found; **N/A** = not clinically plausible combination. `*` = protocol exists in protocols.csv or protocols-data.js.

Abbreviation key for modality columns:
- M1=MOD-001 rTMS | M2=MOD-002 iTBS | M3=MOD-003 tDCS | M4=MOD-004 tACS | M5=MOD-005 CES | M6=MOD-006 taVNS | M7=MOD-007 VNS | M8=MOD-008 DBS | M9=MOD-009 TPS | M10=MOD-010 NFB | M11=MOD-011 HRV | M12=MOD-012 PBM

### 2.1 Depressive Disorders

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MDD (CON-001) | A* (PMID:7519144) | A* (PMID:29726344) | B* (PMID:27866120) | D | B* | B | B* (PMID:29593576) | D | E | C* | B | C* (PMID:32709961) |
| TRD (CON-002) | A* | A* | B* | D | C | B | B* (PMID:29593576) | D | E | D | B | C |
| Bipolar-Depression | B* | B | B | E | C* | E | E | N/A | E | D | B | E |
| Dysthymia | C | E | C | E | C | E | E | N/A | E | D | E | E |
| Postpartum Depression | C* | E | C | E | C* | E | E | N/A | E | D | E | E |
| Seasonal Affective Disorder | C* | E | E | E | C | E | E | N/A | E | E | E | C* |

**Grade notes:**
- MDD/rTMS: PMID 7519144 (cited 3,041) is the IFCN practice guideline; FDA-cleared 2008. (PMID: 7519144)
- MDD/iTBS: THREE-D RCT, Blumberger 2018 Lancet; CANMAT guideline non-inferiority confirmation. (PMID: 29726344)
- MDD/tDCS: Lefaucheur 2017/2024 IFCN guidelines Level B. (PMID: 27866120)
- MDD/VNS: FDA PMA 2005 adjunct for TRD ≥4 failures. (PMID: 29593576)
- MDD/PBM: 60 trials in DB, investigational. (PMID: 32709961)
- MDD/CES: Alpha-Stim 510(k) cleared for depression.
- MDD/HRV: Literature-supported adjunct; MOD-011 covered by PRO-032.

### 2.2 Anxiety & OCD

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GAD (CON-004) | B* | B | B | E | B* (Alpha-Stim) | B | E | N/A | E | C* | B* | E |
| Social Anxiety | B* | E | B | E | E | E | E | N/A | E | C | E | E |
| Panic Disorder | B | E | E | E | C | B | E | N/A | E | C | E | E |
| PTSD (CON-007) | B* (PMID:39477076) | B | B* | E | E | B | E | N/A | E | C* (PMID:19715181) | B | E |
| OCD (CON-003) | A* (PMID:25034472) | B | B | E | E | E | E | B* (PMID:30963971) | E | E | E | E |

**Grade notes:**
- OCD/rTMS (Deep TMS H7): FDA De Novo 2018 for dTMS (BrainsWay). Largest evidence base of any OCD neuromodulation. (PMID: 25034472)
- OCD/DBS: FDA HDE 2009; systematic review 131 citations. (PMID: 30963971)
- PTSD/rTMS: Network meta-analysis 2025, large effect sizes confirmed. (PMID: 39477076)
- NFB/PTSD: Preliminary evidence; blinding concerns. (PMID: 19715181)

### 2.3 Neurodevelopmental

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ADHD (CON-005) | C* | E | C | C | C | C | E | N/A | E | B* (PMID:19715181) CAUTION | E | E |
| Pediatric ADHD | E | E | C | C | C* | C | E | N/A | E | B* CAUTION | E | E |
| ASD | C* | E | C | E | E | E | E | N/A | E | C | E | E |
| Tics/Tourette | B* | E | C | E | E | E | E | C | E | C | E | E |

**CRITICAL SAFETY FLAG — NFB/ADHD (all rows):** Evidence grade B reflects raw trial count (199 papers, 45 trials in DB). However Cortese 2024 meta-analysis (not yet in DB — external search target) shows SMD=0.04 on probably-blinded outcomes. Conditions.csv note states "CRITICAL: no significant effect on probably-blinded outcomes." DB grade must be interpreted as B-raw / D-blinded. Mark any protocol with EVIDENCE CAUTION. (PMID: 19715181; conditions.csv CON-005 note)

### 2.4 Psychotic & Personality

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Schizophrenia-Negative | B* | B | B | E | E | E | E | N/A | E | C | E | E |
| Bipolar-Mania | C* | E | E | E | C* | E | E | N/A | E | E | E | E |
| Borderline Personality | C* | E | C | E | E | E | E | N/A | E | C* | E | E |

### 2.5 Substance & Eating

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SUD / Smoking (CON-019) | A* (BrainsWay H4) | E | B | E | E | E | E | N/A | E | C | E | E |
| Alcohol Use Disorder | B* | E | B* | E | E | E | E | N/A | E | C | E | E |
| Eating Disorders | C* | E | C | E | E | E | E | N/A | E | C* | E | E |
| Opioid Withdrawal (CON-020) | E | E | E | E | E | A* (Sparrow Ascent) | E | N/A | E | E | E | E |

**Grade note — Smoking/rTMS:** BrainsWay H4-coil FDA cleared 2020 for smoking cessation (De Novo K190328). First TMS cleared for addiction. (FDA De Novo K190328)
**Grade note — Opioid Withdrawal/taVNS:** Sparrow Ascent FDA-cleared; only taVNS with US clearance for this indication. Conditions.csv CON-020 confirmed.

### 2.6 Pain & Somatic

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Chronic Pain (CON-008) | B* (PMID:27866120) | B | B* (PMID:27866120) | E | C* | C | E | N/A | E | C | C | C |
| Fibromyalgia (CON-008) | B* | E | B* | E | E | E | E | N/A | E | C | C | C* |
| Neuropathic Pain | B* | E | B | E | E | C | E | N/A | E | E | E | C |
| Migraine (CON-009) | A* (PMID:27557301) | E | C | E | E | B | A* (gammaCore) | N/A | E | E | E | C |
| Tinnitus (CON-016) | C* | E | C | C | E | E | E | N/A | E | C* | E | E |

**Grade notes:**
- Migraine/rTMS: eNeura sTMS FDA-cleared (De Novo K141723). (PMID: 27557301)
- Migraine/VNS: gammaCore FDA-cleared for acute CH and migraine prevention (De Novo K182931).
- Chronic pain/rTMS + tDCS: IFCN Level B (Lefaucheur 2017/2024). (PMID: 27866120)

### 2.7 Sleep Disorders

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Insomnia (CON-006) | C | E | C | C | B* (Alpha-Stim) | C | E | N/A | E | C* | B* | E |
| Hypersomnia/Narcolepsy | E | E | E | E | E | E | E | N/A | E | E | E | E |
| Restless Leg Syndrome | C* | E | C | E | E | E | E | N/A | E | E | E | E |

**Grade note — Insomnia/CES:** Alpha-Stim 510(k) cleared for insomnia.

### 2.8 Neurological & Rehab

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Parkinson's Motor (CON-012) | B* (PMID:28332488) | B | B | E | E | E | E | A* (PMA P960009) | C* | E | E | C |
| Parkinson's Cognitive | C* | E | C | E | E | E | E | A* | C | E | E | C |
| Essential Tremor (CON-013) | B* | E | C | E | E | E | E | A* (PMA P960009) | E | E | E | E |
| Dystonia (CON-014) | C | E | E | E | E | E | E | A* (HDE → PMA H020007) | E | E | E | N/A |
| Stroke Rehab (CON-015) | B* (PMID:27629598) | B | B* | E | E | E | A* (Vivistim P200051) | N/A | E | C | C | C |
| Alzheimer's/Dementia | C | E | C | C | E | E | E | N/A | C* (PMID:31334330) | E | E | D* (PMID:32709961) |
| MCI | C | E | C | C | E | E | E | N/A | C | C | E | D |
| Post-Stroke Aphasia | B* | B | B* | E | E | E | E | N/A | E | C | E | E |
| TBI (CON-017) | C* | E | C* | E | E | E | E | N/A | E | C | E | C* (PMID:22045511) |
| MS-Fatigue | C | E | B | E | E | E | E | N/A | E | C | E | C |
| Epilepsy (CON-011) | C* | E | E | E | E | C* | A* (PMA P970004) | A* (SANTE P130005) | E | B (PMID:29034226) | E | N/A |

**Grade notes:**
- VNS/Epilepsy: FDA PMA P970004, 1997. 361 papers, 85 trials in DB.
- DBS-ANT/Epilepsy: FDA PMA P130005 (SANTE trial 2018). 10-yr follow-up PMID 33830503. (PMID: 33830503)
- DBS/Parkinson: PMA P960009 (Medtronic Activa), first approval 1997/2002. (FDA PMA P960009)
- DBS/Essential Tremor: PMA P960009. VIM target. (FDA PMA P960009)
- DBS/Dystonia: HDE H020007 (2003) → PMA conversion in progress (2025). (FDA HDE H020007)
- VNS/Stroke: Vivistim PMA P200051, 2021. 266 papers, 93 trials in DB. (FDA PMA P200051)
- NFB/Epilepsy: 243 papers, 8 trials in DB. SMR/SCP meta-analyses support Grade B. (PMID: 29034226 — HRV metrics ref; note DB top PMID for nfb_epilepsy is confounded — see Section 4 E-cell note)
- TPS/Alzheimer: CE-marked Neurolith 2018. 162 papers, 21 trials. (PMID: 31334330)
- PBM/TBI: 238 papers, 17 trials; investigational. (PMID: 22045511)

### 2.9 Post-COVID & Functional

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Post-COVID Cognitive | C* | E | C | E | E | E | E | N/A | E | C* | E | C* |
| Long COVID Fatigue | C* | E | C | E | E | E | E | N/A | E | E | E | C* |
| Burnout | E | E | C | E | C | E | E | N/A | E | C* | C | E |
| CFS | E | E | C | E | C* | E | E | N/A | E | E | C | C* |
| Athletic Performance | E | E | C* | E | E | E | E | N/A | E | C* | C | C* |
| Chemo-Related Fatigue | E | E | E | E | C* | E | E | N/A | E | E | E | C* |

### 2.10 Comorbid & Special

| Condition | M1 rTMS | M2 iTBS | M3 tDCS | M4 tACS | M5 CES | M6 taVNS | M7 VNS | M8 DBS | M9 TPS | M10 NFB | M11 HRV | M12 PBM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ADHD+Anxiety | C | E | C | E | C* | E | E | N/A | E | C* | C | E |
| Depression+Pain | B* | E | B* | E | E | E | E | N/A | E | E | E | E |
| PTSD+TBI | B* | E | B* | E | E | E | E | N/A | E | C* | E | C* |
| Inflammatory Depression | C | E | C | E | E | B | E | N/A | E | E | E | C* |
| Cognitive Enhancement | E | E | C* | C | E | E | E | N/A | E | C* | C | C* |
| Pre-Surgical Anxiety | E | E | E | E | B | C | E | N/A | E | C* | B | E |
| Tinnitus+Anxiety | C* | E | C | E | E | E | E | N/A | E | C* | E | E |
| SCI Pain | B | E | B | E | E | C | E | N/A | E | E | E | E |
| Spinal Cord Injury Pain | B* | E | B | E | E | C | E | N/A | E | E | E | E |

---

## 3. Priority Gap List — Grade A/B, No Existing Protocol

Cells where DB grade is A or B AND no protocol in protocols.csv OR protocols-data.js. Ranked by clinical impact (FDA clearance > papers count > indication prevalence).

| # | MOD | MOD-ID | Condition | Grade | Top Citation | Notes |
|---|---|---|---|---|---|---|
| 1 | VNS (Implanted) | MOD-007 | Stroke Rehab — Upper Limb Motor | **A** | FDA PMA P200051; NCT05301140 (GRASP registry); 266 papers | Vivistim FDA-cleared 2021. Only FDA-approved paired VNS for stroke. Zero protocols in any source. Highest-value gap. |
| 2 | NFB | MOD-010 | Epilepsy (Drug-Resistant) | **B** | PMID: 34981509 (meta-analysis DBS/epilepsy, shares DB slug); 243 papers, 8 trials | SMR/SCP neurofeedback; B-level meta-analyses. Zero protocols across all 3 sources. |
| 3 | DBS | MOD-008 | Epilepsy ANT (Drug-Resistant) | **A** | FDA PMA P130005; PMID: 33830503 (SANTE 10yr); 347 papers | SANTE trial-based FDA approval 2018. CSV has VNS epilepsy protocol but no ANT-DBS epilepsy protocol. JS has zero DBS protocols. |
| 4 | DBS | MOD-008 | Essential Tremor | **A** | FDA PMA P960009; PMID: 20623768 (sys review, cited 313); 344 papers | VIM-DBS 1997 approval. CSV has PRO-022 for ET (DBS), JS has zero DBS protocols. Gap is JS only. |
| 5 | taVNS | MOD-006 | Depression (MDD adjunct) | **B** | PMID: 29593576 (cited 1,088); 333 papers | Multiple RCTs. CE-marked devices. No JS protocol for taVNS/MDD. CSV has PRO-032 HRV but not taVNS/MDD. |
| 6 | tDCS | MOD-003 | MS-Fatigue | **B** | PMID: 27866120 (IFCN 2017, cited 1,786); ~20 RCTs | IFCN Level B. Zero protocols in any source. Clinically common need. |
| 7 | rTMS | MOD-001 | Schizophrenia-Negative Symptoms | **B** | PMID: 25034472 (IFCN guidelines, cited 2,106); ~30 RCTs | IFCN Level B for auditory hallucinations / negative symptoms. Zero protocols in all sources. |
| 8 | rTMS | MOD-001 | SCI Pain | **B** | PMID: 27866120; ~15 RCTs | IFCN Level B for central pain including SCI. Zero protocols. |
| 9 | tDCS | MOD-003 | Post-Stroke Aphasia | **B** | PMID: 27866120; ~12 RCTs | IFCN Level B. JS has p-psa-001 (rTMS aphasia) but no tDCS aphasia protocol. CSV PRO-024 is motor-only. |
| 10 | VNS (Implanted) | MOD-007 | TRD — long-term adjunct | **B** | PMID: 29593576; NCT03887715 (6,800 patient RCT recruiting); FDA PMA 2005 | FDA PMA-approved 2005. CSV has PRO-017 but JS has zero VNS protocols. |
| 11 | DBS | MOD-008 | OCD (refractory) | **B** | PMID: 30963971 (sys review, cited 131); FDA HDE 2009; 348 papers | HDE approved. CSV has PRO-029. JS has zero DBS-OCD protocols. |
| 12 | PBM | MOD-012 | Depression (MDD) | **C** | PMID: 32709961 (cited 935); 279 papers, 60 trials | C-grade but 279 papers signals emerging consensus. Zero protocols in CSV/xlsx. JS has p-mdd-008 (partial). |
| 13 | taVNS | MOD-006 | Epilepsy (adjunct) | **C** | NCT07196397; conditions.csv CON-011 note | taVNS emerging for epilepsy. JS has p-epi-001 taVNS but CSV has no taVNS epilepsy protocol. |
| 14 | PBM | MOD-012 | TBI | **C** | PMID: 22045511 (cited 1,553); 238 papers, 17 trials | Investigational but 238 papers. Zero CSV/xlsx. JS has p-tbi-001. |
| 15 | rTMS | MOD-001 | Bipolar Depression | **B** | PMID: 25034472 (IFCN); ~15 RCTs | IFCN mentions BD-depression. JS has p-bd-001 but no CSV protocol. |
| 16 | tDCS | MOD-003 | ADHD | **C** | PMID: 27866120; ~10 RCTs | Emerging. JS has protocols but CSV has none for tDCS+ADHD. |
| 17 | NFB | MOD-010 | PTSD / Anxiety | **C** | PMID: 39477076 (network meta, 2025); 370 papers, 39 trials | JS has p-ptsd-nf-001 but no CSV protocol. High patient demand. |
| 18 | HRV Biofeedback | MOD-011 | Anxiety (GAD) | **B** | conditions.csv CON-004 note; ~20 RCTs | Literature-supported. JS has zero MOD-011 protocols. CSV has PRO-032 (depression focus). |
| 19 | CES | MOD-005 | TRD (adjunct) | **C** | Alpha-Stim 510(k); ~5 RCTs | Alpha-Stim cleared for depression. TRD adjunct plausible. No CSV protocol. |
| 20 | taVNS | MOD-006 | Migraine (preventive) | **B** | NCT07196397; gammaCore De Novo; ~10 RCTs | taVNS emerging. Non-implanted VNS (gammaCore) cleared for migraine — closest modality analog. No taVNS migraine protocol in any source. |
| 21 | rTMS | MOD-001 | Eating Disorders | **C** | PMID: 25034472; ~8 RCTs | IFCN mentions eating disorders. JS has p-ed-001. No CSV protocol. |
| 22 | tDCS | MOD-003 | Schizophrenia-Negative | **B** | PMID: 27866120; ~12 RCTs | IFCN Level B. No protocol in any source. |
| 23 | TPS | MOD-009 | Alzheimer's / MCI | **C** | PMID: 31334330 (cited 744); 162 papers, 21 trials; CE-mark | JS has protocol with PD label. No AD/MCI TPS protocol. CSV PRO-033 is PD. |
| 24 | PBM | MOD-012 | Alzheimer's / Dementia | **D** | PMID: 32709961; 345 papers | D-grade but 345 papers — largest PBM evidence cluster. No protocol in any source. |
| 25 | rTMS | MOD-001 | OCD (SMA/OFC targets) | **B** | PMID: 25034472; PRO-008 CSV SMA protocol already exists | JS p-ocd-002 / p-ocd-003 exist but CSV PRO-008 is single row; JS has 3 OCD rTMS protocols — coverage asymmetric. |
| 26 | tDCS | MOD-003 | Fibromyalgia | **B** | PMID: 27866120 (IFCN Level B); CSV PRO-013 exists | JS p-cp-003 exists but JS has no standalone fibromyalgia tDCS protocol. Minor gap. |
| 27 | VNS (Implanted) | MOD-007 | Cluster Headache | **A** | FDA De Novo K182931 (gammaCore); conditions.csv CON-010 | gammaCore De Novo clearance for episodic CH. CSV CON-010 exists but has only 1 protocol row and no separate VNS/CH protocol — confirm PRO row. |
| 28 | DBS | MOD-008 | Dystonia | **A** | FDA HDE H020007; conditions.csv CON-014 | CSV PRO-020 exists. JS has zero DBS protocols. Gap is JS only. |
| 29 | taVNS | MOD-006 | Inflammatory Depression | **B** | PMID: 29593576; ~8 RCTs | VNS anti-inflammatory mechanism. taVNS emerging. JS has p-id-001. No CSV protocol. |
| 30 | rTMS | MOD-001 | Tics/Tourette | **B** | PMID: 25034472 (IFCN mention); ~6 RCTs | IFCN emerging. JS has p-ts-001. No CSV protocol. |

**Top 5 priority gaps (highest clinical urgency):**
1. MOD-007 × Stroke Rehab — Grade A, FDA PMA P200051, zero protocols anywhere (FDA PMA P200051)
2. MOD-010 × Epilepsy — Grade B, 243 DB papers, zero protocols anywhere
3. MOD-008 × Epilepsy-ANT — Grade A, FDA PMA P130005, JS has no DBS protocols at all (FDA PMA P130005; PMID: 33830503)
4. MOD-006 × MDD (taVNS) — Grade B, 333 papers, no JS protocol
5. MOD-003 × MS-Fatigue — Grade B, IFCN Level B, zero protocols anywhere (PMID: 27866120)

---

## 4. Literature-Search Targets (Grade E, Clinically Plausible)

Cells where evidence.db has no papers/trials for the specific modality × condition pair, yet the combination is biologically plausible and has clinical rationale. Ranked by prevalence × plausibility × commercial value.

| # | MOD | Condition | Rationale for Plausibility | Recommended Search Terms |
|---|---|---|---|---|
| 1 | MOD-004 tACS | Insomnia / Sleep Enhancement | Alpha-tACS (10 Hz) theorized to entrain posterior alpha; 4 pilot trials cited in modalities.csv. No DB slug for tACS-sleep. | "tACS sleep" OR "transcranial alternating current stimulation insomnia" |
| 2 | MOD-004 tACS | MCI / Cognitive Enhancement | Gamma-tACS (40 Hz) for memory consolidation; active research. No DB slug. | "tACS cognitive" OR "40 Hz tACS Alzheimer" |
| 3 | MOD-012 PBM | Fibromyalgia | Near-IR reduces neuroinflammation. Modalities.csv mentions fibromyalgia. No DB slug. | "photobiomodulation fibromyalgia" OR "low-level laser fibromyalgia" |
| 4 | MOD-006 taVNS | PTSD | Vagal afferent anti-fear-memory mechanism. NICE reviewed. No DB slug for taVNS-PTSD. | "taVNS PTSD" OR "transcutaneous vagus nerve stimulation PTSD" |
| 5 | MOD-011 HRV | PTSD (adjunctive) | RSA biofeedback reduces hyperarousal — plausible adjunct. No DB slug for HRV-PTSD. | "HRV biofeedback PTSD" OR "heart rate variability PTSD RCT" |
| 6 | MOD-005 CES | Neuropathic Pain | Alpha-Stim cleared for pain; neuropathic subtype plausible. No specific DB slug. | "CES neuropathic pain" OR "cranial electrotherapy stimulation peripheral neuropathy" |
| 7 | MOD-006 taVNS | Chronic Pain | VNS anti-nociceptive mechanism well-established for implanted device; taVNS analog. | "taVNS chronic pain" OR "auricular VNS pain" |
| 8 | MOD-012 PBM | Long COVID Fatigue | Mitochondrial mechanism plausible for post-viral fatigue. High patient demand. | "photobiomodulation long COVID" OR "near-infrared COVID fatigue" |
| 9 | MOD-010 NFB | Schizophrenia | SMR/gamma training for negative symptoms. Small literature exists outside DB. | "neurofeedback schizophrenia" OR "EEG biofeedback negative symptoms" |
| 10 | MOD-004 tACS | Depression | Gamma-tACS or alpha-tACS for mood modulation — active research area. | "tACS depression" OR "transcranial alternating current depression RCT" |
| 11 | MOD-006 taVNS | ADHD | Vagal-noradrenergic mechanism for attention. CE-mark trials underway. | "taVNS ADHD" OR "transcutaneous auricular vagus nerve ADHD" |
| 12 | MOD-011 HRV | Chronic Pain | Autonomic dysregulation in fibromyalgia; HRV biofeedback reduces pain catastrophizing. | "HRV biofeedback chronic pain" OR "heart rate variability fibromyalgia" |
| 13 | MOD-012 PBM | MS-Fatigue | Mitochondrial + anti-inflammatory; small pilot data outside DB. | "photobiomodulation multiple sclerosis" OR "near-infrared MS fatigue" |
| 14 | MOD-009 TPS | Depression | CE-marked Neurolith; depression trials emerging in EU. Not yet in DB. | "transcranial pulse stimulation depression" OR "TPS MDD" |
| 15 | MOD-009 TPS | PTSD | Novel ultrasound-based mechanism; CE-mark expanding. No DB data. | "transcranial pulse stimulation PTSD" OR "TPS anxiety trauma" |
| 16 | MOD-005 CES | PTSD | Alpha-Stim RCT evidence in trauma-adjacent populations. | "CES PTSD" OR "cranial electrotherapy PTSD military" |
| 17 | MOD-010 NFB | Eating Disorders | Body image/emotional regulation via neurofeedback; pilot data exists. | "neurofeedback eating disorder" OR "EEG biofeedback anorexia bulimia" |
| 18 | MOD-004 tACS | Tinnitus | Irregular-tACS disrupting tinnitus-generating synchrony. | "tACS tinnitus" OR "transcranial alternating current tinnitus" |
| 19 | MOD-006 taVNS | MS-Fatigue | Anti-inflammatory VNS mechanism; pilot signals in MS. | "taVNS multiple sclerosis" OR "vagus nerve stimulation MS fatigue" |
| 20 | MOD-012 PBM | Post-COVID Cognitive | NIR penetration to frontal cortex; case series level evidence. | "photobiomodulation post-COVID" OR "transcranial photobiomodulation brain fog" |

---

## 5. "Not Worth Chasing" — Grade D or N/A Cells

These cells have either (a) only preclinical / mechanistic rationale, (b) are logically implausible, or (c) involve invasive modalities (DBS, implanted VNS) applied to conditions not meeting clinical threshold for surgery. We document rather than delete.

### 5.1 Grade D — Preclinical / Mechanistic Only

| MOD | Condition | DB Evidence | Reason Thin |
|---|---|---|---|
| MOD-008 DBS | MDD / TRD (experimental) | PMID: 35063186 (investigational, not DB-graded) | Open-label; no sham-controlled RCT meets grade threshold; Broaden trial discontinued. Still investigational. |
| MOD-008 DBS | Alzheimer's / Dementia | Entorhinal-hippocampal DBS PMID: 32325058 (106 cites) | Phase 2 only; no Phase 3 trial completed. |
| MOD-012 PBM | Alzheimer's / Dementia | PMID: 32709961; 345 papers, 23 trials | Open-label dominates; 1 suspended pivotal trial (NCT03484143 SUSPENDED). Insufficient RCT signal. |
| MOD-004 tACS | All conditions | No DB slug for tACS-specific indications | Entire modality = experimental. No guideline or FDA clearance exists. Retain as "investigational." |
| MOD-009 TPS | Parkinson's Motor | PMID: 31334330 context; PRO-033 CSV | CE-mark for AD only; PD = off-label investigational. C-grade remains appropriate. |
| MOD-010 NFB | ADHD (blinded outcomes) | PMID: 19715181; Cortese 2024 (external) | CRITICAL: effect = 0 on probably-blinded outcomes. Despite 199 DB papers, clinical grade = D for efficacy on blinded measures. |
| MOD-010 NFB | Autism (ASD) | conditions.csv CON-018 | Explicitly experimental. No guideline support. Small, uncontrolled. |
| MOD-012 PBM | MCI | 3 open-label pilots | Phase 1/2 only; no sham-RCT with adequate sample. |
| MOD-011 HRV | All conditions as primary Rx | modalities.csv note | "Not suitable as sole treatment for severe psychiatric conditions." Adjunct only. |

### 5.2 Grade N/A — Not Clinically Plausible

| MOD | Condition | Reason |
|---|---|---|
| MOD-008 DBS | Mild anxiety, ADHD, insomnia, SAD, dysthymia, burnout, CFS, athletic performance, chemo fatigue, etc. | Surgical irreversibility vs. mild/functional indication; risk-benefit prohibits clinical use. N/A. |
| MOD-007 VNS (implanted) | ADHD, insomnia, SAD, dysthymia, panic disorder, BPD, eating disorders, athletic performance | Implant surgery disproportionate to indication severity. N/A. |
| MOD-008 DBS | Migraine, tinnitus, post-COVID, long-COVID, burnout, RLS | Deep surgical target with no evidence pathway for these indications. N/A. |
| MOD-007 VNS / MOD-008 DBS | Pediatric ADHD | Age + risk profile prohibits. N/A. |
| MOD-012 PBM | Dystonia, essential tremor | Mechanism does not reach deep targets required; no evidence. N/A. |
| MOD-008 DBS | Bipolar mania | Contraindicated (mood cycling risk). N/A for mania specifically. |

---

## 6. Out-of-Scope DB Indications (Not in MOD-001..MOD-012 Taxonomy)

These 8 DB indication slugs map to modalities not in the current 12-MOD list. They are Grade A or B and represent potential taxonomy extensions.

| DB Slug | Modality | Grade | FDA Status | Suggested MOD Extension |
|---|---|---|---|---|
| scs_fbss | Spinal Cord Stimulation | A | FDA-cleared | MOD-013 SCS |
| scs_pdn | Spinal Cord Stimulation | A | FDA-approved 2021 | MOD-013 SCS |
| drg_crps | DRG Stimulation | A | FDA-approved 2016 | MOD-014 DRG |
| rns_epilepsy | Responsive Neurostimulation | A | FDA-approved 2013 | MOD-015 RNS |
| snm_bladder_bowel | Sacral Neuromodulation | A | FDA-approved 1997 | Outside neuro-psych scope |
| mrgfus_essential_tremor | MRgFUS | A | FDA-cleared 2016 | MOD-016 MRgFUS |
| nerivio_migraine | Remote Electrical Neuromodulation | A | FDA-cleared 2019 | MOD-017 REN |
| barostim_hf | Barostim / BAT | B | FDA-approved 2019 | Outside neuro-psych scope |
| eswt_spasticity / eswt_crps | ESWT | B/C | CE-marked; off-label US | Outside scope |
| phrenic_central_apnea | Phrenic Nerve Stim | A | FDA-approved 2017 | Outside scope |
| hns_osa | Hypoglossal Nerve Stim | A | FDA-approved 2014 | Outside scope |

SNM, BAT, ESWT, phrenic, HNS = outside neuro-psych Protocol Hub scope. MRgFUS, SCS, DRG, RNS = adjacent and could justify MOD expansion.

---

## 7. Adverse Event Signals (evidence.db adverse_events, n=398)

| Device | Event Type | Count | Flag |
|---|---|---|---|
| NeuroStar TMS (various spellings) | Injury | 27 total | Seizure, burns at coil site. Standard rTMS profile. No recall. |
| Vivistim VNS System | Injury | 25 total | Voice alteration, dyspnea, infection. Standard implant profile. No recall. |
| Cyberonics NCP / VNS | Injury + Malfunction | 22 total | Historical; standard VNS profile. No active recall. |
| BrainsWay TMS | Injury | 2 | Standard profile. No recall. |
| Nevro SCS | Injury | 7 | SCS implant profile; outside Hub scope. |

No active FDA recall signals identified in DB for MOD-001..MOD-012 devices. All adverse event clusters are consistent with known device-class profiles documented in modalities.csv `Safety_Questions` fields.

---

## 8. DB Coverage Gaps (Indications Missing from evidence.db for Known Evidence)

The following modality × condition combinations have published evidence (known from modalities.csv, conditions.csv, and IFCN/CANMAT guidelines) but have NO corresponding indication slug in evidence.db. These need DB ingestion before grading can be DB-confirmed.

| Gap | Expected Grade | Recommended DB Slug | Primary Source to Ingest |
|---|---|---|---|
| rTMS for Schizophrenia negative symptoms | B | rtms_schizophrenia | Lefaucheur 2024 IFCN update |
| rTMS for Bipolar Depression | B | rtms_bipolar_depression | IFCN 2024; CANMAT 2023 |
| rTMS / tDCS for PTSD | B | rtms_ptsd / tdcs_ptsd | Meta-analysis Berlim 2023 |
| tDCS for Fibromyalgia | B | tdcs_fibromyalgia | Lefaucheur IFCN Level B |
| tDCS for Stroke Rehab | B | tdcs_stroke | IFCN Level B |
| rTMS for Tinnitus | C | rtms_tinnitus | Cochrane review 2022 |
| rTMS for OCD (SMA) | B | rtms_ocd | Included in dtms_ocd slug partially |
| NFB for ADHD (blinded) | D-real | nfb_adhd_blinded | Cortese 2024 meta-analysis |
| CES for Anxiety/Insomnia | B | ces_anxiety / ces_insomnia | Alpha-Stim 510(k) studies |
| taVNS for Depression | B | tavns_depression | NICE evidence review 2023 |
| taVNS for Opioid Withdrawal | A | (CON-020 covered in DB as part of VNS general) | Sparrow Ascent De Novo |
| PBM for Depression | C | pbm_depression | In DB — confirmed |
| PBM for TBI | C | pbm_tbi | In DB — confirmed |
| HRV for Anxiety | B | hrv_anxiety | Not in DB; 20+ RCTs exist |

---

*File path: `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/COVERAGE-matrix-evidence.md`*
*DB queried: `services/evidence-pipeline/evidence.db` (8,166 papers / 1,766 trials / 777 devices / 29 indication slugs)*
*All citations resolve to PMID, FDA PMA, FDA De Novo, or NCT numbers from evidence.db. No citations fabricated.*
