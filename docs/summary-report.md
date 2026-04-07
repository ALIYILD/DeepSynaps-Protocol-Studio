# DeepSynaps Studio — Master Clinical Database: Summary Report

**Version:** 1.0  
**Generated:** 2026-04-07  
**Author:** Automated build pipeline with human-grade evidence review  

---

## Executive Summary

The DeepSynaps Studio Master Clinical Database is a 201-record, 9-table clinical knowledge base for neuromodulation therapies. It covers 12 modalities, 19 regulatory-verified devices, 20 clinical conditions, 30 symptom/phenotype profiles, 42 validated assessments, 32 treatment protocols, and 30 primary sources — all with evidence grading, source traceability, and review status tracking.

---

## Database Statistics

| Table | Records | Coverage |
|-------|---------|----------|
| Evidence_Levels | 4 | Complete (EV-A through EV-D) |
| Governance_Rules | 12 | Complete (12 core rules) |
| Modalities | 12 | rTMS, iTBS, tDCS, tACS, CES, taVNS, VNS, DBS, TPS, Neurofeedback, HRV Biofeedback, PBM |
| Devices | 19 | TMS (6), tDCS (1), CES (2), VNS (2), DBS (3), NF (1), taVNS (1), TPS (1), PBM (1), sTMS (1) |
| Conditions | 20 | Mood (4), Pain (4), Movement (3), Cognitive (3), Anxiety (2), Epilepsy (1), Addiction (1), OCD (1), Other (1) |
| Symptoms_Phenotypes | 30 | Cognitive (8), Affective (6), Motor (5), Pain (4), Autonomic (3), Sleep (2), Sensory (2) |
| Assessments | 42 | Self-report (15), Clinician-rated (12), Performance (7), Biomarker (5), Composite (3) |
| Protocols | 32 | TMS/iTBS (14), tDCS (5), CES (3), VNS (3), DBS (3), NF (1), taVNS (1), TPS (1), PBM (1) |
| Sources | 30 | Guidelines (8), Meta-analyses (7), Regulatory (6), RCTs (5), Reviews (4) |
| **TOTAL** | **201** | |

---

## Evidence Distribution

### Protocol Evidence Grades

| Grade | Count | Percentage |
|-------|-------|------------|
| EV-A (Guideline-supported) | 12 | 37.5% |
| EV-B (Literature-supported) | 10 | 31.3% |
| EV-C (Emerging) | 7 | 21.9% |
| EV-D (Experimental) | 3 | 9.4% |

### On-Label vs Off-Label Protocols

| Status | Count |
|--------|-------|
| On-label | 14 |
| Off-label | 15 |
| N/A | 3 |

---

## Device Regulatory Coverage

### By Regulatory Pathway

| Pathway | Count | Examples |
|---------|-------|----------|
| FDA 510(k) cleared | 10 | NeuroStar, BrainsWay, MagVenture, Alpha-Stim |
| FDA PMA approved | 2 | Flow FL-100 (tDCS, Dec 2025), Medtronic DBS |
| FDA De Novo cleared | 2 | gammaCore (VNS), SpringTMS (sTMS) |
| CE-marked (EU) | 3 | Neuroelectrics Starstim, Neurosity Crown |
| FDA HDE approved | 2 | NeuroPace RNS, Abbott St. Jude DBS |

### By Modality

| Modality | Devices |
|----------|---------|
| TMS/iTBS | NeuroStar, BrainsWay H-coil, MagVenture, Nexstim, Apollo TMS, CloudTMS |
| tDCS | Flow FL-100 |
| CES | Alpha-Stim AID, Fisher Wallace Stimulator |
| VNS | gammaCore (noninvasive), LivaNova VNS Therapy |
| DBS | Medtronic Percept PC, Abbott Infinity, NeuroPace RNS |
| Neurofeedback | Neurosity Crown |
| taVNS | Parasym |
| TPS | Neurolith TPS |
| PBM | Vielight Neuro Gamma |
| sTMS | SpringTMS (eNeura) |

---

## Key Regulatory Findings

1. **Flow FL-100 is the only PMA-approved tDCS device** (FDA, December 2025) — for treatment-resistant MDD. All other tDCS devices are either CE-marked only or not cleared for clinical use in the US.

2. **BrainsWay Deep TMS is FDA-cleared for 3 indications**: MDD (2013), OCD (2018), and smoking cessation (2020) — the broadest cleared indication set of any TMS device.

3. **gammaCore is FDA-cleared for both migraine and cluster headache** — acute treatment and prevention. It was the first non-invasive VNS device cleared via the De Novo pathway.

4. **NeuroPace RNS holds an HDE approval** for medically refractory focal epilepsy — not standard PMA, which limits the per-year implant volume.

5. **Device listing ≠ approval**: Several devices (Neurosity Crown, Parasym, Vielight) are listed/registered with FDA but not cleared for therapeutic claims. Their regulatory status is accurately recorded as CE-marked or "not FDA-cleared for clinical use."

---

## Evidence Highlights

### Strong Evidence (EV-A: Guideline-supported)

- **rTMS for MDD**: Left DLPFC high-frequency rTMS — endorsed by APA, CANMAT, NICE, VA/DoD
- **iTBS for MDD**: FDA-cleared accelerated protocol (Stanford SAINT variant) — 5 days vs 6 weeks
- **Deep TMS for OCD**: BrainsWay H7 coil targeting mPFC/ACC — FDA-cleared 2018
- **VNS for epilepsy**: LivaNova VNS — 25+ years of evidence, guideline-endorsed
- **DBS for Parkinson's**: STN and GPi targets — level 1 evidence, AAN guideline

### Important Caveats

- **Neurofeedback for ADHD**: Graded EV-D (Experimental) based on Cortese et al. 2024 meta-analysis showing no meaningful benefit under blinded conditions. Unblinded trials show effect, but this fails the "probably blinded" criterion.
- **tDCS for most conditions**: Evidence remains EV-B to EV-C. The Flow FL-100 PMA approval is specifically for treatment-resistant MDD, not a general tDCS endorsement.
- **TPS (Transcranial Pulse Stimulation)**: Emerging evidence only (EV-C). Single RCT (Beisteiner 2020) for Alzheimer's — replication needed.
- **PBM (Photobiomodulation)**: Experimental (EV-D) for all neurological indications. No FDA clearance for brain conditions.

---

## QA Results

| Check | Result |
|-------|--------|
| Review status completeness | PASS — all 143 data rows have Review_Status |
| Regulatory terminology accuracy | PASS — 510(k)="cleared", PMA="approved" throughout |
| Evidence grade validity | PASS — all protocols use EV-A through EV-D codes |
| Neurofeedback evidence guard | PASS — ADHD protocols graded EV-D (not inflated) |
| Duplicate ID/name checks | PASS — no duplicates in any table |
| Referential integrity | PASS — all protocol references resolve to valid IDs |
| Source URL traceability | 8 assessments lack URLs (public domain tools — documented) |
| Marketing claim filter | PASS — no marketing language in regulatory fields |

---

## Deliverables

| File | Description |
|------|-------------|
| `DeepSynaps_Studio_Clinical_Database.xlsx` | Master workbook (10 sheets, 201 records) |
| `csv/Evidence_Levels.csv` | Evidence grading hierarchy |
| `csv/Governance_Rules.csv` | Data governance rules |
| `csv/Modalities.csv` | Neuromodulation modality reference |
| `csv/devices.csv` | Devices with regulatory details |
| `csv/conditions.csv` | Clinical conditions |
| `csv/phenotypes.csv` | Symptom/phenotype profiles |
| `csv/assessments.csv` | Assessment tools and scales |
| `csv/protocols.csv` | Treatment protocols |
| `csv/sources.csv` | Source references |
| `DATA_DICTIONARY.md` | Full field-level documentation |
| `SUMMARY_REPORT.md` | This report |

---

## Limitations and Next Steps

### Known Limitations

- **19 devices** covers major FDA-cleared/CE-marked neuromodulation devices but does not include every registered device globally.
- **32 protocols** cover the most evidence-supported condition-modality pairs. Additional off-label combinations exist but lack sufficient evidence for inclusion.
- **Source URLs** were verified at time of generation (April 2026) — links may change over time.
- **Public domain assessments** (VAS, NRS, TMT, CGI) lack URLs because no single authoritative source exists.

### Recommended Next Steps

1. **Periodic source URL verification** — Re-check all URLs quarterly.
2. **Expand device coverage** — Add emerging devices as they receive regulatory clearance.
3. **Add pediatric protocols** — Current focus is adult populations; pediatric evidence is limited.
4. **Clinical review** — All "to verify" rows should be reviewed by a licensed clinician.
5. **Integration testing** — Import into DeepSynaps Studio platform and verify field mapping.
6. **Living document** — Update evidence grades as new guidelines and meta-analyses publish.
